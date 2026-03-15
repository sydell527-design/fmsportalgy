import React, { useState, useEffect } from 'react';
import { syncManager } from '../lib/syncManager.js';

const SyncStatus = () => {
  const [status, setStatus] = useState('unknown');
  const [stats, setStats] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Initial status
    updateStatus();

    // Listen for sync status changes
    const handleStatusChange = (event) => {
      setStatus(event.detail.status);
      updateStats();
    };

    window.addEventListener('sync-status-changed', handleStatusChange);

    // Periodic updates
    const interval = setInterval(() => {
      updateStatus();
      updateStats();
    }, 5000);

    return () => {
      window.removeEventListener('sync-status-changed', handleStatusChange);
      clearInterval(interval);
    };
  }, []);

  const updateStatus = async () => {
    try {
      const currentStatus = await syncManager.getSyncStatus();
      setStatus(currentStatus);
    } catch (error) {
      console.error('Failed to update sync status:', error);
    }
  };

  const updateStats = async () => {
    try {
      const currentStats = await syncManager.getSyncStats();
      setStats(currentStats);
    } catch (error) {
      console.error('Failed to update sync stats:', error);
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'synced':
        return 'bg-green-500';
      case 'syncing':
        return 'bg-yellow-500';
      case 'pending':
        return 'bg-yellow-500';
      case 'offline':
        return 'bg-red-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'synced':
        return 'Synced';
      case 'syncing':
        return 'Syncing...';
      case 'pending':
        return 'Pending';
      case 'offline':
        return 'Offline';
      case 'error':
        return 'Error';
      default:
        return 'Unknown';
    }
  };

  const handleForceSync = async () => {
    try {
      await syncManager.forceSync();
    } catch (error) {
      console.error('Force sync failed:', error);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="relative">
        {/* Status indicator */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center space-x-2 bg-white rounded-full shadow-lg px-3 py-2 hover:shadow-xl transition-shadow"
        >
          <div className={`w-3 h-3 rounded-full ${getStatusColor()} ${status === 'syncing' ? 'animate-pulse' : ''}`}></div>
          <span className="text-sm font-medium text-gray-700">
            {getStatusText()}
          </span>
          <svg
            className={`w-4 h-4 text-gray-500 transform transition-transform ${showDetails ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Details panel */}
        {showDetails && (
          <div className="absolute bottom-full right-0 mb-2 w-64 bg-white rounded-lg shadow-xl p-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">Connection</span>
                <span className={`text-sm ${stats?.isOnline ? 'text-green-600' : 'text-red-600'}`}>
                  {stats?.isOnline ? 'Online' : 'Offline'}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">Status</span>
                <span className="text-sm text-gray-600">{getStatusText()}</span>
              </div>

              {stats && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">Pending Records</span>
                    <span className="text-sm text-gray-600">{stats.pendingRecords}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">Queued Requests</span>
                    <span className="text-sm text-gray-600">{stats.queuedRequests}</span>
                  </div>

                  {stats.lastSync && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700">Last Sync</span>
                      <span className="text-sm text-gray-600">
                        {new Date(stats.lastSync).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* Actions */}
              <div className="pt-3 border-t border-gray-200 space-y-2">
                {stats?.isOnline && (
                  <button
                    onClick={handleForceSync}
                    disabled={status === 'syncing'}
                    className="w-full px-3 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 disabled:bg-blue-300 transition-colors"
                  >
                    {status === 'syncing' ? 'Syncing...' : 'Force Sync'}
                  </button>
                )}

                <button
                  onClick={() => setShowDetails(false)}
                  className="w-full px-3 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SyncStatus;
