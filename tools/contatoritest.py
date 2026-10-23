"""Contatori del Budget come li usa una persona: spese segnate dal «+» (tocchi veri) e controllo di ogni contatore.
Regola: un pasto (pronto o fuori) di sabato o domenica esce dal budget del weekend; un pranzo pronto nei giorni
feriali esce da «Pranzi e cene fuori»; le altre categorie non si muovono. Lascia i dati come li ha trovati.
Uso: dopo `fulltest.py onboard`, con la WebView su localhost:9334."""
import json, time
from playwright.sync_api import sync_playwright

res = []
def check(name, ok, info=""):
    res.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  -- " + json.dumps(info, ensure_ascii=False)[:500]), flush=True)

SNAP = """() => { const st=bStatus(), W=weekendList(st), r={};
  st.rows.filter(x=>x.c.g==="libere").forEach(x=>r[x.c.id]={ b:+x.b.toFixed(2), s:+x.s.toFixed(2), left:+(x.left||0).toFixed(2) });
  const day=(d)=>{ const w=W&&W.L.find(w=>ymd(w.sat)===d||ymd(w.sun)===d); return w?{ spent:+w.spent.toFixed(2), target:+w.target.toFixed(2) }:null; };
  showTab('budget'); renderBudget(); const S={}; (document.getElementById('budStories').innerText||'').split('\\n').forEach((l,i,a)=>{ if(/€/.test(l)) S[a[i+1]]=l; });
  const wkr=st.rows.find(x=>x.c.id==='weekend'); const g={ weekend:+(wkr.left||0).toFixed(2), libero:+st.pool.left.toFixed(2) };
  return { free:+st.free.toFixed(2), rows:r, g, buoni:B.buoni.bal, wkSat:day(window.__sat), stories:S, today:+st.T.filter(t=>t.type!=='in'&&t.d===ymd(today0())).reduce((a,t)=>a+t.amt,0).toFixed(2) }; }"""

