/**
 * Configurable retry policy for remote narration jobs.
 *
 * Distinguishes transient failures (retryable within a bounded budget)
 * from deterministic configuration failures (never auto-retried without a
 * justified correction). A timeout or lost connection is *uncertain*, not
 * a failure: the caller must reconcile the remote execution state before
 * deciding to retry, so this policy explicitly refuses to classify those
 * as a plain failure.
 */

'use strict';

const DEFAULT_TRANSIENT_CODES = Object.freeze([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'ENETUNREACH',
  'EAI_AGAIN',
  'REMOTE_TRANSIENT',
  'RATE_LIMITED',
]);

const DEFAULT_TRANSIENT_HTTP = Object.freeze([408, 425, 429]);

const UNCERTAIN_CODES = Object.freeze([
  'REMOTE_STATUS_UNKNOWN',
  'REMOTE_TIMEOUT',
  'CONNECTION_LOST',
  'RECONCILE_REQUIRED',
]);

const NEVER_RETRY_CODES = Object.freeze([
  'UNKNOWN_NARRATION_PROVIDER',
  'INVALID_NARRATION_REQUEST',
  'INVALID_NARRATION_LIFECYCLE',
  'INVALID_LIFECYCLE_TRANSITION',
  'UNSAFE_ARTIFACT_PATH',
  'UNSUPPORTED_ARTIFACT_FORMAT',
  'LOCAL_INFERENCE_FORBIDDEN',
  'ARTIFACT_VALIDATION',
  'ARTIFACT_HASH_MISMATCH',
  'CANCELLED',
]);

class RetryPolicy {
  constructor(options = {}) {
    this.maxAttempts = Math.max(1, Number(options.maxAttempts || 2));
    this.transientCodes = new Set(options.transientCodes || DEFAULT_TRANSIENT_CODES);
    this.transientHttp = new Set(options.transientHttp || DEFAULT_TRANSIENT_HTTP);
    this.uncertainCodes = new Set(options.uncertainCodes || UNCERTAIN_CODES);
    this.neverRetry = new Set(options.neverRetry || NEVER_RETRY_CODES);
  }

  /** An ambiguous remote outcome must never be treated as a definite failure. */
  isUncertain(error) {
    const code = String((error && error.code) || (error && error.failure && error.failure.classification) || '');
    return this.uncertainCodes.has(code);
  }

  isRetryable(error) {
    const code = String((error && error.code) || (error && error.failure && error.failure.classification) || '');
    if (this.isUncertain(error)) return false;
    if (this.neverRetry.has(code)) return false;
    if (this.transientCodes.has(code)) return true;
    const status = Number((error && error.status) || (error && error.statusCode) || 0);
    if (this.transientHttp.has(status)) return true;
    if (status >= 500) return true;
    return false;
  }

  /**
   * Decide whether another attempt is allowed.
   *
   * @param {object} params
   * @param {number} params.attemptsMade  attempts already consumed
   * @param {Error}   params.error         last error
   * @param {boolean} [params.reconciled]  whether the remote state was reconciled
   */
  decide({ attemptsMade, error, reconciled = true }) {
    if (this.isUncertain(error)) {
      return {
        retry: false,
        reason: 'remote execution status is uncertain; reconcile the hosted job before any retry',
        requiresReconciliation: true,
      };
    }
    if (attemptsMade >= this.maxAttempts) {
      return { retry: false, reason: `retry budget exhausted (${attemptsMade}/${this.maxAttempts})` };
    }
    if (!this.isRetryable(error)) {
      return { retry: false, reason: `deterministic failure ${String(error && error.code)}; a justified correction is required before retrying` };
    }
    if (!reconciled) {
      return { retry: false, reason: 'remote state not reconciled', requiresReconciliation: true };
    }
    return { retry: true, reason: 'transient failure within retry budget', attemptsRemaining: this.maxAttempts - attemptsMade };
  }
}

module.exports = { RetryPolicy, DEFAULT_TRANSIENT_CODES, UNCERTAIN_CODES, NEVER_RETRY_CODES };
