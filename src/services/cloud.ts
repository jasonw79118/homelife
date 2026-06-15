import type { AppData } from '../types';

const CLOUD_CONFIG_KEY = 'homelife-cloud-sync-v2';
const LEGACY_CLOUD_CONFIG_KEY = 'homelife-cloud-sync-v1';
const CLOUD_PASSPHRASE_SESSION_KEY = 'homelife-cloud-passphrase-v1';
const DEFAULT_TABLE = 'homelife_cloud_workspaces';
const BUILT_IN_SUPABASE_URL = 'https://mbxvdynhcqjjudejuwwb.supabase.co';
const BUILT_IN_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ieHZkeW5oY3FqanVkZWp1d3diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDMzODMsImV4cCI6MjA5Njc3OTM4M30.7toFDT2MSRrKdfQufZ7hkiI0nJ2xEWjs_Oe7JrtjAVA';

type ImportMetaWithEnv = ImportMeta & { env?: Record<string, string | undefined> };

type StoredCloudSyncConfig = Omit<CloudSyncConfig, 'passphrase'>;

export type CloudSyncConfig = {
  enabled: boolean;
  autoSync: boolean;
  supabaseUrl: string;
  anonKey: string;
  /**
   * Session-only family cloud password. It is intentionally not persisted to
   * localStorage and is never sent to Supabase.
   */
  passphrase: string;
  tableName: string;
};

export type CloudPullResult = {
  data: Partial<AppData>;
  updatedAt?: string;
  updatedBy?: string;
};

export type CloudSaveResult = {
  updatedAt?: string;
};

function envValue(name: string): string {
  const env = (import.meta as ImportMetaWithEnv).env ?? {};
  return String(env[name] ?? '').trim();
}

function getSessionPassphrase(): string {
  if (typeof sessionStorage === 'undefined') return '';
  return sessionStorage.getItem(CLOUD_PASSPHRASE_SESSION_KEY) ?? '';
}

function saveSessionPassphrase(passphrase: string): void {
  if (typeof sessionStorage === 'undefined') return;
  if (passphrase) sessionStorage.setItem(CLOUD_PASSPHRASE_SESSION_KEY, passphrase);
  else sessionStorage.removeItem(CLOUD_PASSPHRASE_SESSION_KEY);
}

function defaultConfig(): CloudSyncConfig {
  const supabaseUrl = envValue('VITE_HOMELIFE_SUPABASE_URL') || BUILT_IN_SUPABASE_URL;
  const anonKey = envValue('VITE_HOMELIFE_SUPABASE_ANON_KEY') || BUILT_IN_SUPABASE_ANON_KEY;
  const passphrase = getSessionPassphrase() || envValue('VITE_HOMELIFE_CLOUD_PASSPHRASE');
  return {
    enabled: envValue('VITE_HOMELIFE_CLOUD_ENABLED') !== 'false' && Boolean(supabaseUrl && anonKey),
    autoSync: envValue('VITE_HOMELIFE_CLOUD_AUTO_SYNC') !== 'false',
    supabaseUrl,
    anonKey,
    passphrase,
    tableName: envValue('VITE_HOMELIFE_CLOUD_TABLE') || DEFAULT_TABLE
  };
}

function sanitizeStoredConfig(config: Partial<CloudSyncConfig> | null, defaults: CloudSyncConfig): CloudSyncConfig {
  return {
    enabled: config?.enabled !== false && defaults.enabled,
    autoSync: config?.autoSync !== false,
    supabaseUrl: String(config?.supabaseUrl || defaults.supabaseUrl).trim(),
    anonKey: String(config?.anonKey || defaults.anonKey).trim(),
    passphrase: getSessionPassphrase() || String(config?.passphrase ?? defaults.passphrase).trim(),
    tableName: String(config?.tableName ?? defaults.tableName ?? DEFAULT_TABLE).trim() || DEFAULT_TABLE
  };
}

