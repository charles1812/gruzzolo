"use strict";
/* =====================================================================
   Gruzzolo — Budget
   Ciclo mensile dal giorno dello stipendio, categorie fisse / necessarie /
   libere, accantonamenti per le spese annuali, imprevisti che ricalibrano
   il budget libero, vizi, benzina.
   Usa i globali di index.html: store, settings, money, eur, esc, $, toast,
   openM, closeM, clampDay, showTab.
   ===================================================================== */

const W2M = 52/12;                      // settimane in un mese
const r2 = v => Math.round((+v||0)*100)/100;
const eur0 = new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",maximumFractionDigits:0});
function m0(v){ return settings.priv ? "•••" : eur0.format(v); }
function mx(v){ return Math.abs(v-Math.round(v))<0.005 ? m0(v) : money(v); }
function num(v){ if(v==null) return 0; if(typeof v==="number") return isNaN(v)?0:v;
  let t=String(v).replace(/\s|€/g,"");
  if(t.includes(",")) t=t.replace(/\./g,"").replace(",",".");          // 1.640,50 → 1640.50
  else if(/^-?\d{1,3}(\.\d{3})+$/.test(t)) t=t.replace(/\./g,"");      // 1.640 → 1640
  const n=parseFloat(t); return isNaN(n)?0:n; }
function ymd(d){ return d.toLocaleDateString("en-CA"); }
function parseYmd(s){ const a=String(s).split("-").map(Number); return new Date(a[0],(a[1]||1)-1,a[2]||1); }
function today0(){ return parseYmd(ymd(new Date())); }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function dayDiff(a,b){ return Math.round((parseYmd(ymd(b))-parseYmd(ymd(a)))/86400000); }
function fDay(s){ return parseYmd(s).toLocaleDateString("it-IT",{weekday:"short",day:"numeric",month:"short"}); }
function fShort(d){ return d.toLocaleDateString("it-IT",{day:"numeric",month:"short"}); }
function lc(s){ s=String(s||""); return s.length>1 && s[1]===s[1].toLowerCase() ? s[0].toLowerCase()+s.slice(1) : s; }
function uid(p){ return (p||"t")+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }

let B = Object.assign({ v:1, setup:null, ans:{}, mode:"custom", cats:[], tx:[], gone:[] }, store.get("budget",{}));
// Gruzzolo è indipendente da Schiscetta: le spese arrivate da lì in passato restano come spese normali
if(B.sync || B.tx.some(t=>t.src==="schiscetta")){ B.tx.forEach(t=>{ if(t.src==="schiscetta"){ t.src="manual"; delete t.edited; } }); delete B.sync; store.set("budget",B); }
function bSave(){ store.set("budget",B); }
const NAT = window.GruzzoloNative || null;          // ponte con Android (null nel browser)

/* ---------- bollo (tariffe nazionali per kW, Lombardia applica queste) ---------- */
const BOLLO_RATES = { 0:[3.00,4.50], 1:[2.90,4.35], 2:[2.80,4.20], 3:[2.70,4.05], 4:[2.58,3.87], 5:[2.58,3.87], 6:[2.58,3.87] };
function bolloCalc(kw, euro){
  kw=num(kw); if(!kw) return 0;
  const r=BOLLO_RATES[euro]||BOLLO_RATES[6];
  return r2(Math.min(kw,100)*r[0] + Math.max(0,kw-100)*r[1]);
}

/* ---------- questionario iniziale ---------- */
const VICE_DEF = { sigarette:{ n:"Sigarette", e:"🚬", price:6 }, iqos:{ n:"IQOS", e:"🚬", price:5.5 }, svapo:{ n:"Svapo", e:"💨", price:5 }, altro:{ n:"Vizio", e:"🎰", price:5 } };
const QSTEPS = [
  { id:"entrate", t:"Le tue entrate", sub:"Partiamo da quello che entra ogni mese. Puoi cambiare tutto dopo.", f:[
    { k:"net", l:"Stipendio netto mensile", type:"money", def:1630 },
    { k:"payday", l:"In che giorni del mese arriva lo stipendio? (dal… al…)", type:"range", int:true, def:[4,6], hint:"Il mese di budget parte dal primo giorno; in quei giorni ti chiedo se è arrivato e quanto." },
    { k:"mens", l:"Mensilità", type:"choice", def:"13", opts:[["12","12"],["13","13 (tredicesima)"],["14","14"]] },
    { k:"buoni", l:"Buoni pasto: valore di un buono (€)", type:"money", def:0, hint:"0 se non li hai. Li conto come soldi per la spesa e i pranzi fuori." },
    { k:"workDays", l:"Giorni di lavoro a settimana", type:"int", def:5 },
  ]},
  { id:"oggi", t:"La situazione di oggi", sub:"Parto da adesso: le spese fatte prima di oggi non le conto. Mi servono i soldi che hai davvero, quello che hai già messo da parte e cosa resta da fare.", f:[
    { k:"leftNow", l:"Quanti soldi hai per vivere fino al prossimo stipendio? (conto + contanti, esclusi i risparmi)", type:"money", def:"", hint:"Obbligatorio la prima volta. Da qui calcolo quanto puoi spendere nei prossimi weekend." },
    { k:"buoniNow", l:"Quanti buoni pasto hai adesso?", type:"int", def:0, buoni:true },
    { k:"savedNow", l:"Quanto hai già messo da parte o investito questo mese? (Replay compreso)", type:"money", def:0, hint:"Lo conto come risparmio già fatto: il resto del mese si ricalcola su questo." },
    { k:"replayDone", l:"Il Replay di questo mese è già stato fatto?", type:"choice", def:"si", opts:[["si","Sì, già fatto"],["no","No, deve ancora partire"]], replay:true, hint:"Se è già fatto non lo tolgo dai soldi che ti restano." },
    { k:"boughtDone", l:"Hai già comprato azioni o ETF questo mese?", type:"choice", def:"no", opts:[["si","Sì"],["no","No"]] },
  ]},
  { id:"casa", t:"Casa e utenze", sub:"Lascia 0 dove non paghi niente. Dove una spesa cambia, metti da quanto a quanto.", f:[
    { k:"affitto", l:"Affitto o mutuo al mese", type:"money", def:0 },
    { k:"bollette", l:"Bollette luce + gas al mese", type:"range", def:[0,0] },
    { k:"internet", l:"Internet di casa al mese", type:"money", def:0 },
    { k:"telefono", l:"Telefono al mese", type:"money", def:10 },
  ]},
  { id:"auto", t:"Auto", sub:"Benzina, assicurazione, bollo e tagliando. Le spese annuali le divido in 12 e le metto da parte ogni mese.", f:[
    { k:"hasCar", l:"Hai un'auto?", type:"choice", def:"si", opts:[["si","Sì"],["no","No"]] },
    { k:"commute", l:"Benzina per andare al lavoro (€ al giorno)", type:"range", def:[7,9], car:true },
    { k:"fuelExtra", l:"Benzina extra a settimana (weekend, giri)", type:"range", def:[10,25], car:true },
    { k:"insAnnual", l:"Assicurazione (€ all'anno)", type:"money", def:0, car:true },
    { k:"insDue", l:"Scadenza assicurazione", type:"date", def:"", car:true },
    { k:"kw", l:"Potenza in kW (libretto, campo P.2)", type:"int", def:0, car:true, hint:"Serve per calcolare il bollo." },
    { k:"euro", l:"Classe ambientale", type:"choice", def:"6", car:true, opts:[["0","Euro 0"],["1","1"],["2","2"],["3","3"],["4","4"],["5","5"],["6","6"]] },
    { k:"bolloDue", l:"Scadenza bollo", type:"date", def:"", car:true },
    { k:"maint", l:"Tagliando e manutenzione (€ all'anno)", type:"money", def:300, car:true },
  ]},
  { id:"vita", t:"Spesa e vita di tutti i giorni", sub:"Da quanto a quanto, più o meno: le spese vere correggono la stima mese dopo mese.", f:[
    { k:"spesaWeek", l:"Spesa al supermercato a settimana", type:"range", def:[50,70], },
    { k:"fuori", l:"Pranzi e cene fuori al mese", type:"range", def:[40,80] },
    { k:"salute", l:"Salute e farmacia al mese", type:"range", def:[10,25] },
    { k:"casaVarie", l:"Casa e igiene al mese", type:"range", def:[15,30] },
  ]},
  { id:"svago", t:"Tempo libero", sub:"Sono le spese che puoi comprimere quando serve. Il «risparmio massimo» usa il primo numero.", f:[
    { k:"weekend", l:"Quanto spendi in un weekend", type:"range", def:[30,70] },
    { k:"shopping", l:"Vestiti e shopping al mese", type:"range", def:[20,60] },
    { k:"abbon", l:"Abbonamenti (streaming, palestra…) al mese", type:"money", def:15 },
    { k:"regali", l:"Regali all'anno", type:"range", def:[150,300] },
  ]},
  { id:"vizi", t:"Vizi", sub:"Nessun giudizio: serve a vedere quanto costano davvero in un anno.", f:[
    { k:"vice", l:"Hai un vizio che ti costa?", type:"choice", def:"nessuno", opts:[["nessuno","No"],["sigarette","Sigarette"],["iqos","IQOS"],["svapo","Svapo"],["altro","Altro"]] },
    { k:"viceName", l:"Come lo chiamo?", type:"text", def:"", vice:"altro" },
    { k:"vicePrice", l:"Prezzo di un pacchetto / ricarica (€)", type:"money", def:6, vice:true },
    { k:"vicePerWeek", l:"Quanti a settimana", type:"range", def:[2,4], vice:true },
  ]},
  { id:"risparmi", t:"Risparmi", sub:"La liquidità che hai sul conto diventa il tuo fondo emergenza.", f:[
    { k:"cash", l:"Quanto hai da parte sul conto (liquidità, esclusi gli investimenti)", type:"money", def:0 },
    { k:"goal", l:"Obiettivo (facoltativo)", type:"text", def:"", ph:"es. 10.000 € entro il 2028" },
  ]},
  { id:"invest", t:"Cosa hai investito", sub:"Le posizioni che hai oggi: ticker di Yahoo Finance (es. SWDA.MI), quante quote e il prezzo medio a cui le hai pagate, in euro. Il valore poi si aggiorna da solo.", special:"holdings", f:[] },
  { id:"replay", t:"Il tuo piano di accumulo", sub:"Il Replay (o PAC) che compra in automatico ogni mese: è una parte del tuo risparmio, quindi lo conto nel budget.", special:"replay", f:[] },
  { id:"rischio", t:"Quanto rischio ha senso per te", sub:"Da qui esce il portafoglio modello e cosa comprare ogni mese.", special:"risk", f:[] },
];
function rng(a,k){ const lo=num(a[k]), hi=(a[k+"_hi"]!=null && a[k+"_hi"]!=="") ? num(a[k+"_hi"]) : lo; return hi<lo?[hi,lo]:[lo,hi]; }

function buildCats(a){
  const L=[], old={}; (B.cats||[]).forEach(c=>old[c.id]=c);
  // v: numero oppure [da, a] al mese; il piano è il valore medio
  const add=(id,n,e,g,v,extra)=>{ const lo=Array.isArray(v)?v[0]:v, hi=Array.isArray(v)?v[1]:v;
    L.push(Object.assign({ id, n, e, g, plan:r2((lo+hi)/2) }, hi>lo?{ lo:r2(lo), hi:r2(hi) }:{}, extra||{})); };
  const m=(k,f)=>rng(a,k).map(x=>x*(f||1));
  add("affitto","Affitto / mutuo","🏠","fisse",num(a.affitto));
  add("bollette","Bollette","💡","fisse",m("bollette"));
  add("telefono","Internet e telefono","📱","fisse",num(a.internet)+num(a.telefono));
  add("abbon","Abbonamenti","📺","fisse",num(a.abbon));
  if(a.hasCar!=="no"){
    const bollo=bolloCalc(a.kw,a.euro), wd=num(a.workDays||5), cm=rng(a,"commute"), fx=rng(a,"fuelExtra");
    add("assic","Assicurazione auto","🛡️","fisse",num(a.insAnnual)/12,{ sink:{ annual:num(a.insAnnual), due:a.insDue||"" } });
    add("bollo","Bollo auto","🧾","fisse",bollo/12,{ sink:{ annual:bollo, due:a.bolloDue||"" }, kw:num(a.kw) });
    add("manut","Tagliando e manutenzione","🔧","fisse",num(a.maint)/12,{ sink:{ annual:num(a.maint), due:"" } });
    add("benzina","Benzina","⛽","necessarie",[(cm[0]*wd+fx[0])*W2M,(cm[1]*wd+fx[1])*W2M],{ fuel:true });
  }
  add("spesa","Spesa","🛒","necessarie",m("spesaWeek",W2M));
  add("salute","Salute e farmacia","💊","necessarie",m("salute"));
  add("casavarie","Casa e igiene","🧴","necessarie",m("casaVarie"));
  add("weekend","Weekend e uscite","🎉","libere",m("weekend",W2M));
  add("fuori","Pranzi e cene fuori","🍕","libere",m("fuori"));
  add("pasto","Pranzo pronto","🥪","libere",0);   // pranzo comprato al posto della schiscetta: ristorante, bar o già pronto al supermercato
  add("shopping","Shopping","🛍️","libere",m("shopping"));
  add("regali","Regali","🎁","libere",m("regali",1/12));
  if(a.vice && a.vice!=="nessuno"){
    const v=VICE_DEF[a.vice]||VICE_DEF.altro, pw=rng(a,"vicePerWeek");
    add("vizio", a.vice==="altro" && a.viceName ? a.viceName : v.n, v.e, "libere", [num(a.vicePrice)*pw[0]*W2M, num(a.vicePrice)*pw[1]*W2M],
      { vice:{ price:num(a.vicePrice), perWeek:(pw[0]+pw[1])/2 } });
  }
  if(typeof recCats==="function") recCats().forEach(c=>L.push(c));
  add("altro","Altro","📦","libere",0);
  add("imprevisto","Imprevisto","⚠️","extra",0);
  // categorie aggiunte a mano restano
  Object.values(old).forEach(c=>{ if(c.custom && !L.find(x=>x.id===c.id)) L.push(c); });
  return L;
}

/* ---------- ciclo ---------- */
function cycleOf(ref){
  ref=parseYmd(ymd(ref||new Date()));
  const pd=rng(B.ans,"payday")[0]||1;
  const startOf=(y,m)=>{ const d=new Date(y,m,1); return new Date(d.getFullYear(),d.getMonth(),clampDay(d.getFullYear(),d.getMonth(),pd)); };
  let s=startOf(ref.getFullYear(),ref.getMonth());
  if(s>ref) s=startOf(ref.getFullYear(),ref.getMonth()-1);
  const n=startOf(s.getFullYear(),s.getMonth()+1);
  const e=addDays(n,-1);
  return { s, e, key:ymd(s), days:dayDiff(s,e)+1 };
}
function txIn(s,e){ const a=ymd(s), b=ymd(e); return B.tx.filter(t=>t.d>=a && t.d<=b); }
function isBuoniCat(c){ return c==="spesa"||c==="fuori"||c==="pasto"; }
/* da quale budget esce una spesa: la categoria resta quella scelta (buoni, suggerimenti), ma
   - un pasto (pronto o fuori) di sabato o domenica è una spesa del weekend: esce dal budget di quel weekend;
   - un pranzo pronto nei giorni feriali esce dal budget «Pranzi e cene fuori» (il pranzo pronto non ha budget suo).
   Così una cena del sabato non toglie un po' da tutte le categorie. */
function isWeekendDay(d){ const g=parseYmd(d).getDay(); return g===0||g===6; }
/* il weekend va dal venerdì alle 18 alla domenica alle 5 del mattino.
   L'ora di una spesa: quella vera (notifiche e spese segnate oggi); senza ora, mezzogiorno di quel giorno. */
function txTime(t){ return t.ts ? new Date(t.ts) : new Date(parseYmd(t.d).getTime()+12*3600e3); }
function inWkWindow(dt){ const g=dt.getDay(), h=dt.getHours(); return (g===5&&h>=18) || g===6 || (g===0&&h<5); }
/* i weekend del ciclo: ognuno raccoglie le spese del weekend dalla fine del precedente (domenica alle 5) alla sua fine */
function wkWindows(cy, start, T){
  const L=[], now=new Date(), at=(d,h)=>new Date(d.getFullYear(),d.getMonth(),d.getDate(),h);
  for(let d=new Date(start); d<=cy.e; d=addDays(d,1)){
    const sat = d.getDay()===6 ? d : d.getDay()===0 && dayDiff(start,d)===0 ? addDays(d,-1) : null; if(!sat) continue;
    L.push({ sat, sun:addDays(sat,1), fri:addDays(sat,-1), begin:at(addDays(sat,-1),18), end:at(addDays(sat,1),5) });
  }
  L.forEach((w,i)=>{ const from=i?L[i-1].end:new Date(start), to=i===L.length-1?at(addDays(cy.e,1),0):w.end;
    w.tx=T.filter(t=>t.type!=="in" && budgetCat(t)==="weekend" && txTime(t)>=from && txTime(t)<to); w.spent=w.tx.reduce((a,t)=>a+t.amt,0);
    w.state = now>=w.end ? "past" : now>=w.begin ? "now" : "next"; });
  return L;
}
/* «Conta nel weekend»: si può accendere su qualsiasi spesa (piatti pronti, spesa, cose…) dal «+»;
   se non lo tocchi vale la regola automatica (pasti di sabato e domenica nel weekend) */
function wkCan(cat){ const c=catById(cat); return cat!=="weekend" && cat!=="entrata" && c.g!=="fisse" && c.g!=="extra" && B.cats.some(x=>x.id==="weekend" && x.g==="libere"); }
function wkAuto(t){ return (t.cat==="pasto"||t.cat==="fuori") && inWkWindow(txTime(t)); }
function inWeekend(t){ return wkCan(t.cat) && (t.wk!=null ? !!t.wk : wkAuto(t)); }
function budgetCat(t){
  const has=id=>B.cats.some(c=>c.id===id && c.g==="libere");
  if(inWeekend(t)) return "weekend";
  if(t.cat==="pasto" && has("fuori")) return "fuori";
  return t.cat;
}
function catById(id){ return B.cats.find(c=>c.id===id) || { id, n:"Altro", e:"📦", g:"libere", plan:0 }; }
function buoniMonth(){ return num(B.ans.buoni)*num(B.ans.workDays||5)*W2M; }

/* spesa media per ciclo nei cicli completi PRIMA di quello di ref (max 3), solo quelli davvero tracciati
   (almeno 5 spese registrate): un mese senza movimenti non vuol dire «spendo zero». null se non c'è storia */
const TRACKED_MIN = 5;
function histAvg(catId, ref){
  if(!B.setup) return null;
  const setup=parseYmd(B.setup.slice(0,10));
  let cy=cycleOf(ref), tot=0, n=0, used=0;
  for(let i=0;i<6 && n<3;i++){
    cy=cycleOf(addDays(cy.s,-1));
    if(cy.s<setup) break;
    const T=txIn(cy.s,cy.e).filter(t=>t.type!=="in" && t.src!=="recon");
    if(T.length<TRACKED_MIN) continue;
    T.forEach(t=>{ if(t.cat===catId){ tot+=t.amt; used++; } });
    n++;
  }
  return n && used ? tot/n : null;
}

/* tre modalità: max = risparmio massimo, min = 50/30/20, custom = su misura dalle abitudini */
const MODES = { max:{ n:"Massimo", d:"Tempo libero al minimo che hai indicato, il resto da parte" }, min:{ n:"50/30/20", d:"Risparmio minimo: 20% dello stipendio" }, custom:{ n:"Su misura", d:"Valori medi delle tue stime, poi come spendi davvero" }, manual:{ n:"A mano", d:"Obiettivo deciso da te, mai sotto il Replay" } };
function modePlan(mode, cats, ans, ref){
  cats=cats||B.cats; ans=ans||B.ans;
  const net=num(ans.net);
  const needCats=cats.filter(c=>c.g==="fisse"||c.g==="necessarie");
  const wantCats=cats.filter(c=>c.g==="libere");
  // le necessarie seguono quello che spendi davvero (media degli ultimi mesi completi), le fisse restano quelle dichiarate
  const learned={}, nv=c=>{ if(c.sink){ const due=sinkDueAmount(c, cycleOf(ref)); return due!=null ? due : c.plan; }
    if(c.g!=="necessarie" || c.sink || cats!==B.cats) return c.plan; const h=histAvg(c.id, ref); if(h==null) return c.plan; learned[c.id]=r2(h); return h; };
  const needVal={}; needCats.forEach(c=>needVal[c.id]=nv(c));
  const needs=needCats.reduce((s,c)=>s+needVal[c.id],0);
  const food=cats.filter(c=>c.id==="spesa"||c.id==="fuori").reduce((s,c)=>s+c.plan,0);
  // primo mese: i buoni «ricevuti» sono segnati a 0 perché erano già nel saldo, ma l'obiettivo è sul mese intero e li conta
  const ck=cycleOf(ref).key, firstCy=B.start && B.start.key===ck;
  const rcv=(B.buoni && B.buoni.recv && ans===B.ans && !firstCy) ? B.buoni.recv[ck] : null;
  const buoni=Math.min(rcv!=null ? rcv*num(ans.buoni) : num(ans.buoni)*num(ans.workDays||5)*W2M, food);
  const typ={}; let typTot=0;
  wantCats.forEach(c=>{ const h=(mode==="custom" && cats===B.cats) ? histAvg(c.id, ref) : null;
    typ[c.id]=Math.max(0, mode==="max" ? (c.lo!=null?c.lo:c.plan) : (h!=null ? h : c.plan)); typTot+=typ[c.id]; });
  const avail=net+buoni-needs;
  let wants, save;
  if(mode==="max"){ wants=typTot; save=avail-wants; }
  else if(mode==="min"){ save=0.2*net; wants=avail-save; }
  else if(mode==="manual"){ save=num(B.goal); wants=avail-save; }
  else { wants=typTot; save=avail-wants; }
  const rc=(typeof replay!=="undefined" && replay && replay.enabled && typeof replayCost==="function") ? replayCost().total : 0;
  let replayUp=0;
  if(rc>0 && save<rc && avail>rc){ replayUp=rc-save; save=rc; wants=avail-rc; }
  if(avail<=0){ wants=0; save=avail; }
  else if(save<0){ save=0; wants=avail; }
  const per={};
  wantCats.forEach(c=>{ per[c.id] = typTot>0 ? wants*typ[c.id]/typTot : (c.id==="altro" ? wants : 0); });
  needCats.forEach(c=>per[c.id]=needVal[c.id]);
  // per spiegare l'obiettivo: da dove arriva ogni euro
  const grp=f=>needCats.filter(f).reduce((s,c)=>s+needVal[c.id],0);
  const parts={ fisse:grp(c=>c.g==="fisse" && !c.sink), acc:grp(c=>!!c.sink), nec:grp(c=>c.g==="necessarie") };
  return { mode, net, buoni, needs, wants, save, avail, per, typTot, learned, replay:rc, replayUp, parts };
}

/* piano del mese fissato: calcolato una volta all'inizio del mese e poi non cambia più da solo.
   Si rifà solo se cambi tu qualcosa (modalità, obiettivo a mano, stipendio, domande, categorie).
   I mesi dopo usano le spese reali raccolte, quindi gli obiettivi si adattano mese per mese. */
function cyclePlan(ref){
  const k=cycleOf(ref).key; B.plans=B.plans||{};
  if(B.plans[k] && B.plans[k].per) return B.plans[k];
  const P=modePlan(B.mode, null, null, ref);
  const noPx = replay && replay.enabled && (replay.items||[]).length && !(replayCost().total>0);
  if(B.setup && k<=cycleOf().key && !noPx){ B.plans[k]=JSON.parse(JSON.stringify(Object.assign({}, P, { fixed:ymd(today0()) }))); bSave(); }
  return P;
}
function unfreezePlan(){ if(B.plans) delete B.plans[cycleOf().key]; }

