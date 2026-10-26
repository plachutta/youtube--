#!/usr/bin/env node
const assert = require('assert');
const { GRAMMAR_VERSION, PATTERNS, getPattern, patternsForVisualType } = require('../utils/visual-grammar');
assert.strictEqual(GRAMMAR_VERSION, 1);
assert.strictEqual(Object.keys(PATTERNS).length, 13, 'grammar holds 13 reusable patterns');
for (const [name, p] of Object.entries(PATTERNS)) {
  for (const k of ['when', 'needs', 'viewerOutcome', 'requiredElements', 'motion', 'layout', 'antiPatterns', 'provenance', 'mapsTo', 'validate'])
    assert.ok(p[k] !== undefined, `${name} defines ${k}`);
  assert.ok(getPattern(name) === p);
}
assert.ok(patternsForVisualType('process_diagram').includes('stepwise-process'));
assert.ok(patternsForVisualType('cta_end_card').includes('structured-endcard'));
console.log('visual-grammar.test.js PASS (13 patterns, all fields, type mapping)');
