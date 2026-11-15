package gamestore_backend.modules.store;

import static gamestore_backend.modules.store.StoreDtos.*;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/store/games")
public class StoreController {
    private final StoreService service;
    public StoreController(StoreService service) { this.service=service; }
    @GetMapping
    public GamePage search(Authentication auth,@RequestParam(defaultValue="") String q,
        @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
        return service.search(auth,q,page,size);
    }
    @GetMapping("/{id}")
    public GameDetail detail(Authentication auth,@PathVariable UUID id) { return service.detail(auth,id); }
}
