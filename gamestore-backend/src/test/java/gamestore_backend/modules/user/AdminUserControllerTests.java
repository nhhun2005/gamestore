package gamestore_backend.modules.user;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;

class AdminUserControllerTests {

    private UserRepository userRepository;
    private AdminUserController controller;
    private Authentication adminAuth;

    private final UUID adminId = UUID.randomUUID();
    private final UUID otherAdminId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();
    private final UUID devId = UUID.randomUUID();

    private User currentAdmin;
    private User otherAdmin;
    private User normalUser;
    private User devUser;

    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        controller = new AdminUserController(userRepository);

        adminAuth = mock(Authentication.class);
        when(adminAuth.getName()).thenReturn("admin1");

        currentAdmin = new User("admin1", "admin1@test.com", "pass", Role.ADMINISTRATOR);
        currentAdmin.setId(adminId);

        otherAdmin = new User("admin2", "admin2@test.com", "pass", Role.ADMINISTRATOR);
        otherAdmin.setId(otherAdminId);

        normalUser = new User("user1", "user1@test.com", "pass", Role.USER);
        normalUser.setId(userId);

        devUser = new User("dev1", "dev1@test.com", "pass", Role.DEVELOPER);
        devUser.setId(devId);
    }

    @Test
    void getAllUsers_excludesOtherAdmins() {
        when(userRepository.findAll()).thenReturn(List.of(currentAdmin, otherAdmin, normalUser, devUser));

        ResponseEntity<List<AdminUserController.UserResponse>> response = controller.getAllUsers(adminAuth);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        List<AdminUserController.UserResponse> body = response.getBody();
        assertNotNull(body);
        assertEquals(3, body.size());

        List<String> usernames = body.stream().map(AdminUserController.UserResponse::username).toList();
        assertTrue(usernames.contains("admin1"));
        assertTrue(usernames.contains("user1"));
        assertTrue(usernames.contains("dev1"));
        assertFalse(usernames.contains("admin2"), "Other admins must not be visible");
    }

    @Test
    void updateUserRole_rejectsAdministratorRoleAssignment() {
        AdminUserController.UpdateRoleRequest req = new AdminUserController.UpdateRoleRequest(Role.ADMINISTRATOR);

        ResponseEntity<?> response = controller.updateUserRole(userId, req, adminAuth);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        verify(userRepository, never()).save(any());
    }

    @Test
    void updateUserRole_rejectsNullRole() {
        AdminUserController.UpdateRoleRequest req = new AdminUserController.UpdateRoleRequest(null);

        ResponseEntity<?> response = controller.updateUserRole(userId, req, adminAuth);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        verify(userRepository, never()).save(any());
    }

    @Test
    void updateUserRole_rejectsUpdatingOtherAdmin() {
        when(userRepository.findById(otherAdminId)).thenReturn(Optional.of(otherAdmin));
        AdminUserController.UpdateRoleRequest req = new AdminUserController.UpdateRoleRequest(Role.USER);

        ResponseEntity<?> response = controller.updateUserRole(otherAdminId, req, adminAuth);

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        verify(userRepository, never()).save(any());
    }

    @Test
    void updateUserRole_rejectsSelfRoleChange() {
        when(userRepository.findById(adminId)).thenReturn(Optional.of(currentAdmin));
        AdminUserController.UpdateRoleRequest req = new AdminUserController.UpdateRoleRequest(Role.USER);

        ResponseEntity<?> response = controller.updateUserRole(adminId, req, adminAuth);

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        verify(userRepository, never()).save(any());
    }

    @Test
    void updateUserRole_allowsUpdatingUserToDeveloper() {
        when(userRepository.findById(userId)).thenReturn(Optional.of(normalUser));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        AdminUserController.UpdateRoleRequest req = new AdminUserController.UpdateRoleRequest(Role.DEVELOPER);

        ResponseEntity<?> response = controller.updateUserRole(userId, req, adminAuth);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(Role.DEVELOPER, normalUser.getRole());
        verify(userRepository).save(normalUser);
    }

    @Test
    void updateUserRole_allowsUpdatingDeveloperToUser() {
        when(userRepository.findById(devId)).thenReturn(Optional.of(devUser));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        AdminUserController.UpdateRoleRequest req = new AdminUserController.UpdateRoleRequest(Role.USER);

        ResponseEntity<?> response = controller.updateUserRole(devId, req, adminAuth);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(Role.USER, devUser.getRole());
        verify(userRepository).save(devUser);
    }

    @Test
    void updateUserStatus_rejectsUpdatingOtherAdmin() {
        when(userRepository.findById(otherAdminId)).thenReturn(Optional.of(otherAdmin));
        AdminUserController.UpdateStatusRequest req = new AdminUserController.UpdateStatusRequest(UserStatus.BANNED);

        ResponseEntity<?> response = controller.updateUserStatus(otherAdminId, req, adminAuth);

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        verify(userRepository, never()).save(any());
    }

    @Test
    void updateUserStatus_allowsUpdatingLowerTierUser() {
        when(userRepository.findById(userId)).thenReturn(Optional.of(normalUser));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        AdminUserController.UpdateStatusRequest req = new AdminUserController.UpdateStatusRequest(UserStatus.BANNED);

        ResponseEntity<?> response = controller.updateUserStatus(userId, req, adminAuth);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(UserStatus.BANNED, normalUser.getStatus());
        verify(userRepository).save(normalUser);
    }
}
