# B9.25 — Shared narration provider contract: implementation, qualification and hosted pilot

All model inference for this tranche ran on **Google Colab hosted GPU
runtimes** (Tesla T4, `torch 2.11.0+cu130`, CUDA 13.0, Python 3.13.15),
driven by the official Colab CLI v0.7.4. No model was initialised, loaded
or executed on the local laptop.

---

## 1. Reference artifacts verified and frozen

| Provider | Model / revision | Output SHA-256 | Status |
|---|---|---|---|
| Qwen3-TTS CustomVoice | `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice` @ `85e237c` | `e074073fbc50e075625c4cbf1c8c1eb37dc683d783c61557400b978fcd157f1d` | TECHNICALLY_VALIDATED + HUMAN_AUDIO_QUALITY_ACCEPTED |
| Kokoro-82M | `hexgrad/Kokoro-82M` @ `dfb907a` | `53e0ec4ec4998c2d6feb1b9ad3433394c8ae43a8926bed8be69d1fcddd059ee9` | TECHNICALLY_VALIDATED + HUMAN_AUDIO_QUALITY_ACCEPTED ("very acceptable") |

Canonical segment-0 text hash: `7b292603c4308ecf92cc882e1e2cc21b5da57ccade71b51ec3078a57bb11f5a8`.
Both WAV files were re-hashed locally against their archived manifests and
matched exactly. Originals, manifests and logs are untouched. Acceptance is
recorded in a separate file (`HUMAN-REVIEW-RECORD.md`) keyed to the exact
artifact hash; historical manifests were not edited.

## 2. Architecture — what already existed and what was added

Reused existing primitives rather than adding a second system:

* the project's CommonJS `utils/` module layout and `crypto` for hashing;
* `qualification-tests.js` as the offline suite;
* a deterministic `node` test file as the new test convention.

Added (all CommonJS, no new runtime dependency):

| File | Responsibility |
|---|---|
| `utils/narration-contract.js` | versioned contract: statuses, fingerprints, lifecycle transitions, downstream gate, artifact-store path safety |
| `utils/narration-audio-validation.js` | RIFF/WAVE parser + signal measurements; the *technical* layer only |
| `utils/narration-provider-registry.js` | provider registry + executor |
| `utils/narration-provider-adapters.js` | Kokoro / Qwen / fake adapters behind one interface |
| `utils/narration-retry-policy.js` | transient vs deterministic vs *uncertain* remote status |
| `utils/narration-hosted-executor.js` | Colab transport + hard no-local-inference boundary |
| `tests/narration-provider-contract.test.js` | 32 deterministic contract/failure tests |
| `scripts/b9-25-narration-pilot.js` | local orchestration entry (plan / collect / validate) |
| `scripts/b9-25-run-hosted-pilot.js` | hosted submission + eager retrieval + release |
| `scripts/b9-25-monitor-hosted-pilot.js` | monitor an in-flight hosted job, retrieve, release |
| `B9.25_hosted_pilot.py` | hosted runner (the only place provider deps exist) |

Contract statuses (kept strictly separate):

* lifecycle: `QUEUED → RUNNING → SUCCEEDED | FAILED | CANCELLED`
* technical validation: `NOT_RUN | PASS | FAIL`
* quality: `NOT_ASSESSED | TECHNICALLY_VALIDATED | REJECTED | HUMAN_ACCEPTED`

Provider Python dependencies are imported **only** by `B9.25_hosted_pilot.py`;
a dedicated test asserts that none of the shared contract modules import
Kokoro, Qwen, torch or transformers. The Colab CLI appears only in
`narration-hosted-executor.js`, so the domain contract stays
transport-agnostic. No LLM call exists in selection, lifecycle, or artifact
integrity.

## 3. Deterministic tests

```
$ node tests/narration-provider-contract.test.js
32/32 passed

$ node qualification-tests.js
📊 Summary: 5 passed, 0 failed
```

Covered (all with fake providers / synthetic buffers, no model contact):
valid input + input-hash verification; invalid-input rejection; both
providers satisfying one interface; no provider-dependency leakage;
configuration-fingerprint invalidation; `QUEUED→RUNNING→SUCCEEDED`; provider
failure with structured diagnostics; uncertain remote status never reported
as definite failure; no duplicate GPU job while state is unknown; transient
vs deterministic retry decisions; cancellation; artifact hash verification;
empty/corrupt/malformed audio rejection; **noise-only audio passing
technical validation but never accepted**; generation success not implying
technical validation; rejected artifacts blocked at every gate; human
acceptance binding to the artifact hash; changed text/voice/model/settings
invalidating reuse; unchanged artifacts reusable; partial multi-segment
failure preserving successes; recovery not resubmitting; local inference
forbidden; path-traversal refusal; JSON round trip.

