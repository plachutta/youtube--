#!/usr/bin/env python3
"""B9.23 hosted Kokoro pilot runner.

Installs a Python 3.12 isolated environment (inheriting the hosted GPU
PyTorch installation) because the `misaki` dependency of kokoro pins
Python <3.13, then runs one genuine Kokoro-82M inference.
"""
import hashlib
import json
import os
import platform
import subprocess
import sys
import time
from pathlib import Path

SEGMENT_0_TEXT = (
    "How a single misspelling created the most iconic domain name in tech "
    "is about to change everything, and here's why..."
)
EXPECTED_TEXT_SHA256 = '7b292603c4308ecf92cc882e1e2cc21b5da57ccade71b51ec3078a57bb11f5a8'
KOKORO_VERSION = '0.9.4'
VOICE = 'af_heart'
LANG_CODE = 'a'
RUN_ID = 'b9_23_kokoro'

OUT_DIR = Path('/content') / RUN_ID
OUT_DIR.mkdir(parents=True, exist_ok=True)
LOG_PATH = OUT_DIR / 'execution.log'
MANIFEST_PATH = OUT_DIR / 'manifest.json'
WAV_PATH = OUT_DIR / 'kokoro_82m.wav'
VENV_PY = OUT_DIR / 'venv' / 'bin' / 'python'

_log = []


def log(message):
    line = str(message)
    print(line, flush=True)
    _log.append(line)


