#!/usr/bin/env node
const assert = require('assert');
const {guardAgainstRejected} = require('../utils/narration-quality');

function run() {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nm-'));
  const mrej = path.join(tmp, 'rej.json');
  fs.writeFileSync(mrej, JSON.stringify({audio_quality_status: 'REJECTED'}));
  assert.throws(() => guardAgainstRejected(mrej), (e) => e.code === 'NARRATION_REJECTED');
  console.log('ok');
}

run();
