'use strict';

const assert = require('assert');
const { EventEmitter } = require('events');
const fs = require('fs');
const { PassThrough } = require('stream');
const path = require('path');
const {
  CONTRACT_VERSION,
  ProviderRegistry,
  registerConfiguredProviders,
  dispatchTask,
  createCheckpoint,
  validateCheckpoint,
  validateExecutionResult,
} = require('../utils/engineering-agent-runtime');
const { KiloCliAdapter } = require('../utils/engineering-agent-providers/kilo-cli');
const { verifyAcceptance } = require('../tools/claim-verifier/engineering-task-verifier');

function makeTask(overrides = {}) {
  return {
    contractVersion: CONTRACT_VERSION,
    taskId: 'ENG-PORTABILITY-1',
    objective: 'Demonstrate provider-neutral task dispatch and independent verification.',
    authorizedScope: ['isolated test fixture only'],
    exclusions: ['production source', 'credentials', 'paid model calls'],
    dependencies: [],
    inputs: ['canonical task contract'],
    deliverables: ['structured execution result'],
    acceptanceCriteria: [
      { id: 'result-shape', description: 'Result is normalized and tied to the requested provider.', verification: { kind: 'command', command: process.execPath, args: ['-e', 'process.exit(0)'], timeoutMs: 2000 } },
      { id: 'independent-check', description: 'Acceptance follows a deterministic independent check.', verification: { kind: 'command', command: process.execPath, args: ['-e', 'process.exit(0)'], timeoutMs: 2000 } },
    ],
    allowedCommands: [process.execPath],
    forbiddenActions: ['network', 'production mutation', 'self-acceptance'],
    expectedEvidence: ['execution result', 'independent test exit code'],
    requiredCapabilities: ['executeTask', 'boundedExecution'],
    resourceLimits: { timeoutMs: 10000 },
    modelProvider: { mode: 'provider-managed-or-explicit', providerId: 'test-only', modelId: null },
    executionBackend: { id: 'in-process-fixture', isolated: true },
    ...overrides,
  };
}

function makeFixtureAdapter(id, onExecute = async () => {}) {
  const manifest = Object.freeze({
    contractVersion: CONTRACT_VERSION,
    id,
    name: `Fixture ${id}`,
    adapterVersion: 'test-1',
    protocol: 'internal-test-adapter',
    launchMethod: 'in-process deterministic fixture',
    capabilities: ['executeTask', 'boundedExecution', 'cancellation', 'streamingEvents', 'structuredOutput', 'workspaceAccess', 'workspaceIsolation', 'checkpointResume'],
    authentication: [],
    executionConstraints: ['tests only; no external process or network'],
    requiredDependencies: [],
    knownLimitations: [],
  });
  return {
    manifest,
    async checkAvailability() { return { available: true, version: 'fixture-1' }; },
    async validatePrerequisites() { return { ok: true }; },
    async executeTask(request) {
      await onExecute(request);
      return {
        contractVersion: CONTRACT_VERSION,
        taskId: request.task.taskId,
        executionId: `${id}-execution-1`,
        providerId: id,
        adapterVersion: manifest.adapterVersion,
        status: 'succeeded',
        startedAt: '2026-10-15T00:00:00.000Z',
        completedAt: '2026-10-15T00:00:01.000Z',
        processExitCode: 0,
        logs: [{ stream: 'stdout', text: 'fixture completed' }],
        changedFiles: [],
        artifactRefs: [],
        errors: [],
        warnings: [],
        unexecutedSteps: [],
      };
    },
    async cancelTask() { return { cancelled: false }; },
    async closeTask() { return { closed: true }; },
  };
}

function fakeChild(exitCode, output = '') {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => true;
  process.nextTick(() => {
    if (output) child.stdout.write(output);
    child.stdout.end();
    child.stderr.end();
    child.emit('close', exitCode, null);
  });
  return child;
}

