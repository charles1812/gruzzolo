"use strict";
/* =====================================================================
   Gruzzolo — Piano d'investimento (senza AI)
   Profilo di rischio → portafoglio modello di ETF UCITS → ogni mese:
   quanto al fondo emergenza, quanto investire, quante quote di cosa comprare
   (ribilanciando con i versamenti), sui prezzi live.
   Numeri di rischio e previsioni dai dati storici veri 2004–oggi (storico.json,
   generato da tools/storico.py e verificato con tools/backtest.py).
   Regole trasparenti e fisse: non è consulenza personalizzata.
   Usa i globali di index.html e budget.js.
   ===================================================================== */

let PL = Object.assign({ prof:null, ans:{}, fund:null, fee:0, hist:[], px:{} }, store.get("piano",{}));
function plSave(){ store.set("piano",PL); }
delete PL._boost; delete PL.slider;      // anteprime: non restano salvate

const ASSETS = {
  SWDA:{ t:"SWDA.MI", n:"iShares Core MSCI World", k:"az", d:"Azioni dei paesi sviluppati, circa 1.400 aziende: il cuore del portafoglio.", ter:0.20 },
  EIMI:{ t:"EIMI.MI", n:"iShares Core MSCI EM IMI", k:"az", d:"Azioni dei paesi emergenti (Cina, India, Taiwan…): più crescita, più scossoni.", ter:0.18 },
  AGGH:{ t:"AGGH.MI", n:"iShares Core Global Aggregate Bond EUR Hedged", k:"ob", d:"Obbligazioni di tutto il mondo, coperte dal cambio: ammortizzano i cali delle azioni.", ter:0.10 },
  XEON:{ t:"XEON.MI", n:"Xtrackers EUR Overnight Rate Swap", k:"liq", d:"Liquidità che rende circa il tasso BCE, quasi senza oscillazioni.", ter:0.10 },
};
const PROFILES = [ null,
  { n:"Prudente",   w:{ SWDA:22, EIMI:3,  AGGH:50, XEON:25 } },
  { n:"Moderato",   w:{ SWDA:44, EIMI:6,  AGGH:40, XEON:10 } },
  { n:"Bilanciato", w:{ SWDA:62, EIMI:8,  AGGH:25, XEON:5 } },
  { n:"Dinamico",   w:{ SWDA:75, EIMI:10, AGGH:15 } },
  { n:"Aggressivo", w:{ SWDA:88, EIMI:12 } },
];
/* numeri del backtest 2004-01 → 2026-09 (tools/backtest.py), usati finché storico.json non è caricato */
const HS_FALLBACK = { 1:{ cagr:.036, vol:.041, mdd:-.110, worst12:-.102, best12:.138, r10:1.22, w3:.93, w5:.98, w7:1.02 },
                      2:{ cagr:.056, vol:.068, mdd:-.253, worst12:-.190, best12:.216, r10:1.37, w3:.82, w5:.87, w7:1.02 },
                      3:{ cagr:.070, vol:.091, mdd:-.354, worst12:-.266, best12:.289, r10:1.50, w3:.73, w5:.79, w7:.98 },
                      4:{ cagr:.081, vol:.109, mdd:-.422, worst12:-.320, best12:.360, r10:1.60, w3:.67, w5:.73, w7:.96 },
                      5:{ cagr:.091, vol:.127, mdd:-.487, worst12:-.374, best12:.433, r10:1.71, w3:.61, w5:.66, w7:.93 } };
/* previsioni: volatilità e crolli veri, ma rendimenti medi prudenti (nominali) e inflazione 2% */
const FWD = { SWDA:.065, EIMI:.07, AGGH:.025, XEON:.02 }, INFL = .02;
const EMERG_MONTHS = { stabile:3, medio:4, variabile:6 };
/* limiti del profilo: verificati sulle finestre storiche (tools/backtest.py) */
const HCAP = { lt3:1, "3_5":2, "5_7":3, "7_10":4, gt10:5 };
const HLAB = { lt3:"entro 3 anni", "3_5":"3–5 anni", "5_7":"5–7 anni", "7_10":"7–10 anni", gt10:"oltre 10 anni" };
const HYRS = { lt3:3, "3_5":5, "5_7":5, "7_10":7, gt10:10 };
const BCAP = { vendo:2, parte:3, aspetto:5, compro:5 };
const ECAP = { no:5, venduto:3, tenuto:5 };

/* ---------- dati storici ---------- */
let HIST=null, HSTAT=null;
function mixR(w,t){ let r=0; for(const k in w) r+=w[k]*HIST.r[k][t]; return r; }
function wOf(p){ const o={}; const w=PROFILES[p].w; for(const k in w) o[k]=w[k]/100; return o; }
/* PAC «solo versamenti»: ogni versamento compra le voci sotto peso (la regola del motore) */
function pacSim(w, i0, i1, m, v0){
  const val={}; for(const k in w) val[k]=(v0||0)*w[k];
  let paid=v0||0; const vals=[], paids=[];
  for(let t=i0;t<i1;t++){
    let V=0; for(const k in w) V+=val[k];
    const de={}; let dt=0; for(const k in w){ de[k]=Math.max(0,w[k]*(V+m)-val[k]); dt+=de[k]; }
    for(const k in w) val[k]+= dt>0 ? m*de[k]/dt : m*w[k];
    paid+=m; V=0;
    for(const k in w){ val[k]*=1+HIST.r[k][t]; V+=val[k]; }
    vals.push(V); paids.push(paid);
  }
  return { vals, paids };
}
function computeHStats(){
  const N=HIST.months.length; HSTAT={};
  for(let p=1;p<=5;p++){
    const w=wOf(p); const v=[1]; for(let t=0;t<N;t++) v.push(v[t]*(1+mixR(w,t)));
    let peak=1, mdd=0, mddAt=0; v.forEach((x,i)=>{ if(x>peak) peak=x; const d=x/peak-1; if(d<mdd){ mdd=d; mddAt=i; } });
    let worst12=9, w12At=0, best12=-9; for(let i=0;i+12<v.length;i++){ const r=v[i+12]/v[i]-1; if(r<worst12){ worst12=r; w12At=i; } if(r>best12) best12=r; }
    const mr=[]; for(let i=1;i<v.length;i++) mr.push(v[i]/v[i-1]-1);
    const mean=mr.reduce((s,x)=>s+x,0)/mr.length, vol=Math.sqrt(mr.reduce((s,x)=>s+(x-mean)*(x-mean),0)/mr.length*12);
    const roll=H=>{ const n=H*12, out=[]; for(let i=0;i+n<=N;i+=2){ const s=pacSim(w,i,i+n,1,0); out.push(s.vals[n-1]/n); } return out; };
    const r10=roll(10).sort((a,b)=>a-b);
    HSTAT[p]={ cagr:Math.pow(v[N],12/N)-1, vol, mdd, mddAt:HIST.months[Math.max(0,mddAt-1)], worst12, w12From:HIST.months[w12At], best12,
               r10:r10[Math.floor(r10.length/2)], w3:Math.min(...roll(3)), w5:Math.min(...roll(5)), w7:Math.min(...roll(7)) };
  }
}
function HS(p){ return (HSTAT && HSTAT[p]) || HS_FALLBACK[p]; }
async function loadHist(){
  try{ const r=await fetch("storico.json",{ cache:"no-store" }); HIST=await r.json(); computeHStats(); mcMemo={}; }
  catch(e){ HIST=null; return; }
  try{ renderPiano(); if(typeof renderBudget==="function") renderBudget(); }catch(e){ console.error(e); }   // un errore di disegno non deve cancellare lo storico
  engLoad(false);
}
function monthIt(k){ const a=String(k).split("-"); return new Date(+a[0],+a[1]-1,1).toLocaleDateString("it-IT",{ month:"long", year:"numeric" }); }
function pct0(x){ return (x>0?"+":"")+Math.round(x*100)+"%"; }

/* ---------- profilo di rischio ---------- */
function riskScore(a){
  if(!a || !HCAP[a.orizz] || !EMERG_MONTHS[a.lavoro] || !(+a.scelta>=1) || !BCAP[a.comport] || !ECAP[a.esper]) return null;
  const calc=+a.scelta;
  const limits=[ { k:"orizz", c:HCAP[a.orizz] }, { k:"comport", c:BCAP[a.comport] }, { k:"esper", c:ECAP[a.esper] } ];
  const cap=Math.min(...limits.map(l=>l.c));
  return { calc, cap, prof:Math.min(calc,cap), limits:limits.filter(l=>l.c<calc).sort((x,y)=>x.c-y.c) };
}
function profStats(p){
  const w=PROFILES[p].w; let az=0, ob=0, liq=0;
  for(const k in w){ const c=ASSETS[k].k; if(c==="az") az+=w[k]; else if(c==="ob") ob+=w[k]; else liq+=w[k]; }
  const s=HS(p); let fwd=0; for(const k in w) fwd+=w[k]/100*FWD[k];
  return { az, ob, liq, worst:s.mdd, worst12:s.worst12, cagr:s.cagr, fwd, real:(1+fwd)/(1+INFL)-1 };
}
function mixLabel(p){ const s=profStats(p); return `${s.az}% azioni${s.ob?` · ${s.ob}% obbligazioni`:""}${s.liq?` · ${s.liq}% liquidità`:""}`; }
function exampleAmount(){
  let base=0; try{ base=totals().val; }catch(e){}
  let m=0; try{ m=monthlySavings().amt; }catch(e){}
  return Math.max(2000, Math.round((base+12*m)/500)*500);
}
function limitText(l, a){
  const nm=PROFILES[l.c].n;
  if(l.k==="orizz"){
    const H=HYRS[a.orizz], nxt=Math.min(5,l.c+1), w=HS(nxt)["w"+(H>=7?7:H>=5?5:3)];
    return `Orizzonte ${HLAB[a.orizz]}: mi fermo a ${nm}. Nella storia, con ${H} anni di versamenti il profilo ${PROFILES[nxt].n} è arrivato a perdere fino al ${Math.max(0,Math.round((1-w)*100))}% di quanto versato.`;
  }
  if(l.k==="comport") return `Hai detto che dopo un crollo ${a.comport==="vendo"?"venderesti tutto":"venderesti una parte"}: con più azioni prima o poi un crollo arriva, e vendere sul fondo trasforma un calo temporaneo in una perdita vera. Mi fermo a ${nm}.`;
  if(l.k==="esper") return `Hai già venduto durante un calo: è umano, ma per non ripeterlo mi fermo a ${nm}.`;
  return "";
}
function riskQHtml(a, attr){
  const X=exampleAmount();
  const q=(k,t,opts,sub)=>`<div class="q"><div class="qt">${t}</div>${sub?`<div class="qsub">${sub}</div>`:""}<div class="opts">${opts.map(o=>`<button class="opt ${a[k]===o[0]?"on":""}" data-${attr}="${k}" data-v="${o[0]}">${esc(o[1])}</button>`).join("")}</div></div>`;
  let h=q("orizz","Fra quanto potresti aver bisogno di questi soldi?",[["lt3","Entro 3 anni"],["3_5","3–5 anni"],["5_7","5–7 anni"],["7_10","7–10 anni"],["gt10","Oltre 10 anni"]],
    "È la domanda più importante: più tempo hai, più puoi aspettare che un calo si riassorba. Per una casa fra 2 anni le azioni non vanno bene, per la pensione sì.");
  h+=q("lavoro","Il tuo reddito è…",[["stabile","Stabile (indeterminato)"],["medio","Abbastanza stabile"],["variabile","Variabile o precario"]],"Decide quanti mesi di spese tenere da parte nel fondo emergenza: 3, 4 o 6.");
  h+=`<div class="q"><div class="qt">Quale di questi portafogli ti farebbe dormire tranquillo?</div><div class="qsub">Esempio con <b>${eur0.format(X)}</b> investiti. Numeri veri dal ${HIST?monthIt(HIST.from):"gennaio 2004"} a oggi, crisi del 2008 compresa.</div><div class="pcards">`;
  for(let p=1;p<=5;p++){
    const s=HS(p), st=profStats(p);
    h+=`<button class="pcard ${+a.scelta===p?"on":""}" data-${attr}="scelta" data-v="${p}">
      <div class="pc-h"><b>${PROFILES[p].n}</b><span>${st.az}% azioni</span></div>
      <div class="pc-r"><span>Anno peggiore</span><b class="neg num">${eur0.format(X*s.worst12)}</b></div>
      <div class="pc-r"><span>Anno migliore</span><b class="pos num">+${eur0.format(X*s.best12)}</b></div>
      <div class="pc-r"><span>Rendimento medio</span><b class="num">${nf2.format(s.cagr*100)}% l'anno</b></div>
      <div class="pc-r"><span>Dopo 10 anni di PAC, di solito</span><b class="num">${pct0(s.r10-1)} sul versato</b></div></button>`;
  }
  h+=`</div></div>`;
  h+=q("comport",`Marzo 2020: in un mese le borse perdono il 30%. I tuoi ${eur0.format(X)} ora valgono ${eur0.format(X*0.7)}. Cosa fai?`,
    [["vendo","Vendo tutto"],["parte","Vendo una parte"],["aspetto","Non tocco niente"],["compro","Compro ancora"]],
    "Rispondi con quello che faresti davvero: vendere dopo un crollo è l'errore che costa di più. (Nel 2020 chi ha aspettato era in pari dopo 6 mesi.)");
  h+=q("esper","Hai già vissuto un forte calo dei tuoi investimenti?",[["no","No, mai"],["venduto","Sì, e ho venduto"],["tenuto","Sì, e ho tenuto o comprato"]]);
  h+=`<div class="q"><div class="qt">Hai un obiettivo? <small>(facoltativo)</small></div><div class="rng"><input data-rqi="goalAmt" inputmode="decimal" placeholder="importo in €" value="${a.goalAmt?String(a.goalAmt).replace(".",","):""}"><span>entro il</span><input data-rqi="goalYear" inputmode="numeric" placeholder="anno" value="${a.goalYear||""}"></div>
    <div class="qsub" style="margin-top:6px">es. 20.000 € entro il 2032 per l'anticipo di una casa. Ti dico che probabilità hai di arrivarci e quanto servirebbe al mese.</div></div>`;
  const sc=riskScore(a);
  h+= sc ? profileCardHtml(sc,a) : `<p class="bnote">Rispondi alle domande per vedere il tuo profilo.</p>`;
  return h;
}
function profileCardHtml(sc,a){
  const p=sc.prof, s=HS(p);
  return `<div class="card pprof"><div class="eyebrow">Il tuo profilo</div><div class="bw-big">${esc(PROFILES[p].n)}</div>
    <div class="bnote" style="margin-top:2px">${mixLabel(p)}</div>
    <ul class="why">
      <li>✓ Hai scelto il portafoglio ${esc(PROFILES[sc.calc].n)}.</li>
      ${sc.limits.length ? sc.limits.map(l=>`<li>↓ ${esc(limitText(l,a))}</li>`).join("") : `<li>✓ Orizzonte, reazione ai crolli ed esperienza sono compatibili con la tua scelta.</li>`}
      <li>Storicamente: calo massimo ${Math.round(s.mdd*100)}%${s.mddAt?` (${monthIt(s.mddAt)})`:""}, rendimento medio ${nf2.format(s.cagr*100)}% l'anno.</li>
    </ul></div>`;
}

