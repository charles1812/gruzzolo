package it.gruzzolo.app;

import android.app.Notification;
import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONObject;

/**
 * Legge le notifiche di pagamento (Google Wallet e app di pagamento; le altre app solo se l'utente lo attiva)
 * e propone la spesa. Tutto resta sul telefono: salvo solo importo, negozio, ora e app.
 */
public class PaymentListener extends NotificationListenerService {

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if (!NativeStore.paymentsOn(this)) return;
            String pkg = sbn.getPackageName();
            if (pkg.equals(getPackageName())) return;
            boolean wallet = PaymentParser.isWallet(pkg);
            boolean bankApp = PaymentParser.isBankApp(pkg);
            boolean smsApp = PaymentParser.isSmsApp(pkg);
            boolean debugShell = "com.android.shell".equals(pkg) && (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
            if (!wallet && !bankApp && !smsApp && !debugShell && !NativeStore.listenAllApps(this)) return;

            Notification n = sbn.getNotification();
            if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
            Bundle ex = n.extras;
            String title = str(ex.getCharSequence(Notification.EXTRA_TITLE));
            CharSequence big = ex.getCharSequence(Notification.EXTRA_BIG_TEXT);
            String text = big != null ? big.toString() : str(ex.getCharSequence(Notification.EXTRA_TEXT));

            // dalle app di messaggi leggo solo gli SMS della banca: tutti gli altri messaggi vengono ignorati subito
            boolean bankSms = PaymentParser.isBankSms(title, text);
            if (smsApp && !bankSms) return;
            if (debugShell && bankSms) bankApp = true;
            String src = wallet ? "wallet" : (bankApp || bankSms) ? "fineco" : debugShell ? "wallet" : "app";

            // per banca e altre app servono parole di pagamento esplicite
            JSONObject o = PaymentParser.parse(pkg, title, text, !wallet && !(debugShell && !bankSms));
            if (o == null) return;
            long ts = sbn.getPostTime();
            o.put("id", "n" + ts + "_" + Math.abs((o.optString("merchant") + o.optDouble("amt")).hashCode() % 100000));
            o.put("ts", ts);
            o.put("cat", PaymentParser.guess(o.optString("merchant"), NativeStore.learned(this)));
            String kw = PaymentParser.guess(o.optString("merchant"), null);
            o.put("kw", kw);
            // impronta del pagamento: stessa notifica = stessa ora di pubblicazione
            o.put("pay", "pay_" + ts + "_" + Math.round(o.optDouble("amt") * 100));
            o.put("status", "new");
            o.put("src", src);
            // la stessa spesa vista da Google Wallet e da Fineco: stesso importo entro 45 minuti = un solo pagamento
            if (NativeStore.seenRecently(this, o.optDouble("amt"), ts, src)) return;
            NativeStore.remember(this, o.optDouble("amt"), ts, src);
            // negozio che hai già confermato più volte con la stessa categoria: la segno da sola
            String auto = NativeStore.autoCats(this).optString(PaymentParser.key(o.optString("merchant")), "");
            boolean askB = NativeStore.askBuoni(this) && NativeStore.isBuoniCat(auto.isEmpty() ? o.optString("cat") : auto);
            if (!auto.isEmpty() && !askB) { o.put("cat", auto); o.put("status", "confirmed"); o.put("auto", true); }
            else if (!auto.isEmpty()) o.put("cat", auto);
            o.put("askBuoni", askB);
            if (NativeStore.addPending(this, o)) PaymentNotifier.show(this, o);
        } catch (Exception ignored) {
            // una notifica strana non deve mai far cadere il servizio
        }
    }

    private static String str(CharSequence s) { return s == null ? "" : s.toString(); }
}