/* stato del ciclo corrente con ricalibrazione */
/* primo mese iniziato a metà: parto dai soldi rimasti, niente risparmio forzato */
/* azioni comprate con i soldi del conto (dal Portafoglio): sono soldi messi da parte in quel mese */
function invList(from, to){ return (B.inv||[]).filter(x=>x.d>=from && x.d<=to); }
function invSum(from, to){ return invList(from,to).reduce((a,x)=>a+x.amt,0); }
function startInfo(cy){ const s=B.start; return (s && s.key===cy.key && s.left>0) ? s : null; }
function partialPlan(P, cy, s0){
  const remDays=Math.max(1,dayDiff(parseYmd(s0.date),cy.e)+1), frac=Math.min(1,remDays/cy.days);
  const per={}; let needs=0;
  B.cats.forEach(c=>{ if(c.sink){ const fixed=P.per&&P.per[c.id], due = fixed!=null ? (fixed>c.sink.annual/12+1 ? fixed : 0) : (sinkDueIn(c, cy) && sinkDueIn(c, cy)>=parseYmd(s0.date) ? c.sink.annual : 0); per[c.id]=due; needs+=due; } else if(c.g==="fisse" && c.day){ const d=fixedDueIn(c, cy); per[c.id]= d && d>=parseYmd(s0.date) ? (P.per[c.id]!=null?P.per[c.id]:c.plan) : 0; needs+=per[c.id]; }
    else if(c.g==="fisse"||c.g==="necessarie"){ per[c.id]=(P.per[c.id]!=null?P.per[c.id]:c.plan)*frac; needs+=per[c.id]; } });
  // il prossimo Replay, se cade prima del prossimo stipendio, si paga con questi soldi (ed è risparmio del mese)
  let rep=0, repDate=null;
  if(!s0.replayDone && replay && replay.enabled){ const nr=nextReplay(); if(nr.date<=cy.e && nr.date>=parseYmd(s0.date)){ rep=replayCost().total; repDate=nr.date; } }
  // buoni pasto che hai adesso: pagano una parte di spesa e pranzi fuori, quindi servono meno soldi del conto
  const bN = s0.buoniN!=null ? num(s0.buoniN) : num(B.ans.buoniNow), bVal=num(B.ans.buoni);
  const food=B.cats.filter(c=>c.id==="spesa"||c.id==="fuori").reduce((s,c)=>s+c.plan,0)*frac;
  const buoni=Math.min(bN*bVal, food);
  const inv=invSum(s0.date, ymd(cy.e));                      // azioni comprate dopo l'inizio: soldi usciti dal conto e già messi da parte
  const avail=Math.max(0, s0.left+buoni-needs-rep-inv);
  const wc=B.cats.filter(c=>c.g==="libere"), tot=wc.reduce((s,c)=>s+(P.per[c.id]||0),0);
  // primo mese (da quando usi Gruzzolo al primo stipendio): niente obiettivo di risparmio, i soldi che restano li impari a gestire.
  // Replay e azioni già comprate restano messi da parte; l'obiettivo pieno parte con il primo stipendio.
  const saved=num(s0.saved)+inv, target=0;
  const floor=wc.reduce((s,c)=>s+(c.lo!=null?c.lo:c.plan),0)*frac;
  const save=Math.min(target, avail), wants=Math.max(0, avail-save), belowFloor=wants<floor-0.5;
  wc.forEach(c=>per[c.id]= tot>0 ? wants*(P.per[c.id]||0)/tot : (c.id==="altro"?wants:0));
  return Object.assign({}, P, { per, save, saved, goal:0, goalNext:Math.max(0,cyclePlan(addDays(cy.e,1)).save), net:s0.left, buoni, buoniN:bN, belowFloor, floor, needs, wants, partial:true, replayRes:rep, replayDate:repDate, remDays, startDate:s0.date, inv });
}
function bStatus(ref){
  const cy=cycleOf(ref), s0=startInfo(cy);
  let P=cyclePlan(ref), T=txIn(cy.s,cy.e);
  if(s0){ P=partialPlan(P, cy, s0); T=T.filter(t=>t.d>=s0.date); }
  const spent={}; let extra=0, extraIn=0; const extras=[];
  T.forEach(t=>{
    if(t.type==="in"){ extraIn+=t.amt; return; }
    if(t.cat==="imprevisto"){ extra+=t.amt; extras.push(t); return; }
    const bc=budgetCat(t); spent[bc]=(spent[bc]||0)+t.amt;
  });
  // quanto del periodo è passato (oggi compreso): serve per capire se sulle necessarie stai spendendo meno del previsto
  const pS=s0?parseYmd(s0.date):cy.s, pD=dayDiff(pS,cy.e)+1, pE=Math.min(pD,Math.max(0,dayDiff(pS,today0())+1));
  const rows=[]; let overNeeds=0, W=0, Sw=0, remTot=0, credit=0;
  B.cats.forEach(c=>{
    if(c.g==="extra") return;
    const b=P.per[c.id]||0, s=spent[c.id]||0;
    const row={ c, b, s };
    if(c.sink){ row.fund=sinkInfo(c); overNeeds+=Math.max(0,s-b); }
    else if(c.g!=="libere"){ overNeeds+=Math.max(0,s-b);
      // necessarie: a che punto dovresti essere, meno una settimana di margine (la spesa non si fa tutti i giorni)
      if(c.g==="necessarie" && b>0){ row.cred=Math.max(0, Math.min(b-s, b*(pE-Math.min(7,pD-pE))/pD - s)); credit+=row.cred; } }
    else { W+=b; Sw+=s; row.rem=Math.max(0,b-s); remTot+=row.rem; }
    rows.push(row);
  });
  const inv=P.partial ? (P.inv||0) : invSum(ymd(cy.s), ymd(cy.e));
  const invOver=P.partial ? 0 : Math.max(0, inv+((replay&&replay.enabled)?replayCost().total:0)-P.save);
  const deficit=extra+overNeeds+invOver;
  const free=W-Sw-deficit+credit;              // budget libero rimasto dopo imprevisti e sforamenti, più quello che avanzi sulle necessarie
  const freePos=Math.max(0,free);
  // quattro budget: Weekend, Tempo libero (un solo salvadanaio per shopping, regali, pranzi fuori, sigarette… lo usi come vuoi),
  // Spesa e Spese ricorrenti. Quello che manca (sforamenti delle necessarie, imprevisti) o che avanza lo divido tra Weekend e
  // Tempo libero in proporzione al loro budget (fisso), così una spesa in uno non sposta l'altro.
  const LR=rows.filter(r=>r.c.g==="libere"), wkR=LR.find(r=>r.c.id==="weekend"), PR=LR.filter(r=>r!==wkR);
  const pool={ id:"libero", b:PR.reduce((a,r)=>a+r.b,0), s:PR.reduce((a,r)=>a+r.s,0), rows:PR };
  // ogni weekend ha la sua quota; quando finisce (domenica alle 5) quello che avanza passa al Tempo libero
  // (e se l'hai sforata, la parte in più esce dal Tempo libero): gli altri weekend restano com'erano
  let wkW=null;
  if(wkR){ const L=wkWindows(cy, s0?parseYmd(s0.date):cy.s, T), base=wkR.b/Math.max(1,L.length);
    const past=L.filter(w=>w.state==="past"), moved=past.reduce((a,w)=>a+(base-w.spent),0);
    wkR.b0=wkR.b; wkR.b=wkR.b-moved; pool.b+=moved; wkW={ L, base, moved }; }
  const G=[pool].concat(wkR?[wkR]:[]); G.forEach(g=>{ g.rem=Math.max(0,g.b-g.s); g.left=g.rem; });
  let A=G.reduce((a,g)=>a+g.rem,0)-freePos;                           // >0 da togliere, <0 da aggiungere
  for(let pass=0; pass<4 && Math.abs(A)>0.005; pass++){
    const open=G.filter(g=>A<0 ? true : g.left>0.005), wb=open.reduce((a,g)=>a+g.b,0); if(!open.length) break;
    let used=0; open.forEach(g=>{ const want=wb>0?A*g.b/wb:A/open.length, take=A>0?Math.min(g.left,want):want; g.left-=take; used+=take; });
    A-=used;
  }
  G.forEach(g=>{ g.left=Math.max(0,g.left); g.adj=g.s+g.left; g.cut=Math.max(0,g.b-g.adj); });
  // le singole categorie del tempo libero non hanno un budget loro: la parte che resta la mostro in proporzione, solo come informazione
  PR.forEach(r=>{ const k=pool.b>0?r.b/pool.b:1/Math.max(1,PR.length); r.left=pool.left*k; r.adj=r.s+r.left; r.cut=0; });
  const ricR=rows.filter(r=>(r.c.g==="necessarie"||r.c.g==="fisse") && r.c.id!=="spesa"), spR=rows.find(r=>r.c.id==="spesa");
  const ric={ id:"ricorrenti", b:ricR.reduce((a,r)=>a+r.b,0), s:ricR.reduce((a,r)=>a+r.s,0), rows:ricR };
  // quello che resta nelle necessarie, senza la parte già passata al tempo libero (cred): così nessun euro conta due volte
  const necLeft=R=>R.reduce((a,r)=>a+Math.max(0,r.b-r.s)-(r.cred||0),0);
  ric.left=Math.max(0,necLeft(ricR));
  const groups=[
    { id:"libero", e:"💸", n:"Tempo libero", left:pool.left, s:pool.s, cap:pool.s+pool.left },
    ...(wkR?[{ id:"weekend", e:"🎉", n:"Weekend", left:wkR.left, s:wkR.s, cap:wkR.s+wkR.left }]:[]),
    ...(spR?[{ id:"spesa", e:"🛒", n:"Spesa", left:Math.max(0,necLeft([spR])), s:spR.s, cap:Math.max(spR.b,spR.s) }]:[]),
    { id:"ric", e:"🔁", n:"Ricorrenti", left:ric.left, s:ric.s, cap:Math.max(ric.b,ric.s) } ];
  // soldi che restano fino allo stipendio = somma esatta dei quattro (se il libero è sotto zero, conta anche quello)
  // i buoni pasto NON sono soldi: li tolgo dal totale e restano solo nella Spesa (come buoni).
  // bIn = valore dei buoni contati nel budget e non ancora usati. Pagano prima la spesa; se ne avanzano oltre la spesa
  // vanno a pranzi e pasti (tempo libero), quindi lì restano meno soldi veri.
  const bUsedVal=T.reduce((a,t)=>a+(t.type!=="in"?(t.buoniVal||0):0),0), bIn=(P.buoni||0)-bUsedVal;
  const gOf=id=>groups.find(g=>g.id===id), take=(g,a)=>{ if(!g||a<=0) return a; const x=Math.min(g.left,a); g.left-=x; return a-x; };
  let bRest=0;
  if(bIn>0){ bRest=bIn; ["spesa","libero","weekend","ric"].forEach(id=>{ bRest=take(gOf(id),bRest); }); }
  else if(bIn<0 && gOf("spesa")) gOf("spesa").left+=-bIn;      // buoni usati oltre quelli contati: soldi veri risparmiati sulla spesa
  { const g=gOf("spesa"); if(g){ g.s=st_cashSpent(T); g.cap=g.left+g.s; } }
  groups.forEach(g=>{ if(g.id!=="spesa") g.cap=Math.max(g.cap, g.left+g.s); });
  // soldi veri che restano (sul conto) = somma esatta dei quattro pezzi
  const remaining=groups.reduce((a,g)=>a+g.left,0)+Math.min(0,free)-bRest;
  const buoniLeft={ n:buoniOn()?B.buoni.bal:0, val:buoniOn()?B.buoni.bal*B.buoni.val:0 };
  const buoniUsed=T.reduce((s,t)=>s+(t.buoniVal||0),0);
  const sal=P.partial ? null : (B.salary||{})[cy.key], salDiff = sal!=null ? sal-P.net : 0;
  const rcv=(!P.partial && B.buoni && B.buoni.recv) ? B.buoni.recv[cy.key] : null, buoniDiff = rcv!=null ? rcv*num(B.ans.buoni)-(P.buoni||0) : 0;
  const savings=P.save+Math.min(0,free)+extraIn+salDiff+buoniDiff+invOver;
  const t0=today0(), daysLeft=Math.max(1,dayDiff(t0,cy.e)+1);
  const spentAll=T.filter(t=>t.type!=="in").reduce((s,t)=>s+t.amt,0);
  return { cy, P, T, rows, pool, ric, groups, remaining, buoniLeft, bIn, wkW, spesaRow:spR||null, spent, extra, extras, extraIn, overNeeds, deficit, credit, pE, pD, W, Sw, free, savings, daysLeft, perDay:freePos/daysLeft, spentAll, sal, salDiff, buoniDiff, buoniUsed, inv, invOver };
}

/* serbatoio del risparmio: obiettivo fisso sul mese intero, si riempie con il Replay e con quello che metti da parte */
function goalEnd(st){ const P=st.P; return Math.max(0, P.partial ? P.saved+P.replayRes+P.save+Math.min(0,st.free)+st.extraIn : st.savings); }
/* già messo da parte (e investito) nel mese: Replay fatto, azioni comprate, risparmi di prima nel primo mese */
function goalDone(st){
  const P=st.P, t0=today0();
  if(P.partial) return P.saved + (P.replayRes>0 && P.replayDate<=t0 ? P.replayRes : 0);
  const rc=(replay&&replay.enabled)?replayCost().total:0, d=replay&&replay.dayOfMonth||1, y=st.cy.s.getFullYear(), m=st.cy.s.getMonth();
  let rd=new Date(y, m, clampDay(y, m, d)); if(rd<st.cy.s) rd=new Date(y, m+1, clampDay(y, m+1, d));
  return (rc>0 && rd<=t0 ? rc : 0) + (st.inv||0);
}
function firstMonthHtml(st){
  const P=st.P, done=goalDone(st), extra=Math.max(0,st.free), next=addDays(st.cy.e,1);
  return `<section><div class="card tank"><div class="bw-h">🌱 Primo mese: solo gestire</div>
    <p class="bnote" style="margin-top:6px">Fino allo stipendio del ${esc(fShort(next))} non ti chiedo di mettere da parte niente: questi soldi impari a gestirli. Quello che avanza a fine mese te lo propongo da investire.</p>
    <div class="tank-k" style="margin-top:8px">${done>0?`<div><small><i class="dot pos"></i>già messo da parte (Replay e azioni)</small><b class="num pos">${m0(done)}</b></div>`:""}
      <div><small>se non spendi tutto il tempo libero avanzano</small><b class="num">${m0(extra)}</b></div>
      <div><small>obiettivo dal prossimo stipendio</small><b class="num">${m0(Math.max(0,P.goalNext||0))} al mese</b></div></div></div></section>`;
}
function saveTankHtml(st){
  if(st.P.partial) return firstMonthHtml(st);
  const P=st.P, F=cyclePlan(st.cy.s), G=Math.max(0,F.save), t0=today0();
  if(!(G>0)) return "";
  const done=goalDone(st), end0=P.partial ? goalEnd(st) : st.savings;
  let end=end0;
  end=Math.max(0,end); const extra=Math.max(0,st.free);
  const pD=Math.min(1,done/G), pE=Math.min(1,end/G), pct=Math.round(end/G*100), pctD=Math.round(done/G*100);
  const p=F.parts, row=(l,v,sg)=>`<div class="bp-row"><span>${l}</span><b class="num">${sg}${money(v)}</b></div>`;
  return `<section><div class="card tank"><div class="bw-h">🏺 Obiettivo di risparmio</div>
    <div class="tank-row">${ringSvg([{ f:pD, c:"pos" },{ f:pE-pD, c:"pos soft" }], null, pctD+"%", "già da parte", `Risparmio: ${pctD}% fatto, ${pct}% previsto`)}
      <div class="tank-k"><div><small>obiettivo del mese${F.fixed?` (fissato il ${esc(fDay(F.fixed))})`:""}</small><b class="num">${m0(G)}</b></div><div><small><i class="dot pos"></i>già messo da parte</small><b class="num pos">${m0(done)}</b></div><div><small><i class="dot pos soft"></i>a fine mese</small><b class="num">${m0(end)} · ${pct}%</b></div></div></div>
    <p class="bnote" style="margin-top:6px">${end>=G-1?`Sei in linea con l'obiettivo${end>G+1?`, anzi sopra di ${m0(end-G)}`:""}.`:P.partial && st.free>=0 ? `Ti mancano ${m0(G-end)} per l'obiettivo: questo mese sei partito a metà con ${m0(P.net)} sul conto, quindi più di così non si riesce. Dal prossimo stipendio l'obiettivo è pieno.` : `Sei sotto l'obiettivo di ${m0(G-end)}: imprevisti o spese sopra la stima.`}${extra>=5?` Se non spendi tutto il tempo libero arrivi fino a <b class="num">${m0(end+extra)}</b>: quello che avanza lo puoi investire.`:""}${P.partial?" L'obiettivo è sul mese intero: conto anche quello che hai messo da parte prima di installare Gruzzolo.":""}</p>
    <details class="why-d"><summary>Come calcolo l'obiettivo · cambia stipendio</summary>
      <div class="rng" style="margin:6px 0 10px"><input id="netIn" inputmode="decimal" value="${fmtIn(num(B.ans.net))}" aria-label="Stipendio netto"><button class="btn gold" data-b="netSave" style="width:auto;padding:12px 16px">Cambia stipendio</button></div>
      ${row("Stipendio",F.net,"")}${F.buoni>0?row("Buoni pasto",F.buoni,"+"):""}
      ${row("Spese fisse (bollette, telefono, abbonamenti…)",p.fisse,"−")}${p.acc>0?row("Accantonamenti (assicurazione, bollo, tagliando)",p.acc,"−"):""}
      ${row("Necessarie (benzina, spesa, farmacia, casa)",p.nec,"−")}${row("Tempo libero ("+MODES[B.mode].n+")",F.wants,"−")}
      ${row("<b>Obiettivo di risparmio</b>",F.save,"=")}
      <p class="bnote">Modalità <b>${esc(MODES[B.mode].n)}</b>: la cambi da <button class="add" data-b="goto" data-v="impostazioni">Impostazioni</button>. ${F.replayUp>0?`Il tempo libero è sceso di ${m0(F.replayUp)} per coprire il Replay (${m0(F.replay)}): l'obiettivo non va mai sotto il Replay. `:""}Le necessarie seguono le tue spese reali dopo il primo mese completo. Puoi cambiare l'obiettivo dalle Impostazioni, anche a mano.</p></details></div></section>`;
}

/* ---------- storico dei risparmi mese per mese ---------- */
function monthHistory(){
  if(!B.setup) return [];
  const first=cycleOf(parseYmd(B.setup.slice(0,10))), now=cycleOf(), L=[];
  let cy=first;
  for(let i=0;i<36 && cy.s<=now.s;i++){
    const st=bStatus(cy.s), P=st.P, cur=cy.key===now.key;
    const goal=P.partial?P.goal:P.save;
    // a mese chiuso il tempo libero non speso è risparmio in più; nel mese in corso è una previsione
    const base=P.partial ? P.saved+P.replayRes+P.save : P.save;
    const saved=base + (cur?Math.min(0,st.free):st.free) + st.extraIn + st.salDiff + (st.buoniDiff||0);
    const why=[];
    if(P.partial) why.push({ v:0, t:`Primo mese con Gruzzolo (dal ${fDay(P.startDate)}): niente obiettivo, solo gestire${P.saved>0?`; contano i ${m0(P.saved)} messi da parte`:""}` });
    if(!cur && st.free>1) why.push({ v:st.free, t:"Tempo libero non speso" });
    if(st.credit>1 && !cur) why.push({ v:0, t:`di cui ${m0(st.credit)} risparmiati su benzina, spesa e altre necessarie` });
    st.rows.filter(r=>r.c.g!=="libere" && !r.c.sink && r.s>r.b+1).sort((a,b)=>(b.s-b.b)-(a.s-a.b)).slice(0,3).forEach(r=>why.push({ v:-(r.s-r.b), t:`${r.c.n} sopra il previsto` }));
    st.rows.filter(r=>r.c.g==="libere" && r.s>r.b+1).sort((a,b)=>(b.s-b.b)-(a.s-a.b)).slice(0,2).forEach(r=>why.push({ v:-(r.s-r.b), t:`${r.c.n} sopra il budget` }));
    if(st.extra>0) why.push({ v:-st.extra, t:`Imprevisti: ${st.extras.map(t=>t.note||"imprevisto").slice(0,3).join(", ")}` });
    if(Math.abs(st.salDiff)>0.5) why.push({ v:st.salDiff, t:st.salDiff>0?"Stipendio più alto del solito":"Stipendio più basso del solito" });
    if(Math.abs(st.buoniDiff||0)>0.5) why.push({ v:st.buoniDiff, t:st.buoniDiff>0?"Più buoni pasto del previsto":"Meno buoni pasto del previsto" });
    if(st.extraIn>0) why.push({ v:st.extraIn, t:"Entrate extra" });
    // mese chiuso con pochi movimenti: quello che non hai segnato sembrerebbe risparmio, quindi lo dico
    const nTx=st.T.filter(t=>t.type!=="in" && t.src!=="recon").length, sparse=!cur && nTx<TRACKED_MIN && !((B.recon||{})[cy.key]);
    if(sparse) why.unshift({ v:0, t:`Solo ${nTx} spese registrate: se non hai segnato tutto, il risparmio vero è più basso. Controlla con «Allinea con la banca».` });
    L.push({ key:cy.key, cy, cur, goal, saved, diff:saved-goal, why, spent:st.spentAll, partial:!!P.partial, sparse });
    cy=cycleOf(addDays(cy.e,1));
  }
  return L;
}
function savingsStatsHtml(){
  const H=monthHistory();
  if(!H.length) return `<div class="ai-note">Rispondi alle domande del Budget: poi qui trovi i tuoi risparmi mese per mese.</div>`;
  const done=H.filter(m=>!m.cur && !m.sparse), tot=H.filter(m=>!m.cur && !m.sparse).reduce((a,m)=>a+Math.max(0,m.saved),0);
  const avg=done.length?done.reduce((a,m)=>a+m.saved,0)/done.length:null, hit=done.filter(m=>m.diff>=-1).length;
  const tv=typeof totals==="function"?totals():{ val:0, cost:0, pl:0, pct:0 }, fund=(typeof PL!=="undefined"?+PL.fund||0:0);
  const mName=m=>(m.cy.s.getDate()>15?m.cy.e:m.cy.s).toLocaleDateString("it-IT",{ month:"short" }).replace(/^./,x=>x.toUpperCase());
  const year=m=>(m.cy.s.getDate()>15?m.cy.e:m.cy.s).getFullYear();
  let h=`<div class="chart-card"><div class="chart-h">Il tuo patrimonio</div>
    <div class="kpis"><div><small>totale</small><b class="num">${m0(tv.val+fund)}</b></div><div><small>investimenti</small><b class="num">${m0(tv.val)}</b></div><div><small>fondo emergenza</small><b class="num">${m0(fund)}</b></div>
    <div><small>versato</small><b class="num">${m0(tv.cost)}</b></div><div><small>guadagno</small><b class="num ${tv.pl>=0?"pos":"neg"}">${tv.pl>=0?"+":"−"}${m0(Math.abs(tv.pl))}</b></div><div><small>rendimento</small><b class="num ${tv.pl>=0?"pos":"neg"}">${tv.pct>=0?"+":""}${tv.pct.toFixed(1).replace(".",",")}%</b></div></div>
    ${allocBars()}</div>`;
  h+=`<div class="chart-card"><div class="chart-h">I tuoi risparmi</div>
    <div class="kpis"><div><small>messo da parte (mesi chiusi)</small><b class="num pos">${m0(tot)}</b></div><div><small>media al mese</small><b class="num">${avg!=null?m0(avg):"—"}</b></div><div><small>mesi a obiettivo</small><b class="num">${done.length?hit+" su "+done.length:"—"}</b></div></div>
    ${savBars(H, mName)}</div>`;
  h+=`<div class="chart-card"><div class="chart-h">Mese per mese</div><p class="muted" style="margin:0 0 10px">Tocca un mese per vedere perché hai messo da parte di più o di meno.</p><div class="mcal">`;
  let yPrev=null;
  H.slice().reverse().forEach(m=>{ const y=year(m); if(y!==yPrev){ h+=`<div class="mcal-y">${y}</div>`; yPrev=y; }
    const cls=m.cur?"cur":m.sparse?"unk":m.diff>=-1?"ok":m.diff>=-m.goal*0.2?"meh":"ko";
    h+=`<button class="mcal-m ${cls}" data-mh="${m.key}"><span class="mm-n">${mName(m)}${m.cur?" · in corso":""}</span><b class="num">${m0(m.saved)}</b><small>obiettivo ${m0(m.goal)}</small><em class="num">${m.sparse?"dati incompleti":(m.diff>=0?"+":"−")+m0(Math.abs(m.diff))}</em></button>`; });
  h+=`</div><div id="mcalWhy"></div></div>`;
  return h;
}
function savBars(H, mName){
  const L=H.slice(-12), max=Math.max(1,...L.map(m=>Math.max(m.saved,m.goal)));
  return `<div class="sbars">${L.map(m=>`<div class="sb"><div class="sb-col"><i class="sb-g" style="bottom:${(m.goal/max*100).toFixed(1)}%"></i><span class="sb-v ${m.cur?"cur":m.sparse?"unk":m.diff>=-1?"ok":"ko"}" style="height:${(Math.max(0,m.saved)/max*100).toFixed(1)}%"></span></div><small>${mName(m)}</small></div>`).join("")}</div>
    <p class="muted" style="margin:6px 0 0;font-size:12px">Barre: quanto hai messo da parte. Trattino: l'obiettivo del mese.</p>`;
}
function allocBars(){
  if(typeof holdings==="undefined" || !holdings.length) return "";
  const tv=totals(); if(!(tv.val>0)) return "";
  const L=holdings.map(h=>({ n:shortName(h.ticker), v:valueOf(h) })).sort((a,b)=>b.v-a.v);
  return `<div class="alloc">${L.map(x=>`<div class="al-r"><span>${esc(x.n)}</span><div class="al-b"><i style="width:${(x.v/tv.val*100).toFixed(1)}%"></i></div><b class="num">${Math.round(x.v/tv.val*100)}%</b></div>`).join("")}</div>`;
}
function monthWhyHtml(key){
  const m=monthHistory().find(x=>x.key===key); if(!m) return "";
  const name=(m.cy.s.getDate()>15?m.cy.e:m.cy.s).toLocaleDateString("it-IT",{ month:"long", year:"numeric" });
  return `<div class="mwhy"><b>${esc(name)}${m.cur?" (in corso, previsione)":""}</b>
    <div class="bp-row"><span>Obiettivo</span><b class="num">${money(m.goal)}</b></div>
    <div class="bp-row"><span>${m.cur?"Previsto a fine mese":"Messo da parte"}</span><b class="num">${money(m.saved)}</b></div>
    <div class="bp-row"><span>Differenza</span><b class="num ${m.diff>=0?"pos":"neg"}">${m.diff>=0?"+":"−"}${money(Math.abs(m.diff))}</b></div>
    ${m.why.length?`<div class="mw-l">${m.why.map(w=>`<div class="mw-i"><span>${esc(w.t)}</span>${w.v?`<b class="num ${w.v>=0?"pos":"neg"}">${w.v>=0?"+":"−"}${m0(Math.abs(w.v))}</b>`:""}</div>`).join("")}</div>`:`<p class="muted" style="margin:6px 0 0">Tutto come previsto.</p>`}
    <p class="muted" style="margin:6px 0 0;font-size:12px">Spese registrate nel mese: ${money(m.spent)}.</p></div>`;
}
document.addEventListener("click",e=>{ const b=e.target.closest("[data-mh]"); if(!b) return; const w=$("#mcalWhy"); if(!w) return;
  document.querySelectorAll(".mcal-m").forEach(x=>x.classList.toggle("on",x===b)); w.innerHTML=monthWhyHtml(b.dataset.mh); w.scrollIntoView({ behavior:"smooth", block:"nearest" }); });

