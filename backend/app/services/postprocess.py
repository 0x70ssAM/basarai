import io

from PIL import Image


def resize_to_preset(
    image_bytes: bytes, target_width: int, target_height: int
) -> bytes:
    """Fit a provider-generated image onto the exact preset canvas.

    Both providers are now asked to generate as close to the true target
    ratio as their own API allows (see openai_image.compute_request_size
    and presets.PRESET_TO_ASPECT_RATIO), so by the time an image reaches
    here its aspect ratio is already an exact or near-exact match for the
    target -- this only needs to correct a small, bounded remainder (at
    most a 16px-rounding difference for most presets, or the deliberate,
    disclosed ~15% crop for LinkedIn's banner, the one preset whose 4:1
    ratio exceeds what either provider can produce natively). A plain
    "scale to cover, center-crop" is safe here precisely because that
    remainder is always small -- it does not manufacture new pixels
    (padding/letterboxing) and does not discard large, unrelated portions
    of the composition the way it would if applied to a wildly mismatched
    source (which is exactly the bug this replaced).
    """
    image = Image.open(io.BytesIO(image_bytes))
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA" if "A" in image.mode else "RGB")

    img_w, img_h = image.size
    scale = max(target_width / img_w, target_height / img_h)
    new_w = int(round(img_w * scale))
    new_h = int(round(img_h * scale))
    image = image.resize((new_w, new_h), Image.Resampling.LANCZOS)

    left = (new_w - target_width) // 2
    top = (new_h - target_height) // 2
    image = image.crop((left, top, left + target_width, top + target_height))

    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()
