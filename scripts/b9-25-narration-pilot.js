#!/usr/bin/env node
/**
 * B9.25 local orchestration entry point.
 *
 * This layer knows the shared narration contract and nothing else. It never
 * touches provider-specific Python APIs: it submits the hosted runner and
 * then validates the returned artifacts through the shared contract.
 *
 * Usage:
 *   node scripts/b9-25-narration-pilot.js --exec colab --dry-run
 *   node scripts/b9-25-narration-pilot.js --exec colab --session b925-pilot
 *   node scripts/b9-25-narration-pilot.js --collect <download-dir>
 *
 * No model inference ever happens here.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const contract = require('../utils/narration-contract');
const validation = require('../utils/narration-audio-validation');
const registryModule = require('../utils/narration-provider-registry');
const adapters = require('../utils/narration-provider-adapters');
const retryModule = require('../utils/narration-retry-policy');
const hosted = require('../utils/narration-hosted-executor');

const { ProviderRegistry, NarrationExecutor } = registryModule;
const { RetryPolicy } = retryModule;

const SEGMENTS = [
  {
    segmentId: 'b9-25-seg-a',
    text: 'Kokoro and Qwen produce different voices. We compare them side by side.',
  },
  {
    segmentId: 'b9-25-seg-b',
    text: 'Reliable narration keeps viewers watching to the end of the video.',
  },
  {
    segmentId: 'b9-25-seg-c',
    text: 'Every artifact carries its hash, so any later change stays detectable.',
  },
];

const PROVIDER_CONFIGS = [
  {
    provider: 'kokoro-82m',
    modelId: 'hexgrad/Kokoro-82M',
    modelRevision: 'dfb907a02bba8152ca444717ca5d78747ccb4bec',
    voice: 'af_heart',
    language: 'english',
    settings: { remoteOnly: true },
  },
  {
    provider: 'qwen3-tts-customvoice',
    modelId: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice',
    modelRevision: '85e237c12c027371202489a0ec509ded67b5e4b5',
    voice: 'ryan',
    language: 'english',
    settings: { dtype: 'torch.float32', attnImplementation: 'sdpa', remoteOnly: true },
  },
];

/**
 * Remote artifacts are validated locally through the shared contract. This
 * is the only way a hosted result enters the application: a manifest claim
 * alone is never sufficient.
 */
function validateRemoteResult(remoteManifest, segment, providerConfig, downloadDir) {
  const request = {
    jobId: 'b9-25',
    segmentId: segment.segmentId,
    text: segment.text,
    language: providerConfig.language,
    config: providerConfig,
  };
  const job = contract.createJobRecord(request);

  const entry = remoteManifest.results.find(
    (result) => result.segment_id === segment.segmentId && result.provider === providerConfig.provider);
  if (!entry) {
    job.lifecycle = contract.LIFECYCLE.FAILED;
    job.failure = { classification: 'MISSING_REMOTE_RESULT', message: 'no result reported by the hosted run' };
    return { job, ok: false };
  }
  job.lifecycle = contract.LIFECYCLE.RUNNING;

  if (entry.text_sha256_actual !== job.textSha256) {
    job.lifecycle = contract.LIFECYCLE.FAILED;
    job.failure = {
      classification: 'INPUT_HASH_MISMATCH',
      message: `remote text hash ${entry.text_sha256_actual} does not match ${job.textSha256}`,
    };
    return { job, ok: false };
  }
  if (!entry.audio_path || !fs.existsSync(path.join(downloadDir, path.basename(entry.audio_path)))) {
    job.lifecycle = contract.LIFECYCLE.FAILED;
    job.failure = { classification: 'ARTIFACT_RETRIEVAL_FAILED', message: `remote artifact missing locally: ${entry.audio_path}` };
    return { job, ok: false };
  }
  const bytes = fs.readFileSync(path.join(downloadDir, path.basename(entry.audio_path)));
  const localHash = contract.sha256Hex(bytes);
  if (entry.audio_sha256 && entry.audio_sha256 !== localHash) {
    job.lifecycle = contract.LIFECYCLE.FAILED;
    job.failure = {
      classification: 'ARTIFACT_HASH_MISMATCH',
      message: `downloaded artifact ${localHash} does not match remote ${entry.audio_sha256}`,
    };
    return { job, ok: false };
  }

  job.artifact = {
    format: path.extname(entry.audio_path).slice(1),
    sampleRate: entry.measurements ? entry.measurements.sample_rate : null,
    channels: entry.measurements ? entry.measurements.channels : null,
    durationSeconds: entry.measurements ? entry.measurements.duration_seconds : null,
    sha256: localHash,
    sizeBytes: bytes.length,
  };

  const report = validation.validateNarrationAudio(bytes, {
    expectedSampleRate: providerConfig.settings && providerConfig.settings.expectedSampleRate,
  });
  job.technicalValidation = report.technicalValidation;
  job.completedAt = new Date().toISOString();
  if (report.technicalValidation !== contract.TECHNICAL.PASS) {
    job.lifecycle = contract.LIFECYCLE.FAILED;
    job.quality = contract.QUALITY.REJECTED;
    job.failure = {
      classification: 'ARTIFACT_VALIDATION',
      message: 'artifact failed the shared technical contract',
      errors: report.errors,
    };
    return { job, ok: false, validation: report };
  }
  job.lifecycle = contract.LIFECYCLE.SUCCEEDED;
  job.quality = contract.QUALITY.NOT_ASSESSED;
  return { job, ok: true, validation: report };
}

