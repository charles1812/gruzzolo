/* ---------- Altri modi di vedere la strategia (si aggiungono a VZ_MODES di strategia-viz.js) ----------
   ✨ La costellazione: ogni fondo è un ammasso di stelle (una stella ogni punto di peso); trascini e giri il cielo.
   🫧 Le bolle: un logo per fondo, grande quanto il suo peso; galleggiano, si spingono, le sposti col dito.
   🏙️ La città: un quartiere di grattacieli per fondo, alto quanto il peso; le finestre accese tremolano quanto oscilla.
   🪐 Le orbite: il tuo patrimonio al centro, i fondi pianeti: grandi quanto il peso, più lontani e veloci più sono rischiosi.
   💸 Il flusso: dove va lo stipendio del mese, dal Budget al fondo emergenza e agli ETF della strategia. */
const VZ_FONT=(s,w)=>`${w||600} ${s}px ui-monospace, Consolas, monospace`;
function vzKeys(st){ const tot=ST_KEYS.reduce((a,k)=>a+(st.w[k]||0),0)||1; return { tot, f:k=>(st.w[k]||0)/tot, keys:ST_KEYS.filter(k=>(st.w[k]||0)/tot>0.004) }; }
function vzGrow(st){ return st.month!=null ? Math.max(0.18, Math.sqrt(st.tot/VZ.tm.sim.max)) : 1; }
/* etichette che non si toccano: le raccolgo e le scrivo alla fine, spostando in giù quelle che si sovrappongono */
let VZ_LQ=null;
function vzLabel(x, X, Y, k, f, al){ if(VZ_LQ){ VZ_LQ.push([X,Y,k,f,al]); return; } vzLabel0(x, X, Y, k, f, al); }
function vzLabelsFlush(x, W, H){ const L=VZ_LQ||[]; VZ_LQ=null; const done=[];
  L.sort((a,b)=>a[1]-b[1]||a[0]-b[0]).forEach(([X,Y,k,f,al])=>{ x.font=VZ_FONT(11); const w=Math.max(x.measureText(`${shortName(ASSETS[k].t)} 00%`).width, (x.font=VZ_FONT(9), x.measureText(ST_LAB[k].toUpperCase()).width))+8;
    X=Math.max(w/2+2, Math.min(W-w/2-2, X)); for(let g=0; g<6 && done.some(d=>Math.abs(d[0]-X)<(d[2]+w)/2 && Math.abs(d[1]-Y)<26); g++) Y+=26; Y=Math.min(H-14,Y);
    done.push([X,Y,w]); vzLabel0(x, X, Y, k, f, al); }); }
function vzLabel0(x, X, Y, k, f, al){ x.textAlign=al||"center"; x.fillStyle=ST_COL[k]; x.font=VZ_FONT(11); x.fillText(`${shortName(ASSETS[k].t)} ${Math.round(f*100)}%`, X, Y); x.fillStyle="#5E7884"; x.font=VZ_FONT(9); x.fillText(ST_LAB[k].toUpperCase(), X, Y+12); }

/* trascinare sul grafico: pitch (su/giù) per il cielo, punto del dito per le bolle */
const VZP={ down:false, x:0, y:0, p0:0, y0:0 };
document.addEventListener("pointerdown",e=>{ if(e.target.id!=="st3d") return; const r=e.target.getBoundingClientRect(); VZP.down=true; VZP.x=e.clientX-r.left; VZP.y=e.clientY-r.top; VZP.y0=e.clientY; VZP.x0=e.clientX; VZP.p0=ST3.pitch||0; VZP.w0=VZ.yaw||0; });
document.addEventListener("pointermove",e=>{ if(!VZP.down) return; const c=document.getElementById("st3d"); if(!c) return; const r=c.getBoundingClientRect(); VZP.x=e.clientX-r.left; VZP.y=e.clientY-r.top;
  ST3.pitch=Math.max(-1.1, Math.min(1.1, VZP.p0+(e.clientY-VZP.y0)*0.008)); VZ.yaw=VZP.w0-(e.clientX-VZP.x0)*0.007; });
document.addEventListener("pointerup",()=>{ VZP.down=false; });
document.addEventListener("pointercancel",()=>{ VZP.down=false; });

