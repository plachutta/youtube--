#!/usr/bin/env node
/**
 * B9.26 Qwen retrieval and local validation.
 *
 * Downloads the hosted Qwen run into the lab, verifies every artifact hash
 * against the remote manifest, and validates each WAV through the shared
 * narration contract. Never submits anything.
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const contract = require('../utils/narration-contract');
const validation = require('../utils/narration-audio-validation');

const SESSION = process.env.B926_SESSION || 'b926-qwen-20261013';
const LAB = '/home/gachiemeshackson/Videos/agenttube-reference-lab/hosted-runs/b9-26-qwen';

const SEGMENTS = [
  { segmentId: 'b9-25-seg-a', text: 'Kokoro and Qwen produce different voices. We compare them side by side.' },
  { segmentId: 'b9-25-seg-b', text: 'Reliable narration keeps viewers watching to the end of the video.' },
  { segmentId: 'b9-25-seg-c', text: 'Every artifact carries its hash, so any later change stays detectable.' },
];
const PROVIDER = {
  provider: 'qwen3-tts-customvoice',
  modelId: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice',
  modelRevision: '85e237c12c027371202489a0ec509ded67b5e4b5',
  voice: 'ryan',
  language: 'english',
};

function colab(args) {
  return execFileSync('colab', args, { encoding: 'utf8', timeout: 170000 });
}

fs.mkdirSync(LAB, { recursive: true });

let listing = '';
try {
  listing = colab(['ls', '-s', SESSION, '/content/b9_26_qwen']);
} catch (error) {
  console.error(`cannot list remote run: ${error.message}`);
  process.exit(3);
}
for (const line of listing.split('\n').map((entry) => entry.trim()).filter(Boolean)) {
  if (line.startsWith('[colab]')) continue;
  colab(['download', '-s', SESSION, `/content/b9_26_qwen/${line}`, path.join(LAB, line)]);
  console.log(`retrieved ${line}`);
}

const statusText = fs.existsSync(path.join(LAB, 'STATUS.txt'))
  ? fs.readFileSync(path.join(LAB, 'STATUS.txt'), 'utf8').trim() : 'MISSING';
console.log(`remote terminal marker: ${statusText}`);

// Release the hosted session before any local analysis.
try {
  console.log(colab(['stop', '-s', SESSION]).trim());
} catch (error) {
  console.log(`stop reported: ${error.message}`);
}

const manifestPath = path.join(LAB, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('remote manifest missing locally');
  process.exit(4);
}
const remote = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const outcomes = [];
for (const segment of SEGMENTS) {
  const request = {
    jobId: 'b9-26',
    segmentId: segment.segmentId,
    text: segment.text,
    language: PROVIDER.language,
    config: PROVIDER,
  };
  const job = contract.createJobRecord(request);
  job.lifecycle = contract.LIFECYCLE.RUNNING;
  const entry = remote.results.find(
    (result) => result.segment_id === segment.segmentId && result.provider === PROVIDER.provider);
  if (!entry) {
    job.lifecycle = contract.LIFECYCLE.FAILED;
    job.failure = { classification: 'MISSING_REMOTE_RESULT', message: 'no result reported by the hosted run' };
    outcomes.push({ job, ok: false });
    continue;
  }
  const localFile = path.join(LAB, path.basename(entry.audio_path || ''));
  if (!entry.audio_path || !fs.existsSync(localFile)) {
    job.lifecycle = contract.LIFECYCLE.FAILED;
    job.failure = { classification: 'ARTIFACT_RETRIEVAL_FAILED', message: `missing locally: ${entry.audio_path}` };
    outcomes.push({ job, ok: false });
    continue;
  }
  const bytes = fs.readFileSync(localFile);
  const localHash = contract.sha256Hex(bytes);
  if (entry.audio_sha256 && entry.audio_sha256 !== localHash) {
    job.lifecycle = contract.LIFECYCLE.FAILED;
    job.failure = {
      classification: 'ARTIFACT_HASH_MISMATCH',
      message: `downloaded ${localHash} does not match remote ${entry.audio_sha256}`,
    };
    outcomes.push({ job, ok: false });
    continue;
  }
  if (entry.text_sha256_actual !== job.textSha256) {
    job.lifecycle = contract.LIFECYCLE.FAILED;
    job.failure = {
      classification: 'INPUT_HASH_MISMATCH',
      message: `remote ${entry.text_sha256_actual} does not match ${job.textSha256}`,
    };
    outcomes.push({ job, ok: false });
    continue;
  }
  job.artifact = {
    format: path.extname(entry.audio_path).slice(1),
    sampleRate: entry.measurements ? entry.measurements.sample_rate : null,
    channels: entry.measurements ? entry.measurements.channels : null,
    durationSeconds: entry.measurements ? entry.measurements.duration_seconds : null,
    sha256: localHash,
    sizeBytes: bytes.length,
  };
  const report = validation.validateNarrationAudio(bytes);
  job.technicalValidation = report.technicalValidation;
  job.completedAt = new Date().toISOString();
  if (report.technicalValidation !== contract.TECHNICAL.PASS) {
    job.lifecycle = contract.LIFECYCLE.FAILED;
    job.quality = contract.QUALITY.REJECTED;
    job.failure = { classification: 'ARTIFACT_VALIDATION', message: report.errors.join('; ') };
    outcomes.push({ job, ok: false, report });
    continue;
  }
  job.lifecycle = contract.LIFECYCLE.SUCCEEDED;
  job.quality = contract.QUALITY.NOT_ASSESSED;
  outcomes.push({ job, ok: true, report });
}

const passed = outcomes.filter((entry) => entry.ok).length;
for (const { job, ok, report } of outcomes) {
  if (ok) {
    console.log(`PASS ${job.provider} ${job.segmentId} sha256=${job.artifact.sha256} ` +
      `${report.measurements.durationSeconds}s @${report.measurements.sampleRate}Hz ch=${report.measurements.channels}`);
  } else {
    console.log(`FAIL ${job.provider} ${job.segmentId} ${job.failure.classification}: ${job.failure.message}`);
  }
}
console.log(`\n${passed}/${outcomes.length} technically validated`);
console.log(`remote overall: ${remote.overall_status} (${remote.succeeded}/${remote.expected})`);

fs.writeFileSync(path.join(LAB, 'local-summary.json'), JSON.stringify({
  session: SESSION,
  remoteTerminal: statusText,
  remoteOverall: remote.overall_status,
  passed,
  total: outcomes.length,
  environment: remote.environment,
  artifacts: outcomes.filter((entry) => entry.ok).map(({ job }) => ({
    provider: job.provider,
    segmentId: job.segmentId,
    textSha256: job.textSha256,
    audioSha256: job.artifact.sha256,
  })),
}, null, 2));

const humanAccepted = outcomes.filter(({ job }) => {
  try {
    contract.assertEligibleForDownstream(job, { requireHumanAccepted: true });
    return true;
  } catch (error) {
    return false;
  }
}).length;
console.log(`${humanAccepted} human-accepted / downstream-eligible (expected 0 until human review)`);

// Human review index for the new artifacts.
const index = ['# B9.26 Qwen integration samples - human listening review index', '',
  'These are NEW artifacts from the shared-contract integration run. They do NOT',
  'inherit the B9.19 Qwen acceptance.', '',
  `Run: ${SESSION} (Colab, Tesla T4)`, `Remote terminal: ${statusText}`, ''];
for (const { job, ok, report } of outcomes) {
  index.push(`## ${job.segmentId}`);
  if (ok) {
    index.push(`- artifact_sha256: ${job.artifact.sha256}`);
    index.push(`- text_sha256: ${job.textSha256}`);
    index.push(`- duration: ${report.measurements.durationSeconds}s @ ${report.measurements.sampleRate}Hz x ${report.measurements.channels}ch`);
    index.push(`- local file: ${job.segmentId}_qwen.wav`);
    index.push('- generation_status: SUCCEEDED');
    index.push('- technical_validation_status: PASS');
    index.push('- audio_quality_status: NOT_ASSESSED (awaiting human verdict)');
    index.push('- downstream eligibility: NOT_AUTHORIZED');
  } else {
    index.push(`- BLOCKED: ${job.failure.classification} - ${job.failure.message}`);
  }
  index.push('');
}
index.push('Play with: `ffplay b9-25-seg-a_qwen.wav` (or `mpv` / `aplay`)', '');
fs.writeFileSync(path.join(LAB, 'HUMAN-REVIEW-INDEX.md'), `${index.join('\n')}\n`);

process.exit(passed === outcomes.length ? 0 : 2);
