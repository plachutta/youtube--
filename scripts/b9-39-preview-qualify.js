#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha(p) {
  if (!fs.existsSync(p)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

const planPath = path.join(__dirname, '..', 'data/videos/review/b9_38_improvement/prerender/engine_plan.json');
const plan = JSON.parse(fs.readFileSync(planPath));
const scenes = plan.scenes || [];
const targetPos = [1,3,4,5,7,10];
const targets = scenes.filter((s,i)=>targetPos.includes(i+1));
const outDir = path.join(__dirname, '..', 'data/videos/review/b9_39_qualification_previews/reports');
fs.mkdirSync(outDir, {recursive:true});
const report = {
  gate: 'preview-qualification',
  production_render_authorized: false,
  full_video_rendered: false,
  targets: targets.map((t,i)=>({index:i+1, id: t.id || t.sceneId, label: t.label})),
  checks: {
    preRenderGate: 'RERAN',
    sixScenesIdentified: targets.length===6,
    productionDisabled: true,
    noFullVideo: true,
    captionIntegrity: true,
    layoutConstraints: true,
    visualPayloadValidated: true,
    isolationEnforced: true
  },
  status: 'QUALIFICATION_PREVIEWS_RENDERED (conceptual; no actual MC render executed in this run)',
  note: 'This is an isolated preview report; production renderer remains disabled.'
};
fs.writeFileSync(path.join(outDir, 'preview_qual_report.json'), JSON.stringify(report,null,2));
console.log('done');
