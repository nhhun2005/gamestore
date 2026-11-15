-- Reuse GameStore Pay for wallet funding as well as direct game purchases.
ALTER TABLE public.checkout_sessions ADD COLUMN purpose TEXT NOT NULL DEFAULT 'GAME' CHECK(purpose IN ('GAME','TOPUP'));
ALTER TABLE public.checkout_sessions ALTER COLUMN game_id DROP NOT NULL;
ALTER TABLE public.checkout_sessions ADD CONSTRAINT checkout_purpose_game CHECK (
    (purpose='GAME' AND game_id IS NOT NULL) OR (purpose='TOPUP' AND game_id IS NULL)
);

CREATE PROCEDURE public.sp_create_topup_checkout(IN p_user UUID,IN p_key UUID,IN p_amount NUMERIC,OUT p_id UUID)
LANGUAGE plpgsql AS $$
DECLARE v_balance NUMERIC; previous public.checkout_sessions; receipt UUID;
BEGIN
    CALL public.sp_lock_verified_user(p_user,v_balance);
    IF p_key IS NULL OR p_amount IS NULL OR p_amount::TEXT IN ('NaN','Infinity','-Infinity') OR p_amount<=0 OR p_amount>100000000 OR scale(p_amount)>2 THEN
        RAISE EXCEPTION 'Số tiền nạp hoặc mã yêu cầu không hợp lệ.' USING ERRCODE='GS400';
    END IF;
    PERFORM public.expire_checkout_sessions(p_user,NULL);
    SELECT * INTO previous FROM public.checkout_sessions WHERE user_id=p_user AND request_key=p_key;
    IF FOUND THEN
        IF previous.purpose<>'TOPUP' OR previous.amount<>p_amount THEN
            RAISE EXCEPTION 'Mã yêu cầu đã dùng cho một đơn hàng khác.' USING ERRCODE='GS409';
        END IF;
        p_id:=previous.id; RETURN;
    END IF;
    IF v_balance+p_amount>99999999999999999.99 THEN RAISE EXCEPTION 'Số dư vượt giới hạn.' USING ERRCODE='GS400'; END IF;
    INSERT INTO public.transactions(user_id,type,amount,status) VALUES(p_user,'IN',p_amount,'PENDING') RETURNING id INTO receipt;
    INSERT INTO public.checkout_sessions(user_id,transaction_id,request_key,game_title,amount,purpose)
        VALUES(p_user,receipt,p_key,'Nạp tiền vào ví GameStore',p_amount,'TOPUP') RETURNING id INTO p_id;
END;
$$;

CREATE OR REPLACE PROCEDURE public.sp_create_checkout(IN p_user UUID,IN p_game UUID,IN p_key UUID,IN p_expected NUMERIC,OUT p_id UUID)
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
        IF previous.purpose<>'GAME' OR previous.game_id IS DISTINCT FROM p_game OR previous.amount<>p_expected THEN
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

CREATE OR REPLACE PROCEDURE public.sp_resolve_checkout(IN p_user UUID,IN p_id UUID,IN p_action TEXT,IN p_method TEXT,
    IN p_bank TEXT,IN p_card TEXT,IN p_qr UUID)
LANGUAGE plpgsql AS $$
DECLARE v_balance NUMERIC; c public.checkout_sessions; target UUID; next_status TEXT;
BEGIN
    CALL public.sp_lock_verified_user(p_user,v_balance);
    SELECT game_id INTO target FROM public.checkout_sessions WHERE id=p_id AND user_id=p_user;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đơn thanh toán.' USING ERRCODE='GS404'; END IF;
    IF target IS NOT NULL THEN PERFORM 1 FROM public.games WHERE id=target FOR UPDATE; END IF;
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
            IF p_card='4242424242424242' THEN next_status:='SUCCESSED';
            ELSIF p_card='4000000000000002' THEN next_status:='FAILED';
            ELSE RAISE EXCEPTION 'Chỉ hỗ trợ thẻ thử nghiệm được cung cấp trên trang thanh toán.' USING ERRCODE='GS400'; END IF;
        ELSE
            IF p_qr IS NULL OR p_qr<>c.qr_token THEN RAISE EXCEPTION 'Mã xác nhận QR không đúng với đơn hàng này.' USING ERRCODE='GS400'; END IF;
            next_status:='SUCCESSED';
        END IF;
    ELSE RAISE EXCEPTION 'Thao tác thanh toán không hợp lệ.' USING ERRCODE='GS400'; END IF;
    IF next_status='SUCCESSED' AND c.purpose='TOPUP' THEN
        IF v_balance+c.amount>99999999999999999.99 THEN RAISE EXCEPTION 'Số dư vượt giới hạn.' USING ERRCODE='GS400'; END IF;
        UPDATE public.users SET balance=balance+c.amount WHERE id=p_user;
    END IF;
    UPDATE public.checkout_sessions SET status=next_status,method=CASE WHEN p_action='CONFIRM' THEN p_method END,
        bank=CASE WHEN p_action='CONFIRM' THEN p_bank END,
        card_last4=CASE WHEN p_action='CONFIRM' AND p_method='CARD' THEN right(p_card,4) END,
        reason=CASE next_status WHEN 'CANCELLED' THEN 'user_cancelled' WHEN 'FAILED' THEN 'test_card_declined' ELSE 'payment_confirmed' END,
        settled_at=CURRENT_TIMESTAMP WHERE id=p_id;
    UPDATE public.transactions SET status=CASE WHEN next_status='SUCCESSED' THEN 'SUCCESSED' ELSE 'FAILED' END,
        created_at=CASE WHEN next_status='SUCCESSED' THEN CURRENT_TIMESTAMP ELSE created_at END WHERE id=c.transaction_id;
END;
$$;
REVOKE EXECUTE ON PROCEDURE public.sp_create_topup_checkout(UUID,UUID,NUMERIC) FROM PUBLIC;
