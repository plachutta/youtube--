'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  ClaimVerifier,
  STAGES,
  REQUIRED_SECTIONS,
  sha256,
  canonicalJson,
  buildRoadmapTraceabilityGraph,
  validateRoadmapTraceabilityGraph,
  createCanonicalRoadmapVerifier,
  loadRoadmapReviewerTrust,
  validateRoadmapText,
  validateRoadmapFile,
} = require('../claim-verifier');

const results = [];
function record(name, expected, actual, evidence) {
  results.push({ name, expected, actual, evidence });
  assert.strictEqual(actual, expected, `${name}: ${JSON.stringify(evidence)}`);
}
function write(root, relativePath, value) {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, value);
  return fullPath;
}
function validRoadmap() {
  const lines = ['# Example governed roadmap', 'Canonical roadmap file: video_platform_roadmap.md.', 'Product objective: Produce exceptional, coherent, technically reliable videos.', 'The accepted B9.30 narration is frozen. KiloCode is one replaceable agent provider. No paid API. Never execute phase5-inject.js. VITE_NOT_READY remains blocked.'];
  STAGES.forEach((stage, index) => {
    lines.push('', `## Stage ${index} — ${stage}`);
    for (const section of REQUIRED_SECTIONS) {
      const details = section === 'Deliverables'
        ? `For ${stage}, the deliverables include a stage-specific report, evidence manifest, and acceptance record with a bounded verification sequence.`
        : `For ${stage}, the ${section.toLowerCase()} specifies a bounded implementation sequence, evidence artifact, deterministic check, and owner-visible stop condition.`;
      lines.push('', `### ${section}`, details);
    }
    lines.push('', 'This stage also identifies dependencies, failure recovery, resource caps, source provenance, and what later stage may start after its gate passes. '.repeat(4));
  });
  return `${lines.join('\n')}\n`;
}
function commandCatalog() {
  return {
    'fixture-pass': { command: process.execPath, args: ['-e', 'process.stdout.write("fixture passed\\n"); process.exit(0);'], timeoutMs: 3000 },
    'fixture-eval-with-test-argument': { command: process.execPath, args: ['-e', 'process.exit(0);', 'tests/unit.test.js'], timeoutMs: 3000 },
    'fixture-test': { command: process.execPath, args: ['tests/unit.test.js'], timeoutMs: 3000 },
    'fixture-never-run': { command: process.execPath, args: ['tests/never-run.test.js'], timeoutMs: 3000 },
    'fixture-fail': { command: process.execPath, args: ['tests/failing.test.js'], timeoutMs: 3000 },
    'render-fresh-fixture': {
      command: process.execPath,
      args: ['-e', 'const f=require("fs"),c=require("crypto");const b=Buffer.from("isolated rendered fixture");f.writeFileSync("render.mp4",b);f.writeFileSync("render.json",JSON.stringify({renderExecuted:true,rendererId:"motion-canvas-fixture",artifactSha256:c.createHash("sha256").update(b).digest("hex")}));'],
      timeoutMs: 3000,
    },
    'render-success-no-output': {
      command: process.execPath,
      args: ['-e', 'process.stdout.write("renderer command returned success but produced no artifact\\n"); process.exit(0);'],
      timeoutMs: 3000,
    },
  };
}
function verifier(root, criteria, options = {}) {
  return new ClaimVerifier({ workspaceRoot: root, criteria, commandCatalog: options.commandCatalog || commandCatalog(), maxExecutionAgeMs: 60000 });
}
function claim(criterionId, evidenceRef, extra = {}) {
  return { criterionId, evidenceRef, reportedStatus: 'PASS', ...extra };
}
function expected(result, criterionId) {
  return result.criteria.find(entry => entry.criterionId === criterionId);
}
function replaceSectionText(roadmap, section, contentForStage) {
  const lines = roadmap.split(/\r?\n/);
  let stageIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (/^## Stage \d+ — /.test(lines[index])) stageIndex += 1;
    if (lines[index] === `### ${section}`) lines[index + 1] = contentForStage(stageIndex, lines[index + 1]);
  }
  return `${lines.join('\n')}${roadmap.endsWith('\n') ? '\n' : ''}`;
}
function signedRoadmapReview({ artifactHash, reviewerId, role, purpose, criterionIds, privateKey, reviewedAt = new Date().toISOString() }) {
  const reviewedCriterionIds = [...criterionIds].sort();
  const payload = {
    reviewerType: 'human',
    reviewerId,
    reviewerRole: role,
    reviewPurpose: purpose,
    reviewedCriterionIds,
    criterionObservations: reviewedCriterionIds.map(criterionId => ({
      criterionId,
      observation: `Reviewed the roadmap evidence for ${criterionId} and recorded the fixture decision.`,
      decision: 'accepted',
    })),
    decision: 'accepted',
    artifactSha256: artifactHash,
    reviewRef: `fixture ${purpose}`,
  };
  return { ...payload, signature: crypto.sign(null, Buffer.from(canonicalJson(payload)), privateKey).toString('base64') };
}
function roadmapReviewCriteria(roadmapPath, semanticPublicKey, ownerPublicKey) {
  return [
    {
      id: 'roadmap-semantic-review', kind: 'human', reviewPurpose: 'semantic_review', requiredReviewerRole: 'independent_reviewer',
      requiredCriterionIds: ['roadmap-semantic-criteria'],
      reviewPath: 'semantic-review.json', artifactPath: roadmapPath,
      trustedReviewers: { semanticReviewer: { publicKey: semanticPublicKey, roles: ['independent_reviewer'], purposes: ['semantic_review'] } },
    },
    {
      id: 'roadmap-owner-acceptance', kind: 'human', reviewPurpose: 'owner_acceptance', requiredReviewerRole: 'product_owner',
      requiredCriterionIds: ['roadmap-owner-approval'],
      reviewPath: 'owner-acceptance.json', artifactPath: roadmapPath,
      trustedReviewers: { productOwner: { publicKey: ownerPublicKey, roles: ['product_owner'], purposes: ['owner_acceptance'] } },
    },
  ];
}
async function run() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-verifier-qualification-'));
  try {
    const road = validRoadmap();
    write(tempRoot, 'video_platform_roadmap.md', road);
    const unitTestSource = "const assert = require('assert'); assert.strictEqual(2 + 2, 4);\n";
    const failingTestSource = 'process.exit(7);\n';
    write(tempRoot, 'tests/unit.test.js', unitTestSource);
    write(tempRoot, 'tests/failing.test.js', failingTestSource);

    // 1. Structural validity is distinct from meaning; placeholders still fail structural requirements.
    const short = '# Roadmap\nStatus: PASS\n- In progress\n- Renderer blocked\n';
    const shortResult = validateRoadmapText(short);
    record('status-summary placeholder structurally rejected', 'FAIL', shortResult.structuralStatus, shortResult.structuralErrors);

    // 2. Required headings without section contents are structurally incomplete.
    const headingsOnly = ['# Roadmap', ...STAGES.flatMap((stage, index) => [`## Stage ${index} — ${stage}`, ...REQUIRED_SECTIONS.map(section => `### ${section}`)])].join('\n');
    const headingsResult = validateRoadmapText(headingsOnly);
    record('empty required sections structurally rejected', 'FAIL', headingsResult.structuralStatus, headingsResult.structuralErrors.slice(0, 4));

    // 2b. Same generic deliverable categories can be structurally present and traceable, but never prove semantic adequacy.
    const repeatedGeneric = replaceSectionText(road, 'Deliverables', () => 'report; schema; manifest; evidence record.');
    const repeatedResult = validateRoadmapText(repeatedGeneric, buildRoadmapTraceabilityGraph(repeatedGeneric));
    record('repeated generic deliverables remain semantic review', 'REVIEW_REQUIRED', repeatedResult.status, {
      structural: repeatedResult.structuralStatus,
      traceability: repeatedResult.traceabilityStatus,
      semantic: repeatedResult.semanticStatus,
    });

    // 2c. Permanent regression of the exact B9.49 shape through the public ClaimVerifier API.
    const labels = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo'];
    const uniqueGeneric = replaceSectionText(road, 'Deliverables', stageIndex => `For ${labels[stageIndex]} stage, a generic deliverable report schema artifact satisfies the gate.`);
    const uniqueFixturePath = 'fixtures/b949-unique-generic-roadmap.md';
    write(tempRoot, uniqueFixturePath, uniqueGeneric);
    const uniqueFixtureHash = sha256(uniqueGeneric);
    const uniquePolicy = verifier(tempRoot, [{ id: 'semantic-roadmap', kind: 'roadmap', path: uniqueFixturePath, traceabilityGraph: buildRoadmapTraceabilityGraph(uniqueGeneric) }]);
    const uniqueResult = uniquePolicy.verify({ claims: [claim('semantic-roadmap', `file:${uniqueFixturePath}`, { traceabilityGraph: { semanticStatus: 'PASS', ownerAcceptance: 'ACCEPTED' } })] });
    const uniqueEvidence = expected(uniqueResult, 'semantic-roadmap').evidence;
    record('B9.49 unique-marker roadmap cannot derive PASS', 'REVIEW_REQUIRED', uniqueResult.status, {
      fixtureBytes: Buffer.byteLength(uniqueGeneric),
      fixtureSha256: uniqueFixtureHash,
      criterion: uniqueEvidence,
    });

    // 2d. Non-observable acceptance prose receives REVIEW_REQUIRED, not semantic PASS.
    const vagueAcceptance = replaceSectionText(road, 'Acceptance criteria', stageIndex => `For stage ${stageIndex}, success is meaningful, good, ready, and sufficient for the project.`);
    write(tempRoot, 'fixtures/non-observable-acceptance.md', vagueAcceptance);
    const vaguePolicy = verifier(tempRoot, [{ id: 'vague-roadmap', kind: 'roadmap', path: 'fixtures/non-observable-acceptance.md', traceabilityGraph: buildRoadmapTraceabilityGraph(vagueAcceptance) }]);
    const vagueResult = vaguePolicy.verify({ claims: [claim('vague-roadmap', 'file:fixtures/non-observable-acceptance.md')] });
    record('complete headings with non-observable criteria require semantic review', 'REVIEW_REQUIRED', vagueResult.status, {
      structural: expected(vagueResult, 'vague-roadmap').evidence.structuralStatus,
      traceability: expected(vagueResult, 'vague-roadmap').evidence.traceabilityStatus,
      semantic: expected(vagueResult, 'vague-roadmap').evidence.semanticStatus,
    });

    // 2e. The generated graph is structurally checkable, while invented validation IDs fail traceability.
    const expectedGraph = buildRoadmapTraceabilityGraph(road);
    const inventedMethodGraph = JSON.parse(JSON.stringify(expectedGraph));
    inventedMethodGraph.stages[0].acceptanceLinks[0].validationMethodIds[0] = 'S99-TEST-99';
    const inventedMethodCheck = validateRoadmapTraceabilityGraph(inventedMethodGraph, expectedGraph);
    record('invented validation method identifier rejected', false, inventedMethodCheck.valid, inventedMethodCheck.errors);
    const inventedMethodPolicy = verifier(tempRoot, [{ id: 'bad-traceability', kind: 'roadmap', path: 'video_platform_roadmap.md', traceabilityGraph: inventedMethodGraph }]);
    const inventedMethodResult = inventedMethodPolicy.verify({ claims: [claim('bad-traceability', 'file:video_platform_roadmap.md')] });
    record('invented traceability policy prevents overall PASS', 'FAIL', inventedMethodResult.status, expected(inventedMethodResult, 'bad-traceability').errors);

    // 2f. Future output paths are not required to exist, but must be linked to an acceptance criterion.
    const pathRoadmap = replaceSectionText(road, 'Deliverables', (stageIndex, existing) => stageIndex === 0 ? 'dist/output/scene.mp4; dist/output/manifest.json' : existing);
    const pathGraph = buildRoadmapTraceabilityGraph(pathRoadmap);
    const pathStructural = validateRoadmapText(pathRoadmap);
    record('planned deliverable paths need not exist before execution', 'PASS/REVIEW_REQUIRED', `${pathStructural.structuralStatus}/${pathStructural.status}`, pathGraph.stages[0].fields.deliverables);
    const missingDeliveryLinkGraph = JSON.parse(JSON.stringify(pathGraph));
    missingDeliveryLinkGraph.stages[0].acceptanceLinks[0].deliverableIds = [];
    const missingDeliveryLinkCheck = validateRoadmapTraceabilityGraph(missingDeliveryLinkGraph, pathGraph);
    record('untraced valid-looking deliverable path rejected', false, missingDeliveryLinkCheck.valid, missingDeliveryLinkCheck.errors);

    // 3. Missing deliverable is independently detected by a policy-bound file check.
    {
      const v = verifier(tempRoot, [{ id: 'report', kind: 'file', path: 'evidence/report.md', requiredText: ['Acceptance matrix'] }]);
      const out = v.verify({ claims: [claim('report', 'file:evidence/report.md')] });
      record('missing claimed deliverable rejected', 'fail', expected(out, 'report').status, expected(out, 'report').errors);
    }

    // 4. Test file existence and agent-reported PASS do not mean the test ran.
    {
      const v = verifier(tempRoot, [{ id: 'unit', kind: 'test', testPath: 'tests/unit.test.js', expectedSha256: sha256(unitTestSource), commandId: 'fixture-test' }]);
      const out = v.verify({ claims: [claim('unit', 'file:tests/unit.test.js', { reportedExecution: { exitCode: 0, status: 'PASS' } })] });
      record('defined test without verifier execution rejected', 'fail', expected(out, 'unit').status, expected(out, 'unit').errors);
    }

    // A fresh successful command that does not invoke the test file is not test evidence.
    {
      let rejected;
      try { verifier(tempRoot, [{ id: 'unbound-test', kind: 'test', testPath: 'tests/unit.test.js', expectedSha256: sha256(unitTestSource), commandId: 'fixture-pass' }]); } catch (error) { rejected = error; }
      record('unrelated fresh command cannot attest test file', 'INVALID_POLICY', rejected?.code || null, rejected?.message);
    }

    {
      let rejected;
      try { verifier(tempRoot, [{ id: 'eval-test', kind: 'test', testPath: 'tests/unit.test.js', expectedSha256: sha256(unitTestSource), commandId: 'fixture-eval-with-test-argument' }]); } catch (error) { rejected = error; }
      record('Node eval cannot masquerade as test-file execution', 'INVALID_POLICY', rejected?.code || null, rejected?.message);
    }

    {
      let rejected;
      try { verifier(tempRoot, [{ id: 'option-path', kind: 'test', testPath: '--eval=process.exit(0)', commandId: 'fixture-test' }]); } catch (error) { rejected = error; }
      record('Node option-shaped test path rejected', 'INVALID_POLICY', rejected?.code || null, rejected?.message);
    }

    // 5. Serialized historical execution evidence is not a fresh receipt from this verifier run.
    {
      const v = verifier(tempRoot, [{ id: 'history', kind: 'test', testPath: 'tests/unit.test.js', expectedSha256: sha256(unitTestSource), commandId: 'fixture-test' }]);
      const out = v.verify({ claims: [claim('history', 'file:tests/unit.test.js', { executionReceiptId: 'old-pass-2024', executedAt: '2024-01-01T00:00:00Z' })] });
      record('stale historical PASS rejected', 'fail', expected(out, 'history').status, expected(out, 'history').errors);
    }

    {
      const v = verifier(tempRoot, [{ id: 'wrong-command', kind: 'test', testPath: 'tests/unit.test.js', expectedSha256: sha256(unitTestSource), commandId: 'fixture-test' }]);
      const unrelatedReceipt = v.runAuthorizedCommand('fixture-pass');
      const out = v.verify({ claims: [claim('wrong-command', 'file:tests/unit.test.js', { executionReceiptId: unrelatedReceipt.receiptId })] });
      record('receipt for a different command cannot authorize test', 'fail', expected(out, 'wrong-command').status, expected(out, 'wrong-command').errors);
    }

    {
      let now = 1000;
      const v = new ClaimVerifier({
        workspaceRoot: tempRoot,
        criteria: [{ id: 'expired', kind: 'test', testPath: 'tests/unit.test.js', expectedSha256: sha256(unitTestSource), commandId: 'fixture-test' }],
        commandCatalog: commandCatalog(),
        maxExecutionAgeMs: 10,
        now: () => now,
      });
      const receipt = v.runAuthorizedCommand('fixture-test');
      now = receipt.completedAtMs + 11;
      const out = v.verify({ claims: [claim('expired', 'file:tests/unit.test.js', { executionReceiptId: receipt.receiptId })] });
      record('expired fresh receipt cannot authorize test', 'fail', expected(out, 'expired').status, expected(out, 'expired').errors);
    }

    {
      const missingExitScript = "process.kill(process.pid, 'SIGTERM');\n";
      write(tempRoot, 'tests/no-exit.test.js', missingExitScript);
      const v = new ClaimVerifier({
        workspaceRoot: tempRoot,
        criteria: [{ id: 'missing-exit', kind: 'test', testPath: 'tests/no-exit.test.js', expectedSha256: sha256(missingExitScript), commandId: 'fixture-no-exit' }],
        commandCatalog: { 'fixture-no-exit': { command: process.execPath, args: ['tests/no-exit.test.js'], timeoutMs: 3000 } },
      });
      const receipt = v.runAuthorizedCommand('fixture-no-exit');
      const out = v.verify({ claims: [claim('missing-exit', 'file:tests/no-exit.test.js', { executionReceiptId: receipt.receiptId })] });
      record('command without successful exit status cannot pass', 'fail', expected(out, 'missing-exit').status, { exitCode: receipt.exitCode, errors: expected(out, 'missing-exit').errors });
    }

    {
      const v = verifier(tempRoot, [{ id: 'changed-test', kind: 'test', testPath: 'tests/unit.test.js', expectedSha256: sha256(unitTestSource), commandId: 'fixture-test' }]);
      const receipt = v.runAuthorizedCommand('fixture-test');
      write(tempRoot, 'tests/unit.test.js', 'process.exit(0);\n');
      const out = v.verify({ claims: [claim('changed-test', 'file:tests/unit.test.js', { executionReceiptId: receipt.receiptId })] });
      record('test source changed after execution rejected', 'fail', expected(out, 'changed-test').status, expected(out, 'changed-test').errors);
      write(tempRoot, 'tests/unit.test.js', unitTestSource);
    }

    {
      const failingSource = "const assert = require('assert'); assert.fail('this failing test must never be accepted');\n";
      write(tempRoot, 'tests/never-run.test.js', failingSource);
      const v = verifier(tempRoot, [{ id: 'never-run', kind: 'test', testPath: 'tests/never-run.test.js', expectedSha256: sha256(failingSource), commandId: 'fixture-never-run' }]);
      let rejected;
      try {
        v.receipts.set('forged', { commandId: 'fixture-test', exitCode: 0 });
      } catch (error) {
        rejected = error;
      }
      record('caller cannot forge or replace verifier execution receipts', 'TypeError', rejected?.name || null, {
        publicReceiptStore: v.receipts,
        verifierFrozen: Object.isFrozen(v),
      });
    }

    {
      write(tempRoot, 'tests/unit.test.js', 'process.exit(0);\n');
      const v = verifier(tempRoot, [{ id: 'prechanged-test', kind: 'test', testPath: 'tests/unit.test.js', expectedSha256: sha256(unitTestSource), commandId: 'fixture-test' }]);
      let rejected;
      try { v.runAuthorizedCommand('fixture-test'); } catch (error) { rejected = error; }
      record('test source replaced before execution rejected', 'TEST_SOURCE_HASH_MISMATCH', rejected?.code || null, rejected?.message);
      write(tempRoot, 'tests/unit.test.js', unitTestSource);
    }

    // 6. A component file that only exports an interface/stub is not implementation evidence.
    write(tempRoot, 'components/timeline.js', "module.exports = { render() { throw new Error('not implemented'); } };\n");
    {
      const v = verifier(tempRoot, [{ id: 'component', kind: 'implementation', path: 'components/timeline.js', minBytes: 1, forbiddenPatterns: ['not implemented'] }]);
      const out = v.verify({ claims: [claim('component', 'file:components/timeline.js')] });
      record('stub component rejected', 'fail', expected(out, 'component').status, expected(out, 'component').errors);
    }

    // 7. A renderer label and reported PASS without verifier-owned execution/output is not a render.
    {
      const v = verifier(tempRoot, [{ id: 'renderer', kind: 'render', commandId: 'render-fresh-fixture', manifestPath: 'render.json', artifactPath: 'render.mp4', rendererId: 'motion-canvas-fixture' }]);
      const out = v.verify({ claims: [claim('renderer', 'render:render.json', { renderer: 'motion-canvas-fixture', reportedStatus: 'PASS' })] });
      record('renderer claim without actual execution rejected', 'fail', expected(out, 'renderer').status, expected(out, 'renderer').errors);
    }

    // 8. A successful authorized command that creates no artifact cannot pass render verification.
    {
      const v = verifier(tempRoot, [{ id: 'no-output', kind: 'render', commandId: 'render-success-no-output', manifestPath: 'missing-render.json', artifactPath: 'missing-render.mp4', rendererId: 'motion-canvas-fixture' }]);
      const receipt = v.runAuthorizedCommand('render-success-no-output');
      const out = v.verify({ claims: [claim('no-output', 'render:missing-render.json', { executionReceiptId: receipt.receiptId })] });
      record('successful command with missing output rejected', 'fail', expected(out, 'no-output').status, expected(out, 'no-output').errors);
    }

    // 9. A self-consistent-looking manifest cannot hide a mismatch with the actual artifact bytes.
    {
      const v = verifier(tempRoot, [{ id: 'bad-hash', kind: 'render', commandId: 'render-fresh-fixture', manifestPath: 'render.json', artifactPath: 'render.mp4', rendererId: 'motion-canvas-fixture' }]);
      const receipt = v.runAuthorizedCommand('render-fresh-fixture');
      write(tempRoot, 'render.mp4', 'tampered after renderer completion');
      const out = v.verify({ claims: [claim('bad-hash', 'render:render.json', { executionReceiptId: receipt.receiptId })] });
      record('artifact hash mismatch independently detected', 'fail', expected(out, 'bad-hash').status, expected(out, 'bad-hash').errors);
    }

    // 9b. Render evidence is policy-bound, and technical rendering cannot imply subjective acceptance.
    {
      const renderPolicy = { id: 'render-boundary', kind: 'render', commandId: 'render-fresh-fixture', manifestPath: 'render.json', artifactPath: 'render.mp4', rendererId: 'motion-canvas-fixture' };
      const v = verifier(tempRoot, [renderPolicy]);
      const receipt = v.runAuthorizedCommand('render-fresh-fixture');
      const wrongReference = v.verify({ claims: [claim('render-boundary', 'file:render.json', { executionReceiptId: receipt.receiptId })] });
      record('render evidence reference must match policy', 'fail', expected(wrongReference, 'render-boundary').status, expected(wrongReference, 'render-boundary').errors);

      const humanPolicy = { id: 'human-visual-review', kind: 'human', reviewPath: 'visual-review.json', artifactPath: 'render.mp4', trustedReviewers: {} };
      const gated = verifier(tempRoot, [renderPolicy, humanPolicy]);
      const freshReceipt = gated.runAuthorizedCommand('render-fresh-fixture');
      const combined = gated.verify({ reportedOverallStatus: 'HUMAN_ACCEPTED', claims: [
        claim('render-boundary', 'render:render.json', { executionReceiptId: freshReceipt.receiptId }),
        claim('human-visual-review', 'file:visual-review.json', { reportedStatus: 'HUMAN_ACCEPTED' }),
      ] });
      record('technical render does not imply subjective visual acceptance', 'FAIL', combined.status, {
        renderStatus: expected(combined, 'render-boundary').status,
        humanReviewStatus: expected(combined, 'human-visual-review').status,
      });
    }

    // 10. An agent's overall PASS is contradicted by an independently executed mandatory failure.
    {
      const criteria = [
        { id: 'positive', kind: 'test', testPath: 'tests/unit.test.js', expectedSha256: sha256(unitTestSource), commandId: 'fixture-test' },
        { id: 'mandatory-failure', kind: 'test', testPath: 'tests/failing.test.js', expectedSha256: sha256(failingTestSource), commandId: 'fixture-fail' },
      ];
      const v = verifier(tempRoot, criteria);
      const passReceipt = v.runAuthorizedCommand('fixture-test');
      const failReceipt = v.runAuthorizedCommand('fixture-fail');
      const out = v.verify({ reportedOverallStatus: 'PASS', claims: [
        claim('positive', 'file:tests/unit.test.js', { executionReceiptId: passReceipt.receiptId }),
        claim('mandatory-failure', 'file:tests/unit.test.js', { executionReceiptId: failReceipt.receiptId }),
      ] });
      record('contradictory PASS blocked by mandatory failure', 'FAIL', out.status, { failedRequiredCriteria: out.failedRequiredCriteria, failureReceiptExitCode: failReceipt.exitCode });
    }

    // 11. Human acceptance requires trust outside the caller/review record.
    {
      const artifact = write(tempRoot, 'reviewed.mp4', 'review fixture');
      const callerKeyPolicy = [{ id: 'human-review', kind: 'human', reviewPath: 'review.json', artifactPath: 'reviewed.mp4', trustedReviewers: { caller: { publicKey: 'caller-supplied-public-key', roles: ['product_owner'], purposes: ['owner_acceptance'] } } }];
      let policyRejected;
      try { verifier(tempRoot, callerKeyPolicy); } catch (error) { policyRejected = error; }
      record('caller-supplied public key cannot establish reviewer trust', 'UNTRUSTED_REVIEWER_POLICY', policyRejected?.code || null, policyRejected?.message);

      const policy = [{ id: 'human-review', kind: 'human', reviewPath: 'review.json', artifactPath: 'reviewed.mp4', trustedReviewers: {} }];
      const v = verifier(tempRoot, policy);
      const missing = v.verify({ claims: [claim('human-review', 'file:review.json', { reportedStatus: 'HUMAN_ACCEPTED' })] });
      record('unverified human acceptance claim rejected', 'fail', expected(missing, 'human-review').status, expected(missing, 'human-review').errors);
      const review = { reviewerType: 'agent', reviewerId: 'agent-self', decision: 'accepted', artifactSha256: sha256(fs.readFileSync(artifact)), reviewedAt: new Date().toISOString() };
      write(tempRoot, 'review.json', JSON.stringify(review));
      const fake = v.verify({ claims: [claim('human-review', 'file:review.json', { reportedStatus: 'HUMAN_ACCEPTED' })] });
      record('agent-created human review rejected', 'fail', expected(fake, 'human-review').status, expected(fake, 'human-review').errors);
      const signedLookingReview = { reviewerType: 'human', reviewerId: 'caller-key', decision: 'accepted', artifactSha256: sha256(fs.readFileSync(artifact)), reviewedAt: new Date().toISOString(), reviewRef: 'caller-supplied', reviewerPublicKey: 'caller-supplied-key', signature: 'caller-supplied-signature' };
      write(tempRoot, 'review.json', JSON.stringify(signedLookingReview));
      const unknown = v.verify({ claims: [claim('human-review', 'file:review.json', { reportedStatus: 'HUMAN_ACCEPTED', trustedReviewers: { 'caller-key': 'caller-supplied-key' } })] });
      record('caller-supplied key in record or request cannot create reviewer trust', 'fail', expected(unknown, 'human-review').status, expected(unknown, 'human-review').errors);
      signedLookingReview.artifactSha256 = sha256('different artifact');
      write(tempRoot, 'review.json', JSON.stringify(signedLookingReview));
      const tampered = v.verify({ claims: [claim('human-review', 'file:review.json', { reportedStatus: 'HUMAN_ACCEPTED' })] });
      record('review for different artifact rejected', 'fail', expected(tampered, 'human-review').status, expected(tampered, 'human-review').errors);
    }

    // 11b. A direct caller cannot choose roadmap reviewer keys and turn them into trust anchors.
    {
      const semanticKeys = crypto.generateKeyPairSync('ed25519');
      const ownerKeys = crypto.generateKeyPairSync('ed25519');
      const attackerCriteria = roadmapReviewCriteria(
        'video_platform_roadmap.md',
        semanticKeys.publicKey.export({ type: 'spki', format: 'pem' }),
        ownerKeys.publicKey.export({ type: 'spki', format: 'pem' }),
      );
      const hash = sha256(fs.readFileSync(path.join(tempRoot, 'video_platform_roadmap.md')));
      write(tempRoot, 'semantic-review.json', JSON.stringify(signedRoadmapReview({
        artifactHash: hash, reviewerId: 'semanticReviewer', role: 'independent_reviewer', purpose: 'semantic_review',
        criterionIds: attackerCriteria[0].requiredCriterionIds, privateKey: semanticKeys.privateKey,
      })));
      write(tempRoot, 'owner-acceptance.json', JSON.stringify(signedRoadmapReview({
        artifactHash: hash, reviewerId: 'productOwner', role: 'product_owner', purpose: 'owner_acceptance',
        criterionIds: attackerCriteria[1].requiredCriterionIds, privateKey: ownerKeys.privateKey,
      })));
      let rejected;
      try { verifier(tempRoot, attackerCriteria); } catch (error) { rejected = error; }
      record('direct ClaimVerifier caller cannot inject roadmap reviewer trust keys', 'UNTRUSTED_REVIEWER_POLICY', rejected?.code || null, rejected?.message);

      const claimed = new ClaimVerifier({ workspaceRoot: tempRoot, criteria: [{ id: 'ordinary-roadmap', kind: 'roadmap', path: 'video_platform_roadmap.md' }] });
      let mutationRejected;
      try { claimed.criteria = [{ id: 'agent-selected', kind: 'file', path: 'video_platform_roadmap.md', minBytes: 1 }]; } catch (error) { mutationRejected = error; }
      record('constructed verifier policy cannot be replaced after creation', 'TypeError', mutationRejected?.name || null, { frozen: Object.isFrozen(claimed), criteriaFrozen: Object.isFrozen(claimed.criteria) });
      const claimedResult = claimed.verify({ reportedOverallStatus: 'PASS', claims: [claim('ordinary-roadmap', 'file:video_platform_roadmap.md')] });
      record('direct unreviewed roadmap assertion cannot overall PASS', 'REVIEW_REQUIRED', claimedResult.status, expected(claimedResult, 'ordinary-roadmap').evidence);
      let resultMutationRejected;
      try { claimedResult.criteria[0].status = 'pass'; } catch (error) { resultMutationRejected = error; }
      record('verified result and nested criteria cannot be mutated after derivation', 'TypeError', resultMutationRejected?.name || null, {
        resultFrozen: Object.isFrozen(claimedResult),
        criteriaFrozen: Object.isFrozen(claimedResult.criteria),
        criterionFrozen: Object.isFrozen(claimedResult.criteria[0]),
        retainedStatus: claimedResult.criteria[0].status,
      });
    }

    {
      let rejected;
      try { verifier(tempRoot, [{ id: 'optional-roadmap', kind: 'roadmap', path: 'video_platform_roadmap.md', required: false }]); } catch (error) { rejected = error; }
      record('roadmap criterion cannot be downgraded to optional', 'INVALID_POLICY', rejected?.code || null, rejected?.message);
    }

    // A signed review for old bytes is stale as soon as the roadmap changes.
    {
      const reviewedPath = 'reviewed-roadmap.md';
      write(tempRoot, reviewedPath, road);
      const criteria = [{
        id: 'bound-review', kind: 'human', reviewPath: 'stale-review.json', artifactPath: reviewedPath, trustedReviewers: {},
      }];
      const hashBeforeEdit = sha256(fs.readFileSync(path.join(tempRoot, reviewedPath)));
      write(tempRoot, 'stale-review.json', JSON.stringify({ reviewerType: 'human', reviewerId: 'unknown', decision: 'accepted', artifactSha256: hashBeforeEdit, reviewedAt: new Date().toISOString(), signature: 'stale-signature' }));
      write(tempRoot, reviewedPath, `${road}\nChanged after signed review.\n`);
      const stale = verifier(tempRoot, criteria).verify({ claims: [claim('bound-review', 'file:stale-review.json', { reportedStatus: 'HUMAN_ACCEPTED' })] });
      record('review bound to stale roadmap hash rejected', 'fail', expected(stale, 'bound-review').status, expected(stale, 'bound-review').errors);
    }

    // A key provided only by the review record is never a trust anchor.
    {
      const criteria = [{
        id: 'trusted-review', kind: 'human', reviewPath: 'untrusted-review.json', artifactPath: 'reviewed-roadmap.md', trustedReviewers: {},
      }];
      const artifactHash = sha256(fs.readFileSync(path.join(tempRoot, 'reviewed-roadmap.md')));
      const forged = { reviewerType: 'human', reviewerId: 'reviewer', reviewerRole: 'independent_reviewer', reviewPurpose: 'semantic_review', reviewedCriterionIds: ['criterion'], criterionObservations: [{ criterionId: 'criterion', observation: 'claimed review', decision: 'accepted' }], decision: 'accepted', artifactSha256: artifactHash, reviewedAt: new Date().toISOString(), reviewerPublicKey: 'untrusted-record-key', signature: 'signature-from-untrusted-key' };
      write(tempRoot, 'untrusted-review.json', JSON.stringify(forged));
      const untrusted = verifier(tempRoot, criteria).verify({ claims: [claim('trusted-review', 'file:untrusted-review.json', { reportedStatus: 'HUMAN_ACCEPTED' })] });
      record('untrusted review key cannot authorize acceptance', 'fail', expected(untrusted, 'trusted-review').status, expected(untrusted, 'trusted-review').errors);
    }

    // 12. A claim cannot choose an executable; only verifier-owned command IDs run.
    {
      const v = verifier(tempRoot, [{ id: 'command', kind: 'test', testPath: 'tests/unit.test.js', expectedSha256: sha256(unitTestSource), commandId: 'fixture-test' }]);
      let unauthorized;
      try { v.runAuthorizedCommand('rm -rf /'); } catch (error) { unauthorized = error; }
      record('unauthorized command refused', 'UNAUTHORIZED_COMMAND', unauthorized?.code || null, unauthorized?.message);
    }

    // 13. Missing references and traversal/symlink escape attempts fail closed.
    {
      const v = verifier(tempRoot, [{ id: 'reference', kind: 'file', path: 'evidence/required.txt', minBytes: 1 }]);
      const missing = v.verify({ claims: [claim('reference', '')] });
      record('missing evidence reference rejected', 'fail', expected(missing, 'reference').status, expected(missing, 'reference').errors);
      const traversal = v.verify({ claims: [claim('reference', 'file:../outside.txt')] });
      record('parent traversal evidence reference rejected', 'fail', expected(traversal, 'reference').status, expected(traversal, 'reference').errors);
    }

    // 14. A supplied PASS field without any matching independently gathered evidence remains failure.
    {
      const v = verifier(tempRoot, [{ id: 'self-pass', kind: 'file', path: 'evidence/missing-self-asserted.txt', minBytes: 1 }]);
      const out = v.verify({ reportedOverallStatus: 'PASS', claims: [claim('self-pass', 'file:evidence/missing-self-asserted.txt', { reportedStatus: 'PASS' })] });
      record('self-reported PASS without policy observation rejected', 'FAIL', out.status, out.criteria);
    }

    // An ordinary completed criterion can PASS; a roadmap without semantic/owner review cannot.
    {
      const v = verifier(tempRoot, [
        { id: 'actual-test', kind: 'test', testPath: 'tests/unit.test.js', expectedSha256: sha256(unitTestSource), commandId: 'fixture-test' },
      ]);
      const receipt = v.runAuthorizedCommand('fixture-test');
      const out = v.verify({ reportedOverallStatus: 'FAIL', claims: [
        claim('actual-test', 'file:tests/unit.test.js', { executionReceiptId: receipt.receiptId }),
      ] });
      record('caller-supplied test policy reports observed criterion pass but aggregate review remains required', 'REVIEW_REQUIRED', out.status, {
        policyTrustStatus: out.policyTrustStatus,
        criterionStatus: expected(out, 'actual-test').status,
        failedRequiredCriteria: out.failedRequiredCriteria,
      });
    }

    {
      const v = verifier(tempRoot, [{ id: 'roadmap', kind: 'roadmap', path: 'video_platform_roadmap.md' }]);
      const out = v.verify({ reportedOverallStatus: 'PASS', claims: [claim('roadmap', 'file:video_platform_roadmap.md')] });
      record('structural and traceable roadmap without owner review is not PASS', 'REVIEW_REQUIRED', out.status, expected(out, 'roadmap').evidence);
    }

    // Independently validate the actual canonical repository roadmap (not just a test fixture).
    {
      const repositoryRoot = path.resolve(__dirname, '../../..');
      const canonicalText = fs.readFileSync(path.join(repositoryRoot, 'video_platform_roadmap.md'), 'utf8');
      const actualGraph = buildRoadmapTraceabilityGraph(canonicalText);
      const actual = validateRoadmapFile({ workspaceRoot: repositoryRoot, relativePath: 'video_platform_roadmap.md', traceabilityGraph: actualGraph });
      record('actual canonical roadmap has structural and traceability PASS', 'PASS/PASS', `${actual.structuralStatus}/${actual.traceabilityStatus}`, actual.structuralErrors.concat(actual.traceabilityErrors));
      record('actual canonical roadmap remains semantic REVIEW_REQUIRED', 'REVIEW_REQUIRED', actual.semanticStatus, actual.ownerAcceptance);
      assert.strictEqual(actual.stageCount, 11);
      const noPolicyIndex = validateRoadmapFile({ workspaceRoot: repositoryRoot, relativePath: 'video_platform_roadmap.md' });
      record('canonical roadmap without verifier-owned traceability index is not traceability PASS', 'REVIEW_REQUIRED', noPolicyIndex.traceabilityStatus, noPolicyIndex.traceabilityErrors);
      const trust = loadRoadmapReviewerTrust(repositoryRoot);
      record('canonical reviewer trust store has no implementation-supplied trust anchor', 0, Object.keys(trust.trustedReviewers).length, trust);
      const trustPolicyPath = 'tools/claim-verifier/policies/video-roadmap-reviewers.json';
      const trustPolicyContent = fs.readFileSync(path.join(repositoryRoot, trustPolicyPath), 'utf8');
      write(tempRoot, trustPolicyPath, trustPolicyContent.replace('"reviewers": []', '"reviewers": [{"id":"agent-added","publicKey":"not-a-trusted-key","roles":["product_owner"],"purposes":["owner_acceptance"]}]'));
      let policyTamper;
      try { loadRoadmapReviewerTrust(tempRoot); } catch (error) { policyTamper = error; }
      record('reviewer trust file cannot be altered without verifier policy update', 'REVIEW_TRUST_POLICY_HASH_MISMATCH', policyTamper?.code || null, policyTamper?.message);
      const canonicalVerifier = createCanonicalRoadmapVerifier({ workspaceRoot: repositoryRoot });
      let canonicalMutationRejected;
      try { canonicalVerifier.criteria = [{ id: 'agent-pass', kind: 'file', path: 'video_platform_roadmap.md', minBytes: 1 }]; } catch (error) { canonicalMutationRejected = error; }
      record('canonical verifier policy cannot be replaced by caller', 'TypeError', canonicalMutationRejected?.name || null, {
        verifierFrozen: Object.isFrozen(canonicalVerifier),
        criteriaFrozen: Object.isFrozen(canonicalVerifier.criteria),
      });
      const canonicalClaims = [
        claim('roadmap', 'file:video_platform_roadmap.md'),
        claim('roadmap-semantic-review', 'file:data/roadmap/semantic-review.json', { reportedStatus: 'PENDING' }),
        claim('roadmap-owner-acceptance', 'file:data/roadmap/owner-acceptance.json', { reportedStatus: 'PENDING' }),
      ];
      const canonicalOutcome = canonicalVerifier.verify({ reportedOverallStatus: 'PASS', claims: canonicalClaims });
      record('canonical policy keeps semantic review and owner acceptance pending', 'REVIEW_REQUIRED', canonicalOutcome.status, {
        structural: expected(canonicalOutcome, 'roadmap').evidence.structuralStatus,
        traceability: expected(canonicalOutcome, 'roadmap').evidence.traceabilityStatus,
        semantic: expected(canonicalOutcome, 'roadmap').evidence.semanticStatus,
        owner: expected(canonicalOutcome, 'roadmap').evidence.ownerAcceptance,
      });
      const oldPointer = validateRoadmapFile({ workspaceRoot: repositoryRoot, relativePath: 'data/roadmap/ROADMAP.md' });
      record('compatibility pointer is not mistaken for canonical roadmap', 'FAIL', oldPointer.structuralStatus, oldPointer.structuralErrors);
    }

    // Unknown executable IDs cannot be supplied through a claim.
    {
      let rejected;
      try { verifier(tempRoot, [{ id: 'not-allowed', kind: 'test', testPath: 'tests/unit.test.js', expectedSha256: sha256(unitTestSource), commandId: 'claim-selected-command' }]); } catch (error) { rejected = error; }
      record('claim-selected executable rejected by verifier policy', 'INVALID_POLICY', rejected?.code || null, rejected?.message);
    }

    console.log(JSON.stringify({ suite: 'claim-verifier adversarial qualification', result: 'PASS', cases: results.length, results }, null, 2));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  run().catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { run, validRoadmap };