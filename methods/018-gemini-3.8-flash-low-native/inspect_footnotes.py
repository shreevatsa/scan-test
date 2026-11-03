#!/usr/bin/env python3
"""Enlarge a fixed page-17 footnote crop from an existing overlay for visual inspection."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir",type=Path)
    args=parser.parse_args()
    p=args.run_dir.resolve()
    source=p/"overlay.png"
    target=p/"footnotes-detail.png"
    metadata=p/"footnotes-detail.json"
    if target.exists() or metadata.exists():
        parser.error("Footnote detail output already exists.")
    crop=[150,1870,1300,2005]
    with Image.open(source) as image:
        assert image.size==(1407,2135),"Crop is specific to this test image."
        image.crop(crop).resize((2300,270),Image.Resampling.NEAREST).save(target)
    digest=lambda data:hashlib.sha256(data).hexdigest()
    metadata.write_text(json.dumps({"source":"overlay.png","source_sha256":digest(source.read_bytes()),
                                    "crop_xyxy":crop,"scale":2,"resampling":"nearest",
                                    "script_sha256":digest(Path(__file__).read_bytes())},indent=2)+"\n")
    print(target)


if __name__=="__main__":
    main()
