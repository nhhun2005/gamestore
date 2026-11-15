package gamestore_backend.modules.store;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class StoreDtos {
    private StoreDtos() {}
    public record Actor(UUID id,String username,String role,String status) {}
    public record Game(UUID id,UUID developer_id,String developer_name,String title,String description,
        String price,String cover_image_url,String version,String status,OffsetDateTime uploaded_at,
        BigDecimal rating,String genre,UUID promotion_id) {}
    public record Promotion(UUID id,String name,String discount,String status) {}
    public record Review(UUID id,UUID user_id,String username,UUID game_id,BigDecimal rating,String content) {}
    public record GamePage(List<Game> items,List<Promotion> promotions,long total,int page,int size) {}
    public record GameDetail(Game game,List<Promotion> promotions,List<Review> reviews,boolean owned) {}
}
