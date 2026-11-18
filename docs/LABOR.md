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
