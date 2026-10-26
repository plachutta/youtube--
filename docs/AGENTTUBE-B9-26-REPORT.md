# B9.26 — Kokoro acceptance recorded; Qwen shared-provider integration completed

All model inference in this tranche ran on **Google Colab hosted GPU
runtimes** (Tesla T4, `torch 2.11.0+cu130`, CUDA 13.0, Python 3.13.15),
driven by the official Colab CLI v0.7.4. No model was initialised, loaded
or executed on the local laptop.

---

## 1. Kokoro human acceptance recorded

Each WAV was re-hashed locally and checked against its own B9.25 manifest
before any record was written.

| segment | artifact SHA-256 | text SHA-256 | duration |
|---|---|---|---|
| b9-25-seg-a | `680567c382e9f268ba59a14445b8fa0bb5ec695115c0cb8971d3d4859320dbd6` | `305fee1e7ea9bdaa…` | 5.025 s |
| b9-25-seg-b | `1bd3113bd1eba3ecfd6c6cff2714fbfb371bec31ee58deceec161a7b7d0c2de5` | `dc5ec5903c10b41f…` | 4.475 s |
| b9-25-seg-c | `6bc5e84b29d9247d1cdeac6a0e33dc8cec6b7798d13db2aa023dd04c4f5b992b` | `cc3d1e96705f6ecd…` | 4.975 s |

Record: `hosted-runs/b9-25-pilot/HUMAN-REVIEW-RECORD.md`
— `quality_status: HUMAN_ACCEPTED`, `reviewer: user`, `verdict: ACCEPTED`,
rationale “The user listened to the sample and described all three Kokoro
integration samples as clear and more than acceptable.”

Previously accepted reference samples, unchanged:

* Kokoro `53e0ec4ec4998c2d6feb1b9ad3433394c8ae43a8926bed8be69d1fcddd059ee9`
* Qwen `e074073fbc50e075625c4cbf1c8c1eb37dc683d783c61557400b978fcd157f1d`

Original WAVs, manifests and logs were not modified.

## 2. Qwen — actual root cause (not “dependency conflicts”)

Three distinct defects had to be separated. The B9.25 dependency check
(`hosted-runs/b9-25-dependency-check/`) is what distinguished them:

**(a) Missing SoX system library.** With `transformers==4.57.3` +
`huggingface_hub==0.36.2` installed, `import transformers` *succeeds*, and
the qwen_tts import chain dies at `import sox` inside
`qwen_tts/core/tokenizer_25hz/vq/speech_vq.py`. The python `sox` package
needs the SoX binary at install time, so it must be apt-installed first.
Fixed with `apt-get install -y espeak-ng sox libsox-dev`.

**(b) transformers / hub window.** `qwen-tts 0.1.1` hard-pins
`transformers==4.57.3`, which requires `huggingface-hub<1.0`. The runtime
ships `huggingface_hub 1.33.0`; keeping it while installing 4.57.3 makes
transformers' own `dependency_versions_check` raise, which surfaces as the
misleading `ImportError: cannot import name 'download_url' from
'transformers.utils'`. Letting pip resolve the pair
(transformers 4.57.3 + hub 0.36.2) imports cleanly once SoX exists.
Keeping transformers 5.18.0 instead fails with
`TypeError: check_model_inputs() missing 1 required positional argument:
'func'` — qwen-tts 0.1.1 uses the 4.x decorator signature, and 4.57.3 is the
last 4.x release (4.58.0 was never published).

**(c) Undocumented return layout — the reason inference never produced a
WAV.** With the environment correct, inference ran and failed inside
`sf.write` with `LibsndfileError: Format not recognised`. The manifest now
records the cause: `generate_custom_voice` returned
`{"type": "ndarray", "shape": [1, 136320], "dtype": "float32"}`. The old
code took `waveform[0]`/`np.asarray(...)` and handed libsndfile a
2-D array, which it rejects with that unhelpful message. The fix collapses
a trailing singleton channel axis (`value.reshape(-1)` when
`shape[-1] == 1`, else `value[0]`) so the 136 320 sample frames survive,
and falls back to the stdlib `wave` writer if `soundfile` still fails.

No third-party source was patched in place; only AgentTube's own runner
changed.

