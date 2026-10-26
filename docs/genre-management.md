# Quản lý trò chơi và thể loại

Quản trị viên (`ADMINISTRATOR`, `VERIFIED`) mở **Quản lý trò chơi** trên thanh điều hướng:

- `/admin/games`: CRUD trò chơi (xem [game-management.md](game-management.md)).
- `/admin/games/genres`: CRUD thể loại, tìm theo tên và gán/gỡ thể loại cho các trò chơi hiện có, kể cả trò chơi đang ẩn.

Tên được bỏ khoảng trắng đầu/cuối, bắt buộc dài 1–100 ký tự, không trùng tên khi bỏ qua hoa/thường. Mô tả không bắt buộc, tối đa 2000 ký tự. Có thể chọn thể loại trong danh sách để xem và chỉnh liên kết với trò chơi. Mỗi trò chơi có thể gắn nhiều thể loại; gán/gỡ một thể loại giữ nguyên các liên kết khác. Chặn xóa thể loại đang được sử dụng; cần gỡ liên kết trước khi xác nhận xóa. Không được gỡ thể loại cuối cùng của game; hãy thêm thể loại thay thế trước. Thay đổi liên kết thể loại của game thuộc developer làm ẩn game và đổi đơn đã duyệt sang REJECTED với reason **Trò chơi đã bị chỉnh sửa**, cần gửi duyệt lại.

Chức năng này dùng API và dữ liệu thật; tài khoản Demo hiển thị hướng dẫn đăng nhập. CRUD trò chơi và giao diện developer được mô tả tại [game-management.md](game-management.md).

## API

Tất cả endpoint nằm dưới `/api/admin/genres`, cần JWT. Service kiểm tra lại role và status hiện tại trong database trên mỗi yêu cầu.

| Phương thức | Đường dẫn | Nội dung |
| --- | --- | --- |
| GET | `/` | Danh sách `id`, `name`, `description`, `game_count` |
| GET | `/{id}` | Chi tiết thể loại |
| POST | `/` | Tạo, body `{"name":"Hành động","description":"..."}`, trả 201 |
| PUT | `/{id}` | Sửa cùng cấu trúc body, trả 200 |
| DELETE | `/{id}` | Xóa thể loại chưa có game, trả 204 |
| GET | `/games` | Game `id`, `title`, `status`, `genre_ids` |
| PUT | `/{id}/games/{gameId}` | Gán thể loại, idempotent, trả 204 |
| DELETE | `/{id}/games/{gameId}` | Gỡ thể loại, idempotent, trả 204 |

Lỗi: 400 dữ liệu không hợp lệ; 401 chưa đăng nhập; 403 sai quyền/trạng thái; 404 không tìm thấy; 409 tên trùng hoặc thể loại đang được sử dụng. Lỗi nghiệp vụ có trường `message`.

Dùng bảng `genres` và `game_genres` có sẵn, không thêm cột theo dõi nội dung hay dữ liệu mẫu. Các thao tác ghi dùng transaction và chung PostgreSQL advisory lock để tuần tự hóa kiểm tra tên trùng và xóa/gán qua service này. Khóa ngoại vẫn bảo vệ liên kết khi có thao tác SQL ngoài service. Service tạo/sửa, gửi đơn và phát hành game kiểm tra ít nhất 1 genre; API gỡ liên kết chặn gỡ genre cuối cùng. Chưa có constraint số lượng tối thiểu ở tầng SQL.

## Kiểm thử

Backend: `TEST_DB_PASSWORD=... bash mvnw test` trong `gamestore-backend`, sử dụng PostgreSQL test riêng theo `application-test.yml` và `TestDatabaseGuard`; không dùng database ứng dụng. `GenreApiTests` kiểm tra CRUD, validation, tên trùng đồng thời, quyền hiện tại, nhiều thể loại và bảo vệ liên kết.

Frontend: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e`. `tests/e2e/genres.spec.js` kiểm tra giao diện bằng API mock, bao gồm điều hướng game, CRUD, gán/gỡ, chặn xóa đang sử dụng, quyền, tải lỗi/thử lại và màn hình nhỏ.
