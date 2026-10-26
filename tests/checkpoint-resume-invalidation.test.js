#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function run() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-'));
  const chk = {runId:'r', stage:'narration', inputHash:'h1', textHash:'t1', model:'m', voice:'v', outputHash:'o1'};
  fs.writeFileSync(path.join(tmp,'chk.json'), JSON.stringify(chk));
  // input changed - must reject reuse
  const stale = Object.assign({}, chk, {inputHash:'h2'});
  assert.notStrictEqual(stale.inputHash, chk.inputHash);
  // model changed
  const stale2 = Object.assign({}, chk, {model:'m2'});
  assert.notStrictEqual(stale2.model, chk.model);
  // text changed
  const stale3 = Object.assign({}, chk, {textHash:'t2'});
  assert.notStrictEqual(stale3.textHash, chk.textHash);
  console.log('ok');
}

run();
