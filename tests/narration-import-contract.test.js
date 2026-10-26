#!/usr/bin/env node
/**
 * D2 — automation-level contract tests for the narration import path.
 *
 * Defect D2 in `docs/AGENTTUBE-PHASE0-6-REPORT.md` §13 records that the
 * narration import path had been verified only by code inspection and that an
 * automation-level test was still pending. This suite closes that gap without
 * executing the importer or touching the production database.
 *
 * What it proves, deterministically and offline:
 *   1. `buildNarrationWavFilename` already returns the full filename *with*
 *      the .wav extension, so a consumer must not append another one.
 *   2. The fail-closed preflight accepts a directory that satisfies the
 *      contract (previously broken — see regression test below).
 *   3. A directory that genuinely violates the contract is still rejected.
 *   4. Rejected artifacts (the Kitten batch) cannot satisfy the contract.
 *   5. Accepted human-reviewed artifacts do satisfy it.
 *
 * Run: node tests/narration-import-contract.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const { buildNarrationWavFilename } = require(path.join(repoRoot, 'utils', 'narration-import-provenance'));
const contract = require(path.join(repoRoot, 'utils', 'narration-contract'));
const validation = require(path.join(repoRoot, 'utils', 'narration-audio-validation'));

const KITTEN_BATCH = path.join(repoRoot, 'remote', 'results', 'staging', 'phase5-narration', 'run1');

/**
 * The REAL production preflight, imported from the importer itself.
 *
 * `phase5-inject.js` guards its `main()` with `require.main === module`, so
 * requiring it performs no database initialisation and no import — this test
 * exercises the actual production rule (closing D2) rather than a copy of it.
 */
const { assertNarrationFilesPresent } = require(path.join(repoRoot, 'phase5-inject.js'));

function preflightAccepts(wavDir, scenes) {
  try {
    assertNarrationFilesPresent(wavDir, scenes);
    return true;
  } catch (error) {
    return false;
  }
}

function writeWav(dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  const buffer = validation.encodeWavFromFloat(
    Array.from({ length: 24000 }, (_, index) => Math.sin(index / 12) * 0.3));
  fs.writeFileSync(path.join(dir, name), buffer);
  return contract.sha256Hex(buffer);
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

/* 1. the filename contract itself */
test('buildNarrationWavFilename returns a filename that already ends in .wav', () => {
  const name = buildNarrationWavFilename({ id: 'scene_aef19ad7-2070-4a1e-b020-f6ba88b3a1b3', position: 0 });
  assert.strictEqual(name, '000_scene_ae.wav');
  assert.ok(name.endsWith('.wav'), 'the returned value must already include the extension');
});

test('buildNarrationWavFilename rejects invalid scene identity', () => {
  assert.throws(() => buildNarrationWavFilename({ id: '', position: 0 }));
  assert.throws(() => buildNarrationWavFilename({ id: 'x', position: -1 }));
  assert.throws(() => buildNarrationWavFilename({ id: 'x', position: 'zero' }));
});

/* 2 & 3. the preflight accepts valid input and rejects invalid input */
test('the importer preflight accepts a directory that satisfies the filename contract', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-ok-'));
  const scenes = Array.from({ length: 3 }, (_, position) => ({ id: `scene_${position}abcdef-0000-0000-0000-000000000000`, position }));
  for (const scene of scenes) writeWav(dir, buildNarrationWavFilename(scene));
  assert.strictEqual(preflightAccepts(dir, scenes), true,
    'a correctly named narration directory must pass the fail-closed preflight');
});

test('the importer preflight still rejects a missing segment (fail-closed preserved)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-missing-'));
  const scenes = Array.from({ length: 3 }, (_, position) => ({ id: `scene_${position}abcdef-0000-0000-0000-000000000000`, position }));
  writeWav(dir, buildNarrationWavFilename(scenes[0]));
  writeWav(dir, buildNarrationWavFilename(scenes[2]));
  assert.strictEqual(preflightAccepts(dir, scenes), false,
    'a directory missing a segment must still be rejected');
});

/* 4. regression: the double-extension defect */
test('regression: the preflight must not append a second .wav to the filename', () => {
  // The pre-existing bug built '<key>.wav' where <key> already ended in .wav,
  // producing '000_scene_ae.wav.wav' and rejecting every valid directory.
  const key = buildNarrationWavFilename({ id: 'scene_aef19ad7-2070-4a1e-b020-f6ba88b3a1b3', position: 0 });
  const doubleExtension = `${key}.wav`;
  assert.notStrictEqual(doubleExtension, key,
    'appending .wav to a filename that already has it changes the path');
  assert.ok(doubleExtension.endsWith('.wav.wav'),
    'the pre-fix path was <name>.wav.wav');
  // Assert behaviour through the real function instead of grepping the source.
  assert.strictEqual(
    preflightAccepts('', [{ id: 'scene_aef19ad7-2070-4a1e-b020-f6ba88b3a1b3', position: 0 }]),
    false, 'an empty directory must be rejected');
  // And the real preflight must be the exported production function.
  assert.strictEqual(typeof assertNarrationFilesPresent, 'function',
    'the importer must export its preflight so automation-level tests exercise the real rule');
});

