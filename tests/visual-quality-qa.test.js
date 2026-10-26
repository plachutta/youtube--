#!/usr/bin/env node
const assert = require('assert');
const { assessSceneQuality, assessPlanQuality, Dimensions } = require('../utils/post-render-qa');
const { PostRenderQA } = require('../utils/post-render-qa');
assert.strictEqual(Dimensions.length, 9, '9 quality dimensions assessed separately from technical validity');
const scene = { sceneId: 's1', narration: { transcript: 'Someone picks the words they want, types them into a registrar.' }, visual: { type: 'process_diagram', payload: { steps: [{ id: 'a', label: 'x' }], edges: [] }, evidenceRefs: ['narration:s1'] }, grammar: { inferred: ['stepwise-process'], aligned: ['stepwise-process'] } };
const a = assessSceneQuality(scene, { layoutOk: true });
assert.strictEqual(a.sceneId, 's1');
assert.strictEqual(Object.keys(a.dimensions).length, 9);
assert.ok(a.dimensions.timing_motion.verdict === 'unobserved', 'motion honestly unobserved in static plan');
const bad = assessSceneQuality({ ...scene, invalid: true }, { layoutOk: false });
assert.strictEqual(bad.overall, 'needs-work');
const plan = assessPlanQuality([scene, { ...scene, sceneId: 's2', visual: { ...scene.visual, type: 'comparison' } }], {});
assert.strictEqual(plan.distinctVisualTypes, 2);
assert.ok(plan.technicalSeparationNote.includes('never implies'));
// Technical QA still independent: file-integrity path untouched.
const qa = new PostRenderQA();
assert.strictEqual(typeof qa.runFileIntegrity, 'function');
console.log('visual-quality-qa.test.js PASS (9 dims, separation, fail states)');
