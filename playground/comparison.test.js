import test from 'node:test';
import assert from 'node:assert/strict';
import {addPoint,comparePoints} from './comparison.js';
test('third selection keeps only the last two points',()=>{
 assert.deepEqual(addPoint(addPoint(addPoint([],2),5),8),[5,8]);
});
test('price change and signed elapsed time use click order',()=>{
 const values=[100,110,120],dates=['2026-01-01','2026-01-02','2026-01-03'];
 assert.deepEqual(comparePoints(values,dates,[0,1]),{change:10,percent:10,bars:1,elapsed:86400000,timePercent:50});
 const backwards=comparePoints(values,dates,[2,0]);
 assert.equal(backwards.change,-20);assert.equal(backwards.elapsed,-172800000);assert.equal(backwards.timePercent,-100);
});
test('hourly offsets, zero baseline and coincident points',()=>{
 const dates=['2026-01-01 09:30:00-05:00','2026-01-01 10:30:00-05:00'];
 const c=comparePoints([0,5],dates,[0,1]);assert.equal(c.percent,null);assert.equal(c.elapsed,3600000);
 assert.equal(comparePoints([5,5],dates,[1,1]).change,0);
});
