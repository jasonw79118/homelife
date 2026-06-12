# HomeLife v1.3.0

Budget, shop, and plan your household in one place.

## This release

- Expands the 79015 price catalog from a small starter set to a much larger projection catalog.
- Adds Walmart 79015 projection records.
- Keeps United Supermarkets 79015 comparison records.
- Adds Order/Receipt Import.
- Parses CSV/TXT receipt or order exports locally in the browser.
- Stores only cleaned item rows, not raw receipts or login credentials.
- Lets you merge receipt/order rows back into the price catalog.
- Lets you create a reorder shopping list from a parsed receipt.

## Deploy

Unzip this ZIP directly into the `homelife` repository root, then run:

```powershell
git add .
git commit -m "Add expanded catalog and receipt import v1.3.0"
git push
```

GitHub Pages should be set to GitHub Actions. The workflow deploys the `docs` folder and does not run npm install.

## Important pricing note

The expanded catalog contains projection estimates, not guaranteed live checkout prices. Use the receipt/order import to make HomeLife learn your actual household purchase prices over time.
