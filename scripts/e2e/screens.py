"""Screenshots of every main screen with a demo list loaded, for checking layout by eye.

Usage (dev server running: npx vite --port 5199 --host 127.0.0.1):
    npx vite-node scripts/sim/make-demo.ts /tmp/demo.json
    python3 scripts/e2e/screens.py /tmp/demo.json /tmp/shots

Writes <out>/<size>_<screen>.png for a phone (390x844, light and dark) and a desktop (1280x860).
Pages are captured whole; long ones are cut into 1800 px slices so they stay readable.
Cover images come from AniList and fail to load in sandboxes without network; the colour blocks are expected.
"""
import os
import sys

from playwright.sync_api import sync_playwright

URL = os.environ.get('SHOBU_URL', 'http://127.0.0.1:5199/')
demo, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)


def slices(path):
    try:
        from PIL import Image
    except ImportError:
        return
    im = Image.open(path)
    w, h = im.size
    if h <= 1800:
        return
    base = path[:-4]
    for i, y in enumerate(range(0, h, 1800)):
        im.crop((0, y, w, min(h, y + 1800))).save(f'{base}_{i}.png')
    os.remove(path)


def run(p, name, vw, vh, scheme):
    browser = p.chromium.launch()
    page = browser.new_context(viewport={'width': vw, 'height': vh}, color_scheme=scheme).new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    start = page.get_by_role('button', name='Start')
    start.wait_for(timeout=60000)
    start.click()
    nav = lambda n: page.locator('nav.tabs').get_by_role('button', name=n, exact=True).click()
    nav('Settings')
    page.set_input_files('#import-file', demo)
    page.get_by_role('button', name='Replace my data').click(timeout=30000)
    page.wait_for_selector('.confirm', state='detached', timeout=60000)
    page.reload()
    page.wait_for_selector('nav.tabs', timeout=60000)
    page.wait_for_timeout(4000)

    def shot(n):
        path = f'{out}/{name}_{n}.png'
        page.screenshot(path=path, full_page=True)
        slices(path)

    nav('Duel'); page.wait_for_timeout(600); shot('01duel')
    nav('Library'); page.wait_for_timeout(400)
    page.get_by_role('radio', name='Quick log').click(); page.wait_for_timeout(400); shot('02quick')
    page.get_by_role('radio', name='Browse').click(); page.wait_for_timeout(600); shot('03browse')
    nav('Ranking'); page.wait_for_timeout(600); shot('04ranking')
    page.locator('.rank-row').first.click(); page.wait_for_selector('.sheet'); page.wait_for_timeout(300)
    page.screenshot(path=f'{out}/{name}_05card.png')
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    nav('Taste'); page.wait_for_timeout(1200); shot('06stats')
    nav('Picks'); page.wait_for_timeout(1200); shot('07foryou')
    nav('Settings'); page.wait_for_timeout(400); shot('08settings')
    page.locator('.wordmark').click(); page.wait_for_selector('.welcome'); shot('09front')
    print(name, 'page errors:', errors or 'none')
    browser.close()


with sync_playwright() as p:
    run(p, 'phone', 390, 844, 'light')
    run(p, 'dark', 390, 844, 'dark')
    run(p, 'desk', 1280, 860, 'light')
