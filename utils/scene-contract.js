/**
 * STRUCTURED SCENE CONTRACT (B9.38)
 *
 * Single authoritative scene contract for viewer-facing productions.
 *
 * Responsibilities separated here:
 *   A. Production metadata      -> sceneId, productionLabel, position (NEVER viewer content)
 *   B. Approved narration       -> narration.transcript (canonical spoken text)
 *   C. Viewer-facing heading    -> viewerHeading (explicit, optional, purposeful)
 *   D. Explanatory purpose      -> purpose, keyTakeaway
 *   E. Structured visual payload-> visual.type + visual.payload (typed union, validated)
 *   F. Facts and evidence       -> visual.evidenceRefs, numericClaims
 *   G. Asset provenance/rights  -> visual.provenance / payload.rights
 *   H. Timing                   -> timing {startSec, durationSec}
 *   I. Validation state         -> validation {status, findings}
 *
 * A production label such as "Hook", "Introduction" or "Conclusion" is
 * production metadata by default. It must never automatically become a
 * viewer-facing heading. An on-screen heading requires the explicit
 * `viewerHeading` field with a defined purpose.
 */

const CONTRACT_VERSION = 1;

const VISUAL_TYPES = Object.freeze({
  EXPLANATORY_CARD: 'explanatory_card',
  PROCESS_DIAGRAM: 'process_diagram',
  COMPARISON: 'comparison',
  TIMELINE: 'timeline',
  RELATIONSHIP_DIAGRAM: 'relationship_diagram',
  INTERFACE_RECREATION: 'interface_recreation',
  DATA_VISUALIZATION: 'data_visualization',
  CTA_END_CARD: 'cta_end_card',
  AUTHORIZED_ASSET: 'authorized_asset'
});

const SUPPORTED_VISUAL_TYPES = new Set(Object.values(VISUAL_TYPES));

// Roles whose glyphs must never overlap any other element.
const TEXT_ROLES = new Set([
  'viewer_heading', 'caption', 'diagram_label', 'annotation_text',
  'cta_text', 'card_statement', 'interface_label', 'axis_label', 'stat_label'
]);

function finding(severity, code, message, extra = {}) {
  return { severity, code, message, ...extra };
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function collectDebugElements(node, trail, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectDebugElements(item, `${trail}[${index}]`, out));
    return;
  }
  if (node.debug === true || node.role === 'debug_overlay' || node.type === 'debug_overlay') {
    out.push(trail);
  }
  for (const [key, value] of Object.entries(node)) {
    if (value && typeof value === 'object') collectDebugElements(value, `${trail}.${key}`, out);
  }
}

function validateSteps(payload, findings) {
  const steps = payload.steps;
  if (!Array.isArray(steps) || steps.length < 2) {
    findings.push(finding('critical', 'PROCESS_STEPS_MISSING',
      'process_diagram requires at least two ordered steps with labels'));
    return false;
  }
  let ok = true;
  const ids = new Set();
  steps.forEach((step, index) => {
    if (!isPlainObject(step) || !nonEmptyString(step.id) || !nonEmptyString(step.label)) {
      findings.push(finding('critical', 'PROCESS_STEP_INVALID',
        `process_diagram step ${index} requires non-empty id and label`));
      ok = false;
      return;
    }
    if (ids.has(step.id)) {
      findings.push(finding('critical', 'PROCESS_STEP_DUPLICATE_ID',
        `process_diagram step id "${step.id}" is duplicated`));
      ok = false;
    }
    ids.add(step.id);
  });
  const edges = payload.edges;
  if (!Array.isArray(edges) || edges.length < 1) {
    findings.push(finding('critical', 'PROCESS_EDGES_MISSING',
      'process_diagram requires directed relationships (edges) between steps'));
    ok = false;
  } else {
    edges.forEach((edge, index) => {
      if (!isPlainObject(edge) || !ids.has(edge.from) || !ids.has(edge.to)) {
        findings.push(finding('critical', 'PROCESS_EDGE_INVALID',
          `process_diagram edge ${index} must reference declared step ids`));
        ok = false;
      }
    });
  }
  return ok;
}

