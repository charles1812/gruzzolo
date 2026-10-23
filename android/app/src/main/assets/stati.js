/* ---------- Dati › I miei dati: Risparmi, Portafoglio, Mercati ----------
   Le tre schermate rifatte nello stile del Portafoglio e del Piano: una scheda in cima con il numero che conta,
   poi poche schede con parole semplici. Sostituisce renderStat / renderPortBody / renderGlobalBody di index.html. */
const ST_SUBS=[["risp","💰 Risparmi"],["port","📈 Portafoglio"],["global","🌍 Mercati"]];
const pct1=x=>(x>=0?"+":"−")+nf2.format(Math.abs(x*100)).replace(/,(\d)0$/,",$1")+"%";

async function renderStat(force){
  const body=$("#statBody"); if(!body) return;
  if(!body.querySelector("#statContent")) body.innerHTML=`<div class="st-tabs" role="tablist">${ST_SUBS.map(([k,t])=>`<button data-st="sub" data-v="${k}">${t}</button>`).join("")}</div><div id="statContent"></div>`;
  body.querySelectorAll('[data-st="sub"]').forEach(b=>b.classList.toggle("on",b.dataset.v===statSub));
  renderSub(force);
}

/* ---------- Risparmi ---------- */
function stSavHtml(){
  const H=monthHistory();
  if(!H.length) return `<div class="card fz"><p class="pn-note">Rispondi alle domande del Budget: poi qui trovi i tuoi risparmi mese per mese.</p></div>`;
  const done=H.filter(m=>!m.cur && !m.sparse), tot=done.reduce((a,m)=>a+Math.max(0,m.saved),0);
  const avg=done.length?done.reduce((a,m)=>a+m.saved,0)/done.length:null, hit=done.filter(m=>m.diff>=-1).length;
  const mName=m=>(m.cy.s.getDate()>15?m.cy.e:m.cy.s).toLocaleDateString("it-IT",{ month:"short" }).replace(".","");
  const L=H.slice(-12), max=Math.max(1,...L.map(m=>Math.max(m.saved,m.goal))), cur=H.find(m=>m.cur);
  const best=done.slice().sort((a,b)=>b.saved-a.saved)[0];
  let h=`<div class="card fz"><div class="fz-top"><div class="fz-val">${done.length?`<small>Messo da parte</small><b class="num">${m0(tot)}</b>
      <span>media <b class="num">${m0(avg)}</b> al mese · <b>${hit} su ${done.length}</b> ${done.length===1?"mese":"mesi"} a obiettivo</span>`:`<small>Questo mese metti da parte</small><b class="num">${m0(cur?cur.saved:0)}</b>
      <span>previsti a fine mese${cur?` · obiettivo <b class="num">${m0(cur.goal)}</b>`:""} · il primo mese si chiude il ${esc(fShort(cur?cur.cy.e:today0()))}</span>`}</div></div>
    <div class="sv-chart">${L.map(m=>{ const cls=m.cur?"cur":m.sparse?"unk":m.diff>=-1?"ok":"ko";
      return `<button class="mcal-m sv-b ${cls}" data-mh="${m.key}"><div class="sv-bb"><i class="sv-g" style="bottom:${(m.goal/max*100).toFixed(1)}%"></i><i class="sv-v" style="height:${(Math.max(0,m.saved)/max*100).toFixed(1)}%"></i></div><small>${mName(m)}</small></button>`; }).join("")}</div>
    <div class="pn-leg"><span><i style="background:var(--gain)"></i>a obiettivo</span><span><i style="background:var(--loss)"></i>sotto</span><span><i style="background:var(--gold)"></i>in corso</span><span><i class="sv-li"></i>obiettivo</span></div>
    ${done.length?`<div class="ph-k">${cur?`<div><small>questo mese</small><b class="num">${m0(cur.saved)}</b><span>previsti (obiettivo ${m0(cur.goal)})</span></div>`:""}
      ${best?`<div><small>mese migliore</small><b class="num pos">${m0(best.saved)}</b><span>${esc(mName(best))}</span></div>`:""}
      <div><small>in un anno</small><b class="num">${m0(avg*12)}</b><span>a questo ritmo</span></div></div>`:""}
    <div id="mcalWhy"><p class="pn-note">Tocca un mese per vedere perché hai messo da parte di più o di meno.</p></div></div>`;
  const tv=typeof totals==="function"?totals():{ val:0, cost:0, pl:0, pct:0 }, fund=(typeof PL!=="undefined"?+PL.fund||0:0), pot=(typeof PL!=="undefined"?+PL.pot||0:0);
  h+=`<div class="sc-t sc-tt">🏦 Il tuo patrimonio</div><div class="card fz"><div class="fz-top"><div class="fz-val"><small>In tutto</small><b class="num">${m0(tv.val+fund+pot)}</b>
      <span><i>investiti</i> ${m0(tv.val)}${pot?` · <i>da investire</i> ${m0(pot)}`:""}${fund?` · <i>fondo emergenza</i> ${m0(fund)}`:""}</span></div></div>
    ${tv.val>0?`<div class="fz-ds"><span class="fz-d">versati <b class="num">${m0(tv.cost)}</b></span><span class="fz-d ${tv.pl>=0?"pos":"neg"}">${tv.pl>=0?"+":"−"}${m0(Math.abs(tv.pl))} · ${pct1(tv.pct/100)}</span></div>`:""}
    ${typeof holdings!=="undefined"&&holdings.length&&tv.val>0?`<div class="fzp"><div class="fzp-h"><span>Come è diviso</span></div>${holdings.map(x=>({ n:shortName(x.ticker), v:valueOf(x) })).sort((a,b)=>b.v-a.v).map(x=>`<div class="ph-a"><span>${esc(x.n)}</span><div class="ph-ab"><i style="width:${(x.v/tv.val*100).toFixed(1)}%"></i></div><b class="num">${Math.round(x.v/tv.val*100)}%</b></div>`).join("")}</div>`:""}
  </div>`;
  return h;
}

