# B9.47 — Provider-Agnostic Engineering Agent Runtime Foundation

**Date:** 2026-10-15  
**Repository:** `/home/gachiemackson/Videos/youtube`  
**Initial HEAD:** `e26792ae00dc1ec2434faf32632896609396dfad`  
**Final HEAD:** unchanged  
**Branch:** `master` (3 commits behind `origin/master`)  
**Decision:** **PARTIALLY ADOPT** the provider-neutral task/adapter/verifier foundation; do not adopt OpenHands or authorize live Kilo execution yet.  
**Evidence:** [B9.47 result record](../data/b9_47/evidence/PROVIDER-PORTABILITY-RESULTS.json)

---

## 1. Executive Summary

Implemented a small provider-neutral engineering task contract and registry, moved all Kilo-specific mechanics into its own optional adapter, added an independent deterministic acceptance verifier, preserved canonical task/checkpoint state across adapter changes, and made the new qualification part of the existing system test entrypoint.

The deterministic fixture proves selection/routing between a Kilo-shaped adapter and an alternate provider, rejection of unknown/disabled providers and capability mismatches, Kilo-adapter removal, transfer of a partial provider-neutral checkpoint, and independent acceptance gating including a deliberate nonzero test result. It does **not** prove a live Kilo, ACP, OpenHands, or other external provider works. The Kilo CLI is absent; only the Kilo VS Code extension 7.8.8 is installed. No paid/model call or provider runtime was launched.

The core is now replaceable, but this is an interface/dispatch foundation rather than a complete persisted engineering control plane. Durable task scheduling, production workspace/sandbox backends, live adapter qualification, and integration with the project roadmap/task ledger remain future work. No roadmap or video-production architecture was changed.

## 2. Scope and Acceptance Criteria

Authorized: inspect current architecture/governance; add a minimum provider-neutral contract, registry, isolated Kilo adapter, capability checks, independent verifier, configuration example, tests, governance references, and this report.

Excluded: changing the roadmap, installing an agent CLI, modifying user credentials, invoking a live or paid model, adopting Agent Canvas, sandbox/container configuration, production database changes, video rendering, publishing, staging, committing, or destructive Git operations.

| Criterion | Result |
|---|---|
| Canonical task/provider/result/checkpoint contracts are provider-neutral | PASS — unit-tested |
| Kilo mechanics are isolated and optional | PASS — Kilo-specific string absence in orchestration-core test; adapter disabled in example config |
| Alternate adapter works with unchanged task contract | PASS — deterministic fixture only |
| No silent fallback; required capability mismatch blocks dispatch | PASS — deterministic negative tests |
| Kilo removal leaves task state and verifier usable | PASS — registry-removal fixture; no live CLI claim |
| Checkpoint carries task/evidence and excludes native session dependency | PASS — exact checkpoint handoff and mismatch rejection tested |
| Independent verification blocks an agent completion claim on failed check | PASS — independent child process exits 7; acceptance fails |
| Live Kilo/ACP/alternate external provider | NOT TESTED — no Kilo CLI or authorized live runtime |
| Persistent scheduling/control plane and safe sandbox backend | NOT IMPLEMENTED |

## 3. Initial State and Governance Reconciliation

The live baseline was recorded before edits: HEAD `e26792ae00dc1ec2434faf32632896609396dfad`, branch `master`, upstream three commits ahead. Initial `git status` contained **2 pre-existing modified tracked files** (`package-lock.json`, `utils/scene-repair-service.js`) and **226 pre-existing untracked files**. The working tree held user-authored hosted-TTS work, reports, test files, `.kilo/agents/data.md`, verifier artifacts, and other historical evidence. These were not reset, cleaned, staged, or committed.

The existing roadmap at [ROADMAP.md](../data/roadmap/ROADMAP.md) is itself pre-existing untracked local state. Its content records IN_PROGRESS, OpenMontage as a reference assessment, and native renderer NOT_VERIFIED; its embedded HEAD/change-count note is historical and does not supersede the captured live Git state. It was not changed.

