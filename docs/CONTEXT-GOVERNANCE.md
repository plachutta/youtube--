# CONTEXT GOVERNANCE — CONTEXT ECONOMY, INSTRUCTION EFFICIENCY, AND ENGINEERING INTEGRITY

**Status:** Canonical Standard  
**Version:** 1.0.0  
**Effective:** 2026-10-15  
**Scope:** Reusable across projects, repositories, models, agents, and engineering workflows  

---

## 1. Purpose and Scope

This document establishes a canonical, enforceable standard for context economy and instruction efficiency. Context is an engineering resource that must be managed deliberately to minimize unnecessary consumption while preserving all information required for correctness, safety, reproducibility, and engineering quality.

This standard governs:
- Context selection, retention, compression, retrieval, preservation, and handoff
- Instruction economy and delta-based communication
- Safe compaction and resumable checkpoints
- Context budgeting and model-aware preflight
- Evidence-aware retrieval and change-aware invalidation
- Handoff contracts and validation requirements

The governing principle is: **Minimize unnecessary context subject to preserving all task-critical information, constraints, evidence, and verification requirements.**

---

## 2. Governing Principles

1. **Correctness is non-negotiable.** Context efficiency is subordinate to correctness, security, safety, contractual compliance, and completeness of required evidence. No agent may justify an incorrect, incomplete, unsafe, or unverified result by citing token savings.
2. **Preserve required engineering evidence.** A shorter context is not inherently better. A compact summary is not authoritative merely because it is concise.
3. **Distinguish necessity from expense.** Information that is expensive to preserve may still be necessary; information that is cheap to include may be unnecessary.
4. **Prefer authoritative references.** Stable references to canonical sources are preferred over restating large artifacts. When omitted, information must remain retrievable.
5. **Fail closed.** When losing context would make a materially correct or safe decision impossible, preserve material, retrieve it, or stop with an explicit blocker.
6. **Provenance matters.** All material engineering decisions must be traceable to evidence. Distinguish verified facts, source-derived claims, reported results, assumptions, and unverified assertions.
7. **Reuse with validation.** Reuse existing context only when authority, relevance, freshness, and completeness are established.
8. **Delta over duplication.** When baseline is authoritative and retrievable, use delta-only instructions; otherwise, use full-context handoff.

---

## 3. Context Classification and Authority

Context is classified into categories with distinct retention priorities:

| Category | Description | Retention Priority | Notes |
|---|---|---|---|
| **A. Task Context** | Objective, scope, acceptance criteria, relevant changes, constraints, required outputs | Highest | Must never be compressed away or obscured |
| **B. Authoritative State** | Repository state, canonical specs, approved decisions, configuration contracts, dependency versions | Highest | Source of truth; newer authoritative state overrides older summaries |
| **C. Engineering Evidence** | Test results, traces, logs, inspected source, observed behavior, reproduction steps, measurements, verification results | Highest | Includes failures and skips; never convert failed to passing |
| **D. Governance & Safety Constraints** | Authorization boundaries, forbidden actions, security requirements, preservation rules, approval gates, mandatory validation | Highest | Non-omittable |
| **E. Historical & Handoff Context** | Prior decisions, previous execution results, known defects, unresolved questions, completed work, deferred items | Medium-High | Preserve rationale for decisions; avoid duplicating entire history |
| **F. Model & Execution Context** | Context budget, system instructions, tool outputs, retrieved docs, agent history, compaction overhead, effective model capacity | Medium | Track budget; account for non-input overhead |
| **G. Derived/Temporary Context** | Working hypotheses, temp notes, exploratory output, transient diagnostics, unverified assertions | Lowest | Mark clearly; discard when authority not established |

**Authority precedence:** Newer authoritative sources > observed implementation > approved contracts > verified results > prior summaries > remembered facts > hypotheses. Old summaries cannot override newer authoritative sources.

---

## 4. Retrieval and Retention Rules

