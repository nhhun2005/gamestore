# Báo cáo View, Stored Procedure, Trigger và Index — phạm vi Huân

Ngày: 15/11/2026. Phạm vi gồm 8 chức năng đã chốt trong [kế hoạch](db-programmability-plan.md).

## 1. Kết quả triển khai và trạng thái áp dụng

Các luồng ghi thể loại/game/đơn đăng tải/đơn đăng ký developer được chuyển sang `CALL` procedure PostgreSQL; các luồng đọc tương ứng dùng view. Trigger thay cho Java tự vô hiệu kết quả duyệt sau chỉnh sửa. Tìm kiếm và xem chi tiết có API đọc riêng, không lấy dữ liệu game từ commerce snapshot của tài khoản thật.

| Đối tượng mới | Số lượng | Nguồn định nghĩa đầy đủ |
| --- | ---: | --- |
| View | 10 | [V9](../gamestore-backend/src/main/resources/db/migration/V9__huan_views_procedures_triggers.sql) |
| Stored procedure thực sự (`CREATE PROCEDURE` / `CALL`) | 13 | V9 |
| Trigger | 2 | V9 |
| Function nội bộ/trigger function | 6 | V9 |
| Index B-tree không UNIQUE | 5 | [V10](../gamestore-backend/src/main/resources/db/migration/V10__huan_query_indexes.sql) |

Bản SQL đầy đủ của riêng đợt chuyển đổi: [huan-db-objects.sql](sql/huan-db-objects.sql). File này là bản tham khảo các định nghĩa đã tạo, không phải migration thứ ba; áp dụng bằng Flyway V9/V10 để không làm lệch lịch sử.

Trạng thái ban đầu được kiểm tra trực tiếp bằng kết nối read-only: DB ứng dụng PostgreSQL 17.11, Flyway V1–V8 thành công. Toàn bộ bảng/cột phục vụ thiết kế đã có. Chưa cần thêm bảng, cột, FK, constraint hoặc extension. Năm index được duyệt riêng sau khi đối chiếu catalog index thực tế.

**Đã triển khai mã, kiểm chứng đầy đủ trên PostgreSQL test và áp dụng thành công V9/V10 vào DB ứng dụng sau lần duyệt riêng ngày 15/11/2026.** Kiểm tra catalog trực tiếp trên DB ứng dụng xác nhận 10 view, 13 procedure, 6 function hỗ trợ, 2 trigger mới và 5 index. Sáu trigger cũ được giữ nguyên; số dòng của cả 12 bảng nghiệp vụ không đổi trước/sau migration.

## 2. Đối chiếu theo từng chức năng

`v_actor_accounts` được dùng chung để đọc danh tính/quyền/trạng thái hiện tại; không chứa mật khẩu, email, số dư hoặc token. Procedure đọc lại quyền từ DB, không tin role truyền từ trình duyệt.

