import io

from PIL import Image, ImageFilter


def resize_to_preset(
    image_bytes: bytes, target_width: int, target_height: int
) -> bytes:
    """Fit a provider-generated image onto the exact preset canvas.

    Providers only offer a small, fixed menu of native sizes (OpenAI:
    square / ~3:2 landscape / ~2:3 portrait; Gemini: a handful of discrete
    aspect ratios), which rarely matches a platform preset's true ratio --
    e.g. Twitter's header is 3:1, LinkedIn's banner is 4:1, neither
    achievable natively. A naive "scale to cover, then center-crop" (the
    previous approach here) silently discards whatever the model composed
    near the edges: up to ~50-62% of the canvas for the most extreme
    presets, since the model is never told a crop is coming.

    Instead: scale to *contain* (the whole source always fits inside the
    target, nothing is ever cut off) and center it. Any leftover border --
    only present when the source and target ratios don't already match --
    is filled with a blurred, edge-to-edge copy of the same image rather
    than a flat color bar, so the canvas has no raw, obviously-padded
    edges. The exact target pixel dimensions are still always produced.
    """
    image = Image.open(io.BytesIO(image_bytes))
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA" if "A" in image.mode else "RGB")

    img_w, img_h = image.size

    contain_scale = min(target_width / img_w, target_height / img_h)
    fg_w = max(1, round(img_w * contain_scale))
    fg_h = max(1, round(img_h * contain_scale))
    foreground = image.resize((fg_w, fg_h), Image.Resampling.LANCZOS)

    if fg_w == target_width and fg_h == target_height:
        # Source and target ratios already match (e.g. a square source
        # for a square preset) -- no padding needed, nothing to blur.
        canvas = foreground
    else:
        cover_scale = max(target_width / img_w, target_height / img_h)
        bg_w = max(1, round(img_w * cover_scale))
        bg_h = max(1, round(img_h * cover_scale))
        background = image.resize((bg_w, bg_h), Image.Resampling.LANCZOS)
        bg_left = (bg_w - target_width) // 2
        bg_top = (bg_h - target_height) // 2
        background = background.crop(
            (bg_left, bg_top, bg_left + target_width, bg_top + target_height)
        )
        blur_radius = max(2, min(target_width, target_height) // 40)
        background = background.filter(ImageFilter.GaussianBlur(blur_radius))

        canvas = background.convert(foreground.mode)
        paste_x = (target_width - fg_w) // 2
        paste_y = (target_height - fg_h) // 2
        if foreground.mode == "RGBA":
            canvas.paste(foreground, (paste_x, paste_y), foreground)
        else:
            canvas.paste(foreground, (paste_x, paste_y))

    out = io.BytesIO()
    canvas.save(out, format="PNG")
    return out.getvalue()
