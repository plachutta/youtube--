# AgentTube OSS Deep Inspection & Guardrails

OPENMONTAGE SOURCE REVIEW: PARTIAL
TTS-VIDEO-PIPELINE SOURCE REVIEW: PARTIAL
LICENSE AND REUSE REVIEW: PASS
REJECTED-ARTIFACT GUARD: PASS (added narration-quality guard + lifecycle concept)
CHECKPOINT VALIDATION: PARTIAL (inspected OpenMontage checkpoint semantics; no AgentTube code changes needed yet)
MANIFEST VALIDATION: PARTIAL (inspected contracts; provenance handling exists)
PROVIDER EXECUTION POLICY: PASS (policy preserved - no local inference fallback)
REGRESSION TESTS: PASS (5/5)
TTS INFERENCE: NOT RUN BY DESIGN
PRODUCTION IMPORT: NOT AUTHORIZED
PUBLICATION: NOT AUTHORIZED
OVERALL: PARTIAL

Key findings:
- OpenMontage: AGPL-3.0 (reference only; no direct copy). Checkpoint schema/validation, stage contracts, resume identity tests inspected.
- 0xkaz/tts-video-pipeline: MIT. Provider abstraction, fallback behavior (defaults to local Kokoro on cloud failure) documented - AgentTube must not adopt silent local fallback; policy already enforced via fail-closed provenance + remote-only requirements.
- AgentTube has provenance resolution (fail-closed), narration input validator, manifest reading. No explicit audio_quality/editorial/import/publication lifecycle states in code yet - guard added for REJECTED detection.
- Rejected artifact guard: `utils/narration-quality.js` fails closed if manifest has audio_quality_status REJECTED.

No model inference, audio/video generation, remote job submission, DB mutation, import/publication performed. Existing tests pass.
