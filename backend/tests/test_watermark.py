import io

from PIL import Image

from app.services.watermark import WATERMARK_MARGIN_PX, WATERMARK_SCALE, apply_watermark


def _solid_rgb(w: int, h: int, color: tuple[int, int, int]) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (w, h), color).save(out, format="PNG")
    return out.getvalue()


def _solid_rgba_logo(w: int, h: int) -> bytes:
    out = io.BytesIO()
    Image.new("RGBA", (w, h), (0, 255, 0, 255)).save(out, format="PNG")
    return out.getvalue()


def test_watermark_output_same_base_size():
    base = _solid_rgb(1080, 1080, (255, 0, 0))
    logo = _solid_rgba_logo(200, 200)
    result = apply_watermark(base, logo)
    out = Image.open(io.BytesIO(result))
    assert out.size == (1080, 1080)


def test_watermark_output_is_png():
    base = _solid_rgb(1080, 1080, (255, 0, 0))
    logo = _solid_rgba_logo(200, 200)
    result = apply_watermark(base, logo)
    assert Image.open(io.BytesIO(result)).format == "PNG"


def _expected_logo_dims(base_w: int, base_h: int, logo_w: int, logo_h: int) -> tuple[int, int]:
    max_w = round(base_w * WATERMARK_SCALE)
    max_h = base_h - (2 * WATERMARK_MARGIN_PX)
    scale = min(max_w / logo_w, max_h / logo_h)
    return round(logo_w * scale), round(logo_h * scale)


def test_watermark_defaults_to_top_left_on_a_uniform_image():
    # A flat-color base has zero detail everywhere, so no corner is
    # "cleaner" than another -- top-left must win as the default/tie
    # break (matches Fight Club Academy's own real branding, which
    # always places its logo top-left).
    base = _solid_rgb(1080, 1080, (255, 0, 0))
    logo = _solid_rgba_logo(400, 400)
    result = apply_watermark(base, logo)
    out = Image.open(io.BytesIO(result)).convert("RGB")

    logo_w, logo_h = _expected_logo_dims(1080, 1080, 400, 400)
    cx = WATERMARK_MARGIN_PX + logo_w // 2
    cy = WATERMARK_MARGIN_PX + logo_h // 2
    pixel = out.getpixel((cx, cy))
    assert pixel != (255, 0, 0)
    assert pixel[1] > pixel[0]

    # The other three corners must be untouched.
    assert out.getpixel((1079, 1079)) == (255, 0, 0)  # bottom-right
    assert out.getpixel((1079, 0)) == (255, 0, 0)      # top-right
    assert out.getpixel((0, 1079)) == (255, 0, 0)      # bottom-left


def test_watermark_moves_away_from_a_busy_top_left():
    # Paint the top-left quadrant with real, high-detail noise (a
    # deterministic per-pixel gradient/checker pattern -- distinctly
    # "busy" by the same stddev metric apply_watermark uses) and leave
    # the rest of the canvas flat. The watermark must land somewhere
    # other than that busy top-left region.
    size = 1080
    image = Image.new("RGB", (size, size), (20, 20, 20))
    quadrant = size // 2
    for x in range(quadrant):
        for y in range(quadrant):
            v = (x * 37 + y * 53) % 256
            image.putpixel((x, y), (v, 255 - v, (v * 2) % 256))
    out_bytes = io.BytesIO()
    image.save(out_bytes, format="PNG")

    logo = _solid_rgba_logo(300, 300)
    result = apply_watermark(out_bytes.getvalue(), logo)
    out = Image.open(io.BytesIO(result)).convert("RGB")

    logo_w, logo_h = _expected_logo_dims(size, size, 300, 300)
    tl_cx = WATERMARK_MARGIN_PX + logo_w // 2
    tl_cy = WATERMARK_MARGIN_PX + logo_h // 2
    # The busy noise pattern is essentially never pure green -- if the
    # watermark had landed here (the old fixed-corner bug), this pixel
    # would show the logo's green instead.
    top_left_pixel = out.getpixel((tl_cx, tl_cy))
    assert not (top_left_pixel[1] > top_left_pixel[0] and top_left_pixel[1] > top_left_pixel[2])


def test_watermark_margin_is_20_px_from_its_chosen_corner():
    base = _solid_rgb(1080, 1080, (255, 0, 0))
    logo = _solid_rgba_logo(400, 400)
    result = apply_watermark(base, logo)
    out = Image.open(io.BytesIO(result)).convert("RGB")

    # Uniform base -> top-left default -> the far corner (bottom-right)
    # must be completely untouched.
    assert out.getpixel((1079, 1079)) == (255, 0, 0)
    # And the watermark itself must start exactly WATERMARK_MARGIN_PX
    # from the top-left edge, not flush against it.
    assert out.getpixel((0, 0)) == (255, 0, 0)
    assert out.getpixel((WATERMARK_MARGIN_PX - 1, WATERMARK_MARGIN_PX - 1)) == (255, 0, 0)
