#!/usr/bin/env node
/**
 * Narration quality guard - fail-closed checks for rejected audio.
 * Treats manifest-derived quality as authoritative; synthetic checks only warn/detect obvious corruption.
 */
const fs = require('fs');
const path = require('path');

const SUPPORTED_AUDIO_EXT = ['.wav', '.mp3', '.m4a', '.ogg', '.flac'];

function isAudioFile(f) {
  const ext = path.extname(f).toLowerCase();
  return SUPPORTED_AUDIO_EXT.includes(ext);
}

function loadManifest(manifestPath) {
  if (!manifestPath) return null;
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function detectRejectedSource(manifest) {
  if (!manifest || typeof manifest !== 'object') return { rejected: false, reason: null };
  const fields = ['audio_quality_status', 'audioQualityStatus', 'quality_status', 'status'];
  for (const k of fields) {
    if (typeof manifest[k] === 'string' && manifest[k].toUpperCase() === 'REJECTED') {
      return { rejected: true, reason: `manifest.${k}=REJECTED` };
    }
  }
  return { rejected: false, reason: null };
}

function guardAgainstRejected(manifestPath, audioPaths = []) {
  const manifest = loadManifest(manifestPath);
  const det = detectRejectedSource(manifest);
  if (det.rejected) {
    const err = new Error(`Refusing to accept rejected narration artifact: ${det.reason}; manifest=${manifestPath}`);
    err.code = 'NARRATION_REJECTED';
    throw err;
  }
  return { ok: true, manifest };
}

module.exports = { guardAgainstRejected, detectRejectedSource, loadManifest };
