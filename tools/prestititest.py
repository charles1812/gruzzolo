"""Prestiti e mutui come li userebbe una persona: Impostazioni → «Prestiti e mutui» (tocchi veri), conti dell'ammortamento
ricontrollati qui in Python, rata nelle spese fisse, totale dei soldi sempre esatto; poi «Azzera tutto».
Uso: dopo `fulltest.py onboard`, con la WebView (o Chrome) su localhost:9334. ATTENZIONE: l'ultima prova azzera l'app."""
import json, math, time, calendar, datetime as dt
from playwright.sync_api import sync_playwright

res = []
def check(name, ok, info=""):
    res.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  -- " + json.dumps(info, ensure_ascii=False, default=str)[:500]), flush=True)

EXACT = """()=>{ const st=bStatus(), P=st.P, s0=B.start; const sum=st.groups.reduce((a,g)=>a+g.left,0); if(!P.partial) return { ok:Math.abs(st.remaining-sum)<0.01 };
  const conto=s0.left-(P.replayRes||0)-(P.inv||0)-(P.save||0)-st.T.filter(t=>t.type!=='in').reduce((a,t)=>a+t.amt-(t.buoniVal||0),0);
  return { ok:Math.abs(st.remaining-conto)<0.01 && Math.abs(st.remaining-sum)<0.01, remaining:+st.remaining.toFixed(2), conto:+conto.toFixed(2), sum:+sum.toFixed(2) }; }"""

def add_months(d, k):
    y, m = divmod(d.month - 1 + k, 12); y += d.year; m += 1
    return dt.date(y, m, min(d.day, calendar.monthrange(y, m)[1]))
def paid_n(start, N):
    t = dt.date.today(); n = 0
    while n < N and add_months(start, n) <= t: n += 1
    return n

