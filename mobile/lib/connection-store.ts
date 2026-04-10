/**
 * Connection state store.
 * Tracks whether we're connected to a MindOS server.
 */
import { create } from 'zustand';
import { mindosClient } from './api-client';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface ConnectionState {
  status: ConnectionStatus;
  serverUrl: string;
  serverVersion: string;
  hostname: string;
  error: string;

  /** Initialize from saved storage. */
  init: () => Promise<void>;
  /** Attempt to connect to a server URL. */
  connect: (url: string) => Promise<boolean>;
  /** Disconnect and clear saved URL. */
  disconnect: () => Promise<void>;
  /** Re-check connection to current server. */
  checkHealth: () => Promise<boolean>;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: 'disconnected',
  serverUrl: '',
  serverVersion: '',
  hostname: '',
  error: '',

  init: async () => {
    const hasSaved = await mindosClient.init();
    if (!hasSaved) return;

    set({ status: 'connecting', serverUrl: mindosClient.baseUrl });
    const health = await mindosClient.health();
    if (health?.ok) {
      set({ status: 'connected', serverVersion: health.version });
    } else {
      set({ status: 'error', error: 'Saved server is unreachable' });
    }
  },

  connect: async (url: string) => {
    const normalized = url.replace(/\/+$/, '');
    set({ status: 'connecting', serverUrl: normalized, error: '' });

    // Set URL in memory first (for health check), but do NOT persist yet
    mindosClient.setBaseUrl(normalized);
    const health = await mindosClient.health();

    if (health?.ok) {
      // Only persist after successful verification
      await mindosClient.persistServer();
      const connectInfo = await mindosClient.getConnectInfo();
      set({
        status: 'connected',
        serverVersion: health.version,
        hostname: connectInfo?.hostname ?? '',
      });
      return true;
    }

    // Reset base URL on failure — don't leave a bad URL in memory
    mindosClient.setBaseUrl('');
    set({
      status: 'error',
      error: 'Unable to connect. Make sure MindOS is running and on the same network.',
    });
    return false;
  },

  disconnect: async () => {
    await mindosClient.disconnect();
    set({
      status: 'disconnected',
      serverUrl: '',
      serverVersion: '',
      hostname: '',
      error: '',
    });
  },

  checkHealth: async () => {
    set({ status: 'connecting' });
    const health = await mindosClient.health();
    if (health?.ok) {
      set({ status: 'connected', serverVersion: health.version });
      return true;
    }
    set({ status: 'error', error: 'Connection lost' });
    return false;
  },
}));
