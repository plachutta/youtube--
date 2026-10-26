/**
 * MOTION CANVAS ADAPTER (B9.38)
 *
 * Maps the project's validated scene contract + layout report into Motion
 * Canvas scene inputs (a deterministic JSON engine plan). Motion Canvas
 * internals never leak past this adapter.
 *
 * Activation boundary:
 *   mode=disabled      -> refuses everything (default; production safety)
 *   mode=validate_only -> validates contracts and builds engine plans;
 *                         NEVER renders
 *   mode=render        -> still refuses until a future milestone sets the
 *                         render implementation flag after visual validation
 *
 * Reference engine: https://github.com/motion-canvas/motion-canvas (MIT)
 * Exporter:        https://github.com/motion-canvas/exporters (MIT)
 * Assembly/encoding stays with the existing FFmpeg pipeline (DECISION 2).
 */

const crypto = require('crypto');
const {
  BACKEND_MODES,
  RENDER_AUTHORIZATION_TOKEN,
  resolveBackendMode,
  backendDisabledError,
  renderNotAuthorizedError
} = require('./backend-contract');
const { SUPPORTED_VISUAL_TYPES } = require('../scene-contract');
const { CANONICAL_CANVAS } = require('../layout-engine');

const ENGINE_PLAN_VERSION = 1;

// Documented style tokens (no renderer-side invention at draw time).
const STYLE_TOKENS = Object.freeze({
  background: '#0b1020',
  surface: '#141b2d',
  accent: '#2dd4bf',
  accentSoft: 'rgba(45, 212, 191, 0.25)',
  textPrimary: '#f8fafc',
  textMuted: '#94a3b8',
  fontFamily: 'Liberation Sans, Arial, sans-serif'
});