/* serbatoio della spesa: quanto hai speso, quanto resta e se sei sopra o sotto il ritmo previsto */
function tankHtml(st){
  const r=st.rows.find(x=>x.c.id==="spesa"); if(!r || !(r.b>0)) return "";
  const b=r.b, tl=1-st.pE/st.pD, T=st.T.filter(t=>t.cat==="spesa" && t.type!=="in");
  const cashSpent=T.reduce((a,t)=>a+t.amt-(t.buoniVal||0),0), buoniSpent=T.reduce((a,t)=>a+(t.buoniVal||0),0);
  // buoni: quelli che avevi a inizio periodo (saldo di oggi + quelli già usati nel periodo)
  const on=buoniOn(), val=on?B.buoni.val:0, usedAll=st.T.reduce((a,t)=>a+(t.buoniN||0),0);
  const bStartN=on?(B.buoni.bal+usedAll):0, bStart=bStartN*val, bNow=on?B.buoni.bal*val:0;
  // conto: la parte del budget spesa che i buoni non coprono
  // soldi veri per la spesa: gli stessi del pezzo «Spesa» del serbatoio grande (i buoni stanno a parte)
  const gS=(st.groups||[]).find(x=>x.id==="spesa"), overS=r.s-b>0.5;
  const cashLeft=gS ? (overS ? -(r.s-b) : gS.left) : Math.max(0,b-Math.min(b,bStart))-cashSpent, cashBud=gS ? Math.max(gS.cap, cashSpent) : Math.max(0,b-Math.min(b,bStart));
  // serbatoio verticale: pieno a inizio periodo, scende spendendo; oltre il budget diventa rosso (pieno = quanto sei oltre, fino al doppio)
  const gauge=(cls,left,tot,big,small,title,none)=>{ const over=left<-0.5, f=over?(tot>0?Math.min(1,-left/tot):1):(tot>0?Math.max(0,left)/tot:0);
    return `<div class="tank-one"><div class="t1-h">${title}</div>${tankSvg(f, over?"neg":cls, title, over?"oltre":"")}<div class="t1-n num ${over?"neg":""}">${big}</div><div class="t1-l">${small}</div><div class="t1-s">${over?`<span class="neg">${money(-left)} oltre</span>`:tot>0?`su ${money(tot)}`:esc(none||"")}<small>${over&&tot>0?`su ${money(tot)}`:over?esc(none||""):"&nbsp;"}</small></div></div>`; };
  const gB = on ? gauge("bu", bNow, bStart, `${B.buoni.bal}`, `buoni · ${money(bNow).replace(",00","")}`, "🎟️ Buoni pasto") : "";
  const gC = gauge("pos", cashLeft, cashBud, cashLeft<-0.5?"−"+money(-cashLeft).replace(",00",""):money(Math.max(0,cashLeft)).replace(",00",""), "dal conto", "💶 Soldi per la spesa", "coperta dai buoni");
  // ritmo: confronto quello che resta in tutto con il livello previsto per oggi
  const left=bNow+Math.max(0,cashLeft), totStart=bStart+cashBud, exp=totStart*tl, diff=left-exp;
  const over=r.s-b;
  const msg = over>0.5 ? `Hai superato il budget della spesa di <b class="num neg">${money(over)}</b> (buoni + conto): li tolgo dal tempo libero.`
    : cashLeft<-0.5 && bNow>0 ? `Dal conto hai già pagato ${money(-cashLeft)} più del previsto, ma in tutto sei nel budget: per le prossime spese usa i buoni (ne hai ${B.buoni.bal}).`
    : st.pE<3 ? `Fino al ${fShort(st.cy.e)} la spesa costa circa ${money(b)}: ${on&&bStart>0?`${money(Math.min(b,bStart))} li paghi con i buoni, ${money(cashBud)} con il conto`:`tutti con il conto`}.`
    : diff>=1 ? `Sei <b class="pos">sotto il ritmo</b>: ti resta ${money(diff)} più del previsto.${r.cred>=1?` ${money(r.cred)} sono già passati al tempo libero.`:""}`
    : diff<=-1 ? `Sei <b class="warn">sopra il ritmo</b> di ${money(-diff)}. Per finire il mese hai ${money(left/Math.max(1,st.daysLeft)*7)} a settimana tra buoni e conto.`
    : `Sei in linea con il ritmo previsto.`;
  const extraB = on && bStart>b+1 ? ` Hai più buoni di quanti ne servono per la spesa (${money(bStart-b)} in più): usali anche per i pranzi fuori.` : "";
  return `<section><div class="card tank" data-b="cat" data-v="spesa"><div class="bw-h">🛒 Serbatoio della spesa</div>
    <div class="tank-two">${gB}${gC}</div>
    <p class="bnote" style="margin-top:8px">${msg}${extraB} Ogni serbatoio è pieno a inizio periodo e scende quando spendi: la freccia indica quanto ne resta. Quello che resta a fine mese diventa avanzo.</p></div></section>`;
}
/* anello: segmenti in frazioni (0–1) dalle 12 in senso orario, tacca opzionale */
let tankN=0;
/* serbatoio verticale: il liquido arriva esattamente a f (0..1) dell'altezza interna e la freccia a sinistra
   indica proprio quel livello, con la percentuale. Le tacche a destra sono 25/50/75%. */
