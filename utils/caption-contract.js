/**
 * CAPTION AND TRANSCRIPT CONTRACT (B9.38)
 *
 * Separates four concepts that were previously collapsed:
 *   A. CANONICAL TRANSCRIPT - the complete approved spoken text.
 *   B. CAPTION CUES        - time-bounded, readable segments of that transcript.
 *   C. VISUAL TEXT         - viewer-facing text inside scene payloads (scene-contract.js).
 *   D. PRODUCTION METADATA - scene labels; never captions, never visual text.
 *
 * Normalization policy (documented, lossless for words):
 *   - Unicode NFKD, strip combining marks.
 *   - Curly quotes/dashes -> ASCII equivalents.
 *   - Lowercase.
 *   - Whitespace collapsed to single spaces.
 *   - SRT styling tags (<i>, {\\an8}, ...) removed.
 *   Words and punctuation are NEVER dropped to make validation pass.
 */

const TIME_RE = /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})$/;

function parseTimestamp(value) {
  const match = TIME_RE.exec(String(value || '').trim());
  if (!match) return null;
  const [, h, m, s, ms] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

function formatTimestamp(seconds) {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(totalMs / 3600000);
  const m = Math.floor((totalMs % 3600000) / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  const pad = (value, size) => String(value).padStart(size, '0');
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

function parseSRT(text) {
  const cues = [];
  const blocks = String(text || '').replace(/\r/g, '').split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length < 2) continue;
    let cursor = 0;
    let index = null;
    if (/^\d+$/.test(lines[0])) {
      index = Number(lines[0]);
      cursor = 1;
    }
    const timeLine = lines[cursor] || '';
    const parts = timeLine.split('-->').map(part => part.trim());
    if (parts.length !== 2) continue;
    const start = parseTimestamp(parts[0]);
    const end = parseTimestamp(parts[1]);
    if (start === null || end === null) continue;
    const body = lines.slice(cursor + 1);
    cues.push({ index, start, end, lines: body, text: body.join(' ') });
  }
  return cues;
}

function serializeSRT(cues) {
  const blocks = [];
  cues.forEach((cue, position) => {
    blocks.push([
      String(position + 1),
      `${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}`,
      ...(Array.isArray(cue.lines) && cue.lines.length ? cue.lines : [cue.text])
    ].join('\n'));
  });
  return blocks.join('\n\n') + (blocks.length ? '\n' : '');
}

function normalizeForComparison(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, ' ')           // SRT styling tags
    .replace(/\{\\[^}]*\}/g, ' ')      // ASS override tags
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')   // combining marks
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function words(text) {
  const normalized = normalizeForComparison(text);
  return normalized ? normalized.split(' ') : [];
}

function finding(severity, code, message, extra = {}) {
  return { severity, code, message, ...extra };
}

/**
 * Verify the ordered caption cues fully represent the canonical transcript.
 * Strict word-sequence equality after documented normalization: every transcript
 * word, in order, must appear in the cues; nothing may be silently dropped.
 */
function validateCaptionIntegrity({ transcript, cues }) {
  const findings = [];
  if (!Array.isArray(cues) || cues.length === 0) {
    findings.push(finding('critical', 'CAPTION_CUES_MISSING', 'no caption cues were produced'));
    return { ok: false, findings };
  }

  // Structural checks
  cues.forEach((cue, position) => {
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end)) {
      findings.push(finding('critical', 'CAPTION_TIME_INVALID', `cue ${position + 1} has non-numeric times`));
      return;
    }
    if (cue.end <= cue.start) {
      findings.push(finding('critical', 'CAPTION_DURATION_NOT_POSITIVE', `cue ${position + 1} has non-positive duration`));
    }
    if (position > 0 && cue.start < cues[position - 1].start) {
      findings.push(finding('critical', 'CAPTION_ORDER_INVALID', `cue ${position + 1} starts before the previous cue`));
    }
    if (position > 0 && cue.start < cues[position - 1].end - 1e-6) {
      findings.push(finding('warning', 'CAPTION_TIMES_OVERLAP', `cue ${position + 1} overlaps the previous cue`));
    }
    if (words(cue.text).length === 0) {
      findings.push(finding('critical', 'CAPTION_CUE_EMPTY', `cue ${position + 1} is empty`));
    }
  });

  // Coverage: concatenated cue words must equal transcript words exactly.
  const transcriptWords = words(transcript);
  const cueWords = cues.flatMap(cue => words(cue.text));
  if (transcriptWords.length === 0) {
    findings.push(finding('critical', 'TRANSCRIPT_EMPTY', 'canonical transcript is empty'));
  }
  if (cueWords.length !== transcriptWords.length) {
    const missingPrefix = transcriptWords.slice(0, cueWords.length).every((word, i) => cueWords[i] === word);
    const tail = transcriptWords.slice(Math.max(0, cueWords.length - 3)).join(' ');
    const head = transcriptWords.slice(0, 3).join(' ');
    if (cueWords.length < transcriptWords.length && missingPrefix) {
      findings.push(finding('critical', 'CAPTION_FINAL_WORDS_MISSING',
        `caption cues end early; the transcript continues after "${tail}" (${transcriptWords.length - cueWords.length} words lost)`));
    } else if (cueWords.length < transcriptWords.length) {
      findings.push(finding('critical', 'CAPTION_TEXT_TRUNCATED',
        `caption cue text does not match the transcript (expected to begin with "${head}")`));
    } else {
      findings.push(finding('critical', 'CAPTION_TEXT_EXTRA',
        'caption cues contain more words than the canonical transcript'));
    }
  } else {
    for (let i = 0; i < transcriptWords.length; i += 1) {
      if (cueWords[i] !== transcriptWords[i]) {
        findings.push(finding('critical', 'CAPTION_TEXT_DIVERGED',
          `caption word ${i + 1} ("${cueWords[i]}") diverges from transcript ("${transcriptWords[i]}"); spoken words may not be rewritten`));
        break;
      }
    }
  }

  return { ok: !findings.some(item => item.severity === 'critical'), findings };
}

