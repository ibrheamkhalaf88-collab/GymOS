// Syntax gate for every browser-shipped JS file.
//
// Regression guard: commit 01a7563 shipped js/app.js with a missing closing
// brace and NOTHING caught it — eslint.config.mjs deliberately ignores app.js
// (long-template false positives), and the npm tests inspect source text with
// regexes, which does not parse. The app then failed to boot with a bare
// "Unexpected token" and no test ever went red. node --check uses Node's own
// parser, needs no dependency, and treats .js as ESM because package.json sets
// "type": "module".

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const jsDir = path.join(root, "js");
const readApp = () => readFileSync(path.join(jsDir, "app.js"), "utf8");
const readSw = () => readFileSync(path.join(root, "sw.js"), "utf8");

// Top-level hard imports of js/app.js (relative ./x.js paths, with extension).
const hardImports = (src) =>
  [...src.matchAll(/^import\s+(?:[^'"]*?\s+from\s+)?["']\.\/([^"']+)["']/gm)].map((m) => m[1]);

test("every browser-shipped JS file parses (app.js once shipped with a missing brace)", () => {
  const files = readdirSync(jsDir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => path.join(jsDir, f));
  // The root-level service worker ships to browsers too.
  files.push(path.join(root, "sw.js"));

  const broken = [];
  for (const file of files) {
    try {
      execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    } catch (e) {
      const firstLines = String(e.stderr || e.message).split("\n").slice(0, 2).join(" | ");
      broken.push(path.relative(root, file) + " :: " + firstLines);
    }
  }
  assert.deepEqual(
    broken,
    [],
    `${broken.length} file(s) fail node --check:\n${broken.join("\n")}`
  );
});

test("sw.js precaches every module app.js hard-imports", () => {
  // A module missing from the precache list returns index.html on a cold
  // offline start where JS was expected — the whole app dies (see the sw.js
  // comments). app.js's import lines are the source of truth for first-level
  // hard imports.
  const sw = readSw();
  for (const mod of hardImports(readApp())) {
    assert.match(
      sw,
      new RegExp(`"js/${mod.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
      `js/${mod} is imported by app.js but missing from the service-worker precache`
    );
  }
});