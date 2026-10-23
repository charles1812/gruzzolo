package it.gruzzolo.app;

import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.service.notification.StatusBarNotification;
import java.util.HashSet;
import java.util.Set;
import android.webkit.JavascriptInterface;

import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;

/** Bridge exposed to the web app as window.GruzzoloNative */
public class WebAppInterface {

    private final Context ctx;

    public WebAppInterface(Context c) {
        this.ctx = c.getApplicationContext();
    }

    // ---------- tempo al telefono ----------
    @JavascriptInterface
    public String phoneUsage(int days) { return PhoneUsage.read(ctx, Math.max(1, Math.min(31, days))); }
    @JavascriptInterface
    public void allowUsage() { try { ctx.startActivity(PhoneUsage.usageSettings()); } catch (Exception ignored) { } }
    @JavascriptInterface
    public void allowCalls() { MainActivity.askCallLog(); }

    // ---------- aggiornamenti dall'app ----------

    /** {"code":versionCode,"name":versionName} dell'app installata */
    @JavascriptInterface
    public String appVersion() {
        try {
            android.content.pm.PackageInfo p = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            long code = android.os.Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode;
            return new org.json.JSONObject().put("code", code).put("name", p.versionName).toString();
        } catch (Exception e) { return "{}"; }
    }

    @JavascriptInterface
    public boolean canInstall() { return Updater.canInstall(ctx); }

    /** apre la pagina di Android «installa app sconosciute» per Gruzzolo */
    @JavascriptInterface
    public void allowInstall() {
        try { ctx.startActivity(Updater.allowIntent(ctx)); } catch (Exception ignored) { }
    }

    /** scarica e installa l'APK; la risposta arriva in window.__updateDone(errore|null) */
    @JavascriptInterface
    public void update(String url) {
        Updater.install(ctx, url, err -> MainActivity.js("window.__updateDone && window.__updateDone(" + (err == null ? "null" : org.json.JSONObject.quote(err)) + ")"));
    }

    /** Called by the web app whenever the Replay plan changes or the app opens. */
    @JavascriptInterface
    public void scheduleReminders(int dayOfMonth, String costText, String isoDate) {
        ReminderScheduler.schedule(ctx, dayOfMonth, costText);
    }

    @JavascriptInterface
    public void cancelReminders() {
        ReminderScheduler.cancel(ctx);
    }

    // ---------- spese dalle notifiche ----------

    /** JSON array dei pagamenti riconosciuti e non ancora importati */
    @JavascriptInterface
    public String pendingPayments() { return NativeStore.pending(ctx).toString(); }

    /** la web app ha importato o scartato questi id (JSON array) */
    @JavascriptInterface
    public void removePayments(String idsJson) {
        try {
            JSONArray ids = new JSONArray(idsJson);
            NativeStore.remove(ctx, ids);
            for (int i = 0; i < ids.length(); i++) NotificationManagerCompat.from(ctx).cancel(PaymentNotifier.notifId(ids.getString(i)));
        } catch (Exception ignored) {}
    }

    /** Toglie le notifiche di Gruzzolo già gestite (e quindi il bollino sull'icona):
     *  restano solo quelle dei pagamenti ancora da confermare (id in keepIdsJson). */
    @JavascriptInterface
    public int tidyNotifications(String keepIdsJson) {
        int n = 0;
        try {
            Set<Integer> keep = new HashSet<>();
            JSONArray ids = new JSONArray(keepIdsJson);
            for (int i = 0; i < ids.length(); i++) keep.add(PaymentNotifier.notifId(ids.getString(i)));
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            for (StatusBarNotification sb : nm.getActiveNotifications()) {
                if (keep.contains(sb.getId())) continue;
                nm.cancel(sb.getTag(), sb.getId()); n++;
            }
        } catch (Exception ignored) {}
        return n;
    }

    @JavascriptInterface
    public boolean hasNotificationAccess() {
        return NotificationManagerCompat.getEnabledListenerPackages(ctx).contains(ctx.getPackageName());
    }

