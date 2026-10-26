/**
 * Canonical narration manifest validation with lifecycle enforcement.
 */
const {validateLifecycle, requireAcceptableForConsumption, isRejectedAudio} = require('./narration-lifecycle');
const {guardAgainstRejected} = require('./narration-quality');

function validateNarrationManifest(manifest, opts = {}) {
  if (!manifest || typeof manifest !== 'object') {
    return {valid: false, errors: ['manifest must be an object']};
  }
  const errors = [];
  const warnings = [];

  // Check required identity fields if present
  if (manifest.segments) {
    if (!Array.isArray(manifest.segments)) {
      errors.push('segments must be an array');
    }
  }

  // Lifecycle validation
  const lv = validateLifecycle(manifest);
  if (!lv.ok) {
    for (const e of lv.errors) errors.push(e);
  }

  // Quality guard
  try {
    if (opts.manifestPath) {
      guardAgainstRejected(opts.manifestPath);
    } else {
      // simulate guard on embedded data
      if (isRejectedAudio(manifest)) {
        const err = new Error('rejected');
        err.code = 'NARRATION_REJECTED';
        throw err;
      }
    }
  } catch (e) {
    if (e.code === 'NARRATION_REJECTED') {
      errors.push('narration artifact is REJECTED and not acceptable');
    } else {
      warnings.push('quality guard issue: ' + e.message);
    }
  }

  // Consumption check (non-blocking if not requested)
  if (opts.requireConsumption) {
    try {
      requireAcceptableForConsumption(manifest, opts);
    } catch (e) {
      errors.push(e.message);
    }
  }

  return {valid: errors.length === 0, errors, warnings};
}

module.exports = {validateNarrationManifest};
