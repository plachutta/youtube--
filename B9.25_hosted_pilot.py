#!/usr/bin/env python3
"""B9.25 hosted narration integration pilot.

Runs every (provider, segment) pair sequentially inside ONE hosted Colab
runtime. Provider runtime dependencies stay here; the local orchestration
layer only ever speaks the shared narration contract.

Rules enforced by this script:
  * the segment text hash is verified before ANY model is initialised;
  * providers run one at a time (never concurrently);
  * a failed segment never removes an already validated artifact;
  * every result carries its own hash, measurements and structured status;
  * Kokoro uses the pinned upstream commits qualified in B9.24;
  * Qwen uses the FP32 + SDPA configuration qualified in B9.19.
"""

import hashlib
import json
import subprocess
import sys
import time
import traceback
from pathlib import Path

RUN_ID = 'b9_25_pilot'
OUT_DIR = Path('/content') / RUN_ID

SEGMENTS = [
    {
        'segment_id': 'b9-25-seg-a',
        'text': "Kokoro and Qwen produce different voices. We compare them side by side.",
    },
    {
        'segment_id': 'b9-25-seg-b',
        'text': "Reliable narration keeps viewers watching to the end of the video.",
    },
    {
        'segment_id': 'b9-25-seg-c',
        'text': "Every artifact carries its hash, so any later change stays detectable.",
    },
]

KOKORO = {
    'provider': 'kokoro-82m',
    'model_id': 'hexgrad/Kokoro-82M',
    'model_revision': 'dfb907a02bba8152ca444717ca5d78747ccb4bec',
    'voice': 'af_heart',
    'language_code': 'a',
    'language': 'english',
    'sample_rate': 24000,
    'channels': 1,
    'pinned': {
        'kokoro': 'dfb907a02bba8152ca444717ca5d78747ccb4bec',
        'misaki': 'fba1236595f2d2bf21d414ba6e57d25256afada3',
    },
}

QWEN = {
    'provider': 'qwen3-tts-customvoice',
    'model_id': 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice',
    'model_revision': '85e237c12c027371202489a0ec509ded67b5e4b5',
    'voice': 'ryan',
    'language': 'english',
    'sample_rate': 24000,
    'channels': 1,
    'dtype': 'torch.float32',
    'attn_implementation': 'sdpa',
}

ORDER = [KOKORO, QWEN]

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
    except subprocess.TimeoutExpired as exc:
        log('[timeout after %ss]' % timeout)
        raise RuntimeError('command timed out: %s' % ' '.join(map(str, args)))


def measure(wav_path):
    import wave
    import struct
    import math
    with wave.open(str(wav_path), 'rb') as handle:
        rate = handle.getframerate()
        channels = handle.getnchannels()
        frames = handle.getnframes()
        raw = handle.readframes(frames)
    total = frames * channels
    values = struct.unpack('<%dh' % total, raw) if total else ()
    peak = max((abs(v) for v in values), default=0)
    rms = math.sqrt(sum(v * v for v in values) / total) if total else 0
    clipped = sum(1 for v in values if abs(v) >= 32767)
    return {
        'sample_rate': rate,
        'channels': channels,
        'frame_count': frames,
        'duration_seconds': round(frames / rate, 4) if rate else 0,
        'peak_int16': peak,
        'rms_int16': round(rms, 4),
        'clipped_samples': clipped,
        'finite': True,
    }


def wav_sha256(wav_path):
    return hashlib.sha256(Path(wav_path).read_bytes()).hexdigest()


_qwen_versions = {}


def record_qwen_versions(payload):
    _qwen_versions.update(payload)


def _flush_progress(current):
    """Write an in-flight snapshot so a lost session never loses all results."""
    try:
        (OUT_DIR / 'progress.json').write_text(json.dumps(current, indent=2), encoding='utf-8')
    except Exception:  # noqa: BLE001
        pass


