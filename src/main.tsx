import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { DEFAULT_DATA, SESSION_KEY, clearActiveHouseholdCode, createHousehold, getActiveHouseholdCode, listHouseholds, loadData, mergeDefaultPriceCatalog, normalizeHouseholdCode, resetData, saveData, setActiveHouseholdCode } from './services/storage';
import { clearCloudSyncConfig, cloudSyncSummary, getCloudSyncConfig, isCloudSyncReady, loadCloudHousehold, saveCloudHousehold, saveCloudSyncConfig, testCloudConnection } from './services/cloud';
import type {
  AppData,
  MealIngredient,
  MealPlanItem,
  MealType,
  PantryCategory,
  PantryItem,
  PriceCatalogItem,
  Recipe,
  Role,
  ShoppingItem,
  ShoppingList,
  StatementImportRow,
  Transaction,
  User
} from './types';
import './styles.css';

type IconProps = { size?: number };
function IconGlyph({ label, size = 16 }: IconProps & { label: string }) {
  return <span className="inline-icon" style={{ fontSize: `${size}px` }} aria-hidden="true">{label}</span>;
}
const Archive = (props: IconProps) => <IconGlyph label="▣" {...props} />;
const BarChart3 = (props: IconProps) => <IconGlyph label="▥" {...props} />;
const BookOpen = (props: IconProps) => <IconGlyph label="📖" {...props} />;
const Camera = (props: IconProps) => <IconGlyph label="📷" {...props} />;
const CookingPot = (props: IconProps) => <IconGlyph label="🍲" {...props} />;
const EyeOff = (props: IconProps) => <IconGlyph label="◌" {...props} />;
const FileSearch = (props: IconProps) => <IconGlyph label="⌕" {...props} />;
const Home = (props: IconProps) => <IconGlyph label="⌂" {...props} />;
const Landmark = (props: IconProps) => <IconGlyph label="▤" {...props} />;
const MenuIcon = (props: IconProps) => <IconGlyph label="☰" {...props} />;
const Settings = (props: IconProps) => <IconGlyph label="⚙" {...props} />;
const ShoppingCart = (props: IconProps) => <IconGlyph label="🛒" {...props} />;
const PlusCircle = (props: IconProps) => <IconGlyph label="＋" {...props} />;
const Tags = (props: IconProps) => <IconGlyph label="🏷" {...props} />;
const Trash2 = (props: IconProps) => <IconGlyph label="×" {...props} />;
const Utensils = (props: IconProps) => <IconGlyph label="🍽" {...props} />;
const WalletCards = (props: IconProps) => <IconGlyph label="▧" {...props} />;


const financeRoles: Role[] = ['owner', 'financial_manager'];
const PANTRY_CATEGORIES: PantryCategory[] = [
  'Dry Goods',
  'Spices',
  'Canned Goods',
  'Frozen Foods',
  'Meats',
  'Sauces',
  'Vegetables',
  'Fruits',
  'Baking Goods',
  'Dairy',
  'Breakfast',
  'Snacks',
  'Drinks',
  'Household',
  'Other'
];
const MEAL_TYPES: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Prep'];
const DEFAULT_RECIPE_STORE = 'Walmart';
const RECIPE_STORE_KEY = 'homelife-recipe-builder-store-v1';

function money(value: number) {
  return (Number.isFinite(value) ? value : 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
function accountBalance(data: AppData, accountId: string) {
  const account = data.accounts.find((a) => a.id === accountId);
  if (!account) return 0;
  return account.startingBalance + data.transactions.filter((t) => t.accountId === accountId).reduce((sum, t) => sum + t.amount, 0);
}
function uid(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function today() { return new Date().toISOString().slice(0, 10); }
function clean(value: string | null | undefined, fallback = '') { return String(value ?? fallback).trim(); }
function parseNumber(value: string | null | undefined, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(/[$,]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}
function promptNumber(label: string, fallback = 0) { return parseNumber(prompt(label, String(fallback)), fallback); }

function promptIngredientCategory(current?: string): string | undefined {
  const category = clean(prompt(`Ingredient category? Leave blank if you want to decide later.

Common choices: ${PANTRY_CATEGORIES.join(', ')}`, current ?? ''));
  return category || undefined;
}

function normalizeCategory(value: string | null | undefined): PantryCategory {
  const match = PANTRY_CATEGORIES.find((category) => category.toLowerCase() === clean(value).toLowerCase());
  return match ?? 'Other';
}

function arrayOf<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) ? value as T[] : fallback;
}

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[$,]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeRole(value: unknown): Role {
  return financeRoles.includes(value as Role) || ['household_member', 'viewer', 'child'].includes(String(value)) ? value as Role : 'household_member';
}

function normalizeData(data: Partial<AppData> | null | undefined): AppData {
  const safe = data ?? {};
  const fallback = DEFAULT_DATA;
  const fallbackUsers = fallback.users;
  const users = arrayOf<User>(safe.users, fallbackUsers).map((u, index) => ({
    id: clean(u?.id, `user-${index + 1}`),
    name: clean(u?.name, index === 0 ? 'Owner' : 'Household Member'),
    role: safeRole(u?.role),
    pin: typeof u?.pin === 'string' ? u.pin : ''
  })).filter((u) => u.id && u.name);
  const normalizedUsers = users.length ? users : fallbackUsers;

  const accounts = arrayOf(safe.accounts, fallback.accounts).map((a, index) => ({
    id: clean(a?.id, `acct-${index + 1}`),
    name: clean(a?.name, index === 0 ? 'Checking' : `Account ${index + 1}`),
    type: clean(a?.type, 'checking'),
    startingBalance: safeNumber(a?.startingBalance, 0)
  })).filter((a) => a.id && a.name);
  const normalizedAccounts = accounts.length ? accounts : fallback.accounts;
  const primaryAccountId = normalizedAccounts[0]?.id ?? 'acct-checking';

  const priceCatalog = mergeDefaultPriceCatalog(arrayOf<PriceCatalogItem>(safe.priceCatalog, []))
    .map((p, index) => ({
      ...p,
      id: clean(p?.id, `price-${index + 1}`),
      store: clean(p?.store, 'Other'),
      name: clean(p?.name, `Catalog Item ${index + 1}`),
      price: safeNumber(p?.price, 0),
      lastChecked: clean(p?.lastChecked, today()),
      category: clean(p?.category, 'Other')
    }))
    .filter((p) => p.id && p.name);

  const shoppingLists = arrayOf<ShoppingList>(safe.shoppingLists, fallback.shoppingLists).map((list, index) => ({
    id: clean(list?.id, `list-${index + 1}`),
    name: clean(list?.name, index === 0 ? 'Main Grocery List' : `Shopping List ${index + 1}`),
    type: (['custom', 'grocery', 'school', 'meal_plan', 'sams', 'warehouse'].includes(String(list?.type)) ? list.type : 'custom') as ShoppingList['type'],
    sharedWith: arrayOf<string>(list?.sharedWith, normalizedUsers.map((u) => u.id)),
    items: arrayOf<ShoppingItem>(list?.items, []).map((item, itemIndex) => ({
      id: clean(item?.id, `item-${index + 1}-${itemIndex + 1}`),
      name: clean(item?.name, `Item ${itemIndex + 1}`),
      quantity: safeNumber(item?.quantity, 1),
      estimatedPrice: safeNumber(item?.estimatedPrice, safeNumber(item?.actualPrice, 0)),
      actualPrice: item?.actualPrice === undefined ? undefined : safeNumber(item.actualPrice, 0),
      checked: Boolean(item?.checked),
      store: item?.store,
      category: item?.category,
      notes: item?.notes,
      source: item?.source,
      sourceMealId: item?.sourceMealId,
      sourceIngredientId: item?.sourceIngredientId
    })).filter((item) => item.id && item.name)
  })).filter((list) => list.id && list.name);

  return {
    householdId: clean(safe.householdId, fallback.householdId ?? 'DEMO'),
    householdName: clean(safe.householdName, fallback.householdName ?? 'Demo Household'),
    inviteCode: clean(safe.inviteCode, safe.householdId ?? fallback.inviteCode ?? 'DEMO'),
    users: normalizedUsers,
    currentUserId: safe.currentUserId && normalizedUsers.some((u) => u.id === safe.currentUserId) ? safe.currentUserId : normalizedUsers[0].id,
    accounts: normalizedAccounts,
    transactions: arrayOf<Transaction>(safe.transactions, fallback.transactions).map((t, index) => ({
      id: clean(t?.id, `txn-${index + 1}`),
      accountId: normalizedAccounts.some((a) => a.id === t?.accountId) ? t.accountId : primaryAccountId,
      date: clean(t?.date, today()),
      description: clean(t?.description, 'Transaction'),
      category: clean(t?.category, 'Uncategorized'),
      amount: safeNumber(t?.amount, 0),
      cleared: Boolean(t?.cleared)
    })),
    budgetCategories: arrayOf(safe.budgetCategories, fallback.budgetCategories).map((c, index) => ({
      id: clean(c?.id, `cat-${index + 1}`),
      name: clean(c?.name, `Category ${index + 1}`),
      monthlyBudget: safeNumber(c?.monthlyBudget, 0)
    })),
    debts: arrayOf(safe.debts, fallback.debts).map((d, index) => ({
      id: clean(d?.id, `debt-${index + 1}`),
      name: clean(d?.name, `Debt ${index + 1}`),
      balance: safeNumber(d?.balance, 0),
      payment: safeNumber(d?.payment, 0),
      rate: safeNumber(d?.rate, 0)
    })),
    shoppingLists: shoppingLists.length ? shoppingLists : fallback.shoppingLists,
    priceCatalog,
    statementImports: arrayOf<StatementImportRow>(safe.statementImports, fallback.statementImports).map((row, index) => ({
      id: clean(row?.id, `stmt-${index + 1}`),
      date: clean(row?.date, today()),
      description: clean(row?.description, 'Imported transaction'),
      amount: safeNumber(row?.amount, 0),
      type: row?.type === 'credit' ? 'credit' : 'debit',
      matchStatus: (['matched', 'possible', 'missing_from_register'].includes(String(row?.matchStatus)) ? row.matchStatus : 'missing_from_register') as StatementImportRow['matchStatus'],
      matchedTransactionId: row?.matchedTransactionId
    })),
    pantryItems: arrayOf<PantryItem>(safe.pantryItems, fallback.pantryItems).map((item, index) => ({
      id: clean(item?.id, `pantry-${index + 1}`),
      name: clean(item?.name, `Pantry Item ${index + 1}`),
      category: normalizeCategory(item?.category),
      quantity: safeNumber(item?.quantity, 0),
      unit: clean(item?.unit, 'item'),
      location: clean(item?.location, 'Pantry'),
      estimatedUnitPrice: item?.estimatedUnitPrice === undefined ? undefined : safeNumber(item.estimatedUnitPrice, 0),
      priceCatalogItemId: item?.priceCatalogItemId,
      store: item?.store,
      expirationDate: item?.expirationDate,
      notes: item?.notes,
      lastUpdated: clean(item?.lastUpdated, today())
    })),
    recipes: arrayOf<Recipe>(safe.recipes, fallback.recipes ?? []).map((recipe, index) => ({
      id: clean(recipe?.id, `recipe-${index + 1}`),
      name: clean(recipe?.name, `Recipe ${index + 1}`),
      servings: safeNumber(recipe?.servings, 4),
      category: recipe?.category,
      ingredients: arrayOf<MealIngredient>(recipe?.ingredients, []).map((ing, ingIndex) => ({
        id: clean(ing?.id, `recipe-ing-${index + 1}-${ingIndex + 1}`),
        name: clean(ing?.name, `Ingredient ${ingIndex + 1}`),
        quantity: safeNumber(ing?.quantity, 1),
        unit: clean(ing?.unit, 'item'),
        category: ing?.category,
        estimatedPrice: safeNumber(ing?.estimatedPrice, 0),
        pantryCovered: Boolean(ing?.pantryCovered),
        pantryItemId: ing?.pantryItemId,
        priceCatalogItemId: ing?.priceCatalogItemId,
        store: ing?.store,
        notes: ing?.notes
      })),
      instructions: recipe?.instructions,
      notes: recipe?.notes,
      source: (['manual', 'photo', 'starter'].includes(String(recipe?.source)) ? recipe.source : 'manual') as Recipe['source'],
      photoName: recipe?.photoName,
      photoDataUrl: recipe?.photoDataUrl,
      createdAt: clean(recipe?.createdAt, today()),
      updatedAt: clean(recipe?.updatedAt, today())
    })).filter((recipe) => recipe.id && recipe.name),
    mealPlans: arrayOf<MealPlanItem>(safe.mealPlans, fallback.mealPlans).map((meal, index) => ({
      id: clean(meal?.id, `meal-${index + 1}`),
      name: clean(meal?.name, `Meal ${index + 1}`),
      date: clean(meal?.date, today()),
      mealType: (MEAL_TYPES.includes(meal?.mealType as MealType) ? meal.mealType : 'Dinner') as MealType,
      servings: safeNumber(meal?.servings, 1),
      ingredients: arrayOf<MealIngredient>(meal?.ingredients, []).map((ing, ingIndex) => ({
        id: clean(ing?.id, `ing-${index + 1}-${ingIndex + 1}`),
        name: clean(ing?.name, `Ingredient ${ingIndex + 1}`),
        quantity: safeNumber(ing?.quantity, 1),
        unit: clean(ing?.unit, 'item'),
        category: ing?.category,
        estimatedPrice: safeNumber(ing?.estimatedPrice, 0),
        pantryCovered: Boolean(ing?.pantryCovered),
        pantryItemId: ing?.pantryItemId,
        priceCatalogItemId: ing?.priceCatalogItemId,
        store: ing?.store,
        notes: ing?.notes
      })),
      notes: meal?.notes,
      recipeId: meal?.recipeId,
      createdAt: clean(meal?.createdAt, today())
    }))
  };
}

const INGREDIENT_TOKEN_STOPWORDS = new Set([
  'fresh', 'frozen', 'canned', 'can', 'cans', 'jar', 'jars', 'package', 'packages', 'pkg', 'bag', 'bags', 'box', 'boxes',
  'large', 'small', 'medium', 'whole', 'ground', 'chopped', 'diced', 'sliced', 'shredded', 'minced', 'crushed', 'optional',
  'divided', 'drained', 'rinsed', 'cooked', 'uncooked', 'boneless', 'skinless', 'lean', 'extra', 'about', 'of', 'and', 'or', 'the'
]);

function ingredientSearchTokens(value: string): string[] {
  return clean(value).toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/s$/i, ''))
    .filter((word) => word.length > 2 && !INGREDIENT_TOKEN_STOPWORDS.has(word));
}

function ingredientTokenScore(needle: string, candidate: string): number {
  const left = ingredientSearchTokens(needle);
  const right = ingredientSearchTokens(candidate);
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  let matched = 0;
  left.forEach((token) => { if (rightSet.has(token)) matched += 1; });
  const coverage = matched / Math.max(1, left.length);
  const bonus = right.some((token) => left.includes(token)) ? 1 : 0;
  return matched * 2 + coverage + bonus;
}

function orderCatalogByStorePreference(catalog: PriceCatalogItem[], preferredStore?: string): PriceCatalogItem[] {
  const preferred = clean(preferredStore, DEFAULT_RECIPE_STORE).toLowerCase();
  return [...catalog].sort((a, b) => {
    const aPreferred = a.store.toLowerCase() === preferred ? 0 : 1;
    const bPreferred = b.store.toLowerCase() === preferred ? 0 : 1;
    if (aPreferred !== bPreferred) return aPreferred - bPreferred;
    const aWalmart = a.store === DEFAULT_RECIPE_STORE ? 0 : 1;
    const bWalmart = b.store === DEFAULT_RECIPE_STORE ? 0 : 1;
    if (aWalmart !== bWalmart) return aWalmart - bWalmart;
    return a.store.localeCompare(b.store) || (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name);
  });
}

