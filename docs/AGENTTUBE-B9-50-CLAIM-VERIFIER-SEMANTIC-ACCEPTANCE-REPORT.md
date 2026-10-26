# B9.50 — Claim Verifier Semantic-Acceptance Boundary and Requalification

**Date:** 2026-10-16  
**Repository:** YouTube workspace  
**Initial HEAD / branch:** `e26792ae00dc1ec2434faf32632896609396dfad` / `master`  
**Disposition:** The B9.49 false-PASS fixture is permanently covered and now derives `REVIEW_REQUIRED`, even when structural and traceability checks pass. The JavaScript verifier is **QUALIFIED FOR THE TESTED FAIL-CLOSED STATUS BOUNDARY**. Roadmap semantic acceptance remains **REVIEW_REQUIRED**; owner acceptance remains **PENDING**.  
**Evidence:** [B9.50 machine-readable evidence](../data/b9_50/evidence/CLAIM-VERIFIER-SEMANTIC-ACCEPTANCE.json)

## 1. Outcome and state distinctions

| State | B9.50 result | Meaning / limit |
|---|---|---|
| Structural validation | **PASS** for the canonical roadmap | Exact Stage 0–10 headings, required nonempty sections, order, stage-dependency ordering, and local Markdown link boundaries. No semantic claim. |
| Traceability validation | **PASS** with the canonical source-hash-bound stage-exit graph | Graph links current source sections among objective, dependencies, deliverables, acceptance criteria, validation methods, evidence, and exit condition. It is a stage-exit map, not semantic evaluation. |
| Semantic acceptance | **REVIEW_REQUIRED** | The verifier explicitly declines to assert that natural-language objectives, deliverables, tests, and acceptance prose are substantively adequate. |
| Roadmap owner acceptance | **PENDING** | No owner review record or signature was created. The trust registry has no configured approvers. |
| JavaScript claim-verifier qualification | **QUALIFIED FOR TESTED BOUNDARY** | The 46-case suite confirms unsupported semantic/owner PASS claims are refused or left `REVIEW_REQUIRED`; the exact former false PASS is in the permanent suite. This is bounded qualification, not proof against every possible software defect. |
| Legacy Python verifier | **NOT QUALIFIED** | Historical placeholder remains untouched and was not executed. |
| Live provider / OpenHands | **NOT TESTED / DEFERRED** | No installation, launch, model call, or adoption. |
| Production renderer/video | **NOT PERFORMED** | No renderer or production artifact execution. |

A structurally valid roadmap may be useful and machine-checkable without being automatically semantically accepted. The aggregate verifier returns `REVIEW_REQUIRED` until required reviews are actually verified. A report or a test result is not itself owner approval.

## 2. Baseline, reconciliation, and preservation

Before changes, live state was:

- HEAD `e26792ae00dc1ec2434faf32632896609396dfad`; branch `master`.
- 4 modified tracked paths: [package-lock.json](../package-lock.json), [package.json](../package.json), [test.js](../test.js), and [utils/scene-repair-service.js](../utils/scene-repair-service.js).
- 133 untracked status entries; 0 staged entries.
- B9.49 report and `data/b9_49/evidence/CLAIM-VERIFIER-QUALIFICATION.json` existed and stated NOT QUALIFIED because a 44,803-byte generic roadmap fixture returned PASS. The dedicated 31-case suite did not cover that exact API behavior.

I reproduced the historical defect against the current pre-fix JavaScript source before editing. No reset, clean, checkout, stash, stage, commit, or deletion occurred. The root roadmap and original proposal, previous reports, and historical B9.49 evidence were preserved. The four tracked user modifications remain untouched. No renderer/audio/provider-runtime architecture work was performed.

### Pre-fix reproduction

An isolated OS temporary workspace contained a full 11-stage roadmap generated from the existing fixture structure. Each Deliverables subsection was replaced by unique label-specific generic prose (alpha through kilo) containing “report”, “schema”, and “artifact”; no meaningful stage outputs were specified. The terminal newline was preserved.

- Fixture: 44,803 bytes; SHA-256 `abc613ec56861de82e3a2b3d6fe963ea86988fd0ad9b2925552e48c5f7dbd109`.
- Actual public behavior exercised: `new ClaimVerifier({ workspaceRoot, criteria: [{ id: 'roadmap-substance', kind: 'roadmap', path: 'video_platform_roadmap.md' }] }).verify({ claims: [{ criterionId: 'roadmap-substance', evidenceRef: 'file:video_platform_roadmap.md', reportedStatus: 'PASS' }] })`.
- Expected: overall non-PASS / review required.
- Observed before fix: `PASS`, roadmap-valid boolean true, no errors. This reproduced the B9.49 false success. The temp directory was removed.

