'use strict';

/**
 * Provider-neutral engineering-agent contracts and dispatch boundary.
 * This module owns no roadmap, task database, model credentials, or provider
 * session history. Adapters are registered by configuration and remain
 * outside the orchestration domain.
 */

const path = require('path');
const { isDeepStrictEqual } = require('util');

const CONTRACT_VERSION = '1.0.0';
const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const CAPABILITIES = Object.freeze([
  'executeTask', 'boundedExecution', 'cancellation', 'streamingEvents',
  'structuredOutput', 'workspaceAccess', 'workspaceIsolation',
  'checkpointResume', 'modelSelection', 'usageReporting',
]);
const TASK_STATUSES = Object.freeze(['succeeded', 'failed', 'cancelled', 'timed_out', 'blocked']);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateTaskSpec(task) {
  const errors = [];
  if (!isObject(task)) return { valid: false, errors: ['task must be an object'] };
  if (task.contractVersion !== CONTRACT_VERSION) errors.push(`contractVersion must be ${CONTRACT_VERSION}`);
  if (!isString(task.taskId) || !TASK_ID.test(task.taskId)) errors.push('taskId must be a stable safe identifier');
  if (!isString(task.objective)) errors.push('objective is required');
  for (const key of ['authorizedScope', 'exclusions', 'dependencies', 'inputs', 'deliverables', 'acceptanceCriteria', 'allowedCommands', 'forbiddenActions', 'expectedEvidence', 'requiredCapabilities']) {
    if (!Array.isArray(task[key])) errors.push(`${key} must be an array`);
  }
  if (Array.isArray(task.acceptanceCriteria) && task.acceptanceCriteria.length === 0) errors.push('at least one acceptance criterion is required');
  if (Array.isArray(task.acceptanceCriteria)) {
    const ids = new Set();
    task.acceptanceCriteria.forEach((criterion, index) => {
      if (!isObject(criterion) || !isString(criterion.id) || !isString(criterion.description) || !isObject(criterion.verification)) {
        errors.push(`acceptanceCriteria[${index}] requires id, description, and verification`);
      } else if (ids.has(criterion.id)) {
        errors.push(`acceptance criterion id is duplicated: ${criterion.id}`);
      } else {
        ids.add(criterion.id);
        if (criterion.verification.kind === 'command') {
          if (!isString(criterion.verification.command) || !Array.isArray(criterion.verification.args) || criterion.verification.args.some(argument => typeof argument !== 'string')) {
            errors.push(`acceptanceCriteria[${index}].verification requires a command and string args`);
          }
          if (Array.isArray(task.allowedCommands) && !task.allowedCommands.includes(criterion.verification.command)) {
            errors.push(`acceptanceCriteria[${index}] verifier command is not allowlisted`);
          }
          if (!Number.isInteger(criterion.verification.timeoutMs) || criterion.verification.timeoutMs < 1 || criterion.verification.timeoutMs > (task.resourceLimits?.timeoutMs || 0)) {
            errors.push(`acceptanceCriteria[${index}].verification.timeoutMs must be positive and within the task resource limit`);
          }
        } else if (criterion.verification.kind === 'human') {
          if (!isString(criterion.verification.owner)) errors.push(`acceptanceCriteria[${index}] human verification requires an owner`);
        } else {
          errors.push(`acceptanceCriteria[${index}].verification.kind must be command or human`);
        }
      }
    });
  }
  if (!isObject(task.resourceLimits) || !Number.isInteger(task.resourceLimits.timeoutMs) || task.resourceLimits.timeoutMs < 1 || task.resourceLimits.timeoutMs > 3600000) {
    errors.push('resourceLimits.timeoutMs must be an integer from 1 to 3600000');
  }
  if (task.modelProvider !== undefined && (!isObject(task.modelProvider) || !isString(task.modelProvider.mode))) {
    errors.push('modelProvider, when present, must declare its mode');
  }
  if (task.executionBackend !== undefined && (!isObject(task.executionBackend) || !isString(task.executionBackend.id))) {
    errors.push('executionBackend, when present, must declare an id');
  }
  for (const capability of (Array.isArray(task.requiredCapabilities) ? task.requiredCapabilities : [])) {
    if (!CAPABILITIES.includes(capability)) errors.push(`unknown required capability: ${capability}`);
  }
  return { valid: errors.length === 0, errors };
}

function assertTaskSpec(task) {
  const result = validateTaskSpec(task);
  if (!result.valid) fail('INVALID_TASK_SPEC', result.errors.join('; '));
  return task;
}

