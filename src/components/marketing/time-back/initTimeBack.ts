/* eslint-disable */
// @ts-nocheck -- ported as-is from the standalone time-back landing page; binds the calculator inputs inside `root`.
export function initTimeBack(root: HTMLElement): void {
  var $ = function(id){ return root.querySelector("#"+id); };
(function(){
  var $ = function(id){ return root.querySelector('#'+id); };
  var state = { org:'church', who:'volunteer', unit:'month' };
  var RATES = { volunteer:36.14, staff:25.83, bookkeeper:24.36 };
  var RATE_HINT = {
    volunteer:'2025 value of a volunteer hour<a href="#src-is">Independent Sector</a>',
    staff:'Church administrator pay, 2025<a href="#src-vanco">Vanco</a>',
    bookkeeper:'Bookkeeping clerk median, May 2025<a href="#src-bls">BLS</a>'
  };
  var VALUE_LBL = { volunteer:'volunteer time / yr', staff:'staff time freed / yr', bookkeeper:'bookkeeper time freed / yr' };
  var ORG = {
    church:{ eyebrow:'Time-back calculator for churches', impact:function(h){ return h + ' hours a year back for gospel impact.'; },
      lede:'Matching online gifts, payouts and fees by hand quietly takes hours away from gospel impact every month. Put in your numbers and see how many come back.' },
    nonprofit:{ eyebrow:'Time-back calculator for nonprofits', impact:function(h){ return h + ' hours a year back for community impact.'; },
      lede:'Matching online gifts, payouts and fees by hand takes hours away from community impact every month. Put in your numbers and see how many come back.' },
    global:{ eyebrow:'Time-back calculator for global ministries', impact:function(h){ return h + ' hours a year back for the people you serve in the field.'; },
      lede:'Matching online gifts, payouts and fees by hand takes hours away from your work in the field every month. Put in your numbers and see how many come back.' }
  };

  function num(id, fallback){ var v = parseFloat($(id).value); return isFinite(v) && v >= 0 ? v : fallback; }
  var usd0 = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
  var usd2 = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2});
  function hrs(x){ return x >= 10 ? Math.round(x).toLocaleString('en-US') : (Math.round(x*10)/10).toString(); }

  function model(i){
    var onlineVol = i.giving * i.online/100;
    var gifts = i.avgGift > 0 ? onlineVol / i.avgGift : 0;
    var wgcPayouts = Math.min(i.payouts, 30);
    var q = i.qb;
    var lines = [
      { name:'Recording and fund-coding online gifts', now: gifts*3/60, wgc: gifts*(q?0.5:1.5)/60 },
      { name:'Matching deposits to the bank', now: i.payouts*7/60, wgc: wgcPayouts*(q?1:3)/60 },
      { name:'Chasing exceptions', now: gifts*0.03*15/60, wgc: gifts*0.03*15/60/2 },
      { name:'Fee journal entries', now: 1.5, wgc: q?0.1:0.5 },
      { name:'Month-end report', now: 3, wgc: q?1:1.5 },
      { name:'Year-end giving statements', now: 1, wgc: 5/12 }
    ];
    var now = 0, wgc = 0;
    lines.forEach(function(l){ now += l.now; wgc += l.wgc; });
    var cardVol = onlineVol * i.cardShare/100;
    var cardGifts = gifts * i.cardShare/100;
    var bankGifts = gifts - cardGifts;
    var feeNow = onlineVol * i.effRate/100;
    var feeWgc = i.cover ? 0 : cardVol*0.023 + cardGifts*0.25 + bankGifts*0.25;
    return { lines:lines, now:now, wgc:wgc, saved:Math.max(0,now-wgc), onlineVol:onlineVol, feeNow:feeNow, feeWgc:feeWgc, feeSaveYr:Math.max(0,(feeNow-feeWgc)*12) };
  }

  function read(){
    return {
      giving:num('giving',25000), online:Math.min(100,num('online',44)), avgGift:num('avgGift',157),
      payouts:num('payouts',30), qb:$('qb').checked, rate:num('rate',36.14),
      effRate:num('effRate',3), cardShare:Math.min(100,num('cardShare',80)), cover:$('cover').checked
    };
  }

  function render(){
    var i = read(), m = model(i);
    var yr = m.saved*12;
    $('hrsYear').textContent = Math.round(yr).toLocaleString('en-US');
    $('hrsMonth').textContent = hrs(m.saved);
    $('timeValue').textContent = usd0.format(yr * i.rate);
    $('timeValueLbl').textContent = VALUE_LBL[state.who] || 'time freed / yr';
    $('feeSave').textContent = usd0.format(m.feeSaveYr);
    $('impact').textContent = ORG[state.org].impact(Math.round(yr).toLocaleString('en-US'));
    $('qbLabel').textContent = i.qb ? 'We use QuickBooks or other software WGC connects to' : 'Spreadsheets or software that can\u2019t connect';

    var mult = state.unit === 'year' ? 12 : 1;
    var max = 0; m.lines.forEach(function(l){ if (l.now*mult > max) max = l.now*mult; });
    var html = '';
    m.lines.forEach(function(l){
      var n = l.now*mult, w = l.wgc*mult;
      var pn = max ? n/max*100 : 0, pw = max ? w/max*100 : 0;
      html += '<div class="line"><div class="line-head"><span class="name">'+l.name+'</span>'+
        '<span class="nums">'+hrs(n)+' → '+hrs(w)+' hrs</span></div>'+
        '<div class="bars"><div class="bar now" style="width:'+Math.max(pn,1)+'%"></div>'+
        '<div class="bar wgc" style="width:'+Math.max(pw,1)+'%"></div></div></div>';
    });
    html += '<div class="line total-line"><div class="line-head"><span class="name">Total</span><span class="nums" style="color:var(--ink);font-weight:700">'+hrs(m.now*mult)+' → '+hrs(m.wgc*mult)+' hrs per '+state.unit+'</span></div></div>';
    $('lines').innerHTML = html;

    $('fOnline').textContent = usd0.format(m.onlineVol);
    $('fNow').textContent = usd2.format(m.feeNow) + ' / mo';
    $('fWgc').textContent = usd2.format(m.feeWgc) + ' / mo';
    $('fYear').textContent = usd0.format(m.feeSaveYr);
  }

  function seg(id, key, after){
    var g = $(id);
    g.addEventListener('click', function(e){
      var b = e.target.closest('button'); if (!b) return;
      g.querySelectorAll('button').forEach(function(x){ x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      state[key] = b.getAttribute('data-v');
      if (after) after();
      render();
    });
  }
  seg('orgType','org');
  seg('who','who', function(){ $('rate').value = RATES[state.who].toFixed(2); $('rateHint').innerHTML = RATE_HINT[state.who]; });
  seg('unit','unit');

  $('giving').addEventListener('input', function(){ $('givingRange').value = this.value; render(); });
  $('givingRange').addEventListener('input', function(){ $('giving').value = this.value; render(); });
  ['online','avgGift','payouts','qb','rate','effRate','cardShare','cover'].forEach(function(id){
    $(id).addEventListener('input', render); $(id).addEventListener('change', render);
  });
  $('form').addEventListener('submit', function(e){ e.preventDefault(); });
  render();
})();
  (function(){
    var w = $('vwrap'), v = $('fv'), b = $('vplay');
    if (!v || !b) return;
    b.addEventListener('click', function(){ v.controls = true; w.classList.add('playing'); var p = v.play(); if (p && p.catch) p.catch(function(){}); });
    v.addEventListener('play', function(){ v.controls = true; w.classList.add('playing'); });
  })();}
