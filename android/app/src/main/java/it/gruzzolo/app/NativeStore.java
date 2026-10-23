package it.gruzzolo.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/** Dati condivisi tra la parte nativa (notifiche, widget, promemoria) e la web app. */
public final class NativeStore {

    private static final String PREFS = "grz_native";
    private NativeStore() {}

    private static SharedPreferences p(Context c) { return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    // ---------- pagamenti da confermare ----------
    public static synchronized JSONArray pending(Context c) {
        try { return new JSONArray(p(c).getString("pending", "[]")); } catch (Exception e) { return new JSONArray(); }
    }

    private static void savePending(Context c, JSONArray a) { p(c).edit().putString("pending", a.toString()).apply(); }

    /** aggiunge un pagamento; restituisce false se è un doppione (stesso importo e negozio entro 3 minuti) */
    public static synchronized boolean addPending(Context c, JSONObject o) {
        try {
            JSONArray a = pending(c);
            long ts = o.getLong("ts");
            for (int i = 0; i < a.length(); i++) {
                JSONObject x = a.getJSONObject(i);
                if (Math.abs(x.optLong("ts") - ts) < 180_000 && x.optDouble("amt") == o.getDouble("amt")
                        && x.optString("merchant").equalsIgnoreCase(o.getString("merchant"))) return false;
            }
            a.put(o);
            // tengo al massimo 200 voci, le più recenti
            if (a.length() > 200) {
                JSONArray b = new JSONArray();
                for (int i = a.length() - 200; i < a.length(); i++) b.put(a.get(i));
                a = b;
            }
            savePending(c, a);
            return true;
        } catch (Exception e) { return false; }
    }

    public static synchronized JSONObject setStatus(Context c, String id, String status, String cat) {
        try {
            JSONArray a = pending(c);
            for (int i = 0; i < a.length(); i++) {
                JSONObject x = a.getJSONObject(i);
                if (id.equals(x.optString("id"))) {
                    x.put("status", status);
                    if (cat != null && !cat.isEmpty()) x.put("cat", cat);
                    savePending(c, a);
                    return x;
                }
            }
        } catch (Exception ignored) {}
        return null;
    }

    /** la web app ha importato queste voci: le tolgo */
    public static synchronized void remove(Context c, JSONArray ids) {
        try {
            JSONArray a = pending(c), b = new JSONArray();
            outer:
            for (int i = 0; i < a.length(); i++) {
                JSONObject x = a.getJSONObject(i);
                for (int j = 0; j < ids.length(); j++) if (ids.getString(j).equals(x.optString("id"))) continue outer;
                b.put(x);
            }
            savePending(c, b);
        } catch (Exception ignored) {}
    }

    // ---------- pagamenti visti di recente (anche già confermati): per non contare due volte Wallet e Fineco ----------
    public static synchronized boolean seenRecently(Context c, double amt, long ts) { return seenRecently(c, amt, ts, null); }
    /** stesso importo: da un'altra fonte entro 45 minuti (Wallet + SMS della banca), dalla stessa fonte solo entro 2 minuti (notifica ripubblicata) */
    public static synchronized boolean seenRecently(Context c, double amt, long ts, String src) {
        try {
            JSONArray a = new JSONArray(p(c).getString("recent", "[]"));
            for (int i = 0; i < a.length(); i++) {
                JSONObject x = a.getJSONObject(i);
                if (Math.abs(x.optDouble("amt") - amt) >= 0.011) continue;
                long dt = Math.abs(x.optLong("ts") - ts);
                boolean same = src != null && src.equals(x.optString("src", ""));
                if (src == null ? dt < 45 * 60_000L : (same ? dt < 2 * 60_000L : dt < 45 * 60_000L)) return true;
            }
        } catch (Exception ignored) {}
        return false;
    }
    public static synchronized void remember(Context c, double amt, long ts, String src) {
        try {
            JSONArray a = new JSONArray(p(c).getString("recent", "[]")), b = new JSONArray();
            long cut = System.currentTimeMillis() - 14L * 86400000L;
            for (int i = 0; i < a.length(); i++) if (a.getJSONObject(i).optLong("ts") > cut) b.put(a.get(i));
            JSONObject o = new JSONObject(); o.put("amt", amt); o.put("ts", ts); o.put("src", src); b.put(o);
            p(c).edit().putString("recent", b.toString()).apply();
        } catch (Exception ignored) {}
    }

    // ---------- categorie (insegnate dalla web app) ----------
    public static JSONObject autoCats(Context c) {
        try { return new JSONObject(p(c).getString("autoCats", "{}")); } catch (Exception e) { return new JSONObject(); }
    }
    public static void setAutoCats(Context c, String json) { p(c).edit().putString("autoCats", json).apply(); }

    public static JSONObject learned(Context c) {
        try { return new JSONObject(p(c).getString("learned", "{}")); } catch (Exception e) { return new JSONObject(); }
    }
    public static void setLearned(Context c, String json) { p(c).edit().putString("learned", json).apply(); }

    public static JSONObject catNames(Context c) {
        try { return new JSONObject(p(c).getString("catNames", "{}")); } catch (Exception e) { return new JSONObject(); }
    }
    public static void setCatNames(Context c, String json) { p(c).edit().putString("catNames", json).apply(); }

    public static String catLabel(Context c, String id) {
        JSONObject n = catNames(c);
        return n.optString(id, id == null || id.isEmpty() ? "Altro" : id.substring(0, 1).toUpperCase() + id.substring(1));
    }

    // ---------- impostazioni ----------
    public static boolean listenAllApps(Context c) { return p(c).getBoolean("listenAll", false); }
    public static void setListenAllApps(Context c, boolean v) { p(c).edit().putBoolean("listenAll", v).apply(); }
    public static boolean paymentsOn(Context c) { return p(c).getBoolean("paymentsOn", true); }
    public static void setPaymentsOn(Context c, boolean v) { p(c).edit().putBoolean("paymentsOn", v).apply(); }

    /** hai buoni pasto: per spesa e pranzi fuori chiedo se li hai usati invece di confermare da solo */
    public static boolean askBuoni(Context c) { return p(c).getBoolean("askBuoni", false); }
    public static void setAskBuoni(Context c, boolean v) { p(c).edit().putBoolean("askBuoni", v).apply(); }
    public static boolean isBuoniCat(String cat) { return "spesa".equals(cat) || "fuori".equals(cat) || "pasto".equals(cat); }

    public static synchronized void setFlag(Context c, String id, String key, boolean v) {
        try {
            JSONArray a = pending(c);
            for (int i = 0; i < a.length(); i++) { JSONObject x = a.getJSONObject(i); if (id.equals(x.optString("id"))) { x.put(key, v); savePending(c, a); return; } }
        } catch (Exception ignored) {}
    }


    public static String lastTxDate(Context c) { return p(c).getString("lastTx", ""); }
    public static void setLastTxDate(Context c, String ymd) { p(c).edit().putString("lastTx", ymd).apply(); }

    public static int reminderMinutes(Context c) { return p(c).getInt("remMin", 21 * 60); }
    public static boolean reminderOn(Context c) { return p(c).getBoolean("remOn", true); }
    public static void setReminder(Context c, boolean on, int minutes) { p(c).edit().putBoolean("remOn", on).putInt("remMin", minutes).apply(); }

    public static String widgetCats(Context c) { return p(c).getString("widgetCats", "[[\"benzina\",\"⛽\"],[\"spesa\",\"🛒\"],[\"weekend\",\"🎉\"]]"); }
    public static void setWidgetCats(Context c, String json) { p(c).edit().putString("widgetCats", json).apply(); }

    // ---------- motore notturno ----------
    public static boolean engineOn(Context c) { return p(c).getBoolean("engineOn", true); }
    public static void setEngineOn(Context c, boolean v) { p(c).edit().putBoolean("engineOn", v).apply(); }
    public static boolean engineRunning(Context c) { return p(c).getBoolean("engineRun", false); }
    public static void setEngineRunning(Context c, boolean v) { p(c).edit().putBoolean("engineRun", v).apply(); }
    /** parametri delle simulazioni (pesi, valore di partenza, versamento, obiettivo) scritti dalla web app */
    public static String engineInput(Context c) { return p(c).getString("engineIn", ""); }
    public static void setEngineInput(Context c, String json) { p(c).edit().putString("engineIn", json).apply(); }
    /** posizioni su cui cercare le notizie: [{"t":"SWDA.MI","n":"iShares Core MSCI World"}] */
    public static String newsHoldings(Context c) { return p(c).getString("newsHold", "[]"); }
    public static void setNewsHoldings(Context c, String json) { p(c).edit().putString("newsHold", json).apply(); }

    // ---------- azione da eseguire all'apertura (widget, scorciatoie, notifiche) ----------
    public static synchronized String takeLaunch(Context c) {
        String a = p(c).getString("launch", "");
        if (!a.isEmpty()) p(c).edit().remove("launch").apply();
        return a;
    }
    public static void setLaunch(Context c, String action) { p(c).edit().putString("launch", action).apply(); }
}
