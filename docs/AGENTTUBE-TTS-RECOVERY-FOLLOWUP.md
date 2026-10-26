# AgentTube TTS Recovery — Follow-Up Report

**Date:** 2026-10-12
**Repository:** ~/Videos/youtube
**Status:** Offline investigation only. No remote execution, no TTS inference, no package install.

---

## 1. Preserved Repository State

Git HEAD: `e26792ae00dc1ec2434faf32632896609396dfad`
Working tree preserved as-is per `git status`: untracked files `phase5/`, `qualification-tests.js`, `remote/`, `scripts/remote-preflight.js`, `test-guard.js` and `__pycache__` directories remain untouched. No `git reset`, `git clean`, staging, or destructive operations were run. This report file did not previously exist (`docs/AGENTTUBE-TTS-RECOVERY-FOLLOWUP.md` was absent).

---

## 2. Root-Cause Classification — Corrected

### Directly observed facts (not hypotheses)

- The Kaggle narration kernel `nicholechege/agenttube-narration-cpu-kb-narr-20261011-01` (job `kb-narr-20261011-01`) entered ERROR status, **terminal**. Its recorded note states: *"Failed at startup: input not found at expected Kaggle path; embedded payload fallback did not load in this environment."*
- The kernel `kernel-metadata.json` (`remote/narration/kernel-metadata.json`) declares `kernel_type: script`, `enable_gpu: true`, `enable_internet: true`. Script kernels receive no interactive stdin and run with CWD = `/kaggle/src/` (Kaggle script-kernels default working directory).
- The **currently on-disk** `remote/narration/main.py` (12 lines) is a **non-inferencing stub**. It defines `_INPUT_B64`, decodes the embedded production payload, and sets `_INPUT = json.loads(...)`. It contains **no** reference to any Kaggle path (`/kaggle/...`), no external file reads, no model loading, and no WAV/audio generation. It is **not** the version that submitted and failed.
- A **second** file `remote/narration/main.py.restructured` (43 lines) exists. It contains the input-file resolution logic referencing `/kaggle/input/narration-input.json`, `/kaggle/narration-input.json`, and a fallback to writing `_INPUT_B64` into `./narration-input.json` at startup. This is the file whose structure matches the historical failure signature, but it is **not** what is currently at `main.py`.
- The job ledger (`remote/agenttube-job-ledger.json`) records `inputChecksum: e3bfd83870a1041e4eee2d2e5f4a1dc510e1ce69c1105a61299300ca868cdad6` for both the CPU kitten and the Kokoro GPU failure.
- The embedded payload in both `main.py` and `main.py.restructured` decodes to production ID `prod_1791719492789_rox41tx3c2_jldixb8xqw`, 10 segments, `sampleRate: 24000` — identical to `data/phase5/narration/narration-input.json` and `remote/narration/narration-input.json`.

### Hypotheses supported by circumstantial evidence

1. The failed kernel ran the **restructured** variant (or an equivalent) whose `INPUT_FILE` resolved to a path relative to `.` (CWD = `/kaggle/src/`) or to a `/kaggle/input/...` location that Kaggle's script-kernel container did not populate, because no dataset source was wired in `kernel-metadata.json` (`dataset_sources: []`). The embedded-fallback path (`__file__` guard + `os.path.dirname(os.path.abspath(__file__))`) may not have matched the runtime extraction layout Kaggle uses for script kernels.
2. The local "embedding-only test passes" result (documented previously in `docs/AGENTTUBE-FEASIBILITY-AUDIT.md`) is **insufficient proof** that the Kaggle environment would behave identically: Kaggle script kernels extract the payload to an ephemeral location whose `__file__`/`os.getcwd()` differs from the local filesystem layout, and the embedded fallback may have been shadowed or skipped by an earlier failure in the resolution loop.

### Unsupported claims avoided

- This report does **not** claim that "Kaggle emitted the error" as a component diagnosis. The only directly observed error note is the **job ledger's recorded note**, attributed to the operator's post-mortem, not a Kaggle stack trace.
- The claim that "the historical Kaggle failure was environmental" is **not asserted as proven**. It remains plausible but unconfirmed: the failure mode (path not found) is consistent with a packaging/runtime path mismatch, but no kernel stdout/stderr log was available locally to confirm which branch of the resolver executed last or why the embedded fallback did not load.

