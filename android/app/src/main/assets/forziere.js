/* ---------- Portafoglio: il forziere 3D ----------
   Una moneta d'oro per ogni quota che possiedi, una pila per ogni ETF, su un piedistallo che ruota (trascina per girarlo).
   «Oggi / 10 anni / 20 anni»: le monete in più del futuro compaiono trasparenti sopra quelle di oggi.
   Sotto: livello del gruzzolo, mesi di fila, quanto lavorano i tuoi soldi ogni giorno. */
const FZ = { mode: 0, ang: -0.5, drag: null, raf: 0, lastFrame: 0, confetti: [], groups: null, lay: null, S: 0, tIn: 0 };
const FZ_LEVELS = [[0,"Salvadanaio","🐷"],[100,"Barattolo","🫙"],[500,"Borsellino","👛"],[1000,"Cassetta","🧰"],[2500,"Forziere","🧳"],[5000,"Scrigno","💎"],[10000,"Caveau","🏦"],[25000,"Tesoro","👑"],[50000,"Miniera d'oro","⛏️"],[100000,"Banca personale","🏛️"],[250000,"Impero","🌍"]];

function fzRate(){ try{ if(typeof PL!=="undefined" && PL.prof) return profStats(PL.prof).real; }catch(e){} return 0.05; }
function fzColor(i){ const v=getComputedStyle(document.documentElement).getPropertyValue(COLORS[i%COLORS.length]).trim(); return v||"#E0B15E"; }
/* quote di ogni posizione oggi e tra y anni: il Replay compra ogni mese le sue quote; il valore cresce con il rendimento atteso */
function fzStacks(years){
  const r=fzRate(), i=Math.pow(1+r,1/12)-1, n=years*12;
  const L=holdings.map((h,k)=>{ const v=Math.max(0,valueOf(h)), q=Math.max(0,+h.qty||0);
    const it=(replay&&replay.enabled&&replay.items||[]).find(x=>x.ticker===h.ticker), px=prices[h.ticker]&&prices[h.ticker].eur;
    const qm=it?(+it.quote||0):0, m=qm&&px?qm*px:0;
    const fut=years? v*Math.pow(1+r,years) + (i>0? m*((Math.pow(1+i,n)-1)/i) : m*n) : v;
    return { t:h.ticker, name:shortName(h.ticker), v, fut, now:q, coins:q+qm*n, color:fzColor(k) }; });
  return L.filter(s=>s.coins>0);
}
function forziereHtml(){
  const t=totals(), lv=fzLevel(t.val), r=fzRate();
  const day=t.val*r/365, streak=fzStreak();
  const up=t.pl>=0, dl=(typeof deltas==="function")?deltas():{ has:false };
  const ch=(l,v,b)=>`<span class="fz-d ${v>=0?"pos":"neg"}">${l} ${v>=0?"▲":"▼"} ${money(Math.abs(v))}${b>0?` ${v>=0?"+":"−"}${nf2.format(Math.abs(v/b*100))}%`:""}</span>`;
  return `<div class="card fz">
    <div class="fz-top"><div class="fz-val"><small>Investimenti</small><b class="num">${money(t.val)}</b>
        <span class="num ${up?"pos":"neg"}">${up?"▲":"▼"} ${money(Math.abs(t.pl))} ${up?"+":"−"}${nf2.format(Math.abs(t.pct))}% <i>su ${m0(t.cost)} versati</i></span></div>
      <div class="fz-seg" role="tablist">${["Adesso","10 anni","20 anni"].map((l,k)=>`<button data-fz="${k}" class="${FZ.mode===k?"on":""}">${l}</button>`).join("")}</div></div>
    ${dl.has?`<div class="fz-ds">${ch("Oggi",dl.day,t.val-dl.day)}${ch("Settimana",dl.week,t.val-dl.week)}</div>`:""}
    <div class="fz-head" id="fzHead"></div>
    <div class="fz-stage"><canvas id="fzCanvas" aria-label="Le tue monete: una pila per ogni ETF. Tocca una pila per il suo grafico"></canvas><button class="fz-tree ${TREE.on?"on":""}" data-fztree aria-label="${TREE.on?"Nascondi":"Mostra"} l'albero" aria-pressed="${TREE.on}">🌳</button></div>
    <div class="fz-cap" id="fzCap"></div>
    ${fzPosHtml(t)}
    ${lv.next?`<div class="fz-next"><div class="fz-nl"><span>Prossimo livello: <b>${lv.next[2]} ${lv.next[1]}</b></span><span class="num">${m0(t.val)} / ${m0(lv.next[0])}</span></div>
      <div class="fz-bar"><i style="width:${Math.min(100,lv.p*100).toFixed(1)}%"></i></div>
      <small>Ti mancano ${m0(lv.next[0]-t.val)}${fzMonthsTo(lv.next[0]-t.val)}</small></div>`:""}
    <div class="fz-kpi">
      <div><small>lavorano per te</small><b class="num pos">+${money(day)}</b><span>al giorno, anche mentre dormi</span></div>
      <div><small>mesi di fila</small><b class="num">🔥 ${streak}</b><span>${streak>=3?"non mollare la serie":"continua così"}</span></div>
      <div><small>ogni 100 € di oggi</small><b class="num">${m0(100*Math.pow(1+r,20))}</b><span>tra 20 anni</span></div>
    </div></div>`;
}
function fzPosHtml(t){
  const tot=t.val||1, L=holdings.map((h,k)=>({ h, k, v:valueOf(h), pl:valueOf(h)-costOf(h) })).sort((a,b)=>b.v-a.v);
  return `<div class="fzp"><div class="fzp-h"><span>Posizioni</span><button class="add" data-fzadd="1">+ Aggiungi</button></div>
    <div class="fzp-bar">${L.map(x=>`<i style="width:${(x.v/tot*100).toFixed(2)}%;background:${fzColor(x.k)}"></i>`).join("")}</div>
    ${L.map(x=>{ const q=+x.h.qty||0, qs=Math.abs(q-Math.round(q))<0.01?Math.round(q):nf2.format(q), on=typeof PF!=="undefined"&&PF.sel===x.h.ticker;
      return `<div class="fzp-r ${on?"on":""}" data-fzsel="${esc(x.h.ticker)}"><i style="background:${fzColor(x.k)}"></i><div class="fzp-n"><b>${esc(shortName(x.h.ticker))}</b><small>${qs} ${Math.round(q)===1?"quota":"quote"} · ${esc(x.h.name||"")}</small></div>
        <div class="fzp-v"><b class="num">${nf2.format(x.v/tot*100)}%</b><small class="num">${money(x.v)} <span class="${x.pl>=0?"pos":"neg"}">${x.pl>=0?"+":"−"}${money(Math.abs(x.pl))}</span></small></div>
        <button class="fzp-e" data-fzedit="${esc(x.h.id)}" aria-label="Modifica">✎</button></div>`; }).join("")}</div>`;
}
document.addEventListener("click",e=>{
  if(e.target.closest("[data-fzadd]")){ openPos(null); return; }
  const ed=e.target.closest("[data-fzedit]"); if(ed){ openPos(ed.dataset.fzedit); return; }
  const r=e.target.closest("[data-fzsel]"); if(r && typeof PF!=="undefined"){ const t=r.dataset.fzsel; PF.sel=PF.sel===t?null:t; renderPfChart(true); document.querySelectorAll("[data-fzsel]").forEach(x=>x.classList.toggle("on",x.dataset.fzsel===PF.sel)); fzLoop();
    document.getElementById("fzCanvas").scrollIntoView({ behavior:"smooth", block:"center" }); }
});
function fzLevel(v){ let k=0; FZ_LEVELS.forEach((l,i)=>{ if(v>=l[0]) k=i; });
  const cur=FZ_LEVELS[k], next=FZ_LEVELS[k+1]||null; return { cur, next, k, p: next? (v-cur[0])/(next[0]-cur[0]) : 1 }; }
