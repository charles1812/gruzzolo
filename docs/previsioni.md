# Previsioni: l'agente allenato senza API

> Generato da `tools/previsioni.py` il 05/11/2026. Dati veri, regole provate solo sul passato, giudicate su anni che l'agente non ha visto. **Non sono consigli**: servono a sapere quanto fidarsi di una previsione.

## Come si allena

1. **Dati**: S&P 500 dal 1871 con dividendi, inflazione e CAPE (Shiller, via datahub), S&P 500 e VIX giornalieri dal 1990 e SWDA dal 2009 (Yahoo), titoli di notizie settimanali dal 2019 (Google News).
2. **Regole candidate** per ogni livello (tendenza, valutazioni, paura, cali, notizie, giorno della settimana…). Ognuna fa le sue previsioni passo per passo usando **solo** quello che si sapeva in quel momento.
3. **Studio ed esame**: l'agente sceglie la regola migliore negli anni di studio; il voto vero è negli anni d'esame. La regola da battere è sempre «come al solito» (la frequenza storica).
4. **Punteggi**: *Brier skill* = di quanto la probabilità di «sale» è migliore di quella storica (0 = uguale, negativo = peggio); *azzeccate* = % di direzioni giuste; per il lungo periodo errore medio e intervalli all'80%.

## 1. Lungo periodo: 10 anni (S&P 500 reale, dividendi compresi)

