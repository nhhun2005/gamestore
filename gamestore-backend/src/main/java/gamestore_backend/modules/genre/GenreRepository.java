package gamestore_backend.modules.genre;

import static gamestore_backend.modules.genre.GenreController.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class GenreRepository {
    private final JdbcTemplate jdbc;
    public GenreRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    private static final String SELECT="SELECT id,name,description,game_count FROM public.v_genre_summary";
    private static final RowMapper<Genre> ROW=(r,n)->new Genre(r.getObject("id",UUID.class),r.getString("name"),r.getString("description"),r.getLong("game_count"));
    public boolean isAdmin(String username) { return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM public.v_actor_accounts WHERE lower(username)=lower(?) AND role='ADMINISTRATOR' AND status='VERIFIED')",Boolean.class,username)); }
    public List<Genre> list() { return jdbc.query(SELECT+" ORDER BY lower(btrim(name)),id",ROW); }
    public Optional<Genre> find(UUID id) { return jdbc.query(SELECT+" WHERE id=?",ROW,id).stream().findFirst(); }
    public List<Game> games() {
        Map<UUID,List<UUID>> links=new HashMap<>();
        jdbc.query("SELECT game_id,genre_id FROM public.v_game_genres ORDER BY genre_id",(org.springframework.jdbc.core.RowCallbackHandler)r->links.computeIfAbsent(r.getObject("game_id",UUID.class),k->new ArrayList<>()).add(r.getObject("genre_id",UUID.class)));
        return jdbc.query("SELECT id,title,status FROM public.v_catalog_games ORDER BY lower(title),id",(r,n)->new Game(r.getObject("id",UUID.class),r.getString("title"),r.getString("status"),links.getOrDefault(r.getObject("id",UUID.class),List.of())));
    }
}
