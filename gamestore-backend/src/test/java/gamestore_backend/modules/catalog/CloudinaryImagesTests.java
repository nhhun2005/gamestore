package gamestore_backend.modules.catalog;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import gamestore_backend.modules.commerce.CommerceException;

class CloudinaryImagesTests {
    private final byte[] png = image(512, 512);
    private static byte[] image(int width, int height) {
        try {
            var bytes = new java.io.ByteArrayOutputStream();
            javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(width, height, java.awt.image.BufferedImage.TYPE_INT_RGB), "png", bytes);
            return bytes.toByteArray();
        } catch (java.io.IOException failure) { throw new IllegalStateException(failure); }
    }
    @Test void rejectsWrongDimensionsAndCorruptedImageBeforeUpload() {
        var images = new CloudinaryImages("cloudinary://test-key:test-secret@test-cloud", RestClient.builder());
        for (byte[] invalid : new byte[][] {image(512, 511), image(1024, 1024), new byte[] {(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10, 0}})
            assertEquals(400, assertThrows(CommerceException.class, () -> images.upload(new MockMultipartFile("file", invalid))).status().value());
    }
    @Test void signedServerUploadReturnsOnlySecureUrl() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var images = new CloudinaryImages("cloudinary://test-key:test-secret@test-cloud", builder);
        server.expect(requestTo("https://api.cloudinary.com/v1_1/test-cloud/image/upload"))
            .andExpect(method(org.springframework.http.HttpMethod.POST))
            .andExpect(request -> {
                var mock = (org.springframework.mock.http.client.MockClientHttpRequest) request;
                String body = mock.getBodyAsString(StandardCharsets.ISO_8859_1);
                assertTrue(body.contains("name=\"signature\"")); assertTrue(body.contains("test-key"));
                assertFalse(body.contains("test-secret")); assertTrue(body.contains("game-cover.png"));
            })
            .andRespond(withSuccess("{\"secure_url\":\"https://res.cloudinary.com/test-cloud/image/upload/cover.png\"}", MediaType.APPLICATION_JSON));
        assertEquals("https://res.cloudinary.com/test-cloud/image/upload/cover.png", images.upload(new MockMultipartFile("file", "fake.txt", "text/plain", png)));
        server.verify();
    }
    @Test void rejectsInvalidEmptyOversizeAndUnconfiguredUploads() {
        var images = new CloudinaryImages("", RestClient.builder());
        assertEquals(400, assertThrows(CommerceException.class, () -> images.upload(new MockMultipartFile("file", new byte[0]))).status().value());
        assertEquals(400, assertThrows(CommerceException.class, () -> images.upload(new MockMultipartFile("file", "<svg/>".getBytes(StandardCharsets.UTF_8)))).status().value());
        assertEquals(400, assertThrows(CommerceException.class, () -> images.upload(new MockMultipartFile("file", new byte[5 * 1024 * 1024 + 1]))).status().value());
        assertEquals(503, assertThrows(CommerceException.class, () -> images.upload(new MockMultipartFile("file", png))).status().value());
    }
    @Test void cloudinaryFailuresAreSanitized() {
        var builder = RestClient.builder(); var server = MockRestServiceServer.bindTo(builder).build();
        var images = new CloudinaryImages("cloudinary://test-key:test-secret@test-cloud", builder);
        server.expect(requestTo("https://api.cloudinary.com/v1_1/test-cloud/image/upload"))
            .andRespond(withBadRequest().body("private test-secret diagnostic"));
        var error = assertThrows(CommerceException.class, () -> images.upload(new MockMultipartFile("file", png)));
        assertEquals(502, error.status().value()); assertFalse(error.getMessage().contains("test-secret")); server.verify();
    }
}