### Unresolved questions

- Q1: What exact revision of `main.py` was pushed to the failed kernel (version 4 per ledger)? The local `main.py` (stub) and `main.py.restructured` diverge; the pushed revision is unknown.
- Q2: What was the **last successful line** before failure? Local evidence cannot reproduce this without the kernel log.
- Q3: Did Kaggle's script-kernel extraction place `__file__`/CWD such that `os.path.dirname(os.path.abspath(__file__))` + `os.path.exists("narration-input.json")` returned False, and then the `open(INPUT_FILE,'wb')` write failed silently inside the bare `except`? This cannot be confirmed offline.

---

## 3. Recovered Kitten Implementation Analysis

**Source:** `remote/tts-bench/main.py` (436 lines). Previously completed benchmark (`kb-tts-20261011-01`); results in `remote/results/tts-benchmark-manifest.json`.

### Reusable interfaces and functions

| Function | Purpose | Reusable for production runner? |
|---|---|---|
| `sha256(path)` | File checksum | Yes — identical need. |
| `peak_rss_mb()` | Resident-set size reporting | Yes. |
| `write_manifest(state)` | Atomic JSON write (tmp + `os.replace`) | Yes, structurally. Manifest schema differs. |
| `pip_install(packages)` | `subprocess` pip install with 1800s timeout | Yes, but production should avoid runtime install (see §4). |
| `ensure_py312()` / `run_driver(kind, pkgs, driver_src, wav)` | uv-managed Python 3.12 side-venv + subprocess driver emitting metrics JSON | **Reusable pattern only.** Hard-codes `/tmp` ephemeral venv; production needs a cleaner subprocess contract. |
| `DRIVER_KITTEN` | Kitten driver: `KittenTTS("KittenML/kitten-tts-mini-0.8")`, `voice="Jasper"`, `model.generate(passage, ...)`, `sf.write(..., 24000)` | **Yes — core Kitten model init + inference + WAV write. Must parameterize voice/segment text/output path. Hard-coded to single passage, not segment loop. Voice `Jasper` is the only one exercised. |
| `audio_stats(wav_path)` | Duration, sample rate, channels, format, RMS, peak, bytes, sha256 | Yes — near-identical need. |
| `validate_wav(wav_path, min_sec, max_sec)` | WAV validation with problems list | Yes — needs tuning of `min_sec`/`max_sec` per segment length. |
| `_finish(wav, engine, model_id, voice, device, load_s, gen_s, ...)` | Per-segment stats + metadata dict | Yes — template for per-segment manifest entries. |

### Actual Kitten interfaces (extracted from `DRIVER_KITTEN`)

```python
from kittentts import KittenTTS
model = KittenTTS("KittenML/kitten-tts-mini-0.8")
audio = model.generate(passage, voice="Jasper")     # returns numpy array
sf.write(out_path, np.asarray(audio), 24000)         # 24000 Hz, mono
```

- **Dependencies:** `kittentts`, `onnxruntime`, `torch` (2.14.1 in benchmark run), `soundfile`, `numpy`.
- **Versions observed (benchmarks):** `kittentts==0.1.0`, `onnxruntime==1.31.0`, `torch==2.14.1`, `soundfile==0.14.0`.
- **Known constraint:** Kaggle image Python is 3.13; `kittentts` declares `Requires-Python <3.13`. The benchmark used the uv-3.12 side-venv workaround. Production runner must preserve this or pin a compatible interpreter.
- **Output sample rate:** 24000 Hz (Kitten native). **Downstream importer (`phase5-inject.js`) records `sampleRate: 24000`** in the input contract and `0.05147`-peak audio in benchmark. Converter to 22050 Hz (if required) is a separate question (see §5).

### Benchmark harness limitations for production use

- Single fixed `PASSAGE`, single WAV output. No segment loop.
- No per-segment manifest entries; manifest is per-engine, not per-scene.
- Resume logic keyed on `passageSha256` — production needs per-segment resume keyed on `sceneId` + segment text hash.
- `run_driver` hardcodes driver script to `OUT_DIR` (`/kaggle/working/tts-bench`); production needs per-segment output paths.
- Engine loop is `("kitten", "kokoro", "qwen")` — production needs **one engine, iterated over segments**.
- Validation `min_sec=15.0` is too coarse for variable-length narration segments (some are ~11s).

