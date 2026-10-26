#!/usr/bin/env python3
"""B9.26 Qwen-only hosted integration runner.

Qwen runs in its OWN hosted runtime, independent of the Kokoro environment,
because their dependency windows do not overlap on this image:

  * Kokoro (B9.24) needs misaki installed from pinned upstream commits.
  * Qwen (qwen-tts 0.1.1) hard-pins ``transformers==4.57.3`` plus
    ``huggingface-hub<1.0`` (pip resolves 0.36.2), which conflicts with the
    newer hub the runtime ships. Mixing them in one environment caused the
    transformer import failures recorded in B9.25.

Evidence that pinned the failure (B9.25 dependency check,
hosted-runs/b9-25-dependency-check/): with ``transformers==4.57.3`` and
``huggingface_hub==0.36.2`` installed, ``import transformers`` succeeds and
the qwen_tts import chain dies at ``import sox`` inside
``qwen_tts/core/tokenizer_25hz/vq/speech_vq.py``. The python ``sox`` package
needs the SoX *system* binary, so it must be apt-installed first.

This script runs import/initialisation qualification FIRST. Inference only
starts if that passes; otherwise it stops with full diagnostics and writes
no fabricated result.
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

RUN_ID = 'b9_26_qwen'
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
    'pins': {
        'qwen-tts': '0.1.1',
        'transformers': '4.57.3',
        'huggingface_hub': '0.36.2',
        'accelerate': '1.12.0',
    },
}

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


def install_environment():
    """Dedicated Qwen environment: system SoX first, then pinned wheels.

    torch is pinned to the pre-existing GPU build so the CUDA stack is never
    replaced; only the transformers/huggingface_hub pair that qwen-tts 0.1.1
    actually requires is installed.
    """
    sh(['bash', '-lc',
        'apt-get update -qq 2>&1 | tail -1 && '
        'apt-get install -y -qq espeak-ng sox libsox-dev 2>&1 | tail -2'],
       timeout=900)

    torch_probe = sh([sys.executable, '-c', 'import torch;print(torch.__version__)'], timeout=600)
    torch_version = (torch_probe.stdout or '').strip().splitlines()[-1].split()[-1]

    sh([sys.executable, '-m', 'pip', 'install',
        '--no-deps', 'qwen-tts==%s' % QWEN['pins']['qwen-tts']], timeout=900)
    sh([sys.executable, '-m', 'pip', 'install',
        'transformers==%s' % QWEN['pins']['transformers'],
        'huggingface_hub==%s' % QWEN['pins']['huggingface_hub'],
        'accelerate==%s' % QWEN['pins']['accelerate']], timeout=900)
    remaining = ['--no-deps', 'librosa', 'soundfile', 'onnxruntime', 'einops', 'sox']
    if torch_version:
        remaining.append('torch==%s' % torch_version)
    sh([sys.executable, '-m', 'pip', 'install'] + remaining, timeout=900)
    return torch_version


def qualify_environment(torch_version):
    """Import + initialisation gate. Inference must not run unless this passes."""
    probe = sh([sys.executable, '-c',
                'import torch, transformers, huggingface_hub, sox, qwen_tts;'
                'from qwen_tts import Qwen3TTSModel;'
                'print("imports_ok", transformers.__version__, huggingface_hub.__version__);'
                'print("cuda", torch.cuda.is_available());'
                'print("gpu", torch.cuda.get_device_name(0) if torch.cuda.is_available() else None)'],
               timeout=900)
    if probe.returncode != 0:
        return {'import_qualification': 'FAIL', 'output': (probe.stdout or '')[-3000:]}
    lines = (probe.stdout or '').strip().splitlines()
    info = {'import_qualification': 'PASS'}
    for line in lines:
        if line.startswith('imports_ok '):
            parts = line.split()
            info['transformers'] = parts[1]
            info['huggingface_hub'] = parts[2]
        if line.startswith('cuda '):
            info['cuda_available'] = line == 'cuda True'
        if line.startswith('gpu '):
            info['gpu'] = line[4:]
    info['torch'] = torch_version
    info['model_revision'] = QWEN['model_revision']
    info['dtype'] = QWEN['dtype']
    info['attn_implementation'] = QWEN['attn_implementation']
    return info


def describe_array(value):
    """Best-effort structural description, recorded in the manifest."""
    info = {'type': type(value).__name__}
    try:
        info['shape'] = [int(dim) for dim in value.shape]
        info['dtype'] = str(value.dtype)
        info['ndim'] = int(value.ndim)
    except Exception:  # noqa: BLE001
        try:
            info['len'] = len(value)
        except Exception:  # noqa: BLE001
            info['len'] = None
    return info


def settle_array(value):
    """Reduce whatever generate_custom_voice returned to 1-D float32 mono PCM.

    libsndfile fails with the very unhelpful "Format not recognised" for a
    non-standard layout, so the array is normalised explicitly: torch tensors
    are detached, extra dimensions are collapsed and the dtype is forced to
    float32.
    """
    import numpy as np

    if hasattr(value, 'detach'):
        value = value.detach().cpu().numpy()
    value = np.asarray(value, dtype=np.float32)
    info = describe_array(value)
    while value.ndim > 1:
        # Collapse a trailing singleton channel axis, otherwise take the first
        # channel so the audio length is preserved rather than a single frame.
        value = value.reshape(-1) if value.shape[-1] == 1 else value[0]
    value = np.ravel(np.asarray(value, dtype=np.float32))
    return info, value


def pcm16(array):
    import numpy as np
    clipped = np.clip(np.asarray(array, dtype=np.float32), -1.0, 1.0)
    return np.rint(clipped * 32767.0).astype('<i2')


def run_qwen(segment):
    import soundfile as sf
    import torch
    import wave
    from qwen_tts import Qwen3TTSModel

    model = Qwen3TTSModel.from_pretrained(
        QWEN['model_id'],
        revision=QWEN['model_revision'],
        dtype=torch.float32,
        attn_implementation=QWEN['attn_implementation'],
    )
    waveform, sample_rate = model.generate_custom_voice(
        text=segment['text'],
        speaker=QWEN['voice'],
        language=QWEN['language'],
    )
    # generate_custom_voice's return layout is not documented by the package;
    # normalise it and record what actually arrived.
    waveform_info, array = settle_array(waveform)
    if array.size == 0:
        raise RuntimeError('generate_custom_voice returned no audio samples (%s)' % waveform_info)
    sample_rate = int(sample_rate)
    target = OUT_DIR / ('%s_qwen.wav' % segment['segment_id'])
    scratch = Path(tempfile.gettempdir()) / ('%s_qwen.wav' % segment['segment_id'])
    try:
        sf.write(str(scratch), array, sample_rate, format='WAV', subtype='PCM_16')
    except Exception as exc:  # noqa: BLE001 - fall back to the stdlib writer
        log('soundfile write failed (%s); using the stdlib wave module'
            % type(exc).__name__)
        with wave.open(str(scratch), 'wb') as handle:
            handle.setnchannels(1)
            handle.setsampwidth(2)
            handle.setframerate(sample_rate)
            handle.writeframes(pcm16(array).tobytes())
    shutil.move(str(scratch), str(target))
    return target, sample_rate, waveform_info


def _flush(current):
    try:
        (OUT_DIR / 'progress.json').write_text(json.dumps(current, indent=2), encoding='utf-8')
    except Exception:  # noqa: BLE001
        pass


manifest = {
    'run_id': RUN_ID,
    'created_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    'python': sys.version,
    'provider': QWEN,
    'segments': [
        {'segment_id': s['segment_id'], 'text': s['text'],
         'text_sha256': hashlib.sha256(s['text'].encode('utf-8')).hexdigest(),
         'text_length': len(s['text'])}
        for s in SEGMENTS
    ],
    'environment': {},
    'results': [],
}

try:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    gpu_probe = sh([sys.executable, '-c',
                    'import torch;print(torch.__version__);print(torch.cuda.is_available());'
                    'print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else None)'],
                   timeout=600)
    gpu_info = (gpu_probe.stdout or '').strip().splitlines()
    manifest['environment']['runtime'] = {
        'torch': gpu_info[0] if len(gpu_info) > 0 else None,
        'cuda_available': (gpu_info[1].lower() == 'true') if len(gpu_info) > 1 else False,
        'gpu': gpu_info[2] if len(gpu_info) > 2 else None,
    }
    if manifest['environment']['runtime']['cuda_available'] is not True:
        raise RuntimeError('CUDA GPU unavailable; refusing to run inference outside a hosted GPU runtime')
    log('Hosted GPU verified: %s' % manifest['environment']['runtime']['gpu'])

    torch_version = install_environment()
    qualification = qualify_environment(torch_version)
    manifest['environment']['qualification'] = qualification
    log('Qwen environment qualification: %s' % qualification.get('import_qualification'))
    if qualification.get('import_qualification') != 'PASS':
        # Hard stop: do not start inference on an unqualified environment.
        raise RuntimeError('Qwen import/initialisation qualification failed; inference not attempted')
    if qualification.get('cuda_available') is not True:
        raise RuntimeError('Qwen environment cannot access the hosted GPU; inference not attempted')

    for segment in SEGMENTS:
        entry = {
            'segment_id': segment['segment_id'],
            'provider': QWEN['provider'],
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
        try:
            actual = hashlib.sha256(segment['text'].encode('utf-8')).hexdigest()
            entry['text_sha256_actual'] = actual
            if actual != entry['text_sha256_expected']:
                raise RuntimeError('text hash mismatch before model initialization')
            target, sample_rate, waveform_info = run_qwen(segment)
            entry['generated_array'] = waveform_info
            entry['audio_path'] = str(target)
            entry['audio_sha256'] = hashlib.sha256(Path(target).read_bytes()).hexdigest()
            entry['measurements'] = measure(target)
            entry['generation_status'] = 'SUCCEEDED'
            if (entry['measurements']['duration_seconds'] > 0.5
                    and entry['measurements']['rms_int16'] > 0
                    and entry['measurements']['sample_rate'] == QWEN['sample_rate']
                    and entry['measurements']['channels'] == QWEN['channels']):
                entry['technical_validation_status'] = 'PASS'
            else:
                entry['technical_validation_status'] = 'FAIL'
                entry['audio_quality_status'] = 'REJECTED'
            log('OK %s sha256=%s dur=%ss'
                % (segment['segment_id'], entry['audio_sha256'][:12],
                   entry['measurements']['duration_seconds']))
        except Exception as exc:  # noqa: BLE001
            entry['generation_status'] = 'FAILED'
            entry['technical_validation_status'] = 'FAIL'
            entry['audio_quality_status'] = 'REJECTED'
            entry['error'] = '%s: %s' % (type(exc).__name__, exc)
            entry['traceback'] = traceback.format_exc()
            log('FAIL %s: %s' % (segment['segment_id'], entry['error']))
        manifest['results'].append(entry)
        _flush(manifest)

    succeeded = sum(1 for r in manifest['results']
                    if r['generation_status'] == 'SUCCEEDED'
                    and r['technical_validation_status'] == 'PASS')
    manifest['succeeded'] = succeeded
    manifest['expected'] = len(manifest['results'])
    manifest['overall_status'] = 'PASS' if succeeded == len(manifest['results']) else (
        'PARTIAL' if succeeded else 'FAILED')

except Exception as exc:  # noqa: BLE001
    manifest['overall_status'] = 'FAILED'
    manifest['succeeded'] = sum(1 for r in manifest['results']
                                if r['generation_status'] == 'SUCCEEDED')
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
    print('\nMANIFEST SUMMARY: %s (%s/%s)'
          % (manifest.get('overall_status'), manifest.get('succeeded'), manifest.get('expected')),
          flush=True)
    print('ARTIFACTS: %s' % OUT_DIR, flush=True)
