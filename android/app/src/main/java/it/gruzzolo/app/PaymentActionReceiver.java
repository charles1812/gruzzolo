package it.gruzzolo.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.app.NotificationManagerCompat;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Pulsanti delle notifiche: conferma o ignora una spesa, «niente oggi» del promemoria serale. */
public class PaymentActionReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context c, Intent i) {
        String a = i.getAction() == null ? "" : i.getAction();
        String id = i.getStringExtra("id");
        if (a.endsWith("PAY_CONFIRMNB") && id != null) {
            NativeStore.setFlag(c, id, "noBuoni", true);
            NativeStore.setStatus(c, id, "confirmed", i.getStringExtra("cat"));
            NativeStore.setLastTxDate(c, today());
            NotificationManagerCompat.from(c).cancel(PaymentNotifier.notifId(id));
        } else if (a.endsWith("PAY_CONFIRM") && id != null) {
            NativeStore.setStatus(c, id, "confirmed", i.getStringExtra("cat"));
            NativeStore.setLastTxDate(c, today());
            NotificationManagerCompat.from(c).cancel(PaymentNotifier.notifId(id));
        } else if (a.endsWith("PAY_SPESA") && id != null) {
            // notifiche delle versioni vecchie con «Spesa di casa»: la registro come spesa
            NativeStore.setStatus(c, id, "confirmed", "spesa");
            NativeStore.setLastTxDate(c, today());
            NotificationManagerCompat.from(c).cancel(PaymentNotifier.notifId(id));
        } else if (a.endsWith("PAY_IGNORE") && id != null) {
            NativeStore.setStatus(c, id, "ignored", null);
            NotificationManagerCompat.from(c).cancel(PaymentNotifier.notifId(id));
        } else if (a.endsWith("NOTHING_TODAY")) {
            NativeStore.setLastTxDate(c, today());
            NotificationManagerCompat.from(c).cancel(EveningReminderWorker.NOTIF_ID);
        }
    }

    static String today() { return new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date()); }
}
