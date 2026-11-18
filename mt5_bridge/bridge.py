"""
Cloude Trading · MT5-Brücke (nur DEMO-Konten)

Läuft auf dem Rechner mit dem MetaTrader-5-Terminal (Windows oder Windows-VPS).
Der Trader-Skill auf dem Server entscheidet; diese Brücke führt im MT5-Demo-Konto aus:
  1. holt Befehle (Eröffnen, Stop nachziehen, Schließen, Order löschen) vom Server
  2. führt sie im Terminal aus (Positionsgröße wird hier aus dem Risiko in € exakt berechnet)
  3. meldet Konto, Positionen, Orders, geschlossene Trades und Broker-Kurse zurück
Nur ausgehende HTTPS-Verbindungen. Echtgeld-Konten werden verweigert.

Start:  pip install MetaTrader5
        set CT_URL=https://cloude-trading.onrender.com
        set CT_TOKEN=<API_TOKEN aus Render>
        python bridge.py
Optional: MT5_PATH (terminal64.exe), MT5_LOGIN/MT5_PASSWORD/MT5_SERVER (sonst wird das eingeloggte Terminal benutzt),
          SYMBOL_MAP='{"US500":"US500.cash"}' falls ein Symbol nicht automatisch gefunden wird, CT_INTERVAL (Sekunden, Standard 3).
"""
import json, math, os, re, sys, time, urllib.request, urllib.error

try:
    import MetaTrader5 as mt5
except ImportError:
    sys.exit("MetaTrader5 fehlt:  pip install MetaTrader5   (läuft nur unter Windows mit installiertem MT5-Terminal)")

URL = os.environ.get("CT_URL", "").rstrip("/")
TOKEN = os.environ.get("CT_TOKEN", "")
INTERVAL = float(os.environ.get("CT_INTERVAL", "3"))
ONCE = "--once" in sys.argv