with sync_playwright() as p:
    page = p.chromium.connect_over_cdp("http://localhost:9334").contexts[0].pages[0]
    ev = lambda js, a=None: page.evaluate(js, a)
    def tap(sel):
        loc = page.locator(sel).first; loc.evaluate("e=>e.scrollIntoView({block:'center'})"); time.sleep(0.2); loc.click(timeout=8000); time.sleep(0.3)
    def add(cat, amt, d, buoni=0, note=""):
        ev("()=>{ closeSec&&closeSec(); showTab('budget'); }"); time.sleep(0.3)
        tap('.tabbar [data-tab="add"]'); time.sleep(0.6)
        tap(f'#qaCats [data-c="{cat}"]')
        ev("d=>{ const i=document.getElementById('qaDate'); i.value=d; i.dispatchEvent(new Event('change',{bubbles:true})); }", d); time.sleep(0.2)
        where = ev("()=>{ const w=document.getElementById('qaWhere'); return w&&w.style.display!=='none'?w.innerText:''; }")
        page.locator("#qaAmt").fill(str(amt).replace(".", ","))
        if buoni: tap(f'#qaBuoni [data-qb="{buoni}"]')
        if note: page.locator("#qaNote").fill(note)
        tap("#qaSave"); time.sleep(0.5)
        return where
    bk = ev("()=>{ window.__bk=JSON.stringify({ tx:B.tx, buoni:B.buoni }); const t=today0(), g=t.getDay(); let sat=g===6?t:g===0?addDays(t,-1):addDays(t,6-g); const st=bStatus(), start=st.P.partial?st.P.startDate:ymd(st.cy.s); if(ymd(sat)<start) sat=addDays(sat,7); window.__sat=ymd(sat); return { sat:ymd(sat), sun:ymd(addDays(sat,1)), wed:ymd(addDays(sat,4)), today:ymd(t) }; }")
    try:
        D = bk; s0 = ev(SNAP)
        others = lambda a, b, skip: {k: (a["g"][k], b["g"][k]) for k in a["g"] if k not in skip and abs(a["g"][k] - b["g"][k]) > 0.01}

        # 1) cena pronta il sabato sera: esce dal weekend, il resto non si muove
        w = add("pasto", 12, D["sat"], note="cena pronta")
        s1 = ev(SNAP)
        check("cena pronta di sabato: nel «+» dice che conta nel weekend", "weekend" in w.lower(), w)
        check("cena pronta di sabato: il weekend speso sale di 12 €", s1["wkSat"] and abs(s1["wkSat"]["spent"] - s0["wkSat"]["spent"] - 12) < 0.01, (s0["wkSat"], s1["wkSat"]))
        check("cena pronta di sabato: categoria Weekend +12 €, Pranzi fuori invariata", abs(s1["rows"]["weekend"]["s"] - s0["rows"]["weekend"]["s"] - 12) < 0.01 and abs(s1["rows"]["fuori"]["s"] - s0["rows"]["fuori"]["s"]) < 0.01, (s0["rows"]["weekend"], s1["rows"]["weekend"]))
        check("cena pronta di sabato: il Tempo libero non cambia", not others(s0, s1, {"weekend"}), others(s0, s1, {"weekend"}))
        check("cena pronta di sabato: il libero scende di 12 €", abs(s0["free"] - s1["free"] - 12) < 0.01, (s0["free"], s1["free"]))
        mv = ev("()=>document.getElementById('bx-mov').innerText")
        check("nei movimenti: «Pranzo pronto → Weekend e uscite»", "Pranzo pronto → Weekend" in mv, mv[:300])

        # 2) pizza fuori il sabato: anche questa nel weekend
        add("fuori", 20, D["sat"], note="pizza")
        s2 = ev(SNAP)
        check("pizza fuori di sabato: weekend +20 €, Pranzi fuori invariata", abs(s2["rows"]["weekend"]["s"] - s1["rows"]["weekend"]["s"] - 20) < 0.01 and abs(s2["rows"]["fuori"]["s"] - s1["rows"]["fuori"]["s"]) < 0.01 and abs(s2["wkSat"]["spent"] - s1["wkSat"]["spent"] - 20) < 0.01, (s1["rows"], s2["rows"]))
        check("pizza fuori di sabato: il Tempo libero non cambia", not others(s1, s2, {"weekend"}), others(s1, s2, {"weekend"}))

        # 3) pranzo pronto di mercoledì: esce da Pranzi e cene fuori, non dal weekend
        w = add("pasto", 6.5, D["wed"])
        s3 = ev(SNAP)
        check("pranzo pronto di mercoledì: nel «+» dice che esce da Pranzi e cene fuori", "Pranzi e cene fuori" in w, w)
        check("pranzo pronto di mercoledì: Pranzi fuori +6,50 €, weekend invariato", abs(s3["rows"]["fuori"]["s"] - s2["rows"]["fuori"]["s"] - 6.5) < 0.01 and abs(s3["rows"]["weekend"]["s"] - s2["rows"]["weekend"]["s"]) < 0.01, (s2["rows"], s3["rows"]))
        check("pranzo pronto di mercoledì: esce dal Tempo libero (−6,50 €), il Weekend non cambia", not others(s2, s3, {"libero"}) and abs(s2["g"]["libero"] - s3["g"]["libero"] - 6.5) < 0.01, (s2["g"], s3["g"]))

        # 4) cena pronta di sabato pagata 4 € + 1 buono: buoni −1, weekend +12 € (4 + 8)
        add("pasto", 4, D["sat"], buoni=1)
        s4 = ev(SNAP)
        bv = ev("()=>num(B.ans.buoni)")
        check("cena di sabato 4 € + 1 buono: buoni −1 e weekend + (4 € + valore del buono)", s4["buoni"] == s3["buoni"] - 1 and abs(s4["rows"]["weekend"]["s"] - s3["rows"]["weekend"]["s"] - 4 - bv) < 0.01, (s3["buoni"], s4["buoni"], s4["rows"]["weekend"]))

        # 5) Weekend e uscite segnato normalmente di sabato: come prima
        add("weekend", 15, D["sat"])
        s5 = ev(SNAP)
        check("weekend 15 € di sabato: weekend +15, Tempo libero fermo", abs(s5["rows"]["weekend"]["s"] - s4["rows"]["weekend"]["s"] - 15) < 0.01 and not others(s4, s5, {"weekend"}), others(s4, s5, {"weekend"}))

        # 6) cerchio «Libero» = quello che resta nel Tempo libero
        st = ev("()=>{ const st=bStatus(); return { libero:st.groups.find(g=>g.id==='libero').left }; }")
        check("cerchio «Libero» in alto = tempo libero rimasto", abs(int(s5["stories"].get("Libero", "0").replace(" €","").replace(".","") or 0) - st["libero"]) <= 1, (st, s5["stories"]))

        # 6b) spesa al supermercato con «Conta nel weekend» acceso: esce dal weekend, non dalla spesa
        ev("()=>{ closeSec&&closeSec(); showTab('budget'); }"); time.sleep(0.3)
        tap('.tabbar [data-tab="add"]'); time.sleep(0.6); tap('#qaCats [data-c="spesa"]')
        ev("d=>{ const i=document.getElementById('qaDate'); i.value=d; i.dispatchEvent(new Event('change',{bubbles:true})); }", D["sat"]); time.sleep(0.2)
        off0 = ev("()=>document.querySelector('[data-qawk]').classList.contains('on')")
        tap('[data-qawk]'); on1 = ev("()=>document.querySelector('[data-qawk]').classList.contains('on')")
        page.locator("#qaAmt").fill("18"); page.locator("#qaNote").fill("piatti pronti e snack"); tap("#qaSave"); time.sleep(0.5)
        s5b = ev(SNAP)
        sp_row = ev("()=>{ const st=bStatus(); return +st.rows.find(r=>r.c.id==='spesa').s.toFixed(2); }")
        check("spesa del sabato: «Conta nel weekend» spento di base, si accende col tocco", (not off0) and on1, (off0, on1))
        check("spesa con «Conta nel weekend»: weekend +18 €, categoria Spesa invariata", abs(s5b["rows"]["weekend"]["s"] - s5["rows"]["weekend"]["s"] - 18) < 0.01 and abs(s5b["wkSat"]["spent"] - s5["wkSat"]["spent"] - 18) < 0.01, (s5["rows"]["weekend"], s5b["rows"]["weekend"]))
        ev("()=>{ openSec('weekend'); }"); time.sleep(0.8)
        wl = ev("()=>document.getElementById('secScrim').innerText")
        check("finestra Weekend: elenca le spese (cena pronta, pizza, piatti pronti)", all(x in wl for x in ["cena pronta", "pizza", "piatti pronti e snack"]), wl[-600:])
        ev("()=>{ closeSec(); showTab('budget'); renderBudget(); }"); time.sleep(0.8)
        fb = ev("""()=>{ const vals=[...document.querySelectorAll('.t4-col .t4-v')].map(b=>+b.innerText.replace(/[^0-9-]/g,'')), st=bStatus(),
            circles=st.groups.map(g=>{ const i=ST.lastBud.findIndex(x=>x.id===g.id); return i>=0?+String(ST.lastBud[i].v).replace(/[^0-9-]/g,''):null; });
            return { vals, sum:vals.reduce((a,b)=>a+b,0), remaining:Math.round(st.remaining), circles, cols:vals.length }; }""")
        check("serbatoio a 4 pezzi: i pezzi sommati = soldi che restano, uguali ai cerchi in alto", fb["cols"] == 4 and fb["sum"] == fb["remaining"] and fb["circles"] == fb["vals"], fb)
        cc = ev("""()=>{ const st=bStatus(), P=st.P, s0=B.start; if(!P.partial) return { skip:true };
            const conto=s0.left-(P.replayRes||0)-(P.inv||0)-st.T.filter(t=>t.type!=='in').reduce((a,t)=>a+t.amt-(t.buoniVal||0),0);
            return { remaining:+st.remaining.toFixed(2), conto:+conto.toFixed(2), buoni:st.buoniLeft }; }""")
        check("soldi che restano = conto (partenza − Replay − azioni − spese in soldi veri): i buoni pasto non contano", cc.get("skip") or abs(cc["remaining"] - cc["conto"]) < 0.01, cc)
        # una spesa di shopping oltre la vecchia quota «shopping» non tocca il weekend: il tempo libero è un salvadanaio unico
        g0 = ev(SNAP)["g"]; ev("()=>{ B.tx.push({ id:'t_shop_big', src:'manual', type:'out', cat:'shopping', amt:60, d:ymd(today0()), note:'giacca' }); bSave(); }"); g1 = ev(SNAP)["g"]
        check("shopping 60 € (più della vecchia quota shopping): scende solo il Tempo libero, il Weekend resta", abs(g0["libero"] - g1["libero"] - 60) < 0.01 and abs(g0["weekend"] - g1["weekend"]) < 0.01, (g0, g1))
        ev("()=>{ B.tx=B.tx.filter(t=>t.id!=='t_shop_big'); bSave(); }")
        ev("()=>closeSec()"); time.sleep(0.3)
        tid = ev("()=>B.tx.find(t=>t.note==='piatti pronti e snack').id")
        ev("id=>{ window.confirm=()=>true; openQuickAdd(id); document.getElementById('qaDel').click(); }", tid); time.sleep(0.5)

        # 6c) l'ora conta: il weekend va dal venerdì alle 18 alla domenica alle 5
        hr = ev("""()=>{ const sat=parseYmd(window.__sat), at=(d,h)=>new Date(d.getFullYear(),d.getMonth(),d.getDate(),h).getTime();
            const mk=(d,h)=>({ cat:'pasto', d:ymd(d), ts:at(d,h), type:'out', amt:10 });
            return { fri19:inWeekend(mk(addDays(sat,-1),19)), fri12:inWeekend(mk(addDays(sat,-1),12)), sun3:inWeekend(mk(addDays(sat,1),3)), sun13:inWeekend(mk(addDays(sat,1),13)), satNoTime:inWeekend({ cat:'pasto', d:ymd(sat), type:'out', amt:10 }) }; }""")
        check("orari del weekend: venerdì 19 sì, venerdì 12 no, domenica 3 sì, domenica 13 no", hr["fri19"] and not hr["fri12"] and hr["sun3"] and not hr["sun13"] and hr["satNoTime"], hr)
        mv2 = ev("""()=>{ const st=bStatus(), W=st.wkW, past=W.L.filter(w=>w.state==='past'), exp=past.reduce((a,w)=>a+(W.base-w.spent),0);
            const pr=st.pool.rows.reduce((a,r)=>a+r.b,0), wk=st.rows.find(r=>r.c.id==='weekend');
            return { past:past.length, moved:+W.moved.toFixed(2), exp:+exp.toFixed(2), poolB:+st.pool.b.toFixed(2), sumPR:+pr.toFixed(2), wkB:+wk.b.toFixed(2), wkB0:+wk.b0.toFixed(2) }; }""")
        check("weekend finiti: quello che avanza della quota passa al Tempo libero", abs(mv2["moved"] - mv2["exp"]) < 0.01 and abs(mv2["poolB"] - mv2["sumPR"] - mv2["moved"]) < 0.01 and abs(mv2["wkB0"] - mv2["wkB"] - mv2["moved"]) < 0.01, mv2)

        # 7) modifica: la cena del sabato spostata a lunedì esce dal weekend
        tid = ev("()=>B.tx.find(t=>t.note==='cena pronta').id")
        ev("id=>{ closeSec&&closeSec(); openQuickAdd(id); }", tid); time.sleep(0.6)
        ev("d=>{ const i=document.getElementById('qaDate'); i.value=d; i.dispatchEvent(new Event('change',{bubbles:true})); }", ev("()=>ymd(addDays(parseYmd(window.__sat),2))")); time.sleep(0.2)
        tap("#qaSave"); time.sleep(0.5)
        s6 = ev(SNAP)
        check("cena spostata a lunedì: torna su Pranzi fuori (weekend −12, fuori +12)", abs(s5["rows"]["weekend"]["s"] - s6["rows"]["weekend"]["s"] - 12) < 0.01 and abs(s6["rows"]["fuori"]["s"] - s5["rows"]["fuori"]["s"] - 12) < 0.01, (s5["rows"], s6["rows"]))

        # 8) eliminazione: tutto torna come all'inizio
        for note in ["cena pronta", "pizza"]:
            tid = ev("n=>B.tx.find(t=>t.note===n).id", note); ev("id=>{ closeSec&&closeSec(); openQuickAdd(id); }", tid); time.sleep(0.5)
            ev("()=>{ window.confirm=()=>true; }"); tap("#qaDel"); time.sleep(0.4)
        ev("()=>{ window.confirm=()=>true; const ids=B.tx.filter(t=>t.d>=ymd(today0()) && ['pasto','weekend'].includes(t.cat) && !JSON.parse(__bk).tx.some(x=>x.id===t.id)).map(t=>t.id); ids.forEach(id=>{ openQuickAdd(id); document.getElementById('qaDel').click(); }); }"); time.sleep(0.6)
        s7 = ev(SNAP)
        check("eliminate tutte: contatori e buoni come all'inizio", abs(s7["free"] - s0["free"]) < 0.01 and s7["buoni"] == s0["buoni"] and not others(s0, s7, set()), (s0["free"], s7["free"], s0["buoni"], s7["buoni"]))
        errs = ev("()=>window.__jsErr||[]")
    finally:
        ev("()=>{ const k=JSON.parse(__bk); B.tx=k.tx; B.buoni=k.buoni; bSave(); recalcCats(); renderBudget(); }")
    print(f"RESULT {sum(res)} / {len(res)}")
