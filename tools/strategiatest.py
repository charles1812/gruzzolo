"""Strategia (Piano) come la userebbe una persona: tocchi veri sui profili, pesi su misura con i cursori, «Applica»;
i numeri di ogni portafoglio (rendimento, calo peggiore, volatilità, 12 mesi peggiori, recupero, backtest dei versamenti)
ricalcolati qui in Python sugli stessi mesi storici; poi serbatoio e acquisti del Portafoglio con la strategia scelta.
Uso: dopo `fulltest.py onboard`, con la WebView (o Chrome) su localhost:9334. Alla fine rimette la strategia di prima."""
import json, math, time
from playwright.sync_api import sync_playwright

res = []
def check(name, ok, info=""):
    res.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  -- " + json.dumps(info, ensure_ascii=False, default=str)[:600]), flush=True)

def stats(H, w):
    N = len(H["months"]); v = [1.0]
    for t in range(N): v.append(v[-1] * (1 + sum(w[k] * H["r"][k][t] for k in w)))
    peak, pk, mdd, at, atpk = 1.0, 0, 0.0, 0, 0
    for i, x in enumerate(v):
        if x > peak: peak, pk = x, i
        d = x / peak - 1
        if d < mdd: mdd, at, atpk = d, i, pk
    rec = next((i - at for i in range(at, len(v)) if v[i] >= v[atpk]), None)
    w12 = min(v[i + 12] / v[i] - 1 for i in range(len(v) - 12))
    mr = [v[i] / v[i - 1] - 1 for i in range(1, len(v))]; mean = sum(mr) / len(mr)
    vol = math.sqrt(sum((x - mean) ** 2 for x in mr) / len(mr) * 12)
    return dict(cagr=v[N] ** (12 / N) - 1, mdd=mdd, vol=vol, worst12=w12, recov=rec)

def pac(H, w, i0, m):
    """versamenti mensili che comprano le voci sotto peso (la regola dell'app), mai vendere"""
    val = {k: 0.0 for k in w}; paid = 0.0; vals = []; paids = []
    for t in range(i0, len(H["months"])):
        V = sum(val.values()); de = {k: max(0, w[k] * (V + m) - val[k]) for k in w}; dt = sum(de.values())
        for k in w: val[k] += m * de[k] / dt if dt > 0 else m * w[k]
        paid += m
        for k in w: val[k] *= 1 + H["r"][k][t]
        vals.append(sum(val.values())); paids.append(paid)
    return vals, paids

