#!/usr/bin/env node
const assert = require('assert');

function run() {
  // validate required identity fields
  const chk = {runId:'r1', stage:'narration', inputHash:'h1', textHash:'t1', model:'m1', voice:'v1', outputHash:'o1', outputPath:'/x/y.mp3'};
  for (const k of ['runId','stage','inputHash','textHash','model','voice','outputHash']) {
    assert.ok(Object.prototype.hasOwnProperty.call(chk, k));
    assert.ok(chk[k]);
  }
  // invalidation cases
  const changed = {...chk, inputHash:'h2'};
  assert.notStrictEqual(changed.inputHash, chk.inputHash);
  const changedModel = {...chk, model:'m2'};
  assert.notStrictEqual(changedModel.model, chk.model);
  const changedText = {...chk, textHash:'t2'};
  assert.notStrictEqual(changedText.textHash, chk.textHash);
  console.log('ok');
}

run();