1. **Start with requirements.** Identify task information requirements before retrieving.
2. **Use smallest sufficient set.** Retrieve minimal authoritative sources to satisfy task.
3. **Prefer references over copies.** Reference stable artifacts; retrieve specific excerpts over full loading.
4. **Reuse present context.** Avoid restating/re-retrieving information already present and valid.
5. **Targeted retrieval.** Retrieve additional information only when material ambiguity, missing dependency, contradiction, staleness, or changed conditions exist.
6. **Preserve rationale.** Retain enough context to explain decisions and supporting evidence.
7. **Maintain retrievability.** Omitting from active context must not destroy ability to retrieve later.
8. **Separate concerns.** Keep task-specific context separate from unrelated history.
9. **Provenance on material decisions.** Record provenance for evidence materially supporting decisions.
10. **Freshness on change-sensitive data.** Re-fetch when repository state, symbols, APIs, configs, deps, or environment affect correctness.

---

## 5. Instruction Economy

**Requirements for instructions:**
- Precise outcome, explicit authorized scope, clear safety boundaries
- Grounded in authoritative state
- Specific acceptance criteria and required evidence
- Concise where no new info, complete where omission changes contract

**Delta-only instructions** (when baseline authoritative/retrievable):
- Must identify: authoritative baseline, specific change, applicable constraints, changed assumptions/decisions, required validation, what must remain unchanged

**Rules:**
- Do not infer permission to violate policy from missing instruction
- Avoid resending full histories when validated checkpoint suffices
- Do not use delta-only when baseline unavailable/contradictory/stale/insufficient
- Full-context handoff when delta insufficient, baseline uncertain, or handoff spans agents/sessions with unclear state

---

## 6. Safe Compaction and Summarization

Summaries/checkpoints must explicitly distinguish: verified facts, source-derived claims, reported-but-unverified results, approved decisions, unapproved recommendations, assumptions, known limitations, unresolved contradictions, completed work, pending work, authorization boundaries, required tests/acceptance conditions.

**Prohibited conversions:**
- Failed test → passing test
- Unexecuted test → verified result
- Hypothesis → fact
- Recommendation → approved decision
- Fake/mock → real infrastructure qualification
- Unit test success → production readiness
- Incomplete → completed
- Missing value → fabricated default
- Historical condition → current claim

**Minimum resumable checkpoint:**
1. Task objective and current scope
2. Authoritative baseline (repo/system) with version/identifier
3. Relevant canonical sources and authority
4. Completed work + supporting evidence
5. Failed, skipped, unexecuted validation
6. Outstanding defects and unresolved decisions
7. Constraints and unauthorized actions
8. Next safe action + acceptance criteria
9. Known context limitations and retrieval requirements

Referenced evidence must remain retrievable and identifiable. A summary that cannot support reliable continuation is not a valid checkpoint.

---

## 7. Context Budgeting and Model-Aware Preflight

**Preflight must consider:**
- Selected model's effective context limit (not nominal)
- System/developer instructions, user task + acceptance criteria
- Retrieved source material, tool output, conversation history
- Planned response/artifact, compaction/continuation overhead
- Appropriate safety margin

**When pressure arises, governed sequence:**
1. Remove redundant repetition
2. Replace repeated canonical instructions with stable references
3. Remove irrelevant history after dependency check
4. Retrieve task-specific excerpts over broad artifacts
5. Consolidate duplicates while preserving provenance
6. Create/validate resumable checkpoint if continuation requires
7. Controlled compaction or task decomposition
8. Stop and report blocker if cannot safely fit

**Constraints:**
- Never discard acceptance criteria, critical code paths, security requirements, contradictory evidence, or required validation to fit unrelated material
- If cannot fit safely, reduce scope only via explicitly bounded valid plan; never reduce required quality

---

## 8. Evidence-Aware Retrieval

**Mandatory fresh retrieval/inspection when:**
- Current repo state affects answer
- Symbol/API/config/dependency/file may have changed
- Claim conflicts with observed behavior
- Summary lacks evidence for decision
- Safety boundary/authorization contract must be verified
- Failure root cause unknown
- Using prior test result to claim present correctness
- Missing fact would materially change implementation choice

**Rules:** Don't retrieve everything by default; don't retrieve nothing due to cost. Target specific deficits. Record provenance for evidence materially supporting decisions.

---

## 9. Mechanical Enforcement Mechanisms

Existing enforcement patterns in this repo inform implementation gaps:

