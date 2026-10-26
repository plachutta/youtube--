'use strict';

/**
 * Independent acceptance verifier. It has no provider or session dependency
 * and runs the exact allowlisted commands in the canonical task contract.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { CONTRACT_VERSION, assertTaskSpec } = require('../../utils/engineering-agent-runtime');

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function verifyAcceptance(task, workspacePath) {
  assertTaskSpec(task);
  if (typeof workspacePath !== 'string' || !path.isAbsolute(workspacePath) || !fs.statSync(workspacePath).isDirectory()) {
    const error = new Error('verifier workspacePath must be an existing absolute directory');
    error.code = 'INVALID_VERIFIER_WORKSPACE';
    throw error;
  }

  const criteria = task.acceptanceCriteria.map(criterion => {
    if (criterion.verification.kind === 'human') {
      return { criterionId: criterion.id, status: 'blocked', evidenceRef: null, method: `human review required: ${criterion.verification.owner}`, exitCode: null };
    }

    const { command, args, timeoutMs } = criterion.verification;
    let stdout = '';
    let stderr = '';
    let exitCode = null;
    let executionError = null;
    try {
      stdout = execFileSync(command, args, {
        cwd: workspacePath,
        timeout: timeoutMs,
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
        env: {
          PATH: process.env.PATH || '',
          HOME: process.env.HOME || '',
          LANG: process.env.LANG || 'C',
          LC_ALL: process.env.LC_ALL || 'C',
          TMPDIR: process.env.TMPDIR || '/tmp',
          NODE_ENV: 'test',
        },
        maxBuffer: 1024 * 1024,
      });
      exitCode = 0;
    } catch (error) {
      exitCode = Number.isInteger(error.status) ? error.status : null;
      stdout = Buffer.isBuffer(error.stdout) ? error.stdout.toString('utf8') : String(error.stdout || '');
      stderr = Buffer.isBuffer(error.stderr) ? error.stderr.toString('utf8') : String(error.stderr || '');
      executionError = String(error.code || error.message || error);
    }
    const evidence = JSON.stringify({ command, args, exitCode, stdout, stderr, executionError });
    return {
      criterionId: criterion.id,
      status: exitCode === 0 && executionError === null ? 'pass' : 'fail',
      method: 'independent execFile (shell disabled)',
      command,
      args: [...args],
      exitCode,
      evidenceRef: `sha256:${digest(evidence)}`,
      outputSha256: digest(stdout + '\0' + stderr),
      error: executionError,
    };
  });

  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    taskId: task.taskId,
    verificationStatus: criteria.every(result => result.status === 'pass') ? 'pass' : 'fail',
    independentlyDerived: true,
    workspacePath,
    criteria,
    missingCriteria: criteria.filter(result => result.status !== 'pass').map(result => result.criterionId),
  });
}

module.exports = { verifyAcceptance };
