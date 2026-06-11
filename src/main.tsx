import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Home, WalletCards, ShoppingCart, Settings, BarChart3, Landmark, EyeOff } from 'lucide-react';
import { loadData, resetData, saveData } from './services/storage';
import type { AppData, Role, ShoppingItem, ShoppingList } from './types';
import './styles.css';

const financeRoles: Role[] = ['owner', 'financial_manager'];

function money(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [page, setPage] = useState('dashboard');
  const currentUser = data.users.find((u) => u.id === data.currentUserId) ?? data.users[0];
  const canViewFinance = financeRoles.includes(currentUser.role);

  function update(next: AppData) {
    setData(next);
    saveData(next);
  }

  const nav = [
    { id: 'dashboard', label: 'Dashboard', icon: Home, show: true },
    { id: 'register', label: 'Register', icon: WalletCards, show: canViewFinance },
    { id: 'budget', label: 'Budget', icon: BarChart3, show: canViewFinance },
    { id: 'debt', label: 'Debt', icon: Landmark, show: canViewFinance },
    { id: 'shopping', label: 'Shopping Lists', icon: ShoppingCart, show: true },
    { id: 'settings', label: 'Settings', icon: Settings, show: true }
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-card">
          <div className="brand-mark">HL</div>
          <div>
            <h1>HomeLife</h1>
            <p>Budget, shop, and plan your household in one place.</p>
          </div>
        </div>
        <nav>
          {nav.filter((n) => n.show).map((n) => {
            const Icon = n.icon;
            return (
              <button key={n.id} className={page === n.id ? 'active' : ''} onClick={() => setPage(n.id)}>
                <Icon size={18} /> {n.label}
              </button>
            );
          })}
        </nav>
        {!canViewFinance && (
          <div className="privacy-note"><EyeOff size={16} /> Finance areas are hidden for this role.</div>
        )}
      </aside>

      <main>
        <header className="topbar">
          <div>
            <h2>{nav.find((n) => n.id === page)?.label ?? 'Dashboard'}</h2>
            <p>Signed in as <strong>{currentUser.name}</strong> · {currentUser.role.replace('_', ' ')}</p>
          </div>
          <select value={data.currentUserId} onChange={(e) => update({ ...data, currentUserId: e.target.value })}>
            {data.users.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.role.replace('_', ' ')}</option>)}
          </select>
        </header>

        {page === 'dashboard' && <Dashboard data={data} canViewFinance={canViewFinance} />}
        {page === 'register' && canViewFinance && <Register data={data} update={update} />}
        {page === 'budget' && canViewFinance && <Budget data={data} />}
        {page === 'debt' && canViewFinance && <Debt data={data} />}
        {page === 'shopping' && <Shopping data={data} update={update} />}
        {page === 'settings' && <SettingsPage data={data} update={update} />}
      </main>
    </div>
  );
}

function Dashboard({ data, canViewFinance }: { data: AppData; canViewFinance: boolean }) {
  const accountTotal = data.accounts.reduce((sum, a) => sum + a.startingBalance + data.transactions.filter(t => t.accountId === a.id).reduce((s, t) => s + t.amount, 0), 0);
  const shoppingTotal = data.shoppingLists.reduce((sum, l) => sum + listEstimatedTotal(l), 0);
  const remainingItems = data.shoppingLists.reduce((sum, l) => sum + l.items.filter(i => !i.checked).length, 0);

  return <section className="grid two">
    {canViewFinance ? <Card title="Household Balance" value={money(accountTotal)} detail="Across starter accounts" /> : <Card title="Finance Hidden" value="Private" detail="Your role can use shared lists only." />}
    <Card title="Shopping Estimate" value={money(shoppingTotal)} detail={`${remainingItems} item(s) still needed`} />
    {canViewFinance && <Card title="Monthly Budget" value={money(data.budgetCategories.reduce((s, c) => s + c.monthlyBudget, 0))} detail="Starter budget categories" />}
    {canViewFinance && <Card title="Debt Balance" value={money(data.debts.reduce((s, d) => s + d.balance, 0))} detail="Mortgage, loans, credit cards" />}
  </section>;
}

function Card({ title, value, detail }: { title: string; value: string; detail: string }) {
  return <div className="card"><p className="label">{title}</p><h3>{value}</h3><p>{detail}</p></div>;
}

function Register({ data, update }: { data: AppData; update: (d: AppData) => void }) {
  function toggleCleared(id: string) {
    update({ ...data, transactions: data.transactions.map(t => t.id === id ? { ...t, cleared: !t.cleared } : t) });
  }

  return <div className="card wide">
    <h3>Check Register</h3>
    <p className="muted">Starter register. Next step: import your Excel rows and add recurring transaction forecasting.</p>
    <table>
      <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th><th>Cleared</th></tr></thead>
      <tbody>{data.transactions.map(t => <tr key={t.id}><td>{t.date}</td><td>{t.description}</td><td>{t.category}</td><td className={t.amount < 0 ? 'negative' : 'positive'}>{money(t.amount)}</td><td><input type="checkbox" checked={t.cleared} onChange={() => toggleCleared(t.id)} /></td></tr>)}</tbody>
    </table>
  </div>;
}

