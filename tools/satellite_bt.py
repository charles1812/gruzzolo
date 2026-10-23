#!/usr/bin/env python3
"""Ricerca: la parte «satellite» per chi vuole più rischio ha senso? Backtest della rotazione momentum tra ETF.

Uso: python tools/satellite_bt.py        stampa il report e lo aggiunge a docs/satellite.md

Universo (ETF USA con storia lunga, convertiti in EUR): settori SPDR, small cap, Nasdaq, paesi sviluppati ex USA, emergenti, oro.
Strategie confrontate (mensili, dal 2005):
  mondo         - 50% SPY + 50% EFA (il «core», cioè quello che fa già il piano)
  top3 momentum - ogni mese i 3 ETF con il rendimento migliore degli ultimi 12 mesi (escluso l'ultimo)
  dual momentum - come top3, ma se il migliore rende meno della liquidità va tutto in liquidità (protezione dai crolli)
Ogni strategia è calcolata senza tasse e con le tasse italiane (26% sulle plusvalenze realizzate, minusvalenze
ETF non compensabili: regime amministrato) e 0,1% di costi a ogni cambio.
Validazione walk-forward: la finestra del momentum (6/9/12 mesi) si sceglie solo sui 10 anni precedenti.
"""
import json, os, sys, time, urllib.request, datetime, statistics as st

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", "cache")
UNIVERSE = ["XLK", "XLF", "XLE", "XLV", "XLI", "XLY", "XLP", "XLU", "XLB", "IWM", "QQQ", "EFA", "EEM", "GLD", "SPY"]
TAX, COST = 0.26, 0.001


def monthly(sym):
    os.makedirs(CACHE, exist_ok=True)
    fn = os.path.join(CACHE, "m_" + sym.replace("=", "_").replace("^", "_") + ".json")
    if os.path.exists(fn) and time.time() - os.path.getmtime(fn) < 86400:
        return json.load(open(fn))
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=1mo&range=max"
    r = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=30))["chart"]["result"][0]
    off = r["meta"].get("gmtoffset") or 0
    adj = (r["indicators"].get("adjclose") or [{}])[0].get("adjclose") or r["indicators"]["quote"][0]["close"]
    out = {}
    for t, p in zip(r["timestamp"], adj):
        if p and p > 0:
            out[datetime.datetime.fromtimestamp(t + off + 6 * 3600, datetime.timezone.utc).strftime("%Y-%m")] = p
    json.dump(out, open(fn, "w")); time.sleep(0.6)
    return out


