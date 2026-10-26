import { chromium } from 'playwright';

(async () => {
  console.log('=== B9.51: Browser Export with Fixed Scene ===');
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu']
  });
  
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  
  const allLogs = [];
  page.on('console', function(m) {
    var text = m.text().slice(0, 500);
    allLogs.push(m.type() + ': ' + text);
  });
  
  console.log('Navigating to http://localhost:9102/');
  var response = await page.goto('http://localhost:9102/', { 
    waitUntil: 'networkidle', 
    timeout: 120000 
  });
  console.log('Response status:', response?.status);
  console.log('Title after goto:', await page.title());
  
  // Check for canvases
  try {
    var canvasCount = await page.$$eval('canvas', function(els) { return els.length; });
    console.log('Canvases found:', canvasCount);
  } catch(e) {
    console.log('Error counting canvases:', e.message.substring(0, 100));
  }
  
  // Wait for initial HMR/render - extended
  console.log('Waiting 20s for HMR/render...');
  await new Promise(function(r) { setTimeout(r, 20000); });
  
  // Print relevant logs
  console.log('\n=== ALL LOGS (first 30) ===');
  var relevantCount = 0;
  allLogs.forEach(function(log, i) {
    if (relevantCount < 30) {
      var lower = log.toLowerCase();
      var isScene = lower.includes('scene') || lower.includes('render') || 
                    lower.includes('wait') || lower.includes('error') || 
                    lower.includes('fail') || lower.includes('mc-') ||
                    lower.includes('motion') || lower.includes('export') ||
                    lower.includes('ffmpeg') || lower.includes('hot') ||
                    lower.includes('hmr') || lower.includes('vite');
      if (isScene || relevantCount < 5) {
        console.log('[' + i + '] ' + log);
        if (isScene) relevantCount++;
      }
    }
  });
  
  // Wait for scene to potentially settle
  console.log('\nWaiting 30s for scene to stabilize...');
  await new Promise(function(r) { setTimeout(r, 30000); });
  
  // Check canvases again
  try {
    var canvasCount = await page.$$eval('canvas', function(els) { return els.length; });
    console.log('\nCanvases after 30s wait:', canvasCount);
  } catch(e) {
    console.log('Error counting canvases after wait:', e.message.substring(0, 100));
  }
  
  // More waits
  console.log('Waiting additional 20s...');
  await new Promise(function(r) { setTimeout(r, 20000); });
  
  // Final canvas check
  try {
    var canvasCount = await page.$$eval('canvas', function(els) { return els.length; });
    console.log('Final canvases count:', canvasCount);
    
    // Also check for SVG, divs with scene content
    var svgCount = await page.$$eval('svg', function(els) { return els.length; });
    console.log('SVG elements:', svgCount);
    
    var textElements = await page.$$eval('[text-content]', function(els) { return els.length; });
    console.log('Text elements:', textElements);
  } catch(e) {
    console.log('Error final check:', e.message.substring(0, 100));
  }
  
  // Look for export button
  try {
    var exportBtn = await page.$('#export-btn, .export-btn, button:has-text("Export"), button:has-text("export")');
    console.log('Export button found:', exportBtn !== null);
  } catch(e) {
    console.log('Error checking export button:', e.message.substring(0, 100));
  }
  
  console.log('\n=== B9.51 BROWSER EXPORT ATTEMPT COMPLETE ===');
  await browser.close();
})();
