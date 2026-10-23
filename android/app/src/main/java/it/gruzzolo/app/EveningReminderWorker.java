package it.gruzzolo.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.Calendar;
import java.util.concurrent.TimeUnit;

/** Ogni sera (default 21:00): «Oggi hai speso qualcosa?» — solo se oggi non hai segnato niente. */
public class EveningReminderWorker extends Worker {

    public static final String WORK = "grz_evening";
    public static final String CHANNEL = "grz_sera";
    public static final int NOTIF_ID = 4242;

    public EveningReminderWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }

    public static void schedule(Context c) {
        WorkManager wm = WorkManager.getInstance(c);
        if (!NativeStore.reminderOn(c)) { wm.cancelUniqueWork(WORK); return; }
        int min = NativeStore.reminderMinutes(c);
        Calendar t = Calendar.getInstance();
        t.set(Calendar.HOUR_OF_DAY, min / 60); t.set(Calendar.MINUTE, min % 60); t.set(Calendar.SECOND, 0); t.set(Calendar.MILLISECOND, 0);
        if (t.getTimeInMillis() <= System.currentTimeMillis() + 60_000) t.add(Calendar.DAY_OF_MONTH, 1);
        OneTimeWorkRequest r = new OneTimeWorkRequest.Builder(EveningReminderWorker.class)
                .setInitialDelay(t.getTimeInMillis() - System.currentTimeMillis(), TimeUnit.MILLISECONDS).build();
        wm.enqueueUniqueWork(WORK, ExistingWorkPolicy.REPLACE, r);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        try {
            if (NativeStore.reminderOn(c) && !PaymentActionReceiver.today().equals(NativeStore.lastTxDate(c))) notifyNow(c);
        } finally {
            schedule(c);   // la prossima sera
        }
        return Result.success();
    }

    static void notifyNow(Context c) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Promemoria spese", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Ogni sera, se non hai segnato spese");
            c.getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
        Intent add = new Intent(c, MainActivity.class).setAction("it.gruzzolo.OPEN").putExtra("action", "add")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent piAdd = PendingIntent.getActivity(c, 4243, add, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent none = new Intent(c, PaymentActionReceiver.class).setAction("it.gruzzolo.NOTHING_TODAY");
        PendingIntent piNone = PendingIntent.getBroadcast(c, 4244, none, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_egg)
                .setContentTitle("Oggi hai speso qualcosa?")
                .setContentText("Segnalo adesso: bastano tre tocchi e il budget resta preciso.")
                .setContentIntent(piAdd)
                .setAutoCancel(true)
                .addAction(0, "+ Aggiungi", piAdd)
                .addAction(0, "Niente oggi", piNone);
        try { NotificationManagerCompat.from(c).notify(NOTIF_ID, b.build()); } catch (SecurityException ignored) {}
    }
}
