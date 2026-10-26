# D1 / D3 Contract-Reference Reconciliation

**Date:** 2026-10-19 · **Scope:** Deliverable **D1 (Candidate matrix)** and **D3 (Architecture/contract map)** of `video_platform_roadmap.md` §Stage 2 → Deliverables (line 295).
**Authority:** `video_platform_roadmap.md` §Stage 2 (Objective / Entry / Scope / Non-goals / Dependencies / Tasks 1–5 / Deliverables / Required tests / Required evidence / Acceptance criteria / Exit gate).
**Method:** reference-only reconciliation against the canonical roadmap definitions. **No roadmap text, no acceptance criterion, and no stage status was rewritten.** The only repository edit is a one-line pointer added to `STAGE2_CANDIDATE_SUMMARY.md` (see §4).

---

## 1. Canonical definition of D1 and D3

`video_platform_roadmap.md` line 295 defines the Stage 2 deliverable set verbatim:

> Candidate matrix; exact revisions and licence findings; architecture/contract map; resource and maintenance assessment; executed test evidence where applicable; explicit adoption decision and reuse list.

The roadmap does **not** number the deliverables D1–D6. The D1/D3/D2/D4/D5/D6 identifiers used across the Stage 2 artefacts are **local shorthand from the residual-gap matrix** (`/tmp/agenttube_stage2_residual_audit_20261019_232329/STAGE2-RESIDUAL-GAP-MATRIX.md`), which mapped the six canonical deliverable phrases to short IDs:

| ID (local shorthand) | Canonical deliverable phrase (roadmap line 295) | Canonical source artefact |
|---|---|---|
| **D1** | Candidate matrix | `STAGE2_CANDIDATE_SUMMARY.md` (+ `STAGE2_EDITOR_CANDIDATES.md`) |
| **D2** | Exact revisions and licence findings | `STAGE2_ADOPTION_DECISION.md` + `DEPENDENCY-LICENSE-SECURITY-MEMO.md` |
| **D3** | Architecture/contract map | `utils/renderers/motion-canvas-adapter.js` + `MAINTENANCE-AND-CONTRACT-FIT.md` §D |
| **D4** | Resource and maintenance assessment | `MAINTENANCE-AND-CONTRACT-FIT.md` §B/§C + `DEPENDENCY-LICENSE-SECURITY-MEMO.md` §5 |
| **D5** | Executed test evidence where applicable | `MOTION-CANVAS-OUTPUT-CONTROL-VALIDATION.md` + retained artifacts |
| **D6** | Explicit adoption decision and reuse list | `STAGE2_ADOPTION_DECISION.md` |

**Important scoping note:** because D1/D3 are **local shorthand**, not canonical roadmap identifiers, the reconciliation target is not "make the roadmap say D1/D3". It is: *make the canonical deliverable phrases — "Candidate matrix" and "architecture/contract map" — unambiguously resolvable to the current, evidence-backed artefacts*, so that a reader of the roadmap can find the Stage 2 evidence without an intermediary. That is precisely what the residual gap matrix described as D1 "canonical matrix not rewritten" and D3 "mapping memo unmerged".

## 2. D1 — Candidate matrix: reconciliation status

### 2.1 Current state

`STAGE2_CANDIDATE_SUMMARY.md` (11 lines) lists five candidates — Kdenlive/MLT, OpenChatCut, OpenCut, MoneyPrinterTurbo, Motion Canvas — but it is a **pre-evaluation narrative**, not a matrix. It predates the owner decision: it still says "investigation continuing; no adoption/install without clear evidence", which is now stale against the recorded owner decision of 2026-10-19.

The actual candidate dispositions live in `STAGE2_ADOPTION_DECISION.md` (Motion Canvas = ACCEPTED PARTIAL_ADOPT; all others DEFERRED) and in the residual-gap matrix (OpenMontage = AGPLv3 reference-only partial assessment).

### 2.2 What was reconciled

A **reference pointer** was added to `STAGE2_CANDIDATE_SUMMARY.md` directing the reader to the canonical decision and to this reconciliation, so that the candidate set, the dispositions, and the evidence are all resolvable from one place. **No candidate was added, removed, re-ranked, or re-dispositioned**, and no stale claim was silently deleted — the outdated "investigation continuing" sentence is explicitly marked as superseded rather than removed, preserving the historical record.

### 2.3 D1 status

