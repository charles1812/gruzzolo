package it.gruzzolo.app;

import android.content.Context;

import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import java.util.Calendar;
import java.util.concurrent.TimeUnit;

/** Schedules background notifications 7 and 3 days before the next Replay purchase. */
public class ReminderScheduler {

    public static final String WORK_7 = "grz_replay_7";
    public static final String WORK_3 = "grz_replay_3";
    private static final long DAY = 86_400_000L;

    public static void schedule(Context ctx, int dayOfMonth, String costText) {
        long next = nextReplayMillis(dayOfMonth);
        scheduleAt(ctx, WORK_7, next - 7 * DAY, 7, costText);
        scheduleAt(ctx, WORK_3, next - 3 * DAY, 3, costText);
    }

    private static void scheduleAt(Context ctx, String name, long whenMs, int daysBefore, String costText) {
        long delay = whenMs - System.currentTimeMillis();
        if (delay <= 0) {
            // that window has already passed for this cycle: clear any stale job
            WorkManager.getInstance(ctx).cancelUniqueWork(name);
            return;
        }
        Data data = new Data.Builder()
                .putInt("daysBefore", daysBefore)
                .putString("cost", costText == null ? "" : costText)
                .build();

        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(ReplayReminderWorker.class)
                .setInitialDelay(delay, TimeUnit.MILLISECONDS)
                .setInputData(data)
                .build();

        WorkManager.getInstance(ctx).enqueueUniqueWork(name, ExistingWorkPolicy.REPLACE, req);
    }

    public static void cancel(Context ctx) {
        WorkManager.getInstance(ctx).cancelUniqueWork(WORK_7);
        WorkManager.getInstance(ctx).cancelUniqueWork(WORK_3);
    }

    /** Next occurrence of the given day-of-month, at 09:00 local time. */
    public static long nextReplayMillis(int day) {
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, 9);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        c.set(Calendar.DAY_OF_MONTH, Math.min(day, c.getActualMaximum(Calendar.DAY_OF_MONTH)));
        if (c.getTimeInMillis() < System.currentTimeMillis()) {
            c.add(Calendar.MONTH, 1);
            c.set(Calendar.DAY_OF_MONTH, Math.min(day, c.getActualMaximum(Calendar.DAY_OF_MONTH)));
        }
        return c.getTimeInMillis();
    }
}
