package gamestore_backend.modules.catalog;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Map;
import java.io.IOException;
import gamestore_backend.modules.commerce.CommerceException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.multipart.MultipartFile;

@Service
public class CloudinaryImages {
    private final String configuration;
    private final RestClient client;
    @Autowired
    public CloudinaryImages(@Value("${cloudinary.url:${CLOUDINARY_URL:}}") String configuration) {
        this(configuration, uploadClient());
    }
    CloudinaryImages(String configuration, RestClient.Builder builder) {
        this.configuration = configuration;
        this.client = builder.build();
    }
    private static RestClient.Builder uploadClient() {
        var http = java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
        var factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(Duration.ofSeconds(30));
        return RestClient.builder().requestFactory(factory);
    }
    public String upload(MultipartFile file) {
        if (file.isEmpty() || file.getSize() > 5 * 1024 * 1024)
            throw new CommerceException(HttpStatus.BAD_REQUEST, "Ảnh phải có dung lượng từ 1 byte đến 5 MB.");
        byte[] bytes;
        try { bytes = file.getBytes(); }
        catch (IOException invalid) { throw new CommerceException(HttpStatus.BAD_REQUEST, "Không đọc được ảnh."); }
        String extension = format(bytes);
        validateDimensions(bytes);
        URI config;
        String[] credentials;
        try {
            config = URI.create(configuration);
            if (!"cloudinary".equals(config.getScheme()) || config.getHost() == null || !config.getHost().matches("[a-zA-Z0-9_-]+")) throw new IllegalArgumentException();
            credentials = config.getUserInfo().split(":", 2);
            if (credentials.length != 2 || credentials[0].isBlank() || credentials[1].isBlank()) throw new IllegalArgumentException();
        } catch (RuntimeException invalid) { throw new CommerceException(HttpStatus.SERVICE_UNAVAILABLE, "Chưa cấu hình Cloudinary hợp lệ. Vui lòng liên hệ quản trị viên."); }
        String timestamp = Long.toString(Instant.now().getEpochSecond());
        String signature;
        try { signature = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(("timestamp=" + timestamp + credentials[1]).getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException("SHA-256 unavailable"); }
        var body = new LinkedMultiValueMap<String, Object>();
        body.add("api_key", credentials[0]); body.add("timestamp", timestamp); body.add("signature", signature);
        body.add("file", new ByteArrayResource(bytes) { @Override public String getFilename() { return "game-cover." + extension; } });
        try {
            Map<?, ?> response = client.post().uri("https://api.cloudinary.com/v1_1/" + config.getHost() + "/image/upload")
                .contentType(MediaType.MULTIPART_FORM_DATA).body(body).retrieve().body(Map.class);
            Object url = response == null ? null : response.get("secure_url");
            if (!(url instanceof String value) || !value.startsWith("https://")) throw new CommerceException(HttpStatus.BAD_GATEWAY, "Cloudinary chưa trả về URL ảnh hợp lệ.");
            return (String) url;
        } catch (RestClientException failure) {
            // Never return remote diagnostics: they may include account details or credentials.
            throw new CommerceException(HttpStatus.BAD_GATEWAY, "Không tải ảnh lên Cloudinary được. Vui lòng thử lại.");
        }
    }
    private static void validateDimensions(byte[] bytes) {
        try (var stream = new javax.imageio.stream.MemoryCacheImageInputStream(new java.io.ByteArrayInputStream(bytes))) {
            var readers = javax.imageio.ImageIO.getImageReaders(stream);
            if (!readers.hasNext()) throw new IOException("Unsupported image");
            var reader = readers.next();
            try {
                reader.setInput(stream);
                if (reader.getWidth(0) != 512 || reader.getHeight(0) != 512)
                    throw new IOException("Invalid dimensions");
                if (reader.read(0) == null) throw new IOException("Invalid image");
            } finally { reader.dispose(); }
        } catch (IOException | RuntimeException invalid) {
            throw new CommerceException(HttpStatus.BAD_REQUEST, "Ảnh tải lên phải hợp lệ và có kích thước 512×512 px. Vui lòng crop ảnh trước khi tải lên.");
        }
    }
    static String format(byte[] bytes) {
        if (bytes.length >= 8 && bytes[0] == (byte) 0x89 && bytes[1] == 'P' && bytes[2] == 'N' && bytes[3] == 'G'
            && bytes[4] == 13 && bytes[5] == 10 && bytes[6] == 26 && bytes[7] == 10) return "png";
        if (bytes.length >= 3 && bytes[0] == (byte) 0xff && bytes[1] == (byte) 0xd8 && bytes[2] == (byte) 0xff) return "jpg";
        if (bytes.length >= 12 && new String(bytes, 0, 4, StandardCharsets.US_ASCII).equals("RIFF")
            && new String(bytes, 8, 4, StandardCharsets.US_ASCII).equals("WEBP")) return "webp";
        throw new CommerceException(HttpStatus.BAD_REQUEST, "Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.");
    }
}
