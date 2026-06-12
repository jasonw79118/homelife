import type { AppData } from '../types';

export const STORAGE_KEY = 'homelife-data-v2';
const LEGACY_KEYS = ['homelife-data-v1', 'homelife-data', 'homelifeData'];

export const DEFAULT_DATA: AppData = {
  users: [
    { id: 'user-owner', name: 'Owner', role: 'owner' },
    { id: 'user-household', name: 'Household Member', role: 'household_member' }
  ],
  currentUserId: 'user-owner',
  accounts: [
    { id: 'acct-checking', name: 'Checking', type: 'checking', startingBalance: 0 }
  ],
  transactions: [],
  budgetCategories: [
    { id: 'cat-grocery', name: 'Groceries', monthlyBudget: 800 },
    { id: 'cat-household', name: 'Household', monthlyBudget: 150 },
    { id: 'cat-utilities', name: 'Utilities', monthlyBudget: 600 }
  ],
  debts: [],
  shoppingLists: [
    {
      id: 'list-grocery',
      name: 'Main Grocery List',
      type: 'grocery',
      sharedWith: ['user-owner', 'user-household'],
      items: []
    }
  ],
  priceCatalog: [
    { id: 'price-eggs', store: 'Walmart', storeZip: '79015', name: 'Eggs', brand: 'Great Value', size: '18 count', category: 'Dairy', price: 5.74, lastChecked: '2026-06-12', notes: 'Starter manual record' },
    { id: 'price-milk', store: 'Walmart', storeZip: '79015', name: 'Milk', brand: 'Great Value', size: '1 gallon', category: 'Dairy', price: 3.32, lastChecked: '2026-06-12', notes: 'Starter manual record' },
    { id: 'price-chicken', store: 'Walmart', storeZip: '79015', name: 'Chicken breast', brand: 'Freshness Guaranteed', size: 'per package', category: 'Meats', price: 11.92, lastChecked: '2026-06-12', notes: 'Starter manual record' }
  ],
  statementImports: [],
  pantryItems: [
    { id: 'pantry-rice', name: 'White Rice', category: 'Dry Goods', quantity: 5, unit: 'lb', location: 'Pantry', estimatedUnitPrice: 0.98, lastUpdated: '2026-06-12' },
    { id: 'pantry-salt', name: 'Salt', category: 'Spices', quantity: 1, unit: 'container', location: 'Spice Cabinet', estimatedUnitPrice: 1.24, lastUpdated: '2026-06-12' },
    { id: 'pantry-chicken', name: 'Frozen Chicken Breast', category: 'Meats', quantity: 2, unit: 'lb', location: 'Freezer', estimatedUnitPrice: 3.25, lastUpdated: '2026-06-12' }
  ],
  mealPlans: []
};

export function loadData(): Partial<AppData> | null {
  if (typeof localStorage === 'undefined') return DEFAULT_DATA;
  const keys = [STORAGE_KEY, ...LEGACY_KEYS];
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      return JSON.parse(raw) as Partial<AppData>;
    } catch (error) {
      console.warn(`Unable to parse HomeLife storage key ${key}`, error);
    }
  }
  return DEFAULT_DATA;
}

export function saveData(data: AppData): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function resetData(): void {
  if (typeof localStorage === 'undefined') return;
  [STORAGE_KEY, ...LEGACY_KEYS].forEach((key) => localStorage.removeItem(key));
}
