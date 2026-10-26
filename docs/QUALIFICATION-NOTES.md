# AgentTube Qualification — Working Notes (run of 2026-10-11)

Concise state for continuing work. Evidence paths referenced; no credentials recorded here.

## Scope & safety boundaries
- Audit/adoption only; no new engines; no public uploads; no paid API calls without authorisation.
- Forge/StudyBoost: do not inspect or consume. Kaggle account has Forge kernels — never touch them.
- API economy: zero LLM calls so far. Local deterministic work only (git/grep/npm/test suite/public HTTP docs).

## Environment baseline (Phase 0)
- Time: 2026-10-11 10:15 UTC; dir: /home/gachiemeshackson/Videos/youtube (was empty, not a git repo)
- Disk: 79G free of 234G; CPU 4 cores; RAM 15Gi; Node v24.20.0; Python 3.14.4; ffmpeg 8.0.1; docker present
- Repo cloned from https://github.com/darkzOGx/youtube-automation-agent -> master @ e26792a (2026-10-01)

## Phase 1 audit — established facts
- Version: package.json 2.10.0; CHANGELOG v2.5–v2.10.0 + Unreleased; git tags stop at v2.4.0 (all 4 tagged 2026-07-16) => tags stale, code is 59 commits past v2.4.0 (`git describe` = v2.4.0-59-ge26792a). README claims 46 tests; actual: **47/47 PASSED** (`npm test`), `npm run lint` clean.
- Deps: npm ci 495 pkgs (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1), native sharp+sqlite3 load OK.
- npm audit --omit=dev: **30 vulns (2 low, 9 moderate, 17 high, 2 critical: proxy-addr, tar)**; non-force fix available — NOT yet applied.
- Unusual metadata: README title contains pump.fun-style token string (commit 287803a; another in e09f144). Telegram link removed 0d7eaf9. No wallet/code artifacts. Marketing spam in README only.
- Security: no postinstall hooks; telemetry opt-in only (HTTPS endpoint, off by default); child_process spawn/execFile, no shell:true; darkzseo adapter JSON stdin/stdout + timeout + output cap + schema check; credentials -> config/credentials.json (gitignored); logger redacts stack in production.
- Negative gates verified by suite: unresolved claims block publish; missing narration blocks; upload reconciliation guard; rights+factual attestations required (index.js:1745).

## Capability inventory (classification)
- IMPLEMENTED+VERIFIED: tests/lint; job checkpoints; publishing safety; provenance/claims (utils/provenance-service.js); narration recovery (utils/scene-repair-service.js); ffmpeg resolution; shorts service (tests); bundled discoverability preflight.
- IMPLEMENTED NOT VERIFIED (no live creds): YouTube upload (agents/publishing-scheduling-agent.js videos.insert L231); analytics; TTS providers OpenAI/Gemini/ElevenLabs/Azure (utils/ai-video-generator.js L63-192); AI text providers (utils/ai-text-service.js PROVIDERS: openai/openrouter/kimi/mimo/glm + Gemini).
- PARTIAL: research = YouTube trending API + templates only; originality = duplicate-topic only (operator-service.js L47); monetisation-readiness per-video = MISSING (channel ROI studio exists); media rights = manual attestation, no automated licence lookup; Openverse not integrated.
- MISSING: external narration injection (narration only via configured provider, scene-repair-service.js L279); DeepSeek preset (ai-text-service.js _init fixed PROVIDERS map); burned-in caption verification not yet run.
- No API keys in env; no .env in repo. credentials.aiProvider preset path exists (ai-text-service.js L62-64).

## Integration insight (zero-code)
- OpenAI Node SDK reads OPENAI_BASE_URL (node_modules/openai/client.js L140); AIVideoGenerator does `new OpenAI({apiKey})` => an OpenAI-compatible TTS endpoint (local or remote) is usable WITHOUT code changes. Text service pins baseURL from preset (L85) => DeepSeek text needs a preset entry (small config addition; key/authorisation required from user).

## Phase 2 — candidates
- Voice Studio (msrbuilds): MIT app; engines/licences: VibeVoice-1.5B MIT (embeds audible disclaimer+watermark!), Kokoro-82M Apache-2.0 (~350MB, needs espeak-ng), Kitten TTS Mini Apache-2.0 (~79MB ONNX, CPU), Chatterbox MIT (PerTh watermark), OmniVoice/VoxCPM2/Qwen3-TTS Apache-2.0 (Qwen ~3.5GB). Studio = long-running HTTP UI => poor fit for Kaggle notebook; use official model inference directly instead (mission-sanctioned). Local: no espeak-ng.
- Marketing-Agent-OS: Apache-2.0, 238 skills, selective install per its README. Shortlist: content-strategy, trend-spotter, keyword-research, seo-content-brief, short-video-scripter, analytics, audience-mapper, social-calendar-builder, channel-portfolio-planner, content-quality-auditor.
- Openverse: VERIFIED no-auth API: GET https://api.openverse.org/v1/images/?q=..&license=cc0 (HTTP 200, returns licence, licence_url, attribution).
- Kaggle: CLI 2.2.4, OAUTH set; quota GPU 30.00h remaining, refresh 2026-10-17; Forge kernels present (off-limits). Colab unverified fallback. Oracle: no instance — unavailable.

