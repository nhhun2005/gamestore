package gamestore_backend.modules.developer;

import static gamestore_backend.modules.developer.DeveloperDtos.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import gamestore_backend.modules.commerce.CommerceException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class DeveloperService {
    private final JdbcTemplate jdbc;

    public DeveloperService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<DeveloperSubmissionResponse> SUBMISSION_MAPPER = (rs, rowNum) ->
            new DeveloperSubmissionResponse(
                    rs.getObject("id", UUID.class),
                    rs.getObject("user_id", UUID.class),
                    rs.getString("username"),
                    rs.getString("status"),
                    rs.getString("application_reason"),
                    rs.getString("reason"));

    private void lock() {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtext('gamestore.developer-submissions'))", r -> {});
    }

    public UserAccount authenticate(Authentication auth) {
        return authenticate(auth, false);
    }

    private UserAccount authenticate(Authentication auth, boolean lockUser) {
        if (auth == null || !auth.isAuthenticated() || auth.getName() == null || auth.getName().isBlank()) {
            throw new CommerceException(HttpStatus.UNAUTHORIZED, "Vui lòng đăng nhập.");
        }
        return jdbc.query(
                "SELECT id, username, role, status FROM users WHERE lower(username) = lower(?)" + (lockUser ? " FOR UPDATE" : ""),
                (rs, rowNum) -> new UserAccount(
                        rs.getObject("id", UUID.class),
                        rs.getString("username"),
                        rs.getString("role"),
                        rs.getString("status")),
                auth.getName())
                .stream().findFirst()
                .orElseThrow(() -> new CommerceException(HttpStatus.UNAUTHORIZED, "Tài khoản không còn tồn tại."));
    }

    public UserAccount requireAdmin(Authentication auth) {
        return requireAdmin(auth, false);
    }

    private UserAccount requireAdmin(Authentication auth, boolean lockUser) {
        UserAccount actor = authenticate(auth, lockUser);
        if (!actor.isAdmin()) {
            throw new CommerceException(HttpStatus.FORBIDDEN, "Chỉ quản trị viên có tài khoản đã xác minh được thực hiện thao tác này.");
        }
        return actor;
    }

    public List<DeveloperSubmissionResponse> getOwnSubmissions(Authentication auth) {
        UserAccount actor = authenticate(auth);
        if (!actor.isVerified()) {
            throw new CommerceException(HttpStatus.FORBIDDEN, "Tài khoản chưa được xác minh hoặc đã bị khóa.");
        }
        return jdbc.query(
                "SELECT s.id, s.user_id, u.username, s.status, s.application_reason, s.reason " +
                "FROM developer_submissions s JOIN users u ON u.id = s.user_id " +
                "WHERE s.user_id = ? ORDER BY s.id",
                SUBMISSION_MAPPER,
                actor.id());
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public DeveloperSubmissionResponse submit(Authentication auth, DeveloperApplicationInput input) {
        lock();
        UserAccount actor = authenticate(auth, true);
        if (!actor.isVerified()) {
            throw new CommerceException(HttpStatus.FORBIDDEN, "Tài khoản chưa được xác minh hoặc đã bị khóa.");
        }
        if (!"USER".equals(actor.role())) {
            throw new CommerceException(HttpStatus.FORBIDDEN, "Chỉ tài khoản người dùng (USER) mới có thể gửi đơn đăng ký nhà phát triển.");
        }
        if (input == null || input.application_reason() == null) {
            throw new CommerceException(HttpStatus.BAD_REQUEST, "Lý do đăng ký không được để trống.");
        }
        String reason = input.application_reason().strip();
        if (reason.isEmpty() || reason.length() > 2000) {
            throw new CommerceException(HttpStatus.BAD_REQUEST, "Lý do đăng ký phải từ 1 đến 2000 ký tự.");
        }
        boolean hasPending = Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM developer_submissions WHERE user_id = ? AND status = 'PENDING')",
                Boolean.class,
                actor.id()));
        if (hasPending) {
            throw new CommerceException(HttpStatus.CONFLICT, "Bạn đã có đơn đăng ký đang chờ duyệt.");
        }
        UUID id = jdbc.queryForObject(
                "INSERT INTO developer_submissions (user_id, application_reason, status) VALUES (?, ?, 'PENDING') RETURNING id",
                UUID.class,
                actor.id(),
                reason);
        return findSubmission(id);
    }

    public DeveloperSubmissionPage getAdminSubmissions(Authentication auth, String status, String q, int page, int size) {
        requireAdmin(auth);
        if (status != null && !status.isBlank() && !Set.of("PENDING", "ACCEPTED", "REJECTED").contains(status)) {
            throw new CommerceException(HttpStatus.BAD_REQUEST, "Bộ lọc trạng thái không hợp lệ.");
        }
        if (page < 0 || size < 1 || size > 100) {
            throw new CommerceException(HttpStatus.BAD_REQUEST, "Phân trang không hợp lệ.");
        }
        if (q != null && q.length() > 200) {
            throw new CommerceException(HttpStatus.BAD_REQUEST, "Từ khóa tối đa 200 ký tự.");
        }
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        List<Object> countParams = new ArrayList<>();
        if (status != null && !status.isBlank()) {
            where.append(" AND s.status = ?");
            countParams.add(status);
        }
        if (q != null && !q.isBlank()) {
            where.append(" AND strpos(lower(u.username), lower(?)) > 0");
            countParams.add(q.strip());
        }
        Long total = jdbc.queryForObject(
                "SELECT count(*) FROM developer_submissions s JOIN users u ON u.id = s.user_id" + where,
                Long.class,
                countParams.toArray());
        long totalCount = total != null ? total : 0L;

        List<Object> selectParams = new ArrayList<>(countParams);
        selectParams.add(size);
        selectParams.add((long) page * size);

        List<DeveloperSubmissionResponse> items = jdbc.query(
                "SELECT s.id, s.user_id, u.username, s.status, s.application_reason, s.reason " +
                "FROM developer_submissions s JOIN users u ON u.id = s.user_id" + where +
                " ORDER BY s.id LIMIT ? OFFSET ?",
                SUBMISSION_MAPPER,
                selectParams.toArray());

        return new DeveloperSubmissionPage(items, totalCount, page, size);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public DeveloperSubmissionResponse review(Authentication auth, UUID id, DeveloperReviewInput input) {
        lock();
        requireAdmin(auth, true);
        if (id == null) {
            throw new CommerceException(HttpStatus.BAD_REQUEST, "Mã đơn đăng ký không hợp lệ.");
        }
        if (input == null || input.status() == null || !Set.of("ACCEPTED", "REJECTED").contains(input.status())) {
            throw new CommerceException(HttpStatus.BAD_REQUEST, "Quyết định duyệt phải là ACCEPTED hoặc REJECTED.");
        }
        String reviewReason = input.reason() == null ? "" : input.reason().strip();
        if (reviewReason.isEmpty() || reviewReason.length() > 2000) {
            throw new CommerceException(HttpStatus.BAD_REQUEST, "Lý do phản hồi phải từ 1 đến 2000 ký tự.");
        }
        List<DeveloperSubmissionResponse> submissions = jdbc.query(
                "SELECT s.id, s.user_id, u.username, s.status, s.application_reason, s.reason " +
                "FROM developer_submissions s JOIN users u ON u.id = s.user_id WHERE s.id = ?",
                SUBMISSION_MAPPER,
                id);
        if (submissions.isEmpty()) {
            throw new CommerceException(HttpStatus.NOT_FOUND, "Không tìm thấy đơn đăng ký.");
        }
        DeveloperSubmissionResponse submission = submissions.get(0);
        if (!"PENDING".equals(submission.status())) {
            throw new CommerceException(HttpStatus.CONFLICT, "Đơn đăng ký không ở trạng thái chờ duyệt.");
        }

        List<UserAccount> targetUsers = jdbc.query(
                "SELECT id, username, role, status FROM users WHERE id = ? FOR UPDATE",
                (rs, rowNum) -> new UserAccount(
                        rs.getObject("id", UUID.class),
                        rs.getString("username"),
                        rs.getString("role"),
                        rs.getString("status")),
                submission.user_id());
        if (targetUsers.isEmpty()) {
            throw new CommerceException(HttpStatus.CONFLICT, "Người dùng không còn tồn tại.");
        }
        UserAccount targetUser = targetUsers.get(0);
        if (!targetUser.isUser()) {
            throw new CommerceException(HttpStatus.CONFLICT, "Người dùng không còn là tài khoản người dùng hợp lệ (VERIFIED USER).");
        }

        if ("ACCEPTED".equals(input.status())) {
            int updated = jdbc.update(
                    "UPDATE users SET role = 'DEVELOPER' WHERE id = ? AND role = 'USER' AND status = 'VERIFIED'",
                    targetUser.id());
            if (updated != 1) {
                throw new CommerceException(HttpStatus.CONFLICT, "Không thể cập nhật quyền người dùng.");
            }
        }

        jdbc.update(
                "UPDATE developer_submissions SET status = ?, reason = ? WHERE id = ?",
                input.status(),
                reviewReason,
                id);

        return findSubmission(id);
    }

    private DeveloperSubmissionResponse findSubmission(UUID id) {
        return jdbc.query(
                "SELECT s.id, s.user_id, u.username, s.status, s.application_reason, s.reason " +
                "FROM developer_submissions s JOIN users u ON u.id = s.user_id WHERE s.id = ?",
                SUBMISSION_MAPPER,
                id)
                .stream().findFirst()
                .orElseThrow(() -> new CommerceException(HttpStatus.NOT_FOUND, "Không tìm thấy đơn đăng ký."));
    }
}
