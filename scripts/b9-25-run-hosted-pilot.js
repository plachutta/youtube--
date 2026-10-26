#!/usr/bin/env node
/**
 * B9.25 hosted pilot runner (local side).
 *
 * Responsibilities, in order:
 *   1. confirm no hosted session/workload is already active;
 *   2. build one contract record per (segment, provider) — no hosted call;
 *   3. submit the hosted runner to a fresh named Colab session;
 *   4. poll for the remote terminal marker, downloading artifacts as soon
 *      as they appear (a lost session must never cost us the results);
 *   5. release the session and verify it is terminal.
 *
 * Model inference happens ONLY inside the hosted runtime. This file never
 * loads a provider and never generates audio locally.
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const contract = require('../utils/narration-contract');
const validation = require('../utils/narration-audio-validation');

const SCRIPT = path.join(__dirname, '..', 'B9.25_hosted_pilot.py');
const SESSION = process.env.B925_SESSION || 'b925-pilot-20261013';
const GPU = process.env.B925_GPU || 'T4';
const POLL_INTERVAL_MS = Number(process.env.B925_POLL_MS || 30000);
const MAX_POLLS = Number(process.env.B925_MAX_POLLS || 90);

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
  return execFileSync('colab', args, { encoding: 'utf8', timeout: 180000 });
}

function activeSessions() {
  try {
    const out = colab(['sessions']);
    const names = out.split('\n').map((line) => line.trim()).filter(Boolean)
      .filter((line) => !line.startsWith('[colab]'));
    return names;
  } catch (error) {
    return [];
  }
}

function plan() {
  const jobs = [];
  for (const segment of SEGMENTS) {
    for (const provider of PROVIDERS) {
      const request = {
        jobId: 'b9-25',
        segmentId: segment.segmentId,
        text: segment.text,
        language: provider.language,
        config: provider,
      };
      contract.assertValidContractRequest(request);
      jobs.push({ request, record: contract.createJobRecord(request) });
    }
  }
  return jobs;
}

async function waitForRemoteCompletion(localDir) {
  let lastSnapshot = null;
  for (let poll = 0; poll < MAX_POLLS; poll += 1) {
    let listing = '';
    try {
      listing = colab(['ls', '-s', SESSION, '/content/b9_25_pilot']);
    } catch (error) {
      console.log(`  poll ${poll}: remote directory not readable yet`);
    }
    if (listing) {
      // Retrieve results eagerly: a dropped session must not cost progress.
      for (const line of listing.split('\n').map((entry) => entry.trim()).filter(Boolean)) {
        if (line.startsWith('[colab]')) continue;
        const remote = `/content/b9_25_pilot/${line}`;
        const local = path.join(localDir, line);
        try {
          colab(['download', '-s', SESSION, remote, local]);
        } catch (error) {
          console.log(`  could not download ${line}: ${error.message}`);
        }
      }
      const statusFile = path.join(localDir, 'STATUS.txt');
      if (fs.existsSync(statusFile)) {
        const status = fs.readFileSync(statusFile, 'utf8').trim();
        if (status.startsWith('DONE')) return { done: true, status };
      }
      lastSnapshot = listing.split('\n').filter((line) => line.endsWith('.wav')).length;
      console.log(`  poll ${poll}: ${lastSnapshot} remote wav file(s) retrieved`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return { done: false, status: `no terminal marker after ${MAX_POLLS} polls` };
}

function validateLocally(localDir, remoteManifest) {
  const outcomes = [];
  for (const segment of SEGMENTS) {
    for (const provider of PROVIDERS) {
      const request = {
        jobId: 'b9-25',
        segmentId: segment.segmentId,
        text: segment.text,
        language: provider.language,
        config: provider,
      };
      const job = contract.createJobRecord(request);
      job.lifecycle = contract.LIFECYCLE.RUNNING;
      const entry = remoteManifest.results.find(
        (result) => result.segment_id === segment.segmentId && result.provider === provider.provider);
      if (!entry) {
        job.lifecycle = contract.LIFECYCLE.FAILED;
        job.failure = { classification: 'MISSING_REMOTE_RESULT', message: 'no result reported by the hosted run' };
        outcomes.push({ job, ok: false });
        continue;
      }
      const localFile = path.join(localDir, path.basename(entry.audio_path || ''));
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
  return outcomes;
}

(async () => {
  console.log(`session=${SESSION} gpu=${GPU}`);

  // 1. no conflicting hosted workload
  const active = activeSessions();
  if (active.length) {
    console.error(`BLOCKED: existing active session(s) detected: ${active.join(', ')}`);
    console.error('Resolve the earlier workload before submitting a new one.');
    process.exit(3);
  }

  // 2/3. build contract records and submit
  const jobs = plan();
  for (const { record } of jobs) {
    console.log(`QUEUED ${record.provider} ${record.segmentId} sha256=${record.textSha256.slice(0, 12)}…`);
  }
  console.log('submitting hosted runner…');
  let created;
  try {
    created = colab(['new', '-s', SESSION, '--gpu', GPU]);
  } catch (error) {
    console.error(`BLOCKED: session allocation failed: ${error.message}`);
    process.exit(3);
  }
  console.log(created.trim());

  let submitted;
  try {
    submitted = execFileSync('colab', ['exec', '-s', SESSION, '-f', SCRIPT, '--timeout', '600'],
      { encoding: 'utf8', timeout: 700000 });
    console.log(submitted.trim().split('\n').slice(-6).join('\n'));
  } catch (error) {
    // A timeout here is UNCERTAIN, not a failure: the hosted job may still be running.
    console.log(`hosted submission returned uncertain status: ${error.message}`);
  }

  // 4. poll and retrieve eagerly
  const labRoot = '/home/gachiemeshackson/Videos/agenttube-reference-lab/hosted-runs/b9-25-pilot';
  fs.mkdirSync(labRoot, { recursive: true });
  const { done, status } = await waitForRemoteCompletion(labRoot);
  console.log(`remote terminal marker: ${status}`);

  // 5. release the session
  try {
    console.log(colab(['stop', '-s', SESSION]).trim());
  } catch (error) {
    console.log(`session stop reported: ${error.message}`);
  }

  // Validate through the shared contract, locally, with no model involved.
  const manifestPath = path.join(labRoot, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('BLOCKED: remote manifest was never retrieved');
    process.exit(4);
  }
  const remote = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const outcomes = validateLocally(labRoot, remote);
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
  const accepted = outcomes.filter(({ job }) => {
    try {
      contract.assertEligibleForDownstream(job, { requireHumanAccepted: true });
      return true;
    } catch (error) {
      return false;
    }
  }).length;
  console.log(`${accepted} human-accepted and downstream-eligible (expected 0: human review is pending)`);

  const summary = {
    session: SESSION,
    remoteTerminal: status,
    remoteOverall: remote.overall_status,
    passed,
    total: outcomes.length,
    artifacts: outcomes.filter((entry) => entry.ok).map(({ job }) => ({
      provider: job.provider,
      segmentId: job.segmentId,
      textSha256: job.textSha256,
      audioSha256: job.artifact.sha256,
    })),
  };
  fs.writeFileSync(path.join(labRoot, 'local-summary.json'), JSON.stringify(summary, null, 2));
  process.exit(passed === outcomes.length && done ? 0 : 2);
})().catch((error) => {
  console.error(`unexpected failure: ${error && error.message}`);
  process.exit(1);
});
