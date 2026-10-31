package gamestore_backend.modules.commerce;

import static gamestore_backend.modules.commerce.CommerceDtos.*;
import static org.springframework.http.HttpStatus.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;

@Service
public class CommerceService {
    private final CommerceRepository repository;
    private final boolean demoTopups;
    public CommerceService(CommerceRepository repository,
        @Value("${app.commerce.demo-topups-enabled:false}") boolean demoTopups) {
        this.repository = repository; this.demoTopups = demoTopups;
    }
    private Account actor(Authentication authentication, boolean lock) {
        if (authentication == null || !authentication.isAuthenticated()) throw new CommerceException(UNAUTHORIZED, "Vui lòng đăng nhập.");
        Account user = repository.account(authentication.getName(), lock)
            .orElseThrow(() -> new CommerceException(UNAUTHORIZED, "Tài khoản không còn tồn tại."));
        if (!user.status().equals("VERIFIED")) throw new CommerceException(FORBIDDEN, "Tài khoản chưa được xác minh hoặc đã bị khóa.");
        return user;
    }
    private AccountView view(Account account) {
        return new AccountView(account.id(), account.username(), account.role(), account.status(), CommerceRepository.amount(account.balance()));
    }
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public State state(Authentication authentication) {
        Account user = actor(authentication, false);
        return new State(view(user), repository.publicUsers(user), repository.games(user), repository.promotions(),
            repository.transactions(user.id()), repository.ownerships(user.id()), repository.reviews(user),
            repository.wishlist(user.id()), new Capabilities(demoTopups));
    }
    @Transactional(readOnly = true)
    public AccountView wallet(Authentication authentication) { return view(actor(authentication, false)); }
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public TransactionPage history(Authentication authentication, String type, String status, int page, int size, String sort) {
        Account user = actor(authentication, false);
        if (page < 0 || size < 1 || size > 100 || type != null && !Set.of("IN", "OUT", "BUY").contains(type)
            || status != null && !Set.of("PENDING", "SUCCESSED", "FAILED").contains(status)
            || !Set.of("newest", "oldest", "amount").contains(sort)) throw new CommerceException(BAD_REQUEST, "Bộ lọc hoặc phân trang không hợp lệ.");
        return repository.transactionPage(user.id(), type, status, page, size, sort);
    }
    @Transactional
    public Transaction deposit(Authentication authentication, BigDecimal amount, UUID key) {
        if (!demoTopups) throw new CommerceException(SERVICE_UNAVAILABLE, "Nạp tiền mô phỏng chỉ bật trong profile phát triển. Chưa tích hợp cổng thanh toán thật.");
        Account user = actor(authentication, true);
        if (amount == null || amount.signum() <= 0 || amount.compareTo(new BigDecimal("100000000")) > 0 || amount.scale() > 2)
            throw new CommerceException(BAD_REQUEST, "Số tiền phải lớn hơn 0, không quá 100.000.000 VND và tối đa 2 chữ số thập phân.");
        BigDecimal value = amount.setScale(2);
        Optional<Transaction> previous = repository.byRequest(user.id(), key);
        if (previous.isPresent()) {
            Transaction transaction = previous.get();
            if (!transaction.type().equals("IN") || value.compareTo(new BigDecimal(transaction.amount())) != 0)
                throw new CommerceException(CONFLICT, "Mã yêu cầu đã dùng cho một giao dịch khác.");
            return transaction;
        }
        BigDecimal balance = user.balance().add(value);
        if (balance.precision() - balance.scale() > 17) throw new CommerceException(BAD_REQUEST, "Số dư vượt giới hạn.");
        repository.balance(user.id(), balance);
        return repository.record(user.id(), null, "IN", value, key);
    }
    @Transactional
    public Transaction purchase(Authentication authentication, UUID gameId, UUID key, BigDecimal expectedAmount) {
        Account user = actor(authentication, true); // Serializes debit and retry checking for this wallet.
        Optional<Transaction> previous = repository.byRequest(user.id(), key);
        if (previous.isPresent()) {
            Transaction transaction = previous.get();
            if (!transaction.type().equals("BUY") || !Objects.equals(transaction.game_id(), gameId)
                || expectedAmount != null && new BigDecimal(transaction.amount()).compareTo(expectedAmount) != 0)
                throw new CommerceException(CONFLICT, "Mã yêu cầu đã dùng cho một giao dịch khác.");
            return transaction;
        }
        Game game = repository.game(gameId, true).orElseThrow(() -> new CommerceException(NOT_FOUND, "Trò chơi không tồn tại."));
        if (!game.status().equals("AVAILABLE")) throw new CommerceException(CONFLICT, "Trò chơi hiện chưa mở bán.");
        if (repository.owns(user.id(), gameId)) throw new CommerceException(CONFLICT, "Bạn đã sở hữu trò chơi này.");
        Promotion promotion = game.promotion_id() == null ? null : repository.promotion(game.promotion_id()).orElse(null);
        BigDecimal price = effectivePrice(new BigDecimal(game.price()), promotion);
        if (expectedAmount != null && price.compareTo(expectedAmount) != 0)
            throw new CommerceException(CONFLICT, "Giá đã thay đổi. Kiểm tra giá mới và xác nhận lại.");
        if (user.balance().compareTo(price) < 0) throw new CommerceException(PAYMENT_REQUIRED, "Số dư không đủ. Vui lòng nạp thêm tiền.");
        repository.balance(user.id(), user.balance().subtract(price));
        // V2 trigger grants game_bought atomically. Do not insert ownership a second time.
        return repository.record(user.id(), game.id(), "BUY", price, key);
    }
    public static BigDecimal effectivePrice(BigDecimal price, Promotion promotion) {
        if (promotion == null || !promotion.status().equals("ENABLED")) return price.setScale(2, RoundingMode.HALF_UP);
        return price.multiply(BigDecimal.ONE.subtract(new BigDecimal(promotion.discount()).movePointLeft(2))).setScale(2, RoundingMode.HALF_UP);
    }
    @Transactional
    public Review saveReview(Authentication authentication, UUID gameId, BigDecimal rating, String content) {
        Account user = actor(authentication, true);
        if (rating == null || rating.compareTo(BigDecimal.ONE) < 0 || rating.compareTo(new BigDecimal("5")) > 0 || rating.remainder(new BigDecimal("0.5")).signum() != 0)
            throw new CommerceException(BAD_REQUEST, "Điểm phải từ 1 đến 5, theo bước 0,5.");
        if (content == null || content.isBlank() || content.strip().length() > 2000) throw new CommerceException(BAD_REQUEST, "Nội dung cần từ 1 đến 2.000 ký tự.");
        if (!repository.owns(user.id(), gameId)) throw new CommerceException(FORBIDDEN, "Chỉ người sở hữu trò chơi mới được đánh giá.");
        repository.game(gameId, true).orElseThrow(() -> new CommerceException(NOT_FOUND, "Trò chơi không tồn tại."));
        return repository.saveReview(user.id(), gameId, rating, content.strip());
    }
    @Transactional
    public void deleteReview(Authentication authentication, UUID reviewId) {
        Account user = actor(authentication, true);
        Review review = repository.review(reviewId, user.id()).orElseThrow(() -> new CommerceException(NOT_FOUND, "Không tìm thấy đánh giá của bạn."));
        repository.game(review.game_id(), true);
        repository.deleteReview(reviewId, user.id());
    }
    @Transactional(readOnly = true)
    public List<WishlistEntry> wishlist(Authentication authentication) {
        Account user = actor(authentication, false);
        return repository.wishlist(user.id());
    }
    @Transactional
    public void addWishlist(Authentication authentication, UUID gameId) {
        Account user = actor(authentication, false);
        Game game = repository.game(gameId, false)
            .orElseThrow(() -> new CommerceException(NOT_FOUND, "Trò chơi không tồn tại."));
        if (!game.status().equals("AVAILABLE"))
            throw new CommerceException(CONFLICT, "Trò chơi hiện chưa mở bán.");
        if (repository.owns(user.id(), gameId))
            throw new CommerceException(CONFLICT, "Bạn đã sở hữu trò chơi này.");
        repository.addWishlist(user.id(), gameId);
    }
    @Transactional
    public void removeWishlist(Authentication authentication, UUID gameId) {
        Account user = actor(authentication, false);
        repository.removeWishlist(user.id(), gameId);
    }
    @Transactional(readOnly = true)
    public NotificationSummary notifications(Authentication authentication) {
        Account user = actor(authentication, false);
        return new NotificationSummary(repository.notifications(user.id()), repository.unreadNotificationCount(user.id()));
    }
    @Transactional
    public void markNotificationRead(Authentication authentication, UUID notificationId) {
        Account user = actor(authentication, false);
        repository.markNotificationRead(user.id(), notificationId);
    }
    @Transactional
    public void markAllNotificationsRead(Authentication authentication) {
        Account user = actor(authentication, false);
        repository.markAllNotificationsRead(user.id());
    }
    @Transactional(readOnly = true)
    public List<RevenueSale> revenue(Authentication authentication, LocalDate from, LocalDate to) {
        Account user = actor(authentication, false);
        // Database role, not potentially stale role claims and never a developer_id supplied by the caller.
        if (!Set.of("DEVELOPER", "ADMINISTRATOR").contains(user.role())) throw new CommerceException(FORBIDDEN, "Bạn không có quyền xem doanh thu.");
        if (from != null && to != null && from.isAfter(to)) throw new CommerceException(BAD_REQUEST, "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.");
        ZoneId zone = ZoneId.of("Asia/Ho_Chi_Minh");
        return repository.revenue(user, from == null ? null : from.atStartOfDay(zone).toOffsetDateTime(),
            to == null ? null : to.plusDays(1).atStartOfDay(zone).toOffsetDateTime())
            .stream().map(row -> new RevenueSale(row.id(), row.game_id(), row.type(), row.amount(), row.status(), row.created_at())).toList();
    }
}
