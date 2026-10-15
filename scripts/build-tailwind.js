// Build script to extract Tailwind CSS into a static file
// Usage: node scripts/build-tailwind.js

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function buildTailwindCSS() {
  console.log("Building Tailwind CSS...");
  
  // Use the tailwindcss CLI to build the CSS
  const inputCSS = path.join(ROOT, "css", "theme.css");
  const outputCSS = path.join(ROOT, "dist", "tailwind.css");
  const configPath = path.join(ROOT, "tailwind.config.cjs");
  
  // Ensure dist directory exists
  const distDir = path.join(ROOT, "dist");
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  
  // Use npx tailwindcss to build
  const cmd = `npx tailwindcss -i "${inputCSS}" -o "${outputCSS}" -c "${configPath}" --minify`;
  console.log("Running:", cmd);
  
  try {
    execSync(cmd, { 
      cwd: ROOT, 
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production" }
    });
    
    // Read the generated CSS
    const css = fs.readFileSync(path.join(ROOT, "dist", "tailwind.css"), "utf-8");
    console.log("Tailwind CSS built successfully:", path.join(ROOT, "dist", "tailwind.css"));
    console.log("Size:", (css.length / 1024).toFixed(2), "KB");
  } catch (error) {
    console.error("Build failed:", error.message);
    process.exit(1);
  }
}

buildTailwindCSS();