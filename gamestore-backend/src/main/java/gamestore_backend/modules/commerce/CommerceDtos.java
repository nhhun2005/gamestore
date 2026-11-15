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
    public record LibraryCollection(UUID id, String name) {}
    public record LibraryMembership(UUID collection_id, UUID game_id) {}
    public record LibraryPreference(UUID game_id, String note, boolean hidden) {}
    public record LibraryData(List<LibraryCollection> collections, List<LibraryMembership> memberships,
                              List<LibraryPreference> preferences) {}
    public record CollectionRequest(@NotBlank @Size(max=80) String name) {}
    public record LibraryPreferenceRequest(@NotNull @Size(max=2000) String note, @NotNull Boolean hidden) {}
    public record Review(UUID id, UUID user_id, UUID game_id, BigDecimal rating, String content) {}
    public record WishlistEntry(UUID game_id, String created_at) {}
    public record NotificationItem(UUID id, UUID game_id, UUID promotion_id, String type, String title,
                                  String message, String discount, String created_at, String read_at, boolean is_read) {}
    public record NotificationSummary(List<NotificationItem> items, long unread_count) {}
    public record Capabilities(boolean demo_topups, boolean sandbox_payments, boolean sandbox_topups, boolean sandbox_withdrawals) {}
    public record Checkout(UUID id, UUID game_id, UUID transaction_id, String game_title, String amount,
        String status, String method, String bank, String card_last4, String reason, String created_at,
        String expires_at, String settled_at, String qr_payload, String purpose) {}
    public record CheckoutSummary(UUID id, UUID game_id, UUID transaction_id, String game_title, String amount, String status, String expires_at, String purpose) {}
    public record CheckoutRequest(@NotNull UUID game_id, @NotNull @DecimalMin(value="0",inclusive=false) @Digits(integer=17,fraction=2) BigDecimal expected_amount) {}
    public record ConfirmCheckoutRequest(@NotBlank String method, @NotBlank String bank,
        @Size(max=19) String card_number, @Size(max=5) String expiry, @Size(max=4) String cvv, @Size(max=36) String qr_code, @Size(max=20) String recipient_account) {}
    public record RevenueSale(UUID id, UUID game_id, String type, String amount, String status, String created_at,
                              UUID developer_id, String game_title, String developer_name, String platform_fee, String developer_revenue, String beneficiary_type) {}
    public record PublicationFee(UUID game_id, String game_title, UUID developer_id, String developer_name,
                                 String amount, String usd_amount, String created_at) {}
    public record State(AccountView current_user, List<UserSummary> users, List<Game> games,
                        List<Promotion> promotions, List<Transaction> transactions,
                        List<Ownership> game_bought, List<Review> reviews,
                        List<WishlistEntry> wishlist, Capabilities capabilities, LibraryData library, List<CheckoutSummary> checkout_sessions) {}
    public record TransactionPage(List<Transaction> items, long total, int page, int size) {}
    public record DepositRequest(
        @NotNull @DecimalMin(value = "0", inclusive = false) @DecimalMax("100000000")
        @Digits(integer = 9, fraction = 2) BigDecimal amount) {}
    public record TopUpChallenge(UUID challenge_id, String amount, String code, String expires_at) {}
    public record ConfirmDepositRequest(
        @NotNull @DecimalMin(value = "0", inclusive = false) @DecimalMax("100000000")
        @Digits(integer = 9, fraction = 2) BigDecimal amount,
        @NotNull UUID challenge_id, @NotBlank @Size(max = 32) String code) {}
    public record PurchaseRequest(@NotNull UUID game_id, @DecimalMin("0") @Digits(integer=17, fraction=2) BigDecimal expected_amount) {}
    public record ReviewRequest(@NotNull @DecimalMin("1") @DecimalMax("5") BigDecimal rating,
                                @NotBlank @Size(max = 2000) String content) {}
    public record WishlistRequest(@NotNull UUID game_id) {}
}