/* ---------- Portafoglio ---------- */
const ST_RISK_COL=["","#8FA0E0","#5BB6A9","#E0B15E","#E8956A","#D98BA6"];
function stFan(mc){
  const W=340, H=170, Lp=4, Rp=W-46, T=10, Bt=H-20, n=mc.days;
  let lo=Math.min(...mc.bands.p5, mc.invested||mc.S0), hi=Math.max(...mc.bands.p95); const pad=(hi-lo)*.06||1; lo-=pad; hi+=pad;
  const X=d=>Lp+d/n*(Rp-Lp), Y=v=>Bt-(Bt-T)*(v-lo)/(hi-lo), pts=a=>a.map((v,d)=>d%3&&d!==n?null:`${X(d).toFixed(1)},${Y(v).toFixed(1)}`).filter(Boolean);
  const band=pts(mc.bands.p95).concat(pts(mc.bands.p5).reverse()).join(" "), base=mc.invested||mc.S0;
  const lab=v=>v>=1e4?Math.round(v/1000)+"k":Math.round(v);
  const ticks=[hi-pad, (hi+lo)/2, lo+pad].map(v=>`<line x1="${Lp}" x2="${Rp}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="pn-grid"/><text x="${Rp+4}" y="${(Y(v)+3).toFixed(1)}" class="pn-ax">${lab(v)} €</text>`).join("");
  const months=Math.round(n/21), end=new Date(); end.setMonth(end.getMonth()+months);
  return `<svg viewBox="0 0 ${W} ${H}" class="pn-svg" role="img" aria-label="Possibili valori del portafoglio">${ticks}
    <polygon points="${band}" class="st-band"/>
    <line x1="${Lp}" x2="${Rp}" y1="${Y(base).toFixed(1)}" y2="${Y(base).toFixed(1)}" class="st-base"/>
    <polyline points="${pts(mc.bands.p50).join(" ")}" class="st-mid"/>
    <circle cx="${X(n).toFixed(1)}" cy="${Y(mc.bands.p50[n]).toFixed(1)}" r="3.5" fill="var(--gold)"/>
    <text x="${Lp}" y="${H-5}" class="pn-ax">oggi</text><text x="${Rp}" y="${H-5}" class="pn-ax" text-anchor="end">${end.toLocaleDateString("it-IT",{ month:"short", year:"numeric" })}</text></svg>`;
}
function stCorrWord(c){ return c>.8?["quasi uguali","neg"]:c>.5?["simili","warn"]:c>.2?["un po' insieme",""]:c>-.2?["indipendenti","pos"]:["opposti","pos"]; }
function renderPortBody(){
  const body=$("#statContent"); if(!body||!statData) return;
  if(!statData.ok){ body.innerHTML=`<div class="card fz"><div class="fz-val"><small>Statistiche del portafoglio</small></div><p class="pn-note">${holdings.length?"Prezzi storici non ancora disponibili: riprova tra poco.":"Aggiungi qualche posizione nel Portafoglio per vedere qui rischio, scenari e come si muovono i tuoi titoli."}</p>${holdings.length?`<button class="btn ghost" data-st="refresh" style="margin-top:10px">↻ Riprova</button>`:""}</div>`; return; }
  const d=statData, col=ST_RISK_COL[d.score];
  let h=`<div class="card fz st-hero" style="--rc:${col}"><div class="fz-top"><div class="fz-val"><small>Rischio del portafoglio</small><b class="num">${d.score}<em>/5</em> <span class="st-rl">${esc(riskLabel(d.score))}</span></b>
      <span>in un anno normale si muove di circa <b class="num">±${Math.round(d.annVol*100)}%</b>${d.topW>0.5?` · molto concentrato su ${esc(shortName(d.assets.find(a=>a.name===d.topName)?.ticker||d.topName))}`:""}</span></div>
      <button class="st-rf" data-st="refresh" aria-label="Aggiorna">↻</button></div>
    <div class="st-risk">${[1,2,3,4,5].map(n=>`<i class="${n<=d.score?"on":""}"></i>`).join("")}</div>
    <div class="ph-k"><div><small>ultimi 12 mesi</small><b class="num ${d.annRet>=0?"pos":"neg"}">${pct1(d.annRet)}</b><span>all'anno</span></div>
      <div><small>calo peggiore</small><b class="num neg">${pct1(d.maxDD)}</b><span>dal massimo</span></div>
      <div><small>mese brutto</small><b class="num neg">−${m0(Math.abs(d.var95m*d.S0))}</b><span>1 volta su 20</span></div></div>
    <p class="pn-note">Più il rischio è alto, più il valore sale e scende. ${d.sharpe>=1?"Finora il rendimento ha ripagato bene le oscillazioni.":d.sharpe>=0.4?"Finora il rendimento ha ripagato le oscillazioni.":"Finora le oscillazioni non sono state ripagate dal rendimento."}</p></div>`;

  const monthly=statPac?(pacAmount()||0):0, drift=applyMode(d.annRet,0.25,0.25);
  statMC=monteCarlo(d.S0, drift, d.annVol, statHorizon, 1000, dateSeed(todayStr()+"stat"+statRetMode+statHorizon+(monthly?1:0)), monthly);
  const mc=statMC, base=mc.invested||mc.S0;
  h+=`<div class="sc-t sc-tt">🔮 Tra qualche mese</div><div class="card pn-chart"><div class="pn-chh"><b>${monthly?"Con il Replay":"Senza versare altro"}</b><div class="pfc-tabs">${[[63,"3 mesi"],[126,"6 mesi"],[252,"1 anno"]].map(([v,t])=>`<button data-st="hz" data-v="${v}" class="${statHorizon===v?"on":""}">${t}</button>`).join("")}</div></div>
    ${stFan(mc)}
    <div class="pn-leg"><span><i style="background:var(--gold)"></i>probabile</span><span><i style="background:rgba(224,177,94,.3)"></i>9 casi su 10</span><span><i class="sv-li"></i>${monthly?"versato":"oggi"}</span></div>
    <div class="ph-k"><div><small>se va male</small><b class="num ${mc.finalLo>=base?"pos":"neg"}">${m0(mc.finalLo)}</b><span>1 caso su 20</span></div>
      <div><small>probabile</small><b class="num">${m0(mc.finalMed)}</b><span>${mc.finalMed>=base?"+":"−"}${m0(Math.abs(mc.finalMed-base))}</span></div>
      <div><small>se va bene</small><b class="num pos">${m0(mc.finalHi)}</b><span>1 caso su 20</span></div></div>
    <div class="fz-ds st-opts"><div class="pfc-tabs">${[["storico","Come finora"],["prudente","Prudente"],["zero","Solo oscillazioni"]].map(([v,t])=>`<button data-st="ret" data-v="${v}" class="${statRetMode===v?"on":""}">${t}</button>`).join("")}</div>
      ${pacAmount()>0?`<button class="fz-d ${statPac?"on":""}" data-st="pac">${statPac?"✓ ":""}Replay ${m0(pacAmount())}/mese</button>`:""}</div>
    <p class="pn-note">Nel ${Math.round(mc.probUp*100)}% dei casi finisci sopra ${monthly?"quello che hai versato":"il valore di oggi"}. Sono simulazioni sui movimenti degli ultimi 12 mesi, non previsioni.</p></div>`;

  const tot=d.assets.reduce((a,x)=>a+Math.max(0,x.value),0)||1, rcMax=Math.max(1,...d.riskContrib.map(x=>x.pct));
  h+=`<div class="sc-t sc-tt">🧩 Le tue posizioni</div><div class="card st-pos">${d.assets.filter(a=>a.value>0).sort((a,b)=>b.value-a.value).map(a=>{ const rc=d.riskContrib.find(x=>x.name===a.name)||{ pct:0 }, w=a.value/tot*100;
      return `<div class="st-p"><div class="st-ph"><b>${esc(shortName(a.ticker))}</b><span class="num">${m0(a.value)} · ${Math.round(w)}%</span></div>
        <div class="st-pr"><div class="ph-ab"><i style="width:${(rc.pct/rcMax*100).toFixed(1)}%;background:${rc.pct>w+10?"var(--loss)":"var(--gold)"}"></i></div><small><b class="num">${Math.round(rc.pct)}%</b> del rischio · oscilla ±${Math.round(a.vol*100)}%${a.short?" · storico breve":""}</small></div></div>`; }).join("")}
    <p class="pn-note">La barra è quanto ogni titolo fa muovere il portafoglio: se è rossa pesa sul rischio più che sul valore.</p></div>`;

  if(d.tks.length>=2){ const P=[]; d.tks.forEach((a,i)=>d.tks.forEach((b,j)=>{ if(j>i && d.corr[i][j]!=null) P.push({ a, b, c:d.corr[i][j] }); })); P.sort((x,y)=>y.c-x.c);
    if(P.length) h+=`<div class="sc-t sc-tt">🔗 Si muovono insieme?</div><div class="card st-pos">${P.slice(0,6).map(p=>{ const [w,cl]=stCorrWord(p.c);
        return `<div class="st-c"><span>${esc(shortName(p.a))} <i>e</i> ${esc(shortName(p.b))}</span><b class="${cl}">${w}</b></div>`; }).join("")}
      <p class="pn-note">Titoli «quasi uguali» salgono e scendono insieme: tenerli entrambi protegge poco. «Indipendenti» o «opposti» si compensano.</p></div>`; }

  if(d.v && d.v.length>5){ let pk=d.v[0]; const dd=d.v.map(x=>{ if(x>pk) pk=x; return x/pk-1; }), W=340, H=110, lo=Math.min(-0.01,...dd), X=i=>2+i/(dd.length-1)*(W-4), Y=v=>4+(v/lo)*(H-22);
    const area=`2,4 ${dd.map((v,i)=>`${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")} ${W-2},4`;
    h+=`<div class="sc-t sc-tt">📉 Le cadute</div><div class="card pn-chart"><svg viewBox="0 0 ${W} ${H}" class="pn-svg" role="img" aria-label="Cadute dai massimi"><polygon points="${area}" class="st-dd"/>${(()=>{ const i=dd.indexOf(lo), x=Math.min(W-40,Math.max(30,X(i))); return `<text x="${x.toFixed(1)}" y="${Math.min(H-16,Y(lo)+12).toFixed(1)}" class="pn-ax" text-anchor="middle">${pct1(lo)}</text>`; })()}<text x="4" y="${H-4}" class="pn-ax">12 mesi fa</text><text x="${W-4}" y="${H-4}" class="pn-ax" text-anchor="end">oggi</text></svg>
      <p class="pn-note">Quanto eri sotto il massimo raggiunto prima. ${dd[dd.length-1]>-0.005?"Oggi sei sui massimi.":`Oggi sei ${nf2.format(Math.abs(dd[dd.length-1]*100))}% sotto il massimo.`}</p></div>`; }
  if(d.dataNotes.length) h+=`<p class="pn-disc">Storico breve per ${d.dataNotes.map(x=>esc(x.name)).join(", ")}: per questi i numeri sono stime.</p>`;
  body.innerHTML=h;
}

/* ---------- Mercati ---------- */
const ST_GL_E={ SPY:"🇺🇸", QQQ:"💻", VTI:"🗽", VEA:"🌍", VWO:"🌏", VGK:"🇪🇺", EWJ:"🇯🇵", AGG:"📜", TLT:"🏛️", GLD:"🥇" };
async function renderGlobal(force){
  const c=$("#statContent"); if(!c) return;
  if(globalData && globalData.every(g=>g.perf!==undefined) && !force){ renderGlobalBody(); return; }
  c.innerHTML=`<div class="card fz"><div class="fz-val"><small>Mercati oggi</small><b class="num" id="glLoad">…</b><span><i>carico i prezzi</i></span></div></div>`;
  globalData=GLOBAL_LIST.map(it=>({ ...it, perf:undefined, pts:null })); let done=0;
  await runLimited(GLOBAL_LIST, async it=>{ const e=globalData.find(g=>g.sym===it.sym);
    try{ const dd=await fetchHistory(it.sym,12); const pts=dd&&dd.pts?dd.pts.slice().sort((a,b)=>a.t-b.t):[];
      if(pts.length>=2){ const last=pts[pts.length-1].c, prev=pts[pts.length-2].c, yr=new Date().getUTCFullYear(); let first=pts[0].c; for(const p of pts){ if(new Date(p.t*1000).getUTCFullYear()===yr){ first=p.c; break; } }
        e.perf={ price:last, daily:prev>0?last/prev-1:0, ytd:first>0?last/first-1:0, y1:pts[0].c>0?last/pts[0].c-1:0 }; e.pts=pts.map(p=>p.c); } else e.perf=null; }
    catch(_){ e.perf=null; }
    done++; const l=$("#glLoad"); if(l) l.textContent=`${done}/${GLOBAL_LIST.length}`; }, 3);
  if(statSub==="global") renderGlobalBody();
}
function stSpark(a, up){ if(!a||a.length<2) return ""; const W=70, H=26, lo=Math.min(...a), hi=Math.max(...a), st=Math.max(1,Math.floor(a.length/40));
  const p=a.filter((_,i)=>i%st===0||i===a.length-1).map((v,i,arr)=>`${(i/(arr.length-1)*W).toFixed(1)},${(H-2-(v-lo)/((hi-lo)||1)*(H-4)).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" class="st-sp"><polyline points="${p}" fill="none" stroke="${up?"var(--gain)":"var(--loss)"}" stroke-width="1.6"/></svg>`; }
function renderGlobalBody(){
  const c=$("#statContent"); if(!c||!globalData) return;
  const ok=globalData.filter(g=>g.perf), core=ok.filter(g=>g.group==="core");
  const avgD=core.length?core.reduce((s,g)=>s+g.perf.daily,0)/core.length:0, avgY=core.length?core.reduce((s,g)=>s+g.perf.ytd,0)/core.length:0, up=core.filter(g=>g.perf.daily>0).length;
  const mood=avgD>0.0015?["☀️ Giornata buona","pos"]:avgD<-0.0015?["🌧️ Giornata no","neg"]:["⛅ Giornata tranquilla",""];
  const row=g=>{ const p=g.perf; return `<div class="st-g"><span class="st-ge">${ST_GL_E[g.sym]||"📊"}</span><div class="st-gn"><b>${esc(g.name.replace(/ \(.*\)$/,""))}</b><small>${esc(g.sym)}${p?` · $${nf2.format(p.price)}`:""}</small></div>
      ${p?`${stSpark(g.pts,p.y1>=0)}<div class="st-gv"><b class="num ${p.daily>=0?"pos":"neg"}">${pct1(p.daily)}</b><small class="num">${new Date().getFullYear()}: ${pct1(p.ytd)}</small></div>`:`<div class="st-gv"><small>n/d</small></div>`}</div>`; };
  const stocks=globalData.filter(g=>!["AGG","TLT","GLD"].includes(g.sym)), safe=globalData.filter(g=>["AGG","TLT","GLD"].includes(g.sym));
  let h=`<div class="card fz"><div class="fz-top"><div class="fz-val"><small>Azioni nel mondo oggi</small><b class="num ${avgD>=0?"pos":"neg"}">${core.length?pct1(avgD):"—"}</b>
      <span>${core.length?`<b>${up} su ${core.length}</b> in rialzo · da inizio ${new Date().getFullYear()} <b class="num ${avgY>=0?"pos":"neg"}">${pct1(avgY)}</b>`:"prezzi non disponibili"}</span></div>
      <button class="st-rf" data-st="grefresh" aria-label="Aggiorna">↻</button></div>
    <div class="fz-ds"><span class="fz-d ${mood[1]}">${mood[0]}</span>${safe.some(g=>g.perf)?(()=>{ const s=safe.filter(g=>g.perf), a=s.reduce((x,g)=>x+g.perf.daily,0)/s.length; return `<span class="fz-d">bond e oro ${pct1(a)}</span>`; })():""}</div>
    <p class="pn-note">${avgD<-0.0015&&safe.some(g=>g.perf&&g.perf.daily>0)?"Quando le azioni scendono, obbligazioni e oro spesso salgono: è per questo che si tengono insieme.":"Media dei 5 grandi ETF del mondo, all'ultima chiusura."}</p></div>`;
  h+=`<div class="sc-t sc-tt">📈 Azioni</div><div class="card st-gl">${stocks.map(row).join("")}</div>`;
  h+=`<div class="sc-t sc-tt">🛡️ Obbligazioni e oro</div><div class="card st-gl">${safe.map(row).join("")}</div>`;
  h+=`<p class="pn-disc">Prezzi in dollari degli ETF americani più usati per seguire ogni mercato. Grafici: ultimi 12 mesi.</p>`;
  c.innerHTML=h;
}

function renderSub(force){
  const c=$("#statContent"); if(!c) return;
  if(statSub==="global") renderGlobal(force); else if(statSub==="risp") c.innerHTML=stSavHtml(); else renderPort(force);
}
async function renderPort(force){
  const body=$("#statContent"); if(!body) return;
  if(!holdings.length){ statData={ ok:false }; renderPortBody(); return; }
  if(statData && statData.ok && !force){ renderPortBody(); return; }
  body.innerHTML=`<div class="card fz"><div class="fz-val"><small>Rischio del portafoglio</small><b class="num">…</b><span><i>calcolo dai prezzi degli ultimi 12 mesi</i></span></div></div>`;
  try{ statData=await computeStats(); }catch(e){ statData={ ok:false }; }
  if(statSub==="port") renderPortBody();
}
document.addEventListener("click",e=>{ const b=e.target.closest("[data-st]"); if(!b) return; const a=b.dataset.st, v=b.dataset.v;
  if(a==="sub"){ statSub=v; document.querySelectorAll('[data-st="sub"]').forEach(x=>x.classList.toggle("on",x===b)); renderSub(false); return; }
  if(a==="refresh"){ renderPort(true); return; }
  if(a==="grefresh"){ renderGlobal(true); return; }
  if(a==="hz") statHorizon=+v; else if(a==="ret") statRetMode=v; else if(a==="pac") statPac=!statPac;
  const y=window.scrollY; renderPortBody(); window.scrollTo(0,y); });
