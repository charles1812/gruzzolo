/* ---------- IPO future: aziende che potrebbero entrare in borsa (sezione sotto la Follia) ----------
   La riserva (soldi messi da parte ogni mese) è stata tolta il 05/11/2026: resta solo l'elenco da seguire con le notizie.
   Il codice della riserva qui sotto resta per chi l'aveva accesa (PL.ipo.on viene spento all'avvio). ----------
   (vecchia descrizione) Riserva IPO: soldi liquidi per comprare aziende quando entrano in borsa ----------
   Anthropic, OpenAI, SpaceX… oggi non sono quotate: un privato in Italia non può comprarle. Quando (e se) si quotano,
   di solito le compri dal primo giorno di borsa (Nasdaq/NYSE) dalla tua banca, come un'azione qualsiasi.
   La riserva tiene da parte una percentuale del risparmio di ogni mese (PL.ipo.pct, dopo il fondo emergenza),
   sul conto o in liquidità (XEON): niente prodotti «pre-IPO» o token che promettono quote, quasi sempre costosi o truffe.
   PL.ipo = { on, pct, saved, watch:[id], done:{ ciclo:importo } } */
const IPO_LIST = [
  { id:"anthropic", n:"Anthropic", e:"🤖", s:"AI · Claude" },
  { id:"openai", n:"OpenAI", e:"🧠", s:"AI · ChatGPT" },
  { id:"spacex", n:"SpaceX", e:"🚀", s:"spazio · Starlink" },
  { id:"stripe", n:"Stripe", e:"💳", s:"pagamenti" },
  { id:"databricks", n:"Databricks", e:"🧱", s:"dati e AI per aziende" },
  { id:"revolut", n:"Revolut", e:"🏦", s:"banca digitale" },
];
function ipoState(){ PL.ipo=PL.ipo||{ on:false, pct:5, saved:0, watch:["anthropic"], done:{} }; PL.ipo.done=PL.ipo.done||{}; PL.ipo.watch=PL.ipo.watch||[]; return PL.ipo; }
function ipoHtml(){
  const I=ipoState(); let p=null; try{ p=planCompute(); }catch(e){}
  const month=p?(p.toIpo||0):0, w=I.watch.map(id=>IPO_LIST.find(x=>x.id===id)).filter(Boolean);
  let h=`<section id="ipoHost"><div class="hud-panel ${I.on?"acc-violet":"acc-dim"}" style="--i:8;margin-top:10px"><div class="hud-ph"><span class="t">riserva // ipo</span><span class="tag">${I.on?"attiva":"spenta"}</span></div>
    <div class="ipo-top"><div><span class="hud-label">da parte</span><b class="num c-violet">${m0(I.saved||0)}</b></div><div><span class="hud-label">questo mese</span><b class="num">${I.on?m0(month):"—"}</b></div>
      <div class="switch" style="border:none;padding:0;margin-left:auto"><div class="toggle ${I.on?"on":""}" data-ipo="on" aria-label="Riserva IPO"></div></div></div>
    <p class="pn-note" style="margin-top:6px">Aziende che potrebbero entrare in borsa. Finché non sono quotate non le puoi comprare: tieni da parte una parte del risparmio, liquida, e la usi il giorno del debutto.</p>`;
  if(I.on) h+=`<div class="hud-label" style="margin:8px 0 4px">quanto del risparmio del mese (dopo il fondo emergenza)</div><div class="ipo-pct">${[5,10,15,20].map(v=>`<button class="${(I.pct||5)===v?"on":""}" data-ipo="pct" data-v="${v}">${v}%</button>`).join("")}</div>`;
  h+=`<div class="hud-label" style="margin:10px 0 4px">da seguire · tocca per aggiungere o togliere</div><div class="ipo-list">${IPO_LIST.map(c=>{ const on=I.watch.includes(c.id);
      return `<div class="ipo-c ${on?"on":""}"><button data-ipo="watch" data-v="${c.id}"><span>${c.e}</span><b>${esc(c.n)}</b><small>${esc(c.s)} · non quotata</small></button>${on?`<a class="ipo-n" href="https://news.google.com/search?q=${encodeURIComponent(c.n+" IPO")}&hl=it&gl=IT&ceid=IT:it" target="_blank" rel="noopener">notizie ↗</a>`:""}</div>`; }).join("")}</div>`;
  h+=`<div class="st-act">${(I.saved||0)>0?`<button class="hud-btn" data-ipo="use" style="--c:var(--amber)">${w.length?"è quotata: ":""}usa la riserva (${m0(I.saved)})</button>`:""}<button class="add" data-ipo="edit">Correggi quanto hai da parte</button></div>
    <p class="pn-note">Tienila sul conto o in XEON. Le prime settimane dopo una quotazione possono salire o scendere del 30-50%: compra a piccoli pezzi e non più di una quota piccola del portafoglio. Niente prodotti «pre-IPO» o token: non sono le azioni vere.</p></div></section>`;
  return h;
}
function ipoMount(){ const el=document.getElementById("ipoHost"); if(el) el.outerHTML=ipoHtml(); }
function ipoAfter(){ plSave(); if(typeof INV!=="undefined") INV=null; ipoMount(); if(typeof mountPot==="function") mountPot(); }
document.addEventListener("click",e=>{ const b=e.target.closest("[data-ipo]"); if(!b) return; const I=ipoState(), a=b.dataset.ipo;
  if(a==="on"){ I.on=!I.on; toast(I.on?`Riserva IPO attiva: il ${I.pct}% del risparmio resta liquido`:"Riserva IPO spenta"); }
  else if(a==="pct"){ I.pct=+b.dataset.v; }
  else if(a==="watch"){ const v=b.dataset.v; I.watch=I.watch.includes(v)?I.watch.filter(x=>x!==v):I.watch.concat(v); }
  else if(a==="edit"){ const v=prompt("Quanto hai da parte per le IPO (€)?", String(I.saved||0).replace(".",",")); if(v==null) return; I.saved=r2(Math.max(0,num(v))); }
  else if(a==="use"){ if(!confirm(`Sposto ${m0(I.saved)} della riserva tra i soldi da investire del Portafoglio?`)) return; PL.pot=r2((+PL.pot||0)+(I.saved||0)); toast(`${m0(I.saved)} pronti da investire`); I.saved=0; }
  ipoAfter(); });

