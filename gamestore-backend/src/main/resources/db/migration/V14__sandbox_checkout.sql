-- GameStore Pay is a local payment simulator. Successful external-style purchases
-- do not debit the wallet; their BUY receipts use the existing ownership/revenue rules.
CREATE TABLE public.checkout_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id),
    game_id UUID NOT NULL REFERENCES public.games(id),
    transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id),
    request_key UUID NOT NULL,
    game_title TEXT NOT NULL,
    amount NUMERIC(19,2) NOT NULL CHECK (amount>0),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SUCCESSED','FAILED','CANCELLED','EXPIRED')),
    method TEXT CHECK (method IN ('CARD','QR')),
    bank TEXT,
    card_last4 VARCHAR(4),
    qr_token UUID NOT NULL DEFAULT gen_random_uuid(),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP+INTERVAL '10 minutes'),
    settled_at TIMESTAMPTZ,
    UNIQUE(user_id,request_key)
);
CREATE UNIQUE INDEX checkout_one_pending_game ON public.checkout_sessions(user_id,game_id) WHERE status='PENDING';
CREATE INDEX checkout_user_created ON public.checkout_sessions(user_id,created_at DESC);

CREATE FUNCTION public.expire_checkout_sessions(p_user UUID,p_game UUID) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    WITH expired AS (
        UPDATE public.checkout_sessions SET status='EXPIRED',reason='payment_expired',settled_at=CURRENT_TIMESTAMP
        WHERE user_id=p_user AND (p_game IS NULL OR game_id=p_game) AND status='PENDING' AND expires_at<=CURRENT_TIMESTAMP
        RETURNING transaction_id
    ) UPDATE public.transactions SET status='FAILED' WHERE id IN (SELECT transaction_id FROM expired);
END;
$$;

CREATE PROCEDURE public.sp_create_checkout(IN p_user UUID,IN p_game UUID,IN p_key UUID,IN p_expected NUMERIC,OUT p_id UUID)
LANGUAGE plpgsql AS $$
DECLARE v_balance NUMERIC; g public.games; promo public.promotions; price NUMERIC; receipt UUID; previous public.checkout_sessions;
BEGIN
    CALL public.sp_lock_verified_user(p_user,v_balance);
    IF p_game IS NULL OR p_key IS NULL OR p_expected IS NULL OR p_expected::TEXT IN ('NaN','Infinity','-Infinity') OR p_expected<=0 OR scale(p_expected)>2 THEN
        RAISE EXCEPTION 'Game, số tiền hoặc mã yêu cầu không hợp lệ.' USING ERRCODE='GS400';
    END IF;
    SELECT * INTO g FROM public.games WHERE id=p_game FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Trò chơi không tồn tại.' USING ERRCODE='GS404'; END IF;
    PERFORM public.expire_checkout_sessions(p_user,p_game);
    SELECT * INTO previous FROM public.checkout_sessions WHERE user_id=p_user AND request_key=p_key;
    IF FOUND THEN
        IF previous.game_id<>p_game OR previous.amount<>p_expected THEN
            RAISE EXCEPTION 'Mã yêu cầu đã dùng cho đơn hàng khác.' USING ERRCODE='GS409';
        END IF;
        p_id:=previous.id; RETURN;
    END IF;
    IF EXISTS(SELECT 1 FROM public.game_bought WHERE user_id=p_user AND game_id=p_game) THEN
        RAISE EXCEPTION 'Bạn đã sở hữu trò chơi này.' USING ERRCODE='GS409';
    END IF;
    IF g.status<>'AVAILABLE' THEN RAISE EXCEPTION 'Trò chơi hiện chưa mở bán.' USING ERRCODE='GS409'; END IF;
    SELECT id INTO p_id FROM public.checkout_sessions WHERE user_id=p_user AND game_id=p_game AND status='PENDING';
    IF FOUND THEN RETURN; END IF;
    price:=g.price;
    IF g.promotion_id IS NOT NULL THEN
        SELECT * INTO promo FROM public.promotions WHERE id=g.promotion_id FOR SHARE;
        IF promo.status='ENABLED' THEN price:=round(price*(1-promo.discount/100),2); END IF;
    END IF;
    IF price<>p_expected THEN RAISE EXCEPTION 'Giá đã thay đổi. Kiểm tra giá mới và xác nhận lại.' USING ERRCODE='GS409'; END IF;
    IF price<=0 THEN RAISE EXCEPTION 'Game miễn phí không cần qua cổng thanh toán.' USING ERRCODE='GS400'; END IF;
    INSERT INTO public.transactions(user_id,game_id,type,amount,status) VALUES(p_user,p_game,'BUY',price,'PENDING') RETURNING id INTO receipt;
    INSERT INTO public.checkout_sessions(user_id,game_id,transaction_id,request_key,game_title,amount)
        VALUES(p_user,p_game,receipt,p_key,g.title,price) RETURNING id INTO p_id;
