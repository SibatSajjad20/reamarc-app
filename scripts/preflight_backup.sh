#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# scripts/preflight_backup.sh
# Multi-tenant Companies Rollout: Pre-flight Safety Net Backup & Verification
#
# Production run (Faizan runs on prod):
#   MONGO_URI="$MONGO_URI" ./scripts/preflight_backup.sh
#
# Test run (Agent runs):
#   SOURCE_DB="reamarc_test_db" TARGET_DB="reamarc_restore_check_test" ./scripts/preflight_backup.sh
# ==============================================================================

MONGO_URI="${MONGO_URI:-mongodb://localhost:27017}"
SOURCE_DB="${SOURCE_DB:-reamarc}"
TARGET_DB="${TARGET_DB:-reamarc_restore_check}"
TIMESTAMP=$(date +%Y%m%d-%H%M)
ARCHIVE_NAME="${ARCHIVE_NAME:-${SOURCE_DB}-${TIMESTAMP}.gz}"

# Store backup archive outside the repository (default: ../backups_preflight or /tmp/reamarc-backups)
BACKUP_DIR="${BACKUP_DIR:-$HOME/reamarc_backups_preflight}"
mkdir -p "$BACKUP_DIR"
ARCHIVE_PATH="${BACKUP_DIR}/${ARCHIVE_NAME}"

echo "=========================================================="
echo " Starting Preflight Backup & Restore-Check"
echo " Time:       $(date)"
echo " Source DB:  $SOURCE_DB"
echo " Target DB:  $TARGET_DB"
echo " Archive:    $ARCHIVE_PATH"
echo "=========================================================="

# 1. mongodump source DB into compressed archive
echo "[1/3] Dumping database '$SOURCE_DB' to '$ARCHIVE_PATH'..."
mongodump --uri "$MONGO_URI" --db "$SOURCE_DB" --gzip --archive="$ARCHIVE_PATH"

if [ ! -f "$ARCHIVE_PATH" ]; then
    echo "[ERROR] Archive file was not created: $ARCHIVE_PATH" >&2
    exit 1
fi
echo "[OK] Dump complete ($(du -h "$ARCHIVE_PATH" | cut -f1))"

# 2. mongorestore into scratch check DB with namespace mapping
echo "[2/3] Restoring from archive into scratch verification DB '$TARGET_DB'..."
# Drop scratch target if it already existed from previous runs
python -c "
import pymongo
client = pymongo.MongoClient('$MONGO_URI')
client.drop_database('$TARGET_DB')
client.close()
"

mongorestore --uri "$MONGO_URI" --gzip --archive="$ARCHIVE_PATH" \
    --nsFrom "${SOURCE_DB}.*" --nsTo "${TARGET_DB}.*" --drop

echo "[OK] Restore completed into '$TARGET_DB'"

# 3. Compare collections, counts, and checksums
echo "[3/3] Comparing collection counts and document checksums..."
python -c "
import sys, os
from pathlib import Path
from scripts.snapshot_counts import take_snapshot, compare_snapshots

uri = '$MONGO_URI'
src_db = '$SOURCE_DB'
tgt_db = '$TARGET_DB'

print(f'Taking snapshot of source DB: {src_db}')
s1 = take_snapshot(uri, src_db)

print(f'Taking snapshot of restored target DB: {tgt_db}')
s2 = take_snapshot(uri, tgt_db)

match, diffs = compare_snapshots(s1, s2)
if not match:
    print(f'[FAIL] Checksum/Count mismatch between {src_db} and {tgt_db}:', file=sys.stderr)
    for d in diffs:
        print(f'  - {d}', file=sys.stderr)
    sys.exit(1)

print('[SUCCESS] All collection counts and document checksums match identically!')
sys.exit(0)
"

echo "=========================================================="
echo " Pre-flight Backup Verification PASSED"
echo " Archive safely stored at: $ARCHIVE_PATH"
echo " (Remember to store one copy in cloud storage before rollout)"
echo "=========================================================="
