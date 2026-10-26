# AgentTube TTS Tranche B — Production Narration Runner

**Date:** 2026-10-12
**Status:** PARTIAL
**Runner File:** remote/narration/kitten_runner.py

## Summary

Implemented a testable production narration runner (Kitten TTS) with explicit input/output contracts, resumability hooks, offline test seam, and manifest support. Real TTS inference is not executed in this tranche.

## Repository State
- Git HEAD: e26792ae00dc1ec2434faf32632896609396dfad
- Existing: remote/tts-bench/main.py (436 lines), remote/narration/main.py (stub), utils/narration-input-validator.js, utils/narration-import-provenance.js, phase5-inject.js

## Contracts Verified
- WAV filename: `${position3}_${sceneId8}.wav`
- Sample rate: 24000 Hz
- Segments validated via existing validator
- Provenance hooks from importer contract

## Implementation
- `kitten_runner.py`: Testable interface, explicit paths, SHA256 helpers, JSON manifest, resume based on sceneId+text hash+model+voice, validation hooks.
- Offline fake synthesizer supported via `synthesizer` parameter (no Kitten initialization in tests).

## Safety
- No real TTS inference, no GPU/remote workloads, no production DB writes, no phase5-inject execution.
- Lazy imports for heavy deps; fail with clear diagnostics.

## Tests (offline)
- qualification-tests.js: 5/5 PASS
- Validation of input, naming, and provenance logic confirmed.

## Limitations
- Real Kitten inference path stubbed for offline safety.
- Full WAV validation (rms/peak/channels) minimal.
- Future tranche: wire real Kitten when authorized.
