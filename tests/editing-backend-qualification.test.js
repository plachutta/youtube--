#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const TEST_PROJECT_DIR = path.join(os.tmpdir(), "agenttube-backend-test-" + Date.now());

const { BACKEND_MODES, resolveBackendMode } = require("../utils/renderers/backend-contract");
const { MotionCanvasAdapter, STYLE_TOKENS, ENGINE_PLAN_VERSION } = require("../utils/renderers/motion-canvas-adapter");
const { planScenes, buildStoryFactSheet } = require("../utils/visual-planner");
const { SUPPORTED_VISUAL_TYPES } = require("../utils/scene-contract");
async function testCompleteEnginePlanFlow() {
  console.log('\n=== Test: Complete engine plan flow ===');
  const { createTextMeasurer, layoutScene } = require("../utils/layout-engine");
  const { SUPPORTED_VISUAL_TYPES, validateSceneContract } = require("../utils/scene-contract");
  const adapter = new MotionCanvasAdapter({ mode: BACKEND_MODES.VALIDATE_ONLY });
  const segments = [
    { sceneId: "s1", label: "Introduction", startSec: 0, durationSec: 8 },
    { sceneId: "s2", label: "Process Overview", startSec: 8, durationSec: 12 },
    { sceneId: "s3", label: "Comparison", startSec: 20, durationSec: 10 },
    { sceneId: "s4", label: "Timeline", startSec: 30, durationSec: 10 },
    { sceneId: "s5", label: "CTA End Card", startSec: 40, durationSec: 6 },
  ];
  const factSheet = buildStoryFactSheet({ segments, narrationManifest: {} });
  const plan = planScenes({ segments, factSheet });
  assert.strictEqual(plan.ok, true);
  const measurer = await createTextMeasurer();
  const layoutReports = [];
  for (const scene of plan.scenes) {
    layoutReports.push(await layoutScene(scene, { captionCues: [], measurer }));
  }
  const validation = adapter.validateInput(plan.scenes, { layoutReports });
  assert.strictEqual(validation.ok, true, `Validation: ${JSON.stringify(validation.findings)}`);
  console.log('  PASS: validateInput succeeded');
  const built = adapter.buildEnginePlan(plan.scenes, { layoutReports, captionCues: [] });
  assert.strictEqual(built.scenes.length, plan.scenes.length);
  console.log('  PASS: Built engine plan with ' + built.scenes.length + ' scenes');
  assert.ok(built.planSha256 && built.planSha256.length === 64);
  console.log('  PASS: Engine plan has SHA256 hash');
  const labelsByScene = new Map(plan.scenes.map(s => [s.sceneId, s.productionLabel || s.label]));
  for (const scene of built.scenes) {
    const original = plan.scenes.find(s => s.sceneId === scene.sceneId);
    if (original) {
      assert.ok(scene.productionLabel === labelsByScene.get(scene.sceneId));
      assert.ok(scene.audioRef, 'scenes keep narration references');
      assert.strictEqual(scene.visualType, original.visual.type);
      assert.ok(scene.nodes.length > 0, 'every scene has visual geometry');
    }
  }
  console.log('  PASS: Scene metadata validates correctly');
  const ctaScene = built.scenes.find(s => s.visualType === 'cta_end_card');
  if (ctaScene) {
    assert.ok(ctaScene.nodes.some(n => n.role === 'related_video_area'), 'end card keeps related_video_slot');
    console.log('  PASS: CTA end card keeps related_video_slot');
  }
  const rebuilt = adapter.buildEnginePlan(plan.scenes, { layoutReports, captionCues: [] });
  assert.strictEqual(rebuilt.planSha256, built.planSha256);
  console.log('  PASS: Engine plan is deterministic');
  if (plan.scenes.length > 2) {
    const malformed = plan.scenes.map(s => ({ ...s }));
    delete malformed[2].visual;
    const bad = adapter.validateInput(malformed, { layoutReports });
    assert.strictEqual(bad.ok, false);
    assert.ok(bad.findings.some(f => f.code === 'ADAPTER_UNSUPPORTED_PAYLOAD'));
    try { adapter.buildEnginePlan(malformed, { layoutReports }); console.log('  FAIL: should throw'); } catch (error) { if (error.code === 'ADAPTER_INPUT_INVALID') console.log('  PASS: malformed throws ADAPTER_INPUT_INVALID'); }
  }
  const ctaIndex = plan.scenes.findIndex(s => s.visual && s.visual.type === 'cta_end_card');
  if (ctaIndex >= 0) {
    const ctaBroken = plan.scenes.map(s => ({ ...s, visual: s.visual ? { ...s.visual, payload: { ...s.visual.payload } } : s.visual }));
    ctaBroken[ctaIndex].visual.payload.requiredElements = ['subscribe', 'related_video_area'];
    ctaBroken[ctaIndex].visual.payload.elements = [{ role: 'subscribe', label: 'Subscribe' }];
    const ctaResult = adapter.validateInput(ctaBroken, { layoutReports });
    assert.ok(ctaResult.findings.some(f => f.code === 'ADAPTER_CTA_ELEMENT_MISSING'));
    console.log('  PASS: CTA element missing detection works');
  }
  console.log('  === All engine plan flow tests PASSED ===');
}
function testMotionCanvasValidateOnly() {
  console.log('\n=== Test: MotionCanvasAdapter validate_only ===');
  const adapter = new MotionCanvasAdapter({ mode: BACKEND_MODES.VALIDATE_ONLY });
  assert.strictEqual(adapter.mode, BACKEND_MODES.VALIDATE_ONLY);
  console.log('  PASS: MotionCanvasAdapter in validate_only mode');
}

function testBackendDisabled() {
  console.log('\n=== Test: Backend disabled behavior ===');
  const adapter = new MotionCanvasAdapter();
  assert.strictEqual(adapter.mode, 'disabled');
  console.log('  PASS: Default mode is disabled');
  try {
    adapter.buildEnginePlan([], { layoutReports: [] });
    console.log('  FAIL: Should have thrown');
  } catch (error) {
    if (error.code === 'BACKEND_DISABLED') {
      console.log('  PASS: buildEnginePlan throws BACKEND_DISABLED');
    }
  }
}

function testRenderRequiresAuthorization() {
  console.log('\n=== Test: Render requires authorization ===');
  const adapter = new MotionCanvasAdapter({ mode: BACKEND_MODES.RENDER });
  try { adapter.renderScene(); console.log('  FAIL: Should have thrown'); } catch (error) {
    if (error.code === 'RENDER_NOT_AUTHORIZED') {
      console.log('  PASS: renderScene() requires authorization token');
    }
  }
}