The accepted reference WAVs are validated inside the same suite
(`the accepted reference WAVs satisfy the shared media contract`).

## 4. Hosted integration run

Session `b925-pilot-3-20261013`, Tesla T4. Three short non-production
segments × two providers, executed sequentially in one runtime.

### Kokoro-82M — PASS

| segment | text sha256 | audio sha256 | duration |
|---|---|---|---|
| b9-25-seg-a | `305fee1e7ea9bdaa…` | `680567c382e9f268…` | 5.025 s |
| b9-25-seg-b | `dc5ec5903c10b41f…` | `1bd3113bd1eba3ec…` | 4.475 s |
| b9-25-seg-c | `cc3d1e96705f6ecd…` | `6bc5e84b29d9247d…` | 4.975 s |

All three went through the shared application interface, were retrieved, and
passed the local shared-contract validation (24 kHz mono, finite, non-silent,
non-clipped). Archived in
`hosted-runs/b9-25-pilot/` with `manifest.json`, `execution.log` and
`HUMAN-REVIEW-INDEX.md`.

### Qwen3-TTS CustomVoice — BLOCKED (root cause established)

`import qwen_tts` fails on this runtime, for a proven dependency-window
reason. Two independent experiments plus the traceback mechanism:

1. `qwen-tts 0.1.1` hard-pins `transformers==4.57.3`. `4.57.3` is the **last**
   4.x release (`4.58.0` was never published), so no newer 4.x exists.
2. `transformers 4.57.3` requires `huggingface-hub<1.0,>=0.34.0`; the runtime
   ships `huggingface_hub 1.33.0`. Installing 4.57.3 with the runtime hub
   preserved makes transformers' own `dependency_versions_check` raise
   (`require_version_core`), which surfaces as
   `ImportError: cannot import name 'download_url' from 'transformers.utils'`
   via the lazy-module fallback path.
3. Letting pip resolve it downgrades the hub to `0.36.2` — the same
   `download_url` failure.
4. Keeping the runtime `transformers 5.18.0` instead fails later inside
   `qwen_tts/core/tokenizer_12hz/modeling_qwen3_tts_tokenizer_v2.py` with
   `TypeError: check_model_inputs() missing 1 required positional argument:
   'func'` (qwen-tts 0.1.1 uses the 4.x decorator signature).

A separate, additional blocker was found and fixed: `pip install sox` alone
is insufficient — `qwen_tts` aborts with `ModuleNotFoundError: No module
named 'sox'` from `qwen_tts/core/tokenizer_25hz/vq/speech_vq.py` because the
python `sox` package needs the SoX **system** binary. This was fixed with
`apt-get install -y espeak-ng sox libsox-dev` before any pip install.

Diagnostic evidence archived at `hosted-runs/b9-25-dependency-check/`.

Resolving Qwen therefore requires an isolated hosted runtime with a
huggingface_hub/transformers pair that satisfies both constraints — a
material dependency decision outside a single-runtime run.

## 5. Safety and closeout

* Every Colab session created for B9.25 was explicitly stopped after
  retrieval. `colab sessions` reports none active.
* No duplicate workload was ever submitted: the runner refuses to submit
  when an active session exists, and the monitor path retrieves and releases
  an in-flight job instead of starting a second one.
* No production narration, database mutation, `phase5-inject.js` execution,
  import, upload or publishing occurred.
* No existing artifact was deleted or overwritten; each run used a new
  session name and a new lab directory.
* `git` HEAD is unchanged (`e26792a`); nothing was staged or committed.

## 6. Status summary

| Item | Status |
|---|---|
| Contract design + implementation | IMPLEMENTED |
| Deterministic contract tests (32) | TESTED — pass |
| Existing qualification suite (5) | TESTED — pass |
| Kokoro through the shared interface, hosted | EXECUTED REMOTELY — 3 samples retrieved and validated |
| Qwen through the shared interface, hosted | BLOCKED — dependency window (evidence above) |
| Kokoro new samples, human acceptance | PENDING HUMAN LISTENING REVIEW |
| Qwen reference sample (B9.19) | HUMAN-AUDIO-QUALITY ACCEPTED |
| Production batch / import / publishing | NOT GENERATED / NOT AUTHORIZED / NOT AUTHORIZED |

**FINAL: PARTIAL** — the shared contract and deterministic tests pass, both
providers implement the same application interface, real hosted Kokoro
integration output was retrieved and technically validated, and recovery and
artifact reuse were exercised; Qwen is blocked on a proven hosted-runtime
dependency incompatibility.