**PARTIAL → RESOLVED-AS-REFERENCE.** The candidate matrix is now *resolvable* and its dispositions are unambiguous. It is **not** a rewritten canonical per-candidate evaluation matrix with per-candidate licence/evidence columns for all five candidates — the Deep-OSS candidates (Kdenlive, OpenChatCut, OpenCut, MoneyPrinterTurbo, OpenMontage) were assessed in earlier missions and their per-candidate detail lives in `STAGE2_EDITOR_CANDIDATES.md` and `docs/AGENTTUBE-DEEP-OSS-ARCHITECTURE-RESEARCH-AND-ADOPTION-REPORT.md`. Rewriting a consolidated matrix for all five candidates is **post-Stage-2 scope** and was not authorized.


## 3. D3 — Architecture/contract map: reconciliation status

### 3.1 The canonical map, now written

The map was previously only a memo-level artefact in `/tmp` (unmerged, so not durable). The **actual contracts are in the repository** and were read directly. The authoritative D3 map:

| Layer | Canonical artefact | Contract it defines | Verified content |
|---|---|---|---|
| Scene contract | `utils/scene-contract.js` | `SUPPORTED_VISUAL_TYPES` (Set of allowed `visual.type` values); rejects unsupported/malformed payloads | `scene-contract.js:37,389-391` — rejects any `visual.type` not in the set |
| Layout contract | `utils/layout-engine.js` | `CANONICAL_CANVAS = Object.freeze({width:1920, height:1080})`; per-scene element layout reports | `layout-engine.js:20,32,457` |
| Backend contract | `utils/renderers/backend-contract.js` | `BACKEND_MODES`, `DISABLED`/`RENDER` mode resolution, `resolveBackendMode(env.MOTION_CANVAS_BACKEND)` | 47 lines; mode resolution + error factories |
| Renderer adapter | `utils/renderers/motion-canvas-adapter.js` | `MotionCanvasAdapter`: `validateInput()` → `buildEnginePlan()` → `renderScene()` | 226 lines; fail-closed at every stage |
| Engine plan | same, `ENGINE_PLAN_VERSION` | Deterministic plan: `planSha256` = SHA-256 over `stableStringify(plan)`; `fps` default 30; `canvas` = CANONICAL_CANVAS | `motion-canvas-adapter.js:201,140,188-196` |
| Assembly | same, `plan.assembly` | `engine: 'ffmpeg-qualified-pipeline'` — final assembly, audio integration, encoding stay with FFmpeg | `motion-canvas-adapter.js:193-197` |

**Verified contract invariants (read from source in this mission):**

1. **Fail-closed input validation.** `validateInput()` emits a `critical` finding and refuses the plan when: the visual type is unsupported (`ADAPTER_UNSUPPORTED_PAYLOAD`), the layout report is missing/empty (`ADAPTER_LAYOUT_MISSING`), the layout has no box/connector geometry (`ADAPTER_SCENE_HAS_NO_VISUAL_CONTENT`), a debug element is present (`ADAPTER_DEBUG_ELEMENT_PRESENT`), or a CTA end card is missing a required element role (`ADAPTER_CTA_ELEMENT_MISSING`).

### 3.2 Reconciliation discrepancy found (recorded, NOT changed)

`motion-canvas-adapter.js:60` declares:

```js
this.engineRevision = '7b91435c301d530351dcf5ebb91dd139c002e405'; // cloned reference lab revision
this.engineVersion = '3.17.2';
```

GitHub API confirms that commit `7b91435c30` **is** `motion-canvas/motion-canvas` `main` HEAD — dated **2026-07-02**, "refactor(docs): update domain (#1231)" — i.e. it is a **docs-only commit made ~20 months after** the v3.17.2 release.

The actual **v3.17.2 tag commit is `e735a995aa738ca682feb4204a39ee7db7b5d279`** (tag object `6c43eaec8a1c080c02f23815db557cbd13a57380` → commit `e735a995aa…`, published 2024-12-14).

**So the adapter pairs `engineVersion: '3.17.2'` with a revision that is *not* the v3.17.2 tag commit.** The two identifiers refer to different points in upstream history. The comment "*cloned reference lab revision*" indicates this was deliberate (the adapter was written against a clone checked out at upstream `main`, not at the release tag), so it is **not necessarily a defect** — but it is an **ambiguity in the evidence chain**: the plan's `engineRevision` does not identify the upstream source that corresponds to the pinned `engineVersion` and the npm artefact actually installed (`@motion-canvas/*@3.17.2` tarballs, `dist.integrity` per the licence memo).

**Decision: NOT changed in this mission.** Correcting it is a code change to a fail-closed renderer adapter, which is outside the authorized reference-only scope of this closure, and it would alter `planSha256` for every plan. It is recorded here as a **D3 residual with a concrete proposed correction** (set `engineRevision` to `e735a995aa738ca682feb4204a39ee7db7b5d279`, the v3.17.2 tag commit, or rename the field to `referenceLabRevision` to make the distinction explicit) for owner disposition.

