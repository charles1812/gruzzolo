"""Pagamenti da confermare come li vede una persona: «🔁 È un abbonamento» (nome, data dal pagamento), nessun negozio imparato
da «Pagamento», buoni pasto non richiesti due volte, niente doppioni con le spese scritte a mano.
Lascia i dati come li ha trovati. Uso: dopo `fulltest.py onboard`, con la WebView su localhost:9334."""
import json, time
from playwright.sync_api import sync_playwright

res = []
def check(name, ok, info=""):
    res.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  -- " + json.dumps(info, ensure_ascii=False)[:500]), flush=True)

EXACT = """()=>{ const st=bStatus(), P=st.P, s0=B.start; if(!P.partial) return { ok:true };
  const conto=s0.left-(P.replayRes||0)-(P.inv||0)-st.T.filter(t=>t.type!=='in').reduce((a,t)=>a+t.amt-(t.buoniVal||0),0);
  return { ok:Math.abs(st.remaining-conto)<0.01, remaining:+st.remaining.toFixed(2), conto:+conto.toFixed(2) }; }"""

FAKE = """(L)=>{ window.__fakeP=L; if(!window.__np){ window.__np=natPending; window.__rm=NAT.removePayments; }
  window.natPending=()=>window.__fakeP.filter(x=>x.status!=='done');
  NAT.removePayments=(j)=>{ JSON.parse(j).forEach(i=>{ const x=__fakeP.find(y=>y.id===i); if(x) x.status='done'; }); };
  closeSec&&closeSec(); showTab('budget'); renderBudget(); }"""

