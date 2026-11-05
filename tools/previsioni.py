"""Allenamento dell'agente sulle previsioni, SENZA API: dati veri, regole candidate, prova onesta.

Tre livelli, nell'ordine in cui l'agente li impara:
  1. LUNGO  (10 anni)  — S&P 500 dal 1871 (dati di Shiller: prezzo, dividendi, inflazione, CAPE)
  2. MEDIO  (1, 3, 6 mesi) — S&P 500 mensile dal 1871 + VIX dal 1990 + notizie settimanali dal 2019
  3. GIORNO (1 giorno) — S&P 500 giornaliero dal 1990, VIX, SWDA dal 2009

Per ogni livello: regole candidate (tendenza, valutazioni, paura, cali, notizie, giorno della settimana…),
ognuna fa previsioni giorno per giorno / mese per mese usando SOLO il passato (niente sbirciate nel futuro).
L'«agente» sceglie la regola migliore nel periodo di STUDIO e viene giudicato nel periodo d'ESAME, che non ha visto.
Punteggi: errore medio, Brier skill (quanto la probabilità di «sale» batte la frequenza storica), intervalli
che contengono davvero l'80% dei casi, e per il giornaliero il risultato di chi ci avesse fatto trading con costi e tasse.

Uso: python tools/previsioni.py           → scrive docs/previsioni.md e tools/cache/prev/risultati.json
Dati in tools/cache/prev/ (scaricati da Yahoo, datahub/Shiller, Google News: vedi docs/previsioni.md)."""
import csv, datetime as D, glob, json, math, os, re
import statistics as st

# ---- piccoli calcoli senza librerie esterne ----
def mean(x): x = list(x); return sum(x) / len(x) if x else 0.0
def std(x): x = list(x); return st.pstdev(x) if len(x) > 1 else 0.0
def quant(x, q):
    x = sorted(x); k = (len(x) - 1) * q; f = int(k); c = min(f + 1, len(x) - 1); return x[f] + (x[c] - x[f]) * (k - f)
def corr(a, b):
    a = list(a); b = list(b); ma, mb = mean(a), mean(b); va = sum((x - ma) ** 2 for x in a); vb = sum((y - mb) ** 2 for y in b)
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / ((va * vb) ** 0.5) if va > 0 and vb > 0 else 0.0
def ols(X, Y):
    mx, my = mean(X), mean(Y); vx = sum((x - mx) ** 2 for x in X); b = sum((x - mx) * (y - my) for x, y in zip(X, Y)) / vx if vx else 0.0
    return b, my - b * mx

HERE = os.path.dirname(os.path.abspath(__file__)); C = os.path.join(HERE, "cache", "prev"); ROOT = os.path.dirname(HERE)
OUT_MD = os.path.join(ROOT, "docs", "previsioni.md")

# ---------------- dati ----------------
def yahoo(name):
    d = json.load(open(os.path.join(C, name + ".json")))["chart"]["result"][0]
    ts = d["timestamp"]; q = d["indicators"]; px = (q.get("adjclose") or [{}])[0].get("adjclose") or q["quote"][0]["close"]
    out = [(D.date.fromtimestamp(t), p) for t, p in zip(ts, px) if p]
    return out

def shiller():
    R = []
    for r in csv.DictReader(open(os.path.join(C, "shiller.csv"))):
        R.append((r["Date"][:7], float(r["SP500"]), float(r["Dividend"] or 0), float(r["Consumer Price Index"] or 0), float(r["PE10"] or 0)))
    # dividendi e inflazione mancanti negli ultimi mesi: tengo l'ultimo valore noto
    for i in range(1, len(R)):
        m, p, dv, cpi, pe = R[i]
        if dv <= 0: dv = R[i - 1][2]
        if cpi <= 0: cpi = R[i - 1][3]
        R[i] = (m, p, dv, cpi, pe)
    return R

def monthly(daily):
    m = {}
    for d, p in daily: m[d.strftime("%Y-%m")] = p
    return sorted(m.items())

