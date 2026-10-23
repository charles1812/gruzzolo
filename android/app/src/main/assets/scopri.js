/* ---------- Portafoglio: Scopri ----------
   Notizie sui tuoi investimenti, andamento dei tuoi ETF, idee del momento e il reparto «Follia».
   Tutto calcolato sul momento dai prezzi di Yahoo Finance (ritardo di circa 15 minuti): nessun dato inventato.
   Le idee sono regole semplici e dichiarate (peso nel tuo profilo, sconto dal massimo, forza degli ultimi 12 mesi),
   non promesse di guadagno. */
const SC = { data:{}, at:0, busy:false, news:null, newsAt:0 };
// ETF diversificati (per «in saldo») e temi (per «temi in forma»): versioni UCITS quotate in euro
const SC_CORE = [["SWDA.MI","Azioni mondo"],["EIMI.MI","Mercati emergenti"],["SMEA.MI","Europa"],["IUSN.DE","Piccole aziende mondo"],["EQQQ.MI","Nasdaq 100"],["SGLD.MI","Oro"]];
const SC_THEMES = [["JEDI.DE","Spazio","🚀"],["DFEN.DE","Difesa","🛡️"],["XAIX.DE","Intelligenza artificiale","🤖"],["VVSM.DE","Semiconduttori","💾"],["IQQH.DE","Energia pulita","☀️"],["ROBO.MI","Robotica","🦾"],["HEAL.MI","Salute e biotech","🧬"],["SGLD.MI","Oro","🥇"],["BTCE.DE","Bitcoin","₿"]];
// reparto Follia: azioni singole molto volatili, comprabili su un normale conto titoli
const SC_CRAZY = [["SPCX","SpaceX","🚀","Quotata al Nasdaq dal 12 giugno 2026, prezzo di collocamento 135 $."],["RKLB","Rocket Lab","🛰️","Lanci e satelliti: la concorrente piccola di SpaceX."],["ASTS","AST SpaceMobile","📡","Internet dallo spazio direttamente sul telefono."],
  ["PLTR","Palantir","🧠","Software di analisi dati e IA per governi e aziende."],["NVDA","Nvidia","💾","I chip che fanno girare l'intelligenza artificiale."],["TSLA","Tesla","⚡","Auto elettriche, robot e guida autonoma."],
  ["IONQ","IonQ","⚛️","Computer quantistici: tanta promessa, pochi ricavi."],["OKLO","Oklo","☢️","Piccoli reattori nucleari, ancora senza ricavi."],["COIN","Coinbase","🪙","La borsa delle criptovalute: segue il Bitcoin."],["MSTR","Strategy","₿","Azienda che compra Bitcoin: amplifica i suoi movimenti."]];

function scStats(pts){
  const c=pts.map(p=>p.c), n=c.length; if(n<5) return null;
  const last=c[n-1], at=k=>c[Math.max(0,n-1-k)];
  let max=0, dd=0, peak=c[0], ss=0, m=0;
  const r=[]; for(let i=1;i<n;i++){ const x=Math.log(c[i]/c[i-1]); r.push(x); }
  r.forEach(x=>m+=x); m/=r.length; r.forEach(x=>ss+=(x-m)*(x-m));
  c.forEach(v=>{ if(v>peak) peak=v; dd=Math.min(dd, v/peak-1); if(v>max) max=v; });
  const sma=k=>{ const a=c.slice(-k); return a.reduce((s,v)=>s+v,0)/a.length; };
  return { last, d1:last/at(1)-1, m1:last/at(21)-1, m3:last/at(63)-1, y1:last/c[0]-1, mom:at(21)/c[0]-1,
    vol:Math.sqrt(ss/Math.max(1,r.length-1))*Math.sqrt(252), dd, off:last/max-1, above200: n>=200 ? last>sma(200) : null, days:n, first:c[0], series:c };
}
async function scLoad(force){
  if(SC.busy) return; if(!force && Date.now()-SC.at<30*60000 && Object.keys(SC.data).length) return;
  SC.busy=true;
  const L=[...new Set([...holdings.map(h=>h.ticker), ...SC_CORE.map(x=>x[0]), ...SC_THEMES.map(x=>x[0]), ...SC_CRAZY.map(x=>x[0])])];
  await Promise.all(L.map(async s=>{ try{ const d=await fetchHistory(s,12); const st=scStats(d.pts); if(st) SC.data[s]={ ...st, cur:d.cur }; }catch(e){} }));
  SC.at=Date.now(); SC.busy=false;
}
async function scLoadNews(){
  if(SC.news && Date.now()-SC.newsAt<20*60000) return;
  try{ const u=engNewsUrl(); if(!u) return;
    const r=await fetch(u,{ cache:"no-store" });
    const j=await r.json(); if(j && j.news){ SC.news=j.news; SC.newsAt=Date.now(); } }catch(e){}
}
const scPct=(x,d=1)=>`${x>=0?"+":"−"}${Math.abs(x*100).toFixed(d).replace(".",",")}%`;
const scCls=x=>x>=0?"pos":"neg";
function scSpark(series, w=96, h=30){
  if(!series||series.length<2) return "";
  const s=series.filter((_,i)=>i%Math.max(1,Math.floor(series.length/60))===0).concat([series[series.length-1]]);
  const mn=Math.min(...s), mx=Math.max(...s), X=i=>i/(s.length-1)*w, Y=v=>h-2-(h-4)*(v-mn)/((mx-mn)||1);
  const up=s[s.length-1]>=s[0];
  return `<svg viewBox="0 0 ${w} ${h}" class="sc-sp ${up?"up":"dn"}" aria-hidden="true"><polyline points="${s.map((v,i)=>X(i).toFixed(1)+","+Y(v).toFixed(1)).join(" ")}"/></svg>`;
}
function scRisk(vol){ return vol>0.8?["estremo",5]:vol>0.55?["altissimo",4]:vol>0.35?["alto",3]:vol>0.2?["medio",2]:["basso",1]; }
function scMoney(v,cur){ if(cur==="USD") return "$"+v.toLocaleString("it-IT",{ maximumFractionDigits:2, minimumFractionDigits:2 }); if(cur==="GBp") return (v/100).toLocaleString("it-IT",{ maximumFractionDigits:2 })+" £"; return money(v); }

