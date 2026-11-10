# Quy ước database GameStore

Tài liệu mô tả source hiện tại và schema sau khi áp dụng migration V1–V7. Xem [sơ đồ Class Diagram và UCD](diagrams/Diagrams.drawio).

## Kiểu dữ liệu và cấu hình

- PostgreSQL, schema `public`; Flyway là nơi quản lý thay đổi schema. Hibernate dùng `ddl-auto: validate`.
- Khóa chính dùng `UUID`, mặc định `gen_random_uuid()`; khóa ngoại cùng kiểu.
- Tiền dùng `NUMERIC(19,2)` và Java `BigDecimal`, đơn vị duy nhất là **VND**. Không dùng `Double`. Chưa có quy tắc làm tròn tới đồng nguyên; cột vẫn giữ hai chữ số thập phân theo kiểu đã thống nhất.
- Thời gian dùng `TIMESTAMPTZ`; API nên gửi/nhận thời gian kèm múi giờ.
- Giá trị enum được lưu bằng `VARCHAR` + `CHECK`, để bổ sung trạng thái bằng migration. Tên bảng/cột dùng `snake_case`; `User` ánh xạ thành `users`.
- Username và email duy nhất không phân biệt hoa thường qua index `lower(...)`. Service cần trim đầu vào; database không tự chuẩn hóa khoảng trắng.
- `users.password` lưu **password hash**, không lưu mật khẩu nguyên văn. Migration không tạo tài khoản hoặc dữ liệu mẫu.
- `application.yaml` chứa thông tin kết nối cục bộ và đang được gitignore. File mẫu có cấu hình Flyway/JPA và biến môi trường `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`; không commit thông tin đăng nhập.

## Người dùng và developer

Mỗi user có đúng một role: `USER`, `ADMINISTRATOR`, `DEVELOPER`. Trạng thái user gồm `PENDING`, `VERIFIED`, `BANNED`; mặc định `PENDING`. Xóa tài khoản về mặt nghiệp vụ là chuyển sang `BANNED`, giữ nguyên các quan hệ và lịch sử.

`developer_submissions` giữ quan hệ nhiều yêu cầu trên một user. Use case đăng ký nhà phát triển có API/giao diện gửi và xét duyệt đơn; chỉ `VERIFIED USER` được gửi, tối đa một đơn chờ qua service. Admin duyệt thành công đổi role sang `DEVELOPER` trong cùng transaction. V7 được duyệt thêm duy nhất `application_reason TEXT` nullable để lưu lời đăng ký riêng với phản hồi admin trong `reason`; cần áp dụng V7 trước khi dùng chức năng. Xem [đăng ký nhà phát triển](developer-registration.md) để biết API, giới hạn schema và trạng thái áp dụng. Admin vẫn có thể đổi role qua API quản lý người dùng.

## Game và submission

- Game có `developer_id` trỏ tới chủ game, khác với user mua game trong `game_bought`.
- Game có trạng thái `HIDDEN`, `AVAILABLE`, mặc định `HIDDEN`. Xóa game về mặt nghiệp vụ là chuyển sang `HIDDEN`.
- Từ migration V4, game có **0..n submission**: tạo bản nháp trước, gửi đơn đăng tải bằng thao tác riêng. Quy tắc cũ bắt buộc game có submission ngay khi tạo đã được gỡ theo luồng quản lý trò chơi mới.
- `submitted_by` bắt buộc; `reviewed_by` có thể NULL khi `PENDING`, bắt buộc khi `ACCEPTED` hoặc `REJECTED`.
- `created_at` ghi thời điểm gửi đơn và `reviewed_at` ghi thời điểm admin xử lý. `reviewed_at` có thể NULL.
- Một game được gửi duyệt nhiều lần; không có unique constraint trên `game_submissions.game_id`.
- Service kiểm tra chủ sở hữu/developer và quyền admin hiện tại. Duyệt `ACCEPTED` chuyển game sang `AVAILABLE` trong cùng transaction; từ chối giữ game `HIDDEN`. Khi sửa nội dung game thuộc developer, game chuyển `HIDDEN`, các đơn `ACCEPTED` chuyển `REJECTED` với reason **Trò chơi đã bị chỉnh sửa**, theo yêu cầu người dùng. Chỉ ẩn/bật lại không sửa nội dung giữ kết quả duyệt. Không dùng field revision; V5 gỡ hai cột theo dõi đã được thêm ở V4.
- `game_genres` biểu diễn quan hệ nhiều–nhiều. API tạo/sửa game bắt buộc ít nhất một genre. Gỡ thể loại cuối cùng bị chặn; thay đổi liên kết genre của game thuộc developer cũng ẩn game và từ chối đơn đã duyệt. Chưa có constraint SQL kiểm tra số lượng tối thiểu; API gửi đơn/phát hành kiểm tra lại dữ liệu legacy.

