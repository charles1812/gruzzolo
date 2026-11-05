# Gruzzolo: come è fatto, cosa c'è, cosa manca

> Punto di partenza del progetto. **Si aggiorna a ogni modifica** (vedi `CLAUDE.md`): cosa è cambiato va in
> «Storia», le cose nuove da fare in «Da fare». Gli altri documenti in `docs/` sono gli approfondimenti.

## Cos'è
App Android personale (WebView, pacchetto `it.gruzzolo.dev`) che tiene insieme **budget del mese** e **investimenti**:
- dice quanto si può spendere ogni giorno e quanto mettere da parte;
- guida gli acquisti di ETF (quote intere verso i pesi della strategia), con il Replay di Fineco che compra da solo;
- controlla il portafoglio (agente AI con la chiave Anthropic, altrimenti sistema integrato).

Non fa ordini veri: gli acquisti e le vendite li fa l'utente dalla sua banca.

## Le schede
| Scheda | Cosa c'è |
|---|---|
| 01 Budget | soldi che restano, i quattro budget (Tempo libero, Weekend, Spesa, Ricorrenti), spese dalle notifiche di Google Wallet e dagli SMS Fineco, prestiti, primo mese |
| 02 Portafoglio | valore, **un solo grafico in cima** (sfera con il tastino «legenda», monete o altri 8), posizioni, serbatoio del mese, **📋 Cosa comprare** (mese per mese: ✋ tu, 🔁 Replay, 🛟 conto), Replay (riga che si apre), Piano (metodo in 7 passi, strategia bloccata, tasto **🤖 Agente e dati**, riserva IPO), idee, Follia, notizie |
| Agente e dati | pagina a parte (`page-agente`, dal tasto nel Portafoglio): controllo dell'agente con i consigli in frasi, previsioni, e con la strategia bloccata rischio, backtest, previsione, confronto e regole |
| ＋ | aggiungi spesa / entrata / prestito |
| 03 Sfide | sfide di risparmio |
| 04 Dati | costo della vita (Eurostat, carburanti), i miei dati |

## Come funziona il Portafoglio (il cuore)
1. **Budget → mese**: `modePlan(B.mode).save` = quanto mettere da parte (le rate dei prestiti si prendono dal tempo libero o dal risparmio con `B.loanSplit`).
2. **Strategia** (`strategia.js`): profilo 1–5 o «Su misura» (pesi di SWDA, EIMI, AGGH, XEON). Si **conferma** e resta **bloccata** (`PL.locked`); si cambia solo dal serbatoio → «⚙️ Cambia strategia».
3. **Serbatoio del mese** (`forziere.js`, `potHtml`): fondo emergenza (`fundShare`: Prudente 70% … Aggressivo 0%), riserva IPO (`ipo.js`), il resto in ETF. **Limite dei liquidi** scelto nel test del rischio (`PL.ans.maxLiq`, `liqCap()`): fondo + XEON + riserva IPO non superano quella parte del risparmio. Proposta di quote intere (`invCands`/`invPropose`) con − e +, «Ho comprato». Sotto: «📋 Cosa comprare» (`buyHtml`/`fcSim` in `metodo.js`).
4. **Replay** (sezione `#rpSec`): cosa compra da solo, se è in linea con la strategia (`pnReplayFor`), quanto resta a mano. Il giorno del Replay le quote entrano da sole (`replayAutoApply`).
5. **Controllo** (`revisione.js`): parte da solo (`rvAuto` in `metodo.js`) quando è ora o quando cambia la strategia. Con la chiave lo fa l'agente AI (istruzioni e lezioni in `assets/agente.json`), senza chiave il sistema integrato (`rvBuiltin`). Costi AI stimati in Impostazioni (`aiCostLog`, `store "aiCost"`).
6. **Grafico in cima** (`strategia-viz.js`, `strategia-viz2.js`): registro `VZ_MODES`; la sfera ha spicchi per fondo, anello pieno = oggi, tratteggiato = obiettivo, legenda sempre visibile (`VZ_LEG`).

## File principali (in `GruzzoloDevAndroid/app/src/main/assets/`)
| File | Ruolo |
|---|---|
| `index.html` | pagine, impostazioni, prezzi (Yahoo), Replay, AI (`aiComplete`), avvio |
| `budget.js`, `budget.css`, `budgetfx.js` | Budget, cicli dello stipendio, prestiti, notifiche |
| `piano.js` | `ASSETS`, `PROFILES`, `HIST` (storico.json), Monte Carlo, `planCompute`, test del rischio |
| `piano2.js` | Piano (link al Budget, `pnReplayFor`) |
| `strategia.js` | strumento Strategia (backtest, previsione, confronto, regole) |
| `strategia-viz.js`, `strategia-viz2.js` | i 10 grafici, macchina del tempo |
| `forziere.js` | monete, serbatoio del mese, acquisti, Replay automatico |
| `revisione.js` | controllo del portafoglio (agente AI / integrato) |
| `ipo.js` | riserva per le quotazioni (Anthropic, OpenAI, SpaceX…) |
| `metodo.js` | costi AI, sezione Replay, blocco strategia, controllo automatico, metodo in 7 passi, prossimi 12 mesi, previsioni nel controllo |
| `agente.json` | istruzioni, lezioni e modello dell'agente AI (letto dall'app e dalle prove) |
| `previsioni.json` | numeri dell'allenamento sulle previsioni (scritto da `tools/previsioni.py`), mostrati nel controllo e mandati all'agente |
| `hud*.css/js` | grafica HUD (skill `grafica-app`) |

