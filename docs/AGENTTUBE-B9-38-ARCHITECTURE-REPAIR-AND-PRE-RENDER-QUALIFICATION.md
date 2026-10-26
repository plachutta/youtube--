# B9.38 — Generator Architecture Repair and Pre-Render Qualification

Status key: see final section. No video was rendered in this milestone.
RENDERED_OUTPUT_VALIDATED = NOT PERFORMED,
VISUAL_SUPERIORITY_ESTABLISHED = NOT PERFORMED, HUMAN_REVIEW = PENDING.

## 0. Mission and outcome

The B9.37 draft ("How a single misspelling created the most iconic domain
name in tech") was audited as not shippable: production labels collide with
captions, no explanatory visuals, clipped captions, inconsistent geometry.
B9.38 repaired the generation architecture, inspected and selectively
adopted open-source engines, and qualified the new contracts with
non-rendering tests. The old failure modes now fail closed BEFORE any
renderer is reached.

## A. Audit findings and confirmation state

All twelve audit observations were mapped to evidence. Key confirmations:

1. Label/caption collision (9 of 10 scenes): CONFIRMED in rendered frames
   (bbox overlap table audit/overlap_metrics.txt; white caption band starts
   at y=7, below the 100px margin). CONFIRMED in source precedent: the b9_33
   review manifest records a single visual_type "title+description" for
   ALL ten scenes with communicates "<label>: <full narration>".
2. Labels are production metadata: CONFIRMED. The label vocabulary
   (Hook/Introduction/The Setup/…/Call to action) originates in the narration
   revision record (revisions.json), flows into scene metadata, and was
   drawn as the only visual layer.
3. No diagrams/imagery: CONFIRMED (frames + title+description for all).
4-5. Process and intention-vs-input unvisualized: CONFIRMED in frames;
   the narration text supports both payloads (used for the new specs).
6. Scene 5 rectangles: CONFIRMED as cyan keyword-highlight boxes crossing
   text (edges at x~135-139/1025-1029, y~476-480/647-651, ~894x175px) plus
   a head-clipped caption ending at "What made" (SRT is complete — a
   renderer-side fixed-budget clip, not caption-source loss).
7. Scene 10 starts at "notification bell.": CONFIRMED as dropped caption
   head — "If this was useful, subscribe and hit the" is present in the
   SRT but absent on screen (renderer head-clip + label collision).
8-9. Margins/letterbox: CONFIRMED (caption top y~6-44px; boundary frames).
10. No end card: CONFIRMED (scene-3 frame composition repeated in 10).
11. No coherent hierarchy: CONFIRMED (label + paragraph template).
12. Grammar "not that misspellings are good strategy": CONFIRMED as an
    editorial issue. Accepted narration preserved verbatim; captions stay
    faithful (rewriting to hide it FAILS the integrity gate — covered by
    test).

## B. Root-cause report (smallest useful source locations)

- Titles overlap captions: one title+description template per scene;
  captions burned at top with no reserved regions and no collision check.
  Evidence: b9_33 review manifest scene_visual_spec; rendered frames
  (white band y~7).
- Single template for all scenes: no scene-type dispatch; communicates =
  label + full narration (same manifest). Committed precedent:
  buildScenePlan in utils/media-generation-service.js also emits
  label+prompt plans.
- Scene 5 rectangles: uncommitted renderer keyword-highlight boxes drawn
  without declared bounds. No committed code draws them — a
  reproducibility defect in itself.
- Scene 5/10 truncation: caption renderer used a fixed line/height budget
  that drops head or tail lines silently. SRT complete vs frames
  incomplete; no spill/split policy existed.
- No visual payloads anywhere: scene model has no visual-payload concept
  (production_scenes rows: label/scriptText/prompt only; scriptScenes()
  in utils/scene-repair-service.js).
- End card omittable: no end-card structure requirement anywhere; the CTA
  scene is marked assembled with no CTA checks.
- Success claimed without quality: review manifests are declarative
  booleans (visuals_explanatory: true) with no code enforcement.
- UNCOMMITTED RENDER PROCEDURE: the b9.31-b9.37 composition (cyan labels,
  burned captions, highlight boxes) was never committed; repository-wide
  search finds no drawtext/22d3ee code; the ai-video-generator.js
  slideshow path was not the render path. The committed replacement is
  utils/revision-render-pipeline.js.

## C. Phase A data-flow map (actual path, approved content to video)

1. data/scripts/1791719492789_script.json — generic template (NOT the
   final story).
2. agenttube-reference-lab/hosted-runs/b9-30-draft/revisions.json —
   revised narration segments + production labels (canonical transcript).
3. hosted-runs/b9-30-kokoro-final-recovery-…/retrieved/manifest.json —
   accepted narration: per-scene WAV + sha256 + durations (126.6s total).
4. data/captions/…_b9_37_narration.srt — one cue per scene
   (full-paragraph cues).
5. production_scenes DB rows — old template labels, scriptText, prompts.
6. b9.31-b9.37 render — EPHEMERAL composition (labels + paragraphs on
   black, burned captions) → draft MP4s + review JSONs + candidate index.
7. Committed services — SceneRepairService (scene CRUD/SRT/narration mix),

## D. Architecture changes (files)

- utils/scene-contract.js — typed visual payloads (9 types),
  metadata/content separation (HEADING_AUTO_FROM_LABEL,
  CARD_IS_LABEL_ONLY), debug-overlay rejection, unsupported-numeric
  rejection.
- utils/caption-contract.js — SRT parse/serialize, documented
  normalization, strict transcript coverage, scene mapping, lossless cue
  segmentation.
- utils/layout-engine.js — canonical 1920x1080 regions (heading/visual/
  annotations/bottom captions), >=100px margins, measured wrapping via
  headless Chromium (documented table fallback, backend recorded),
  collision checks with narrow semantic authorizations,
  density/font/canvas validation.
- utils/visual-planner.js — deterministic planner; story rules for all 10
  scenes using only transcript-exact fragments; buildStoryFactSheet
  records unresolved specifics (no invented strings/names/dates).
- utils/prerender-gate.js — 13 statuses; post-render stages always
  NOT_PERFORMED here; assertPass throws PRERENDER_GATE_FAILED;
  assessLegacyBundle honestly refuses PASS claims for legacy bundles.
- utils/renderers/backend-contract.js + motion-canvas-adapter.js —
  validated-contract input only, deterministic buildEnginePlan (stable
  sha256), activation boundary (disabled default; renderScene fails
  closed).
- utils/revision-render-pipeline.js — committed qualification entry:
  narration-hash verification, plan, layout-fitting cues, gate, engine
  plan artifacts. Renders nothing.
- utils/scene-repair-service.js — rebuild() now evaluates the gate:
  contract-governed bundles BLOCK on failure; legacy bundles get a
  recorded honest assessment; report persisted in assets.preRenderGate.
- scripts/b9-38-prerender-qualify.js — CLI qualification over real inputs.

## E. Engine research

- Motion Canvas (github motion-canvas/motion-canvas): cloned
  motion-canvas_motion-canvas, HEAD 7b91435c301d530351dcf5ebb91dd139c002e405
  (2026-07-02), MIT license (Copyright 2022 motion-canvas),
  @motion-canvas/core 3.17.2. Inspected: Txt/TxtLeaf (canvas font
  metrics: measureText + getBoundingClientRect DOM verification),
  packages/core/src/flow (sequence/chain/all/loop/waitFor scheduling),
  examples, existing tests. Role: primary 2D explanatory engine target;
  adapter implemented (validate-only, disabled by default).
- Exporters (github motion-canvas/exporters): cloned
  motion-canvas_exporters_v2, HEAD f08e8e30d6bfb69da4b65d63c6acc3f209f98a4f,
  MIT license, @motion-canvas/ffmpeg 1.1.1 (vite plugin; video settings
  export: mp4/webm/png sequence). Confirms assembly/encoding alignment
  with the existing FFmpeg pipeline (DECISION 2).
- Manim Community (github ManimCommunity/manim): cloned
  ManimCommunity_manim, HEAD 622520d34190062f32d68af066c80f1c937fc8bf
  (2026-10-13), MIT license (Copyright 2018 3Blue1Brown), version 0.22.0.
  Inspected: programmatic Scene/Mobject/Text(SVGMobject)/Tex,
  geometry/graphing/table modules, pytest suite.
  MANIM_STATUS = RESEARCHED_AND_CLONED; production adoption NOT justified
  (heavyweight Python/Cairo/LaTeX runtime; Motion Canvas covers the
  required 2D explanatory capabilities) — RESEARCHED_NOT_ADOPTED by
  default until a specialist requirement proves otherwise.
- The stale empty motion-canvas_exporters directory is an incomplete
  clone from an interrupted first attempt; the usable clone is
  motion-canvas_exporters_v2 (documented, preserved).

Note on measurement: the project real-text measurement uses headless
Chromium canvas measureText via the repo own Playwright dependency — the
same mechanism Motion Canvas itself uses in TxtLeaf. Character counts
are never the basis for layout in the repaired path.

## F. Test evidence

Command: for f in tests/*.test.js; do node "$f"; done (no video
renderer invoked by any test; suites exercise production functions
directly).

- All 13 pre-existing tests: PASS.
- 8 new suites, all PASS:
  - scene-contract.test.js — production labels cannot become viewer
    content; empty scenes fail; wrong payload types fail; debug overlay
    fails; missing CTA element fails; unsupported numerics fail.
  - caption-integrity.test.js — real b9_37 SRT passes coverage; missing
    final/prefix/middle words fail; rewriting spoken words fails; bad
    ordering/durations fail; empty cues fail; re-segmentation preserves
    all words; wrong-scene mapping fails; SRT round-trip stable.
  - layout-geometry.test.js — margin/collision/canvas/overflow/z-order/
    density/font failures; connector-behind-node authorized; real planned
    scene lays out clean with Chromium metrics.
  - visual-planner.test.js — all 10 real scenes plan and validate;
    scene 3/4/5/7/10 requirement types; no invented domain/year strings;
    unresolved claims explicit; invalid/invented fragments rejected.
  - prerender-gate.test.js — full gate PASSES on real inputs; post-render
    stages NOT_PERFORMED; missing payload, caption loss, missing backend
    all block with scene diagnostics; legacy bundles never claim PASS.
  - motion-canvas-adapter.test.js — valid contract maps (10-scene plan,
    end-card slot kept, deterministic sha); malformed/wrong-type/
    CTA-missing inputs fail specifically; disabled backend refuses;
    render refuses in all reachable configs.
  - narration-preservation.test.js — all 10 accepted WAV hashes match the
    manifest; transcript hashes intact; verbatim narration (grammar issue
    preserved, not rewritten); b9_37 baseline video hash unchanged.
  - prerender-service-wiring.test.js — the real production wiring
    (SceneRepairService.evaluatePreRenderGate) passes valid
    contract-governed bundles, blocks invalid ones with
    PRERENDER_GATE_FAILED, routes legacy rows honestly; the rebuild
    source contains the gate wiring — all without invoking a renderer.
- node test.js: 47/47 PASS. node qualification-tests.js: 5/5 PASS.
- npx eslint on all new/changed files: 0 errors (only pre-existing
  warnings remain elsewhere).
- CLI transcript:
  data/videos/review/b9_38_improvement/prerender/qualification_transcript.txt.
- Gate artifacts: prerender/scene_contracts, caption_cues, gate_report,
  engine_plan, fact_sheet, narration_hash_verification (.json).
- No MP4/rendered media was created during this run (filesystem check).

   AIVideoGenerator (slideshow w/ xfade, other flows),
   shorts-repurposing-service.js (shorts subtitle burn, bottom-aligned,

## G. Integration status

- Researched and source-inspected: Motion Canvas, exporters, Manim
  (revisions and licenses above).
- Implemented: scene/caption/layout contracts, semantic planner,
  pre-render gate, Motion Canvas adapter (validate-only), revision
  pipeline, production-path wiring, activation boundary.
- Qualified by tests: source compatibility, contract mapping, input
  validation, error propagation, deterministic plans, feature-flag
  behavior, no implicit activation.
- Awaiting a future authorized render phase: engine plan, rendered
  scenes, rendered comparison, visual review. No visual-superiority
  claim is made.

## H. Next-stage pre-render gate (current status)

Gate PASSED on the real production inputs (7/7 pre-render statuses;
measurement backend: chromium; narration preservation: verified;
engine plan sha starting 34bb321e). The next authorized render may
proceed only when a render-phase work order: (1) re-runs this
qualification on the frozen inputs, (2) renders representative scenes
via the Motion Canvas backend, (3) compares rendered frames against the
known-defect regression suite (collisions, clips, margins, end card),
(4) submits to human review. The backend remains disabled until then.

Open items / risks: the legacy slideshow path remains available to old
API flows with an explicit non-certification record (compatibility
boundary, not a bypass claim); historical specifics (domain strings,
dates) stay unresolved by editorial decision; no generative
image/video tooling was adopted (deliberately: it cannot fix
caption/layout defects).

## I. Preservation

- Git HEAD before/after: e26792ae00dc1ec2434faf32632896609396dfad
  (unchanged).
- Modified tracked files: utils/scene-repair-service.js only.
- New files: scene-contract, caption-contract, layout-engine,
  visual-planner, prerender-gate, revision-render-pipeline, renderers/
  (backend-contract, motion-canvas-adapter),
  scripts/b9-38-prerender-qualify.js, 8 test files, prerender artifacts
  plus this report.
- No staging/commits/resets; no overwrite of B9.30-B9.37 artifacts; no
  execution of phase5-inject.js; accepted narration and baseline hashes
  verified unchanged; no paid APIs, no credentials exposed, no local
  model inference, no GPU jobs.

## Final status declarations

ARCHITECTURE_IMPLEMENTED
MOTION_CANVAS_ADAPTER_IMPLEMENTED
MANIM_STATUS_RECORDED (RESEARCHED_AND_CLONED; production adoption not
justified = RESEARCHED_NOT_ADOPTED by default)
CAPTION_INTEGRITY_TESTS_PASSED
LAYOUT_VALIDATION_TESTS_PASSED
SCENE_PAYLOAD_VALIDATION_PASSED
PRE_RENDER_GATE_PASSED
VIDEO_RENDERED = NO
VISUAL_SUPERIORITY_ESTABLISHED = NO
HUMAN_REVIEW = PENDING

AUDIT_FINDINGS_CONFIRMED · ARCHITECTURE_IMPLEMENTED ·
ENGINE_RESEARCH_COMPLETE · ENGINE_SOURCE_INSPECTED ·
ADAPTER_IMPLEMENTED · NON_RENDERING_TESTS_PASSED ·
PRE_RENDER_GATE_PASSED · RENDERED_OUTPUT_VALIDATED = NOT PERFORMED ·
VISUAL_SUPERIORITY_ESTABLISHED = NOT PERFORMED · HUMAN_REVIEW = PENDING

   unrelated to the long-form defect).
