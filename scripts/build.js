// Build script for production/staging
// Usage: node scripts/build.js [--output dist] [--production]
//        NODE_ENV=production node scripts/build.js [--output dist]   (still supported)
//
// The --production flag exists because `NODE_ENV=production node ...` is not
// portable: it fails on Windows cmd/PowerShell (npm scripts run via cmd.exe).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production" || process.argv.includes("--production");

const OUTPUT_DIR = process.argv.includes("--output")
  ? path.join(ROOT, process.argv[process.argv.indexOf("--output") + 1])
  : path.join(ROOT, "dist");

const FILES_TO_PROCESS = [
  "js/config.js",
  "js/admin-panel.js",
  "js/db.js",
];

const FILES_TO_COPY = [
  "index.html", "onboarding.html", "login.html", "signup.html", "reset-password.html",
  "activate.html", "contact.html", "app.html", "ibrheam.html", "privacy-policy.html",
  "admin.html", "admin-login.html", "admin-reset-password.html",
  "manifest.webmanifest", "sw.js",
  ...FILES_TO_PROCESS,
];

const DIRS_TO_COPY = ["js", "css", "vendor", "assets", "auth"];

function processConfigJs(content) {
  if (IS_PROD) {
    // Generate complete production config - full replacement
    return `// ============================================================
// Digital Pulse — App configuration (PRODUCTION BUILD)
// ============================================================

// الجذر المطلق للتطبيق (يشتغل على GitHub Pages تحت /GymOS/ وعلى localhost)
// يُحسب من موقع ملف config.js (js/config.js → الجذر)
export const APP_BASE = new URL("../", import.meta.url).href;

// Production build: isProduction is hardcoded to true
const isProduction = true;

export const appConfig = {
  brand: "DIGITAL PULSE",
  brandAr: "النبض الرقمي",

  // إصدار التطبيق — لازم يطابق versionName بالـ APK ويتحدث مع كل إصدار جديد
  appVersion: "1.4.3",

  // للدعم والتواصل (يظهر في شاشة التفعيل)
  supportPhone: "+972 568 802 803",
  supportWhatsApp: "972568802803", // بدون + أو مسافات

  // صلاحية المدير — يجب أن يطابق البريد في server/.env
  adminEmail: "ibrheamshady@gmail.com",
  adminDisplayName: "ADM_ROOT",

  // 🗄️ Supabase — Authentication + Edge Functions
  supabaseUrl: "https://mwfbgucayjgbbvcyelbo.supabase.co",
  // SECURITY: Anon key MUST BE ROTATED at deploy time via CI/CD secret injection
  supabaseAnonKey: "REPLACE_WITH_ROTATED_ANON_KEY_AT_DEPLOY_TIME",
  apiUrl: "https://mwfbgucayjgbbvcyelbo.functions.supabase.co/gymos-api",

  // Google OAuth — for Google Drive backup (set in Google Cloud Console)
  // Enable "Google Drive API" and create OAuth 2.0 credentials
  // Authorized redirect URI: https://<your-domain>/GymOS/auth/drive-callback.html
  googleClientId: "", // e.g., "123456789-abc.apps.googleusercontent.com"

  language: "en",

  // بيئة التشغيل (للاستخدام في الكود)
  isProduction,
  
  // Demo mode: متاح فقط في بيئة التطوير المحلية
  // في الإنتاج: IS_DEMO سيكون دائماً false ولا يمكن تفعيله
  demoModeEnabled: false,
};
`;
  }
  return content;
}

