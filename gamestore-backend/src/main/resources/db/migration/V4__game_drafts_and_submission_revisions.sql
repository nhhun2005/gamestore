-- Creating a draft no longer submits it for review. Submission is an explicit action.
DROP TRIGGER games_require_submission ON public.games;
DROP TRIGGER submissions_preserve_minimum ON public.game_submissions;
DROP FUNCTION public.require_game_submission();

ALTER TABLE public.games ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0);
ALTER TABLE public.game_submissions
    ADD COLUMN game_revision INTEGER NOT NULL DEFAULT 1 CHECK (game_revision > 0),
    ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN reviewed_at TIMESTAMPTZ;
CREATE INDEX game_submissions_queue_idx ON public.game_submissions(status, created_at DESC, id);
CREATE INDEX game_submissions_revision_idx ON public.game_submissions(game_id, game_revision, status);
