-- Five non-unique B-tree indexes explicitly approved on 2026-11-15.
-- games_store_title_idx supports order/filter, not arbitrary substring search.
CREATE INDEX genres_name_lookup_idx ON public.genres (lower(btrim(name)));
CREATE INDEX game_submissions_game_status_idx ON public.game_submissions (game_id,status);
CREATE INDEX developer_submissions_user_status_idx ON public.developer_submissions (user_id,status);
CREATE INDEX developer_submissions_status_id_idx ON public.developer_submissions (status,id);
CREATE INDEX games_store_title_idx ON public.games (lower(title),id) WHERE status='AVAILABLE';
