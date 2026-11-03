"""Check the uploaded image against Claude's documented high-resolution tier."""
import math


def image_fit(width, height):
    padded_width = math.ceil(width/28)*28
    padded_height = math.ceil(height/28)*28
    tokens = (padded_width//28)*(padded_height//28)
    fits = padded_width <= 2576 and padded_height <= 2576 and tokens <= 4784
    return {
        "tier":"high-resolution",
        "unpadded_dimensions":[width,height],
        "padded_dimensions":[padded_width,padded_height],
        "visual_tokens":tokens,
        "max_edge":2576,
        "max_visual_tokens":4784,
        "fits_without_resize":fits,
        "coordinate_mapping":"identity on original unpadded pixels",
        "source":"https://platform.claude.com/docs/en/build-with-claude/vision-coordinates",
    }
