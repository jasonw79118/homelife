# HomeLife

**Budget, shop, and plan your household in one place.**

This v1.1.4 fix is a static GitHub Pages-safe release. It does not require npm, Vite, or a build step to deploy.

## What changed in v1.1.4

- Replaced the deployment-check fallback page with the actual HomeLife app.
- Root `index.html` works if GitHub Pages is set to deploy from the repository root.
- `docs/index.html` works if GitHub Pages is set to deploy from `main / docs`.
- GitHub Actions workflow deploys `docs` directly and does not run `npm install`, avoiding the GitHub runner npm failure.
- Register, budget, debt, and statement import remain hidden from non-finance roles.
- Statement CSV import remains local in the browser and only stores sanitized transaction rows.

## Recommended GitHub Pages setting

Repository → Settings → Pages → Source → **GitHub Actions**

Then push to `main`.

## Alternate setting

Repository → Settings → Pages → Source → **Deploy from a branch** → Branch: `main` → Folder: `/docs`

