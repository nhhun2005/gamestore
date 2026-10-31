package gamestore_backend.modules.promotion;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public final class PromotionDtos {
    private PromotionDtos() {
    }

    /** Một chương trình khuyến mãi. discount là phần trăm giảm, ví dụ "30". */
    public record PromotionView(UUID id, String name, String discount, String status, List<UUID> game_ids) {
    }

    /**
     * Trò chơi có thể chọn khi tạo/sửa khuyến mãi. promotion_id != null nghĩa là
     * đang thuộc một khuyến mãi.
     */
    public record GameOption(UUID id, String title, String developer_name, String price, String status,
            UUID promotion_id) {
    }

    public record Overview(List<PromotionView> promotions, List<GameOption> games) {
    }

    /**
     * active chỉ có tác dụng khi tạo mới; đổi trạng thái sau đó dùng PUT
     * /{id}/status.
     */
    public record Input(String name, BigDecimal discount, List<UUID> game_ids, Boolean active) {
    }

    public record StatusInput(String status) {
    }

    /**
     * notified = số thông báo đã gửi cho người dùng đang yêu thích các game được
     * giảm giá.
     */
    public record SaveResult(PromotionView promotion, int notified) {
    }
}
