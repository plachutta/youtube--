#!/usr/bin/env node
const assert = require('assert');

function run() {
  const segments = ['seg0', 'seg1', 'seg2'];
  const results = new Map();
  results.set('seg0', {ok: true, hash: 'h0'});
  results.set('seg1', {ok: false});
  results.set('seg2', {ok: true, hash: 'h2'});
  // preserve valid segments
  const preserved = segments.filter(s => results.get(s)?.ok);
  assert.deepStrictEqual(preserved, ['seg0', 'seg2']);
  // resume from first incomplete
  const resume = segments.find(s => !results.get(s)?.ok) || segments[segments.length-1];
  assert.strictEqual(resume, 'seg1');
  console.log('ok');
}

run();
