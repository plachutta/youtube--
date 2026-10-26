#!/usr/bin/env node
const assert = require('assert');
const le = require('../utils/layout-engine');

(async () => {
  const measurer = await le.createTextMeasurer();

  // E. Safe margin: essential text < 100px from the edge fails.
  {
    const report = {
      canvas: { ...le.CANONICAL_CANVAS }, sceneId: 's-margin',
      elements: [
        { id: 't1', kind: 'text', role: 'viewer_heading', zIndex: 5, font: { fontSizePx: 48 }, box: { x: 60, y: 120, width: 600, height: 60 } }
      ]
    };
    const v = le.validateLayout(report);
    assert.strictEqual(v.ok, false);
    assert.ok(v.findings.some(f => f.code === 'SAFE_MARGIN_VIOLATION'));
  }

  // D. Title/caption collision fails (the b9_37 failure pattern).
  {
    const report = {
      canvas: { ...le.CANONICAL_CANVAS }, sceneId: 's-collision',
      elements: [
        { id: 'caption', kind: 'text', role: 'caption', zIndex: 10, font: { fontSizePx: 34 }, box: { x: 150, y: 120, width: 1620, height: 120 } },
        { id: 'label', kind: 'text', role: 'viewer_heading', zIndex: 6, font: { fontSizePx: 64 }, box: { x: 200, y: 150, width: 1000, height: 110 } }
      ]
    };
    const v = le.validateLayout(report);
    assert.strictEqual(v.ok, false);
    assert.ok(v.findings.some(f => f.code === 'LAYOUT_OVERLAP_UNAUTHORIZED'));
  }

  // Text/diagram-label collision fails.
  {
    const report = {
      canvas: { ...le.CANONICAL_CANVAS }, sceneId: 's-label-collision',
      elements: [
        { id: 'l1', kind: 'text', role: 'diagram_label', zIndex: 5, font: { fontSizePx: 28 }, box: { x: 200, y: 400, width: 400, height: 40 } },
        { id: 'l2', kind: 'text', role: 'diagram_label', zIndex: 5, font: { fontSizePx: 28 }, box: { x: 400, y: 410, width: 400, height: 40 } }
      ]
    };
    assert.strictEqual(le.validateLayout(report).ok, false);
  }

  // Authorized overlap: connector passing behind a node passes.
  {
    const report = {
      canvas: { ...le.CANONICAL_CANVAS }, sceneId: 's-authorized',
      elements: [
        { id: 'node', kind: 'box', role: 'diagram_node', zIndex: 2, box: { x: 400, y: 400, width: 300, height: 100 } },
        { id: 'conn', kind: 'connector', role: 'connector', zIndex: 1, box: { x: 690, y: 440, width: 200, height: 20 } },
        { id: 'lbl', kind: 'text', role: 'diagram_label', zIndex: 5, font: { fontSizePx: 28 }, box: { x: 420, y: 430, width: 260, height: 40 } }
      ]
    };
    const v = le.validateLayout(report);
    assert.strictEqual(v.ok, true, `authorized overlaps must pass: ${JSON.stringify(v.findings)}`);
  }

  // I. Canvas inconsistency and unapproved aspect fail.
  {
    const report = {
      canvas: { width: 1280, height: 720 }, sceneId: 's-canvas',
      elements: [{ id: 't', kind: 'text', role: 'caption', zIndex: 5, font: { fontSizePx: 30 }, box: { x: 200, y: 400, width: 400, height: 40 } }]
    };
    const v = le.validateLayout(report);
    assert.ok(v.findings.some(f => f.code === 'CANVAS_DIMENSIONS_INCONSISTENT'));
    const odd = le.validateLayout({ ...report, canvas: { width: 1920, height: 1200 } });
    assert.ok(odd.findings.some(f => f.code === 'CANVAS_ASPECT_UNAPPROVED'));
  }

  // Overflow beyond canvas and invalid z-order fail.
  {
    const report = {
      canvas: { ...le.CANONICAL_CANVAS }, sceneId: 's-overflow',
      elements: [
        { id: 't', kind: 'text', role: 'caption', zIndex: 2.5, font: { fontSizePx: 30 }, box: { x: 1500, y: 1000, width: 600, height: 80 } }
      ]
    };
    const v = le.validateLayout(report);
    assert.ok(v.findings.some(f => f.code === 'CANVAS_OVERFLOW'));
    assert.ok(v.findings.some(f => f.code === 'ELEMENT_ZORDER_INVALID'));
  }

  // Excessive text density fails.
  {
    const elements = [];
    for (let i = 0; i < 8; i += 1) {
      elements.push({ id: `wall_${i}`, kind: 'text', role: 'card_statement', zIndex: 5, font: { fontSizePx: 44 }, box: { x: 120 + (i % 2) * 900, y: 120 + Math.floor(i / 2) * 200, width: 850, height: 190 } });
    }
    const v = le.validateLayout({ canvas: { ...le.CANONICAL_CANVAS }, sceneId: 's-density', elements });
    assert.ok(v.findings.some(f => f.code === 'TEXT_DENSITY_EXCEEDED' || f.code === 'LAYOUT_OVERLAP_UNAUTHORIZED'));
  }

  // Unsupported font sizes fail.
  {
    const v = le.validateLayout({
      canvas: { ...le.CANONICAL_CANVAS }, sceneId: 's-font',
      elements: [{ id: 'tiny', kind: 'text', role: 'caption', zIndex: 5, font: { fontSizePx: 8 }, box: { x: 200, y: 400, width: 300, height: 20 } }]
    });
    assert.ok(v.findings.some(f => ['FONT_SIZE_UNSUPPORTED', 'FONT_SIZE_OUT_OF_ROLE_BOUNDS'].includes(f.code)));
  }

  // End-to-end: a real planned scene lays out and validates cleanly.
  {
    const scene = {
      sceneId: 's-real', productionLabel: 'The Setup', purpose: 'p', keyTakeaway: 'k',
      narration: { transcript: 'Someone picks the words they want, types them into a registrar, and sends a request across the internet. The registrar checks whether the exact string is already taken.' },
      timing: { startSec: 0, durationSec: 13.3 },
      visual: { type: 'process_diagram', payload: {
        steps: [
          { id: 'a', label: 'Someone picks the words they want' },
          { id: 'b', label: 'Types them into a registrar' },
          { id: 'c', label: 'The registrar checks whether the exact string is already taken' }
        ],
        edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]
      } }
    };
    const report = await le.layoutScene(scene, {
      captionCues: [{ start: 0, end: 6, text: 'Someone picks the words they want, types them into a registrar.' }],
      measurer
    });
    const v = le.validateLayout(report);
    assert.strictEqual(v.ok, true, `real scene layout must pass: ${JSON.stringify(v.findings)}`);
    assert.ok(['chromium', 'table'].includes(report.measurement.backend));
  }

  await measurer.close();
  console.log('ok');
})().catch(error => { console.error(error); process.exit(1); });
