/* ---------- Grafico del portafoglio e scheda «Dati» ----------
   Portafoglio: valore delle quote che hai oggi nel tempo (prezzi Yahoo), tocca e trascina per leggere un giorno.
   Dati: costo della vita in Italia negli ultimi 10 anni, da fonti ufficiali e gratuite:
   - Eurostat: prezzi al consumo (HICP, ECOICOP 2) per cibo, affitti, luce, gas, benzina, gasolio e indice generale;
     prezzo della luce e del gas per le famiglie (€/kWh, semestrale); indice dei prezzi delle case (trimestrale).
   - Ministero delle Imprese (MIMIT): prezzi di oggi di benzina e gasolio self di tutti i distributori. */

/* ===== grafico del portafoglio ===== */
const PF = { range:"1M", data:null, key:"", busy:false, hover:null };
const PF_R = { "1S":[12,6], "1M":[12,22], "1A":[12,9999], "Totale":[null,9999] };
/* «Totale»: dal primo acquisto (data della posizione più vecchia), altrimenti 5 anni */
function pfFirstDate(sel){ const D=holdings.filter(h=>!sel||h.ticker===sel).map(h=>h.date).filter(Boolean).sort(); return D.length?new Date(D[0]+"T00:00:00"):null; }
async function pfSeries(range, sel){
  let [months, lastN]=PF_R[range]; const first=months==null?pfFirstDate(sel):null;
  if(months==null) months=first?Math.max(1,Math.ceil((Date.now()-first)/(30.44*86400000))+1):60;
  const H=holdings.filter(h=>+h.qty>0 && (!sel || h.ticker===sel)); if(!H.length) return null;
  const hist=await Promise.all(H.map(async h=>{ try{ const d=await fetchHistory(h.ticker, months); return { h, pts:d.pts }; }catch(e){ return null; } }));
  const ok=hist.filter(x=>x && x.pts.length>1); if(!ok.length) return null;
  // conversione in euro con il cambio di oggi (stessa proporzione dell'ultimo prezzo)
  ok.forEach(x=>{ const lastNative=x.pts[x.pts.length-1].c, eur=priceEur(x.h); x.k = lastNative>0 && eur>0 ? eur/lastNative : 1; });
  const days=[...new Set(ok.flatMap(x=>x.pts.map(p=>Math.floor(p.t/86400))))].sort((a,b)=>a-b);
  const idx=ok.map(()=>0), last=ok.map(()=>null), S=[];
  days.forEach(d=>{ let v=0, have=true;
    ok.forEach((x,i)=>{ while(idx[i]<x.pts.length && Math.floor(x.pts[idx[i]].t/86400)<=d){ last[i]=x.pts[idx[i]].c; idx[i]++; } if(last[i]==null) have=false; else v+=last[i]*x.k*(+x.h.qty); });
    if(have) S.push({ t:d*86400, v }); });
  const S2=first?S.filter(p=>p.t*1000>=first.getTime()-86400000):S;
  return (S2.length>1?S2:S).slice(-lastN);
}
async function renderPfChart(force){
  if(!document.getElementById("fzHead")) return;
  if(PF.sel && !holdings.some(h=>h.ticker===PF.sel)) PF.sel=null;
  const key=PF.range+"|"+(PF.sel||"")+"|"+holdings.map(h=>h.ticker+h.qty).join(",");
  if(!PF.data || PF.key!==key || force){ if(PF.key!==key) PF.data=null; pfPaint(); PF.busy=true;
    try{ PF.data=await pfSeries(PF.range, PF.sel); PF.key=key; }catch(e){ PF.data=null; } PF.busy=false; }
  pfPaint();
}
/* intestazione (valore, variazione, periodi) e grafico come sfondo delle monete */
function pfPaint(){
  const head=document.getElementById("fzHead"); if(!head) return;
  const S=PF.data, tabs=Object.keys(PF_R).map(r=>`<button data-pfr="${r}" class="${PF.range===r?"on":""}">${r}</button>`).join("");
  const h=PF.sel?holdings.find(x=>x.ticker===PF.sel):null, gi=h?holdings.indexOf(h):-1;
  const col=h&&typeof fzColor==="function"?fzColor(gi):"";
  const q=h?(+h.qty||0):0, qs=h?(Math.abs(q-Math.round(q))<0.01?Math.round(q):nf2.format(q)):"";
  const title=h?`<span class="fz-who"><i style="background:${col}"></i>${esc(shortName(h.ticker))} · ${qs} ${Math.round(q)===1?"quota":"quote"}</span><button class="fz-all" data-fzall="1">✕ tutto il portafoglio</button>`
    :`<span class="fz-who">Il tuo portafoglio</span><small class="muted fz-hint">tocca una pila per vedere quell'ETF</small>`;
  let ch=`<div class="pfc-ch num muted">${PF.busy?"carico…":"storico non disponibile"}</div>`;
  if(S && S.length>1){ const d=S[S.length-1].v-S[0].v, pc=S[0].v>0?d/S[0].v:0, up=d>=0;
    const from=new Date(S[0].t*1000).toLocaleDateString("it-IT",{ day:"numeric", month:"short", year:"numeric" });
    ch=`<div class="pfc-ch num ${up?"pos":"neg"}">${up?"▲":"▼"} ${money(Math.abs(d))} <span>${up?"+":"−"}${Math.abs(pc*100).toFixed(2).replace(".",",")}%</span> <small class="muted">dal ${from}</small></div>`; }
  head.innerHTML=`<div class="fz-ht">${title}</div><div class="fz-hr">${ch}<div class="pfc-tabs">${tabs}</div></div>`;
  if(typeof fzLoop==="function") fzLoop();
  return;
  const W=360, H=200, v=S.map(p=>p.v), mn=Math.min(...v), mx=Math.max(...v), pad=(mx-mn)*0.15||mx*0.02||1;
  const up=S[S.length-1].v>=S[0].v, stroke=h?col:(up?"var(--gain)":"var(--loss)");
  const X=i=>i/(S.length-1)*W, Y=x=>H*0.70-(H*0.62)*(x-(mn-pad))/((mx+pad)-(mn-pad));
  const pts=S.map((p,i)=>`${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ");
  bg.innerHTML=`<defs><linearGradient id="fzg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${h?col:(up?"#6FCF97":"#E8786A")}" stop-opacity=".28"/><stop offset=".75" stop-color="#0F1A1C" stop-opacity="0"/></linearGradient></defs>
    <polygon points="0,${H} ${pts} ${W},${H}" fill="url(#fzg)"/><polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="2" vector-effect="non-scaling-stroke" opacity=".9"/>`;
}
function pfHtml(S){
  const tabs=Object.keys(PF_R).map(r=>`<button data-pfr="${r}" class="${PF.range===r?"on":""}">${r}</button>`).join("");
  if(!S || S.length<2) return `<div class="pfc"><div class="pfc-top"><div class="eyebrow">Andamento del portafoglio</div><div class="pfc-tabs">${tabs}</div></div><div class="pfc-load">${PF.busy?"Carico lo storico…":"Storico non disponibile"}</div></div>`;
  const W=360, H=110, v=S.map(p=>p.v), mn=Math.min(...v), mx=Math.max(...v), pad=(mx-mn)*0.12||mx*0.02||1;
  const X=i=>i/(S.length-1)*W, Y=x=>H-8-(H-24)*(x-(mn-pad))/((mx+pad)-(mn-pad));
  const pts=S.map((p,i)=>`${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ");
  const d=S[S.length-1].v-S[0].v, pc=S[0].v>0?d/S[0].v:0, up=d>=0, cost=totals().cost;
  const costY=cost>mn-pad && cost<mx+pad ? Y(cost) : null;
  const from=new Date(S[0].t*1000).toLocaleDateString("it-IT",{ day:"numeric", month:"short", year:"numeric" });
  return `<div class="pfc ${up?"up":"dn"}"><div class="pfc-top"><div><div class="eyebrow">Andamento del portafoglio</div>
      <div class="pfc-ch num ${up?"pos":"neg"}">${up?"▲":"▼"} ${money(Math.abs(d))} <span>${up?"+":"−"}${Math.abs(pc*100).toFixed(2).replace(".",",")}%</span></div><small class="muted">dal ${from}</small></div>
      <div class="pfc-tabs">${tabs}</div></div>
    <div class="pfc-wrap"><svg viewBox="0 0 ${W} ${H}" class="pfc-svg" id="pfSvg" preserveAspectRatio="none">
      <defs><linearGradient id="pfg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="pfg0"/><stop offset="1" class="pfg1"/></linearGradient></defs>
      ${costY!=null?`<line x1="0" x2="${W}" y1="${costY.toFixed(1)}" y2="${costY.toFixed(1)}" class="pfc-cost"/>`:""}
      <polygon points="0,${H} ${pts} ${W},${H}" fill="url(#pfg)"/><polyline points="${pts}" class="pfc-line"/>
      <line id="pfX" x1="0" x2="0" y1="0" y2="${H}" class="pfc-x" style="display:none"/><circle id="pfDot" r="4" class="pfc-dot" style="display:none"/></svg>
      <div class="pfc-tip" id="pfTip" style="display:none"></div></div>
    <p class="muted pfc-note">Valore delle quote che hai oggi, con i prezzi di ogni giorno${costY!=null?" · tratteggio: quanto hai versato":""}. Tocca e trascina per leggere un giorno.</p></div>`;
}
function pfScrub(e){
  const svg=document.getElementById("pfSvg"), S=PF.data; if(!svg||!S) return;
  const r=svg.getBoundingClientRect(), x=Math.max(0,Math.min(r.width,(e.touches?e.touches[0].clientX:e.clientX)-r.left)), i=Math.round(x/r.width*(S.length-1));
  const p=S[i], W=360, H=110, v=S.map(q=>q.v), mn=Math.min(...v), mx=Math.max(...v), pad=(mx-mn)*0.12||mx*0.02||1;
  const X=i/(S.length-1)*W, Yv=H-8-(H-24)*(p.v-(mn-pad))/((mx+pad)-(mn-pad));
  const l=document.getElementById("pfX"), d=document.getElementById("pfDot"), t=document.getElementById("pfTip");
  l.setAttribute("x1",X); l.setAttribute("x2",X); l.style.display=""; d.setAttribute("cx",X); d.setAttribute("cy",Yv); d.style.display="";
  t.style.display=""; t.style.left=Math.max(4,Math.min(r.width-120,x-60))+"px";
  t.innerHTML=`<b class="num">${money(p.v)}</b><small>${new Date(p.t*1000).toLocaleDateString("it-IT",{ day:"numeric", month:"short", year:"numeric" })}</small>`;
}
document.addEventListener("pointerdown",e=>{ if(e.target.closest("#pfSvg")){ PF.hover=true; pfScrub(e); } });
document.addEventListener("pointermove",e=>{ if(PF.hover) pfScrub(e); });
document.addEventListener("pointerup",()=>{ if(!PF.hover) return; PF.hover=null; ["pfX","pfDot","pfTip"].forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display="none"; }); });
document.addEventListener("click",e=>{ const b=e.target.closest("[data-pfr]"); if(b){ PF.range=b.dataset.pfr; renderPfChart(true); return; }
  if(e.target.closest("[data-fzall]")){ PF.sel=null; renderPfChart(true); } });