---

## 4. Production Runner Contract (minimum required)

The future runner (`remote/narration/main.py` rewritten) must:

1. **Input:** Load the authoritative production input (`narration-input.json`) with explicit precedence (external file → embedded fallback) and **refuse to proceed** if `productionId` or `segments` cannot be resolved. Validate `productionId` matches the expected contract (`prod_*`).
2. **Segment validation:** Validate ordered segment identities — `sceneId` (string), `position` (int, sequential), `label` (string), `estimatedDurationSec` (float), `text` (non-empty string). Re-derive positions from the `position` field, not from list order, to survive reordering.
3. **Synthesis:** Initialize `KittenTTS("KittenML/kitten-tts-mini-0.8")` once; for each segment call `model.generate(segment.text, voice=<voice>)` with the agreed voice (currently `Jasper` from the benchmark; production voice must be confirmed). Write WAV per segment.
4. **Output convention:** One file per scene. Naming must match the downstream importer's expectation (see §5): `data/phase5/narration/[scene_id].mp3` per the earlier audit, or `${position}_${sceneId-slice}.wav` per the `phase5-inject.js` key format — **contract is currently inconsistent and must be reconciled before the runner is written** (§6.1).
5. **Audio format:** 24000 Hz mono 16-bit PCM WAV (Kitten native); downstream converter to 22050 Hz may be needed (§6.1). Record actual sample rate, channels, bit depth.
6. **Validation per segment:** Duration within ±20% of `estimatedDurationSec` (with absolute floor/ceiling of 5s/600s), non-silence (RMS > 1e-4), no clipping (peak < 1.0). Fail fast on any invalid segment.
7. **Manifest:** Emit a per-segment manifest only when **all** segments validated. Fields: `productionId`, `engine`, `modelId`, `voice` (actual used), `license` ("Apache-2.0"), `sampleRate`, `createdAt`, `inputChecksum` (sha256 of the input JSON), per-segment `{sceneId, position, textSha256, wavPath, sha256, durationSec, rms, peak, status}`. **Do not emit manifest until all segments pass.**
8. **Resume / no-duplication:** Key resume entries on `sceneId + textSha256`. On re-run, skip segments whose validated WAV exists and whose text hash matches. Never overwrite a validated segment with an unvalidated one without explicit `--force`.
9. **Partial completion:** Write per-segment `.done` markers (or an unwritten manifest) so partial runs are detectable and resumable. Surface `PARTIAL` if interrupted.
10. **Metadata honesty:** Record true `provider/model/voice/license` and execution env (`python`, `platform`, `cuda`). No placeholder labels.

### Requirements the benchmark implementation cannot currently satisfy

- No segment loop — must be added.
- No per-segment resume keying on `sceneId`+`textSha256`.
- Hard-coded single voice `Jasper` — must be configurable (production may use a different voice; not yet confirmed).
- Output path hard-coded to a single WAV — must iterate to per-scene paths.
- Validation thresholds too coarse for variable-length segments.
- Manifest schema is per-engine, not per-scene — must be rewritten.
- No `textSha256` per segment for provenance.

---

## 5. Importer Interface Audit (`phase5-inject.js`)

**Read-only inspection. No execution, no modification.**

### Input directory and expected filenames

- CLI: `node phase5-inject.js <contentId> <wavDir> <narrationJobId>`.
- WAV directory: caller-supplied `<wavDir>`. Files expected: `${key}.wav` where `key = ${String(scene.position).padStart(3,'0')}_${scene.id.slice(0,8)}` — e.g. `000_sceneae.wav`. (Doc comment at line 14 says `000_<scene8>.wav`, consistent with `.slice(0,8)`.)
- Scene order: `bundle.scenes` sorted by `position` ascending; **throws if no scenes**.

### Manifest contract

- The importer takes **no manifest file**. It reads `<narrationJobId>` only as a **label** injected into DB attribution fields (`narrationTaskId`, evidence notes). The "manifest" is produced in-process as DB rows, not a JSON file. **No separate manifest file is consumed by the importer.**

### WAV requirements

- `ffprobe` is invoked (line 26) only for `format=duration`; it reads the **MP3** (`mp3` variable, line 84), not the source WAV. The conversion `wav → mp3` is implicit in `SceneRepairService.replaceAsset` (line 109 references `slide`/`mp3`). **The importer does not itself transcode; it relies on downstream service.**
- **Sample rate / bit depth / channel count: not validated by the importer.** Only `duration` is checked (must be finite and > 0).

