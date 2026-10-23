# Cloude Trading – Handy-App (Render Web Service)

Kleine Web-App (PWA) für das iPhone: Globus mit 12 Helfern, Kontoleiste, offene Positionen,
letzte Trades, Journal, Status. **Nur lesend** – Steuerung läuft über den Telegram-Bot.
Ohne Abhängigkeiten (Node ≥ 18), kostenlos auf Render (Free Plan) – genau wie der Gold Bot.

## So fließen die Daten
Der Bot auf der Box schickt alle 30 s einen bereinigten Schnappschuss (ohne Kontonummer,
Passwörter, Tokens, interne Adressen) per `POST <APP_URL>/api/update` mit
`Authorization: Bearer <API_TOKEN>`. Die App hält nur den letzten Stand im Speicher.
Das Handy meldet sich mit der PIN an (`POST /api/login`) und liest `GET /api/state`.

## Auf Render einrichten (einmalig, ca. 3 Minuten)
1. https://dashboard.render.com → **New → Web Service** → dieses GitHub-Repo wählen.
2. Einstellungen:
   | Feld | Wert |
   |---|---|
   | Root Directory | leer (bzw. `cloud_app`, falls das ganze Projekt im Repo liegt) |
   | Runtime | Node |
   | Build Command | `npm install` |
   | Start Command | `node server.js` |
   | Instance Type | **Free** |
   | Health Check Path | `/healthz` |
3. **Environment Variables** (Werte stehen auf der Box in `/workspace/trader-dashboard/.cloude_app.env`):
   - `API_TOKEN` – Push-Token (muss gleich `CLOUDE_PUSH_TOKEN` in `.env` sein)
   - `VIEW_PIN` – PIN fürs Handy (gleich `CLOUDE_VIEW_PIN`)
   - optional `SESSION_SECRET` (sonst aus API_TOKEN abgeleitet), `NODE_VERSION=20`
   - empfohlen `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` (Web-Push-Schlüssel, ebenfalls in `.cloude_app.env`). Ohne sie leitet die App feste Schlüssel aus `API_TOKEN` ab – funktioniert auch. Optional `VAPID_SUBJECT`.
   Alternativ: **New → Blueprint** – `render.yaml` liegt bei, Render fragt dann nur die zwei Werte ab.
4. Nach dem Deploy die URL (z. B. `https://cloude-trading-app.onrender.com`) auf der Box in
   `/workspace/trader-dashboard/.env` bei `CLOUDE_APP_URL=` eintragen und `CLOUDE_PREVIEW=0` setzen.
   Der Bot übernimmt das beim nächsten Neustart (Supervisor startet ihn automatisch neu).

## Aufs iPhone
Safari → URL öffnen → PIN eingeben → **Teilen → Zum Home-Bildschirm**. Startet dann wie eine App
(Vollbild, dunkel). Ohne Netz zeigt sie den letzten Stand mit „offline · Stand …“.

## Trade-Mitteilungen (Web-Push, wie beim Gold-Bot)
Der Bot meldet jede Eröffnung (`📈 EURUSD BUY 0,05 Lot @ 1,08345`) und jede Schließung
(`🟢 +12,34 €` / `🔴 −8,50 €`, inkl. Kommission/Swap, auch bei Broker-SL/TP) per `POST /api/event`.
Die App zeigt sie unter „Trade-Mitteilungen“ (grün/rot) und schickt eine Push-Mitteilung ans Handy.
Einschalten: App vom Home-Bildschirm öffnen → **🔔 Mitteilungen erlauben** (iPhone: iOS 16.4+, App
muss über „Zum Home-Bildschirm“ installiert sein). Free Plan: Abos liegen in `/tmp`; der Bot sichert
sie auf der Box und stellt sie nach einem Render-Neustart automatisch wieder her.
Endpunkte: `POST /api/event`, `GET /api/push/subs`, `POST /api/push/restore` (Bearer API_TOKEN);
`GET /api/events`, `GET /api/push/key`, `POST /api/push/subscribe|unsubscribe` (Handy-Session).

## Telegram-Knöpfe
Die Knöpfe öffnen `t.me/moritz_goldtrading_bot?start=…`. Der Bot antwortet nur im eigenen Chat:
`/status`, `/notaus` (Not-Aus an, schließt nichts), `/notaus alles` (Not-Aus + alles schließen),
`/weiter`, `/auto_an`, `/auto_aus`.

## Grenzen (Free Plan)
- Render schläft nach 15 min ohne Aufrufe. Weil der Bot alle 30 s pusht, bleibt der Dienst wach.
- 750 Freistunden/Monat **pro Workspace**: Gold Bot + diese App dauernd wach = ca. 1 490 h → reicht nicht.
  Lösung: zweiter kostenloser Render-Workspace, oder `PUBLISH_INTERVAL_S` hochsetzen und Schlafphasen akzeptieren.
- Nach einem Neustart/Aufwachen ist der Stand leer, bis der nächste Push kommt (≤ 30 s).

## Test
`npm test` (startet den Server lokal und prüft Login, Token, Limits, Header).