The permanent test regenerates the same fixture byte-for-byte and asserts `REVIEW_REQUIRED` even when an agent supplies fake semantic/owner PASS-looking fields. The fixture’s source-based traceability graph is present in the policy, so structural and traceability PASS do not mask the semantic gate.

## 3. Corrected acceptance model

### Structural status

`parseRoadmapStructure()` and local-link validation report facts such as exact stage heading set/count, section presence/non-emptiness, order, Markdown link containment/resolution, and explicitly named Stage dependencies not pointing forward or to self. Headings-only or a short status note fails structure. Structural PASS is not semantic PASS.

### Traceability status

`buildRoadmapTraceabilityGraph()` derives a compact index from the existing Markdown, not a second roadmap. Each source reference has a stage/field ID, section and unit index, and SHA-256 of the exact source unit. Acceptance-stage links enumerate objectives, dependencies, all deliverables, all acceptance units, all validation-method units, all evidence units, and exit-condition units. The exit gate must require every acceptance-criterion ID. A verifier policy graph is bound to the exact current roadmap SHA-256 and compared against the verifier-derived map:

- No graph configured: `REVIEW_REQUIRED`, not PASS.
- Graph supplied with invented, missing, dangling, stale, or inconsistent references: `FAIL`.
- Matching graph and structurally valid current roadmap: `PASS` for traceability only.

The graph is explicitly **stage-exit granularity**. Existing Markdown does not provide per-output criterion IDs. One prose acceptance subsection is represented as one compound stage-exit criterion unless explicitly itemized. All current deliverables/methods/evidence are linked to that stage-exit criterion. This establishes mechanical relationships, not that those relationships are wise or that the prose is measurable. Future outputs need not already exist.

### Semantic and owner status

Roadmap semantic status defaults to `REVIEW_REQUIRED`. A required semantic review and owner-acceptance review are distinct required criteria. To satisfy either, a record must:

- bind to the actual current artifact SHA-256;
- state its policy-defined purpose and reviewer role;
- use a public key from verifier-owned, role/purpose-scoped trust configuration;
- cover the exact policy-required criterion ID set;
- contain a non-empty accepted structured observation for each criterion;
- be signed over the complete payload, including observations, and not be future-dated.

A roadmap edit invalidates old records via the hash. Missing unasserted review evidence is `REVIEW_REQUIRED`. A self-asserted acceptance with missing, malformed, stale, untrusted, incomplete, or invalidly signed evidence is `FAIL`. A signature authenticates possession of a trusted key and signed bytes; it cannot prove thoughtful human review.

The canonical fixed trust store [video-roadmap-reviewers.json](../tools/claim-verifier/policies/video-roadmap-reviewers.json) currently contains **zero** reviewers and is pinned by a SHA-256 constant in verifier source. A standalone JSON edit that adds a reviewer fails `REVIEW_TRUST_POLICY_HASH_MISMATCH`. The canonical policy factory loads this fixed file, not a key from the claim/review. Adding approvers requires a separately authorized verifier source/policy update. No key, review, or approval was manufactured.

## 4. Changes made

- [claim-verifier.js](../tools/claim-verifier/claim-verifier.js): removed the semantic word-floor, lexical marker-count, and exact repeated-section semantic inference. Added explicit structure and source-hash traceability, distinct `PASS` / `FAIL` / `REVIEW_REQUIRED` aggregate states, separate roadmap semantic/owner review links, signed structured observations, current-hash binding, role/purpose validation, reviewer-policy loading and source-pinned empty trust store.
- [claim-verifier.test.js](../tools/claim-verifier/tests/claim-verifier.test.js): converted prior false lexical-content expectations into structural/semantic states; added the exact B9.49 fixture, same-category generic deliverables, non-observable acceptance, invented method ID, unattached output path, canonical roadmap status, separate review/owner signatures, stale hash, untrusted key, trust-store tamper, and source-bound behavior checks. Preserved previous tests for command/evidence/render/hash/human checks.
- [video-roadmap-reviewers.json](../tools/claim-verifier/policies/video-roadmap-reviewers.json): new empty, verifier-pinned reviewer registry. It intentionally prevents a real roadmap acceptance decision until an authorized policy change.
- [README](../tools/claim-verifier/README.md): documents structural/traceability/semantic states, qualification boundary, and trust policy.
- [video_platform_roadmap.md](../video_platform_roadmap.md): only Stage 1 current-state wording updated. Sequence and other stages unchanged; semantic status and owner acceptance explicitly remain pending.
- This report and the B9.50 evidence record are new. The B9.49 report/evidence were not overwritten.