/* ===== scheda Dati ===== */
const DT = { es:null, fuel:null, busy:false, span:10, at:0 };
const ES = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/";
const DT_HICP = { TOTAL:"Prezzi in generale", CP011:"Cibo", CP041:"Affitti", CP0451:"Luce", CP0452:"Gas", CP07222:"Benzina", CP07221:"Gasolio" };
/* JSON-stat di Eurostat → { chiave della serie: [[periodo, valore], …] } */
function esParse(j, keyDim){
  const ids=j.id, size=j.size, out={}, cats=ids.map(d=>{ const ix=j.dimension[d].category.index; const a=[]; Object.entries(ix).forEach(([k,i])=>a[i]=k); return a; });
  const tPos=ids.indexOf("time"), kPos=keyDim?ids.indexOf(keyDim):-1;
  Object.entries(j.value||{}).forEach(([n,v])=>{ let r=+n; const c=[]; for(let i=ids.length-1;i>=0;i--){ c[i]=r%size[i]; r=Math.floor(r/size[i]); }
    const key=kPos>=0?cats[kPos][c[kPos]]:"_"; (out[key]=out[key]||[]).push([cats[tPos][c[tPos]], v]); });
  Object.values(out).forEach(a=>a.sort((x,y)=>x[0]<y[0]?-1:1));
  return out;
}
async function esGet(q){ const k="grz_es_"+q.length+"_"+q.slice(-40);
  try{ const c=JSON.parse(localStorage.getItem(k)||"null"); if(c && Date.now()-c.at<24*3600e3) return c.j; }catch(e){}
  const r=await fetch(ES+q); if(!r.ok) throw new Error("HTTP "+r.status); const j=await r.json();
  try{ localStorage.setItem(k, JSON.stringify({ at:Date.now(), j })); }catch(e){} return j; }
