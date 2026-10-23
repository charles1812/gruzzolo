package it.gruzzolo.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public class ReplayReminderWorker extends Worker {

    public static final String CHANNEL = "grz_replay";

    public ReplayReminderWorker(@NonNull Context ctx, @NonNull WorkerParameters params) {
        super(ctx, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        int days = getInputData().getInt("daysBefore", 7);
        String cost = getInputData().getString("cost");
        Context ctx = getApplicationContext();

        ensureChannel(ctx);

        String title = "Replay tra " + days + (days == 1 ? " giorno" : " giorni");
        String body = (cost != null && !cost.isEmpty())
                ? "Acquisto automatico del piano in arrivo. Costo stimato " + cost + "."
                : "Acquisto automatico del piano in arrivo.";

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_egg)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true);

        try {
            NotificationManagerCompat.from(ctx).notify(days == 3 ? 32 : 7, b.build());
        } catch (SecurityException ignored) {
            // notifications not permitted; nothing to do
        }
        return Result.success();
    }

    private void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL, "Promemoria Replay", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Avvisi prima dell'acquisto automatico del piano");
            ctx.getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
    }
}
