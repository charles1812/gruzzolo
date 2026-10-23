package it.gruzzolo.app;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.Date;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Motore notturno: gira di notte con il telefono in carica, inattivo e sul Wi-Fi (EngineWorker).
 *  1. dati      - prezzi mensili degli ETF del piano e dell'universo satellite (Yahoo), storico allungato
 *  2. segnale   - verifica sui dati veri se il momentum sui versamenti funziona ancora
 *  3. scenari   - 20.000 futuri possibili (bootstrap a blocchi di 12 mesi) per il profilo e l'obiettivo
 *  4. notizie   - titoli sulle posizioni e sentiment con un dizionario finanziario (tutto nel telefono)
 * Risultati in files/engine/*.json, letti dalla web app con GruzzoloNative.readEngine(nome).
 */
public final class Engine {

    private Engine() {}

    public static final String[] CORE = { "SWDA.MI", "EIMI.MI", "EUNA.DE", "XEON.MI" };
    /** ETF UCITS comprabili da un conto italiano: 10 settori mondiali, small cap, emergenti, Giappone, Europa, oro */
    public static final String[] SAT = { "XDWT.DE", "XDWH.DE", "XDWF.DE", "XDWI.DE", "XDWC.DE", "XDWS.DE", "XDWU.DE", "XDW0.DE",
            "XDWM.DE", "XWTS.DE", "IUSN.DE", "EIMI.MI", "IJPA.AS", "SMEA.MI", "4GLD.DE" };
    static final double TAX = 0.26;

    // ------------------------------------------------------------ file
    static File dir(Context c) { File d = new File(c.getFilesDir(), "engine"); if (!d.exists()) d.mkdirs(); return d; }

    public static String read(Context c, String name) {
        try {
            File f = new File(dir(c), name + ".json");
            if (!f.exists()) return "";
            byte[] b = new byte[(int) f.length()];
            try (InputStream in = new java.io.FileInputStream(f)) { int o = 0, n; while (o < b.length && (n = in.read(b, o, b.length - o)) > 0) o += n; }
            return new String(b, StandardCharsets.UTF_8);
        } catch (Exception e) { return ""; }
    }

    static void write(Context c, String name, String data) throws Exception {
        File tmp = new File(dir(c), name + ".tmp"), f = new File(dir(c), name + ".json");
        try (FileOutputStream o = new FileOutputStream(tmp)) { o.write(data.getBytes(StandardCharsets.UTF_8)); }
        if (!tmp.renameTo(f)) { f.delete(); tmp.renameTo(f); }
    }

