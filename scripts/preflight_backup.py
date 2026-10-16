"""
scripts/preflight_backup.py
Cross-platform pre-flight backup and restore check runner.
Calls mongodump and mongorestore, then verifies counts and checksums with snapshot_counts.py.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import pymongo

from scripts.snapshot_counts import take_snapshot, compare_snapshots


def find_tool(name: str) -> str:
    # First check shutil.which
    found = shutil.which(name)
    if found:
        return found
    # Check default Windows MongoDB Tools directory
    default_win = Path(r"C:\Program Files\MongoDB\Tools\100\bin") / f"{name}.exe"
    if default_win.exists():
        return str(default_win)
    # Check WinGet links
    user_winget = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Links" / f"{name}.exe"
    if user_winget.exists():
        return str(user_winget)
    return name


def run_preflight_backup(
    uri: str = "mongodb://localhost:27017",
    source_db: str = "reamarc",
    target_db: str = "reamarc_restore_check",
    backup_dir: Path | None = None,
) -> Path:
    if backup_dir is None:
        home = Path(os.environ.get("USERPROFILE") or os.environ.get("HOME") or ".")
        backup_dir = home / "reamarc_backups_preflight"
    backup_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    archive_name = f"{source_db}-{timestamp}.gz"
    archive_path = backup_dir / archive_name

    mongodump = find_tool("mongodump")
    mongorestore = find_tool("mongorestore")

    print("=" * 60)
    print(" Starting Preflight Backup & Restore-Check")
    print(f" Source DB:  {source_db}")
    print(f" Target DB:  {target_db}")
    print(f" Archive:    {archive_path}")
    print("=" * 60)

    # 1. mongodump
    print(f"[1/3] Running mongodump from '{source_db}'...")
    dump_cmd = [
        mongodump,
        "--uri", uri,
        "--db", source_db,
        "--gzip",
        f"--archive={archive_path}",
    ]
    res = subprocess.run(dump_cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"[ERROR] mongodump failed: {res.stderr}", file=sys.stderr)
        sys.exit(res.returncode)

    if not archive_path.exists():
        print(f"[ERROR] Archive file not found: {archive_path}", file=sys.stderr)
        sys.exit(1)
    size_mb = archive_path.stat().st_size / (1024 * 1024)
    print(f"[OK] Backup archive created ({size_mb:.2f} MB)")

    # 2. mongorestore into target_db
    print(f"[2/3] Restoring archive into scratch check DB '{target_db}'...")
    client = pymongo.MongoClient(uri)
    client.drop_database(target_db)
    client.close()

    restore_cmd = [
        mongorestore,
        "--uri", uri,
        "--gzip",
        f"--archive={archive_path}",
        "--nsFrom", f"{source_db}.*",
        "--nsTo", f"{target_db}.*",
        "--drop",
    ]
    res = subprocess.run(restore_cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"[ERROR] mongorestore failed: {res.stderr}", file=sys.stderr)
        sys.exit(res.returncode)
    print(f"[OK] mongorestore into '{target_db}' finished")

    # 3. Snapshot and compare
    print(f"[3/3] Taking snapshots and verifying document counts and checksums...")
    s1 = take_snapshot(uri, source_db)
    s2 = take_snapshot(uri, target_db)

    match, diffs = compare_snapshots(s1, s2)
    if not match:
        print(f"[FAIL] Counts or checksums do not match between {source_db} and {target_db}:", file=sys.stderr)
        for d in diffs:
            print(f"  - {d}", file=sys.stderr)
        sys.exit(1)

    print("[SUCCESS] All collection counts and document checksums match identically!")
    print(f"Archive safely stored at: {archive_path}")
    print("=" * 60)
    return archive_path


def main():
    parser = argparse.ArgumentParser(description="Preflight Backup & Restore Check")
    parser.add_argument("--uri", default=os.environ.get("MONGODB_URL", "mongodb://localhost:27017"))
    parser.add_argument("--source-db", default=os.environ.get("SOURCE_DB", "reamarc"))
    parser.add_argument("--target-db", default=os.environ.get("TARGET_DB", "reamarc_restore_check"))
    parser.add_argument("--backup-dir", default=None)
    args = parser.parse_args()

    bdir = Path(args.backup_dir) if args.backup_dir else None
    run_preflight_backup(args.uri, args.source_db, args.target_db, bdir)


if __name__ == "__main__":
    main()
