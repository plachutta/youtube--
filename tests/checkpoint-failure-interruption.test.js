#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function run() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-'));
  const chkPath = path.join(tmp, 'chk.json');
  const good = {runId:'r', stage:'s', status:'completed', artifact:{ok:true}};
  fs.writeFileSync(chkPath, JSON.stringify(good));
  // simulate failed write (don't overwrite)
  const bad = {runId:'r', stage:'s', status:'corrupted'};
  const tmpPath = chkPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(bad));
  // in case of failure, don't rename; keep original
  const loaded = JSON.parse(fs.readFileSync(chkPath));
  assert.strictEqual(loaded.status, 'completed');
  console.log('ok');
}

run();