function fzMonthsTo(gap){
  const m=(typeof steadyMonthly==="function" && typeof planCompute==="function") ? (()=>{ try{ return steadyMonthly(planCompute()); }catch(e){ return 0; } })() : 0;
  const rc=(replay&&replay.enabled)?replayCost().total:0, per=Math.max(rc, 0) || m;
  if(!(per>0)) return ""; const n=Math.ceil(gap/per);
  return n<=1 ? ": ci arrivi con il prossimo Replay" : `: con il Replay ci arrivi in circa ${n} mesi`;
}
function fzStreak(){
  // mesi consecutivi (fino a questo) in cui hai investito: Replay attivo da quando usi Gruzzolo, o acquisti segnati nel Piano
  if(typeof B==="undefined" || !B.setup || typeof cycleOf!=="function") return replay&&replay.enabled?1:0;
  const keys=new Set((typeof PL!=="undefined"&&PL.hist||[]).map(h=>h.key)), first=cycleOf(parseYmd(B.setup.slice(0,10))).key;
  let n=0, cy=cycleOf();
  for(let i=0;i<60;i++){ const ok=keys.has(cy.key) || (replay&&replay.enabled&&cy.key>=first); if(!ok) break; n++; cy=cycleOf(addDays(cy.s,-1)); if(cy.key<first && !keys.has(cy.key)) break; }
  return Math.max(n, replay&&replay.enabled?1:0);
}

/* ---------- disegno 3D: una moneta = una quota ---------- */
/* ---------- l'albero-ologramma al centro del piatto ----------
   Un albero 3D proiettato dal piatto come un ologramma: luce ciano additiva, linee di scansione, cono del proiettore,
   anello di scansione che sale, particelle, qualche disturbo. Gira insieme alle monete (stessa proiezione P) e si
   disegna tra le pile dietro e quelle davanti, così le monete davanti lo coprono.
   Crescita: G = (valore / 100.000 €)^0,35 → livelli di rami che compaiono uno dopo l'altro, foglie sulle punte. */
