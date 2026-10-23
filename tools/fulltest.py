import json, sys, subprocess, time
from playwright.sync_api import sync_playwright

ADB = "adb"
def sh(cmd): return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout

def connect():
    pid = sh(f"{ADB} shell pidof it.gruzzolo.dev").strip()
    sh(f"{ADB} forward tcp:9334 localabstract:webview_devtools_remote_{pid}")

results = []
def check(name, ok, info=""):
    results.append((name, bool(ok), info))
    print(("PASS " if ok else "FAIL ") + name + ("  -- " + str(info)[:300] if info else ""), flush=True)

PROFILE = dict(net="1640", payday="4", payday_hi="6", buoni="8", workDays="5", leftNow="663", buoniNow="20", savedNow="307",
  affitto="0", bollette="0", bollette_hi="0", internet="0", telefono="32", commute="8", commute_hi="8", fuelExtra="5", fuelExtra_hi="30",
  insAnnual="640", insDue="2027-08-20", kw="66", bolloDue="2026-12-01", maint="300", spesaWeek="50", spesaWeek_hi="80", fuori="40", fuori_hi="80",
  salute="10", salute_hi="25", casaVarie="15", casaVarie_hi="80", weekend="30", weekend_hi="70", shopping="20", shopping_hi="60", abbon="32",
  regali="50", regali_hi="100", vicePrice="6", vicePerWeek="0.5", vicePerWeek_hi="0.5", cash="0")
CHOICES = dict(replayDone="si", boughtDone="si", hasCar="si", euro="6", vice="sigarette", mens="13")

def run(page, js, arg=None):
    return page.evaluate("async (arg) => {" + js + "}", arg)

