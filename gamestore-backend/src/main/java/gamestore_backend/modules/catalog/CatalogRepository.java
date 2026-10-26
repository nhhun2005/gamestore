package gamestore_backend.modules.catalog;

import static gamestore_backend.modules.catalog.CatalogDtos.*;
import java.util.*;
import java.time.OffsetDateTime;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class CatalogRepository {
    private final JdbcTemplate jdbc;
    public CatalogRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    private static final String SUBMISSIONS = """
        SELECT s.*,g.title AS game_title,u.username AS submitter_name,r.username AS reviewer_name
        FROM game_submissions s JOIN games g ON g.id=s.game_id JOIN users u ON u.id=s.submitted_by
        LEFT JOIN users r ON r.id=s.reviewed_by
        """;
    private static final RowMapper<Submission> SUBMISSION = (r,n) -> new Submission(r.getObject("id", UUID.class),
        r.getObject("game_id", UUID.class), r.getString("game_title"), r.getObject("submitted_by", UUID.class), r.getString("submitter_name"),
        r.getObject("reviewed_by", UUID.class), r.getString("reviewer_name"), r.getString("status"), r.getString("reason"),
        r.getObject("created_at", OffsetDateTime.class), r.getObject("reviewed_at", OffsetDateTime.class));

    public Optional<Actor> actor(String username) {
        return jdbc.query("SELECT id,username,role FROM users WHERE lower(username)=lower(?) AND status='VERIFIED'", (r,n) ->
            new Actor(r.getObject("id", UUID.class), r.getString("username"), r.getString("role")), username).stream().findFirst();
    }
    public void lock() { jdbc.query("SELECT pg_advisory_xact_lock(hashtext('gamestore.genre-management'))", r -> {}); }
    public Optional<Game> game(UUID id, boolean lock) {
        if (lock) jdbc.query("SELECT id FROM games WHERE id=? FOR UPDATE", (org.springframework.jdbc.core.RowCallbackHandler) r -> {}, id);
        return games(" WHERE g.id=?", id).stream().findFirst();
    }
    public List<Game> games(Actor actor) { return games(actor.admin() ? "" : " WHERE g.developer_id=?", actor.admin() ? new Object[0] : new Object[]{actor.id()}); }
    private List<Game> games(String where, Object... args) {
        Map<UUID, List<UUID>> links = new HashMap<>();
        jdbc.query("SELECT gg.game_id,gg.genre_id FROM game_genres gg JOIN games g ON g.id=gg.game_id" + where,
            (org.springframework.jdbc.core.RowCallbackHandler) r -> links.computeIfAbsent(r.getObject("game_id", UUID.class), key -> new ArrayList<>()).add(r.getObject("genre_id", UUID.class)), args);
        Map<UUID, List<Submission>> history = new HashMap<>();
        jdbc.query(SUBMISSIONS + where + " ORDER BY s.created_at DESC,s.id DESC", SUBMISSION, args)
            .forEach(s -> history.computeIfAbsent(s.game_id(), key -> new ArrayList<>()).add(s));
        return jdbc.query("SELECT g.*,u.username AS developer_name FROM games g JOIN users u ON u.id=g.developer_id" + where + " ORDER BY g.uploaded_at DESC,g.id", (r,n) -> {
            UUID id = r.getObject("id", UUID.class);
            List<Submission> submissions = history.getOrDefault(id, List.of());
            return new Game(id, r.getObject("developer_id", UUID.class), r.getString("developer_name"), r.getString("title"), r.getString("description"),
                r.getBigDecimal("price").setScale(2).toPlainString(), r.getString("cover_image_url"), r.getString("version"), r.getString("status"),
                r.getObject("uploaded_at", OffsetDateTime.class), links.getOrDefault(id, List.of()),
                submissions.stream().anyMatch(s -> "ACCEPTED".equals(s.status())),
                submissions.stream().anyMatch(s -> "PENDING".equals(s.status())), submissions);
        }, args);
    }
    public List<Genre> genres() { return jdbc.query("SELECT id,name,description FROM genres ORDER BY lower(name),id", (r,n) -> new Genre(r.getObject("id", UUID.class), r.getString("name"), r.getString("description"))); }
    public List<Developer> developers() { return jdbc.query("SELECT id,username FROM users WHERE role IN ('DEVELOPER','ADMINISTRATOR') AND status='VERIFIED' ORDER BY lower(username),id", (r,n) -> new Developer(r.getObject("id", UUID.class), r.getString("username"))); }
    public Optional<Submission> submission(UUID id) { return jdbc.query(SUBMISSIONS + " WHERE s.id=?", SUBMISSION, id).stream().findFirst(); }
    public SubmissionPage submissions(String status, String query, int page, int size) {
        String where = " WHERE (?::text IS NULL OR s.status=?) AND (strpos(lower(g.title),lower(?))>0 OR strpos(lower(u.username),lower(?))>0)";
        long total = Objects.requireNonNull(jdbc.queryForObject("SELECT count(*) FROM (" + SUBMISSIONS + where + ") queue", Long.class, status, status, query, query));
        List<Submission> rows = jdbc.query(SUBMISSIONS + where + " ORDER BY s.created_at DESC,s.id DESC LIMIT ? OFFSET ?", SUBMISSION, status, status, query, query, size, (long) page * size);
        return new SubmissionPage(rows, total, page, size);
    }
}