/* riserva spenta per tutti: niente scomparto nel serbatoio, niente quota del risparmio */
(function(){ const I=ipoState(); if(I.on){ I.on=false; plSave(); } })();
const IPO_INFO = { anthropic:"Valutazione privata oltre i 100 miliardi; nessuna data ufficiale.", openai:"Struttura in trasformazione verso una società a scopo di lucro; quotazione solo ipotizzata.",
  spacex:"Le azioni girano solo tra investitori privati; Starlink potrebbe quotarsi per prima.", stripe:"Rimanda la quotazione da anni; vende azioni ai dipendenti in giri privati.",
  databricks:"Grandi round privati; quotazione attesa ma senza data.", revolut:"Ha la licenza bancaria in UK; si parla di quotazione a Londra o New York." };
function ipoFutHtml(){
  const I=ipoState();
  return `<div class="card sc-crazy-wrap ipo-fut"><div class="sc-t">🚀 IPO future</div>
    <p class="bnote" style="margin:2px 0 8px">Aziende che potrebbero entrare in borsa. Oggi non si possono comprare: quando si quotano le trovi come un'azione qualsiasi. Niente prodotti «pre-IPO» o token: non sono le azioni vere.</p>
    ${IPO_LIST.map(c=>`<a class="ipo-f" href="https://news.google.com/search?q=${encodeURIComponent(c.n+" IPO")}&hl=it&gl=IT&ceid=IT:it" target="_blank" rel="noopener"><span class="ipo-e">${c.e}</span><span class="ipo-t"><b>${esc(c.n)}</b><small>${esc(c.s)} · ${esc(IPO_INFO[c.id]||"non quotata")}</small></span><span class="ipo-g">notizie ›</span></a>`).join("")}
    <p class="bnote" style="margin:8px 0 0">Le prime settimane dopo una quotazione possono salire o scendere del 30-50%: se ne compri, a piccoli pezzi e con soldi che puoi perdere (dentro il 10% degli extra).</p></div>`;
}
function ipoFutMount(){ const el=document.getElementById("ipoFut"); if(el) el.innerHTML=ipoFutHtml(); }
ipoFutMount();