| Chức năng của Huân | View sử dụng | Procedure sử dụng | Trigger liên quan | Index mới liên quan |
| --- | --- | --- | --- | --- |
| 1. Quản lý thể loại game | `v_actor_accounts`, `v_genre_summary`, `v_game_genres`, `v_catalog_games` | `sp_create_genre`, `sp_update_genre`, `sp_delete_genre`, `sp_attach_game_genre`, `sp_detach_game_genre` | `game_genres_invalidate_approval` khi đổi liên kết thật | `genres_name_lookup_idx`, `game_submissions_game_status_idx` |
| 2. Quản lý trò chơi trên nền tảng | `v_actor_accounts`, `v_catalog_games`, `v_game_genres`, `v_genre_summary`, `v_catalog_developers`, `v_game_submission_details` | `sp_create_game`, `sp_update_game`, `sp_set_game_status`, `sp_delete_game_permanently` | `games_invalidate_approval`, `game_genres_invalidate_approval` | `game_submissions_game_status_idx` |
| 3. Tìm kiếm game | `v_actor_accounts`, `v_store_games` (dùng nguồn `v_catalog_games`) | Không cần procedure vì chỉ đọc | Không có trigger chạy khi SELECT | `games_store_title_idx` hỗ trợ duyệt/sắp xếp, không tăng tốc tìm chuỗi con tùy ý |
| 4. Xem chi tiết game | `v_actor_accounts`, `v_catalog_games`, `v_store_games`, `v_public_game_reviews`, `v_game_ownership` | Không cần procedure vì chỉ đọc | Đọc rating/quyền sở hữu do trigger V2 đã có duy trì; không tạo lại | Tận dụng index PK/FK có sẵn trên games/users/reviews/game_bought; `games_store_title_idx` phục vụ danh sách dẫn tới chi tiết |
| 5. Gửi yêu cầu đăng tải game | `v_actor_accounts`, `v_catalog_games`, `v_game_genres`, `v_game_submission_details` | `sp_submit_game` | Trigger mới không tạo đơn thay procedure; giữ trigger khóa submission V2 | `game_submissions_game_status_idx` |
| 6. Đăng ký nhà phát triển và hoàn tất xét duyệt | `v_actor_accounts`, `v_developer_submission_details` | `sp_submit_developer_application`, `sp_review_developer_application` | Không thêm trigger đổi role; procedure chịu trách nhiệm nguyên tử | `developer_submissions_user_status_idx`, `developer_submissions_status_id_idx` |
| 7. Xét duyệt yêu cầu đăng tải game | `v_actor_accounts`, `v_game_submission_details`, `v_catalog_games` | `sp_review_game_submission` | Giữ `submissions_lock_game` V2; trigger mới chỉ vô hiệu duyệt khi có sửa nội dung/genre về sau | `game_submissions_game_status_idx`; hàng đợi còn dùng `game_submissions_queue_idx` đã có |
| 8. Quản lý trò chơi đã đăng tải (đăng tải, cập nhật) | `v_actor_accounts`, `v_catalog_games`, `v_game_genres`, `v_genre_summary`, `v_game_submission_details` | `sp_create_game`, `sp_update_game`, `sp_submit_game`, `sp_set_game_status` | `games_invalidate_approval`, `game_genres_invalidate_approval` | `game_submissions_game_status_idx`; tận dụng `games_developer_idx` đã có |

Các đối tượng dùng lại giữa nhiều chức năng chỉ được tạo một lần. Đọc promotion/review/quyền sở hữu là tích hợp hiển thị; không chuyển đổi các luồng ghi ví, mua, khuyến mãi, wishlist hoặc review ngoài phạm vi.

## 3. Danh sách đầy đủ các view mới

| View | Dữ liệu/chức năng |
| --- | --- |
| `public.v_actor_accounts` | id, username, role, status của người thao tác |
| `public.v_catalog_developers` | id/username của DEVELOPER hoặc ADMINISTRATOR VERIFIED, làm chủ sở hữu hợp lệ khi tạo game |
| `public.v_genre_summary` | id/name/description của genre và số game liên kết |
| `public.v_game_genres` | game_id/genre_id/genre_name |
| `public.v_catalog_games` | Game cùng developer_name, genre tổng hợp, cờ có đơn ACCEPTED/PENDING; không nhân bản game theo số genre/đơn |
| `public.v_game_submission_details` | Lịch sử đơn đăng tải, tên game, người gửi/người duyệt, lý do, thời gian |
| `public.v_developer_submission_details` | Đơn developer và username; tách application_reason với reason phản hồi |
| `public.v_store_games` | Chỉ game AVAILABLE; dữ liệu hiển thị cùng thông tin promotion |
| `public.v_game_ownership` | user_id/game_id phục vụ quyền xem chi tiết game đã mua kể cả khi HIDDEN |
| `public.v_public_game_reviews` | Review cùng username công khai người viết; không kèm dữ liệu tài khoản riêng tư |

View không nhận tham số. Repository SELECT view với tham số bind cho điều kiện, sort, paging; kiểm tra quyền ở service. View công khai không tự mở quyền truy cập DB cho người dùng trình duyệt.

## 4. Danh sách đầy đủ các procedure mới

