// Simulate the activate flow in demo mode

const DEMO_KEY = 'dp_demo_codes';
const LICENSE_KEY = 'dp_license';

// Mock localStorage
const storage = {
  data: {},
  getItem: function(k) { return this.data[k] || null; },
  setItem: function(k, v) { this.data[k] = v; },
  removeItem: function(k) { delete this.data[k]; }
};
global.localStorage = storage;

// Initialize with codes including our reserve code
function normalizeCode(raw) {
  const clean = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.length === 6 ? clean.slice(0,3) + '-' + clean.slice(3) : null;
}

storage.setItem(DEMO_KEY, JSON.stringify([
  { id: '7Q2-K9D', code: '7Q2-K9D', tier: 'monthly', days: 30, owner: '', createdAt: Date.now(), used: false, revoked: false },
  { id: '204-0IB', code: '204-0IB', tier: 'monthly', days: 30, owner: 'Reserve backup', createdAt: Date.now(), used: false, revoked: false }
]));

console.log('=== Simulating code activation for 204-0IB ===');

// Step 1: activate
function activate(code, deviceInfo) {
  const id = normalizeCode(code);
  const list = JSON.parse(storage.getItem(DEMO_KEY) || '[]');
  const item = list.find(c => c.code === id);
  if (!item) return { ok: false, error: 'NOT_FOUND' };
  if (item.used) return { ok: false, error: 'ALREADY_USED' };
  if (item.revoked) return { ok: false, error: 'REVOKED' };
  
  Object.assign(item, {
    used: true, usedAt: Date.now(),
    usedDevice: deviceInfo.deviceId, usedDeviceName: deviceInfo.deviceName,
  });
  storage.setItem(DEMO_KEY, JSON.stringify(list));
  
  return { ok: true, record: item };
}

const result = activate('204-0IB', {
  deviceId: 'device_123',
  deviceName: 'Test Device'
});

console.log('Activate result:', result.ok ? 'SUCCESS' : 'FAILED - ' + (result.error || 'unknown'));

// Step 2: license.save
console.log('\n--- license.save ---');
function licenseSave(record) {
  const data = {
    code: record.code,
    tier: record.tier || 'standard',
    owner: String(record.owner || ''),
    activatedAt: Date.now(),
    expiresAt: record.days > 0 ? Date.now() + record.days * 86400000 : 0,
    deviceId: 'device_123',
    deviceName: 'Test Device',
    data_enabled: true,
    sync_enabled: true,
    device_limit: 3,
  };
  storage.setItem(LICENSE_KEY, JSON.stringify(data));
  console.log('License saved code:', data.code);
}

licenseSave(result.record);

// Step 3: Check state
console.log('\n=== localStorage state after activation ===');
const licenseData = JSON.parse(storage.getItem(LICENSE_KEY) || '{}');
console.log('dp_license:', licenseData.code ? 'PRESENT (' + licenseData.code + ')' : 'MISSING');
console.log('dp_demo_codes count:', JSON.parse(storage.getItem(DEMO_KEY) || '[]').length, 'codes');
console.log('License code:', licenseData.code);

// Step 4: Check if user stays logged in
function licenseIsActive() {
  const l = JSON.parse(storage.getItem(LICENSE_KEY) || 'null');
  if (!l) return false;
  if (l.expiresAt === 0) return true;
  return Date.now() < l.expiresAt;
}

console.log('\n=== license.isActive():', licenseIsActive() ? 'TRUE (user stays logged in)' : 'FALSE (user logged out)');
console.log('\n=== Conclusion: After activation, license is saved and user stays logged in ===');

// Step 5: What happens on page load in activate.js?
// Line 12: if (license.isActive()) { location.replace("app.html"); }
// This means if license is active, they go to app.html - this is correct flow

console.log('\n=== Flow: User enters code -> activate succeeds -> license saved -> redirect to app.html ===');