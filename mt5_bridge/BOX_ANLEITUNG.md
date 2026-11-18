# MT5-Brücke auf der Box installieren (für Claude oder dich auf der Box)

Ziel: Der Trader-Skill (Render, https://cloude-trading.onrender.com) soll auf dem MT5-**Demo**-Konto
**115804879 · MetaQuotes-Demo** handeln. Die Brücke läuft neben dem bestehenden Bot auf der Box,
nutzt dieselbe MT5-Installation und fasst dessen Trades nie an (eigene Magic-Nummer 261118).

1. Code holen (öffentliches Repo):
   `git clone --depth 1 https://github.com/moritzpeschel-cloud/cloude-trading-app /workspace/cloude-skill && cd /workspace/cloude-skill/mt5_bridge`
2. Wie spricht der bestehende Bot MT5 an? (`grep -rn "MetaTrader5\|mt5linux" /workspace/trader-dashboard | head`)
   - Windows-Python mit `MetaTrader5` → dieselbe Python für die Brücke nehmen.
   - Linux + Wine mit `mt5linux` → `pip install mt5linux`; die Brücke verbindet sich auf `MT5_LINUX_HOST`/`MT5_LINUX_PORT` (Standard localhost:18812) mit dem rpyc-Server, den der Bot schon nutzt.
3. Server-Adresse und Token liest die Brücke automatisch aus `/workspace/trader-dashboard/.env`
   (`CLOUDE_APP_URL`, `CLOUDE_PUSH_TOKEN`). Sonst `CT_URL`/`CT_TOKEN` setzen.
4. Konto: Ist im Terminal ein anderes Demo-Konto eingeloggt und soll der alte Bot dort bleiben, eine **zweite** MT5-Installation
   für 115804879 anlegen und `MT5_PATH` (bzw. eine zweite mt5linux-Instanz mit anderem Port) nutzen.
   Soll alles auf 115804879 laufen: `MT5_LOGIN=115804879`, `MT5_SERVER=MetaQuotes-Demo`, `MT5_PASSWORD=<Demo-Passwort>` setzen.
   In MT5 „Algo Trading“ einschalten.
5. Test: `python bridge.py --once` → erwartet „✅ Server erreichbar“ und „✅ Verbunden: Demo-Konto …“.
6. Dauerhaft starten wie den bestehenden Bot (Supervisor), z. B.:
   ```
   [program:cloude-mt5-bridge]
   command=python /workspace/cloude-skill/mt5_bridge/bridge.py
   environment=MT5_LOGIN="115804879",MT5_SERVER="MetaQuotes-Demo",MT5_PASSWORD="…"
   autorestart=true
   ```
   `supervisorctl reread && supervisorctl update`
7. Im Dashboard steht danach oben „MT5-Demo 115804879“; der Bot schaltet automatisch aufs Demo-Konto.
   Probleme zeigt das Dashboard unter Mehr → MT5-Demo-Konto im Klartext.
