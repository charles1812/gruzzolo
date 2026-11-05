/* ---------- Metodo del Portafoglio: tutto quello che lega strategia, mese, Replay e agente ----------
   - quanto costa l'AI: ogni chiamata registra i token e il costo stimato in euro (Impostazioni → Intelligenza artificiale);
   - la sezione Replay in pezzi: cosa compra da solo, se è in linea con la strategia, cosa resta da comprare a mano;
   - la strategia si conferma e resta bloccata: si cambia solo dal serbatoio del mese (⚙️ Cambia strategia);
   - il controllo del portafoglio parte da solo (agente AI con la chiave, sistema integrato senza): niente tasti;
   - il metodo in 7 passi per comporre il portafoglio, che si spunta da solo con i tuoi numeri;
   - i prossimi 12 mesi: cosa andrà sul conto, cosa compra il Replay e cosa comprerai tu, mese per mese. */

/* ---------- costi dell'AI ---------- */
// dollari per milione di token: [entrata, uscita] (listino Anthropic)
const AI_PRICE = { "claude-sonnet-5-5":[2,10], "claude-sonnet-5":[2,10], "claude-sonnet-4-6":[3,15], "claude-opus-5-5":[4,20], "claude-opus-5":[5,25],
  "claude-opus-4-8":[5,25], "claude-opus-4-7":[5,25], "claude-opus-4-6":[5,25], "claude-haiku-5-5":[0.1,0.5], "claude-haiku-4-5":[1,5], "claude-fable-5-1":[10,50], "claude-fable-5":[10,50] };
let AI_TAG = null, AI_LAST = null;
function aiPriceOf(m){ m=String(m||""); const k=Object.keys(AI_PRICE).sort((a,b)=>b.length-a.length).find(k=>m.startsWith(k)); return k?AI_PRICE[k]:null; }
function aiUsdEur(){ const r=(typeof fxLive!=="undefined" && fxLive && fxLive.rate>0.5) ? fxLive.rate : 1.1; return 1/r; }   // fxLive = dollari per 1 euro
function aiEur(v){ if(v==null) return "—"; if(v>0 && v<0.005) return "< 0,01 €"; return v.toLocaleString("it-IT",{ minimumFractionDigits:2, maximumFractionDigits:v<1?3:2 })+" €"; }
function aiCostLog(prov, model, u){
  if(!u) return null;
  const inT=u.input_tokens??u.prompt_tokens??0, outT=u.output_tokens??u.completion_tokens??0, cr=u.cache_read_input_tokens||0, cw=u.cache_creation_input_tokens||0;
  const pr=prov==="anthropic"?aiPriceOf(model):null, usd=pr?(inT*pr[0]+cr*pr[0]*0.1+cw*pr[0]*1.25+outT*pr[1])/1e6:null;
  const e={ d:new Date().toISOString(), tag:AI_TAG||"analisi AI", model:String(model||""), in:inT+cr+cw, out:outT, eur:usd!=null?+(usd*aiUsdEur()).toFixed(4):null };
  const L=store.get("aiCost",[]); L.push(e); while(L.length>300) L.shift(); store.set("aiCost",L); AI_LAST=e; aiCostMount(); return e;
}
function aiCostHtml(){
  const L=store.get("aiCost",[]), ym=new Date().toISOString().slice(0,7), sum=a=>a.reduce((s,x)=>s+(x.eur||0),0);
  const mon=L.filter(x=>x.d.slice(0,7)===ym), ctl=L.filter(x=>x.tag==="controllo portafoglio" && x.eur!=null);
  let h=`<div class="ai-cost"><div class="ai-ct">💶 Quanto spendi con l'AI</div>`;
  if(!L.length) return h+`<p class="hint" style="margin:4px 0 0">Ancora nessuna analisi AI. Ogni volta che l'agente lavora qui vedi i token usati e quanto è costato.</p></div>`;
  h+=`<div class="ai-ck"><div><small>questo mese</small><b class="num">${aiEur(sum(mon))}</b></div><div><small>in tutto</small><b class="num">${aiEur(sum(L))}</b></div><div><small>analisi</small><b class="num">${L.length}</b></div></div>`;
  if(ctl.length) h+=`<p class="hint" style="margin:6px 0 2px">Un controllo del portafoglio costa in media <b class="num">${aiEur(sum(ctl)/ctl.length)}</b>.</p>`;
  h+=`<div class="ai-cl">${L.slice(-8).reverse().map(x=>{ const d=new Date(x.d); return `<div><span>${d.toLocaleDateString("it-IT",{ day:"2-digit", month:"2-digit" })} ${d.toLocaleTimeString("it-IT",{ hour:"2-digit", minute:"2-digit" })}</span><span>${esc(x.tag)}<small>${esc(x.model.replace(/^claude-/,""))} · ${(x.in/1000).toFixed(1)}k in · ${(x.out/1000).toFixed(1)}k out</small></span><b class="num">${aiEur(x.eur)}</b></div>`; }).join("")}</div>`;
  h+=`<p class="hint" style="margin:6px 0 0">Stima con il listino Anthropic (Sonnet 5.5: 2 $ per milione di token in entrata, 10 $ in uscita, ragionamento compreso) al cambio di oggi. Il conto preciso è su console.anthropic.com.</p></div>`;
  return h;
}
function aiCostMount(){ const el=document.getElementById("aiCostBox"); if(el) el.innerHTML=aiCostHtml(); }

