# Kdenlive CLI Hang Diagnostics

## Observed Failure Mode
- **Symptom**: `kdenlive --render` invocation does not complete; process appears to hang
- **Timeout behavior**: 30-second test timeout triggers; 60-second test also times out
- **Platform variants**: Hang occurs both in default Wayland session and with `QT_QPA_PLATFORM=offscreen`
- **Exit code**: Process terminated by timeout (exit code 124 or 1 signal-based)

## Diagnostic Tests Performed

### Test 1: Wayland Session
```
Command: kdenlive --no-welcome --render project.kdenlive /tmp/wayland_test.mp4
Result: Timeout after ~30s, no MP4 output produced
```

### Test 2: Offscreen Platform
```
Command: QT_QPA_PLATFORM=offscreen kdenlive --no-welcome --render project.kdenlive /tmp/offscreen_test.mp4
Result: Timeout after ~30s, no MP4 output produced
```
- **Significance**: Confirms the hang is NOT Wayland-specific; it's a fundamental Kdenlive CLI issue

### Test 3: melt Render (Baseline)
```
Command: melt agenttube-project.mlt -consumer avformat:/tmp/baseline.mp4 vcodec=libx264 acodec=aac
Result: Exit code 0, valid MP4 produced
FFprobe: video=h264 720x576 25fps 12.04s, audio=aac 12.05s
```

## Root Cause Analysis
The Kdenlive `--render` CLI hang persists regardless of the Qt platform backend (Wayland or offscreen). This indicates:
- The issue is not specific to Wayland integration
- The MLT rendering engine (melt) works correctly independently
- The blocker is in Kdenlive's CLI rendering pathway, not the underlying rendering engine
- Further investigation would require Kdenlive source-level debugging or a working GUI automation path

## Verified Workaround
- Use `melt` directly with proper MLT project files and configuration
- `melt-7` with `avformat` consumer produces valid MP4 output from both minimal and AgentTube-generated projects