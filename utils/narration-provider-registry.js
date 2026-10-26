/**
 * Narration provider registry.
 *
 * Adapters register a capability descriptor and an execution function.
 * The domain layer only ever sees the shared contract — providers are
 * interchangeable at this boundary and may be faked in tests.
 */

'use strict';

const { LIFECYCLE } = require('./narration-contract');

class ProviderRegistry {
  constructor(options = {}) {
    this.providers = new Map();
    this.logger = options.logger || { info() {}, warn() {}, error() {} };
  }

  /**
   * @param {object} descriptor
   * @param {string} descriptor.id            stable provider id, e.g. 'kokoro-82m'
   * @param {string} descriptor.modelId       provider-side model identifier
   * @param {object} descriptor.capabilities  { sampleRate, channels, voices, languages, remoteOnly }
   * @param {Function} descriptor.execute     (job, context) => Promise<ExecutionResult>
   */
  register(descriptor) {
    if (!descriptor || typeof descriptor.id !== 'string' || !descriptor.id) {
      throw new Error('provider descriptor requires a non-empty id');
    }
    if (typeof descriptor.execute !== 'function') {
      throw new Error(`provider ${descriptor.id} requires an execute function`);
    }
    this.providers.set(descriptor.id, {
      id: descriptor.id,
      modelId: descriptor.modelId || null,
      capabilities: descriptor.capabilities || {},
      execute: descriptor.execute,
    });
    return descriptor.id;
  }

  has(id) {
    return this.providers.has(id);
  }

  get(id) {
    const provider = this.providers.get(id);
    if (!provider) {
      const error = new Error(`unknown narration provider: ${id} (registered: ${this.list().join(', ') || 'none'})`);
      error.code = 'UNKNOWN_NARRATION_PROVIDER';
      throw error;
    }
    return provider;
  }

  list() {
    return [...this.providers.keys()].sort();
  }
}

/**
 * Executes one contract job through a registered provider.
 *
 * Deliberately thin: job creation, validation, lifecycle transitions and
 * failure classification all live in the shared contract so both adapters
 * and every test observe identical behaviour.
 */
class NarrationExecutor {
  constructor(registry, options = {}) {
    this.registry = registry;
    this.validateAudio = options.validateAudio;
    this.artifactStore = options.artifactStore;
    this.now = options.now || (() => new Date().toISOString());
    this.logger = options.logger || { info() {}, warn() {}, error() {} };
  }

  async execute(job) {
    if (!job || typeof job !== 'object') throw new Error('job is required');
    if (job.lifecycle !== LIFECYCLE.QUEUED) {
      const error = new Error(`job must be QUEUED before execution (current: ${job.lifecycle})`);
      error.code = 'INVALID_NARRATION_LIFECYCLE';
      throw error;
    }
    const provider = this.registry.get(job.provider);
    job.lifecycle = LIFECYCLE.RUNNING;
    job.startedAt = this.now();
    job.updatedAt = job.startedAt;

    try {
      const outcome = await provider.execute(job, { executor: this });
      return this.attachOutcome(job, outcome);
    } catch (error) {
      return this.attachFailure(job, error);
    }
  }

  attachOutcome(job, outcome) {
    if (!outcome || typeof outcome !== 'object') {
      return this.attachFailure(job, new Error('provider returned no structured outcome'));
    }
    if (outcome.cancelled) {
      job.lifecycle = LIFECYCLE.CANCELLED;
      job.completedAt = this.now();
      job.updatedAt = job.completedAt;
      job.failure = { classification: 'CANCELLED', message: outcome.message || 'cancelled' };
      return { job, ok: false, cancelled: true };
    }
    if (!outcome.audio || !Buffer.isBuffer(outcome.audio.buffer)) {
      return this.attachFailure(job, new Error(outcome && outcome.error
        ? String(outcome.error)
        : 'provider did not return an audio artifact buffer'));
    }

    const audioBytes = outcome.audio.buffer;
    const artifact = {
      format: outcome.audio.format || 'wav',
      sampleRate: outcome.audio.sampleRate || null,
      channels: outcome.audio.channels || null,
      durationSeconds: outcome.audio.durationSeconds || null,
      sha256: require('./narration-contract').sha256Hex(audioBytes),
      sizeBytes: audioBytes.length,
      remotePath: outcome.audio.remotePath || null,
    };
    if (outcome.audio.expectedSha256 && outcome.audio.expectedSha256 !== artifact.sha256) {
      return this.attachFailure(job, new Error(
        `artifact hash mismatch: produced ${artifact.sha256}, expected ${outcome.audio.expectedSha256}`),
      );
    }
    job.artifact = artifact;
    job.execution = outcome.execution || null;
    job.completedAt = this.now();
    job.updatedAt = job.completedAt;

    const validation = this.validateAudio
      ? this.validateAudio(audioBytes, { expectedSampleRate: artifact.sampleRate || undefined })
      : null;
    if (!validation || validation.technicalValidation !== 'PASS') {
      job.lifecycle = LIFECYCLE.FAILED;
      job.technicalValidation = 'FAIL';
      job.quality = 'REJECTED';
      job.failure = {
        classification: 'ARTIFACT_VALIDATION',
        message: 'generated artifact failed technical validation',
        errors: validation ? validation.errors : ['no validator supplied'],
      };
      this.logger.warn(`narration artifact failed technical validation for ${job.jobId}/${job.segmentId}`);
      return { job, ok: false, validation };
    }

    job.lifecycle = LIFECYCLE.SUCCEEDED;
    job.technicalValidation = 'PASS';
    job.quality = 'NOT_ASSESSED';
    job.failure = null;
    if (this.artifactStore) {
      const stored = this.artifactStore.write(job.segmentId, audioBytes, `.${artifact.format}`);
      job.artifact.storedPath = stored.relative;
    }
    this.logger.info(`narration job ${job.jobId}/${job.segmentId} succeeded (sha256=${artifact.sha256.slice(0, 12)}…)`);
    return { job, ok: true, validation };
  }

  attachFailure(job, error) {
    job.lifecycle = LIFECYCLE.FAILED;
    job.completedAt = this.now();
    job.updatedAt = job.completedAt;
    job.failure = {
      classification: String((error && error.code) || 'PROVIDER_ERROR'),
      message: String((error && error.message) || error),
    };
    this.logger.error(`narration job ${job.jobId}/${job.segmentId} failed: ${job.failure.classification} ${job.failure.message}`);
    return { job, ok: false, error };
  }
}

module.exports = { ProviderRegistry, NarrationExecutor };
