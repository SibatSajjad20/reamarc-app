"""
scripts/snapshot_counts.py
Captures counts and document checksums (excluding company_id) for every collection in a MongoDB database.
Outputs to artifacts/snapshot-<db>-<timestamp>.json.
Phase 2 uses this to prove nothing was lost or changed during additive backfill migration.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

import pymongo
from bson import json_util


def normalize_doc_excluding_company_id(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Return a deep copy / dict with company_id and newly seeded token_version=0 excluded for invariant checksum comparison."""
    cleaned = {}
    for k, v in doc.items():
        if k == "company_id":
            continue
        if k == "token_version" and v == 0:
            # token_version: 0 is seeded where missing by the migration; ignore default 0 for pre/post parity
            continue
        cleaned[k] = v
    return cleaned


def compute_collection_snapshot(collection: pymongo.collection.Collection) -> Dict[str, Any]:
    """Computes total count, count missing company_id, sorted _id hash, and document content hash."""
    cursor = collection.find({}).sort("_id", pymongo.ASCENDING)
    
    total_count = 0
    missing_company_id_count = 0
    id_hasher = hashlib.sha256()
    content_hasher = hashlib.sha256()

    for doc in cursor:
        total_count += 1
        if "company_id" not in doc or doc["company_id"] is None:
            missing_company_id_count += 1
        
        # Hash ID
        doc_id_str = str(doc.get("_id", ""))
        id_hasher.update(doc_id_str.encode("utf-8"))
        id_hasher.update(b"\n")
        
        # Hash normalized doc excluding company_id
        cleaned_doc = normalize_doc_excluding_company_id(doc)
        # Use json_util with sorted keys for deterministic serialization
        doc_serialized = json_util.dumps(cleaned_doc, sort_keys=True)
        content_hasher.update(doc_serialized.encode("utf-8"))
        content_hasher.update(b"\n")

    id_hash = id_hasher.hexdigest()
    content_hash = content_hasher.hexdigest()
    combined_checksum = hashlib.sha256(f"{id_hash}:{content_hash}".encode("utf-8")).hexdigest()

    return {
        "count": total_count,
        "missing_company_id": missing_company_id_count,
        "id_hash": id_hash,
        "content_hash": content_hash,
        "checksum": combined_checksum,
    }


def take_snapshot(uri: str, db_name: str, output_path: Path | None = None) -> Path:
    client = pymongo.MongoClient(uri)
    db = client[db_name]

    collection_names = sorted(db.list_collection_names())
    # Exclude system collections
    collection_names = [c for c in collection_names if not c.startswith("system.")]

    collections_data = {}
    total_docs = 0
    total_missing_cid = 0

    for cname in collection_names:
        coll = db[cname]
        data = compute_collection_snapshot(coll)
        collections_data[cname] = data
        total_docs += data["count"]
        total_missing_cid += data["missing_company_id"]

    now_iso = datetime.now(timezone.utc).isoformat()
    snapshot_payload = {
        "db": db_name,
        "timestamp": now_iso,
        "total_collections": len(collections_data),
        "total_documents": total_docs,
        "total_missing_company_id": total_missing_cid,
        "collections": collections_data,
    }

    if output_path is None:
        timestamp_str = datetime.now().strftime("%Y%m%d-%H%M%S")
        repo_root = Path(__file__).resolve().parent.parent
        artifacts_dir = repo_root / "artifacts"
        artifacts_dir.mkdir(parents=True, exist_ok=True)
        output_path = artifacts_dir / f"snapshot-{db_name}-{timestamp_str}.json"
    else:
        output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(snapshot_payload, f, indent=2)

    client.close()
    return output_path


def compare_snapshots(snap1_path: Path, snap2_path: Path) -> tuple[bool, list[str]]:
    """Compares two snapshots. Returns (is_match, diff_messages)."""
    with open(snap1_path, "r", encoding="utf-8") as f:
        s1 = json.load(f)
    with open(snap2_path, "r", encoding="utf-8") as f:
        s2 = json.load(f)

    diffs: list[str] = []
    c1 = s1.get("collections", {})
    c2 = s2.get("collections", {})

    ADDITIVE_NEW_COLLECTIONS = {
        "companies",
        "company_integrations",
        "owner_audit",
        "owner_sessions",
        "migrations",
        "rate_limit_counters",
        "security_events",
    }

    all_colls = sorted(set(c1.keys()) | set(c2.keys()))
    for coll in all_colls:
        if coll not in c1:
            if coll in ADDITIVE_NEW_COLLECTIONS:
                continue
            diffs.append(f"Collection '{coll}' present in snapshot 2 but missing in snapshot 1")
            continue
        if coll not in c2:
            diffs.append(f"Collection '{coll}' present in snapshot 1 but missing in snapshot 2")
            continue

        d1 = c1[coll]
        d2 = c2[coll]

        if d1["count"] != d2["count"]:
            diffs.append(f"Collection '{coll}' count mismatch: {d1['count']} vs {d2['count']}")
        if d1["checksum"] != d2["checksum"]:
            diffs.append(
                f"Collection '{coll}' checksum mismatch: {d1['checksum']} vs {d2['checksum']} "
                f"(id_hash={d1['id_hash']} vs {d2['id_hash']}, content_hash={d1['content_hash']} vs {d2['content_hash']})"
            )

    return (len(diffs) == 0, diffs)


def main():
    parser = argparse.ArgumentParser(description="MongoDB Snapshot Counts & Checksums Tool")
    parser.add_argument("--uri", default=os.environ.get("MONGODB_URL", "mongodb://localhost:27017"), help="MongoDB URI")
    parser.add_argument("--db", default=os.environ.get("MONGODB_DB_NAME", "reamarc_test_db"), help="Database name")
    parser.add_argument("--output", default=None, help="Specific output file path")
    parser.add_argument("--compare", nargs=2, help="Compare two snapshot JSON files: --compare <file1> <file2>")
    args = parser.parse_args()

    if args.compare:
        p1 = Path(args.compare[0])
        p2 = Path(args.compare[1])
        match, diffs = compare_snapshots(p1, p2)
        if match:
            print(f"[OK] Snapshots match perfectly between {p1.name} and {p2.name}!")
            sys.exit(0)
        else:
            print(f"[FAIL] Snapshot differences detected ({len(diffs)}):")
            for d in diffs:
                print(f"  - {d}")
            sys.exit(1)

    out_p = Path(args.output) if args.output else None
    result_path = take_snapshot(args.uri, args.db, out_p)
    print(f"[OK] Snapshot saved successfully: {result_path}")


if __name__ == "__main__":
    main()