/* ---------- Replay: una sezione, più pezzi ---------- */
// quanto va in ETF ogni mese a regime (dopo il fondo emergenza e la riserva IPO)
function rpInvM(){
  try{ const P=modePlan(B.mode), S=Math.max(0,P.save), p=planCompute(); if(!p) return S;
    const fs=p.fund<p.target?fundShare(PL.prof,PL.cw):0, toF=Math.min(S*fs, Math.max(0,p.target-p.fund)), ipo=(PL.ipo&&PL.ipo.on)?(S-toF)*(PL.ipo.pct||5)/100:0;
    return Math.max(0, Math.round(S-toF-ipo)); }catch(e){ return 0; } }
function rpSig(items){ return (items||[]).filter(i=>+i.quote>0).map(i=>i.ticker+"×"+i.quote).sort().join(","); }
function rpPlanHtml(){
  if(!PL.prof || PL.provisional) return `<span class="rp-h">e la strategia?</span><p class="bnote" style="margin:0">Conferma una strategia: ti dico il Replay giusto.</p>`;
  const M=rpInvM(), pn=PL.prof===6?"Su misura":PROFILES[PL.prof].n; if(!(M>0)) return "";
  const r=pnReplayFor(PL.prof, M); if(!r.items.length) return "";
  if(replay.enabled && rpSig(replay.items)===rpSig(r.items)) return `<span class="rp-h">rispetto alla strategia ${esc(pn)}</span><p class="rp-ok">✓ In linea: compra le voci della strategia con i pesi giusti.</p>`;
  return `<span class="rp-h">rispetto alla strategia ${esc(pn)}</span>
    <p class="bnote" style="margin:0 0 6px">Per ${m0(M)} al mese in ETF il Replay giusto è <b>${r.items.map(i=>i.quote+" × "+esc(shortName(i.ticker))).join(" + ")}</b> ≈ ${money(r.cost)}${replay.enabled?` (oggi ${money(rpCost())})`:" (oggi è spento)"}.</p>
    <button class="add" data-rp="adapt">🔁 Adatta il Replay alla strategia</button>`;
}
function rpNextHtml(){
  if(!replay.enabled || !PL.prof) return "";
  const M=rpInvM(), rc=rpCost(), rest=Math.max(0, M-rc);
  return `<span class="rp-h">nel mese</span><p class="bnote" style="margin:0">Il Replay è dentro i ${m0(M)} al mese che vanno in ETF: ${rest>=1?`il serbatoio ti fa comprare a mano solo il resto, circa <b class="num">${m0(rest)}</b>.`:"copre tutto, a mano non devi comprare niente."} Se lo cambi qui, cambialo anche su Fineco.</p>`;
}
/* prezzo di un ETF del Replay anche se non è nelle posizioni (lo scarico una volta) */
let RP_FETCH=false;
function rpPx(t){ const p=(prices[t]&&prices[t].eur)||(typeof pxOf==="function"?pxOf(t):null); return p>0?p:null; }
function rpCost(){ return replay.enabled?(replay.items||[]).reduce((a,i)=>a+(rpPx(i.ticker)||0)*(+i.quote||0),0):0; }
function rpFetch(){ if(RP_FETCH || !replay.enabled || typeof refreshOne!=="function") return; const miss=(replay.items||[]).filter(i=>i.ticker && !(prices[i.ticker]&&prices[i.ticker].eur>0)); if(!miss.length) return;
  RP_FETCH=true; Promise.all(miss.map(i=>refreshOne({ ticker:i.ticker, avg:0, cur:"EUR" }).catch(()=>{}))).then(()=>{ try{ store.set("prices",prices); renderReplay(); mountPot(); }catch(e){} }); }
function rpExtra(){
  rpFetch();
  const bd=document.getElementById("rBreakdown"), items=(replay.items||[]).filter(i=>+i.quote>0);
  if(bd){ bd.innerHTML = replay.enabled && items.length ? items.map(l=>{ const px=rpPx(l.ticker); return `<div class="rp-it"><b>${l.quote} × ${esc(shortName(l.ticker))}</b><small>${esc(l.name||(holdings.find(h=>h.ticker===l.ticker)||{}).name||"")}</small><span class="num">${px?money(px*l.quote):"—"}</span></div>`; }).join("")
      : `<p class="bnote" style="margin:0">${replay.enabled?"Nessuna quota impostata: toccale con ⚙️.":"Replay in pausa: nessun acquisto automatico."}</p>`; }
  const sh=document.getElementById("rpShort"); if(sh) sh.textContent = replay.enabled && items.length ? items.map(i=>i.quote+" "+shortName(i.ticker)).join(" + ") : "in pausa";
  const rc=document.getElementById("rCost"), c=rpCost(); if(rc && c>0) rc.textContent=money(c);
  const pl=document.getElementById("rpPlan"); if(pl) pl.innerHTML=rpPlanHtml();
  const nx=document.getElementById("rpNext"); if(nx) nx.innerHTML=rpNextHtml();
}
if(typeof renderReplay==="function"){ const _rr=renderReplay; renderReplay=function(){ const r=_rr.apply(this, arguments); try{ rpExtra(); }catch(e){} return r; }; }

