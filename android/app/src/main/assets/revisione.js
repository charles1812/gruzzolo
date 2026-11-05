/* ---------- Controllo del portafoglio (nel Piano, sotto la strategia) ----------
   Ogni 3 mesi, o quando vuoi, qualcuno ricontrolla se la strategia va ancora bene e cosa fare:
   - con la chiave Anthropic (Impostazioni → Intelligenza artificiale) lo fa l'agente AI: riceve portafoglio, Budget,
     prestiti, fondo emergenza, test del rischio, numeri storici dei profili e il controllo integrato, e risponde in JSON
     con sintesi, eventuali nuovi pesi, acquisti/vendite in quote intere e rischi;
   - senza chiave lo fa il sistema integrato, con le stesse regole dell'agente trader-gruzzolo:
     pesi lontani dall'obiettivo, vendite solo se i versamenti di 12 mesi non bastano a rimettere in equilibrio
     (con le tasse del 26% sulla plusvalenza stimate), fondo emergenza, peso delle rate, coerenza con il test del rischio.
   Niente ordini veri: la proposta la applichi tu (pesi → strategia «Su misura»), compri e vendi tu dalla tua banca. */
const RV_EVERY = 90;                      // giorni tra un controllo e l'altro
let RV_BUSY = false, RV_LOG = [];

