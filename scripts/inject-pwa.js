// One-off codemod: make every page a real, installable PWA.
//  - link the web app manifest on every page (was only app.html + ibrheam.html)
//  - add the iOS home-screen meta tags (were missing everywhere)
//  - register the service worker on every page (was only app.html)
// Run: node scripts/inject-pwa.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const IOS_META = [
  '  <meta name="apple-mobile-web-app-capable" content="yes" />',
  '  <meta name="mobile-web-app-capable" content="yes" />',
  '  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '  <meta name="apple-mobile-web-app-title" content="Digital Pulse" />',
  '  <link rel="apple-touch-icon" href="assets/icons/icon-192.png" />',
  '  <link rel="apple-touch-icon" sizes="192x192" href="assets/icons/icon-192.png" />',
  '  <link rel="apple-touch-icon" sizes="512x512" href="assets/icons/icon-512.png" />',
].join("\n");

// No <link rel="icon"> anywhere before → every page 404'd /favicon.ico.
const FAVICON = '  <link rel="icon" type="image/png" href="assets/icons/icon-192.png" />';

const MANIFEST = '  <link rel="manifest" href="manifest.webmanifest" />';
const PWA_SCRIPT = '  <script type="module" src="js/pwa.js"></script>';

// The old inline registration in app.html, now living in js/pwa.js.
const OLD_INLINE = /\s*<script>\s*\/\/ PWA offline support[\s\S]*?<\/script>/i;

let changed = 0;
for (const file of fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"))) {
  const full = path.join(ROOT, file);
  let html = fs.readFileSync(full, "utf8");
  const before = html;

  html = html.replace(OLD_INLINE, "");

  if (!/rel="manifest"/.test(html)) {
    // Insert right after the theme-color meta, else after <title>.
    // The match must tolerate both `<meta ... />` and `<meta ...>` — anchoring on
    // a self-closing slash alone silently skipped pages that use the bare form.
    if (/<meta name="theme-color"/i.test(html)) {
      html = html.replace(/(<meta name="theme-color"[^>]*>)/i, (m) => `${m}\n${MANIFEST}`);
    } else if (/<title>[\s\S]*?<\/title>/i.test(html)) {
      html = html.replace(/(<title>[\s\S]*?<\/title>)/i, (m) => `${m}\n${MANIFEST}`);
    } else {
      console.warn(`  ! ${file}: no <title> to anchor the manifest link`);
    }
  }

  if (!/apple-mobile-web-app-capable/.test(html)) {
    if (/<\/head>/i.test(html)) {
      html = html.replace(/<\/head>/i, `${IOS_META}\n</head>`);
    } else {
      console.warn(`  ! ${file}: no </head> for the iOS meta tags`);
    }
  }

  if (!/rel="icon"/.test(html)) {
    if (/<\/head>/i.test(html)) {
      html = html.replace(/<\/head>/i, `${FAVICON}\n</head>`);
    } else {
      console.warn(`  ! ${file}: no </head> for the favicon link`);
    }
  }

  if (!/js\/pwa\.js/.test(html)) {
    if (/<\/body>/i.test(html)) {
      html = html.replace(/<\/body>/i, `${PWA_SCRIPT}\n</body>`);
    } else {
      console.warn(`  ! ${file}: no </body> for the pwa.js tag`);
    }
  }

  if (html !== before) {
    fs.writeFileSync(full, html, "utf8");
    console.log(`  updated ${file}`);
    changed++;
  } else {
    console.log(`  unchanged ${file}`);
  }
}
console.log(`\n${changed} page(s) updated.`);
