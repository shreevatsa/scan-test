#!/usr/bin/env python3
"""Download and verify the pinned public model files."""
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parent


def main():
    manifest = json.loads((ROOT / "models.json").read_text())
    for entry in manifest["files"]:
        path = ROOT / entry["path"]
        if path.exists():
            data = path.read_bytes()
            if len(data) == entry["size_bytes"] and hashlib.sha256(data).hexdigest() == entry["sha256"]:
                print("Verified existing", entry["path"])
                continue
            raise RuntimeError("Existing file failed verification: " + str(path))
        with urllib.request.urlopen(entry["url"], timeout=120) as response:
            data = response.read()
        if len(data) != entry["size_bytes"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise RuntimeError("Download failed verification: " + entry["path"])
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        print("Downloaded and verified", entry["path"], len(data), "bytes")


if __name__ == "__main__":
    main()
