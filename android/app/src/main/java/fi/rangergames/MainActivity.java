// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONArray;

/**
 * The RangerGames app: the web build (assets/web) in a full-screen WebView.
 * The engine runs as WebAssembly inside it; this class adds what a page
 * cannot do by itself on Android: vibration (window.RgAndroid.vibrate),
 * the Back button (window.rgBack) and closing the app (RgAndroid.quit).
 */
public class MainActivity extends Activity {
    private static final String START = "https://appassets.androidplatform.net/assets/web/index.html";
    private WebView web;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
        });
        web.addJavascriptInterface(new Bridge(), "RgAndroid");
        setContentView(web);
        immersive();
        if (state == null) web.loadUrl(START);
        else web.restoreState(state);
    }

    private void immersive() {
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus) immersive();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    /** Back goes to the game; the launcher's Back closes the app (RgAndroid.quit). */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.rgBack ? window.rgBack() : false", null);
    }

    private class Bridge {
        @JavascriptInterface
        public void vibrate(String what) {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;
            try {
                if (what.startsWith("[")) {
                    JSONArray a = new JSONArray(what);
                    long[] pattern = new long[a.length() + 1];
                    pattern[0] = 0;
                    for (int i = 0; i < a.length(); i++) pattern[i + 1] = a.getLong(i);
                    if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(pattern, -1));
                    else v.vibrate(pattern, -1);
                } else {
                    long ms = Math.max(1, Math.min(2000, (long) Double.parseDouble(what)));
                    if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
                    else v.vibrate(ms);
                }
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void quit() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    finish();
                }
            });
        }
    }
}
