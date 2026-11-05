# L'agente del controllo del portafoglio: come si allena

L'agente AI che controlla il portafoglio nell'app (Portafoglio → «controllo // agente», file `revisione.js`)
segue le istruzioni di **`GruzzoloDevAndroid/app/src/main/assets/agente.json`**:

- `system`: chi è e come risponde (JSON con sintesi, voto, strategia, azioni, rischi, prossimo controllo);
- `lezioni`: regole imparate dalle prove, aggiunte una alla volta;
- `modello`: il modello Claude usato (oggi `claude-sonnet-5-5`, con ragionamento e fino a 8.000 token di risposta).

L'app e le prove leggono lo stesso file: una lezione aggiunta qui vale subito anche nell'app (dopo la pubblicazione).

## Il giro di allenamento

1. **Casi** in `tools/agente_casi.json`: situazioni difficili, con dati nella stessa forma che manda l'app e le
   **attese** (regole che la risposta deve rispettare: niente vendite, vende X, cambia strategia, azioni ≤ N%,
   parla di…, al massimo N ordini, acquisti entro i soldi del mese, ecc.).
2. **Prova**: `ANTHROPIC_KEY=... python tools/agente_eval.py --giri 2` → punteggio e casi falliti, dettagli in
   `docs/agente_eval.md`, risposte grezze in `tools/cache/agente/`. La chiave sta solo nella variabile d'ambiente.
3. **Leggi le risposte sbagliate** e decidi: sbaglia l'agente (→ nuova lezione breve e generale) o è la prova
   troppo rigida (→ correggi l'attesa, scrivendo perché)?
4. **Rifai la prova**: tieni la lezione solo se il punteggio sale senza rompere altri casi. Alza `versione`.
5. **Pubblica**: `python tools/pubblica_agente.py "cosa è cambiato"` copia l'agente completo in `agenti/trader-gruzzolo/`
   e lo porta su GitHub (solo se la versione è salita e l'esame è tutto verde).

### Senza API (simulazione)
- `python tools/agente_eval.py --prompt tools/cache/agente/sim --casi id1,id2` scrive `_system.txt` e la domanda di ogni caso.
- Le risposte (JSON come le darebbe l'agente) vanno in `tools/cache/agente/sim/<id>.json`; poi
  `python tools/agente_eval.py --offline tools/cache/agente/sim` le valuta con le stesse regole.
- Serve a provare casi e lezioni nuove senza spendere; il giudizio vero resta quello con l'API (stesso modello dell'app).

### Previsioni e notizie
L'agente riceve anche `previsioni_allenamento` (da `assets/previsioni.json`, scritto da `tools/previsioni.py`) e
`notizie_recenti` (titoli con il tono), e risponde con il campo `previsioni` (lungo, medio, notizie, breve).
Con `"prev": true` nelle attese di un caso l'esame controlla che ci siano tutte, che il lungo abbia un intervallo,
che il giornaliero sia sconsigliato e che non ci siano certezze. Vedi `docs/previsioni.md`.

## Storia

| Versione | Lezioni | Casi | Risultato | Cosa è cambiato |
|---|---|---|---|---|
| 1 | 0 | 12 | 44/52 regole, 4/12 casi | 7 risposte vuote: il modello ragiona prima di rispondere e 2.000 token non bastavano → 8.000 (anche nell'app) |
| 1 | 0 | 12 | 112/115, 10/12 | ribilanciava un portafoglio da 1.480 € senza risparmio; i pesi esatti dei profili erano segnati come errore |
| 2 | 9 | 14 | 259/261, 26/28 | lezioni su basi prima dei pesi, portafogli piccoli, commissioni, tasse ETF, cali, orizzonte breve, IPO, prezzi; nuovi casi: commissioni piccole, IPO appena quotata |
| 3 | 10 | 14 | **264/264, 28/28** (2 giri) | lezione: se le azioni superano il massimo del test, vendita parziale minima anche pagando le tasse |
| 5 | 16 | 20 | 82/82 sui 6 casi nuovi (**simulazione senza API**) | lezione 16: rispettare il limite dei liquidi scelto dall'utente (`regole_utente.max_liquidi_al_mese_pct`), anche con il fondo emergenza vuoto; caso «limite_liquidi»; controllo `max_liq_pct` nell'esame |
| 4 | 15 | 19 | 70/70 sui 5 casi nuovi (**simulazione senza API**) | previsioni nella risposta (lungo, medio, notizie, breve) con i numeri veri dell'allenamento; lezioni su tassi base e CAPE, rischio a 1–6 mesi, notizie che raccontano il passato, niente day trading, niente leva o crypto; casi nuovi: panico da notizie, euforia e leva, day trading, previsione a 10 anni, VIX alto con fondo vuoto. Da rifare con l'API su tutti i 19 casi |

## Idee per i prossimi giri

- Casi con titoli in perdita (minusvalenze), con più conti, con stipendio variabile, con un obiettivo di casa tra 5 anni.
- Casi «trappola»: l'utente chiede di comprare crypto, leva, prodotti pre-IPO, o di vendere tutto dopo una notizia.
- Confronto tra modelli (`--modello claude-opus-5-5`) su qualità e costo.
- v5 con l'API su tutti i 20 casi (le lezioni nuove non devono rompere i 14 vecchi).
- Prove con i dati veri dell'utente (esportati dall'app, senza nomi).