export function getCloudSyncConfig(): CloudSyncConfig {
  const defaults = defaultConfig();
  if (typeof localStorage === 'undefined') return defaults;
  try {
    const parsed = JSON.parse(localStorage.getItem(CLOUD_CONFIG_KEY) ?? 'null') as Partial<CloudSyncConfig> | null;
    if (parsed) return sanitizeStoredConfig(parsed, defaults);

    // One-time legacy migration: keep connection settings but move the old
    // saved passphrase out of localStorage and into sessionStorage only.
    const legacy = JSON.parse(localStorage.getItem(LEGACY_CLOUD_CONFIG_KEY) ?? 'null') as Partial<CloudSyncConfig> | null;
    if (legacy) {
      if (legacy.passphrase && !getSessionPassphrase()) saveSessionPassphrase(String(legacy.passphrase));
      localStorage.removeItem(LEGACY_CLOUD_CONFIG_KEY);
      const migrated = sanitizeStoredConfig(legacy, defaults);
      saveCloudSyncConfig(migrated);
      return migrated;
    }
    return defaults;
  } catch {
    return defaults;
  }
}

export function saveCloudSyncConfig(config: CloudSyncConfig): void {
  if (typeof localStorage === 'undefined') return;
  const stored: StoredCloudSyncConfig = {
    enabled: Boolean(config.enabled),
    autoSync: config.autoSync !== false,
    supabaseUrl: String(config.supabaseUrl || BUILT_IN_SUPABASE_URL).trim(),
    anonKey: String(config.anonKey || BUILT_IN_SUPABASE_ANON_KEY).trim(),
    tableName: String(config.tableName || DEFAULT_TABLE).trim() || DEFAULT_TABLE
  };
  saveSessionPassphrase(String(config.passphrase ?? '').trim());
  localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(stored));
  localStorage.removeItem(LEGACY_CLOUD_CONFIG_KEY);
}

export function clearCloudSyncConfig(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(CLOUD_CONFIG_KEY);
    localStorage.removeItem(LEGACY_CLOUD_CONFIG_KEY);
  }
  saveSessionPassphrase('');
}

export function isCloudSyncReady(config = getCloudSyncConfig()): boolean {
  return Boolean(config.enabled && config.supabaseUrl && config.anonKey && config.passphrase && config.tableName);
}

export function cloudSyncSummary(config = getCloudSyncConfig()): string {
  if (!config.enabled) return 'Cloud sync is off';
  if (!config.passphrase) return 'Cloud sync needs family password';
  if (!isCloudSyncReady(config)) return 'Cloud sync needs setup';
  return 'Cloud sync on · encrypted private workspace';
}

function requireConfig(config = getCloudSyncConfig()): Required<CloudSyncConfig> {
  if (!isCloudSyncReady(config)) {
    throw new Error('Cloud sync is not configured. Add the family cloud password. The Supabase server URL and anon key are built in.');
  }
  return config as Required<CloudSyncConfig>;
}

function restRoot(config: CloudSyncConfig): string {
  return `${config.supabaseUrl.replace(/\/+$/, '')}/rest/v1`;
}

function rpcUrl(config: CloudSyncConfig, functionName: string): string {
  return `${restRoot(config)}/rpc/${functionName}`;
}

function headers(config: CloudSyncConfig, extra?: Record<string, string>): HeadersInit {
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${config.anonKey}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

function textEncoder(): TextEncoder {
  return new TextEncoder();
}

function textDecoder(): TextDecoder {
  return new TextDecoder();
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return buffer;
}

async function sha256Base64Url(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('This browser does not support encrypted cloud sync. Use a modern browser over HTTPS.');
  const digest = await crypto.subtle.digest('SHA-256', textEncoder().encode(value));
  return toBase64Url(new Uint8Array(digest));
}

async function workspaceId(householdCode: string, passphrase: string): Promise<string> {
  const code = householdCode.trim().toUpperCase();
  return sha256Base64Url(`homelife-workspace-v2:${code}:${passphrase}`);
}

async function deriveKey(passphrase: string, householdCode: string, version: 'v1' | 'v2' = 'v2'): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) throw new Error('This browser does not support encrypted cloud sync. Use a modern browser over HTTPS.');
  const code = householdCode.trim().toUpperCase();
  const baseKey = await crypto.subtle.importKey('raw', textEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: textEncoder().encode(version === 'v2' ? `homelife:${code}:v2` : `homelife:${code}`), iterations: version === 'v2' ? 210000 : 150000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptPayload(data: AppData, householdCode: string, passphrase: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, householdCode, 'v2');
  const encoded = textEncoder().encode(JSON.stringify(data));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded));
  return `v2.${toBase64(iv)}.${toBase64(cipher)}`;
}