/* ---------- strategia confermata = bloccata ---------- */
if(PL.prof && !PL.provisional && PL.locked==null){ PL.locked=true; plSave(); }
function stLockHtml(){ const pn=PL.prof===6?"Su misura":PROFILES[PL.prof].n, hasK=!!(settings&&settings.anthropicKey);
  return `<div class="st-lock"><b>🔒 Strategia ${esc(pn)}</b><span>Confermata${PL.lockedAt?" il "+esc(fmtDateIt(PL.lockedAt)):""}: serbatoio, Replay e ${hasK?"agente AI":"controllo"} seguono questi pesi. Per cambiarla: serbatoio del mese → ⚙️ Cambia strategia.</span></div>`; }
if(typeof stHtml==="function"){ const _sh=stHtml; stHtml=function(){
  if(PL.locked){ STG.q=PL.prof; if(PL.prof===6 && PL.cw) STG.cw=Object.assign({}, PL.cw); }
  let h=_sh.apply(this, arguments);
  if(PL.locked) h=h.replace(/<div class="st-chips">[\s\S]*?<\/div>/, stLockHtml()).replace(/<div class="st-sl">[\s\S]*?<\/div>/, "");
  return h; }; }
if(typeof stLiveHtml==="function"){ const _sl=stLiveHtml; stLiveHtml=function(){ let h=_sl.apply(this, arguments);
  if(PL.locked) h=h.replace(">tocca per scegliere<", ">🔒 solo da guardare<"); return h; }; }
document.addEventListener("click",e=>{
  if(!PL.locked) return; const b=e.target.closest('[data-st="q"],[data-st="apply"],[data-pn="choose"],[data-pn="pick"]'); if(!b) return;
  e.stopPropagation(); e.preventDefault();
  if(b.dataset.st==="q" && +b.dataset.v===PL.prof) return;
  toast("🔒 Strategia confermata: per cambiarla apri il serbatoio del mese → ⚙️ Cambia strategia");
}, true);
document.addEventListener("click",e=>{
  const l=e.target.closest("[data-lock]"); if(l){
    if(!confirm("Vuoi cambiare strategia?\n\nLa sblocco: scegli quella nuova nella Strategia e confermala. Serbatoio, Replay e controllo seguiranno i nuovi pesi.")) return;
    PL.locked=false; plSave(); STG.q=PL.prof; if(typeof INV!=="undefined") INV=null;
    renderPiano(); mountPot(); setTimeout(()=>{ const el=document.getElementById("stTool"); if(el) el.scrollIntoView({ block:"start", behavior:"smooth" }); },60);
    toast("Strategia sbloccata: scegli e conferma"); return; }
  const r=e.target.closest("[data-rp]"); if(r && r.dataset.rp==="adapt"){
    const M=rpInvM(), x=pnReplayFor(PL.prof, M); if(!x.items.length){ toast("Prezzi non ancora caricati: riprova tra poco"); return; }
    if(!confirm(`Replay nuovo: ${x.items.map(i=>`${i.quote} × ${shortName(i.ticker)}`).join(" + ")} ≈ ${money(x.cost)} al mese.\n\nLo imposto qui. Ricordati di cambiarlo anche su Fineco.`)) return;
    replay.items=x.items; replay.enabled=true; store.set("replay",replay); if(typeof INV!=="undefined") INV=null;
    if(typeof render==="function") render(); try{ syncNativeReminders(); }catch(_){}
    toast("Replay aggiornato: "+x.items.map(i=>`${i.quote} ${shortName(i.ticker)}`).join(" + ")); }
});

/* ---------- controllo automatico (agente AI con la chiave, integrato senza) ---------- */
function rvSig(){ return PL.prof+"|"+(PL.prof===6?JSON.stringify(PL.cw||{}):""); }
if(typeof rvSave==="function"){ const _rs=rvSave; rvSave=function(R){ R.sig=rvSig(); if(R.src==="ai" && AI_LAST && Date.now()-Date.parse(AI_LAST.d)<180000) R.cost=AI_LAST.eur; return _rs.call(this, R); }; }
if(typeof rvRun==="function"){ const _rr2=rvRun; rvRun=async function(){ AI_TAG="controllo portafoglio"; try{ return await _rr2.apply(this, arguments); } finally{ AI_TAG=null; } }; }
if(typeof rvApply==="function"){ const _ra=rvApply; rvApply=function(){
  if(!confirm("L'agente propone pesi nuovi.\n\nLi confermi? La strategia diventa «Su misura» con questi pesi e resta bloccata.")) return;
  _ra.apply(this, arguments); PL.locked=true; PL.lockedAt=ymd(today0()); plSave(); const y=window.scrollY; renderPiano(); window.scrollTo(0,y); }; }
