import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Archive,
  BarChart3,
  CookingPot,
  EyeOff,
  FileSearch,
  Home,
  Landmark,
  Settings,
  ShoppingCart,
  Tags,
  Trash2,
  Utensils,
  WalletCards
} from 'lucide-react';
import { DEFAULT_DATA, loadData, resetData, saveData } from './services/storage';
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
  StatementImportRow
} from './types';
import './styles.css';

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

function normalizeData(data: Partial<AppData> | null | undefined): AppData {
  const safe = data ?? {};
  const fallback = DEFAULT_DATA;
  const users = safe.users?.length ? safe.users : fallback.users;
  return {
    users,
    currentUserId: safe.currentUserId && users.some((u) => u.id === safe.currentUserId) ? safe.currentUserId : users[0].id,
    accounts: safe.accounts ?? fallback.accounts,
    transactions: safe.transactions ?? fallback.transactions,
    budgetCategories: safe.budgetCategories ?? fallback.budgetCategories,
    debts: safe.debts ?? fallback.debts,
    shoppingLists: safe.shoppingLists ?? fallback.shoppingLists,
    priceCatalog: safe.priceCatalog ?? fallback.priceCatalog,
    statementImports: safe.statementImports ?? fallback.statementImports,
    pantryItems: safe.pantryItems ?? fallback.pantryItems,
    mealPlans: safe.mealPlans ?? fallback.mealPlans
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
  return items.reduce((sum, item) => sum + item.quantity * (item.estimatedUnitPrice ?? 0), 0);
}
function listEstimatedTotal(list: ShoppingList) { return list.items.reduce((sum, item) => sum + item.quantity * item.estimatedPrice, 0); }
function listActualTotal(list: ShoppingList) { return list.items.reduce((sum, item) => sum + item.quantity * (item.actualPrice ?? item.estimatedPrice), 0); }
function mealTotalCost(meal: MealPlanItem) { return meal.ingredients.reduce((sum, item) => sum + item.estimatedPrice, 0); }
function mealGroceryCost(meal: MealPlanItem) { return meal.ingredients.filter((item) => !item.pantryCovered).reduce((sum, item) => sum + item.estimatedPrice, 0); }
function mealPantryCoveredCost(meal: MealPlanItem) { return meal.ingredients.filter((item) => item.pantryCovered).reduce((sum, item) => sum + item.estimatedPrice, 0); }
function allMealGroceryCost(meals: MealPlanItem[]) { return meals.reduce((sum, meal) => sum + mealGroceryCost(meal), 0); }
function allMealTotalCost(meals: MealPlanItem[]) { return meals.reduce((sum, meal) => sum + mealTotalCost(meal), 0); }

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
  function toggleCleared(id: string) { update({ ...data, transactions: data.transactions.map(t => t.id === id ? { ...t, cleared: !t.cleared } : t) }); }
  function deleteTransaction(id: string) { if (confirm('Delete this transaction?')) update({ ...data, transactions: data.transactions.filter((t) => t.id !== id) }); }
  return <div className="card wide"><h3>Check Register</h3><p className="muted">Private finance area. Restricted profiles cannot see this menu or data.</p><table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th><th>Cleared</th><th>Delete</th></tr></thead><tbody>{data.transactions.map(t => <tr key={t.id}><td>{t.date}</td><td>{t.description}</td><td>{t.category}</td><td className={t.amount < 0 ? 'negative' : 'positive'}>{money(t.amount)}</td><td><input type="checkbox" checked={t.cleared} onChange={() => toggleCleared(t.id)} /></td><td><button className="icon-danger" onClick={() => deleteTransaction(t.id)}><Trash2 size={14} /> Delete</button></td></tr>)}</tbody></table></div>;
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
  const filtered = data.priceCatalog.filter(p => `${p.name} ${p.brand ?? ''} ${p.store} ${p.category ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  function addPrice() {
    const name = clean(prompt('Product name? Example: Milk')); if (!name) return;
    const store = clean(prompt('Store? Walmart, United Supermarkets, Sam\'s, Target, Other', 'Walmart'), 'Walmart');
    const price = promptNumber('Price?', 0);
    const item: PriceCatalogItem = { id: uid('price'), store, storeZip: clean(prompt('ZIP or store area?', '79015')) || undefined, name, brand: clean(prompt('Brand?', '')) || undefined, size: clean(prompt('Size?', '')) || undefined, category: clean(prompt(`Category? ${PANTRY_CATEGORIES.join(', ')}`, 'Other')) || undefined, price: Number.isFinite(price) ? price : 0, lastChecked: today(), notes: 'Manual entry' };
    update({ ...data, priceCatalog: [...data.priceCatalog, item] });
  }
  function removePrice(id: string) { if (confirm('Remove this price record?')) update({ ...data, priceCatalog: data.priceCatalog.filter(p => p.id !== id) }); }
  function exportCsv() {
    const rows = [['store','zip','name','brand','size','category','price','lastChecked','notes'], ...data.priceCatalog.map(p => [p.store, p.storeZip ?? '', p.name, p.brand ?? '', p.size ?? '', p.category ?? '', String(p.price), p.lastChecked, p.notes ?? ''])];
    downloadText('homelife-price-catalog.csv', rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'));
  }
  return <div className="card wide"><div className="split"><div><h3>Local Price Catalog</h3><p className="muted">Use this for grocery, pantry, and meal projections. Later, this page can call a Supabase Edge Function for approved Walmart/United pricing lookup without scraping.</p></div><div className="settings-actions"><button onClick={addPrice}>Add Price</button><button onClick={exportCsv}>Export CSV</button></div></div><input className="full-input" placeholder="Search Walmart milk, United tortillas, meat, spices..." value={query} onChange={e => setQuery(e.target.value)} /><table><thead><tr><th>Store</th><th>Item</th><th>Brand/Size</th><th>Category</th><th>Price</th><th>Checked</th><th>Delete</th></tr></thead><tbody>{filtered.map(p => <tr key={p.id}><td>{p.store}<br /><small>{p.storeZip}</small></td><td>{p.name}</td><td>{p.brand ?? ''} {p.size ? `· ${p.size}` : ''}</td><td>{p.category}</td><td>{money(p.price)}</td><td>{p.lastChecked}</td><td><button className="icon-danger" onClick={() => removePrice(p.id)}><Trash2 size={14} /> Delete</button></td></tr>)}</tbody></table></div>;
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

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('HomeLife could not start because index.html is missing <div id="root"></div>.');
createRoot(rootElement).render(<React.StrictMode><App /></React.StrictMode>);
