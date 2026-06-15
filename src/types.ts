export type Role = 'owner' | 'financial_manager' | 'household_member' | 'viewer' | 'child';

export interface User {
  id: string;
  name: string;
  role: Role;
  pin?: string;
}

export interface Account {
  id: string;
  name: string;
  type: string;
  startingBalance: number;
}

export interface Transaction {
  id: string;
  accountId: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  cleared: boolean;
}

export interface BudgetCategory {
  id: string;
  name: string;
  monthlyBudget: number;
}

export interface Debt {
  id: string;
  name: string;
  balance: number;
  payment: number;
  rate: number;
}

export interface PriceCatalogItem {
  id: string;
  store: string;
  storeName?: string;
  storeZip?: string;
  zipCode?: string;
  location?: string;
  aisle?: string;
  sku?: string;
  upc?: string;
  source?: string;
  unit?: string;
  unitPrice?: number;
  name: string;
  brand?: string;
  size?: string;
  category?: string;
  price: number;
  lastChecked: string;
  notes?: string;
  [key: string]: unknown;
}

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  estimatedPrice: number;
  actualPrice?: number;
  checked: boolean;
  store?: string;
  category?: string;
  notes?: string;
  source?: 'manual' | 'price_catalog' | 'meal_plan' | 'pantry';
  sourceMealId?: string;
  sourceIngredientId?: string;
}

export interface ShoppingList {
  id: string;
  name: string;
  type: 'custom' | 'grocery' | 'school' | 'meal_plan' | 'sams' | 'warehouse';
  sharedWith: string[];
  items: ShoppingItem[];
}

export interface StatementImportRow {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'credit' | 'debit';
  matchStatus: 'matched' | 'possible' | 'missing_from_register';
  matchedTransactionId?: string;
}

export type PantryCategory =
  | 'Dry Goods'
  | 'Spices'
  | 'Canned Goods'
  | 'Frozen Foods'
  | 'Meats'
  | 'Sauces'
  | 'Vegetables'
  | 'Fruits'
  | 'Baking Goods'
  | 'Dairy'
  | 'Breakfast'
  | 'Snacks'
  | 'Drinks'
  | 'Household'
  | 'Other';

export interface PantryItem {
  id: string;
  name: string;
  category: PantryCategory;
  quantity: number;
  unit: string;
  location: string;
  estimatedUnitPrice?: number;
  priceCatalogItemId?: string;
  store?: string;
  expirationDate?: string;
  notes?: string;
  lastUpdated: string;
}

export type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' | 'Prep';

export interface MealIngredient {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category?: PantryCategory | string;
  estimatedPrice: number;
  pantryCovered: boolean;
  pantryItemId?: string;
  priceCatalogItemId?: string;
  store?: string;
  notes?: string;
}

export type RecipeSource = 'manual' | 'photo' | 'starter';

export interface Recipe {
  id: string;
  name: string;
  servings: number;
  category?: string;
  ingredients: MealIngredient[];
  instructions?: string;
  notes?: string;
  source: RecipeSource;
  photoName?: string;
  photoDataUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MealPlanItem {
  id: string;
  name: string;
  date: string;
  mealType: MealType;
  servings: number;
  ingredients: MealIngredient[];
  notes?: string;
  recipeId?: string;
  createdAt: string;
}

export interface AppData {
  householdId?: string;
  householdName?: string;
  inviteCode?: string;
  users: User[];
  currentUserId: string;
  accounts: Account[];
  transactions: Transaction[];
  budgetCategories: BudgetCategory[];
  debts: Debt[];
  shoppingLists: ShoppingList[];
  priceCatalog: PriceCatalogItem[];
  statementImports: StatementImportRow[];
  pantryItems: PantryItem[];
  recipes: Recipe[];
  mealPlans: MealPlanItem[];
}