function bestCatalogMatch(name: string, catalog: PriceCatalogItem[], preferredStore?: string): PriceCatalogItem | undefined {
  const needle = clean(name).toLowerCase();
  if (!needle) return undefined;
  const orderedCatalog = orderCatalogByStorePreference(catalog, preferredStore);
  const exact = orderedCatalog.find((p) => p.name.toLowerCase() === needle);
  if (exact) return exact;
  const contains = orderedCatalog.find((p) => p.name.toLowerCase().includes(needle) || needle.includes(p.name.toLowerCase()));
  if (contains) return contains;
  const scored = orderedCatalog
    .map((item) => ({ item, score: Math.max(ingredientTokenScore(name, item.name), ingredientTokenScore(name, `${item.brand ?? ''} ${item.name} ${item.size ?? ''}`)) }))
    .filter((entry) => entry.score >= 3)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.item;
}

function bestPantryMatch(name: string, pantryItems: PantryItem[]): PantryItem | undefined {
  const needle = clean(name).toLowerCase();
  if (!needle) return undefined;
  const exact = pantryItems.find((p) => p.name.toLowerCase() === needle);
  if (exact) return exact;
  const contains = pantryItems.find((p) => p.name.toLowerCase().includes(needle) || needle.includes(p.name.toLowerCase()));
  if (contains) return contains;
  const scored = pantryItems
    .map((item) => ({ item, score: ingredientTokenScore(name, item.name) }))
    .filter((entry) => entry.score >= 3)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.item;
}

function findCatalogMatch(name: string, catalog: PriceCatalogItem[], preferredStore?: string) {
  return bestCatalogMatch(name, catalog, preferredStore);
}

function findPantryMatch(name: string, pantryItems: PantryItem[]) {
  return bestPantryMatch(name, pantryItems);
}

function estimateIngredientCostFromCatalog(catalog: PriceCatalogItem | undefined, quantity: number, unit: string): number {
  if (!catalog) return 0;
  const qty = Math.max(1, safeNumber(quantity, 1));
  const unitPrice = typeof catalog.unitPrice === 'number' && Number.isFinite(catalog.unitPrice) ? catalog.unitPrice : undefined;
  if (unitPrice !== undefined && unitPrice > 0) return unitPrice * qty;
  const requestedUnit = normalizeUnit(unit);
  const catalogUnit = normalizeUnit(String(catalog.unit ?? 'item'));
  const discreteUnits = new Set(['item', 'can', 'jar', 'package', 'bag', 'box', 'bottle', 'lb', 'oz', 'pound']);
  if (requestedUnit === catalogUnit || (catalogUnit === 'item' && discreteUnits.has(requestedUnit))) return safeNumber(catalog.price, 0) * qty;
  return safeNumber(catalog.price, 0);
}

function catalogPriceLine(catalog: PriceCatalogItem | undefined, quantity: number, unit: string): string {
  if (!catalog) return 'Catalog price: no match found yet';
  const estimated = estimateIngredientCostFromCatalog(catalog, quantity, unit);
  return `Catalog price: ${money(estimated)} from ${catalog.store}${catalog.storeName ? ` (${catalog.storeName})` : ''}${catalog.size ? ` · ${catalog.size}` : ''}`;
}

function pantryCoversIngredient(ingredientName: string, quantity: number, unit: string, pantryItems: PantryItem[]) {
  const pantry = findPantryMatch(ingredientName, pantryItems);
  if (!pantry) return false;
  const requestedUnit = normalizeUnit(unit);
  const pantryUnit = normalizeUnit(pantry.unit);
  if (requestedUnit === pantryUnit) return safeNumber(pantry.quantity, 0) >= Math.max(0, safeNumber(quantity, 1));
  return safeNumber(pantry.quantity, 0) > 0;
}

function buildIngredientFromParts(data: AppData, name: string, quantity = 1, unit = 'item', estimatedPrice?: number, preferredStore = DEFAULT_RECIPE_STORE): MealIngredient {
  const catalog = findCatalogMatch(name, data.priceCatalog, preferredStore);
  const pantry = findPantryMatch(name, data.pantryItems);
  const safeQuantity = Math.max(0, safeNumber(quantity, 1));
  const safeUnit = clean(unit, catalog?.unit ?? pantry?.unit ?? 'item');
  const pantryCovered = pantryCoversIngredient(name, safeQuantity, safeUnit, data.pantryItems);
  const catalogEstimate = estimateIngredientCostFromCatalog(catalog, safeQuantity, safeUnit);
  const pantryEstimate = pantry?.estimatedUnitPrice ? pantry.estimatedUnitPrice * Math.max(1, safeQuantity) : 0;
  const defaultEstimate = estimatedPrice ?? (catalogEstimate || pantryEstimate || 0);
  return {
    id: uid('ing'),
    name: catalog?.name ?? pantry?.name ?? clean(name, 'Ingredient'),
    quantity: safeQuantity || 1,
    unit: safeUnit,
    category: undefined,
    estimatedPrice: Math.max(0, safeNumber(defaultEstimate, 0)),
    pantryCovered,
    pantryItemId: pantryCovered ? pantry?.id : undefined,
    priceCatalogItemId: catalog?.id,
    store: catalog?.store,
    notes: catalog ? `${catalog.brand ?? ''} ${catalog.size ?? ''}`.trim() : undefined
  };
}

function refreshIngredientAgainstPantry(data: AppData, ingredient: MealIngredient, preferredStore?: string): MealIngredient {
  const storePreference = preferredStore ?? ingredient.store ?? DEFAULT_RECIPE_STORE;
  const refreshed = buildIngredientFromParts(data, ingredient.name, ingredient.quantity, ingredient.unit, ingredient.estimatedPrice, storePreference);
  return { ...ingredient, ...refreshed, id: ingredient.id, category: ingredient.category, notes: ingredient.notes ?? refreshed.notes };
}

function ingredientToShoppingItem(meal: MealPlanItem, ingredient: MealIngredient): ShoppingItem {
  const quantity = Math.max(1, safeNumber(ingredient.quantity, 1));
  const estimatedUnitPrice = safeNumber(ingredient.estimatedPrice, 0) / quantity;
  return {
    id: uid('item'),
    name: ingredient.name,
    quantity,
    estimatedPrice: estimatedUnitPrice,
    checked: false,
    store: ingredient.store,
    category: ingredient.category,
    notes: `${meal.name} · ${ingredient.quantity} ${ingredient.unit}${ingredient.notes ? ` · ${ingredient.notes}` : ''}`,
    source: 'meal_plan',
    sourceMealId: meal.id,
    sourceIngredientId: ingredient.id
  };
}


const COMMON_INGREDIENT_WORDS = [
  'beef', 'ground beef', 'chicken', 'chicken breast', 'turkey', 'pork', 'ham', 'bacon', 'sausage', 'fish', 'salmon', 'tuna', 'shrimp',
  'egg', 'eggs', 'milk', 'butter', 'cheese', 'cream cheese', 'sour cream', 'yogurt', 'heavy cream',
  'flour', 'sugar', 'brown sugar', 'powdered sugar', 'baking powder', 'baking soda', 'yeast', 'cornstarch',
  'rice', 'pasta', 'noodles', 'spaghetti', 'macaroni', 'bread', 'tortillas', 'oats', 'cereal',
  'beans', 'black beans', 'pinto beans', 'kidney beans', 'corn', 'peas', 'green beans',
  'tomato', 'tomatoes', 'tomato sauce', 'tomato paste', 'diced tomatoes', 'onion', 'onions', 'garlic', 'potato', 'potatoes', 'carrot', 'carrots',
  'lettuce', 'spinach', 'broccoli', 'pepper', 'bell pepper', 'jalapeno', 'avocado', 'lime', 'lemon', 'apple', 'banana',
  'salt', 'pepper', 'garlic powder', 'onion powder', 'paprika', 'cumin', 'chili powder', 'cinnamon', 'vanilla', 'oregano', 'basil',
  'oil', 'olive oil', 'vegetable oil', 'vinegar', 'soy sauce', 'worcestershire sauce', 'bbq sauce', 'ketchup', 'mustard', 'mayonnaise', 'salsa', 'broth', 'stock'
];

const INGREDIENT_UNITS = [
  'teaspoon', 'teaspoons', 'tsp', 'tablespoon', 'tablespoons', 'tbsp', 'cup', 'cups', 'pint', 'pints', 'quart', 'quarts', 'gallon', 'gallons',
  'ounce', 'ounces', 'oz', 'pound', 'pounds', 'lb', 'lbs', 'gram', 'grams', 'g', 'kg', 'kilogram', 'kilograms',
  'can', 'cans', 'jar', 'jars', 'box', 'boxes', 'bag', 'bags', 'package', 'packages', 'pkg', 'bottle', 'bottles',
  'clove', 'cloves', 'slice', 'slices', 'stick', 'sticks', 'dash', 'pinch', 'sprig', 'head', 'bunch', 'item', 'items',
  'c', 't', 'tbs', 'tbl', 'tbls', 'envelope', 'envelopes', 'packet', 'packets'
];

const UNICODE_FRACTIONS: Record<string, string> = {
  '¼': ' 1/4', '½': ' 1/2', '¾': ' 3/4', '⅓': ' 1/3', '⅔': ' 2/3', '⅛': ' 1/8', '⅜': ' 3/8', '⅝': ' 5/8', '⅞': ' 7/8'
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, half: 0.5, quarter: 0.25
};

function normalizeUnit(unit: string | undefined): string {
  const cleaned = clean(unit, 'item').toLowerCase().replace(/\.$/, '');
  const map: Record<string, string> = {
    teaspoons: 'tsp', teaspoon: 'tsp', tablespoon: 'tbsp', tablespoons: 'tbsp', ounce: 'oz', ounces: 'oz', pound: 'lb', pounds: 'lb', lbs: 'lb',
    packages: 'package', pkgs: 'package', pkg: 'package', cans: 'can', jars: 'jar', bags: 'bag', boxes: 'box', bottles: 'bottle', cloves: 'clove', slices: 'slice', sticks: 'stick', cups: 'cup',
    c: 'cup', t: 'tsp', tbs: 'tbsp', tbl: 'tbsp', tbls: 'tbsp', envelopes: 'envelope', packets: 'packet'
  };
  return map[cleaned] ?? cleaned ?? 'item';
}

function titleCaseIngredient(value: string): string {
  return clean(value).split(/\s+/).map((word) => {
    if (word.length <= 2 && ['of', 'or', 'to'].includes(word.toLowerCase())) return word.toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
}

function parseSmartQuantity(value: string | undefined): number {
  const raw = clean(value).toLowerCase().replace(/[()]/g, '').replace(/-/g, ' ');
  if (!raw) return 1;
  if (NUMBER_WORDS[raw] !== undefined) return NUMBER_WORDS[raw];
  const parts = raw.split(/\s+/).filter(Boolean);
  let total = 0;
  for (const part of parts) {
    if (NUMBER_WORDS[part] !== undefined) {
      total += NUMBER_WORDS[part];
    } else if (/^\d+\/\d+$/.test(part)) {
      const [a, b] = part.split('/').map(Number);
      total += b ? a / b : 0;
    } else {
      const parsed = Number(part);
      if (Number.isFinite(parsed)) total += parsed;
    }
  }
  return total > 0 ? total : 1;
}

function stripRecipeNoise(text: string): string {
  let out = clean(text)
    .replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, (match) => UNICODE_FRACTIONS[match] ?? match)
    .replace(/\r/g, '\n')
    .replace(/[|]/g, '\n')
    .replace(/\u2022|•|▪|◦|–|—/g, '\n')
    .replace(/\b([0-9])\s*[Il]\s?b\b/g, '$1 lb')
    .replace(/\b([0-9])\s*o\s?z\b/gi, '$1 oz')
    .replace(/\b(ingredients?|what you need|shopping list|you will need)\s*:?/gi, '\n')
    .replace(/\b(directions?|instructions?|method|preparation|prep|steps?)\s*:?/gi, '\nSTOP_RECIPE_DIRECTIONS\n')
    .replace(/\b(nutrition|calories|servings?|yield|cook time|prep time|total time)\b[^\n]*/gi, '\n');
  out = out.split('STOP_RECIPE_DIRECTIONS')[0] ?? out;
  return out.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
}

function extractRecipeInstructions(text: string): string {
  const raw = clean(text).replace(/\r/g, '\n');
  const match = raw.match(/(?:directions?|instructions?|method|preparation|prep|steps?)\s*:?\s*([\s\S]+)/i);
  if (!match) return '';
  return clean(match[1]
    .replace(/\b(nutrition|calories|servings?|yield|cook time|prep time|total time)\b[\s\S]*$/i, '')
    .replace(/\n{3,}/g, '\n\n'));
}


function splitIngredientCandidates(text: string): string[] {
  const cleaned = stripRecipeNoise(text);
  const unitPattern = INGREDIENT_UNITS.join('|');
  const numberWords = Object.keys(NUMBER_WORDS).join('|');
  const quantityLookahead = `(?=(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|${numberWords})(?:\s*(?:${unitPattern})\b|\s+[a-zA-Z]))`;
  const withBreaks = cleaned
    .replace(/\s*(?:,|;|\|)\s*(?=(?:\d|[¼½¾⅓⅔⅛⅜⅝⅞]|one|two|three|four|five|six|seven|eight|nine|ten)\b)/gi, '\n')
    .replace(new RegExp(`\s+${quantityLookahead}`, 'gi'), '\n')
    .replace(/\s+(?=(?:one|two|three|four|five|six|seven|eight|nine|ten)\s)/gi, '\n');
  return withBreaks
    .split(/\n+/)
    .map((line) => clean(line.replace(/^[-*\d.)\s]+(?=\D)/, '')))
    .filter(Boolean);
}

function isLikelyInstruction(line: string): boolean {
  const lower = line.toLowerCase();
  if (/^(preheat|heat|cook|bake|mix|stir|combine|serve|slice|chop|dice|add|place|pour|sprinkle|cover|remove|let|whisk)\b/.test(lower)) return true;
  if (lower.split(/\s+/).length > 18 && !/\d|cup|tbsp|tsp|lb|oz|can|package|clove|salt|pepper/i.test(lower)) return true;
  return false;
}

function parseIngredientLine(line: string): { name: string; quantity: number; unit: string; estimatedPrice?: number } | null {
  const cleaned = clean(line);
  if (!cleaned || isLikelyInstruction(cleaned)) return null;
  const priceMatch = cleaned.match(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/);
  const estimatedPrice = priceMatch ? Number(priceMatch[1]) : undefined;
  let withoutPrice = cleaned.replace(/\$\s*[0-9]+(?:\.[0-9]{1,2})?/, '').replace(/[,;]+$/, '').trim();
  withoutPrice = withoutPrice.replace(/\b(optional|divided|to taste|as needed|for serving|for garnish)\b/gi, '').trim();
  withoutPrice = withoutPrice.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const unitPattern = INGREDIENT_UNITS.join('|');
  const numberWords = Object.keys(NUMBER_WORDS).join('|');
  const quantityPattern = `(\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?|${numberWords})`;
  const quantified = withoutPrice.match(new RegExp(`^${quantityPattern}\\s*(?:(${unitPattern})\\b)?\\s*(?:of\\s+)?(.+)$`, 'i'));
  if (quantified) {
    const rawQuantity = parseSmartQuantity(quantified[1]);
    let unit = normalizeUnit(quantified[2] || 'item');
    let rest = (quantified[3] ?? withoutPrice).trim();
    const packaged = rest.match(new RegExp(`^(?:\\(?\\d+(?:\\.\\d+)?\\s*(?:oz|ounce|ounces|lb|lbs|pound|pounds|g|gram|grams|kg|ml|l)\\)?\\s+)?(${unitPattern})\\b\\s+(.+)$`, 'i'));
    if (unit === 'item' && packaged) {
      unit = normalizeUnit(packaged[1]);
      rest = packaged[2];
    }
    const name = titleCaseIngredient(rest.replace(/,.*$/, '').trim());
    if (!name || name.length < 2) return null;
    return { name, quantity: rawQuantity, unit, estimatedPrice };
  }
  const namedUnit = withoutPrice.match(new RegExp(`^(.+?)\\s+(${unitPattern})s?$`, 'i'));
  const nameOnly = titleCaseIngredient((namedUnit?.[1] ?? withoutPrice).replace(/,.*$/, '').trim());
  if (!nameOnly || nameOnly.length < 2) return null;
  return { name: nameOnly, quantity: 1, unit: namedUnit ? normalizeUnit(namedUnit[2]) : 'item', estimatedPrice };
}

