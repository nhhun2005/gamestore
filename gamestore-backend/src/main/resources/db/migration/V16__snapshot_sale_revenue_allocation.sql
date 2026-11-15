-- Admin-owned games pay 100% to the platform. Developer-owned games retain 90/10.
-- Snapshot the beneficiary class at successful payment, independently of later roles.
CREATE TABLE public.sale_revenue_allocations (
    transaction_id UUID PRIMARY KEY REFERENCES public.transactions(id),
    developer_id UUID NOT NULL REFERENCES public.users(id),
    beneficiary_type TEXT NOT NULL CHECK(beneficiary_type IN ('PLATFORM','DEVELOPER')),
    platform_fee_rate NUMERIC(3,2) NOT NULL,
    CHECK((beneficiary_type='PLATFORM' AND platform_fee_rate=1.00) OR
          (beneficiary_type='DEVELOPER' AND platform_fee_rate=0.10))
);
CREATE INDEX sale_allocations_developer ON public.sale_revenue_allocations(developer_id);

CREATE FUNCTION public.capture_sale_revenue_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.type='BUY' AND NEW.status='SUCCESSED' THEN
        INSERT INTO public.sale_revenue_allocations(transaction_id,developer_id,beneficiary_type,platform_fee_rate)
        SELECT NEW.id,g.developer_id,CASE WHEN u.role='ADMINISTRATOR' THEN 'PLATFORM' ELSE 'DEVELOPER' END,
               CASE WHEN u.role='ADMINISTRATOR' THEN 1.00 ELSE 0.10 END
        FROM public.games g JOIN public.users u ON u.id=g.developer_id WHERE g.id=NEW.game_id
        ON CONFLICT(transaction_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;
-- Install the trigger before backfill; its table lock closes the concurrent-sale gap.
CREATE TRIGGER transactions_capture_revenue_allocation AFTER INSERT OR UPDATE OF status ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.capture_sale_revenue_allocation();

-- Existing successful receipts are immutable. Backfill only this additive ledger,
-- using current ownership/role because earlier receipts did not record owner class.
INSERT INTO public.sale_revenue_allocations(transaction_id,developer_id,beneficiary_type,platform_fee_rate)
SELECT t.id,g.developer_id,CASE WHEN u.role='ADMINISTRATOR' THEN 'PLATFORM' ELSE 'DEVELOPER' END,
       CASE WHEN u.role='ADMINISTRATOR' THEN 1.00 ELSE 0.10 END
FROM public.transactions t JOIN public.games g ON g.id=t.game_id JOIN public.users u ON u.id=g.developer_id
WHERE t.type='BUY' AND t.status='SUCCESSED'
ON CONFLICT(transaction_id) DO NOTHING;

CREATE OR REPLACE VIEW public.v_game_sale_revenue AS
SELECT t.id,t.game_id,t.type,t.amount,t.status,t.created_at,
       g.title AS game_title,a.developer_id,u.username AS developer_name,
       round(t.amount*a.platform_fee_rate,2) AS platform_fee,
       t.amount-round(t.amount*a.platform_fee_rate,2) AS developer_revenue,
       a.beneficiary_type
FROM public.transactions t
JOIN public.sale_revenue_allocations a ON a.transaction_id=t.id
JOIN public.games g ON g.id=t.game_id
JOIN public.users u ON u.id=a.developer_id
WHERE t.type='BUY' AND t.status='SUCCESSED';
