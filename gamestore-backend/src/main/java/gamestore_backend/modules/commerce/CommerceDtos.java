package gamestore_backend.modules.commerce;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import jakarta.validation.constraints.*;

public final class CommerceDtos {
    private CommerceDtos() {}
    public record Account(UUID id, String username, String email, String role, String status, BigDecimal balance) {}
    public record AccountView(UUID id, String username, String role, String status, String balance) {}
    public record UserSummary(UUID id, String username, String role) {}
    public record Game(UUID id, UUID developer_id, String title, String description, String price,
                       String cover_image_url, String status, UUID promotion_id, BigDecimal rating, String genre) {}
    public record Promotion(UUID id, String name, String discount, String status) {}
    public record Transaction(UUID id, UUID user_id, UUID game_id, String type, String amount,
                              String status, String created_at, UUID idempotency_key) {}
    public record Ownership(UUID user_id, UUID game_id, UUID transaction_id) {}
    public record Review(UUID id, UUID user_id, UUID game_id, BigDecimal rating, String content) {}
    public record Capabilities(boolean demo_topups) {}
    public record RevenueSale(UUID id, UUID game_id, String type, String amount, String status, String created_at) {}
    public record State(AccountView current_user, List<UserSummary> users, List<Game> games,
                        List<Promotion> promotions, List<Transaction> transactions,
                        List<Ownership> game_bought, List<Review> reviews, Capabilities capabilities) {}
    public record TransactionPage(List<Transaction> items, long total, int page, int size) {}
    public record DepositRequest(
        @NotNull @DecimalMin(value = "0", inclusive = false) @DecimalMax("100000000")
        @Digits(integer = 9, fraction = 2) BigDecimal amount) {}
    public record PurchaseRequest(@NotNull UUID game_id, @DecimalMin("0") @Digits(integer=17, fraction=2) BigDecimal expected_amount) {}
    public record ReviewRequest(@NotNull @DecimalMin("1") @DecimalMax("5") BigDecimal rating,
                                @NotBlank @Size(max = 2000) String content) {}
}
