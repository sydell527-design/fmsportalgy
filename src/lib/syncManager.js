import { offlineDB } from './offlineDB.js';

class SyncManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.syncInProgress = false;
    this.syncInterval = null;
    this.retryInterval = 30000; // 30 seconds
    this.maxRetries = 3;
    
    // Listen for online/offline events
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));
    
    // Start periodic sync check
    this.startPeriodicSync();
  }

  // Handle coming back online
  async handleOnline() {
    console.log('SyncManager: Connection restored');
    this.isOnline = true;
    await this.setSyncStatus('online');
    
    // Start immediate sync
    this.syncPendingData();
    
    // Trigger background sync if supported
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('sync-queued-requests');
        console.log('SyncManager: Background sync registered');
      } catch (error) {
        console.log('SyncManager: Background sync not supported:', error);
      }
    }
  }

  // Handle going offline
  async handleOffline() {
    console.log('SyncManager: Connection lost');
    this.isOnline = false;
    await this.setSyncStatus('offline');
  }

  // Start periodic sync checking
  startPeriodicSync() {
    this.syncInterval = setInterval(() => {
      if (this.isOnline && !this.syncInProgress) {
        this.checkAndSync();
      }
    }, this.retryInterval);
  }

  // Stop periodic sync
  stopPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // Check if sync is needed and perform it
  async checkAndSync() {
    try {
      const pendingRecords = await offlineDB.getPendingRecords();
      const queuedRequests = await offlineDB.getQueuedRequests();
      
      if (pendingRecords.length > 0 || queuedRequests.length > 0) {
        await this.setSyncStatus('syncing');
        await this.syncPendingData();
      } else {
        await this.setSyncStatus('synced');
      }
    } catch (error) {
      console.error('SyncManager: Check and sync failed:', error);
      await this.setSyncStatus('error');
    }
  }

  // Sync all pending data
  async syncPendingData() {
    if (this.syncInProgress || !this.isOnline) {
      return;
    }

    this.syncInProgress = true;
    console.log('SyncManager: Starting sync process');

    try {
      // Sync queued API requests first
      await this.syncQueuedRequests();
      
      // Sync clock records
      await this.syncClockRecords();
      
      await this.setSyncStatus('synced');
      console.log('SyncManager: Sync completed successfully');
      
      // Show success notification if supported
      this.showNotification('Sync completed', 'All data has been synced successfully');
      
    } catch (error) {
      console.error('SyncManager: Sync failed:', error);
      await this.setSyncStatus('error');
      this.showNotification('Sync failed', 'Some data could not be synced. Will retry later.');
    } finally {
      this.syncInProgress = false;
    }
  }

  // Sync queued API requests
  async syncQueuedRequests() {
    const queuedRequests = await offlineDB.getQueuedRequests();
    
    for (const request of queuedRequests) {
      try {
        const response = await fetch(request.endpoint, request.options);
        
        if (response.ok) {
          // Remove from queue on success
          await offlineDB.removeQueuedRequest(request.id);
          console.log(`SyncManager: Queued request ${request.id} synced successfully`);
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.error(`SyncManager: Failed to sync request ${request.id}:`, error);
        
        // Update retry count
        request.retryCount = (request.retryCount || 0) + 1;
        
        // Remove from queue if max retries exceeded
        if (request.retryCount >= this.maxRetries) {
          await offlineDB.removeQueuedRequest(request.id);
          console.warn(`SyncManager: Request ${request.id} removed after ${this.maxRetries} retries`);
        }
      }
    }
  }

  // Sync clock records
  async syncClockRecords() {
    const pendingRecords = await offlineDB.getPendingRecords();
    
    for (const record of pendingRecords) {
      try {
        // Prepare the data for the API
        const apiData = {
          officerId: record.officerId,
          officerName: record.officerName,
          siteName: record.siteName,
          type: record.type,
          timestamp: record.timestamp,
          latitude: record.latitude,
          longitude: record.longitude,
          deviceId: record.deviceId,
          notes: record.notes || ''
        };

        // Send to appropriate API endpoint
        const endpoint = record.type === 'clock_in' ? '/api/timesheets/clock-in' : '/api/timesheets/clock-out';
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(apiData)
        });

        if (response.ok) {
          // Mark as synced
          await offlineDB.updateSyncStatus(record.id, 'synced');
          console.log(`SyncManager: Clock record ${record.id} synced successfully`);
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.error(`SyncManager: Failed to sync clock record ${record.id}:`, error);
        
        // Mark as failed if max retries exceeded
        const retryCount = (record.retryCount || 0) + 1;
        if (retryCount >= this.maxRetries) {
          await offlineDB.updateSyncStatus(record.id, 'failed');
        }
      }
    }
  }

  // Queue an API request for later sync
  async queueRequest(endpoint, options, data) {
    try {
      const requestId = await offlineDB.queueApiRequest(endpoint, options, data);
      await this.setSyncStatus('pending');
      console.log(`SyncManager: Request queued for sync: ${endpoint}`);
      return requestId;
    } catch (error) {
      console.error('SyncManager: Failed to queue request:', error);
      throw error;
    }
  }

  // Record clock action (works offline)
  async recordClockAction(recordData) {
    try {
      // Get current location
      let location = { latitude: null, longitude: null };
      try {
        location = await offlineDB.getCurrentLocation();
      } catch (error) {
        console.warn('SyncManager: Could not get location:', error);
      }

      // Prepare record
      const record = {
        officerId: recordData.officerId,
        officerName: recordData.officerName,
        siteName: recordData.siteName,
        type: recordData.type, // 'clock_in' or 'clock_out'
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        deviceId: offlineDB.getDeviceId(),
        notes: recordData.notes || ''
      };

      // Store in IndexedDB
      const recordId = await offlineDB.storeClockRecord(record);
      await this.setSyncStatus('pending');
      
      console.log(`SyncManager: Clock action recorded: ${record.type} for officer ${record.officerId}`);
      
      // Try to sync immediately if online
      if (this.isOnline) {
        this.syncPendingData();
      }
      
      return recordId;
    } catch (error) {
      console.error('SyncManager: Failed to record clock action:', error);
      throw error;
    }
  }

  // Set sync status
  async setSyncStatus(status) {
    try {
      await offlineDB.setSyncStatus('sync-status', status);
      
      // Dispatch custom event for UI updates
      window.dispatchEvent(new CustomEvent('sync-status-changed', { 
        detail: { status, timestamp: Date.now() } 
      }));
      
      console.log(`SyncManager: Status changed to ${status}`);
    } catch (error) {
      console.error('SyncManager: Failed to set sync status:', error);
    }
  }

  // Get current sync status
  async getSyncStatus() {
    try {
      return await offlineDB.getSyncStatus('sync-status') || 'unknown';
    } catch (error) {
      console.error('SyncManager: Failed to get sync status:', error);
      return 'error';
    }
  }

  // Show notification (if supported)
  showNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body: body,
        icon: '/fms_logo_acronym_(2)_1773261874549-DfpcKGxE.png',
        badge: '/fms_logo_acronym_(2)_1773261874549-DfpcKGxE.png'
      });
    }
  }

  // Request notification permission
  async requestNotificationPermission() {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  }

  // Get sync statistics
  async getSyncStats() {
    try {
      const pendingRecords = await offlineDB.getPendingRecords();
      const queuedRequests = await offlineDB.getQueuedRequests();
      const status = await this.getSyncStatus();
      
      return {
        status,
        pendingRecords: pendingRecords.length,
        queuedRequests: queuedRequests.length,
        isOnline: this.isOnline,
        lastSync: await offlineDB.getSyncStatus('last-sync')
      };
    } catch (error) {
      console.error('SyncManager: Failed to get sync stats:', error);
      return {
        status: 'error',
        pendingRecords: 0,
        queuedRequests: 0,
        isOnline: this.isOnline,
        lastSync: null
      };
    }
  }

  // Force sync manually
  async forceSync() {
    if (this.isOnline) {
      await this.syncPendingData();
    } else {
      throw new Error('Cannot sync while offline');
    }
  }

  // Clear all pending data (for debugging/reset)
  async clearPendingData() {
    try {
      const pendingRecords = await offlineDB.getPendingRecords();
      const queuedRequests = await offlineDB.getQueuedRequests();
      
      for (const record of pendingRecords) {
        await offlineDB.updateSyncStatus(record.id, 'cleared');
      }
      
      for (const request of queuedRequests) {
        await offlineDB.removeQueuedRequest(request.id);
      }
      
      await this.setSyncStatus('synced');
      console.log('SyncManager: All pending data cleared');
    } catch (error) {
      console.error('SyncManager: Failed to clear pending data:', error);
    }
  }
}

// Export singleton instance
export const syncManager = new SyncManager();

// Request notification permission on load
syncManager.requestNotificationPermission();

export default syncManager;
