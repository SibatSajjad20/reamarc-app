"""
scripts/_prod_guard.py
Shared guard against accidental execution of database migration scripts against production databases.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

import pymongo.uri_parser


def is_prod(uri: Optional[str], db: Optional[str]) -> bool:
    """
    Returns True if:
    - db name is in {"reamarc", "reamarc_db"}
    - URI host is not localhost/127.0.0.1 and db is not "reamarc_test_db"
    - ENVIRONMENT=production
    """
    if os.environ.get("ENVIRONMENT") == "production":
        return True

    db_clean = str(db or "").strip()
    if db_clean in {"reamarc", "reamarc_db"}:
        return True

    uri_str = str(uri or "").strip()
    if uri_str:
        hosts = []
        try:
            parsed = pymongo.uri_parser.parse_uri(uri_str)
            hosts = [h[0].lower() for h in parsed.get("nodelist", [])]
        except Exception:
            try:
                p = urlparse(uri_str)
                if p.hostname:
                    hosts = [p.hostname.lower()]
            except Exception:
                pass

        local_hosts = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}
        if hosts and any(h not in local_hosts for h in hosts):
            if db_clean != "reamarc_test_db":
                return True

    return False


def verify_prod_backup(backup_path_str: Optional[str]) -> Path:
    if not backup_path_str:
        print("[ERROR] Production migration requires --i-have-a-backup <path>", file=sys.stderr)
        sys.exit(1)

    backup_path = Path(backup_path_str)
    if not backup_path.exists():
        print(f"[ERROR] Backup file not found: {backup_path}", file=sys.stderr)
        sys.exit(1)

    # Must be >= 1 MB (1,048,576 bytes)
    size = backup_path.stat().st_size
    if size < 1024 * 1024:
        print(f"[ERROR] Backup file must be >= 1 MB (actual size: {size} bytes)", file=sys.stderr)
        sys.exit(1)

    # mongorestore --dryRun --archive=<path> --gzip must exit 0
    cmd = ["mongorestore", "--dryRun", f"--archive={backup_path.resolve()}", "--gzip"]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            print(f"[ERROR] mongorestore dry-run verification failed (code {res.returncode}):\n{res.stderr}", file=sys.stderr)
            sys.exit(1)
    except FileNotFoundError:
        print("[ERROR] 'mongorestore' binary not found on PATH. Required to verify backup on prod.", file=sys.stderr)
        sys.exit(1)

    return backup_path


def confirm_prod_action(db_name: str, args: Any) -> None:
    expected_flag = f"--yes-i-mean-{db_name}"
    flag_passed = any(arg == expected_flag for arg in sys.argv)
    if not flag_passed and hasattr(args, f"yes_i_mean_{db_name.replace('-', '_')}"):
        flag_passed = bool(getattr(args, f"yes_i_mean_{db_name.replace('-', '_')}"))

    if not flag_passed:
        user_input = input(f"WARNING: Applying migration to PRODUCTION db '{db_name}'. Type the db name to proceed: ").strip()
        if user_input != db_name:
            print(f"[ABORT] Confirmation mismatch ('{user_input}' != '{db_name}'). Aborting.", file=sys.stderr)
            sys.exit(1)


def enforce_prod_guard_before_connect(uri: str, db_name: str, args: Any) -> None:
    """Enforces prod checks before ANY MongoClient is constructed."""
    if not getattr(args, "apply", False):
        return

    if is_prod(uri, db_name):
        verify_prod_backup(getattr(args, "i_have_a_backup", None))
        confirm_prod_action(db_name, args)