### Segment-to-scene mapping

- Loop over `bundle.scenes` (line 64); for each, builds `key` from `scene.position` + `scene.id.slice(0,8)`, requires `${key}.wav` to exist in `<wavDir>` (line 82, throws if missing). Maps each WAV to `scene.position` for ordering.

### Database and revision side effects

- `db.updateProductionScene(contentId, scene.id, {...})` with: `narrationStatus: 'current'`, `narrationProvider: 'kokoro-82m (remote: <jobId>)'`, `narrationModel: 'hexgrad/Kokoro-82M'` (lines 75, hardcoded), `narrationTaskId`, `narrationError: null`, `narrationGeneratedAt`, `narrationCost`.
- `revision: scene.revision + 1` incremented per scene (line 99).
- `status: scene.status === 'visual_stale' ? 'visual_stale' : 'needs_rebuild'` (line 99) — **always sets to `needs_rebuild` unless `visual_stale`**, meaning the final mixed narration must be rebuilt before approval (line 123 comment).
- `SceneRepairService.replaceAsset` (line 109) called per scene for original visual replacement (`slide_${index.padStart(2)}.png`).

### Provider / model attribution

- **Hardcoded** at lines 74–75: `provider = 'kokoro-82m'`, `model = 'hexgrad/Kokoro-82M'`. These do **not** reflect Kitten TTS. This is a **contract mismatch**: the importer assumes Kokoro attribution. If Kitten is used to generate the WAVs, the importer will still write `kokoro-82m` as `narrationProvider`. **This must be parameterized or the provenance will be dishonest.**

### Safeguards against incomplete output

- Throws `missing narration file for scene ${position}` (line 82) if any expected WAV is absent. This is the **only** safeguard — it is all-or-nothing per scene; no graceful PARTIAL.
- No duration tolerance check — accepts any finite duration. If a segment WAV is too short (silence, truncation), it passes but downstream mix is broken.

### Risks identified

1. **Filename mismatch:** The runner must produce `${position3}_${sceneId8}.wav` exactly. The upstream audit report (`docs/AGENTTUBE-FEASIBILITY-AUDIT.md`) states `data/phase5/narration/[scene_id].mp3`, which does **not** match the `.slice(0,8)` prefix convention in `phase5-inject.js`. This inconsistency must be resolved before writing the runner.
2. **Attribution hardcoding:** Imposer writes `kokoro-82m` regardless of actual engine. Must be parameterized.
3. **No manifest consumed:** The runner's manifest is for **provenance/validation**, not ingestion. The importer trusts the WAV directory listing.

---

## 6. Safe Offline Validation Opportunities

1. **Static contract reconciliation:** Compare `phase5-inject.js` key format (`${position3}_${sceneId8}.wav`) against the runner's output plan **before** any code is written. Resolve the `[scene_id].mp3` discrepancy in the upstream audit. This is a pure read-only check — no execution.
2. **Input contract parsing:** Parse `data/phase5/narration/narration-input.json` (production ID `prod_1791719492789_rox41tx3c2_jldixb8xqw`, 10 segments, `sampleRate: 24000`, 2364 chars / 401 words — verified offline). Validate segment ordering, non-empty text, sceneId uniqueness. **Already partially done above; can be formalized into a JSON-schema check with no runtime.**
3. **Loader logic unit check:** The `main.py.restructured` input-resolution loop (lines 19–43) can be statically analyzed: confirm candidate paths, fallback write, and final `SystemExit`. No execution needed to identify the path-resolution gap that likely caused the Kaggle failure.
4. **Audio format reconciliation:** Kitten outputs 24000 Hz; `phase5-inject.js` does not validate sample rate but the upstream audit implies 22050 Hz is expected. This is a design question, resolvable offline.

### What cannot be reproduced offline

- The exact Kaggle script-kernel CWD/`__file__` resolution and whether the embedded-fallback write succeeded. **Requires the kernel stdout/stderr log, which is unavailable locally.**
- End-to-end Kitten CPU inference timing or audio quality. **Requires executing `KittenTTS` (blocked by constraint).**
- Imposer behavior against a real production. **Requires DB access (blocked).**

