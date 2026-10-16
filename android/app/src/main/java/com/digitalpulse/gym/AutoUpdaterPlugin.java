package com.digitalpulse.gym;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.util.Log;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * In-app self-update for the sideloaded APK.
 *
 * Why this plugin exists: the app is distributed as a downloadable APK, not
 * through Play Store, so there is no store to push updates. The app checks
 * GitHub Releases itself and, when a newer tag exists, downloads the APK and
 * hands it to the platform installer — no browser, no manual "download the new
 * version" step.
 *
 * Two install paths, in order:
 *   1. PackageInstaller session (API 21+). This is the path Android documents
 *      for installers holding REQUEST_INSTALL_PACKAGES. When the session is
 *      updating the very same package that owns it (our case) the platform may
 *      complete it without a prompt; otherwise it returns
 *      STATUS_PENDING_USER_ACTION and we must launch the confirmation intent
 *      ourselves. Skipping that launch is the classic "install silently hangs"
 *      bug.
 *   2. ACTION_VIEW with a FileProvider URI, as a fallback when the session API
 *      throws (some OEM builds).
 *
 * Permissions/setup this relies on (see AndroidManifest.xml + res/xml):
 *   - <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
 *   - a FileProvider whose paths include the app's external files dir
 *   - "install unknown apps" allowed for this package (we send the user to that
 *     screen when it is missing)
 *
 * The APK is downloaded into the app-specific external files dir, which needs
 * no storage permission on any supported API level.
 */
@CapacitorPlugin(name = "AutoUpdater")
public class AutoUpdaterPlugin extends Plugin {

    private static final String TAG = "AutoUpdaterPlugin";
    private static final String INSTALL_RESULT_ACTION = "com.digitalpulse.gym.INSTALL_RESULT";
    private static final String APK_FILE_NAME = "digital-pulse-update.apk";

    private static final int OPEN_SETTINGS_REQUEST = 1001;

    private PluginCall pendingInstallCall;
    private BroadcastReceiver installResultReceiver;

    // ---------------------------------------------------------------- methods

