-- All monetary values are VND. Status values intentionally retain SUCCESSED.
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) NOT NULL CHECK (btrim(username) <> ''),
    email VARCHAR(320) NOT NULL CHECK (btrim(email) <> ''),
    password TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMINISTRATOR', 'DEVELOPER')),
    balance NUMERIC(19,2) NOT NULL DEFAULT 0 CHECK (balance >= 0 AND balance < 'Infinity'::numeric),
    status VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VERIFIED', 'BANNED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX users_username_unique ON public.users (lower(username));
CREATE UNIQUE INDEX users_email_unique ON public.users (lower(email));

CREATE TABLE public.promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    discount NUMERIC NOT NULL CHECK (discount > 0 AND discount <= 100),
    status VARCHAR(10) NOT NULL DEFAULT 'DISABLED' CHECK (status IN ('ENABLED', 'DISABLED'))
);

CREATE TABLE public.games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id UUID NOT NULL REFERENCES public.users(id),
    title TEXT NOT NULL,
    description TEXT,
    price NUMERIC(19,2) NOT NULL CHECK (price >= 0 AND price < 'Infinity'::numeric),
    cover_image_url TEXT,
    version TEXT,
    -- Average of reviews, maintained by V2 triggers. NULL means no reviews.
    rating NUMERIC CHECK (rating BETWEEN 1 AND 5),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(10) NOT NULL DEFAULT 'HIDDEN' CHECK (status IN ('HIDDEN', 'AVAILABLE')),
    promotion_id UUID REFERENCES public.promotions(id)
);
CREATE INDEX games_developer_idx ON public.games(developer_id);
CREATE INDEX games_promotion_idx ON public.games(promotion_id);

CREATE TABLE public.genres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT
);
CREATE TABLE public.game_genres (
    game_id UUID NOT NULL REFERENCES public.games(id),
    genre_id UUID NOT NULL REFERENCES public.genres(id),
    PRIMARY KEY (game_id, genre_id)
);
CREATE INDEX game_genres_genre_idx ON public.game_genres(genre_id);

CREATE TABLE public.developer_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id),
    reason TEXT,
    status VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('ACCEPTED', 'PENDING', 'REJECTED'))
);
CREATE INDEX developer_submissions_user_idx ON public.developer_submissions(user_id);

CREATE TABLE public.game_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES public.games(id),
    submitted_by UUID NOT NULL REFERENCES public.users(id),
    reviewed_by UUID REFERENCES public.users(id),
    reason TEXT,
    status VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('ACCEPTED', 'PENDING', 'REJECTED')),
    CONSTRAINT game_submissions_reviewer_required CHECK (status = 'PENDING' OR reviewed_by IS NOT NULL)
);
CREATE INDEX game_submissions_game_idx ON public.game_submissions(game_id);
CREATE INDEX game_submissions_submitter_idx ON public.game_submissions(submitted_by);
CREATE INDEX game_submissions_reviewer_idx ON public.game_submissions(reviewed_by);

CREATE TABLE public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id),
    game_id UUID REFERENCES public.games(id),
    type VARCHAR(3) NOT NULL CHECK (type IN ('IN', 'OUT', 'BUY')),
    amount NUMERIC(19,2) NOT NULL CHECK (amount >= 0 AND amount < 'Infinity'::numeric),
    status VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCESSED', 'FAILED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT transactions_game_for_buy CHECK ((type = 'BUY') = (game_id IS NOT NULL)),
    CONSTRAINT transactions_ownership_reference UNIQUE (id, user_id, game_id)
);
CREATE INDEX transactions_user_created_idx ON public.transactions(user_id, created_at DESC);
CREATE INDEX transactions_game_idx ON public.transactions(game_id);
CREATE UNIQUE INDEX transactions_one_successful_buy ON public.transactions(user_id, game_id)
    WHERE type = 'BUY' AND status = 'SUCCESSED';

CREATE TABLE public.game_bought (
    user_id UUID NOT NULL REFERENCES public.users(id),
    game_id UUID NOT NULL REFERENCES public.games(id),
    transaction_id UUID NOT NULL UNIQUE,
    PRIMARY KEY (user_id, game_id),
    FOREIGN KEY (transaction_id, user_id, game_id) REFERENCES public.transactions(id, user_id, game_id)
);
CREATE INDEX game_bought_game_idx ON public.game_bought(game_id);

CREATE TABLE public.wishlists (
    user_id UUID NOT NULL REFERENCES public.users(id),
    game_id UUID NOT NULL REFERENCES public.games(id),
    PRIMARY KEY (user_id, game_id)
);
CREATE INDEX wishlists_game_idx ON public.wishlists(game_id);

CREATE TABLE public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    game_id UUID NOT NULL,
    content TEXT,
    -- Unconstrained NUMERIC preserves input before CHECK (1.49 must not round to 1.5).
    rating NUMERIC NOT NULL CHECK (rating BETWEEN 1 AND 5 AND mod(rating, 0.5) = 0),
    UNIQUE (user_id, game_id),
    FOREIGN KEY (user_id, game_id) REFERENCES public.game_bought(user_id, game_id)
);
CREATE INDEX reviews_game_idx ON public.reviews(game_id);

CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id),
    promotion_id UUID NOT NULL REFERENCES public.promotions(id),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX notifications_user_read_idx ON public.notifications(user_id, is_read);
CREATE INDEX notifications_promotion_idx ON public.notifications(promotion_id);
