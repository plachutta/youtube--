#!/usr/bin/env node
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const PROJECT_ROOT = path.resolve(__dirname, '..');

// J. The accepted narration must remain unchanged: every scene WAV on disk
// must still match the hash recorded in the accepted b9-30 manifest, and the
// frozen baseline video artifacts must be untouched.
const MANIFEST_PATH = path.join(PROJECT_ROOT, 'hosted-runs/b9-30-kokoro-final-recovery-20261015T100622Z/retrieved/manifest.json');
const RETRIEVED_DIR = path.join(PROJECT_ROOT, 'hosted-runs/b9-30-kokoro-final-recovery-20261015T100622Z/retrieved');
const BASELINE_SHA_PATH = path.join(PROJECT_ROOT, 'data/videos/review/b9_38_improvement/audit/baseline_video_sha256.txt');
const B9_37_VIDEO = path.join(PROJECT_ROOT, 'data/videos/prod_1791719492789_rox41tx3c2_jldixb8xqw_b9_37_draft.mp4');

(function run() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  assert.ok(Array.isArray(manifest.results) && manifest.results.length === 10, 'accepted manifest has 10 scenes');
  for (const result of manifest.results) {
    const wavPath = path.join(RETRIEVED_DIR, `${result.sceneId}.wav`);
    assert.ok(fs.existsSync(wavPath), `accepted narration file exists: ${result.sceneId}.wav`);
    const actual = crypto.createHash('sha256').update(fs.readFileSync(wavPath)).digest('hex');
    assert.strictEqual(actual, result.audio_sha256, `narration WAV unchanged: ${result.sceneId}`);
    assert.strictEqual(result.text_sha256_actual, result.text_sha256_expected, `transcript text hash intact: ${result.sceneId}`);
  }
  // Grammar finding stays an editorial record; captions stay faithful (see
  // caption-integrity test: rewriting the spoken words fails validation).
  const segments = JSON.parse(fs.readFileSync('/home/gachiemeshackson/Videos/agenttube-reference-lab/hosted-runs/b9-30-draft/revisions.json', 'utf8')).revised_segments;
  const lesson = segments.find(s => s.label === 'The Lesson');
  assert.ok(lesson.text.includes('not that misspellings are good strategy'),
    'accepted narration remains verbatim; the editorial issue is recorded, not silently rewritten');

  // Frozen baseline artifacts untouched.
  const recorded = fs.readFileSync(BASELINE_SHA_PATH, 'utf8').trim().split(/\s+/);
  const actualVideo = crypto.createHash('sha256').update(fs.readFileSync(B9_37_VIDEO)).digest('hex');
  assert.ok(recorded.some(line => line.includes(actualVideo)), 'b9_37 baseline video hash still matches the recorded baseline');
  console.log('ok');
})();
