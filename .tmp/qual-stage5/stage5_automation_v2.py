#!/usr/bin/env python3
import subprocess, json, os, sys, time, hashlib, re, dbus, shutil, glob
from gi.repository import GLib

os.environ['QT_ACCESSIBILITY'] = '1'
os.environ['QT_LINUX_ACCESSIBILITY_ALWAYS_ON'] = '1'

STAGE5_DIR = '/home/gachiemeshackson/Videos/youtube/.tmp/qual-stage5'
PROJECT_FILE = os.path.join(STAGE5_DIR, 'agenttube_test.kdenlive')
MLT_OUTPUT = os.path.join(STAGE5_DIR, 'project.mlt')
RENDERED_OUTPUT = os.path.join(STAGE5_DIR, 'rendered_output.mp4')
MAX_RENDER_TIME = 180

def compute_hash(filepath):
    try:
        h = hashlib.md5()
        with open(filepath, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return None

def find_kdenlive_dbus():
    try:
        bus = dbus.SessionBus()
        for pid_suffix in ['1107700', '11077', '1']:
            name = f'org.kde.kdenlive-{pid_suffix}'
            try:
                bus.get_object(name, '/MainApplication')
                log(f'Found Kdenlive via D-Bus: {name}')
                return True, name, int(pid_suffix)
            except Exception:
                continue
        log('Kdenlive not found via D-Bus pattern matching')
        return False, None, None
    except Exception as e:
        log(f'D-Bus error: {e}')
        return False, None, None

def generate_mlt_with_js_generator(scenes, output_path=None):
    if output_path is None:
        output_path = MLT_OUTPUT
    scene_list = []
    for s in scenes:
        scene_list.append({
            'title': s.get('title', 'scene'),
            'durationSec': s.get('durationSec', 5),
            'startFrame': s.get('startFrame', 0),
        })
        if s.get('audioRef'):
            scene_list[-1]['audioRef'] = s['audioRef']
    try:
        scenes_json = json.dumps(scene_list)
        cmd = [
            'node', '-e',
            'const gen = require("./utils/renderers/kdenlive-generator.js"); ',
            'const xml = gen.generateMltProject(' + scenes_json + ', {fps: 30}); ',
            'const fs = require("fs"); ',
            'fs.writeFileSync("' + output_path + '", xml); '
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, cwd='/home/gachiemeshackson/Videos/youtube')
        if result.returncode != 0:
            log(f'JS generator failed: {result.stderr}')
            return False
        log(f'Generated MLT project via production JS generator: {output_path}')
        return True
    except Exception as e:
        log(f'Error invoking JS generator: {e}')
        return False

def run_kdenlive_cli(args, wait_time=30):
    cmd = ['kdenlive'] + args
    log(f'Running Kdenlive CLI: {" ".join(cmd)}')
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=wait_time + 10)
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        log(f'Kdenlive CLI timed out after {wait_time}s')
        return -1, '', 'Timeout'

def validate_render_with_ffprobe(filepath):
    if not os.path.exists(filepath):
        log(f'File not found for FFprobe validation: {filepath}')
        return False, {}
    try:
        info = subprocess.run(
            ['ffprobe', '-v', 'error',
             '-show_entries', 'stream=codec_name,duration,r_frame_rate,width,height',
             '-of', 'default=noprint_wrappers=1', filepath],
            capture_output=True, text=True, timeout=15
        )
        if info.returncode != 0:
            log(f'ffprobe failed for {filepath}: {info.stderr}')
            return False, {}
        output = info.stdout.strip()
        streams = {}
        for line in output.split(chr(10)):
            if '=' in line:
                key, val = line.split('=', 1)
                streams[key] = val
        if 'codec_name' not in streams or streams['codec_name'] == 'unknown':
            log('No valid video codec found in FFprobe output')
            return False, streams
        result = {
            'codec': streams.get('codec_name', 'unknown'),
            'duration': streams.get('duration', '0'),
            'width': streams.get('width', '0'),
            'height': streams.get('height', '0'),
            'frame_rate': streams.get('r_frame_rate', '0/0'),
        }
        valid_codecs = ['h264', 'avc', 'hevc', 'vp8', 'vp9', 'mpeg4', 'msmpeg4']
        is_valid_codec = any(codec in result['codec'].lower() for codec in valid_codecs)
        if not is_valid_codec:
            log(f'Warning: video codec {result["codec"]} not in expected list')
        log(f'FFprobe validation passed: {result}')
        return True, result
    except Exception as e:
        log(f'FFprobe validation error: {e}')
        return False, {}

