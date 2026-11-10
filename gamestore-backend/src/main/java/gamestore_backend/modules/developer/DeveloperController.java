package gamestore_backend.modules.developer;

import static gamestore_backend.modules.developer.DeveloperDtos.*;

import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/developer")
public class DeveloperController {
    private final DeveloperService service;

    public DeveloperController(DeveloperService service) {
        this.service = service;
    }

    @GetMapping("/submissions")
    public List<DeveloperSubmissionResponse> getOwnSubmissions(Authentication auth) {
        return service.getOwnSubmissions(auth);
    }

    @PostMapping("/submissions")
    @ResponseStatus(HttpStatus.CREATED)
    public DeveloperSubmissionResponse submit(Authentication auth, @RequestBody DeveloperApplicationInput input) {
        return service.submit(auth, input);
    }

    @GetMapping("/admin/submissions")
    public DeveloperSubmissionPage getAdminSubmissions(
            Authentication auth,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "") String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return service.getAdminSubmissions(auth, status, q, page, size);
    }

    @PutMapping("/admin/submissions/{id}/review")
    public DeveloperSubmissionResponse review(
            Authentication auth,
            @PathVariable UUID id,
            @RequestBody DeveloperReviewInput input) {
        return service.review(auth, id, input);
    }
}