## 5. Mandatory adversarial cases

The dedicated suite executes the actual `ClaimVerifier` or exported graph-policy behavior; it does not merely grep source. Every assertion is captured as an expected/actual result by the suite’s `record()` helper.

| Criterion | Verification method | Observed result | Evidence path | Status / limitation |
|---|---|---|---|---|
| Exact B9.49 generic false-PASS fixture | Actual `ClaimVerifier.verify()` with valid source-bound graph | `REVIEW_REQUIRED`; structure PASS, traceability PASS, semantic REVIEW_REQUIRED, owner PENDING; 44,803-byte original reproduction hash | [claim-verifier.test.js](../tools/claim-verifier/tests/claim-verifier.test.js), [JSON results](../data/b9_50/evidence/CLAIM-VERIFIER-SEMANTIC-ACCEPTANCE.json) | PASS; machine still does not understand semantic content. |
| All stages use same generic deliverable categories | Actual roadmap validator plus source-derived graph | Semantic `REVIEW_REQUIRED`, never PASS | Same suite | PASS; lexical uniqueness not used as proof. |
| Deliverable wording unique but generic | B9.49 regression alpha–kilo labels | `REVIEW_REQUIRED` | Same suite | PASS; unique marker wording does not bypass. |
| Full headings but non-observable acceptance criteria | Actual verifier with graph | `REVIEW_REQUIRED` | Same suite | PASS; prose adequacy remains human judgment. |
| Invented validation method ID | Mutate verifier-policy graph and run actual graph validator + `ClaimVerifier` | Traceability invalid; aggregate `FAIL` | Same suite | PASS; graph IDs resolve to source-derived expected IDs. |
| Valid-looking deliverable paths lacking acceptance trace | Detach IDs in policy graph | Traceability invalid | Same suite | PASS; paths remain planned, not required to exist. |
| Future deliverables not present yet | Structural validation of planned `dist/...` paths | Structural PASS; semantic `REVIEW_REQUIRED` | Same suite | PASS; no false implementation-completion claim. |
| Complete roadmap without owner acceptance | Canonical policy factory + full claims | `REVIEW_REQUIRED`, owner PENDING | Same suite | PASS; canonical reviewer registry empty. |
| Stale signed roadmap hash | Sign old bytes, then edit artifact | Overall `FAIL`, `HUMAN_REVIEW_ARTIFACT_MISMATCH` | Same suite | PASS. |
| Untrusted review key in record | Sign with attacker key, include attacker public key in record | Overall `FAIL`, `HUMAN_REVIEW_SIGNATURE_INVALID` | Same suite | PASS; record-supplied key is ignored. |
| Trusted policy file tampering | Add attacker key in temporary copy without source pin change | `REVIEW_TRUST_POLICY_HASH_MISMATCH` | Same suite | PASS; legitimate trust update still requires separately authorized source/policy update. |
| Separate semantic and owner reviews | Two fixture keys with distinct roles/purposes, observations and current artifact hash | Fixture overall PASS | Same suite | PASS for signature/policy mechanics only; no real reviewer/key configured. |
| Current canonical roadmap structure/traceability | Exact current file and graph | Structural PASS; traceability PASS | Same suite and [roadmap](../video_platform_roadmap.md) | PASS; semantic REVIEW_REQUIRED and owner PENDING. |
| Test/source/command controls retained | Existing actual subprocess and hash fixtures | 46-case suite pass | Same suite | PASS within tested Node allowlist; no general OS sandbox claim. |
| Renderer/human separation retained | Fresh fake render plus missing human review criterion | Overall FAIL | Same suite | PASS; fixture does not prove real media/renderer authenticity. |
| Unauthorized commands/evidence path safety retained | Actual policy and path resolution | Refused / FAIL | Same suite | PASS for covered cases. |

The 46-case suite also retains missing deliverable, unexecuted/stale test, source replacement, stub, renderer no-execution, missing output, independently detected hash mismatch, contradictory PASS, unauthorized command, missing/traversal evidence, self-reported PASS, and compatibility-pointer checks.

## 6. Commands and results

