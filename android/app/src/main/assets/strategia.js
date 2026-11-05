/* Strategia: il costruttore del portafoglio, nel Piano, in pannelli HUD.
   Scegli uno dei 5 profili o un portafoglio su misura (pesi delle quattro voci). Per la scelta vedi:
   - obiettivo contro quello che hai oggi;
   - il backtest con i rendimenti veri dal 2004 (versamenti mensili con la regola dell'app: compra le voci sotto peso, mai vendere);
   - il calo peggiore e quanto ci ha messo a recuperare, i 12 mesi peggiori, la volatilità;
   - la previsione Monte Carlo in euro di oggi, con la probabilità di arrivare al traguardo;
   - le regole che la strategia segue ogni mese.
   «Applica» la rende quella usata dal serbatoio del mese, dagli acquisti proposti e dal Replay. */
const ST_KEYS = ["SWDA", "EIMI", "AGGH", "XEON"];
const ST_COL = { SWDA:"#00E5FF", EIMI:"#8C7CFF", AGGH:"#1DF2B6", XEON:"#FFB020" };
const ST_LAB = { SWDA:"Azioni mondo", EIMI:"Azioni emergenti", AGGH:"Obbligazioni", XEON:"Liquidità" };
const ST_FROM = [["2004","dal 2004"],["2008","dal 2008 · crisi"],["10y","ultimi 10 anni"]];
let STG = { q:null, cw:null, from:"2004" };

PN_COL[6] = "#00E5FF"; PN_EMO[6] = "🧩"; PN_TAG[6] = "pesi scelti da te";
function stSetCustom(w){ const o={}; ST_KEYS.forEach(k=>{ if(w[k]>0) o[k]=w[k]; }); PROFILES[6]={ n:"Su misura", w:o }; if(typeof mcMemo!=="undefined") Object.keys(mcMemo).forEach(k=>{ if(k.startsWith("6|")) delete mcMemo[k]; }); }
if(PL.cw) stSetCustom(PL.cw);
// HS(6): numeri del portafoglio su misura calcolati sullo storico (o, senza storico, quelli del profilo più vicino)
const stHS0 = HS;
HS = function(p){
  if(p!==6) return stHS0(p);
  const s=stStats(wOf(6)); if(s) return s;
  const az=profStats0(PROFILES[6].w).az; return stHS0(az<35?1:az<60?2:az<78?3:az<93?4:5);
};
function profStats0(w){ let az=0, ob=0, liq=0; for(const k in w){ const c=ASSETS[k].k; if(c==="az") az+=w[k]; else if(c==="ob") ob+=w[k]; else liq+=w[k]; } return { az, ob, liq }; }

/* numeri del portafoglio con i pesi w (frazioni) sui mesi veri */
const stMemo = {};
function stStats(w){
  if(typeof HIST==="undefined" || !HIST) return null;
  const key=ST_KEYS.map(k=>w[k]||0).join(",")+"|"+HIST.to; if(stMemo[key]) return stMemo[key];
  const N=HIST.months.length, v=[1];
  for(let t=0;t<N;t++){ let r=0; for(const k in w) r+=w[k]*HIST.r[k][t]; v.push(v[t]*(1+r)); }
  let peak=1, pk=0, mdd=0, at=0, atPk=0;
  v.forEach((x,i)=>{ if(x>peak){ peak=x; pk=i; } const d=x/peak-1; if(d<mdd){ mdd=d; at=i; atPk=pk; } });
  let recov=null; for(let i=at;i<v.length;i++) if(v[i]>=v[atPk]){ recov=i-at; break; }
  let worst12=9, w12=0, best12=-9, pos=0, n12=0; for(let i=0;i+12<v.length;i++){ const r=v[i+12]/v[i]-1; n12++; if(r>0) pos++; if(r<worst12){ worst12=r; w12=i; } if(r>best12) best12=r; }
  const mr=[]; for(let i=1;i<v.length;i++) mr.push(v[i]/v[i-1]-1);
  const mean=mr.reduce((s,x)=>s+x,0)/mr.length, vol=Math.sqrt(mr.reduce((s,x)=>s+(x-mean)*(x-mean),0)/mr.length*12);
  const cagr=Math.pow(v[N],12/N)-1;
  const m=k=>HIST.months[Math.max(0,Math.min(N-1,k-1))];
  return stMemo[key]={ cagr, vol, mdd, mddFrom:m(atPk), mddAt:m(at), recov, worst12, w12From:HIST.months[w12], best12, pos12:n12?pos/n12:0, ratio:vol>0?cagr/vol:0 };
}
function stTer(w){ let t=0; for(const k in w) t+=w[k]/100*ASSETS[k].ter; return t; }
function stW(q){ return q===6 ? STG.cw : PROFILES[q].w; }
function stFrac(w){ const o={}; for(const k in w) if(w[k]>0) o[k]=w[k]/100; return o; }
function stMonth(k){ return typeof monthIt==="function" ? monthIt(k) : k; }

