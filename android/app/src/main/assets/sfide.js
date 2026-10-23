/* ---------- Sfide ----------
   Piccole sfide prese dalla vita di tutti i giorni, controllate da sole sui movimenti che segni (o che arrivano
   dalle notifiche): giorni senza spese, weekend leggero, settimana con la schiscetta, giorni senza sigarette,
   arrotondamenti, 52 settimane, tutto segnato. Quando ne vinci una prendi una medaglia e il risparmio
   lo metti con un tocco nel «da investire» del Portafoglio. */
const SF_DEF = [
  { id:"nospend", e:"🧘", t:"Giorni senza spese", d:"3 giorni a settimana senza spese di tempo libero", per:"settimana" },
  { id:"lunch",   e:"🥪", t:"Settimana schiscetta", d:"al massimo 1 pranzo comprato dal lunedì al venerdì", per:"settimana" },
  { id:"weekend", e:"🎉", t:"Weekend leggero", d:"spendi meno del 70% della tua quota del weekend", per:"weekend" },
  { id:"smoke",   e:"🚭", t:"Senza sigarette", d:"7 giorni di fila senza comprarne", per:"serie", need:"vizio" },
  { id:"round",   e:"🪙", t:"Arrotonda", d:"ogni spesa arrotondata ai 5 € successivi: la differenza la metti da parte", per:"mese" },
  { id:"log",     e:"✍️", t:"Tutto segnato", d:"almeno una spesa segnata ogni giorno per 7 giorni", per:"serie" },
  { id:"w52",     e:"📅", t:"52 settimane", d:"la settimana n metti da parte n €: 1.378 € in un anno", per:"anno" },
];
function sfState(){ B.ch=B.ch||{ on:{}, won:[], w52:[], claimed:{} }; ["on","claimed"].forEach(k=>B.ch[k]=B.ch[k]||{}); ["won","w52"].forEach(k=>B.ch[k]=B.ch[k]||[]); return B.ch; }
function sfMonday(d){ const x=new Date(d); const k=(x.getDay()+6)%7; return addDays(new Date(x.getFullYear(),x.getMonth(),x.getDate()),-k); }
function sfOut(from,to,f){ const a=ymd(from), b=ymd(to); return B.tx.filter(t=>t.type!=="in" && t.d>=a && t.d<=b && (!f || f(t))); }
const sfFree=t=>{ const c=catById(t.cat); return c.g==="libere" || t.cat==="imprevisto"; };

