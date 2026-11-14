package gamestore_backend.modules.user;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;

import gamestore_backend.modules.config.JwtService;

class AuthControllerTests {

    private UserRepository userRepository;
    private PasswordEncoder passwordEncoder;
    private JwtService jwtService;
    private EmailService emailService;
    private AuthController controller;

    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        passwordEncoder = mock(PasswordEncoder.class);
        jwtService = mock(JwtService.class);
        emailService = mock(EmailService.class);
        controller = new AuthController(userRepository, passwordEncoder, jwtService, emailService, 24);
    }

    @Test
    void register_createsPendingUserAndSendsEmail() {
        when(userRepository.existsByUsernameIgnoreCase("newuser")).thenReturn(false);
        when(userRepository.existsByEmailIgnoreCase("new@example.com")).thenReturn(false);
        when(passwordEncoder.encode("password123")).thenReturn("hashedPass");
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        AuthController.RegisterRequest req = new AuthController.RegisterRequest("newuser", "new@example.com", "password123");
        ResponseEntity<?> response = controller.register(req);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        verify(emailService, times(1)).sendVerificationEmail(eq("new@example.com"), eq("newuser"), any(UUID.class));
        verify(userRepository).save(argThat(u ->
                u.getUsername().equals("newuser") &&
                u.getEmail().equals("new@example.com") &&
                u.getStatus() == UserStatus.PENDING &&
                u.getVerificationToken() != null &&
                u.getVerificationTokenExpiry() != null
        ));
    }

    @Test
    void register_failsWhenUsernameExists() {
        when(userRepository.existsByUsernameIgnoreCase("existing")).thenReturn(true);

        AuthController.RegisterRequest req = new AuthController.RegisterRequest("existing", "test@example.com", "password123");
        ResponseEntity<?> response = controller.register(req);

        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
        verify(userRepository, never()).save(any());
        verify(emailService, never()).sendVerificationEmail(any(), any(), any());
    }

    @Test
    void verifyEmail_successWithValidToken() {
        UUID token = UUID.randomUUID();
        User user = new User("player1", "player1@example.com", "pass", Role.USER);
        user.setStatus(UserStatus.PENDING);
        user.setVerificationToken(token);
        user.setVerificationTokenExpiry(Instant.now().plus(24, ChronoUnit.HOURS));

        when(userRepository.findByVerificationToken(token)).thenReturn(Optional.of(user));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        ResponseEntity<?> response = controller.verifyEmail(token);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(UserStatus.VERIFIED, user.getStatus());
        verify(userRepository).save(user);
    }

    @Test
    void verifyEmail_failsWithInvalidToken() {
        UUID token = UUID.randomUUID();
        when(userRepository.findByVerificationToken(token)).thenReturn(Optional.empty());

        ResponseEntity<?> response = controller.verifyEmail(token);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        verify(userRepository, never()).save(any());
    }

    @Test
    void verifyEmail_failsWithExpiredToken() {
        UUID token = UUID.randomUUID();
        User user = new User("player1", "player1@example.com", "pass", Role.USER);
        user.setStatus(UserStatus.PENDING);
        user.setVerificationToken(token);
        user.setVerificationTokenExpiry(Instant.now().minus(1, ChronoUnit.HOURS));

        when(userRepository.findByVerificationToken(token)).thenReturn(Optional.of(user));

        ResponseEntity<?> response = controller.verifyEmail(token);

        assertEquals(HttpStatus.GONE, response.getStatusCode());
        assertEquals(UserStatus.PENDING, user.getStatus());
        verify(userRepository, never()).save(any());
    }

    @Test
    void verifyEmail_returnsOkIfAlreadyVerified() {
        UUID token = UUID.randomUUID();
        User user = new User("player1", "player1@example.com", "pass", Role.USER);
        user.setStatus(UserStatus.VERIFIED);

        when(userRepository.findByVerificationToken(token)).thenReturn(Optional.of(user));

        ResponseEntity<?> response = controller.verifyEmail(token);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(userRepository, never()).save(any());
    }

    @Test
    void resendVerification_sendsEmailForPendingUser() {
        User user = new User("pendingUser", "pending@example.com", "pass", Role.USER);
        user.setStatus(UserStatus.PENDING);

        when(userRepository.findByEmailIgnoreCase("pending@example.com")).thenReturn(Optional.of(user));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        ResponseEntity<?> response = controller.resendVerification(Map.of("email", "pending@example.com"));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(emailService, times(1)).sendVerificationEmail(eq("pending@example.com"), eq("pendingUser"), any(UUID.class));
        verify(userRepository).save(user);
    }

    @Test
    void login_failsForPendingUserWithVerificationDetails() {
        User user = new User("pendingUser", "pending@example.com", "hashedPass", Role.USER);
        user.setStatus(UserStatus.PENDING);

        when(userRepository.findByUsernameIgnoreCase("pendingUser")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("password123", "hashedPass")).thenReturn(true);

        AuthController.LoginRequest req = new AuthController.LoginRequest("pendingUser", "password123");
        ResponseEntity<?> response = controller.login(req);

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        assertTrue(response.getBody() instanceof Map);
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertEquals(true, body.get("needsVerification"));
        assertEquals("pending@example.com", body.get("email"));
    }

    @Test
    void login_succeedsForVerifiedUser() {
        UUID id = UUID.randomUUID();
        User user = new User("verifiedUser", "verified@example.com", "hashedPass", Role.USER);
        user.setId(id);
        user.setStatus(UserStatus.VERIFIED);

        when(userRepository.findByUsernameIgnoreCase("verifiedUser")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("password123", "hashedPass")).thenReturn(true);
        when(jwtService.generateToken(user)).thenReturn("jwt-mock-token");

        AuthController.LoginRequest req = new AuthController.LoginRequest("verifiedUser", "password123");
        ResponseEntity<?> response = controller.login(req);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody() instanceof AuthController.AuthResponse);
        AuthController.AuthResponse authResp = (AuthController.AuthResponse) response.getBody();
        assertEquals("jwt-mock-token", authResp.token());
        assertEquals("verifiedUser", authResp.username());
    }
}
