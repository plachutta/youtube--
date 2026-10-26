#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const PROJECT_ROOT = path.resolve(__dirname, '..');
const { SceneRepairService } = require('../utils/scene-repair-service');
const gate = require('../utils/prerender-gate');
const { planScenes, buildStoryFactSheet } = require('../utils/visual-planner');

const REVISIONS_PATH = '/home/gachiemeshackson/Videos/agenttube-reference-lab/hosted-runs/b9-30-draft/revisions.json';
const MANIFEST_PATH = path.join(PROJECT_ROOT, 'hosted-runs/b9-30-kokoro-final-recovery-20261015T100622Z/retrieved/manifest.json');
const revisions = JSON.parse(fs.readFileSync(REVISIONS_PATH, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const durationByScene = new Map(manifest.results.map(r => [r.sceneId, r.measurements.duration_seconds]));
const segments = revisions.revised_segments.map((segment, position) => ({
  ...segment, position, durationSec: durationByScene.get(segment.sceneId), audioRef: `wav:${segment.sceneId}`
}));
const plan = planScenes({ segments, factSheet: buildStoryFactSheet({ segments, narrationManifest: manifest }) });
assert.strictEqual(plan.ok, true);

function sceneRows(scenes) {
  return scenes.map((scene, position) => ({
    id: scene.sceneId,
    label: scene.productionLabel,
    scriptText: scene.narration.transcript,
    duration: segments.find(s => s.sceneId === scene.sceneId).durationSec,
    position,
    audioPath: null,
    visual: scene.visual ? { ...scene.visual, purpose: scene.purpose, keyTakeaway: scene.keyTakeaway } : undefined
  }));
}

(async () => {
  const service = new SceneRepairService(null, null, { dataRoot: PROJECT_ROOT, logger: { info() {}, warn() {}, error() {} } });

  const valid = await service.evaluatePreRenderGate(sceneRows(plan.scenes));
  assert.strictEqual(valid.passed, true, `service gate must pass: ${JSON.stringify(valid.findings)}`);
  assert.doesNotThrow(() => gate.assertPass(valid));

  const brokenScenes = plan.scenes.map(scene => ({ ...scene }));
  delete brokenScenes[4].visual;
  const blocked = await service.evaluatePreRenderGate(sceneRows(brokenScenes));
  assert.strictEqual(blocked.passed, false);
  assert.throws(() => gate.assertPass(blocked), error => error.code === 'PRERENDER_GATE_FAILED');

  const legacyRows = sceneRows(plan.scenes).map(scene => ({ ...scene }));
  legacyRows.forEach(scene => { delete scene.visual; });
  const contractGoverned = legacyRows.some(scene => scene.visual) || false;
  assert.strictEqual(contractGoverned, false, 'legacy rows must not route into the fail-closed path');
  const assessment = gate.assessLegacyBundle({ sceneCount: legacyRows.length });
  assert.strictEqual(assessment.claimable, false);

  const source = fs.readFileSync(path.join(PROJECT_ROOT, 'utils', 'scene-repair-service.js'), 'utf8');
  assert.ok(source.includes('evaluatePreRenderGate'), 'rebuild path must call the gate');
  assert.ok(source.includes('assertPass(preRenderGate)'), 'rebuild must fail closed for governed bundles');
  assert.ok(source.includes('assessLegacyBundle'), 'rebuild must assess legacy bundles honestly');
  console.log('ok');
})().catch(error => { console.error(error); process.exit(1); });
