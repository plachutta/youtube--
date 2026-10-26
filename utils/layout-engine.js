/**
 * LAYOUT AND GEOMETRY ENGINE (B9.38)
 *
 * One canonical design space for the 1920x1080 production target.
 * All positions are explicit geometry; nothing is positioned by independent
 * hard-coded coordinates in render code.
 *
 * Reserved regions (pixels, 1920x1080):
 *   heading     - viewer-facing heading, only when explicitly declared
 *   visual      - primary explanatory visual content
 *   annotations - supporting labels under the visual
 *   captions    - bottom caption band (never the top of the frame)
 * Safe margin: >= 100px on every edge for all essential elements.
 *
 * Text measurement uses real font metrics through headless Chromium when
 * available (canvas measureText); a documented advance-width table is the
 * fallback. The measurement backend is recorded in every layout report.
 */

const CANONICAL_CANVAS = Object.freeze({ width: 1920, height: 1080 });
const MIN_SAFE_MARGIN = 100;
const MAX_TEXT_DENSITY = 0.28;
const FONT_STACK = 'Liberation Sans, Arial, DejaVu Sans, sans-serif';

const REGION_RATIOS = Object.freeze({
  heading: { x: 0.0625, y: 0.10, w: 0.875, h: 0.13 },
  visual: { x: 0.0625, y: 0.26, w: 0.875, h: 0.48 },
  annotations: { x: 0.0625, y: 0.755, w: 0.875, h: 0.045 },
  captions: { x: 0.078, y: 0.81, w: 0.844, h: 0.10 }
});

function regionBox(name, canvas = CANONICAL_CANVAS) {
  const ratio = REGION_RATIOS[name];
  return {
    x: Math.round(ratio.x * canvas.width),
    y: Math.round(ratio.y * canvas.height),
    width: Math.round(ratio.w * canvas.width),
    height: Math.round(ratio.h * canvas.height)
  };
}

// Narrow, semantic overlap authorizations. Text-vs-anything is NEVER allowed.
const AUTHORIZED_OVERLAP_RULES = Object.freeze([
  { kindA: 'connector', kindB: 'box', reason: 'connector passes behind diagram node' },
  { kindB: 'connector', kindA: 'box', reason: 'connector passes behind diagram node' }
]);

const TEXT_FONT_BOUNDS = Object.freeze({ minPx: 20, maxPx: 110 });
const ROLE_FONT_BOUNDS = Object.freeze({
  viewer_heading: { minPx: 40, maxPx: 96 },
  caption: { minPx: 26, maxPx: 44 },
  diagram_label: { minPx: 22, maxPx: 40 },
  cta_text: { minPx: 26, maxPx: 56 }
});

/* ------------------------------------------------------------------ */
/* Text measurement                                                    */
/* ------------------------------------------------------------------ */

// Approximate Helvetica/DejaVu advance widths (per 1000 em units) for the
// printable ASCII range. Used only when Chromium metrics are unavailable.
const TABLE_WIDTHS = (() => {
  const narrow = 'ijlt.,;:\'!|I ';
  const wide = 'mwMW@%';
  const table = {};
  for (let code = 32; code < 127; code += 1) {
    const ch = String.fromCharCode(code);
    if (narrow.includes(ch)) table[ch] = 300;
    else if (wide.includes(ch)) table[ch] = 850;
    else if (ch >= 'A' && ch <= 'Z') table[ch] = 680;
    else table[ch] = 560;
  }
  return table;
})();

function tableMeasure(text, { fontSizePx, weight }) {
  const perMille = [...String(text)].reduce((sum, ch) => sum + (TABLE_WIDTHS[ch] || 600), 0);
  const weightFactor = Number(weight) >= 600 ? 1.06 : 1.0;
  return (perMille / 1000) * fontSizePx * weightFactor;
}

