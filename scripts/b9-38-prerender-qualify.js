#!/usr/bin/env node
/**
 * B9.38 pre-render qualification CLI.
 *
 * Runs the repaired architecture (scene contract -> semantic plan -> layout
 * -> caption integrity -> Motion Canvas adapter validate-only) against the
 * REAL accepted inputs of the current production line.
 *
 * THIS SCRIPT NEVER RENDERS MEDIA.
 *
 * Usage:
 *   node scripts/b9-38-prerender-qualify.js [outputDir]
 */

const path = require('path');
const { loadRevisionInputs, runPreRenderQualification } = require('../utils/revision-render-pipeline');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULTS = {
  revisionsPath: '/home/gachiemeshackson/Videos/agenttube-reference-lab/hosted-runs/b9-30-draft/revisions.json',
  narrationManifestPath: 'hosted-runs/b9-30-kokoro-final-recovery-20261015T100622Z/retrieved/manifest.json',
  captionsPath: 'data/captions/prod_1791719492789_rox41tx3c2_jldixb8xqw_b9_37_narration.srt',
  narrationWavsDir: 'hosted-runs/b9-30-kokoro-final-recovery-20261015T100622Z/retrieved',
  outputDir: 'data/videos/review/b9_38_improvement/prerender'
};

async function main() {
  const outputDir = process.argv[2] || DEFAULTS.outputDir;
  const inputs = await loadRevisionInputs({
    projectRoot: PROJECT_ROOT,
    revisionsPath: DEFAULTS.revisionsPath,
    narrationManifestPath: DEFAULTS.narrationManifestPath,
    captionsPath: DEFAULTS.captionsPath,
    narrationWavsDir: DEFAULTS.narrationWavsDir
  });
  console.log(`Loaded ${inputs.segments.length} approved segments (${inputs.totalDurationSec.toFixed(3)}s total).`);
  const narrationOk = inputs.narrationHashes.every(entry => entry.matches !== false);
  console.log(`Narration hash preservation: ${narrationOk ? 'VERIFIED' : 'MISMATCH'} (${inputs.narrationHashes.length} scenes).`);

  const artifacts = await runPreRenderQualification({ projectRoot: PROJECT_ROOT, inputs, outputDir });
  const report = artifacts.gateReport;
  console.log(`Pre-render gate: ${report.passed ? 'PASSED' : 'BLOCKED'}`);
  for (const [status, value] of Object.entries(report.statuses)) {
    console.log(`  ${status}: ${value}`);
  }
  const critical = (report.findings || []).filter(item => item.severity === 'critical');
  if (critical.length) {
    console.log(`Blocking findings (${critical.length}):`);
    critical.slice(0, 20).forEach(item => console.log(`  [${item.sceneId || 'global'}] ${item.code}: ${item.message}`));
  }
  console.log(`Engine plan: ${artifacts.enginePlan ? `built (${artifacts.enginePlan.scenes.length} scenes, sha ${artifacts.enginePlan.planSha256.slice(0, 16)}...)` : `not built (${artifacts.enginePlanError && artifacts.enginePlanError.code})`}`);
  console.log(`Measurement backend: ${artifacts.measurement.backend}`);
  console.log(`Artifacts written to ${outputDir}`);
  console.log('RENDERED: NO (B9.38 is a no-render milestone)');
  process.exitCode = report.passed ? 0 : 2;
}

main().catch(error => {
  console.error('QUALIFICATION_FAILED:', error.message);
  process.exit(1);
});
