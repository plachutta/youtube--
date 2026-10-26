#!/usr/bin/env python3
import os
import sys
import hashlib
import json
import time
from pathlib import Path

SEGMENT_0_TEXT = "How a single misspelling created the most iconic domain name in tech is about to change everything, and here's why..."
EXPECTED_TEXT_SHA256 = '7b292603c4308ecf92cc882e1e2cc21b5da57ccade71b51ec3078a57bb11f5a8'

out_dir = Path('/content/b9_22_kokoro')
out_dir.mkdir(parents=True, exist_ok=True)

manifest = {
  'run': 'b9_22',
  'engine': 'kokoro-82m',
  'created_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
  'input_hash_expected': EXPECTED_TEXT_SHA256,
  'python': sys.version,
}

actual = hashlib.sha256(SEGMENT_0_TEXT.encode()).hexdigest()
manifest['input_hash_actual'] = actual
manifest['input_hash_ok'] = actual == EXPECTED_TEXT_SHA256

try:
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--no-cache-dir', 'kokoro==0.9.4', 'soundfile', 'numpy'])
    manifest['install_ok'] = True
except Exception as e:
    manifest['install_ok'] = False
    manifest['install_error'] = str(e)

try:
    from kokoro import KPipeline
    import numpy as np
    import soundfile as sf
    kp = KPipeline(lang_code='a')
    chunks = []
    for _, _, a in kp(SEGMENT_0_TEXT, voice='af_heart'):
        chunks.append(np.array(a))
    if chunks:
        audio = np.concatenate(chunks)
        wav_path = out_dir / 'kokoro_82m.wav'
        sf.write(str(wav_path), audio, 24000)
        manifest['wav_path'] = str(wav_path)
        manifest['wav_size'] = wav_path.stat().st_size
        manifest['inference_ok'] = True
except Exception as e:
    manifest['inference_ok'] = False
    manifest['inference_error'] = str(e)

with open(out_dir / 'manifest.json', 'w') as f:
    json.dump(manifest, f, indent=2)
