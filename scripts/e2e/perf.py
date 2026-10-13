"""Times launch, duel to next pair, and opening tabs on the built site, with the CPU slowed (4 = roughly a mid-range phone).

Usage: npm run build, serve dist on 5201 (see working notes), then
    python3 scripts/e2e/perf.py /tmp/demo.json 4
URL=... picks another server (e.g. an older build, to compare).
"""
import sys, time
from playwright.sync_api import sync_playwright
import os
URL = os.environ.get('URL', 'http://127.0.0.1:5201/')
data, throttle = sys.argv[1], float(sys.argv[2])
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    page = ctx.new_page()
    errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(URL)
    page.get_by_role('button', name='Start').click(timeout=60000)
    nav = lambda n: page.locator('nav.tabs').get_by_role('button', name=n, exact=True).click()
    nav('Settings')
    page.set_input_files('#import-file', data)
    page.get_by_role('button', name='Replace my data').click(timeout=30000)
    page.wait_for_selector('.confirm', state='detached', timeout=120000)
    cdp = ctx.new_cdp_session(page)
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': throttle})
    # launch
    t = time.time(); page.reload(); page.wait_for_selector('.contender-pick', timeout=120000)
    print('launch to duel', round((time.time()-t)*1000), 'ms')
    page.wait_for_timeout(4000)  # let the catalogue sync finish
    lt = page.evaluate("""() => new Promise(r => { const out=[]; new PerformanceObserver(l => out.push(...l.getEntries().map(e=>Math.round(e.duration)))).observe({type:'longtask', buffered:true}); setTimeout(()=>r(out),100); })""")
    print('long tasks during launch+sync (ms):', lt)
    # votes
    times = []
    for k in range(8):
        before = page.locator('.contender-pick').first.get_attribute('aria-label')
        t = time.time(); page.locator('.contender-pick').first.click()
        page.wait_for_function("b => document.querySelector('.contender-pick')?.getAttribute('aria-label') !== b", arg=before, timeout=20000)
        times.append(round((time.time()-t)*1000))
    print('vote to next pair (ms):', times)
    for name, sel in [('Taste', '.find-card'), ('Picks', '.tonight, .rec-card'), ('Ranking', '.rank-row'), ('Duel', '.contender-pick'), ('Taste', '.find-card')]:
        t = time.time(); nav(name); page.wait_for_selector(sel, timeout=60000)
        page.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
        print(f'open {name}', round((time.time()-t)*1000), 'ms')
    print('errors', errs)
    b.close()
