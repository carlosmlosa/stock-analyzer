import test from 'node:test';
import assert from 'node:assert/strict';
import {bindRefresh} from './refresh.js';

test('shared refresh posts bounded JSON and reloads after success',async()=>{
  const original=globalThis.fetch, button={disabled:false}, status={};let reloaded=0;
  try {
    globalThis.fetch=async(url,request)=>{
      assert.equal(url,'/api/refresh');assert.equal(request.method,'POST');
      assert.equal(request.headers['Content-Type'],'application/json');assert.equal(request.body,'{}');
      assert.equal(button.disabled,true);
      return {ok:true,status:200,json:async()=>({message:'Updated hourly prices'})};
    };
    bindRefresh(button,status,async()=>reloaded++);await button.onclick();
    assert.equal(reloaded,1);assert.equal(status.textContent,'Updated hourly prices');assert.equal(button.disabled,false);
  } finally {globalThis.fetch=original;}
});
test('shared refresh displays server errors and restores the button',async()=>{
  const original=globalThis.fetch;
  try {
    for (const code of [409,502,404]) {
      const button={disabled:false},status={};let reloaded=false;
      globalThis.fetch=async()=>({ok:false,status:code,json:async()=>({message:'Already updating'})});
      bindRefresh(button,status,async()=>reloaded=true);await button.onclick();
      assert.equal(button.disabled,false);assert.equal(reloaded,false);
      assert.match(status.textContent,code===404 ? /python server.py/ : /Already updating/);
    }
  } finally {globalThis.fetch=original;}
});
test('an active refresh cannot be submitted twice on the same page',async()=>{
  const button={disabled:true},status={textContent:'Updating'};
  bindRefresh(button,status);await button.onclick();assert.equal(status.textContent,'Updating');
});
