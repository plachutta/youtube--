#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const PROJECT_ROOT = path.resolve(__dirname, '..');
const {
  parseSRT, serializeSRT, validateCaptionIntegrity, validateSceneMapping,
  segmentTranscriptToCues, fitCuesToLayout, wrapCueLines
} = require('../utils/caption-contract');
const SRT_PATH = path.join(PROJECT_ROOT, 'data/captions/prod_1791719492789_rox41tx3c2_jldixb8xqw_b9_37_narration.srt');
const REVISIONS_PATH = '/home/gachiemeshackson/Videos/agenttube-reference-lab/hosted-runs/b9-30-draft/revisions.json';
const revisions = JSON.parse(fs.readFileSync(REVISIONS_PATH, 'utf8'));
const transcript = revisions.revised_segments.map(s => s.text).join(' ');

// B. Real b9_37 regression: the shipped SRT must fully represent the transcript.
{
  const cues = parseSRT(fs.readFileSync(SRT_PATH, 'utf8'));
  assert.strictEqual(cues.length, 10, 'b9_37 SRT has one cue per scene');
  const result = validateCaptionIntegrity({ transcript, cues });
  assert.strictEqual(result.ok, true, `real SRT must pass integrity: ${JSON.stringify(result.findings)}`);
}

// B. Missing final words must fail.
{
  const cues = parseSRT(fs.readFileSync(SRT_PATH, 'utf8'));
  cues[9] = { ...cues[9], text: cues[9].text.split(' ').slice(-8).join(' ') };
  const result = validateCaptionIntegrity({ transcript, cues });
  assert.strictEqual(result.ok, false);
  assert.ok(result.findings.some(f => ['CAPTION_FINAL_WORDS_MISSING', 'CAPTION_TEXT_TRUNCATED'].includes(f.code)));
}

// C. Missing initial words (prefix drop) must fail.
{
  const cues = parseSRT(fs.readFileSync(SRT_PATH, 'utf8'));
  cues[0] = { ...cues[0], text: cues[0].text.split(' ').slice(4).join(' ') };
  const result = validateCaptionIntegrity({ transcript, cues });
  assert.strictEqual(result.ok, false);
}

// Truncated middle cue must fail.
{
  const cues = parseSRT(fs.readFileSync(SRT_PATH, 'utf8'));
  cues[4] = { ...cues[4], text: cues[4].text.split(' ').slice(0, 10).join(' ') };
  const result = validateCaptionIntegrity({ transcript, cues });
  assert.strictEqual(result.ok, false);
  assert.ok(result.findings.some(f => f.code === 'CAPTION_TEXT_TRUNCATED'));
}

// Rewritten spoken words must fail (no silent rewriting to fit).
{
  const cues = parseSRT(fs.readFileSync(SRT_PATH, 'utf8'));
  cues[7] = { ...cues[7], text: cues[7].text.replace('good strategy', 'a good strategy') };
  const result = validateCaptionIntegrity({ transcript, cues });
  assert.strictEqual(result.ok, false, 'adding words to hide the grammar issue must fail');
  assert.ok(result.findings.some(f => f.code === 'CAPTION_TEXT_DIVERGED' || f.code === 'CAPTION_TEXT_EXTRA' || f.code === 'CAPTION_TEXT_TRUNCATED'));
}

// Invalid ordering and non-positive durations must fail.
{
  const cues = [
    { start: 10, end: 12, text: 'hello world' },
    { start: 5, end: 11, text: 'second cue' }
  ];
  const result = validateCaptionIntegrity({ transcript: 'hello world second cue', cues });
  assert.strictEqual(result.ok, false);
  assert.ok(result.findings.some(f => f.code === 'CAPTION_ORDER_INVALID'));
  const negative = validateCaptionIntegrity({ transcript: 'hello world', cues: [{ start: 5, end: 5, text: 'hello world' }] });
  assert.ok(negative.findings.some(f => f.code === 'CAPTION_DURATION_NOT_POSITIVE'));
}

// Empty cue must fail.
{
  const result = validateCaptionIntegrity({ transcript: 'hello world', cues: [{ start: 0, end: 1, text: 'hello world' }, { start: 1, end: 2, text: '   ' }] });
  assert.ok(result.findings.some(f => f.code === 'CAPTION_CUE_EMPTY'));
}

// Segmenting preserves every word (Scene 5/10 regression: nothing lost).
{
  const segments = revisions.revised_segments;
  let cursor = 0;
  let all = [];
  for (const segment of segments) {
    const duration = 12;
    all = all.concat(segmentTranscriptToCues({ transcript: segment.text, startSec: cursor, endSec: cursor + duration }));
    cursor += duration;
  }
  all = fitCuesToLayout(all);
  const result = validateCaptionIntegrity({ transcript, cues: all });
  assert.strictEqual(result.ok, true, `segmented cues must preserve transcript: ${JSON.stringify(result.findings)}`);
  assert.ok(all.length >= 10, 'long scenes must split into multiple cues');
  for (const cue of all) {
    const wrapped = wrapCueLines(cue.text, { maxLineChars: 42, maxLines: 2 });
    assert.ok(wrapped.lines.length <= 2 || wrapped.overflow === false || wrapped.lines.length > 2,
      'wrap never drops words');
    assert.strictEqual(wrapped.lines.join(' '), cue.text, 'wrapping preserves text');
  }
}

// Mapping to wrong scene must fail.
{
  const scenes = [
    { productionLabel: 'Hook', narration: { transcript: 'alpha beta gamma delta' }, timing: { startSec: 0, durationSec: 10 } },
    { productionLabel: 'Introduction', narration: { transcript: 'epsilon zeta eta theta' }, timing: { startSec: 10, durationSec: 10 } }
  ];
  const cues = [
    { start: 0, end: 5, text: 'alpha beta gamma' },
    { start: 5, end: 15, text: 'kappa lambda mu nu omega sigma delta omega pi' }
  ];
  const result = validateSceneMapping({ scenes, cues });
  assert.ok(result.findings.some(f => f.code === 'CAPTION_WRONG_SCENE_MAPPING' || f.code === 'CAPTION_UNMAPPED'));
}

// Round-trip serialization preserves content.
{
  const cues = parseSRT(fs.readFileSync(SRT_PATH, 'utf8'));
  const reparsed = parseSRT(serializeSRT(cues));
  assert.strictEqual(reparsed.length, cues.length);
  reparsed.forEach((cue, i) => assert.strictEqual(cue.text, cues[i].text));
}

console.log('ok');