/* ---------- prezzi ---------- */
function pxOf(t){ const p=prices[t]; if(p && p.eur!=null && p.state!=="err") return p.eur; const c=PL.px[t]; return c ? c.eur : null; }
let pxLoading=false;
async function loadPlanPrices(force){
  if(pxLoading || !PL.prof) return;
  const need=Object.keys(PROFILES[PL.prof].w).map(k=>ASSETS[k].t).concat(satOn()?satPicks().map(r=>r.t):[]).filter(t=>force || (pxOf(t)==null) || (!prices[t] && Date.now()-((PL.px[t]||{}).ts||0)>HOUR));
  if(!need.length) return;
  pxLoading=true;
  for(const t of need){ try{ const v=await quoteEur(t); if(v!=null) PL.px[t]={ eur:v, ts:Date.now() }; }catch(e){} }
  pxLoading=false; plSave(); renderPiano();
}

/* ---------- budget collegato ---------- */
function essentialMonthly(){
  if(typeof B!=="undefined" && B.setup){ return B.cats.filter(c=>c.g==="fisse"||c.g==="necessarie").reduce((s,c)=>s+c.plan,0); }
  return 1000;
}
function monthlySavings(){
  if(typeof B!=="undefined" && B.setup){ const st=bStatus(); return { amt:Math.max(0,st.savings), src:"budget", st }; }
  return { amt:settings.contrib||0, src:"impostazioni" };
}

/* ---------- il piano del mese ---------- */
function planCompute(){
  if(!PL.prof) return null;
  const prof=PROFILES[PL.prof], ms=monthlySavings(), S=ms.amt;
  const ess=essentialMonthly(), months=EMERG_MONTHS[PL.ans.lavoro]||4, target=ess*months;
  const fund=+PL.fund||0;
  let toFund=0, why="";
  if(fund<ess){ toFund=S; why="Prima di investire serve almeno un mese di spese da parte: questo mese tutto va al fondo emergenza."; }
  else if(fund<target){ toFund=Math.min(target-fund, S*0.5); why=`Il fondo emergenza è al ${Math.round(fund/target*100)}% (obiettivo ${months} mesi di spese): metà del risparmio va lì finché non è pieno.`; }
  else why=`Il fondo emergenza è completo (${months} mesi di spese): tutto il risparmio può essere investito.`;
  // il Replay parte da solo: al fondo va solo quello che resta dopo il Replay
  const rcM=(replay && replay.enabled && (!ms.st || replayPending(ms.st))) ? replayCost().total : 0;
  if(rcM>0 && toFund>Math.max(0,S-rcM)){ toFund=Math.max(0,S-rcM); if(fund<target) why=`Il Replay (${m0(rcM)}) continua ogni mese; il resto del risparmio va al fondo emergenza finché non arriva a ${m0(fund<ess?ess:target)}.`; }
  const inv=Math.max(0,S-toFund);

  // valori attuali per voce del modello; i titoli singoli e gli ETF fuori modello contano come azioni dei paesi sviluppati
  const keys=Object.keys(prof.w); const cur={}; keys.forEach(k=>cur[k]=0);
  let satellite=0; const sats=[]; let terW=0, terV=0;
  let satVal=0;
  holdings.forEach(h=>{
    const k=Object.keys(ASSETS).find(x=>ASSETS[x].t===h.ticker);
    const v=valueOf(h);
    if(!k && SAT_U[h.ticker]){ satVal+=v; terW+=v*0.25; terV+=v; return; }   // ETF del satellite: fuori dal core
    if(k){ terW+=v*ASSETS[k].ter; terV+=v; }
    if(k && cur[k]!=null) cur[k]+=v;
    else if(k){ satellite+=v; }
    else { satellite+=v; sats.push({ h, v }); }
  });
  const totNow=Object.values(cur).reduce((s,v)=>s+v,0)+satellite;

  // acquisti automatici del Replay
  const rep=[]; let repTot=0;
  if(replay && replay.enabled) (replay.items||[]).forEach(it=>{ const px=pxOf(it.ticker); if(px!=null){ const c=it.quote*px; repTot+=c; rep.push({ t:it.ticker, n:it.quote, px, c }); const k=keys.find(x=>ASSETS[x].t===it.ticker); if(k) cur[k]+=c; else satellite+=c; } });

  const pot=+PL.pot||0;                     // avanzi messi da parte per il prossimo acquisto
  // satellite (solo Aggressivo): una quota di ogni versamento sui 3 ETF con il momentum migliore, mai vendere
  let satAmt=0; const satBuys=[]; let satLeft=0;
  if(satOn() && inv>0){
    const pct=(ENG.signal && ENG.signal.verdict==="non funziona") ? 10 : (PL.sat.pct||10);
    const cap=(totNow+satVal+inv)*(pct+5)/100;
    if(satVal<cap){
      satAmt=Math.min(inv*pct/100, cap-satVal);
      // con importi piccoli accumula: compra quote intere partendo dal primo in classifica, il resto resta per il mese dopo
      let rem=satAmt+(+PL.satPot||0);
      satPicks().forEach(r=>{ const px=pxOf(r.t)!=null?pxOf(r.t):r.px; const n=px>0?Math.floor(rem/px):0;
        if(n>0){ satBuys.push({ k:"SAT", t:r.t, n, px, c:n*px, name:(SAT_U[r.t]||r.t) }); rem-=n*px; } });
      satLeft=rem;
    }
  }
  const free=Math.max(0, inv-satAmt-repTot)+pot;
  const after=totNow+repTot+free;
  const deficit={}; let defTot=0;
  keys.forEach(k=>{ let want=after*prof.w[k]/100; if(k==="SWDA") want-=satellite; deficit[k]=Math.max(0,want-cur[k]); defTot+=deficit[k]; });

  const fee=+PL.fee||0; const buys=[]; let left=free; const skipped=[];
  const alloc={}; keys.forEach(k=>alloc[k]= defTot>0 ? free*deficit[k]/defTot : free*prof.w[k]/100);
  if(fee>0){
    // con la commissione: un solo ordine al mese sulla voce più sottopesata
    const top=keys.filter(k=>pxOf(ASSETS[k].t)!=null).sort((a,b)=>deficit[b]-deficit[a])[0];
    keys.forEach(k=>alloc[k]=0);
    if(top){ if(free-fee<fee*100) skipped.push(top); else alloc[top]=free-fee; }
  }
  keys.slice().sort((a,b)=>alloc[b]-alloc[a]).forEach(k=>{
    const px=pxOf(ASSETS[k].t); if(px==null || alloc[k]<=0) return;
    const n=Math.floor(Math.min(alloc[k],left)/px);
    if(n>0){ buys.push({ k, t:ASSETS[k].t, n, px, c:n*px }); left-=n*px+fee; }
  });
  let guard=0;
  while(guard++<20){
    const bought=k=>(buys.find(x=>x.k===k)||{c:0}).c;
    const cand=keys.filter(k=>{ const px=pxOf(ASSETS[k].t); const has=!!buys.find(b=>b.k===k);
        return px!=null && !skipped.includes(k) && (fee===0 || has) && px<=left && deficit[k]-bought(k)>=px*0.5; })
      .sort((a,b)=>(deficit[b]-bought(b))-(deficit[a]-bought(a)));
    if(!cand.length) break;
    const k=cand[0], px=pxOf(ASSETS[k].t); let b=buys.find(x=>x.k===k);
    if(!b){ b={ k, t:ASSETS[k].t, n:0, px, c:0 }; buys.push(b); left-=fee; }
    b.n++; b.c+=px; left-=px;
  }
  // il resto non resta fermo: compro la voce che dopo l'acquisto resta più vicina (o sotto) al suo peso
  guard=0;
  while(guard++<50){
    const bought=k=>(buys.find(x=>x.k===k)||{c:0}).c;
    const cand=keys.filter(k=>{ const px=pxOf(ASSETS[k].t); return px!=null && !skipped.includes(k) && (fee===0 || buys.find(b=>b.k===k)) && px<=left; })
      .sort((a,b)=>((cur[a]+(a==="SWDA"?satellite:0)+bought(a)+pxOf(ASSETS[a].t))/after-prof.w[a]/100)-((cur[b]+(b==="SWDA"?satellite:0)+bought(b)+pxOf(ASSETS[b].t))/after-prof.w[b]/100));
    if(!cand.length) break;
    const k=cand[0], px=pxOf(ASSETS[k].t); let b=buys.find(x=>x.k===k);
    if(!b){ b={ k, t:ASSETS[k].t, n:0, px, c:0 }; buys.push(b); }
    b.n++; b.c+=px; left-=px;
  }
  const missingPx=keys.filter(k=>pxOf(ASSETS[k].t)==null);

  // pesi attuali vs obiettivo e scostamento
  const weights=keys.map(k=>{ let v=cur[k]-(rep.find(r=>r.t===ASSETS[k].t)||{c:0}).c; if(k==="SWDA") v+=satellite; return { k, now: totNow>0?v/totNow*100:0, goal:prof.w[k], v }; });
  const conc=sats.filter(s=>totNow>0 && s.v/totNow>0.10).map(s=>({ n:s.h.name, p:s.v/totNow*100 }));
  // ribilanciamento: solo con i versamenti, salvo scostamenti oltre 10 punti che i versamenti non sistemano entro 12 mesi
  let rebal=null;
  const over=weights.filter(w=>w.now-w.goal>10).sort((a,b)=>(b.now-b.goal)-(a.now-a.goal))[0];
  if(over && totNow>0){
    const need=over.v/(over.goal/100||1)-totNow, perMonth=Math.max(1,inv);
    const monthsFix=over.goal>0 ? need/perMonth : Infinity;
    if(monthsFix>12) rebal={ k:over.k, now:over.now, goal:over.goal, sell:Math.max(0,over.v-over.goal/100*totNow), monthsFix };
  }
  return { satAmt, satBuys, satVal, satLeft, prof, ms, S, ess, months, target, fund, toFund, why, inv, rep, repTot, free, pot, buys, left:Math.max(0,left), skipped, missingPx, weights, conc, totNow, fee, rebal, ter:terV>0?terW/terV:null, terV };
}

