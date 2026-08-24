// Authentication module
import { appConfig } from './config.js';
import { auth as fbAuth, db, isFirebaseConfigured } from './firebase-config.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

class AuthModule {
  constructor() {
    this.user = null;
    this.organization = null;
  }

  async init() {
    // Check for existing session
    const session = localStorage.getItem('dp_session');
    if (session) {
      try {
        const parsed = JSON.parse(session);
        if (parsed.user && parsed.expires > Date.now()) {
          this.user = parsed.user;
          this.organization = parsed.organization;
          return true;
        }
      } catch (e) {
        console.error('Session parse error:', e);
        localStorage.removeItem('dp_session');
      }
    }
    return false;
  }

  async login(email, password) {
    try {
      let mockUser;
      
      if (isFirebaseConfigured) {
        // Real Firebase Auth
        const userCred = await signInWithEmailAndPassword(fbAuth, email, password);
        mockUser = {
          uid: userCred.user.uid,
          email: userCred.user.email,
          name: userCred.user.displayName || email.split('@')[0],
          role: 'manager' // Will be fetched from Firestore in production
        };
      } else {
        // Mock for development
        mockUser = {
          uid: "user_123",
          email: email,
          name: email.split('@')[0],
          role: email.includes('admin') ? 'admin' : 'manager'
        };
      }

      // Fetch organization (with or without Firebase depending on config)
      const org = await this.fetchOrganization(mockUser.uid);

      // Activation code logic check
      if (org.activationStatus !== 'active' && !email.includes('admin')) {
        return { success: false, error: 'Account not activated. Please use your activation code.', requiresActivation: true };
      }

      const session = {
        user: mockUser,
        organization: org,
        expires: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
      };

      localStorage.setItem('dp_session', JSON.stringify(session));
      this.user = mockUser;
      this.organization = org;

      return { success: true, user: mockUser };
    } catch (error) {
      console.error("Login Error:", error);
      return { success: false, error: error.message };
    }
  }

  async signup(userData) {
    try {
      let mockUser;

      if (isFirebaseConfigured) {
        // Real Firebase Auth
        const userCred = await createUserWithEmailAndPassword(fbAuth, userData.email, userData.password);
        mockUser = {
          uid: userCred.user.uid,
          email: userData.email,
          name: userData.name,
          role: 'admin'
        };
      } else {
        // Mock fallback
        mockUser = {
          uid: "user_" + Date.now(),
          email: userData.email,
          name: userData.name,
          role: 'admin'
        };
      }

      // Create organization for this user
      const org = await this.createOrganization(mockUser.uid, userData);

      const session = {
        user: mockUser,
        organization: org,
        expires: Date.now() + (24 * 60 * 60 * 1000)
      };

      localStorage.setItem('dp_session', JSON.stringify(session));
      this.user = mockUser;
      this.organization = org;

      return { success: true, user: mockUser };
    } catch (error) {
      console.error("Signup Error:", error);
      return { success: false, error: error.message };
    }
  }

  async fetchOrganization(uid) {
    if (isFirebaseConfigured) {
      const docRef = doc(db, 'organizations', uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data();
      }
    }
    
    // Mock fallback
    return {
      id: "org_" + uid,
      name: "FitZone Gym",
      nameAr: "نادي الفيتزون",
      plan: "pro",
      logo: null,
      activationStatus: "active", // Required for activation code logic
      settings: { locale: "en", timezone: "Asia/Riyadh" }
    };
  }

  async createOrganization(uid, userData) {
    const orgData = {
      id: "org_" + uid,
      name: userData.orgName || "My Organization",
      nameAr: userData.orgNameAr || userData.orgName || "منظمتي",
      plan: "basic",
      logo: null,
      activationStatus: "pending", // Needs activation code to become active
      settings: { locale: "en", timezone: userData.timezone || "Asia/Riyadh" }
    };

    if (isFirebaseConfigured) {
      await setDoc(doc(db, 'organizations', uid), orgData);
    }
    return orgData;
  }

  logout() {
    if (isFirebaseConfigured) {
      signOut(fbAuth);
    }
    localStorage.removeItem('dp_session');
    this.user = null;
    this.organization = null;
    window.location.href = '/auth/login.html';
  }

  isAuthenticated() {
    return !!this.user;
  }

  getCurrentUser() {
    return this.user;
  }

  getCurrentOrg() {
    return this.organization;
  }
}

export const auth = new AuthModule();

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  auth.init();
});