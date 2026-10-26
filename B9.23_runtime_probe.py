#!/usr/bin/env python3
"""B9.23b runtime probe: locate a Python 3.12 path that can reach a GPU torch."""
import json
import os
import subprocess
import sys
from pathlib import Path

OUT = Path('/content/b9_23_probe')
OUT.mkdir(parents=True, exist_ok=True)
lines = []


def log(msg):
    print(msg, flush=True)
    lines.append(str(msg))


def sh(cmd):
    log('$ ' + ' '.join(map(str, cmd)))
    proc = subprocess.run([str(c) for c in cmd], text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    log((proc.stdout or '').strip()[-3000:] or '(no output)')
    log('[exit=%s]' % proc.returncode)
    return proc


result = {}

result['python3_12_binary'] = subprocess.run(
    ['sh', '-c', 'command -v python3.12 || command -v /usr/bin/python3.12 || true'],
    text=True, stdout=subprocess.PIPE).stdout.strip()

sh(['python3.12', '--version'])
sh(['python3.12', '-c', 'import sys;print(sys.path)'])

for layout in sorted(Path('/usr/local/lib').glob('python3.*/dist-packages')):
    torch_dir = layout / 'torch'
    result[str(layout)] = 'torch present' if torch_dir.exists() else 'no torch'

sh(['bash', '-lc',
    'ls -d /usr/local/lib/python3.*/dist-packages/torch 2>/dev/null | head; '
    'echo ---; du -sh /usr/local/lib/python3.13/dist-packages/torch 2>/dev/null; '
    'echo ---; ls /usr/local/lib/python3.12/dist-packages 2>/dev/null | head -20'])

sh(['df', '-h', '/content'])
sh(['nvidia-smi', '--query-gpu=name,memory.total,driver_version', '--format=csv'])

# Debian-packaged python3.12-venv availability
result['python3.12_venv'] = sh(
    ['bash', '-lc', '/usr/bin/python3.12 -m venv --help >/dev/null 2>&1 && echo venv-ok || echo venv-missing']).stdout.strip()

# Does the default torch import cleanly under 3.13, and can a 3.12 venv
# created by the *system* python3.12 see the 3.13 dist-packages?
probe = sh(['bash', '-lc',
            '/usr/bin/python3.12 -m venv --system-site-packages /tmp/v312sp 2>&1 | tail -2; '
            '/tmp/v312sp/bin/python -c "import sys;print(sys.version.split()[0]);'
            'import torch;print(torch.__version__)" 2>&1 | tail -3'])
result['system_site_packages_probe'] = probe.stdout.strip()

sh(['bash', '-lc',
    'python3.12 -m pip --version 2>&1 | head -2; '
    'python3.12 -c "import ensurepip" 2>&1 | tail -1'])

(OUT / 'probe.json').write_text(json.dumps(
    {'probe': result, 'log': lines}, indent=2), encoding='utf-8')
print('PROBE_COMPLETE', flush=True)
