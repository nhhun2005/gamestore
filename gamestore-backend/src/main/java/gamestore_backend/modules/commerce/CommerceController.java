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
    @GetMapping("/transactions")
    public TransactionPage transactions(Authentication auth, @RequestParam(required=false) String type,
        @RequestParam(required=false) String status, @RequestParam(defaultValue="0") int page,
        @RequestParam(defaultValue="20") int size, @RequestParam(defaultValue="newest") String sort) {
        return service.history(auth, type, status, page, size, sort);
    }
    @PostMapping("/wallet/demo-topups") @ResponseStatus(HttpStatus.CREATED)
    public Transaction deposit(Authentication auth, @Valid @RequestBody DepositRequest request,
        @RequestHeader("Idempotency-Key") UUID key) { return service.deposit(auth, request.amount(), key); }
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
}
