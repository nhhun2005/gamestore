package gamestore_backend.modules.catalog;

import static gamestore_backend.modules.catalog.CatalogDtos.*;
import gamestore_backend.modules.commerce.CommerceException;
import gamestore_backend.modules.database.ProcedureCalls;
import java.net.URI;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
public class CatalogService {
    private final CatalogRepository repository;
    private final ProcedureCalls procedures;
    public CatalogService(CatalogRepository repository,ProcedureCalls procedures) { this.repository=repository; this.procedures=procedures; }
    private static CommerceException error(HttpStatus status,String message) { return new CommerceException(status,message); }
    public Actor actor(String username) {
        Actor a=repository.actor(username).orElseThrow(()->error(HttpStatus.FORBIDDEN,"Tài khoản chưa được xác minh hoặc đã bị khóa."));
        if(!a.admin() && !"DEVELOPER".equals(a.role())) throw error(HttpStatus.FORBIDDEN,"Chức năng dành cho quản trị viên và nhà phát triển.");
        return a;
    }
    private Actor admin(String username) {
        Actor a=actor(username);
        if(!a.admin()) throw error(HttpStatus.FORBIDDEN,"Chỉ quản trị viên được thực hiện thao tác này.");
        return a;
    }
    private Game game(UUID id) { return repository.game(id,false).orElseThrow(()->error(HttpStatus.NOT_FOUND,"Không tìm thấy trò chơi.")); }
    public Management management(String username) {
        Actor a=actor(username);
        return new Management(repository.games(a),repository.genres(),a.admin()?repository.developers():List.of());
    }
    public Game get(String username,UUID id) {
        Actor a=actor(username); Game g=game(id);
        if(!a.admin() && !g.developer_id().equals(a.id())) throw error(HttpStatus.FORBIDDEN,"Bạn chỉ được quản lý trò chơi của chính mình.");
        return g;
    }
    private static String text(String value,int max,boolean required,String field) {
        String result=value==null?"":value.strip();
        if((required && result.isBlank()) || result.length()>max) throw error(HttpStatus.BAD_REQUEST,field+" không hợp lệ (tối đa "+max+" ký tự).");
        return result;
    }
    private static String image(String value) {
        String result=text(value,2048,false,"URL ảnh");
        if(result.isEmpty()) return null;
        try {
            URI uri=URI.create(result);
            if(!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost()==null || uri.getUserInfo()!=null) throw new IllegalArgumentException();
        } catch(IllegalArgumentException invalid) { throw error(HttpStatus.BAD_REQUEST,"Ảnh phải là URL HTTPS hợp lệ."); }
        return result;
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public Game save(String username,UUID id,Input input) {
        if(input==null) throw error(HttpStatus.BAD_REQUEST,"Thiếu thông tin trò chơi.");
        String title=text(input.title(),200,true,"Tên trò chơi"),description=text(input.description(),10000,false,"Mô tả"),
            version=text(input.version(),100,false,"Phiên bản"),cover=image(input.cover_image_url());
        UUID[] genres=input.genre_ids()==null?null:input.genre_ids().toArray(UUID[]::new);
        if(id==null) id=procedures.uuid("sp_create_game",username,title,description,input.price(),cover,version,genres,input.developer_id(),input.status());
        else procedures.call("sp_update_game",username,id,title,description,input.price(),cover,version,genres,input.developer_id(),input.status());
        return game(id);
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public Game visibility(String username,UUID id,String status) {
        procedures.call("sp_set_game_status",username,id,status); return game(id);
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public void permanent(String username,UUID id) { procedures.call("sp_delete_game_permanently",username,id); }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public Submission submit(String username,UUID id) {
        UUID submission=procedures.uuid("sp_submit_game",username,id);
        return repository.submission(submission).orElseThrow();
    }
    public SubmissionPage submissions(String username,String status,String query,int page,int size) {
        admin(username);
        if(status!=null && !Set.of("PENDING","ACCEPTED","REJECTED").contains(status)) throw error(HttpStatus.BAD_REQUEST,"Bộ lọc đơn không hợp lệ.");
        if(page<0 || size<1 || size>100) throw error(HttpStatus.BAD_REQUEST,"Phân trang không hợp lệ.");
        return repository.submissions(status,text(query,200,false,"Tìm kiếm"),page,size);
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public Submission review(String username,UUID id,ReviewInput input) {
        if(input==null) throw error(HttpStatus.BAD_REQUEST,"Thiếu quyết định duyệt.");
        procedures.call("sp_review_game_submission",username,id,input.status(),text(input.reason(),2000,true,"Lý do duyệt hoặc từ chối"));
        return repository.submission(id).orElseThrow();
    }
}