# ---------------- strumenti di misura ----------------
def brier(p, y): return mean((a - b) ** 2 for a, b in zip(p, y))
def bss(p, y, base): b0 = brier(base, y); return 1 - brier(p, y) / b0 if b0 > 0 else 0.0
def hit(p, y): return mean([(a >= 0.5) == bool(b) for a, b in zip(p, y)])

class CondFreq:
    """P(sale | casella del segnale), stimata solo con i casi già conclusi; si avvicina alla media se ci sono pochi casi"""
    def __init__(self, k=30): self.n = {}; self.u = {}; self.N = 0; self.U = 0; self.k = k
    def add(self, b, y): self.n[b] = self.n.get(b, 0) + 1; self.u[b] = self.u.get(b, 0) + y; self.N += 1; self.U += y
    def base(self): return (self.U + 1) / (self.N + 2)
    def p(self, b): pb = self.base(); return (self.u.get(b, 0) + self.k * pb) / (self.n.get(b, 0) + self.k)

def walk(signals, ys, h, start_test, dates, min_n=60):
    """signals: {nome: [casella o None]}, ys: [0/1 o None], h: passi prima di sapere l'esito.
    Ritorna per ogni regola le previsioni (dalla prima data in cui ci sono abbastanza casi)."""
    n = len(ys); res = {k: {"p": [], "y": [], "base": [], "d": []} for k in list(signals) + ["base"]}
    cf = {k: CondFreq() for k in signals}; bf = CondFreq()
    for t in range(n):
        j = t - h                                                       # esito di j noto al tempo t
        if j >= 0 and ys[j] is not None:
            bf.add(0, ys[j])
            for k in signals:
                if signals[k][j] is not None: cf[k].add(signals[k][j], ys[j])
        if ys[t] is None or bf.N < min_n: continue
        b = bf.base()
        res["base"]["p"].append(b); res["base"]["y"].append(ys[t]); res["base"]["base"].append(b); res["base"]["d"].append(dates[t])
        for k in signals:
            s = signals[k][t]; p = cf[k].p(s) if s is not None else b
            res[k]["p"].append(p); res[k]["y"].append(ys[t]); res[k]["base"].append(b); res[k]["d"].append(dates[t])
    return res

def score(res, split):
    out = {}
    for k, r in res.items():
        tr = [i for i, d in enumerate(r["d"]) if d < split]; te = [i for i, d in enumerate(r["d"]) if d >= split]
        g = lambda I, a: [r[a][i] for i in I]
        out[k] = {
            "studio": {"n": len(tr), "bss": bss(g(tr, "p"), g(tr, "y"), g(tr, "base")) if tr else 0, "hit": hit(g(tr, "p"), g(tr, "y")) if tr else 0},
            "esame": {"n": len(te), "bss": bss(g(te, "p"), g(te, "y"), g(te, "base")) if te else 0, "hit": hit(g(te, "p"), g(te, "y")) if te else 0},
        }
    return out

def pick(sc):
    """l'agente sceglie la regola migliore nel periodo di studio (non guarda l'esame)"""
    k = max([x for x in sc if x != "base"], key=lambda x: sc[x]["studio"]["bss"])
    return k

def pct(x, d=1): return f"{x*100:+.{d}f}%"
def pp(x): return f"{x*100:.1f}%"

