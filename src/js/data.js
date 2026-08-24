// Data module - handles all CRUD operations with Firestore
import { appConfig } from './config.js';

class DataModule {
  constructor() {
    this.cache = new Map();
    this.subscribers = new Map();
    this.trash = new Map(); // collection -> array of deleted items with timestamp
  }

  // Subscribe to data changes
  subscribe(collection, callback) {
    if (!this.subscribers.has(collection)) {
      this.subscribers.set(collection, new Set());
    }
    this.subscribers.get(collection).add(callback);
    return () => this.subscribers.get(collection).delete(callback);
  }

  notify(collection, data) {
    const subs = this.subscribers.get(collection);
    if (subs) {
      subs.forEach(cb => cb(data));
    }
  }

  // Generic CRUD methods
  async fetchAll(collection, orgId) {
    // In production: query Firestore with org filter
    return await this.getMockData(collection);
  }

  async fetchOne(collection, id) {
    const data = await this.fetchAll(collection);
    return data.find(item => item.id === id);
  }

  async create(collection, data) {
    const newItem = { ...data, id: Date.now().toString(), createdAt: new Date().toISOString() };
    const existing = JSON.parse(localStorage.getItem(`dp_${collection}`) || '[]');
    existing.push(newItem);
    localStorage.setItem(`dp_${collection}`, JSON.stringify(existing));

    // If it's a member, also add a ledger entry for the payment
    if (collection === 'members' && data.paidAmount > 0) {
      await this.create('ledger', {
        type: 'revenue',
        amount: parseFloat(data.paidAmount),
        description: `Member Join: ${data.name}`,
        descriptionAr: `انضمام عضو: ${data.name}`,
        date: new Date().toISOString().split('T')[0],
        category: 'subscriptions',
        memberId: newItem.id
      });
    }

    this.notify(collection, existing);
    return newItem;
  }

  async update(collection, id, data) {
    const existing = JSON.parse(localStorage.getItem(`dp_${collection}`) || '[]');
    const index = existing.findIndex(item => item.id === id);
    if (index >= 0) {
      existing[index] = { ...existing[index], ...data, updatedAt: new Date().toISOString() };
      localStorage.setItem(`dp_${collection}`, JSON.stringify(existing));
      this.notify(collection, existing);
      return existing[index];
    }
    throw new Error('Item not found');
  }

  async delete(collection, id) {
    const existing = JSON.parse(localStorage.getItem(`dp_${collection}`) || '[]');
    const item = existing.find(i => i.id === id);
    if (!item) throw new Error('Item not found');

    // Store in trash for undo
    if (!this.trash.has(collection)) {
      this.trash.set(collection, []);
    }
    this.trash.get(collection).push({ item, deletedAt: Date.now() });

    const filtered = existing.filter(i => i.id !== id);
    localStorage.setItem(`dp_${collection}`, JSON.stringify(filtered));
    this.notify(collection, filtered);
    return { item, collection };
  }

  async restore(collection, item) {
    const existing = JSON.parse(localStorage.getItem(`dp_${collection}`) || '[]');
    existing.push(item);
    localStorage.setItem(`dp_${collection}`, JSON.stringify(existing));
    this.notify(collection, existing);
    return item;
  }

  clearTrash(collection) {
    if (this.trash.has(collection)) {
      this.trash.get(collection).length = 0;
    }
  }

  async resetAllData() {
    const collections = ['members', 'devices', 'ledger', 'checkins', 'notifications'];
    collections.forEach(c => {
      localStorage.removeItem(`dp_${c}`);
    });
    // Re-seed with fresh data
    for (const c of collections) {
      await this.getMockData(c);
    }
    return true;
  }

  // Mock data for development
  async getMockData(collection) {
    const stored = localStorage.getItem(`dp_${collection}`);
    if (stored) {
      return JSON.parse(stored);
    }

    const seedData = this.getSeedData(collection);
    localStorage.setItem(`dp_${collection}`, JSON.stringify(seedData));
    return seedData;
  }

  getSeedData(collection) {
    switch (collection) {
      case 'members':
        return [
          { id: '1', name: 'John Smith', nameAr: 'جون سميث', phone: '+1234567890', plan: 'pro',
            status: 'active', daysLeft: 45, lastCheckin: '2024-01-15', paymentFailed: false,
            joinDate: '2023-06-15', checkins: 42, paidAmount: 150 },
          { id: '2', name: 'Sarah Johnson', nameAr: 'سارة جونسون', phone: '+1234567891', plan: 'basic',
            status: 'active', daysLeft: 12, lastCheckin: '2024-01-20', paymentFailed: false,
            joinDate: '2023-11-20', checkins: 28, paidAmount: 80 }
        ];

      case 'devices':
        return [
          { id: '1', name: 'Treadmill 04', nameAr: 'جهاز المشي ٠٤', type: 'treadmill',
            status: 'offline', lastSeen: '2 hours ago', error: 'Belt slippage reported',
            location: 'Cardio Room A' }
        ];

      case 'ledger':
        return [
          { id: '1', type: 'revenue', amount: 2450.00, description: 'Initial Revenue',
            descriptionAr: 'إيرادات أولية', date: '2024-01-20', category: 'subscriptions' }
        ];

      case 'checkins':
        const data = [];
        for (let i = 0; i < 30; i++) {
          data.push({
            id: i.toString(),
            date: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)).toISOString(),
            count: Math.floor(20 + Math.random() * 30),
          });
        }
        return data;

      case 'notifications':
        return [
          { id: '1', title: 'Welcome to Pro', titleAr: 'مرحباً بك في برو',
            message: 'System is ready', messageAr: 'النظام جاهز',
            type: 'info', read: false, time: '10:00 AM', timeAr: '١٠:٠٠ ص' }
        ];

      default:
        return [];
    }
  }

  async getStats() {
    const members = await this.fetchAll('members');
    const devices = await this.fetchAll('devices');
    const ledger = await this.fetchAll('ledger');
    const notifications = await this.fetchAll('notifications');
    const checkins = await this.fetchAll('checkins');

    return {
      activeMembers: members.filter(m => m.status === 'active' || m.status === 'trial').length,
      endedToday: members.filter(m => m.status === 'expired' && m.daysLeft === -1).length,
      totalExpired: members.filter(m => m.status === 'expired').length,
      alerts: devices.filter(d => d.status === 'offline').length,
      unpaid: members.filter(m => m.paymentFailed).length,
      totalRevenue: ledger.filter(l => l.type === 'revenue').reduce((sum, l) => sum + l.amount, 0),
      totalExpenses: ledger.filter(l => l.type === 'expense').reduce((sum, l) => sum + l.amount, 0),
      checkinData: checkins.slice(0, 7).reverse().map(c => c.count)
    };
  }
}

export const data = new DataModule();