const TREE={ on:(()=>{ try{ return localStorage.getItem("grz_tree")!=="0"; }catch(e){ return true; } })(), segs:null, leaves:null, g:null, cv:null, motes:[], glitch:0 };
const TREE_STAGES=[[0,"Germoglio"],[0.15,"Piantina"],[0.3,"Alberello"],[0.5,"Albero"],[0.75,"Grande albero"],[0.95,"Quercia secolare"]];
function treeGrowth(v){ return Math.max(0.02, Math.min(1, Math.pow(Math.max(0,v)/100000, 0.35))); }
function treeBuild(){
  let seed=11; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
  const segs=[], leaves=[], LV=5;
  const branch=(a, dir, len, w, lv)=>{
    // ogni ramo è fatto di 2 pezzi leggermente curvi: più naturale
    const bend=[(rnd()-.5)*0.25,(rnd()-.5)*0.1,(rnd()-.5)*0.25];
    const mid=[a[0]+dir[0]*len*0.5+bend[0]*len*0.3, a[1]+dir[1]*len*0.5, a[2]+dir[2]*len*0.5+bend[2]*len*0.3];
    const b=[a[0]+dir[0]*len+bend[0]*len*0.2, a[1]+dir[1]*len+bend[1]*len*0.2, a[2]+dir[2]*len+bend[2]*len*0.2];
    segs.push({ a, b:mid, w, lv, half:0 }, { a:mid, b, w:w*0.85, lv, half:1 });
    if(lv>=3){ const nL=lv>=5?4:3; for(let k=0;k<nL;k++){ const r=0.035+rnd()*0.05, th=rnd()*Math.PI*2, ph=rnd()*Math.PI;
      leaves.push({ p:[b[0]+Math.cos(th)*Math.sin(ph)*r, b[1]+Math.cos(ph)*r*0.7+0.01, b[2]+Math.sin(th)*Math.sin(ph)*r], lv, s:0.018+rnd()*0.018, o:rnd()*Math.PI*2, tw:rnd()*6 }); } }
    if(lv>=LV) return;
    const n=lv===0?3:lv<3?(rnd()<0.5?3:2):2+(rnd()<0.1?1:0), base=rnd()*Math.PI*2;
    for(let k=0;k<n;k++){ const az=base+k*(Math.PI*2/n)+(rnd()-.5)*0.7, tilt=(lv===0?0.6:0.42)+rnd()*0.38;
      const up=Math.cos(tilt), out=Math.sin(tilt), d=[dir[0]*up+Math.cos(az)*out, dir[1]*up+out*0.22, dir[2]*up+Math.sin(az)*out], m=Math.hypot(...d);
      branch(b, d.map(x=>x/m), len*(0.66+rnd()*0.1), w*0.64, lv+1); } };
  branch([0,0,0],[0,1,0],0.5,0.075,0);
  TREE.segs=segs; TREE.leaves=leaves; TREE.LV=LV;
}
/* l'albero è un solo elemento nella lista di disegno, con la profondità del suo centro */
function treeParts3D(P, S, cp, cy, L, ts){
  if(!TREE.segs) treeBuild();
  const v=FZ.groups.reduce((a,gr)=>a+(FZ.mode?gr.fut:gr.v),0), g=treeGrowth(v);
  TREE.g = TREE.g==null ? g : TREE.g+(g-TREE.g)*0.06;                   // cresce piano quando il valore cambia
  const n=FZ.groups.length, ox=n<=1?(FZ.lay.sceneR+0.15):0;              // con un solo ETF la pila è al centro: l'albero va di lato
  return [{ tree:1, P, S, cp, cy, L, ts, ox, v, d:P(ox,0,0).d }];
}
function treeDraw(g, T){
  const c=g.canvas, dpr=c.width/Math.max(1,c.clientWidth), W=c.clientWidth, H=c.clientHeight, P=T.P, S=T.S, cp=T.cp, cy=T.cy, L=T.L, ox=T.ox, G=TREE.g, t=T.ts/1000;
  // disegno direttamente sul canvas delle monete, in luce additiva (niente canvas di appoggio: più leggero per la scheda grafica)
  if(TREE.glitch<=0 && Math.random()<0.004) TREE.glitch=0.14; TREE.glitch-=0.033;
  const gx=TREE.glitch>0?(Math.random()-.5)*7:0, h=g;
  h.save(); h.globalCompositeOperation="lighter"; h.lineCap="round"; h.lineJoin="round"; h.globalAlpha=1; h.translate(gx,0);
  const flick=0.86+Math.sin(t*23)*0.05+Math.sin(t*7.3)*0.05;
  // scala: anche il germoglio supera le pile; l'albero intero arriva vicino al bordo alto
  const hMax=Math.max(0.6,(cy-30)/(S*cp)), full=hMax/1.62, kMin=Math.min(full*0.75, Math.max(0.6,(L.maxH*1.3+0.3)/0.62)), k=kMin+(full-kMin)*Math.pow(G,1.2);
  const LV=TREE.LV, grow=lv=>Math.max(0,Math.min(1, G*(LV+1.6)-lv)), sway=Math.sin(t*0.7)*0.02;
  const pt=q=>{ const y=q[1]*k; return P(ox+q[0]*k+sway*y*y, y, q[2]*k); };
  const C1="99,245,255", C2="140,255,214"; h.globalAlpha=flick;                              // ciano (rami) e acqua (foglie)
  let topY=cy, minX=W, maxX=0;
  // cono di luce del proiettore e piattello luminoso
  const base=P(ox,0,0), rB=0.32*k*S, topP=P(ox,1.15*k,0);
  const cone=h.createLinearGradient(0,base.Y,0,topP.Y); cone.addColorStop(0,"rgba("+C1+",.16)"); cone.addColorStop(1,"rgba("+C1+",0)");
  h.fillStyle=cone; h.beginPath(); h.moveTo(base.X-rB,base.Y); h.lineTo(topP.X-rB*2.2,topP.Y); h.lineTo(topP.X+rB*2.2,topP.Y); h.lineTo(base.X+rB,base.Y); h.closePath(); h.fill();
  for(let i=0;i<3;i++){ h.strokeStyle="rgba("+C1+","+(0.55-i*0.15)+")"; h.lineWidth=1.2; h.beginPath(); h.ellipse(base.X,base.Y,rB*(1+i*0.35),rB*(1+i*0.35)*0.42,0,0,Math.PI*2); h.stroke(); }
  h.fillStyle="rgba("+C1+",.35)"; h.beginPath(); h.ellipse(base.X,base.Y,rB*0.7,rB*0.28,0,0,Math.PI*2); h.fill();
  // rami: ogni ramo cresce in due metà; per livello prima un alone largo e tenue poi un filo chiaro
  const byLv=[];
  TREE.segs.forEach(sg=>{ const f=grow(sg.lv); if(f<=0) return;
    const ff=sg.half?Math.max(0,Math.min(1,f*2-1)):Math.min(1,f*2); if(ff<=0) return;
    const A=pt(sg.a), B=pt([sg.a[0]+(sg.b[0]-sg.a[0])*ff, sg.a[1]+(sg.b[1]-sg.a[1])*ff, sg.a[2]+(sg.b[2]-sg.a[2])*ff]);
    (byLv[sg.lv]=byLv[sg.lv]||[]).push([A,B,sg.w]); topY=Math.min(topY,B.Y); minX=Math.min(minX,B.X); maxX=Math.max(maxX,B.X); });
  byLv.forEach((L2,lv)=>{ if(!L2) return; const w=Math.max(0.8, L2[0][2]*k*S);
    [[w*3.2,0.07],[w*1.6,0.16],[Math.max(0.7,w*(lv<=1?0.32:0.55)),lv<=1?0.6:0.85]].forEach((ps,pass)=>{ h.lineWidth=ps[0]; h.strokeStyle=pass===2?"rgba(200,255,255,"+ps[1]+")":"rgba("+C1+","+ps[1]+")"; h.beginPath();
      L2.forEach(x=>{ h.moveTo(x[0].X,x[0].Y); h.lineTo(x[1].X,x[1].Y); }); h.stroke(); });
    // anelli sul tronco e sui rami grossi: effetto wireframe 3D
    if(lv<=1){ h.lineWidth=0.8; h.strokeStyle="rgba("+C1+",.45)"; h.beginPath();
      L2.forEach(x=>{ const A=x[0], B=x[1], r=x[2]*k*S*0.9; for(let q=0.2;q<1;q+=0.3){ const X=A.X+(B.X-A.X)*q, Y=A.Y+(B.Y-A.Y)*q; h.moveTo(X+r,Y); h.ellipse(X,Y,r,r*0.38,0,0,Math.PI*2); } }); h.stroke(); } });
  // foglie: rombi luminosi che brillano, quelle davanti più chiare; sulle punte ancora senza figli metto foglie giovani
  const fl=[], front=[], back=[];
  TREE.leaves.forEach(l=>{ const f=grow(l.lv+0.7); if(f>0) fl.push([l, Math.min(1,f)]); });
  TREE.segs.forEach((sg,i)=>{ if(!sg.half || sg.lv>=3) return; const gn=grow(sg.lv+1); if(grow(sg.lv)<0.9 || gn>0.9) return;
    for(let q=0;q<6;q++){ const th=q*1.05+i, r=0.03+0.03*(q%3); fl.push([{ p:[sg.b[0]+Math.cos(th)*r, sg.b[1]+0.015+q*0.01, sg.b[2]+Math.sin(th)*r], s:0.03, o:th, tw:i+q }, 1-gn]); } });
  fl.forEach(x=>{ const Q=pt(x[0].p); (Q.d>=0?front:back).push([Q,x[0],x[1]]); topY=Math.min(topY,Q.Y); minX=Math.min(minX,Q.X); maxX=Math.max(maxX,Q.X); });
  [[back,0.35],[front,0.75]].forEach(pa=>{ const arr=pa[0], al=pa[1];
    h.fillStyle="rgba("+C2+","+(al*0.45)+")"; h.strokeStyle="rgba("+C2+","+al+")"; h.lineWidth=0.7; h.beginPath();
    arr.forEach(x=>{ const Q=x[0], l=x[1], s=Math.max(1.4,l.s*k*S*x[2]), a=l.o+t*0.3, dx=Math.cos(a)*s, dy=Math.sin(a)*s*0.5;
      h.moveTo(Q.X-dx,Q.Y-dy); h.lineTo(Q.X-dy*0.6,Q.Y+dx*0.35); h.lineTo(Q.X+dx,Q.Y+dy); h.lineTo(Q.X+dy*0.6,Q.Y-dx*0.35); h.closePath(); });
    h.fill(); h.stroke();
    h.fillStyle="rgba(235,255,255,.9)"; arr.forEach(x=>{ if(Math.sin(t*2.2+x[1].tw*3)>0.93) h.fillRect(x[0].X-1,x[0].Y-1,2,2); }); });
  // germoglio: due foglioline disegnate a filo, con le nervature, finché la chioma non c'è
  if(G<0.32){ const Tp=pt([0,0.5*grow(0),0]), a=1-Math.max(0,(G-0.2)/0.12), s=Math.max(12,0.22*k*S);
    h.globalAlpha=a*flick; [-1,1].forEach(sd=>{ h.save(); h.translate(Tp.X,Tp.Y); h.rotate(sd<0?Math.PI+0.45:-0.45);
      h.fillStyle="rgba("+C2+",.22)"; h.strokeStyle="rgba("+C2+",.95)"; h.lineWidth=1.2; h.beginPath(); h.moveTo(0,0); h.quadraticCurveTo(s*0.5,-s*0.38,s,0); h.quadraticCurveTo(s*0.5,s*0.38,0,0); h.fill(); h.stroke();
      h.lineWidth=0.7; h.beginPath(); h.moveTo(0,0); h.lineTo(s*0.92,0); for(let q=1;q<4;q++){ h.moveTo(s*q/4,0); h.lineTo(s*q/4+s*0.12,-s*0.12); h.moveTo(s*q/4,0); h.lineTo(s*q/4+s*0.12,s*0.12); } h.stroke(); h.restore(); });
    h.globalAlpha=flick; topY=Math.min(topY,Tp.Y-s*0.5); minX=Math.min(minX,Tp.X-s); maxX=Math.max(maxX,Tp.X+s); }
  // anello di scansione che sale lungo l'albero
  const sy=base.Y-((t*0.28)%1)*(base.Y-topY), sr=Math.max(rB,(maxX-minX)/2*0.9);
  h.strokeStyle="rgba("+C1+",.5)"; h.lineWidth=1.2; h.beginPath(); h.ellipse(maxX>minX?(minX+maxX)/2:base.X,sy,sr,sr*0.22,0,0,Math.PI*2); h.stroke();
  // particelle che salgono dal proiettore
  if(TREE.motes.length<26) TREE.motes.push({ x:(Math.random()-.5)*0.5, z:(Math.random()-.5)*0.5, y:0, v:0.12+Math.random()*0.2 });
  h.fillStyle="rgba("+C1+",.8)"; TREE.motes.forEach(m=>{ m.y+=m.v*0.03; const q=pt([m.x*(1+m.y),m.y,m.z*(1+m.y)]); h.globalAlpha=flick*Math.max(0,1-m.y/1.2); h.fillRect(q.X-0.8,q.Y-0.8,1.6,1.6); });
  TREE.motes=TREE.motes.filter(m=>m.y<1.2); h.globalAlpha=flick;
  // etichetta HUD: fase e percentuale di crescita
  const st=TREE_STAGES.filter(x=>G>=x[0]).pop()[1], lab="◈ "+st.toUpperCase()+" · "+Math.round(G*100)+"%";
  h.font="600 9.5px ui-monospace, Menlo, monospace"; h.textAlign="left"; const tw=h.measureText(lab).width, ly=Math.max(30,topY+8), tx=Math.max(4,Math.min(maxX+16, W-tw-64));
  h.strokeStyle="rgba("+C1+",.6)"; h.lineWidth=0.8; h.beginPath(); h.moveTo(maxX-2,topY+20); h.lineTo(tx-4,ly+4); h.lineTo(tx+tw,ly+4); h.stroke();
  h.fillStyle="rgba("+C1+",.95)"; h.fillText(lab, tx, ly);
  // linee di scansione: righe scure sottili, solo dentro il cono del proiettore, che scorrono piano
  h.globalCompositeOperation="source-over"; h.globalAlpha=1; h.beginPath(); const cw=Math.max(rB*2.4,(maxX-minX)/2+12), cxm=maxX>minX?(minX+maxX)/2:base.X;
  h.moveTo(base.X-rB,base.Y); h.lineTo(cxm-cw,topY-14); h.lineTo(cxm+cw,topY-14); h.lineTo(base.X+rB,base.Y); h.closePath(); h.clip();
  h.fillStyle="rgba(8,22,26,.28)"; const off=(t*12)%3; for(let y=topY-14+off; y<base.Y; y+=3) h.fillRect(cxm-cw,y,cw*2,1);
  g.restore();
}
document.addEventListener("click",e=>{ const b=e.target.closest("[data-fztree]"); if(!b) return; TREE.on=!TREE.on; try{ localStorage.setItem("grz_tree",TREE.on?"1":"0"); }catch(_){}
  b.classList.toggle("on",TREE.on); b.setAttribute("aria-pressed",TREE.on); b.setAttribute("aria-label",(TREE.on?"Nascondi":"Mostra")+" l'albero"); toast(TREE.on?"🌳 L'albero cresce con il tuo portafoglio":"Albero nascosto"); fzLoop(); });

