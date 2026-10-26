# B9.27 — B9.26 closure, roadmap frontier, and the narration import contract repair

**Repository:** `/home/gachiemeshackson/Videos/youtube`
**HEAD before and after:** `e26792a` (unchanged; nothing staged or committed)
**Remote compute:** none used in this tranche. No Colab or Kaggle session was
created; `colab sessions` reports none active.

---

## Phase A — B9.26 closed

The three B9.26 Qwen integration samples are recorded as human-accepted.
Each local WAV was independently re-hashed and matched its remote manifest
before the record was written.

| segment | artifact SHA-256 | text SHA-256 | duration | verdict |
|---|---|---|---|---|
| b9-25-seg-a | `033a4af353181171a2ae1d780dcec43971217c5c1a200de87e7bbc67d40a42d8` | `305fee1e7ea9bdaadc0c1e8639fd7483ecc22c2e26f0dfd9fcf37cf795855e70` | 5.68 s | ACCEPTED |
| b9-25-seg-b | `a2127c1164750be20ac241c2409a504d0c7f11979f6296419c4cf4bb03d4c227` | `dc5ec5903c10b41fcef6d7df90d76ca6bc0fd4372438dd7f243586c7109a8017` | 4.88 s | ACCEPTED |
| b9-25-seg-c | `a2d5a4e67482e470c06bad9c45a4060a4828e95fee407486911be2a151699d43` | `cc3d1e96705f6ecd5c17625e9238e15d2c0dd336ce712e6234a3877a43454016` | 5.52 s | ACCEPTED |

Record: `hosted-runs/b9-26-qwen/HUMAN-REVIEW-RECORD.md` —
`quality_status: HUMAN_ACCEPTED`, `reviewer: user`, `verdict: ACCEPTED`,
rationale “the user listened to the three samples and described them as
‘perfect’”, with the full artifact hash, input-text hash, duration,
sample rate, channels, and UTC timestamp per artifact.

The record keeps the three statuses separate and explicit:

```
generation_status:          SUCCEEDED
technical_validation_status: PASS
quality_status:             HUMAN_ACCEPTED
```

Original WAVs, `manifest.json`, `execution.log` and `HUMAN-REVIEW-INDEX.md`
were not modified. The B9.24/B9.25 Kokoro and B9.19 Qwen reference records are
unchanged.

## Phase B — roadmap frontier (evidence-based)

Authoritative sources inspected:

* `docs/AGENTTUBE-PHASE0-6-REPORT.md` — §13 defects D1–D5, §15 readiness gates
* `docs/AGENTTUBE-TTS-TRANCHE-B6-IMPORT-READINESS-REPORT.md` — import readiness
* `docs/AGENTTUBE-TTS-RECOVERY-FOLLOWUP.md` — §6.1 filename-contract inconsistency
* `CHANGELOG.md`, `package.json` scripts, `npm test` (47/47)
* the import consumer itself: `phase5-inject.js` and `utils/narration-import-provenance.js`

Status matrix:

| Obligation | Authoritative source | Current status | Evidence | Blocker / dependency | Next action |
|---|---|---|---|---|---|
| Narration provider integration (Kokoro + Qwen) | B9.25 / B9.26 | **COMPLETE** | 34/34 contract tests; 6 hosted WAVs; 6 human-accepted | none | closed |
| **D2 — narration import automation-level test** | Phase0-6 §13 D2 | **OPEN — and the path was broken** | see below | none | **DONE in this tranche** |
| Filename contract inconsistency | Recovery-Followup §6.1 / §156 | **RESOLVED by evidence** | `buildNarrationWavFilename` is the only consumer | none | documented here |
| Retry-budget / checkpoint persistence as code | Phase0-6 §34 gap | CLOSED | `GenerationRecoveryService` §35 + B-series tests | none | closed |
| Rights / originality / editorial gates | Phase0-6 §15 | BLOCKED — HUMAN-REVIEW | requires attested rights | **human decision** | stop at boundary |
| YouTube OAuth + channel link | Phase0-6 §12 | OPEN | no credentials | user action | outside this tranche |
| One complete end-to-end narrated explainer | roadmap | NOT STARTED | depends on rights + editorial | blocked upstream | later |

**Key finding.** D2 said the import path was “code-inspection verified;
automation-level test pending”. An automation-level test could not have
passed, because the fail-closed preflight was broken:

`buildNarrationWavFilename()` returns `000_scene_ae.wav` — the filename
**already carries the extension**. The preflight then built
`` `${key}.wav` `` → `000_scene_ae.wav.wav`, so `fs.existsSync` could never
succeed. Every valid narration directory was rejected before the first
database write, which is why the capability stayed “code-inspection
verified” rather than tested. The defect existed at both call sites
(`phase5-inject.js:128` and `:143`).

Reproduced against the real staged batch before the fix:

```
scene 0 key=000_scene_ae.wav
  line-128 path exists (buggy) : false
  correct path exists          : true
```

The §6.1 / §156 “contract inconsistency” is also resolved: the audit report's
`data/phase5/narration/[scene_id].mp3` naming is **not** what any consumer
reads — no code in the repository references that path. The single
authoritative consumer contract is `buildNarrationWavFilename`, i.e.
`${position3}_${sceneId8}.wav`.

## Phase C — the next unblocked obligation, executed

### Changes

| File | Change |
|---|---|
| `phase5-inject.js` | Fixed both call sites to use `key` directly (the extension is already included); error messages updated to match |
| `tests/narration-import-contract.test.js` | **New** — 8 deterministic automation-level contract tests for the import path (D2) |
| `utils/narration-audio-validation.js` | Lint fix: replaced `Float32Array.prototype.isPrototypeOf` with `ArrayBuffer.isView` |
| `tests/checkpoint-identity-integration.test.js` | Lint fix: `no-prototype-builtins` |

The import test suite deliberately reproduces the preflight predicate rather
than executing the importer, so it never touches the production database or
runs `phase5-inject.js`.

### What the new tests prove

1. `buildNarrationWavFilename` returns a filename already ending in `.wav`
2. It rejects invalid scene identity (empty id, negative/non-integer position)
3. The preflight **accepts** a directory satisfying the contract
4. The preflight **still rejects** a missing segment (fail-closed preserved)
5. **Regression guard**: the source must not contain `${key}.wav`
6. The real preserved Kitten batch satisfies the filename *shape*
7. The Kitten batch is still `REJECTED` and can never become eligible
8. A human-accepted Qwen artifact is eligible and records its exact hash

Point 7 is the critical separation: satisfying the filename contract says
nothing about audio quality. The ten `data/phase5/narration/*.mp3` files are
format-only derivatives of rejected Kitten audio and remain ineligible.

### Verification after the fix, against the real batch

```
scenes checked: 10   found: 10   missing: 0
preflight would now PASS
```

### Test results (all real, with exit codes)

| Command | Result | Exit |
|---|---|---|
| `node tests/narration-import-contract.test.js` | 8/8 passed | 0 |
| `node tests/narration-provider-contract.test.js` | 34/34 passed | 0 |
| `node qualification-tests.js` | 5 passed, 0 failed | 0 |
| `npm test` | 47 passed, 0 failed | 0 |
| all 13 files in `tests/` | 13 passing, 0 failing | — |
| `npx eslint .` | 0 errors (22 pre-existing warnings) | 0 |

## Boundaries observed

* No local model inference; no remote compute used in this tranche.
* No production import, `phase5-inject.js` execution, database mutation,
  upload or publishing.
* No destructive Git command; nothing staged or committed; HEAD unchanged at
  `e26792a`.
* No accepted artifact, WAV, manifest or log deleted or overwritten; the
  preserved Kitten batch is intact (10 WAVs).
* The rejected `data/phase5/narration/*.mp3` derivatives were not modified,
  re-converted or moved.

## What remains incomplete or blocked

1. **Rights / originality / editorial gates** (Phase0-6 §15) — BLOCKED on
   human attestation of original/public-domain content rights. Not an
   engineering task; stopping at this boundary per instruction.
2. **YouTube OAuth + channel link** — user action required.
3. **One complete end-to-end narrated explainer** — blocked upstream by the
   rights/editorial gates. This is the next milestone after those clear, and
   per the roadmap ordering it precedes the broad open-source research phase.
4. Actual `phase5-inject.js` execution against the production database
   remains unauthorized; the import path is now *tested at the contract
   level* but has not been run end-to-end with a database, which requires
   explicit import authorization.

## Precise next action, based on repository evidence

Record the human rights/editorial attestations required by Phase0-6 §15, then
produce the first end-to-end narrated explainer: generate the ten-segment
Kokoro or Qwen batch on hosted compute through the now-integrated provider
contract, stage it under the verified `${position3}_${sceneId8}.wav` naming,
and import it under explicit authorization. The D2 contract tests now guard
that path, and the lifecycle guards ensure rejected audio cannot enter it.<tool_call>
<function=filePath>
/home/gachiemeshackson/Videos/youtube/docs/AGENTTUBE-B9-27-REPORT.md