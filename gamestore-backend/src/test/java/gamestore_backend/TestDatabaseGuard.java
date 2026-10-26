package gamestore_backend;

import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;

/** Prevent Flyway and data-writing tests from accidentally targeting the configured application database. */
public class TestDatabaseGuard implements ApplicationContextInitializer<ConfigurableApplicationContext> {
    @Override public void initialize(ConfigurableApplicationContext context) {
        String url = context.getEnvironment().getProperty("spring.datasource.url", "");
        if (!url.matches("jdbc:postgresql://(127\\.0\\.0\\.1|localhost):[0-9]+/[a-zA-Z0-9_]+_test(\\?.*)?")) {
            throw new IllegalStateException("Tests require an explicitly named local test database; refusing URL outside localhost/*_test.");
        }
    }
}
