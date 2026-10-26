# AgentTube TTS Tranche B.3.1 - Model Access

Status: BLOCKED (Model weights not cached; HF unauthenticated limits)

## Preflight
- Python 3.14.4
- kittentts/onnxruntime/soundfile installed
- Kitten imports OK
- Model load fails due to missing ONNX weights (not downloaded/cached locally)

## Recommendation
Set HF_TOKEN or ensure cached model exists. No inference attempted.
