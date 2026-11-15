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
    public PublicationQuote publicationQuote(Game game, Actor actor) {
        boolean paid=Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM public.game_publication_fees WHERE game_id=?)",Boolean.class,game.id()));
        boolean required=new java.math.BigDecimal(game.price()).signum()==0 && !paid;
        String balance=jdbc.queryForObject("SELECT balance FROM public.users WHERE id=?",java.math.BigDecimal.class,actor.id()).setScale(2).toPlainString();
        return new PublicationQuote(game.id(),required,required?"1300000.00":"0.00",required?"50.00":"0.00",balance,paid);
    }
    private static final String SUBMISSIONS = """
        SELECT s.id,s.game_id,s.game_title,s.submitted_by,s.submitter_name,s.reviewed_by,
               s.reviewer_name,s.status,s.reason,s.created_at,s.reviewed_at
        FROM public.v_game_submission_details s JOIN public.v_catalog_games g ON g.id=s.game_id
        """;
    private static final RowMapper<Submission> SUBMISSION = (r,n) -> new Submission(r.getObject("id", UUID.class),
        r.getObject("game_id", UUID.class), r.getString("game_title"), r.getObject("submitted_by", UUID.class), r.getString("submitter_name"),
        r.getObject("reviewed_by", UUID.class), r.getString("reviewer_name"), r.getString("status"), r.getString("reason"),
        r.getObject("created_at", OffsetDateTime.class), r.getObject("reviewed_at", OffsetDateTime.class));

    public Optional<Actor> actor(String username) {
        return jdbc.query("SELECT id,username,role FROM public.v_actor_accounts WHERE lower(username)=lower(?) AND status='VERIFIED'", (r,n) ->
            new Actor(r.getObject("id", UUID.class), r.getString("username"), r.getString("role")), username).stream().findFirst();
    }
    public Optional<Game> game(UUID id, boolean lock) {
        return games(" WHERE g.id=?", id).stream().findFirst();
    }
    public List<Game> games(Actor actor) { return games(actor.admin() ? "" : " WHERE g.developer_id=?", actor.admin() ? new Object[0] : new Object[]{actor.id()}); }
    private List<Game> games(String where, Object... args) {
        Map<UUID, List<UUID>> links = new HashMap<>();
        jdbc.query("SELECT gg.game_id,gg.genre_id FROM public.v_game_genres gg JOIN public.v_catalog_games g ON g.id=gg.game_id" + where,
            (org.springframework.jdbc.core.RowCallbackHandler) r -> links.computeIfAbsent(r.getObject("game_id", UUID.class), key -> new ArrayList<>()).add(r.getObject("genre_id", UUID.class)), args);
        Map<UUID, List<Submission>> history = new HashMap<>();
        jdbc.query(SUBMISSIONS + where + " ORDER BY s.created_at DESC,s.id DESC", SUBMISSION, args)
            .forEach(s -> history.computeIfAbsent(s.game_id(), key -> new ArrayList<>()).add(s));
        return jdbc.query("SELECT g.id,g.developer_id,g.developer_name,g.title,g.description,g.price,g.cover_image_url,g.version,g.status,g.uploaded_at,g.can_enable,g.has_pending_submission FROM public.v_catalog_games g" + where + " ORDER BY g.uploaded_at DESC,g.id", (r,n) -> {
            UUID id = r.getObject("id", UUID.class);
            List<Submission> submissions = history.getOrDefault(id, List.of());
            return new Game(id, r.getObject("developer_id", UUID.class), r.getString("developer_name"), r.getString("title"), r.getString("description"),
                r.getBigDecimal("price").setScale(2).toPlainString(), r.getString("cover_image_url"), r.getString("version"), r.getString("status"),
                r.getObject("uploaded_at", OffsetDateTime.class), links.getOrDefault(id, List.of()),
                r.getBoolean("can_enable"),r.getBoolean("has_pending_submission"),submissions);
        }, args);
    }
    public List<Genre> genres() { return jdbc.query("SELECT id,name,description FROM public.v_genre_summary ORDER BY lower(btrim(name)),id", (r,n) -> new Genre(r.getObject("id", UUID.class), r.getString("name"), r.getString("description"))); }
    public List<Developer> developers() { return jdbc.query("SELECT id,username FROM public.v_catalog_developers ORDER BY lower(username),id", (r,n) -> new Developer(r.getObject("id", UUID.class), r.getString("username"))); }
    public Optional<Submission> submission(UUID id) { return jdbc.query(SUBMISSIONS + " WHERE s.id=?", SUBMISSION, id).stream().findFirst(); }
    public SubmissionPage submissions(String status, String query, int page, int size) {
        String where = " WHERE (?::text IS NULL OR s.status=?) AND (strpos(lower(s.game_title),lower(?))>0 OR strpos(lower(s.submitter_name),lower(?))>0)";
        long total = Objects.requireNonNull(jdbc.queryForObject("SELECT count(*) FROM (" + SUBMISSIONS + where + ") queue", Long.class, status, status, query, query));
        List<Submission> rows = jdbc.query(SUBMISSIONS + where + " ORDER BY s.created_at DESC,s.id DESC LIMIT ? OFFSET ?", SUBMISSION, status, status, query, query, size, (long) page * size);
        return new SubmissionPage(rows, total, page, size);
    }
}
