/* grafica-app — componenti HUD animati per web/WebView. Nessuna dipendenza.
   Uso: <link rel="stylesheet" href="hud.css"><script src="hud.js"></script>, poi HUD.radar(canvas, ...) ecc.
   Tutti i canvas sono DPR-aware e si ridimensionano da soli; un solo requestAnimationFrame per tutti. */
(function () {
  const C = {
    bg: "#04070B", panel: "#09111A", line: "#17323D", grid: "#0E222B", cyan: "#00E5FF", teal: "#1DF2B6",
    amber: "#FFB020", red: "#FF3B5C", violet: "#8C7CFF", text: "#D3E9F0", dim: "#5E7884",
  };
  const MONO = getComputedStyle(document.documentElement).getPropertyValue("--mono") || "monospace";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const risk = v => (v < 0.33 ? C.teal : v < 0.6 ? C.amber : C.red);
  const alpha = (hex, a) => hex + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, "0");

  // un solo loop di animazione per tutti i componenti
  const drawers = new Set();
  function loop(t) { drawers.forEach(d => d(t)); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);

  /** Prepara un canvas: dimensione CSS × devicePixelRatio, ridisegno su resize. */
  function surface(canvas, aspect) {
    const ctx = canvas.getContext("2d");
    const s = { ctx, w: 0, h: 0 };
    function fit() {
      const dpr = devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = aspect ? w / aspect : canvas.clientHeight;
      if (aspect) canvas.style.height = h + "px";
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      s.w = w; s.h = h;
    }
    new ResizeObserver(fit).observe(canvas);
    fit();
    return s;
  }

  const GLYPHS = "ABCDEF0123456789#%&@$*<>/\\|";
  /** Testo che si "decifra" passando da glifi casuali (≈0.5 s). */
  function scramble(el, text) {
    text = String(text);
    if (el._scr) clearInterval(el._scr);
    if (reduced) { el.textContent = text; return; }
    let f = 0; const frames = 16;
    el._scr = setInterval(() => {
      const reveal = Math.floor(text.length * f / frames);
      el.textContent = [...text].map((c, i) => (i < reveal || c === " " ? c : GLYPHS[Math.random() * GLYPHS.length | 0])).join("");
      if (++f > frames) { clearInterval(el._scr); el.textContent = text; }
    }, 32);
  }

  /** Radar con sweep. blips: [{angle (gradi, 0=est, orario), radius 0..1, label, color, alert}] */
  function radar(canvas, opts = {}) {
    const s = surface(canvas, 1);
    let blips = opts.blips || [], beam = opts.beam || C.cyan;
    drawers.add(t => {
      const { ctx, w, h } = s; if (!w) return;
      const sweep = reduced ? 300 : (t / 4200 * 360) % 360, pulse = (t % 1800) / 1800;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 * 0.94;
      const P = (rr, deg) => [cx + Math.cos(deg * Math.PI / 180) * rr, cy + Math.sin(deg * Math.PI / 180) * rr];
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      for (let i = 1; i <= 4; i++) { ctx.strokeStyle = C.line; ctx.beginPath(); ctx.arc(cx, cy, r * i / 4, 0, 7); ctx.stroke(); }
      ctx.strokeStyle = alpha(beam, .35); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
      for (let d = 0; d < 360; d += 5) {
        const long = d % 30 === 0, [x1, y1] = P(r, d), [x2, y2] = P(r - (long ? 9 : 4), d);
        ctx.strokeStyle = alpha(C.dim, long ? .8 : .3); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      ctx.setLineDash([4, 6]); ctx.strokeStyle = C.line; ctx.beginPath();
      ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke(); ctx.setLineDash([]);
      // fascio: spicchio di 80° con gradiente conico che sfuma all'indietro
      const g = ctx.createConicGradient((sweep - 80) * Math.PI / 180, cx, cy);
      g.addColorStop(0, alpha(beam, 0)); g.addColorStop(80 / 360, alpha(beam, .38)); g.addColorStop(80 / 360 + 0.0001, alpha(beam, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, (sweep - 80) * Math.PI / 180, sweep * Math.PI / 180); ctx.fill();
      const [bx, by] = P(r, sweep); ctx.strokeStyle = beam; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.stroke();
      ctx.font = `9px ${MONO}`; ctx.textBaseline = "bottom";
      blips.forEach(b => {
        const [x, y] = P(r * b.radius, b.angle);
        const since = ((sweep - b.angle) % 360 + 360) % 360, glow = 1 - since / 360, a = 0.3 + 0.7 * glow * glow;
        if (b.alert) { ctx.strokeStyle = alpha(b.color, (1 - pulse) * .8); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 6 + pulse * 16, 0, 7); ctx.stroke(); }
        ctx.fillStyle = alpha(b.color, a * .25); ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill();
        ctx.fillStyle = alpha(b.color, a); ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill();
        ctx.fillStyle = alpha(b.color, .4 + .6 * a);
        const tw = ctx.measureText(b.label).width;
        const lx = x > cx - 4 ? x + 8 : x - 8 - tw;
        ctx.fillText(b.label, Math.max(2, Math.min(w - tw - 2, lx)), y - 4);   // sempre dentro il canvas
      });
      ctx.strokeStyle = alpha(C.teal, (1 - pulse) * .7); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 4 + pulse * 22, 0, 7); ctx.stroke();
      ctx.fillStyle = C.teal; ctx.beginPath(); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx + 4.8, cy + 3.6); ctx.lineTo(cx - 4.8, cy + 3.6); ctx.fill();
    });
    return { set(b) { blips = b; }, beam(c) { beam = c; } };
  }

  /** Oscilloscopio su finestra fissa. push(v) aggiunge un campione (null = buco). */
  function scope(canvas, opts = {}) {
    const s = surface(canvas);
    const cap = opts.capacity || 60;
    let values = opts.values || [], min = opts.min ?? 0, max = opts.max ?? 100, color = opts.color || C.cyan;
    drawers.add(t => {
      const { ctx, w, h } = s; if (!w) return;
      const blink = 0.3 + 0.7 * Math.abs(Math.sin(t / 600 * Math.PI / 2));
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1; ctx.strokeStyle = C.grid;
      for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(0, h * i / 4); ctx.lineTo(w, h * i / 4); ctx.stroke(); }
      ctx.setLineDash([2, 5]);
      for (let i = 0; i <= 12; i++) { ctx.beginPath(); ctx.moveTo(w * i / 12, 0); ctx.lineTo(w * i / 12, h); ctx.stroke(); }
      ctx.setLineDash([]);
      const step = w / (cap - 1), start = cap - values.length;
      const y = v => h - Math.max(0, Math.min(1, (v - min) / (max - min))) * h;
      const segs = []; let cur = null;
      values.forEach((v, i) => { if (v == null) cur = null; else { if (!cur) segs.push(cur = []); cur.push([(start + i) * step, y(v)]); } });
      segs.forEach(pts => {
        const path = new Path2D(); path.moveTo(...pts[0]);
        for (let i = 1; i < pts.length; i++) { const [px, py] = pts[i - 1], [x, yy] = pts[i]; path.quadraticCurveTo(px, py, (px + x) / 2, (py + yy) / 2); }
        path.lineTo(...pts[pts.length - 1]);
        const fill = new Path2D(path); fill.lineTo(pts[pts.length - 1][0], h); fill.lineTo(pts[0][0], h); fill.closePath();
        const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, alpha(color, .28)); g.addColorStop(1, alpha(color, 0));
        ctx.fillStyle = g; ctx.fill(fill);
        ctx.lineCap = "round"; ctx.strokeStyle = alpha(color, .22); ctx.lineWidth = 7; ctx.stroke(path);
        ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.stroke(path);
      });
      const last = segs.length && values[values.length - 1] != null ? segs[segs.length - 1].at(-1) : null;
      if (last) {
        ctx.strokeStyle = alpha(color, .25); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(last[0], 0); ctx.lineTo(last[0], h); ctx.stroke();
        ctx.fillStyle = alpha(color, .3 * blink); ctx.beginPath(); ctx.arc(...last, 9, 0, 7); ctx.fill();
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(...last, 3, 0, 7); ctx.fill();
      }
    });
    return {
      push(v) { values = values.concat([v]).slice(-cap); },
      set(v) { values = v.slice(-cap); },
      range(a, b) { min = a; max = b; },
      color(c) { color = c; },
    };
  }

  /** Gauge 240° a 32 segmenti con molla elastica. el = contenitore quadrato vuoto. */
  function gauge(el, opts = {}) {
    el.style.position = "relative";
    el.innerHTML = `<canvas class="hud-canvas"></canvas><div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
      <div class="hud-big" style="font-size:26px"></div><div class="hud-label"></div></div>`;
    const s = surface(el.querySelector("canvas"), 1), num = el.querySelector(".hud-big"), lab = el.querySelector(".hud-label");
    let target = opts.value || 0, v = 0, vel = 0;
    let col = opts.color || risk;   // colore per livello (default: rischio); Gruzzolo lo colora per stato del budget
    function text(t, l) { num.textContent = t; lab.textContent = l; }
    text(opts.text ?? "--", opts.label ?? "");
    drawers.add(() => {
      const { ctx, w, h } = s; if (!w) return;
      vel += (target - v) * 0.02; vel *= 0.86; v += vel;           // molla poco smorzata
      const c = col(Math.max(0, v)); num.style.color = c; lab.style.color = c;
      const st = 9, d = Math.min(w, h) - st * 2, cx = w / 2, cy = h / 2, segs = 32, total = 240, a0 = 150, sa = total / segs;
      ctx.clearRect(0, 0, w, h); ctx.lineWidth = st;
      for (let i = 0; i < segs; i++) {
        const pos = i / segs; ctx.strokeStyle = pos < v ? col(pos) : alpha(C.line, .7);
        ctx.beginPath(); ctx.arc(cx, cy, d / 2, (a0 + sa * i) * Math.PI / 180, (a0 + sa * i + sa - 2.2) * Math.PI / 180); ctx.stroke();
      }
      ctx.lineWidth = 1.5; ctx.strokeStyle = alpha(c, .35);
      ctx.beginPath(); ctx.arc(cx, cy, d / 2 - st * 2.4, a0 * Math.PI / 180, (a0 + total * Math.max(0, v)) * Math.PI / 180); ctx.stroke();
    });
    return { set(value, t, l, c) { if (c) col = c; target = Math.max(0, Math.min(1, value)); text(t ?? Math.round(value * 100), l ?? lab.textContent); } };
  }

  /** Barra a blocchi: el = <div class="hud-seg">. */
  function segbar(el, level, color) {
    const n = +el.dataset.n || 14;
    if (el.children.length !== n) el.innerHTML = "<i></i>".repeat(n);
    if (color) el.style.setProperty("--c", color);
    [...el.children].forEach((b, i) => b.classList.toggle("on", i < Math.floor(level * n)));
  }

  /** Contatore che sale fino a `to` (formato %03d). */
  function count(el, to, digits = 3) {
    const from = +el.dataset.v || 0, t0 = performance.now(), dur = reduced ? 0 : 900;
    el.dataset.v = to;
    (function step(t) {
      const p = dur ? Math.min(1, (t - t0) / dur) : 1, e = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(from + (to - from) * e)).padStart(digits, "0");
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  let toastEl, toastT;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "hud-toast"; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("show"), 4000);
  }

  function clock(el) {
    const tick = () => { el.textContent = new Date().toLocaleTimeString("it-IT", { hour12: false }); };
    tick(); setInterval(tick, 1000);
  }

  /** Tab bar: <nav class="hud-tabs"><button data-tab="x"><b>01</b>rete</button>...</nav> */
  function tabs(nav, onSelect) {
    const ind = document.createElement("div"); ind.className = "ind"; nav.appendChild(ind);
    const btns = [...nav.querySelectorAll("button")];
    function select(b) {
      btns.forEach(x => x.classList.toggle("on", x === b));
      ind.style.width = b.offsetWidth + "px"; ind.style.transform = `translateX(${b.offsetLeft}px)`;
      onSelect && onSelect(b.dataset.tab);
    }
    btns.forEach(b => b.addEventListener("click", () => select(b)));
    requestAnimationFrame(() => select(btns.find(b => b.classList.contains("on")) || btns[0]));
    return { select: name => select(btns.find(b => b.dataset.tab === name)) };
  }

  /** Riga di log in cima a un .hud-log (max righe), la nuova si decifra. level: info|ok|warn|alert */
  function log(container, tag, text, level = "info", max = 12) {
    const col = { info: C.dim, ok: C.teal, warn: C.amber, alert: C.red }[level] || C.dim;
    const r = document.createElement("div"); r.className = "r";
    r.innerHTML = `<span>${new Date().toLocaleTimeString("it-IT", { hour12: false })}</span><span style="color:${col}">${tag}</span><span></span>`;
    container.prepend(r); scramble(r.lastChild, text);
    [...container.querySelectorAll(".r")].slice(max).forEach(x => x.remove());
  }

  window.HUD = { C, risk, alpha, scramble, radar, scope, gauge, segbar, count, toast, clock, tabs, log };
})();
