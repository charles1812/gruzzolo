/* ---------- Grafico della strategia nel Piano: tre modi di vederla (si sceglie nelle Impostazioni) ----------
   🏺 Il vaso: un vaso di vetro con un liquido a strati, uno per fondo, alti quanto il loro peso. I più rischiosi
      galleggiano in alto e ondeggiano di più; ogni mese il versamento cade a gocce sullo strato più sotto peso.
   🌳 Il giardino: le azioni sono alberi, le obbligazioni una siepe, la liquidità uno stagno. Grandi quanto il peso,
      il vento li muove quanto oscillano.
   🍩 La torta 3D: l'anello a fette estruse (strategia.js).
   ⏱ Macchina del tempo (vaso e giardino): la strategia rifatta dal 2004 a oggi con i rendimenti veri e il versamento
      del mese. Nelle crisi arriva la tempesta: il valore scende, le gocce (i versamenti) continuano a cadere. */
const VZ_ORDER = ["XEON", "AGGH", "SWDA", "EIMI"];             // dal fondo del vaso in su: dal più calmo al più agitato
const VZ = { tm:null, drops:[], rip:[], bub:[], rain:[], leaves:[], flash:0, nextDrop:0, seed:{} };
/* i modi di vedere la strategia: { e, n (nome), note, tm (macchina del tempo), draw } (gli altri in strategia-viz2.js) */
const VZ_MODES = {
  vaso:{ e:"🏺", n:"Il vaso", note:"strato = peso · onde = quanto oscilla · gocce = versamenti", tm:true },
  giardino:{ e:"🌳", n:"Il giardino", note:"alberi = azioni · siepe = obbligazioni · stagno = liquidità · vento = quanto oscilla", tm:true },
  torta:{ e:"🍩", n:"La torta 3D", note:"fetta = peso · altezza = quanto oscilla · trascina per girare", tm:false },
  monete:{ e:"🪙", n:"Le monete", note:"una moneta = una quota · una pila per ogni ETF · tocca una pila per il suo grafico", tm:false },
};
/* cosa vuol dire quello che vedi (per i modi che non lo dicono già nella nota) */
const VZ_MEAN = {};
/* legenda sempre visibile sotto il grafico (per i modi che ce l'hanno): [simbolo, testo HTML] */
const VZ_LEG = {};
document.addEventListener("toggle",e=>{ if(e.target.id==="vzMean" && e.target.classList.contains("vz-leg")) VZ.legOpen=e.target.open; }, true);
/* il portafoglio vero, per voce del modello (i titoli fuori modello contano come azioni mondo, o obbligazioni) */
function vzActual(){ const now={}; let tn=0; (holdings||[]).forEach(h=>{ const k=Object.keys(ASSETS).find(x=>ASSETS[x].t===h.ticker); const kk=k&&ST_KEYS.includes(k)?k:(k&&ASSETS[k]&&ASSETS[k].k==="ob"?"AGGH":"SWDA"); const v=Math.max(0,valueOf(h)); now[kk]=(now[kk]||0)+v; tn+=v; }); return { now, tn }; }
/* cosa disegna il grafico in cima: il tuo portafoglio (se hai posizioni e guardi la tua strategia) o l'anteprima */
function vzTarget(){ const A=vzActual(), mine=PL.provisional?null:PL.prof, q=(typeof STG!=="undefined"&&STG.q!=null)?STG.q:(PL.prof||3);
  if(A.tn>0 && (q===mine || (mine==null && q===PL.prof))){ VZ.view={ kind:"mine", q, tn:A.tn, now:A.now }; return Object.fromEntries(ST_KEYS.map(k=>[k,(A.now[k]||0)/A.tn*100])); }
  VZ.view={ kind:"preview", q, tn:A.tn }; return Object.assign({}, stW(q)); }
function vzCapTxt(){ const v=VZ.view||{}, pn=v.q===6?"Su misura":((PROFILES[v.q]||{}).n||""); return v.kind==="mine"?`▍IL TUO PORTAFOGLIO · ${vzM0(v.tn)}`:`▍ANTEPRIMA · STRATEGIA ${pn.toUpperCase()}`; }
function vzCapUpdate(){ const c=document.getElementById("vzCap"); if(c) c.textContent=vzCapTxt(); const n=document.getElementById("vzMean"); if(n) n.outerHTML=vzMeanHtml(); }
function vzMeanHtml(){ const m=vzMode();
  if(VZ_LEG[m]){ let R=[]; try{ R=VZ_LEG[m](); }catch(e){} return `<details class="vz-leg" id="vzMean" ${VZ.legOpen?"open":""}><summary>ⓘ legenda</summary><div class="vz-lb">${R.map(([i,t])=>`<div class="vz-lr"><b>${i}</b><span>${t}</span></div>`).join("")}</div></details>`; }
  const L=(VZ_MEAN[m]&&VZ_MEAN[m]())||VZ_MODES[m].note.split(" · ");
  return `<details class="vz-mean" id="vzMean"><summary>${esc(VZ_MODES[m].e+" "+VZ_MODES[m].n)} · cosa vuol dire</summary><ul>${L.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></details>`; }