# ---------------- 1. LUNGO: 10 anni ----------------
def lungo():
    R = shiller(); n = len(R); H = 120
    # indice dei rendimenti totali reali (prezzo + dividendi, meno inflazione)
    tr = [1.0]
    for i in range(1, n):
        p0, p1, dv = R[i - 1][1], R[i][1], R[i][2]
        tr.append(tr[-1] * (p1 + dv / 12) / p0)
    real = [tr[i] / R[i][3] * R[0][3] for i in range(n)]
    fwd = [((real[i + H] / real[i]) ** (1 / 10) - 1) if i + H < n else None for i in range(n)]
    cape = [R[i][4] if R[i][4] > 0 else None for i in range(n)]
    past10 = [((real[i] / real[i - H]) ** (1 / 10) - 1) if i >= H else None for i in range(n)]
    dates = [R[i][0] for i in range(n)]
    rules = {
        "base": lambda i, I: None,
        "cape": lambda i, I: cape[i] and math.log(1 / cape[i]),
        "ultimi10": lambda i, I: past10[i],
    }
    out = {k: {"d": [], "f": [], "y": [], "lo": [], "hi": []} for k in rules}
    for i in range(n):
        if fwd[i] is None or i < 12 * 40: continue
        I = [j for j in range(i - H + 1) if fwd[j] is not None]          # esiti già conclusi al mese i
        ys = [fwd[j] for j in I]
        for k, f in rules.items():
            if k == "base": m0 = mean(ys); pred = m0; res = [y - m0 for y in ys]
            else:
                xs = [(f(j, I), fwd[j]) for j in I if f(j, I) is not None]
                if len(xs) < 120 or f(i, I) is None: continue
                X = [a for a, b in xs]; Y = [b for a, b in xs]; b1, b0 = ols(X, Y); pred = b1 * f(i, I) + b0; res = [y - (b1 * x + b0) for x, y in zip(X, Y)]
            out[k]["d"].append(dates[i]); out[k]["f"].append(pred); out[k]["y"].append(fwd[i])
            out[k]["lo"].append(pred + quant(res, 0.1)); out[k]["hi"].append(pred + quant(res, 0.9))
    split = "1990-01"; S = {}
    for k, r in out.items():
        for per, sel in (("studio", lambda d: d < split), ("esame", lambda d: d >= split)):
            I = [j for j, d in enumerate(r["d"]) if sel(d)]
            if not I: continue
            f = [r["f"][j] for j in I]; y = [r["y"][j] for j in I]
            cov = mean([(r["lo"][j] <= r["y"][j] <= r["hi"][j]) for j in I])
            S.setdefault(k, {})[per] = {"n": len(I), "mae": mean(abs(a - b) for a, b in zip(f, y)), "corr": corr(f, y) if len(I) > 2 else 0, "cov80": cov}
    best = min([k for k in S if k != "base"], key=lambda k: S[k]["studio"]["mae"])
    # oggi: CAPE attuale e previsione con la regola scelta (stimata su tutti gli esiti conclusi)
    lastc = [j for j in range(n) if cape[j]][-1]
    I = [j for j in range(n) if fwd[j] is not None and cape[j]]
    X = [math.log(1 / cape[j]) for j in I]; Y = [fwd[j] for j in I]; b1, b0 = ols(X, Y); res = [y - (b1 * x + b0) for x, y in zip(X, Y)]
    now = b1 * math.log(1 / cape[lastc]) + b0
    # frequenze di base dei 10 anni (tutto il periodo)
    allf = [x for x in fwd if x is not None]
    base = {"anni10_positivi": mean(x > 0 for x in allf), "media": mean(allf), "peggiore": min(allf), "migliore": max(allf), "anni10_sopra2pct": mean(x > 0.02 for x in allf)}
    today = {"cape": cape[lastc], "mese": dates[lastc], "prev": now, "lo": now + quant(res, 0.1), "hi": now + quant(res, 0.9)}
    return {"score": S, "scelta": best, "base": base, "oggi": today, "split": split}