/* ---------- previsione: Monte Carlo a blocchi di 12 mesi sui rendimenti veri ---------- */
let mcMemo={};
function rng32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function mcRun(p, v0, m, years, n){
  const key=[p,Math.round(v0),Math.round(m),years,n].join("|"); if(mcMemo[key]) return mcMemo[key];
  const w=wOf(p), T=HIST.months.length, adj={};
  for(const k in w){ const r=HIST.r[k]; const mean=r.reduce((s,x)=>s+x,0)/r.length; adj[k]=Math.pow(1+FWD[k],1/12)-1-mean; }
  const rnd=rng32(12345+p*7+Math.round(m)); const at=[]; for(let y=0;y<=years;y++) at.push([]);
  for(let i=0;i<n;i++){
    let v=v0, s=0; at[0].push(v0);
    for(let t=0;t<years*12;t++){
      if(t%12===0) s=Math.floor(rnd()*(T-12));
      let r=0; for(const k in w) r+=w[k]*(HIST.r[k][s+t%12]+adj[k]);
      v=(v+m)*(1+r);
      if((t+1)%12===0) at[(t+1)/12].push(v/Math.pow(1+INFL,(t+1)/12));
    }
  }
  const q=(xs,f)=>{ const a=xs.slice().sort((x,y)=>x-y); return a[Math.min(a.length-1,Math.floor(f*a.length))]; };
  const res={ years, p10:at.map(a=>q(a,.1)), p50:at.map(a=>q(a,.5)), p90:at.map(a=>q(a,.9)), all:at };
  mcMemo[key]=res; return res;
}
function goalInfo(p, v0, m){
  const a=PL.ans||{}, G=num(a.goalAmt), Y=parseInt(a.goalYear,10);
  if(!(G>0) || !(Y>new Date().getFullYear())) return null;
  const yrs=Math.min(30, Y-new Date().getFullYear());
  const r=mcRun(p,v0,m,yrs,500); const prob=r.all[yrs].filter(x=>x>=G).length/r.all[yrs].length;
  // quanto servirebbe al mese per avere almeno il 70% di probabilità
  let lo=0, hi=Math.max(50,G/yrs/12*2);
  for(let i=0;i<14;i++){ const mid=(lo+hi)/2; const rr=mcRun(p,v0,Math.round(mid),yrs,300); const pr=rr.all[yrs].filter(x=>x>=G).length/rr.all[yrs].length; if(pr>=0.7) hi=mid; else lo=mid; }
  return { G, Y, yrs, prob, need70:hi };
}

/* ---------- come sarebbe andata ---------- */
function pastRun(p, m, fromKey){
  const i0=Math.max(0,HIST.months.indexOf(fromKey)); const s=pacSim(wOf(p),i0,HIST.months.length,m,0);
  let worst=9, wAt=0; s.vals.forEach((v,i)=>{ const r=v/s.paids[i]; if(r<worst){ worst=r; wAt=i; } });
  return { i0, ...s, worst, wAt:HIST.months[i0+wAt], wVal:s.vals[wAt], wPaid:s.paids[wAt], fin:s.vals[s.vals.length-1], paid:s.paids[s.paids.length-1] };
}
let pastFrom=null;

