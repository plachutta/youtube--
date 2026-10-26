import json, time
from playwright.sync_api import sync_playwright
logs = []
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'])
    pg = b.new_page(viewport={'width': 1920, 'height': 1080})
    pg.on('console', lambda m: logs.append(f"{m.type}: {m.text[:200]}"))
    pg.on('pageerror', lambda e: logs.append(f"pageerror: {str(e)[:300]}"))
    pg.goto('http://localhost:9017/', wait_until='networkidle', timeout=60000)
    time.sleep(10)
    state = pg.evaluate("() => ({title: document.title, canvases: document.querySelectorAll('canvas').length, bodyLen: document.body.innerHTML.length})")
    print('PAGE_STATE', json.dumps(state))
    print('LOGS', json.dumps(logs[:15], indent=1))
    pg.screenshot(path='page_probe.png')
    b.close()
print('SCREENSHOT_SAVED')