function knownIngredientNames(data: AppData): string[] {
  return data.priceCatalog
    .map((p) => p.name)
    .concat(data.pantryItems.map((p) => p.name), COMMON_INGREDIENT_WORDS)
    .filter((name, index, all) => Boolean(name) && all.findIndex((other) => other.toLowerCase() === name.toLowerCase()) === index)
    .sort((a, b) => b.length - a.length);
}


const OCR_RECIPE_NOISE_WORDS = [
  'calories', 'nutrition', 'directions', 'instructions', 'website', 'copyright', 'subscribe', 'print', 'share', 'review', 'ratings', 'minutes', 'hours', 'servings', 'yield', 'preheat', 'bake', 'cook', 'stir', 'mix', 'combine', 'serve'
];

function ingredientCandidateScore(data: AppData, item: { name: string; quantity: number; unit: string; estimatedPrice?: number }): number {
  const name = clean(item.name);
  const lower = name.toLowerCase();
  if (!name || name.length < 2) return -10;
  if (/https?:|www\.|@|\.com|\.net|\.org/i.test(name)) return -10;
  if (/[^a-zA-Z0-9\s'&/-]/.test(name) && !/[a-zA-Z]{3,}/.test(name)) return -4;
  if (OCR_RECIPE_NOISE_WORDS.some((word) => lower.includes(word))) return -4;
  if (!/[aeiou]/i.test(name) && name.length > 4) return -3;
  const words = lower.split(/\s+/).filter(Boolean);
  let score = 0;
  const catalogMatch = findCatalogMatch(name, data.priceCatalog);
  const pantryMatch = findPantryMatch(name, data.pantryItems);
  if (catalogMatch) score += 6;
  if (pantryMatch) score += 6;
  if (COMMON_INGREDIENT_WORDS.some((word) => lower.includes(word))) score += 4;
  if (normalizeUnit(item.unit) !== 'item') score += 2;
  if (safeNumber(item.quantity, 1) !== 1) score += 1;
  if (words.length <= 5) score += 1;
  if (!catalogMatch && !pantryMatch && !COMMON_INGREDIENT_WORDS.some((word) => lower.includes(word)) && normalizeUnit(item.unit) === 'item') score -= 2;
  if (words.length > 7 && normalizeUnit(item.unit) === 'item') score -= 3;
  if (/\d/.test(name) && normalizeUnit(item.unit) === 'item') score -= 2;
  return score;
}

function filterLikelyIngredientParts(data: AppData, items: Array<{ name: string; quantity: number; unit: string; estimatedPrice?: number }>) {
  const scored = items.map((item) => ({ item, score: ingredientCandidateScore(data, item) }));
  return scored
    .filter((entry) => entry.score >= 4)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}

function inferIngredientNamesFromPhotoName(filename: string, data: AppData): string[] {
  const base = filename.replace(/\.[a-z0-9]+$/i, ' ').replace(/[_-]+/g, ' ').toLowerCase();
  const matches = knownIngredientNames(data).filter((name) => base.includes(name.toLowerCase()));
  if (matches.length) return matches.slice(0, 8);
  const words = base.split(/\s+/).filter((word) => word.length > 2 && !['img', 'image', 'photo', 'ingredient', 'recipe', 'scan', 'jpg', 'jpeg', 'png', 'heic'].includes(word));
  return words.length ? [titleCaseIngredient(words.join(' '))] : [];
}

function smartParseIngredientsFromText(data: AppData, text: string, preferredStore = DEFAULT_RECIPE_STORE): { ingredients: MealIngredient[]; sourceText: string } {
  const sourceText = stripRecipeNoise(text);
  const parsed = splitIngredientCandidates(sourceText)
    .map(parseIngredientLine)
    .filter((item): item is { name: string; quantity: number; unit: string; estimatedPrice?: number } => Boolean(item && item.name));
  const catalogNames = knownIngredientNames(data);
  const lowerText = sourceText.toLowerCase();
  const inferred: Array<{ name: string; quantity: number; unit: string; estimatedPrice?: number }> = catalogNames
    .filter((name) => lowerText.includes(name.toLowerCase()))
    .filter((name) => !parsed.some((item) => item.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(item.name.toLowerCase())))
    .slice(0, 12)
    .map((name) => ({ name, quantity: 1, unit: 'item' }));
  const combined = filterLikelyIngredientParts(data, [...parsed, ...inferred]);
  const unique = combined.filter((item, index, all) => all.findIndex((other) => other.name.toLowerCase() === item.name.toLowerCase() && other.unit === item.unit) === index);
  return { ingredients: unique.map((item) => buildIngredientFromParts(data, item.name, item.quantity, item.unit, item.estimatedPrice, preferredStore)), sourceText };
}

function pantryValue(items: PantryItem[]) {
  return arrayOf<PantryItem>(items, []).reduce((sum, item) => sum + safeNumber(item.quantity, 0) * safeNumber(item.estimatedUnitPrice, 0), 0);
}
function listEstimatedTotal(list: ShoppingList) { return arrayOf<ShoppingItem>(list.items, []).reduce((sum, item) => sum + safeNumber(item.quantity, 1) * safeNumber(item.estimatedPrice, 0), 0); }
function listActualTotal(list: ShoppingList) { return arrayOf<ShoppingItem>(list.items, []).reduce((sum, item) => sum + safeNumber(item.quantity, 1) * safeNumber(item.actualPrice ?? item.estimatedPrice, 0), 0); }
function mealIngredients(meal: MealPlanItem) { return arrayOf<MealIngredient>(meal.ingredients, []); }
function mealTotalCost(meal: MealPlanItem) { return mealIngredients(meal).reduce((sum, item) => sum + safeNumber(item.estimatedPrice, 0), 0); }
function mealGroceryCost(meal: MealPlanItem) { return mealIngredients(meal).filter((item) => !item.pantryCovered).reduce((sum, item) => sum + safeNumber(item.estimatedPrice, 0), 0); }
function mealPantryCoveredCost(meal: MealPlanItem) { return mealIngredients(meal).filter((item) => item.pantryCovered).reduce((sum, item) => sum + safeNumber(item.estimatedPrice, 0), 0); }
function allMealGroceryCost(meals: MealPlanItem[]) { return arrayOf<MealPlanItem>(meals, []).reduce((sum, meal) => sum + mealGroceryCost(meal), 0); }
function allMealTotalCost(meals: MealPlanItem[]) { return arrayOf<MealPlanItem>(meals, []).reduce((sum, meal) => sum + mealTotalCost(meal), 0); }

function createMealFromRecipe(data: AppData, recipe: Recipe, date: string, mealType: MealType): MealPlanItem {
  return {
    id: uid('meal'),
    name: recipe.name,
    date,
    mealType,
    servings: Math.max(1, safeNumber(recipe.servings, 4)),
    recipeId: recipe.id,
    ingredients: arrayOf<MealIngredient>(recipe.ingredients, []).map((ingredient) => ({
      ...refreshIngredientAgainstPantry(data, ingredient),
      id: uid('ing')
    })),
    notes: recipe.notes ? `From recipe: ${recipe.notes}` : 'From Recipe Builder',
    createdAt: new Date().toISOString()
  };
}

function addMissingIngredientsToList(data: AppData, meal: MealPlanItem, listName: string): ShoppingList[] {
  const refreshedMeal = { ...meal, ingredients: mealIngredients(meal).map((ingredient) => refreshIngredientAgainstPantry(data, ingredient)) };
  const missing = refreshedMeal.ingredients.filter((ingredient) => !ingredient.pantryCovered);
  let target = data.shoppingLists.find((list) => list.name.toLowerCase() === listName.toLowerCase());
  const newItems = missing.map((ingredient) => ingredientToShoppingItem(refreshedMeal, ingredient));
  return target
    ? data.shoppingLists.map((list) => list.id === target?.id ? { ...list, items: [...list.items, ...newItems.filter((item) => !list.items.some((existing) => existing.sourceIngredientId === item.sourceIngredientId && existing.sourceMealId === item.sourceMealId))] } : list)
    : [...data.shoppingLists, { id: uid('list'), name: listName, type: 'meal_plan' as const, sharedWith: data.users.map((u) => u.id), items: newItems }];
}

function buildIngredientFromPrompt(data: AppData, preferredStore = DEFAULT_RECIPE_STORE): MealIngredient | null {
  const requestedName = clean(prompt('Ingredient name? Example: Chicken breast'));
  if (!requestedName) return null;
  const starter = buildIngredientFromParts(data, requestedName, 1, 'item', undefined, preferredStore);
  const quantity = promptNumber('Quantity needed for this meal or recipe?', starter.quantity);
  const unit = clean(prompt('Unit? Example: lb, cup, can, package, tsp', starter.unit), starter.unit);
  const estimatedPrice = promptNumber('Estimated total cost for this meal amount? Use 0 if it is fully accounted for.', starter.estimatedPrice);
  const category = promptIngredientCategory(starter.category);
  const refreshed = buildIngredientFromParts(data, requestedName, quantity, unit, estimatedPrice, preferredStore);
  const pantryNote = refreshed.pantryCovered ? 'already covered by pantry' : 'needs grocery list if used in a meal';
  const finalPantryCovered = refreshed.pantryCovered || confirm(`${refreshed.name} is currently marked as ${pantryNote}. Mark it as pantry-covered anyway?`);
  return { ...refreshed, category, pantryCovered: finalPantryCovered, pantryItemId: finalPantryCovered ? refreshed.pantryItemId : undefined };
}

type LoginSession = { householdCode: string; userId: string };

function readStoredSession(): LoginSession | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Partial<LoginSession> | null;
    const householdCode = normalizeHouseholdCode(parsed?.householdCode);
    if (!householdCode || !parsed?.userId) return null;
    return { householdCode, userId: parsed.userId };
  } catch {
    return null;
  }
}

function writeStoredSession(session: LoginSession): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  setActiveHouseholdCode(session.householdCode);
}

function clearStoredSession(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
}

function roleLabel(role: Role): string {
  return role.replace('_', ' ');
}

const ROLE_OPTIONS: { value: Role; label: string; detail: string }[] = [
  { value: 'owner', label: 'Owner', detail: 'Full access and user management' },
  { value: 'financial_manager', label: 'Financial Manager', detail: 'Register, budget, debt, statement import, and family planning' },
  { value: 'household_member', label: 'Household Member', detail: 'Recipes, meals, pantry, shopping, and prices' },
  { value: 'viewer', label: 'Viewer', detail: 'Shared planning view; finance hidden' },
  { value: 'child', label: 'Child', detail: 'Simple shared list and meal planning view; finance hidden' }
];

