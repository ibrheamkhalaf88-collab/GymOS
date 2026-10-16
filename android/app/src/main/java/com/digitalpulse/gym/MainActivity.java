package com.digitalpulse.gym;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local Capacitor plugins must be registered BEFORE super.onCreate(),
        // which is what builds the bridge. Without this the web layer sees
        // Capacitor.Plugins.AutoUpdater as undefined and the in-app update
        // silently fell back to "open the APK link in a browser".
        registerPlugin(AutoUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