/* ---------- grafici SVG ---------- */
function stArc(cx, cy, r, a0, a1){ const p=a=>[cx+r*Math.cos(a), cy+r*Math.sin(a)], [x0,y0]=p(a0), [x1,y1]=p(a1); return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1-a0>Math.PI?1:0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; }
function stDonut(w, now, az){
  const R1=62, R2=46, cx=80, cy=80; let a=-Math.PI/2, o="", i="";
  ST_KEYS.forEach(k=>{ const f=(w[k]||0)/100; if(f<=0) return; const b=a+f*Math.PI*2; o+=`<path d="${stArc(cx,cy,R1,a+0.02,b-0.02)}" stroke="${ST_COL[k]}" stroke-width="12" fill="none" class="st-glow"/>`; a=b; });
  const tn=Object.values(now).reduce((s,x)=>s+x,0);
  if(tn>0){ a=-Math.PI/2; Object.keys(now).forEach(k=>{ const f=now[k]/tn; if(f<=0) return; const b=a+f*Math.PI*2; i+=`<path d="${stArc(cx,cy,R2,a+0.03,b-0.03)}" stroke="${ST_COL[k]||"#5E7884"}" stroke-width="5" fill="none" opacity=".75"/>`; a=b; }); }
  else i=`<circle cx="${cx}" cy="${cy}" r="${R2}" stroke="#17323D" stroke-width="5" fill="none" stroke-dasharray="3 4"/>`;
  return `<svg viewBox="0 0 160 160" class="st-donut" aria-hidden="true">${o}${i}
    <text x="${cx}" y="${cy-2}" text-anchor="middle" class="st-dn">${az}%</text><text x="${cx}" y="${cy+14}" text-anchor="middle" class="st-dl">azioni</text></svg>`;
}
function stGauge(f, col, big, lab){
  const segs=28, a0=150, tot=240, cx=60, cy=60, r=48; let s="";
  for(let i=0;i<segs;i++){ const p=i/segs, A=(a0+tot*p)*Math.PI/180, B=(a0+tot*p+tot/segs-2.4)*Math.PI/180;
    s+=`<path d="${stArc(cx,cy,r,A,B)}" stroke="${p<f?stRisk(p):"#17323D"}" stroke-width="9" fill="none" style="animation-delay:${i*18}ms" class="${p<f?"st-seg":""}"/>`; }
  return `<svg viewBox="0 0 120 104" class="st-gauge" aria-hidden="true">${s}<text x="60" y="64" text-anchor="middle" class="st-gb" fill="${col}">${big}</text><text x="60" y="100" text-anchor="middle" class="st-dl">${lab}</text></svg>`;
}
function stRisk(x){ return x<.33?"#1DF2B6":x<.6?"#FFB020":"#FF3B5C"; }
/* backtest dei versamenti: valore contro versato, il momento peggiore e il calo sotto (underwater) */
function stBack(w, M){
  const N=HIST.months.length, i0=STG.from==="2008"?Math.max(0,HIST.months.indexOf("2007-10")):STG.from==="10y"?Math.max(0,N-120):0;
  const s=pacSim(w, i0, N, Math.max(1,M), 0), V=s.vals, P=s.paids, n=V.length;
  let worst=9, wAt=0; V.forEach((v,i)=>{ const r=v/P[i]; if(r<worst){ worst=r; wAt=i; } });
  // calo dal massimo dell'indice (senza i versamenti nuovi, che lo nasconderebbero)
  let idx=1, ipk=1; const lump=[]; for(let t=i0;t<N;t++){ let r=0; for(const k in w) r+=w[k]*HIST.r[k][t]; idx*=1+r; if(idx>ipk) ipk=idx; lump.push(idx/ipk-1); }
  const Wd=340, H=150, U=46, L=4, Rr=Wd-46, T=10, Bt=H-4, X=i=>L+i/(n-1)*(Rr-L), max=Math.max(...V)*1.05, Y=v=>Bt-(Bt-T)*v/max;
  const pts=V.map((v,i)=>`${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" "), pp=P.map((v,i)=>`${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const mn=Math.min(...lump,-0.05), Yd=d=>H+6+(U-8)*d/mn;
  const und=`M${X(0)} ${H+6} `+lump.map((d,i)=>`L${X(i).toFixed(1)} ${Yd(d).toFixed(1)}`).join(" ")+` L${X(n-1)} ${H+6} Z`;
  const yrs=[]; for(let i=0;i<n;i++){ const m=HIST.months[i0+i]; if(m.endsWith("-01") && (+m.slice(0,4))%4===0) yrs.push([i,m.slice(0,4)]); }
  const svg=`<svg viewBox="0 0 ${Wd} ${H+U+12}" class="st-svg" aria-hidden="true">
    <defs><linearGradient id="stg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#00E5FF" stop-opacity=".35"/><stop offset="1" stop-color="#00E5FF" stop-opacity="0"/></linearGradient></defs>
    ${[.25,.5,.75].map(f=>`<line x1="${L}" x2="${Rr}" y1="${Y(max*f).toFixed(1)}" y2="${Y(max*f).toFixed(1)}" class="st-grid"/>`).join("")}
    ${yrs.map(([i,y])=>`<line x1="${X(i).toFixed(1)}" x2="${X(i).toFixed(1)}" y1="${T}" y2="${H+U}" class="st-grid"/><text x="${X(i).toFixed(1)}" y="${H+U+10}" class="st-ax" text-anchor="middle">${y}</text>`).join("")}
    <polygon points="${X(0)},${Bt} ${pts} ${X(n-1)},${Bt}" fill="url(#stg1)"/>
    <polyline points="${pp}" class="st-paid"/>
    <polyline points="${pts}" class="st-line st-glow"/>
    <circle cx="${X(wAt).toFixed(1)}" cy="${Y(V[wAt]).toFixed(1)}" r="4" class="st-worst"/>
    <circle cx="${X(n-1).toFixed(1)}" cy="${Y(V[n-1]).toFixed(1)}" r="3.5" class="st-end"/>
    <text x="${Rr+4}" y="${(Y(V[n-1])+3).toFixed(1)}" class="st-vl">${Math.round(V[n-1]/1000)}k</text>
    <text x="${Rr+4}" y="${(Y(P[n-1])+3).toFixed(1)}" class="st-vl dim">${Math.round(P[n-1]/1000)}k</text>
    <path d="${und}" class="st-und"/><text x="${L+2}" y="${H+16}" class="st-ax">calo dal massimo</text><text x="${Rr+4}" y="${(Yd(mn)+3).toFixed(1)}" class="st-vl red">${Math.round(mn*100)}%</text>
  </svg>`;
  return { svg, fin:V[n-1], paid:P[n-1], worst, wAt:HIST.months[i0+wAt], wVal:V[wAt], wPaid:P[wAt], from:HIST.months[i0], gain:V[n-1]-P[n-1] };
}
/* previsione: ventaglio 10%–90% e mediana in euro di oggi, linea del traguardo */
function stratFan(q, v0, M, inf, HZ, G){
  const r=pnRun(q, v0, M, inf), Wd=340, H=170, L=4, Rr=Wd-46, T=10, Bt=H-16, X=y=>L+y/HZ*(Rr-L);
  const max=Math.max(r.p90[HZ], G?G.v:0)*1.06, Y=v=>Bt-(Bt-T)*Math.min(v,max)/max;
  const band=r.p90.slice(0,HZ+1).map((v,y)=>`${X(y).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")+" "+r.p10.slice(0,HZ+1).map((v,y)=>[y,v]).reverse().map(([y,v])=>`${X(y).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const med=r.p50.slice(0,HZ+1).map((v,y)=>`${X(y).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const cash=[]; for(let y=0;y<=HZ;y++) cash.push((v0+M*12*y)/Math.pow(1+inf,y));
  const cp=cash.map((v,y)=>`${X(y).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  let prob=null; if(G) try{ const raw=mcRun(q, v0, Math.round(M), 30, 300), k=Math.pow((1+INFL)/(1+inf), HZ); prob=raw.all[HZ].filter(x=>x*k>=G.v).length/raw.all[HZ].length; }catch(e){}
  const svg=`<svg viewBox="0 0 ${Wd} ${H}" class="st-svg" aria-hidden="true">
    <defs><linearGradient id="stg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8C7CFF" stop-opacity=".45"/><stop offset="1" stop-color="#00E5FF" stop-opacity=".12"/></linearGradient></defs>
    ${[.25,.5,.75].map(f=>`<line x1="${L}" x2="${Rr}" y1="${Y(max*f).toFixed(1)}" y2="${Y(max*f).toFixed(1)}" class="st-grid"/>`).join("")}
    <polygon points="${band}" fill="url(#stg2)" class="st-band"/>
    <polyline points="${cp}" class="st-paid"/>
    <polyline points="${med}" class="st-line st-glow"/>
    ${G?`<line x1="${L}" x2="${Rr}" y1="${Y(G.v).toFixed(1)}" y2="${Y(G.v).toFixed(1)}" class="st-goal"/>`:""}
    <text x="${Rr+4}" y="${(Y(r.p90[HZ])+3).toFixed(1)}" class="st-vl dim">${Math.round(r.p90[HZ]/1000)}k</text>
    <text x="${Rr+4}" y="${(Y(r.p50[HZ])+3).toFixed(1)}" class="st-vl">${Math.round(r.p50[HZ]/1000)}k</text>
    <text x="${Rr+4}" y="${(Y(r.p10[HZ])+3).toFixed(1)}" class="st-vl dim">${Math.round(r.p10[HZ]/1000)}k</text>
    <text x="${L}" y="${H-3}" class="st-ax">oggi</text><text x="${Rr}" y="${H-3}" class="st-ax" text-anchor="end">${new Date().getFullYear()+HZ}</text>
  </svg>`;
  return { svg, r, prob, cash:cash[HZ], paid:v0+M*12*HZ };
}

/* ---------- pagina ---------- */
function stHtml(M, G, HZ, v0, inf){
  if(STG.q==null) STG.q = PL.provisional ? (PL.pick||3) : PL.prof;
  if(!STG.cw){ STG.cw = Object.assign({ SWDA:0, EIMI:0, AGGH:0, XEON:0 }, PL.cw || PROFILES[Math.min(5,PL.prof||3)].w);
    // i cursori vanno a passi di 5: arrotondo e rimetto la somma a 100 sulla voce più grande
    ST_KEYS.forEach(k=>STG.cw[k]=Math.round(STG.cw[k]/5)*5); const big=ST_KEYS.slice().sort((a,b)=>STG.cw[b]-STG.cw[a])[0]; STG.cw[big]+=100-ST_KEYS.reduce((a,k)=>a+STG.cw[k],0); STG.touch=[]; }
  if(STG.q===6) stSetCustom(STG.cw);
  const q=STG.q, mine=!PL.provisional ? PL.prof : null, sc=(typeof riskScore==="function") ? riskScore(PL.ans) : null, sug=sc?sc.prof:null;
  let h=`<section id="stTool"><div class="hud-panel st-hd" style="--i:0"><div class="hud-ph"><span class="t">strategia // portafoglio modello</span><span class="tag">${HIST?`backtest ${HIST.months[0].slice(0,4)}–${HIST.to.slice(0,4)} · ${HIST.months.length} mesi`:"storico in arrivo"}</span></div>
    <div class="st-chips">${[1,2,3,4,5,6].map(p=>`<button class="st-chip ${p===q?"on":""}" data-st="q" data-v="${p}" style="--pc:${PN_COL[p]}"><small>0${p}</small><b>${p===6?"Su misura":esc(PROFILES[p].n)}</b>${p===mine?`<i>tuo</i>`:p===sug&&!mine?`<i>test</i>`:""}</button>`).join("")}</div>
    ${q===6?`<div class="st-sl">${ST_KEYS.map(k=>`<label class="st-r"><span><i style="background:${ST_COL[k]}"></i>${ST_LAB[k]} <small>${shortName(ASSETS[k].t)}</small></span><input type="range" min="0" max="100" step="5" value="${STG.cw[k]||0}" data-stw="${k}" style="--c:${ST_COL[k]}" aria-label="Peso ${ST_LAB[k]}"><b class="num" id="stv_${k}">${STG.cw[k]||0}%</b></label>`).join("")}</div>`:""}
  </div><div id="stLive">${stLiveHtml(M,G,HZ,v0,inf)}</div></section>`;
  return h;
}
function stLiveHtml(M, G, HZ, v0, inf){
  const q=STG.q, w=stW(q), ps=profStats0(w), mine=!PL.provisional ? PL.prof : null;
  const sc=(typeof riskScore==="function") ? riskScore(PL.ans) : null, cap=sc?sc.cap:null;
  // quello che hai oggi, per voce del modello (titoli fuori modello contano come azioni mondo, o obbligazioni se lo sono)
  const now={}; holdings.forEach(h=>{ const k=Object.keys(ASSETS).find(x=>ASSETS[x].t===h.ticker); const kk=k&&ST_KEYS.includes(k)?k:(k&&ASSETS[k]&&ASSETS[k].k==="ob"?"AGGH":"SWDA"); now[kk]=(now[kk]||0)+Math.max(0,valueOf(h)); });
  const tn=Object.values(now).reduce((a,x)=>a+x,0), st=stStats(stFrac(w)), ter=stTer(w);
  const capQ=cap!=null ? (q===6 ? (ps.az>(PROFILES[cap].w.SWDA||0)+(PROFILES[cap].w.EIMI||0)+5) : q>cap) : false;
  const riskF=st?Math.min(1,-st.mdd/0.55):ps.az/100;
  let h="";
  // 1. composizione: obiettivo contro oggi + rischio
  if(typeof VZ!=="undefined" && VZ.tm && JSON.stringify(ST3.tgt)!==JSON.stringify(w)) VZ.tm=null;
  ST3.tgt=Object.assign({}, w); ST3.M=M; ST3.now=tn>0?Object.fromEntries(ST_KEYS.map(k=>[k,(now[k]||0)/tn*100])):null; ST3.az=ps.az; setTimeout(st3dKick,0);
  h+=`<div class="hud-panel" style="--i:1;margin-top:10px"><div class="hud-ph"><span class="t">${typeof vzTitle==="function"?vzTitle():"composizione // 3d"}</span><span class="tag">${typeof vzMode==="function"&&vzMode()!=="torta"?"si sceglie nelle impostazioni":"trascina per girare"}</span></div>
      <canvas id="st3d" class="st-3d" aria-label="Composizione della strategia in 3D"></canvas>
      <p class="st-3dn">${typeof vzNote==="function"?vzNote(tn):""}</p>${typeof vzChipsHtml==="function"?vzChipsHtml():""}<div class="st-tmrow" id="stTm">${typeof vzTmHtml==="function"?vzTmHtml():""}</div>
      <div class="st-leg">${ST_KEYS.filter(k=>(w[k]||0)>0||(now[k]||0)>0).map(k=>`<div><i style="background:${ST_COL[k]}"></i><span>${shortName(ASSETS[k].t)}</span><b class="num">${w[k]||0}%</b><small class="num">${tn>0?Math.round((now[k]||0)/tn*100)+"%":"—"}</small></div>`).join("")}</div></div>
    <div class="hud-panel st-riskp ${capQ?"acc-red":riskF>.6?"acc-amber":"acc-teal"}" style="--i:2;margin-top:10px"><div class="hud-ph"><span class="t">rischio</span></div>
      ${stGauge(riskF, stRisk(riskF), st?Math.round(st.mdd*100)+"%":"--", "calo peggiore")}
      <div class="hud-kv"><span class="hud-label">volatilità</span><span class="num">${st?Math.round(st.vol*100)+"%":"--"}</span></div>
      <div class="hud-kv"><span class="hud-label">12 mesi peggiori</span><span class="num c-red">${st?Math.round(st.worst12*100)+"%":"--"}</span></div>
      <div class="hud-kv"><span class="hud-label">recupero</span><span class="num">${st&&st.recov!=null?st.recov+" m":"--"}</span></div>
      ${capQ?`<span class="hud-pill" style="--c:var(--red);margin-top:6px">oltre il tuo test</span>`:""}</div>`;
  if(capQ) h+=`<p class="bnote warn" style="margin:8px 2px 0">Il test del rischio dice che con le tue risposte non dovresti andare oltre <b>${esc(PROFILES[cap].n)}</b>: chi sceglie più azioni di quelle che regge di solito vende nel momento peggiore. Puoi farlo lo stesso, ma sapendolo.</p>`;
  // 2. backtest
  if(typeof HIST!=="undefined" && HIST && st){
    const b=stBack(stFrac(w), M);
    h+=`<div class="hud-panel" style="--i:3;margin-top:10px"><div class="hud-ph"><span class="t">backtest // ${m0(M)} al mese</span><span class="tag">rendimenti veri</span></div>
      <div class="pfc-tabs st-from">${ST_FROM.map(([k,l])=>`<button data-st="from" data-v="${k}" class="${STG.from===k?"on":""}">${l}</button>`).join("")}</div>
      ${b.svg}
      <div class="st-kpi"><div><span class="hud-label">oggi varrebbe</span><b class="num c-cyan">${m0(b.fin)}</b></div><div><span class="hud-label">versati</span><b class="num">${m0(b.paid)}</b></div><div><span class="hud-label">guadagno</span><b class="num ${b.gain>=0?"c-teal":"c-red"}">${b.gain>=0?"+":"−"}${m0(Math.abs(b.gain))}</b></div></div>
      <p class="pn-note">Partendo ${b.from.endsWith("-01")&&STG.from==="2004"?"a gennaio 2004":"da "+esc(stMonth(b.from))}: il momento peggiore è stato ${esc(stMonth(b.wAt))}, con <b class="num">${m0(b.wVal)}</b> su ${m0(b.wPaid)} versati (${b.worst<1?`<b class="neg num">${Math.round((b.worst-1)*100)}%</b>`:"mai sotto quello versato"}). Rendimento medio ${stPct(st.cagr)} l'anno, calo peggiore ${Math.round(st.mdd*100)}% (${esc(stMonth(st.mddFrom))} → ${esc(stMonth(st.mddAt))}${st.recov!=null?`, recuperato in ${st.recov} mesi`:""}). In ${Math.round(st.pos12*100)} periodi di 12 mesi su 100 era in guadagno.</p></div>`;
  }
  // 3. previsione
  const f=stratFan(q, v0, M, inf, HZ, G);
  h+=`<div class="hud-panel acc-violet" style="--i:4;margin-top:10px"><div class="hud-ph"><span class="t">previsione // ${HZ} anni</span><div class="pfc-tabs" style="margin-left:auto">${[10,20,30].map(y=>`<button data-pn="hz" data-v="${y}" class="${HZ===y?"on":""}">${y}</button>`).join("")}</div></div>
    ${f.svg}
    <div class="st-kpi"><div><span class="hud-label">mediana</span><b class="num c-cyan">${m0(f.r.p50[HZ])}</b></div><div><span class="hud-label">1 caso su 10</span><b class="num c-red">${m0(f.r.p10[HZ])}</b></div><div><span class="hud-label">fermi sul conto</span><b class="num c-amber">${m0(f.cash)}</b></div></div>
    <p class="pn-note">In euro di oggi, con la tua inflazione: versando ${m0(M)} al mese per ${HZ} anni metti ${m0(f.paid)}. La linea tratteggiata è quanto varrebbero fermi sul conto.</p></div>`;
  // 4. confronto
  const rows=[1,2,3,4,5,6].filter(p=>p!==6||q===6||PL.cw).map(p=>{ const s=stStats(stFrac(stW(p))), r=pnRun(p,v0,M,inf); return { p, s, r }; });
  h+=`<div class="hud-panel acc-dim" style="--i:5;margin-top:10px"><div class="hud-ph"><span class="t">confronto</span><span class="tag">tocca per scegliere</span></div>
    <div class="st-cmp"><div class="st-ch"><span></span><span>anno</span><span>calo</span><span>${HZ} anni</span></div>
    ${rows.map(x=>`<button class="st-cr ${x.p===q?"on":""}" data-st="q" data-v="${x.p}" style="--pc:${PN_COL[x.p]}"><span><i></i>${x.p===6?"Su misura":esc(PROFILES[x.p].n)}</span><span class="num">${x.s?stPct(x.s.cagr):"--"}</span><span class="num c-red">${x.s?Math.round(x.s.mdd*100)+"%":"--"}</span><span class="num">${m0(x.r.p50[HZ])}</span></button>`).join("")}</div></div>`;
  // 5. regole
  const ess=typeof essentialMonthly==="function"?essentialMonthly():0, em=EMERG_MONTHS[(PL.ans||{}).lavoro]||4, target=ess*em, fund=+PL.fund||0, fp=target>0?Math.min(1,fund/target):0;
  const rc=(replay&&replay.enabled)?replayCost().total:0, hz={1:"meno di 3",2:"3–5",3:"5–7",4:"7–10",5:"oltre 10"}[q===6?(ps.az<35?1:ps.az<60?2:ps.az<78?3:ps.az<93?4:5):q];
  const R=(n,t,d)=>`<div class="st-rule"><b>${n}</b><div><span>${t}</span><small>${d}</small></div></div>`;
  h+=`<div class="hud-panel acc-amber" style="--i:6;margin-top:10px"><div class="hud-ph"><span class="t">regole della strategia</span><span class="tag">ogni mese</span></div>
    ${R("01","Fondo emergenza",`${em} mesi di spese = ${m0(target)}. Oggi ${m0(fund)} (${Math.round(fp*100)}%). ${fundShare(q,STG.cw)>0?`Finché non è pieno ci va il ${Math.round(fundShare(q,STG.cw)*100)}% del risparmio del mese, il resto in ETF.`:`Con questa strategia tutto il risparmio va in ETF: il fondo lo riempi tu se vuoi.`}`)}
    <div class="hud-seg" data-n="14" style="--c:var(--teal);margin:0 0 8px 34px">${Array.from({length:14},(_,i)=>`<i class="${i<Math.round(fp*14)?"on":""}"></i>`).join("")}</div>
    ${R("02","Versamento",`${m0(M)} al mese dal Budget${rc>0?`, di cui ${m0(rc)} con il Replay automatico`:""}. Il resto lo compri a mano dal serbatoio del Portafoglio.`)}
    ${R("03","Acquisti",`Quote intere sulle voci più sotto il peso obiettivo: così il portafoglio torna in equilibrio senza vendere e senza tasse.`)}
    ${R("04","Ribilanciamento",`Vendi solo se una voce si stacca di oltre 10 punti e i versamenti non la sistemano entro 12 mesi (sulle plusvalenze paghi il 26%).`)}
    ${R("05","Costi",`TER medio ${nf2.format(ter)}% l'anno: ${money(ter*100)} ogni 10.000 € investiti.`)}
    ${R("06","Orizzonte",`Questa strategia ha senso se non ti servono i soldi per almeno ${hz} anni.`)}</div>`;
  // 6. azioni
  const isMine=q===mine && (q!==6 || JSON.stringify(PL.cw||{})===JSON.stringify(STG.cw));
  h+=`<div class="st-act">${isMine?`<span class="hud-pill" style="--c:var(--teal)">✓ è la tua strategia</span>`:`<button class="hud-btn st-apply" data-st="apply" style="--c:var(--amber)">applica ${q===6?"su misura":esc(PROFILES[q].n.toLowerCase())}</button>`}
    <button class="hud-btn" data-pn="replay" data-v="${q}">adatta il replay a ${m0(M)}</button>
    <button class="add pn-test" data-p="redo">${(typeof riskScore==="function"&&riskScore(PL.ans))?"Rifai il test del rischio →":"Non sai quale? Fai il test del rischio (2 minuti) →"}</button></div>`;
  return h;
}
function stPct(x){ return (x>=0?"+":"−")+nf2.format(Math.abs(x*100))+"%"; }

/* Piano: traguardo, poi lo strumento della strategia (al posto dei 5 piani a carosello, del grafico e della scelta) */
function pnRestHtml(R,M){
  const IN=pnInfl(), inf=IN.r, v0=totals().val+((+PL.pot)||0);
  const HZ=PL.hz||20;
  let h=stHtml(M, null, HZ, v0, inf);
  if(typeof rvHtml==="function") h+=rvHtml();
  h+=`<p class="pn-disc">Backtest con i rendimenti mensili veri dal 2004 (MSCI World, MSCI EM, obbligazioni globali coperte, tasso BCE). Previsioni ricampionando quegli anni con rendimenti futuri prudenti e la tua inflazione. Non sono previsioni certe né consulenza: la scelta è tua.</p>`;
  return h;
}
function stRefresh(){ const el=document.getElementById("stLive"); if(!el) return; const R=pnReal(), M=pnM(R), IN=pnInfl();
  el.innerHTML=stLiveHtml(M, null, PL.hz||20, totals().val+((+PL.pot)||0), IN.r); }
let stRaf=0;
document.addEventListener("input",e=>{ const r=e.target.closest("[data-stw]"); if(!r) return;
  // un peso cambia: la differenza la prendono (o la ricevono) prima i pesi che non hai ancora toccato, così quelli già sistemati restano
  const k=r.dataset.stw, v=Math.round(+r.value/5)*5; STG.touch=(STG.touch||[]).filter(x=>x!==k); STG.touch.push(k);
  STG.cw[k]=v; let diff=100-ST_KEYS.reduce((a,x)=>a+(STG.cw[x]||0),0);
  const free=ST_KEYS.filter(x=>x!==k && !STG.touch.includes(x)), old=STG.touch.filter(x=>x!==k);
  for(const grp of [free, old]){ if(!diff) break;
    for(let g=0; g<40 && diff; g++){ const can=grp.filter(x=>diff>0 || (STG.cw[x]||0)>0); if(!can.length) break;
      const x=can[g%can.length], step=diff>0?5:-5; if(diff<0 && (STG.cw[x]||0)<5) continue; STG.cw[x]=(STG.cw[x]||0)+step; diff-=step; } }
  if(diff){ STG.cw[k]+=diff; r.value=STG.cw[k]; }
  ST_KEYS.forEach(x=>{ const el=document.querySelector(`[data-stw="${x}"]`); if(el && x!==k) el.value=STG.cw[x]; const b=document.getElementById("stv_"+x); if(b) b.textContent=STG.cw[x]+"%"; });
  stSetCustom(STG.cw);
  if(!stRaf) stRaf=requestAnimationFrame(()=>{ stRaf=0; stRefresh(); });
});
document.addEventListener("click",e=>{ const b=e.target.closest("[data-st]"); if(!b) return; const a=b.dataset.st, y=window.scrollY;
  if(a==="q"){ STG.q=+b.dataset.v; if(STG.q<6) PL.pick=STG.q; else stSetCustom(STG.cw); renderPiano(); window.scrollTo(0,y); return; }
  if(a==="from"){ STG.from=b.dataset.v; stRefresh(); return; }
  if(a==="apply"){ const q=STG.q, n=q===6?"Su misura":PROFILES[q].n;
    if(q===6){ const s=ST_KEYS.reduce((t,k)=>t+(STG.cw[k]||0),0); if(s!==100){ toast("I pesi devono fare 100%"); return; } if(!((STG.cw.SWDA||0)+(STG.cw.EIMI||0)+(STG.cw.AGGH||0)>0)){ toast("Metti almeno un ETF"); return; } PL.cw=Object.assign({}, STG.cw); stSetCustom(PL.cw); }
    PL.prof=q; PL.provisional=false; PL.pick=q<6?q:PL.pick; plSave();
    if(typeof INV!=="undefined") INV=null;
    renderPiano(); window.scrollTo(0,y); if(typeof mountPot==="function") mountPot(); if(typeof renderBudget==="function") renderBudget();
    toast(`Strategia ${n}: il serbatoio e gli acquisti seguono questi pesi`); }
});

/* ---------- composizione in 3D: anello a fette estruse che gira ----------
   Larghezza della fetta = peso nella strategia, altezza = quanto oscilla quel fondo (volatilità storica),
   anello interno basso = quello che hai oggi. Disegno su canvas (niente librerie): facce ordinate dal fondo al davanti. */
const ST_VOL={ SWDA:.15, EIMI:.19, AGGH:.05, XEON:.01 };
const ST3={ rot:-0.6, cur:null, tgt:null, now:null, az:0, raf:0, last:0, drag:null };
function st3dKick(){ if(!ST3.raf){ ST3.last=0; ST3.raf=requestAnimationFrame(st3dFrame); } }
function st3dShade(hex,f){ const n=parseInt(hex.slice(1),16), c=[n>>16,(n>>8)&255,n&255].map(v=>Math.max(0,Math.min(255,Math.round(v*f)))); return `rgb(${c[0]},${c[1]},${c[2]})`; }
function st3dFrame(t){
  ST3.raf=0; const c=document.getElementById("st3d"); if(!c || !ST3.tgt || document.hidden) return;
  const dt=ST3.last?Math.min(0.05,(t-ST3.last)/1000):0; ST3.last=t;
  const still=!!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  if(!ST3.drag && !still) ST3.rot+=dt*0.35;
  // i pesi scivolano verso quelli nuovi quando cambi strategia
  if(!ST3.cur) ST3.cur=Object.fromEntries(ST_KEYS.map(k=>[k,0]));
  let moving=false; ST_KEYS.forEach(k=>{ const g=ST3.tgt[k]||0, d=g-ST3.cur[k]; if(Math.abs(d)>0.05){ ST3.cur[k]+=d*(dt?Math.min(1,dt*7):0.15); moving=true; } else ST3.cur[k]=g; });
  const dpr=window.devicePixelRatio||1, W=c.clientWidth||300, H=Math.round(Math.min(260, W*0.68));
  if(c.width!==Math.round(W*dpr) || c.height!==Math.round(H*dpr)){ c.width=Math.round(W*dpr); c.height=Math.round(H*dpr); c.style.height=H+"px"; }
  const x=c.getContext("2d"); x.setTransform(dpr,0,0,dpr,0,0); x.clearRect(0,0,W,H);
  const R=Math.min(W*0.40, H*0.95), tilt=0.42, cx=W/2, cy=H*0.60, r1=R*0.58, r2=R, q1=R*0.30, q2=R*0.50, hMax=H*0.30;
  const P=(r,a,z,ox,oy)=>[cx+ox+r*Math.cos(a+ST3.rot), cy+oy+r*Math.sin(a+ST3.rot)*tilt-z];
  // bagliore sotto
  const g=x.createRadialGradient(cx,cy+6,R*0.2,cx,cy+6,R*1.1); g.addColorStop(0,"rgba(0,229,255,.18)"); g.addColorStop(1,"rgba(0,229,255,0)");
  x.fillStyle=g; x.beginPath(); x.ellipse(cx,cy+6,R*1.1,R*1.1*tilt,0,0,Math.PI*2); x.fill();
  const F=[];   // facce: { d (profondità), pts, col }
  const ring=(wts, ra, rb, hOf, explode, z0)=>{ z0=z0||0; const Q=(r,a,z,ox,oy)=>P(r,a,z+z0,ox,oy); const tot=ST_KEYS.reduce((a,k)=>a+(wts[k]||0),0); if(tot<0.5) return [];
    let a=-Math.PI/2; const L=[];
    ST_KEYS.forEach(k=>{ const v=(wts[k]||0)/tot; if(v<0.004) return; const a0=a, a1=a+v*Math.PI*2; a=a1;
      const mid=(a0+a1)/2, ox=explode*Math.cos(mid+ST3.rot), oy=explode*Math.sin(mid+ST3.rot)*tilt, h=hOf(k), col=ST_COL[k];
      const n=Math.max(2,Math.ceil((a1-a0)/(Math.PI/45))), st=(a1-a0)/n;
      for(let i=0;i<n;i++){ const b0=a0+i*st, b1=b0+st+0.004, m=(b0+b1)/2, sm=Math.sin(m+ST3.rot), cm=Math.cos(m+ST3.rot);
        if(sm>0) F.push({ d:sm*rb, pts:[Q(rb,b0,0,ox,oy),Q(rb,b1,0,ox,oy),Q(rb,b1,h,ox,oy),Q(rb,b0,h,ox,oy)], col:st3dShade(col,0.55+0.3*sm-0.15*cm) });
        else F.push({ d:sm*ra, pts:[Q(ra,b0,0,ox,oy),Q(ra,b1,0,ox,oy),Q(ra,b1,h,ox,oy),Q(ra,b0,h,ox,oy)], col:st3dShade(col,0.4) });
        F.push({ d:sm*(ra+rb)/2+0.01, pts:[Q(ra,b0,h,ox,oy),Q(rb,b0,h,ox,oy),Q(rb,b1,h,ox,oy),Q(ra,b1,h,ox,oy)], col:st3dShade(col,1.08), top:true }); }
      [a0,a1].forEach(e=>{ F.push({ d:Math.sin(e+ST3.rot)*(ra+rb)/2+0.005, pts:[Q(ra,e,0,ox,oy),Q(rb,e,0,ox,oy),Q(rb,e,h,ox,oy),Q(ra,e,h,ox,oy)], col:st3dShade(col,0.7) }); });
      L.push({ k, v, mid, h, ox, oy, r:(ra+rb)/2 }); });
    return L; };
  const hOf=k=>10+hMax*(ST_VOL[k]||.1)/0.19, hTop=Math.max(10,...ST_KEYS.filter(k=>(ST3.cur[k]||0)>0.5).map(hOf));
  const lab=ring(ST3.cur, r1, r2, hOf, 5);
  F.sort((a,b)=>a.d-b.d);
  F.forEach(f=>{ x.beginPath(); f.pts.forEach((p,i)=>i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1])); x.closePath(); x.fillStyle=f.col; x.fill(); x.strokeStyle=f.top?"rgba(255,255,255,.08)":f.col; x.lineWidth=f.top?0.5:0.8; x.stroke(); });
  // etichette sopra le fette (prima quelle dietro)
  x.font="600 11px ui-monospace, Consolas, monospace"; x.textAlign="center";
  // etichette fuori dall'anello, spostate in su se si toccano
  const placed=[];
  lab.slice().sort((a,b)=>Math.sin(b.mid+ST3.rot)-Math.sin(a.mid+ST3.rot)).forEach(l=>{ if(l.v<0.02) return; const p=P(r2*1.08,l.mid,l.h+6,l.ox,l.oy);
    const t=`${shortName(ASSETS[l.k].t)} ${Math.round(l.v*100)}%`, w=x.measureText(t).width+10;
    let X=Math.max(w/2+2, Math.min(W-w/2-2, p[0])), Y=Math.max(14, p[1]);
    for(let g=0; g<8 && placed.some(r=>Math.abs(r.x-X)<(r.w+w)/2 && Math.abs(r.y-Y)<17); g++) Y-=17;
    placed.push({ x:X, y:Y, w });
    x.fillStyle="rgba(4,7,11,.78)"; x.fillRect(X-w/2,Y-12,w,16); x.fillStyle=ST_COL[l.k]; x.fillText(t,X,Y); });
  // al centro: quanto è in azioni
  x.fillStyle="#D3E9F0"; x.font="700 15px ui-monospace, Consolas, monospace"; x.fillText(Math.round(ST3.az)+"%", cx, cy-hTop*0.6);
  x.fillStyle="#5E7884"; x.font="600 9px ui-monospace, Consolas, monospace"; x.fillText("AZIONI", cx, cy-hTop*0.6+12);
  if(!still || moving || ST3.drag) ST3.raf=requestAnimationFrame(st3dFrame);
}
document.addEventListener("pointerdown",e=>{ if(e.target.id!=="st3d") return; ST3.drag={ x:e.clientX, r:ST3.rot }; try{ e.target.setPointerCapture(e.pointerId); }catch(x){} st3dKick(); });
document.addEventListener("pointermove",e=>{ if(ST3.drag) ST3.rot=ST3.drag.r+(e.clientX-ST3.drag.x)*0.012; });
document.addEventListener("pointerup",()=>{ ST3.drag=null; });
document.addEventListener("pointercancel",()=>{ ST3.drag=null; });
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) st3dKick(); });

/* tutto collegato in tempo reale: quando cambia il Budget (spese, prestiti, stipendio, modalità) si ridisegnano
   anche il serbatoio del Portafoglio e, se è aperto, il Piano */
if(typeof renderBudget==="function"){ const _rb=renderBudget; renderBudget=function(){ const r=_rb.apply(this, arguments);
  try{ if(typeof mountPot==="function") mountPot();
    const pg=document.getElementById("page-piano"); if(pg && pg.classList.contains("active") && typeof renderPiano==="function"){ const y=window.scrollY; renderPiano(); window.scrollTo(0,y); } }catch(e){}
  return r; }; }
