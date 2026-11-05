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
    <p class="bnote" style="margin:0 0 6px">Per ${m0(M)} al mese in ETF il Replay giusto è <b>${r.items.map(i=>i.quote+" × "+esc(shortName(i.ticker))).join(" + ")}</b> ≈ ${money(r.cost)}${replay.enabled?` (oggi ${money(replayCost().total)})`:" (oggi è spento)"}.</p>
    <button class="add" data-rp="adapt">🔁 Adatta il Replay alla strategia</button>`;
}
function rpNextHtml(){
  if(!replay.enabled || !PL.prof) return "";
  const M=rpInvM(), rc=replayCost().total, rest=Math.max(0, M-rc);
  return `<span class="rp-h">nel mese</span><p class="bnote" style="margin:0">Il Replay è dentro i ${m0(M)} al mese che vanno in ETF: ${rest>=1?`il serbatoio ti fa comprare a mano solo il resto, circa <b class="num">${m0(rest)}</b>.`:"copre tutto, a mano non devi comprare niente."} Se lo cambi qui, cambialo anche su Fineco.</p>`;
}
function rpExtra(){
  const bd=document.getElementById("rBreakdown");
  if(bd){ const { lines }=replayCost();
    bd.innerHTML = replay.enabled && lines.length ? lines.map(l=>`<div class="rp-it"><b>${l.quote} × ${esc(shortName(l.ticker))}</b><small>${esc((holdings.find(h=>h.ticker===l.ticker)||{}).name||"")}</small><span class="num">${l.line!=null?money(l.line):"—"}</span></div>`).join("")
      : `<p class="bnote" style="margin:0">${replay.enabled?"Nessuna quota impostata: toccale con ⚙️.":"Replay in pausa: nessun acquisto automatico."}</p>`; }
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
  if(p) S.push({ t:"Fondo emergenza", s:p.fund>=p.target?"ok":fs>0?"go":"warn",
    d:p.fund>=p.target?`Completo: ${m0(p.fund)}, ${p.months} mesi di spese.`:fs>0?`${m0(p.fund)} di ${m0(p.target)}: ci va il ${Math.round(fs*100)}% del risparmio finché non è pieno.`:`${m0(p.fund)} di ${m0(p.target)}. Con la strategia ${pn} non lo riempio io: tienili tu sul conto.` });
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
  const rep=(replay&&replay.enabled)?(replay.items||[]).filter(i=>+i.quote>0).map(i=>({ t:i.ticker, n:+i.quote, px:pxOf(i.ticker) })).filter(i=>i.px>0):[];
  try{ if(replayPending(bStatus())) rep.forEach(r=>cur[r.t]=(cur[r.t]||0)+r.n*r.px); }catch(e){}
  const rc=rep.reduce((a,i)=>a+i.n*i.px,0), cy=cycleOf(), rows=[]; let carry=0;
  for(let i=1;i<=n;i++){
    const d=new Date(cy.s.getFullYear(), cy.s.getMonth()+i, 15);
    let toF=fund<T && fs>0 ? Math.min(T-fund, S*fs) : 0; if(rc>0 && toF>Math.max(0,S-rc)) toF=Math.max(0,S-rc); fund+=toF;
    const ipo=(PL.ipo&&PL.ipo.on)?Math.round(Math.max(0,S-toF)*(PL.ipo.pct||5))/100:0;
    rep.forEach(r=>cur[r.t]=(cur[r.t]||0)+r.n*r.px);
    let left=Math.max(0,S-toF-ipo-rc)+carry, tot=Object.values(cur).reduce((a,b)=>a+b,0); const buy={};
    for(let g=0; g<300; g++){ const ok=L.filter(x=>x.px<=left+0.001 && x.g*(tot+x.px)-(cur[x.t]||0)>-x.px/2); if(!ok.length) break;
      ok.sort((a,b)=>(b.g*(tot+b.px)-(cur[b.t]||0))-(a.g*(tot+a.px)-(cur[a.t]||0))); const x=ok[0];
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

/* al primo giro: i pezzi del Replay e i costi dell'AI */
try{ rpExtra(); }catch(e){}
try{ aiCostMount(); }catch(e){}
document.addEventListener("click",e=>{ if(e.target.closest('[data-tab="impostazioni"], #setBtn, .set-btn')) setTimeout(aiCostMount, 50); });
