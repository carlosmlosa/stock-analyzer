// Causal indicators: null means the full warm-up window is not available.
export function average(a, period, alpha = null) {
  const result = Array(a.length).fill(null); let previous = null;
  for (let i = 0; i < a.length; i++) {
    if (!Number.isFinite(a[i])) { previous = null; continue; }
    if (alpha !== null && previous !== null) previous += alpha * (a[i] - previous);
    else {
      const window = a.slice(Math.max(0, i-period+1), i+1);
      if (window.length !== period || !window.every(Number.isFinite)) continue;
      previous = window.reduce((sum,v)=>sum+v,0)/period;
    }
    result[i] = previous;
  }
  return result;
}
export function indicators(close, high, low, period = 20) {
  const ema = (a,n)=>average(a,n,2/(n+1));
  const changes = close.map((v,i)=>i?v-close[i-1]:null);
  const gains = average(changes.map(v=>v===null?null:Math.max(0,v)),14,1/14);
  const losses = average(changes.map(v=>v===null?null:Math.max(0,-v)),14,1/14);
  const fast=ema(close,12), slow=ema(close,26);
  const macd=close.map((_,i)=>fast[i]===null||slow[i]===null?null:fast[i]-slow[i]);
  const signal=ema(macd,9);
  const returns=close.map((v,i)=>i&&v>0&&close[i-1]>0?Math.log(v/close[i-1]):null);
  const volatility=returns.map((_,i)=>{
    const window=returns.slice(Math.max(0,i-period+1),i+1);
    if(window.length!==period||!window.every(Number.isFinite))return null;
    const mean=window.reduce((sum,v)=>sum+v,0)/period;
    return 100*Math.sqrt(window.reduce((sum,v)=>sum+(v-mean)**2,0)/(period-1));
  });
  return {sma:average(close,period),ema:ema(close,period),
    rsi:close.map((_,i)=>gains[i]===null?null:losses[i]===0?(gains[i]===0?50:100):100-100/(1+gains[i]/losses[i])),
    macd,signal,histogram:macd.map((v,i)=>v===null||signal[i]===null?null:v-signal[i]),volatility,
    atr:average(close.map((_,i)=>Math.max(high[i]-low[i],i?Math.abs(high[i]-close[i-1]):0,i?Math.abs(low[i]-close[i-1]):0)),14,1/14)};
}