    @JavascriptInterface
    public void openNotificationAccess() {
        Intent i;
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
                    .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, new ComponentName(ctx, PaymentListener.class).flattenToString());
        } else i = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { ctx.startActivity(i); }
        catch (Exception e) { ctx.startActivity(new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
    }

    /** negozi confermati più volte con la stessa categoria: da segnare da soli ({"ESSO":"benzina"}) */
    @JavascriptInterface
    public void setAutoCats(String json) { NativeStore.setAutoCats(ctx, json); }

    @JavascriptInterface
    public void setAskBuoni(boolean v) { NativeStore.setAskBuoni(ctx, v); }

    /** le notifiche di Gruzzolo (conferma spese, promemoria) sono permesse? */
    @JavascriptInterface
    public boolean appNotificationsEnabled() { return NotificationManagerCompat.from(ctx).areNotificationsEnabled(); }

    @JavascriptInterface
    public void openAppNotificationSettings() {
        Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { ctx.startActivity(i); }
        catch (Exception e) { ctx.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:" + ctx.getPackageName())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
    }

    @JavascriptInterface
    public void setPaymentSettings(boolean on, boolean allApps) {
        NativeStore.setPaymentsOn(ctx, on);
        NativeStore.setListenAllApps(ctx, allApps);
    }


    /** negozio → categoria imparati dalle conferme ({"ESSO":"benzina"}) e nomi delle categorie ({"benzina":"Benzina"}) */
    @JavascriptInterface
    public void setCategories(String learnedJson, String namesJson) {
        NativeStore.setLearned(ctx, learnedJson);
        NativeStore.setCatNames(ctx, namesJson);
    }

    // ---------- promemoria serale, widget, aperture ----------

    @JavascriptInterface
    public void setLastTxDate(String ymd) { NativeStore.setLastTxDate(ctx, ymd); }

    @JavascriptInterface
    public void setEveningReminder(boolean on, int minutes) {
        NativeStore.setReminder(ctx, on, minutes);
        EveningReminderWorker.schedule(ctx);
    }

    @JavascriptInterface
    public void setWidgetCats(String json) {
        NativeStore.setWidgetCats(ctx, json);
        QuickAddWidget.refresh(ctx);
    }

    /** azione richiesta da widget / scorciatoia / notifica («add», «add:benzina», «review:<id>»), poi la cancella */
    @JavascriptInterface
    public String takeLaunchAction() { return NativeStore.takeLaunch(ctx); }

    // ---------- motore notturno ----------
    @JavascriptInterface
    public String readEngine(String name) { return name.matches("[a-z]+") ? Engine.read(ctx, name) : ""; }

    @JavascriptInterface
    public void setEngineInput(String json) { NativeStore.setEngineInput(ctx, json); }

    @JavascriptInterface
    public void setNewsHoldings(String json) { NativeStore.setNewsHoldings(ctx, json); }

    @JavascriptInterface
    public void setEngineOn(boolean on) { NativeStore.setEngineOn(ctx, on); EngineWorker.schedule(ctx); }

    @JavascriptInterface
    public boolean engineRunning() { return NativeStore.engineRunning(ctx); }

    @JavascriptInterface
    public void runEngineNow() { EngineWorker.runNow(ctx); }

    @JavascriptInterface
    public void testPaymentNotification() {
        // solo per prova dall'app: simula un pagamento come se arrivasse da Google Wallet
        try {
            org.json.JSONObject o = PaymentParser.parse("com.google.android.apps.walletnfcrel", "Esso", "€ 62,40 con Visa •••• 1234", false);
            long ts = System.currentTimeMillis();
            o.put("id", "t" + ts); o.put("ts", ts); o.put("status", "new"); o.put("kw", "benzina");
            o.put("pay", "pay_" + ts + "_" + Math.round(o.optDouble("amt") * 100));
            o.put("cat", PaymentParser.guess(o.optString("merchant"), NativeStore.learned(ctx)));
            if (NativeStore.addPending(ctx, o)) PaymentNotifier.show(ctx, o);
        } catch (Exception ignored) {}
    }
}
