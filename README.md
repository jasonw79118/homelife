# HomeLife

**Budget, shop, and plan your household in one place.**

HomeLife is a React/Vite household finance and shopping-list app designed for GitHub Pages under:

```text
https://jasonw79118.github.io/homelife/
```

## Current features

- Dashboard
- Check register
- Budget overview
- Debt tracker
- Shared shopping lists
- Grocery, Sam's, school, and custom list support
- Estimated grocery/list totals using a local price catalog
- In-store check-off mode
- Bank statement CSV import and sanitized reconciliation review
- Role-based hiding of register, budget, debt, and statement import screens
- Local-storage persistence
- JSON backup export/import

## Important deployment fix in v1.1.3

The GitHub Actions workflow now deploys the prebuilt `docs` folder directly. This avoids the GitHub runner npm failure that showed:

```text
npm error Exit handler never called!
```

The production build has already been copied to `docs`, so the site can deploy without running `npm install` inside GitHub Actions.

## GitHub Pages setting

Use:

```text
Repository → Settings → Pages → Source → GitHub Actions
```

If you ever switch to branch deployment instead, choose:

```text
main / docs
```

## Run locally

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5173/homelife/
```

## Update the prebuilt GitHub Pages files after code changes

```bash
npm run build:docs
```

Then commit and push.

## Demo users

No real authentication is included yet. This starter uses local demo roles until Supabase Auth is added.

- Owner: full access
- Financial Manager: finance + lists
- Household Member: shared lists only
- Child: assigned/shared lists only

## Next recommended phase

1. Add Supabase Auth
2. Add real users and family accounts
3. Add Supabase Row Level Security for finance/private data
4. Import the current Excel budget workbook
5. Add cash-flow forecasting from recurring transactions
