-- Called by the trusted backend using the account resolved from JWT.
-- SECURITY INVOKER, no internal COMMIT: Spring controls the complete transaction.
CREATE PROCEDURE public.sp_lock_verified_user(IN p_user_id UUID, OUT p_balance NUMERIC)
LANGUAGE plpgsql AS $$
DECLARE v_status TEXT;
BEGIN
    SELECT status,balance INTO v_status,p_balance FROM public.users WHERE id=p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='GS401', MESSAGE='Tài khoản không còn tồn tại.'; END IF;
    IF v_status <> 'VERIFIED' THEN RAISE EXCEPTION USING ERRCODE='GS403', MESSAGE='Tài khoản chưa được xác minh hoặc đã bị khóa.'; END IF;
END;
$$;

-- The backend must validate the simulation QR before the first call.
CREATE PROCEDURE public.sp_deposit_wallet(IN p_user_id UUID, IN p_amount NUMERIC, IN p_key UUID, OUT p_transaction_id UUID)
LANGUAGE plpgsql AS $$
DECLARE v_balance NUMERIC; v_previous public.transactions%ROWTYPE;
BEGIN
    CALL public.sp_lock_verified_user(p_user_id,v_balance);
    IF p_key IS NULL OR p_amount IS NULL OR p_amount::TEXT IN ('NaN','Infinity','-Infinity')
       OR p_amount<=0 OR p_amount>100000000 OR scale(p_amount)>2 THEN
        RAISE EXCEPTION USING ERRCODE='GS400', MESSAGE='Số tiền nạp hoặc mã yêu cầu không hợp lệ.';
    END IF;
    SELECT * INTO v_previous FROM public.transactions WHERE user_id=p_user_id AND idempotency_key=p_key;
    IF FOUND THEN
        IF v_previous.type <> 'IN' OR v_previous.amount <> p_amount THEN
            RAISE EXCEPTION USING ERRCODE='GS409', MESSAGE='Mã yêu cầu đã dùng cho một giao dịch khác.';
        END IF;
        p_transaction_id := v_previous.id;
        RETURN;
    END IF;
    IF v_balance+p_amount>99999999999999999.99 THEN
        RAISE EXCEPTION USING ERRCODE='GS400', MESSAGE='Số dư vượt giới hạn.';
    END IF;
    UPDATE public.users SET balance=v_balance+p_amount WHERE id=p_user_id;
    INSERT INTO public.transactions(user_id,type,amount,status,idempotency_key)
        VALUES (p_user_id,'IN',p_amount,'SUCCESSED',p_key) RETURNING id INTO p_transaction_id;
END;
$$;

CREATE PROCEDURE public.sp_purchase_game(IN p_user_id UUID, IN p_game_id UUID, IN p_key UUID,
                                       IN p_expected_amount NUMERIC, OUT p_transaction_id UUID)
LANGUAGE plpgsql AS $$
DECLARE v_balance NUMERIC; v_price NUMERIC; v_discount NUMERIC; v_promo_status TEXT;
        v_game public.games%ROWTYPE; v_previous public.transactions%ROWTYPE;
BEGIN
    CALL public.sp_lock_verified_user(p_user_id,v_balance);
    IF p_key IS NULL OR p_game_id IS NULL OR (p_expected_amount IS NOT NULL AND
       (p_expected_amount::TEXT IN ('NaN','Infinity','-Infinity') OR p_expected_amount<0 OR scale(p_expected_amount)>2)) THEN
        RAISE EXCEPTION USING ERRCODE='GS400', MESSAGE='Trò chơi, giá xác nhận hoặc mã yêu cầu không hợp lệ.';
    END IF;
    SELECT * INTO v_previous FROM public.transactions WHERE user_id=p_user_id AND idempotency_key=p_key;
    IF FOUND THEN
        IF v_previous.type <> 'BUY' OR v_previous.game_id IS DISTINCT FROM p_game_id
           OR (p_expected_amount IS NOT NULL AND v_previous.amount <> p_expected_amount) THEN
            RAISE EXCEPTION USING ERRCODE='GS409', MESSAGE='Mã yêu cầu đã dùng cho một giao dịch khác.';
        END IF;
        p_transaction_id := v_previous.id;
        RETURN;
    END IF;
    SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='GS404', MESSAGE='Trò chơi không tồn tại.'; END IF;
    IF v_game.status <> 'AVAILABLE' THEN RAISE EXCEPTION USING ERRCODE='GS409', MESSAGE='Trò chơi hiện chưa mở bán.'; END IF;
    IF EXISTS (SELECT 1 FROM public.game_bought WHERE user_id=p_user_id AND game_id=p_game_id) THEN
        RAISE EXCEPTION USING ERRCODE='GS409', MESSAGE='Bạn đã sở hữu trò chơi này.';
    END IF;
    v_price := v_game.price;
    IF v_game.promotion_id IS NOT NULL THEN
        SELECT discount,status INTO v_discount,v_promo_status FROM public.promotions WHERE id=v_game.promotion_id FOR SHARE;
        IF v_promo_status='ENABLED' THEN v_price := round(v_price*(1-v_discount/100),2); END IF;
    END IF;
    IF p_expected_amount IS NOT NULL AND p_expected_amount<>v_price THEN
        RAISE EXCEPTION USING ERRCODE='GS409', MESSAGE='Giá đã thay đổi. Kiểm tra giá mới và xác nhận lại.';
    END IF;
    IF v_balance<v_price THEN RAISE EXCEPTION USING ERRCODE='GS402', MESSAGE='Số dư không đủ. Vui lòng nạp thêm tiền.'; END IF;
    UPDATE public.users SET balance=v_balance-v_price WHERE id=p_user_id;
    -- The existing V2 trigger grants ownership exactly once.
    INSERT INTO public.transactions(user_id,game_id,type,amount,status,idempotency_key)
        VALUES (p_user_id,p_game_id,'BUY',v_price,'SUCCESSED',p_key) RETURNING id INTO p_transaction_id;
