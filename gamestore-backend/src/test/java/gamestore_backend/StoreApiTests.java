package gamestore_backend;

import static org.junit.jupiter.api.Assertions.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
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

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@ContextConfiguration(initializers=TestDatabaseGuard.class)
class StoreApiTests {
    @Value("${local.server.port}") int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired JwtService jwt;
    @Autowired UserRepository users;
    final ObjectMapper json=new ObjectMapper();
    final HttpClient http=HttpClient.newHttpClient();
    UUID developerId,buyerId,adminId,otherId,genre,visible,hidden;
    String developer,buyer,admin,other,prefix;
    UUID account(String role) {
        String name="store-"+UUID.randomUUID();
        return jdbc.queryForObject("INSERT INTO users(username,email,password,role,status) VALUES (?,?,'private-password-hash',?,'VERIFIED') RETURNING id",UUID.class,name,name+"@example.test",role);
    }
    String token(UUID id) { return jwt.generateToken(users.findById(id).orElseThrow()); }
    UUID game(String title,String status) {
        UUID id=jdbc.queryForObject("INSERT INTO games(developer_id,title,description,price,version) VALUES (?,?,'Store description',1234.50,'1.0') RETURNING id",UUID.class,developerId,title);
        jdbc.update("INSERT INTO game_genres(game_id,genre_id) VALUES (?,?)",id,genre);
        jdbc.update("UPDATE games SET status=? WHERE id=?",status,id);
        return id;
    }
    @BeforeEach void setup() {
        developerId=account("DEVELOPER");buyerId=account("USER");adminId=account("ADMINISTRATOR");otherId=account("USER");
        developer=token(developerId);buyer=token(buyerId);admin=token(adminId);other=token(otherId);
        prefix="Store-"+UUID.randomUUID();
        genre=jdbc.queryForObject("INSERT INTO genres(name) VALUES (?) RETURNING id",UUID.class,prefix+" genre");
        visible=game(prefix+" Alpha","AVAILABLE");hidden=game(prefix+" Hidden","HIDDEN");
    }
    HttpResponse<String> get(String path,String token) throws Exception {
        var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/store/games"+path));
        if(token!=null) request.header("Authorization","Bearer "+token);
        return http.send(request.GET().build(),HttpResponse.BodyHandlers.ofString());
    }
    JsonNode result(HttpResponse<String> response,int status) throws Exception {
        assertEquals(status,response.statusCode(),response.body());return json.readTree(response.body());
    }
    String query(String q) { return "?q="+URLEncoder.encode(q,StandardCharsets.UTF_8); }
    void buy(UUID game) {
        jdbc.update("INSERT INTO transactions(user_id,game_id,type,amount,status) VALUES (?,?,'BUY',1234.50,'SUCCESSED')",buyerId,game);
    }
    @Test void searchUsesLiteralCaseInsensitiveSubstringAndOnlyAvailableGames() throws Exception {
        game(prefix+" 100%_Fun","AVAILABLE");
        game(prefix+" 100XXFun","AVAILABLE");
        JsonNode all=result(get(query(prefix.toUpperCase()),buyer),200);
        assertEquals(3,all.path("total").asInt());
        assertEquals(3,all.path("items").size());
        JsonNode literal=result(get(query(prefix+" 100%_"),buyer),200);
        assertEquals(1,literal.path("total").asInt());
        assertTrue(literal.path("items").get(0).path("title").asText().endsWith("100%_Fun"));
        assertEquals(0,result(get(query(prefix+" missing"),buyer),200).path("total").asInt());
    }
    @Test void pagingIsStableAndRejectsInvalidFilters() throws Exception {
        game(prefix+" Beta","AVAILABLE");
        JsonNode first=result(get(query(prefix)+"&size=1&page=0",buyer),200);
        JsonNode second=result(get(query(prefix)+"&size=1&page=1",buyer),200);
        assertEquals(2,first.path("total").asInt());assertEquals(1,first.path("items").size());
        assertNotEquals(first.path("items").get(0).path("id"),second.path("items").get(0).path("id"));
        assertEquals(0,result(get(query(prefix)+"&size=100&page=2147483647",buyer),200).path("items").size());
        for(String path:List.of("?page=-1","?size=0","?size=101",query("x".repeat(201)))) assertEquals(400,get(path,buyer).statusCode());
    }
    @Test void detailsReadByIdWithoutSnapshotAndExposePublicFieldsOnly() throws Exception {
        buy(visible);
        jdbc.update("INSERT INTO reviews(user_id,game_id,rating,content) VALUES (?,?,4.5,'Great game')",buyerId,visible);
        UUID promotion=jdbc.queryForObject("INSERT INTO promotions(name,discount,status) VALUES ('Store sale',10,'ENABLED') RETURNING id",UUID.class);
        jdbc.update("UPDATE games SET promotion_id=? WHERE id=?",promotion,visible);
        JsonNode detail=result(get("/"+visible,buyer),200);
        assertEquals(visible.toString(),detail.path("game").path("id").asText());
        assertEquals("1234.50",detail.path("game").path("price").asText());
        assertTrue(detail.path("owned").asBoolean());
        assertEquals(1,detail.path("reviews").size());
        assertEquals(users.findById(buyerId).orElseThrow().getUsername(),detail.path("reviews").get(0).path("username").asText());
        assertEquals(promotion.toString(),detail.path("promotions").get(0).path("id").asText());
        assertFalse(detail.path("game").has("can_enable"));assertFalse(detail.path("game").has("submissions"));
        for(String field:List.of("password","email","balance","verification_token","idempotency_key")) assertFalse(detail.toString().contains("\""+field+"\""));
        JsonNode page=result(get(query(prefix),buyer),200);
        assertEquals(1,page.path("promotions").size());
    }
    @Test void hiddenDetailsRequireDeveloperAdminOrOwnershipAndDoNotLeakExistence() throws Exception {
        assertEquals(404,get("/"+hidden,other).statusCode());
        assertEquals(200,get("/"+hidden,developer).statusCode());
        assertEquals(200,get("/"+hidden,admin).statusCode());
        buy(hidden);
        JsonNode owned=result(get("/"+hidden,buyer),200);
        assertTrue(owned.path("owned").asBoolean());assertEquals(0,owned.path("promotions").size());
        assertEquals(404,get("/"+UUID.randomUUID(),buyer).statusCode());
    }
    @Test void currentDatabaseStatusAndRoleOverrideStaleJwtClaims() throws Exception {
        assertEquals(200,get("/"+hidden,admin).statusCode());
        jdbc.update("UPDATE users SET role='USER' WHERE id=?",adminId);
        assertEquals(404,get("/"+hidden,admin).statusCode());
        jdbc.update("UPDATE users SET status='BANNED' WHERE id=?",buyerId);
        assertEquals(403,get(query(prefix),buyer).statusCode());
        assertEquals(403,get("/"+visible,buyer).statusCode());
        assertEquals(401,get(query(prefix),null).statusCode());
    }
}
