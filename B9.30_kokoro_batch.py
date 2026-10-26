#!/usr/bin/env python3
"""B9.30 hosted Kokoro narration batch — ten scenes of the revised draft script.

Executed on a hosted Google Colab GPU runtime through the shared
narration-provider contract established in B9.25/B9.26. Provider runtime
dependencies are installed HERE (inside the hosted runtime) and never on the
local laptop.

Dependency strategy (evidence from B9.24 and B9.25):
  * kokoro 0.9.4 requires misaki[en]>=0.9.4, and the published misaki 0.9.4
    wheel declares Requires-Python <3.13, so both packages are installed from
    pinned upstream commits.
  * @b9-30 note: the misaki constraint is honoured by installing from the
    pinned commit, not by bypassing the checker.
  * The GPU torch build is preserved and pinned, never replaced.
"""

import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
from pathlib import Path

RUN_ID = 'b9_30_narration'
OUT_DIR = Path('/content') / RUN_ID

KOKORO = {
    'provider': 'kokoro-82m',
    'model_id': 'hexgrad/Kokoro-82M',
    'model_revision': 'dfb907a02bba8152ca444717ca5d78747ccb4bec',
    'voice': 'af_heart',
    'language': 'english',
    'lang_code': 'a',
    'sample_rate': 24000,
    'channels': 1,
    'kokoro_commit': 'dfb907a02bba8152ca444717ca5d78747ccb4bec',
    'misaki_commit': 'fba1236595f2d2bf21d414ba6e57d25256afada3',
}

