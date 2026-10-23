"""Prova delle Sfide come un utente, spostando la data di oggi (today0) per vedere vittorie, sconfitte e premi.
Lascia i dati come li ha trovati. Uso: adb forward tcp:9334 ...; python tools/sfidetest.py"""
import json, time
from playwright.sync_api import sync_playwright

res = []
def check(name, ok, info=""):
    res.append(ok); print(("PASS " if ok else "FAIL ") + name + ("  -- " + json.dumps(info, ensure_ascii=False)[:300] if not ok else ""), flush=True)

with sync_playwright() as p:
    page = p.chromium.connect_over_cdp("http://localhost:9334").contexts[0].pages[0]
    ev = lambda js: page.evaluate("async () => {" + js + "}")
    page.evaluate("()=>{ window.confirm=()=>true; }")
    ev("""window.__bk=JSON.stringify({ ch:B.ch, tx:B.tx, pot:PL.pot }); window.__t0=today0;
      window.fake=(off)=>{ const d=addDays(sfMonday(__t0()),7+off); window.today0=()=>new Date(d); return ymd(d); };
      window.mon=()=>ymd(sfMonday(today0()));
      window.tx=(cat,amt,d)=>{ B.tx.push({ id:"t"+Math.random().toString(36).slice(2), type:"out", cat, amt, d, note:"prova" }); };
      window.fresh=(ids,on)=>{ B.ch={ on:{}, won:[], w52:[], claimed:{}, init:1 }; ids.forEach(i=>B.ch.on[i]=on); };
      showTab("sfide"); return 1;""")
    try:
        # giorni senza spese: lun-mer senza tempo libero, oggi giovedì
        r = ev("fake(3); fresh(['nospend'], mon()); B.tx=B.tx.filter(t=>t.d<mon()); renderSfide(); return { e:sfEval('nospend'), won:B.ch.won.length }")
        check("giorni senza spese: 3 giorni finiti senza spese = vinta", r["e"]["won"] and r["won"] == 1, r)
        r = ev("fake(1); fresh(['nospend'], mon()); renderSfide(); return sfEval('nospend')")
        check("giorni senza spese: martedì conta solo lunedì (oggi non ancora)", r["v"] == "1/3" and not r["won"], r)
        r = ev("fake(3); fresh(['nospend'], mon()); tx('weekend',20,ymd(addDays(today0(),-2))); renderSfide(); return sfEval('nospend')")
        check("giorni senza spese: una spesa di tempo libero martedì = 2/3", r["v"] == "2/3" and not r["won"], r)

        # premio nel «da investire» con un tocco
        ev("fake(3); fresh(['nospend'], mon()); B.tx=B.tx.filter(t=>t.note!=='prova'); renderSfide(); return 1")
        pot0 = ev("return +PL.pot||0"); amt = ev("const b=document.querySelector('[data-sf=claim]'); return b?+b.dataset.a:null")
        page.locator("[data-sf=claim]").first.click(); time.sleep(0.4)
        pot1 = ev("return +PL.pot||0"); again = ev("return !!document.querySelector('[data-sf=claim][data-v=nospend]')")
        check("premio messo da investire una volta sola", amt and abs(pot1 - pot0 - amt) < 0.01 and not again, [pot0, pot1, amt, again])

        # settimana schiscetta
        r = ev("fake(5); fresh(['lunch'], ymd(addDays(sfMonday(today0()),-7))); tx('fuori',9,ymd(addDays(sfMonday(today0()),1))); renderSfide(); return sfEval('lunch')")
        check("schiscetta: 1 pranzo comprato, sabato = vinta", r["won"], r)
        r = ev("fake(3); return sfEval('lunch')")
        check("schiscetta: giovedì non è ancora vinta", not r["won"], r)
        r = ev("fake(5); tx('pasto',6,ymd(addDays(sfMonday(today0()),2))); return sfEval('lunch')")
        check("schiscetta: 2 pranzi = persa", r["lost"] and not r["won"], r)

        # sigarette (se c'è la categoria)
        has = ev("return B.cats.some(c=>c.id==='vizio')")
        if has:
            r = ev("fake(3); fresh(['smoke'], ymd(addDays(today0(),-8))); B.tx=B.tx.filter(t=>t.note!=='prova'); return sfEval('smoke')")
            check("sigarette: 8 giorni senza = vinta", r["won"] and r["v"].startswith("8"), r)
            r = ev("tx('vizio',5.5,ymd(addDays(today0(),-2))); return sfEval('smoke')")
            check("sigarette: comprate 2 giorni fa = riparte da 2", r["v"].startswith("2") and not r["won"], r)
            r = ev("fake(3); fresh(['smoke'], ymd(today0())); B.tx=B.tx.filter(t=>t.note!=='prova'); return sfEval('smoke')")
            check("sigarette: il giorno in cui la inizi conta 0", r["v"].startswith("0"), r)

        # tutto segnato: conta solo da quando l'hai iniziata
        r = ev("fake(3); fresh(['log'], ymd(addDays(today0(),-2))); for(let i=0;i<10;i++) tx('spesa',3,ymd(addDays(today0(),-i))); return sfEval('log')")
        check("tutto segnato: iniziata 2 giorni fa = 3 giorni, non 10", r["v"].startswith("3") and not r["won"], r)

        # arrotonda: si può mettere da parte più volte
        r = ev("fake(3); B.tx=B.tx.filter(t=>t.note!=='prova'); fresh(['round'], ymd(today0())); const b=sfEval('round'); tx('spesa',18.6,ymd(today0())); const a=sfEval('round'); return { b:b.saved, a:a.saved }")
        ev("renderSfide(); return 1"); p0 = ev("return +PL.pot||0")
        page.locator('[data-sf=claim][data-v=round]').click(); time.sleep(0.3)
        p1 = ev("return +PL.pot||0"); r2 = ev("tx('spesa',3.2,ymd(today0())); renderSfide(); return sfEval('round')")
        check("arrotonda: 18,60 → 1,40 da investire, poi 3,20 → altri 1,80", abs(r["a"] - r["b"] - 1.4) < 0.01 and abs(p1 - p0 - (r["a"])) < 0.01 and abs(r2["saved"] - 1.8) < 0.01 and r2["claimable"], [r, p0, p1, r2])

        # 52 settimane: una volta a settimana
        ev("fake(3); fresh(['w52'], ymd(today0())); renderSfide(); return 1"); q0 = ev("return +PL.pot||0")
        page.locator('[data-sf=w52]').click(); time.sleep(0.3)
        r = ev("return { n:B.ch.w52.length, btn:!!document.querySelector('[data-sf=w52]'), pot:+PL.pot }")
        check("52 settimane: 1 € messo da parte, bottone sparito fino a lunedì", r["n"] == 1 and not r["btn"] and abs(r["pot"] - q0 - 1) < 0.01, r)
        r = ev("fake(8); renderSfide(); return !!document.querySelector('[data-sf=w52]')")
        check("52 settimane: la settimana dopo il bottone torna (2 €)", r, r)

        # chiudere e riaprire
        ev("fake(3); fresh(['nospend','round'], ymd(today0())); renderSfide(); return 1")
        page.locator('.sf-x[data-v=round]').click(); time.sleep(0.3)
        r = ev("return { on:Object.keys(B.ch.on), off:[...document.querySelectorAll('[data-sf=on]')].map(b=>b.dataset.v) }")
        check("chiudi una sfida: sparisce da In corso e torna in Altre sfide", r["on"] == ["nospend"] and "round" in r["off"], r)
        page.locator('[data-sf=on][data-v=round]').evaluate("e=>e.scrollIntoView({inline:'center'})"); page.locator('[data-sf=on][data-v=round]').click(); time.sleep(0.3)
        r = ev("return Object.keys(B.ch.on)")
        check("riapri la sfida da Altre sfide", "round" in r, r)
    finally:
        ev("const k=JSON.parse(__bk); B.ch=k.ch; B.tx=k.tx; PL.pot=k.pot; window.today0=__t0; bSave(); plSave(); renderSfide(); return 1")
    print(f"RESULT {sum(res)} / {len(res)}")