/**
 * Verify every cue is timed inside the window of the scene whose transcript it
 * carries (detects mappings to incorrect narration segments).
 */
function validateSceneMapping({ scenes, cues }) {
  const findings = [];
  for (const cue of (Array.isArray(cues) ? cues : [])) {
    const midpoint = (cue.start + cue.end) / 2;
    const owning = (Array.isArray(scenes) ? scenes : []).find(scene =>
      midpoint >= scene.timing.startSec && midpoint < scene.timing.startSec + scene.timing.durationSec);
    if (!owning) {
      findings.push(finding('critical', 'CAPTION_UNMAPPED',
        `cue at ${cue.start.toFixed(2)}s does not fall inside any scene window`));
      continue;
    }
    const cueWords = words(cue.text);
    const sceneWords = words(owning.narration.transcript);
    const set = new Set(sceneWords);
    const foreign = cueWords.filter(word => !set.has(word));
    if (foreign.length > Math.max(1, cueWords.length * 0.34)) {
      findings.push(finding('critical', 'CAPTION_WRONG_SCENE_MAPPING',
        `cue at ${cue.start.toFixed(2)}s mostly does not belong to scene "${owning.productionLabel}"`));
    }
  }
  return { ok: !findings.some(item => item.severity === 'critical'), findings };
}

/**
 * Word-wrap a single cue into readable lines. Pure word wrapping; no character
 * mutilation. Long words are kept intact (and reported) rather than broken.
 */
function wrapCueLines(text, { maxLineChars = 42, maxLines = 0 } = {}) {
  const result = { lines: [], overflow: false, longWords: [] };
  const tokens = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const token of tokens) {
    if (token.length > maxLineChars) result.longWords.push(token);
    const candidate = current ? `${current} ${token}` : token;
    if (candidate.length <= maxLineChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = token;
    }
  }
  if (current) lines.push(current);
  if (maxLines > 0 && lines.length > maxLines) result.overflow = true;
  result.lines = lines;
  return result;
}

/**
 * Split a timed transcript into caption cues that fit the layout budget.
 * Every word is preserved; timing is allocated proportionally to word count.
 */
function segmentTranscriptToCues({ transcript, startSec, endSec, maxLineChars = 42, maxLinesPerCue = 2 }) {
  const tokens = String(transcript || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const duration = Math.max(0.001, endSec - startSec);
  const capacity = maxLineChars * maxLinesPerCue;

  // Greedily pack words into cue texts within the character capacity.
  const groups = [];
  let current = [];
  let currentChars = 0;
  for (const token of tokens) {
    const nextChars = currentChars + (current.length ? 1 : 0) + token.length;
    if (current.length && nextChars > capacity) {
      groups.push(current.join(' '));
      current = [token];
      currentChars = token.length;
    } else {
      current.push(token);
      currentChars = nextChars;
    }
  }
  if (current.length) groups.push(current.join(' '));

  const totalWords = tokens.length;
  const cues = [];
  let cursor = startSec;
  let consumed = 0;
  groups.forEach((group, position) => {
    const groupWords = group.split(' ').length;
    const isLast = position === groups.length - 1;
    const end = isLast ? endSec : startSec + duration * ((consumed + groupWords) / totalWords);
    cues.push({ start: cursor, end, lines: wrapCueLines(group, { maxLineChars }).lines, text: group });
    cursor = end;
    consumed += groupWords;
  });
  return cues;
}

/**
 * Enforce the layout budget on existing cues: oversized cues are split into
 * multiple cues with proportional timing. Content is never discarded.
 */
function fitCuesToLayout(cues, { maxLineChars = 42, maxLinesPerCue = 2 } = {}) {
  const fitted = [];
  for (const cue of (Array.isArray(cues) ? cues : [])) {
    const wrapped = wrapCueLines(cue.text, { maxLineChars, maxLines: maxLinesPerCue });
    if (!wrapped.overflow) {
      fitted.push({ ...cue, lines: wrapped.lines });
      continue;
    }
    const split = segmentTranscriptToCues({
      transcript: cue.text,
      startSec: cue.start,
      endSec: cue.end,
      maxLineChars,
      maxLinesPerCue
    });
    fitted.push(...split);
  }
  return fitted;
}

module.exports = {
  parseSRT,
  serializeSRT,
  parseTimestamp,
  formatTimestamp,
  normalizeForComparison,
  words,
  validateCaptionIntegrity,
  validateSceneMapping,
  wrapCueLines,
  segmentTranscriptToCues,
  fitCuesToLayout
};