const FZ_TOWER = 25;          // monete per torre: oltre, la pila si divide in più torri vicine
const FZ_CH = 0.062, FZ_R = 0.36;
/* gruppi (uno per ETF) su un cerchio; dentro ogni gruppo le torri sono in una piccola griglia */
function fzLayout(groups){
  const n=groups.length;
  groups.forEach(gr=>{ const coins=Math.max(gr.coins, gr.now>0?1:0), T=Math.max(1,Math.ceil(coins/FZ_TOWER)), cols=Math.ceil(Math.sqrt(T)), d=FZ_R*2.15;
    gr.towers=[]; for(let t=0;t<T;t++){ const r=Math.floor(t/cols), c=t%cols; gr.towers.push({ dx:(c-(cols-1)/2)*d, dz:(r-(Math.ceil(T/cols)-1)/2)*d }); }
    gr.rad=Math.hypot((cols-1)/2*d, (Math.ceil(T/cols)-1)/2*d)+FZ_R; });
  const maxRad=Math.max(...groups.map(g=>g.rad)), R=n<=1?0:Math.max(0.95, maxRad*(n===2?1.15:1.35));
  groups.forEach((gr,k)=>{ const a=k/n*Math.PI*2-Math.PI/2; gr.x=n<=1?0:Math.cos(a)*R; gr.z=n<=1?0:Math.sin(a)*R; });
  return { R, sceneR:R+maxRad, maxH:Math.min(FZ_TOWER, Math.max(1,...groups.map(g=>g.coins)))*FZ_CH };
}
function renderForziere(){
  const c=document.getElementById("fzCanvas"); if(!c) return;
  const years=FZ.mode===1?10:FZ.mode===2?20:0, G=fzStacks(years);
  const prev=FZ.groups||[];
  G.forEach(g=>{ const p=prev.find(x=>x.name===g.name); g.prevCoins = p ? Math.min(p.coins, g.coins) : 0; });
  FZ.groups=G; FZ.lay=fzLayout(G); FZ.tIn=performance.now();
  const cap=document.getElementById("fzCap"); if(cap){
    const tot=G.reduce((a,s)=>a+s.fut,0), tNow=G.reduce((a,s)=>a+s.v,0), coins=G.reduce((a,s)=>a+s.coins,0);
    cap.innerHTML = years ? `Tra ${years} anni, con il Replay che continua: <b class="num">${coins} quote</b> per <b class="num">${m0(tot)}</b> <span class="pos">(+${m0(tot-tNow)})</span> · euro di oggi`
      : `1 moneta = 1 quota · <b class="num">${coins}</b> in tutto · trascina per girare`;
  }
  fzLoop();
}
function fzLoop(){ if(FZ.raf) return; const step=ts=>{ FZ.raf=0; if(!fzDraw(ts)) return; FZ.raf=requestAnimationFrame(step); }; FZ.raf=requestAnimationFrame(step); }
function fzDraw(ts){
  const c=document.getElementById("fzCanvas"); if(!c || !c.isConnected || document.hidden || !FZ.groups) return false;
  const page=c.closest(".page"); if(page && !page.classList.contains("active")) return false;
  if(FZ.visible===false) return false;                                  // fuori dallo schermo: niente lavoro
  if(FZ.lastFrame && ts-FZ.lastFrame<30) return true;                   // al massimo ~30 immagini al secondo
  const dpr=Math.min(2,window.devicePixelRatio||1), W=c.clientWidth, H=c.clientHeight; if(!W) return true;
  if(c.width!==Math.round(W*dpr)){ c.width=Math.round(W*dpr); c.height=Math.round(H*dpr); }
  const g=c.getContext("2d"); g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,W,H);
  const dt=FZ.lastFrame?Math.min(0.05,(ts-FZ.lastFrame)/1000):0; FZ.lastFrame=ts;
  if(!FZ.drag && !(typeof PF!=="undefined" && PF.sel)) FZ.ang+=dt*0.2;   // con una pila scelta sta ferma
  const phi=0.45, sp=Math.sin(phi), cp=Math.cos(phi), L=FZ.lay;
  // zoom automatico: la scena intera (larghezza e altezza) deve stare nel riquadro
  const Sfit=Math.min((W*0.80)/(2*L.sceneR), (H*0.40)/(L.maxH*cp + 2*L.sceneR*sp + 0.35), 150);
  FZ.S = FZ.S ? FZ.S+(Sfit-FZ.S)*Math.min(1,dt*4) : Sfit; const S=FZ.S;
  const cx=W/2, cy=H*0.74;
  const P=(x,y,z)=>{ const xr=x*Math.cos(FZ.ang)-z*Math.sin(FZ.ang), zr=x*Math.sin(FZ.ang)+z*Math.cos(FZ.ang); return { X:cx+xr*S, Y:cy-y*S*cp+zr*S*sp, d:zr }; };
  // grafico dietro le monete: la sua base è il piano su cui stanno le monete
  fzChart(g, W, H, cy);
  // piedistallo
  const pr=L.sceneR+0.25;
  g.save(); g.translate(cx,cy);
  const grd=g.createRadialGradient(0,0,4,0,0,pr*S*1.3); grd.addColorStop(0,"rgba(224,177,94,.22)"); grd.addColorStop(1,"rgba(224,177,94,0)");
  g.fillStyle=grd; g.beginPath(); g.ellipse(0,0,pr*S*1.3,pr*S*sp*1.3,0,0,Math.PI*2); g.fill();
  g.fillStyle="rgba(20,30,32,.75)"; g.fillRect(-pr*S,0,pr*S*2,8); g.beginPath(); g.ellipse(0,8,pr*S,pr*S*sp,0,0,Math.PI); g.fill();
  g.fillStyle="rgba(29,42,44,.55)"; g.beginPath(); g.ellipse(0,0,pr*S,pr*S*sp,0,0,Math.PI*2); g.fill();
  g.strokeStyle="rgba(224,177,94,.55)"; g.lineWidth=1.2; g.stroke();
  g.restore();
  // tutte le torri, dalla più lontana
  const towers=[]; FZ.groups.forEach((gr,gi)=>gr.towers.forEach((t,ti)=>{ const x=gr.x+t.dx, z=gr.z+t.dz; towers.push({ gr, gi, ti, x, z, d:P(x,0,z).d }); }));
  const treeParts=TREE.on?treeParts3D(P, S, cp, cy, L, ts):[];
  const items=towers.concat(treeParts); items.sort((a,b)=>a.d-b.d);
  const since=(ts-FZ.tIn)/1000, ease=x=>1-Math.pow(1-x,3);
  const rx=FZ_R*S, ry=FZ_R*S*sp, hh=FZ_CH*S*cp;
  FZ.hits=[];
  items.forEach(T=>{ if(T.tree){ treeDraw(g, T); return; }
    const gr=T.gr, start=T.ti*FZ_TOWER, n=Math.max(0,Math.min(FZ_TOWER, Math.ceil(gr.coins-start)));
    const base=P(T.x,0,T.z), dim=(typeof PF!=="undefined" && PF.sel && PF.sel!==gr.t) ? 0.3 : 1;
    FZ.hits.push({ t:gr.t, x0:base.X-rx-8, x1:base.X+rx+8, y0:base.Y-n*hh-ry-30, y1:base.Y+ry+8 });
    const lg=g.createLinearGradient(base.X-rx,0,base.X+rx,0);
    lg.addColorStop(0,"#6e511e"); lg.addColorStop(0.32,"#d4a24a"); lg.addColorStop(0.52,"#f7da93"); lg.addColorStop(1,"#83601f");
    let topY=null;
    for(let j=0;j<n;j++){
      const idx=start+j, ghost=idx>=Math.ceil(gr.now-0.001), part=(idx===Math.floor(gr.coins) && gr.coins%1>0.001);
      let y=j*FZ_CH;
      if(idx>=gr.prevCoins){ const k=(since-(idx-gr.prevCoins)*Math.min(0.03, 1.6/Math.max(1,gr.coins-gr.prevCoins))-gr.gi*0.1)/0.4; if(k<=0) continue; if(k<1) y+=(1-ease(k))*1.8; }
      const p=P(T.x,y,T.z);
      g.globalAlpha = (ghost ? 0.32 : part ? 0.6 : 1)*dim;
      g.fillStyle=lg; g.beginPath(); g.moveTo(p.X-rx,p.Y); g.lineTo(p.X-rx,p.Y-hh); g.ellipse(p.X,p.Y-hh,rx,ry,0,Math.PI,0,true); g.lineTo(p.X+rx,p.Y); g.ellipse(p.X,p.Y,rx,ry,0,0,Math.PI); g.fill();
      g.strokeStyle=gr.color; g.globalAlpha*=0.8; g.lineWidth=1.2; g.beginPath(); g.ellipse(p.X,p.Y-hh*0.5,rx,ry,0,0.15,Math.PI-0.15); g.stroke();
      topY=p;
      if(j===n-1){ g.globalAlpha = (ghost?0.32:1)*dim;
        const tg=g.createRadialGradient(p.X-rx*0.3,p.Y-hh-ry*0.4,1,p.X,p.Y-hh,rx); tg.addColorStop(0,"#fff3cc"); tg.addColorStop(0.5,"#e8bd62"); tg.addColorStop(1,"#a77a2c");
        g.fillStyle=tg; g.beginPath(); g.ellipse(p.X,p.Y-hh,rx,ry,0,0,Math.PI*2); g.fill(); g.strokeStyle="rgba(120,85,30,.6)"; g.lineWidth=0.8; g.stroke();
        if(rx>9){ g.beginPath(); g.ellipse(p.X,p.Y-hh,rx*0.68,ry*0.68,0,0,Math.PI*2); g.stroke();
          g.fillStyle="rgba(110,78,25,.8)"; g.font=`700 ${Math.max(8,rx*0.6)}px Georgia, serif`; g.textAlign="center"; g.textBaseline="middle";
          g.save(); g.translate(p.X,p.Y-hh); g.scale(1,sp); g.fillText("€",0,1); g.restore(); g.textBaseline="alphabetic"; } }
    }
    g.globalAlpha=1;
    T.top = topY;
  });
  // etichette: sopra la torre più alta di ogni ETF
  FZ.groups.forEach(gr=>{ const h=Math.min(FZ_TOWER, Math.max(1,Math.ceil(gr.coins)))*FZ_CH+0.2, p=P(gr.x,h,gr.z);
    g.globalAlpha=(typeof PF!=="undefined" && PF.sel && PF.sel!==gr.t) ? 0.4 : 1;
    const q=gr.coins, qs=(Math.abs(q-Math.round(q))<0.01?Math.round(q):q.toFixed(2).replace(".",","));
    g.textAlign="center"; g.font="700 12px Inter, system-ui, sans-serif"; g.fillStyle="#f1ead9"; g.fillText(`${gr.name} · ${qs} ${Math.round(q)===1?"quota":"quote"}`, p.X, p.Y-14);
    g.font="500 11px Inter, system-ui, sans-serif"; g.fillStyle="rgba(241,234,217,.72)"; g.fillText(m0(FZ.mode?gr.fut:gr.v), p.X, p.Y-1); g.globalAlpha=1; });
  // coriandoli d'oro quando sali di livello
  FZ.confetti=FZ.confetti.filter(p=>p.life>0);
  FZ.confetti.forEach(p=>{ p.vy+=dt*260; p.x+=p.vx*dt; p.y+=p.vy*dt; p.r+=p.vr*dt; p.life-=dt;
    g.save(); g.translate(p.x,p.y); g.rotate(p.r); g.fillStyle=p.c; g.globalAlpha=Math.max(0,Math.min(1,p.life)); g.fillRect(-4,-2,8,4); g.restore(); });
  return true;
}

