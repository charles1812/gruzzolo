/* ---------- Piano, rifatto da zero ----------
   Una domanda sola: «quale piano di investimento fa per me, con i miei soldi veri?».
   1) Quanto puoi investire al mese: parte dal risparmio reale dei mesi chiusi (Budget), mai sotto il Replay.
   2) Il cursore cambia il mese e tutto sotto si ricalcola mentre lo muovi (le scelte di vita stanno nelle Sfide).
   3) Il traguardo: casa, auto, 100.000 €, libertà (25 anni di spese).
   4) Piani a confronto, da Prudente ad Aggressivo, ricalcolati con questi numeri e con la tua inflazione
      personale (prezzi veri di cibo, benzina e generale dai Dati): quanto avrai, quando arrivi al traguardo,
      il calo peggiore da reggere, come sarebbe andata se l'avessi iniziato 10 anni fa.
   5) Scegli il piano: diventa il tuo profilo e ti propongo il Replay giusto. */
const PN_COL = { 1:"#8FA0E0", 2:"#5BB6A9", 3:"#E0B15E", 4:"#E8956A", 5:"#D98BA6" };
const PN_EMO = { 1:"🛡️", 2:"🌿", 3:"⚖️", 4:"🚀", 5:"🔥" };
const PN_TAG = { 1:"poche sorprese", 2:"tranquillo", 3:"equilibrato", 4:"più crescita", 5:"massima crescita" };

/* risparmio reale: media dei mesi chiusi e tracciati del Budget; altrimenti l'obiettivo del Budget */
function pnReal(){
  const rc=(replay&&replay.enabled)?replayCost().total:0;
  let real=null, n=0;
  try{ const H=(typeof monthHistory==="function")?monthHistory():[]; const C=H.filter(x=>!x.cur && !x.sparse && !x.partial);
    if(C.length){ n=C.length; real=C.reduce((a,x)=>a+x.saved,0)/n; } }catch(e){}
  let goal=0; try{ goal=steadyMonthly(planCompute()); }catch(e){}
  const base=Math.max(rc, Math.round(real!=null?real:goal));
  return { rc:Math.round(rc), real:real!=null?Math.round(real):null, n, goal:Math.round(goal), base };
}
/* inflazione personale: media annua degli ultimi 10 anni dei prezzi veri (Eurostat), pesata su come spendi tu.
   Per 10-30 anni non uso l'ultimo anno (la benzina può fare +20% in un anno e −15% l'anno dopo). */
function pnInfl(){
  const H=(typeof DT!=="undefined" && DT.es && DT.es.hicp)||null;
  const ann=k=>{ const s=H&&H[k]; if(!s||typeof dtBase!=="function") return null; const b=dtBase(s,10); return b? Math.pow(b,1/10)-1 : null; };
  const yr=k=>{ const s=H&&H[k]; return s&&typeof dtChg==="function"?dtChg(s,1):null; };
  const tot=ann("TOTAL"); if(tot==null) return { r:INFL, src:"stima", parts:[] };
  let food=0, fuel=0, all=0;
  if(typeof B!=="undefined" && B.cats){ B.cats.forEach(x=>{ if(x.g==="extra") return; const v=x.plan||0; all+=v; if(["spesa","fuori","pasto"].includes(x.id)) food+=v; else if(x.id==="benzina") fuel+=v; }); }
  const fy=ann("CP011"), py=ann("CP07222");
  let r = all>0 ? (food*(fy??tot)+fuel*(py??tot)+(all-food-fuel)*tot)/all : tot;
  r=Math.max(0.01, Math.min(0.045, r));
  return { r, src:"dati", parts:[["Cibo",fy],["Benzina",py],["Tutto",tot]].filter(x=>x[1]!=null), last:yr("TOTAL") };
}
const PN_GOALS=()=>{ const ess=(typeof essentialMonthly==="function")?essentialMonthly():1000;
  return [{ id:"casa", e:"🏠", t:"Anticipo casa", v:30000 },{ id:"auto", e:"🚗", t:"Auto nuova", v:15000 },{ id:"cento", e:"💯", t:"100.000 €", v:100000 },{ id:"liberi", e:"🌴", t:"Libertà", v:Math.round(ess*12*25/1000)*1000, d:"25 anni delle tue spese: vivi di rendita" }]; };

