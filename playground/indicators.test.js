import test from 'node:test';
import assert from 'node:assert/strict';
import {average,indicators} from './indicators.js';
test('SMA is trailing and EMA is seeded with a full-window mean',()=>{
 assert.deepEqual(average([1,2,3,4],3),[null,null,2,3]);
 assert.deepEqual(average([1,2,3,8],3,.5),[null,null,2,5]);
});
test('flat market has neutral RSI, zero volatility/MACD and known ATR',()=>{
 const close=Array(60).fill(100),data=indicators(close,close.map(v=>v+2),close.map(v=>v-2));
 assert.equal(data.rsi[13],null);assert.equal(data.rsi[14],50);
 assert.equal(data.atr[12],null);assert.equal(data.atr[13],4);
 assert.equal(data.volatility[19],null);assert.equal(data.volatility[20],0);
 assert.equal(data.macd[24],null);assert.equal(data.macd[25],0);
 assert.equal(data.signal[32],null);assert.equal(data.signal[33],0);
});
test('RSI extremes and true range include overnight gaps',()=>{
 const close=Array.from({length:40},(_,i)=>100+i);
 assert.equal(indicators(close,close,close).rsi[14],100);
 assert.equal(indicators([...close].reverse(),[...close].reverse(),[...close].reverse()).rsi[14],0);
 const gap=[100,...Array(20).fill(110)];
 assert.equal(indicators(gap,gap,gap).atr[13],10/14);
});
test('indicators never use future prices',()=>{
 const close=Array.from({length:80},(_,i)=>100+Math.sin(i)*5+i);
 const first=indicators(close,close.map(v=>v+1),close.map(v=>v-1));
 const changed=close.map((v,i)=>i>=50?v*3:v);
 const second=indicators(changed,changed.map(v=>v+1),changed.map(v=>v-1));
 for(const key of Object.keys(first))assert.deepEqual(first[key].slice(0,50),second[key].slice(0,50));
});
