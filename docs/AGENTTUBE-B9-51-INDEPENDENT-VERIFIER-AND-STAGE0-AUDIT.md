# B9.51 — Independent B9.50 Evidence Audit, Verifier Entry-Point Integrity, and Stage 0 Acceptance Packet

**Audit date:** 2026-10-16  
**Repository:** YouTube workspace  
**Initial HEAD / branch:** `e26792ae00dc1ec2434faf32632896609396dfad` / `master`  
**Overall audit disposition: FAIL** — the B9.49 and direct reviewer-policy/receipt bypasses were reproduced and closed with passing regressions, but the canonical roadmap still labels the B9.51 audit `FAIL / requalification pending` while the current captured suite reports 51/51 pass, and the B9.51 report/evidence refer to a different roadmap/source snapshot. The contradictory current acceptance record has not been reconciled. **Owner acceptance remains PENDING.**  
**Audit evidence:** [B9.51 independent evidence](../data/b9_51/evidence/independent-audit-20261016/INDEPENDENT-AUDIT.json)

> The code-level requalification observations below are bounded. The overall audit remains FAIL because the canonical status/evidence version must be reconciled before a coherent owner packet can be presented. This FAIL does not mean the owner rejected the roadmap.

## 1. Repository baseline and preservation

Before reading the audit targets or executing checks, the captured state was:

- HEAD: `e26792ae00dc1ec2434faf32632896609396dfad`; branch: `master`.
- `git status --short`: four modified tracked paths — [package-lock.json](../package-lock.json), [package.json](../package.json), [test.js](../test.js), [utils/scene-repair-service.js](../utils/scene-repair-service.js) — plus untracked paths.
- Porcelain status-entry count: **4 modified tracked**, **134 untracked entries**, **0 staged**. Status entries group untracked directories, so this is not the same count as recursive untracked leaf paths.
- Pre-inspection hashes: canonical roadmap `728de6c3ef7adb4a096921f24dda83fe33935908cefb472bc0d00d43297b2c32`; B9.50 report `8c1be48e3cc6eda6b09017dea553fc5bd158265767b5c354f6dcf7fa85591313`; B9.50 JSON `ab3bdf6cc900360afad6a628117713048f790588a60ca1e5599f52cbf501b01f`; claim verifier `5ec13b49f6a09b87db726bf5110116bc4e54c6cf2b247786900597f0bcce20d6`; dedicated suite `50abaaa7c29d60be12d3663fe17d48eaa68098608deb1b0cc4a9d404f75185d7`; reviewer policy `e59a53ada5d6e8bab6382dee114bed2a53b18250bf1d1dbb99f354d70827b60a`; legacy Python script `100b6dd1402f5fc60183bc33c7c958972746ad34c6b2213e71a10f857907b979`.

The B9.50 evidence’s recorded roadmap/verifier/test/policy hashes matched those captured initial bytes. Its recorded B9.50 evidence JSON hash also matched the observed JSON digest. The B9.50 report itself did not provide a self-hash to compare.

A tracked modification to [.github/workflows/ci.yml](../.github/workflows/ci.yml) appeared after the first status capture. It adds `npm run test:claim-verifier`; this audit did not edit that file and cannot attribute the concurrent change. B9.51 report/evidence files also appeared in the workspace while this audit was underway. They were read, preserved, and not overwritten. Their status counts use inconsistent terminology/counting bases: the earlier B9.51 report says five modified tracked paths and 262/263 recursive untracked paths, while this audit’s first porcelain snapshot had four modified tracked paths and 134 untracked status entries. The new CI change is visible in the current diff; it was absent from the first snapshot.

No reset, clean, checkout, stash, stage, commit, or deletion occurred. B9.49/B9.50 reports, evidence, the original roadmap snapshot, proposal, B9.30 narration, and pre-existing user modifications were preserved.

## 2. B9.50 report/evidence reconciliation

