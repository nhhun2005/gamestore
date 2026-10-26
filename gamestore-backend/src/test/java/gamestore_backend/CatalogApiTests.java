package gamestore_backend;

import static org.junit.jupiter.api.Assertions.*;
import java.net.URI;
import java.net.http.*;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import gamestore_backend.modules.config.JwtService;
import gamestore_backend.modules.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.ContextConfiguration;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@ContextConfiguration(initializers = TestDatabaseGuard.class)
class CatalogApiTests {
    @Value("${local.server.port}") int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired JwtService jwt;
    @Autowired UserRepository users;
    final HttpClient http = HttpClient.newHttpClient();
    final ObjectMapper json = new ObjectMapper();
    record Account(UUID id, String token) {}
    Account admin, dev, other, buyer;
    UUID genre, secondGenre;
    @BeforeEach void fixtures() {
        admin = account("ADMINISTRATOR"); dev = account("DEVELOPER"); other = account("DEVELOPER"); buyer = account("USER");
        genre = jdbc.queryForObject("INSERT INTO genres(name) VALUES (?) RETURNING id", UUID.class, "Action-" + UUID.randomUUID());
        secondGenre = jdbc.queryForObject("INSERT INTO genres(name) VALUES (?) RETURNING id", UUID.class, "RPG-" + UUID.randomUUID());
    }
    Account account(String role) {
        String name = "catalog-" + UUID.randomUUID();
        UUID id = jdbc.queryForObject("INSERT INTO users(username,email,password,role,status) VALUES (?,?,'unused',?,'VERIFIED') RETURNING id", UUID.class, name, name + "@example.test", role);
        return new Account(id, jwt.generateToken(users.findById(id).orElseThrow()));
    }
    HttpRequest request(String method, String path, Account user, Object body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/catalog" + path));
        if (user != null) builder.header("Authorization", "Bearer " + user.token());
        if (body != null) builder.header("Content-Type", "application/json");
        return builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build();
    }
    HttpResponse<String> send(String method, String path, Account user, Object body) throws Exception {
        return http.send(request(method, path, user, body), HttpResponse.BodyHandlers.ofString());
    }
    JsonNode result(HttpResponse<String> response, int expected) throws Exception {
        assertEquals(expected, response.statusCode(), response.body()); return json.readTree(response.body());
    }
    Map<String, Object> body() {
        var input = new HashMap<String, Object>();
        input.put("title", "Catalog test"); input.put("description", "Test description"); input.put("price", "12345.50");
        input.put("version", "1.0"); input.put("genre_ids", List.of(genre, secondGenre));
        return input;
    }
    JsonNode create(Account user) throws Exception { return result(send("POST", "/games", user, body()), 201); }
    String submit(String game) throws Exception { return result(send("POST", "/games/" + game + "/submissions", dev, null), 201).path("id").asText(); }
    void review(String submission, String status) throws Exception {
        result(send("PUT", "/submissions/" + submission + "/review", admin, Map.of("status", status, "reason", "Test review decision")), 200);
    }
    @Test void draftCrudRequiresGenresAndKeepsOwner() throws Exception {
        JsonNode created = create(dev); String id = created.path("id").asText();
        assertEquals("HIDDEN", created.path("status").asText()); assertEquals(2, created.path("genre_ids").size());
        assertEquals(0, created.path("submissions").size()); assertFalse(created.path("can_enable").asBoolean());
        var edit = body(); edit.put("title", "Updated"); edit.put("genre_ids", List.of(secondGenre));
        JsonNode updated = result(send("PUT", "/games/" + id, dev, edit), 200);
        assertEquals("Updated", updated.path("title").asText()); assertEquals(1, updated.path("genre_ids").size()); assertFalse(updated.has("revision"));
        assertEquals(dev.id().toString(), updated.path("developer_id").asText());
        for (Object ids : List.of(List.of(), List.of(genre, genre), List.of(UUID.randomUUID()))) {
            var invalid = body(); invalid.put("genre_ids", ids);
            assertEquals(400, send("POST", "/games", dev, invalid).statusCode());
            assertEquals(400, send("PUT", "/games/" + id, dev, invalid).statusCode());
        }
        for (String value : List.of("-1", "0.001", "100000000000000000")) {
            var invalid = body(); invalid.put("price", value);
            assertEquals(400, send("POST", "/games", dev, invalid).statusCode());
        }
        var invalid = body(); invalid.put("cover_image_url", "javascript:alert(1)");
        assertEquals(400, send("POST", "/games", dev, invalid).statusCode());
        invalid = body(); invalid.put("title", "   "); assertEquals(400, send("POST", "/games", dev, invalid).statusCode());
        assertEquals(404, send("GET", "/games/" + UUID.randomUUID(), dev, null).statusCode());
    }
    @Test void explicitSubmissionAcceptHideEnableAndEditRequireReapproval() throws Exception {
        String id = create(dev).path("id").asText();
        assertEquals(409, send("PUT", "/games/" + id + "/status", dev, Map.of("status", "AVAILABLE")).statusCode());
        String submission = submit(id);
        assertEquals(409, send("POST", "/games/" + id + "/submissions", dev, null).statusCode());
        assertTrue(result(send("GET", "/games/" + id, dev, null), 200).path("submissions").get(0).path("reason").isNull());
        assertEquals(400, send("PUT", "/submissions/" + submission + "/review", admin, Map.of("status", "ACCEPTED", "reason", " ")).statusCode());
        review(submission, "ACCEPTED");
        JsonNode accepted = result(send("GET", "/games/" + id, dev, null), 200);
        assertEquals("AVAILABLE", accepted.path("status").asText()); assertTrue(accepted.path("can_enable").asBoolean());
        assertEquals(admin.id().toString(), accepted.path("submissions").get(0).path("reviewed_by").asText());
        assertEquals(204, send("DELETE", "/games/" + id, dev, null).statusCode());
        assertEquals("AVAILABLE", result(send("PUT", "/games/" + id + "/status", dev, Map.of("status", "AVAILABLE")), 200).path("status").asText());
        var edit = body(); edit.put("description", "New unreviewed content");
        JsonNode changed = result(send("PUT", "/games/" + id, dev, edit), 200);
        assertEquals("HIDDEN", changed.path("status").asText()); assertFalse(changed.path("can_enable").asBoolean());
        assertEquals("REJECTED", changed.path("submissions").get(0).path("status").asText());
        assertEquals("Trò chơi đã bị chỉnh sửa", changed.path("submissions").get(0).path("reason").asText());
        assertEquals(409, send("PUT", "/games/" + id + "/status", dev, Map.of("status", "AVAILABLE")).statusCode());
        review(submit(id), "ACCEPTED");
        assertEquals(409, send("PUT", "/submissions/" + submission + "/review", admin, Map.of("status", "REJECTED", "reason", "Already handled")).statusCode());
    }
    @Test void pendingReviewUsesCurrentContentAndRejectedGameCanResubmit() throws Exception {
        String id = create(dev).path("id").asText(); String pending = submit(id);
        var edit = body(); edit.put("version", "2.0");
        result(send("PUT", "/games/" + id, dev, edit), 200);
        review(pending, "REJECTED");
        JsonNode rejected = result(send("GET", "/games/" + id, dev, null), 200);
        assertEquals("HIDDEN", rejected.path("status").asText()); assertFalse(rejected.path("can_enable").asBoolean());
        assertEquals(409, send("PUT", "/games/" + id + "/status", dev, Map.of("status", "AVAILABLE")).statusCode());
        review(submit(id), "ACCEPTED");
        JsonNode queue = result(send("GET", "/submissions?status=ACCEPTED&q=Catalog&page=0&size=1", admin, null), 200);
        assertEquals(1, queue.path("items").size()); assertTrue(queue.path("total").asLong() >= 1);
        assertEquals("ACCEPTED", queue.path("items").get(0).path("status").asText());
        assertEquals(400, send("GET", "/submissions?status=INVALID", admin, null).statusCode());
        assertEquals(400, send("GET", "/submissions?page=-1", admin, null).statusCode());
    }
    @Test void editingHiddenApprovedGameCannotBypassReapproval() throws Exception {
        String id = create(dev).path("id").asText(); review(submit(id), "ACCEPTED");
        assertEquals(204, send("DELETE", "/games/" + id, dev, null).statusCode());
        var edit = body(); edit.put("version", "Hidden edit");
        JsonNode changed = result(send("PUT", "/games/" + id, dev, edit), 200);
        assertFalse(changed.path("can_enable").asBoolean());
        assertEquals("Trò chơi đã bị chỉnh sửa", changed.path("submissions").get(0).path("reason").asText());
        assertEquals(409, send("PUT", "/games/" + id + "/status", dev, Map.of("status", "AVAILABLE")).statusCode());
    }
    @Test void administratorOwnedGameDoesNotRequireReapprovalAfterEdit() throws Exception {
        var input = body(); input.put("status", "AVAILABLE");
        String id = result(send("POST", "/games", admin, input), 201).path("id").asText();
        input.put("description", "Admin updated content");
        assertEquals("AVAILABLE", result(send("PUT", "/games/" + id, admin, input), 200).path("status").asText());
    }
    @Test void adminCanManageAnyOwnerAndPermanentlyDeleteOnlyUnpurchasedGames() throws Exception {
        var input = body(); input.put("developer_id", dev.id()); input.put("status", "AVAILABLE");
        JsonNode game = result(send("POST", "/games", admin, input), 201); String id = game.path("id").asText();
        assertEquals(dev.id().toString(), game.path("developer_id").asText()); assertEquals("AVAILABLE", game.path("status").asText());
        assertEquals(204, send("DELETE", "/games/" + id, admin, null).statusCode());
        assertEquals("AVAILABLE", result(send("PUT", "/games/" + id + "/status", admin, Map.of("status", "AVAILABLE")), 200).path("status").asText());
        UUID gameId = UUID.fromString(id);
        jdbc.update("INSERT INTO transactions(user_id,game_id,type,amount,status) VALUES (?,?,'BUY',12345.5,'SUCCESSED')", buyer.id(), gameId);
        assertEquals(409, send("DELETE", "/games/" + id + "/permanent", admin, null).statusCode());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM game_bought WHERE game_id=?", Integer.class, gameId));
        String draft = create(dev).path("id").asText(); submit(draft);
        jdbc.update("INSERT INTO wishlists(user_id,game_id) VALUES (?,?::uuid)", buyer.id(), draft);
        assertEquals(204, send("DELETE", "/games/" + draft + "/permanent", admin, null).statusCode());
        assertEquals(404, send("GET", "/games/" + draft, admin, null).statusCode());
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM game_submissions WHERE game_id=?::uuid", Integer.class, draft));
    }
    @Test void rolesOwnershipAndForgedPayloadsAreEnforced() throws Exception {
        String id = create(dev).path("id").asText();
        assertEquals(401, send("GET", "/manage", null, null).statusCode());
        assertEquals(403, send("GET", "/manage", buyer, null).statusCode());
        assertEquals(403, send("GET", "/games/" + id, other, null).statusCode());
        assertEquals(403, send("PUT", "/games/" + id, other, body()).statusCode());
        assertEquals(403, send("DELETE", "/games/" + id, other, null).statusCode());
        assertEquals(403, send("POST", "/games/" + id + "/submissions", other, null).statusCode());
        assertEquals(403, send("DELETE", "/games/" + id + "/permanent", dev, null).statusCode());
        assertEquals(403, send("GET", "/submissions", dev, null).statusCode());
        var input = body(); input.put("status", "AVAILABLE"); assertEquals(403, send("POST", "/games", dev, input).statusCode());
        assertEquals(403, send("PUT", "/games/" + id, dev, input).statusCode());
        input = body(); input.put("developer_id", other.id()); assertEquals(403, send("POST", "/games", dev, input).statusCode());
        for (JsonNode game : result(send("GET", "/manage", other, null), 200).path("games")) assertNotEquals(id, game.path("id").asText());
        jdbc.update("UPDATE users SET role='USER' WHERE id=?", dev.id());
        assertEquals(403, send("PUT", "/games/" + id, dev, body()).statusCode());
        jdbc.update("UPDATE users SET status='BANNED' WHERE id=?", admin.id());
        assertEquals(403, send("GET", "/submissions", admin, null).statusCode());
    }
    @Test void concurrentSubmitAndReviewHaveSingleWinners() throws Exception {
        String id = create(dev).path("id").asText();
        var first = http.sendAsync(request("POST", "/games/" + id + "/submissions", dev, null), HttpResponse.BodyHandlers.ofString());
        var second = http.sendAsync(request("POST", "/games/" + id + "/submissions", dev, null), HttpResponse.BodyHandlers.ofString());
        CompletableFuture.allOf(first, second).join();
        assertEquals(Set.of(201, 409), Set.of(first.join().statusCode(), second.join().statusCode()));
        String submission = json.readTree(first.join().statusCode() == 201 ? first.join().body() : second.join().body()).path("id").asText();
        var accept = http.sendAsync(request("PUT", "/submissions/" + submission + "/review", admin, Map.of("status", "ACCEPTED", "reason", "Good")), HttpResponse.BodyHandlers.ofString());
        var reject = http.sendAsync(request("PUT", "/submissions/" + submission + "/review", admin, Map.of("status", "REJECTED", "reason", "Bad")), HttpResponse.BodyHandlers.ofString());
        CompletableFuture.allOf(accept, reject).join();
        assertEquals(Set.of(200, 409), Set.of(accept.join().statusCode(), reject.join().statusCode()));
    }
    @Test void genreManagementCannotRemoveLastGenreOrKeepOldApproval() throws Exception {
        String id = create(dev).path("id").asText(); review(submit(id), "ACCEPTED");
        var delete = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/admin/genres/" + genre + "/games/" + id))
            .header("Authorization", "Bearer " + admin.token()).DELETE().build();
        assertEquals(204, http.send(delete, HttpResponse.BodyHandlers.ofString()).statusCode());
        JsonNode changed = result(send("GET", "/games/" + id, dev, null), 200);
        assertFalse(changed.path("can_enable").asBoolean()); assertEquals("HIDDEN", changed.path("status").asText());
        var last = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/admin/genres/" + secondGenre + "/games/" + id))
            .header("Authorization", "Bearer " + admin.token()).DELETE().build();
        assertEquals(409, http.send(last, HttpResponse.BodyHandlers.ofString()).statusCode());
    }
}
