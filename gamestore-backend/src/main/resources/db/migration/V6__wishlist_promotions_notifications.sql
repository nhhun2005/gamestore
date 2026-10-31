-- V6: danh sách yêu thích, quản lý khuyến mãi, thông báo giảm giá.
-- Đảm bảo tương thích với schema V1 đã tồn tại trong database.

-- 1) wishlists: bảo đảm bảng và cột created_at, khóa ngoại CASCADE
CREATE TABLE IF NOT EXISTS public.wishlists (
    user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    game_id    uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, game_id)
);

ALTER TABLE public.wishlists ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS uq_wishlists_user_game ON public.wishlists (user_id, game_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_game ON public.wishlists (game_id);

-- Cập nhật ràng buộc khóa ngoại của wishlists sang ON DELETE CASCADE nếu được tạo từ V1
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' AND table_name = 'wishlists' AND constraint_name = 'wishlists_user_id_fkey'
    ) THEN
        ALTER TABLE public.wishlists DROP CONSTRAINT wishlists_user_id_fkey;
        ALTER TABLE public.wishlists ADD CONSTRAINT wishlists_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' AND table_name = 'wishlists' AND constraint_name = 'wishlists_game_id_fkey'
    ) THEN
        ALTER TABLE public.wishlists DROP CONSTRAINT wishlists_game_id_fkey;
        ALTER TABLE public.wishlists ADD CONSTRAINT wishlists_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 2) notifications: bảo đảm tương thích với code Java mới và schema V1 cũ
CREATE TABLE IF NOT EXISTS public.notifications (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    game_id      uuid REFERENCES public.games(id) ON DELETE CASCADE,
    promotion_id uuid REFERENCES public.promotions(id) ON DELETE SET NULL,
    type         varchar(40)  NOT NULL DEFAULT 'WISHLIST_DISCOUNT',
    title        varchar(255) NOT NULL,
    message      text         NOT NULL,
    discount     numeric(5,2),
    created_at   timestamptz  NOT NULL DEFAULT now(),
    read_at      timestamptz
);

-- Bổ sung các cột mới nếu bảng notifications đã được tạo bởi V1
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type varchar(40) NOT NULL DEFAULT 'WISHLIST_DISCOUNT';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS discount numeric(5,2);
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Chuyển đổi tên cột content -> message (nếu còn dùng tên V1)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'content'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'message'
    ) THEN
        ALTER TABLE public.notifications RENAME COLUMN content TO message;
    ELSIF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'message'
    ) THEN
        ALTER TABLE public.notifications ADD COLUMN message text NOT NULL DEFAULT '';
    END IF;
END $$;

-- Đồng bộ dữ liệu is_read sang read_at (nếu có cột is_read từ V1)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'is_read'
    ) THEN
        UPDATE public.notifications SET read_at = now() WHERE is_read = TRUE AND read_at IS NULL;
    END IF;
END $$;

-- promotion_id phải cho phép NULL để khi xóa promotion thì SET NULL được (V1 quy định NOT NULL)
ALTER TABLE public.notifications ALTER COLUMN promotion_id DROP NOT NULL;

-- Cập nhật ràng buộc khóa ngoại notifications
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' AND table_name = 'notifications' AND constraint_name = 'notifications_promotion_id_fkey'
    ) THEN
        ALTER TABLE public.notifications DROP CONSTRAINT notifications_promotion_id_fkey;
        ALTER TABLE public.notifications ADD CONSTRAINT notifications_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE SET NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' AND table_name = 'notifications' AND constraint_name = 'notifications_user_id_fkey'
    ) THEN
        ALTER TABLE public.notifications DROP CONSTRAINT notifications_user_id_fkey;
        ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' AND table_name = 'notifications' AND constraint_name = 'notifications_game_id_fkey'
    ) THEN
        ALTER TABLE public.notifications ADD CONSTRAINT notifications_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread  ON public.notifications (user_id) WHERE read_at IS NULL;
