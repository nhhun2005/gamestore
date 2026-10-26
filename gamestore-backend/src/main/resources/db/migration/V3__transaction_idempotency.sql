-- Request keys prevent a retry from crediting/debiting a wallet twice.
ALTER TABLE public.transactions ADD COLUMN idempotency_key UUID;
CREATE UNIQUE INDEX transactions_user_idempotency_key
    ON public.transactions(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
