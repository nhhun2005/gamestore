-- Fee policy: 10% per successful game sale. Round the platform fee once;
-- developer share is the remainder so both shares always equal the purchase.
CREATE VIEW public.v_game_sale_revenue AS
SELECT t.id,t.game_id,t.type,t.amount,t.status,t.created_at,
       g.title AS game_title,g.developer_id,u.username AS developer_name,
       round(t.amount*0.10,2) AS platform_fee,
       t.amount-round(t.amount*0.10,2) AS developer_revenue
FROM public.transactions t
JOIN public.games g ON g.id=t.game_id
JOIN public.users u ON u.id=g.developer_id
WHERE t.type='BUY' AND t.status='SUCCESSED';

-- A publication charge is an expense, not a game purchase. OUT requires game_id
-- NULL in the existing transaction schema; this ledger supplies the game link.
CREATE TABLE public.game_publication_fees (
    game_id UUID PRIMARY KEY REFERENCES public.games(id),
    developer_id UUID NOT NULL REFERENCES public.users(id),
    payer_id UUID NOT NULL REFERENCES public.users(id),
    transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id),
    amount NUMERIC(19,2) NOT NULL CHECK (amount=1300000),
    usd_amount NUMERIC(10,2) NOT NULL DEFAULT 50 CHECK (usd_amount=50),
    vnd_per_usd NUMERIC(10,2) NOT NULL DEFAULT 26000 CHECK (vnd_per_usd=26000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX game_publication_fees_developer_date ON public.game_publication_fees(developer_id,created_at);

CREATE OR REPLACE PROCEDURE public.sp_submit_game(IN p_actor_username TEXT,IN p_game UUID,OUT p_id UUID)
LANGUAGE plpgsql AS $$
DECLARE a public.v_actor_accounts; g public.games; v_balance NUMERIC; v_transaction UUID;
BEGIN
    -- Match the existing catalog lock order. Serialize this publisher before any
    -- upgrade from the actor helper's shared row lock to the wallet write lock.
    PERFORM pg_advisory_xact_lock(hashtext('gamestore.genre-management'));
    PERFORM 1 FROM public.users WHERE lower(username)=lower(p_actor_username) FOR UPDATE;
    a:=public.fn_huan_actor(p_actor_username,ARRAY['ADMINISTRATOR','DEVELOPER']);
    g:=public.fn_huan_owned_game(a,p_game);
    IF NOT EXISTS(SELECT 1 FROM public.game_genres WHERE game_id=p_game) THEN
        RAISE EXCEPTION 'Trò chơi cần ít nhất 1 thể loại.' USING ERRCODE='G0409';
    END IF;
    IF EXISTS(SELECT 1 FROM public.game_submissions WHERE game_id=p_game AND status='PENDING') THEN
        RAISE EXCEPTION 'Trò chơi đã có đơn chờ duyệt.' USING ERRCODE='G0409';
    END IF;
    IF g.status='AVAILABLE' OR EXISTS(SELECT 1 FROM public.game_submissions WHERE game_id=p_game AND status='ACCEPTED') THEN
        RAISE EXCEPTION 'Trò chơi đã được phát hành hoặc duyệt.' USING ERRCODE='G0409';
    END IF;
    IF g.price=0 AND NOT EXISTS(SELECT 1 FROM public.game_publication_fees WHERE game_id=p_game) THEN
        SELECT balance INTO v_balance FROM public.users WHERE id=a.id;
        IF v_balance<1300000 THEN
            RAISE EXCEPTION 'Phí đăng game miễn phí là 1.300.000 VND (50 USD). Vui lòng nạp thêm tiền vào ví.' USING ERRCODE='G0402';
        END IF;
        UPDATE public.users SET balance=balance-1300000 WHERE id=a.id;
        INSERT INTO public.transactions(user_id,type,amount,status)
            VALUES(a.id,'OUT',1300000,'SUCCESSED') RETURNING id INTO v_transaction;
        INSERT INTO public.game_publication_fees(game_id,developer_id,payer_id,transaction_id,amount)
            VALUES(p_game,g.developer_id,a.id,v_transaction,1300000);
    END IF;
    INSERT INTO public.game_submissions(game_id,submitted_by) VALUES(p_game,a.id) RETURNING id INTO p_id;
END;
$$;

-- The caller must confirm the current charge. Recheck under the same locks as
-- submission so a concurrent price change cannot charge an unconfirmed fee.
CREATE PROCEDURE public.sp_submit_game_with_fee(IN p_actor_username TEXT,IN p_game UUID,IN p_expected_fee NUMERIC,OUT p_id UUID)
LANGUAGE plpgsql AS $$
DECLARE a public.v_actor_accounts; g public.games; required_fee NUMERIC:=0;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('gamestore.genre-management'));
    PERFORM 1 FROM public.users WHERE lower(username)=lower(p_actor_username) FOR UPDATE;
    a:=public.fn_huan_actor(p_actor_username,ARRAY['ADMINISTRATOR','DEVELOPER']);
    g:=public.fn_huan_owned_game(a,p_game);
    IF g.price=0 AND NOT EXISTS(SELECT 1 FROM public.game_publication_fees WHERE game_id=p_game) THEN
        required_fee:=1300000;
    END IF;
    IF p_expected_fee IS NULL OR p_expected_fee<>required_fee THEN
        RAISE EXCEPTION 'Phí đăng tải đã thay đổi. Vui lòng kiểm tra và xác nhận lại.' USING ERRCODE='G0409';
    END IF;
    CALL public.sp_submit_game(p_actor_username,p_game,p_id);
END;
$$;
