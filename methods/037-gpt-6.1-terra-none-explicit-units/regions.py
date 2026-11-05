"""Region validation, coordinate conversion and display for the direct model comparison."""
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from diagnostics import rasterize_boxes

PROJECT_DIR=Path(__file__).resolve().parent.parent.parent


def digest(data):
    return hashlib.sha256(data).hexdigest()


def display_path(path):
    try:
        return path.relative_to(PROJECT_DIR).as_posix()
    except ValueError:
        return str(path)


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def validate_and_scale(parsed, width, height):
    """Validate provider-native boxes and derive common x/y pixel rectangles."""
    import math
    mode = json.loads((Path(__file__).resolve().parent/"config.json").read_text())["coordinate_format"]
    raw_key = "box_pixels" if mode == "xyxy_pixels" else "box_1000"
    required = {"type", raw_key, "keep", "reading_order", "uncertain"}
    allowed = {"verse", "paragraph", "heading", "lead_in", "list_item", "formula", "note", "table", "figure", "caption", "running_header", "page_number", "other"}
    if not isinstance(parsed, dict) or set(parsed) != {"regions"} or not isinstance(parsed["regions"], list):
        raise ValueError("Expected an object containing a regions array.")
    regions, warnings = [], []
    for index, region in enumerate(parsed["regions"], 1):
        if not isinstance(region, dict) or set(region) != required or region["type"] not in allowed:
            raise ValueError("Invalid fields or type at region "+str(index))
        raw_box = region[raw_key]
        if (not isinstance(raw_box, list) or len(raw_box) != 4 or
                any(type(v) not in [int,float] or not math.isfinite(v) for v in raw_box)):
            raise ValueError("Expected four finite coordinates at region "+str(index))
        if mode != "xyxy_pixels" and any(type(v) is not int or not 0 <= v <= 1000 for v in raw_box):
            raise ValueError("Expected integer coordinates in 0..1000 at region "+str(index))
        a,b,c,d = raw_box
        if mode == "yxyx_1000":
            pixel_box = [b*width/1000,a*height/1000,d*width/1000,c*height/1000]
        elif mode == "xyxy_1000":
            pixel_box = [a*width/1000,b*height/1000,c*width/1000,d*height/1000]
        elif mode == "xyxy_pixels":
            pixel_box = [a,b,c,d]
        else:
            raise ValueError("Unsupported coordinate format: "+mode)
        if pixel_box[0] >= pixel_box[2] or pixel_box[1] >= pixel_box[3]:
            raise ValueError("Nonpositive rectangle at region "+str(index))
        clamped = [min(max(pixel_box[0],0),width),min(max(pixel_box[1],0),height),
                   min(max(pixel_box[2],0),width),min(max(pixel_box[3],0),height)]
        adjustment = None
        if clamped != pixel_box:
            adjustment = {"operation":"clamp to unpadded image bounds","before":pixel_box,"after":clamped}
            warnings.append("Region "+str(index)+" coordinates clamped to image bounds.")
        if clamped[0] >= clamped[2] or clamped[1] >= clamped[3]:
            raise ValueError("Rectangle lies outside the image at region "+str(index))
        if type(region["keep"]) is not bool or type(region["uncertain"]) is not bool:
            raise ValueError("Invalid boolean flags at region "+str(index))
        order = region["reading_order"]
        if order is not None and (type(order) is not int or order < 1):
            raise ValueError("Invalid reading order at region "+str(index))
        if region["keep"] and order is None:
            warnings.append("Kept region "+str(index)+" has no reading order.")
        if region["type"] in {"running_header","page_number"} and region["keep"]:
            warnings.append("Furniture region "+str(index)+" is marked keep=true.")
        x1,y1,x2,y2 = clamped
        derived = dict(region, region_id=index, label=region["type"], box=clamped,
                       box_xyxy_1000=[x1*1000/width,y1*1000/height,x2*1000/width,y2*1000/height])
        if adjustment is not None:
            derived["coordinate_adjustment"] = adjustment
        regions.append(derived)
    orders = [r["reading_order"] for r in regions if r["keep"] and r["reading_order"] is not None]
    if sorted(orders) != list(range(1,len(orders)+1)):
        warnings.append("Kept-region reading orders are not unique and consecutive.")
    return regions, warnings


def draw_overlay(rgb, regions, mask):
    pixels = rgb.copy()
    covered = rasterize_boxes(regions, mask.shape)
    pixels[(mask > 0) & (covered == 0)] = [235, 40, 65]
    image = Image.fromarray(pixels)
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=max(18, image.width // 48))
    occupied = []
    for region in regions:
        x1, y1, x2, y2 = region["box"]
        color = "#087db2" if region["keep"] else "#7a55ad"
        draw.rectangle((x1, y1, x2, y2), outline=color, width=max(2, image.width // 450))
        label = ("H" if region["type"] == "running_header" else
                 "PN" if region["type"] == "page_number" else
                 str(region["reading_order"]) if region["reading_order"] is not None else "F")
        left, top, right, bottom = draw.textbbox((0, 0), label, font=font)
        width, height = right-left+12, bottom-top+10
        if region["type"] == "note":
            tx, ty = max(0, x1), min(y2+3, image.height-height-1)
        else:
            tx, ty = max(0, x1-width-5), min(max(0, y1), image.height-height-1)
        while any(tx < b[2] and tx+width > b[0] and ty < b[3] and ty+height > b[1] for b in occupied):
            if ty+2*height+4 < image.height:
                ty += height+3
            else:
                tx += width+3
        occupied.append((tx, ty, tx+width, ty+height))
        draw.rectangle((tx, ty, tx+width, ty+height), fill=color)
        draw.text((tx+6-left, ty+5-top), label, fill="white", font=font)
    return image