    /** Reports whether the OS will let this app install packages right now. */
    @PluginMethod
    public void checkInstallPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("canInstall", canInstallPackages());
        call.resolve(result);
    }

    /** Opens the system "install unknown apps" screen for this package. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        pendingInstallCall = call;
        try {
            startActivityForResult(call, intent, OPEN_SETTINGS_REQUEST);
        } catch (Exception e) {
            pendingInstallCall = null;
            call.reject("Cannot open install settings: " + e.getMessage());
        }
    }

    /** Downloads the APK at `url` and asks the platform to install it. */
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("url is required");
            return;
        }
        if (!canInstallPackages()) {
            call.reject("Install permission not granted");
            return;
        }

        pendingInstallCall = call;
        getBridge().execute(() -> downloadApk(url.trim()));
    }

    // ------------------------------------------------------------- download

    private void downloadApk(String urlString) {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(urlString);
            connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(true);
            connection.setConnectTimeout(20000);
            connection.setReadTimeout(60000);
            connection.setRequestProperty("Accept", "application/vnd.android.package-archive");
            connection.connect();

            int code = connection.getResponseCode();
            if (code != HttpURLConnection.HTTP_OK) {
                fail("Download failed: HTTP " + code);
                return;
            }

            int total = connection.getContentLength();
            File outputFile = apkTargetFile();
            long written = 0;
            long lastEmit = 0;

            try (InputStream in = connection.getInputStream();
                 OutputStream out = new FileOutputStream(outputFile)) {
                byte[] buffer = new byte[16384];
                int len;
                while ((len = in.read(buffer)) > 0) {
                    out.write(buffer, 0, len);
                    written += len;
                    long now = System.currentTimeMillis();
                    if (now - lastEmit > 200) { // throttle: no UI flooding
                        lastEmit = now;
                        emitProgress(written, total);
                    }
                }
            }

            emitProgress(written, total);
            installApk(outputFile);
        } catch (IOException e) {
            Log.e(TAG, "download failed", e);
            fail("Download failed: " + e.getMessage());
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private File apkTargetFile() throws IOException {
        // App-specific external dir: readable by our FileProvider, no storage
        // permission needed, and it is cleaned up when the app is uninstalled.
        File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) {
            dir = getContext().getCacheDir();
        }
        if (dir == null) {
            throw new IOException("No writable directory for the update");
        }
        if (!dir.exists() && !dir.mkdirs() && !dir.exists()) {
            throw new IOException("Cannot create " + dir.getAbsolutePath());
        }
        return new File(dir, APK_FILE_NAME);
    }

    private void emitProgress(long written, int total) {
        if (pendingInstallCall == null) return;
        JSObject data = new JSObject();
        data.put("bytes", written);
        if (total > 0) {
            data.put("total", total);
            data.put("percent", (int) Math.min(100L, (written * 100L) / total));
        }
        final JSObject payload = data;
        runOnUiThread(() -> {
            try {
                notifyListeners("downloadProgress", payload);
            } catch (Exception e) {
                Log.w(TAG, "progress emit failed", e);
            }
        });
    }

    // -------------------------------------------------------------- install

    private void installApk(File apkFile) {
        if (!apkFile.exists() || apkFile.length() == 0) {
            fail("Downloaded APK is missing or empty");
            return;
        }
        try {
            installWithSession(apkFile);
        } catch (Exception e) {
            Log.w(TAG, "PackageInstaller session failed, using install intent", e);
            abandonPendingSessions();
            installWithIntent(apkFile);
        }
    }

    private void installWithSession(File apkFile) throws IOException {
        PackageInstaller installer = getContext().getPackageManager().getPackageInstaller();

        PackageInstaller.SessionParams params =
                new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(getContext().getPackageName());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Let the platform decide whether a confirmation is needed. For a
            // self-update it usually is not.
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED);
        }

        int sessionId = installer.createSession(params);
        PackageInstaller.Session session = installer.openSession(sessionId);
        try {
            long size = apkFile.length();
            try (InputStream in = new FileInputStream(apkFile);
                 OutputStream out = session.openWrite(APK_FILE_NAME, 0, size)) {
                byte[] buffer = new byte[16384];
                int len;
                while ((len = in.read(buffer)) > 0) {
                    out.write(buffer, 0, len);
                }
                session.fsync(out);
            }
        } finally {
            session.close();
        }

        registerInstallReceiver();

        Intent resultIntent = new Intent(INSTALL_RESULT_ACTION);
        resultIntent.setPackage(getContext().getPackageName());
        // FLAG_MUTABLE is required: the platform fills in EXTRA_INTENT and
        // EXTRA_STATUS on this very intent. It targets our own package, so it
        // is not an implicit intent (which Android 14 forbids being mutable).
        PendingIntent pending = PendingIntent.getBroadcast(
                getContext(),
                sessionId,
                resultIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);

        session.commit(pending.getIntentSender());
    }

    /**
     * Legacy path: hand the APK to the system package installer through a
     * FileProvider content URI. Works on every API level, but always shows a
     * confirmation and is the path Android 14 discourages.
     */
    private void installWithIntent(File apkFile) {
        try {
            Uri apkUri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    apkFile);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.setFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                    | Intent.FLAG_ACTIVITY_NEW_TASK);
            runOnUiThread(() -> {
                try {
                    getContext().startActivity(intent);
                    resolvePending("pendingUserAction", null);
                } catch (Exception e) {
                    fail("Cannot start the installer: " + e.getMessage());
                }
            });
        } catch (Exception e) {
            fail("Cannot prepare the installer: " + e.getMessage());
        }
    }

    // ------------------------------------------------------ install results

    private void registerInstallReceiver() {
        cleanupReceiver();
        installResultReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                handleInstallResult(intent);
            }
        };
        IntentFilter filter = new IntentFilter(INSTALL_RESULT_ACTION);
        // targetSdk 34 requires an explicit export flag on runtime receivers.
        // The system delivers this one through our own PendingIntent.
        ContextCompat.registerReceiver(
                getContext(), installResultReceiver, filter,
                ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    private void handleInstallResult(Intent intent) {
        int status = intent.getIntExtra(
                PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        String message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);

        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            // We must launch the confirmation ourselves or the install hangs
            // forever waiting for a dialog nobody opened. The app is in the
            // foreground (the user just tapped update), so this is allowed.
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) {
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    getContext().startActivity(confirm);
                } catch (Exception e) {
                    Log.e(TAG, "cannot open install confirmation", e);
                    fail("Cannot open the install confirmation: " + e.getMessage());
                    cleanupReceiver();
                    return;
                }
            }
            resolvePending("pendingUserAction", null);
            return; // keep the receiver alive for the final outcome
        }

        if (status == PackageInstaller.STATUS_SUCCESS) {
            emitInstallResult("success", null);
            resolvePending("success", null);
        } else {
            String error = (message == null || message.isEmpty())
                    ? ("Install failed (status " + status + ")")
                    : message;
            emitInstallResult("failed", error);
            fail(error);
        }
        cleanupReceiver();
    }

    private void emitInstallResult(String status, String error) {
        JSObject data = new JSObject();
        data.put("status", status);
        if (error != null) data.put("error", error);
        runOnUiThread(() -> {
            try {
                notifyListeners("installResult", data);
            } catch (Exception e) {
                Log.w(TAG, "install result emit failed", e);
            }
        });
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);
        if (requestCode == OPEN_SETTINGS_REQUEST && pendingInstallCall != null) {
            JSObject result = new JSObject();
            result.put("canInstall", canInstallPackages());
            pendingInstallCall.resolve(result);
            pendingInstallCall = null;
        }
    }

    // ---------------------------------------------------------------- helpers

    private boolean canInstallPackages() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return getContext().getPackageManager().canRequestPackageInstalls();
        }
        // Below Android 8 there is no per-app "install unknown apps" switch.
        return true;
    }

    private void abandonPendingSessions() {
        try {
            PackageInstaller installer = getContext().getPackageManager().getPackageInstaller();
            String self = getContext().getPackageName();
            for (PackageInstaller.SessionInfo info : installer.getMySessions()) {
                if (info != null && self.equals(info.getAppPackageName())) {
                    try {
                        installer.abandonSession(info.getSessionId());
                    } catch (Exception ignored) {
                        // Best effort: a stale session is harmless.
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "could not clean install sessions", e);
        }
    }

    private void cleanupReceiver() {
        if (installResultReceiver != null) {
            try {
                getContext().unregisterReceiver(installResultReceiver);
            } catch (Exception ignored) {
                // Already gone.
            }
            installResultReceiver = null;
        }
    }

    private void resolvePending(String status, String error) {
        if (pendingInstallCall == null) return;
        JSObject result = new JSObject();
        result.put("status", status);
        if (error != null) result.put("error", error);
        pendingInstallCall.resolve(result);
        pendingInstallCall = null;
    }

    private void fail(String message) {
        if (pendingInstallCall == null) {
            Log.e(TAG, message);
            return;
        }
        pendingInstallCall.reject(message);
        pendingInstallCall = null;
    }

    private void runOnUiThread(Runnable action) {
        Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(action);
        } else {
            action.run();
        }
    }

    @Override
    protected void handleOnDestroy() {
        cleanupReceiver();
        super.handleOnDestroy();
    }
}