async function decryptPayload(payload: string, householdCode: string, passphrase: string): Promise<Partial<AppData>> {
  const parts = payload.split('.');
  const [version, ivText, cipherText] = parts.length === 3 ? parts : ['v1', parts[0], parts[1]];
  if (!ivText || !cipherText) throw new Error('The cloud workspace payload is not in the expected encrypted format.');
  if (version !== 'v2' && version !== 'v1') throw new Error('This HomeLife version cannot read the cloud encryption format.');
  const key = await deriveKey(passphrase, householdCode, version as 'v1' | 'v2');
  const iv = base64ToArrayBuffer(ivText);
  const cipherBytes = base64ToArrayBuffer(cipherText);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBytes);
  return JSON.parse(textDecoder().decode(decrypted)) as Partial<AppData>;
}

function safeUpdatedBy(updatedBy?: string): string {
  return String(updatedBy || 'home-device').replace(/[^a-zA-Z0-9_.@-]/g, '').slice(0, 64) || 'home-device';
}

function isMissingRpcError(body: string): boolean {
  return body.includes('PGRST202') || body.includes('Could not find the function') || body.includes('schema cache');
}

async function cloudResponseError(response: Response, action: string): Promise<Error> {
  const body = await response.text();
  if (isMissingRpcError(body)) {
    return new Error(`${action} failed because the HomeLife Supabase SQL functions are not installed or Supabase has not refreshed its schema cache. Run supabase/homelife_cloud_schema.sql in the Supabase SQL Editor, then wait about 30 seconds and retry. Details: ${response.status} ${body}`);
  }
  return new Error(`${action} failed: ${response.status} ${body}`);
}

export async function loadCloudHousehold(householdCode: string, config = getCloudSyncConfig()): Promise<CloudPullResult | null> {
  const readyConfig = requireConfig(config);
  const code = householdCode.trim().toUpperCase();
  const id = await workspaceId(code, readyConfig.passphrase);
  const response = await fetch(rpcUrl(readyConfig, 'homelife_pull_workspace'), {
    method: 'POST',
    headers: headers(readyConfig),
    body: JSON.stringify({ p_workspace_id: id })
  });
  if (!response.ok) throw await cloudResponseError(response, 'Cloud load');
  const rows = await response.json() as Array<{ encrypted_payload?: string; updated_at?: string; updated_by?: string }>;
  const row = rows[0];
  if (!row?.encrypted_payload) return null;
  const data = await decryptPayload(row.encrypted_payload, code, readyConfig.passphrase);
  return { data, updatedAt: row.updated_at, updatedBy: row.updated_by };
}

export async function saveCloudHousehold(data: AppData, householdCode: string, updatedBy?: string, config = getCloudSyncConfig()): Promise<CloudSaveResult> {
  const readyConfig = requireConfig(config);
  const code = householdCode.trim().toUpperCase();
  const id = await workspaceId(code, readyConfig.passphrase);
  const encryptedPayload = await encryptPayload({ ...data, householdId: code, inviteCode: code }, code, readyConfig.passphrase);
  const response = await fetch(rpcUrl(readyConfig, 'homelife_upsert_workspace'), {
    method: 'POST',
    headers: headers(readyConfig),
    body: JSON.stringify({ p_workspace_id: id, p_encrypted_payload: encryptedPayload, p_updated_by: safeUpdatedBy(updatedBy) })
  });
  if (!response.ok) throw await cloudResponseError(response, 'Cloud save');
  const rows = await response.json() as Array<{ updated_at?: string }>;
  return { updatedAt: rows[0]?.updated_at };
}

export async function testCloudConnection(config = getCloudSyncConfig()): Promise<void> {
  const readyConfig = requireConfig(config);
  const response = await fetch(rpcUrl(readyConfig, 'homelife_cloud_ping'), {
    method: 'POST',
    headers: headers(readyConfig),
    body: JSON.stringify({})
  });
  if (!response.ok) throw await cloudResponseError(response, 'Cloud test');
}
