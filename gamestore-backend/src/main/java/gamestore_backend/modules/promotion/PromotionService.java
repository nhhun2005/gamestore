package gamestore_backend.modules.promotion;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import gamestore_backend.modules.commerce.CommerceException;
import gamestore_backend.modules.promotion.PromotionDtos.GameOption;
import gamestore_backend.modules.promotion.PromotionDtos.Input;
import gamestore_backend.modules.promotion.PromotionDtos.Overview;
import gamestore_backend.modules.promotion.PromotionDtos.PromotionView;
import gamestore_backend.modules.promotion.PromotionDtos.SaveResult;
import gamestore_backend.modules.promotion.PromotionDtos.StatusInput;

/**
 * Quản lý chương trình khuyến mãi (không dùng thời gian): chọn % giảm, chọn các
 * game, bật/tắt.
 * Mỗi game chỉ thuộc tối đa một khuyến mãi (games.promotion_id). Giá thực tế do
 * CommerceService.effectivePrice tính, chỉ áp dụng khi status = ENABLED.
 */
@Service
@Transactional(readOnly = true)
public class PromotionService {
    private static final int MAX_GAMES = 500;
    private static final BigDecimal MAX_PERCENT = new BigDecimal("99");
    private static final String ENABLED = "ENABLED", DISABLED = "DISABLED";
    private final JdbcTemplate jdbc;

    public PromotionService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private record Existing(UUID id, String name, BigDecimal discount, String status) {
    }

    private record Clean(String name, BigDecimal discount, List<UUID> games) {
    }

    private record GameRow(UUID id, String title, UUID promotionId, String promotionName) {
    }

    private static CommerceException error(HttpStatus status, String message) {
        return new CommerceException(status, message);
    }