let RV_AUTO_AT=0;
function rvAuto(){
  if(!PL.prof || PL.provisional || !PL.locked || RV_BUSY || typeof B==="undefined" || !B.setup) return;
  const r=PL.review, R=r&&r.R, hasK=!!(settings && settings.anthropicKey);
  const need = !r || rvDue()<=0 || (R && R.sig!=null && R.sig!==rvSig()) || (hasK && R && R.src!=="ai");
  if(!need || Date.now()-RV_AUTO_AT<10*60000) return;
  RV_AUTO_AT=Date.now(); setTimeout(()=>{ try{ rvRun(); }catch(e){} }, 600);
}

/* ---------- il metodo: come si compone il portafoglio ---------- */
let MT_OPEN=false;
document.addEventListener("toggle",e=>{ if(e.target.id==="mtP") MT_OPEN=e.target.open; if(e.target.classList && e.target.classList.contains("fc-d")) FC_OPEN=e.target.open; }, true);
function mtHtml(){
  if(!PL.prof) return "";
  let p=null, m=null; try{ p=planCompute(); m=invMonth(); }catch(e){}
  const A=vzActual(), tn=A.tn, w=PROFILES[PL.prof].w, pn=PL.prof===6?"Su misura":PROFILES[PL.prof].n, fs=fundShare(PL.prof, PL.cw), pct=k=>tn>0?Math.round((A.now[k]||0)/tn*100):0;
  const S=[];
  const lc=liqCap(); if(p) S.push({ t:"Fondo emergenza"+(lc!=null?` · limite liquidi ${Math.round(lc*100)}%`:""), s:p.fund>=p.target?"ok":fs>0?"go":"warn",
    d:p.fund>=p.target?`Completo: ${m0(p.fund)}, ${p.months} mesi di spese.`:fs>0?`${m0(p.fund)} di ${m0(p.target)}: ci va il ${Math.round((lc!=null?Math.min(fs,lc):fs)*100)}% del risparmio finché non è pieno${lc!=null&&lc<fs?" (il tuo limite dei liquidi)":""}.`:`${m0(p.fund)} di ${m0(p.target)}. Con la strategia ${pn} non lo riempio io: tienili tu sul conto.` });
  S.push({ t:"Strategia scelta e confermata", s:PL.locked?"ok":"todo", d:PL.locked?`${pn} 🔒: i pesi non cambiano a ogni notizia.`:"Scegli i pesi nella Strategia qui sotto e conferma: poi restano fissi." });
  const core=Object.keys(w).filter(k=>ASSETS[k] && ASSETS[k].k==="az").sort((a,b)=>w[b]-w[a])[0];
  if(core) S.push({ t:"Il nucleo: un ETF su tutto il mondo", s:(A.now[core]||0)>0?"ok":"todo",
    d:`${shortName(ASSETS[core].t)} è il pezzo più grande (${w[core]}%): migliaia di aziende in una quota sola.${tn>0?` Oggi è il ${pct(core)}%.`:""}` });
  const oth=Object.keys(w).filter(k=>k!==core && w[k]>0);
  if(oth.length){ const off=tn>0?oth.filter(k=>Math.abs(pct(k)-w[k])>10):[];
    S.push({ t:"Gli altri pezzi", s:tn>0?(off.length?"go":"ok"):"todo",
      d:oth.map(k=>`${shortName(ASSETS[k].t)} ${w[k]}% (${ST_LAB[k]?ST_LAB[k].toLowerCase():ASSETS[k].n})`).join(" · ")+(off.length?`. Lontani più di 10 punti: ${off.map(k=>shortName(ASSETS[k].t)+" "+pct(k)+"%").join(", ")}; i prossimi acquisti li sistemano.`:".") }); }
  if(m) S.push({ t:"Ogni mese: Replay + serbatoio", s:m.left>0.5?"go":"ok",
    d:`${replay&&replay.enabled?`Il Replay compra da solo ${m0(replayCost().total)}; `:""}il resto lo compri tu, in quote intere, sulle voci più sotto peso. ${m.left>0.5?`Questo mese mancano ${m0(m.left)}.`:"Questo mese è fatto."}` });
  const r=PL.review, due=r?rvDue():0;
  S.push({ t:"Ogni tanto: il controllo", s:r&&due>0?"ok":"go",
    d:r?`Ultimo il ${fmtDateIt(r.date)} (${r.R.src==="ai"?"agente AI":"integrato"}), prossimo ${due>0?"tra "+due+" giorni":"adesso"}. Si vende solo se una voce si stacca di oltre 10 punti.`:"Parte da solo appena confermi la strategia." });
  const ipoOn=PL.ipo&&PL.ipo.on;
  S.push({ t:"Extra, mai oltre il 10%", s:ipoOn?"ok":"off", d:ipoOn?`Riserva IPO al ${PL.ipo.pct}% del risparmio: liquidi pronti per le quotazioni.`:"Titoli singoli, temi o IPO solo con soldi che puoi perdere, al massimo il 10%: c'è la riserva IPO più sotto." });
  const done=S.filter(x=>x.s==="ok").length, ic={ ok:"✓", go:"…", todo:"○", warn:"!", off:"–" };
  return `<details class="hud-panel mt-p" id="mtP" ${MT_OPEN?"open":""}><summary class="hud-ph"><span class="t">metodo // come si compone</span><span class="tag">${done}/${S.length} a posto ▾</span></summary>
    <p class="pn-note" style="margin:6px 0 2px">Sempre nello stesso ordine: prima la sicurezza, poi il nucleo, poi il resto. Ogni passo si spunta da solo con i tuoi numeri.</p>
    ${S.map((x,i)=>`<div class="mt-r ${x.s}"><b>${String(i+1).padStart(2,"0")}</b><div><span>${esc(x.t)}</span><small>${esc(x.d)}</small></div><i>${ic[x.s]}</i></div>`).join("")}</details>`;
}
if(typeof pnRestHtml==="function"){ const _pr=pnRestHtml; pnRestHtml=function(){ let mt=""; try{ mt=mtHtml(); }catch(e){} return mt+_pr.apply(this, arguments); }; }
if(typeof renderPiano==="function"){ const _rp=renderPiano; renderPiano=function(){ const r=_rp.apply(this, arguments);
  try{ const pg=document.getElementById("page-portafoglio"); if(pg && pg.classList.contains("active")) setTimeout(rvAuto, 800); }catch(e){} return r; }; }

