import re
from datetime import datetime, timezone

PLATFORM_PRESETS: dict[str, tuple[int, int, str]] = {
    "instagram_post":       (1080, 1080, "Instagram Post"),
    "instagram_story":      (1080, 1920, "Instagram Story"),
    "instagram_reel_cover": (1080, 1920, "Instagram Reel Cover"),
    "facebook_post":        (1200,  630, "Facebook Post"),
    "facebook_cover":       ( 820,  312, "Facebook Cover"),
    "facebook_story":       (1080, 1920, "Facebook Story"),
    "twitter_post":         (1200,  675, "Twitter Post"),
    "twitter_header":       (1500,  500, "Twitter Header"),
    "linkedin_post":        (1200,  627, "LinkedIn Post"),
    "linkedin_banner":      (1584,  396, "LinkedIn Banner"),
    "tiktok_video_cover":   (1080, 1920, "TikTok Video Cover"),
    "youtube_thumbnail":    (1280,  720, "YouTube Thumbnail"),
    "youtube_banner":       (2560, 1440, "YouTube Banner"),
}

# Gemini's image_config.aspect_ratio only accepts a fixed enum of 10
# values (1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9) -- each
# preset below maps to whichever of those is numerically closest to its
# true target ratio, so Gemini composes as close to the final canvas as
# it can natively produce. Values marked exact match the preset's true
# ratio exactly; the rest are the nearest available approximation.
PRESET_TO_ASPECT_RATIO: dict[str, str] = {
    "instagram_post":       "1:1",   # 1200:1200 = 1.000 -- exact
    "instagram_story":      "9:16",  # 1080:1920 = 0.562 -- exact
    "instagram_reel_cover": "9:16",  # 1080:1920 = 0.562 -- exact
    "facebook_post":        "16:9",  # 1200:630  = 1.905 -- nearest (16:9=1.778)
    "facebook_cover":       "21:9",  # 820:312   = 2.628 -- nearest (21:9=2.333)
    "facebook_story":       "9:16",  # 1080:1920 = 0.562 -- exact
    "twitter_post":         "16:9",  # 1200:675  = 1.778 -- exact
    "twitter_header":       "21:9",  # 1500:500  = 3.000 -- nearest (21:9=2.333)
    "linkedin_post":        "16:9",  # 1200:627  = 1.914 -- nearest (16:9=1.778)
    "linkedin_banner":      "21:9",  # 1584:396  = 4.000 -- nearest (21:9=2.333)
    "tiktok_video_cover":   "9:16",  # 1080:1920 = 0.562 -- exact
    "youtube_thumbnail":    "16:9",  # 1280:720  = 1.778 -- exact
    "youtube_banner":       "16:9",  # 2560:1440 = 1.778 -- exact
}

MODEL_FOR_PROVIDER: dict[str, str] = {
    "openai": "gpt-image-2",
    "gemini": "gemini-3-pro-image-preview",
}

_BRAND_NAME_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def sanitize_brand_name(raw: str) -> str:
    cleaned = _BRAND_NAME_NON_ALNUM.sub("-", raw.lower()).strip("-")
    if not cleaned:
        return "brand"
    truncated = cleaned[:40].rstrip("-")
    return truncated or "brand"


def build_download_filename(
    brand_name: str, preset_identifier: str, completed_at: datetime
) -> str:
    ts = completed_at.astimezone(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return f"{sanitize_brand_name(brand_name)}-{preset_identifier}-{ts}.png"
