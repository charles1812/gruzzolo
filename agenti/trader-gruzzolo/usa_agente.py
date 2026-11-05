"""Usa l'agente trader-gruzzolo fuori dall'app: gli dai i dati del portafoglio (JSON) e risponde con il controllo.

  python usa_agente.py dati.json            → chiama l'API Anthropic (chiave nella variabile ANTHROPIC_API_KEY) e stampa la risposta
  python usa_agente.py --prompt             → stampa le istruzioni complete (system + lezioni) da usare in qualsiasi chat o strumento
  python usa_agente.py --esempio            → stampa un file di dati d'esempio (il primo caso d'esame)

Niente librerie esterne. I file accanto: agente.json (istruzioni, lezioni, modello), previsioni.json (numeri veri
dell'allenamento sulle previsioni), casi.json (casi d'esame). La forma dei dati è quella di esempi/ e casi.json."""
import json, os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
AG = json.load(open(os.path.join(HERE, "agente.json"), encoding="utf-8"))

def system():
    L = AG.get("lezioni") or []
    return AG["system"] + ("\n\nLezioni imparate dalle prove (rispettale):\n" + "\n".join(f"{i+1}. {l}" for i, l in enumerate(L)) if L else "")

def user(dati):
    p = os.path.join(HERE, "previsioni.json")
    if os.path.exists(p) and "previsioni_allenamento" not in dati:
        P = json.load(open(p, encoding="utf-8")); dati = dict(dati, previsioni_allenamento={k: P.get(k) for k in ("lungo", "medio", "notizie", "giorno")})
    return "Dati del portafoglio e del mese (euro):\n" + json.dumps(dati, ensure_ascii=False, indent=1)

def ask(dati):
    key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_KEY")
    if not key: sys.exit("Manca la chiave: imposta ANTHROPIC_API_KEY (non scriverla mai in un file)")
    body = json.dumps({"model": AG.get("modello", "claude-sonnet-5-5"), "max_tokens": 8000, "system": system(), "messages": [{"role": "user", "content": user(dati)}]}).encode()
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    j = json.load(urllib.request.urlopen(req, timeout=180))
    if j.get("stop_reason") == "refusal": sys.exit("Il modello ha rifiutato la richiesta")
    txt = "".join(b.get("text", "") for b in j["content"] if b["type"] == "text")
    a, z = txt.find("{"), txt.rfind("}")
    return json.loads(txt[a:z + 1]), j.get("usage", {})

if __name__ == "__main__":
    if len(sys.argv) < 2: sys.exit(__doc__)
    if sys.argv[1] == "--prompt": print(system()); sys.exit()
    if sys.argv[1] == "--esempio": print(json.dumps(json.load(open(os.path.join(HERE, "casi.json"), encoding="utf-8"))["casi"][0]["dati"], ensure_ascii=False, indent=1)); sys.exit()
    r, u = ask(json.load(open(sys.argv[1], encoding="utf-8")))
    print(json.dumps(r, ensure_ascii=False, indent=1)); print(f"\n(token: {u.get('input_tokens')} in, {u.get('output_tokens')} out)", file=sys.stderr)