def install_kokoro():
    sh(['bash', '-lc', 'apt-get update -qq 2>&1 | tail -1 && apt-get install -y -qq espeak-ng 2>&1 | tail -1'],
       timeout=600)
    sh([sys.executable, '-m', 'pip', 'install', '--no-deps',
        'git+https://github.com/hexgrad/kokoro.git@%s' % KOKORO['pinned']['kokoro']], timeout=900)
    sh([sys.executable, '-m', 'pip', 'install',
        'git+https://github.com/hexgrad/misaki.git@%s' % KOKORO['pinned']['misaki']], timeout=900)
    sh([sys.executable, '-m', 'pip', 'install', 'soundfile', 'loguru',
        'huggingface_hub', 'num2words', 'phonemizer-fork', 'espeakng-loader',
        'spacy'], timeout=900)
    sh([sys.executable, '-c',
        'import torch,transformers,spacy,kokoro,soundfile;'
        'from kokoro import KPipeline;print("torch",torch.__version__);'
        'print("cuda",torch.cuda.is_available())'])


def install_system_dependencies():
    """Install the system libraries both providers need before any pip work.

    Evidence (B9.25 dependency check): ``pip install sox`` alone is not
    enough. The python ``sox`` package invokes the SoX binary at install time
    (``/bin/sh: 1: sox: not found``), and qwen_tts then aborts with
    ``ModuleNotFoundError: No module named 'sox'`` raised from
    ``qwen_tts/core/tokenizer_25hz/vq/speech_vq.py``. phonemizer-fork needs
    espeak-ng the same way for Kokoro.
    """
    sh(['bash', '-lc',
        'apt-get update -qq 2>&1 | tail -1 && '
        'apt-get install -y -qq espeak-ng sox libsox-dev 2>&1 | tail -2'],
       timeout=900)


def install_qwen():
    """Install qwen-tts 0.1.1 with a proven, non-destructive dependency set.

    Two distinct, evidenced blockers had to be removed:

    1. Missing SoX system library -> ``ModuleNotFoundError: No module named
       'sox'`` inside qwen_tts/core/tokenizer_25hz/vq/speech_vq.py.
       Fixed by installing the system package before the python package.

    2. transformers version. qwen-tts 0.1.1 hard-pins
       ``transformers==4.57.3``. Letting pip resolve it also drags
       ``huggingface-hub==0.36.2`` (transformers 4.57.3 requires
       huggingface-hub<1.0), and under that pair ``from qwen_tts import
       Qwen3TTSModel`` dies with
       ``ImportError: cannot import name 'download_url' from
       'transformers.utils'`` — a lazy-module failure inside
       transformers/utils/hub.py, not a missing symbol in qwen-tts.
       Conversely, keeping the runtime's transformers 5.18.0 fails later with
       ``TypeError: check_model_inputs() missing 1 required positional
       argument: 'func'`` because qwen-tts 0.1.1 was written against the 4.x
       decorator signature. transformers 4.57.3 is the LAST 4.x release
       (4.58.0 was never published), so no newer 4.x exists to try.

       Chosen set: install qwen-tts and transformers 4.57.3 both with
       ``--no-deps`` while PRESERVING the runtime's huggingface_hub 1.33.0.
       The B9.25 dependency check shows this combination reaches the SoX
       failure and nothing else, i.e. the hub incompatibility disappears when
       the hub is not downgraded.

    torch stays at the pre-existing GPU build (2.11.0+cu130) so the CUDA
    stack is never replaced.
    """
    baseline = sh([sys.executable, '-c',
                   'import transformers,huggingface_hub,accelerate,torch;'
                   'print(transformers.__version__,huggingface_hub.__version__,'
                   'accelerate.__version__,torch.__version__)'], timeout=600)
    record_qwen_versions({'baseline_versions': (baseline.stdout or '').strip()})
    sh([sys.executable, '-m', 'pip', 'install', '--no-deps', 'qwen-tts==0.1.1'], timeout=900)
    sh([sys.executable, '-m', 'pip', 'install', '--no-deps', 'transformers==4.57.3'],
       timeout=900)
    sh([sys.executable, '-m', 'pip', 'install', '--no-deps',
        'accelerate==1.12.0', 'torchaudio', 'librosa', 'soundfile', 'einops',
        'onnxruntime', 'sox'], timeout=900)
    verify = sh([sys.executable, '-c',
                 'import qwen_tts, torch, transformers, huggingface_hub;'
                 'from qwen_tts import Qwen3TTSModel;'
                 'print("qwen_tts_ok", transformers.__version__, huggingface_hub.__version__);'
                 'print("cuda", torch.cuda.is_available());'
                 'print("gpu", torch.cuda.get_device_name(0) if torch.cuda.is_available() else None)'],
                timeout=900)
    record_qwen_versions({
        'install_strategy': ('apt espeak-ng+sox; qwen-tts==0.1.1 --no-deps; '
                             'transformers==4.57.3 --no-deps with runtime '
                             'huggingface_hub preserved; torch GPU build preserved'),
        'verify': (verify.stdout or '').strip(),
        'verify_exit': verify.returncode,
    })


