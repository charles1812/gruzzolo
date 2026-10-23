# Keep the JavaScript bridge methods reachable from the WebView
-keepclassmembers class it.gruzzolo.app.WebAppInterface {
    @android.webkit.JavascriptInterface <methods>;
}
