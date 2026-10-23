"""Screenshot della versione web di prova per il README (python web/screenshots.py http://localhost:8765 screenshots)."""
import sys, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765"
OUT = sys.argv[2] if len(sys.argv) > 2 else "screenshots"

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="it-IT")
    pg.goto(URL); pg.evaluate("()=>{ localStorage.clear(); sessionStorage.setItem('grz_demo_next','example'); localStorage.setItem('grz_demo_seen','1'); }")
    pg.reload(); time.sleep(12)
    def shot(name, js=None, wait=2.5):
        if js: pg.evaluate("()=>{" + js + "}")
        time.sleep(wait); pg.screenshot(path=f"{OUT}/{name}.png")
    hide = "document.querySelector('.demo-fab').style.display='none';"
    shot("budget", hide + "showTab('budget'); window.scrollTo(0,0);")
    shot("ricorrenti", "openSec('ric');")
    shot("da-confermare", "closeSec(); document.getElementById('inbox').scrollIntoView({block:'start'}); window.scrollBy(0,-70);")
    shot("portafoglio", "showTab('portafoglio'); window.scrollTo(0,0);", 6)
    shot("piano", "showTab('piano'); window.scrollTo(0,0);", 4)
    shot("sfide", "showTab('sfide'); window.scrollTo(0,0);", 3)
    b.close()
