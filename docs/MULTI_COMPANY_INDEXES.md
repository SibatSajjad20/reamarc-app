# Multi-company unique indexes — go-live

Global unique indexes on tenant collections block a second company from using the
same fixed ids (`crm_pipeline.id = "default"`, seeded shift ids, matching
attendance dates, content-calendar serials starting at `-001`, and so on).
This build replaces those indexes with `{company_id, …}` unique compounds.

Users (`uniq_user_email`, `uniq_user_id`) stay global: one login, memberships
select the company. Ingest `idx_crm_ingest_token` stays global so a public token
hashes to one source. Web Push `idx_web_push_endpoint` stays global: one browser
endpoint is one subscription. If the same endpoint is upserted under another
company, the existing row is reassigned (no DuplicateKeyError).

## Order

1. **Back up the database.**
2. **Run the existing `company_id` backfill migrations** (`scripts/migrate_companies.py`
   apply, then memberships as documented) **with the app still on the old version**.
   Every Reamarc document should carry `company_reamarc`.
3. **Read-only duplicate check** (default is dry-run, no writes):

   ```bash
   python -m scripts.check_company_unique_indexes --uri "$MONGO_URI" --db "$MONGO_DB"
   ```

   Must report **zero duplicates** on the new key specs.
4. **Deploy this build.** Startup creates the new unique indexes, then drops the
   old global uniques. Documents are never deleted.
5. **Re-run the check script** and confirm the new index names are present and
   duplicate counts remain zero.
6. **Then turn `MULTI_COMPANY` / `MULTI_TENANT` on.**

## Rollback

The new indexes are a **superset** constraint (`id` unique per company, not
globally). Old application code that assumed global uniqueness still works with
them. Flag rollback (`MULTI_COMPANY_ENABLED=false`) does not require dropping
indexes.

If a new unique index cannot be built because of leftover duplicates, startup
logs the collection and duplicate key and **leaves the old index in place**.
Fix the duplicates, then restart.

## Flags off

With both flags off, document `id`s, Mongo `_id`s (`serial_<ABBR>`, `root`,
`field_constants`), and serial numbering are unchanged. Only index names/keys
differ.
