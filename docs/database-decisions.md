# Quy ước database GameStore

Các quyết định chốt ngày 24/10/2026, dựa trên trang **Class Diagram** của [Diagrams.drawio](diagrams/Diagrams.drawio).

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

`developer_submissions` giữ quan hệ nhiều yêu cầu trên một user theo sơ đồ. Ý nghĩa chi tiết của `reason` và việc tự nâng role khi duyệt chưa được định nghĩa trong lần triển khai này; migration không tự đổi role.

## Game và submission

- Game có `developer_id` trỏ tới chủ game, khác với user mua game trong `game_bought`.
- Game có trạng thái `HIDDEN`, `AVAILABLE`, mặc định `HIDDEN`. Xóa game về mặt nghiệp vụ là chuyển sang `HIDDEN`.
- Một game có **1..n submission**, mỗi submission thuộc đúng một game. Tạo game và submission đầu tiên trong **cùng một transaction SQL**; constraint trì hoãn tới cuối transaction kiểm tra game có ít nhất một submission. Không dùng hai lệnh autocommit riêng.
- `submitted_by` bắt buộc; `reviewed_by` có thể NULL khi `PENDING`, bắt buộc khi `ACCEPTED` hoặc `REJECTED`.
- Một game được gửi duyệt nhiều lần; không có unique constraint trên `game_submissions.game_id`.
- Service chịu trách nhiệm kiểm tra người gửi là chủ game/developer, người duyệt là admin và quyết định khi nào chuyển game sang `AVAILABLE`. Duyệt submission không tự đổi trạng thái game.
- `game_genres` biểu diễn quan hệ nhiều–nhiều. Sơ đồ yêu cầu game có ít nhất một genre; việc chọn đủ genre khi hoàn thiện game thuộc service, chưa có constraint kiểm tra số lượng genre tối thiểu.

## Giao dịch và quyền sở hữu

`transactions.type` gồm `IN`, `OUT`, **`BUY`**. `BUY` là mua game, không dùng `OUT` thay cho `BUY`. `status` giữ nguyên chính tả từ sơ đồ: `PENDING`, **`SUCCESSED`**, `FAILED` (không tự đổi thành `SUCCEEDED`).

- Một transaction thuộc một user. `BUY` bắt buộc có đúng một `game_id`; `IN` và `OUT` không gắn game. Không có giỏ hàng nhiều game trong cùng một giao dịch, không có hoàn tiền.
- `transactions.amount` là số tiền thực tế của giao dịch, gồm giá đã giảm khi mua. Không suy ngược giá mua từ `games.price` hoặc khuyến mãi hiện tại.
- Thời điểm mua được đọc từ `transactions.created_at` của giao dịch `BUY` thành công; không lưu thêm thời điểm trong `game_bought`. Khi tạo giao dịch `PENDING` trước, đây là thời điểm khởi tạo giao dịch; chưa có cột thời điểm hoàn tất riêng.
- Khi insert hoặc chuyển `BUY` sang `SUCCESSED`, trigger tự tạo `game_bought` trong cùng transaction. Service **không insert quyền sở hữu lần nữa**.
- `game_bought` có khóa chính `(user_id, game_id)` và tham chiếu giao dịch cùng user/game; trigger từ chối cấp quyền từ giao dịch chưa thành công.
- Mỗi user chỉ có một `BUY SUCCESSED` cho mỗi game. Có thể có nhiều lần thử `PENDING`/`FAILED`.
- `BUY SUCCESSED` không được sửa hoặc xóa. Lịch sử và quyền sở hữu phải được giữ; service không cung cấp thao tác xóa `game_bought`.
- Số tiền không âm; giá và giao dịch bằng 0 được phép để hỗ trợ game miễn phí. Quy tắc kiểm tra tiền nạp/rút lớn hơn 0 thuộc service.

**Số dư không tự cập nhật bằng trigger.** Luồng mua cần khóa dòng user, kiểm tra `VERIFIED`/không `BANNED`, game `AVAILABLE`, đủ số dư, tính giá, trừ tiền và ghi `BUY SUCCESSED` trong cùng transaction. Luồng nạp/rút phải chống xử lý callback trùng. Các API/service này chưa thuộc phạm vi triển khai schema.

## Khuyến mãi

