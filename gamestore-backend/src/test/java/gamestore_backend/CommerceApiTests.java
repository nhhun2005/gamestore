package gamestore_backend;

import static org.junit.jupiter.api.Assertions.*;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.*;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@ContextConfiguration(initializers = TestDatabaseGuard.class)
class CommerceApiTests {
    @Value("${local.server.port}") int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactionManager;
    private final ObjectMapper json = new ObjectMapper();
    private final HttpClient http = HttpClient.newHttpClient();
    record Login(UUID id, String token, String username) {}
    Login buyer, developer, admin;
    UUID game, freeGame, hiddenGame, foreignGame;
    @BeforeEach void fixtures() throws Exception {
        buyer = account("USER"); developer = account("DEVELOPER"); admin = account("ADMINISTRATOR");
        jdbc.update("UPDATE users SET balance=100000 WHERE id=?", buyer.id());
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            UUID promotion = jdbc.queryForObject("INSERT INTO promotions(name,discount,status) VALUES ('Test discount',12.5,'ENABLED') RETURNING id", UUID.class);
            game = game(developer.id(), "Paid test", "200000", "AVAILABLE", promotion);
            freeGame = game(admin.id(), "Free test", "0", "AVAILABLE", null);
            hiddenGame = game(developer.id(), "Hidden test", "5000", "HIDDEN", null);
            foreignGame = game(admin.id(), "Other developer", "50000", "AVAILABLE", null);
        });
    }
    UUID game(UUID developerId, String title, String price, String status, UUID promo) {
        UUID id = jdbc.queryForObject("INSERT INTO games(developer_id,title,price,status,promotion_id) VALUES (?,?,?,?,?) RETURNING id",
            UUID.class, developerId, title, new BigDecimal(price), status, promo);
        jdbc.update("INSERT INTO game_submissions(game_id,submitted_by) VALUES (?,?)", id, developerId);
        return id;
    }
    Login account(String role) throws Exception {
        String username = "api-" + UUID.randomUUID();
        HttpResponse<String> response = send("POST", "/api/auth/register", null,
            "{\"username\":\"" + username + "\",\"email\":\"" + username + "@example.test\",\"password\":\"test-password\"}", null);
        assertEquals(201, response.statusCode(), response.body());
        JsonNode data = json.readTree(response.body());
        UUID id = UUID.fromString(data.path("id").asText());
        jdbc.update("UPDATE users SET role=? WHERE id=?", role, id);
        response = send("POST", "/api/auth/login", null, "{\"account\":\"" + username + "\",\"password\":\"test-password\"}", null);
        assertEquals(200, response.statusCode(), response.body());
        return new Login(id, json.readTree(response.body()).path("token").asText(), username);
    }
    HttpRequest request(String method, String path, Login user, String body, UUID key) {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path));
        if (user != null) builder.header("Authorization", "Bearer " + user.token());
        if (key != null) builder.header("Idempotency-Key", key.toString());
        if (body != null) builder.header("Content-Type", "application/json");
        return builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body)).build();
    }
    HttpResponse<String> send(String method, String path, Login user, String body, UUID key) throws Exception {
        return http.send(request(method, path, user, body, key), HttpResponse.BodyHandlers.ofString());
    }
    JsonNode tree(HttpResponse<String> response, int expected) throws Exception {
        assertEquals(expected, response.statusCode(), response.body());
        return json.readTree(response.body());
    }
    String buy(UUID gameId) { return "{\"game_id\":\"" + gameId + "\"}"; }
    void fund() throws Exception { tree(send("POST", "/api/commerce/wallet/demo-topups", buyer, "{\"amount\":\"500000\"}", UUID.randomUUID()), 201); }
    @Test void realWalletPurchaseReviewAndHistoryRemainConsistent() throws Exception {
        fund();
        JsonNode transaction = tree(send("POST", "/api/commerce/purchases", buyer, buy(game), UUID.randomUUID()), 201);
        assertEquals("175000.00", transaction.path("amount").asText());
        JsonNode state = tree(send("GET", "/api/commerce/state", buyer, null, null), 200);
        assertEquals("425000.00", state.path("current_user").path("balance").asText());
        assertEquals(1, state.path("game_bought").size());
        assertEquals(transaction.path("id").asText(), state.path("game_bought").get(0).path("transaction_id").asText());
        JsonNode review = tree(send("PUT", "/api/commerce/games/" + game + "/review", buyer, "{\"rating\":4.5,\"content\":\"Great game\"}", null), 200);
        tree(send("PUT", "/api/commerce/games/" + game + "/review", buyer, "{\"rating\":3.5,\"content\":\"Updated review\"}", null), 200);
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM reviews WHERE game_id=? AND user_id=?", Integer.class, game, buyer.id()));
        assertEquals(0, new BigDecimal("3.5").compareTo(jdbc.queryForObject("SELECT rating FROM games WHERE id=?", BigDecimal.class, game)));
        assertEquals(204, send("DELETE", "/api/commerce/reviews/" + review.path("id").asText(), buyer, null, null).statusCode());
        assertNull(jdbc.queryForObject("SELECT rating FROM games WHERE id=?", BigDecimal.class, game));
        JsonNode history = tree(send("GET", "/api/commerce/transactions?type=BUY&status=SUCCESSED&size=1&sort=amount", buyer, null, null), 200);
        assertEquals(1, history.path("total").asInt());
        assertEquals("BUY", history.path("items").get(0).path("type").asText());
    }
    @Test void retryKeysAreIdempotentAndCannotBeReusedForDifferentInputs() throws Exception {
        UUID key = UUID.randomUUID();
        String path = "/api/commerce/wallet/demo-topups";
        JsonNode first = tree(send("POST", path, buyer, "{\"amount\":500000}", key), 201);
        JsonNode second = tree(send("POST", path, buyer, "{\"amount\":500000}", key), 201);
        assertEquals(first.path("id"), second.path("id"));
        assertEquals(409, send("POST", path, buyer, "{\"amount\":200000}", key).statusCode());
        assertEquals(409, send("POST", "/api/commerce/purchases", buyer, buy(game), key).statusCode());
        UUID purchaseKey = UUID.randomUUID();
        first = tree(send("POST", "/api/commerce/purchases", buyer, buy(game), purchaseKey), 201);
        second = tree(send("POST", "/api/commerce/purchases", buyer, buy(game), purchaseKey), 201);
        assertEquals(first.path("id"), second.path("id"));
        assertEquals(0, new BigDecimal("425000").compareTo(jdbc.queryForObject("SELECT balance FROM users WHERE id=?", BigDecimal.class, buyer.id())));
    }
    @Test void concurrentDuplicatePurchasesDebitOnce() throws Exception {
        fund();
        var a = http.sendAsync(request("POST", "/api/commerce/purchases", buyer, buy(game), UUID.randomUUID()), HttpResponse.BodyHandlers.ofString());
        var b = http.sendAsync(request("POST", "/api/commerce/purchases", buyer, buy(game), UUID.randomUUID()), HttpResponse.BodyHandlers.ofString());
        CompletableFuture.allOf(a,b).join();
        assertEquals(Set.of(201,409), Set.of(a.join().statusCode(), b.join().statusCode()));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM game_bought WHERE user_id=? AND game_id=?", Integer.class, buyer.id(), game));
        assertEquals(0, new BigDecimal("425000").compareTo(jdbc.queryForObject("SELECT balance FROM users WHERE id=?", BigDecimal.class, buyer.id())));
    }
    @Test void invalidDepositsUnavailableInsufficientFreeAndUnownedReviewAreHandled() throws Exception {
        for (String amount : List.of("0", "-1", "0.001", "100000001"))
            assertEquals(400, send("POST", "/api/commerce/wallet/demo-topups", buyer, "{\"amount\":" + amount + "}", UUID.randomUUID()).statusCode());
        assertEquals(400, send("POST", "/api/commerce/wallet/demo-topups", buyer, "{\"amount\":100}", null).statusCode());
        assertEquals(402, send("POST", "/api/commerce/purchases", buyer, buy(game), UUID.randomUUID()).statusCode());
        assertEquals(409, send("POST", "/api/commerce/purchases", buyer, buy(hiddenGame), UUID.randomUUID()).statusCode());
        assertEquals(404, send("POST", "/api/commerce/purchases", buyer, buy(UUID.randomUUID()), UUID.randomUUID()).statusCode());
        assertEquals(403, send("PUT", "/api/commerce/games/" + game + "/review", buyer, "{\"rating\":4,\"content\":\"No ownership\"}", null).statusCode());
        tree(send("POST", "/api/commerce/purchases", buyer, buy(freeGame), UUID.randomUUID()), 201);
        assertEquals(409, send("POST", "/api/commerce/purchases", buyer, buy(freeGame), UUID.randomUUID()).statusCode());
        for (String rating : List.of("0", "1.49", "5.5"))
            assertEquals(400, send("PUT", "/api/commerce/games/" + freeGame + "/review", buyer, "{\"rating\":" + rating + ",\"content\":\"Invalid\"}", null).statusCode());
        JsonNode review = tree(send("PUT", "/api/commerce/games/" + freeGame + "/review", buyer, "{\"rating\":5,\"content\":\"Free game\"}", null), 200);
        assertEquals(404, send("DELETE", "/api/commerce/reviews/" + review.path("id").asText(), developer, null, null).statusCode());
        assertEquals(0, new BigDecimal("100000").compareTo(jdbc.queryForObject("SELECT balance FROM users WHERE id=?", BigDecimal.class, buyer.id())));
    }
    @Test void simultaneousRetriesWithOneKeyReturnTheSameTransaction() throws Exception {
        fund();
        UUID key = UUID.randomUUID();
        var a = http.sendAsync(request("POST", "/api/commerce/purchases", buyer, buy(game), key), HttpResponse.BodyHandlers.ofString());
        var b = http.sendAsync(request("POST", "/api/commerce/purchases", buyer, buy(game), key), HttpResponse.BodyHandlers.ofString());
        CompletableFuture.allOf(a,b).join();
        assertEquals(tree(a.join(), 201).path("id"), tree(b.join(), 201).path("id"));
        assertEquals(0, new BigDecimal("425000").compareTo(jdbc.queryForObject("SELECT balance FROM users WHERE id=?", BigDecimal.class, buyer.id())));
    }
    @Test void aChangedCheckoutQuoteCannotChargeAnUnexpectedAmount() throws Exception {
        fund();
        assertEquals(409, send("POST", "/api/commerce/purchases", buyer,
            "{\"game_id\":\"" + game + "\",\"expected_amount\":200000}", UUID.randomUUID()).statusCode());
        assertEquals(0, new BigDecimal("600000").compareTo(jdbc.queryForObject("SELECT balance FROM users WHERE id=?", BigDecimal.class, buyer.id())));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM game_bought WHERE user_id=?", Integer.class, buyer.id()));
    }
    @Test void simultaneousDifferentPurchasesCannotOverdrawTheWallet() throws Exception {
        jdbc.update("UPDATE users SET balance=200000 WHERE id=?", buyer.id());
        var a = http.sendAsync(request("POST", "/api/commerce/purchases", buyer, buy(game), UUID.randomUUID()), HttpResponse.BodyHandlers.ofString());
        var b = http.sendAsync(request("POST", "/api/commerce/purchases", buyer, buy(foreignGame), UUID.randomUUID()), HttpResponse.BodyHandlers.ofString());
        CompletableFuture.allOf(a,b).join();
        assertEquals(Set.of(201,402), Set.of(a.join().statusCode(), b.join().statusCode()));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM game_bought WHERE user_id=?", Integer.class, buyer.id()));
        assertTrue(jdbc.queryForObject("SELECT balance FROM users WHERE id=?", BigDecimal.class, buyer.id()).signum() >= 0);
    }
    @Test void revenueUsesDatabaseRoleDeveloperScopeAndHistoricalAmounts() throws Exception {
        fund();
        tree(send("POST", "/api/commerce/purchases", buyer, buy(game), UUID.randomUUID()), 201);
        tree(send("POST", "/api/commerce/purchases", buyer, buy(foreignGame), UUID.randomUUID()), 201);
        jdbc.update("UPDATE games SET price=999999 WHERE id=?", game);
        assertEquals(403, send("GET", "/api/commerce/revenue", buyer, null, null).statusCode());
        JsonNode rows = tree(send("GET", "/api/commerce/revenue?developer_id=" + admin.id(), developer, null, null), 200);
        assertEquals(1, rows.size());
        assertEquals("175000.00", rows.get(0).path("amount").asText());
        rows = tree(send("GET", "/api/commerce/revenue?from=2099-01-01", developer, null, null), 200);
        assertEquals(0, rows.size());
        assertEquals(400, send("GET", "/api/commerce/revenue?from=2026-12-01&to=2026-01-01", developer, null, null).statusCode());
        rows = tree(send("GET", "/api/commerce/revenue", admin, null, null), 200);
        assertTrue(rows.size() >= 2); // Other test fixtures are isolated users in the same test database.
        for (JsonNode row : rows) assertEquals("BUY", row.path("type").asText());
        jdbc.update("UPDATE users SET role='USER' WHERE id=?", developer.id());
        assertEquals(403, send("GET", "/api/commerce/revenue", developer, null, null).statusCode());
    }
    @Test void authenticationBannedUsersAndPrivateDataAreEnforced() throws Exception {
        assertEquals(401, send("GET", "/api/commerce/state", null, null, null).statusCode());
        Login forged = new Login(buyer.id(), "invalid.token.signature", buyer.username());
        assertEquals(401, send("GET", "/api/commerce/state", forged, null, null).statusCode());
        JsonNode state = tree(send("GET", "/api/commerce/state?user_id=" + admin.id(), buyer, null, null), 200);
        assertEquals(buyer.id().toString(), state.path("current_user").path("id").asText());
        for (JsonNode user : state.path("users")) { assertFalse(user.has("balance")); assertFalse(user.has("email")); assertFalse(user.has("password")); }
        for (JsonNode item : state.path("games")) assertNotEquals(hiddenGame.toString(), item.path("id").asText());
        jdbc.update("UPDATE users SET status='BANNED' WHERE id=?", buyer.id());
        assertEquals(403, send("GET", "/api/commerce/state", buyer, null, null).statusCode());
        assertEquals(403, send("POST", "/api/auth/login", null, "{\"account\":\"" + buyer.username() + "\",\"password\":\"test-password\"}", null).statusCode());
    }
}
