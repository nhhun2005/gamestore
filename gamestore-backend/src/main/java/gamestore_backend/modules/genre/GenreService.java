package gamestore_backend.modules.genre;

import static gamestore_backend.modules.genre.GenreController.*;
import java.util.*;
import gamestore_backend.modules.commerce.CommerceException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class GenreService {
    private final JdbcTemplate jdbc;
    public GenreService(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    private static final String SELECT = "SELECT g.*, (SELECT count(*) FROM game_genres gg WHERE gg.genre_id=g.id) AS game_count FROM genres g";
    private static final RowMapper<Genre> ROW = (r, n) -> new Genre(r.getObject("id", UUID.class), r.getString("name"), r.getString("description"), r.getLong("game_count"));
    private void admin(String username) {
        boolean allowed = Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM users WHERE lower(username)=lower(?) AND role='ADMINISTRATOR' AND status='VERIFIED')", Boolean.class, username));
        if (!allowed) throw new CommerceException(HttpStatus.FORBIDDEN, "Chỉ quản trị viên có tài khoản đã xác minh được quản lý thể loại.");
    }
    // Serialize catalog mutations so duplicate checks and delete/attach decisions are atomic.
    private void lock() { jdbc.query("SELECT pg_advisory_xact_lock(hashtext('gamestore.genre-management'))", r -> {}); }
    private Genre find(UUID id) {
        return jdbc.query(SELECT + " WHERE g.id=?", ROW, id).stream().findFirst()
            .orElseThrow(() -> new CommerceException(HttpStatus.NOT_FOUND, "Không tìm thấy thể loại."));
    }
    public List<Genre> list(String user) { admin(user); return jdbc.query(SELECT + " ORDER BY lower(g.name),g.id", ROW); }
    public Genre get(String user, UUID id) { admin(user); return find(id); }
    public List<Game> games(String user) {
        admin(user);
        Map<UUID, List<UUID>> links = new HashMap<>();
        jdbc.query("SELECT game_id,genre_id FROM game_genres ORDER BY genre_id", (org.springframework.jdbc.core.RowCallbackHandler) r ->
            links.computeIfAbsent(r.getObject("game_id", UUID.class), key -> new ArrayList<>()).add(r.getObject("genre_id", UUID.class)));
        return jdbc.query("SELECT id,title,status FROM games ORDER BY lower(title),id", (r,n) ->
            new Game(r.getObject("id", UUID.class), r.getString("title"), r.getString("status"), links.getOrDefault(r.getObject("id", UUID.class), List.of())));
    }
    @Transactional
    public Genre save(String user, UUID id, Input input) {
        admin(user); lock();
        if (id != null) find(id);
        String name = input.name() == null ? "" : input.name().strip();
        String description = input.description() == null ? null : input.description().strip();
        if (name.isBlank() || name.length() > 100 || (description != null && description.length() > 2000))
            throw new CommerceException(HttpStatus.BAD_REQUEST, "Tên thể loại phải có từ 1 đến 100 ký tự; mô tả tối đa 2000 ký tự.");
        boolean duplicate = Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM genres WHERE lower(btrim(name))=lower(?) AND (?::uuid IS NULL OR id<>?))", Boolean.class, name, id, id));
        if (duplicate) throw new CommerceException(HttpStatus.CONFLICT, "Tên thể loại đã tồn tại.");
        if (id == null) id = jdbc.queryForObject("INSERT INTO genres(name,description) VALUES (?,?) RETURNING id", UUID.class, name, description);
        else jdbc.update("UPDATE genres SET name=?,description=? WHERE id=?", name, description, id);
        return find(id);
    }
    @Transactional
    public void delete(String user, UUID id) {
        admin(user); lock();
        if (find(id).game_count() > 0) throw new CommerceException(HttpStatus.CONFLICT, "Thể loại đang được sử dụng. Hãy gỡ khỏi các trò chơi trước khi xóa.");
        jdbc.update("DELETE FROM genres WHERE id=?", id);
    }
    @Transactional
    public void link(String user, UUID id, UUID game, boolean attach) {
        admin(user); lock(); find(id);
        if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM games WHERE id=?)", Boolean.class, game)))
            throw new CommerceException(HttpStatus.NOT_FOUND, "Không tìm thấy trò chơi.");
        if (attach) jdbc.update("INSERT INTO game_genres(game_id,genre_id) VALUES (?,?) ON CONFLICT DO NOTHING", game, id);
        else jdbc.update("DELETE FROM game_genres WHERE game_id=? AND genre_id=?", game, id);
    }
}