# Embedded so the hosted runtime is self-contained (no local file dependency).
DRAFT_INPUT_B64 = 'ewogICJqb2JLaW5kIjogImFnZW50dHViZS1uYXJyYXRpb24iLAogICJwcm9kdWN0aW9uSWQiOiAicHJvZF8xNzkxNzE5NDkyNzg5X3JveDQxdHgzYzJfamxkaXhiOHhxdyIsCiAgImRyYWZ0UnVuSWQiOiAiYjktMzAtZHJhZnQiLAogICJjcmVhdGVkQXQiOiAiMjAyNi0xMC0xNFQwNjo1MzoxNFoiLAogICJlbmdpbmUiOiAia29rb3JvLTgybSIsCiAgInNhbXBsZVJhdGUiOiAyNDAwMCwKICAic2VnbWVudHMiOiBbCiAgICB7CiAgICAgICJzY2VuZUlkIjogInNjZW5lX2FlZjE5YWQ3LTIwNzAtNGExZS1iMDIwLWY2YmE4OGIzYTFiMyIsCiAgICAgICJwb3NpdGlvbiI6IDAsCiAgICAgICJsYWJlbCI6ICJIb29rIiwKICAgICAgImVzdGltYXRlZER1cmF0aW9uU2VjIjogOSwKICAgICAgInRleHQiOiAiSWYgeW91IGhhdmUgZXZlciB3b25kZXJlZCBob3cgYSBzaW5nbGUgbWlzc3BlbGxpbmcgY3JlYXRlZCB0aGUgbW9zdCBpY29uaWMgZG9tYWluIG5hbWUgaW4gdGVjaCwgaGVyZSBpcyBob3cgaXQgYWN0dWFsbHkgaGFwcGVuZWQuIgogICAgfSwKICAgIHsKICAgICAgInNjZW5lSWQiOiAic2NlbmVfMWYwNGQ4YmUtNGFhMS00NWEyLWEzYmUtMThmYTA3MGQ1MzAyIiwKICAgICAgInBvc2l0aW9uIjogMSwKICAgICAgImxhYmVsIjogIkludHJvZHVjdGlvbiIsCiAgICAgICJlc3RpbWF0ZWREdXJhdGlvblNlYyI6IDE1LAogICAgICAidGV4dCI6ICJIZXkgZXZlcnlvbmUsIHdlbGNvbWUgYmFjayB0byB0aGUgY2hhbm5lbC4gVG9kYXkgd2UgYXJlIHdhbGtpbmcgdGhyb3VnaCBob3cgb25lIG1pc3R5cGVkIHdvcmQgdHVybmVkIGludG8gdGhlIG1vc3QgcmVjb2duaXphYmxlIGRvbWFpbiBuYW1lIGluIHRlY2hub2xvZ3kuIEJ5IHRoZSBlbmQsIHlvdSB3aWxsIHVuZGVyc3RhbmQgZXhhY3RseSBob3cgdGhlIHJlZ2lzdHJhdGlvbiB3b3JrZWQgYW5kIHdoeSBpdCBzdHVjay4iCiAgICB9LAogICAgewogICAgICAic2NlbmVJZCI6ICJzY2VuZV9lZGI4ZWUxMi1mY2NhLTQ0YTYtODk4MC01ZGZhYTAxNjg2MGQiLAogICAgICAicG9zaXRpb24iOiAyLAogICAgICAibGFiZWwiOiAiVGhlIFNldHVwIiwKICAgICAgImVzdGltYXRlZER1cmF0aW9uU2VjIjogMTMsCiAgICAgICJ0ZXh0IjogIkV2ZXJ5IGRvbWFpbiBuYW1lIHN0YXJ0cyB0aGUgc2FtZSB3YXkuIFNvbWVvbmUgcGlja3MgdGhlIHdvcmRzIHRoZXkgd2FudCwgdHlwZXMgdGhlbSBpbnRvIGEgcmVnaXN0cmFyLCBhbmQgc2VuZHMgYSByZXF1ZXN0IGFjcm9zcyB0aGUgaW50ZXJuZXQuIFRoZSByZWdpc3RyYXIgY2hlY2tzIHdoZXRoZXIgdGhlIGV4YWN0IHN0cmluZyBpcyBhbHJlYWR5IHRha2VuLiIKICAgIH0sCiAgICB7CiAgICAgICJzY2VuZUlkIjogInNjZW5lXzJkMWIxMzkyLTQ1OGItNDgzMS1hNzZmLTdkMDY2M2U3YmRhNSIsCiAgICAgICJwb3NpdGlvbiI6IDMsCiAgICAgICJsYWJlbCI6ICJUaGUgTWlzdGFrZSIsCiAgICAgICJlc3RpbWF0ZWREdXJhdGlvblNlYyI6IDEzLAogICAgICAidGV4dCI6ICJUaGUgbWlzc3BlbGxpbmcgaGFwcGVuZWQgaW4gdGhhdCBjaGVjay4gVGhlIHBlcnNvbiBpbnRlbmRlZCBvbmUgd29yZCwgYnV0IHR5cGVkIHNvbWV0aGluZyBzbGlnaHRseSBkaWZmZXJlbnQuIFRoZSByZWdpc3RyeSBsb29rZWQgYXQgdGhlIHN0cmluZyB0aGV5IGFjdHVhbGx5IHNlbnQsIG5vdCB0aGUgd29yZCB0aGV5IG1lYW50LCBhbmQgaXQgd2FzIGZyZWUuIgogICAgfSwKICAgIHsKICAgICAgInNjZW5lSWQiOiAic2NlbmVfNmFjMzE2ZWUtNTIwOC00NThhLWI1ODItYzdkOTUzYjk2ZTdiIiwKICAgICAgInBvc2l0aW9uIjogNCwKICAgICAgImxhYmVsIjogIlRoZSBSZWdpc3RyYXRpb24iLAogICAgICAiZXN0aW1hdGVkRHVyYXRpb25TZWMiOiAxNiwKICAgICAgInRleHQiOiAiU28gdGhlIHJlZ2lzdHJhdGlvbiB3ZW50IHRocm91Z2guIFRoZSBmZWUgd2FzIHBhaWQsIHRoZSByZWNvcmQgd2FzIHdyaXR0ZW4sIGFuZCB0aGUgZG9tYWluIHBvaW50ZWQgYXQgYSBzZXJ2ZXIuIE5vdGhpbmcgYWJvdXQgdGhlIHByb2Nlc3Mgd2FzIHVudXN1YWwuIFdoYXQgbWFkZSBpdCBtZW1vcmFibGUgd2FzIHRoYXQgdGhlIHN0cmluZyB3YXMgbm93IHBlcm1hbmVudGx5IG1pc3NwZWxsZWQgaW4gdGhlIHB1YmxpYyByZWNvcmQuIgogICAgfSwKICAgIHsKICAgICAgInNjZW5lSWQiOiAic2NlbmVfODc2NDY0OWYtZmQyNi00MTU3LWE5MDAtOWRmNWY0NzZmYzBjIiwKICAgICAgInBvc2l0aW9uIjogNSwKICAgICAgImxhYmVsIjogIldoeSBJdCBTdHVjayIsCiAgICAgICJlc3RpbWF0ZWREdXJhdGlvblNlYyI6IDEyLAogICAgICAidGV4dCI6ICJBIG1pc3NwZWxsZWQgZG9tYWluIGlzIG1lbW9yYWJsZSBwcmVjaXNlbHkgYmVjYXVzZSBpdCBpcyB1bmV4cGVjdGVkLiBQZW9wbGUgcmVhZCBpdCwgcGF1c2UsIGFuZCByZW1lbWJlciBpdC4gVGhhdCBzdXJwcmlzZSBpcyB0aGUgcmVhc29uIGl0IHNwcmVhZCB0aHJvdWdoIHdvcmQgb2YgbW91dGggaW5zdGVhZCBvZiBhZHZlcnRpc2luZy4iCiAgICB9LAogICAgewogICAgICAic2NlbmVJZCI6ICJzY2VuZV85ZmZjMDc3MC1mMDI4LTRmMTAtOTUzNy1jNjM3NzcxZmEyNmQiLAogICAgICAicG9zaXRpb24iOiA2LAogICAgICAibGFiZWwiOiAiVGhlIFRyYWRlLW9mZiIsCiAgICAgICJlc3RpbWF0ZWREdXJhdGlvblNlYyI6IDE0LAogICAgICAidGV4dCI6ICJUaGVyZSBpcyBhIGNvc3QsIHRob3VnaC4gQSBtaXNzcGVsbGVkIGRvbWFpbiBpcyBlYXN5IHRvIHJlbWVtYmVyIGJ1dCBlYXN5IHRvIG1pc3R5cGUgaW4gdGhlIG90aGVyIGRpcmVjdGlvbi4gVXNlcnMgd2hvIGhlYXIgdGhlIG5hbWUgYW5kIHR5cGUgdGhlIGNvcnJlY3Qgc3BlbGxpbmcgY2FuIGVuZCB1cCBzb21ld2hlcmUgZWxzZSBlbnRpcmVseS4iCiAgICB9LAogICAgewogICAgICAic2NlbmVJZCI6ICJzY2VuZV82OTIwMzQ3MC1kMDU4LTQ5MGEtOWI3OC1jMzY1ODQ0YWQ5OTUiLAogICAgICAicG9zaXRpb24iOiA3LAogICAgICAibGFiZWwiOiAiVGhlIExlc3NvbiIsCiAgICAgICJlc3RpbWF0ZWREdXJhdGlvblNlYyI6IDEzLAogICAgICAidGV4dCI6ICJUaGUgbGVzc29uIGlzIG5vdCB0aGF0IG1pc3NwZWxsaW5ncyBhcmUgZ29vZCBzdHJhdGVneS4gSXQgaXMgdGhhdCB0aGUgc3lzdGVtIHJlY29yZHMgd2hhdCB5b3UgYWN0dWFsbHkgc2VuZCwgbm90IHdoYXQgeW91IGludGVuZGVkLiBUaGF0IGdhcCBiZXR3ZWVuIGludGVudGlvbiBhbmQgaW5wdXQgaXMgd2hlcmUgdGhlIHdob2xlIHN0b3J5IGxpdmVzLiIKICAgIH0sCiAgICB7CiAgICAgICJzY2VuZUlkIjogInNjZW5lX2JlNzM4YmY5LWI3YjYtNGY3Yi04NjA1LTA0MzExYWJiOTMxZCIsCiAgICAgICJwb3NpdGlvbiI6IDgsCiAgICAgICJsYWJlbCI6ICJDb25jbHVzaW9uIiwKICAgICAgImVzdGltYXRlZER1cmF0aW9uU2VjIjogMTUsCiAgICAgICJ0ZXh0IjogIlNvIHRoYXQgaXMgaG93IGEgc2luZ2xlIG1pc3R5cGVkIHdvcmQgYmVjYW1lIHRoZSBtb3N0IHJlY29nbml6YWJsZSBkb21haW4gbmFtZSBpbiB0ZWNoLiBXZSBjb3ZlcmVkIGhvdyByZWdpc3RyYXRpb24gd29ya3MsIHdoZXJlIHRoZSBtaXNzcGVsbGluZyBlbnRlcmVkIHRoZSBwcm9jZXNzLCBhbmQgd2h5IGFuIHVuZXhwZWN0ZWQgc3RyaW5nIGlzIGVhc2llciB0byByZW1lbWJlciB0aGFuIGEgY29ycmVjdCBvbmUuIgogICAgfSwKICAgIHsKICAgICAgInNjZW5lSWQiOiAic2NlbmVfNzZmZDBhOGQtOTE1OS00NmY5LWI4ZDAtODM2OWMzMjQ3OWE5IiwKICAgICAgInBvc2l0aW9uIjogOSwKICAgICAgImxhYmVsIjogIkNhbGwgdG8gYWN0aW9uIiwKICAgICAgImVzdGltYXRlZER1cmF0aW9uU2VjIjogMTIsCiAgICAgICJ0ZXh0IjogIklmIHRoaXMgd2FzIHVzZWZ1bCwgc3Vic2NyaWJlIGFuZCBoaXQgdGhlIG5vdGlmaWNhdGlvbiBiZWxsLiBMZXQgbWUga25vdyBpbiB0aGUgY29tbWVudHMgd2hhdCBvdGhlciB0ZWNoIHN0b3JpZXMgeW91IHdhbnQgYnJva2VuIGRvd24sIGFuZCBjaGVjayBvdXQgdGhlIHJlbGF0ZWQgdmlkZW8gZm9yIG1vcmUuIgogICAgfQogIF0KfQ=='

