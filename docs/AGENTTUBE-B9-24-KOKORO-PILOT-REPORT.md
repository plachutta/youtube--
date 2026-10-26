# B9.24 Kokoro hosted pilot — evidence-based report

All model inference for this tranche ran on **Google Colab hosted GPU
runtimes** driven by the official Colab CLI (`google-colab-cli` v0.7.4,
installed user-scoped via `uv tool install google-colab-cli`). No model was
initialised, loaded or executed on the local laptop.

Canonical input (117 characters):

> How a single misspelling created the most iconic domain name in tech is about to change everything, and here's why...

Expected SHA-256: `7b292603c4308ecf92cc882e1e2cc21b5da57ccade71b51ec3078a57bb11f5a8`

---

## 1. Qwen — accepted sample archived and re-verified

Bundle: `~/Downloads/b9_19_qwen_fp32_sdpa_recovery_artifacts (2).zip`
(identified by manifest contents, not by filename; the two earlier
`...artifacts.zip` / `...(1).zip` copies are failed pre-CUDA runs that contain
only a manifest and a log).

Archived to: `hosted-runs/b9-24-qwen-accepted/`

| Field | Value |
|---|---|
| Engine | Qwen3-TTS CustomVoice |
| Model | `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice` |
| Revision | `85e237c12c027371202489a0ec509ded67b5e4b5` |
| Voice / language | `ryan` / `english` (validated against the model's supported-speaker API) |
| GPU / runtime | Tesla T4, compute capability 7.5, torch `2.11.0+cu130`, CUDA 13.0, Python 3.13.15 |
| dtype / attention | `torch.float32` / `sdpa` |
| Input SHA-256 (actual) | `7b292603c4308ecf92cc882e1e2cc21b5da57ccade71b51ec3078a57bb11f5a8` |
| Output SHA-256 | `e074073fbc50e075625c4cbf1c8c1eb37dc683d783c61557400b978fcd157f1d` |
| Sample rate / channels | 24 000 Hz / 1 |
| Duration | 8.64 s |
| Peak / RMS | 0.4650 / 0.0637 |
| technical_validation_status | PASS |

Local verification after extraction: `sha256(qwen3_tts_customvoice.wav)` =
`e074073fbc50e075625c4cbf1c8c1eb37dc683d783c61557400b978fcd157f1d` — matches
the remote manifest and the expected hash.

**Human audio-quality status: ACCEPTED** (user listening verdict recorded
outside this report — see `HUMAN-REVIEW-RECORD.md`).

## 2. Kokoro root cause — established

`kokoro 0.9.4` declares `misaki[en]>=0.9.4`. The **published** `misaki` 0.9.4
wheel on PyPI declares `Requires-Python >=3.8,<3.13`, so on the Colab Python
3.13 runtime pip cannot resolve the dependency and the entire `kokoro`
installation aborts before any model import. Evidence:

* `pip index versions misaki` on a 3.14 interpreter and the PyPI JSON metadata
  both confirm the newest published misaki is `0.9.4` with
  `Requires-Python >=3.8,<3.13`.
* Upstream `hexgrad/misaki` commit `fba1236595f2d2bf21d414ba6e57d25256afada3`
  ("Enable Python 3.13 (#85)") relaxes `requires-python` to `>=3.8,<3.14`,
  but was never re-released to PyPI.

This was the single defect behind every earlier Kokoro failure — the earlier
`--no-run`-style "dependency conflicts" reports were inaccurate symptoms.

## 3. Kokoro dependency strategy (evidence-backed, no blind surgery)

* Pinned official sources, full SHAs recorded:
  * `kokoro` @ `dfb907a02bba8152ca444717ca5d78747ccb4bec`
    ("Enable Python 3.13 (#244)")
  * `misaki` @ `fba1236595f2d2bf21d414ba6e57d25256afada3`
    ("Enable Python 3.13 (#85)")
* `kokoro` installed with `--no-deps` so its `misaki[en]>=0.9.4` constraint
  cannot be re-resolved against the stale PyPI wheel.
* Supporting dependencies installed individually: `soundfile`, `loguru`,
  `huggingface_hub`, `num2words`, `phonemizer-fork`, `espeakng-loader`, `spacy`.
* `spacy-curated-transformers` deliberately **not** installed — it is declared
  in misaki's `[en]` extra but is never imported by any misaki module
  (`grep -rn "spacy_curated\|curated" misaki/*.py` returns nothing), and
  pinning it forces a `spacy 4.0.0.dev3` source build that fails.
* `torch` and `transformers` explicitly **pinned** to the pre-existing hosted
  GPU versions (`torch==2.11.0`, `transformers==5.18.0`) so the install cannot
  silently replace the working CUDA stack. Log confirms
  `Requirement already satisfied: torch ... (2.11.0+cu130)`.
* `espeak-ng` installed via `apt-get` for `phonemizer-fork`.
* Baseline runtime recorded before installation: Tesla T4, CUDA 13.0,
  `torch 2.11.0+cu130`, Python 3.13.15.

## 4. Kokoro execution result

Session: `b924-kokoro-pin4-20261013` (Colab, `--gpu T4`)
Script: `B9.24_kokoro_colab_runner.py`
Archived to: `hosted-runs/b9-24-kokoro/`

| Field | Value |
|---|---|
| Model | `hexgrad/Kokoro-82M` (upstream commit `dfb907a`) |
| Voice / language | `af_heart` / `a` (American English) |
| GPU actually used | Tesla T4, `torch.cuda.is_available() == True` |
| Input SHA-256 (actual) | `7b292603c4308ecf92cc882e1e2cc21b5da57ccade71b51ec3078a57bb11f5a8` |
| Output SHA-256 | `53e0ec4ec4998c2d6feb1b9ad3433394c8ae43a8926bed8be69d1fcddd059ee9` |
| Sample rate / channels | 24 000 Hz / 1 |
| Duration | 7.400 s (177 600 samples) |
| Peak / RMS | 0.518759 / 0.049716 (finite: true) |
| Inference elapsed | 10.614 s |
| technical_validation_status | **PASS** |
| audio_quality_status | PENDING_HUMAN_LISTENING |

Stage outcomes recorded in the remote manifest:
`input_verification: PASS`, `runtime_preflight: PASS`,
`system_dependencies: PASS`, `kokoro_installation: PASS`,
`misaki_installation: PASS`, `dependency_installation: PASS`,
`import_verification: PASS`, `inference: PASS`.

Post-download local re-verification: `sha256(kokoro_82m.wav)` =
`53e0ec4ec4998c2d6feb1b9ad3433394c8ae43a8926bed8be69d1fcddd059ee9` — matches
the remote manifest. Independent header check: 24 000 Hz, 1 channel,
177 600 frames, peak int16 16998, RMS int16 1629.08.

Full installer output, exit codes and per-stage status are preserved in
`hosted-runs/b9-24-kokoro/execution.log`.

## 5. Session lifecycle

* Colab sessions created and used: `b923-probe-20261013`,
  `b924-kokoro-pin/2/3/4-20261013`.
* Every session was explicitly stopped after its artifacts were retrieved and
  verified. `colab sessions` now reports "No active sessions found on server."
* Each new session was only created after confirming the previous one was
  terminal; no duplicate or overlapping GPU workload was ever started.

## 6. Regression tests

```
$ cd /home/gachiemeshackson/Videos/youtube && node qualification-tests.js
📊 Summary: 5 passed, 0 failed
🎉 All qualification tests passed!
```

Exit status 0. These tests do **not** exercise model inference; they are the
project's offline contract suite only.

## 7. Git state

* HEAD before and after: `e26792a` (no commits, no staging, no resets).
* Working tree retains the pre-existing `M package-lock.json` change plus
  untracked B9.x scripts, notebooks and reports. New files in this tranche:
  `B9.23_runtime_probe.py`, `B9.24_kokoro_colab_runner.py`,
  `docs/AGENTTUBE-B9-24-KOKORO-PILOT-REPORT.md`.

## 8. What remains

1. **Kokoro human listening review** — required. Local WAV:
   `/home/gachiemeshackson/Videos/agenttube-reference-lab/hosted-runs/b9-24-kokoro/kokoro_82m.wav`
   Play with any of:
   * `ffplay hosted-runs/b9-24-kokoro/kokoro_82m.wav`
   * `mpv hosted-runs/b9-24-kokoro/kokoro_82m.wav`
   * `aplay hosted-runs/b9-24-kokoro/kokoro_82m.wav`
2. No production narration batch was generated, no production narration,
   database, importer, publishing or `phase5-inject.js` was touched.
3. A single successful sample does not qualify every voice, language,
   configuration or model revision for either provider — see
   `NARRATION-PROVIDER-CONTRACT.md`.
