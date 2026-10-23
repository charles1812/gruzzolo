/* ---------- Aggiornamenti dall'app (come Schiscetta) ----------
   All'apertura e al ritorno nell'app (al massimo ogni 5 minuti) leggo versione.json dall'indirizzo degli aggiornamenti (GRZ_UPDATE_URL):
   se c'è una versione più nuova mostro «⬆️ Nuova versione · Aggiorna». L'APK si scarica e si installa sopra
   quella attuale (stessa firma, versionCode più alto): budget, spese, buoni, portafoglio e impostazioni restano. */
const UPD = { url:(window.GRZ_UPDATE_URL||""), at:0, info:null, busy:false, err:null };
function updNative(){ return window.GruzzoloNative && typeof window.GruzzoloNative.appVersion==="function" ? window.GruzzoloNative : null; }
function updMine(){ const N=updNative(); try{ return N ? JSON.parse(N.appVersion()) : null; }catch(e){ return null; } }

async function checkUpdate(force){
  const N=updNative(); if(!N || !UPD.url) return null;
  if(!force && Date.now()-UPD.at<5*60000) return UPD.info;
  UPD.at=Date.now();
  try{
    const r=await fetch(UPD.url+"?t="+Date.now(), { cache:"no-store" }); if(!r.ok) throw new Error("HTTP "+r.status);
    const j=await r.json(), me=updMine();
    UPD.info = (me && +j.code>+me.code && j.url) ? j : null;
  }catch(e){ UPD.info=null; }
  updateBanner(); renderUpdRow();
  return UPD.info;
}
function updateBanner(){
  let b=document.getElementById("updBanner");
  if(!UPD.info){ if(b) b.remove(); return; }
  if(!b){ b=document.createElement("div"); b.id="updBanner"; b.className="upd-ban"; document.body.appendChild(b); }
  const i=UPD.info;
  b.innerHTML=`<div class="upd-t"><b>⬆️ Nuova versione ${esc(i.name||"")}</b><small>${i.note?esc(i.note)+" · ":""}i tuoi dati restano</small></div>
    <button class="btn gold upd-go" data-upd="go" ${UPD.busy?"disabled":""}>${UPD.busy?"Scarico…":"Aggiorna"}</button><button class="upd-x" data-upd="later" aria-label="Più tardi">✕</button>`;
}
function renderUpdRow(){
  const h=document.getElementById("sUpdate"); if(!h) return; const me=updMine();
  if(!me){ h.innerHTML=""; return; }
  h.innerHTML=`<div class="upd-row"><span>📦 Versione <b>${esc(me.name||"")}</b>${UPD.info?` · <b class="pos">nuova ${esc(UPD.info.name||"")}</b>`:""}</span>
    <button class="add" data-upd="${UPD.info?"go":"check"}">${UPD.info?"Aggiorna":"Controlla"}</button></div>`;
}
function doUpdate(){
  const N=updNative(), i=UPD.info; if(!N || !i || UPD.busy) return;
  if(!N.canInstall()){
    toast("Android chiede il permesso: attiva «Consenti da questa origine» per Gruzzolo, poi torna qui e tocca di nuovo «Aggiorna»");
    UPD.waitPerm=true; N.allowInstall(); return;
  }
  UPD.busy=true; updateBanner(); toast("Scarico la nuova versione…");
  N.update(i.url);
}
window.__updateDone=function(err){
  UPD.busy=false; updateBanner();
  if(err) toast("Aggiornamento non riuscito: "+err);
  else toast("Conferma l'installazione: i tuoi dati restano");
};
document.addEventListener("click",e=>{ const b=e.target.closest("[data-upd]"); if(!b) return; const a=b.dataset.upd;
  if(a==="go") doUpdate();
  else if(a==="later"){ const x=document.getElementById("updBanner"); if(x) x.remove(); }
  else if(a==="check"){ toast("Controllo…"); checkUpdate(true).then(i=>toast(i?`C'è la versione ${i.name}`:"Hai già l'ultima versione")); } });
// all'apertura e al ritorno nell'app; se tornando ho il permesso appena dato, riparto da solo
document.addEventListener("visibilitychange",()=>{ if(document.hidden) return;
  if(UPD.waitPerm && updNative() && updNative().canInstall()){ UPD.waitPerm=false; doUpdate(); return; }
  checkUpdate(false); });
setTimeout(()=>checkUpdate(false), 2500);
document.addEventListener("click",e=>{ if(e.target.closest('[data-tab="impostazioni"], [data-more="impostazioni"]')) setTimeout(renderUpdRow,50); });
// la riga della versione si aggiorna quando apri le Impostazioni
(function(){ const st=window.showTab; if(typeof st!=="function") return; window.showTab=function(n){ const r=st.apply(this, arguments); if(n==="impostazioni") renderUpdRow(); return r; }; })();
