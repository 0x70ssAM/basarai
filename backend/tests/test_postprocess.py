import io

from PIL import Image

from app.services.postprocess import resize_to_preset
from app.services.presets import PLATFORM_PRESETS


def _make_image(width: int, height: int, color: tuple[int, int, int] = (255, 0, 0)) -> bytes:
    image = Image.new("RGB", (width, height), color)
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def test_resize_same_aspect_downscales_correctly():
    src = _make_image(2048, 2048)
    result = resize_to_preset(src, 1080, 1080)
    out = Image.open(io.BytesIO(result))
    assert out.size == (1080, 1080)


def test_resize_wider_source_reaches_target_square():
    src = _make_image(2000, 1000)
    result = resize_to_preset(src, 1080, 1080)
    out = Image.open(io.BytesIO(result))
    assert out.size == (1080, 1080)


def test_resize_taller_source_reaches_target_square():
    src = _make_image(1000, 2000)
    result = resize_to_preset(src, 1080, 1080)
    out = Image.open(io.BytesIO(result))
    assert out.size == (1080, 1080)


def test_resize_tiny_source_upscales():
    src = _make_image(100, 100)
    result = resize_to_preset(src, 1080, 1080)
    out = Image.open(io.BytesIO(result))
    assert out.size == (1080, 1080)


def test_resize_every_preset_reaches_exact_dimensions():
    src = _make_image(1024, 1024)
    for key, (target_w, target_h, _label) in PLATFORM_PRESETS.items():
        result = resize_to_preset(src, target_w, target_h)
        out = Image.open(io.BytesIO(result))
        assert out.size == (target_w, target_h), f"{key} produced {out.size}"


def test_resize_output_is_png():
    src = _make_image(2000, 2000)
    result = resize_to_preset(src, 1080, 1080)
    assert Image.open(io.BytesIO(result)).format == "PNG"


# Regression: providers only offer a handful of fixed native sizes (OpenAI's
# landscape output is 1536x1024, a 3:2 ratio) which almost never matches an
# extreme-ratio preset like Twitter's 3:1 header or LinkedIn's 4:1 banner.
# The previous "cover scale + center-crop" implementation silently discarded
# whatever the model had composed in the cropped band -- up to 62% of the
# canvas for linkedin_banner. These tests fail under that old behavior (the
# corner markers land outside the visible canvas and are lost) and pass
# under the new "contain scale, letterbox the rest" behavior (every source
# pixel survives at its correctly scaled position).
MARKER = (0, 255, 0)
BACKGROUND = (10, 10, 10)
_MARKER_FRACTION = 0.08  # corner block size, as a fraction of the shorter side


def _corner_markers(width: int, height: int) -> tuple[bytes, int]:
    """A background-filled image with a solid marker block in each of the
    top-left and bottom-right corners. Returns the image bytes and the
    block size in source pixels (a single-pixel marker would get blended
    away by LANCZOS resampling; a block survives with a samplable core)."""
    block = max(4, round(min(width, height) * _MARKER_FRACTION))
    image = Image.new("RGB", (width, height), BACKGROUND)
    for x in range(block):
        for y in range(block):
            image.putpixel((x, y), MARKER)
            image.putpixel((width - 1 - x, height - 1 - y), MARKER)
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue(), block


def _assert_corner_survived(out: Image.Image, x: int, y: int, dx: int, dy: int) -> None:
    """Sample a few pixels in from (x, y) along (dx, dy), inset away from
    the block's own edge (which LANCZOS softens against the background),
    and assert the marker color clearly survived there."""
    px = out.getpixel((x + dx * 2, y + dy * 2))
    assert px[1] > 150 and px[0] < 100 and px[2] < 100, (
        f"expected marker-ish green at ({x + dx * 2}, {y + dy * 2}), got {px}"
    )


def test_resize_extreme_landscape_preset_preserves_all_source_content():
    # OpenAI's landscape native size, converted to Twitter's 3:1 header --
    # under the old center-crop this discarded 500 of the scaled 1000px
    # height (50%), i.e. exactly where these corner markers would land.
    src_w, src_h = 1536, 1024
    target_w, target_h = PLATFORM_PRESETS["twitter_header"][:2]
    src, _block = _corner_markers(src_w, src_h)

    result = resize_to_preset(src, target_w, target_h)
    out = Image.open(io.BytesIO(result)).convert("RGB")
    assert out.size == (target_w, target_h)

    scale = min(target_w / src_w, target_h / src_h)
    fg_w, fg_h = round(src_w * scale), round(src_h * scale)
    paste_x = (target_w - fg_w) // 2
    paste_y = (target_h - fg_h) // 2

    _assert_corner_survived(out, paste_x, paste_y, dx=1, dy=1)
    _assert_corner_survived(out, paste_x + fg_w - 1, paste_y + fg_h - 1, dx=-1, dy=-1)


def test_resize_extreme_portrait_preset_preserves_all_source_content():
    # OpenAI's portrait native size (1024x1536) into a 1:1 square target --
    # under the old crop this discarded content from the left and right
    # edges.
    src_w, src_h = 1024, 1536
    src, _block = _corner_markers(src_w, src_h)

    result = resize_to_preset(src, 1080, 1080)
    out = Image.open(io.BytesIO(result)).convert("RGB")
    assert out.size == (1080, 1080)

    scale = min(1080 / src_w, 1080 / src_h)
    fg_w, fg_h = round(src_w * scale), round(src_h * scale)
    paste_x = (1080 - fg_w) // 2
    paste_y = (1080 - fg_h) // 2

    _assert_corner_survived(out, paste_x, paste_y, dx=1, dy=1)
    _assert_corner_survived(out, paste_x + fg_w - 1, paste_y + fg_h - 1, dx=-1, dy=-1)


def test_resize_matching_aspect_ratio_is_not_padded_or_blurred():
    # Source and target share an aspect ratio exactly (a square source for
    # a square preset) -- contain-scale equals cover-scale, so there is no
    # border to fill and the output must be a plain resize, not a
    # composited/blurred canvas.
    src = Image.new("RGB", (1024, 1024), (200, 100, 50))
    out_bytes = io.BytesIO()
    src.save(out_bytes, format="PNG")

    result = resize_to_preset(out_bytes.getvalue(), 1080, 1080)
    out = Image.open(io.BytesIO(result)).convert("RGB")
    assert out.size == (1080, 1080)
    # A plain resize of a flat-color image stays that flat color everywhere
    # -- a blur/composite step would not change a uniform image, but this
    # also confirms no unexpected border was introduced at the edges.
    assert out.getpixel((0, 0)) == (200, 100, 50)
    assert out.getpixel((1079, 1079)) == (200, 100, 50)