function fzChart(g, W, H, base){
  FZ.chart=false;
  if(typeof PF==="undefined" || !PF.data || PF.data.length<2) return;
  const S=PF.data, v=S.map(p=>p.v), mn=Math.min(...v), mx=Math.max(...v), pad=(mx-mn)*0.12||mx*0.01||1, lo=mn-pad, hi=mx+pad;
  const L0=6, R0=W-50, T0=16, B0=base-4;
  const X=i=>L0+i/(S.length-1)*(R0-L0), Y=x=>B0-(B0-T0)*(x-lo)/(hi-lo);
  const h=PF.sel?holdings.find(x=>x.ticker===PF.sel):null, up=v[v.length-1]>=v[0];
  const col=h?fzColor(holdings.indexOf(h)):(up?"#6FCF97":"#E8786A");
  // linee guida e prezzi a destra
  g.save(); g.font="500 10.5px Inter, system-ui, sans-serif"; g.textAlign="left"; g.textBaseline="middle";
  [hi-pad, (hi+lo)/2, lo+pad].forEach(val=>{ const y=Y(val); g.strokeStyle="rgba(241,234,217,.10)"; g.setLineDash([3,4]); g.beginPath(); g.moveTo(L0,y); g.lineTo(R0,y); g.stroke();
    g.setLineDash([]); g.fillStyle="rgba(241,234,217,.62)"; g.fillText(fzEur(val), R0+5, y); });
  // area e linea
  const grd=g.createLinearGradient(0,T0,0,B0); grd.addColorStop(0,col+"55"); grd.addColorStop(1,col+"00");
  g.beginPath(); g.moveTo(X(0),B0); S.forEach((p,i)=>g.lineTo(X(i),Y(p.v))); g.lineTo(X(S.length-1),B0); g.closePath(); g.fillStyle=grd; g.fill();
  g.beginPath(); S.forEach((p,i)=>i?g.lineTo(X(i),Y(p.v)):g.moveTo(X(i),Y(p.v))); g.strokeStyle=col; g.lineWidth=2; g.globalAlpha=.95; g.stroke(); g.globalAlpha=1;
  g.beginPath(); g.arc(X(S.length-1),Y(v[v.length-1]),3.5,0,Math.PI*2); g.fillStyle=col; g.fill();
  // base e date (inizio, metà, oggi)
  g.strokeStyle="rgba(241,234,217,.22)"; g.beginPath(); g.moveTo(L0,B0); g.lineTo(R0,B0); g.stroke();
  const dt=i=>new Date(S[i].t*1000).toLocaleDateString("it-IT",{ day:"numeric", month:"short" });
  g.fillStyle="rgba(241,234,217,.62)"; g.textBaseline="top";
  g.textAlign="left"; g.fillText(dt(0), L0, B0+3); g.textAlign="right"; g.fillText("oggi", R0, B0+3);
  g.textAlign="center"; g.textBaseline="bottom"; g.fillText(dt(Math.floor((S.length-1)/2)), X(Math.floor((S.length-1)/2)), T0-2);
  g.restore(); FZ.chart=true;
}
function fzEur(x){ return x>=1000 ? Math.round(x).toLocaleString("it-IT")+" €" : x>=100 ? Math.round(x)+" €" : nf2.format(x)+" €"; }
function fzCelebrate(){
  const c=document.getElementById("fzCanvas"); if(!c) return; const W=c.clientWidth;
  for(let k=0;k<90;k++) FZ.confetti.push({ x:W/2+(Math.random()-0.5)*60, y:40, vx:(Math.random()-0.5)*320, vy:-(140+Math.random()*220), r:Math.random()*6, vr:(Math.random()-0.5)*12, life:1.6+Math.random()*0.8,
    c:["#E0B15E","#f6d58a","#6FCF97","#ffffff"][k%4] });
  fzLoop();
}
function fzCheckLevel(){
  const lv=fzLevel(totals().val), seen=store.get("fzLevel",-1);
  if(seen>=0 && lv.k>seen){ setTimeout(()=>{ fzCelebrate(); toast(`${lv.cur[2]} Nuovo livello: ${lv.cur[1]}!`); }, 900); }
  if(lv.k!==seen) store.set("fzLevel", lv.k);
}
function mountForziere(){
  const host=document.getElementById("fzHost"); if(!host) return;
  if(!holdings.length || !(totals().val>0)){ host.innerHTML=""; return; }
  host.innerHTML=forziereHtml(); renderForziere(); fzCheckLevel();
  if(typeof pfPaint==="function"){ pfPaint(); renderPfChart(false); }
  try{ if(FZ.io) FZ.io.disconnect(); FZ.io=new IntersectionObserver(es=>{ FZ.visible=es[0].isIntersecting; if(FZ.visible){ FZ.lastFrame=0; fzLoop(); } }); FZ.io.observe(document.getElementById("fzCanvas")); }catch(e){}
}
document.addEventListener("click",e=>{ const b=e.target.closest("[data-fz]"); if(!b) return; FZ.mode=+b.dataset.fz;
  document.querySelectorAll("[data-fz]").forEach(x=>x.classList.toggle("on",x===b)); renderForziere(); });
