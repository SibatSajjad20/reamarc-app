# Multi-Tenant "Companies" Production Rollout Guide

## 1. Freeze-Window Guidance
- **Scheduled Window**: Quiet window recommended (e.g., Sunday morning 06:00 - 08:00 PKT).
- **Team Notice**: Notify team 48 hours in advance. No simultaneous deploys or database operations.
- **Pause Deploys**: Pause all deployments and background tasks on Render for a 2-hour window.
- **No Schema Changes**: Strict freeze on parallel migrations or collection updates.

---

## 2. Production Rollout Checklist

### Step 1: Deploy with `MULTI_TENANT_ENABLED=false`
Deploy the latest code to Render with:
```bash
MULTI_TENANT_ENABLED=false
```
In this mode:
- Behavior is 100% identical to legacy single-tenant operation.
- No `/owner` routes or multi-tenant UI are mounted or accessible.
- `TenantDB` operates in safe shadow mode, observing queries and logging to `security_events`.
- Monitor application logs for 24 hours to ensure zero unexpected blocks.

---

### Step 2: [Faizan runs] Pre-flight Backup & Restore Check
On production host (or secure local machine connected to prod MongoDB URI):
```bash
export MONGO_URI="<PRODUCTION_MONGO_CONNECTION_STRING>"
export SOURCE_DB="reamarc"
export TARGET_DB="reamarc_restore_check"

# Execute preflight backup and verification
./scripts/preflight_backup.sh
# or using python:
python -m scripts.preflight_backup --uri "$MONGO_URI" --source-db "$SOURCE_DB" --target-db "$TARGET_DB"
```
Verify:
1. Archive is created (e.g. `reamarc-prod-YYYYMMDD-HHMM.gz`).
2. Copy the archive to secure secondary cloud storage (e.g. S3 / GCS).
3. The restore-check database verification prints `[SUCCESS] All collection counts and document checksums match identically!`.

---

### Step 3: [Faizan runs] Additive Backfill Migration
Run the additive backfill migration script:
```bash
# 1. Take pre-migration snapshot
python -m scripts.snapshot_counts --uri "$MONGO_URI" --db "$SOURCE_DB" --output "artifacts/snapshot-prod-before.json"

# 2. Run dry-run (verifies collections, prints planned updates, mutates nothing)
python -m scripts.migrate_companies --uri "$MONGO_URI" --db "$SOURCE_DB" --dry-run

# 3. Execute additive migration with required backup confirmation
python -m scripts.migrate_companies --uri "$MONGO_URI" --db "$SOURCE_DB" --apply --i-have-a-backup "<PATH_TO_BACKUP_ARCHIVE.gz>"

# 4. Take post-migration snapshot and verify invariant checksums
python -m scripts.snapshot_counts --uri "$MONGO_URI" --db "$SOURCE_DB" --output "artifacts/snapshot-prod-after.json"
python -m scripts.snapshot_counts --compare "artifacts/snapshot-prod-before.json" "artifacts/snapshot-prod-after.json"
```

The verify step confirms:
- Exact equal document counts across all collections.
- Zero documents missing `company_id`.
- Checksums excluding `company_id` are 100% identical (no fields altered or lost).

---

### Step 4: [Faizan runs] Grant Super-Admin Owner Role
Run the one-off owner assignment CLI script:
```bash
python -m scripts.grant_owner --uri "$MONGO_URI" --db "$SOURCE_DB" --email "faizan@reamarc.com" --confirm
```
This updates `users.is_super_admin = true` strictly for Faizan's account, prints before/after details, and appends an entry to the immutable `owner_audit` hash chain.

---

### Step 5: Enable Multi-Tenancy on Render
Update environment variables on Render:
```bash
MULTI_TENANT_ENABLED=true
TENANT_SECRETS_KEYS="<PRIMARY_FERNET_KEY>,<OPTIONAL_BACKUP_KEY>"
```
Restart backend service.
Smoke test Reamarc login, attendance punches, daily logs, and CRM to verify zero regressions.

---

### Step 6: Create Internal Test Company & Run Smoke Verification
1. Access `/owner` console with owner credentials.
2. Complete re-auth prompt to create owner session.
3. Create "Faizan Test Co" (slug: `faizan-test-co`).
4. Run production isolation smoke verification script:
```bash
python -m scripts.prod_isolation_smoke --uri "$MONGO_URI" --db "$SOURCE_DB"
```
Confirm:
- Test company sees 0 Reamarc records.
- Reamarc sees 0 test company records.
- Cross-tenant queries fail closed.

---

## 3. Rollback Plan
If any anomaly or blocking issue is observed:
1. **Instant Rollback**: Set `MULTI_TENANT_ENABLED=false` on Render and redeploy/restart.
   - All tenant routing and guards are disabled; queries operate directly without tenant restriction.
   - The added `company_id` field in documents is ignored and harmless.
2. **Database Rollback (Last Resort)**:
   If data corruption occurred:
   ```bash
   mongorestore --uri "$MONGO_URI" --gzip --archive="<PATH_TO_BACKUP_ARCHIVE.gz>" --drop
   ```
