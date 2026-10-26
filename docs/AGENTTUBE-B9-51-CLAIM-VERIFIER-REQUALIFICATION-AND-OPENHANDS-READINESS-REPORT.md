# B9.51 — Claim Verifier Requalification and OpenHands Readiness

**Date:** 2026-10-16  
**Repository:** YouTube workspace  
**HEAD / branch:** `e26792ae00dc1ec2434faf32632896609396dfad` / `master` (unchanged)  
**Disposition:** JavaScript claim verifier **PASS — qualified for the tested fail-closed status/evidence boundary**; roadmap semantic review **REVIEW_REQUIRED**; owner acceptance **PENDING**; Stage 1 transition **BLOCKED pending Stage 0 owner acceptance**; OpenHands adoption **DEFERRED**; live OpenHands/team pilot **NOT EXECUTED**.  
**Evidence:** [B9.51 machine-readable results](../data/b9_51/evidence/CLAIM-VERIFIER-REQUALIFICATION.json)

## 1. Executive result

The previously reported direct-policy-injection bypass is now rejected, and the permanent regression exercises the public `ClaimVerifier` construction path with attacker-generated semantic and owner key pairs, signed reviews, and a roadmap PASS claim. The current `npm run test:claim-verifier` run exited **0** with **51/51** expected-versus-observed cases matching. Separate runs passed the disposable provider-interface fixture and the provider-contract suite (8/8). Syntax, targeted lint, and tracked-diff whitespace checks also passed.

This is deliberately bounded qualification, not a claim of general semantic understanding or universal verifier correctness. For the canonical roadmap, the verifier reports structure **PASS**, configured source-hash traceability **PASS**, semantic status **REVIEW_REQUIRED**, and owner acceptance **PENDING**. No real reviewer key is configured; none was manufactured. The canonical roadmap itself still records Stage 0 owner acceptance pending. Thus the verifier's tested fail-closed boundary is requalified, but this report does not waive roadmap governance or authorize a transition to Stage 1/Stage 2 implementation.

OpenHands remains a candidate, not an adopted system. No `kilo` or `agent-canvas` executable is installed; no provider login/model authorization was established for this work. Although Docker responds and Node.js/`uv` meet the documented local prerequisites, the current machine has 4 CPU cores and only about 4 GiB available RAM with nearly all swap used. There is no approved Agent Server configuration, dedicated sandbox/workspace, or authorized agent/model path. Installation, container creation, credentials, and model execution were therefore not attempted. The deterministic provider fixture is not an OpenHands pilot.

## 2. Authority, baseline, and preservation

The only full roadmap remains the root [video_platform_roadmap.md](../video_platform_roadmap.md). The old [data/roadmap/ROADMAP.md](../data/roadmap/ROADMAP.md) is a compatibility pointer, and [VIDEO_PLATFORM_ROADMAP_PROPOSAL.md](../VIDEO_PLATFORM_ROADMAP_PROPOSAL.md) remains preserved proposal material. The root roadmap's current Stage 1 note now records the bounded 51-case requalification while explicitly retaining Stage 0 owner acceptance as a prerequisite.

Baseline and final Git identity: HEAD `e26792ae00dc1ec2434faf32632896609396dfad`, branch `master`, three commits behind `origin/master`. At the post-run inventory there are **5 modified tracked paths**, **264 untracked status entries** (including this report and its evidence JSON), and **0 staged entries**. The five modified tracked paths are `.github/workflows/ci.yml`, `package-lock.json`, `package.json`, `test.js`, and `utils/scene-repair-service.js`; all were inspected/preserved, not reset or overwritten. This work added the B9.51 report/evidence and updated the roadmap's Stage 1 current-state paragraph. No destructive Git operation, staging, or commit occurred. Historical B9.49/B9.50 reports and evidence remain unchanged.

The legacy [verifier.py](../tools/claim-verifier/verifier.py) remains **NOT QUALIFIED**: it is a historical placeholder with an unconditional evidence result and was not run. The JavaScript verifier and policy live at [claim-verifier.js](../tools/claim-verifier/claim-verifier.js) and [video-roadmap-reviewers.json](../tools/claim-verifier/policies/video-roadmap-reviewers.json); the source-pinned trust registry contains zero reviewers.

## 3. Adversarial requalification

### Run result