function vzTopHtml(){ if(!ST3.tgt || !VZ.view) ST3.tgt=vzTarget(); setTimeout(st3dKick,0);
  return `<div class="vz-top"><div class="vz-cap" id="vzCap">${esc(vzCapTxt())}</div><canvas id="st3d" class="st-3d" aria-label="Il tuo portafoglio in un grafico animato"></canvas>
    ${vzMeanHtml()}${vzChipsHtml()}<div class="st-tmrow" id="stTm">${vzTmHtml()}</div></div>`; }
function vzMode(){ const v=(typeof settings!=="undefined" && settings.stViz) || "sfera"; return VZ_MODES[v]?v:"vaso"; }
function vzTitle(){ return "portafoglio // "+VZ_MODES[vzMode()].n.toLowerCase(); }
function vzNote(tn){ return VZ_MODES[vzMode()].note; }
function vzChipsHtml(){ const m=vzMode(); return `<div class="st-vz" role="tablist" aria-label="Come vedere la strategia">${Object.entries(VZ_MODES).map(([k,v])=>`<button class="${k===m?"on":""}" data-vz="${k}" title="${esc(v.n)}" aria-label="${esc(v.n)}">${v.e}</button>`).join("")}</div>`; }
document.addEventListener("click",e=>{ const b=e.target.closest("[data-vz]"); if(!b) return; settings.stViz=b.dataset.vz; store.set("settings",settings); VZ.tm=null; VZ.drops=[]; VZ.rain=[]; VZ.leaves=[];
  const s=document.getElementById("sViz"); if(s) s.value=settings.stViz; const y=window.scrollY; if(typeof mountForziere==="function") mountForziere(); renderPiano(); window.scrollTo(0,y); });
function vzTmHtml(){ if(!VZ_MODES[vzMode()].tm || typeof HIST==="undefined" || !HIST) return "";
  const on=VZ.tm && VZ.tm.on, done=VZ.tm && VZ.tm.done;
  return `<button class="hud-btn st-tm" data-st="tm" style="--c:var(--violet)">${on?"ferma":done?"rivedi dal "+HIST.months[0].slice(0,4):`macchina del tempo ${HIST.months[0].slice(0,4)} → oggi`}</button>`; }

/* la strategia mese per mese sui rendimenti veri, come pacSim: il versamento compra le voci sotto peso */
function vzSim(w, M){
  const N=HIST.months.length, val={}, keys=ST_KEYS.filter(k=>(w[k]||0)>0); keys.forEach(k=>val[k]=0);
  const out={ vals:[], tot:[], paid:[], buy:[], ret:[] }; let paid=0;
  for(let t=0;t<N;t++){
    let V=keys.reduce((a,k)=>a+val[k],0); const de={}; let dt=0, best=null;
    keys.forEach(k=>{ de[k]=Math.max(0,w[k]*(V+M)-val[k]); dt+=de[k]; if(best==null || de[k]>de[best]) best=k; });
    keys.forEach(k=>val[k]+= dt>0 ? M*de[k]/dt : M*w[k]); paid+=M;
    const V0=keys.reduce((a,k)=>a+val[k],0); keys.forEach(k=>val[k]*=1+HIST.r[k][t]); V=keys.reduce((a,k)=>a+val[k],0);
    out.vals.push(Object.assign({}, val)); out.tot.push(V); out.paid.push(paid); out.buy.push(best); out.ret.push(V0>0?V/V0-1:0);
  }
  let pk=0; out.dd=out.tot.map(v=>{ pk=Math.max(pk,v); return pk>0?v/pk-1:0; });
  out.max=Math.max(...out.tot); return out;
}
function vzTmStart(){
  const w=stFrac(ST3.tgt||{}), M=Math.max(50, ST3.M||200);
  VZ.tm={ on:true, done:false, i:0, sim:vzSim(w, M), M }; VZ.drops=[]; VZ.rip=[]; VZ.rain=[]; VZ.leaves=[];
  vzTmBtn(); st3dKick();
}
function vzTmBtn(){ const b=document.getElementById("stTm"); if(b) b.innerHTML=vzTmHtml(); }
document.addEventListener("click",e=>{ const b=e.target.closest('[data-st="tm"]'); if(!b) return; e.stopImmediatePropagation();
  if(VZ.tm && VZ.tm.on){ VZ.tm.on=false; VZ.tm.done=true; vzTmBtn(); return; } vzTmStart(); }, true);
document.addEventListener("change",e=>{ if(e.target.id!=="sViz") return; VZ.drops=[]; VZ.rain=[]; settings.stViz=e.target.value; store.set("settings",settings); VZ.tm=null;
  if(typeof mountForziere==="function") mountForziere(); if(typeof renderPiano==="function") renderPiano(); toast("Grafico: "+(VZ_MODES[settings.stViz]||{n:""}).n); });