END;
$$;

CREATE PROCEDURE public.sp_create_library_collection(IN p_user_id UUID, IN p_name TEXT, OUT p_collection_id UUID)
LANGUAGE plpgsql AS $$
DECLARE v_balance NUMERIC; v_name TEXT := btrim(p_name,E' \t\n\r\f\v');
BEGIN
    CALL public.sp_lock_verified_user(p_user_id,v_balance);
    IF v_name IS NULL OR length(v_name) NOT BETWEEN 1 AND 80 THEN
        RAISE EXCEPTION USING ERRCODE='GS400', MESSAGE='Tên bộ sưu tập cần từ 1 đến 80 ký tự.';
    END IF;
    INSERT INTO public.library_collections(user_id,name) VALUES (p_user_id,v_name) RETURNING id INTO p_collection_id;
END;
$$;

CREATE PROCEDURE public.sp_rename_library_collection(IN p_user_id UUID, IN p_collection_id UUID, IN p_name TEXT)
LANGUAGE plpgsql AS $$
DECLARE v_balance NUMERIC; v_name TEXT := btrim(p_name,E' \t\n\r\f\v');
BEGIN
    CALL public.sp_lock_verified_user(p_user_id,v_balance);
    IF NOT EXISTS (SELECT 1 FROM public.library_collections WHERE id=p_collection_id AND user_id=p_user_id) THEN
        RAISE EXCEPTION USING ERRCODE='GS404', MESSAGE='Không tìm thấy bộ sưu tập của bạn.';
    END IF;
    IF v_name IS NULL OR length(v_name) NOT BETWEEN 1 AND 80 THEN
        RAISE EXCEPTION USING ERRCODE='GS400', MESSAGE='Tên bộ sưu tập cần từ 1 đến 80 ký tự.';
    END IF;
    UPDATE public.library_collections SET name=v_name WHERE id=p_collection_id AND user_id=p_user_id;
END;
$$;

CREATE PROCEDURE public.sp_delete_library_collection(IN p_user_id UUID, IN p_collection_id UUID)
LANGUAGE plpgsql AS $$
DECLARE v_balance NUMERIC;
BEGIN
    CALL public.sp_lock_verified_user(p_user_id,v_balance);
    DELETE FROM public.library_collections WHERE id=p_collection_id AND user_id=p_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='GS404', MESSAGE='Không tìm thấy bộ sưu tập của bạn.'; END IF;
END;
$$;

CREATE PROCEDURE public.sp_set_library_membership(IN p_user_id UUID, IN p_collection_id UUID, IN p_game_id UUID, IN p_add BOOLEAN)
LANGUAGE plpgsql AS $$
DECLARE v_balance NUMERIC;
BEGIN
    CALL public.sp_lock_verified_user(p_user_id,v_balance);
    IF p_add IS NULL THEN RAISE EXCEPTION USING ERRCODE='GS400', MESSAGE='Thao tác bộ sưu tập không hợp lệ.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.library_collections WHERE id=p_collection_id AND user_id=p_user_id) THEN
        RAISE EXCEPTION USING ERRCODE='GS404', MESSAGE='Không tìm thấy bộ sưu tập của bạn.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.game_bought WHERE user_id=p_user_id AND game_id=p_game_id) THEN
        RAISE EXCEPTION USING ERRCODE='GS403', MESSAGE='Chỉ được quản lý trò chơi đã sở hữu trong thư viện của bạn.';
    END IF;
    IF p_add THEN
        INSERT INTO public.library_collection_games(collection_id,user_id,game_id)
            VALUES (p_collection_id,p_user_id,p_game_id) ON CONFLICT DO NOTHING;
    ELSE
        DELETE FROM public.library_collection_games WHERE collection_id=p_collection_id AND user_id=p_user_id AND game_id=p_game_id;
    END IF;
END;
$$;

