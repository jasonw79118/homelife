# HomeLife Cloud Backend Setup v2026.06.12.0013

HomeLife is still hosted as a static GitHub Pages app, but this patch adds an optional reachable cloud backend using Supabase.

## What this solves

- The same household can use HomeLife from phones, tablets, and computers.
- It works outside the home network.
- Each family/test household uses its own household code.
- Data is encrypted in the browser before it is saved to Supabase.

## Setup steps

1. Create a Supabase project.
2. In Supabase SQL Editor, run `supabase/homelife_cloud_schema.sql`.
3. Open HomeLife.
4. On the login screen, select **Cloud Setup**.
5. Enter:
   - Supabase Project URL
   - Supabase anon public key
   - Family cloud password/passphrase
6. Click **Test Cloud**.
7. Create or load a family workspace.
8. Use **Push Now** from Settings to save the first cloud copy.
9. On other household devices, repeat Cloud Setup with the same URL, anon key, and family cloud password. Then enter the family code and Load Family.

## Important

The app encrypts the household payload before upload. Supabase stores encrypted text, not readable budget/register JSON. Keep the family cloud password safe. If the password is lost, the cloud copy cannot be decrypted.

This beta setup does not yet use Supabase Auth accounts. For a public multi-family launch, the next phase should add email/password auth, household invitations, authenticated RLS policies, and conflict history.


## Patch 2026.06.12.0015
The HomeLife app now has the Supabase project URL and anon public key built in. Users no longer need to enter those values in Cloud Setup.

Cloud Setup now asks only for the family cloud password/passphrase and whether automatic sync should be enabled. Each household tester should use the same family code and same family cloud password on each device.

The anon public key is safe to place in the front-end app when Supabase row-level security and the included table policy are in place. Do not place a Supabase service-role key in this app.
