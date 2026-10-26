'use strict';

const { spawn } = require('child_process');
const { CONTRACT_VERSION } = require('../engineering-agent-runtime');

function providerEnvironment(allowlisted = []) {
  const keys = ['PATH', 'HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'APPDATA', ...allowlisted];
  const env = {};
  for (const key of new Set(keys)) if (process.env[key] !== undefined) env[key] = process.env[key];
  return env;
}

function redactProviderLog(text) {
  return String(text)
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|authorization)\s*[:=]\s*)([^\s,;"']+)/gi, '$1[REDACTED]')
    .replace(/\bBearer\s+[^\s,;"']+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|github_pat_[A-Za-z0-9_]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|AIza[A-Za-z0-9_-]{20,})\b/g, '[REDACTED]');
}

/** Optional Kilo provider adapter. It is not a sandbox and is disabled by default. */
class KiloCliAdapter {
  constructor(options = {}) {
    this.command = options.command || 'kilo';
    this.spawnProcess = options.spawnProcess || spawn;
    this.allowUnsandboxedExecution = options.allowUnsandboxedExecution === true;
    this.environmentAllowlist = Array.isArray(options.environmentAllowlist) ? options.environmentAllowlist.filter(key => typeof key === 'string') : [];
    this.outputLimitBytes = options.outputLimitBytes || 1024 * 1024;
    this.manifest = Object.freeze({
      contractVersion: CONTRACT_VERSION,
      id: 'kilo-cli',
      name: 'Kilo CLI',
      adapterVersion: '1.0.0',
      protocol: 'documented-headless-cli',
      launchMethod: 'kilo run --format json --dir <workspace> <canonical-task-json>',
      capabilities: ['executeTask', 'boundedExecution', 'cancellation', 'streamingEvents', 'structuredOutput', 'workspaceAccess', 'modelSelection', 'usageReporting'],
      authentication: ['Kilo-managed provider credentials; adapter does not read or copy credential material'],
      executionConstraints: ['host process with user-level filesystem permissions', 'no --auto; permission requests are not silently approved', 'no sandbox guarantee'],
      requiredDependencies: ['Kilo CLI 1.0+'],
      knownLimitations: ['does not provide workspace isolation', 'noninteractive permission requests may reject and return failure', 'provider-native session state is not the canonical task checkpoint'],
    });
    this.children = new Map();
  }

  async checkAvailability() {
    return new Promise(resolve => {
      let output = '';
      let child;
      try {
        child = this.spawnProcess(this.command, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'], shell: false, env: providerEnvironment() });
      } catch (error) {
        resolve({ available: false, reason: error.code === 'ENOENT' ? 'Kilo CLI is not installed' : String(error.message || error) });
        return;
      }
      const timer = setTimeout(() => { child.kill('SIGTERM'); resolve({ available: false, reason: 'Kilo CLI version check timed out' }); }, 3000);
      child.stdout?.on('data', chunk => { output += chunk.toString(); });
      child.once('error', error => { clearTimeout(timer); resolve({ available: false, reason: error.code === 'ENOENT' ? 'Kilo CLI is not installed' : String(error.message || error) }); });
      child.once('close', code => { clearTimeout(timer); resolve({ available: code === 0, version: output.trim() || null, reason: code === 0 ? null : `Kilo CLI version check exited ${code}` }); });
    });
  }

  async validatePrerequisites(request) {
    if (request.task.requiredCapabilities.includes('workspaceIsolation')) {
      return { ok: false, reason: 'Kilo CLI host-process adapter cannot provide required workspace isolation' };
    }
    if (!this.allowUnsandboxedExecution) return { ok: false, reason: 'Kilo CLI execution is disabled until an operator explicitly authorizes the unsandboxed host-process boundary' };
    return { ok: true };
  }

  executeTask(request) {
    const id = `${request.task.taskId}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const canonicalTask = JSON.stringify(request.task);
    const args = ['run', '--format', 'json', '--dir', request.workspacePath];
    if (request.task.modelProvider?.modelId) args.push('--model', request.task.modelProvider.modelId);
    args.push(canonicalTask);
    const startedAt = new Date().toISOString();
    return new Promise(resolve => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      let timedOut = false;
      let forceKillTimer = null;
      const child = this.spawnProcess(this.command, args, { cwd: request.workspacePath, stdio: ['ignore', 'pipe', 'pipe'], shell: false, windowsHide: true, env: providerEnvironment(this.environmentAllowlist) });
      this.children.set(id, child);
      const finish = (code, signal, error = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        this.children.delete(id);
        const completedAt = new Date().toISOString();
        const status = timedOut ? 'timed_out' : (signal === 'SIGTERM' || signal === 'SIGKILL' ? 'cancelled' : (code === 0 && !error ? 'succeeded' : 'failed'));
        const logs = [];
        if (stdout) logs.push({ stream: 'stdout', text: redactProviderLog(stdout), truncated: stdout.length >= this.outputLimitBytes });
        if (stderr) logs.push({ stream: 'stderr', text: redactProviderLog(stderr), truncated: stderr.length >= this.outputLimitBytes });
        resolve({
          contractVersion: CONTRACT_VERSION,
          taskId: request.task.taskId,
          executionId: id,
          providerId: this.manifest.id,
          adapterVersion: this.manifest.adapterVersion,
          status,
          startedAt,
          completedAt,
          processExitCode: Number.isInteger(code) ? code : null,
          logs,
          changedFiles: [],
          artifactRefs: [],
          errors: error ? [{ code: error.code || 'PROVIDER_EXECUTION_ERROR', message: String(error.message || error) }] : [],
          warnings: [],
          unexecutedSteps: status === 'succeeded' ? [] : request.task.deliverables.map(deliverable => `agent completion not independently verified: ${deliverable}`),
          limitations: [...this.manifest.knownLimitations],
        });
      };
      const collect = (target, chunk) => {
        const remaining = this.outputLimitBytes - target.length;
        if (remaining > 0) return target + chunk.toString().slice(0, remaining);
        return target;
      };
      child.stdout?.on('data', chunk => { stdout = collect(stdout, chunk); });
      child.stderr?.on('data', chunk => { stderr = collect(stderr, chunk); });
      child.once('error', error => finish(null, null, error));
      child.once('close', (code, signal) => finish(code, signal));
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        forceKillTimer = setTimeout(() => child.kill('SIGKILL'), 1000);
        forceKillTimer.unref?.();
      }, request.timeoutMs);
      this.children.set(id, child);
    });
  }

  async cancelTask(executionId) {
    const child = this.children.get(executionId);
    if (!child) return { cancelled: false, reason: 'execution is not active' };
    child.kill('SIGTERM');
    const forceKillTimer = setTimeout(() => child.kill('SIGKILL'), 1000);
    forceKillTimer.unref?.();
    return { cancelled: true, executionId };
  }

  async closeTask(executionId) {
    return this.cancelTask(executionId);
  }
}

module.exports = { KiloCliAdapter };