CREATE PROCEDURE public.sp_save_library_preference(IN p_user_id UUID, IN p_game_id UUID, IN p_note TEXT, IN p_hidden BOOLEAN)
LANGUAGE plpgsql AS $$
DECLARE v_balance NUMERIC;
BEGIN
    CALL public.sp_lock_verified_user(p_user_id,v_balance);
    IF NOT EXISTS (SELECT 1 FROM public.game_bought WHERE user_id=p_user_id AND game_id=p_game_id) THEN
        RAISE EXCEPTION USING ERRCODE='GS403', MESSAGE='Chỉ được quản lý trò chơi đã sở hữu trong thư viện của bạn.';
    END IF;
    IF p_note IS NULL OR length(p_note)>2000 OR p_hidden IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='GS400', MESSAGE='Ghi chú tối đa 2.000 ký tự và cần trạng thái ẩn/hiện hợp lệ.';
    END IF;
    INSERT INTO public.library_preferences(user_id,game_id,note,hidden) VALUES (p_user_id,p_game_id,btrim(p_note,E' \t\n\r\f\v'),p_hidden)
        ON CONFLICT (user_id,game_id) DO UPDATE SET note=EXCLUDED.note,hidden=EXCLUDED.hidden;
END;
$$;

CREATE PROCEDURE public.sp_save_game_review(IN p_user_id UUID, IN p_game_id UUID, IN p_rating NUMERIC, IN p_content TEXT, OUT p_review_id UUID)
LANGUAGE plpgsql AS $$
DECLARE v_balance NUMERIC; v_content TEXT := btrim(p_content,E' \t\n\r\f\v');
BEGIN
    CALL public.sp_lock_verified_user(p_user_id,v_balance);
    IF p_rating IS NULL OR p_rating::TEXT IN ('NaN','Infinity','-Infinity') OR p_rating<1 OR p_rating>5 OR mod(p_rating,0.5)<>0 THEN
        RAISE EXCEPTION USING ERRCODE='GS400', MESSAGE='Điểm phải từ 1 đến 5, theo bước 0,5.';
    END IF;
    IF v_content IS NULL OR length(v_content) NOT BETWEEN 1 AND 2000 THEN
        RAISE EXCEPTION USING ERRCODE='GS400', MESSAGE='Nội dung cần từ 1 đến 2.000 ký tự.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.game_bought WHERE user_id=p_user_id AND game_id=p_game_id) THEN
        RAISE EXCEPTION USING ERRCODE='GS403', MESSAGE='Chỉ người sở hữu trò chơi mới được đánh giá.';
    END IF;
    PERFORM 1 FROM public.games WHERE id=p_game_id FOR UPDATE;
    INSERT INTO public.reviews(user_id,game_id,rating,content) VALUES (p_user_id,p_game_id,p_rating,v_content)
        ON CONFLICT (user_id,game_id) DO UPDATE SET rating=EXCLUDED.rating,content=EXCLUDED.content RETURNING id INTO p_review_id;
END;
$$;

CREATE PROCEDURE public.sp_delete_game_review(IN p_user_id UUID, IN p_review_id UUID)
LANGUAGE plpgsql AS $$
DECLARE v_balance NUMERIC; v_game UUID;
BEGIN
    CALL public.sp_lock_verified_user(p_user_id,v_balance);
    SELECT game_id INTO v_game FROM public.reviews WHERE id=p_review_id AND user_id=p_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='GS404', MESSAGE='Không tìm thấy đánh giá của bạn.'; END IF;
    PERFORM 1 FROM public.games WHERE id=v_game FOR UPDATE;
    DELETE FROM public.reviews WHERE id=p_review_id AND user_id=p_user_id;
END;
$$;

-- Only the migration/application owner can execute by default. If deployment uses
-- a separate runtime role, explicitly GRANT EXECUTE to that trusted role.
REVOKE ALL ON PROCEDURE public.sp_lock_verified_user(UUID) FROM PUBLIC;
REVOKE ALL ON PROCEDURE public.sp_deposit_wallet(UUID,NUMERIC,UUID) FROM PUBLIC;
REVOKE ALL ON PROCEDURE public.sp_purchase_game(UUID,UUID,UUID,NUMERIC) FROM PUBLIC;
REVOKE ALL ON PROCEDURE public.sp_create_library_collection(UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON PROCEDURE public.sp_rename_library_collection(UUID,UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON PROCEDURE public.sp_delete_library_collection(UUID,UUID) FROM PUBLIC;
REVOKE ALL ON PROCEDURE public.sp_set_library_membership(UUID,UUID,UUID,BOOLEAN) FROM PUBLIC;
REVOKE ALL ON PROCEDURE public.sp_save_library_preference(UUID,UUID,TEXT,BOOLEAN) FROM PUBLIC;
REVOKE ALL ON PROCEDURE public.sp_save_game_review(UUID,UUID,NUMERIC,TEXT) FROM PUBLIC;
REVOKE ALL ON PROCEDURE public.sp_delete_game_review(UUID,UUID) FROM PUBLIC;