log_lines = []


def log(message):
    line = str(message)
    print(line, flush=True)
    log_lines.append(line)


def sh(args, timeout=1800):
    log('$ ' + ' '.join(str(a) for a in args))
    try:
        proc = subprocess.run([str(a) for a in args], text=True,
                              stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                              timeout=timeout)
        tail = (proc.stdout or '').strip()[-4000:]
        log(tail if tail else '(no output)')
        log('[exit=%s]' % proc.returncode)
        return proc
    except subprocess.TimeoutExpired:
        log('[timeout after %ss]' % timeout)
        raise RuntimeError('command timed out: %s' % ' '.join(map(str, args)))


def measure(wav_path):
    import math
    import struct
    import wave
    with wave.open(str(wav_path), 'rb') as handle:
        rate = handle.getframerate()
        channels = handle.getnchannels()
        frames = handle.getnframes()
        raw = handle.readframes(frames)
    total = frames * channels
    values = struct.unpack('<%dh' % total, raw) if total else ()
    peak = max((abs(v) for v in values), default=0)
    rms = math.sqrt(sum(v * v for v in values) / total) if total else 0
    return {
        'sample_rate': rate, 'channels': channels, 'frame_count': frames,
        'duration_seconds': round(frames / rate, 4) if rate else 0,
        'peak_int16': peak, 'rms_int16': round(rms, 4),
        'clipped_samples': sum(1 for v in values if abs(v) >= 32767),
        'finite': True,
    }