with sync_playwright() as p:
    page = p.chromium.connect_over_cdp("http://localhost:9334").contexts[0].pages[0]
    ev = lambda js, a=None: page.evaluate(js, a)
    def tap(sel):
        loc = page.locator(sel).first; loc.evaluate("e=>e.scrollIntoView({block:'center'})"); time.sleep(0.2); loc.click(timeout=8000); time.sleep(0.4)
    ev("()=>{ window.__bk=JSON.stringify({ loans:B.loans||[] }); window.confirm=()=>true; closeSec&&closeSec(); showTab('impostazioni'); renderLoanSettings(); }"); time.sleep(0.6)
    W = "#sLoans"
    check("Impostazioni: c'è «Prestiti e mutui» con «Aggiungi»", ev(f"()=>!!document.querySelector('{W} [data-ln=\"add\"]')"))
    # 1) mutuo con tasso: 150.000 €, rata 650 €, TAN 3,2%, prima rata 3 anni fa
    t = dt.date.today(); s1 = add_months(dt.date(t.year, t.month, min(t.day, 28)), -36)
    tap(f'{W} [data-ln="add"]'); tap(f'{W} .loanf [data-ln="save"]')
    check("senza dati non salva", ev("()=>(B.loans||[]).length") == 0)
    page.locator(f"{W} .loanf .ln-n").fill("Casa"); page.locator(f"{W} .loanf .ln-a").fill("150.000"); page.locator(f"{W} .loanf .ln-m").fill("650")
    page.locator(f"{W} .loanf .ln-s").fill(s1.isoformat()); page.locator(f"{W} .loanf .ln-r").fill("3,2"); tap(f'{W} .loanf [data-ln="save"]'); time.sleep(0.5)
    P, M, r = 150000, 650, 3.2 / 1200
    N = math.ceil(-math.log(1 - r * P / M) / math.log(1 + r)); n = paid_n(s1, N)
    bal = P * (1 + r) ** n - M * ((1 + r) ** n - 1) / r
    got = ev("()=>{ const l=B.loans.find(x=>x.n==='Casa'), i=loanInfo(l); return { kind:l.kind, amt:l.amt, N:i.N, n:i.n, left:i.left, repaid:i.repaid, intPaid:i.intPaid, last:ymd(i.last) }; }")
    check("mutuo: importo 150.000 letto bene, numero di rate giusto", got["amt"] == 150000 and got["N"] == N and got["n"] == n, {**got, "N_atteso": N, "n_atteso": n})
    check("mutuo: capitale che resta e interessi pagati come l'ammortamento alla francese", abs(got["left"] - bal) < 0.5 and abs(got["intPaid"] - (n * M - (P - bal))) < 0.5, {**got, "atteso": bal})
    check("mutuo: ultima rata = prima + (rate - 1) mesi", got["last"] == add_months(s1, N - 1).isoformat(), got["last"])
    # 2) finanziamento senza tasso, con l'ultima rata
    s2 = add_months(dt.date(t.year, t.month, min(t.day, 28)), -10); e2 = add_months(s2, 23)
    tap(f'{W} [data-ln="add"]'); tap(f'{W} .loanf [data-ln="kind"][data-v="auto"]')
    page.locator(f"{W} .loanf .ln-n").fill("Auto"); page.locator(f"{W} .loanf .ln-a").fill("6000"); page.locator(f"{W} .loanf .ln-m").fill("250")
    page.locator(f"{W} .loanf .ln-s").fill(s2.isoformat()); page.locator(f"{W} .loanf .ln-e").fill(e2.isoformat()); tap(f'{W} .loanf [data-ln="save"]'); time.sleep(0.5)
    n2 = paid_n(s2, 24)
    got = ev("()=>{ const l=B.loans.find(x=>x.n==='Auto'), i=loanInfo(l); return { kind:l.kind, N:i.N, n:i.n, left:i.left, rate:l.rate }; }")
    check("finanziamento auto senza tasso: 24 rate, il debito scende di 250 € a rata", got["kind"] == "auto" and got["N"] == 24 and got["n"] == n2 and abs(got["left"] - (6000 - 250 * n2)) < 0.01 and got["rate"] is None, {**got, "n_atteso": n2})
    # 3) nel Budget: le due rate sono spese fisse con il giorno, il totale resta esatto
    got = ev("()=>B.cats.filter(c=>c.loan).map(c=>[c.n,c.plan,c.g,c.day])")
    check("le rate entrano nelle spese fisse (650 € e 250 € con il giorno)", sorted(x[1] for x in got) == [250, 650] and all(x[2] == "fisse" and x[3] for x in got), got)
    check("totale dei soldi esatto con le rate", ev(EXACT)["ok"], ev(EXACT))
    ev("()=>{ showTab('budget'); renderBudget(); openSec('ric'); }"); time.sleep(0.8)
    txt = ev("()=>document.getElementById('secBody').innerText")
    check("finestra Ricorrenti: prestiti con rimborsato, rate, inizio e fine", "PRESTITI E MUTUI" in txt.upper() and "Casa" in txt and "RIMBORSATO" in txt.upper() and "FINISCE" in txt.upper(), txt[:600])
    # 4) rata già contata altrove: interruttore spento, esce dal Budget
    ev("()=>{ closeSec(); showTab('impostazioni'); renderLoanSettings(); }"); time.sleep(0.4)
    lid = ev("()=>B.loans.find(x=>x.n==='Casa').id")
    tap(f'{W} [data-ln="edit"][data-id="{lid}"]'); tap(f'{W} .loanf [data-ln="budget"]'); tap(f'{W} .loanf [data-ln="save"]'); time.sleep(0.4)
    check("interruttore spento: la rata del mutuo non conta più nel Budget", ev("()=>!B.cats.some(c=>c.loan&&c.plan===650)"))
    # 5) prestito finito: niente rata
    ev("()=>{ B.loans.push({ id:uid('ln'), n:'Vecchio', kind:'prestito', amt:1200, monthly:100, start:ymd(addMonthsD(today0(),-20)), end:ymd(addMonthsD(today0(),-9)), rate:null, budget:true }); loanAfter(); }")
    got = ev("()=>{ const i=loanInfo(B.loans.find(x=>x.n==='Vecchio')); return { done:i.done, left:i.left, cat:B.cats.some(c=>c.n.includes('Vecchio')) }; }")
    check("prestito finito: risulta finito, debito 0, nessuna rata", got["done"] and got["left"] == 0 and not got["cat"], got)
    check("totale ancora esatto", ev(EXACT)["ok"], ev(EXACT))
    # 5b) dal foglio «aggiungi spesa»: l'icona piccola in fondo apre il prestito (da chi, quanti mesi); non diventa una spesa di oggi
    ntx = ev("()=>B.tx.length")
    ev("()=>{ showTab('budget'); openQuickAdd(); }"); time.sleep(0.5)
    page.locator("#qaAmt").fill("900"); page.locator("#qaNote").fill("Telefono")
    tap("#qaLoan"); time.sleep(0.4)
    L = "#lnScrim .loanf"
    pre = ev(f"()=>({{ n:document.querySelector('{L} .ln-n').value, a:document.querySelector('{L} .ln-a').value, s:document.querySelector('{L} .ln-s').value, open:document.getElementById('lnScrim').classList.contains('open'), qa:document.getElementById('qaScrim').classList.contains('open') }})")
    exp_s = add_months(dt.date.today(), 1).isoformat()
    check("«aggiungi spesa» → «È un prestito?»: si apre il prestito con importo, nome e prima rata tra un mese", pre["open"] and not pre["qa"] and pre["n"] == "Telefono" and pre["a"] == "900" and pre["s"] == exp_s, {**pre, "atteso": exp_s})
    page.locator(f"{L} .ln-w").fill("Findomestic"); page.locator(f"{L} .ln-m").fill("50"); page.locator(f"{L} .ln-k").fill("18")
    tap(f"{L} [data-ln=\"save\"]"); time.sleep(0.5)
    got = ev("()=>{ const l=B.loans.find(x=>x.n==='Telefono'); if(!l) return null; const i=loanInfo(l); return { from:l.from, amt:l.amt, end:l.end, N:i.N, cat:B.cats.some(c=>c.loan===l.id&&c.plan===50), tx:B.tx.length, open:document.getElementById('lnScrim').classList.contains('open') }; }")
    check("prestito dalla spesa salvato: da chi, 18 mesi (ultima rata calcolata), rata nel Budget, nessuna spesa di oggi", got and got["from"] == "Findomestic" and got["amt"] == 900 and got["N"] == 18 and got["end"] == add_months(dt.date.fromisoformat(exp_s), 17).isoformat() and got["cat"] and got["tx"] == ntx and not got["open"], got)
    check("totale ancora esatto con il prestito nuovo", ev(EXACT)["ok"], ev(EXACT))
    ev("()=>{ showTab('impostazioni'); renderLoanSettings(); }"); time.sleep(0.4)
    # 6) togli
    tap(f'{W} [data-ln="del"][data-id="{lid}"]'); time.sleep(0.3)
    check("togli il mutuo: sparisce", ev("()=>!B.loans.some(x=>x.n==='Casa')"))
    # 7) azzera tutto (in fondo alle Impostazioni)
    vis = ev("()=>{ const b=document.getElementById('sReset'); const all=[...document.querySelectorAll('#page-impostazioni .btn')]; return { ok:!!b, last:all[all.length-1]===b }; }")
    check("«Azzera tutto e ricomincia» c'è, in fondo alle Impostazioni", vis["ok"] and vis["last"], vis)
    ev("()=>{ window.confirm=()=>true; document.getElementById('sReset').click(); }"); time.sleep(3)
    page.wait_for_function("()=>typeof openQuiz==='function'", timeout=30000); time.sleep(1.5)
    got = ev("()=>({ setup:!!(typeof B!=='undefined'&&B.setup), tx:(typeof B!=='undefined'&&B.tx||[]).length, loans:(typeof B!=='undefined'&&B.loans||[]).length, hold:(typeof holdings!=='undefined'?holdings.length:-1) })")
    check("dopo «Azzera tutto»: app vuota (niente budget, spese, prestiti, posizioni), si riparte dalle domande", not got["setup"] and got["tx"] == 0 and got["loans"] == 0 and got["hold"] == 0, got)
    print(f"RESULT {sum(res)} / {len(res)}")