// trascina per girare
document.addEventListener("pointerdown",e=>{ if(e.target.id!=="fzCanvas") return; FZ.drag={ x:e.clientX, y:e.clientY, a:FZ.ang, t:performance.now() }; e.target.setPointerCapture(e.pointerId); });
document.addEventListener("pointermove",e=>{ if(!FZ.drag) return; FZ.ang=FZ.drag.a+(e.clientX-FZ.drag.x)*0.012; });
document.addEventListener("pointerup",e=>{ const d=FZ.drag; FZ.drag=null; if(!d) return;
  if(Math.hypot(e.clientX-d.x,e.clientY-d.y)<8 && performance.now()-d.t<600){ FZ.ang=d.a; fzTap(e.clientX,e.clientY); } });
/* tocco su una pila: grafico di quell'ETF (di nuovo, o fuori dalle pile: tutto il portafoglio) */
function fzTap(x,y){
  const c=document.getElementById("fzCanvas"); if(!c || typeof PF==="undefined") return; const r=c.getBoundingClientRect(), px=x-r.left, py=y-r.top;
  const hit=(FZ.hits||[]).filter(h=>px>=h.x0&&px<=h.x1&&py>=h.y0&&py<=h.y1).sort((a,b)=>b.y1-a.y1)[0];
  const t=hit?hit.t:null; PF.sel = (t && PF.sel!==t) ? t : null; renderPfChart(true); fzLoop();
}
document.addEventListener("pointercancel",()=>{ FZ.drag=null; });
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) fzLoop(); });