# ---------------- 2. MEDIO: 1, 3, 6 mesi ----------------
def medio():
    R = shiller(); px = [r[1] for r in R]; dates = [r[0] for r in R]
    # dopo il 1990 il prezzo mensile da Yahoo (fine mese) per avere anche gli ultimi mesi; il VIX solo dal 1990
    vixm = dict(monthly(yahoo("%5EVIX")))
    n = len(px); out = {}
    sma10 = [mean(px[i - 9:i + 1]) if i >= 9 else None for i in range(n)]
    hi = []; m = 0
    for p in px: m = max(m, p); hi.append(m)
    sig = {
        "tendenza_10m": [None if sma10[i] is None else int(px[i] > sma10[i]) for i in range(n)],
        "momentum_12m": [None if i < 12 else int(px[i] > px[i - 12]) for i in range(n)],
        "calo_dal_massimo": [min(3, int((1 - px[i] / hi[i]) / 0.1)) for i in range(n)],
        "paura_vix": [None if dates[i] not in vixm else (0 if vixm[dates[i]] < 15 else 1 if vixm[dates[i]] < 20 else 2 if vixm[dates[i]] < 30 else 3) for i in range(n)],
        "ultimo_mese": [None if i < 1 else int(px[i] > px[i - 1]) for i in range(n)],
    }
    cond = {}
    for h in (1, 3, 6):
        ys = [int(px[i + h] > px[i]) if i + h < n else None for i in range(n)]
        res = walk(sig, ys, h, "1990-01", dates)
        sc = score(res, "1990-01"); out[h] = {"score": sc, "scelta": pick(sc)}
        if h == 1:   # rischio: come vanno i mesi dopo, sopra e sotto la media di 10 mesi
            r1 = [px[i + 1] / px[i] - 1 if i + 1 < n else None for i in range(n)]
            for lab, v in (("sopra", 1), ("sotto", 0)):
                xs = [r1[i] for i in range(n) if sig["tendenza_10m"][i] == v and r1[i] is not None]
                cond[lab] = {"n": len(xs), "media": mean(xs), "vol": std(xs), "mesi_sotto_meno5": mean(x < -0.05 for x in xs), "su": mean(x > 0 for x in xs)}
            for lab, lv in (("vix<20", (0, 1)), ("vix>=30", (3,))):
                xs = [r1[i] for i in range(n) if sig["paura_vix"][i] in lv and r1[i] is not None]
                if len(xs): cond[lab] = {"n": len(xs), "media": mean(xs), "vol": std(xs), "su": mean(x > 0 for x in xs)}
    return {"h": out, "rischio": cond}

# ---------------- notizie: sentimento settimanale ----------------
POS = set("rally rallies gain gains surge surges soar soars jump jumps record records rebound rebounds rise rises rising climb climbs climbing higher high highs bull bullish optimism optimistic upbeat boost boosts boosted strong strength beat beats upgrade upgrades recovery recover recovers advance advances best rallying".split())
NEG = set("fall falls falling drop drops plunge plunges plunging slump slumps selloff sell-off crash crashes fear fears recession loss losses worst tumble tumbles slide slides sliding decline declines bear bearish panic crisis downgrade downgrades weak weakness lower low lows sink sinks sank slip slips turmoil worries worry rout plummet plummets volatile jitters".split())
def senti(t):
    w = re.findall(r"[a-z\-]+", t.lower()); p = sum(x in POS for x in w); q = sum(x in NEG for x in w)
    return 0 if p + q == 0 else (p - q) / (p + q)

