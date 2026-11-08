"""Images for method 044's request, from a page image and method 043's regions. Local only.

- overview: the page with each region's outline in color and a tag with its id beside it;
- context: the first or last few line pieces of a region of a neighboring page, cut out the same way, with no strip;
- cutout: one region cut out of the page, with everything outside its polygons set to white, and a gray strip
  at the left with the numbers 1, 2, … at the height of each of its line pieces.

Only numpy and Pillow are used (polygon fill, crop, drawing), so the same steps can run on a browser canvas."""
import numpy as np
from PIL import Image, ImageDraw, ImageFont

PALETTE = [(220, 50, 47), (38, 139, 210), (133, 153, 0), (211, 54, 130), (42, 161, 152), (203, 75, 22),
           (108, 113, 196), (181, 137, 0), (0, 128, 64), (160, 80, 0)]


def font(size):
    for name in ["/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Helvetica.ttc"]:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def polygon_mask(rings, width, height, dx=0, dy=0):
    """Pixels inside or on the rings (pixel-center coordinates), shifted by (-dx, -dy)."""
    m = Image.new("L", (width, height), 0)
    d = ImageDraw.Draw(m)
    for ring in rings:
        pts = [(x - dx, y - dy) for x, y in ring]
        if len(pts) >= 3:
            d.polygon(pts, fill=255, outline=255)
        elif pts:
            d.line(pts, fill=255)
    return np.asarray(m) > 0


def line_pieces(region):
    """The region's line pieces that have polygons, in order: (line id, top, bottom)."""
    out = []
    for L in region["lines"]:
        if L.get("polygons"):
            ys = [p[1] for ring in L["polygons"] for p in ring]
            out.append((L["line_id"], min(ys), max(ys)))
    return out


def cutout(rgb, region, char_h, cfg):
    height, width = rgb.shape[:2]
    x1, y1, x2, y2 = region["bounds"]
    pad = round(cfg["cutout_padding_char"] * char_h)
    X1, Y1, X2, Y2 = max(0, x1 - pad), max(0, y1 - pad), min(width, x2 + pad), min(height, y2 + pad)
    crop = rgb[Y1:Y2, X1:X2].copy()
    inside = polygon_mask(region["polygons"], X2 - X1, Y2 - Y1, X1, Y1)
    crop[~inside] = 255
    gutter = max(cfg["gutter_min_px"], round(cfg["gutter_width_char"] * char_h))
    out = Image.new("RGB", (gutter + crop.shape[1], crop.shape[0]), (255, 255, 255))
    out.paste(Image.fromarray(crop), (gutter, 0))
    d = ImageDraw.Draw(out)
    d.rectangle([0, 0, gutter - 4, out.height - 1], fill=(222, 222, 222))
    f = font(max(cfg["gutter_font_min_px"], round(cfg["gutter_font_char"] * char_h)))
    pieces = line_pieces(region)
    for n, (_, top, bottom) in enumerate(pieces, 1):
        d.text(((gutter - 4) / 2, (top + bottom) / 2 - Y1), str(n), fill=(40, 40, 40), font=f, anchor="mm")
    return out, dict(crop_box=[X1, Y1, X2, Y2], gutter_px=gutter, line_ids=[p[0] for p in pieces])


def overview(rgb, regions, char_h, cfg):
    img = Image.fromarray(rgb).convert("RGB")
    d = ImageDraw.Draw(img)
    f = font(max(cfg["overview_label_min_px"], round(cfg["overview_label_char"] * char_h)))
    for i, (rid, region) in enumerate(regions):
        color = PALETTE[i % len(PALETTE)]
        for ring in region["polygons"]:
            d.line([tuple(p) for p in ring + ring[:1]], fill=color, width=cfg["overview_outline_px"])
    boxes = [r["bounds"] for _, r in regions]
    placed = []
    W, H = img.size
    for i, (rid, region) in enumerate(regions):
        color = PALETTE[i % len(PALETTE)]
        x1, y1, x2, y2 = region["bounds"]
        tw, th = d.textbbox((0, 0), rid, font=f)[2:]
        w, h = tw + 8, th + 6
        # Left of the region, right of it, above it, then inside its top-left corner: the first that overlaps no
        # region's bounds (other than its own) and no tag already placed.
        candidates = [(x1 - w - 4, y1), (x2 + 4, y1), (x1, y1 - h - 2), (x1, y1)]

        def free(x, y):
            if x < 0 or y < 0 or x + w > W or y + h > H:
                return False
            rect = (x, y, x + w, y + h)
            others = [b for j, b in enumerate(boxes) if j != i] + placed
            return not any(rect[0] < b[2] and b[0] < rect[2] and rect[1] < b[3] and b[1] < rect[3] for b in others)

        x, y = next((c for c in candidates if free(*c)), candidates[-1])
        placed.append((x, y, x + w, y + h))
        d.rectangle([x, y, x + w, y + h], fill=(255, 255, 255), outline=color, width=2)
        d.text((x + 4, y + 2), rid, fill=color, font=f)
    return img


def context(rgb, region, char_h, cfg, which, n_lines):
    """The first (which="first") or last n_lines line pieces of a region, cut out with the region's polygons."""
    height, width = rgb.shape[:2]
    pieces = line_pieces(region)
    pieces = pieces[:n_lines] if which == "first" else pieces[-n_lines:]
    if not pieces:
        return None, None
    polys = [p for L in region["lines"] if L["line_id"] in {q[0] for q in pieces} for p in L["polygons"]]
    xs = [x for ring in polys for x, _ in ring]
    ys = [y for ring in polys for _, y in ring]
    pad = round(cfg["cutout_padding_char"] * char_h)
    X1, Y1, X2, Y2 = max(0, min(xs) - pad), max(0, min(ys) - pad), min(width, max(xs) + pad + 1), min(height, max(ys) + pad + 1)
    crop = rgb[Y1:Y2, X1:X2].copy()
    inside = polygon_mask(polys, X2 - X1, Y2 - Y1, X1, Y1)
    crop[~inside] = 255
    out = Image.fromarray(crop)
    d = ImageDraw.Draw(out)
    d.rectangle([0, 0, out.width - 1, out.height - 1], outline=(150, 150, 150), width=2)
    return out, dict(crop_box=[X1, Y1, X2, Y2], line_ids=[p[0] for p in pieces])