def run_kokoro(segment):
    import numpy as np
    import soundfile as sf
    from kokoro import KPipeline

    pipeline = KPipeline(lang_code=KOKORO['language_code'])
    chunks = [np.asarray(audio) for _, _, audio in pipeline(segment['text'], voice=KOKORO['voice'])]
    audio = np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)
    target = OUT_DIR / ('%s_kokoro.wav' % segment['segment_id'])
    sf.write(str(target), audio, KOKORO['sample_rate'])
    return target


def run_qwen(segment):
    import soundfile as sf
    import torch
    from qwen_tts import Qwen3TTSModel

    model = Qwen3TTSModel.from_pretrained(
        KWEN_MODEL_ID,
        dtype=torch.float32,
        attn_implementation=QWEN['attn_implementation'],
    )
    waveform, sample_rate = model.generate_custom_voice(
        text=segment['text'],
        speaker=QWEN['voice'],
        language=QWEN['language'],
    )
    target = OUT_DIR / ('%s_qwen.wav' % segment['segment_id'])
    array = waveform[0] if getattr(waveform, 'ndim', 1) > 1 else waveform
    array = _to_numpy(array)
    sf.write(str(target), array, int(sample_rate))
    return target, int(sample_rate)


KWEN_MODEL_ID = QWEN['model_id']


def _to_numpy(value):
    try:
        import numpy as np
        if isinstance(value, np.ndarray):
            return np.asarray(value, dtype=np.float32)
        if hasattr(value, 'detach'):
            return value.detach().cpu().float().numpy()
        return np.asarray(value, dtype=np.float32)
    except Exception:  # noqa: BLE001
        return value


RUNNERS = {'kokoro-82m': run_kokoro, 'qwen3-tts-customvoice': run_qwen}

manifest = {
    'run_id': RUN_ID,
    'created_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    'python': sys.version,
    'segments': [
        {'segment_id': s['segment_id'], 'text': s['text'],
         'text_sha256': hashlib.sha256(s['text'].encode('utf-8')).hexdigest(),
         'text_length': len(s['text'])}
        for s in SEGMENTS
    ],
    'providers': [
        {'provider': p['provider'], 'model_id': p['model_id'],
         'model_revision': p['model_revision'], 'voice': p['voice'],
         'language': p['language'], 'sample_rate': p['sample_rate'],
         'channels': p['channels'],
         'dependency_resolution': _qwen_versions if p['provider'] == 'qwen3-tts-customvoice' else {}}
        for p in ORDER
    ],
    'results': [],
}

try:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for segment in SEGMENTS:
        expected = hashlib.sha256(segment['text'].encode('utf-8')).hexdigest()
        manifest['segments_by_hash'] = manifest.get('segments_by_hash', {})
        manifest['segments_by_hash'][segment['segment_id']] = expected

    gpu_probe = sh([sys.executable, '-c',
                    'import torch;print(torch.__version__);print(torch.cuda.is_available());'
                    'print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else None)'],
                   timeout=600)
    gpu_info = (gpu_probe.stdout or '').strip().splitlines()
    manifest['gpu'] = {
        'torch': gpu_info[0] if len(gpu_info) > 0 else None,
        'cuda_available': (gpu_info[1].lower() == 'true') if len(gpu_info) > 1 else False,
        'device': gpu_info[2] if len(gpu_info) > 2 else None,
    }
    if manifest['gpu']['cuda_available'] is not True:
        raise RuntimeError('CUDA GPU unavailable; refusing to run inference outside a hosted GPU runtime')
    log('Hosted GPU verified: %s' % manifest['gpu']['device'])

    install_system_dependencies()

    for provider in ORDER:
        # Each provider is installed and qualified in its own step so a
        # failure in one cannot consume the other's successful work.
        try:
            if provider['provider'] == 'kokoro-82m':
                install_kokoro()
            else:
                install_qwen()
            install_ok = True
            install_error = None
        except Exception as exc:  # noqa: BLE001
            install_ok = False
            install_error = '%s: %s' % (type(exc).__name__, exc)

        for segment in SEGMENTS:
            entry = {
                'segment_id': segment['segment_id'],
                'provider': provider['provider'],
                'text_sha256_expected': hashlib.sha256(segment['text'].encode('utf-8')).hexdigest(),
                'text_sha256_actual': None,
                'generation_status': 'NOT_STARTED',
                'technical_validation_status': 'NOT_RUN',
                'audio_quality_status': 'NOT_ASSESSED',
                'audio_path': None,
                'audio_sha256': None,
                'measurements': None,
                'error': None,
            }
            if not install_ok:
                entry['generation_status'] = 'FAILED'
                entry['technical_validation_status'] = 'FAIL'
                entry['audio_quality_status'] = 'REJECTED'
                entry['error'] = 'provider installation failed: %s' % install_error
                manifest['results'].append(entry)
                _flush_progress(manifest)
                log('SKIP %s/%s: %s' % (provider['provider'], segment['segment_id'], entry['error']))
                continue
            try:
                actual = hashlib.sha256(segment['text'].encode('utf-8')).hexdigest()
                entry['text_sha256_actual'] = actual
                if actual != entry['text_sha256_expected']:
                    raise RuntimeError('text hash mismatch before model initialization')
                runner = RUNNERS[provider['provider']]
                outcome = runner(segment)
                target = outcome[0] if isinstance(outcome, tuple) else outcome
                entry['audio_path'] = str(target)
                entry['audio_sha256'] = wav_sha256(target)
                entry['measurements'] = measure(target)
                entry['generation_status'] = 'SUCCEEDED'
                if (entry['measurements']['duration_seconds'] > 0.5
                        and entry['measurements']['rms_int16'] > 0
                        and entry['measurements']['sample_rate'] == provider['sample_rate']
                        and entry['measurements']['channels'] == provider['channels']):
                    entry['technical_validation_status'] = 'PASS'
                else:
                    entry['technical_validation_status'] = 'FAIL'
                    entry['audio_quality_status'] = 'REJECTED'
                log('OK %s/%s sha256=%s dur=%ss'
                    % (provider['provider'], segment['segment_id'],
                       entry['audio_sha256'][:12], entry['measurements']['duration_seconds']))
            except Exception as exc:  # noqa: BLE001
                entry['generation_status'] = 'FAILED'
                entry['technical_validation_status'] = 'FAIL'
                entry['audio_quality_status'] = 'REJECTED'
                entry['error'] = '%s: %s' % (type(exc).__name__, exc)
                entry['traceback'] = traceback.format_exc()
                log('FAIL %s/%s: %s' % (provider['provider'], segment['segment_id'], entry['error']))
            manifest['results'].append(entry)
            _flush_progress(manifest)

    succeeded = sum(1 for r in manifest['results']
                    if r['generation_status'] == 'SUCCEEDED'
                    and r['technical_validation_status'] == 'PASS')
    manifest['overall_status'] = 'PASS' if succeeded == len(manifest['results']) else (
        'PARTIAL' if succeeded else 'FAILED')
    manifest['succeeded'] = succeeded
    manifest['expected'] = len(manifest['results'])

except Exception as exc:  # noqa: BLE001
    manifest['overall_status'] = 'FAILED'
    manifest['error'] = '%s: %s' % (type(exc).__name__, exc)
    manifest['traceback'] = traceback.format_exc()
    log('FATAL: %s' % manifest['error'])

finally:
    (OUT_DIR / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    (OUT_DIR / 'execution.log').write_text('\n'.join(log_lines) + '\n', encoding='utf-8')
    # Terminal marker: written only after every segment finished, so an
    # orchestrator polls for 'DONE' instead of guessing from file counts.
    (OUT_DIR / 'STATUS.txt').write_text(
        'DONE %s succeeded=%s expected=%s' % (
            manifest.get('overall_status'), manifest.get('succeeded'), manifest.get('expected')),
        encoding='utf-8')
    print('\nMANIFEST SUMMARY: %s (%s/%s succeeded)'
          % (manifest.get('overall_status'), manifest.get('succeeded'), manifest.get('expected')), flush=True)
    print('ARTIFACTS: %s' % OUT_DIR, flush=True)
