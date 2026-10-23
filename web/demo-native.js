/* Versione web di prova: fa le veci della parte Android di Gruzzolo.
   Sul telefono i pagamenti arrivano dalle notifiche di Google Wallet o della banca; qui si simulano
   con «📲 Simula un pagamento». Tutto resta nel localStorage di questo browser. */
(function(){
  const KEY = "grz_demo_pending";
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch(e) { return []; } };
  const write = L => { try { localStorage.setItem(KEY, JSON.stringify(L)); } catch(e) {} };
  // negozi di esempio, con la categoria che indovinerebbe l'app vera dal nome
  const SHOPS = [
    ["ESSELUNGA", 23.40, "spesa"], ["CONAD", 31.75, "spesa"], ["ESSO", 50, "benzina"], ["ENI STATION", 45.20, "benzina"],
    ["BAR SPORT", 4.50, "fuori"], ["PIZZERIA DA MARIO", 18, "fuori"], ["NETFLIX.COM", 13.99, ""], ["Pagamento", 0.49, ""],
    ["FARMACIA CENTRALE", 9.80, "salute"], ["ZALANDO", 39.90, "shopping"], ["CINEMA ODEON", 9.50, "weekend"], ["TABACCHERIA", 6, "vizio"]
  ];
  let n = 0;
  function fakePayment(i){
    const s = SHOPS[i != null ? i : Math.floor(Math.random() * SHOPS.length)], ts = Date.now() - (n++) * 60000;
    const p = { id: "demo" + ts, merchant: s[0], amt: s[1], ts, status: "new", cat: s[2], kw: s[2], src: Math.random() < 0.5 ? "wallet" : "fineco", pay: "pay_" + ts };
    const L = read(); L.push(p); write(L); return p;
  }
  const noop = () => {};
  window.GruzzoloNative = {
    demo: true,
    pendingPayments: () => JSON.stringify(read()),
    removePayments: j => { const ids = JSON.parse(j); write(read().filter(p => !ids.includes(p.id))); },
    testPaymentNotification: () => fakePayment(),
    hasNotificationAccess: () => true,
    appNotificationsEnabled: () => true,
    openNotificationAccess: () => alert("Sul telefono qui si apre l'accesso alle notifiche di Android."),
    openAppNotificationSettings: () => alert("Sul telefono qui si aprono le notifiche di Gruzzolo."),
    takeLaunchAction: () => "",
    tidyNotifications: noop, setAskBuoni: noop, setAutoCats: noop, setCategories: noop, setEveningReminder: noop,
    setLastTxDate: noop, setPaymentSettings: noop, setWidgetCats: noop, scheduleReminders: noop, cancelReminders: noop
  };
  window.grzDemoPayment = fakePayment;

  /* Prezzi: nel browser Yahoo Finance non risponde (CORS). Una GitHub Action li scarica ogni giorno in yahoo/
     (web/prezzi.py) e qui rispondo alle richieste dell'app con quei file, tagliati sul periodo chiesto. */
  const realFetch = window.fetch.bind(window), cache = {};
  const fname = (sym, kind) => "yahoo/" + sym.replace(/[^A-Za-z0-9.]/g, "_") + "_" + kind + ".json";
  const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { "Content-Type": "application/json" } });
  async function snap(sym, kind){
    const k = sym + kind; if (!cache[k]) cache[k] = realFetch(fname(sym, kind)).then(r => r.ok ? r.json() : null).catch(() => null);
    return cache[k];
  }
  function cut(j, p1, p2){
    const r = j.chart.result[0], ts = r.timestamp || [], keep = ts.map((t, i) => t >= p1 && t <= p2 ? i : -1).filter(i => i >= 0);
    const pick = a => Array.isArray(a) ? keep.map(i => a[i]) : a;
    const q = (r.indicators.quote || []).map(o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, pick(v)])));
    const adj = (r.indicators.adjclose || []).map(o => ({ adjclose: pick(o.adjclose) }));
    return { chart: { result: [{ meta: r.meta, timestamp: pick(ts), indicators: { quote: q, adjclose: adj } }], error: null } };
  }
  window.fetch = async function(input, init){
    const raw = typeof input === "string" ? input : (input && input.url) || "";
    let url = raw; try { if (!/^https:\/\/query1\.finance\.yahoo\.com/.test(url)) { const m = raw.match(/https?%3A%2F%2Fquery1\.finance\.yahoo\.com[^&]*(&.*)?$/i); if (m) url = decodeURIComponent(raw.slice(raw.indexOf(m[0]))); } } catch(e) {}
    const ch = url.match(/^https:\/\/query1\.finance\.yahoo\.com\/v8\/finance\/chart\/([^?]+)\?(.*)$/);
    if (ch){
      const sym = decodeURIComponent(ch[1]), q = new URLSearchParams(ch[2]);
      if (q.get("range") === "5d"){ const j = await snap(sym, "5d"); return j ? json(j) : json({ chart: { result: null, error: { code: "Not Found" } } }, 404); }
      const p1 = +q.get("period1") || 0, p2 = +q.get("period2") || Date.now() / 1000;
      const j = await snap(sym, q.get("interval") === "1wk" ? "wk" : "d") || await snap(sym, "wk");
      return j ? json(cut(j, p1, p2)) : json({ chart: { result: null, error: { code: "Not Found" } } }, 404);
    }
    if (/query1\.finance\.yahoo\.com\/v1\/finance\/search/.test(url)) return json({ news: [], quotes: [] });
    const mi = raw.match(/^https:\/\/www\.mimit\.gov\.it\/images\/exportCSV\/([\w.-]+\.csv)/);
    if (mi) return realFetch("mimit/" + mi[1]);
    return realFetch(input, init);
  };
})();