/* ---------- soldi da investire (salvadanaio) e Replay che aggiunge monete ----------
   PL.pot: soldi messi da parte e non ancora investiti. A fine mese propongo di aggiungerci i risparmi del mese
   (oltre al Replay) e di scegliere cosa comprare: quote intere, verso i pesi del Piano (o quelli di oggi). */
function potSuggest(){
  if(typeof B==="undefined" || !B.setup || typeof cycleOf!=="function") return null;
  const cur=cycleOf(), st=bStatus(), rc=(replay&&replay.enabled)?replayCost().total:0, added=B.potAdd||{};
  const name=c=>(c.s.getDate()>15?c.e:c.s).toLocaleDateString("it-IT",{ month:"long" });
  // primo mese: niente obiettivo, da investire c'è solo quello che avanza del tempo libero (Replay e azioni sono già investiti)
  const amtOf=x=>Math.floor(x.P.partial ? Math.max(0,x.free) : Math.max(0,goalEnd(x)-rc));
  if(st.daysLeft<=3 && !added[cur.key]) return { key:cur.key, name:name(cur), amt:amtOf(st) };
  const prev=cycleOf(addDays(cur.s,-1));
  if(dayDiff(cur.s,today0())<7 && !added[prev.key] && parseYmd(B.setup.slice(0,10))<=prev.e){ const sp=bStatus(prev.s); return { key:prev.key, name:name(prev), amt:amtOf(sp) }; }
  return null;
}
/* «Investimento del mese» = quello che c'è da investire: barra (quanto del risparmio del mese è già investito),
   quanto manca, più gli avanzi dei mesi scorsi; un tasto per scegliere cosa comprare */
function invMonth(){
  let G=0, done=0, first=false;
  // primo mese: nessun obiettivo, quindi niente «da investire» oltre agli avanzi che decidi tu
  try{ if(typeof B!=="undefined" && B.setup){ const st=bStatus(); first=!!st.P.partial; done=goalDone(st); G=first?done:Math.max(0,cyclePlan(st.cy.s).save); } }catch(e){}
  const pot=Math.max(0,+PL.pot||0), left=Math.max(0,G-done);
  return { G, done, left, pot, first, toInvest:r2(left+pot), pc:G>0?Math.min(100,Math.round(done/G*100)):0 };
}
function potHtml(){
  const m=invMonth(), sg=potSuggest();
  return `<div class="mbar" role="progressbar" aria-valuenow="${m.pc}" aria-valuemin="0" aria-valuemax="100" aria-label="Investimento del mese" data-pot="buy">
      <i style="width:${m.pc}%"></i><span class="mb-t">Investimento del mese</span><b class="mb-p num">${m.pc}%</b></div>
    <div class="inv-sub"><div><b class="num">${m0(m.done)}</b> <span>${m.first?"investiti · primo mese, niente obiettivo":`di ${m0(m.G)} investiti`}</span>${m.pot>=1?`<small>+ ${money(m.pot)} avanzati dai mesi scorsi</small>`:""}</div>
      <div class="inv-r2"><small>da investire</small><b class="num">${m0(m.toInvest)}</b></div>
      <button class="btn ${m.toInvest>0?"gold":"ghost"} pot-buy" data-pot="buy" ${m.toInvest>0?"":"disabled"}>Scegli cosa comprare</button></div>
    ${sg&&sg.amt>0?`<button class="sopt rec" data-pot="add" data-key="${sg.key}" data-amt="${sg.amt}"><span class="sbadge">fine mese</span><b>➕ Tieni da investire i risparmi di ${esc(sg.name)}: ${money(sg.amt)}</b><span>Quello che hai messo da parte e non hai ancora investito.</span></button>`:""}`;
}
function mountPot(){ const h=document.getElementById("potHost"); if(!h) return; if(typeof PL==="undefined"){ h.innerHTML=""; return; } h.innerHTML=potHtml(); }

