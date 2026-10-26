/**
 * Narration import provenance — the smallest explicit metadata contract that
 * lets the phase5 importer persist the engine that actually synthesized the
 * audio instead of a hard-coded label.
 *
 * Provenance is resolved, never inferred:
 *   1. explicit CLI arguments (highest trust);
 *   2. an explicit narration manifest file (--manifest);
 *   3. the historical Kokoro default, used ONLY when nothing else is supplied.
 *
 * Conflicting values between sources are an error, not a silent choice, so a
 * stale manifest cannot overwrite an operator's explicit metadata.
 */

const LEGACY_NARRATION_ATTRIBUTION = Object.freeze({
  provider: 'kokoro-82m',
  model: 'hexgrad/Kokoro-82M'
});
const LEGACY_EVIDENCE_NOTE = 'files downloaded and validated locally';

function normalizeMetadata(value, field) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    return { error: `${field} must be a string (received ${Array.isArray(value) ? 'array' : typeof value}).` };
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function readNarrationManifest(filePath, fsModule = require('fs')) {
  let raw;
  try {
    raw = fsModule.readFileSync(filePath, 'utf8');
  } catch (error) {
    return { manifest: null, error: `could not read narration manifest ${filePath}: ${error.message}` };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { manifest: null, error: `narration manifest ${filePath} must be a JSON object.` };
    }
    return { manifest: parsed, error: null };
  } catch (error) {
    return { manifest: null, error: `narration manifest ${filePath} is not valid JSON: ${error.message}` };
  }
}

/**
 * Matches phase5-inject.js's scene key: `${position padded to 3}_${first 8 of scene id}.wav`.
 * A scene needs only `id` and `position`; the runner must emit exactly this name.
 */
function buildNarrationWavFilename(scene = {}) {
  const id = String(scene.id ?? '');
  const position = scene.position;
  if (!id || !Number.isInteger(position) || position < 0) {
    throw new Error(`cannot build narration filename for scene ${JSON.stringify({ id, position })}`);
  }
  return `${String(position).padStart(3, '0')}_${id.slice(0, 8)}.wav`;
}

function resolveNarrationProvenance({
  cli = {},
  manifest = {},
  jobId = null,
  allowLegacyDefault = true
} = {}) {
  const errors = [];
  const warnings = [];
  const sources = {};

  const fields = {};
  for (const field of ['provider', 'model', 'voice', 'evidence']) {
    const fromCli = normalizeMetadata(cli[field], `--${field}`);
    if (fromCli && fromCli.error) {
      errors.push(fromCli.error);
      fields[field] = { value: null, source: null };
      continue;
    }
    const fromManifest = normalizeMetadata(
      manifest[field] !== undefined ? manifest[field] : manifest[field === 'evidence' ? 'evidenceNote' : field],
      `manifest ${field}`
    );
    if (fromManifest && fromManifest.error) {
      errors.push(fromManifest.error);
      fields[field] = { value: null, source: null };
      continue;
    }

    const cliValue = fromCli && fromCli.error ? null : fromCli;
    const manifestValue = fromManifest && fromManifest.error ? null : fromManifest;
    if (cliValue && manifestValue && cliValue !== manifestValue) {
      errors.push(`conflicting ${field}: '${cliValue}' from --${field} and '${manifestValue}' from the narration manifest.`);
      fields[field] = { value: null, source: null };
      continue;
    }
    if (cliValue) {
      fields[field] = { value: cliValue, source: 'cli' };
    } else if (manifestValue) {
      fields[field] = { value: manifestValue, source: 'manifest' };
    } else {
      fields[field] = { value: null, source: null };
    }
  }

  for (const field of Object.keys(fields)) {
    if (fields[field].value) sources[field] = fields[field].source;
  }

  const providerField = fields.provider;
  const modelField = fields.model;
  const explicitAttribution = Boolean(providerField.value || modelField.value);

  let provider = providerField.value;
  let model = modelField.value;
  if (!provider && !model) {
    if (!allowLegacyDefault) {
      errors.push('no provider supplied and the legacy default is disallowed; pass --provider/--model or --manifest.');
    } else {
      provider = LEGACY_NARRATION_ATTRIBUTION.provider;
      model = LEGACY_NARRATION_ATTRIBUTION.model;
      sources.provider = 'legacy-default';
      sources.model = 'legacy-default';
      warnings.push('no provider/model metadata supplied; recording the legacy Kokoro attribution, which must only be used for Kokoro output.');
    }
  } else if (!model) {
    warnings.push('provider supplied without a model; narrationModel will be null rather than guessed.');
  } else if (!provider) {
    warnings.push('model supplied without a provider; narrationProvider will be null rather than guessed.');
  }

  let voice = fields.voice.value;
  if (!voice) {
    warnings.push('no voice supplied; the data model has no narration voice column, so voice attribution will not be recorded.');
  }

  let evidence = fields.evidence.value;
  if (!evidence) {
    evidence = jobId
      ? `remote inference (job ${jobId}), ${LEGACY_EVIDENCE_NOTE}`
      : LEGACY_EVIDENCE_NOTE;
    sources.evidence = 'default';
  } else if (jobId && !evidence.includes(jobId)) {
    warnings.push(`evidence does not mention job ${jobId}.`);
  }

  const orderedSources = fields.provider.source || fields.model.source || fields.voice.source || null;
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    source: explicitAttribution ? (orderedSources || 'unknown') : 'legacy-default',
    sources,
    provider,
    model,
    voice,
    evidence,
    cost: {
      provider,
      model,
      amount: 0,
      currency: 'USD',
      billed: false,
      note: evidence,
      ...(voice ? { voice } : {})
    },
    providerLabel: `${provider}${jobId ? ` (remote: ${jobId})` : ''}`
  };
}

module.exports = {
  LEGACY_NARRATION_ATTRIBUTION,
  LEGACY_EVIDENCE_NOTE,
  buildNarrationWavFilename,
  readNarrationManifest,
  resolveNarrationProvenance
};