`promotions.discount` là **phần trăm**, lớn hơn 0 và không quá 100; cho phép phần trăm lẻ. Admin tạo/bật/tắt khi cần. Không có ngày bắt đầu/kết thúc và không có quy tắc cộng dồn.

`games.promotion_id` cho phép NULL: mỗi game gắn tối đa một khuyến mãi; một khuyến mãi có thể gắn nhiều game. Cột này cũng giới hạn game chỉ có một liên kết kể cả khi khuyến mãi đang `DISABLED`; muốn đổi chương trình thì cập nhật liên kết. Chỉ áp dụng giảm giá nếu promotion đang `ENABLED`. Service tính giá thực trả và lưu vào `transactions.amount`.

## Review và notification

- Mỗi user có tối đa một review cho mỗi game. Khóa ngoại `(user_id, game_id)` tới `game_bought` buộc người đánh giá đã sở hữu game.
- `reviews.rating` chỉ nhận `1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5`.
- Dùng `NUMERIC` không ấn định scale cùng `CHECK` để từ chối đầu vào như `1.49`, tránh làm tròn thành `1.5` trước khi kiểm tra. Xem [tài liệu numeric PostgreSQL](https://www.postgresql.org/docs/17/datatype-numeric.html).
- `games.rating` là trung bình review, trigger tính lại khi thêm/sửa/xóa review; NULL khi chưa có review. Giá trị trung bình có thể không theo bước 0.5. Service không ghi đè trường này; khi có JPA entity nên ánh xạ trường chỉ đọc.
- Notification thuộc đúng một user và một promotion theo sơ đồ; `is_read` mặc định `false`. Không bổ sung `created_at` hoặc `game_id` cho notification trong đợt này.
- Service chỉ gửi thông báo khuyến mãi cho user có game tương ứng trong wishlist. Schema không tự tạo notification hoặc kiểm tra điều kiện wishlist khi insert.

## Migration và vận hành

| Migration | Nội dung |
| --- | --- |
| `V1__create_gamestore_schema.sql` | 12 bảng nghiệp vụ, PK/FK, CHECK và index |
| `V2__enforce_purchase_and_review_rules.sql` | Cấp quyền mua game, bảo vệ giao dịch thành công, rating trung bình, kiểm tra submission tối thiểu |

File nằm trong `gamestore-backend/src/main/resources/db/migration`. Khởi động backend sẽ validate lịch sử và áp dụng migration chưa chạy. `baseline-on-migrate=false`, `clean-disabled=true`; không tự baseline schema đã có bảng.

Không sửa migration đã áp dụng; tạo `V3__...sql` cho thay đổi tiếp theo. Flyway ghi phiên bản/checksum trong `public.flyway_schema_history`; xem [tài liệu migrations](https://documentation.red-gate.com/flyway/flyway-concepts/migrations).

Chạy test trên database PostgreSQL **riêng cho test** bằng cách đặt `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`, rồi chạy `bash mvnw test` trong `gamestore-backend`. Test khởi tạo Spring context nên cũng chạy Flyway. Test nghiệp vụ rollback dữ liệu fixture; không dùng database production để chạy test.

Không có `ON DELETE CASCADE`. Chức năng xóa user/game chỉ cập nhật status. Khóa ngoại bảo vệ quan hệ, nhưng không phải cơ chế cấm mọi câu SQL DELETE của tài khoản quản trị; giới hạn quyền và luồng xóa thuộc ứng dụng/vận hành.

## Kết quả kiểm chứng ngày 24/10/2026

- Đã thử trên database PostgreSQL tạm riêng: 20 kiểm thử ràng buộc nghiệp vụ và 1 kiểm thử khởi tạo Spring context, tất cả đạt. Database tạm đã được xóa sau kiểm tra.
- Đã áp dụng bằng Flyway vào database cấu hình trong `application.yaml`, PostgreSQL 17.11, schema `public`: V1 và V2 đều thành công; có 12 bảng nghiệp vụ cùng `flyway_schema_history`. Không thêm dữ liệu mẫu.
- Flyway validate thành công; lần migrate thứ hai áp dụng 0 migration.
- Sơ đồ đã kiểm tra XML/cấu trúc: 0 lỗi; còn 5 cảnh báo tọa độ âm trong bố cục có sẵn. Môi trường không có draw.io CLI/browser renderer nên chưa kiểm chứng ảnh render.
