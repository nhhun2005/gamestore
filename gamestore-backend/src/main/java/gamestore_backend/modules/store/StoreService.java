package gamestore_backend.modules.store;

import static gamestore_backend.modules.store.StoreDtos.*;
import gamestore_backend.modules.commerce.CommerceException;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
public class StoreService {
    private final StoreRepository repository;
    public StoreService(StoreRepository repository) { this.repository=repository; }
    private Actor actor(Authentication auth) {
        if(auth==null || !auth.isAuthenticated() || auth.getName()==null || auth.getName().isBlank())
            throw new CommerceException(HttpStatus.UNAUTHORIZED,"Vui lòng đăng nhập.");
        Actor actor=repository.actor(auth.getName()).orElseThrow(()->new CommerceException(HttpStatus.UNAUTHORIZED,"Tài khoản không còn tồn tại."));
        if(!"VERIFIED".equals(actor.status())) throw new CommerceException(HttpStatus.FORBIDDEN,"Tài khoản chưa được xác minh hoặc đã bị khóa.");
        return actor;
    }
    public GamePage search(Authentication auth,String query,int page,int size) {
        actor(auth);
        if(query==null) query="";
        if(query.length()>200 || page<0 || size<1 || size>100)
            throw new CommerceException(HttpStatus.BAD_REQUEST,"Từ khóa tối đa 200 ký tự; phân trang không hợp lệ.");
        return repository.search(query,page,size);
    }
    public GameDetail detail(Authentication auth,UUID id) {
        Actor actor=actor(auth);
        Game game=repository.game(id).orElseThrow(StoreService::notFound);
        boolean owned=repository.owns(actor.id(),id);
        if(!"AVAILABLE".equals(game.status()) && !"ADMINISTRATOR".equals(actor.role()) && !game.developer_id().equals(actor.id()) && !owned)
            throw notFound();
        return new GameDetail(game,repository.promotions(id),repository.reviews(id),owned);
    }
    private static CommerceException notFound() { return new CommerceException(HttpStatus.NOT_FOUND,"Không tìm thấy trò chơi."); }
}
