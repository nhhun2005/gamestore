-- New successful purchases only; historical allocations are not paid again.
CREATE TABLE public.platform_revenue_wallet (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
    user_id UUID REFERENCES public.users(id)
);
INSERT INTO public.platform_revenue_wallet(singleton,user_id)
VALUES(TRUE,(SELECT id FROM public.users WHERE username='devgamestore' AND role='ADMINISTRATOR'));

ALTER TABLE public.transactions ADD COLUMN source_purchase_id UUID REFERENCES public.transactions(id);
ALTER TABLE public.transactions ADD COLUMN income_kind TEXT CHECK(income_kind IN ('DEVELOPER','PLATFORM_FEE','ADMIN_SALE'));
ALTER TABLE public.transactions ADD CONSTRAINT transactions_income_reference CHECK (
    (source_purchase_id IS NULL AND income_kind IS NULL) OR
    (source_purchase_id IS NOT NULL AND income_kind IS NOT NULL AND type='IN' AND status='SUCCESSED'));
CREATE UNIQUE INDEX wallet_income_once ON public.transactions(source_purchase_id,income_kind) WHERE source_purchase_id IS NOT NULL;

CREATE FUNCTION public.credit_sale_revenue_wallets() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sale public.transactions; platform UUID; fee NUMERIC; owner_amount NUMERIC; beneficiary UUID; value NUMERIC; kind TEXT;
BEGIN
    SELECT * INTO sale FROM public.transactions WHERE id=NEW.transaction_id;
    IF sale.type<>'BUY' OR sale.status<>'SUCCESSED' THEN RAISE EXCEPTION 'Revenue requires a successful purchase'; END IF;
    IF sale.amount=0 THEN RETURN NEW; END IF;
    fee:=round(sale.amount*NEW.platform_fee_rate,2);
    owner_amount:=sale.amount-fee;
    IF NEW.beneficiary_type='PLATFORM' THEN
        platform:=NEW.developer_id;
    ELSIF fee>0 THEN
        SELECT user_id INTO platform FROM public.platform_revenue_wallet WHERE singleton;
        IF platform IS NULL THEN
            SELECT id INTO platform FROM public.users WHERE username='devgamestore' AND role='ADMINISTRATOR';
            IF platform IS NULL THEN RAISE EXCEPTION 'Chưa cấu hình ví nhận phí sàn devgamestore.' USING ERRCODE='GS409'; END IF;
            UPDATE public.platform_revenue_wallet SET user_id=platform WHERE singleton AND user_id IS NULL;
            SELECT user_id INTO platform FROM public.platform_revenue_wallet WHERE singleton;
        END IF;
    END IF;
    -- Lock beneficiaries consistently; balances and income receipts commit with the purchase.
    PERFORM id FROM public.users WHERE id IN (NEW.developer_id,platform) ORDER BY id FOR UPDATE;
    FOR beneficiary,value,kind IN
        SELECT NEW.developer_id,owner_amount,'DEVELOPER' WHERE owner_amount>0
        UNION ALL SELECT platform,fee,CASE WHEN NEW.beneficiary_type='PLATFORM' THEN 'ADMIN_SALE' ELSE 'PLATFORM_FEE' END WHERE fee>0
    LOOP
        UPDATE public.users SET balance=balance+value WHERE id=beneficiary AND balance<=99999999999999999.99-value;
        IF NOT FOUND THEN RAISE EXCEPTION 'Ví nhận doanh thu vượt giới hạn hoặc không tồn tại.' USING ERRCODE='GS409'; END IF;
        INSERT INTO public.transactions(user_id,type,amount,status,source_purchase_id,income_kind)
            VALUES(beneficiary,'IN',value,'SUCCESSED',sale.id,kind);
    END LOOP;
    RETURN NEW;
END;
$$;
CREATE TRIGGER sale_allocations_credit_wallet AFTER INSERT ON public.sale_revenue_allocations
FOR EACH ROW EXECUTE FUNCTION public.credit_sale_revenue_wallets();

CREATE FUNCTION public.protect_revenue_wallet_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.source_purchase_id IS NOT NULL THEN RAISE EXCEPTION 'Revenue wallet credits are immutable' USING ERRCODE='23514'; END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER transactions_protect_income BEFORE UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.protect_revenue_wallet_receipt();

-- Financial entry points share one transaction lock before taking user locks.
-- This also prevents reciprocal developer purchases from deadlocking on payouts.
CREATE OR REPLACE PROCEDURE public.sp_lock_verified_user(IN p_user_id UUID, OUT p_balance NUMERIC)
LANGUAGE plpgsql AS $$
DECLARE v_status TEXT;
BEGIN
    PERFORM pg_advisory_xact_lock(726491830021);
    SELECT status,balance INTO v_status,p_balance FROM public.users WHERE id=p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='GS401', MESSAGE='Tài khoản không còn tồn tại.'; END IF;
    IF v_status <> 'VERIFIED' THEN RAISE EXCEPTION USING ERRCODE='GS403', MESSAGE='Tài khoản chưa được xác minh hoặc đã bị khóa.'; END IF;
END;
$$;
