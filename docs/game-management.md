# Quản lý trò chơi

## Giao diện và quyền

- Admin: **Quản lý trò chơi → Quản lý trò chơi** (`/admin/games`) để CRUD mọi game, chọn chủ sở hữu khi tạo, chọn `HIDDEN`/`AVAILABLE`, ẩn hoặc xóa hoàn toàn. Tab **Đơn đăng tải trò chơi** (`/admin/games/submissions`) có lọc trạng thái, tìm theo tên game/developer và phân trang. Tab quản lý thể loại được giữ lại.
- Developer: **Quản lý trò chơi** có **Đăng tải trò chơi** (`/manage-games/new`) và **Trò chơi đã đăng tải** (`/manage-games`). Chỉ quản lý game của chính mình. Tạo game là lưu bản nháp `HIDDEN`; sau đó nhấn **Đăng tải trò chơi** trên thẻ để gửi đơn xét duyệt.
- User thông thường tiếp tục xem game phát hành trong cửa hàng. Các chức năng commerce đã có được giữ lại, không bổ sung luồng mua mới trong thay đổi này.
- Demo không gọi API quản lý thật; cần đăng nhập bằng tài khoản thật có quyền tương ứng và trạng thái `VERIFIED`.

Mỗi game bắt buộc có ít nhất một thể loại khi tạo hoặc sửa. Form hỗ trợ nhiều thể loại, tên, mô tả, giá VND, phiên bản và upload ảnh bìa; không có ô dán URL. Chọn ảnh JPEG/PNG/WebP tối đa 5 MB, kéo/zoom hoặc dùng thanh trượt để crop vuông, rồi nhấn **Dùng ảnh 512×512**. Trình duyệt xuất PNG 512×512 và upload lên Cloudinary qua backend sau khi xác nhận; hủy crop không upload. Backend kiểm tra ảnh hợp lệ và đúng 512×512 trước khi gọi Cloudinary. Giá không âm, tối đa hai chữ số thập phân. Chủ game không được đổi sau khi tạo.

## Bản nháp, gửi đơn và duyệt

1. Tạo game và các liên kết thể loại trong cùng transaction; chưa tạo `GameSubmission`.
2. Gửi đơn là một thao tác riêng. Backend tự ghi người gửi; `reason` để NULL, trạng thái `PENDING`. Chặn gửi trùng khi game đã có đơn chờ duyệt.
3. Admin xem nội dung và nhập lý do duyệt hoặc từ chối. `reason` là lý do của admin, không phải lý do developer gửi đơn. `ACCEPTED` đồng thời phát hành game (`AVAILABLE`); `REJECTED` giữ `HIDDEN`. Đơn đã xử lý không được duyệt lại.
4. Developer có thể ẩn game đã phát hành, rồi bật lại nếu vẫn có đơn `ACCEPTED`. Game mới hoặc game đã sửa khiến đơn bị từ chối không được tự bật lại.
5. Sửa nội dung game có chủ sở hữu không phải admin sẽ chuyển game về `HIDDEN`, đổi các đơn `ACCEPTED` thành `REJECTED` với reason chính xác **Trò chơi đã bị chỉnh sửa**. Áp dụng cả khi game đang ẩn để không thể ẩn → sửa → bật lại bằng kết quả duyệt cũ. Nội dung gồm tên, mô tả, giá, ảnh, phiên bản và tập thể loại. Lưu mà không thay đổi nội dung giữ kết quả duyệt. Không thêm cột theo dõi nội dung. Game thuộc admin không bị buộc duyệt lại; admin có thể phát hành game qua thao tác trạng thái.
6. Nếu sửa game đang có đơn `PENDING`, đơn vẫn chờ duyệt; admin xem và quyết định trên nội dung hiện tại. Các trường người duyệt/thời gian duyệt của đơn đã bị chuyển sang `REJECTED` được giữ nguyên, không giả mạo một lần xét duyệt mới.

Thay đổi liên kết thể loại của game thuộc developer cũng ẩn game và chuyển đơn đã duyệt sang từ chối theo quy tắc trên. Gỡ thể loại cuối cùng bị chặn. Các thao tác này dùng chung khóa transaction với quản lý game để tránh cập nhật/gửi/duyệt đồng thời vượt kiểm tra. Service luôn kiểm tra lại quyền/trạng thái hiện tại trong database và quyền sở hữu, không dựa riêng vào role trong JWT.

## Ẩn và xóa hoàn toàn

`DELETE /games/{id}` là ẩn game; giữ dữ liệu và kết quả duyệt. Developer chỉ có thao tác này, không được xóa hoàn toàn.

Admin có `DELETE /games/{id}/permanent`. Chặn xóa nếu game có bất kỳ giao dịch, quyền sở hữu hoặc review để bảo toàn lịch sử. Với game đủ điều kiện, xóa wishlist, liên kết thể loại và đơn đăng tải trước khi xóa game, trong cùng transaction. Giao diện có xác nhận riêng cho thao tác này. Không xóa ảnh Cloudinary tự động vì URL có thể được dùng chung.

