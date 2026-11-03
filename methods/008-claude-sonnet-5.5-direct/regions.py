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
    if not isinstance(parsed, dict) or set(parsed) != {"regions"} or not isinstance(parsed["regions"], list):
        raise ValueError("Expected an object containing a regions array.")
    required = {"type", "box_1000", "keep", "reading_order", "uncertain"}
    allowed = {"verse", "commentary", "lead_in", "footnote", "running_header", "page_number", "other"}
    regions, warnings = [], []
    for index, region in enumerate(parsed["regions"], 1):
        if not isinstance(region, dict) or set(region) != required or region["type"] not in allowed:
            raise ValueError("Invalid region fields or type at region " + str(index))
        box = region["box_1000"]
        if (not isinstance(box, list) or len(box) != 4 or
                any(type(value) is not int or not 0 <= value <= 1000 for value in box) or
                box[0] >= box[2] or box[1] >= box[3]):
            raise ValueError("Invalid normalized rectangle at region " + str(index))
        if type(region["keep"]) is not bool or type(region["uncertain"]) is not bool:
            raise ValueError("Invalid boolean flag at region " + str(index))
        order = region["reading_order"]
        if order is not None and (type(order) is not int or order < 1):
            raise ValueError("Invalid reading order at region " + str(index))
        if region["keep"] and order is None:
            warnings.append("Kept region " + str(index) + " has no reading order.")
        if region["type"] in {"running_header", "page_number"} and region["keep"]:
            warnings.append("Furniture region " + str(index) + " is marked keep=true.")
        regions.append(dict(region, region_id=index, label=region["type"],
                            box=[box[0]*width/1000, box[1]*height/1000,
                                 box[2]*width/1000, box[3]*height/1000]))
    orders = [r["reading_order"] for r in regions if r["keep"] and r["reading_order"] is not None]
    if sorted(orders) != list(range(1, len(orders)+1)):
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
        if region["type"] == "footnote":
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