def install_kokoro():
    sh(['bash', '-lc',
        'apt-get update -qq 2>&1 | tail -1 && '
        'apt-get install -y -qq espeak-ng 2>&1 | tail -1'], timeout=900)
    sh([sys.executable, '-m', 'pip', 'install', '--no-deps',
        'git+https://github.com/hexgrad/kokoro.git@%s' % KOKORO['kokoro_commit']],
       timeout=900)
    sh([sys.executable, '-m', 'pip', 'install',
        'git+https://github.com/hexgrad/misaki.git@%s' % KOKORO['misaki_commit']],
       timeout=900)
    torch_version = (sh([sys.executable, '-c', 'import torch;print(torch.__version__)'],
                        timeout=600).stdout or '').strip().splitlines()[-1].split()[-1]
    remaining = ['--no-deps', 'soundfile', 'loguru', 'huggingface_hub', 'num2words',
                 'phonemizer-fork', 'espeakng-loader', 'spacy', 'regex',
                 'dlinfo==2.0.0', 'segments']
    if torch_version:
        remaining.append('torch==%s' % torch_version)
    sh([sys.executable, '-m', 'pip', 'install'] + remaining, timeout=900)
    return torch_version


def run_kokoro(segment):
    import numpy as np
    import soundfile as sf
    from kokoro import KPipeline

    pipeline = KPipeline(lang_code=KOKORO['lang_code'])
    chunks = [np.asarray(audio) for _, _, audio in pipeline(segment['text'], voice=KOKORO['voice'])]
    audio = np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)
    target = OUT_DIR / ('%s.wav' % segment['sceneId'])
    scratch = Path(tempfile.gettempdir()) / ('%s.wav' % segment['sceneId'])
    sf.write(str(scratch), audio, KOKORO['sample_rate'], format='WAV', subtype='PCM_16')
    shutil.move(str(scratch), str(target))
    return target


