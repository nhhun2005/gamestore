package gamestore_backend.modules.catalog;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** Invalidate approval using the existing submission status and reason fields. */
public final class CatalogApprovalRules {
    private CatalogApprovalRules() {}

    public static void invalidateAfterEdit(JdbcTemplate jdbc, UUID game) {
        boolean developerOwned = Boolean.TRUE.equals(jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM games g JOIN users u ON u.id=g.developer_id WHERE g.id=? AND u.role<>'ADMINISTRATOR')",
            Boolean.class, game));
        if (!developerOwned) return;
        jdbc.update("UPDATE game_submissions SET status='REJECTED',reason='Trò chơi đã bị chỉnh sửa' WHERE game_id=? AND status='ACCEPTED'", game);
        jdbc.update("UPDATE games SET status='HIDDEN' WHERE id=?", game);
    }
}
