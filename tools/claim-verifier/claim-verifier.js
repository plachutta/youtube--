'use strict';

/**
 * Independent, fail-closed claim verification primitives.
 *
 * Claims are assertions, never authority. The verifier reads the workspace,
 * checks evidence paths and hashes, executes only a verifier-owned command
 * catalog via execFile (never a claim-supplied command), and derives the final
 * result from required criteria. Human review is recorded, not inferred.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const VERIFIER_STATE = new WeakMap();

const STAGES = Object.freeze([
  'Baseline, scope, and acceptance authority',
  'Claim verifier qualification',
  'Open-source foundation and adoption decision',
  'Provider-agnostic engineering control plane',
  'Visual capability contracts and registry',
  'Real renderer execution and qualification',
  'First complete visual-capability vertical slice',
  'Controlled remote compute and Colab',
  'Specialist visual capabilities and multi-industry qualification',
  'Coherent composition and complete-video quality',
  'Production qualification and throughput',
]);
const REQUIRED_SECTIONS = Object.freeze([
  'Objective', 'Entry conditions', 'Scope', 'Explicit non-goals', 'Dependencies',
  'Tasks and implementation sequence', 'Deliverables', 'Required tests',
  'Required evidence', 'Resource and compute considerations',
  'Risks and failure modes', 'Hard-stop conditions', 'Acceptance criteria',
  'Exit gate', 'Current state / blocked status',
  'Subsequent work authorized after the gate passes',
]);
const ROADMAP_REVIEW_TRUST_POLICY = 'tools/claim-verifier/policies/video-roadmap-reviewers.json';
const ROADMAP_REVIEW_TRUST_POLICY_SHA256 = '98d40eaf9e516314f034358e507af0704993317d11c3487113737899be91c6d7';
const CANONICAL_ROADMAP_POLICY_AUTHORITY = Symbol('canonical-roadmap-policy-authority');
const ROADMAP_SEMANTIC_CRITERIA = Object.freeze([
  'roadmap-objectives', 'roadmap-deliverables', 'roadmap-acceptance', 'roadmap-risk-coherence',
]);
const ROADMAP_SECTION_KEYS = Object.freeze({
  objective: 'Objective',
  entryConditions: 'Entry conditions',
  scope: 'Scope',
  exclusions: 'Explicit non-goals',
  dependencies: 'Dependencies',
  implementationSequence: 'Tasks and implementation sequence',
  deliverables: 'Deliverables',
  acceptanceCriteria: 'Acceptance criteria',
  validationMethods: 'Required tests',
  evidence: 'Required evidence',
  resources: 'Resource and compute considerations',
  risks: 'Risks and failure modes',
  hardStops: 'Hard-stop conditions',
  exitCondition: 'Exit gate',
  currentState: 'Current state / blocked status',
  subsequentAuthorization: 'Subsequent work authorized after the gate passes',
});

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneAndFreezePolicy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(cloneAndFreezePolicy));
  if (isObject(value)) {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneAndFreezePolicy(item)])));
  }
  return value;
}

function safeResolve(root, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.trim() || path.isAbsolute(relativePath)) {
    fail('INVALID_EVIDENCE_REFERENCE', 'evidence path must be a non-empty workspace-relative path');
  }
  const segments = relativePath.split(/[\\/]+/);
  if (segments.includes('..') || segments.includes('')) {
    fail('INVALID_EVIDENCE_REFERENCE', 'evidence path contains an empty or parent-traversal segment');
  }
  const absoluteRoot = fs.realpathSync(root);
  const candidate = path.resolve(absoluteRoot, relativePath);
  if (candidate !== absoluteRoot && !candidate.startsWith(`${absoluteRoot}${path.sep}`)) {
    fail('INVALID_EVIDENCE_REFERENCE', 'evidence path escapes the verifier workspace');
  }
  if (!fs.existsSync(candidate)) fail('EVIDENCE_MISSING', `evidence path does not exist: ${relativePath}`);
  const realCandidate = fs.realpathSync(candidate);
  if (realCandidate !== absoluteRoot && !realCandidate.startsWith(`${absoluteRoot}${path.sep}`)) {
    fail('INVALID_EVIDENCE_REFERENCE', 'evidence path resolves outside the verifier workspace');
  }
  return realCandidate;
}

function normalizeSectionText(text) {
  return text
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/[`*_#|>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitRoadmapUnits(sectionText, field) {
  const normalized = normalizeSectionText(sectionText);
  if (!normalized) return [];
  const bulletLines = sectionText.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^(?:[-*+]\s+|\d+[.)]\s+)/.test(line))
    .map(line => line.replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, '').trim())
    .filter(Boolean);
  let units = bulletLines.length > 0
    ? bulletLines
    : (field === 'deliverables'
      ? normalized.split(/[;,]\s*/)
      : (field === 'acceptanceCriteria' ? [normalized] : normalized.split(/;\s*/)));
  units = units.map(unit => unit.replace(/^and\s+/i, '').replace(/[.;]+$/, '').trim()).filter(Boolean);
  return units.length > 0 ? units : [normalized];
}

