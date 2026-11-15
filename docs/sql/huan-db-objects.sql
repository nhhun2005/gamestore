-- Bản đầy đủ các định nghĩa DB của Huân, 15/11/2026.
-- Tham khảo; áp dụng bằng Flyway V9/V10, không chạy lặp trên schema đã migrate.

-- Approved scope: Huan's genre/catalog/store/developer application workflows.
-- No table/column/constraint changes or backfill. Procedures participate in the caller transaction.
CREATE VIEW public.v_actor_accounts AS
SELECT id, username, role, status FROM public.users;

CREATE VIEW public.v_catalog_developers AS
SELECT id, username FROM public.users
WHERE role IN ('DEVELOPER','ADMINISTRATOR') AND status='VERIFIED';

CREATE VIEW public.v_genre_summary AS
SELECT ge.id,ge.name,ge.description,
       (SELECT count(*) FROM public.game_genres gg WHERE gg.genre_id=ge.id) AS game_count
FROM public.genres ge;

CREATE VIEW public.v_game_genres AS
SELECT gg.game_id,gg.genre_id,ge.name AS genre_name
FROM public.game_genres gg JOIN public.genres ge ON ge.id=gg.genre_id;

CREATE VIEW public.v_catalog_games AS
SELECT g.id,g.developer_id,u.username AS developer_name,g.title,g.description,g.price,
       g.cover_image_url,g.version,g.rating,g.uploaded_at,g.status,g.promotion_id,
       EXISTS(SELECT 1 FROM public.game_submissions s WHERE s.game_id=g.id AND s.status='ACCEPTED') AS can_enable,
       EXISTS(SELECT 1 FROM public.game_submissions s WHERE s.game_id=g.id AND s.status='PENDING') AS has_pending_submission,
       COALESCE((SELECT string_agg(ge.name, ', ' ORDER BY ge.name)
                 FROM public.game_genres gg JOIN public.genres ge ON ge.id=gg.genre_id
                 WHERE gg.game_id=g.id),'Trò chơi') AS genre
FROM public.games g JOIN public.users u ON u.id=g.developer_id;

CREATE VIEW public.v_game_submission_details AS
SELECT s.id,s.game_id,g.title AS game_title,s.submitted_by,u.username AS submitter_name,
       s.reviewed_by,r.username AS reviewer_name,s.status,s.reason,s.created_at,s.reviewed_at
FROM public.game_submissions s JOIN public.games g ON g.id=s.game_id
JOIN public.users u ON u.id=s.submitted_by LEFT JOIN public.users r ON r.id=s.reviewed_by;

CREATE VIEW public.v_developer_submission_details AS
SELECT s.id,s.user_id,u.username,s.status,s.application_reason,s.reason
FROM public.developer_submissions s JOIN public.users u ON u.id=s.user_id;

CREATE VIEW public.v_store_games AS
SELECT g.id,g.developer_id,g.developer_name,g.title,g.description,g.price,g.cover_image_url,
       g.version,g.rating,g.uploaded_at,g.status,g.promotion_id,g.genre,
       p.name AS promotion_name,p.discount AS promotion_discount,p.status AS promotion_status
FROM public.v_catalog_games g LEFT JOIN public.promotions p ON p.id=g.promotion_id
WHERE g.status='AVAILABLE';

CREATE VIEW public.v_game_ownership AS
SELECT user_id,game_id FROM public.game_bought;

CREATE VIEW public.v_public_game_reviews AS
SELECT r.id,r.user_id,u.username,r.game_id,r.rating,r.content
FROM public.reviews r JOIN public.users u ON u.id=r.user_id;

