# HomeLife Cloud Backend Setup — v2026.06.12.0016

HomeLife uses GitHub Pages for the front end and Supabase for a small encrypted sync table.

## What is stored in Supabase

v0016 stores only:

- `workspace_id` — a one-way SHA-256 ID generated in the browser from the family code plus the family cloud password.
- `encrypted_payload` — the encrypted HomeLife workspace.
- `encryption_version`, `updated_at`, and a short device/user marker.

HomeLife does **not** save readable register transactions, budgets, pantry items, recipes, grocery lists, family codes, household names, or user names as Supabase table columns.

## Required Supabase step

1. Open your Supabase project.
2. Go to **SQL Editor**.
3. Run `supabase/homelife_cloud_schema.sql`.
4. Deploy/push this HomeLife build.
5. In HomeLife, open **Cloud Setup** and enter the family cloud password.
6. Push the household workspace once from the main household device.
7. On other household devices, enter the same family code and same cloud password, then pull/latest or sign in.

## Important privacy behavior

The family cloud password is not stored in Supabase and is not stored in local storage. It is kept only for the current browser session so auto-sync can work while the browser is open. Closing the browser may require re-entering the password.

Changing the family cloud password creates a different encrypted workspace ID. To rotate passwords, pull the current data using the old password first, then set the new password and push again.

## Why v0016 is safer than the beta cloud schema

Earlier beta policies allowed the app to read/write encrypted rows through the table endpoint. v0016 revokes table access from `anon` and uses RPC functions that only accept one derived workspace ID at a time. This prevents app users from browsing other family rows through the HomeLife app.

Because the Supabase project owner can still administer the database, the database owner may see encrypted rows and metadata in Supabase. The household contents remain unreadable without that family’s cloud password.