Read the actual [B9.50 report](AGENTTUBE-B9-50-CLAIM-VERIFIER-SEMANTIC-ACCEPTANCE-REPORT.md) and [B9.50 evidence JSON](../data/b9_50/evidence/CLAIM-VERIFIER-SEMANTIC-ACCEPTANCE.json), then inspected current source and reran the relevant regression.

Confirmed historical claims:

- The original B9.49 lexical-roadmap fixture is 44,803 bytes with SHA-256 `abc613ec56861de82e3a2b3d6fe963ea86988fd0ad9b2925552e48c5f7dbd109`.
- Its pre-fix verifier outcome was PASS with no errors; the B9.50 record says that outcome was reproduced.
- The legacy Python script remains a placeholder: it hard-codes its root, only checks roadmap length, returns `true` from `check_evidence()`, and writes `tools/claim-verifier/data/verifier_result.json`. It was source-inspected and not run.
- The B9.50 report correctly limited semantic claims and left owner acceptance pending.

B9.50’s hash inventory was accurate for the captured B9.50 source snapshot but is historical after subsequent B9.51 changes. B9.50 did not record a hash for its Markdown report itself. B9.51’s pre-existing report/evidence are also historical snapshots and must not be used as the current source hash manifest.

## 3. Independent reproduction: B9.49 false PASS and a second entry-point bypass

### Exact 44,803-byte regression

Using the existing `validRoadmap()` fixture source, I reconstructed the unique alpha–kilo generic Deliverables substitutions, preserved the terminal newline, and checked size and SHA-256 **before** judging the verifier result. The fixture matched exactly: 44,803 bytes and `abc613ec56861de82e3a2b3d6fe963ea86988fd0ad9b2925552e48c5f7dbd109`.

The permanent suite then exercised `ClaimVerifier.verify()` with a verifier-policy source-bound traceability graph. Actual result: `REVIEW_REQUIRED`; structural PASS, traceability PASS, semantic `REVIEW_REQUIRED`, owner `PENDING`. A claim-supplied fake semantic/owner PASS field did not change the status. The full raw suite output is preserved in [audit suite stdout](../data/b9_51/evidence/independent-audit-20261016/claim-verifier-suite.stdout.json); a focused summary is [here](../data/b9_51/evidence/independent-audit-20261016/claim-verifier-suite.summary.json).

### Direct reviewer-policy injection bypass

Independently reproduced a second, distinct B9.50 boundary defect. Before remediation, a direct caller constructed `new ClaimVerifier({criteria: [...]})` with its own roadmap policy, self-generated Ed25519 reviewer keys, role/purpose assignments, traceability graph, and matching signed “semantic” and “owner” records. The verifier returned overall PASS, semantic PASS, and owner ACCEPTED. The keys and signed records were created inside a disposable test process, not by a real reviewer. Reproduction details and pre-fix outcome are preserved in [direct injection evidence](../data/b9_51/evidence/independent-audit-20261016/direct-reviewer-policy-injection-reproduction.json).

A second probe directly inserted a fabricated success receipt into the public `v.receipts` map for a test whose source deliberately fails. It returned PASS, proving callers could replace the supposedly in-memory evidence store. These are critical trust-boundary defects beyond the reported lexical case.

### Bounded remediation and regressions

- Canonical roadmap semantic/owner policy is now accepted only when created through a module-private authority token in `createCanonicalRoadmapVerifier()`; the token is not exported.
- Direct construction with caller-supplied roadmap review keys is rejected with `UNTRUSTED_ROADMAP_POLICY`.
- Reviewer keys remain in the source-hash-pinned canonical trust registry, currently empty. The audit did not create trust entries or signatures.
- Verifier criteria and the instance are frozen. The command catalog and receipt map are held in a module-private `WeakMap`; no public receipt setter exists.
- The policy rejects an optional roadmap criterion. Returned verifier results and nested criteria are frozen.
- Permanent cases cover direct reviewer-key injection, plain unreviewed roadmap PASS, caller policy mutation, forged receipt mutation, and the exact B9.49 fixture.

