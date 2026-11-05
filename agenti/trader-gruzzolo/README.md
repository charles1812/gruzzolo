# trader-gruzzolo

Un **quant prudente** per un risparmiatore italiano con un portafoglio di ETF UCITS (MSCI World, mercati emergenti,
obbligazioni globali, liquidità). Riceve i numeri del portafoglio e del mese e risponde in JSON con:

- `sintesi`, `voto` (1–10), `strategia` (se cambiare i pesi e perché), `azioni` (compra/vendi/tieni in quote intere),
  `rischi`, `prossimo_controllo_giorni`;
- `previsioni`: `lungo` (10 anni, con intervallo), `medio` (1–6 mesi), `notizie` (cosa dicono e se cambiano qualcosa), `breve` (giorno per giorno).

Non fa ordini veri e non è consulenza: propone, l'utente decide.

## Cosa c'è qui
| File | Cosa |
|---|---|
| `agente.json` | istruzioni (`system`), **lezioni** imparate dalle prove, modello, versione |
| `previsioni.json` | numeri veri dell'allenamento sulle previsioni (10 anni dal 1881, rischio a 1 mese, notizie, trading giornaliero dopo le tasse) |
| `casi.json` | casi d'esame con le regole che la risposta deve rispettare |
| `esempi/` | risposte d'esempio ai casi più recenti |
| `usa_agente.py` | usarlo da solo, senza librerie: `python usa_agente.py dati.json` |
| `claude-code/trader-gruzzolo.md` | lo stesso agente come sotto-agente di Claude Code (ricerca e backtest) |
| `STORIA.md` | versioni, lezioni e risultati degli esami |

## Usarlo
1. **Nell'app Gruzzolo**: Portafoglio → controllo // agente. Con la chiave Anthropic nelle Impostazioni parte da solo; legge `agente.json` e `previsioni.json` dagli assets.
2. **Da solo**: `ANTHROPIC_API_KEY=... python usa_agente.py dati.json` (la forma dei dati: `python usa_agente.py --esempio`).
3. **In un'altra chat o strumento**: `python usa_agente.py --prompt` stampa le istruzioni complete da incollare come system prompt.
4. **In Claude Code**: copia `claude-code/trader-gruzzolo.md` in `.claude/agents/` del tuo progetto.

## Come si allena
Tutto nel repository del progetto:
- **Casi e lezioni** (`docs/agente.md`): `tools/agente_eval.py` mette l'agente alla prova sui casi. Con la chiave chiama l'API; **senza API** scrive le domande (`--prompt <cartella>`) e valuta risposte scritte su file (`--offline <cartella>`). Una lezione entra solo se l'esame migliora senza rompere altri casi.
- **Previsioni** (`docs/previsioni.md`): `tools/previsioni.py` allena e misura le regole di previsione sui dati veri (S&P 500 dal 1871 con CAPE, VIX dal 1990, SWDA dal 2009, notizie settimanali dal 2019), con anni di studio e anni d'esame separati. I numeri finiscono in `previsioni.json`.
- **Diario** (`docs/diario_previsioni.md`): `tools/diario_previsioni.py` scrive ogni giorno le previsioni e le vota quando scadono: l'allenamento sul futuro vero.
- **Pubblicare**: `python tools/pubblica_agente.py "cosa è cambiato"` (solo se la versione è salita e l'esame è tutto verde).

## Cosa ha imparato (in breve)
- **10 anni**: dal 1881 i 10 anni sono finiti in guadagno oltre l'inflazione 89 volte su 100; le valutazioni (CAPE) abbassano le attese ma non dicono quando uscire.
- **1–6 mesi**: nessuna regola indovina la direzione molto meglio di «come al solito»; sotto la media di 10 mesi il rischio di un mese brutto quadruplica → serve il fondo emergenza, non vendere.
- **Notizie**: raccontano la settimana appena passata e non prevedono le prossime.
- **Giorno per giorno**: dopo costi e tasse italiane il trading rende meno che tenere. E attenzione ai fusi orari: il VIX di stasera non si conosce alla chiusura di Milano.
