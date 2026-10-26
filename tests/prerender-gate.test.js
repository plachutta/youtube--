#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const PROJECT_ROOT = path.resolve(__dirname, '..');
const gate = require('../utils/prerender-gate');
const { planScenes, buildStoryFactSheet } = require('../utils/visual-planner');
const { segmentTranscriptToCues } = require('../utils/caption-contract');
const { createTextMeasurer } = require('../utils/layout-engine');
const { MotionCanvasAdapter } = require('../utils/renderers/motion-canvas-adapter');
const { BACKEND_MODES } = require('../utils/renderers/backend-contract');

const REVISIONS_PATH = '/home/gachiemeshackson/Videos/agenttube-reference-lab/hosted-runs/b9-30-draft/revisions.json';
const MANIFEST_PATH = path.join(PROJECT_ROOT, 'hosted-runs/b9-30-kokoro-final-recovery-20261015T100622Z/retrieved/manifest.json');
const revisions = JSON.parse(fs.readFileSync(REVISIONS_PATH, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const durationByScene = new Map(manifest.results.map(r => [r.sceneId, r.measurements.duration_seconds]));
let cursor = 0;
const segments = revisions.revised_segments.map(segment => {
  const durationSec = durationByScene.get(segment.sceneId);
  const enriched = { ...segment, startSec: cursor, durationSec, audioRef: `wav:${segment.sceneId}` };
  cursor += durationSec;
  return enriched;
});
const transcript = segments.map(s => s.text).join(' ');

function buildCues(list) {
  let cues = [];
  for (const segment of list) {
    cues = cues.concat(segmentTranscriptToCues({
      transcript: segment.text, startSec: segment.startSec, endSec: segment.startSec + segment.durationSec
    }));
  }
  return cues;
}

(async () => {
  const measurer = await createTextMeasurer();
  const factSheet = buildStoryFactSheet({ segments, narrationManifest: manifest });
  const plan = planScenes({ segments, factSheet });
  assert.strictEqual(plan.ok, true);
  const cues = buildCues(segments);
  const adapter = new MotionCanvasAdapter({ mode: BACKEND_MODES.VALIDATE_ONLY });

  // Full gate passes on the real qualification inputs.
  const report = await gate.evaluate({ scenes: plan.scenes, captionCues: cues, transcript, backend: adapter, measurer });
  assert.strictEqual(report.passed, true, `gate must pass: ${JSON.stringify(report.findings)}`);
  const expectedPre = ['CONTENT_VALIDATED', 'SCENE_PLAN_VALIDATED', 'VISUAL_PAYLOAD_VALIDATED', 'ASSET_PROVENANCE_VALIDATED', 'CAPTION_INTEGRITY_VALIDATED', 'LAYOUT_CONSTRAINTS_VALIDATED', 'ENGINE_INPUT_VALIDATED'];
  for (const status of expectedPre) assert.strictEqual(report.statuses[status], 'PASSED', status);
  // Post-render stages are NEVER marked passed here.
  assert.strictEqual(report.statuses.RENDER_EXECUTED, 'NOT_PERFORMED');
  assert.strictEqual(report.statuses.MEDIA_TECHNICALLY_VALIDATED, 'NOT_PERFORMED');
  assert.strictEqual(report.statuses.VISUAL_QUALITY_REVIEWED, 'NOT_PERFORMED');
  assert.strictEqual(report.statuses.HUMAN_ACCEPTED, 'NOT_ESTABLISHED');
  assert.doesNotThrow(() => gate.assertPass(report));

  // Fail-closed: a scene missing its visual payload blocks the gate with diagnostics.
  const broken = plan.scenes.map(scene => ({ ...scene }));
  delete broken[4].visual;
  const brokenReport = await gate.evaluate({ scenes: broken, captionCues: cues, transcript, backend: adapter, measurer });
  assert.strictEqual(brokenReport.passed, false, 'missing payload must block');
  const blocking = brokenReport.findings.find(f => f.severity === 'critical');
  assert.ok(blocking && blocking.sceneId === broken[4].sceneId, 'diagnostics must identify the failing scene');
  assert.throws(() => gate.assertPass(brokenReport), error => error.code === 'PRERENDER_GATE_FAILED');

  // Fail-closed: caption loss blocks the gate.
  const lostCues = cues.slice(0, -3);
  const lostReport = await gate.evaluate({ scenes: plan.scenes, captionCues: lostCues, transcript, backend: adapter, measurer });
  assert.strictEqual(lostReport.passed, false, 'caption loss must block');
  assert.ok(lostReport.findings.some(f => f.code === 'CAPTION_FINAL_WORDS_MISSING'));

  // No backend: engine input cannot be validated -> blocked, never silently passed.
  const noBackend = await gate.evaluate({ scenes: plan.scenes, captionCues: cues, transcript, backend: null, measurer });
  assert.strictEqual(noBackend.passed, false);
  assert.ok(noBackend.findings.some(f => f.code === 'ENGINE_BACKEND_MISSING'));

  // Legacy bundles: honest assessment, never a PASS claim.
  const legacy = gate.assessLegacyBundle({ sceneCount: 5 });
  assert.strictEqual(legacy.passed, false);
  assert.strictEqual(legacy.claimable, false);
  assert.strictEqual(legacy.statuses.VISUAL_PAYLOAD_VALIDATED, 'NOT_APPLICABLE_LEGACY');

  await measurer.close();
  console.log('ok');
})().catch(error => { console.error(error); process.exit(1); });
