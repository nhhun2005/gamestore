package gamestore_backend.modules.catalog;

import jakarta.servlet.MultipartConfigElement;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class CatalogUploadConfig {
    @Bean
    MultipartConfigElement multipartConfigElement() { return new MultipartConfigElement("", 5 * 1024 * 1024, 6 * 1024 * 1024, 0); }
}