-- Shared validation helpers; never return private account fields.
CREATE FUNCTION public.fn_huan_actor(p_username text,p_roles text[] DEFAULT NULL)
RETURNS public.v_actor_accounts LANGUAGE plpgsql AS $$
DECLARE a public.v_actor_accounts;
BEGIN
    SELECT id,username,role,status INTO a FROM public.users
    WHERE lower(username)=lower(p_username) FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tài khoản không còn tồn tại.' USING ERRCODE='G0401'; END IF;
    IF a.status<>'VERIFIED' OR (p_roles IS NOT NULL AND NOT a.role=ANY(p_roles)) THEN
        RAISE EXCEPTION 'Tài khoản chưa xác minh, đã bị khóa hoặc không có quyền thực hiện.' USING ERRCODE='G0403';
    END IF;
    RETURN a;
END;
$$;

CREATE FUNCTION public.fn_huan_owned_game(p_actor public.v_actor_accounts,p_game uuid)
RETURNS public.games LANGUAGE plpgsql AS $$
DECLARE g public.games;
BEGIN
    SELECT * INTO g FROM public.games WHERE id=p_game FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy trò chơi.' USING ERRCODE='G0404'; END IF;
    IF p_actor.role<>'ADMINISTRATOR' AND g.developer_id<>p_actor.id THEN
        RAISE EXCEPTION 'Bạn chỉ được quản lý trò chơi của chính mình.' USING ERRCODE='G0403';
    END IF;
    RETURN g;
END;
$$;

CREATE FUNCTION public.fn_huan_validate_game_input(p_title text,p_description text,p_price numeric,
    p_cover text,p_version text,p_genres uuid[]) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF p_title IS NULL OR btrim(p_title)='' OR char_length(btrim(p_title))>200
       OR char_length(COALESCE(p_description,''))>10000 OR char_length(COALESCE(p_version,''))>100
       OR char_length(COALESCE(p_cover,''))>2048 THEN
        RAISE EXCEPTION 'Thông tin trò chơi không hợp lệ.' USING ERRCODE='G0400';
    END IF;
    IF p_price IS NULL OR p_price<0 OR p_price>99999999999999999.99
       OR p_price::text IN ('NaN','Infinity','-Infinity') OR p_price<>round(p_price,2) THEN
        RAISE EXCEPTION 'Giá không âm, hữu hạn và có tối đa 2 chữ số thập phân.' USING ERRCODE='G0400';
    END IF;
    IF p_cover IS NOT NULL AND p_cover!~* '^https://[^/@[:space:]]+([/:?#]|$)' THEN
        RAISE EXCEPTION 'Ảnh phải là URL HTTPS hợp lệ.' USING ERRCODE='G0400';
    END IF;
    IF p_genres IS NULL OR cardinality(p_genres) NOT BETWEEN 1 AND 100
       OR array_position(p_genres,NULL) IS NOT NULL
       OR (SELECT count(DISTINCT x) FROM unnest(p_genres) x)<>cardinality(p_genres)
       OR (SELECT count(*) FROM public.genres WHERE id=ANY(p_genres))<>cardinality(p_genres) THEN
        RAISE EXCEPTION 'Trò chơi phải có 1–100 thể loại tồn tại, không trùng lặp.' USING ERRCODE='G0400';
    END IF;
END;
$$;

CREATE FUNCTION public.fn_huan_invalidate_game_approval(p_game uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS(SELECT 1 FROM public.games g JOIN public.users u ON u.id=g.developer_id
              WHERE g.id=p_game AND u.role<>'ADMINISTRATOR') THEN
        UPDATE public.game_submissions SET status='REJECTED',reason='Trò chơi đã bị chỉnh sửa'
        WHERE game_id=p_game AND status='ACCEPTED';
        UPDATE public.games SET status='HIDDEN' WHERE id=p_game AND status<>'HIDDEN';
    END IF;
END;
$$;

CREATE FUNCTION public.fn_huan_game_content_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM public.fn_huan_invalidate_game_approval(NEW.id);
    RETURN NULL;
END;
$$;
CREATE TRIGGER games_invalidate_approval AFTER UPDATE ON public.games FOR EACH ROW
WHEN ((OLD.title,OLD.description,OLD.price,OLD.cover_image_url,OLD.version)
      IS DISTINCT FROM (NEW.title,NEW.description,NEW.price,NEW.cover_image_url,NEW.version))
EXECUTE FUNCTION public.fn_huan_game_content_changed();

CREATE FUNCTION public.fn_huan_game_genres_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    -- All supported procedures lock the parent game before modifying links.
    IF TG_OP='UPDATE' AND (OLD.game_id,OLD.genre_id) IS NOT DISTINCT FROM (NEW.game_id,NEW.genre_id) THEN
        RETURN NULL;
    END IF;
    IF TG_OP<>'INSERT' THEN PERFORM public.fn_huan_invalidate_game_approval(OLD.game_id); END IF;
    IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND NEW.game_id IS DISTINCT FROM OLD.game_id) THEN
        PERFORM public.fn_huan_invalidate_game_approval(NEW.game_id);
    END IF;
    RETURN NULL;
