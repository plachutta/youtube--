# B9.49 — Claim Verifier Qualification and OpenHands Readiness

**Date:** 2026-10-16  
**Repository:** YouTube workspace  
**Initial/final HEAD:** `e26792ae00dc1ec2434faf32632896609396dfad` (unchanged)  
**Branch:** `master` (unchanged)  
**Disposition:** Canonical roadmap structurally validated; claim verifier **NOT QUALIFIED** due a reproduced semantic-roadmap false PASS; OpenHands adoption **DEFERRED**.  
**Evidence:** [B9.49 results](../data/b9_49/evidence/CLAIM-VERIFIER-QUALIFICATION.json)

## 1. Required status distinctions

| State | Result |
|---|---|
| ROADMAP STRUCTURALLY VALIDATED | **YES** — 11 stages, 176 required subsection checks, 23 local links, no broken links. |
| ROADMAP OWNER-ACCEPTED / PENDING | **PENDING** — not inferred from structure or tests. |
| CLAIM VERIFIER QUALIFIED / NOT QUALIFIED | **NOT QUALIFIED** — 31 suite cases pass, but an additional adversarial fixture yields a verifier-derived false PASS. Legacy Python verifier remains an unconditional placeholder. |
| PROVIDER-NEUTRAL RUNTIME TESTED | **YES, fixtures only** — 8/8. |
| LIVE PROVIDER INTEGRATION VERIFIED / NOT VERIFIED | **NOT VERIFIED** — no external agent/runtime executed. |
| ENGINEERING-TEAM PILOT EXECUTED / NOT EXECUTED | **NOT EXECUTED** — a disposable provider-interface test ran, not an adoption pilot. |
| OPENHANDS ADOPTED / DEFERRED / REJECTED | **DEFERRED** — no installation or live execution. |
| PRODUCTION VIDEO RENDER NOT PERFORMED | **CONFIRMED**. |

The additional false-success probe overrides the 31/31 suite result. The gate remains blocked; no Stage 2 adoption or production work is authorized by this report.

## 2. Repository baseline and preservation

At start: HEAD `e26792ae00dc1ec2434faf32632896609396dfad`, branch `master`, 4 modified tracked paths ([package-lock.json](../package-lock.json), [package.json](../package.json), [test.js](../test.js), [utils/scene-repair-service.js](../utils/scene-repair-service.js)), 132 untracked status entries, and 0 staged entries. These were existing user state and were preserved. No reset, clean, checkout, stash, deletion, staging, or commit occurred.

B9.49 changed only the local roadmap status text, verifier source/tests/readme, and added one disposable workflow test plus this report/evidence. No video-production runtime, package manifest, database, or production configuration was changed. Historical B9.47/B9.48 documents remain unchanged; the canonical roadmap’s current digest naturally changed when its current-state paragraph was updated.

## 3. Roadmap authority and content