function rvKeyOf(h){ const k=Object.keys(ASSETS).find(x=>ASSETS[x].t===h.ticker); return k&&ST_KEYS.includes(k)?k:(k&&ASSETS[k]&&ASSETS[k].k==="ob"?"AGGH":"SWDA"); }
function rvTarget(){ const w=(PROFILES[PL.prof]||PROFILES[3]).w; return Object.fromEntries(ST_KEYS.map(k=>[k,w[k]||0])); }
/* il controllo integrato */
function rvBuiltin(){
  const T=rvTarget(), now={}, cost={}; ST_KEYS.forEach(k=>{ now[k]=0; cost[k]=0; });
  holdings.forEach(h=>{ const k=rvKeyOf(h); now[k]+=Math.max(0,valueOf(h)); cost[k]+=Math.max(0,costOf(h)); });
  const tot=ST_KEYS.reduce((a,k)=>a+now[k],0), F=[], A=[];
  let p=null, m=null; try{ p=planCompute(); m=invMonth(); }catch(e){}
  const Minv=Math.max(0, p?(p.S-p.toFund):0), pn=PL.prof===6?"Su misura":PROFILES[PL.prof].n;
  const cur=Object.fromEntries(ST_KEYS.map(k=>[k, tot>0?now[k]/tot*100:0]));
  if(!(tot>0)) F.push({ l:"info", t:"Portafoglio ancora vuoto", d:`Parti dalla strategia ${pn}: il serbatoio del mese ti dice cosa comprare.` });
  ST_KEYS.forEach(k=>{ if(!(tot>0)) return; const d=cur[k]-T[k], px=(()=>{ const h=holdings.find(h=>rvKeyOf(h)===k && h.ticker===ASSETS[k].t); return h?priceEur(h):(typeof pxOf==="function"?pxOf(ASSETS[k].t):null); })();
    if(d>10 && T[k]>=0){
      // basta versare? quanto serve perché scenda a obiettivo + 5 punti
      const need=now[k]*100/Math.max(1,T[k]+5)-tot, months=Minv>0?need/Minv:Infinity;
      if(months>12){ const sell=now[k]-T[k]/100*tot, n=px?Math.floor(sell/px):0, gainFr=now[k]>0?Math.max(0,(now[k]-cost[k])/now[k]):0, tax=n*(px||0)*gainFr*0.26;
        F.push({ l:"warn", t:`${shortName(ASSETS[k].t)} pesa troppo: ${Math.round(cur[k])}% invece di ${T[k]}%`, d:`Con ${m0(Minv)} al mese servirebbero ${isFinite(months)?Math.ceil(months)+" mesi":"anni"} di versamenti per rimetterlo a posto: conviene vendere una parte.` });
        if(n>0) A.push({ tipo:"vendi", ticker:ASSETS[k].t, quote:n, eur:n*px, tasse:tax, motivo:`riporta ${shortName(ASSETS[k].t)} verso il ${T[k]}% (tasse stimate ${m0(tax)} sul guadagno)` }); }
      else F.push({ l:"ok", t:`${shortName(ASSETS[k].t)} sopra il peso (${Math.round(cur[k])}% su ${T[k]}%)`, d:`Si sistema da solo in ${Math.max(1,Math.ceil(months))} ${Math.ceil(months)===1?"mese":"mesi"}: i versamenti comprano le altre voci, niente vendite e niente tasse.` }); }
    else if(d<-10) F.push({ l:"info", t:`${shortName(ASSETS[k].t)} sotto il peso (${Math.round(cur[k])}% su ${T[k]}%)`, d:"I prossimi acquisti vanno prima lì." });
  });
  if(tot>0 && ST_KEYS.every(k=>Math.abs(cur[k]-T[k])<=10)) F.push({ l:"ok", t:"Pesi in equilibrio", d:`Ogni voce è entro 10 punti dall'obiettivo della strategia ${pn}: non serve vendere niente.` });
  // fuori strategia
  const out=holdings.filter(h=>!ST_KEYS.some(k=>ASSETS[k].t===h.ticker)), outV=out.reduce((a,h)=>a+Math.max(0,valueOf(h)),0);
  if(outV>0) F.push({ l:outV/Math.max(1,tot)>0.25?"warn":"info", t:`${m0(outV)} fuori dalla strategia`, d:`${out.map(h=>shortName(h.ticker)).join(", ")}: li conto come azioni mondo. ${outV/Math.max(1,tot)>0.25?"Sono più di un quarto del portafoglio: valuta di alleggerirli.":"Tienili; i nuovi soldi vanno nel modello."}` });
  // fondo emergenza, rate, test del rischio
  if(p){ if(p.fund<p.target) F.push({ l:fundShare(PL.prof)>0?"info":"warn", t:`Fondo emergenza al ${Math.round(p.fund/Math.max(1,p.target)*100)}%`, d:`${m0(p.fund)} su ${m0(p.target)} (${p.months} mesi di spese). ${fundShare(PL.prof)>0?`Ci va il ${Math.round(fundShare(PL.prof)*100)}% del risparmio finché non è pieno.`:"Con questa strategia non lo riempio io: un imprevisto ti costringerebbe a vendere in un momento brutto."}` });
    else F.push({ l:"ok", t:"Fondo emergenza completo", d:`${m0(p.fund)}: ${p.months} mesi di spese.` }); }
  try{ const P=modePlan(B.mode), net=num(B.ans.net); if(P.loanM>0) F.push({ l:P.loanM/Math.max(1,net)>0.3?"warn":"info", t:`Rate: ${m0(P.loanM)} al mese`, d:`${Math.round(P.loanM/Math.max(1,net)*100)}% dello stipendio${P.loanM/Math.max(1,net)>0.3?": oltre il 30% è tanto, meglio non alzare il rischio finché non scendono":""}.` }); }catch(e){}
  try{ const sc=riskScore(PL.ans); if(sc && PL.prof<6 && PL.prof>sc.cap) F.push({ l:"warn", t:"Più rischio di quello che dice il test", d:`Il test arriva fino a ${PROFILES[sc.cap].n}, tu hai ${pn}.` }); }catch(e){}
  // acquisti del mese (le stesse quote del serbatoio)
  try{ if(m && m.toInvest>0){ invEnsure(m.toInvest); INV.L.filter(x=>x.n>0).forEach(x=>A.push({ tipo:"compra", ticker:x.t, quote:x.n, eur:x.n*x.px, motivo:"versamento del mese verso i pesi" })); } }catch(e){}
  return { src:"integrato", sintesi:F.filter(f=>f.l==="warn").length?`${F.filter(f=>f.l==="warn").length} cose da sistemare, il resto va.`:"La strategia regge: continua con i versamenti del mese.", findings:F, azioni:A, pesi:null, rischi:[], next:RV_EVERY, cur, T, tot };
}

