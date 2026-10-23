"""Spese ricorrenti come le usa una persona: Impostazioni → «Spese ricorrenti» (tocchi veri), calendario del mese,
pagamento riconosciuto («Sì, è Netflix») con il negozio imparato, «Pagata?», totale dei soldi sempre esatto.
Lascia i dati come li ha trovati. Uso: dopo `fulltest.py onboard`, con la WebView su localhost:9334."""
import json, time
from playwright.sync_api import sync_playwright

res = []
def check(name, ok, info=""):
    res.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  -- " + json.dumps(info, ensure_ascii=False)[:500]), flush=True)

EXACT = """()=>{ const st=bStatus(), P=st.P, s0=B.start; if(!P.partial) return { ok:true };
  const conto=s0.left-(P.replayRes||0)-(P.inv||0)-st.T.filter(t=>t.type!=='in').reduce((a,t)=>a+t.amt-(t.buoniVal||0),0);
  return { ok:Math.abs(st.remaining-conto)<0.01, remaining:+st.remaining.toFixed(2), conto:+conto.toFixed(2) }; }"""

with sync_playwright() as p:
    page = p.chromium.connect_over_cdp("http://localhost:9334").contexts[0].pages[0]
    ev = lambda js, a=None: page.evaluate(js, a)
    def tap(sel):
        loc = page.locator(sel).first; loc.evaluate("e=>e.scrollIntoView({block:'center'})"); time.sleep(0.2); loc.click(timeout=8000); time.sleep(0.35)
    ev("()=>{ window.__bkr=JSON.stringify({ rec:B.rec||[], cats:B.cats, tx:B.tx, learn:B.learn||{}, learnN:B.learnN||{}, plans:B.plans||{} }); window.confirm=()=>true; }")
    try:
        today = ev("()=>today0().getDate()")
        # 1) Impostazioni → Aggiungi → Netflix (preset), giorno di oggi
        ev("()=>{ closeSec&&closeSec(); showTab('impostazioni'); renderRecSettings(); }"); time.sleep(0.6)
        tap('#sRec [data-rc="add"]'); tap('#sRec [data-rc="pre"][data-n="Netflix"]')
        page.locator("#sRec .recf .rc-d").fill(ev("()=>ymd(today0())")); tap('#sRec [data-rc="save"]'); time.sleep(0.4)
        r = ev("()=>{ const r=(B.rec||[]).find(x=>x.n==='Netflix'), c=r&&B.cats.find(x=>x.rec===r.id); return { r, c:c&&{ id:c.id, g:c.g, plan:c.plan, day:c.day }, list:document.getElementById('sRec').innerText }; }")
        check("Impostazioni: Netflix aggiunta (13,99 € ogni mese, con il giorno) e diventa una spesa fissa", r["r"] and r["c"] and r["c"]["g"] == "fisse" and abs(r["c"]["plan"] - 13.99) < 0.01 and r["c"]["day"] == today and "Netflix" in r["list"], r)
        nid = r["c"]["id"]
        # 2) annuale: Amazon Prime 49,90 € ogni anno
        tap('#sRec [data-rc="add"]'); tap('#sRec [data-rc="pre"][data-n="Amazon Prime"]'); page.locator("#sRec .recf .rc-d").fill(ev("()=>{ const t=today0(); return ymd(new Date(t.getFullYear(), t.getMonth(), 3)); }")); tap('#sRec [data-rc="save"]'); time.sleep(0.4)
        r = ev("()=>{ const r=(B.rec||[]).find(x=>x.n==='Amazon Prime'), c=r&&B.cats.find(x=>x.rec===r.id); return { freq:r&&r.freq, plan:c&&c.plan, annual:c&&c.sink&&c.sink.annual, due:c&&c.sink&&c.sink.due }; }")
        check("Amazon Prime annuale: 49,90 € all'anno, da parte 4,16 € al mese, con la scadenza", r["freq"] == "y" and abs(r["annual"] - 49.9) < 0.01 and abs(r["plan"] - 4.16) < 0.01 and r["due"], r)
        # 3) modifica: Netflix 12,99
        key = ev("()=>'r:'+(B.rec.find(x=>x.n==='Netflix').id)")
        tap(f'#sRec [data-rc="edit"][data-key="{key}"]'); page.locator("#sRec .recf .rc-a").fill("12,99"); tap('#sRec [data-rc="save"]'); time.sleep(0.4)
        r = ev("id=>B.cats.find(x=>x.id===id).plan", nid)
        check("modifica: Netflix ora 12,99 €", abs(r - 12.99) < 0.01, r)
        # 4) nel Budget: Ricorrenti conta Netflix, il calendario la mostra «oggi» con «Pagata?»
        ev("()=>{ showTab('budget'); renderBudget(); openSec('ric'); }"); time.sleep(0.8)
        r = ev("id=>{ const st=bStatus(), row=st.rows.find(x=>x.c.id===id), cal=recCalendar(st).map(x=>[x.c.n,x.state]); return { b:row&&row.b, cal, html:document.getElementById('secBody').innerText.slice(0,900), pay:!!document.querySelector('#secBody .rcal [data-fxpay=\"'+id+'\"]') }; }", nid)
        check("Ricorrenti: Netflix nel budget del mese (12,99 €) e nel calendario di oggi con «Pagata?»", r["b"] and abs(r["b"] - 12.99) < 0.01 and ["Netflix", "today"] in r["cal"] and r["pay"], r)
        check("totale dei soldi ancora esatto con le spese ricorrenti", ev(EXACT)["ok"], ev(EXACT))
        # 5) arriva un pagamento simile: «Sì, è Netflix», imparo il negozio
        ev("""()=>{ window.__np=natPending; window.__fakeP=[{ id:'pnet1', merchant:'NETFLIX.COM', amt:12.99, ts:Date.now(), status:'new', cat:'abbon', kw:'', src:'wallet', pay:'' }];
            window.natPending=()=>window.__fakeP.filter(x=>x.status==='new'); window.__rm=NAT&&NAT.removePayments; if(NAT) NAT.removePayments=(j)=>{ JSON.parse(j).forEach(i=>{ const x=__fakeP.find(y=>y.id===i); if(x) x.status='done'; }); };
            closeSec(); showTab('budget'); renderBudget(); }""")
        time.sleep(0.6)
        sug = ev("()=>{ const n=document.querySelector('#inbox .bc-note.rec'); return n?n.innerText:''; }")
        check("pagamento di 12,99 € oggi: «Sembra Netflix, la tua spesa ricorrente»", "Netflix" in sug, sug)
        tap('#inbox [data-ib="rec"]'); time.sleep(0.5)
        r = ev("id=>{ const t=B.tx.find(x=>x.id==='np_pnet1'), k=merchantKey('NETFLIX.COM'), r=B.rec.find(x=>x.n==='Netflix'); return { cat:t&&t.cat, learn:B.learnN[k], merch:r.merchant, paid:recCalendar(bStatus()).find(x=>x.c.id===id) }; }", nid)
        check("«Sì, è Netflix»: spesa segnata come Netflix, negozio imparato (le prossime volte da sola)", r["cat"] == nid and r["learn"] and r["learn"]["n"] >= 2 and r["learn"]["cat"] == nid and "NETFLIX COM" in (r["merch"] or []), r)
        check("calendario: Netflix ora «pagata»", r["paid"] and r["paid"]["state"] == "paid", r["paid"])
        # 6) riconoscimento: stesso negozio un altro giorno sì, importo diverso a caso no
        r = ev("""()=>{ const a=recMatch({ merchant:'NETFLIX.COM', amt:12.99, ts:Date.now()+9*86400e3 }), b=recMatch({ merchant:'BAR SPORT', amt:30, ts:Date.now() });
            return { shop:a&&a.n, other:b&&b.n }; }""")
        check("riconosce Netflix dal negozio anche in un altro giorno; un bar da 30 € no", r["shop"] == "Netflix" and not r["other"], r)
        check("totale ancora esatto dopo il pagamento", ev(EXACT)["ok"], ev(EXACT))
        ev("()=>{ window.natPending=__np; if(NAT&&__rm) NAT.removePayments=__rm; }")
        # 7) «Pagata?» dal calendario per una spesa senza notifica
        ev("()=>{ const r={ id:uid('rc'), n:'Palestra', amt:35, freq:'m', day:today0().getDate(), e:'🏋️', merchant:[] }; B.rec.push(r); recAfter(); openSec('ric'); }"); time.sleep(0.8)
        pid = ev("()=>B.cats.find(c=>c.n==='Palestra').id")
        tap(f'#secBody .rcal [data-fxpay="{pid}"]'); time.sleep(0.5)
        r = ev("id=>({ tx:B.tx.filter(t=>t.cat===id).map(t=>t.amt), st:(recCalendar(bStatus()).find(x=>x.c.id===id)||{}).state })", pid)
        check("«Pagata?» sulla palestra: 35 € segnati e il calendario la dà pagata", r["tx"] == [35] and r["st"] == "paid", r)
        # 8) togliere
        ev("()=>{ closeSec(); showTab('impostazioni'); renderRecSettings(); }"); time.sleep(0.5)
        key = ev("()=>'r:'+(B.rec.find(x=>x.n==='Amazon Prime').id)")
        tap(f'#sRec [data-rc="del"][data-key="{key}"]'); time.sleep(0.4)
        r = ev("()=>({ rec:(B.rec||[]).map(x=>x.n), cat:B.cats.some(c=>c.n==='Amazon Prime') })")
        check("togli Amazon Prime: sparisce dall'elenco e dal budget", "Amazon Prime" not in r["rec"] and not r["cat"], r)
    finally:
        ev("()=>{ const k=JSON.parse(__bkr); B.rec=k.rec; B.cats=k.cats; B.tx=k.tx; B.learn=k.learn; B.learnN=k.learnN; B.plans=k.plans; bSave(); renderBudget(); }")
    print(f"RESULT {sum(res)} / {len(res)}")