    private void admin(String username) {
        boolean allowed = Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM users WHERE lower(username)=lower(?) AND role='ADMINISTRATOR' AND status='VERIFIED')",
                Boolean.class, username));
        if (!allowed)
            throw error(HttpStatus.FORBIDDEN, "Chỉ quản trị viên có tài khoản đã xác minh được quản lý khuyến mãi.");
    }

    /**
     * Tuần tự hóa mọi thao tác sửa khuyến mãi để kiểm tra trùng game và gửi thông
     * báo là nguyên tử.
     */
    private void lock() {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtext('gamestore.promotion-management'))", r -> {
        });
    }

    private static String percent(BigDecimal value) {
        return value.stripTrailingZeros().toPlainString();
    }

    private static String marks(int count) {
        return String.join(",", Collections.nCopies(count, "?"));
    }

    private Existing find(UUID id) {
        return jdbc.query("SELECT id,name,discount,status FROM promotions WHERE id=? FOR UPDATE",
                (r, n) -> new Existing(r.getObject("id", UUID.class), r.getString("name"), r.getBigDecimal("discount"),
                        r.getString("status")),
                id)
                .stream().findFirst()
                .orElseThrow(() -> error(HttpStatus.NOT_FOUND, "Không tìm thấy chương trình khuyến mãi."));
    }

    private List<PromotionView> views(UUID only) {
        Object[] args = only == null ? new Object[0] : new Object[] { only };
        Map<UUID, List<UUID>> links = new HashMap<>();
        jdbc.query(
                "SELECT id,promotion_id FROM games WHERE promotion_id IS NOT NULL"
                        + (only == null ? "" : " AND promotion_id=?"),
                (RowCallbackHandler) r -> links
                        .computeIfAbsent(r.getObject("promotion_id", UUID.class), key -> new ArrayList<>())
                        .add(r.getObject("id", UUID.class)),
                args);
        return jdbc.query(
                "SELECT id,name,discount,status FROM promotions" + (only == null ? "" : " WHERE id=?")
                        + " ORDER BY lower(name),id",
                (r, n) -> {
                    UUID id = r.getObject("id", UUID.class);
                    return new PromotionView(id, r.getString("name"), percent(r.getBigDecimal("discount")),
                            r.getString("status"), links.getOrDefault(id, List.of()));
                }, args);
    }

    public Overview overview(String username) {
        admin(username);
        List<GameOption> games = jdbc.query(
                "SELECT g.id,g.title,g.price,g.status,g.promotion_id,u.username AS developer_name FROM games g JOIN users u ON u.id=g.developer_id ORDER BY lower(g.title),g.id",
                (r, n) -> new GameOption(r.getObject("id", UUID.class), r.getString("title"),
                        r.getString("developer_name"),
                        r.getBigDecimal("price").setScale(2, RoundingMode.HALF_UP).toPlainString(),
                        r.getString("status"), r.getObject("promotion_id", UUID.class)));
        return new Overview(views(null), games);
    }

    private Clean clean(Input input, UUID self) {
        if (input == null)
            throw error(HttpStatus.BAD_REQUEST, "Thiếu dữ liệu khuyến mãi.");
        String name = input.name() == null ? "" : input.name().strip();
        if (name.isEmpty() || name.length() > 120)
            throw error(HttpStatus.BAD_REQUEST, "Tên chương trình bắt buộc, tối đa 120 ký tự.");
        BigDecimal discount = input.discount();
        if (discount == null || discount.stripTrailingZeros().scale() > 0 || discount.compareTo(BigDecimal.ONE) < 0
                || discount.compareTo(MAX_PERCENT) > 0)
            throw error(HttpStatus.BAD_REQUEST, "Phần trăm giảm phải là số nguyên từ 1 đến 99.");
        discount = discount.setScale(0, RoundingMode.UNNECESSARY);
        List<UUID> games = input.game_ids();
        if (games == null || games.isEmpty() || games.size() > MAX_GAMES || games.contains(null)
                || new HashSet<>(games).size() != games.size())
            throw error(HttpStatus.BAD_REQUEST,
                    "Hãy chọn ít nhất 1 trò chơi (tối đa " + MAX_GAMES + ", không trùng lặp).");
        UUID exclude = self == null ? new UUID(0L, 0L) : self;
        if (Boolean.TRUE.equals(
                jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM promotions WHERE lower(name)=lower(?) AND id<>?)",
                        Boolean.class, name, exclude)))
            throw error(HttpStatus.CONFLICT, "Đã có chương trình khuyến mãi trùng tên.");
        return new Clean(name, discount, List.copyOf(games));
    }

    /**
     * Game phải tồn tại và chưa thuộc khuyến mãi khác. Không tự chuyển game giữa
     * các khuyến mãi để tránh đổi giá ngoài ý muốn.
     */
    private void checkGames(List<UUID> ids, UUID self) {
        List<GameRow> rows = jdbc.query(
                "SELECT g.id,g.title,g.promotion_id,p.name AS promotion_name FROM games g LEFT JOIN promotions p ON p.id=g.promotion_id WHERE g.id IN ("
                        + marks(ids.size()) + ")",
                (r, n) -> new GameRow(r.getObject("id", UUID.class), r.getString("title"),
                        r.getObject("promotion_id", UUID.class), r.getString("promotion_name")),
                ids.toArray());
        if (rows.size() != ids.size())
            throw error(HttpStatus.BAD_REQUEST, "Có trò chơi không còn tồn tại. Vui lòng tải lại danh sách.");
        List<String> taken = rows.stream().filter(g -> g.promotionId() != null && !g.promotionId().equals(self))
                .map(g -> "«" + g.title() + "» (đang thuộc «" + g.promotionName() + "»)").sorted().toList();
        if (!taken.isEmpty())
            throw error(HttpStatus.CONFLICT,
                    "Mỗi trò chơi chỉ thuộc một khuyến mãi. Đã có: "
                            + String.join(", ", taken.subList(0, Math.min(5, taken.size())))
                            + (taken.size() > 5 ? "…" : "") + ".");
    }

    private void assign(UUID promotion, List<UUID> games) {
        jdbc.update("UPDATE games SET promotion_id=NULL WHERE promotion_id=?", promotion);
        jdbc.batchUpdate("UPDATE games SET promotion_id=? WHERE id=?", games, games.size(), (ps, game) -> {
            ps.setObject(1, promotion);
            ps.setObject(2, game);
        });
    }

    /**
     * Gửi thông báo cho người dùng đã xác minh đang yêu thích game được giảm giá,
     * chưa sở hữu game, và game đang mở bán.
     * Bỏ qua nếu họ đã có một thông báo y hệt (cùng game, khuyến mãi, mức giảm)
     * chưa đọc, để bật/tắt liên tục không gây spam.
     */
    private int notifyWishlists(UUID promotion, BigDecimal discount, List<UUID> games) {
        if (games.isEmpty())
            return 0;
        List<Object> args = new ArrayList<>();
        args.add(promotion);
        args.add(percent(discount));
        args.add(discount);
        args.addAll(games);
        args.add(promotion);
        args.add(discount);
        return jdbc.update(
                """
                        INSERT INTO notifications(user_id,game_id,promotion_id,type,title,message,discount)
                        SELECT w.user_id, g.id, ?, 'WISHLIST_DISCOUNT', 'Game yêu thích đang giảm giá',
                               g.title || ' đang giảm ' || ? || '%. Xem ngay trong danh sách yêu thích của bạn.', ?
                        FROM wishlists w
                        JOIN games g ON g.id=w.game_id
                        JOIN users u ON u.id=w.user_id
                        WHERE g.id IN (""" + marks(games.size())
                        + """
                                ) AND g.status='AVAILABLE' AND u.status='VERIFIED'
                                  AND NOT EXISTS (SELECT 1 FROM game_bought b WHERE b.user_id=w.user_id AND b.game_id=g.id)
                                  AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id=w.user_id AND n.game_id=g.id
                                                  AND n.promotion_id=? AND n.discount=? AND n.type='WISHLIST_DISCOUNT' AND n.read_at IS NULL)
                                """,
                args.toArray());
    }

    @Transactional
    public SaveResult create(String username, Input input) {
        admin(username);
        lock();
        Clean data = clean(input, null);
        checkGames(data.games(), null);
        UUID id = UUID.randomUUID();
        String status = Boolean.TRUE.equals(input.active()) ? ENABLED : DISABLED;
        jdbc.update("INSERT INTO promotions(id,name,discount,status) VALUES (?,?,?,?)", id, data.name(),
                data.discount(), status);
        assign(id, data.games());
        int notified = ENABLED.equals(status) ? notifyWishlists(id, data.discount(), data.games()) : 0;
        return new SaveResult(views(id).get(0), notified);
    }

    @Transactional
    public SaveResult update(String username, UUID id, Input input) {
        admin(username);
        lock();
        Existing old = find(id);
        Clean data = clean(input, id);
        checkGames(data.games(), id);
        Set<UUID> before = new HashSet<>(
                jdbc.queryForList("SELECT id FROM games WHERE promotion_id=?", UUID.class, id));
        jdbc.update("UPDATE promotions SET name=?,discount=? WHERE id=?", data.name(), data.discount(), id);
        assign(id, data.games());
        int notified = 0;
        if (ENABLED.equals(old.status())) {
            // Giảm sâu hơn: báo lại cho mọi game. Ngược lại chỉ báo các game mới thêm vào.
            boolean deeper = data.discount().compareTo(old.discount()) > 0;
            List<UUID> targets = deeper ? data.games()
                    : data.games().stream().filter(game -> !before.contains(game)).toList();
            notified = notifyWishlists(id, data.discount(), targets);
        }
        return new SaveResult(views(id).get(0), notified);
    }

    @Transactional
    public SaveResult setStatus(String username, UUID id, StatusInput input) {
        admin(username);
        lock();
        String next = input == null ? null : input.status();
        if (!ENABLED.equals(next) && !DISABLED.equals(next))
            throw error(HttpStatus.BAD_REQUEST, "Trạng thái khuyến mãi không hợp lệ.");
        Existing old = find(id);
        int notified = 0;
        if (!old.status().equals(next)) {
            jdbc.update("UPDATE promotions SET status=? WHERE id=?", next, id);
            if (ENABLED.equals(next))
                notified = notifyWishlists(id, old.discount(),
                        jdbc.queryForList("SELECT id FROM games WHERE promotion_id=?", UUID.class, id));
        }
        return new SaveResult(views(id).get(0), notified);
    }

    @Transactional
    public void delete(String username, UUID id) {
        admin(username);
        lock();
        find(id);
        jdbc.update("UPDATE games SET promotion_id=NULL WHERE promotion_id=?", id);
        jdbc.update("DELETE FROM promotions WHERE id=?", id);
    }
}