**Existing mechanisms (verified):**
- **Narration contract/lifecycle guards** (`utils/narration-contract.js`, `utils/narration-lifecycle.js`) — Enforce lifecycle transitions, eligibility gates (`assertEligibleForDownstream`), artifact identity checks. *Mechanically enforced in code.*
- **Hosted execution boundaries** (`utils/narration-hosted-executor.js`) — Forbid local inference, classify uncertain remote states (`RemoteStatusUnknownError`), require artifact retrieval before release. *Mechanically enforced.*
- **Path traversal/injection guards** — `SAFE_SEGMENT_ID`, `SAFE_JOB_ID` regexes, artifact path resolution with escape checks. *Mechanically enforced.*
- **Provenance/validation utilities** (`utils/narration-manifest-validator.js`, `utils/provenance-service.js`, `utils/narration-audio-validation.js`) — Validation helpers. *Available as utilities; enforcement depends on usage.*

**Enforcement targets (documentation/implementation gaps):**
| Control | Required Behavior | Enforcement Mechanism | Status |
|---|---|---|---|
| Context preflight | Check effective budget before operations | Need context-budgeting utility | **Gap** (not present) |
| Checkpoint validation | Validate resumable checkpoints before continuation | Can extend existing recovery patterns (`GenerationRecoveryService`) | **Partial** — recovery exists, general checkpoint validation missing |
| Handoff validation | Reject handoffs missing mandatory acceptance criteria/evidence | Need schema validation | **Gap** |
| Conditions fingerprinting | Detect material changes (files, HEAD, deps) and invalidate affected context | Need change detection/fingerprinting | **Gap** |
| Compaction validation | Validate summaries preserve facts/failures/constraints | Need validator | **Gap** |
| Stale context invalidation | Auto-invalidate on detected changes | Need policy integration | **Gap** |
| Retrieval planning | Enforce targeted retrieval based on info deficit | Agent behavior + tooling | **Documented requirement only** |

**Classification:** Mechanically enforced where implemented in code; others are documented requirements/implementation gaps. Do not claim enforcement without implemented mechanism.

---

## 10. Engineering-Quality Non-Regression Gate

Every context optimization must pass this gate before acceptance.

**Verification checklist (must all be satisfied):**
- [ ] Actual task objective preserved
- [ ] Complete authorized scope preserved
- [ ] Relevant canonical requirements retained
- [ ] Safety/security boundaries retained
- [ ] Necessary repo/system state retained
- [ ] Material dependency relationships retained
- [ ] Evidence for critical assumptions retained
- [ ] Known contradictory findings retained
- [ ] Required implementation details retained
- [ ] Mandatory tests/verification steps retained
- [ ] Acceptance criteria preserved
- [ ] Outstanding uncertainty/limitations preserved
- [ ] Authority of prior decisions preserved

**Refuse optimization if it would:** omit safety rules; replace precise contract with vague summary; drop failing test without recording failure; forget unresolved decision treating recommendation as approved; remove evidence distinguishing real vs mock; omit relevant code path; compress failure report until root cause/repro lost; reuse stale checkpoint after material change; split work losing end-to-end acceptance criteria.

Optimization passes only if sufficiency demonstrable. If not, preserve/retrieve material or stop with explicit blocker.

---

## 11. Change-Aware Context Invalidation

Cached context/summaries/checkpoints must not remain authoritative indefinitely.

**Detect material changes to:** repo HEAD/working tree, relevant source files, canonical contracts, dependencies/runtime versions, config/execution conditions, test fixtures/infrastructure assumptions, approved decisions, external facts.

**Approach:** Prefer existing change-detection (git HEAD, file mtimes/hashes, version identifiers) where available. Invalidate only affected context proportionate to consequence of being wrong.

**Rules:** Don't force full rebuild for trivial changes; don't reuse results when preconditions changed. Reuse decision must be proportionate to being wrong.

---

## 12. Measurable Signals

Measure both efficiency and retained quality. Use existing instrumentation where present; specify collection otherwise. Do not optimize for token reduction alone.

**Efficiency/quality signals:**
- Tokens spent on repeated vs new information
- Retrieval volume relevant to task
- Repeated-source loads avoided via stable references
- Context-preflight failures prevented
- Checkpoint validation failures detected
- Compaction failures caught before unsafe continuation
- Context-related refusals due to missing authoritative evidence
- Engineering regressions attributable to context loss
- Required evidence omitted/unavailable during handoff
- Task rework from stale/incomplete/contradictory context
- Verification coverage preserved after reduction