function tankSvg(f, cls, label, txt){
  f=Math.max(0,Math.min(1,f||0));
  const id="tk"+(++tankN), X=40, W=44, T=8, H=104, lv=T+H*(1-f), pct=Math.round(f*100);
  const surf=f>0.03&&f<0.97?`M${X} ${lv.toFixed(1)} q${W/4} -3 ${W/2} 0 t${W/2} 0 V${T+H} H${X} Z`:`M${X} ${lv.toFixed(1)} H${X+W} V${T+H} H${X} Z`;
  const ay=Math.max(T+4,Math.min(T+H-4,lv));
  return `<svg viewBox="0 0 124 ${T+H+8}" class="tank-v ${cls}" role="img" aria-label="${esc(label)}: ${pct}%"><defs><clipPath id="${id}"><rect x="${X}" y="${T}" width="${W}" height="${H}" rx="12"/></clipPath>
    <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="tv-a"/><stop offset="1" class="tv-b"/></linearGradient></defs>
    <rect x="${X}" y="${T}" width="${W}" height="${H}" rx="12" class="tv-bg"/>
    <g clip-path="url(#${id})"><path d="${surf}" fill="url(#${id}g)"/></g>
    <rect x="${X}" y="${T}" width="${W}" height="${H}" rx="12" class="tv-fr"/>
    ${[.25,.5,.75].map(k=>`<line x1="${X+W+2}" x2="${X+W+7}" y1="${(T+H*(1-k)).toFixed(1)}" y2="${(T+H*(1-k)).toFixed(1)}" class="tv-t"/>`).join("")}
    <path d="M${X-3} ${ay.toFixed(1)} l-8 -5 v10 Z" class="tv-p"/><text x="${X-13}" y="${(ay+3.5).toFixed(1)}" class="tv-pl" text-anchor="end">${txt||pct+"%"}</text></svg>`;
}
function ringSvg(segs, mark, big, small, label){
  const R=46, C=2*Math.PI*R; let o=0, h="";
  segs.forEach(g=>{ const f=Math.max(0,Math.min(1-o,g.f||0)); if(f>0.001) h+=`<circle cx="60" cy="60" r="${R}" class="tg-v ${g.c}" stroke-dasharray="${(C*f).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-C*o).toFixed(1)}" transform="rotate(-90 60 60)"/>`; o+=f; });
  let m=""; if(mark!=null && mark>0.005 && mark<0.995){ const a=mark*2*Math.PI-Math.PI/2, x=60+Math.cos(a)*R, y=60+Math.sin(a)*R; m=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7.5" class="tg-m"/>`; }
  return `<svg viewBox="0 0 120 120" class="tank-g" role="img" aria-label="${esc(label)}"><circle cx="60" cy="60" r="${R}" class="tg-bg"/>${h}${m}
    <text x="60" y="61" text-anchor="middle" class="tg-n">${big}</text><text x="60" y="75" text-anchor="middle" class="tg-l">${small}</text></svg>`;
}

/* spesa annuale che scade dentro il ciclo: in quel mese va pagata, non solo accantonata */
function sinkDueIn(c, cy){
  if(!c.sink || !c.sink.due || !(c.sink.annual>0)) return null;
  let d=parseYmd(c.sink.due); while(d<cy.s) d=new Date(d.getFullYear()+1,d.getMonth(),d.getDate());
  return d<=cy.e ? d : null;
}
/* quanto resta da pagare alla scadenza: l'annuale meno quello che hai accantonato da quando usi Gruzzolo */
function sinkDueAmount(c, cy){
  if(!sinkDueIn(c, cy)) return null;
  let acc=0; if(B.setup){ const st=parseYmd(B.setup.slice(0,10)); let k=cycleOf(addDays(cy.s,-1)); for(let i=0;i<11 && k.s>=cycleOf(st).s;i++){ acc++; k=cycleOf(addDays(k.s,-1)); } if(B.start && cycleOf(st).key===B.start.key) acc=Math.max(0,acc-1); }
  return Math.max(c.sink.annual/12, c.sink.annual - acc*c.sink.annual/12);
}
/* il Replay di questo ciclo deve ancora partire? */
function replayPending(st){
  if(!(replay && replay.enabled)) return false;
  if(st.P.partial) return st.P.replayRes>0;
  const d=replay.dayOfMonth||1, y=st.cy.s.getFullYear(), m=st.cy.s.getMonth();
  let rd=new Date(y, m, clampDay(y, m, d)); if(rd<st.cy.s) rd=new Date(y, m+1, clampDay(y, m+1, d));
  return rd<=st.cy.e && rd>today0();
}

/* accantonamento per una spesa annuale */
function sinkInfo(c){
  const a=c.sink.annual||0; if(!c.sink.due) return { annual:a, monthly:a/12 };
  let due=parseYmd(c.sink.due); const t=today0();
  while(dayDiff(t,due)<-31) due=new Date(due.getFullYear()+1,due.getMonth(),due.getDate());
  const last=new Date(due.getFullYear()-1,due.getMonth(),due.getDate());
  const frac=Math.min(1,Math.max(0,dayDiff(last,t)/dayDiff(last,due)));
  return { annual:a, monthly:a/12, due, days:dayDiff(t,due), should:a*frac };
}

/* weekend */
function isWeekend(s){ const d=parseYmd(s).getDay(); return d===0||d===6; }
function weekendsLeft(cy){
  let n=0, d=today0();
  if(d.getDay()===0) n++;                      // domenica: questo weekend è ancora in corso
  for(; d<=cy.e; d=addDays(d,1)) if(d.getDay()===6) n++;
  return Math.max(1,n);
}
function weekendStats(){
  const groups={};
  B.tx.forEach(t=>{
    if(t.type==="in" || !isWeekend(t.d)) return;
    const c=catById(t.cat); if(c.g!=="libere") return;
    const d=parseYmd(t.d); const sat=ymd(d.getDay()===0?addDays(d,-1):d);
    groups[sat]=(groups[sat]||0)+t.amt;
  });
  const t=today0(), sat=ymd(t.getDay()===0?addDays(t,-1):(t.getDay()===6?t:addDays(t,-(t.getDay()+1))));
  const past=Object.keys(groups).filter(k=>k<sat).sort().slice(-8);
  const avg=past.length? past.reduce((s,k)=>s+groups[k],0)/past.length : null;
  return { avg, n:past.length, cur:groups[sat]||0, curIsNow:(t.getDay()===6||t.getDay()===0) };
}

/* weekend del periodo: ogni weekend ha la sua quota; quello che avanzi o sfori si ridistribuisce sui weekend che mancano.
   Le uscite di «Weekend e uscite» fatte in settimana contano sul weekend di quella settimana. */
function weekendList(st){
  const wk=st.rows.find(r=>r.c.id==="weekend"); if(!wk || !st.wkW) return null;
  const L=st.wkW.L, base=st.wkW.base;
  // i weekend finiti hanno usato la loro quota (l'avanzo è già passato al Tempo libero); i prossimi si dividono quello che resta
  const pastSpent=L.filter(w=>w.state==="past").reduce((a,w)=>a+w.spent,0), open=L.filter(w=>w.state!=="past");
  const pool=Math.max(0, wk.b-(wk.cut||0)-pastSpent);
  const used=open.filter(w=>w.spent>0), free=open.filter(w=>!(w.spent>0));
  const usedQuota=used.reduce((a,w)=>a+Math.max(base, w.spent),0);
  const share=free.length ? Math.max(0, pool-usedQuota)/free.length : 0;
  const fair=open.length ? pool/open.length : 0;
  L.forEach(w=>{ w.base=base; w.target = w.state==="past" ? base : w.spent>0 ? Math.max(0, Math.min(fair, pool)) : share; });
  return { L, wk, base, share, moved:st.wkW.moved };
}
function speedo(spent, target){
  const r=Math.max(0, Math.min(2, target>0?spent/target:(spent>0?2:0)));
  const a=Math.PI*(1-r/2), x=50+Math.cos(a)*34, y=52-Math.sin(a)*34;
  return `<svg viewBox="0 0 100 60" class="speedo" aria-hidden="true">
    <path d="M14 52 A36 36 0 0 1 50 16" class="sp-ok"/><path d="M50 16 A36 36 0 0 1 86 52" class="sp-ko"/>
    <line x1="50" y1="52" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="sp-n"/><circle cx="50" cy="52" r="3.5" class="sp-c"/></svg>`;
}
/* «Puoi ancora spendere» spiegato, con quattro budget:
   - nel totale: 🎉 Weekend e 💸 Tempo libero (un salvadanaio unico: shopping, regali, pranzi fuori, sigarette… decidi tu);
   - a parte, perché necessari: 🛒 Spesa e 🔁 Spese ricorrenti (benzina, telefono, abbonamenti, assicurazione…).
   Torta che si disegna con il totale al centro, poi quattro provette con il liquido che si muove (onde e bollicine). */
function roundToSum(vals, total){
  const fl=vals.map(v=>Math.floor(v)), rest=Math.round(total)-fl.reduce((a,b)=>a+b,0);
  vals.map((v,i)=>[v-Math.floor(v),i]).sort((a,b)=>b[0]-a[0]).slice(0,Math.max(0,rest)).forEach(([,i])=>fl[i]++);
  return fl;
}
function freeBreakdownHtml(st){
  const wk=st.rows.find(r=>r.c.id==="weekend"), pool=st.pool, sp=st.spesaRow, ric=st.ric;
  const IN=[{ k:"libero", e:"💸", n:"Tempo libero", left:pool.left, s:pool.s, tot:pool.adj, c1:"#f2cf82", c2:"#b8862f" }]
    .concat(wk?[{ k:"weekend", e:"🎉", n:"Weekend", left:wk.left, s:wk.s, tot:wk.adj, c1:"#9fb2f2", c2:"#5f6fc0" }]:[]);
  const OUT=[sp?{ k:"spesa", e:"🛒", n:"Spesa", left:Math.max(0,sp.b-sp.s), s:sp.s, tot:Math.max(sp.b,sp.s), c1:"#8fe0b1", c2:"#3f9c6a" }:null,
    ric.b>0?{ k:"ricorrenti", e:"🔁", n:"Ricorrenti", left:ric.left, s:ric.s, tot:Math.max(ric.b,ric.s), c1:"#7fd6d0", c2:"#2f8f8a" }:null].filter(Boolean);
  const total=Math.max(0,st.free), shown=roundToSum(IN.map(x=>Math.max(0,x.left)), total);
  const C=2*Math.PI*52; let off=0;
  const segs=total>0.5 ? IN.map((x,i)=>{ const f=Math.max(0,x.left)/total; if(f<0.004) return ""; const len=Math.max(0,C*f-3), d=`<circle cx="70" cy="70" r="52" class="fb-seg" stroke="url(#fbg${i})" style="--len:${len.toFixed(1)}" stroke-dasharray="${len.toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-C*off).toFixed(1)}" transform="rotate(-90 70 70)"/>`; off+=f; return d; }).join("") : "";
  const tube=(x,v,sub)=>{ const f=x.tot>0?Math.max(0,Math.min(1,x.left/x.tot)):0, low=f<0.15;
    return `<div class="fb-col ${low?"low":""}" style="--c1:${x.c1};--c2:${x.c2};--h:${(f*100).toFixed(1)}%"><div class="fb-tube">
        <div class="fb-liq"><i class="fb-w1"></i><i class="fb-w2"></i><b class="fb-bub"></b><b class="fb-bub"></b><b class="fb-bub"></b></div>
        <div class="fb-val num">${v}<small>€</small></div><span class="fb-gl"></span></div>
      <span class="fb-e">${x.e}</span><span class="fb-cn">${esc(x.n)}</span><small>${sub}</small></div>`; };
  const bySp=pool.rows.filter(r=>r.s>0.005).sort((a,b)=>b.s-a.s);
  const nextPay=addDays(st.cy.e,1);
  return `<section><div class="card fb"><div class="fb-glow"></div>
    <div class="fb-top"><svg viewBox="0 0 140 140" class="fb-pie" role="img" aria-label="Puoi ancora spendere: ${m0(total)}">
        <defs>${IN.map((x,i)=>`<linearGradient id="fbg${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${x.c1}"/><stop offset="1" stop-color="${x.c2}"/></linearGradient>`).join("")}
          <filter id="fbglow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
        <circle cx="70" cy="70" r="64" class="fb-orbit"/><circle cx="70" cy="70" r="52" class="fb-bg"/><g filter="url(#fbglow)">${segs}</g>
        <text x="70" y="68" text-anchor="middle" class="fb-n" data-cu="${total.toFixed(2)}" data-cuk="fbtot" data-cuf="m0" data-tot="${Math.round(total)}">${m0(total)}</text><text x="70" y="86" text-anchor="middle" class="fb-l">da spendere</text></svg>
      <div class="fb-leg">${IN.map((x,i)=>`<div class="fb-r"><i style="background:linear-gradient(135deg,${x.c1},${x.c2})"></i><span>${x.e} ${esc(x.n)}</span><b class="num">${shown[i]} €</b></div>`).join("")}
        <div class="fb-r fb-tot"><span>= totale fino al ${esc(fShort(st.cy.e))}</span><b class="num">${m0(total)}</b></div></div></div>
    <p class="bnote">Sono i soldi da spendere come vuoi fino allo stipendio del ${esc(fShort(nextPay))}: il <b>weekend</b> e il <b>tempo libero</b> (shopping, regali, pranzi fuori, sigarette… decidi tu). Spesa e spese ricorrenti sono a parte${st.P.partial?"":", e il risparmio è già tolto"}${st.deficit>0.5?`; le spese necessarie e gli imprevisti oltre la stima (${m0(st.deficit)}) sono già tolti`:""}.</p>
    <div class="fb-tank">${IN.map((x,i)=>tube(x, shown[i], x.s>0.5?`spesi ${m0(x.s)}`:"intatto")).join("")}<span class="fb-sep" aria-hidden="true"></span>${OUT.map(x=>tube(x, m0(x.left).replace(/\s?€/,""), `${m0(x.s)} di ${m0(x.tot)}`)).join("")}</div>
    <div class="fb-lab"><span>nel totale</span><span>a parte · necessarie</span></div>
    ${bySp.length?`<div class="fb-sp"><small>Tempo libero speso finora</small>${bySp.map(r=>`<span class="fb-chip">${r.c.e} ${esc(r.c.n)} <b class="num">${m0(r.s)}</b></span>`).join("")}</div>`:""}
  </div></section>`;
}

/* ---------- spese ricorrenti vere (Impostazioni → «Spese ricorrenti») ----------
   Netflix 12,99 € il 15 di ogni mese, Amazon Prime 49,90 € ogni 3 marzo…: ognuna diventa una voce delle Spese ricorrenti
   con il suo giorno. Quando arriva un pagamento simile vicino a quel giorno (o dallo stesso negozio) chiedo
   «È Netflix?»; se dici sì imparo il negozio e le volte dopo la segno da sola. */
const REC_EMO=[[/netflix|disney|prime video|now tv|dazn|sky|paramount|infinity/i,"📺"],[/spotify|music|deezer|tidal|youtube/i,"🎵"],[/amazon/i,"📦"],[/icloud|google one|dropbox|onedrive|cloud/i,"☁️"],
  [/palestra|gym|fitness|piscina/i,"🏋️"],[/telefon|iliad|tim\b|vodafone|windtre|wind|fastweb|ho\.|kena|internet|fibra/i,"📱"],[/luce|enel|gas|bolletta|acqua|hera|a2a|edison/i,"💡"],
  [/affitto|mutuo|condominio/i,"🏠"],[/assicurazion|polizza/i,"🛡️"],[/chatgpt|openai|claude|adobe|microsoft|office|software|app/i,"💻"],[/giornale|rivista|abbonamento/i,"📰"],[/treno|abbonamento atm|bus|metro|trasport/i,"🚆"]];
const REC_PRESETS=[["Netflix",13.99],["Spotify",11.99],["Amazon Prime",49.90,"y"],["Disney+",9.99],["Palestra",35],["iCloud",2.99],["YouTube Premium",13.99]];
function recEmoji(n){ const x=REC_EMO.find(([re])=>re.test(n||"")); return x?x[1]:"🔁"; }
/* prossima scadenza di una spesa annuale (mese 0-11 e giorno), dall'inizio del ciclo in corso */
function recNextDue(r){ const s=cycleOf().s; let y=s.getFullYear(); let d=new Date(y, r.month||0, Math.min(r.day||1, 28));
  if(d<s) d=new Date(y+1, r.month||0, Math.min(r.day||1, 28)); return ymd(d); }
/* le spese ricorrenti diventano categorie «fisse» (mensili con il giorno, annuali come accantonamento con la scadenza) */
function recCats(){ return (B.rec||[]).map(r=> r.freq==="y"
  ? { id:"rec_"+r.id, n:r.n, e:r.e||recEmoji(r.n), g:"fisse", plan:r2(r.amt/12), sink:{ annual:r.amt, due:recNextDue(r) }, rec:r.id }
  : { id:"rec_"+r.id, n:r.n, e:r.e||recEmoji(r.n), g:"fisse", plan:r2(r.amt), day:r.day, rec:r.id }); }
/* giorno in cui una spesa fissa mensile cade dentro un ciclo */
function fixedDueIn(c, cy){ if(!c.day) return null; const s=cy.s, same=c.day>=s.getDate();
  const y=s.getFullYear(), m=s.getMonth()+(same?0:1); return new Date(y, m, Math.min(c.day, new Date(y, m+1, 0).getDate())); }
/* il calendario del ciclo: tutte le spese ricorrenti con una data, in ordine */
/* una spesa fissa è pagata quando c'è un movimento che la copre (anche gli abbonamenti da pochi centesimi) */
function fxPaid(r){ return r.s>0.005 && r.s>=Math.min(0.5, (r.c.sink?r.c.sink.annual:r.c.plan||0)*0.6); }
function recCalendar(st){
  const t0=today0(), L=[];
  st.rows.filter(r=>r.c.g==="fisse" && (r.b>0.5 || r.s>0.005 || r.c.rec)).forEach(r=>{ const c=r.c;
    let d=null, amt=c.plan;
    if(c.sink){ const due=sinkDueIn(c, st.cy); if(due){ d=due; amt=c.sink.annual; } }
    else d=fixedDueIn(c, st.cy);
    if(!d) return;
    const start=st.P.partial?parseYmd(st.P.startDate):st.cy.s; if(d<start && !fxPaid(r)) return;   // prima che iniziassi: già pagata
    const paid=fxPaid(r), days=dayDiff(t0,d);
    L.push({ c, d, amt, paid, days, state: paid?"paid": days<0?"late": days===0?"today":"next" }); });
  return L.sort((a,b)=>a.d-b.d);
}
function recCalendarHtml(st){
  const L=recCalendar(st); if(!L.length) return "";
  return `<section><div class="eyebrow" style="margin:0 4px 8px">📅 Gli addebiti di questo mese</div><div class="card rcal">${L.map(x=>`<div class="rcal-r ${x.state}">
      <div class="rcal-d"><b>${x.d.getDate()}</b><small>${x.d.toLocaleDateString("it-IT",{ month:"short" })}</small></div>
      <span class="bc-e">${x.c.e}</span><span class="txm-n">${esc(x.c.n)}<small>${x.state==="paid"?`<span class="fx-ok">✓ pagata</span>`:x.state==="today"?"oggi":x.state==="late"?`${-x.days} ${x.days===-1?"giorno":"giorni"} fa`:`tra ${x.days} ${x.days===1?"giorno":"giorni"}`}</small></span>
      ${x.state==="late"||x.state==="today"?`<button class="fx-pay" data-fxpay="${x.c.id}">Pagata?</button>`:`<b class="num">${money(x.amt)}</b>`}</div>`).join("")}</div></section>`;
}

/* un pagamento che arriva (notifica) è una spesa ricorrente? stesso negozio già imparato, oppure importo simile vicino al giorno */
function recMatch(p){
  const k=merchantKey(p.merchant), d=new Date(p.ts||Date.now()), cy=cycleOf(d);
  const C=B.cats.filter(c=>c.g==="fisse" && (c.rec || c.day || c.sink));
  let best=null;
  C.forEach(c=>{ const r=c.rec?(B.rec||[]).find(x=>x.id===c.rec):null, amt=c.sink?c.sink.annual:c.plan;
    const byShop = r && (r.merchant||[]).includes(k);
    const near = Math.abs(p.amt-amt) <= Math.max(0.5, amt*0.03);
    const due = c.sink ? (c.sink.due?parseYmd(c.sink.due):null) : fixedDueIn(c, cy);
    const close = due && Math.abs(dayDiff(due, new Date(d.getFullYear(),d.getMonth(),d.getDate())))<=4;
    const score = byShop ? 3 : near && close ? 2 : 0;
    if(score && (!best || score>best.score)) best={ c, score }; });
  return best && best.c;
}
function recLearn(c, merchant){
  const k=merchantKey(merchant); if(genericKey(k)) return;
  B.learn=B.learn||{}; B.learnN=B.learnN||{}; B.learn[k]=c.id; B.learnN[k]={ cat:c.id, n:2 };   // n:2 → le prossime volte la segno da sola
  if(c.rec){ const r=(B.rec||[]).find(x=>x.id===c.rec); if(r){ r.merchant=r.merchant||[]; if(!r.merchant.includes(k)) r.merchant.push(k); } }
}

/* ---------- un pagamento appena arrivato diventa una spesa ricorrente ----------
   Il giorno (e per gli annuali il mese) è quello del pagamento, l'importo quello pagato: basta il nome. */
function subGuessName(p){ const k=merchantKey(p.merchant); if(genericKey(k)) return "";
  return String(p.merchant||"").replace(/\s+/g," ").trim().toLowerCase().replace(/(^|[\s.])([a-zà-ù])/g,(m,a,b)=>a+b.toUpperCase()); }
function subFormHtml(p){ const s=B._inSub[p.id], d=new Date(p.ts||Date.now());
  return `<div class="recf subf" data-f="${s.f==="y"?"y":"m"}"><div class="recf-t">🔁 Nuovo abbonamento da questo pagamento</div>
    <label class="fld"><span class="lab">Nome</span><input class="rc-n subN" id="subN_${esc(p.id)}" value="${esc(s.n)}" placeholder="es. Google One, Anthropic, Telefono" autocomplete="off"></label>
    <label class="fld"><span class="lab">Importo (€)</span><input class="rc-a" inputmode="decimal" value="${String(r2(p.amt)).replace(".",",")}"></label>
    <div class="fld"><span class="lab">Ogni quanto</span><div class="recf-fq"><button type="button" class="chip ${s.f!=="y"?"on":""}" data-rc="fq" data-v="m">Ogni mese</button><button type="button" class="chip ${s.f==="y"?"on":""}" data-rc="fq" data-v="y">Ogni anno</button></div></div>
    <label class="fld"><span class="lab">Data del prelievo</span><input class="rc-d" type="date" value="${ymd(d)}"></label>
    <p class="recf-h">Ho messo la data e l'importo di questo pagamento: cambiali se serve.</p>
    <div class="btn-row" style="margin-top:6px"><button class="btn ghost" data-ib="subx" style="flex:0 0 auto;padding:10px 16px">Annulla</button><button class="btn gold" data-ib="subok">Salva l'abbonamento</button></div></div>`; }
function subSave(p, n, f, amt, d){
  amt=amt>0?amt:r2(p.amt); d=d||new Date(p.ts||Date.now()); const k=merchantKey(p.merchant);
  B.rec=B.rec||[];
  // stesso nome già nelle spese ricorrenti: aggiorno quella invece di farne un doppione
  let r=B.rec.find(x=>x.n.toLowerCase()===n.toLowerCase());
  if(!r){ r={ id:uid("rc"), merchant:[] }; B.rec.push(r); }
  Object.assign(r, { n, amt:r2(amt), freq:f, day:d.getDate(), month:f==="y"?d.getMonth():undefined, e:recEmoji(n) });
  if(k && !genericKey(k) && !r.merchant.includes(k)) r.merchant.push(k);
  unfreezePlan(); recalcCats();
  const c=B.cats.find(x=>x.rec===r.id);
  addWalletTx(p, c.id); recLearn(c, p.merchant);
  { const t=B.tx.find(x=>x.id==="np_"+p.id); if(t){ t.buoniAsked=true; t.note=n; } }
  return c;
}

/* ---------- Impostazioni: elenco delle spese ricorrenti ---------- */
let REC_EDIT=null;   // id in modifica, "new" per una nuova
function recRows(){
  const L=[];
  B.cats.filter(c=>c.g==="fisse").forEach(c=>{
    if(c.rec){ const r=(B.rec||[]).find(x=>x.id===c.rec); if(r) L.push({ key:"r:"+r.id, e:c.e, n:r.n, amt:r.amt, freq:r.freq, day:r.day, month:r.month, mine:true }); return; }
    if(c.sink){ if(!(c.sink.annual>0)) return; const d=c.sink.due?parseYmd(c.sink.due):null; L.push({ key:"c:"+c.id, e:c.e, n:c.n, amt:c.sink.annual, freq:"y", day:d?d.getDate():null, month:d?d.getMonth():null }); return; }
    if(!(c.plan>0)) return; L.push({ key:"c:"+c.id, e:c.e, n:c.n, amt:c.plan, freq:"m", day:c.day||null, est:!c.edited });
  });
  return L;
}
const REC_MESI=["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
function recWhen(x){ return x.freq==="y" ? (x.day!=null&&x.month!=null?`ogni anno il ${x.day} ${REC_MESI[x.month]}`:"ogni anno") : (x.day?`ogni mese il ${x.day}`:"ogni mese"); }
/* data del prossimo prelievo di una riga (per riempire il campo data) */
function recNextYmd(x){ if(!x || !x.day) return "";
  const t0=today0();
  if(x.freq==="y"){ const m=x.month!=null?x.month:t0.getMonth(); let d=new Date(t0.getFullYear(), m, Math.min(x.day, new Date(t0.getFullYear(), m+1, 0).getDate()));
    if(d<t0) d=new Date(t0.getFullYear()+1, m, Math.min(x.day, new Date(t0.getFullYear()+1, m+1, 0).getDate())); return ymd(d); }
  let d=new Date(t0.getFullYear(), t0.getMonth(), Math.min(x.day, new Date(t0.getFullYear(), t0.getMonth()+1, 0).getDate()));
  if(d<t0) d=new Date(t0.getFullYear(), t0.getMonth()+1, Math.min(x.day, new Date(t0.getFullYear(), t0.getMonth()+2, 0).getDate())); return ymd(d); }
/* il modulo: nome, importo, ogni mese / ogni anno, data del prelievo. I campi si leggono dal modulo stesso (può comparire in due posti) */
function recFormHtml(x){
  const isNew=!x; x=x||{ n:"", amt:"", freq:"m" };
  const lockF=x.key&&x.key.startsWith("c:");
  return `<div class="recf" data-key="${esc(x.key||"new")}" data-f="${x.freq==="y"?"y":"m"}">
    ${isNew?`<div class="recf-t">Scegli un abbonamento comune o scrivilo tu</div><div class="recf-pre">${REC_PRESETS.map(([n,a,f])=>`<button type="button" class="chip" data-rc="pre" data-n="${esc(n)}" data-a="${a}" data-f="${f||"m"}">${recEmoji(n)} ${esc(n)}</button>`).join("")}</div>`:""}
    <label class="fld"><span class="lab">Nome</span><input class="rc-n" value="${esc(x.n)}" placeholder="es. Anthropic, Telefono, Netflix" autocomplete="off"></label>
    <label class="fld"><span class="lab">Importo (€)</span><input class="rc-a" inputmode="decimal" value="${x.amt!==""?String(x.amt).replace(".",","):""}" placeholder="21,95"></label>
    <div class="fld"><span class="lab">Ogni quanto</span><div class="recf-fq">
      <button type="button" class="chip ${x.freq!=="y"?"on":""}" data-rc="fq" data-v="m" ${lockF&&x.freq==="y"?"disabled":""}>Ogni mese</button>
      <button type="button" class="chip ${x.freq==="y"?"on":""}" data-rc="fq" data-v="y" ${lockF&&x.freq!=="y"?"disabled":""}>Ogni anno</button></div></div>
    <label class="fld"><span class="lab">Data del prelievo</span><input class="rc-d" type="date" value="${recNextYmd(x)}"></label>
    <p class="recf-h">${x.freq==="y"?"Il giorno dell'addebito annuale: te lo ricordo e metto da parte un pezzo ogni mese.":"Un giorno in cui ti arriva l'addebito: da lì lo riconosco tutti i mesi."}</p>
    <div class="btn-row" style="margin-top:6px"><button type="button" class="btn ghost" data-rc="cancel">Annulla</button><button type="button" class="btn gold" data-rc="save">Salva</button></div></div>`;
}
function recListHtml(){
  if(!B.setup) return `<p class="hint" style="margin:0;color:var(--muted);font-size:12px">Rispondi prima alle domande del Budget.</p>`;
  const L=recRows(), tm=L.filter(x=>x.freq!=="y").reduce((a,x)=>a+x.amt,0), ty=L.filter(x=>x.freq==="y").reduce((a,x)=>a+x.amt,0);
  return `<p class="hint" style="margin:0 0 10px;color:var(--muted);font-size:12px">Abbonamenti e spese che tornano sempre uguali (telefono, Netflix, Spotify, palestra, Amazon Prime…). Con la data del prelievo riconosco il pagamento quando arriva, e se non arriva ti chiedo se è stato pagato. In tutto <b>${money(tm)}</b> al mese${ty?` e <b>${money(ty)}</b> all'anno`:""}.</p>
    <div class="recl">${L.map(x=>REC_EDIT===x.key ? recFormHtml(x) : `<div class="recr"><span class="bc-e">${x.e}</span><span class="txm-n">${esc(x.n)}<small>${recWhen(x)}${x.est?" · stima, mettila vera":""}${x.day?"":` · <b class="warn">manca la data</b>`}</small></span><b class="num">${money(x.amt)}</b>
      <button type="button" class="recb" data-rc="edit" data-key="${esc(x.key)}" aria-label="Modifica ${esc(x.n)}">✎</button><button type="button" class="recb" data-rc="del" data-key="${esc(x.key)}" aria-label="Togli ${esc(x.n)}">✕</button></div>`).join("")}</div>
    ${REC_EDIT==="new" ? recFormHtml(null) : `<button type="button" class="btn" data-rc="add" style="margin-top:8px">＋ Aggiungi un abbonamento o una spesa ricorrente</button>`}`;
}
/* lo stesso elenco sta nelle Impostazioni e nella finestra 🔁 Spese ricorrenti del Budget */
function renderRecSettings(){ const h=recListHtml(); ["sRec","ricRec"].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=h; }); }
function recAfter(){ unfreezePlan(); recalcCats(); bSave(); renderBudget(); renderRecSettings(); if(typeof syncNativeCats==="function") syncNativeCats(); if(typeof renderPiano==="function") try{ renderPiano(); }catch(e){} }
function recFocus(sel){ setTimeout(()=>{ const box=[...document.querySelectorAll(".recf")].find(b=>b.offsetParent); if(!box) return; box.scrollIntoView({ behavior:"smooth", block:"center" }); const i=sel&&box.querySelector(sel); if(i) i.focus(); },60); }
document.addEventListener("click",e=>{ const b=e.target.closest("[data-rc]"); if(!b) return; const a=b.dataset.rc, box=b.closest(".recf");
  if(a==="add"){ REC_EDIT="new"; renderRecSettings(); recFocus(); return; }
  if(a==="cancel"){ REC_EDIT=null; renderRecSettings(); return; }
  if(a==="fq"){ if(!box||b.disabled) return; box.dataset.f=b.dataset.v; box.querySelectorAll('[data-rc="fq"]').forEach(x=>x.classList.toggle("on", x===b));
    const h=box.querySelector(".recf-h"); if(h) h.textContent=b.dataset.v==="y"?"Il giorno dell'addebito annuale: te lo ricordo e metto da parte un pezzo ogni mese.":"Un giorno in cui ti arriva l'addebito: da lì lo riconosco tutti i mesi."; return; }
  if(a==="pre"){ if(!box) return; box.querySelector(".rc-n").value=b.dataset.n; box.querySelector(".rc-a").value=String(b.dataset.a).replace(".",",");
    const fb=box.querySelector(`[data-rc="fq"][data-v="${b.dataset.f}"]`); if(fb) fb.click(); box.querySelectorAll('[data-rc="pre"]').forEach(x=>x.classList.toggle("on", x===b)); return; }
  if(a==="edit"){ REC_EDIT=b.dataset.key; renderRecSettings(); recFocus(".rc-a"); return; }
  if(a==="del"){ const key=b.dataset.key, row=recRows().find(x=>x.key===key); if(!row) return;
    if(!confirm(`Togliere «${row.n}» dalle spese ricorrenti?`)) return;
    if(key.startsWith("r:")) B.rec=(B.rec||[]).filter(r=>"r:"+r.id!==key);
    else { const c=B.cats.find(x=>"c:"+x.id===key); if(c){ if(c.sink){ c.sink.annual=0; c.plan=0; c.sinkEdited=true; } else { c.plan=0; c.edited=true; delete c.lo; delete c.hi; } } }
    if(REC_EDIT===key) REC_EDIT=null; toast(`«${row.n}» tolta`); recAfter(); return; }
  if(a==="save"){ if(!box) return; const key=box.dataset.key, n=box.querySelector(".rc-n").value.trim(), amt=r2(num(box.querySelector(".rc-a").value)), freq=box.dataset.f==="y"?"y":"m", dv=box.querySelector(".rc-d").value;
    if(!n){ toast("Scrivi il nome"); box.querySelector(".rc-n").focus(); return; }
    if(!(amt>0)){ toast("Scrivi l'importo"); box.querySelector(".rc-a").focus(); return; }
    if(!dv){ toast("Scegli la data del prelievo"); box.querySelector(".rc-d").focus(); return; }
    const dt=parseYmd(dv), day=dt.getDate(), month=dt.getMonth();
    if(key==="new" || key.startsWith("r:")){
      B.rec=B.rec||[]; let r=key==="new"?null:B.rec.find(x=>"r:"+x.id===key);
      if(!r){ r={ id:uid("rc"), merchant:[] }; B.rec.push(r); }
      Object.assign(r, { n, amt, freq, day, month:freq==="y"?month:undefined, e:recEmoji(n) });
    } else { const c=B.cats.find(x=>"c:"+x.id===key); if(c){ c.n=n;
        if(c.sink){ c.sink.annual=amt; let due=new Date(dt); while(due<today0()) due=new Date(due.getFullYear()+1, due.getMonth(), due.getDate()); c.sink.due=ymd(due); c.plan=r2(amt/12); c.sinkEdited=true; }
        else { c.plan=amt; c.day=day; c.edited=true; delete c.lo; delete c.hi; } } }
    REC_EDIT=null; toast(`«${n}» salvata: ${money(amt)} ${freq==="y"?`ogni anno il ${day} ${REC_MESI[month]}`:`ogni mese il ${day}`}`); recAfter(); return; }
});

/* una spesa in una riga, toccandola si modifica */
function txMini(t){ const c=catById(t.cat), moved=budgetCat(t)!==t.cat;
  return `<button class="txm" data-b="edit" data-v="${esc(t.id)}"><span class="bc-e">${c.e}</span><span class="txm-n">${esc(t.note||c.n)}<small>${esc(c.n)}${moved&&budgetCat(t)==="weekend"?" · nel weekend":""} · ${esc(fDay(t.d))}${t.buoniN?` · 🎟️ ${t.buoniN}`:""}</small></span><b class="num">−${money(t.amt)}</b></button>`; }
/* spesa pagata con soldi veri (senza la parte in buoni) */
function st_cashSpent(T){ return T.filter(t=>t.type!=="in" && budgetCat(t)==="spesa").reduce((a,t)=>a+t.amt-(t.buoniVal||0),0); }
/* ---------- i quattro budget sulla pagina del Budget ----------
   Il serbatoio grande è diviso in quattro pezzi: 💸 Tempo libero, 🎉 Weekend, 🛒 Spesa, 🔁 Ricorrenti.
   Il numero in alto è la somma esatta di quello che resta nei quattro: i soldi che ti restano fino allo stipendio.
   Toccando un pezzo (o il suo cerchio in alto) si apre la finestra con i dettagli solo di quel budget. */
const B4_COL={ libero:["#f2cf82","#b8862f"], weekend:["#9fb2f2","#5f6fc0"], spesa:["#8fe0b1","#3f9c6a"], ric:["#7fd6d0","#2f8f8a"] };
function tank4Html(st){
  const G=st.groups, total=st.remaining, shown=roundToSum(G.map(g=>Math.max(0,g.left)), Math.max(0,total));
  const capT=G.reduce((a,g)=>a+Math.max(g.cap,1),0);
  const bl=st.buoniLeft||{ n:0, val:0 };
  return `<div class="t4"><div class="t4-h"><small>Soldi che ti restano fino al ${esc(fShort(st.cy.e))}</small>
      <b class="num ${total<0?"neg":""}" data-cu="${Math.max(0,total).toFixed(2)}" data-cuk="t4tot">${money(Math.max(0,total))}</b>
      <span>${total<0?`sei sotto di <b class="neg">${money(-total)}</b>`:`${G.map((g,i)=>`${g.e} ${shown[i]}`).join(" + ")} = <b>${m0(total)}</b>`}</span>
      ${bl.n>0?`<span class="t4-bu">🎟️ in più hai <b>${bl.n} buoni pasto</b> (${m0(bl.val)}): non sono soldi, valgono solo per la spesa e i pasti</span>`:""}</div>
    <div class="t4-tank">${G.map((g,i)=>{ const f=g.cap>0?Math.max(0,Math.min(1,g.left/g.cap)):0, [c1,c2]=B4_COL[g.id];
      return `<button class="t4-col ${f<0.15 && !(g.id==="spesa"&&bl.n>0)?"low":""}" data-sec="${g.id}" style="--c1:${c1};--c2:${c2};--h:${(f*100).toFixed(1)}%;flex-grow:${Math.max(0.55,Math.max(g.cap,1)/capT*4).toFixed(2)}" aria-label="${esc(g.n)}: restano ${shown[i]} euro">
        <div class="fb-liq"><i class="fb-w1"></i><i class="fb-w2"></i><b class="fb-bub"></b><b class="fb-bub"></b><b class="fb-bub"></b></div>
        <span class="t4-v num">${shown[i]}<small>€</small></span>${g.id==="spesa"&&bl.n>0?`<span class="t4-bb">+🎟️${bl.n}</span>`:""}<span class="t4-l"><span>${g.e}</span>${esc(g.n)}</span></button>`; }).join("")}</div>
    <div class="t4-f">tocca un pezzo per vedere le sue spese</div></div>`;
}
document.addEventListener("click",e=>{ const b=e.target.closest("[data-sec]"); if(!b || typeof openSec!=="function") return; openSec(b.dataset.sec); });

/* livello di un budget nella sua finestra */
function b4Head(g, sub, extra){
  const [c1,c2]=B4_COL[g.id], f=g.cap>0?Math.max(0,Math.min(1,g.left/g.cap)):0;
  return `<section><div class="card b4h" style="--c1:${c1};--c2:${c2}"><div class="b4h-n"><small>restano</small><b class="num">${money(g.left)}</b><span>spesi <b class="num">${money(g.s)}</b> su ${money(g.cap)}${g.id==="spesa"?" (soldi veri)":""}</span>${extra||""}</div>
    <div class="b4h-bar"><i style="width:${(f*100).toFixed(1)}%"></i></div>${sub?`<p class="bnote">${sub}</p>`:""}</div></section>`;
}
function liberoHtml(st){
  const g=st.groups.find(x=>x.id==="libero"), pr=st.pool.rows, T=st.T.filter(t=>t.type!=="in" && pr.some(r=>r.c.id===budgetCat(t))).sort((a,b)=>a.d<b.d?1:-1);
  const by=pr.filter(r=>r.s>0.005).sort((a,b)=>b.s-a.s);
  return b4Head(g, `Un unico salvadanaio per quello che vuoi: shopping, regali, pranzi e cene fuori, sigarette… Decidi tu. Circa <b class="num">${money(g.left/Math.max(1,st.daysLeft))}</b> al giorno fino al ${esc(fShort(st.cy.e))}.`)
    + (by.length?`<section><div class="fb-sp">${by.map(r=>`<span class="fb-chip">${r.c.e} ${esc(r.c.n)} <b class="num">${m0(r.s)}</b></span>`).join("")}</div></section>`:"")
    + `<section><div class="eyebrow" style="margin:0 4px 8px">Le spese</div><div class="card txls">${T.length?`<div class="txl">${T.map(txMini).join("")}</div>`:`<p class="bnote" style="margin:0">Ancora nessuna spesa di tempo libero.</p>`}</div></section>`
    + daysHtml(st);
}
/* le spese ricorrenti: quali sono, quanto ne ho previsto per questo mese e perché */
function ricHtml(st){
  const g=st.groups.find(x=>x.id==="ric"), t0=today0();
  const R=st.ric.rows.filter(r=>r.b>0.005 || r.s>0.005 || (r.c.g==="fisse" && (r.c.rec || r.c.plan>0)));
  const kind=r=>r.c.sink?"acc":r.c.g==="fisse"?"fix":"var";
  const row=r=>{ const c=r.c; let sub="";
    if(c.sink){ const f=r.fund||{}; sub = r.b>(f.monthly||0)+1 ? `<b class="warn">da pagare in questo mese</b>${f.due?` · scade ${f.due.toLocaleDateString("it-IT",{ day:"numeric", month:"short" })}`:""}` : `metti da parte ${money(f.monthly||r.b)} al mese${f.due?` per la scadenza del ${f.due.toLocaleDateString("it-IT",{ day:"numeric", month:"short", year:"numeric" })}`:""}`; }
    else if(c.g==="fisse"){ const paid=fxPaid(r);
      if(paid) sub=`<span class="fx-ok">✓ pagata</span>`;
      else if(c.day){ const due=new Date(st.cy.s.getFullYear(), st.cy.s.getMonth()+(c.day<st.cy.s.getDate()?1:0), Math.min(c.day,28)), before=st.P.partial && due<parseYmd(st.P.startDate);
        sub = before ? `si paga il ${c.day}: questo mese era prima che iniziassi, conta dal prossimo` : due<=t0 ? `<button class="fx-pay" data-fxpay="${c.id}">È stata pagata?</button>` : `si paga il ${c.day}`; }
      else sub="fissa ogni mese"; }
    else sub = st.P.learned && st.P.learned[c.id]!=null ? "stima dalle tue spese reali" : "stima dalle tue risposte";
    return `<div class="ricr"><span class="bc-e">${c.e}</span><span class="txm-n">${esc(c.n)}<small>${sub}</small></span><span class="ricv num"><b>${mx(r.s)}</b> / ${mx(r.b>0.005?r.b:(c.sink?(r.fund||{}).monthly||c.plan:c.plan))}</span></div>`; };
  const part=(k,t,note)=>{ const L=R.filter(r=>kind(r)===k); if(!L.length) return ""; const tb=L.reduce((a,r)=>a+r.b,0);
    return `<div class="txl"><div class="txl-h"><span>${t}</span><b class="num">${mx(tb)}</b></div>${note?`<p class="bnote" style="margin:0 2px 4px">${note}</p>`:""}${L.map(row).join("")}</div>`; };
  const T=st.T.filter(t=>t.type!=="in" && st.ric.rows.some(r=>r.c.id===budgetCat(t))).sort((a,b)=>a.d<b.d?1:-1);
  return b4Head(g, `Sono le spese che tornano tutti i mesi: quelle che cambiano (benzina, salute, casa), quelle fisse e gli accantonamenti per le spese annuali. ${st.P.partial?`Questo mese le conto per i ${st.P.remDays} giorni che mancano allo stipendio.`:""}`)
    + recCalendarHtml(st)
    + `<section id="ricMan"><div class="eyebrow" style="margin:0 4px 8px">✎ I tuoi abbonamenti e le spese ricorrenti</div><div class="card" id="ricRec">${recListHtml()}</div></section>`
    + `<section><div class="card txls">${part("var","⛽ Cambiano ogni mese","")}${part("fix","📌 Fisse","")}${part("acc","🛡️ Accantonamenti","Non le paghi ogni mese: tengo da parte un pezzo al mese, così quando arriva la scadenza i soldi ci sono.")}</div></section>`
    + `<section><div class="eyebrow" style="margin:0 4px 8px">Le spese</div><div class="card txls">${T.length?`<div class="txl">${T.map(txMini).join("")}</div>`:`<p class="bnote" style="margin:0">Ancora nessuna spesa ricorrente segnata.</p>`}</div></section>`;
}

function weekendsHtml(st){
  const W=weekendList(st); if(!W || !W.L.length) return "";
  const lab=w=>`${w.sat.getDate()}–${w.sun.getDate()} ${w.sun.toLocaleDateString("it-IT",{ month:"short" })}`;
  const cards=W.L.map(w=>{
    const d=w.spent-w.target, past=w.state==="past";
    const verdict = past ? (d>1?`<span class="neg">+${m0(d)} sopra</span>`:d<-1?`<span class="pos">${m0(-d)} risparmiati</span>`:`in linea`)
      : w.state==="now" ? (w.spent>0?`restano <b>${m0(Math.max(0,w.target-w.spent))}</b>`:`puoi spendere <b>${m0(w.target)}</b>`) : "";
    return `<div class="wkc ${w.state}"><div class="wk-d">${w.state==="now"?"questo weekend":past?"":"prossimo"}<b>${lab(w)}</b></div>
      ${past||w.state==="now"?speedo(w.spent,w.target):`<div class="wk-fut num">${m0(w.target)}</div>`}
      <div class="wk-s">${past||w.state==="now"||w.spent>0?`speso <b class="num">${m0(w.spent)}</b> su ${m0(w.target)}`:"puoi spendere"}</div><div class="wk-v">${verdict}</div></div>`; }).join("");
  const moved=W.share-W.base;
  const lists=W.L.filter(w=>w.tx.length).map(w=>`<div class="txl"><div class="txl-h"><span>🎉 ${w.state==="now"?"Questo weekend":w.state==="past"?"Weekend":"Prossimo weekend"} ${lab(w)}</span><b class="num">${money(w.spent)}</b></div>${w.tx.slice().sort((a,b)=>a.d<b.d?1:-1).map(txMini).join("")}</div>`).join("");
  return `<section><div class="eyebrow" style="margin:0 4px 8px">I weekend del mese</div><div class="wks">${cards}</div>
    ${lists?`<div class="eyebrow" style="margin:14px 4px 8px">Le spese dei weekend</div><div class="card txls">${lists}</div>`:`<p class="bnote">Nessuna spesa nei weekend per ora. Contano qui le spese «Weekend e uscite», i pasti di sabato e domenica e tutto quello che segni con «🎉 Conta nel weekend».</p>`}
    <p class="bnote">Il weekend va dal venerdì alle 18 alla domenica alle 5. Quota ${m0(W.base)} a weekend (${m0(W.wk.b0||W.wk.b)} in tutto)${W.L.some(w=>w.state==="past")?`: quello che è avanzato dai weekend finiti (${W.moved>=0?"+":"−"}${m0(Math.abs(W.moved))}) è passato al Tempo libero`:""}.${Math.abs(moved)>=1&&W.L.some(w=>w.state==="past")?` Per i weekend che mancano ora è ${m0(W.share)}: ${moved>0?"quello che hai risparmiato si aggiunge":"quello che hai speso in più si toglie"} da qui.`:""} Lo spesometro: lancetta a sinistra = hai speso meno, a destra = di più.</p></section>`;
}
/* quanto puoi mettere da parte in più rispetto all'obiettivo */
function extraSaveHtml(st){
  const W=weekendList(st);
  const wkSaved=W?W.L.filter(w=>w.state==="past").reduce((a,w)=>a+w.target-w.spent,0):0;   // netto: un weekend sotto compensa uno sopra
  const secured=Math.max(0,(st.credit||0)+wkSaved), possible=Math.max(0,st.free);
  if(!(possible>1) && !(secured>1)) return "";
  const f=possible>0?Math.min(1,secured/possible):1;
  return `<section><div class="card tank"><div class="bw-h">💰 Risparmio in più</div>
    <div class="tank-row">${ringSvg([{ f, c:"pos" },{ f:1-f, c:"pos soft" }], null, "+"+m0(possible), "possibili", "Risparmio in più possibile")}
      <div class="tank-k"><div><small><i class="dot pos"></i>già guadagnati</small><b class="num pos">${m0(Math.min(secured,possible))}</b></div>
        <div><small><i class="dot pos soft"></i>se non spendi il tempo libero rimasto</small><b class="num">${m0(possible)}</b></div></div></div>
    <p class="bnote" style="margin-top:6px">Oltre all'obiettivo del mese. ${secured>=1?`Hai già risparmiato ${m0(secured)} (${wkSaved>=1?`weekend sotto la quota, al netto di quelli sopra: ${m0(wkSaved)}`:""}${wkSaved>=1&&st.credit>=1?", ":""}${st.credit>=1?`necessarie sotto il previsto ${m0(st.credit)}`:""}): se i prossimi weekend restano nella quota iniziale, li metti da parte.`:`Ogni euro di tempo libero che non spendi a fine mese diventa avanzo da investire.`}</p></div></section>`;
}

/* vizi */
function viceStats(c){
  const from=ymd(addDays(today0(),-90));
  const L=B.tx.filter(t=>t.cat===c.id && t.type!=="in" && t.d>=from).sort((a,b)=>a.d<b.d?-1:1);
  const tot=L.reduce((s,t)=>s+t.amt,0);
  const span = L.length ? Math.max(30, dayDiff(parseYmd(L[0].d), today0())+1) : 0;
  const expected = c.vice ? c.vice.price*c.vice.perWeek*W2M : c.plan;
  const monthly = L.length>=3 ? tot/span*30.44 : expected;
  let every=null;
  if(L.length>=2){ every=dayDiff(parseYmd(L[0].d),parseYmd(L[L.length-1].d))/(L.length-1); }
  else if(c.vice && c.vice.perWeek>0){ every=7/c.vice.perWeek; }
  const rr=(typeof fzRate==="function")?fzRate():0.05, i=Math.pow(1+rr,1/12)-1, fv10=i>0?monthly*((Math.pow(1+i,120)-1)/i):monthly*120;
  return { n:L.length, monthly, yearly:monthly*12, every, fv10, real:L.length>=3 };
}

/* benzina */
function fuelStats(){
  const from=ymd(addDays(today0(),-90));
  const L=B.tx.filter(t=>t.cat==="benzina" && t.type!=="in" && t.d>=from);
  if(!L.length) return null;
  const tot=L.reduce((s,t)=>s+t.amt,0);
  const first=L.reduce((m,t)=>t.d<m?t.d:m, L[0].d);
  const span=Math.max(30, dayDiff(parseYmd(first),today0())+1);
  const lit=L.filter(t=>t.l>0), km=L.filter(t=>t.km>0);
  const eurL = lit.length ? lit.reduce((s,t)=>s+t.amt,0)/lit.reduce((s,t)=>s+t.l,0) : null;
  const per100 = km.length ? km.reduce((s,t)=>s+t.amt,0)/km.reduce((s,t)=>s+t.km,0)*100 : null;
  return { monthly:tot/span*30.44, n:L.length, eurL, per100 };
}

/* ---------- UI: pagina Budget ---------- */
function bar(p, cls){ p=Math.max(0,Math.min(1,p||0)); return `<div class="bbar"><div class="bfill ${cls||""}" style="width:${(p*100).toFixed(1)}%"></div></div>`; }

function renderBudget(){
  const el=$("#budBody"); if(!el) return;
  if(!B.setup){
    el.innerHTML=`<section><div class="card bwelcome">
      <div class="eyebrow">Benvenuto nel budget</div>
      <h2 class="bw-t">Capiamo quanto puoi mettere da parte</h2>
      <p class="sec-sub">Qualche domanda su entrate, spese, auto, cosa hai investito, il tuo Replay e quanto rischio vuoi (5 minuti). Ne escono il budget, tre modi di risparmiare e il piano d'investimento, tutto collegato. Le spese le segni con il tasto <b>+</b>.</p>
      <button class="btn gold" data-b="quiz">Inizia</button></div></section>`;
    return;
  }
  const st=bStatus(), cy=st.cy, P=st.P;
  const mName=(cy.s.getDate()>15?cy.e:cy.s).toLocaleDateString("it-IT",{month:"long"});
  const timeP=1-(st.daysLeft-1)/cy.days;
  let h=`<section id="budStories"></section><section class="bhero">
    <div class="eyebrow">${esc(mName)} · ${fShort(cy.s)} – ${fShort(cy.e)} · ${st.daysLeft===1?"ultimo giorno":"restano "+st.daysLeft+" giorni"}</div>
    ${tank4Html(st)}
    <div class="bh-time"><div class="bh-tb"><i style="width:${Math.round(timeP*100)}%"></i></div>mese trascorso al ${Math.round(timeP*100)}%</div>
    <div class="deltas">
      <span class="dchip">${P.partial?"sul conto all'inizio":"entrate"} <b class="num">${m0(P.net+st.salDiff+(P.partial?0:st.extraIn))}</b></span>${P.partial&&st.extraIn>0?`<span class="dchip pos">entrate extra <b class="num">+${m0(st.extraIn)}</b></span>`:""}
      <span class="dchip">spese finora <b class="num">${m0(st.spentAll)}</b></span>
      ${buoniOn()?`<span class="dchip" data-b="buoniFix" role="button">🎟️ buoni <b class="num">${B.buoni.bal}</b> ✎</span>`:""}
    </div>
  </section>`;
  // sezioni che si aprono dai cerchi in alto (finestre), non più tutte nella pagina
  const SEC={ libero:"", weekend:"", spesa:"", ric:"", goal:"" };
  if(P.partial){
    const wl=weekendsLeft(cy), wk=st.rows.find(r=>r.c.id==="weekend");
    SEC.goal+=`<section><details class="card bplan bfold"><summary><span class="bw-h">🧮 Fino al ${fShort(cy.e)}</span><span class="bf-s">${m0(P.wants)} per il tempo libero · primo mese, niente obiettivo <i>conti ▾</i></span></summary>
      <div class="bp-row"><span>Soldi sul conto (${esc(fDay(P.startDate))})</span><b class="num">${money(P.net)}</b></div>
      ${P.buoni>0?`<div class="bp-row"><span>Buoni pasto per la spesa (${P.buoniN} × ${money(num(B.ans.buoni))})</span><b class="num">+${money(P.buoni)}</b></div>`:""}
      <div class="bp-row"><span>Spese necessarie e fisse dei ${P.remDays} giorni che mancano</span><b class="num">−${money(P.needs)}</b></div>
      ${P.replayRes>0?`<div class="bp-row"><span>Replay del ${P.replayDate.toLocaleDateString("it-IT",{ day:"numeric", month:"short" })}, prima del prossimo stipendio</span><b class="num">−${money(P.replayRes)}</b></div>`:""}
      ${P.save>0?`<div class="bp-row"><span>Da mettere ancora da parte (obiettivo ${m0(P.goal)}: già fatti ${m0(P.saved)}${P.replayRes>0?` + Replay ${m0(P.replayRes)}`:""})</span><b class="num">−${money(P.save)}</b></div>`:""}
      <div class="bp-row"><span>Per il tempo libero</span><b class="num">${money(P.wants)}</b></div>
      ${P.belowFloor?`<p class="bnote warn" style="margin-top:6px">Fino allo stipendio i soldi per il tempo libero sono meno del minimo che avevi indicato (${m0(P.floor)}): vai piano con le spese non necessarie.</p>`:""}
      ${wk?`<p class="bnote" style="margin-top:8px">Nei prossimi ${wl} weekend puoi spendere circa <b class="num">${money(Math.max(0,wk.left)/wl)}</b> a weekend.</p>`:""}
      <p class="bnote">Primo mese: non ti chiedo di mettere da parte niente, fino al ${fShort(cy.e)} gestisci questi soldi.${P.saved+P.replayRes>0?` Già messi da parte: ${m0(P.saved)}${P.replayRes>0?` più il Replay di ${m0(P.replayRes)}`:""}.`:""} L'obiettivo di ${m0(P.goalNext||0)} al mese parte con il prossimo stipendio. Le spese fatte prima del ${esc(fDay(P.startDate))} non le conto. Quello che avanza a fine mese te lo propongo da investire.</p></details></section>`;
  }

  SEC.spesa+=tankHtml(st);
  { const sp=st.T.filter(t=>t.type!=="in" && budgetCat(t)==="spesa").sort((a,b)=>a.d<b.d?1:-1), tot=sp.reduce((a,t)=>a+t.amt,0);
    SEC.spesa+=`<section><div class="eyebrow" style="margin:0 4px 8px">Le spese della spesa</div><div class="card txls">${sp.length?`<div class="txl"><div class="txl-h"><span>🛒 Da ${esc(fDay(st.P.partial?st.P.startDate:ymd(st.cy.s)))}</span><b class="num">${money(tot)}</b></div>${sp.map(txMini).join("")}</div>`:`<p class="bnote" style="margin:0">Ancora nessuna spesa al supermercato in questo mese.</p>`}</div></section>`; }
  SEC.goal+=saveTankHtml(st);
  SEC.goal+=`<section><button class="stat-link" data-b="goto" data-v="stat">📊 Statistiche: risparmi mese per mese e portafoglio <span>→</span></button></section>`;

  // pagamenti letti dalle notifiche
  h+=inboxHtml();

  // stipendio: nei giorni in cui arriva chiedo conferma dell'importo
  const pay=rng(B.ans,"payday"), sinceStart=dayDiff(cy.s,today0());
  if(st.sal==null && sinceStart<=pay[1]-pay[0]+5){
    h+=`<section><div class="card bplan"><div class="bw-h">💶 È arrivato lo stipendio?</div>
      <p class="bnote" style="margin-top:0">Lo aspetti tra il ${pay[0]} e il ${pay[1]}. Conferma quanto è arrivato: se è diverso dal solito ricalcolo il mese.</p>
      <div class="rng" style="margin-top:10px"><input id="salAmt" inputmode="decimal" value="${fmtIn(num(B.ans.net))}"><button class="btn gold" data-b="salary" style="width:auto;padding:12px 18px">È arrivato</button></div></div></section>`;
  } else if(st.sal!=null && Math.abs(st.salDiff)>0.5){
    h+=`<section><p class="bnote" style="margin-top:0">Stipendio di questo mese: <b class="num">${money(st.sal)}</b> (${st.salDiff>0?"+":"−"}${money(Math.abs(st.salDiff))} rispetto al solito, già nel risparmio). <button class="add" data-b="salreset">Correggi</button></p></section>`;
  }

  h+=buoniHtml(st);
  // fine mese: i risparmi vanno nel salvadanaio da investire (Portafoglio)
  if(typeof potSuggest==="function"){ const sg=potSuggest(); if(sg && sg.amt>0) h+=`<section><div class="card bplan" data-b="goto" data-v="portafoglio"><div class="bw-h">🐖 Fine mese: investi i risparmi di ${esc(sg.name)}</div><p class="bnote" style="margin-top:0">Hai messo da parte circa <b class="num">${money(sg.amt)}</b> oltre al Replay. Nel Portafoglio li aggiungi al salvadanaio e scegli cosa comprare →</p></div></section>`; }

  // avanzi del mese scorso: proposte
  if(typeof surplusHtml==="function") h+=surplusHtml();

  // (il patrimonio è nel Portafoglio e nelle Statistiche)

  // dove vanno i risparmi
  // (dove mettere i risparmi: è nel Piano)

  // ricalibrazione: una riga sola
  if(st.deficit>0.5) h+=`<section><p class="bnote warn" style="margin:0 4px">⚖️ ${st.extra>0?`Imprevisti ${money(st.extra)}`:""}${st.extra>0&&st.overNeeds>0?" e ":""}${st.overNeeds>0?`spese necessarie sopra la stima ${money(st.overNeeds)}`:""}: li ho tolti da tempo libero e weekend.${st.free<0?` Mancano ${money(-st.free)}: escono dal risparmio.`:""}</p></section>`;

  // weekend del mese, spesometri e risparmio in più
  SEC.weekend+=weekendsHtml(st);

  SEC.libero+=liberoHtml(st);
  SEC.ric+=ricHtml(st);

  // allineamento con la banca: negli ultimi giorni del mese e nei primi del successivo
  const prev=cycleOf(addDays(cy.s,-1));
  const prevDue = B.setup && parseYmd(B.setup.slice(0,10))<=prev.e && dayDiff(cy.s,today0())<7 && !(B.recon||{})[prev.key];
  const curDue = st.daysLeft<=3 && !(B.recon||{})[cy.key];
  if(prevDue || curDue){
    const c=prevDue?prev:cy, nm=(c.s.getDate()>15?c.e:c.s).toLocaleDateString("it-IT",{month:"long"});
    h+=`<section><div class="card bplan" data-b="recon" data-v="${c.key}"><div class="bw-h">🏦 Chiudi ${esc(nm)}: hai segnato tutto?</div>
      <p class="bnote" style="margin-top:0">Confronta con l'app della banca: se hai speso più di quanto registrato, la differenza entra come «Spese non registrate» e il budget si ricalibra.</p></div></section>`;
  }

  // movimenti
  const IV=invList(P.partial?P.startDate:ymd(cy.s), ymd(cy.e)).map(x=>({ id:x.id, d:x.d, type:"inv", amt:x.amt, note:`Comprate ${x.n} ${shortName(x.t)}` }));
  const T=st.T.concat(IV).sort((a,b)=>a.d<b.d?1:(a.d>b.d?-1:(a.id<b.id?1:-1)));
  h+=`<section id="bx-mov"><div class="card-h" style="padding:0 4px;margin-bottom:8px"><div class="eyebrow">Movimenti del mese</div><button class="add" data-b="add">+ Aggiungi</button></div>`;
  if(!T.length) h+=`<div class="bempty">Ancora nessun movimento. Usa il tasto <b>+</b> ogni volta che spendi: bastano tre tocchi.</div>`;
  else {
    let last="";
    h+=`<div class="btx">`;
    T.slice(0,60).forEach(t=>{
      if(t.d!==last){ h+=`<div class="btx-d">${esc(fDay(t.d))}</div>`; last=t.d; }
      if(t.type==="inv"){ h+=`<div class="btx-r" data-b="goto" data-v="portafoglio"><span class="bc-e">📈</span><span class="btx-n">${esc(t.note)}<small class="btx-s">Investito · messo da parte · ${typeof relDay==="function"?relDay(t.d):esc(fDay(t.d))}</small></span><span class="num pos">${money(t.amt)}</span></div>`; return; }
      const c=catById(t.cat);
      h+=`<div class="btx-r" data-b="edit" data-v="${t.id}"><span class="bc-e">${t.type==="in"?"💶":c.e}</span><span class="btx-n">${esc(t.note||(t.type==="in"?"Entrata":c.n))}${t.src==="recon"?` <span class="state cache">dalla banca</span>`:""}${t.buoniN?` <span class="state live">🎟️ ${t.buoniN}</span>`:""}${t.src==="wallet"?` <span class="state man">Wallet</span>`:""}${t.src==="fineco"?` <span class="state man">Fineco</span>`:""}${t.l?` <span class="btx-x">${nf2.format(t.l)} l</span>`:""}<small class="btx-s">${esc(t.type==="in"?"Entrata":c.n)}${t.type!=="in"&&budgetCat(t)!==t.cat?` → ${esc(catById(budgetCat(t)).n)}`:""} · ${typeof relDay==="function"?relDay(t.d):esc(fDay(t.d))}</small></span><span class="num ${t.type==="in"?"pos":""}">${t.type==="in"?"+":"−"}${money(t.amt)}</span></div>`;
    });
    h+=`</div>`;
  }
  h+=`</section>`;
  h+=`<section><button class="btn" data-b="recon" data-v="${cy.key}" style="margin-bottom:10px">🏦 Allinea con la banca</button><div class="btn-row" style="margin-top:0"><button class="btn" data-b="cats">Categorie e importi</button><button class="btn ghost" data-b="quiz">Rifai le domande</button></div></section>`;
  el.innerHTML=h;
  BX_SEC=SEC; if(typeof secRefresh==="function") secRefresh();
  if(typeof budgetFx==="function") budgetFx();
  if(typeof mountBudgetStories==="function") mountBudgetStories(st);
  renderMissing();
}

/* informazioni che mancano: si completano dalle Impostazioni (pallino sulla rotella finché ce ne sono) */
function missingInfo(){
  if(!B.setup) return [];
  const L=[];
  B.cats.forEach(c=>{
    if(c.g!=="fisse") return;
    if(c.sink){ if(c.sink.annual>0 && !c.sink.due) L.push({ id:c.id, kind:"due", e:c.e, q:`${c.n}: quando scade?`, h:`${m0(c.sink.annual)} all'anno. Con la data ti avviso e tengo da parte i soldi nel mese giusto.` }); }
    else if(c.plan>0 && !c.day) L.push({ id:c.id, kind:"day", e:c.e, q:`${c.n}: che giorno del mese si paga?`, h:`${m0(c.plan)} al mese. Quel giorno ti chiedo se è stato pagato.` });
  });
  return L;
}
function renderMissing(){
  const el=document.getElementById("sMissing"), L=missingInfo(); if(el){
    el.innerHTML = L.length ? `<div class="miss"><div class="miss-h">🔔 Da completare <span>${L.length}</span></div>${L.map(x=>`<div class="miss-r"><span class="bc-e">${x.e}</span><div class="miss-q"><b>${esc(x.q)}</b><small>${esc(x.h)}</small>
      <div class="miss-in">${x.kind==="day"?`<input type="number" inputmode="numeric" min="1" max="31" placeholder="giorno" id="mi_${x.id}">`:`<input type="date" id="mi_${x.id}">`}<button class="btn gold" data-miss="${x.id}" data-kind="${x.kind}">Salva</button></div></div></div>`).join("")}</div>` : "";
  }
  const g=document.getElementById("moreBtn"); if(g) g.classList.toggle("has-dot", L.length>0);
}
document.addEventListener("click",e=>{ const b=e.target.closest("[data-miss]"); if(!b) return; const c=B.cats.find(x=>x.id===b.dataset.miss), i=document.getElementById("mi_"+b.dataset.miss); if(!c||!i) return;
  if(b.dataset.kind==="day"){ const v=Math.round(num(i.value)); if(!(v>=1&&v<=31)){ toast("Scrivi un giorno tra 1 e 31"); return; } c.day=v; toast(`${c.n}: il ${v} di ogni mese`); }
  else { if(!i.value){ toast("Scegli la data"); return; } c.sink.due=i.value; c.sinkEdited=true; toast(`${c.n}: scade il ${fDay(i.value)}`); }
  unfreezePlan(); bSave(); renderMissing(); renderBudget(); });

/* spese fisse: giorno del mese in cui si pagano e «Pagato?» quando arriva */
document.addEventListener("click",e=>{
  const a=e.target.closest("[data-fxday]"); if(a){ const id=a.dataset.fxday;
    a.outerHTML=`<span class="fx-set"><input type="number" inputmode="numeric" min="1" max="31" placeholder="giorno" id="fxIn_${id}"><button data-fxset="${id}">OK</button></span>`;
    const i=document.getElementById("fxIn_"+id); if(i) i.focus(); return; }
  const s2=e.target.closest("[data-fxset]"); if(s2){ const id=s2.dataset.fxset, v=Math.round(num((document.getElementById("fxIn_"+id)||{}).value));
    if(!(v>=1&&v<=31)){ toast("Scrivi un giorno tra 1 e 31"); return; }
    const c=B.cats.find(x=>x.id===id); if(c){ c.day=v; bSave(); renderBudget(); toast(`${c.n}: il ${v} di ogni mese`); } return; }
  const p=e.target.closest("[data-fxpay]"); if(p){ const c=B.cats.find(x=>x.id===p.dataset.fxpay); if(!c) return;
    const amt=r2(c.sink ? c.sink.annual : c.plan);
    B.tx.push({ id:uid("f"), d:ymd(today0()), type:"out", cat:c.id, amt, note:c.n, src:"manual" });
    if(c.sink && c.sink.due){ const d=parseYmd(c.sink.due); c.sink.due=ymd(new Date(d.getFullYear()+1,d.getMonth(),d.getDate())); }
    bSave(); renderBudget(); toast(`${c.n} segnato: ${money(amt)}`); }
});

/* modalità di risparmio: si sceglie dalle Impostazioni, non dal Budget */
function modesHtml(){
  let h="";
  h+=`<section><div class="eyebrow" style="margin-bottom:8px">Modalità di risparmio</div><div class="bmodes">`;
  ["max","min","custom","manual"].forEach(k=>{ if(k==="manual" && B.mode!=="manual" && !(B.goal>0)){ h+=`<button class="bmode" data-b="mode" data-v="manual"><span class="bm-n">A mano</span><span class="bm-v num">✎</span><span class="bm-d">scegli tu</span></button>`; return; } const p=modePlan(k);
    h+=`<button class="bmode ${B.mode===k?"on":""}" data-b="mode" data-v="${k}"><span class="bm-n">${MODES[k].n}</span><span class="bm-v num">${m0(p.save)}</span><span class="bm-d">al mese</span></button>`; });
  h+=`</div>${B.mode==="manual"?`<div class="rng" style="margin-top:10px"><input id="goalIn" inputmode="decimal" value="${fmtIn(num(B.goal)||Math.round(modePlan("custom").save))}"><button class="btn gold" data-b="goalSave" style="width:auto;padding:12px 18px">Salva obiettivo</button></div>`:""}<p class="bnote">${esc(MODES[B.mode].d)}${B.mode==="custom" && histAvg("weekend")==null ?" (finché non ho un mese completo uso le tue stime)" : ""}.</p>
    <p class="bnote">La cifra è <b>tutto quello che metti da parte nel mese</b>: Replay compreso, più quello che resta sul conto. È lo stipendio${num(B.ans.buoni)>0?" più i buoni":""} meno le spese previste (fisse, necessarie, accantonamenti per assicurazione e bollo, tempo libero)${modePlan(B.mode).replayUp>0?`; il tempo libero l'ho abbassato di ${m0(modePlan(B.mode).replayUp)} perché il Replay (${m0(modePlan(B.mode).replay)}) va pagato comunque`:""}. Le stime si correggono da sole con le tue spese reali.</p></section>`;

  return h;
}
function renderModeSettings(){ renderMissing(); const el=document.getElementById("sModes"); if(el && B.setup) el.innerHTML=modesHtml(); else if(el) el.innerHTML=`<p class="hint">Rispondi prima alle domande del Budget.</p>`; }

/* ---------- foglio: aggiungi spesa ---------- */
let qa={ type:"out", cat:null, edit:null };
function qaCats(){
  const used={}; const from=ymd(addDays(today0(),-60));
  B.tx.forEach(t=>{ if(t.d>=from) used[t.cat]=(used[t.cat]||0)+1; });
  const ORDER=["spesa","pasto","benzina","weekend","fuori","vizio","shopping","salute","casavarie","regali","altro"];
  const rank=c=> c.g==="extra" ? 99 : c.g==="fisse" ? 50 : (ORDER.indexOf(c.id)>=0 ? ORDER.indexOf(c.id) : 20);
  return B.cats.filter(c=>c.g!=="fisse" || c.plan>0 || used[c.id])
    .sort((a,b)=> (a.g==="extra")-(b.g==="extra") || (Math.min(used[b.id]||0,5)-Math.min(used[a.id]||0,5)) || rank(a)-rank(b));
}
function openQuickAdd(id, presetCat){
  if(!B.setup){ openQuiz(); return; }
  const t=id ? B.tx.find(x=>x.id===id) : null;
  qa={ type:t?t.type:"out", cat:t?t.cat:(presetCat||null), edit:t?t.id:null, buoni:t?(t.buoniN||0):0, buoniPrev:t?(t.buoniN||0):0, wk:t&&t.wk!=null?!!t.wk:null };
  $("#qaTitle").textContent = t ? "Modifica movimento" : "Nuovo movimento";
  $("#qaAmt").value = t ? String(r2(t.amt-(t.buoniVal||0))).replace(".",",") : "";
  $("#qaNote").value = t ? (t.note||"") : "";
  $("#qaDate").value = t ? t.d : ymd(new Date());
  $("#qaL").value = t&&t.l ? String(t.l).replace(".",",") : "";
  $("#qaKm").value = t&&t.km ? t.km : "";
  $("#qaDel").style.display = t ? "" : "none";
  renderQa(); openM("#qaScrim");
  setTimeout(()=>{ try{ $("#qaAmt").focus(); }catch(e){} },250);
}
function renderQa(){
  document.querySelectorAll("#qaType button").forEach(b=>b.classList.toggle("on", b.dataset.v===qa.type));
  const box=$("#qaCats");
  if(qa.type==="in"){ box.innerHTML=`<p class="bnote">Rimborsi, regali, tredicesima, vendite: aumentano il risparmio del mese.</p>`; $("#qaFuel").style.display="none"; $("#qaQuick").innerHTML=""; return; }
  box.innerHTML=qaCats().map(c=>`<button class="qc ${qa.cat===c.id?"on":""} ${c.g==="extra"?"qx":""}" data-c="${c.id}"><span>${c.e}</span>${esc(c.n)}</button>`).join("");
  $("#qaFuel").style.display = qa.cat==="benzina" ? "" : "none";
  const bq=$("#qaBuoni"); if(bq){ const show=buoniOn() && isBuoniCat(qa.cat); bq.style.display=show?"":"none";
    if(show) bq.innerHTML=`<div class="lab" style="font-size:12px;color:var(--muted);margin:12px 0 6px">Buoni pasto usati (oltre all'importo pagato) · ne hai ${B.buoni.bal+(qa.buoniPrev||0)}</div>`+buoniChips(qa.buoni||0, B.buoni.bal+(qa.buoniPrev||0), "qb"); }
  const c=qa.cat && catById(qa.cat);
  let quick="";
  if(c && c.vice && c.vice.price>0) quick+=[1,2].map(n=>`<button class="chip" data-q="${r2(c.vice.price*n)}">${n}× ${money(c.vice.price*n)}</button>`).join("");
  if(c){ const rec=[...new Set(B.tx.filter(t=>t.cat===c.id&&t.type!=="in").slice(-12).map(t=>t.amt))].slice(-4);
    quick+=rec.filter(v=>!(c.vice&&(Math.abs(v-c.vice.price)<0.01||Math.abs(v-2*c.vice.price)<0.01))).map(v=>`<button class="chip" data-q="${v}">${money(v)}</button>`).join(""); }
  $("#qaQuick").innerHTML=quick;
  $("#qaNoteLab").textContent = qa.cat==="imprevisto" ? "Che cosa è successo? (es. multa)" : "Nota (facoltativa)";
  // da quale budget esce: lo dico subito, così non sembra che i contatori vadano a caso
  let wh=document.getElementById("qaWhere"); if(!wh){ wh=document.createElement("p"); wh.id="qaWhere"; wh.className="bnote qa-where"; const qb=document.getElementById("qaBuoni"); (qb||box).before(wh); }
  const pd=$("#qaDate").value||ymd(new Date()), ed=qa.edit&&B.tx.find(x=>x.id===qa.edit);
  const probe={ cat:qa.cat, d:pd, wk:qa.wk, ts:pd===ymd(new Date())?(ed&&ed.d===pd&&ed.ts?ed.ts:Date.now()):undefined }, can=qa.cat && wkCan(qa.cat), on=can && inWeekend(probe), bc=qa.cat ? budgetCat(probe) : null;
  wh.innerHTML = can ? `<button type="button" class="qa-wk ${on?"on":""}" data-qawk aria-pressed="${on}"><span class="tg"></span>🎉 Conta nel weekend</button><small>${on?"esce dal budget del weekend":bc!==qa.cat?`esce dal budget «${esc(catById(bc).n)}»`:`esce dal budget «${esc(catById(qa.cat).n)}»`}${wkAuto(probe)&&qa.wk==null?" (dal venerdì alle 18 alla domenica alle 5 i pasti vanno qui da soli)":""}</small>`
    : (bc && bc!==qa.cat ? `<small>Esce dal budget «${esc(catById(bc).n)}».</small>` : "");
  wh.style.display = wh.innerHTML ? "" : "none";
}
document.addEventListener("change",e=>{ if(e.target.id==="qaDate" && qa && qa.type!=="in") renderQa(); });
document.addEventListener("click",e=>{ if(!e.target.closest("[data-qawk]")) return; const pd=$("#qaDate").value||ymd(new Date()), probe={ cat:qa.cat, d:pd, wk:qa.wk, ts:pd===ymd(new Date())?Date.now():undefined }; qa.wk=!inWeekend(probe); renderQa(); });
function saveQa(){
  const amt=r2(num($("#qaAmt").value));
  if(!(amt>0)){ toast("Scrivi quanto hai speso"); return; }
  if(qa.type==="out" && !qa.cat){ toast("Scegli una categoria"); return; }
  const t = qa.edit ? B.tx.find(x=>x.id===qa.edit) : { id:uid("t"), src:"manual" };
  { const nd=$("#qaDate").value||ymd(new Date()); if(nd===ymd(new Date())){ if(!t.ts || t.d!==nd) t.ts=Date.now(); } else if(t.d!==nd) delete t.ts; }
  Object.assign(t, { d:$("#qaDate").value||ymd(new Date()), amt:r2(amt+(t.buoniVal||0)), type:qa.type, cat:qa.type==="in"?"entrata":qa.cat, note:$("#qaNote").value.trim() });
  if(qa.cat==="benzina"){ t.l=r2(num($("#qaL").value))||undefined; t.km=Math.round(num($("#qaKm").value))||undefined; } else { delete t.l; delete t.km; }
  setBuoni(t, isBuoniCat(qa.cat) ? (qa.buoni||0) : 0); if(qa.edit) t.buoniAsked=true;
  if(qa.type!=="in" && wkCan(qa.cat) && qa.wk!=null) t.wk=qa.wk; else delete t.wk;
  if(qa.edit && (t.src==="wallet"||t.src==="fineco")){ const k=merchantKey(t.note); if(k && !genericKey(k)){ B.learn=B.learn||{}; B.learnN=B.learnN||{}; B.learn[k]=qa.cat; B.learnN[k]={ cat:qa.cat, n:1 }; } }
  if(!qa.edit) B.tx.push(t);
  // pagamento di una spesa annuale: aggiorna importo e sposta la scadenza di un anno
  const c=catById(t.cat);
  if(!qa.edit && c.sink && c.sink.annual>0 && amt>=c.sink.annual*0.5){
    c.sink.annual=amt; c.plan=r2(amt/12); c.sinkEdited=true;
    if(c.sink.due){ const d=parseYmd(c.sink.due); if(dayDiff(d,parseYmd(t.d))>=-60){ c.sink.due=ymd(new Date(d.getFullYear()+1,d.getMonth(),d.getDate())); } }
    toast(c.n+": pagato, prossima scadenza tra un anno");
  } else toast(qa.edit?"Movimento aggiornato":(qa.type==="in"?"Entrata salvata":"Spesa salvata"));
  bSave(); closeM("#qaScrim"); renderBudget(); if(typeof renderPiano==="function") renderPiano(); syncNativeCats();
}

/* ---------- allineamento con la banca (spese dimenticate) ---------- */
let rcKey=null;
function reconCycle(key){ const c=cycleOf(parseYmd(key)), s0=startInfo(c); return s0 ? Object.assign({}, c, { s:parseYmd(s0.date) }) : c; }
function reconRecorded(c){ return txIn(c.s,c.e).filter(t=>t.type!=="in" && t.src!=="recon").reduce((s,t)=>s+t.amt,0); }
function openRecon(key){
  rcKey=key||cycleOf().key; const c=reconCycle(rcKey);
  const rec=reconRecorded(c), old=B.tx.find(t=>t.src==="recon" && t.d>=ymd(c.s) && t.d<=ymd(c.e));
  $("#rcInfo").innerHTML=`Dal ${fShort(c.s)} al ${fShort(c.e)} hai registrato <b class="num">${money(rec)}</b> di spese${old?` (più ${money(old.amt)} già aggiunti come non registrate)`:""}.`;
  $("#rcAmt").value = old ? String(r2(rec+old.amt)).replace(".",",") : "";
  openM("#rcScrim"); setTimeout(()=>{ try{ $("#rcAmt").focus(); }catch(e){} },250);
}
function saveRecon(){
  const c=reconCycle(rcKey), real=r2(num($("#rcAmt").value));
  if(!(real>0)){ toast("Scrivi quanto risulta dalla banca"); return; }
  const rec=reconRecorded(c), diff=r2(real-rec);
  B.tx=B.tx.filter(t=>!(t.src==="recon" && t.d>=ymd(c.s) && t.d<=ymd(c.e)));
  B.recon=B.recon||{}; B.recon[rcKey]={ real, rec:r2(rec), ts:new Date().toISOString() };
  if(diff>0.5){
    const d=ymd(today0()<=c.e?today0():c.e);
    B.tx.push({ id:uid("r"), src:"recon", type:"out", cat:"altro", d, amt:diff, note:"Spese non registrate" });
    toast("Aggiunti "+eur.format(diff)+" di spese non registrate");
  } else if(diff<-0.5){ toast("Hai registrato "+eur.format(-diff)+" in più della banca: controlla i movimenti doppi"); }
  else toast("Perfetto, torna tutto");
  bSave(); closeM("#rcScrim"); renderBudget(); if(typeof renderPiano==="function") renderPiano();
}

/* ---------- buoni pasto ---------- */
function buoniOn(){ return !!(B.buoni && B.buoni.val>0); }
function buoniChips(cur, max, key, id){
  const n=Math.min(8,Math.max(4,max));
  let h=max<=0?`<p class="bnote" style="margin:0 0 6px">Il conto dei buoni è a 0: se li stai usando, scegli quanti e lo correggo io. <button class="lnk" data-b="buoniFix">Correggi il conto</button></p>`:"";
  h+=`<div class="bchips">`;
  for(let i=0;i<=n;i++) h+=`<button class="chip ${cur===i?"on":""}" data-${key}="${i}" ${id?`data-id="${esc(id)}"`:""}>${i===0?"Nessuno":i+" · "+money(i*B.buoni.val)}</button>`;
  return h+`</div>`;
}
/* applica i buoni a una spesa: l'importo resta il totale (soldi + buoni), il saldo scende */
function setBuoni(t, n){
  if(!buoniOn() || !t) return;
  const prev=t.buoniN||0; n=Math.max(0,Math.round(n||0));
  if(n===prev) return;
  const cash=r2(t.amt-(t.buoniVal||0));
  t.buoniN=n; t.buoniVal=r2(n*B.buoni.val); t.amt=r2(cash+t.buoniVal);
  if(!n){ delete t.buoniN; delete t.buoniVal; }
  if(n-prev>B.buoni.bal){ const add=n-prev-B.buoni.bal; B.buoni.log.push({ d:t.d, n:add, kind:"adj" }); B.buoni.bal+=add; }
  B.buoni.bal=Math.max(0,B.buoni.bal+prev-n);
  B.buoni.log.push({ d:t.d, n:-(n-prev), kind:"use", tx:t.id });
}
function fixBuoni(){ const v=prompt("Quanti buoni pasto hai adesso?", String(B.buoni.bal)); if(v==null) return; const n=Math.max(0,Math.round(num(v)));
  if(n!==B.buoni.bal){ B.buoni.log.push({ d:ymd(today0()), n:n-B.buoni.bal, kind:"adj" }); B.buoni.bal=n; B.ans.buoniNow=n; }
  bSave(); syncNativeCats(); renderBudget(); if(typeof qa!=="undefined" && $("#qaScrim").classList.contains("open")) renderQa(); toast("Buoni: ne hai "+n); }
/* schede: buoni ricevuti nel mese e spese al supermercato da chiarire */
function buoniHtml(st){
  if(!buoniOn()) return "";
  const cy=st.cy, pay=rng(B.ans,"payday"), since=dayDiff(cy.s,today0());
  let h="";
  if(B.buoni.recv[cy.key]==null && !st.P.partial && (st.sal!=null || since>pay[1]-pay[0]) && since<=25){
    const est=Math.round(num(B.ans.workDays||5)*W2M);
    h+=`<section><div class="card bplan"><div class="bw-h">🎟️ Quanti buoni pasto hai ricevuto questo mese?</div>
      <p class="bnote" style="margin-top:0">Tengo il conto dei buoni: ne hai ${B.buoni.bal} da ${money(B.buoni.val)}.</p>
      <div class="rng" style="margin-top:8px"><input id="buoniRecv" inputmode="numeric" value="${est}"><button class="btn gold" data-b="buoniRecv" style="width:auto;padding:12px 18px">Ricevuti</button></div></div></section>`;
  }
  const ask=st.T.filter(t=>isBuoniCat(t.cat) && t.type!=="in" && !t.buoniAsked && !t.buoniN && t.src!=="manual" && t.src!=="recon").slice(-3);
  if(ask.length){
    h+=`<section><div class="card bplan"><div class="bw-h">🎟️ Hai usato buoni pasto?</div>
      <p class="bnote" style="margin-top:0">L'importo che vedo è quello pagato con la carta: se hai usato anche buoni, dimmi quanti (ne hai ${B.buoni.bal}).</p>
      ${ask.map(t=>`<div class="ib-item"><div class="ib-top"><b class="num">${money(t.amt)}</b><span>${esc(t.note||catById(t.cat).n)}</span><small>${esc(fDay(t.d))}</small></div>${buoniChips(-1, B.buoni.bal, "tb", t.id)}</div>`).join("")}
    </div></section>`;
  }
  return h;
}
document.addEventListener("click",e=>{
  const qb=e.target.closest("[data-qb]"); if(qb){ qa.buoni=+qb.dataset.qb; renderQa(); return; }
  const ib=e.target.closest("[data-ibb]"); if(ib){ B._inBuoni=B._inBuoni||{}; B._inBuoni[ib.dataset.id]=+ib.dataset.ibb; renderBudget(); return; }
  const tb=e.target.closest("[data-tb]"); if(tb){ const t=B.tx.find(x=>x.id===tb.dataset.id); if(t){ setBuoni(t,+tb.dataset.tb); t.buoniAsked=true; bSave(); syncNativeCats(); renderBudget(); if(typeof renderPiano==="function") renderPiano(); toast(+tb.dataset.tb?"Buoni segnati":"Ok, niente buoni"); } return; }
  if(e.target.closest('[data-b="buoniFix"]')){ fixBuoni(); return; }
  const br=e.target.closest('[data-b="buoniRecv"]'); if(br){ const n=Math.max(0,Math.round(num($("#buoniRecv").value))); const k=cycleOf().key; B.buoni.recv[k]=n; B.buoni.bal+=n; B.buoni.log.push({ d:ymd(today0()), n, kind:"in" }); bSave(); syncNativeCats(); renderBudget(); toast(n+" buoni aggiunti"); }
});

/* ---------- foglio: questionario unico (budget + portafoglio + Replay + rischio) ---------- */
let qz={ step:0, a:{}, h:[], r:null, rq:{} };
function guessCur(t){ t=String(t).toUpperCase(); if(/\.(MI|DE|PA|AS|MC|BR|LS|VI|F|SW)$/.test(t)) return "EUR"; if(/\.L$/.test(t)) return "GBP"; return "USD"; }
function fmtIn(x){ return x==null||x==="" ? "" : String(x).replace(".",","); }
function openQuiz(step){
  qz={ step:0, a:{}, h:holdings.map(h=>Object.assign({},h)), r:JSON.parse(JSON.stringify(replay||{ enabled:false, dayOfMonth:1, items:[] })),
       rq:Object.assign({}, (typeof PL!=="undefined" && PL.ans) || {}) };
  if(typeof PL!=="undefined" && PL.prof) qz.rq._p=PL.prof;
  QSTEPS.forEach(s=>s.f.forEach(f=>{
    if(f.type==="range"){ const has=B.ans[f.k]!=null; qz.a[f.k]=has?B.ans[f.k]:f.def[0]; qz.a[f.k+"_hi"]= B.ans[f.k+"_hi"]!=null ? B.ans[f.k+"_hi"] : (has?B.ans[f.k]:f.def[1]); }
    else qz.a[f.k] = B.ans[f.k]!=null ? B.ans[f.k] : f.def;
  }));
  if(typeof PL!=="undefined" && PL.fund!=null) qz.a.cash=PL.fund;      // il fondo aggiornato dal piano
  const curStart = B.start && B.start.key===cycleOf().key;
  qz.a.leftNow = curStart ? B.start.left : "";
  qz.a.savedNow = curStart ? (B.start.saved||0) : 0;
  qz.a.buoniNow = B.buoni ? (B.buoni.bal||0) : 0;
  if(typeof step==="string"){ const i=QSTEPS.findIndex(s=>s.id===step); if(i>=0) qz.step=i; }
  renderQuiz(); openM("#qzScrim");
}
function qzVisible(f){
  if(f.car && qz.a.hasCar==="no") return false;
  if(f.vice===true && (!qz.a.vice || qz.a.vice==="nessuno")) return false;
  if(f.buoni && !(num(qz.a.buoni)>0)) return false;
  if(f.replay && B.setup && !(qz.r && qz.r.enabled)) return false;   // al primo avvio la chiedo sempre
  if(f.vice && f.vice!==true && qz.a.vice!==f.vice) return false;
  return true;
}
function qzFieldHtml(f){
  const v=qz.a[f.k];
  if(f.type==="choice") return `<div class="q"><div class="qt">${esc(f.l)}</div><div class="opts">${f.opts.map(o=>`<button class="opt ${String(v)===o[0]?"on":""}" data-k="${f.k}" data-v="${o[0]}">${esc(o[1])}</button>`).join("")}</div></div>`;
  if(f.type==="range"){
    const im=f.int?"numeric":"decimal";
    return `<div class="fld"><span class="lab">${esc(f.l)}</span><div class="rng"><span>da</span><input data-k="${f.k}" inputmode="${im}" value="${esc(fmtIn(v))}"><span>a</span><input data-k="${f.k}_hi" inputmode="${im}" value="${esc(fmtIn(qz.a[f.k+"_hi"]))}"></div>${f.hint?`<span class="qz-h">${esc(f.hint)}</span>`:""}</div>`;
  }
  const typ=f.type==="date"?"date":"text", im=f.type==="money"?"decimal":(f.type==="int"?"numeric":"text");
  const val=f.type==="money"?fmtIn(v):(v==null?"":v);
  return `<label class="fld"><span class="lab">${esc(f.l)}</span><input data-k="${f.k}" type="${typ}" inputmode="${im}" value="${esc(val)}" ${f.ph?`placeholder="${esc(f.ph)}"`:""}>${f.hint?`<span class="qz-h">${esc(f.hint)}</span>`:""}</label>`;
}
function qzPx(t){ const p=prices[t]; if(p && p.eur!=null && p.state!=="err") return p.eur; const c=(typeof PL!=="undefined" && PL.px[t]); return c?c.eur:null; }
function holdingsStepHtml(){
  let tot=0, val=0;
  let h=`<div class="qh-head"><span>Ticker</span><span>Quote</span><span>Prezzo medio €</span><span></span></div>`;
  qz.h.forEach((x,i)=>{
    const px=qzPx(x.ticker); const c=num(x.qty)*num(x.avg), v=px!=null?num(x.qty)*px:c; tot+=c; val+=v;
    h+=`<div class="qh-row" data-i="${i}"><input data-f="ticker" value="${esc(x.ticker||"")}" placeholder="SWDA.MI" autocapitalize="characters" autocomplete="off"><input data-f="qty" inputmode="decimal" value="${esc(fmtIn(x.qty))}" placeholder="0"><input data-f="avg" inputmode="decimal" value="${esc(fmtIn(x.avg))}" placeholder="0,00"><button class="qh-del" data-z="hdel" data-i="${i}" aria-label="Togli">×</button></div>
      <div class="qh-s">${esc(x.name && x.name!==x.ticker ? x.name : "")}${x.ticker && num(x.qty)>0 ? `${x.name&&x.name!==x.ticker?" · ":""}${px!=null?"vale "+eur.format(v):"pagato "+eur.format(c)}` : ""}</div>`;
  });
  if(!qz.h.length) h+=`<div class="bempty" style="margin-bottom:10px">Nessun investimento: va benissimo, il piano parte da zero.</div>`;
  h+=`<button class="add" data-z="hadd">+ Aggiungi un titolo o un ETF</button>`;
  if(qz.h.length) h+=`<div class="ai-note" style="margin-top:12px">Hai investito <b>${eur.format(tot)}</b>${Math.abs(val-tot)>0.5?`, oggi vale circa <b>${eur.format(val)}</b>`:""}.</div>`;
  return h;
}
function replayStepHtml(){
  const r=qz.r; let cost=0, miss=false;
  let h=`<div class="q"><div class="qt">Hai un piano di accumulo automatico?</div><div class="opts"><button class="opt ${r.enabled?"on":""}" data-z="ron">Sì</button><button class="opt ${!r.enabled?"on":""}" data-z="roff">No</button></div></div>`;
  if(!r.enabled) return h;
  const pd=rng(qz.a,"payday");
  h+=`<label class="fld"><span class="lab">In che giorno del mese compra il Replay?</span><input id="qrDay" inputmode="numeric" value="${esc(String(r.dayOfMonth||1))}"><span class="qz-h">${(r.dayOfMonth||1)<pd[0]?`Attenzione: il giorno ${r.dayOfMonth||1} viene prima dello stipendio (${pd[0]}–${pd[1]}): il Replay userebbe i soldi del mese prima. Controlla che sia giusto.`:`Dopo lo stipendio (${pd[0]}–${pd[1]}): lo paghi con lo stipendio appena arrivato.`}</span></label>`;
  h+=`<div class="qh-head qr"><span>ETF (ticker)</span><span>Quote al mese</span><span></span></div>`;
  (r.items||[]).forEach((it,i)=>{
    const px=qzPx(it.ticker); if(px!=null) cost+=num(it.quote)*px; else if(it.ticker) miss=true;
    h+=`<div class="qh-row qr" data-ri="${i}"><input data-f="ticker" value="${esc(it.ticker||"")}" placeholder="SWDA.MI" autocapitalize="characters" autocomplete="off"><input data-f="quote" inputmode="decimal" value="${esc(fmtIn(it.quote))}" placeholder="1"><button class="qh-del" data-z="rdel" data-i="${i}" aria-label="Togli">×</button></div>`;
  });
  h+=`<button class="add" data-z="radd">+ Aggiungi un ETF</button>`;
  if(cost>0) h+=`<div class="ai-note" style="margin-top:12px">Costa circa <b>${eur.format(cost)}</b> al mese ai prezzi di oggi${miss?" (manca il prezzo di qualche ETF)":""}. Nel budget lo conto dentro il risparmio: è la parte che investi in automatico.</div>`;
  return h;
}
function riskStepHtml(){
  if(typeof riskQHtml!=="function") return "";
  return riskQHtml(qz.rq,"rq2");
}
function renderQuiz(){
  const box=$("#qzBody"), n=QSTEPS.length;
  const prog=`<div class="qz-prog">${Array.from({length:n+1},(_,i)=>`<button class="${i<=qz.step?"on":""}" data-z="jump" data-i="${i}" ${B.setup?"":"disabled"} aria-label="Passo ${i+1}"></button>`).join("")}</div>`;
  const nav=(last)=>`<div class="btn-row">${qz.step>0?`<button class="btn ghost" data-z="back" style="flex:0 0 auto;padding:13px 20px">Indietro</button>`:""}<button class="btn gold" data-z="${last?"done":"next"}">${last?"Salva tutto":"Avanti"}</button></div>`;
  if(qz.step<n){
    const s=QSTEPS[qz.step];
    let h=prog+`<div class="qz-n">${qz.step+1} di ${n+1}</div><h2>${esc(s.t)}</h2><p class="hint">${esc(s.sub||"")}</p>`;
    if(s.special==="holdings") h+=holdingsStepHtml();
    else if(s.special==="replay") h+=replayStepHtml();
    else if(s.special==="risk") h+=riskStepHtml();
    else s.f.forEach(f=>{
      if(!qzVisible(f)) return;
      h+=qzFieldHtml(f);
      if(f.k==="euro" && num(qz.a.kw)>0){ const b=bolloCalc(qz.a.kw,qz.a.euro); h+=`<div class="ai-note" style="margin:-4px 0 14px">Bollo stimato: <b>${eur.format(b)}</b> all'anno (tariffa nazionale per kW). ${num(qz.a.kw)<=80?"Il governo ha annunciato l'esenzione dal 2027 per le auto fino a 80 kW: per ora resta dovuto.":""} Se il tuo importo è diverso lo correggi dopo.</div>`; }
    });
    box.innerHTML=h+nav(false);
  } else {
    const cats=buildCats(qz.a), a=qz.a;
    const plans=["max","min","custom"].map(k=>modePlan(k,cats,a));
    let rc=0; if(qz.r && qz.r.enabled) (qz.r.items||[]).forEach(it=>{ const px=qzPx(it.ticker); if(px!=null) rc+=num(it.quote)*px; });
    const pay=rng(a,"payday");
    let startHtml="";
    if(num(a.leftNow)>0){
      const save=B.ans; B.ans=a; const cats0=B.cats; B.cats=cats; const rep0=replay; if(qz.r) replay=qz.r;   // calcolo con il Replay appena impostato
      try{
        const cy=cycleOf(), P1=modePlan(qz.a._mode||B.mode||"custom",cats,a), P0=P1;
        const s0={ key:cy.key, date:ymd(today0()), left:num(a.leftNow), buoniN:num(a.buoni)>0?num(a.buoniNow):0, saved:num(a.savedNow), replayDone:!(qz.r && qz.r.enabled) || a.replayDone!=="no" };
        const qp=partialPlan(P0,cy,s0), wl=weekendsLeft(cy), wkShare=cats.find(c=>c.id==="weekend");
        const wkAmt = wkShare && P0.wants>0 ? qp.per.weekend/wl : 0;
        startHtml=`<div class="card bplan" style="margin-bottom:12px"><div class="bw-h">🧮 Da oggi al ${fShort(cy.e)}</div>
          <div class="bp-row"><span>Ti restano sul conto</span><b class="num">${eur.format(num(a.leftNow))}</b></div>
          ${qp.buoni>0?`<div class="bp-row"><span>Buoni pasto per la spesa (${qp.buoniN} × ${eur.format(num(a.buoni))})</span><b class="num">+${eur.format(qp.buoni)}</b></div>`:""}
          ${qz.r && qz.r.enabled ? `<div class="bp-row"><span>Replay il giorno ${qz.r.dayOfMonth||1} di ogni mese</span><b>${qp.replayRes>0?"ancora da fare":"già fatto: non lo tolgo"}</b></div>`:""}
          <div class="bp-row"><span>Spese necessarie e fisse dei ${qp.remDays} giorni che mancano</span><b class="num">−${eur.format(qp.needs)}</b></div>
          ${qp.replayRes>0?`<div class="bp-row"><span>Replay del ${qp.replayDate.toLocaleDateString("it-IT",{ day:"numeric", month:"short" })}, prima del prossimo stipendio</span><b class="num">−${eur.format(qp.replayRes)}</b></div>`:""}
          ${qp.save>0?`<div class="bp-row"><span>Da mettere ancora da parte (obiettivo ${eur0.format(qp.goal)}, già fatti ${eur0.format(qp.saved)})</span><b class="num">−${eur.format(qp.save)}</b></div>`:""}
          <div class="bp-row"><span>Per il tempo libero</span><b class="num">${eur.format(qp.wants)}</b></div>
          ${wkAmt>0?`<p class="bnote" style="margin-top:6px">Nei prossimi ${wl} weekend: circa <b>${eur.format(wkAmt)}</b> a weekend.</p>`:""}
          <p class="bnote">Conto quello che hai già messo da parte${qp.replayRes>0?" e il Replay":""}; le spese di prima di oggi non contano. L'obiettivo di risparmio è sul mese intero: conto anche quello che hai già messo da parte.</p></div>`;
      }catch(e){} finally{ B.ans=save; B.cats=cats0; replay=rep0; }
    }
    let h=prog+`<div class="qz-n">Riepilogo</div><h2>Ecco i tuoi numeri</h2>${startHtml}<p class="hint">Entrate ${eur0.format(num(a.net))}${plans[0].buoni>0?` + buoni pasto ${eur0.format(plans[0].buoni)}`:""} (stipendio tra il ${pay[0]} e il ${pay[1]}) · spese fisse e necessarie ${eur0.format(plans[0].needs)} al mese, accantonamenti compresi. Scegli come vuoi risparmiare:</p>`;
    plans.forEach(p=>{
      h+=`<button class="qz-mode ${(qz.a._mode||B.mode||"custom")===p.mode?"on":""}" data-z="mode" data-v="${p.mode}">
        <div class="qm-h"><b>${MODES[p.mode].n}</b><span class="num">${eur0.format(p.save)}<small>/mese</small></span></div>
        <div class="qm-d">${esc(MODES[p.mode].d)} · tempo libero ${eur0.format(p.wants)} al mese · ${p.net>0?Math.round(p.save/p.net*100):0}% dello stipendio${rc>0?` · di cui Replay ${eur0.format(rc)}${rc>p.save?" (non basta!)":""}`:""}</div></button>`;
    });
    if(Math.abs(plans[0].save-plans[2].save)<1) h+=`<p class="bnote">«Massimo» e «Su misura» coincidono perché le spese di tempo libero hanno un numero solo: torna indietro e metti un intervallo (da… a…) per vedere quanto potresti risparmiare in più.</p>`;
    if(plans[0].avail<=0) h+=`<div class="card bwarn" style="margin-top:12px"><p>Le spese fisse e necessarie superano le entrate: conviene rivedere le stime o le spese.</p></div>`;
    const sel=plans.find(p=>p.mode===(qz.a._mode||B.mode||"custom"));
    if(rc>0 && sel && rc>sel.save) h+=`<div class="card bwarn" style="margin-top:12px"><p>Il Replay costa ${eur.format(rc)} al mese ma con questa modalità ne risparmi ${eur.format(Math.max(0,sel.save))}: la differenza uscirebbe dalla liquidità. Scegli una modalità con più risparmio o riduci il Replay.</p></div>`;
    const sc=typeof riskScore==="function" ? riskScore(qz.rq) : null;
    const hv=qz.h.reduce((s,x)=>{ const px=qzPx(x.ticker); return s+num(x.qty)*(px!=null?px:num(x.avg)); },0);
    h+=`<div class="card" style="margin-top:6px"><div class="bp-row"><span>💶 Liquidità / fondo emergenza</span><b class="num">${eur.format(num(a.cash))}</b></div>
      <div class="bp-row"><span>📈 Investimenti</span><b class="num">${eur.format(hv)}</b></div>
      <div class="bp-row"><span>🔁 Replay al mese</span><b class="num">${rc>0?eur.format(rc):"—"}</b></div>
      <div class="bp-row"><span>🎯 Profilo di rischio</span><b>${sc?esc(PROFILES[Math.min(qz.rq._p||sc.prof,sc.cap)].n):"da completare"}</b></div></div>`;
    box.innerHTML=h+nav(true);
  }
  if(qz._shown!==qz.step){ box.scrollTop=0; qz._shown=qz.step; }
}
function qzFieldByKey(k){ return QSTEPS.flatMap(s=>s.f).find(x=>x.k===k || x.k+"_hi"===k); }
function qzCollect(){
  document.querySelectorAll("#qzBody input[data-k]").forEach(i=>{ const f=qzFieldByKey(i.dataset.k);
    qz.a[i.dataset.k] = f && (f.type==="money"||f.type==="int"||f.type==="range") ? num(i.value) : i.value.trim(); });
  document.querySelectorAll("#qzBody .qh-row[data-i]").forEach(r=>{ const x=qz.h[+r.dataset.i]; if(!x) return;
    const t=r.querySelector('[data-f="ticker"]').value.trim().toUpperCase();
    if(t!==x.ticker){ x.ticker=t; x.name=t; x._new=true; }
    x.qty=num(r.querySelector('[data-f="qty"]').value); x.avg=num(r.querySelector('[data-f="avg"]').value); });
  document.querySelectorAll("#qzBody .qh-row[data-ri]").forEach(r=>{ const x=qz.r.items[+r.dataset.ri]; if(!x) return;
    const t=r.querySelector('[data-f="ticker"]').value.trim().toUpperCase(); if(t!==x.ticker){ x.ticker=t; x.name=t; }
    x.quote=num(r.querySelector('[data-f="quote"]').value); });
  const d=$("#qrDay"); if(d) qz.r.dayOfMonth=Math.min(31,Math.max(1,parseInt(d.value,10)||1));
  document.querySelectorAll("#qzBody [data-rqi]").forEach(i=>{ qz.rq[i.dataset.rqi]=i.value.trim(); });
}
async function fixNewHoldings(){
  let ch=false;
  for(const h of holdings){
    if(!h._new) continue;
    try{ const r=await yahoo(h.ticker); h.name=(r.meta&&(r.meta.longName||r.meta.shortName))||h.ticker; h.cur=r.cur||h.cur; ch=true; }catch(e){}
    delete h._new;
  }
  for(const it of (replay.items||[])){ if(it.name===it.ticker){ try{ const r=await yahoo(it.ticker); it.name=(r.meta&&(r.meta.longName||r.meta.shortName))||it.ticker; ch=true; }catch(e){} } }
  if(ch){ store.set("holdings",holdings); store.set("replay",replay); }
  await refreshAll();
}
function qzDone(){
  qzCollect();
  const mode=qz.a._mode||B.mode||"custom"; delete qz.a._mode;
  const prevAns=B.ans||{}, prevCats=B.cats||[];
  B.ans=Object.assign({}, qz.a);
  B.cats=mergeCats(buildCats(B.ans), prevCats, prevAns);
  B.mode=mode; unfreezePlan();
  if(!B.setup) B.setup=new Date().toISOString();
  // mese iniziato a metà: parto dai soldi rimasti
  const cyNow=cycleOf();
  const old=(B.start && B.start.key===cyNow.key) ? B.start : null;
  if(num(B.ans.leftNow)>0) B.start={ key:cyNow.key, date:old?old.date:ymd(today0()), left:r2(num(B.ans.leftNow)), buoniN:old && old.buoniN!=null ? Math.max(0,old.buoniN+Math.round(num(B.ans.buoniNow))-(B.buoni?B.buoni.bal:0)) : Math.round(num(B.ans.buoniNow)), saved:r2(num(B.ans.savedNow)), replayDone:B.ans.replayDone!=="no", boughtDone:B.ans.boughtDone==="si" };
  else if(B.start && B.start.key===cyNow.key) delete B.start;
  // buoni pasto: valore, saldo di partenza
  B.buoni=Object.assign({ val:0, bal:0, recv:{}, log:[] }, B.buoni||{});
  B.buoni.val=num(B.ans.buoni);
  if(B.buoni.val>0 && B.ans.buoniNow!=="" && B.ans.buoniNow!=null && num(B.ans.buoniNow)!==B.buoni.bal){ B.buoni.log.push({ d:ymd(today0()), n:num(B.ans.buoniNow)-B.buoni.bal, kind:"adj" }); B.buoni.bal=Math.max(0,Math.round(num(B.ans.buoniNow))); }
  if(num(B.ans.leftNow)>0 && B.buoni.val>0) B.buoni.recv[cyNow.key]=B.buoni.recv[cyNow.key]!=null?B.buoni.recv[cyNow.key]:0;   // il primo mese i buoni ricevuti sono già nel saldo
  bSave();
  settings.income=num(B.ans.net); store.set("settings",settings);
  if(B.ans.boughtDone==="si" && typeof PL!=="undefined" && !PL.hist.find(h=>h.key===cyNow.key)){
    PL.hist.push({ key:cyNow.key, date:ymd(today0()), buys:[], toFund:0, manual:true });
  }
  // portafoglio
  holdings=qz.h.filter(x=>x.ticker && num(x.qty)>0).map(x=>Object.assign({}, x, { id:x.id||("h"+Date.now()+Math.random().toString(36).slice(2,5)), cur:x._new?guessCur(x.ticker):(x.cur||guessCur(x.ticker)), qty:num(x.qty), avg:num(x.avg) }));
  store.set("holdings",holdings);
  replay=Object.assign({}, qz.r, { items:(qz.r.items||[]).filter(i=>i.ticker && num(i.quote)>0).map(i=>({ ticker:i.ticker, name:i.name||i.ticker, quote:num(i.quote) })) });
  store.set("replay",replay);
  // piano
  if(typeof PL!=="undefined"){
    const sc=riskScore(qz.rq), p=qz.rq._p; const ans=Object.assign({}, qz.rq); delete ans._p;
    PL.ans=ans; if(sc){ PL.prof=Math.min(p||sc.prof, sc.cap); PL.provisional=false; }
    PL.fund=r2(num(B.ans.cash)); plSave();
  }
  closeM("#qzScrim"); render(); renderBudget(); if(typeof renderPiano==="function") renderPiano();
  toast("Budget, portafoglio e piano aggiornati");
  fixNewHoldings();
}

/* ---------- foglio: categorie ---------- */
function openCats(){ renderCats(); openM("#catScrim"); }
function renderCats(){
  const G={ fisse:"Fisse", necessarie:"Necessarie", libere:"Tempo libero" };
  let h="";
  Object.keys(G).forEach(g=>{
    h+=`<div class="setgroup"><div class="gt">${G[g]}</div>`;
    B.cats.filter(c=>c.g===g).forEach(c=>{
      h+=`<div class="ce-row" data-id="${c.id}"><span class="bc-e">${c.e}</span><input class="ce-n" value="${esc(c.n)}"></div>`;
      if(c.sink) h+=`<div class="ce-vals"><input class="ce-a" data-id="${c.id}" inputmode="decimal" value="${fmtIn(c.sink.annual)}"><span class="ce-u">€ all'anno</span><input type="date" class="ce-d" data-id="${c.id}" value="${esc(c.sink.due||"")}"></div>`;
      else h+=`<div class="ce-vals"><span class="ce-u">da</span><input class="ce-lo" data-id="${c.id}" inputmode="decimal" value="${fmtIn(c.lo!=null?c.lo:c.plan)}"><span class="ce-u">a</span><input class="ce-hi" data-id="${c.id}" inputmode="decimal" value="${fmtIn(c.hi!=null?c.hi:c.plan)}"><span class="ce-u">€/mese</span></div>`;
    });
    h+=`</div>`;
  });
  h+=`<div class="setgroup"><div class="gt">Nuova categoria</div><div class="two"><input id="ceNewN" placeholder="es. Palestra"><select id="ceNewG"><option value="libere">Tempo libero</option><option value="necessarie">Necessaria</option><option value="fisse">Fissa</option></select></div>
    <button class="add" id="ceAdd" style="margin-top:8px">+ Aggiungi categoria</button></div>
    <p class="bnote">Il budget usa il valore medio; «Risparmio massimo» usa il «da» per il tempo libero. In «Su misura», dopo il primo mese completo conta quanto spendi davvero.</p>`;
  $("#catBody").innerHTML=h;
}
function saveCats(){
  document.querySelectorAll("#catBody .ce-row").forEach(r=>{ const c=B.cats.find(x=>x.id===r.dataset.id); if(c) c.n=r.querySelector(".ce-n").value.trim()||c.n; });
  document.querySelectorAll("#catBody .ce-a").forEach(i=>{ const c=B.cats.find(x=>x.id===i.dataset.id); if(c&&c.sink){ const v=r2(num(i.value)); if(Math.abs(v-c.sink.annual)>0.005) c.sinkEdited=true; c.sink.annual=v; c.plan=r2(v/12); } });
  document.querySelectorAll("#catBody .ce-d").forEach(i=>{ const c=B.cats.find(x=>x.id===i.dataset.id); if(c&&c.sink) c.sink.due=i.value; });
  document.querySelectorAll("#catBody .ce-lo").forEach(i=>{ const c=B.cats.find(x=>x.id===i.dataset.id); if(!c) return;
    let lo=r2(num(i.value)), hi=r2(num(document.querySelector(`#catBody .ce-hi[data-id="${c.id}"]`).value)); if(hi<lo){ const t=lo; lo=hi; hi=t; }
    const was=[c.lo!=null?c.lo:c.plan, c.hi!=null?c.hi:c.plan]; if(Math.abs(was[0]-lo)>0.005 || Math.abs(was[1]-hi)>0.005) c.edited=true;
    c.plan=r2((lo+hi)/2); if(hi>lo){ c.lo=lo; c.hi=hi; } else { delete c.lo; delete c.hi; } });
  unfreezePlan(); bSave(); closeM("#catScrim"); renderBudget(); toast("Categorie salvate");
}

/* ---------- backup ---------- */
function backupJson(){
  const o={};
  for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k && k.indexOf("grz_")===0 && k!=="grz_prices" && k!=="grz_dynModels") o[k]=localStorage.getItem(k); }
  return JSON.stringify({ app:"gruzzolo", v:1, ts:new Date().toISOString(), data:o });
}
function restoreJson(txt){
  const j=JSON.parse(txt); if(!j || j.app!=="gruzzolo" || !j.data) throw new Error("non è un backup di Gruzzolo");
  Object.keys(j.data).forEach(k=>{ if(k.indexOf("grz_")===0) localStorage.setItem(k,j.data[k]); });
}

