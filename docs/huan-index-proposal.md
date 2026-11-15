# Phạm vi bổ sung index cho các chức năng của Huân

Kiểm tra chỉ đọc ngày 15/11/2026 trên PostgreSQL 17.11: Flyway V1–V8 thành công. Các bảng liên quan đều có PK index; các FK phục vụ game, thể loại, đơn đăng tải và quyền sở hữu đã có index. `genres` hiện chỉ có index PK; `developer_submissions` có PK và index user_id.

Đề xuất bổ sung 5 index B-tree thường, không UNIQUE:

Trạng thái: người dùng đã duyệt cả 5 index, DB test và sau đó duyệt riêng DB ứng dụng trong ngày 15/11/2026. V10 đã áp dụng thành công; xem [báo cáo hoàn tất](huan-db-report.md).

| Tên | Bảng / biểu thức | Mục đích |
| --- | --- | --- |
| `genres_name_lookup_idx` | `genres (lower(btrim(name)))` | Kiểm tra tên trùng và sắp xếp tên đã chuẩn hóa |
| `game_submissions_game_status_idx` | `game_submissions (game_id, status)` | Kiểm tra PENDING/ACCEPTED và vô hiệu kết quả duyệt theo game |
| `developer_submissions_user_status_idx` | `developer_submissions (user_id, status)` | Kiểm tra đơn PENDING của người gửi |
| `developer_submissions_status_id_idx` | `developer_submissions (status, id)` | Lọc trạng thái và phân trang hàng đợi xét duyệt |
| `games_store_title_idx` | `games (lower(title), id) WHERE status = 'AVAILABLE'` | Duyệt/sắp xếp cửa hàng theo tên với tập game đang mở bán |

Index cuối hỗ trợ lọc/sắp xếp, không được coi là index tăng tốc tìm chuỗi con giữa tên. Chưa thêm extension pg_trgm hoặc index GIN để giữ phạm vi thay đổi gọn và không phụ thuộc extension. Kiểm chứng kế hoạch truy vấn trước khi kết luận hiệu năng; dữ liệu nhỏ có thể vẫn dùng sequential scan.

Ảnh hưởng: tốn dung lượng và thêm chi phí cập nhật index khi ghi; không sửa/xóa dòng dữ liệu, không đổi tính duy nhất, bảng/cột/FK hay nghiệp vụ. CREATE INDEX thường có thể chặn ghi trong thời gian xây dựng, nên áp dụng DB ứng dụng ở thời điểm phù hợp sau kiểm thử.

Rollback: migration bù được duyệt chỉ DROP INDEX từng tên nêu trên, không CASCADE; không sửa migration cũ hoặc lịch sử Flyway. Không tự rollback dữ liệu CRUD.

Phạm vi kiểm thử cần duyệt: tạo/khởi động PostgreSQL tạm riêng trên loopback, database kết thúc `_test`; áp dụng V1–V8 và migration mới; tạo/cập nhật/xóa fixture giả trong test để kiểm tra procedure/trigger/index/API. Không dùng DB ứng dụng để tạo fixture, không gửi email thật hoặc upload ảnh thật. Áp dụng vào DB ứng dụng sẽ được trình riêng sau khi có kết quả kiểm thử.
