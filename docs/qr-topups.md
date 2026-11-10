# Nạp tiền mô phỏng bằng QR

## Sử dụng

1. Mở Ví, chọn mệnh giá hoặc nhập số tiền (lớn hơn 0, tối đa 100.000.000 VND, tối đa hai chữ số thập phân).
2. Nhấn **Tiếp tục nạp tiền** để tạo QR ngẫu nhiên cho số tiền đó.
3. Quét QR bằng điện thoại để đọc mã dạng `GS-ABCD-EFGH`, nhập vào ô **Mã xác nhận**, rồi nhấn **Xác nhận nạp**.
4. Mã đúng mới cộng số dư và ghi một giao dịch `IN / SUCCESSED`. Đây là tiền mô phỏng, không chuyển tiền ngân hàng.

QR chứa văn bản mã xác nhận, không phải VietQR/ngân hàng hoặc đường dẫn thanh toán. Mã không được hiển thị bằng văn bản trên màn hình thanh toán; ảnh QR được tạo cục bộ bằng [node-qrcode](https://github.com/soldair/node-qrcode), không gửi mã tới dịch vụ tạo ảnh bên ngoài.

## Quy tắc

- Mã gắn với đúng tài khoản và số tiền, hết hạn sau 10 phút. Tạo QR mới sẽ hủy QR đang chờ trước đó của cùng tài khoản.
- Nhập sai không cộng tiền. Sau 5 lần sai, phải tạo QR mới. Không phân biệt hoa/thường; có thể nhập bỏ dấu gạch nối hoặc dùng dấu cách.
- Tạo/đóng QR không ghi giao dịch và không đổi số dư. Xác nhận dùng số tiền được chốt trong yêu cầu QR.
- Dùng `challenge_id` làm `Idempotency-Key`: gửi lại yêu cầu đã thành công trả về giao dịch cũ, không cộng lần nữa. Trường hợp trả lại biên nhận cũ không phụ thuộc QR còn trong bộ nhớ; tài khoản, loại giao dịch và số tiền vẫn phải khớp.
- Mã chờ lưu tạm trong bộ nhớ backend, không thay đổi schema/migration. Khởi động lại backend làm mất mã đang chờ; người dùng tạo QR mới. Triển khai nhiều backend instance cần cùng bộ lưu trữ mã hoặc định tuyến cố định; phiên bản mô phỏng hiện tại dành cho một instance.
- Tài khoản phải `VERIFIED`. Backend kiểm tra mã và quyền hiện tại, không chỉ dựa vào việc frontend đã nhập mã.

## Cấu hình

Theo yêu cầu đây là hệ thống mô phỏng, `app.commerce.demo-topups-enabled` mặc định **true**, và cấu hình mẫu cũng bật. Đặt **false** để tắt cả tạo QR và xác nhận nạp. Cấu hình explicit đang có được ưu tiên. Không có tích hợp cổng thanh toán trong luồng này.

Sau khi cập nhật code cần khởi động lại backend để nhận endpoint và quy tắc xác nhận mới. Frontend cũ gửi duy nhất `amount` không còn được phép nạp.

## API

Các endpoint dưới `/api/commerce`, cần JWT:

| Method | Đường dẫn | Nội dung |
| --- | --- | --- |
| POST | `/wallet/demo-topups/challenges` | Body `{"amount":"500000.00"}`; trả 201 với `challenge_id`, `amount`, `code`, `expires_at`. Không ghi database. |
| POST | `/wallet/demo-topups` | Header `Idempotency-Key` bằng `challenge_id`; body `{"amount":"500000.00","challenge_id":"UUID","code":"GS-ABCD-EFGH"}`; trả giao dịch sau khi xác nhận. |

Lỗi: 400 dữ liệu/mã sai, 401 chưa đăng nhập, 403 tài khoản bị khóa/chưa xác minh, 409 số tiền hoặc mã yêu cầu xung đột, 410 QR hết hạn/bị thay thế/quá số lần sai, 503 mô phỏng đang tắt.

## Kiểm chứng

Backend unit test dùng repository giả lập, không khởi động Spring hoặc ghi database:

```sh
cd gamestore-backend
bash mvnw -q -Dtest=TopUpSimulationTests,CommercePriceTests test
```

Frontend kiểm thử QR bằng [jsQR](https://github.com/cozmo/jsQR) để giải mã PNG thực tế, sau đó nhập mã như người dùng quét bằng điện thoại. Không lấy mã qua thuộc tính ẩn trên DOM. Backend integration/live test được cập nhật hợp đồng API nhưng chưa chạy khi chưa có phạm vi dữ liệu test được duyệt.

Kết quả ngày 10/11/2026: 28/28 bài giao diện đạt khi chạy tuần tự, 16/16 bài Node đạt và 8/8 bài backend unit về QR/giá/cấu hình đạt. Frontend build, backend package và biên dịch source integration test đều đạt. Lint không có lỗi, còn 2 cảnh báo có sẵn ở thông báo/quản lý người dùng. Đã xem ảnh render QR trên desktop/mobile và kiểm tra không tràn ngang ở 390 px. Không khởi động lại server ứng dụng hoặc ghi dữ liệu thử vào database trong đợt này.
