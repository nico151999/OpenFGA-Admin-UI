import {
  type AppConfig,
  createProfile as createProfileApi,
  deleteProfileApi,
  fetchConfig,
  patchConfig,
  updateProfileApi,
} from '@api/config';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface ConnectionProfile {
  id: string;
  name: string;
  openfgaApiUrl: string;
  storeId: string;
  authorizationModelId?: string;
  modelSelectionMode: 'pinned' | 'latest';
  authMethod: 'none' | 'bearer' | 'oauth';
  createdAt: string;
  updatedAt: string;
}

interface ConnectionState {
  // Hydration state
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;

  // Sync state
  _isSyncing: boolean;
  _lastSyncError: string | null;

  // Current connection
  isConnected: boolean;
  activeProfileId: string | null;

  // Default OpenFGA URL from gateway env
  defaultOpenfgaUrl: string | null;

  // Profiles (stored locally and synced to gateway)
  profiles: ConnectionProfile[];

  // Recent items for quick access
  recentItems: {
    type: 'tuple' | 'object' | 'user';
    value: string;
    timestamp: string;
  }[];

  // Actions
  connect: (profileId: string) => void;
  disconnect: () => void;
  addProfile: (
    profile: Omit<ConnectionProfile, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<string>;
  updateProfile: (id: string, updates: Partial<ConnectionProfile>) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  getActiveProfile: () => ConnectionProfile | null;
  addRecentItem: (item: { type: 'tuple' | 'object' | 'user'; value: string }) => void;

  // Connection test
  testConnection: (url: string) => Promise<boolean>;

  // Sync with gateway
  syncFromGateway: () => Promise<void>;
  syncToGateway: () => Promise<void>;
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set, get) => ({
      // Hydration tracking
      _hasHydrated: false,
      setHasHydrated: (state: boolean) => set({ _hasHydrated: state }),

      // Sync tracking
      _isSyncing: false,
      _lastSyncError: null,

      // Connection state
      isConnected: false,
      activeProfileId: null,
      defaultOpenfgaUrl: null,
      profiles: [],
      recentItems: [],

      connect: (profileId: string) => {
        const profile = get().profiles.find((p) => p.id === profileId);
        if (profile?.openfgaApiUrl && profile.storeId) {
          set({ isConnected: true, activeProfileId: profileId });
          // Sync connection state to gateway
          get().syncToGateway();
          return true;
        } else {
          console.warn('Cannot connect: Profile missing required fields');
          set({ isConnected: false, activeProfileId: null });
          return false;
        }
      },

      disconnect: () => {
        set({ isConnected: false, activeProfileId: null });
        // Sync connection state to gateway
        get().syncToGateway();
      },

      addProfile: async (profile) => {
        try {
          // Create profile via gateway API
          const newProfile = await createProfileApi(profile);

          set((state) => ({
            profiles: [...state.profiles, newProfile],
          }));

          return newProfile.id;
        } catch (error) {
          console.error('Failed to create profile via gateway:', error);
          // Fallback to local-only creation
          const id = crypto.randomUUID();
          const now = new Date().toISOString();
          const newProfile: ConnectionProfile = {
            ...profile,
            id,
            createdAt: now,
            updatedAt: now,
          };
          set((state) => ({
            profiles: [...state.profiles, newProfile],
          }));
          return id;
        }
      },

      updateProfile: async (id, updates) => {
        try {
          // Update profile via gateway API
          const existingProfile = get().profiles.find((p) => p.id === id);
          if (existingProfile) {
            const updatedProfile = await updateProfileApi(id, {
              ...existingProfile,
              ...updates,
            });

            set((state) => ({
              profiles: state.profiles.map((p) => (p.id === id ? updatedProfile : p)),
            }));
          }
        } catch (error) {
          console.error('Failed to update profile via gateway:', error);
          // Fallback to local-only update
          set((state) => ({
            profiles: state.profiles.map((p) =>
              p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
            ),
          }));
        }
      },

      deleteProfile: async (id) => {
        try {
          // Delete profile via gateway API
          await deleteProfileApi(id);
        } catch (error) {
          console.error('Failed to delete profile via gateway:', error);
        }

        // Always update local state
        set((state) => ({
          profiles: state.profiles.filter((p) => p.id !== id),
          activeProfileId: state.activeProfileId === id ? null : state.activeProfileId,
          isConnected: state.activeProfileId === id ? false : state.isConnected,
        }));
      },

      getActiveProfile: () => {
        const state = get();
        const profile = state.profiles.find((p) => p.id === state.activeProfileId);
        // Validate profile has required fields
        if (profile?.openfgaApiUrl && profile.storeId) {
          return profile;
        }
        return null;
      },

      addRecentItem: (item) => {
        set((state) => {
          const newItem = { ...item, timestamp: new Date().toISOString() };
          const filtered = state.recentItems.filter(
            (r) => !(r.type === item.type && r.value === item.value)
          );
          return {
            recentItems: [newItem, ...filtered].slice(0, 20),
          };
        });
        // Sync recent items to gateway
        get().syncToGateway();
      },

      testConnection: async (url: string) => {
        try {
          const response = await fetch(`${url}/stores`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
          });
          return response.ok;
        } catch {
          return false;
        }
      },

      // Sync from gateway (pull)
      syncFromGateway: async () => {
        set({ _isSyncing: true, _lastSyncError: null });
        try {
          const config: AppConfig = await fetchConfig();
          set({
            profiles: config.profiles,
            recentItems: config.recentItems,
            activeProfileId: config.activeProfileId,
            isConnected: config.isConnected,
            defaultOpenfgaUrl: config.defaultOpenfgaUrl || null,
            _isSyncing: false,
          });
        } catch (error) {
          console.error('Failed to sync from gateway:', error);
          set({
            _isSyncing: false,
            _lastSyncError: error instanceof Error ? error.message : 'Sync failed',
          });
        }
      },

      // Sync to gateway (push)
      syncToGateway: async () => {
        const state = get();
        try {
          await patchConfig({
            profiles: state.profiles,
            recentItems: state.recentItems,
            activeProfileId: state.activeProfileId,
            isConnected: state.isConnected,
          });
        } catch (error) {
          console.error('Failed to sync to gateway:', error);
        }
      },
    }),
    {
      name: 'openfga-admin-connection',
      storage: createJSONStorage(() => localStorage),
      // Persist connection state AND profiles
      partialize: (state) => ({
        profiles: state.profiles,
        recentItems: state.recentItems,
        // Also persist active connection so it survives refresh
        isConnected: state.isConnected,
        activeProfileId: state.activeProfileId,
      }),
      onRehydrateStorage: () => (state) => {
        // Called when localStorage is loaded
        if (state) {
          state.setHasHydrated(true);
          // Validate the persisted connection is still valid
          if (state.isConnected && state.activeProfileId) {
            const profile = state.profiles.find((p) => p.id === state.activeProfileId);
            if (!profile || !profile.openfgaApiUrl || !profile.storeId) {
              // Invalid state, disconnect
              state.disconnect();
            }
          }
          // Try to sync from gateway on load (gateway has priority)
          state.syncFromGateway().catch(() => {
            // If gateway is unavailable, use local storage data
            console.warn('Gateway unavailable, using local storage');
          });
        }
      },
    }
  )
);

// Hook to wait for hydration
export const useHasHydrated = () => {
  return useConnectionStore((state) => state._hasHydrated);
};

// Hook to get sync status - use individual selectors to avoid infinite loops
export const useSyncStatus = () => {
  const isSyncing = useConnectionStore((state) => state._isSyncing);
  const lastSyncError = useConnectionStore((state) => state._lastSyncError);
  return { isSyncing, lastSyncError };
};
