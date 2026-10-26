package gamestore_backend;

import java.math.BigDecimal;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@org.springframework.test.context.ActiveProfiles("test")
@org.springframework.test.context.ContextConfiguration(initializers = TestDatabaseGuard.class)
@Transactional
class DatabaseRulesTests {
    @Autowired JdbcTemplate jdbc;
    UUID user;
    UUID game;

    @BeforeEach
    void fixture() {
        user = jdbc.queryForObject("INSERT INTO users(username,email,password) VALUES (?,?,?) RETURNING id",
                UUID.class, "test-" + UUID.randomUUID(), UUID.randomUUID() + "@example.test", "hashed-password-fixture");
        game = jdbc.queryForObject("INSERT INTO games(developer_id,title,price) VALUES (?,'Test game',100000) RETURNING id", UUID.class, user);
        jdbc.update("INSERT INTO game_submissions(game_id,submitted_by) VALUES (?,?)", game, user);
    }

    UUID buy(String status) {
        return jdbc.queryForObject("INSERT INTO transactions(user_id,game_id,type,amount,status) VALUES (?,?,'BUY',80000,?) RETURNING id",
                UUID.class, user, game, status);
    }

    @Test void successfulBuyGrantsOwnershipAndKeepsPurchaseAmount() {
        UUID transaction = buy("PENDING");
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM game_bought WHERE user_id=?", Integer.class, user));
        jdbc.update("UPDATE transactions SET status='SUCCESSED' WHERE id=?", transaction);
        assertEquals(transaction, jdbc.queryForObject("SELECT transaction_id FROM game_bought WHERE user_id=? AND game_id=?", UUID.class, user, game));
        assertEquals(0, new BigDecimal("80000").compareTo(jdbc.queryForObject("SELECT amount FROM transactions WHERE id=?", BigDecimal.class, transaction)));
    }

    @Test void rejectsReviewWithoutOwnership() {
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbc.update("INSERT INTO reviews(user_id,game_id,rating) VALUES (?,?,4.5)", user, game));
    }

    @ParameterizedTest
    @ValueSource(strings = {"0.1", "0.2", "0.5", "1.49", "4.99", "5.5"})
    void rejectsRatingsOutsideTheAllowedHalfSteps(String rating) {
        buy("SUCCESSED");
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbc.update("INSERT INTO reviews(user_id,game_id,rating) VALUES (?,?,?)", user, game, new BigDecimal(rating)));
    }

    @Test void permitsHalfStepAndRecomputesAverageOnUpdateAndDelete() {
        buy("SUCCESSED");
        UUID review = jdbc.queryForObject("INSERT INTO reviews(user_id,game_id,rating) VALUES (?,?,4.5) RETURNING id", UUID.class, user, game);
        assertEquals(0, new BigDecimal("4.5").compareTo(jdbc.queryForObject("SELECT rating FROM games WHERE id=?", BigDecimal.class, game)));
        jdbc.update("UPDATE reviews SET rating=3 WHERE id=?", review);
        assertEquals(0, new BigDecimal("3").compareTo(jdbc.queryForObject("SELECT rating FROM games WHERE id=?", BigDecimal.class, game)));
        jdbc.update("DELETE FROM reviews WHERE id=?", review);
        assertNull(jdbc.queryForObject("SELECT rating FROM games WHERE id=?", BigDecimal.class, game));
    }

    @Test void rejectsDuplicateReview() {
        buy("SUCCESSED");
        jdbc.update("INSERT INTO reviews(user_id,game_id,rating) VALUES (?,?,4)", user, game);
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbc.update("INSERT INTO reviews(user_id,game_id,rating) VALUES (?,?,5)", user, game));
    }

    @Test void rejectsRewritingSuccessfulPurchase() {
        UUID transaction = buy("SUCCESSED");
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbc.update("UPDATE transactions SET status='FAILED' WHERE id=?", transaction));
    }

    @Test void rejectsSuccessfulBuyTwice() {
        buy("SUCCESSED");
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class, () -> buy("SUCCESSED"));
    }

    @Test void allowsDepositWithoutGame() {
        jdbc.update("INSERT INTO transactions(user_id,type,amount,status) VALUES (?,'IN',100000,'SUCCESSED')", user);
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM game_bought WHERE user_id=?", Integer.class, user));
    }

    @Test void rejectsBuyWithoutGame() {
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbc.update("INSERT INTO transactions(user_id,type,amount) VALUES (?,'BUY',100000)", user));
    }

    @Test void allowsManySubmissionsButRequiresReviewerWhenDecided() {
        jdbc.update("INSERT INTO game_submissions(game_id,submitted_by) VALUES (?,?)", game, user);
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM game_submissions WHERE game_id=?", Integer.class, game));
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbc.update("UPDATE game_submissions SET status='ACCEPTED' WHERE game_id=?", game));
    }

    @Test void draftMayExistWithoutSubmission() {
        jdbc.update("DELETE FROM game_submissions WHERE game_id=?", game);
        assertDoesNotThrow(() -> jdbc.execute("SET CONSTRAINTS ALL IMMEDIATE"));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM game_submissions WHERE game_id=?", Integer.class, game));
    }

    @Test void usernameIsUniqueIgnoringCase() {
        String username = jdbc.queryForObject("SELECT username FROM users WHERE id=?", String.class, user);
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbc.update("INSERT INTO users(username,email,password) VALUES (?,?,'hash')", username.toUpperCase(), UUID.randomUUID() + "@example.test"));
    }

    @Test void emailIsUniqueIgnoringCase() {
        String email = jdbc.queryForObject("SELECT email FROM users WHERE id=?", String.class, user);
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbc.update("INSERT INTO users(username,email,password) VALUES (?,?,'hash')", UUID.randomUUID().toString(), email.toUpperCase()));
    }

    @Test void newGameIsHiddenAndNotificationIsUnread() {
        assertEquals("HIDDEN", jdbc.queryForObject("SELECT status FROM games WHERE id=?", String.class, game));
        UUID promo = jdbc.queryForObject("INSERT INTO promotions(name,discount) VALUES ('Test',20) RETURNING id", UUID.class);
        jdbc.update("INSERT INTO notifications(user_id,promotion_id,title,content) VALUES (?,?,'Sale','Test')", user, promo);
        assertEquals(false, jdbc.queryForObject("SELECT is_read FROM notifications WHERE user_id=?", Boolean.class, user));
    }

    @Test void rejectsDiscountOver100() {
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbc.update("INSERT INTO promotions(name,discount) VALUES ('Invalid',100.1)"));
    }
}
