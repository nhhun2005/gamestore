package gamestore_backend.modules.catalog;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/catalog/images")
public class CatalogImageController {
    private final CatalogService catalog;
    private final CloudinaryImages images;
    public CatalogImageController(CatalogService catalog, CloudinaryImages images) { this.catalog = catalog; this.images = images; }
    @PostMapping(consumes = "multipart/form-data") @ResponseStatus(HttpStatus.CREATED)
    public Map<String, String> upload(Authentication auth, @RequestParam("file") MultipartFile file) {
        catalog.actor(auth.getName());
        return Map.of("url", images.upload(file));
    }
}