function validateComparison(payload, findings) {
  let ok = true;
  for (const side of ['left', 'right']) {
    const entity = payload[side];
    if (!isPlainObject(entity) || !nonEmptyString(entity.label) || !Array.isArray(entity.items) || entity.items.length < 1) {
      findings.push(finding('critical', 'COMPARISON_OPERAND_INVALID',
        `comparison requires a ${side} entity with a label and at least one item`));
      ok = false;
    } else if (entity.items.some(item => !nonEmptyString(item))) {
      findings.push(finding('critical', 'COMPARISON_ITEM_INVALID',
        `comparison ${side} items must be non-empty strings`));
      ok = false;
    }
  }
  if (ok && payload.left.label.trim() === payload.right.label.trim()) {
    findings.push(finding('critical', 'COMPARISON_LABELS_IDENTICAL',
      'comparison left and right semantic labels must differ'));
    ok = false;
  }
  const attributes = payload.comparedAttributes;
  if (!Array.isArray(attributes) || attributes.length < 1 || attributes.some(attr => !nonEmptyString(attr))) {
    findings.push(finding('critical', 'COMPARISON_ATTRIBUTES_MISSING',
      'comparison must declare the exact attributes being compared'));
    ok = false;
  }
  return ok;
}

function validateTimeline(payload, findings) {
  const events = payload.events;
  if (!Array.isArray(events) || events.length < 2) {
    findings.push(finding('critical', 'TIMELINE_EVENTS_MISSING',
      'timeline requires at least two ordered events'));
    return false;
  }
  let ok = true;
  events.forEach((event, index) => {
    if (!isPlainObject(event) || !nonEmptyString(event.label)) {
      findings.push(finding('critical', 'TIMELINE_EVENT_INVALID',
        `timeline event ${index} requires a non-empty label`));
      ok = false;
      return;
    }
    if (event.order !== undefined && (!Number.isInteger(event.order) || event.order < 0)) {
      findings.push(finding('critical', 'TIMELINE_ORDER_INVALID',
        `timeline event ${index} order must be a non-negative integer`));
      ok = false;
    }
  });
  return ok;
}

function validateRelationshipDiagram(payload, findings) {
  const nodes = payload.nodes;
  const edges = payload.edges;
  let ok = true;
  if (!Array.isArray(nodes) || nodes.length < 2) {
    findings.push(finding('critical', 'RELATIONSHIP_NODES_MISSING',
      'relationship_diagram requires at least two nodes'));
    ok = false;
  }
  const ids = new Set();
  (Array.isArray(nodes) ? nodes : []).forEach((node, index) => {
    if (!isPlainObject(node) || !nonEmptyString(node.id) || !nonEmptyString(node.label)) {
      findings.push(finding('critical', 'RELATIONSHIP_NODE_INVALID',
        `relationship_diagram node ${index} requires id and label`));
      ok = false;
      return;
    }
    ids.add(node.id);
  });
  if (!Array.isArray(edges) || edges.length < 1) {
    findings.push(finding('critical', 'RELATIONSHIP_EDGES_MISSING',
      'relationship_diagram requires directed relationships between nodes'));
    ok = false;
  } else {
    edges.forEach((edge, index) => {
      if (!isPlainObject(edge) || !ids.has(edge.from) || !ids.has(edge.to)) {
        findings.push(finding('critical', 'RELATIONSHIP_EDGE_INVALID',
          `relationship_diagram edge ${index} must reference declared node ids`));
        ok = false;
      }
    });
  }
  return ok;
}