ALIASES = {
    "XAUUSD": ["XAUUSD", "GOLD"], "XAGUSD": ["XAGUSD", "SILVER"],
    "EURUSD": ["EURUSD"], "GBPUSD": ["GBPUSD"], "USDJPY": ["USDJPY"],
    "US500": ["US500", "SPX500", "SP500", "USA500", "US500CASH", "SPX"], "NAS100": ["NAS100", "USTEC", "US100", "NDX100", "USTECH", "NAS"],
    "GER40": ["GER40", "DE40", "DAX40", "GER30", "DE30", "DAX"], "BTCUSD": ["BTCUSD", "BITCOIN", "BTCUSDT"], "ETHUSD": ["ETHUSD", "ETHEREUM", "ETHUSDT"],
    "AAPL": ["AAPL", "APPLE"], "NVDA": ["NVDA", "NVIDIA"], "MSFT": ["MSFT", "MICROSOFT"], "TSLA": ["TSLA", "TESLA"],
}
REASON = {4: "Grenze (Stop)", 5: "Ziel erreicht", 6: "Stop-Out", 3: "Bot", 0: "Manuell (MT5)", 1: "Manuell (MT5-App)", 2: "Manuell (MT5-Web)"}


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def http(path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(URL + path, data=data, method="POST" if data else "GET",
                                 headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json", "User-Agent": "cloude-mt5-bridge/1.0"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode())


# ---------------------------------------------------------------- Symbole
SYM, REV = {}, {}


def norm(s):
    return re.sub(r"[^A-Z0-9]", "", s.upper())


def resolve(ours):
    user = json.loads(os.environ.get("SYMBOL_MAP", "{}") or "{}")
    names = [s.name for s in (mt5.symbols_get() or [])]
    for o in ours:
        pick = user.get(o)
        if not pick:
            best = None
            for a in ALIASES.get(o, [o]):
                for n in names:
                    nn = norm(n)
                    if nn == a:
                        best = n; break
                    if nn.startswith(a) and len(nn) - len(a) <= 4 and (best is None or len(n) < len(best)):
                        best = n
                if best and norm(best) == a:
                    break
            pick = best
        if pick and mt5.symbol_select(pick, True):
            SYM[o], REV[pick] = pick, o
    missing = [o for o in ours if o not in SYM]
    log("Symbole:", ", ".join(f"{o}→{SYM[o]}" for o in SYM) or "keine")
    if missing:
        log("Nicht gefunden (werden nicht gehandelt):", ", ".join(missing), "– ggf. SYMBOL_MAP setzen")


# ---------------------------------------------------------------- Ausführung
def filling(info):
    fm = getattr(info, "filling_mode", 0)
    return mt5.ORDER_FILLING_FOK if fm & 1 else mt5.ORDER_FILLING_IOC if fm & 2 else mt5.ORDER_FILLING_RETURN


def volume_for(name, info, risk, buy, price, sl):
    loss = mt5.order_calc_profit(mt5.ORDER_TYPE_BUY if buy else mt5.ORDER_TYPE_SELL, name, 1.0, price, sl)
    if loss is None or loss >= 0:
        raise RuntimeError("Verlust je Lot nicht berechenbar")
    step = info.volume_step or 0.01
    vol = math.floor(risk / abs(loss) / step + 1e-9) * step
    vol = round(min(vol, info.volume_max), max(0, -int(math.floor(math.log10(step)))))
    if vol < info.volume_min:
        raise RuntimeError(f"Position zu klein: Risiko {risk:.2f} reicht nicht für Mindestlot {info.volume_min}")
    return vol


def ok(res):
    return res is not None and res.retcode in (mt5.TRADE_RETCODE_DONE, mt5.TRADE_RETCODE_PLACED, mt5.TRADE_RETCODE_DONE_PARTIAL)


def err(res):
    return f"retcode {res.retcode}: {res.comment}" if res is not None else f"order_send: {mt5.last_error()}"


def execute(c, magic):
    sym = c.get("sym")
    name = SYM.get(sym)
    if c["cmd"] in ("open",) and not name:
        return {"id": c["id"], "ok": False, "error": f"{sym} beim Broker nicht gefunden"}
    if c["cmd"] == "open":
        info, tick = mt5.symbol_info(name), mt5.symbol_info_tick(name)
        if info is None or tick is None:
            return {"id": c["id"], "ok": False, "error": "kein Kurs"}
        buy, d = c["dir"] > 0, info.digits
        min_dist = (info.trade_stops_level or 0) * info.point
        sl_d, tp_d = max(c["slDist"], min_dist * 1.2), max(c["tpDist"], min_dist * 1.2)
        if c.get("type") == "limit":
            price = round(c["price"], d)
            sl, tp = round(price - sl_d if buy else price + sl_d, d), round(price + tp_d if buy else price - tp_d, d)
            req = {"action": mt5.TRADE_ACTION_PENDING, "type": mt5.ORDER_TYPE_BUY_LIMIT if buy else mt5.ORDER_TYPE_SELL_LIMIT,
                   "type_time": mt5.ORDER_TIME_GTC, "type_filling": mt5.ORDER_FILLING_RETURN}
        else:
            price = tick.ask if buy else tick.bid
            sl, tp = round(price - sl_d if buy else price + sl_d, d), round(price + tp_d if buy else price - tp_d, d)
            req = {"action": mt5.TRADE_ACTION_DEAL, "type": mt5.ORDER_TYPE_BUY if buy else mt5.ORDER_TYPE_SELL,
                   "type_time": mt5.ORDER_TIME_GTC, "type_filling": filling(info), "deviation": 30}
        try:
            vol = volume_for(name, info, float(c["risk"]), buy, price, sl)
        except Exception as e:
            return {"id": c["id"], "ok": False, "error": str(e)}
        req.update({"symbol": name, "volume": vol, "price": price, "sl": sl, "tp": tp, "magic": magic, "comment": c.get("comment", "TS")[:26]})
        chk = mt5.order_check(req)
        if chk is not None and chk.retcode not in (0, mt5.TRADE_RETCODE_DONE):
            return {"id": c["id"], "ok": False, "error": "Prüfung: " + err(chk)}
        res = mt5.order_send(req)
        if not ok(res):
            return {"id": c["id"], "ok": False, "error": err(res)}
        log(f"✔ {sym} {'KAUF' if buy else 'VERKAUF'} {vol} @ {res.price or price}  SL {sl}  TP {tp}  ({c.get('type')})")
        return {"id": c["id"], "ok": True, "ticket": res.order, "volume": vol, "price": res.price or price, "sl": sl, "tp": tp}
    if c["cmd"] == "modify":
        pos = (mt5.positions_get(ticket=c["ticket"]) or [None])[0]
        if pos is None:
            return {"id": c["id"], "ok": False, "error": "Position nicht (mehr) offen"}
        info = mt5.symbol_info(pos.symbol)
        res = mt5.order_send({"action": mt5.TRADE_ACTION_SLTP, "position": pos.ticket, "symbol": pos.symbol, "sl": round(c["sl"], info.digits), "tp": pos.tp, "magic": magic})
        if not ok(res):
            return {"id": c["id"], "ok": False, "error": err(res)}
        log(f"↳ {pos.symbol}: Stop → {round(c['sl'], info.digits)}")
        return {"id": c["id"], "ok": True}
    if c["cmd"] == "close":
        pos = (mt5.positions_get(ticket=c["ticket"]) or [None])[0]
        if pos is None:
            return {"id": c["id"], "ok": True}
        tick, info = mt5.symbol_info_tick(pos.symbol), mt5.symbol_info(pos.symbol)
        buy = pos.type == mt5.POSITION_TYPE_BUY
        res = mt5.order_send({"action": mt5.TRADE_ACTION_DEAL, "position": pos.ticket, "symbol": pos.symbol, "volume": pos.volume,
                              "type": mt5.ORDER_TYPE_SELL if buy else mt5.ORDER_TYPE_BUY, "price": tick.bid if buy else tick.ask,
                              "deviation": 30, "magic": magic, "type_filling": filling(info), "comment": "TS close"})
        if not ok(res):
            return {"id": c["id"], "ok": False, "error": err(res)}
        log(f"✖ {pos.symbol} geschlossen ({c.get('reason', '')})")
        return {"id": c["id"], "ok": True}
    if c["cmd"] == "cancel":
        res = mt5.order_send({"action": mt5.TRADE_ACTION_REMOVE, "order": c["order"]})
        return {"id": c["id"], "ok": ok(res), **({} if ok(res) else {"error": err(res)})}
    return {"id": c["id"], "ok": False, "error": "unbekannter Befehl"}


# ---------------------------------------------------------------- Bericht
def report(magic, results):
    a = mt5.account_info()
    acc = {"login": a.login, "server": a.server, "company": a.company, "currency": a.currency, "balance": a.balance, "equity": a.equity,
           "leverage": a.leverage, "trade_mode": "DEMO" if a.trade_mode == mt5.ACCOUNT_TRADE_MODE_DEMO else a.trade_mode}
    pos = [{"ticket": p.ticket, "symbol": p.symbol, "sym": REV.get(p.symbol), "type": p.type, "volume": p.volume, "price_open": p.price_open,
            "price_current": p.price_current, "sl": p.sl, "tp": p.tp, "profit": p.profit, "swap": p.swap, "time": p.time, "magic": p.magic, "comment": p.comment}
           for p in (mt5.positions_get() or []) if REV.get(p.symbol)]
    ords = [{"ticket": o.ticket, "symbol": o.symbol, "sym": REV.get(o.symbol), "type": o.type, "volume": o.volume_current, "price": o.price_open,
             "sl": o.sl, "tp": o.tp, "magic": o.magic, "comment": o.comment} for o in (mt5.orders_get() or []) if REV.get(o.symbol)]
    # geschlossene Positionen der letzten 7 Tage (Magic über den Eröffnungs-Deal)
    now = time.time()
    from datetime import datetime
    deals = mt5.history_deals_get(datetime.fromtimestamp(now - 7 * 86400), datetime.fromtimestamp(now + 86400)) or []
    by = {}
    for d in deals:
        by.setdefault(d.position_id, []).append(d)
    open_ids = {p["ticket"] for p in pos}
    closed = []
    for pid, ds in by.items():
        ins = [d for d in ds if d.entry == mt5.DEAL_ENTRY_IN]
        outs = [d for d in ds if d.entry in (mt5.DEAL_ENTRY_OUT, mt5.DEAL_ENTRY_OUT_BY)]
        if not ins or not outs or pid in open_ids or ins[0].magic != magic or not REV.get(ins[0].symbol):
            continue
        i, o = ins[0], outs[-1]
        closed.append({"position": pid, "sym": REV[i.symbol], "dir": 1 if i.type == mt5.DEAL_TYPE_BUY else -1, "volume": i.volume, "entry": i.price, "exit": o.price,
                       "pnl": round(sum(d.profit + d.commission + d.swap + getattr(d, "fee", 0) for d in ds), 2), "time_open": i.time, "time": o.time,
                       "reason": REASON.get(o.reason, "geschlossen"), "magic": magic})
    prices = {}
    for o, n in SYM.items():
        t = mt5.symbol_info_tick(n)
        if t and t.bid > 0 and t.ask > 0:
            prices[o] = (t.bid + t.ask) / 2
    return {"account": acc, "positions": pos, "orders": ords, "closed": closed, "prices": prices, "results": results}


VERSION = "1.1"


def hint(code):
    if code in (-6,):
        return "Login fehlgeschlagen – Kontonummer/Passwort/Server prüfen (Server: MetaQuotes-Demo)"
    if code in (-10003, -10004, -10005, -1, -10001, -10002):
        return "MT5-Terminal nicht gefunden oder nicht gestartet – MetaTrader 5 (Desktop) öffnen; bei mehreren Installationen MT5_PATH auf terminal64.exe setzen"
    return "MT5 meldet einen Fehler"


def hello(error=None):
    try:
        http("/api/mt5/hello", {"error": error, "version": VERSION})
    except Exception:
        pass


def server_check():
    """Wartet, bis der Server erreichbar ist und der Token stimmt."""
    n = 0
    while True:
        n += 1
        try:
            return http("/api/mt5/poll")
        except urllib.error.HTTPError as e:
            if e.code == 401:
                log("❌ CT_TOKEN ist falsch. In START.bat genau den API_TOKEN aus Render eintragen (Render → Service → Environment).")
            elif e.code == 404:
                log("❌ Der Server kennt die Brücke noch nicht (alte Version). In Render: Manual Deploy → Deploy latest commit.")
            else:
                log(f"❌ Server antwortet mit HTTP {e.code}.")
            time.sleep(60)
        except Exception as e:
            log(f"⏳ Server noch nicht erreichbar ({e.__class__.__name__}) – Render wacht evtl. gerade auf. Neuer Versuch in 15 s … (Versuch {n})")
            time.sleep(15)


def connect():
    """Verbindet mit dem MT5-Terminal; versucht es bei Fehlern alle 30 s erneut und meldet den Grund ans Dashboard."""
    kw = {}
    if os.environ.get("MT5_PATH"):
        kw["path"] = os.environ["MT5_PATH"]
    if os.environ.get("MT5_LOGIN"):
        kw.update(login=int(os.environ["MT5_LOGIN"]), password=os.environ.get("MT5_PASSWORD", ""), server=os.environ.get("MT5_SERVER", ""))
    while True:
        if mt5.initialize(**kw):
            a = mt5.account_info()
            if a is not None:
                break
            msg = "Im Terminal ist kein Konto eingeloggt"
        else:
            code, txt = mt5.last_error()
            msg = f"{hint(code)} (Code {code}: {txt})"
        log("⚠ " + msg + " – neuer Versuch in 30 s")
        hello(msg)
        mt5.shutdown()
        time.sleep(30)
    if a.trade_mode != mt5.ACCOUNT_TRADE_MODE_DEMO:
        hello("Eingeloggtes Konto ist KEIN Demo-Konto – Brücke gestoppt")
        mt5.shutdown()
        sys.exit("ABBRUCH: Das eingeloggte Konto ist KEIN Demo-Konto. Diese Brücke handelt ausschließlich Demo-Konten.")
    if not mt5.terminal_info().trade_allowed:
        log("⚠ Im Terminal ist Algo-Trading AUS – oben in MT5 auf „Algo Trading“ klicken, sonst werden Orders abgelehnt.")
        hello("Algo-Trading im MT5-Terminal ist AUS – oben auf „Algo Trading“ klicken")
    log(f"✅ Verbunden: Demo-Konto {a.login} · {a.server} · {a.balance:.2f} {a.currency}")


def main():
    if not URL or not TOKEN or "HIER_" in TOKEN:
        sys.exit("Bitte CT_URL (Server-Adresse) und CT_TOKEN (API_TOKEN aus Render) setzen.")
    log(f"Cloude Trading MT5-Brücke {VERSION} · Server {URL}")
    first = server_check()
    log("✅ Server erreichbar, Token stimmt.")
    hello(None)
    connect()
    magic = first["magic"]
    resolve(first.get("watch", list(ALIASES)))
    results, done, fails = [], {}, 0
    cmds = first.get("cmds", [])
    while True:
        try:
            for c in cmds:
                if c["id"] in done:
                    continue
                r = execute(c, magic)
                if not r.get("ok"):
                    log(f"✘ {c.get('sym', '')} {c['cmd']}: {r.get('error')}")
                done[c["id"]] = time.time()
                results.append(r)
            if mt5.account_info() is None:
                log("Terminal getrennt – verbinde neu …"); mt5.shutdown(); connect()
            resp = http("/api/mt5/sync", report(magic, results))
            if resp.get("ok") is False:
                sys.exit("Server: " + str(resp.get("error")))
            if fails:
                log("✅ Wieder mit dem Server verbunden.")
            results, cmds, fails = [], resp.get("cmds", []), 0
            done = {k: v for k, v in done.items() if time.time() - v < 900}
        except urllib.error.HTTPError as e:
            fails += 1
            log(f"Server-Fehler HTTP {e.code} – {'CT_TOKEN falsch' if e.code == 401 else 'neuer Versuch'} (Versuch {fails})")
            time.sleep(min(60, INTERVAL * fails))
            continue
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            fails += 1
            log(f"Server nicht erreichbar ({e}) – Versuch {fails}, Ergebnisse bleiben gespeichert")
            time.sleep(min(60, INTERVAL * fails))
            continue
        if ONCE:
            return
        time.sleep(INTERVAL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("Beendet.")
    finally:
        mt5.shutdown()
