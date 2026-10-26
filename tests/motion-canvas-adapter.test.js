#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const PROJECT_ROOT = path.resolve(__dirname, '..');
const { MotionCanvasAdapter } = require('../utils/renderers/motion-canvas-adapter');
const { BACKEND_MODES } = require('../utils/renderers/backend-contract');
const { planScenes, buildStoryFactSheet } = require('../utils/visual-planner');
const { createTextMeasurer, layoutScene } = require('../utils/layout-engine');

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

(async () => {
  const measurer = await createTextMeasurer();
  const factSheet = buildStoryFactSheet({ segments, narrationManifest: manifest });
  const plan = planScenes({ segments, factSheet });
  assert.strictEqual(plan.ok, true);
  const layoutReports = [];
  for (const scene of plan.scenes) {
    layoutReports.push(await layoutScene(scene, { captionCues: [], measurer }));
  }
  const labelsByScene = new Map(segments.map(s => [s.sceneId, s.label]));

  // K. Valid contract maps to an engine plan.
  const adapter = new MotionCanvasAdapter({ mode: BACKEND_MODES.VALIDATE_ONLY });
  const validation = adapter.validateInput(plan.scenes, { layoutReports });
  assert.strictEqual(validation.ok, true, `adapter input must validate: ${JSON.stringify(validation.findings)}`);
  const built = adapter.buildEnginePlan(plan.scenes, { layoutReports, captionCues: [] });
  assert.strictEqual(built.scenes.length, 10);
  assert.ok(built.planSha256 && built.planSha256.length === 64);
  for (const scene of built.scenes) {
    assert.ok(scene.productionLabel === labelsByScene.get(scene.sceneId), 'labels ride as metadata');
    assert.ok(scene.audioRef, 'scenes keep narration references');
    const original = plan.scenes.find(s => s.sceneId === scene.sceneId);
    assert.strictEqual(scene.visualType, original.visual.type);
    assert.ok(scene.nodes.length > 0, 'every scene has visual geometry');
  }
  const ctaScene = built.scenes.find(s => s.visualType === 'cta_end_card');
  assert.ok(ctaScene.nodes.some(n => n.role === 'related_video_area'), 'end card keeps the related-video slot');

  // K. Deterministic: same inputs produce the same plan.
  const rebuilt = adapter.buildEnginePlan(plan.scenes, { layoutReports, captionCues: [] });
  assert.strictEqual(rebuilt.planSha256, built.planSha256);

  // K. Malformed payload fails with a specific diagnostic.
  const malformed = plan.scenes.map(scene => ({ ...scene }));
  delete malformed[2].visual;
  const bad = adapter.validateInput(malformed, { layoutReports });
  assert.strictEqual(bad.ok, false);
  assert.ok(bad.findings.some(f => f.code === 'ADAPTER_UNSUPPORTED_PAYLOAD'));
  assert.throws(() => adapter.buildEnginePlan(malformed, { layoutReports }), error => error.code === 'ADAPTER_INPUT_INVALID');

  // K. Missing CTA element fails with a specific diagnostic.
  const ctaBroken = plan.scenes.map(scene => ({ ...scene, visual: scene.visual ? { ...scene.visual, payload: { ...scene.visual.payload } } : scene.visual }));
  const ctaIndex = plan.scenes.findIndex(s => s.visual && s.visual.type === 'cta_end_card');
  ctaBroken[ctaIndex].visual.payload.requiredElements = ['subscribe', 'related_video_area'];
  ctaBroken[ctaIndex].visual.payload.elements = [{ role: 'subscribe', label: 'Subscribe' }];
  const ctaResult = adapter.validateInput(ctaBroken, { layoutReports });
  assert.ok(ctaResult.findings.some(f => f.code === 'ADAPTER_CTA_ELEMENT_MISSING'));

  // K. Disabled backend refuses; render is never authorized in B9.38.
  const disabled = new MotionCanvasAdapter();
  assert.strictEqual(disabled.mode, 'disabled');
  assert.throws(() => disabled.buildEnginePlan(plan.scenes, { layoutReports }), error => error.code === 'BACKEND_DISABLED');
  const renderMode = new MotionCanvasAdapter({ mode: BACKEND_MODES.RENDER, authorizationToken: 'AUTHORIZED_RENDER_PHASE' });
  await assert.rejects(() => renderMode.renderScene(), error => error.code === 'RENDER_NOT_AUTHORIZED');
  await assert.rejects(() => adapter.renderScene(), error => error.code === 'RENDER_NOT_AUTHORIZED');
  // Default env resolution: no MOTION_CANVAS_BACKEND in this run.
  delete process.env.MOTION_CANVAS_BACKEND;
  assert.strictEqual(new MotionCanvasAdapter().mode, 'disabled', 'production activation stays disabled by default');

  await measurer.close();
  console.log('ok');
})().catch(error => { console.error(error); process.exit(1); });
