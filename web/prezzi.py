"""Scarica da Yahoo Finance i prezzi che servono alla versione web di prova e li salva in <cartella>/yahoo/.
Nel browser Yahoo non si può chiamare direttamente (CORS): la GitHub Action lo fa ogni giorno al posto suo,
e demo-native.js risponde alle richieste dell'app con questi file. Uso: python web/prezzi.py _site"""
import json, os, re, sys, time, urllib.request

OUT = os.path.join(sys.argv[1] if len(sys.argv) > 1 else "_site", "yahoo")
TICKERS = """SWDA.MI EIMI.MI AGGH.MI XEON.MI SMEA.MI SGLD.MI IUSN.DE EQQQ.MI ROBO.MI HEAL.MI IJPA.AS IQQH.DE JEDI.DE DFEN.DE BTCE.DE 4GLD.DE
XAIX.DE VVSM.DE XWTS.DE XDWU.DE XDWT.DE XDWS.DE XDWM.DE XDWI.DE XDWH.DE XDWF.DE XDWC.DE XDW0.DE
SPY VTI QQQ VEA VGK EWJ VWO AGG TLT GLD EURUSD=X""".split()
KINDS = {"5d": "range=5d&interval=1d", "d": "range=2y&interval=1d", "wk": "range=10y&interval=1wk"}

def fname(sym, kind): return re.sub(r"[^A-Za-z0-9.]", "_", sym) + "_" + kind + ".json"

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (gruzzolo demo)", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r: return json.loads(r.read().decode("utf-8"))

def main():
    os.makedirs(OUT, exist_ok=True); ok = bad = 0
    for sym in TICKERS:
        for kind, q in KINDS.items():
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?{q}"
            for attempt in range(3):
                try:
                    j = get(url); r = j["chart"]["result"][0]
                    if not r.get("timestamp"): raise ValueError("vuoto")
                    json.dump(j, open(os.path.join(OUT, fname(sym, kind)), "w"), separators=(",", ":")); ok += 1; break
                except Exception as e:
                    if attempt == 2: print("niente per", sym, kind, e); bad += 1
                    time.sleep(1.5)
            time.sleep(0.25)
    json.dump({"ts": int(time.time()), "tickers": TICKERS}, open(os.path.join(OUT, "index.json"), "w"))
    print(f"prezzi: {ok} file, {bad} mancanti")

if __name__ == "__main__":
    import urllib.parse
    main()
