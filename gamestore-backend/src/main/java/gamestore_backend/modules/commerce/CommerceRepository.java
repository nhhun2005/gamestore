package gamestore_backend.modules.commerce;

import static gamestore_backend.modules.commerce.CommerceDtos.*;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class CommerceRepository {
    private final JdbcTemplate jdbc;
    public CommerceRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public UUID createCheckout(UUID user,UUID game,UUID key,BigDecimal expected) {
        return procedure(()->jdbc.queryForObject("CALL public.sp_create_checkout(?,?,?,?,NULL)",(r,n)->r.getObject("p_id",UUID.class),user,game,key,expected));
    }
    public UUID createTopUpCheckout(UUID user,UUID key,BigDecimal amount) {
        return procedure(()->jdbc.queryForObject("CALL public.sp_create_topup_checkout(?,?,?,NULL)",(r,n)->r.getObject("p_id",UUID.class),user,key,amount));
    }
    public boolean isTopUpCheckout(UUID user,UUID id) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM public.checkout_sessions WHERE user_id=? AND id=? AND purpose='TOPUP')",Boolean.class,user,id));
    }
    public void resolveCheckout(UUID user,UUID id,String action,String method,String bank,String card,UUID qr) {
        procedure(()->jdbc.update("CALL public.sp_resolve_checkout(?,?,?,?,?,?,?)",user,id,action,method,bank,card,qr));
    }
    public Checkout checkout(UUID user,UUID id) {
        return jdbc.queryForObject("SELECT * FROM public.checkout_sessions WHERE user_id=? AND id=?",(r,n)->new Checkout(
            r.getObject("id",UUID.class),r.getObject("game_id",UUID.class),r.getObject("transaction_id",UUID.class),r.getString("game_title"),amount(r.getBigDecimal("amount")),
            r.getString("status"),r.getString("method"),r.getString("bank"),r.getString("card_last4"),r.getString("reason"),
            r.getObject("created_at",OffsetDateTime.class).toInstant().toString(),r.getObject("expires_at",OffsetDateTime.class).toInstant().toString(),
            r.getObject("settled_at",OffsetDateTime.class)==null?null:r.getObject("settled_at",OffsetDateTime.class).toInstant().toString(),
            "PENDING".equals(r.getString("status"))?"gamestore-pay://checkout/"+id+"?code="+r.getObject("qr_token",UUID.class):null,r.getString("purpose")),user,id);
    }
    public void expireCheckouts(UUID user) {
        // Caller holds this user's row lock for the entire snapshot transaction.
        jdbc.query("SELECT public.expire_checkout_sessions(?,NULL)",(org.springframework.jdbc.core.RowCallbackHandler) r -> {},user);
    }
    public List<CheckoutSummary> checkoutSummaries(UUID user) {
        return jdbc.query("SELECT id,game_id,transaction_id,game_title,amount,status,expires_at,purpose FROM public.checkout_sessions WHERE user_id=? ORDER BY created_at DESC",
            (r,n)->new CheckoutSummary(r.getObject("id",UUID.class),r.getObject("game_id",UUID.class),r.getObject("transaction_id",UUID.class),r.getString("game_title"),
                amount(r.getBigDecimal("amount")),r.getString("status"),r.getObject("expires_at",OffsetDateTime.class).toInstant().toString(),r.getString("purpose")),user);
    }
    private <T> T procedure(Supplier<T> operation) {
        try { return operation.get(); }
        catch (DataAccessException failure) {
            for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
                if (cause instanceof java.sql.SQLException sql && sql.getSQLState() != null && Set.of("GS400","GS401","GS402","GS403","GS404","GS409").contains(sql.getSQLState())) {
                    String message = sql.getMessage().split("\\R", 2)[0].replaceFirst("^ERROR:\\s*", "");
                    throw new CommerceException(HttpStatus.valueOf(Integer.parseInt(sql.getSQLState().substring(2))), message);
                }
            }
            throw failure;
        }
    }
    static String amount(BigDecimal value) { return value.setScale(2).toPlainString(); }
    private static final RowMapper<Account> ACCOUNT = (r, n) -> new Account(r.getObject("id", UUID.class),
        r.getString("username"), r.getString("email"), r.getString("role"), r.getString("status"), r.getBigDecimal("balance"));
    private static final RowMapper<Game> GAME = (r, n) -> new Game(r.getObject("id", UUID.class),
        r.getObject("developer_id", UUID.class), r.getString("title"), r.getString("description"), amount(r.getBigDecimal("price")),
        r.getString("cover_image_url"), r.getString("status"), r.getObject("promotion_id", UUID.class), r.getBigDecimal("rating"), r.getString("genre"));
    private static final RowMapper<Transaction> TRANSACTION = (r, n) -> new Transaction(r.getObject("id", UUID.class),
        r.getObject("user_id", UUID.class), r.getObject("game_id", UUID.class), r.getString("type"), amount(r.getBigDecimal("amount")),
        r.getString("status"), r.getObject("created_at", OffsetDateTime.class).toInstant().toString(), r.getObject("idempotency_key", UUID.class), r.getObject("source_purchase_id", UUID.class), r.getString("income_kind"));
    private static final RowMapper<Review> REVIEW = (r, n) -> new Review(r.getObject("id", UUID.class),
        r.getObject("user_id", UUID.class), r.getObject("game_id", UUID.class), r.getBigDecimal("rating"), r.getString("content"));
    private static final RowMapper<WishlistEntry> WISHLIST_ENTRY = (r, n) -> {
        OffsetDateTime created = r.getObject("created_at", OffsetDateTime.class);
        return new WishlistEntry(
            r.getObject("game_id", UUID.class),
            created != null ? created.toInstant().toString() : Instant.now().toString()
        );
    };
    private static final RowMapper<NotificationItem> NOTIFICATION_ITEM = (r, n) -> {
        OffsetDateTime created = r.getObject("created_at", OffsetDateTime.class);
        OffsetDateTime read = r.getObject("read_at", OffsetDateTime.class);
        BigDecimal discount = r.getBigDecimal("discount");
        return new NotificationItem(
            r.getObject("id", UUID.class),
            r.getObject("game_id", UUID.class),
            r.getObject("promotion_id", UUID.class),
            r.getString("type"),
            r.getString("title"),
            r.getString("message"),
            discount != null ? discount.stripTrailingZeros().toPlainString() : null,
            created != null ? created.toInstant().toString() : null,
            read != null ? read.toInstant().toString() : null,
            read != null
        );
    };

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
        if (lock) jdbc.query("SELECT pg_advisory_xact_lock(726491830021)", (org.springframework.jdbc.core.RowCallbackHandler) row -> {});
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
    public LibraryData library(UUID user) {
        return new LibraryData(
            jdbc.query("SELECT id,name FROM library_collections WHERE user_id=? ORDER BY lower(name),id",
                (r,n) -> new LibraryCollection(r.getObject("id", UUID.class), r.getString("name")), user),
            jdbc.query("SELECT collection_id,game_id FROM library_collection_games WHERE user_id=? ORDER BY collection_id,game_id",
                (r,n) -> new LibraryMembership(r.getObject("collection_id", UUID.class), r.getObject("game_id", UUID.class)), user),
            jdbc.query("SELECT game_id,note,hidden FROM library_preferences WHERE user_id=? ORDER BY game_id",
                (r,n) -> new LibraryPreference(r.getObject("game_id", UUID.class), r.getString("note"), r.getBoolean("hidden")), user));
    }
    public LibraryCollection createCollection(UUID user, String name) {
        UUID id = procedure(() -> jdbc.queryForObject("CALL public.sp_create_library_collection(?,?,NULL)", (r,n) -> r.getObject("p_collection_id", UUID.class), user, name));
        return new LibraryCollection(id, name);
    }
    public void renameCollection(UUID user, UUID id, String name) {
        procedure(() -> jdbc.update("CALL public.sp_rename_library_collection(?,?,?)", user, id, name));
    }
    public void deleteCollection(UUID user, UUID id) {
        procedure(() -> jdbc.update("CALL public.sp_delete_library_collection(?,?)", user, id));
    }
    public void addCollectionGame(UUID user, UUID collection, UUID game) {
        procedure(() -> jdbc.update("CALL public.sp_set_library_membership(?,?,?,?)", user, collection, game, true));
    }
    public void removeCollectionGame(UUID user, UUID collection, UUID game) {
        procedure(() -> jdbc.update("CALL public.sp_set_library_membership(?,?,?,?)", user, collection, game, false));
    }
    public void saveLibraryPreference(UUID user, UUID game, String note, boolean hidden) {
        procedure(() -> jdbc.update("CALL public.sp_save_library_preference(?,?,?,?)", user, game, note, hidden));
    }
    public List<WishlistEntry> wishlist(UUID user) {
        return jdbc.query("SELECT game_id, created_at FROM wishlists WHERE user_id=? ORDER BY created_at DESC", WISHLIST_ENTRY, user);
    }
    public boolean isWishlisted(UUID user, UUID game) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM wishlists WHERE user_id=? AND game_id=?)", Boolean.class, user, game));
    }
    public void addWishlist(UUID user, UUID game) {
        jdbc.update("INSERT INTO wishlists(user_id, game_id, created_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT (user_id, game_id) DO NOTHING", user, game);
    }
    public void removeWishlist(UUID user, UUID game) {
        jdbc.update("DELETE FROM wishlists WHERE user_id=? AND game_id=?", user, game);
    }
    public List<NotificationItem> notifications(UUID user) {
        return jdbc.query("SELECT id, game_id, promotion_id, type, title, message, discount, created_at, read_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50", NOTIFICATION_ITEM, user);
    }
    public long unreadNotificationCount(UUID user) {
        Long count = jdbc.queryForObject("SELECT count(*) FROM notifications WHERE user_id=? AND read_at IS NULL", Long.class, user);
        return count != null ? count : 0L;
    }
    public void markNotificationRead(UUID user, UUID notificationId) {
        jdbc.update("UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=? AND read_at IS NULL", user, notificationId);
    }
    public void markAllNotificationsRead(UUID user) {
        jdbc.update("UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE user_id=? AND read_at IS NULL", user);
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
    private Transaction transaction(UUID id, UUID user) {
        return jdbc.queryForObject("SELECT * FROM transactions WHERE id=? AND user_id=?", TRANSACTION, id, user);
    }
    public Transaction depositWallet(UUID user, BigDecimal amount, UUID key) {
        UUID id = procedure(() -> jdbc.queryForObject("CALL public.sp_deposit_wallet(?,?,?,NULL)", (r,n) -> r.getObject("p_transaction_id", UUID.class), user, amount, key));
        return transaction(id, user);
    }
    public UUID createWithdrawalCheckout(UUID user, BigDecimal amount, UUID key) {
        return procedure(() -> jdbc.queryForObject("CALL public.sp_create_withdrawal_checkout(?,?,?,NULL)", (r,n) -> r.getObject("p_id", UUID.class), user, key, amount));
    }
    public boolean isWithdrawalCheckout(UUID user, UUID id) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM public.checkout_sessions WHERE user_id=? AND id=? AND purpose='WITHDRAWAL')", Boolean.class, user, id));
    }
    public void confirmWithdrawal(UUID user, UUID id, String bank, String account) {
        procedure(() -> jdbc.update("CALL public.sp_confirm_withdrawal_checkout(?,?,?,?)", user, id, bank, account));
    }
    public Transaction purchaseGame(UUID user, UUID game, UUID key, BigDecimal expectedAmount) {
        UUID id = procedure(() -> jdbc.queryForObject("CALL public.sp_purchase_game(?,?,?,?,NULL)", (r,n) -> r.getObject("p_transaction_id", UUID.class), user, game, key, expectedAmount));
        return transaction(id, user);
    }
    public List<Review> reviews(Account user) {
        return jdbc.query("SELECT r.* FROM reviews r JOIN games g ON g.id=r.game_id WHERE " + VISIBLE + " ORDER BY r.id", REVIEW,
            user.role().equals("ADMINISTRATOR"), user.id(), user.id());
    }
    public Review saveReview(UUID user, UUID game, BigDecimal rating, String content) {
        UUID id = procedure(() -> jdbc.queryForObject("CALL public.sp_save_game_review(?,?,?,?,NULL)", (r,n) -> r.getObject("p_review_id", UUID.class), user, game, rating, content));
        return review(id, user).orElseThrow();
    }
    public Optional<Review> review(UUID id, UUID user) {
        return jdbc.query("SELECT * FROM reviews WHERE id=? AND user_id=?", REVIEW, id, user).stream().findFirst();
    }
    public void deleteReview(UUID id, UUID user) { procedure(() -> jdbc.update("CALL public.sp_delete_game_review(?,?)", user, id)); }
    public List<RevenueSale> revenue(Account user, OffsetDateTime from, OffsetDateTime until) {
        String sql = "SELECT * FROM public.v_game_sale_revenue WHERE true";
        List<Object> args = new ArrayList<>();
        if (!user.role().equals("ADMINISTRATOR")) { sql += " AND developer_id=?"; args.add(user.id()); }
        if (from != null) { sql += " AND created_at>=?"; args.add(from); }
        if (until != null) { sql += " AND created_at<?"; args.add(until); }
        return jdbc.query(sql + " ORDER BY created_at,id", (r,n) -> new RevenueSale(r.getObject("id",UUID.class),r.getObject("game_id",UUID.class),
            r.getString("type"),amount(r.getBigDecimal("amount")),r.getString("status"),r.getObject("created_at",OffsetDateTime.class).toInstant().toString(),
            r.getObject("developer_id",UUID.class),r.getString("game_title"),r.getString("developer_name"),amount(r.getBigDecimal("platform_fee")),amount(r.getBigDecimal("developer_revenue")),r.getString("beneficiary_type")),args.toArray());
    }
    public List<PublicationFee> publicationFees(Account user, OffsetDateTime from, OffsetDateTime until) {
        String sql="SELECT f.*,g.title,u.username FROM public.game_publication_fees f JOIN games g ON g.id=f.game_id JOIN users u ON u.id=f.developer_id WHERE true";
        List<Object> args=new ArrayList<>();
        if(!user.role().equals("ADMINISTRATOR")){sql+=" AND f.developer_id=?";args.add(user.id());}
        if(from!=null){sql+=" AND f.created_at>=?";args.add(from);}
        if(until!=null){sql+=" AND f.created_at<?";args.add(until);}
        return jdbc.query(sql+" ORDER BY f.created_at,f.game_id",(r,n)->new PublicationFee(r.getObject("game_id",UUID.class),r.getString("title"),r.getObject("developer_id",UUID.class),
            r.getString("username"),amount(r.getBigDecimal("amount")),amount(r.getBigDecimal("usd_amount")),r.getObject("created_at",OffsetDateTime.class).toInstant().toString()),args.toArray());
    }
}
