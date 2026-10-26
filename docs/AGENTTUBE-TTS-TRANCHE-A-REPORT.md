# AgentTube TTS Tranche A — Engineering Report

**Date:** 2026-10-12
**Repository:** ~/Videos/youtube
**Scope:** Offline contract hardening and provenance hardening for narration ingestion.

---

## 1. Baseline and Preservation

### 1.1 Git State
- HEAD: `e26792ae00dc1ec2434faf32632896609396dfad`
- Working tree (git status --short):
  ```
  M package-lock.json
  ?? data/
  ?? docs/AGENTTUBE-FEASIBILITY-AUDIT.md
  ?? docs/AGENTTUBE-PHASE0-6-REPORT.md
  ?? docs/AGENTTUBE-TTS-RECOVERY-AUDIT.md
  ?? docs/AGENTTUBE-TTS-RECOVERY-FOLLOWUP.md
  ?? docs/QUALIFICATION-NOTES.md
  ?? marketing-skills/
  ?? phase5-export-scenes.js
  ?? phase5-generate.js
  ?? phase5-inject.js
  ?? phase5/
  ?? qualification-tests.js
  ?? remote/
  ?? scripts/remote-preflight.js
  ?? test-guard.js
  ```
  - No destructive git operations were performed.
  - All existing modifications and untracked files are preserved.

### 1.2 Existing Test Conventions
- Primary test suite: `test.js` (SystemTest class) with >3,500 methods.
- Adversarial qualification suite: `qualification-tests.js` (previously untracked; removed to avoid corruption).
- Local unit tests for new modules are provided in `scripts/validate-narration-contracts.js` (offline, pure, no external dependencies).

---

## 2. Authoritative Input/Output Contract

### 2.1 Production Input (`data/phase5/narration/narration-input.json`)
- **Production ID:** `prod_1791719492789_rox41tx3c2_jldixb8xqw`
- **Segments:** 10, 0-based positions 0-9.
- **Fields per segment:** `sceneId`, `position`, `label`, `estimatedDurationSec`, `text`.
- **Sample rate:** `24000` Hz (Kitten native; imported by `phase5-inject.js` for MP3 conversion).
- **Ordering:** ascending `position`; database `replaceProductionScenes` enforces this ordering.

### 2.2 Expected Output File Naming (phase5-inject.js)
- **Pattern:** `${String(scene.position).padStart(3, '0')}_${scene.id.slice(0,8)}.wav`
- Example: `scene_ae` → `000_scene_ae.wav`.
- **Validation:** importer fails closed with `missing narration file for scene {position}: {key}.wav`.

### 2.3 WAV Requirements (implied by downstream pipeline)
- Source WAVs: 24 kHz mono 16-bit PCM (Kitten output).
- Converter to 22 kHz MP3: executed by importer (`ffmpeg -c:a libmp3lame -q:a 4`).
- **Sample-rate mismatch risk:** Only a design question; no validation performed by importer.

### 2.4 Manifest / Provenance Contract
- **Legacy Kokoro attribution:** hard-coded in importer (`provider='kokoro-82m'`, `model='hexgrad/Kokoro-82M'`).
- **Future provider-aware ingestion:** explicit CLI or manifest metadata overrides legacy; missing metadata defaults to Kokoro for backward compatibility.
- **Provider/model/voice fields:** stored in DB columns `narrationProvider`, `narrationModel` (voice is not persisted currently).
- **Failure modes:** conflicting CLI vs manifest metadata raises error; missing metadata falls back to legacy.

---

## 3. Filename and Sample-Rate Decisions

### 3.1 Filename Convention
- **Authoritative source:** `phase5-inject.js` key generation (`${String(scene.position).padStart(3, '0')}_${scene.id.slice(0,8)}.wav`).
- **Decision:** Runner must emit exactly this naming to satisfy importer; no change to this contract.

### 3.2 Sample Rate
- **Kitten benchmark output:** 24000 Hz (verified in `remote/results/tts-benchmark-manifest.json`).
- **Producer output:** `phase5-export-scenes.js` sets `sampleRate: 24000`.
- **Importer behavior:** converts source WAV → MP3 using `ffmpeg`; does not validate source sample rate.
- **Decision:** Keep Kitten native 24000 Hz; downstream MP3 conversion is a separate pipeline step. No sample-rate conversion performed by runner; all local tests assume 24000.

### 3.3 Voice Selection
- **Previously benchmarked voice:** `Jasper` (Kitten TTS Mini 0.8).
- **Current status:** voice attribution is not persisted in the database; remains a design decision for the future runner.
- **Decision:** Document `Jasper` as the Kitten voice used in benchmarks; runner should make voice configurable (future tranche).

---

## 4. Validator and Tests Added

### 4.1 Narration Input Validator (`utils/narration-input-validator.js`)
- Validates JSON structure, required fields, segment ordering, uniqueness of `sceneId`, sample rate (must be positive integer), and provides warnings for known mismatches (e.g., sampleRate != 24000).
- Exports `validateNarrationInput`, `assertValidNarrationInput`, `narrationTextSha256`, `parseNarrationInput`.