/* ---------- ✨ costellazione ---------- */
const VZ_SKY={ SWDA:[-0.26,0.1], EIMI:[0.3,0.2], AGGH:[0.24,-0.17], XEON:[-0.3,-0.2] };
const VZ_STARS={};
function vzStars(k){ if(VZ_STARS[k]) return VZ_STARS[k]; const r=vzRnd(k.charCodeAt(0)*97+k.charCodeAt(1)), [y0,p0]=VZ_SKY[k], L=[];
  const g=()=>{ let s=0; for(let i=0;i<4;i++) s+=r(); return (s-2)/2; };
  for(let i=0;i<120;i++){ const yw=y0+g()*0.24, pt=p0+g()*0.17; L.push({ yw, pt, m:r(), ph:r()*6.28 }); }
  // ordine «a catena»: ogni stella si lega alla più vicina non ancora usata (le linee della costellazione)
  const out=[L[0]], used=new Set([0]); while(out.length<L.length){ const a=out[out.length-1]; let bi=-1, bd=9; L.forEach((b,i)=>{ if(used.has(i)) return; const d=(a.yw-b.yw)**2+(a.pt-b.pt)**2; if(d<bd){ bd=d; bi=i; } }); used.add(bi); out.push(L[bi]); }
  return VZ_STARS[k]=out; }
function vzSky(x, W, H, t, dt, st){
  const K=vzKeys(st), grow=vzGrow(st), yaw=(VZ.yaw||0)+0.12*Math.sin(t*0.12), pit=ST3.pitch||0, F=W*0.85, cx=W/2, cy=H/2;
  const bg=x.createRadialGradient(cx,cy,10,cx,cy,W); bg.addColorStop(0,"rgba(140,124,255,.10)"); bg.addColorStop(1,"rgba(4,7,11,0)"); x.fillStyle=bg; x.fillRect(0,0,W,H);
  const far=vzRnd(3); x.fillStyle="#D3E9F0"; for(let i=0;i<120;i++){ const a=far(), b=far(); x.globalAlpha=0.15+0.25*far(); x.fillRect(((a*W*3-yaw*60)%W+W)%W, ((b*H*2+pit*40)%H+H)%H, 1, 1); } x.globalAlpha=1;
  const proj=(yw,pt)=>{ const X=Math.cos(pt)*Math.sin(yw-yaw), Y=Math.sin(pt), Z=Math.cos(pt)*Math.cos(yw-yaw);
    const y2=Y*Math.cos(pit)-Z*Math.sin(pit), z2=Y*Math.sin(pit)+Z*Math.cos(pit); return z2>0.15 ? [cx+X/z2*F, cy-y2/z2*F, z2] : null; };
  K.keys.forEach(k=>{ const S=vzStars(k), n=Math.max(1, Math.round(K.f(k)*100*grow)), col=ST_COL[k], vol=ST_VOL[k]||.1, P=[];
    for(let i=0;i<n;i++){ const s=S[i], p=proj(s.yw, s.pt); P.push(p); }
    x.strokeStyle=col; x.globalAlpha=0.28; x.lineWidth=0.8; x.beginPath();
    for(let i=1;i<Math.min(n,40);i++){ const a=P[i-1], b=P[i]; if(a&&b&&Math.hypot(a[0]-b[0],a[1]-b[1])<W*0.25){ x.moveTo(a[0],a[1]); x.lineTo(b[0],b[1]); } } x.stroke();
    P.forEach((p,i)=>{ if(!p) return; const s=S[i], tw=0.55+0.45*Math.sin(t*(1.5+18*vol)+s.ph), r=(i<6?3:1.4+s.m*1.5)*Math.min(1.6,0.8+p[2]*0.6);
      x.globalAlpha=tw; x.fillStyle=col; x.beginPath(); x.arc(p[0],p[1],r,0,Math.PI*2); x.fill();
      if(i<6){ x.globalAlpha=tw*0.25; x.beginPath(); x.arc(p[0],p[1],r*4,0,Math.PI*2); x.fill(); } });
    x.globalAlpha=1;
    const c=proj(VZ_SKY[k][0], VZ_SKY[k][1]+0.17); if(c && c[0]>20 && c[0]<W-20 && c[1]>14 && c[1]<H-20) vzLabel(x, c[0], c[1], k, K.f(k));
  });
  x.textAlign="right"; x.fillStyle="#5E7884"; x.font=VZ_FONT(9); x.fillText("TRASCINA PER GIRARE IL CIELO", W-10, H-10);
}

