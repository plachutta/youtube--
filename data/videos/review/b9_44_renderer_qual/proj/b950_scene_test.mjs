import { chromium } from 'playwright';

(async () => {
  console.log('=== B9.50: Extended Scene Load Test ===');
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu']
  });
  
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  
  const allLogs = [];
  page.on('console', m => {
    const text = m.text().slice(0, 400);
    allLogs.push(`${m.type()}: ${text}`);
  });
  
  console.log('Navigating to http://localhost:9100/');
  await page.goto('http://localhost:9100/', { waitUntil: 'networkidle', timeout: 120000 });
  console.log('Title:', await page.title());
  
  // Wait a long time for scene to initialize and settle
  console.log('Waiting 20s for scene initialization...');
  await new Promise(r => setTimeout(r, 20000));
  
  // Print all logs, filtering for relevant ones
  console.log('\\n=== ALL LOGS (first 30) ===');
  allLogs.slice(0, 30).forEach((log, i) => {
    const lower = log.toLowerCase();
    const isRelevant = lower.includes('hot') || lower.includes('hmr') || 
                       lower.includes('vite') || lower.includes('export') ||
                       lower.includes('ffmpeg') || lower.includes('motion') ||
                       lower.includes('error') || lower.includes('warn') ||
                       lower.includes('scene') || lower.includes('canvas');
    if (isRelevant || i < 5) {
      console.log([i, log].join(' '));
    }
  });
  
  // Wait more
  console.log('\\nWaiting additional 20s...');
  await new Promise(r => setTimeout(r, 20000));
  
  // Print more logs
  console.log('\\n=== ALL LOGS (after 40s, last 30) ===');
  const startIdx = Math.max(0, allLogs.length - 30);
  allLogs.slice(startIdx).forEach((log, i) => console.log([i, log].join(' ')));
  
  // Check for canvases now
  try {
    const canvasCount = await page.$$eval('canvas', els => els.length);
    console.log('\\nCanvases after 40s:', canvasCount);
  } catch(e) {
    console.log('\\nError counting canvases:', e.message.substring(0, 100));
  }
  
  // Check page title/state
  const title = await page.title();
  console.log('Page title:', title);
  
  // Try to evaluate scene state
  try {
    const sceneInfo = await page.evaluate(() => {
      const canvases = document.querySelectorAll('canvas');
      return {
        canvasCount: canvases.length,
        canvasWidth: canvases[0]?.width,
        canvasHeight: canvases[0]?.height,
        hasWebGL: !!(document.querySelector('canvas')?.getContext)
      };
    });
    console.log('\\nScene evaluation:', JSON.stringify(sceneInfo));
  } catch(e) {
    console.log('\\nError evaluating scene:', e.message.substring(0, 100));
  }
  
  // Look for any export-related elements, any type
  console.log('\\n=== Looking for ANY export-related text ===');
  const allText = await page.evaluate(() => {
    const walk = (node) => {
      const text = [];
      if (node.nodeType === 3) { // text node
        const t = node.textContent.trim();
        if (t) text.push(t);
      }
      for (const child of node.childNodes) {
        text.push(...walk(child));
      }
      return text;
    };
    return walk(document.body);
  }).filter(t => t.toLowerCase().includes('export') || t.toLowerCase().includes('ffmpeg') || t.toLowerCase().includes('render'));
  console.log('Found', allText.length, 'export-related text nodes');
  allText.slice(0, 10).forEach((t, i) => console.log([i, t.substring(0, 100)]));
  
  console.log('\\n=== WAITING 15 MORE SECONDS ===');
  await new Promise(r => setTimeout(r, 15000));
  
  // Final canvas check
  try {
    const canvasCount = await page.$$eval('canvas', els => els.length);
    console.log('\\nFinal canvases count:', canvasCount);
  } catch(e) {
    console.log('\\nError final canvas count:', e.message.substring(0, 100));
  }
  
  await browser.close();
  console.log('\\n=== B9.50 EXTENDED SCENE TEST COMPLETE ===');
})();
