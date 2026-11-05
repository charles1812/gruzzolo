"""Titoli di notizie finanziarie settimana per settimana (Google News RSS con after:/before:), per misurare se il
sentimento delle notizie aiuta a prevedere i mercati. Scarica in tools/cache/prev/news/<settimana>.json (salta quelle
già scaricate), una richiesta ogni ~1,5 s. Uso: python tools/notizie_storiche.py [anno_iniziale]"""
import datetime as D, json, os, re, sys, time, urllib.parse, urllib.request, html

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache", "prev", "news")
QUERIES = ["stock market", "Wall Street stocks"]
UA = {"User-Agent": "Mozilla/5.0 (research script)"}

def fetch(q, a, b):
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": f"{q} after:{a} before:{b}", "hl": "en-US", "gl": "US", "ceid": "US:en"})
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        x = r.read().decode("utf-8", "replace")
    items = re.findall(r"<item>(.*?)</item>", x, re.S)
    out = []
    for it in items:
        t = re.search(r"<title>(.*?)</title>", it, re.S); d = re.search(r"<pubDate>(.*?)</pubDate>", it)
        if t: out.append({"t": html.unescape(t.group(1)), "d": d.group(1) if d else ""})
    return out

def main():
    y0 = int(sys.argv[1]) if len(sys.argv) > 1 else 2019
    os.makedirs(OUT, exist_ok=True)
    d = D.date(y0, 1, 4); d -= D.timedelta(days=d.weekday())          # lunedì
    today = D.date.today(); n = 0
    while d + D.timedelta(days=7) <= today:
        f = os.path.join(OUT, d.isoformat() + ".json")
        if not os.path.exists(f):
            got, seen = [], set()
            for q in QUERIES:
                for k in range(3):
                    try:
                        for it in fetch(q, d.isoformat(), (d + D.timedelta(days=7)).isoformat()):
                            if it["t"] not in seen: seen.add(it["t"]); got.append(it)
                        break
                    except Exception as e:
                        time.sleep(10 * (k + 1))
                time.sleep(1.5)
            json.dump(got, open(f, "w", encoding="utf-8"), ensure_ascii=False)
            n += 1
            if n % 20 == 0: print(d, len(got), flush=True)
        d += D.timedelta(days=7)
    print("fatto", n, "settimane nuove")

if __name__ == "__main__":
    main()