/* proposta: quote intere verso i pesi obiettivo */
let INV=null;
function invCands(){
  const L=[], add=(t,name,goal)=>{ if(L.some(x=>x.t===t)) return; const px=(typeof pxOf==="function"?pxOf(t):null) ?? (prices[t]&&prices[t].eur); if(!(px>0)) return; L.push({ t, name, goal, px, n:0 }); };
  let p=null; try{ p=PL.prof?planCompute():null; }catch(e){}
  if(p && p.weights) p.weights.filter(w=>w.goal>0).forEach(w=>add(ASSETS[w.k].t, ASSETS[w.k].n, w.goal/100));
  const tot=holdings.reduce((a,h)=>a+valueOf(h),0)||1;
  holdings.forEach(h=>add(h.ticker, h.name||h.ticker, p?0:valueOf(h)/tot));
  return L;
}
function invPropose(L, money0){
  const cur={}; holdings.forEach(h=>cur[h.ticker]=(cur[h.ticker]||0)+valueOf(h)); let left=money0, tot=Object.values(cur).reduce((a,b)=>a+b,0);
  L.forEach(x=>x.n=0);
  for(let k=0;k<300;k++){ const ok=L.filter(x=>x.px<=left+0.001 && x.goal>0); if(!ok.length) break;
    ok.sort((a,b)=>(b.goal*(tot+b.px)-(cur[b.t]||0))-(a.goal*(tot+a.px)-(cur[a.t]||0)));
    const x=ok[0]; x.n++; left-=x.px; cur[x.t]=(cur[x.t]||0)+x.px; tot+=x.px; }
}
function openInvest(){
  const pot=invMonth().toInvest; if(!(pot>0)){ toast("Questo mese non c'è niente da investire"); return; }
  const L=invCands(); if(!L.length){ toast("Prezzi non ancora caricati: riprova tra poco"); return; }
  invPropose(L, pot); INV={ L, pot };
  let s=document.getElementById("invScrim");
  if(!s){ s=document.createElement("div"); s.className="scrim"; s.id="invScrim";
    s.innerHTML=`<div class="sheet"><div class="sec-hd"><h2>📈 Cosa compro</h2><button class="sec-x" data-inv="close" aria-label="Chiudi">✕</button></div><div id="invBody"></div></div>`;
    document.body.appendChild(s); s.addEventListener("click",e=>{ if(e.target===s) s.classList.remove("open"); }); }
  invRender(); s.classList.add("open");
}
function invRender(){
  const b=document.getElementById("invBody"); if(!b||!INV) return;
  const spent=INV.L.reduce((a,x)=>a+x.n*x.px,0), left=INV.pot-spent;
  b.innerHTML=`<p class="hint" style="margin:0 0 10px">Hai <b class="num">${money(INV.pot)}</b> da investire. Ti propongo quote intere verso i pesi del tuo piano: cambia con − e +.</p>
    ${INV.L.map((x,i)=>`<div class="inv-r"><div class="inv-n"><b>${esc(shortName(x.t))}</b><small>${esc(x.name)} · ${money(x.px)} a quota${x.goal>0?` · obiettivo ${Math.round(x.goal*100)}%`:""}</small></div>
      <div class="inv-s"><button data-inv="-" data-i="${i}" ${x.n?"":"disabled"}>−</button><b class="num">${x.n}</b><button data-inv="+" data-i="${i}" ${x.px<=left+0.001?"":"disabled"}>+</button></div></div>`).join("")}
    <div class="bp-row" style="margin-top:8px"><span>Spendi</span><b class="num">${money(spent)}</b></div>
    <div class="bp-row"><span>Restano da investire</span><b class="num ${left<0?"neg":""}">${money(left)}</b></div>
    <p class="bnote">Compra queste quote dalla tua app (Fineco) e poi conferma qui: aggiungo le monete al forziere e tolgo la spesa dal salvadanaio.</p>
    <div class="btn-row"><button class="btn gold" data-inv="ok" ${spent>0&&left>=-0.01?"":"disabled"}>Ho comprato: aggiorna</button></div>
    <button class="btn ghost" data-inv="close" style="margin-top:10px">Non ora</button>`;
}
document.addEventListener("click",e=>{
  const p=e.target.closest("[data-pot]");
  if(p){ const a=p.dataset.pot;
    if(a==="edit"){ const v=prompt("Quanti soldi hai da parte da investire (€)?", String(+PL.pot||0).replace(".",",")); if(v==null) return; PL.pot=r2(Math.max(0,num(v))); plSave(); mountPot(); }
    else if(a==="add"){ const amt=+p.dataset.amt||0; PL.pot=r2((+PL.pot||0)+amt); plSave(); B.potAdd=B.potAdd||{}; B.potAdd[p.dataset.key]={ amt, date:ymd(today0()) }; bSave(); mountPot(); if(typeof renderBudget==="function") renderBudget(); toast("Aggiunti "+money(amt)+" da investire"); }
    else if(a==="buy") openInvest();
    return; }
  const b=e.target.closest("[data-inv]"); if(!b||!INV) return; const a=b.dataset.inv;
  if(a==="close"){ document.getElementById("invScrim").classList.remove("open"); return; }
  if(a==="+"||a==="-"){ const x=INV.L[+b.dataset.i]; x.n=Math.max(0,x.n+(a==="+"?1:-1)); invRender(); return; }
  if(a==="ok"){ const buys=INV.L.filter(x=>x.n>0), spent=buys.reduce((s,x)=>s+x.n*x.px,0); if(!buys.length) return;
    // prima uso gli avanzi dei mesi scorsi; il resto è risparmio di questo mese investito (conta nella barra e nel Budget)
    const fromPot=Math.min(Math.max(0,+PL.pot||0), spent), rest=r2(spent-fromPot); PL.pot=r2(Math.max(0,(+PL.pot||0)-fromPot));
    if(rest>0.005 && typeof B!=="undefined" && B.setup){ B.inv=B.inv||[]; const k=buys.length===1?buys[0]:null;
      B.inv.push({ id:"iv"+Date.now(), d:ymd(today0()), t:k?k.t:buys.map(x=>shortName(x.t)).join("+"), n:k?k.n:buys.reduce((a,x)=>a+x.n,0), amt:rest }); bSave(); if(typeof renderBudget==="function") renderBudget(); }
    PL.potLog=PL.potLog||[]; PL.potLog.push({ date:ymd(today0()), buys:buys.map(x=>({ t:x.t, n:x.n, px:r2(x.px) })) }); plSave();
    document.getElementById("invScrim").classList.remove("open");
    addBuys(buys.map(x=>({ t:x.t, n:x.n, px:x.px, name:x.name })));
    toast("Fatto: "+buys.map(x=>`+${x.n} ${shortName(x.t)}`).join(", ")); }
});

/* Replay: il giorno dell'acquisto le quote entrano nel portafoglio da sole (una volta al mese) */
let RP_BUSY=false;
function replayDateOf(y,m){ const d=Math.min(+replay.dayOfMonth||1, new Date(y,m+1,0).getDate()); return new Date(y,m,d); }
function replayAutoApply(){
  if(RP_BUSY || !replay || !replay.enabled || !(replay.items||[]).length) return false;
  const t0=today0(), last=replayDateOf(t0.getFullYear(), t0.getMonth()), lastDue=last<=t0?last:replayDateOf(t0.getFullYear(), t0.getMonth()-1), mk=d=>ymd(d).slice(0,7);
  if(!replay.applied){ replay.applied=mk(lastDue); store.set("replay",replay); return false; }   // da adesso in poi (i Replay passati sono già nelle posizioni)
  if(replay.applied>=mk(lastDue)) return false;
  const items=replay.items.filter(i=>+i.quote>0); if(items.some(i=>!(prices[i.ticker]&&prices[i.ticker].eur>0))) return false;   // aspetto i prezzi
  RP_BUSY=true; replay.applied=mk(lastDue); store.set("replay",replay);
  addBuys(items.map(i=>({ t:i.ticker, n:+i.quote, px:prices[i.ticker].eur, name:i.name })));
  RP_BUSY=false;
  setTimeout(()=>toast("🔁 Replay: "+items.map(i=>`+${i.quote} ${shortName(i.ticker)}`).join(", ")+" nel forziere"),600);
  return true;
}
