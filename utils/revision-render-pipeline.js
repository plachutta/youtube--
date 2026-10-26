/**
 * REVISION RENDER PIPELINE (B9.38)
 *
 * Committed replacement for the uncommitted, ephemeral procedure that
 * produced b9.31-b9.37. It consumes the REAL production inputs
 * (accepted narration segments, narration manifest, captions) and runs:
 *
 *   approved script/narration -> structured scene contract
 *     -> semantic visual plan -> validated visual payload
 *     -> layout & composition -> Motion Canvas adapter (validate-only)
 *
 * It writes qualification artifacts only. It NEVER renders media: no FFmpeg
 * invocation, no adapter.renderScene call. Final media assembly stays with
 * the existing qualified FFmpeg pipeline in a later authorized phase.
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { buildStoryFactSheet, planScenes } = require('./visual-planner');
const { parseSRT, segmentTranscriptToCues, fitCuesToLayout } = require('./caption-contract');
const { createTextMeasurer } = require('./layout-engine');
const { MotionCanvasAdapter } = require('./renderers/motion-canvas-adapter');
const gate = require('./prerender-gate');
const { BACKEND_MODES } = require('./renderers/backend-contract');

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function sha256File(filePath) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** Load the real inputs for a production line. */
async function loadRevisionInputs({
  projectRoot,
  revisionsPath,
  narrationManifestPath,
  captionsPath = null,
  narrationWavsDir = null
}) {
  const revisions = await readJson(path.resolve(projectRoot, revisionsPath));
  const manifest = await readJson(path.resolve(projectRoot, narrationManifestPath));
  const durationByScene = new Map(
    (manifest.results || []).map(result => [result.sceneId, result.measurements.duration_seconds])
  );
  const hashByScene = new Map(
    (manifest.results || []).map(result => [result.sceneId, result.audio_sha256])
  );
  let cursor = 0;
  const segments = (revisions.revised_segments || []).map(segment => {
    const durationSec = durationByScene.get(segment.sceneId);
    if (!Number.isFinite(durationSec)) {
      throw new Error(`Narration manifest has no duration for scene ${segment.sceneId}`);
    }
    const enriched = {
      ...segment,
      startSec: cursor,
      durationSec,
      audioRef: `wav:${segment.sceneId}`,
      audioSha256: hashByScene.get(segment.sceneId) || null
    };
    cursor += durationSec;
    return enriched;
  });
  const transcript = segments.map(segment => segment.text).join(' ');
  const existingCaptions = captionsPath ? parseSRT(await fs.readFile(path.resolve(projectRoot, captionsPath), 'utf8')) : [];

  // Accepted narration preservation check (hashes recorded in the manifest).
  const narrationHashes = [];
  if (narrationWavsDir) {
    for (const segment of segments) {
      const wavPath = path.resolve(projectRoot, narrationWavsDir, `${segment.sceneId}.wav`);
      try {
        const actual = await sha256File(wavPath);
        narrationHashes.push({
          sceneId: segment.sceneId,
          expected: segment.audioSha256,
          actual,
          matches: segment.audioSha256 ? actual === segment.audioSha256 : null
        });
      } catch (_error) {
        narrationHashes.push({ sceneId: segment.sceneId, expected: segment.audioSha256, actual: null, matches: null });
      }
    }
  }

  return { revisions, manifest, segments, transcript, totalDurationSec: cursor, existingCaptions, narrationHashes };
}

/**
 * Run the full pre-render qualification for a revision. Writes artifacts;
 * renders nothing.
 */
async function runPreRenderQualification({
  projectRoot,
  inputs,
  outputDir,
  adapterMode = BACKEND_MODES.VALIDATE_ONLY,
  measurerPreference = 'auto'
}) {
  const { segments, transcript, existingCaptions, narrationHashes } = inputs;
  const measurer = await createTextMeasurer({ preferred: measurerPreference });
  try {
    const factSheet = buildStoryFactSheet({ segments, narrationManifest: inputs.manifest });
    const plan = planScenes({ segments, factSheet });

    // Re-segment the accepted transcript into layout-fitting caption cues.
    // Every word of the accepted narration is preserved exactly.
    let captionCues = [];
    for (const segment of segments) {
      captionCues.push(...segmentTranscriptToCues({
        transcript: segment.text,
        startSec: segment.startSec,
        endSec: segment.startSec + segment.durationSec,
        maxLineChars: 42,
        maxLinesPerCue: 2
      }));
    }
    captionCues = fitCuesToLayout(captionCues, { maxLineChars: 42, maxLinesPerCue: 2 });

    const adapter = new MotionCanvasAdapter({ mode: adapterMode });
    const gateReport = await gate.evaluate({
      scenes: plan.scenes,
      captionCues,
      transcript,
      backend: adapter,
      measurer
    });

    let enginePlan = null;
    let enginePlanError = null;
    try {
      enginePlan = adapter.buildEnginePlan(plan.scenes, {
        layoutReports: gateReport.layoutReports.map(entry => entry.report),
        captionCues
      });
    } catch (error) {
      enginePlanError = { code: error.code || 'ENGINE_PLAN_FAILED', message: error.message };
    }

    const artifacts = {
      factSheet,
      sceneContracts: plan.scenes,
      plannerFindings: plan.findings,
      captionCues,
      gateReport: { ...gateReport, layoutReports: undefined },
      enginePlan,
      enginePlanError,
      narrationHashes,
      existingCaptionComparison: {
        existingCueCount: existingCaptions.length,
        newCueCount: captionCues.length,
        note: 'existing b9_37 SRT kept one cue per scene; the repaired pipeline splits cues to the layout budget without losing words'
      },
      measurement: { backend: measurer.backend },
      rendered: false,
      note: 'B9.38 is a no-render milestone; visual output remains UNVERIFIED until an authorized render phase.'
    };

    if (outputDir) {
      const absoluteOut = path.resolve(projectRoot, outputDir);
      await fs.mkdir(absoluteOut, { recursive: true });
      await fs.writeFile(path.join(absoluteOut, 'scene_contracts.json'), JSON.stringify(artifacts.sceneContracts, null, 2));
      await fs.writeFile(path.join(absoluteOut, 'caption_cues.json'), JSON.stringify(artifacts.captionCues, null, 2));
      await fs.writeFile(path.join(absoluteOut, 'gate_report.json'), JSON.stringify(artifacts.gateReport, null, 2));
      await fs.writeFile(path.join(absoluteOut, 'engine_plan.json'), JSON.stringify(artifacts.enginePlan || { error: enginePlanError }, null, 2));
      await fs.writeFile(path.join(absoluteOut, 'fact_sheet.json'), JSON.stringify(artifacts.factSheet, null, 2));
      await fs.writeFile(path.join(absoluteOut, 'narration_hash_verification.json'), JSON.stringify(artifacts.narrationHashes, null, 2));
    }
    return artifacts;
  } finally {
    await measurer.close();
  }
}

module.exports = { loadRevisionInputs, runPreRenderQualification };
