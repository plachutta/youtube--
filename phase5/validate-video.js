#!/usr/bin/env node
/** Phase 5 local validator - NEVER uploads. Usage: node phase5/validate-video.js <assetDir> */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function run(args, opts) {
  try { return execFileSync(args[0], args.slice(1), { encoding: 'utf8', ...opts }); }
  catch (e) { return (e.status !== 0 ? e.stdout || '' : ''); }
}

function sha256(p) { return 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

function j(ok, name, detail) { console.log(ok ? 'PASS  ' : 'FAIL  ' + name + (detail ? ' | ' + detail : '')); return ok; }

async function main() {
  const assetDir = path.resolve(process.argv[2] || '.');
  const out = { file: [], checks: [] };

  for (const f of ['final_video.mp4', 'audio_mix.m4a', 'captions.srt']) {
    const p = path.join(assetDir, f);
    out.file.push({ name: f, exists: fs.existsSync(p) });
    if (!fs.existsSync(p)) j(false, 'file-exists', f);
  }

  const mp4 = path.join(assetDir, 'final_video.mp4');
  if (fs.existsSync(mp4)) {
    const info = run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_name,duration', '-of', 'csv=p=0', mp4]);
    out.checks.push({ name: 'final-video-decode', pass: info.trim().length > 0, detail: info.trim() });
    console.log(info.trim() ? 'PASS  final-video-decode | ' + info.trim() : 'FAIL  final-video-decode | empty ffprobe output');
    const sum = run(['sha256sum', mp4]);
    out.file.push({ name: 'final_video.mp4', exists: true, sha256: sum.trim().split('  ')[0] });
  } else {
    j(false, 'final-video-decode', 'missing final_video.mp4');
  }

  const srt = path.join(assetDir, 'captions.srt');
  if (fs.existsSync(srt)) {
    const content = fs.readFileSync(srt, 'utf8');
    const blocks = content.trim().split(/\n\s*\n/).filter(Boolean);
    let monotonic = true;
    const times = [];
    for (const b of blocks) {
      const lines = b.split('\n');
      const m = /(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/.exec(lines[1]);
      if (!m) { monotonic = false; break; }
      const toS = (h, mi, s, ms) => +h * 3600 + +mi * 60 + +s + +ms / 1000;
      times.push([toS(...m[1].split(':').map(Number)), toS(...m[2].split(':').map(Number))]);
    }
    for (let i = 1; i < times.length; i++) if (times[i][0] < times[i - 1][1]) monotonic = false;
    out.checks.push({ name: 'srt-parseable', pass: blocks.length > 0, count: blocks.length });
    out.checks.push({ name: 'srt-monotonic', pass: monotonic, count: blocks.length });
    console.log((blocks.length > 0 ? 'PASS' : 'FAIL') + '  srt-parseable | cues=' + blocks.length);
    console.log(monotonic ? 'PASS' : 'FAIL') + '  srt-monotonic | cues=' + blocks.length;
  }

  console.log(JSON.stringify({ assetDir, file: out.file, checks: out.checks, overall: out.file.every(f => f.exists) && out.checks.every(c => c.pass) }, null, 2));
  process.exit(out.file.every(f => f.exists) && out.checks.every(c => c.pass) ? 0 : 1);
}

main().catch(e => { console.error('[validate] CRASH:', e.message); process.exit(1); });
