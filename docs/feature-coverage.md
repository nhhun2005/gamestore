# Đối chiếu chức năng phụ trách Huân

Ngày kiểm tra: 10/11/2026. Đánh giá dựa trên source, build và kiểm thử; không đồng nghĩa mọi chức năng đã được triển khai lên môi trường chạy thật.

| Chức năng | Kết quả kiểm tra ban đầu | Vị trí |
| --- | --- | --- |
| Quản lý thể loại game | Có CRUD, tìm kiếm, gán/gỡ thể loại, bảo vệ thể loại đang sử dụng và thể loại cuối cùng của game | `/admin/games/genres`; backend `modules/genre` |
| Quản lý trò chơi trên nền tảng | Có tạo/sửa, chọn chủ sở hữu khi tạo, ẩn/bật và xóa có bảo vệ lịch sử | `/admin/games`; backend `modules/catalog` |
| Tìm kiếm game | Có tìm theo tên trong danh sách cửa hàng đã tải, không phân biệt hoa thường | `/store`; `StorePage.jsx` |
| Xem chi tiết game | Ban đầu là hộp thoại; theo yêu cầu tiếp theo đã chuyển sang trang riêng theo bố cục Steam | `/games/:gameId`; `GameDetailsPage.jsx`; xem `game-details.md` |
| Gửi yêu cầu đăng tải game | Có tạo bản nháp và gửi đơn riêng, chặn đơn chờ trùng, kiểm tra chủ sở hữu | `/manage-games`; `CatalogService.submit` |
| Đăng ký nhà phát triển | Ban đầu chỉ có bảng `developer_submissions`, thiếu API và giao diện; bổ sung trong đợt này theo nghiệp vụ đã xác nhận | Xem `developer-registration.md` |
| Xét duyệt yêu cầu đăng tải game | Có lọc/tìm kiếm/phân trang, xem nội dung, duyệt/từ chối kèm lý do | `/admin/games/submissions`; `CatalogService.review` |
| Quản lý trò chơi đã đăng tải | Có quản lý game của chính developer; sửa nội dung ẩn game và vô hiệu kết quả duyệt cũ để yêu cầu duyệt lại | `/manage-games`, `/manage-games/new`; `GameCatalogPage.jsx` |

## Kiểm chứng phần đã có

- Frontend build đạt; 14 bài Node test đạt.
- 11 bài Playwright hiện có đạt với dữ liệu/API mô phỏng, bao gồm quản lý thể loại, game và các luồng cửa hàng. Không phải kiểm thử backend với database thật.
- Bổ sung `tests/e2e/store-discovery.spec.js`: tìm theo tên không phân biệt hoa thường, danh sách rỗng, xóa bộ lọc và xem tên/mô tả/giá trong chi tiết; bài kiểm thử đạt.
- Backend biên dịch cả source test thành công bằng `bash mvnw -q -DskipTests test-compile`, không khởi động Spring hoặc thay đổi database.
- Lint ban đầu có 2 cảnh báo `react(set-state-in-effect)` tại `NotificationBell.jsx` và `ManageUsersPage.jsx`; không có lỗi.

Các chức năng đã có không cần triển khai lại. Tìm kiếm hiện lọc tại trình duyệt trên dữ liệu đã tải. Theo yêu cầu tiếp theo, chi tiết game đã được chuyển từ hộp thoại sang trang riêng theo URL; hộp thoại chỉ còn dùng ở bước xác nhận mua. Xem [chi tiết và tải game](game-details.md).

## Kết quả sau khi bổ sung đăng ký developer

- Đã bổ sung `/developer/register` cho user gửi lời đăng ký và xem phản hồi; `/admin/developers` cho admin tìm/lọc, phân trang và duyệt/từ chối. Hai nội dung được lưu riêng. Chấp thuận đổi role thành developer trong cùng transaction.
- V7 đã áp dụng thành công vào database ứng dụng theo phạm vi được duyệt. Kiểm tra chỉ đọc xác nhận cột mới `application_reason` là TEXT nullable, Flyway ghi V7 thành công, và số đơn đăng ký vẫn bằng 0. Không tạo tài khoản/đơn test trên database ứng dụng.
- 19 bài `DeveloperServiceTests` đạt; 14 bài Node test đạt. Build frontend và đóng gói backend đạt. Lint còn đúng 2 cảnh báo có sẵn, không thêm cảnh báo mới.
- 17/17 bài Playwright đạt khi chạy `npm run test:e2e -- --workers=1`. Có một lần test crop ảnh cũ timeout khi chạy song song; chạy riêng bài đó và chạy toàn bộ tuần tự đều đạt. Không sửa code crop ảnh trong đợt này.
- Đã xem ảnh render màn hình đăng ký trên mobile và màn hình xét duyệt trên desktop, kiểm tra không tràn ngang ở chiều rộng 390 px.
- Backend khởi động thành công với schema V7; API đăng ký mới trả HTTP 401 khi chưa đăng nhập. Server kiểm tra tạm đã dừng.

Luồng gửi/duyệt trên database thật chưa được chạy để tránh tạo dữ liệu thử ngoài phạm vi migration đã duyệt. Kiểm thử giao diện dùng API mô phỏng; kiểm thử service dùng JDBC giả lập. Đây là giới hạn kiểm chứng, không phải thiếu API hoặc giao diện.