## API

Các đường dẫn dưới `/api/catalog`, cần JWT:

| Phương thức | Đường dẫn | Nội dung |
| --- | --- | --- |
| GET | `/manage` | Game theo quyền, danh sách genre, danh sách chủ sở hữu hợp lệ cho admin |
| GET | `/games/{id}` | Game và lịch sử đơn, trong phạm vi sở hữu/admin |
| POST | `/games` | Tạo, trả 201 |
| PUT | `/games/{id}` | Sửa nội dung và tập genre, trả 200 |
| DELETE | `/games/{id}` | Ẩn, trả 204 |
| PUT | `/games/{id}/status` | `{"status":"HIDDEN"}` hoặc `AVAILABLE` |
| DELETE | `/games/{id}/permanent` | Xóa hoàn toàn, chỉ admin |
| POST | `/games/{id}/submissions` | Gửi đơn, không cần body, trả 201 |
| GET | `/submissions?status=PENDING&q=&page=0&size=20` | Danh sách đơn, chỉ admin; bỏ status để lấy tất cả |
| PUT | `/submissions/{id}/review` | `{"status":"ACCEPTED","reason":"Nội dung phù hợp"}`, hoặc REJECTED |
| POST | `/images` | Multipart `file` đã crop 512×512 (PNG/JPEG), trả 201 `{"url":"https://..."}` |

Body tạo/sửa:

```json
{
  "title": "Tên trò chơi",
  "description": "Mô tả",
  "price": "150000.00",
  "cover_image_url": "https://res.cloudinary.com/cloud-name/image/upload/cover.png",
  "version": "1.0",
  "genre_ids": ["UUID thể loại"]
}
```

Admin có thể gửi thêm `developer_id` khi tạo và `status`. Developer không được giả mạo chủ game hoặc trạng thái phát hành. API trả 400 khi dữ liệu sai, 401 chưa đăng nhập, 403 sai quyền/chủ sở hữu, 404 không tồn tại, 409 xung đột nghiệp vụ, 503 thiếu cấu hình Cloudinary và 502 khi dịch vụ ảnh thất bại.

`cover_image_url` là URL nội bộ mà form nhận từ API upload, không phải trường cho người dùng dán URL. Theo yêu cầu chuyển sang upload, 2 URL ảnh game có trước thay đổi đã được đặt về NULL; các dữ liệu khác được giữ nguyên. Bản sao URL cũ nằm trong file local được gitignore `gamestore-backend/target/game-cover-urls-before-upload-only.yaml`. Không xóa ảnh ở dịch vụ lưu trữ, không thay đổi schema.

Cloudinary dùng `cloudinary.url` hiện có hoặc biến môi trường `CLOUDINARY_URL` theo mẫu `cloudinary://API_KEY:API_SECRET@CLOUD_NAME`. Khóa chỉ được đọc ở backend, không gửi xuống frontend. Upload được ký SHA-256 theo [tài liệu Cloudinary](https://cloudinary.com/documentation/authentication_signatures). Kiểm thử dùng transport giả lập, không tải ảnh thử lên tài khoản thật.

## Migration và kiểm thử

V4 đã được áp dụng và được giữ nguyên để bảo toàn checksum Flyway. Theo yêu cầu người dùng, V5 gỡ `games.revision`, `game_submissions.game_revision` và index phụ thuộc; ứng dụng không còn dùng hai cột này. Các thay đổi khác trong V4 được giữ nguyên, không thêm cột thay thế. Với đơn có trước V4, `created_at` là thời điểm migration do schema cũ chưa lưu thời gian gửi, không phải thời điểm gửi gốc; `reviewed_at` cũ để NULL.

Backend: `TEST_DB_PASSWORD=... bash mvnw test` trong `gamestore-backend`, dùng test database localhost có tên kết thúc `_test`. Chỉ chạy sau khi có sự cho phép đối với migration và dữ liệu test theo luật database trong AGENTS.md global. `CatalogApiTests` kiểm tra CRUD, genre bắt buộc, quyền/chủ sở hữu, gửi/duyệt đồng thời, tự từ chối đơn khi sửa game, ẩn/bật lại, xóa có lịch sử và tác động từ quản lý genre. `CloudinaryImagesTests` kiểm tra upload ký, định dạng/kích thước và lỗi đã loại thông tin nhạy cảm.

Frontend: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e`. Kiểm thử trình duyệt gồm tạo bản nháp, chọn genre, gửi đơn, duyệt, ẩn/bật lại, sửa cần duyệt lại, CRUD admin, form ảnh và màn hình nhỏ. API mock dùng cho kiểm thử giao diện; integration backend chạy trên PostgreSQL riêng.

`tests/live/catalog.spec.js` dùng cấu hình live có sẵn (`npm run test:live`): đăng nhập thật qua giao diện, developer tạo/gửi game, admin duyệt, user thấy game ở cửa hàng, developer sửa nội dung và user không còn thấy bản chưa được duyệt lại. Cần khởi động server test và PostgreSQL riêng theo README backend; không dùng database ứng dụng.
