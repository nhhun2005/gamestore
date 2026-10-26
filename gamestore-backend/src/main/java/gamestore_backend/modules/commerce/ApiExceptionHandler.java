package gamestore_backend.modules.commerce;

import java.util.Map;
import jakarta.validation.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(CommerceException.class)
    ResponseEntity<?> commerce(CommerceException error) { return ResponseEntity.status(error.status()).body(Map.of("message", error.getMessage())); }
    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentNotValidException.class,
        MethodArgumentTypeMismatchException.class, MissingRequestHeaderException.class, ConstraintViolationException.class})
    ResponseEntity<?> invalid(Exception error) { return ResponseEntity.badRequest().body(Map.of("message", "Dữ liệu không hợp lệ. Kiểm tra số tiền, điểm đánh giá, mã yêu cầu hoặc bộ lọc.")); }
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<?> conflict(DataIntegrityViolationException error) { return ResponseEntity.status(409).body(Map.of("message", "Dữ liệu đã tồn tại hoặc đã thay đổi. Vui lòng tải lại và thử lại.")); }
}
