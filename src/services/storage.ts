import type { AppData } from '../types';
import { starterData } from '../data/starterData';

const STORAGE_KEY = 'homelife-data-v1';

export function loadData(): AppData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return starterData;
  try {
    return JSON.parse(raw) as AppData;
  } catch {
    return starterData;
  }
}

export function saveData(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function resetData() {
  localStorage.removeItem(STORAGE_KEY);
}