The canonical-looking [Context Governance](CONTEXT-GOVERNANCE.md) and [Engineering Reporting Standard](ENGINEERING-REPORTING-STANDARD.md) files were also pre-existing untracked workspace files at baseline. Their authority is as stated in their content; they are not committed in the captured HEAD. The new permanent requirement was appended to the former, and execution/reporting references were added to the latter without replacing either file.

### Existing claim-verifier status

Inspection of the pre-existing [verifier.py](../tools/claim-verifier/verifier.py) found it is not a qualified verifier: `ROOT` is hard-coded to this workspace, `check_roadmap()` only checks for a file longer than 50 characters, `check_evidence()` unconditionally returns `true`, and running the script writes under the existing `tools/claim-verifier/data/` outputs. The prior adversarial output claims only a basic roadmap check. I did not run or overwrite it. The new task verifier is a separate, deterministic addition; it does not retroactively qualify the legacy script or its historical reports.

The installed Kilo extension metadata reports version 7.8.8. No Kilo CLI binary is installed, and the extension package metadata contains no ACP declaration. No local OpenHands/Agent Canvas integration was found. Official Kilo CLI documentation currently documents `kilo acp` and `kilo run`; that is documentation evidence only. ACP behavior and the reported stalled prompt risk remain UNVERIFIED for this installation.

## 4. Architecture Findings

### Existing project seams

The repository already has provider-neutral TTS contracts/adapters and provider registries, but no engineering-agent registry or canonical engineering task contract. The project `AITextService` has a fixed provider preset map; it is an application content-generation service, not an engineering-agent runtime. `.kilo/agents/data.md` is a local Kilo agent instruction file, not a platform task ledger. No Agent Canvas or ACP orchestration integration exists in the repository.

The current canonical roadmap remains the source of planning. The new work does not make a second roadmap or task database.

### Layer separation implemented

- **Engineering task/dispatch core:** [engineering-agent-runtime.js](../utils/engineering-agent-runtime.js) contains versioned task, provider manifest, request, result, registry, explicit configured registration, capability checks, and provider-neutral checkpoints. It has no Kilo-specific strings or import.
- **Agent runtime provider:** [kilo-cli.js](../utils/engineering-agent-providers/kilo-cli.js) contains the only Kilo launch arguments, availability check, managed-credential expectations, environment allowlist, timeout/cancellation, and log redaction. It uses documented headless `kilo run`, never appends `--auto`, and advertises no workspace-isolation capability.
- **Model provider:** the task has a separate optional `modelProvider` field. A provider-managed model can be declared without copying provider credentials; an explicit model ID is routed only when given. No model vendor is selected or contacted in this task.
- **Execution backend:** the task describes a backend ID and the request a workspace ID/path. The adapter receives that selected workspace. A general sandbox/backend registry is **not** implemented; a local child process still has user-level filesystem permissions.
- **Independent verification:** [engineering-task-verifier.js](../tools/claim-verifier/engineering-task-verifier.js) is outside the provider adapter. It runs only commands named in each criterion and allowlisted by the canonical task, uses `execFile` with shell disabled and bounded timeout/output, records observed exit code and SHA-256 evidence references, and never accepts a provider-supplied PASS. Human criteria remain BLOCKED rather than being machine-accepted.

### Explicit routing and capabilities

[engineering-agents.example.json](../config/engineering-agents.example.json) is non-secret example configuration. Kilo is disabled there by default; task requests must explicitly name a provider. Unknown, disabled, absent, incompatible, or unavailable providers fail rather than falling back. A task requiring `workspaceIsolation` is rejected for the current Kilo adapter. Kilo child processes receive a reduced environment allowlist (not arbitrary environment variables) and common credential-shaped log values are redacted. `HOME` is still present for CLI-managed authentication and filesystem access is still unsandboxed; these controls do **not** make host execution safe.

## 5. Candidate/Protocol and License Findings

Kilo's official CLI reference documents a dedicated `kilo acp` command and headless `kilo run`; ACP itself standardizes JSON-RPC initialization/capability negotiation, sessions, prompt updates, and cancellation. The project selected a dedicated documented CLI adapter for the small initial implementation; it did not invent an ACP bridge or claim ACP success. The current installed IDE extension is not treated as an ACP server.

