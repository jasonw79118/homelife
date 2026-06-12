export type Role = 'owner' | 'financial_manager' | 'household_member' | 'child';

export type User = { id: string; name: string; role: Role };

export type Account = { id: string; name: string; type: 'checking' | 'savings' | 'credit' | 'cash'; startingBalance: number };

export type Transaction = { id: string; accountId: string; date: string; description: string; category: string; amount: number; cleared: boolean };

export type BudgetCategory = { id: string; name: string; monthlyBudget: number };

export type Debt = { id: string; name: string; balance: number; payment: number; rate: number };

export type ShoppingListType = 'grocery' | 'sams' | 'school' | 'custom';

export type ShoppingItem = {
  id: string;
  name: string;
  quantity: number;
  estimatedPrice: number;
  actualPrice?: number;
  checked: boolean;
  store?: string;
  category?: string;
  notes?: string;
  source?: 'manual' | 'price_catalog' | 'imported';
};

export type ShoppingList = { id: string; name: string; type: ShoppingListType; sharedWith: string[]; items: ShoppingItem[] };

export type PriceCatalogItem = {
  id: string;
  store: 'Walmart' | 'United Supermarkets' | "Sam's" | 'Target' | 'Other';
  storeName?: string;
  storeAddress?: string;
  storeZip?: string;
  name: string;
  brand?: string;
  size?: string;
  category?: string;
  price: number;
  lastChecked: string;
  notes?: string;
};

export type StatementImportRow = {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  matchedTransactionId?: string;
  matchStatus: 'matched' | 'possible' | 'missing_from_register';
};

export type AppData = {
  currentUserId: string;
  users: User[];
  accounts: Account[];
  transactions: Transaction[];
  budgetCategories: BudgetCategory[];
  debts: Debt[];
  shoppingLists: ShoppingList[];
  priceCatalog: PriceCatalogItem[];
  statementImports: StatementImportRow[];
};