Current results: direct key injection is rejected; direct unreviewed roadmap status is `REVIEW_REQUIRED`; receipt-map mutation and policy/result mutation throw `TypeError`. These are regression-tested in the dedicated suite. Generic human-criterion fixtures still exercise signature mechanics with test-generated keys; those fixtures are not real identities and are not canonical roadmap approvals.

## 4. Verifier entry-point and acceptance-consumer inventory

A repository-wide search of executable source/config plus inspection of package scripts and CI found:

| Caller / reference | Classification | Audit finding |
|---|---|---|
| `package.json` `test:claim-verifier` → `node tools/claim-verifier/tests/claim-verifier.test.js` | Test-only | Regression runner, not an acceptance artifact consumer. |
| [.github/workflows/ci.yml](../.github/workflows/ci.yml) “Claim verifier adversarial qualification” → `npm run test:claim-verifier` | CI test-only | Runs the test suite. It does not certify a roadmap or consume agent PASS. This tracked modification appeared after initial audit capture; audit did not edit it. |
| [claim-verifier.test.js](../tools/claim-verifier/tests/claim-verifier.test.js) | Test-only | Calls `ClaimVerifier`, structural/traceability helpers, canonical verifier factory; synthetic identities and temporary fixtures only. |
| [engineering-team-pilot.fixture.test.js](../tools/claim-verifier/tests/engineering-team-pilot.fixture.test.js) | Test-only | Uses generic verifier and task verifier in a disposable workspace with a deterministic provider fixture. |
| [engineering-agent-provider.test.js](../tests/engineering-agent-provider.test.js) | Test-only | Uses `engineering-task-verifier.js`, not the roadmap `ClaimVerifier`. |
| [engineering-task-verifier.js](../tools/claim-verifier/engineering-task-verifier.js) | Library/test-only | Called by the two test suites; no production app invocation found. Its task policy runs task-declared command/args and is not the canonical roadmap acceptance authority. |
| [verifier.py](../tools/claim-verifier/verifier.py) and `tools/claim-verifier/data/*` | Historical/directly executable, no in-repo caller | No package script, CI workflow, shell wrapper, test runner, or source caller found. Script is still unsafe/unqualified. Historical `VERIFIER_REPORT.md`, `ADVERSARIAL_REPORT.md`, `adv_report.json`, and `verifier_result.json` contain permissive `true`/PASS-like values; no active in-repository code consumer was found. |
| README, operating model, reports, roadmap | Documentation-only / historical | Documentation points to the JS task verifier or states the Python placeholder is unqualified. Historical reports are not executable acceptance authority. |
| External/manual scripts or tools outside this repository | Unknown | Cannot be enumerated from repository search. Historical output files could mislead a human if cited out of context; documentation explicitly disclaims them. |

**Current bypass conclusion:** no authoritative in-repository production caller was found. The JavaScript constructor remains a general verifier requiring caller-supplied policy; that policy is an authority boundary. The canonical roadmap uses the protected factory, and there is no active app consumer that promotes arbitrary `ClaimVerifier` output to release acceptance. The legacy Python placeholder has no active in-repo caller but must remain clearly marked unqualified. External/manual consumers remain outside evidence scope.

## 5. Acceptance-boundary audit

- Structure and traceability are separate fields from semantic review and owner approval.
- Missing graph is `REVIEW_REQUIRED`; stale/invented/inconsistent graph is FAIL. A matching graph is only source-linked stage-exit traceability.
- The canonical policy links required semantic and owner review criteria. Empty reviewer registry means no signature can currently qualify.
- Review signature covers purpose, role, exact criterion IDs, structured observations, decision, artifact hash, timestamp, and reference. Stale artifact hash, untrusted key, bad signature, wrong role/purpose, or incomplete observations fails.
- A claim-supplied public key does not create trust in canonical policy; fixed policy digest is checked.
- Signature proves that a trusted key signed bytes, not that a human thought carefully. No real key/review exists.
- Render criteria only check allowlisted command receipt, manifest, freshness, nonempty output, and hash consistency. The test fixture writes arbitrary text bytes. No evidence establishes native renderer execution or playable output. Visual quality is not established.
- Test receipts are now private to the verifier instance; test source hashes are tied to verifier policy and direct Node invocation. The test still depends on the expected hash being part of trusted verifier policy.
- Generic `ClaimVerifier` policies can be authored by their caller; only the canonical roadmap policy gets the private authority marker. No authoritative production caller was found. The verifier source is mutable, untracked workspace content rather than a trusted committed artifact, so this local audit does not authenticate code against a malicious editor.