def run(args, cwd=None):
    log('$ ' + ' '.join(str(a) for a in args))
    proc = subprocess.run(
        [str(a) for a in args],
        cwd=str(cwd) if cwd else None,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    output = proc.stdout or ''
    log(output.strip()[-4000:] if output.strip() else '(no output)')
    log('[exit=%s]' % proc.returncode)
    return proc


def finalize(manifest):
    LOG_PATH.write_text('\n'.join(_log) + '\n', encoding='utf-8')
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print('\nMANIFEST: ' + json.dumps(manifest, indent=2), flush=True)
    print('ARTIFACTS: %s' % OUT_DIR, flush=True)


manifest = {
    'run_id': RUN_ID,
    'created_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    'engine': 'Kokoro-82M',
    'kokoro_version': KOKORO_VERSION,
    'voice': VOICE,
    'lang_code': LANG_CODE,
    'model_name': 'hexgrad/Kokoro-82M',
    'text_sha256_expected': EXPECTED_TEXT_SHA256,
    'text_sha256_actual': None,
    'text_length': len(SEGMENT_0_TEXT),
    'python_runtime': sys.version,
    'system': platform.platform(),
    'dependency_reason': (
        "kokoro 0.9.4 requires misaki[en]>=0.9.4; misaki 0.9.4 declares "
        "Requires-Python >=3.8,<3.13 so it is unresolvable on the default "
        "Python 3.13 Colab runtime. Executing inside an isolated Python 3.12 "
        "environment that inherits the hosted GPU PyTorch via "
        "--system-site-packages."
    ),
    'stages': {},
}

try:
    actual_hash = hashlib.sha256(SEGMENT_0_TEXT.encode('utf-8')).hexdigest()
    manifest['text_sha256_actual'] = actual_hash
    if actual_hash != EXPECTED_TEXT_SHA256:
        raise RuntimeError('text hash mismatch: %s' % actual_hash)
    log('Input text hash verified: %s (length=%d)' % (actual_hash, len(SEGMENT_0_TEXT)))
    manifest['stages']['input_verification'] = 'PASS'

    system_python = sys.executable
    log('System python: %s (%s)' % (system_python, sys.version.split()[0]))

    gpu_probe = run([system_python, '-c', (
        'import torch,sys;print(sys.version.split()[0]);'
        'print(torch.__version__);print(torch.cuda.is_available());'
        'print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else None)'
    )])
    torch_info = (gpu_probe.stdout or '').strip().splitlines()
    manifest['runtime'] = {
        'python': torch_info[0] if len(torch_info) > 0 else None,
        'torch': torch_info[1] if len(torch_info) > 1 else None,
        'cuda_available': (torch_info[2].lower() == 'true') if len(torch_info) > 2 else False,
        'gpu': torch_info[3] if len(torch_info) > 3 else None,
    }
    if manifest['runtime']['cuda_available'] is not True:
        manifest['stages']['runtime_preflight'] = 'FAIL: no CUDA GPU available'
        manifest['overall_status'] = 'PARTIAL_OR_FAILED'
        raise RuntimeError(
            'CUDA GPU is unavailable. Do not fall back to local inference.'
        )
    manifest['stages']['runtime_preflight'] = 'PASS'
    log('GPU available: %s (torch %s)' % (
        manifest['runtime']['gpu'], manifest['runtime']['torch']))

    if VENV_PY.exists():
        log('Reusing existing isolated venv at %s' % VENV_PY)
    else:
        bootstrap = run([system_python, '-m', 'pip', 'install', '-q', 'uv'])
        if bootstrap.returncode != 0:
            raise RuntimeError('uv bootstrap install failed; see execution.log')
        uv_bin = subprocess.run(['sh', '-c', 'command -v uv'], text=True,
                                stdout=subprocess.PIPE).stdout.strip() or 'uv'
        create = run([uv_bin, 'venv', '--python', '3.12', '--system-site-packages',
                      str(OUT_DIR / 'venv')])
        if create.returncode != 0 or not VENV_PY.exists():
            alt = run([uv_bin, 'python', 'install', '3.12'])
            if alt.returncode != 0:
                raise RuntimeError('could not provision Python 3.12; see execution.log')
            create = run([uv_bin, 'venv', '--python', '3.12', '--system-site-packages',
                          str(OUT_DIR / 'venv')])
            if create.returncode != 0 or not VENV_PY.exists():
                raise RuntimeError('isolated Python 3.12 venv creation failed')
    manifest['stages']['isolated_environment'] = 'PASS'
    log('Isolated interpreter: %s' % VENV_PY)

    env_python_info = run([VENV_PY, '-c', (
        'import sys,torch;'
        'print(sys.version.split()[0]);print(torch.__version__);'
        'print(torch.cuda.is_available());'
        'print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else None)'
    )])
    env_info = (env_python_info.stdout or '').strip().splitlines()
    manifest['isolated_runtime'] = {
        'python': env_info[0] if len(env_info) > 0 else None,
        'torch': env_info[1] if len(env_info) > 1 else None,
        'cuda_available': (env_info[2].lower() == 'true') if len(env_info) > 2 else False,
        'gpu': env_info[3] if len(env_info) > 3 else None,
    }
    if manifest['isolated_runtime']['python'] is None or \
            not manifest['isolated_runtime']['python'].startswith('3.12'):
        raise RuntimeError('isolated runtime is not Python 3.12: %r' % manifest['isolated_runtime']['python'])
    if manifest['isolated_runtime']['cuda_available'] is not True:
        raise RuntimeError(
            'the isolated Python 3.12 environment cannot access the hosted GPU '
            'CUDA build; refusing to continue without verified GPU access')
    manifest['stages']['gpu_inheritance'] = 'PASS'

    install = run([VENV_PY, '-m', 'pip', 'install', '--no-cache-dir',
                   'kokoro==%s' % KOKORO_VERSION, 'soundfile'])
    if install.returncode != 0:
        manifest['stages']['package_installation'] = 'FAIL'
        manifest['package_install_error'] = install.stdout
        raise RuntimeError('kokoro installation failed; refusing to initialize a model')
    manifest['stages']['package_installation'] = 'PASS'

    import_check = run([VENV_PY, '-c', (
        'import kokoro,soundfile,numpy,torch;'
        'from kokoro import KPipeline;'
        'print(kokoro.__file__);print(numpy.__version__);print(torch.cuda.is_available())'
    )])
    if import_check.returncode != 0:
        manifest['stages']['import_verification'] = 'FAIL'
        manifest['import_error'] = import_check.stdout
        raise RuntimeError('kokoro import failed after installation')
    manifest['stages']['import_verification'] = 'PASS'

    inference_code = (
        'import json,time,numpy as np,soundfile as sf,sys\n'
        'from kokoro import KPipeline\n'
        'text=sys.argv[1];out=sys.argv[2]\n'
        'started=time.time()\n'
        'pipeline=KPipeline(lang_code=%r)\n'
        'chunks=[np.asarray(a) for _,_,a in pipeline(text, voice=%r)]\n'
        'audio=np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)\n'
        'sf.write(out, audio, 24000)\n'
        'duration=float(len(audio))/24000.0\n'
        'peak=float(np.max(np.abs(audio))) if audio.size else 0.0\n'
        'rms=float(np.sqrt(np.mean(np.square(audio)))) if audio.size else 0.0\n'
        'print(json.dumps({"elapsed_s":round(time.time()-started,3),'
        '"samples":int(audio.size),"duration_s":round(duration,3),'
        '"peak":round(peak,6),"rms":round(rms,6),"finite":bool(np.all(np.isfinite(audio)))}))\n'
    ) % (LANG_CODE, VOICE)
    inference = run([VENV_PY, '-c', inference_code,
                     SEGMENT_0_TEXT, str(WAV_PATH)])
    if inference.returncode != 0 or not WAV_PATH.exists():
        manifest['stages']['inference'] = 'FAIL'
        manifest['inference_error'] = inference.stdout
        raise RuntimeError('Kokoro inference did not produce a WAV')
    manifest['stages']['inference'] = 'PASS'

    stdout_lines = (inference.stdout or '').strip().splitlines()
    stats = {}
    for line in reversed(stdout_lines):
        line = line.strip()
        if line.startswith('{'):
            try:
                stats = json.loads(line)
            except ValueError:
                stats = {}
            break
    manifest['inference'] = stats

    if stats.get('duration_s', 0) <= 0.5:
        raise RuntimeError('generated duration is implausibly short: %r' % stats.get('duration_s'))
    if not stats.get('finite', False):
        raise RuntimeError('generated audio contains non-finite samples')
    if stats.get('rms', 0) <= 0:
        raise RuntimeError('generated audio is silent')

    with open(WAV_PATH, 'rb') as handle:
        wav_bytes = handle.read()
    wav_hash = hashlib.sha256(wav_bytes).hexdigest()
    manifest['audio_path'] = str(WAV_PATH)
    manifest['audio_sha256'] = wav_hash
    manifest['audio_size_bytes'] = len(wav_bytes)
    manifest['technical_validation_status'] = 'PASS'
    manifest['audio_quality_status'] = 'PENDING_HUMAN_LISTENING'
    manifest['overall_status'] = 'PASS_TECHNICAL_REVIEW_PENDING'
    log('Kokoro WAV written: %s (%d bytes, sha256=%s)'
        % (WAV_PATH, len(wav_bytes), wav_hash))

except Exception as exc:  # noqa: BLE001 - diagnostics must be preserved
    import traceback
    manifest['overall_status'] = 'PARTIAL_OR_FAILED'
    manifest['error'] = str(exc)
    manifest['traceback'] = traceback.format_exc()
    log('ERROR: %s' % exc)
    log(manifest['traceback'])
finally:
    finalize(manifest)