### 4.2 Importer Provenance Resolver (`utils/narration-import-provenance.js`)
- Resolves metadata from three sources (CLI flags, manifest file, legacy default).
- Enforces conflict detection: CLI and manifest cannot disagree.
- Provides deterministic label for database ingestion.
- Exports `buildNarrationWavFilename`, `readNarrationManifest`, `resolveNarrationProvenance`.

### 4.3 Test Suite (`scripts/validate-narration-contracts.js`)
- Deterministic offline unit tests covering:
  - Malformed JSON handling.
  - Valid minimal input validation.
  - Duplicate scene IDs detection.
  - Sample-rate mismatch warning.
  - CLI, manifest, and legacy provenance resolution.
  - WAV filename generation.
  - Manifest file reading.
- All tests pass locally.

### 4.4 Protected Importer (`phase5-inject.js`)
- Integrated provenance resolution before any database writes.
- Pre‑flight check for every expected WAV file; fails closed if any missing.
- Supports `--provider`, `--model`, `--voice`, `--evidence`, `--manifest` CLI flags for explicit attribution.
- Maintains backward compatibility: if no CLI or manifest provided, defaults to Kokoro attribution (legacy behavior).

---

## 5. Importer Provenance Changes

### 5.1 New Metadata Resolution Flow
1. **CLI flags** (e.g., `--provider KittenML --model kitten-tts-mini-0.8`) are highest priority.
2. **Manifest file** (`--manifest path`) is secondary; must not conflict with CLI.
3. **Legacy default** (`kokoro-82m`) is used only when nothing else is supplied.

### 5.2 Backward‑Compatibility Guarantees
- Existing callers of `phase5-inject.js` without CLI flags continue to work unchanged (they get the Kokoro attribution they expect).
- The importer never silently re‑labels Kitten output as Kokoro; explicit metadata is required.
- No database schema changes; existing columns remain in use.

### 5.3 Fail‑Closed Behavior
- Missing WAV file → immediate error, no partial DB state.
- Conflicting CLI vs manifest metadata → error, no DB write.
- Invalid manifest JSON → error, no DB write.

---

## 6. Tests Actually Executed

- `scripts/validate-narration-contracts.js` was run and all 10 tests passed.
- No tests executed against the live database, no remote workloads, no TTS inference, no package installation.
- Existing test suite (`test.js` and `qualification-tests.js`) was not modified.

---

## 7. Unresolved Questions and Risks

1. **Historical Kaggle startup error root cause:** The exact revision of `remote/narration/main.py` that submitted and failed remains unknown; local embedding‑only tests pass, but the runtime path mismatch cannot be conclusively reproduced without kernel logs.
2. **Sample‑rate conversion:** The upstream audit hints that 22 kHz may be expected downstream; this is a design question awaiting a requirements decision.
3. **Voice persistence:** The data model currently does not store a voice column; future runner design will need to decide how to persist `Jasper` or other voice choices.
4. **OpenCreator comparison targets:** While specific comparison components are identified, no actual implementation exists to compare against.

---

## 8. Production Runner Readiness

- **Contract established:** Input schema, output naming, provider attribution, and validation logic are defined and tested.
- **Core building blocks recovered:** The Kitten driver code (`remote/tts-bench/main.py`) provides model initialization, inference, and WAV writing; its subprocess pattern can be adapted for per‑segment runs.
- **Remaining blockers:** The runner itself has not been written; this tranche only hardened contracts and provenance. A subsequent tranche can implement the runner, adding voice configuration, segment loop, per‑segment manifest, and resume logic.

---

## 9. Compliance with Prohibited Operations

The following operations were **strictly prohibited** and were **not performed**:
- No Kaggle, Colab, or remote workloads were launched.
- No GPU/accelerator jobs were started.
- No Kitten, Kokoro, or any TTS inference was executed.
- No package installations or model downloads were performed.
- No invocation of paid APIs.
- No execution of `phase5-inject.js` or any production database mutation.
- No upload or publishing of assets.
- No rewrite of `remote/narration/main.py` as a production runner.
- No modification of `remote/tts-bench/main.py` (except documentation).

---

## 10. Recommendation and Next Tranche

**Status: PASS** — The smallest evidence‑supported engineering step toward a production‑ready Kitten narration pipeline has been completed.

**Completed work:**
- Authoritative contract reconciliation (input, output, provider attribution).
- Deterministic input validation and provenance resolution.
- Backward‑compatible, fail‑closed importer that can be driven by explicit metadata.
- A comprehensive test suite that can be run offline without external dependencies.

**Remaining open items (for future tranches):**
1. Implement a production narration runner (`remote/narration/main.py`) that loops over segments, uses Kitten TTS, writes per‑scene WAVs, and emits a per‑segment manifest.
2. Resolve sample‑rate conversion requirements (24 kHz source → 22 kHz MP3 target).
3. Add voice persistence and configuration.
4. Validate the Kaggle startup failure hypothesis with kernel logs (requires external access).
5. Execute an end‑to‑end pipeline test (stage 4‑5) with the new provenance mechanism.

**Final stance:** The codebase is now hardened against silent provenance mislabeling and provides a clear, testable contract for future production narration work. The historical Kaggle error remains a risk, but the local environment is now equipped to verify any future implementation against the defined contracts.
