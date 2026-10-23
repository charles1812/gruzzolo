package it.gruzzolo.app;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.concurrent.TimeUnit;

/** Motore notturno: una volta al giorno, solo con il telefono in carica, inattivo e sul Wi-Fi. */
public class EngineWorker extends Worker {

    public static final String PERIODIC = "grz_engine";
    public static final String NOW = "grz_engine_now";

    public EngineWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }

    public static void schedule(Context c) {
        WorkManager wm = WorkManager.getInstance(c);
        if (!NativeStore.engineOn(c)) { wm.cancelUniqueWork(PERIODIC); return; }
        Constraints k = new Constraints.Builder()
                .setRequiresCharging(true)
                .setRequiresDeviceIdle(true)
                .setRequiredNetworkType(NetworkType.UNMETERED)
                .build();
        PeriodicWorkRequest r = new PeriodicWorkRequest.Builder(EngineWorker.class, 24, TimeUnit.HOURS).setConstraints(k).build();
        wm.enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, r);
    }

    /** «Esegui ora» dall'app: basta la rete */
    public static void runNow(Context c) {
        Constraints k = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        OneTimeWorkRequest r = new OneTimeWorkRequest.Builder(EngineWorker.class).setConstraints(k)
                .setInputData(new Data.Builder().putBoolean("full", true).build()).build();
        WorkManager.getInstance(c).enqueueUniqueWork(NOW, ExistingWorkPolicy.REPLACE, r);
    }

    @NonNull
    @Override
    public Result doWork() {
        NativeStore.setEngineRunning(getApplicationContext(), true);
        try {
            Engine.runAll(getApplicationContext(), getInputData().getBoolean("full", false));
        } finally {
            NativeStore.setEngineRunning(getApplicationContext(), false);
        }
        return Result.success();
    }
}
