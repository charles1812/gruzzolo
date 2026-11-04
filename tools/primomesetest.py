"""Primo mese: l'obiettivo di risparmio si toglie dai soldi da spendere; investire o tenerli sul conto è una scelta (tocchi veri),
poi la divisione tra liquidità e ETF con le quote da comprare; «Fatto» nel Piano riempie il serbatoio del risparmio.
Uso: dopo `fulltest.py onboard`, con la WebView (o Chrome) su localhost:9334."""
import json, time
from playwright.sync_api import sync_playwright

res = []
def check(name, ok, info=""):
    res.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  -- " + json.dumps(info, ensure_ascii=False, default=str)[:500]), flush=True)

with sync_playwright() as p:
    page = p.chromium.connect_over_cdp("http://localhost:9334").contexts[0].pages[0]
    ev = lambda js, a=None: page.evaluate(js, a)
    def tap(sel):
        loc = page.locator(sel).first; loc.evaluate("e=>e.scrollIntoView({block:'center'})"); time.sleep(0.2); loc.click(timeout=8000); time.sleep(0.6)
    ev("()=>{ window.confirm=()=>true; B.firstInv={}; bSave(); closeSec&&closeSec(); showTab('budget'); renderBudget(); }"); time.sleep(0.8)
    r = ev("""()=>{ const st=bStatus(), P=st.P, s0=B.start;
      const conto=s0.left-(P.replayRes||0)-(P.inv||0)-st.T.filter(t=>t.type!=='in').reduce((a,t)=>a+t.amt-(t.buoniVal||0),0);
      return { partial:P.partial, goal:P.goal, save:P.save, saved:P.saved, rem:st.remaining, conto, head:document.querySelector('.t4-h').innerText }; }""")
    check("primo mese con obiettivo: da mettere da parte > 0", r["partial"] and r["goal"] > 0 and r["save"] > 0, r)
    check("i soldi da spendere sono quelli sul conto meno quelli da mettere da parte", abs(r["rem"] - (r["conto"] - r["save"])) < 0.01, r)
    check("in alto c'è scritto che il risparmio non è compreso", "NON COMPRESI" in r["head"].upper(), r["head"])
    ev("()=>openSec('goal')"); time.sleep(0.8)
    txt = ev("()=>document.getElementById('secBody').innerText")
    check("obiettivo: la scelta del primo mese (investi una parte / tienili sul conto)", "Investine una parte" in txt and "Tienili tutti sul conto" in txt, txt[:500])
    # tienili sul conto
    tap('#secBody [data-b="fminv"][data-v="keep"]')
    k = ev("()=>{ const p=planCompute(), m=invMonth(); return { S:p.S, toFund:p.toFund, buys:p.buys.length, G:m.G, done:m.done, ch:B.firstInv[cycleOf().key] }; }")
    check("«tienili sul conto»: tutto al fondo, niente acquisti, niente da investire", k["ch"] == "keep" and abs(k["toFund"] - k["S"]) < 0.01 and k["buys"] == 0 and abs(k["G"] - k["done"]) < 0.01, k)
    ev("()=>openSec('goal')"); time.sleep(0.8)
    # cambio idea: investine una parte
    tap('#secBody [data-b="fminv"]')
    ev("()=>openSec('goal')"); time.sleep(0.8)
    k = ev("""()=>{ const p=planCompute(), m=invMonth(); return { ch:B.firstInv[cycleOf().key], S:p.S, toFund:p.toFund, fund:p.fund, target:p.target,
        buys:(()=>{ const L=invCands(); invPropose(L,m.toInvest); return L.filter(x=>x.n>0).map(x=>[x.t,x.n,+(x.n*x.px).toFixed(2)]); })(), toInv:m.toInvest, pot:m.pot, G:m.G, done:m.done, txt:document.getElementById('secBody').innerText }; }""")
    check("«investine una parte»: divisione tra conto ed ETF secondo il profilo", k["ch"] == "inv" and k["toFund"] < k["S"] - 1 and "COME LI DIVIDI" in k["txt"].upper(), {x: k[x] for x in ("ch", "S", "toFund", "fund", "target")})
    check("quote intere da comprare, entro i soldi per gli ETF", len(k["buys"]) > 0 and sum(b[2] for b in k["buys"]) <= k["toInv"] + 0.01 and k["toInv"] <= k["S"] - k["toFund"] + k["pot"] + 0.01 and all(b[1] >= 1 for b in k["buys"]), k["buys"])
    check("le quote sono scritte nella scheda («Compra N × ...»)", all(f"{b[1]} × " in k["txt"] for b in k["buys"]), k["txt"][-700:])
    check("Portafoglio: «Investimento del mese» = la parte da investire", abs(k["G"] - (k["S"] - k["toFund"] + k["done"])) < 1.01, {x: k[x] for x in ("G", "S", "toFund", "done")})
    # «Scegli cosa comprare» dalla scheda: le quote proposte sono le stesse, «Ho comprato» riempie il serbatoio del risparmio
    ev("()=>{ window.__bk2=JSON.stringify({ inv:B.inv||[], hold:holdings, pot:PL.pot||0, potLog:PL.potLog||[] }); }")
    before = ev("()=>({ rem:bStatus().remaining, done:goalDone(bStatus()), hold:holdings.map(h=>h.ticker+':'+h.qty).join(',') })")
    tap('#secBody [data-pot="buy"]'); time.sleep(0.6)
    prop = ev("()=>INV.L.filter(x=>x.n>0).map(x=>[x.t,x.n])")
    check("«Scegli cosa comprare» propone le stesse quote della scheda", sorted(prop) == sorted([b[0], b[1]] for b in k["buys"]), {"proposte": prop, "scheda": k["buys"]})
    tap('#invScrim [data-inv="ok"]'); time.sleep(0.8)
    after = ev("()=>({ rem:bStatus().remaining, done:goalDone(bStatus()), save:bStatus().P.save, hold:holdings.map(h=>h.ticker+':'+h.qty).join(',') })")
    check("«Ho comprato»: già messo da parte sale, i soldi da spendere restano uguali, le quote entrano", after["done"] > before["done"] + 1 and abs(after["rem"] - before["rem"]) < 1.01 and after["hold"] != before["hold"], {"prima": before, "dopo": after})
    ev("()=>{ const o=JSON.parse(window.__bk2); B.inv=o.inv; holdings=o.hold; store.set('holdings',holdings); PL.pot=o.pot; PL.potLog=o.potLog; bSave(); plSave(); render(); }")
    # Portafoglio: la stessa scelta del primo mese, e con il portafoglio vuoto il tasto per aggiungere posizioni o acquisti
    ev("()=>{ B.firstInv={}; bSave(); closeSec(); document.querySelectorAll('.scrim.open').forEach(x=>x.classList.remove('open')); showTab('portafoglio'); render(); mountPot(); }"); time.sleep(0.8)
    t0 = ev("()=>document.getElementById('potHost').innerText.toUpperCase()")
    check("Portafoglio: si vedono da mettere da parte, sul conto e da investire", all(w in t0 for w in ("DA METTERE DA PARTE", "SUL CONTO", "DA INVESTIRE")), t0[:400])
    check("Portafoglio, primo mese: «Vuoi investire questo mese?» con Sì / No", "VUOI INVESTIRE QUESTO MESE" in t0 and ev("()=>!!document.querySelector('#potHost [data-b=\"fminv\"][data-v=\"keep\"]')"), t0[:400])
    tap('#potHost [data-b="fminv"][data-v="inv"]')
    m = ev("()=>invMonth()")
    check("dopo il Sì, «da investire» non è più 0", m["toInvest"] > 1, m)
    # il portafoglio proposto è lì, senza aprire niente: quote, prezzo che si può correggere, «Ho comprato»
    pr = ev("()=>({ rows:document.querySelectorAll('#invInline .inv-r').length, buys:INV.L.filter(x=>x.n>0).map(x=>[x.t,x.n]), txt:document.getElementById('potHost').innerText })")
    check("Portafoglio: il portafoglio proposto con le quote da comprare", pr["rows"] > 0 and len(pr["buys"]) > 0 and all(f"{n} × " in pr["txt"] for _, n in pr["buys"]), pr)
    i0 = ev("()=>INV.L.findIndex(x=>x.n>0)")
    tk, n0 = ev(f"()=>[INV.L[{i0}].t, INV.L[{i0}].n]")
    inp = page.locator(f'#invInline [data-invpx="{i0}"]'); inp.fill("4,5"); inp.dispatch_event("change"); time.sleep(0.4)
    check("prezzo corretto a mano: il totale si aggiorna", abs(ev(f"()=>INV.L[{i0}].px") - 4.5) < 0.001 and ev(f"()=>document.getElementById('invInline').innerText.includes(money({4.5 * n0}))"), ev("()=>document.getElementById('invInline').innerText")[:300])
    ev("()=>{ window.__bk5=JSON.stringify({ inv:B.inv||[], hold:holdings, pot:PL.pot||0, potLog:PL.potLog||[] }); }")
    before = ev("()=>holdings.map(h=>h.ticker+':'+h.qty).join(',')")
    tap('#invInline [data-inv="ok"]'); time.sleep(0.8)
    got = ev(f"()=>{{ const h=holdings.find(x=>x.ticker==='{tk}'); return h?{{ qty:h.qty, avg:h.avg }}:null; }}")
    check("«Ho comprato» nel Portafoglio: le posizioni entrano, con il prezzo corretto", got is not None and ev("()=>holdings.map(h=>h.ticker+':'+h.qty).join(',')") != before and (got["qty"] > n0 - 0.001), {"pos": got, "prima": before})
    ev("()=>{ const o=JSON.parse(window.__bk5); B.inv=o.inv; holdings=o.hold; store.set('holdings',holdings); PL.pot=o.pot; PL.potLog=o.potLog; bSave(); plSave(); render(); }")
    # «No, tienili sul conto»: niente proposta, tutto sul conto, si può cambiare idea
    ev("()=>{ B.firstInv={}; bSave(); mountPot(); }"); time.sleep(0.3)
    tap('#potHost [data-b="fminv"][data-v="keep"]')
    k2 = ev("()=>({ inline:!!document.getElementById('invInline'), txt:document.getElementById('potHost').innerText, again:!!document.querySelector('#potHost [data-b=\"fminv\"][data-v=\"inv\"]') })")
    check("«No, tienili sul conto»: niente acquisti, e c'è «Cambia idea»", not k2["inline"] and "restano sul conto" in k2["txt"] and k2["again"], k2["txt"][:400])
    ev("()=>{ window.__bk3=JSON.stringify(holdings); holdings=[]; mountForziere(); }"); time.sleep(0.4)
    check("portafoglio vuoto: c'è «Aggiungi una posizione o un acquisto»", ev("()=>!!document.querySelector('#fzHost [data-fzadd]')"))
    tap('#fzHost [data-fzadd]')
    check("il tasto apre il foglio della posizione", ev("()=>document.getElementById('posScrim').classList.contains('open')"))
    ev("()=>{ closeM('#posScrim'); holdings=JSON.parse(window.__bk3); store.set('holdings',holdings); render(); }")
    # Replay «inizia dal mese prossimo»
    ev("()=>{ window.__bk4=JSON.stringify(replay); }")
    page.locator("#editReplayBtn").evaluate("e=>e.click()"); time.sleep(0.5)
    r0 = ev("()=>document.getElementById('rNext').classList.contains('on')")
    tap("#rNext"); tap("#saveReplay"); time.sleep(1)
    r = ev("()=>{ const t=today0(), nx=new Date(t.getFullYear(),t.getMonth()+1,1), nr=nextReplay(); return { from:replay.from, want:ymKey(nx), next:ymd(nr.date), rr:bStatus().P.replayRes, auto:replayAutoApply() }; }")
    check("Replay «inizia dal mese prossimo»: il primo acquisto è il mese prossimo, questo mese non conta e non compra", not r0 and r["from"] == r["want"] and r["next"][:7] == r["want"] and r["rr"] == 0 and r["auto"] is False, r)
    ev("()=>{ replay=JSON.parse(window.__bk4); store.set('replay',replay); B.firstInv={}; bSave(); showTab('budget'); renderBudget(); }")
    print(f"RESULT {sum(res)} / {len(res)}")
