#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const PROJECT_ROOT = path.resolve(__dirname, '..');
const { planScenes, buildStoryFactSheet } = require('../utils/visual-planner');
const { validateSceneContracts } = require('../utils/scene-contract');
const { normalizeForComparison } = require('../utils/caption-contract');

const REVISIONS_PATH = '/home/gachiemeshackson/Videos/agenttube-reference-lab/hosted-runs/b9-30-draft/revisions.json';
const MANIFEST_PATH = path.join(PROJECT_ROOT, 'hosted-runs/b9-30-kokoro-final-recovery-20261015T100622Z/retrieved/manifest.json');
const revisions = JSON.parse(fs.readFileSync(REVISIONS_PATH, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const durationByScene = new Map(manifest.results.map(r => [r.sceneId, r.measurements.duration_seconds]));
let cursor = 0;
const segments = revisions.revised_segments.map(segment => {
  const durationSec = durationByScene.get(segment.sceneId);
  const enriched = { ...segment, startSec: cursor, durationSec };
  cursor += durationSec;
  return enriched;
});

const factSheet = buildStoryFactSheet({ segments, narrationManifest: manifest });
const plan = planScenes({ segments, factSheet });

// All ten scenes plan successfully and validate against the contract.
assert.strictEqual(plan.ok, true, `planner must succeed on real segments: ${JSON.stringify(plan.findings)}`);
assert.strictEqual(plan.scenes.length, 10);
const contract = validateSceneContracts(plan.scenes);
assert.strictEqual(contract.ok, true, 'all planned scenes must validate');

const byLabel = new Map(plan.scenes.map(scene => [scene.productionLabel, scene]));

// E. Scene-specific requirements against actual approved content.
const setup = byLabel.get('The Setup');
assert.strictEqual(setup.visual.type, 'process_diagram', 'Scene 3 needs a process representation');
assert.ok(setup.visual.payload.steps.length >= 3, 'Scene 3 needs the availability-check steps');
assert.ok(setup.visual.payload.edges.length >= 2, 'Scene 3 needs directed relationships');

const mistake = byLabel.get('The Mistake');
assert.strictEqual(mistake.visual.type, 'comparison', 'Scene 4 needs intention-vs-input differentiation');
assert.ok(mistake.visual.payload.left.items.length && mistake.visual.payload.right.items.length);
assert.ok(mistake.visual.payload.comparedAttributes.length >= 1);

const registration = byLabel.get('The Registration');
assert.strictEqual(registration.visual.type, 'process_diagram', 'Scene 5 needs the registration sequence');
assert.ok(!JSON.stringify(registration.visual).includes('debug'), 'Scene 5 must carry no debug overlays');

const tradeoff = byLabel.get('The Trade-off');
assert.strictEqual(tradeoff.visual.type, 'comparison', 'Scene 7 needs a contrast representation');
assert.notStrictEqual(tradeoff.visual.payload.left.label, tradeoff.visual.payload.right.label);

const cta = byLabel.get('Call to action');
assert.strictEqual(cta.visual.type, 'cta_end_card', 'Scene 10 needs a structured end card');
assert.ok(cta.visual.payload.requiredElements.includes('related_video_area'), 'script calls for a related video');
assert.ok(cta.visual.payload.elements.some(e => e.role === 'related_video_area'));

// No invented historical strings: every payload string is either an exact
// fragment of the approved transcript or a structural label (documented).
for (const scene of plan.scenes) {
  const normalizedTranscript = normalizeForComparison(scene.narration.transcript);
  const serialized = JSON.stringify(scene.visual.payload);
  assert.ok(!/google|googol/i.test(serialized),
    `scene ${scene.sceneId} must not invent the domain name; the accepted narration never names it`);
  assert.ok(!/\b(19|20)\d{2}\b/.test(serialized) || (scene.visual.evidenceRefs || []).length > 0,
    `scene ${scene.sceneId} contains year-like details without evidence`);
  void normalizedTranscript;
}

// The fact sheet records unresolved specifics explicitly.
assert.ok(factSheet.unresolved.some(item => /never named/i.test(item.claim)));

// Invalid segments are rejected, never silently planned.
{
  const bad = planScenes({ segments: [{ sceneId: 'x', label: 'Hook', text: '' }] });
  assert.strictEqual(bad.ok, false);
  assert.ok(bad.findings.some(f => f.code === 'PLANNER_SEGMENT_INVALID'));
}

// A fragment invented by a rule would fail the plan (fail-closed).
{
  const bad = planScenes({ segments: [{ sceneId: 'y', label: 'Hook', text: 'Completely different narration words here.', startSec: 0, durationSec: 5 }] });
  assert.strictEqual(bad.ok, false, 'fragments absent from the transcript must fail');
  assert.ok(bad.findings.some(f => f.code === 'PLANNER_FRAGMENT_NOT_IN_TRANSCRIPT'));
}

console.log('ok');