END;
$$;
CREATE TRIGGER game_genres_invalidate_approval AFTER INSERT OR UPDATE OR DELETE ON public.game_genres
FOR EACH ROW EXECUTE FUNCTION public.fn_huan_game_genres_changed();

CREATE PROCEDURE public.sp_create_genre(IN p_actor_username text,IN p_name text,IN p_description text,OUT p_id uuid)
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('gamestore.genre-management'));
    PERFORM public.fn_huan_actor(p_actor_username,ARRAY['ADMINISTRATOR']);
    IF p_name IS NULL OR btrim(p_name)='' OR char_length(btrim(p_name))>100 OR char_length(COALESCE(p_description,''))>2000 THEN
        RAISE EXCEPTION 'Tên thể loại phải có 1–100 ký tự; mô tả tối đa 2000 ký tự.' USING ERRCODE='G0400';
    END IF;
    IF EXISTS(SELECT 1 FROM public.genres WHERE lower(btrim(name))=lower(btrim(p_name))) THEN
        RAISE EXCEPTION 'Tên thể loại đã tồn tại.' USING ERRCODE='G0409';
    END IF;
    INSERT INTO public.genres(name,description) VALUES(btrim(p_name),btrim(p_description)) RETURNING id INTO p_id;
END;
$$;

CREATE PROCEDURE public.sp_update_genre(IN p_actor_username text,IN p_id uuid,IN p_name text,IN p_description text)
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('gamestore.genre-management'));
    PERFORM public.fn_huan_actor(p_actor_username,ARRAY['ADMINISTRATOR']);
    IF NOT EXISTS(SELECT 1 FROM public.genres WHERE id=p_id) THEN
        RAISE EXCEPTION 'Không tìm thấy thể loại.' USING ERRCODE='G0404';
    END IF;
    IF p_name IS NULL OR btrim(p_name)='' OR char_length(btrim(p_name))>100 OR char_length(COALESCE(p_description,''))>2000 THEN
        RAISE EXCEPTION 'Tên thể loại phải có 1–100 ký tự; mô tả tối đa 2000 ký tự.' USING ERRCODE='G0400';
    END IF;
    IF EXISTS(SELECT 1 FROM public.genres WHERE lower(btrim(name))=lower(btrim(p_name)) AND id<>p_id) THEN
        RAISE EXCEPTION 'Tên thể loại đã tồn tại.' USING ERRCODE='G0409';
    END IF;
    UPDATE public.genres SET name=btrim(p_name),description=btrim(p_description) WHERE id=p_id;
END;
$$;

CREATE PROCEDURE public.sp_delete_genre(IN p_actor_username text,IN p_id uuid)
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('gamestore.genre-management'));
    PERFORM public.fn_huan_actor(p_actor_username,ARRAY['ADMINISTRATOR']);
    IF NOT EXISTS(SELECT 1 FROM public.genres WHERE id=p_id) THEN RAISE EXCEPTION 'Không tìm thấy thể loại.' USING ERRCODE='G0404'; END IF;
    IF EXISTS(SELECT 1 FROM public.game_genres WHERE genre_id=p_id) THEN
        RAISE EXCEPTION 'Thể loại đang được sử dụng. Hãy gỡ liên kết trước.' USING ERRCODE='G0409';
    END IF;
    DELETE FROM public.genres WHERE id=p_id;
