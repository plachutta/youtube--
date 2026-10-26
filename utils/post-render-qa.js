const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const STATES = Object.freeze({ PASS: 'PASS', FAIL: 'FAIL', NOT_RUN: 'NOT_RUN', BLOCKED: 'BLOCKED', NOT_APPLICABLE: 'NOT_APPLICABLE' });

function sha256(p) {
  if (!fs.existsSync(p)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function exec(cmd, opts = {}) {
  try {
    const res = cp.execSync(cmd, { stdio: 'pipe', ...opts });
    return { ok: true, stdout: res.toString(), stderr: '' };
  } catch (e) {
    return { ok: false, stdout: (e.stdout || '').toString(), stderr: (e.stderr || '').toString(), code: e.status };
  }
}

class PostRenderQA {
  constructor() {
    this.STATES = STATES;
  }
  runFileIntegrity(videoPath) {
    const checks = [];
    if (!fs.existsSync(videoPath) || !fs.statSync(videoPath).isFile()) {
      checks.push({ name: 'file_exists', state: STATES.FAIL, evidence: { reason: 'missing_or_not_file' } });
      return { checks, overall: STATES.FAIL };
    }
    const s = fs.statSync(videoPath);
    if (s.size <= 0) {
      checks.push({ name: 'file_size_nonzero', state: STATES.FAIL, evidence: { size: s.size } });
      return { checks, overall: STATES.FAIL };
    }
    const h = sha256(videoPath);
    checks.push({ name: 'file_integrity', state: STATES.PASS, evidence: { sha256: h, size: s.size } });
    return { checks, overall: STATES.PASS };
  }
  runProbe(videoPath) {
    const checks = [];
    const res = exec(`ffprobe -v error -show_format -show_streams -of json "${videoPath}"`, { maxBuffer: 10*1024*1024 });
    if (!res.ok) {
      checks.push({ name: 'ffprobe', state: STATES.FAIL, evidence: { stderr: res.stderr.slice(0,200) } });
      return { checks, overall: STATES.FAIL };
    }
    checks.push({ name: 'ffprobe_metadata', state: STATES.PASS });
    return { checks, overall: STATES.PASS, data: res.stdout };
  }
  runDecodeCheck(videoPath) {
    const checks = [];
    const res = exec(`ffmpeg -v error -i "${videoPath}" -f null -`, { maxBuffer: 10*1024*1024 });
    if (!res.ok) {
      checks.push({ name: 'full_decode', state: STATES.FAIL, evidence: { stderr: res.stderr.slice(0,200) } });
      return { checks, overall: STATES.FAIL };
    }
    checks.push({ name: 'full_decode', state: STATES.PASS });
    return { checks, overall: STATES.PASS };
  }
  runAll(videoPath, opts={}) {
    const out = { created_at: new Date().toISOString(), candidate: videoPath, checks: [], overall: STATES.NOT_RUN };
    const f = this.runFileIntegrity(videoPath);
    out.checks.push({ category: 'file_integrity', ...f });
    if (f.overall === STATES.FAIL) {
      out.overall = STATES.FAIL;
      return out;
    }
    const p = this.runProbe(videoPath);
    out.checks.push({ category: 'probe', ...p });
    const d = this.runDecodeCheck(videoPath);
    out.checks.push({ category: 'decode', ...d });
    const bad = [p.overall, d.overall].some(x=>x===STATES.FAIL);
    out.overall = bad ? STATES.FAIL : STATES.PASS;
    return out;
  }
}
module.exports = { PostRenderQA, STATES };

class QAOrchestrator {
  constructor(qa) {
    this.qa = qa;
  }
  run(candidatePath, manifest={}) {
    const out = this.qa.runAll(candidatePath, manifest);
    out.gate = { human_accepted: false, production_render_authorized: false };
    out.full_video_rendered = false;
    return out;
  }
}

module.exports.QAOrchestrator = QAOrchestrator;
/**
 * REFERENCE-BASED VISUAL QUALITY EVALUATION (B9.44+ Phase H)
 * Appended additively to post-render-qa.js. Assesses visual strategy per
 * scene SEPARATELY from technical media validity. Never overrides hard
 * layout/factual/rights constraints; never implies technical PASS = good.
 */
const DIMENSIONS = Object.freeze(['semantic_relevance','explanatory_value','visual_grammar_fit','composition_readability','visual_variety','continuity','timing_motion','factual_fidelity','asset_provenance']);
function assessSceneQuality(scene, ctx) {
  ctx = ctx || {};
  const ev = [];
  const dim = {};
  const push = (d, verdict, evidence) => { dim[d] = { verdict, evidence }; ev.push(`${d}:${verdict}`); };
  const transcript = (scene.narration && scene.narration.transcript) || '';
  const payloadStr = JSON.stringify(scene.visual && scene.visual.payload || {});
  push('semantic_relevance', payloadStr.length > 20 ? 'adequate' : 'weak', { payloadChars: payloadStr.length });
  const fragOk = !(scene.invalid === true);
  push('factual_fidelity', fragOk ? 'adequate' : 'fail', { invalid: !!scene.invalid });
  const g = scene.grammar || {};
  push('visual_grammar_fit', (g.aligned && g.aligned.length > 0) ? 'adequate' : 'unassessed', { inferred: g.inferred || [], aligned: g.aligned || [] });
  const refs = (scene.visual && scene.visual.evidenceRefs) || [];
  push('asset_provenance', refs.length > 0 ? 'adequate' : 'weak', { evidenceRefs: refs.length });
  push('explanatory_value', scene.visual && scene.visual.type !== 'explanatory_card' ? 'adequate' : 'generic-risk', { type: scene.visual && scene.visual.type });
  push('composition_readability', (ctx.layoutOk === false) ? 'fail' : (ctx.layoutOk === true ? 'adequate' : 'unassessed'), {});
  push('visual_variety', ctx.sameTypeStreak >= 3 ? 'weak' : 'adequate', { streak: ctx.sameTypeStreak || 1 });
  push('continuity', 'unassessed', { reason: 'requires adjacent-scene context' });
  push('timing_motion', 'unobserved', { reason: 'static plan; motion only observable in rendered output' });
  const weak = Object.values(dim).filter(d => d.verdict === 'fail').length;
  return { sceneId: scene.sceneId, dimensions: dim, overall: weak > 0 ? 'needs-work' : 'adequate', evidenceTrail: ev };
}
function assessPlanQuality(scenes, ctx) {
  ctx = ctx || {};
  const perScene = scenes.map((s, i) => assessSceneQuality(s, { layoutOk: (ctx.layoutOkByScene || {})[s.sceneId], sameTypeStreak: i > 0 && scenes[i-1].visual.type === s.visual.type ? ((ctx._streak || 1) + 1) : 1 }));
  const types = new Set(scenes.map(s => s.visual.type));
  return { created: new Date().toISOString(), sceneCount: scenes.length, distinctVisualTypes: types.size, varietyVerdict: types.size >= 3 ? 'varied' : 'monotonous-risk', technicalSeparationNote: 'technical media validity (file/probe/decode) is assessed independently; a technical PASS never implies visual quality', perScene };
}
module.exports.Dimensions = DIMENSIONS;
module.exports.assessSceneQuality = assessSceneQuality;
module.exports.assessPlanQuality = assessPlanQuality;
