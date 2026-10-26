/**
 * Narration artifact lifecycle contract and validation helpers.
 * Lifecycle states are explicit and fail-closed for protected consumers.
 */
const fs = require('fs');
const path = require('path');

const GENERATION_STATUS = Object.freeze({
  NOT_STARTED: 'NOT_STARTED',
  RUNNING: 'RUNNING',
  PARTIAL: 'PARTIAL',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED',
});

const TECH_VALIDATION_STATUS = Object.freeze({
  NOT_RUN: 'NOT_RUN',
  PASS: 'PASS',
  FAIL: 'FAIL',
  PARTIAL: 'PARTIAL',
});

const AUDIO_QUALITY_STATUS = Object.freeze({
  NOT_ASSESSED: 'NOT_ASSESSED',
  PASS: 'PASS',
  FAIL: 'FAIL',
  REJECTED: 'REJECTED',
});

const EDITORIAL_STATUS = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

const IMPORT_STATUS = Object.freeze({
  NOT_AUTHORIZED: 'NOT_AUTHORIZED',
  AUTHORIZED: 'AUTHORIZED',
  IMPORTING: 'IMPORTING',
  IMPORTED: 'IMPORTED',
  FAILED: 'FAILED',
});

const PUBLICATION_STATUS = Object.freeze({
  NOT_AUTHORIZED: 'NOT_AUTHORIZED',
  AUTHORIZED: 'AUTHORIZED',
  PUBLISHED: 'PUBLISHED',
  FAILED: 'FAILED',
});

const FIELDS = {
  generation: ['generation_status', 'generationStatus'],
  tech: ['technical_validation_status', 'technicalValidationStatus', 'validation_status'],
  audio: ['audio_quality_status', 'audioQualityStatus', 'quality_status'],
  editorial: ['editorial_status', 'editorialStatus'],
  import: ['import_status', 'importStatus'],
  publication: ['publication_status', 'publicationStatus'],
};

function getField(obj, candidates) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const c of candidates) {
    if (Object.prototype.hasOwnProperty.call(obj, c) && obj[c] !== undefined && obj[c] !== null) {
      return obj[c];
    }
  }
  return undefined;
}

function normalizeStatus(s) {
  return typeof s === 'string' ? s.toUpperCase().trim() : null;
}

function validateLifecycle(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    return { ok: false, errors: ['manifest must be an object'] };
  }
  const errors = [];
  const warnings = [];

  const gen = normalizeStatus(getField(manifest, FIELDS.generation));
  const tech = normalizeStatus(getField(manifest, FIELDS.tech));
  const audio = normalizeStatus(getField(manifest, FIELDS.audio));
  const editorial = normalizeStatus(getField(manifest, FIELDS.editorial));
  const imp = normalizeStatus(getField(manifest, FIELDS.import));
  const pub = normalizeStatus(getField(manifest, FIELDS.publication));

  if (gen === GENERATION_STATUS.COMPLETE) {
    if (audio === AUDIO_QUALITY_STATUS.REJECTED) {
      errors.push('COMPLETE generation cannot coexist with audio_quality REJECTED for accepted artifacts');
    }
  }

  if (audio === AUDIO_QUALITY_STATUS.REJECTED) {
    if (editorial === EDITORIAL_STATUS.APPROVED) {
      errors.push('REJECTED audio cannot have editorial APPROVED');
    }
    if (imp === IMPORT_STATUS.AUTHORIZED || imp === IMPORT_STATUS.IMPORTING || imp === IMPORT_STATUS.IMPORTED) {
      errors.push('REJECTED audio cannot be authorized/imported');
    }
    if (pub === PUBLICATION_STATUS.AUTHORIZED || pub === PUBLICATION_STATUS.PUBLISHED) {
      errors.push('REJECTED audio cannot be published');
    }
  }

  if (editorial === EDITORIAL_STATUS.APPROVED) {
    if (imp === IMPORT_STATUS.NOT_AUTHORIZED && pub === PUBLICATION_STATUS.AUTHORIZED) {
      errors.push('publication cannot be authorized without import authorization when editorial approved');
    }
  }

  if (imp === IMPORT_STATUS.IMPORTED && pub === PUBLICATION_STATUS.NOT_AUTHORIZED) {
    // allowed to be pending publication; not an error
  }

  return { ok: errors.length === 0, errors, warnings };
}

function isRejectedAudio(manifest) {
  const audio = normalizeStatus(getField(manifest, FIELDS.audio));
  return audio === AUDIO_QUALITY_STATUS.REJECTED;
}

function requireAcceptableForConsumption(manifest, context = {}) {
  const v = validateLifecycle(manifest);
  if (!v.ok) throw new Error(`manifest lifecycle invalid: ${v.errors.join(', ')}`);
  if (isRejectedAudio(manifest)) {
    const err = new Error('audio is REJECTED and not acceptable for consumption');
    err.code = 'NARRATION_REJECTED';
    throw err;
  }
  if (context.requireEditorialApproved && normalizeStatus(getField(manifest, FIELDS.editorial)) !== EDITORIAL_STATUS.APPROVED) {
    throw new Error('editorial approval required');
  }
  if (context.requireImportAuthorized && normalizeStatus(getField(manifest, FIELDS.import)) !== IMPORT_STATUS.AUTHORIZED && normalizeStatus(getField(manifest, FIELDS.import)) !== IMPORT_STATUS.IMPORTED) {
    throw new Error('import authorization required');
  }
  return { ok: true };
}

module.exports = {
  GENERATION_STATUS,
  TECH_VALIDATION_STATUS,
  AUDIO_QUALITY_STATUS,
  EDITORIAL_STATUS,
  IMPORT_STATUS,
  PUBLICATION_STATUS,
  validateLifecycle,
  isRejectedAudio,
  requireAcceptableForConsumption,
};