/* prima il motore sul server: raccoglie tutto ogni giorno/settimana e lo storico si allunga nel tempo */
async function dtFromServer(force){
  const c=(typeof engCfg==="function")?engCfg():null; if(!c||!c.url||!c.token) return false;
  const r=await fetch(c.url+(c.url.indexOf("?")>=0?"&":"?")+"what=vita&token="+encodeURIComponent(c.token)+(force?"&refresh=1":""),{ cache:"no-store" });
  const j=await r.json(); const v=j&&j.vita; if(!v||!v.hicp) return false;
  const arr=o=>Object.entries(o||{}).sort((a,b)=>a[0]<b[0]?-1:1);
  const hicp={}; Object.entries(v.hicp).forEach(([k,o])=>hicp[k]=arr(o));
  DT.es={ hicp, elec:{ _:arr(v.elec) }, gas:{ _:arr(v.gas) }, hpi:{ _:arr(v.hpi) }, hicp_upd:v.upd&&v.upd.hicp, server:true, days:Object.keys(v.fuel||{}).length };
  const F=arr(v.fuel); if(F.length){ const [d,x]=F[F.length-1]; DT.fuel={ d, est:d, b:x.b, g:x.g, bMI:x.bMI, gMI:x.gMI, nb:x.nb, ng:x.ng }; DT.fuelHist=F; }
  DT.at=Date.now(); return true;
}
async function dtLoad(force){
  if(DT.busy) return;
  const srvLater = DT.es && !DT.es.server && typeof engServerOn==="function" && engServerOn();   // presi da Eurostat prima che arrivasse il server: riprovo dal server
  if(!force && DT.es && !srvLater && Date.now()-DT.at<6*3600e3) return; DT.busy=true;
  try{ if(await dtFromServer(force) && DT.fuel){ DT.busy=false; return; } }catch(e){}
  const y0=new Date().getFullYear()-10;
  const qs={
    hicp:`prc_hicp_minr?geo=IT&unit=I15&${Object.keys(DT_HICP).map(c=>"coicop18="+c).join("&")}&sinceTimePeriod=${y0}-01`,
    elec:`nrg_pc_204?geo=IT&nrg_cons=KWH2500-4999&tax=I_TAX&currency=EUR&unit=KWH&sinceTimePeriod=${y0}-S1`,
    gas:`nrg_pc_202?geo=IT&nrg_cons=GJ20-199&tax=I_TAX&currency=EUR&unit=KWH&sinceTimePeriod=${y0}-S1`,
    hpi:`prc_hpi_q?geo=IT&purchase=TOTAL&unit=I15_Q&sinceTimePeriod=${y0}-Q1`
  };
  const es={};
  await Promise.all(Object.entries(qs).map(async([k,q])=>{ try{ const j=await esGet(q); es[k]=esParse(j, k==="hicp"?"coicop18":null); es[k+"_upd"]=j.updated; }catch(e){ es[k]=null; } }));
  DT.es=es; DT.at=Date.now();
  try{ DT.fuel=await fuelToday(); }catch(e){ DT.fuel=null; }
  DT.busy=false;
}
/* prezzi di oggi di benzina e gasolio self: mediana di tutti i distributori aggiornati negli ultimi 7 giorni */
async function fuelToday(){
  const today=ymd(new Date());
  try{ const c=JSON.parse(localStorage.getItem("grz_fuelToday")||"null"); if(c && c.d===today) return c; }catch(e){}
  const r=await fetch("https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv"); if(!r.ok) throw new Error("HTTP "+r.status);
  const txt=await r.text(), lines=txt.split("\n"); const B=[], G=[]; const lim=Date.now()-7*86400e3;
  const est=(lines[0].match(/(\d{4}-\d{2}-\d{2})/)||[])[1]||today;
  for(let i=2;i<lines.length;i++){ const f=lines[i].split("|"); if(f.length<5 || f[3]!=="1") continue;
    const p=+f[2]; if(!(p>1 && p<3.5)) continue;
    const m=f[4].match(/(\d{2})\/(\d{2})\/(\d{4})/); if(m && new Date(+m[3],+m[2]-1,+m[1]).getTime()<lim) continue;
    if(f[1]==="Benzina") B.push(p); else if(f[1]==="Gasolio") G.push(p); }
  const med=a=>{ a.sort((x,y)=>x-y); return a.length? a[Math.floor(a.length/2)] : null; };
  const out={ d:today, est, b:med(B), g:med(G), nb:B.length, ng:G.length };
  try{ localStorage.setItem("grz_fuelToday", JSON.stringify(out)); const h=JSON.parse(localStorage.getItem("grz_fuelHist")||"{}"); h[est]={ b:out.b, g:out.g }; localStorage.setItem("grz_fuelHist", JSON.stringify(h)); }catch(e){}
  return out;
}
/* utilità per le schede */
const dtFmt=(x,d=2)=>x.toLocaleString("it-IT",{ minimumFractionDigits:d, maximumFractionDigits:d });
function dtPeriodLabel(p){ if(/^\d{4}-\d{2}$/.test(p)) return new Date(+p.slice(0,4),+p.slice(5)-1,1).toLocaleDateString("it-IT",{ month:"short", year:"numeric" });
  if(/S\d$/.test(p)) return (p.endsWith("1")?"1° sem. ":"2° sem. ")+p.slice(0,4); if(/Q\d$/.test(p)) return p.slice(-1)+"° trim. "+p.slice(0,4); return p; }
