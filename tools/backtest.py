#!/usr/bin/env python3
"""Backtest del motore del Piano sui dati storici veri (tools/storico.py → assets/storico.json).

Uso: python tools/backtest.py            stampa il report e scrive docs/backtest.md
     python tools/backtest.py --json     scrive anche tools/cache/backtest.json (numeri usati in piano.js)

Cosa misura
 1. Profili a pesi fissi (ribilanciati ogni mese, senza versamenti): rendimento, volatilità, calo massimo, anno peggiore.
 2. PAC su tutte le finestre storiche (3/5/10/15 anni, una per mese di partenza): quante finiscono in perdita e di quanto.
 3. Strategie di gestione del PAC sull'intero periodo e sulle finestre di 10 anni:
      versamenti   - ogni versamento compra le voci sotto peso (il motore attuale)
      quote fisse  - ogni versamento divide sempre con i pesi obiettivo (tipo Replay)
      annuale      - versamenti + ribilanciamento annuale vendendo (26% di tasse sulle plusvalenze)
      soglia 5     - versamenti + vendita solo se una voce si stacca di più di 5 punti (tasse incluse)
 4. Questionario: tutte le combinazioni di risposte → profilo, confrontato con il calo che la persona dichiara di reggere.
"""
import json, os, sys, itertools, statistics as st

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = json.load(open(os.path.join(ROOT, "GruzzoloDevAndroid", "app", "src", "main", "assets", "storico.json")))
M, R = D["months"], D["r"]
N = len(M)
TAX = 0.26

PROFILES = {
    1: ("Prudente",   {"SWDA": 22, "EIMI": 3,  "AGGH": 50, "XEON": 25}),
    2: ("Moderato",   {"SWDA": 44, "EIMI": 6,  "AGGH": 40, "XEON": 10}),
    3: ("Bilanciato", {"SWDA": 62, "EIMI": 8,  "AGGH": 25, "XEON": 5}),
    4: ("Dinamico",   {"SWDA": 75, "EIMI": 10, "AGGH": 15}),
    5: ("Aggressivo", {"SWDA": 88, "EIMI": 12}),
}


def w_of(p): return {k: v / 100 for k, v in PROFILES[p][1].items()}


def fixed_mix(w, i0=0, i1=N):
    """valore di 1 € investito a pesi costanti (ribilanciato ogni mese)"""
    v = [1.0]
    for t in range(i0, i1):
        v.append(v[-1] * (1 + sum(w[k] * R[k][t] for k in w)))
    return v


def max_dd(v):
    peak, dd = v[0], 0.0
    for x in v:
        peak = max(peak, x); dd = min(dd, x / peak - 1)
    return dd


def roll12(v):
    return [v[i + 12] / v[i] - 1 for i in range(len(v) - 12)]


def pac(w, i0, i1, policy="versamenti", C=1.0, band=0.05):
    """simula un PAC mensile; restituisce (valore finale, versato, peggior rapporto valore/versato, calo massimo del valore, tasse pagate)"""
    val = {k: 0.0 for k in w}; cost = {k: 0.0 for k in w}
    paid, worst_ratio, peak, mdd, taxes = 0.0, 1.0, 0.0, 0.0, 0.0
    for t in range(i0, i1):
        # versamento a inizio mese
        V = sum(val.values()); paid += C
        if policy == "quote fisse":
            alloc = {k: C * w[k] for k in w}
        else:
            deficit = {k: max(0.0, w[k] * (V + C) - val[k]) for k in w}
            dt = sum(deficit.values())
            alloc = {k: (C * deficit[k] / dt if dt > 0 else C * w[k]) for k in w}
        for k in w: val[k] += alloc[k]; cost[k] += alloc[k]
        # ribilanciamento vendendo (con tasse sulle plusvalenze)
        V = sum(val.values())
        do = (policy == "annuale" and M[t].endswith("-01")) or \
             (policy == "soglia 5" and V > 0 and max(abs(val[k] / V - w[k]) for k in w) > band)
        if do and V > 0:
            for k in w:
                target = w[k] * V
                if val[k] > target:                       # vendo l'eccesso
                    sell = val[k] - target
                    gain_frac = max(0.0, 1 - cost[k] / val[k]) if val[k] > 0 else 0
                    tax = sell * gain_frac * TAX
                    cost[k] *= (val[k] - sell) / val[k]
                    val[k] -= sell; taxes += tax
            V2 = sum(val.values()); cash = V - V2 - taxes
            under = {k: max(0.0, w[k] * (V2 + cash) - val[k]) for k in w}; ut = sum(under.values())
            for k in w:
                add = cash * under[k] / ut if ut > 0 else 0
                val[k] += add; cost[k] += add
        # rendimento del mese
        for k in w: val[k] *= 1 + R[k][t]
        V = sum(val.values())
        worst_ratio = min(worst_ratio, V / paid)
        peak = max(peak, V); mdd = min(mdd, V / peak - 1 if peak > 0 else 0)
    return V, paid, worst_ratio, mdd, taxes