function isUserPinValid(user: User, attemptedPin: string): boolean {
  return !user.pin || user.pin === attemptedPin.trim();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatSyncTime(value?: string): string {
  if (!value) return 'just now';
  try { return new Date(value).toLocaleString(); } catch { return value; }
}

const DEVICE_ID_KEY = 'homelife-device-id-v1';

function getOrCreateDeviceId(): string {
  if (typeof localStorage === 'undefined') return 'home-device';
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

function promptCloudConfig(): boolean {
  const existing = getCloudSyncConfig();
  const passphrase = clean(prompt('Family cloud password/passphrase? This unlocks only this family workspace. HomeLife keeps it in this browser session only; it is not saved to Supabase or local storage.', existing.passphrase));
  if (!passphrase) return false;
  if (existing.passphrase && existing.passphrase !== passphrase) {
    const proceed = confirm('You entered a different family cloud password. That creates or opens a different encrypted workspace for this family code unless the old password is used to pull/re-encrypt the prior data. Continue?');
    if (!proceed) return false;
  }
  const autoSync = confirm('Turn on automatic cloud sync after each save? Choose OK for yes. You will need to re-enter the family cloud password after closing the browser.');
  saveCloudSyncConfig({
    enabled: true,
    autoSync,
    supabaseUrl: existing.supabaseUrl,
    anonKey: existing.anonKey,
    passphrase,
    tableName: existing.tableName || 'homelife_cloud_workspaces'
  });
  return true;
}


type CloudControls = {
  status: string;
  configure: () => void;
  disable: () => void;
  test: () => Promise<void>;
  push: () => Promise<void>;
  pull: () => Promise<void>;
};

function App() {
  const storedSession = readStoredSession();
  const initialHouseholdCode = normalizeHouseholdCode(storedSession?.householdCode ?? getActiveHouseholdCode() ?? 'DEMO') || 'DEMO';
  const [householdCode, setHouseholdCode] = useState(initialHouseholdCode);
  const [session, setSession] = useState<LoginSession | null>(storedSession);
  const [data, setData] = useState<AppData>(() => {
    try {
      return normalizeData(loadData(initialHouseholdCode));
    } catch (error) {
      console.error('HomeLife failed to load saved data. Starting with safe defaults.', error);
      return normalizeData(null);
    }
  });
  const [page, setPage] = useState('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cloudStatus, setCloudStatus] = useState(cloudSyncSummary());
  const deviceIdRef = useRef(getOrCreateDeviceId());
  const lastCloudUpdatedAtRef = useRef<string | undefined>(undefined);
  const cloudPullBusyRef = useRef(false);
  const sessionUser = session ? data.users.find((u) => u.id === session.userId) : undefined;
  const currentUser = sessionUser ?? data.users.find((u) => u.id === data.currentUserId) ?? data.users[0] ?? { id: 'user-owner', name: 'Owner', role: 'owner' as Role, pin: '' };
  const canViewFinance = Boolean(sessionUser && financeRoles.includes(currentUser.role));

  async function pushDataToCloud(payload: AppData = data, code = householdCode): Promise<boolean> {
    const config = getCloudSyncConfig();
    if (!isCloudSyncReady(config)) {
      setCloudStatus(cloudSyncSummary(config));
      return false;
    }
    try {
      setCloudStatus('Saving encrypted workspace to cloud...');
      const result = await saveCloudHousehold(payload, code, deviceIdRef.current, config);
      lastCloudUpdatedAtRef.current = result.updatedAt ?? lastCloudUpdatedAtRef.current;
      setCloudStatus(`Cloud synced ${formatSyncTime(result.updatedAt)}`);
      return true;
    } catch (error) {
      setCloudStatus(`Cloud save failed: ${errorMessage(error)}`);
      return false;
    }
  }

  function persist(next: AppData, code = householdCode, options: { cloud?: boolean } = {}) {
    const normalized = normalizeData({ ...next, householdId: code, inviteCode: code });
    const normalizedCode = normalizeHouseholdCode(code || normalized.householdId) || 'DEMO';
    setData(normalized);
    setHouseholdCode(normalizedCode);
    saveData(normalized, normalizedCode);
    const config = getCloudSyncConfig();
    if (options.cloud ?? (config.enabled && config.autoSync && isCloudSyncReady(config))) {
      void pushDataToCloud(normalized, normalizedCode);
    }
  }

  function update(next: AppData) {
    persist(next, householdCode);
  }

  async function pullRemoteIfNewer(reason: 'timer' | 'focus' | 'manual' = 'timer'): Promise<boolean> {
    const config = getCloudSyncConfig();
    const code = normalizeHouseholdCode(householdCode) || 'DEMO';
    if (!session || !isCloudSyncReady(config) || cloudPullBusyRef.current) return false;
    cloudPullBusyRef.current = true;
    try {
      const remote = await loadCloudHousehold(code, config);
      if (!remote?.data) return false;
      if (!remote.updatedAt || (lastCloudUpdatedAtRef.current && remote.updatedAt <= lastCloudUpdatedAtRef.current)) return false;
      const normalized = normalizeData({ ...remote.data, householdId: code, inviteCode: code });
      setData(normalized);
      saveData(normalized, code);
      setActiveHouseholdCode(code);
      lastCloudUpdatedAtRef.current = remote.updatedAt;
      setCloudStatus(`${reason === 'manual' ? 'Pulled' : 'Auto-pulled'} cloud workspace ${formatSyncTime(remote.updatedAt)}`);
      return true;
    } catch (error) {
      setCloudStatus(`Auto cloud pull failed: ${errorMessage(error)}`);
      return false;
    } finally {
      cloudPullBusyRef.current = false;
    }
  }

  useEffect(() => {
    const config = getCloudSyncConfig();
    if (!session || !config.autoSync || !isCloudSyncReady(config)) return undefined;
    const interval = window.setInterval(() => { void pullRemoteIfNewer('timer'); }, 45000);
    const onFocus = () => { void pullRemoteIfNewer('focus'); };
    const onVisibility = () => { if (document.visibilityState === 'visible') void pullRemoteIfNewer('focus'); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [session, householdCode]);

  async function readCloudOrLocalHousehold(code: string): Promise<AppData> {
    const config = getCloudSyncConfig();
    if (isCloudSyncReady(config)) {
      try {
        setCloudStatus('Checking cloud workspace...');
        const remote = await loadCloudHousehold(code, config);
        if (remote?.data) {
          lastCloudUpdatedAtRef.current = remote.updatedAt ?? lastCloudUpdatedAtRef.current;
          setCloudStatus(`Loaded cloud workspace ${formatSyncTime(remote.updatedAt)}`);
          return normalizeData({ ...remote.data, householdId: code, inviteCode: code });
        }
        setCloudStatus('No cloud workspace found for this code yet. Using this device.');
      } catch (error) {
        setCloudStatus(`Cloud load failed: ${errorMessage(error)}`);
      }
    } else {
      setCloudStatus(cloudSyncSummary(config));
    }
    return normalizeData(loadData(code));
  }

  async function loadHouseholdForLogin(codeInput: string) {
    const code = normalizeHouseholdCode(codeInput) || 'DEMO';
    const normalized = await readCloudOrLocalHousehold(code);
    const withHousehold = { ...normalized, householdId: code, inviteCode: code, householdName: normalized.householdName || `${code} Household` };
    setHouseholdCode(code);
    setData(withHousehold);
    saveData(withHousehold, code);
    setActiveHouseholdCode(code);
  }

  async function completeLogin(codeInput: string, userId: string, pin: string) {
    const code = normalizeHouseholdCode(codeInput) || householdCode || 'DEMO';
    const normalized = await readCloudOrLocalHousehold(code);
    const user = normalized.users.find((u) => u.id === userId) ?? normalized.users[0];
    if (!user) { alert('No user exists for this household yet. Create a household first.'); return; }
    if (!isUserPinValid(user, pin)) { alert('That PIN does not match this user.'); return; }
    const next = { ...normalized, householdId: code, inviteCode: code, currentUserId: user.id };
    setHouseholdCode(code);
    setSession({ householdCode: code, userId: user.id });
    writeStoredSession({ householdCode: code, userId: user.id });
    persist(next, code);
    setPage('dashboard');
  }

  function createNewHousehold(codeInput: string, householdName: string, ownerName: string, ownerPin: string) {
    const code = normalizeHouseholdCode(codeInput || householdName);
    if (!code) { alert('Enter a family code or household name.'); return; }
    const created = createHousehold(code, householdName, ownerName, ownerPin);
    const normalized = normalizeData(created);
    setHouseholdCode(code);
    setData(normalized);
    setSession({ householdCode: code, userId: normalized.currentUserId });
    writeStoredSession({ householdCode: code, userId: normalized.currentUserId });
    persist(normalized, code, { cloud: isCloudSyncReady() });
    setPage('dashboard');
  }

  function configureCloudSync() {
    if (promptCloudConfig()) setCloudStatus(cloudSyncSummary());
  }

  function disableCloudSync() {
    if (!confirm('Disable cloud sync on this device? Local data will remain here.')) return;
    clearCloudSyncConfig();
    setCloudStatus(cloudSyncSummary());
  }

  async function testCloudSync() {
    try {
      setCloudStatus('Testing cloud connection...');
      await testCloudConnection();
      setCloudStatus('Cloud connection test passed.');
    } catch (error) {
      setCloudStatus(`Cloud test failed: ${errorMessage(error)}`);
    }
  }

  async function pullCurrentHouseholdFromCloud() {
    const code = normalizeHouseholdCode(householdCode) || 'DEMO';
    try {
      setCloudStatus('Pulling encrypted workspace from cloud...');
      const remote = await loadCloudHousehold(code);
      if (!remote?.data) { setCloudStatus('No cloud workspace found for this code.'); alert('No cloud workspace found for this family code yet.'); return; }
      const normalized = normalizeData({ ...remote.data, householdId: code, inviteCode: code });
      persist(normalized, code, { cloud: false });
      lastCloudUpdatedAtRef.current = remote.updatedAt ?? lastCloudUpdatedAtRef.current;
      setCloudStatus(`Pulled cloud workspace ${formatSyncTime(remote.updatedAt)}`);
    } catch (error) {
      setCloudStatus(`Cloud pull failed: ${errorMessage(error)}`);
    }
  }

  function signOut() {
    clearStoredSession();
    setSession(null);
    setMobileMenuOpen(false);
    setPage('dashboard');
  }

  const cloudControls: CloudControls = {
    status: cloudStatus,
    configure: configureCloudSync,
    disable: disableCloudSync,
    test: testCloudSync,
    push: async () => { await pushDataToCloud(data, householdCode); },
    pull: pullCurrentHouseholdFromCloud
  };

  const activeSessionIsValid = Boolean(session && data.users.some((u) => u.id === session.userId));
  if (!activeSessionIsValid) {
    return <LoginScreen data={data} householdCode={householdCode} cloudControls={cloudControls} onLoadHousehold={loadHouseholdForLogin} onLogin={completeLogin} onCreateHousehold={createNewHousehold} />;
  }

  const nav = [
    { id: 'dashboard', label: 'Dashboard', icon: Home, show: true },
    { id: 'register', label: 'Register', icon: WalletCards, show: canViewFinance },
    { id: 'budget', label: 'Budget', icon: BarChart3, show: canViewFinance },
    { id: 'debt', label: 'Debt', icon: Landmark, show: canViewFinance },
    { id: 'reconcile', label: 'Statement Import', icon: FileSearch, show: canViewFinance },
    { id: 'prices', label: 'Price Catalog', icon: Tags, show: true },
    { id: 'pantry', label: 'Pantry', icon: Archive, show: true },
    { id: 'recipes', label: 'Recipe Builder', icon: BookOpen, show: true },
    { id: 'meal-planner', label: 'Meal Planner', icon: Utensils, show: true },
    { id: 'shopping', label: 'Shopping Lists', icon: ShoppingCart, show: true },
    { id: 'settings', label: 'Settings', icon: Settings, show: true }
  ];

  const visibleNav = nav.filter((n) => n.show);
  const activeNav = visibleNav.some((n) => n.id === page) ? page : 'dashboard';

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : 'mobile-closed'}`}>
      <div className="mobile-sidebar-head">
        <div className="brand-card"><div className="brand-mark">HL</div><div><h1>HomeLife</h1><p>{data.householdName ?? 'Household'} · {householdCode}</p></div></div>
        <button className="mobile-menu-toggle" type="button" aria-label={mobileMenuOpen ? 'Close HomeLife menu' : 'Open HomeLife menu'} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}><MenuIcon size={20} /> Menu</button>
      </div>
      <nav>{visibleNav.map((n) => { const Icon = n.icon; return <button key={n.id} className={activeNav === n.id ? 'active' : ''} onClick={() => { setPage(n.id); setMobileMenuOpen(false); }}><Icon size={18} /> {n.label}</button>; })}</nav>
      {!canViewFinance && <div className="privacy-note"><EyeOff size={16} /> Register, budget, debt, and statements are hidden for this login.</div>}
      <div className="version-badge">v2026.06.12.0023</div>
    </aside>
    <main>
      <header className="topbar"><div><h2>{nav.find((n) => n.id === activeNav)?.label ?? 'Dashboard'}</h2><p><strong>{data.householdName ?? 'Household'}</strong> · signed in as <strong>{currentUser.name}</strong> · {roleLabel(currentUser.role)}</p></div><div className="settings-actions"><span className="pill neutral">Code: {householdCode}</span><span className="pill neutral">{cloudStatus}</span><button onClick={signOut}>Switch family/user</button></div></header>
      {activeNav === 'dashboard' && <Dashboard data={data} canViewFinance={canViewFinance} />}
      {activeNav === 'register' && canViewFinance && <Register data={data} update={update} />}
      {activeNav === 'budget' && canViewFinance && <Budget data={data} update={update} />}
      {activeNav === 'debt' && canViewFinance && <Debt data={data} update={update} />}
      {activeNav === 'reconcile' && canViewFinance && <StatementImport data={data} update={update} />}
      {activeNav === 'prices' && <PriceCatalog data={data} update={update} />}
      {activeNav === 'pantry' && <Pantry data={data} update={update} />}
      {activeNav === 'recipes' && <RecipeBuilder data={data} update={update} />}
      {activeNav === 'meal-planner' && <MealPlanner data={data} update={update} />}
      {activeNav === 'shopping' && <Shopping data={data} update={update} />}
      {activeNav === 'settings' && <SettingsPage data={data} update={update} cloudControls={cloudControls} />}
    </main>
  </div>;
}

function LoginScreen({ data, householdCode, cloudControls, onLoadHousehold, onLogin, onCreateHousehold }: { data: AppData; householdCode: string; cloudControls: CloudControls; onLoadHousehold: (code: string) => Promise<void>; onLogin: (code: string, userId: string, pin: string) => Promise<void>; onCreateHousehold: (code: string, householdName: string, ownerName: string, ownerPin: string) => void }) {
  const [code, setCode] = useState(householdCode || data.inviteCode || 'DEMO');
  const [selectedUserId, setSelectedUserId] = useState(data.currentUserId || data.users[0]?.id || 'user-owner');
  const [pin, setPin] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newHouseholdName, setNewHouseholdName] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newOwnerPin, setNewOwnerPin] = useState('');
  const households = listHouseholds();
  const selectedUser = data.users.find((u) => u.id === selectedUserId) ?? data.users[0];

  function loadCode(value: string) {
    const normalized = normalizeHouseholdCode(value) || 'DEMO';
    setCode(normalized);
    onLoadHousehold(normalized);
    setSelectedUserId(data.users[0]?.id ?? 'user-owner');
    setPin('');
  }

  return <div className="login-shell">
    <div className="login-card">
      <div className="brand-card login-brand"><div className="brand-mark">HL</div><div><h1>HomeLife</h1><p>Family budget testing workspace</p></div></div>
      <div className="grid two">
        <div className="card">
          <p className="label">Sign in</p>
          <h3>Choose a family and user</h3>
          <p className="muted">Each family code can load from the built-in encrypted Supabase backend after you enter the shared family cloud password on each device. With auto-sync on, HomeLife pushes saves and checks for newer cloud changes when the app is opened, focused, and about every 45 seconds. Household details are encrypted before upload, and the password stays on the device for this browser session only.</p><div className="cloud-login-panel"><span className="pill neutral">{cloudControls.status}</span><button onClick={cloudControls.configure}>Cloud Setup</button><button onClick={cloudControls.test}>Test Cloud</button></div>
          <label className="field-label">Family code</label>
          <input className="full-input" value={code} onChange={(event) => setCode(event.target.value)} onBlur={() => loadCode(code)} placeholder="Example: WILLIAMS" />
          <button onClick={() => loadCode(code)}>Load Family</button>
          <label className="field-label">User login</label>
          <select className="full-input" value={selectedUser?.id ?? ''} onChange={(event) => setSelectedUserId(event.target.value)}>{data.users.map((user) => <option key={user.id} value={user.id}>{user.name} — {roleLabel(user.role)}</option>)}</select>
          <label className="field-label">PIN {selectedUser?.pin ? '' : '(blank for this user)'}</label>
          <input className="full-input" value={pin} type="password" inputMode="numeric" onChange={(event) => setPin(event.target.value)} placeholder={selectedUser?.pin ? 'Enter PIN' : 'No PIN required'} />
          <button className="primary" onClick={() => onLogin(code, selectedUser?.id ?? data.users[0]?.id ?? 'user-owner', pin)}>Sign in</button>
          {households.length > 0 && <div className="known-households"><p className="label">Saved on this device</p>{households.map((household) => <button key={household.code} onClick={() => loadCode(household.code)}>{household.name} · {household.code}</button>)}</div>}
        </div>
        <div className="card">
          <p className="label">New test family</p>
          <h3>Create a household workspace</h3>
          <p className="muted">Use one code per testing family. The Supabase connection is built in; the household workspace is encrypted in the browser and shared by family code plus cloud password. Other families cannot be browsed from this app.</p>
          <label className="field-label">Family code</label>
          <input className="full-input" value={newCode} onChange={(event) => setNewCode(event.target.value)} placeholder="Example: SMITH-FAMILY" />
          <label className="field-label">Household name</label>
          <input className="full-input" value={newHouseholdName} onChange={(event) => setNewHouseholdName(event.target.value)} placeholder="Smith Household" />
          <label className="field-label">Owner name</label>
          <input className="full-input" value={newOwnerName} onChange={(event) => setNewOwnerName(event.target.value)} placeholder="Parent / tester name" />
          <label className="field-label">Owner PIN optional</label>
          <input className="full-input" value={newOwnerPin} type="password" inputMode="numeric" onChange={(event) => setNewOwnerPin(event.target.value)} placeholder="Optional local PIN" />
          <button className="primary" onClick={() => onCreateHousehold(newCode, newHouseholdName, newOwnerName, newOwnerPin)}>Create and sign in</button>
        </div>
      </div>
    </div>
  </div>;
}

function Dashboard({ data, canViewFinance }: { data: AppData; canViewFinance: boolean }) {
  const accountTotal = data.accounts.reduce((sum, a) => sum + a.startingBalance + data.transactions.filter(t => t.accountId === a.id).reduce((s, t) => s + t.amount, 0), 0);
  const shoppingTotal = data.shoppingLists.reduce((sum, l) => sum + listEstimatedTotal(l), 0);
  const remainingItems = data.shoppingLists.reduce((sum, l) => sum + l.items.filter(i => !i.checked).length, 0);
  return <section className="grid two">
    {canViewFinance ? <Card title="Household Balance" value={money(accountTotal)} detail="Across starter accounts" /> : <Card title="Finance Hidden" value="Private" detail="Your role can use shared lists, meals, pantry, and prices only." />}
    <Card title="Meal Plan Grocery Need" value={money(allMealGroceryCost(data.mealPlans))} detail={`${data.mealPlans.length} planned meal(s); ${money(allMealTotalCost(data.mealPlans))} total food value`} />
    <Card title="Pantry Estimate" value={money(pantryValue(data.pantryItems))} detail={`${data.pantryItems.length} pantry, freezer, spice, sauce, and dry-good items`} />
    <Card title="Recipe Builder" value={`${data.recipes.length}`} detail="Manual or photo-assisted recipes ready for meal planning" />
    <Card title="Shopping Estimate" value={money(shoppingTotal)} detail={`${remainingItems} item(s) still needed`} />
    <Card title="Price Catalog" value={`${data.priceCatalog.length}`} detail="Local manual price records; API hook ready later" />
    {canViewFinance && <Card title="Statement Review" value={`${data.statementImports.length}`} detail="Sanitized rows only; raw files stay local" />}
    {canViewFinance && <Card title="Monthly Budget" value={money(data.budgetCategories.reduce((s, c) => s + c.monthlyBudget, 0))} detail="Starter budget categories" />}
    {canViewFinance && <Card title="Debt Balance" value={money(data.debts.reduce((s, d) => s + d.balance, 0))} detail="Hidden from list-only users" />}
  </section>;
}
function Card({ title, value, detail }: { title: string; value: string; detail: string }) { return <div className="card"><p className="label">{title}</p><h3>{value}</h3><p>{detail}</p></div>; }

function Register({ data, update }: { data: AppData; update: (d: AppData) => void }) {
  const selectedAccountId = data.accounts[0]?.id ?? 'acct-checking';
  function addAccount() {
    const name = clean(prompt('Account name? Example: Checking, Savings, Cash Envelope')); if (!name) return;
    const type = clean(prompt('Account type? checking, savings, cash, credit', 'checking'), 'checking');
    const startingBalance = promptNumber('Starting balance?', 0);
    update({ ...data, accounts: [...data.accounts, { id: uid('acct'), name, type, startingBalance }] });
  }
  function deleteAccount(id: string) {
    const account = data.accounts.find((a) => a.id === id);
    if (!account) return;
    if (data.accounts.length <= 1) { alert('Keep at least one account in the register.'); return; }
    if (!confirm(`Delete ${account.name}? Transactions assigned to this account will also be deleted.`)) return;
    update({ ...data, accounts: data.accounts.filter((a) => a.id !== id), transactions: data.transactions.filter((t) => t.accountId !== id) });
  }
  function addTransaction() {
    const accountId = data.accounts.length > 1 ? clean(prompt(`Account id/name? Press OK for ${data.accounts[0].name}`, data.accounts[0].name), data.accounts[0].name) : selectedAccountId;
    const account = data.accounts.find((a) => a.id === accountId || a.name.toLowerCase() === accountId.toLowerCase()) ?? data.accounts[0];
    if (!account) { alert('Add an account before adding transactions.'); return; }
    const date = clean(prompt('Date? YYYY-MM-DD', today()), today());
    const description = clean(prompt('Description? Example: Walmart Grocery')); if (!description) return;
    const category = clean(prompt('Category? Example: Groceries, Utilities, Paycheck', 'Groceries'), 'Uncategorized');
    const rawType = clean(prompt('Type? debit or credit', 'debit'), 'debit').toLowerCase();
    const amountInput = Math.abs(promptNumber('Amount?', 0));
    const amount = rawType === 'credit' ? amountInput : -amountInput;
    const transaction: Transaction = { id: uid('txn'), accountId: account.id, date, description, category, amount, cleared: false };
    update({ ...data, transactions: [...data.transactions, transaction].sort((a, b) => a.date.localeCompare(b.date)) });
  }
  function toggleCleared(id: string) { update({ ...data, transactions: data.transactions.map(t => t.id === id ? { ...t, cleared: !t.cleared } : t) }); }
  function deleteTransaction(id: string) { if (confirm('Delete this transaction?')) update({ ...data, transactions: data.transactions.filter((t) => t.id !== id) }); }
  return <div className="card wide">
    <div className="split"><div><h3>Check Register</h3><p className="muted">Private finance area. Restricted profiles cannot see this menu or data. Every register add action now has a matching delete action.</p></div><div className="settings-actions"><button onClick={addTransaction}>Add Transaction</button><button onClick={addAccount}>Add Account</button></div></div>
    <h4>Accounts</h4>
    <table><thead><tr><th>Account</th><th>Type</th><th>Starting Balance</th><th>Current Balance</th><th>Delete</th></tr></thead><tbody>{data.accounts.map((account) => <tr key={account.id}><td>{account.name}</td><td>{account.type}</td><td>{money(account.startingBalance)}</td><td>{money(accountBalance(data, account.id))}</td><td><button className="icon-danger" onClick={() => deleteAccount(account.id)}><Trash2 size={14} /> Delete</button></td></tr>)}</tbody></table>
    <h4>Transactions</h4>
    {data.transactions.length === 0 ? <p className="empty-state">No register transactions yet. Use <strong>Add Transaction</strong> to enter one manually, or import a statement from the Statement Import page.</p> : <table><thead><tr><th>Date</th><th>Account</th><th>Description</th><th>Category</th><th>Amount</th><th>Cleared</th><th>Delete</th></tr></thead><tbody>{data.transactions.map(t => { const account = data.accounts.find((a) => a.id === t.accountId); return <tr key={t.id}><td>{t.date}</td><td>{account?.name ?? 'Unknown'}</td><td>{t.description}</td><td>{t.category}</td><td className={t.amount < 0 ? 'negative' : 'positive'}>{money(t.amount)}</td><td><input type="checkbox" checked={t.cleared} onChange={() => toggleCleared(t.id)} /></td><td><button className="icon-danger" onClick={() => deleteTransaction(t.id)}><Trash2 size={14} /> Delete</button></td></tr>; })}</tbody></table>}
  </div>;
}
function Budget({ data, update }: { data: AppData; update: (d: AppData) => void }) {
  function addCategory() {
    const name = clean(prompt('Budget category name? Example: Groceries, Childcare, Utilities'));
    if (!name) return;
    const monthlyBudget = promptNumber('Monthly budget amount?', 0);
    update({ ...data, budgetCategories: [...data.budgetCategories, { id: uid('cat'), name, monthlyBudget: Number.isFinite(monthlyBudget) ? monthlyBudget : 0 }] });
  }
  function deleteCategory(id: string) { if (confirm('Delete this budget category?')) update({ ...data, budgetCategories: data.budgetCategories.filter((c) => c.id !== id) }); }
  return <div className="card wide"><div className="split"><div><h3>Budget</h3><p className="muted">Build the monthly budget categories that transactions roll into. Every add action has a matching delete action.</p></div><div className="settings-actions"><button className="primary" onClick={addCategory}><PlusCircle size={14} /> Add Budget Category</button></div></div><table><thead><tr><th>Category</th><th>Monthly Budget</th><th>Actual</th><th>Remaining</th><th>Delete</th></tr></thead><tbody>{data.budgetCategories.map(c => { const actual = Math.abs(data.transactions.filter(t => t.category === c.name && t.amount < 0).reduce((s, t) => s + t.amount, 0)); return <tr key={c.id}><td>{c.name}</td><td>{money(c.monthlyBudget)}</td><td>{money(actual)}</td><td>{money(c.monthlyBudget - actual)}</td><td><button className="icon-danger" onClick={() => deleteCategory(c.id)}><Trash2 size={14} /> Delete</button></td></tr>; })}</tbody></table></div>;
}
function Debt({ data, update }: { data: AppData; update: (d: AppData) => void }) {
  function deleteDebt(id: string) { if (confirm('Delete this debt?')) update({ ...data, debts: data.debts.filter((d) => d.id !== id) }); }
  return <div className="card wide"><h3>Debt Tracker</h3><table><thead><tr><th>Debt</th><th>Balance</th><th>Payment</th><th>Rate</th><th>Delete</th></tr></thead><tbody>{data.debts.map(d => <tr key={d.id}><td>{d.name}</td><td>{money(d.balance)}</td><td>{money(d.payment)}</td><td>{d.rate}%</td><td><button className="icon-danger" onClick={() => deleteDebt(d.id)}><Trash2 size={14} /> Delete</button></td></tr>)}</tbody></table></div>;
}

function PriceCatalog({ data, update }: { data: AppData; update: (d: AppData) => void }) {
  const [query, setQuery] = useState('');
  const filtered = data.priceCatalog.filter(p => `${p.name} ${p.brand ?? ''} ${p.store} ${p.storeName ?? ''} ${p.category ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  function addPrice() {
    const name = clean(prompt('Product name? Example: Milk')); if (!name) return;
    const store = clean(prompt('Store? Walmart, United Supermarkets, Sam\'s, Target, Other', 'Walmart'), 'Walmart');
    const price = promptNumber('Price?', 0);
    const item: PriceCatalogItem = { id: uid('price'), store, storeZip: clean(prompt('ZIP or store area?', '79015')) || undefined, name, brand: clean(prompt('Brand?', '')) || undefined, size: clean(prompt('Size?', '')) || undefined, category: clean(prompt(`Category? ${PANTRY_CATEGORIES.join(', ')}`, 'Other')) || undefined, price: Number.isFinite(price) ? price : 0, lastChecked: today(), notes: 'Manual entry' };
    update({ ...data, priceCatalog: [...data.priceCatalog, item] });
  }
  function removePrice(id: string) { if (confirm('Remove this price record?')) update({ ...data, priceCatalog: data.priceCatalog.filter(p => p.id !== id) }); }
  function restoreStarterCatalog() {
    const merged = mergeDefaultPriceCatalog(data.priceCatalog);
    update({ ...data, priceCatalog: merged });
    alert(`Walmart starter catalog restored and retired United starter prices removed. HomeLife now has ${merged.length} price records.`);
  }
  function exportCsv() {
    const rows = [['store','storeName','zip','name','brand','size','category','price','lastChecked','notes'], ...data.priceCatalog.map(p => [p.store, p.storeName ?? '', p.storeZip ?? '', p.name, p.brand ?? '', p.size ?? '', p.category ?? '', String(p.price), p.lastChecked, p.notes ?? ''])];
    downloadText('homelife-price-catalog.csv', rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'));
  }
  return <div className="card wide"><div className="split"><div><h3>Local Price Catalog</h3><p className="muted">Use this for grocery, pantry, and meal projections. The starter catalog is now Walmart-first. Add United, Sam's, Target, or another store manually only when you want that store available.</p></div><div className="settings-actions"><button onClick={addPrice}>Add Price</button><button onClick={restoreStarterCatalog}>Restore Walmart Starter Catalog</button><button onClick={exportCsv}>Export CSV</button></div></div><input className="full-input" placeholder="Search Walmart milk, tortillas, meat, spices, or custom store records..." value={query} onChange={e => setQuery(e.target.value)} /><table><thead><tr><th>Store</th><th>Item</th><th>Brand/Size</th><th>Category</th><th>Price</th><th>Checked</th><th>Delete</th></tr></thead><tbody>{filtered.map(p => <tr key={p.id}><td>{p.store}<br /><small>{p.storeName ?? p.storeZip}</small></td><td>{p.name}</td><td>{p.brand ?? ''} {p.size ? `· ${p.size}` : ''}</td><td>{p.category}</td><td>{money(p.price)}</td><td>{p.lastChecked}</td><td><button className="icon-danger" onClick={() => removePrice(p.id)}><Trash2 size={14} /> Delete</button></td></tr>)}</tbody></table></div>;
}

function Pantry({ data, update }: { data: AppData; update: (d: AppData) => void }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const filtered = data.pantryItems
    .filter((item) => category === 'All' || item.category === category)
    .filter((item) => `${item.name} ${item.category} ${item.location} ${item.notes ?? ''}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  function addPantryItem() {
    const name = clean(prompt('Pantry item name? Example: Black beans, flour, frozen chicken, oregano')); if (!name) return;
    const found = findCatalogMatch(name, data.priceCatalog);
    const chosenCategory = normalizeCategory(prompt(`Category? ${PANTRY_CATEGORIES.join(', ')}`, found?.category ?? 'Dry Goods'));
    const quantity = promptNumber('Quantity on hand?', 1);
    const unit = clean(prompt('Unit? Example: cans, lb, oz, bags, jars, containers', found?.size ?? 'item'), 'item');
    const location = clean(prompt('Location? Pantry, Freezer, Fridge, Spice Cabinet, Garage', chosenCategory === 'Frozen Foods' || chosenCategory === 'Meats' ? 'Freezer' : 'Pantry'), 'Pantry');
    const estimatedUnitPrice = promptNumber('Estimated cost/value per unit?', found?.price ?? 0);
    const expirationDate = clean(prompt('Expiration date? Optional YYYY-MM-DD', '')) || undefined;
    const notes = clean(prompt('Notes? Optional', found ? `${found.store} ${found.brand ?? ''} ${found.size ?? ''}`.trim() : '')) || undefined;
    const item: PantryItem = { id: uid('pantry'), name, category: chosenCategory, quantity: Math.max(0, quantity), unit, location, estimatedUnitPrice: Math.max(0, estimatedUnitPrice), priceCatalogItemId: found?.id, store: found?.store, expirationDate, notes, lastUpdated: today() };
    update({ ...data, pantryItems: [...data.pantryItems, item] });
  }
  function deletePantryItem(id: string) { if (confirm('Delete this pantry item?')) update({ ...data, pantryItems: data.pantryItems.filter((item) => item.id !== id) }); }
  function adjustQuantity(id: string) {
    const item = data.pantryItems.find((p) => p.id === id); if (!item) return;
    const quantity = promptNumber(`New quantity for ${item.name}?`, item.quantity);
    update({ ...data, pantryItems: data.pantryItems.map((p) => p.id === id ? { ...p, quantity: Math.max(0, quantity), lastUpdated: today() } : p) });
  }
  function exportCsv() {
    const rows = [['category','name','quantity','unit','location','estimatedUnitPrice','estimatedTotalValue','expirationDate','store','notes','lastUpdated'], ...data.pantryItems.map((p) => [p.category, p.name, String(p.quantity), p.unit, p.location, String(p.estimatedUnitPrice ?? 0), String(p.quantity * (p.estimatedUnitPrice ?? 0)), p.expirationDate ?? '', p.store ?? '', p.notes ?? '', p.lastUpdated])];
    downloadText('homelife-pantry.csv', rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'));
  }
  return <div className="card wide">
    <div className="split"><div><h3>Pantry Builder</h3><p className="muted">Track dry goods, spices, canned goods, freezer foods, meats, sauces, vegetables, fruits, baking goods, and everything already accounted for before building the grocery list.</p></div><div className="settings-actions"><button onClick={addPantryItem}>Add Pantry Item</button><button onClick={exportCsv}>Export CSV</button></div></div>
    <div className="filter-row"><input className="full-input" placeholder="Search pantry, freezer, spice cabinet, sauces..." value={query} onChange={(e) => setQuery(e.target.value)} /><select value={category} onChange={(e) => setCategory(e.target.value)}><option>All</option>{PANTRY_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
    <div className="totals"><span>Items: <strong>{filtered.length}</strong></span><span>Estimated pantry value: <strong>{money(pantryValue(data.pantryItems))}</strong></span></div>
    <table><thead><tr><th>Category</th><th>Item</th><th>On Hand</th><th>Location</th><th>Value</th><th>Expires</th><th>Actions</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><span className="pill neutral">{item.category}</span></td><td>{item.name}<br /><small>{item.notes}</small></td><td>{item.quantity} {item.unit}</td><td>{item.location}</td><td>{money(item.quantity * (item.estimatedUnitPrice ?? 0))}<br /><small>{money(item.estimatedUnitPrice ?? 0)} / unit</small></td><td>{item.expirationDate ?? '—'}</td><td className="row-actions"><button onClick={() => adjustQuantity(item.id)}>Adjust Qty</button><button className="icon-danger" onClick={() => deletePantryItem(item.id)}><Trash2 size={14} /> Delete</button></td></tr>)}</tbody></table>
  </div>;
}


type TesseractLike = {
  recognize: (image: File | Blob | string, lang?: string, options?: Record<string, unknown>) => Promise<{ data?: { text?: string } }>;
};

declare global {
  interface Window { Tesseract?: TesseractLike; }
}

function loadExternalScript(id: string, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') { reject(new Error('Document is not available.')); return; }
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing?.dataset.loaded === 'true') { resolve(); return; }
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Could not load ${src}`)), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve(); }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Could not load ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

async function runTesseractOcr(file: File, onStatus?: (status: string) => void): Promise<string> {
  try {
    onStatus?.('Loading offline-style OCR engine for the photo...');
    await loadExternalScript('homelife-tesseract-js', 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    const tesseract = window.Tesseract;
    if (!tesseract?.recognize) throw new Error('OCR engine did not initialize.');
    onStatus?.('Reading recipe photo. This can take 15-45 seconds on a phone...');
    const result = await tesseract.recognize(file, 'eng', {
      logger: (message: unknown) => {
        const status = typeof message === 'object' && message ? String((message as { status?: unknown }).status ?? '') : '';
        const progress = typeof message === 'object' && message ? Number((message as { progress?: unknown }).progress ?? 0) : 0;
        if (status) onStatus?.(`${status}${progress ? ` ${Math.round(progress * 100)}%` : ''}`);
      }
    });
    return clean(result.data?.text);
  } catch (error) {
    console.warn('Tesseract OCR unavailable.', error);
    onStatus?.('Photo OCR was not available in this browser. You can still paste the recipe text without comma formatting.');
    return '';
  }
}



function catalogStores(data: AppData): string[] {
  const stores = data.priceCatalog.map((item) => item.store).filter(Boolean);
  const unique = Array.from(new Set([DEFAULT_RECIPE_STORE, ...stores]));
  return unique.sort((a, b) => {
    if (a === DEFAULT_RECIPE_STORE) return -1;
    if (b === DEFAULT_RECIPE_STORE) return 1;
    return a.localeCompare(b);
  });
}

function savedRecipeStore(data: AppData): string {
  if (typeof localStorage === 'undefined') return DEFAULT_RECIPE_STORE;
  const saved = clean(localStorage.getItem(RECIPE_STORE_KEY), DEFAULT_RECIPE_STORE);
  const stores = catalogStores(data);
  return stores.some((store) => store.toLowerCase() === saved.toLowerCase()) ? saved : DEFAULT_RECIPE_STORE;
}

function RecipeBuilder({ data, update }: { data: AppData; update: (d: AppData) => void }) {
  const [query, setQuery] = useState('');
  const [photoStatus, setPhotoStatus] = useState('');
  const [preferredStore, setPreferredStore] = useState(() => savedRecipeStore(data));
  const storeOptions = useMemo(() => catalogStores(data), [data.priceCatalog]);
  const preferredStoreCatalogCount = data.priceCatalog.filter((item) => item.store.toLowerCase() === preferredStore.toLowerCase()).length;
  const recipes = [...data.recipes]
    .filter((recipe) => `${recipe.name} ${recipe.category ?? ''} ${recipe.notes ?? ''} ${recipe.ingredients.map((ingredient) => ingredient.name).join(' ')}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const recipeTotal = (recipe: Recipe) => arrayOf<MealIngredient>(recipe.ingredients, []).reduce((sum, ingredient) => sum + safeNumber(ingredient.estimatedPrice, 0), 0);
  const recipeMissingTotal = (recipe: Recipe) => arrayOf<MealIngredient>(recipe.ingredients, []).map((ingredient) => refreshIngredientAgainstPantry(data, ingredient, preferredStore)).filter((ingredient) => !ingredient.pantryCovered).reduce((sum, ingredient) => sum + safeNumber(ingredient.estimatedPrice, 0), 0);

  function changePreferredStore(nextStore: string) {
    const safeStore = clean(nextStore, DEFAULT_RECIPE_STORE);
    setPreferredStore(safeStore);
    if (typeof localStorage !== 'undefined') localStorage.setItem(RECIPE_STORE_KEY, safeStore);
  }

  function addRecipe() {
    const name = clean(prompt('Recipe name? Example: Chicken tacos'));
    if (!name) return;
    const servings = promptNumber('Servings?', 4);
    const category = clean(prompt('Recipe category? Breakfast, Dinner, Dessert, etc.', 'Dinner')) || undefined;
    const ingredients: MealIngredient[] = [];
    do {
      const ingredient = buildIngredientFromPrompt(data, preferredStore);
      if (ingredient) ingredients.push(ingredient);
    } while (confirm('Add another ingredient to this recipe?'));
    const instructions = clean(prompt('Cooking instructions? Optional', '')) || undefined;
    const notes = clean(prompt('Recipe notes? Optional', '')) || undefined;
    const timestamp = new Date().toISOString();
    const recipe: Recipe = { id: uid('recipe'), name, servings: Math.max(1, servings), category, ingredients, instructions, notes, source: 'manual', createdAt: timestamp, updatedAt: timestamp };
    update({ ...data, recipes: [...data.recipes, recipe] });
  }

  function deleteRecipe(id: string) {
    if (confirm('Delete this recipe? Planned meals already created from it will stay in the meal planner.')) update({ ...data, recipes: data.recipes.filter((recipe) => recipe.id !== id) });
  }

  function addIngredient(recipeId: string) {
    const ingredient = buildIngredientFromPrompt(data, preferredStore);
    if (!ingredient) return;
    update({ ...data, recipes: data.recipes.map((recipe) => recipe.id === recipeId ? { ...recipe, ingredients: [...recipe.ingredients, ingredient], updatedAt: new Date().toISOString() } : recipe) });
  }

  function deleteIngredient(recipeId: string, ingredientId: string) {
    if (!confirm('Delete this ingredient from the recipe?')) return;
    update({ ...data, recipes: data.recipes.map((recipe) => recipe.id === recipeId ? { ...recipe, ingredients: recipe.ingredients.filter((ingredient) => ingredient.id !== ingredientId), updatedAt: new Date().toISOString() } : recipe) });
  }

  function editIngredient(recipeId: string, ingredientId: string) {
    const recipe = data.recipes.find((item) => item.id === recipeId);
    const ingredient = recipe?.ingredients.find((item) => item.id === ingredientId);
    if (!recipe || !ingredient) return;
    const name = clean(prompt('Ingredient name?', ingredient.name), ingredient.name);
    if (!name) return;
    const quantity = Math.max(0, promptNumber(`Quantity needed for ${name}?`, ingredient.quantity));
    const unit = clean(prompt(`Unit for ${name}?`, ingredient.unit), ingredient.unit);
    const category = promptIngredientCategory(ingredient.category);
    const catalog = findCatalogMatch(name, data.priceCatalog, preferredStore);
    const catalogEstimate = estimateIngredientCostFromCatalog(catalog, quantity, unit);
    const pantry = findPantryMatch(name, data.pantryItems);
    const pantryCoveredBySystem = pantryCoversIngredient(name, quantity, unit, data.pantryItems);
    const suggestedPrice = catalogEstimate || ingredient.estimatedPrice || 0;
    const estimatedPrice = Math.max(0, promptNumber(`${catalog ? 'Confirm or edit the selected-store catalog price HomeLife found.' : 'No price catalog match was found. Enter or keep the estimated total price for this ingredient.'}

${catalogPriceLine(catalog, quantity, unit)}
Pantry check: ${pantryCoveredBySystem && pantry ? `${pantry.quantity} ${pantry.unit} ${pantry.name} on hand` : 'not fully covered'}

This is the total recipe cost for ${quantity} ${unit} ${name}.`, suggestedPrice));
    let pantryCovered = pantryCoveredBySystem;
    if (pantryCoveredBySystem) {
      pantryCovered = confirm(`HomeLife found this in the pantry. Keep ${name} marked as pantry-covered? OK = pantry-covered, Cancel = needs grocery list.`);
    } else if (confirm(`HomeLife does not see enough ${name} in the pantry. Mark it as pantry-covered anyway?`)) {
      pantryCovered = true;
    }
    const rebuilt = buildIngredientFromParts(data, name, quantity || 1, unit, estimatedPrice, preferredStore);
    const updatedIngredient: MealIngredient = {
      ...ingredient,
      ...rebuilt,
      id: ingredient.id,
      name,
      quantity: quantity || 1,
      unit,
      category,
      estimatedPrice,
      pantryCovered,
      pantryItemId: pantryCovered ? (pantry?.id ?? rebuilt.pantryItemId) : undefined,
      priceCatalogItemId: catalog?.id ?? rebuilt.priceCatalogItemId,
      store: catalog?.store ?? rebuilt.store,
      notes: clean(prompt('Ingredient notes? Optional', ingredient.notes ?? rebuilt.notes ?? ''), ingredient.notes ?? rebuilt.notes ?? '') || undefined
    };
    update({ ...data, recipes: data.recipes.map((item) => item.id === recipeId ? { ...item, ingredients: item.ingredients.map((candidate) => candidate.id === ingredientId ? updatedIngredient : candidate), updatedAt: new Date().toISOString() } : item) });
  }

  function editRecipeInstructions(recipeId: string) {
    const recipe = data.recipes.find((item) => item.id === recipeId);
    if (!recipe) return;
    const instructions = clean(prompt('Recipe instructions? Add or update cooking steps here.', recipe.instructions ?? '')) || undefined;
    update({ ...data, recipes: data.recipes.map((item) => item.id === recipeId ? { ...item, instructions, updatedAt: new Date().toISOString() } : item) });
  }

  function parseIngredientsFromText(text: string): MealIngredient[] {
    return smartParseIngredientsFromText(data, text, preferredStore).ingredients;
  }

  function reviewPhotoIngredientCandidates(candidates: MealIngredient[], sourceLabel: string): MealIngredient[] {
    const likely = candidates
      .map((ingredient) => refreshIngredientAgainstPantry(data, ingredient, preferredStore))
      .filter((ingredient, index, all) => all.findIndex((other) => other.name.toLowerCase() === ingredient.name.toLowerCase() && normalizeUnit(other.unit) === normalizeUnit(ingredient.unit)) === index)
      .slice(0, 30);

    if (!likely.length) return [];

    alert(`HomeLife found ${likely.length} possible ingredient(s) from ${sourceLabel}. You will review the name and amount. HomeLife will search the selected store first, then you can confirm or edit the catalog price. Pantry-covered items will not be added to the grocery list.`);
    const reviewed: MealIngredient[] = [];

    for (const candidate of likely) {
      const startingCatalog = findCatalogMatch(candidate.name, data.priceCatalog, preferredStore);
      const pantryMatch = findPantryMatch(candidate.name, data.pantryItems);
      const nameInput = prompt(`Keep or correct this detected ingredient?

Detected: ${candidate.quantity} ${candidate.unit} ${candidate.name}
${pantryMatch ? `Pantry match: ${pantryMatch.quantity} ${pantryMatch.unit} on hand` : 'Pantry match: none found'}
${catalogPriceLine(startingCatalog, candidate.quantity, candidate.unit)}

Press Cancel or leave blank to skip this line.`, startingCatalog?.name ?? candidate.name);
      if (nameInput === null) continue;
      const correctedName = clean(nameInput);
      if (!correctedName) continue;

      const starter = buildIngredientFromParts(data, correctedName, candidate.quantity, candidate.unit, undefined, preferredStore);
      const quantity = promptNumber(`How much ${correctedName} is needed for this recipe?`, starter.quantity);
      const unit = clean(prompt(`Unit for ${correctedName}? Example: lb, cup, can, package, tsp`, starter.unit), starter.unit);
      const category = promptIngredientCategory(candidate.category);
      const catalogMatch = findCatalogMatch(correctedName, data.priceCatalog, preferredStore);
      const preliminary = buildIngredientFromParts(data, correctedName, quantity, unit, undefined, preferredStore);
      const preliminaryCheck = refreshIngredientAgainstPantry(data, preliminary, preferredStore);
      let confirmedCost = preliminary.estimatedPrice;

      if (!preliminaryCheck.pantryCovered) {
        const catalogEstimate = estimateIngredientCostFromCatalog(catalogMatch, quantity, unit);
        const defaultPrice = catalogEstimate || preliminary.estimatedPrice;
        confirmedCost = promptNumber(`${catalogMatch ? 'Confirm or edit the selected-store catalog price HomeLife found.' : 'HomeLife did not find a price catalog match. Enter an estimated price or leave 0.'}

${catalogPriceLine(catalogMatch, quantity, unit)}
Ingredient: ${quantity} ${unit} ${correctedName}

This should be the estimated total cost added to the grocery list if you need to buy it.`, defaultPrice);
      }

      const finalIngredient = buildIngredientFromParts(data, correctedName, quantity, unit, confirmedCost, preferredStore);
      const finalCheck = refreshIngredientAgainstPantry(data, finalIngredient, preferredStore);
      reviewed.push({
        ...finalIngredient,
        category,
        pantryCovered: finalCheck.pantryCovered,
        pantryItemId: finalCheck.pantryCovered ? finalCheck.pantryItemId : undefined,
        priceCatalogItemId: finalIngredient.priceCatalogItemId ?? catalogMatch?.id,
        store: finalIngredient.store ?? catalogMatch?.store,
        notes: finalCheck.pantryCovered
          ? 'Matched to pantry during photo review.'
          : catalogMatch
            ? `Price confirmed from catalog: ${catalogMatch.store}${catalogMatch.size ? ` · ${catalogMatch.size}` : ''}`
            : 'No catalog price match; reviewed manually.'
      });
    }

    const needed = reviewed.filter((ingredient) => !refreshIngredientAgainstPantry(data, ingredient, preferredStore).pantryCovered).length;
    setPhotoStatus(`Photo review kept ${reviewed.length} ingredient(s); ${needed} currently need the grocery list.`);
    return reviewed;
  }

  async function readPhoto(file: File): Promise<string | undefined> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(file);
    });
  }

  async function extractTextFromPhotoFile(file: File): Promise<string> {
    const detectedParts: string[] = [];
    try {
      type TextDetectorLike = new () => { detect(source: ImageBitmapSource): Promise<Array<{ rawValue?: string; rawText?: string; text?: string }>> };
      const TextDetectorCtor = (window as unknown as { TextDetector?: TextDetectorLike }).TextDetector;
      if (TextDetectorCtor && typeof createImageBitmap === 'function') {
        setPhotoStatus('Trying built-in browser photo text detection...');
        const image = await createImageBitmap(file);
        try {
          const detector = new TextDetectorCtor();
          const blocks = await detector.detect(image);
          const text = blocks.map((block) => clean(block.rawValue ?? block.rawText ?? block.text)).filter(Boolean).join('\n');
          if (text) detectedParts.push(text);
        } finally {
          image.close?.();
        }
      }
    } catch (error) {
      console.warn('Built-in photo text detection unavailable in this browser.', error);
    }

    if (!detectedParts.join('\n').trim()) {
      const ocrText = await runTesseractOcr(file, setPhotoStatus);
      if (ocrText) detectedParts.push(ocrText);
    }

    const finalText = detectedParts.join('\n').trim();
    setPhotoStatus(finalText ? 'Recipe photo text detected. Breaking down ingredients...' : 'No readable recipe text was detected from the photo.');
    return finalText;
  }

  async function detectBarcodeIngredientNames(file: File): Promise<string[]> {
    const barcodeMatches: string[] = [];
    try {
      type BarcodeDetectorLike = new (options?: { formats?: string[] }) => { detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>> };
      const BarcodeDetectorCtor = (window as unknown as { BarcodeDetector?: BarcodeDetectorLike }).BarcodeDetector;
      if (BarcodeDetectorCtor && typeof createImageBitmap === 'function') {
        const image = await createImageBitmap(file);
        try {
          const detector = new BarcodeDetectorCtor({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
          const codes = await detector.detect(image);
          codes.forEach((code) => {
            const match = data.priceCatalog.find((item) => item.upc === code.rawValue || item.sku === code.rawValue);
            if (match) barcodeMatches.push(match.name);
          });
        } finally {
          image.close?.();
        }
      }
    } catch (error) {
      console.warn('Photo/barcode ingredient detection unavailable in this browser.', error);
    }
    return barcodeMatches;
  }

  async function ingredientsFromPhotoFile(file: File): Promise<MealIngredient[]> {
    setPhotoStatus('Starting recipe photo capture...');
    const detectedText = await extractTextFromPhotoFile(file);
    const barcodeNames = await detectBarcodeIngredientNames(file);
    const filenameNames = inferIngredientNamesFromPhotoName(file.name, data);
    const autoSourceText = [detectedText, barcodeNames.join('\n'), filenameNames.join('\n')].filter(Boolean).join('\n');
    let parsed = parseIngredientsFromText(autoSourceText);

    if (parsed.length) {
      setPhotoStatus(`Detected ${parsed.length} likely ingredient(s) from the photo. Starting review...`);
      return reviewPhotoIngredientCandidates(parsed, 'the photo');
    }

    const fallbackText = autoSourceText || '';
    const reviewed = clean(prompt(
      'HomeLife could not confidently read ingredients from the photo. Paste or correct the recipe/ingredient text here. No comma format needed — full lines, bullets, and copied Live Text work.',
      fallbackText
    ));
    if (!reviewed) {
      setPhotoStatus('No usable recipe text was available from the photo. The recipe photo can still be saved for review.');
      return [];
    }

    parsed = parseIngredientsFromText(reviewed);
    if (!parsed.length) {
      setPhotoStatus('HomeLife could not identify confident ingredients from that text.');
      alert('HomeLife could not identify confident ingredients from that text. The photo recipe can still be saved, then you can add ingredients manually.');
      return [];
    }
    setPhotoStatus(`Detected ${parsed.length} likely ingredient(s) from reviewed text. Starting review...`);
    return reviewPhotoIngredientCandidates(parsed, 'reviewed recipe text');
  }


  async function addRecipeFromPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setPhotoStatus('Photo selected. Preparing import...');
    const photoDataUrl = await readPhoto(file);
    const ingredients = await ingredientsFromPhotoFile(file);
    if (!ingredients.length) {
      setPhotoStatus('No ingredients were confirmed, but the photo recipe will still be saved for review.');
    }
    const name = clean(prompt('Recipe name for this photo?', file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ')), 'Photo Recipe');
    const servings = promptNumber('Servings?', 4);
    const instructions = clean(prompt('Cooking instructions? Optional — paste or type the recipe steps here.', ''), '') || undefined;
    const timestamp = new Date().toISOString();
    const recipe: Recipe = {
      id: uid('recipe'),
      name,
      servings: Math.max(1, servings),
      category: ingredients.length ? 'Photo Import' : 'Photo Review Needed',
      ingredients,
      instructions,
      source: 'photo',
      photoName: file.name,
      photoDataUrl,
      notes: ingredients.length ? 'Built from photo-assisted ingredient capture.' : 'Photo saved, but ingredients still need review. Use Smart Text Recipe or Add Ingredient Photo after improving the image/text.',
      createdAt: timestamp,
      updatedAt: timestamp
    };
    update({ ...data, recipes: [...data.recipes, recipe] });
    setPhotoStatus(ingredients.length ? `Recipe saved with ${ingredients.length} ingredient(s).` : 'Recipe photo saved for review; no ingredients were detected yet.');
  }

  async function addPhotoIngredient(recipeId: string, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const ingredients = await ingredientsFromPhotoFile(file);
    if (!ingredients.length) { alert('No ingredients were detected. The recipe was left unchanged. Try Smart Text Recipe or paste the ingredient section without comma formatting.'); return; }
    update({ ...data, recipes: data.recipes.map((recipe) => recipe.id === recipeId ? { ...recipe, ingredients: [...recipe.ingredients, ...ingredients], source: recipe.source === 'starter' ? 'manual' : recipe.source, photoName: recipe.photoName ?? file.name, updatedAt: new Date().toISOString() } : recipe) });
  }

  function addSmartTextToRecipe(recipeId: string) {
    const recipeText = clean(prompt('Paste the ingredient section or full recipe text. No commas required — HomeLife will identify ingredient lines automatically.', ''));
    if (!recipeText) return;
    const parsed = smartParseIngredientsFromText(data, recipeText, preferredStore);
    if (!parsed.ingredients.length) { alert('HomeLife could not identify ingredients from that text.'); return; }
    const parsedInstructions = extractRecipeInstructions(recipeText);
    update({ ...data, recipes: data.recipes.map((recipe) => recipe.id === recipeId ? { ...recipe, ingredients: [...recipe.ingredients, ...parsed.ingredients], instructions: recipe.instructions || parsedInstructions || undefined, notes: recipe.notes ?? 'Updated from smart recipe text.', updatedAt: new Date().toISOString() } : recipe) });
    setPhotoStatus(`Added ${parsed.ingredients.length} ingredient(s) from smart text.`);
  }

  function planRecipe(recipe: Recipe) {
    const date = clean(prompt('Meal date? YYYY-MM-DD', today()), today());
    const mealType = (MEAL_TYPES.find((type) => type.toLowerCase() === clean(prompt(`Meal type? ${MEAL_TYPES.join(', ')}`, 'Dinner')).toLowerCase()) ?? 'Dinner') as MealType;
    const meal = createMealFromRecipe(data, recipe, date, mealType);
    update({ ...data, mealPlans: [...data.mealPlans, meal] });
  }

  function addRecipeMissingToGrocery(recipe: Recipe) {
    const meal = createMealFromRecipe(data, recipe, today(), 'Dinner');
    const missing = meal.ingredients.filter((ingredient) => !ingredient.pantryCovered);
    if (!missing.length) { alert('All recipe ingredients are currently covered by pantry inventory.'); return; }
    const defaultListName = data.shoppingLists.find((list) => list.type === 'meal_plan')?.name ?? 'Meal Plan Grocery List';
    const listName = clean(prompt('Add missing recipe ingredients to which grocery list?', defaultListName), defaultListName);
    update({ ...data, shoppingLists: addMissingIngredientsToList(data, meal, listName) });
  }

  function refreshRecipe(recipeId: string) {
    update({ ...data, recipes: data.recipes.map((recipe) => recipe.id === recipeId ? { ...recipe, ingredients: recipe.ingredients.map((ingredient) => refreshIngredientAgainstPantry(data, ingredient, preferredStore)), updatedAt: new Date().toISOString() } : recipe) });
  }


  function addRecipeFromSmartText() {
    const recipeText = clean(prompt('Paste a full recipe, ingredient section, grocery note, or copied text from a photo. HomeLife will identify ingredient lines automatically — commas are not required.', ''));
    if (!recipeText) return;
    const parsed = smartParseIngredientsFromText(data, recipeText, preferredStore);
    if (!parsed.ingredients.length) { alert('HomeLife could not identify ingredients from that text. Try pasting the ingredient section or one ingredient per line.'); return; }
    const firstMeaningfulLine = splitIngredientCandidates(parsed.sourceText)[0] ?? 'Smart Recipe';
    const name = clean(prompt('Recipe name?', titleCaseIngredient(firstMeaningfulLine.replace(/^\d+\s*(cup|cups|tbsp|tsp|lb|lbs|oz|can|package|item)?\s*/i, '').slice(0, 50))), 'Smart Recipe');
    const servings = promptNumber('Servings?', 4);
    const instructions = clean(prompt('Cooking instructions? Optional — HomeLife found/preserved this if the pasted text included directions.', extractRecipeInstructions(recipeText)), '') || undefined;
    const timestamp = new Date().toISOString();
    const recipe: Recipe = { id: uid('recipe'), name, servings: Math.max(1, servings), category: 'Smart Text Import', ingredients: parsed.ingredients, instructions, source: 'manual', notes: 'Built from smart recipe text parsing.', createdAt: timestamp, updatedAt: timestamp };
    update({ ...data, recipes: [...data.recipes, recipe] });
  }

  return <div className="recipe-page">
    <div className="card wide"><div className="split"><div><h3>Recipe Builder</h3><p className="muted">Build reusable recipes manually, from smart pasted recipe text, or from photo-assisted capture. Choose the store HomeLife should use first for catalog prices. Photo capture checks the pantry, searches that store's price catalog first, and lets you confirm or edit the matched price before missing items go to the grocery list. Ingredient categories are left for you to choose instead of being guessed from price matches.</p></div><div className="settings-actions"><button className="primary" onClick={addRecipe}><PlusCircle size={16} /> Add Manual Recipe</button><button onClick={addRecipeFromSmartText}>Smart Text Recipe</button><label className="button-like"><Camera size={16} /> Add Recipe From Photo<input type="file" accept="image/*" capture="environment" onChange={addRecipeFromPhoto} hidden /></label></div></div><div className="form-grid"><label>Recipe price store<select value={preferredStore} onChange={(event) => changePreferredStore(event.target.value)}>{storeOptions.map((store) => <option key={store} value={store}>{store}</option>)}</select></label><p className="muted">Using {preferredStore} first for recipe pricing · {preferredStoreCatalogCount} catalog item(s). Add another store on the Price Catalog page and it will appear here.</p></div>{photoStatus && <div className="status-banner">{photoStatus}</div>}<input className="full-input" placeholder="Search recipes, categories, notes, or ingredients..." value={query} onChange={(event) => setQuery(event.target.value)} /><div className="totals"><span>Recipes: <strong>{data.recipes.length}</strong></span><span>Visible: <strong>{recipes.length}</strong></span></div></div>
    <div className="grid two">{recipes.map((recipe) => <div className="card recipe-card" key={recipe.id}>{recipe.photoDataUrl && <img className="recipe-photo" src={recipe.photoDataUrl} alt={`${recipe.name} import`} />}<div className="split"><div><p className="label">{recipe.category ?? 'Recipe'} · {recipe.servings} serving(s) · {recipe.source}</p><h3>{recipe.name}</h3><p>{recipe.notes}</p></div><button className="icon-danger" onClick={() => deleteRecipe(recipe.id)}><Trash2 size={14} /> Delete Recipe</button></div><div className="meal-costs"><span>Recipe value: <strong>{money(recipeTotal(recipe))}</strong></span><span>Need to buy now: <strong>{money(recipeMissingTotal(recipe))}</strong></span><span>Ingredients: <strong>{recipe.ingredients.length}</strong></span></div><div className="settings-actions"><button onClick={() => addIngredient(recipe.id)}>Add Ingredient</button><label className="button-like"><Camera size={16} /> Add Ingredient Photo<input type="file" accept="image/*" capture="environment" onChange={(event) => addPhotoIngredient(recipe.id, event)} hidden /></label><button onClick={() => addSmartTextToRecipe(recipe.id)}>Add Smart Text</button><button onClick={() => refreshRecipe(recipe.id)}>Refresh Pantry Check</button><button onClick={() => editRecipeInstructions(recipe.id)}>Edit Instructions</button><button onClick={() => planRecipe(recipe)}>Plan as Meal</button><button onClick={() => addRecipeMissingToGrocery(recipe)}>Missing to Grocery List</button></div>{recipe.instructions && <p className="instructions"><strong>Instructions:</strong> {recipe.instructions}</p>}<ul className="ingredient-list">{recipe.ingredients.map((ingredient) => { const refreshed = refreshIngredientAgainstPantry(data, ingredient, preferredStore); return <li key={ingredient.id}><div><strong>{ingredient.name}</strong><small>{ingredient.quantity} {ingredient.unit} · {ingredient.category ?? 'Category not set'} · {refreshed.pantryCovered ? 'pantry covered' : 'buy'} · {money(ingredient.estimatedPrice)} {ingredient.store ? `· ${ingredient.store}` : ''}</small></div><div className="row-actions"><button onClick={() => editIngredient(recipe.id, ingredient.id)}>Edit</button><button className="icon-danger" onClick={() => deleteIngredient(recipe.id, ingredient.id)}><Trash2 size={14} /> Delete</button></div></li>; })}</ul></div>)}</div>
  </div>;
}

function MealPlanner({ data, update }: { data: AppData; update: (d: AppData) => void }) {
  const meals = [...data.mealPlans].sort((a, b) => a.date.localeCompare(b.date) || a.mealType.localeCompare(b.mealType));
  function addMeal() {
    const name = clean(prompt('Meal name? Example: Chicken tacos')); if (!name) return;
    const date = clean(prompt('Meal date? YYYY-MM-DD', today()), today());
    const mealType = (MEAL_TYPES.find((type) => type.toLowerCase() === clean(prompt(`Meal type? ${MEAL_TYPES.join(', ')}`, 'Dinner')).toLowerCase()) ?? 'Dinner') as MealType;
    const servings = promptNumber('Servings?', 4);
    const ingredients: MealIngredient[] = [];
    do {
      const ingredient = buildIngredientFromPrompt(data);
      if (ingredient) ingredients.push(ingredient);
    } while (confirm('Add another ingredient to this meal?'));
    const notes = clean(prompt('Meal notes? Optional', '')) || undefined;
    const meal: MealPlanItem = { id: uid('meal'), name, date, mealType, servings: Math.max(1, servings), ingredients, notes, createdAt: new Date().toISOString() };
    update({ ...data, mealPlans: [...data.mealPlans, meal] });
  }
  function deleteMeal(id: string) { if (confirm('Delete this planned meal?')) update({ ...data, mealPlans: data.mealPlans.filter((meal) => meal.id !== id) }); }
  function addIngredient(mealId: string) {
    const ingredient = buildIngredientFromPrompt(data); if (!ingredient) return;
    update({ ...data, mealPlans: data.mealPlans.map((meal) => meal.id === mealId ? { ...meal, ingredients: [...meal.ingredients, ingredient] } : meal) });
  }
  function deleteIngredient(mealId: string, ingredientId: string) {
    if (!confirm('Delete this ingredient from the meal?')) return;
    update({ ...data, mealPlans: data.mealPlans.map((meal) => meal.id === mealId ? { ...meal, ingredients: meal.ingredients.filter((ingredient) => ingredient.id !== ingredientId) } : meal) });
  }
  function addMealToGroceryList(meal: MealPlanItem) {
    const refreshedMeal = { ...meal, ingredients: meal.ingredients.map((ingredient) => refreshIngredientAgainstPantry(data, ingredient)) };
    const missing = refreshedMeal.ingredients.filter((ingredient) => !ingredient.pantryCovered);
    if (!missing.length) { alert('All ingredients are covered by pantry inventory. Nothing new to add to the grocery list.'); return; }
    const defaultListName = data.shoppingLists.find((list) => list.type === 'meal_plan')?.name ?? 'Meal Plan Grocery List';
    const listName = clean(prompt('Add missing ingredients to which grocery list?', defaultListName), defaultListName);
    update({ ...data, mealPlans: data.mealPlans.map((item) => item.id === meal.id ? refreshedMeal : item), shoppingLists: addMissingIngredientsToList(data, refreshedMeal, listName) });
  }
  function planFromRecipe() {
    if (!data.recipes.length) { alert('Add a recipe in Recipe Builder first.'); return; }
    const selection = clean(prompt(`Recipe to plan? Enter name or number:\n${data.recipes.map((recipe, index) => `${index + 1}. ${recipe.name}`).join('\n')}`, '1'), '1');
    const recipe = data.recipes[Number(selection) - 1] ?? data.recipes.find((item) => item.name.toLowerCase() === selection.toLowerCase());
    if (!recipe) { alert('Recipe not found.'); return; }
    const date = clean(prompt('Meal date? YYYY-MM-DD', today()), today());
    const mealType = (MEAL_TYPES.find((type) => type.toLowerCase() === clean(prompt(`Meal type? ${MEAL_TYPES.join(', ')}`, 'Dinner')).toLowerCase()) ?? 'Dinner') as MealType;
    const meal = createMealFromRecipe(data, recipe, date, mealType);
    update({ ...data, mealPlans: [...data.mealPlans, meal] });
  }
  return <div className="meal-page">
    <div className="card wide"><div className="split"><div><h3>Meal Planner</h3><p className="muted">Plan meals manually or from Recipe Builder, refresh pantry coverage, and send only the missing ingredients to a grocery list. Each meal shows total value and new grocery cost.</p></div><div className="settings-actions"><button className="primary" onClick={addMeal}><CookingPot size={16} /> Add Meal</button><button onClick={planFromRecipe}><BookOpen size={16} /> Plan From Recipe</button></div></div><div className="totals"><span>Planned meals: <strong>{data.mealPlans.length}</strong></span><span>Total food value: <strong>{money(allMealTotalCost(data.mealPlans))}</strong></span><span>New grocery cost: <strong>{money(allMealGroceryCost(data.mealPlans))}</strong></span></div></div>
    <div className="grid two">{meals.map((meal) => <div className="card meal-card" key={meal.id}><div className="split"><div><p className="label">{meal.date} · {meal.mealType} · {meal.servings} serving(s)</p><h3>{meal.name}</h3><p>{meal.notes}</p></div><button className="icon-danger" onClick={() => deleteMeal(meal.id)}><Trash2 size={14} /> Delete Meal</button></div><div className="meal-costs"><span>Total: <strong>{money(mealTotalCost(meal))}</strong></span><span>Pantry covered: <strong>{money(mealPantryCoveredCost(meal))}</strong></span><span>Need to buy: <strong>{money(mealGroceryCost(meal))}</strong></span></div><div className="settings-actions"><button onClick={() => addIngredient(meal.id)}>Add Ingredient</button><button onClick={() => addMealToGroceryList(meal)}>Add Missing to Grocery List</button></div><ul className="ingredient-list">{meal.ingredients.map((ingredient) => <li key={ingredient.id}><div><strong>{ingredient.name}</strong><small>{ingredient.quantity} {ingredient.unit} · {ingredient.category ?? 'Category not set'} · {ingredient.pantryCovered ? 'pantry covered' : 'buy'} · {money(ingredient.estimatedPrice)} {ingredient.store ? `· ${ingredient.store}` : ''}</small></div><button className="icon-danger" onClick={() => deleteIngredient(meal.id, ingredient.id)}><Trash2 size={14} /> Delete</button></li>)}</ul></div>)}</div>
  </div>;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) { const ch = text[i]; const next = text[i + 1]; if (ch === '"' && quoted && next === '"') { cell += '"'; i++; } else if (ch === '"') quoted = !quoted; else if (ch === ',' && !quoted) { row.push(cell); cell = ''; } else if ((ch === '\n' || ch === '\r') && !quoted) { if (ch === '\r' && next === '\n') i++; row.push(cell); if (row.some(c => c.trim())) rows.push(row); row = []; cell = ''; } else cell += ch; }
  row.push(cell); if (row.some(c => c.trim())) rows.push(row); return rows;
}
function parseAmount(value: string) { const cleaned = value.replace(/[$,()]/g, '').trim(); const n = Number(cleaned); return value.includes('(') ? -Math.abs(n) : n; }
function sanitizeDescription(desc: string) { return desc.replace(/\b\d{4,}\b/g, '####').replace(/acct\s*#?\s*\w+/ig, 'acct ####').slice(0, 90); }
function closeDate(a: string, b: string) { return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000) <= 3; }
function findMatch(row: StatementImportRow, data: AppData) {
  return data.transactions.find(t => Math.abs(t.amount - row.amount) < 0.01 && closeDate(t.date, row.date)) || data.transactions.find(t => Math.abs(t.amount - row.amount) < 0.01);
}
function StatementImport({ data, update }: { data: AppData; update: (d: AppData) => void }) {
  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    file.text().then(text => {
      const parsed = parseCsv(text); if (parsed.length < 2) return alert('No rows found. Use a CSV export from your bank.');
      const header = parsed[0].map(h => h.toLowerCase().trim());
      const dateIdx = header.findIndex(h => h.includes('date'));
      const descIdx = header.findIndex(h => h.includes('description') || h.includes('memo') || h.includes('payee'));
      const amountIdx = header.findIndex(h => h.includes('amount'));
      const debitIdx = header.findIndex(h => h.includes('debit') || h.includes('withdrawal'));
      const creditIdx = header.findIndex(h => h.includes('credit') || h.includes('deposit'));
      const rows = parsed.slice(1).map(cols => {
        const debit = debitIdx >= 0 ? parseAmount(cols[debitIdx] ?? '') : 0; const credit = creditIdx >= 0 ? parseAmount(cols[creditIdx] ?? '') : 0;
        const amount = amountIdx >= 0 ? parseAmount(cols[amountIdx] ?? '0') : (credit ? Math.abs(credit) : -Math.abs(debit));
        const row: StatementImportRow = { id: uid('stmt'), date: (cols[dateIdx] ?? '').trim(), description: sanitizeDescription(cols[descIdx] ?? 'Imported transaction'), amount, type: amount >= 0 ? 'credit' : 'debit', matchStatus: 'missing_from_register' };
        const match = findMatch(row, data); return match ? { ...row, matchedTransactionId: match.id, matchStatus: (closeDate(row.date, match.date) ? 'matched' : 'possible') as StatementImportRow['matchStatus'] } : row;
      }).filter(r => r.date && Number.isFinite(r.amount));
      update({ ...data, statementImports: rows });
    });
  }
  function clear() { update({ ...data, statementImports: [] }); }
  function deleteRow(id: string) { if (confirm('Delete this imported statement row?')) update({ ...data, statementImports: data.statementImports.filter((row) => row.id !== id) }); }
  function downloadSanitized() { const rows = [['date','description','amount','type','matchStatus'], ...data.statementImports.map(r => [r.date, r.description, String(r.amount), r.type, r.matchStatus])]; downloadText('homelife-sanitized-statement.csv', rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')); }
  return <div className="card wide"><h3>Bank Statement Import & Reconciliation</h3><p className="muted">Privacy design: the raw bank file is read in your browser only. HomeLife stores only sanitized rows: date, cleaned description, amount, and match status. Account/routing numbers are not needed.</p><div className="settings-actions"><label className="button-like">Load CSV Statement<input type="file" accept=".csv,text/csv" onChange={handleFile} hidden /></label><button onClick={downloadSanitized}>Export Sanitized CSV</button><button className="danger" onClick={clear}>Clear Imported Rows</button></div><table><thead><tr><th>Date</th><th>Sanitized Description</th><th>Amount</th><th>Status</th><th>Delete</th></tr></thead><tbody>{data.statementImports.map(r => <tr key={r.id}><td>{r.date}</td><td>{r.description}</td><td className={r.amount < 0 ? 'negative' : 'positive'}>{money(r.amount)}</td><td><span className={`pill ${r.matchStatus}`}>{r.matchStatus.replace(/_/g, ' ')}</span></td><td><button className="icon-danger" onClick={() => deleteRow(r.id)}><Trash2 size={14} /> Delete</button></td></tr>)}</tbody></table></div>;
}

function Shopping({ data, update }: { data: AppData; update: (d: AppData) => void }) {
  const currentUser = data.users.find((u) => u.id === data.currentUserId)!;
  const visibleLists = data.shoppingLists.filter(l => currentUser.role === 'owner' || l.sharedWith.includes(currentUser.id));
  function toggleItem(listId: string, itemId: string) { update({ ...data, shoppingLists: data.shoppingLists.map(list => list.id === listId ? { ...list, items: list.items.map(item => item.id === itemId ? { ...item, checked: !item.checked } : item) } : list) }); }
  function addList() { const name = clean(prompt('List name? Example: Weekly Grocery List')); if (!name) return; update({ ...data, shoppingLists: [...data.shoppingLists, { id: uid('list'), name, type: 'custom', sharedWith: data.users.map(u => u.id), items: [] }] }); }
  function deleteList(listId: string) { if (confirm('Delete this shopping list and its items?')) update({ ...data, shoppingLists: data.shoppingLists.filter((list) => list.id !== listId) }); }
  function addItem(listId: string) { const search = clean(prompt('Item name? This will try to use your price catalog.')); if (!search) return; const found = findCatalogMatch(search, data.priceCatalog); const price = found ? found.price : promptNumber('Estimated item price?', 0); const qty = promptNumber(found?.size?.includes('per lb') ? 'Quantity / pounds?' : 'Quantity?', 1); const item: ShoppingItem = { id: uid('item'), name: found?.name ?? search, quantity: Number.isFinite(qty) ? qty : 1, estimatedPrice: Number.isFinite(price) ? price : 0, checked: false, store: found?.store, category: found?.category, notes: found ? `${found.brand ?? ''} ${found.size ?? ''}`.trim() : undefined, source: found ? 'price_catalog' : 'manual' }; update({ ...data, shoppingLists: data.shoppingLists.map(l => l.id === listId ? { ...l, items: [...l.items, item] } : l) }); }
  function deleteItem(listId: string, itemId: string) { if (confirm('Delete this shopping item?')) update({ ...data, shoppingLists: data.shoppingLists.map((list) => list.id === listId ? { ...list, items: list.items.filter((item) => item.id !== itemId) } : list) }); }
  return <div className="shopping-page"><div className="actions"><button className="primary" onClick={addList}>Add Shopping List</button></div><div className="grid two">{visibleLists.map(list => <div className="card" key={list.id}><div className="list-header"><div><p className="label">{list.type}</p><h3>{list.name}</h3></div><div className="settings-actions"><button onClick={() => addItem(list.id)}>Add Item</button><button className="icon-danger" onClick={() => deleteList(list.id)}><Trash2 size={14} /> Delete List</button></div></div><div className="totals"><span>Estimated: <strong>{money(listEstimatedTotal(list))}</strong></span><span>Actual/Projected: <strong>{money(listActualTotal(list))}</strong></span></div><ul className="shopping-list">{list.items.map(item => <li key={item.id} className={item.checked ? 'checked' : ''}><label><input type="checkbox" checked={item.checked} onChange={() => toggleItem(list.id, item.id)} /> <span>{item.name}</span></label><small>{item.quantity} × {money(item.estimatedPrice)} {item.store ? `· ${item.store}` : ''} {item.notes ? `· ${item.notes}` : ''}</small><button className="icon-danger" onClick={() => deleteItem(list.id, item.id)}><Trash2 size={14} /> Delete</button></li>)}</ul></div>)}</div></div>;
}

function downloadText(filename: string, text: string) { const blob = new Blob([text], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
function SettingsPage({ data, update, cloudControls }: { data: AppData; update: (d: AppData) => void; cloudControls: CloudControls }) {
  const backup = useMemo(() => JSON.stringify(data, null, 2), [data]);
  const currentUser = data.users.find((u) => u.id === data.currentUserId) ?? data.users[0];
  const canManageUsers = currentUser?.role === 'owner';
  const ownerCount = data.users.filter((u) => u.role === 'owner').length;

  function exportBackup() { downloadText(`homelife-${data.inviteCode ?? 'household'}-backup.json`, backup); }
  function importBackup(event: React.ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; file.text().then((text) => update(normalizeData(JSON.parse(text)))).catch(() => alert('Unable to import JSON backup.')); }
  function reset() { if (!confirm('Reset this local HomeLife household workspace?')) return; resetData(data.householdId); clearActiveHouseholdCode(); window.location.reload(); }
  function renameHousehold() {
    if (!canManageUsers) { alert('Only an owner login can rename the household.'); return; }
    const householdName = clean(prompt('Household name?', data.householdName ?? 'HomeLife Household'), data.householdName ?? 'HomeLife Household');
    update({ ...data, householdName });
  }
  function addUser() {
    if (!canManageUsers) { alert('Only an owner login can add users.'); return; }
    const name = clean(prompt('User name? Example: Mom, Dad, Teen, Grandparent'));
    if (!name) return;
    const roleInput = clean(prompt(`Role? ${ROLE_OPTIONS.map((r) => r.value).join(', ')}`, 'household_member'), 'household_member') as Role;
    const role = ROLE_OPTIONS.some((option) => option.value === roleInput) ? roleInput : 'household_member';
    const pin = clean(prompt('Optional PIN for this login. Leave blank for no PIN.', ''));
    const user: User = { id: uid('user'), name, role, pin };
    update({ ...data, users: [...data.users, user], shoppingLists: data.shoppingLists.map((list) => ({ ...list, sharedWith: [...new Set([...list.sharedWith, user.id])] })) });
  }
  function deleteUser(userId: string) {
    if (!canManageUsers) { alert('Only an owner login can delete users.'); return; }
    const user = data.users.find((u) => u.id === userId); if (!user) return;
    if (user.id === data.currentUserId) { alert('You cannot delete the login you are currently using. Sign in as another owner first.'); return; }
    if (user.role === 'owner' && ownerCount <= 1) { alert('Keep at least one owner login.'); return; }
    if (!confirm(`Delete login for ${user.name}?`)) return;
    const nextUsers = data.users.filter((u) => u.id !== userId);
    update({ ...data, users: nextUsers, currentUserId: nextUsers[0]?.id ?? 'user-owner', shoppingLists: data.shoppingLists.map((list) => ({ ...list, sharedWith: list.sharedWith.filter((id) => id !== userId) })) });
  }
  function changeRole(userId: string) {
    if (!canManageUsers) { alert('Only an owner login can change roles.'); return; }
    const user = data.users.find((u) => u.id === userId); if (!user) return;
    const roleInput = clean(prompt(`New role for ${user.name}? ${ROLE_OPTIONS.map((r) => r.value).join(', ')}`, user.role), user.role) as Role;
    const role = ROLE_OPTIONS.some((option) => option.value === roleInput) ? roleInput : user.role;
    if (user.role === 'owner' && role !== 'owner' && ownerCount <= 1) { alert('Keep at least one owner login.'); return; }
    update({ ...data, users: data.users.map((u) => u.id === userId ? { ...u, role } : u) });
  }
  function changePin(userId: string) {
    if (!canManageUsers) { alert('Only an owner login can change PINs.'); return; }
    const user = data.users.find((u) => u.id === userId); if (!user) return;
    const pin = clean(prompt(`New PIN for ${user.name}. Leave blank to remove the PIN.`, user.pin ?? ''));
    update({ ...data, users: data.users.map((u) => u.id === userId ? { ...u, pin } : u) });
  }

  return <div className="card wide">
    <div className="split"><div><h3>Settings, Logins & Test Families</h3><p className="muted">Household code <strong>{data.inviteCode ?? data.householdId}</strong> separates each family test workspace. Cloud Sync lets the same family workspace follow users across phones, computers, and networks.</p></div><div className="settings-actions"><button onClick={renameHousehold}>Rename Household</button><button className="primary" onClick={addUser}><PlusCircle size={14} /> Add User Login</button></div></div>
    <div className="card inset-card cloud-card">
      <div className="split"><div><h4>Reachable Cloud Backend</h4><p className="muted">Status: <strong>{cloudControls.status}</strong>. The Supabase connection is built in. Enter the same family cloud password on each household device and keep auto-sync on. HomeLife pushes saves and auto-pulls newer cloud changes when the app is focused and about every 45 seconds. The workspace is encrypted in the browser before saving. No readable budget, register, pantry, recipe, or grocery data is saved to Supabase.</p></div><div className="settings-actions"><button onClick={cloudControls.configure}>Cloud Setup</button><button onClick={cloudControls.test}>Test</button><button className="primary" onClick={cloudControls.push}>Push Now</button><button onClick={cloudControls.pull}>Pull Latest</button><button className="danger" onClick={cloudControls.disable}>Disable</button></div></div>
      <p className="privacy-callout">Privacy hardening: cloud rows use a one-way workspace ID generated from the family code and cloud password. The raw family code, household name, and household data are not stored as readable Supabase columns. Changing the cloud password creates a different encrypted cloud workspace unless the data is re-saved with the new password.</p>
    </div>
    <h4>User logins and view controls</h4>
    <table><thead><tr><th>User</th><th>Role</th><th>PIN</th><th>Register/Budget/Debt</th><th>Statement Import</th><th>Recipes/Meals/Pantry/Shopping/Prices</th><th>Actions</th></tr></thead><tbody>{data.users.map(u => <tr key={u.id}><td>{u.name}</td><td>{roleLabel(u.role)}</td><td>{u.pin ? 'Set' : 'Blank'}</td><td>{financeRoles.includes(u.role) ? 'Visible' : 'Hidden'}</td><td>{financeRoles.includes(u.role) ? 'Visible' : 'Hidden'}</td><td>Visible/shared</td><td><div className="row-actions"><button onClick={() => changeRole(u.id)}>Role</button><button onClick={() => changePin(u.id)}>PIN</button><button className="icon-danger" onClick={() => deleteUser(u.id)}><Trash2 size={14} /> Delete</button></div></td></tr>)}</tbody></table>
    <h4>Role guide</h4>
    <div className="grid two role-grid">{ROLE_OPTIONS.map((role) => <div className="permission-card" key={role.value}><strong>{role.label}</strong><span>{role.detail}</span></div>)}</div>
    <h4>Backup and reset</h4>
    <div className="settings-actions"><button onClick={exportBackup}>Export JSON Backup</button><label className="button-like">Import JSON Backup<input type="file" accept="application/json" onChange={importBackup} hidden /></label><button className="danger" onClick={reset}>Reset This Household</button></div>
  </div>;
}


class HomeLifeErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="app-shell single-panel"><main><div className="card wide boot-error"><h1>HomeLife could not finish loading.</h1><p>The app protected your screen instead of staying blank. This is usually caused by older saved browser data from a prior HomeLife build.</p><p className="muted">Error: {this.state.error.message}</p><div className="settings-actions"><button className="primary" onClick={() => { resetData(); window.location.reload(); }}>Repair local data and reload</button><button onClick={() => window.location.reload()}>Reload</button></div></div></main></div>;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('HomeLife could not start because index.html is missing <div id="root"></div>.');
try {
  createRoot(rootElement).render(<React.StrictMode><HomeLifeErrorBoundary><App /></HomeLifeErrorBoundary></React.StrictMode>);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  rootElement.innerHTML = `<main class="boot-error"><h1>HomeLife could not start.</h1><p>${message}</p><button onclick="localStorage.clear(); location.reload();">Repair local data and reload</button></main>`;
}