---

## 7. OpenCreator Comparison Targets

Per instructions, **no OpenCreator integration/installation** and **no claiming advantage**. The following are named **targets for a future source-level comparison**, prioritized:

1. **Narration pipeline** — how OpenCreator handles TTS voice selection, multi-segment synthesis, and WAV manifest per segment (compare to our per-scene keying).
2. **Subtitles/captions** — timing alignment, segmentation strategy, SRT/VTT emission.
3. **Audio/visual synchronization** — how OpenCreator aligns generated narration to scene durations (compare to our `estimatedDurationSec ±20%` and `needs_rebuild` gap).
4. **Asset provenance** — provider/model/voice/license attribution storage (compare to our hardcoded `kokoro-82m` in `phase5-inject.js`).

These are **comparison targets only**; no evaluation is performed here.

---

## 8. Smallest Recommended Next Engineering Tranche

**Tranche A (offline-only, evidence-supported, no remote execution):**

1. **Resolve the filename contract** between `phase5-inject.js` (`${position3}_${sceneId8}.wav`) and the production narration output plan. Decide and document a single naming convention. This blocks all runner implementation.
2. **Parameterize provider/model/voice** in `phase5-inject.js` (or document the hardcoded-Kokoro limitation as a known provenance defect). Without this, any Kitten-generated WAV will be mislabeled in the database.
3. **Write a JSON-schema (or pure-Python) validator** for `narration-input.json` that checks: `productionId` shape, segment list ordering, `sceneId` uniqueness, `position` sequence, non-empty `text`, and `textSha256` field. Run it locally against the production input. **No execution of Kitten required.**
4. **Confirm the intended Kitten voice** — `Jasper` was used in the benchmark; the production voice must be explicitly chosen and documented. No default assumption.

**Out of scope for this tranche:** any TTS inference invocation, Kaggle submission, package installation, DB writes, WAV generation.

---

## 9. Blockers and Unresolved Questions

1. **Input-path root cause is unconfirmed.** The local stub at `remote/narration/main.py` does not reproduce the failure. `main.py.restructured` is the closest match but was not (to our knowledge) the pushed revision. **No kernel log is available locally to confirm which code path ran.**
2. **Filename contract inconsistency** between the upstream audit (`[scene_id].mp3`) and the importer (`${position3}_${sceneId8}.wav`). Must be resolved before the runner is written.
3. **Attribution mismatch:** `phase5-inject.js` hardcodes `kokoro-82m`; using Kitten will write dishonest provenance unless parameterized.
4. **Intended Kitten voice unconfirmed** — benchmark used `Jasper`; production voice is a separate decision.
5. **Sample-rate mismatch potential** — Kitten emits 24000 Hz; 22050 Hz may be expected downstream. Imposer does not validate, but the final mix pipeline may require conversion.
6. **`main.py` is currently a 12-line stub.** Any change to the actual submitted/used revision is unknown. Rewriting `main.py` without confirming the historical revision risks repeating the failure.

---

## 10. Recommendation

**Proven:** The benchmark (`kb-tts-20261011-01`) ran successfully end-to-end on Kitten TTS and produced validated WAV artifacts; the Kitten driver code path (`KittenTTS`, `voice="Jasper"`, 24000 Hz mono, `onnxruntime`-backed) is functional and recoverable as a reference. The production input contract (`prod_1791719492789_rox41tx3c2_jldixb8xqw`, 10 segments, 2364 chars) parses correctly offline. The importer's WAV-key contract and all-or-nothing missing-file safeguard are documented.

**Unknown:** The exact root cause of the narration kernel's startup ERROR (path resolution in the Kaggle script-kernel environment), the true revision submitted, and whether the embedded-fallback write actually executed. These cannot be settled without the kernel log.

**Action justified next:** Execute **Tranche A** (offline contract reconciliation + schema validator + voice confirmation). No TTS inference, no remote submission, no package install. This is the smallest evidence-supported increment that removes ambiguity without consuming GPU or risking another failed kernel run.

**Action explicitly NOT justified now:** Rewriting `remote/narration/main.py` as a Kitten production runner or submitting a new Kaggle narration kernel, because (a) the filename contract and attribution are unresolved, and (b) the historical failure's exact trigger is unconfirmed — proceeding risks a repeat ERROR with no additional diagnostic signal.
