#!/usr/bin/env node
const assert = require('assert');
const { validateSceneContract, VISUAL_TYPES } = require('../utils/scene-contract');

function baseScene(overrides = {}) {
  return {
    sceneId: 'scene_test',
    productionLabel: 'Introduction',
    purpose: 'Introduce the subject',
    keyTakeaway: 'The viewer learns the setup',
    narration: { transcript: 'Hey everyone, welcome back to the channel.' },
    timing: { startSec: 0, durationSec: 10 },
    visual: { type: VISUAL_TYPES.EXPLANATORY_CARD, payload: { statements: ['Hey everyone, welcome back to the channel.'] }, evidenceRefs: ['narration:scene_test'] },
    ...overrides
  };
}

function codes(result) { return result.findings.map(f => f.code); }

// A. Production labels stay metadata: label-only card fails; auto-heading from label fails.
{
  const labelOnly = baseScene({ visual: { type: VISUAL_TYPES.EXPLANATORY_CARD, payload: { statements: ['Introduction'] } } });
  const result = validateSceneContract(labelOnly);
  assert.strictEqual(result.ok, false, 'label-only card must fail');
  assert.ok(codes(result).includes('CARD_IS_LABEL_ONLY'));

  const autoHeading = baseScene({ viewerHeading: { text: 'Introduction', purpose: 'title', autoFromLabel: true } });
  const headingResult = validateSceneContract(autoHeading);
  assert.strictEqual(headingResult.ok, false, 'auto heading from production label must fail');
  assert.ok(codes(headingResult).includes('HEADING_AUTO_FROM_LABEL'));

  const explicitHeading = baseScene({ viewerHeading: { text: 'How registration really works', purpose: 'orient the viewer' } });
  assert.strictEqual(validateSceneContract(explicitHeading).ok, true, 'explicit purposeful heading must pass');
}

// F. Empty scene content fails (metadata + captions alone are not explanatory).
{
  const result = validateSceneContract(baseScene({ visual: undefined }));
  assert.strictEqual(result.ok, false);
  assert.ok(codes(result).includes('VISUAL_PAYLOAD_MISSING'));
  const empty = validateSceneContract(baseScene({ visual: { type: VISUAL_TYPES.EXPLANATORY_CARD, payload: {} } }));
  assert.ok(codes(empty).includes('CARD_STATEMENTS_INVALID'));
}

// D. Wrong data types / missing payload structure fail per type.
{
  const noSteps = validateSceneContract(baseScene({ visual: { type: VISUAL_TYPES.PROCESS_DIAGRAM, payload: { steps: [], edges: [] } } }));
  assert.ok(codes(noSteps).includes('PROCESS_STEPS_MISSING'));

  const badEdges = validateSceneContract(baseScene({
    visual: { type: VISUAL_TYPES.PROCESS_DIAGRAM, payload: { steps: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'zz' }] } }
  }));
  assert.ok(codes(badEdges).includes('PROCESS_EDGE_INVALID'));

  const badComparison = validateSceneContract(baseScene({
    visual: { type: VISUAL_TYPES.COMPARISON, payload: { left: { label: 'L', items: ['x'] }, right: { label: 'R', items: [] }, comparedAttributes: ['a'] } }
  }));
  assert.ok(codes(badComparison).includes('COMPARISON_OPERAND_INVALID'));

  const noTimeline = validateSceneContract(baseScene({ visual: { type: VISUAL_TYPES.TIMELINE, payload: { events: [{ label: 'only one' }] } } }));
  assert.ok(codes(noTimeline).includes('TIMELINE_EVENTS_MISSING'));

  const unsupported = validateSceneContract(baseScene({ visual: { type: 'meme_compilation', payload: {} } }));
  assert.ok(codes(unsupported).includes('VISUAL_TYPE_UNSUPPORTED'));
}

// G. Debug overlay in payload fails in production mode.
{
  const debugScene = baseScene();
  debugScene.visual.payload.debugElements = [{ debug: true, role: 'debug_overlay', box: { x: 1, y: 1, width: 10, height: 10 } }];
  const result = validateSceneContract(debugScene);
  assert.strictEqual(result.ok, false);
  assert.ok(codes(result).includes('DEBUG_OVERLAY_IN_PAYLOAD'));
}

// H. CTA without its required elements fails (related-video area).
{
  const result = validateSceneContract(baseScene({
    visual: { type: VISUAL_TYPES.CTA_END_CARD, payload: {
      ctaWording: 'Subscribe for more.',
      requiredElements: ['subscribe', 'related_video_area'],
      elements: [{ role: 'subscribe', label: 'Subscribe' }]
    } }
  }));
  assert.ok(codes(result).includes('CTA_REQUIRED_ELEMENT_ABSENT'));
}

// Unsupported numeric details fail without evidence.
{
  const result = validateSceneContract(baseScene({
    visual: { type: VISUAL_TYPES.DATA_VISUALIZATION, payload: { statLabel: 'Registrations in 1998', value: '42', source: { ref: 'x' } } }
  }));
  // year-like detail without evidence refs -> critical
  assert.ok(codes(result).includes('UNSUPPORTED_NUMERIC_DETAIL'));
}

console.log('ok');
