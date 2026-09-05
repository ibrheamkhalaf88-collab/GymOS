// ============================================================
// Digital Pulse — Desktop shell (Electron)
// Serves the bundled www/ over a privileged app:// scheme so
// ES modules + fetch work exactly like on GitHub Pages.
// ============================================================
const { app, BrowserWindow, protocol, net } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "www");

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    title: "Digital Pulse — GymOS",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.loadURL("app://bundle/onboarding.html");
}

app.whenReady().then(() => {
  protocol.handle("app", (request) => {
    const { pathname } = new URL(request.url);
    const rel = decodeURIComponent(pathname).replace(/^\/+/, "");
    return net.fetch(pathToFileURL(path.join(ROOT, rel || "onboarding.html")).toString());
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
