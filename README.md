# Cloude Trading – Trader-Skill mit 11 Helfern

Ein regelbasierter Trading-Bot mit **11 spezialisierten Helfern** und einem modernen Dashboard (PWA fürs iPhone und den Desktop).
Der Bot handelt in einem **Paper-Konto** (kein echtes Geld). **Keine Anlageberatung.**

```
           ┌──────────── TRADER · SKILL (Kern) ────────────┐
 Kongress   Analyst   Budget   Broker
        Risiko   Time Machine   Alarm
 Scanner    News     Einstieg  Ausstieg
```

## Die 11 Helfer (Reihenfolge im Zyklus, alle 60 s)

| Helfer | Aufgabe |
|---|---|
| **Scanner** | Durchsucht alle Märkte der Watchlist nach drei Setups: *Trend-Rücksetzer* (EMA-20-Test im intakten Trend), *Ausbruch* aus enger Spanne (Bollinger-Squeeze + 20-Kerzen-Hoch/-Tief) und *Rückkehr zur Mitte* (Überdehnung ohne Trend). |
| **Analyst** | Trend auf 1 h / 4 h / Tag (EMA 20/50, Steigung, RSI, MACD), Marktphase über ADX, Unterstützung/Widerstand aus Swing-Punkten. |
| **News** | Schlagzeilen (Yahoo-Finance-RSS) mit Finanz-Wörterbuch (EN/DE) bewertet, Halbwertszeit 12 h, Eilmeldungen < 90 Min. Ohne Verbindung werden **keine** Schlagzeilen erfunden. |
| **Kongress** | Aktien-Trades von US-Abgeordneten (STOCK-Act, Netto-Kauf/-Verkauf 90 Tage). Benötigt `QUIVER_API_KEY` oder eine eigene JSON-Quelle `CONGRESS_URL` – sonst neutral. |
| **Einstieg** | Wertet nur abgeschlossene Kerzen aus, läuft dem Kurs nicht hinterher: zu weit gelaufen → Limit-Order am Rücksetzer (6 h gültig). |
| **Ausstieg** | Grenze hinter der Struktur (Swing ± 0,2 ATR, 0,8–3 ATR), Ziel 2 R (bzw. Bandmitte), prüft Hindernisse vor dem Ziel. Managt offene Trades: Einstand ab +1 R, Trailing-Stop ab +1,5 R, Zeit-Ausstieg, Ausstieg bei Trendwechsel. |
| **Time Machine** | **10.000 Monte-Carlo-Zukünfte** aus echten vergangenen Kerzen (Block-Bootstrap, Volatilität aufs aktuelle Niveau skaliert, Drift entfernt): *Ziel zuerst / Grenze zuerst / keins bis Schluss*. Dazu ein **Rückblick**: dieselben Regeln auf der Historie (inkl. Spread). Beides wird zu einem Erwartungswert in R gemischt. |
| **Risiko** | 12 harte Prüfungen, jede kann stoppen: Not-Aus, Handelszeit, Tageslimit, max. Positionen, 1 Trade je Markt, Klumpenrisiko je Gruppe, nicht gegen den großen Trend, keine Gegen-Eilmeldung, Chance/Risiko & Hindernis, Spread-Kosten, Erwartungswert, Regeln historisch profitabel. |
| **Budget** | Positionsgröße = Risiko-€ ÷ Abstand zur Grenze, gedeckelt durch ¼-Kelly und max. Hebel, auf das Lot-Raster abgerundet. |
| **Broker** | Paper-Konto in EUR: Spread, Slippage, Kommission, Kurslücken zum schlechteren Kurs, Limit-Orders mit Verfall. |
| **Alarm** | Kurs-Alarme, „nahe an der Grenze“, Tageslimit fast erreicht, Eilmeldungen, starke Bewegungen → Web-Push aufs Handy. |

Optional prüft **Claude als KI-Prüfer** (`ANTHROPIC_API_KEY`, Schalter im Dashboard) jede fertige Order und kann mit Begründung ein Veto einlegen.

