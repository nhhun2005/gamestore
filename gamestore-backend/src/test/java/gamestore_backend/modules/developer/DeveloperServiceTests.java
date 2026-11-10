package gamestore_backend.modules.developer;

import static gamestore_backend.modules.developer.DeveloperDtos.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.Collections;
import java.util.List;
import java.util.UUID;
import gamestore_backend.modules.commerce.CommerceException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.core.Authentication;

class DeveloperServiceTests {

    private JdbcTemplate jdbc;
    private DeveloperService service;
    private Authentication userAuth;
    private Authentication adminAuth;

    private final UUID userId = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private final UUID adminId = UUID.fromString("22222222-2222-4222-8222-222222222222");
    private final UUID submissionId = UUID.fromString("33333333-3333-4333-8333-333333333333");

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        service = new DeveloperService(jdbc);

        userAuth = mock(Authentication.class);
        when(userAuth.isAuthenticated()).thenReturn(true);
        when(userAuth.getName()).thenReturn("testuser");

        adminAuth = mock(Authentication.class);
        when(adminAuth.isAuthenticated()).thenReturn(true);
        when(adminAuth.getName()).thenReturn("adminuser");
    }

    private void mockUserInDb(String username, UUID id, String role, String status) {
        when(jdbc.query(
                contains("SELECT id, username, role, status FROM users WHERE lower(username) = lower(?)"),
                any(RowMapper.class),
                eq(username)))
                .thenReturn(List.of(new UserAccount(id, username, role, status)));
    }

    private void mockLock() {
        doAnswer(invocation -> null).when(jdbc).query(
                contains("pg_advisory_xact_lock"),
                any(RowCallbackHandler.class));
    }

    @Test
    void authNullOrUnauthenticatedThrowsUnauthorized() {
        CommerceException ex1 = assertThrows(CommerceException.class, () -> service.authenticate(null));
        assertEquals(HttpStatus.UNAUTHORIZED, ex1.status());

        Authentication unauth = mock(Authentication.class);
        when(unauth.isAuthenticated()).thenReturn(false);
        CommerceException ex2 = assertThrows(CommerceException.class, () -> service.authenticate(unauth));
        assertEquals(HttpStatus.UNAUTHORIZED, ex2.status());

        Authentication blank = mock(Authentication.class);
        when(blank.isAuthenticated()).thenReturn(true);
        when(blank.getName()).thenReturn("   ");
        CommerceException ex3 = assertThrows(CommerceException.class, () -> service.authenticate(blank));
        assertEquals(HttpStatus.UNAUTHORIZED, ex3.status());
    }

    @Test
    void userNotFoundInDbThrowsUnauthorized() {
        when(jdbc.query(anyString(), any(RowMapper.class), eq("testuser"))).thenReturn(Collections.emptyList());
        CommerceException ex = assertThrows(CommerceException.class, () -> service.authenticate(userAuth));
        assertEquals(HttpStatus.UNAUTHORIZED, ex.status());
    }

    @Test
    void submitByUnverifiedUserThrowsForbidden() {
        mockUserInDb("testuser", userId, "USER", "PENDING");
        mockLock();

        CommerceException ex = assertThrows(CommerceException.class, () ->
                service.submit(userAuth, new DeveloperApplicationInput("I want to publish games.")));
        assertEquals(HttpStatus.FORBIDDEN, ex.status());
        assertTrue(ex.getMessage().contains("chưa được xác minh"));
    }

    @Test
    void submitByNonRoleUserThrowsForbidden() {
        mockUserInDb("testuser", userId, "DEVELOPER", "VERIFIED");
        mockLock();

        CommerceException ex = assertThrows(CommerceException.class, () ->
                service.submit(userAuth, new DeveloperApplicationInput("I want to publish games.")));
        assertEquals(HttpStatus.FORBIDDEN, ex.status());
        assertTrue(ex.getMessage().contains("Chỉ tài khoản người dùng (USER)"));
    }

    @Test
    void submitWithBlankOrTooLongReasonThrowsBadRequest() {
        mockUserInDb("testuser", userId, "USER", "VERIFIED");
        mockLock();

        assertThrows(CommerceException.class, () -> service.submit(userAuth, null));
        assertThrows(CommerceException.class, () -> service.submit(userAuth, new DeveloperApplicationInput(null)));
        assertThrows(CommerceException.class, () -> service.submit(userAuth, new DeveloperApplicationInput("   ")));
        assertThrows(CommerceException.class, () -> service.submit(userAuth, new DeveloperApplicationInput("a".repeat(2001))));
    }

    @Test
    void submitWhenPendingExistsThrowsConflict() {
        mockUserInDb("testuser", userId, "USER", "VERIFIED");
        mockLock();

        when(jdbc.queryForObject(
                contains("SELECT EXISTS(SELECT 1 FROM developer_submissions WHERE user_id = ? AND status = 'PENDING')"),
                eq(Boolean.class),
                eq(userId))).thenReturn(true);

        CommerceException ex = assertThrows(CommerceException.class, () ->
                service.submit(userAuth, new DeveloperApplicationInput("Valid application reason.")));
        assertEquals(HttpStatus.CONFLICT, ex.status());
        assertTrue(ex.getMessage().contains("đang chờ duyệt"));
    }

    @Test
    void submitSuccessInsertsAndReturnsDto() {
        mockUserInDb("testuser", userId, "USER", "VERIFIED");
        mockLock();

        when(jdbc.queryForObject(
                contains("SELECT EXISTS(SELECT 1 FROM developer_submissions WHERE user_id = ? AND status = 'PENDING')"),
                eq(Boolean.class),
                eq(userId))).thenReturn(false);

        when(jdbc.queryForObject(
                contains("INSERT INTO developer_submissions"),
                eq(UUID.class),
                eq(userId),
                eq("Valid application reason."))).thenReturn(submissionId);

        DeveloperSubmissionResponse expected = new DeveloperSubmissionResponse(
                submissionId, userId, "testuser", "PENDING", "Valid application reason.", null);

        when(jdbc.query(
                contains("FROM developer_submissions s JOIN users u ON u.id = s.user_id WHERE s.id = ?"),
                any(RowMapper.class),
                eq(submissionId))).thenReturn(List.of(expected));

        DeveloperSubmissionResponse res = service.submit(userAuth, new DeveloperApplicationInput("  Valid application reason.  "));
        assertNotNull(res);
        assertEquals(submissionId, res.id());
        assertEquals("PENDING", res.status());
        assertEquals("Valid application reason.", res.application_reason());
    }

    @Test
    void getOwnSubmissionsReturnsList() {
        mockUserInDb("testuser", userId, "USER", "VERIFIED");

        DeveloperSubmissionResponse s1 = new DeveloperSubmissionResponse(
                submissionId, userId, "testuser", "REJECTED", "Old try", "Not enough info");
        when(jdbc.query(
                contains("WHERE s.user_id = ? ORDER BY s.id"),
                any(RowMapper.class),
                eq(userId))).thenReturn(List.of(s1));

        List<DeveloperSubmissionResponse> list = service.getOwnSubmissions(userAuth);
        assertEquals(1, list.size());
        assertEquals("REJECTED", list.get(0).status());
    }

    @Test
    void adminEndpointsByNonAdminThrowsForbidden() {
        mockUserInDb("testuser", userId, "USER", "VERIFIED");

        CommerceException ex1 = assertThrows(CommerceException.class, () ->
                service.getAdminSubmissions(userAuth, null, "", 0, 20));
        assertEquals(HttpStatus.FORBIDDEN, ex1.status());

        CommerceException ex2 = assertThrows(CommerceException.class, () ->
                service.review(userAuth, submissionId, new DeveloperReviewInput("ACCEPTED", "OK")));
        assertEquals(HttpStatus.FORBIDDEN, ex2.status());
    }

    @Test
    void adminGetSubmissionsValidatesInputAndReturnsPage() {
        mockUserInDb("adminuser", adminId, "ADMINISTRATOR", "VERIFIED");

        assertThrows(CommerceException.class, () ->
                service.getAdminSubmissions(adminAuth, "INVALID_STATUS", "", 0, 20));
        assertThrows(CommerceException.class, () ->
                service.getAdminSubmissions(adminAuth, "PENDING", "", -1, 20));
        assertThrows(CommerceException.class, () ->
                service.getAdminSubmissions(adminAuth, "PENDING", "", 0, 101));

        when(jdbc.queryForObject(
                contains("SELECT count(*) FROM developer_submissions"),
                eq(Long.class),
                any(Object[].class))).thenReturn(1L);

        DeveloperSubmissionResponse item = new DeveloperSubmissionResponse(
                submissionId, userId, "testuser", "PENDING", "Reason", null);
        when(jdbc.query(
                contains("ORDER BY s.id LIMIT ? OFFSET ?"),
                any(RowMapper.class),
                any(Object[].class))).thenReturn(List.of(item));

        DeveloperSubmissionPage page = service.getAdminSubmissions(adminAuth, "PENDING", "test", 0, 10);
        assertEquals(1L, page.total());
        assertEquals(0, page.page());
        assertEquals(10, page.size());
        assertEquals(1, page.items().size());
    }

    @Test
    void reviewValidatesDecisionAndReason() {
        mockUserInDb("adminuser", adminId, "ADMINISTRATOR", "VERIFIED");
        mockLock();

        assertThrows(CommerceException.class, () -> service.review(adminAuth, null, new DeveloperReviewInput("ACCEPTED", "Good")));
        assertThrows(CommerceException.class, () -> service.review(adminAuth, submissionId, new DeveloperReviewInput("MAYBE", "Good")));
        assertThrows(CommerceException.class, () -> service.review(adminAuth, submissionId, new DeveloperReviewInput("ACCEPTED", "  ")));
        assertThrows(CommerceException.class, () -> service.review(adminAuth, submissionId, new DeveloperReviewInput("ACCEPTED", "a".repeat(2001))));
    }

    @Test
    void reviewNonPendingSubmissionThrowsConflict() {
        mockUserInDb("adminuser", adminId, "ADMINISTRATOR", "VERIFIED");
        mockLock();

        DeveloperSubmissionResponse s = new DeveloperSubmissionResponse(
                submissionId, userId, "testuser", "ACCEPTED", "Reason", "Already approved");
        when(jdbc.query(
                contains("FROM developer_submissions s JOIN users u ON u.id = s.user_id WHERE s.id = ?"),
                any(RowMapper.class),
                eq(submissionId))).thenReturn(List.of(s));

        CommerceException ex = assertThrows(CommerceException.class, () ->
                service.review(adminAuth, submissionId, new DeveloperReviewInput("REJECTED", "Rejection")));
        assertEquals(HttpStatus.CONFLICT, ex.status());
        assertTrue(ex.getMessage().contains("không ở trạng thái chờ duyệt"));
    }

    @Test
    void reviewTargetUserNotVerifiedUserThrowsConflict() {
        mockUserInDb("adminuser", adminId, "ADMINISTRATOR", "VERIFIED");
        mockLock();

        DeveloperSubmissionResponse s = new DeveloperSubmissionResponse(
                submissionId, userId, "testuser", "PENDING", "Reason", null);
        when(jdbc.query(
                contains("FROM developer_submissions s JOIN users u ON u.id = s.user_id WHERE s.id = ?"),
                any(RowMapper.class),
                eq(submissionId))).thenReturn(List.of(s));

        // Target user is now BANNED
        when(jdbc.query(
                contains("SELECT id, username, role, status FROM users WHERE id = ?"),
                any(RowMapper.class),
                eq(userId))).thenReturn(List.of(new UserAccount(userId, "testuser", "USER", "BANNED")));

        CommerceException ex = assertThrows(CommerceException.class, () ->
                service.review(adminAuth, submissionId, new DeveloperReviewInput("ACCEPTED", "Approve")));
        assertEquals(HttpStatus.CONFLICT, ex.status());
        assertTrue(ex.getMessage().contains("không còn là tài khoản người dùng hợp lệ"));
    }

    @Test
    void reviewAcceptedUpdatesUserRoleToDeveloperAndSubmissionToAccepted() {
        mockUserInDb("adminuser", adminId, "ADMINISTRATOR", "VERIFIED");
        mockLock();

        DeveloperSubmissionResponse pending = new DeveloperSubmissionResponse(
                submissionId, userId, "testuser", "PENDING", "Reason", null);
        when(jdbc.query(
                contains("FROM developer_submissions s JOIN users u ON u.id = s.user_id WHERE s.id = ?"),
                any(RowMapper.class),
                eq(submissionId)))
                .thenReturn(List.of(pending))
                .thenReturn(List.of(new DeveloperSubmissionResponse(submissionId, userId, "testuser", "ACCEPTED", "Reason", "Welcome developer")));

        when(jdbc.query(
                contains("SELECT id, username, role, status FROM users WHERE id = ?"),
                any(RowMapper.class),
                eq(userId))).thenReturn(List.of(new UserAccount(userId, "testuser", "USER", "VERIFIED")));

        when(jdbc.update(
                contains("UPDATE users SET role = 'DEVELOPER' WHERE id = ? AND role = 'USER' AND status = 'VERIFIED'"),
                eq(userId))).thenReturn(1);

        DeveloperSubmissionResponse result = service.review(
                adminAuth, submissionId, new DeveloperReviewInput("ACCEPTED", "  Welcome developer  "));

        verify(jdbc).update(
                contains("UPDATE users SET role = 'DEVELOPER'"),
                eq(userId));
        verify(jdbc).update(
                contains("UPDATE developer_submissions SET status = ?, reason = ? WHERE id = ?"),
                eq("ACCEPTED"),
                eq("Welcome developer"),
                eq(submissionId));
        assertEquals("ACCEPTED", result.status());
        assertEquals("Welcome developer", result.reason());
    }

    @Test
    void reviewRejectedKeepsUserRoleAndUpdatesSubmissionToRejected() {
        mockUserInDb("adminuser", adminId, "ADMINISTRATOR", "VERIFIED");
        mockLock();

        DeveloperSubmissionResponse pending = new DeveloperSubmissionResponse(
                submissionId, userId, "testuser", "PENDING", "Reason", null);
        when(jdbc.query(
                contains("FROM developer_submissions s JOIN users u ON u.id = s.user_id WHERE s.id = ?"),
                any(RowMapper.class),
                eq(submissionId)))
                .thenReturn(List.of(pending))
                .thenReturn(List.of(new DeveloperSubmissionResponse(submissionId, userId, "testuser", "REJECTED", "Reason", "Need a portfolio link")));

        when(jdbc.query(
                contains("SELECT id, username, role, status FROM users WHERE id = ?"),
                any(RowMapper.class),
                eq(userId))).thenReturn(List.of(new UserAccount(userId, "testuser", "USER", "VERIFIED")));

        DeveloperSubmissionResponse result = service.review(
                adminAuth, submissionId, new DeveloperReviewInput("REJECTED", "Need a portfolio link"));

        // users table should NOT be updated to DEVELOPER
        verify(jdbc, never()).update(contains("UPDATE users SET role = 'DEVELOPER'"), any(UUID.class));
        verify(jdbc).update(
                contains("UPDATE developer_submissions SET status = ?, reason = ? WHERE id = ?"),
                eq("REJECTED"),
                eq("Need a portfolio link"),
                eq(submissionId));
        assertEquals("REJECTED", result.status());
        assertEquals("Need a portfolio link", result.reason());
    }

    @Test
    void submitReadsCurrentLockedRoleAfterSerializingWithReviews() {
        mockUserInDb("testuser", userId, "DEVELOPER", "VERIFIED");
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(CommerceException.class, () ->
                service.submit(userAuth, new DeveloperApplicationInput("Publish"))).status());
        var order = inOrder(jdbc);
        order.verify(jdbc).query(contains("pg_advisory_xact_lock"), any(RowCallbackHandler.class));
        order.verify(jdbc).query(contains("lower(?) FOR UPDATE"), any(RowMapper.class), eq("testuser"));
        verify(jdbc, never()).queryForObject(contains("INSERT INTO developer_submissions"), eq(UUID.class), any(), any());
    }

    @Test
    void failedRolePromotionCannotMarkSubmissionAccepted() {
        mockUserInDb("adminuser", adminId, "ADMINISTRATOR", "VERIFIED");
        var pending = new DeveloperSubmissionResponse(submissionId, userId, "testuser", "PENDING", "Publish", null);
        when(jdbc.query(contains("WHERE s.id = ?"), any(RowMapper.class), eq(submissionId))).thenReturn(List.of(pending));
        when(jdbc.query(contains("WHERE id = ? FOR UPDATE"), any(RowMapper.class), eq(userId)))
                .thenReturn(List.of(new UserAccount(userId, "testuser", "USER", "VERIFIED")));
        assertEquals(HttpStatus.CONFLICT, assertThrows(CommerceException.class, () ->
                service.review(adminAuth, submissionId, new DeveloperReviewInput("ACCEPTED", "Approved"))).status());
        verify(jdbc, never()).update(contains("UPDATE developer_submissions"), any(), any(), any());
    }

    @Test
    void revokedAdminAndBannedApplicantCannotUseTheirOldPrivileges() {
        mockUserInDb("adminuser", adminId, "ADMINISTRATOR", "BANNED");
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(CommerceException.class, () ->
                service.review(adminAuth, submissionId, new DeveloperReviewInput("ACCEPTED", "Approved"))).status());
        mockUserInDb("testuser", userId, "USER", "BANNED");
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(CommerceException.class, () ->
                service.getOwnSubmissions(userAuth)).status());
        verify(jdbc, never()).query(contains("FROM developer_submissions"), any(RowMapper.class), any(UUID.class));
    }

    @Test
    void adminSearchIsBoundedAndPaginationOffsetDoesNotOverflow() {
        mockUserInDb("adminuser", adminId, "ADMINISTRATOR", "VERIFIED");
        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(CommerceException.class, () ->
                service.getAdminSubmissions(adminAuth, null, "a".repeat(201), 0, 20)).status());
        service.getAdminSubmissions(adminAuth, null, "", Integer.MAX_VALUE, 20);
        verify(jdbc).query(contains("ORDER BY s.id LIMIT ? OFFSET ?"), any(RowMapper.class), eq(20), eq(42949672940L));
    }
}
