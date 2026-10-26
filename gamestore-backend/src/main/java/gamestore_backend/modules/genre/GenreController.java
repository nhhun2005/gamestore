package gamestore_backend.modules.genre;

import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/genres")
public class GenreController {
    private final GenreService service;
    public GenreController(GenreService service) { this.service = service; }

    public record Genre(UUID id, String name, String description, long game_count) {}
    public record Game(UUID id, String title, String status, List<UUID> genre_ids) {}
    public record Input(String name, String description) {}

    @GetMapping public List<Genre> list(Authentication auth) { return service.list(auth.getName()); }
    @GetMapping("/games") public List<Game> games(Authentication auth) { return service.games(auth.getName()); }
    @GetMapping("/{id}") public Genre get(Authentication auth, @PathVariable UUID id) { return service.get(auth.getName(), id); }
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public Genre create(Authentication auth, @RequestBody Input input) { return service.save(auth.getName(), null, input); }
    @PutMapping("/{id}") public Genre update(Authentication auth, @PathVariable UUID id, @RequestBody Input input) {
        return service.save(auth.getName(), id, input);
    }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(Authentication auth, @PathVariable UUID id) { service.delete(auth.getName(), id); }
    @PutMapping("/{id}/games/{gameId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void attach(Authentication auth, @PathVariable UUID id, @PathVariable UUID gameId) { service.link(auth.getName(), id, gameId, true); }
    @DeleteMapping("/{id}/games/{gameId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void detach(Authentication auth, @PathVariable UUID id, @PathVariable UUID gameId) { service.link(auth.getName(), id, gameId, false); }
}
