
/* ====== Tabs ====== */
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab').forEach(s=>s.classList.remove('active'));
    document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
    if(btn.dataset.tab==='journal'){ renderJournal(); }
    if(btn.dataset.tab==='stats'){ computeStats(); drawEquity(); renderMonthly(); }
  });
});

/* ====== Helpers ====== */
const $ = id => document.getElementById(id);
const fmt = (n,d=2)=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const nowISO = ()=> new Date().toISOString();
const isJPY = pair => (pair||'').toUpperCase().includes('JPY');
const pipUnit = pair => isJPY(pair) ? 0.01 : 0.0001;

/* ====== Risk Manager ====== */
const RKEY='alz_risk_inputs_v2';
(function restoreRisk(){
  const s=localStorage.getItem(RKEY); if(!s) return;
  const v=JSON.parse(s);
  ['pair','price','balance','riskPct','stopPips','pipValue'].forEach(k=>{ if(v[k]!=null) $(k).value=v[k]; });
})();

$('calcBtn').addEventListener('click', ()=>{
  const balance=+$('balance').value||0;
  const riskPct=(+$('riskPct').value||0)/100;
  const stopPips=+$('stopPips').value||0;
  const pipValue=+$('pipValue').value||0;

  if(balance<=0 || riskPct<=0 || stopPips<=0 || pipValue<=0){
    $('riskOut').hidden=false;
    $('riskOut').innerHTML='⚠️ تأكد من إدخال قيم صحيحة (أكبر من صفر).';
    return;
  }
  const riskUSD = balance * riskPct;
  const lots = riskUSD / (stopPips * pipValue);

  $('riskOut').hidden=false;
  $('riskOut').innerHTML = `
    <div class="result-line"><span>المخاطرة بالدولار:</span><strong>$${fmt(riskUSD)}</strong></div>
    <div class="result-line"><span>الحجم المقترح:</span><strong>${fmt(lots,2)} لوت</strong></div>
  `;

  // Prefill add-trade
  $('tPair').value = ($('pair').value||'').toUpperCase();
  $('tLot').value = fmt(lots,2);

  localStorage.setItem(RKEY, JSON.stringify({
    pair:$('pair').value, price:$('price').value, balance, riskPct:riskPct*100,
    stopPips, pipValue
  }));
});

/* ====== Journal ====== */
const JKEY='alz_trades_v2';
function load(){ return JSON.parse(localStorage.getItem(JKEY)||'[]'); }
function save(rows){ localStorage.setItem(JKEY, JSON.stringify(rows)); }

$('saveTrade').addEventListener('click', ()=>{
  const p = ($('tPair').value||$('pair').value||'EURUSD').toUpperCase();
  const trade = {
    id: Date.now(),
    ts: Date.now(),
    date: new Date().toLocaleString(),
    pair: p,
    side: $('tSide').value,
    entry: +$('tEntry').value||0,
    sl: +$('tSL').value||0,
    tp: +$('tTP').value||0,
    lot: +$('tLot').value||0,
    result: $('tRes').value,
    notes: $('tNotes').value||'',
    pipValue: +$('pipValue').value||10 // snapshot for PnL
  };

  // R if SL/TP provided
  if(trade.entry && trade.sl){
    const stopPips = Math.abs(trade.entry - trade.sl) / pipUnit(trade.pair);
    const takePips = trade.tp ? Math.abs(trade.tp - trade.entry) / pipUnit(trade.pair) : 0;
    trade.r = stopPips>0 && takePips>0 ? takePips/stopPips : 0;
  } else trade.r = 0;

  const rows = load(); rows.unshift(trade); save(rows);
  ['tEntry','tSL','tTP','tLot','tNotes'].forEach(id=>$(id).value='');
  alert('تم حفظ الصفقة ✅');
});

function calcPnL(t){
  if(!t.entry || !t.sl || !t.lot || !t.pipValue) return 0;
  const stopPips = Math.abs(t.entry - t.sl)/pipUnit(t.pair);
  const riskUSD = stopPips * t.pipValue * t.lot;
  if(t.result==='LOSS') return -riskUSD;
  if(t.result==='BE') return 0;
  if(t.result==='WIN'){
    if(t.tp){
      const takePips = Math.abs(t.tp - t.entry)/pipUnit(t.pair);
      return takePips * t.pipValue * t.lot;
    }
    return riskUSD; // fallback 1R
  }
  return 0;
}

