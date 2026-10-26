#!/usr/bin/env node
/**
 * B9.25 recovery monitor.
 *
 * A hosted pilot is already running on the session (an earlier invocation
 * submitted it and was then interrupted locally). This monitor does NOT
 * submit anything: it waits for the remote terminal marker, retrieves the
 * artifacts eagerly, validates them locally through the shared contract,
 * then releases the session.
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const contract = require('../utils/narration-contract');
const validation = require('../utils/narration-audio-validation');

const SESSION = process.env.B925_SESSION || 'b925-pilot-20261013';
const LAB = '/home/gachiemeshackson/Videos/agenttube-reference-lab/hosted-runs/b9-25-pilot';
const POLL_MS = Number(process.env.B925_POLL_MS || 90000);
const MAX_POLLS = Number(process.env.B925_MAX_POLLS || 40);

const SEGMENTS = [
  { segmentId: 'b9-25-seg-a', text: 'Kokoro and Qwen produce different voices. We compare them side by side.' },
  { segmentId: 'b9-25-seg-b', text: 'Reliable narration keeps viewers watching to the end of the video.' },
  { segmentId: 'b9-25-seg-c', text: 'Every artifact carries its hash, so any later change stays detectable.' },
];
const PROVIDERS = [
  { provider: 'kokoro-82m', modelId: 'hexgrad/Kokoro-82M', modelRevision: 'dfb907a02bba8152ca444717ca5d78747ccb4bec', voice: 'af_heart', language: 'english' },
  { provider: 'qwen3-tts-customvoice', modelId: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice', modelRevision: '85e237c12c027371202489a0ec509ded67b5e4b5', voice: 'ryan', language: 'english' },
];

function colab(args) {
  return execFileSync('colab', args, { encoding: 'utf8', timeout: 170000 });
}

function download(remote, local) {
  try {
    colab(['download', '-s', SESSION, remote, local]);
    return true;
  } catch (error) {
    console.log(`  download failed for ${path.basename(remote)}: ${error.message}`);
    return false;
  }
}

(async () => {
  fs.mkdirSync(LAB, { recursive: true });
  let terminal = null;
  for (let poll = 0; poll < MAX_POLLS; poll += 1) {
    let listing = '';
    try {
      listing = colab(['ls', '-s', SESSION, '/content/b9_25_pilot']);
    } catch (error) {
      console.log(`poll ${poll}: remote listing unavailable`);
    }
    let wavs = 0;
    if (listing) {
      for (const line of listing.split('\n').map((entry) => entry.trim()).filter(Boolean)) {
        if (line.startsWith('[colab]')) continue;
        if (line.endsWith('.wav')) wavs += 1;
        download(`/content/b9_25_pilot/${line}`, path.join(LAB, line));
      }
    }
    const statusFile = path.join(LAB, 'STATUS.txt');
    if (fs.existsSync(statusFile)) {
      terminal = fs.readFileSync(statusFile, 'utf8').trim();
      console.log(`remote terminal marker: ${terminal}`);
      break;
    }
    console.log(`poll ${poll}: ${wavs} wav retrieved`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  if (!terminal) terminal = 'UNKNOWN (no terminal marker observed)';

  try {
    console.log(colab(['stop', '-s', SESSION]).trim());
  } catch (error) {
    console.log(`stop reported: ${error.message}`);
  }

  const manifestPath = path.join(LAB, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('BLOCKED: remote manifest never retrieved');
    process.exit(4);
  }
  const remote = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const outcomes = [];
  for (const segment of SEGMENTS) {
    for (const provider of PROVIDERS) {
      const request = {
        jobId: 'b9-25', segmentId: segment.segmentId, text: segment.text,
        language: provider.language, config: provider,
      };
      const job = contract.createJobRecord(request);
      job.lifecycle = contract.LIFECYCLE.RUNNING;
      const entry = remote.results.find(
        (result) => result.segment_id === segment.segmentId && result.provider === provider.provider);
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
        job.failure = { classification: 'ARTIFACT_VALIDATION', message: report.errors.join('; '), errors: report.errors };
        outcomes.push({ job, ok: false, report });
        continue;
      }
      job.lifecycle = contract.LIFECYCLE.SUCCEEDED;
      job.quality = contract.QUALITY.NOT_ASSESSED;
      outcomes.push({ job, ok: true, report });
    }
  }
  const passed = outcomes.filter((entry) => entry.ok).length;
  for (const { job, ok, report } of outcomes) {
    if (ok) {
      console.log(`PASS ${job.provider} ${job.segmentId} sha256=${job.artifact.sha256.slice(0, 12)}… ` +
        `${report.measurements.durationSeconds}s @${report.measurements.sampleRate}Hz`);
    } else {
      console.log(`FAIL ${job.provider} ${job.segmentId} ${job.failure.classification}: ${job.failure.message}`);
    }
  }
  console.log(`\n${passed}/${outcomes.length} technically validated`);
  fs.writeFileSync(path.join(LAB, 'local-summary.json'), JSON.stringify({
    session: SESSION,
    remoteTerminal: terminal,
    remoteOverall: remote.overall_status,
    passed,
    total: outcomes.length,
    artifacts: outcomes.filter((entry) => entry.ok).map(({ job }) => ({
      provider: job.provider,
      segmentId: job.segmentId,
      textSha256: job.textSha256,
      audioSha256: job.artifact.sha256,
    })),
  }, null, 2));
  console.log(`remote overall: ${remote.overall_status} (${remote.succeeded}/${remote.expected})`);
  process.exit(passed === outcomes.length ? 0 : 2);
})().catch((error) => {
  console.error(`monitor failure: ${error && error.message}`);
  process.exit(1);
});
