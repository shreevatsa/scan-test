"""Write flatten-fixture.json: a small deterministic gray image and the flattened result from geometry.flatten_gray.
The browser test (webapp/test/flatten.test.mjs) and test_flatten.py check their implementations against it."""
import json, pathlib
import numpy as np
import geometry

here = pathlib.Path(__file__).parent
config = json.loads((here / "line-config.json").read_text())

def sample():
    height, width = 61, 83
    y, x = np.mgrid[0:height, 0:width]
    gray = 230 - (x * 70) // width - (y * 20) // height        # paper darker to the right and bottom
    gray = np.where(((x // 5 + y // 7) % 4 == 0) & (y % 9 < 5), 40 + (x + y) % 17, gray)  # dark marks
    return gray.astype(np.uint8)

if __name__ == "__main__":
    gray = sample()
    flat = geometry.flatten_gray(gray, config)
    out = {"width": gray.shape[1], "height": gray.shape[0], "gray": gray.ravel().tolist(), "flat": flat.ravel().tolist()}
    (here / "flatten-fixture.json").write_text(json.dumps(out) + "\n")
    print(gray.min(), gray.max(), flat.min(), flat.max())
