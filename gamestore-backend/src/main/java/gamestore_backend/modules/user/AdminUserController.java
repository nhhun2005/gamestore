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

    // 1. Lấy danh sách toàn bộ người dùng
    @GetMapping
    public ResponseEntity<List<UserResponse>> getAllUsers() {
        List<UserResponse> users = userRepository.findAll()
                .stream()
                .map(UserResponse::fromEntity)
                .toList();
        return ResponseEntity.ok(users);
    }

    // 2. Cập nhật Role của người dùng khác
    @PutMapping("/{id}/role")
    public ResponseEntity<?> updateUserRole(
            @PathVariable UUID id,
            @RequestBody UpdateRoleRequest req,
            Authentication authentication) {

        if (req.role() == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "Role không hợp lệ."));
        }

        Optional<User> userOpt = userRepository.findById(id);
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Không tìm thấy người dùng."));
        }

        User targetUser = userOpt.get();

        // Không cho phép Admin tự đổi role của chính mình
        if (targetUser.getUsername().equalsIgnoreCase(authentication.getName())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", "Bạn không thể tự thay đổi vai trò của chính mình."));
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
        if (targetUser.getUsername().equalsIgnoreCase(authentication.getName())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", "Bạn không thể tự thay đổi trạng thái của chính mình."));
        }

        targetUser.setStatus(req.status());
        userRepository.save(targetUser);

        return ResponseEntity.ok(UserResponse.fromEntity(targetUser));
    }
}
