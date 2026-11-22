// Handelbare Instrumente (Watchlist). yahoo = Kürzel für Live-Kurse, cs = Kontraktgröße je Lot, step/min = Lot-Raster,
// spread = typischer Spread in Preis-Einheiten, comm = Kommission je Lot und Seite in USD, group = Korrelations-Gruppe (Risiko-Helfer).
'use strict';
const ALL = {
  XAUUSD: { name: 'Gold', yahoo: 'GC=F', type: 'commodity', session: 'fx', cs: 100, min: 0.01, step: 0.01, dp: 2, spread: 0.25, comm: 3, group: 'metal', px0: 2650, vol: 0.15 },
  XAGUSD: { name: 'Silber', yahoo: 'SI=F', type: 'commodity', session: 'fx', cs: 5000, min: 0.01, step: 0.01, dp: 3, spread: 0.025, comm: 3, group: 'metal', px0: 31, vol: 0.28 },
  EURUSD: { name: 'Euro / US-Dollar', yahoo: 'EURUSD=X', type: 'fx', session: 'fx', cs: 100000, min: 0.01, step: 0.01, dp: 5, spread: 0.00008, comm: 3, group: 'usd', px0: 1.08, vol: 0.07 },
  GBPUSD: { name: 'Pfund / US-Dollar', yahoo: 'GBPUSD=X', type: 'fx', session: 'fx', cs: 100000, min: 0.01, step: 0.01, dp: 5, spread: 0.0001, comm: 3, group: 'usd', px0: 1.27, vol: 0.08 },
  USDJPY: { name: 'US-Dollar / Yen', yahoo: 'JPY=X', type: 'fx', session: 'fx', cs: 100000, min: 0.01, step: 0.01, dp: 3, spread: 0.012, comm: 3, group: 'usd', px0: 152, vol: 0.09, quoteUsd: false },
  US500: { name: 'S&P 500', yahoo: '^GSPC', type: 'index', session: 'us', cs: 1, min: 0.01, step: 0.01, dp: 2, spread: 0.5, comm: 0, group: 'us-eq', px0: 5900, vol: 0.16 },
  NAS100: { name: 'Nasdaq 100', yahoo: '^NDX', type: 'index', session: 'us', cs: 1, min: 0.01, step: 0.01, dp: 2, spread: 1.5, comm: 0, group: 'us-eq', px0: 20800, vol: 0.2 },
  US30: { name: 'Dow Jones 30', yahoo: '^DJI', type: 'index', session: 'us', cs: 1, min: 0.01, step: 0.01, dp: 2, spread: 2.5, comm: 0, group: 'us-eq', px0: 44000, vol: 0.15 },
  GER40: { name: 'DAX 40', yahoo: '^GDAXI', type: 'index', session: 'eu', cs: 1, min: 0.01, step: 0.01, dp: 2, spread: 1.2, comm: 0, group: 'eu-eq', px0: 19800, vol: 0.17 },
  BTCUSD: { name: 'Bitcoin', yahoo: 'BTC-USD', type: 'crypto', session: '24/7', cs: 1, min: 0.001, step: 0.001, dp: 1, spread: 15, comm: 0, group: 'crypto', px0: 92000, vol: 0.55 },
  ETHUSD: { name: 'Ethereum', yahoo: 'ETH-USD', type: 'crypto', session: '24/7', cs: 1, min: 0.01, step: 0.01, dp: 2, spread: 1.2, comm: 0, group: 'crypto', px0: 3200, vol: 0.7 },
  AAPL: { name: 'Apple', yahoo: 'AAPL', type: 'stock', session: 'us', cs: 1, min: 1, step: 1, dp: 2, spread: 0.03, comm: 0.5, group: 'us-eq', px0: 228, vol: 0.25, stock: true },
  NVDA: { name: 'NVIDIA', yahoo: 'NVDA', type: 'stock', session: 'us', cs: 1, min: 1, step: 1, dp: 2, spread: 0.04, comm: 0.5, group: 'us-eq', px0: 140, vol: 0.5, stock: true },
  MSFT: { name: 'Microsoft', yahoo: 'MSFT', type: 'stock', session: 'us', cs: 1, min: 1, step: 1, dp: 2, spread: 0.05, comm: 0.5, group: 'us-eq', px0: 420, vol: 0.25, stock: true },
  TSLA: { name: 'Tesla', yahoo: 'TSLA', type: 'stock', session: 'us', cs: 1, min: 1, step: 1, dp: 2, spread: 0.06, comm: 0.5, group: 'us-eq', px0: 330, vol: 0.6, stock: true },
};
const DEFAULT = 'XAUUSD,XAGUSD,BTCUSD,ETHUSD,US500,NAS100,US30,EURUSD,GBPUSD,USDJPY,GER40,NVDA';
function watchlist(env = process.env.WATCHLIST) { return String(env || DEFAULT).split(',').map(s => s.trim().toUpperCase()).filter(s => ALL[s]); }
module.exports = { ALL, watchlist, get: s => ALL[s] };
