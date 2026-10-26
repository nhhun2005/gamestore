package gamestore_backend.modules.catalog;

import static gamestore_backend.modules.catalog.CatalogDtos.*;
import java.util.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import gamestore_backend.modules.commerce.CommerceException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class CatalogService {
    private final CatalogRepository repository;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;
    public CatalogService(CatalogRepository repository, org.springframework.jdbc.core.JdbcTemplate jdbc) { this.repository = repository; this.jdbc = jdbc; }
    private static CommerceException error(HttpStatus status, String message) { return new CommerceException(status, message); }
    public Actor actor(String username) {
        Actor actor = repository.actor(username).orElseThrow(() -> error(HttpStatus.FORBIDDEN, "Tài khoản chưa được xác minh hoặc đã bị khóa."));
        if (!actor.admin() && !"DEVELOPER".equals(actor.role())) throw error(HttpStatus.FORBIDDEN, "Chức năng dành cho quản trị viên và nhà phát triển.");
        return actor;
    }
    private Actor admin(String username) {
        Actor actor = actor(username);
        if (!actor.admin()) throw error(HttpStatus.FORBIDDEN, "Chỉ quản trị viên được thực hiện thao tác này.");
        return actor;
    }
    private Game owned(Actor actor, UUID id, boolean lock) {
        Game game = repository.game(id, lock).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "Không tìm thấy trò chơi."));
        if (!actor.admin() && !game.developer_id().equals(actor.id())) throw error(HttpStatus.FORBIDDEN, "Bạn chỉ được quản lý trò chơi của chính mình.");
        return game;
    }
    public Management management(String username) {
        Actor actor = actor(username);
        return new Management(repository.games(actor), repository.genres(), actor.admin() ? repository.developers() : List.of());
    }
    public Game get(String username, UUID id) { return owned(actor(username), id, false); }
    private static String text(String value, int max, boolean required, String field) {
        String result = value == null ? "" : value.strip();
        if ((required && result.isBlank()) || result.length() > max) throw error(HttpStatus.BAD_REQUEST, field + " không hợp lệ (tối đa " + max + " ký tự).");
        return result;
    }
    private static String image(String value) {
        String result = text(value, 2048, false, "URL ảnh");
        if (result.isEmpty()) return null;
        try {
            URI uri = URI.create(result);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null) throw new IllegalArgumentException();
        } catch (IllegalArgumentException invalid) { throw error(HttpStatus.BAD_REQUEST, "Ảnh phải là URL HTTPS hợp lệ."); }
        return result;
    }
    private void genres(List<UUID> ids) {
        if (ids == null || ids.isEmpty() || ids.size() > 100 || ids.contains(null) || new HashSet<>(ids).size() != ids.size())
            throw error(HttpStatus.BAD_REQUEST, "Trò chơi phải có ít nhất 1 thể loại, không lặp và tối đa 100 thể loại.");
        Set<UUID> existing = new HashSet<>(repository.genres().stream().map(Genre::id).toList());
        if (!existing.containsAll(ids)) throw error(HttpStatus.BAD_REQUEST, "Có thể loại không còn tồn tại. Vui lòng chọn lại.");
    }
    private void hasGenres(UUID game) {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM game_genres WHERE game_id=?)", Boolean.class, game)))
            throw error(HttpStatus.CONFLICT, "Trò chơi cần ít nhất 1 thể loại trước khi đăng tải hoặc phát hành.");
    }
    private static String status(String value) {
        if (!Set.of("HIDDEN", "AVAILABLE").contains(value == null ? "" : value)) throw error(HttpStatus.BAD_REQUEST, "Trạng thái trò chơi không hợp lệ.");
        return value;
    }
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Game save(String username, UUID id, Input input) {
        Actor actor = actor(username); repository.lock();
        Game existing = id == null ? null : owned(actor, id, true);
        String title = text(input.title(), 200, true, "Tên trò chơi");
        String description = text(input.description(), 10000, false, "Mô tả");
        String version = text(input.version(), 100, false, "Phiên bản");
        String cover = image(input.cover_image_url());
        BigDecimal price = input.price();
        if (price == null || price.signum() < 0 || price.compareTo(new BigDecimal("99999999999999999.99")) > 0)
            throw error(HttpStatus.BAD_REQUEST, "Giá trò chơi không hợp lệ.");
        try { price = price.setScale(2, RoundingMode.UNNECESSARY); }
        catch (ArithmeticException invalid) { throw error(HttpStatus.BAD_REQUEST, "Giá có tối đa 2 chữ số thập phân."); }
        genres(input.genre_ids());
        if (!actor.admin() && input.status() != null && !"HIDDEN".equals(input.status()))
            throw error(HttpStatus.FORBIDDEN, "Developer không được tự phát hành trò chơi qua thao tác sửa hoặc tạo.");
        UUID owner = existing == null ? (actor.admin() && input.developer_id() != null ? input.developer_id() : actor.id()) : existing.developer_id();
        if (!actor.admin() && input.developer_id() != null && !input.developer_id().equals(actor.id()))
            throw error(HttpStatus.FORBIDDEN, "Không được tạo hoặc chuyển trò chơi cho người khác.");
        if (existing != null && input.developer_id() != null && !input.developer_id().equals(existing.developer_id()))
            throw error(HttpStatus.BAD_REQUEST, "Không thể thay đổi chủ sở hữu trò chơi.");
        if (existing == null && !repository.developers().stream().anyMatch(d -> d.id().equals(owner)))
            throw error(HttpStatus.BAD_REQUEST, "Chủ sở hữu phải là developer hoặc quản trị viên đã xác minh.");
        boolean changed = existing == null || !Objects.equals(existing.title(), title) || !Objects.equals(existing.description(), description)
            || new BigDecimal(existing.price()).compareTo(price) != 0 || !Objects.equals(existing.cover_image_url(), cover)
            || !Objects.equals(existing.version(), version) || !new HashSet<>(existing.genre_ids()).equals(new HashSet<>(input.genre_ids()));
        String nextStatus = actor.admin() ? status(input.status() == null ? (existing == null ? "HIDDEN" : existing.status()) : input.status())
            : (changed ? "HIDDEN" : existing.status());
        if (existing == null) {
            id = jdbc.queryForObject("INSERT INTO games(developer_id,title,description,price,cover_image_url,version,status) VALUES (?,?,?,?,?,?,?) RETURNING id",
                UUID.class, owner, title, description, price, cover, version, nextStatus);
        } else {
            jdbc.update("UPDATE games SET title=?,description=?,price=?,cover_image_url=?,version=?,status=? WHERE id=?",
                title, description, price, cover, version, nextStatus, id);
        }
        jdbc.update("DELETE FROM game_genres WHERE game_id=?", id);
        for (UUID genre : input.genre_ids()) jdbc.update("INSERT INTO game_genres(game_id,genre_id) VALUES (?,?)", id, genre);
        if (existing != null && changed) CatalogApprovalRules.invalidateAfterEdit(jdbc, id);
        return repository.game(id, false).orElseThrow();
    }
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Game visibility(String username, UUID id, String value) {
        Actor actor = actor(username); repository.lock();
        Game game = owned(actor, id, true);
        String next = status(value);
        if ("AVAILABLE".equals(next)) {
            hasGenres(id);
            if (!actor.admin() && !game.can_enable()) throw error(HttpStatus.CONFLICT, "Trò chơi chưa được duyệt hoặc đã bị chỉnh sửa. Vui lòng gửi đơn đăng tải.");
        }
        jdbc.update("UPDATE games SET status=? WHERE id=?", next, id);
        return repository.game(id, false).orElseThrow();
    }
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void permanent(String username, UUID id) {
        Actor actor = admin(username); repository.lock(); owned(actor, id, true);
        boolean protectedHistory = Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM transactions WHERE game_id=?) OR EXISTS(SELECT 1 FROM game_bought WHERE game_id=?) OR EXISTS(SELECT 1 FROM reviews WHERE game_id=?)", Boolean.class, id, id, id));
        if (protectedHistory) throw error(HttpStatus.CONFLICT, "Trò chơi có lịch sử giao dịch hoặc quyền sở hữu. Hãy ẩn trò chơi để giữ lịch sử.");
        jdbc.update("DELETE FROM wishlists WHERE game_id=?", id);
        jdbc.update("DELETE FROM game_genres WHERE game_id=?", id);
        jdbc.update("DELETE FROM game_submissions WHERE game_id=?", id);
        jdbc.update("DELETE FROM games WHERE id=?", id);
    }
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Submission submit(String username, UUID id) {
        Actor actor = actor(username); repository.lock(); Game game = owned(actor, id, true); hasGenres(id);
        if (game.has_pending_submission()) throw error(HttpStatus.CONFLICT, "Trò chơi đã có đơn chờ duyệt.");
        if (game.can_enable() || "AVAILABLE".equals(game.status())) throw error(HttpStatus.CONFLICT, "Trò chơi đã được phát hành hoặc duyệt. Có thể bật lại mà không cần gửi đơn.");
        UUID submission = jdbc.queryForObject("INSERT INTO game_submissions(game_id,submitted_by) VALUES (?,?) RETURNING id", UUID.class, id, actor.id());
        return repository.submission(submission).orElseThrow();
    }
    public SubmissionPage submissions(String username, String state, String query, int page, int size) {
        admin(username);
        if (state != null && !Set.of("PENDING", "ACCEPTED", "REJECTED").contains(state)) throw error(HttpStatus.BAD_REQUEST, "Bộ lọc đơn không hợp lệ.");
        if (page < 0 || size < 1 || size > 100) throw error(HttpStatus.BAD_REQUEST, "Phân trang không hợp lệ.");
        return repository.submissions(state, text(query, 200, false, "Tìm kiếm"), page, size);
    }
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Submission review(String username, UUID id, ReviewInput input) {
        Actor actor = admin(username); repository.lock();
        Submission submission = repository.submission(id).orElseThrow(() -> error(HttpStatus.NOT_FOUND, "Không tìm thấy đơn đăng tải."));
        Game game = owned(actor, submission.game_id(), true);
        if (!"PENDING".equals(submission.status())) throw error(HttpStatus.CONFLICT, "Đơn đã được xử lý.");
        if (input.status() == null || !Set.of("ACCEPTED", "REJECTED").contains(input.status())) throw error(HttpStatus.BAD_REQUEST, "Quyết định duyệt không hợp lệ.");
        String reason = text(input.reason(), 2000, true, "Lý do duyệt hoặc từ chối");
        if ("ACCEPTED".equals(input.status())) hasGenres(game.id());
        jdbc.update("UPDATE game_submissions SET status=?,reason=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?", input.status(), reason, actor.id(), id);
        jdbc.update("UPDATE games SET status=? WHERE id=?", "ACCEPTED".equals(input.status()) ? "AVAILABLE" : "HIDDEN", game.id());
        return repository.submission(id).orElseThrow();
    }
}
