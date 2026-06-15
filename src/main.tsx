import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { DEFAULT_DATA, loadData, mergeDefaultPriceCatalog, resetData, saveData } from './services/storage';
import type {
  AppData,
  MealIngredient,
  MealPlanItem,
  MealType,
  PantryCategory,
  PantryItem,
  PriceCatalogItem,
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
const CookingPot = (props: IconProps) => <IconGlyph label="🍲" {...props} />;
const EyeOff = (props: IconProps) => <IconGlyph label="◌" {...props} />;
const FileSearch = (props: IconProps) => <IconGlyph label="⌕" {...props} />;
const Home = (props: IconProps) => <IconGlyph label="⌂" {...props} />;
const Landmark = (props: IconProps) => <IconGlyph label="▤" {...props} />;
const Settings = (props: IconProps) => <IconGlyph label="⚙" {...props} />;
const ShoppingCart = (props: IconProps) => <IconGlyph label="🛒" {...props} />;
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
    role: safeRole(u?.role)
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
      createdAt: clean(meal?.createdAt, today())
    }))
  };
}

function findCatalogMatch(name: string, catalog: PriceCatalogItem[]) {
  const needle = name.toLowerCase();
  return catalog.find((p) => p.name.toLowerCase() === needle)
    ?? catalog.find((p) => p.name.toLowerCase().includes(needle) || needle.includes(p.name.toLowerCase()));
}