function validateProviderManifest(manifest) {
  const errors = [];
  if (!isObject(manifest)) return { valid: false, errors: ['provider manifest must be an object'] };
  if (manifest.contractVersion !== CONTRACT_VERSION) errors.push(`contractVersion must be ${CONTRACT_VERSION}`);
  if (!isString(manifest.id) || !TASK_ID.test(manifest.id)) errors.push('provider id must be a stable safe identifier');
  if (!isString(manifest.name)) errors.push('provider name is required');
  if (!isString(manifest.adapterVersion)) errors.push('adapterVersion is required');
  if (!isString(manifest.launchMethod)) errors.push('launchMethod is required');
  if (!Array.isArray(manifest.capabilities)) errors.push('capabilities must be an array');
  else for (const capability of manifest.capabilities) if (!CAPABILITIES.includes(capability)) errors.push(`unknown provider capability: ${capability}`);
  for (const key of ['authentication', 'executionConstraints', 'requiredDependencies', 'knownLimitations']) {
    if (manifest[key] !== undefined && !Array.isArray(manifest[key])) errors.push(`${key} must be an array when present`);
  }
  return { valid: errors.length === 0, errors };
}

function assertProviderManifest(manifest) {
  const result = validateProviderManifest(manifest);
  if (!result.valid) fail('INVALID_PROVIDER_MANIFEST', result.errors.join('; '));
  return manifest;
}

function validateExecutionRequest(request) {
  const errors = [];
  if (!isObject(request)) return { valid: false, errors: ['execution request must be an object'] };
  const taskResult = validateTaskSpec(request.task);
  if (!taskResult.valid) errors.push(...taskResult.errors.map(error => `task: ${error}`));
  if (!isString(request.providerId)) errors.push('providerId is required; implicit provider fallback is forbidden');
  if (!isString(request.workspaceId)) errors.push('workspaceId is required');
  if (!isString(request.workspacePath) || !path.isAbsolute(request.workspacePath)) errors.push('workspacePath must be absolute');
  if (!Number.isInteger(request.timeoutMs) || request.timeoutMs < 1 || request.timeoutMs > (request.task?.resourceLimits?.timeoutMs || 0)) errors.push('timeoutMs must be positive and no greater than the task limit');
  if (!Array.isArray(request.inputRefs) || !Array.isArray(request.outputRefs)) errors.push('inputRefs and outputRefs must be arrays');
  if (request.checkpoint !== undefined) {
    const checkpointResult = validateCheckpoint(request.checkpoint);
    if (!checkpointResult.valid) errors.push(...checkpointResult.errors.map(error => `checkpoint: ${error}`));
    if (request.checkpoint.taskId !== request.task?.taskId || !isDeepStrictEqual(request.checkpoint.task, request.task)) errors.push('checkpoint must preserve the exact canonical task specification');
  }
  return { valid: errors.length === 0, errors };
}

class ProviderRegistry {
  constructor() {
    this.adapters = new Map();
    this.disabled = new Set();
  }

  register(adapter) {
    if (!adapter || typeof adapter !== 'object') fail('INVALID_ADAPTER', 'adapter must be an object');
    assertProviderManifest(adapter.manifest);
    for (const method of ['checkAvailability', 'validatePrerequisites', 'executeTask', 'cancelTask', 'closeTask']) {
      if (typeof adapter[method] !== 'function') fail('INVALID_ADAPTER', `adapter ${adapter.manifest.id} must implement ${method}()`);
    }
    if (this.adapters.has(adapter.manifest.id)) fail('DUPLICATE_PROVIDER', `provider already registered: ${adapter.manifest.id}`);
    this.adapters.set(adapter.manifest.id, adapter);
    return adapter.manifest.id;
  }

  disable(id) {
    this.disabled.add(id);
  }

  resolve(id) {
    if (!isString(id)) fail('PROVIDER_REQUIRED', 'providerId is required; no implicit default or fallback is permitted');
    if (this.disabled.has(id)) fail('PROVIDER_DISABLED', `provider is disabled: ${id}`);
    const adapter = this.adapters.get(id);
    if (!adapter) fail('PROVIDER_UNAVAILABLE', `provider is not registered: ${id}`);
    return adapter;
  }

  list() {
    return [...this.adapters.keys()].filter(id => !this.disabled.has(id)).sort();
  }
}

function registerConfiguredProviders(registry, configuration, adapters) {
  if (!isObject(configuration) || configuration.contractVersion !== CONTRACT_VERSION || !Array.isArray(configuration.providers)) {
    fail('INVALID_PROVIDER_CONFIGURATION', `provider configuration must declare contractVersion ${CONTRACT_VERSION} and a providers array`);
  }
  const adaptersById = new Map(adapters.map(adapter => [adapter.manifest.id, adapter]));
  const seen = new Set();
  for (const entry of configuration.providers) {
    if (!isObject(entry) || !isString(entry.id) || seen.has(entry.id)) fail('INVALID_PROVIDER_CONFIGURATION', 'provider entries require unique ids');
    seen.add(entry.id);
    if (entry.enabled === false) {
      registry.disable(entry.id);
      continue;
    }
    const adapter = adaptersById.get(entry.id);
    if (!adapter) fail('PROVIDER_ADAPTER_MISSING', `enabled provider has no adapter: ${entry.id}`);
    registry.register(adapter);
  }
  if (configuration.defaultProvider !== undefined && !registry.list().includes(configuration.defaultProvider)) {
    fail('DEFAULT_PROVIDER_INVALID', 'configured defaultProvider must name an enabled registered provider');
  }
  return registry;
}