/* ---------- i prossimi 12 mesi ---------- */
let FC_OPEN=false;
function fcSim(n){
  if(typeof B==="undefined" || !B.setup || !PL.prof) return null;
  let P, p; try{ P=modePlan(B.mode); p=planCompute(); }catch(e){ return null; } if(!p) return null;
  const S=Math.max(0,Math.round(P.save)), fs=fundShare(PL.prof, PL.cw), T=p.target, key=cycleOf().key;
  let fund=(+p.fund||0)+((B.fundDone||{})[key]?0:Math.max(0,p.toFund||0));
  const w=PROFILES[PL.prof].w, L=Object.keys(w).filter(k=>w[k]>0 && ASSETS[k]).map(k=>({ t:ASSETS[k].t, g:w[k]/100, px:pxOf(ASSETS[k].t) })).filter(x=>x.px>0);
  if(!L.length) return null;
  const cur={}; holdings.forEach(h=>cur[h.ticker]=(cur[h.ticker]||0)+valueOf(h));
  if(typeof INV!=="undefined" && INV) INV.L.forEach(x=>cur[x.t]=(cur[x.t]||0)+x.n*x.px);   // gli acquisti di questo mese
  const rep=(replay&&replay.enabled)?(replay.items||[]).filter(i=>+i.quote>0).map(i=>({ t:i.ticker, n:+i.quote, px:rpPx(i.ticker) })).filter(i=>i.px>0):[];
  try{ if(replayPending(bStatus())) rep.forEach(r=>cur[r.t]=(cur[r.t]||0)+r.n*r.px); }catch(e){}
  const rc=rep.reduce((a,i)=>a+i.n*i.px,0), cy=cycleOf(), rows=[], lc=liqCap(); let carry=0;
  for(let i=1;i<=n;i++){
    const d=new Date(cy.s.getFullYear(), cy.s.getMonth()+i, cy.s.getDate()+15);   // il mese che il ciclo dello stipendio copre di più
    let toF=fund<T && fs>0 ? Math.min(T-fund, S*fs) : 0; if(rc>0 && toF>Math.max(0,S-rc)) toF=Math.max(0,S-rc); if(lc!=null) toF=Math.min(toF, S*lc); fund+=toF;
    let ipo=(PL.ipo&&PL.ipo.on)?Math.round(Math.max(0,S-toF)*(PL.ipo.pct||5))/100:0; if(lc!=null) ipo=Math.min(ipo, Math.max(0,S*lc-toF));
    const xe=L.find(x=>ASSETS.XEON && x.t===ASSETS.XEON.t); let xeLeft=lc!=null?Math.max(0,S*lc-toF-ipo):Infinity;
    rep.forEach(r=>cur[r.t]=(cur[r.t]||0)+r.n*r.px);
    let left=Math.max(0,S-toF-ipo-rc)+carry, tot=Object.values(cur).reduce((a,b)=>a+b,0); const buy={};
    for(let g=0; g<300; g++){ const ok=L.filter(x=>x.px<=left+0.001 && (x!==xe || x.px<=xeLeft+0.001) && x.g*(tot+x.px)-(cur[x.t]||0)>-x.px/2); if(!ok.length) break;
      ok.sort((a,b)=>(b.g*(tot+b.px)-(cur[b.t]||0))-(a.g*(tot+a.px)-(cur[a.t]||0))); const x=ok[0]; if(x===xe) xeLeft-=x.px;
      buy[x.t]=(buy[x.t]||0)+1; left-=x.px; cur[x.t]=(cur[x.t]||0)+x.px; tot+=x.px; }
    carry=left; rows.push({ d, toF, ipo, buy, carry, full:fund>=T-0.5 });
  }
  return { rows, S, T, fund0:+p.fund||0, fs, rep, rc };
}
function fcHtml(){
  let F=null; try{ F=fcSim(12); }catch(e){} if(!F) return "";
  const q=o=>Object.entries(o).filter(([t,n])=>n>0).map(([t,n])=>`${n} ${esc(shortName(t))}`).join(" + ");
  const tot={}; F.rows.forEach(r=>Object.entries(r.buy).forEach(([t,n])=>tot[t]=(tot[t]||0)+n));
  const repTot={}; F.rep.forEach(r=>repTot[r.t]=r.n*12);
  const fundSum=F.rows.reduce((a,r)=>a+r.toF,0), ipoSum=F.rows.reduce((a,r)=>a+r.ipo,0), fullAt=F.rows.findIndex(r=>r.full);
  const fl = F.fund0>=F.T ? "Il fondo emergenza è già pieno: tutto va in ETF." : F.fs>0 ? (fullAt>=0?`Il fondo emergenza si riempie a ${F.rows[fullAt].d.toLocaleDateString("it-IT",{ month:"long" })}: da lì tutto in ETF.`:`Il fondo emergenza riceve ${m0(fundSum)} in un anno e non è ancora pieno.`) : "Con questa strategia il fondo emergenza non lo riempio io: tutto va in ETF.";
  return `<details class="fc-d" ${FC_OPEN?"open":""}><summary>📅 Prossimi 12 mesi: cosa comprerai <span class="pot-c">▾</span></summary>
    <p class="bnote" style="margin:6px 0">Con ${m0(F.S)} al mese dal Budget e i prezzi di oggi. ${fl}</p>
    <div class="fc-t">${F.rows.map(r=>`<div class="fc-r"><b>${r.d.toLocaleDateString("it-IT",{ month:"short", year:"2-digit" })}</b><span>
      ${r.toF>=1?`<em class="fc-f">🛟 ${m0(r.toF)}</em>`:""}${F.rep.length?`<em class="fc-rp">🔁 ${q(Object.fromEntries(F.rep.map(x=>[x.t,x.n])))}</em>`:""}${Object.keys(r.buy).length?`<em class="fc-b">📈 ${q(r.buy)}</em>`:""}${r.ipo>=1?`<em class="fc-i">🚀 ${m0(r.ipo)}</em>`:""}${!Object.keys(r.buy).length&&r.toF<1&&!F.rep.length?`<em>niente da comprare: si accumula</em>`:""}
      </span><small class="num">${r.carry>=1?"resta "+m0(r.carry):""}</small></div>`).join("")}</div>
    <p class="bnote" style="margin:6px 0 0"><b>In un anno:</b> ${Object.keys(repTot).length?`🔁 Replay ${q(repTot)} · `:""}📈 a mano ${q(tot)||"niente"}${fundSum>=1?` · 🛟 ${m0(fundSum)} sul conto`:""}${ipoSum>=1?` · 🚀 ${m0(ipoSum)} riserva IPO`:""}. Se cambi Budget, strategia o Replay si ricalcola.</p></details>`;
}