with sync_playwright() as p:
    page = p.chromium.connect_over_cdp("http://localhost:9334").contexts[0].pages[0]
    ev = lambda js, a=None: page.evaluate(js, a)
    def tap(sel):
        loc = page.locator(sel).first; loc.evaluate("e=>e.scrollIntoView({block:'center'})"); time.sleep(0.2); loc.click(timeout=8000); time.sleep(0.4)
    ev("()=>{ window.__bk=JSON.stringify({ rec:B.rec||[], cats:B.cats, tx:B.tx, learn:B.learn||{}, learnN:B.learnN||{}, plans:B.plans||{}, buoni:B.buoni }); window.confirm=()=>true; }")
    try:
        now = ev("()=>Date.now()")
        # 1) «Pagamento» da 0,49 € di Fineco, indovinato come Pranzo pronto: è un abbonamento Google
        ev(FAKE, [{ "id":"pg1", "merchant":"Pagamento", "amt":0.49, "ts":now, "status":"new", "cat":"pasto", "kw":"", "src":"fineco", "pay":"" }])
        time.sleep(0.5)
        has = ev("()=>!!document.querySelector('#inbox [data-ib=\"sub\"]')")
        check("pagamento da confermare: c'è «🔁 È un abbonamento»", has)
        tap('#inbox [data-ib="sub"]'); time.sleep(0.4)
        r = ev("()=>{ const f=document.querySelector('#inbox .subf'); return { v:f.querySelector('.rc-n').value, a:f.querySelector('.rc-a').value, d:f.querySelector('.rc-d').value, today:ymd(new Date()), fq:f.querySelectorAll('[data-rc=\"fq\"]').length }; }")
        day = ev("()=>new Date().getDate()")
        check("il modulo ha nome (vuoto per «Pagamento»), importo 0,49, ogni mese/anno e data del prelievo = oggi", r["v"] == "" and r["a"] == "0,49" and r["d"] == r["today"] and r["fq"] == 2, r)
        tap('#inbox [data-ib="subok"]')
        r = ev("()=>(B.rec||[]).length")
        check("senza nome non salva", r == len(json.loads(ev("()=>__bk"))["rec"]), r)
        page.locator("#inbox .subN").fill("Google One"); tap('#inbox [data-ib="subok"]'); time.sleep(0.5)
        r = ev("""()=>{ const r=(B.rec||[]).find(x=>x.n==='Google One'), c=r&&B.cats.find(x=>x.rec===r.id), t=B.tx.find(x=>x.id==='np_pg1');
            const cal=recCalendar(bStatus()).find(x=>c&&x.c.id===c.id);
            return { r, cat:t&&t.cat, cid:c&&c.id, note:t&&t.note, paid:cal&&cal.state, learn:Object.keys(B.learn||{}).filter(k=>/PAGAMENTO/.test(k)), inbox:!!document.querySelector('#inbox .ib-item'), np:natPending===window.__np }; }""")
        check("salvato: Google One 0,49 € ogni mese con il giorno di oggi, la spesa va lì e risulta pagata",
              r["r"] and abs(r["r"]["amt"] - 0.49) < 0.001 and r["r"]["freq"] == "m" and r["r"]["day"] == day and r["cat"] == r["cid"] and r["note"] == "Google One" and r["paid"] == "paid", r)
        check("da «Pagamento» non impara niente (non diventa Pranzo pronto per tutti)", r["learn"] == [] and r["r"]["merchant"] == [], r)
        check("totale esatto con l'abbonamento", ev(EXACT)["ok"], ev(EXACT))
        # 2) il mese dopo, un altro «Pagamento» da 0,49 lo stesso giorno: riconosciuto; uno da 30 € no
        r = ev("""()=>{ const d=new Date(); d.setMonth(d.getMonth()+1); const a=recMatch({ merchant:'Pagamento', amt:0.49, ts:d.getTime() }), b=recMatch({ merchant:'Pagamento', amt:30, ts:d.getTime() }); return { a:a&&a.n, b:b&&b.n }; }""")
        check("mese dopo: 0,49 € lo stesso giorno = Google One; 30 € no", r["a"] == "Google One" and not r["b"], r)
        # 3) annuale con un negozio vero
        ev(FAKE, [{ "id":"pg2", "merchant":"GOOGLE *YOUTUBE", "amt":119.99, "ts":now, "status":"new", "cat":"", "kw":"", "src":"wallet", "pay":"" }])
        time.sleep(0.4); tap('#inbox [data-ib="sub"]')
        nm = ev("()=>document.querySelector('#inbox .subN').value")
        tap('#inbox .subf [data-rc="fq"][data-v="y"]')
        page.locator("#inbox .subN").fill("YouTube Premium"); tap('#inbox [data-ib="subok"]'); time.sleep(0.5)
        r = ev("()=>{ const r=B.rec.find(x=>x.n==='YouTube Premium'), c=B.cats.find(x=>x.rec===r.id); return { freq:r.freq, month:r.month, m:new Date().getMonth(), merch:r.merchant, plan:c.plan, annual:c.sink&&c.sink.annual }; }")
        check("annuale: nome proposto dal negozio, 119,99 € l'anno (10 € al mese), negozio imparato",
              nm.lower().startswith("google") and r["freq"] == "y" and r["month"] == r["m"] and abs(r["annual"] - 119.99) < 0.01 and abs(r["plan"] - 10) < 0.01 and "GOOGLE YOUTUBE" in r["merch"], {"nm": nm, **r})
        check("totale esatto con l'annuale", ev(EXACT)["ok"], ev(EXACT))
        # 4) buoni: una spesa Fineco segnata con 1 buono (modificata a mano) non viene richiesta
        r = ev("""()=>{ const p={ id:'pb1', merchant:'Pagamento', amt:11.92, ts:Date.now(), cat:'pasto', src:'fineco' }; addWalletTx(p,'pasto');
            const t=B.tx.find(x=>x.id==='np_pb1'); openQuickAdd(t.id); qa.buoni=1; saveQa(); renderBudget();
            const asked=[...document.querySelectorAll('[data-tb]')].some(b=>b.dataset.id==='np_pb1');
            return { asked, buoniN:t.buoniN, flag:t.buoniAsked }; }""")
        check("spesa modificata con 1 buono: non chiede più «Hai usato buoni pasto?»", not r["asked"] and r["buoniN"] == 1 and r["flag"], r)
        r = ev("""()=>{ const p={ id:'pb2', merchant:'Pagamento', amt:9.5, ts:Date.now(), cat:'pasto', src:'fineco' }; addWalletTx(p,'pasto');
            const t=B.tx.find(x=>x.id==='np_pb2'); t.buoniN=1; t.buoniVal=8; renderBudget();
            return [...document.querySelectorAll('[data-tb]')].some(b=>b.dataset.id==='np_pb2'); }""")
        check("spesa che ha già i buoni: non li richiede", not r, r)
        # 5) scritta a mano con il buono, poi la notifica segnata da sola: non la conto due volte
        r = ev("""()=>{ const t={ id:uid('t'), src:'manual', type:'out', d:ymd(new Date()), ts:Date.now(), amt:14.5, cat:'pasto', note:'Pranzo' }; B.tx.push(t); setBuoni(t,1);
            const n0=B.tx.length; window.natPending=()=>window.__fakeP.filter(x=>x.status!=='done'); window.__fakeP=[{ id:'pa1', merchant:'Pagamento', amt:14.5, ts:Date.now(), status:'confirmed', auto:true, cat:'pasto', src:'fineco' }];
            importNativePayments(); return { added:B.tx.length-n0, amt:t.amt }; }""")
        check("spesa scritta a mano (6,50 € + 1 buono) e poi la notifica segnata da sola: niente doppione", r["added"] == 0, r)
        r = ev("""()=>{ const n0=B.tx.length; window.natPending=()=>window.__fakeP.filter(x=>x.status!=='done'); window.__fakeP=[{ id:'pa2', merchant:'ESSO', amt:61.3, ts:Date.now(), status:'confirmed', auto:true, cat:'benzina', src:'fineco' }];
            importNativePayments(); return B.tx.length-n0; }""")
        check("una notifica segnata da sola senza doppione entra normalmente", r == 1, r)
        check("totale esatto alla fine", ev(EXACT)["ok"], ev(EXACT))
    finally:
        ev("""()=>{ if(window.__np){ window.natPending=__np; NAT.removePayments=__rm; } const k=JSON.parse(__bk); B.rec=k.rec; B.cats=k.cats; B.tx=k.tx; B.learn=k.learn; B.learnN=k.learnN; B.plans=k.plans; B.buoni=k.buoni; B._inSub={}; bSave(); renderBudget(); }""")
    print(f"RESULT {sum(res)} / {len(res)}")