END;
$$;

CREATE PROCEDURE public.sp_attach_game_genre(IN p_actor_username text,IN p_genre uuid,IN p_game uuid)
LANGUAGE plpgsql AS $$
DECLARE a public.v_actor_accounts;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('gamestore.genre-management'));
    a:=public.fn_huan_actor(p_actor_username,ARRAY['ADMINISTRATOR']);
    IF NOT EXISTS(SELECT 1 FROM public.genres WHERE id=p_genre) THEN RAISE EXCEPTION 'Không tìm thấy thể loại.' USING ERRCODE='G0404'; END IF;
    PERFORM public.fn_huan_owned_game(a,p_game);
    INSERT INTO public.game_genres(game_id,genre_id) VALUES(p_game,p_genre) ON CONFLICT DO NOTHING;
END;
$$;

CREATE PROCEDURE public.sp_detach_game_genre(IN p_actor_username text,IN p_genre uuid,IN p_game uuid)
LANGUAGE plpgsql AS $$
DECLARE a public.v_actor_accounts;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('gamestore.genre-management'));
    a:=public.fn_huan_actor(p_actor_username,ARRAY['ADMINISTRATOR']);
    IF NOT EXISTS(SELECT 1 FROM public.genres WHERE id=p_genre) THEN RAISE EXCEPTION 'Không tìm thấy thể loại.' USING ERRCODE='G0404'; END IF;
    PERFORM public.fn_huan_owned_game(a,p_game);
    IF EXISTS(SELECT 1 FROM public.game_genres WHERE game_id=p_game AND genre_id=p_genre)
       AND (SELECT count(*) FROM public.game_genres WHERE game_id=p_game)<=1 THEN
        RAISE EXCEPTION 'Trò chơi phải giữ ít nhất 1 thể loại.' USING ERRCODE='G0409';
    END IF;
    DELETE FROM public.game_genres WHERE game_id=p_game AND genre_id=p_genre;
END;
$$;

CREATE PROCEDURE public.sp_create_game(IN p_actor_username text,IN p_title text,IN p_description text,
    IN p_price numeric,IN p_cover text,IN p_version text,IN p_genres uuid[],IN p_developer uuid,IN p_status text,OUT p_id uuid)
LANGUAGE plpgsql AS $$
DECLARE a public.v_actor_accounts; owner_id uuid; next_status text;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('gamestore.genre-management'));
    a:=public.fn_huan_actor(p_actor_username,ARRAY['ADMINISTRATOR','DEVELOPER']);
    PERFORM public.fn_huan_validate_game_input(p_title,p_description,p_price,p_cover,p_version,p_genres);
    IF a.role<>'ADMINISTRATOR' AND (p_developer IS NOT NULL AND p_developer<>a.id OR COALESCE(p_status,'HIDDEN')<>'HIDDEN') THEN
        RAISE EXCEPTION 'Developer không được giả mạo chủ sở hữu hoặc tự phát hành.' USING ERRCODE='G0403';
    END IF;
    owner_id:=COALESCE(p_developer,a.id); next_status:=COALESCE(p_status,'HIDDEN');
    IF next_status NOT IN ('HIDDEN','AVAILABLE') THEN RAISE EXCEPTION 'Trạng thái trò chơi không hợp lệ.' USING ERRCODE='G0400'; END IF;
    PERFORM 1 FROM public.users WHERE id=owner_id AND role IN ('DEVELOPER','ADMINISTRATOR') AND status='VERIFIED' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Chủ sở hữu phải là developer hoặc admin đã xác minh.' USING ERRCODE='G0400'; END IF;
    INSERT INTO public.games(developer_id,title,description,price,cover_image_url,version,status)
    VALUES(owner_id,btrim(p_title),COALESCE(btrim(p_description),''),p_price,p_cover,COALESCE(btrim(p_version),''),'HIDDEN') RETURNING id INTO p_id;
    INSERT INTO public.game_genres(game_id,genre_id) SELECT p_id,x FROM unnest(p_genres) x;
    -- Initial genre insertion is not an edit; preserve admin's initial publication choice.
    UPDATE public.games SET status=next_status WHERE id=p_id;
