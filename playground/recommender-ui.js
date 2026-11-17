import {bindRefresh} from './refresh.js';
import {dailyMetrics,rankStocks} from './recommender.js';
const $ = id => document.getElementById(id);
const pct = v => (100*v).toFixed(1)+'%';
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function empty(id, title, message) {
  const box = element('div','ranking-empty');
  const icon = element('span','',id === 'growth' ? '↗' : '⌁'); icon.setAttribute('aria-hidden','true');
  box.append(icon,element('h3','',title),element('p','',message)); $(id).replaceChildren(box);
}
function sparkline(values, symbol) {
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns,'svg');
  svg.classList.add('sparkline'); svg.setAttribute('viewBox','0 0 155 40');
  svg.setAttribute('role','img'); svg.setAttribute('aria-label',`${symbol}: daily Close across the latest ${values.length} saved sessions, independently scaled`);
  const min = Math.min(...values), range = Math.max(...values)-min || 1;
  const points = values.map((v,i) => `${2+i*151/(values.length-1)},${36-(v-min)*32/range}`).join(' ');
  const line = document.createElementNS(ns,'polyline');
  line.setAttribute('points',points); line.setAttribute('fill','none'); line.setAttribute('stroke','currentColor'); line.setAttribute('stroke-width','1.8');
  const baseline = document.createElementNS(ns,'line');
  for (const [key,value] of Object.entries({x1:0,x2:155,y1:39,y2:39,stroke:'currentColor','stroke-opacity':'.12'})) baseline.setAttribute(key,value);
  svg.append(baseline,line); return svg;
}
function render(id, rows) {
  $(id).replaceChildren();
  if (!rows.length) { empty(id,'No qualifying candidates','No stocks passed this screen. Check data coverage and exclusions below, or scan again after updating daily files.'); return; }
  const list = element('ol','stock-list');
  for (const [index,s] of rows.entries()) {
    const item = element('li','stock-card'), head = element('div','stock-card-head');
    const identity = element('div','stock-identity'), link = element('a','stock-title',s.symbol);
    link.href = 'index.html?company='+encodeURIComponent(s.ticker);
    const arrow = element('span','','↗'); arrow.setAttribute('aria-hidden','true'); link.append(arrow);
    identity.append(link,element('span','stock-name',s.name));
    const score = element('div','score-ring'); score.style.setProperty('--score',s.score);
    score.setAttribute('aria-label',`Relative score ${s.score.toFixed(1)} out of 100`);
    score.append(element('strong','',s.score.toFixed(0)));
    head.append(element('span','rank-number',String(index+1).padStart(2,'0')),identity,score);
    const history = element('div','price-history'), price = element('div','stock-price');
    price.append(element('strong','',new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(s.price)),element('small','','DAILY CLOSE'));
    history.append(price); if (s.closeTail?.length > 1) history.append(sparkline(s.closeTail,s.symbol));
    const metrics = element('div','stock-metrics');
    const entries = id === 'growth' ? [['252-session return',pct(s.r252)],['126-session return',pct(s.r126)],['Above SMA200',pct(s.trend)],['Annualized volatility',pct(s.volatility)]] : [['20-session return',pct(s.r20)],['Breakout distance',s.breakout.toFixed(2)+' ATR'],['Relative volume',s.volumeRatio.toFixed(2)+'×']];
    for (const [name,value] of entries) { const metric = element('div'); metric.append(element('span','metric-name',name),element('strong','metric-value',value)); metrics.append(metric); }
    const meta = element('div','stock-meta'); meta.append(element('span','',s.sector),element('span','',s.date+' · Daily data'));
    item.append(head,element('p','score-caption',`Relative score ${s.score.toFixed(1)} / 100`),history,metrics,meta); list.append(item);
  }
  $(id).append(list);
}
function feedback(message, state = 'ready') {
  $('rankingStatus').textContent = message;
  $('rankingStatus').parentElement.dataset.state = state;
}
function resetStats() { for (const id of ['sessionStat','eligibleStat','growthStat','swingStat']) $(id).textContent = '—'; }
$('rank').onclick = async () => {
  $('rank').disabled = true; $('rank').textContent = 'Scanning…'; resetStats();
  for (const id of ['growth','swing']) { $(id).setAttribute('aria-busy','true'); empty(id,'Reading daily history','Checking available data and comparing qualifying stocks…'); }
  $('excluded').replaceChildren(); $('exclusions').hidden = true; $('scanProgress').hidden = false; $('scanProgress').removeAttribute('value');
  feedback('Reading the saved catalog…','loading');
  try {
    const response = await fetch('../data/sp500/manifest.json',{cache:'no-store'});
    if (!response.ok) throw new Error('Catalog unavailable. Download daily data using the command below.');
    const {companies} = await response.json();
    if (!Array.isArray(companies)) throw new Error('Invalid catalog');
    const stocks = [], failures = []; let index = 0, completed = 0, missingDaily = 0;
    // Four readers bound local I/O and avoid hundreds of simultaneous CSV requests.
    await Promise.all(Array.from({length:4},async () => {
      while (index < companies.length) {
        const company = companies[index++];
        try {
          if (!company.files?.daily) { missingDaily++; throw new Error('Daily file not downloaded'); }
          const file = await fetch('../data/sp500/'+company.files.daily.path,{cache:'no-store'});
          if (!file.ok) throw new Error('Daily CSV unavailable');
          stocks.push({...company,...dailyMetrics(await file.text())});
        } catch (error) { failures.push(`${company.ticker}: ${error.message}`); }
        feedback(`Reading daily data · ${++completed} of ${companies.length} listings`,'loading');
        $('scanProgress').max = Math.max(1,companies.length); $('scanProgress').value = completed;
      }
    }));
    const result = rankStocks(stocks);
    for (const stock of stocks) if (stock.date !== result.date || stock.dollarVolume < 1000000) failures.push(`${stock.ticker}: older session or dollar volume below $1M`);
    render('growth',result.growth); render('swing',result.swing);
    $('sessionStat').textContent = result.date || 'No daily data';
    $('eligibleStat').textContent = `${result.eligible} / ${companies.length}`;
    $('growthStat').textContent = result.growth.length; $('swingStat').textContent = result.swing.length;
    if (!stocks.length) {
      const noDaily = companies.length > 0 && missingDaily === companies.length;
      feedback(noDaily
        ? `No daily datasets downloaded for the ${companies.length} listings. Rankings require daily prices; the explorer uses hourly prices. Open Manage daily data below, run the download command, then scan again.`
        : 'No valid daily datasets could be loaded. Check Excluded files below for the exact reasons, and Manage daily data for download instructions.', 'error');
      for (const id of ['growth','swing']) empty(id,noDaily ? 'Download daily data to begin' : 'Daily data needs attention',noDaily
        ? 'Hourly charts can work without daily files. Download daily prices using the command in Manage daily data below, then scan again.'
        : 'No saved files passed daily-data validation. Review the exclusion reasons below.');
      $('dailyDataHelp').open = true;
    } else {
      feedback(`Scan complete · ${failures.length} excluded listings. Latest saved session shown above; data may be stale or incomplete. Scores compare each screen’s candidates.`);
    }
    for (const failure of failures.sort()) { const li = document.createElement('li'); li.textContent = failure; $('excluded').append(li); }
    $('exclusions').hidden = !failures.length;
    $('exclusions').open = !stocks.length && missingDaily !== companies.length;
  } catch (error) {
    feedback(error.message,'error');
    for (const id of ['growth','swing']) empty(id,'Daily data unavailable','Open Manage daily data below for the download command, then scan again.');
  }
  finally {
    $('rank').disabled = false; $('rank').textContent = 'Scan saved data ↗'; $('scanProgress').hidden = true;
    for (const id of ['growth','swing']) $(id).setAttribute('aria-busy','false');
  }
};

bindRefresh($('refresh'),$('refreshStatus'));
