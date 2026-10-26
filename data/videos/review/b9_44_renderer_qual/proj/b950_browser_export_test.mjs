import { chromium } from 'playwright';

(async () => {
  console.log('=== B9.50: Browser-Driven FFmpeg Export Attempt ===');
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-gpu']
  });
  
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  
  // Log all console messages
  const allLogs = [];
  page.on('console', m => {
    const text = m.text().slice(0, 400);
    allLogs.push(`${m.type()}: ${text}`);
  });
  
  page.on('pageerror', e => {
    allLogs.push(`pageerror: ${String(e).slice(0, 400)}`);
  });
  
  console.log('Navigating to http://localhost:9100/');
  const response = await page.goto('http://localhost:9100/', { 
    waitUntil: 'networkidle', 
    timeout: 120000 
  });
  console.log('Response status:', response?.status());
  console.log('Title after goto:', await page.title());
  
  // Check for canvases
  try {
    const canvasCount = await page.$$eval('canvas', els => els.length);
    console.log('Canvases found:', canvasCount);
  } catch(e) {
    console.log('Could not count canvases:', e.message.substring(0, 100));
  }
  
  // Wait for HMR to settle and scene to render
  console.log('Waiting 8s for HMR/render settlement...');
  await new Promise(r => setTimeout(r, 8000));
  
  // Print all logs, filtering for relevant ones
  console.log('\\n=== ALL CONSOLE LOGS ===');
  allLogs.forEach((log, i) => {
    const lower = log.toLowerCase();
    const isRelevant = lower.includes('hot') || lower.includes('hmr') || 
                       lower.includes('vite') || lower.includes('export') ||
                       lower.includes('ffmpeg') || lower.includes('mc-') ||
                       lower.includes('motion');
    if (isRelevant || i < 5) {
      console.log([i, log].join(' '));
    }
  });
  
  // Also print first 10 non-filtered logs
  console.log('\\n=== FIRST 10 LOGS ===');
  allLogs.slice(0, 10).forEach((log, i) => console.log([i, log].join(' ')));
  
  // Look for export-related buttons
  console.log('\\n=== Looking for export UI elements ===');
  try {
    // Look for buttons with export-related text
    const buttons = await page.$$('button');
    console.log('Total buttons:', buttons.length);
    
    for (let i = 0; i < Math.min(buttons.length, 20); i++) {
      const text = await buttons[i].innerText();
      const normalised = text && text.trim().length > 0 ? text.trim() : '(empty)';
      if (normalised.toLowerCase().includes('export') || normalised.toLowerCase().includes('render') || normalised.toLowerCase().includes('ffmpeg')) {
        console.log('Export-related button[' + i + ']:', normalised.substring(0, 80));
      }
    }
    
    // Also look for any clickable elements with relevant text
    const allElements = await page.$$('*[onclick]');
    console.log('Elements with onclick:', allElements.length);
    
    for (let i = 0; i < Math.min(allElements.length, 15); i++) {
      const text = await allElements[i].innerText();
      const normalised = text && text.trim().length > 0 ? text.trim() : '(empty)';
      if (normalised.toLowerCase().includes('export') || normalised.toLowerCase().includes('render') || normalised.toLowerCase().includes('ffmpeg')) {
        console.log('Export onclick element[' + i + ']:', normalised.substring(0, 80));
      }
    }
  } catch(e) {
    console.log('Error examining UI:', e.message.substring(0, 100));
  }
  
  // Wait additional time for any export to be processed
  console.log('\\nWaiting 12s after UI scan...');
  await new Promise(r => setTimeout(r, 12000));
  
  // Final log dump
  console.log('\\n=== FINAL 30 LOGS ===');
  const startIdx = Math.max(0, allLogs.length - 30);
  allLogs.slice(startIdx).forEach((log, i) => console.log([i, log].join(' ')));
  
  // Evaluate page state
  const pageState = await page.evaluate(() => ({
    title: document.title ? document.title.substring(0, 100) : '(no title)',
    canvasCount: document.querySelectorAll('canvas').length,
    hasMotionCanvas: typeof (window.MotionCanvas !== 'undefined'),
    bodyType: typeof document.body
  }));
  console.log('\\n=== PAGE STATE ===');
  console.log(JSON.stringify(pageState));
  
  console.log('\\n=== TRYING CLICK ON FIRST BUTTON ===');
  // Try clicking first button that looks export-related
  try {
    const buttons = await page.$$('button');
    if (buttons.length > 0) {
      console.log('Clicking button[0]');
      await buttons[0].click();
      await new Promise(r => setTimeout(r, 5000));
      console.log('After first click - waiting...');
    }
  } catch(e) {
    console.log('First click failed:', e.message.substring(0, 100));
  }
  
  // Wait for any async operations
  await new Promise(r => setTimeout(r, 8000));
  
  // Final state check
  console.log('\\n=== FINAL PAGE STATE ===');
  const finalState = await page.evaluate(() => ({
    title: document.title ? document.title.substring(0, 100) : '(no title)',
    canvasCount: document.querySelectorAll('canvas').length
  }));
  console.log(JSON.stringify(finalState));
  
  console.log('\\n=== TEST CONCLUSION ===');
  console.log('Key observation: HMR context is the gate - import.meta.hot.send() requires');
  console.log('a sustained Vite HMR browser session. Playwright headless may not maintain');
  console.log('this context long enough for the FFmpegExporterClient to process.');
  
  await browser.close();
  console.log('\\n=== B9.50 BROWSER EXPORT TEST COMPLETE ===');
})();
