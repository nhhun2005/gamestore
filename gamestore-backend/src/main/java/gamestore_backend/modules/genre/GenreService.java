package gamestore_backend.modules.genre;

import static gamestore_backend.modules.genre.GenreController.*;
import gamestore_backend.modules.commerce.CommerceException;
import gamestore_backend.modules.database.ProcedureCalls;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
public class GenreService {
    private final GenreRepository repository;
    private final ProcedureCalls procedures;
    public GenreService(GenreRepository repository,ProcedureCalls procedures) { this.repository=repository;this.procedures=procedures; }
    private void admin(String username) {
        if(!repository.isAdmin(username)) throw new CommerceException(HttpStatus.FORBIDDEN,"Chỉ quản trị viên đã xác minh được quản lý thể loại.");
    }
    private Genre find(UUID id) { return repository.find(id).orElseThrow(()->new CommerceException(HttpStatus.NOT_FOUND,"Không tìm thấy thể loại.")); }
    public List<Genre> list(String username) { admin(username);return repository.list(); }
    public Genre get(String username,UUID id) { admin(username);return find(id); }
    public List<Game> games(String username) { admin(username);return repository.games(); }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public Genre save(String username,UUID id,Input input) {
        if(input==null) throw new CommerceException(HttpStatus.BAD_REQUEST,"Thiếu thông tin thể loại.");
        String name=input.name()==null?null:input.name().strip(),description=input.description()==null?null:input.description().strip();
        if(id==null) id=procedures.uuid("sp_create_genre",username,name,description);
        else procedures.call("sp_update_genre",username,id,name,description);
        return find(id);
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public void delete(String username,UUID id) { procedures.call("sp_delete_genre",username,id); }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public void link(String username,UUID id,UUID game,boolean attach) { procedures.call(attach?"sp_attach_game_genre":"sp_detach_game_genre",username,id,game); }
}
