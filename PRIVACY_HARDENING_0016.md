# HomeLife Privacy Hardening Patch v2026.06.12.0016

This patch applies the privacy hardening discussed before inviting other families to test HomeLife.

## Included protections

- No plain household workspace data is saved to Supabase.
- Cloud saves use browser-side AES-GCM encryption before upload.
- The family cloud password is not sent to Supabase.
- The family cloud password is no longer persisted to local storage.
- Cloud rows are keyed by a one-way workspace ID generated from family code + cloud password.
- Raw family code and household name are no longer written as readable Supabase columns.
- The Supabase table endpoint is locked down by revoking anon/authenticated table access.
- App access uses RPC functions that save or pull only one encrypted workspace ID at a time.
- Debug logging was kept away from household payloads.
- Settings now include an in-app privacy warning and password-change warning.

## Limits to understand

This is still a GitHub Pages static app using a public Supabase anon key. The privacy boundary is encryption plus the family cloud password. A Supabase project owner can administer database rows and metadata, but should only see encrypted payloads unless they also know a family’s cloud password.

For a production paid public app, the next step would be true Supabase Auth accounts, per-family membership tables, invite flows, server-side audit logging, and formal privacy/terms pages.