function validateInterfaceRecreation(payload, findings) {
  let ok = true;
  if (!nonEmptyString(payload.action)) {
    findings.push(finding('critical', 'INTERFACE_ACTION_MISSING',
      'interface_recreation must describe the action or process being explained'));
    ok = false;
  }
  if (!Array.isArray(payload.elements) || payload.elements.length < 1) {
    findings.push(finding('critical', 'INTERFACE_ELEMENTS_MISSING',
      'interface_recreation requires at least one element to show'));
    ok = false;
  } else {
    payload.elements.forEach((element, index) => {
      if (!isPlainObject(element) || !nonEmptyString(element.role) || !nonEmptyString(element.label)) {
        findings.push(finding('critical', 'INTERFACE_ELEMENT_INVALID',
          `interface_recreation element ${index} requires role and label`));
        ok = false;
      }
    });
  }
  if (payload.illustrative !== true) {
    findings.push(finding('critical', 'INTERFACE_NOT_MARKED_ILLUSTRATIVE',
      'interface_recreation must set illustrative=true unless authenticity has been established and evidenced'));
    ok = false;
  }
  return ok;
}

function validateDataVisualization(payload, findings) {
  let ok = true;
  if (!nonEmptyString(payload.statLabel) || payload.value === undefined || !nonEmptyString(String(payload.value))) {
    findings.push(finding('critical', 'DATA_STAT_INVALID',
      'data_visualization requires a statLabel and a value'));
    ok = false;
  }
  if (!isPlainObject(payload.source) || !nonEmptyString(payload.source.ref)) {
    findings.push(finding('critical', 'DATA_SOURCE_MISSING',
      'data_visualization numeric details require an evidence reference (unsupported numeric details are critical)'));
    ok = false;
  }
  return ok;
}

function validateCtaEndCard(payload, findings) {
  let ok = true;
  if (!nonEmptyString(payload.ctaWording)) {
    findings.push(finding('critical', 'CTA_WORDING_MISSING',
      'cta_end_card requires the approved call-to-action wording'));
    ok = false;
  }
  const required = payload.requiredElements;
  if (!Array.isArray(required) || required.length < 1 || required.some(item => !nonEmptyString(item))) {
    findings.push(finding('critical', 'CTA_REQUIRED_ELEMENTS_MISSING',
      'cta_end_card must declare its required visual elements'));
    return false;
  }
  const elements = Array.isArray(payload.elements) ? payload.elements : [];
  const present = new Set(elements.map(element => (isPlainObject(element) ? element.role : element)));
  for (const role of required) {
    if (!present.has(role)) {
      findings.push(finding('critical', 'CTA_REQUIRED_ELEMENT_ABSENT',
        `cta_end_card is missing required element "${role}"`));
      ok = false;
    }
  }
  if (required.includes('related_video_area')) {
    const slot = elements.find(element => isPlainObject(element) && element.role === 'related_video_area');
    const geometryOk = isPlainObject(slot) && isPlainObject(slot.geometry) &&
      ['x', 'y', 'width', 'height'].every(key => Number.isFinite(slot.geometry[key]));
    if (!geometryOk) {
      findings.push(finding('critical', 'CTA_RELATED_VIDEO_GEOMETRY_MISSING',
        'cta_end_card related-video area requires reserved geometry {x,y,width,height}'));
      ok = false;
    }
  }
  return ok;
}

function validateAuthorizedAsset(payload, findings) {
  let ok = true;
  if (!nonEmptyString(payload.assetRef)) {
    findings.push(finding('critical', 'ASSET_REF_MISSING',
      'authorized_asset requires an asset reference'));
    ok = false;
  }
  const rights = payload.rights;
  if (!isPlainObject(rights) || !nonEmptyString(rights.source) || rights.confirmed !== true) {
    findings.push(finding('critical', 'ASSET_RIGHTS_UNRESOLVED',
      'authorized_asset requires resolved rights (source + confirmed=true)'));
    ok = false;
  }
  if (!nonEmptyString(payload.howItIllustrates)) {
    findings.push(finding('critical', 'ASSET_MEANING_MISSING',
      'authorized_asset must state how the asset illustrates the narration (no misrepresented illustrative assets)'));
    ok = false;
  }
  return ok;
}

