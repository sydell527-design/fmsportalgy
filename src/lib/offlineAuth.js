import { offlineDB } from './offlineDB.js';

class OfflineAuth {
  constructor() {
    this.isOfflineMode = false;
    this.currentUser = null;
  }

  // Check if we should use offline mode
  async shouldUseOfflineMode() {
    // Use offline mode if no internet connection
    if (!navigator.onLine) {
      return true;
    }

    // Try to reach the server
    try {
      const response = await fetch('/api/users', { 
        method: 'HEAD',
        cache: 'no-cache',
        timeout: 3000
      });
      return false;
    } catch (error) {
      return true;
    }
  }

  // Store user credentials for offline access
  async storeOfflineCredentials(user, pin) {
    try {
      // Store user with PIN hash
      const hashedPin = this.hashPin(pin);
      await offlineDB.storeOfflineUser({
        officerId: user.officerId || user.id,
        officerName: user.officerName || user.name,
        email: user.email,
        pin: hashedPin,
        role: user.role,
        department: user.department,
        sites: user.sites || []
      });
      
      console.log('OfflineAuth: Credentials stored for offline access');
      return true;
    } catch (error) {
      console.error('OfflineAuth: Failed to store credentials:', error);
      return false;
    }
  }

  // Authenticate with PIN (offline)
  async authenticateWithPin(officerId, pin) {
    try {
      const user = await offlineDB.getOfflineUser(officerId);
      
      if (!user) {
        throw new Error('User not found in offline storage');
      }

      const hashedPin = this.hashPin(pin);
      if (user.pin !== hashedPin) {
        throw new Error('Invalid PIN');
      }

      // Set current user
      this.currentUser = user;
      this.isOfflineMode = true;

      console.log('OfflineAuth: Successfully authenticated with PIN');
      return user;
    } catch (error) {
      console.error('OfflineAuth: PIN authentication failed:', error);
      throw error;
    }
  }

  // Get current offline user
  getCurrentUser() {
    return this.currentUser;
  }

  // Check if in offline mode
  isInOfflineMode() {
    return this.isOfflineMode;
  }

  // Logout from offline mode
  logout() {
    this.currentUser = null;
    this.isOfflineMode = false;
    console.log('OfflineAuth: Logged out from offline mode');
  }

  // Hash PIN (simple hash for demo - use stronger hashing in production)
  hashPin(pin) {
    // Simple hash - in production, use bcrypt or similar
    let hash = 0;
    for (let i = 0; i < pin.length; i++) {
      const char = pin.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  // Verify PIN for current user
  verifyPin(pin) {
    if (!this.currentUser) {
      return false;
    }
    
    const hashedPin = this.hashPin(pin);
    return this.currentUser.pin === hashedPin;
  }

  // Get all offline users (for admin)
  async getOfflineUsers() {
    try {
      if (!offlineDB.db) await offlineDB.init();
      
      return new Promise((resolve, reject) => {
        const transaction = offlineDB.db.transaction(['offline-users'], 'readonly');
        const store = transaction.objectStore('offline-users');
        const request = store.getAll();

        request.onsuccess = () => {
          const users = request.result.map(user => ({
            ...user,
            pin: undefined // Don't return PIN hash
          }));
          resolve(users);
        };
        
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('OfflineAuth: Failed to get offline users:', error);
      return [];
    }
  }

  // Remove offline user credentials
  async removeOfflineCredentials(officerId) {
    try {
      if (!offlineDB.db) await offlineDB.init();
      
      return new Promise((resolve, reject) => {
        const transaction = offlineDB.db.transaction(['offline-users'], 'readwrite');
        const store = transaction.objectStore('offline-users');
        const index = store.index('officerId');
        const request = index.get(officerId);

        request.onsuccess = () => {
          const user = request.result;
          if (user) {
            const deleteRequest = store.delete(user.id);
            deleteRequest.onsuccess = () => resolve(true);
            deleteRequest.onerror = () => reject(deleteRequest.error);
          } else {
            resolve(false);
          }
        };
        
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('OfflineAuth: Failed to remove credentials:', error);
      return false;
    }
  }

  // Update offline user PIN
  async updateOfflinePin(officerId, newPin) {
    try {
      const user = await offlineDB.getOfflineUser(officerId);
      if (!user) {
        throw new Error('User not found');
      }

      const hashedPin = this.hashPin(newPin);
      user.pin = hashedPin;
      user.updatedAt = new Date().toISOString();

      await offlineDB.storeOfflineUser(user);
      console.log('OfflineAuth: PIN updated successfully');
      return true;
    } catch (error) {
      console.error('OfflineAuth: Failed to update PIN:', error);
      return false;
    }
  }

  // Check if user has offline credentials
  async hasOfflineCredentials(officerId) {
    try {
      const user = await offlineDB.getOfflineUser(officerId);
      return user !== undefined;
    } catch (error) {
      console.error('OfflineAuth: Failed to check credentials:', error);
      return false;
    }
  }

  // Get offline authentication status
  getAuthStatus() {
    return {
      isOfflineMode: this.isOfflineMode,
      currentUser: this.currentUser,
      hasCredentials: this.currentUser !== null
    };
  }

  // Setup offline authentication after successful online login
  async setupOfflineAccess(user, pin) {
    try {
      // Store credentials for future offline use
      const stored = await this.storeOfflineCredentials(user, pin);
      
      if (stored) {
        console.log('OfflineAuth: Offline access configured successfully');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('OfflineAuth: Failed to setup offline access:', error);
      return false;
    }
  }

  // Validate offline session (periodic check)
  validateOfflineSession() {
    if (!this.isOfflineMode || !this.currentUser) {
      return false;
    }

    // In offline mode, session is valid as long as user is set
    // Could add additional checks like session timeout
    return true;
  }

  // Get authentication method used
  getAuthMethod() {
    if (this.isOfflineMode) {
      return 'offline-pin';
    }
    return 'online';
  }
}

// Export singleton instance
export const offlineAuth = new OfflineAuth();

export default offlineAuth;