def irr_monthly(final, months):
    """rendimento annuo equivalente di un PAC di 1 €/mese che finisce a 'final' (bisezione)"""
    lo, hi = -0.5, 0.5
    for _ in range(80):
        r = (lo + hi) / 2; i = (1 + r) ** (1 / 12) - 1
        fv = sum((1 + i) ** (months - k) for k in range(months))
        lo, hi = (r, hi) if fv < final else (lo, r)
    return (lo + hi) / 2


def pct(xs, q):
    xs = sorted(xs); return xs[min(len(xs) - 1, max(0, int(round(q * (len(xs) - 1)))))]


# ---------------- questionario (stessa logica di piano.js) ----------------
OLD_RQ = {
    "eta": {"u30": 4, "30_45": 3, "45_60": 2, "o60": 1},
    "calo": {"vendo": 0, "parte": 1, "aspetto": 3, "compro": 5},
    "perdita": {"10": 1, "20": 2, "35": 4, "50": 5},
    "scopo": {"proteggere": 1, "equilibrio": 3, "crescita": 5},
    "esper": {"no": 2, "venduto": 0, "tenuto": 4},
}
HCAP_OLD = {"lt3": 1, "3_5": 2, "5_10": 4, "gt10": 5}


def old_profile(a):
    s = sum(OLD_RQ[k][a[k]] for k in OLD_RQ) / len(OLD_RQ)
    p = 1 if s < 1.2 else 2 if s < 2.2 else 3 if s < 3.2 else 4 if s < 4.2 else 5
    return min(p, HCAP_OLD[a["orizz"]])


