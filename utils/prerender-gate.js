/**
 * PRE-RENDER QUALIFICATION GATE (B9.38)
 *
 * Establishes separate quality statuses instead of a single generic
 * "render succeeded" result. Statuses 8+ (render, media validation, visual
 * review) are NEVER marked passed by this module: during the no-render
 * milestone they remain explicitly NOT_PERFORMED.
 *
 * Fail-closed: missing payloads, caption loss, layout collisions, unsafe
 * margins, inconsistent canvas, unresolved provenance and unsupported facts
 * block the gate with precise scene/component diagnostics.
 */

const { validateSceneContracts } = require('./scene-contract');
const { validateCaptionIntegrity, validateSceneMapping } = require('./caption-contract');
const { layoutScene, validateLayout, CANONICAL_CANVAS, MIN_SAFE_MARGIN } = require('./layout-engine');

const GATE_STATUS = Object.freeze({
  CONTENT_VALIDATED: 'CONTENT_VALIDATED',
  SCENE_PLAN_VALIDATED: 'SCENE_PLAN_VALIDATED',
  VISUAL_PAYLOAD_VALIDATED: 'VISUAL_PAYLOAD_VALIDATED',
  ASSET_PROVENANCE_VALIDATED: 'ASSET_PROVENANCE_VALIDATED',
  CAPTION_INTEGRITY_VALIDATED: 'CAPTION_INTEGRITY_VALIDATED',
  LAYOUT_CONSTRAINTS_VALIDATED: 'LAYOUT_CONSTRAINTS_VALIDATED',
  ENGINE_INPUT_VALIDATED: 'ENGINE_INPUT_VALIDATED',
  RENDER_EXECUTED: 'RENDER_EXECUTED',
  MEDIA_TECHNICALLY_VALIDATED: 'MEDIA_TECHNICALLY_VALIDATED',
  VISUAL_QUALITY_REVIEWED: 'VISUAL_QUALITY_REVIEWED',
  FACTUALITY_AND_RIGHTS_REVIEWED: 'FACTUALITY_AND_RIGHTS_REVIEWED',
  PENDING_HUMAN_REVIEW: 'PENDING_HUMAN_REVIEW',
  HUMAN_ACCEPTED: 'HUMAN_ACCEPTED'
});

const NOT_PERFORMED = 'NOT_PERFORMED';

function finding(severity, code, message, extra = {}) {
  return { severity, code, message, ...extra };
}

function criticals(findings) {
  return findings.filter(item => item.severity === 'critical');
}

/**
 * Run every pre-render stage over contract-governed scenes.
 * Never renders anything; renderer stages receive validated data only.
 */
