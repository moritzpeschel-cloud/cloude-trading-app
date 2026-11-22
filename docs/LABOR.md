# Strategie-Labor (18.11.2026) – warum der Bot so handelt, wie er handelt

**Daten:** Yahoo Finance, Stundenkerzen bis 2 Jahre (5.000–17.500 je Markt) und Tageskerzen 5 Jahre, 14 Märkte.
**Methode:** Lernphase = ältere 60 %, Prüfphase = neueste 40 % (beim Entwickeln nie benutzt). Entscheidungen nur auf der Lernphase.
**Kosten:** Spread, Kommission, Übernacht-Finanzierung (Krypto 20 % p.a., Metalle/Indizes 6 %, Devisen 3 % auf den Positionswert).
Skripte: `docs/lab.js` (Strategie-Familien), `docs/grid.js` (Parameter-Stabilität), `docs/port.js` (Gesamtkonto).

## Ergebnis der alten Regeln
Ø ca. **+0,02 R** je Trade über alle Märkte – praktisch Nullsumme. Ersetzt.

## Was einen Vorteil hat (und jetzt gehandelt wird)
| Strategie | Märkte | Lernphase | Prüfphase (ungesehen) |
|---|---|---|---|
| Trend-Rücksetzer, 1h, Tages-Trendfilter, Stop 2 ATR, Trailing 3,5 ATR | Gold, Silber, BTC, ETH | +0,16 R, PF 1,28 (667 Tr.) | +0,20 R, PF 1,39 (433 Tr.) |
| RSI-2-Rückkehr, Tag, nur Kauf über SMA 200, Ausstieg > SMA 5 | S&P 500, Nasdaq, DAX | +0,18 R, PF 3,1 (59 Tr.) | +0,07 R, PF 1,45 (68 Tr.) |

Trend-Rücksetzer: positiv in **allen 15** getesteten Parameter-Kombinationen (Stop 1,5–2,5 ATR, Trailing 2–4 ATR) – kein Glückstreffer.

## Was keinen Vorteil hat (nur Beobachtung)
* Devisen (EUR/GBP/JPY): gleiche Trendregel ≈ **+0,01 R** – kein Vorteil.
* Einzelaktien (Apple, NVIDIA, Microsoft, Tesla): uneinheitlich, in der Prüfphase meist negativ.
* 4h-Ausbruch (Turtle): Lern- und Prüfphase widersprechen sich – Zufall.

## Gesamtkonto (0,75 % Risiko je Trade, max. 4 offen, max. 2 je Gruppe, nach allen Kosten)
| | Zeitraum | Ergebnis | 10.000 € → | max. Rückgang | Gewinnmonate |
|---|---|---|---|---|---|
| Lernphase | 11/2024–12/2025 | +97 R | ≈ 19.300 € | 22 % | 10 / 14 |
| Prüfphase | 12/2025–11/2026 | +79 R | ≈ 16.800 € | 27 % | 6 / 12 |

**Einordnung:** Gold, Silber und Ethereum hatten in dieser Zeit starke Trends – Trendstrategien profitieren davon. In Seitwärtsphasen
ist deutlich weniger zu erwarten, Verlustserien von 10+ Trades sind bei ~30 % Trefferquote normal. Deshalb Standard-Risiko **0,5 %** je Trade.
Vergangene Ergebnisse garantieren nichts. Keine Anlageberatung.

---

# Runde 2 (22.11.2026): Forex, mehr Krypto, Filter, 10 Jahre Indizes

## Forex – 10 Paare, 5 Strategie-Familien (`docs/fx.js`)
EURUSD, GBPUSD, USDJPY, USDCAD, USDCHF, NZDUSD, EURJPY, GBPJPY, EURGBP, AUDJPY · nach Spread, Kommission, 3 % Finanzierung
| Strategie | Lernphase | Prüfphase |
|---|---|---|
| Tages-Trendfolge (Donchian 55/20) | −0,42 R | −0,55 R |
| RSI-2-Rückkehr Tag (beidseitig) | −0,01 R | +0,01 R |
| Bollinger-Rückkehr 4h (ADX < 20) | −0,08 R | −0,12 R |
| London-Ausbruch | −0,10 R | −0,13 R |
| Trend-Rücksetzer 1h | −0,12 R | −0,14 R |
**Ergebnis: keine profitable Forex-Strategie → Forex wird im Scanner angezeigt und beobachtet, aber nicht gehandelt.**

## Weitere Kryptos (`docs/improve.js coins`)
SOL, XRP, BNB, DOGE, ADA mit dem Trend-Rücksetzer: in der Lernphase ausgewählte Coins (XRP, BNB, ADA) fallen in der Prüfphase ab
(BNB −0,11 R); alle fünf zusammen Prüfphase ≈ +0,05 R → **zu schwach, nicht aufgenommen.**

## Filter für den Trend-Rücksetzer (`docs/improve.js`)
Analyst-Veto, ADX ≥ 20/25, Volatilitätsfilter, Uhrzeit (ohne Asien / nur EU+US), nur Kauf, Haltedauer 120/480 h:
**keiner verbessert Lern- UND Prüfphase verlässlich** → Regel bleibt unverändert (Prüfphase +0,26 R, PF 1,45 auf Gold/Silber/BTC/ETH).

## RSI-2 auf 11 Indizes, 10 Jahre (`docs/idx.js`)
Gesamt Lern (2016–22) −0,04 R / Prüf (2022–26) +0,06 R. Nur US-Indizes (S&P 500, Nasdaq, Dow Jones) in beiden Phasen ≥ 0;
DAX −0,14 R in der Lernphase. → **RSI-2 nur noch auf S&P 500, Nasdaq 100, Dow Jones, mit halbem Risiko. DAX nur Beobachtung.**

## Neue Schutzfunktionen
* **Verlust-Bremse:** ab 10 % Rückgang vom Equity-Hoch halbes Risiko, ab 20 % keine neuen Trades (Push-Mitteilung).
* **Leistungs-Check:** Live-Ø R gegen die Rückblick-Erwartung; Warnung, wenn nach ≥ 20 Trades mehr als ~2 Standardfehler darunter.
* Index-CFDs Mindestgröße 0,01 Lot (sonst wären Positionen bei 0,25 % Risiko nicht handelbar).