/* ---------- previsioni: cosa aspettarsi (allenamento senza API in tools/previsioni.py → assets/previsioni.json) ----------
   Lungo (10 anni), medio (1–6 mesi), notizie e giornaliero: numeri veri e quanto ci si può fidare. Con la chiave le scrive
   l'agente AI (campo «previsioni» della risposta), che riceve questi numeri e le ultime notizie; senza chiave le scrive il sistema integrato. */
let PREV=null; fetch("previsioni.json").then(r=>r.json()).then(j=>{ PREV=j; try{ rvMount(); }catch(e){} }).catch(()=>{});
function prvNews(){ const A=[]; try{ ((SC.news&&SC.news.items)||[]).forEach(it=>(it.articles||[]).forEach(a=>A.push({ titolo:String(a.title||"").slice(0,140), tono:a.s!=null?Math.round(a.s*100)/100:null, data:a.ts?new Date(a.ts).toISOString().slice(0,10):null, tema:it.t==="_mercati"?"mercati":shortName(it.t) }))); }catch(e){}
  A.sort((a,b)=>String(b.data).localeCompare(String(a.data))); return A.slice(0,12); }
function prvPc(x, d){ return (x>=0?"+":"−")+Math.abs(x*100).toLocaleString("it-IT",{ maximumFractionDigits:d==null?1:d })+"%"; }
function prvBuiltin(){
  const P=PREV; if(!P) return null; const L=P.lungo, M=P.medio, N=P.notizie, G=P.giorno, nw=prvNews(), tn=nw.filter(x=>x.tono!=null), tone=tn.length?tn.reduce((a,x)=>a+x.tono,0)/tn.length:null;
  return {
    lungo:`Dal 1881 i 10 anni in borsa (azioni USA, dividendi compresi, oltre l'inflazione) sono finiti in guadagno ${Math.round(L.anni10_positivi*100)} volte su 100, in media ${prvPc(L.media_reale)} l'anno. Oggi le azioni USA sono care (CAPE ${String(L.cape).replace(".",",")}): per i prossimi 10 anni aspettati meno, circa ${prvPc(L.prev_reale)} l'anno oltre l'inflazione, 8 casi su 10 tra ${prvPc(L.lo)} e ${prvPc(L.hi)}. Le azioni del resto del mondo costano meno.`,
    medio:`Su 1–6 mesi la direzione non la sa nessuno: le regole migliori battono «come al solito» di pochi punti (al massimo ${Math.round(M.skill_max*100)}%). Servono per il rischio: quando la borsa sta sotto la media degli ultimi 10 mesi i mesi brutti (sotto −5%) diventano ${Math.round(M.sotto_media10.mesi_sotto_meno5*100)} su 100 invece di ${Math.round(M.sopra_media10.mesi_sotto_meno5*100)}. Allora conta avere il fondo emergenza pieno, non vendere.`,
    notizie:N?`Le notizie raccontano quello che è già successo: il loro tono va con la borsa della stessa settimana (${N.corr_stessa>=0?"+":""}${String(N.corr_stessa).replace(".",",")}) e quasi per niente con quelle dopo (${N.corr_dopo1>=0?"+":""}${String(N.corr_dopo1).replace(".",",")}). ${tone!=null?`Il tono delle tue notizie oggi è ${tone>0.15?"positivo":tone<-0.15?"negativo":"neutro"}: non cambia il piano.`:"Non cambiano il piano."}`:null,
    breve:`Comprare e vendere ogni giorno non conviene: sull'S&P 500 dal 2010 la regola migliore avrebbe reso ${prvPc(G.spx_netto)} l'anno dopo costi e tasse, contro ${prvPc(G.spx_tieni_netto)} tenendo e basta.` };
}
if(typeof rvAiRequest==="function"){ const _rq=rvAiRequest; rvAiRequest=function(){ const q=_rq.apply(this, arguments);
  try{ const i=q.user.indexOf("{"); const d=JSON.parse(q.user.slice(i));
    if(PREV) d.previsioni_allenamento={ lungo:PREV.lungo, medio:PREV.medio, notizie:PREV.notizie, giorno:PREV.giorno };
    const nw=prvNews(); if(nw.length) d.notizie_recenti=nw;
    const lc=liqCap(); d.regole_utente={ max_liquidi_al_mese_pct:lc==null?"nessun limite":Math.round(lc*100), nota:"liquidi = fondo emergenza sul conto + liquidità XEON + riserva IPO; regola scelta dall'utente nel test" };
    q.user=q.user.slice(0,i)+JSON.stringify(d,null,1); }catch(e){}
  return q; }; }
