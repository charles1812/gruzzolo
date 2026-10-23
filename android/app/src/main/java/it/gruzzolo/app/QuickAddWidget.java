package it.gruzzolo.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONArray;

/** Widget della schermata Home: «+» e tre categorie rapide (le più usate, aggiornate dall'app). */
public class QuickAddWidget extends AppWidgetProvider {

    private static final int[] SLOTS = { R.id.w_c1, R.id.w_c2, R.id.w_c3 };

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, views(c));
    }

    public static void refresh(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, QuickAddWidget.class));
        for (int id : ids) m.updateAppWidget(id, views(c));
    }

    private static RemoteViews views(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_quick);
        v.setOnClickPendingIntent(R.id.w_add, open(c, "add", 0));
        try {
            JSONArray a = new JSONArray(NativeStore.widgetCats(c));
            for (int i = 0; i < SLOTS.length; i++) {
                if (i < a.length()) {
                    JSONArray x = a.getJSONArray(i);
                    v.setTextViewText(SLOTS[i], x.getString(1));
                    v.setOnClickPendingIntent(SLOTS[i], open(c, "add:" + x.getString(0), i + 1));
                }
            }
        } catch (Exception ignored) {}
        return v;
    }

    private static PendingIntent open(Context c, String action, int req) {
        Intent i = new Intent(c, MainActivity.class).setAction("it.gruzzolo.OPEN").putExtra("action", action)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 7000 + req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
