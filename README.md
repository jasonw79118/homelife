# HomeLife

**Budget, shop, and plan your household in one place.**

This v1.2.0 release is a static GitHub Pages-safe release. It does not require npm, Vite, or a build step to deploy because GitHub Actions deploys the `docs` folder directly.

## What changed in v1.2.0

- Added a starter **Walmart + United Supermarkets price catalog** for Canyon, TX / ZIP 79015.
- Added 86 editable price records across grocery, household, and school-shopping categories.
- Added store/category/search filters on the Price Catalog page.
- Added a **Load/Refresh 79015 Catalog** button.
- Added CSV export/import for the price catalog.
- Added online lookup links for each catalog row.
- Kept raw bank statement imports local in the browser.
- Kept register, budget, debt, and statement import hidden from non-finance profiles.

## Important price note

The starter catalog is for budget projection only. Prices change by store, date, substitution, pickup/delivery method, and loyalty offers. Verify prices in Walmart/United before relying on the total.

## Recommended GitHub Pages setting

Repository → Settings → Pages → Source → **GitHub Actions**

Then push to `main`.

## Alternate setting

Repository → Settings → Pages → Source → **Deploy from a branch** → Branch: `main` → Folder: `/docs`