Motore sul server (`server/motore/`, PHP + cron notturno): segnali, Monte Carlo, notizie (Google News RSS), costo della vita. L'indirizzo sta in `assets/config.local.json` (gitignored).

## Compilare, provare, pubblicare
- **Build**: JDK 21 (Adoptium) + Gradle 8.7 → `gradle assembleDebug` in `GruzzoloDevAndroid/`. Firma fissa in `keystore/` (mai rigenerarla).
- **Prove sull'emulatore** (`Medium_Phone_API_37.0`, condiviso: prima `adb shell dumpsys activity activities | grep topResumedActivity`): `tools/fulltest.py`, `usertest.py`, `strategiatest.py`, altre in `tools/`. WebView via CDP: `adb forward tcp:9334 localabstract:webview_devtools_remote_<pid>`.
- **Prove nel browser**: assets serviti in locale con `web/demo-native.js` (versione pubblica), Chrome headless.
- **Pubblicare**: `cp app-debug.apk dist/GruzzoloDev-budget.apk` → `python tools/pubblica_apk.py "nota"` (l'app propone «Aggiorna»).
- **Copia pubblica**: `python tools/esporta_pubblico.py` → commit e push in `../gruzzolo-public` (si ferma se trova dati privati).

## Agente AI e ricerca
- **`agenti/trader-gruzzolo/`**: l'agente completo e riutilizzabile (istruzioni, lezioni, casi, numeri delle previsioni, esempi, `usa_agente.py`, versione per Claude Code, storia). Si pubblica qui e su GitHub con `python tools/pubblica_agente.py "nota"` dopo ogni allenamento riuscito.
- `docs/agente.md`: come si allena l'agente del controllo (casi, prova con la chiave o simulazione senza API, lezioni).
- `docs/previsioni.md`: allenamento **senza API** sulle previsioni (lungo, medio, giornaliero) con dati veri: S&P 500 dal 1871 con CAPE, VIX dal 1990, SWDA dal 2009, notizie settimanali dal 2019 (`tools/previsioni.py`, `tools/notizie_storiche.py`).
- `docs/diario_previsioni.md`: previsioni di ogni giorno votate quando scadono (`tools/diario_previsioni.py`).
- `docs/backtest.md`, `docs/satellite.md`: ricerca sulle strategie (momentum con tasse italiane non conviene).
- Agenti di Claude Code: `.claude/agents/trader-gruzzolo.md` (ricerca e strategie), `tester-gruzzolo.md` (prove).

## Regole
- La chiave Anthropic non va mai nei file: nell'app la mette l'utente nelle Impostazioni; nelle prove solo in variabile d'ambiente `ANTHROPIC_KEY`.
- Niente dati privati (nomi, indirizzi del server, gist, token) nei file che vanno nella copia pubblica.
- Gruzzolo e Schiscetta non comunicano (dal 17/10/2026).
- Niente codici o impostazioni da far inserire all'utente: si preconfigura tutto.

## Storia (le tappe; il dettaglio è in `git log`)
| Data | Versione | Cosa |
|---|---|---|
| 15/10/2026 | — | Budget + investimenti nella stessa app; forziere 3D con le monete |
| 16/10/2026 | — | aggiornamenti dall'app, Piano rifatto, notifiche, prove sull'emulatore |
| 17–20/10/2026 | — | indipendenza da Schiscetta, budget a quattro, weekend, abbonamenti, notizie |
| 23/10/2026 | — | copia pubblica su GitHub |
| 04/11/2026 | — | grafica HUD, prestiti e mutui, Strategia (backtest dal 2004), agente trader-gruzzolo |
| 05/11/2026 | 1242–1333 | 8 grafici della strategia, controllo dell'agente AI, Piano dentro il Portafoglio, riserva IPO, agente allenato (264/264 regole) |
| 05/11/2026 | 1458 | Replay in una sezione, strategia bloccata, controllo automatico + costi AI, prossimi 12 mesi, metodo in 7 passi, sfera a spicchi con legenda, + e − sempre attivi |
| 05/11/2026 | 1554–1600 | Portafoglio più ordinato: legenda e Replay come tastini, «Cosa comprare» mese per mese, pagina «Agente e dati», consigli dell'agente in frasi, limite dei liquidi nel test (rifare il test non cambia la strategia bloccata); agente v5 (regola dei liquidi) |
| 05/11/2026 | 1539 | agente v4 allenato senza API su previsioni e notizie (lungo, medio, giornaliero, dati veri dal 1871), previsioni nel controllo dell'app, diario delle previsioni, cartella `agenti/` pubblicata su GitHub, `docs/PROGETTO.md` e `CLAUDE.md` |

## Da fare / idee
- Allenare ancora l'agente: casi con minusvalenze, richieste «trappola» (crypto, leva, pre-IPO), confronto Sonnet/Opus (`docs/agente.md`).
- Diario delle previsioni: farlo girare ogni giorno (a mano o con un'attività pianificata) e rileggere il punteggio dopo 1, 3 e 12 mesi.
- Agente v5 con l'API su tutti i 20 casi: v4 e v5 sono state provate solo in simulazione sui 6 casi nuovi.
- Previsioni per gli ETF europei (SWDA, EIMI) e non solo per l'S&P 500; valutazioni del resto del mondo (CAPE non USA).
- Portare nell'app le previsioni che reggono alla prova (oggi: solo intervalli di lungo periodo e avvisi di rischio, niente segnali giornalieri).
- Sfera sull'emulatore: a qualità ridotta lo spicchio più piccolo si vede poco.
