package it.gruzzolo.app;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Aggiornamento dall'app (come Schiscetta): scarica il nuovo APK e lo installa sopra quello attuale con
 * PackageInstaller. Stessa firma e versionCode più alto: i dati restano. Android chiede sempre la conferma;
 * la prima volta anche il permesso «installa app sconosciute» per Gruzzolo.
 */
public class Updater extends BroadcastReceiver {
    interface Progress { void done(String error); }

    /** indirizzo da cui si possono scaricare gli aggiornamenti (vuoto = aggiornamenti dall'app spenti) */
    static final String UPDATE_PREFIX = "";

    /** l'APK si scarica solo da UPDATE_PREFIX */
    static boolean allowed(String url) {
        return url != null && !UPDATE_PREFIX.isEmpty() && url.startsWith(UPDATE_PREFIX);
    }

    static boolean canInstall(Context c) {
        return Build.VERSION.SDK_INT < 26 || c.getPackageManager().canRequestPackageInstalls();
    }

    static Intent allowIntent(Context c) {
        return new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + c.getPackageName()))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }

    static void install(Context c, String url, Progress p) {
        new Thread(() -> {
            String err = null;
            try {
                if (!allowed(url)) throw new SecurityException("indirizzo non consentito");
                PackageInstaller pi = c.getPackageManager().getPackageInstaller();
                PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                params.setAppPackageName(c.getPackageName());
                int id = pi.createSession(params);
                try (PackageInstaller.Session s = pi.openSession(id)) {
                    HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
                    con.setConnectTimeout(20000);
                    con.setReadTimeout(60000);
                    con.setInstanceFollowRedirects(true);
                    if (con.getResponseCode() != 200) throw new IllegalStateException("download non riuscito (" + con.getResponseCode() + ")");
                    try (InputStream in = con.getInputStream(); OutputStream out = s.openWrite("gruzzolo.apk", 0, -1)) {
                        byte[] b = new byte[65536];
                        for (int n; (n = in.read(b)) > 0; ) out.write(b, 0, n);
                        s.fsync(out);
                    }
                    Intent done = new Intent(c, Updater.class);
                    int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                    s.commit(PendingIntent.getBroadcast(c, id, done, flags).getIntentSender());
                } catch (Exception e) {
                    try { pi.abandonSession(id); } catch (Exception ignored) { }
                    throw e;
                }
            } catch (Exception e) {
                err = String.valueOf(e.getMessage());
            }
            p.done(err);
        }).start();
    }

    /** risposta del sistema: se serve la conferma dell'utente, la mostro */
    @Override
    public void onReceive(Context c, Intent i) {
        int st = i.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (st == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = i.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) {
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                c.startActivity(confirm);
            }
        } else if (st != PackageInstaller.STATUS_SUCCESS) {
            MainActivity.updateFailed(i.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE));
        }
    }
}
