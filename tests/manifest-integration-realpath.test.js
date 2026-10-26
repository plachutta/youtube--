#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {validateNarrationManifest} = require('../utils/narration-manifest-validator');

function run() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mi-'));
  // rejected via embedded
  const rej = {audio_quality_status: 'REJECTED'};
  const v1 = validateNarrationManifest(rej);
  assert.strictEqual(v1.valid, false);
  // via file path
  const mpath = path.join(tmp, 'm.json');
  fs.writeFileSync(mpath, JSON.stringify({audio_quality_status: 'REJECTED'}));
  const v2 = validateNarrationManifest({}, {manifestPath: mpath});
  assert.strictEqual(v2.valid, false);
  // accepted
  const acc = {audio_quality_status: 'PASS'};
  const v3 = validateNarrationManifest(acc);
  assert.strictEqual(v3.valid, true);
  console.log('ok');
}

run();
