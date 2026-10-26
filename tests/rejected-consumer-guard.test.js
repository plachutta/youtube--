#!/usr/bin/env node
const assert = require('assert');
const {validateNarrationManifest} = require('../utils/narration-manifest-validator');

function run() {
  const rej = {audio_quality_status: 'REJECTED'};
  const v = validateNarrationManifest(rej, {requireConsumption: true});
  assert.strictEqual(v.valid, false);
  console.log('ok');
}

run();
