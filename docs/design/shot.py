from playwright.sync_api import sync_playwright
import sys, glob, os, pathlib
files = sorted(glob.glob("*.html"))
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={"width":1400,"height":1000}, device_scale_factor=2)
    for f in files:
        pg.goto("file://"+os.path.abspath(f)); pg.wait_for_timeout(900)
        el = pg.query_selector(".app")
        out = "/tmp/aaf/shots/"+pathlib.Path(f).stem+".png"
        el.screenshot(path=out); print("shot", out)
    b.close()