def notizie():
    files = sorted(glob.glob(os.path.join(C, "news", "*.json")))
    if len(files) < 40: return None
    spx = yahoo("%5EGSPC"); dd = [d for d, p in spx]; pp_ = [p for d, p in spx]
    def px_on(d):   # ultimo prezzo prima o uguale a d
        import bisect; i = bisect.bisect_right(dd, d) - 1; return pp_[i] if i >= 0 else None
    W = []
    for f in files:
        wk = D.date.fromisoformat(os.path.basename(f)[:10]); items = json.load(open(f, encoding="utf-8"))
        if len(items) < 5: continue
        s = mean([senti(x["t"]) for x in items])
        p0, p1, p2, p5 = px_on(wk - D.timedelta(days=3)), px_on(wk + D.timedelta(days=4)), px_on(wk + D.timedelta(days=11)), px_on(wk + D.timedelta(days=32))
        if None in (p0, p1, p2, p5): continue
        W.append({"w": wk.isoformat(), "s": s, "n": len(items), "stessa": p1 / p0 - 1, "dopo1": p2 / p1 - 1, "dopo4": p5 / p1 - 1})
    if len(W) < 40: return None
    S = [w["s"] for w in W]
    c = lambda k: corr(S, [w[k] for w in W])
    # previsione: P(sale la settimana dopo) a seconda del sentimento (terzili stimati solo sul passato)
    sigs, ys, dts = [], [], []
    for i, w in enumerate(W):
        past = S[:i]
        if len(past) < 30: sigs.append(None)
        else: lo, hi = quant(past, 1 / 3), quant(past, 2 / 3); sigs.append(0 if w["s"] < lo else 2 if w["s"] > hi else 1)
        ys.append(int(w["dopo1"] > 0)); dts.append(w["w"])
    split = W[len(W) // 2]["w"]
    res = walk({"sentimento": sigs, "contrario": [None if s is None else 2 - s for s in sigs]}, ys, 1, split, dts, min_n=30)
    sc = score(res, split)
    return {"settimane": len(W), "titoli": int(sum(w["n"] for w in W)), "da": W[0]["w"], "a": W[-1]["w"], "corr_stessa": c("stessa"), "corr_dopo1": c("dopo1"), "corr_dopo4": c("dopo4"), "score": sc, "split": split,
            "ultima": W[-1]}

# ---------------- 3. GIORNO ----------------
def giorno():
    spx = yahoo("%5EGSPC"); vix = dict(yahoo("%5EVIX")); swda = yahoo("SWDA.MI")
    def run(serie, nome, split, europa=False):
        d = [x[0] for x in serie]; p = [x[1] for x in serie]; n = len(p)
        r = [None] + [p[i] / p[i - 1] - 1 for i in range(1, n)]
        ys = [None if i + 1 >= n or p[i + 1] == p[i] else int(p[i + 1] > p[i]) for i in range(n)]
        vx = [vix.get(x) for x in d]; L = 1 if europa else 0
        sig = {
            "ieri": [None if r[i] is None else int(r[i] > 0) for i in range(n)],
            "grande_calo": [None if r[i] is None else (0 if r[i] < -0.02 else 2 if r[i] > 0.02 else 1) for i in range(n)],
            "giorno_settimana": [x.weekday() for x in d],
            # il VIX chiude alle 22:15 italiane: per un ETF di Milano (chiusura 17:30) al momento di comprare si conosce solo quello del giorno prima
            "vix_sale": [None if (i < 2 or vx[i - L] is None or vx[i - 1 - L] is None) else int(vx[i - L] > vx[i - 1 - L]) for i in range(n)],
            "tendenza_200g": [None if i < 200 else int(p[i] > sum(p[i - 199:i + 1]) / 200) for i in range(n)],
        }
        res = walk(sig, ys, 1, split, [x.isoformat() for x in d]); sc = score(res, split); k = pick(sc)
        # trading con la regola scelta nel periodo d'esame: dentro se P(sale) > base, fuori altrimenti
        rr = res[k]; idx = {dt: i for i, dt in enumerate([x.isoformat() for x in d])}
        # tasse come in Italia sugli ETF: 26% sul guadagno di ogni operazione chiusa, le perdite non si compensano
        eq = 1.0; net = 1.0; entry = None; bh = 1.0; prev_in = None; switches = 0; days_in = 0; tot = 0; cost = 0.0010   # 0,10% a ogni entrata/uscita
        def close(net, entry):
            g = net / entry; return entry * (1 + (g - 1) * 0.74) if g > 1 else net
        for pr, b, dt in zip(rr["p"], rr["base"], rr["d"]):
            if dt < split: continue
            i = idx[dt]
            if i + 1 >= n: break
            ret = p[i + 1] / p[i] - 1; inn = pr >= b - 0.01; tot += 1      # fuori solo nei giorni che la regola dà almeno 1 punto peggiori del solito
            if prev_in is not None and inn != prev_in:
                switches += 1; eq *= (1 - cost); net *= (1 - cost)
                if not inn: net = close(net, entry); entry = None
            if inn and entry is None: entry = net
            if inn: eq *= (1 + ret); net *= (1 + ret); days_in += 1
            bh *= (1 + ret); prev_in = inn
        if entry is not None: net = close(net, entry)
        yrs = tot / 252; bh_net = 1 + (bh - 1) * 0.74
        return {"nome": nome, "score": sc, "scelta": k, "esame_da": split, "trading": {"anni": yrs, "cagr_lordo": eq ** (1 / yrs) - 1, "cagr_netto": net ** (1 / yrs) - 1, "cagr_tieni": bh ** (1 / yrs) - 1, "cagr_tieni_netto": bh_net ** (1 / yrs) - 1, "cambi": switches, "giorni_dentro": days_in / max(1, tot)}}
    # la trappola del fuso orario: lo stesso SWDA con il VIX della stessa data (che a Milano non si conosce ancora)
    trap = run(swda, "SWDA con il VIX della stessa sera (SBAGLIATO: sbircia il futuro)", "2018-01-01")
    return [run(spx, "S&P 500", "2010-01-01"), run(swda, "SWDA (MSCI World, euro)", "2018-01-01", europa=True), trap]

# ---------------- rapporto ----------------
def md(L, M, N, G):
    o = []
    A = o.append
    A("# Previsioni: l'agente allenato senza API\n")
    A(f"> Generato da `tools/previsioni.py` il {D.date.today().strftime('%d/%m/%Y')}. Dati veri, regole provate solo sul passato, giudicate su anni che l'agente non ha visto. **Non sono consigli**: servono a sapere quanto fidarsi di una previsione.\n")
    A("## Come si allena\n")
    A("1. **Dati**: S&P 500 dal 1871 con dividendi, inflazione e CAPE (Shiller, via datahub), S&P 500 e VIX giornalieri dal 1990 e SWDA dal 2009 (Yahoo), titoli di notizie settimanali dal 2019 (Google News).")
    A("2. **Regole candidate** per ogni livello (tendenza, valutazioni, paura, cali, notizie, giorno della settimana…). Ognuna fa le sue previsioni passo per passo usando **solo** quello che si sapeva in quel momento.")
    A("3. **Studio ed esame**: l'agente sceglie la regola migliore negli anni di studio; il voto vero è negli anni d'esame. La regola da battere è sempre «come al solito» (la frequenza storica).")
    A("4. **Punteggi**: *Brier skill* = di quanto la probabilità di «sale» è migliore di quella storica (0 = uguale, negativo = peggio); *azzeccate* = % di direzioni giuste; per il lungo periodo errore medio e intervalli all'80%.\n")
    # lungo
    A("## 1. Lungo periodo: 10 anni (S&P 500 reale, dividendi compresi)\n")
    b = L["base"]
    A(f"Base dal 1881: i periodi di 10 anni sono stati in guadagno reale nel **{pp(b['anni10_positivi'])}** dei casi (sopra il 2% l'anno nel {pp(b['anni10_sopra2pct'])}); media {pct(b['media'])} l'anno, peggiore {pct(b['peggiore'])}, migliore {pct(b['migliore'])}.\n")
    A("| Regola | Studio (prima del 1990): errore medio | Esame (dal 1990): errore medio | Esame: correlazione | Esame: intervallo 80% centrato |")
    A("|---|---|---|---|---|")
    nm = {"base": "come al solito (media storica)", "cape": "valutazione (CAPE)", "ultimi10": "ultimi 10 anni"}
    for k, s in L["score"].items():
        if "esame" not in s: continue
        A(f"| {nm[k]}{' ← scelta' if k == L['scelta'] else ''} | {s['studio']['mae']*100:.1f} punti | {s['esame']['mae']*100:.1f} punti | {s['esame']['corr']:+.2f} | {pp(s['esame']['cov80'])} |")
    t = L["oggi"]
    A(f"\nUltimo CAPE disponibile ({t['mese']}): **{t['cape']:.1f}**: con la regola della valutazione il rendimento reale atteso per i prossimi 10 anni è **{pct(t['prev'])} l'anno**, con 8 casi su 10 tra {pct(t['lo'])} e {pct(t['hi'])}.\n")
    # medio
    A("## 2. Medio periodo: 1, 3 e 6 mesi (S&P 500 dal 1871, VIX dal 1990)\n")
    A("| Orizzonte | Regola | Studio: Brier skill | Esame (dal 1990): Brier skill | Esame: azzeccate |")
    A("|---|---|---|---|---|")
    nm2 = {"base": "come al solito", "tendenza_10m": "sopra/sotto la media di 10 mesi", "momentum_12m": "su/giù negli ultimi 12 mesi", "calo_dal_massimo": "quanto è sotto il massimo", "paura_vix": "paura (VIX)", "ultimo_mese": "ultimo mese su/giù"}
    for h, r in M["h"].items():
        for k, s in r["score"].items():
            A(f"| {h} {'mese' if h == 1 else 'mesi'} | {nm2[k]}{' ← scelta' if k == r['scelta'] else ''} | {s['studio']['bss']*100:+.1f}% | {s['esame']['bss']*100:+.1f}% | {pp(s['esame']['hit'])} |")
    rk = M["rischio"]
    A("\n**Dove la tendenza aiuta davvero: il rischio.** Il mese dopo, a seconda di dove sta il prezzo rispetto alla media di 10 mesi (dal 1871):\n")
    A("| Situazione | Mesi | Media del mese dopo | Oscillazione | Mesi sotto −5% | Mesi in salita |")
    A("|---|---|---|---|---|---|")
    for lab in ("sopra", "sotto"):
        x = rk[lab]; A(f"| {lab} la media | {x['n']} | {pct(x['media'],2)} | {pp(x['vol'])} | {pp(x['mesi_sotto_meno5'])} | {pp(x['su'])} |")
    for lab in ("vix<20", "vix>=30"):
        if lab in rk: x = rk[lab]; A(f"| VIX {lab[3:]} | {x['n']} | {pct(x['media'],2)} | {pp(x['vol'])} | — | {pp(x['su'])} |")
    # notizie
    A("\n## 2b. Notizie e sentimento\n")
    if N:
        A(f"{N['titoli']} titoli in {N['settimane']} settimane ({N['da']} → {N['a']}), sentimento con un dizionario di parole finanziarie (positive: rally, record, rebound…; negative: plunge, selloff, fears…).\n")
        A(f"- Sentimento e borsa **della stessa settimana**: correlazione **{N['corr_stessa']:+.2f}** (le notizie raccontano quello che è già successo).")
        A(f"- Sentimento e **settimana dopo**: {N['corr_dopo1']:+.2f}; **4 settimane dopo**: {N['corr_dopo4']:+.2f}.")
        for k, s in N["score"].items():
            if k == "base": continue
            A(f"- Regola «{k}» (prevede la settimana dopo dal terzile del sentimento): Brier skill in esame (dal {N['split']}) **{s['esame']['bss']*100:+.1f}%**, azzeccate {pp(s['esame']['hit'])}.")
        A(f"- Ultima settimana ({N['ultima']['w']}): sentimento {N['ultima']['s']:+.2f}.\n")
    else:
        A("Notizie non ancora scaricate (`python tools/notizie_storiche.py`).\n")
    # giorno
    A("## 3. Giornaliero (day trading)\n")
    nm3 = {"base": "come al solito", "ieri": "ieri su/giù", "grande_calo": "dopo un ±2%", "giorno_settimana": "giorno della settimana", "vix_sale": "VIX salito ieri", "tendenza_200g": "sopra/sotto la media di 200 giorni"}
    for g in G:
        A(f"**{g['nome']}** (esame dal {g['esame_da'][:4]})\n")
        A("| Regola | Studio: Brier skill | Esame: Brier skill | Esame: azzeccate |")
        A("|---|---|---|---|")
        for k, s in g["score"].items():
            A(f"| {nm3[k]}{' ← scelta' if k == g['scelta'] else ''} | {s['studio']['bss']*100:+.2f}% | {s['esame']['bss']*100:+.2f}% | {pp(s['esame']['hit'])} |")
        t = g["trading"]
        A(f"\nTrading con la regola scelta (fuori nei giorni che la regola dà almeno 1 punto peggiori del solito, 0,10% a ogni entrata o uscita): **{pct(t['cagr_lordo'])} l'anno** prima delle tasse, **{pct(t['cagr_netto'])}** dopo le tasse (26% su ogni operazione chiusa in guadagno, perdite non compensabili), contro **{pct(t['cagr_tieni'])}** tenendo e basta, **{pct(t['cagr_tieni_netto'])}** dopo le tasse pagate una volta alla fine. {t['cambi']} entrate/uscite in {t['anni']:.1f} anni, dentro il {pp(t['giorni_dentro'])} dei giorni.\n")
    return "\n".join(o)

def main():
    L = lungo(); M = medio(); N = notizie(); G = giorno()
    json.dump({"lungo": L, "medio": {str(k): v for k, v in M["h"].items()}, "rischio": M["rischio"], "notizie": N, "giorno": G}, open(os.path.join(C, "risultati.json"), "w"), indent=1, default=str)
    # i numeri che servono all'app e all'agente (assets/previsioni.json): li legge il controllo del portafoglio
    sp = G[0]["trading"]; rk = M["rischio"]
    app = {"aggiornato": D.date.today().isoformat(),
           "lungo": {"anni10_positivi": round(L["base"]["anni10_positivi"], 3), "media_reale": round(L["base"]["media"], 4), "peggiore": round(L["base"]["peggiore"], 4), "migliore": round(L["base"]["migliore"], 4),
                     "cape": round(L["oggi"]["cape"], 1), "cape_mese": L["oggi"]["mese"], "prev_reale": round(L["oggi"]["prev"], 4), "lo": round(L["oggi"]["lo"], 4), "hi": round(L["oggi"]["hi"], 4)},
           "medio": {"skill_max": round(max(v["esame"]["bss"] for h in M["h"].values() for k, v in h["score"].items() if k != "base"), 3),
                     "sopra_media10": {k: round(v, 4) for k, v in rk["sopra"].items()}, "sotto_media10": {k: round(v, 4) for k, v in rk["sotto"].items()},
                     "vix30": {k: round(v, 4) for k, v in rk.get("vix>=30", {}).items()}},
           "notizie": None if not N else {"settimane": N["settimane"], "corr_stessa": round(N["corr_stessa"], 2), "corr_dopo1": round(N["corr_dopo1"], 2), "corr_dopo4": round(N["corr_dopo4"], 2),
                     "skill": round(max(v["esame"]["bss"] for k, v in N["score"].items() if k != "base"), 3)},
           "giorno": {"spx_netto": round(sp["cagr_netto"], 4), "spx_tieni_netto": round(sp["cagr_tieni_netto"], 4), "anni": round(sp["anni"], 1), "skill_max": round(max(v["esame"]["bss"] for g in G[:2] for k, v in g["score"].items() if k != "base"), 4)}}
    json.dump(app, open(os.path.join(ROOT, "GruzzoloDevAndroid", "app", "src", "main", "assets", "previsioni.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    text = md(L, M, N, G)
    old = open(OUT_MD, encoding="utf-8").read() if os.path.exists(OUT_MD) else ""
    # le sezioni scritte a mano (dopo il marcatore) restano
    mark = "<!-- sotto: scritto a mano -->"
    tail = old[old.index(mark):] if mark in old else mark + "\n"
    open(OUT_MD, "w", encoding="utf-8").write(text + "\n\n" + tail)
    print(text)

if __name__ == "__main__":
    main()
