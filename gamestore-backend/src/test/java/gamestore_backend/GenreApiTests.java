package gamestore_backend;

import static org.junit.jupiter.api.Assertions.*;
import java.net.URI;
import java.net.http.*;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import gamestore_backend.modules.config.JwtService;
import gamestore_backend.modules.user.User;
import gamestore_backend.modules.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@ContextConfiguration(initializers = TestDatabaseGuard.class)
class GenreApiTests {
    @Value("${local.server.port}") int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired JwtService jwt;
    @Autowired UserRepository users;
    @Autowired PlatformTransactionManager transactions;
    final ObjectMapper json = new ObjectMapper();
    final HttpClient http = HttpClient.newHttpClient();
    String admin;
    UUID adminId, game;
    String token(String role) {
        String name = "genre-" + UUID.randomUUID();
        UUID id = jdbc.queryForObject("INSERT INTO users(username,email,password,role,status) VALUES (?,?,'unused',?,'VERIFIED') RETURNING id", UUID.class, name, name + "@example.test", role);
        User user = users.findById(id).orElseThrow();
        if (role.equals("ADMINISTRATOR")) adminId = id;
        return jwt.generateToken(user);
    }
    @BeforeEach void setup() {
        admin = token("ADMINISTRATOR");
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            game = jdbc.queryForObject("INSERT INTO games(developer_id,title,price) VALUES (?,'Genre test game',0) RETURNING id", UUID.class, adminId);
            jdbc.update("INSERT INTO game_submissions(game_id,submitted_by) VALUES (?,?)", game, adminId);
        });
    }
    HttpRequest request(String method, String path, String token, String body) {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/admin/genres" + path));
        if (token != null) builder.header("Authorization", "Bearer " + token);
        if (body != null) builder.header("Content-Type", "application/json");
        return builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body)).build();
    }
    HttpResponse<String> send(String method, String path, String token, String body) throws Exception {
        return http.send(request(method, path, token, body), HttpResponse.BodyHandlers.ofString());
    }
    JsonNode result(HttpResponse<String> response, int status) throws Exception {
        assertEquals(status, response.statusCode(), response.body());
        return json.readTree(response.body());
    }
    String create(String name) throws Exception {
        return result(send("POST", "", admin, json.writeValueAsString(Map.of("name", name, "description", "Test description"))), 201).path("id").asText();
    }
    @Test void crudValidationAndDuplicateNames() throws Exception {
        String name = "Action-" + UUID.randomUUID();
        String id = create("  " + name + "  ");
        assertEquals(name, result(send("GET", "/" + id, admin, null), 200).path("name").asText());
        assertEquals(409, send("POST", "", admin, json.writeValueAsString(Map.of("name", name.toUpperCase()))).statusCode());
        for (String body : List.of("{}", "{\"name\":null}", "{\"name\":\"   \"}", json.writeValueAsString(Map.of("name", "x".repeat(101))), json.writeValueAsString(Map.of("name", "Valid", "description", "x".repeat(2001)))))
            assertEquals(400, send("POST", "", admin, body).statusCode());
        String other = create("Other-" + UUID.randomUUID());
        assertEquals(409, send("PUT", "/" + other, admin, json.writeValueAsString(Map.of("name", name))).statusCode());
        assertEquals("Updated", result(send("PUT", "/" + id, admin, "{\"name\":\" Updated \",\"description\":null}"), 200).path("name").asText());
        assertEquals(204, send("DELETE", "/" + id, admin, null).statusCode());
        assertEquals(404, send("GET", "/" + id, admin, null).statusCode());
        assertEquals(404, send("DELETE", "/" + id, admin, null).statusCode());
        assertEquals(404, send("PUT", "/" + id, admin, "{\"name\":\"Missing\"}").statusCode());
        assertEquals(400, send("GET", "/not-a-uuid", admin, null).statusCode());
    }
    @Test void manyToManyLinksAreIdempotentAndDeletionIsProtected() throws Exception {
        String a = create("First-" + UUID.randomUUID()), b = create("Second-" + UUID.randomUUID());
        String path = "/" + a + "/games/" + game;
        assertEquals(204, send("PUT", path, admin, null).statusCode());
        assertEquals(204, send("PUT", path, admin, null).statusCode());
        assertEquals(204, send("PUT", "/" + b + "/games/" + game, admin, null).statusCode());
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM game_genres WHERE game_id=?", Integer.class, game));
        assertEquals(1, result(send("GET", "/" + a, admin, null), 200).path("game_count").asInt());
        assertEquals(409, send("DELETE", "/" + a, admin, null).statusCode());
        JsonNode games = result(send("GET", "/games", admin, null), 200);
        JsonNode entry = null;
        for (JsonNode candidate : games) if (candidate.path("id").asText().equals(game.toString())) entry = candidate;
        assertNotNull(entry); assertEquals(2, entry.path("genre_ids").size()); assertEquals("HIDDEN", entry.path("status").asText());
        assertEquals(204, send("DELETE", path, admin, null).statusCode());
        assertEquals(204, send("DELETE", path, admin, null).statusCode());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM game_genres WHERE game_id=? AND genre_id=?::uuid", Integer.class, game, b));
        assertEquals(204, send("DELETE", "/" + a, admin, null).statusCode());
        assertEquals(404, send("PUT", "/" + b + "/games/" + UUID.randomUUID(), admin, null).statusCode());
        assertEquals(404, send("DELETE", "/" + UUID.randomUUID() + "/games/" + game, admin, null).statusCode());
    }
    @Test void authorizationUsesCurrentDatabaseRoleAndStatus() throws Exception {
        assertEquals(401, send("GET", "", null, null).statusCode());
        for (String role : List.of("USER", "DEVELOPER")) {
            String denied = token(role);
            assertEquals(403, send("GET", "", denied, null).statusCode());
            assertEquals(403, send("POST", "", denied, "{\"name\":\"Denied\"}").statusCode());
        }
        jdbc.update("UPDATE users SET role='USER' WHERE id=?", adminId);
        assertEquals(403, send("GET", "", admin, null).statusCode());
        assertEquals(403, send("POST", "", admin, "{\"name\":\"Denied\"}").statusCode());
        jdbc.update("UPDATE users SET role='ADMINISTRATOR',status='BANNED' WHERE id=?", adminId);
        assertEquals(403, send("GET", "/games", admin, null).statusCode());
        jdbc.update("UPDATE users SET status='PENDING' WHERE id=?", adminId);
        assertEquals(403, send("GET", "", admin, null).statusCode());
    }
    @Test void concurrentDuplicateCreatesOnlyOneGenre() throws Exception {
        String body = json.writeValueAsString(Map.of("name", "Concurrent-" + UUID.randomUUID()));
        var first = http.sendAsync(request("POST", "", admin, body), HttpResponse.BodyHandlers.ofString());
        var second = http.sendAsync(request("POST", "", admin, body), HttpResponse.BodyHandlers.ofString());
        CompletableFuture.allOf(first, second).join();
        assertEquals(Set.of(201, 409), Set.of(first.join().statusCode(), second.join().statusCode()));
    }
}
