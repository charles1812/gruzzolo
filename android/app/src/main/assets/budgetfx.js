/* ---------- Budget: parti interattive ----------
   - serbatoio liquido animato per «Puoi ancora spendere» (onde, si inclina con il telefono, tocca per un'onda)
   - cifre che salgono fino al valore nuovo
   - giorno per giorno: barre delle spese e linea del ritmo, tocca un giorno per vedere cosa hai speso
   - categorie a bolle: ogni bolla si riempie quando spendi, tocca per segnare una spesa in quella categoria */
const LQ = { level:0, target:0, t:0, raf:0, last:0, tilt:0, tiltT:0, splash:0, color:"#6FCF97", visible:true, io:null };

function lqHtml(st){
  const free=Math.max(0,st.free), frac=st.W>0?Math.max(0,Math.min(1,st.free/st.W)):0;
  LQ.target=st.free<0?0.02:frac;
  LQ.color = st.free<0 ? "#E8786A" : frac<0.15 ? "#E8786A" : frac<0.4 ? "#E0B15E" : "#6FCF97";
  return `<div class="lq" data-b="lqsplash"><canvas id="lqCanvas" aria-hidden="true"></canvas>
    <div class="lq-in"><div class="bh-lab">Puoi ancora spendere</div>
      <h1 class="total num ${st.free<0?"neg":""}" data-cu="${free.toFixed(2)}">${money(free)}</h1>
      <div class="lq-sub">${st.free>0?`circa <b class="num">${money(st.perDay)}</b> al giorno`:(st.free<0?`budget libero superato di <b class="num">${money(-st.free)}</b>`:"budget libero finito")}</div>
      ${st.P.belowFloor?`<div class="lq-warn">${st.P.partial?"Fino allo stipendio il tempo libero è sotto il minimo che avevi indicato: vai piano con le spese non necessarie.":"Per l'obiettivo pieno il tempo libero è sotto il tuo minimo: per più margine scegli «A mano» nelle Impostazioni."}</div>`:""}
      <div class="lq-pct num">${Math.round(frac*100)}% del tempo libero rimasto · <u>com'è fatto</u></div></div></div>`;
}
function lqMount(){
  const c=document.getElementById("lqCanvas"); if(!c) return;
  try{ if(LQ.io) LQ.io.disconnect(); LQ.io=new IntersectionObserver(es=>{ LQ.visible=es[0].isIntersecting; if(LQ.visible) lqLoop(); }); LQ.io.observe(c); }catch(e){}
  lqLoop();
}
function lqLoop(){ if(LQ.raf) return; const step=ts=>{ LQ.raf=0; if(!lqDraw(ts)) return; LQ.raf=requestAnimationFrame(step); }; LQ.raf=requestAnimationFrame(step); }
function lqDraw(ts){
  const c=document.getElementById("lqCanvas"); if(!c || !c.isConnected || document.hidden || !LQ.visible) return false;
  const page=c.closest(".page"); if(page && !page.classList.contains("active")) return false;
  if(LQ.last && ts-LQ.last<33) return true;
  const dt=LQ.last?Math.min(0.06,(ts-LQ.last)/1000):0; LQ.last=ts; LQ.t+=dt;
  const dpr=Math.min(2,window.devicePixelRatio||1), W=c.clientWidth, H=c.clientHeight; if(!W) return true;
  if(c.width!==Math.round(W*dpr)){ c.width=Math.round(W*dpr); c.height=Math.round(H*dpr); }
  const g=c.getContext("2d"); g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,W,H);
  LQ.level+=(LQ.target-LQ.level)*Math.min(1,dt*2.2);
  LQ.tilt+=(LQ.tiltT-LQ.tilt)*Math.min(1,dt*3); LQ.splash*=Math.pow(0.25,dt);
  // livello: la superficie media sta esattamente a level×altezza; l'inclinazione sposta i bordi al massimo di 6 px
  const base=H-H*LQ.level, amp=3+LQ.splash*14, slope=LQ.tilt*10/Math.max(1,W/2);
  const wave=(ph,a,k)=>{ g.beginPath(); g.moveTo(0,H);
    for(let x=0;x<=W;x+=6){ const y=base+(x-W/2)*slope+Math.sin(x/W*Math.PI*2*k+LQ.t*ph)*a+Math.sin(x/W*Math.PI*5+LQ.t*ph*1.7)*a*0.35; g.lineTo(x,y); }
    g.lineTo(W,H); g.closePath(); };
  const col=LQ.color;
  g.globalAlpha=0.28; g.fillStyle=col; wave(1.3,amp*1.2,1.4); g.fill();
  const grd=g.createLinearGradient(0,base-10,0,H); grd.addColorStop(0,col); grd.addColorStop(1,"rgba(20,30,32,0.2)");
  g.globalAlpha=0.55; g.fillStyle=grd; wave(-1.8,amp,1.1); g.fill();
  // bollicine
  g.globalAlpha=0.35; g.fillStyle="#fff";
  for(let i=0;i<9;i++){ const x=(i*97+40)%W, sp=12+i*3, y=H-((LQ.t*sp+i*53)%Math.max(1,H-base+10)); if(y>base+4) { g.beginPath(); g.arc(x+Math.sin(LQ.t*2+i)*3,y,1.5+(i%3),0,Math.PI*2); g.fill(); } }
  // tacca del livello sul bordo destro, alla stessa altezza della superficie, con la percentuale
  const mx=W-12, my=Math.max(10,Math.min(H-4,base+(mx-W/2)*slope));
  g.globalAlpha=0.95; g.strokeStyle="#F1EAD9"; g.lineWidth=2; g.beginPath(); g.moveTo(W-22,my); g.lineTo(W-4,my); g.stroke();
  g.fillStyle="#F1EAD9"; g.font="600 11px Inter, system-ui, sans-serif"; g.textAlign="right"; g.textBaseline="middle"; g.fillText(Math.round((Math.abs(LQ.level-LQ.target)<0.02?LQ.target:LQ.level)*100)+"%", W-26, my);
  [0.25,0.5,0.75].forEach(k=>{ const y=H-H*k; g.globalAlpha=0.35; g.beginPath(); g.moveTo(W-8,y); g.lineTo(W-2,y); g.stroke(); });
  g.globalAlpha=1;
  return true;
}
// inclina il telefono e il liquido segue
window.addEventListener("deviceorientation",e=>{ if(e.gamma!=null){ const t=Math.max(-0.6,Math.min(0.6,e.gamma/60)); LQ.tiltT=t; } });
document.addEventListener("click",e=>{ if(e.target.closest('[data-b="lqsplash"]')){ LQ.splash=1; lqLoop(); } });

