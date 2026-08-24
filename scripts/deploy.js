# Digital Pulse Pro - Deploy Script

const { execSync } = require('child_process');

console.log('Deploying to Firebase Hosting...');

try {
  execSync('npm run build', { stdio: 'inherit' });
  execSync('firebase deploy --only hosting', { stdio: 'inherit' });
  console.log('Deployment successful!');
} catch (error) {
  console.error('Deployment failed:', error.message);
  process.exit(1);
}