END;
$$;

-- Atomic settlement, including cancellation and expiry. The server resolves test
-- card outcomes; the browser never supplies a trusted payment status or amount.
CREATE PROCEDURE public.sp_resolve_checkout(IN p_user UUID,IN p_id UUID,IN p_action TEXT,IN p_method TEXT,
    IN p_bank TEXT,IN p_card TEXT,IN p_qr UUID)
LANGUAGE plpgsql AS $$
DECLARE v_balance NUMERIC; c public.checkout_sessions; target UUID; next_status TEXT;
BEGIN
    CALL public.sp_lock_verified_user(p_user,v_balance);
    SELECT game_id INTO target FROM public.checkout_sessions WHERE id=p_id AND user_id=p_user;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đơn thanh toán.' USING ERRCODE='GS404'; END IF;
    PERFORM 1 FROM public.games WHERE id=target FOR UPDATE;
    SELECT * INTO c FROM public.checkout_sessions WHERE id=p_id AND user_id=p_user FOR UPDATE;
    PERFORM public.expire_checkout_sessions(p_user,target);
    SELECT * INTO c FROM public.checkout_sessions WHERE id=p_id;
    IF c.status<>'PENDING' OR p_action='READ' THEN RETURN; END IF;
    IF p_action='CANCEL' THEN next_status:='CANCELLED';
    ELSIF p_action='CONFIRM' THEN
        IF p_method NOT IN ('CARD','QR') OR p_method IS NULL OR p_bank NOT IN ('NCB','VIETCOMBANK','BIDV','TECHCOMBANK') OR p_bank IS NULL THEN
            RAISE EXCEPTION 'Vui lòng chọn phương thức và ngân hàng hợp lệ.' USING ERRCODE='GS400';
        END IF;
        IF p_method='CARD' THEN
            -- Adapted Fake-bank test card scenarios; see third_party/fake-bank.
            IF p_card='4242424242424242' THEN next_status:='SUCCESSED';
            ELSIF p_card='4000000000000002' THEN next_status:='FAILED';
            ELSE RAISE EXCEPTION 'Chỉ hỗ trợ thẻ thử nghiệm được cung cấp trên trang thanh toán.' USING ERRCODE='GS400'; END IF;
        ELSE
            IF p_qr IS NULL OR p_qr<>c.qr_token THEN RAISE EXCEPTION 'Mã xác nhận QR không đúng với đơn hàng này.' USING ERRCODE='GS400'; END IF;
            next_status:='SUCCESSED';
        END IF;
    ELSE RAISE EXCEPTION 'Thao tác thanh toán không hợp lệ.' USING ERRCODE='GS400'; END IF;
    UPDATE public.checkout_sessions SET status=next_status,method=CASE WHEN p_action='CONFIRM' THEN p_method END,
        bank=CASE WHEN p_action='CONFIRM' THEN p_bank END,
        card_last4=CASE WHEN p_action='CONFIRM' AND p_method='CARD' THEN right(p_card,4) END,
        reason=CASE next_status WHEN 'CANCELLED' THEN 'user_cancelled' WHEN 'FAILED' THEN 'test_card_declined' ELSE 'payment_confirmed' END,
        settled_at=CURRENT_TIMESTAMP WHERE id=p_id;
    UPDATE public.transactions SET status=CASE WHEN next_status='SUCCESSED' THEN 'SUCCESSED' ELSE 'FAILED' END,
        created_at=CASE WHEN next_status='SUCCESSED' THEN CURRENT_TIMESTAMP ELSE created_at END WHERE id=c.transaction_id;
END;
$$;

-- Keep wallet checkout and GameStore Pay from buying the same game concurrently.
CREATE FUNCTION public.guard_pending_checkout() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.type='BUY' AND NEW.status='SUCCESSED' THEN
        PERFORM 1 FROM public.users WHERE id=NEW.user_id FOR UPDATE;
        PERFORM public.expire_checkout_sessions(NEW.user_id,NEW.game_id);
        IF EXISTS(SELECT 1 FROM public.checkout_sessions WHERE user_id=NEW.user_id AND game_id=NEW.game_id AND status='PENDING' AND transaction_id<>NEW.id) THEN
            RAISE EXCEPTION 'Game đang có đơn GameStore Pay chờ thanh toán. Hãy hoàn tất hoặc hủy đơn trước.' USING ERRCODE='GS409';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER transactions_guard_pending_checkout BEFORE INSERT OR UPDATE OF status ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.guard_pending_checkout();

REVOKE EXECUTE ON PROCEDURE public.sp_create_checkout(UUID,UUID,UUID,NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON PROCEDURE public.sp_resolve_checkout(UUID,UUID,TEXT,TEXT,TEXT,TEXT,UUID) FROM PUBLIC;
