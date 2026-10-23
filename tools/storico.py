#!/usr/bin/env python3
"""Costruisce le serie storiche mensili (rendimenti totali in EUR) degli strumenti del piano.

Uso: python tools/storico.py        -> scrive GruzzoloDevAndroid/app/src/main/assets/storico.json e tools/cache/*.json

Dove l'ETF è troppo giovane la serie viene allungata all'indietro con un proxy (documentato in ASSETS):
  SWDA  iShares Core MSCI World          SWDA.MI dal 2009-10; prima 50% SPY + 50% EFA in EUR
  EIMI  iShares Core MSCI EM IMI         EIMI.MI dal 2014-08; prima EEM in EUR
  AGGH  Global Aggregate Bond EUR hedged EUNA.DE dal 2017-12; prima IEAG.AS (aggregate euro) dal 2009-05; prima AGG senza cambio
  XEON  EUR overnight                    XEON.MI dal 2008-02; prima 2,5% annuo
I dati arrivano da Yahoo Finance (chart API, prezzi rettificati per i dividendi): solo uso personale.
"""
import json, os, sys, time, urllib.request, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", "cache")
OUT = os.path.join(ROOT, "GruzzoloDevAndroid", "app", "src", "main", "assets", "storico.json")
START = "2004-01"


def yahoo_monthly(sym):
    """{'YYYY-MM': ultimo prezzo rettificato del mese}"""
    os.makedirs(CACHE, exist_ok=True)
    fn = os.path.join(CACHE, sym.replace("^", "_").replace("=", "_") + ".json")
    if os.path.exists(fn) and time.time() - os.path.getmtime(fn) < 86400 and "--fresh" not in sys.argv:
        return json.load(open(fn))
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=1mo&range=max"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    r = json.load(urllib.request.urlopen(req, timeout=30))["chart"]["result"][0]
    ts = r["timestamp"]
    adj = (r["indicators"].get("adjclose") or [{}])[0].get("adjclose") or r["indicators"]["quote"][0]["close"]
    off = r["meta"].get("gmtoffset") or 0      # le barre mensili partono a mezzanotte ora della borsa
    out = {}
    for t, p in zip(ts, adj):
        if p is None or p <= 0:
            continue
        out[datetime.datetime.fromtimestamp(t + off + 6 * 3600, datetime.timezone.utc).strftime("%Y-%m")] = p
    json.dump(out, open(fn, "w"))
    time.sleep(1)
    return out


def rets(px):
    ks = sorted(px)
    return {ks[i]: px[ks[i]] / px[ks[i - 1]] - 1 for i in range(1, len(ks))}


def months(a, b):
    y, m = map(int, a.split("-")); out = []
    while f"{y:04d}-{m:02d}" <= b:
        out.append(f"{y:04d}-{m:02d}"); m += 1
        if m == 13: y += 1; m = 1
    return out


def usd_to_eur(r_usd, fx):
    """r_eur = (1+r_usd) * (EURUSD_{t-1}/EURUSD_t) - 1"""
    out = {}
    for k, v in r_usd.items():
        if k in fx:
            out[k] = (1 + v) / (1 + fx[k]) - 1
    return out


def splice(primary, proxy, start_primary):
    """usa primary da start_primary in poi, proxy prima"""
    return {k: (primary[k] if k >= start_primary and k in primary else proxy.get(k)) for k in set(primary) | set(proxy)}


def corr_check(name, a, b):
    ks = sorted(set(a) & set(b))
    if len(ks) < 24: return
    import statistics as st
    xa = [a[k] for k in ks]; xb = [b[k] for k in ks]
    ma, mb = st.mean(xa), st.mean(xb)
    cov = sum((x - ma) * (y - mb) for x, y in zip(xa, xb)) / len(ks)
    c = cov / (st.pstdev(xa) * st.pstdev(xb))
    ann = lambda x: (1 + st.mean(x)) ** 12 - 1
    print(f"  proxy {name}: {len(ks)} mesi in comune, correlazione {c:.3f}, rendimento medio annuo ETF {ann(xa):.1%} / proxy {ann(xb):.1%}")


def main():
    fx = rets(yahoo_monthly("EURUSD=X"))
    spy, efa, eem, agg = (rets(yahoo_monthly(s)) for s in ("SPY", "EFA", "EEM", "AGG"))
    swda, eimi, euna, ieag, xeon = (rets(yahoo_monthly(s)) for s in ("SWDA.MI", "EIMI.MI", "EUNA.DE", "IEAG.AS", "XEON.MI"))

    world_proxy = usd_to_eur({k: 0.5 * spy[k] + 0.5 * efa[k] for k in spy if k in efa}, fx)
    em_proxy = usd_to_eur(eem, fx)
    print("Controllo dei proxy sul periodo in comune:")
    corr_check("SWDA vs 50% SPY + 50% EFA in EUR", swda, world_proxy)
    corr_check("EIMI vs EEM in EUR", eimi, em_proxy)
    corr_check("EUNA vs IEAG", euna, ieag)
    corr_check("IEAG vs AGG senza cambio", ieag, agg)

    end = max(swda)
    # il mese in corso non è completo: lo escludo
    cur = datetime.date.today().strftime("%Y-%m")
    if end >= cur: end = sorted(k for k in swda if k < cur)[-1]
    M = months(START, end)
    series = {
        "SWDA": splice(swda, world_proxy, "2009-11"),
        "EIMI": splice(eimi, em_proxy, "2014-09"),
        "AGGH": splice(euna, splice(ieag, agg, "2009-05"), "2017-12"),
        "XEON": splice(xeon, {k: 1.025 ** (1 / 12) - 1 for k in M}, "2008-02"),
    }
    out = {"from": M[0], "to": M[-1], "months": M, "r": {}}
    for k, s in series.items():
        miss = [m for m in M if s.get(m) is None]
        if miss:
            print(f"  {k}: mancano {len(miss)} mesi ({miss[:3]}): li riempio con 0")
        out["r"][k] = [round(s.get(m) or 0.0, 6) for m in M]
    out["note"] = ("Rendimenti mensili totali in EUR. Proxy prima della nascita degli ETF: SWDA <2009-11 = 50% SPY + 50% EFA in EUR; "
                   "EIMI <2014-09 = EEM in EUR; AGGH <2017-12 = IEAG (aggregate euro), <2009-05 = AGG senza cambio; XEON <2008-02 = 2,5% annuo.")
    json.dump(out, open(OUT, "w"), separators=(",", ":"))
    print(f"Scritto {OUT}: {len(M)} mesi, {M[0]} - {M[-1]}")


if __name__ == "__main__":
    main()