/* ---------- 🫧 bolle con il logo ---------- */
function vzIssuer(k){ const n=ASSETS[k].n||""; return /^iShares/i.test(n)?"iShares":/^Xtrackers/i.test(n)?"Xtrackers":/^Vanguard/i.test(n)?"Vanguard":/^Amundi/i.test(n)?"Amundi":n.split(" ")[0]; }
function vzBubbles(x, W, H, t, dt, st){
  const K=vzKeys(st), grow=vzGrow(st), Rm=Math.min(W,H)*0.33*grow; VZ.bp=VZ.bp||{};
  const B=K.keys.map((k,i)=>{ let b=VZ.bp[k]; if(!b) b=VZ.bp[k]={ x:W/2+(i-1.5)*40, y:H/2+(i%2?20:-20), vx:0, vy:0 }; b.k=k; b.r=Math.max(16, Rm*Math.sqrt(K.f(k))); return b; });
  const vol=k=>ST_VOL[k]||.1;
  B.forEach(b=>{ b.vx+=(W/2-b.x)*0.9*dt; b.vy+=(H/2-b.y)*0.9*dt; b.vx+=Math.sin(t*(1+9*vol(b.k))+b.r)*vol(b.k)*40*dt*(1+3*st.storm); b.vy+=Math.cos(t*(1.3+9*vol(b.k))+b.r)*vol(b.k)*40*dt*(1+3*st.storm);
    if(VZP.down){ const dx=b.x-VZP.x, dy=b.y-VZP.y, d=Math.hypot(dx,dy)||1; if(d<b.r+50){ const f=(b.r+50-d)*6*dt; b.vx+=dx/d*f*10; b.vy+=dy/d*f*10; } } });
  for(let i=0;i<B.length;i++) for(let j=i+1;j<B.length;j++){ const a=B[i], b=B[j], dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy)||1, o=a.r+b.r+6-d; if(o>0){ const p=o*0.5, nx=dx/d, ny=dy/d; a.x-=nx*p; a.y-=ny*p; b.x+=nx*p; b.y+=ny*p; } }
  B.forEach(b=>{ b.vx*=Math.pow(0.15,dt); b.vy*=Math.pow(0.15,dt); b.x+=b.vx*dt; b.y+=b.vy*dt; b.x=Math.max(b.r,Math.min(W-b.r,b.x)); b.y=Math.max(b.r,Math.min(H-b.r,b.y)); });
  B.forEach(b=>{ const col=ST_COL[b.k], f=K.f(b.k);
    const g=x.createRadialGradient(b.x-b.r*0.35,b.y-b.r*0.4,b.r*0.1,b.x,b.y,b.r); g.addColorStop(0,st3dShade(col,1.15)); g.addColorStop(0.7,st3dShade(col,0.55)); g.addColorStop(1,st3dShade(col,0.3));
    x.fillStyle=g; x.beginPath(); x.arc(b.x,b.y,b.r,0,Math.PI*2); x.fill();
    x.strokeStyle="rgba(255,255,255,.35)"; x.lineWidth=1.2; x.stroke();
    x.fillStyle="rgba(255,255,255,.28)"; x.beginPath(); x.ellipse(b.x-b.r*0.35,b.y-b.r*0.45,b.r*0.32,b.r*0.16,-0.5,0,Math.PI*2); x.fill();
    // il «logo»: emittente piccolo, sigla grande, peso sotto
    const s=Math.max(9, Math.min(26, b.r*0.42)); x.textAlign="center"; x.fillStyle="rgba(4,7,11,.85)";
    if(b.r>26){ x.font=VZ_FONT(Math.max(8,s*0.45),500); x.fillText(vzIssuer(b.k), b.x, b.y-s*0.75); }
    x.font=VZ_FONT(s,800); x.fillText(shortName(ASSETS[b.k].t), b.x, b.y+s*0.3);
    x.font=VZ_FONT(Math.max(8,s*0.5),700); x.fillText(Math.round(f*100)+"%", b.x, b.y+s*1.05);
    if(b.r>34){ x.font=VZ_FONT(Math.max(7,s*0.36),500); x.fillText(ST_LAB[b.k].toUpperCase(), b.x, b.y+s*1.6); } });
  x.textAlign="right"; x.fillStyle="#5E7884"; x.font=VZ_FONT(9); x.fillText("TOCCA E SPINGI LE BOLLE", W-10, H-10);
}

