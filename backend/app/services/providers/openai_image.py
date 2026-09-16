import base64
import logging

import httpx

from app.services.providers.base import ProviderError, ProviderResult

logger = logging.getLogger(__name__)

OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations"

# gpt-image-2 (and the gpt-image-2.x family) accepts arbitrary
# WIDTHxHEIGHT sizes -- not just a handful of fixed presets -- subject to:
# both edges a multiple of 16, aspect ratio within [1:3, 3:1], each edge
# <=3840px, and total pixels within [655_360, 8_294_400]. Requesting the
# real target ratio directly (instead of picking from {1024x1024,
# 1536x1024, 1024x1536}) means the model composes for the actual final
# canvas, so downstream post-processing only ever has to correct a small
# 16px-rounding remainder -- not force an unrelated ratio into place.
_MIN_EDGE = 16
_MAX_EDGE = 3840
_MIN_PIXELS = 655_360
_MAX_PIXELS = 8_294_400
_MIN_RATIO = 1 / 3
_MAX_RATIO = 3.0


def _round_to_16(value: float) -> int:
    return max(_MIN_EDGE, round(value / 16) * 16)


def compute_request_size(target_width: int, target_height: int) -> tuple[int, int]:
    """The size to request from OpenAI for a given preset's true target
    dimensions, honoring gpt-image-2's real constraints (see module
    docstring above). Only a preset whose ratio exceeds 3:1 (LinkedIn's
    4:1 banner is the sole case in this app's preset list) gets its
    ratio clamped -- the caller still needs a small, bounded crop to
    reach the true target ratio in that one case.
    """
    ratio = target_width / target_height
    clamped_ratio = min(max(ratio, _MIN_RATIO), _MAX_RATIO)

    target_pixels = target_width * target_height
    desired_pixels = min(max(target_pixels, _MIN_PIXELS), _MAX_PIXELS)

    req_h = (desired_pixels / clamped_ratio) ** 0.5
    req_w = req_h * clamped_ratio

    req_w = _round_to_16(min(req_w, _MAX_EDGE))
    req_h = _round_to_16(min(req_h, _MAX_EDGE))

    # 16px rounding can nudge the result just outside a bound -- correct
    # in small, deterministic steps rather than assuming the rounded
    # values are always already valid.
    guard = 0
    while req_w * req_h < _MIN_PIXELS and guard < 20:
        req_w += 16
        req_h += 16
        guard += 1
    guard = 0
    while (req_w * req_h > _MAX_PIXELS or max(req_w, req_h) > _MAX_EDGE) and guard < 40:
        req_w -= 16
        req_h -= 16
        guard += 1
    guard = 0
    while req_w / req_h > _MAX_RATIO and guard < 40:
        req_w -= 16
        guard += 1
    guard = 0
    while req_w / req_h < _MIN_RATIO and guard < 40:
        req_h -= 16
        guard += 1

    return req_w, req_h


async def openai_generate(
    *,
    api_key: str,
    prompt: str,
    width: int,
    height: int,
    model: str,
) -> ProviderResult:
    req_w, req_h = compute_request_size(width, height)
    logger.info(
        "openai_generate: model=%s target=%dx%d request=%dx%d",
        model, width, height, req_w, req_h,
    )
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
        response = await client.post(
            OPENAI_IMAGES_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "prompt": prompt,
                "size": f"{req_w}x{req_h}",
                "n": 1,
            },
        )
        if response.status_code >= 400:
            logger.error(
                "openai_generate http error: status=%s request_id=%s body=%s",
                response.status_code,
                response.headers.get("x-request-id"),
                response.text[:1000],
            )
        response.raise_for_status()
        data = response.json()

    try:
        b64 = data["data"][0]["b64_json"]
    except (KeyError, IndexError, TypeError) as e:
        raise ProviderError(
            "EMPTY_RESPONSE",
            "The provider returned no image. Please try again.",
        ) from e

    return ProviderResult(
        image_bytes=base64.b64decode(b64),
        request_id=response.headers.get("x-request-id"),
    )
