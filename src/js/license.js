// License Activation Module
// نظام التحقق من أكواد التفعيل

const LICENSE_STORAGE_KEY = 'dp_license';
const ACTIVATED_STORAGE_KEY = 'dp_activated';
const DEVICE_ID_KEY = 'dp_device_id';

// Generate unique device ID
function getDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    // Generate random device ID based on browser info
    const navInfo = navigator.userAgent + navigator.language + screen.width + screen.height;
    deviceId = 'device_' + btoa(navInfo).substring(0, 24) + '_' + Date.now();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

// Check if already activated
function isActivated() {
  const license = localStorage.getItem(LICENSE_STORAGE_KEY);
  const activated = localStorage.getItem(ACTIVATED_STORAGE_KEY);
  return !!(license && activated);
}

// Get current license
function getLicense() {
  return localStorage.getItem(LICENSE_STORAGE_KEY);
}

// Get activation date
function getActivatedDate() {
  return localStorage.getItem(ACTIVATED_STORAGE_KEY);
}

// Activate license
async function activate(licenseKey) {
  try {
    // Validate format
    if (!licenseKey || licenseKey.length < 6) {
      return { success: false, error: 'Invalid license key format' };
    }

    // Try to fetch licenses from server
    let licenses = null;

    try {
      // Try to fetch from hidden endpoint
      const response = await fetch('/.netlify/functions/licenses.json', {
        method: 'GET',
        cache: 'no-store'
      });

      if (response.ok) {
        const data = await response.json();
        licenses = data.licenses || [];
      }
    } catch (e) {
      console.log('Could not fetch from server, using fallback');
    }

    // Fallback: check against local storage (for development)
    if (!licenses) {
      // Development mode: allow any key starting with DPRO-
      if (licenseKey.startsWith('DPRO-') || licenseKey.startsWith('demo-')) {
        // Save locally
        localStorage.setItem(LICENSE_STORAGE_KEY, licenseKey);
        localStorage.setItem(ACTIVATED_STORAGE_KEY, new Date().toISOString());

        return {
          success: true,
          license: licenseKey,
          activatedAt: new Date().toISOString()
        };
      }

      // Also accept simple keys for testing
      if (licenseKey.length >= 6 && /^[A-Z0-9]+$/i.test(licenseKey)) {
        localStorage.setItem(LICENSE_STORAGE_KEY, licenseKey);
        localStorage.setItem(ACTIVATED_STORAGE_KEY, new Date().toISOString());

        return {
          success: true,
          license: licenseKey,
          activatedAt: new Date().toISOString()
        };
      }

      return { success: false, error: 'Invalid license key' };
    }

    // Find the license in the list
    const licenseInfo = licenses.find(l =>
      l.code.toUpperCase() === licenseKey.toUpperCase()
    );

    if (!licenseInfo) {
      return { success: false, error: 'License key not found' };
    }

    // Check if already used
    if (licenseInfo.status === 'used') {
      // Check if it's the same device
      if (licenseInfo.deviceId && licenseInfo.deviceId !== getDeviceId()) {
        return { success: false, error: 'License already activated on another device' };
      }

      // Same device, allow reactivation
      localStorage.setItem(LICENSE_STORAGE_KEY, licenseKey);
      localStorage.setItem(ACTIVATED_STORAGE_KEY, new Date().toISOString());

      return {
        success: true,
        license: licenseKey,
        activatedAt: new Date().toISOString(),
        reactivated: true
      };
    }

    // Activate the license
    const deviceId = getDeviceId();

    // Update local storage
    localStorage.setItem(LICENSE_STORAGE_KEY, licenseKey);
    localStorage.setItem(ACTIVATED_STORAGE_KEY, new Date().toISOString());

    // Note: In production, you would update the server here
    // This would typically be done via a server-side function

    return {
      success: true,
      license: licenseKey,
      activatedAt: new Date().toISOString(),
      deviceId: deviceId
    };

  } catch (error) {
    console.error('License activation error:', error);
    return { success: false, error: 'Activation failed. Please try again.' };
  }
}

// Deactivate (for testing or account change)
function deactivate() {
  localStorage.removeItem(LICENSE_STORAGE_KEY);
  localStorage.removeItem(ACTIVATED_STORAGE_KEY);
  // Note: deviceId is kept for tracking
}

// Check and redirect if not activated
function checkActivation() {
  if (!isActivated()) {
    window.location.href = '/public/license.html';
    return false;
  }
  return true;
}

// Export functions
export const license = {
  activate,
  deactivate,
  isActivated,
  getLicense,
  getActivatedDate,
  checkActivation,
  getDeviceId
};