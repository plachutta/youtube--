#!/usr/bin/env node
/**
 * B9.26 hosted Qwen runner (local side).
 *
 * Creates a fresh Colab session, submits B9.26_qwen_hosted_run.py, and then
 * polls the remote directory, downloading each artifact the moment it
 * appears so a dropped session cannot cost the results. Releases the session
 * once the remote terminal marker is observed, and it refuses to submit
 * while any other session is already active.
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SESSION = process.env.B926_SESSION || 'b926-qwen-2-20261013';
const GPU = process.env.B926_GPU || 'T4';
const SCRIPT = path.join(__dirname, '..', 'B9.26_qwen_hosted_run.py');
const LAB = '/home/gachiemeshackson/Videos/agenttube-reference-lab/hosted-runs/b9-26-qwen';
const POLL_MS = Number(process.env.B926_POLL_MS || 20000);
const MAX_POLLS = Number(process.env.B926_MAX_POLLS || 60);

function colab(args) {
  return execFileSync('colab', args, { encoding: 'utf8', timeout: 175000 });
}

fs.mkdirSync(LAB, { recursive: true });

(async () => {
  const sessions = colab(['sessions']).split('\n')
    .map((line) => line.trim()).filter(Boolean)
    .filter((line) => !line.startsWith('[colab]'));
  if (sessions.length) {
    console.error(`BLOCKED: active session(s): ${sessions.join(' | ')}`);
    process.exit(3);
  }

  const submit = (args) => {
    try {
      return { out: colab(args), error: null };
    } catch (error) {
      return { out: '', error };
    }
  };

  console.log(submit(['new', '-s', SESSION, '--gpu', GPU]).out.trim());
  const exec = submit(['exec', '-s', SESSION, '-f', SCRIPT, '--timeout', '1800']);
  if (exec.error) console.log(`submission returned uncertain status: ${exec.error.message}`);
  else console.log((exec.out || '').trim().split('\n').slice(-4).join('\n'));

  let terminal = null;
  for (let poll = 0; poll < MAX_POLLS; poll += 1) {
    let listing = '';
    let listError = null;
    const attempt = submit(['ls', '-s', SESSION, '/content/b9_26_qwen']);
    listing = attempt.out;
    listError = attempt.error;
    if (listing) {
      for (const line of listing.split('\n').map((entry) => entry.trim()).filter(Boolean)) {
        if (line.startsWith('[colab]')) continue;
        const got = submit(['download', '-s', SESSION, `/content/b9_26_qwen/${line}`, path.join(LAB, line)]);
        if (!got.error && !fs.existsSync(path.join(LAB, line))) {
          // some CLI versions report success without writing; ignore, retry next poll
        }
      }
      const statusFile = path.join(LAB, 'STATUS.txt');
      if (fs.existsSync(statusFile)) {
        terminal = fs.readFileSync(statusFile, 'utf8').trim();
        console.log(`remote terminal marker: ${terminal}`);
        break;
      }
      const wavs = listing.split('\n').filter((line) => line.trim().endsWith('.wav')).length;
      console.log(`poll ${poll}: ${wavs} remote wav(s) retrieved`);
    } else if (listError) {
      console.log(`poll ${poll}: remote listing unavailable (${listError.message.slice(0, 60)})`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  if (!terminal) {
    console.log('no terminal marker observed; retrieving whatever exists and releasing');
  }

  // Final eager retrieval pass.
  const finalLs = submit(['ls', '-s', SESSION, '/content/b9_26_qwen']);
  if (finalLs.out) {
    for (const line of finalLs.out.split('\n').map((entry) => entry.trim()).filter(Boolean)) {
      if (line.startsWith('[colab]')) continue;
      if (!fs.existsSync(path.join(LAB, line))) {
        submit(['download', '-s', SESSION, `/content/b9_26_qwen/${line}`, path.join(LAB, line)]);
      }
    }
  }

  try {
    console.log(submit(['stop', '-s', SESSION]).out.trim() || 'session released');
  } catch (error) {
    console.log(`stop reported: ${error.message}`);
  }
  console.log(`artifacts in ${LAB}: ${fs.readdirSync(LAB).join(', ') || 'none'}`);
  process.exit(terminal ? 0 : 2);
})().catch((error) => {
  console.error(`runner failure: ${error && error.message}`);
  process.exit(1);
});