/* ---------- markup iniettato ---------- */
document.body.insertAdjacentHTML("beforeend", `
<button class="fab" id="fab" aria-label="Aggiungi una spesa" style="display:none">+</button>
<div class="scrim" id="moreScrim"><div class="sheet">
  <h2>Altro</h2>
  <div class="more-list">
    <button data-more="stat"><span>📊</span><b>Statistica</b><small>Rischio, correlazioni e scenari del portafoglio</small></button>
    <button data-more="ai" id="moreAi"><span>🤖</span><b>Analisi AI</b><small>Analisi con la tua chiave Claude o OpenAI</small></button>
    <button data-more="predict" id="morePredict"><span>🔮</span><b>Predizione</b><small>Previsioni e scommesse sul portafoglio</small></button>
    <button data-more="notizie"><span>📰</span><b>Notizie</b><small>Sulle tue posizioni</small></button>
    <button data-more="impostazioni"><span>⚙️</span><b>Impostazioni</b><small>Budget, spese automatiche, backup</small></button>
  </div>
  <button class="btn ghost" id="moreClose" style="margin-top:10px">Chiudi</button>
</div></div>
<div class="scrim" id="qaScrim"><div class="sheet">
  <h2 id="qaTitle">Nuovo movimento</h2>
  <div class="seg" id="qaType" style="margin:10px 0 14px"><button data-v="out" class="on">Spesa</button><button data-v="in">Entrata</button></div>
  <div class="qa-amt"><span>€</span><input id="qaAmt" inputmode="decimal" placeholder="0,00" autocomplete="off"></div>
  <div class="qa-quick" id="qaQuick"></div>
  <div id="qaBuoni" style="display:none"></div>
  <div class="qa-cats" id="qaCats"></div>
  <div class="two" id="qaFuel" style="display:none;margin-top:12px">
    <label class="fld"><span class="lab">Litri (facoltativo)</span><input id="qaL" inputmode="decimal"></label>
    <label class="fld"><span class="lab">Km percorsi (facoltativo)</span><input id="qaKm" inputmode="numeric"></label>
  </div>
  <label class="fld" style="margin-top:12px"><span class="lab" id="qaNoteLab">Nota (facoltativa)</span><input id="qaNote" autocomplete="off"></label>
  <label class="fld"><span class="lab">Data</span><input id="qaDate" type="date"></label>
  <div class="qa-actions"><div class="btn-row" style="margin-top:0"><button class="btn ghost" id="qaCancel" style="flex:0 0 auto;padding-left:18px;padding-right:18px">Annulla</button><button class="btn ghost" id="qaDel" style="flex:0 0 auto;padding-left:18px;padding-right:18px;color:var(--loss)">Elimina</button><button class="btn gold" id="qaSave">Salva</button></div></div>
</div></div>
<div class="scrim" id="rcScrim"><div class="sheet">
  <h2>Allinea con la banca</h2>
  <p class="hint" id="rcInfo"></p>
  <label class="fld"><span class="lab">Quanto hai speso davvero in questo periodo (app della banca)</span><input id="rcAmt" inputmode="decimal" placeholder="0,00"></label>
  <p class="hint" style="margin-top:-4px">Conta le uscite del conto e della carta. Escludi i soldi spostati su risparmi o investimenti e quello che hai pagato con i buoni pasto.</p>
  <div class="btn-row"><button class="btn gold" id="rcSave">Allinea</button></div>
  <button class="btn ghost" id="rcCancel" style="margin-top:10px">Annulla</button>
</div></div>
<div class="scrim" id="qzScrim"><div class="sheet qz-sheet" id="qzBody"></div></div>
<div class="scrim" id="catScrim"><div class="sheet">
  <h2>Categorie e importi</h2><p class="hint">Importi tipici al mese (all'anno per le spese annuali).</p>
  <div id="catBody"></div>
  <div class="btn-row"><button class="btn gold" id="catSave">Salva</button></div>
  <button class="btn ghost" id="catCancel" style="margin-top:10px">Annulla</button>
</div></div>
<div class="scrim" id="bkScrim"><div class="sheet">
  <h2>Backup</h2><p class="hint">Tutti i dati di Gruzzolo (budget, portafoglio, piano, impostazioni e chiavi). Copialo e tienilo al sicuro; per ripristinare incolla qui un backup e premi Ripristina.</p>
  <textarea id="bkText" style="min-height:140px;font-size:11px"></textarea>
  <div class="btn-row"><button class="btn" id="bkCopy">Copia</button><button class="btn gold" id="bkRestore">Ripristina</button></div>
  <button class="btn ghost" id="bkClose" style="margin-top:10px">Chiudi</button>
</div></div>`);

