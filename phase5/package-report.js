#!/usr/bin/env node
/** Build the non-public test package manifest. Usage: node phase5/package-report.js <contentId> <outDir> */
const fs = require('fs');
const path = require('path');

(async () => {
  const [contentId, outDir] = process.argv.slice(2);
  if (!contentId) throw new Error('usage: node phase5/package-report.js <contentId> <outDir>');

  const { Database } = require('../database/db');
  const dbp = new Database();
  await dbp.initialize();
  const bundle = await dbp.getProductionBundle(contentId);
  await dbp.close().catch(() => {});

  const cfg = {
    contentId,
    mode: 'non-public test package (no upload)',
    createdAt: new Date().toISOString(),
    production: {
      status: bundle.status,
      reviewStatus: bundle.review_status,
      qualityScore: bundle.qualityChecks ? bundle.qualityChecks.reduce((s, c) => s + (c.passed ? 1 : 0), 0) : null,
      assets: { finalVideo: bundle.assets?.finalVideo, audio: bundle.assets?.audio, captions: bundle.assets?.captions }
    },
    workflow: [
      'template strategy (no LLM provider)', 'script-writer (template fallback)',
      'thumbnail-designer (gradient fallback)', 'seo optimizer (template)',
      'production-management (processContent)', 'caption authoring (buildSRT)',
      '/manual narration: 3-engine Kaggle TTS benchmark', 'narration injection (gap-workaround script)',
      'caption authoring + final assembly (SceneRepairService rebuild)',
      'local ffprobe validation (phase5/validate-video.js)'
    ],
    acknowledgements: [
      'No public upload performed.',
      'For editorial review only (human listening + editorial sign-off pending).',
      'Monetisation/copyright clearance = NOT claimed for test material.'
    ]
  };

  const out = path.resolve(outDir || 'data/phase5');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'test-package-manifest.json'), JSON.stringify(cfg, null, 2));
  console.log('[package] manifest written to', path.join(out, 'test-package-manifest.json'));
})().catch(e => { console.error('[package] FAILED:', e.message); process.exit(1); });
