#!/usr/bin/env python3
"""Raster inputs and reference line analysis for the outline tests."""
import json
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parents[2]


def main():
    cmd = sys.argv[1]
    if cmd == "gray":
        # The page as method 043 reads it: PIL's grayscale conversion, row-major bytes.
        from PIL import Image
        Path(sys.argv[3]).write_bytes(Image.open(sys.argv[2]).convert("L").tobytes())
    elif cmd == "analysis":
        import numpy as np
        from PIL import Image
        m43 = PROJECT_DIR / "methods" / "043-gpt-6.1-terra-none-book-types-continuations-band-chained-lines"
        sys.path.insert(0, str(m43))
        import analysis as an  # noqa: E402
        gray = np.asarray(Image.open(sys.argv[2]).convert("L"))
        detail, arrays = an.analyze(gray, json.loads((m43 / "line-config.json").read_text()))
        s = detail["summary"]
        json.dump(dict(status=s["status"], char_h=s.get("char_h"), angle=s.get("page_angle_deg"), thresholds=detail.get("thresholds"),
                       components=int(len(arrays["comp"]["stats"])) if arrays else None,
                       lines=[dict(column=L["column"], center=L["center"], rx0=L["rx0"], rx1=L["rx1"]) for L in detail.get("lines", [])]), sys.stdout)
if __name__ == "__main__":
    main()
