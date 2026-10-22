import os
import subprocess
import sys
from pathlib import Path

out_dir = Path(__file__).resolve().parent.parent / "artifacts" / "premerge-round3"
out_dir.mkdir(parents=True, exist_ok=True)

commands = [
    ("cross-company-probe.log", f'"{sys.executable}" scripts/cross_company_probe.py'),
    ("pytest.log", f'"{sys.executable}" -m pytest tests -q'),
    ("npm-ci.log", "npm ci"),
    ("tsc.log", "npx tsc -b"),
    ("build.log", "npm run build"),
    ("lint.log", "npm run lint"),
    ("vitest.log", "npx vitest run"),
    ("mobile-tsc.log", "npx --prefix mobile tsc --noEmit"),
]

for log_name, cmd in commands:
    print(f"Running {cmd} -> {log_name}...")
    log_path = out_dir / log_name
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, encoding="utf-8", errors="replace")
    combined = result.stdout + "\n" + result.stderr
    with open(log_path, "w", encoding="utf-8") as f:
        f.write(combined)
    print(f"Completed {log_name} with exit code {result.returncode}")
    if result.returncode != 0:
        print(f"FAILED on {cmd} with code {result.returncode}")
        # Print without crashing on windows cp1252
        sys.stdout.buffer.write(combined[-800:].encode("utf-8", errors="replace"))
        sys.stdout.buffer.write(b"\n")
        sys.exit(result.returncode)

print("All premerge gates passed and logs saved to artifacts/premerge-round3/ successfully!")
