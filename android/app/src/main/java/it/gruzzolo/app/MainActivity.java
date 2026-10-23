package it.gruzzolo.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends AppCompatActivity {
    /** l'attività aperta: serve per rispondere alla pagina quando l'aggiornamento finisce o fallisce */
    static java.lang.ref.WeakReference<MainActivity> CUR = new java.lang.ref.WeakReference<>(null);
    static void js(String code) {
        MainActivity a = CUR.get();
        if (a != null && a.web != null) a.runOnUiThread(() -> a.web.evaluateJavascript(code, null));
    }
    /** chiede il permesso del registro chiamate; la pagina si aggiorna da sola al ritorno */
    static void askCallLog() {
        MainActivity a = CUR.get();
        if (a != null) a.runOnUiThread(() -> ActivityCompat.requestPermissions(a, new String[]{ Manifest.permission.READ_CALL_LOG }, 7));
    }
    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (code == 7) js("window.phRefresh && window.phRefresh()");
    }
    static void updateFailed(String msg) {
        js("window.__updateDone && window.__updateDone(" + org.json.JSONObject.quote(msg == null ? "installazione annullata" : msg) + ")");
    }

    private static final String APP_URL = "https://appassets.androidplatform.net/assets/index.html";
    private WebView web;
    private WebViewAssetLoader assetLoader;
    private final ExecutorService io = Executors.newFixedThreadPool(3);

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        CUR = new java.lang.ref.WeakReference<>(this);

        web = new WebView(this);
        // Android 15+: l'app va sotto la barra di stato; tengo la pagina fuori dalle barre di sistema
        android.widget.FrameLayout root = new android.widget.FrameLayout(this);
        root.addView(web, new android.widget.FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            androidx.core.graphics.Insets bars = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars() | androidx.core.view.WindowInsetsCompat.Type.displayCutout());
            // solo in alto: in basso la pagina gestisce già la barra dei gesti (safe-area)
            // con la tastiera aperta la pagina si accorcia (come adjustResize), così campi e «Salva» restano sopra la tastiera
            int ime = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.ime()).bottom;
            v.setPadding(bars.left, bars.top, bars.right, ime);
            v.setBackgroundColor(0xFF0F1A1C);
            androidx.core.graphics.Insets sb = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars());
            return new androidx.core.view.WindowInsetsCompat.Builder(insets)
                    .setInsets(androidx.core.view.WindowInsetsCompat.Type.ime(), androidx.core.graphics.Insets.NONE)
                    .setInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars(), androidx.core.graphics.Insets.of(0, 0, 0, ime > 0 ? 0 : sb.bottom))
                    .setInsets(androidx.core.view.WindowInsetsCompat.Type.displayCutout(), androidx.core.graphics.Insets.NONE)
                    .build();
        });

        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);   // enables localStorage used by the app
        s.setDatabaseEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        web.addJavascriptInterface(new WebAppInterface(this), "GruzzoloNative");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                // 1) serve the bundled web app over an https origin
                WebResourceResponse local = assetLoader.shouldInterceptRequest(request.getUrl());
                if (local != null) return local;

                // 2) proxy Yahoo Finance natively so the WebView is not blocked by CORS
                String host = request.getUrl().getHost();
                if (host != null && (host.contains("finance.yahoo.com") || host.endsWith("mimit.gov.it"))) {
                    return fetchNatively(request.getUrl().toString());
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost();
                // keep the app's own pages inside the WebView
                if (host != null && host.equals("appassets.androidplatform.net")) return false;
                // open external links (news articles) in the system browser
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
                return true;
            }
        });

        // senza questo la WebView ignora confirm() e prompt(): «Togli la sfida», «Elimina posizione»… non facevano nulla
        web.setWebChromeClient(new android.webkit.WebChromeClient() {
            private android.app.AlertDialog.Builder dlg(String msg) {
                return new android.app.AlertDialog.Builder(MainActivity.this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                        .setMessage(msg).setCancelable(true);
            }
            @Override
            public boolean onJsAlert(WebView v, String url, String msg, android.webkit.JsResult r) {
                dlg(msg).setPositiveButton("OK", (d, w) -> r.confirm()).setOnCancelListener(d -> r.confirm()).show();
                return true;
            }
            @Override
            public boolean onJsConfirm(WebView v, String url, String msg, android.webkit.JsResult r) {
                dlg(msg).setPositiveButton("Sì", (d, w) -> r.confirm()).setNegativeButton("Annulla", (d, w) -> r.cancel())
                        .setOnCancelListener(d -> r.cancel()).show();
                return true;
            }
            @Override
            public boolean onJsPrompt(WebView v, String url, String msg, String def, android.webkit.JsPromptResult r) {
                android.widget.EditText in = new android.widget.EditText(MainActivity.this);
                in.setText(def); in.setSelectAllOnFocus(true);
                in.setInputType(android.text.InputType.TYPE_CLASS_NUMBER | android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL);
                android.widget.FrameLayout box = new android.widget.FrameLayout(MainActivity.this);
                int p = (int) (20 * getResources().getDisplayMetrics().density);
                box.setPadding(p, p / 2, p, 0); box.addView(in);
                dlg(msg).setView(box).setPositiveButton("OK", (d, w) -> r.confirm(in.getText().toString()))
                        .setNegativeButton("Annulla", (d, w) -> r.cancel()).setOnCancelListener(d -> r.cancel()).show();
                return true;
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                // prima chiede alla pagina: chiude fogli, storie e menu aperti o torna al Budget
                web.evaluateJavascript("window.grzBack ? String(window.grzBack()) : 'false'", r -> {
                    if (r != null && r.contains("true")) return;
                    if (web.canGoBack()) web.goBack();
                    else moveTaskToBack(true);   // keep the app alive instead of killing it
                });
            }
        });

        // Android 13+ needs runtime permission to post notifications
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        }

        handleLaunch(getIntent());
        EveningReminderWorker.schedule(this);
        EngineWorker.schedule(this);
        web.loadUrl(APP_URL);
    }

    /** widget, scorciatoie e notifiche aprono l'app con un'azione («add», «add:benzina», «review:<id>») */
    private void handleLaunch(Intent intent) {
        if (intent == null) return;
        String a = intent.getStringExtra("action");
        if (a == null || a.isEmpty()) return;
        NativeStore.setLaunch(this, a);
        intent.removeExtra("action");
        if (web != null) web.evaluateJavascript("window.grzLaunch && window.grzLaunch()", null);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleLaunch(intent);
    }

    private WebResourceResponse fetchNatively(String urlStr) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Access-Control-Allow-Methods", "GET, OPTIONS");
        try {
            URL url = new URL(urlStr);
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            c.setRequestMethod("GET");
            c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) Gruzzolo/1.0");
            c.setRequestProperty("Accept", "application/json,text/plain,*/*");
            c.setConnectTimeout(10000);
            c.setReadTimeout(30000);   // il file dei carburanti del ministero è di circa 4 MB

            int code = c.getResponseCode();
            InputStream in = (code >= 200 && code < 400) ? c.getInputStream() : c.getErrorStream();
            byte[] body = readAll(in);

            String ct = c.getContentType();
            String mime = (ct != null) ? ct.split(";")[0].trim() : "application/json";
            if (mime.isEmpty()) mime = "application/json";

            return new WebResourceResponse(mime, "utf-8",
                    code > 0 ? code : 200, "OK", headers, new ByteArrayInputStream(body));
        } catch (Exception e) {
            byte[] err = ("{\"error\":\"" + e.getMessage() + "\"}").getBytes();
            return new WebResourceResponse("application/json", "utf-8",
                    502, "Bad Gateway", headers, new ByteArrayInputStream(err));
        }
    }

    private static byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        return out.toByteArray();
    }
}