/**
 * Fake hosted executor for the local dry-run path. It never reaches a GPU
 * and never claims a remote execution happened.
 */
function dryRunExecutor() {
  const registry = new ProviderRegistry();
  const calls = [];
  const makeExecute = (providerId) => (request) => {
    calls.push({ provider: providerId, segmentId: request.segmentId });
    throw Object.assign(new Error('dry-run: no hosted runtime contacted'), { code: 'DRY_RUN' });
  };
  registry.register(adapters.fakeAdapter({ id: 'kokoro-82m', modelId: 'hexgrad/Kokoro-82M', execute: makeExecute('kokoro-82m') }));
  registry.register(adapters.fakeAdapter({ id: 'qwen3-tts-customvoice', modelId: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice', execute: makeExecute('qwen3-tts-customvoice') }));
  return { registry, calls };
}

function planJobs() {
  const jobs = [];
  for (const segment of SEGMENTS) {
    for (const config of PROVIDER_CONFIGS) {
      jobs.push({
        request: {
          jobId: 'b9-25',
          segmentId: segment.segmentId,
          text: segment.text,
          language: config.language,
          config,
        },
      });
    }
  }
  return jobs;
}

function main(argv) {
  const args = argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const collectIndex = args.indexOf('--collect');

  const jobs = planJobs();
  console.log(`narration pilot: ${jobs.length} jobs (${SEGMENTS.length} segments x ${PROVIDER_CONFIGS.length} providers)`);

  if (dryRun) {
    const { registry, calls } = dryRunExecutor();
    const executor = new NarrationExecutor(registry);
    let blocked = 0;
    for (const job of jobs) {
      const record = contract.createJobRecord(job.request);
      contract.assertValidContractRequest(job.request);
      console.log(`QUEUED ${record.provider} ${record.segmentId} sha256=${record.textSha256.slice(0, 12)}…`);
      void executor;
      blocked += 1;
    }
    console.log(`dry-run complete: ${blocked} contract records built, ${calls.length} hosted submissions (expected 0)`);
    console.log('no model inference was contacted; no hosted session was created');
    return 0;
  }

  if (collectIndex >= 0) {
    const downloadDir = args[collectIndex + 1];
    const manifestPath = path.join(downloadDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      console.error(`remote manifest not found: ${manifestPath}`);
      return 1;
    }
    const remote = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const results = [];
    for (const segment of SEGMENTS) {
      for (const config of PROVIDER_CONFIGS) {
        const { job, ok, validation: report } = validateRemoteResult(remote, segment, config, downloadDir);
        results.push({ job, ok });
        const status = ok ? 'PASS' : `FAIL(${job.failure.classification})`;
        console.log(`${status} ${job.provider} ${job.segmentId} sha256=${job.artifact ? job.artifact.sha256.slice(0, 12) + '…' : 'none'}`);
        if (ok && report) {
          console.log(`      ${report.measurements.durationSeconds}s @ ${report.measurements.sampleRate}Hz ch=${report.measurements.channels} peak=${report.measurements.peak} rms=${report.measurements.rms}`);
        }
      }
    }
    const passed = results.filter((entry) => entry.ok).length;
    console.log(`\n${passed}/${results.length} jobs technically validated; ${results.length - passed} failed`);
    // A successful remote run alone never authorises downstream use.
    const eligible = results.filter(({ job }) => {
      try {
        contract.assertEligibleForDownstream(job, { requireHumanAccepted: true });
        return true;
      } catch (error) {
        return false;
      }
    }).length;
    console.log(`${eligible} jobs are human-accepted and therefore downstream-eligible`);
    return passed === results.length ? 0 : 2;
  }

  console.error('nothing to do: pass --dry-run or --collect <download-dir>');
  return 1;
}

process.exit(main(process.argv) || 0);
