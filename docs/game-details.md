# Trang chi tiết và tải game

- “Xem chi tiết” từ cửa hàng, thư viện và danh sách yêu thích mở `/games/:gameId`. Có thể mở URL trực tiếp, tải lại và dùng Back/Forward. Giữ cơ chế đăng nhập hiện tại.
- Bố cục tham khảo [trang game trên Steam](https://store.steampowered.com/app/413150/Stardew_Valley/): điều hướng cửa hàng, breadcrumb, tên game, ảnh bìa lớn, tóm tắt và thông tin ở bên phải; bên dưới là khu vực mua, mô tả và đánh giá của người chơi.
- Chỉ dùng thông tin có trong commerce state. Không tạo dữ liệu giả về cấu hình, trailer, ảnh gameplay, nền tảng, thành tựu hoặc ngày phát hành.
- Xem chi tiết không phát sinh giao dịch. Nút mua mở bước xác nhận hiện có; giá và quyền sở hữu được làm mới qua commerce service. Game chưa mở bán không được mua mới. URL không khớp game hiển thị trạng thái không tìm thấy, không tự chuyển sang game khác.
- Người đã sở hữu game có nút **Tải game** tại trang chi tiết và thư viện, kể cả khi game đã được ẩn khỏi cửa hàng. Người chưa sở hữu không có nút tải.
- Download tạo file Markdown rỗng (0 byte) ngay trong trình duyệt, tên `<tên game>.md`. Giữ tiếng Việt và dấu cách; thay các ký tự không hợp lệ trên Windows bằng `_`, xử lý tên thiết bị dành riêng và tên rỗng. Không gọi API tải file hoặc lưu file game lên server.
- Không thay đổi database, migration hay schema trong thay đổi trang chi tiết.

Kiểm thử giao diện sử dụng API mô phỏng và dữ liệu Demo. Kiểm tra file tải xuống bằng tên file trình duyệt đề xuất và kích thước file thực tế bằng 0 byte.

## Kết quả kiểm tra ngày 10/11/2026

- Frontend build đạt; 14 bài Node test đạt. Lint không có lỗi, còn 2 cảnh báo có sẵn ở thông báo và quản lý user.
- Toàn bộ 23 bài giao diện đạt với `npm run test:e2e -- --workers=1`, gồm 6 bài mới về trang chi tiết và download. Đã cập nhật các luồng mua cũ để mở trang chi tiết trước, sau đó mới xác nhận mua.
- Các tình huống mới gồm URL trực tiếp/tải lại, tên/giá giảm/nhà phát triển/review, mua và tải từ trang chi tiết/thư viện, game đã ẩn nhưng đã sở hữu, URL không tồn tại, lỗi wishlist/mua, tên file có ký tự không hợp lệ và game miễn phí. File download thực tế được kiểm tra là 0 byte.
- Đã xem ảnh render desktop và mobile 390 px; ảnh bìa phụ được ẩn trên mobile để không lặp lại cùng một ảnh. Không tràn ngang.
- Đã sửa kích thước ảnh trong wishlist để ảnh không đè lên liên kết mở chi tiết. Các test quản lý game/thể loại mock thêm API thông báo để không vô tình gọi backend thật khi chạy.
- Test live có ghi database chưa chạy; không thay đổi database trong đợt này.