/* ---------- eventi ---------- */
$("#fab").addEventListener("click",()=>openQuickAdd());
$("#moreClose").addEventListener("click",()=>closeM("#moreScrim"));
document.addEventListener("click",e=>{
  const t=e.target.closest(".tab[data-tab]");
  if(t && t.dataset.tab==="add"){ e.stopImmediatePropagation(); openQuickAdd(); return; }
  if((t && t.dataset.tab==="altro") || e.target.closest("#moreBtn")){ e.stopImmediatePropagation();
    $("#moreAi").style.display = settings.aiEnabled!==false ? "" : "none";
    $("#morePredict").style.display = settings.predictEnabled ? "" : "none";
    openM("#moreScrim"); return; }
  const m=e.target.closest("[data-more]"); if(m){ closeM("#moreScrim"); showTab(m.dataset.more); }
}, true);
$("#qaType").addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return; qa.type=b.dataset.v; renderQa(); });
$("#qaCats").addEventListener("click",e=>{ const b=e.target.closest(".qc"); if(!b) return; qa.cat=b.dataset.c; renderQa(); });
$("#qaQuick").addEventListener("click",e=>{ const b=e.target.closest("[data-q]"); if(!b) return; $("#qaAmt").value=String(b.dataset.q).replace(".",","); });
$("#qaSave").addEventListener("click",saveQa);
$("#qaAmt").addEventListener("keydown",e=>{ if(e.key==="Enter" && qa.cat) saveQa(); });
$("#qaCancel").addEventListener("click",()=>closeM("#qaScrim"));
$("#qaDel").addEventListener("click",()=>{ if(!qa.edit) return; if(!confirm("Eliminare questo movimento?")) return; const dt=B.tx.find(t=>t.id===qa.edit); if(dt && dt.buoniN && B.buoni){ B.buoni.bal+=dt.buoniN; B.buoni.log.push({ d:dt.d, n:dt.buoniN, kind:"undo", tx:dt.id }); } B.tx=B.tx.filter(t=>t.id!==qa.edit); bSave(); closeM("#qaScrim"); renderBudget(); toast("Movimento eliminato"); });
$("#qzBody").addEventListener("click",e=>{
  const o=e.target.closest(".opt[data-k]");
  if(o){ qzCollect(); qz.a[o.dataset.k]=o.dataset.v;
    if(o.dataset.k==="vice" && VICE_DEF[o.dataset.v]) qz.a.vicePrice=VICE_DEF[o.dataset.v].price;
    renderQuiz(); return; }
  const rq=e.target.closest("[data-rq2]");
  if(rq){ qzCollect(); qz.rq[rq.dataset.rq2]=rq.dataset.v; delete qz.rq._p; renderQuiz(); return; }
  const rp=e.target.closest("[data-rqp2]");
  if(rp && !rp.disabled){ qz.rq._p=+rp.dataset.rqp2; renderQuiz(); return; }
  const z=e.target.closest("[data-z]"); if(!z) return;
  const a=z.dataset.z;
  qzCollect();
  if(a==="next"){
    if(QSTEPS[qz.step] && QSTEPS[qz.step].id==="oggi" && !B.setup && !(num(qz.a.leftNow)>0)){ toast("Scrivi quanti soldi hai per vivere fino al prossimo stipendio"); return; }
    qz.step++; renderQuiz(); }
  else if(a==="back"){ qz.step=Math.max(0,qz.step-1); renderQuiz(); }
  else if(a==="jump"){ qz.step=+z.dataset.i; renderQuiz(); }
  else if(a==="mode"){ qz.a._mode=z.dataset.v; renderQuiz(); }
  else if(a==="hadd"){ qz.h.push({ ticker:"", name:"", qty:0, avg:0, cur:"EUR", _new:true }); renderQuiz(); const r=document.querySelectorAll('#qzBody .qh-row[data-i] [data-f="ticker"]'); if(r.length) r[r.length-1].focus(); }
  else if(a==="hdel"){ qz.h.splice(+z.dataset.i,1); renderQuiz(); }
  else if(a==="ron"){ qz.r.enabled=true; if(!qz.r.items) qz.r.items=[]; if(!qz.r.items.length) qz.r.items.push({ ticker:"SWDA.MI", name:"iShares Core MSCI World", quote:1 }); renderQuiz(); }
  else if(a==="roff"){ qz.r.enabled=false; renderQuiz(); }
  else if(a==="radd"){ qz.r.items.push({ ticker:"", name:"", quote:1 }); renderQuiz(); }
  else if(a==="rdel"){ qz.r.items.splice(+z.dataset.i,1); renderQuiz(); }
  else if(a==="done"){ qzDone(); }
});
$("#qzBody").addEventListener("change",e=>{ if(e.target.dataset.k==="kw" || e.target.dataset.f){ qzCollect(); renderQuiz(); } });
$("#catSave").addEventListener("click",saveCats);
$("#rcSave").addEventListener("click",saveRecon);
$("#rcCancel").addEventListener("click",()=>closeM("#rcScrim"));
$("#catCancel").addEventListener("click",()=>closeM("#catScrim"));
$("#catBody").addEventListener("click",e=>{
  if(e.target.id!=="ceAdd") return;
  const n=$("#ceNewN").value.trim(); if(!n){ toast("Scrivi il nome"); return; }
  saveCats(); B.cats.push({ id:uid("c"), n, e:"🏷️", g:$("#ceNewG").value, plan:0, custom:true }); bSave(); openCats();
});
$("#bkCopy").addEventListener("click",()=>{ const t=$("#bkText"); t.select(); try{ navigator.clipboard.writeText(t.value).then(()=>toast("Backup copiato")).catch(()=>{ document.execCommand("copy"); toast("Backup copiato"); }); }catch(e){ document.execCommand("copy"); toast("Backup copiato"); } });
$("#bkRestore").addEventListener("click",()=>{ try{ restoreJson($("#bkText").value); toast("Ripristinato: riavvio…"); setTimeout(()=>location.reload(),700); }catch(e){ toast("Backup non valido: "+e.message); } });
$("#bkClose").addEventListener("click",()=>closeM("#bkScrim"));
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-b]"); if(!b) return;
  const a=b.dataset.b;
  if(a==="quiz") openQuiz();
  else if(a==="add") openQuickAdd();
  else if(a==="edit") openQuickAdd(b.dataset.v);
  else if(a==="cat") openQuickAdd(null,b.dataset.v);
  else if(a==="cats") openCats();
  else if(a==="recon") openRecon(b.dataset.v);
  else if(a==="salary"){ const v=r2(num($("#salAmt").value)); if(!(v>0)){ toast("Scrivi l'importo"); return; } B.salary=B.salary||{}; B.salary[cycleOf().key]=v; bSave(); renderBudget(); if(typeof renderPiano==="function") renderPiano(); toast("Stipendio segnato"); }
  else if(a==="salreset"){ B.salary=B.salary||{}; delete B.salary[cycleOf().key]; bSave(); renderBudget(); }
  else if(a==="mode"){ B.mode=b.dataset.v; unfreezePlan(); setTimeout(renderModeSettings,0); if(B.mode==="manual" && !(B.goal>0)) B.goal=Math.round(modePlan("custom").save); bSave(); renderBudget(); if(typeof renderPiano==="function") renderPiano(); }
  else if(a==="netSave"){ const v=r2(num($("#netIn").value)); if(!(v>0)){ toast("Scrivi lo stipendio"); return; }
    B.ans.net=v; unfreezePlan(); settings.income=v; store.set("settings",settings); bSave(); renderBudget(); if(typeof renderPiano==="function") renderPiano(); toast("Stipendio aggiornato: "+m0(v)+" al mese"); }
  else if(a==="goalSave"){ const rc=(replay&&replay.enabled)?replayCost().total:0; let v=Math.round(num($("#goalIn").value));
    if(v<rc){ v=Math.ceil(rc); toast("Non può essere meno del Replay: "+m0(rc)); } else toast("Obiettivo: "+m0(v)+" al mese");
    B.goal=v; unfreezePlan(); bSave(); setTimeout(renderModeSettings,0); renderBudget(); if(typeof renderPiano==="function") renderPiano(); }
  else if(a==="backup"){ $("#bkText").value=backupJson(); openM("#bkScrim"); }
  else if(a==="goto"){ showTab(b.dataset.v); }
  else if(a==="recset"){ if(typeof closeSec==="function") closeSec(); showTab("impostazioni"); setTimeout(()=>{ const el=document.getElementById("sRec"); if(el){ renderRecSettings(); el.scrollIntoView({ behavior:"smooth", block:"start" }); } },300); }
});

