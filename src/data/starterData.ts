import type { AppData } from '../types';

export const starterData: AppData = {
  currentUserId: 'u1',
  users: [
    { id: 'u1', name: 'Jason', role: 'owner' },
    { id: 'u2', name: 'Financial Manager', role: 'financial_manager' },
    { id: 'u3', name: 'Household Member', role: 'household_member' },
    { id: 'u4', name: 'Child', role: 'child' }
  ],
  accounts: [
    { id: 'a1', name: 'Checking', type: 'checking', startingBalance: 2500 },
    { id: 'a2', name: 'Savings', type: 'savings', startingBalance: 1000 }
  ],
  transactions: [
    { id: 't1', accountId: 'a1', date: '2026-06-01', description: 'Salary', category: 'Income', amount: 3200, cleared: true },
    { id: 't2', accountId: 'a1', date: '2026-06-02', description: 'Mortgage Payment', category: 'Housing', amount: -1314.78, cleared: true },
    { id: 't3', accountId: 'a1', date: '2026-06-04', description: 'Grocery Budget', category: 'Groceries', amount: -250, cleared: false }
  ],
  budgetCategories: [
    { id: 'b1', name: 'Groceries', monthlyBudget: 700 },
    { id: 'b2', name: 'Mortgage', monthlyBudget: 1314.78 },
    { id: 'b3', name: 'Utilities', monthlyBudget: 450 },
    { id: 'b4', name: 'Daycare', monthlyBudget: 620 }
  ],
  debts: [
    { id: 'd1', name: 'Mortgage', balance: 281089, payment: 1314.78, rate: 2.99 },
    { id: 'd2', name: 'Car Loan', balance: 9500, payment: 425, rate: 5.75 }
  ],
  priceCatalog: [
    { id: 'p1', store: 'Walmart', storeZip: '79015', name: 'Milk', brand: 'Great Value', size: '1 gal', category: 'Dairy', price: 3.52, lastChecked: '2026-06-11', notes: 'Manual starter estimate' },
    { id: 'p2', store: 'Walmart', storeZip: '79015', name: 'Eggs', brand: 'Great Value', size: '18 ct', category: 'Dairy', price: 4.36, lastChecked: '2026-06-11', notes: 'Manual starter estimate' },
    { id: 'p3', store: 'Walmart', storeZip: '79015', name: 'Chicken breast', brand: 'Freshness Guaranteed', size: 'per lb', category: 'Meat', price: 3.48, lastChecked: '2026-06-11', notes: 'Use quantity as lbs' },
    { id: 'p4', store: "Sam's", storeZip: '79119', name: 'Paper towels', brand: "Member's Mark", size: '15 rolls', category: 'Household', price: 19.98, lastChecked: '2026-06-11' }
  ],
  shoppingLists: [
    {
      id: 'l1', name: 'Weekly Groceries', type: 'grocery', sharedWith: ['u1', 'u2', 'u3'],
      items: [
        { id: 'i1', name: 'Milk', quantity: 2, estimatedPrice: 3.52, checked: false, store: 'Walmart', category: 'Dairy', source: 'price_catalog' },
        { id: 'i2', name: 'Eggs', quantity: 1, estimatedPrice: 4.36, checked: false, store: 'Walmart', category: 'Dairy', source: 'price_catalog' },
        { id: 'i3', name: 'Chicken breast', quantity: 3, estimatedPrice: 3.48, checked: true, store: 'Walmart', category: 'Meat', source: 'price_catalog' }
      ]
    },
    { id: 'l2', name: "Sam's Run", type: 'sams', sharedWith: ['u1', 'u3'], items: [{ id: 'i4', name: 'Paper towels', quantity: 1, estimatedPrice: 19.98, checked: false, store: "Sam's", category: 'Household', source: 'price_catalog' }] }
  ],
  statementImports: []
};
