package gamestore_backend.modules.user;


import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import gamestore_backend.modules.config.JwtService;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final EmailService emailService;
    private final long verificationTtlHours;

    public AuthController(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService,
            EmailService emailService,
            @Value("${app.invitation.ttl-hours:24}") long verificationTtlHours) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.emailService = emailService;
        this.verificationTtlHours = verificationTtlHours;
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

        // Tạo token xác thực email
        UUID verificationToken = UUID.randomUUID();
        newUser.setVerificationToken(verificationToken);
        newUser.setVerificationTokenExpiry(Instant.now().plus(verificationTtlHours, ChronoUnit.HOURS));
        // Status mặc định là PENDING — user phải xác thực email trước khi đăng nhập

        userRepository.save(newUser);

        // Gửi email xác thực
        emailService.sendVerificationEmail(newUser.getEmail(), newUser.getUsername(), verificationToken);

        return ResponseEntity.status(HttpStatus.CREATED).body(
                Map.of("message",
                        "Đăng ký thành công! Vui lòng kiểm tra email để xác thực tài khoản."));
    }

    @GetMapping("/verify")
    public ResponseEntity<?> verifyEmail(@RequestParam("token") UUID token) {
        Optional<User> userOpt = userRepository.findByVerificationToken(token);

        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("message", "Link xác thực không hợp lệ hoặc đã được sử dụng."));
        }

        User user = userOpt.get();

        if (user.getStatus() == UserStatus.VERIFIED) {
            return ResponseEntity.ok(Map.of("message", "Tài khoản đã được xác thực trước đó. Bạn có thể đăng nhập."));
        }

        if (user.getVerificationTokenExpiry() != null && Instant.now().isAfter(user.getVerificationTokenExpiry())) {
            return ResponseEntity.status(HttpStatus.GONE)
                    .body(Map.of("message", "Link xác thực đã hết hạn. Vui lòng yêu cầu gửi lại email xác thực."));
        }

        user.setStatus(UserStatus.VERIFIED);
        userRepository.save(user);

        return ResponseEntity.ok(Map.of("message", "Xác thực email thành công! Bạn có thể đăng nhập ngay bây giờ."));
    }

    @PostMapping("/resend-verification")
    public ResponseEntity<?> resendVerification(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        if (email == null || email.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Vui lòng nhập email."));
        }

        Optional<User> userOpt = userRepository.findByEmailIgnoreCase(email.trim());

        if (userOpt.isEmpty()) {
            // Không tiết lộ email có tồn tại hay không
            return ResponseEntity.ok(
                    Map.of("message", "Nếu email tồn tại trong hệ thống, chúng tôi đã gửi lại email xác thực."));
        }

        User user = userOpt.get();

        if (user.getStatus() != UserStatus.PENDING) {
            return ResponseEntity.ok(
                    Map.of("message", "Nếu email tồn tại trong hệ thống, chúng tôi đã gửi lại email xác thực."));
        }

        UUID newToken = UUID.randomUUID();
        user.setVerificationToken(newToken);
        user.setVerificationTokenExpiry(Instant.now().plus(verificationTtlHours, ChronoUnit.HOURS));
        userRepository.save(user);

        emailService.sendVerificationEmail(user.getEmail(), user.getUsername(), newToken);

        return ResponseEntity.ok(
                Map.of("message", "Nếu email tồn tại trong hệ thống, chúng tôi đã gửi lại email xác thực."));
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

        // Kiểm tra trạng thái tài khoản
        if (user.getStatus() == UserStatus.BANNED) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", "Tài khoản của bạn đã bị khóa (BANNED)."));
        }
        if (user.getStatus() == UserStatus.PENDING) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message",
                            "Tài khoản chưa được xác thực. Vui lòng kiểm tra email để xác thực tài khoản.",
                            "needsVerification", true,
                            "email", user.getEmail()));
        }

        // Dọn dẹp token xác thực sau khi người dùng đăng nhập thành công
        if (user.getVerificationToken() != null) {
            user.setVerificationToken(null);
            user.setVerificationTokenExpiry(null);
            userRepository.save(user);
        }

        String token = jwtService.generateToken(user);
        return ResponseEntity.ok(
                new AuthResponse(token, user.getId().toString(), user.getUsername(), user.getEmail(),
                        user.getRole().name()));
    }
}
