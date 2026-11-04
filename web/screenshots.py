"""Screenshot della versione web di prova per il README (python web/screenshots.py http://localhost:8765 screenshots)."""
import sys, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765"
OUT = sys.argv[2] if len(sys.argv) > 2 else "screenshots"

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="it-IT")
    # dati di esempio: al primo caricamento la pagina parte da zero e prepara l'esempio
    ctx.add_init_script("try{ if(!sessionStorage.getItem('shot_init')){ localStorage.clear(); sessionStorage.setItem('shot_init','1'); sessionStorage.setItem('grz_demo_next','example'); localStorage.setItem('grz_demo_seen','1'); } }catch(e){}")
    pg = ctx.new_page()
    pg.goto(URL, wait_until="domcontentloaded")
    pg.wait_for_function("()=>typeof B!=='undefined' && B.setup && !document.querySelector('.demo-busy')", timeout=90000); time.sleep(3)
    # un mutuo di esempio, per la finestra Ricorrenti
    pg.evaluate("""()=>{ const t=today0(); B.loans=[{ id:uid('ln'), n:'Casa', kind:'mutuo', amt:150000, monthly:650, start:ymd(addMonthsD(t,-38)), end:'', rate:3.2, budget:false }]; loanAfter(); }""")
    def shot(name, js=None, wait=2.5):
        if js: pg.evaluate("()=>{" + js + "}")
        time.sleep(wait); pg.screenshot(path=f"{OUT}/{name}.png")
    hide = "document.querySelector('.demo-fab').style.display='none';"
    shot("budget", hide + "showTab('budget'); window.scrollTo(0,0);")
    shot("pannelli", "document.getElementById('hudBud').scrollIntoView({block:'start'}); window.scrollBy(0,-64);", 3)
    shot("ricorrenti", "window.scrollTo(0,0); openSec('ric');")
    shot("prestiti", "const s=[...document.querySelectorAll('#secBody .eyebrow')].find(e=>/Prestiti e mutui/i.test(e.textContent)); s.scrollIntoView({block:'start'});", 2)
    shot("da-confermare", "closeSec(); document.getElementById('inbox').scrollIntoView({block:'start'}); window.scrollBy(0,-70);")
    shot("portafoglio", "showTab('portafoglio'); window.scrollTo(0,0);", 6)
    shot("piano", "showTab('piano'); window.scrollTo(0,0);", 4)
    shot("sfide", "showTab('sfide'); window.scrollTo(0,0);", 3)
    b.close()
