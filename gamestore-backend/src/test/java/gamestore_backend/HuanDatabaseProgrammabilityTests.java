package gamestore_backend;

import static org.junit.jupiter.api.Assertions.*;
import java.math.BigDecimal;
import java.util.*;
import java.util.concurrent.*;
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

/** Real PostgreSQL CALL/trigger tests, guarded local test database only. */
@SpringBootTest
@ActiveProfiles("test")
@ContextConfiguration(initializers = TestDatabaseGuard.class)
class HuanDatabaseProgrammabilityTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;
    String admin, developer, user;
    UUID adminId, developerId, userId, genre;

    UUID account(String name, String role) {
        return jdbc.queryForObject("INSERT INTO users(username,email,password,role,status) VALUES (?,?,'unused',?,'VERIFIED') RETURNING id",
            UUID.class,name,name+"@example.test",role);
    }
    @BeforeEach void setup() {
        String suffix=UUID.randomUUID().toString();
        admin="huan-admin-"+suffix; developer="huan-dev-"+suffix; user="huan-user-"+suffix;
        adminId=account(admin,"ADMINISTRATOR"); developerId=account(developer,"DEVELOPER"); userId=account(user,"USER");
        genre=createGenre("Genre-"+suffix);
    }
    UUID createGenre(String name) {
        return jdbc.queryForObject("CALL public.sp_create_genre(?,?,?,NULL)",UUID.class,admin,name,"description");
    }
    UUID createGame(String actor, UUID owner, String status) {
        return jdbc.queryForObject("CALL public.sp_create_game(?,?,?,?,?,?,?::uuid[],?,?,NULL)",UUID.class,
            actor,"Test game","Description",new BigDecimal("150000.00"),null,"1.0","{"+genre+"}",owner,status);
    }
    UUID submit(UUID game) { return jdbc.queryForObject("CALL public.sp_submit_game(?,?,NULL)",UUID.class,developer,game); }
    void approve(UUID submission) { jdbc.update("CALL public.sp_review_game_submission(?,?,?,?)",admin,submission,"ACCEPTED","Approved"); }
    String status(UUID game) { return jdbc.queryForObject("SELECT status FROM games WHERE id=?",String.class,game); }
    String sqlState(Runnable call) {
        DataAccessException failure=assertThrows(DataAccessException.class,call::run);
        for(Throwable cause=failure;cause!=null;cause=cause.getCause())
            if(cause instanceof java.sql.SQLException sql) return sql.getSQLState();
        fail("Missing SQLException"); return null;
    }

    @Test void migrationContainsTrueProceduresViewsTriggersAndFiveIndexes() {
        assertEquals(13,jdbc.queryForObject("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='p' AND p.proname LIKE 'sp_%'",Integer.class));
        assertEquals(10,jdbc.queryForObject("SELECT count(*) FROM pg_views WHERE schemaname='public' AND viewname IN ('v_actor_accounts','v_catalog_developers','v_genre_summary','v_game_genres','v_catalog_games','v_game_submission_details','v_developer_submission_details','v_store_games','v_game_ownership','v_public_game_reviews')",Integer.class));
        assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM pg_trigger WHERE tgname IN ('games_invalidate_approval','game_genres_invalidate_approval') AND NOT tgisinternal",Integer.class));
        assertEquals(5,jdbc.queryForObject("SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN ('genres_name_lookup_idx','game_submissions_game_status_idx','developer_submissions_user_status_idx','developer_submissions_status_id_idx','games_store_title_idx')",Integer.class));
    }
    @Test void genreCrudNormalizesNamesAndChecksDuplicateAndPermission() {
        UUID id=createGenre("  Unique-"+UUID.randomUUID()+"  ");
        String name=jdbc.queryForObject("SELECT name FROM v_genre_summary WHERE id=?",String.class,id);
        assertEquals(name.trim(),name);
        assertEquals("G0409",sqlState(()->createGenre(name.toUpperCase())));
        assertEquals("G0403",sqlState(()->jdbc.queryForObject("CALL public.sp_create_genre(?,?,?,NULL)",UUID.class,user,"Other",null)));
        jdbc.update("CALL public.sp_update_genre(?,?,?,?)",admin,id,"Changed-"+UUID.randomUUID(),"updated");
        jdbc.update("CALL public.sp_delete_genre(?,?)",admin,id);
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM genres WHERE id=?",Integer.class,id));
    }
    @Test void draftSubmitReviewAndVisibilityFollowExistingWorkflow() {
        UUID game=createGame(developer,null,null);
        assertEquals("HIDDEN",status(game));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM game_submissions WHERE game_id=?",Integer.class,game));
        assertEquals("G0409",sqlState(()->jdbc.update("CALL public.sp_set_game_status(?,?,?)",developer,game,"AVAILABLE")));
        UUID submission=submit(game);
        assertEquals("G0409",sqlState(()->submit(game)));
        approve(submission);
        assertEquals("AVAILABLE",status(game));
        assertEquals("G0409",sqlState(()->approve(submission)));
        jdbc.update("CALL public.sp_set_game_status(?,?,?)",developer,game,"HIDDEN");
        jdbc.update("CALL public.sp_set_game_status(?,?,?)",developer,game,"AVAILABLE");
        assertEquals("AVAILABLE",status(game));
    }
    @Test void directContentUpdateInvalidatesApprovalWithoutJavaAndPreservesReviewerMetadata() {
        UUID game=createGame(developer,null,null), submission=submit(game); approve(submission);
        Map<String,Object> before=jdbc.queryForMap("SELECT reviewed_by,reviewed_at FROM game_submissions WHERE id=?",submission);
        jdbc.update("UPDATE games SET description=NULL WHERE id=?",game);
        assertEquals("HIDDEN",status(game));
        assertEquals("REJECTED",jdbc.queryForObject("SELECT status FROM game_submissions WHERE id=?",String.class,submission));
        assertEquals("Trò chơi đã bị chỉnh sửa",jdbc.queryForObject("SELECT reason FROM game_submissions WHERE id=?",String.class,submission));
        assertEquals(before,jdbc.queryForMap("SELECT reviewed_by,reviewed_at FROM game_submissions WHERE id=?",submission));
    }
    @Test void unchangedContentAndGenreOrderKeepApprovalWhileActualGenreChangeInvalidates() {
        UUID second=createGenre("Second-"+UUID.randomUUID());
        UUID game=createGame(developer,null,null);
        jdbc.update("CALL public.sp_attach_game_genre(?,?,?)",admin,second,game);
        UUID submission=submit(game); approve(submission);
        jdbc.update("CALL public.sp_update_game(?,?,?,?,?,?,?,?::uuid[],?,?)",developer,game,"Test game","Description",new BigDecimal("150000"),null,"1.0","{"+second+","+genre+"}",null,null);
        assertEquals("AVAILABLE",status(game));
        jdbc.update("CALL public.sp_attach_game_genre(?,?,?)",admin,second,game);
        assertEquals("AVAILABLE",status(game));
        jdbc.update("CALL public.sp_detach_game_genre(?,?,?)",admin,second,game);
        assertEquals("HIDDEN",status(game));
        assertEquals("G0409",sqlState(()->jdbc.update("CALL public.sp_detach_game_genre(?,?,?)",admin,genre,game)));
        assertEquals("G0409",sqlState(()->jdbc.update("CALL public.sp_delete_genre(?,?)",admin,genre)));
    }
    @Test void pendingSubmissionSurvivesEditAndRatingPromotionOrVisibilityDoNotInvalidateAccepted() {
        UUID game=createGame(developer,null,null), submission=submit(game);
        jdbc.update("UPDATE games SET title='Changed before review' WHERE id=?",game);
        assertEquals("PENDING",jdbc.queryForObject("SELECT status FROM game_submissions WHERE id=?",String.class,submission));
        approve(submission);
        jdbc.update("UPDATE games SET rating=4.5,status='HIDDEN' WHERE id=?",game);
        assertEquals("ACCEPTED",jdbc.queryForObject("SELECT status FROM game_submissions WHERE id=?",String.class,submission));
        jdbc.update("CALL public.sp_set_game_status(?,?,?)",developer,game,"AVAILABLE");
    }
    @Test void adminOwnedGameIsExemptAndDeveloperCannotImpersonateOwner() {
        UUID game=createGame(admin,adminId,"AVAILABLE");
        jdbc.update("UPDATE games SET title='Admin changed' WHERE id=?",game);
        assertEquals("AVAILABLE",status(game));
        assertEquals("G0403",sqlState(()->createGame(developer,adminId,null)));
        assertEquals("G0403",sqlState(()->createGame(developer,null,"AVAILABLE")));
        assertEquals("G0403",sqlState(()->jdbc.update("CALL public.sp_set_game_status(?,?,?)",developer,game,"HIDDEN")));
    }
    @Test void invalidInputsAndFailedTransactionLeaveNoPartialGame() {
        long before=jdbc.queryForObject("SELECT count(*) FROM games WHERE developer_id=?",Long.class,developerId);
        assertEquals("G0400",sqlState(()->jdbc.queryForObject("CALL public.sp_create_game(?,?,?,?,?,?,?::uuid[],?,?,NULL)",UUID.class,
            developer,"Invalid","",new BigDecimal("1.001"),null,"","{"+genre+"}",null,null)));
        assertEquals(before,jdbc.queryForObject("SELECT count(*) FROM games WHERE developer_id=?",Long.class,developerId));
        UUID[] rolledBack=new UUID[1];
        assertThrows(IllegalStateException.class,()->new TransactionTemplate(transactions).executeWithoutResult(tx->{
            rolledBack[0]=createGame(developer,null,null);
            throw new IllegalStateException("Force rollback after CALL");
        }));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM games WHERE id=?",Integer.class,rolledBack[0]));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM game_genres WHERE game_id=?",Integer.class,rolledBack[0]));
    }
    @Test void developerApplicationsAreAtomicAndUseCurrentRoleAndStatus() {
        UUID application=jdbc.queryForObject("CALL public.sp_submit_developer_application(?,?,NULL)",UUID.class,user,"  Build games  ");
        assertEquals("G0409",sqlState(()->jdbc.queryForObject("CALL public.sp_submit_developer_application(?,?,NULL)",UUID.class,user,"Again")));
        jdbc.update("CALL public.sp_review_developer_application(?,?,?,?)",admin,application,"ACCEPTED","Welcome");
        assertEquals("DEVELOPER",jdbc.queryForObject("SELECT role FROM users WHERE id=?",String.class,userId));
        assertEquals("ACCEPTED",jdbc.queryForObject("SELECT status FROM developer_submissions WHERE id=?",String.class,application));
        assertEquals("G0409",sqlState(()->jdbc.update("CALL public.sp_review_developer_application(?,?,?,?)",admin,application,"REJECTED","Too late")));
        assertEquals("G0403",sqlState(()->jdbc.queryForObject("CALL public.sp_submit_developer_application(?,?,NULL)",UUID.class,user,"Now developer")));
    }
    @Test void bannedApplicantCannotBeApprovedAndRejectedApplicantCanReapply() {
        UUID application=jdbc.queryForObject("CALL public.sp_submit_developer_application(?,?,NULL)",UUID.class,user,"Build games");
        jdbc.update("UPDATE users SET status='BANNED' WHERE id=?",userId);
        assertEquals("G0409",sqlState(()->jdbc.update("CALL public.sp_review_developer_application(?,?,?,?)",admin,application,"ACCEPTED","Welcome")));
        assertEquals("PENDING",jdbc.queryForObject("SELECT status FROM developer_submissions WHERE id=?",String.class,application));
        jdbc.update("UPDATE users SET status='VERIFIED' WHERE id=?",userId);
        jdbc.update("CALL public.sp_review_developer_application(?,?,?,?)",admin,application,"REJECTED","Improve request");
        assertEquals("USER",jdbc.queryForObject("SELECT role FROM users WHERE id=?",String.class,userId));
        assertNotNull(jdbc.queryForObject("CALL public.sp_submit_developer_application(?,?,NULL)",UUID.class,user,"Updated application"));
    }
    @Test void simultaneousSubmissionsCreateOnlyOnePendingApplicationAndOneGameSubmission() throws Exception {
        UUID game=createGame(developer,null,null);
        var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(4)) {
            Callable<Boolean> gameTask=()->{ start.await(); try {submit(game);return true;} catch(DataAccessException e){return false;} };
            Callable<Boolean> appTask=()->{ start.await(); try {jdbc.queryForObject("CALL public.sp_submit_developer_application(?,?,NULL)",UUID.class,user,"Concurrent");return true;} catch(DataAccessException e){return false;} };
            var calls=List.of(pool.submit(gameTask),pool.submit(gameTask),pool.submit(appTask),pool.submit(appTask));
            start.countDown(); int success=0;
            for(var call:calls) if(call.get(15,TimeUnit.SECONDS)) success++;
            assertEquals(2,success);
        }
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM game_submissions WHERE game_id=? AND status='PENDING'",Integer.class,game));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM developer_submissions WHERE user_id=? AND status='PENDING'",Integer.class,userId));
    }
    @Test void permanentDeletionPreservesPurchaseHistoryAndExistingOwnershipTriggers() {
        UUID game=createGame(developer,null,null), submission=submit(game); approve(submission);
        jdbc.update("INSERT INTO transactions(user_id,game_id,type,amount,status) VALUES (?,?,'BUY',150000,'SUCCESSED')",userId,game);
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM game_bought WHERE user_id=? AND game_id=?",Integer.class,userId,game));
        assertEquals("G0409",sqlState(()->jdbc.update("CALL public.sp_delete_game_permanently(?,?)",admin,game)));
        UUID removable=createGame(developer,null,null);
        jdbc.update("CALL public.sp_delete_game_permanently(?,?)",admin,removable);
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM games WHERE id=?",Integer.class,removable));
    }
}
