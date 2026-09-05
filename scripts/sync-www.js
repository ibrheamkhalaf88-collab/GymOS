// Copies the web app into www/ for Capacitor (Android build)
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DEST = path.join(ROOT, "www");

const FILES = [
  "index.html", "onboarding.html", "activate.html", "app.html", "ibrheam.html",
  "manifest.webmanifest", "sw.js",
];
const DIRS = ["js", "css", "vendor", "assets"];

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });

for (const f of FILES) fs.copyFileSync(path.join(ROOT, f), path.join(DEST, f));
for (const d of DIRS) {
  fs.cpSync(path.join(ROOT, d), path.join(DEST, d), { recursive: true });
}
console.log("www/ ready for Capacitor ✓");