#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

function run() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chk-'));
  // simulate basic identity - presence check
  fs.writeFileSync(path.join(tmp, 'checkpoint_test.json'), JSON.stringify({runId:'r1', stage:'s1', inputHash:'h1', textHash:'t1', model:'m1', voice:'v1'}));
  const c = JSON.parse(fs.readFileSync(path.join(tmp, 'checkpoint_test.json')));
  assert.strictEqual(c.runId, 'r1');
  assert.strictEqual(c.inputHash, 'h1');
  assert.strictEqual(c.textHash, 't1');
  assert.strictEqual(c.model, 'm1');
  assert.strictEqual(c.voice, 'v1');
  console.log('ok');
}

run();