/* ---------- grafici ---------- */
function fanSvg(r, paid){
  const W=320, H=150, padL=4, padR=4, padT=10, padB=18, n=r.years;
  const max=Math.max(...r.p90, ...paid)*1.05||1;
  const X=i=>padL+(W-padL-padR)*i/n, Y=v=>padT+(H-padT-padB)*(1-v/max);
  const band=r.p90.map((v,i)=>`${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")+" "+r.p10.map((v,i)=>[i,v]).reverse().map(([i,v])=>`${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const line=a=>a.map((v,i)=>`${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const ticks=[0,Math.round(n/2),n].map(i=>`<text x="${X(i)}" y="${H-4}" text-anchor="${i===0?"start":i===n?"end":"middle"}">${i===0?"oggi":"+"+i+" anni"}</text>`).join("");
  return `<svg class="pchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Previsione"><polygon points="${band}" class="pc-band"/><polyline points="${line(paid)}" class="pc-paid"/><polyline points="${line(r.p50)}" class="pc-mid"/>${ticks}</svg>`;
}
function lineSvg(run){
  const W=320, H=150, padT=10, padB=18, n=run.vals.length-1;
  const max=Math.max(...run.vals, ...run.paids)*1.05||1;
  const X=i=>4+(W-8)*i/Math.max(1,n), Y=v=>padT+(H-padT-padB)*(1-v/max);
  const line=a=>a.map((v,i)=>`${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const wi=HIST.months.indexOf(run.wAt)-run.i0;
  const y0=HIST.months[run.i0].slice(0,4), y1=HIST.months[HIST.months.length-1].slice(0,4);
  return `<svg class="pchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Simulazione storica"><polyline points="${line(run.paids)}" class="pc-paid"/><polyline points="${line(run.vals)}" class="pc-mid"/>
    <circle cx="${X(wi)}" cy="${Y(run.vals[wi])}" r="4" class="pc-dot"/><text x="4" y="${H-4}">${y0}</text><text x="${W-4}" y="${H-4}" text-anchor="end">${y1}</text></svg>`;
}

/* ---------- salute del portafoglio ---------- */
function healthChecks(p){
  const L=[]; const ok=(t,d)=>L.push({ s:"ok", t, d }), warn=(t,d,a)=>L.push({ s:"warn", t, d, a }), tip=(t,d,a)=>L.push({ s:"tip", t, d, a });
  if(!riskScore(PL.ans)) warn("Profilo da aggiornare","Il questionario è stato rifatto con numeri veri: rispondi di nuovo (2 minuti) per un profilo più preciso.","redo");
  if(p.fund<p.ess) warn("Fondo emergenza quasi vuoto",`Hai ${money(p.fund)}: meno di un mese di spese (${m0(p.ess)}). Prima viene questo, poi gli investimenti.`);
  else if(p.fund<p.target) warn("Fondo emergenza da completare",`${money(p.fund)} su ${m0(p.target)} (${p.months} mesi di spese). Ci arrivi in circa ${Math.max(1,Math.ceil((p.target-p.fund)/Math.max(1,p.toFund||p.S/2)))} mesi.`);
  else ok("Fondo emergenza completo",`${money(p.fund)}: copre ${p.months} mesi di spese.`);
  if(p.fund>p.target*1.5 && p.fund-p.target>2000) tip("Troppa liquidità ferma",`Hai ${m0(p.fund-p.target)} oltre il fondo emergenza: sul conto perdono contro l'inflazione. Se non ti servono nei prossimi anni, puoi investirli un pezzo al mese (es. ${m0((p.fund-p.target)/12)} al mese per 12 mesi), così non entri tutto in un momento sfortunato.`,"lump");
  if(p.conc.length) warn("Troppo su un singolo titolo",p.conc.map(c=>`${c.n} pesa il ${Math.round(c.p)}%`).join(", ")+". Oltre il 10% su una sola azienda il rischio sale molto. Non serve vendere: i versamenti vanno sugli ETF e il peso scende da solo.");
  else if(p.totNow>0) ok("Ben diversificato","Nessun titolo singolo supera il 10% del portafoglio.");
  const md=Math.max(0,...p.weights.map(w=>Math.abs(w.now-w.goal)));
  if(p.totNow<=0) tip("Si parte da zero","Con i primi versamenti il portafoglio prende subito la forma giusta.");
  else if(p.rebal) warn("Pesi molto lontani dall'obiettivo",`${shortName(ASSETS[p.rebal.k].t)} è al ${Math.round(p.rebal.now)}% invece del ${p.rebal.goal}% e con i soli versamenti servirebbero ${Math.round(p.rebal.monthsFix)} mesi. Valuta di vendere circa ${m0(p.rebal.sell)} e comprare il resto: sulle plusvalenze paghi il 26%.`);
  else if(md>5) ok("Pesi in sistemazione",`Scarto massimo ${Math.round(md)} punti: lo correggo con i versamenti, senza vendere e senza tasse.`);
  else ok("Pesi in linea",`Scarto massimo ${Math.round(md)} punti dall'obiettivo.`);
  if(p.ter!=null) ok("Costi bassi",`Costo medio degli ETF ${nf2.format(p.ter)}% l'anno: circa ${money(p.terV*p.ter/100)} all'anno sul portafoglio di oggi.`);
  if(replay && replay.enabled && p.rep.length){
    const onlyEq=p.rep.every(r=>{ const k=Object.keys(ASSETS).find(x=>ASSETS[x].t===r.t); return !k || ASSETS[k].k==="az"; });
    const ps=profStats(PL.prof);
    if(onlyEq && ps.az<100) tip("Il Replay compra solo azioni",`Il tuo profilo vuole anche il ${100-ps.az}% tra obbligazioni e liquidità: le aggiungo io negli acquisti a mano. Se preferisci tutto automatico, adatta il Replay.`,"replay");
    if(p.repTot>p.S+1) warn("Il Replay costa più di quanto risparmi",`${money(p.repTot)} contro ${money(p.S)} di risparmio previsto: la differenza esce dalla liquidità.`);
  }
  return L;
}

/* ---------- avanzi di fine mese (mostrati nel Budget) ---------- */
function surplusInfo(){
  if(typeof B==="undefined" || !B.setup || typeof cycleOf!=="function") return null;
  const cur=cycleOf(), prev=cycleOf(addDays(cur.s,-1));
  if(parseYmd(B.setup.slice(0,10))>prev.e) return null;
  if(dayDiff(cur.s,today0())>15) return null;
  if((B.surplus||{})[prev.key]) return null;
  const st=bStatus(prev.s); const amt=Math.floor(Math.max(0,st.free));
  if(amt<5) return null;
  if(st.T.filter(x=>x.type!=="in" && x.src!=="recon").length<TRACKED_MIN && !((B.recon||{})[prev.key])) return null;   // poche spese segnate: non so se è avanzato davvero
  return { key:prev.key, amt, name:(prev.s.getDate()>15?prev.e:prev.s).toLocaleDateString("it-IT",{ month:"long" }) };
}
function surplusOptions(amt){
  const O=[]; const p=PL.prof ? planCompute() : null;
  const fund=+PL.fund||0, ess=essentialMonthly(), target=ess*(EMERG_MONTHS[(PL.ans||{}).lavoro]||4);
  if(fund<target) O.push({ id:"fund", amt:Math.min(amt,Math.ceil(target-fund)), t:"🛟 Mettili nel fondo emergenza", d:`Ti mancano ${m0(target-fund)} per arrivare a ${m0(target)}: è la cosa più utile da fare prima di investire.` });
  if(p){
    const k=p.weights.slice().sort((a,b)=>(a.now-a.goal)-(b.now-b.goal)).map(w=>w.k).find(x=>pxOf(ASSETS[x].t)!=null);
    if(k){ const px=pxOf(ASSETS[k].t), n=Math.floor(amt/px);
      if(n>=1) O.push({ id:"inv", k, n, px, amt:n*px, t:`📈 Investili: compra ${n} × ${shortName(ASSETS[k].t)}`, d:`Circa ${money(n*px)}. È la voce più sotto il peso obiettivo (${esc(ASSETS[k].d.split(":")[0])}).` });
      else O.push({ id:"acc", amt, t:`📈 Mettili da parte per il prossimo acquisto`, d:`Con altri ${money(px-amt)} compri 1 quota di ${shortName(ASSETS[k].t)}.` });
    }
  }
  O.push({ id:"keep", amt, t:"💶 Lasciali sul conto", d:"Restano come liquidità: li ritrovi nel patrimonio." });
  return O;
}
function surplusHtml(){
  const s=surplusInfo(); if(!s) return "";
  const O=surplusOptions(s.amt);
  return `<section><div class="card bplan"><div class="bw-h">🎉 A ${esc(s.name)} ti sono avanzati ${money(s.amt)}</div>
    <p class="bnote" style="margin-top:0">Budget del mese non speso (tempo libero e necessarie)${(B.recon||{})[s.key]?"":" (se hai segnato tutto: puoi controllare con «Allinea con la banca»)"}. Ti propongo:</p>
    ${O.map((o,i)=>`<button class="sopt ${i===0?"rec":""}" data-p="surplus" data-v="${o.id}" data-key="${s.key}">${i===0?`<span class="sbadge">consigliato</span>`:""}<b>${o.t}</b><span>${o.d}</span></button>`).join("")}</div></section>`;
}
function applySurplus(id, key){
  const s=surplusInfo(); if(!s || s.key!==key) return;
  const o=surplusOptions(s.amt).find(x=>x.id===id); if(!o) return;
  if(id==="fund") PL.fund=r2((+PL.fund||0)+o.amt);
  if(id==="inv"){ addBuys([{ k:o.k, t:ASSETS[o.k].t, n:o.n, px:o.px }]); }
  B.surplus=B.surplus||{}; B.surplus[key]={ id, amt:r2(o.amt), date:ymd(new Date()) };
  if(id==="acc"){ PL.pot=r2((+PL.pot||0)+o.amt); }
  bSave(); plSave(); renderBudget(); renderPiano();
  toast(id==="inv"?"Investito: posizioni aggiornate":id==="fund"?"Aggiunti al fondo emergenza":"Fatto");
}
function addBuys(list){
  list.forEach(x=>{
    let hh=holdings.find(y=>y.ticker===x.t);
    if(hh){ const q=hh.qty+x.n; hh.avg=(hh.qty*hh.avg+x.n*x.px)/q; hh.qty=q; }
    else holdings.push({ id:"h"+Date.now()+x.t, name:x.name||(ASSETS[x.k]?ASSETS[x.k].n:x.t), ticker:x.t, qty:x.n, avg:r2(x.px), cur:"EUR", date:new Date().toLocaleDateString("en-CA") });
  });
  store.set("holdings",holdings); render(); refreshAll();
}

function cycleKeyNow(){ return (typeof cycleOf==="function" && typeof B!=="undefined" && B.setup) ? cycleOf().key : new Date().toISOString().slice(0,7); }

/* riquadro nel Budget */
function pianoSummary(st){
  const p=planCompute(); if(!p) return `<div class="card bplan" data-b="goto" data-v="piano"><div class="bw-h">📈 Dove mettere i risparmi</div><p class="bnote">Rispondi alle domande del <b>Piano</b> e ti dico ogni mese quanto va al fondo emergenza e cosa comprare.</p></div>`;
  const done=PL.hist.find(h=>h.key===cycleKeyNow());
  return `<div class="card bplan" data-b="goto" data-v="piano"><div class="bw-h">📈 Dove mettere i risparmi${p.S>0?` (${m0(p.S)} ancora da mettere da parte)`:""}</div>
    <div class="bp-row"><span>🛟 Fondo emergenza</span><b class="num">${m0(p.toFund)}</b></div>
    <div class="bp-row"><span>📊 Da investire${p.repTot>0?" (Replay compreso)":""}</span><b class="num">${m0(p.inv)}</b></div>
    <p class="bnote" style="margin:6px 0 0">${done?"✅ Fatto questo mese.":"Tocca per il consiglio del mese →"}</p></div>`;
}
function pianoOnBudgetSetup(){ if(PL.fund==null && typeof B!=="undefined"){ PL.fund=num(B.ans.cash); plSave(); } }


/* ---------- motore (server come fonte principale, motore notturno del telefono come riserva) ---------- */
const SAT_U = { "XDWT.DE":"Tecnologia", "XDWH.DE":"Salute", "XDWF.DE":"Finanza", "XDWI.DE":"Industria", "XDWC.DE":"Beni voluttuari", "XDWS.DE":"Beni di prima necessità",
  "XDWU.DE":"Utility", "XDW0.DE":"Energia", "XDWM.DE":"Materiali", "XWTS.DE":"Comunicazioni", "IUSN.DE":"Small cap mondo", "EIMI.MI":"Emergenti",
  "IJPA.AS":"Giappone", "SMEA.MI":"Europa", "4GLD.DE":"Oro" };
let ENG = { signal:null, mc:null, news:null, storico:null, log:null, src:"", ts:0, err:"" };
let engBusy=false, engSentKey="";
/* il motore è preconfigurato nell'APK (config.local.json, fuori da git): niente codici da inserire */
function engCfg(){ const c=PL.engine||(PL.engine={ url:"", token:"" }); if(!c.url && window.GRZ_CONF) return window.GRZ_CONF; return c; }
async function loadConf(){
  try{ const r=await fetch("config.local.json",{ cache:"no-store" }); if(r.ok){ const j=await r.json(); if(j && j.engineUrl && j.engineToken) window.GRZ_CONF={ url:j.engineUrl, token:j.engineToken }; } }catch(e){}
  if(window.GRZ_CONF){ ENG.ts=0; engLoad(true); if(typeof applyAutoSettings==="function") applyAutoSettings(); }
}
function engServerOn(){ const c=engCfg(); return !!(c.url && c.token); }
function engApply(j, src){
  ENG={ signal:j.signal||null, mc:j.mc||null, news:(ENG&&ENG.news)||null, storico:j.storico||null, log:j.log||null, src, ts:Date.now(), err:"" };
  // storico allungato dal motore: lo uso se è più recente di quello dentro l'app
  if(ENG.storico && HIST && ENG.storico.to>HIST.to && ENG.storico.months && ENG.storico.r){ HIST=ENG.storico; computeHStats(); mcMemo={}; }
}
async function engLoad(force){
  if(engBusy) return; if(!force && Date.now()-ENG.ts<30*60000) return;
  // senza motore (per esempio la versione web) non c'è niente da leggere: niente giri a vuoto
  if(!engServerOn() && !(window.GruzzoloNative && GruzzoloNative.readEngine)){ ENG.ts=Date.now(); return; }
  engBusy=true;
  try{
    if(engServerOn()){
      const c=engCfg(); const r=await fetch(c.url+(c.url.indexOf("?")>=0?"&":"?")+"token="+encodeURIComponent(c.token),{ cache:"no-store" });
      if(!r.ok) throw new Error("HTTP "+r.status); engApply(await r.json(),"server");
    } else if(window.GruzzoloNative && GruzzoloNative.readEngine){
      const g=n=>{ try{ const s=GruzzoloNative.readEngine(n); return s?JSON.parse(s):null; }catch(e){ return null; } };
      engApply({ signal:g("signal"), mc:g("mc"), news:g("news"), storico:g("storico"), log:g("log") },"telefono");
    }
  }catch(e){ ENG.err=String(e.message||e); ENG.ts=Date.now(); }
  engBusy=false; renderPiano();
}
/* parametri delle simulazioni: se cambiano li mando al motore (il server ricalcola subito, il telefono stanotte) */
function engInput(p){
  const a=PL.ans||{}, G=num(a.goalAmt), Y=parseInt(a.goalYear,10), yNow=new Date().getFullYear();
  const w=wOf(PL.prof), fwd={}; for(const k in w) fwd[k]=FWD[k];
  const m=steadyMonthly(p), v0=Math.round(p.totNow);
  const goalYears=(G>0 && Y>yNow) ? Math.min(30,Y-yNow) : 0;
  const key=[PL.prof,v0,m,Math.round(G),goalYears].join("|");
  return { key, w, fwd, v0, m, infl:INFL, years:20, goal:G>0?G:0, goalYears };
}
async function engSend(p){
  if(!PL.prof) return; const inp=engInput(p); if(inp.key===engSentKey) return; engSentKey=inp.key;
  const hold=holdings.map(h=>({ t:h.ticker, n:h.name }));
  try{ if(window.GruzzoloNative && GruzzoloNative.setEngineInput){ GruzzoloNative.setEngineInput(JSON.stringify(inp)); GruzzoloNative.setNewsHoldings(JSON.stringify(hold)); } }catch(e){}
  if(!engServerOn()) return;
  try{
    const c=engCfg(); const r=await fetch(c.url,{ method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ token:c.token, input:inp, holdings:hold, run:"mc" }) });
    if(r.ok){ engApply(await r.json(),"server"); renderPiano(); }
  }catch(e){}
}
function engMcFor(p){ const k=engInput(p).key; return ENG.mc && ENG.mc.key===k && ENG.mc.p50 ? ENG.mc : null; }

/* satellite: solo profilo Aggressivo, solo con i versamenti, mai vendere */
function satOn(){ return PL.prof===5 && PL.sat && PL.sat.on; }
function satPicks(){ const s=ENG.signal; if(!s || !s.ranking) return []; return s.ranking.slice(0,3); }
function satCardHtml(p){
  if(PL.prof!==5) return "";
  const S=PL.sat||{ on:false, pct:10 }, s=ENG.signal;
  const v=s?s.verdict:null, h5=s&&s.h60, h3=s&&s.h36;
  const verdictTxt = !s ? "Il motore non ha ancora verificato il segnale: collegalo nelle Impostazioni o premi «Esegui ora»."
    : `Verifica sui dati veri (${monthIt(s.from)} – ${monthIt(s.to)}): <b>${esc(v)}</b>. Versando ogni mese per 5 anni, i 3 ETF con il momentum migliore hanno reso ${h5?pct0(h5.top3.median-1):"?"} sul versato, contro ${h5?pct0(h5.pariPeso.median-1):"?"} di tutti a pari peso, ${h5?pct0(h5.peggiori3.median-1):"?"} dei 3 peggiori e ${h5?pct0(h5.mondo.median-1):"?"} del semplice MSCI World.`;
  const picks=satPicks();
  return `<section><div class="eyebrow" style="margin:0 4px 8px">Satellite: una scommessa</div><div class="card ${v==="non funziona"?"bwarn":""}">
    <div class="bw-h">🎲 Inclinazione verso i settori più forti</div>
    <p class="bnote" style="margin-top:0">Solo per il profilo Aggressivo: una piccola parte di ogni versamento va sui 3 ETF (settori del mondo, regioni, oro) che negli ultimi 12 mesi sono andati meglio. Non vende mai: niente tasse finché non incassi. <b>Non è un modo per battere il mercato</b>: nel lungo periodo il vantaggio misurato è piccolo, e negli ultimi anni sugli ETF comprabili in Italia non c'è stato.</p>
    <p class="bnote">${verdictTxt}</p>
    <div class="switch"><span class="lab">Attiva il satellite</span><div class="toggle ${S.on?"on":""}" data-p="satOn"></div></div>
    ${S.on?`<div class="seg" style="margin:6px 0 10px">${[10,15,20].map(x=>`<button class="${S.pct===x?"on":""}" data-p="satPct" data-v="${x}">${x}%</button>`).join("")}</div>
      ${picks.length?`<div class="bnote" style="margin-top:0">Questo mese: ${picks.map(r=>`<b>${esc(SAT_U[r.t]||r.t)}</b> (${esc(shortName(r.t))}, ${pct0(r.mom)} in 12 mesi)`).join(", ")}.</div>`:""}
      ${v==="non funziona"?`<p class="bnote neg">Il segnale oggi non funziona: se lo tieni, resta al 10%.</p>`:""}`:""}
  </div></section>`;
}

/* notizie con sentiment (calcolato dal motore) */
function newsCardHtml(){
  const n=ENG.news; if(!n || !n.items || !n.items.length) return "";
  const face=s=>s<=-0.25?"🙁":s>=0.25?"🙂":"😐";
  return `<section><div class="eyebrow" style="margin:0 4px 8px">Notizie sulle tue posizioni</div><div class="card"><ul class="chk">${n.items.map(it=>`<li class="${it.score<=-0.25&&it.count>=3?"warn":"ok"}"><span class="ci">${face(it.score)}</span><div><b>${esc(it.n||it.t)}</b>
      <p>${it.count} titoli nell'ultima settimana · tono ${it.score>=0.25?"positivo":it.score<=-0.25?"negativo":"neutro"}${it.worst&&it.worst[0]?`<br>«${esc(String(it.worst[0][1]).slice(0,110))}»`:""}</p></div></li>`).join("")}</ul>
    <p class="bnote">Il tono lo calcolo con un dizionario di parole finanziarie (italiano e inglese), nel motore e senza servizi a pagamento. È un segnale d'allarme, non un consiglio: un titolo negativo non è un motivo per vendere un ETF.</p></div></section>`;
}

/* impostazioni: motore */
function renderEngineSettings(){
  const el=$("#sEngine"); if(!el) return; const c=engCfg();
  const last=ENG.log && ENG.log.length ? ENG.log[ENG.log.length-1] : null;
  const when=last?new Date((last.end||last.start)*(String(last.end||last.start).length<12?1000:1)).toLocaleString("it-IT",{ day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }):"mai";
  el.innerHTML=`<p class="hint" style="margin:0 0 10px;color:var(--muted);font-size:12px">Aggiorna i dati, verifica il satellite, calcola 20.000 scenari e legge le notizie. Sul server gira ogni notte e ricalcola subito quando cambi qualcosa; senza server lo fa il telefono di notte, in carica e sul Wi-Fi.</p>
    <details class="why-d" style="margin:0 0 10px"><summary>Avanzate (già configurato, non serve toccare niente)</summary>
    <label class="fld" style="margin-top:10px"><span class="lab">Indirizzo del motore (server)</span><input id="sEngUrl" placeholder="https://…/motore/api.php" value="${esc((PL.engine&&PL.engine.url)||"")}"></label>
    <label class="fld"><span class="lab">Codice del motore</span><input id="sEngTok" type="password" autocomplete="off" value="${esc((PL.engine&&PL.engine.token)||"")}"></label></details>
    <div class="switch" style="border-top:none;padding-top:0"><span class="lab" style="font-size:12px;color:var(--muted);font-weight:420">${ENG.err?"Errore: "+esc(ENG.err):(ENG.src?`Fonte: ${ENG.src} · ultimo giro: ${esc(when)}${last&&last.ms?` (${Math.round(last.ms/1000)} s)`:""}`:"Mai eseguito")}</span><button class="add" type="button" data-p="engRun">Esegui ora</button></div>`;
}
document.addEventListener("change",e=>{
  if(e.target.id==="sEngUrl" || e.target.id==="sEngTok"){ const c=PL.engine||(PL.engine={ url:"", token:"" }); c.url=$("#sEngUrl").value.trim(); c.token=$("#sEngTok").value.trim(); plSave(); engSentKey=""; ENG.ts=0; engLoad(true).then(renderEngineSettings); }
});


/* ---------- il tuo futuro: proiezione, traguardi, cursore e proposte ---------- */
/* quanto investi in un mese normale (il primo mese iniziato a metà non conta per il futuro) */
function steadyMonthly(p){
  // investi almeno il Replay, che parte da solo ogni mese
  const rc=(replay && replay.enabled) ? replayCost().total : 0;
  if(typeof B!=="undefined" && B.setup){ try{ return Math.max(0, Math.round(Math.max(rc, modePlan(B.mode).save))); }catch(e){} }
  return Math.round(p.inv>0 ? p.inv : Math.max(0,p.S));
}
function fv(monthly, start, years, r){ const i=Math.pow(1+r,1/12)-1, n=years*12; return start*Math.pow(1+r,years) + (i>0 ? monthly*((Math.pow(1+i,n)-1)/i) : monthly*n); }
/* valore tipico (in euro di oggi) anno per anno per un versamento mensile m */
function futureCurve(v0, m){
  if(HIST){ const r=mcRun(PL.prof, v0, Math.max(0,Math.round(m)), 30, 400); return r.p50; }
  const ps=profStats(PL.prof), out=[]; for(let y=0;y<=30;y++) out.push(fv(m,v0,y,ps.real)); return out;
}
function milestones(curve, v0){
  const yNow=new Date().getFullYear(), out=[];
  [10000,25000,50000,100000,250000,500000].forEach(t=>{ if(t<=v0) return; const y=curve.findIndex(v=>v>=t); if(y>0 && out.length<4) out.push({ t, y:yNow+y, n:y }); });
  return out;
}
function futureHtml(p, m){
  const c=futureCurve(p.totNow, m), ms=milestones(c, p.totNow);
  return `<div class="bh-lab">Tra 10 anni potresti avere</div>
    <h1 class="total num" id="futTen">${m0(c[10])}</h1>
    <div class="sub" id="futSub">investendo <b class="num">${m0(m)}</b> al mese · tra 20 anni <b class="num">${m0(c[20])}</b> · tra 30 <b class="num">${m0(c[30])}</b><br><small>scenario tipico, in euro di oggi (al netto dell'inflazione)</small></div>
    <div class="fut-ms" id="futMs">${ms.map(x=>`<div class="fms"><b class="num">${x.t>=1000?Math.round(x.t/1000)+".000":x.t} €</b><span>${x.y}</span><small>tra ${x.n} ${x.n===1?"anno":"anni"}</small></div>`).join("") || `<p class="bnote">Con questo versamento i traguardi da 10.000 € in su arrivano oltre i 30 anni: prova ad aumentarlo qui sotto.</p>`}</div>`;
}
function proposalsHtml(p){
  const ps=profStats(PL.prof), g=(m,y)=>fv(m,0,y,ps.real), L=[];
  const swda=pxOf("SWDA.MI");
  if(swda) L.push({ e:"📈", t:`Una quota di MSCI World in più al mese`, d:`circa ${money(swda)} al mese in più nel Replay`, v:g(swda,10), v20:g(swda,20), a:"replay", b:"Adatta il Replay" });
  if(typeof B!=="undefined" && B.cats){
    const vz=B.cats.find(c=>c.id==="vizio");
    if(vz){ const mv=viceStats(vz).monthly; if(mv>5) L.push({ e:vz.e, t:`I soldi di ${vz.n} investiti invece che spesi`, d:`${money(mv)} al mese`, v:g(mv,10), v20:g(mv,20) }); }
    const wk=B.cats.find(c=>c.id==="weekend");
    if(wk && wk.plan>40){ const cut=Math.round(wk.plan*0.2/5)*5; L.push({ e:"🎉", t:`Un weekend un po' più leggero`, d:`${money(cut)} in meno al mese (−20%) messi nel piano`, v:g(cut,10), v20:g(cut,20) }); }
    const fu=B.cats.find(c=>c.id==="fuori");
    if(fu && fu.plan>30){ const cut=Math.round(fu.plan*0.25/5)*5; L.push({ e:"🥪", t:`Una schiscetta in più alla settimana`, d:`circa ${money(cut)} in meno al mese di pranzi fuori`, v:g(cut,10), v20:g(cut,20) }); }
  }
  L.push({ e:"🎉", t:`Gli avanzi di fine mese investiti`, d:`anche solo 50 € al mese di budget non speso`, v:g(50,10), v20:g(50,20) });
  const goal=num((PL.ans||{}).goalAmt);
  let h=`<section><div class="eyebrow" style="margin:0 4px 8px">Proposte per te</div><div class="props">`+
    L.sort((a,b)=>b.v-a.v).slice(0,4).map(x=>`<div class="prop"><span class="pe">${x.e}</span><div class="pb"><b>${esc(x.t)}</b><span>${esc(x.d)}</span></div><div class="pv"><b class="num">+${m0(x.v)}</b><small>in 10 anni</small><small>+${m0(x.v20)} in 20</small></div>${x.a?`<button class="add" data-p="${x.a}">${esc(x.b)}</button>`:""}</div>`).join("")+
    `</div>${goal>0?"":`<button class="btn" data-p="goal" style="margin-top:10px">🎯 Datti un traguardo (casa, viaggio, libertà)</button>`}
    <p class="bnote">Quanto potrebbe valere quella cifra investita ogni mese con il tuo profilo, in euro di oggi (rendimento atteso prudente del ${nf2.format(ps.real*100)}% l'anno oltre l'inflazione).</p></section>`;
  return h;
}
function updFuture(m){
  PL.slider=m; const p=planCompute(); if(!p) return;
  const c=futureCurve(p.totNow, m), ms=milestones(c, p.totNow), base=futureCurve(p.totNow, steadyMonthly(p));
  $("#futTen").textContent=m0(c[10]); $("#futM").textContent=m0(m);
  $("#futSub").innerHTML=`investendo <b class="num">${m0(m)}</b> al mese · tra 20 anni <b class="num">${m0(c[20])}</b> · tra 30 <b class="num">${m0(c[30])}</b><br><small>scenario tipico, in euro di oggi (al netto dell'inflazione)</small>`;
  $("#futMs").innerHTML=ms.map(x=>`<div class="fms"><b class="num">${Math.round(x.t/1000)}.000 €</b><span>${x.y}</span><small>tra ${x.n} ${x.n===1?"anno":"anni"}</small></div>`).join("") || `<p class="bnote">Con questo versamento i traguardi arrivano oltre i 30 anni.</p>`;
  const d=c[10]-base[10]; $("#futDiff").innerHTML = Math.abs(d)<1 ? "È il risparmio previsto dal tuo budget." : `${d>0?"+":"−"}${m0(Math.abs(d))} tra 10 anni rispetto al tuo piano attuale${d>0?` (servono ${m0(m-steadyMonthly(p))} in più al mese)`:""}.`;
}
document.addEventListener("input",e=>{ if(e.target.id==="futRange") updFuture(+e.target.value); });

/* ---------- notizie dal motore (Google News in italiano, con il tono) ---------- */
let NEWS_FULL=null, newsBusy=false;
/* notizie per le MIE posizioni: le mando nella richiesta, così il motore non usa quelle di un altro telefono */
function engNewsUrl(){ const c=engCfg(); if(!c||!c.url||!c.token) return null;
  const h=JSON.stringify((typeof holdings!=="undefined"?holdings:[]).map(x=>({ t:x.ticker, n:x.name })));
  return c.url+(c.url.indexOf("?")>=0?"&":"?")+"what=news&h="+encodeURIComponent(h)+"&token="+encodeURIComponent(c.token); }
async function loadNewsEngine(force){
  const box=$("#newsList"); if(!box) return;
  const c=engCfg();
  if(!c || !c.url || !c.token){ box.innerHTML=`<div class="chart-msg">Le notizie arrivano dal motore: collegalo nelle Impostazioni.</div>`; return; }
  if(!force && NEWS_FULL && Date.now()-NEWS_FULL.at<15*60000){ renderNews(); return; }
  if(newsBusy) return; newsBusy=true;
  box.innerHTML=`<div class="chart-msg">Cerco le notizie sui mercati e sulle tue posizioni…</div>`;
  try{
    const r=await fetch(engNewsUrl(),{ cache:"no-store" });
    const j=await r.json(); NEWS_FULL={ data:j.news, at:Date.now() }; if(j.news) ENG.news=j.news;
  }catch(e){ box.innerHTML=`<div class="chart-msg">Notizie non raggiungibili. Riprova con «Aggiorna».</div>`; newsBusy=false; return; }
  newsBusy=false; renderNews();
}
/* stesso articolo da due fonti o con titolo appena diverso («Le Borse…» / «Borse…»): ne tengo uno */
function newsDedup(arts){ const seen=new Set(); return (arts||[]).filter(a=>{ const k=String(a.title||"").toLowerCase().replace(/^(le|la|il|lo|gli|i|l')\s*/,"").replace(/[^a-zà-ù0-9]+/g,"").replace(/(di|del|della|dell)/g,"").slice(0,32); if(seen.has(k)) return false; seen.add(k); return true; }); }
function renderNews(){
  const box=$("#newsList"); if(!box || !NEWS_FULL || !NEWS_FULL.data) return;
  const seenAll=new Set(), items=(NEWS_FULL.data.items||[]).map(it=>({ ...it, articles:newsDedup(it.articles).filter(a=>{ if(seenAll.has(a.link)) return false; seenAll.add(a.link); return true; }) }));
  const dot=s=>s<=-0.25?"neg":s>=0.25?"pos":"neu";
  box.innerHTML=items.map(it=>`<div class="news-group"><div class="news-h"><span class="nm">${esc(it.t==="_mercati"?"📊 Mercati":it.n)}</span><span class="tk">${esc(it.t==="_mercati"?"":shortName(it.t))}</span>
      ${it.count?`<span class="ntone ${dot(it.score)}">${it.score>=0.25?"tono positivo":it.score<=-0.25?"tono negativo":"tono neutro"}</span>`:""}</div>
    ${(it.articles||[]).length ? it.articles.map(a=>`<a class="ncard" href="${esc(a.link)}" target="_blank" rel="noopener"><span class="ndot ${dot(a.s)}"></span><div class="ntext"><div class="ntitle">${esc(a.title)}</div><div class="nmeta">${esc(a.src)}${a.ts?` · ${relTime(a.ts/1000)}`:""}</div></div>${a.img?`<img class="nimg" src="${esc(a.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`:""}</a>`).join("")
      : `<div class="news-empty">Nessuna notizia nell'ultima settimana</div>`}</div>`).join("")
    + `<p class="bnote">Notizie dell'ultima settimana da Bing Notizie e Google News, cercate per argomento (per gli ETF il mercato che seguono). Il pallino indica il tono del titolo: è un indizio, non un consiglio.</p>`;
}
loadNews = loadNewsEngine;   // sostituisce la vecchia ricerca su Yahoo, che non restituisce più notizie


/* ---------- Piano: il tuo gruzzolo, spinte al Replay, idee ---------- */
function sparkSvg(c, c2){
  const W=320, H=110, n=c.length-1, max=Math.max(...c, ...(c2||[0]))*1.08||1;
  const X=i=>6+(W-12)*i/n, Y=v=>H-14-(H-26)*v/max;
  const pts=a=>a.map((v,i)=>`${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const yNow=new Date().getFullYear();
  const dots=[10,20,30].map(y=>`<circle cx="${X(y)}" cy="${Y((c2||c)[y])}" r="3.5" class="sp-dot"/><text x="${X(y)}" y="${H-2}" text-anchor="${y===30?"end":"middle"}">${yNow+y}</text>`).join("");
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Crescita prevista">
    <defs><linearGradient id="spg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E0B15E" stop-opacity=".35"/><stop offset="1" stop-color="#E0B15E" stop-opacity="0"/></linearGradient></defs>
    <polygon points="${X(0)},${H-14} ${pts(c)} ${X(n)},${H-14}" fill="url(#spg)"/>
    <polyline points="${pts(c)}" class="sp-line"/>
    ${c2?`<polyline points="${pts(c2)}" class="sp-line2"/>`:""}
    ${dots}<text x="${X(0)}" y="${H-2}">oggi</text></svg>`;
}
function replayLine(){
  if(!(replay && replay.enabled && (replay.items||[]).length)) return "";
  const cost=replayCost().total;
  return `<div class="fut-rep">🔁 Replay: ${replay.items.map(i=>`<b>${i.quote} × ${esc(shortName(i.ticker))}</b>`).join(" + ")} il giorno ${replay.dayOfMonth||1}${cost>0?` · ${m0(cost)} al mese`:""}</div>`;
}
/* barra orizzontale: quanto del risparmio del mese è già messo da parte o investito */
function monthBarHtml(p){
  let G=0, done=0;
  try{ if(typeof B!=="undefined" && B.setup){ const st=bStatus(); G=Math.max(0,cyclePlan(st.cy.s).save); done=goalDone(st); } }catch(e){}
  if(!(G>0)){ G=Math.max(0,(p.S||0)); done=0; }
  const pc=G>0?Math.min(100,Math.round(done/G*100)):0, left=Math.max(0,G-done);
  return `<section><div class="mbar" role="progressbar" aria-valuenow="${pc}" aria-valuemin="0" aria-valuemax="100" aria-label="Investimento del mese">
      <i style="width:${pc}%"></i><span class="mb-t">Investimento del mese</span><b class="mb-p num">${pc}%</b></div>
    <div class="mb-s"><span><b class="num">${m0(done)}</b> di ${m0(G)}</span><span>${left>0?`mancano <b class="num">${m0(left)}</b>`:"✓ fatto"}</span></div></section>`;
}
/* in cima al Piano: una scheda sola (come il Portafoglio): valore futuro, grafico, al mese, oggi, Replay e pesi */
function plMainHtml(p, m){
  const b=PL._boost, add=b?b.amt:0, Y=PL._yr||10;
  const c=futureCurve(p.totNow, m), c2=add?futureCurve(p.totNow, m+add):null, cur=c2||c, y=new Date().getFullYear();
  const cols=["var(--c0)","var(--c1)","var(--c2)","var(--c3)","var(--c4)","var(--c5)"];
  const W=p.weights.map((w,i)=>({ ...w, col:cols[i%cols.length] }));
  return `<section><div class="card fz pl-main">
    <div class="fz-top"><div class="fz-val"><small>Il tuo gruzzolo nel ${y+Y}</small><b class="num">${m0(cur[Y])}</b>
        <span class="num ${c2?"pos":""}">${c2?`+${m0(c2[Y]-c[Y])} con ${esc(b.label)}`:`<i>scenario tipico, in euro di oggi</i>`}</span></div>
      <div class="fz-seg" role="tablist">${[10,20,30].map(k=>`<button data-p="yr" data-v="${k}" class="${Y===k?"on":""}">${k} anni</button>`).join("")}</div></div>
    <div class="fz-ds"><span class="fz-d">metti da parte <b class="num">${m0(m+add)}</b> al mese</span><span class="fz-d">versati <b class="num">${m0(p.totNow+(m+add)*12*Y)}</b></span></div>
    ${sparkSvg(c, c2)}
  </div></section>`;
}
/* «Per te»: consigli e salute del portafoglio insieme, prima le cose da fare */
function forYouHtml(p){
  const a=ideasHtml(p, true), b=healthHtml(p, true), L=a.concat(b);
  if(!L.length) return "";
  return `<section><div class="sc-t sc-tt">🎯 Per te</div><div class="sc-car">${L.join("")}</div></section>`;
}
/* salute del portafoglio: schede brevi da scorrere */
function healthHtml(p, cards){
  const HC=healthChecks(p).sort((x,y)=>({warn:0,tip:1,ok:2}[x.s]??1)-({warn:0,tip:1,ok:2}[y.s]??1)); if(!HC.length) return cards?[]:"";
  const tag={ ok:["✓","a posto"], warn:["!","da guardare"], tip:["💡","consiglio"] };
  const C=HC.map(c=>{ const t=tag[c.s]||tag.tip;
    return `<div class="sc-crazy plh ${c.s}"><div class="scc-h"><span class="plh-i">${t[0]}</span><div><b>${esc(c.t)}</b></div></div><span class="scc-tag">${t[1]}</span><p>${c.d}</p>${c.a==="replay"?`<button class="add" data-p="replay">Adatta il Replay →</button>`:c.a==="redo"?`<button class="add" data-p="redo">Rispondi ora →</button>`:""}</div>`; });
  return cards ? C : `<section><div class="sc-t sc-tt">🩺 Salute del portafoglio</div><div class="sc-car">${C.join("")}</div></section>`;
}
function heroHtml(p, m){
  const b=PL._boost, add=b?b.amt:0;
  const c=futureCurve(p.totNow, m), c2=add?futureCurve(p.totNow, m+add):null, cur=c2||c, y=new Date().getFullYear();
  return `<section class="bhero fut" id="futHero">
    <div class="eyebrow">Il tuo gruzzolo nel ${y+10}</div>
    <h1 class="total num">${m0(cur[10])}</h1>
    ${c2?`<div class="fut-delta">+${m0(c2[10]-c[10])} con ${esc(b.label)}</div>`:`<div class="sub">scenario tipico, in euro di oggi</div>`}
    ${sparkSvg(c, c2)}
    <div class="fut-kpi"><div><small>metti da parte al mese</small><b class="num">${m0(m+add)}</b></div><div><small>nel ${y+20}</small><b class="num">${m0(cur[20])}</b></div><div><small>oggi hai</small><b class="num">${m0(p.totNow)}</b></div></div>
    ${replayLine()}
  </section>`;
}
function boostHtml(p, m){
  const ps=profStats(PL.prof), keys=Object.keys(PROFILES[PL.prof].w);
  const btns=keys.map(k=>{ const px=pxOf(ASSETS[k].t); if(!px) return ""; const d=fv(px,0,10,ps.real); const on=PL._boost&&PL._boost.k===k;
    return `<button class="sc-crazy plb ${on?"on":""}" data-p="boost" data-v="${k}"><div class="scc-h"><span class="sc-e">${ASSETS[k].k==="ob"?"🛡️":ASSETS[k].k==="liq"?"💶":"📈"}</span><div><b>+1 ${esc(shortName(ASSETS[k].t))} al mese</b><small>${money(px)} a quota</small></div></div>
      <span class="scc-tag">${on?"scelto":"tocca per provarlo"}</span><div class="plb-v num">+${m0(d)}</div><small class="plb-s">in più tra 10 anni</small></button>`; }).join("");
  if(!btns) return "";
  const b=PL._boost;
  return `<section><div class="sc-t sc-tt">🚀 Spingi il tuo Replay</div><div class="sc-car">${btns}</div>
    ${b?`<button class="btn gold" data-p="boostApply" style="margin-top:4px">Aggiungi ${esc(b.label)} al Replay</button>`:""}</section>`;
}
function ideasHtml(p, cards){
  const I=[]; const ps=profStats(PL.prof);
  if(PL.provisional) I.push({ e:"🎯", t:"Rendi il piano su misura", d:"5 domande, 2 minuti: oggi uso un profilo Bilanciato provvisorio.", a:"redo", b:"Rispondi" });
  // voci del profilo che non hai ancora
  p.weights.filter(w=>w.goal>=5 && w.now<1 && !(replay&&replay.enabled&&(replay.items||[]).some(i=>i.ticker===ASSETS[w.k].t))).forEach(w=>{
    const why = ASSETS[w.k].k==="ob" ? "ammortizzano i crolli delle azioni" : ASSETS[w.k].k==="liq" ? "parte tranquilla, rende circa il tasso BCE" : "diversifica su altre aree del mondo";
    I.push({ e:ASSETS[w.k].k==="ob"?"🛡️":"🌍", t:`Aggiungi ${shortName(ASSETS[w.k].t)} al Replay`, d:`Il tuo profilo ne vuole il ${w.goal}%: ${why}.`, a:"boost", v:w.k, b:"Vedi l'effetto" });
  });
  // azioni singole e satellite
  const singles=p.conc||[];
  if(singles.length) I.push({ e:"⚠️", t:"Troppo su un'azione sola", d:`${singles[0].n} pesa il ${Math.round(singles[0].p)}%: tienila sotto il 10%, i nuovi soldi vanno sugli ETF.` });
  else if(PL.prof===5) I.push({ e:"🎲", t:"Una piccola scommessa sui settori più forti", d:"Fino al 20% su settori e regioni con il momentum migliore. È una scommessa: trovi i numeri veri in Approfondisci." });
  else if(PL.prof>=4) I.push({ e:"🏢", t:"Ti piacciono le azioni singole?", d:"Va bene, ma massimo il 10% del portafoglio: il resto sugli ETF, che sono più sicuri." });
  // vizio
  if(typeof B!=="undefined" && B.cats){ const vz=B.cats.find(c=>c.id==="vizio"); if(vz){ const mv=viceStats(vz).monthly; if(mv>5) I.push({ e:vz.e, t:`${vz.n}: ${m0(mv)} al mese`, d:`Investiti, tra 10 anni sarebbero circa ${m0(fv(mv,0,10,ps.real))}.` }); } }
  if(!I.length) return cards?[]:"";
  const C=I.slice(0,4).map(x=>`<div class="sc-crazy pli"><div class="scc-h"><span class="sc-e">${x.e}</span><div><b>${esc(x.t)}</b></div></div><p>${esc(x.d)}</p>${x.a?`<button class="add" data-p="${x.a}" ${x.v?`data-v="${x.v}"`:""}>${esc(x.b)} →</button>`:""}</div>`);
  return cards ? C : `<section><div class="sc-t sc-tt">💡 Idee</div><div class="sc-car">${C.join("")}</div></section>`;
}
function setBoost(k){
  const px=pxOf(ASSETS[k].t); if(!px) return;
  PL._boost = (PL._boost && PL._boost.k===k) ? null : { k, amt:px, label:`+1 ${shortName(ASSETS[k].t)} al mese` };
  renderPiano(); const hh=$("#futHero"); if(hh) hh.scrollIntoView({ behavior:"smooth", block:"start" });
}
function applyBoost(){
  const b=PL._boost; if(!b) return; const t=ASSETS[b.k].t;
  replay.enabled=true; replay.items=replay.items||[];
  const it=replay.items.find(i=>i.ticker===t);
  if(it) it.quote=(+it.quote||0)+1; else replay.items.push({ ticker:t, name:ASSETS[b.k].n, quote:1 });
  store.set("replay",replay); PL._boost=null; render(); renderPiano(); if(typeof renderBudget==="function") renderBudget();
  toast("Replay aggiornato: ricordati di cambiarlo anche sul broker");
}

/* ---------- pagina Piano ---------- */
let rqDraft=null;
function renderPiano(){
  const el=$("#planBody"); if(!el) return;
  if(rqDraft){ el.innerHTML=renderRiskQuiz(); return; }
  if(!PL.prof){ PL.prof=3; PL.provisional=true; plSave(); }      // finché non rispondi: Bilanciato, e te lo dico in fondo
  const p=planCompute(), ps=profStats(PL.prof), s=HS(PL.prof);
  const done=PL.hist.find(h=>h.key===cycleKeyNow());
  const nr=(replay && replay.enabled) ? nextReplay() : null;

  // 1. consiglio del mese
  const steps=[];
  if(p.toFund>0) steps.push(`Sposta <b class="num">${money(p.toFund)}</b> nel fondo emergenza (conto deposito o conto separato).`);
  if(false && p.rep.length) steps.push(`Il Replay compra da solo ${p.rep.map(r=>`<b>${r.n} × ${esc(shortName(r.t))}</b>`).join(" + ")} il ${nr?nr.date.toLocaleDateString("it-IT",{ day:"numeric", month:"long" }):"giorno previsto"} (~${money(p.repTot)}).`);
  if(p.pot>0) steps.push(`Negli acquisti uso anche <b class="num">${money(p.pot)}</b> di avanzi che avevi messo da parte.`);
  p.buys.forEach(b=>steps.push(`Compra <b>${b.n} × ${esc(shortName(b.t))}</b> a circa ${money(b.px)} (${money(b.c)}).`));
  if(p.free>0 && !p.buys.length && !p.missingPx.length && !p.skipped.length) steps.push(`${money(p.free)} non bastano per una quota intera: lasciali sul conto, si sommano al mese prossimo.`);
  if(p.satAmt>0 && !p.satBuys.length){ const r=satPicks()[0]; const px=r?(pxOf(r.t)!=null?pxOf(r.t):r.px):0;
    steps.push(`🎲 Satellite: metti da parte <b class="num">${money(p.satAmt)}</b>${r?` (accumulati ${money(p.satLeft)}: ne servono ${money(px)} per 1 quota di ${esc(SAT_U[r.t]||r.t)})`:""}.`); }
  p.satBuys.forEach(b=>steps.push(`🎲 Satellite: compra <b>${b.n} × ${esc(shortName(b.t))}</b> (${esc(b.name)}) a circa ${money(b.px)} (${money(b.c)}).`));
  if(p.left>1 && p.buys.length) steps.push(`Lascia <b class="num">${money(p.left)}</b> sul conto: si sommano al prossimo acquisto.`);
  if(p.skipped.length) steps.push(`Questo mese non compro ${p.skipped.map(k=>shortName(ASSETS[k].t)).join(", ")}: con la commissione di ${money(p.fee)} conviene accumulare e fare un ordine più grande.`);
  if(p.rebal) steps.push(`Valuta di vendere circa <b class="num">${m0(p.rebal.sell)}</b> di ${esc(shortName(ASSETS[p.rebal.k].t))} e ricomprare le altre voci (tasse 26% sulla plusvalenza).`);
  if(!steps.length) steps.push(p.S<=0 ? "Questo mese il budget non prevede risparmio: niente da investire." : "Niente da fare: va tutto bene così.");
  const mBase=steadyMonthly(p);
  let h=plMainHtml(p, mBase) + `
  <section><div class="eyebrow pl-eb">Questo mese</div><div class="card pl-steps"><ol class="steps">${steps.slice(0,3).map(x=>`<li>${x}</li>`).join("")}</ol>${steps.length>3?`<details class="why-d"><summary>Altri ${steps.length-3} passi</summary><ol class="steps" start="4">${steps.slice(3).map(x=>`<li>${x}</li>`).join("")}</ol></details>`:""}
    ${p.missingPx.length?`<p class="bnote">Prezzo non disponibile per ${p.missingPx.map(k=>shortName(ASSETS[k].t)).join(", ")}: <button class="add" data-p="px">riprova</button></p>`:""}
    <details class="why-d"><summary>Perché questi acquisti?</summary><p>${esc(p.why)} Con quello che resta compro prima le voci sotto il peso obiettivo: così il portafoglio torna in equilibrio con i versamenti, senza vendere e senza tasse. Nel backtest 2004–oggi questa regola ha tenuto il rischio vicino al profilo scelto e ha reso più del ribilanciamento annuale, che fa pagare tasse sulle vendite.</p></details>
    ${(p.buys.length || p.satBuys.length || p.satAmt>0 || p.toFund>0) ? (done ? `<div class="bdone">✅ Segnato come fatto il ${esc(fmtDateIt(done.date))}</div><button class="add" data-p="undo">Annulla</button>`
      : `<button class="btn gold" data-p="done" style="margin-top:12px">Fatto: ho comprato e messo da parte</button>`) : ""}
  </div></section>`;
  h+=boostHtml(p, mBase) + forYouHtml(p);

  h+=`<details class="deep"><summary><b>Approfondisci</b><span>scenari, come sarebbe andata, obiettivo del profilo, strumenti</span></summary>`;

  h+=satCardHtml(p);

  // 3. previsione
  const mInv=steadyMonthly(p);
  if(HIST){
    const em=engMcFor(p);
    const yrs=20, r=em ? { years:em.years, p10:em.p10, p50:em.p50, p90:em.p90 } : mcRun(PL.prof,p.totNow,mInv,yrs,600), paid=r.p50.map((_,i)=>p.totNow+mInv*12*i);
    const at=y=>({ lo:r.p10[y], mid:r.p50[y], hi:r.p90[y] });
    const g=goalInfo(PL.prof,p.totNow,mInv);
    if(g && em && em.goalProb!=null) g.prob=em.goalProb;
    h+=`<section><div class="eyebrow" style="margin:0 4px 8px">Cosa aspettarsi</div><div class="card">
      <p class="bnote" style="margin-top:0">Investendo ${m0(mInv)} al mese con il profilo ${esc(p.prof.n)}, in euro di oggi:</p>
      ${fanSvg(r,paid)}
      <div class="pleg"><span><i class="lg-mid"></i>caso tipico</span><span><i class="lg-band"></i>8 casi su 10</span><span><i class="lg-paid"></i>versato</span></div>
      <table class="ptab"><tr><th></th><th>5 anni</th><th>10 anni</th><th>20 anni</th></tr>
        <tr><td>Se va male</td>${[5,10,20].map(y=>`<td class="num">${m0(at(y).lo)}</td>`).join("")}</tr>
        <tr><td><b>Tipico</b></td>${[5,10,20].map(y=>`<td class="num"><b>${m0(at(y).mid)}</b></td>`).join("")}</tr>
        <tr><td>Se va bene</td>${[5,10,20].map(y=>`<td class="num">${m0(at(y).hi)}</td>`).join("")}</tr>
        <tr><td class="muted">Versato</td>${[5,10,20].map(y=>`<td class="num muted">${m0(paid[y])}</td>`).join("")}</tr></table>
      ${g?`<div class="pgoal ${g.prob>=.7?"ok":g.prob>=.4?"mid":"lo"}"><b>🎯 ${m0(g.G)} entro il ${g.Y}: ${Math.round(g.prob*100)}% di probabilità</b><span>${g.prob>=.7?"Sei sulla buona strada.":`Per arrivare al 70% servirebbero circa ${m0(g.need70)} al mese${g.yrs<5?" (ma con meno di 5 anni conviene un profilo più prudente)":""}.`}</span></div>`
         :`<p class="bnote">Imposta un obiettivo (importo e anno) rifacendo le domande: ti dico che probabilità hai di arrivarci.</p>`}
      ${em&&em.belowPaid?`<p class="bnote">Probabilità di valere meno di quanto hai versato: ${Object.keys(em.belowPaid).map(y=>`<b>${Math.round(em.belowPaid[y]*100)}%</b> dopo ${y} ${y==="1"?"anno":"anni"}`).join(", ")}. Il tempo è il tuo migliore alleato.</p>`:""}
      <p class="bnote">${em?`Calcolato dal motore su ${em.paths.toLocaleString("it-IT")} scenari`:`Calcolo veloce su 600 scenari${ENG.src?"":" (il motore ne fa 20.000)"}`}.</p>
      <details class="why-d"><summary>Come lo calcolo?</summary><p>Simulo i futuri possibili ripescando a blocchi di 12 mesi i rendimenti veri dal ${monthIt(HIST.from)} a ${monthIt(HIST.to)}: crisi del 2008, 2011, Covid e 2022 comprese. I rendimenti medi però li abbasso a valori prudenti (azioni ${nf2.format(FWD.SWDA*100)}% l'anno, obbligazioni ${nf2.format(FWD.AGGH*100)}%, liquidità ${nf2.format(FWD.XEON*100)}%, contro i ${nf2.format(s.cagr*100)}% storici del profilo) e tolgo un'inflazione del 2%: i numeri sono in potere d'acquisto di oggi.</p></details>
    </div></section>`;

    // 4. come sarebbe andata
    const opts=[["10y",HIST.months[Math.max(0,HIST.months.length-120)],"10 anni fa"],["2007","2007-10","ottobre 2007 (prima della crisi)"],["5y",HIST.months[Math.max(0,HIST.months.length-60)],"5 anni fa"]];
    const sel=opts.find(o=>o[0]===pastFrom)||opts[0];
    const pm=Math.max(50,Math.round(mInv/10)*10||100);
    const run=pastRun(PL.prof,pm,sel[1]);
    const cmp=[1,2,3,4,5].map(q=>({ q, ...pastRun(q,pm,sel[1]) }));
    h+=`<section><div class="eyebrow" style="margin:0 4px 8px">Come sarebbe andata</div><div class="card">
      <div class="seg" style="margin-bottom:10px">${opts.map(o=>`<button class="${o===sel?"on":""}" data-p="past" data-v="${o[0]}">${o[0]==="2007"?"Dal 2007":o[2]}</button>`).join("")}</div>
      <p class="bnote" style="margin-top:0">${m0(pm)} al mese con il profilo ${esc(p.prof.n)} da ${esc(sel[2])}, con i prezzi veri:</p>
      ${lineSvg(run)}
      <div class="pleg"><span><i class="lg-mid"></i>valore</span><span><i class="lg-paid"></i>versato</span><span><i class="lg-dot"></i>momento peggiore</span></div>
      <div class="stat-grid" style="margin-top:8px">
        <div class="stat-cell"><div class="sl">oggi varrebbe</div><div class="sv num">${m0(run.fin)}</div><div class="sl">versati ${m0(run.paid)} (${pct0(run.fin/run.paid-1)})</div></div>
        <div class="stat-cell"><div class="sl">momento peggiore</div><div class="sv num ${run.worst<1?"neg":""}">${run.worst<1?"−"+m0(run.wPaid-run.wVal):"mai sotto"}</div><div class="sl">${run.worst<1?`${monthIt(run.wAt)}: ${m0(run.wVal)} su ${m0(run.wPaid)} versati`:"il valore è sempre stato sopra il versato"}</div></div>
      </div>
      <table class="ptab" style="margin-top:12px"><tr><th>Profilo</th><th>Oggi</th><th>Peggior momento</th></tr>
        ${cmp.map(c=>`<tr class="${c.q===PL.prof?"me":""}"><td>${esc(PROFILES[c.q].n)}</td><td class="num">${m0(c.fin)}</td><td class="num ${c.worst<1?"neg":""}">${c.worst<1?pct0(c.worst-1):"mai sotto"}</td></tr>`).join("")}</table>
      <p class="bnote">Più azioni = più crescita nel lungo periodo, ma momenti peggiori più profondi: il profilo giusto è quello con cui non avresti venduto nel momento peggiore.</p>
    </div></section>`;
  }

  h+=`<section><div class="eyebrow" style="margin:0 4px 8px">Obiettivo del profilo ${esc(p.prof.n)}</div><div class="card"><div class="riskbars">`+
    p.weights.map(w=>`<div class="pw"><div class="pw-h"><span>${esc(shortName(ASSETS[w.k].t))}</span><span class="num">${Math.round(w.now)}% → <b>${w.goal}%</b></span></div><div class="pw-b"><div class="pw-now" style="width:${Math.min(100,w.now)}%"></div><div class="pw-goal" style="left:${w.goal}%"></div></div></div>`).join("")+
    `</div></div></section>`;

  // 6. profilo
  const sc=riskScore(PL.ans);
  h+= PL.provisional
    ? `<section><div class="card bplan"><div class="bw-h">🎯 Il tuo profilo è provvisorio</div><p class="bnote" style="margin-top:0">Per ora uso «Bilanciato». Con 5 domande (2 minuti) il piano diventa su misura per te.</p><button class="btn gold" data-p="redo">Rendilo su misura</button></div></section>`
    : `<section><details class="card pdet"><summary><b>Il tuo profilo: ${esc(p.prof.n)}</b> <small>perché, e come cambiarlo</small></summary>${sc?profileCardHtml(sc,PL.ans):`<p class="bnote">Il profilo arriva dal questionario vecchio: rispondi di nuovo per una spiegazione completa.</p>`}
      <div class="btn-row"><button class="btn" data-p="redo">Cambia le risposte</button><button class="btn ghost" data-p="replay">Adatta il Replay</button></div></details></section>`;

  // 7. strumenti e regole
  h+=`<section><div class="card"><div class="bw-h">ℹ️ Gli strumenti</div>`+Object.keys(p.prof.w).map(k=>`<div class="bp-row"><span><b>${esc(shortName(ASSETS[k].t))}</b> ${esc(ASSETS[k].n)}<br><small class="muted">${esc(ASSETS[k].d)} Costo ${nf2.format(ASSETS[k].ter)}% l'anno.</small></span><b class="num">${p.prof.w[k]}%</b></div>`).join("")+
    `<label class="fld" style="margin-top:12px"><span class="lab">Commissione del tuo broker per ogni acquisto (€)</span><input id="plFee" inputmode="decimal" value="${String(PL.fee||0).replace(".",",")}"></label>
    <div class="bp-row"><span>Fondo emergenza: ${money(p.fund)}</span><button class="add" data-p="fund">Correggi</button></div>
    <p class="ai-disc">Il piano applica regole fisse e trasparenti, verificate sui dati storici 2004–oggi: fondo emergenza prima, portafoglio modello per profilo, acquisti verso i pesi obiettivo, vendite solo se i pesi si staccano di oltre 10 punti. Non è consulenza finanziaria personalizzata e i rendimenti passati non garantiscono quelli futuri: la decisione finale è tua.</p></div></section>`;
  h+=`</details>`;
  el.innerHTML=h;
  loadPlanPrices(false);
  engSend(p);
  engLoad(false);
}

function renderRiskQuiz(){
  const a=rqDraft || (rqDraft=Object.assign({}, PL.ans));
  let h=`<section><div class="sec-title">Il tuo piano</div><p class="sec-sub">Poche domande con numeri veri: ne esce un portafoglio di pochi ETF a basso costo e, ogni mese, cosa fare con quello che risparmi.</p>`;
  h+=riskQHtml(a,"rq");
  if(riskScore(a)) h+=`<label class="fld" style="margin-top:14px"><span class="lab">Quanto hai già da parte come fondo emergenza (€)</span><input id="rqFund" inputmode="decimal" value="${String(PL.fund!=null?PL.fund:(typeof B!=="undefined"?num(B.ans.cash):0)).replace(".",",")}"></label>
      <button class="btn gold" data-p="saveRq">${PL.prof?"Aggiorna il piano":"Crea il piano"}</button>`;
  if(PL.prof) h+=`<button class="btn ghost" data-p="cancelRq" style="margin-top:10px">Annulla</button>`;
  return h+`</section>`;
}

/* suggerisce le quote del Replay per stare sui pesi con il budget del mese */
function suggestReplay(){
  const p=planCompute(); if(!p || p.inv<=0){ toast("Questo mese non c'è niente da investire"); return; }
  const items=[]; let left=p.inv;
  Object.keys(p.prof.w).sort((a,b)=>p.prof.w[b]-p.prof.w[a]).forEach(k=>{
    const px=pxOf(ASSETS[k].t); if(px==null) return;
    const n=Math.floor(p.inv*p.prof.w[k]/100/px);
    if(n>0 && n*px<=left){ items.push({ ticker:ASSETS[k].t, name:ASSETS[k].n, quote:n }); left-=n*px; }
  });
  if(!items.length){ toast("Importo troppo piccolo per una quota intera al mese"); return; }
  const txt=items.map(i=>i.quote+" × "+shortName(i.ticker)).join(", ");
  if(!confirm("Replay suggerito per "+eur.format(p.inv)+" al mese:\n"+txt+"\n\nAggiorno il piano Replay nell'app? (Ricordati di cambiarlo anche sul broker.)")) return;
  replay.items=items; replay.enabled=true; store.set("replay",replay); render(); renderPiano(); toast("Replay aggiornato");
}

document.addEventListener("click",e=>{
  const rq=e.target.closest("[data-rq]");
  if(rq){ rqDraft[rq.dataset.rq]=rq.dataset.v; const y=window.scrollY; renderPiano(); window.scrollTo(0,y); return; }
  const b=e.target.closest("[data-p]"); if(!b) return;
  const a=b.dataset.p;
  if(a==="saveRq"){
    const sc=riskScore(rqDraft); if(!sc) return;
    PL.fund=num($("#rqFund").value);
    PL.ans=Object.assign({}, rqDraft); PL.prof=sc.prof; rqDraft=null; mcMemo={}; plSave(); renderPiano(); if(typeof renderBudget==="function") renderBudget(); window.scrollTo(0,0); toast("Piano aggiornato");
  }
  else if(a==="cancelRq"){ rqDraft=null; renderPiano(); }
  else if(a==="redo" || a==="goal"){ if(typeof openQuiz==="function") openQuiz("rischio"); else { rqDraft=Object.assign({}, PL.ans); renderPiano(); window.scrollTo(0,0); } }
  else if(a==="px"){ loadPlanPrices(true); }
  else if(a==="past"){ pastFrom=b.dataset.v; const y=window.scrollY; renderPiano(); window.scrollTo(0,y); }
  else if(a==="fund"){ const v=prompt("Quanto hai da parte nel fondo emergenza (€)?", String(PL.fund||0).replace(".",",")); if(v!=null){ PL.fund=r2(num(v)); plSave(); renderPiano(); if(typeof renderBudget==="function") renderBudget(); } }
  else if(a==="replay"){ suggestReplay(); }
  else if(a==="surplus"){ applySurplus(b.dataset.v, b.dataset.key); }
  else if(a==="boost"){ setBoost(b.dataset.v); }
  else if(a==="boostApply"){ applyBoost(); }
  else if(a==="satOn"){ PL.sat=PL.sat||{ on:false, pct:10 }; PL.sat.on=!PL.sat.on; plSave(); renderPiano(); loadPlanPrices(true); }
  else if(a==="yr"){ PL._yr=+b.dataset.v; renderPiano(); }
  else if(a==="satPct"){ PL.sat.pct=+b.dataset.v; plSave(); renderPiano(); }
  else if(a==="engRun"){
    if(engServerOn()){ toast("Il motore sul server sta lavorando (20-30 secondi)…"); const c=engCfg();
      fetch(c.url,{ method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ token:c.token, input:planCompute()?engInput(planCompute()):undefined, holdings:holdings.map(h=>({ t:h.ticker, n:h.name })), run:"all" }) })
        .then(r=>r.json()).then(j=>{ engApply(j,"server"); renderPiano(); renderEngineSettings(); toast("Motore: fatto"); }).catch(e=>toast("Motore non raggiungibile"));
    } else if(window.GruzzoloNative && GruzzoloNative.runEngineNow){ GruzzoloNative.runEngineNow(); toast("Motore avviato sul telefono: ci mette circa un minuto"); setTimeout(()=>{ ENG.ts=0; engLoad(true).then(renderEngineSettings); },70000); }
    else toast("Collega il motore sul server nelle Impostazioni");
  }
  else if(a==="done"){
    const p=planCompute(); if(!p) return;
    addBuys(p.buys.concat(p.satBuys));
    PL.fund=r2((+PL.fund||0)+p.toFund);
    PL.hist.push({ key:cycleKeyNow(), date:new Date().toLocaleDateString("en-CA"), buys:p.buys.concat(p.satBuys).map(x=>({ t:x.t, n:x.n, px:x.px })), toFund:p.toFund, pot:p.pot, satPot:+PL.satPot||0 });
    if(p.satAmt>0) PL.satPot=r2(p.satLeft);
    if(p.buys.length) PL.pot=0;
    plSave(); renderPiano(); if(typeof renderBudget==="function") renderBudget();
    toast("Fatto! Posizioni e fondo aggiornati");
  }
  else if(a==="undo"){
    const k=cycleKeyNow(), d=PL.hist.find(h=>h.key===k); if(!d) return;
    if(!confirm("Annullo il «fatto» di questo mese? Tolgo le quote aggiunte e la quota del fondo.")) return;
    d.buys.forEach(x=>{ const hh=holdings.find(y=>y.ticker===x.t); if(!hh) return; const q=hh.qty-x.n; if(q<=0.0001) holdings=holdings.filter(y=>y!==hh); else { hh.avg=(hh.qty*hh.avg-x.n*x.px)/q; hh.qty=q; } });
    PL.fund=r2(Math.max(0,(+PL.fund||0)-d.toFund)); if(d.pot) PL.pot=r2((+PL.pot||0)+d.pot); if(d.satPot!=null) PL.satPot=d.satPot; PL.hist=PL.hist.filter(h=>h!==d);
    store.set("holdings",holdings); plSave(); render(); renderPiano(); if(typeof renderBudget==="function") renderBudget();
  }
});
document.addEventListener("change",e=>{
  if(e.target.id==="plFee"){ PL.fee=r2(num(e.target.value)); plSave(); renderPiano(); }
  if(e.target.dataset.rqi && rqDraft && e.target.closest("#planBody")){ rqDraft[e.target.dataset.rqi]=e.target.value.trim(); }
});

renderPiano();
if(typeof renderBudget==="function") renderBudget();
loadHist();
loadConf();