Canonical roadmap result reproduced: structural PASS; traceability PASS with verifier-derived graph; semantic `REVIEW_REQUIRED`; owner PENDING; aggregate `REVIEW_REQUIRED`. No owner acceptance was inferred.

## 6. Bounded requalification

Independent audit evidence in `data/b9_51/evidence/independent-audit-20261016/` preserves raw stdout/stderr and focused summaries. Commands known to have been executed during this audit:

| Command | Exit | Result |
|---|---:|---|
| `node tools/claim-verifier/tests/claim-verifier.test.js` | 0 | 51/51 expected/observed cases in the captured run; includes exact B9.49 case and policy/receipt protections. |
| `node tests/engineering-agent-provider.test.js` | 0 | 8/8; provider fixtures only. |
| `node tools/claim-verifier/tests/engineering-team-pilot.fixture.test.js` | 0 | Disposable deterministic test provider; implementation/assertions pass, fake missing-deliverable claim fails. Not a live agent pilot. |
| `node --check tools/claim-verifier/claim-verifier.js` | 0 | Syntax pass. |
| `node --check tools/claim-verifier/tests/claim-verifier.test.js` | 0 | Syntax pass. |
| `./node_modules/.bin/eslint tools/claim-verifier/claim-verifier.js tools/claim-verifier/tests/claim-verifier.test.js` | 0 | Targeted lint pass. |
| `git diff --check` | 0 | Exit 0 for tracked diff; untracked source is not covered. |

These raw checks predate some concurrent workspace activity and the record counts do not establish a safe final snapshot hash. They are preserved at [independent audit evidence directory](../data/b9_51/evidence/independent-audit-20261016/). The full `npm test` suite was not run: source inspection of [test.js](../test.js) shows database initialization, a `test_key` settings write, and production-table test mutations. The legacy Python verifier was not executed because it writes its historical output.

## 7. Stage 0 owner-acceptance packet

### Artifact under consideration

- Canonical file: [video_platform_roadmap.md](../video_platform_roadmap.md), roadmap version **1.0**, Stage 0–10 order unchanged.
- At a direct validation read during this audit, the roadmap SHA-256 was `099ae17ca07cc4bde3c67279632d5a02c7358637c09bc4fa3be4f0c44d77264d`. This digest was observed before later workspace status changes; the B9.51 prior evidence/report also carries a different recorded root roadmap digest (`3cc40bd…`). These point to different roadmap versions. Recompute the digest on the exact bytes shown to the owner before accepting; the current exact final digest was not independently recaptured in the final evidence command.
- Captured B9.50 starting hash: `728de6c3ef7adb4a096921f24dda83fe33935908cefb472bc0d00d43297b2c32`, not the current candidate version.

### What Stage 0 acceptance authorizes

Stage 0 acceptance confirms the owner accepts this roadmap’s objective, scope, constraints, stage sequence, dependencies, evidence expectations, and governance as the planning authority. Under the roadmap, only **Stage 1 may be proposed after owner acceptance**. It does not automatically launch a new task, adopt OpenHands, qualify the Python placeholder, qualify the renderer, approve production rendering, or start Stage 2. This audit itself explicitly authorizes no later stage.

### Verified mechanically / directly reviewed

