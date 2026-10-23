"""Prova dell'app come un utente: tocchi veri sui bottoni (Playwright via CDP sulla WebView dell'emulatore).
Uso: adb shell pm clear it.gruzzolo.dev; avvia l'app; adb forward tcp:9334 ...; python tools/usertest.py
(prima esegue le domande con tools/fulltest.py onboard)."""
import json, sys, time
from playwright.sync_api import sync_playwright

results = []
def check(name, ok, info=""):
    results.append((name, bool(ok), info))
    print(("PASS " if ok else "FAIL ") + name + ("  -- " + str(info)[:400] if info else ""), flush=True)

def main():
    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp("http://localhost:9334")
        page = b.contexts[0].pages[0]
        errs = []
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
        # conferme e domande: nella WebView sono finestre native, qui rispondo «sì» e la cifra di DIALOG
        def setdlg(v=""): DIALOG[0] = v; page.evaluate("v=>{ window.confirm=()=>true; window.prompt=()=>v; }", v)
        ev = lambda js, arg=None: page.evaluate("async (arg) => {" + js + "}", arg)
        wait = lambda s: time.sleep(s)

        def tap(sel, nth=0):
            loc = page.locator(sel).nth(nth)
            loc.evaluate("e=>e.scrollIntoView({block:'center'})"); wait(0.25)
            try: loc.click(timeout=8000)
            except Exception as e:
                print("  (tocco lento su", sel, "- riprovo)"); wait(1); loc.click(timeout=8000)
            wait(0.35)

        def fill(sel, v):
            loc = page.locator(sel).first; loc.evaluate("e=>e.scrollIntoView({block:'center'})"); loc.fill(v)

        def tab(name):
            tap(f'.tabbar [data-tab="{name}"]'); wait(0.8)

        DIALOG = [""]; setdlg("")
        st = lambda: ev("const s=bStatus(); return { free:s.free, spent:s.spentAll, sav:s.savings, goalEnd:goalEnd(s), bal:B.buoni.bal, tx:B.tx.length, extraIn:s.extraIn };")
        hold = lambda: ev("return holdings.map(h=>({t:h.ticker, q:h.qty, avg:h.avg}));")

        # ---------------- Budget: spese dal + ----------------
        tab("budget")
        s0 = st()
        tap(".tabbar [data-tab=\"add\"]"); wait(0.7); tap('#qaCats [data-c="spesa"]'); fill("#qaAmt", "18,60"); tap('#qaBuoni [data-qb="2"]')
        on = ev("return [...document.querySelectorAll('#qaBuoni .chip.on')].map(b=>b.innerText.replace(/\u00a0/g,' '))")
        tap("#qaSave"); s1 = st()
        check("spesa 18,60 € + 2 buoni: buono scelto evidenziato, totale 34,60, buoni −2", on == ["2 · 16,00 €"] and abs(s1["spent"] - s0["spent"] - 34.6) < 0.01 and s1["bal"] == s0["bal"] - 2, (on, s0, s1))

        tap(".tabbar [data-tab=\"add\"]"); wait(0.7); tap('#qaCats [data-c="pasto"]'); fill("#qaAmt", "3,50"); tap('#qaBuoni [data-qb="1"]'); tap("#qaSave"); s2 = st()
        check("pranzo pronto 3,50 € + 1 buono = 11,50", abs(s2["spent"] - s1["spent"] - 11.5) < 0.01 and s2["bal"] == s1["bal"] - 1, s2)

        tap(".tabbar [data-tab=\"add\"]"); wait(0.7); tap('#qaCats [data-c="weekend"]'); fill("#qaAmt", "25"); tap("#qaSave"); s3 = st()
        check("weekend 25 €: scende il tempo libero di 25", abs((s2["free"] - s3["free"]) - 25) < 0.01, (s2["free"], s3["free"]))

        # entrata: aumenta il risparmio previsto, non il tempo libero... o sì? (lo registro e controllo che il mese la conti)
        tap(".tabbar [data-tab=\"add\"]"); wait(0.7); tap('#qaType [data-v="in"]'); fill("#qaAmt", "120"); fill("#qaNote", "Rimborso"); tap("#qaSave"); s4 = st()
        check("entrata 120 € (rimborso): contata nel mese", abs(s4["extraIn"] - s3["extraIn"] - 120) < 0.01 and s4["goalEnd"] >= s3["goalEnd"] + 119, (s3, s4))
        mv = ev("return document.getElementById('bx-mov').innerText")
        check("movimenti: entrata e spese in lista", "Rimborso" in mv and "+120" in mv.replace(" ", "").replace(" ", ""), mv[:200])

        # modifica dell'entrata da 120 a 100, poi eliminazione
        ev("const t=B.tx.find(x=>x.note==='Rimborso'); document.querySelector(`[data-b=\"edit\"][data-v=\"${t.id}\"]`).scrollIntoView({block:'center'}); return 1")
        tid = ev("return B.tx.find(x=>x.note==='Rimborso').id")
        tap(f'#bx-mov [data-v="{tid}"]'); fill("#qaAmt", "100"); tap("#qaSave"); s5 = st()
        check("entrata modificata 120 → 100", abs(s5["extraIn"] - s3["extraIn"] - 100) < 0.01, s5)
        tap(f'#bx-mov [data-v="{tid}"]'); tap("#qaDel"); s6 = st()
        check("entrata eliminata: torna come prima", abs(s6["extraIn"] - s3["extraIn"]) < 0.01 and abs(s6["goalEnd"] - s3["goalEnd"]) < 0.01, s6)

        # spesa con buoni eliminata: i buoni tornano
        tid = ev("return B.tx.find(x=>x.cat==='pasto').id"); b0 = st()["bal"]
        tap(f'#bx-mov [data-v="{tid}"]'); tap("#qaDel")
        check("eliminato il pranzo con 1 buono: il buono torna", st()["bal"] == b0 + 1, st())

        # numero con il punto delle migliaia
        tap(".tabbar [data-tab=\"add\"]"); wait(0.7); tap('#qaType [data-v="in"]'); fill("#qaAmt", "1.250"); fill("#qaNote", "Tredicesima"); tap("#qaSave")
        a = ev("return B.tx.find(x=>x.note==='Tredicesima').amt")
        check("«1.250» letto come 1250 €", a == 1250, a)
        tid = ev("return B.tx.find(x=>x.note==='Tredicesima').id"); tap(f'#bx-mov [data-v="{tid}"]'); tap("#qaDel")

        # stipendio arrivato diverso dal solito (il riquadro c'è solo nei giorni dello stipendio)
        has_sal = ev("return !!document.querySelector('[data-b=\"salary\"]')")
        if has_sal:
            fill("#salAmt", "1700"); tap('[data-b="salary"]')
            r = ev("const s=bStatus(); return { sal:s.sal, diff:s.salDiff }")
            check("stipendio 1700 invece di 1640: +60 nel mese", r["sal"] == 1700 and abs(r["diff"] - 60) < 0.01, r)
        else:
            r = ev("const s=bStatus(); return { partial:s.P.partial, start:s.P.startDate, pay:B.ans.payday }")
            check("primo mese iniziato dopo lo stipendio: non lo chiedo (è già nei soldi di partenza)", r["partial"], r)
        # buoni ricevuti / correzione del conto dalla pastiglia
        setdlg("22"); tap('.deltas [data-b="buoniFix"]')
        check("pastiglia buoni: correggo il conto a 22", st()["bal"] == 22, st()["bal"])

        # ---------------- cerchi del Budget: ogni finestra si apre e si chiude ----------------
        ok = []
        for i in range(5):
            tap(f'.stories[data-kind="bud"] [data-story="{i}"]')
            r = ev("return { open:document.getElementById('secScrim').classList.contains('open'), t:document.getElementById('secTitle').innerText, len:document.getElementById('secBody').innerText.length }")
            ok.append((r["t"], r["open"] and r["len"] > 40)); tap("#secScrim [data-secx]")
        check("cerchi: 5 finestre con contenuto", all(x[1] for x in ok), ok)

        # spesa fissa dalla finestra Libero: «Pagato?» / categorie e importi
        tap('.stories[data-kind="bud"] [data-story="0"]')
        txt = ev("return document.getElementById('secBody').innerText")
        check("finestra Tempo libero: quanto resta, le spese e giorno per giorno", "RESTANO" in txt.upper() and "salvadanaio" in txt and "giorno" in txt.lower(), txt[:200])
        tap("#secScrim [data-secx]")

        # ---------------- notifica di pagamento: Esselunga → pranzo ----------------
        # (la notifica la posta lo script esterno; qui controllo solo la schermata dei pagamenti se c'è)

        # ---------------- Portafoglio: aggiungi, modifica, togli una posizione ----------------
        tab("portafoglio"); wait(2)
        h0 = hold(); S0 = ev("const s=bStatus(); return { saved:s.P.saved, save:s.P.save }")
        tap("[data-fzadd]"); fill("#fTicker", "VWCE.DE"); fill("#fNome", "Vanguard FTSE All-World"); fill("#fQty", "3"); fill("#fAvg", "120,50"); fill("#fDate", "2026-10-10")
        tap("#savePos"); wait(5)
        h1 = hold(); v = next((x for x in h1 if x["t"] == "VWCE.DE"), None)
        check("nuova posizione VWCE 3 quote a 120,50 (con la virgola)", v and v["q"] == 3 and abs(v["avg"] - 120.5) < 0.01, h1)
        r = ev("const s=bStatus(); return { inv:(B.inv||[]).map(x=>x.amt), saved:s.P.saved, save:s.P.save }")
        check("azioni comprate adesso: 361,50 € contati come messi da parte (primo mese: nessun obiettivo da inseguire)", r["inv"] == [361.5] and abs(r["saved"] - (S0["saved"] + 361.5)) < 0.01 and r["save"] == 0, (S0, r))
        g = ev("return FZ.groups.map(g=>g.name+':'+g.coins)")
        check("forziere: compare la pila VWCE con 3 monete", "VWCE:3" in g, g)
        # modifica: da 3 a 5 quote
        hid = ev("return holdings.find(h=>h.ticker==='VWCE.DE').id")
        ev(f"openPos('{hid}'); return 1"); fill("#fQty", "5"); tap("#savePos"); wait(4)
        g = ev("return FZ.groups.map(g=>g.name+':'+g.coins)")
        check("modifica 3 → 5 quote: la pila cresce", "VWCE:5" in g, g)
        # tocco sulla pila VWCE
        ev("document.getElementById('fzCanvas').scrollIntoView({block:'center'}); return 1"); wait(2)
        r = ev("""const i=FZ.hits.findIndex(h=>h.t==='VWCE.DE'); const h=FZ.hits[i], c=document.getElementById('fzCanvas').getBoundingClientRect(); fzTap(c.left+(h.x0+h.x1)/2, c.top+(h.y0+h.y1)/2);
          await new Promise(r=>setTimeout(r,4000)); return { sel:PF.sel, head:document.getElementById('fzHead').innerText.slice(0,40), n:(PF.data||[]).length };""")
        check("tocco su VWCE: grafico di VWCE", r["sel"] == "VWCE.DE" and "VWCE" in r["head"], r)
        # elimina (con conferma)
        ev(f"openPos('{hid}'); return 1"); tap("#delPos"); wait(1.5)
        h2 = hold(); g = ev("return { g:FZ.groups.map(g=>g.name), sel:PF.sel }")
        check("posizione eliminata: sparisce la pila e il grafico torna a tutto", not any(x["t"] == "VWCE.DE" for x in h2) and "VWCE" not in g["g"] and g["sel"] is None, (h2, g))
        tv = ev("return { tot:totals().val, hero:document.getElementById('totalVal').innerText }")
        check("valore in alto aggiornato", tv["tot"] > 0 and tv["hero"].strip() != "€ —", tv)

        # ---------------- salvadanaio ----------------
        z = ev("PL.pot=0; plSave(); mountPot(); return invMonth()")
        check("primo mese: niente «da investire» oltre agli avanzi", z["first"] and z["toInvest"] == 0, z)
        m0_ = ev("PL.pot=200; plSave(); mountPot(); return invMonth()")
        tap('[data-pot="buy"]'); prop = ev("return INV.L.map(x=>({t:x.t,n:x.n,px:x.px}))")
        spent = sum(x["n"] * x["px"] for x in prop)
        check("investimento del mese: proposta entro quello che c'è da investire", m0_["toInvest"] > 0 and 0 < spent <= m0_["toInvest"] + 0.01, (m0_, prop))
        tap('#invBody [data-inv="ok"]'); wait(1)
        m1 = ev("return invMonth()")
        check("comprato con gli avanzi: il da investire scende della spesa (non è risparmio del mese)", abs(m1["done"] - m0_["done"]) < 0.05 and abs(m1["toInvest"] - max(0, m0_["toInvest"] - spent)) < 0.05, (m0_, m1, spent))

        # ---------------- Replay: modifica dalle impostazioni del Replay ----------------
        r = ev("""const q0=holdings.reduce((a,h)=>a+h.qty,0); replay.applied='2000-01'; render(); await new Promise(r=>setTimeout(r,600));
          const q1=holdings.reduce((a,h)=>a+h.qty,0); render(); const q2=holdings.reduce((a,h)=>a+h.qty,0); return { q0, q1, q2, ap:replay.applied };""")
        check("Replay del mese entra da solo (+3 quote) una sola volta", r["q1"] == r["q0"] + 3 and r["q2"] == r["q1"], r)

        # ---------------- altre schede ----------------
        tab("piano"); wait(2); pt = ev("return document.getElementById('planBody').innerText.length")
        check("Piano disegnato", pt > 300, pt)
        tab("dati"); wait(4); dt = ev("return (document.getElementById('page-dati')||document.body).innerText.length")
        check("Dati disegnati", dt > 300, dt)
        tap("#moreBtn"); wait(0.5); m = ev("return document.getElementById('moreScrim').classList.contains('open')")
        check("rotella: menu", m)
        ev("closeM('#moreScrim'); return 1")
        tab("budget")
        # Indietro di Android: dal Piano torna al Budget
        tab("piano"); r = ev("return window.grzBack()"); cur = ev("return document.querySelector('.page.active').id")
        check("Indietro dal Piano torna al Budget", r and cur == "page-budget", cur)

        bad = [e for e in errs if "favicon" not in e and "ERR_" not in e and "Failed to load resource" not in e]
        check("nessun errore JavaScript", not bad, bad[:6])
        print("RESULT", sum(1 for r in results if r[1]), "/", len(results))

if __name__ == "__main__":
    main()
