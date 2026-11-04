/* Gruzzolo in stile HUD (prova, branch prova-hud).
   Solo aspetto: legge i dati con bStatus() e B.tx, non scrive niente e non cambia la logica.
   - header ◢ GRUZZOLO//DEV con orologio, tab bar con i numeri 01 02 03 e l'indicatore che scivola;
   - sul Budget, sotto il serbatoio: gauge del budget usato, stato, contatori, oscilloscopio delle spese,
     barre degli ultimi 14 giorni e le ultime spese in stile tail -f.
   renderBudget() resta quella di budget.js: qui la si avvolge per riposizionare i pannelli dopo ogni disegno. */
(function(){
  if(!window.HUD) return;
  const C=HUD.C;
  document.body.classList.add("hud");

  /* testo dei grafici su canvas (pile di monete, serbatoi, grafico del portafoglio): stesso monospace dell'app.
     Cambia solo il carattere passato al canvas, non cosa viene disegnato. */
  const MONO=getComputedStyle(document.documentElement).getPropertyValue("--mono").trim()||"monospace";
  const fd=Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype,"font");
  if(fd && fd.set) Object.defineProperty(CanvasRenderingContext2D.prototype,"font",{ configurable:true, get:fd.get,
    set(v){ fd.set.call(this, String(v).replace(/(\d+(?:\.\d+)?px)\s+(?!ui-monospace).*$/, "$1 "+MONO)); } });

  /* ---------- header ---------- */
  const brand=document.querySelector(".bar .brand");
  if(brand){
    brand.innerHTML=`<span class="c-cyan">◢</span> GRUZZOLO<span class="c-cyan">//</span>DEV<small><span class="hud-live" style="display:inline-flex;margin:0"><i></i><b id="hudClock"></b></span></small>`;
    HUD.clock(document.getElementById("hudClock"));
  }

  /* ---------- tab bar: numeri e indicatore ---------- */
  const bar=document.querySelector(".tabbar");
  if(bar){
    let n=0;
    [...bar.querySelectorAll(".tab")].forEach(t=>{
      if(t.classList.contains("tab-add") || t.classList.contains("more-tab") || t.style.display==="none") return;
      const b=document.createElement("b"); b.className="hud-n"; b.textContent=String(++n).padStart(2,"0"); t.prepend(b);
    });
    const ind=document.createElement("div"); ind.className="hud-ind"; bar.appendChild(ind);
    const place=()=>{ const on=bar.querySelector(".tab.on:not(.tab-add)"); if(!on || on.offsetParent===null){ ind.style.width="0"; return; }
      ind.style.width=on.offsetWidth+"px"; ind.style.transform=`translateX(${on.offsetLeft}px)`; };
    new MutationObserver(place).observe(bar,{ subtree:true, attributes:true, attributeFilter:["class"] });
    addEventListener("resize",place); setTimeout(place,300);
  }

  /* ---------- Budget: pannelli animati ---------- */
  const eur=v=>(typeof m0==="function"?m0(v):Math.round(v)+" €");
  const eur2=v=>(typeof money==="function"?money(v):v.toFixed(2)+" €");
  const DAY=86400000;
  let box=null, g=null, sc=null, lastRem=null, lastSig="";

  function build(){
    box=document.createElement("div"); box.id="hudBud";
    box.innerHTML=`
      <div class="hud-row">
        <div class="hud-panel acc-teal" id="hbPg" style="--i:0"><div class="hud-ph"><span class="t">budget usato</span><span class="tag">mese</span></div><div class="hb-gauge" id="hbGauge"></div></div>
        <div class="hud-panel acc-teal" id="hbPs" style="--i:1"><div class="hud-ph"><span class="t">stato</span></div>
          <div class="hb-state">
            <span class="hud-pill" id="hbPill">--</span>
            <div class="hud-kv"><span class="hud-label">al giorno</span><span id="hbDay">--</span></div>
            <div class="hud-kv"><span class="hud-label">ritmo</span><span id="hbPace">--</span></div>
          </div></div>
      </div>
      <div class="hud-panel" style="--i:2"><div class="hud-ph"><span class="t">totali del mese</span><span class="tag" id="hbCy">--</span></div>
        <div class="hb-cnt">
          <div><div class="hud-big c-cyan" id="hbN">000</div><div class="hud-label">spese</div></div>
          <div><div class="hud-big c-amber" id="hbSp">0000</div><div class="hud-label">€ spesi</div></div>
          <div><div class="hud-big c-teal" id="hbGg">00</div><div class="hud-label">giorni</div></div>
          <div><div class="hud-big c-violet" id="hbBu">00</div><div class="hud-label">buoni</div></div>
        </div></div>
      <div class="hud-panel" id="hbPsc" style="--i:3"><div class="hud-ph"><span class="t">spese // andamento</span><span class="tag">30 g · € al giorno</span></div>
        <div style="display:flex;align-items:flex-end;margin-bottom:6px"><span class="hud-big c-cyan" style="font-size:22px" id="hbToday">--</span><span class="hud-label" style="margin:0 0 4px 6px">oggi</span>
          <span style="flex:1"></span><div style="text-align:right"><div class="hud-label">media 30 g</div><div class="hud-value" id="hbAvg">--</div></div></div>
        <canvas class="hud-canvas" id="hbScope" style="height:84px"></canvas></div>
      <div class="hud-panel" id="hbPd" style="--i:4"><div class="hud-ph"><span class="t">ultimi 14 giorni</span><span class="tag" id="hbDTag">--</span></div>
        <div class="hb-days" id="hbDays"></div><div class="hb-dl" id="hbDl"></div>
        <div class="hb-legend hud-label"><span><i style="background:var(--teal)"></i>nel ritmo</span><span><i style="background:var(--amber)"></i>sopra</span><span><i style="background:var(--cyan)"></i>oggi</span></div></div>
`;
    g=HUD.gauge(box.querySelector("#hbGauge"),{ text:"--", label:"" });
    sc=HUD.scope(box.querySelector("#hbScope"),{ capacity:30, min:0, max:50, color:C.cyan });
  }

  const GRP={ libero:["LIB",C.teal], weekend:["WKND",C.violet], spesa:["SPESA",C.cyan], ric:["RIC",C.dim] };
  // gruppo di una spesa come nel serbatoio: weekend, spesa, ricorrenti (necessarie e fisse) o tempo libero
  function grpOf(st,t){ const id=budgetCat(t), c=catById(id);
    if(id==="weekend") return "weekend"; if(id==="spesa") return "spesa";
    return (c.g==="fisse" || c.g==="necessarie") ? "ric" : "libero"; }

  function update(){
    if(!B || !B.setup){ if(box) box.remove(); return; }
    const host=document.getElementById("budBody"); if(!host) return;
    let st; try{ st=bStatus(); }catch(e){ return; }
    if(!box) build();
    const t4=host.querySelector(".t4"); const sec=t4 && t4.closest("section");
    if(sec){ if(sec.nextSibling!==box) sec.after(box); } else if(box.parentNode!==host) host.prepend(box);

    // budget flessibile (tempo libero, weekend, spesa): quanto ne hai usato e a che ritmo
    const flex=(st.groups||[]).filter(x=>x.id!=="ric"), cap=flex.reduce((a,x)=>a+Math.max(x.cap,0),0), used=flex.reduce((a,x)=>a+x.s,0);
    const tot=Math.max(1,dayDiff(st.cy.s,st.cy.e)+1), el=Math.min(1,Math.max(0,(tot-st.daysLeft+1)/tot));
    const frac=cap>0?used/cap:0, over=st.remaining<0 || flex.some(x=>x.s>x.cap+0.5 && x.cap>0);
    const state=over?"red":frac>el+0.08?"amber":"teal";
    const col={ teal:C.teal, amber:C.amber, red:C.red }[state];
    const lab={ teal:"sotto budget", amber:"vicino al limite", red:"sforato" }[state];
    g.set(Math.min(1,frac), Math.round(frac*100)+"%", lab, ()=>col);
    box.querySelectorAll("#hbPg,#hbPs").forEach(p=>{ p.classList.remove("acc-teal","acc-amber","acc-red"); p.classList.add("acc-"+state); });
    const pill=box.querySelector("#hbPill"); pill.textContent=lab; pill.style.setProperty("--c",col); pill.classList.toggle("blink",state==="red");
    const perDay=Math.max(0,flex.reduce((a,x)=>a+Math.max(0,x.left),0))/Math.max(1,st.daysLeft);
    const sig=[st.remaining.toFixed(2),perDay.toFixed(2),Math.round(el*100),Math.round(frac*100)].join("|");
    if(sig!==lastSig){
      // (i soldi che restano sono già scritti grandi nel serbatoio: qui non li ripeto)
      HUD.scramble(box.querySelector("#hbDay"), eur(perDay));
      HUD.scramble(box.querySelector("#hbPace"), `${Math.round(frac*100)}% / ${Math.round(el*100)}%`);
      lastSig=sig;
    }
    box.querySelector("#hbPace").style.color=col;

    // contatori
    const out=st.T.filter(t=>t.type!=="in");
    box.querySelector("#hbCy").textContent=`${fShort(st.cy.s)} → ${fShort(st.cy.e)}`;
    HUD.count(box.querySelector("#hbN"), out.length, 3);
    HUD.count(box.querySelector("#hbSp"), Math.round(out.reduce((a,t)=>a+t.amt-(t.buoniVal||0),0)), 4);
    HUD.count(box.querySelector("#hbGg"), st.daysLeft, 2);
    HUD.count(box.querySelector("#hbBu"), (B.buoni&&B.buoni.bal)||0, 2);

    // spese al giorno (tutti i movimenti in uscita, con i buoni): ultimi 30 giorni per lo scope, 14 per le barre
    const t0=today0(), byDay={};
    (B.tx||[]).forEach(t=>{ if(t.type==="in") return; byDay[t.d]=(byDay[t.d]||0)+t.amt; });
    const days=n=>Array.from({ length:n },(_,i)=>{ const d=new Date(t0.getTime()-(n-1-i)*DAY); return { d, k:ymd(d), v:byDay[ymd(d)]||0 }; });
    const D30=days(30), mx=Math.max(20,...D30.map(x=>x.v));
    sc.range(0, mx*1.15); sc.set(D30.map(x=>x.v));
    const today=D30[D30.length-1].v, avg=D30.reduce((a,x)=>a+x.v,0)/30;
    const ritmo=cap/tot;   // spesa flessibile prevista al giorno
    const scc=today>ritmo*1.5?C.amber:C.cyan; sc.color(scc);
    box.querySelector("#hbToday").textContent=eur2(today); box.querySelector("#hbToday").style.color=scc; box.querySelector("#hbAvg").textContent=eur2(avg);
    const D14=days(14), m14=Math.max(ritmo*1.6, ...D14.map(x=>x.v), 1);
    box.querySelector("#hbDTag").textContent=`ritmo ${eur(ritmo)}/g`;
    box.querySelector("#hbDays").innerHTML=D14.map((x,i)=>`<div class="d ${i===13?"today":""} ${x.v>ritmo*1.5?"over":""} ${x.v<=0?"zero":""}" title="${x.k}: ${eur2(x.v)}"><i style="height:${Math.max(2,x.v/m14*100).toFixed(1)}%;animation-delay:${i*35}ms"></i></div>`).join("");
    box.querySelector("#hbDl").innerHTML=D14.map((x,i)=>`<span class="${i===13?"t":""}">${["D","L","M","M","G","V","S"][x.d.getDay()]}</span>`).join("");

  }

  if(typeof renderBudget==="function"){
    const orig=renderBudget;
    window.renderBudget=function(){ const r=orig.apply(this,arguments); try{ update(); }catch(e){ console.error("hud",e); } return r; };
    try{ update(); }catch(e){}
  }
})();