function validateExplanatoryCard(payload, findings, scene) {
  const statements = payload.statements;
  if (!Array.isArray(statements) || statements.length < 1 || statements.length > 3 ||
      statements.some(item => !nonEmptyString(item))) {
    findings.push(finding('critical', 'CARD_STATEMENTS_INVALID',
      'explanatory_card requires 1-3 non-empty viewer-facing statements'));
    return false;
  }
  const label = nonEmptyString(scene.productionLabel) ? scene.productionLabel.trim().toLowerCase() : null;
  const onlyLabel = statements.every(statement => statement.trim().toLowerCase() === label);
  if (label && onlyLabel) {
    findings.push(finding('critical', 'CARD_IS_LABEL_ONLY',
      'explanatory_card statements must carry explanatory content; a production label alone is not explanatory content'));
    return false;
  }
  return true;
}

const PAYLOAD_VALIDATORS = Object.freeze({
  [VISUAL_TYPES.EXPLANATORY_CARD]: (payload, findings, scene) => validateExplanatoryCard(payload, findings, scene),
  [VISUAL_TYPES.PROCESS_DIAGRAM]: (payload, findings) => validateSteps(payload, findings),
  [VISUAL_TYPES.COMPARISON]: (payload, findings) => validateComparison(payload, findings),
  [VISUAL_TYPES.TIMELINE]: (payload, findings) => validateTimeline(payload, findings),
  [VISUAL_TYPES.RELATIONSHIP_DIAGRAM]: (payload, findings) => validateRelationshipDiagram(payload, findings),
  [VISUAL_TYPES.INTERFACE_RECREATION]: (payload, findings) => validateInterfaceRecreation(payload, findings),
  [VISUAL_TYPES.DATA_VISUALIZATION]: (payload, findings) => validateDataVisualization(payload, findings),
  [VISUAL_TYPES.CTA_END_CARD]: (payload, findings) => validateCtaEndCard(payload, findings),
  [VISUAL_TYPES.AUTHORIZED_ASSET]: (payload, findings) => validateAuthorizedAsset(payload, findings)
});



/**
 * Validate one scene contract. Returns { ok, findings }.
 * ok === false means the scene must not reach a renderer (fail-closed).
 */