The single canonical plan is the root [video_platform_roadmap.md](../video_platform_roadmap.md). [Context Governance §21](CONTEXT-GOVERNANCE.md#21-authoritative-video-platform-roadmap), the [Engineering Reporting Standard](ENGINEERING-REPORTING-STANDARD.md), and the [Engineering Agent Operating Model](ENGINEERING-AGENT-OPERATING-MODEL.md) point to that file. [data/roadmap/ROADMAP.md](../data/roadmap/ROADMAP.md) is a resolvable compatibility pointer, not another plan. [VIDEO_PLATFORM_ROADMAP_PROPOSAL.md](../VIDEO_PLATFORM_ROADMAP_PROPOSAL.md) remains preserved proposal material.

The executed deterministic check found 11 unique Stage 0–10 headings; all 16 mandatory subsections in each stage (176/176); 23 local Markdown links with no missing targets; a resolving pointer; and canonical references in governance/reporting/operating documents. The stage content was also reviewed directly: objectives, dependencies, deliverables, required tests/evidence, risks, measurable acceptance/exit gates, and follow-on authorization are present. It prioritizes visual quality, defers voice customization, freezes accepted B9.30 narration, and integrates provider neutrality, remote compute, and independent verification. This content review does not establish product-owner acceptance. Stage 0 remains **owner acceptance pending**.

The current Stage 1 paragraph in the canonical roadmap now records the live NOT QUALIFIED finding, the 31 passing suite cases, the remaining semantic false PASS, the render-authenticity boundary, and the still-pending owner decision.

## 4. Claim-verifier review and adversarial results

Inspected [legacy verifier.py](../tools/claim-verifier/verifier.py), [ClaimVerifier](../tools/claim-verifier/claim-verifier.js), [engineering-task-verifier.js](../tools/claim-verifier/engineering-task-verifier.js), and the dedicated [adversarial suite](../tools/claim-verifier/tests/claim-verifier.test.js).

The legacy Python script hard-codes a workspace path, checks roadmap length only, returns `true` unconditionally for evidence, and writes to its historical output. It was not run; it remains unqualified.

The JavaScript verifier reads the configured workspace; rejects traversal/symlink escape; checks configured file content/hash/size; executes verifier-catalog commands with shell disabled; captures exit status and output hashes; keeps fresh receipts in process memory; derives required criteria rather than trusting reported PASS; and checks signed, artifact-bound human-review records. Changes made during this tranche:

- Fixed a stub-test policy fixture that aborted before the stub assertion.
- Added minimum section content, repeated-section detection with numeric normalization, and a minimum set of deliverable artifact markers.
- Required safe relative test paths, direct Node test-file execution, verifier-owned expected source SHA-256, actual command receipt metadata, and matching pre-/post-execution source identity.
- Bound render evidence references to policy and required a fresh regular manifest as well as a fresh artifact/hash.
- Added a regression showing technical render success cannot satisfy human visual acceptance.

The dedicated verifier suite exited **0**, with **31/31** expected/observed cases. Mandatory user cases:

| Case | Expected | Actual | Observed evidence |
|---|---|---|---|
| Title/status/bullets-only roadmap | Reject | Reject | Missing stages and policy content. |
| Headings without meaningful deliverables | Reject | Reject | Empty sections/minimum substantive checks. |
| Missing claimed deliverable | FAIL | FAIL | `EVIDENCE_MISSING`. |
| Test file exists but is unexecuted | FAIL | FAIL | `TEST_NOT_EXECUTED`. |
| Historical PASS treated as fresh | FAIL | FAIL | No fresh in-memory receipt. |
| Stub component | FAIL | FAIL | `STUB_IMPLEMENTATION`. |
| Renderer claim without verifier-owned execution | FAIL | FAIL | `RENDER_NOT_EXECUTED`. |
| Successful command, missing output | FAIL | FAIL | `EVIDENCE_MISSING`. |
| Independently detected artifact hash mismatch | FAIL | FAIL | `RENDER_HASH_MISMATCH`. |
| Mandatory failure contradicted by reported PASS | FAIL | FAIL | Actual failure exit code 7; overall FAIL. |
| Human acceptance without review record | FAIL | FAIL | `EVIDENCE_MISSING`. |
| Unauthorized command | Refuse | Refuse | `UNAUTHORIZED_COMMAND`. |
| Missing/traversal evidence reference | FAIL | FAIL | Rejected. |
| Self-reported PASS without independent observation | FAIL | FAIL | Overall FAIL. |
| Unique numeric boilerplate without concrete outputs | Reject | Reject | Repeated-content and deliverable-marker checks. |
| Unique generic deliverables with superficial markers | **FAIL** | **PASS** | False-success path; qualification blocker. |

### Reproduced false PASS

An isolated **44,803-byte** roadmap fixture contained all required headings and unique per-stage wording, but each deliverables section only named generic “report”, “schema”, and “artifact” markers. Expected result: reject as meaningless stage deliverables. Actual result: `ClaimVerifier.verify()` returned **PASS**, `roadmapValid: true`, and no errors. The temporary fixture was removed. This reproduces a mandatory false-success scenario; the verifier is **NOT QUALIFIED**.

The root cause is fundamental to the current lexical policy: minimum words, marker counts, and exact normalized-text comparisons cannot prove natural-language meaning. The canonical roadmap passed those mechanical checks and was manually assessed, but the verifier cannot generalize that judgment. Treating “three artifact words” as substantive evidence would be unsafe.

### Trust-boundary limits

- Test execution is tied to a verifier-owned expected SHA-256 and direct Node invocation. The expected hash must itself come from trusted reviewer policy; deriving it from the implementation claim would defeat the control.
- Render status establishes configured-command/manifest/artifact consistency only. The test fixture writes arbitrary text bytes and a matching manifest; this does not prove playable media or genuine renderer execution. Render authenticity depends on the verifier-owned command implementation.
- Human acceptance remains separate. A signature validates configured-key possession and binds the record to bytes; it cannot prove that a person actually viewed or understood a video. No subjective visual-quality result is claimed.
- The old Python script remains unsafe/unqualified and is not replaced by the new suite.

## 5. Provider runtime and disposable workflow fixture

`node tests/engineering-agent-provider.test.js` exited **0**, 8/8 fixture groups. These cover explicit provider routing, capability mismatch, checkpoint portability, provider removal, and independent acceptance; they are not live-provider tests.

A no-network test-provider workflow ran in an OS temporary directory outside the repository: explicit canonical task → deterministic provider writes `slugify.js` → independent source/test review → task verifier passes two behavior assertions → a deliberately false missing-deliverable claim fails with `EVIDENCE_MISSING`. Final observed run: one implementation attempt, zero retries, two verifier runs, **213 ms** elapsed. The temp directory was removed. This was a **provider-interface test**, not an engineering-team adoption pilot or OpenHands integration. There was no external independent reviewer, baseline comparison, resource benchmark, or productivity claim.

## 6. OpenHands Agent Canvas architecture and adoption readiness

The relevant official release on 2026-10-16 was [OpenHands v1.27.1](https://github.com/OpenHands/OpenHands/releases/tag/v1.27.1), dated 2026-10-12, tag commit `f07aebdf5cdd71f4a05ebcf30f8bef5e4e3b70b9`. Official sources reviewed: [ACP integrations](https://docs.openhands.dev/openhands/usage/agent-canvas/acp-agents), [backends](https://docs.openhands.dev/openhands/usage/agent-canvas/backends), [self-hosting security](https://github.com/OpenHands/OpenHands/blob/main/docs/SELF_HOSTING.md), [ACP protocol overview](https://agentclientprotocol.com/protocol/overview), and [Kilo CLI reference](https://kilo.ai/docs/code-with-ai/platforms/cli-reference).

- Agent Canvas is the UI/control center; Agent Server executes conversations/tools on selected local or remote backends. An Automation Server can schedule/event-dispatch tasks. Control/UI and actual agent execution can be on separate hosts.
- Documented choices include built-in OpenHands, Claude Code, Codex, Gemini CLI, Pi, OpenCode, and custom stdio ACP agents. ACP is JSON-RPC over stdio with protocol initialization, capabilities, authentication, sessions, prompts, updates, and cancellation.
- No-sandbox local mode gives the agent host filesystem access. Docker conversation containers improve process isolation, but shared mounted workspaces remain shared; separate disposable directories/worktrees are needed. Canvas/automation control services are not all sandboxed per conversation.
- Self-hosted remote Agent Servers are possible but privileged and require key/network hardening. Cloud, Enterprise, and managed sandbox options were not used or assumed free.
- Documented local requirements: Node.js 24+ and `uv`; Docker for Docker sandboxes. Observed machine: Node v24.20.0, 4 CPU cores, about 3.2 GiB available RAM, about 62.4 GiB root disk free. This is limited headroom for Canvas plus local sandboxes; no container was started.
- Agent/model authentication requires an existing provider login/subscription or API key, depending on provider/backend. Fresh containers generally need credentials securely provisioned. No authorized model/account path was established. No paid call, subscription, GPU job, or cloud-server purchase was made.
- Kilo's official CLI docs advertise `kilo acp`, but this repository adapter invokes `kilo run`; the Kilo CLI is absent locally and no exact-version ACP handshake was run. Compatibility is **NOT VERIFIED**.
- OpenHands overlaps future UI, backend management, conversation/workspace lifecycle, automation, and ACP dispatch. It does not replace canonical task/evidence contracts or the project's independent claim verifier. Existing provider-neutral runtime has basic contracts/registry/checkpoints but no persistent scheduler or qualified safe sandbox.

**Recommendation: DEFER.** The verifier gate did not pass, no safe authorized model path or sandboxed Agent Server was established, and the potential value has not been measured. No installation/migration is warranted. Reconsider only after verifier qualification, an authorized no-cost model path, a disposable isolated backend, and an exact adapter test.

## 7. Commands and results

| Command/check | Exit | Result |
|---|---:|---|
| `node tools/claim-verifier/tests/claim-verifier.test.js` (run through JSON summarizer with `pipefail`) | 0 | 31/31 suite cases; separate adversarial false PASS still blocks qualification. |
| Isolated unique-marker roadmap probe | 0 | Expected FAIL; actual PASS, 44,803-byte fixture. |
| `node tests/engineering-agent-provider.test.js` | 0 | 8/8 fixture groups. |
| `node tools/claim-verifier/tests/engineering-team-pilot.fixture.test.js` | 0 | Disposable implementation/verification flow; false missing-deliverable claim rejected. |
| `node --check` on verifier and both test files | 0 | Syntax PASS. |
| Targeted local ESLint on three JavaScript files | 0 | No diagnostics. |
| Canonical roadmap headings/subsections/links/pointer check | 0 | 11 stages, 176 subsection checks, 23 links, 0 broken targets. |
| `git diff --check` | 0 | PASS for tracked diff; untracked contents are outside Git diff. |
| `npm test` | Not run | `testDatabase()` writes `test_key` to SQLite; `testProductionPersistence()` writes/deletes a production row. Avoided database mutation. |
| Legacy Python verifier | Not run | It writes its existing historical output; known unqualified placeholder. |
| OpenHands/Kilo installation/ACP, renderer, production video render | Not run | No safe/authorized need; no paid call or live agent access to the active repository. |

## 8. SHA-256 inventory

| Artifact | SHA-256 |
|---|---|
| [video_platform_roadmap.md](../video_platform_roadmap.md) | `b3662b51859023c093036c5a501c238b09eb9ed97210ccf89ff29dd6f80c188c` |
| [data/roadmap/ROADMAP.md](../data/roadmap/ROADMAP.md) | `d1fe1226eec0501bab6afff8e18823a631628d00579e9048643c36d2a0a05255` |
| [claim-verifier.js](../tools/claim-verifier/claim-verifier.js) | `fca3b64059fd708e561d12fdb676561d3692fa9d5969a0974f0bb5b502883247` |
| [claim-verifier.test.js](../tools/claim-verifier/tests/claim-verifier.test.js) | `c12ff4fa3f79381f08ff64142ce69a14ef7d098808be886b2f9f9c92942f2443` |
| [engineering-team-pilot.fixture.test.js](../tools/claim-verifier/tests/engineering-team-pilot.fixture.test.js) | `89925c7c7c919a37dbca7f0c19816b1c508a7f55636df2d085d606523daad1d6` |
| [claim-verifier README](../tools/claim-verifier/README.md) | `9f5bd6c6661c25e520151a345a63189333f1a6f1d4fcc203a91aabe0fbe67e92` |

Full machine-readable case names, expected/observed results, known false PASS, source URLs, hashes, and preservation facts are in [CLAIM-VERIFIER-QUALIFICATION.json](../data/b9_49/evidence/CLAIM-VERIFIER-QUALIFICATION.json) (SHA-256 `5d691965b7f264676a540adb59c372490b982db1bf437740360e07ce1cc1aeb0`).

## 9. Final repository state and boundaries

HEAD and branch are unchanged. Final working-tree status has **4 modified tracked paths**, **133 untracked status entries**, and **0 staged entries** (baseline: 4, 132, and 0 respectively). The four pre-existing modified tracked paths remain untouched; the added report increased the untracked status entries by one. B9.47/B9.48 historical reports remain preserved. Temporary test workspaces were removed. No database or historical verifier output was modified; no production render, accepted B9.30 narration edit, `phase5-inject.js`, paid API/model call, new subscription, dependency install, GPU job, container, or volume was created/performed. HEAD and branch are unchanged and no commit was created.

## 10. Next authorized sequence

1. Keep the claim verifier **NOT QUALIFIED** until the demonstrated semantic-roadmap false PASS is closed by trusted, reviewer-approved criteria or a distinct authenticated content-review gate. More lexical marker words alone are insufficient.
2. Preserve roadmap owner acceptance as **PENDING**.
3. Keep legacy `verifier.py` labeled unqualified; do not cite its output.
4. Keep OpenHands **DEFERRED** and do not grant it access to the active project.
5. Continue within Stage 1 only; no Stage 2 adoption or renderer work is authorized here.

**Final decision:** roadmap authority/structure verified; verifier gate failed; a provider-interface fixture ran but no engineering-team adoption pilot did; OpenHands is deferred; production video render was not performed.
