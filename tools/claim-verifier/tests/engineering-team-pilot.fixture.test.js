'use strict';

// Disposable, no-network pilot fixture. This is a deterministic test provider,
// not an external-agent or OpenHands integration.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT_VERSION,
  ProviderRegistry,
  dispatchTask,
} = require('../../../utils/engineering-agent-runtime');
const { verifyAcceptance } = require('../engineering-task-verifier');
const { ClaimVerifier, sha256 } = require('../claim-verifier');

async function run() {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'agenttube-disposable-pilot-'));
  const startedAt = Date.now();
  try {
    const testSource = [
      "const assert = require('assert');",
      "const slugify = require('./slugify');",
      "assert.strictEqual(slugify('Crème brûlée, Café!'), 'creme-brulee-cafe');",
      "assert.strictEqual(slugify('  Hello   World  '), 'hello-world');",
    ].join('\n');
    const task = {
      contractVersion: CONTRACT_VERSION,
      taskId: 'PILOT-SLUGIFY-1',
      objective: 'Implement a deterministic slugify function for an isolated disposable project.',
      authorizedScope: ['slugify.js in this disposable workspace'],
      exclusions: ['active repository', 'network', 'credentials', 'paid model calls'],
      dependencies: [],
      inputs: ['behavior asserted by acceptance.test.js'],
      deliverables: ['slugify.js'],
      acceptanceCriteria: [{
        id: 'slugify-behavior',
        description: 'Accents, punctuation, whitespace, and lowercase behavior match the test assertions.',
        verification: { kind: 'command', command: process.execPath, args: ['acceptance.test.js'], timeoutMs: 5000 },
      }],
      allowedCommands: [process.execPath],
      forbiddenActions: ['network access', 'writes outside the disposable workspace', 'self-acceptance'],
      expectedEvidence: ['slugify.js', 'acceptance test exit code and output hash'],
      requiredCapabilities: ['executeTask', 'boundedExecution', 'workspaceAccess'],
      resourceLimits: { timeoutMs: 10000 },
      executionBackend: { id: 'disposable-os-temp-fixture' },
    };
    fs.writeFileSync(path.join(workspacePath, 'acceptance.test.js'), testSource);

    const adapter = {
      manifest: {
        contractVersion: CONTRACT_VERSION,
        id: 'disposable-test-provider',
        name: 'Disposable deterministic test provider',
        adapterVersion: '1.0.0',
        protocol: 'local test fixture',
        launchMethod: 'bounded in-process fixture',
        capabilities: ['executeTask', 'boundedExecution', 'workspaceAccess'],
        authentication: [],
        executionConstraints: ['writes only slugify.js under the disposable workspace'],
        requiredDependencies: [],
        knownLimitations: ['not an AI agent; not an external integration'],
      },
      async checkAvailability() { return { available: true }; },
      async validatePrerequisites(request) {
        return request.workspacePath === workspacePath ? { ok: true } : { ok: false, reason: 'workspace mismatch' };
      },
      async executeTask(request) {
        const implementation = [
          "'use strict';",
          'module.exports = function slugify(value) {',
          "  return value.normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');",
          '};',
          '',
        ].join('\n');
        fs.writeFileSync(path.join(request.workspacePath, 'slugify.js'), implementation);
        return {
          contractVersion: CONTRACT_VERSION,
          taskId: request.task.taskId,
          executionId: 'fixture-execution-1',
          providerId: request.providerId,
          adapterVersion: this.manifest.adapterVersion,
          status: 'succeeded',
          startedAt: new Date(startedAt).toISOString(),
          completedAt: new Date().toISOString(),
          processExitCode: 0,
          logs: [{ stream: 'stdout', text: 'wrote slugify.js in disposable workspace' }],
          changedFiles: ['slugify.js'],
          artifactRefs: [],
          errors: [],
          warnings: [],
          unexecutedSteps: [],
        };
      },
      async cancelTask() { return { cancelled: false }; },
      async closeTask() { return { closed: true }; },
    };

    const registry = new ProviderRegistry();
    registry.register(adapter);
    const request = {
      task,
      providerId: 'disposable-test-provider',
      workspaceId: 'disposable-pilot-workspace',
      workspacePath,
      timeoutMs: 10000,
      inputRefs: [],
      outputRefs: [],
    };
    const execution = await dispatchTask(registry, request);
    assert.strictEqual(execution.status, 'succeeded');
    assert.strictEqual(execution.providerId, 'disposable-test-provider');

    const policy = new ClaimVerifier({
      workspaceRoot: workspacePath,
      commandCatalog: {
        'slugify-acceptance': { command: process.execPath, args: ['acceptance.test.js'], timeoutMs: 5000 },
      },
      criteria: [
        { id: 'implementation', kind: 'implementation', path: 'slugify.js', requiredText: ['module.exports', 'normalize'], notStub: true },
        { id: 'behavior', kind: 'test', testPath: 'acceptance.test.js', expectedSha256: sha256(testSource), commandId: 'slugify-acceptance' },
      ],
    });
    const receipt = policy.runAuthorizedCommand('slugify-acceptance');
    const review = policy.verify({ claims: [
      { criterionId: 'implementation', evidenceRef: 'file:slugify.js', reportedStatus: 'PASS' },
      { criterionId: 'behavior', evidenceRef: 'file:acceptance.test.js', reportedStatus: 'PASS', executionReceiptId: receipt.receiptId },
    ] });
    assert.strictEqual(review.criteria.every(criterion => criterion.status === 'pass'), true);
    assert.strictEqual(review.status, 'REVIEW_REQUIRED');
    assert.strictEqual(review.policyTrustStatus, 'CALLER_SUPPLIED_POLICY_REVIEW_REQUIRED');

    const taskVerification = verifyAcceptance(task, workspacePath);
    assert.strictEqual(taskVerification.verificationStatus, 'pass');
    assert.strictEqual(taskVerification.independentlyDerived, true);

    const invalidClaimVerifier = new ClaimVerifier({
      workspaceRoot: workspacePath,
      criteria: [{ id: 'unfulfilled-deliverable', kind: 'file', path: 'missing-deliverable.md', minBytes: 1 }],
    });
    const invalidClaim = invalidClaimVerifier.verify({
      reportedOverallStatus: 'PASS',
      claims: [{ criterionId: 'unfulfilled-deliverable', evidenceRef: 'file:missing-deliverable.md', reportedStatus: 'PASS' }],
    });
    assert.strictEqual(invalidClaim.status, 'FAIL');
    assert.strictEqual(invalidClaim.criteria[0].status, 'fail');

    console.log(JSON.stringify({
      pilot: 'disposable provider-interface fixture',
      providerType: 'deterministic test provider; not a live external agent',
      workspaceOutsideRepository: !workspacePath.startsWith(path.resolve(__dirname, '../../..')),
      implementationStatus: execution.status,
      independentSourceAndTestReview: review.criteria.every(criterion => criterion.status === 'pass') ? 'criterion observations pass; aggregate REVIEW_REQUIRED because fixture policy is caller-supplied' : review.status,
      canonicalTaskVerification: taskVerification.verificationStatus,
      deliberatelyInvalidCompletionClaim: invalidClaim.status,
      invalidClaimFailure: invalidClaim.criteria[0].errors[0].code,
      implementationAttempts: 1,
      retries: 0,
      verifierRuns: 2,
      elapsedMs: Date.now() - startedAt,
      externalIndependentReviewer: false,
      productivityBaseline: null,
      resourceBenchmark: null,
    }));
  } finally {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
}

if (require.main === module) {
  run().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { run };