Lower cost with increased defects/failed verification/incorrect assumptions/repeated recovery is not improvement. Avoid arbitrary numeric targets; document need if threshold required.

---

## 13. Reproducible Context Handoff Contract

Use this structure for resumable handoffs. Link detailed evidence rather than duplicating.

| Section | Required Fields | Notes |
|---|---|---|
| **TASK** | `objective`, `authorizedScope`, `acceptanceCriteria` | Must be explicit and complete |
| **AUTHORITATIVE_STATE** | `baseline` (ref+version), `canonicalSources[]`, `relevantPaths[]`/`identifiers[]`, `conditionsFingerprint` (if supported) | Source of truth references |
| **EXECUTION** | `completedActions[]`, `materialFindings[]`, `decisions[]` (with `authority`, `evidenceRef`), `evidence[]` (with `provenance`) | Include rationale |
| **VALIDATION** | `testsExecuted[]`, `results[]` (exact), `failures[]`, `skips[]`, `envLimitations[]`, `establishedClaims[]`, `unestablishedClaims[]` | Never sanitize failures |
| **OPEN_STATE** | `remainingDefects[]`, `unresolvedDecisions[]`, `missingEvidence[]`, `unauthorizedActions[]` | Critical for continuation |
| **CONTINUATION** | `immediateNextSafeAction`, `requiredContextToRetrieve[]`, `reconsiderationConditions[]` (when plan must change) | Explicit trigger points |

Recipient must be able to retrieve all required info from references + handoff.

---

## 14. Validation and Regression Coverage

Where architecture supports, validate:

- Context overflow detected before execution
- Invalid/missing checkpoints refused
- Compaction results validated before continuation
- Conditions fingerprints detect material source changes
- Stale context invalidated when authority changes
- Handoffs cannot omit mandatory acceptance criteria
- Failed tests/unresolved blockers survive compaction
- Recommendations cannot become approved decisions via summarization
- Required safety constraints survive reduction
- Task-scoped retrieval includes known critical dependencies
- Continuation refused if mandatory source unretrievable
- Context optimization doesn't bypass required engineering validation

Use deterministic tests and existing conventions. Don't modify unrelated code. Classify untestable mechanisms as unverified.

---

## 15. Compliance Checklist

Before accepting any context optimization:

- [ ] Information requirements identified
- [ ] Smallest sufficient authoritative set selected
- [ ] Stable references used where appropriate
- [ ] Targeted retrieval performed for deficits
- [ ] Non-omittable categories (A-D) fully preserved
- [ ] Evidence/provenance recorded for material decisions
- [ ] Freshness validated for change-sensitive info
- [ ] Compaction/summarization passed non-regression gate (10)
- [ ] Change-aware invalidation rules applied if cached context used
- [ ] Handoff contract complete (13) if handing off
- [ ] Context budget within effective limit with margin
- [ ] No prohibited conversions (6)
- [ ] Resumable checkpoint valid if continuation planned

---

## 16. Known Enforcement Gaps

| Gap | Impact | Recommended Action |
|---|---|---|
| Context preflight/budgeting utility | Cannot mechanically enforce budget limits | Implement utility tracking effective context usage; integrate with agent planning |
| General checkpoint validation | Resumable checkpoints may lack validation | Extend `GenerationRecoveryService` patterns to validate checkpoint completeness per §6 |
| Handoff schema validation | Handoffs may omit required fields | Define JSON schema for handoff contract (§13); validate on write/read |
| Conditions fingerprinting | Cannot reliably detect staleness | Implement lightweight fingerprinting (git SHA, file hashes, dep versions) for change-sensitive artifacts |
| Compaction validation | Summaries may silently corrupt semantics | Add validator enforcing distinction rules (§6) before accepting compaction |

These remain documentation-only until implemented. Mechanical enforcement claims require implemented mechanisms with tests.

---

## 17. Relationship to Existing Governance

This standard complements existing repo governance:

- **`remote/COMPUTE-BOUNDARIES.md`** — Establishes infrastructure boundaries (local vs hosted). Context governance extends to information boundaries: hosted runtime is required for inference; context must preserve boundary constraints.
- **`utils/narration-contract.js`, `utils/narration-lifecycle.js`** — Enforce strict lifecycle states (generation/technical validation/audio quality). Context governance preserves these state distinctions through compaction/summarization.
- **`utils/narration-hosted-executor.js`** — Enforces "never treat uncertain status as definite failure" and requires artifact reconciliation. Context handoffs must preserve uncertain states as unresolved, never collapse to definite outcomes.
- **Narration provenance/validation utilities** — Evidence requirements align with provenance tracking and verification gates.

Link to canonical definitions above; this standard does not duplicate them.

---

## 18. Implementation Notes

- **Reuse, don't reinvent.** Leverage existing `GenerationRecoveryService`, contract/lifecycle guards, path validation. Extend where gaps exist.
- **Fail closed.** When enforcement cannot be completed, treat as blocker.
- **Evidence-based.** All claims of enforcement require tests/evidence.
- **Preserve work.** No resets/cleans/checkouts/stashes/stages/commits as part of applying this governance.

---

*This document is the canonical standard for context economy and instruction efficiency in this repository and is designed for reuse across engineering workflows.*

---

## 19. Comprehensive Engineering Reporting Standard

This repository adheres to the **Comprehensive, Evidence-First Engineering Reporting Standard** (see `docs/ENGINEERING-REPORTING-STANDARD.md`).

**Requirements:**
- Substantive engineering work requires a comprehensive, evidence-backed final report following the standard structure.
- Short status summaries alone are insufficient.
- All material claims must be supported by direct evidence; negative results and limitations must be reported explicitly.
- Test execution, validation layers, and qualification state must be documented with exact commands and exit codes.
- Renderer identity, visual qualification, and QA must be evidenced by actual execution when claimed.
- No complete production video rendering is permitted unless explicitly authorized; such authorization is absent unless stated in the task.

**Application:** Applies to all future engineering execution, milestones, qualification, research, implementation, testing, handoffs, and closeouts.

**Final response requirement:** For substantive work, the inline response must include a substantive summary, link to the persistent report/evidence package, list verification performed with actual results, and disclose limitations. Short confirmations are insufficient.

## 20. Provider-Agnostic Engineering Orchestration

This is a permanent architectural requirement for engineering-agent workflows:

> KiloCode is one replaceable coding-agent provider. No canonical engineering contract, roadmap, task specification, verifier, evidence format, or orchestration rule may depend on Kilo-specific behavior unless that behavior is isolated behind a provider adapter and explicitly documented.
>
> Changing the coding-agent provider must not require rewriting the project's authoritative task state or verification system.

The project owns canonical task specifications, status, checkpoints, governance, acceptance criteria, and evidence. Agent runtimes are replaceable execution adapters. The engineering control plane, agent runtime, model provider, and execution backend are separate concerns; capabilities must be declared and negotiated, and unsupported mandatory capabilities fail closed. Provider-native conversation history is not canonical task state. Provider changes carry forward only verified task state, workspace/patch references, and evidence—not assumed conversation continuity.

Kilo-specific CLI, ACP, MCP, authentication, model, and session details must remain inside an explicitly named adapter and configuration. No implicit provider/model fallback is permitted. A provider result is never an acceptance decision: the independent verifier derives acceptance from its own inspection and executed checks. Do not claim mechanical enforcement beyond the tested mechanisms.

Operational references: [Engineering Agent Operating Model](ENGINEERING-AGENT-OPERATING-MODEL.md) and [Comprehensive Engineering Reporting Standard](ENGINEERING-REPORTING-STANDARD.md). This policy is authoritative; those documents are implementation/reporting references, not parallel governance hierarchies.

## 21. Authoritative Video Platform Roadmap

The single authoritative video-platform sequence is the repository-root [video_platform_roadmap.md](../video_platform_roadmap.md). The former [data/roadmap/ROADMAP.md](../data/roadmap/ROADMAP.md) is a compatibility pointer only. The canonical file defines product scope, stage dependencies, acceptance evidence, exit gates, and change control. Planning notes, milestone reports, research findings, agent task lists, and candidate-tool discoveries may inform proposals but do not supersede or duplicate that roadmap. A stage advances only when its stated exit gate is supported by direct evidence and required owner approval; creating a document or passing a unit test alone is not stage completion.
