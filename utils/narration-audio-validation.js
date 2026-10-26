/**
 * Technical validation for narration audio artifacts.
 *
 * This layer only verifies that a file satisfies the *media* contract.
 * It can never establish that speech is intelligible or pleasant — that
 * judgement is reserved for human review (`QUALITY.HUMAN_ACCEPTED`).
 *
 * Parses RIFF/WAVE containers directly so validation is deterministic and
 * has no dependency on ffmpeg or a decoder being installed.
 */

'use strict';

const { TECHNICAL, QUALITY } = require('./narration-contract');

const EXPECTED_SAMPLE_RATE = 24000;
const EXPECTED_CHANNELS = 1;
const MIN_DURATION_SECONDS = 0.5;
const MAX_DURATION_SECONDS = 300;
const SILENCE_RMS_RATIO = 0.0005;
const CLIPPED_SAMPLE_RATIO = 0.02;

function parseWav(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44) {
    return { error: 'file is too small to be a WAV container' };
  }
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') {
    return { error: 'missing RIFF header' };
  }
  if (buffer.toString('ascii', 8, 12) !== 'WAVE') {
    return { error: 'missing WAVE format' };
  }
  let offset = 12;
  let format = null;
  let dataOffset = null;
  let dataLength = null;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ') {
      format = {
        audioFormat: buffer.readUInt16LE(offset + 8),
        channels: buffer.readUInt16LE(offset + 10),
        sampleRate: buffer.readUInt32LE(offset + 12),
        bitsPerSample: buffer.readUInt16LE(offset + 22),
      };
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataLength = chunkSize;
    }
    if (format && dataOffset !== null) break;
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  if (!format) return { error: 'missing fmt chunk' };
  if (dataOffset === null) return { error: 'missing data chunk' };
  if (dataLength > buffer.length - dataOffset) dataLength = buffer.length - dataOffset;
  if (format.audioFormat !== 1) return { error: `non-PCM audio format ${format.audioFormat}` };
  if (format.bitsPerSample !== 16) return { error: `unsupported bit depth ${format.bitsPerSample}` };
  const bytesPerSample = format.bitsPerSample / 8;
  const frameSize = bytesPerSample * format.channels;
  const frameCount = Math.floor(dataLength / frameSize);
  if (frameCount <= 0) return { error: 'no decodable samples in data chunk' };
  return { format, dataOffset, dataLength, frameCount, frameSize, bytesPerSample };
}

function measureSignal(buffer, wav) {
  const totalSamples = wav.frameCount * wav.format.channels;
  let peak = 0;
  let sumSquares = 0;
  let clipped = 0;
  let nonFinite = 0;
  for (let frame = 0; frame < wav.frameCount; frame += 1) {
    for (let channel = 0; channel < wav.format.channels; channel += 1) {
      const index = wav.dataOffset + (frame * wav.frameSize) + (channel * wav.bytesPerSample);
      const value = buffer.readInt16LE(index);
      const magnitude = Math.abs(value);
      if (magnitude > peak) peak = magnitude;
      sumSquares += value * value;
      if (magnitude >= 32767) clipped += 1;
      if (!Number.isFinite(value)) nonFinite += 1;
    }
  }
  return {
    samples: totalSamples,
    peak,
    rms: totalSamples ? Math.sqrt(sumSquares / totalSamples) : 0,
    clippedSamples: clipped,
    clippedRatio: totalSamples ? clipped / totalSamples : 0,
    nonFiniteSamples: nonFinite,
  };
}

/**
 * Validate a narration audio buffer against the shared media contract.
 * Returns a structured result; never throws for bad audio.
 */
function validateNarrationAudio(buffer, options = {}) {
  const result = {
    valid: false,
    technicalValidation: TECHNICAL.NOT_RUN,
    quality: QUALITY.NOT_ASSESSED,
    errors: [],
    warnings: [],
    measurements: null,
    format: null,
  };

  const wav = parseWav(buffer);
  if (wav.error) {
    result.technicalValidation = TECHNICAL.FAIL;
    result.quality = QUALITY.REJECTED;
    result.errors.push(wav.error);
    return result;
  }

  result.format = wav.format;
  const measurements = measureSignal(buffer, wav);
  const durationSeconds = wav.frameCount / wav.format.sampleRate;
  result.measurements = {
    samples: measurements.samples,
    frameCount: wav.frameCount,
    sampleRate: wav.format.sampleRate,
    channels: wav.format.channels,
    bitsPerSample: wav.format.bitsPerSample,
    durationSeconds: Number(durationSeconds.toFixed(4)),
    peak: measurements.peak,
    rms: Number(measurements.rms.toFixed(4)),
    clippedSamples: measurements.clippedSamples,
    clippedRatio: Number(measurements.clippedRatio.toFixed(6)),
    nonFiniteSamples: measurements.nonFiniteSamples,
  };

  const declaredRate = options.expectedSampleRate || EXPECTED_SAMPLE_RATE;
  const declaredChannels = options.expectedChannels || EXPECTED_CHANNELS;

  if (wav.format.sampleRate !== declaredRate) {
    result.errors.push(`sample rate ${wav.format.sampleRate} does not match expected ${declaredRate}`);
  }
  if (wav.format.channels !== declaredChannels) {
    result.errors.push(`channel count ${wav.format.channels} does not match expected ${declaredChannels}`);
  }
  if (durationSeconds < MIN_DURATION_SECONDS) {
    result.errors.push(`duration ${durationSeconds.toFixed(3)}s is below ${MIN_DURATION_SECONDS}s`);
  }
  if (durationSeconds > MAX_DURATION_SECONDS) {
    result.errors.push(`duration ${durationSeconds.toFixed(3)}s exceeds ${MAX_DURATION_SECONDS}s`);
  }
  if (measurements.nonFiniteSamples > 0) {
    result.errors.push('audio contains non-finite samples');
  }
  if (measurements.rms <= 0) {
    result.errors.push('audio is completely silent');
  } else if (measurements.rms < 32768 * SILENCE_RMS_RATIO) {
    result.errors.push('audio is effectively silent');
  }
  if (measurements.clippedRatio > CLIPPED_SAMPLE_RATIO) {
    result.errors.push(`audio is clipped (${(measurements.clippedRatio * 100).toFixed(2)}% of samples at full scale)`);
  }

  if (result.errors.length === 0) {
    result.valid = true;
    result.technicalValidation = TECHNICAL.PASS;
    result.warnings.push('technical validation does not establish speech intelligibility or voice quality; human listening review is still required');
  } else {
    result.technicalValidation = TECHNICAL.FAIL;
    result.quality = QUALITY.REJECTED;
  }
  return result;
}

/** Encode mono float samples in [-1, 1] to a 16-bit RIFF/WAVE buffer. */
function encodeWavFromFloat(samples, sampleRate = EXPECTED_SAMPLE_RATE) {
  if (!Array.isArray(samples) && !ArrayBuffer.isView(samples)) {
    throw new TypeError('samples must be an array or typed array');
  }
  if (samples.length === 0) throw new Error('cannot encode an empty sample array');
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, Number(samples[index]) || 0));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + (index * 2));
  }
  return buffer;
}

module.exports = {
  EXPECTED_SAMPLE_RATE,
  EXPECTED_CHANNELS,
  MIN_DURATION_SECONDS,
  MAX_DURATION_SECONDS,
  parseWav,
  measureSignal,
  validateNarrationAudio,
  encodeWavFromFloat,
};
