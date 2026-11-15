package gamestore_backend.modules.developer;

import static gamestore_backend.modules.developer.DeveloperDtos.*;
import gamestore_backend.modules.commerce.CommerceException;
import gamestore_backend.modules.database.ProcedureCalls;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
public class DeveloperService {
    private final DeveloperRepository repository;
    private final ProcedureCalls procedures;
    public DeveloperService(DeveloperRepository repository,ProcedureCalls procedures) { this.repository=repository;this.procedures=procedures; }
    private static CommerceException error(HttpStatus status,String message) { return new CommerceException(status,message); }
    private static String identity(Authentication auth) {
        if(auth==null || !auth.isAuthenticated() || auth.getName()==null || auth.getName().isBlank()) throw error(HttpStatus.UNAUTHORIZED,"Vui lòng đăng nhập.");
        return auth.getName();
    }
    public UserAccount authenticate(Authentication auth) {
        return repository.actor(identity(auth)).orElseThrow(()->error(HttpStatus.UNAUTHORIZED,"Tài khoản không còn tồn tại."));
    }
    public UserAccount requireAdmin(Authentication auth) {
        UserAccount a=authenticate(auth);
        if(!a.isAdmin()) throw error(HttpStatus.FORBIDDEN,"Chỉ quản trị viên đã xác minh được thực hiện thao tác này.");
        return a;
    }
    public List<DeveloperSubmissionResponse> getOwnSubmissions(Authentication auth) {
        UserAccount a=authenticate(auth);
        if(!a.isVerified()) throw error(HttpStatus.FORBIDDEN,"Tài khoản chưa được xác minh hoặc đã bị khóa.");
        return repository.own(a.id());
    }
    private static String reason(String raw) {
        String value=raw==null?"":raw.strip();
        if(value.isEmpty() || value.length()>2000) throw error(HttpStatus.BAD_REQUEST,"Lý do phải từ 1 đến 2000 ký tự.");
        return value;
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public DeveloperSubmissionResponse submit(Authentication auth,DeveloperApplicationInput input) {
        String name=identity(auth);
        UUID id=procedures.uuid("sp_submit_developer_application",name,reason(input==null?null:input.application_reason()));
        return repository.find(id).orElseThrow();
    }
    public DeveloperSubmissionPage getAdminSubmissions(Authentication auth,String status,String query,int page,int size) {
        requireAdmin(auth);
        if(status!=null && status.isBlank()) status=null;
        if(status!=null && !Set.of("PENDING","ACCEPTED","REJECTED").contains(status)) throw error(HttpStatus.BAD_REQUEST,"Bộ lọc trạng thái không hợp lệ.");
        if(page<0 || size<1 || size>100) throw error(HttpStatus.BAD_REQUEST,"Phân trang không hợp lệ.");
        if(query!=null && query.length()>200) throw error(HttpStatus.BAD_REQUEST,"Từ khóa tối đa 200 ký tự.");
        return repository.page(status,query==null?"":query.strip(),page,size);
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public DeveloperSubmissionResponse review(Authentication auth,UUID id,DeveloperReviewInput input) {
        String name=identity(auth);
        if(id==null || input==null || input.status()==null || !Set.of("ACCEPTED","REJECTED").contains(input.status())) throw error(HttpStatus.BAD_REQUEST,"Quyết định duyệt không hợp lệ.");
        procedures.call("sp_review_developer_application",name,id,input.status(),reason(input.reason()));
        return repository.find(id).orElseThrow();
    }
}