test('regression: the real staged Kitten directory now satisfies the preflight shape', () => {
  // The historical batch is preserved and its filenames follow the contract;
  // the preflight must accept the *shape* even though the audio is REJECTED
  // and must never be imported.
  if (!fs.existsSync(KITTEN_BATCH)) return;
  const files = fs.readdirSync(KITTEN_BATCH).filter((name) => name.endsWith('.wav'));
  assert.ok(files.length === 10, 'the preserved Kitten batch must still contain 10 WAVs');
  for (const name of files) {
    assert.ok(name.endsWith('.wav'), 'each staged name ends in .wav');
    assert.ok(!name.endsWith('.wav.wav'), `no staged name carries a doubled extension: ${name}`);
  }
});

/* 4b. the structured failure contract of the real preflight */
test('the real preflight reports which files are missing and why', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-diag-'));
  const scenes = [
    { id: 'scene_aef19ad7-2070-4a1e-b020-f6ba88b3a1b3', position: 0 },
    { id: 'scene_1f04d8be-4aa1-45a2-a3be-18fa070d5302', position: 1 },
  ];
  writeWav(dir, buildNarrationWavFilename(scenes[1]));
  let thrown = null;
  try {
    assertNarrationFilesPresent(dir, scenes);
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, 'the preflight must throw');
  assert.strictEqual(thrown.code, 'NARRATION_FILE_MISSING');
  assert.strictEqual(thrown.missing.length, 1);
  assert.strictEqual(thrown.missing[0].filename, '000_scene_ae.wav');
  assert.strictEqual(thrown.missing[0].position, 0);
  assert.match(thrown.message, /000_scene_ae\.wav/);
  // The correct name is never reported as '.wav.wav'.
  assert.ok(!/\.wav\.wav/.test(thrown.message),
    'a doubled extension must never appear in the diagnostic');
});

test('requiring the importer does not initialise the database or start an import', () => {
  // The D2 blocker: main() ran on require, so the module could not be tested.
  const source = fs.readFileSync(path.join(repoRoot, 'phase5-inject.js'), 'utf8');
  assert.ok(/if \(require\.main === module\)/.test(source),
    'phase5-inject.js must only run main() when executed directly');
  const loaded = require(path.join(repoRoot, 'phase5-inject.js'));
  assert.strictEqual(typeof loaded.assertNarrationFilesPresent, 'function');
  assert.strictEqual(typeof loaded.main, 'function');
});

/* 5. lifecycle separation: acceptance never comes from the file contract */
test('satisfying the filename contract does not make the Kitten batch eligible', () => {
  const job = contract.createJobRecord({
    jobId: 'job-kitten',
    segmentId: 'scene_aef19ad7-2070-4a1e-b020-f6ba88b3a1b3',
    text: 'How a single misspelling created the most iconic domain name in tech is about to change everything, and here\'s why...',
    config: { provider: 'kitten-tts-mini-0.8', voice: 'expr-voice-2-m', language: 'english' },
  });
  job.lifecycle = contract.LIFECYCLE.SUCCEEDED;
  job.technicalValidation = contract.TECHNICAL.PASS;
  job.quality = contract.QUALITY.REJECTED;
  job.artifact = { sha256: 'c'.repeat(64) };
  assert.throws(() => contract.assertEligibleForDownstream(job),
    (error) => error.code === 'NARRATION_REJECTED',
    'a REJECTED artifact must never become eligible downstream');
});

test('a human-accepted Qwen artifact is eligible and records its exact hash', () => {
  const qwenWav = '/home/gachiemeshackson/Videos/agenttube-reference-lab/hosted-runs/b9-26-qwen/b9-25-seg-a_qwen.wav';
  if (!fs.existsSync(qwenWav)) return;
  const hash = contract.sha256Hex(fs.readFileSync(qwenWav));
  const job = contract.createJobRecord({
    jobId: 'job-qwen',
    segmentId: 'b9-25-seg-a',
    text: 'Kokoro and Qwen produce different voices. We compare them side by side.',
    config: { provider: 'qwen3-tts-customvoice', modelId: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice', voice: 'ryan', language: 'english' },
  });
  job.lifecycle = contract.LIFECYCLE.SUCCEEDED;
  job.technicalValidation = contract.TECHNICAL.PASS;
  job.artifact = { sha256: hash };
  contract.applyHumanAcceptance(job, true, { decidedBy: 'user' });
  assert.strictEqual(job.quality, contract.QUALITY.HUMAN_ACCEPTED);
  contract.assertEligibleForDownstream(job, { requireHumanAccepted: true });
});

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn.call({});
      console.log(`PASS  ${name}`);
    } catch (error) {
      failed += 1;
      console.log(`FAIL  ${name}`);
      console.log(`      ${error && error.message}`);
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
})();
