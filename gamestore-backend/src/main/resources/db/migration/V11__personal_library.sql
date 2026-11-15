-- Library organization is personal metadata; purchased ownership remains permanent.
CREATE TABLE public.library_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id),
    name VARCHAR(80) NOT NULL CHECK (name = btrim(name) AND length(name) > 0),
    UNIQUE (id, user_id)
);
CREATE UNIQUE INDEX library_collections_user_name ON public.library_collections(user_id, lower(name));

CREATE TABLE public.library_collection_games (
    collection_id UUID NOT NULL,
    user_id UUID NOT NULL,
    game_id UUID NOT NULL,
    PRIMARY KEY (collection_id, game_id),
    FOREIGN KEY (collection_id, user_id) REFERENCES public.library_collections(id, user_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id, game_id) REFERENCES public.game_bought(user_id, game_id)
);
CREATE INDEX library_collection_games_owner ON public.library_collection_games(user_id, game_id);

CREATE TABLE public.library_preferences (
    user_id UUID NOT NULL,
    game_id UUID NOT NULL,
    note VARCHAR(2000) NOT NULL DEFAULT '',
    hidden BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (user_id, game_id),
    FOREIGN KEY (user_id, game_id) REFERENCES public.game_bought(user_id, game_id)
);