function findPantryMatch(name: string, pantryItems: PantryItem[]) {
  const needle = name.toLowerCase();
  return pantryItems.find((p) => p.name.toLowerCase() === needle)
    ?? pantryItems.find((p) => p.name.toLowerCase().includes(needle) || needle.includes(p.name.toLowerCase()));
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

function buildIngredientFromPrompt(data: AppData): MealIngredient | null {
  const requestedName = clean(prompt('Ingredient name? Example: Chicken breast'));
  if (!requestedName) return null;
  const catalog = findCatalogMatch(requestedName, data.priceCatalog);
  const pantry = findPantryMatch(requestedName, data.pantryItems);
  const quantity = promptNumber('Quantity needed for this meal?', 1);
  const unit = clean(prompt('Unit? Example: lb, cup, can, package, tsp', pantry?.unit ?? 'item'), 'item');
  const pantryCovered = pantry ? confirm(`${pantry.name} is already in pantry (${pantry.quantity} ${pantry.unit}, ${pantry.location}). Mark this ingredient as already accounted for?`) : false;
  const category = normalizeCategory(catalog?.category ?? pantry?.category ?? prompt(`Category? ${PANTRY_CATEGORIES.join(', ')}`, pantry?.category ?? catalog?.category ?? 'Other'));
  const defaultEstimate = catalog?.price ?? (pantry?.estimatedUnitPrice ? pantry.estimatedUnitPrice * quantity : 0);
  const estimatedPrice = promptNumber('Estimated cost for this meal amount? Use 0 if it is already fully accounted for.', defaultEstimate);
  return {
    id: uid('ing'),
    name: catalog?.name ?? pantry?.name ?? requestedName,
    quantity: Number.isFinite(quantity) ? quantity : 1,
    unit,
    category,
    estimatedPrice: Math.max(0, estimatedPrice),
    pantryCovered,
    pantryItemId: pantryCovered ? pantry?.id : undefined,
    priceCatalogItemId: catalog?.id,
    store: catalog?.store,
    notes: catalog ? `${catalog.brand ?? ''} ${catalog.size ?? ''}`.trim() : undefined
  };
}

function App() {
  const [data, setData] = useState<AppData>(() => {
    try {
      return normalizeData(loadData());
    } catch (error) {
      console.error('HomeLife failed to load saved data. Starting with safe defaults.', error);
      return normalizeData(null);
    }
  });
  const [page, setPage] = useState('dashboard');
  const currentUser = data.users.find((u) => u.id === data.currentUserId) ?? data.users[0] ?? { id: 'user-owner', name: 'Owner', role: 'owner' as Role };
  const canViewFinance = financeRoles.includes(currentUser.role);

  function update(next: AppData) {
    const normalized = normalizeData(next);
    setData(normalized);
    saveData(normalized);
  }

  const nav = [
    { id: 'dashboard', label: 'Dashboard', icon: Home, show: true },
    { id: 'register', label: 'Register', icon: WalletCards, show: canViewFinance },
    { id: 'budget', label: 'Budget', icon: BarChart3, show: canViewFinance },
    { id: 'debt', label: 'Debt', icon: Landmark, show: canViewFinance },
    { id: 'reconcile', label: 'Statement Import', icon: FileSearch, show: canViewFinance },
    { id: 'prices', label: 'Price Catalog', icon: Tags, show: true },
    { id: 'pantry', label: 'Pantry', icon: Archive, show: true },
    { id: 'meal-planner', label: 'Meal Planner', icon: Utensils, show: true },
    { id: 'shopping', label: 'Shopping Lists', icon: ShoppingCart, show: true },
    { id: 'settings', label: 'Settings', icon: Settings, show: true }
  ];

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-card"><div className="brand-mark">HL</div><div><h1>HomeLife</h1><p>Budget, shop, cook, and plan your household in one place.</p></div></div>
      <nav>{nav.filter((n) => n.show).map((n) => { const Icon = n.icon; return <button key={n.id} className={page === n.id ? 'active' : ''} onClick={() => setPage(n.id)}><Icon size={18} /> {n.label}</button>; })}</nav>
      {!canViewFinance && <div className="privacy-note"><EyeOff size={16} /> Register, budget, debt, and statements are hidden for this role.</div>}
      <div className="version-badge">v2026.06.12.0008</div>
    </aside>
    <main>
      <header className="topbar"><div><h2>{nav.find((n) => n.id === page)?.label ?? 'Dashboard'}</h2><p>Signed in as <strong>{currentUser.name}</strong> · {currentUser.role.replace('_', ' ')}</p></div><select value={data.currentUserId} onChange={(e) => update({ ...data, currentUserId: e.target.value })}>{data.users.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.role.replace('_', ' ')}</option>)}</select></header>
      {page === 'dashboard' && <Dashboard data={data} canViewFinance={canViewFinance} />}
      {page === 'register' && canViewFinance && <Register data={data} update={update} />}
      {page === 'budget' && canViewFinance && <Budget data={data} update={update} />}
      {page === 'debt' && canViewFinance && <Debt data={data} update={update} />}
      {page === 'reconcile' && canViewFinance && <StatementImport data={data} update={update} />}
      {page === 'prices' && <PriceCatalog data={data} update={update} />}
      {page === 'pantry' && <Pantry data={data} update={update} />}
      {page === 'meal-planner' && <MealPlanner data={data} update={update} />}
      {page === 'shopping' && <Shopping data={data} update={update} />}
      {page === 'settings' && <SettingsPage data={data} update={update} />}
    </main>
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
  function deleteCategory(id: string) { if (confirm('Delete this budget category?')) update({ ...data, budgetCategories: data.budgetCategories.filter((c) => c.id !== id) }); }
  return <div className="card wide"><h3>Budget</h3><table><thead><tr><th>Category</th><th>Monthly Budget</th><th>Actual</th><th>Remaining</th><th>Delete</th></tr></thead><tbody>{data.budgetCategories.map(c => { const actual = Math.abs(data.transactions.filter(t => t.category === c.name && t.amount < 0).reduce((s, t) => s + t.amount, 0)); return <tr key={c.id}><td>{c.name}</td><td>{money(c.monthlyBudget)}</td><td>{money(actual)}</td><td>{money(c.monthlyBudget - actual)}</td><td><button className="icon-danger" onClick={() => deleteCategory(c.id)}><Trash2 size={14} /> Delete</button></td></tr>; })}</tbody></table></div>;
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
    alert(`Starter catalog restored. HomeLife now has ${merged.length} price records.`);
  }
  function exportCsv() {
    const rows = [['store','storeName','zip','name','brand','size','category','price','lastChecked','notes'], ...data.priceCatalog.map(p => [p.store, p.storeName ?? '', p.storeZip ?? '', p.name, p.brand ?? '', p.size ?? '', p.category ?? '', String(p.price), p.lastChecked, p.notes ?? ''])];
    downloadText('homelife-price-catalog.csv', rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'));
  }
  return <div className="card wide"><div className="split"><div><h3>Local Price Catalog</h3><p className="muted">Use this for grocery, pantry, and meal projections. Later, this page can call a Supabase Edge Function for approved Walmart/United pricing lookup without scraping.</p></div><div className="settings-actions"><button onClick={addPrice}>Add Price</button><button onClick={restoreStarterCatalog}>Restore Starter Catalog</button><button onClick={exportCsv}>Export CSV</button></div></div><input className="full-input" placeholder="Search Walmart milk, United tortillas, meat, spices..." value={query} onChange={e => setQuery(e.target.value)} /><table><thead><tr><th>Store</th><th>Item</th><th>Brand/Size</th><th>Category</th><th>Price</th><th>Checked</th><th>Delete</th></tr></thead><tbody>{filtered.map(p => <tr key={p.id}><td>{p.store}<br /><small>{p.storeName ?? p.storeZip}</small></td><td>{p.name}</td><td>{p.brand ?? ''} {p.size ? `· ${p.size}` : ''}</td><td>{p.category}</td><td>{money(p.price)}</td><td>{p.lastChecked}</td><td><button className="icon-danger" onClick={() => removePrice(p.id)}><Trash2 size={14} /> Delete</button></td></tr>)}</tbody></table></div>;
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
    const missing = meal.ingredients.filter((ingredient) => !ingredient.pantryCovered);
    if (!missing.length) { alert('All ingredients are marked as pantry-covered. Nothing new to add to the grocery list.'); return; }
    const defaultListName = data.shoppingLists.find((list) => list.type === 'meal_plan')?.name ?? 'Meal Plan Grocery List';
    const listName = clean(prompt('Add missing ingredients to which grocery list?', defaultListName), defaultListName);
    let target = data.shoppingLists.find((list) => list.name.toLowerCase() === listName.toLowerCase());
    const newItems: ShoppingItem[] = missing.map((ingredient) => ({
      id: uid('item'),
      name: ingredient.name,
      quantity: 1,
      estimatedPrice: ingredient.estimatedPrice,
      checked: false,
      store: ingredient.store,
      category: ingredient.category,
      notes: `${meal.name} · ${ingredient.quantity} ${ingredient.unit}${ingredient.notes ? ` · ${ingredient.notes}` : ''}`,
      source: 'meal_plan',
      sourceMealId: meal.id,
      sourceIngredientId: ingredient.id
    }));
    const nextLists = target
      ? data.shoppingLists.map((list) => list.id === target?.id ? { ...list, items: [...list.items, ...newItems.filter((item) => !list.items.some((existing) => existing.sourceIngredientId === item.sourceIngredientId))] } : list)
      : [...data.shoppingLists, { id: uid('list'), name: listName, type: 'meal_plan' as const, sharedWith: data.users.map((u) => u.id), items: newItems }];
    update({ ...data, shoppingLists: nextLists });
  }
  return <div className="meal-page">
    <div className="card wide"><div className="split"><div><h3>Meal Planner</h3><p className="muted">Plan meals, mark which ingredients are already covered by pantry inventory, and send only the missing ingredients to a grocery list. Each meal shows total value and new grocery cost.</p></div><div className="settings-actions"><button className="primary" onClick={addMeal}><CookingPot size={16} /> Add Meal</button></div></div><div className="totals"><span>Planned meals: <strong>{data.mealPlans.length}</strong></span><span>Total food value: <strong>{money(allMealTotalCost(data.mealPlans))}</strong></span><span>New grocery cost: <strong>{money(allMealGroceryCost(data.mealPlans))}</strong></span></div></div>
    <div className="grid two">{meals.map((meal) => <div className="card meal-card" key={meal.id}><div className="split"><div><p className="label">{meal.date} · {meal.mealType} · {meal.servings} serving(s)</p><h3>{meal.name}</h3><p>{meal.notes}</p></div><button className="icon-danger" onClick={() => deleteMeal(meal.id)}><Trash2 size={14} /> Delete Meal</button></div><div className="meal-costs"><span>Total: <strong>{money(mealTotalCost(meal))}</strong></span><span>Pantry covered: <strong>{money(mealPantryCoveredCost(meal))}</strong></span><span>Need to buy: <strong>{money(mealGroceryCost(meal))}</strong></span></div><div className="settings-actions"><button onClick={() => addIngredient(meal.id)}>Add Ingredient</button><button onClick={() => addMealToGroceryList(meal)}>Add Missing to Grocery List</button></div><ul className="ingredient-list">{meal.ingredients.map((ingredient) => <li key={ingredient.id}><div><strong>{ingredient.name}</strong><small>{ingredient.quantity} {ingredient.unit} · {ingredient.category ?? 'Other'} · {ingredient.pantryCovered ? 'pantry covered' : 'buy'} · {money(ingredient.estimatedPrice)} {ingredient.store ? `· ${ingredient.store}` : ''}</small></div><button className="icon-danger" onClick={() => deleteIngredient(meal.id, ingredient.id)}><Trash2 size={14} /> Delete</button></li>)}</ul></div>)}</div>
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
function SettingsPage({ data, update }: { data: AppData; update: (d: AppData) => void }) {
  const backup = useMemo(() => JSON.stringify(data, null, 2), [data]);
  function exportBackup() { downloadText('homelife-backup.json', backup); }
  function importBackup(event: React.ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; file.text().then((text) => update(normalizeData(JSON.parse(text)))).catch(() => alert('Unable to import JSON backup.')); }
  function reset() { if (!confirm('Reset local HomeLife demo data?')) return; resetData(); window.location.reload(); }
  return <div className="card wide"><h3>Settings & Permissions</h3><p className="muted">Demo roles hide finance pages in the interface now. Meal planner, pantry, shopping, and prices remain visible/shared so the family can plan groceries without exposing the register.</p><table><thead><tr><th>User</th><th>Role</th><th>Register/Budget/Debt</th><th>Statement Import</th><th>Meals/Pantry/Shopping/Prices</th></tr></thead><tbody>{data.users.map(u => <tr key={u.id}><td>{u.name}</td><td>{u.role.replace('_', ' ')}</td><td>{financeRoles.includes(u.role) ? 'Visible' : 'Hidden'}</td><td>{financeRoles.includes(u.role) ? 'Visible' : 'Hidden'}</td><td>Visible/shared</td></tr>)}</tbody></table><div className="settings-actions"><button onClick={exportBackup}>Export JSON Backup</button><label className="button-like">Import JSON Backup<input type="file" accept="application/json" onChange={importBackup} hidden /></label><button className="danger" onClick={reset}>Reset Demo Data</button></div></div>;
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
