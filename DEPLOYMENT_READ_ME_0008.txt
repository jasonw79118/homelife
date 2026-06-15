For GitHub Pages:

Option A, preferred:
1. Upload this ZIP over the repo root.
2. Delete old workflow files in .github/workflows/ and keep only deploy.yml.
3. Go to GitHub -> Settings -> Pages.
4. Set Source to GitHub Actions.
5. Commit/push.

Option B, fallback if Actions is still being stubborn:
1. Upload this ZIP over the repo root.
2. Go to GitHub -> Settings -> Pages.
3. Set Source to Deploy from branch.
4. Branch: main.
5. Folder: /docs.

Do not set Pages to main / root for this Vite app. Root index.html is for local development and points to /src/main.tsx. The production files are in /dist and /docs.