/* ---------- impostazioni: sezione budget ---------- */
(function settingsSection(){
  const anchor=$("#saveSet") && $("#saveSet").closest(".btn-row"); if(!anchor) return;
  anchor.insertAdjacentHTML("beforebegin", `<div class="setgroup">
    <div class="gt">Budget</div>
    <div class="btn-row" style="margin-top:0"><button class="btn" type="button" data-b="quiz">Rifai le domande</button><button class="btn" type="button" data-b="cats">Categorie</button></div>
    <div class="gt" style="margin-top:18px">🔁 Spese ricorrenti</div>
    <div id="sRec"></div>
    <div class="gt" style="margin-top:18px">Motore</div>
    <div id="sEngine"></div>
    <div class="gt" style="margin-top:8px">Spese automatiche</div>
    <div id="sAuto"></div>
    <div class="gt" style="margin-top:8px">Dati</div>
    <button class="btn" type="button" data-b="backup">Backup e ripristino</button>
  </div>`);
  const fill=()=>{ if(typeof renderRecSettings==="function") renderRecSettings(); if(typeof renderAutoSettings==="function") renderAutoSettings(); if(typeof renderEngineSettings==="function") renderEngineSettings(); };
  fill();
  document.querySelector('.tab[data-tab="impostazioni"]').addEventListener("click",fill);
})();


