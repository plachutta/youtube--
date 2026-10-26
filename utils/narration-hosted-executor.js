/**
 * Hosted-runtime executor for narration providers.
 *
 * This is the only place in the narration subsystem that knows about a
 * hosted execution mechanism (Google Colab CLI). It lives behind an
 * infrastructure boundary so the domain contract stays transport-agnostic.
 *
 * Hard guarantees enforced here:
 *   - model inference only ever runs on a hosted runtime;
 *   - a local-inference fallback is refused, not attempted;
 *   - a timeout or lost connection is *uncertain*, never treated as a
 *     definite failure — the remote session state must be reconciled
 *     before any retry;
 *   - a session is only released after its artifacts have been retrieved.
 */

'use strict';

const { hashFileSync, sha256Hex } = require('./narration-contract');

class LocalInferenceForbiddenError extends Error {
  constructor(message) {
    super(message || 'local model inference is forbidden; narration inference must run on a hosted runtime');
    this.code = 'LOCAL_INFERENCE_FORBIDDEN';
  }
}

class RemoteStatusUnknownError extends Error {
  constructor(message) {
    super(message || 'remote execution status is uncertain; reconcile the hosted job before retrying');
    this.code = 'REMOTE_STATUS_UNKNOWN';
  }
}

/**
 * @param {object} options
 * @param {object} options.runtime     transport adapter exposing createSession/runSegmentOnSession/download/stopSession/status
 * @param {boolean} [options.allowLocal=false]  must never be true in production
 */
class HostedNarrationExecutor {
  constructor(options = {}) {
    if (options.allowLocal === true) {
      throw new LocalInferenceForbiddenError(
        'allowLocal is not permitted: a hosted runtime is required for narration inference');
    }
    this.allowLocal = false;
    this.runtime = options.runtime;
    this.logger = options.logger || { info() {}, warn() {}, error() {} };
  }

  assertHosted() {
    if (this.allowLocal) throw new LocalInferenceForbiddenError();
    if (!this.runtime || typeof this.runtime.runSegmentOnSession !== 'function') {
      throw new LocalInferenceForbiddenError('no hosted runtime transport configured');
    }
    return this.runtime;
  }

  async runSegment(request) {
    const runtime = this.assertHosted();
    if (runtime.createSession) {
      await runtime.createSession({ jobId: request.jobId, segmentId: request.segmentId });
    }
    return runtime.runSegmentOnSession(request);
  }
}

/**
 * Colab-backed transport. Every Colab CLI detail is confined to this
 * adapter; nothing above it knows how the code reached the GPU.
 *
 * The `runner` is invoked with the Colab CLI subprocess handlers, keeping
 * this module testable with a fake runner.
 */
class ColabRuntimeTransport {
  constructor(options = {}) {
    this.runner = options.runner;
    this.gpu = options.gpu || 'T4';
    this.sessionPrefix = options.sessionPrefix || 'narration';
    this.logger = options.logger || { info() {}, warn() {}, error() {} };
    this.activeSessions = new Map();
  }

  sessionName(jobId, segmentId) {
    return `${this.sessionPrefix}-${jobId}-${segmentId}`.toLowerCase();
  }

  async createSession({ jobId, segmentId }) {
    const name = this.sessionName(jobId, segmentId);
    if (this.activeSessions.has(name)) return name;
    const created = await this.runner.create({ session: name, gpu: this.gpu });
    if (created && created.ready === false) {
      throw new RemoteStatusUnknownError(`colab session ${name} did not become ready: ${created.detail || 'unknown'}`);
    }
    this.activeSessions.set(name, { name, jobId, segmentId });
    this.logger.info(`hosted session ready: ${name} (gpu=${this.gpu})`);
    return name;
  }

  async runSegmentOnSession(request) {
    const name = this.sessionName(request.jobId, request.segmentId);
    const session = this.activeSessions.get(name);
    if (!session) {
      throw new RemoteStatusUnknownError(`no hosted session recorded for ${name}; refusing to submit without a known session state`);
    }
    let outcome;
    try {
      outcome = await this.runner.execute({
        session: name,
        jobId: request.jobId,
        segmentId: request.segmentId,
        provider: request.provider,
        modelId: request.modelId,
        modelRevision: request.modelRevision,
        voice: request.voice,
        language: request.language,
        settings: request.settings,
        text: request.text,
        textSha256: request.textSha256,
      });
    } catch (error) {
      // A thrown transport error must be classified, never leaked raw.
      const code = String((error && error.code) || 'REMOTE_ERROR');
      if (code === 'REMOTE_TIMEOUT' || code === 'CONNECTION_LOST' || code === 'REMOTE_STATUS_UNKNOWN') {
        throw new RemoteStatusUnknownError(String((error && error.message) || code));
      }
      throw Object.assign(new Error(String((error && error.message) || error)), { code });
    }
    if (outcome.cancelled) {
      this.activeSessions.delete(name);
      return outcome;
    }
    if (outcome.error) {
      const code = String(outcome.error.code || '');
      if (code === 'REMOTE_TIMEOUT' || code === 'CONNECTION_LOST' || code === 'REMOTE_STATUS_UNKNOWN') {
        // Do not release the session: its true state still has to be
        // reconciled, and releasing it could orphan a running GPU job.
        throw new RemoteStatusUnknownError(outcome.error.message);
      }
      throw Object.assign(new Error(outcome.error.message || 'hosted execution failed'), { code: code || 'REMOTE_ERROR' });
    }
    const local = await this.runner.download({
      session: name,
      remotePath: outcome.remotePath,
    });
    if (!local || !local.localPath) {
      throw Object.assign(new Error('hosted artifacts could not be retrieved'), { code: 'ARTIFACT_RETRIEVAL_FAILED' });
    }
    if (outcome.audioSha256 && local.sha256 && outcome.audioSha256 !== local.sha256) {
      throw Object.assign(new Error(
        `downloaded artifact hash mismatch: remote ${outcome.audioSha256}, local ${local.sha256}`), {
        code: 'ARTIFACT_HASH_MISMATCH',
      });
    }
    this.activeSessions.delete(name);
    return {
      ...outcome,
      audioBuffer: local.buffer || null,
      audioSha256: outcome.audioSha256 || (local.sha256 || null),
      sessionId: name,
      executor: 'colab-cli',
    };
  }

  async release(name) {
    if (!this.runner.stop) return;
    await this.runner.stop({ session: name });
    this.activeSessions.delete(name);
  }
}

module.exports = {
  HostedNarrationExecutor,
  ColabRuntimeTransport,
  LocalInferenceForbiddenError,
  RemoteStatusUnknownError,
};
