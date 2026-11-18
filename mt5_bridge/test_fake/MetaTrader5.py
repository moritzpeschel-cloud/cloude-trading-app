# Test-Attrappe des MetaTrader5-Pakets (nur für test_mt5.js) – Zustand in FAKE_STATE
import json, os, time
from types import SimpleNamespace as N
F = os.environ.get("FAKE_STATE") or os.path.join(os.path.dirname(__file__), "fake_state.json")
ACCOUNT_TRADE_MODE_DEMO = 0; ORDER_TYPE_BUY, ORDER_TYPE_SELL, ORDER_TYPE_BUY_LIMIT, ORDER_TYPE_SELL_LIMIT = 0, 1, 2, 3
POSITION_TYPE_BUY = 0; TRADE_ACTION_DEAL, TRADE_ACTION_PENDING, TRADE_ACTION_SLTP, TRADE_ACTION_REMOVE = 1, 5, 6, 8
ORDER_TIME_GTC = 0; ORDER_FILLING_FOK, ORDER_FILLING_IOC, ORDER_FILLING_RETURN = 0, 1, 2
TRADE_RETCODE_DONE, TRADE_RETCODE_PLACED, TRADE_RETCODE_DONE_PARTIAL = 10009, 10008, 10010
DEAL_ENTRY_IN, DEAL_ENTRY_OUT, DEAL_ENTRY_OUT_BY = 0, 1, 3; DEAL_TYPE_BUY = 0
PX = json.loads(os.environ.get("FAKE_PX", "{}"))
NAMES = {"EURUSD": 1e5, "GBPUSD": 1e5, "XAUUSD": 100, "US500.cash": 1, "USTEC": 1, "DE40": 1, "BTCUSD": 1, "ETHUSD": 1, "AAPL.US": 1}
def _l():
    try: return json.load(open(F))
    except Exception: return {"seq": 1000, "pos": [], "ord": [], "deals": [], "bal": 10000.0}
def _s(s): json.dump(s, open(F, "w"))
def initialize(**k): return not os.environ.get("FAKE_INIT_FAIL")
def shutdown(): pass
def last_error(): return (-6, "Terminal: Authorization failed") if os.environ.get("FAKE_INIT_FAIL") else (0, "ok")
def account_info():
    s = _l(); eq = s["bal"] + sum(_profit(p) for p in s["pos"])
    return N(login=5551234, server="Demo-Server", company="FakeBroker", currency="EUR", balance=s["bal"], equity=eq, leverage=100, trade_mode=int(os.environ.get("FAKE_MODE", "0")))
def terminal_info(): return N(trade_allowed=True)
def symbols_get(): return [N(name=n) for n in NAMES]
def symbol_select(n, b): return n in NAMES
def _mid(n):
    o = {"US500.cash": "US500", "USTEC": "NAS100", "DE40": "GER40", "AAPL.US": "AAPL"}.get(n, n); return PX.get(o, 100.0) + float(os.environ.get("FAKE_OFF", "0"))
def symbol_info(n): return N(digits=2, point=0.01, trade_stops_level=0, volume_step=0.01, volume_min=0.01, volume_max=100, filling_mode=2)
def symbol_info_tick(n): m = _mid(n); return N(bid=m - 0.05, ask=m + 0.05)
def order_calc_profit(t, n, v, p, sl): return (sl - p if t == 0 else p - sl) * v * NAMES[n]
def order_check(r): return N(retcode=0, comment="")
def _profit(p): m = _mid(p["symbol"]); return ((m - p["price_open"]) if p["type"] == 0 else (p["price_open"] - m)) * p["volume"] * NAMES[p["symbol"]]
def order_send(r):
    s = _l(); a = r["action"]
    if a == TRADE_ACTION_DEAL and "position" not in r:
        s["seq"] += 1; t = s["seq"]; p = dict(ticket=t, symbol=r["symbol"], type=r["type"], volume=r["volume"], price_open=r["price"], sl=r["sl"], tp=r["tp"], magic=r["magic"], comment=r["comment"], time=int(time.time()))
        s["pos"].append(p); s["deals"].append(dict(position_id=t, entry=0, type=r["type"], price=r["price"], volume=r["volume"], magic=r["magic"], symbol=r["symbol"], profit=0, commission=-1, swap=0, time=int(time.time()), reason=3)); _s(s)
        return N(retcode=10009, order=t, price=r["price"], comment="done")
    if a == TRADE_ACTION_DEAL:
        p = [x for x in s["pos"] if x["ticket"] == r["position"]][0]; pr = _profit(p); s["pos"].remove(p); s["bal"] += pr
        s["deals"].append(dict(position_id=p["ticket"], entry=1, type=1 - p["type"], price=r["price"], volume=p["volume"], magic=r["magic"], symbol=p["symbol"], profit=pr, commission=-1, swap=0, time=int(time.time()), reason=3)); _s(s)
        return N(retcode=10009, order=0, price=r["price"], comment="done")
    if a == TRADE_ACTION_SLTP:
        for x in s["pos"]:
            if x["ticket"] == r["position"]: x["sl"] = r["sl"]
        _s(s); return N(retcode=10009, order=0, price=0, comment="done")
    if a == TRADE_ACTION_PENDING:
        s["seq"] += 1; s["ord"].append(dict(ticket=s["seq"], symbol=r["symbol"], type=r["type"], volume_current=r["volume"], price_open=r["price"], sl=r["sl"], tp=r["tp"], magic=r["magic"], comment=r["comment"])); _s(s)
        return N(retcode=10008, order=s["seq"], price=r["price"], comment="placed")
    if a == TRADE_ACTION_REMOVE:
        s["ord"] = [o for o in s["ord"] if o["ticket"] != r["order"]]; _s(s); return N(retcode=10009, order=0, price=0, comment="done")
def positions_get(ticket=None):
    s = _l(); L = [x for x in s["pos"] if ticket is None or x["ticket"] == ticket]
    return tuple(N(**x, price_current=_mid(x["symbol"]), profit=_profit(x), swap=0) for x in L)
def orders_get(): return tuple(N(**o) for o in _l()["ord"])
def history_deals_get(a, b): return tuple(N(**d) for d in _l()["deals"])
