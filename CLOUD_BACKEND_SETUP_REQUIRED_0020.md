# HomeLife Cloud Backend Setup Required — v2026.06.12.0020

If HomeLife shows `PGRST202` or says `homelife_cloud_ping` cannot be found, the Supabase SQL functions have not been installed in your Supabase project or PostgREST has not refreshed its schema cache.

## Required one-time step

1. Open your Supabase project.
2. Go to **SQL Editor**.
3. Open this file from the ZIP: `SUPABASE_SQL_FIX_0020_RUN_THIS.sql`.
4. Paste the full contents into SQL Editor and run it.
5. Run this verification query:

```sql
select public.homelife_cloud_ping();
```

Expected result includes `"ok": true` and `"schema_version": "2026.06.12.0020"`.

6. Wait 30-60 seconds, then retry HomeLife **Test Cloud** and **Push Now**.

The front-end cannot install these database functions using the anon public key. This setup has to be done once by the Supabase project owner.
