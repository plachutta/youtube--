#!/usr/bin/env python3
"""B9.25c dependency diagnostic (no GPU, no inference).

Establishes exactly which transformers / huggingface-hub combination can
import qwen_tts 0.1.1, so the report states a proven root cause rather than
a guess.
"""
import json
import subprocess
import sys
from pathlib import Path

OUT = Path('/content/b9_25_depcheck')
OUT.mkdir(parents=True, exist_ok=True)
lines = []


def log(message):
    print(message, flush=True)
    lines.append(str(message))


def sh(args, timeout=900):
    log('$ ' + ' '.join(str(a) for a in args))
    proc = subprocess.run([str(a) for a in args], text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout)
    log((proc.stdout or '').strip()[-1500:] if (proc.stdout or '').strip() else '(no output)')
    log('[exit=%s]' % proc.returncode)
    return proc


results = {}

# baseline as shipped by the runtime
baseline = sh([sys.executable, '-c',
               'import transformers,huggingface_hub;print(transformers.__version__,huggingface_hub.__version__)'])
results['runtime_baseline'] = (baseline.stdout or '').strip().splitlines()[0] if baseline.stdout else None

combos = [
    ('transformers==4.57.3', 'preserve runtime huggingface-hub'),
    ('transformers==4.57.3 huggingface_hub==0.36.2', 'pip-resolved pair'),
]
for combo, label in combos:
    try:
        install = sh([sys.executable, '-m', 'pip', 'install', '--no-deps', 'qwen-tts==0.1.1'],
                     timeout=900)
        dep_install = sh([sys.executable, '-m', 'pip', 'install'] + combo.split(),
                         timeout=900)
        check = sh([sys.executable, '-c',
                    'import transformers,huggingface_hub;'
                    'from qwen_tts import Qwen3TTSModel;'
                    'print("IMPORT_OK",transformers.__version__,huggingface_hub.__version__)'],
                   timeout=600)
        results[label] = {
            'install_exit': install.returncode,
            'dep_install_exit': dep_install.returncode,
            'import_exit': check.returncode,
            'import_output': (check.stdout or '')[-600:],
        }
    except Exception as exc:  # noqa: BLE001
        results[label] = {'exception': str(exc)}

(OUT / 'results.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
(OUT / 'execution.log').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print('DEPCHECK_DONE', flush=True)
