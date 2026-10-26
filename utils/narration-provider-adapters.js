/**
 * Narration provider adapters.
 *
 * Each adapter owns exactly one provider's execution mechanics. Provider
 * runtime dependencies (Python packages, CLIs, model weights) are invoked
 * only inside the executor each adapter is given — that executor is an
 * infrastructure adapter (hosted runtime), never a local inference path.
 *
 * Nothing in this module imports Kokoro or Qwen Python packages, and no
 * adapter may execute model inference locally: `execute` is always called
 * with a hosted executor that itself enforces the remote-only policy.
 */

'use strict';

const {
  LIFECYCLE,
  QUALITY,
  TECHNICAL,
  CONTRACT_VERSION,
} = require('./narration-contract');

const EXPECTED_SAMPLE_RATE = 24000;
const EXPECTED_CHANNELS = 1;
const DEFAULT_FORMAT = 'wav';

function outcomeFromResult(result) {
  if (!result || typeof result !== 'object') {
    throw Object.assign(new Error('provider executor returned no result'), { code: 'PROVIDER_NO_RESULT' });
  }
  if (result.cancelled) {
    return {
      cancelled: true,
      message: result.reason || 'cancelled',
      execution: result.execution || null,
    };
  }
  if (result.error) {
    throw Object.assign(new Error(String(result.error.message || result.error)), {
      code: String(result.error.code || 'PROVIDER_ERROR'),
    });
  }
  if (!Buffer.isBuffer(result.audioBuffer)) {
    throw Object.assign(
      new Error('provider executor did not return an audio buffer'),
      { code: 'PROVIDER_NO_AUDIO' });
  }
  if (!result.audioSha256) {
    throw Object.assign(
      new Error('provider executor did not report an audio hash'),
      { code: 'PROVIDER_MISSING_HASH' });
  }
  return {
    audio: {
      buffer: result.audioBuffer,
      format: result.format || DEFAULT_FORMAT,
      sampleRate: Number(result.sampleRate) || EXPECTED_SAMPLE_RATE,
      channels: Number(result.channels) || EXPECTED_CHANNELS,
      durationSeconds: result.durationSeconds === undefined ? null : Number(result.durationSeconds),
      remotePath: result.remotePath || null,
      expectedSha256: result.audioSha256,
    },
    execution: {
      provider: null, // filled by the registrar
      executor: result.executor || null,
      sessionId: result.sessionId || null,
      remotePath: result.remotePath || null,
      startedAt: result.startedAt || null,
      completedAt: result.completedAt || null,
      device: result.device || null,
      pythonVersion: result.pythonVersion || null,
      packageVersions: result.packageVersions || null,
      terminalStatus: result.terminalStatus || null,
    },
  };
}

/** Shared execution path: identical for every provider. */
function makeExecute(descriptor, executor) {
  if (!executor || typeof executor.runSegment !== 'function') {
    throw new Error(`provider ${descriptor.id} requires a hosted executor exposing runSegment()`);
  }
  return async function execute(job) {
    const result = await executor.runSegment({
      provider: descriptor.id,
      modelId: job.modelId || descriptor.modelId,
      modelRevision: job.modelRevision || null,
      voice: job.voice,
      language: job.language,
      settings: job.settings,
      text: job.text,
      textSha256: job.textSha256,
      jobId: job.jobId,
      segmentId: job.segmentId,
    });
    const outcome = outcomeFromResult(result);
    if (outcome.execution) {
      outcome.execution.provider = descriptor.id;
      outcome.execution.modelId = job.modelId || descriptor.modelId;
      outcome.execution.modelRevision = job.modelRevision || null;
    }
    return outcome;
  };
}

function kokoroAdapter(executor) {
  const descriptor = {
    id: 'kokoro-82m',
    modelId: 'hexgrad/Kokoro-82M',
    capabilities: {
      sampleRate: EXPECTED_SAMPLE_RATE,
      channels: EXPECTED_CHANNELS,
      format: DEFAULT_FORMAT,
      languages: ['a'],
      voices: ['af_heart'],
      // Engineering fact recorded during B9.24: kokoro 0.9.4 cannot be
      // resolved on Python 3.13 from PyPI because misaki 0.9.4 is capped at
      // <3.13; both packages must be installed from pinned upstream commits.
      pythonConstraint: 'requires misaki installed from git commit fba1236595f2d2bf21d414ba6e57d25256afada3',
      remoteOnly: true,
      pinnedDependencies: {
        kokoro: 'dfb907a02bba8152ca444717ca5d78747ccb4bec',
        misaki: 'fba1236595f2d2bf21d414ba6e57d25256afada3',
      },
    },
  };
  descriptor.execute = makeExecute(descriptor, executor);
  return descriptor;
}

function qwenAdapter(executor) {
  const descriptor = {
    id: 'qwen3-tts-customvoice',
    modelId: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice',
    capabilities: {
      sampleRate: EXPECTED_SAMPLE_RATE,
      channels: EXPECTED_CHANNELS,
      format: DEFAULT_FORMAT,
      languages: ['english'],
      voices: ['aiden', 'dylan', 'eric', 'ono_anna', 'ryan', 'serena', 'sohee', 'uncle_fu', 'vivian'],
      // Engineering fact recorded during B9.19: FP16 triggers a CUDA
      // device-side assertion on Tesla T4; FP32 + SDPA is the qualified
      // configuration.
      pythonConstraint: 'torch.float32 with sdpa attention on Tesla T4',
      remoteOnly: true,
      qualifiedConfiguration: {
        dtype: 'torch.float32',
        attnImplementation: 'sdpa',
        gpu: 'Tesla T4',
        modelRevision: '85e237c12c027371202489a0ec509ded67b5e4b5',
      },
    },
  };
  descriptor.execute = makeExecute(descriptor, executor);
  return descriptor;
}

/**
 * A deterministic fake provider used only by tests. It must never be
 * registered in production: it is the seam that proves the shared
 * interface behaves identically for every provider.
 */
function fakeAdapter(overrides = {}) {
  const descriptor = {
    id: overrides.id || 'fake-tts',
    modelId: overrides.modelId || 'fake/model',
    capabilities: Object.assign(
      {
        sampleRate: EXPECTED_SAMPLE_RATE,
        channels: EXPECTED_CHANNELS,
        format: DEFAULT_FORMAT,
        languages: ['english'],
        voices: ['fake-voice'],
        remoteOnly: true,
        synthetic: true,
      },
      overrides.capabilities || {}
    ),
    // Normalised through the same path as every real adapter so the shared
    // executor observes an identical shape.
    execute: async (job) => outcomeFromResult(await overrides.execute(job)),
  };
  return descriptor;
}

module.exports = {
  EXPECTED_SAMPLE_RATE,
  EXPECTED_CHANNELS,
  DEFAULT_FORMAT,
  kokoroAdapter,
  qwenAdapter,
  fakeAdapter,
  makeExecute,
  outcomeFromResult,
};