function scopriHtml(){
  const D=SC.data, tv=totals().val, hasData=Object.keys(D).length>0;
  let h="";
  if(!hasData) return "";
  h+=follyBlock();
  const when=new Date(SC.at).toLocaleTimeString("it-IT",{ hour:"2-digit", minute:"2-digit" });

  // 2) andamento dei tuoi ETF
  const mine=holdings.map(x=>({ t:x.ticker, n:shortName(x.ticker), s:D[x.ticker] })).filter(x=>x.s);
  if(false) h+=`<div class="card"><div class="sc-t">📈 Come vanno i tuoi</div>${mine.map(x=>`<div class="sc-row"><div class="sc-nm"><b>${esc(x.n)}</b><small>${x.s.above200==null?"":x.s.above200?"sopra la media di 200 giorni":"sotto la media di 200 giorni"}</small></div>${scSpark(x.s.series)}
      <div class="sc-pc"><span class="${scCls(x.s.d1)}">${scPct(x.s.d1,2)}</span><small>oggi</small></div><div class="sc-pc"><span class="${scCls(x.s.m1)}">${scPct(x.s.m1)}</span><small>1 mese</small></div><div class="sc-pc"><span class="${scCls(x.s.y1)}">${scPct(x.s.y1)}</span><small>1 anno</small></div></div>`).join("")}</div>`;

  return h;
}
function scIdeas(D){
  // idee del momento: schede uguali a quelle della Follia (grafico, 1 anno, 1 mese, peggior calo, rischio)
  const ideas=[];
  try{ const p=planCompute(); if(p && p.buys && p.buys.length){ const b=p.buys[0]; ideas.push({ cls:"gold", e:"🎯", k:"Prossimo acquisto", n:`${b.n} × ${shortName(b.t)}`, t:b.t, s:D[b.t]||null, px:b.px, go:"piano" }); } }catch(e){}
  const sale=SC_CORE.map(([t,n])=>({ t, n, s:D[t] })).filter(x=>x.s && x.s.off<=-0.07).sort((a,b)=>a.s.off-b.s.off);
  sale.slice(0,2).forEach(x=>ideas.push({ cls:"blue", e:"🏷️", k:`In saldo ${scPct(x.s.off,0)}`, n:x.n, t:x.t, s:x.s }));
  const th=SC_THEMES.map(([t,n,e])=>({ t, n, e, s:D[t] })).filter(x=>x.s).sort((a,b)=>b.s.mom-a.s.mom);
  th.slice(0,3).forEach((x,i)=>ideas.push({ cls:i===0?"green":"teal", e:x.e, k:i===0?"Tema più in forma":"Tema in forma", n:x.n, t:x.t, s:x.s }));
  const worst=th.slice(-1)[0]; if(worst && worst.s.y1<0) ideas.push({ cls:"red", e:"🧊", k:"Tema in difficoltà", n:worst.n, t:worst.t, s:worst.s });
  return ideas;
}
/* una scheda: stessa forma per Idee e Follia */
function scCard(x, cls){
  const s=x.s, rk=s?scRisk(s.vol):null, ipo=x.t==="SPCX"&&s?s.last/135-1:null;
  return `<div class="sc-crazy ${cls||""} ${x.cls||""}" ${x.go?`data-b="goto" data-v="${x.go}"`:""}><div class="scc-h"><span class="sc-e">${x.e}</span><div><b>${esc(x.n)}</b><small>${esc(shortName(x.t))}${s?` · ${scMoney(s.last,s.cur)}`:x.px?` · ${money(x.px)}`:""}</small></div>${s?`<span class="${scCls(s.d1)} scc-d">${scPct(s.d1,1)}</span>`:""}</div>
    <span class="scc-tag">${esc(x.k)}</span>
    ${s?scSpark(s.series,180,44):""}
    ${s?`<div class="scc-k"><div><small>${s.days<240?"dall'inizio":"1 anno"}</small><b class="${scCls(s.y1)}">${scPct(s.y1,0)}</b></div><div><small>1 mese</small><b class="${scCls(s.m1)}">${scPct(s.m1,0)}</b></div><div><small>peggior calo</small><b class="neg">${scPct(s.dd,0)}</b></div></div>`:""}
    ${ipo!=null?`<div class="scc-ipo">Dal collocamento (135 $): <b class="${scCls(ipo)}">${scPct(ipo,0)}</b></div>`:""}
    ${rk?`<div class="scc-r"><span>rischio ${rk[0]}</span><i>${"●".repeat(rk[1])}${"○".repeat(5-rk[1])}</i></div>`:""}</div>`;
}
function ideasBlock(){
  const D=SC.data; if(!Object.keys(D).length) return "";
  const L=scIdeas(D); if(!L.length) return "";
  return `<div class="sc-t sc-tt">💡 Idee del momento</div><div class="sc-car">${L.map(x=>scCard(x,"scid")).join("")}</div>`;
}
function follyBlock(){
  const D=SC.data, cr=SC_CRAZY.map(([t,n,e])=>({ t, n, e, k:"Follia", cls:"folly", s:D[t] })).filter(x=>x.s);
  if(!cr.length) return "";
  return `<div class="sc-t sc-tt">🎢 Follia</div><div class="sc-car">${cr.map(x=>scCard(x,"")).join("")}</div>`;
}
function newsBlock(){
  const arts=[]; ((SC.news&&SC.news.items)||[]).forEach(it=>(it.articles||[]).forEach(a=>arts.push({ ...a, topic: it.t==="_mercati"?"Mercati":shortName(it.t) })));
  arts.sort((a,b)=>(b.ts||0)-(a.ts||0)); const uniq=typeof newsDedup==="function"?newsDedup(arts):arts; arts.length=0; arts.push(...uniq); if(!arts.length) return ""; const dot=s=>s<=-0.25?"neg":s>=0.25?"pos":"neu";
  return `<div class="card sc-news"><div class="sc-t">📰 Notizie sui tuoi investimenti</div>${arts.slice(0,4).map(a=>`<a class="sc-n" href="${esc(a.link)}" target="_blank" rel="noopener"><span class="ndot ${dot(a.s)}"></span><div class="sc-nt"><b>${esc(a.title)}</b><small>${esc(a.topic)} · ${esc(a.src||"")} · ${a.ts?new Date(a.ts).toLocaleDateString("it-IT",{ day:"numeric", month:"short" }):""}</small></div>${a.img?`<img class="nimg" src="${esc(a.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`:""}</a>`).join("")}
      <button class="sc-more" data-sc="news">Tutte le notizie →</button></div>`;
}
function scIdeasUnused(){

  return h;
}
function scPaint(){
  const host=document.getElementById("scHost"), ih=document.getElementById("ideasHost"), nh=document.getElementById("newsHost");
  if(host) host.innerHTML=scopriHtml(); if(ih) ih.innerHTML=ideasBlock(); if(nh) nh.innerHTML=newsBlock();
}
async function mountScopri(force){
  if(!document.getElementById("scHost")) return;
  scPaint();
  const need=force || !Object.keys(SC.data).length || Date.now()-SC.at>30*60000;
  if(need){ await Promise.all([scLoad(force), scLoadNews()]); scPaint(); }
}
document.addEventListener("click",e=>{ const b=e.target.closest("[data-sc]"); if(!b) return;
  if(b.dataset.sc==="reload"){ SC.at=0; histKeysClear(); mountScopri(true); }
  else if(b.dataset.sc==="news"){ showTab("notizie"); } });
function histKeysClear(){ try{ Object.keys(histCache).forEach(k=>{ if(k.endsWith("_12")) delete histCache[k]; }); }catch(e){} }