let RV_LASTJ=null;
if(typeof rvParse==="function"){ const _pp=rvParse; rvParse=function(){ const j=_pp.apply(this, arguments); RV_LASTJ=j; return j; }; }
if(typeof rvSave==="function"){ const _rs2=rvSave; rvSave=function(R){ if(R.src==="ai" && RV_LASTJ && RV_LASTJ.previsioni && typeof RV_LASTJ.previsioni==="object") R.prev=RV_LASTJ.previsioni; return _rs2.call(this, R); }; }
function prvHtml(R){
  const ai=R && R.src==="ai" && R.prev, P=ai?R.prev:prvBuiltin(); if(!P) return "";
  const rows=[["lungo","10 anni"],["medio","1–6 mesi"],["notizie","notizie"],["breve","giorno per giorno"]].filter(([k])=>P[k]);
  return `<div class="prv"><div class="hud-label" style="margin:4px 0 4px">previsioni // cosa aspettarsi${ai?" · agente AI":" · dati veri"}</div>${rows.map(([k,l])=>`<div class="prv-r"><b>${l}</b><span>${esc(String(P[k]))}</span></div>`).join("")}</div>`;
}
if(typeof rvHtml==="function"){ const _rh=rvHtml; rvHtml=function(part){ let h=_rh.apply(this, arguments); if(part!=="dati") return h; const R=PL.review&&PL.review.R;
  let x=""; try{ x=prvHtml(R); }catch(e){} return h.replace("<!--prv-->", x); }; }

/* ---------- cosa comprare: elenco mese per mese (sotto il serbatoio) ----------
   ✋ = lo compri tu dal serbatoio · 🔁 = lo compra il Replay da solo · 🛟 = va sul conto · 🚀 = riserva IPO */