async function runEngineeringAgentProviderTests() {
  const observedCommands = [];
  const kilo = new KiloCliAdapter({
    allowUnsandboxedExecution: true,
    spawnProcess(command, args, options) {
      observedCommands.push({ command, args, options });
      return fakeChild(0, args[0] === '--version' ? 'kilo fixture-version\n' : 'api_key=sk-testsecret0123456789\n');
    },
  });
  const alternate = makeFixtureAdapter('alternate-fixture');
  const config = {
    contractVersion: CONTRACT_VERSION,
    providers: [{ id: 'kilo-cli', enabled: true }, { id: 'alternate-fixture', enabled: true }],
  };
  const registry = registerConfiguredProviders(new ProviderRegistry(), config, [kilo, alternate]);
  assert.deepStrictEqual(registry.list(), ['alternate-fixture', 'kilo-cli']);

  const task = makeTask();
  const request = {
    task,
    providerId: 'kilo-cli',
    workspaceId: 'isolated-fixture',
    workspacePath: path.resolve('/tmp/engineering-agent-provider-fixture'),
    timeoutMs: 10000,
    inputRefs: [],
    outputRefs: [],
  };

  // A: Kilo is registered and selected as a plugin, not as a domain default.
  const savedApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'provider-environment-test-secret';
  let kiloResult;
  try {
    kiloResult = await dispatchTask(registry, request);
  } finally {
    if (savedApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedApiKey;
  }
  assert.strictEqual(kiloResult.providerId, 'kilo-cli');
  assert.strictEqual(kiloResult.status, 'succeeded');
  assert.strictEqual(observedCommands[0].args[0], '--version');
  assert.strictEqual(observedCommands[1].args[0], 'run');
  assert.strictEqual(observedCommands[1].options.cwd, request.workspacePath);
  assert.strictEqual(Object.hasOwn(observedCommands[1].options.env, 'OPENAI_API_KEY'), false);
  assert(kiloResult.logs[0].text.includes('[REDACTED]'));
  assert(!kiloResult.logs[0].text.includes('sk-testsecret0123456789'));
  assert(!observedCommands[1].args.includes('--auto'), 'Kilo adapter must not auto-approve tools');

  // B/E: a second provider receives the same canonical task and output contract.
  let alternateTaskId = null;
  const alternateRegistry = new ProviderRegistry();
  alternateRegistry.register(makeFixtureAdapter('alternate-fixture', received => { alternateTaskId = received.task.taskId; }));
  const alternateResult = await dispatchTask(alternateRegistry, { ...request, providerId: 'alternate-fixture' });
  assert.strictEqual(alternateTaskId, task.taskId);
  assert.strictEqual(alternateResult.providerId, 'alternate-fixture');
  assert.strictEqual(alternateResult.taskId, kiloResult.taskId);
  assert.strictEqual(alternateResult.status, kiloResult.status);
  assert.strictEqual(validateExecutionResult({ ...kiloResult, accepted: true }, request).valid, false);
  const selfAccepting = makeFixtureAdapter('self-accepting');
  const fixtureExecute = selfAccepting.executeTask;
  selfAccepting.executeTask = async received => ({ ...(await fixtureExecute(received)), accepted: true });
  const selfAcceptRegistry = new ProviderRegistry();
  selfAcceptRegistry.register(selfAccepting);
  await assert.rejects(dispatchTask(selfAcceptRegistry, { ...request, providerId: 'self-accepting' }), { code: 'INVALID_EXECUTION_RESULT' });

  // C: explicit routing never falls back; unknown and disabled providers fail clearly.
  await assert.rejects(dispatchTask(registry, { ...request, providerId: 'not-installed' }), { code: 'PROVIDER_UNAVAILABLE' });
  const disabledRegistry = new ProviderRegistry();
  disabledRegistry.register(makeFixtureAdapter('alternate-fixture'));
  disabledRegistry.disable('alternate-fixture');
  await assert.rejects(dispatchTask(disabledRegistry, { ...request, providerId: 'alternate-fixture' }), { code: 'PROVIDER_DISABLED' });
  await assert.rejects(dispatchTask(registry, { ...request, providerId: undefined }), { code: 'INVALID_EXECUTION_REQUEST' });

  // F: mandatory unsupported capabilities block dispatch before the adapter runs.
  const isolatedTask = makeTask({ requiredCapabilities: ['executeTask', 'workspaceIsolation'] });
  await assert.rejects(dispatchTask(registry, { ...request, task: isolatedTask }), { code: 'CAPABILITY_MISMATCH' });
  const unsafeKilo = new KiloCliAdapter({ allowUnsandboxedExecution: true, spawnProcess: () => fakeChild(0) });
  assert.strictEqual((await unsafeKilo.validatePrerequisites({ task: isolatedTask })).ok, false);
  const safeDefaults = new KiloCliAdapter();
  assert.strictEqual((await safeDefaults.validatePrerequisites({ task })).ok, false, 'unsandboxed Kilo execution must be opt-in');

  // G: provider-neutral checkpoints transfer task state/evidence, not conversations.
  const checkpoint = createCheckpoint({
    task, status: 'in_progress', completedCriteria: ['result-shape'], remainingCriteria: ['independent-check'],
    workspaceId: 'isolated-fixture', changedFiles: ['example.js'], evidenceRefs: ['sha256:fixture'],
    failures: ['independent check not run'], nextAuthorizedAction: 'run the deterministic independent check',
  });
  assert.strictEqual(validateCheckpoint(checkpoint).valid, true);
  assert.strictEqual(checkpoint.taskId, task.taskId);
  assert.strictEqual(checkpoint.providerConversationId, undefined);
  assert.strictEqual(validateCheckpoint({ ...checkpoint, providerConversationId: 'native-session' }).valid, false);
  const withoutKilo = new ProviderRegistry();
  let receivedCheckpoint = null;
  withoutKilo.register(makeFixtureAdapter('alternate-fixture', received => { receivedCheckpoint = received.checkpoint; }));
  const afterRemoval = await dispatchTask(withoutKilo, { ...request, providerId: 'alternate-fixture', checkpoint });
  assert.strictEqual(afterRemoval.taskId, checkpoint.taskId);
  assert.deepStrictEqual(receivedCheckpoint, checkpoint);
  await assert.rejects(dispatchTask(withoutKilo, { ...request, providerId: 'alternate-fixture', checkpoint: { ...checkpoint, task: makeTask({ objective: 'changed task' }) } }), { code: 'INVALID_EXECUTION_REQUEST' });

  // D: no Kilo registration is required for the workflow contracts or verifier.
  assert.deepStrictEqual(withoutKilo.list(), ['alternate-fixture']);
  const root = path.resolve(__dirname, '..');
  const governance = fs.readFileSync(path.join(root, 'docs/CONTEXT-GOVERNANCE.md'), 'utf8');
  const roadmap = fs.readFileSync(path.join(root, 'video_platform_roadmap.md'), 'utf8');
  const operatingModel = fs.readFileSync(path.join(root, 'docs/ENGINEERING-AGENT-OPERATING-MODEL.md'), 'utf8');
  const reportingStandard = fs.readFileSync(path.join(root, 'docs/ENGINEERING-REPORTING-STANDARD.md'), 'utf8');
  const orchestrationCore = fs.readFileSync(path.join(root, 'utils/engineering-agent-runtime.js'), 'utf8');
  assert(governance.includes('KiloCode is one replaceable coding-agent provider.'));
  assert(governance.includes('video_platform_roadmap.md'));
  assert(roadmap.includes('## Stage 0 — Baseline, scope, and acceptance authority'));
  assert(roadmap.includes('## Stage 10 — Production qualification and throughput'));
  assert(operatingModel.includes('tools/claim-verifier/engineering-task-verifier.js'));
  assert(reportingStandard.includes('Context Governance §20'));
  assert(!/kilo/i.test(orchestrationCore), 'Kilo-specific assumptions must not leak into the orchestration core');
  for (const reference of [
    'docs/CONTEXT-GOVERNANCE.md', 'docs/ENGINEERING-AGENT-OPERATING-MODEL.md',
    'docs/ENGINEERING-REPORTING-STANDARD.md', 'tools/claim-verifier/engineering-task-verifier.js',
    'config/engineering-agents.example.json', 'utils/engineering-agent-providers/kilo-cli.js',
    'video_platform_roadmap.md', 'data/roadmap/ROADMAP.md',
  ]) assert(fs.existsSync(path.join(root, reference)), `governance reference does not resolve: ${reference}`);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root, 'config/engineering-agents.example.json'), 'utf8')).providers[0].enabled, false);
  const passing = verifyAcceptance(task, process.cwd());
  assert.strictEqual(passing.verificationStatus, 'pass');
  assert.strictEqual(passing.independentlyDerived, true);
  assert(passing.criteria.every(criterion => criterion.exitCode === 0 && criterion.evidenceRef.startsWith('sha256:')));

  // H: independent deterministic observation, with negative case, controls acceptance.
  const negativeTask = makeTask({ acceptanceCriteria: task.acceptanceCriteria.map((criterion, index) => index === 0
    ? { ...criterion, verification: { ...criterion.verification, args: ['-e', 'process.exit(7)'] } }
    : criterion) });
  const negative = verifyAcceptance(negativeTask, process.cwd());
  assert.strictEqual(negative.criteria[0].exitCode, 7);
  assert.strictEqual(negative.verificationStatus, 'fail');
  assert.deepStrictEqual(negative.missingCriteria, ['result-shape']);
  assert.strictEqual(kiloResult.status, 'succeeded', 'agent completion cannot override independent negative evidence');

  const humanTask = makeTask({ acceptanceCriteria: [{ id: 'editorial', description: 'Human editorial approval.', verification: { kind: 'human', owner: 'product owner' } }] });
  assert.strictEqual(verifyAcceptance(humanTask, process.cwd()).verificationStatus, 'fail');

  // Verify no credential is part of task/result/checkpoint contracts.
  const serialized = JSON.stringify({ task, kiloResult, checkpoint, verification: passing });
  assert(!serialized.includes('sk-testsecret0123456789'));
  assert(!serialized.includes('provider-environment-test-secret'));

  return { passed: 8, failed: 0 };
}

if (require.main === module) {
  runEngineeringAgentProviderTests()
    .then(result => console.log(`Engineering agent provider tests: ${result.passed}/${result.passed + result.failed} passed`))
    .catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { runEngineeringAgentProviderTests };
