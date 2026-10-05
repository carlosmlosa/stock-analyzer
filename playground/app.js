import {addPoint,comparePoints} from './comparison.js';
import {indicators} from './indicators.js';
import {smooth,parseCSV} from './smoothing.js';
import {periods, periodBounds, hasCalendarDates} from './ranges.js';
const $=id=>document.getElementById(id);
const definitions=[['average','MA','#528464','Simple and stable; flattens peaks.'],['gaussian','G','#cb934d','Soft weighting; blurs sharp changes.'],['median','MED','#997bb8','Rejects outliers; can flatten detail.'],['ema','EXP','#578ca2','Uses past samples; lags changes.'],['polynomial','LQ','#ca7565','Preserves curvature; may overshoot.']];
const indicatorDefinitions=[
 ['sma','SMA','#246b42','Trailing Close average · price axis.'],
 ['ema','EMA','#137eaa','Period-based Close EMA · price axis.'],
 ['rsi','RSI','#9166bb','Wilder 14 · 0–100; independent overlay scale.'],
 ['macd','MACD','#c07826','12 / 26 / 9 with signal and histogram · independent scale.'],
 ['volatility','VOL','#bd5265','Log-return standard deviation (%) · independent scale.'],
 ['atr','ATR','#337f83','Wilder 14, in price units · independent scale.']
];
let technical=null, indicatorData=null, indicatorCurves=[];
let loadId=0, catalog=[], selectedCompany="NVDA";
let selectedPoints=[];
let values=[], dates=[], curves=[], datasetName="NVDA", view=[0,1], hover=null, drag=null, activePeriod="all";
for(const [id,name,color,description] of definitions){const label=document.createElement('label');label.className='method';label.style.setProperty('--color',color);const check=document.createElement('input');check.type='checkbox';check.value=id;check.checked=id==='gaussian';check.addEventListener('change',update);const span=document.createElement('span');const strong=document.createElement('strong');strong.textContent=name;const small=document.createElement('small');small.textContent=description;span.append(strong);label.append(check,span);$('methods').append(label);}
for(const [id,name,color,description] of indicatorDefinitions){
 const label=document.createElement('label');label.className='method';label.style.setProperty('--color',color);
 const check=document.createElement('input');check.type='checkbox';check.value=id;check.checked=false;check.addEventListener('change',update);
 const span=document.createElement('span'),strong=document.createElement('strong'),small=document.createElement('small');
 strong.textContent=name;small.textContent=description;span.append(strong);label.append(check,span);$('indicatorMethods').append(label);
}
for (const [id, name] of periods) {
  const button = document.createElement('button');
  button.textContent = name;
  button.dataset.period = id;
  button.setAttribute('aria-pressed', String(id === activePeriod));
  button.onclick = () => selectPeriod(id);
  $('periods').append(button);
}
function syncPeriodButtons() {
  for (const button of $('periods').children) {
    button.setAttribute('aria-pressed', String(button.dataset.period === activePeriod));
    button.disabled = !values.length || (button.dataset.period === 'ytd' && !hasCalendarDates(dates));
  }
}
function selectPeriod(period) {
  if (!values.length) return;
  activePeriod = period;
  view = periodBounds(dates, period, values.length);
  hover = null;
  $('tooltip').hidden = true;
  syncPeriodButtons();
  draw();
}
function update(){const width=Number($('window').value),alpha=Number($('alpha').value)/100;$('windowValue').textContent=String(width);$('alphaValue').textContent=alpha.toFixed(2);curves=definitions.filter(([id])=>$('methods').querySelector(`input[value="${id}"]`).checked).map(([id,name,color])=>({id,name,color,data:smooth(values,id,width,alpha)}));updateIndicatorCurves();$('sampleCount').textContent=values.length+' trading sessions'+(dates.length?' · '+dates[0]+' → '+dates.at(-1):'');$('metrics').replaceChildren();const rough=a=>a.slice(1).reduce((sum,v,i)=>sum+Math.abs(v-a[i]),0)/Math.max(1,a.length-1);const rawRough=rough(values);for(const curve of curves){const card=document.createElement('div');card.className='metric';const name=document.createElement('div');name.className='name';name.style.color=curve.color;name.textContent=curve.name;const value=document.createElement('b');value.textContent=(rawRough?100*(1-rough(curve.data)/rawRough):0).toFixed(0)+'%';const label=document.createElement('small');label.textContent='less point-to-point variation';card.append(name,value,label);$('metrics').append(card);}draw();}
const canvas=$('chart'),ctx=canvas.getContext('2d');let geometry;
function updateIndicatorCurves(){
 indicatorCurves=[];
 if(!technical){$('indicatorNote').textContent='Aligned Close, High and Low data is required for technical indicators.';return;}
 const period=Math.max(2,Math.min(200,Number($('indicatorPeriod').value)||20));
 $('indicatorPeriod').value=period;
 indicatorData=indicators(technical.close,technical.high,technical.low,period);
 for(const [id,name,color] of indicatorDefinitions){
  if(!$('indicatorMethods').querySelector(`input[value="${id}"]`).checked)continue;
  const axis=['sma','ema'].includes(id)?'price':id;
  indicatorCurves.push({id:'indicator_'+id,name,color,data:indicatorData[id],axis,unit:id==='rsi'?' RSI':id==='volatility'?'%':' $'});
  if(id==='macd'){
   indicatorCurves.push({id:'indicator_signal',name:'MACD signal',color:'#cf9d70',data:indicatorData.signal,axis,unit:' $'});
   indicatorCurves.push({id:'indicator_histogram',name:'MACD histogram',color:'#b89253',data:indicatorData.histogram,axis,unit:' $',bars:true});
  }
 }
 $('indicatorNote').textContent='SMA / EMA use the price axis. Other indicators fit independently to the chart height; the right axis is relative position within each displayed range. Actual values appear on hover and ranges in the legend.';
}
function draw(){
 renderComparison();
 $('chartLegend').replaceChildren();
 if(!values.length)return;
 const box=canvas.getBoundingClientRect(),w=box.width,h=box.height,dpr=window.devicePixelRatio||1;
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.scale(dpr,dpr);
 const overlays=indicatorCurves.filter(c=>c.axis!=='price'),left=55,right=w-(overlays.length?65:15),top=25,bottom=h-35;
 const start=Math.max(0,Math.floor(view[0])),end=Math.min(values.length-1,Math.ceil(view[1]));
 const priceCurves=[...curves,...indicatorCurves.filter(c=>c.axis==='price')];
 let min=Infinity,max=-Infinity;
 for(const a of [values,...priceCurves.map(c=>c.data)])for(let i=start;i<=end;i++)if(Number.isFinite(a[i])){min=Math.min(min,a[i]);max=Math.max(max,a[i]);}
 const pad=(max-min||1)*.12;min-=pad;max+=pad;
 const single=view[0]===view[1];
 const x=i=>single?(left+right)/2:left+(i-view[0])/(view[1]-view[0])*(right-left),y=v=>bottom-(v-min)/(max-min)*(bottom-top);
 geometry={left,right,top,bottom,x,y,w,h};
 const scales=new Map();
 for(const axis of new Set(overlays.map(c=>c.axis))){
  let lo=Infinity,hi=-Infinity;
  for(const c of overlays.filter(c=>c.axis===axis))for(let i=start;i<=end;i++)if(Number.isFinite(c.data[i])){lo=Math.min(lo,c.data[i]);hi=Math.max(hi,c.data[i]);}
  if(axis==='rsi'){lo=0;hi=100;}
  if(!Number.isFinite(lo))continue;
  if(axis==='macd'){lo=Math.min(0,lo);hi=Math.max(0,hi);}
  if(hi===lo){lo-=.5;hi+=.5;}
  scales.set(axis,{lo,hi,y:v=>bottom-(v-lo)/(hi-lo)*(bottom-top)});
 }
 for(const c of [...($('raw').checked?[{name:'Stock High',color:'#8b9787'}]:[]),...curves,...indicatorCurves]){
  const label=document.createElement('span');label.style.color=c.color;
  const scale=scales.get(c.axis);
  label.textContent=c.name+(c.axis&&c.axis!=='price'?(scale?` (${scale.lo.toFixed(2)}–${scale.hi.toFixed(2)}${c.unit})`:' (warming up)'):'');
  $('chartLegend').append(label);
 }
 $('sampleCount').textContent=(end-start+1)+' visible / '+values.length+(dates.some(date=>date.length>10)?' bars':' sessions')+(dates.length?' · '+dates[start]+' → '+dates[end]:'');
 ctx.font='10px system-ui';ctx.lineWidth=1;
 ctx.fillStyle='#8b9787';ctx.textAlign='left';ctx.fillText('Price ($)',left,12);
 if(overlays.length){ctx.textAlign='right';ctx.fillText('Relative range',w-4,12);}
 for(let k=0;k<=5;k++){
  const yy=top+(bottom-top)*k/5;ctx.strokeStyle='#edf0e8';ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();
  ctx.fillStyle='#8b9787';ctx.textAlign='right';ctx.fillText((max-(max-min)*k/5).toFixed(1),left-10,yy+3);
  if(overlays.length){ctx.textAlign='left';ctx.fillText((100-20*k)+'%',right+8,yy+3);}
  ctx.textAlign='center';const i=view[0]+(view[1]-view[0])*k/5;
  if(!single||k===0)ctx.fillText(dates[Math.max(0,Math.min(values.length-1,Math.round(i)))]?.slice(view[1]-view[0]<12&&dates.some(date=>date.length>10)?11:0,view[1]-view[0]<12&&dates.some(date=>date.length>10)?16:view[1]-view[0]<90?10:7)||String(Math.round(i)+1),x(i),bottom+22);
 }
 // A month boundary is the first available bar in that exchange-local month.
 ctx.strokeStyle='#d8e1d5';ctx.lineWidth=1;
 for(let i=start;i<=end;i++){
  if(!dates[i]||i>0&&dates[i].slice(0,7)===dates[i-1].slice(0,7))continue;
  if(x(i)<left||x(i)>right)continue;
  ctx.beginPath();ctx.moveTo(x(i),top);ctx.lineTo(x(i),bottom);ctx.stroke();
 }
 ctx.save();ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();
 function line(a,color,width,mapY=y,bars=false){
  ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=width;ctx.beginPath();let connected=false;
  for(let i=start;i<=end;i++){
   if(!Number.isFinite(a[i])){connected=false;continue;}
   if(bars){ctx.globalAlpha=.45;ctx.fillRect(x(i)-1,Math.min(mapY(0),mapY(a[i])),2,Math.max(1,Math.abs(mapY(a[i])-mapY(0))));ctx.globalAlpha=1;continue;}
   if(connected)ctx.lineTo(x(i),mapY(a[i]));else ctx.moveTo(x(i),mapY(a[i]));connected=true;
   if(start===end){ctx.beginPath();ctx.arc(x(i),mapY(a[i]),width+2,0,Math.PI*2);ctx.fill();}
  }ctx.stroke();
 }
 if($('raw').checked)line(values,'#bec7b8',1);
 priceCurves.forEach(c=>line(c.data,c.color,2.3));
 overlays.forEach(c=>{const scale=scales.get(c.axis);if(scale)line(c.data,c.color,2,scale.y,c.bars);});
 if(hover!==null){ctx.strokeStyle='#a2b298';ctx.lineWidth=1;ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(x(hover),top);ctx.lineTo(x(hover),bottom);ctx.stroke();ctx.setLineDash([]);}
 for(const [number,index] of selectedPoints.entries()){
  if(index<view[0]||index>view[1])continue;
  ctx.strokeStyle=number===0?'#2c659a':'#bc6242';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1.5;
  ctx.setLineDash([5,3]);ctx.beginPath();ctx.moveTo(x(index),top);ctx.lineTo(x(index),bottom);ctx.stroke();ctx.setLineDash([]);
  ctx.beginPath();ctx.arc(x(index),y(values[index]),5,0,Math.PI*2);ctx.fill();
 }
 ctx.restore();
}
function point(event){const r=canvas.getBoundingClientRect();return event.clientX-r.left;}
canvas.addEventListener('pointermove',event=>{if(!values.length)return;if(drag){if(Math.hypot(point(event)-drag.x,event.clientY-drag.y)>5)drag.moved=true;if(!drag.moved)return;const delta=(point(event)-drag.x)/(geometry.right-geometry.left)*(drag.view[1]-drag.view[0]);setView(drag.view[0]-delta,drag.view[1]-delta);return;}hover=Math.max(0,Math.min(values.length-1,Math.round(view[0]+(point(event)-geometry.left)/(geometry.right-geometry.left)*(view[1]-view[0]))));const tip=$('tooltip');tip.replaceChildren();for(const [name,value] of [[dates.length?'Date':'Sample',dates.length?dates[hover]:hover+1],['Original',values[hover]],...[...curves,...indicatorCurves].map(c=>[c.name,c.data[hover]])]){const row=document.createElement('div');row.textContent=name+': '+(name==='Sample'||name==='Date'?value:Number.isFinite(value)?value.toFixed(3):'warming up');tip.append(row);}tip.hidden=false;tip.style.left=Math.min(Math.max(0,point(event)+12),geometry.w-220)+'px';tip.style.top='25px';draw();});
canvas.addEventListener('pointerleave',()=>{hover=null;$('tooltip').hidden=true;draw();});
canvas.addEventListener('pointerdown',e=>{
 if(!values.length||e.button!==0)return;
 const x=point(e),y=e.clientY-canvas.getBoundingClientRect().top;
 if(x<geometry.left||x>geometry.right||y<geometry.top||y>geometry.bottom)return;
 drag={x,y:e.clientY,view:[...view],moved:false};canvas.setPointerCapture(e.pointerId);$('tooltip').hidden=true;
});
canvas.addEventListener('pointerup',e=>{
 if(!drag)return;
 const moved=drag.moved||Math.hypot(point(e)-drag.x,e.clientY-drag.y)>5;
 drag=null;
 if(!moved){const index=Math.max(0,Math.min(values.length-1,Math.round(view[0]+(point(e)-geometry.left)/(geometry.right-geometry.left)*(view[1]-view[0]))));selectedPoints=addPoint(selectedPoints,index);draw();}
});
canvas.addEventListener('pointercancel',()=>drag=null);
canvas.addEventListener('lostpointercapture',()=>drag=null);
function renderComparison(){
 const output=$('comparison');
 $('clearPoints').hidden=!selectedPoints.length;
 if(!selectedPoints.length){output.textContent='Click two points to compare';return;}
 output.replaceChildren();
 for(const [position,index] of selectedPoints.entries()){
  const row=document.createElement('span');row.className='comparison-date';row.style.color=position===0?'#2c659a':'#bc6242';
  row.textContent='● '+(dates[index]?.slice(0,10)||'Bar '+(index+1));output.append(row);
 }
 if(selectedPoints.length<2)return;
 const [a,b]=selectedPoints,c=comparePoints(values,dates,selectedPoints);
 const signed=(v,d=2)=>v===null?'n/a':(v>0?'+':'')+v.toFixed(d);
 const delta=document.createElement('span');delta.className='comparison-delta';
 delta.style.color=c.change>0?'#218447':c.change<0?'#c23c3c':'#365540';
 delta.textContent='Δ '+signed(c.percent)+'% ($'+signed(c.change,3)+')';output.append(delta);
 const time=document.createElement('span');time.className='comparison-time';
 const dateTime=i=>Date.parse((dates[i]||'').slice(0,10)+'T00:00:00Z');
 const days=Math.abs(Math.round((dateTime(b)-dateTime(a))/86400000));
 time.textContent=Number.isFinite(days)?'Δt '+days+' days':'Δt n/a';output.append(time);
}
$('clearPoints').onclick=()=>{selectedPoints=[];draw();};
function setView(a,b){const span=Math.min(values.length-1,Math.max(1,b-a));a=Math.max(0,Math.min(values.length-1-span,a));view=[a,a+span];activePeriod=null;syncPeriodButtons();draw();}
canvas.addEventListener('wheel',e=>{if(!values.length)return;e.preventDefault();const fraction=Math.max(0,Math.min(1,(point(e)-geometry.left)/(geometry.right-geometry.left))),center=view[0]+fraction*(view[1]-view[0]),span=(view[1]-view[0])*Math.exp(e.deltaY*.001);setView(center-fraction*span,center+(1-fraction)*span);},{passive:false});
$('reset').onclick=()=>selectPeriod(activePeriod || 'all');$('window').oninput=update;$('alpha').oninput=update;$('raw').onchange=draw;
function loadHigh(col){selectedPoints=[];values=col.values;dates=col.dates||[];hover=null;$('tooltip').hidden=true;$('chartTitle').textContent=datasetName+' · '+col.name;if(!hasCalendarDates(dates))activePeriod='all';view=periodBounds(dates,activePeriod || 'all',values.length);syncPeriodButtons();$('rangeNote').textContent=hasCalendarDates(dates)?'Fixed trading-session windows end on '+dates.at(-1).slice(0,10)+'. '+(dates.some(date=>date.length>10)?'Hourly bars use New York time. ':'')+'YTD starts January 1.':'Fixed sample-count windows; YTD requires ascending YYYY-MM-DD dates.';$('status').textContent=`Loaded ${values.length} samples. ${col.skipped} missing or nonnumeric rows omitted.${col.total>10000?' Limited to first 10,000 numeric samples.':''}`;update();}
function setDataset(text,name){
 const columns=parseCSV(text);
 const high=columns.find(column=>column.name.toLowerCase()==='high');
 const close=columns.find(column=>column.name.toLowerCase()==='close');
 const low=columns.find(column=>column.name.toLowerCase()==='low');
 technical=close&&low&&high&&[close,low].every(c=>c.dates?.length===high.dates?.length&&c.dates.every((d,i)=>d===high.dates[i]))?{close:close.values,high:high.values,low:low.values}:null;
 if(!high)throw new Error('This dataset has no usable High prices.');
 datasetName=name;
 loadHigh(high);
}
function renderCompanies() {
 const query=$('companySearch').value.trim().toLowerCase();
 const matches=catalog.filter(company => [company.symbol,company.name,company.sector].some(value=>value.toLowerCase().includes(query)));
 const visible=[...matches];
 const selected=catalog.find(company=>company.ticker===selectedCompany);
 if(selected && !visible.includes(selected))visible.unshift(selected);
 $('company').replaceChildren(...visible.map(company=>new Option(company.symbol+' · '+company.name,company.ticker)));
 $('company').value=selectedCompany;
 const resolution='hourly';
 $('catalogStatus').textContent=matches.length+' matching listings · '+catalog.filter(c=>c.files[resolution]).length+'/'+catalog.length+' hourly datasets downloaded';
}
async function loadCatalog() {
 try {
  const response=await fetch('../data/sp500/manifest.json',{cache:'no-store'});
  if(!response.ok)throw new Error('Catalog unavailable');
  const data=await response.json(); catalog=data.companies;
  if(!catalog.some(company=>company.ticker===selectedCompany))selectedCompany=catalog[0].ticker;
  renderCompanies();
 }catch(error){$('catalogStatus').textContent='S&P 500 catalog unavailable. Run download_sp500.py to create it.';}
 await loadStock();
}
async function loadStock(){
 const requestId=++loadId, resolution='hourly';
 const company=catalog.find(company=>company.ticker===selectedCompany);
 // Clear the previous series immediately so it cannot be mistaken for the new selection.
 selectedPoints=[];renderComparison();values=[];dates=[];curves=[];technical=null;indicatorData=null;indicatorCurves=[];hover=null;drag=null;$('chartLegend').replaceChildren();
 ctx.clearRect(0,0,canvas.width,canvas.height);$('metrics').replaceChildren();
 $('tooltip').hidden=true;$('sampleCount').textContent='';syncPeriodButtons();
 $('chartTitle').textContent=(company?company.symbol:selectedCompany)+' · Loading…';
 $('status').textContent='Loading downloaded '+selectedCompany+' data…';
 const file=company?.files[resolution];
 const path=file?'../data/sp500/'+file.path:!catalog.length?'../data/nvda_hourly.csv':null;
 try {
   if(!path)throw new Error('Hourly data is not downloaded yet. Run download_sp500.py to save it.');
   const response=await fetch(path,{cache:'no-store'});
   if(!response.ok)throw new Error('Downloaded CSV is unavailable. Run download_sp500.py to save it.');
   const text=await response.text();
   if(requestId!==loadId)return;
   setDataset(text,(company?company.symbol:selectedCompany)+' '+resolution);
 }catch(error){if(requestId!==loadId)return;$('status').textContent=error.message;$('chartTitle').textContent=(company?company.symbol:selectedCompany)+' · Data unavailable';}
}
$('companySearch').oninput=renderCompanies;
$('company').onchange=()=>{selectedCompany=$('company').value;loadStock();};
$('export').onclick=()=>{if(!values.length)return;const content=[['sample','date','original',...[...curves,...indicatorCurves].map(c=>c.id)].join(','),...values.map((v,i)=>[i+1,dates[i] ? '"'+dates[i].replaceAll('"','""')+'"' : '',v,...[...curves,...indicatorCurves].map(c=>c.data[i]??'')].join(','))].join('\n');const url=URL.createObjectURL(new Blob([content],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download='signal-lab-comparison.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};new ResizeObserver(draw).observe(canvas);

$('indicatorPeriod').onchange=update;
$('refresh').onclick=async()=>{
 const ticker=selectedCompany;
 $('refresh').disabled=true;$('refreshStatus').textContent='Fetching latest available '+ticker+' hourly bars…';
 try{
  const response=await fetch('/api/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticker})});
  if(response.status===501||response.status===404)throw new Error('Start the refresh server with: python server.py');
  const result=await response.json();if(!response.ok)throw new Error(result.message);
  $('refreshStatus').textContent=result.message;await loadCatalog();
 }catch(error){$('refreshStatus').textContent=error.message;}
 finally{$('refresh').disabled=false;}
};

loadCatalog();

const comparisonBox=$('comparisonBox'),comparisonHandle=$('comparisonHandle');
let boxDrag=null;
function placeComparison(left,top){
 const bounds=comparisonBox.parentElement.getBoundingClientRect();
 comparisonBox.style.right='auto';comparisonBox.style.bottom='auto';
 comparisonBox.style.left=Math.max(0,Math.min(bounds.width-comparisonBox.offsetWidth,left))+'px';
 comparisonBox.style.top=Math.max(0,Math.min(bounds.height-comparisonBox.offsetHeight,top))+'px';
}
comparisonHandle.addEventListener('pointerdown',event=>{
 if(event.button!==0)return;
 const box=comparisonBox.getBoundingClientRect(),bounds=comparisonBox.parentElement.getBoundingClientRect();
 boxDrag={x:event.clientX,y:event.clientY,left:box.left-bounds.left,top:box.top-bounds.top};
 comparisonHandle.setPointerCapture(event.pointerId);event.preventDefault();
});
comparisonHandle.addEventListener('pointermove',event=>{
 if(boxDrag)placeComparison(boxDrag.left+event.clientX-boxDrag.x,boxDrag.top+event.clientY-boxDrag.y);
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])comparisonHandle.addEventListener(type,()=>boxDrag=null);
new ResizeObserver(()=>{
 if(comparisonBox.style.left)placeComparison(parseFloat(comparisonBox.style.left),parseFloat(comparisonBox.style.top));
}).observe(comparisonBox.parentElement);
