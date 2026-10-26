# AGENTTUBE — TTS RUNNER RECOVERY AND PACKAGING AUDIT

## A. Executive finding
A complete, previously-successful Kitten TTS Mini 0.8 inference implementation is
recoverable locally in `remote/tts-bench/main.py`. It ran on CPU during the
Kaggle benchmark (job `kb-tts-20261011-01`) and produced validated output
(`remote/results/kitten_tts_mini.wav`) plus manifest entries.

The current narration runner `remote/narration/main.py` (SHA-256
`82c7e0880046185712cc1ddab272351c6b817119a2ce8458db9c653e07c72a6`) is a
self-contained loader stub: it decodes an embedded 10-segment payload and exits
without initializing a TTS model or generating any WAV files.

Kaggle startup failures (`missing /kaggle/src/narration-input.json`) are
caused by an environment/packaging path mismatch — the script-kernel runtime
expects a physical input file in a location that the embedded fallback does not
satisfy. This is **not** a model-inference failure and **not** a confirmed
variable-ordering defect in the current loader.

## B. Repository baseline
- Repository root: `/home/gachiemeshackson/Videos/youtube`
- HEAD: `e26792ae00dc1ec2434faf32632896609396dfad`
- Working tree: intentional untracked recovery files present
  (`remote/agenttube-job-ledger.json`, `scripts/remote-preflight.js`,
  `docs/AGENTTUBE-PHASE0-6-REPORT.md`, `docs/AGENTTUBE-FEASIBILITY-AUDIT.md`,
  `phase5*`, `qualification-tests.js`, `phase5/`). `package-lock.json` is
  modified.
- No git operations performed during this investigation.
- No files were modified except the report file created by this audit.

## C. Existing Kitten TTS implementation (RECOVERED, prior success)
- File: `remote/tts-bench/main.py` (tracked)
- Model: `KittenML/kitten-tts-mini-0.8`, voice `Jasper`, Apache-2.0.
- Engine entrypoint: `bench_kitten` (lines ~290-301), model load at lines
  193-196 via `KittenTTS("KittenML/kitten-tts-mini-0.8")`.
- CPU-capable: `torch` is installed only to satisfy `soundfile` extras;
  benchmark manifest records `device: cpu`, `rtf: 0.3695`, generation time
  `13.6s` for the benchmark passage.
- Evidence of prior successful execution:
  - `remote/results/kitten_tts_mini.wav` (1,766,844 bytes, 36.808s, 24kHz,
    mono, RMS 0.108163, valid=true).
  - `remote/results/tts-benchmark-manifest.json` `kitten` engine block.
- Notes: Kaggle image Python 3.13 incompatible with kittentts (<3.13); prior
  run used a uv-managed Python 3.12 side venv. This is an implementation
  detail, not a defect in the Kitten inference path itself.

## D. Current narration runner audit (NOT inferring)
`remote/narration/main.py`:
- Defines `_INPUT_B64`; loads payload; validates segments (count, IDs, order,
  production ID, non-empty text).
- Does NOT initialize any TTS provider, load any model, or write WAVs.
- Does NOT reference `/kaggle/src/narration-input.json`.

Verified locally:
- `python3 -m py_compile remote/narration/main.py` → OK (no syntax error).
- Isolated import (no external JSON, temp dir, changed cwd) loads payload
  successfully and reports the correct production ID + 10 segments; exits 0
  with no model/network access.

Conclusion: the loader works offline as a loader. It is not a complete
narration runner because it performs no inference.

## E. Input identity (SHA-256)
- `remote/narration/narration-input.json`:
  `e3bfd83870a1041e4eee2d2e5f4a1dc510e1ce69c1105a61299300ca868cdad6`
- `data/phase5/narration/narration-input.json`: identical content
  (same 10 segments, production ID
  `prod_1791719492789_rox41tx3c2_jldixb8xqw`, 2364 total characters).
- `remote/narration/main.py`:
  `82c7e0880046185712cc1ddab272351c6b817119a2ce8458db9c653e07c72a6`.
- `remote/narration/kernel-metadata.json`:
  `69fb287e16e2f9e20440e7b9fa89a5eadbb0f7311f9bc37740107d7208ab96c7`

## F. Kaggle missing-input failure investigation
- The corrected loader contains no reference to `/kaggle/src/narration-input.json`.
- The error is emitted before the embedded fallback is exercised, indicating a
  startup-time path expectation that is not met by Kaggle's script-kernel
  runtime layout.
- Local evidence cannot fully confirm the exact upstream lookup ordering
  without reproducing Kaggle's script-kernel startup. This is recorded as a
  **hypothesis requiring controlled verification**, not a confirmed root cause.

## G. Downstream audio/import contract
- `phase5-inject.js` (inspected, NOT executed): expects WAVs in a segments
  directory, 24kHz mono WAV, mapped by `sceneId`+`position`, production ID
  read from manifest.
- Kitten benchmark output is 24kHz mono WAV (format-compatible), but uses the
  benchmark passage, NOT the production script text — so it cannot substitute
  for production narration.
- Provenance risk: `phase5-inject.js` hard-codes provider/model labels; Kitten
  output must be ingested under its real Kitten identity to avoid mislabeling
  it as Kokoro.

## H. Provider/provenance discrepancies
- Benchmark Kitten: device=cpu, modelId `KittenML/kitten-tts-mini-0.8`, voice
  `Jasper`, license Apache-2.0 (correct).
- Inference script currently labels nothing; no mislabeling in the stub.

## I. Tests actually run
- `python3 -m py_compile remote/narration/main.py` → OK.
- Isolated import of embedded payload (no external JSON, temp dir, changed cwd)
  → loads prodId + 10 segments; exit 0; no model/network.
- `sha256sum`, `grep`, `git status` — read-only.
- Existing `node qualification-tests.js` (10/10) and `node test.js` (47/47) were
  established previously and are not invalidated; not re-run because this work
  made no source changes.

## J. Facts vs. hypotheses
- FACT: Kitten implementation exists and succeeded (artifact + manifest present).
- FACT: `remote/narration/main.py` is a non-inferencing loader stub.
- FACT: loader has no reference to `/kaggle/src/narration-input.json`.
- HYPOTHESIS: a startup pre-check outside the loader reads the absent file first;
  requires controlled local repro of Kaggle script-kernel startup ordering.
- RULED_OUT: model failure (no model loads in the stub).

## K. Blockers
- No authorized GPU run.
- Kaggle startup-path cause is locally unproven.
- Kitten WAVs do not match production text, so they cannot serve as production
  narration without a production-text execution.

## L. Recommended next step (evidence-based, offline)
Add a focused packaging/startup test that proves the corrected loader runs
WITHOUT requiring `narration-input.json` to be present as a physical co-located
file (embedding-only path), including with a changed working directory and the
packaged artifact (not merely the source). If that passes, the Kaggle failure
is environmental, not code-level; if it fails, root cause is reproducible
locally. No GPU/inference/paid-API required. Separately: to produce production
narration, a real TTS run (CPU Kitten or GPU Kokoro) on the production text
would be needed, requiring explicit authorization.

## M. Safety confirmation
No remote compute, no GPU inference, no upload, no database mutation, no
production injection, no dependency installation, no destructive git operation,
and no credentials/tokens were exposed during this audit. Only local
read-only inspection and deterministic tests were performed.