- 11 canonical stage headings and all 16 required subsections per stage are present; local links and stage order are checked by the JS validator.
- Current canonical traceability graph binds the stage source units to the exact roadmap bytes. It does not assert semantic quality.
- Product priority remains visuals first; audio customization remains deferred; B9.30 narration remains frozen; provider independence, remote-compute limits, visual quality, and independent verification are represented.
- Roadmap says proposed/blocked/implemented/qualified states are distinct. Stage 1 currently reports a B9.51 boundary failure/requalification state; this report documents the remediation but the field and artifact hash should be reconciled in a controlled change record.

### Remains an owner or human judgment

- Whether the objective and constraints are the owner’s intended direction.
- Whether stage dependencies, deliverables, and acceptance gates are sufficient for the intended product.
- Whether proposed adoption/compute policies are acceptable.
- Whether the roadmap should be owner-accepted as written.
- Whether Stage 1 should be proposed after acceptance; this audit does not decide that.

### Risks, limitations, and missing prerequisites

1. No owner acceptance or independent semantic review record exists; the trust registry has zero authorized reviewers.
2. The root roadmap is untracked and mutable; HEAD does not contain this artifact or the JavaScript verifier. An owner review must identify exact bytes/hash and a process for preserving the accepted version.
3. The B9.51 previous report/evidence and the current observed roadmap digest disagree; resolve version identity before the owner signs/accepts.
4. The JS graph is stage-exit granularity and repeats a compound acceptance section across source-derived links; it cannot detect semantic irrelevance.
5. The Python verifier and old permissive output files remain, though no active in-repo consumer was found.

### Consequences of decision

- **Accept:** records the owner’s approval of this exact roadmap version. Only Stage 1 may then be proposed under the documented sequence; no automatic implementation or renderer work follows.
- **Reject / request revision:** roadmap remains not accepted; Stage 0 stays active; changes must follow roadmap change control, preserve the prior version, and be revalidated. No subsequent stage proceeds.
- **Defer:** status remains pending; no stage advances.

**Decision status:** owner acceptance **PENDING**. This packet is for the owner; the auditor does not decide or sign it.

## 8. Files and changes during this audit

The audit did not alter accepted B9.30 narration, `phase5-inject.js`, databases, provider runtime, renderer, OpenHands configuration, or historical B9.49/B9.50/B9.51 reports/evidence. Bounded verifier and test changes were made to close the direct reviewer-key injection and public receipt mutation pathways, with permanent regression tests. Verifier README and the root Stage 1 current-status wording were adjusted to reflect the finding/remediation and preserve the Stage 0 block. New raw audit files were written only beneath the unique `data/b9_51/evidence/independent-audit-20261016/` directory; no existing evidence file was overwritten.

A tracked `.github/workflows/ci.yml` change adding the claim-verifier test step appeared after the audit baseline and is not attributed to this audit. No staging or commit occurred.

## 9. Final status and authorization

- B9.49 exact lexical false-PASS: independently reproduced pre-fix; exact permanent regression returns `REVIEW_REQUIRED`.
- Direct reviewer-key policy injection: independently reproduced pre-fix; canonical factory guard returns `UNTRUSTED_ROADMAP_POLICY` and suite regression passes.
- Public receipt-map forgery: independently reproduced pre-fix; receipts are now private and suite regression passes.
- Legacy Python verifier: **NOT QUALIFIED**, not executed; historical output remains non-authoritative.
- Canonical roadmap: structural PASS; traceability PASS with source graph; semantic REVIEW_REQUIRED; owner PENDING; aggregate REVIEW_REQUIRED.
- OpenHands: **DEFERRED**; no live pilot.
- Production renderer/video: not performed.
- Stage 0 owner acceptance: **PENDING**.
- Stage 1 or any later roadmap stage: **NOT AUTHORIZED by this audit**.

The current code/test boundary observed in this audit is fail-closed for the listed cases, but the overall audit remains **FAIL** until the canonical Stage 1 status and the exact root-roadmap hash are reconciled in a new, authorized record. The owner has not accepted or rejected Stage 0. No later roadmap stage is authorized.