OpenHands Agent Canvas was not installed or locally integrated. Its official project README describes Agent Canvas as an open-source control center, lists ACP-compatible agents and other built-in runtimes, documents Node.js 24+/uv for local launch, and distinguishes unsandboxed host execution from Docker-backed conversation sandboxes. The GitHub repository page identifies the OpenHands/OpenHands repository as MIT-licensed. These are documentation/source-page findings only; no exact source checkout revision, installation, runtime, sandbox, or orchestration flow was executed here. Agent Canvas is therefore still only a candidate control plane, not a project dependency. No licence decision or adoption is made.

Sources inspected:

- [Kilo CLI command reference](https://kilo.ai/docs/code-with-ai/platforms/cli-reference) — ACP and headless commands (documented, not executed).
- [Kilo CLI documentation](https://kilo.ai/docs/cli) — current CLI usage/version scope (documented, not executed).
- [ACP initialization](https://agentclientprotocol.com/protocol/initialization), [session setup](https://agentclientprotocol.com/protocol/session-setup), [prompt/cancellation](https://agentclientprotocol.com/protocol/prompt-turn), and [transport](https://agentclientprotocol.com/protocol/transports) — protocol semantics (source documentation, not runtime evidence).
- [OpenHands repository](https://github.com/OpenHands/OpenHands) and [official documentation](https://docs.openhands.dev/) — candidate architecture and licensing context only; no checkout/runtime qualification.

## 6. Implementation and Change Register

| File | Change |
|---|---|
| [engineering-agent-runtime.js](../utils/engineering-agent-runtime.js) | New provider-neutral contracts, registry, configured registration, dispatch validation, capability negotiation, result normalization and checkpoint transfer |
| [kilo-cli.js](../utils/engineering-agent-providers/kilo-cli.js) | New isolated optional Kilo CLI adapter; bounded execution, explicit opt-in for unsandboxed execution, no auto-approval, environment filtering, log redaction |
| [engineering-task-verifier.js](../tools/claim-verifier/engineering-task-verifier.js) | New independent verifier executing authorized criteria and recording status/output hashes |
| [engineering-agent-provider.test.js](../tests/engineering-agent-provider.test.js) | New deterministic qualification for provider routing, removal, capability mismatch, checkpoint transfer, security and negative acceptance |
| [test.js](../test.js) | Adds one system-test entry that runs the new qualification suite |
| [engineering-agents.example.json](../config/engineering-agents.example.json) | New disabled-by-default Kilo example; no credentials |
| [CONTEXT-GOVERNANCE.md](CONTEXT-GOVERNANCE.md) | Adds permanent provider-agnostic architecture requirement and references |
| [ENGINEERING-AGENT-OPERATING-MODEL.md](ENGINEERING-AGENT-OPERATING-MODEL.md) | New short execution reference to canonical governance, task, checkpoint, dispatch and evidence flow |
| [ENGINEERING-REPORTING-STANDARD.md](ENGINEERING-REPORTING-STANDARD.md) | References provider-neutral governance and report identity/verification separation |
| [claim-verifier README](../tools/claim-verifier/README.md) | Documents the independent engineering-task verifier and clearly marks the old Python script as an unqualified placeholder |
| [B9.47 result record](../data/b9_47/evidence/PROVIDER-PORTABILITY-RESULTS.json) | New execution results, initial baseline/resource snapshot, not-run explanations, and artifact hashes |

No package was installed and no package lock was intentionally edited. The pre-existing `package-lock.json` modification remains untouched.

## 7. Verification Results

| Command | Exit | Observed result | Scope |
|---|---:|---|---|
| `node tests/engineering-agent-provider.test.js` | 0 | 8/8 groups passed | deterministic provider-neutral tests; Kilo process is a stub, alternate is a fixture |
| `node --check` on runtime, Kilo adapter, verifier, qualification file and `test.js` | 0 | all syntax checks passed | syntax only |
| `npx eslint` on the five changed JS source/test files | 0 | no diagnostics | targeted lint |
| Invoke `SystemTest.testEngineeringAgentProviderRuntime()` directly | 0 | `SystemTest integration: passed` | test-runner wiring only |
| `git diff --check` | 0 | no whitespace errors | tracked diff check |
| Editor diagnostics on changed JS files | — | no errors reported | VS Code/Pylance/editor state |

The eight qualification groups include the required A–H portability cases. The negative verifier command actually exited **7**, and the independently derived result was `fail` even though the adapter result said `succeeded`. Positive verifier subprocesses exited 0. The tests also check that task specs contain no provider-native session ID, governance references resolve, the core contains no Kilo string, the Kilo example is disabled, and environment/log credential sentinels are not leaked.

## 8. Not Run / Failures / Limitations

- **No `npm test` / full `SystemTest.runAllTests()`:** existing `testDatabase()` writes `test_key` into the project's SQLite DB, so a full run would mutate project data. The new suite was instead run directly and through its isolated `SystemTest` method. This is a deliberate scope block, not a passing full-suite claim.
- **No Kilo live ACP or prompt:** CLI missing; no installation, account credential, authorized model selection, or runtime test. The extension metadata does not expose ACP. Live integration is **UNVERIFIED/BLOCKED**.
- **No external alternate provider:** alternate is a deterministic test adapter. It demonstrates internal interface independence only.
- **No OpenHands installation or runtime:** no exact candidate revision was checked out or executed. Documentation claims are not capability qualification.
- **No secure sandbox backend:** Kilo's adapter is host-process execution, has no isolation capability, is disabled in example configuration and refuses tasks requiring isolation. The operator opt-in for other explicitly authorized tasks is not a sandbox guarantee. `HOME` remains available to permit the CLI's own auth storage; filesystem isolation and credential-storage access require a future sandbox/backend solution.
- **Not a complete control plane:** there is no durable engineering-task scheduler, status database, retry policy, workspace provisioner, policy engine, evidence archive service, or native resumability layer. The contract/checkpoint primitives define the boundary but do not create those services.
- **Legacy verifier remains unqualified:** its placeholder implementation and old outputs were preserved. The new verifier is separate; it has not been integrated with the legacy Python CLI or its output formats.
- **Full provider model/cost equivalence and resource benchmarking:** not measured; no model calls were made.

No failure required rollback. During development, a verifier assertion and a misplaced line were caught by execution/lint and corrected; the final targeted test/lint results above passed.

## 9. Security, Resource, Cost, and Operational Review

At inspection: 4 CPU cores, 15 GiB RAM with approximately 3.5 GiB available, 511 MiB swap reported fully used, 63 GiB root disk free; Docker daemon responded, version 29.8.1. Node was v24.20.0 and npm v11.19.0. No workload was started other than lightweight Node test subprocesses. No container, model, inference, video render, GPU, or remote job was started.

No new paid service, account, dependency, or model call was used. The deterministic fixture's runtime cost was negligible but no benchmark was recorded. A host-process coding agent can access more than its selected workspace, so it is unsafe for production until a sandboxed execution backend is independently qualified. Registry permission boundaries and environment filtering are not a substitute for OS isolation.

## 10. Permanent Governance Integration

[Context Governance §20](CONTEXT-GOVERNANCE.md#20-provider-agnostic-engineering-orchestration) now states the requested permanent rule verbatim in substance: KiloCode is one replaceable provider; no canonical contract, roadmap, task, verifier, evidence format, or orchestration rule may depend on Kilo-specific behavior outside a documented adapter; provider changes must not require rewriting authoritative task state or verification. The [operating model](ENGINEERING-AGENT-OPERATING-MODEL.md) and reporting standard link to it. The test suite checks the key policy text and local links.

These are documentation requirements plus targeted regression tests, not a universal static governance linter. The test does enforce that the new orchestration core has no Kilo-specific reference and that the sample configuration keeps Kilo disabled. Do not generalize those checks to all repository files.

## 11. Acceptance Matrix

| Requirement | Status | Evidence |
|---|---|---|
| Provider-neutral task, manifest, request, result, checkpoint contracts | PASS — implemented/unit-tested | runtime module and test suite |
| Configurable registry; explicit provider routing; no silent fallback | PASS — unit-tested | registry tests |
| Kilo-specific behavior isolated | PASS — unit-tested | separate Kilo module; core contains no Kilo string |
| Alternate-provider registration and same schema | PASS — test-provider only | `alternate-fixture`; no live provider claim |
| Kilo removal leaves core/verifier usable | PASS — registry-removal test | `withoutKilo` registry + independent verifier |
| Capability mismatch blocks dispatch | PASS — unit-tested | required workspace isolation rejected |
| Checkpoint transfer across providers | PASS — fixture-tested | exact task match + checkpoint passed to alternate adapter |
| Independent acceptance / negative case | PASS — deterministic subprocess test | exit 0/7 and derived fail despite agent success |
| Human acceptance stays separate | PASS — unit-tested | human criterion yields blocked/fail |
| Live Kilo ACP integration | BLOCKED/UNVERIFIED | CLI absent; no paid or unapproved runtime |
| Safe isolated production execution backend | NOT IMPLEMENTED | no sandboxed backend was installed/qualified |
| OpenHands/Agent Canvas adoption | DEFERRED | no runtime/revision execution; not adopted |
| Permanent provider-neutral policy | PASS — governance integrated | canonical policy, operation/report references, link tests |

## 12. Final Repository and Preservation Check

Final HEAD remains `e26792ae00dc1ec2434faf32632896609396dfad`; branch remains `master`, still behind upstream by three commits. Before report/evidence creation, status showed 3 modified tracked files (the original two user changes plus this task's `test.js`) and 232 untracked files (the original 226 plus six new implementation/config/test files). The final count additionally includes this report and evidence record. The original `package-lock.json` and `utils/scene-repair-service.js` changes remain present; no user file was reset or deleted. Existing data and verifier output directories were not written by the test. No stage, commit, reset, clean, checkout, or stash was performed.

## 13. Final Engineering Decision

**PARTIALLY ADOPT** the provider-neutral task/registry/checkpoint/verifier boundary as the implementation foundation. The deterministic tests demonstrate internal provider replacement, explicit routing, capability failure, and verification independence. They do not establish live Kilo/ACP compatibility, safe multi-agent execution, OpenHands value, or a production control plane. Kilo remains an optional provider adapter, disabled by default in example configuration—not a foundation or required runtime.

Do not migrate the project to Agent Canvas, run Kilo against the production tree, or enable unsandboxed agent execution based on this report alone.

## 14. Exact Next Authorized Action

Run a **separate bounded qualification** in a fresh disposable Git repository after an operator explicitly supplies an already-installed, already-authorized Kilo CLI and approves a no-paid-call backend. First validate `kilo --version` and `kilo acp --help` without starting a model; then use a documented protocol smoke test only if its transport contract is explicit. For any coding prompt, require a sandboxed per-task workspace, a strict timeout, and a known no-cost/authorized model path. Keep that task separate from the legacy database and production repository. Until those prerequisites exist, keep the Kilo adapter disabled and continue using the canonical repository roadmap and existing deterministic tests.

## 15. Reproduction and Review Guide

- Run the isolated architecture tests with `node tests/engineering-agent-provider.test.js`.
- Run the JavaScript syntax and lint commands listed in §7.
- Review provider contract/dispatch in [engineering-agent-runtime.js](../utils/engineering-agent-runtime.js), provider mechanics in [kilo-cli.js](../utils/engineering-agent-providers/kilo-cli.js), and independent acceptance in [engineering-task-verifier.js](../tools/claim-verifier/engineering-task-verifier.js).
- Review the initial/final state, command outcomes, limitations, and SHA-256 inventory in [PROVIDER-PORTABILITY-RESULTS.json](../data/b9_47/evidence/PROVIDER-PORTABILITY-RESULTS.json).
- Avoid the full `npm test` until its project-DB mutation behavior is made safe for a disposable DB; do not run the legacy claim-verifier script as qualification evidence.