async function evaluate({
  scenes,
  captionCues,
  transcript,
  backend = null,
  measurer = null,
  canvas = CANONICAL_CANVAS,
  minSafeMargin = MIN_SAFE_MARGIN,
  productionMode = true
}) {
  const findings = [];
  const statuses = {};
  const layoutReports = [];

  // 1. Content validation: every scene maps to approved narration.
  const contentFindings = [];
  for (const scene of (Array.isArray(scenes) ? scenes : [])) {
    if (!scene.narration || !scene.narration.transcript || !scene.narration.transcript.trim()) {
      contentFindings.push(finding('critical', 'CONTENT_SEGMENT_UNRESOLVED',
        `scene ${scene.sceneId || '?'} has no resolved approved narration transcript`, { sceneId: scene.sceneId }));
    }
    if (!scene.productionLabel) {
      contentFindings.push(finding('warning', 'CONTENT_LABEL_MISSING',
        `scene ${scene.sceneId || '?'} has no production label`, { sceneId: scene.sceneId }));
    }
  }
  findings.push(...contentFindings);
  statuses[GATE_STATUS.CONTENT_VALIDATED] = criticals(contentFindings).length ? 'FAILED' : 'PASSED';

  // 2. Scene plan validation (purpose + takeaway present).
  const planFindings = [];
  for (const scene of (Array.isArray(scenes) ? scenes : [])) {
    if (!scene.purpose || !scene.keyTakeaway) {
      planFindings.push(finding('critical', 'SCENE_PLAN_INCOMPLETE',
        `scene ${scene.sceneId || '?'} lacks purpose/keyTakeaway`, { sceneId: scene.sceneId }));
    }
    if (scene.invalid) {
      planFindings.push(...(scene.findings || []));
    }
  }
  findings.push(...planFindings);
  statuses[GATE_STATUS.SCENE_PLAN_VALIDATED] = criticals(planFindings).length ? 'FAILED' : 'PASSED';

  // 3. Visual payload validation (typed union, no label-only scenes).
  const payloadResult = validateSceneContracts(scenes, { productionMode });
  payloadResult.perScene.forEach(result => {
    result.findings.forEach(item => findings.push({ ...item, sceneId: result.sceneId || item.sceneId || null }));
  });
  statuses[GATE_STATUS.VISUAL_PAYLOAD_VALIDATED] = payloadResult.ok ? 'PASSED' : 'FAILED';

  // 4. Asset provenance / rights.
  const provenanceFindings = [];
  for (const scene of (Array.isArray(scenes) ? scenes : [])) {
    const visual = scene.visual || {};
    if (visual.type === 'authorized_asset') {
      const rights = visual.payload && visual.payload.rights;
      if (!rights || rights.confirmed !== true) {
        provenanceFindings.push(finding('critical', 'ASSET_RIGHTS_UNCONFIRMED',
          `scene ${scene.sceneId || '?'} uses an asset without confirmed rights`, { sceneId: scene.sceneId }));
      }
      if (visual.provenance && visual.provenance.origin === 'unknown') {
        provenanceFindings.push(finding('critical', 'ASSET_PROVENANCE_UNKNOWN',
          `scene ${scene.sceneId || '?'} asset origin is unknown`, { sceneId: scene.sceneId }));
      }
    }
  }
  findings.push(...provenanceFindings);
  statuses[GATE_STATUS.ASSET_PROVENANCE_VALIDATED] = criticals(provenanceFindings).length ? 'FAILED' : 'PASSED';

  // 5. Caption integrity: full transcript coverage, ordered, positive durations.
  const captionResult = validateCaptionIntegrity({ transcript, cues: captionCues });
  findings.push(...captionResult.findings);
  const mappingResult = validateSceneMapping({ scenes, cues: captionCues });
  findings.push(...mappingResult.findings);
  statuses[GATE_STATUS.CAPTION_INTEGRITY_VALIDATED] = (captionResult.ok && mappingResult.ok) ? 'PASSED' : 'FAILED';

  // 6. Layout constraints (geometry, margins, collisions, density, canvas).
  let layoutOk = true;
  if (measurer) {
    for (const scene of (Array.isArray(scenes) ? scenes : [])) {
      const report = await layoutScene(scene, { captionCues, measurer, canvas });
      const validation = validateLayout(report, { canvas, minSafeMargin });
      layoutReports.push({ sceneId: scene.sceneId, report, validation });
      validation.findings.forEach(item => findings.push(item));
      if (!validation.ok) layoutOk = false;
    }
  } else {
    layoutOk = false;
    findings.push(finding('critical', 'LAYOUT_MEASURER_MISSING', 'no text measurer supplied; layout cannot be validated'));
  }
  statuses[GATE_STATUS.LAYOUT_CONSTRAINTS_VALIDATED] = layoutOk ? 'PASSED' : 'FAILED';

  // 7. Engine input validation (adapter receives only validated contracts).
  let engineOk = true;
  if (backend && typeof backend.validateInput === 'function') {
    const engineResult = backend.validateInput(scenes, { layoutReports: layoutReports.map(entry => entry.report) });
    engineResult.findings.forEach(item => findings.push(item));
    engineOk = engineResult.ok;
  } else {
    engineOk = false;
    findings.push(finding('critical', 'ENGINE_BACKEND_MISSING', 'no render backend supplied for engine input validation'));
  }
  statuses[GATE_STATUS.ENGINE_INPUT_VALIDATED] = engineOk ? 'PASSED' : 'FAILED';

  // Stages 8-12 are explicitly NOT performed by this module.
  statuses[GATE_STATUS.RENDER_EXECUTED] = NOT_PERFORMED;
  statuses[GATE_STATUS.MEDIA_TECHNICALLY_VALIDATED] = NOT_PERFORMED;
  statuses[GATE_STATUS.VISUAL_QUALITY_REVIEWED] = NOT_PERFORMED;
  statuses[GATE_STATUS.FACTUALITY_AND_RIGHTS_REVIEWED] = NOT_PERFORMED;
  statuses[GATE_STATUS.PENDING_HUMAN_REVIEW] = 'PENDING';
  statuses[GATE_STATUS.HUMAN_ACCEPTED] = 'NOT_ESTABLISHED';

  const passed = Object.values(statuses)
    .filter(status => status === 'FAILED').length === 0 &&
    criticals(findings).length === 0;

  return {
    gate: 'pre-render',
    passed,
    statuses,
    findings,
    layoutReports,
    canvas: { ...canvas },
    measurement: measurer ? { backend: measurer.backend } : null,
    note: 'A passed pre-render gate means inputs meet established contracts. It does not prove rendered output is good.'
  };
}

