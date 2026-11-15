-- Reuse checkout receipts, owner checks, expiry and resumable sessions for payouts.
ALTER TABLE public.checkout_sessions DROP CONSTRAINT checkout_sessions_purpose_check;
ALTER TABLE public.checkout_sessions ADD CONSTRAINT checkout_sessions_purpose_check CHECK (purpose IN ('GAME','TOPUP','WITHDRAWAL'));
ALTER TABLE public.checkout_sessions DROP CONSTRAINT checkout_purpose_game;
ALTER TABLE public.checkout_sessions ADD CONSTRAINT checkout_purpose_game CHECK (
    (purpose='GAME' AND game_id IS NOT NULL) OR (purpose IN ('TOPUP','WITHDRAWAL') AND game_id IS NULL));
ALTER TABLE public.checkout_sessions DROP CONSTRAINT checkout_sessions_method_check;
ALTER TABLE public.checkout_sessions ADD CONSTRAINT checkout_sessions_method_check CHECK (method IN ('CARD','QR','BANK'));
CREATE UNIQUE INDEX checkout_one_pending_withdrawal ON public.checkout_sessions(user_id) WHERE status='PENDING' AND purpose='WITHDRAWAL';

CREATE PROCEDURE public.sp_create_withdrawal_checkout(IN p_user UUID, IN p_key UUID, IN p_amount NUMERIC, OUT p_id UUID)
LANGUAGE plpgsql AS $$
DECLARE v_balance NUMERIC; v_role TEXT; previous public.checkout_sessions; receipt UUID;
BEGIN
    CALL public.sp_lock_verified_user(p_user,v_balance);
    SELECT role INTO v_role FROM public.users WHERE id=p_user;
    IF v_role NOT IN ('DEVELOPER','ADMINISTRATOR') THEN
        RAISE EXCEPTION 'Bạn không có quyền rút tiền.' USING ERRCODE='GS403';
    END IF;
    IF p_key IS NULL OR p_amount IS NULL OR p_amount::TEXT IN ('NaN','Infinity','-Infinity') OR p_amount<=0 OR p_amount>100000000 OR scale(p_amount)>2 THEN
        RAISE EXCEPTION 'Số tiền rút hoặc mã yêu cầu không hợp lệ.' USING ERRCODE='GS400';
    END IF;
    PERFORM public.expire_checkout_sessions(p_user,NULL);
    SELECT * INTO previous FROM public.checkout_sessions WHERE user_id=p_user AND request_key=p_key;
    IF FOUND THEN
        IF previous.purpose<>'WITHDRAWAL' OR previous.amount<>p_amount THEN
            RAISE EXCEPTION 'Mã yêu cầu đã dùng cho một đơn hàng khác.' USING ERRCODE='GS409';
        END IF;
        p_id:=previous.id; RETURN;
    END IF;
    SELECT * INTO previous FROM public.checkout_sessions WHERE user_id=p_user AND purpose='WITHDRAWAL' AND status='PENDING';
    IF FOUND THEN
        IF previous.amount<>p_amount THEN RAISE EXCEPTION 'Bạn còn một đơn rút tiền đang chờ. Hãy tiếp tục hoặc hủy đơn đó.' USING ERRCODE='GS409'; END IF;
        p_id:=previous.id; RETURN;
    END IF;
    IF v_balance<p_amount THEN RAISE EXCEPTION 'Số dư không đủ để rút tiền.' USING ERRCODE='GS402'; END IF;
    INSERT INTO public.transactions(user_id,type,amount,status) VALUES (p_user,'OUT',p_amount,'PENDING') RETURNING id INTO receipt;
    INSERT INTO public.checkout_sessions(user_id,transaction_id,request_key,game_title,amount,purpose)
        VALUES (p_user,receipt,p_key,'Rút tiền từ ví GameStore',p_amount,'WITHDRAWAL') RETURNING id INTO p_id;
END;
$$;

CREATE PROCEDURE public.sp_confirm_withdrawal_checkout(IN p_user UUID, IN p_id UUID, IN p_bank TEXT, IN p_account TEXT)
LANGUAGE plpgsql AS $$
DECLARE v_balance NUMERIC; v_role TEXT; c public.checkout_sessions; next_status TEXT; result_reason TEXT;
BEGIN
    CALL public.sp_lock_verified_user(p_user,v_balance);
    SELECT role INTO v_role FROM public.users WHERE id=p_user;
    IF v_role NOT IN ('DEVELOPER','ADMINISTRATOR') THEN RAISE EXCEPTION 'Bạn không có quyền rút tiền.' USING ERRCODE='GS403'; END IF;
    SELECT * INTO c FROM public.checkout_sessions WHERE id=p_id AND user_id=p_user AND purpose='WITHDRAWAL' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đơn rút tiền.' USING ERRCODE='GS404'; END IF;
    PERFORM public.expire_checkout_sessions(p_user,NULL);
    SELECT * INTO c FROM public.checkout_sessions WHERE id=p_id;
    IF c.status<>'PENDING' THEN RETURN; END IF;
    IF p_bank IS NULL OR p_bank NOT IN ('NCB','VIETCOMBANK','BIDV','TECHCOMBANK') OR p_account IS NULL OR p_account NOT IN ('9704000001','9704000002') THEN
        RAISE EXCEPTION 'Chọn ngân hàng và tài khoản thử nghiệm hợp lệ.' USING ERRCODE='GS400';
    END IF;
    IF p_account='9704000002' THEN next_status:='FAILED'; result_reason:='test_account_declined';
    ELSIF v_balance<c.amount THEN next_status:='FAILED'; result_reason:='insufficient_funds';
    ELSE
        next_status:='SUCCESSED'; result_reason:='withdrawal_confirmed';
        UPDATE public.users SET balance=balance-c.amount WHERE id=p_user;
    END IF;
    UPDATE public.checkout_sessions SET status=next_status,method='BANK',bank=p_bank,card_last4=right(p_account,4),
        reason=result_reason,settled_at=CURRENT_TIMESTAMP WHERE id=p_id;
    UPDATE public.transactions SET status=CASE WHEN next_status='SUCCESSED' THEN 'SUCCESSED' ELSE 'FAILED' END,
        created_at=CASE WHEN next_status='SUCCESSED' THEN CURRENT_TIMESTAMP ELSE created_at END WHERE id=c.transaction_id;
END;
$$;
REVOKE EXECUTE ON PROCEDURE public.sp_create_withdrawal_checkout(UUID,UUID,NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON PROCEDURE public.sp_confirm_withdrawal_checkout(UUID,UUID,TEXT,TEXT) FROM PUBLIC;

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
        IF c.purpose='WITHDRAWAL' THEN RAISE EXCEPTION 'Dùng luồng xác nhận rút tiền.' USING ERRCODE='GS400'; END IF;
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
