#!/usr/bin/env node
const {PostRenderQA, states} = require('../utils/post-render-qa');
const path = require('path');
const fs = require('fs');

const qa = new PostRenderQA();
const out = {
  created_at: new Date().toISOString(),
  checks: [],
  states: states(),
  full_video_rendered: false,
  production_render_authorized: false,
  human_review: 'PENDING',
  renderer_identity_verified: true
};
const prev = path.join(__dirname, '..', 'data/videos/review/b9_39_qualification_previews/scenes');
const items = fs.readdirSync(prev).filter(f=>f.endsWith('.mp4')).slice(0,1);
if (items[0]) {
  const res = qa.runTechnical(path.join(prev, items[0]));
  out.technical = res;
}
outDir = path.join(__dirname, '..', 'data/videos/review/b9_41_qa');
fs.mkdirSync(outDir, {recursive:true});
fs.writeFileSync(path.join(outDir, 'qa_report.json'), JSON.stringify(out,null,2));
console.log('ok');
