#!/usr/bin/env python3
import os, sys, json, time, hashlib, traceback, subprocess, platform, zipfile
from pathlib import Path

SEGMENT_0_TEXT = "How a single misspelling created the most iconic domain name in tech is about to change everything, and here's why..."
EXPECTED_TEXT_SHA256 = '7b292603c4308ecf92cc882e1e2cc21b5da57ccade71b51ec3078a57bb11f5a8'
MODEL_NAME = "hexgrad/Kokoro-82M"
RUN_LABEL = 'b9_16_kokoro'

RUN_DIR = Path('/content') / RUN_LABEL
RUN_DIR.mkdir(parents=True, exist_ok=True)
LOG_PATH = RUN_DIR / 'execution.log'
MANIFEST_PATH = RUN_DIR / 'manifest.json'
AUDIO_PATH = RUN_DIR / 'kokoro_82m.wav'
ZIP_PATH = Path('/content') / f'{RUN_LABEL}_artifacts.zip'

manifest = {
    'run_label': RUN_LABEL,
    'created_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    'engine': 'Kokoro-82M',
    'model_name': MODEL_NAME,
    'text_sha256_expected': EXPECTED_TEXT_SHA256,
    'text_sha256_actual': None,
    'text_length': len(SEGMENT_0_TEXT),
    'runtime': {'python': sys.version, 'platform': platform.platform()},
    'gpu': None,
    'package_install_status': 'not_started',
    'model_initialization_status': 'not_started',
    'inference_status': 'not_started',
    'technical_validation_status': 'not_started',
    'audio_quality_status': 'PENDING_HUMAN_LISTENING',
    'audio_path': str(AUDIO_PATH),
    'audio_sha256': None,
    'error': None,
}
log_parts = []

def log(msg):
    s = str(msg)
    print(s)
    log_parts.append(s)

def write_diagnostics():
    LOG_PATH.write_text('\n'.join(log_parts) + '\n', encoding='utf-8')
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    with zipfile.ZipFile(ZIP_PATH, 'w', zipfile.ZIP_DEFLATED) as z:
        if AUDIO_PATH.exists(): z.write(AUDIO_PATH, AUDIO_PATH.name)
        z.write(MANIFEST_PATH, MANIFEST_PATH.name)
        z.write(LOG_PATH, LOG_PATH.name)

try:
    actual_text_hash = hashlib.sha256(SEGMENT_0_TEXT.encode('utf-8')).hexdigest()
    manifest['text_sha256_actual'] = actual_text_hash
    if actual_text_hash != EXPECTED_TEXT_SHA256:
        raise RuntimeError(f'Text hash mismatch')
    log(f'Text hash verified: {actual_text_hash}')
    manifest['text_verified'] = True
    log('done-structure')
except Exception as e:
    manifest['error'] = str(e)
    write_diagnostics()
    raise
write_diagnostics()
