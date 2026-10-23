package it.gruzzolo.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONObject;

import java.text.NumberFormat;
import java.util.Locale;

/** Notifica «62,40 € da ESSO: Benzina?» con i pulsanti per confermare senza aprire l'app. */
public final class PaymentNotifier {

    public static final String CHANNEL = "grz_spese";
    private PaymentNotifier() {}

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Spese da confermare", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Pagamenti riconosciuti dalle notifiche di Google Wallet e delle app di pagamento");
            c.getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
    }

    public static String eur(double v) {
        NumberFormat f = NumberFormat.getCurrencyInstance(Locale.ITALY);
        return f.format(v);
    }

    public static int notifId(String id) { return 5000 + Math.abs(id.hashCode() % 100000); }

    public static void show(Context c, JSONObject o) {
        ensureChannel(c);
        String id = o.optString("id");
        String cat = o.optString("cat");
        String title = eur(o.optDouble("amt")) + " · " + o.optString("merchant");
        boolean auto = o.optBoolean("auto");
        String body = auto ? "Segnata in " + NativeStore.catLabel(c, cat) + ". Tocca «Cambia» se è sbagliata."
                : cat.isEmpty() ? "Non so che spesa è: tocca per scegliere la categoria." : NativeStore.catLabel(c, cat) + "? Confermo o tocca per cambiare.";
        if ("fineco".equals(o.optString("src"))) body += " (da Fineco)";

        Intent open = new Intent(c, MainActivity.class).setAction("it.gruzzolo.OPEN").putExtra("action", (auto ? "edit:" : "review:") + id)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent piOpen = PendingIntent.getActivity(c, notifId(id), open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_egg)
                .setContentTitle(title)
                .setContentText(body)
                .setContentIntent(piOpen)
                .setAutoCancel(true)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        boolean askB = o.optBoolean("askBuoni");
        if (askB) {
            body = NativeStore.catLabel(c, cat) + ": hai usato buoni pasto?" + ("fineco".equals(o.optString("src")) ? " (da Fineco)" : "");
            b.setContentText(body);
            b.addAction(0, "✓ Senza buoni", action(c, id, "confirmnb", cat));
            b.addAction(0, "Con buoni…", piOpen);
            b.addAction(0, "Ignora", action(c, id, "ignore", ""));
        }
        else if (auto) { b.addAction(0, "Cambia", piOpen); b.addAction(0, "Annulla", action(c, id, "ignore", "")); }
        else {
            if (!cat.isEmpty()) b.addAction(0, "✓ " + NativeStore.catLabel(c, cat), action(c, id, "confirm", cat));
            b.addAction(0, cat.isEmpty() ? "Scegli" : "Cambia", piOpen);
            b.addAction(0, "Ignora", action(c, id, "ignore", ""));
        }
        try { NotificationManagerCompat.from(c).notify(notifId(id), b.build()); } catch (SecurityException ignored) {}
    }

    private static PendingIntent action(Context c, String id, String what, String cat) {
        Intent i = new Intent(c, PaymentActionReceiver.class).setAction("it.gruzzolo.PAY_" + what.toUpperCase(Locale.ROOT))
                .putExtra("id", id).putExtra("cat", cat);
        return PendingIntent.getBroadcast(c, notifId(id) + what.hashCode() % 997, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
