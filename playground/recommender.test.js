import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyMetrics,percentile,rankStocks} from './recommender.js';
function csv(n=260) {
  return 'Date,Close,High,Low,Volume\n'+Array.from({length:n},(_,i) => {
    const date = new Date(Date.UTC(2024,0,1+i)).toISOString().slice(0,10), c=100+i*.2+Math.sin(i);
    return `${date},${c},${c+2},${c-2},1000000`;
  }).join('\n');
}
test('daily metrics use aligned Close and exclude current bar from breakout and volume baseline',()=>{
  const m = dailyMetrics(csv());
  assert.equal(m.date,'2024-09-16');
  assert.ok(Math.abs(m.r252-((100+259*.2+Math.sin(259))/(100+7*.2+Math.sin(7))-1))<1e-12);
  assert.ok(m.atr>0); assert.equal(m.volumeRatio,1);
  const changed = csv().split('\n'); const last = changed.at(-1).split(','); last[4]='3000000';changed[changed.length-1]=last.join(',');
  assert.equal(dailyMetrics(changed.join('\n')).volumeRatio,3);
  assert.equal(dailyMetrics(changed.join('\n')).breakout,m.breakout);
});
test('bad data and insufficient warm-up are rejected',()=>{
  assert.throws(()=>dailyMetrics(csv(252)),/253/);
  assert.throws(()=>dailyMetrics(csv().replace(',100,102,98,',',,102,98,')),/Incomplete/);
  assert.throws(()=>dailyMetrics(csv().replace('2024-01-02','2024-01-01')),/unique/);
  assert.throws(()=>dailyMetrics(csv().replace('Close','Other')),/required/);
});
test('percentiles handle ties and singleton pools',()=>{
  assert.equal(percentile([1,2,2,3],2),.5); assert.equal(percentile([2],2),.5);
});
const stock = (ticker,extra={}) => ({ticker,date:'2026-11-13',price:120,sma50:110,sma200:100,r252:.3,r126:.2,r20:.1,trend:.2,volatility:.2,breakout:.2,volumeRatio:1,dollarVolume:2000000,...extra});
test('rankings exclude stale and illiquid data, apply screens and cap each list',()=>{
  const stocks=Array.from({length:15},(_,i)=>stock(`S${String(i).padStart(2,'0')}`,{r252:.3+i*.01,r126:.2+i*.01,r20:.1+i*.01}));
  const r=rankStocks([...stocks,stock('OLD',{date:'2026-11-12'}),stock('THIN',{dollarVolume:10}),stock('DOWN',{price:90})]);
  assert.equal(r.eligible,16);assert.equal(r.growth.length,10);assert.equal(r.swing.length,10);
  assert.equal(r.growth[0].ticker,'S14'); assert.equal(r.swing[0].ticker,'S14');
  assert.ok(r.growth.every(s=>s.score>=0&&s.score<=100));
  assert.deepEqual(rankStocks([]).growth,[]);
  assert.ok(Math.abs(rankStocks([stock('ONE')]).growth[0].score-50)<1e-10);
});

test('breakout uses prior highs and ATR retains gap risk',()=>{
  const rows = csv().split('\n');
  const last = rows.at(-1).split(',');
  const previousHigh = Math.max(...rows.slice(-21,-1).map(r=>Number(r.split(',')[2])));
  last[1]=String(previousHigh+5); last[2]=String(previousHigh+6); last[3]=String(previousHigh+4);
  rows[rows.length-1]=last.join(',');
  const m=dailyMetrics(rows.join('\n'));
  assert.ok(Math.abs(m.breakout-5/m.atr)<1e-12);
  assert.ok(m.atr>dailyMetrics(csv()).atr);
});

test('adjusted OHLCV accepts floating-point boundary roundoff but rejects real violations',()=>{
  const rows=csv().split('\n'), last=rows.at(-1).split(',');
  last[2]=String(Number(last[1])-1e-13); rows[rows.length-1]=last.join(',');
  assert.doesNotThrow(()=>dailyMetrics(rows.join('\n')));
  last[2]=String(Number(last[1])-.01); rows[rows.length-1]=last.join(',');
  assert.throws(()=>dailyMetrics(rows.join('\n')),/Invalid OHLCV/);
});
