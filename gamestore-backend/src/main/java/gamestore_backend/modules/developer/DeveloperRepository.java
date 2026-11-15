package gamestore_backend.modules.developer;

import static gamestore_backend.modules.developer.DeveloperDtos.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class DeveloperRepository {
    private final JdbcTemplate jdbc;
    public DeveloperRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    private static final String SELECT="SELECT id,user_id,username,status,application_reason,reason FROM public.v_developer_submission_details";
    private static final RowMapper<DeveloperSubmissionResponse> ROW=(r,n)->new DeveloperSubmissionResponse(r.getObject("id",UUID.class),r.getObject("user_id",UUID.class),r.getString("username"),r.getString("status"),r.getString("application_reason"),r.getString("reason"));
    public Optional<UserAccount> actor(String name) {
        return jdbc.query("SELECT id,username,role,status FROM public.v_actor_accounts WHERE lower(username)=lower(?)",(r,n)->new UserAccount(r.getObject("id",UUID.class),r.getString("username"),r.getString("role"),r.getString("status")),name).stream().findFirst();
    }
    public List<DeveloperSubmissionResponse> own(UUID id) { return jdbc.query(SELECT+" WHERE user_id=? ORDER BY id",ROW,id); }
    public Optional<DeveloperSubmissionResponse> find(UUID id) { return jdbc.query(SELECT+" WHERE id=?",ROW,id).stream().findFirst(); }
    public DeveloperSubmissionPage page(String status,String query,int page,int size) {
        String where=" WHERE (?::text IS NULL OR status=?) AND strpos(lower(username),lower(?))>0";
        long total=Objects.requireNonNull(jdbc.queryForObject("SELECT count(*) FROM public.v_developer_submission_details"+where,Long.class,status,status,query));
        return new DeveloperSubmissionPage(jdbc.query(SELECT+where+" ORDER BY id LIMIT ? OFFSET ?",ROW,status,status,query,size,(long)page*size),total,page,size);
    }
}