function dtYearsAgo(s, years){ // valore di circa N anni fa (stesso periodo)
  const last=s[s.length-1][0], y=+last.slice(0,4)-years, target=y+last.slice(4); let best=null; s.forEach(p=>{ if(p[0]<=target) best=p; }); return best; }
function dtChg(s, years){ const a=dtYearsAgo(s,years), b=s[s.length-1]; return a&&a[1]>0 ? b[1]/a[1]-1 : null; }
function dtChips(s){ return [1,5,10].filter(y=>y<=DT.span).map(y=>{ const c=dtChg(s,y); return c==null?"":`<span class="dt-chip ${c>=0?"up":"dn"}">${y===1?"1 anno":y+" anni"} <b>${c>=0?"+":"−"}${Math.abs(c*100).toFixed(0)}%</b></span>`; }).join(""); }
/* grafico con le metriche: prezzo (o variazione %) sull'asse a destra, anni in basso, minimo e massimo,
   e tenendo il dito sopra leggi il valore di quel mese. «dec» = decimali del prezzo; senza dec è un indice → in %. */
const DT_CH={}; let dtChN=0;
function dtSpark(s, cls, dec, u){
  const yrs=DT.span, last=s[s.length-1][0], cut=(+last.slice(0,4)-yrs)+last.slice(4), S=s.filter(p=>p[0]>=cut); if(S.length<2) return "";
  const pct=dec==null, base=S[0][1], val=p=>pct?(p[1]/base-1)*100:p[1];
  const W=340, H=150, L=2, R=W-50, T=22, Bt=H-20, v=S.map(val);
  let mn=Math.min(...v), mx=Math.max(...v); const pad=(mx-mn)*.08||Math.abs(mx)*.05||1; mn-=pad; mx+=pad;
  const tx=d=>{ const y=+d.slice(0,4), m=d.length>=7&&/^\d{4}-\d{2}/.test(d)?+d.slice(5,7)-1:/S2$/.test(d)?6:/Q(\d)$/.test(d)?(+d.slice(-1)-1)*3:0; return y+m/12; };
  const t0=tx(S[0][0]), t1=tx(last), X=d=>L+(tx(d)-t0)/((t1-t0)||1)*(R-L), Y=x=>Bt-(Bt-T)*(x-mn)/((mx-mn)||1);
  const fmt=x=>pct?(x>=0?"+":"−")+Math.abs(x).toFixed(Math.abs(mx-mn)<8?1:0).replace(".",",")+"%":dtFmt(x,dec);
  const ticks=[0,1,2,3].map(k=>mn+pad+(mx-mn-2*pad)*k/3);
  const y0=Math.ceil(t0), step=(t1-t0)>7?2:1, yrsT=[]; for(let y=y0;y<=Math.floor(t1);y+=step) yrsT.push(y);
  const pts=S.map((p,i)=>`${X(p[0]).toFixed(1)},${Y(v[i]).toFixed(1)}`).join(" ");
  const iMn=v.indexOf(Math.min(...v)), iMx=v.indexOf(Math.max(...v)), id="dtc"+(++dtChN);
  DT_CH[id]={ S, v, X, Y, fmt, u:pct?" rispetto al "+dtPeriodLabel(S[0][0]):(u||""), R };
  const dot=(i,c)=>`<circle cx="${X(S[i][0]).toFixed(1)}" cy="${Y(v[i]).toFixed(1)}" r="3" class="${c}"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="dt-ch ${cls||""}" id="${id}" role="img" aria-label="Andamento">
    <defs><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="dt-ga"/><stop offset="1" class="dt-gb"/></linearGradient></defs>
    ${ticks.map(t=>`<line x1="${L}" x2="${R}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" class="dt-gl"/><text x="${R+5}" y="${(Y(t)+3.5).toFixed(1)}" class="dt-ax">${fmt(t)}</text>`).join("")}
    ${pct?`<line x1="${L}" x2="${R}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" class="dt-zero"/>`:""}
    ${yrsT.map(y=>{ const x=L+(y-t0)/((t1-t0)||1)*(R-L); return `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${Bt}" y2="${Bt+4}" class="dt-tk"/><text x="${x.toFixed(1)}" y="${H-5}" class="dt-ax" text-anchor="${x<14?"start":x>R-14?"end":"middle"}">${y}</text>`; }).join("")}
    <polygon points="${L},${Bt} ${pts} ${X(last).toFixed(1)},${Bt}" fill="url(#${id}g)"/>
    <polyline points="${pts}" class="dt-ln"/>
    ${dot(iMn,"dt-mn")}${dot(iMx,"dt-mx")}${dot(S.length-1,"dt-now")}
    <text x="${L}" y="12" class="dt-cap" id="${id}c">min ${fmt(v[iMn])} (${dtPeriodLabel(S[iMn][0])}) · max ${fmt(v[iMx])} (${dtPeriodLabel(S[iMx][0])})</text>
    <g class="dt-tip" id="${id}t" style="display:none"><line y1="${T-4}" y2="${Bt}" class="dt-tl"/><circle r="4.5" class="dt-td"/></g></svg>`;
}
function dtScrub(svg, cx){
  const C=DT_CH[svg.id]; if(!C) return; const r=svg.getBoundingClientRect(), x=(cx-r.left)/r.width*340;
  let i=0, best=1e9; C.S.forEach((p,k)=>{ const d=Math.abs(C.X(p[0])-x); if(d<best){ best=d; i=k; } });
  const g=document.getElementById(svg.id+"t"), X=C.X(C.S[i][0]), Y=C.Y(C.v[i]); g.style.display="";
  g.querySelector("line").setAttribute("x1",X); g.querySelector("line").setAttribute("x2",X); g.querySelector("circle").setAttribute("cx",X); g.querySelector("circle").setAttribute("cy",Y);
  document.getElementById(svg.id+"c").textContent=`${dtPeriodLabel(C.S[i][0])}: ${C.fmt(C.v[i])}${C.u}`;
}
document.addEventListener("pointerdown",e=>{ const s=e.target.closest(".dt-ch"); if(!s) return; dtScrub(s,e.clientX); s.setPointerCapture&&s.setPointerCapture(e.pointerId); });
document.addEventListener("pointermove",e=>{ const s=e.target.closest(".dt-ch"); if(s && e.buttons) dtScrub(s,e.clientX); });
function dtCard(o){
  return `<div class="dt-card"><div class="dt-h"><span class="dt-e">${o.e}</span><div><b>${o.t}</b><small>${o.sub||""}</small></div><div class="dt-v num">${o.v}<small>${o.u||""}</small></div></div>
    ${o.s?dtSpark(o.s,o.cls,o.dec,o.u):""}${o.s?`<div class="dt-chips">${dtChips(o.s)}</div>`:""}
    ${o.you?`<p class="dt-you">${o.you}</p>`:""}</div>`;
}
/* serie di un indice riportata a prezzo: valore di oggi × indice / indice di oggi.
   Dove il motore ha raccolto i prezzi veri (key «b» o «g»), il mese usa la loro media. */
function dtScale(idx, now, key){
  const last=idx[idx.length-1][1], s=idx.map(p=>[p[0], now*p[1]/last]);
  if(key && DT.fuelHist && DT.fuelHist.length){ const mon={};
    DT.fuelHist.forEach(([d,x])=>{ if(x&&x[key]){ const m=d.slice(0,7); (mon[m]=mon[m]||[]).push(x[key]); } });
    Object.entries(mon).forEach(([m,a])=>{ const v=a.reduce((x,y)=>x+y,0)/a.length, i=s.findIndex(p=>p[0]===m); if(i>=0) s[i][1]=v; else s.push([m,v]); });
    s.sort((a,b)=>a[0]<b[0]?-1:1); }
  return s;
}
function dtBase(idx, years){ const a=dtYearsAgo(idx, years), b=idx[idx.length-1]; return a? b[1]/a[1] : null; }

function datiHtml(){
  const es=DT.es, H=es&&es.hicp, F=DT.fuel;
  let h=`<section><div class="dt-top"><div><div class="sec-title" style="margin:0">Dati</div><p class="sec-sub" style="margin:4px 0 0">Quanto costa vivere in Italia, oggi e negli ultimi ${DT.span} anni.</p></div>
    <div class="pfc-tabs">${[5,10].map(y=>`<button data-dtspan="${y}" class="${DT.span===y?"on":""}">${y} anni</button>`).join("")}</div></div></section>`;
  if(!es){ return h+`<section><div class="card"><div class="chart-msg">${DT.busy?"Carico i dati ufficiali…":"Dati non raggiungibili: controlla la connessione e tocca Aggiorna."}</div></div></section>`; }
  const ans=(typeof B!=="undefined"&&B.ans)||{}, C=[];
  // benzina e gasolio: prezzo di oggi dal ministero, storia dall'indice Eurostat dei prezzi alla pompa
  const pet=H&&H.CP07222, die=H&&H.CP07221;
  if(F&&F.b&&pet){ const s=dtScale(pet,F.b,"b"), daily=(num(ans.commute)+num(ans.commute_hi||ans.commute))/2||8, k10=dtBase(pet,DT.span);
    C.push(dtCard({ e:"⛽", t:"Benzina self", sub:`media di ${F.nb.toLocaleString("it-IT")} distributori${F.bMI?` · Milano ${dtFmt(F.bMI,3)}`:""} · ${new Date(F.est).toLocaleDateString("it-IT",{ day:"numeric", month:"short" })}`, v:dtFmt(F.b,3), u:" €/l", dec:3, s, cls:"warm",
      you:`Con i tuoi ${m0(daily)} al giorno fai <b>${dtFmt(daily/F.b,1)} litri</b>${k10?`; ${DT.span} anni fa con gli stessi soldi ne facevi <b>${dtFmt(daily/(F.b/k10),1)}</b>`:""}.` })); }
  if(F&&F.g&&die){ C.push(dtCard({ e:"🚚", t:"Gasolio self", sub:`media di ${F.ng.toLocaleString("it-IT")} distributori${F.gMI?` · Milano ${dtFmt(F.gMI,3)}`:""}`, v:dtFmt(F.g,3), u:" €/l", dec:3, s:dtScale(die,F.g,"g"), cls:"warm" })); }
  if(es.elec&&es.elec._){ const s=es.elec._, now=s[s.length-1][1];
    C.push(dtCard({ e:"💡", t:"Luce per le famiglie", sub:`tasse comprese · ${dtPeriodLabel(s[s.length-1][0])}`, v:dtFmt(now,3), u:" €/kWh", dec:3, s, cls:"yel",
      you:`Una casa che consuma 2.700 kWh l'anno spende circa <b>${m0(now*2700)}</b> l'anno (${m0(now*2700/12)} al mese).` })); }
  if(es.gas&&es.gas._){ const s=es.gas._, now=s[s.length-1][1], smc=now*10.69;
    C.push(dtCard({ e:"🔥", t:"Gas per le famiglie", sub:`tasse comprese · ${dtPeriodLabel(s[s.length-1][0])}`, v:dtFmt(smc,2), u:" €/Smc", dec:2, s:s.map(p=>[p[0],p[1]*10.69]), cls:"blu",
      you:`Con 800 Smc l'anno (riscaldamento di un appartamento medio) sono circa <b>${m0(smc*800)}</b> l'anno.` })); }
  if(H&&H.CP041){ const s=H.CP041, k=dtBase(s,DT.span);
    C.push(dtCard({ e:"🏠", t:"Affitti", sub:`indice dei canoni · ${dtPeriodLabel(s[s.length-1][0])}`, v:(k?"+"+((k-1)*100).toFixed(0)+"%":"—"), u:` in ${DT.span} anni`, s, cls:"teal",
      you:k?`Un affitto da 600 € di ${DT.span} anni fa oggi è circa <b>${m0(600*k)}</b>. Gli affitti in corso salgono piano: i contratti nuovi nelle grandi città crescono di più.`:"" })); }
  if(es.hpi&&es.hpi._){ const s=es.hpi._, k=dtBase(s,DT.span);
    C.push(dtCard({ e:"🏡", t:"Prezzo delle case", sub:`indice delle compravendite · ${dtPeriodLabel(s[s.length-1][0])}`, v:(k?(k>=1?"+":"−")+Math.abs((k-1)*100).toFixed(0)+"%":"—"), u:` in ${DT.span} anni`, s, cls:"teal",
      you:k?`Una casa pagata 200.000 € ${DT.span} anni fa oggi costerebbe circa <b>${m0(200000*k)}</b>. È la media italiana: Milano corre molto di più.`:"" })); }
  if(H&&H.CP011){ const s=H.CP011, k=dtBase(s,DT.span), sp=(typeof B!=="undefined"&&B.cats)?(B.cats.find(c=>c.id==="spesa")||{}).plan:0;
    C.push(dtCard({ e:"🛒", t:"Cibo e spesa", sub:`indice dei prezzi alimentari · ${dtPeriodLabel(s[s.length-1][0])}`, v:(k?"+"+((k-1)*100).toFixed(0)+"%":"—"), u:` in ${DT.span} anni`, s, cls:"grn",
      you:k?`La spesa da 100 € di ${DT.span} anni fa oggi costa <b>${m0(100*k)}</b>.${sp?` La tua spesa di ${m0(sp)} al mese allora costava circa ${m0(sp/k)}.`:""}`:"" })); }
  if(H&&H.TOTAL){ const s=H.TOTAL, k=dtBase(s,DT.span), y1=dtChg(s,1);
    C.push(dtCard({ e:"🧾", t:"Prezzi in generale", sub:`inflazione · ${dtPeriodLabel(s[s.length-1][0])}`, v:(y1!=null?(y1>=0?"+":"−")+Math.abs(y1*100).toFixed(1).replace(".",",")+"%":"—"), u:" in un anno", s, cls:"",
      you:k?`Con 100 € oggi compri quello che ${DT.span} anni fa costava <b>${m0(100/k)}</b>. Per questo i risparmi fermi sul conto perdono valore e vanno investiti.`:"" })); }
  h+=`<section><div class="dt-grid">${C.join("")}</div></section>`;
  h+=`<section><p class="bnote">Fonti: Eurostat (prezzi al consumo HICP ${es.hicp_upd?"aggiornati al "+new Date(es.hicp_upd).toLocaleDateString("it-IT"):""}, prezzi di luce e gas per le famiglie, indice dei prezzi delle case) e Ministero delle Imprese (prezzi dei carburanti di oggi). Per benzina e gasolio la storia segue l'indice ufficiale dei prezzi alla pompa${es.server?`; dal motore di Gruzzolo, che raccoglie i prezzi veri ogni notte (${es.days} ${es.days===1?"giorno":"giorni"} finora) e gli altri dati ogni settimana`:""}. <button class="add" data-dt="reload">${DT.busy?"Aggiorno…":"Aggiorna"}</button></p></section>`;
  return h;
}
async function renderDati(force){
  const el=document.getElementById("datiBody"); if(!el) return;
  el.innerHTML=datiHtml();
  if(force || !DT.es || Date.now()-DT.at>6*3600e3 || (!DT.es.server && typeof engServerOn==="function" && engServerOn())){ await dtLoad(force); el.innerHTML=datiHtml(); }
}
document.addEventListener("click",e=>{ const s=e.target.closest("[data-dtspan]"); if(s){ DT.span=+s.dataset.dtspan; const el=document.getElementById("datiBody"); if(el) el.innerHTML=datiHtml(); return; }
  if(e.target.closest('[data-dt="reload"]')){ try{ Object.keys(localStorage).filter(k=>k.startsWith("grz_es_")||k==="grz_fuelToday").forEach(k=>localStorage.removeItem(k)); }catch(_){ } renderDati(true); } });