Base dal 1881: i periodi di 10 anni sono stati in guadagno reale nel **89.0%** dei casi (sopra il 2% l'anno nel 82.7%); media +7.0% l'anno, peggiore -5.9%, migliore +20.0%.

| Regola | Studio (prima del 1990): errore medio | Esame (dal 1990): errore medio | Esame: correlazione | Esame: intervallo 80% centrato |
|---|---|---|---|---|
| come al solito (media storica) | 5.2 punti | 4.0 punti | -0.54 | 85.4% |
| valutazione (CAPE) ← scelta | 4.8 punti | 5.3 punti | +0.90 | 48.9% |
| ultimi 10 anni | 5.3 punti | 3.4 punti | +0.54 | 90.0% |

Ultimo CAPE disponibile (2023-09): **30.8**: con la regola della valutazione il rendimento reale atteso per i prossimi 10 anni è **+2.2% l'anno**, con 8 casi su 10 tra -4.0% e +8.2%.

## 2. Medio periodo: 1, 3 e 6 mesi (S&P 500 dal 1871, VIX dal 1990)

| Orizzonte | Regola | Studio: Brier skill | Esame (dal 1990): Brier skill | Esame: azzeccate |
|---|---|---|---|---|
| 1 mese | sopra/sotto la media di 10 mesi | +1.5% | +2.5% | 62.5% |
| 1 mese | su/giù negli ultimi 12 mesi | +1.1% | +2.9% | 63.9% |
| 1 mese | quanto è sotto il massimo | +0.3% | +0.7% | 62.3% |
| 1 mese | paura (VIX) | +0.0% | +2.7% | 63.4% |
| 1 mese | ultimo mese su/giù ← scelta | +3.5% | +1.8% | 59.5% |
| 1 mese | come al solito | +0.0% | +0.0% | 64.5% |
| 3 mesi | sopra/sotto la media di 10 mesi ← scelta | +1.7% | +4.4% | 66.9% |
| 3 mesi | su/giù negli ultimi 12 mesi | +0.3% | +4.0% | 71.7% |
| 3 mesi | quanto è sotto il massimo | -0.4% | +2.1% | 71.7% |
| 3 mesi | paura (VIX) | +0.0% | +5.2% | 70.5% |
| 3 mesi | ultimo mese su/giù | +1.0% | +1.5% | 71.7% |
| 3 mesi | come al solito | +0.0% | +0.0% | 71.7% |
| 6 mesi | sopra/sotto la media di 10 mesi | +1.1% | +5.9% | 73.6% |
| 6 mesi | su/giù negli ultimi 12 mesi | -0.6% | +3.7% | 75.4% |
| 6 mesi | quanto è sotto il massimo | -0.3% | -0.8% | 75.4% |
| 6 mesi | paura (VIX) | +0.0% | +6.0% | 73.8% |
| 6 mesi | ultimo mese su/giù ← scelta | +1.6% | +1.1% | 75.4% |
| 6 mesi | come al solito | +0.0% | +0.0% | 75.4% |

**Dove la tendenza aiuta davvero: il rischio.** Il mese dopo, a seconda di dove sta il prezzo rispetto alla media di 10 mesi (dal 1871):

| Situazione | Mesi | Media del mese dopo | Oscillazione | Mesi sotto −5% | Mesi in salita |
|---|---|---|---|---|---|
| sopra la media | 1188 | +0.93% | 3.4% | 3.4% | 62.7% |
| sotto la media | 671 | -0.31% | 5.0% | 12.7% | 48.1% |
| VIX <20 | 277 | +1.12% | 2.4% | — | 69.7% |
| VIX >=30 | 33 | -1.15% | 6.6% | — | 45.5% |

## 2b. Notizie e sentimento

6541 titoli in 400 settimane (2018-12-31 → 2026-10-26), sentimento con un dizionario di parole finanziarie (positive: rally, record, rebound…; negative: plunge, selloff, fears…).

- Sentimento e borsa **della stessa settimana**: correlazione **+0.45** (le notizie raccontano quello che è già successo).
- Sentimento e **settimana dopo**: +0.01; **4 settimane dopo**: +0.00.
- Regola «sentimento» (prevede la settimana dopo dal terzile del sentimento): Brier skill in esame (dal 2022-12-19) **-0.9%**, azzeccate 58.0%.
- Regola «contrario» (prevede la settimana dopo dal terzile del sentimento): Brier skill in esame (dal 2022-12-19) **-0.9%**, azzeccate 58.0%.
- Ultima settimana (2026-10-26): sentimento -0.11.

## 3. Giornaliero (day trading)

**S&P 500** (esame dal 2010)

| Regola | Studio: Brier skill | Esame: Brier skill | Esame: azzeccate |
|---|---|---|---|
| ieri su/giù | +0.01% | +0.08% | 54.5% |
| dopo un ±2% ← scelta | +0.04% | -0.00% | 54.5% |
| giorno della settimana | -0.18% | -0.06% | 54.5% |
| VIX salito ieri | -0.07% | -0.02% | 54.5% |
| sopra/sotto la media di 200 giorni | -0.14% | -0.01% | 54.5% |
| come al solito | +0.00% | +0.00% | 54.5% |

Trading con la regola scelta (fuori nei giorni che la regola dà almeno 1 punto peggiori del solito, 0,10% a ogni entrata o uscita): **+13.2% l'anno** prima delle tasse, **+7.4%** dopo le tasse (26% su ogni operazione chiusa in guadagno, perdite non compensabili), contro **+12.1%** tenendo e basta, **+10.4%** dopo le tasse pagate una volta alla fine. 200 entrate/uscite in 16.8 anni, dentro il 97.5% dei giorni.

**SWDA (MSCI World, euro)** (esame dal 2018)

| Regola | Studio: Brier skill | Esame: Brier skill | Esame: azzeccate |
|---|---|---|---|
| ieri su/giù | -0.12% | +0.09% | 55.9% |
| dopo un ±2% ← scelta | +0.04% | +0.02% | 55.9% |
| giorno della settimana | -0.26% | -0.14% | 55.9% |
| VIX salito ieri | +0.01% | -0.13% | 55.9% |
| sopra/sotto la media di 200 giorni | -0.38% | -0.02% | 55.9% |
| come al solito | +0.00% | +0.00% | 55.9% |

Trading con la regola scelta (fuori nei giorni che la regola dà almeno 1 punto peggiori del solito, 0,10% a ogni entrata o uscita): **+12.8% l'anno** prima delle tasse, **+10.5%** dopo le tasse (26% su ogni operazione chiusa in guadagno, perdite non compensabili), contro **+12.8%** tenendo e basta, **+10.5%** dopo le tasse pagate una volta alla fine. 0 entrate/uscite in 8.8 anni, dentro il 100.0% dei giorni.

**SWDA con il VIX della stessa sera (SBAGLIATO: sbircia il futuro)** (esame dal 2018)

| Regola | Studio: Brier skill | Esame: Brier skill | Esame: azzeccate |
|---|---|---|---|
| ieri su/giù | -0.12% | +0.09% | 55.9% |
| dopo un ±2% | +0.04% | +0.02% | 55.9% |
| giorno della settimana | -0.26% | -0.14% | 55.9% |
| VIX salito ieri ← scelta | +2.76% | +1.72% | 56.7% |
| sopra/sotto la media di 200 giorni | -0.38% | -0.02% | 55.9% |
| come al solito | +0.00% | +0.00% | 55.9% |

Trading con la regola scelta (fuori nei giorni che la regola dà almeno 1 punto peggiori del solito, 0,10% a ogni entrata o uscita): **+15.2% l'anno** prima delle tasse, **+3.3%** dopo le tasse (26% su ogni operazione chiusa in guadagno, perdite non compensabili), contro **+12.8%** tenendo e basta, **+10.5%** dopo le tasse pagate una volta alla fine. 1130 entrate/uscite in 8.8 anni, dentro il 58.8% dei giorni.


<!-- sotto: scritto a mano -->

## Cosa ha imparato l'agente (lezioni 11–15 in `assets/agente.json`)

| Livello | Cosa dicono i dati | Cosa fa l'agente |
|---|---|---|
| 10 anni | Dal 1881 i 10 anni finiscono in guadagno reale quasi 9 volte su 10. Il CAPE ordina bene i decenni (correlazione alta) ma dal 1990 ha sbagliato il livello: prevedeva troppo poco e il suo intervallo all'80% conteneva meno della metà dei casi | parte dai tassi base, dà sempre un intervallo largo, usa il CAPE solo per dire «aspettati meno», mai per uscire o aspettare |
| 1–6 mesi | Nessuna regola batte «come al solito» di più di qualche punto, e la regola migliore negli anni di studio non è la migliore all'esame. Sotto la media di 10 mesi i mesi sotto −5% sono 4 volte più frequenti | non prevede la direzione; usa tendenza e VIX per parlare di rischio e del fondo emergenza |
| Notizie | Il tono dei titoli va con la borsa della **stessa** settimana e quasi per niente con le settimane dopo; prevedere con il sentimento non batte la frequenza storica | cita le notizie per spiegare, non per decidere |
| Giorno | Le regole azzeccano il giorno dopo come dire sempre «sale». Con costi e tasse italiane (26% su ogni guadagno, perdite sugli ETF non compensabili) il trading rende meno che tenere | sconsiglia sempre il day trading; al massimo un 5% «gioco» fuori dal piano |

## Le trappole trovate durante l'allenamento
1. **Fuso orario**: su SWDA la regola «VIX salito» sembrava rendere +15% l'anno contro +13% tenendo. Era falso: il VIX chiude alle 22:15, Milano alle 17:30, quindi la regola usava il pomeriggio americano che a Milano non si conosce ancora. Con il VIX del giorno prima il vantaggio sparisce. Il rapporto mostra entrambe le versioni.
2. **Tasse fatte male**: togliere il 26% ogni anno anche a chi non vende penalizza il «tieni». Ora le tasse si pagano solo sulle operazioni chiuse, come in Italia, e chi tiene le paga una volta alla fine.
3. **Giorni fermi**: i festivi con prezzo uguale contavano come «scende». Ora non contano.
4. **Scegliere guardando l'esame**: l'agente sceglie la regola solo con gli anni di studio; spesso la migliore all'esame è un'altra. È proprio il segno che il vantaggio è fragile.

## Limiti
- Il lungo periodo è sull'S&P 500 (dati di Shiller): per gli ETF del mondo e degli emergenti le valutazioni sono diverse (di solito più basse).
- Il CAPE nei dati arriva a settembre 2023: le ultime righe del file hanno solo il prezzo.
- Le notizie sono titoli in inglese di Google News (10–20 a settimana) con un dizionario semplice: misura grossolana, ma è lo stesso tipo di notizie che l'app mostra.
- Nessuna previsione qui è un consiglio: servono a sapere **quanto fidarsi**.

## Come continuare ad allenarlo
1. `python tools/notizie_storiche.py 2019` (aggiunge solo le settimane nuove) e i prezzi aggiornati in `tools/cache/prev/` (Yahoo, `period1/period2`, intervallo `1d`).
2. `python tools/previsioni.py` → rapporto qui sopra e `assets/previsioni.json` per l'app.
3. `python tools/diario_previsioni.py` ogni giorno → `docs/diario_previsioni.md`: dopo qualche mese dirà se le previsioni del diario battono la moneta.
4. Se una regola nuova regge all'esame **e** nel diario, diventa una lezione in `agente.json` (versione +1), poi esame dei casi (`docs/agente.md`) e `python tools/pubblica_agente.py`.

Idee: regole di valutazione per il resto del mondo, inflazione e tassi (curva dei rendimenti), sentimento con un modello migliore del dizionario, orizzonte di 1 settimana.
