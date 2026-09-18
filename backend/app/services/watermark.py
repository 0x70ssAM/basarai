import io

from PIL import Image, ImageStat

WATERMARK_SCALE = 0.15
WATERMARK_OPACITY = 0.70
WATERMARK_MARGIN_PX = 20

# Fight Club Academy's own real marketing always places its logo
# top-left (every reference the brand has shared uses that corner), so
# that's the default and the tie-break winner. We only move away from it
# when another corner is meaningfully "cleaner" -- i.e. the generated
# composition put busy content (a face, text, the discount graphic) right
# where the watermark would otherwise sit.
_CORNERS = ("top_left", "top_right", "bottom_left", "bottom_right")
_SWITCH_THRESHOLD = 0.85  # another corner must score below 85% of top-left's detail to win


def _corner_box(
    width: int, height: int, logo_w: int, logo_h: int, corner: str
) -> tuple[int, int, int, int]:
    if corner == "top_left":
        return (0, 0, logo_w, logo_h)
    if corner == "top_right":
        return (width - logo_w, 0, width, logo_h)
    if corner == "bottom_left":
        return (0, height - logo_h, logo_w, height)
    return (width - logo_w, height - logo_h, width, height)  # bottom_right


def _corner_detail(base_gray: Image.Image, box: tuple[int, int, int, int]) -> float:
    """A simple, deterministic "how busy is this region" proxy: the
    standard deviation of grayscale pixel values. A flat sky/wall/backdrop
    scores near 0; a face, dense text, or a high-contrast graphic scores
    much higher.
    """
    return ImageStat.Stat(base_gray.crop(box)).stddev[0]


def _choose_corner(base: Image.Image, logo_w: int, logo_h: int) -> str:
    base_gray = base.convert("L")
    scores = {
        corner: _corner_detail(
            base_gray, _corner_box(base.width, base.height, logo_w, logo_h, corner)
        )
        for corner in _CORNERS
    }

    best_corner = "top_left"
    best_score = scores["top_left"]
    for corner in _CORNERS[1:]:
        if scores[corner] < best_score * _SWITCH_THRESHOLD:
            best_corner = corner
            best_score = scores[corner]
    return best_corner


def _corner_origin(
    width: int, height: int, logo_w: int, logo_h: int, margin: int, corner: str
) -> tuple[int, int]:
    if corner == "top_left":
        return margin, margin
    if corner == "top_right":
        return width - logo_w - margin, margin
    if corner == "bottom_left":
        return margin, height - logo_h - margin
    return width - logo_w - margin, height - logo_h - margin  # bottom_right


def apply_watermark(image_bytes: bytes, logo_bytes: bytes) -> bytes:
    base = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    logo = Image.open(io.BytesIO(logo_bytes)).convert("RGBA")

    max_logo_w = max(1, round(base.width * WATERMARK_SCALE))
    max_logo_h = max(1, base.height - (2 * WATERMARK_MARGIN_PX))
    scale = min(max_logo_w / logo.width, max_logo_h / logo.height)
    target_logo_w = max(1, round(logo.width * scale))
    target_logo_h = max(1, round(logo.height * scale))
    logo = logo.resize(
        (target_logo_w, target_logo_h), Image.Resampling.LANCZOS
    )

    r, g, b, a = logo.split()
    a = a.point(lambda px: int(px * WATERMARK_OPACITY))
    logo = Image.merge("RGBA", (r, g, b, a))

    corner = _choose_corner(base, target_logo_w, target_logo_h)
    x, y = _corner_origin(
        base.width, base.height, target_logo_w, target_logo_h, WATERMARK_MARGIN_PX, corner
    )
    base.alpha_composite(logo, dest=(x, y))

    out = io.BytesIO()
    base.convert("RGB").save(out, format="PNG")
    return out.getvalue()
