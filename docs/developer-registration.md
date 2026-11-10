# Đăng ký nhà phát triển

## Nghiệp vụ đã xác nhận

- Tài khoản `VERIFIED USER` mở **Đăng ký nhà phát triển** (`/developer/register`), nhập lời đăng ký 1–2.000 ký tự rồi gửi đơn.
- Mỗi người dùng có tối đa một đơn `PENDING` qua API. Có thể gửi lại sau khi bị từ chối. Developer/admin không được gửi đơn nâng quyền.
- Admin đã xác minh mở **Đơn đăng ký nhà phát triển** (`/admin/developers`), đọc lời đăng ký, nhập phản hồi 1–2.000 ký tự, chọn chấp thuận hoặc từ chối.
- Chấp thuận ghi `ACCEPTED` và đổi role từ `USER` sang `DEVELOPER` trong cùng transaction. Từ chối ghi `REJECTED` và giữ nguyên role. Đơn đã xử lý không được xét lại.
- Nếu người gửi không còn là `VERIFIED USER`, thao tác xét duyệt trả 409. Không nâng quyền cho tài khoản đã khóa hoặc đã đổi role.
- Người gửi dùng **Làm mới trạng thái** để kiểm tra kết quả; khi có đơn được chấp thuận, frontend tải lại tài khoản và cập nhật điều hướng developer. Đăng nhập lại/tải lại trang cũng lấy role hiện tại từ commerce state. Không có thông báo đẩy.
- Demo chỉ giải thích cách sử dụng, không gửi yêu cầu đăng ký thật.

## Database

Người dùng đã duyệt **tạo và áp dụng** migration V7 thêm duy nhất cột `public.developer_submissions.application_reason TEXT`, nullable để giữ nguyên các đơn cũ. Không sửa migration V1–V6 và không backfill dữ liệu.

`application_reason` lưu lời đăng ký; `reason` giữ phản hồi của admin. API yêu cầu lời đăng ký mới và phản hồi không rỗng, tối đa 2.000 ký tự. Đơn legacy có lời đăng ký NULL được hiển thị rõ là đơn cũ chưa lưu nội dung này.

Schema hiện tại không có thời điểm gửi/duyệt hoặc người duyệt. Giao diện không tự dựng thời gian, và danh sách sắp theo ID để phân trang ổn định, không thể hiện thứ tự thời gian.

Thao tác gửi/duyệt dùng chung advisory transaction lock. Role/status của người thao tác được đọc sau khóa và khóa dòng user; người được duyệt cũng được khóa dòng để tránh thay đổi quyền đồng thời. Admin queue đọc count và items trong snapshot repeatable-read. Không thêm unique index; bảo vệ đơn trùng áp dụng cho các đường ghi qua service.

**Trạng thái áp dụng ngày 10/11/2026:** đã áp dụng V7 vào database ứng dụng đang cấu hình, theo phê duyệt của người dùng. Sau khi Supabase hoạt động lại, đã kiểm tra V1–V6 thành công, validate checksum và dùng Flyway giới hạn target V7. Kết quả: đúng một migration được áp dụng, schema ở V7; bảng đơn đăng ký chưa có dữ liệu trước migration. Không chạy migration khác hoặc sửa dữ liệu nghiệp vụ cũ.

Rollback V7: sao lưu nội dung `application_reason` nếu đã có đơn mới, dừng phiên bản ứng dụng sử dụng cột này, rồi gỡ cột theo quy trình migration được duyệt. Thao tác rollback database chưa được thực hiện.

## API

Tất cả đường dẫn yêu cầu JWT. Service kiểm tra role/status hiện tại trong database; không sử dụng role cũ trong JWT để cấp quyền.

| Method | Đường dẫn | Nội dung |
| --- | --- | --- |
| GET | `/api/developer/submissions` | Các đơn của chính tài khoản đã xác minh |
| POST | `/api/developer/submissions` | `{"application_reason":"Lời đăng ký"}`; trả 201 |
| GET | `/api/developer/admin/submissions?status=PENDING&q=&page=0&size=20` | Admin queue; status tùy chọn, q tìm username tối đa 200 ký tự; size 1–100 |
| PUT | `/api/developer/admin/submissions/{id}/review` | `{"status":"ACCEPTED","reason":"Phản hồi"}` hoặc `REJECTED` |

DTO đơn chỉ gồm `id`, `user_id`, `username`, `status`, `application_reason`, `reason`. API không trả email, mật khẩu hoặc số dư. Lỗi 400 cho dữ liệu sai, 401 chưa đăng nhập, 403 sai quyền/trạng thái, 404 không thấy đơn, 409 đơn trùng hoặc không còn đủ điều kiện xử lý.

## Kiểm thử

Backend service test sử dụng JDBC/Authentication giả lập, không khởi động Spring hoặc thay đổi database:

```sh
cd gamestore-backend
bash mvnw -q -Dtest=DeveloperServiceTests test
```

Kiểm thử giao diện dùng API mô phỏng, không ghi database thật:

```sh
cd gamestore-web
npm run build
npm run lint
npx playwright test tests/e2e/developers.spec.js
```

19 bài service test và 5 bài giao diện mới đạt; toàn bộ 17 bài giao diện đạt khi chạy với `--workers=1`. Backend đã khởi động thành công với schema V7 và API mới trả 401 khi chưa đăng nhập. Luồng gửi/duyệt ghi dữ liệu trên PostgreSQL thật chưa chạy; phạm vi dữ liệu test riêng chưa được duyệt. Không xem kết quả mock là bằng chứng transaction PostgreSQL đã được kiểm chứng thực tế. Migration được kiểm chứng riêng bằng kết quả Flyway và kiểm tra schema chỉ đọc.
