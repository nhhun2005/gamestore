-- Remove only the revision tracking requested by the user. Keep V4 unchanged
-- because it is already recorded in Flyway history.
DROP INDEX IF EXISTS public.game_submissions_revision_idx;
ALTER TABLE public.game_submissions DROP COLUMN IF EXISTS game_revision;
ALTER TABLE public.games DROP COLUMN IF EXISTS revision;