### 3.3 D3 status

**PARTIAL → RESOLVED-AS-REFERENCE.** The architecture/contract map now exists as a durable, repository-grounded document (this file) rather than an unmerged `/tmp` memo, and it is referenced from the canonical decision trail. The `engineRevision` ambiguity remains an open residual.

## 4. Exact repository diff applied (reference-only)

One file was edited. `STAGE2_CANDIDATE_SUMMARY.md` — two added pointer lines (one appended block). No file was deleted, renamed, or rewritten; no roadmap file was touched; no code was touched.

**Before (final line of the file):**
```
Status: investigation continuing; no adoption/install without clear evidence. Proof of value requires actual rendered output with inspection.
```

**After (appended):**
```
Status: investigation continuing; no adoption/install without clear evidence. Proof of value requires actual rendered output with inspection.

## SUPERSEDED 2026-10-19 — reference-only reconciliation
The "Status: investigation continuing" line above is superseded by the owner adoption decision of 2026-10-19 (ACCEPT PARTIAL_ADOPT, Motion Canvas 3.17.2, bounded scope). It is retained above as the historical record, not deleted.
Canonical candidate dispositions: STAGE2_ADOPTION_DECISION.md (Motion Canvas = ACCEPT PARTIAL_ADOPT; all other candidates DEFERRED).
D1 "Candidate matrix" and D3 "architecture/contract map" reference reconciliation: D1-D3-CONTRACT-REFERENCE-RECONCILIATION.md.
```

**Why this is the minimum sufficient edit.** The gap was *resolvability*, not correctness of content: the roadmap's "Candidate matrix" phrase resolved to a stale narrative that contradicted the recorded decision. A single pointer block restores consistency, preserves the superseded statement for audit, and touches nothing else.

**Explicitly NOT done:** the roadmap file `video_platform_roadmap.md` was **not** edited (its Stage 2 deliverable line, acceptance criteria, and current-state paragraph are unchanged); `STAGE2_ADOPTION_DECISION.md` and `STAGE2_STAGE_STATE.md` were **not** edited by this reconciliation (their earlier edits from the prior mission are preserved as-is); no code, manifest, lockfile, or CI file was touched.

## 5. Reconciliation outcome summary

| Deliverable | Canonical phrase | Before | After | Residual |
|---|---|---|---|---|
| D1 | Candidate matrix | PARTIAL (stale narrative, dispositions elsewhere) | RESOLVED-AS-REFERENCE (pointer to canonical decision + this doc) | Per-candidate consolidated matrix for all 5 candidates = post-Stage-2 scope |
| D3 | Architecture/contract map | PARTIAL (unmerged `/tmp` memo) | RESOLVED-AS-REFERENCE (durable repository-grounded map, invariants verified against source) | `engineRevision` ≠ v3.17.2 tag commit — code change deferred to owner |

**Stage status is unchanged by this reconciliation.** Stage 2 remains `PARTIAL_WITH_EVIDENCE` (`STAGE2_STAGE_STATE.md`). Nothing here converts a PARTIAL into a PASS, and the false-completion guards recorded in the residual-gap matrix remain in force: *PARTIAL_ADOPT ≠ PRODUCTION_QUALIFIED / RENDERER_ACTIVE; ACCEPTED decision ≠ Stage 2 COMPLETE; PARTIAL_WITH_EVIDENCE ≠ Stage 1 QUALIFIED.*

2. **Deterministic plan.** Identical inputs → identical `planSha256`. Scenes are sorted by `startFrame`. `revealAtFrame: 0` on every node.
3. **Explicit assembly separation.** Caption burn and final encoding are `false` in the adapter capability map — they are assembly-phase concerns owned by FFmpeg, not by the renderer.
4. **Render path is not enabled.** `renderScene()` throws unless `mode === RENDER` **and** a matching authorization token **and** `renderImplementationEnabled === true`. `renderImplementationEnabled` is hard-coded `false` with the comment *"No production code path sets this true during B9.38."* The adapter therefore cannot render in production today. **This mission did not change that.**
5. **Plan fps is 30, not 24.** `buildEnginePlan(..., {fps = 30})`. Note the interaction with the Motion Canvas default of **60** established in `MOTION-CANVAS-OUTPUT-CONTROL-VALIDATION.md` §2 — the AgentTube plan's 30 fps is a *plan-side* value that must be explicitly pushed into the Motion Canvas render settings; otherwise the renderer silently uses 60.
