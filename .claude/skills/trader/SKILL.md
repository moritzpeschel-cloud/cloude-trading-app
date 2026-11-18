---
name: trader
description: Trader-Skill mit 11 Helfern (Scanner, Analyst, News, Kongress, Einstieg, Ausstieg, Time Machine, Risiko, Budget, Broker, Alarm). Nutzen, wenn der Nutzer einen Markt/ein Symbol analysieren, einen Trade-Plan (Ziel, Einstieg, Grenze, max. Verlust) oder Monte-Carlo-Quoten („Ziel zuerst / Grenze zuerst“) sehen oder den Markt scannen will.
---
# Trader-Skill

Dieses Repository enthält einen regelbasierten Trading-Bot (Paper-Trading) mit 11 Helfern. Für Analysen auf der Kommandozeile:

- `node bot/cli.js scan` – Rangliste aller Märkte der Watchlist mit erkannten Setups.
- `node bot/cli.js analyze <SYMBOL>` – alle 11 Helfer für ein Symbol: Trend je Zeitebene, Nachrichtenlage, Politiker-Trades, Einstieg, Ziel/Grenze, Time Machine (10.000 Monte-Carlo-Pfade + Rückblick auf dieselben Regeln), alle Risiko-Prüfungen und die Positionsgröße. `--json` liefert maschinenlesbar.
- `node bot/cli.js list` – verfügbare Symbole (z. B. XAUUSD, EURUSD, US500, NAS100, GER40, BTCUSD, AAPL, NVDA).

So antwortest du:
1. Führe `analyze` (bzw. `scan`) aus – erfinde nie Kurse, Quoten oder Schlagzeilen.
2. Fasse auf Deutsch zusammen: Setup + Richtung, Plan (Ziel / Einstieg / Grenze / max. Verlust), Time-Machine-Quoten, welche Risiko-Prüfungen bestanden/gescheitert sind.
3. Steht in der Ausgabe „SIMULIERT“, sage klar, dass es keine echten Kurse sind.
4. Schließe mit „Keine Anlageberatung“. Die CLI handelt nie; gehandelt wird nur im Paper-Konto des Servers.
