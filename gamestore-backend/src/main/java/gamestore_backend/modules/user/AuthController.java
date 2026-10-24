package gamestore_backend.modules.user;


import java.util.Map;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import gamestore_backend.modules.config.JwtService;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthController(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    public record RegisterRequest(String username, String email, String password) {
    }

    public record LoginRequest(String account, String password) {
    } // Cho phép nhập username hoặc email

    public record AuthResponse(String token, String id, String username, String email, String role) {
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody RegisterRequest req) {
        if (req.username() == null || req.username().isBlank() ||
                req.email() == null || req.email().isBlank() ||
                req.password() == null || req.password().length() < 6) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Vui lòng điền đầy đủ thông tin (mật khẩu tối thiểu 6 ký tự)."));
        }

        if (userRepository.existsByUsernameIgnoreCase(req.username().trim())) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", "Tên tài khoản đã tồn tại."));
        }

        if (userRepository.existsByEmailIgnoreCase(req.email().trim())) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", "Email đã được sử dụng."));
        }

        // Băm mật khẩu bằng BCrypt
        String hashedPassword = passwordEncoder.encode(req.password());

        User newUser = new User(
                req.username().trim(),
                req.email().trim(),
                hashedPassword,
                Role.USER);
        userRepository.save(newUser);

        String token = jwtService.generateToken(newUser);
        return ResponseEntity.status(HttpStatus.CREATED).body(
                new AuthResponse(token, newUser.getId().toString(), newUser.getUsername(), newUser.getEmail(),
                        newUser.getRole().name()));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest req) {
        if (req.account() == null || req.password() == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "Vui lòng nhập tài khoản và mật khẩu."));
        }

        String input = req.account().trim();
        Optional<User> userOpt = userRepository.findByUsernameIgnoreCase(input)
                .or(() -> userRepository.findByEmailIgnoreCase(input));

        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Vui lòng kiểm tra lại mật khẩu và tên tài khoản rồi thử lại."));
        }

        User user = userOpt.get();
        if (!passwordEncoder.matches(req.password(), user.getPassword())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Vui lòng kiểm tra lại mật khẩu và tên tài khoản rồi thử lại."));
        }

        String token = jwtService.generateToken(user);
        return ResponseEntity.ok(
                new AuthResponse(token, user.getId().toString(), user.getUsername(), user.getEmail(),
                        user.getRole().name()));
    }
}