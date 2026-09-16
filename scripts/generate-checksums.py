#!/usr/bin/env python3
"""Generate security checksums for security-critical files.

These checksums are verified at container startup to detect agent tampering.

Usage:
    python3 scripts/generate-checksums.py > scripts/.vulpy-security-checksums

Or to verify (exit 1 on mismatch):
    python3 scripts/generate-checksums.py --verify
"""

import hashlib
import os
import sys
from pathlib import Path

SECURITY_CRITICAL_FILES = [
    "scripts/vulpy-agent-cmd-server.py",
    "scripts/hermes-fox-entrypoint.sh",
    "docker-compose.hermes.yml",
    "deploy/Caddyfile.dev",
    "deploy/Caddyfile.internal",
    "docker-compose.edge.yml",
]


def get_file_hash(filepath: str | Path) -> str:
    """Calculate SHA256 hash of a file."""
    sha256 = hashlib.sha256()
    with open(str(filepath), "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def generate_checksums(root_dir: str | Path = ".") -> dict[str, str]:
    """Generate checksums for security-critical files."""
    checksums = {}
    root = Path(root_dir)
    for rel_path in SECURITY_CRITICAL_FILES:
        filepath = root / rel_path
        if filepath.exists():
            checksums[rel_path] = get_file_hash(filepath)
        else:
            print(f"WARN: Missing file: {rel_path}", file=sys.stderr)
            checksums[rel_path] = None
    return checksums


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--verify":
        # Verification mode
        root_dir = Path(__file__).parent.parent
        checksums_file = root_dir / "scripts" / ".vulpy-security-checksums"
        
        if not checksums_file.exists():
            print("ERROR: Checksums file not found", file=sys.stderr)
            sys.exit(1)
        
        # Load expected checksums
        expected = {}
        with open(checksums_file) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split(":")
                if len(parts) == 3 and parts[1] == "sha256":
                    # Map filename back to full relative path
                    filename = parts[0]
                    for full_path in SECURITY_CRITICAL_FILES:
                        if full_path.endswith(filename):
                            expected[full_path] = parts[2]
                            break
        
        # Verify each file
        failed = False
        for rel_path, expected_hash in expected.items():
            filepath = root_dir / rel_path
            if not filepath.exists():
                print(f"FAIL: Missing file: {rel_path}", file=sys.stderr)
                failed = True
                continue
            
            actual_hash = get_file_hash(filepath)
            if actual_hash != expected_hash:
                print(f"FAIL: Checksum mismatch for {rel_path}", file=sys.stderr)
                print(f"  Expected: {expected_hash}", file=sys.stderr)
                print(f"  Actual:   {actual_hash}", file=sys.stderr)
                failed = True
            else:
                print(f"OK: {rel_path}")
        
        if failed:
            sys.exit(1)
        print("All checksums verified")
    else:
        # Generation mode
        root_dir = Path(__file__).parent.parent
        checksums = generate_checksums(root_dir)
        
        print("# Security checksums for security-critical files")
        print(f"# Generated: {os.popen('date +%Y-%m-%d').read().strip()}")
        print("# Purpose: Detect agent tampering before container starts")
        print("#")
        print("# If these checksums don't match at entrypoint, the container exits.")
        print("# To update: regenerate with `python3 scripts/generate-checksums.py`")
        print("")
        
        for rel_path, hash_value in checksums.items():
            if hash_value:
                # Format: path:sha256:hash (full relative path from repo root)
                print(f"{rel_path}:sha256:{hash_value}")


if __name__ == "__main__":
    main()
