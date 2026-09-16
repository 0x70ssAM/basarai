from app.services.presets import PLATFORM_PRESETS
from app.services.providers.openai_image import (
    _MAX_EDGE,
    _MAX_PIXELS,
    _MAX_RATIO,
    _MIN_PIXELS,
    _MIN_RATIO,
    compute_request_size,
)


# gpt-image-2's real, documented constraints for the images/generations
# `size` parameter: both edges a multiple of 16, aspect ratio within
# [1:3, 3:1], each edge <=3840px, total pixels within
# [655_360, 8_294_400]. This is the regression test protecting against
# the original bug's root cause: requesting a size OpenAI doesn't
# actually support the true target ratio for (previously: always one of
# three fixed buckets, regardless of the target), which forced large,
# destructive post-generation cropping to reach the real preset
# dimensions.
def test_compute_request_size_satisfies_openai_constraints_for_every_preset():
    for key, (target_w, target_h, _label) in PLATFORM_PRESETS.items():
        req_w, req_h = compute_request_size(target_w, target_h)

        assert req_w % 16 == 0, f"{key}: width {req_w} not a multiple of 16"
        assert req_h % 16 == 0, f"{key}: height {req_h} not a multiple of 16"
        assert req_w <= _MAX_EDGE, f"{key}: width {req_w} exceeds max edge"
        assert req_h <= _MAX_EDGE, f"{key}: height {req_h} exceeds max edge"
        pixels = req_w * req_h
        assert _MIN_PIXELS <= pixels <= _MAX_PIXELS, (
            f"{key}: {pixels} px outside [{_MIN_PIXELS}, {_MAX_PIXELS}]"
        )
        ratio = req_w / req_h
        assert _MIN_RATIO - 1e-9 <= ratio <= _MAX_RATIO + 1e-9, (
            f"{key}: ratio {ratio:.3f} outside [{_MIN_RATIO:.3f}, {_MAX_RATIO}]"
        )


def test_compute_request_size_matches_true_ratio_for_presets_within_openai_range():
    # Every preset except LinkedIn's banner (4:1, exceeding OpenAI's 3:1
    # cap) has a true ratio OpenAI can produce directly -- the requested
    # size should match it closely (only the small 16px-rounding
    # difference), not be forced to an unrelated fixed bucket the way
    # the original bug's _openai_size(width, height) always did.
    for key, (target_w, target_h, _label) in PLATFORM_PRESETS.items():
        if key == "linkedin_banner":
            continue
        true_ratio = target_w / target_h
        req_w, req_h = compute_request_size(target_w, target_h)
        req_ratio = req_w / req_h
        assert abs(req_ratio - true_ratio) < 0.05, (
            f"{key}: requested ratio {req_ratio:.3f} drifted too far from "
            f"true ratio {true_ratio:.3f}"
        )


def test_compute_request_size_clamps_linkedin_banner_to_openai_max_ratio():
    # LinkedIn's banner is 4:1 -- the one preset in this app whose ratio
    # exceeds what gpt-image-2 can produce natively (max 3:1). The
    # request should be clamped to (at most) 3:1, not silently drift to
    # an arbitrary bucket.
    target_w, target_h, _label = PLATFORM_PRESETS["linkedin_banner"]
    req_w, req_h = compute_request_size(target_w, target_h)
    assert req_w / req_h <= _MAX_RATIO + 1e-9


def test_compute_request_size_is_deterministic():
    for target_w, target_h, _label in PLATFORM_PRESETS.values():
        assert compute_request_size(target_w, target_h) == compute_request_size(
            target_w, target_h
        )
