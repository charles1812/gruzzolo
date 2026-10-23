"""Abbonamenti messi a mano come fa una persona dal telefono: finestra 🔁 Spese ricorrenti del Budget → «Aggiungi»,
nome + importo + ogni mese/anno + data del prelievo → Salva. Anthropic 21,95 €, Google 0,49 € (si vedono i centesimi),
il telefono del questionario con importo e data veri, un addebito già passato questo mese che si vede lo stesso.
Lascia i dati come li ha trovati. Uso: dopo `fulltest.py onboard`, con la WebView su localhost:9334."""
import json, time
from playwright.sync_api import sync_playwright

res = []
def check(name, ok, info=""):
    res.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  -- " + json.dumps(info, ensure_ascii=False)[:600]), flush=True)

EXACT = """()=>{ const st=bStatus(), P=st.P, s0=B.start; if(!P.partial) return { ok:Math.abs(st.remaining-st.groups.reduce((a,g)=>a+g.left,0))<0.01 };
  const conto=s0.left-(P.replayRes||0)-(P.inv||0)-st.T.filter(t=>t.type!=='in').reduce((a,t)=>a+t.amt-(t.buoniVal||0),0);
  return { ok:Math.abs(st.remaining-conto)<0.01, remaining:+st.remaining.toFixed(2), conto:+conto.toFixed(2) }; }"""

