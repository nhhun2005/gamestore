ALTER TABLE public.users
    ADD COLUMN verification_token UUID,
    ADD COLUMN verification_token_expiry TIMESTAMPTZ;
CREATE UNIQUE INDEX users_verification_token_idx ON public.users (verification_token) WHERE verification_token IS NOT NULL;