/* ===== Dati: due schede, «I miei dati» (le statistiche) e «Costo della vita» ===== */
let DTV=(()=>{ try{ return localStorage.getItem("grz_dtv")||"mine"; }catch(e){ return "mine"; } })();
function dtView(v){
  if(v) DTV=v; try{ localStorage.setItem("grz_dtv",DTV); }catch(e){}
  document.querySelectorAll("[data-dtv]").forEach(b=>b.classList.toggle("on",b.dataset.dtv===DTV));
  const m=document.getElementById("dtMine"), d=document.getElementById("datiBody"); if(!m||!d) return;
  m.style.display=DTV==="mine"?"":"none"; d.style.display=DTV==="vita"?"":"none";
  if(DTV==="mine"){ if(typeof phRender==="function") phRender(); if(typeof renderStat==="function") renderStat(); } else renderDati(false);
}
document.addEventListener("click",e=>{ const b=e.target.closest("[data-dtv]"); if(b){ dtView(b.dataset.dtv); window.scrollTo(0,0); } });
(function(){ const st=window.showTab; if(typeof st!=="function") return;
  window.showTab=function(n){ if(n==="stat"){ DTV="mine"; n="dati"; } const r=st.call(this,n); if(n==="dati") dtView(); return r; }; })();

/* ===== Tempo al telefono (I miei dati) ===== */
function phFmt(min){ min=Math.round(min||0); const h=Math.floor(min/60), m=min%60; return h?`${h} h${m?` ${m} min`:""}`:`${m} min`; }
function phRender(){
  const host=document.getElementById("phoneHost"), N=window.GruzzoloNative; if(!host) return;
  if(!N || typeof N.phoneUsage!=="function"){ host.innerHTML=""; return; }
  let D={}; try{ D=JSON.parse(N.phoneUsage(7))||{}; }catch(e){}
  if(!D.usage && !D.calls){ host.innerHTML=`<div class="card ph"><div class="ph-h">📱 Il tuo tempo al telefono</div>
      <p class="pn-note" style="margin-top:4px">Quante ore passi sullo schermo, su quali app e quanto in chiamata. I dati restano sul telefono: Android chiede il permesso.</p>
      <div class="btn-row"><button class="btn gold" data-ph="usage">Attiva tempo sullo schermo</button></div><button class="btn ghost" data-ph="calls" style="margin-top:8px">Attiva minuti in chiamata</button></div>`; return; }
  const sc=D.screen||[], cl=D.call||[], today=sc.length?sc[sc.length-1].min:0, days=sc.filter(x=>x.min>0), avg=days.length?days.reduce((a,x)=>a+x.min,0)/days.length:0;
  const cTot=cl.reduce((a,x)=>a+x.min,0), cN=cl.reduce((a,x)=>a+x.n,0);
  const ans=(typeof B!=="undefined"&&B.ans)||{}, hourly=num(ans.net)>0 ? num(ans.net)/(Math.max(1,num(ans.workDays||5))*4.33*8) : 0;
  const yearDays=avg*365/60/24, max=Math.max(1,...sc.map(x=>x.min),...cl.map(x=>x.min));
  const lab=d=>{ const x=addDays(today0(), d); return d===0?"oggi":x.toLocaleDateString("it-IT",{ weekday:"short" }).slice(0,2); };
  const bars=sc.map((x,i)=>{ const c=(cl[i]||{}).min||0; return `<div class="ph-b"><div class="ph-bb"><i class="s" style="height:${(x.min/max*100).toFixed(1)}%"></i>${c?`<i class="c" style="height:${(c/max*100).toFixed(1)}%"></i>`:""}</div><small>${lab(x.d)}</small></div>`; }).join("");
  const apps=(D.apps||[]), amax=Math.max(1,...apps.map(a=>a.min));
  host.innerHTML=`<div class="card fz ph"><div class="fz-top"><div class="fz-val"><small>Oggi sullo schermo</small><b class="num">${D.usage?phFmt(today):"—"}</b>
      <span>${D.usage?`media ${phFmt(avg)} al giorno`:"tempo sullo schermo non attivo"}${D.calls?` · in chiamata ${phFmt(cTot)} in 7 giorni (${cN} ${cN===1?"chiamata":"chiamate"})`:""}</span></div></div>
    ${sc.length||cl.length?`<div class="ph-chart">${bars||cl.map(x=>`<div class="ph-b"><div class="ph-bb"><i class="c" style="height:${(x.min/max*100).toFixed(1)}%"></i></div><small>${lab(x.d)}</small></div>`).join("")}</div>
      <div class="pn-leg">${D.usage?`<span><i style="background:var(--gold)"></i>schermo</span>`:""}${D.calls?`<span><i style="background:#8FA0E0"></i>in chiamata</span>`:""}</div>`:""}
    ${D.usage&&avg>0?`<div class="ph-k"><div><small>in un anno</small><b class="num">${Math.round(yearDays)} giorni</b><span>interi sullo schermo</span></div>
      ${hourly?`<div><small>se fossero ore pagate</small><b class="num">${m0(avg/60*30*hourly)}</b><span>al mese (a ${money(hourly)}/h)</span></div>`:""}
      <div><small>un'ora in meno al giorno</small><b class="num pos">+${Math.round(365/24)} giorni</b><span>liberi all'anno</span></div></div>`:""}
    ${apps.length?`<div class="fzp"><div class="fzp-h"><span>App più usate · 7 giorni</span></div>${apps.map(a=>`<div class="ph-a"><span>${esc(a.n)}</span><div class="ph-ab"><i style="width:${(a.min/amax*100).toFixed(1)}%"></i></div><b class="num">${phFmt(a.min)}</b></div>`).join("")}</div>`:""}
    ${!D.usage?`<button class="add" data-ph="usage">Attiva anche il tempo sullo schermo →</button>`:""}${!D.calls?`<button class="add" data-ph="calls" style="display:block">Attiva anche i minuti in chiamata →</button>`:""}
  </div>`;
}
window.phRefresh=phRender;
document.addEventListener("click",e=>{ const b=e.target.closest("[data-ph]"); if(!b) return; const N=window.GruzzoloNative; if(!N) return;
  if(b.dataset.ph==="usage"){ toast("Cerca Gruzzolo nell'elenco e attiva «Consenti accesso all'utilizzo», poi torna qui"); N.allowUsage(); }
  else N.allowCalls(); });
document.addEventListener("visibilitychange",()=>{ if(!document.hidden && typeof DTV!=="undefined" && DTV==="mine" && document.getElementById("page-dati").classList.contains("active")) phRender(); });
