import {parseCSV} from './smoothing.js';
import {average} from './indicators.js';

// Reject incomplete rows rather than independently filtering OHLCV columns.
export function dailyMetrics(text) {
  const columns = parseCSV(text);
  const fields = ['Close', 'High', 'Low', 'Volume'].map(name => columns.find(c => c.name.toLowerCase() === name.toLowerCase()));
  if (fields.some(c => !c?.dates)) throw new Error('Daily Close, High, Low and Volume with dates required');
  const [close, high, low, volume] = fields.map(c => c.values);
  const dates = fields[0].dates;
  if (fields.some(c => c.skipped || c.total > 10000 || c.dates.length !== dates.length || c.dates.some((d,i) => d !== dates[i]))) throw new Error('Incomplete or misaligned daily rows');
  if (dates.some((d,i) => !/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0,10) !== d || (i && d <= dates[i-1]))) throw new Error('Ascending unique daily dates required');
  if (close.length < 253) throw new Error('At least 253 daily bars required');
  if (close.some((c,i) => {
    // Adjusted provider prices can differ at a boundary by a few floating-point ULPs.
    // Accept arithmetic roundoff only; do not repair prices or accept real range violations.
    const tolerance = 32*Number.EPSILON*Math.max(1,c,high[i],low[i]);
    return c <= 0 || low[i] <= 0 || high[i] < low[i] || c > high[i]+tolerance || c < low[i]-tolerance || volume[i] < 0;
  })) throw new Error('Invalid OHLCV');
  const mean = a => a.reduce((s,v) => s+v,0)/a.length;
  const price = close.at(-1), sma50 = mean(close.slice(-50)), sma200 = mean(close.slice(-200));
  const returns = close.slice(-64).map((c,i,a) => i ? Math.log(c/a[i-1]) : null).slice(1);
  const mu = mean(returns), volatility = Math.sqrt(252*returns.reduce((s,r) => s+(r-mu)**2,0)/(returns.length-1));
  const tr = close.map((c,i) => Math.max(high[i]-low[i],i ? Math.abs(high[i]-close[i-1]) : 0,i ? Math.abs(low[i]-close[i-1]) : 0));
  const atr = average(tr,14,1/14).at(-1);
  const previousVolume = mean(volume.slice(-21,-1));
  if (!previousVolume || !atr || !volatility) throw new Error('Insufficient variation or volume');
  return {date:dates.at(-1),price,sma50,sma200,volatility,atr,closeTail:close.slice(-60),
    r126:price/close.at(-127)-1,r252:price/close.at(-253)-1,r20:price/close.at(-21)-1,
    trend:price/sma200-1,breakout:(price-Math.max(...high.slice(-21,-1)))/atr,
    volumeRatio:volume.at(-1)/previousVolume,
    dollarVolume:mean(close.slice(-20).map((c,i) => c*volume[volume.length-20+i]))};
}

// Midrank percentiles give ties identical scores; a single candidate is neutral.
export function percentile(values, value) {
  if (values.length < 2) return .5;
  const below = values.filter(v => v < value).length;
  const equal = values.filter(v => v === value).length;
  return (below+(equal-1)/2)/(values.length-1);
}
export function rankStocks(stocks) {
  const latest = stocks.reduce((d,s) => s.date > d ? s.date : d,'');
  const universe = stocks.filter(s => s.date === latest && s.dollarVolume >= 1000000);
  const growth = universe.filter(s => s.price > s.sma50 && s.sma50 > s.sma200 && s.r252 > 0);
  // Near a breakout, but no more than two ATR above it; this is a watchlist, not an entry signal.
  const swing = universe.filter(s => s.price > s.sma50 && s.r20 > 0 && s.breakout >= -1 && s.breakout <= 2);
  const score = (pool, terms) => pool.map(s => ({...s,score:100*terms.reduce((total,[key,weight,direction]) => total+weight*percentile(pool.map(x => direction*x[key]),direction*s[key]),0)}))
    .sort((a,b) => b.score-a.score || a.ticker.localeCompare(b.ticker)).slice(0,10);
  return {date:latest,eligible:universe.length,
    growth:score(growth,[['r252',.4,1],['r126',.3,1],['trend',.2,1],['volatility',.1,-1]]),
    swing:score(swing,[['r20',.4,1],['breakout',.35,1],['volumeRatio',.25,1]])};
}
