// IndexedDB helper for offline time tracking records
class OfflineDB {
  constructor() {
    this.dbName = 'fms-offline-db';
    this.dbVersion = 1;
    this.db = null;
  }

  // Initialize the database
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('Database failed to open:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        console.log('Database opened successfully');
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object store for clock records
        if (!db.objectStoreNames.contains('clock-records')) {
          const clockStore = db.createObjectStore('clock-records', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          clockStore.createIndex('officerId', 'officerId', { unique: false });
          clockStore.createIndex('timestamp', 'timestamp', { unique: false });
          clockStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        }

        // Create object store for queued API requests
        if (!db.objectStoreNames.contains('queued-requests')) {
          const queueStore = db.createObjectStore('queued-requests', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          queueStore.createIndex('timestamp', 'timestamp', { unique: false });
          queueStore.createIndex('endpoint', 'endpoint', { unique: false });
        }

        // Create object store for offline users
        if (!db.objectStoreNames.contains('offline-users')) {
          const userStore = db.createObjectStore('offline-users', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          userStore.createIndex('officerId', 'officerId', { unique: true });
        }

        // Create object store for sync status
        if (!db.objectStoreNames.contains('sync-status')) {
          db.createObjectStore('sync-status', { keyPath: 'key' });
        }
      };
    });
  }

  // Store a clock record
  async storeClockRecord(record) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['clock-records'], 'readwrite');
      const store = transaction.objectStore('clock-records');
      const request = store.add({
        ...record,
        timestamp: Date.now(),
        syncStatus: 'pending',
        createdAt: new Date().toISOString()
      });

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Get all clock records for an officer
  async getClockRecords(officerId) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['clock-records'], 'readonly');
      const store = transaction.objectStore('clock-records');
      const index = store.index('officerId');
      const request = index.getAll(officerId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Get all pending records for sync
  async getPendingRecords() {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['clock-records'], 'readonly');
      const store = transaction.objectStore('clock-records');
      const index = store.index('syncStatus');
      const request = index.getAll('pending');

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Update record sync status
  async updateSyncStatus(recordId, status) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['clock-records'], 'readwrite');
      const store = transaction.objectStore('clock-records');
      const getRequest = store.get(recordId);

      getRequest.onsuccess = () => {
        const record = getRequest.result;
        if (record) {
          record.syncStatus = status;
          record.syncedAt = new Date().toISOString();
          const updateRequest = store.put(record);
          
          updateRequest.onsuccess = () => resolve(updateRequest.result);
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          reject(new Error('Record not found'));
        }
      };
      
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // Store offline user for PIN authentication
  async storeOfflineUser(user) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['offline-users'], 'readwrite');
      const store = transaction.objectStore('offline-users');
      const request = store.put({
        ...user,
        storedAt: new Date().toISOString()
      });

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Get offline user by officer ID
  async getOfflineUser(officerId) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['offline-users'], 'readonly');
      const store = transaction.objectStore('offline-users');
      const index = store.index('officerId');
      const request = index.get(officerId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Queue API request for later sync
  async queueApiRequest(endpoint, options, data) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['queued-requests'], 'readwrite');
      const store = transaction.objectStore('queued-requests');
      const request = store.add({
        endpoint,
        options,
        data,
        timestamp: Date.now(),
        retryCount: 0
      });

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Get queued requests
  async getQueuedRequests() {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['queued-requests'], 'readonly');
      const store = transaction.objectStore('queued-requests');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Remove queued request after successful sync
  async removeQueuedRequest(requestId) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['queued-requests'], 'readwrite');
      const store = transaction.objectStore('queued-requests');
      const request = store.delete(requestId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Store sync status
  async setSyncStatus(key, value) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['sync-status'], 'readwrite');
      const store = transaction.objectStore('sync-status');
      const request = store.put({ key, value, timestamp: Date.now() });

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Get sync status
  async getSyncStatus(key) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['sync-status'], 'readonly');
      const store = transaction.objectStore('sync-status');
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Get device ID
  getDeviceId() {
    let deviceId = localStorage.getItem('fms-device-id');
    if (!deviceId) {
      deviceId = 'device-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
      localStorage.setItem('fms-device-id', deviceId);
    }
    return deviceId;
  }

  // Get GPS location
  async getCurrentLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not available'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp
          });
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5 minutes
        }
      );
    });
  }
}

// Export singleton instance
export const offlineDB = new OfflineDB();

// Export clock record structure
export const ClockRecordTypes = {
  CLOCK_IN: 'clock_in',
  CLOCK_OUT: 'clock_out',
  BREAK_START: 'break_start',
  BREAK_END: 'break_end'
};

export default offlineDB;
