package gamestore_backend;

import static org.junit.jupiter.api.Assertions.*;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import gamestore_backend.modules.commerce.*;

class CommercePriceTests {
    @Test void fractionalDiscountRoundsToDatabaseScaleAndDisabledPromotionsDoNotApply() {
        var promotion = new CommerceDtos.Promotion(UUID.randomUUID(), "Fractional", "12.5", "ENABLED");
        assertEquals(new BigDecimal("2.63"), CommerceService.effectivePrice(new BigDecimal("3.00"), promotion));
        assertEquals(new BigDecimal("3.00"), CommerceService.effectivePrice(new BigDecimal("3.00"), new CommerceDtos.Promotion(promotion.id(), "Disabled", "50", "DISABLED")));
    }
    @Test void bankSimulationIsDisabledByDefault() {
        var service = new CommerceService(null, false);
        var error = assertThrows(CommerceException.class, () -> service.deposit(null, BigDecimal.ONE, UUID.randomUUID()));
        assertEquals(503, error.status().value());
    }
}