## TTS benchmark — FINAL (job kb-tts-20261011-01, v3, Tesla T4, same 659-char passage)
| engine | model | licence | voice | load | gen | audio | RTF | VRAM | RSS | rms | status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| kokoro | hexgrad/Kokoro-82M (kokoro 0.9.4, misaki 0.9.4) | Apache-2.0 | af_heart | 7.34s | 2.71s | 41.1s@24k | 0.066 | 1019MB | 537MB | 0.051 | SUCCESS |
| kitten | KittenML/kitten-tts-mini-0.8 (kittentts 0.1.0, onnxruntime 1.31) | Apache-2.0 | Jasper | 3.45s | 13.6s | 36.8s@24k | 0.370 | none (CPU) | 528MB | 0.108 | SUCCESS |
| qwen | Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice (qwen-tts 0.1.1, transformers 4.57.3) | Apache-2.0 | Aiden | 33.6s | 124.7s | 46.4s@24k | 2.686 | 4718MB | 5378MB | 0.094 | SUCCESS |
torch 2.14.1 / 2.11 (qwen), soundfile 0.14. Playback: remote/results/{kokoro_82m,kitten_tts_mini,qwen3_tts_custom}.wav.
Method note: kokoro+kitten needed py312 side-env (uv) because Kaggle py is 3.13 and both declare
Requires-Python <3.13; v2 also cleaned the venv from outputs. Qwen v1 vs v3 diff (42.2s vs 46.4s,
RTF 2.65 vs 2.69) = normal sampling variance, both runs SUCCESS.
SELECTION: PRIMARY=Kokoro-82M (best RTF by ~40x, commercial-friendly licence, tiny VRAM);
FALLBACK=Kitten TTS Mini (CPU-only, RTF<1, permissive licence); DEFERRED=Qwen3-TTS (works,
GPU-heavy, 2.7x slower than realtime — revisit if human review needs its quality tier).
QUALITY DISCLOSURE: no STT engine installed locally (checked: neither faster-whisper nor
openai-whisper present; installing Whisper+torch locally contradicts lightweight-local rule),
so pronunciation/naturalness/pausing/intelligibility are HUMAN-REVIEW-BLOCKED. Objective
metrics recorded above; non-silence verified (rms 0.05–0.11, valid 24k mono PCM).

## Phase 4 gate tests
- Independent suite ./qualification-tests.js (purely local, no creds/LLM): **10/10 PASS** (2026-10-11):
  unverified claim cannot pass; rights gate (RIGHTS_CONFIRMATION_REQUIRED);
  NARRATION_REQUIRED on missing audio; garbage/truncated rejected by isValidVideo,
  ffmpeg MP4 accepted; SRT parseable/monotonic/complete matching scene durations;
  failed stages persist checkpoints+reasons; valid MP4 alone cannot bypass provenance.
- Benchmark v1 (kb-tts-20261011-01, Tesla T4, py3.13): Qwen3-TTS-1.7B-CustomVoice
  SUCCESS (Aiden/English, cuda, load 32.3s, gen 111.9s, 42.2s audio, RTF 2.648,
  peak VRAM 4705MB, RSS 5380MB, rms 0.093 — non-silent). kokoro + kittentts FAILED
  on py3.13 (Requires-Python <3.13) => v2 routes them through a uv-managed py312
  side-env as driver subprocesses (kernel v2 pushed).

## Deferred/additional candidates (Phase 2E)
No Phase-1 gap justifies adopting them now; ALL deferred, no code installed:
- Providence: UNEVALUATED — mission gives no repository URL/identifier, so it cannot
  be inspected. Deferred until a concrete repo is proposed.
- Separate trend-detection agent: DEFERRED — initial format is evergreen explainer
  content (template strategy works without it); would duplicate
  ContentStrategyAgent.analyzeTrends. The adopted trend-spotter skill covers the
  planning guidance. Re-evaluate only if evergreen format passes checks and a
  trend-driven format is green-lit.
- Postiz (multi-platform social scheduling): DEFERRED — scope is YouTube-first;
  YouTube scheduling is IMPLEMENTED (publishing-scheduling-agent); other platforms
  explicitly wait until the initial format passes quality checks.
- Code2MP4 (code-animation video): DEFERRED — initial format is narrated cultural/
  tech explainer, not code tutorials; no code-animation need identified.

## Media rights policy (Openverse workflow)
- Verified: unauthenticated Openverse API + licence filtering (license=cc0 tested,
  HTTP 200 with licence/licence_url/attribution fields).
- Allowlist for monetised pipeline: CC0, Public Domain Mark, own originals.
- Attribution licences (BY, BY-SA) usable ONLY with recorded attribution + reviewer
  sign-off (SA copyleft flagged as packaging risk, not legal clearance).
- EXCLUDED: BY-NC, BY-ND, any UNKNOWN/missing licence ("unknown rights are never
  cleared rights"). Enforcement today = manual attestation + RIGHTS_CONFIRMATION_REQUIRED
  gate; automated lookup NOT implemented (PARTIAL, documented).

## Phase 5 test package (in progress)
- Harness ./phase5-generate.js runs the REAL pipeline (generateContent) with the
  startup credential gate and YouTube setup overridden in-process ONLY; no shipped
  code changed; scheduler paused. Full template production succeeded:
  contentId=prod_1791719492789_rox41tx3c2_jldixb8xqw, topic "How a single
  misspelling created the most iconic domain name in tech" (explainer, short),
  10 scenes, review=needs_attention, quality=82. Assets: simulated video/audio
  (correctly flagged), gradient thumbnail present, captions recorded as generated,
  provenance not_required (0 claims: template script declares none — honesty gap
  noted for report, not safe for publication).
- Narration input exported: data/phase5/narration/narration-input.json
  (10 segments, 2364 chars). Narration job pending benchmark engine selection.
- Narration injection gap CONFIRMED: no supported API for external audio
  (PUT asset = image/video only; regenerateNarration = provider-only;
  updateScene has no audioPath). Chosen workaround: documented script mirroring
  regenerateNarration's exact DB fields with honest provider labels (NOT the
  OpenAI-baseURL shim — that path hardcodes provider='openai' in evidence,
  which would be misleading provenance).
