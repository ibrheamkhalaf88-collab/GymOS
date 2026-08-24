# Digital Pulse Pro - Build & Deploy Script

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function build() {
  console.log('Building Digital Pulse Pro...');

  // Copy src to public (for any assets that need to be served)
  if (fs.existsSync(SRC_DIR)) {
    copyRecursive(SRC_DIR, path.join(PUBLIC_DIR, 'src'));
  }

  console.log('Build complete!');
}

build();