with sync_playwright() as p:
    page = p.chromium.connect_over_cdp("http://localhost:9334").contexts[0].pages[0]
    ev = lambda js, a=None: page.evaluate(js, a)
    def tap(sel):
        loc = page.locator(sel).first; loc.evaluate("e=>e.scrollIntoView({block:'center'})"); time.sleep(0.3); loc.click(timeout=10000); time.sleep(0.9)
    page.wait_for_function("()=>typeof HIST!=='undefined' && HIST && typeof stHtml==='function'", timeout=60000)
    ev("()=>{ sessionStorage.setItem('bkS', JSON.stringify({ prof:PL.prof, prov:PL.provisional, cw:PL.cw||null, pick:PL.pick||null, ans:PL.ans||{} })); window.confirm=()=>true; document.querySelectorAll('.scrim.open').forEach(x=>x.classList.remove('open')); STG.q=null; showTab('piano'); renderPiano(); }"); time.sleep(1.5)
    H = ev("()=>({ months:HIST.months, r:HIST.r })")
    PROF = ev("()=>PROFILES.slice(1,6).map(p=>p.w)")
    chips = ev("()=>[...document.querySelectorAll('#stTool [data-st=\"q\"]')].filter(b=>b.classList.contains('st-chip')).map(b=>b.innerText.replace(/\\s+/g,' '))")
    check("Piano: lo strumento Strategia c'è, con 01–05 e «Su misura»", len(chips) == 6 and "Su misura" in chips[5], chips)

    # 1) i numeri dei 5 profili, ricalcolati
    M = ev("()=>pnM(pnReal())")
    for q in range(1, 6):
        tap(f'#stTool .st-chip[data-v="{q}"]')
        w = {k: v / 100 for k, v in PROF[q - 1].items()}
        mine = stats(H, w)
        app = ev(f"()=>{{ const s=stStats(stFrac(PROFILES[{q}].w)); return {{ cagr:s.cagr, mdd:s.mdd, vol:s.vol, worst12:s.worst12, recov:s.recov, on:document.querySelector('#stTool .st-chip.on').dataset.v, txt:document.getElementById('stLive').innerText }}; }}")
        ok = all(abs(app[k] - mine[k]) < 1e-9 for k in ("cagr", "mdd", "vol", "worst12")) and app["recov"] == mine["recov"]
        shown = f"{round(mine['mdd'] * 100)}%" in app["txt"] and app["on"] == str(q)
        check(f"profilo {q}: rendimento {mine['cagr']*100:.2f}%/anno, calo peggiore {mine['mdd']*100:.0f}%, volatilità {mine['vol']*100:.1f}%, 12 mesi peggiori {mine['worst12']*100:.0f}%, recupero {mine['recov']} mesi (ricalcolati)", ok and shown, {"app": {k: app[k] for k in ("cagr", "mdd", "vol", "worst12", "recov")}, "py": mine})
        # backtest dei versamenti dal 2004 e dagli ultimi 10 anni
        for frm, i0 in (("2004", 0), ("10y", len(H["months"]) - 120)):
            vals, paids = pac(H, w, i0, max(1, M))
            ev(f"()=>{{ STG.from='{frm}'; }}")
            b = ev(f"()=>{{ const b=stBack(stFrac(PROFILES[{q}].w), {M}); return {{ fin:b.fin, paid:b.paid, worst:b.worst }}; }}")
            worst = min(v / pp for v, pp in zip(vals, paids))
            check(f"profilo {q}, backtest {frm} con {M} €/mese: finale {vals[-1]:,.0f} € su {paids[-1]:,.0f} € versati, momento peggiore {100*(worst-1):+.0f}%", abs(b["fin"] - vals[-1]) < 0.5 and abs(b["paid"] - paids[-1]) < 0.01 and abs(b["worst"] - worst) < 1e-9, {"app": b, "py": [vals[-1], paids[-1], worst]})
        ev("()=>{ STG.from='2004'; }")
    # più rischio = più rendimento e cali più profondi (il confronto deve avere senso)
    S5 = [stats(H, {k: v / 100 for k, v in PROF[q].items()}) for q in range(5)]
    check("dal Prudente all'Aggressivo: rendimento sale e calo peggiore scende ogni volta", all(S5[i + 1]["cagr"] > S5[i]["cagr"] and S5[i + 1]["mdd"] < S5[i]["mdd"] for i in range(4)), [(round(s["cagr"] * 100, 2), round(s["mdd"] * 100)) for s in S5])
    cmp = ev("()=>[...document.querySelectorAll('#stTool .st-cr')].map(b=>b.innerText.replace(/\\s+/g,' '))")
    check("confronto: una riga per profilo, con rendimento e calo", len(cmp) >= 5 and all("%" in r for r in cmp), cmp)

    # 2) su misura con i cursori: 40 / 10 / 30 / 20
    tap('#stTool .st-chip[data-v="6"]')
    def slide(k, v):
        page.locator(f'#stTool [data-stw="{k}"]').evaluate(f"e=>{{ e.value={v}; e.dispatchEvent(new Event('input',{{bubbles:true}})); }}"); time.sleep(0.5)
    slide("SWDA", 40); slide("EIMI", 10); slide("AGGH", 30)
    cw = ev("()=>Object.assign({}, STG.cw)")
    check("su misura: i cursori tengono la somma a 100%", sum(cw.values()) == 100 and cw["SWDA"] == 40 and cw["EIMI"] == 10 and cw["AGGH"] == 30 and cw["XEON"] == 20, cw)
    wc = {k: v / 100 for k, v in cw.items() if v > 0}; mine = stats(H, wc)
    app = ev("()=>{ const s=stStats(stFrac(STG.cw)); return { cagr:s.cagr, mdd:s.mdd, txt:document.getElementById('stLive').innerText }; }")
    check(f"su misura: numeri ricalcolati (rendimento {mine['cagr']*100:.2f}%, calo {mine['mdd']*100:.0f}%) e mostrati", abs(app["cagr"] - mine["cagr"]) < 1e-9 and abs(app["mdd"] - mine["mdd"]) < 1e-9 and f"{round(mine['mdd']*100)}%" in app["txt"], {"app": app["cagr"], "py": mine["cagr"]})
    leg = ev("()=>[...document.querySelectorAll('#stTool .st-leg > div')].map(d=>d.innerText.replace(/\\s+/g,' '))")
    check("composizione: i pesi su misura nella legenda", any("40%" in x and "SWDA" in x for x in leg) and any("20%" in x and "XEON" in x for x in leg), leg)

    # 3) Applica su misura: diventa la strategia di serbatoio e acquisti
    tap('#stTool [data-st="apply"]')
    a = ev("""()=>{ const p=planCompute(); return { prof:PL.prof, cw:PL.cw, w:PROFILES[6].w, wts:p.weights.map(x=>[x.k,x.goal]), cands:invCands().filter(x=>x.goal>0).map(x=>[x.t,Math.round(x.goal*100)]), mine:!!document.querySelector('#stTool .hud-pill') }; }""")
    check("«Applica su misura»: strategia salvata (PL.prof=6 con i pesi)", a["prof"] == 6 and a["cw"] == cw and a["mine"], a)
    check("il piano del mese usa i pesi su misura", sorted(a["wts"]) == sorted([k, v] for k, v in cw.items() if v > 0), a["wts"])
    check("gli acquisti proposti puntano ai pesi su misura", sorted(a["cands"]) == sorted([t, cw[k]] for k, t in (("SWDA", "SWDA.MI"), ("EIMI", "EIMI.MI"), ("AGGH", "AGGH.MI"), ("XEON", "XEON.MI")) if cw[k] > 0), a["cands"])
    ev("()=>{ showTab('portafoglio'); mountPot(); }"); time.sleep(1)
    t = ev("()=>document.getElementById('potHost').innerText")
    check("Portafoglio: il serbatoio dice «strategia Su misura»", "SU MISURA" in t.upper(), t[:200])
    # dopo un riavvio resta
    page.evaluate("()=>location.reload()"); time.sleep(2)
    page.wait_for_function("()=>typeof PL!=='undefined' && typeof stHtml==='function' && typeof B!=='undefined'", timeout=90000); time.sleep(3)
    r = ev("()=>({ prof:PL.prof, w:PROFILES[6]&&PROFILES[6].w, cw:PL.cw })")
    check("dopo il riavvio la strategia su misura resta (pesi compresi)", r["prof"] == 6 and r["w"] == {k: v for k, v in cw.items() if v > 0}, r)

    # 4) avviso se scegli più rischio di quello che dice il test
    ev("()=>{ PL.ans=Object.assign({}, PL.ans, { orizz:'gt10', lavoro:'stabile', scelta:'5', comport:'vendo', esper:'no' }); STG.q=null; showTab('piano'); renderPiano(); }"); time.sleep(1)
    tap('#stTool .st-chip[data-v="5"]')
    w5 = ev("()=>({ warn:document.getElementById('stLive').innerText.includes('Il test del rischio dice'), red:!!document.querySelector('#stLive .acc-red') })")
    check("Aggressivo con un test che dice al massimo Moderato: avviso rosso", w5["warn"] and w5["red"], w5)
    tap('#stTool .st-chip[data-v="2"]')
    check("Moderato con lo stesso test: nessun avviso", not ev("()=>document.getElementById('stLive').innerText.includes('Il test del rischio dice')"))
    # 5) Applica un profilo: torna normale
    tap('#stTool [data-st="apply"]')
    check("«Applica Moderato»: strategia 2", ev("()=>PL.prof") == 2)

    ev("()=>{ const o=JSON.parse(sessionStorage.getItem('bkS')); PL.prof=o.prof; PL.provisional=o.prov; PL.ans=o.ans; if(o.cw) PL.cw=o.cw; else delete PL.cw; if(o.pick) PL.pick=o.pick; plSave(); STG.q=null; STG.cw=null; renderPiano(); if(typeof mountPot==='function') mountPot(); }")
    print(f"RESULT {sum(res)} / {len(res)}")
