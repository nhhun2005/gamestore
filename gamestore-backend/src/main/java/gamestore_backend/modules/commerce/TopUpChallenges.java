package gamestore_backend.modules.commerce;

import static org.springframework.http.HttpStatus.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/** Short-lived, per-process simulation challenges; no schema or pending transactions needed. */
final class TopUpChallenges {
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final Duration LIFETIME = Duration.ofMinutes(10);
    private static final int MAX_ATTEMPTS = 5;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();
    private final Map<UUID, Pending> active = new HashMap<>();
    private static final class Pending {
        final CommerceDtos.TopUpChallenge challenge;
        int attempts;
        Pending(CommerceDtos.TopUpChallenge challenge) { this.challenge = challenge; }
    }

    TopUpChallenges() { this(Clock.systemUTC()); }
    TopUpChallenges(Clock clock) { this.clock = clock; }

    synchronized CommerceDtos.TopUpChallenge create(UUID user, BigDecimal amount) {
        Instant now = clock.instant();
        active.values().removeIf(p -> !Instant.parse(p.challenge.expires_at()).isAfter(now));
        StringBuilder code = new StringBuilder("GS-");
        for (int i = 0; i < 8; i++) {
            if (i == 4) code.append('-');
            code.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        var result = new CommerceDtos.TopUpChallenge(UUID.randomUUID(), amount.setScale(2).toPlainString(),
            code.toString(), now.plus(LIFETIME).toString());
        active.put(user, new Pending(result)); // A replacement QR invalidates the previous one for this account.
        return result;
    }

    synchronized void verify(UUID user, BigDecimal amount, UUID challengeId, String suppliedCode) {
        Pending pending = active.get(user);
        if (pending == null || !pending.challenge.challenge_id().equals(challengeId))
            throw new CommerceException(GONE, "Mã QR không còn hiệu lực. Vui lòng tạo QR mới.");
        if (!Instant.parse(pending.challenge.expires_at()).isAfter(clock.instant())) {
            active.remove(user);
            throw new CommerceException(GONE, "Mã QR đã hết hạn. Vui lòng tạo QR mới.");
        }
        if (new BigDecimal(pending.challenge.amount()).compareTo(amount) != 0)
            throw new CommerceException(CONFLICT, "Số tiền không khớp với mã QR. Vui lòng tạo QR mới.");
        if (!MessageDigest.isEqual(normalize(pending.challenge.code()), normalize(suppliedCode))) {
            if (++pending.attempts >= MAX_ATTEMPTS) {
                active.remove(user);
                throw new CommerceException(GONE, "Đã nhập sai mã 5 lần. Vui lòng tạo QR mới.");
            }
            throw new CommerceException(BAD_REQUEST, "Mã xác nhận không đúng. Vui lòng quét QR và nhập lại.");
        }
    }

    private static byte[] normalize(String code) {
        return (code == null ? "" : code.strip().replace("-", "").replace(" ", "").toUpperCase(Locale.ROOT))
            .getBytes(StandardCharsets.UTF_8);
    }
}