/* ---------- 🏙️ città ---------- */
function vzCity(x, W, H, t, dt, st){
  const K=vzKeys(st), grow=vzGrow(st), gY=H*0.76;
  const sky=x.createLinearGradient(0,0,0,gY); sky.addColorStop(0,"rgba(140,124,255,.16)"); sky.addColorStop(1,"rgba(255,176,32,.06)"); x.fillStyle=sky; x.fillRect(0,0,W,gY);
  // skyline lontana
  const far=vzRnd(21); x.fillStyle="rgba(23,50,61,.55)"; for(let X=0;X<W;){ const w=10+far()*22, h=H*(0.12+far()*0.22); x.fillRect(X,gY-h,w-2,h); X+=w; }
  let X=W*0.04; const span=W*0.92, fmax=Math.max(...K.keys.map(K.f)), labs=[];
  K.keys.forEach(k=>{ const f=K.f(k), wD=Math.max(26, span*f), col=ST_COL[k], vol=ST_VOL[k]||.1, r=vzRnd(k.charCodeAt(0)*31), nB=Math.max(1,Math.min(6,Math.round(wD/28)));
    const hB=H*0.6*(0.28+0.72*Math.sqrt(f/fmax))*grow; let bx=X;
    for(let i=0;i<nB;i++){ const bw=wD/nB-3, bh=hB*(0.55+r()*0.45)*(i===Math.floor(nB/2)?1.12:1), by=gY-bh;
      const g=x.createLinearGradient(bx,by,bx+bw,by); g.addColorStop(0,st3dShade(col,0.22)); g.addColorStop(1,st3dShade(col,0.1)); x.fillStyle=g; x.fillRect(bx,by,bw,bh);
      x.strokeStyle=col; x.globalAlpha=0.5; x.lineWidth=1; x.strokeRect(bx+0.5,by+0.5,bw-1,bh-1); x.globalAlpha=1;
      // finestre: tremolano quanto oscilla il fondo
      for(let wy=by+6; wy<gY-6; wy+=8) for(let wx=bx+4; wx<bx+bw-5; wx+=7){ const s=Math.sin(wx*12.9898+wy*78.233)*43758.5453, rv=s-Math.floor(s), on=rv>0.45 && Math.sin(t*(0.3+vol*14)+rv*40)>-0.6+vol*2;
        if(on){ x.fillStyle=col; x.globalAlpha=0.35+0.5*rv; x.fillRect(wx,wy,3,4); } } x.globalAlpha=1;
      if(ASSETS[k].k==="az" && i===Math.floor(nB/2)){ x.strokeStyle=st3dShade(col,0.6); x.beginPath(); x.moveTo(bx+bw/2,by); x.lineTo(bx+bw/2,by-14); x.stroke(); if(Math.sin(t*4+i)>0){ x.fillStyle="#FF3B5C"; x.beginPath(); x.arc(bx+bw/2,by-15,2,0,Math.PI*2); x.fill(); } }
      bx+=bw+3; }
    labs.push([X+wD/2, k, f]); X+=wD+6; });
  x.fillStyle="#071019"; x.fillRect(0,gY,W,H-gY); x.strokeStyle="rgba(0,229,255,.35)"; x.beginPath(); x.moveTo(0,gY); x.lineTo(W,gY); x.stroke();
  labs.forEach(([lx,k,f])=>vzLabel(x, lx, gY+16, k, f));
}