function finding(severity, code, message, extra = {}) {
  return { severity, code, message, ...extra };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

class MotionCanvasAdapter {
  constructor({ mode = BACKEND_MODES.DISABLED, authorizationToken = null, env = process.env } = {}) {
    this.id = 'motion-canvas';
    this.engineRevision = '7b91435c301d530351dcf5ebb91dd139c002e405'; // cloned reference lab revision
    this.engineVersion = '3.17.2';
    this.mode = mode !== BACKEND_MODES.DISABLED ? mode : resolveBackendMode(env.MOTION_CANVAS_BACKEND);
    this.authorizationToken = authorizationToken || env.MOTION_CANVAS_RENDER_TOKEN || null;
    // No production code path sets this true during B9.38.
    this.renderImplementationEnabled = false;
    this.capabilities = Object.freeze({
      vectorGraphics: true,
      processDiagrams: true,
      comparisons: true,
      timelines: true,
      relationshipDiagrams: true,
      interfaceRecreations: true,
      ctaEndCards: true,
      controlledTypography: true,
      deterministicTimeline: true,
      voiceOverSync: 'audio-reference-only',
      captionBurn: false,      // captions remain an assembly-phase concern (FFmpeg)
      finalEncoding: false     // final assembly/encoding stays with FFmpeg
    });
  }

  assertUsable() {
    if (this.mode === BACKEND_MODES.DISABLED) throw backendDisabledError(this.id);
  }

  /**
   * Validate scene contracts + layout reports before any engine input exists.
   * Unsupported payload types and malformed/missing layouts are rejected with
   * specific diagnostics.
   */
  validateInput(scenes, { layoutReports = [] } = {}) {
    const findings = [];
    const reportsByScene = new Map(layoutReports.map(report => [report.sceneId, report]));
    for (const scene of (Array.isArray(scenes) ? scenes : [])) {
      const sceneId = scene.sceneId || null;
      if (!scene.visual || !SUPPORTED_VISUAL_TYPES.has(scene.visual.type)) {
        findings.push(finding('critical', 'ADAPTER_UNSUPPORTED_PAYLOAD',
          `scene ${sceneId || '?'} declares no supported visual payload type`, { sceneId }));
        continue;
      }
      const report = reportsByScene.get(scene.sceneId);
      if (!report || !Array.isArray(report.elements) || report.elements.length === 0) {
        findings.push(finding('critical', 'ADAPTER_LAYOUT_MISSING',
          `scene ${sceneId || '?'} has no validated layout report; the adapter refuses geometry-free input`, { sceneId }));
        continue;
      }
      const hasVisualContent = report.elements.some(element => element.kind === 'box' || element.kind === 'connector');
      if (!hasVisualContent) {
        findings.push(finding('critical', 'ADAPTER_SCENE_HAS_NO_VISUAL_CONTENT',
          `scene ${sceneId || '?'} layout contains no visual geometry (label-plus-caption scenes are not renderable)`, { sceneId }));
      }
      for (const element of report.elements) {
        if (element.debug === true || element.role === 'debug_overlay') {
          findings.push(finding('critical', 'ADAPTER_DEBUG_ELEMENT_PRESENT',
            `scene ${sceneId || '?'} layout carries a debug element (${element.id}); debug overlays are never engine input`, { sceneId }));
        }
      }
      if (scene.visual.type === 'cta_end_card') {
        const required = scene.visual.payload.requiredElements || [];
        const present = new Set((scene.visual.payload.elements || []).map(element => element.role || element));
        for (const role of required) {
          if (!present.has(role)) {
            findings.push(finding('critical', 'ADAPTER_CTA_ELEMENT_MISSING',
              `scene ${sceneId || '?'} end card is missing required element "${role}"`, { sceneId }));
          }
        }
      }
    }
    return { ok: !findings.some(item => item.severity === 'critical'), findings };
  }

  /**
   * Build the deterministic engine plan (Motion Canvas scene inputs) from
   * validated scene contracts and their validated layout reports.
   * Same inputs always produce the same plan (stable hash).
   */
  buildEnginePlan(scenes, { layoutReports = [], captionCues = [], fps = 30, canvas = CANONICAL_CANVAS } = {}) {
    this.assertUsable();
    const validation = this.validateInput(scenes, { layoutReports });
    if (!validation.ok) {
      const error = new Error(`Motion Canvas engine input invalid: ${validation.findings.map(item => item.code).join(', ')}`);
      error.code = 'ADAPTER_INPUT_INVALID';
      error.details = validation.findings;
      throw error;
    }
    const reportsByScene = new Map(layoutReports.map(report => [report.sceneId, report]));
    const planScenes = [];
    for (const scene of scenes) {
      const report = reportsByScene.get(scene.sceneId);
      const frames = Math.max(1, Math.round(scene.timing.durationSec * fps));
      const startFrame = Math.round(scene.timing.startSec * fps);
      const sceneCues = captionCues.filter(cue => {
        const midpoint = (cue.start + cue.end) / 2;
        return midpoint >= scene.timing.startSec && midpoint < scene.timing.startSec + scene.timing.durationSec;
      });
      planScenes.push({
        sceneId: scene.sceneId,
        productionLabel: scene.productionLabel, // metadata; never drawn
        startFrame,
        frames,
        fps,
        audioRef: scene.narration.acceptedAudioRef || null,
        visualType: scene.visual.type,
        style: STYLE_TOKENS,
        nodes: report.elements
          .filter(element => element.kind !== 'reserved')
          .map(element => ({
            id: element.id,
            kind: element.kind,
            role: element.role,
            zIndex: element.zIndex,
            box: element.box,
            lines: element.lines || null,
            font: element.font || null,
            style: element.style || null,
            revealAtFrame: 0
          })),
        captions: sceneCues.map(cue => ({ startFrame: Math.round(cue.start * fps), endFrame: Math.round(cue.end * fps), lines: cue.lines || [cue.text] })),
        transitions: {
          enter: { type: 'fade', frames: Math.round(0.4 * fps) },
          exit: { type: 'fade', frames: Math.round(0.4 * fps) },
          note: 'scene assembly and audio muxing remain FFmpeg responsibilities'
        }
      });
    }
    planScenes.sort((a, b) => a.startFrame - b.startFrame);
    const plan = {
      version: ENGINE_PLAN_VERSION,
      backend: this.id,
      engineRevision: this.engineRevision,
      engineVersion: this.engineVersion,
      canvas: { ...canvas },
      fps,
      style: STYLE_TOKENS,
      scenes: planScenes,
      assembly: {
        engine: 'ffmpeg-qualified-pipeline',
        note: 'final video assembly, audio integration and encoding stay with the existing FFmpeg pipeline'
      }
    };
    plan.planSha256 = crypto.createHash('sha256').update(stableStringify(plan)).digest('hex');
    return plan;
  }

  /**
   * Render step. FAIL-CLOSED in B9.38: no configuration reachable from
   * production code enables rendering until a later authorized phase flips
   * renderImplementationEnabled after real rendered scenes are validated.
   */
  async renderScene() {
    this.assertUsable();
    if (this.mode !== BACKEND_MODES.RENDER) {
      throw renderNotAuthorizedError(this.id, `backend mode is "${this.mode}"; rendering requires mode=render`);
    }
    if (this.authorizationToken !== RENDER_AUTHORIZATION_TOKEN) {
      throw renderNotAuthorizedError(this.id, 'missing render authorization token');
    }
    if (!this.renderImplementationEnabled) {
      throw renderNotAuthorizedError(this.id,
        'render implementation is deliberately not enabled in B9.38; a future authorized phase enables it after visual validation');
    }
    throw renderNotAuthorizedError(this.id, 'render implementation not yet delivered');
  }
}

module.exports = { MotionCanvasAdapter, STYLE_TOKENS, ENGINE_PLAN_VERSION };