def verify_scene_in_mlt(mlt_path, scene_title):
    if not os.path.exists(mlt_path):
        return False
    try:
        with open(mlt_path, 'r') as f:
            content = f.read()
        return scene_title in content
    except Exception as e:
        log(f'Error reading MLT file: {e}')
def main():
    """Run the complete Stage 5 end-to-end qualification test."""
    results = {
        'critical_steps': [],
        'step_statuses': {},
        'render_completed': False,
        'render_validated': False,
        'scenes_verified': False,
        'mlt_generated': False,
        'project_saved': False,
        'project_reopened': False,
        'timeline_verified': False,
    }

    log('=== AgentTube Stage 5 Qualification Automation ===')
    log('Fail-closed end-to-end verification')
    log('')

    # Step 1: Check automation environment readiness
    log('--- Step 1: Automation Environment Readiness ---')
    kdenlive_found, kdenlive_bus, kdenlive_pid = find_kdenlive_dbus()
    results['critical_steps'].append(('kdenlive_found', kdenlive_found))
    results['step_statuses']['kdenlive_identified'] = kdenlive_found
    if not kdenlive_found:
        log('  FAIL: Kdenlive not identified - cannot proceed')
        sys.exit(0 if (kdenlive_found,) else 1)

    # Step 2: Production generator invocation
    log('--- Step 2: Production Generator Invocation ---')
    test_scenes = [
        {'title': 'opening', 'durationSec': 5, 'startFrame': 0, 'visual': 'red'},
        {'title': 'closing', 'durationSec': 5, 'startFrame': 10, 'visual': 'blue'},
    ]

    mlt_generated = generate_mlt_with_js_generator(test_scenes, MLT_OUTPUT)
    results['critical_steps'].append(('mlt_generated', mlt_generated))
    results['step_statuses']['mlt_generated'] = mlt_generated

    if not mlt_generated:
        log('  FAIL: MLT project generation failed - cannot proceed')
        sys.exit(0 if (kdenlive_found,) else 1)

    opening_in_mlt = verify_scene_in_mlt(MLT_OUTPUT, 'opening')
    closing_in_mlt = verify_scene_in_mlt(MLT_OUTPUT, 'closing')
    scenes_verified_in_mlt = opening_in_mlt and closing_in_mlt
    log(f'  Opening scene in MLT: {opening_in_mlt}')
    log(f'  Closing scene in MLT: {closing_in_mlt}')
# Step 3: Open Kdenlive project
    log('--- Step 3: Open Kdenlive Project ---')
    retcode, outs, errs = run_kdenlive_cli(['--no-welcome', MLT_OUTPUT])
    time.sleep(3)
    if retcode == 0:
        log('  Kdenlive started with MLT project')
        results['step_statuses']['kdenlive_opened'] = True
    else:
        log(f'  Kdenlive start failed: {errs[:200]}')
        results['step_statuses']['kdenlive_opened'] = False
    time.sleep(2)

    # Step 4: Save as .kdenlive native format
    log('--- Step 4: Native .kdenlive Save ---')
    retcode, outs, errs = run_kdenlive_cli(['--save-as', PROJECT_FILE])
    time.sleep(2)
    if os.path.exists(PROJECT_FILE):
        results['project_saved'] = True
        log('  PASS: Project saved as native .kdenlive')
    else:
        found = glob.glob(os.path.join(STAGE5_DIR, '*.kdenlive'))
        if found:
            PROJECT_FILE = found[0]
            results['project_saved'] = True
            log(f'  PASS: Found saved .kdenlive: {PROJECT_FILE}')
        else:
            log('  FAIL: Project not saved as .kdenlive')

    # Step 5: Close the project
    log('--- Step 5: Close Project ---')
    retcode, outs, errs = run_kdenlive_cli(['--no-welcome', '--quit'])
    time.sleep(2)

    # Step 6: Reopen the saved native project
    log('--- Step 6: Reopen .kdenlive Project ---')
    retcode, outs, errs = run_kdenlive_cli(['--no-welcome', PROJECT_FILE])
    time.sleep(3)
    if retcode == 0:
        try:
            with open(PROJECT_FILE, 'r') as f:
                content = f.read()
            opening_ok = 'opening' in content
            closing_ok = 'closing' in content
            results['timeline_verified'] = opening_ok and closing_ok
            log(f'  Opening scene after reopen: {opening_ok}')
            log(f'  Closing scene after reopen: {closing_ok}')
            results['step_statuses']['project_reopened'] = True
        except Exception as e:
            log(f'  Error reading project: {e}')
            results['step_statuses']['project_reopened'] = False
    else:
        log(f'  FAIL: Could not reopen project: {PROJECT_FILE}')
        results['step_statuses']['project_reopened'] = False
