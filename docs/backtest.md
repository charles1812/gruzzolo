# Backtest del Piano — dati 2004-01 → 2026-09 (273 mesi, rendimenti totali in EUR)

Serie: Rendimenti mensili totali in EUR. Proxy prima della nascita degli ETF: SWDA <2009-11 = 50% SPY + 50% EFA in EUR; EIMI <2014-09 = EEM in EUR; AGGH <2017-12 = IEAG (aggregate euro), <2009-05 = AGG senza cambio; XEON <2008-02 = 2,5% annuo.

## 1. Profili a pesi fissi (1 € investito subito, ribilanciato ogni mese)

| Profilo | Rend. annuo | Volatilità | Calo massimo | Anno peggiore | Anno migliore |
|---|---|---|---|---|---|
| Prudente | 3.6% | 4.1% | -11.0% | -10.2% | 13.8% |
| Moderato | 5.6% | 6.8% | -25.3% | -19.0% | 21.6% |
| Bilanciato | 7.0% | 9.1% | -35.4% | -26.6% | 28.9% |
| Dinamico | 8.1% | 10.9% | -42.2% | -32.0% | 36.0% |
| Aggressivo | 9.1% | 12.7% | -48.7% | -37.4% | 43.3% |

## 2. PAC su tutte le finestre storiche (strategia «versamenti»)

Valore finale diviso versato. «Perdita» = finestre che finiscono sotto il versato. «Peggior momento» = il punto più basso valore/versato durante la finestra.

| Profilo | Anni | Finestre | Peggiore | 10° perc. | Mediana | Rend. annuo mediano | In perdita | Peggior momento |
|---|---|---|---|---|---|---|---|---|
| Prudente | 3 | 238 | 0.93 | 0.99 | 1.06 | 3.7% | 11% | -8% |
| Prudente | 5 | 214 | 0.98 | 1.02 | 1.09 | 3.4% | 3% | -8% |
| Prudente | 10 | 154 | 1.08 | 1.12 | 1.22 | 3.9% | 0% | -8% |
| Prudente | 15 | 94 | 1.21 | 1.24 | 1.33 | 3.7% | 0% | -8% |
| Moderato | 3 | 238 | 0.82 | 1.00 | 1.09 | 5.9% | 11% | -19% |
| Moderato | 5 | 214 | 0.87 | 1.03 | 1.16 | 5.8% | 5% | -19% |
| Moderato | 10 | 154 | 1.21 | 1.26 | 1.37 | 6.1% | 0% | -19% |
| Moderato | 15 | 94 | 1.43 | 1.50 | 1.59 | 5.9% | 0% | -19% |
| Bilanciato | 3 | 238 | 0.73 | 1.00 | 1.12 | 7.5% | 10% | -27% |
| Bilanciato | 5 | 214 | 0.79 | 1.00 | 1.22 | 7.8% | 10% | -27% |
| Bilanciato | 10 | 154 | 1.27 | 1.38 | 1.50 | 7.9% | 0% | -27% |
| Bilanciato | 15 | 94 | 1.52 | 1.66 | 1.84 | 7.7% | 0% | -27% |
| Dinamico | 3 | 238 | 0.67 | 0.98 | 1.15 | 9.0% | 11% | -33% |
| Dinamico | 5 | 214 | 0.73 | 0.98 | 1.26 | 9.2% | 13% | -33% |
| Dinamico | 10 | 154 | 1.29 | 1.44 | 1.60 | 9.1% | 0% | -33% |
| Dinamico | 15 | 94 | 1.60 | 1.77 | 2.06 | 9.0% | 0% | -33% |
| Aggressivo | 3 | 238 | 0.61 | 0.96 | 1.16 | 10.1% | 12% | -39% |
| Aggressivo | 5 | 214 | 0.66 | 0.95 | 1.30 | 10.5% | 13% | -39% |
| Aggressivo | 10 | 154 | 1.30 | 1.48 | 1.71 | 10.4% | 0% | -39% |
| Aggressivo | 15 | 94 | 1.65 | 1.87 | 2.30 | 10.3% | 0% | -39% |

## 3. Strategie di gestione del PAC

Intero periodo (1 €/mese) e mediana sulle finestre di 10 anni. Tasse 26% sulle plusvalenze quando si vende.

| Profilo | Strategia | Finale/versato (tutto) | Calo massimo | Tasse pagate | Mediana 10 anni | Peggiore 10 anni | Scarto medio dai pesi |
|---|---|---|---|---|---|---|---|
| Moderato | versamenti | 2.19 | -10.1% | 0.0% del versato | 1.36 | 1.22 | 3.3 punti |
| Moderato | quote fisse | 2.49 | -11.3% | 0.0% del versato | 1.40 | 1.24 | 10.7 punti |
| Moderato | annuale | 1.81 | -11.8% | 5.7% del versato | 1.35 | 1.21 | 1.5 punti |
| Moderato | soglia 5 | 2.06 | -10.0% | 3.2% del versato | 1.36 | 1.22 | 1.7 punti |
| Bilanciato | versamenti | 2.74 | -15.0% | 0.0% del versato | 1.49 | 1.29 | 2.3 punti |
| Bilanciato | quote fisse | 3.04 | -14.4% | 0.0% del versato | 1.53 | 1.28 | 8.8 punti |
| Bilanciato | annuale | 2.42 | -15.6% | 5.2% del versato | 1.49 | 1.28 | 1.2 punti |
| Bilanciato | soglia 5 | 2.69 | -15.0% | 1.8% del versato | 1.49 | 1.30 | 1.5 punti |
| Dinamico | versamenti | 3.23 | -21.4% | 0.0% del versato | 1.60 | 1.32 | 1.2 punti |
| Dinamico | quote fisse | 3.44 | -21.6% | 0.0% del versato | 1.62 | 1.31 | 6.1 punti |
| Dinamico | annuale | 3.04 | -22.0% | 3.0% del versato | 1.60 | 1.31 | 0.8 punti |
| Dinamico | soglia 5 | 3.23 | -21.4% | 0.0% del versato | 1.60 | 1.32 | 1.2 punti |
| Aggressivo | versamenti | 3.83 | -30.1% | 0.0% del versato | 1.71 | 1.34 | 0.5 punti |
| Aggressivo | quote fisse | 3.85 | -30.7% | 0.0% del versato | 1.71 | 1.33 | 2.9 punti |
| Aggressivo | annuale | 3.76 | -30.3% | 1.1% del versato | 1.71 | 1.33 | 0.4 punti |
| Aggressivo | soglia 5 | 3.83 | -30.1% | 0.0% del versato | 1.71 | 1.34 | 0.5 punti |

## 4. Questionario attuale: combinazioni di risposte

Combinazioni: 2304. Profili assegnati: Prudente 606, Moderato 860, Bilanciato 576, Dinamico 254, Aggressivo 8

Incoerenze: in 920 combinazioni (40%) il profilo ha avuto storicamente un calo massimo più grande di 5 punti oltre quello dichiarato sopportabile.
In 14 combinazioni chi dice «vendo tutto» dopo un -30% riceve Dinamico o Aggressivo.

## 5. Questionario nuovo: combinazioni di risposte

Combinazioni: 300. Profili assegnati: Prudente 108, Moderato 111, Bilanciato 65, Dinamico 12, Aggressivo 4

Profilo più rischioso del portafoglio scelto dalla persona: 0 combinazioni (deve essere 0).
Chi dice «vendo tutto» con più di Moderato: 0 (deve essere 0).
Combinazioni in cui, sull'orizzonte dichiarato, la finestra storica peggiore del profilo assegnato perde più del 25% del versato: 0.
