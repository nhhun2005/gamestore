package gamestore_backend.modules.store;

import static gamestore_backend.modules.store.StoreDtos.*;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class StoreRepository {
    private final JdbcTemplate jdbc;
    public StoreRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    private static final String GAME_COLUMNS="id,developer_id,developer_name,title,description,price,cover_image_url,version,status,uploaded_at,rating,genre,promotion_id";
    private static final String PROMOTION_COLUMNS=",promotion_name,promotion_discount,promotion_status";
    private static final RowMapper<Game> GAME=(r,n)->game(r);
    private record StoreRow(Game game,Promotion promotion) {}
    private static final RowMapper<StoreRow> STORE=(r,n)->new StoreRow(game(r),promotion(r));
    private static Game game(ResultSet r) throws SQLException {
        return new Game(r.getObject("id",UUID.class),r.getObject("developer_id",UUID.class),r.getString("developer_name"),
            r.getString("title"),r.getString("description"),r.getBigDecimal("price").setScale(2).toPlainString(),
            r.getString("cover_image_url"),r.getString("version"),r.getString("status"),r.getObject("uploaded_at",OffsetDateTime.class),
            r.getBigDecimal("rating"),r.getString("genre"),r.getObject("promotion_id",UUID.class));
    }
    private static Promotion promotion(ResultSet r) throws SQLException {
        UUID id=r.getObject("promotion_id",UUID.class);
        return id==null?null:new Promotion(id,r.getString("promotion_name"),r.getBigDecimal("promotion_discount").toPlainString(),r.getString("promotion_status"));
    }
    public Optional<Actor> actor(String username) {
        return jdbc.query("SELECT id,username,role,status FROM public.v_actor_accounts WHERE lower(username)=lower(?)",
            (r,n)->new Actor(r.getObject("id",UUID.class),r.getString("username"),r.getString("role"),r.getString("status")),username).stream().findFirst();
    }
    public GamePage search(String query,int page,int size) {
        String where=" WHERE strpos(lower(title),lower(?))>0";
        long total=Objects.requireNonNull(jdbc.queryForObject("SELECT count(*) FROM public.v_store_games"+where,Long.class,query));
        List<StoreRow> rows=jdbc.query("SELECT "+GAME_COLUMNS+PROMOTION_COLUMNS+" FROM public.v_store_games"+where+" ORDER BY lower(title),id LIMIT ? OFFSET ?",
            STORE,query,size,(long)page*size);
        Map<UUID,Promotion> promotions=new LinkedHashMap<>();
        for(StoreRow row:rows) if(row.promotion()!=null) promotions.put(row.promotion().id(),row.promotion());
        return new GamePage(rows.stream().map(StoreRow::game).toList(),List.copyOf(promotions.values()),total,page,size);
    }
    public Optional<Game> game(UUID id) {
        return jdbc.query("SELECT "+GAME_COLUMNS+" FROM public.v_catalog_games WHERE id=?",GAME,id).stream().findFirst();
    }
    public boolean owns(UUID actor,UUID game) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM public.v_game_ownership WHERE user_id=? AND game_id=?)",Boolean.class,actor,game));
    }
    public List<Promotion> promotions(UUID game) {
        return jdbc.query("SELECT promotion_id,promotion_name,promotion_discount,promotion_status FROM public.v_store_games WHERE id=? AND promotion_id IS NOT NULL",
            (r,n)->promotion(r),game);
    }
    public List<Review> reviews(UUID game) {
        return jdbc.query("SELECT id,user_id,username,game_id,rating,content FROM public.v_public_game_reviews WHERE game_id=? ORDER BY id",
            (r,n)->new Review(r.getObject("id",UUID.class),r.getObject("user_id",UUID.class),r.getString("username"),r.getObject("game_id",UUID.class),r.getBigDecimal("rating"),r.getString("content")),game);
    }
}