END;
$$;

CREATE PROCEDURE public.sp_update_game(IN p_actor_username text,IN p_id uuid,IN p_title text,IN p_description text,
    IN p_price numeric,IN p_cover text,IN p_version text,IN p_genres uuid[],IN p_developer uuid,IN p_status text)
LANGUAGE plpgsql AS $$
DECLARE a public.v_actor_accounts; g public.games; next_status text;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('gamestore.genre-management'));
    a:=public.fn_huan_actor(p_actor_username,ARRAY['ADMINISTRATOR','DEVELOPER']);
    g:=public.fn_huan_owned_game(a,p_id);
    PERFORM public.fn_huan_validate_game_input(p_title,p_description,p_price,p_cover,p_version,p_genres);
    IF a.role<>'ADMINISTRATOR' AND ((p_developer IS NOT NULL AND p_developer<>a.id) OR COALESCE(p_status,'HIDDEN')<>'HIDDEN') THEN
        RAISE EXCEPTION 'Developer không được giả mạo chủ sở hữu hoặc tự phát hành qua sửa nội dung.' USING ERRCODE='G0403';
    END IF;
    IF p_developer IS NOT NULL AND p_developer<>g.developer_id THEN
        RAISE EXCEPTION 'Không thể thay đổi chủ sở hữu trò chơi.' USING ERRCODE='G0400';
    END IF;
    next_status:=CASE WHEN a.role='ADMINISTRATOR' THEN COALESCE(p_status,g.status) ELSE g.status END;
    IF next_status NOT IN ('HIDDEN','AVAILABLE') THEN RAISE EXCEPTION 'Trạng thái trò chơi không hợp lệ.' USING ERRCODE='G0400'; END IF;
    UPDATE public.games SET title=btrim(p_title),description=COALESCE(btrim(p_description),''),price=p_price,
        cover_image_url=p_cover,version=COALESCE(btrim(p_version),''),status=next_status WHERE id=p_id;
    DELETE FROM public.game_genres WHERE game_id=p_id AND NOT genre_id=ANY(p_genres);
    INSERT INTO public.game_genres(game_id,genre_id) SELECT p_id,x FROM unnest(p_genres) x ON CONFLICT DO NOTHING;
END;
$$;

CREATE PROCEDURE public.sp_set_game_status(IN p_actor_username text,IN p_id uuid,IN p_status text)
LANGUAGE plpgsql AS $$
DECLARE a public.v_actor_accounts;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('gamestore.genre-management'));
    a:=public.fn_huan_actor(p_actor_username,ARRAY['ADMINISTRATOR','DEVELOPER']);
    PERFORM public.fn_huan_owned_game(a,p_id);
    IF p_status IS NULL OR p_status NOT IN ('HIDDEN','AVAILABLE') THEN RAISE EXCEPTION 'Trạng thái trò chơi không hợp lệ.' USING ERRCODE='G0400'; END IF;
    IF p_status='AVAILABLE' THEN
        IF NOT EXISTS(SELECT 1 FROM public.game_genres WHERE game_id=p_id) THEN RAISE EXCEPTION 'Trò chơi cần ít nhất 1 thể loại trước khi phát hành.' USING ERRCODE='G0409'; END IF;
        IF a.role<>'ADMINISTRATOR' AND NOT EXISTS(SELECT 1 FROM public.game_submissions WHERE game_id=p_id AND status='ACCEPTED') THEN
            RAISE EXCEPTION 'Trò chơi chưa được duyệt hoặc đã bị chỉnh sửa. Vui lòng gửi đơn.' USING ERRCODE='G0409';
        END IF;
    END IF;
    UPDATE public.games SET status=p_status WHERE id=p_id;