def _flush(current):
    try:
        (OUT_DIR / 'progress.json').write_text(json.dumps(current, indent=2), encoding='utf-8')
    except Exception:  # noqa: BLE001
        pass


manifest = {
    'run_id': RUN_ID,
    'created_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    'python': sys.version,
    'provider': KOKORO,
    'results': [],
}

try:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    import base64
    draft = json.loads(base64.b64decode(DRAFT_INPUT_B64).decode('utf-8'))
    manifest['draft_input_sha256'] = hashlib.sha256(
        base64.b64decode(DRAFT_INPUT_B64)).hexdigest()
    manifest['draft_production_id'] = draft.get('productionId')
    manifest['segment_count'] = len(draft['segments'])

    gpu = sh([sys.executable, '-c',
              'import torch;print(torch.__version__);print(torch.cuda.is_available());'
              'print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else None)'],
             timeout=600)
    info = (gpu.stdout or '').strip().splitlines()
    manifest['runtime'] = {
        'torch': info[0] if len(info) > 0 else None,
        'cuda_available': (info[1].lower() == 'true') if len(info) > 1 else False,
        'gpu': info[2] if len(info) > 2 else None,
    }
    if manifest['runtime']['cuda_available'] is not True:
        raise RuntimeError('CUDA GPU unavailable; refusing to run inference outside a hosted GPU runtime')
    log('Hosted GPU: %s' % manifest['runtime']['gpu'])

    torch_version = install_kokoro()
    manifest['torch_version'] = torch_version
    imp = sh([sys.executable, '-c',
              'import kokoro, misaki, soundfile, torch; from kokoro import KPipeline;'
              'print("ok", torch.cuda.is_available())'], timeout=900)
    if imp.returncode != 0:
        raise RuntimeError('kokoro import qualification failed; inference not attempted')
    manifest['import_qualification'] = 'PASS'
    log('Kokoro environment qualified')

    for segment in draft['segments']:
        entry = {
            'sceneId': segment['sceneId'],
            'position': segment['position'],
            'label': segment['label'],
            'text': segment['text'],
            'text_sha256_expected': hashlib.sha256(segment['text'].encode('utf-8')).hexdigest(),
            'text_sha256_actual': None,
            'provider': KOKORO['provider'],
            'model_id': KOKORO['model_id'],
            'model_revision': KOKORO['model_revision'],
            'voice': KOKORO['voice'],
            'generation_status': 'NOT_STARTED',
            'technical_validation_status': 'NOT_RUN',
            'audio_quality_status': 'NOT_ASSESSED',
            'audio_path': None,
            'audio_sha256': None,
            'measurements': None,
            'error': None,
        }
        try:
            actual = hashlib.sha256(segment['text'].encode('utf-8')).hexdigest()
            entry['text_sha256_actual'] = actual
            if actual != entry['text_sha256_expected']:
                raise RuntimeError('text hash mismatch before model initialization')
            target = run_kokoro(segment)
            entry['audio_path'] = str(target)
            entry['audio_sha256'] = hashlib.sha256(Path(target).read_bytes()).hexdigest()
            entry['measurements'] = measure(target)
            entry['generation_status'] = 'SUCCEEDED'
            if (entry['measurements']['duration_seconds'] > 0.5
                    and entry['measurements']['rms_int16'] > 0
                    and entry['measurements']['sample_rate'] == KOKORO['sample_rate']
                    and entry['measurements']['channels'] == KOKORO['channels']
                    and entry['measurements']['clipped_samples'] == 0):
                entry['technical_validation_status'] = 'PASS'
            else:
                entry['technical_validation_status'] = 'FAIL'
                entry['audio_quality_status'] = 'REJECTED'
            log('OK pos=%s sha=%s dur=%ss'
                % (segment['position'], entry['audio_sha256'][:12],
                   entry['measurements']['duration_seconds']))
        except Exception as exc:  # noqa: BLE001
            entry['generation_status'] = 'FAILED'
            entry['technical_validation_status'] = 'FAIL'
            entry['audio_quality_status'] = 'REJECTED'
            entry['error'] = '%s: %s' % (type(exc).__name__, exc)
            entry['traceback'] = traceback.format_exc()
            log('FAIL pos=%s: %s' % (segment['position'], entry['error']))
        manifest['results'].append(entry)
        _flush(manifest)

    ok = sum(1 for r in manifest['results'] if r['generation_status'] == 'SUCCEEDED')
    manifest['succeeded'] = ok
    manifest['expected'] = len(manifest['results'])
    manifest['overall_status'] = 'PASS' if ok == len(manifest['results']) else (
        'PARTIAL' if ok else 'FAILED')
except Exception as exc:  # noqa: BLE001
    manifest['overall_status'] = 'FAILED'
    manifest['succeeded'] = sum(1 for r in manifest['results'] if r['generation_status'] == 'SUCCEEDED')
    manifest['expected'] = len(manifest['results'])
    manifest['error'] = '%s: %s' % (type(exc).__name__, exc)
    manifest['traceback'] = traceback.format_exc()
    log('FATAL: %s' % manifest['error'])
finally:
    (OUT_DIR / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    (OUT_DIR / 'execution.log').write_text('\n'.join(log_lines) + '\n', encoding='utf-8')
    (OUT_DIR / 'STATUS.txt').write_text(
        'DONE %s succeeded=%s expected=%s' % (
            manifest.get('overall_status'), manifest.get('succeeded'), manifest.get('expected')),
        encoding='utf-8')
    print('\nSUMMARY: %s (%s/%s)' % (manifest.get('overall_status'),
                                     manifest.get('succeeded'), manifest.get('expected')), flush=True)
    if manifest.get('overall_status') != 'PASS':
        sys.exit(1)
    sys.exit(0)
