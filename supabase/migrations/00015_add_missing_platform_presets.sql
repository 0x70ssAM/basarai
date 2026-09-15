-- The application's canonical preset list (backend/app/services/presets.py,
-- frontend/lib/presets.ts) includes instagram_reel_cover, facebook_cover,
-- and tiktok_video_cover, but 00001_extensions_types_helpers.sql never added
-- them to platform_preset_t. Generation requests using these presets fail
-- with "invalid input value for enum platform_preset_t" (Postgres error
-- 22P02). Add the missing values; existing unused values are left in place
-- since Postgres does not support removing enum values.
ALTER TYPE platform_preset_t ADD VALUE IF NOT EXISTS 'instagram_reel_cover';
ALTER TYPE platform_preset_t ADD VALUE IF NOT EXISTS 'facebook_cover';
ALTER TYPE platform_preset_t ADD VALUE IF NOT EXISTS 'tiktok_video_cover';