Tất cả có tham số đầu `IN p_actor_username text` lấy từ Authentication phía server. Procedure không tự COMMIT/ROLLBACK; service bao transaction quanh CALL và đọc kết quả qua view. UUID đầu ra được trả bằng OUT, không thay bằng function.

| Procedure | Tham số còn lại | Kết quả / kiểm tra chính |
| --- | --- | --- |
| `sp_create_genre` | IN p_name text, p_description text; OUT p_id uuid | Admin VERIFIED; tên không rỗng, không trùng sau chuẩn hóa |
| `sp_update_genre` | IN p_id uuid, p_name text, p_description text | Sửa genre tồn tại; cùng kiểm tra tên/mô tả |
| `sp_delete_genre` | IN p_id uuid | Chỉ xóa genre không còn liên kết |
| `sp_attach_game_genre` | IN p_genre uuid, p_game uuid | Gán idempotent, khóa game trước ghi |
| `sp_detach_game_genre` | IN p_genre uuid, p_game uuid | Gỡ idempotent; chặn genre cuối cùng |
| `sp_create_game` | IN p_title text, p_description text, p_price numeric, p_cover text, p_version text, p_genres uuid[], p_developer uuid, p_status text; OUT p_id uuid | Game + genre nguyên tử; developer tạo HIDDEN; không tạo submission ngầm |
| `sp_update_game` | IN p_id uuid, p_title text, p_description text, p_price numeric, p_cover text, p_version text, p_genres uuid[], p_developer uuid, p_status text | Không đổi owner; tính chênh lệch tập genre; không xóa/chèn lại liên kết không đổi |
| `sp_set_game_status` | IN p_id uuid, p_status text | HIDDEN/AVAILABLE; developer bật lại cần đơn ACCEPTED; cần genre khi phát hành |
| `sp_delete_game_permanently` | IN p_id uuid | Chỉ admin; chặn mọi lịch sử transaction/ownership/review; dọn quan hệ theo hành vi hiện có |
| `sp_submit_game` | IN p_game uuid; OUT p_id uuid | Đúng quyền/chủ; chưa PENDING/ACCEPTED/AVAILABLE; có genre |
| `sp_review_game_submission` | IN p_id uuid, p_status text, p_reason text | Admin; chỉ đơn PENDING; quyết định + thời điểm/người duyệt + trạng thái game cùng transaction |
| `sp_submit_developer_application` | IN p_reason text; OUT p_id uuid | Chỉ VERIFIED USER; lý do 1–2000 ký tự; tối đa một PENDING qua procedure |
| `sp_review_developer_application` | IN p_id uuid, p_status text, p_reason text | Admin VERIFIED; applicant còn VERIFIED USER; ACCEPTED + role DEVELOPER nguyên tử |

Mã lỗi nghiệp vụ: G0400 → 400; G0401 → 401; G0403 → 403; G0404 → 404; G0409 → 409. Java phân loại bằng SQLSTATE, không dựa nội dung thông báo.

Các thao tác catalog/genre dùng chung advisory transaction lock `gamestore.genre-management`; các thao tác đơn developer dùng `gamestore.developer-submissions`. Mọi thao tác ghi liên kết genre qua procedure khóa game trước khi thay liên kết. Không thêm unique constraint/index ngầm để đổi quy tắc dữ liệu legacy.

## 5. Trigger mới và function đi kèm

| Trigger | Bảng / thời điểm | Điều kiện và hiệu ứng |
| --- | --- | --- |
| `games_invalidate_approval` | games; AFTER UPDATE FOR EACH ROW | Chỉ khi title/description/price/cover_image_url/version thực sự khác, xét NULL; game có chủ không phải admin thì HIDDEN và đơn ACCEPTED → REJECTED với reason `Trò chơi đã bị chỉnh sửa` |
| `game_genres_invalidate_approval` | game_genres; AFTER INSERT/UPDATE/DELETE FOR EACH ROW | Thay đổi liên kết thật gọi cùng quy tắc vô hiệu duyệt; UPDATE chuyển game xử lý cả game cũ/mới |