/* ---------- 🪐 orbite ---------- */
const VZ_ORB={ XEON:0.3, AGGH:0.48, SWDA:0.7, EIMI:0.92 };
function vzOrbits(x, W, H, t, dt, st){
  const K=vzKeys(st), grow=vzGrow(st), cx=W/2, cy=H*0.5, R=Math.min(W*0.46, H*0.8), tilt=0.45, sunR=10+16*grow;
  x.strokeStyle="rgba(94,120,132,.35)"; x.lineWidth=1; K.keys.forEach(k=>{ x.beginPath(); x.ellipse(cx,cy,R*VZ_ORB[k],R*VZ_ORB[k]*tilt,0,0,Math.PI*2); x.stroke(); });
  const P=K.keys.map((k,i)=>{ const vol=ST_VOL[k]||.1, a=t*(0.12+vol*3)*(1+st.storm)+i*1.7, rr=R*VZ_ORB[k]; return { k, a, x:cx+Math.cos(a)*rr, y:cy+Math.sin(a)*rr*tilt, z:Math.sin(a), r:4+20*Math.sqrt(K.f(k))*grow, rr }; });
  const draw=p=>{ const col=ST_COL[p.k];
    for(let j=1;j<14;j++){ const b=p.a-j*0.05; x.fillStyle=col; x.globalAlpha=0.3*(1-j/14); x.beginPath(); x.arc(cx+Math.cos(b)*p.rr, cy+Math.sin(b)*p.rr*tilt, p.r*(1-j/20), 0, Math.PI*2); x.fill(); } x.globalAlpha=1;
    const g=x.createRadialGradient(p.x-p.r*0.4,p.y-p.r*0.4,1,p.x,p.y,p.r); g.addColorStop(0,st3dShade(col,1.2)); g.addColorStop(1,st3dShade(col,0.35)); x.fillStyle=g; x.beginPath(); x.arc(p.x,p.y,p.r,0,Math.PI*2); x.fill();
    vzLabel(x, p.x, p.y+p.r+13, p.k, K.f(p.k)); };
  P.filter(p=>p.z<0).forEach(draw);
  const sg=x.createRadialGradient(cx,cy,2,cx,cy,sunR*3); sg.addColorStop(0,"rgba(255,236,200,.95)"); sg.addColorStop(0.3,"rgba(255,176,32,.55)"); sg.addColorStop(1,"rgba(255,176,32,0)"); x.fillStyle=sg; x.beginPath(); x.arc(cx,cy,sunR*3,0,Math.PI*2); x.fill();
  x.fillStyle="#04070B"; x.font=VZ_FONT(9,800); x.textAlign="center"; x.fillText("TU", cx, cy+3);
  P.filter(p=>p.z>=0).forEach(draw);
}