with sync_playwright() as p:
    page = p.chromium.connect_over_cdp("http://localhost:9334").contexts[0].pages[0]
    ev = lambda js, a=None: page.evaluate(js, a)
    W = "#secBody #ricRec"
    def tap(sel):
        loc = page.locator(sel).first; loc.evaluate("e=>e.scrollIntoView({block:'center'})"); time.sleep(0.2); loc.click(timeout=8000); time.sleep(0.4)
    def win(): return ev("()=>document.getElementById('secBody').innerText")
    ev("()=>{ window.__bk=JSON.stringify({ rec:B.rec||[], cats:B.cats, tx:B.tx, learn:B.learn||{}, learnN:B.learnN||{}, plans:B.plans||{} }); window.confirm=()=>true; }")
    try:
        ev("()=>{ showTab('budget'); renderBudget(); openSec('ric'); }"); time.sleep(0.8)
        check("finestra Ricorrenti: c'è l'elenco degli abbonamenti con «Aggiungi»", ev(f"()=>!!document.querySelector('{W} [data-rc=\"add\"]')"))
        # 1) Anthropic 21,95 € ogni mese, prelievo il 5 del mese prossimo
        tap(f'{W} [data-rc="add"]')
        f = ev(f"()=>{{ const b=document.querySelector('{W} .recf'); return {{ n:!!b.querySelector('.rc-n'), a:!!b.querySelector('.rc-a'), d:b.querySelector('.rc-d').type, fq:b.querySelectorAll('[data-rc=\"fq\"]').length, save:!!b.querySelector('[data-rc=\"save\"]') }}; }}")
        check("il modulo ha nome, importo, ogni mese/anno, data del prelievo (calendario) e Salva", f["n"] and f["a"] and f["d"] == "date" and f["fq"] == 2 and f["save"], f)
        tap(f'{W} [data-rc="save"]')
        check("senza nome non salva e lo dice", ev("()=>(B.rec||[]).length") == len(json.loads(ev("()=>__bk"))["rec"]))
        d5 = ev("()=>{ const t=today0(); return ymd(new Date(t.getFullYear(), t.getMonth()+1, 5)); }")
        page.locator(f"{W} .recf .rc-n").fill("Anthropic"); page.locator(f"{W} .recf .rc-a").fill("21,95"); page.locator(f"{W} .recf .rc-d").fill(d5)
        tap(f'{W} [data-rc="save"]'); time.sleep(0.6)
        r = ev("()=>{ const r=B.rec.find(x=>x.n==='Anthropic'), c=r&&B.cats.find(x=>x.rec===r.id); return { r, plan:c&&c.plan, day:c&&c.day }; }")
        check("Anthropic salvato: 21,95 € ogni mese il 5", r["r"] and abs(r["r"]["amt"] - 21.95) < 0.001 and r["r"]["freq"] == "m" and r["r"]["day"] == 5 and abs(r["plan"] - 21.95) < 0.001, r)
        t = win()
        check("nella finestra si vede «Anthropic» con 21,95 € (non 22 €)", "Anthropic" in t and "21,95" in t, t[-1500:])
        # 2) Google 0,49 € con i centesimi
        tap(f'{W} [data-rc="add"]')
        page.locator(f"{W} .recf .rc-n").fill("Google One"); page.locator(f"{W} .recf .rc-a").fill("0,49"); page.locator(f"{W} .recf .rc-d").fill(ev("()=>ymd(today0())"))
        tap(f'{W} [data-rc="save"]'); time.sleep(0.6)
        t = win()
        check("Google One 0,49 €: si vede «0,49», non «0 €»", "Google One" in t and "0,49" in t, t[-1500:])
        r = ev("()=>{ const st=bStatus(), c=B.cats.find(x=>x.n==='Google One'), row=st.ric.rows.find(x=>x.c.id===c.id); return { b:row&&row.b, cal:recCalendar(st).some(x=>x.c.id===c.id) }; }")
        check("Google One nel budget del mese (0,49 €) e nel calendario", r["b"] and abs(r["b"] - 0.49) < 0.001 and r["cal"], r)
        # 3) annuale con la data
        tap(f'{W} [data-rc="add"]')
        page.locator(f"{W} .recf .rc-n").fill("Dominio sito"); page.locator(f"{W} .recf .rc-a").fill("12,50"); tap(f'{W} .recf [data-rc="fq"][data-v="y"]')
        dy = ev("()=>{ const t=today0(); return ymd(new Date(t.getFullYear(), t.getMonth()+3, 14)); }")
        page.locator(f"{W} .recf .rc-d").fill(dy); tap(f'{W} [data-rc="save"]'); time.sleep(0.6)
        r = ev("()=>{ const r=B.rec.find(x=>x.n==='Dominio sito'), c=B.cats.find(x=>x.rec===r.id); return { freq:r.freq, day:r.day, month:r.month, due:c.sink&&c.sink.due, plan:c.plan }; }")
        check("annuale: 12,50 € ogni anno il 14, scadenza giusta, 1,04 € al mese da parte", r["freq"] == "y" and r["day"] == 14 and r["due"] == dy and abs(r["plan"] - 1.04) < 0.01, {**r, "atteso": dy})
        # 4) il telefono del questionario: importo e data veri
        tap(f'{W} [data-rc="edit"][data-key="c:telefono"]')
        f = ev(f"()=>{{ const b=document.querySelector('{W} .recf'); return {{ n:b.querySelector('.rc-n').value, a:b.querySelector('.rc-a').value }}; }}")
        page.locator(f"{W} .recf .rc-a").fill("9,99"); page.locator(f"{W} .recf .rc-d").fill(ev("()=>{ const t=today0(); return ymd(new Date(t.getFullYear(), t.getMonth()+1, 12)); }"))
        tap(f'{W} [data-rc="save"]'); time.sleep(0.6)
        r = ev("()=>{ const c=B.cats.find(x=>x.id==='telefono'); return { plan:c.plan, day:c.day }; }")
        check("telefono: modificato a 9,99 € il 12 di ogni mese", abs(r["plan"] - 9.99) < 0.001 and r["day"] == 12, {"prima": f, **r})
        check("nella finestra il telefono si vede con 9,99", "9,99" in win())
        # 5) un addebito già passato prima che iniziassi: si vede lo stesso, con la spiegazione
        r = ev("()=>{ const P=bStatus().P; return P.partial ? parseYmd(P.startDate).getDate() : null; }")
        if r and r > 1:
            tap(f'{W} [data-rc="add"]')
            page.locator(f"{W} .recf .rc-n").fill("Palestra"); page.locator(f"{W} .recf .rc-a").fill("35")
            page.locator(f"{W} .recf .rc-d").fill(ev("()=>{ const s=parseYmd(bStatus().P.startDate); return ymd(new Date(s.getFullYear(), s.getMonth(), 1)); }"))
            tap(f'{W} [data-rc="save"]'); time.sleep(0.6)
            t = win()
            check("addebito già passato questo mese: Palestra si vede lo stesso («conta dal prossimo»)", "Palestra" in t and "conta dal prossimo" in t, t[-1500:])
        # 6) Impostazioni: stesso elenco, si modifica anche da lì
        ev("()=>{ closeSec(); showTab('impostazioni'); renderRecSettings(); }"); time.sleep(0.6)
        t = ev("()=>document.getElementById('sRec').innerText")
        check("Impostazioni: lo stesso elenco con Anthropic 21,95 e Google One 0,49", "Anthropic" in t and "21,95" in t and "0,49" in t, t[:800])
        key = ev("()=>'r:'+B.rec.find(x=>x.n==='Anthropic').id")
        tap(f'#sRec [data-rc="edit"][data-key="{key}"]'); page.locator("#sRec .recf .rc-a").fill("23,18"); tap('#sRec [data-rc="save"]'); time.sleep(0.5)
        check("dalle Impostazioni: Anthropic 23,18 €", abs(ev("()=>B.rec.find(x=>x.n==='Anthropic').amt") - 23.18) < 0.001)
        check("totale dei soldi esatto con tutti gli abbonamenti", ev(EXACT)["ok"], ev(EXACT))
        # 7) dal pagamento in arrivo: importo e data modificabili
        ev("""()=>{ window.__fakeP=[{ id:'pz1', merchant:'Pagamento', amt:21.95, ts:Date.now(), status:'new', cat:'', kw:'', src:'fineco', pay:'' }]; if(!window.__np) window.__np=natPending;
            window.natPending=()=>window.__fakeP.filter(x=>x.status!=='done'); showTab('budget'); renderBudget(); }"""); time.sleep(0.5)
        tap('#inbox [data-ib="sub"]')
        page.locator("#inbox .subf .rc-n").fill("Claude Pro"); page.locator("#inbox .subf .rc-a").fill("21,96")
        dd = ev("()=>{ const t=today0(); return ymd(new Date(t.getFullYear(), t.getMonth(), Math.max(1,t.getDate()-1))); }")
        page.locator("#inbox .subf .rc-d").fill(dd); tap('#inbox [data-ib="subok"]'); time.sleep(0.6)
        r = ev("()=>{ const r=B.rec.find(x=>x.n==='Claude Pro'); return r&&{ amt:r.amt, day:r.day, tx:B.tx.some(t=>t.id==='np_pz1') }; }")
        check("dal pagamento: nome, importo e data cambiati prima di salvare", r and abs(r["amt"] - 21.96) < 0.001 and r["day"] == int(dd[-2:]) and r["tx"], r)
        check("totale esatto alla fine", ev(EXACT)["ok"], ev(EXACT))
    finally:
        ev("""()=>{ if(window.__np){ window.natPending=__np; delete window.__np; } const k=JSON.parse(__bk); B.rec=k.rec; B.cats=k.cats; B.tx=k.tx; B.learn=k.learn; B.learnN=k.learnN; B.plans=k.plans; B._inSub={}; REC_EDIT=null; bSave(); closeSec(); renderBudget(); }""")
    print(f"RESULT {sum(res)} / {len(res)}")