Trigger không đổi reviewed_by/reviewed_at và không hủy đơn PENDING. Lưu cùng nội dung/tập genre, đổi thứ tự genre, gán trùng, thay rating/promotion/status không làm mất duyệt. Game thuộc admin được miễn theo nghiệp vụ hiện có. Không có trigger gửi đơn hoặc đổi role developer, tránh hai nơi cùng ghi một tác dụng.

| Function mới | Loại / nhiệm vụ |
| --- | --- |
| `fn_huan_actor(text,text[])` | Helper đọc/khóa quyền và trạng thái hiện tại, trả composite của v_actor_accounts |
| `fn_huan_owned_game(v_actor_accounts,uuid)` | Helper khóa game, kiểm tra tồn tại/chủ sở hữu |
| `fn_huan_validate_game_input(text,text,numeric,text,text,uuid[])` | Helper kiểm tra dữ liệu game và tập genre |
| `fn_huan_invalidate_game_approval(uuid)` | Helper vô hiệu duyệt dùng chung cho hai trigger |
| `fn_huan_game_content_changed()` | Trigger function cho games |
| `fn_huan_game_genres_changed()` | Trigger function cho game_genres |

Các trigger V2 được giữ nguyên, không tính vào số tạo mới: `transactions_protect_purchase`, `transactions_grant_game`, `game_bought_validate`, `reviews_lock_game`, `reviews_refresh_rating`, `submissions_lock_game`. Hai trigger bắt buộc game có submission từng tồn tại ở V2 đã bị V4 gỡ, không được khôi phục.

## 6. Index: đã có và bổ sung

### 6.1. Index đã có trước triển khai — kiểm tra trực tiếp trên DB ứng dụng

| Bảng | Index hiện có | Công dụng trong phạm vi |
| --- | --- | --- |
| genres | `genres_pkey (id)` UNIQUE | Chi tiết/sửa/xóa theo UUID |
| games | `games_pkey (id)` UNIQUE; `games_developer_idx (developer_id)`; `games_promotion_idx (promotion_id)` | Chi tiết, quản lý game theo developer, đọc promotion |
| game_genres | `game_genres_pkey (game_id,genre_id)` UNIQUE; `game_genres_genre_idx (genre_id)` | Chống liên kết trùng, đọc genre của game, đếm/chặn xóa genre đang dùng |
| game_submissions | `game_submissions_pkey (id)` UNIQUE; `game_submissions_game_idx (game_id)`; `game_submissions_queue_idx (status,created_at DESC,id)`; `game_submissions_submitter_idx (submitted_by)`; `game_submissions_reviewer_idx (reviewed_by)` | Lịch sử, hàng đợi và các quan hệ người gửi/duyệt |
| developer_submissions | `developer_submissions_pkey (id)` UNIQUE; `developer_submissions_user_idx (user_id)` | Chi tiết và đơn của người gửi |
| users | `users_pkey (id)` UNIQUE; `users_username_unique (lower(username))` UNIQUE; `users_email_unique (lower(email))` UNIQUE; `users_verification_token_idx (verification_token)` UNIQUE, WHERE token IS NOT NULL | Actor/developer/name; hai index email/token thuộc auth có sẵn, không tạo lại |
| game_bought | `game_bought_pkey (user_id,game_id)` UNIQUE; `game_bought_game_idx (game_id)`; `game_bought_transaction_id_key (transaction_id)` UNIQUE | Quyền xem game HIDDEN đã mua; kiểm tra bảo vệ lịch sử |
| reviews | `reviews_pkey (id)` UNIQUE; `reviews_game_idx (game_id)`; `reviews_user_id_game_id_key (user_id,game_id)` UNIQUE | Review công khai theo game; bảo vệ xóa game có review |
| transactions | `transactions_pkey (id)` UNIQUE; `transactions_game_idx (game_id)`; `transactions_user_created_idx (user_id,created_at DESC)`; `transactions_one_successful_buy (user_id,game_id)` UNIQUE WHERE type=BUY AND status=SUCCESSED; `transactions_ownership_reference (id,user_id,game_id)` UNIQUE; `transactions_user_idempotency_key (user_id,idempotency_key)` UNIQUE WHERE idempotency_key IS NOT NULL | Chỉ kiểm tra lịch sử khi xóa game; các index commerce giữ nguyên |
| promotions | `promotions_pkey (id)` UNIQUE | JOIN dữ liệu hiển thị giá/giảm giá |

