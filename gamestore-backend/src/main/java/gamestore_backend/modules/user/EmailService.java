package gamestore_backend.modules.user;

import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;

@Service
public class EmailService {

    private final JavaMailSender mailSender;
    private final String fromEmail;
    private final String frontendUrl;

    public EmailService(
            JavaMailSender mailSender,
            @Value("${spring.mail.username}") String fromEmail,
            @Value("${app.invitation.frontend-url:http://localhost:5173}") String frontendUrl) {
        this.mailSender = mailSender;
        this.fromEmail = fromEmail;
        this.frontendUrl = frontendUrl;
    }

    public void sendVerificationEmail(String toEmail, String username, UUID token) {
        String verifyLink = frontendUrl + "/verify?token=" + token.toString();
        String subject = "🎮 Steam Store – Xác thực tài khoản của bạn";
        String htmlBody = """
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#1b2838;color:#c7d5e0;padding:32px;border-radius:6px">
                  <h1 style="color:#66c0f4;font-size:24px;margin-bottom:8px">🎮 Steam Store</h1>
                  <h2 style="color:#ffffff;font-size:20px;margin-top:0">Xin chào %s!</h2>
                  <p style="font-size:15px;line-height:1.6">
                    Cảm ơn bạn đã đăng ký tài khoản trên Steam Store.<br>
                    Vui lòng nhấn nút bên dưới để xác thực email và kích hoạt tài khoản:
                  </p>
                  <div style="text-align:center;margin:28px 0">
                    <a href="%s"
                       style="display:inline-block;padding:14px 36px;background:linear-gradient(90deg,#06bfff,#2d73ff);color:#fff;font-size:16px;font-weight:600;text-decoration:none;border-radius:4px">
                      Xác thực tài khoản
                    </a>
                  </div>
                  <p style="font-size:13px;color:#8f98a0">
                    Nếu nút trên không hoạt động, hãy sao chép và dán link sau vào trình duyệt:<br>
                    <a href="%s" style="color:#66c0f4;word-break:break-all">%s</a>
                  </p>
                  <p style="font-size:12px;color:#556b7e;margin-top:24px;border-top:1px solid #2a475e;padding-top:16px">
                    Link xác thực có hiệu lực trong 24 giờ. Nếu bạn không đăng ký tài khoản này, vui lòng bỏ qua email.
                  </p>
                </div>
                """.formatted(username, verifyLink, verifyLink, verifyLink);

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(fromEmail);
            helper.setTo(toEmail);
            helper.setSubject(subject);
            helper.setText(htmlBody, true);
            mailSender.send(message);
        } catch (MessagingException e) {
            throw new RuntimeException("Không thể gửi email xác thực: " + e.getMessage(), e);
        }
    }
}