    static String http(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) Gruzzolo/1.0");
        c.setRequestProperty("Accept", "application/json,application/rss+xml,text/xml,*/*");
        c.setConnectTimeout(15000); c.setReadTimeout(20000);
        int code = c.getResponseCode();
        if (code >= 400) throw new Exception("HTTP " + code + " " + url);
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }

    static String ym(Calendar c) { return String.format(Locale.ROOT, "%04d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1); }
    static String thisMonth() { return ym(Calendar.getInstance()); }

    // ------------------------------------------------------------ 1. dati
    /** {"YYYY-MM": prezzo rettificato di fine mese}, mese in corso escluso */
    static Map<String, Double> monthly(String sym) throws Exception {
        String js = http("https://query1.finance.yahoo.com/v8/finance/chart/" + URLEncoder.encode(sym, "UTF-8") + "?interval=1mo&range=max");
        JSONObject r = new JSONObject(js).getJSONObject("chart").getJSONArray("result").getJSONObject(0);
        JSONArray ts = r.getJSONArray("timestamp");
        JSONObject ind = r.getJSONObject("indicators");
        JSONArray adj = ind.has("adjclose") ? ind.getJSONArray("adjclose").getJSONObject(0).getJSONArray("adjclose")
                : ind.getJSONArray("quote").getJSONObject(0).getJSONArray("close");
        long off = r.getJSONObject("meta").optLong("gmtoffset", 0);
        Map<String, Double> out = new HashMap<>();
        Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        String cur = thisMonth();
        for (int i = 0; i < ts.length(); i++) {
            if (adj.isNull(i)) continue;
            double p = adj.getDouble(i); if (!(p > 0)) continue;
            cal.setTimeInMillis((ts.getLong(i) + off + 6 * 3600) * 1000L);
            String k = ym(cal);
            if (k.compareTo(cur) < 0) out.put(k, p);
        }
        return out;
    }

    static JSONObject taskData(Context c, JSONObject log) throws Exception {
        JSONObject prices = new JSONObject();
        List<String> all = new ArrayList<>(Arrays.asList(CORE));
        for (String s : SAT) if (!all.contains(s)) all.add(s);
        int ok = 0;
        for (String s : all) {
            try { prices.put(s, new JSONObject(monthly(s))); ok++; } catch (Exception e) { log.put("err_" + s, e.getMessage()); }
            Thread.sleep(400);
        }
        prices.put("_ts", System.currentTimeMillis());
        write(c, "prices", prices.toString());
        // storico allungato con i mesi nuovi
        JSONObject hist = new JSONObject(readAsset(c, "storico.json"));
        String engineHist = read(c, "storico");
        if (!engineHist.isEmpty()) { JSONObject e = new JSONObject(engineHist); if (e.optString("to").compareTo(hist.optString("to")) > 0) hist = e; }
        String[][] map = { { "SWDA", "SWDA.MI" }, { "EIMI", "EIMI.MI" }, { "AGGH", "EUNA.DE" }, { "XEON", "XEON.MI" } };
        JSONArray months = hist.getJSONArray("months");
        String last = hist.getString("to");
        int added = 0;
        while (true) {
            Calendar n = Calendar.getInstance(); n.setTime(new SimpleDateFormat("yyyy-MM", Locale.ROOT).parse(last)); n.add(Calendar.MONTH, 1);
            String next = ym(n);
            if (next.compareTo(thisMonth()) >= 0) break;
            double[] r = new double[4]; boolean all4 = true;
            for (int i = 0; i < 4; i++) {
                JSONObject p = prices.optJSONObject(map[i][1]);
                if (p == null || !p.has(next) || !p.has(last)) { all4 = false; break; }
                r[i] = p.getDouble(next) / p.getDouble(last) - 1;
            }
            if (!all4) break;
            months.put(next);
            for (int i = 0; i < 4; i++) hist.getJSONObject("r").getJSONArray(map[i][0]).put(Math.round(r[i] * 1e6) / 1e6);
            last = next; added++;
        }
        hist.put("to", last);
        if (added > 0) write(c, "storico", hist.toString());
        JSONObject res = new JSONObject(); res.put("tickers", ok); res.put("of", all.size()); res.put("newMonths", added); res.put("to", last);
        return res;
    }

    static String readAsset(Context c, String name) throws Exception {
        try (InputStream in = c.getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }

    // ------------------------------------------------------------ 2. segnale
    /** PAC di 1 €/mese, mai vendere, tasse 26% solo alla fine: netto/versato */
    interface Rule { Map<String, Double> pick(int i); }

    static JSONObject taskSignal(Context c) throws Exception {
        JSONObject prices = new JSONObject(read(c, "prices"));
        List<String> U = new ArrayList<>();
        for (String s : SAT) if (prices.has(s)) U.add(s);
        // mesi comuni a tutto l'universo e a SWDA
        List<String> M = new ArrayList<>();
        Iterator<String> it = prices.getJSONObject("XDWF.DE").keys();
        while (it.hasNext()) { String k = it.next(); boolean ok = prices.getJSONObject("SWDA.MI").has(k); for (String s : U) ok &= prices.getJSONObject(s).has(k); if (ok) M.add(k); }
        java.util.Collections.sort(M);
        int T = M.size();
        double[][] px = new double[U.size() + 1][T];
        for (int j = 0; j < U.size(); j++) for (int t = 0; t < T; t++) px[j][t] = prices.getJSONObject(U.get(j)).getDouble(M.get(t));
        int W = U.size();
        for (int t = 0; t < T; t++) px[W][t] = prices.getJSONObject("SWDA.MI").getDouble(M.get(t));
        final int Wf = W;

        Rule world = i -> map(Wf, 1.0);
        Rule ew = i -> { Map<String, Double> m = new HashMap<>(); for (int j = 0; j < Wf; j++) m.put("" + j, 1.0 / Wf); return m; };
        Rule top3 = i -> pickBy(px, Wf, i, 12, true);
        Rule bot3 = i -> pickBy(px, Wf, i, 12, false);

        JSONObject res = new JSONObject();
        res.put("from", M.get(0)); res.put("to", M.get(T - 1)); res.put("months", T);
        String[] names = { "mondo", "pariPeso", "top3", "peggiori3" };
        Rule[] rules = { world, ew, top3, bot3 };
        for (int H : new int[] { 36, 60 }) {
            JSONObject h = new JSONObject();
            double[] base = null;
            for (int r = 0; r < rules.length; r++) {
                List<Double> w = new ArrayList<>();
                for (int i = 13; i + H <= T; i++) w.add(pac(px, rules[r], i, i + H));
                double[] a = w.stream().mapToDouble(x -> x).toArray();
                if (r == 0) base = a;
                int beat = 0; for (int k = 0; k < a.length; k++) if (a[k] > base[k]) beat++;
                JSONObject o = new JSONObject();
                o.put("median", median(a)); o.put("worst", min(a)); o.put("beatWorld", a.length > 0 ? (double) beat / a.length : 0); o.put("n", a.length);
                h.put(names[r], o);
            }
            res.put("h" + H, h);
        }
        // verdetto: il top 3 deve battere sia la media dell'universo sia i 3 peggiori, su 3 e su 5 anni
        int score = 0;
        for (String h : new String[] { "h36", "h60" }) {
            JSONObject x = res.getJSONObject(h);
            double t = x.getJSONObject("top3").getDouble("median");
            if (t > x.getJSONObject("pariPeso").getDouble("median")) score++;
            if (t > x.getJSONObject("peggiori3").getDouble("median")) score++;
        }
        res.put("verdict", score >= 4 ? "funziona" : score >= 2 ? "debole" : "non funziona");
        res.put("score", score);
        // scelte di questo mese (ultimo mese chiuso)
        JSONArray picks = new JSONArray();
        Integer[] idx = new Integer[W]; for (int j = 0; j < W; j++) idx[j] = j;
        final int L = T;
        Arrays.sort(idx, (a, b) -> Double.compare(mom(px[b], L, 12), mom(px[a], L, 12)));
        for (int k = 0; k < W; k++) {
            JSONObject p = new JSONObject();
            p.put("t", U.get(idx[k])); p.put("mom", mom(px[idx[k]], L, 12)); p.put("px", px[idx[k]][T - 1]); p.put("rank", k + 1);
            picks.put(p);
        }
        res.put("ranking", picks);
        res.put("tickers", new JSONArray(U));
        res.put("_ts", System.currentTimeMillis());
        write(c, "signal", res.toString());
        return res;
    }

    static Map<String, Double> map(int j, double w) { Map<String, Double> m = new HashMap<>(); m.put("" + j, w); return m; }
    /** momentum 12-1 al mese i: prezzo di i-1 su prezzo di i-1-L (con i = T usa l'ultimo mese chiuso) */
    static double mom(double[] p, int i, int L) { return p[i - 1] / p[i - 1 - L] - 1; }
    static Map<String, Double> pickBy(double[][] px, int W, int i, int L, boolean best) {
        Integer[] idx = new Integer[W]; for (int j = 0; j < W; j++) idx[j] = j;
        Arrays.sort(idx, (a, b) -> best ? Double.compare(mom(px[b], i, L), mom(px[a], i, L)) : Double.compare(mom(px[a], i, L), mom(px[b], i, L)));
        Map<String, Double> m = new HashMap<>(); for (int k = 0; k < 3; k++) m.put("" + idx[k], 1.0 / 3); return m;
    }
    static double pac(double[][] px, Rule rule, int i0, int i1) {
        double[] val = new double[px.length]; double paid = 0;
        for (int i = i0; i < i1; i++) {
            for (Map.Entry<String, Double> e : rule.pick(i).entrySet()) val[Integer.parseInt(e.getKey())] += e.getValue();
            paid += 1;
            for (int j = 0; j < val.length; j++) if (val[j] != 0) val[j] *= px[j][i] / px[j][i - 1];
        }
        double V = 0; for (double v : val) V += v;
        return (V - Math.max(0, V - paid) * TAX) / paid;
    }
    static double median(double[] a) { if (a.length == 0) return 0; double[] b = a.clone(); Arrays.sort(b); return b[b.length / 2]; }
    static double min(double[] a) { double m = Double.MAX_VALUE; for (double x : a) m = Math.min(m, x); return a.length == 0 ? 0 : m; }

    // ------------------------------------------------------------ 3. scenari
    static JSONObject taskMonteCarlo(Context c, int paths) throws Exception {
        String in = NativeStore.engineInput(c);
        if (in.isEmpty()) { JSONObject r = new JSONObject(); r.put("skipped", "nessun profilo"); return r; }
        JSONObject inp = new JSONObject(in);
        String hs = read(c, "storico"); JSONObject hist = new JSONObject(hs.isEmpty() ? readAsset(c, "storico.json") : hs);
        JSONObject w = inp.getJSONObject("w"), fwd = inp.getJSONObject("fwd");
        double v0 = inp.optDouble("v0", 0), m = inp.optDouble("m", 0), infl = inp.optDouble("infl", 0.02);
        int years = inp.optInt("years", 20);
        List<String> keys = new ArrayList<>(); Iterator<String> ki = w.keys(); while (ki.hasNext()) keys.add(ki.next());
        int K = keys.size(), T = hist.getJSONArray("months").length();
        double[][] r = new double[K][T]; double[] wk = new double[K];
        for (int k = 0; k < K; k++) {
            JSONArray a = hist.getJSONObject("r").getJSONArray(keys.get(k)); double mean = 0;
            for (int t = 0; t < T; t++) { r[k][t] = a.getDouble(t); mean += r[k][t]; }
            mean /= T;
            double adj = Math.pow(1 + fwd.getDouble(keys.get(k)), 1.0 / 12) - 1 - mean;   // rendimenti medi prudenti, volatilità vera
            for (int t = 0; t < T; t++) r[k][t] += adj;
            wk[k] = w.getDouble(keys.get(k));
        }
        double[][] at = new double[years + 1][paths];
        Random rnd = new Random(20261015L + Math.round(m) + 31L * Math.round(v0));
        for (int p = 0; p < paths; p++) {
            double v = v0; int s = 0; at[0][p] = v0;
            for (int t = 0; t < years * 12; t++) {
                if (t % 12 == 0) s = rnd.nextInt(T - 12);
                double ret = 0; for (int k = 0; k < K; k++) ret += wk[k] * r[k][s + t % 12];
                v = (v + m) * (1 + ret);
                if ((t + 1) % 12 == 0) at[(t + 1) / 12][p] = v / Math.pow(1 + infl, (t + 1) / 12.0);
            }
        }
        JSONObject res = new JSONObject();
        double[] qs = { 0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95 };
        String[] qn = { "p5", "p10", "p25", "p50", "p75", "p90", "p95" };
        for (int q = 0; q < qs.length; q++) {
            JSONArray a = new JSONArray();
            for (int y = 0; y <= years; y++) { double[] col = at[y].clone(); Arrays.sort(col); a.put(Math.round(col[(int) Math.min(paths - 1, Math.floor(qs[q] * paths))])); }
            res.put(qn[q], a);
        }
        double goal = inp.optDouble("goal", 0); int gy = inp.optInt("goalYears", 0);
        if (goal > 0 && gy > 0 && gy <= years) { int ok = 0; for (double x : at[gy]) if (x >= goal) ok++; res.put("goalProb", (double) ok / paths); }
        // probabilità di essere sotto il versato dopo 1, 3, 5, 10 anni
        JSONObject loss = new JSONObject();
        for (int y : new int[] { 1, 3, 5, 10 }) {
            if (y > years) continue; double paid = (v0 + m * 12 * y) / Math.pow(1 + infl, y); int n = 0;
            for (double x : at[y]) if (x < paid) n++;
            loss.put("" + y, (double) n / paths);
        }
        res.put("belowPaid", loss);
        res.put("paths", paths); res.put("years", years); res.put("key", inp.optString("key")); res.put("_ts", System.currentTimeMillis());
        write(c, "mc", res.toString());
        return res;
    }

    // ------------------------------------------------------------ 4. notizie e sentiment
    static final String[] NEG = { "loss", "losses", "decline", "declines", "fall", "falls", "fell", "drop", "drops", "plunge", "plunges", "slump",
            "lawsuit", "fraud", "investigation", "probe", "downgrade", "downgrades", "cut", "cuts", "miss", "misses", "missed", "warning", "warns",
            "weak", "weaker", "bankruptcy", "default", "layoff", "layoffs", "recall", "fined", "crash", "tumble", "tumbles", "sink", "sinks",
            "concern", "concerns", "slowdown", "recession", "selloff", "sell-off", "slides", "slide", "lower", "bearish", "risk",
            "perdita", "perdite", "calo", "cala", "crollo", "crolla", "scende", "ribasso", "taglio", "tagli", "multa", "indagine", "inchiesta",
            "declassa", "declassamento", "crisi", "licenziamenti", "fallimento", "allarme", "frena", "frenata", "debole", "giù", "affonda", "rosso" };
    static final String[] POS = { "gain", "gains", "rise", "rises", "rose", "surge", "surges", "jump", "jumps", "rally", "rallies", "beat", "beats",
            "record", "upgrade", "upgrades", "growth", "strong", "stronger", "profit", "profits", "raise", "raises", "raised", "boost", "boosts",
            "outperform", "bullish", "soar", "soars", "wins", "win", "deal", "approval", "higher", "tops", "dividend",
            "utile", "utili", "rialzo", "sale", "salgono", "balzo", "crescita", "promozione", "accordo", "commessa", "contratto", "dividendo",
            "guadagna", "vola", "rafforza", "su", "verde", "batte", "migliora", "positivo" };

    static double sentiment(String title) {
        String[] words = title.toLowerCase(Locale.ROOT).replaceAll("[^a-zà-ÿ\\- ]", " ").split("\\s+");
        int pos = 0, neg = 0;
        for (int i = 0; i < words.length; i++) {
            boolean negated = i > 0 && (words[i - 1].equals("non") || words[i - 1].equals("not") || words[i - 1].equals("no"));
            boolean p = Arrays.asList(POS).contains(words[i]), n = Arrays.asList(NEG).contains(words[i]);
            if (negated) { boolean t = p; p = n; n = t; }
            if (p) pos++; if (n) neg++;
        }
        return pos + neg == 0 ? 0 : (double) (pos - neg) / (pos + neg);
    }

    static JSONObject taskNews(Context c) throws Exception {
        JSONArray hold = new JSONArray(NativeStore.newsHoldings(c));
        JSONObject res = new JSONObject(); JSONArray items = new JSONArray();
        Pattern rssItem = Pattern.compile("<item>.*?<title>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?</title>.*?<pubDate>(.*?)</pubDate>", Pattern.DOTALL);
        SimpleDateFormat rfc = new SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss zzz", Locale.ENGLISH);
        long weekAgo = System.currentTimeMillis() - 7L * 86400000L;
        for (int i = 0; i < hold.length(); i++) {
            JSONObject h = hold.getJSONObject(i);
            String t = h.optString("t"), name = h.optString("n");
            List<String[]> titles = new ArrayList<>();   // [titolo, fonte, ms]
            try {
                JSONObject js = new JSONObject(http("https://query1.finance.yahoo.com/v1/finance/search?q=" + URLEncoder.encode(t, "UTF-8") + "&quotesCount=0&newsCount=15"));
                JSONArray news = js.optJSONArray("news");
                if (news != null) for (int k = 0; k < news.length(); k++) { JSONObject n = news.getJSONObject(k);
                    titles.add(new String[] { n.optString("title"), n.optString("publisher"), "" + n.optLong("providerPublishTime") * 1000L }); }
            } catch (Exception ignored) {}
            try {
                String q = name.replaceAll("(?i)(ucits|etf|acc|\\(acc\\)|usd|eur|inc)", "").trim();
                String rss = http("https://news.google.com/rss/search?q=" + URLEncoder.encode("\"" + q + "\"", "UTF-8") + "&hl=it&gl=IT&ceid=IT:it");
                Matcher m = rssItem.matcher(rss); int k = 0;
                while (m.find() && k++ < 15) { long ms = 0; try { ms = rfc.parse(m.group(2)).getTime(); } catch (Exception ignored) {}
                    titles.add(new String[] { m.group(1).replace("&amp;", "&").replace("&quot;", "\"").replace("&#39;", "'"), "Google News", "" + ms }); }
            } catch (Exception ignored) {}
            double sum = 0; int n = 0; JSONArray worst = new JSONArray(); JSONArray best = new JSONArray();
            List<Object[]> scored = new ArrayList<>();
            for (String[] x : titles) {
                long ms = Long.parseLong(x[2]);
                if (ms > 0 && ms < weekAgo) continue;
                double s = sentiment(x[0]); sum += s; n++;
                scored.add(new Object[] { s, x[0], x[1], ms });
            }
            scored.sort((a, b) -> Double.compare((double) a[0], (double) b[0]));
            for (int k = 0; k < Math.min(2, scored.size()); k++) if ((double) scored.get(k)[0] < 0) worst.put(new JSONArray(Arrays.asList(scored.get(k))));
            for (int k = scored.size() - 1; k >= Math.max(0, scored.size() - 2); k--) if ((double) scored.get(k)[0] > 0) best.put(new JSONArray(Arrays.asList(scored.get(k))));
            JSONObject o = new JSONObject();
            o.put("t", t); o.put("n", name); o.put("count", n); o.put("score", n > 0 ? sum / n : 0); o.put("worst", worst); o.put("best", best);
            items.put(o);
            Thread.sleep(500);
        }
        res.put("items", items); res.put("_ts", System.currentTimeMillis());
        write(c, "news", res.toString());
        return res;
    }

    // ------------------------------------------------------------ giro completo
    public static JSONObject runAll(Context c, boolean full) {
        JSONObject log = new JSONObject();
        long t0 = System.currentTimeMillis();
        try {
            log.put("start", t0);
            String prices = read(c, "prices");
            boolean stale = prices.isEmpty() || System.currentTimeMillis() - new JSONObject(prices).optLong("_ts") > 6L * 86400000L;
            if (full || stale) { long t = System.currentTimeMillis(); log.put("data", taskData(c, log)); log.put("dataMs", System.currentTimeMillis() - t); }
            String sig = read(c, "signal");
            boolean sigOld = sig.isEmpty() || System.currentTimeMillis() - new JSONObject(sig).optLong("_ts") > 25L * 86400000L;
            if ((full || sigOld) && !read(c, "prices").isEmpty()) { long t = System.currentTimeMillis(); JSONObject s = taskSignal(c); log.put("signal", s.optString("verdict")); log.put("signalMs", System.currentTimeMillis() - t); }
            { long t = System.currentTimeMillis(); JSONObject mc = taskMonteCarlo(c, 20000); log.put("mcPaths", mc.optInt("paths")); log.put("mcMs", System.currentTimeMillis() - t); }
            { long t = System.currentTimeMillis(); JSONObject n = taskNews(c); log.put("news", n.getJSONArray("items").length()); log.put("newsMs", System.currentTimeMillis() - t); }
            log.put("ok", true);
        } catch (Exception e) {
            try { log.put("ok", false); log.put("error", String.valueOf(e.getMessage())); } catch (Exception ignored) {}
        }
        try {
            log.put("end", System.currentTimeMillis()); log.put("ms", System.currentTimeMillis() - t0);
            JSONArray runs; String old = read(c, "log");
            runs = old.isEmpty() ? new JSONArray() : new JSONArray(old);
            runs.put(log);
            JSONArray keep = new JSONArray(); for (int i = Math.max(0, runs.length() - 10); i < runs.length(); i++) keep.put(runs.get(i));
            write(c, "log", keep.toString());
        } catch (Exception ignored) {}
        return log;
    }

    static String today() { return new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date()); }
}