/* ---------- 💸 flusso dei soldi del mese ---------- */
function vzFlow(x, W, H, t, dt, st){
  if(typeof B==="undefined" || !B.setup){ x.fillStyle="#5E7884"; x.font=VZ_FONT(11); x.textAlign="center"; x.fillText("RISPONDI ALLE DOMANDE DEL BUDGET", W/2, H/2); return; }
  let P, pc; try{ P=modePlan(B.mode); pc=planCompute(); }catch(e){ return; }
  const inc=Math.max(1,P.net+P.buoni), save=Math.max(0,P.save), fs=pc&&pc.fund<pc.target?fundShare(PL.prof):0, fund=save*fs, etf=save-fund, K=vzKeys({ w:ST3.cur });
  const nodes=[ { id:"in", c:0, v:inc, l:"Stipendio", col:"#D3E9F0" },
    { id:"need", c:1, v:Math.max(0,P.needs-P.buoni*0), l:"Spese", col:"#5E7884", from:"in" }, { id:"want", c:1, v:Math.max(0,P.wants), l:"Tempo libero", col:"#FFB020", from:"in" }, { id:"save", c:1, v:save, l:"Da parte", col:"#1DF2B6", from:"in" },
    ...(fund>0.5?[{ id:"fund", c:2, v:fund, l:"Fondo emergenza", col:"#7fd6d0", from:"save" }]:[]),
    ...K.keys.map(k=>({ id:k, c:2, v:etf*K.f(k), l:shortName(ASSETS[k].t), col:ST_COL[k], from:"save" })) ];
  const colX=[W*0.04, W*0.4, W*0.76], nw=10, top=34, avail=H-44, gap=10;
  [0,1,2].forEach(c=>{ const L=nodes.filter(n=>n.c===c), tot=L.reduce((a,n)=>a+n.v,0)||1, sc=(avail-gap*(L.length-1))/(c===2?Math.max(tot,inc*0.5):inc); let y=top+(c===2?avail*0.08:0);
    L.forEach(n=>{ n.h=Math.max(3,n.v*sc); n.y=y; y+=n.h+gap; n.x=colX[c]; n.out=0; }); });
  const byId=Object.fromEntries(nodes.map(n=>[n.id,n])), links=nodes.filter(n=>n.from).map(n=>{ const s=byId[n.from], h=n.h*(n.c===2?s.h/Math.max(1,nodes.filter(m=>m.from===s.id).reduce((a,m)=>a+m.h,0)):1); const sy=s.y+s.out; s.out+=h; return { s, d:n, sy, h }; });
  VZ.fp=VZ.fp||[];
  links.forEach((l,i)=>{ const x0=l.s.x+nw, x1=l.d.x, y0=l.sy, y1=l.d.y, h0=l.h, h1=l.d.h, mx=(x0+x1)/2;
    const g=x.createLinearGradient(x0,0,x1,0); g.addColorStop(0,l.s.col+"55"); g.addColorStop(1,l.d.col+"88"); x.fillStyle=g;
    x.beginPath(); x.moveTo(x0,y0); x.bezierCurveTo(mx,y0,mx,y1,x1,y1); x.lineTo(x1,y1+h1); x.bezierCurveTo(mx,y1+h1,mx,y0+h0,x0,y0+h0); x.closePath(); x.fill();
    l.i=i; l.x0=x0; l.x1=x1; l.mx=mx; });
  // monete che scorrono nei nastri, tante quanti gli euro
  links.forEach(l=>{ const n=Math.round(l.h/5); while(VZ.fp.filter(p=>p.l===l.d.id).length<n) VZ.fp.push({ l:l.d.id, u:Math.random(), v:Math.random(), sp:0.18+Math.random()*0.12 }); });
  const bez=(a,b,c,d,u)=>{ const m=1-u; return m*m*m*a+3*m*m*u*b+3*m*u*u*c+u*u*u*d; };
  VZ.fp=VZ.fp.filter(p=>links.some(l=>l.d.id===p.l));
  VZ.fp.forEach(p=>{ const l=links.find(z=>z.d.id===p.l); p.u+=p.sp*dt; if(p.u>1) p.u-=1; const u=p.u, X=bez(l.x0,l.mx,l.mx,l.x1,u), ya=bez(l.sy,l.sy,l.d.y,l.d.y,u), yb=bez(l.sy+l.h,l.sy+l.h,l.d.y+l.d.h,l.d.y+l.d.h,u);
    x.fillStyle=l.d.col; x.globalAlpha=0.9; x.beginPath(); x.arc(X, ya+(yb-ya)*p.v, 1.6, 0, Math.PI*2); x.fill(); }); x.globalAlpha=1;
  nodes.forEach(n=>{ x.fillStyle=n.col; x.fillRect(n.x,n.y,nw,n.h);
    const right=n.c<2, tx=right?n.x+nw+5:n.x+nw+5; x.textAlign="left"; x.fillStyle=n.col; x.font=VZ_FONT(10,700);
    if(n.c===0){ x.fillText(n.l.toUpperCase()+" "+m0(n.v), n.x, n.y-10); return; }
    const ty=n.y+Math.min(n.h/2+4, n.h+10); x.fillText(n.l.toUpperCase(), n.c===1?n.x-4-x.measureText(n.l.toUpperCase()).width:tx, ty);
    x.fillStyle="#D3E9F0"; x.font=VZ_FONT(10); x.fillText(m0(n.v), n.c===1?n.x-4-x.measureText(m0(n.v)).width:tx, ty+12); });
}

Object.assign(VZ_MODES, {
  stelle:{ e:"✨", n:"La costellazione", note:"una stella = un punto di peso · brillano quanto oscillano · trascina per girare il cielo", tm:true, draw:vzSky },
  bolle:{ e:"🫧", n:"Le bolle", note:"bolla = un fondo con il suo logo · grande quanto il peso · spingile col dito", tm:true, draw:vzBubbles },
  citta:{ e:"🏙️", n:"La città", note:"quartiere = un fondo · alto quanto il peso · finestre che tremolano = quanto oscilla", tm:true, draw:vzCity },
  orbite:{ e:"🪐", n:"Le orbite", note:"al centro tu · pianeta = un fondo, grande quanto il peso · più lontano e veloce = più rischio", tm:true, draw:vzOrbits },
  flusso:{ e:"💸", n:"Il flusso", note:"dove va lo stipendio del mese: spese, tempo libero, fondo emergenza ed ETF della strategia", tm:false, draw:vzFlow },
});
(function(){ const s=document.getElementById("sViz"); if(!s) return; s.innerHTML=Object.entries(VZ_MODES).map(([k,v])=>`<option value="${k}">${v.e} ${v.n}${v.tm?", con la macchina del tempo":""}</option>`).join(""); s.value=vzMode(); })();
