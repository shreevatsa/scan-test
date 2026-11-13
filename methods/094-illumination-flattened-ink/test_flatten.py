"""Check geometry.flatten_gray against the committed fixture (also checked by webapp/test/flatten.test.mjs).
Run: uv run --offline python methods/094-illumination-flattened-ink/test_flatten.py"""
import json, pathlib, sys
import numpy as np
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import geometry

here = pathlib.Path(__file__).parent
fixture = json.loads((here / "flatten-fixture.json").read_text())
config = json.loads((here / "line-config.json").read_text())
gray = np.array(fixture["gray"], np.uint8).reshape(fixture["height"], fixture["width"])
flat = geometry.flatten_gray(gray, config)
assert flat.ravel().tolist() == fixture["flat"], "flatten_gray differs from the fixture"
white = np.full((120, 100), 255, np.uint8)
assert (geometry.flatten_gray(white, config) == 255).all()
print("ok")
