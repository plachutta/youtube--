#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function run() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-'));
  const chkPath = path.join(tmp, 'checkpoint_narration.json');
  const chk = {runId:'r1', stage:'narration', inputHash:'h1', textHash:'t1', model:'m1', voice:'v1', outputHash:'o1', outputPath:'/tmp/o1.mp3', audio_quality_status:'PASS', generation_status:'COMPLETE'};
  fs.writeFileSync(chkPath, JSON.stringify(chk));
  const loaded = JSON.parse(fs.readFileSync(chkPath));
  assert.deepStrictEqual(loaded, chk);
  // atomic write simulation
  const newChk = {...chk, outputHash:'o2'};
  const tmpPath = chkPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(newChk));
  fs.renameSync(tmpPath, chkPath);
  const reloaded = JSON.parse(fs.readFileSync(chkPath));
  assert.strictEqual(reloaded.outputHash, 'o2');
  console.log('ok');
}

run();