let BUY_ALL=false;
function buyHtml(){
  let F=null, m=null; try{ F=fcSim(12); m=invMonth(); }catch(e){} if(!F) return "";
  const q=o=>Object.entries(o).filter(([t,n])=>n>0).map(([t,n])=>`${n} ${esc(shortName(t))}`).join(" + "), eurOf=o=>Object.entries(o).reduce((a,[t,n])=>a+(rpPx(t)||0)*n,0);
  const repO=Object.fromEntries(F.rep.map(x=>[x.t,x.n]));
  const now=(typeof INV!=="undefined"&&INV&&INV.L)?Object.fromEntries(INV.L.filter(x=>x.n>0).map(x=>[x.t,x.n])):{}, done=m&&m.left<0.5;
  const row=(lab, sub, hand, toF, ipo, ok)=>`<div class="by-r ${ok?"ok":""}"><b>${lab}${sub?`<small>${sub}</small>`:""}</b><div>
      ${Object.keys(hand).length?`<span class="by-h">✋ ${q(hand)} <i class="num">${m0(eurOf(hand))}</i></span>`:""}
      ${F.rep.length?`<span class="by-p">🔁 ${q(repO)}</span>`:""}${toF>=1?`<span class="by-f">🛟 ${m0(toF)}</span>`:""}${ipo>=1?`<span class="by-i">🚀 ${m0(ipo)}</span>`:""}
      ${!Object.keys(hand).length&&!F.rep.length&&toF<1?`<span class="by-n">si accumula per il mese dopo</span>`:""}</div><em>${ok?"✓":""}</em></div>`;
  const mon=d=>d.toLocaleDateString("it-IT",{ month:"short" }).replace(".","");
  let p=null; try{ p=planCompute(); }catch(e){}
  let h=`<div class="card by-card"><div class="by-hd"><b>📋 Cosa comprare</b><small>✋ tu · 🔁 Replay · 🛟 conto</small></div>`;
  const c0=cycleOf(); h+=row(mon(new Date(c0.s.getFullYear(), c0.s.getMonth(), c0.s.getDate()+15)), "questo mese", done?{}:now, p?Math.max(0,p.toFund):0, p?(p.toIpo||0):0, done);
  F.rows.slice(0, BUY_ALL?12:4).forEach(r=>{ h+=row(mon(r.d), r.d.getFullYear()!==new Date().getFullYear()?String(r.d.getFullYear()):"", r.buy, r.toF, r.ipo, false); });
  h+=`<button class="add by-more" data-buy="all">${BUY_ALL?"meno mesi ▴":"tutti i 12 mesi ▾"}</button>`;
  if(BUY_ALL){ const tot={}; F.rows.forEach(r=>Object.entries(r.buy).forEach(([t,n])=>tot[t]=(tot[t]||0)+n));
    h+=`<p class="bnote" style="margin:6px 0 0"><b>In un anno</b>: ✋ ${q(tot)||"niente"}${F.rep.length?` · 🔁 ${q(Object.fromEntries(F.rep.map(x=>[x.t,x.n*12])))}`:""}. Prezzi di oggi, ${m0(F.S)} al mese dal Budget.</p>`; }
  return h+`</div>`;
}
function mountBuy(){ const el=document.getElementById("buyHost"); if(!el) return; let h=""; try{ h=buyHtml(); }catch(e){} try{ if(typeof rvHtml==="function" && PL.prof) h+=rvHtml(); }catch(e){} el.innerHTML=h; }
if(typeof mountPot==="function"){ const _mp=mountPot; mountPot=function(){ const r=_mp.apply(this, arguments); mountBuy(); return r; }; }
document.addEventListener("click",e=>{ const b=e.target.closest("[data-buy]"); if(!b) return; BUY_ALL=!BUY_ALL; mountBuy(); });

/* ---------- pagina «Agente e dati»: controllo dell'agente, previsioni, rischio, backtest, confronto, regole ---------- */
function agBtnHtml(){ return ""; }      // i consigli dell'agente stanno nel Portafoglio, subito sotto «Cosa comprare» (mountBuy)
function agRender(){
  const el=document.getElementById("agBody"); if(!el) return;
  if(PL.locked && !ST_MORE){ try{ renderPiano(); }catch(e){} }
  let h="";
  try{ h+=rvHtml("dati"); }catch(e){}
  h+= PL.locked && ST_MORE ? `<div class="hud-label" style="margin:16px 4px 4px">la tua strategia nei numeri</div><section id="stMore">${ST_MORE}</section>`
    : `<p class="bnote" style="margin:12px 4px">Mentre scegli la strategia, rischio, backtest e confronto stanno nel Portafoglio sotto le strategie.</p>`;
  h+=`<p class="pn-disc">Backtest con i rendimenti mensili veri dal 2004; previsioni allenate sui dati veri (docs/previsioni.md). Non sono previsioni certe né consulenza.</p>`;
  el.innerHTML=h;
}
function agOpen(){ DTV="agente"; showTab("dati"); if(typeof dtView==="function") dtView("agente"); window.scrollTo(0,0); }
document.addEventListener("click",e=>{ const b=e.target.closest("[data-ag]"); if(!b) return; agOpen(); });
if(typeof showTab==="function"){ const _st=showTab; showTab=function(n){ if(n==="agente"){ DTV="agente"; n="dati"; } return _st.call(this, n); }; }
const agActive=()=>{ const pg=document.getElementById("page-dati"), ag=document.getElementById("dtAgente"); return pg && pg.classList.contains("active") && ag && ag.style.display!=="none"; };
if(typeof stRefresh==="function"){ const _sr=stRefresh; stRefresh=function(){ const r=_sr.apply(this, arguments); if(agActive()) agRender(); return r; }; }
if(typeof renderPiano==="function"){ const _rp2=renderPiano; renderPiano=function(){ const y=window.scrollY, r=_rp2.apply(this, arguments); if(agActive()){ agRender(); window.scrollTo(0,y); } return r; }; }

/* al primo giro: i pezzi del Replay e i costi dell'AI */
try{ rpExtra(); }catch(e){}
try{ aiCostMount(); }catch(e){}
try{ mountBuy(); }catch(e){}
document.addEventListener("click",e=>{ if(e.target.closest('[data-tab="impostazioni"], #setBtn, .set-btn')) setTimeout(aiCostMount, 50); });