| Check | Result |
|---|---|
| `npm run test:claim-verifier` | Exit 0; 51/51 cases matched expected values. |
| B9.49 unique-marker generic-roadmap false-PASS fixture | `REVIEW_REQUIRED`; structure and source-bound traceability PASS, semantic review remains required, owner pending. The exact fixture is 44,803 bytes, SHA-256 `abc613ec56861de82e3a2b3d6fe963ea86988fd0ad9b2925552e48c5f7dbd109`. |
| Canonical root roadmap | Structure PASS; traceability PASS using verifier-owned graph; semantic `REVIEW_REQUIRED`; owner `PENDING`. |
| Canonical reviewer registry | 0 trusted reviewers; adding a key without the pinned verifier policy change is rejected. |
| Provider runtime contract suite | Exit 0; 8/8 fixture groups. |
| Isolated provider-interface workflow | Exit 0; one deterministic implementation attempt, no retries, two verifier runs, 149 ms observed; correct behavior passes and false missing-deliverable claim fails with `EVIDENCE_MISSING`. Not an AI or live-team pilot. |
| Syntax / lint / whitespace | `node --check` on verifier and adversarial test passed; targeted ESLint passed with no diagnostics; `git diff --check` passed. |

### Required adversarial coverage

| Attack or false-success case | Current observed result |
|---|---|
| Title/status/bullets-only roadmap | Structural `FAIL`. |
| Canonical headings with empty required sections | Structural `FAIL`. |
| Generic repeated deliverables or unique superficial report/schema/artifact markers | `REVIEW_REQUIRED`, never semantic PASS; exact B9.49 fixture is a permanent public-API regression. |
| Non-observable acceptance prose | `REVIEW_REQUIRED`. |
| Invented validation ID or detached output/acceptance link | Traceability failure; aggregate `FAIL`. |
| Missing deliverable | `FAIL` (`EVIDENCE_MISSING`). |
| Test exists but was not run; stale historical PASS; unrelated command; Node eval masquerading as test | Rejected / `FAIL` or invalid policy. |
| Test source changes before or after execution; forged/stale receipt | Rejected; receipt identity and expected source hash are checked. |
| Stub component | `FAIL` (`STUB_IMPLEMENTATION`). |
| Renderer claim without verifier-owned execution; success without output; mismatched hash/reference | `FAIL`. |
| Technical render presented as subjective visual acceptance | Human acceptance remains unsatisfied; `FAIL`/review boundary. |
| Mandatory test failure contradicted by reported PASS | `FAIL`; observed command status takes precedence. |
| Missing, unsigned, agent-authored, stale, or untrusted human review | Rejected; signature/key, purpose/role, and artifact-hash checks apply. |
| Direct caller injects roadmap reviewer keys and signatures | `UNTRUSTED_ROADMAP_POLICY`; cannot create the canonical verifier policy. |
| Verifier policy/result mutated after construction/derivation | Mutation rejected; result remains frozen. |
| Roadmap marked optional, missing trust graph, tampered pinned trust JSON | Invalid policy, `REVIEW_REQUIRED`, or `REVIEW_TRUST_POLICY_HASH_MISMATCH`, as appropriate. |
| Missing/traversal evidence path or unauthorized executable | Rejected. |
| Compatibility pointer used as canonical roadmap | Structural `FAIL`. |

The full 51-case expected/actual record is represented by the test run in [claim-verifier.test.js](../tools/claim-verifier/tests/claim-verifier.test.js); the current case list and focused outcomes are summarized in the [machine-readable evidence](../data/b9_51/evidence/CLAIM-VERIFIER-REQUALIFICATION.json).

### Trust and semantic limitations

The canonical roadmap factory ties its reviewer policy to a verifier-pinned trust file; arbitrary callers cannot substitute keys for the canonical semantic-review or owner-acceptance path. Test-only fixtures with generated keys continue to exercise signature mechanics for generic review criteria; these keys are not real approvers. The canonical trust store is empty, so no real semantic review or owner acceptance can be asserted.

The verifier can establish selected structural facts, command receipts, hashes, and source-bound traceability relationships. It cannot establish that natural-language plans are substantively wise, tests are adequate for all possible defects, a signed reviewer thoughtfully examined the artifact, or a render manifest represents playable/authentic production video. The render fixture's output is synthetic; no renderer authenticity or visual-quality claim follows. Keep the legacy Python verifier labeled unqualified.

## 4. OpenHands Agent Canvas readiness

