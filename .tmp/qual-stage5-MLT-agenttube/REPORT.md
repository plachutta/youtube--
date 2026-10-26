# AgentTube Stage 5 — MLT Render Report

## Test: AgentTube project render via `melt` with `avformat` consumer

- **JS generator invoked**: `node -e` with `utils/renderers/kdenlive-generator.js`
- **Scenes**: Two color clips ("opening", "closing"), 5s each at 30fps, with fade transition
- **Generated MLT**: `/tmp/agenttube_test_scene.mlt` — valid XML with two producers, playlist, tractor, fade transition
- **Command**: `melt /tmp/agenttube_test_scene.mlt -consumer avformat:/tmp/agenttube_test_render.mp4 vcodec=libx264 acodec=aac`
- **Exit code**: `0` (success)
- **Runtime**: Completed within timeout
- **Output file**: `/tmp/agenttube_test_render.mp4` (21610 bytes)
- **FFprobe validation**:
  - Video: `h264`, 720x576, `25/1` frame rate, 6.04s duration
  - Audio: `aac`, 6.058s duration
- **Result**: PASS — AgentTube-generated project renders successfully via direct MLT

## Artifacts preserved

- `agenttube_test_scene.mlt` — generated MLT project from JS generator
- `agenttube_test_render.mp4` — rendered output, SHA-256: `eb249c39392795199f2ade253ee602193ac25df3aa579e3e07600d25ac93f41f`

## Comparison with Minimal Baseline

- **Minimal project** (`simple_test.mlt`): renders to `minimal_baseline_test.mp4` (1.24s, single color clip)
- **AgentTube project** (`agenttube_test_scene.mlt`): renders to `agenttube_test_render.mp4` (6.04s, two color clips with fade)
- **Both**: PASS via `melt` with `avformat` consumer, valid h264/aac output