"""Allenamento dell'agente del controllo del portafoglio: lo mette alla prova su casi difficili e dà un punteggio.

Uso:  ANTHROPIC_KEY=... python tools/agente_eval.py [--modello claude-sonnet-5-5] [--casi id1,id2] [--giri 1]

- Istruzioni e lezioni: GruzzoloDevAndroid/app/src/main/assets/agente.json (le stesse che usa l'app, revisione.js).
- Casi: tools/agente_casi.json ('dati' come rvAiRequest(), 'attese' = regole da rispettare).
- Scrive il risultato in docs/agente_eval.md e le risposte grezze in tools/cache/agente/ (gitignored).
La chiave arriva solo dalla variabile d'ambiente ANTHROPIC_KEY: non va mai scritta in un file.

Allenare = guardare i casi che falliscono, scrivere una lezione breve e generale in agente.json («lezioni»),
rifare le prove e tenere la lezione solo se il punteggio sale senza rompere altri casi. Nuovi casi: agente_casi.json."""
import json, os, sys, time, re, argparse, urllib.request, concurrent.futures as cf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AG = os.path.join(ROOT, "GruzzoloDevAndroid", "app", "src", "main", "assets", "agente.json")
CASI = os.path.join(ROOT, "tools", "agente_casi.json")
OUT = os.path.join(ROOT, "docs", "agente_eval.md")
CACHE = os.path.join(ROOT, "tools", "cache", "agente")
ETF = {"SWDA": ("SWDA.MI", "iShares Core MSCI World", 0.20, 115.0), "EIMI": ("EIMI.MI", "iShares Core MSCI EM IMI", 0.18, 38.0),
       "AGGH": ("AGGH.MI", "iShares Core Global Aggregate Bond EUR Hedged", 0.10, 5.5), "XEON": ("XEON.MI", "Xtrackers EUR Overnight Rate Swap", 0.10, 147.0)}
PROFILI = {"Prudente": ({"SWDA": 22, "EIMI": 3, "AGGH": 50, "XEON": 25}, 3.6, -11, 4), "Moderato": ({"SWDA": 44, "EIMI": 6, "AGGH": 40, "XEON": 10}, 5.6, -25, 7),
           "Bilanciato": ({"SWDA": 62, "EIMI": 8, "AGGH": 25, "XEON": 5}, 7.0, -35, 9), "Dinamico": ({"SWDA": 75, "EIMI": 10, "AGGH": 15}, 8.1, -42, 11),
           "Aggressivo": ({"SWDA": 88, "EIMI": 12}, 9.1, -49, 13)}
EQ = ("SWDA", "EIMI")

def system_of(ag):
    L = ag.get("lezioni") or []
    return ag["system"] + ("\n\nLezioni imparate dalle prove (rispettale):\n" + "\n".join(f"{i+1}. {l}" for i, l in enumerate(L)) if L else "")

def user_of(dati):
    d = dict(dati)
    d.setdefault("etf_disponibili", {k: {"ticker": t, "nome": n, "ter": ter, "prezzo_eur": px} for k, (t, n, ter, px) in ETF.items()})
    d.setdefault("profili_storico_2004_oggi", {n: {"pesi": w, "rendimento_annuo": r, "calo_peggiore": m, "volatilita": v} for n, (w, r, m, v) in PROFILI.items()})
    return "Dati del portafoglio e del mese (euro):\n" + json.dumps(d, ensure_ascii=False, indent=1)

def call(system, user, model, key):
    body = json.dumps({"model": model, "max_tokens": 8000, "system": system, "messages": [{"role": "user", "content": user}]}).encode()
    for tent in range(3):
        try:
            req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
            j = json.load(urllib.request.urlopen(req, timeout=180))
            return "".join(b.get("text", "") for b in j["content"] if b["type"] == "text"), j.get("usage", {})
        except Exception as e:
            if tent == 2: raise
            time.sleep(3 + tent * 5)

def parse(txt):
    a, z = txt.find("{"), txt.rfind("}")
    return json.loads(txt[a:z + 1])

def norm_t(t):
    t = str(t).upper().strip()
    return t if "." in t or t in ("NVDA", "ANTH") else t + ".MI"

