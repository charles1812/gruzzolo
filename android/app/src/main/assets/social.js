/* ---------- Stile «social» (solo lo stile: niente di condiviso) ----------
   - saluto in base all'ora
   - storie in cima al Budget e al Portafoglio: cerchi con l'anello colorato; toccandoli si aprono a schermo intero
     come le storie (barre in alto, tocca a destra/sinistra, scorri giù per chiudere)
   - tempi relativi per i movimenti («2 ore fa») */
const ST = { list:[], i:0, t0:0, raf:0, seen:{} };
try{ ST.seen=JSON.parse(localStorage.getItem("grz_seen")||"{}"); }catch(e){}

function greet(){ const h=new Date().getHours(); return h<6?"Buonanotte 🌙":h<13?"Buongiorno ☀️":h<18?"Buon pomeriggio 🌤️":"Buonasera 🌙"; }
function relDay(d){ const t=parseYmd(d), days=dayDiff(t,today0()); if(days<0) return days===-1?"domani":`tra ${-days} giorni`; return days===0?"oggi":days===1?"ieri":days<7?`${days} giorni fa`:fDay(d); }

/* storie del Budget */
function budgetStories(st){
  const L=[], wkL=(typeof weekendList==="function")?weekendList(st):null, now=wkL&&wkL.L.find(w=>w.state!=="past");
  const sp=st.rows.find(r=>r.c.id==="spesa");
  // i quattro budget: quello che resta in ciascuno
  const GR=st.groups||[], rs=typeof roundToSum==="function"?roundToSum(GR.map(g=>Math.max(0,g.left)), Math.max(0,st.remaining)):GR.map(g=>Math.round(g.left));
  GR.forEach((g,k)=>L.push({ id:g.id, e:g.e, lab:g.n==="Tempo libero"?"Libero":g.n, v:rs[k]+" €", g:["g1","g3","g2","g5"][k%4], sec:g.id }));
  let gv=""; try{ const F=cyclePlan(st.cy.s), G=F.save||0; if(st.P.partial) gv="🌱"; else if(G>0) gv=Math.round(goalEnd(st)/G*100)+"%"; }catch(e){}
  L.push({ id:"goal", e:"🏺", lab:"Obiettivo", v:gv, g:"g4", sec:"goal" });
  return L;
  /* (prima: Replay, benzina e notizie come storie) */
  if(replay && replay.enabled){ const r=nextReplay(); L.push({ id:"replay", e:"🔁", lab:"Replay", v:r.days===0?"oggi":r.days+" gg", g:"g5", big:r.days===0?"Oggi":r.days===1?"Domani":`Tra ${r.days} giorni`, t:"Il tuo Replay",
    d:`Il ${r.date.toLocaleDateString("it-IT",{ day:"numeric", month:"long" })} compra ${replay.items.map(i=>i.quote+" "+shortName(i.ticker)).join(" + ")}${replayCost().total>0?`, circa ${money(replayCost().total)}`:""}.`, tab:"portafoglio" }); }
  if(typeof DT!=="undefined" && DT.fuel && DT.fuel.b) L.push({ id:"fuel", e:"⛽", lab:"Benzina", v:dtFmt(DT.fuel.b,2), g:"g6", big:dtFmt(DT.fuel.b,3)+" €/l", t:"Benzina self oggi",
    d:`Media di ${DT.fuel.nb.toLocaleString("it-IT")} distributori${DT.fuel.bMI?`, a Milano ${dtFmt(DT.fuel.bMI,3)}`:""}.`, tab:"dati" });
  L.push({ id:"news", e:"📰", lab:"Notizie", v:"", g:"g7", big:"📰", t:"Notizie sui tuoi investimenti", d:"Le ultime notizie dei mercati e dei tuoi ETF.", tab:"notizie" });
  return L;
}
/* storie del Portafoglio */
function pfStories(){
  const t=totals(), L=[], lv=(typeof fzLevel==="function")?fzLevel(t.val):null;
  L.push({ id:"pf", e:"📈", lab:"Valore", v:m0(t.val), g:"g1", big:money(t.val), t:"Il tuo portafoglio", d:`${t.pl>=0?"Guadagni":"Perdi"} ${money(Math.abs(t.pl))} (${t.pl>=0?"+":"−"}${Math.abs(t.pct).toFixed(1).replace(".",",")}%) su ${money(t.cost)} versati.`, go:"fzHost" });
  if(lv) L.push({ id:"lv", e:lv.cur[2], lab:"Livello", v:lv.cur[1], g:"g4", big:lv.cur[2]+" "+lv.cur[1], t:"Il tuo gruzzolo", d:lv.next?`Mancano ${m0(lv.next[0]-t.val)} per diventare ${lv.next[2]} ${lv.next[1]}.`:"Livello massimo!", go:"fzHost" });
  const dl=deltas(); if(dl.has) L.push({ id:"day", e:dl.day>=0?"🟢":"🔴", lab:"Oggi", v:(dl.day>=0?"+":"−")+m0(Math.abs(dl.day)), g:dl.day>=0?"g2":"g3", big:(dl.day>=0?"+":"−")+money(Math.abs(dl.day)), t:"Oggi in borsa", d:`In settimana ${dl.week>=0?"+":"−"}${money(Math.abs(dl.week))}.`, go:"fzHost" });
  if(typeof SC!=="undefined" && SC.data && SC.data.SPCX){ const s=SC.data.SPCX; L.push({ id:"spcx", e:"🚀", lab:"SpaceX", v:(s.d1>=0?"+":"−")+Math.abs(s.d1*100).toFixed(1).replace(".",",")+"%", g:"g6", big:"$"+s.last.toFixed(2).replace(".",","), t:"SpaceX oggi", d:`${s.d1>=0?"+":"−"}${Math.abs(s.d1*100).toFixed(1).replace(".",",")}% oggi. Nel reparto Follia trovi rischio e andamento.`, go:"scHost" }); }
  return L;
}
function storiesHtml(L, kind){
  return `<div class="stories" data-kind="${kind}">${L.map((s,i)=>`<button class="story ${!s.sec&&ST.seen[s.id]===s.v?"seen":""} ${s.g}" data-story="${i}" data-kind="${kind}"><span class="st-ring"><span class="st-in"><span class="st-e">${s.e}</span>${s.v?`<b class="num">${esc(String(s.v))}</b>`:""}</span></span><small>${esc(s.lab)}</small></button>`).join("")}</div>`;
}
/* visore delle storie */
function openStories(L, i){
  ST.list=L; ST.i=i; let v=document.getElementById("stView");
  if(!v){ v=document.createElement("div"); v.id="stView"; document.body.appendChild(v); }
  v.className="open"; stShow(); stTick();
}
function stShow(){
  const v=document.getElementById("stView"), s=ST.list[ST.i]; if(!v||!s) return;
  ST.seen[s.id]=s.v; try{ localStorage.setItem("grz_seen", JSON.stringify(ST.seen)); }catch(e){}
  v.innerHTML=`<div class="stv ${s.g}"><div class="stv-bars">${ST.list.map((_,k)=>`<i><b style="width:${k<ST.i?100:0}%" ${k===ST.i?'id="stBar"':""}></b></i>`).join("")}</div>
    <div class="stv-top"><span class="stv-av">${s.e}</span><b>${esc(s.lab)}</b><small>adesso</small><button class="stv-x" data-stv="close" aria-label="Chiudi">✕</button></div>
    <div class="stv-body"><div class="stv-e">${s.e}</div><small>${esc(s.t)}</small><div class="stv-big num">${esc(String(s.big))}</div><p>${esc(s.d)}</p></div>
    <button class="stv-go" data-stv="go">Apri ›</button>
    <div class="stv-l" data-stv="prev"></div><div class="stv-r" data-stv="next"></div></div>`;
  ST.t0=performance.now();
}
function stTick(){ cancelAnimationFrame(ST.raf); const D=5000; const step=ts=>{ const v=document.getElementById("stView"); if(!v||!v.classList.contains("open")) return;
  const k=Math.min(1,(ts-ST.t0)/D), b=document.getElementById("stBar"); if(b) b.style.width=(k*100)+"%";
  if(k>=1){ if(ST.i<ST.list.length-1){ ST.i++; stShow(); } else { closeStories(); return; } }
  ST.raf=requestAnimationFrame(step); }; ST.raf=requestAnimationFrame(step); }
