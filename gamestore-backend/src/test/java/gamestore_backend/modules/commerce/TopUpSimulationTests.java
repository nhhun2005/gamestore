package gamestore_backend.modules.commerce;

import static gamestore_backend.modules.commerce.CommerceDtos.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

class TopUpSimulationTests {
    private final UUID user = UUID.randomUUID();
    private final BigDecimal amount = new BigDecimal("500000.00");
    private static final class MutableClock extends Clock {
        Instant time = Instant.parse("2026-11-10T00:00:00Z");
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return time; }
    }
    private static CommerceException fails(Runnable operation, int status) {
        var error = assertThrows(CommerceException.class, operation::run);
        assertEquals(status, error.status().value());
        return error;
    }

    @Test void qrIsRandomBoundToOwnerAndAmountAndSupportsManualCodeFormatting() {
        var challenges = new TopUpChallenges();
        var first = challenges.create(user, amount);
        assertTrue(first.code().matches("GS-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}"));
        assertEquals("500000.00", first.amount());
        challenges.verify(user, amount, first.challenge_id(), first.code().toLowerCase(Locale.ROOT).replace('-', ' '));
        fails(() -> challenges.verify(UUID.randomUUID(), amount, first.challenge_id(), first.code()), 410);
        fails(() -> challenges.verify(user, BigDecimal.ONE, first.challenge_id(), first.code()), 409);
        var second = challenges.create(user, amount);
        assertNotEquals(first.challenge_id(), second.challenge_id());
        fails(() -> challenges.verify(user, amount, first.challenge_id(), first.code()), 410);
        challenges.verify(user, amount, second.challenge_id(), second.code());
    }

    @Test void expiryAndTooManyWrongAttemptsRequireNewQr() {
        var clock = new MutableClock();
        var challenges = new TopUpChallenges(clock);
        var qr = challenges.create(user, amount);
        assertEquals(clock.instant().plusSeconds(600).toString(), qr.expires_at());
        clock.time = clock.time.plusSeconds(600);
        fails(() -> challenges.verify(user, amount, qr.challenge_id(), qr.code()), 410);
        var fresh = challenges.create(user, amount);
        for (int i = 0; i < 4; i++) fails(() -> challenges.verify(user, amount, fresh.challenge_id(), "WRONG"), 400);
        fails(() -> challenges.verify(user, amount, fresh.challenge_id(), "WRONG"), 410);
        fails(() -> challenges.verify(user, amount, fresh.challenge_id(), fresh.code()), 410);
    }

    private static final class Fixture {
        final CommerceRepository repository = mock(CommerceRepository.class);
        final CommerceService service = new CommerceService(repository, true);
        final UUID user = UUID.randomUUID();
        final AtomicReference<Account> account = new AtomicReference<>(new Account(user, "player", "", "USER", "VERIFIED", new BigDecimal("100000.00")));
        final Map<UUID, Transaction> receipts = new HashMap<>();
        final UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken("player", "", List.of());
        Fixture() {
            when(repository.account(eq("player"), anyBoolean())).thenAnswer(inv -> Optional.of(account.get()));
            when(repository.byRequest(eq(user), any(UUID.class))).thenAnswer(inv -> Optional.ofNullable(receipts.get(inv.getArgument(1))));
            doAnswer(inv -> {
                Account a = account.get();
                account.set(new Account(user, a.username(), a.email(), a.role(), a.status(), inv.getArgument(1)));
                return null;
            }).when(repository).balance(eq(user), any(BigDecimal.class));
            when(repository.record(eq(user), isNull(), eq("IN"), any(BigDecimal.class), any(UUID.class))).thenAnswer(inv -> {
                UUID key = inv.getArgument(4);
                var row = new Transaction(UUID.randomUUID(), user, null, "IN", ((BigDecimal)inv.getArgument(3)).toPlainString(), "SUCCESSED", Instant.now().toString(), key);
                receipts.put(key, row);
                return row;
            });
        }
    }

    @Test void creatingAndRejectingQrNeverCreditsWallet() {
        var f = new Fixture();
        var qr = f.service.createTopUpChallenge(f.auth, amount);
        verify(f.repository, never()).balance(any(), any());
        verify(f.repository, never()).record(any(), any(), any(), any(), any());
        fails(() -> f.service.deposit(f.auth, amount, qr.challenge_id(), null, null), 400);
        fails(() -> f.service.deposit(f.auth, amount, UUID.randomUUID(), qr.challenge_id(), qr.code()), 400);
        fails(() -> f.service.deposit(f.auth, amount, qr.challenge_id(), qr.challenge_id(), "INCORRECT"), 400);
        fails(() -> f.service.deposit(f.auth, BigDecimal.ONE, qr.challenge_id(), qr.challenge_id(), qr.code()), 409);
        verify(f.repository, never()).balance(any(), any());
        assertEquals(new BigDecimal("100000.00"), f.account.get().balance());
    }

    @Test void correctCodeCreditsOnceAndRetryReturnsOriginalReceiptEvenAfterRegeneration() {
        var f = new Fixture();
        var qr = f.service.createTopUpChallenge(f.auth, amount);
        var first = f.service.deposit(f.auth, amount, qr.challenge_id(), qr.challenge_id(), qr.code());
        f.service.createTopUpChallenge(f.auth, BigDecimal.TEN);
        var retry = f.service.deposit(f.auth, amount, qr.challenge_id(), qr.challenge_id(), qr.code());
        assertEquals(first.id(), retry.id());
        assertEquals(new BigDecimal("600000.00"), f.account.get().balance());
        verify(f.repository, times(1)).balance(eq(f.user), any());
        fails(() -> f.service.deposit(f.auth, BigDecimal.TEN, qr.challenge_id(), qr.challenge_id(), qr.code()), 409);
    }

    @Test void replacedQrCannotCreditAndCurrentAccountStatusIsRequired() {
        var f = new Fixture();
        var old = f.service.createTopUpChallenge(f.auth, amount);
        f.service.createTopUpChallenge(f.auth, amount);
        fails(() -> f.service.deposit(f.auth, amount, old.challenge_id(), old.challenge_id(), old.code()), 410);
        Account a = f.account.get();
        f.account.set(new Account(a.id(), a.username(), a.email(), a.role(), "BANNED", a.balance()));
        fails(() -> f.service.createTopUpChallenge(f.auth, amount), 403);
        fails(() -> f.service.deposit(f.auth, amount, old.challenge_id(), old.challenge_id(), old.code()), 403);
        verify(f.repository, never()).balance(any(), any());
    }

    @Test void disabledInvalidAndUnauthenticatedRequestsAreRejectedWithoutCredit() {
        var f = new Fixture();
        fails(() -> new CommerceService(f.repository, false).createTopUpChallenge(f.auth, amount), 503);
        fails(() -> f.service.createTopUpChallenge(null, amount), 401);
        for (var value : List.of(BigDecimal.ZERO, new BigDecimal("-1"), new BigDecimal("0.001"), new BigDecimal("100000001")))
            fails(() -> f.service.createTopUpChallenge(f.auth, value), 400);
        verify(f.repository, never()).balance(any(), any());
    }
}