function validateSceneContract(scene, options = {}) {
  const findings = [];
  const productionMode = options.productionMode !== false;

  if (!isPlainObject(scene)) {
    return { ok: false, findings: [finding('critical', 'SCENE_NOT_OBJECT', 'scene contract must be an object')] };
  }
  if (!nonEmptyString(scene.sceneId)) {
    findings.push(finding('critical', 'SCENE_ID_MISSING', 'scene requires a stable sceneId'));
  }
  if (!nonEmptyString(scene.productionLabel)) {
    findings.push(finding('warning', 'SCENE_LABEL_MISSING', 'scene has no production label (metadata)'));
  }
  if (!nonEmptyString(scene.purpose)) {
    findings.push(finding('critical', 'SCENE_PURPOSE_MISSING',
      'scene must declare its intended explanatory purpose'));
  }
  if (!nonEmptyString(scene.keyTakeaway)) {
    findings.push(finding('critical', 'SCENE_TAKEAWAY_MISSING',
      'scene must declare what the viewer should understand'));
  }

  // Canonical transcript: required for caption integrity verification.
  if (!nonEmptyString(scene.narration?.transcript)) {
    findings.push(finding('critical', 'SCENE_TRANSCRIPT_MISSING',
      'scene must reference the canonical approved narration transcript'));
  }
  if (scene.narration?.acceptedAudioRef != null && !nonEmptyString(scene.narration.acceptedAudioRef)) {
    findings.push(finding('critical', 'SCENE_NARRATION_REF_INVALID',
      'narration.acceptedAudioRef must be a non-empty reference when present'));
  }

  // Viewer heading is explicit and optional; production labels never auto-promote.
  if (scene.viewerHeading !== undefined && scene.viewerHeading !== null) {
    const heading = scene.viewerHeading;
    if (!isPlainObject(heading) || !nonEmptyString(heading.text) || !nonEmptyString(heading.purpose)) {
      findings.push(finding('critical', 'VIEWER_HEADING_INVALID',
        'viewerHeading requires explicit text and a defined purpose'));
    } else if (nonEmptyString(scene.productionLabel) &&
               heading.text.trim().toLowerCase() === scene.productionLabel.trim().toLowerCase() &&
               heading.autoFromLabel === true) {
      findings.push(finding('critical', 'HEADING_AUTO_FROM_LABEL',
        'a viewer heading may not be auto-generated from a production label'));
    }
  }

  // Timing
  if (!isPlainObject(scene.timing) || !Number.isFinite(scene.timing.durationSec) || scene.timing.durationSec <= 0) {
    findings.push(finding('critical', 'SCENE_TIMING_INVALID', 'scene timing requires a positive durationSec'));
  }

  // Visual payload: typed union validation. Missing payload is critical.
  const visual = scene.visual;
  if (!isPlainObject(visual)) {
    findings.push(finding('critical', 'VISUAL_PAYLOAD_MISSING',
      'scene has no structured visual payload; a label plus narration paragraph is not explanatory content'));
  } else if (!nonEmptyString(visual.type) || !SUPPORTED_VISUAL_TYPES.has(visual.type)) {
    findings.push(finding('critical', 'VISUAL_TYPE_UNSUPPORTED',
      `visual.type must be one of: ${[...SUPPORTED_VISUAL_TYPES].join(', ')}`));
  } else if (!isPlainObject(visual.payload)) {
    findings.push(finding('critical', 'VISUAL_PAYLOAD_EMPTY', 'visual.payload must be an object for the declared type'));
  } else {
    PAYLOAD_VALIDATORS[visual.type](visual.payload, findings, scene);

    const evidenceRefs = visual.evidenceRefs;
    if (!Array.isArray(evidenceRefs) || evidenceRefs.length < 1) {
      findings.push(finding('warning', 'VISUAL_EVIDENCE_REFS_MISSING',
        'visual payload has no evidence references; add refs or record an explicit unresolved-claim decision'));
    }

    // Numeric claims require evidence (critical).
    const serialized = JSON.stringify(visual.payload);
    const numericClaims = visual.numericClaims;
    if (Array.isArray(numericClaims) && numericClaims.length > 0) {
      const refs = new Set(Array.isArray(evidenceRefs) ? evidenceRefs : []);
      numericClaims.forEach((claim, index) => {
        if (!isPlainObject(claim) || !nonEmptyString(claim.value) || !refs.has(claim.evidenceRef)) {
          findings.push(finding('critical', 'UNSUPPORTED_NUMERIC_DETAIL',
            `numeric claim ${index} lacks a resolved evidence reference`));
        }
      });
    } else if (/\b(19|20)\d{2}\b/.test(serialized) && (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0)) {
      findings.push(finding('critical', 'UNSUPPORTED_NUMERIC_DETAIL',
        'payload contains year-like numeric details without evidence references'));
    }

    if (visual.type === VISUAL_TYPES.AUTHORIZED_ASSET && isPlainObject(visual.provenance) &&
        !nonEmptyString(visual.provenance.origin)) {
      findings.push(finding('critical', 'ASSET_PROVENANCE_MISSING',
        'asset-backed visual requires provenance.origin'));
    }
  }

  // Debug overlays must never ride along in production payloads.
  const debugTrails = [];
  collectDebugElements(scene, 'scene', debugTrails);
  if (debugTrails.length > 0 && productionMode) {
    findings.push(finding('critical', 'DEBUG_OVERLAY_IN_PAYLOAD',
      `debug/diagnostic elements are not allowed in production payloads: ${debugTrails.join(', ')}`));
  }

  const ok = !findings.some(item => item.severity === 'critical');
  return { ok, findings };
}

/** Convenience: validate a list of scene contracts. */
function validateSceneContracts(scenes, options = {}) {
  const list = Array.isArray(scenes) ? scenes : [];
  const perScene = list.map(scene => ({
    sceneId: scene && scene.sceneId ? scene.sceneId : null,
    ...validateSceneContract(scene, options)
  }));
  return {
    ok: perScene.every(result => result.ok),
    perScene
  };
}

module.exports = {
  CONTRACT_VERSION,
  VISUAL_TYPES,
  SUPPORTED_VISUAL_TYPES,
  TEXT_ROLES,
  validateSceneContract,
  validateSceneContracts
};
