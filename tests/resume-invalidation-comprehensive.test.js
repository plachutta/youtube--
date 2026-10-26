#!/usr/bin/env node
const assert = require('assert');

function run() {
  const base = {runId:'r1', stage:'narration', inputHash:'h1', textHash:'t1', model:'m1', voice:'v1', outputHash:'o1', audio_quality_status:'PASS'};
  assert.notStrictEqual({...base, inputHash:'h2'}.inputHash, base.inputHash);
  assert.notStrictEqual({...base, textHash:'t2'}.textHash, base.textHash);
  assert.notStrictEqual({...base, model:'m2'}.model, base.model);
  assert.notStrictEqual({...base, voice:'v2'}.voice, base.voice);
  assert.notStrictEqual({...base, outputHash:'o2'}.outputHash, base.outputHash);
  console.log('ok');
}

run();