/* la richiesta per l'agente AI: system + dati in JSON (niente nomi né dati personali oltre ai numeri) */
function rvAiRequest(){
  const b=rvBuiltin(); let p=null, P=null; try{ p=planCompute(); P=modePlan(B.mode); }catch(e){}
  const prof={}; [1,2,3,4,5].forEach(q=>{ const s=stStats(stFrac(PROFILES[q].w)); prof[PROFILES[q].n]={ pesi:PROFILES[q].w, rendimento_annuo:s?+(s.cagr*100).toFixed(1):null, calo_peggiore:s?Math.round(s.mdd*100):null, volatilita:s?Math.round(s.vol*100):null }; });
  const sc=(()=>{ try{ return riskScore(PL.ans); }catch(e){ return null; } })();
  const data={
    strategia_attuale:{ nome:PL.prof===6?"Su misura":PROFILES[PL.prof].n, pesi:rvTarget() },
    etf_disponibili:Object.fromEntries(ST_KEYS.map(k=>[k,{ ticker:ASSETS[k].t, nome:ASSETS[k].n, ter:ASSETS[k].ter, prezzo_eur:(()=>{ const h=holdings.find(h=>h.ticker===ASSETS[k].t); const v=h?priceEur(h):(typeof pxOf==="function"?pxOf(ASSETS[k].t):null); return v?+v.toFixed(2):null; })() }])),
    posizioni:holdings.map(h=>({ ticker:h.ticker, quote:h.qty, valore_eur:Math.round(valueOf(h)), costo_eur:Math.round(costOf(h)) })),
    pesi_oggi_pct:Object.fromEntries(ST_KEYS.map(k=>[k,Math.round(b.cur[k]||0)])),
    budget_mese:P?{ stipendio_netto:Math.round(P.net), da_mettere_da_parte:Math.round(P.save), tempo_libero:Math.round(P.wants), spese:Math.round(P.needs), rate_prestiti:Math.round(P.loanM||0) }:null,
    fondo_emergenza:p?{ oggi:Math.round(p.fund), obiettivo:Math.round(p.target), quota_del_risparmio_pct:Math.round(fundShare(PL.prof)*100) }:null,
    da_investire_questo_mese:(()=>{ try{ return Math.round(invMonth().toInvest); }catch(e){ return null; } })(),
    test_rischio:sc?{ profilo_suggerito:PROFILES[sc.prof].n, massimo:PROFILES[sc.cap].n }:"non fatto",
    replay_automatico:(replay&&replay.enabled)?{ giorno:replay.dayOfMonth, costo_eur:Math.round(replayCost().total) }:null,
    profili_storico_2004_oggi:prof,
    controllo_integrato:b.findings.map(f=>f.t+": "+f.d),
  };
  const system=`Sei il trader-analista di Gruzzolo: un quant prudente che lavora per un risparmiatore italiano (non consulente abilitato).
Controlli il suo portafoglio di ETF UCITS (iShares/Xtrackers su Borsa Italiana) e dici se la strategia va ancora bene e cosa fare questo mese.
Regole: fondo emergenza prima di tutto; acquisti in quote intere verso i pesi; vendi solo se una voce si stacca di oltre 10 punti e i versamenti di 12 mesi non bastano, e indica le tasse (26% sulla plusvalenza); niente market timing né previsioni certe; considera rate dei prestiti e test del rischio; proponi pesi nuovi solo se c'è un motivo concreto, a passi di 5 e con somma 100, usando solo SWDA, EIMI, AGGH, XEON.
Rispondi SOLO con un oggetto JSON valido, in italiano semplice, senza testo prima o dopo, con questa forma:
{"sintesi":"max 3 frasi","voto":<1-10 quanto è sana la situazione>,"strategia":{"cambia":<true|false>,"pesi":{"SWDA":0,"EIMI":0,"AGGH":0,"XEON":0},"perche":"1-2 frasi"},"azioni":[{"tipo":"compra|vendi|tieni","ticker":"SWDA.MI","quote":<intero>,"motivo":"breve"}],"rischi":["max 3, brevi"],"prossimo_controllo_giorni":<30-180>}`;
  return { system, user:"Dati del portafoglio e del mese (euro):\n"+JSON.stringify(data,null,1), builtin:b };
}
function rvParse(text){ const a=text.indexOf("{"), z=text.lastIndexOf("}"); if(a<0||z<a) throw new Error("risposta senza JSON");
  const j=JSON.parse(text.slice(a,z+1)); const w=j.strategia&&j.strategia.pesi;
  if(w){ ST_KEYS.forEach(k=>w[k]=Math.max(0,Math.round((+w[k]||0)/5)*5)); const s=ST_KEYS.reduce((a,k)=>a+w[k],0); if(s!==100){ const big=ST_KEYS.slice().sort((a,b)=>w[b]-w[a])[0]; w[big]+=100-s; } }
  return j; }
