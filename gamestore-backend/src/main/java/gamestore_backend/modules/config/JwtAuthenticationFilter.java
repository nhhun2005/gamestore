package gamestore_backend.modules.config;

import io.jsonwebtoken.Claims;
import gamestore_backend.modules.user.User;
import gamestore_backend.modules.user.UserRepository;
import gamestore_backend.modules.user.UserStatus;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final UserRepository users;

    public JwtAuthenticationFilter(JwtService jwtService, UserRepository users) {
        this.jwtService = jwtService;
        this.users = users;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        String authHeader = request.getHeader("Authorization");

        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);
            try {
                Claims claims = jwtService.extractAllClaims(token);
                String accountId = claims.get("id", String.class);
                if (accountId == null) throw new IllegalArgumentException("Missing account ID");
                User user = users.findById(java.util.UUID.fromString(accountId)).orElse(null);
                if (user != null && user.getUsername().equalsIgnoreCase(claims.getSubject())) {
                    if (user.getStatus() != UserStatus.VERIFIED) {
                        SecurityContextHolder.clearContext();
                        response.setStatus(403);
                        response.setContentType("application/json;charset=UTF-8");
                        response.getWriter().write("{\"message\":\"Tài khoản chưa được xác minh hoặc đã bị khóa.\"}");
                        return;
                    }
                    UsernamePasswordAuthenticationToken authToken = new UsernamePasswordAuthenticationToken(
                            user.getUsername(), null,
                            Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + user.getRole().name())));
                    SecurityContextHolder.getContext().setAuthentication(authToken);
                } else SecurityContextHolder.clearContext();
            } catch (io.jsonwebtoken.JwtException | IllegalArgumentException invalidToken) {
                SecurityContextHolder.clearContext();
            }
        }
        filterChain.doFilter(request, response);
    }
}
