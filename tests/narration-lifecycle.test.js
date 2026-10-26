#!/usr/bin/env node
const assert = require('assert');
const {validateLifecycle, requireAcceptableForConsumption, AUDIO_QUALITY_STATUS, EDITORIAL_STATUS, IMPORT_STATUS} = require('../utils/narration-lifecycle');

function testRejectedCannotBeApproved() {
  const m = {audio_quality_status: AUDIO_QUALITY_STATUS.REJECTED, editorial_status: EDITORIAL_STATUS.APPROVED};
  const v = validateLifecycle(m);
  assert.strictEqual(v.ok, false);
}

function testRejectedBlocksConsumption() {
  const m = {audio_quality_status: AUDIO_QUALITY_STATUS.REJECTED};
  assert.throws(() => requireAcceptableForConsumption(m), (e) => e.code === 'NARRATION_REJECTED');
}

function testAcceptedPasses() {
  const m = {audio_quality_status: AUDIO_QUALITY_STATUS.PASS};
  assert.doesNotThrow(() => requireAcceptableForConsumption(m));
}

function run() {
  testRejectedCannotBeApproved();
  testRejectedBlocksConsumption();
  testAcceptedPasses();
  console.log('ok');
}

run();
