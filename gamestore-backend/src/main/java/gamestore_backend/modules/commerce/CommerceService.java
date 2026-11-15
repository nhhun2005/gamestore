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
    private final boolean sandboxPayments;
    private final TopUpChallenges topUps = new TopUpChallenges();
    @org.springframework.beans.factory.annotation.Autowired
    public CommerceService(CommerceRepository repository,
        @Value("${app.commerce.demo-topups-enabled:true}") boolean demoTopups,
        @Value("${app.commerce.sandbox-payments-enabled:${GAMESTORE_PAY_ENABLED:true}}") boolean sandboxPayments) {
        this.repository = repository; this.demoTopups = demoTopups; this.sandboxPayments=sandboxPayments;
    }
    public CommerceService(CommerceRepository repository,boolean demoTopups) { this(repository,demoTopups,true); }
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
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public State state(Authentication authentication) {
        Account user = actor(authentication, true);
        repository.expireCheckouts(user.id());
        return new State(view(user), repository.publicUsers(user), repository.games(user), repository.promotions(),
            repository.transactions(user.id()), repository.ownerships(user.id()), repository.reviews(user),
            repository.wishlist(user.id()), new Capabilities(demoTopups,sandboxPayments,sandboxPayments && demoTopups,sandboxPayments && demoTopups), repository.library(user.id()),repository.checkoutSummaries(user.id()));
    }
    private void requireSandboxPayments() {
        if(!sandboxPayments) throw new CommerceException(SERVICE_UNAVAILABLE,"GameStore Pay đang tạm ngừng. Vui lòng dùng phương thức thanh toán khác.");
    }
    @Transactional
    public Checkout createCheckout(Authentication auth,CheckoutRequest input,UUID key) {
        requireSandboxPayments();
        Account user=actor(auth,false);
        return repository.checkout(user.id(),repository.createCheckout(user.id(),input.game_id(),key,input.expected_amount()));
    }
    @Transactional
    public Checkout createTopUpCheckout(Authentication auth,BigDecimal amount,UUID key) {
        requireSandboxPayments(); requireTopUps();
        Account user=actor(auth,false);
        return repository.checkout(user.id(),repository.createTopUpCheckout(user.id(),key,depositAmount(amount)));
    }
    @Transactional
    public Checkout checkout(Authentication auth,UUID id) {
        Account user=actor(auth,false);
        repository.resolveCheckout(user.id(),id,"READ",null,null,null,null);
        return repository.checkout(user.id(),id);
    }
    @Transactional
    public Checkout cancelCheckout(Authentication auth,UUID id) {
        Account user=actor(auth,false);
        repository.resolveCheckout(user.id(),id,"CANCEL",null,null,null,null);
        return repository.checkout(user.id(),id);
    }
    @Transactional
    public Checkout confirmCheckout(Authentication auth,UUID id,ConfirmCheckoutRequest input) {
        requireSandboxPayments();
        Account user=actor(auth,false);
        if(repository.isWithdrawalCheckout(user.id(),id)) {
            if (!demoTopups) throw new CommerceException(SERVICE_UNAVAILABLE,"Rút tiền Sandbox đang tạm ngừng.");
            if (!"BANK".equals(input.method())) throw new CommerceException(BAD_REQUEST,"Chọn tài khoản ngân hàng nhận tiền.");
            repository.confirmWithdrawal(user.id(),id,input.bank(),input.recipient_account());
            return repository.checkout(user.id(),id);
        }
        if(repository.isTopUpCheckout(user.id(),id)) requireTopUps();
        UUID qr=null;
        if("CARD".equals(input.method())) {
            if(input.card_number()==null || !Set.of("4242424242424242","4000000000000002").contains(input.card_number()) || input.expiry()==null || !input.expiry().matches("(0[1-9]|1[0-2])/[0-9]{2}") || input.cvv()==null || !input.cvv().matches("[0-9]{3,4}"))
                throw new CommerceException(BAD_REQUEST,"Vui lòng dùng thẻ thử nghiệm và nhập đúng hạn thẻ MM/YY, CVV.");
            YearMonth expiry=YearMonth.of(2000+Integer.parseInt(input.expiry().substring(3)),Integer.parseInt(input.expiry().substring(0,2)));
            if(expiry.isBefore(YearMonth.now(ZoneId.of("Asia/Ho_Chi_Minh")))) throw new CommerceException(BAD_REQUEST,"Thẻ thử nghiệm đã hết hạn.");
        } else if("QR".equals(input.method())) {
            try { qr=UUID.fromString(input.qr_code()); }
            catch(IllegalArgumentException|NullPointerException invalid) { throw new CommerceException(BAD_REQUEST,"Mã xác nhận QR không hợp lệ."); }
        }
        repository.resolveCheckout(user.id(),id,"CONFIRM",input.method(),input.bank(),input.card_number(),qr);
        return repository.checkout(user.id(),id);
    }
    @Transactional(readOnly = true)
    public AccountView wallet(Authentication authentication) { return view(actor(authentication, false)); }
    @Transactional
    public Checkout withdraw(Authentication authentication, BigDecimal amount, UUID key) {
        Account user = actor(authentication, false);
        if (!Set.of("DEVELOPER", "ADMINISTRATOR").contains(user.role()))
            throw new CommerceException(FORBIDDEN, "Bạn không có quyền rút tiền.");
        if (!sandboxPayments || !demoTopups)
            throw new CommerceException(SERVICE_UNAVAILABLE, "Rút tiền Sandbox đang tạm ngừng.");
        return repository.checkout(user.id(), repository.createWithdrawalCheckout(user.id(), depositAmount(amount), key));
    }
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public LibraryData library(Authentication authentication) { return repository.library(actor(authentication, false).id()); }
    private String collectionName(String name) {
        if (name == null || name.isBlank() || name.strip().length() > 80)
            throw new CommerceException(BAD_REQUEST, "Tên bộ sưu tập cần từ 1 đến 80 ký tự.");
        return name.strip();
    }
    @Transactional
    public LibraryCollection createCollection(Authentication auth, String name) {
        Account user = actor(auth, false);
        return repository.createCollection(user.id(), collectionName(name));
    }
    @Transactional
    public LibraryCollection renameCollection(Authentication auth, UUID collection, String name) {
        Account user = actor(auth, false);
        String value = collectionName(name);
        repository.renameCollection(user.id(), collection, value);
        return new LibraryCollection(collection, value);
    }
    @Transactional
    public void deleteCollection(Authentication auth, UUID collection) {
        Account user = actor(auth, false);
        repository.deleteCollection(user.id(), collection);
    }
    @Transactional
    public void collectionGame(Authentication auth, UUID collection, UUID game, boolean add) {
        Account user = actor(auth, false);
        if (add) repository.addCollectionGame(user.id(), collection, game);
        else repository.removeCollectionGame(user.id(), collection, game);
    }
    @Transactional
    public void saveLibraryPreference(Authentication auth, UUID game, String note, Boolean hidden) {
        Account user = actor(auth, false);
        if (note == null || note.length() > 2000 || hidden == null) throw new CommerceException(BAD_REQUEST, "Ghi chú tối đa 2.000 ký tự và cần trạng thái ẩn/hiện hợp lệ.");
        repository.saveLibraryPreference(user.id(), game, note.strip(), hidden);
    }
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public TransactionPage history(Authentication authentication, String type, String status, int page, int size, String sort) {
        Account user = actor(authentication, true);
        if (page < 0 || size < 1 || size > 100 || type != null && !Set.of("IN", "OUT", "BUY").contains(type)
            || status != null && !Set.of("PENDING", "SUCCESSED", "FAILED").contains(status)
            || !Set.of("newest", "oldest", "amount").contains(sort)) throw new CommerceException(BAD_REQUEST, "Bộ lọc hoặc phân trang không hợp lệ.");
        repository.expireCheckouts(user.id());
        return repository.transactionPage(user.id(), type, status, page, size, sort);
    }
    private void requireTopUps() {
        if (!demoTopups) throw new CommerceException(SERVICE_UNAVAILABLE, "Nạp tiền mô phỏng đang tắt trên máy chủ.");
    }
    private static BigDecimal depositAmount(BigDecimal amount) {
        if (amount == null || amount.signum() <= 0 || amount.compareTo(new BigDecimal("100000000")) > 0 || amount.scale() > 2)
            throw new CommerceException(BAD_REQUEST, "Số tiền phải lớn hơn 0, không quá 100.000.000 VND và tối đa 2 chữ số thập phân.");
        return amount.setScale(2);
    }
    @Transactional
    public TopUpChallenge createTopUpChallenge(Authentication authentication, BigDecimal amount) {
        requireTopUps();
        Account user = actor(authentication, true);
        return topUps.create(user.id(), depositAmount(amount));
    }
    @Transactional
    public Transaction deposit(Authentication authentication, BigDecimal amount, UUID key, UUID challengeId, String code) {
        requireTopUps();
        Account user = actor(authentication, true);
        BigDecimal value = depositAmount(amount);
        if (key == null || challengeId == null || !key.equals(challengeId) || code == null || code.isBlank() || code.length() > 32)
            throw new CommerceException(BAD_REQUEST, "Cần mã xác nhận và đúng yêu cầu QR để nạp tiền.");
        Optional<Transaction> previous = repository.byRequest(user.id(), key);
        if (previous.isPresent()) {
            Transaction transaction = previous.get();
            if (!transaction.type().equals("IN") || value.compareTo(new BigDecimal(transaction.amount())) != 0)
                throw new CommerceException(CONFLICT, "Mã yêu cầu đã dùng cho một giao dịch khác.");
            return transaction;
        }
        topUps.verify(user.id(), value, challengeId, code);
        return repository.depositWallet(user.id(), value, key);
    }
    @Transactional
    public Transaction purchase(Authentication authentication, UUID gameId, UUID key, BigDecimal expectedAmount) {
        Account user = actor(authentication, false);
        return repository.purchaseGame(user.id(), gameId, key, expectedAmount);
    }
    public static BigDecimal effectivePrice(BigDecimal price, Promotion promotion) {
        if (promotion == null || !promotion.status().equals("ENABLED")) return price.setScale(2, RoundingMode.HALF_UP);
        return price.multiply(BigDecimal.ONE.subtract(new BigDecimal(promotion.discount()).movePointLeft(2))).setScale(2, RoundingMode.HALF_UP);
    }
    @Transactional
    public Review saveReview(Authentication authentication, UUID gameId, BigDecimal rating, String content) {
        Account user = actor(authentication, false);
        return repository.saveReview(user.id(), gameId, rating, content == null ? null : content.strip());
    }
    @Transactional
    public void deleteReview(Authentication authentication, UUID reviewId) {
        Account user = actor(authentication, false);
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
        if (!game.status().equals("AVAILABLE") && !repository.owns(user.id(), gameId))
            throw new CommerceException(CONFLICT, "Trò chơi hiện chưa mở bán.");
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
            to == null ? null : to.plusDays(1).atStartOfDay(zone).toOffsetDateTime());
    }
    @Transactional(readOnly=true)
    public List<PublicationFee> publicationFees(Authentication authentication, LocalDate from, LocalDate to) {
        Account user=actor(authentication,false);
        if(!Set.of("DEVELOPER","ADMINISTRATOR").contains(user.role())) throw new CommerceException(FORBIDDEN,"Bạn không có quyền xem doanh thu.");
        if(from!=null && to!=null && from.isAfter(to)) throw new CommerceException(BAD_REQUEST,"Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.");
        ZoneId zone=ZoneId.of("Asia/Ho_Chi_Minh");
        return repository.publicationFees(user,from==null?null:from.atStartOfDay(zone).toOffsetDateTime(),to==null?null:to.plusDays(1).atStartOfDay(zone).toOffsetDateTime());
    }
}
