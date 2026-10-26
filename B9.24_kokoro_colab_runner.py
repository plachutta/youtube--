#!/usr/bin/env python3
"""B9.24 hosted Kokoro pilot runner.

Root cause of every previous Kokoro failure:
  * kokoro 0.9.4 depends on `misaki[en]>=0.9.4`;
  * the *published* misaki 0.9.4 wheel on PyPI declares
    `Requires-Python >=3.8,<3.13`, so pip refuses it on Colab's
    Python 3.13 runtime and the whole `kokoro` install aborts;
  * upstream misaki commit fba1236 ("Enable Python 3.13") relaxes
    `requires-python` to `>=3.8,<3.14` but was never re-released
    on PyPI.

Recovery: install kokoro from the pinned official GitHub commit with
`--no-deps`, install misaki from pinned upstream commit fba1236, and
install the remaining dependencies individually so nothing silently
reinstall the hosted GPU PyTorch stack.
"""
import hashlib
import json
import os
import platform
import re
import subprocess
import sys
import time
from pathlib import Path

SEGMENT_0_TEXT = (
    "How a single misspelling created the most iconic domain name in tech "
    "is about to change everything, and here's why..."
)
EXPECTED_TEXT_SHA256 = '7b292603c4308ecf92cc882e1e2cc21b5da57ccade71b51ec3078a57bb11f5a8'

KOKORO_REPO = 'https://github.com/hexgrad/kokoro.git'
KOKORO_COMMIT = 'dfb907a02bba8152ca444717ca5d78747ccb4bec'
MISAKI_REPO = 'https://github.com/hexgrad/misaki.git'
MISAKI_COMMIT = 'fba1236595f2d2bf21d414ba6e57d25256afada3'
VOICE = 'af_heart'
LANG_CODE = 'a'
RUN_ID = 'b9_24_kokoro'

OUT_DIR = Path('/content') / RUN_ID
OUT_DIR.mkdir(parents=True, exist_ok=True)
LOG_PATH = OUT_DIR / 'execution.log'
MANIFEST_PATH = OUT_DIR / 'manifest.json'
WAV_PATH = OUT_DIR / 'kokoro_82m.wav'

_log = []


def log(message):
    line = str(message)
    print(line, flush=True)
    _log.append(line)


def run(args, timeout=900):
    log('$ ' + ' '.join(str(a) for a in args))
    try:
        proc = subprocess.run(
            [str(a) for a in args],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout,
        )
        output = proc.stdout or ''
        log(output.strip()[-5000:] if output.strip() else '(no output)')
        log('[exit=%s]' % proc.returncode)
        return proc
    except subprocess.TimeoutExpired as exc:
        log('[timeout after %ss]' % timeout)
        log((exc.stdout or b'') if isinstance(exc.stdout, str) else '')
        raise RuntimeError('command timed out: %s' % ' '.join(map(str, args)))


def finalize(manifest):
    LOG_PATH.write_text('\n'.join(_log) + '\n', encoding='utf-8')
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print('\nMANIFEST: ' + json.dumps(manifest, indent=2), flush=True)
    print('ARTIFACTS: %s' % OUT_DIR, flush=True)


def parse_pip_download_size(text):
    total = 0
    for match in re.finditer(r'([\d.]+)\s*([kMGT]?B)', text or ''):
        value = float(match.group(1))
        unit = match.group(2)
        factor = {'B': 1, 'kB': 1e3, 'MB': 1e6, 'GB': 1e9, 'TB': 1e12}[unit]
        total += value * factor
    return total


