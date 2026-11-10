#!/usr/bin/env python3
"""Run the frozen browser line-block finder on a page. No API calls."""
import argparse
import hashlib
import json
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def run(image_path, types_path, output, blocks_path=None, method=None):
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise ValueError(f"Output directory is occupied: {output}")
    image = Image.open(image_path).convert("L")
    with tempfile.TemporaryDirectory(prefix="scan-test-blocks-") as temporary:
        gray = Path(temporary) / "page.gray"
        gray.write_bytes(image.tobytes())
        command = ["node", str(HERE / "run.mjs"), str(gray), str(image.width), str(image.height), str(types_path)]
        if blocks_path:
            command.append(str(blocks_path))
        result = json.loads(subprocess.check_output(command, cwd=ROOT, text=True))
    result.update(schema_version=1, method={"id": method or HERE.name}, api_calls=0, cost_usd=0,
                  created_at_utc=datetime.now(timezone.utc).isoformat(),
                  input={"path": str(image_path), "sha256": digest(image_path), "width": image.width, "height": image.height},
                  type_list={"path": str(types_path), "sha256": digest(types_path)},
                  code_sha256={str(path.relative_to(HERE)): digest(path) for path in sorted(HERE.rglob("*"))
                               if path.is_file() and path.suffix in (".js", ".mjs", ".py", ".json")})
    if blocks_path:
        result["block_source"] = {"path": str(blocks_path), "sha256": digest(blocks_path)}
    (output / "regions.json").write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--types", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    result = run(args.input, args.types, args.output_dir)
    print(f"{len(result['regions'])} regions, {result['seconds']:.2f}s, $0")