/** Throw a precise diagnostic when the gate did not pass. */
function assertPass(report) {
  if (report.passed) return report;
  const blocking = criticals(report.findings);
  const error = new Error(
    `Pre-render gate failed with ${blocking.length} blocking finding(s): ` +
    blocking.slice(0, 5).map(item => `${item.sceneId || 'global'}/${item.code}`).join('; ')
  );
  error.code = 'PRERENDER_GATE_FAILED';
  error.details = { findings: blocking, statuses: report.statuses };
  throw error;
}

/**
 * Legacy (pre-contract) bundles: run what can honestly be checked and
 * REFUSE to claim PRE_RENDER_GATE_PASSED. Used by SceneRepairService so the
 * legacy slideshow path keeps working for old bundles while recording that
 * the pre-render contract does not certify it.
 */
function assessLegacyBundle({ sceneCount, captionText = null, transcript = null }) {
  const findings = [
    finding('warning', 'LEGACY_BUNDLE_NOT_GOVERNED',
      'bundle has no contract-governed scene payloads; the pre-render gate cannot certify it'),
    finding('warning', 'LEGACY_TITLECARD_FALLBACK_POSSIBLE',
      'legacy slideshow composition may fall back to label-plus-text title cards; not covered by the new contracts')
  ];
  let captionStatus = 'NOT_APPLICABLE';
  if (captionText && transcript) {
    const cues = captionText.trim() ? captionText.trim().split(/\n\s*\n/).map((block, index) => {
      const lines = block.split('\n');
      return { index: index + 1, start: index, end: index + 1, text: lines.slice(2).join(' ') };
    }) : [];
    const result = validateCaptionIntegrity({ transcript, cues });
    findings.push(...result.findings);
    captionStatus = result.ok ? 'PASSED' : 'FAILED';
  }
  return {
    mode: 'legacy',
    passed: false,
    claimable: false,
    sceneCount,
    statuses: {
      [GATE_STATUS.VISUAL_PAYLOAD_VALIDATED]: 'NOT_APPLICABLE_LEGACY',
      [GATE_STATUS.CAPTION_INTEGRITY_VALIDATED]: captionStatus,
      [GATE_STATUS.LAYOUT_CONSTRAINTS_VALIDATED]: 'NOT_APPLICABLE_LEGACY',
      [GATE_STATUS.ENGINE_INPUT_VALIDATED]: 'NOT_APPLICABLE_LEGACY',
      [GATE_STATUS.RENDER_EXECUTED]: NOT_PERFORMED,
      [GATE_STATUS.PENDING_HUMAN_REVIEW]: 'PENDING'
    },
    findings,
    note: 'PRE_RENDER_GATE_PASSED is not claimable for legacy bundles.'
  };
}

module.exports = {
  GATE_STATUS,
  evaluate,
  assertPass,
  assessLegacyBundle
};