/* risultato dell'AI → stesso formato del controllo integrato (più pesi e voto) */
function rvAiShow(text, builtin){
  const j=rvParse(text), b=builtin||rvBuiltin();
  const R={ src:"ai", sintesi:j.sintesi||"", voto:j.voto, findings:b.findings, rischi:(j.rischi||[]).slice(0,3), next:Math.max(30,Math.min(180,+j.prossimo_controllo_giorni||RV_EVERY)),
    pesi:j.strategia&&j.strategia.cambia&&j.strategia.pesi?j.strategia.pesi:null, perche:j.strategia&&j.strategia.perche||"",
    azioni:(j.azioni||[]).filter(a=>a&&a.ticker&&a.tipo).map(a=>({ tipo:String(a.tipo).toLowerCase(), ticker:String(a.ticker).toUpperCase().replace(/^(?!.*\.)(.+)$/,"$1.MI"), quote:Math.max(0,Math.round(+a.quote||0)), motivo:a.motivo||"" })), cur:b.cur, T:b.T, tot:b.tot };
  rvSave(R); return R; }
function rvSave(R){ PL.review={ date:ymd(today0()), R }; plSave(); rvMount(); }
async function rvRun(){
  if(RV_BUSY) return; RV_BUSY=true; RV_LOG=[]; const log=(t,tag)=>{ RV_LOG.push([new Date().toLocaleTimeString("it-IT"),tag||"AGENT",t]); rvMount(); };
  try{
    log("leggo portafoglio, Budget, prestiti e fondo emergenza","SYS");
    const hasK=!!(typeof settings!=="undefined" && settings.anthropicKey);
    if(hasK){ const q=rvAiRequest(); log("controllo integrato: "+q.builtin.findings.length+" note","SYS"); log("chiedo all'agente AI (Claude)…");
      const txt=await aiComplete(q.user, q.system, "anthropic", "claude-sonnet-5-5", "veloce"); log("risposta ricevuta, la verifico");
      rvAiShow(txt, q.builtin); toast("Controllo fatto dall'agente AI"); }
    else { log("nessuna chiave AI: uso il sistema integrato","SYS"); rvSave(rvBuiltin()); toast("Controllo fatto"); }
  }catch(e){ log("errore: "+String(e.message||e).slice(0,120),"ERR"); try{ rvSave(rvBuiltin()); log("uso il sistema integrato al suo posto","SYS"); }catch(x){} }
  RV_BUSY=false; rvMount();
}
function rvApply(){ const R=PL.review&&PL.review.R; if(!R||!R.pesi) return; PL.cw=Object.assign({}, R.pesi); stSetCustom(PL.cw); PL.prof=6; PL.provisional=false;
  if(typeof STG!=="undefined"){ STG.q=6; STG.cw=Object.assign({}, R.pesi); STG.touch=[]; } if(typeof INV!=="undefined") INV=null; plSave();
  const y=window.scrollY; renderPiano(); window.scrollTo(0,y); if(typeof mountPot==="function") mountPot(); if(typeof renderBudget==="function") renderBudget(); toast("Strategia aggiornata con i pesi proposti"); }
document.addEventListener("click",e=>{ const b=e.target.closest("[data-rv]"); if(!b) return; const a=b.dataset.rv;
  if(a==="run") rvRun(); else if(a==="apply") rvApply(); else if(a==="key") showTab("impostazioni"); });