function processAdminPanelJs(content) {
  if (IS_PROD) {
    return content
      // Replace IS_DEMO definition
      .replace(
        /const IS_DEMO = !appConfig\.isProduction && \(sessionStorage\.getItem\('dp_demo_admin'\) === '1' \|\| TOKEN\.startsWith\('demo-'\)\);/,
        `const IS_DEMO = false;`
      )
      // Remove the production guard block
      .replace(
        /\/\/ In production, demo mode is completely disabled[\s\S]*?if \(appConfig\.isProduction && IS_DEMO\) \{[\s\S]*?\n\s*IS_DEMO = false;\n\s*\}/,
        `// Production build: demo mode completely removed`
      )
      // Simplify assertOnlineMode - always return true in production
      .replace(
        /function assertOnlineMode\(featureName\) \{[\s\S]*?if \(IS_DEMO\) \{[\s\S]*?return false;\s*\}\s*return true;\s*\}/,
        `function assertOnlineMode(featureName) { return true; }`
      )
      // Remove demo user checks in gymCodesFor
      .replace(
        /if \(u\._demo\) \{ showToast\('Demo users have no cloud data \/ مستخدمو Demo ليس لديهم بيانات سحابية', 'error'\); return null; \}/g,
        `// Demo user check removed in production`
      )
      // Remove demo mode checks in gymCodesFor (the online-only check)
      .replace(
        /if \(IS_DEMO\) \{ showToast\('Cloud data is online-only \/ بيانات السحابة متاحة في الوضع الأونلاين فقط', 'error'\); return null; \}/g,
        `// Demo mode check removed in production`
      )
      // Simplify modeText logic - always production mode
      .replace(
        /const modeText = IS_DEMO \? 'OFFLINE \/ محلي \(Demo\)' : \(appConfig\.isProduction \? 'ONLINE \/ إنتاج' : 'ONLINE \/ تطوير'\);/,
        `const modeText = 'ONLINE / إنتاج';`
      )
      .replace(
        /const modeColor = IS_DEMO \? '#ff9800' : '#CCFF00';/,
        `const modeColor = '#CCFF00';`
      )
      .replace(
        /const modeBorder = IS_DEMO \? '#ff980055' : '#CCFF0055';/,
        `const modeBorder = '#CCFF0055';`
      )
      // Simplify adminEmailDisplay
      .replace(
        /elements\.adminEmailDisplay\.textContent = IS_DEMO\s*\?\s*'admin@gym\.local \(Demo\)'[^;]*;/,
        `elements.adminEmailDisplay.textContent = (((() => { try { return JSON.parse(localStorage.getItem('dp_current_user') || 'null'); } catch { return null; } })() || {}).email || 'Admin');`
      )
      // Remove demo admin removal on logout
      .replace(
        /sessionStorage\.removeItem\('dp_demo_admin'\);/g,
        `// Demo mode cleanup removed`
      )
      // Remove demo branch in loadUsers
      .replace(
        /if \(IS_DEMO\) throw new Error\('demo'\);/g,
        `// Demo branch removed`
      )
      // Remove demo fallback in loadUsers catch
      .replace(
        /\}\s*const users = \(await demoGetUsers\(\)\)\.map\(u => normalizeUser\(\{ \.\.\.u, _demo: true \}\)\);/g,
        `// Demo fallback removed`
      )
      // Remove demo branch in saveUser
      .replace(
        /if \(IS_DEMO\) \{[\s\S]*?const created = await demoCreateUser\([\s\S]*?\}\s*else \{/g,
        `{`
      )
      .replace(
        /\}\s*if \(IS_DEMO\) \{[\s\S]*?await demoUpdateUser\([\s\S]*?\}\s*else \{/g,
        `{`
      )
      // Remove demo branch in editUser
      .replace(
        /if \(IS_DEMO\) \{[\s\S]*?await demoUpdateUser\([\s\S]*?\}\s*else \{/g,
        `{`
      )
      // Remove demo branch in suspend/activate
      .replace(
        /if \(IS_DEMO\) \{[\s\S]*?await demoUpdateUser\([\s\S]*?\}\s*else \{/g,
        `{`
      )
      // Remove demo branch in loadCodes
      .replace(
        /if \(IS_DEMO\) \{[\s\S]*?rows = demoCodesAll\(\);[\s\S]*?\}\s*else \{/g,
        `{`
      )
      // Remove demo branch in createCode
      .replace(
        /if \(IS_DEMO\) \{[\s\S]*?const list = demoCodesAll\(\);[\s\S]*?\}\s*else \{/g,
        `{`
      )
      // Remove demo branch in resetCodePassword
      .replace(
        /if \(IS_DEMO\) \{[\s\S]*?const list = demoCodesAll\(\);[\s\S]*?\}\s*else \{/g,
        `{`
      )
      // Remove demo branch in coupon functions
      .replace(
        /if \(IS_DEMO\) return localCoupons\(\);/g,
        `// Demo coupons removed`
      )
      .replace(
        /if \(IS_DEMO\) \{[\s\S]*?localStorage\.setItem\('dp_coupons', JSON\.stringify\(c\)\);[\s\S]*?\}\s*else \{/g,
        `{`
      )
      // Remove unused demo imports
      .replace(
        /import \{ demoUsersAll, demoUsersSave, findDemoUser, demoAll as demoCodesAll \} from '\.\/db\.js';/,
        `// Demo imports removed in production`
      );
  }
  return content;
}

function processDbJs(content) {
  if (IS_PROD) {
    return content
      // Force online mode
      .replace(
        /export const onlineMode = \(\) => !!API\(\);/,
        `export const onlineMode = () => true;`
      )
      .replace(
        /const onlineMode = \(\) => !!API\(\);/,
        `const onlineMode = () => true;`
      )
      // Remove demoAdminPassword
      .replace(
        /demoAdminPassword: "[^"]+",/,
        `// demoAdminPassword removed in production`
      )
      // Remove demo mode from adminSignIn - replace the whole demo branch
      .replace(
        /if \(onlineMode\(\)\) \{[\s\S]*?const r = await api\("\/api\/admin\/login"[\s\S]*?sessionStorage\.setItem\("dp_admin_token", r\.token\);[\s\S]*?return;\s*\}\s*const \{ appConfig \} = await import\("\.\/config\.js"\);[\s\S]*?if \(email\.trim\(\)\.toLowerCase\(\) !== appConfig\.adminEmail\.toLowerCase\(\)\) \{[\s\S]*?throw new Error\("Email not found \/ البريد الإلكتروني غير موجود"\);[\s\S]*?if \(password !== appConfig\.demoAdminPassword\) throw new Error\("Wrong password \/ كلمة المرور خاطئة"\);[\s\S]*?sessionStorage\.setItem\("dp_demo_admin", "1"\);[\s\S]*?_notifyDemo\(\);[\s\S]*?\}/,
        `const r = await api("/api/admin/login", { method: "POST", body: { email, password } }); sessionStorage.setItem("dp_admin_token", r.token);`
      )
      // Remove demo mode from adminSignOut
      .replace(
        /if \(onlineMode\(\)\) \{ sessionStorage\.removeItem\("dp_admin_token"\); return; \}[\s\S]*?sessionStorage\.removeItem\("dp_demo_admin"\);[\s\S]*?_notifyDemo\(\);/,
        `sessionStorage.removeItem("dp_admin_token");`
      )
      // Remove demo exports
      .replace(
        /export \{ demoUsersAll, demoUsersSave, demoSeedUsers, findDemoUser, demoAll \};/,
        `// Demo exports removed in production`
      );
  }
  return content;
}

async function main() {
  // Clean output directory
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Copy directories
  for (const dir of DIRS_TO_COPY) {
    const src = path.join(ROOT, dir);
    const dest = path.join(OUTPUT_DIR, dir);
    if (fs.existsSync(src)) {
      copyDir(src, dest);
    }
  }

  // Copy files (will be overwritten by processed versions if in FILES_TO_PROCESS)
  for (const file of FILES_TO_COPY) {
    const src = path.join(ROOT, file);
    const dest = path.join(OUTPUT_DIR, file);
    if (fs.existsSync(src)) {
      // Ensure parent directory exists
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      let content = fs.readFileSync(src, "utf-8");
      
      // Process specific files
      if (FILES_TO_PROCESS.includes(file)) {
        if (file === "js/config.js") content = processConfigJs(content);
        else if (file === "js/admin-panel.js") content = processAdminPanelJs(content);
        else if (file === "js/db.js") content = processDbJs(content);
      }
      
      fs.writeFileSync(dest, content);
    }
  }

  console.log(`Build complete → ${OUTPUT_DIR}`);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});