## Giao dịch và quyền sở hữu

`transactions.type` gồm `IN`, `OUT`, **`BUY`**. `BUY` là mua game, không dùng `OUT` thay cho `BUY`. `status` giữ nguyên chính tả từ sơ đồ: `PENDING`, **`SUCCESSED`**, `FAILED` (không tự đổi thành `SUCCEEDED`).

- Một transaction thuộc một user. `BUY` bắt buộc có đúng một `game_id`; `IN` và `OUT` không gắn game. Không có giỏ hàng nhiều game trong cùng một giao dịch, không có hoàn tiền.
- `transactions.amount` là số tiền thực tế của giao dịch, gồm giá đã giảm khi mua. Không suy ngược giá mua từ `games.price` hoặc khuyến mãi hiện tại.
- Thời điểm mua được đọc từ `transactions.created_at` của giao dịch `BUY` thành công; không lưu thêm thời điểm trong `game_bought`. Khi tạo giao dịch `PENDING` trước, đây là thời điểm khởi tạo giao dịch; chưa có cột thời điểm hoàn tất riêng.
- Khi insert hoặc chuyển `BUY` sang `SUCCESSED`, trigger tự tạo `game_bought` trong cùng transaction. Service **không insert quyền sở hữu lần nữa**.
- `game_bought` có khóa chính `(user_id, game_id)` và tham chiếu giao dịch cùng user/game; trigger từ chối cấp quyền từ giao dịch chưa thành công.
- Mỗi user chỉ có một `BUY SUCCESSED` cho mỗi game. Có thể có nhiều lần thử `PENDING`/`FAILED`.
- `transactions.idempotency_key` có thể NULL trong schema. V3 bảo đảm khóa khác NULL là duy nhất theo từng user. API mua và nạp mô phỏng dùng khóa này để xử lý yêu cầu lặp.
- `BUY SUCCESSED` không được sửa hoặc xóa. Lịch sử và quyền sở hữu phải được giữ; service không cung cấp thao tác xóa `game_bought`.
- Số tiền không âm; giá và giao dịch bằng 0 được phép để hỗ trợ game miễn phí. Quy tắc kiểm tra tiền nạp/rút lớn hơn 0 thuộc service.

**Số dư do service cập nhật.** Luồng mua khóa dòng user, kiểm tra tài khoản `VERIFIED`, game `AVAILABLE` và số dư, rồi tính giá, trừ tiền và ghi `BUY SUCCESSED` trong cùng transaction. Nạp tiền qua API hiện là luồng mô phỏng, được bật bằng `app.commerce.demo-topups-enabled`. Thanh toán nạp/rút thực tế chưa triển khai.

## Khuyến mãi

`promotions.discount` lưu **phần trăm**. Constraint SQL cho phép `0 < discount <= 100`, kể cả số lẻ. API quản trị khi tạo hoặc sửa chỉ chấp nhận **số nguyên từ 1 đến 99**. Admin có thể tạo, sửa, bật/tắt, xóa chương trình và chọn game áp dụng. Phạm vi áp dụng theo trạng thái `ENABLED`/`DISABLED`.

`games.promotion_id` cho phép NULL: mỗi game gắn tối đa một khuyến mãi; một khuyến mãi có thể gắn nhiều game. Cột này cũng giới hạn game chỉ có một liên kết kể cả khi khuyến mãi đang `DISABLED`; muốn đổi chương trình thì cập nhật liên kết. Chỉ áp dụng giảm giá nếu promotion đang `ENABLED`. Service tính giá thực trả và lưu vào `transactions.amount`.

## Review

