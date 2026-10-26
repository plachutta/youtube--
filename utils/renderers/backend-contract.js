/**
 * RENDER BACKEND CONTRACT (B9.38)
 *
 * Stable interface between scene planning and any rendering engine.
 * Backends receive ONLY validated scene contracts plus their validated
 * layout reports. Activation is explicit; no backend may silently route
 * production generation.
 */

const BACKEND_MODES = Object.freeze({
  DISABLED: 'disabled',
  VALIDATE_ONLY: 'validate_only',
  RENDER: 'render'
});

// Flip only in a future milestone AFTER rendered scenes are visually validated.
const RENDER_AUTHORIZATION_TOKEN = 'AUTHORIZED_RENDER_PHASE';

function resolveBackendMode(envValue) {
  const value = String(envValue || '').trim().toLowerCase();
  if (value === BACKEND_MODES.VALIDATE_ONLY) return BACKEND_MODES.VALIDATE_ONLY;
  if (value === BACKEND_MODES.RENDER) return BACKEND_MODES.RENDER;
  return BACKEND_MODES.DISABLED;
}

function backendDisabledError(backendId) {
  const error = new Error(
    `Render backend "${backendId}" is disabled. Production activation requires an authorized rendering phase ` +
    'after visual validation; set the documented feature flag only when that authorization exists.'
  );
  error.code = 'BACKEND_DISABLED';
  return error;
}

function renderNotAuthorizedError(backendId, reason) {
  const error = new Error(`Render step for "${backendId}" is not authorized: ${reason}`);
  error.code = 'RENDER_NOT_AUTHORIZED';
  return error;
}

module.exports = {
  BACKEND_MODES,
  RENDER_AUTHORIZATION_TOKEN,
  resolveBackendMode,
  backendDisabledError,
  renderNotAuthorizedError
};