END;
$$;

CREATE PROCEDURE public.sp_delete_game_permanently(IN p_actor_username text,IN p_id uuid)
LANGUAGE plpgsql AS $$
DECLARE a public.v_actor_accounts;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('gamestore.genre-management'));
    a:=public.fn_huan_actor(p_actor_username,ARRAY['ADMINISTRATOR']);
    PERFORM public.fn_huan_owned_game(a,p_id);
    IF EXISTS(SELECT 1 FROM public.transactions WHERE game_id=p_id) OR EXISTS(SELECT 1 FROM public.game_bought WHERE game_id=p_id)
       OR EXISTS(SELECT 1 FROM public.reviews WHERE game_id=p_id) THEN
        RAISE EXCEPTION 'Trò chơi có lịch sử giao dịch hoặc quyền sở hữu. Hãy ẩn để giữ lịch sử.' USING ERRCODE='G0409';
    END IF;
    DELETE FROM public.wishlists WHERE game_id=p_id;
    DELETE FROM public.game_genres WHERE game_id=p_id;
    DELETE FROM public.game_submissions WHERE game_id=p_id;
    DELETE FROM public.games WHERE id=p_id;
END;
$$;

CREATE PROCEDURE public.sp_submit_game(IN p_actor_username text,IN p_game uuid,OUT p_id uuid)
LANGUAGE plpgsql AS $$
DECLARE a public.v_actor_accounts; g public.games;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('gamestore.genre-management'));
    a:=public.fn_huan_actor(p_actor_username,ARRAY['ADMINISTRATOR','DEVELOPER']);
    g:=public.fn_huan_owned_game(a,p_game);
    IF NOT EXISTS(SELECT 1 FROM public.game_genres WHERE game_id=p_game) THEN RAISE EXCEPTION 'Trò chơi cần ít nhất 1 thể loại.' USING ERRCODE='G0409'; END IF;
    IF EXISTS(SELECT 1 FROM public.game_submissions WHERE game_id=p_game AND status='PENDING') THEN
        RAISE EXCEPTION 'Trò chơi đã có đơn chờ duyệt.' USING ERRCODE='G0409';
    END IF;
    IF g.status='AVAILABLE' OR EXISTS(SELECT 1 FROM public.game_submissions WHERE game_id=p_game AND status='ACCEPTED') THEN
        RAISE EXCEPTION 'Trò chơi đã được phát hành hoặc duyệt.' USING ERRCODE='G0409';
    END IF;
    INSERT INTO public.game_submissions(game_id,submitted_by) VALUES(p_game,a.id) RETURNING id INTO p_id;
END;
$$;

CREATE PROCEDURE public.sp_review_game_submission(IN p_actor_username text,IN p_id uuid,IN p_status text,IN p_reason text)
LANGUAGE plpgsql AS $$
DECLARE a public.v_actor_accounts; s public.game_submissions;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('gamestore.genre-management'));
    a:=public.fn_huan_actor(p_actor_username,ARRAY['ADMINISTRATOR']);
    SELECT * INTO s FROM public.game_submissions WHERE id=p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đơn đăng tải.' USING ERRCODE='G0404'; END IF;
    PERFORM public.fn_huan_owned_game(a,s.game_id);
    IF s.status<>'PENDING' THEN RAISE EXCEPTION 'Đơn đã được xử lý.' USING ERRCODE='G0409'; END IF;
    IF p_status IS NULL OR p_status NOT IN ('ACCEPTED','REJECTED') OR COALESCE(btrim(p_reason),'')='' OR char_length(btrim(p_reason))>2000 THEN
        RAISE EXCEPTION 'Quyết định hoặc lý do duyệt không hợp lệ (1–2000 ký tự).' USING ERRCODE='G0400';
    END IF;
    IF p_status='ACCEPTED' AND NOT EXISTS(SELECT 1 FROM public.game_genres WHERE game_id=s.game_id) THEN
        RAISE EXCEPTION 'Trò chơi cần ít nhất 1 thể loại.' USING ERRCODE='G0409';
    END IF;
    UPDATE public.game_submissions SET status=p_status,reason=btrim(p_reason),reviewed_by=a.id,reviewed_at=CURRENT_TIMESTAMP WHERE id=p_id;
    UPDATE public.games SET status=CASE WHEN p_status='ACCEPTED' THEN 'AVAILABLE' ELSE 'HIDDEN' END WHERE id=s.game_id;
