import test from 'node:test';
import assert from 'node:assert/strict';
import {smooth,parseCSV} from './smoothing.js';
test('all smoothers preserve constant signals, including boundaries',()=>{for(const method of ['average','gaussian','median','ema','polynomial'])assert.ok(smooth(Array(30).fill(7),method).every(v=>Math.abs(v-7)<1e-9));});
test('local quadratic preserves a quadratic including edge fits',()=>{const a=Array.from({length:40},(_,i)=>3*i*i-2*i+7);assert.ok(smooth(a,'polynomial',11).every((v,i)=>Math.abs(v-a[i])<1e-7));});
test('median rejects an isolated outlier',()=>{assert.equal(smooth([1,1,1,100,1,1,1],'median',3)[3],1);});
test('EMA is causal and uses the first sample as initialization',()=>{assert.deepEqual(smooth([0,10,0],'ema',3,.5),[0,5,2.5]);});
test('CSV supports quoted headers, missing values, and headerless data',()=>{assert.deepEqual(parseCSV('Date,"Closing, adjusted"\r\nA,2\r\nB,\r\nC,4\r\nD,6')[0],{name:'Closing, adjusted',values:[2,4,6],skipped:1,total:3,dates:['A','C','D']});assert.deepEqual(parseCSV('1\n2\n3')[0].values,[1,2,3]);assert.throws(()=>parseCSV('name\ntext'));});

test('downloaded NVDA data loads all closing prices with aligned dates',async()=>{const {readFile}=await import('node:fs/promises');const text=await readFile(new URL('../data/nvda_10y.csv',import.meta.url),'utf8');const close=parseCSV(text).find(c=>c.name==='Close');assert.ok(close.values.length>2000);assert.equal(close.values.length,close.dates.length);assert.equal(close.dates[0],'2016-09-26');assert.equal(close.values[0],1.578442931175232);assert.equal(close.dates.at(-1),'2026-09-24');assert.equal(close.values.at(-1),222.26499938964844);});

import {periodBounds} from './ranges.js';
test('fixed-session windows include the latest sample and clamp to available history',()=>{
 const count=3000;
 for(const [period,sessions] of [['day',1],['week',5],['month',21],['year',252],['2years',504],['5years',1260],['10years',2520],['all',3000]]) assert.deepEqual(periodBounds([],period,count),[count-sessions,count-1]);
 assert.deepEqual(periodBounds([],'10years',20),[0,19]);
 assert.deepEqual(periodBounds(['2025-12-31','2026-01-02','2026-09-24'],'ytd'),[1,2]);
});

test('hourly windows count trading dates and retain all bars for each session',()=>{
 const dates=['2025-12-31 09:30:00-05:00','2025-12-31 10:30:00-05:00','2026-01-02 09:30:00-05:00','2026-01-02 10:30:00-05:00','2026-01-05 09:30:00-05:00','2026-01-05 10:30:00-05:00'];
 assert.deepEqual(periodBounds(dates,'day'),[4,5]);
 assert.deepEqual(periodBounds(dates,'week'),[0,5]);
 assert.deepEqual(periodBounds(dates,'ytd'),[2,5]);
 const close=parseCSV('Date,Close\n2026-01-02 09:30:00-05:00,10\n2026-01-02 10:30:00-05:00,11\n2026-01-02 11:30:00-05:00,12')[0];
 assert.equal(close.dates[0],dates[2]);
});