- Mỗi user có tối đa một review cho mỗi game. Khóa ngoại `(user_id, game_id)` tới `game_bought` buộc người đánh giá đã sở hữu game.
- `reviews.rating` chỉ nhận `1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5`.
- Dùng `NUMERIC` không ấn định scale cùng `CHECK` để từ chối đầu vào như `1.49`, tránh làm tròn thành `1.5` trước khi kiểm tra. Xem [tài liệu numeric PostgreSQL](https://www.postgresql.org/docs/17/datatype-numeric.html).
- `games.rating` là trung bình review, trigger tính lại khi thêm/sửa/xóa review; NULL khi chưa có review. Giá trị trung bình có thể không theo bước 0.5. Service không ghi đè trường này; khi có JPA entity nên ánh xạ trường chỉ đọc.

## Wishlist và thông báo

- Wishlist lưu cặp `(user_id, game_id)` cùng `created_at`. Người dùng có thể xem, thêm và gỡ game yêu thích. V6 đặt `ON DELETE CASCADE` cho hai khóa ngoại của Wishlist.
- Notification thuộc đúng một user và có thể liên kết với một game và một promotion. V6 đổi `content` thành `message`, thêm `game_id`, `type`, `discount`, `created_at` và `read_at`. API xác định trạng thái đã đọc qua `read_at`. V6 chuyển dữ liệu đã đọc từ `is_read` sang `read_at` và giữ cột `is_read` của V1.
- Khi xóa promotion, `notifications.promotion_id` chuyển thành NULL. Khi xóa game hoặc user được liên kết, V6 đặt cascade cho notification tương ứng.
- Service gửi thông báo cho user `VERIFIED` có game `AVAILABLE` trong Wishlist và chưa sở hữu game. Sự kiện gửi gồm tạo chương trình đang bật, chuyển sang `ENABLED`, thêm game vào chương trình đang bật hoặc tăng mức giảm của chương trình đang bật. Service bỏ qua thông báo chưa đọc trùng user, game, chương trình, mức giảm và loại thông báo.

## Migration và vận hành

| Migration | Nội dung |
| --- | --- |
| `V1__create_gamestore_schema.sql` | 12 bảng nghiệp vụ, PK/FK, CHECK và index |
| `V2__enforce_purchase_and_review_rules.sql` | Cấp quyền mua game, bảo vệ giao dịch thành công, rating trung bình, kiểm tra submission tối thiểu (gỡ bởi V4) |
| `V3__transaction_idempotency.sql` | Mã yêu cầu chống giao dịch lặp |
| `V4__game_drafts_and_submission_revisions.sql` | Tách bản nháp và gửi đơn, revision nội dung, thời gian gửi/xét duyệt |
| `V5__remove_game_revision_tracking.sql` | Gỡ hai cột revision và index phụ thuộc theo yêu cầu người dùng; không sửa V4 đã áp dụng |
| `V6__wishlist_promotions_notifications.sql` | Bổ sung thời điểm lưu Wishlist, cập nhật cấu trúc thông báo và các khóa ngoại liên quan |
| `V7__developer_application_reason.sql` | Thêm lời đăng ký developer riêng với phản hồi admin; đã duyệt và áp dụng ngày 10/11/2026 |

File nằm trong `gamestore-backend/src/main/resources/db/migration`. Khởi động backend sẽ validate lịch sử và áp dụng migration chưa chạy. `baseline-on-migrate=false`, `clean-disabled=true`; không tự baseline schema đã có bảng.

Không sửa migration đã áp dụng; thêm phiên bản migration mới cho thay đổi tiếp theo. Flyway ghi phiên bản/checksum trong `public.flyway_schema_history`; xem [tài liệu migrations](https://documentation.red-gate.com/flyway/flyway-concepts/migrations).

Sau khi được duyệt phạm vi thay đổi database test, cấu hình `TEST_DB_URL`, `TEST_DB_USERNAME`, `TEST_DB_PASSWORD` và chạy `bash mvnw test` trong `gamestore-backend`. `TestDatabaseGuard` yêu cầu database localhost có tên kết thúc `_test`. Test khởi tạo Spring context có thể chạy Flyway và ghi dữ liệu fixture.

Xóa user theo nghiệp vụ và ẩn game cập nhật status. Admin có API xóa game hoàn toàn nếu game chưa có lịch sử giao dịch, quyền sở hữu hoặc review. API dọn Wishlist, liên kết thể loại và đơn đăng tải trong cùng transaction trước khi xóa game. V6 bổ sung cascade cho các quan hệ Wishlist và Notification nêu trên.

## Kết quả kiểm chứng V1–V2 ngày 24/10/2026

- Đã thử trên database PostgreSQL tạm riêng: 20 kiểm thử ràng buộc nghiệp vụ và 1 kiểm thử khởi tạo Spring context, tất cả đạt. Database tạm đã được xóa sau kiểm tra.
- Đã áp dụng bằng Flyway vào database cấu hình trong `application.yaml`, PostgreSQL 17.11, schema `public`: V1 và V2 đều thành công; có 12 bảng nghiệp vụ cùng `flyway_schema_history`. Không thêm dữ liệu mẫu.
- Flyway validate thành công; lần migrate thứ hai áp dụng 0 migration.
- Sơ đồ đã kiểm tra XML/cấu trúc: 0 lỗi; còn 5 cảnh báo tọa độ âm trong bố cục có sẵn. Môi trường không có draw.io CLI/browser renderer nên chưa kiểm chứng ảnh render.
