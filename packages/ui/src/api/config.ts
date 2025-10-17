import type { ConnectionProfile } from '@store/connectionStore';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:4000';

export interface AppConfig {
  version: number;
  profiles: ConnectionProfile[];
  recentItems: {
    type: 'tuple' | 'object' | 'user';
    value: string;
    timestamp: string;
  }[];
  activeProfileId: string | null;
  isConnected: boolean;
  lastUpdated?: string;
}

export interface ConfigPathInfo {
  configDir: string;
  configFile: string;
  exists: boolean;
}

/**
 * Fetch config from the gateway
 */
export async function fetchConfig(): Promise<AppConfig> {
  const response = await fetch(`${GATEWAY_URL}/api/config`);
  if (!response.ok) {
    throw new Error(`Failed to fetch config: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Partially update config
 */
export async function patchConfig(updates: Partial<AppConfig>): Promise<AppConfig> {
  const response = await fetch(`${GATEWAY_URL}/api/config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    throw new Error(`Failed to update config: ${response.statusText}`);
  }
  const result = await response.json();
  return result.config;
}

/**
 * Get config file path info
 */
export async function getConfigPath(): Promise<ConfigPathInfo> {
  const response = await fetch(`${GATEWAY_URL}/api/config/path`);
  if (!response.ok) {
    throw new Error(`Failed to get config path: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Export config as downloadable file
 */
export async function exportConfig(): Promise<void> {
  const config = await fetchConfig();
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `openfga-admin-config-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import config from file
 */
export async function importConfig(file: File): Promise<AppConfig> {
  const content = await file.text();
  const config = JSON.parse(content);

  const response = await fetch(`${GATEWAY_URL}/api/config/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to import config');
  }

  const result = await response.json();
  return result.config;
}

// ============ Profile-specific API ============

/**
 * Create a new profile
 */
export async function createProfile(
  profile: Omit<ConnectionProfile, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ConnectionProfile> {
  const response = await fetch(`${GATEWAY_URL}/api/config/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create profile');
  }

  const result = await response.json();
  return result.profile;
}

/**
 * Update a profile
 */
export async function updateProfileApi(
  id: string,
  updates: Partial<ConnectionProfile>
): Promise<ConnectionProfile> {
  const response = await fetch(`${GATEWAY_URL}/api/config/profiles/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update profile');
  }

  const result = await response.json();
  return result.profile;
}

/**
 * Delete a profile
 */
export async function deleteProfileApi(id: string): Promise<void> {
  const response = await fetch(`${GATEWAY_URL}/api/config/profiles/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete profile');
  }
}