## Dashboard
* **Cockpit** – leuchtender Skill-Kern mit den 11 Helfer-Robotern auf der Bühne (Status-LED, Strahl zum Kern bei jeder Meldung, Antippen = Details), Kennzahlen, Trade-Plan (Ziel / Einstieg / Grenze / max. Verlust + Gesamtnote), Risiko-Prüfungen, Time-Machine-Bullauge, offene Trades, Journal.
* **Märkte** – Scanner-Tabelle mit Sparklines, Kerzen-Chart mit Plan-Linien und Analyse aller 11 Helfer für jedes Symbol.
* **Time Machine** – 10.000 Pfade, 5–95-%-Bänder, Ergebnis-Verteilung, Rückblick-Kurve.
* **Trades** – Kontoverlauf, Statistik, offene/geschlossene Trades, Journal mit Begründung jeder Entscheidung.
* **Mehr** – Auto-Trading, Not-Aus, KI-Prüfer, Risiko-Regeln (Schieberegler), Kurs-Alarme, Web-Push, MT5-Box-Bot, Konto-Reset.

## Kursdaten
Live-Kurse von Yahoo Finance (ohne Key). Ist die Quelle nicht erreichbar, läuft ein realistischer **Simulator** – das Dashboard zeigt dann deutlich „SIMULIERTE KURSE“. `DATA_SOURCE=live|sim` erzwingt eine Quelle.

## Auf Render
Wie bisher (`render.yaml`, Free Plan, Start `node server.js`, Health Check `/healthz`). Variablen:

| Variable | Pflicht | Zweck |
|---|---|---|
| `API_TOKEN`, `VIEW_PIN` | ja | Push-Token / Anzeige-PIN |
| `ANTHROPIC_API_KEY` | nein | KI-Prüfer (Claude) |
| `QUIVER_API_KEY` / `CONGRESS_URL` | nein | Kongress-Helfer |
| `WATCHLIST` | nein | z. B. `XAUUSD,EURUSD,NVDA` |
| `DATA_DIR` | nein | Speicherort Paper-Konto (Standard `/tmp/cloude-skill`) |
| `ENGINE=off` | nein | Engine abschalten (nur MT5-Box-Bot anzeigen) |
| `BOX_BOT=1` | nein | Ausfall-Alarm nur für den externen MT5-Bot |

> **Render Free:** `/tmp` wird bei jedem Neustart geleert → das Paper-Konto beginnt dann neu. Für einen dauerhaften Verlauf eine Render-Disk mounten und `DATA_DIR` darauf zeigen lassen.

Der bisherige MT5-Bot auf der Box funktioniert unverändert weiter (`POST /api/update`, `/api/event`, Telegram-Knöpfe) und erscheint unter **Mehr → MT5-Bot**.

## Kommandozeile & Claude-Code-Skill
```
node bot/cli.js scan
node bot/cli.js analyze NVDA        # alle 11 Helfer, --json für Maschinen
```
`.claude/skills/trader/SKILL.md` macht das als Skill in Claude Code verfügbar („analysiere Gold“).

## API (Sitzung oder Bearer API_TOKEN)
`GET /api/skill` · `GET /api/skill/analyze?sym=` · `POST /api/skill/config` · `POST /api/skill/control {action: auto_on|auto_off|kill_on|kill_off|ai_on|ai_off|close_all|kill_all|close|cycle}` · `POST /api/skill/alarm` · `POST /api/skill/alarm/delete` · `POST /api/skill/reset`

## Test
`npm test` – Server/Login/Push (wie bisher), Ausfall-Alarm und Trader-Skill (Indikatoren, Monte-Carlo, News, kompletter Handelsweg, Not-Aus, Alarme) – komplett offline.

## Projektstruktur
```
server.js            HTTP-Server, Login, Push, API
bot/engine.js        Zyklus, Snapshot, Steuerung
bot/helpers.js       die 11 Helfer
bot/strategy.js      Setups + Trade-Plan (live und im Backtest identisch)
bot/montecarlo.js    Time Machine (10.000 Pfade)   bot/backtest.js  Rückblick
bot/market.js        Yahoo-Kurse + Simulator       bot/ta.js        Indikatoren
bot/broker.js        Paper-Konto                   bot/news.js, congress.js, claude.js
public/              Dashboard (index.html, app.js, charts.js, robots.js, style.css, sw.js)
```