Các PK/index bắt đầu bằng cột FK đã đáp ứng nhiều truy vấn; không tạo thêm bản sao chỉ vì bảng có nhiều chức năng. V10 cũng không xóa index cũ có prefix trùng vì việc xóa chưa thuộc phạm vi duyệt.

### 6.2. Năm index mới được duyệt và tạo qua V10

| Index | Định nghĩa | Lý do bổ sung |
| --- | --- | --- |
| `genres_name_lookup_idx` | genres USING btree (lower(btrim(name))) | Tra tên chuẩn hóa để kiểm tra trùng và sắp xếp |
| `game_submissions_game_status_idx` | game_submissions USING btree (game_id,status) | Kiểm tra PENDING/ACCEPTED và vô hiệu duyệt theo game |
| `developer_submissions_user_status_idx` | developer_submissions USING btree (user_id,status) | Kiểm tra người gửi đã có đơn PENDING |
| `developer_submissions_status_id_idx` | developer_submissions USING btree (status,id) | Hàng đợi theo trạng thái, paging ổn định theo id |
| `games_store_title_idx` | games USING btree (lower(title),id) WHERE status='AVAILABLE' | Duyệt danh sách cửa hàng và ORDER BY tên/id trong tập AVAILABLE |

Tất cả không UNIQUE; không sửa dữ liệu hoặc thêm quy tắc tính duy nhất. Index cửa hàng không tăng tốc `strpos` giữa chuỗi; không thêm pg_trgm/GIN ngoài phạm vi. Với dữ liệu ít PostgreSQL có thể chọn sequential scan; không cam kết tốc độ từ việc index tồn tại. Không dùng EXPLAIN ANALYZE trên câu ghi dữ liệu để đo hiệu năng.

## 7. API và luồng ứng dụng sau chuyển đổi

- Giữ nguyên endpoint quản lý `/api/admin/genres`, `/api/catalog` và `/api/developer`.
- Thêm `GET /api/store/games?q=&page=0&size=20`: tìm chuỗi con không phân biệt hoa/thường, `%`/`_` là ký tự thường; chỉ AVAILABLE; trả items/promotions/total/page/size.
- Thêm `GET /api/store/games/{id}`: trả game/promotions/reviews/owned; cho AVAILABLE hoặc admin/chủ developer/người đã mua; người khác nhận 404 với game HIDDEN.
- Mọi endpoint giữ JWT và kiểm tra account VERIFIED từ DB. DTO cửa hàng không trả flags/đơn đăng tải, email, mật khẩu, token hoặc số dư.
- Service transaction READ_COMMITTED cho ghi và REPEATABLE_READ cho các snapshot đọc nhiều truy vấn. JdbcTemplate vẫn được dùng để SELECT view và CALL procedure; không có DML trực tiếp trong các service quản lý đã chuyển.
- Crop/upload Cloudinary, xác thực JWT và các hành động commerce giữ nguyên trách nhiệm. Demo dùng dữ liệu cục bộ, không gọi API store thật.

## 8. Kiểm chứng và trạng thái triển khai