def main():
    out = {"from": M[0], "to": M[-1], "profiles": {}, "rolling": {}, "policies": {}, "quiz": {}}
    L = []
    P = lambda *a: L.append(" ".join(str(x) for x in a))
    P(f"# Backtest del Piano — dati {M[0]} → {M[-1]} ({N} mesi, rendimenti totali in EUR)\n")
    P("Serie: " + D["note"] + "\n")

    # 1. profili a pesi fissi
    P("## 1. Profili a pesi fissi (1 € investito subito, ribilanciato ogni mese)\n")
    P("| Profilo | Rend. annuo | Volatilità | Calo massimo | Anno peggiore | Anno migliore |")
    P("|---|---|---|---|---|---|")
    for p in PROFILES:
        v = fixed_mix(w_of(p))
        mr = [v[i + 1] / v[i] - 1 for i in range(len(v) - 1)]
        cagr = v[-1] ** (12 / (len(v) - 1)) - 1
        vol = st.pstdev(mr) * 12 ** 0.5
        dd = max_dd(v); r12 = roll12(v)
        out["profiles"][p] = {"cagr": cagr, "vol": vol, "mdd": dd, "worst12": min(r12), "best12": max(r12)}
        P(f"| {PROFILES[p][0]} | {cagr:.1%} | {vol:.1%} | {dd:.1%} | {min(r12):.1%} | {max(r12):.1%} |")

    # 2. PAC su finestre mobili (strategia 'versamenti')
    P("\n## 2. PAC su tutte le finestre storiche (strategia «versamenti»)\n")
    P("Valore finale diviso versato. «Perdita» = finestre che finiscono sotto il versato. «Peggior momento» = il punto più basso valore/versato durante la finestra.\n")
    P("| Profilo | Anni | Finestre | Peggiore | 10° perc. | Mediana | Rend. annuo mediano | In perdita | Peggior momento |")
    P("|---|---|---|---|---|---|---|---|---|")
    for p in PROFILES:
        out["rolling"][p] = {}
        for H in (3, 5, 10, 15):
            n = H * 12; res = []
            for i0 in range(0, N - n + 1):
                V, paid, wr, mdd, _ = pac(w_of(p), i0, i0 + n)
                res.append((V / paid, wr, mdd))
            mult = [r[0] for r in res]; loss = sum(1 for x in mult if x < 1) / len(mult)
            irr = irr_monthly(st.median(mult) * n, n)
            out["rolling"][p][H] = {"n": len(res), "worst": min(mult), "p10": pct(mult, .1), "p50": st.median(mult),
                                    "p90": pct(mult, .9), "loss": loss, "worstMoment": min(r[1] for r in res), "irr50": irr}
            P(f"| {PROFILES[p][0]} | {H} | {len(res)} | {min(mult):.2f} | {pct(mult,.1):.2f} | {st.median(mult):.2f} | {irr:.1%} | {loss:.0%} | {min(r[1] for r in res)-1:.0%} |")

    # 3. strategie
    P("\n## 3. Strategie di gestione del PAC\n")
    P("Intero periodo (1 €/mese) e mediana sulle finestre di 10 anni. Tasse 26% sulle plusvalenze quando si vende.\n")
    P("| Profilo | Strategia | Finale/versato (tutto) | Calo massimo | Tasse pagate | Mediana 10 anni | Peggiore 10 anni | Scarto medio dai pesi |")
    P("|---|---|---|---|---|---|---|---|")
    for p in (2, 3, 4, 5):
        out["policies"][p] = {}
        for pol in ("versamenti", "quote fisse", "annuale", "soglia 5"):
            V, paid, wr, mdd, tax = pac(w_of(p), 0, N, pol)
            ten = [pac(w_of(p), i0, i0 + 120, pol)[0] / 120 for i0 in range(0, N - 120 + 1, 3)]
            drift = drift_avg(w_of(p), pol)
            out["policies"][p][pol] = {"mult": V / paid, "mdd": mdd, "tax": tax / paid, "p50_10": st.median(ten), "min_10": min(ten), "drift": drift}
            P(f"| {PROFILES[p][0]} | {pol} | {V/paid:.2f} | {mdd:.1%} | {tax/paid:.1%} del versato | {st.median(ten):.2f} | {min(ten):.2f} | {drift:.1f} punti |")

    # 4. questionario vecchio
    P("\n## 4. Questionario attuale: combinazioni di risposte\n")
    combos = list(itertools.product(OLD_RQ["eta"], HCAP_OLD, OLD_RQ["calo"], OLD_RQ["perdita"], OLD_RQ["scopo"], OLD_RQ["esper"]))
    dist = {p: 0 for p in PROFILES}; mismatch = 0; sold_but_high = 0
    for c in combos:
        a = dict(zip(["eta", "orizz", "calo", "perdita", "scopo", "esper"], c))
        p = old_profile(a); dist[p] += 1
        tol = -int(a["perdita"]) / 100
        if out["profiles"][p]["mdd"] < tol - 0.05: mismatch += 1
        if a["calo"] == "vendo" and p >= 4: sold_but_high += 1
    P(f"Combinazioni: {len(combos)}. Profili assegnati: " + ", ".join(f"{PROFILES[p][0]} {dist[p]}" for p in PROFILES))
    P(f"\nIncoerenze: in {mismatch} combinazioni ({mismatch/len(combos):.0%}) il profilo ha avuto storicamente un calo massimo più grande di 5 punti oltre quello dichiarato sopportabile.")
    P(f"In {sold_but_high} combinazioni chi dice «vendo tutto» dopo un -30% riceve Dinamico o Aggressivo.")
    out["quiz"] = {"combos": len(combos), "dist": dist, "mismatch": mismatch, "soldHigh": sold_but_high}

    # 5. questionario nuovo (piano.js): scelta esplicita del portafoglio, poi limiti di orizzonte, reazione ed esperienza
    P("\n## 5. Questionario nuovo: combinazioni di risposte\n")
    HC = {"lt3": 1, "3_5": 2, "5_7": 3, "7_10": 4, "gt10": 5}; HY = {"lt3": 3, "3_5": 4, "5_7": 5, "7_10": 7, "gt10": 10}
    BC = {"vendo": 2, "parte": 3, "aspetto": 5, "compro": 5}; EC = {"no": 5, "venduto": 3, "tenuto": 5}
    combos = list(itertools.product(HC, BC, EC, range(1, 6)))
    dist = {p: 0 for p in PROFILES}; over = 0; sold_high = 0; bad_h = 0
    for o, c, e, ch in combos:
        p = min(ch, HC[o], BC[c], EC[e]); dist[p] += 1
        if p > ch: over += 1
        if c == "vendo" and p > 2: sold_high += 1
        n = HY[o] * 12
        worst = min(pac(w_of(p), i, i + n)[0] / n for i in range(0, N - n + 1, 6))
        if worst < 0.75: bad_h += 1
    P(f"Combinazioni: {len(combos)}. Profili assegnati: " + ", ".join(f"{PROFILES[p][0]} {dist[p]}" for p in PROFILES))
    P(f"\nProfilo più rischioso del portafoglio scelto dalla persona: {over} combinazioni (deve essere 0).")
    P(f"Chi dice «vendo tutto» con più di Moderato: {sold_high} (deve essere 0).")
    P(f"Combinazioni in cui, sull'orizzonte dichiarato, la finestra storica peggiore del profilo assegnato perde più del 25% del versato: {bad_h}.")
    out["quiz_new"] = {"combos": len(combos), "dist": dist, "over": over, "soldHigh": sold_high, "badHorizon": bad_h}

    txt = "\n".join(L)
    os.makedirs(os.path.join(ROOT, "docs"), exist_ok=True)
    open(os.path.join(ROOT, "docs", "backtest.md"), "w", encoding="utf-8").write(txt + "\n")
    if "--json" in sys.argv:
        json.dump(out, open(os.path.join(ROOT, "tools", "cache", "backtest.json"), "w"), indent=1)
    print(txt)


def drift_avg(w, pol):
    """scarto medio (in punti percentuali) dai pesi obiettivo lungo l'intero periodo"""
    val = {k: 0.0 for k in w}; ds = []
    for t in range(N):
        V = sum(val.values())
        if pol == "quote fisse":
            alloc = {k: w[k] for k in w}
        else:
            de = {k: max(0.0, w[k] * (V + 1) - val[k]) for k in w}; dt = sum(de.values())
            alloc = {k: (de[k] / dt if dt > 0 else w[k]) for k in w}
        for k in w: val[k] += alloc[k]
        V = sum(val.values())
        if (pol == "annuale" and M[t].endswith("-01")) or (pol == "soglia 5" and max(abs(val[k] / V - w[k]) for k in w) > 0.05):
            for k in w: val[k] = w[k] * V
        for k in w: val[k] *= 1 + R[k][t]
        V = sum(val.values())
        if t > 24: ds.append(sum(abs(val[k] / V - w[k]) for k in w) / 2 * 100)
    return st.mean(ds) if ds else 0


if __name__ == "__main__":
    main()