/* lo stato di ogni sfida adesso: avanzamento 0..1, cosa dire, se è vinta (e in quale periodo), quanto fa risparmiare */
function sfEval(id){
  const t0=today0(), mon=sfMonday(t0), daysSoFar=dayDiff(mon,t0)+1, st0=parseYmd((sfState().on[id])||ymd(t0)), from=st0>mon?st0:mon;
  if(id==="nospend"){ let n=0; for(let d=new Date(from); d<t0; d=addDays(d,1)){ if(!sfOut(d,d,sfFree).length) n++; }
    const perDay=(B.cats.filter(c=>c.g==="libere").reduce((a,c)=>a+c.plan,0))/30;
    return { p:Math.min(1,n/3), v:`${n}/3`, s:`giorni senza spese questa settimana (oggi conta da domani)`, won:n>=3, key:"w"+ymd(mon), saved:Math.round(n*perDay) }; }
  if(id==="lunch"){ if(st0>mon) return { p:0, v:"da lunedì", s:"la settimana schiscetta parte lunedì prossimo", won:false, key:"" };
    const fri=addDays(mon,4), n=sfOut(mon, t0<fri?t0:fri, t=>t.cat==="fuori"||t.cat==="pasto").length, c=B.cats.find(x=>x.id==="fuori"), each=c&&c.plan>0?Math.max(6,c.plan/8):9;
    const over=(t0.getDay()+6)%7>=5;
    return { p:n>1?0:Math.min(1,daysSoFar/5), v:`${n} ${n===1?"pranzo":"pranzi"}`, s:n>1?"troppi pranzi comprati: riprova lunedì":"comprati questa settimana (massimo 1)", won:over && n<=1, lost:n>1, key:"w"+ymd(mon), saved:Math.round(Math.max(0,4-n)*each) }; }
  if(id==="weekend"){ let st=null; try{ st=bStatus(); }catch(e){}
    const L=st&&typeof weekendList==="function"?weekendList(st):null; if(!L||!L.L.length) return { p:0, v:"—", s:"nessun weekend in questo mese", won:false, key:"" };
    const ok=L.L.filter(x=>x.sat>=st0); if(!ok.length) return { p:0, v:"da sabato", s:"parte dal prossimo weekend", won:false, key:"" };
    const w=ok.find(x=>x.state==="now") || ok.filter(x=>x.state==="past").slice(-1)[0] || ok[0], tgt=Math.max(1,w.target||w.base||1), lim=tgt*0.7;
    const done=w.state==="past";
    return { p:done? (w.spent<=lim?1:0) : Math.max(0,1-w.spent/lim), v:`${m0(w.spent)} / ${m0(lim)}`, s:done?`weekend del ${w.sat.getDate()}–${w.sun.getDate()}`:`questo weekend (${w.sat.getDate()}–${w.sun.getDate()})`, won:done && w.spent<=lim, lost:w.spent>lim, key:"k"+ymd(w.sat), saved:Math.round(Math.max(0,tgt-w.spent)) }; }
  if(id==="smoke"){ const vz=B.cats.find(c=>c.id==="vizio"); if(!vz) return null;
    const last=B.tx.filter(t=>t.cat==="vizio" && t.type!=="in").map(t=>t.d).sort().pop(), from=sfState().on.smoke||ymd(t0);
    const since=last && last>=from ? parseYmd(last) : parseYmd(from), n=Math.max(0,dayDiff(since,t0)), daily=viceStats(vz).monthly/30;
    return { p:Math.min(1,n/7), v:`${n} ${n===1?"giorno":"giorni"}`, s:n>=7?"una settimana intera!":`senza ${lc(vz.n)} (obiettivo 7)`, won:n>=7, key:"s"+ymd(since), saved:Math.round(n*daily) }; }
  if(id==="round"){ const s=sfOut(new Date(t0.getFullYear(),t0.getMonth(),1), t0).reduce((a,t)=>a+(Math.ceil(t.amt/5)*5-t.amt),0), key="m"+ymd(t0).slice(0,7);
    const got=+sfState().claimed["round_"+key]||0, left=Math.round((s-got)*100)/100;
    return { p:Math.min(1,s/20), v:money(s), s:got?`da arrotondamenti questo mese · ${m0(got)} già da investire`:"da arrotondamenti questo mese", won:false, key, saved:left, claimable:left>=1 }; }
  if(id==="log"){ let n=0; const lim=Math.min(60,dayDiff(st0,t0)+1); for(let i=0;i<lim;i++){ const d=ymd(addDays(t0,-i)); if(B.tx.some(t=>t.d===d)) n++; else if(i>0) break; }
    return { p:Math.min(1,n/7), v:`${n} ${n===1?"giorno":"giorni"}`, s:"di fila con almeno una spesa segnata", won:n>=7, key:"l"+ymd(addDays(t0,-n+1)), saved:0 }; }
  if(id==="w52"){ const L=sfState().w52, n=L.length, tot=L.reduce((a,x)=>a+x.n,0);
    const doneWk=n && sfMonday(parseYmd(L[n-1].d)).getTime()===mon.getTime();
    return { p:Math.min(1,n/52), v:`${n}/52`, s:`settimane fatte · ${m0(tot)} messi da parte${doneWk?" · fatta questa settimana":""}`, won:n>=52, key:"y", saved:tot, next:n+1, doneWk }; }
  return null;
}
function sfCheckWins(){
  const S=sfState(); let nw=null;
  Object.keys(S.on).forEach(id=>{ const r=sfEval(id); if(!r||!r.won||!r.key) return; if(S.won.some(w=>w.id===id && w.key===r.key)) return;
    S.won.push({ id, key:r.key, d:ymd(today0()), saved:r.saved||0 }); nw={ id, r }; });
  if(nw){ bSave(); const D=SF_DEF.find(x=>x.id===nw.id); setTimeout(()=>{ toast(`🏅 Sfida vinta: ${D.t}${nw.r.saved?` · ${m0(nw.r.saved)} risparmiati`:""}`); sfConfetti(); },300); }
}
function sfConfetti(){
  const c=document.createElement("canvas"); c.className="sf-conf"; document.body.appendChild(c); const g=c.getContext("2d"), W=c.width=innerWidth, H=c.height=innerHeight;
  const P=Array.from({length:120},(_,k)=>({ x:W/2+(Math.random()-.5)*80, y:H*.35, vx:(Math.random()-.5)*9, vy:-(4+Math.random()*7), r:Math.random()*6, c:["#E0B15E","#f6d58a","#6FCF97","#8FA0E0","#D98BA6"][k%5] }));
  let f=0; const step=()=>{ g.clearRect(0,0,W,H); P.forEach(p=>{ p.vy+=.25; p.x+=p.vx; p.y+=p.vy; p.r+=.1; g.save(); g.translate(p.x,p.y); g.rotate(p.r); g.fillStyle=p.c; g.fillRect(-4,-2,8,4); g.restore(); });
    if(++f<110) requestAnimationFrame(step); else c.remove(); }; requestAnimationFrame(step);
}