def check(caso, j):
    """regole generali + attese del caso → lista di (nome, ok, dettaglio)"""
    d, A, R = caso["dati"], caso.get("attese", {}), []
    ok = lambda n, c, info="": R.append((n, bool(c), info))
    az = [a for a in (j.get("azioni") or []) if isinstance(a, dict)]
    held = {p["ticker"] for p in d.get("posizioni", [])}
    allowed = {v[0] for v in ETF.values()} | held | set(A.get("allowed_extra", []))
    text = " ".join([str(j.get("sintesi", "")), " ".join(map(str, j.get("rischi") or [])), str((j.get("strategia") or {}).get("perche", "")), " ".join(str(a.get("motivo", "")) for a in az)]).lower()
    st = j.get("strategia") or {}
    # generali
    ok("campi", all(k in j for k in ("sintesi", "voto", "strategia", "azioni", "rischi", "prossimo_controllo_giorni")))
    ok("voto 1-10", isinstance(j.get("voto"), (int, float)) and 1 <= j["voto"] <= 10, j.get("voto"))
    ok("prossimo controllo 30-180", isinstance(j.get("prossimo_controllo_giorni"), (int, float)) and 30 <= j["prossimo_controllo_giorni"] <= 180, j.get("prossimo_controllo_giorni"))
    ok("ticker ammessi", all(norm_t(a.get("ticker")) in allowed for a in az), [a.get("ticker") for a in az])
    ok("quote intere", all(isinstance(a.get("quote"), int) and a["quote"] >= 0 for a in az), [a.get("quote") for a in az])
    if st.get("cambia"):
        w = st.get("pesi") or {}
        prof = any({k: v for k, v in w.items() if v} == pw for pw, *_ in PROFILI.values())   # i pesi esatti di un profilo vanno bene
        ok("pesi: somma 100 a passi di 5 (o un profilo)", sum(w.values()) == 100 and set(w) <= set(ETF) and (prof or all(isinstance(v, int) and v % 5 == 0 and v >= 0 for v in w.values())), w)
    px = {v[0]: v[3] for v in ETF.values()}
    for p in d.get("posizioni", []): px.setdefault(p["ticker"], p["valore_eur"] / max(1, p["quote"]))
    px.setdefault("ANTH", 78.0)
    buys = sum(a.get("quote", 0) * px.get(norm_t(a.get("ticker")), 0) for a in az if a.get("tipo") == "compra")
    sells = sum(a.get("quote", 0) * px.get(norm_t(a.get("ticker")), 0) for a in az if a.get("tipo") == "vendi")
    budget = (d.get("da_investire_questo_mese") or 0) + sells + ((d.get("riserva_ipo") or {}).get("da_parte_eur", 0) if isinstance(d.get("riserva_ipo"), dict) else 0)
    ok("acquisti entro i soldi del mese", buys <= budget * 1.06 + 1, f"compra {buys:.0f} € su {budget:.0f} €")
    vend = [a for a in az if a.get("tipo") == "vendi" and a.get("quote", 0) > 0]
    if vend: ok("vendite con le tasse spiegate", re.search(r"26|tass|plusvalen", text) is not None)
    # attese del caso
    eq_new = lambda: sum((st.get("pesi") or {}).get(k, 0) for k in EQ)
    eq_now = sum((d["strategia_attuale"]["pesi"]).get(k, 0) for k in EQ)
    if A.get("no_sell"): ok("nessuna vendita", not vend, [f"{a['quote']} {a['ticker']}" for a in vend])
    for t in A.get("must_sell", []): ok(f"vende {t}", any(norm_t(a["ticker"]) == t for a in vend))
    if A.get("must_change"): ok("cambia strategia", bool(st.get("cambia")))
    if A.get("must_not_change"): ok("non cambia strategia", not st.get("cambia"), st.get("pesi"))
    if "max_equity" in A:
        e = eq_new() if st.get("cambia") else eq_now
        ok(f"azioni ≤ {A['max_equity']}%", e <= A["max_equity"], e)
    for t in A.get("no_buy", []): ok(f"non compra {t}", not any(a.get("tipo") == "compra" and norm_t(a.get("ticker")) == t and a.get("quote", 0) > 0 for a in az))
    if A.get("no_buy_any"): ok("niente acquisti", not any(a.get("tipo") == "compra" and a.get("quote", 0) > 0 for a in az))
    if "must_buy_any" in A: ok("compra " + "/".join(A["must_buy_any"]), any(a.get("tipo") == "compra" and norm_t(a.get("ticker")) in A["must_buy_any"] and a.get("quote", 0) > 0 for a in az))
    if "max_sell_eur" in A: ok(f"vende al massimo {A['max_sell_eur']} €", sells <= A["max_sell_eur"], f"{sells:.0f} €")
    if "max_orders" in A: ok(f"al massimo {A['max_orders']} ordine/i", len([a for a in az if a.get("tipo") in ("compra", "vendi") and a.get("quote", 0) > 0]) <= A["max_orders"])
    for t, mx in A.get("max_buy_eur", {}).items(): ok(f"{t}: compra al massimo {mx} €", sum(a.get("quote", 0) * px.get(norm_t(a.get("ticker")), 0) for a in az if a.get("tipo") == "compra" and norm_t(a.get("ticker")) == t) <= mx)
    for grp in A.get("mention", []): ok("parla di " + "/".join(grp), any(g in text for g in grp))
    for f in A.get("forbid_text", []): ok("non dice «" + f + "»", f not in text)
    if "max_voto" in A: ok(f"voto ≤ {A['max_voto']}", isinstance(j.get("voto"), (int, float)) and j["voto"] <= A["max_voto"], j.get("voto"))
    if "min_voto" in A: ok(f"voto ≥ {A['min_voto']}", isinstance(j.get("voto"), (int, float)) and j["voto"] >= A["min_voto"], j.get("voto"))
    return R

