package gamestore_backend.modules.catalog;

import java.util.List;
import java.util.UUID;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

public final class CatalogDtos {
    private CatalogDtos() {}
    public record Actor(UUID id, String username, String role) {
        public boolean admin() { return "ADMINISTRATOR".equals(role); }
    }
    public record Genre(UUID id, String name, String description) {}
    public record Developer(UUID id, String username) {}
    public record Submission(UUID id, UUID game_id, String game_title, UUID submitted_by, String submitter_name,
        UUID reviewed_by, String reviewer_name, String status, String reason, OffsetDateTime created_at,
        OffsetDateTime reviewed_at) {}
    public record Game(UUID id, UUID developer_id, String developer_name, String title, String description,
        String price, String cover_image_url, String version, String status, OffsetDateTime uploaded_at,
        List<UUID> genre_ids, boolean can_enable, boolean has_pending_submission, List<Submission> submissions) {}
    public record Management(List<Game> games, List<Genre> genres, List<Developer> developers) {}
    public record Input(String title, String description, BigDecimal price, String cover_image_url,
        String version, List<UUID> genre_ids, UUID developer_id, String status) {}
    public record StatusInput(String status) {}
    public record ReviewInput(String status, String reason) {}
    public record SubmissionPage(List<Submission> items, long total, int page, int size) {}
}
