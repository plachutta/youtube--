const crypto = require('crypto');

/**
 * Narration input contract — deterministic validator.
 *
 * The input file is produced by phase5-export-scenes.js (the authoritative
 * producer). Its shape is:
 *   {
 *     jobKind: 'agenttube-narration',
 *     productionId: string,
 *     createdAt: ISO timestamp,
 *     engine: null,                 // filled in when the primary engine is chosen
 *     sampleRate: number,           // 24000 — rate the runner must emit
 *     segments: [{
 *       sceneId: string,            // productions_scenes.id
 *       position: integer,          // production_scenes.position (0-based)
 *       label: string,              // productions_scenes.label
 *       estimatedDurationSec: number, // productions_scenes.duration (> 0)
 *       text: string                // productions_scenes.script_text, trimmed
 *     }]
 *   }
 *
 * Position semantics are 0-based and strictly ascending: database/db.js
 * replaceProductionScenes() assigns position from Array.prototype.entries(),
 * and phase5-export-scenes.js re-sorts ascending before writing.
 *
 * This module is pure: it never reads files, mutates input, or contacts
 * remote services. Parse the JSON first, then pass the value in.
 */

const NARRATION_JOB_KIND = 'agenttube-narration';
// phase5-export-scenes.js writes 24000; utils/ai-video-generator.js writes
// 24000 Hz mono PCM for its own TTS output. Matching that is the contract.
const EXPECTED_SAMPLE_RATE = 24000;
const REQUIRED_SEGMENT_FIELDS = ['sceneId', 'position', 'label', 'estimatedDurationSec', 'text'];

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function validateSegment(segment, index, seenSceneIds, seenPositions, errors, warnings) {
  const label = `segments[${index}]`;
  if (!isPlainObject(segment)) {
    errors.push(`${label} must be an object (received ${describe(segment)}).`);
    return;
  }

  for (const field of REQUIRED_SEGMENT_FIELDS) {
    if (segment[field] === undefined) {
      errors.push(`${label} is missing required field '${field}'.`);
    }
  }

  if (segment.sceneId !== undefined && !nonEmptyString(segment.sceneId)) {
    errors.push(`${label}.sceneId must be a non-empty string.`);
  } else if (nonEmptyString(segment.sceneId)) {
    if (seenSceneIds.has(segment.sceneId)) {
      errors.push(`${label}.sceneId '${segment.sceneId}' is duplicated across segments.`);
    } else {
      seenSceneIds.add(segment.sceneId);
    }
  }

  if (segment.position !== undefined && (!Number.isInteger(segment.position) || segment.position < 0)) {
    errors.push(`${label}.position must be a non-negative integer (received ${JSON.stringify(segment.position)}).`);
  } else if (Number.isInteger(segment.position) && segment.position >= 0) {
    if (seenPositions.has(segment.position)) {
      errors.push(`${label}.position ${segment.position} is duplicated across segments.`);
    } else {
      seenPositions.add(segment.position);
    }
  }

  if (segment.label !== undefined && !nonEmptyString(segment.label)) {
    errors.push(`${label}.label must be a non-empty string.`);
  }

  if (segment.estimatedDurationSec !== undefined) {
    if (typeof segment.estimatedDurationSec !== 'number' || !Number.isFinite(segment.estimatedDurationSec)) {
      errors.push(`${label}.estimatedDurationSec must be a finite number.`);
    } else if (segment.estimatedDurationSec <= 0) {
      errors.push(`${label}.estimatedDurationSec must be greater than zero.`);
    }
  }

  if (segment.text !== undefined) {
    if (typeof segment.text !== 'string') {
      errors.push(`${label}.text must be a string.`);
    } else if (segment.text.trim().length === 0) {
      errors.push(`${label}.text must be non-empty narration text.`);
    }
  }

  // Irrelevant to the contract, but a runner would produce a gap in output
  // filenames if positions were not contiguous.
  if (Number.isInteger(segment.position) && segment.position !== index) {
    warnings.push(`${label}.position is ${segment.position} but its array index is ${index}; positions are 0-based and contiguous when exported.`);
  }
}

