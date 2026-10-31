package gamestore_backend.modules.promotion;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import gamestore_backend.modules.promotion.PromotionDtos.Input;
import gamestore_backend.modules.promotion.PromotionDtos.Overview;
import gamestore_backend.modules.promotion.PromotionDtos.SaveResult;
import gamestore_backend.modules.promotion.PromotionDtos.StatusInput;

/**
 * /api/admin/** đã được SecurityConfig giới hạn cho ADMINISTRATOR; service kiểm
 * tra lại role trong DB.
 */
@RestController
@RequestMapping("/api/admin/promotions")
public class PromotionController {
    private final PromotionService service;

    public PromotionController(PromotionService service) {
        this.service = service;
    }

    @GetMapping
    public Overview overview(Authentication auth) {
        return service.overview(auth.getName());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SaveResult create(Authentication auth, @RequestBody Input input) {
        return service.create(auth.getName(), input);
    }

    @PutMapping("/{id}")
    public SaveResult update(Authentication auth, @PathVariable UUID id, @RequestBody Input input) {
        return service.update(auth.getName(), id, input);
    }

    @PutMapping("/{id}/status")
    public SaveResult status(Authentication auth, @PathVariable UUID id, @RequestBody StatusInput input) {
        return service.setStatus(auth.getName(), id, input);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(Authentication auth, @PathVariable UUID id) {
        service.delete(auth.getName(), id);
    }
}