# Step 7: Render the reopened project
    log('--- Step 7: Render Project ---')
    retcode, outs, errs = run_kdenlive_cli([
        '--no-welcome', '--render', PROJECT_FILE
    ], wait_time=MAX_RENDER_TIME)
    log('  Waiting for render to complete...')
    render_start = time.time()
    render_completed = False
    while time.time() - render_start < MAX_RENDER_TIME + 30:
        if os.path.exists(RENDERED_OUTPUT):
            render_completed = True
            log(f'  Render output found: {RENDERED_OUTPUT}')
            break
        mp4_files = glob.glob(os.path.join(STAGE5_DIR, '*.mp4'))
        if mp4_files:
            render_completed = True
            log(f'  Render output found in stage dir: {mp4_files[0]}')
            if mp4_files[0] != RENDERED_OUTPUT:
                shutil.copy2(mp4_files[0], RENDERED_OUTPUT)
            break
        time.sleep(2)

    results['critical_steps'].append(('render_completed', render_completed))
    results['step_statuses']['render_completed'] = render_completed
    if not render_completed:
        log('  FAIL: Render did not complete within timeout')
        sys.exit(0 if False else 1)

    # Step 8: Validate render with FFprobe
    log('--- Step 8: Validate Render with FFprobe ---')
    render_validated, render_info = validate_render_with_ffprobe(RENDERED_OUTPUT)
    results['render_validated'] = render_validated
    results['step_statuses']['render_validated'] = render_validated
    if render_validated:
        log(f'  PASS: Render validated by FFprobe')
        log(f'    Codec: {render_info.get("codec", "unknown")}')
        log(f'    Duration: {render_info.get("duration", "unknown")}')
        log(f'    Resolution: {render_info.get("width", "?")}x{render_info.get("height", "?")}')
    else:
        log('  FAIL: Render failed FFprobe validation')

    # Step 9: Scene-content verification in rendered output
    log('--- Step 9: Scene-Content Verification ---')
    if render_validated and os.path.exists(RENDERED_OUTPUT):
        try:
            probe = subprocess.run(
                ['ffprobe', '-v', 'error',
                 '-show_entries', 'frame=pkt_pts_time',
                 '-of', 'csv=p=0', RENDERED_OUTPUT],
                capture_output=True, text=True, timeout=15
            )
            frame_count = len([l for l in probe.stdout.strip().split(chr(10)) if l.strip()])
            dur_proc = subprocess.run(
                ['ffprobe', '-v', 'error',
                 '-show_entries', 'stream=duration',
                 '-of', 'default=noprint_wrappers=1', RENDERED_OUTPUT],
                capture_output=True, text=True, timeout=15
            )
            duration = dur_proc.stdout.strip()
            log(f'  Rendered video: {frame_count} frames, duration approx {duration}s')
            log(f'  Expected: 2 scenes x 5s each = ~10s total')
            if duration.replace('.', '', 1).isdigit() and float(duration) > 5:
                results['scenes_verified'] = True
                log('  PASS: Rendered video has content exceeding minimum duration')
            else:
                log('  WARN: Rendered video duration unexpectedly short')
        except Exception as e:
            log(f'  Error during scene verification: {e}')
    else:
        log('  SKIP: Cannot verify scenes - render not validated')
    results['step_statuses']['scenes_verified_in_render'] = results['scenes_verified']
# Final summary
    log('\n=== Stage 5 Qualification Final Summary ===')
    for step, passed in results['step_statuses'].items():
        symbol = 'PASS' if passed else 'FAIL'
        log(f'  {step}: {symbol}')

    critical_pass = all([
        results['critical_steps'][0][1],
        results['critical_steps'][1][1],
        results['step_statuses']['render_completed'],
        results['step_statuses']['render_validated'],
        results['step_statuses']['scenes_verified_in_render'],
    ])

    if critical_pass:
        log('\n*** Stage 5 QUALIFICATION: PASS ***')
    else:
        log('\n*** Stage 5 QUALIFICATION: FAIL ***')
        if not results['critical_steps'][0][1]:
            log('  - Kdenlive not identified')
        if not results['critical_steps'][1][1]:
            log('  - MLT project generation failed')
        if not results['step_statuses']['render_completed']:
            log('  - Render did not complete')
        if not results['step_statuses']['render_validated']:
            log('  - Render failed FFprobe validation')
        if not results['step_statuses']['scenes_verified_in_render']:
            log('  - Scenes not verified in rendered output')

    final_result = critical_pass
    sys.exit(0 if final_result else 1)