function discoverChromiumExecutable() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const os = require('os');
  const fsLib = require('fs');
  const pathLib = require('path');
  const cacheRoot = process.env.PLAYWRIGHT_BROWSERS_PATH || pathLib.join(os.homedir(), '.cache', 'ms-playwright');
  try {
    const candidates = fsLib.readdirSync(cacheRoot)
      .filter(name => name.startsWith('chromium'))
      .sort()
      .reverse();
    for (const name of candidates) {
      const relative = [
        pathLib.join('chrome-headless-shell-linux64', 'chrome-headless-shell'),
        pathLib.join('chrome-linux', 'chrome'),
        pathLib.join('chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium')
      ];
      for (const tail of relative) {
        const full = pathLib.join(cacheRoot, name, tail);
        if (fsLib.existsSync(full)) return full;
      }
    }
  } catch (_error) {
    // no cache directory; fall through
  }
  return null;
}

/**
 * Create a text measurer. preferred: 'chromium' | 'table' | 'auto'.
 * The chromium backend renders no media; it measures glyph advances in a
 * headless browser page (canvas 2d context only).
 */
async function createTextMeasurer({ preferred = 'auto' } = {}) {
  if (preferred !== 'table') {
    try {
      const { chromium } = require('playwright');
      const executablePath = discoverChromiumExecutable();
      const browser = await chromium.launch(executablePath ? { headless: true, executablePath } : { headless: true });
      const page = await browser.newPage();
      await page.setContent('<!doctype html><html><body></body></html>');
      return {
        backend: 'chromium',
        async measureLine(text, { fontSizePx, weight = 400, fontFamily = FONT_STACK } = {}) {
          return page.evaluate(([value, size, fontWeight, family]) => {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            context.font = `${fontWeight} ${size}px ${family}`;
            const metrics = context.measureText(value);
            return { widthPx: metrics.width, ascentPx: metrics.actualBoundingBoxAscent, descentPx: metrics.actualBoundingBoxDescent };
          }, [String(text), fontSizePx, weight, fontFamily]);
        },
        async close() { await browser.close().catch(() => {}); }
      };
    } catch (_error) {
      // fall through to table backend
    }
  }
  return {
    backend: 'table',
    async measureLine(text, { fontSizePx, weight = 400 } = {}) {
      return { widthPx: tableMeasure(text, { fontSizePx, weight }), ascentPx: fontSizePx * 0.8, descentPx: fontSizePx * 0.2 };
    },
    async close() {}
  };
}

/* ------------------------------------------------------------------ */
/* Measurement-driven wrapping                                          */
/* ------------------------------------------------------------------ */

