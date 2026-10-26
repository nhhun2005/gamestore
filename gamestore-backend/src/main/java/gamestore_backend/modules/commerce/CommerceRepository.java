package gamestore_backend.modules.commerce;

import static gamestore_backend.modules.commerce.CommerceDtos.*;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class CommerceRepository {
    private final JdbcTemplate jdbc;
    public CommerceRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    static String amount(BigDecimal value) { return value.setScale(2).toPlainString(); }
    private static final RowMapper<Account> ACCOUNT = (r, n) -> new Account(r.getObject("id", UUID.class),
        r.getString("username"), r.getString("email"), r.getString("role"), r.getString("status"), r.getBigDecimal("balance"));
    private static final RowMapper<Game> GAME = (r, n) -> new Game(r.getObject("id", UUID.class),
        r.getObject("developer_id", UUID.class), r.getString("title"), r.getString("description"), amount(r.getBigDecimal("price")),
        r.getString("cover_image_url"), r.getString("status"), r.getObject("promotion_id", UUID.class), r.getBigDecimal("rating"), r.getString("genre"));
    private static final RowMapper<Transaction> TRANSACTION = (r, n) -> new Transaction(r.getObject("id", UUID.class),
        r.getObject("user_id", UUID.class), r.getObject("game_id", UUID.class), r.getString("type"), amount(r.getBigDecimal("amount")),
        r.getString("status"), r.getObject("created_at", OffsetDateTime.class).toInstant().toString(), r.getObject("idempotency_key", UUID.class));
    private static final RowMapper<Review> REVIEW = (r, n) -> new Review(r.getObject("id", UUID.class),
        r.getObject("user_id", UUID.class), r.getObject("game_id", UUID.class), r.getBigDecimal("rating"), r.getString("content"));
    private static final String GAME_SELECT = """
        SELECT g.*, COALESCE((SELECT string_agg(ge.name, ', ' ORDER BY ge.name)
            FROM game_genres gg JOIN genres ge ON ge.id=gg.genre_id WHERE gg.game_id=g.id), 'Trò chơi') AS genre
        FROM games g
        """;
    private static final String VISIBLE = """
        (g.status='AVAILABLE' OR ? OR g.developer_id=? OR EXISTS
        (SELECT 1 FROM game_bought b WHERE b.game_id=g.id AND b.user_id=?))
        """;
    public Optional<Account> account(String username, boolean lock) {
        return jdbc.query("SELECT id,username,email,role,status,balance FROM users WHERE lower(username)=lower(?)" +
            (lock ? " FOR UPDATE" : ""), ACCOUNT, username).stream().findFirst();
    }
    public List<Game> games(Account user) {
        return jdbc.query(GAME_SELECT + " WHERE " + VISIBLE + " ORDER BY g.title,g.id", GAME,
            user.role().equals("ADMINISTRATOR"), user.id(), user.id());
    }
    public Optional<Game> game(UUID id, boolean lock) {
        return jdbc.query(GAME_SELECT + " WHERE g.id=?" + (lock ? " FOR UPDATE OF g" : ""), GAME, id).stream().findFirst();
    }
    public List<Promotion> promotions() {
        return jdbc.query("SELECT id,name,discount,status FROM promotions ORDER BY id", (r, n) ->
            new Promotion(r.getObject("id", UUID.class), r.getString("name"), r.getBigDecimal("discount").toPlainString(), r.getString("status")));
    }
    public Optional<Promotion> promotion(UUID id) {
        return jdbc.query("SELECT id,name,discount,status FROM promotions WHERE id=? FOR SHARE", (r, n) ->
            new Promotion(r.getObject("id", UUID.class), r.getString("name"), r.getBigDecimal("discount").toPlainString(), r.getString("status")), id).stream().findFirst();
    }
    public List<UserSummary> publicUsers(Account account) {
        // No other user's wallet, email, password or private transactions leave this query.
        return jdbc.query("SELECT id,username,role FROM users WHERE id=? OR role='DEVELOPER' OR EXISTS (SELECT 1 FROM reviews r WHERE r.user_id=users.id) ORDER BY username,id",
            (r,n) -> new UserSummary(r.getObject("id", UUID.class), r.getString("username"), r.getString("role")), account.id());
    }
    public List<Ownership> ownerships(UUID user) {
        return jdbc.query("SELECT user_id,game_id,transaction_id FROM game_bought WHERE user_id=?", (r,n) ->
            new Ownership(r.getObject("user_id", UUID.class),r.getObject("game_id", UUID.class),r.getObject("transaction_id", UUID.class)), user);
    }
    public boolean owns(UUID user, UUID game) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM game_bought WHERE user_id=? AND game_id=?)", Boolean.class, user, game));
    }
    public List<Transaction> transactions(UUID user) {
        return jdbc.query("SELECT * FROM transactions WHERE user_id=? ORDER BY created_at DESC,id DESC", TRANSACTION, user);
    }
    public TransactionPage transactionPage(UUID user, String type, String status, int page, int size, String sort) {
        String where = " WHERE user_id=?";
        List<Object> args = new ArrayList<>(); args.add(user);
        if (type != null) { where += " AND type=?"; args.add(type); }
        if (status != null) { where += " AND status=?"; args.add(status); }
        long total = Objects.requireNonNull(jdbc.queryForObject("SELECT count(*) FROM transactions" + where, Long.class, args.toArray()));
        String order = switch (sort) { case "oldest" -> "created_at ASC,id ASC"; case "amount" -> "amount DESC,created_at DESC,id DESC"; default -> "created_at DESC,id DESC"; };
        args.add(size); args.add((long)page * size);
        return new TransactionPage(jdbc.query("SELECT * FROM transactions" + where + " ORDER BY " + order + " LIMIT ? OFFSET ?", TRANSACTION, args.toArray()), total, page, size);
    }
    public Optional<Transaction> byRequest(UUID user, UUID key) {
        return jdbc.query("SELECT * FROM transactions WHERE user_id=? AND idempotency_key=?", TRANSACTION, user, key).stream().findFirst();
    }
    public Transaction record(UUID user, UUID game, String type, BigDecimal amount, UUID key) {
        return jdbc.queryForObject("INSERT INTO transactions(user_id,game_id,type,amount,status,idempotency_key) VALUES (?,?,?,?,'SUCCESSED',?) RETURNING *",
            TRANSACTION, user, game, type, amount, key);
    }
    public void balance(UUID user, BigDecimal amount) { jdbc.update("UPDATE users SET balance=? WHERE id=?", amount, user); }
    public List<Review> reviews(Account user) {
        return jdbc.query("SELECT r.* FROM reviews r JOIN games g ON g.id=r.game_id WHERE " + VISIBLE + " ORDER BY r.id", REVIEW,
            user.role().equals("ADMINISTRATOR"), user.id(), user.id());
    }
    public Review saveReview(UUID user, UUID game, BigDecimal rating, String content) {
        return jdbc.queryForObject("INSERT INTO reviews(user_id,game_id,rating,content) VALUES (?,?,?,?) ON CONFLICT(user_id,game_id) DO UPDATE SET rating=EXCLUDED.rating,content=EXCLUDED.content RETURNING *",
            REVIEW, user, game, rating, content);
    }
    public Optional<Review> review(UUID id, UUID user) {
        return jdbc.query("SELECT * FROM reviews WHERE id=? AND user_id=?", REVIEW, id, user).stream().findFirst();
    }
    public void deleteReview(UUID id, UUID user) { jdbc.update("DELETE FROM reviews WHERE id=? AND user_id=?", id, user); }
    public List<Transaction> revenue(Account user, OffsetDateTime from, OffsetDateTime until) {
        String sql = "SELECT t.* FROM transactions t JOIN games g ON g.id=t.game_id WHERE t.type='BUY' AND t.status='SUCCESSED'";
        List<Object> args = new ArrayList<>();
        if (!user.role().equals("ADMINISTRATOR")) { sql += " AND g.developer_id=?"; args.add(user.id()); }
        if (from != null) { sql += " AND t.created_at>=?"; args.add(from); }
        if (until != null) { sql += " AND t.created_at<?"; args.add(until); }
        return jdbc.query(sql + " ORDER BY t.created_at,t.id", TRANSACTION, args.toArray());
    }
}