## 3. Qwen isolated runtime (reproducible)

Recorded in the manifest, verified by the import/initialisation gate before
any inference:

```
qwen-tts 0.1.1 (--no-deps)
transformers 4.57.3 | huggingface_hub 0.36.2 | accelerate 1.12.0
librosa, soundfile, onnxruntime, einops, sox (--no-deps)
torch 2.11.0+cu130 preserved (pinned, never replaced)
model revision 85e237c12c027371202489a0ec509ded67b5e4b5
dtype torch.float32 | attn_implementation sdpa | Tesla T4
```

Kokoro's environment and its pinned misaki commits remain independently
recorded in B9.24; the two never share a runtime in this design.

## 4. Qwen bounded integration — executed through the shared contract

Local orchestration submitted `B9.26_qwen_hosted_run.py` to a dedicated
Colab session; the segments were the *same three texts and hashes* Kokoro
used, recovered from the B9.25 manifest, not from memory.

Remote terminal: `DONE PASS succeeded=3 expected=3`
Session `b926-qwen-5-20261013` (Tesla T4) — stopped and released after
retrieval; `colab sessions` now reports none active.

| segment | artifact SHA-256 | duration | validation |
|---|---|---|---|
| b9-25-seg-a | `033a4af353181171a2ae1d780dcec43971217c5c1a200de87e7bbc67d40a42d8` | 5.68 s | PASS |
| b9-25-seg-b | `a2127c1164750be20ac241c2409a504d0c7f11979f6296419c4cf4bb03d4c227` | 4.88 s | PASS |
| b9-25-seg-c | `a2d5a4e67482e470c06bad9c45a4060a4828e95fee407486911be2a151699d43` | 5.52 s | PASS |

Each local file hash was verified against the remote manifest, and each
input hash re-verified locally, before validation. Artifacts, manifest,
log and review index: `hosted-runs/b9-26-qwen/`.

## 5. Tests

```
$ node tests/narration-provider-contract.test.js
34/34 passed   (exit 0)

$ node qualification-tests.js
📊 Summary: 5 passed, 0 failed   (exit 0)
```

Added regression tests for the B9.26 failure mode:

* `a 2-D single-channel waveform encodes to a decodable mono WAV`
* `a [1, N] waveform is length-preserving under the normalisation rule`
  (asserts the singleton-channel collapse keeps 136 320 frames and that the
  pre-fix reading would have collapsed them to 1)

The prior suite's invariants still hold, including “generation success does
not imply technical validation”, “rejected artifacts cannot pass downstream
gates”, and “technical validation ≠ human acceptance”.

## 6. Human review required

The three new Qwen WAVs are **new artifacts** and do not inherit the B9.19
Qwen acceptance.

`hosted-runs/b9-26-qwen/HUMAN-REVIEW-INDEX.md` — all three are
`audio_quality_status: NOT_ASSESSED`, `downstream eligibility:
NOT_AUTHORIZED`. Play with `ffplay b9-25-seg-a_qwen.wav`.

## 7. Boundaries

* No production narration, database mutation, `phase5-inject.js`,
  import, upload or publishing.
* No accepted WAV modified; no artifact deleted or overwritten; each run
  used a new session name and lab directory.
* Every task-created Colab session was stopped and verified terminal.
* `git` HEAD unchanged (`e26792a`); nothing staged or committed.

## 8. Status

| Item | Status |
|---|---|
| Kokoro B9.25 acceptance (3 samples) | HUMAN-ACCEPTED, hashes verified |
| Qwen root cause | ESTABLISHED (3 distinct defects, each evidenced) |
| Qwen shared-provider integration | EXECUTED REMOTELY — 3/3 PASS |
| Provider contract + adapters | IMPLEMENTED |
| Contract tests (34) + qualification (5) | TESTED — all pass |
| New Qwen samples | TECHNICALLY VALIDATED, awaiting human listening verdict |
| Full production batch | NOT GENERATED |
| Production import / publication | NOT AUTHORIZED |

**FINAL: PASS** — both providers have now been exercised through the shared
contract on hosted runtimes, all six integration artifacts retrieved and
technically validated, recovery/artifact-reuse behaviour tested, and all
task-created GPU sessions released. Human listening review of the three new
Qwen samples remains outstanding.