function renderSfide(){
  const el=document.getElementById("sfBody"); if(!el) return;
  if(typeof B==="undefined" || !B.setup){ el.innerHTML=`<section><div class="card"><p class="bnote">Rispondi prima alle domande del Budget: le sfide si basano sulle tue spese.</p></div></section>`; return; }
  const S=sfState();
  if(!S.init){ S.init=1; ["nospend","lunch","round"].forEach(id=>S.on[id]=ymd(today0())); if(B.cats.some(c=>c.id==="vizio")) S.on.smoke=ymd(today0()); bSave(); }
  sfCheckWins();
  const act=SF_DEF.filter(d=>S.on[d.id] && (!d.need || B.cats.some(c=>c.id===d.need)));
  const off=SF_DEF.filter(d=>!S.on[d.id] && (!d.need || B.cats.some(c=>c.id===d.need)));
  const savedAll=S.won.reduce((a,w)=>a+(w.saved||0),0), medals=new Set(S.won.map(w=>w.id)).size, lg=sfEval("log");
  let h=`<section><div class="card fz sf-hero"><div class="fz-top"><div class="fz-val"><small>Le tue sfide</small><b class="num">${m0(savedAll)}</b><span><i>risparmiati vincendo le sfide</i></span></div>
      <div class="sf-hk"><div><b>🏅 ${S.won.length}</b><small>vinte</small></div><div><b>🔥 ${lg?lg.v.split(" ")[0]:0}</b><small>giorni di fila</small></div></div></div>
    <div class="sf-medals">${SF_DEF.map(d=>`<span class="sf-m ${S.won.some(w=>w.id===d.id)?"on":""}" title="${esc(d.t)}">${d.e}</span>`).join("")}</div>
    <p class="pn-note">${medals?`${medals} ${medals===1?"medaglia":"medaglie"} su ${SF_DEF.length}.`:"Vinci una sfida per la prima medaglia."} Le sfide si controllano da sole con le spese che segni.</p></div></section>`;
  h+=`<section><div class="sc-t sc-tt">⚡ In corso</div><div class="sf-list">${act.map(d=>{ const r=sfEval(d.id); if(!r) return "";
      const won=S.won.some(w=>w.id===d.id && w.key===r.key), dash=2*Math.PI*22, pct=Math.max(0,Math.min(1,won?1:r.p));
      const claimKey=d.id+"_"+r.key, canClaim=(won && r.saved>0 && !S.claimed[claimKey]) || r.claimable;
      return `<div class="sf-c ${won?"won":r.lost?"lost":""}"><svg viewBox="0 0 54 54" class="sf-ring"><circle cx="27" cy="27" r="22" class="sf-rb"/><circle cx="27" cy="27" r="22" class="sf-rf" stroke-dasharray="${(dash*pct).toFixed(1)} ${dash.toFixed(1)}"/><text x="27" y="32" text-anchor="middle">${d.e}</text></svg>
        <div class="sf-t"><b>${esc(d.t)}</b><span class="num">${won?"✓ vinta":esc(r.v)} <small>${esc(r.s)}</small></span>${r.saved>0&&d.id!=="w52"?`<em>${won?"hai risparmiato":"finora"} ${r.saved<10?money(r.saved):m0(r.saved)}</em>`:""}
          ${canClaim?`<button class="add" data-sf="claim" data-v="${d.id}" data-k="${esc(r.key)}" data-a="${r.saved}">🐖 Metti ${r.saved<10?money(r.saved):m0(r.saved)} da investire</button>`:""}
          ${d.id==="w52"&&!r.won&&!r.doneWk?`<button class="add" data-sf="w52" data-v="${r.next}">Fatto: messi da parte ${r.next} € questa settimana</button>`:""}</div>
        <button class="sf-x" data-sf="off" data-v="${d.id}" aria-label="Chiudi la sfida">✕</button></div>`; }).join("")||`<p class="bnote">Nessuna sfida attiva: scegline una qui sotto.</p>`}</div></section>`;
  if(off.length) h+=`<section><div class="sc-t sc-tt">➕ Altre sfide</div><div class="sc-car">${off.map(d=>`<div class="sc-crazy sf-new"><div class="scc-h"><span class="sc-e">${d.e}</span><div><b>${esc(d.t)}</b><small>ogni ${d.per}</small></div></div><p>${esc(d.d)}</p><button class="btn gold" data-sf="on" data-v="${d.id}">Inizia</button></div>`).join("")}</div></section>`;
  const W=S.won.slice(-6).reverse();
  if(W.length) h+=`<section><div class="sc-t sc-tt">🏅 Vinte di recente</div><div class="card sf-won">${W.map(w=>{ const d=SF_DEF.find(x=>x.id===w.id)||{e:"🏅",t:w.id}; return `<div class="bp-row"><span>${d.e} ${esc(d.t)} <small class="muted">${esc(fDay(w.d))}</small></span><b class="num pos">${w.saved?"+"+m0(w.saved):"✓"}</b></div>`; }).join("")}</div></section>`;
  el.innerHTML=h;
}
document.addEventListener("click",e=>{ const b=e.target.closest("[data-sf]"); if(!b) return; const S=sfState(), a=b.dataset.sf, id=b.dataset.v;
  if(a==="on"){ S.on[id]=ymd(today0()); toast("Sfida iniziata: in bocca al lupo!"); }
  else if(a==="off"){ const D=SF_DEF.find(x=>x.id===id); if(!confirm(`Chiudere la sfida «${D?D.t:id}»? Le medaglie vinte restano.`)) return; delete S.on[id]; toast("Sfida chiusa: la ritrovi in «Altre sfide»"); }
  else if(a==="claim"){ const amt=+b.dataset.a||0; PL.pot=r2((+PL.pot||0)+amt); plSave(); const ck=id+"_"+b.dataset.k; S.claimed[ck]=id==="round"?r2((+S.claimed[ck]||0)+amt):1; toast(`🐖 ${money(amt)} da investire: li trovi nel Portafoglio`); if(typeof mountPot==="function") mountPot(); }
  else if(a==="w52"){ const r=sfEval("w52"); if(r.doneWk) return; S.w52.push({ n:+id, d:ymd(today0()) }); PL.pot=r2((+PL.pot||0)+(+id)); plSave(); toast(`${id} € messi da parte: settimana ${S.w52.length} di 52`); }
  bSave(); renderSfide(); });
(function(){ const st=window.showTab; if(typeof st!=="function") return; window.showTab=function(n){ const r=st.apply(this, arguments); if(n==="sfide") renderSfide(); return r; }; })();
