
import type { AppData } from '../types';

const CLOUD_CONFIG_KEY = 'homelife-cloud-sync-v1';
const DEFAULT_TABLE = 'homelife_cloud_workspaces';
const BUILT_IN_SUPABASE_URL = 'https://mbxvdynhcqjjudejuwwb.supabase.co';
const BUILT_IN_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ieHZkeW5oY3FqanVkZWp1d3diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDMzODMsImV4cCI6MjA5Njc3OTM4M30.7toFDT2MSRrKdfQufZ7hkiI0nJ2xEWjs_Oe7JrtjAVA';

type ImportMetaWithEnv = ImportMeta & { env?: Record<string, string | undefined> };

export type CloudSyncConfig = {
  enabled: boolean;
  autoSync: boolean;
  supabaseUrl: string;
  anonKey: string;
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

function defaultConfig(): CloudSyncConfig {
  const supabaseUrl = envValue('VITE_HOMELIFE_SUPABASE_URL') || BUILT_IN_SUPABASE_URL;
  const anonKey = envValue('VITE_HOMELIFE_SUPABASE_ANON_KEY') || BUILT_IN_SUPABASE_ANON_KEY;
  const passphrase = envValue('VITE_HOMELIFE_CLOUD_PASSPHRASE');
  return {
    enabled: envValue('VITE_HOMELIFE_CLOUD_ENABLED') !== 'false' && Boolean(supabaseUrl && anonKey),
    autoSync: envValue('VITE_HOMELIFE_CLOUD_AUTO_SYNC') !== 'false',
    supabaseUrl,
    anonKey,
    passphrase,
    tableName: envValue('VITE_HOMELIFE_CLOUD_TABLE') || DEFAULT_TABLE
  };
}

export function getCloudSyncConfig(): CloudSyncConfig {
  const defaults = defaultConfig();
  if (typeof localStorage === 'undefined') return defaults;
  try {
    const parsed = JSON.parse(localStorage.getItem(CLOUD_CONFIG_KEY) ?? 'null') as Partial<CloudSyncConfig> | null;
    if (!parsed) return defaults;
    return {
      enabled: Boolean(parsed.enabled),
      autoSync: parsed.autoSync !== false,
      supabaseUrl: String(parsed.supabaseUrl || defaults.supabaseUrl).trim(),
      anonKey: String(parsed.anonKey || defaults.anonKey).trim(),
      passphrase: String(parsed.passphrase ?? defaults.passphrase).trim(),
      tableName: String(parsed.tableName ?? defaults.tableName ?? DEFAULT_TABLE).trim() || DEFAULT_TABLE
    };
  } catch (error) {
    console.warn('Unable to read HomeLife cloud config.', error);
    return defaults;
  }
}

export function saveCloudSyncConfig(config: CloudSyncConfig): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(config));
}

export function clearCloudSyncConfig(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(CLOUD_CONFIG_KEY);
}

export function isCloudSyncReady(config = getCloudSyncConfig()): boolean {
  return Boolean(config.enabled && config.supabaseUrl && config.anonKey && config.passphrase && config.tableName);
}

export function cloudSyncSummary(config = getCloudSyncConfig()): string {
  if (!config.enabled) return 'Cloud sync is off';
  if (!isCloudSyncReady(config)) return 'Cloud sync needs setup';
  return `Cloud sync on · ${config.tableName}`;
}

function requireConfig(config = getCloudSyncConfig()): Required<CloudSyncConfig> {
  if (!isCloudSyncReady(config)) {
    throw new Error('Cloud sync is not configured. Add the family cloud password. The Supabase server URL and anon key are built in.');
  }
  return config as Required<CloudSyncConfig>;
}

function restBase(config: CloudSyncConfig): string {
  return `${config.supabaseUrl.replace(/\/+$/, '')}/rest/v1/${encodeURIComponent(config.tableName)}`;
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

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return buffer;
}

async function deriveKey(passphrase: string, householdCode: string): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) throw new Error('This browser does not support encrypted cloud sync. Use a modern browser over HTTPS.');
  const baseKey = await crypto.subtle.importKey('raw', textEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: textEncoder().encode(`homelife:${householdCode}`), iterations: 150000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptPayload(data: AppData, householdCode: string, passphrase: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, householdCode);
  const encoded = textEncoder().encode(JSON.stringify(data));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded));
  return `${toBase64(iv)}.${toBase64(cipher)}`;
}

async function decryptPayload(payload: string, householdCode: string, passphrase: string): Promise<Partial<AppData>> {
  const [ivText, cipherText] = payload.split('.');
  if (!ivText || !cipherText) throw new Error('The cloud workspace payload is not in the expected encrypted format.');
  const key = await deriveKey(passphrase, householdCode);
  const iv = base64ToArrayBuffer(ivText);
  const cipherBytes = base64ToArrayBuffer(cipherText);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBytes);
  return JSON.parse(textDecoder().decode(decrypted)) as Partial<AppData>;
}

export async function loadCloudHousehold(householdCode: string, config = getCloudSyncConfig()): Promise<CloudPullResult | null> {
  const readyConfig = requireConfig(config);
  const code = householdCode.trim().toUpperCase();
  const response = await fetch(`${restBase(readyConfig)}?household_code=eq.${encodeURIComponent(code)}&select=household_code,household_name,encrypted_payload,updated_at,updated_by&limit=1`, {
    method: 'GET',
    headers: headers(readyConfig)
  });
  if (!response.ok) throw new Error(`Cloud load failed: ${response.status} ${await response.text()}`);
  const rows = await response.json() as Array<{ encrypted_payload?: string; updated_at?: string; updated_by?: string }>;
  const row = rows[0];
  if (!row?.encrypted_payload) return null;
  const data = await decryptPayload(row.encrypted_payload, code, readyConfig.passphrase);
  return { data, updatedAt: row.updated_at, updatedBy: row.updated_by };
}

export async function saveCloudHousehold(data: AppData, householdCode: string, updatedBy?: string, config = getCloudSyncConfig()): Promise<CloudSaveResult> {
  const readyConfig = requireConfig(config);
  const code = householdCode.trim().toUpperCase();
  const encryptedPayload = await encryptPayload({ ...data, householdId: code, inviteCode: code }, code, readyConfig.passphrase);
  const response = await fetch(`${restBase(readyConfig)}?on_conflict=household_code`, {
    method: 'POST',
    headers: headers(readyConfig, { Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify({ household_code: code, household_name: data.householdName ?? code, encrypted_payload: encryptedPayload, updated_by: updatedBy ?? data.currentUserId ?? 'unknown' })
  });
  if (!response.ok) throw new Error(`Cloud save failed: ${response.status} ${await response.text()}`);
  const rows = await response.json() as Array<{ updated_at?: string }>;
  return { updatedAt: rows[0]?.updated_at };
}

export async function testCloudConnection(config = getCloudSyncConfig()): Promise<void> {
  const readyConfig = requireConfig(config);
  const response = await fetch(`${restBase(readyConfig)}?select=household_code&limit=1`, {
    method: 'GET',
    headers: headers(readyConfig)
  });
  if (!response.ok) throw new Error(`Cloud test failed: ${response.status} ${await response.text()}`);
}
