import React, { Component, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { loadData, resetData, saveData } from './services/storage';
import type { AppData, PriceCatalogItem, Role, ShoppingItem, ShoppingList, StatementImportRow } from './types';
import './styles.css';

const financeRoles: Role[] = ['owner', 'financial_manager'];

function money(value: number) { return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' }); }
function uid(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function today() { return new Date().toISOString().slice(0, 10); }

function asArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeRole(value: unknown): Role {
  return value === 'owner' || value === 'financial_manager' || value === 'household_member' || value === 'child'
    ? value
    : 'household_member';
}

function normalizeData(data: Partial<AppData> | null | undefined): AppData {
  const safe = (data ?? {}) as Partial<AppData>;
  const users = asArray(safe.users).map((u, index) => ({
    id: String(u?.id || `user-${index + 1}`),
    name: String(u?.name || `User ${index + 1}`),
    role: normalizeRole(u?.role)
  }));
  const finalUsers = users.length
    ? users
    : [
        { id: 'u1', name: 'Jason', role: 'owner' as Role },
        { id: 'u3', name: 'Household Member', role: 'household_member' as Role }
      ];

  return {
    users: finalUsers,
    currentUserId: safe.currentUserId && finalUsers.some((u) => u.id === safe.currentUserId) ? safe.currentUserId : finalUsers[0].id,
    accounts: asArray(safe.accounts).map((a, index) => ({
      id: String(a?.id || `account-${index + 1}`),
      name: String(a?.name || `Account ${index + 1}`),
      type: a?.type === 'checking' || a?.type === 'savings' || a?.type === 'credit' || a?.type === 'cash' ? a.type : 'checking',
      startingBalance: asNumber(a?.startingBalance)
    })),
    transactions: asArray(safe.transactions).map((t, index) => ({
      id: String(t?.id || `transaction-${index + 1}`),
      accountId: String(t?.accountId || ''),
      date: String(t?.date || today()),
      description: String(t?.description || 'Imported transaction'),
      category: String(t?.category || 'Uncategorized'),
      amount: asNumber(t?.amount),
      cleared: Boolean(t?.cleared)
    })),
    budgetCategories: asArray(safe.budgetCategories).map((c, index) => ({
      id: String(c?.id || `budget-${index + 1}`),
      name: String(c?.name || 'Uncategorized'),
      monthlyBudget: asNumber(c?.monthlyBudget)
    })),
    debts: asArray(safe.debts).map((d, index) => ({
      id: String(d?.id || `debt-${index + 1}`),
      name: String(d?.name || `Debt ${index + 1}`),
      balance: asNumber(d?.balance),
      payment: asNumber(d?.payment),
      rate: asNumber(d?.rate)
    })),
    shoppingLists: asArray(safe.shoppingLists).map((l, index) => ({
      id: String(l?.id || `list-${index + 1}`),
      name: String(l?.name || `Shopping List ${index + 1}`),
      type: l?.type === 'grocery' || l?.type === 'sams' || l?.type === 'school' || l?.type === 'custom' ? l.type : 'custom',
      sharedWith: asArray(l?.sharedWith).map(String),
      items: asArray(l?.items).map((item, itemIndex) => ({
        id: String(item?.id || `item-${index + 1}-${itemIndex + 1}`),
        name: String(item?.name || 'Item'),
        quantity: asNumber(item?.quantity, 1),
        estimatedPrice: asNumber(item?.estimatedPrice),
        actualPrice: item?.actualPrice === undefined ? undefined : asNumber(item.actualPrice),
        checked: Boolean(item?.checked),
        store: item?.store ? String(item.store) : undefined,
        category: item?.category ? String(item.category) : undefined,
        notes: item?.notes ? String(item.notes) : undefined,
        source: item?.source === 'manual' || item?.source === 'price_catalog' || item?.source === 'imported' ? item.source : 'manual'
      }))
    })),
    priceCatalog: asArray(safe.priceCatalog).map((p, index) => ({
      id: String(p?.id || `price-${index + 1}`),
      store: p?.store === 'Walmart' || p?.store === "Sam's" || p?.store === 'Target' || p?.store === 'Other' ? p.store : 'Other',
      storeZip: p?.storeZip ? String(p.storeZip) : undefined,
      name: String(p?.name || 'Item'),
      brand: p?.brand ? String(p.brand) : undefined,
      size: p?.size ? String(p.size) : undefined,
      category: p?.category ? String(p.category) : undefined,
      price: asNumber(p?.price),
      lastChecked: String(p?.lastChecked || today()),
      notes: p?.notes ? String(p.notes) : undefined
    })),
    statementImports: asArray(safe.statementImports).map((r, index) => ({
      id: String(r?.id || `statement-${index + 1}`),
      date: String(r?.date || today()),
      description: String(r?.description || 'Imported transaction'),
      amount: asNumber(r?.amount),
      type: r?.type === 'credit' ? 'credit' : 'debit',
      matchedTransactionId: r?.matchedTransactionId ? String(r.matchedTransactionId) : undefined,
      matchStatus: r?.matchStatus === 'matched' || r?.matchStatus === 'possible' || r?.matchStatus === 'missing_from_register' ? r.matchStatus : 'missing_from_register'
    }))
  };
}

function App() {
  useEffect(() => {
    const root = document.getElementById('root');
    if (root) root.dataset.homelifeMounted = 'true';
  }, []);
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

  function update(next: AppData) { const normalized = normalizeData(next); setData(normalized); saveData(normalized); }

  const nav = [
    { id: 'dashboard', label: 'Dashboard', icon: '🏠', show: true },
    { id: 'register', label: 'Register', icon: '💳', show: canViewFinance },
    { id: 'budget', label: 'Budget', icon: '📊', show: canViewFinance },
    { id: 'debt', label: 'Debt', icon: '🏦', show: canViewFinance },
    { id: 'reconcile', label: 'Statement Import', icon: '🔎', show: canViewFinance },
    { id: 'prices', label: 'Price Catalog', icon: '🏷️', show: true },
    { id: 'shopping', label: 'Shopping Lists', icon: '🛒', show: true },
    { id: 'settings', label: 'Settings', icon: '⚙️', show: true }
  ];

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-card"><div className="brand-mark">HL</div><div><h1>HomeLife</h1><p>Budget, shop, and plan your household in one place.</p></div></div>
      <nav>{nav.filter((n) => n.show).map((n) => <button key={n.id} className={page === n.id ? 'active' : ''} onClick={() => setPage(n.id)}><span aria-hidden="true">{n.icon}</span> {n.label}</button>)}</nav>
      {!canViewFinance && <div className="privacy-note"><span aria-hidden="true">🔒</span> Register, budget, debt, and statements are hidden for this role.</div>}
    </aside>
    <main>
      <header className="topbar"><div><h2>{nav.find((n) => n.id === page)?.label ?? 'Dashboard'}</h2><p>Signed in as <strong>{currentUser.name}</strong> · {currentUser.role.replace('_', ' ')}</p></div><select value={data.currentUserId} onChange={(e) => update({ ...data, currentUserId: e.target.value })}>{data.users.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.role.replace('_', ' ')}</option>)}</select></header>
      {page === 'dashboard' && <Dashboard data={data} canViewFinance={canViewFinance} />}
      {page === 'register' && canViewFinance && <Register data={data} update={update} />}
      {page === 'budget' && canViewFinance && <Budget data={data} />}
      {page === 'debt' && canViewFinance && <Debt data={data} />}
      {page === 'reconcile' && canViewFinance && <StatementImport data={data} update={update} />}
      {page === 'prices' && <PriceCatalog data={data} update={update} />}
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
    {canViewFinance ? <Card title="Household Balance" value={money(accountTotal)} detail="Across starter accounts" /> : <Card title="Finance Hidden" value="Private" detail="Your role can use shared lists and prices only." />}
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
  return <div className="card wide"><h3>Check Register</h3><p className="muted">Private finance area. Restricted profiles cannot see this menu or data.</p><table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th><th>Cleared</th></tr></thead><tbody>{data.transactions.map(t => <tr key={t.id}><td>{t.date}</td><td>{t.description}</td><td>{t.category}</td><td className={t.amount < 0 ? 'negative' : 'positive'}>{money(t.amount)}</td><td><input type="checkbox" checked={t.cleared} onChange={() => toggleCleared(t.id)} /></td></tr>)}</tbody></table></div>;
}
function Budget({ data }: { data: AppData }) { return <div className="card wide"><h3>Budget</h3><table><thead><tr><th>Category</th><th>Monthly Budget</th><th>Actual</th><th>Remaining</th></tr></thead><tbody>{data.budgetCategories.map(c => { const actual = Math.abs(data.transactions.filter(t => t.category === c.name && t.amount < 0).reduce((s, t) => s + t.amount, 0)); return <tr key={c.id}><td>{c.name}</td><td>{money(c.monthlyBudget)}</td><td>{money(actual)}</td><td>{money(c.monthlyBudget - actual)}</td></tr>; })}</tbody></table></div>; }
function Debt({ data }: { data: AppData }) { return <div className="card wide"><h3>Debt Tracker</h3><table><thead><tr><th>Debt</th><th>Balance</th><th>Payment</th><th>Rate</th></tr></thead><tbody>{data.debts.map(d => <tr key={d.id}><td>{d.name}</td><td>{money(d.balance)}</td><td>{money(d.payment)}</td><td>{d.rate}%</td></tr>)}</tbody></table></div>; }

function PriceCatalog({ data, update }: { data: AppData; update: (d: AppData) => void }) {
  const [query, setQuery] = useState('');
  const filtered = data.priceCatalog.filter(p => `${p.name} ${p.brand ?? ''} ${p.store} ${p.category ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  function addPrice() {
    const name = prompt('Product name? Example: Milk'); if (!name) return;
    const store = (prompt('Store? Walmart, Sam\'s, Target, Other', 'Walmart') || 'Walmart') as PriceCatalogItem['store'];
    const price = Number(prompt('Price?', '0') ?? '0');
    const item: PriceCatalogItem = { id: uid('price'), store, storeZip: prompt('ZIP or store area?', '79015') || undefined, name, brand: prompt('Brand?', '') || undefined, size: prompt('Size?', '') || undefined, category: prompt('Category?', '') || undefined, price: Number.isFinite(price) ? price : 0, lastChecked: today(), notes: 'Manual entry' };
    update({ ...data, priceCatalog: [...data.priceCatalog, item] });
  }
  function removePrice(id: string) { if (confirm('Remove this price record?')) update({ ...data, priceCatalog: data.priceCatalog.filter(p => p.id !== id) }); }
  function exportCsv() {
    const rows = [['store','zip','name','brand','size','category','price','lastChecked','notes'], ...data.priceCatalog.map(p => [p.store, p.storeZip ?? '', p.name, p.brand ?? '', p.size ?? '', p.category ?? '', String(p.price), p.lastChecked, p.notes ?? ''])];
    downloadText('homelife-price-catalog.csv', rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n'));
  }
  return <div className="card wide"><div className="split"><div><h3>Local Price Catalog</h3><p className="muted">Use this now for close grocery projections. Later, this page can call a Supabase Edge Function for approved Walmart pricing lookup without scraping.</p></div><div className="settings-actions"><button onClick={addPrice}>Add Price</button><button onClick={exportCsv}>Export CSV</button></div></div><input className="full-input" placeholder="Search Walmart milk, eggs, Sam's, school supplies..." value={query} onChange={e => setQuery(e.target.value)} /><table><thead><tr><th>Store</th><th>Item</th><th>Brand/Size</th><th>Category</th><th>Price</th><th>Checked</th><th></th></tr></thead><tbody>{filtered.map(p => <tr key={p.id}><td>{p.store}<br /><small>{p.storeZip}</small></td><td>{p.name}</td><td>{p.brand ?? ''} {p.size ? `· ${p.size}` : ''}</td><td>{p.category}</td><td>{money(p.price)}</td><td>{p.lastChecked}</td><td><button onClick={() => removePrice(p.id)}>Remove</button></td></tr>)}</tbody></table></div>;
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
  function downloadSanitized() { const rows = [['date','description','amount','type','matchStatus'], ...data.statementImports.map(r => [r.date, r.description, String(r.amount), r.type, r.matchStatus])]; downloadText('homelife-sanitized-statement.csv', rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')); }
  return <div className="card wide"><h3>Bank Statement Import & Reconciliation</h3><p className="muted">Privacy design: the raw bank file is read in your browser only. HomeLife stores only sanitized rows: date, cleaned description, amount, and match status. Account/routing numbers are not needed.</p><div className="settings-actions"><label className="button-like">Load CSV Statement<input type="file" accept=".csv,text/csv" onChange={handleFile} hidden /></label><button onClick={downloadSanitized}>Export Sanitized CSV</button><button className="danger" onClick={clear}>Clear Imported Rows</button></div><table><thead><tr><th>Date</th><th>Sanitized Description</th><th>Amount</th><th>Status</th></tr></thead><tbody>{data.statementImports.map(r => <tr key={r.id}><td>{r.date}</td><td>{r.description}</td><td className={r.amount < 0 ? 'negative' : 'positive'}>{money(r.amount)}</td><td><span className={`pill ${r.matchStatus}`}>{r.matchStatus.replace(/_/g, ' ')}</span></td></tr>)}</tbody></table></div>;
}

function listEstimatedTotal(list: ShoppingList) { return list.items.reduce((sum, item) => sum + item.quantity * item.estimatedPrice, 0); }
function listActualTotal(list: ShoppingList) { return list.items.reduce((sum, item) => sum + item.quantity * (item.actualPrice ?? item.estimatedPrice), 0); }
function Shopping({ data, update }: { data: AppData; update: (d: AppData) => void }) {
  const currentUser = data.users.find((u) => u.id === data.currentUserId)!;
  const visibleLists = data.shoppingLists.filter(l => currentUser.role === 'owner' || l.sharedWith.includes(currentUser.id));
  function toggleItem(listId: string, itemId: string) { update({ ...data, shoppingLists: data.shoppingLists.map(list => list.id === listId ? { ...list, items: list.items.map(item => item.id === itemId ? { ...item, checked: !item.checked } : item) } : list) }); }
  function addList() { const name = prompt('List name? Example: School Shopping'); if (!name) return; update({ ...data, shoppingLists: [...data.shoppingLists, { id: uid('list'), name, type: 'custom', sharedWith: data.users.map(u => u.id), items: [] }] }); }
  function addItem(listId: string) { const search = prompt('Item name? This will try to use your price catalog.'); if (!search) return; const found = data.priceCatalog.find(p => p.name.toLowerCase().includes(search.toLowerCase()) || search.toLowerCase().includes(p.name.toLowerCase())); const price = found ? found.price : Number(prompt('Estimated item price?', '0') ?? '0'); const qty = Number(prompt(found?.size?.includes('per lb') ? 'Quantity / pounds?' : 'Quantity?', '1') ?? '1'); const item: ShoppingItem = { id: uid('item'), name: found?.name ?? search, quantity: Number.isFinite(qty) ? qty : 1, estimatedPrice: Number.isFinite(price) ? price : 0, checked: false, store: found?.store, category: found?.category, notes: found ? `${found.brand ?? ''} ${found.size ?? ''}`.trim() : undefined, source: found ? 'price_catalog' : 'manual' }; update({ ...data, shoppingLists: data.shoppingLists.map(l => l.id === listId ? { ...l, items: [...l.items, item] } : l) }); }
  return <div className="shopping-page"><div className="actions"><button className="primary" onClick={addList}>Add Shopping List</button></div><div className="grid two">{visibleLists.map(list => <div className="card" key={list.id}><div className="list-header"><div><p className="label">{list.type}</p><h3>{list.name}</h3></div><button onClick={() => addItem(list.id)}>Add Item</button></div><div className="totals"><span>Estimated: <strong>{money(listEstimatedTotal(list))}</strong></span><span>Actual/Projected: <strong>{money(listActualTotal(list))}</strong></span></div><ul className="shopping-list">{list.items.map(item => <li key={item.id} className={item.checked ? 'checked' : ''}><label><input type="checkbox" checked={item.checked} onChange={() => toggleItem(list.id, item.id)} /> <span>{item.name}</span></label><small>{item.quantity} × {money(item.estimatedPrice)} {item.store ? `· ${item.store}` : ''} {item.notes ? `· ${item.notes}` : ''}</small></li>)}</ul></div>)}</div></div>;
}

function downloadText(filename: string, text: string) { const blob = new Blob([text], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
function SettingsPage({ data, update }: { data: AppData; update: (d: AppData) => void }) {
  const backup = useMemo(() => JSON.stringify(data, null, 2), [data]);
  function exportBackup() { downloadText('homelife-backup.json', backup); }
  function importBackup(event: React.ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; file.text().then((text) => update(normalizeData(JSON.parse(text)))); }
  function reset() { if (!confirm('Reset local HomeLife demo data?')) return; resetData(); window.location.reload(); }
  return <div className="card wide"><h3>Settings & Permissions</h3><p className="muted">Demo roles hide finance pages in the interface now. When Supabase is connected, enforce the same restrictions with Row Level Security policies.</p><table><thead><tr><th>User</th><th>Role</th><th>Register/Budget/Debt</th><th>Statement Import</th><th>Shopping/Prices</th></tr></thead><tbody>{data.users.map(u => <tr key={u.id}><td>{u.name}</td><td>{u.role.replace('_', ' ')}</td><td>{financeRoles.includes(u.role) ? 'Visible' : 'Hidden'}</td><td>{financeRoles.includes(u.role) ? 'Visible' : 'Hidden'}</td><td>Visible/shared</td></tr>)}</tbody></table><div className="settings-actions"><button onClick={exportBackup}>Export JSON Backup</button><label className="button-like">Import JSON Backup<input type="file" accept="application/json" onChange={importBackup} hidden /></label><button className="danger" onClick={reset}>Reset Demo Data</button></div></div>;
}


function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
}

function showStartupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const root = document.getElementById('root');
  if (root) {
    root.dataset.homelifeMounted = 'true';
    root.innerHTML = `<div style="font-family:system-ui;padding:24px;max-width:900px;margin:auto"><h1>HomeLife startup error</h1><p>The app loaded, but React hit an error before it could render.</p><pre style="white-space:pre-wrap;background:#fee2e2;border:1px solid #fecaca;padding:16px;border-radius:12px">${escapeHtml(message)}</pre><p>Try clearing this site's browser storage for HomeLife, then refresh.</p></div>`;
  }
}

class ErrorBoundary extends Component<{ children: React.ReactNode }, { error?: Error }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {};
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('HomeLife render failed', error);
  }

  render() {
    if (this.state.error) {
      return <div className="startup-error">
        <h1>HomeLife startup error</h1>
        <p>The app loaded, but something in the saved data or screen render failed.</p>
        <pre>{this.state.error.message}</pre>
        <button onClick={() => { resetData(); window.location.reload(); }}>Clear HomeLife saved demo data and reload</button>
      </div>;
    }
    return this.props.children;
  }
}

window.addEventListener('error', (event) => showStartupError(event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => showStartupError(event.reason));

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('HomeLife could not start because index.html is missing <div id="root"></div>.');
}

try {
  createRoot(rootElement).render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>);
} catch (error) {
  console.error('HomeLife startup failed', error);
  showStartupError(error);
}