function Budget({ data }: { data: AppData }) {
  return <div className="card wide">
    <h3>Budget</h3>
    <table><thead><tr><th>Category</th><th>Monthly Budget</th><th>Actual</th><th>Remaining</th></tr></thead>
      <tbody>{data.budgetCategories.map(c => {
        const actual = Math.abs(data.transactions.filter(t => t.category === c.name && t.amount < 0).reduce((s, t) => s + t.amount, 0));
        return <tr key={c.id}><td>{c.name}</td><td>{money(c.monthlyBudget)}</td><td>{money(actual)}</td><td>{money(c.monthlyBudget - actual)}</td></tr>;
      })}</tbody></table>
  </div>;
}

function Debt({ data }: { data: AppData }) {
  return <div className="card wide">
    <h3>Debt Tracker</h3>
    <table><thead><tr><th>Debt</th><th>Balance</th><th>Payment</th><th>Rate</th></tr></thead>
      <tbody>{data.debts.map(d => <tr key={d.id}><td>{d.name}</td><td>{money(d.balance)}</td><td>{money(d.payment)}</td><td>{d.rate}%</td></tr>)}</tbody></table>
  </div>;
}

function listEstimatedTotal(list: ShoppingList) {
  return list.items.reduce((sum, item) => sum + item.quantity * item.estimatedPrice, 0);
}

function listActualTotal(list: ShoppingList) {
  return list.items.reduce((sum, item) => sum + item.quantity * (item.actualPrice ?? item.estimatedPrice), 0);
}

function Shopping({ data, update }: { data: AppData; update: (d: AppData) => void }) {
  const currentUser = data.users.find((u) => u.id === data.currentUserId)!;
  const visibleLists = data.shoppingLists.filter(l => currentUser.role === 'owner' || l.sharedWith.includes(currentUser.id));

  function toggleItem(listId: string, itemId: string) {
    update({ ...data, shoppingLists: data.shoppingLists.map(list => list.id === listId ? { ...list, items: list.items.map(item => item.id === itemId ? { ...item, checked: !item.checked } : item) } : list) });
  }

  function addList() {
    const name = prompt('List name? Example: School Shopping');
    if (!name) return;
    update({ ...data, shoppingLists: [...data.shoppingLists, { id: uid('list'), name, type: 'custom', sharedWith: data.users.map(u => u.id), items: [] }] });
  }

  function addItem(listId: string) {
    const name = prompt('Item name?');
    if (!name) return;
    const price = Number(prompt('Estimated item price?', '0') ?? '0');
    const item: ShoppingItem = { id: uid('item'), name, quantity: 1, estimatedPrice: Number.isFinite(price) ? price : 0, checked: false };
    update({ ...data, shoppingLists: data.shoppingLists.map(l => l.id === listId ? { ...l, items: [...l.items, item] } : l) });
  }

  return <div className="shopping-page">
    <div className="actions"><button className="primary" onClick={addList}>Add Shopping List</button></div>
    <div className="grid two">
      {visibleLists.map(list => <div className="card" key={list.id}>
        <div className="list-header"><div><p className="label">{list.type}</p><h3>{list.name}</h3></div><button onClick={() => addItem(list.id)}>Add Item</button></div>
        <div className="totals"><span>Estimated: <strong>{money(listEstimatedTotal(list))}</strong></span><span>Actual/Projected: <strong>{money(listActualTotal(list))}</strong></span></div>
        <ul className="shopping-list">
          {list.items.map(item => <li key={item.id} className={item.checked ? 'checked' : ''}>
            <label><input type="checkbox" checked={item.checked} onChange={() => toggleItem(list.id, item.id)} /> <span>{item.name}</span></label>
            <small>{item.quantity} × {money(item.estimatedPrice)} {item.store ? `· ${item.store}` : ''}</small>
          </li>)}
        </ul>
      </div>)}
    </div>
  </div>;
}

function SettingsPage({ data, update }: { data: AppData; update: (d: AppData) => void }) {
  const backup = useMemo(() => JSON.stringify(data, null, 2), [data]);

  function exportBackup() {
    const blob = new Blob([backup], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'homelife-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function importBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    file.text().then((text) => update(JSON.parse(text)));
  }

  function reset() {
    if (!confirm('Reset local HomeLife demo data?')) return;
    resetData();
    window.location.reload();
  }

  return <div className="card wide">
    <h3>Settings & Permissions</h3>
    <p className="muted">This starter uses demo roles only. Real login/password protection should be added with Supabase or Firebase before storing sensitive data online.</p>
    <table><thead><tr><th>User</th><th>Role</th><th>Finance Access</th><th>Shopping Lists</th></tr></thead>
      <tbody>{data.users.map(u => <tr key={u.id}><td>{u.name}</td><td>{u.role.replace('_', ' ')}</td><td>{financeRoles.includes(u.role) ? 'Visible' : 'Hidden'}</td><td>Shared lists</td></tr>)}</tbody></table>
    <div className="settings-actions"><button onClick={exportBackup}>Export JSON Backup</button><label className="button-like">Import JSON Backup<input type="file" accept="application/json" onChange={importBackup} hidden /></label><button className="danger" onClick={reset}>Reset Demo Data</button></div>
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
