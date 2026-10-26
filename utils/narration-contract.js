#!/usr/bin/env node
/**
 * Narration provider contract — versioned, deterministic, offline.
 *
 * This module is the single shared contract between the AgentTube
 * narration domain and any TTS provider adapter. It contains no
 * provider-specific imports: Kokoro and Qwen runtime dependencies stay
 * behind their adapters.
 *
 * Lifecycle states are deliberately layered and must never be collapsed:
 *
 *   generation status      -> did code run?
 *   technical validation    -> does the artifact meet the media contract?
 *   audio quality status    -> has a human listened and accepted it?
 *
 * Generation SUCCEEDED never implies technical validation. Technical
 * validation never implies HUMAN_ACCEPTED.
 */

'use strict';

const crypto = require('crypto');
const path = require('path');

const CONTRACT_VERSION = '1.0.0';

const LIFECYCLE = Object.freeze({
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

const QUALITY = Object.freeze({
  NOT_ASSESSED: 'NOT_ASSESSED',
  TECHNICALLY_VALIDATED: 'TECHNICALLY_VALIDATED',
  REJECTED: 'REJECTED',
  HUMAN_ACCEPTED: 'HUMAN_ACCEPTED',
});

const TECHNICAL = Object.freeze({
  NOT_RUN: 'NOT_RUN',
  PASS: 'PASS',
  FAIL: 'FAIL',
});

const CONFIG_KEYS = Object.freeze([
  'provider',
  'modelId',
  'modelRevision',
  'voice',
  'language',
  'settings',
]);

const REQUIRED_INPUT_FIELDS = Object.freeze([
  'jobId',
  'segmentId',
  'text',
]);

const SAFE_SEGMENT_ID = /^[A-Za-z0-9._-]{1,128}$/;
const SAFE_JOB_ID = /^[A-Za-z0-9._-]{1,128}$/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function textSha256(text) {
  return crypto.createHash('sha256').update(String(text === undefined || text === null ? '' : text), 'utf8').digest('hex');
}

/**
 * Canonical JSON serialization for fingerprinting. Object keys are sorted
 * so two structurally identical configurations always hash identically.
 */
function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * A provider configuration fingerprint. Any change to a field that
 * materially changes the produced audio invalidates artifacts produced
 * under the old fingerprint.
 */
function configFingerprint(config) {
  const normalized = {};
  for (const key of CONFIG_KEYS) {
    if (config && config[key] !== undefined && config[key] !== null) {
      normalized[key] = config[key];
    }
  }
  return sha256Hex(Buffer.from(canonicalize(normalized), 'utf8'));
}

/**
 * Full request fingerprint: text + provider configuration. This is the
 * identity an artifact is cached under.
 */
function requestFingerprint(request) {
  const validation = validateContractRequest(request);
  if (!validation.valid) {
    const error = new Error(`invalid narration contract request: ${validation.errors.join(' ')}`);
    error.code = 'INVALID_NARRATION_REQUEST';
    throw error;
  }
  return sha256Hex(Buffer.from(
    canonicalize({
      contractVersion: CONTRACT_VERSION,
      textSha256: textSha256(request.text),
      config: normalizeConfig(request.config),
    }),
    'utf8'
  ));
}

function normalizeConfig(config) {
  const normalized = {};
  for (const key of CONFIG_KEYS) {
    if (config && config[key] !== undefined && config[key] !== null) {
      normalized[key] = config[key];
    }
  }
  return normalized;
}

function validateContractRequest(request) {
  const errors = [];

  if (!isPlainObject(request)) {
    return { valid: false, errors: ['request must be an object'] };
  }
  if (request.contractVersion !== undefined && request.contractVersion !== CONTRACT_VERSION) {
    errors.push(`contractVersion must be ${CONTRACT_VERSION} (received ${request.contractVersion})`);
  }
  for (const field of REQUIRED_INPUT_FIELDS) {
    if (request[field] === undefined || request[field] === null || request[field] === '') {
      errors.push(`${field} is required`);
    }
  }
  if (request.jobId !== undefined && !SAFE_JOB_ID.test(String(request.jobId))) {
    errors.push('jobId must match ^[A-Za-z0-9._-]{1,128}$ (path traversal / injection guard)');
  }
  if (request.segmentId !== undefined && !SAFE_SEGMENT_ID.test(String(request.segmentId))) {
    errors.push('segmentId must match ^[A-Za-z0-9._-]{1,128}$ (path traversal / injection guard)');
  }
  if (request.text !== undefined && (typeof request.text !== 'string' || request.text.trim() === '')) {
    errors.push('text must be a non-empty string');
  }
  if (request.language !== undefined && !isNonEmptyString(request.language)) {
    errors.push('language must be a non-empty string when present');
  }
  if (request.config !== undefined) {
    if (!isPlainObject(request.config)) {
      errors.push('config must be an object when present');
    } else if (!isNonEmptyString(request.config.provider)) {
      errors.push('config.provider is required');
    }
  } else {
    errors.push('config is required');
  }

  return { valid: errors.length === 0, errors, value: request };
}

function assertValidContractRequest(request) {
  const result = validateContractRequest(request);
  if (!result.valid) {
    const error = new Error(result.errors.join(' '));
    error.code = 'INVALID_NARRATION_REQUEST';
    throw error;
  }
  return result;
}

/**
 * Build a QUEUED job record. All mutable state is initialised here so no
 * later stage can implicitly upgrade a status.
 */
function createJobRecord(request, overrides = {}) {
  assertValidContractRequest(request);
  const now = overrides.createdAt || new Date().toISOString();
  return {
    contractVersion: CONTRACT_VERSION,
    jobId: request.jobId,
    segmentId: request.segmentId,
    text: request.text,
    textSha256: textSha256(request.text),
    language: request.language || null,
    provider: request.config.provider,
    modelId: request.config.modelId || null,
    modelRevision: request.config.modelRevision || null,
    voice: request.config.voice || null,
    settings: isPlainObject(request.config.settings) ? request.config.settings : {},
    configFingerprint: configFingerprint(request.config),
    requestFingerprint: requestFingerprint(request),
    lifecycle: LIFECYCLE.QUEUED,
    technicalValidation: TECHNICAL.NOT_RUN,
    quality: QUALITY.NOT_ASSESSED,
    execution: null,
    artifact: null,
    failure: null,
    createdAt: now,
    updatedAt: now,
  };
}

function canTransition(from, to) {
  const allowed = {
    QUEUED: new Set([LIFECYCLE.RUNNING, LIFECYCLE.CANCELLED, LIFECYCLE.FAILED]),
    RUNNING: new Set([LIFECYCLE.SUCCEEDED, LIFECYCLE.FAILED, LIFECYCLE.CANCELLED]),
    SUCCEEDED: new Set([]),
    FAILED: new Set([]),
    CANCELLED: new Set([]),
  };
  return Boolean(allowed[from] && allowed[from].has(to));
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const error = new Error(`illegal narration lifecycle transition ${from} -> ${to}`);
    error.code = 'INVALID_LIFECYCLE_TRANSITION';
    throw error;
  }
}

/**
 * The single gate every downstream consumer must call. A record cannot be
 * consumed while its quality status is REJECTED, and generation success
 * alone is never enough.
 */
function assertEligibleForDownstream(job, options = {}) {
  if (!isPlainObject(job)) {
    const error = new Error('narration job record must be an object');
    error.code = 'INVALID_NARRATION_JOB';
    throw error;
  }
  if (job.quality === QUALITY.REJECTED) {
    const error = new Error('narration artifact is REJECTED and is not eligible for downstream use');
    error.code = 'NARRATION_REJECTED';
    throw error;
  }
  if (job.lifecycle !== LIFECYCLE.SUCCEEDED) {
    const error = new Error(`narration job is not SUCCEEDED (current: ${job.lifecycle})`);
    error.code = 'NARRATION_NOT_SUCCEEDED';
    throw error;
  }
  if (options.requireTechnicalValidation !== false && job.technicalValidation !== TECHNICAL.PASS) {
    const error = new Error(`technical validation is not PASS (current: ${job.technicalValidation})`);
    error.code = 'NARRATION_TECHNICAL_VALIDATION_REQUIRED';
    throw error;
  }
  if (options.requireHumanAccepted && job.quality !== QUALITY.HUMAN_ACCEPTED) {
    const error = new Error(`human audio-quality acceptance is required (current: ${job.quality})`);
    error.code = 'NARRATION_HUMAN_ACCEPTANCE_REQUIRED';
    throw error;
  }
  return job;
}

/**
 * Human acceptance attaches to a specific artifact identity. Re-accepting
 * under a different artifact hash without an explicit policy is refused.
 */
function applyHumanAcceptance(job, decision, options = {}) {
  if (!isPlainObject(job)) throw new Error('narration job record must be an object');
  const artifactHash = job.artifact && job.artifact.sha256;
  const decisionHash = options.expectedArtifactSha256;
  if (artifactHash && decisionHash && artifactHash !== decisionHash) {
    const error = new Error(
      `cannot attach human acceptance: record artifact ${artifactHash} does not match ${decisionHash}`);
    error.code = 'NARRATION_ARTIFACT_IDENTITY_MISMATCH';
    throw error;
  }
  if (job.lifecycle !== LIFECYCLE.SUCCEEDED) {
    const error = new Error('cannot accept an artifact for a job that has not SUCCEEDED');
    error.code = 'NARRATION_NOT_SUCCEEDED';
    throw error;
  }
  const accepted = Boolean(decision);
  job.quality = accepted ? QUALITY.HUMAN_ACCEPTED : QUALITY.REJECTED;
  job.humanReview = {
    decision: accepted ? 'ACCEPTED' : 'REJECTED',
    artifactSha256: artifactHash || (decisionHash || null),
    decidedAt: options.decidedAt || new Date().toISOString(),
    decidedBy: options.decidedBy || null,
    note: options.note || null,
  };
  job.updatedAt = job.humanReview.decidedAt;
  return job;
}

/**
 * Artifact reuse is permitted only when the fingerprint is unchanged AND
 * the previously stored artifact still passes its technical checks.
 */
function canReuseArtifact(existing, request) {
  if (!isPlainObject(existing) || !isPlainObject(request)) return { reusable: false, reason: 'missing record or request' };
  if (existing.quality === QUALITY.REJECTED) {
    return { reusable: false, reason: 'existing artifact is REJECTED' };
  }
  const expectedFingerprint = requestFingerprint(request);
  if (existing.requestFingerprint !== expectedFingerprint) {
    return { reusable: false, reason: 'request fingerprint changed (text or configuration)' };
  }
  if (existing.lifecycle !== LIFECYCLE.SUCCEEDED) {
    return { reusable: false, reason: `existing lifecycle is ${existing.lifecycle}` };
  }
  if (existing.technicalValidation !== TECHNICAL.PASS) {
    return { reusable: false, reason: `technical validation is ${existing.technicalValidation}` };
  }
  if (!existing.artifact || !existing.artifact.sha256) {
    return { reusable: false, reason: 'existing artifact hash is missing' };
  }
  return { reusable: true, reason: null, artifact: existing.artifact };
}

const SUPPORTED_AUDIO_EXTENSIONS = ['.wav', '.mp3', '.flac', '.ogg'];

/** Filesystem-side artifact checks used by both adapters and the tests. */
class NarrationArtifactStore {
  constructor(options = {}) {
    this.root = options.root || path.join(process.cwd(), 'narration-artifacts');
    this.fs = options.fs || require('fs');
  }

  resolveRelativePath(segmentId, extension) {
    if (!SAFE_SEGMENT_ID.test(String(segmentId))) {
      const error = new Error(`unsafe segmentId for artifact path: ${segmentId}`);
      error.code = 'UNSAFE_ARTIFACT_PATH';
      throw error;
    }
    const ext = String(extension || '.wav').toLowerCase();
    if (!SUPPORTED_AUDIO_EXTENSIONS.includes(ext)) {
      const error = new Error(`unsupported artifact extension: ${extension}`);
      error.code = 'UNSUPPORTED_ARTIFACT_FORMAT';
      throw error;
    }
    const relative = `${segmentId}${ext}`;
    const absolute = path.resolve(this.root, relative);
    if (path.dirname(absolute) !== path.resolve(this.root)) {
      const error = new Error(`resolved artifact path escapes the store: ${absolute}`);
      error.code = 'UNSAFE_ARTIFACT_PATH';
      throw error;
    }
    return { relative, absolute };
  }

  read(relative) {
    const { absolute } = this.resolveRelativePath(path.basename(String(relative), path.extname(String(relative))), path.extname(String(relative)));
    const buffer = this.fs.readFileSync(absolute);
    return { bytes: buffer, sha256: sha256Hex(buffer), size: buffer.length, absolute };
  }

  write(segmentId, buffer, extension) {
    const { relative, absolute } = this.resolveRelativePath(segmentId, extension);
    this.fs.mkdirSync(path.dirname(absolute), { recursive: true });
    this.fs.writeFileSync(absolute, buffer);
    return { relative, absolute, sha256: sha256Hex(buffer), size: buffer.length };
  }

  exists(segmentId, extension) {
    try {
      const { absolute } = this.resolveRelativePath(segmentId, extension);
      const stat = this.fs.statSync(absolute);
      return stat.isFile() && stat.size > 0;
    } catch (error) {
      return false;
    }
  }
}

module.exports = {
  CONTRACT_VERSION,
  LIFECYCLE,
  QUALITY,
  TECHNICAL,
  CONFIG_KEYS,
  SUPPORTED_AUDIO_EXTENSIONS,
  textSha256,
  sha256Hex,
  canonicalize,
  configFingerprint,
  requestFingerprint,
  normalizeConfig,
  validateContractRequest,
  assertValidContractRequest,
  createJobRecord,
  canTransition,
  assertTransition,
  assertEligibleForDownstream,
  applyHumanAcceptance,
  canReuseArtifact,
  NarrationArtifactStore,
};
