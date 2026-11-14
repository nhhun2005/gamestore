package gamestore_backend.modules.user;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/users")
public class AdminUserController {

    private final UserRepository userRepository;

    public AdminUserController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    // DTO trả về để tránh lộ password hash
    public record UserResponse(UUID id, String username, String email, Role role, UserStatus status) {
        public static UserResponse fromEntity(User user) {
            return new UserResponse(
                    user.getId(),
                    user.getUsername(),
                    user.getEmail(),
                    user.getRole(),
                    user.getStatus());
        }
    }

    public record UpdateRoleRequest(Role role) {
    }

    public record UpdateStatusRequest(UserStatus status) {
    }

    // 1. Lấy danh sách toàn bộ người dùng (trừ các Admin khác)
    @GetMapping
    public ResponseEntity<List<UserResponse>> getAllUsers(Authentication authentication) {
        String currentUsername = authentication != null ? authentication.getName() : null;
        List<UserResponse> users = userRepository.findAll()
                .stream()
                .filter(user -> user.getRole() != Role.ADMINISTRATOR
                        || (currentUsername != null && user.getUsername().equalsIgnoreCase(currentUsername)))
                .map(UserResponse::fromEntity)
                .toList();
        return ResponseEntity.ok(users);
    }

    // 2. Cập nhật Role của người dùng khác (chỉ áp dụng cho người thấp cấp hơn và gán thành USER hoặc DEVELOPER)
    @PutMapping("/{id}/role")
    public ResponseEntity<?> updateUserRole(
            @PathVariable UUID id,
            @RequestBody UpdateRoleRequest req,
            Authentication authentication) {

        if (req.role() == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "Role không hợp lệ."));
        }

        // Chỉ cho phép cập nhật vai trò thành USER hoặc DEVELOPER
        if (req.role() != Role.USER && req.role() != Role.DEVELOPER) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Chỉ được phép cập nhật vai trò thành USER hoặc DEVELOPER."));
        }

        Optional<User> userOpt = userRepository.findById(id);
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Không tìm thấy người dùng."));
        }

        User targetUser = userOpt.get();

        // Không cho phép Admin tự đổi role của chính mình
        if (authentication != null && targetUser.getUsername().equalsIgnoreCase(authentication.getName())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", "Bạn không thể tự thay đổi vai trò của chính mình."));
        }

        // Chỉ được phép cập nhật role của những người thấp cấp hơn (không được chỉnh role của Admin khác)
        if (targetUser.getRole() == Role.ADMINISTRATOR) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", "Bạn chỉ được phép cập nhật vai trò của những người cấp thấp hơn."));
        }

        targetUser.setRole(req.role());
        userRepository.save(targetUser);

        return ResponseEntity.ok(UserResponse.fromEntity(targetUser));
    }

    // 3. Cập nhật Status của người dùng khác
    @PutMapping("/{id}/status")
    public ResponseEntity<?> updateUserStatus(
            @PathVariable UUID id,
            @RequestBody UpdateStatusRequest req,
            Authentication authentication) {

        if (req.status() == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "Trạng thái không hợp lệ."));
        }

        Optional<User> userOpt = userRepository.findById(id);
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Không tìm thấy người dùng."));
        }

        User targetUser = userOpt.get();

        // Không cho phép Admin tự chỉnh status của chính mình
        if (authentication != null && targetUser.getUsername().equalsIgnoreCase(authentication.getName())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", "Bạn không thể tự thay đổi trạng thái của chính mình."));
        }

        // Không cho phép thay đổi status của Admin khác
        if (targetUser.getRole() == Role.ADMINISTRATOR) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", "Bạn không thể thay đổi trạng thái của quản trị viên khác."));
        }

        targetUser.setStatus(req.status());
        userRepository.save(targetUser);

        return ResponseEntity.ok(UserResponse.fromEntity(targetUser));
    }
}