/* cifre che salgono: dal valore mostrato prima a quello nuovo */
const CU_PREV={};
function countUp(root){
  (root||document).querySelectorAll("[data-cu]").forEach((el,i)=>{
    const to=+el.dataset.cu, key=el.dataset.cuk||("cu"+i), from=CU_PREV[key]!=null?CU_PREV[key]:0; CU_PREV[key]=to;
    if(Math.abs(to-from)<0.01) return;
    const t0=performance.now(), D=900, ease=x=>1-Math.pow(1-x,3);
    const step=ts=>{ const k=Math.min(1,(ts-t0)/D); el.textContent=(el.dataset.cuf==="m0"?m0:money)(from+(to-from)*ease(k)); if(k<1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

/* finestre delle sezioni: si aprono toccando i cerchi in alto */
let BX_SEC={}, BX_OPEN=null;
const SEC_T={ libero:"💸 Tempo libero", weekend:"🎉 Weekend", spesa:"🛒 Spesa e buoni pasto", ric:"🔁 Spese ricorrenti", goal:"🏺 Obiettivo di risparmio" };
function openSec(k){
  let s=document.getElementById("secScrim");
  if(!s){ s=document.createElement("div"); s.className="scrim"; s.id="secScrim";
    s.innerHTML=`<div class="sheet secsheet"><div class="sec-hd"><h2 id="secTitle"></h2><button class="sec-x" data-secx="1" aria-label="Chiudi">✕</button></div><div id="secBody"></div></div>`;
    document.body.appendChild(s);
    s.addEventListener("click",e=>{ if(e.target===s || e.target.closest("[data-secx]")) closeSec(); }); }
  BX_OPEN=k; document.getElementById("secTitle").textContent=SEC_T[k]||"";
  secRefresh(); s.querySelector(".sheet").scrollTop=0; s.classList.add("open");
}
function closeSec(){ const s=document.getElementById("secScrim"); if(s) s.classList.remove("open"); BX_OPEN=null; }
function secRefresh(){ const b=document.getElementById("secBody"), s=document.getElementById("secScrim"); if(!b||!s||!BX_OPEN) return;
  b.innerHTML=BX_SEC[BX_OPEN]||`<p class="bnote">Niente da mostrare per ora.</p>`; countUp(b); }

/* barra per saltare alle sezioni (non più usata nel Budget) */
function jumpHtml(){
  const L=[["bx-tank","🛒","Serbatoi"],["bx-wk","🎉","Weekend"],["bx-days","📅","Giorni"],["bx-cat","🫧","Categorie"],["bx-mov","🧾","Movimenti"]];
  return `<nav class="bjump" aria-label="Vai a">${L.map(([id,e,l])=>`<button data-jump="${id}" aria-label="${l}" title="${l}">${e}</button>`).join("")}</nav>`;
}
document.addEventListener("click",e=>{ const b=e.target.closest("[data-jump]"); if(!b) return; const t=document.getElementById(b.dataset.jump); if(!t) return;
  const y=t.getBoundingClientRect().top+window.scrollY-120; window.scrollTo({ top:y, behavior:"smooth" });
  document.querySelectorAll("[data-jump]").forEach(x=>x.classList.toggle("on",x===b)); });

/* giorno per giorno */
let BX_DAY=null;
function daysHtml(st){
  const start=st.P.partial?parseYmd(st.P.startDate):st.cy.s, n=dayDiff(start,st.cy.e)+1, t0=today0();
  const daily=[]; let cum=0; const cumL=[];
  for(let i=0;i<n;i++){ const d=ymd(addDays(start,i)); const v=st.T.filter(t=>t.d===d && t.type!=="in" && !catById(t.cat).sink && catById(t.cat).g!=="fisse").reduce((a,t)=>a+t.amt,0);
    daily.push({ d, v, fut:addDays(start,i)>t0 }); if(addDays(start,i)<=t0){ cum+=v; cumL.push(cum); } }
  // budget variabile del periodo (necessarie + tempo libero), da spendere in modo uniforme
  const bud=st.rows.filter(r=>!r.c.sink && (r.c.g==="necessarie"||r.c.g==="libere")).reduce((a,r)=>a+r.b,0);
  const W=340, H=150, pad=18, max=Math.max(1,...daily.map(x=>x.v)), bw=(W-pad*2)/n;
  const X=i=>pad+i*bw, Yb=v=>H-22-(H-44)*v/max, cmax=Math.max(bud,cum,1), Yc=v=>H-22-(H-44)*v/cmax;
  const sel=BX_DAY && daily.find(x=>x.d===BX_DAY) ? BX_DAY : ymd(t0);
  let bars="", lbl="";
  daily.forEach((x,i)=>{ const h=Math.max(x.v>0?2:0,(H-22)-Yb(x.v)); const isT=x.d===ymd(t0);
    bars+=`<rect x="${(X(i)+bw*0.15).toFixed(1)}" y="${(H-22-h).toFixed(1)}" width="${(bw*0.7).toFixed(1)}" height="${h.toFixed(1)}" rx="2" class="db ${x.fut?"fut":""} ${x.d===sel?"sel":""} ${isT?"today":""}"/>
      <rect x="${X(i).toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${H}" fill="transparent" data-day="${x.d}"/>`;
    const dd=parseYmd(x.d); if(i===0 || dd.getDate()===1 || i===n-1 || isT) lbl+=`<text x="${(X(i)+bw/2).toFixed(1)}" y="${H-6}" text-anchor="middle" class="${isT?"td":""}">${isT?"oggi":dd.getDate()+(i===0||dd.getDate()===1?" "+dd.toLocaleDateString("it-IT",{ month:"short" }):"")}</text>`; });
  const pace=`<line x1="${pad}" y1="${Yc(0)}" x2="${W-pad}" y2="${Yc(bud)}" class="dpace"/>`;
  const cl=cumL.map((v,i)=>`${(X(i)+bw/2).toFixed(1)},${Yc(v).toFixed(1)}`).join(" ");
  const expNow=bud*cumL.length/n, diff=cum-expNow;
  const dayT=st.T.filter(t=>t.d===sel);
  return `<section id="bx-days"><div class="card bdays"><div class="bw-h">📅 Giorno per giorno</div>
    <svg viewBox="0 0 ${W} ${H}" class="dsvg" role="img" aria-label="Spese di ogni giorno">${pace}${bars}<polyline points="${cl}" class="dcum"/>${lbl}</svg>
    <div class="dleg"><span><i class="lb"></i>spese del giorno</span><span><i class="lc"></i>totale finora</span><span><i class="lp"></i>ritmo previsto</span></div>
    <p class="bnote" style="margin:6px 0 0">${Math.abs(diff)<1?"Sei esattamente sul ritmo previsto.":diff<0?`Sei <b class="pos">${m0(-diff)} sotto</b> il ritmo previsto: bene.`:`Sei <b class="neg">${m0(diff)} sopra</b> il ritmo previsto.`}</p>
    <div class="dday"><b>${esc(fDay(sel))}</b> · ${dayT.length?`${money(dayT.filter(t=>t.type!=="in").reduce((a,t)=>a+t.amt,0))}`:"nessuna spesa"}
      ${dayT.map(t=>{ const c=catById(t.cat); return `<div class="btx-r" data-b="edit" data-v="${t.id}"><span class="bc-e">${t.type==="in"?"💶":c.e}</span><span class="btx-n">${esc(t.note||c.n)}</span><span class="num">${t.type==="in"?"+":"−"}${money(t.amt)}</span></div>`; }).join("")}</div>
    <p class="muted" style="font-size:11.5px;margin:6px 0 0">Tocca un giorno per vedere cosa hai speso. Esclusi affitto, bollette e accantonamenti.</p></div></section>`;
}
document.addEventListener("click",e=>{ const r=e.target.closest("[data-day]"); if(!r) return; BX_DAY=r.dataset.day; const s=document.getElementById("bx-days"); if(!s) return;
  const y=window.scrollY; renderBudget(); window.scrollTo(0,y); });

/* categorie a bolle */
let BX_VIEW=(()=>{ try{ return localStorage.getItem("grz_bxview")||"list"; }catch(e){ return "list"; } })();
function bubblesHtml(st){
  const R=st.rows.filter(r=>!r.c.sink && (r.c.g==="libere"||r.c.g==="necessarie") && (r.b>0.5||r.s>0));
  if(!R.length) return "";
  const W=340, maxB=Math.max(...R.map(r=>Math.max(r.c.g==="libere"?r.adj:r.b, r.s))), rr=v=>14+40*Math.sqrt(Math.max(0,v)/maxB);
  const C=R.map(r=>{ const b=r.c.g==="libere"?r.adj:r.b; return { r, b, s:r.s, rad:rr(Math.max(b,r.s)) }; }).sort((a,b)=>b.rad-a.rad);
  // impacchettamento semplice: spirale dal centro, prima posizione libera
  const P=[]; C.forEach(c=>{ for(let k=0;k<2000;k++){ const a=k*0.35, d=k*0.9, x=W/2+Math.cos(a)*d, y=Math.sin(a)*d*0.8;
      if(P.every(p=>Math.hypot(p.x-x,p.y-y)>=p.rad+c.rad+4) && x-c.rad>=2 && x+c.rad<=W-2){ c.x=x; c.y=y; P.push(c); break; } } });
  const minY=Math.min(...P.map(p=>p.y-p.rad)), maxY=Math.max(...P.map(p=>p.y+p.rad)), H=maxY-minY+8;
  P.forEach(p=>p.y-=minY-4);
  const html=P.map((p,i)=>{ const f=p.b>0?Math.min(1.15,p.s/p.b):(p.s>0?1:0), over=p.s>p.b+0.5, col=over?"var(--loss)":f>0.8?"var(--gold)":"var(--gain)";
    const top=p.y+p.rad-2*p.rad*Math.min(1,f);
    return `<g class="bub" data-bub="${p.r.c.id}" style="animation-delay:${i*40}ms"><clipPath id="bc${i}"><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.rad.toFixed(1)}"/></clipPath>
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.rad.toFixed(1)}" class="bub-bg"/>
      <rect x="${(p.x-p.rad).toFixed(1)}" y="${top.toFixed(1)}" width="${(2*p.rad).toFixed(1)}" height="${(2*p.rad).toFixed(1)}" clip-path="url(#bc${i})" fill="${col}" opacity=".5"/>
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.rad.toFixed(1)}" class="bub-ring" stroke="${col}"/>
      <text x="${p.x.toFixed(1)}" y="${(p.y-(p.rad>30?6:2)).toFixed(1)}" text-anchor="middle" font-size="${Math.min(22,p.rad*0.62).toFixed(0)}">${p.r.c.e}</text>
      ${p.rad>26?`<text x="${p.x.toFixed(1)}" y="${(p.y+p.rad*0.42).toFixed(1)}" text-anchor="middle" class="bub-t">${m0(p.s)}/${m0(p.b)}</text>`:""}</g>`; }).join("");
  return `<svg viewBox="0 0 ${W} ${H.toFixed(0)}" class="bubs" role="img" aria-label="Categorie: speso e budget">${html}</svg>
    <p class="muted" style="font-size:11.5px;margin:4px 0 0;text-align:center">Più è grande, più budget ha. Si riempie quando spendi: verde ok, oro quasi finito, rosso sforato. Tocca una bolla per segnare una spesa.</p>`;
}
document.addEventListener("click",e=>{ const b=e.target.closest("[data-bub]"); if(b){ openQuickAdd(null, b.dataset.bub); return; }
  const v=e.target.closest("[data-bxview]"); if(v){ BX_VIEW=v.dataset.bxview; try{ localStorage.setItem("grz_bxview",BX_VIEW); }catch(_){} const y=window.scrollY; renderBudget(); window.scrollTo(0,y); } });

/* dopo ogni disegno del Budget */
function budgetFx(){ lqMount(); countUp(document.getElementById("budBody"));
  // la barra delle sezioni si ferma sotto l'intestazione dell'app
  const hb=document.querySelector(".bar"), j=document.querySelector(".bjump"); if(hb && j) j.style.top=(hb.offsetHeight-2)+"px";
  // solo le icone delle sezioni che ci sono davvero
  if(j) j.querySelectorAll("[data-jump]").forEach(b=>{ b.hidden=!document.getElementById(b.dataset.jump); }); }
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) lqLoop(); });