| Command | Exit code | Result |
|---|---:|---|
| Pre-fix isolated B9.49 reproduction | 0 | Observed false `PASS`, 44,803 bytes, SHA-256 `abc613ec56861de82e3a2b3d6fe963ea86988fd0ad9b2925552e48c5f7dbd109`. |
| `node tools/claim-verifier/tests/claim-verifier.test.js` (JSON summary, `pipefail`) | 0 | **46/46** expected/observed outcomes match; exact B9.49 fixture returns `REVIEW_REQUIRED`. |
| `node tests/engineering-agent-provider.test.js` | 0 | 8/8 passed; deterministic provider fixtures only. |
| `node tools/claim-verifier/tests/engineering-team-pilot.fixture.test.js` | 0 | Disposable fixture passes source/test review; deliberately invalid missing deliverable fails. Test provider only, not a live engineering-team pilot. |
| `node --check tools/claim-verifier/claim-verifier.js` | 0 | Syntax PASS. |
| `node --check tools/claim-verifier/tests/claim-verifier.test.js` | 0 | Syntax PASS. |
| `./node_modules/.bin/eslint tools/claim-verifier/claim-verifier.js tools/claim-verifier/tests/claim-verifier.test.js` | 0 | No diagnostics. |
| `git diff --check` | 0 | PASS for tracked diff; untracked files are not covered by this Git check. |
| `npm test` | Not run | Existing full suite mutates project SQLite/production test rows; out of scope. |
| `python tools/claim-verifier/verifier.py` | Not run | Legacy script writes historical output; known unconditional placeholder. |

No database, paid service/model, local AI inference, GPU, renderer, production video, upload, publish, accepted B9.30 audio, or `phase5-inject.js` was used. OpenHands remains deferred and was not installed or launched.

## 7. Hashes

| Artifact | SHA-256 |
|---|---|
| Pre-fix B9.49 fixture | `abc613ec56861de82e3a2b3d6fe963ea86988fd0ad9b2925552e48c5f7dbd109` |
| Permanent B9.50 regression fixture | `abc613ec56861de82e3a2b3d6fe963ea86988fd0ad9b2925552e48c5f7dbd109` |
| Reviewer trust policy | `e59a53ada5d6e8bab6382dee114bed2a53b18250bf1d1dbb99f354d70827b60a` |

The machine-readable [B9.50 evidence JSON](../data/b9_50/evidence/CLAIM-VERIFIER-SEMANTIC-ACCEPTANCE.json) records expected/actual outcomes, baseline, exact reproducer, command statuses, final Git counts, and boundaries (SHA-256 `ab3bdf6cc900360afad6a628117713048f790588a60ca1e5599f52cbf501b01f`).

| Artifact | SHA-256 |
|---|---|
| [video_platform_roadmap.md](../video_platform_roadmap.md) | `728de6c3ef7adb4a096921f24dda83fe33935908cefb472bc0d00d43297b2c32` |
| [claim-verifier.js](../tools/claim-verifier/claim-verifier.js) | `5ec13b49f6a09b87db726bf5110116bc4e54c6cf2b247786900597f0bcce20d6` |
| [claim-verifier.test.js](../tools/claim-verifier/tests/claim-verifier.test.js) | `50abaaa7c29d60be12d3663fe17d48eaa68098608deb1b0cc4a9d404f75185d7` |
| [claim-verifier README](../tools/claim-verifier/README.md) | `35f6c1d078184f632644c6fd5a15aa704f74c4af0c353c00a1b273b5ff8da913` |
| [pinned reviewer policy](../tools/claim-verifier/policies/video-roadmap-reviewers.json) | `e59a53ada5d6e8bab6382dee114bed2a53b18250bf1d1dbb99f354d70827b60a` |

## 8. Final repository state, governance, and limits

No staged or committed changes. HEAD and branch remain unchanged. The four pre-existing tracked changes remain untouched. New work is limited to the verifier, its test, its fixed trust-policy file, verifier README, Stage 1 current status in the canonical roadmap, and B9.50 report/evidence. B9.49 artifacts remain historical evidence and are not edited.

The canonical roadmap remains the sole authority; its 11-stage order is unchanged. Stage 1 is qualified only for the tested JavaScript status/evidence boundaries. The legacy Python implementation is not qualified. Stage 0 owner acceptance is still pending, so this report does not activate later roadmap work. The provider-runtime suite is unchanged and fixtures only. The old disposable workflow test ran as a test, not a live adoption pilot.

**Next authorized roadmap stage:** Stage 2 — Open-source foundation and adoption decision, but only after Stage 0 roadmap owner acceptance is separately recorded. OpenHands remains **DEFERRED**; no installation or live pilot is included in this authorization. No renderer or video-capability implementation is authorized by B9.50.
