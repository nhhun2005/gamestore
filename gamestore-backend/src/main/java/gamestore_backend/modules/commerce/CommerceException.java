package gamestore_backend.modules.commerce;

import org.springframework.http.HttpStatus;

public class CommerceException extends RuntimeException {
    private final HttpStatus status;
    public CommerceException(HttpStatus status, String message) { super(message); this.status = status; }
    public HttpStatus status() { return status; }
}
