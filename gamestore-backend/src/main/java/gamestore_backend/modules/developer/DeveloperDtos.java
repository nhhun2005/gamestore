package gamestore_backend.modules.developer;

import java.util.List;
import java.util.UUID;

public class DeveloperDtos {
    public record DeveloperApplicationInput(String application_reason) {}

    public record DeveloperReviewInput(String status, String reason) {}

    public record DeveloperSubmissionResponse(
            UUID id,
            UUID user_id,
            String username,
            String status,
            String application_reason,
            String reason) {}

    public record DeveloperSubmissionPage(
            List<DeveloperSubmissionResponse> items,
            long total,
            int page,
            int size) {}

    public record UserAccount(
            UUID id,
            String username,
            String role,
            String status) {
        public boolean isVerified() {
            return "VERIFIED".equals(status);
        }

        public boolean isAdmin() {
            return isVerified() && "ADMINISTRATOR".equals(role);
        }

        public boolean isUser() {
            return isVerified() && "USER".equals(role);
        }
    }
}