END;
$$;

CREATE PROCEDURE public.sp_submit_developer_application(IN p_actor_username text,IN p_reason text,OUT p_id uuid)
LANGUAGE plpgsql AS $$
DECLARE a public.v_actor_accounts;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('gamestore.developer-submissions'));
    a:=public.fn_huan_actor(p_actor_username,ARRAY['USER']);
    IF COALESCE(btrim(p_reason),'')='' OR char_length(btrim(p_reason))>2000 THEN
        RAISE EXCEPTION 'Lý do đăng ký phải từ 1 đến 2000 ký tự.' USING ERRCODE='G0400';
    END IF;
    IF EXISTS(SELECT 1 FROM public.developer_submissions WHERE user_id=a.id AND status='PENDING') THEN
        RAISE EXCEPTION 'Bạn đã có đơn đăng ký đang chờ duyệt.' USING ERRCODE='G0409';
    END IF;
    INSERT INTO public.developer_submissions(user_id,application_reason) VALUES(a.id,btrim(p_reason)) RETURNING id INTO p_id;
END;
$$;

CREATE PROCEDURE public.sp_review_developer_application(IN p_actor_username text,IN p_id uuid,IN p_status text,IN p_reason text)
LANGUAGE plpgsql AS $$
DECLARE a public.v_actor_accounts; s public.developer_submissions;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('gamestore.developer-submissions'));
    a:=public.fn_huan_actor(p_actor_username,ARRAY['ADMINISTRATOR']);
    IF p_status IS NULL OR p_status NOT IN ('ACCEPTED','REJECTED') OR COALESCE(btrim(p_reason),'')='' OR char_length(btrim(p_reason))>2000 THEN
        RAISE EXCEPTION 'Quyết định hoặc lý do phản hồi không hợp lệ (1–2000 ký tự).' USING ERRCODE='G0400';
    END IF;
    SELECT * INTO s FROM public.developer_submissions WHERE id=p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đơn đăng ký.' USING ERRCODE='G0404'; END IF;
    IF s.status<>'PENDING' THEN RAISE EXCEPTION 'Đơn đăng ký không ở trạng thái chờ duyệt.' USING ERRCODE='G0409'; END IF;
    PERFORM 1 FROM public.users WHERE id=s.user_id AND role='USER' AND status='VERIFIED' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Người dùng không còn là tài khoản VERIFIED USER hợp lệ.' USING ERRCODE='G0409'; END IF;
    IF p_status='ACCEPTED' THEN UPDATE public.users SET role='DEVELOPER' WHERE id=s.user_id; END IF;
    UPDATE public.developer_submissions SET status=p_status,reason=btrim(p_reason) WHERE id=p_id;
END;
$$;

-- Five non-unique B-tree indexes explicitly approved on 2026-11-15.
-- games_store_title_idx supports order/filter, not arbitrary substring search.
CREATE INDEX genres_name_lookup_idx ON public.genres (lower(btrim(name)));
CREATE INDEX game_submissions_game_status_idx ON public.game_submissions (game_id,status);
CREATE INDEX developer_submissions_user_status_idx ON public.developer_submissions (user_id,status);
CREATE INDEX developer_submissions_status_id_idx ON public.developer_submissions (status,id);
CREATE INDEX games_store_title_idx ON public.games (lower(title),id) WHERE status='AVAILABLE';