def main():
    fx = monthly("EURUSD=X")
    px = {s: monthly(s) for s in UNIVERSE}
    hist = json.load(open(os.path.join(ROOT, "GruzzoloDevAndroid", "app", "src", "main", "assets", "storico.json")))
    cash_r = dict(zip(hist["months"], hist["r"]["XEON"]))
    cur = datetime.date.today().strftime("%Y-%m")
    months = sorted(k for k in fx if all(k in px[s] for s in UNIVERSE) and k < cur and k in cash_r)
    # prezzi in EUR
    eur = {s: {m: px[s][m] / fx[m] for m in months} for s in UNIVERSE}
    M = months
    ret = {s: [eur[s][M[i]] / eur[s][M[i - 1]] - 1 for i in range(1, len(M))] for s in UNIVERSE}
    cash = [cash_r[M[i]] for i in range(1, len(M))]
    T = len(M) - 1
    mom = lambda s, i, L: eur[s][M[i - 1]] / eur[s][M[i - 1 - L]] - 1   # 12-1: escludo l'ultimo mese

    def run(strategy, L_fixed=None, taxed=False, start=13, walk=False):
        """valore di 1 € e calo massimo; tasse sulle plusvalenze realizzate quando si vende"""
        V, peak, mdd = 1.0, 1.0, 0.0
        hold = {}            # simbolo -> [valore, costo fiscale]
        vals = []
        Ls = []
        for i in range(start, T + 1):
            L = L_fixed or 12
            if walk:
                # sceglie la finestra migliore sui 10 anni precedenti (solo dati passati)
                best, bv = 12, -9
                for cand in (6, 9, 12):
                    v = run_window(strategy, cand, max(start, i - 120), i)
                    if v > bv: bv, best = v, cand
                L = best
            Ls.append(L)
            target = pick(strategy, i, L)
            # vendo quello che non tengo più (tasse sulle plusvalenze, minusvalenze perse)
            total = sum(h[0] for h in hold.values()) if hold else V
            if not hold:
                hold = {"CASH": [V, V]}
            new_w = {k: 1 / len(target) for k in target}
            for k in list(hold.keys()):
                if k not in new_w:
                    v, c = hold.pop(k)
                    gain = max(0.0, v - c)
                    total -= (gain * TAX if (taxed and k != "CASH") else 0) + v * COST
            # ribilancio solo i nuovi ingressi (i titoli tenuti restano dove sono: niente vendite inutili)
            kept = sum(hold[k][0] for k in hold)
            free = total - kept
            newcomers = [k for k in new_w if k not in hold]
            for k in newcomers:
                a = free / len(newcomers) if newcomers else 0
                hold[k] = [a * (1 - COST), a * (1 - COST)]
            if not newcomers and free > 1e-12 and hold:
                for k in hold: hold[k][0] += free / len(hold); hold[k][1] += free / len(hold)
            # rendimento del mese
            for k in hold:
                r = cash[i - 1] if k == "CASH" else ret[k][i - 1]
                hold[k][0] *= 1 + r
            V = sum(h[0] for h in hold.values())
            peak = max(peak, V); mdd = min(mdd, V / peak - 1)
            vals.append(V)
        if taxed:   # alla fine tasso anche le plusvalenze non realizzate, per confronti onesti
            V -= sum(max(0, v - c) * TAX for k, (v, c) in hold.items() if k != "CASH")
        return V, mdd, vals, Ls

    def run_window(strategy, L, a, b):
        V = 1.0
        for i in range(a, b):
            t = pick(strategy, i, L)
            V *= 1 + st.mean([cash[i - 1] if k == "CASH" else ret[k][i - 1] for k in t])
        return V

    risky = [s for s in UNIVERSE if s != "GLD"]

    def pick(strategy, i, L):
        if strategy == "mondo": return ["SPY", "EFA"]
        sc = sorted(UNIVERSE, key=lambda s: mom(s, i, L), reverse=True)
        top = sc[:3]
        if strategy == "dual":
            cash_m = 1.0
            for j in range(i - 1 - L, i - 1): cash_m *= 1 + cash[j]
            if mom(top[0], i, L) < cash_m - 1: return ["CASH"]
            top = [s for s in top if mom(s, i, L) > cash_m - 1] or ["CASH"]
        return top

    yrs = (T - 13 + 1) / 12
    L = []
    P = lambda *a: L.append(" ".join(str(x) for x in a))
    P(f"# Satellite: rotazione momentum tra ETF — {M[14]} → {M[-1]} ({yrs:.1f} anni, EUR)\n")
    P("| Strategia | Rend. annuo lordo | Calo massimo | Rend. annuo con tasse 26% | Finestra |")
    P("|---|---|---|---|---|")
    res = {}
    for name, strat, Lf, walk in (("Mondo (core)", "mondo", 12, False), ("Top 3 momentum 12m", "top3", 12, False),
                                  ("Dual momentum 12m", "dual", 12, False), ("Dual momentum walk-forward", "dual", None, True)):
        V0, mdd, vals, Ls = run(strat, Lf, False, walk=walk)
        V1, _, _, _ = run(strat, Lf, True, walk=walk)
        c0, c1 = V0 ** (1 / yrs) - 1, V1 ** (1 / yrs) - 1
        res[name] = (c0, mdd, c1)
        lw = f"scelta {min(Ls)}-{max(Ls)} mesi" if walk else f"{Lf} mesi"
        P(f"| {name} | {c0:.1%} | {mdd:.1%} | {c1:.1%} | {lw} |")
    txt = "\n".join(L)
    print(txt)
    os.makedirs(os.path.join(ROOT, "docs"), exist_ok=True)
    open(os.path.join(ROOT, "docs", "satellite.md"), "w", encoding="utf-8").write(txt + "\n")