/* proiezione di un piano: mediana e 1 caso su 10 (scenari ricampionati dalla storia vera), in euro di oggi con la tua inflazione */
function pnRun(q, v0, m, inf){
  if(typeof HIST==="undefined" || !HIST){ const ps=profStats(q), r=(1+ps.fwd)/(1+inf)-1, mid=[], lo=[], hi=[];
    for(let y=0;y<=30;y++){ mid.push(fv(m,v0,y,r)); lo.push(fv(m,v0,y,r-0.02)); hi.push(fv(m,v0,y,r+0.02)); } return { p50:mid, p10:lo, p90:hi }; }
  const r=mcRun(q, v0, Math.round(m), 30, 300), k=y=>Math.pow((1+INFL)/(1+inf), y);    // mcRun toglie il 2%: correggo con la tua inflazione
  return { p50:r.p50.map((v,y)=>v*k(y)), p10:r.p10.map((v,y)=>v*k(y)), p90:r.p90.map((v,y)=>v*k(y)) };
}
function pnYears(arr, G){ for(let y=0;y<arr.length;y++) if(arr[y]>=G) return y; return null; }

function renderPiano(){
  const el=$("#planBody"); if(!el) return;
  if(typeof rqDraft!=="undefined" && rqDraft){ el.innerHTML=renderRiskQuiz(); return; }
  if(!PL.prof){ PL.prof=3; PL.provisional=true; plSave(); }
  if(typeof DT!=="undefined" && !DT.es && !DT.busy && typeof dtLoad==="function" && !PL._dtTry){ PL._dtTry=1; dtLoad(false).then(()=>{ if(document.getElementById("page-piano").classList.contains("active")) renderPiano(); }); }
  const R=pnReal(), M=pnM(R), lo=Math.floor(R.rc/10)*10, hi=Math.ceil(Math.max(R.base*2, R.rc+600)/50)*50;
  const IN=pnInfl(), inf=IN.r, v0=totals().val+((+PL.pot)||0);
  let h=`<section><div class="card fz pn-hero">
    <div class="fz-top"><div class="fz-val"><small>Puoi investire ogni mese</small><b class="num" id="pnM">${m0(M)}</b>
      <span>${R.real!=null?`risparmi davvero <b class="num">${m0(R.real)}</b> al mese (media di ${R.n} ${R.n===1?"mese":"mesi"})`:`il tuo Budget prevede <b class="num">${m0(R.goal)}</b> al mese`}</span></div></div>
    <div class="pn-sl"><button class="pn-st" data-pn="step" data-v="-10" aria-label="10 € in meno">−</button><input type="range" class="pn-range" id="pnRange" min="${lo}" max="${hi}" step="10" value="${M}" aria-label="Quanto investire al mese"><button class="pn-st" data-pn="step" data-v="10" aria-label="10 € in più">+</button></div>
    <div class="pn-ticks">${R.rc?`<span>Replay ${m0(R.rc)}</span>`:"<span>0 €</span>"}<span>il tuo ritmo ${m0(R.base)}</span><span>${m0(hi)}</span></div>
    <div class="fz-ds pn-ds"><span class="fz-d">hai già <b class="num">${m0(v0)}</b></span><span class="fz-d">la tua inflazione <b class="num">${nf2.format(inf*100)}%</b></span>${PL.nm!=null?`<button class="fz-d pn-reset" data-pn="reset">↺ il mio ritmo</button>`:""}</div>
    ${IN.parts.length?`<p class="pn-note">Inflazione media degli ultimi 10 anni pesata su come spendi (all'anno: ${IN.parts.map(p=>`${p[0].toLowerCase()} ${p[1]>=0?"+":"−"}${nf2.format(Math.abs(p[1]*100))}%`).join(" · ")}). Tutti i numeri qui sono in euro di oggi.</p>`:""}
  </div></section>`;

  el.innerHTML=h+`<div id="pnRest">${pnRestHtml(R,M)}</div>`;
  if(typeof loadPlanPrices==="function") loadPlanPrices(false);
}
function pnM(R){ R=R||pnReal(); return Math.max(R.rc, Math.round(PL.nm!=null?PL.nm:R.base)); }
/* tutto quello che dipende dal mese: si ridisegna mentre muovi il cursore */
function pnRestHtml(R,M){
  const IN=pnInfl(), inf=IN.r, v0=totals().val+((+PL.pot)||0);
  const goals=PN_GOALS(), G=goals.find(g=>g.id===(PL.goalId||"cento"))||goals[2];
  const HZ=PL.hz||20, mine=PL.provisional?null:PL.prof;
  const plans=[1,2,3,4,5].map(q=>{ const r=pnRun(q,v0,M,inf), ps=profStats(q), s=HS(q);
    const ter=Object.keys(PROFILES[q].w).reduce((a,k)=>a+PROFILES[q].w[k]/100*ASSETS[k].ter,0);
    let past=null; try{ if(typeof HIST!=="undefined" && HIST){ past=pastRun(q, M, HIST.months[Math.max(0,HIST.months.length-120)]); } }catch(e){}
    return { q, r, ps, s, ter, past, yG:pnYears(r.p50,G.v), yG9:pnYears(r.p10,G.v) }; });
  const yBal=plans[2].yG ?? 40, byTime = yBal<=3?1 : yBal<=6?2 : yBal<=10?3 : 4, rec=Math.min(byTime, PL.provisional?5:PL.prof);
  const cash=[]; for(let y=0;y<=30;y++) cash.push((v0+M*12*y)/Math.pow(1+inf,y));
  const paid=y=>v0+M*12*y, sel=PL.pick||rec;
  let h="";
  h+=`<section><div class="sc-t sc-tt">🏁 Il tuo traguardo</div><div class="pn-goals">${goals.map(g=>`<button class="pn-g ${g.id===G.id?"on":""}" data-pn="goal" data-v="${g.id}"><span>${g.e}</span><b>${esc(g.t)}</b><small class="num">${m0(g.v)}</small></button>`).join("")}</div></section>`;

  // piani a confronto
  h+=`<section><div class="sc-t sc-tt">📊 I piani per te <small class="pn-sub">${m0(M)} al mese · traguardo ${esc(G.t.toLowerCase())}</small></div><div class="sc-car pn-car">${plans.map(P=>{ const q=P.q, col=PN_COL[q];
      const yrs=P.yG==null?"oltre 30 anni":P.yG===0?"già raggiunto":`in ${P.yG} ${P.yG===1?"anno":"anni"}`;
      return `<div class="pn-card ${q===sel?"on":""}" style="--pc:${col}" data-pn="pick" data-v="${q}">
        <div class="pn-ch"><span class="pn-e">${PN_EMO[q]}</span><div><b>${esc(PROFILES[q].n)}</b><small>${PN_TAG[q]}</small></div>${q===rec?`<span class="pn-badge">consigliato</span>`:q===mine?`<span class="pn-badge me">il tuo</span>`:""}</div>
        <div class="pn-mix"><i style="width:${P.ps.az}%;background:${col}"></i><i style="width:${P.ps.ob}%;background:${col}88"></i><i style="width:${P.ps.liq}%;background:${col}44"></i></div>
        <div class="pn-mixl">${P.ps.az}% azioni${P.ps.ob?` · ${P.ps.ob}% obbligazioni`:""}${P.ps.liq?` · ${P.ps.liq}% liquidità`:""}</div>
        <div class="pn-big"><small>tra ${HZ} anni</small><b class="num">${m0(P.r.p50[HZ])}</b><span class="num">1 caso su 10 sotto ${m0(P.r.p10[HZ])}</span></div>
        <div class="pn-k"><div><small>traguardo</small><b>${yrs}</b></div><div><small>calo peggiore</small><b class="neg num">${Math.round(P.s.mdd*100)}%</b></div><div><small>costi</small><b class="num">${nf2.format(P.ter)}%</b></div></div>
        ${P.past?`<div class="pn-past">Se l'avessi iniziato 10 anni fa: <b class="num">${m0(P.past.fin)}</b> su ${m0(P.past.paid)} versati</div>`:""}
      </div>`; }).join("")}</div></section>`;

  // grafico di confronto
  const W=340, H=190, Lp=6, Rp=W-52, T=12, Bt=H-22, X=y=>Lp+y/HZ*(Rp-Lp), max=Math.max(...plans.map(P=>P.r.p50[HZ]), paid(HZ))*1.05, Y=v=>Bt-(Bt-T)*Math.min(v,max)/max;
  const line=arr=>arr.slice(0,HZ+1).map((v,y)=>`${X(y).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const labs=plans.map(P=>({ q:P.q, y:Y(P.r.p50[HZ]), v:P.r.p50[HZ] })).sort((a,b)=>a.y-b.y); for(let i=1;i<labs.length;i++) if(labs[i].y-labs[i-1].y<13) labs[i].y=labs[i-1].y+13;
  h+=`<section><div class="card pn-chart"><div class="pn-chh"><b>Come crescono</b><div class="pfc-tabs">${[10,20,30].map(y=>`<button data-pn="hz" data-v="${y}" class="${HZ===y?"on":""}">${y} anni</button>`).join("")}</div></div>
    <svg viewBox="0 0 ${W} ${H}" class="pn-svg" role="img" aria-label="Crescita dei piani">
      ${[0.25,0.5,0.75].map(f=>`<line x1="${Lp}" x2="${Rp}" y1="${Y(max*f).toFixed(1)}" y2="${Y(max*f).toFixed(1)}" class="pn-grid"/>`).join("")}
      <polyline points="${line(cash)}" class="pn-cash"/>
      ${plans.map(P=>`<polyline points="${line(P.r.p50)}" fill="none" stroke="${PN_COL[P.q]}" stroke-width="${P.q===sel?3:1.6}" opacity="${P.q===sel?1:.55}"/>`).join("")}
      ${labs.map(l=>`<text x="${Rp+4}" y="${(l.y+3).toFixed(1)}" fill="${PN_COL[l.q]}" class="pn-lab">${l.v>=1e6?nf2.format(l.v/1e6)+" mln":Math.round(l.v/1000)+"k"}</text>`).join("")}
      <text x="${Lp}" y="${H-6}" class="pn-ax">oggi</text><text x="${Rp}" y="${H-6}" class="pn-ax" text-anchor="end">${new Date().getFullYear()+HZ}</text>
    </svg>
    <div class="pn-leg"><span><i style="background:${PN_COL[sel]}"></i>${esc(PROFILES[sel].n)}</span><span><i class="pn-li-cash"></i>fermi sul conto: ${m0(cash[HZ])}</span></div>
    <p class="pn-note">Fermi sul conto, i tuoi ${m0(paid(HZ))} varrebbero ${m0(cash[HZ])} di oggi: l'inflazione si mangia <b class="neg num">${m0(paid(HZ)-cash[HZ])}</b>.</p></div></section>`;

  // scelta
  const P=plans[sel-1], isMine=sel===mine;
  h+=`<section><div class="card pn-pick" style="--pc:${PN_COL[sel]}"><div class="pn-ch"><span class="pn-e">${PN_EMO[sel]}</span><div><b>${esc(PROFILES[sel].n)}: ${m0(M)} al mese</b><small>${P.yG!=null?`${esc(G.t)} ${P.yG===0?"già raggiunto":`in circa ${P.yG} anni`}${P.yG9!=null&&P.yG9!==P.yG?` (al massimo ${P.yG9} anche se va male)`:""}`:`${esc(G.t)} oltre 30 anni: alza il mese (o vinci qualche Sfida)`}</small></div></div>
    ${isMine?`<div class="bdone">✅ È il tuo piano</div>`:`<button class="btn gold" data-pn="choose" data-v="${sel}">Scelgo il piano ${esc(PROFILES[sel].n)}</button>`}
    <button class="btn ghost" data-pn="replay" data-v="${sel}" style="margin-top:8px">🔁 Adatta il Replay a ${m0(M)} al mese</button>
    <button class="add pn-test" data-p="redo">Non sai quale? Fai il test del rischio (2 minuti) →</button></div></section>`;
  h+=`<p class="pn-disc">Scenari calcolati ricampionando i rendimenti veri dal 2004 a oggi, con rendimenti futuri prudenti e la tua inflazione. Non sono previsioni né consulenza: la scelta è tua.</p>`;
  return h;
}

/* Replay adatto al piano: quote intere verso i pesi del profilo con il mese scelto */
function pnReplayFor(q, M){
  const items=[]; let left=M; const w=PROFILES[q].w;
  Object.keys(w).filter(k=>ASSETS[k].k!=="liq").sort((a,b)=>w[b]-w[a]).forEach(k=>{ const px=pxOf(ASSETS[k].t); if(!px) return; const n=Math.floor(M*w[k]/100/px); if(n>0 && n*px<=left){ items.push({ ticker:ASSETS[k].t, name:ASSETS[k].n, quote:n }); left-=n*px; } });
  return { items, cost:M-left };
}
/* cursore: il numero e i piani sotto cambiano mentre lo muovi (il cursore non viene ridisegnato, così il dito non lo perde) */
let pnRaf=0;
function pnSetM(v, save){ const R=pnReal(); PL.nm=Math.max(R.rc, Math.round(v)); const b=document.getElementById("pnM"); if(b) b.textContent=m0(pnM(R));
  if(!pnRaf) pnRaf=requestAnimationFrame(()=>{ pnRaf=0; const el=document.getElementById("pnRest"); if(el) el.innerHTML=pnRestHtml(R,pnM(R)); });
  if(save) plSave(); }
document.addEventListener("input",e=>{ if(e.target.id==="pnRange") pnSetM(+e.target.value, false); });
document.addEventListener("change",e=>{ if(e.target.id!=="pnRange") return; pnSetM(+e.target.value, true); const y=window.scrollY; renderPiano(); window.scrollTo(0,y); });
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-pn]"); if(!b) return; const a=b.dataset.pn, v=b.dataset.v, y=window.scrollY;
  if(a==="step"){ const r=document.getElementById("pnRange"), nv=Math.min(+r.max, Math.max(+r.min, pnM()+(+v))); r.value=nv; pnSetM(nv, true); }
  else if(a==="goal") PL.goalId=v;
  else if(a==="hz") PL.hz=+v;
  else if(a==="pick") PL.pick=+v;
  else if(a==="reset"){ PL.nm=null; }
  else if(a==="choose"){ PL.prof=+v; PL.provisional=false; PL.pick=+v; plSave(); renderPiano(); window.scrollTo(0,y); toast(`Piano ${PROFILES[+v].n} scelto: adesso adatta il Replay`); if(typeof renderBudget==="function") renderBudget(); return; }
  else if(a==="replay"){ const q=+v, M=pnM();
    const r=pnReplayFor(q,M); if(!r.items.length){ toast("Prezzi non ancora caricati: riprova tra poco"); return; }
    if(!confirm(`Replay nuovo per il piano ${PROFILES[q].n}:\n${r.items.map(i=>`${i.quote} × ${shortName(i.ticker)}`).join(" + ")} ≈ ${money(r.cost)} al mese.\n\nLo imposto qui (ricordati di cambiarlo anche su Fineco)?`)) return;
    replay.items=r.items; replay.enabled=true; store.set("replay",replay); if(typeof render==="function") render(); if(typeof syncNativeReminders==="function") try{ syncNativeReminders(); }catch(_){}
    toast("Replay aggiornato: "+r.items.map(i=>`${i.quote} ${shortName(i.ticker)}`).join(" + ")); return; }
  if(a==="step") return;
  plSave(); renderPiano(); window.scrollTo(0,y);
});