function rvDue(){ const r=PL.review; if(!r) return 0; const d=Math.round((today0()-parseYmd(r.date))/86400000); return (r.R.next||RV_EVERY)-d; }
function rvHtml(){
  const r=PL.review, R=r&&r.R, hasK=!!(typeof settings!=="undefined" && settings.anthropicKey), due=rvDue(), late=r&&due<=0;
  const icon={ warn:["!","var(--amber)"], ok:["✓","var(--teal)"], info:["·","var(--cyan)"] };
  let h=`<section id="rvHost"><div class="hud-panel ${late?"acc-amber":"acc-violet"}" style="--i:7;margin-top:10px"><div class="hud-ph"><span class="t">controllo // agente</span><span class="tag">${hasK?"AI collegata":"sistema integrato"}</span></div>`;
  h+=`<div class="rv-top"><div><span class="hud-label">ultimo controllo</span><b>${r?esc(fmtDateIt(r.date))+" · "+(R.src==="ai"?"agente AI":"integrato"):"mai"}</b></div>
    <div><span class="hud-label">prossimo</span><b class="${late?"c-amber":""}">${!r?"adesso":late?"è ora":"tra "+due+" giorni"}</b></div>
    ${R&&R.voto?`<div><span class="hud-label">salute</span><b class="num ${R.voto>=7?"c-teal":R.voto>=5?"c-amber":"c-red"}">${R.voto}/10</b></div>`:""}</div>`;
  if(RV_BUSY || RV_LOG.length) h+=`<div class="rv-log">${RV_BUSY?`<div class="hud-act"><i></i></div>`:""}${RV_LOG.slice(-5).map(([t,g,s])=>`<div><span class="dim">${t}</span> <b class="${g==="ERR"?"c-red":g==="SYS"?"c-violet":"c-cyan"}">${g}</b> ${esc(s)}</div>`).join("")}${RV_BUSY?`<span class="rv-cur">▮</span>`:""}</div>`;
  if(R){
    h+=`<p class="rv-sum">${esc(R.sintesi)}</p>`;
    if(R.pesi){ h+=`<div class="rv-w"><div class="hud-label" style="margin-bottom:4px">pesi proposti · oggi la strategia</div>${ST_KEYS.filter(k=>R.pesi[k]>0||R.T[k]>0).map(k=>`<div class="rv-wr"><span style="color:${ST_COL[k]}">${shortName(ASSETS[k].t)}</span><i><b style="width:${R.pesi[k]}%;background:${ST_COL[k]}"></b><em style="left:${R.T[k]}%"></em></i><span class="num">${R.pesi[k]}% <small>· ${R.T[k]}%</small></span></div>`).join("")}
      ${R.perche?`<p class="pn-note">${esc(R.perche)}</p>`:""}<button class="hud-btn" data-rv="apply" style="--c:var(--amber);margin-top:6px">applica questi pesi</button></div>`; }
    if(R.azioni.length) h+=`<div class="hud-label" style="margin:10px 0 4px">cosa fare</div>${R.azioni.map(a=>`<div class="rv-a ${a.tipo}"><b>${a.tipo==="vendi"?"▼ VENDI":a.tipo==="compra"?"▲ COMPRA":"■ TIENI"}</b><span>${a.quote?a.quote+" × ":""}${esc(shortName(a.ticker))}${a.eur?` · ${m0(a.eur)}`:""}<small>${esc(a.motivo)}</small></span></div>`).join("")}`;
    h+=`<div class="hud-label" style="margin:10px 0 4px">controllo integrato</div>${R.findings.map(f=>`<div class="st-rule"><b style="color:${icon[f.l][1]}">${icon[f.l][0]}</b><div><span>${esc(f.t)}</span><small>${esc(f.d)}</small></div></div>`).join("")}`;
    if(R.rischi&&R.rischi.length) h+=`<div class="hud-label" style="margin:8px 0 4px">rischi</div>${R.rischi.map(x=>`<div class="rv-r">⚠ ${esc(x)}</div>`).join("")}`;
  }
  h+=`<div class="st-act"><button class="hud-btn" data-rv="run" style="--c:var(--violet)" ${RV_BUSY?"disabled":""}>${RV_BUSY?"controllo in corso…":hasK?"fai controllare all'agente AI":"controlla adesso"}</button>
    ${hasK?"":`<button class="add" data-rv="key">Con la chiave Anthropic lo fa l'agente AI: mettila nelle Impostazioni →</button>`}</div>
    <p class="pn-note">Le vendite e gli acquisti li fai tu dalla tua banca. Non è consulenza: l'agente propone, tu decidi.</p></div></section>`;
  return h;
}
function rvMount(){ const el=document.getElementById("rvHost"); if(el) el.outerHTML=rvHtml(); }
