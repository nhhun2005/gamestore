package gamestore_backend;

import static org.junit.jupiter.api.Assertions.*;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.*;
import java.util.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import gamestore_backend.modules.config.JwtService;
import gamestore_backend.modules.user.UserRepository;
import gamestore_backend.modules.commerce.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.ContextConfiguration;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@ContextConfiguration(initializers=TestDatabaseGuard.class)
class SandboxCheckoutApiTests {
    @Value("${local.server.port}") int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired JwtService jwt;
    @Autowired UserRepository users;
    final HttpClient http=HttpClient.newHttpClient();
    final ObjectMapper json=new ObjectMapper();
    record Account(UUID id,String token) {}
    Account buyer,other,admin,dev;
    UUID game,free,hidden;
    @BeforeEach void fixtures() {
        buyer=account("USER"); other=account("USER"); admin=account("ADMINISTRATOR"); dev=account("DEVELOPER");
        UUID promo=jdbc.queryForObject("INSERT INTO promotions(name,discount,status) VALUES('Checkout offer',25,'ENABLED') RETURNING id",UUID.class);
        game=jdbc.queryForObject("INSERT INTO games(developer_id,title,price,status,promotion_id) VALUES(?,'Sandbox adventure',200000,'AVAILABLE',?) RETURNING id",UUID.class,dev.id(),promo);
        free=jdbc.queryForObject("INSERT INTO games(developer_id,title,price,status) VALUES(?,'Free checkout game',0,'AVAILABLE') RETURNING id",UUID.class,dev.id());
        hidden=jdbc.queryForObject("INSERT INTO games(developer_id,title,price,status) VALUES(?,'Hidden checkout game',100000,'HIDDEN') RETURNING id",UUID.class,dev.id());
        jdbc.update("UPDATE users SET balance=100000 WHERE id=?",buyer.id());
    }
    Account account(String role) {
        String name="checkout-"+UUID.randomUUID();
        UUID id=jdbc.queryForObject("INSERT INTO users(username,email,password,role,status) VALUES(?,?,'unused',?,'VERIFIED') RETURNING id",UUID.class,name,name+"@example.test",role);
        return new Account(id,jwt.generateToken(users.findById(id).orElseThrow()));
    }
    HttpRequest request(String method,String path,Account actor,Object body,UUID key) throws Exception {
        var r=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/commerce"+path));
        if(actor!=null) r.header("Authorization","Bearer "+actor.token());
        if(key!=null) r.header("Idempotency-Key",key.toString());
        if(body!=null) r.header("Content-Type","application/json");
        return r.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build();
    }
    HttpResponse<String> send(String method,String path,Account actor,Object body,UUID key) throws Exception { return http.send(request(method,path,actor,body,key),HttpResponse.BodyHandlers.ofString()); }
    JsonNode tree(HttpResponse<String> r,int status) throws Exception { assertEquals(status,r.statusCode(),r.body()); return json.readTree(r.body()); }
    Map<String,Object> input(UUID id,String amount) { return Map.of("game_id",id,"expected_amount",amount); }
    Map<String,Object> card(boolean success) { return Map.of("method","CARD","bank","NCB","card_number",success?"4242424242424242":"4000000000000002","expiry","12/35","cvv","123"); }
    JsonNode create() throws Exception { return tree(send("POST","/checkouts",buyer,input(game,"150000"),UUID.randomUUID()),201); }
    String path(JsonNode c) { return "/checkouts/"+c.path("id").asText(); }
    int count(String table,String column,UUID value) { return jdbc.queryForObject("SELECT count(*) FROM "+table+" WHERE "+column+"=?",Integer.class,value); }
    @Test void successFreezesDiscountedQuoteGrantsOnceAndKeepsWalletAndRevenueCorrect() throws Exception {
        JsonNode c=create(); String path=path(c);
        assertEquals("PENDING",c.path("status").asText()); assertEquals("150000.00",c.path("amount").asText());
        assertEquals(0,count("game_bought","user_id",buyer.id()));
        jdbc.update("UPDATE games SET price=999999,status='HIDDEN' WHERE id=?",game);
        JsonNode paid=tree(send("POST",path+"/confirm",buyer,card(true),null),200);
        assertEquals("SUCCESSED",paid.path("status").asText()); assertEquals("4242",paid.path("card_last4").asText());
        assertTrue(paid.path("qr_payload").isNull()); assertFalse(paid.toString().contains("4242424242424242")); assertFalse(paid.has("cvv"));
        assertEquals(1,count("game_bought","user_id",buyer.id()));
        assertEquals("100000.00",jdbc.queryForObject("SELECT balance::text FROM users WHERE id=?",String.class,buyer.id()));
        assertEquals("SUCCESSED",tree(send("POST",path+"/confirm",buyer,card(false),null),200).path("status").asText());
        assertEquals("SUCCESSED",tree(send("POST",path+"/cancel",buyer,null,null),200).path("status").asText());
        assertEquals(1,count("transactions","user_id",buyer.id()));
        JsonNode revenue=tree(send("GET","/revenue",dev,null,null),200);
        assertEquals(1,revenue.size()); assertEquals("150000.00",revenue.get(0).path("amount").asText());
        assertEquals("15000.00",revenue.get(0).path("platform_fee").asText()); assertEquals("135000.00",revenue.get(0).path("developer_revenue").asText());
        JsonNode state=tree(send("GET","/state",buyer,null,null),200);
        assertTrue(state.path("capabilities").path("sandbox_payments").asBoolean()); assertEquals(1,state.path("game_bought").size());
        assertFalse(state.path("checkout_sessions").get(0).has("qr_payload"));
    }
    @Test void creationValidatesPriceAvailabilityFreeGamesAuthenticationAndRequestKey() throws Exception {
        assertEquals(401,send("POST","/checkouts",null,input(game,"150000"),UUID.randomUUID()).statusCode());
        assertEquals(400,send("POST","/checkouts",buyer,input(game,"150000"),null).statusCode());
        assertEquals(409,send("POST","/checkouts",buyer,input(game,"1"),UUID.randomUUID()).statusCode());
        assertEquals(409,send("POST","/checkouts",buyer,input(hidden,"100000"),UUID.randomUUID()).statusCode());
        assertEquals(400,send("POST","/checkouts",buyer,input(free,"0"),UUID.randomUUID()).statusCode());
        assertEquals(409,send("POST","/checkouts",buyer,input(free,"100"),UUID.randomUUID()).statusCode());
        assertEquals(404,send("POST","/checkouts",buyer,input(UUID.randomUUID(),"100"),UUID.randomUUID()).statusCode());
        assertEquals(0,count("checkout_sessions","user_id",buyer.id())); assertEquals(0,count("transactions","user_id",buyer.id()));
    }
    @Test void ownerOnlyEvenAdminCannotReadConfirmOrCancelAnotherCheckout() throws Exception {
        JsonNode c=create();
        for(Account actor:List.of(other,admin)) {
            assertEquals(404,send("GET",path(c),actor,null,null).statusCode());
            assertEquals(404,send("POST",path(c)+"/confirm",actor,card(true),null).statusCode());
            assertEquals(404,send("POST",path(c)+"/cancel",actor,null,null).statusCode());
            assertEquals(0,tree(send("GET","/state",actor,null,null),200).path("checkout_sessions").size());
        }
        jdbc.update("UPDATE users SET status='BANNED' WHERE id=?",buyer.id());
        assertEquals(403,send("POST",path(c)+"/confirm",buyer,card(true),null).statusCode());
        assertEquals(0,count("game_bought","user_id",buyer.id()));
    }
    @Test void declineIsFinalAndNewAttemptRequiresNewRequestKey() throws Exception {
        UUID key=UUID.randomUUID(); var body=input(game,"150000");
        JsonNode c=tree(send("POST","/checkouts",buyer,body,key),201);
        assertEquals("FAILED",tree(send("POST",path(c)+"/confirm",buyer,card(false),null),200).path("status").asText());
        assertEquals("FAILED",tree(send("POST",path(c)+"/confirm",buyer,card(true),null),200).path("status").asText());
        assertEquals(c.path("id"),tree(send("POST","/checkouts",buyer,body,key),201).path("id"));
        assertEquals(409,send("POST","/checkouts",buyer,input(game,"1"),key).statusCode());
        JsonNode next=create(); assertNotEquals(c.path("id"),next.path("id"));
        assertEquals(0,count("game_bought","user_id",buyer.id()));
        assertEquals(0,tree(send("GET","/revenue",dev,null,null),200).size());
    }
    @Test void qrCodeIsBoundToTheCheckoutAndUnknownCardsNeverGrantGames() throws Exception {
        JsonNode c=create();
        var invalid=new HashMap<String,Object>(card(true)); invalid.put("card_number","4111111111111111");
        assertEquals(400,send("POST",path(c)+"/confirm",buyer,invalid,null).statusCode());
        assertEquals(400,send("POST",path(c)+"/confirm",buyer,Map.of("method","QR","bank","NCB","qr_code",UUID.randomUUID()),null).statusCode());
        assertEquals(0,count("game_bought","user_id",buyer.id()));
        String code=URI.create(c.path("qr_payload").asText()).getQuery().substring("code=".length());
        JsonNode paid=tree(send("POST",path(c)+"/confirm",buyer,Map.of("method","QR","bank","BIDV","qr_code",code),null),200);
        assertEquals("SUCCESSED",paid.path("status").asText()); assertEquals("QR",paid.path("method").asText()); assertTrue(paid.path("card_last4").isNull());
    }
    @Test void expiryPersistsAndAllowsWalletPurchaseWithoutRevivingExpiredCheckout() throws Exception {
        JsonNode c=create(); UUID id=UUID.fromString(c.path("id").asText());
        jdbc.update("UPDATE checkout_sessions SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=?",id);
        assertEquals("EXPIRED",tree(send("GET",path(c),buyer,null,null),200).path("status").asText());
        assertEquals("EXPIRED",tree(send("POST",path(c)+"/confirm",buyer,card(true),null),200).path("status").asText());
        assertEquals("FAILED",jdbc.queryForObject("SELECT status FROM transactions WHERE id=?",String.class,UUID.fromString(c.path("transaction_id").asText())));
        jdbc.update("UPDATE users SET balance=500000 WHERE id=?",buyer.id());
        tree(send("POST","/purchases",buyer,input(game,"150000"),UUID.randomUUID()),201);
        assertEquals(1,count("game_bought","user_id",buyer.id()));
    }
    @Test void pendingCheckoutBlocksWalletAndCancellationReleasesIt() throws Exception {
        JsonNode c=create(); jdbc.update("UPDATE users SET balance=500000 WHERE id=?",buyer.id());
        assertEquals(409,send("POST","/purchases",buyer,input(game,"150000"),UUID.randomUUID()).statusCode());
        assertEquals("500000.00",jdbc.queryForObject("SELECT balance::text FROM users WHERE id=?",String.class,buyer.id()));
        assertEquals("CANCELLED",tree(send("POST",path(c)+"/cancel",buyer,null,null),200).path("status").asText());
        tree(send("POST","/purchases",buyer,input(game,"150000"),UUID.randomUUID()),201);
        assertEquals("CANCELLED",tree(send("POST",path(c)+"/confirm",buyer,card(true),null),200).path("status").asText());
        assertEquals(1,count("game_bought","user_id",buyer.id()));
    }
    @Test void concurrentCreationAndConfirmationCannotDoubleGrantOrCreateDuplicateOrders() throws Exception {
        UUID key=UUID.randomUUID(); var body=input(game,"150000");
        var a=http.sendAsync(request("POST","/checkouts",buyer,body,key),HttpResponse.BodyHandlers.ofString());
        var b=http.sendAsync(request("POST","/checkouts",buyer,body,key),HttpResponse.BodyHandlers.ofString());
        JsonNode first=tree(a.join(),201),second=tree(b.join(),201); assertEquals(first.path("id"),second.path("id"));
        assertEquals(first.path("id"),create().path("id"));
        assertEquals(1,count("transactions","user_id",buyer.id()));
        var c=http.sendAsync(request("POST",path(first)+"/confirm",buyer,card(true),null),HttpResponse.BodyHandlers.ofString());
        var d=http.sendAsync(request("POST",path(first)+"/confirm",buyer,card(true),null),HttpResponse.BodyHandlers.ofString());
        assertEquals("SUCCESSED",tree(c.join(),200).path("status").asText());
        assertEquals("SUCCESSED",tree(d.join(),200).path("status").asText());
        assertEquals(1,count("game_bought","user_id",buyer.id()));
    }
    @Test void confirmCancelRaceKeepsOneFinalReceipt() throws Exception {
        JsonNode order=create();
        var c=http.sendAsync(request("POST",path(order)+"/confirm",buyer,card(true),null),HttpResponse.BodyHandlers.ofString());
        var d=http.sendAsync(request("POST",path(order)+"/cancel",buyer,null,null),HttpResponse.BodyHandlers.ofString());
        JsonNode a=tree(c.join(),200),b=tree(d.join(),200);
        assertEquals(a.path("status"),b.path("status"));
        boolean paid="SUCCESSED".equals(a.path("status").asText());
        assertEquals(paid?1:0,count("game_bought","user_id",buyer.id()));
        assertEquals(paid?"SUCCESSED":"FAILED",jdbc.queryForObject("SELECT status FROM transactions WHERE id=?",String.class,UUID.fromString(order.path("transaction_id").asText())));
    }
    @Test void walletTopupCreditsOnceWithoutOwnershipOrRevenueAndReplaysSameOrder() throws Exception {
        UUID key=UUID.randomUUID();
        JsonNode c=tree(send("POST","/wallet/checkouts",buyer,Map.of("amount","500000"),key),201);
        assertEquals("TOPUP",c.path("purpose").asText()); assertTrue(c.path("game_id").isNull());
        assertEquals("100000.00",jdbc.queryForObject("SELECT balance::text FROM users WHERE id=?",String.class,buyer.id()));
        JsonNode paid=tree(send("POST",path(c)+"/confirm",buyer,card(true),null),200);
        assertEquals("SUCCESSED",paid.path("status").asText());
        assertEquals(c.path("id"),tree(send("POST","/wallet/checkouts",buyer,Map.of("amount","500000"),key),201).path("id"));
        tree(send("POST",path(c)+"/confirm",buyer,card(true),null),200);
        tree(send("POST",path(c)+"/cancel",buyer,null,null),200);
        assertEquals("600000.00",jdbc.queryForObject("SELECT balance::text FROM users WHERE id=?",String.class,buyer.id()));
        assertEquals(1,count("transactions","user_id",buyer.id())); assertEquals(0,count("game_bought","user_id",buyer.id()));
        assertEquals("IN",jdbc.queryForObject("SELECT type FROM transactions WHERE id=?",String.class,UUID.fromString(c.path("transaction_id").asText())));
        assertEquals(0,tree(send("GET","/revenue",dev,null,null),200).size());
    }
    @Test void walletTopupRejectsInvalidAmountsQrAndForeignAccountWithoutCredit() throws Exception {
        for(String amount:List.of("0","-1","100000001","1.001")) assertEquals(400,send("POST","/wallet/checkouts",buyer,Map.of("amount",amount),UUID.randomUUID()).statusCode());
        JsonNode c=tree(send("POST","/wallet/checkouts",buyer,Map.of("amount","500000"),UUID.randomUUID()),201);
        assertEquals(404,send("POST",path(c)+"/confirm",other,card(true),null).statusCode());
        assertEquals(400,send("POST",path(c)+"/confirm",buyer,Map.of("method","QR","bank","NCB","qr_code",UUID.randomUUID()),null).statusCode());
        assertEquals("FAILED",tree(send("POST",path(c)+"/confirm",buyer,card(false),null),200).path("status").asText());
        tree(send("POST",path(c)+"/confirm",buyer,card(true),null),200);
        assertEquals("100000.00",jdbc.queryForObject("SELECT balance::text FROM users WHERE id=?",String.class,buyer.id()));
    }
    @Test void cancelledAndExpiredTopupsCannotCreditTheWallet() throws Exception {
        JsonNode c=tree(send("POST","/wallet/checkouts",buyer,Map.of("amount","500000"),UUID.randomUUID()),201);
        tree(send("POST",path(c)+"/cancel",buyer,null,null),200);
        assertEquals("CANCELLED",tree(send("POST",path(c)+"/confirm",buyer,card(true),null),200).path("status").asText());
        JsonNode expired=tree(send("POST","/wallet/checkouts",buyer,Map.of("amount","500000"),UUID.randomUUID()),201);
        jdbc.update("UPDATE checkout_sessions SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=?",UUID.fromString(expired.path("id").asText()));
        assertEquals("EXPIRED",tree(send("GET",path(expired),buyer,null,null),200).path("status").asText());
        tree(send("POST",path(expired)+"/confirm",buyer,card(true),null),200);
        assertEquals("100000.00",jdbc.queryForObject("SELECT balance::text FROM users WHERE id=?",String.class,buyer.id()));
        assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM transactions WHERE user_id=? AND type='IN' AND status='FAILED'",Integer.class,buyer.id()));
    }
    @Test void concurrentTopupConfirmationsCreditExactlyOnce() throws Exception {
        JsonNode c=tree(send("POST","/wallet/checkouts",buyer,Map.of("amount","100000"),UUID.randomUUID()),201);
        var a=http.sendAsync(request("POST",path(c)+"/confirm",buyer,card(true),null),HttpResponse.BodyHandlers.ofString());
        var b=http.sendAsync(request("POST",path(c)+"/confirm",buyer,card(true),null),HttpResponse.BodyHandlers.ofString());
        tree(a.join(),200);tree(b.join(),200);
        assertEquals("200000.00",jdbc.queryForObject("SELECT balance::text FROM users WHERE id=?",String.class,buyer.id()));
        assertEquals(1,count("transactions","user_id",buyer.id()));
    }
    @Test void gameAndTopupRequestKeysCannotBeReusedAcrossPurposes() throws Exception {
        UUID key=UUID.randomUUID(); tree(send("POST","/checkouts",buyer,input(game,"150000"),key),201);
        assertEquals(409,send("POST","/wallet/checkouts",buyer,Map.of("amount","150000"),key).statusCode());
        UUID topupKey=UUID.randomUUID(); tree(send("POST","/wallet/checkouts",buyer,Map.of("amount","150000"),topupKey),201);
        assertEquals(409,send("POST","/checkouts",buyer,input(game,"150000"),topupKey).statusCode());
    }
    @Test void topupSettlementChecksBalanceLimitAgainAndRollsBackOnOverflow() throws Exception {
        JsonNode c=tree(send("POST","/wallet/checkouts",buyer,Map.of("amount","500000"),UUID.randomUUID()),201);
        jdbc.update("UPDATE users SET balance=99999999999999999.99 WHERE id=?",buyer.id());
        assertEquals(400,send("POST",path(c)+"/confirm",buyer,card(true),null).statusCode());
        assertEquals("PENDING",tree(send("GET",path(c),buyer,null,null),200).path("status").asText());
        assertEquals("99999999999999999.99",jdbc.queryForObject("SELECT balance::text FROM users WHERE id=?",String.class,buyer.id()));
    }
    @Test void accountSnapshotExpiresAbandonedTopupAndGameWithoutOpeningTheirCheckoutPages() throws Exception {
        JsonNode gameOrder=create();
        JsonNode topup=tree(send("POST","/wallet/checkouts",buyer,Map.of("amount","500000"),UUID.randomUUID()),201);
        jdbc.update("UPDATE checkout_sessions SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE user_id=?",buyer.id());
        JsonNode state=tree(send("GET","/state",buyer,null,null),200);
        assertEquals(2,state.path("checkout_sessions").size());
        for(JsonNode row:state.path("checkout_sessions")) assertEquals("EXPIRED",row.path("status").asText());
        for(JsonNode row:state.path("transactions")) assertEquals("FAILED",row.path("status").asText());
        assertEquals("100000.00",state.path("current_user").path("balance").asText()); assertEquals(0,state.path("game_bought").size());
        assertEquals("EXPIRED",tree(send("POST",path(topup)+"/confirm",buyer,card(true),null),200).path("status").asText());
        assertEquals("EXPIRED",tree(send("GET",path(gameOrder),buyer,null,null),200).path("status").asText());
    }
    @Test void transactionHistoryAlsoExpiresOrdersOnRead() throws Exception {
        JsonNode c=tree(send("POST","/wallet/checkouts",buyer,Map.of("amount","100000"),UUID.randomUUID()),201);
        jdbc.update("UPDATE checkout_sessions SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE user_id=?",buyer.id());
        JsonNode page=tree(send("GET","/transactions?status=FAILED",buyer,null,null),200);
        assertEquals(1,page.path("items").size()); assertEquals(c.path("transaction_id"),page.path("items").get(0).path("id"));
    }
    @Test void sandboxCanBeDisabledWithoutChangingWalletPurchaseCode() {
        var disabled=new CommerceService(null,true,false);
        CommerceException failure=assertThrows(CommerceException.class,()->disabled.createCheckout(null,new CommerceDtos.CheckoutRequest(game,new BigDecimal("150000")),UUID.randomUUID()));
        assertEquals(503,failure.status().value());
    }
}