Official documentation/current release references reviewed: [OpenHands v1.27.1 release](https://github.com/OpenHands/OpenHands/releases/tag/v1.27.1), tag commit `f07aebdf5cdd71f4a05ebcf30f8bef5e4e3b70b9`; [Agent Canvas overview](https://docs.openhands.dev/openhands/usage/agent-canvas/overview); [backends](https://docs.openhands.dev/openhands/usage/agent-canvas/backends); [ACP agents](https://docs.openhands.dev/openhands/usage/agent-canvas/acp-agents); [ACP protocol](https://agentclientprotocol.com/protocol/overview); and [Kilo CLI reference](https://kilo.ai/docs/code-with-ai/platforms/cli-reference). These are documentation/release facts, not local runtime qualification.

- Agent Canvas is a browser control surface; selected Agent Server backends execute tools, manage workspaces/secrets, and may launch an ACP agent process. A remote UI/backend arrangement does not itself isolate the workspace.
- Documented ACP agents include Claude Code, Codex, Gemini CLI, Pi, OpenCode, and custom stdio agents. Current Kilo CLI docs describe `kilo acp`, while this repository adapter uses `kilo run`; Kilo is absent locally, so the exact binary/version/protocol compatibility is **NOT VERIFIED**.
- Direct local execution has a broad host-filesystem trust boundary. Docker can restrict process visibility to mounts, but any shared mounted worktree remains shared writable state. A future pilot needs a fresh dedicated disposable mount, scoped secrets/network, explicit cleanup, and verifier-controlled output collection.
- Observed local prerequisites: Node v24.20.0, npm 11.19.0, `uv` present, Docker client/server 29.8.1 responsive. `agent-canvas` and `kilo` are absent. Resource snapshot: 4 CPU cores, approximately 4 GiB available RAM, 499/511 MiB swap used, and about 61 GiB root disk free.
- The official docs describe optional credential-free OpenCode Zen free models in some local usage, but no OpenHands/ACP installation, selected provider, account policy, model behavior, data egress, rate/cost, or authorization was validated here. Availability of a documented free route is not consent to install or send repository/task data.
- No installation, dependency download, sandbox/container creation, secret entry, model request, remote backend, or active-repository agent access occurred. No productivity baseline or resource benchmark was collected.

**Decision: DEFER OpenHands adoption and the live pilot.** First obtain explicit owner approval for the Stage 0 roadmap, approve a specific no-cost provider/model and data-handling path, prepare a dedicated disposable sandbox and credentials policy, and test the exact pinned ACP/backend combination on a synthetic workspace. Reassess resources after isolation is configured. Do not connect Agent Canvas to the active repository in the meantime.

## 5. Commands, exclusions, and state

| Command/check | Result |
|---|---|
| `npm run test:claim-verifier` | Exit 0; 51 cases. Output captured in `/tmp/b9-51-claim-verifier.log` for this run. |
| `node tools/claim-verifier/tests/engineering-team-pilot.fixture.test.js` | Exit 0; deterministic disposable fixture only. |
| `node tests/engineering-agent-provider.test.js` | Exit 0; 8/8 fixture groups. |
| `node --check tools/claim-verifier/claim-verifier.js` and test file | Exit 0. |
| `./node_modules/.bin/eslint tools/claim-verifier/claim-verifier.js tools/claim-verifier/tests/claim-verifier.test.js` | Exit 0; no diagnostics. |
| `git diff --check` | Exit 0. |
| `npm test` | Not run: the project-wide suite can mutate SQLite/production test rows; outside this safe verification scope. |
| OpenHands, Kilo, Docker sandbox launch, provider/model/API | Not run; no approved/qualified live provider path. Docker info was read only. |
| Renderer, production render, `phase5-inject.js`, database write, upload/publish, GPU, paid service | Not performed. |

No accepted B9.30 narration was changed. No production artifact was generated. No dependency was installed. No container or volume was created. No file outside this bounded verifier/report/roadmap work was intentionally changed; all pre-existing user modifications remain preserved. No staging or commit occurred.

## 6. Evidence inventory and next gate

| Artifact | SHA-256 |
|---|---|
| [video_platform_roadmap.md](../video_platform_roadmap.md) | `3cc40bd857022c4547f085fe3072ffe60d6888ef3fbbc35208719fd3df409ecb` |
| [claim-verifier.js](../tools/claim-verifier/claim-verifier.js) | `a9cdae00b4eb4719b94606a209538c40f40b4888c29cc48ccc97367e94a1e728` |
| [claim-verifier.test.js](../tools/claim-verifier/tests/claim-verifier.test.js) | `fbc74eea8037eadc988b7d7b51dfc85d66614f7243c6eb0a43f9d51a7e65401b` |
| [engineering-team-pilot.fixture.test.js](../tools/claim-verifier/tests/engineering-team-pilot.fixture.test.js) | `89925c7c7c919a37dbca7f0c19816b1c508a7f55636df2d085d606523daad1d6` |
| [video-roadmap-reviewers.json](../tools/claim-verifier/policies/video-roadmap-reviewers.json) | `e59a53ada5d6e8bab6382dee114bed2a53b18250bf1d1dbb99f354d70827b60a` |

**Next action:** obtain the roadmap owner's Stage 0 acceptance or explicit governance exception before declaring a Stage 1 transition. Then, separately authorize semantic reviewer identities and owner-acceptance keys through the pinned trust-policy process. Only after that may Stage 2 candidate evaluation be proposed. OpenHands remains deferred; no video production stage is started by this report.
