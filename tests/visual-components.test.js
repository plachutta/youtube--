#!/usr/bin/env node
const assert = require('assert');
const C = require('../utils/visual-components');
function catchCode(fn) { try { fn(); } catch (e) { return e.code; } return null; }
const { validateSceneContracts } = require('../utils/scene-contract');
assert.strictEqual(C.INVENTORY.length, 9, '9 priority components inventoried');
const mk = (t, p) => ({ sceneId: 's1', productionLabel: 'Test', position: 1, purpose: 'p', keyTakeaway: 'k', narration: { transcript: 'Someone picks the words they want.' }, visual: { type: t, payload: p, evidenceRefs: ['narration:s1'] }, timing: { startSec: 0, durationSec: 5 } });
const built = [
  mk(C.buildProcessDiagram({ steps: [{ id: 'a', label: 'Someone picks the words they want' }, { id: 'b', label: 'types them into a registrar' }], edges: [{ from: 'a', to: 'b' }] }).type, C.buildProcessDiagram({ steps: [{ id: 'a', label: 'x' }, { id: 'b', label: 'y' }], edges: [{ from: 'a', to: 'b' }] }).payload),
  mk('comparison', C.buildComparison({ left: { label: 'A', items: ['x'] }, right: { label: 'B', items: ['y'] }, comparedAttributes: ['attr'] }).payload),
  mk('timeline', C.buildTimeline({ events: [{ label: 'first' }, { label: 'second' }] }).payload),
];
const r = validateSceneContracts(built);
assert.strictEqual(r.ok, true, 'component-built payloads validate: ' + JSON.stringify(r.findings));
assert.strictEqual(catchCode(() => C.buildProcessDiagram({ steps: [{ id: 'a', label: 'x' }], edges: [] })), 'COMP_STEPS_MISSING');
assert.strictEqual(catchCode(() => C.buildComparison({ left: { label: 'S', items: ['x'] }, right: { label: 'S', items: ['y'] }, comparedAttributes: ['a'] })), 'COMP_LABELS_IDENTICAL');
assert.strictEqual(catchCode(() => C.buildInterface({ action: 'x', elements: [{ role: 'r', label: 'l' }], illustrative: false })), 'COMP_NOT_ILLUSTRATIVE');
assert.strictEqual(catchCode(() => C.buildDataViz({ statLabel: 's', value: 5, source: {} })), 'COMP_SOURCE_MISSING');
assert.strictEqual(catchCode(() => C.buildEndCard({ ctaWording: 'x', requiredElements: ['subscribe'], elements: [] })), 'COMP_CTA_ABSENT');
console.log('visual-components.test.js PASS (inventory 9, payloads validate, fail-closed builders)');