def run_case(caso, system, model, key, giro):
    t0 = time.time()
    try:
        txt, us = call(system, user_of(caso["dati"]), model, key)
        os.makedirs(CACHE, exist_ok=True); open(os.path.join(CACHE, f"{caso['id']}_{giro}.json"), "w", encoding="utf-8").write(txt)
        j = parse(txt); R = check(caso, j)
    except Exception as e:
        j, R, us = {}, [("risposta valida (JSON)", False, str(e)[:160])], {}
    return caso, j, R, time.time() - t0, us

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--modello"); ap.add_argument("--casi"); ap.add_argument("--giri", type=int, default=1)
    a = ap.parse_args(); key = os.environ.get("ANTHROPIC_KEY")
    if not key: sys.exit("Manca ANTHROPIC_KEY")
    ag = json.load(open(AG, encoding="utf-8")); casi = json.load(open(CASI, encoding="utf-8"))["casi"]
    if a.casi: casi = [c for c in casi if c["id"] in a.casi.split(",")]
    model = a.modello or ag.get("modello", "claude-sonnet-5-5"); system = system_of(ag)
    jobs = [(c, g) for g in range(a.giri) for c in casi]
    with cf.ThreadPoolExecutor(6) as ex: res = list(ex.map(lambda x: run_case(x[0], system, model, key, x[1]), jobs))
    tot = sum(len(R) for _, _, R, _, _ in res); good = sum(ok for _, _, R, _, _ in res for _, ok, _ in R)
    perfect = sum(all(ok for _, ok, _ in R) for _, _, R, _, _ in res)
    tin = sum(u.get("input_tokens", 0) for *_, u in res); tout = sum(u.get("output_tokens", 0) for *_, u in res)
    L = [f"# Allenamento dell'agente: risultato", "", f"Agente v{ag.get('versione')} · {len(ag.get('lezioni') or [])} lezioni · modello {model} · {time.strftime('%d/%m/%Y %H:%M')}", "",
         f"**{good}/{tot} regole rispettate ({good/max(1,tot)*100:.0f}%) · {perfect}/{len(res)} casi perfetti** · {tin} token in, {tout} out", ""]
    for c, j, R, dt, _ in res:
        bad = [r for r in R if not r[1]]
        L.append(f"## {'✅' if not bad else '❌'} {c['id']} ({sum(r[1] for r in R)}/{len(R)}, {dt:.0f} s)")
        L.append(f"_{c['descrizione']}_"); L.append("")
        if j: L.append(f"> {j.get('sintesi','')}  \n> voto {j.get('voto')} · cambia strategia: {(j.get('strategia') or {}).get('cambia')} {(j.get('strategia') or {}).get('pesi') if (j.get('strategia') or {}).get('cambia') else ''} · azioni: " + ", ".join(f"{x.get('tipo')} {x.get('quote')} {x.get('ticker')}" for x in (j.get('azioni') or [])))
        for n, ok, info in bad: L.append(f"- ❌ {n}" + (f" — {info}" if info not in ("", None) else ""))
        L.append("")
    os.makedirs(os.path.dirname(OUT), exist_ok=True); open(OUT, "w", encoding="utf-8").write("\n".join(L))
    print(f"{good}/{tot} regole ({good/max(1,tot)*100:.0f}%), {perfect}/{len(res)} casi perfetti, token {tin}+{tout}")
    for c, j, R, dt, _ in res:
        bad = [r for r in R if not r[1]]
        print(("OK  " if not bad else "NO  ") + c["id"], "; ".join(f"{n} [{str(i)[:90]}]" for n, _, i in bad))

if __name__ == "__main__": main()