function closeStories(){ const v=document.getElementById("stView"); if(v) v.className=""; cancelAnimationFrame(ST.raf);
  document.querySelectorAll(".story").forEach(el=>{ const L=el.dataset.kind==="pf"?ST.lastPf:ST.lastBud; const s=L&&L[+el.dataset.story]; if(s && ST.seen[s.id]===s.v) el.classList.add("seen"); }); }
document.addEventListener("click",e=>{
  const s=e.target.closest("[data-story]"); if(s){ const L=s.dataset.kind==="pf"?ST.lastPf:ST.lastBud; const x=L&&L[+s.dataset.story];
    if(x && x.sec && typeof openSec==="function"){ openSec(x.sec); return; }
    if(L) openStories(L, +s.dataset.story); return; }
  const a=e.target.closest("[data-stv]"); if(!a) return; const k=a.dataset.stv;
  if(k==="close") closeStories();
  else if(k==="next"){ if(ST.i<ST.list.length-1){ ST.i++; stShow(); } else closeStories(); }
  else if(k==="prev"){ if(ST.i>0){ ST.i--; stShow(); } else ST.t0=performance.now(); }
  else if(k==="go"){ const x=ST.list[ST.i]; closeStories(); if(x.tab) showTab(x.tab); else if(x.go){ const el=document.getElementById(x.go); if(el){ const y=el.getBoundingClientRect().top+window.scrollY-130; window.scrollTo({ top:y, behavior:"smooth" }); } } }
});
// scorri giù per chiudere
let stY=null; document.addEventListener("touchstart",e=>{ if(e.target.closest("#stView")) stY=e.touches[0].clientY; },{ passive:true });
document.addEventListener("touchend",e=>{ if(stY!=null && e.changedTouches[0].clientY-stY>90) closeStories(); stY=null; },{ passive:true });

/* tasto Indietro di Android */
window.grzBack=function(){
  const v=document.getElementById("stView"); if(v && v.classList.contains("open")){ closeStories(); return true; }
  const open=[...document.querySelectorAll(".scrim.open")]; if(open.length){ const o=open[open.length-1]; if(o.id==="secScrim") closeSec(); else o.classList.remove("open"); return true; }
  const info=document.querySelector(".info-modal.open"); if(info){ info.classList.remove("open"); return true; }
  const cur=document.querySelector(".page.active"); if(cur && cur.id!=="page-budget"){ showTab("budget"); return true; }
  return false;
};

/* montaggio nelle pagine */
function mountBudgetStories(st){ const h=document.getElementById("budStories"); if(!h) return; ST.lastBud=budgetStories(st); h.innerHTML=`<div class="greet">${greet()}</div>`+storiesHtml(ST.lastBud,"bud"); }
function mountPfStories(){ const h=document.getElementById("pfStories"); if(!h || !holdings.length) { if(h) h.innerHTML=""; return; } ST.lastPf=pfStories(); h.innerHTML=storiesHtml(ST.lastPf,"pf"); }