manifest = {
    'run_id': RUN_ID,
    'created_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    'engine': 'Kokoro-82M',
    'voice': VOICE,
    'lang_code': LANG_CODE,
    'model_name': 'hexgrad/Kokoro-82M',
    'kokoro_repo': KOKORO_REPO,
    'kokoro_commit': KOKORO_COMMIT,
    'misaki_repo': MISAKI_REPO,
    'misaki_commit': MISAKI_COMMIT,
    'text_sha256_expected': EXPECTED_TEXT_SHA256,
    'text_sha256_actual': None,
    'text_length': len(SEGMENT_0_TEXT),
    'python_runtime': sys.version,
    'system': platform.platform(),
    'stages': {},
    'root_cause': (
        "kokoro 0.9.4 requires misaki[en]>=0.9.4; the misaki 0.9.4 wheel "
        "published on PyPI declares Requires-Python >=3.8,<3.13, so pip "
        "cannot resolve it on the Colab Python 3.13 runtime and the whole "
        "kokoro install fails. Upstream misaki commit %s relaxes the "
        "requirement to >=3.8,<3.14 but was never re-released to PyPI. "
        "Both packages are therefore installed from pinned official "
        "GitHub commits." % MISAKI_COMMIT[:12]
    ),
}

try:
    actual_hash = hashlib.sha256(SEGMENT_0_TEXT.encode('utf-8')).hexdigest()
    manifest['text_sha256_actual'] = actual_hash
    if actual_hash != EXPECTED_TEXT_SHA256:
        raise RuntimeError('text hash mismatch: %s' % actual_hash)
    log('Input text hash verified: %s (length=%d)'
        % (actual_hash, len(SEGMENT_0_TEXT)))
    manifest['stages']['input_verification'] = 'PASS'

    system_python = sys.executable
    preflight = run([system_python, '-c', (
        'import sys,torch;print(sys.version.split()[0]);print(torch.__version__);'
        'print(torch.cuda.is_available());'
        'print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else None)')])
    info = (preflight.stdout or '').strip().splitlines()
    manifest['runtime'] = {
        'python': info[0] if len(info) > 0 else None,
        'torch': info[1] if len(info) > 1 else None,
        'cuda_available': (info[2].lower() == 'true') if len(info) > 2 else False,
        'gpu': info[3] if len(info) > 3 else None,
    }
    if manifest['runtime']['cuda_available'] is not True:
        raise RuntimeError('CUDA GPU is unavailable. Do not fall back to local inference.')
    log('Hosted GPU available: %s (torch %s, python %s)'
        % (manifest['runtime']['gpu'], manifest['runtime']['torch'],
           manifest['runtime']['python']))
    manifest['stages']['runtime_preflight'] = 'PASS'

    # espeak-ng system library for phonemizer-fork
    apt = run(['bash', '-lc', 'apt-get update -qq 2>&1 | tail -2 && '
                              'apt-get install -y -qq espeak-ng 2>&1 | tail -3'],
              timeout=300)
    manifest['stages']['system_dependencies'] = 'PASS' if apt.returncode == 0 else 'WARN'

    # Pin torch/transformers so an install cannot silently replace the
    # hosted GPU PyTorch stack.
    torch_version = (manifest['runtime'].get('torch') or '').split('+')[0] or None
    import importlib.metadata as md
    try:
        transformers_version = md.version('transformers')
    except Exception:  # noqa: BLE001
        transformers_version = None
    manifest['pinned_versions'] = {
        'torch': torch_version,
        'transformers': transformers_version,
    }
    log('Pinning torch==%s transformers==%s' % (torch_version, transformers_version))

    # kokoro from the pinned official commit
    kokoro_spec = 'git+%s@%s' % (KOKORO_REPO, KOKORO_COMMIT)
    install_kokoro = run([system_python, '-m', 'pip', 'install', '--no-deps',
                          kokoro_spec], timeout=600)
    if install_kokoro.returncode != 0 or not Path(
            '/usr/local/lib/python%d.%d/dist-packages/kokoro'
            % sys.version_info[:2]).exists():
        manifest['stages']['kokoro_installation'] = 'FAIL'
        manifest['kokoro_install_error'] = install_kokoro.stdout
        raise RuntimeError('kokoro installation failed; refusing to initialize a model')
    manifest['stages']['kokoro_installation'] = 'PASS'

    # misaki from the pinned official commit that supports Python 3.13
    misaki_spec = 'git+%s@%s' % (MISAKI_REPO, MISAKI_COMMIT)
    install_misaki = run([system_python, '-m', 'pip', 'install', misaki_spec],
                         timeout=900)
    if install_misaki.returncode != 0:
        manifest['stages']['misaki_installation'] = 'FAIL'
        manifest['misaki_install_error'] = install_misaki.stdout
        raise RuntimeError('misaki installation failed; refusing to initialize a model')
    manifest['stages']['misaki_installation'] = 'PASS'

    # spacy-curated-transformers is declared in misaki's [en] extra but is
    # never imported by misaki; pinning it forces a spacy 4.0.0.dev3 source
    # build that fails. spacy 3.8.16 already satisfies misaki's requirement.
    remaining = ['soundfile', 'loguru', 'huggingface_hub', 'num2words',
                 'phonemizer-fork', 'espeakng-loader', 'spacy']
    if torch_version:
        remaining.append('torch==%s' % torch_version)
    if transformers_version:
        remaining.append('transformers==%s' % transformers_version)
    install_rest = run([system_python, '-m', 'pip', 'install'] + remaining,
                       timeout=900)
    if install_rest.returncode != 0:
        manifest['stages']['dependency_installation'] = 'FAIL'
        manifest['dependency_install_error'] = install_rest.stdout
        raise RuntimeError('supporting dependency installation failed')
    manifest['stages']['dependency_installation'] = 'PASS'

    import_check = run([system_python, '-c', (
        'import kokoro, misaki, soundfile, numpy, torch, spacy;'
        'from kokoro import KPipeline;'
        'import misaki.en;'
        'print(kokoro.__file__);'
        'print(misaki.__file__);'
        'print(torch.cuda.is_available())')], timeout=600)
    if import_check.returncode != 0:
        manifest['stages']['import_verification'] = 'FAIL'
        manifest['import_error'] = import_check.stdout
        raise RuntimeError('kokoro/misaki import failed after installation')
    manifest['stages']['import_verification'] = 'PASS'

    inference_cmd = (
        'import json, time, sys\n'
        'import numpy as np\n'
        'import soundfile as sf\n'
        'from kokoro import KPipeline\n'
        'text, out = sys.argv[1], sys.argv[2]\n'
        'started = time.time()\n'
        'pipeline = KPipeline(lang_code=%r)\n'
        'chunks = [np.asarray(a) for _, _, a in pipeline(text, voice=%r)]\n'
        'audio = np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)\n'
        'sf.write(out, audio, 24000)\n'
        'print(json.dumps({\n'
        '  "elapsed_s": round(time.time() - started, 3),\n'
        '  "samples": int(audio.size),\n'
        '  "sample_rate": 24000,\n'
        '  "channels": 1,\n'
        '  "duration_s": round(float(audio.size) / 24000.0, 3),\n'
        '  "peak": round(float(np.max(np.abs(audio))), 6),\n'
        '  "rms": round(float(np.sqrt(np.mean(np.square(audio)))), 6),\n'
        '  "finite": bool(np.all(np.isfinite(audio))),\n'
        '}))\n'
    ) % (LANG_CODE, VOICE)
    inference = run([system_python, '-c', inference_cmd,
                     SEGMENT_0_TEXT, str(WAV_PATH)], timeout=900)
    if inference.returncode != 0 or not WAV_PATH.exists():
        manifest['stages']['inference'] = 'FAIL'
        manifest['inference_error'] = inference.stdout
        raise RuntimeError('Kokoro inference did not produce a WAV')
    manifest['stages']['inference'] = 'PASS'

    stats = {}
    for line in reversed((inference.stdout or '').strip().splitlines()):
        if line.strip().startswith('{'):
            try:
                stats = json.loads(line.strip())
            except ValueError:
                stats = {}
            break
    manifest['inference'] = stats

    if stats.get('duration_s', 0) <= 0.5:
        raise RuntimeError('generated duration is implausibly short: %r'
                           % stats.get('duration_s'))
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
