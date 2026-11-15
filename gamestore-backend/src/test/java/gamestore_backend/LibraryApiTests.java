package gamestore_backend;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import gamestore_backend.modules.config.JwtService;
import gamestore_backend.modules.user.UserRepository;
import java.net.URI;
import java.net.http.*;
import java.util.*;
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
class LibraryApiTests {
    @Value("${local.server.port}") int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired JwtService jwt;
    @Autowired UserRepository users;
    @Autowired PlatformTransactionManager transactions;
    record Account(UUID id, String token) {}
    Account owner, stranger, admin;
    UUID game, unowned;
    final ObjectMapper json = new ObjectMapper();
    final HttpClient http = HttpClient.newHttpClient();

    Account account(String role) {
        String name = "library-" + UUID.randomUUID();
        UUID id = jdbc.queryForObject("INSERT INTO users(username,email,password,role,status,balance) VALUES (?,?,'test-unused',?,'VERIFIED',100000) RETURNING id", UUID.class, name, name + "@example.test", role);
        return new Account(id, jwt.generateToken(users.findById(id).orElseThrow()));
    }
    @BeforeEach void fixtures() {
        owner = account("USER"); stranger = account("DEVELOPER"); admin = account("ADMINISTRATOR");
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            game = game("HIDDEN"); unowned = game("AVAILABLE");
            for (Account user : List.of(owner, stranger, admin))
                jdbc.update("INSERT INTO transactions(user_id,game_id,type,amount,status) VALUES (?,?,'BUY',100,'SUCCESSED')", user.id(), game);
        });
    }
    UUID game(String status) {
        UUID id = jdbc.queryForObject("INSERT INTO games(developer_id,title,price,status) VALUES (?,'Library test',100,?) RETURNING id", UUID.class, stranger.id(), status);
        jdbc.update("INSERT INTO game_submissions(game_id,submitted_by) VALUES (?,?)", id, stranger.id());
        return id;
    }
    HttpResponse<String> send(Account user, String method, String path, Object body) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/commerce" + path));
        if (user != null) request.header("Authorization", "Bearer " + user.token());
        if (body != null) request.header("Content-Type", "application/json");
        request.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
    JsonNode result(HttpResponse<String> response, int expected) throws Exception {
        assertEquals(expected, response.statusCode(), response.body());
        return response.body().isBlank() ? null : json.readTree(response.body());
    }
    String create(Account user, String name) throws Exception {
        return result(send(user,"POST","/library/collections", Map.of("name",name)),201).path("id").asText();
    }
    @Test void completeOrganizationJourneyPreservesOwnershipReviewsWalletAndHistory() throws Exception {
        String id = create(owner,"  Yêu thích  ");
        String collection = "/library/collections/" + id;
        result(send(owner,"PUT",collection,Map.of("name","Cuối tuần")),200);
        result(send(owner,"PUT",collection + "/games/" + game,null),204);
        result(send(owner,"PUT",collection + "/games/" + game,null),204);
        result(send(owner,"PUT","/library/games/" + game,Map.of("note","Ghi chú riêng tư", "hidden",true)),204);
        result(send(owner,"PUT","/games/" + game + "/review",Map.of("rating",4.5,"content","Review retained")),200);
        JsonNode state = result(send(owner,"GET","/state",null),200);
        assertEquals("Cuối tuần", state.path("library").path("collections").get(0).path("name").asText());
        assertEquals(1,state.path("library").path("memberships").size());
        assertTrue(state.path("library").path("preferences").get(0).path("hidden").asBoolean());
        assertEquals("Ghi chú riêng tư",state.path("library").path("preferences").get(0).path("note").asText());
        result(send(owner,"DELETE",collection + "/games/" + game,null),204);
        result(send(owner,"PUT",collection + "/games/" + game,null),204);
        result(send(owner,"DELETE",collection,null),204);
        JsonNode library = result(send(owner,"GET","/library",null),200);
        assertEquals(0,library.path("collections").size());
        assertEquals(0,library.path("memberships").size());
        assertEquals(1,library.path("preferences").size());
        result(send(owner,"PUT","/library/games/" + game,Map.of("note","", "hidden",false)),204);
        state = result(send(owner,"GET","/state",null),200);
        assertEquals(1,state.path("game_bought").size());
        assertEquals(1,state.path("transactions").size());
        assertEquals("100000.00",state.path("current_user").path("balance").asText());
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM reviews WHERE user_id=? AND game_id=?",Integer.class,owner.id(),game));
    }
    @Test void everyRoleManagesOnlyItsOwnLibrary() throws Exception {
        String id = create(owner,"Riêng tư");
        result(send(owner,"PUT","/library/games/" + game,Map.of("note","Secret", "hidden",true)),204);
        for (Account other : List.of(stranger, admin)) {
            result(send(other,"PUT","/library/collections/" + id,Map.of("name","Hijacked")),404);
            result(send(other,"DELETE","/library/collections/" + id,null),404);
            result(send(other,"PUT","/library/collections/" + id + "/games/" + game,null),404);
            result(send(other,"DELETE","/library/collections/" + id + "/games/" + game,null),404);
            JsonNode library = result(send(other,"GET","/library?user_id=" + owner.id(),null),200);
            assertEquals(0,library.path("collections").size());
            assertEquals(0,library.path("preferences").size());
            create(other,"Riêng tư"); // Same name belongs to a different account.
            result(send(other,"PUT","/library/games/" + game,Map.of("note","Own note", "hidden",false)),204);
        }
        assertEquals("Secret",result(send(owner,"GET","/library",null),200).path("preferences").get(0).path("note").asText());
    }
    @Test void invalidNamesUnownedGamesAndDuplicateNamesAreRejected() throws Exception {
        String id = create(owner,"Indie");
        result(send(owner,"POST","/library/collections",Map.of("name"," indie ")),409);
        for (String name : List.of(" ","x".repeat(81))) result(send(owner,"POST","/library/collections",Map.of("name",name)),400);
        String other = create(owner,"Other");
        result(send(owner,"PUT","/library/collections/" + other,Map.of("name","INDIE")),409);
        result(send(owner,"PUT","/library/collections/" + id + "/games/" + unowned,null),403);
        result(send(admin,"PUT","/library/games/" + unowned,Map.of("note","No ownership", "hidden",false)),403);
        result(send(owner,"PUT","/library/games/" + game,Map.of("note","x".repeat(2001), "hidden",false)),400);
        result(send(owner,"PUT","/library/games/" + game,Map.of("note","Missing boolean")),400);
        result(send(owner,"DELETE","/library/collections/" + UUID.randomUUID(),null),404);
    }
    @Test void authenticationAndCurrentDatabaseStatusAreRequired() throws Exception {
        result(send(null,"GET","/library",null),401);
        for (String status : List.of("BANNED","PENDING")) {
            jdbc.update("UPDATE users SET status=? WHERE id=?", status,owner.id());
            result(send(owner,"GET","/library",null),403);
            result(send(owner,"POST","/library/collections",Map.of("name","Blocked")),403);
            result(send(owner,"PUT","/library/games/" + game,Map.of("note","Blocked", "hidden",false)),403);
        }
        jdbc.update("UPDATE users SET status='VERIFIED',role='DEVELOPER' WHERE id=?",owner.id());
        create(owner,"After role change"); // Personal library survives USER → DEVELOPER.
    }
    @Test void staleJwtCannotKeepAdminAccessAfterDatabaseRoleOrStatusChanges() throws Exception {
        String url = "http://127.0.0.1:" + port + "/api/admin/users";
        var request = HttpRequest.newBuilder(URI.create(url)).header("Authorization", "Bearer " + admin.token()).GET().build();
        assertEquals(200,http.send(request,HttpResponse.BodyHandlers.ofString()).statusCode());
        jdbc.update("UPDATE users SET role='USER' WHERE id=?",admin.id());
        assertEquals(403,http.send(request,HttpResponse.BodyHandlers.ofString()).statusCode());
        jdbc.update("UPDATE users SET role='ADMINISTRATOR',status='BANNED' WHERE id=?",admin.id());
        assertEquals(403,http.send(request,HttpResponse.BodyHandlers.ofString()).statusCode());
        jdbc.update("UPDATE users SET status='VERIFIED' WHERE id=?",admin.id());
        assertEquals(200,http.send(request,HttpResponse.BodyHandlers.ofString()).statusCode());
    }
}