function parseRoadmapStructure(text) {
  const errors = [];
  if (typeof text !== 'string') {
    return { errors: ['roadmap content must be text'], stages: [], sectionTextByStage: [] };
  }
  const lines = text.split(/\r?\n/);
  const foundStageHeadings = lines
    .map((line, lineIndex) => ({ line, lineIndex }))
    .filter(item => /^## Stage \d+ — /.test(item.line));
  const stages = [];
  for (let index = 0; index < STAGES.length; index += 1) {
    const heading = `## Stage ${index} — ${STAGES[index]}`;
    const matches = foundStageHeadings.filter(item => item.line === heading);
    if (matches.length !== 1) {
      errors.push(`stage ${index} must appear exactly once with its canonical title`);
      continue;
    }
    stages.push({ number: index, id: `S${String(index).padStart(2, '0')}`, heading, start: matches[0].lineIndex });
  }
  if (foundStageHeadings.length !== STAGES.length) errors.push(`roadmap must contain exactly ${STAGES.length} canonical stage headings`);
  const sectionTextByStage = [];
  for (const stage of stages) {
    const nextStage = stages.find(candidate => candidate.number > stage.number);
    const end = nextStage ? nextStage.start : lines.length;
    const body = lines.slice(stage.start, end);
    const sectionText = {};
    for (const required of REQUIRED_SECTIONS) {
      const heading = `### ${required}`;
      const occurrences = body.filter(line => line === heading).length;
      if (occurrences !== 1) {
        errors.push(`stage ${stage.number} must contain exactly one "${heading}" subsection`);
        continue;
      }
      const sectionIndex = body.indexOf(heading);
      const nextHeading = body.findIndex((line, lineIndex) => lineIndex > sectionIndex && /^### /.test(line));
      const rawSection = body.slice(sectionIndex + 1, nextHeading < 0 ? body.length : nextHeading)
        .filter(line => line.trim() && !/^---+$/.test(line.trim()))
        .join('\n');
      const normalized = normalizeSectionText(rawSection);
      if (!normalized || /^(?:todo|tbd|placeholder|coming soon)\.?$/i.test(normalized)) {
        errors.push(`stage ${stage.number} subsection "${required}" is empty or placeholder-only`);
      }
      sectionText[required] = rawSection;
      if (required === 'Dependencies') {
        const declaredStageDependencies = [...rawSection.matchAll(/\bStage\s+(\d+)\b/gi)].map(match => Number(match[1]));
        for (const dependency of declaredStageDependencies) {
          if (!Number.isInteger(dependency) || dependency < 0 || dependency >= stage.number) {
            errors.push(`stage ${stage.number} has a forward, self, or invalid stage dependency: Stage ${dependency}`);
          }
        }
      }
    }
    sectionTextByStage.push({ ...stage, sections: sectionText });
  }
  for (let index = 0; index < stages.length - 1; index += 1) {
    if (stages[index].start >= stages[index + 1].start) errors.push('roadmap stages must be ordered from Stage 0 through Stage 10');
  }
  return { errors, stages, sectionTextByStage };
}

function sourceReference(stageId, section, unit, unitIndex, field) {
  const prefixes = {
    objective: 'OBJ', entryConditions: 'ENTRY', scope: 'SCOPE', exclusions: 'NON-GOAL',
    dependencies: 'DEP', implementationSequence: 'PLAN', deliverables: 'D',
    acceptanceCriteria: 'AC', validationMethods: 'TEST', evidence: 'EVID',
    resources: 'RESOURCE', risks: 'RISK', hardStops: 'STOP', exitCondition: 'EXIT',
    currentState: 'STATE', subsequentAuthorization: 'NEXT',
  };
  return {
    section,
    unitIndex,
    sha256: sha256(unit),
    id: `${stageId}-${prefixes[field]}-${String(unitIndex + 1).padStart(2, '0')}`,
  };
}

function buildRoadmapTraceabilityGraph(text, parsed = parseRoadmapStructure(text)) {
  const stages = parsed.sectionTextByStage.map(stage => {
    const fields = Object.fromEntries(Object.entries(ROADMAP_SECTION_KEYS).map(([key, section]) => {
      const raw = stage.sections[section] || '';
      const units = splitRoadmapUnits(raw, key);
      return [key, units.map((unit, unitIndex) => sourceReference(stage.id, section, unit, unitIndex, key))];
    }));
    const criteria = fields.acceptanceCriteria.map(criterion => ({
      id: criterion.id,
      objectiveIds: fields.objective.map(item => item.id),
      dependencyIds: fields.dependencies.map(item => item.id),
      deliverableIds: fields.deliverables.map(item => item.id),
      validationMethodIds: fields.validationMethods.map(item => item.id),
      evidenceIds: fields.evidence.map(item => item.id),
      exitConditionIds: fields.exitCondition.map(item => item.id),
    }));
    return {
      stageId: stage.id,
      heading: stage.heading,
      fields,
      acceptanceLinks: criteria,
      exitRequiresCriterionIds: fields.acceptanceCriteria.map(item => item.id),
    };
  });
  return {
    schemaVersion: 1,
    mappingGranularity: 'stage-exit',
    roadmapSha256: sha256(typeof text === 'string' ? text : ''),
    stages,
  };
}

function validateRoadmapTraceabilityGraph(graph, expectedGraph) {
  const errors = [];
  if (!isObject(graph) || graph.schemaVersion !== 1 || !Array.isArray(graph.stages)) {
    return { valid: false, errors: ['traceability graph must use schemaVersion 1 and contain stages'] };
  }
  if (!isObject(expectedGraph) || graph.roadmapSha256 !== expectedGraph.roadmapSha256) {
    errors.push('traceability graph does not bind to the current roadmap hash');
  }
  const knownIds = new Set();
  for (const stage of graph.stages) {
    if (!isObject(stage) || typeof stage.stageId !== 'string' || !isObject(stage.fields)) {
      errors.push('traceability stage record has invalid shape');
      continue;
    }
    for (const refs of Object.values(stage.fields)) {
      if (!Array.isArray(refs)) {
        errors.push(`traceability field in ${stage.stageId} must be an array`);
        continue;
      }
      for (const ref of refs) {
        if (!isObject(ref) || typeof ref.id !== 'string' || typeof ref.section !== 'string' || !Number.isInteger(ref.unitIndex) || !/^[a-f0-9]{64}$/.test(ref.sha256)) {
          errors.push(`invalid source reference in ${stage.stageId}`);
          continue;
        }
        if (knownIds.has(ref.id)) errors.push(`duplicate traceability identifier: ${ref.id}`);
        knownIds.add(ref.id);
      }
    }
  }
  if (Array.isArray(graph.stages)) {
    for (const stage of graph.stages) {
      if (!Array.isArray(stage.acceptanceLinks) || !Array.isArray(stage.exitRequiresCriterionIds)) {
        errors.push(`traceability relationships are missing in ${stage.stageId || 'unknown stage'}`);
        continue;
      }
      const criterionIds = (stage.fields?.acceptanceCriteria || []).map(ref => ref.id);
      const objectiveIds = (stage.fields?.objective || []).map(ref => ref.id);
      const dependencyIds = (stage.fields?.dependencies || []).map(ref => ref.id);
      const deliverableIds = (stage.fields?.deliverables || []).map(ref => ref.id);
      const methodIds = (stage.fields?.validationMethods || []).map(ref => ref.id);
      const evidenceIds = (stage.fields?.evidence || []).map(ref => ref.id);
      const exitConditionIds = (stage.fields?.exitCondition || []).map(ref => ref.id);
      for (const link of stage.acceptanceLinks) {
        if (!isObject(link)) {
          errors.push(`invalid acceptance traceability link in ${stage.stageId}`);
          continue;
        }
        const linkedDeliverables = Array.isArray(link.deliverableIds) ? link.deliverableIds : [];
        const linkedObjectives = Array.isArray(link.objectiveIds) ? link.objectiveIds : [];
        const linkedDependencies = Array.isArray(link.dependencyIds) ? link.dependencyIds : [];
        const linkedMethods = Array.isArray(link.validationMethodIds) ? link.validationMethodIds : [];
        const linkedEvidence = Array.isArray(link.evidenceIds) ? link.evidenceIds : [];
        const linkedExitConditions = Array.isArray(link.exitConditionIds) ? link.exitConditionIds : [];
        if (!criterionIds.includes(link.id)) errors.push(`unknown acceptance criterion identifier: ${link.id}`);
        for (const id of linkedObjectives) if (!objectiveIds.includes(id)) errors.push(`unresolved objective identifier: ${id}`);
        for (const id of linkedDependencies) if (!dependencyIds.includes(id)) errors.push(`unresolved dependency identifier: ${id}`);
        for (const id of linkedDeliverables) if (!deliverableIds.includes(id)) errors.push(`unresolved deliverable identifier: ${id}`);
        for (const id of linkedMethods) if (!methodIds.includes(id)) errors.push(`unresolved validation method identifier: ${id}`);
        for (const id of linkedEvidence) if (!evidenceIds.includes(id)) errors.push(`unresolved evidence identifier: ${id}`);
        for (const id of linkedExitConditions) if (!exitConditionIds.includes(id)) errors.push(`unresolved exit-condition identifier: ${id}`);
        if (!linkedObjectives.length || !linkedDeliverables.length || !linkedMethods.length || !linkedEvidence.length || !linkedExitConditions.length) {
          errors.push(`acceptance criterion ${link.id} must link to objectives, deliverables, validation methods, evidence, and exit conditions`);
        }
        if (canonicalJson([...linkedObjectives].sort()) !== canonicalJson([...objectiveIds].sort())) errors.push(`acceptance criterion ${link.id} does not trace every stage objective`);
        if (canonicalJson([...linkedDependencies].sort()) !== canonicalJson([...dependencyIds].sort())) errors.push(`acceptance criterion ${link.id} does not trace every stage dependency`);
        if (canonicalJson([...linkedDeliverables].sort()) !== canonicalJson([...deliverableIds].sort())) errors.push(`acceptance criterion ${link.id} does not cover every stage deliverable`);
        if (canonicalJson([...linkedMethods].sort()) !== canonicalJson([...methodIds].sort())) errors.push(`acceptance criterion ${link.id} does not resolve to every declared stage validation method`);
        if (canonicalJson([...linkedEvidence].sort()) !== canonicalJson([...evidenceIds].sort())) errors.push(`acceptance criterion ${link.id} does not cover every declared evidence reference`);
        if (canonicalJson([...linkedExitConditions].sort()) !== canonicalJson([...exitConditionIds].sort())) errors.push(`acceptance criterion ${link.id} does not trace every stage exit condition`);
      }
      for (const id of deliverableIds) {
        if (!stage.acceptanceLinks.some(link => link.deliverableIds?.includes(id))) errors.push(`untraced deliverable identifier: ${id}`);
      }
      if (canonicalJson(stage.exitRequiresCriterionIds) !== canonicalJson(criterionIds)) errors.push(`exit condition for ${stage.stageId} must require every acceptance criterion`);
    }
  }
  if (expectedGraph && canonicalJson(graph) !== canonicalJson(expectedGraph)) errors.push('traceability graph does not match the verifier-derived source map');
  return { valid: errors.length === 0, errors };
}

function loadRoadmapReviewerTrust(workspaceRoot, relativePath = ROADMAP_REVIEW_TRUST_POLICY) {
  if (relativePath !== ROADMAP_REVIEW_TRUST_POLICY) fail('REVIEW_TRUST_POLICY_INVALID', 'roadmap reviewer trust policy path is verifier-fixed');
  const policyPath = safeResolve(workspaceRoot, relativePath);
  if (!fs.statSync(policyPath).isFile()) fail('REVIEW_TRUST_POLICY_INVALID', 'roadmap reviewer policy is not a regular file');
  const policyBytes = fs.readFileSync(policyPath);
  const policyDigest = sha256(policyBytes);
  if (policyDigest !== ROADMAP_REVIEW_TRUST_POLICY_SHA256) fail('REVIEW_TRUST_POLICY_HASH_MISMATCH', 'roadmap reviewer trust policy differs from verifier-pinned policy');
  const policy = JSON.parse(policyBytes.toString('utf8'));
  if (!isObject(policy) || policy.schemaVersion !== 1 || !Array.isArray(policy.reviewers)) {
    fail('REVIEW_TRUST_POLICY_INVALID', 'roadmap reviewer policy must use schemaVersion 1 and contain reviewers');
  }
  if (!isObject(policy.requiredRoles)
    || policy.requiredRoles.semantic_review !== 'independent_reviewer'
    || policy.requiredRoles.owner_acceptance !== 'product_owner') {
    fail('REVIEW_TRUST_POLICY_INVALID', 'roadmap reviewer policy must preserve independent-reviewer and product-owner role separation');
  }
  const trustedReviewers = {};
  for (const reviewer of policy.reviewers) {
    if (!isObject(reviewer) || typeof reviewer.id !== 'string' || !reviewer.id
      || typeof reviewer.publicKey !== 'string' || !Array.isArray(reviewer.roles)
      || !Array.isArray(reviewer.purposes)
      || reviewer.roles.some(role => !['independent_reviewer', 'product_owner'].includes(role))
      || reviewer.purposes.some(purpose => !['semantic_review', 'owner_acceptance'].includes(purpose))) {
      fail('REVIEW_TRUST_POLICY_INVALID', 'reviewer entries require id, publicKey, roles, and purposes');
    }
    if (Object.hasOwn(trustedReviewers, reviewer.id)) fail('REVIEW_TRUST_POLICY_INVALID', `duplicate reviewer id: ${reviewer.id}`);
    try {
      crypto.createPublicKey(reviewer.publicKey);
    } catch (_error) {
      fail('REVIEW_TRUST_POLICY_INVALID', `reviewer public key is invalid: ${reviewer.id}`);
    }
    trustedReviewers[reviewer.id] = {
      publicKey: reviewer.publicKey,
      roles: [...new Set(reviewer.roles)],
      purposes: [...new Set(reviewer.purposes)],
    };
  }
  return { policyPath: relativePath, policySha256: policyDigest, trustedReviewers };
}

function createCanonicalRoadmapCriteria({ workspaceRoot, roadmapPath = 'video_platform_roadmap.md' }) {
  const roadmapFile = safeResolve(workspaceRoot, roadmapPath);
  if (!fs.statSync(roadmapFile).isFile()) fail('ROADMAP_READ_FAILED', 'canonical roadmap is not a regular file');
  const roadmapText = fs.readFileSync(roadmapFile, 'utf8');
  const trust = loadRoadmapReviewerTrust(workspaceRoot);
  const trustedReviewers = trust.trustedReviewers;
  const traceabilityGraph = buildRoadmapTraceabilityGraph(roadmapText);
  return [
    {
      id: 'roadmap',
      kind: 'roadmap',
      path: roadmapPath,
      traceabilityGraph,
      semanticReviewCriterionId: 'roadmap-semantic-review',
      ownerAcceptanceCriterionId: 'roadmap-owner-acceptance',
      reviewerPolicyPath: trust.policyPath,
      reviewerPolicySha256: trust.policySha256,
    },
    {
      id: 'roadmap-semantic-review',
      kind: 'human',
      reviewPurpose: 'semantic_review',
      requiredReviewerRole: 'independent_reviewer',
      requiredCriterionIds: [...ROADMAP_SEMANTIC_CRITERIA],
      reviewPath: 'data/roadmap/semantic-review.json',
      artifactPath: roadmapPath,
      trustedReviewers,
    },
    {
      id: 'roadmap-owner-acceptance',
      kind: 'human',
      reviewPurpose: 'owner_acceptance',
      requiredReviewerRole: 'product_owner',
      requiredCriterionIds: ['roadmap-owner-approval'],
      reviewPath: 'data/roadmap/owner-acceptance.json',
      artifactPath: roadmapPath,
      trustedReviewers,
    },
  ];
}

function createCanonicalRoadmapVerifier({ workspaceRoot }) {
  const options = {
    workspaceRoot,
    criteria: createCanonicalRoadmapCriteria({ workspaceRoot }),
  };
  Object.defineProperty(options, CANONICAL_ROADMAP_POLICY_AUTHORITY, { value: true });
  return new ClaimVerifier(options);
}

function validateRoadmapText(text, policyTraceabilityGraph = null) {
  const parsed = parseRoadmapStructure(text);
  const expectedGraph = buildRoadmapTraceabilityGraph(text, parsed);
  const graph = policyTraceabilityGraph || null;
  const traceability = graph
    ? validateRoadmapTraceabilityGraph(graph, expectedGraph)
    : { valid: false, errors: ['no verifier-owned traceability index is configured for this roadmap'] };
  const structuralStatus = parsed.errors.length === 0 ? 'PASS' : 'FAIL';
  const traceabilityStatus = structuralStatus === 'FAIL'
    ? 'FAIL'
    : (graph ? (traceability.valid ? 'PASS' : 'FAIL') : 'REVIEW_REQUIRED');
  const status = structuralStatus === 'FAIL' || traceabilityStatus === 'FAIL' ? 'FAIL' : 'REVIEW_REQUIRED';
  return {
    status,
    structuralStatus,
    structuralErrors: parsed.errors,
    traceabilityStatus,
    traceabilityErrors: traceability.errors,
    semanticStatus: 'REVIEW_REQUIRED',
    ownerAcceptance: 'PENDING',
    semanticLimitation: 'The verifier checks section structure and source-bound stage-level links; it does not establish that objectives, deliverables, criteria, or methods are substantively adequate.',
    stageCount: parsed.stages.length,
    traceabilityGraph: graph,
  };
}

function validateLocalMarkdownLinks(workspaceRoot, filePath, text) {
  const errors = [];
  const root = fs.realpathSync(workspaceRoot);
  const links = [...text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1].trim());
  for (const rawLink of links) {
    if (/^(?:https?:|mailto:|#)/i.test(rawLink)) continue;
    const target = decodeURIComponent(rawLink.split(/[ #]/, 1)[0]);
    if (!target) continue;
    const candidate = path.resolve(path.dirname(filePath), target);
    if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
      errors.push(`local roadmap link escapes workspace: ${rawLink}`);
      continue;
    }
    if (!fs.existsSync(candidate)) {
      errors.push(`local roadmap link does not resolve: ${rawLink}`);
      continue;
    }
    const realCandidate = fs.realpathSync(candidate);
    if (realCandidate !== root && !realCandidate.startsWith(`${root}${path.sep}`)) errors.push(`local roadmap link resolves outside workspace: ${rawLink}`);
  }
  return errors;
}

function validateRoadmapFile({ workspaceRoot, relativePath = 'video_platform_roadmap.md', traceabilityGraph = null }) {
  try {
    const filePath = safeResolve(workspaceRoot, relativePath);
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return { status: 'FAIL', structuralStatus: 'FAIL', structuralErrors: ['roadmap path is not a regular file'], traceabilityStatus: 'FAIL', traceabilityErrors: [], semanticStatus: 'NOT_ASSESSED', ownerAcceptance: 'PENDING', path: relativePath };
    const content = fs.readFileSync(filePath, 'utf8');
    const result = validateRoadmapText(content, traceabilityGraph);
    const linkErrors = validateLocalMarkdownLinks(workspaceRoot, filePath, content);
    const structuralErrors = [...result.structuralErrors, ...linkErrors];
    const structuralStatus = structuralErrors.length === 0 ? 'PASS' : 'FAIL';
    const traceabilityStatus = structuralStatus === 'FAIL' ? 'FAIL' : result.traceabilityStatus;
    const status = structuralStatus === 'FAIL' || traceabilityStatus === 'FAIL' ? 'FAIL' : 'REVIEW_REQUIRED';
    return { ...result, status, structuralStatus, structuralErrors, traceabilityStatus, path: relativePath, sha256: sha256(content), bytes: stat.size };
  } catch (error) {
    return { status: 'FAIL', structuralStatus: 'FAIL', structuralErrors: [error.message], traceabilityStatus: 'FAIL', traceabilityErrors: [], semanticStatus: 'NOT_ASSESSED', ownerAcceptance: 'PENDING', code: error.code || 'ROADMAP_READ_FAILED', path: relativePath };
  }
}

function inspectFile({ workspaceRoot, relativePath, requiredText = [], forbiddenPatterns = [], expectedSha256 = null, minBytes = 0, notStub = false }) {
  const filePath = safeResolve(workspaceRoot, relativePath);
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) fail('EVIDENCE_NOT_FILE', `evidence path is not a regular file: ${relativePath}`);
  if (Number.isInteger(minBytes) && minBytes > 0 && stat.size < minBytes) fail('EVIDENCE_TOO_SMALL', `${relativePath} is ${stat.size} bytes; policy requires at least ${minBytes}`);
  const content = fs.readFileSync(filePath, 'utf8');
  const digest = sha256(content);
  if (expectedSha256 && digest !== expectedSha256) fail('EVIDENCE_HASH_MISMATCH', `SHA-256 mismatch for ${relativePath}`);
  for (const marker of requiredText) if (!content.includes(marker)) fail('DELIVERABLE_CONTENT_MISSING', `required content not found in ${relativePath}: ${marker}`);
  for (const pattern of forbiddenPatterns) {
    const regex = pattern instanceof RegExp ? pattern : new RegExp(String(pattern), 'i');
    if (regex.test(content)) fail('STUB_IMPLEMENTATION', `stub marker detected in ${relativePath}: ${regex}`);
  }
  if (notStub && /(?:throw\s+new\s+Error\(['"]not implemented|TODO_IMPLEMENT|pass\s*(?:#.*)?$)/im.test(content)) {
    fail('STUB_IMPLEMENTATION', `implementation appears to be a stub: ${relativePath}`);
  }
  return { path: relativePath, sha256: digest, bytes: stat.size, mtimeMs: stat.mtimeMs };
}

class ClaimVerifier {
  constructor(options) {
    const { workspaceRoot, criteria, commandCatalog = {}, maxExecutionAgeMs = 5 * 60 * 1000, now = () => Date.now() } = options;
    if (typeof workspaceRoot !== 'string' || !path.isAbsolute(workspaceRoot) || !fs.statSync(workspaceRoot).isDirectory()) {
      fail('INVALID_WORKSPACE', 'workspaceRoot must be an existing absolute directory');
    }
    if (!Array.isArray(criteria) || criteria.length === 0) fail('INVALID_POLICY', 'at least one verifier-owned criterion is required');
    this.workspaceRoot = fs.realpathSync(workspaceRoot);
    this.canonicalRoadmapAuthority = options[CANONICAL_ROADMAP_POLICY_AUTHORITY] === true;
    this.trustedPolicyAuthority = this.canonicalRoadmapAuthority;
    this.criteria = Object.freeze(criteria.map(criterion => cloneAndFreezePolicy({ required: true, ...criterion })));
    const registeredCommands = new Map(Object.entries(commandCatalog).map(([id, spec]) => {
      if (!isObject(spec)) fail('INVALID_COMMAND_POLICY', `allowlisted command ${id} must be an object`);
      const copiedSpec = { ...spec };
      if (Array.isArray(spec.args)) copiedSpec.args = Object.freeze([...spec.args]);
      return [id, Object.freeze(copiedSpec)];
    }));
    VERIFIER_STATE.set(this, { commandCatalog: registeredCommands, receipts: new Map() });
    this.maxExecutionAgeMs = maxExecutionAgeMs;
    this.now = now;
    const ids = new Set();
    for (const criterion of this.criteria) {
      if (typeof criterion.id !== 'string' || !criterion.id || ids.has(criterion.id)) fail('INVALID_POLICY', 'criteria require unique non-empty ids');
      ids.add(criterion.id);
      if (!['roadmap', 'file', 'implementation', 'test', 'render', 'human'].includes(criterion.kind)) fail('INVALID_POLICY', `unsupported criterion kind: ${criterion.kind}`);
      if (criterion.kind === 'test' || criterion.kind === 'render') {
        if (typeof criterion.commandId !== 'string' || !registeredCommands.has(criterion.commandId)) fail('INVALID_POLICY', `criterion ${criterion.id} must use a verifier-registered command`);
      }
      if (criterion.kind === 'test') {
        const testPathSegments = typeof criterion.testPath === 'string' ? criterion.testPath.split(/[\\/]+/) : [];
        if (typeof criterion.testPath !== 'string' || !criterion.testPath.trim() || path.isAbsolute(criterion.testPath) || testPathSegments.includes('..') || testPathSegments.some(segment => segment.startsWith('-'))) {
          fail('INVALID_POLICY', `test criterion ${criterion.id} requires a safe workspace-relative testPath`);
        }
        if (typeof criterion.expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(criterion.expectedSha256)) {
          fail('INVALID_POLICY', `test criterion ${criterion.id} requires a verifier-owned expectedSha256 for the approved test source`);
        }
        const spec = registeredCommands.get(criterion.commandId);
        const directNodeInvocation = spec.command === process.execPath && Array.isArray(spec.args) && (
          (spec.args.length === 1 && path.normalize(spec.args[0]) === path.normalize(criterion.testPath))
          || (spec.args.length === 2 && spec.args[0] === '--test' && path.normalize(spec.args[1]) === path.normalize(criterion.testPath))
        );
        if (!directNodeInvocation) {
          fail('INVALID_POLICY', `test command ${criterion.commandId} must directly execute ${criterion.testPath} with Node.js; wrapper/eval commands are not accepted as test evidence`);
        }
      }
      if (criterion.kind === 'file' || criterion.kind === 'implementation') {
        const hasRequiredText = Array.isArray(criterion.requiredText) && criterion.requiredText.length > 0;
        const hasExpectedHash = typeof criterion.expectedSha256 === 'string' && /^[a-f0-9]{64}$/i.test(criterion.expectedSha256);
        const hasMinimumSize = Number.isInteger(criterion.minBytes) && criterion.minBytes > 0;
        if (!hasRequiredText && !hasExpectedHash && !hasMinimumSize) fail('INVALID_POLICY', `criterion ${criterion.id} needs a content, hash, or minimum-size rule; existence alone is insufficient`);
        if (criterion.kind === 'implementation' && criterion.notStub !== true && (!Array.isArray(criterion.forbiddenPatterns) || criterion.forbiddenPatterns.length === 0)) {
          fail('INVALID_POLICY', `implementation criterion ${criterion.id} must enable stub checks or declare forbidden patterns`);
        }
      }
      if (criterion.kind === 'human' && !isObject(criterion.trustedReviewers)) {
        fail('INVALID_POLICY', `human criterion ${criterion.id} requires a verifier-owned trusted reviewer registry`);
      }
      if (criterion.kind === 'human' && Object.keys(criterion.trustedReviewers).length > 0 && !this.canonicalRoadmapAuthority) {
        fail('UNTRUSTED_REVIEWER_POLICY', `human criterion ${criterion.id} cannot establish reviewer trust from caller-supplied keys`);
      }
      if (criterion.kind === 'human' && criterion.reviewPurpose !== undefined) {
        if (!['semantic_review', 'owner_acceptance'].includes(criterion.reviewPurpose)
          || typeof criterion.requiredReviewerRole !== 'string'
          || !criterion.requiredReviewerRole
          || !Array.isArray(criterion.requiredCriterionIds)
          || criterion.requiredCriterionIds.length === 0
          || criterion.requiredCriterionIds.some(id => typeof id !== 'string' || !id)
          || criterion.requiredCriterionIds.some((id, index, all) => all.indexOf(id) !== index)
          || Object.values(criterion.trustedReviewers).some(reviewer => !isObject(reviewer) || typeof reviewer.publicKey !== 'string' || !Array.isArray(reviewer.roles) || !Array.isArray(reviewer.purposes))) {
          fail('INVALID_POLICY', `human criterion ${criterion.id} requires a purpose, reviewer role, covered criterion IDs, and role-bound trusted keys`);
        }
      }
    }
    for (const criterion of this.criteria.filter(entry => entry.kind === 'roadmap')) {
      if (criterion.required === false) fail('INVALID_POLICY', `roadmap criterion ${criterion.id} cannot be optional`);
      if (criterion.semanticReviewCriterionId !== undefined || criterion.ownerAcceptanceCriterionId !== undefined) {
        if (!this.canonicalRoadmapAuthority) fail('UNTRUSTED_ROADMAP_POLICY', 'roadmap semantic/owner review policies must be created by the pinned canonical roadmap policy factory');
        if (criterion.path !== 'video_platform_roadmap.md'
          || criterion.reviewerPolicyPath !== ROADMAP_REVIEW_TRUST_POLICY
          || criterion.reviewerPolicySha256 !== ROADMAP_REVIEW_TRUST_POLICY_SHA256) {
          fail('UNTRUSTED_ROADMAP_POLICY', 'canonical roadmap acceptance must use the verifier-pinned roadmap and reviewer policy');
        }
      }
      for (const [field, purpose] of [['semanticReviewCriterionId', 'semantic_review'], ['ownerAcceptanceCriterionId', 'owner_acceptance']]) {
        const linkedId = criterion[field];
        if (linkedId === undefined) continue;
        const linked = this.criteria.find(entry => entry.id === linkedId);
        if (!linked || linked.kind !== 'human' || linked.reviewPurpose !== purpose) {
          fail('INVALID_POLICY', `roadmap criterion ${criterion.id} ${field} must reference a matching human review criterion`);
        }
        const requiredRole = purpose === 'owner_acceptance' ? 'product_owner' : 'independent_reviewer';
        if (linked.requiredReviewerRole !== requiredRole) fail('INVALID_POLICY', `${field} must require the ${requiredRole} role`);
      }
    }
    Object.freeze(this);
  }

  runAuthorizedCommand(commandId) {
    const state = VERIFIER_STATE.get(this);
    const spec = state.commandCatalog.get(commandId);
    if (!spec) fail('UNAUTHORIZED_COMMAND', `command is not in the verifier-owned allowlist: ${commandId}`);
    if (!path.isAbsolute(spec.command) || !Array.isArray(spec.args) || spec.args.some(arg => typeof arg !== 'string')) {
      fail('INVALID_COMMAND_POLICY', `allowlisted command ${commandId} must have an absolute executable and fixed string arguments`);
    }
    const linkedTestCriteria = this.criteria.filter(criterion => criterion.kind === 'test' && criterion.commandId === commandId);
    const linkedTestPaths = [...new Set(linkedTestCriteria.map(criterion => criterion.testPath))];
    if (linkedTestPaths.length > 1) fail('INVALID_COMMAND_POLICY', `test command ${commandId} cannot attest multiple test files in one receipt`);
    let testSourceSha256 = null;
    if (linkedTestPaths.length === 1) {
      const testFilePath = safeResolve(this.workspaceRoot, linkedTestPaths[0]);
      if (!fs.statSync(testFilePath).isFile()) fail('EVIDENCE_NOT_FILE', `test path is not a regular file: ${linkedTestPaths[0]}`);
      testSourceSha256 = sha256(fs.readFileSync(testFilePath));
      const expectedHashes = [...new Set(linkedTestCriteria.map(criterion => criterion.expectedSha256))];
      if (expectedHashes.length !== 1 || expectedHashes[0] !== testSourceSha256) fail('TEST_SOURCE_HASH_MISMATCH', `test source does not match verifier-owned approved hash: ${linkedTestPaths[0]}`);
    }
    const startedAtMs = this.now();
    let stdout = '';
    let stderr = '';
    let exitCode = null;
    let processError = null;
    let timedOut = false;
    try {
      stdout = execFileSync(spec.command, spec.args, {
        cwd: this.workspaceRoot,
        timeout: Math.min(Number(spec.timeoutMs || 5000), 60000),
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
        maxBuffer: Math.min(Number(spec.maxBuffer || 1024 * 1024), 4 * 1024 * 1024),
        env: {
          PATH: process.env.PATH || '',
          HOME: process.env.HOME || '',
          TMPDIR: process.env.TMPDIR || '/tmp',
          LANG: process.env.LANG || 'C',
          LC_ALL: process.env.LC_ALL || 'C',
          NODE_ENV: 'test',
        },
      });
      exitCode = 0;
    } catch (error) {
      exitCode = Number.isInteger(error.status) ? error.status : null;
      timedOut = error.code === 'ETIMEDOUT';
      stdout = Buffer.isBuffer(error.stdout) ? error.stdout.toString('utf8') : String(error.stdout || '');
      stderr = Buffer.isBuffer(error.stderr) ? error.stderr.toString('utf8') : String(error.stderr || '');
      processError = String(error.code || error.message || error);
    }
    const receipt = Object.freeze({
      receiptId: crypto.randomUUID(),
      commandId,
      command: spec.command,
      args: Object.freeze([...spec.args]),
      cwd: this.workspaceRoot,
      testPath: linkedTestPaths[0] || null,
      testSourceSha256,
      startedAtMs,
      completedAtMs: this.now(),
      exitCode,
      timedOut,
      processError,
      stdoutSha256: sha256(stdout),
      stderrSha256: sha256(stderr),
      stdout,
      stderr,
    });
    state.receipts.set(receipt.receiptId, receipt);
    return receipt;
  }

  verify(bundle) {
    const errors = [];
    if (!isObject(bundle) || !Array.isArray(bundle.claims)) {
      fail('INVALID_CLAIM_BUNDLE', 'claim bundle must contain a claims array');
    }
    const claims = new Map();
    for (const claim of bundle.claims) {
      if (!isObject(claim) || typeof claim.criterionId !== 'string' || claims.has(claim.criterionId)) {
        errors.push('claims must use unique criterionId values');
        continue;
      }
      claims.set(claim.criterionId, claim);
    }
    const policyIds = new Set(this.criteria.map(criterion => criterion.id));
    for (const id of claims.keys()) if (!policyIds.has(id)) errors.push(`claim is not in verifier policy: ${id}`);
    const criteria = this.criteria.map(criterion => this.verifyCriterion(criterion, claims.get(criterion.id)));
    this.applyRoadmapReviewStates(criteria);
    const requiredFailures = criteria.filter(result => result.required && result.status === 'fail');
    const requiredReviews = criteria.filter(result => result.required && result.status === 'review_required');
    const status = errors.length > 0 || requiredFailures.length > 0
      ? 'FAIL'
      : (requiredReviews.length > 0 || !this.trustedPolicyAuthority ? 'REVIEW_REQUIRED' : 'PASS');
    return cloneAndFreezePolicy({
      verifierVersion: '1.1.0',
      generatedAt: new Date(this.now()).toISOString(),
      workspaceRoot: this.workspaceRoot,
      bundleId: isObject(bundle) && typeof bundle.bundleId === 'string' ? bundle.bundleId : null,
      reportedOverallStatus: isObject(bundle) ? bundle.reportedOverallStatus || null : null,
      status,
      independentlyDerived: true,
      policyTrustStatus: this.trustedPolicyAuthority ? 'VERIFIER_AUTHORIZED' : 'CALLER_SUPPLIED_POLICY_REVIEW_REQUIRED',
      errors,
      criteria,
      failedRequiredCriteria: requiredFailures.map(result => result.criterionId),
      reviewRequiredCriteria: requiredReviews.map(result => result.criterionId),
      note: 'Reported PASS fields are informational only. Structural validity, traceability, semantic review, and owner acceptance are separate states. Caller-supplied policies cannot derive overall PASS; only the pinned verifier-authorized canonical policy can do so, and semantic/owner review is still mandatory.',
    });
  }

  applyRoadmapReviewStates(criteriaResults) {
    const resultById = new Map(criteriaResults.map(result => [result.criterionId, result]));
    for (const policy of this.criteria.filter(criterion => criterion.kind === 'roadmap')) {
      const roadmapResult = resultById.get(policy.id);
      if (!roadmapResult || roadmapResult.status === 'fail' || !roadmapResult.evidence) continue;
      const semanticReview = policy.semanticReviewCriterionId ? resultById.get(policy.semanticReviewCriterionId) : null;
      const ownerAcceptance = policy.ownerAcceptanceCriterionId ? resultById.get(policy.ownerAcceptanceCriterionId) : null;
      const semanticStatus = semanticReview?.status === 'pass' ? 'PASS' : 'REVIEW_REQUIRED';
      const ownerStatus = ownerAcceptance?.status === 'pass' ? 'ACCEPTED' : 'PENDING';
      roadmapResult.evidence.semanticStatus = semanticStatus;
      roadmapResult.evidence.ownerAcceptance = ownerStatus;
      roadmapResult.evidence.semanticReviewCriterionId = policy.semanticReviewCriterionId || null;
      roadmapResult.evidence.ownerAcceptanceCriterionId = policy.ownerAcceptanceCriterionId || null;
      if (semanticReview?.status === 'fail' || ownerAcceptance?.status === 'fail') {
        roadmapResult.status = 'fail';
        roadmapResult.errors.push({ code: 'ROADMAP_REVIEW_FAILED', message: 'a linked semantic or owner review failed verification' });
      } else if (semanticStatus !== 'PASS' || ownerStatus !== 'ACCEPTED') {
        roadmapResult.status = 'review_required';
      } else {
        roadmapResult.status = 'pass';
      }
    }
  }

  verifyCriterion(policy, claim) {
    const base = { criterionId: policy.id, required: policy.required !== false, reportedStatus: claim?.reportedStatus || null, status: 'fail', evidence: null, errors: [] };
    if (!claim) {
      if (policy.kind === 'human') {
        base.status = 'review_required';
        base.evidence = { reviewStatus: 'REVIEW_REQUIRED' };
        return base;
      }
      base.errors.push('claim/evidence record is missing');
      return base;
    }
    if (typeof claim.evidenceRef !== 'string' || !claim.evidenceRef.trim()) {
      if (policy.kind === 'human' && !this.claimAssertsAcceptance(claim)) {
        base.status = 'review_required';
        base.evidence = { reviewStatus: 'REVIEW_REQUIRED' };
        return base;
      }
      base.errors.push('evidence reference is missing');
      return base;
    }
    try {
      if (policy.kind === 'roadmap') {
        if (claim.evidenceRef !== `file:${policy.path}`) fail('INVALID_EVIDENCE_REFERENCE', 'roadmap evidence reference does not match verifier policy');
        base.evidence = validateRoadmapFile({ workspaceRoot: this.workspaceRoot, relativePath: policy.path, traceabilityGraph: policy.traceabilityGraph || null });
        if (base.evidence.structuralStatus !== 'PASS') fail('ROADMAP_STRUCTURE_INVALID', base.evidence.structuralErrors.join('; '));
        if (base.evidence.traceabilityStatus === 'FAIL') fail('ROADMAP_TRACEABILITY_INVALID', base.evidence.traceabilityErrors.join('; '));
        base.status = 'review_required';
      } else if (policy.kind === 'file' || policy.kind === 'implementation') {
        if (claim.evidenceRef !== `file:${policy.path}`) fail('INVALID_EVIDENCE_REFERENCE', 'file evidence reference does not match verifier policy');
        base.evidence = inspectFile({
          workspaceRoot: this.workspaceRoot,
          relativePath: policy.path,
          requiredText: policy.requiredText || [],
          forbiddenPatterns: policy.forbiddenPatterns || [],
          expectedSha256: policy.expectedSha256 || null,
          minBytes: policy.minBytes || 0,
          notStub: policy.kind === 'implementation' || policy.notStub === true,
        });
      } else if (policy.kind === 'test') {
        if (claim.evidenceRef !== `file:${policy.testPath}`) fail('INVALID_EVIDENCE_REFERENCE', 'test evidence reference must identify the verifier-policy test file');
        const testFile = inspectFile({ workspaceRoot: this.workspaceRoot, relativePath: policy.testPath });
        const receipt = this.getCurrentReceipt(claim.executionReceiptId, policy.commandId);
        if (!receipt) fail('TEST_NOT_EXECUTED', 'test file exists but no fresh verifier-owned execution receipt exists');
        if (receipt.testPath !== policy.testPath || receipt.testSourceSha256 !== policy.expectedSha256 || testFile.sha256 !== policy.expectedSha256) fail('TEST_SOURCE_HASH_MISMATCH', 'test source does not match the verifier-owned approved hash and execution snapshot');
        const directNodeInvocation = receipt.command === process.execPath && (
          (receipt.args.length === 1 && path.normalize(receipt.args[0]) === path.normalize(policy.testPath))
          || (receipt.args.length === 2 && receipt.args[0] === '--test' && path.normalize(receipt.args[1]) === path.normalize(policy.testPath))
        );
        if (!directNodeInvocation) fail('TEST_NOT_EXECUTED', 'fresh command receipt did not directly execute the verifier-policy test file');
        if (testFile.mtimeMs > receipt.startedAtMs + 1) fail('TEST_SOURCE_CHANGED', 'test file changed after the verifier-owned test execution began');
        if (receipt.exitCode !== 0 || receipt.timedOut) fail('TEST_FAILED', `test command failed with exit ${receipt.exitCode}${receipt.timedOut ? ' (timed out)' : ''}`);
        base.evidence = { testFile, receiptId: receipt.receiptId, commandId: receipt.commandId, command: receipt.command, args: receipt.args, exitCode: receipt.exitCode, stdoutSha256: receipt.stdoutSha256 };
      } else if (policy.kind === 'render') {
        if (claim.evidenceRef !== `render:${policy.manifestPath}`) fail('INVALID_EVIDENCE_REFERENCE', 'render evidence reference does not match verifier policy');
        const receipt = this.getCurrentReceipt(claim.executionReceiptId, policy.commandId);
        if (!receipt || receipt.exitCode !== 0 || receipt.timedOut) fail('RENDER_NOT_EXECUTED', 'native render execution lacks a fresh successful verifier-owned receipt');
        const manifestFile = safeResolve(this.workspaceRoot, policy.manifestPath);
        const manifestStat = fs.statSync(manifestFile);
        if (!manifestStat.isFile()) fail('RENDER_MANIFEST_INVALID', 'render manifest is not a regular file');
        if (manifestStat.mtimeMs + 1 < receipt.startedAtMs) fail('STALE_RENDER_MANIFEST', 'render manifest predates the verified render command');
        const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
        if (manifest.renderExecuted !== true || manifest.rendererId !== policy.rendererId) fail('RENDERER_NOT_VERIFIED', 'render manifest does not prove the required renderer actually executed');
        const artifactPath = safeResolve(this.workspaceRoot, policy.artifactPath);
        const artifactStat = fs.statSync(artifactPath);
        if (!artifactStat.isFile() || artifactStat.size === 0) fail('RENDER_ARTIFACT_MISSING', 'render output is missing or empty');
        if (artifactStat.mtimeMs + 1 < receipt.startedAtMs) fail('STALE_ARTIFACT', 'render artifact predates the verified render command');
        const artifactHash = sha256(fs.readFileSync(artifactPath));
        if (manifest.artifactSha256 !== artifactHash) fail('RENDER_HASH_MISMATCH', 'render manifest hash does not match the actual artifact');
        base.evidence = { manifestPath: policy.manifestPath, artifactPath: policy.artifactPath, artifactSha256: artifactHash, receiptId: receipt.receiptId, rendererId: manifest.rendererId };
      } else if (policy.kind === 'human') {
        if (claim.evidenceRef !== `file:${policy.reviewPath}`) fail('INVALID_EVIDENCE_REFERENCE', 'human-review evidence reference does not match verifier policy');
        const reviewPath = safeResolve(this.workspaceRoot, policy.reviewPath);
        if (!fs.statSync(reviewPath).isFile()) fail('HUMAN_REVIEW_UNVERIFIED', 'human review record is not a regular file');
        const review = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
        const artifactPath = safeResolve(this.workspaceRoot, policy.artifactPath);
        if (!fs.statSync(artifactPath).isFile()) fail('HUMAN_REVIEW_UNVERIFIED', 'reviewed artifact is not a regular file');
        const actualArtifactHash = sha256(fs.readFileSync(artifactPath));
        if (review.reviewerType !== 'human' || typeof review.reviewerId !== 'string' || !review.reviewerId.trim() || review.decision !== 'accepted') fail('HUMAN_REVIEW_UNVERIFIED', 'human acceptance record is missing reviewer identity or accepted decision');
        if (review.artifactSha256 !== actualArtifactHash) fail('HUMAN_REVIEW_ARTIFACT_MISMATCH', 'human review does not bind to the current artifact hash');
        const trustedReviewer = policy.trustedReviewers[review.reviewerId];
        const trustedKey = typeof trustedReviewer === 'string' ? trustedReviewer : trustedReviewer?.publicKey;
        if (!trustedReviewer || typeof trustedKey !== 'string' || typeof review.signature !== 'string') fail('HUMAN_REVIEW_UNTRUSTED', 'reviewer identity/key is absent from verifier-established trust configuration');
        if (policy.reviewPurpose !== undefined) {
          if (review.reviewPurpose !== policy.reviewPurpose || review.reviewerRole !== policy.requiredReviewerRole) fail('HUMAN_REVIEW_ROLE_MISMATCH', 'review purpose or role does not match verifier policy');
          if (!trustedReviewer.roles.includes(policy.requiredReviewerRole) || !trustedReviewer.purposes?.includes(policy.reviewPurpose)) fail('HUMAN_REVIEW_UNTRUSTED', 'reviewer key is not trusted for the required role and purpose');
          const coveredIds = Array.isArray(review.reviewedCriterionIds) ? [...new Set(review.reviewedCriterionIds)].sort() : [];
          const requiredIds = [...policy.requiredCriterionIds].sort();
          if (canonicalJson(coveredIds) !== canonicalJson(requiredIds)) fail('HUMAN_REVIEW_SCOPE_INCOMPLETE', 'signed review does not cover the exact verifier-required criteria');
          if (!Array.isArray(review.criterionObservations)) fail('HUMAN_REVIEW_OBSERVATIONS_MISSING', 'signed review must include a structured observation for each required criterion');
          const observations = new Map(review.criterionObservations.map(item => [item?.criterionId, item]));
          if (observations.size !== requiredIds.length || canonicalJson([...observations.keys()].sort()) !== canonicalJson(requiredIds)) fail('HUMAN_REVIEW_OBSERVATIONS_INCOMPLETE', 'structured review observations must cover the exact required criterion IDs');
          for (const id of requiredIds) {
            const observation = observations.get(id);
            if (!isObject(observation) || typeof observation.observation !== 'string' || !observation.observation.trim() || observation.decision !== 'accepted') {
              fail('HUMAN_REVIEW_OBSERVATION_INVALID', `criterion ${id} lacks an accepted, non-empty structured observation`);
            }
          }
        }
        if (typeof review.reviewedAt !== 'string' || !Number.isFinite(Date.parse(review.reviewedAt)) || Date.parse(review.reviewedAt) > this.now()) fail('HUMAN_REVIEW_UNVERIFIED', 'human review timestamp is missing or invalid');
        const signedPayload = {
          reviewerType: review.reviewerType,
          reviewerId: review.reviewerId,
          decision: review.decision,
          artifactSha256: review.artifactSha256,
          reviewedAt: review.reviewedAt,
          reviewRef: review.reviewRef || null,
        };
        for (const key of ['reviewPurpose', 'reviewerRole', 'reviewedCriterionIds', 'criterionObservations']) {
          if (review[key] !== undefined) signedPayload[key] = review[key];
        }
        let signatureValid = false;
        try {
          signatureValid = crypto.verify(null, Buffer.from(canonicalJson(signedPayload)), trustedKey, Buffer.from(review.signature, 'base64'));
        } catch (_error) {
          signatureValid = false;
        }
        if (!signatureValid) fail('HUMAN_REVIEW_SIGNATURE_INVALID', 'human acceptance signature does not match verifier-owned reviewer key');
        base.evidence = { reviewPath: policy.reviewPath, reviewerId: review.reviewerId, reviewerType: review.reviewerType, reviewerRole: review.reviewerRole || null, reviewPurpose: review.reviewPurpose || null, reviewedCriterionIds: review.reviewedCriterionIds || [], criterionObservations: review.criterionObservations || [], decision: review.decision, artifactSha256: actualArtifactHash, reviewedAt: review.reviewedAt, attestationAuthenticity: 'signature verified against verifier-owned trusted reviewer key' };
      }
      if (policy.kind !== 'roadmap') base.status = 'pass';
    } catch (error) {
      if (policy.kind === 'human' && error.code === 'EVIDENCE_MISSING' && !this.claimAssertsAcceptance(claim)) {
        base.status = 'review_required';
        base.evidence = { reviewStatus: 'REVIEW_REQUIRED', reviewPath: policy.reviewPath };
        return base;
      }
      base.errors.push({ code: error.code || 'EVIDENCE_INVALID', message: error.message });
    }
    return base;
  }

  claimAssertsAcceptance(claim) {
    return typeof claim?.reportedStatus === 'string'
      && ['PASS', 'ACCEPTED', 'HUMAN_ACCEPTED', 'OWNER_ACCEPTED'].includes(claim.reportedStatus.toUpperCase());
  }

  getCurrentReceipt(receiptId, expectedCommandId) {
    if (typeof receiptId !== 'string') return null;
    const receipt = VERIFIER_STATE.get(this).receipts.get(receiptId);
    if (!receipt || receipt.commandId !== expectedCommandId) return null;
    if (this.now() - receipt.completedAtMs > this.maxExecutionAgeMs) return null;
    return receipt;
  }
}

function defaultCommandCatalog(nodePath = process.execPath) {
  return Object.freeze({
    'provider-qualification': Object.freeze({ command: nodePath, args: ['tests/engineering-agent-provider.test.js'], timeoutMs: 30000 }),
    'roadmap-qualification': Object.freeze({ command: nodePath, args: ['tools/claim-verifier/tests/claim-verifier.test.js'], timeoutMs: 30000 }),
  });
}

module.exports = {
  ClaimVerifier,
  STAGES,
  REQUIRED_SECTIONS,
  sha256,
  canonicalJson,
  safeResolve,
  inspectFile,
  buildRoadmapTraceabilityGraph,
  validateRoadmapTraceabilityGraph,
  validateRoadmapText,
  validateRoadmapFile,
  loadRoadmapReviewerTrust,
  createCanonicalRoadmapCriteria,
  createCanonicalRoadmapVerifier,
  ROADMAP_REVIEW_TRUST_POLICY,
  defaultCommandCatalog,
};
