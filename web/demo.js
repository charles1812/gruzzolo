/* Versione web di prova: pulsante 🧪 con «Prova con un esempio», «Simula un pagamento» e «Ricomincia».
   L'esempio risponde alle domande iniziali come farebbe una persona (stipendio 1.640 €, buoni pasto, auto,
   un piccolo portafoglio di ETF), poi aggiunge qualche spesa, due abbonamenti e due pagamenti da confermare. */
(function(){
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const css = `
  .demo-fab{position:fixed; right:14px; bottom:96px; z-index:60; border:1px solid rgba(224,177,94,.6); background:rgba(20,26,30,.92); color:#f2cf82;
    border-radius:99px; padding:9px 14px; font:600 13px/1 var(--ui,system-ui); box-shadow:0 6px 20px rgba(0,0,0,.45); cursor:pointer; backdrop-filter:blur(8px)}
  .demo-sc{position:fixed; inset:0; z-index:70; background:rgba(0,0,0,.55); display:none; align-items:flex-end; justify-content:center}
  .demo-sc.open{display:flex}
  .demo-sh{width:100%; max-width:520px; background:#162026; border:1px solid rgba(255,255,255,.1); border-radius:22px 22px 0 0; padding:20px 18px 26px; color:#e9eef0; font-family:var(--ui,system-ui)}
  .demo-sh h3{margin:0 0 6px; font-family:var(--display,Georgia,serif); font-size:22px; font-weight:560}
  .demo-sh p{margin:0 0 14px; font-size:13.5px; line-height:1.45; color:#9fb0b6}
  .demo-sh button{display:block; width:100%; margin-top:8px; padding:13px; border-radius:14px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.05); color:inherit; font:600 14.5px var(--ui,system-ui); cursor:pointer; text-align:left}
  .demo-sh button.gold{background:#e0b15e; color:#1b1b1b; border-color:#e0b15e}
  .demo-sh button small{display:block; font-weight:450; font-size:12px; opacity:.75; margin-top:3px}
  .demo-sh button.gold small{opacity:.85; color:#3a2a0c}
  .demo-busy{position:fixed; inset:0; z-index:80; background:rgba(10,14,16,.82); display:flex; align-items:center; justify-content:center; color:#f2cf82; font:600 15px var(--ui,system-ui)}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  const sc = document.createElement("div"); sc.className = "demo-sc";
  sc.innerHTML = `<div class="demo-sh" role="dialog" aria-label="Versione di prova">
    <h3>🧪 Gruzzolo nel browser</h3>
    <p>È la stessa app che gira sul telefono Android. I dati restano solo in questo browser: niente account, niente server.
    Le notifiche dei pagamenti qui si simulano.</p>
    <button class="gold" data-demo="example">✨ Prova con un esempio<small>Risponde alle domande al posto tuo e aggiunge qualche spesa: vedi subito il Budget pieno</small></button>
    <button data-demo="quiz">📝 Parti da zero<small>Rispondi tu alle domande (5 minuti)</small></button>
    <button data-demo="pay">📲 Simula un pagamento<small>Come se avessi pagato con Google Wallet: compare in «Da confermare»</small></button>
    <button data-demo="reset">↺ Ricomincia<small>Cancella i dati di questo browser</small></button>
    <button data-demo="close">Chiudi</button></div>`;
  document.body.appendChild(sc);
  const fab = document.createElement("button"); fab.className = "demo-fab"; fab.textContent = "🧪 Demo"; document.body.appendChild(fab);
  const open = () => sc.classList.add("open"), close = () => sc.classList.remove("open");
  fab.addEventListener("click", open);
  sc.addEventListener("click", e => { if (e.target === sc) close(); const b = e.target.closest("[data-demo]"); if (b) act(b.dataset.demo); });

  async function act(a){
    close();
    if (a === "close") return;
    if (a === "quiz"){ showTab("budget"); openQuiz(); return; }
    if (a === "pay"){ const p = grzDemoPayment(); showTab("budget"); renderBudget(); toast(`📲 Pagamento di ${money(p.amt)} da ${p.merchant}: confermalo in «Da confermare»`);
      setTimeout(() => { const el = document.getElementById("inbox"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 200); return; }
    if (a === "reset"){ if (!confirm("Cancellare i dati di prova di questo browser?")) return;
      Object.keys(localStorage).filter(k => k.startsWith("grz")).forEach(k => localStorage.removeItem(k)); location.reload(); return; }
    if (a === "example") await example();
  }

  // le risposte dell'esempio (le stesse delle prove automatiche dell'app)
  // lo stipendio arriva tre giorni fa: il mese di prova è quasi tutto davanti
  const pd = String(((new Date().getDate() - 4 + 28) % 28) + 1);
  const P = { net:"1640", payday:pd, payday_hi:pd, buoni:"8", workDays:"5", leftNow:"1480", buoniNow:"20", savedNow:"2400",
    affitto:"450", bollette:"60", bollette_hi:"90", internet:"25", telefono:"8", commute:"8", commute_hi:"8", fuelExtra:"5", fuelExtra_hi:"30",
    insAnnual:"640", kw:"66", maint:"300", spesaWeek:"50", spesaWeek_hi:"80", fuori:"40", fuori_hi:"80",
    salute:"10", salute_hi:"25", casaVarie:"15", casaVarie_hi:"60", weekend:"30", weekend_hi:"70", shopping:"20", shopping_hi:"60", abbon:"0",
    regali:"30", regali_hi:"60", vicePrice:"6", vicePerWeek:"0", vicePerWeek_hi:"0", cash:"0" };
  const C = { replayDone:"si", boughtDone:"si", hasCar:"si", euro:"6", vice:"no", mens:"13" };

  async function example(){
    if (B.setup && !confirm("Sostituire i dati di questo browser con l'esempio?")) return;
    const busy = document.createElement("div"); busy.className = "demo-busy"; busy.textContent = "Preparo l'esempio…"; document.body.appendChild(busy);
    try {
      Object.keys(localStorage).filter(k => k.startsWith("grz") && k !== "grz_demo_seen").forEach(k => localStorage.removeItem(k));
      sessionStorage.setItem("grz_demo_next", "example"); location.reload();
    } catch(e) { busy.remove(); alert("Non sono riuscito a preparare l'esempio: " + e); }
  }

  async function runExample(){
    const busy = document.createElement("div"); busy.className = "demo-busy"; busy.textContent = "Preparo l'esempio…"; document.body.appendChild(busy);
    try {
      for (let i = 0; i < 40 && typeof openQuiz !== "function"; i++) await wait(100);
      showTab("budget"); openQuiz(); await wait(200);
      let rset = false, hset = false;
      for (let guard = 0; guard < 40; guard++){
        const body = document.querySelector("#qzBody");
        body.querySelectorAll("input[data-k]").forEach(i => { if (P[i.dataset.k] != null) i.value = P[i.dataset.k]; });
        for (const [k, v] of Object.entries(C)){ const o = body.querySelector(`.opt[data-k="${k}"][data-v="${v}"]`); if (o && !o.classList.contains("on")) o.click(); }
        const ron = body.querySelector('[data-z="ron"]'); if (ron) ron.click();
        if (document.querySelectorAll("#qzBody .qh-row[data-ri]").length && !rset){ rset = true;
          qz.r.items = [{ ticker:"SWDA.MI", name:"iShares Core MSCI World", quote:2 }, { ticker:"EIMI.MI", name:"iShares Core MSCI EM IMI", quote:1 }]; qz.r.dayOfMonth = 5; renderQuiz(); continue; }
        if (body.querySelector('[data-z="hadd"]') && !hset){ hset = true;
          qz.h = [{ ticker:"SWDA.MI", name:"iShares Core MSCI World", qty:18, avg:92, cur:"EUR" }, { ticker:"EIMI.MI", name:"iShares Core MSCI EM IMI", qty:12, avg:30, cur:"EUR" }, { ticker:"AGGH.MI", name:"iShares Core Global Aggregate Bond", qty:20, avg:4.9, cur:"EUR" }]; renderQuiz(); continue; }
        const done = body.querySelector('[data-z="done"]'); if (done){ done.click(); break; }
        const next = body.querySelector('[data-z="next"]'); if (!next) break;
        next.click(); await wait(60);
      }
      await wait(1200);
      // qualche spesa di oggi e due abbonamenti
      const d = ymd(new Date()), now = Date.now();
      const add = (amt, cat, note, buoni) => { const t = { id: uid("t"), src: "manual", type: "out", d, ts: now, amt, cat, note }; B.tx.push(t); if (buoni) setBuoni(t, buoni); };
      add(34.20, "spesa", "Esselunga", 2); add(4.50, "fuori", "Colazione al bar"); add(50, "benzina", "Benzina");
      const day = k => ((new Date().getDate() + k - 1) % 28) + 1;
      B.rec = [{ id: uid("rc"), n: "Netflix", amt: 13.99, freq: "m", day: day(6), e: "📺", merchant: ["NETFLIX COM"] },
               { id: uid("rc"), n: "Spotify", amt: 11.99, freq: "m", day: day(12), e: "🎵", merchant: [] }];
      recAfter();
      grzDemoPayment(0); grzDemoPayment(7);
      showTab("budget"); renderBudget();
      toast("✨ Esempio pronto: tocca i pezzi del serbatoio, e prova «Da confermare»");
    } catch(e) { console.error(e); alert("Non sono riuscito a preparare l'esempio: " + e); }
    busy.remove();
  }

  window.addEventListener("load", () => setTimeout(() => {
    const next = sessionStorage.getItem("grz_demo_next"); sessionStorage.removeItem("grz_demo_next");
    if (next === "example") { runExample(); return; }
    let seen = false; try { seen = !!localStorage.getItem("grz_demo_seen"); localStorage.setItem("grz_demo_seen", "1"); } catch(e) {}
    if (!seen && !(window.B && B.setup)) open();
  }, 400));
})();
