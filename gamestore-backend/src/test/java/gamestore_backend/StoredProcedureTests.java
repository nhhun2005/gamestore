package gamestore_backend;

import static org.junit.jupiter.api.Assertions.*;
import java.math.BigDecimal;
import java.sql.SQLException;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Calls real PostgreSQL procedures directly, independently of service validation. */
@SpringBootTest
@ActiveProfiles("test")
@ContextConfiguration(initializers = TestDatabaseGuard.class)
class StoredProcedureTests {
    private static final String PROCEDURE_NAMES = "('sp_lock_verified_user','sp_deposit_wallet','sp_purchase_game',"
        + "'sp_create_library_collection','sp_rename_library_collection','sp_delete_library_collection',"
        + "'sp_set_library_membership','sp_save_library_preference','sp_save_game_review','sp_delete_game_review')";
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactionManager;
    UUID user, other, game, freeGame;
    @BeforeEach void fixtures() {
        user = account("USER"); other = account("ADMINISTRATOR");
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            UUID promo = jdbc.queryForObject("INSERT INTO promotions(name,discount,status) VALUES ('Procedure test',12.5,'ENABLED') RETURNING id", UUID.class);
            game = game("3.00", promo); freeGame = game("0", null);
        });
    }
    UUID account(String role) {
        String name = "procedure-" + UUID.randomUUID();
        return jdbc.queryForObject("INSERT INTO users(username,email,password,role,status,balance) VALUES (?,?,'test-only',?,'VERIFIED',10) RETURNING id", UUID.class, name, name + "@example.test", role);
    }
    UUID game(String price, UUID promo) {
        UUID id = jdbc.queryForObject("INSERT INTO games(developer_id,title,price,status,promotion_id) VALUES (?,'Procedure test',?,'AVAILABLE',?) RETURNING id", UUID.class, other, new BigDecimal(price), promo);
        jdbc.update("INSERT INTO game_submissions(game_id,submitted_by) VALUES (?,?)",id,other);
        return id;
    }
    UUID deposit(UUID who, String amount, UUID key) {
        return jdbc.queryForObject("CALL public.sp_deposit_wallet(?,?,?,NULL)",(r,n)->r.getObject("p_transaction_id",UUID.class),who,new BigDecimal(amount),key);
    }
    UUID buy(UUID who, UUID gameId, UUID key, String quote) {
        return jdbc.queryForObject("CALL public.sp_purchase_game(?,?,?,?,NULL)",(r,n)->r.getObject("p_transaction_id",UUID.class),who,gameId,key,quote == null ? null : new BigDecimal(quote));
    }
    UUID collection(UUID who, String name) {
        return jdbc.queryForObject("CALL public.sp_create_library_collection(?,?,NULL)",(r,n)->r.getObject("p_collection_id",UUID.class),who,name);
    }
    BigDecimal balance() { return jdbc.queryForObject("SELECT balance FROM users WHERE id=?",BigDecimal.class,user); }
    void sqlState(String expected, Runnable action) {
        DataAccessException failure = assertThrows(DataAccessException.class,action::run);
        for(Throwable cause=failure; cause!=null; cause=cause.getCause()) {
            if(cause instanceof SQLException sql) { assertEquals(expected,sql.getSQLState(),failure.getMessage()); return; }
        }
        fail("Expected SQLException cause",failure);
    }
    @Test void migrationCreatesRealProceduresAndRestrictsPublicExecution() {
        assertEquals(10,jdbc.queryForObject("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='p' AND p.proname IN " + PROCEDURE_NAMES,Integer.class));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname='public' AND p.prokind='p' AND a.grantee=0 AND a.privilege_type='EXECUTE' AND p.proname IN " + PROCEDURE_NAMES,Integer.class));
    }
    @Test void depositAndDiscountedPurchaseAreIdempotentAndRetainHistoricalPrice() {
        UUID key=UUID.randomUUID(); UUID receipt=deposit(user,"10.00",key);
        assertEquals(receipt,deposit(user,"10.00",key));
        assertEquals(new BigDecimal("20.00"),balance());
        sqlState("GS409",()->deposit(user,"20.00",key));
        sqlState("GS409",()->buy(user,game,key,null));
        UUID purchaseKey=UUID.randomUUID(); UUID purchase=buy(user,game,purchaseKey,"2.63");
        assertEquals(new BigDecimal("17.37"),balance());
        assertEquals(new BigDecimal("2.63"),jdbc.queryForObject("SELECT amount FROM transactions WHERE id=?",BigDecimal.class,purchase));
        assertEquals(purchase,jdbc.queryForObject("SELECT transaction_id FROM game_bought WHERE user_id=? AND game_id=?",UUID.class,user,game));
        jdbc.update("UPDATE games SET price=999,status='HIDDEN' WHERE id=?",game);
        assertEquals(purchase,buy(user,game,purchaseKey,"2.63"));
        assertEquals(new BigDecimal("17.37"),balance());
        sqlState("GS409",()->buy(user,game,purchaseKey,"999"));
    }
    @Test void invalidMoneyInsufficientFundsAndChangedQuotesDoNotWriteAnything() {
        for(String amount:new String[]{"0","-1","0.001","100000001"}) sqlState("GS400",()->deposit(user,amount,UUID.randomUUID()));
        sqlState("GS400",()->jdbc.queryForMap("CALL public.sp_deposit_wallet(?,'NaN'::numeric,?,NULL)",user,UUID.randomUUID()));
        sqlState("GS409",()->buy(user,game,UUID.randomUUID(),"3.00"));
        sqlState("GS404",()->buy(user,UUID.randomUUID(),UUID.randomUUID(),null));
        jdbc.update("UPDATE users SET balance=0 WHERE id=?",user);
        sqlState("GS402",()->buy(user,game,UUID.randomUUID(),null));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM transactions WHERE user_id=?",Integer.class,user));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM game_bought WHERE user_id=?",Integer.class,user));
        jdbc.update("UPDATE users SET balance=99999999999999999.99 WHERE id=?",user);
        sqlState("GS400",()->deposit(user,"0.01",UUID.randomUUID()));
        assertEquals(new BigDecimal("99999999999999999.99"),balance());
    }
    @Test void outerTransactionRollbackUndoesWalletHistoryAndOwnershipTogether() {
        assertThrows(IllegalStateException.class,()->new TransactionTemplate(transactionManager).executeWithoutResult(status->{
            deposit(user,"50.00",UUID.randomUUID());
            buy(user,game,UUID.randomUUID(),"2.63");
            throw new IllegalStateException("Simulated later failure");
        }));
        assertEquals(new BigDecimal("10.00"),balance());
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM transactions WHERE user_id=?",Integer.class,user));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM game_bought WHERE user_id=?",Integer.class,user));
    }
    @Test void libraryProceduresEnforceOwnerAndKeepPurchasedGamesAfterDeletingCollection() {
        buy(user,freeGame,UUID.randomUUID(),"0");
        UUID id=collection(user,"  Indie  ");
        assertEquals("Indie",jdbc.queryForObject("SELECT name FROM library_collections WHERE id=?",String.class,id));
        sqlState("23505",()->collection(user,"INDIE"));
        sqlState("GS400",()->collection(user," "));
        sqlState("GS404",()->jdbc.update("CALL public.sp_rename_library_collection(?,?,?)",other,id,"Hijacked"));
        sqlState("GS404",()->jdbc.update("CALL public.sp_delete_library_collection(?,?)",other,id));
        sqlState("GS403",()->jdbc.update("CALL public.sp_set_library_membership(?,?,?,?)",user,id,game,true));
        sqlState("GS403",()->jdbc.update("CALL public.sp_save_library_preference(?,?,?,?)",other,freeGame,"Not owned",true));
        jdbc.update("CALL public.sp_rename_library_collection(?,?,?)",user,id,"Weekend");
        jdbc.update("CALL public.sp_set_library_membership(?,?,?,?)",user,id,freeGame,true);
        jdbc.update("CALL public.sp_set_library_membership(?,?,?,?)",user,id,freeGame,true);
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM library_collection_games WHERE collection_id=?",Integer.class,id));
        jdbc.update("CALL public.sp_set_library_membership(?,?,?,?)",user,id,freeGame,false);
        jdbc.update("CALL public.sp_set_library_membership(?,?,?,?)",user,id,freeGame,true);
        jdbc.update("CALL public.sp_save_library_preference(?,?,?,?)",user,freeGame,"Private",true);
        jdbc.update("CALL public.sp_delete_library_collection(?,?)",user,id);
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM library_collection_games WHERE collection_id=?",Integer.class,id));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM game_bought WHERE user_id=?",Integer.class,user));
        assertEquals("Private",jdbc.queryForObject("SELECT note FROM library_preferences WHERE user_id=?",String.class,user));
    }
    @Test void reviewProceduresValidateOwnershipAndExistingTriggersRefreshRating() {
        sqlState("GS403",()->jdbc.queryForMap("CALL public.sp_save_game_review(?,?,?,?,NULL)",user,freeGame,new BigDecimal("4.5"),"Not owned"));
        buy(user,freeGame,UUID.randomUUID(),"0");
        sqlState("GS400",()->jdbc.queryForMap("CALL public.sp_save_game_review(?,?,?,?,NULL)",user,freeGame,new BigDecimal("1.49"),"Invalid"));
        UUID review=jdbc.queryForObject("CALL public.sp_save_game_review(?,?,?,?,NULL)",(r,n)->r.getObject("p_review_id",UUID.class),user,freeGame,new BigDecimal("4.5"),"Great");
        UUID update=jdbc.queryForObject("CALL public.sp_save_game_review(?,?,?,?,NULL)",(r,n)->r.getObject("p_review_id",UUID.class),user,freeGame,new BigDecimal("3.5"),"Updated");
        assertEquals(review,update);
        assertEquals(0,new BigDecimal("3.5").compareTo(jdbc.queryForObject("SELECT rating FROM games WHERE id=?",BigDecimal.class,freeGame)));
        sqlState("GS404",()->jdbc.update("CALL public.sp_delete_game_review(?,?)",other,review));
        jdbc.update("CALL public.sp_delete_game_review(?,?)",user,review);
        assertNull(jdbc.queryForObject("SELECT rating FROM games WHERE id=?",BigDecimal.class,freeGame));
    }
    @Test void proceduresRejectMissingPendingAndBannedAccountsWithoutRelyingOnJava() {
        sqlState("GS401",()->deposit(UUID.randomUUID(),"10.00",UUID.randomUUID()));
        for(String status:new String[]{"PENDING","BANNED"}) {
            jdbc.update("UPDATE users SET status=? WHERE id=?",status,user);
            sqlState("GS403",()->deposit(user,"10.00",UUID.randomUUID()));
            sqlState("GS403",()->buy(user,game,UUID.randomUUID(),null));
            sqlState("GS403",()->collection(user,"Blocked"));
        }
        assertEquals(new BigDecimal("10.00"),balance());
    }
}
