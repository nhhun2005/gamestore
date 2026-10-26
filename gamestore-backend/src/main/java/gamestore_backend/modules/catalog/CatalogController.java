package gamestore_backend.modules.catalog;

import static gamestore_backend.modules.catalog.CatalogDtos.*;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/catalog")
public class CatalogController {
    private final CatalogService service;
    public CatalogController(CatalogService service) { this.service = service; }
    @GetMapping("/manage") public Management management(Authentication auth) { return service.management(auth.getName()); }
    @GetMapping("/games/{id}") public Game get(Authentication auth, @PathVariable UUID id) { return service.get(auth.getName(), id); }
    @PostMapping("/games") @ResponseStatus(HttpStatus.CREATED)
    public Game create(Authentication auth, @RequestBody Input input) { return service.save(auth.getName(), null, input); }
    @PutMapping("/games/{id}") public Game update(Authentication auth, @PathVariable UUID id, @RequestBody Input input) { return service.save(auth.getName(), id, input); }
    @DeleteMapping("/games/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void hide(Authentication auth, @PathVariable UUID id) { service.visibility(auth.getName(), id, "HIDDEN"); }
    @PutMapping("/games/{id}/status") public Game visibility(Authentication auth, @PathVariable UUID id, @RequestBody StatusInput input) { return service.visibility(auth.getName(), id, input.status()); }
    @DeleteMapping("/games/{id}/permanent") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void permanent(Authentication auth, @PathVariable UUID id) { service.permanent(auth.getName(), id); }
    @PostMapping("/games/{id}/submissions") @ResponseStatus(HttpStatus.CREATED)
    public Submission submit(Authentication auth, @PathVariable UUID id) { return service.submit(auth.getName(), id); }
    @GetMapping("/submissions") public SubmissionPage submissions(Authentication auth,
        @RequestParam(required = false) String status, @RequestParam(defaultValue = "") String q,
        @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) { return service.submissions(auth.getName(), status, q, page, size); }
    @PutMapping("/submissions/{id}/review") public Submission review(Authentication auth, @PathVariable UUID id, @RequestBody ReviewInput input) { return service.review(auth.getName(), id, input); }
}
