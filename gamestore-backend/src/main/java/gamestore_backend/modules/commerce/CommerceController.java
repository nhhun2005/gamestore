package gamestore_backend.modules.commerce;

import static gamestore_backend.modules.commerce.CommerceDtos.*;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/commerce")
public class CommerceController {
    private final CommerceService service;
    public CommerceController(CommerceService service) { this.service = service; }
    @GetMapping("/state") public State state(Authentication auth) { return service.state(auth); }
    @GetMapping("/wallet") public AccountView wallet(Authentication auth) { return service.wallet(auth); }
    @PostMapping("/checkouts") @ResponseStatus(HttpStatus.CREATED)
    public Checkout createCheckout(Authentication auth,@Valid @RequestBody CheckoutRequest input,@RequestHeader("Idempotency-Key") UUID key) { return service.createCheckout(auth,input,key); }
    @PostMapping("/wallet/checkouts") @ResponseStatus(HttpStatus.CREATED)
    public Checkout createTopUpCheckout(Authentication auth,@Valid @RequestBody DepositRequest input,@RequestHeader("Idempotency-Key") UUID key) { return service.createTopUpCheckout(auth,input.amount(),key); }
    @GetMapping("/checkouts/{id}") public Checkout checkout(Authentication auth,@PathVariable UUID id) { return service.checkout(auth,id); }
    @PostMapping("/checkouts/{id}/confirm")
    public Checkout confirmCheckout(Authentication auth,@PathVariable UUID id,@Valid @RequestBody ConfirmCheckoutRequest input) { return service.confirmCheckout(auth,id,input); }
    @PostMapping("/checkouts/{id}/cancel")
    public Checkout cancelCheckout(Authentication auth,@PathVariable UUID id) { return service.cancelCheckout(auth,id); }
    @GetMapping("/library") public LibraryData library(Authentication auth) { return service.library(auth); }
    @PostMapping("/library/collections") @ResponseStatus(HttpStatus.CREATED)
    public LibraryCollection createCollection(Authentication auth, @Valid @RequestBody CollectionRequest request) {
        return service.createCollection(auth, request.name());
    }
    @PutMapping("/library/collections/{id}")
    public LibraryCollection renameCollection(Authentication auth, @PathVariable UUID id, @Valid @RequestBody CollectionRequest request) {
        return service.renameCollection(auth, id, request.name());
    }
    @DeleteMapping("/library/collections/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteCollection(Authentication auth, @PathVariable UUID id) { service.deleteCollection(auth, id); }
    @PutMapping("/library/collections/{id}/games/{gameId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void addCollectionGame(Authentication auth, @PathVariable UUID id, @PathVariable UUID gameId) { service.collectionGame(auth, id, gameId, true); }
    @DeleteMapping("/library/collections/{id}/games/{gameId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeCollectionGame(Authentication auth, @PathVariable UUID id, @PathVariable UUID gameId) { service.collectionGame(auth, id, gameId, false); }
    @PutMapping("/library/games/{gameId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void saveLibraryPreference(Authentication auth, @PathVariable UUID gameId, @Valid @RequestBody LibraryPreferenceRequest request) {
        service.saveLibraryPreference(auth, gameId, request.note(), request.hidden());
    }
    @GetMapping("/transactions")
    public TransactionPage transactions(Authentication auth, @RequestParam(required=false) String type,
        @RequestParam(required=false) String status, @RequestParam(defaultValue="0") int page,
        @RequestParam(defaultValue="20") int size, @RequestParam(defaultValue="newest") String sort) {
        return service.history(auth, type, status, page, size, sort);
    }
    @PostMapping("/wallet/demo-topups/challenges") @ResponseStatus(HttpStatus.CREATED)
    public TopUpChallenge topUpChallenge(Authentication auth, @Valid @RequestBody DepositRequest request) {
        return service.createTopUpChallenge(auth, request.amount());
    }
    @PostMapping("/wallet/demo-topups") @ResponseStatus(HttpStatus.CREATED)
    public Transaction deposit(Authentication auth, @Valid @RequestBody ConfirmDepositRequest request,
        @RequestHeader("Idempotency-Key") UUID key) {
        return service.deposit(auth, request.amount(), key, request.challenge_id(), request.code());
    }
    @PostMapping("/wallet/withdrawals") @ResponseStatus(HttpStatus.CREATED)
    public Checkout withdraw(Authentication auth, @Valid @RequestBody DepositRequest request,
        @RequestHeader("Idempotency-Key") UUID key) {
        return service.withdraw(auth, request.amount(), key);
    }
    @PostMapping("/purchases") @ResponseStatus(HttpStatus.CREATED)
    public Transaction purchase(Authentication auth, @Valid @RequestBody PurchaseRequest request,
        @RequestHeader("Idempotency-Key") UUID key) { return service.purchase(auth, request.game_id(), key, request.expected_amount()); }
    @PutMapping("/games/{gameId}/review")
    public Review review(Authentication auth, @PathVariable UUID gameId, @Valid @RequestBody ReviewRequest request) {
        return service.saveReview(auth, gameId, request.rating(), request.content());
    }
    @DeleteMapping("/reviews/{reviewId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteReview(Authentication auth, @PathVariable UUID reviewId) { service.deleteReview(auth, reviewId); }
    @GetMapping("/revenue")
    public List<RevenueSale> revenue(Authentication auth, @RequestParam(required=false) LocalDate from,
        @RequestParam(required=false) LocalDate to) { return service.revenue(auth, from, to); }
    @GetMapping("/revenue/fees")
    public List<PublicationFee> publicationFees(Authentication auth, @RequestParam(required=false) LocalDate from,
        @RequestParam(required=false) LocalDate to) { return service.publicationFees(auth,from,to); }

    @GetMapping("/wishlist")
    public List<WishlistEntry> wishlist(Authentication auth) {
        return service.wishlist(auth);
    }
    @PostMapping("/wishlist/{gameId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void addWishlist(Authentication auth, @PathVariable UUID gameId) {
        service.addWishlist(auth, gameId);
    }
    @DeleteMapping("/wishlist/{gameId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeWishlist(Authentication auth, @PathVariable UUID gameId) {
        service.removeWishlist(auth, gameId);
    }

    @GetMapping("/notifications")
    public NotificationSummary notifications(Authentication auth) {
        return service.notifications(auth);
    }
    @PutMapping("/notifications/{id}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markNotificationRead(Authentication auth, @PathVariable UUID id) {
        service.markNotificationRead(auth, id);
    }
    @PutMapping("/notifications/read-all")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markAllNotificationsRead(Authentication auth) {
        service.markAllNotificationsRead(auth);
    }
}