async function wrapText(measurer, text, { fontSizePx, weight = 400, maxWidthPx }) {
  const tokens = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const token of tokens) {
    const candidate = current ? `${current} ${token}` : token;
    const { widthPx } = await measurer.measureLine(candidate, { fontSizePx, weight });
    if (widthPx <= maxWidthPx || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = token;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function textElement({ id, role, lines, fontSizePx, weight = 400, box, zIndex = 5, align = 'left' }) {
  const lineHeight = Math.round(fontSizePx * 1.3);
  const height = Math.max(lineHeight, lines.length * lineHeight);
  return {
    id, role, kind: 'text', lines, font: { fontSizePx, weight, lineHeight, align },
    box: { x: box.x, y: box.y, width: box.width, height },
    zIndex
  };
}

function boxElement({ id, role, box, zIndex = 2, style = {} }) {
  return { id, role, kind: 'box', box, zIndex, style };
}

function connectorElement({ id, box, zIndex = 1 }) {
  return { id, role: 'connector', kind: 'connector', box, zIndex };
}

/* ------------------------------------------------------------------ */
/* Payload geometry: converts typed payloads into positioned elements   */
/* ------------------------------------------------------------------ */

async function layoutPayload(measurer, scene, visualRegion) {
  const { visual } = scene;
  const elements = [];
  const padding = 16;
  const inner = {
    x: visualRegion.x, y: visualRegion.y,
    width: visualRegion.width, height: visualRegion.height
  };

  if (visual.type === 'explanatory_card') {
    const fontSizePx = 44;
    let cursorY = inner.y;
    for (const [index, statement] of visual.payload.statements.entries()) {
      const lines = await wrapText(measurer, statement, { fontSizePx, weight: 500, maxWidthPx: inner.width - 80 });
      const element = await textElement({
        id: `card_statement_${index}`, role: 'card_statement', lines, fontSizePx, weight: 500,
        box: { x: inner.x + 40, y: cursorY, width: inner.width - 80, height: 0 }, zIndex: 5
      });
      elements.push(boxElement({ id: `card_bg_${index}`, role: 'card_bg', box: { x: inner.x + 20, y: cursorY - padding, width: inner.width - 40, height: element.box.height + padding * 2 }, zIndex: 2 }));
      elements.push(element);
      cursorY += element.box.height + padding * 2 + 12;
    }
    return elements;
  }

  if (visual.type === 'process_diagram') {
    const steps = visual.payload.steps;
    const perRow = Math.min(steps.length, steps.length > 4 ? 3 : steps.length);
    const rows = Math.ceil(steps.length / perRow);
    const gap = 36;
    const nodeWidth = Math.floor((inner.width - gap * (perRow - 1) - 40) / perRow);
    const availableHeight = Math.floor((inner.height - (rows - 1) * gap - 40) / rows);
    // Measure labels first so node geometry adapts to real text metrics.
    const labelFontPx = 28;
    const labelLineHeight = Math.round(labelFontPx * 1.3);
    const measured = [];
    let maxLabelHeight = 0;
    for (const step of steps) {
      const lines = await wrapText(measurer, step.label, { fontSizePx: labelFontPx, weight: 600, maxWidthPx: nodeWidth - 28 });
      const height = lines.length * labelLineHeight;
      maxLabelHeight = Math.max(maxLabelHeight, height);
      measured.push({ lines, height });
    }
    const nodeHeight = Math.max(90, Math.min(availableHeight, maxLabelHeight + 32));
    const positions = {};
    steps.forEach((_step, index) => {
      const row = Math.floor(index / perRow);
      const col = index % perRow;
      const inRow = Math.min(perRow, steps.length - row * perRow);
      const rowOffset = Math.floor((inner.width - (inRow * nodeWidth + (inRow - 1) * gap)) / 2);
      positions[steps[index].id] = {
        x: inner.x + rowOffset + col * (nodeWidth + gap),
        y: inner.y + 20 + row * (nodeHeight + gap + 24),
        width: nodeWidth, height: nodeHeight
      };
    });
    for (const [index, step] of steps.entries()) {
      const box = positions[step.id];
      const { lines, height } = measured[index];
      elements.push(boxElement({ id: `step_box_${index}`, role: 'diagram_node', box, zIndex: 2, style: { radius: 10 } }));
      elements.push(await textElement({
        id: `step_label_${index}`, role: 'diagram_label', lines, fontSizePx: labelFontPx, weight: 600,
        box: { x: box.x + 14, y: box.y + Math.max(14, Math.floor((box.height - height) / 2)), width: box.width - 28, height: 0 }, zIndex: 5
      }));
    }
    (visual.payload.edges || []).forEach((edge, index) => {
      const from = positions[edge.from];
      const to = positions[edge.to];
      if (!from || !to) return;
      const startX = from.x + from.width;
      const startY = from.y + Math.floor(from.height / 2);
      const endX = to.x;
      const endY = to.y + Math.floor(to.height / 2);
      elements.push(connectorElement({
        id: `edge_${index}`,
        box: { x: Math.min(startX, endX), y: Math.min(startY, endY) - 6, width: Math.abs(endX - startX) + 12, height: Math.abs(endY - startY) + 12 }
      }));
    });
    return elements;
  }

  if (visual.type === 'comparison') {
    const columnWidth = Math.floor((inner.width - 48) / 2);
    const sides = [
      { key: 'left', x: inner.x },
      { key: 'right', x: inner.x + columnWidth + 48 }
    ];
    for (const side of sides) {
      const entity = visual.payload[side.key];
      elements.push(boxElement({
        id: `compare_bg_${side.key}`, role: 'diagram_node',
        box: { x: side.x, y: inner.y + 10, width: columnWidth, height: inner.height - 40 }, zIndex: 2, style: { radius: 10 }
      }));
      const headerLines = await wrapText(measurer, entity.label, { fontSizePx: 32, weight: 700, maxWidthPx: columnWidth - 40 });
      elements.push(await textElement({
        id: `compare_header_${side.key}`, role: 'diagram_label', lines: headerLines, fontSizePx: 32, weight: 700,
        box: { x: side.x + 20, y: inner.y + 30, width: columnWidth - 40, height: 0 }, zIndex: 5
      }));
      let cursorY = inner.y + 40 + headerLines.length * 42 + 12;
      for (const [index, item] of entity.items.entries()) {
        const lines = await wrapText(measurer, `\u2022 ${item}`, { fontSizePx: 26, weight: 400, maxWidthPx: columnWidth - 56 });
        elements.push(await textElement({
          id: `compare_item_${side.key}_${index}`, role: 'diagram_label', lines, fontSizePx: 26, weight: 400,
          box: { x: side.x + 28, y: cursorY, width: columnWidth - 56, height: 0 }, zIndex: 5
        }));
        cursorY += lines.length * 34 + 10;
      }
    }
    const dividerX = inner.x + columnWidth + 24;
    elements.push(connectorElement({ id: 'compare_divider', box: { x: dividerX, y: inner.y + 10, width: 4, height: inner.height - 40 } }));
    return elements;
  }

  if (visual.type === 'timeline') {
    const events = [...visual.payload.events].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const rowHeight = Math.min(90, Math.floor((inner.height - 40) / events.length));
    events.forEach((event, index) => {
      const y = inner.y + 20 + index * rowHeight;
      elements.push(boxElement({ id: `timeline_marker_${index}`, role: 'diagram_node', box: { x: inner.x + 30, y: y + 6, width: 22, height: 22 }, zIndex: 3, style: { radius: 11 } }));
      if (index < events.length - 1) {
        elements.push(connectorElement({ id: `timeline_link_${index}`, box: { x: inner.x + 40, y: y + 28, width: 2, height: rowHeight - 22 } }));
      }
    });
    for (const [index, event] of events.entries()) {
      const y = inner.y + 20 + index * rowHeight;
      const label = event.whenLabel ? `${event.whenLabel} \u2014 ${event.label}` : event.label;
      const lines = await wrapText(measurer, label, { fontSizePx: 28, weight: 500, maxWidthPx: inner.width - 120 });
      elements.push(await textElement({
        id: `timeline_label_${index}`, role: 'diagram_label', lines, fontSizePx: 28, weight: 500,
        box: { x: inner.x + 72, y, width: inner.width - 120, height: 0 }, zIndex: 5
      }));
    }
    return elements;
  }

  if (visual.type === 'relationship_diagram') {
    // Vertical chain: one node per row. Deterministic, avoids diagonal edges.
    const nodes = visual.payload.nodes;
    const gap = 22;
    const nodeHeight = Math.max(56, Math.min(92, Math.floor((inner.height - (nodes.length - 1) * gap - 20) / nodes.length)));
    const nodeWidth = Math.min(760, inner.width - 200);
    const nodeX = inner.x + Math.floor((inner.width - nodeWidth) / 2);
    const positions = {};
    nodes.forEach((node, index) => {
      positions[node.id] = {
        x: nodeX,
        y: inner.y + 10 + index * (nodeHeight + gap),
        width: nodeWidth, height: nodeHeight
      };
    });
    for (const [index, node] of nodes.entries()) {
      const box = positions[node.id];
      elements.push(boxElement({ id: `rel_node_${index}`, role: 'diagram_node', box, zIndex: 2, style: { radius: 24 } }));
      const lines = await wrapText(measurer, node.label, { fontSizePx: 26, weight: 600, maxWidthPx: box.width - 28 });
      const labelHeight = lines.length * 34;
      elements.push(await textElement({
        id: `rel_label_${index}`, role: 'diagram_label', lines, fontSizePx: 26, weight: 600,
        box: { x: box.x + 14, y: box.y + Math.max(8, Math.floor((box.height - labelHeight) / 2)), width: box.width - 28, height: 0 }, zIndex: 5
      }));
    }
    (visual.payload.edges || []).forEach((edge, index) => {
      const from = positions[edge.from];
      const to = positions[edge.to];
      if (!from || !to) return;
      const centerX = from.x + Math.floor(from.width / 2);
      elements.push(connectorElement({
        id: `rel_edge_${index}`,
        box: { x: centerX - 3, y: from.y + from.height, width: 6, height: Math.max(2, to.y - (from.y + from.height)) }
      }));
    });
    return elements;
  }

  if (visual.type === 'interface_recreation') {
    const frame = { x: inner.x + 120, y: inner.y, width: inner.width - 240, height: inner.height - 30 };
    elements.push(boxElement({ id: 'window_chrome', role: 'diagram_node', box: frame, zIndex: 2, style: { radius: 8 } }));
    let cursorY = frame.y + 58;
    for (const [index, element] of visual.payload.elements.entries()) {
      const lines = await wrapText(measurer, `${element.label}`, { fontSizePx: 26, weight: 500, maxWidthPx: frame.width - 80 });
      elements.push(await textElement({
        id: `interface_row_${index}`, role: 'interface_label', lines, fontSizePx: 26, weight: 500,
        box: { x: frame.x + 32, y: cursorY, width: frame.width - 64, height: 0 }, zIndex: 5
      }));
      cursorY += lines.length * 34 + 18;
    }
    const badgeLines = await wrapText(measurer, 'Illustrative recreation \u2014 not a historical screenshot', { fontSizePx: 22, weight: 400, maxWidthPx: frame.width - 64 });
    elements.push(await textElement({
      id: 'illustrative_badge', role: 'annotation_text', lines: badgeLines, fontSizePx: 22, weight: 400,
      box: { x: frame.x + 32, y: frame.y + frame.height - 44, width: frame.width - 64, height: 0 }, zIndex: 5
    }));
    return elements;
  }

  if (visual.type === 'data_visualization') {
    const card = { x: inner.x + 240, y: inner.y + 40, width: inner.width - 480, height: inner.height - 120 };
    elements.push(boxElement({ id: 'stat_card', role: 'diagram_node', box: card, zIndex: 2, style: { radius: 12 } }));
    const valueLines = await wrapText(measurer, String(visual.payload.value), { fontSizePx: 88, weight: 700, maxWidthPx: card.width - 60 });
    elements.push(await textElement({
      id: 'stat_value', role: 'stat_label', lines: valueLines, fontSizePx: 88, weight: 700,
      box: { x: card.x + 30, y: card.y + 40, width: card.width - 60, height: 0 }, zIndex: 5
    }));
    const labelLines = await wrapText(measurer, visual.payload.statLabel, { fontSizePx: 30, weight: 500, maxWidthPx: card.width - 60 });
    elements.push(await textElement({
      id: 'stat_label', role: 'stat_label', lines: labelLines, fontSizePx: 30, weight: 500,
      box: { x: card.x + 30, y: card.y + card.height - 90, width: card.width - 60, height: 0 }, zIndex: 5
    }));
    return elements;
  }

  if (visual.type === 'authorized_asset') {
    const frame = { x: inner.x + 200, y: inner.y, width: inner.width - 400, height: inner.height - 20 };
    elements.push(boxElement({ id: 'asset_frame', role: 'diagram_node', box: frame, zIndex: 2 }));
    const lines = await wrapText(measurer, visual.payload.howItIllustrates, { fontSizePx: 26, weight: 500, maxWidthPx: frame.width - 48 });
    elements.push(await textElement({
      id: 'asset_caption', role: 'annotation_text', lines, fontSizePx: 26, weight: 500,
      box: { x: frame.x + 24, y: frame.y + frame.height - (lines.length * 34 + 24), width: frame.width - 48, height: 0 }, zIndex: 5
    }));
    return elements;
  }

  if (visual.type === 'cta_end_card') {
    const ctaLines = await wrapText(measurer, visual.payload.ctaWording, { fontSizePx: 44, weight: 700, maxWidthPx: inner.width - 200 });
    elements.push(await textElement({
      id: 'cta_wording', role: 'cta_text', lines: ctaLines, fontSizePx: 44, weight: 700,
      box: { x: inner.x + 100, y: inner.y + 30, width: inner.width - 200, height: 0 }, zIndex: 5, align: 'center'
    }));
    for (const [index, element] of (visual.payload.elements || []).entries()) {
      if (element.role === 'related_video_area') {
        const g = element.geometry;
        elements.push(boxElement({
          id: `related_video_area_${index}`, role: 'related_video_area',
          box: { x: Math.round(g.x * inner.width) + inner.x, y: Math.round(g.y * inner.height) + inner.y, width: Math.round(g.width * inner.width), height: Math.round(g.height * inner.height) },
          zIndex: 2, style: { radius: 10 }
        }));
        if (element.label) {
          const lines = await wrapText(measurer, element.label, { fontSizePx: 24, weight: 500, maxWidthPx: Math.round(g.width * inner.width) - 32 });
          elements.push(await textElement({
            id: `related_video_label_${index}`, role: 'diagram_label', lines, fontSizePx: 24, weight: 500,
            box: { x: Math.round(g.x * inner.width) + inner.x + 16, y: Math.round(g.y * inner.height) + inner.y + 16, width: Math.round(g.width * inner.width) - 32, height: 0 }, zIndex: 5
          }));
        }
      } else {
        const lines = await wrapText(measurer, element.label, { fontSizePx: 32, weight: 600, maxWidthPx: inner.width - 320 });
        elements.push(await textElement({
          id: `cta_element_${index}`, role: 'cta_text', lines, fontSizePx: 32, weight: 600,
          box: { x: inner.x + 160, y: inner.y + 120 + index * 70, width: inner.width - 320, height: 0 }, zIndex: 5
        }));
      }
    }
    return elements;
  }

  throw new Error(`No geometry generator for visual type ${visual.type}`);
}

/* ------------------------------------------------------------------ */
/* Scene layout                                                        */
/* ------------------------------------------------------------------ */

/**
 * Build the full element layout for one scene contract plus its caption cues.
 * Returns { canvas, sceneId, measurement, elements } — the geometry report
 * consumed by validateLayout and by render adapters.
 */
async function layoutScene(scene, { captionCues = [], measurer, canvas = CANONICAL_CANVAS, headingFontSizePx = 64, captionFontSizePx = 34 } = {}) {
  if (!measurer) throw new Error('layoutScene requires a text measurer');
  const elements = [];

  // 1. Viewer heading — ONLY when explicitly declared.
  const headingRegion = regionBox('heading', canvas);
  if (scene.viewerHeading && typeof scene.viewerHeading.text === 'string' && scene.viewerHeading.text.trim()) {
    const lines = await wrapText(measurer, scene.viewerHeading.text, { fontSizePx: headingFontSizePx, weight: 700, maxWidthPx: headingRegion.width });
    elements.push(await textElement({
      id: 'viewer_heading', role: 'viewer_heading', lines, fontSizePx: headingFontSizePx, weight: 700,
      box: headingRegion, zIndex: 6
    }));
  }

  // 2. Primary visual content from the typed payload.
  if (scene.visual) {
    const payloadElements = await layoutPayload(measurer, scene, regionBox('visual', canvas));
    elements.push(...payloadElements);
  }

  // 3. Caption cues — bottom band, wrapped with real metrics.
  const captionRegion = regionBox('captions', canvas);
  const activeCues = captionCues.filter(cue => {
    const midpoint = (cue.start + cue.end) / 2;
    return midpoint >= scene.timing.startSec && midpoint < scene.timing.startSec + scene.timing.durationSec;
  });
  const representative = activeCues.length ? activeCues : [];
  let maxCaptionLines = 0;
  for (const cue of representative) {
    const lines = await wrapText(measurer, cue.text, { fontSizePx: captionFontSizePx, weight: 400, maxWidthPx: captionRegion.width });
    maxCaptionLines = Math.max(maxCaptionLines, lines.length);
  }
  if (maxCaptionLines > 0) {
    const lineHeight = Math.round(captionFontSizePx * 1.32);
    elements.push({
      id: 'caption_band', role: 'caption_band', kind: 'reserved', zIndex: 4,
      box: { x: captionRegion.x, y: captionRegion.y, width: captionRegion.width, height: maxCaptionLines * lineHeight },
      cueCount: representative.length, maxLines: maxCaptionLines
    });
    elements.push(await textElement({
      id: 'caption_text', role: 'caption',
      lines: (representative[0] ? await wrapText(measurer, representative[0].text, { fontSizePx: captionFontSizePx, weight: 400, maxWidthPx: captionRegion.width }) : []),
      fontSizePx: captionFontSizePx, weight: 400,
      box: { ...captionRegion, height: maxCaptionLines * lineHeight }, zIndex: 10
    }));
  }

  return { canvas: { ...canvas }, sceneId: scene.sceneId, measurement: { backend: measurer.backend }, elements };
}

/* ------------------------------------------------------------------ */
/* Layout validation                                                   */
/* ------------------------------------------------------------------ */

function overlapArea(a, b) {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x * y;
}

function boxContains(outer, inner) {
  return inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 &&
    inner.x + inner.width <= outer.x + outer.width + 0.5 &&
    inner.y + inner.height <= outer.y + outer.height + 0.5;
}

function isAuthorizedOverlap(a, b) {
  if (AUTHORIZED_OVERLAP_RULES.some(rule =>
    (rule.kindA === a.kind && rule.kindB === b.kind) || (rule.kindA === b.kind && rule.kindB === a.kind))) {
    return true;
  }
  // A label fully contained inside its own diagram/card node box is normal
  // composition. Headings, captions and any text-vs-text pair are excluded.
  const pairs = [[a, b], [b, a]];
  for (const [inner, outer] of pairs) {
    if (inner.kind !== 'text' || outer.kind !== 'box') continue;
    if (inner.role === 'caption' || inner.role === 'viewer_heading' || inner.role === 'cta_text') continue;
    if (boxContains(outer.box, inner.box)) return true;
  }
  return false;
}

function finding(severity, code, message, extra = {}) {
  return { severity, code, message, sceneId: extra.sceneId || null, ...extra };
}

/**
 * Validate a layout report against the canonical geometry contract.
 * Fails on: canvas inconsistencies, out-of-bounds text, safe-margin
 * violations, unauthorized overlaps, overflow, excessive density,
 * unsupported font sizes, and invalid z-order.
 */
function validateLayout(report, { canvas = CANONICAL_CANVAS, minSafeMargin = MIN_SAFE_MARGIN, maxTextDensity = MAX_TEXT_DENSITY } = {}) {
  const findings = [];
  const sceneId = report.sceneId || null;
  const elements = Array.isArray(report.elements) ? report.elements : [];

  if (!report.canvas || report.canvas.width !== canvas.width || report.canvas.height !== canvas.height) {
    findings.push(finding('critical', 'CANVAS_DIMENSIONS_INCONSISTENT',
      `scene canvas ${report.canvas ? `${report.canvas.width}x${report.canvas.height}` : 'missing'} does not match the canonical ${canvas.width}x${canvas.height} contract`, { sceneId }));
  }
  const aspectCanvas = report.canvas || canvas;
  const aspect = aspectCanvas.width / aspectCanvas.height;
  if (Math.abs(aspect - 16 / 9) > 1e-6) {
    findings.push(finding('critical', 'CANVAS_ASPECT_UNAPPROVED',
      `unapproved canvas aspect ratio ${aspect.toFixed(4)}; letterboxing/dimensions must follow the single canvas contract`, { sceneId }));
  }

  let textBoxArea = 0;
  for (const element of elements) {
    const { box } = element;
    if (!box || ![box.x, box.y, box.width, box.height].every(Number.isFinite)) {
      findings.push(finding('critical', 'ELEMENT_BOX_INVALID', `element ${element.id} has invalid geometry`, { sceneId, elementId: element.id }));
      continue;
    }
    if (!Number.isInteger(element.zIndex) || element.zIndex < 0) {
      findings.push(finding('critical', 'ELEMENT_ZORDER_INVALID',
        `element ${element.id} has invalid zIndex; layer ordering must be explicit`, { sceneId, elementId: element.id }));
    }
    const isText = element.kind === 'text';
    const outOfCanvas = box.x < 0 || box.y < 0 || box.x + box.width > canvas.width || box.y + box.height > canvas.height;
    if (outOfCanvas && (isText || element.kind === 'reserved' || element.kind === 'slot')) {
      findings.push(finding('critical', 'CANVAS_OVERFLOW',
        `essential element ${element.id} extends outside the canvas`, { sceneId, elementId: element.id }));
    }
    if (isText && !element.decorative) {
      const marginViolations = [];
      if (box.x < minSafeMargin) marginViolations.push(`left ${box.x}px`);
      if (box.y < minSafeMargin) marginViolations.push(`top ${box.y}px`);
      if (box.x + box.width > canvas.width - minSafeMargin) marginViolations.push(`right ${canvas.width - (box.x + box.width)}px`);
      if (box.y + box.height > canvas.height - minSafeMargin) marginViolations.push(`bottom ${canvas.height - (box.y + box.height)}px`);
      if (marginViolations.length) {
        findings.push(finding('critical', 'SAFE_MARGIN_VIOLATION',
          `text element ${element.id} violates the ${minSafeMargin}px safe margin (${marginViolations.join(', ')})`, { sceneId, elementId: element.id }));
      }
      const size = element.font && element.font.fontSizePx;
      if (!Number.isFinite(size) || size < TEXT_FONT_BOUNDS.minPx || size > TEXT_FONT_BOUNDS.maxPx) {
        findings.push(finding('critical', 'FONT_SIZE_UNSUPPORTED',
          `element ${element.id} uses unsupported font size ${size}`, { sceneId, elementId: element.id }));
      } else {
        const roleBounds = ROLE_FONT_BOUNDS[element.role];
        if (roleBounds && (size < roleBounds.minPx || size > roleBounds.maxPx)) {
          findings.push(finding('critical', 'FONT_SIZE_OUT_OF_ROLE_BOUNDS',
            `element ${element.id} role ${element.role} requires font size ${roleBounds.minPx}-${roleBounds.maxPx}px, got ${size}px`, { sceneId, elementId: element.id }));
        }
      }
      textBoxArea += box.width * box.height;
    }
  }

  // Pairwise overlap checks.
  const significant = elements.filter(element => element.kind !== 'reserved');
  for (let i = 0; i < significant.length; i += 1) {
    for (let j = i + 1; j < significant.length; j += 1) {
      const a = significant[i];
      const b = significant[j];
      const area = overlapArea(a.box, b.box);
      if (area <= 1) continue;
      if (isAuthorizedOverlap(a, b)) continue;
      const aText = a.kind === 'text';
      const bText = b.kind === 'text';
      const severity = (aText && bText) || (aText && b.role === 'caption_band') || (bText && a.role === 'caption_band') ? 'critical' : 'critical';
      findings.push(finding(severity, 'LAYOUT_OVERLAP_UNAUTHORIZED',
        `elements ${a.id} (${a.kind}/${a.role}) and ${b.id} (${b.kind}/${b.role}) overlap by ${Math.round(area)}px^2 without an authorized semantic rule`,
        { sceneId, elementIds: [a.id, b.id] }));
    }
  }

  const density = textBoxArea / (canvas.width * canvas.height);
  if (density > maxTextDensity) {
    findings.push(finding('critical', 'TEXT_DENSITY_EXCEEDED',
      `scene text density ${(density * 100).toFixed(1)}% exceeds the ${(maxTextDensity * 100).toFixed(0)}% maximum`, { sceneId }));
  }

  return { ok: !findings.some(item => item.severity === 'critical'), findings, textDensity: density };
}

module.exports = {
  CANONICAL_CANVAS,
  MIN_SAFE_MARGIN,
  MAX_TEXT_DENSITY,
  FONT_STACK,
  REGION_RATIOS,
  AUTHORIZED_OVERLAP_RULES,
  createTextMeasurer,
  regionBox,
  wrapText,
  layoutScene,
  validateLayout
};