(function(){ const s=document.getElementById("sViz"); if(s) s.value=vzMode(); })();

/* numeri piccoli e casualità fissa (gli alberi restano uguali da un fotogramma all'altro) */
function vzRnd(seed){ let s=seed>>>0||1; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }
function vzM0(v){ return Math.round(v).toLocaleString("it-IT")+" €"; }
function vzMonth(ym){ const [y,m]=ym.split("-"); return ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"][+m-1]+" "+y; }

/* stato del mese: pesi da disegnare (obiettivo, o quelli veri del mese durante la macchina del tempo) */
function vzState(dt){
  const tm=VZ.tm, base={ w:ST3.cur, level:0.82, storm:0, month:null };
  if(!tm) return base;
  const S=tm.sim, N=S.tot.length;
  if(tm.on){ tm.i+=dt*14; if(tm.i>=N-1){ tm.i=N-1; tm.on=false; tm.done=true; vzTmBtn(); } }
  const i=Math.min(N-1, Math.floor(tm.i)), v=S.vals[i], tot=S.tot[i]||1, w={};
  ST_KEYS.forEach(k=>w[k]=(v[k]||0)/tot*100);
  if(i!==tm.last){ tm.last=i; tm.newMonth=true; if(S.ret[i]<-0.05) VZ.flash=1; } else tm.newMonth=false;
  const pk=Math.max(...S.tot.slice(0,i+1), S.paid[i]); tm.sc=tm.sc?tm.sc+(pk*1.12-tm.sc)*Math.min(1,dt*3):pk*1.12;
  return { w, level:0.06+0.86*Math.min(1,tot/tm.sc), storm:Math.min(1, Math.max(0, (-S.dd[i]-0.06)/0.25)), month:i, tot, paid:S.paid[i], dd:S.dd[i], buy:S.buy[i], paidLv:0.06+0.86*Math.min(1,S.paid[i]/tm.sc) };
}

/* pioggia, lampi e scritte della macchina del tempo, comuni a vaso e giardino */
function vzWeather(x, W, H, st, dt){
  if(st.storm>0.02){
    x.fillStyle=`rgba(10,0,20,${0.35*st.storm})`; x.fillRect(0,0,W,H);
    while(VZ.rain.length<90*st.storm) VZ.rain.push({ x:Math.random()*W*1.2, y:Math.random()*-H, v:380+Math.random()*200 });
  }
  if(VZ.rain.length){ x.strokeStyle="rgba(150,190,230,.45)"; x.lineWidth=1; x.beginPath();
    VZ.rain.forEach(r=>{ r.y+=r.v*dt; r.x-=r.v*dt*0.25; x.moveTo(r.x,r.y); x.lineTo(r.x+3,r.y-11); }); x.stroke();
    VZ.rain=VZ.rain.filter(r=>r.y<H && (st.storm>0.02 || Math.random()>0.02)); }
  if(VZ.flash>0){ x.fillStyle=`rgba(220,230,255,${0.28*VZ.flash})`; x.fillRect(0,0,W,H); VZ.flash=Math.max(0,VZ.flash-dt*3); }
  if(st.month!=null){ const tm=VZ.tm, S=tm.sim;
    x.fillStyle="rgba(4,7,11,.62)"; x.fillRect(6,8,Math.min(W-12,206),94);
    x.textAlign="left"; x.fillStyle="#D3E9F0"; x.font="700 22px ui-monospace, Consolas, monospace"; x.fillText(HIST.months[st.month].slice(0,4), 12, 28);
    x.fillStyle="#5E7884"; x.font="600 10px ui-monospace, Consolas, monospace"; x.fillText(vzMonth(HIST.months[st.month]).toUpperCase()+` · ${vzM0(tm.M)} AL MESE`, 12, 44);
    x.fillStyle="#00E5FF"; x.font="700 14px ui-monospace, Consolas, monospace"; x.fillText(vzM0(st.tot), 12, 64);
    x.fillStyle="#5E7884"; x.font="600 10px ui-monospace, Consolas, monospace"; x.fillText("VERSATI "+vzM0(st.paid), 12, 78);
    if(st.dd<-0.08){ x.fillStyle="#FF3B5C"; x.font="700 11px ui-monospace, Consolas, monospace"; x.fillText(`⛈ TEMPESTA ${Math.round(st.dd*100)}% DAL MASSIMO`, 12, 96); }
    if(tm.done){ const g=st.tot-st.paid; x.fillStyle=g>=0?"#1DF2B6":"#FF3B5C"; x.font="700 11px ui-monospace, Consolas, monospace"; x.fillText(`OGGI: ${g>=0?"+":"−"}${vzM0(Math.abs(g))} SUI VERSAMENTI`, 12, 96); }
    // barra del tempo in basso
    const f=st.month/(S.tot.length-1); x.fillStyle="rgba(23,50,61,.9)"; x.fillRect(12,H-6,W-24,2); x.fillStyle="#8C7CFF"; x.fillRect(12,H-6,(W-24)*f,2);
  }
}

/* ---------- il vaso ---------- */
function vzVase(x, W, H, t, dt, st){
  const cx=W*0.40, y0=H*0.08, Hv=H*0.86, y1=y0+Hv, Wn=W*0.085, Wb=W*0.25;
  const hw=y=>{ const u=(y-y0)/Hv; if(u<0.08) return Wn*(1+0.25*(0.08-u)/0.08); const s=(u-0.08)/0.92;
    return s<0.42 ? Wn+(Wb-Wn)*Math.sin(Math.PI/2*s/0.42) : Wb*(1-0.16*Math.pow((s-0.42)/0.58,2)); };
  const path=()=>{ x.beginPath(); for(let y=y0;y<=y1-10;y+=3) x.lineTo(cx+hw(y),y); x.quadraticCurveTo(cx+hw(y1-10),y1,cx,y1); x.quadraticCurveTo(cx-hw(y1-10),y1,cx-hw(y1-10),y1-10); for(let y=y1-10;y>=y0;y-=3) x.lineTo(cx-hw(y),y); x.closePath(); };
  // bagliore sotto
  const g=x.createRadialGradient(cx,y1,4,cx,y1,Wb*1.3); g.addColorStop(0,"rgba(0,229,255,.22)"); g.addColorStop(1,"rgba(0,229,255,0)"); x.fillStyle=g; x.beginPath(); x.ellipse(cx,y1,Wb*1.3,14,0,0,Math.PI*2); x.fill();
  const inner=Hv*0.9, lvl=st.level, wTot=VZ_ORDER.reduce((a,k)=>a+(st.w[k]||0),0)||1;
  // strati dal fondo: yTop di ciascuno
  let acc=0; const L=VZ_ORDER.filter(k=>(st.w[k]||0)>0.3).map(k=>{ const a0=acc; acc+=st.w[k]/wTot; return { k, b:y1-a0*lvl*inner, top:y1-acc*lvl*inner }; });
  const amp=k=>(1.2+22*(ST_VOL[k]||.1))*(1+2.5*st.storm), wave=(k,xx,yy,ph)=>yy+amp(k)*Math.sin(xx*0.045+t*(1.4+8*(ST_VOL[k]||.1))+ph)+amp(k)*0.5*Math.sin(xx*0.11-t*1.9+ph*2);
  x.save(); path(); x.clip();
  x.fillStyle="rgba(9,17,26,.65)"; x.fillRect(cx-Wb-4,y0,Wb*2+8,Hv);
  for(let j=L.length-1;j>=0;j--){ const l=L[j], c=ST_COL[l.k], ph=j*1.7;
    const gr=x.createLinearGradient(0,l.top-8,0,l.b); gr.addColorStop(0,st3dShade(c,1.05)); gr.addColorStop(1,st3dShade(c,0.45));
    x.fillStyle=gr; x.beginPath(); x.moveTo(cx-Wb-4,y1+2);
    for(let xx=cx-Wb-4; xx<=cx+Wb+4; xx+=4) x.lineTo(xx, wave(l.k,xx,l.top,ph));
    x.lineTo(cx+Wb+4,y1+2); x.closePath(); x.fill();
    x.strokeStyle="rgba(255,255,255,.35)"; x.lineWidth=1.2; x.beginPath();
    for(let xx=cx-Wb-4; xx<=cx+Wb+4; xx+=4){ const yy=wave(l.k,xx,l.top,ph); xx===cx-Wb-4?x.moveTo(xx,yy):x.lineTo(xx,yy); } x.stroke();
    l.ph=ph; }
  // bollicine nelle azioni
  if(VZ.bub.length<26 && Math.random()<dt*14){ const l=L.filter(z=>ASSETS[z.k].k==="az")[Math.floor(Math.random()*2)]; if(l) VZ.bub.push({ x:cx+(Math.random()-.5)*Wb*1.4, y:l.b-3, top:l.top, r:1+Math.random()*2.2, v:12+Math.random()*22 }); }
  x.fillStyle="rgba(255,255,255,.35)"; VZ.bub.forEach(b=>{ b.y-=b.v*dt; b.x+=Math.sin(t*3+b.y*0.1)*0.3; x.beginPath(); x.arc(b.x,b.y,b.r,0,Math.PI*2); x.fill(); }); VZ.bub=VZ.bub.filter(b=>b.y>b.top);
  // versati: linea tratteggiata (macchina del tempo)
  if(st.paidLv!=null){ const yp=y1-Math.min(1,st.paidLv)*inner; x.setLineDash([4,4]); x.strokeStyle="rgba(211,233,240,.7)"; x.lineWidth=1; x.beginPath(); x.moveTo(cx-Wb,yp); x.lineTo(cx+Wb,yp); x.stroke(); x.setLineDash([]);
    x.fillStyle="rgba(211,233,240,.8)"; x.font="600 9px ui-monospace, Consolas, monospace"; x.textAlign="center"; x.fillText("VERSATI", cx, yp-4); }
  // riflesso del vetro
  const rg=x.createLinearGradient(cx-Wb,0,cx-Wb*0.4,0); rg.addColorStop(0,"rgba(255,255,255,.16)"); rg.addColorStop(1,"rgba(255,255,255,0)"); x.fillStyle=rg; x.fillRect(cx-Wb,y0,Wb*0.6,Hv);
  x.restore();
  path(); x.strokeStyle="rgba(211,233,240,.45)"; x.lineWidth=1.6; x.stroke();
  x.strokeStyle="rgba(211,233,240,.25)"; x.beginPath(); x.ellipse(cx,y0,Wn*1.25,4,0,0,Math.PI*2); x.stroke();
  // gocce: il versamento del mese cade sullo strato più sotto peso
  const surf=L.length?L[L.length-1].top:y1;
  const spawn=k=>VZ.drops.push({ x:cx+(Math.random()-.5)*Wn, y:y0-18, v:40, k });
  if(st.month!=null){ if(VZ.tm.newMonth && VZ.tm.on && st.buy) spawn(st.buy); }
  else if(t>VZ.nextDrop){ VZ.nextDrop=t+1.4; const r=Math.random()*100; let a=0, k=ST_KEYS[0]; for(const kk of ST_KEYS){ a+=st.w[kk]||0; if(r<=a){ k=kk; break; } } spawn(k); }
  VZ.drops.forEach(d=>{ d.v+=520*dt; d.y+=d.v*dt; x.fillStyle=ST_COL[d.k]; x.beginPath(); x.moveTo(d.x,d.y-7); x.quadraticCurveTo(d.x+4,d.y,d.x,d.y+3); x.quadraticCurveTo(d.x-4,d.y,d.x,d.y-7); x.fill();
    if(d.y>=surf){ d.hit=1; VZ.rip.push({ x:d.x, y:surf, r:2, a:1, k:d.k }); } });
  VZ.drops=VZ.drops.filter(d=>!d.hit);
  VZ.rip.forEach(r=>{ r.r+=40*dt; r.a-=dt*1.4; x.strokeStyle=ST_COL[r.k]; x.globalAlpha=Math.max(0,r.a); x.lineWidth=1.2; x.beginPath(); x.ellipse(r.x,r.y,r.r,r.r*0.3,0,0,Math.PI*2); x.stroke(); x.globalAlpha=1; }); VZ.rip=VZ.rip.filter(r=>r.a>0);
  // etichette a destra con la lineetta
  x.font="600 11px ui-monospace, Consolas, monospace"; x.textAlign="left"; let lastY=-1e9;
  const LL=L.slice().reverse(), need=LL.length*28, startMax=y1-need;
  LL.forEach((l,j)=>{ let yy=(l.b+l.top)/2+4; yy=Math.max(yy, lastY+28); if(j===0) yy=Math.min(yy, startMax); lastY=yy; const ex=cx+hw(Math.max(y0+1,Math.min(y1-11,(l.b+l.top)/2))), lx=cx+Wb+18;
    x.strokeStyle=ST_COL[l.k]; x.globalAlpha=.6; x.lineWidth=1; x.beginPath(); x.moveTo(ex-4,(l.b+l.top)/2); x.lineTo(lx-4,yy-4); x.stroke(); x.globalAlpha=1;
    x.fillStyle=ST_COL[l.k]; x.fillText(`${shortName(ASSETS[l.k].t)} ${Math.round((st.w[l.k]||0)/wTot*100)}%`, lx, yy);
    x.fillStyle="#5E7884"; x.font="600 9px ui-monospace, Consolas, monospace"; x.fillText(ST_LAB[l.k].toUpperCase(), lx, yy+12); x.font="600 11px ui-monospace, Consolas, monospace"; });
}

/* ---------- il giardino ---------- */
function vzTree(x, X, Y, len, ang, depth, k, rnd, t, wind, out){
  const sway=Math.sin(t*1.6+depth*0.7+X*0.01)*wind*(0.04+0.05*(7-depth)/7);
  const a=ang+sway, x2=X+Math.cos(a)*len, y2=Y+Math.sin(a)*len;
  x.strokeStyle=depth>3?"#4a3a2c":"#6b5440"; x.lineWidth=Math.max(1,depth*1.25); x.beginPath(); x.moveTo(X,Y); x.lineTo(x2,y2); x.stroke();
  if(depth<=1){ out.push([x2,y2]); return; }
  const n=depth>4?2:2+(rnd()<0.4?1:0);
  for(let i=0;i<n;i++){ const sp=0.3+rnd()*0.3, da=(i-(n-1)/2)*sp*0.95+(rnd()-.5)*0.2+(-Math.PI/2-a)*0.18; vzTree(x, x2, y2, len*(0.68+rnd()*0.12), a+da, depth-1, k, rnd, t, wind, out); }
}
function vzGarden(x, W, H, t, dt, st){
  const gY=H*0.80;
  // cielo e terra
  const sky=x.createLinearGradient(0,0,0,gY); sky.addColorStop(0,"rgba(140,124,255,.10)"); sky.addColorStop(1,"rgba(0,229,255,.04)"); x.fillStyle=sky; x.fillRect(0,0,W,gY);
  // stelle e luna (spariscono nella tempesta)
  const sr=vzRnd(5); x.fillStyle="#D3E9F0"; for(let j=0;j<40;j++){ const a=sr(), b=sr(), tw=0.3+0.7*Math.abs(Math.sin(t*(0.5+sr())+j)); x.globalAlpha=tw*(1-st.storm)*0.7; x.fillRect(a*W, b*gY*0.7, 1.4, 1.4); } x.globalAlpha=1;
  const mx=W*0.86, my=H*0.12, mg=x.createRadialGradient(mx,my,2,mx,my,42); mg.addColorStop(0,`rgba(255,230,180,${0.35*(1-st.storm)})`); mg.addColorStop(1,"rgba(255,230,180,0)"); x.fillStyle=mg; x.beginPath(); x.arc(mx,my,42,0,Math.PI*2); x.fill();
  x.fillStyle=`rgba(255,236,200,${0.85*(1-st.storm)})`; x.beginPath(); x.arc(mx,my,9,0,Math.PI*2); x.fill();
  x.fillStyle="#0b1a17"; x.fillRect(0,gY,W,H-gY);
  const wind=(0.8+0.5*Math.sin(t*0.4))*(1+3*st.storm);
  // erba che si muove col vento
  const gr=vzRnd(9); x.strokeStyle="rgba(29,242,182,.45)"; x.lineWidth=1; x.beginPath();
  for(let j=0;j<90;j++){ const gx=gr()*W, gh=4+gr()*9, bend=Math.sin(t*2+gx*0.05)*wind*2.5; x.moveTo(gx,gY+1); x.quadraticCurveTo(gx+bend*0.4,gY-gh*0.5,gx+bend,gY-gh); } x.stroke();
  x.strokeStyle="rgba(29,242,182,.35)"; x.beginPath(); x.moveTo(0,gY); x.lineTo(W,gY); x.stroke();
  const tot=ST_KEYS.reduce((a,k)=>a+(st.w[k]||0),0)||1, sc=st.month!=null?Math.max(0.25, Math.sqrt(st.tot/VZ.tm.sim.max)):1;
  const keys=["AGGH","SWDA","EIMI","XEON"].filter(k=>(st.w[k]||0)/tot>0.004), slots=keys.length;
  const labels=[];
  keys.forEach((k,i)=>{ const f=(st.w[k]||0)/tot, X=W*(i+0.5)/slots, col=ST_COL[k], vol=ST_VOL[k]||.1, g=Math.sqrt(f)*sc;
    if(k==="XEON"){ // stagno: la liquidità è acqua ferma
      const rw=W/slots*0.42*Math.max(0.35,g*1.6), rh=rw*0.22, py=gY+16;
      const pg=x.createRadialGradient(X,py,2,X,py,rw); pg.addColorStop(0,"rgba(255,176,32,.55)"); pg.addColorStop(1,"rgba(255,176,32,.12)"); x.fillStyle=pg; x.beginPath(); x.ellipse(X,py,rw,rh,0,0,Math.PI*2); x.fill();
      x.strokeStyle="rgba(255,220,150,.5)"; x.lineWidth=1; for(let j=0;j<3;j++){ const ph=((t*0.35+j/3)%1); x.globalAlpha=1-ph; x.beginPath(); x.ellipse(X,py,rw*ph,rh*ph,0,0,Math.PI*2); x.stroke(); } x.globalAlpha=1;
      labels.push([X, gY+rh+34, k, f]); return; }
    if(k==="AGGH"){ // siepe: le obbligazioni, bassa e fitta, quasi non si muove
      const bw=W/slots*0.42*Math.max(0.4,g*1.3), bh=bw*0.55, rnd=vzRnd(77);
      for(let j=0;j<16;j++){ const u=rnd(), v=rnd(), cxx=X+(u-.5)*bw*1.6+Math.sin(t*1.2+j)*wind*vol*12, cyy=gY-bh*0.45-v*bh*0.7, r=bh*(0.35+rnd()*0.3);
        x.fillStyle=st3dShade(col,0.45+0.5*v); x.globalAlpha=.9; x.beginPath(); x.arc(cxx,cyy,r,0,Math.PI*2); x.fill(); } x.globalAlpha=1;
      labels.push([X, gY+30, k, f]); return; }
    // alberi: le azioni; più pesano più sono grandi, più oscillano più le muove il vento
    const len=H*0.165*Math.max(0.35,Math.min(1.25,g*1.25)), depth=Math.max(4,Math.min(7,Math.round(4+g*4))), tips=[];
    const rnd=vzRnd(k==="SWDA"?11:29); vzTree(x, X, gY, len, -Math.PI/2, depth, k, rnd, t, wind*(vol/0.12), tips);
    // chioma: un alone di luce e foglie a grappoli
    if(tips.length){ const ax=tips.reduce((s,p)=>s+p[0],0)/tips.length, ay=tips.reduce((s,p)=>s+p[1],0)/tips.length, R=len*1.6;
      const hg=x.createRadialGradient(ax,ay,2,ax,ay,R); hg.addColorStop(0,col+"40"); hg.addColorStop(1,col+"00"); x.fillStyle=hg; x.beginPath(); x.arc(ax,ay,R,0,Math.PI*2); x.fill(); }
    const lr=vzRnd(k==="SWDA"?3:4), rr=2.4+depth*0.55;
    tips.forEach(([a,b],j)=>{ for(let q=0;q<3;q++){ const ox=(lr()-.5)*rr*2.4, oy=(lr()-.5)*rr*2; x.fillStyle=st3dShade(col, 0.5+lr()*0.6); x.globalAlpha=.8; x.beginPath(); x.arc(a+ox,b+oy,rr*(0.7+lr()*0.5),0,Math.PI*2); x.fill(); } }); x.globalAlpha=1;
    if(st.storm>0.2 && Math.random()<dt*20*st.storm && tips.length){ const p=tips[Math.floor(Math.random()*tips.length)]; VZ.leaves.push({ x:p[0], y:p[1], vx:-30-Math.random()*60, vy:10, k }); }
    labels.push([X, gY+30, k, f]);
  });
  // foglie che volano nella tempesta
  VZ.leaves.forEach(l=>{ l.vy+=60*dt; l.x+=l.vx*dt; l.y+=l.vy*dt; x.fillStyle=ST_COL[l.k]; x.fillRect(l.x,l.y,3,2); }); VZ.leaves=VZ.leaves.filter(l=>l.y<gY && l.x>-5);
  x.textAlign="center";
  labels.forEach(([X,Y,k,f])=>{ x.fillStyle=ST_COL[k]; x.font="600 11px ui-monospace, Consolas, monospace"; x.fillText(`${shortName(ASSETS[k].t)} ${Math.round(f*100)}%`, X, Math.min(H-14,Y)); x.fillStyle="#5E7884"; x.font="600 9px ui-monospace, Consolas, monospace"; x.fillText(ST_LAB[k].toUpperCase(), X, Math.min(H-2,Y+12)); });
}

/* ---------- cornice HUD comune (stile grafica-app): griglia di puntini, scansione, tacche ai bordi,
   oscilloscopio dei rendimenti mensili veri della strategia e telemetria (rendimento, oscillazione, calo, costi) ---------- */
function vzSeries(){ const key=JSON.stringify(ST3.tgt||{}); if(VZ.ser && VZ.ser.key===key) return VZ.ser;
  const w=stFrac(ST3.tgt||{}), N=HIST?HIST.months.length:0, r=[]; for(let t=0;t<N;t++){ let v=0; for(const k in w) v+=w[k]*HIST.r[k][t]; r.push(v); }
  return VZ.ser={ key, r, st:stStats(w), ter:stTer(ST3.tgt||{}) }; }
function vzHudBack(x, W, H, t){
  x.fillStyle="#0E222B"; for(let gy=11; gy<H; gy+=22) for(let gx=11; gx<W; gx+=22) x.fillRect(gx,gy,1.2,1.2);
  const g=x.createRadialGradient(W/2,0,10,W/2,0,W*0.8); g.addColorStop(0,"rgba(0,229,255,.07)"); g.addColorStop(1,"rgba(0,229,255,0)"); x.fillStyle=g; x.fillRect(0,0,W,H);
}
function vzHudFront(x, W, H, Hc, t, st){
  // scansione che scende (7 s), tacche ai bordi
  const sy=(t/7%1)*H, sg=x.createLinearGradient(0,sy-26,0,sy); sg.addColorStop(0,"rgba(0,229,255,0)"); sg.addColorStop(1,"rgba(0,229,255,.10)"); x.fillStyle=sg; x.fillRect(0,sy-26,W,26);
  x.strokeStyle="rgba(94,120,132,.55)"; x.lineWidth=1; x.beginPath();
  for(let y=8; y<H-4; y+=12){ const l=(Math.round(y/12)%4===0)?7:3; x.moveTo(0,y); x.lineTo(l,y); x.moveTo(W,y); x.lineTo(W-l,y); } x.stroke();
  if(typeof HIST==="undefined" || !HIST) return;
  const S=vzSeries(), N=S.r.length, win=Math.min(84,N), y0=H+15, h=18, mid=y0+h/2;
  const end = st.month!=null ? Math.max(win, st.month+1) : win+Math.floor(t*2.5)%(N-win);
  const i0=end-win, X=i=>8+(W-16)*(i-i0)/(win-1), Y=v=>mid-Math.max(-1,Math.min(1,v/0.09))*h/2;
  x.fillStyle="rgba(9,17,26,.9)"; x.fillRect(0,H,W,Hc-H); x.strokeStyle="#17323D"; x.beginPath(); x.moveTo(0,H+0.5); x.lineTo(W,H+0.5); x.stroke();
  x.setLineDash([2,3]); x.strokeStyle="rgba(94,120,132,.5)"; x.beginPath(); x.moveTo(8,mid); x.lineTo(W-8,mid); x.stroke(); x.setLineDash([]);
  x.save(); x.globalCompositeOperation="lighter";
  [[3.5,"rgba(0,229,255,.18)"],[1.2,"#00E5FF"]].forEach(([lw,c])=>{ x.strokeStyle=c; x.lineWidth=lw; x.beginPath(); for(let i=i0;i<end;i++){ const px=X(i), py=Y(S.r[i]); i===i0?x.moveTo(px,py):x.lineTo(px,py); } x.stroke(); });
  for(let i=i0;i<end;i++) if(S.r[i]<-0.05){ x.fillStyle="#FF3B5C"; x.beginPath(); x.arc(X(i),Y(S.r[i]),2,0,Math.PI*2); x.fill(); }
  const lx=X(end-1), ly=Y(S.r[end-1]); x.fillStyle=Math.sin(t*8)>0?"#FFFFFF":"#00E5FF"; x.beginPath(); x.arc(lx,ly,2.4,0,Math.PI*2); x.fill();
  x.restore();
  x.font=VZ_FONT0(8.5); x.textAlign="left"; x.fillStyle="#5E7884"; x.fillText(`▍RENDIMENTI MENSILI · ${HIST.months[i0].slice(0,4)}–${HIST.months[end-1].slice(0,4)}`, 8, H+11);
  const ss=S.st; if(ss){ const tx=`RENDE ${stPct(ss.cagr)}  ·  OSCILLA ${Math.round(ss.vol*100)}%  ·  CALO ${Math.round(ss.mdd*100)}%  ·  COSTI ${nf2.format(S.ter)}%`;
    x.fillStyle="#D3E9F0"; x.fillText(tx, 8, Hc-5); }
  x.textAlign="right"; x.fillStyle=Math.sin(t*4)>0?"#FF3B5C":"#5E7884"; x.fillText("■ STORICO", W-8, H+11);
}
const VZ_FONT0=(s,w)=>`${w||600} ${s}px ui-monospace, Consolas, monospace`;

/* il disegno: torta (com'era) oppure vaso / giardino */
const vzTorta = st3dFrame;
st3dFrame = function(t){
  const m=vzMode(); if(m==="monete"){ ST3.raf=0; return; } if(m==="torta") return vzTorta(t);
  ST3.raf=0; const c=document.getElementById("st3d"); if(!c || !ST3.tgt || document.hidden) return;
  const raw=ST3.last?(t-ST3.last):16, dt=Math.min(0.05,raw/1000); ST3.last=t; const ts=t/1000;
  // qualità che si adatta: se i fotogrammi sono lenti disegno meno filamenti e stelle (VZ.q da 0,25 a 1)
  VZ.q=VZ.q||1; if(raw>45) VZ.q=Math.max(0.25,VZ.q*0.9); else if(raw<24) VZ.q=Math.min(1,VZ.q*1.01);
  if(!ST3.cur) ST3.cur=Object.fromEntries(ST_KEYS.map(k=>[k,0]));
  ST_KEYS.forEach(k=>{ const g=ST3.tgt[k]||0, d=g-ST3.cur[k]; ST3.cur[k]= Math.abs(d)>0.05 ? ST3.cur[k]+d*Math.min(1,dt*5) : g; });
  // sotto il disegno c'è la striscia HUD (oscilloscopio dei rendimenti mensili e telemetria): 36 px in più
  const dpr=window.devicePixelRatio||1, W=c.clientWidth||300, H=Math.round(Math.min(360, W*0.95)), Hc=H+48;
  if(c.width!==Math.round(W*dpr) || c.height!==Math.round(Hc*dpr)){ c.width=Math.round(W*dpr); c.height=Math.round(Hc*dpr); c.style.height=Hc+"px"; }
  const x=c.getContext("2d"); x.setTransform(dpr,0,0,dpr,0,0); x.clearRect(0,0,W,Hc);
  const st=vzState(dt);
  const md=VZ_MODES[m]; vzHudBack(x, W, H, ts); if(m==="vaso") vzVase(x, W, H, ts, dt, st); else if(m==="giardino") vzGarden(x, W, H, ts, dt, st); else if(md.draw){ VZ_LQ=[]; md.draw(x, W, H, ts, dt, st); vzLabelsFlush(x, W, H); }
  if(md.tm) vzWeather(x, W, H, st, dt);
  vzHudFront(x, W, H, Hc, ts, st);
  const still=!!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  if(!still || (VZ.tm && VZ.tm.on)) ST3.raf=requestAnimationFrame(st3dFrame);
};