function renderJournal(){
  const rows = load();
  const tb = $('tbody'); tb.innerHTML='';
  rows.forEach(t=>{
    const pnl = calcPnL(t);
    const r = (t.r|| (t.tp&&t.sl&&t.entry? (Math.abs(t.tp-t.entry)/pipUnit(t.pair)) / (Math.abs(t.entry-t.sl)/pipUnit(t.pair)) : 0));
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.date}</td>
      <td>${t.pair}</td>
      <td>${t.side}</td>
      <td>${t.entry||''}</td>
      <td>${t.sl||''}</td>
      <td>${t.tp||''}</td>
      <td>${t.lot||''}</td>
      <td>
        <select data-id="${t.id}" class="resSel">
          <option value="PENDING" ${t.result==='PENDING'?'selected':''}>PENDING</option>
          <option value="WIN" ${t.result==='WIN'?'selected':''}>WIN</option>
          <option value="LOSS" ${t.result==='LOSS'?'selected':''}>LOSS</option>
          <option value="BE" ${t.result==='BE'?'selected':''}>BE</option>
        </select>
      </td>
      <td>${fmt(r,2)}</td>
      <td>${(pnl>=0?'+':'')}${fmt(pnl,2)}</td>
      <td><button class="danger" data-del="${t.id}">حذف</button></td>
    `;
    tb.appendChild(tr);
  });

  tb.querySelectorAll('.resSel').forEach(sel=>{
    sel.addEventListener('change', e=>{
      const id = +e.target.dataset.id;
      const rows = load();
      const t = rows.find(x=>x.id===id);
      if(t){ t.result = e.target.value; save(rows); computeStats(); drawEquity(); renderJournal(); renderMonthly(); }
    });
  });
  tb.querySelectorAll('button[data-del]').forEach(b=>{
    b.addEventListener('click', e=>{
      const id = +b.dataset.del;
      const rows = load().filter(x=>x.id!==id);
      save(rows); renderJournal(); computeStats(); drawEquity(); renderMonthly();
    });
  });
}

/* ====== Stats & Charts ====== */
function seriesPnL(){
  const rows = load().slice().reverse();
  let acc=0; const s=[];
  rows.forEach(t=>{ acc += calcPnL(t); s.push(acc); });
  return s;
}

function computeStats(){
  const rows = load();
  const total = rows.length;
  const w = rows.filter(t=>t.result==='WIN').length;
  const l = rows.filter(t=>t.result==='LOSS').length;
  const be = rows.filter(t=>t.result==='BE').length;
  const wr = total? Math.round((w/total)*100):0;
  const net = rows.reduce((a,t)=>a+calcPnL(t),0);
  const avgR = rows.filter(t=>t.r).reduce((a,t)=>a+t.r,0) / (rows.filter(t=>t.r).length||1);

  $('kTotal').textContent = total;
  $('kWin').textContent = w;
  $('kLoss').textContent = l;
  $('kWR').textContent = wr + '%';
  $('kNet').textContent = '$' + fmt(net,2);
  $('kAvgR').textContent = fmt(avgR,2);
}

function drawEquity(){
  const canvas = document.getElementById('equity');
  const ctx = canvas.getContext('2d');
  const data = seriesPnL();
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  // axes
  ctx.strokeStyle = '#2a3347'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(40,10); ctx.lineTo(40,H-20); ctx.lineTo(W-10,H-20); ctx.stroke();

  if(data.length===0) return;
  const minV = Math.min(0, ...data);
  const maxV = Math.max(0, ...data);
  const span = (maxV-minV)||1;

  // plot
  ctx.beginPath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ff7a18';
  data.forEach((v,i)=>{
    const x = 40 + i*((W-60)/Math.max(1,data.length-1));
    const y = (H-20) - ((v-minV)/span)*(H-30);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
}

function renderMonthly(){
  const rows = load();
  const map = {};
  rows.forEach(t=>{
    const d = new Date(t.ts||Date.now());
    const k = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    map[k] = map[k] || {count:0,win:0,loss:0,be:0,net:0,rs:[]};
    map[k].count++; map[k].net += calcPnL(t);
    if(t.result==='WIN') map[k].win++;
    if(t.result==='LOSS') map[k].loss++;
    if(t.result==='BE') map[k].be++;
    if(t.r) map[k].rs.push(t.r);
  });
  const tb = document.getElementById('tbodyMonth'); tb.innerHTML='';
  Object.entries(map).sort(([a],[b])=>a.localeCompare(b)).forEach(([m,v])=>{
    const wr = v.count? Math.round((v.win/v.count)*100):0;
    const avgR = v.rs.length? v.rs.reduce((a,b)=>a+b,0)/v.rs.length : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${m}</td><td>${v.count}</td><td>${v.win}</td><td>${v.loss}</td><td>${v.be}</td><td>${wr}%</td><td>${fmt(v.net,2)}</td><td>${fmt(avgR,2)}</td>`;
    tb.appendChild(tr);
  });
}

/* ====== Export / Import ====== */
document.getElementById('btnCsv').addEventListener('click', ()=>{
  const rows = load();
  const csv = ['date,pair,side,entry,sl,tp,lot,result,r,pnl'];
  rows.forEach(t=>csv.push([t.date,t.pair,t.side,t.entry,t.sl,t.tp,t.lot,t.result,(t.r||0),calcPnL(t)].join(',')));
  const blob = new Blob([csv.join('\n')], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='trades.csv'; a.click(); URL.revokeObjectURL(url);
});

document.getElementById('btnExportJson').addEventListener('click', ()=>{
  const blob = new Blob([localStorage.getItem('alz_trades_v2')||'[]'], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='trades-backup.json'; a.click(); URL.revokeObjectURL(url);
});

document.getElementById('fileImport').addEventListener('change', (e)=>{
  const f = e.target.files[0]; if(!f) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const data = JSON.parse(reader.result);
      if(Array.isArray(data)){ localStorage.setItem('alz_trades_v2', JSON.stringify(data)); alert('تم الاسترجاع ✅'); }
      else alert('صيغة غير صحيحة');
    }catch(err){ alert('خطأ في ملف JSON'); }
  };
  reader.readAsText(f);
});

document.getElementById('btnClear').addEventListener('click', ()=>{
  if(confirm('متأكد من مسح السجل بالكامل؟')){ localStorage.removeItem('alz_trades_v2'); renderJournal(); computeStats(); drawEquity(); renderMonthly(); }
});

// Init
computeStats(); drawEquity(); renderMonthly();
// Existing code in script.js




// Register Service Worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(reg => console.log('Service Worker registered', reg))
      .catch(err => console.log('Service Worker registration failed', err));
  });
}