def main(stage):
    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp("http://localhost:9334")
        page = b.contexts[0].pages[0]
        errs = []
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
        if stage == "onboard":
            # domande, passo per passo come un utente
            r = run(page, """
              if(!document.querySelector('#qzScrim.open')) openQuiz();
              const P=arg.p, C=arg.c, seen=[];
              for(let guard=0; guard<30; guard++){
                const body=document.querySelector('#qzBody'); seen.push((body.querySelector('h2')||{}).innerText);
                body.querySelectorAll('input[data-k]').forEach(i=>{ if(P[i.dataset.k]!=null){ i.value=P[i.dataset.k]; } });
                for(const [k,v] of Object.entries(C)){ const o=body.querySelector(`.opt[data-k="${k}"][data-v="${v}"]`); if(o && !o.classList.contains('on')) o.click(); }
                // Replay: attivo con 2 SWDA + 1 EIMI il giorno 6
                if(body.querySelector('[data-z="ron"]')) { body.querySelector('[data-z="ron"]').click(); }
                const rows=document.querySelectorAll('#qzBody .qh-row[data-ri]');
                if(rows.length && !window.__rset){ window.__rset=1; qz.r.items=[{ticker:"SWDA.MI",name:"iShares Core MSCI World",quote:2},{ticker:"EIMI.MI",name:"iShares Core MSCI EM IMI",quote:1}]; qz.r.dayOfMonth=6; renderQuiz(); continue; }
                if(body.querySelector('[data-z="hadd"]') && !window.__hset){ window.__hset=1;
                  qz.h=[{ticker:"SWDA.MI",name:"iShares Core MSCI World",qty:2,avg:128,cur:"EUR"},{ticker:"EIMI.MI",name:"iShares Core MSCI EM IMI",qty:1,avg:45,cur:"EUR"}]; renderQuiz(); continue; }
                const d=document.querySelector('#qzBody [data-z="done"]'); if(d){ const sum=body.innerText; d.click(); await new Promise(r=>setTimeout(r,2500)); return { steps:seen, sum:sum.slice(0,900) }; }
                const n=document.querySelector('#qzBody [data-z="next"]'); if(!n) return { steps:seen, err:"no next" };
                n.click(); await new Promise(r=>setTimeout(r,150));
              }
              return { steps:seen, err:"loop" };""", {"p": PROFILE, "c": CHOICES})
            check("domande completate", "sum" in r, r.get("err") or r.get("steps"))
            s = run(page, "return { setup:!!B.setup, net:B.ans.net, buoni:B.buoni&&B.buoni.bal, start:B.start, replay:replay, hold:holdings.map(h=>h.ticker+':'+h.qty), mode:B.mode };")
            check("risposte salvate (1640, 20 buoni, inizio a metà mese)", s["setup"] and s["net"] == 1640 and s["buoni"] == 20 and s["start"] and s["start"]["left"] == 663, s)
            check("Replay il 6 con 2 SWDA + 1 EIMI", s["replay"]["enabled"] and s["replay"]["dayOfMonth"] == 6 and len(s["replay"]["items"]) == 2, s["replay"])
            check("posizioni salvate", s["hold"] == ["SWDA.MI:2", "EIMI.MI:1"], s["hold"])
        elif stage == "budget":
            r = run(page, """
              showTab('budget'); renderBudget(); await new Promise(r=>setTimeout(r,800));
              const st=bStatus(), P=st.P, txt=document.getElementById('budBody').innerText;
              return { free:st.free, goal:P.goal, save:P.save, wants:P.wants, buoni:P.buoni, partial:P.partial, hasLq:document.querySelectorAll('.t4-tank .t4-col').length===4 && Math.abs(bStatus().remaining-bStatus().groups.reduce((a,g)=>a+g.left,0))<0.01,
                sections:['libero','weekend','spesa','ric','goal'].filter(k=>(BX_SEC[k]||'').length>50).concat(document.getElementById('bx-mov')?['mov']:[]), fold:(BX_SEC.goal||'').includes('bfold'),
                noPatr:!txt.includes('Il tuo patrimonio'),
                modesInBudget:txt.includes('Massimo') && txt.includes('50/30/20'), txt:txt.slice(0,400) };""")
            check("Budget: serbatoio diviso nei 4 budget, la somma fa i soldi che restano", r["hasLq"], r["txt"][:120])
            check("finestre dei cerchi (libero, weekend, spesa, ricorrenti, obiettivo) e movimenti nella pagina", len(r["sections"]) == 6, r["sections"])
            check("Budget senza patrimonio", r["noPatr"])
            check("primo mese: buoni 160 € contati, niente obiettivo di risparmio (solo gestire)", r["partial"] and abs(r["buoni"] - 160) < 0.01 and r["goal"] == 0 and r["save"] == 0 and r["wants"] > 400, {k: r[k] for k in ("buoni", "goal", "save", "wants")})
            check("conti a tendina", r["fold"])
            check("modalità non più nel Budget", not r["modesInBudget"])
            # spesa con il +: 22,40 € al supermercato con 5 buoni
            r = run(page, """
              const before=bStatus(); openQuickAdd(); await new Promise(r=>setTimeout(r,300));
              document.querySelector('#qaAmt').value='22,40'; document.querySelector('#qaCats [data-c="spesa"]').click(); await new Promise(r=>setTimeout(r,200));
              const qb=document.querySelector('#qaBuoni [data-qb="5"]'); if(qb) qb.click(); await new Promise(r=>setTimeout(r,200));
              document.querySelector('#qaSave').click(); await new Promise(r=>setTimeout(r,500));
              const t=B.tx[B.tx.length-1], after=bStatus();
              return { amt:t.amt, buoniN:t.buoniN, bal:B.buoni.bal, spesa:after.rows.find(x=>x.c.id==='spesa').s, freeBefore:before.free, freeAfter:after.free };""")
            check("spesa con 5 buoni: totale 62,40 €, saldo buoni 15", abs(r["amt"] - 62.4) < 0.01 and r["buoniN"] == 5 and r["bal"] == 15, r)
            check("la spesa (necessaria) non tocca il tempo libero", abs(r["freeBefore"] - r["freeAfter"]) < 0.01, r)
            r = run(page, """
              openQuickAdd(); await new Promise(r=>setTimeout(r,300)); document.querySelector('#qaAmt').value='35'; document.querySelector('#qaCats [data-c="weekend"]').click();
              await new Promise(r=>setTimeout(r,150)); document.querySelector('#qaSave').click(); await new Promise(r=>setTimeout(r,400));
              const st=bStatus(); const w=st.rows.find(x=>x.c.id==='weekend');
              openSec('weekend'); await new Promise(r=>setTimeout(r,200)); const chips=[document.getElementById('secBody').innerText]; closeSec();
              return { free:st.free, wk:w.s, chips };""")
            check("weekend da 35 € scala il tempo libero e compare tra le categorie", r["wk"] == 35 and any("Weekend e uscite" in c and "35" in c for c in r["chips"]), r)
            # modifica ed eliminazione di una spesa
            r = run(page, """
              const t=B.tx.find(x=>x.cat==='weekend'); openQuickAdd(t.id); await new Promise(r=>setTimeout(r,300));
              document.querySelector('#qaAmt').value='30'; document.querySelector('#qaSave').click(); await new Promise(r=>setTimeout(r,300));
              const a=B.tx.find(x=>x.id===t.id).amt; window.confirm=()=>true; openQuickAdd(t.id); await new Promise(r=>setTimeout(r,300)); document.querySelector('#qaDel').click(); await new Promise(r=>setTimeout(r,300));
              return { edited:a, gone:!B.tx.find(x=>x.id===t.id) };""")
            check("modifica (35→30) ed eliminazione di una spesa", r["edited"] == 30 and r["gone"], r)
            # imprevisto: obiettivo fisso, cala il previsto
            r = run(page, """
              const g0=bStatus().P.goal; B.tx.push({ id:'tImp', d:ymd(today0()), type:'out', cat:'imprevisto', amt:80, note:'Gomma', src:'manual' }); bSave();
              const st=bStatus(); const g1=st.P.goal; B.tx=B.tx.filter(x=>x.id!=='tImp'); bSave(); return { g0, g1, free:st.free };""")
            check("imprevisto: obiettivo del mese resta fisso", abs(r["g0"] - r["g1"]) < 0.01, r)
            # spese fisse: giorno e «Pagato?»
            r = run(page, """
              B.cats.find(c=>c.id==='abbon').day=new Date().getDate(); bSave(); renderBudget(); openSec('ric'); await new Promise(r=>setTimeout(r,300));
              const pay=document.querySelector('#secBody [data-fxpay="abbon"]'); const had=!!pay; if(pay) pay.click(); await new Promise(r=>setTimeout(r,300)); closeSec();
              return { day:B.cats.find(c=>c.id==='abbon').day, had, paid:B.tx.some(t=>t.cat==='abbon') };""")
            check("spesa fissa: giorno salvato e «Pagato?» la segna", r.get("day") and r.get("had") and r.get("paid"), r)
            # giorno per giorno e salto alle sezioni
            r = run(page, """
              const i=ST.lastBud.findIndex(x=>x.sec==='libero'); document.querySelector(`[data-story="${i}"][data-kind="bud"]`).click(); await new Promise(r=>setTimeout(r,400));
              const open=document.getElementById('secScrim').classList.contains('open');
              const d=document.querySelector('#secBody [data-day]'); d.dispatchEvent(new MouseEvent('click',{bubbles:true})); await new Promise(r=>setTimeout(r,400));
              const out={ open, title:document.getElementById('secTitle').innerText, day:!!document.querySelector('#secBody .dday'), still:document.getElementById('secScrim').classList.contains('open') };
              window.grzBack(); out.closed=!document.getElementById('secScrim').classList.contains('open'); return out;""")
            check("cerchio «Giorni» apre la finestra, si tocca un giorno, Indietro la chiude", r["open"] and r["day"] and r["still"] and r["closed"], r)
            # barra delle sezioni: solo icone, centrata, senza scorrere
            r = run(page, """
              const j=document.querySelector('.stories[data-kind="bud"]'), bs=[...j.querySelectorAll('.st-ring')];
              const r0=bs[0].getBoundingClientRect(), r1=bs[bs.length-1].getBoundingClientRect(), jr=j.getBoundingClientRect();
              return { n:bs.length, fits:j.scrollWidth<=j.clientWidth+1, sym:Math.abs((r0.left-jr.left)-(jr.right-r1.right)), jump:!!document.querySelector('.bjump') };""")
            check("cerchi in alto: centrati, tutti visibili, niente barra sotto", r["n"] == 5 and r["fits"] and r["sym"] < 3 and not r["jump"], r)
            # buoni con il conto a 0: si possono usare lo stesso (pranzo pronto con 1 buono)
            r = run(page, """
              B.buoni.bal=0; bSave(); openQuickAdd(null,'pasto'); await new Promise(r=>setTimeout(r,300));
              const chips=[...document.querySelectorAll('#qaBuoni [data-qb]')].length, fix=!!document.querySelector('#qaBuoni [data-b="buoniFix"]');
              document.getElementById('qaAmt').value='3,50'; document.querySelector('#qaBuoni [data-qb="1"]').click(); await new Promise(r=>setTimeout(r,200));
              document.getElementById('qaSave').click(); await new Promise(r=>setTimeout(r,300));
              const t=B.tx[B.tx.length-1]; const out={ chips, fix, amt:t.amt, cat:t.cat, buoniN:t.buoniN, bal:B.buoni.bal };
              B.tx=B.tx.filter(x=>x.id!==t.id); B.buoni.bal=15; bSave(); renderBudget(); return out;""")
            check("buoni con conto a 0: pranzo 3,50 € + 1 buono = 11,50 €", r["chips"] >= 5 and r["fix"] and abs(r["amt"] - 11.5) < 0.01 and r["cat"] == "pasto" and r["buoniN"] == 1 and r["bal"] == 0, r)
        elif stage == "notif_check":
            r = run(page, """
              await new Promise(r=>setTimeout(r,500)); const P=natPending(); return P.map(p=>({ m:p.merchant, a:p.amt, cat:p.cat, defer:p.defer, ask:p.askBuoni, st:p.status }));""")
            print(json.dumps(r, ensure_ascii=False))
            esso=[x for x in r if x["m"].lower().startswith("esso")]
            sup=[x for x in r if "esselunga" in x["m"].lower()]
            check("pagamento Esso letto (benzina)", esso and esso[0]["cat"] == "benzina", esso)
            check("Esselunga subito da confermare come Spesa (niente attesa, niente Schiscetta)", sup and sup[0]["cat"] == "spesa" and not sup[0].get("defer") and sup[0]["st"] == "new", sup)
            r = run(page, """ showTab('budget'); renderBudget(); await new Promise(r=>setTimeout(r,400)); const ib=document.getElementById('inbox'); return { inbox:ib?ib.innerText:'', sc:/Schiscetta|spese.php/.test(document.getElementById('page-impostazioni').innerHTML+(ib?ib.innerHTML:'')) }; """)
            check("Esselunga compare in «Da confermare» e Schiscetta non è nominata da nessuna parte", "Esselunga" in r["inbox"] and not r["sc"], r)
        elif stage == "notif_import":
            r = run(page, """ const n=importNativePayments(); bSave(); renderBudget(); return { n, tx:B.tx.filter(t=>t.src==='wallet'||t.src==='fineco').map(t=>t.note+' '+t.amt+' '+t.cat) };""")
            check("pagamento confermato dalla notifica entra nel budget", r["n"] >= 1 and any("Esso" in t for t in r["tx"]), r)
        elif stage == "tabs":
            r = run(page, """
              const out={};
              showTab('portafoglio'); render(); await new Promise(r=>setTimeout(r,7000));
              out.pf=!!FZ.chart; out.pfTxt=(document.getElementById('fzHead')||{}).innerText||'';
              out.pfTabs=[...document.querySelectorAll('[data-pfr]')].map(b=>b.dataset.pfr); out.heroFirst=!!document.querySelector('#fzHost .fz-val') && document.getElementById('fzHost').getBoundingClientRect().top<document.getElementById('potHost').getBoundingClientRect().top;
              document.querySelector('[data-pfr="Totale"]').click(); await new Promise(r=>setTimeout(r,4000)); out.tot=!!FZ.chart;
              document.querySelector('[data-pfr="1S"]').click(); await new Promise(r=>setTimeout(r,3000)); out.wk=(PF.data||[]).length;
              out.fz=!!document.getElementById('fzCanvas'); out.fzCap=(document.getElementById('fzCap')||{}).innerText;
              document.querySelector('[data-fz="2"]').click(); await new Promise(r=>setTimeout(r,800)); out.fz20=document.getElementById('fzCap').innerText;
              await new Promise(r=>setTimeout(r,6000)); const sc=document.getElementById('page-portafoglio').innerText; out.scopri=['Notizie','Idee del momento','Follia'].filter(k=>sc.includes(k)); out.noCome=!sc.includes('Come vanno');
              out.spcx=sc.includes('SpaceX');
              showTab('piano'); renderPiano(); await new Promise(r=>setTimeout(r,1500)); const pt=document.getElementById('planBody').innerText; out.piano=pt.slice(0,200);
              out.boost=document.querySelectorAll('#planBody .pn-card').length===5;
              showTab('dati'); dtView('vita'); await new Promise(r=>setTimeout(r,9000)); const dt=document.getElementById('datiBody').innerText; out.dati=['Benzina','Gasolio','Luce','Gas','Affitti','case','Cibo','Prezzi in generale'].filter(k=>dt.includes(k)); out.server=DT.es&&DT.es.server;
              showTab('stat'); await new Promise(r=>setTimeout(r,1200)); out.stat=[];
              for(const [v,k,re] of [['risp','risparmi',/patrimonio/i],['port','portafoglio',/rischio del portafoglio/i],['global','mercati',/azioni nel mondo/i]]){ document.querySelector(`[data-st="sub"][data-v="${v}"]`).click();
                for(let i=0;i<25 && !(re.test(document.getElementById('statContent').innerText) && !/…/.test(document.querySelector('#statContent .fz-val b')?.innerText||'…'));i++) await new Promise(r=>setTimeout(r,600));
                if(re.test(document.getElementById('statContent').innerText)) out.stat.push(k); }
              out.stat2=document.querySelectorAll('#statContent .st-g .st-sp').length; document.querySelector('[data-st="sub"][data-v="risp"]').click();
              showTab('impostazioni'); await new Promise(r=>setTimeout(r,600)); out.modes=document.getElementById('sModes').innerText.includes('Su misura');
              const m=document.querySelector('#sModes [data-b="mode"][data-v="max"]'); const g0=bStatus().P.goal; if(m){ m.click(); await new Promise(r=>setTimeout(r,300)); }
              out.modeChanged=B.mode==='max'; out.goalMoved=Math.round(g0)+'→'+Math.round(bStatus().P.goal);
              const c=document.querySelector('#sModes [data-b="mode"][data-v="custom"]'); if(c) c.click();
              showTab('notizie'); await new Promise(r=>setTimeout(r,4000)); out.news=(document.getElementById('newsList')||{}).innerText?.slice(0,120);
              document.getElementById('moreBtn').click(); await new Promise(r=>setTimeout(r,300)); out.more=document.querySelector('#moreScrim').classList.contains('open'); closeM('#moreScrim');
              showTab('budget'); return out;""")
            check("Portafoglio: valore sopra, grafico dietro le monete, periodi 1S 1M 1A Totale", r["pf"] and r["heroFirst"] and r["pfTabs"] == ["1S","1M","1A","Totale"] and r["tot"] and 2 <= r["wk"] <= 7, {k:r[k] for k in ("pfTabs","heroFirst","tot","wk")})
            check("Portafoglio: forziere con una moneta per quota", r["fz"] and "1 moneta = 1 quota" in (r["fzCap"] or ""), r["fzCap"])
            check("Portafoglio: vista 20 anni", "20 anni" in r["fz20"], r["fz20"])
            check("Scopri: notizie, idee, Follia con SpaceX, senza «Come vanno»", len(r["scopri"]) == 3 and r["spcx"] and r["noCome"], r["scopri"])
            check("Piano disegnato con 5 piani a confronto", r["piano"] and r.get("boost"), r["piano"][:100])
            check("Dati: 8 schede, dallo storico del server", len(r["dati"]) == 8 and r["server"], (r["dati"], r["server"]))
            check("I miei dati: Risparmi, Portafoglio (rischio) e Mercati (con grafici) nel nuovo stile", len(r["stat"]) == 3 and r["stat2"] >= 5, (r["stat"], r["stat2"]))
            check("Impostazioni: modalità di risparmio modificabile", r["modes"] and r["modeChanged"], r["goalMoved"])
            check("Notizie caricate", r["news"] and "Cerco" not in r["news"], r["news"])
            check("Rotella in alto apre il menu", r["more"])
            r = run(page, """
              showTab('portafoglio'); await new Promise(r=>setTimeout(r,1500));
              const h=FZ.hits[0], c=document.getElementById('fzCanvas').getBoundingClientRect(); fzTap(c.left+(h.x0+h.x1)/2, c.top+(h.y0+h.y1)/2); await new Promise(r=>setTimeout(r,3500));
              const sel=PF.sel, head=document.getElementById('fzHead').innerText; document.querySelector('[data-fzall]').click(); await new Promise(r=>setTimeout(r,300));
              const q0=holdings.reduce((a,h)=>a+h.qty,0); replay.applied='2000-01'; render(); await new Promise(r=>setTimeout(r,500)); const q1=holdings.reduce((a,h)=>a+h.qty,0); render(); const q1b=holdings.reduce((a,h)=>a+h.qty,0);
              PL.pot=500; plSave(); mountPot(); const before=invMonth(); document.querySelector('[data-pot="buy"]').click(); await new Promise(r=>setTimeout(r,300));
              const prop=INV.L.reduce((a,x)=>a+x.n*x.px,0); document.querySelector('[data-inv="ok"]').click(); await new Promise(r=>setTimeout(r,600));
              return { sel, head:head.slice(0,60), back:PF.sel, q0, q1, q1b, prop, avail:before.toInvest, pot:PL.pot, left:invMonth().toInvest, groups:FZ.groups.length };""")
            check("tocco su una pila: grafico di quell'ETF, poi di nuovo tutto", r["sel"] and r["sel"].split(".")[0] in r["head"] and r["back"] is None, r)
            check("Replay del mese: le quote entrano da sole, una volta sola", r["q1"] == r["q0"] + 3 and r["q1b"] == r["q1"], r)
            check("investimento del mese: proposta entro il da investire, prima gli avanzi, poi scende", 0 < r["prop"] <= r["avail"] + 0.01 and abs(r["pot"] - max(0, 500 - r["prop"])) < 0.02 and abs(r["left"] - (r["avail"] - r["prop"])) < 0.05, r)
        elif stage == "update":
            # aggiornamenti dall'app, con un Native finto: più nuova → avviso e update(url); senza permesso → allowInstall; uguale → niente
            r = run(page, """
              const realN=updNative, realFetch=window.fetch; let called=null;
              const fake={ appVersion:()=>JSON.stringify({code:100,name:"1.0.test"}), canInstall:()=>true, allowInstall:()=>{ called="allow"; }, update:(u)=>{ called=u; } };
              updNative=()=>fake; UPD.url='https://example.com/versione.json'; window.fetch=async()=>({ ok:true, json:async()=>({ code:101, name:"1.0.nuova", url:"https://example.com/x/g.apk", note:"prova" }) });
              const out={}; await checkUpdate(true); const ban=document.getElementById('updBanner'); out.banner=ban&&ban.innerText;
              ban.querySelector('[data-upd="go"]').click(); out.called=called; window.__updateDone(null);
              fake.canInstall=()=>false; called=null; UPD.busy=false; doUpdate(); out.noPerm=called; UPD.waitPerm=false;
              window.fetch=async()=>({ ok:true, json:async()=>({ code:100, name:"1.0.test", url:"https://x" }) }); await checkUpdate(true); out.same=!!document.getElementById('updBanner');
              updNative=realN; window.fetch=realFetch; return out;""")
            check("aggiornamento: versione più nuova → avviso con «i tuoi dati restano»", r["banner"] and "dati restano" in r["banner"], r)
            check("aggiornamento: «Aggiorna» scarica dall'indirizzo pubblicato", r["called"] == "https://example.com/x/g.apk", r)
            check("aggiornamento: senza permesso apre la pagina del permesso", r["noPerm"] == "allow", r)
            check("aggiornamento: stessa versione → nessun avviso", not r["same"], r)
        elif stage == "nuove":
            # Dati con due schede, Piano nuovo, Sfide
            r = run(page, """
              const out={}; showTab('dati'); await new Promise(r=>setTimeout(r,800)); dtView('mine'); await new Promise(r=>setTimeout(r,1500));
              out.mine=document.getElementById('dtMine').style.display!=='none' && document.getElementById('statBody').innerText.length>50;
              dtView('vita'); for(let i=0;i<20 && !/benzina/i.test(document.getElementById('datiBody').innerText);i++) await new Promise(r=>setTimeout(r,1000)); out.vita=/benzina/i.test(document.getElementById('datiBody').innerText);
              showTab('piano'); await new Promise(r=>setTimeout(r,4000)); const pb=document.getElementById('planBody');
              out.plans=pb.querySelectorAll('.pn-card').length; out.infl=(pb.querySelector('.pn-ds')||{}).innerText||'';
              const m0_=document.getElementById('pnM').innerText, b0=pb.querySelector('.pn-card.on .pn-big b').innerText, rg=document.getElementById('pnRange');
              rg.value=+rg.value+200; rg.dispatchEvent(new Event('input',{bubbles:true})); await new Promise(r=>setTimeout(r,400));
              out.mUp=document.getElementById('pnM').innerText!==m0_ && document.querySelector('.pn-card.on .pn-big b').innerText!==b0 && document.getElementById('pnRange')===rg;
              out.noLev=!pb.querySelector('.pn-lev') && !/vita di tutti i giorni/i.test(pb.innerText); rg.dispatchEvent(new Event('change',{bubbles:true})); await new Promise(r=>setTimeout(r,600)); out.reset=!!document.querySelector('[data-pn="reset"]'); document.querySelector('[data-pn="reset"]').click(); await new Promise(r=>setTimeout(r,500)); out.back=PL.nm==null;
              showTab('sfide'); await new Promise(r=>setTimeout(r,800)); const sb=document.getElementById('sfBody').innerText; out.sfide=/le tue sfide/i.test(sb) && document.querySelectorAll('.sf-c').length>=3;
              out.fakeWin=document.querySelectorAll('.sf-c.won').length;
              showTab('budget'); return out;""")
            check("Dati: «I miei dati» e «Costo della vita»", r["mine"] and r["vita"], r)
            check("Piano: 5 piani a confronto con la tua inflazione (fra 1% e 4,5%)", r["plans"] == 5 and "inflazione" in r["infl"], r)
            check("Piano: il cursore cambia mese e piani mentre lo muovi, senza «vita di tutti i giorni»", r["mUp"] and r["noLev"] and r["reset"] and r["back"], r)
            check("Sfide: scheda con almeno 3 sfide, nessuna vinta appena iniziata", r["sfide"] and r["fakeWin"] == 0, r)
        elif stage == "persist":
            r = run(page, "return { setup:!!B.setup, tx:B.tx.length, start:B.start&&B.start.date, bal:B.buoni.bal, plans:Object.keys(B.plans||{}), net:B.ans.net };")
            print(json.dumps(r))
            check("dopo l'aggiornamento i dati ci sono ancora", r["setup"] and r["tx"] >= 2 and r["start"] and r["bal"] == 15, r)
        bad = [e for e in errs if "favicon" not in e and "ERR_" not in e and "Failed to load resource" not in e]
        check(f"nessun errore JavaScript ({stage})", not bad, bad[:5])

if __name__ == "__main__":
    main(sys.argv[1])
    print("RESULT", sum(1 for r in results if r[1]), "/", len(results))