/* ---------- spese automatiche: notifiche di pagamento, widget, scorciatoie, promemoria ---------- */
function merchantKey(m){ return String(m||"").toUpperCase().replace(/[0-9#*]+/g," ").replace(/[^A-Z&' ]/g," ").replace(/\s+/g," ").trim(); }
/* «Pagamento», «Google Wallet», «Transazione…»: la notifica non dice il negozio, quindi non si impara niente da lì */
function genericKey(k){ return !k || /^(PAGAMENTO|TRANSAZIONE|PAYMENT|ACQUISTO|GOOGLE WALLET|SAMSUNG WALLET|WALLET|NOTIFICA|SATISPAY|PAYPAL|FINECO)\b/.test(k); }
function natPending(){ if(!NAT || !NAT.pendingPayments) return []; try{ return JSON.parse(NAT.pendingPayments())||[]; }catch(e){ return []; } }
function syncNativeCats(){
  if(!NAT || !NAT.setCategories) return;
  try{
    // via quello imparato da notifiche senza il nome del negozio (prima finiva tutto in una categoria)
    [B.learn, B.learnN].forEach(o=>{ if(o) Object.keys(o).forEach(k=>{ if(genericKey(k)) delete o[k]; }); });
    const names={}; B.cats.forEach(c=>names[c.id]=c.n);
    NAT.setCategories(JSON.stringify(B.learn||{}), JSON.stringify(names));
    if(NAT.setAskBuoni) NAT.setAskBuoni(buoniOn());
    if(NAT.setAutoCats){ const auto={}; Object.entries(B.learnN||{}).forEach(([k,v])=>{ if(v && v.n>=2) auto[k]=v.cat; }); NAT.setAutoCats(JSON.stringify(auto)); }
    // widget: le tre categorie più usate negli ultimi 60 giorni
    const from=ymd(addDays(today0(),-60)), cnt={};
    B.tx.forEach(t=>{ if(t.type!=="in" && t.d>=from && t.cat!=="imprevisto") cnt[t.cat]=(cnt[t.cat]||0)+1; });
    const top=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a]);
    ["benzina","spesa","weekend","fuori","vizio"].forEach(k=>{ if(!top.includes(k) && B.cats.find(c=>c.id===k)) top.push(k); });
    NAT.setWidgetCats(JSON.stringify(top.slice(0,3).map(k=>[k,catById(k).e])));
    const t=ymd(new Date()); if(B.tx.some(x=>x.d===t)) NAT.setLastTxDate(t);
  }catch(e){}
}
/* le spese confermate dalla notifica diventano movimenti; le ignorate spariscono */
function importNativePayments(){
  const P=natPending(); if(!P.length) return 0;
  const done=[]; let n=0;
  P.forEach(p=>{
    if(p.status==="confirmed" && p.cat && p.auto){ const dp=dupOf(p); if(dp && dp.src==="manual" && (Math.abs(dp.amt-p.amt)<0.011 || Math.abs(dp.amt-(dp.buoniVal||0)-p.amt)<0.011)){ done.push(p.id); return; } }
    if(p.status==="confirmed" && p.cat){ addWalletTx(p, p.cat); const t=B.tx.find(x=>x.id==="np_"+p.id); if(t && (p.noBuoni || !buoniOn())) t.buoniAsked=true; done.push(p.id); n++; }
    else if(p.status==="ignored") done.push(p.id);
  });
  if(done.length){ NAT.removePayments(JSON.stringify(done)); bSave(); }
  return n;
}
function addWalletTx(p, cat){
  const id="np_"+p.id; if(B.tx.find(t=>t.id===id)) return;
  const d=new Date(p.ts||Date.now());
  // stesso pagamento visto da un'altra fonte (Google Wallet / Fineco): stesso importo entro 45 minuti
  if(B.tx.some(t=>(t.src==="wallet"||t.src==="fineco") && t.ts && Math.abs(t.ts-(p.ts||0))<45*60000 && Math.abs(t.amt-p.amt)<0.011)) return;
  B.tx.push({ id, src:p.src==="fineco"?"fineco":"wallet", type:"out", d:ymd(d), ts:p.ts||Date.now(), amt:r2(p.amt), cat, note:p.merchant||"Pagamento", pay:p.pay||"", kw:p.kw||"" });
  B.learn=B.learn||{}; B.learnN=B.learnN||{}; const k=merchantKey(p.merchant);
  if(k && !genericKey(k)){ B.learn[k]=cat; const o=B.learnN[k]; B.learnN[k] = (o && o.cat===cat) ? { cat, n:o.n+1 } : { cat, n:1 }; }
}
/* probabile doppione di una spesa segnata a mano (stesso giorno ±1, importo entro il 3%) */
function dupOf(p){
  const d=ymd(new Date(p.ts||Date.now()));
  const tol=Math.max(0.5,p.amt*0.03);
  return B.tx.find(t=>t.type!=="in" && t.src!=="wallet" && t.src!=="fineco" && Math.abs(dayDiff(parseYmd(t.d),parseYmd(d)))<=1 && (Math.abs(t.amt-p.amt)<=tol || Math.abs(t.amt-(t.buoniVal||0)-p.amt)<=tol));
}
function inboxHtml(){
  const P=natPending().filter(p=>p.status==="new");
  if(!P.length) return "";
  // categoria indovinata + le più usate; le altre dietro «Altre»
  const used={}; const from=ymd(addDays(today0(),-90)); B.tx.forEach(t=>{ if(t.d>=from && t.type!=="in") used[t.cat]=(used[t.cat]||0)+1; });
  const ORD=["spesa","pasto","benzina","fuori","weekend","vizio","shopping","salute","casavarie","altro"];
  const allCats=B.cats.filter(c=>c.g!=="fisse"||c.plan>0);
  const top=allCats.slice().sort((a,b)=>(used[b.id]||0)-(used[a.id]||0) || (ORD.indexOf(a.id)+1||50)-(ORD.indexOf(b.id)+1||50)).filter(c=>c.g!=="fisse"&&c.g!=="extra").slice(0,6);
  return `<section id="inbox"><div class="card binbox"><div class="bw-h">🔔 Da confermare (${P.length})</div>
    <p class="bnote" style="margin-top:0">Pagamenti letti da Google Wallet e da Fineco. Controlla la categoria e conferma: dopo due conferme uguali per lo stesso negozio li segno da solo.</p>
    ${P.sort((a,b)=>b.ts-a.ts).map(p=>{ const dup=dupOf(p); const sel=(B._inSel||{})[p.id]||p.cat||"";
      return `<div class="ib-item" data-id="${esc(p.id)}">
        <div class="ib-top"><b class="num">${money(p.amt)}</b><span>${esc(p.merchant)}</span><small>${new Date(p.ts).toLocaleString("it-IT",{ day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })}</small></div>
        ${(B._force||{})[p.id] && p.kw==="spesa"?`<div class="bc-note">Scegli la categoria (per un pranzo «Pranzo pronto») e quanti buoni hai usato.</div>`:""}
        ${(()=>{ const rc=recMatch(p); return rc && sel!==rc.id ? `<div class="bc-note rec">🔁 Sembra <b>${esc(rc.n)}</b>, la tua spesa ricorrente${rc.day?` del ${rc.day}`:""}. <button class="chip on" data-ib="rec" data-v="${rc.id}">Sì, è ${esc(rc.n)}</button></div>` : ""; })()}
        ${dup?`<div class="bc-note">Sembra la stessa spesa di «${esc(dup.note||catById(dup.cat).n)}» del ${esc(fDay(dup.d))}: probabilmente va ignorata.</div>`:""}
        ${(B._inSub||{})[p.id] ? subFormHtml(p) : ""}
        <div class="ib-cats">${(B._inSub||{})[p.id]?"":`<button class="chip sub" data-ib="sub">🔁 È un abbonamento</button>`}${(((B._inAll||{})[p.id]) ? allCats : allCats.filter(c=>c.id===sel || top.includes(c))).map(c=>`<button class="chip ${sel===c.id?"on":""}" data-ib="cat" data-v="${c.id}">${c.e} ${esc(c.n)}</button>`).join("")}${(B._inAll||{})[p.id]?"":`<button class="chip" data-ib="all">Altre…</button>`}</div>
        ${buoniOn() && isBuoniCat(sel) ? `<div class="bnote" style="margin:8px 0 4px">Hai usato anche buoni pasto? (ne hai ${B.buoni.bal})</div>${buoniChips(((B._inBuoni||{})[p.id])||0, B.buoni.bal, "ibb", p.id)}` : ""}
        <div class="btn-row" style="margin-top:8px"><button class="btn ghost" data-ib="ignore" style="flex:0 0 auto;padding:10px 16px">Ignora</button><button class="btn gold" data-ib="ok" ${sel?"":"disabled"}>${sel?"Conferma: "+esc(catById(sel).n):"Scegli la categoria"}</button></div>
      </div>`; }).join("")}</div></section>`;
}
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-ib]"); if(!b) return;
  const it=b.closest(".ib-item"), id=it&&it.dataset.id; if(!id) return;
  const p=natPending().find(x=>x.id===id); if(!p) return;
  B._inSel=B._inSel||{};
  if(b.dataset.ib==="cat"){ B._inSel[id]=b.dataset.v; renderBudget(); return; }
  if(b.dataset.ib==="all"){ B._inAll=B._inAll||{}; B._inAll[id]=true; renderBudget(); return; }
  if(b.dataset.ib==="ok"){ const cat=B._inSel[id]||p.cat; if(!cat) return; addWalletTx(p,cat);
    { const t=B.tx.find(x=>x.id==="np_"+p.id); if(t){ setBuoni(t, isBuoniCat(cat) ? (((B._inBuoni||{})[id])||0) : 0); t.buoniAsked=true; } } delete B._inSel[id]; NAT.removePayments(JSON.stringify([id])); bSave(); syncNativeCats(); renderBudget(); toast("Spesa aggiunta: "+catById(cat).n); }
  if(b.dataset.ib==="rec"){ const c=B.cats.find(x=>x.id===b.dataset.v); if(!c) return; addWalletTx(p, c.id); recLearn(c, p.merchant); { const t=B.tx.find(x=>x.id==="np_"+p.id); if(t) t.buoniAsked=true; }
    delete B._inSel[id]; NAT.removePayments(JSON.stringify([id])); bSave(); syncNativeCats(); renderBudget(); toast(`🔁 ${c.n}: segnata. Le prossime volte la riconosco da sola`); return; }
  if(b.dataset.ib==="sub"){ B._inSub=B._inSub||{}; B._inSub[id]={ n:subGuessName(p), f:"m" }; renderBudget(); setTimeout(()=>{ const i=document.getElementById("subN_"+id); if(i){ i.focus(); i.select(); } },60); return; }
  if(b.dataset.ib==="subx"){ delete B._inSub[id]; renderBudget(); return; }
  if(b.dataset.ib==="subok"){ const box=it.querySelector(".subf"), n=(box.querySelector(".rc-n").value||"").trim(), f=box.dataset.f==="y"?"y":"m", amt=r2(num(box.querySelector(".rc-a").value)), dv=box.querySelector(".rc-d").value;
    if(!n){ toast("Scrivi il nome dell'abbonamento"); box.querySelector(".rc-n").focus(); return; }
    if(!(amt>0)){ toast("Scrivi l'importo"); box.querySelector(".rc-a").focus(); return; }
    if(!dv){ toast("Scegli la data del prelievo"); box.querySelector(".rc-d").focus(); return; }
    const d=parseYmd(dv), c=subSave(p, n, f, amt, d); delete B._inSub[id]; delete B._inSel[id]; NAT.removePayments(JSON.stringify([id]));
    recAfter(); toast(`🔁 ${c.n}: ${money(amt)} ${f==="y"?"ogni anno":"ogni mese"} il ${d.getDate()}${f==="y"?" "+REC_MESI[d.getMonth()]:""}`); return; }
  if(b.dataset.ib==="ignore"){ delete B._inSel[id]; NAT.removePayments(JSON.stringify([id])); renderBudget(); toast("Ignorata"); }
});
/* aperture da widget / scorciatoie / notifiche */
window.grzLaunch=function(){
  if(!NAT || !NAT.takeLaunchAction) return;
  let a=""; try{ a=NAT.takeLaunchAction()||""; }catch(e){}
  if(!a) return;
  if(a==="add"){ showTab("budget"); openQuickAdd(); }
  else if(a.indexOf("add:")===0){ showTab("budget"); openQuickAdd(null,a.slice(4)); }
  else if(a.indexOf("edit:")===0){ importNativePayments(); bSave(); showTab("budget"); const t=B.tx.find(x=>x.id==="np_"+a.slice(5)); if(t) openQuickAdd(t.id); else renderBudget(); }
  else if(a.indexOf("pasto:")===0){ const id=a.slice(6); B._force=B._force||{}; B._force[id]=1; B._inSel=B._inSel||{}; B._inSel[id]="pasto"; showTab("budget"); renderBudget(); setTimeout(()=>{ const el=$("#inbox"); if(el) el.scrollIntoView({ behavior:"smooth", block:"start" }); },150); }
  else if(a.indexOf("review:")===0){ B._force=B._force||{}; B._force[a.slice(7)]=1; renderBudget(); showTab("budget"); setTimeout(()=>{ const el=$("#inbox"); if(el) el.scrollIntoView({ behavior:"smooth", block:"start" }); },150); }
};
document.addEventListener("visibilitychange",()=>{ if(!document.hidden && typeof renderAutoSettings==="function") renderAutoSettings(); });
/* le notifiche già gestite spariscono dalla tendina (e il bollino rosso dall'icona) appena apri l'app */
function tidyNotifs(){ try{ if(NAT && NAT.tidyNotifications){ const keep=natPending().filter(p=>p.status==="new").map(p=>p.id); NAT.tidyNotifications(JSON.stringify(keep)); } }catch(e){} }
function nativeTick(){ setTimeout(tidyNotifs, 400); const n=importNativePayments(); if(n) toast(n===1?"1 spesa confermata dalla notifica":n+" spese confermate dalle notifiche"); syncNativeCats(); renderBudget(); window.grzLaunch(); }
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) nativeTick(); });

/* impostazioni: spese automatiche e promemoria */
function renderAutoSettings(){
  const el=$("#sAuto"); if(!el) return;
  if(!NAT || !NAT.hasNotificationAccess){ el.innerHTML=`<p class="hint" style="margin:0;color:var(--muted);font-size:12px">Disponibile nell'app Android.</p>`; return; }
  let acc=false, own=true; try{ acc=NAT.hasNotificationAccess(); if(NAT.appNotificationsEnabled) own=NAT.appNotificationsEnabled(); }catch(e){}
  const S=B.auto||{ on:true, all:false, rem:true, remAt:"21:00" };
  el.innerHTML=`<p class="hint" style="margin:0 0 10px;color:var(--muted);font-size:12px">Quando paghi con il telefono (Google Wallet) o arriva l'SMS di Fineco, ti propongo la spesa già compilata e la confermi dalla notifica. Leggo solo i pagamenti: gli altri messaggi li ignoro e resta tutto sul telefono. Servono due permessi:</p>
    <div class="switch" style="border-top:none;padding-top:0"><span class="lab">1. Leggere i pagamenti (accesso alle notifiche)</span><span class="pill ${acc?"ok":"warn"}">${acc?"attivo":"da attivare"}</span></div>
    ${acc?"":`<button class="btn gold" type="button" data-au="access" style="margin-bottom:10px">Attiva la lettura dei pagamenti</button>`}
    <div class="switch"><span class="lab">2. Mostrarti le notifiche di Gruzzolo</span><span class="pill ${own?"ok":"warn"}">${own?"attive":"bloccate"}</span></div>
    ${own?"":`<button class="btn gold" type="button" data-au="own" style="margin-bottom:10px">Attiva le notifiche di Gruzzolo</button>`}
    <div class="btn-row" style="margin-top:4px"><button class="btn ghost" type="button" data-au="test">Prova con una spesa finta</button></div>
    <p class="hint" style="margin:8px 0 0;color:var(--muted);font-size:11.5px">Sui Samsung, se le notifiche smettono di arrivare: Impostazioni → Batteria → Limiti utilizzo in background → togli Gruzzolo dalle app in sospensione.</p>
    <div class="switch"><span class="lab">Anche le notifiche delle app della banca</span><div class="toggle ${S.all?"on":""}" data-au="all"></div></div>
    <div class="switch"><span class="lab">Promemoria serale se non hai segnato spese</span><div class="toggle ${S.rem?"on":""}" data-au="rem"></div></div>
    <label class="fld"><span class="lab">Ora del promemoria</span><input type="time" id="sRemAt" value="${esc(S.remAt||"21:00")}"></label>`;
}
function applyAutoSettings(){
  const S=B.auto||{ on:true, all:false, rem:true, remAt:"21:00" }; B.auto=S;
  if(!NAT) return;
  try{ NAT.setPaymentSettings(S.on!==false, !!S.all); const hm=String(S.remAt||"21:00").split(":"); NAT.setEveningReminder(!!S.rem, (+hm[0]||21)*60+(+hm[1]||0)); }catch(e){}
}
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-au]"); if(!b) return;
  const S=B.auto||(B.auto={ on:true, all:false, rem:true, remAt:"21:00" });
  const a=b.dataset.au;
  if(a==="access"){ try{ NAT.openNotificationAccess(); }catch(e){} }
  else if(a==="own"){ try{ NAT.openAppNotificationSettings(); }catch(e){} }
  else if(a==="test"){ try{ NAT.testPaymentNotification(); toast("Notifica di prova inviata"); setTimeout(()=>{ renderBudget(); },800); }catch(e){} }
  else if(a==="all"){ S.all=!S.all; }
  else if(a==="rem"){ S.rem=!S.rem; }
  bSave(); applyAutoSettings(); renderAutoSettings();
});
document.addEventListener("change",e=>{ if(e.target.id==="sRemAt"){ (B.auto=B.auto||{}).remAt=e.target.value; bSave(); applyAutoSettings(); } });

/* unisce le categorie appena calcolate con quelle di prima: restano nomi, giorni di pagamento, scadenze e correzioni a mano.
   Se nelle domande hai cambiato proprio quel valore (es. l'assicurazione), vince la risposta nuova. */
const SINK_ANS={ assic:["insAnnual","insDue"], bollo:["kw","bolloDue"], manut:["maint",null] };
function mergeCats(L, oldCats, prevAns){
  const old={}; (oldCats||[]).forEach(c=>old[c.id]=c);
  return L.map(n=>{ const o=old[n.id]; if(!o) return n;
    n.n=o.n; if(o.day) n.day=o.day;
    if(n.sink && o.sink){ const m=SINK_ANS[n.id]||[], same=k=>!prevAns || !k || String(prevAns[k]??"")===String(B.ans[k]??"");
      if(o.sink.due && (!n.sink.due || same(m[1]))) n.sink.due=o.sink.due;
      if(o.sinkEdited && same(m[0])){ n.sink.annual=o.sink.annual; n.plan=r2(o.sink.annual/12); n.sinkEdited=true; } }
    if(o.edited){ n.plan=o.plan; delete n.lo; delete n.hi; if(o.lo!=null){ n.lo=o.lo; n.hi=o.hi; } n.edited=true; }
    return n; });
}
/* categorie ricalcolate dalle risposte (così ogni correzione dei calcoli vale subito, senza rifare le domande) */
function recalcCats(){
  if(!B.setup || !B.ans || !B.cats || !B.cats.length) return;
  try{
    const old={}; B.cats.forEach(c=>old[c.id]=c);
    const L=buildCats(B.ans).map(n=>{ const o=old[n.id]; if(!o || n.rec) return n;
      n.n=o.n; if(o.day) n.day=o.day;
      if(n.sink && o.sink){ if(o.sink.due) n.sink.due=o.sink.due;
        if(o.sinkEdited || (n.id!=="bollo" && Math.abs((o.sink.annual||0)-n.sink.annual)>0.5)){ n.sink.annual=o.sink.annual; n.plan=r2(o.sink.annual/12); n.sinkEdited=true; } }
      if(o.edited){ n.plan=o.plan; delete n.lo; delete n.hi; if(o.lo!=null){ n.lo=o.lo; n.hi=o.hi; } n.edited=true; }
      return n; });
    B.cats=L; bSave();
  }catch(e){}
}

/* ---------- avvio ---------- */
recalcCats();
applyAutoSettings();
nativeTick();
document.addEventListener("visibilitychange",()=>{ if(!document.hidden){ recalcCats(); renderBudget(); if(typeof renderPiano==="function") renderPiano(); } });
// a mezzanotte cambia il giorno: ricalcolo senza aspettare
let lastDay=ymd(new Date()); setInterval(()=>{ const d=ymd(new Date()); if(d!==lastDay && !document.hidden){ lastDay=d; renderBudget(); if(typeof renderPiano==="function") renderPiano(); } }, 60000);
if(!B.setup && !store.get("budgetSkip",false)) setTimeout(()=>{ store.set("budgetSkip",true); openQuiz(); },600);