async function dispatchTask(registry, request) {
  const checked = validateExecutionRequest(request);
  if (!checked.valid) fail('INVALID_EXECUTION_REQUEST', checked.errors.join('; '));
  const adapter = registry.resolve(request.providerId);
  const manifest = assertProviderManifest(adapter.manifest);
  const missing = request.task.requiredCapabilities.filter(capability => !manifest.capabilities.includes(capability));
  if (missing.length) fail('CAPABILITY_MISMATCH', `provider ${manifest.id} lacks mandatory capabilities: ${missing.join(', ')}`);
  const available = await adapter.checkAvailability();
  if (!available || available.available !== true) fail('PROVIDER_UNAVAILABLE', available?.reason || `provider unavailable: ${manifest.id}`);
  const prerequisite = await adapter.validatePrerequisites(request);
  if (!prerequisite || prerequisite.ok !== true) fail('PROVIDER_PREREQUISITE_FAILED', prerequisite?.reason || `provider prerequisites failed: ${manifest.id}`);
  const result = await adapter.executeTask(request);
  assertExecutionResult(result, request);
  return result;
}

function validateExecutionResult(result, request) {
  const errors = [];
  if (!isObject(result)) return { valid: false, errors: ['execution result must be an object'] };
  if (result.contractVersion !== CONTRACT_VERSION) errors.push(`contractVersion must be ${CONTRACT_VERSION}`);
  if (result.taskId !== request.task.taskId) errors.push('result taskId does not match request');
  if (result.providerId !== request.providerId) errors.push('result providerId does not match the explicitly requested provider');
  if (!isString(result.executionId) || !isString(result.adapterVersion)) errors.push('executionId and adapterVersion are required');
  if (!TASK_STATUSES.includes(result.status)) errors.push('result status is invalid');
  if (result.processExitCode !== null && result.processExitCode !== undefined && !Number.isInteger(result.processExitCode)) errors.push('processExitCode must be an integer or null');
  for (const key of ['logs', 'changedFiles', 'artifactRefs', 'errors', 'warnings', 'unexecutedSteps']) {
    if (!Array.isArray(result[key])) errors.push(`${key} must be an array`);
  }
  if (result.accepted !== undefined || result.acceptanceStatus !== undefined || result.verified !== undefined) errors.push('agent result cannot set acceptance, verification, or verified status');
  return { valid: errors.length === 0, errors };
}

function assertExecutionResult(result, request) {
  const checked = validateExecutionResult(result, request);
  if (!checked.valid) fail('INVALID_EXECUTION_RESULT', checked.errors.join('; '));
  return result;
}

function createCheckpoint({ task, status, completedCriteria, remainingCriteria, workspaceId, changedFiles, evidenceRefs, failures, nextAuthorizedAction, createdAt = new Date().toISOString() }) {
  assertTaskSpec(task);
  if (!isString(status) || !isString(workspaceId) || !Array.isArray(completedCriteria) || !Array.isArray(remainingCriteria) || !Array.isArray(changedFiles) || !Array.isArray(evidenceRefs) || !Array.isArray(failures) || !isString(nextAuthorizedAction)) {
    fail('INVALID_CHECKPOINT', 'checkpoint must retain task state, workspace, criteria, changed files, evidence, failures, and next authorized action');
  }
  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    taskId: task.taskId,
    task,
    status,
    workspaceId,
    completedCriteria: [...completedCriteria],
    remainingCriteria: [...remainingCriteria],
    changedFiles: [...changedFiles],
    evidenceRefs: [...evidenceRefs],
    failures: [...failures],
    nextAuthorizedAction,
    createdAt,
  });
}

function validateCheckpoint(checkpoint) {
  const errors = [];
  if (!isObject(checkpoint)) return { valid: false, errors: ['checkpoint must be an object'] };
  if (checkpoint.contractVersion !== CONTRACT_VERSION) errors.push(`contractVersion must be ${CONTRACT_VERSION}`);
  const taskCheck = validateTaskSpec(checkpoint.task);
  if (!taskCheck.valid) errors.push(...taskCheck.errors.map(error => `task: ${error}`));
  if (checkpoint.taskId !== checkpoint.task?.taskId) errors.push('checkpoint taskId must match canonical task');
  for (const key of ['completedCriteria', 'remainingCriteria', 'changedFiles', 'evidenceRefs', 'failures']) if (!Array.isArray(checkpoint[key])) errors.push(`${key} must be an array`);
  for (const key of ['status', 'workspaceId', 'nextAuthorizedAction', 'createdAt']) if (!isString(checkpoint[key])) errors.push(`${key} is required`);
  if (checkpoint.providerConversationId !== undefined) errors.push('provider-native conversation IDs are not canonical checkpoint state');
  return { valid: errors.length === 0, errors };
}

module.exports = {
  CONTRACT_VERSION,
  CAPABILITIES,
  validateTaskSpec,
  assertTaskSpec,
  validateProviderManifest,
  assertProviderManifest,
  validateExecutionRequest,
  validateExecutionResult,
  assertExecutionResult,
  ProviderRegistry,
  registerConfiguredProviders,
  dispatchTask,
  createCheckpoint,
  validateCheckpoint,
};
