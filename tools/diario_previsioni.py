"""Diario delle previsioni: l'allenamento che continua sul futuro vero (nessuno può sbirciarlo).

Ogni volta che lo lanci:
  1. scarica S&P 500 e VIX degli ultimi 2 anni (Yahoo) e i titoli di oggi su borsa e mercati (Google News);
  2. scrive le previsioni di oggi con le regole imparate in tools/previsioni.py (numeri in assets/previsioni.json):
     - domani: probabilità che l'S&P 500 salga (la frequenza storica: le regole giornaliere non battono il caso);
     - 1 mese: probabilità che salga, a seconda che sia sopra o sotto la media di 10 mesi, e il rischio di un mese sotto −5%;
     - 10 anni: rendimento reale atteso con l'intervallo all'80% (si potrà verificare solo tra 10 anni);
     - notizie: tono di oggi (racconta il passato: viene registrato per misurarlo, non per decidere);
  3. dà il voto alle previsioni scadute (Brier e azzeccate) e scrive docs/diario_previsioni.md.
Uso: python tools/diario_previsioni.py   (una volta al giorno, anche saltando giorni)"""
import datetime as D, json, os, re, sys, time, urllib.parse, urllib.request, html
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from previsioni import senti   # stesso dizionario del sentimento
DIARIO = os.path.join(HERE, "diario_previsioni.json"); MD = os.path.join(ROOT, "docs", "diario_previsioni.md")
PREV = os.path.join(ROOT, "GruzzoloDevAndroid", "app", "src", "main", "assets", "previsioni.json")
UA = {"User-Agent": "Mozilla/5.0 (research script)"}

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r: return r.read().decode("utf-8", "replace")
def yahoo(t):
    now = int(time.time()); j = json.loads(get(f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(t)}?period1={now-800*86400}&period2={now}&interval=1d"))["chart"]["result"][0]
    return [(D.date.fromtimestamp(a).isoformat(), b) for a, b in zip(j["timestamp"], j["indicators"]["quote"][0]["close"]) if b]
def news_today():
    x = get("https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": "stock market when:1d", "hl": "en-US", "gl": "US", "ceid": "US:en"}))
    T = [html.unescape(t) for t in re.findall(r"<item>.*?<title>(.*?)</title>", x, re.S)]
    return T

def main():
    P = json.load(open(PREV, encoding="utf-8")); dia = json.load(open(DIARIO, encoding="utf-8")) if os.path.exists(DIARIO) else []
    spx = yahoo("^GSPC"); vix = yahoo("^VIX"); px = dict(spx); days = [d for d, _ in spx]
    today = days[-1]
    # media di 10 mesi: chiusure di fine mese
    me = {}
    for d, p in spx: me[d[:7]] = p
    m10 = list(me.values())[-10:]; above = spx[-1][1] > sum(m10) / len(m10)
    T = [];
    try: T = news_today()
    except Exception as e: print("notizie non raggiungibili:", e)
    tone = round(sum(senti(t) for t in T) / len(T), 3) if T else None
    M = P["medio"]["sopra_media10" if above else "sotto_media10"]
    if not any(e["data"] == today for e in dia):
        dia.append({"data": today, "spx": spx[-1][1], "vix": vix[-1][1] if vix else None, "sopra_media10": above, "tono_notizie": tone, "titoli": T[:12],
                    "prev": {"domani_sale": 0.545, "mese_sale": round(M["su"], 3), "mese_sotto_meno5": round(M["mesi_sotto_meno5"], 3),
                             "dieci_anni_reale": [P["lungo"]["lo"], P["lungo"]["prev_reale"], P["lungo"]["hi"]]}})
    # voti delle previsioni scadute
    def after(d, n):   # prezzo n giorni di borsa dopo d
        i = days.index(d) if d in days else None
        return px[days[i + n]] if i is not None and i + n < len(days) else None
    for e in dia:
        v = e.setdefault("voto", {})
        if "domani" not in v and (p1 := after(e["data"], 1)): y = int(p1 > e["spx"]); v["domani"] = {"sale": y, "brier": round((e["prev"]["domani_sale"] - y) ** 2, 4)}
        if "mese" not in v and (p21 := after(e["data"], 21)): y = int(p21 > e["spx"]); v["mese"] = {"sale": y, "brier": round((e["prev"]["mese_sale"] - y) ** 2, 4), "ret": round(p21 / e["spx"] - 1, 4)}
    json.dump(dia, open(DIARIO, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    # rapporto
    vd = [e["voto"]["domani"] for e in dia if "domani" in e.get("voto", {})]; vm = [e["voto"]["mese"] for e in dia if "mese" in e.get("voto", {})]
    L = ["# Diario delle previsioni", "", "> Scritto da `tools/diario_previsioni.py`: previsioni fatte giorno per giorno e votate quando scadono. È l'allenamento sul futuro vero.", "",
         f"Voci: **{len(dia)}** (dal {dia[0]['data']} al {dia[-1]['data']}). Votate: {len(vd)} a 1 giorno, {len(vm)} a 1 mese.", ""]
    if vd: L.append(f"- **Domani**: Brier medio {sum(x['brier'] for x in vd)/len(vd):.3f} (lanciare una moneta = 0,250), giorni in salita {sum(x['sale'] for x in vd)}/{len(vd)}.")
    if vm: L.append(f"- **1 mese**: Brier medio {sum(x['brier'] for x in vm)/len(vm):.3f}, mesi in salita {sum(x['sale'] for x in vm)}/{len(vm)}.")
    L += ["", "| Data | S&P 500 | VIX | Sopra la media 10 mesi | Tono notizie | P(sale domani) | P(sale in 1 mese) | Esito domani | Esito 1 mese |", "|---|---|---|---|---|---|---|---|---|"]
    for e in dia[-30:][::-1]:
        v = e.get("voto", {}); em = (("▲ " if v["mese"]["sale"] else "▼ ") + f"{v['mese']['ret']*100:+.1f}%") if "mese" in v else "…"
        L.append(f"| {e['data']} | {e['spx']:.0f} | {e['vix'] or 0:.1f} | {'sì' if e['sopra_media10'] else 'no'} | {e['tono_notizie'] if e['tono_notizie'] is not None else '—'} | {e['prev']['domani_sale']:.0%} | {e['prev']['mese_sale']:.0%} | {('▲' if v['domani']['sale'] else '▼') if 'domani' in v else '…'} | {em} |")
    open(MD, "w", encoding="utf-8").write("\n".join(L) + "\n")
    print("\n".join(L[:8]))

if __name__ == "__main__":
    main()
