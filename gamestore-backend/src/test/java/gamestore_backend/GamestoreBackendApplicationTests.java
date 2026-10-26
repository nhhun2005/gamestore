package gamestore_backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
@org.springframework.test.context.ActiveProfiles("test")
@org.springframework.test.context.ContextConfiguration(initializers = TestDatabaseGuard.class)
class GamestoreBackendApplicationTests {

	@Test
	void contextLoads() {
	}

}