if __name__ == "__main__":
    main()


def pac_contrib_research():
    """PAC 1 €/mese senza mai vendere: dove mettere ogni nuovo versamento? (nessuna tassa fino alla vendita finale)"""
    fx = monthly("EURUSD=X"); px = {s: monthly(s) for s in UNIVERSE}
    hist = json.load(open(os.path.join(ROOT, "GruzzoloDevAndroid", "app", "src", "main", "assets", "storico.json")))
    cash_r = dict(zip(hist["months"], hist["r"]["XEON"]))
    cur = datetime.date.today().strftime("%Y-%m")
    M = sorted(k for k in fx if all(k in px[s] for s in UNIVERSE) and k < cur and k in cash_r)
    eur = {s: {m: px[s][m] / fx[m] for m in M} for s in UNIVERSE}
    T = len(M)
    r = lambda s, i: eur[s][M[i]] / eur[s][M[i - 1]] - 1
    mom = lambda s, i, L=12: eur[s][M[i - 1]] / eur[s][M[i - 1 - L]] - 1

    def sim(rule, i0, i1):
        val = {}; paid = 0; worst = 9
        for i in range(i0, i1):
            for k, w in rule(i).items(): val[k] = val.get(k, 0) + w
            paid += 1
            for k in val: val[k] *= 1 + r(k, i)
            worst = min(worst, sum(val.values()) / paid)
        V = sum(val.values())
        gain = max(0, V - paid)
        return (V - gain * TAX) / paid, worst

    world = lambda i: {"SPY": .5, "EFA": .5}
    top1 = lambda i: {max(UNIVERSE, key=lambda s: mom(s, i)): 1.0}
    top3 = lambda i: {s: 1 / 3 for s in sorted(UNIVERSE, key=lambda s: mom(s, i), reverse=True)[:3]}
    # core + satellite: 80% sempre sul mondo, 20% sul top 3 momentum
    core_sat = lambda i: {**{"SPY": .4, "EFA": .4}, **{s: .2 / 3 for s in sorted(UNIVERSE, key=lambda s: mom(s, i), reverse=True)[:3] if s not in ("SPY", "EFA")}} if True else {}

    out = ["\n## PAC senza vendere mai: dove va ogni nuovo versamento (tasse pagate solo alla fine)\n",
           "| Regola | Intero periodo: netto/versato | Peggior momento | Finestre 10 anni: mediana | peggiore | batte il mondo |", "|---|---|---|---|---|---|"]
    rules = (("Mondo 50/50 (core)", world), ("Tutto sul top 1 momentum", top1), ("Top 3 momentum", top3), ("80% mondo + 20% top 3", core_sat))
    base = [sim(world, i, i + 120)[0] for i in range(13, T - 120 + 1, 3)]
    for name, rule in rules:
        full, worst = sim(rule, 13, T)
        ten = [sim(rule, i, i + 120)[0] for i in range(13, T - 120 + 1, 3)]
        beat = sum(1 for a, b in zip(ten, base) if a > b) / len(ten)
        out.append(f"| {name} | {full:.2f} | {worst - 1:.0%} | {st.median(ten):.2f} | {min(ten):.2f} | {beat:.0%} delle finestre |")
    txt = "\n".join(out); print(txt)
    open(os.path.join(ROOT, "docs", "satellite.md"), "a", encoding="utf-8").write(txt + "\n")


if __name__ == "__main__" and "--pac" in sys.argv:
    pac_contrib_research()