function validateNarrationInput(input = {}) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(input)) {
    return {
      valid: false,
      errors: ['Narration input must be a JSON object.'],
      warnings,
      value: null
    };
  }

  if (!nonEmptyString(input.jobKind)) {
    errors.push("jobKind is required and must be a non-empty string (expected 'agenttube-narration').");
  } else if (input.jobKind !== NARRATION_JOB_KIND) {
    warnings.push(`jobKind '${input.jobKind}' is not the known value '${NARRATION_JOB_KIND}'.`);
  }

  if (!nonEmptyString(input.productionId)) {
    errors.push('productionId is required and must be a non-empty string.');
  }

  if (input.createdAt !== undefined) {
    const parsed = typeof input.createdAt === 'string' ? Date.parse(input.createdAt) : NaN;
    if (!Number.isFinite(parsed)) {
      errors.push('createdAt must be an ISO-8601 date string when present.');
    }
  }

  if (input.sampleRate === undefined) {
    errors.push('sampleRate is required and must be the rate the runner emits.');
  } else if (typeof input.sampleRate !== 'number' || !Number.isInteger(input.sampleRate) || input.sampleRate <= 0) {
    errors.push('sampleRate must be a positive integer.');
  } else if (input.sampleRate !== EXPECTED_SAMPLE_RATE) {
    warnings.push(`sampleRate is ${input.sampleRate} but every local producer and downstream writer expects ${EXPECTED_SAMPLE_RATE}.`);
  }

  if (input.engine !== undefined && input.engine !== null && !nonEmptyString(input.engine)) {
    errors.push("engine must be null or a non-empty string.");
  }

  if (!Array.isArray(input.segments)) {
    errors.push('segments must be an array.');
    return { valid: false, errors, warnings, value: null };
  }
  if (input.segments.length === 0) {
    errors.push('segments must contain at least one segment.');
    return { valid: false, errors, warnings, value: null };
  }

  const seenSceneIds = new Set();
  const seenPositions = new Set();
  input.segments.forEach((segment, index) => validateSegment(
    segment, index, seenSceneIds, seenPositions, errors, warnings
  ));

  const positions = input.segments
    .map(segment => segment && segment.position)
    .filter(position => Number.isInteger(position) && position >= 0);
  for (let i = 1; i < positions.length; i += 1) {
    if (positions[i] < positions[i - 1]) {
      errors.push(`segments must be ordered by ascending position; segments[${i}].position ${positions[i]} follows ${positions[i - 1]}.`);
      break;
    }
  }

  const missingPositions = [];
  for (let position = 0; position < input.segments.length; position += 1) {
    if (!seenPositions.has(position)) missingPositions.push(position);
  }
  if (missingPositions.length) {
    warnings.push(`positions are not contiguous from zero; missing ${missingPositions.join(', ')}.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    value: {
      productionId: nonEmptyString(input.productionId) ? input.productionId.trim() : null,
      jobKind: nonEmptyString(input.jobKind) ? input.jobKind.trim() : null,
      engine: nonEmptyString(input.engine) ? input.engine.trim() : null,
      sampleRate: typeof input.sampleRate === 'number' ? input.sampleRate : null,
      segments: input.segments.filter(isPlainObject)
    }
  };
}

/**
 * Hashes the exact text a runner would send to the TTS engine. Used for
 * manifests and resume keys so a re-run can tell whether a segment's text
 * changed. Not a field of the input file itself.
 */
function narrationTextSha256(text) {
  return crypto.createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex');
}

function assertValidNarrationInput(input = {}) {
  const result = validateNarrationInput(input);
  if (!result.valid) {
    const error = new Error(`Narration input is invalid: ${result.errors.join(' ')}`);
    error.code = 'INVALID_NARRATION_INPUT';
    error.validation = result;
    throw error;
  }
  return result;
}

function parseNarrationInput(raw) {
  try {
    return { parsed: JSON.parse(raw), parseError: null };
  } catch (error) {
    return { parsed: null, parseError: error.message };
  }
}

module.exports = {
  NARRATION_JOB_KIND,
  EXPECTED_SAMPLE_RATE,
  REQUIRED_SEGMENT_FIELDS,
  validateNarrationInput,
  assertValidNarrationInput,
  narrationTextSha256,
  parseNarrationInput
};