| Kiểm tra | Kết quả | Phạm vi bằng chứng |
| --- | --- | --- |
| Toàn bộ Maven backend | 96/96 đạt; không lỗi/thất bại/bỏ qua | DB test thực cho các bài integration; các bài unit dùng mock đúng phạm vi |
| HuanDatabaseProgrammabilityTests | 12/12 trong tổng 96 | CALL/OUT UUID, 13 procedure thật, 10 view, 2 trigger, 5 index; CRUD/khóa/đơn trùng; DML trực tiếp kích hoạt trigger; không đổi nội dung/tập genre; rollback; developer role; bảo vệ lịch sử mua |
| GenreApiTests / CatalogApiTests | 4/4 và 9/9 trong tổng 96 | HTTP/JWT → Java → procedure/view/trigger → PostgreSQL |
| StoreApiTests | 5/5 trong tổng 96 | Search literal, phân trang/offset lớn, chi tiết độc lập snapshot, quyền HIDDEN, dữ liệu công khai, role/status hiện tại |
| Node frontend | 21/21 đạt | Commerce adapter và Store adapter, lỗi/đổi phiên/payload |
| Playwright với API mock | 26 trường hợp riêng biệt đạt theo nhóm | Store/detail/discovery/flows/games/genres/developers; không xem đây là bằng chứng DB |
| Playwright live | 3/3 đạt; không mock API | Trình duyệt/API → backend thật → PostgreSQL riêng: catalog phát hành/sửa cần duyệt lại; đơn developer + đổi role; mua giảm giá/nạp/review/persistence/doanh thu |
| Frontend build/lint | Build đạt; lint 0 lỗi, 4 cảnh báo có sẵn ngoài phạm vi | Đóng gói frontend và kiểm tra tĩnh |
| Kiểm tra diff/truy cập SQL | Không lỗi whitespace; các repository trong phạm vi chỉ SELECT view/CALL | Không còn Java DML trực tiếp hoặc helper Java tự vô hiệu duyệt |
| DB ứng dụng | Flyway thực thi đúng 2 migration V9/V10, đều success; validate 10 migration thành công | Đối chiếu pg_views/pg_proc/pg_trigger/pg_indexes trực tiếp; đủ danh mục tại mục 3–6, 12 bảng nghiệp vụ giữ nguyên số dòng |

PostgreSQL test chạy riêng trên loopback `127.0.0.1:55439`, databases `commerce_test`, `commerce_live_test` và schema scratch `huan_sql_test` dùng kiểm tra migration; không phải DB ứng dụng. Guard từ chối integration test ngoài loopback/database hậu tố `_test`. V1–V10 được Flyway validate thành công; lần chạy kế tiếp không áp dụng lặp migration.

DB ứng dụng chỉ áp dụng DDL đã duyệt và kiểm tra chỉ đọc sau migration; không chạy luồng CRUD thử nghiệm hoặc tạo account/game/đơn test trên DB ứng dụng. Bộ jar backend đóng gói thành công; để tiến trình phát triển đang mở sử dụng mã mới, khởi động lại backend/frontend theo cách chạy thông thường của dự án.

Các fixture test cũ được cập nhật để phù hợp schema/auth hiện tại: tạo user VERIFIED bằng fixture DB thay vì đòi `/auth/register` trả id/token và gửi email thật; đổi notifications.content thành message/read_at trong test V6. Không sửa auth/commerce sản phẩm để làm test đạt. Cấu hình test có SMTP localhost và timeout, không dùng tài khoản email thật.

Với WSL có thời gian probe cổng đóng lâu, live config hỗ trợ `COMMERCE_LIVE_REUSE_SERVER=1` để dùng Vite 5180 đã mở đúng `VITE_API_BASE_URL=http://127.0.0.1:18080/api`. Mặc định vẫn tự chạy server riêng. Fixture live vẫn bị cố định vào DB `commerce_live_test`; không dùng script này để seed DB ứng dụng.

## 9. Vận hành và rollback

Không chỉnh sửa V1–V8, không reset hoặc backfill dữ liệu. Flyway là nguồn áp dụng V9/V10; khởi động backend bình thường sẽ tìm migration chưa áp dụng, nên chỉ khởi động trên DB ứng dụng sau khi đã duyệt phạm vi áp dụng.

Rollback ứng dụng phải xét cả trigger: Java cũ cũng tự vô hiệu duyệt, nên tạm thời có thể lặp cùng phép cập nhật. Nếu rollback toàn bộ DB, migration bù được duyệt gỡ đúng 2 trigger mới trước, rồi 13 procedure, 6 function phụ thuộc, 10 view và 5 index theo thứ tự phụ thuộc; không DROP CASCADE rộng, không sửa lịch sử Flyway. Không hoàn tác dữ liệu CRUD hợp lệ bằng cách đoán trạng thái cũ. Tạo/chạy migration rollback cần duyệt riêng.
