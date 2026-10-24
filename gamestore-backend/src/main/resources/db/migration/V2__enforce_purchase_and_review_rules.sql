-- Successful purchases are final: no refund or rewriting their history.
CREATE FUNCTION public.protect_successful_purchase() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.type = 'BUY' AND OLD.status = 'SUCCESSED' THEN
        RAISE EXCEPTION 'Successful BUY transactions are immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER transactions_protect_purchase BEFORE UPDATE OR DELETE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.protect_successful_purchase();

CREATE FUNCTION public.validate_game_ownership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.transactions t
        WHERE t.id = NEW.transaction_id AND t.user_id = NEW.user_id AND t.game_id = NEW.game_id
          AND t.type = 'BUY' AND t.status = 'SUCCESSED'
    ) THEN
        RAISE EXCEPTION 'Ownership requires a successful BUY for the same user and game' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER game_bought_validate BEFORE INSERT OR UPDATE ON public.game_bought
    FOR EACH ROW EXECUTE FUNCTION public.validate_game_ownership();

CREATE FUNCTION public.grant_purchased_game() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.type = 'BUY' AND NEW.status = 'SUCCESSED' THEN
        INSERT INTO public.game_bought(user_id, game_id, transaction_id)
        VALUES (NEW.user_id, NEW.game_id, NEW.id);
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER transactions_grant_game AFTER INSERT OR UPDATE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.grant_purchased_game();

-- Serialize review writes for each game before recomputing its average.
CREATE FUNCTION public.lock_review_game() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (NEW.game_id, NEW.user_id) IS DISTINCT FROM (OLD.game_id, OLD.user_id) THEN
        RAISE EXCEPTION 'Review author and game cannot be changed' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' THEN
        PERFORM 1 FROM public.games WHERE id = OLD.game_id FOR UPDATE;
        RETURN OLD;
    END IF;
    PERFORM 1 FROM public.games WHERE id = NEW.game_id FOR UPDATE;
    RETURN NEW;
END;
$$;
CREATE TRIGGER reviews_lock_game BEFORE INSERT OR UPDATE OR DELETE ON public.reviews
    FOR EACH ROW EXECUTE FUNCTION public.lock_review_game();

CREATE FUNCTION public.refresh_game_rating() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_game UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN target_game := OLD.game_id; ELSE target_game := NEW.game_id; END IF;
    UPDATE public.games SET rating = (SELECT avg(rating) FROM public.reviews WHERE game_id = target_game)
    WHERE id = target_game;
    RETURN NULL;
END;
$$;
CREATE TRIGGER reviews_refresh_rating AFTER INSERT OR UPDATE OR DELETE ON public.reviews
    FOR EACH ROW EXECUTE FUNCTION public.refresh_game_rating();

-- A game and its first submission must be created in the same SQL transaction.
CREATE FUNCTION public.require_game_submission() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_game UUID;
BEGIN
    IF TG_TABLE_NAME = 'games' THEN target_game := NEW.id; ELSE target_game := OLD.game_id; END IF;
    IF EXISTS (SELECT 1 FROM public.games WHERE id = target_game)
       AND NOT EXISTS (SELECT 1 FROM public.game_submissions WHERE game_id = target_game) THEN
        RAISE EXCEPTION 'A game must have at least one submission' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER games_require_submission AFTER INSERT ON public.games
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.require_game_submission();
CREATE CONSTRAINT TRIGGER submissions_preserve_minimum AFTER DELETE OR UPDATE ON public.game_submissions
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.require_game_submission();

-- Serialize submission removals/moves so concurrent requests cannot remove
-- the final two submissions while each still sees the other uncommitted row.
CREATE FUNCTION public.lock_submission_game() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM 1 FROM public.games WHERE id = OLD.game_id FOR UPDATE;
        RETURN OLD;
    END IF;
    PERFORM 1 FROM public.games WHERE id IN (OLD.game_id, NEW.game_id) ORDER BY id FOR UPDATE;
    RETURN NEW;
END;
$$;
CREATE TRIGGER submissions_lock_game BEFORE DELETE OR UPDATE ON public.game_submissions
    FOR EACH ROW EXECUTE FUNCTION public.lock_submission_game();
