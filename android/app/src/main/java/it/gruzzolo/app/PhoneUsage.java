package it.gruzzolo.app;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.os.Process;
import android.provider.CallLog;
import android.provider.Settings;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.HashMap;
import java.util.Map;

/**
 * Tempo al telefono: minuti sullo schermo per giorno e app più usate (UsageStatsManager, permesso «accesso ai dati
 * di utilizzo») e minuti in chiamata per giorno (registro chiamate, permesso READ_CALL_LOG). Tutto resta sul telefono.
 */
public class PhoneUsage {

    static boolean usageAllowed(Context c) {
        AppOpsManager ao = (AppOpsManager) c.getSystemService(Context.APP_OPS_SERVICE);
        int m = ao.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName());
        return m == AppOpsManager.MODE_ALLOWED;
    }

    static boolean callsAllowed(Context c) {
        return c.checkSelfPermission(android.Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED;
    }

    static Intent usageSettings() {
        return new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }

    private static long dayStart(long t) {
        Calendar k = Calendar.getInstance(); k.setTimeInMillis(t);
        k.set(Calendar.HOUR_OF_DAY, 0); k.set(Calendar.MINUTE, 0); k.set(Calendar.SECOND, 0); k.set(Calendar.MILLISECOND, 0);
        return k.getTimeInMillis();
    }

    /** JSON: { usage, calls, screen:[{d,min}], apps:[{n,min}], call:[{d,min,n}] } per gli ultimi `days` giorni (oggi compreso) */
    static String read(Context c, int days) {
        JSONObject out = new JSONObject();
        try {
            long now = System.currentTimeMillis(), from = dayStart(now) - (days - 1) * 86400000L;
            out.put("usage", usageAllowed(c)).put("calls", callsAllowed(c));
            if (usageAllowed(c)) {
                UsageStatsManager um = (UsageStatsManager) c.getSystemService(Context.USAGE_STATS_SERVICE);
                UsageEvents ev = um.queryEvents(from, now);
                Map<String, Long> open = new HashMap<>(), perApp = new HashMap<>();
                long[] perDay = new long[days];
                UsageEvents.Event e = new UsageEvents.Event();
                String home = homePackage(c);
                while (ev.hasNextEvent()) {
                    ev.getNextEvent(e);
                    String p = e.getPackageName(); int t = e.getEventType();
                    if (t == UsageEvents.Event.ACTIVITY_RESUMED) { open.put(p, e.getTimeStamp()); }
                    else if ((t == UsageEvents.Event.ACTIVITY_PAUSED || t == UsageEvents.Event.ACTIVITY_STOPPED) && open.containsKey(p)) {
                        long s = open.remove(p), d = e.getTimeStamp() - s;
                        if (d > 0 && d < 6 * 3600000L && !p.equals(home)) add(perDay, perApp, p, s, d, from);
                    }
                }
                for (Map.Entry<String, Long> o : open.entrySet()) { long d = now - o.getValue(); if (d > 0 && d < 3600000L && !o.getKey().equals(home)) add(perDay, perApp, o.getKey(), o.getValue(), d, from); }
                JSONArray sc = new JSONArray();
                for (int i = 0; i < days; i++) sc.put(new JSONObject().put("d", i - (days - 1)).put("min", Math.round(perDay[i] / 60000.0)));
                out.put("screen", sc);
                JSONArray apps = new JSONArray();
                PackageManager pm = c.getPackageManager();
                perApp.entrySet().stream().filter(x -> pm.getLaunchIntentForPackage(x.getKey()) != null)   // solo app vere, niente pezzi di sistema
                        .sorted((a, b) -> Long.compare(b.getValue(), a.getValue())).limit(6).forEach(x -> {
                    try {
                        String n; try { ApplicationInfo ai = pm.getApplicationInfo(x.getKey(), 0); n = String.valueOf(pm.getApplicationLabel(ai)); } catch (Exception ex) { n = x.getKey(); }
                        apps.put(new JSONObject().put("n", n).put("min", Math.round(x.getValue() / 60000.0)));
                    } catch (Exception ignored) { }
                });
                out.put("apps", apps);
            }
            if (callsAllowed(c)) {
                long[] min = new long[days]; int[] n = new int[days];
                try (Cursor cu = c.getContentResolver().query(CallLog.Calls.CONTENT_URI, new String[]{ CallLog.Calls.DATE, CallLog.Calls.DURATION },
                        CallLog.Calls.DATE + ">=?", new String[]{ String.valueOf(from) }, null)) {
                    while (cu != null && cu.moveToNext()) {
                        long d = cu.getLong(0), dur = cu.getLong(1); int i = (int) ((dayStart(d) - from) / 86400000L);
                        if (i >= 0 && i < days && dur > 0) { min[i] += dur; n[i]++; }
                    }
                }
                JSONArray cl = new JSONArray();
                for (int i = 0; i < days; i++) cl.put(new JSONObject().put("d", i - (days - 1)).put("min", Math.round(min[i] / 60.0)).put("n", n[i]));
                out.put("call", cl);
            }
        } catch (Exception ex) {
            try { out.put("err", String.valueOf(ex.getMessage())); } catch (Exception ignored) { }
        }
        return out.toString();
    }

    private static void add(long[] perDay, Map<String, Long> perApp, String p, long s, long d, long from) {
        int i = (int) ((dayStart(s) - from) / 86400000L);
        if (i >= 0 && i < perDay.length) perDay[i] += d;
        perApp.put(p, perApp.getOrDefault(p, 0L) + d);
    }

    private static String homePackage(Context c) {
        try {
            Intent i = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
            return c.getPackageManager().resolveActivity(i, 0).activityInfo.packageName;
        } catch (Exception e) { return ""; }
    }
}
