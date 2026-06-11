# HomeLife

**Budget, shop, and plan your household in one place.**

HomeLife is a starter React/Vite household finance and shopping-list app designed for GitHub Pages hosting.

## Current starter features

- Local demo login with roles
- Dashboard
- Budget overview
- Check register
- Debt tracker
- Shared shopping lists
- Grocery/Sam's/school/custom list support
- Estimated and actual list totals
- In-store check-off mode
- Role-based hiding of finance modules
- Local-storage persistence
- JSON backup export/import

## Demo users

No real authentication is included yet. This starter uses local demo roles until Supabase/Firebase is added.

- Owner/Admin: full access
- Financial Manager: finance + lists
- Household Member: lists only
- Child: assigned lists only

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## GitHub Pages

The Vite base path is already set to `/homelife/` in `vite.config.ts`.

Suggested repo name: `homelife`

After pushing to GitHub, enable Pages for the built output or add a GitHub Actions workflow.

## Next recommended phase

1. Add Supabase Auth
2. Add real user accounts
3. Add row-level security permissions
4. Import the current Excel budget workbook
5. Add cash-flow forecasting from recurring transactions
