# Kế hoạch chuyển tương tác database sang View, Stored Procedure và Trigger

Ngày lập: 15/11/2026. Phạm vi: 8 chức năng của Huân theo xác nhận trong cuộc trao đổi.

**Trạng thái: chỉ là kế hoạch. Chưa tạo/sửa migration, chưa thay đổi database, chưa chạy test có ghi database.** Phân tích dựa trên source Java, frontend, migration V1–V8 và tài liệu trong repository; chưa đối chiếu trực tiếp schema đang chạy.

**Cập nhật triển khai ngày 15/11/2026:** người dùng đã duyệt triển khai kế hoạch, bổ sung riêng 5 index, DB test và áp dụng V9/V10 vào DB ứng dụng. Đợt triển khai đã hoàn tất; trạng thái ở đoạn trên là thời điểm lập kế hoạch. Danh mục đối tượng thực tế, SQL đầy đủ và kết quả kiểm chứng nằm trong [báo cáo hoàn tất](huan-db-report.md).

## 1. Mục tiêu và phạm vi

Chuyển các luồng sau sang đọc qua view, ghi qua stored procedure và tự động đồng bộ dữ liệu bằng trigger, giữ nghiệp vụ và giao diện hiện tại:

1. Quản lý thể loại game.
2. Quản lý trò chơi trên nền tảng.
3. Tìm kiếm game.
4. Xem chi tiết game.
5. Gửi yêu cầu đăng tải game.
6. Đăng ký nhà phát triển, gồm gửi/xem đơn và bước xét duyệt hiện có để hoàn tất luồng đăng ký.
7. Xét duyệt yêu cầu đăng tải game.
8. Quản lý trò chơi đã đăng tải: tạo bản nháp, đăng tải, cập nhật, ẩn/bật lại.

Không chuyển đổi nghiệp vụ ví, mua game, nạp tiền, quản lý khuyến mãi, wishlist, ghi review, doanh thu, đăng nhập/xác thực email hay quản lý tài khoản. Đọc thông tin khuyến mãi, review công khai và quyền sở hữu để hiển thị chi tiết game vẫn thuộc phạm vi tích hợp, nhưng không sửa luồng ghi của các chức năng đó.

“Thay SQL thuần” được hiểu là Java của các luồng trên không còn truy vấn bảng gốc hoặc thực hiện INSERT/UPDATE/DELETE trực tiếp. Repository vẫn gửi SQL có tham số để SELECT view hoặc CALL procedure; SQL xử lý dữ liệu nằm trong database. Không cần ép từng chức năng dùng đủ cả ba kỹ thuật.

Ưu tiên stored procedure đúng nghĩa: `CREATE PROCEDURE`, gọi bằng `CALL`. Function phục vụ trigger vẫn cần có vì PostgreSQL thực thi trigger thông qua trigger function; function này không thay thế procedure nghiệp vụ. [Tài liệu CREATE TRIGGER PostgreSQL 17](https://www.postgresql.org/docs/17/sql-createtrigger.html).

## 2. Hiện trạng đã kiểm tra

| Khu vực | Cách triển khai hiện tại | Hướng chuyển |
| --- | --- | --- |
| `GenreService` | SELECT/INSERT/UPDATE/DELETE bằng JdbcTemplate, kiểm tra quyền, tên trùng, genre cuối cùng và advisory lock trong Java | Tách repository; đọc view; ghi bằng procedure |
| `CatalogRepository` | JOIN games/users/submissions, tải liên kết genre, tính cờ duyệt từ dữ liệu | Gom các phép JOIN và cờ nghiệp vụ vào view |
| `CatalogService` | Ghi games/game_genres/game_submissions trực tiếp, quản lý quyền và transaction | Procedure nhận người thao tác và dữ liệu; Java giữ điều phối API |
| `CatalogApprovalRules` | Java tự ẩn game và đổi đơn ACCEPTED thành REJECTED sau sửa nội dung/genre | Chuyển thành trigger và helper nội bộ DB |
| `DeveloperService` | Truy vấn, gửi đơn, kiểm tra đơn trùng, xét duyệt và đổi role bằng JdbcTemplate | View cho danh sách; procedure cho gửi/xét duyệt |
| `StorePage.jsx` | Tìm theo tên bằng `.filter()` trên danh sách đã tải | API tìm kiếm thực hiện truy vấn view tại DB |
| `GameDetailsPage.jsx` | Tìm game, developer, review trong commerce state | API chi tiết đọc view; giữ các hành động commerce hiện có |
| Database | Migration V2 có trigger quyền sở hữu, bảo vệ giao dịch, rating và khóa submission; V4 gỡ quy tắc bắt game mới phải có submission | Giữ trigger hiện có; thêm trigger đúng phần catalog |

Source đang dùng PostgreSQL, Flyway và `ddl-auto: validate`. Không dùng lại quy tắc V2 đã bị V4 gỡ: game nháp được phép chưa có đơn đăng tải. V5 đã bỏ revision; kế hoạch không đưa revision trở lại. Có V8 trong source, nhưng phiên bản thực tế phải được kiểm tra chỉ đọc trước khi đánh số migration mới.

## 3. Thiết kế phân chia trách nhiệm

Luồng đọc: `Controller → Service → Repository → View → bảng gốc`.

Luồng ghi: `Controller → Service → Repository → CALL Procedure → bảng gốc → Trigger`.

- **View:** định nghĩa dữ liệu đọc, JOIN, tổng hợp genre và trạng thái duyệt. Repository thêm điều kiện có tham số, sắp xếp và phân trang; view không tự nhận tham số.
- **Procedure:** kiểm tra quyền hiện tại trong DB, chủ sở hữu, điều kiện nghiệp vụ; lấy khóa; ghi các bảng liên quan nguyên tử.
- **Trigger:** tự vô hiệu kết quả duyệt khi nội dung hoặc tập genre thực sự thay đổi; thực hiện kể cả khi thay đổi đến từ nhiều procedure khác nhau.
- **Java:** xác thực JWT, lấy danh tính từ Authentication, kiểm tra định dạng request, gọi DB, ánh xạ DTO và lỗi HTTP. Crop/upload Cloudinary và tải file Markdown hiện có tiếp tục ở tầng ứng dụng.

Service tiếp tục mở transaction bằng `@Transactional`. Procedure không tự COMMIT/ROLLBACK; lỗi từ procedure/trigger phải làm rollback toàn bộ thao tác. PostgreSQL không cho procedure điều khiển transaction khi CALL nằm trong transaction block. [Tài liệu CALL PostgreSQL 17](https://www.postgresql.org/docs/17/sql-call.html).

## 4. Danh mục view dự kiến

Tên dưới đây là tên thiết kế để duyệt; chưa có đối tượng nào được tạo.

| View | Nội dung và nơi sử dụng |
| --- | --- |
| `v_actor_accounts` | id, username, role, status để xác định người thao tác và quyền hiện tại; không chứa password, token, email hoặc balance |
| `v_catalog_developers` | Danh sách chủ sở hữu hợp lệ: DEVELOPER/ADMINISTRATOR đã VERIFIED; dùng khi admin tạo game |
| `v_genre_summary` | id, name, description, game_count; dùng cho danh sách/chi tiết genre |
| `v_catalog_games` | Thông tin game, developer_name, can_enable từ đơn ACCEPTED, has_pending_submission từ đơn PENDING; dùng quản lý và làm nguồn chi tiết |
| `v_game_genres` | game_id, genre_id, genre_name; dùng quản lý liên kết và tập genre |
| `v_game_submission_details` | Đơn đăng tải, tên game, tên người gửi/người duyệt, reason, created_at, reviewed_at; giữ lịch sử đầy đủ |
| `v_developer_submission_details` | Đơn đăng ký developer cùng username, application_reason và reason |
| `v_store_games` | Game AVAILABLE cùng genre, developer, giá niêm yết và thông tin giảm giá cần để hiển thị; không mang lịch sử xét duyệt nội bộ |
| `v_game_ownership` | Chỉ user_id, game_id phục vụ quyền xem game HIDDEN đã mua; không đưa lịch sử giao dịch ra API chi tiết |
| `v_public_game_reviews` | Review và tên công khai người viết phục vụ trang chi tiết; không chứa dữ liệu tài khoản riêng tư |

Quy tắc đọc:

- Mỗi view liệt kê cột tường minh; tránh `SELECT *` và tránh JOIN làm nhân bản game khi game có nhiều genre/submission.
- View quản lý không mặc nhiên được trả cho người dùng thường. Repository/service lọc quyền, ánh xạ danh sách trường đúng DTO.
- Store chỉ tìm trong game AVAILABLE như giao diện hiện tại; game HIDDEN đã mua vẫn được xem qua trang chi tiết/thư viện.
- Chi tiết game giữ quyền nhìn thấy hiện có: AVAILABLE, hoặc người sở hữu game đã mua, hoặc developer chủ game, hoặc admin; kiểm tra actor VERIFIED từ DB. Không để đoán UUID mở được game HIDDEN của người khác.
- Không dựa vào `current_user` để phân biệt người dùng web: kết nối backend có thể dùng chung một DB account. Actor phải lấy từ Authentication phía server, không nhận tùy ý từ body/query của client.
- View không tự tạo cơ chế phân quyền theo người dùng ứng dụng. Không coi việc tạo view là đã giải quyết kiểm soát truy cập. [Tài liệu CREATE VIEW PostgreSQL 17](https://www.postgresql.org/docs/17/sql-createview.html).

## 5. Danh mục stored procedure dự kiến

Mọi procedure công khai bên dưới nhận `p_actor_username` lấy từ JWT đã xác thực tại backend, đọc lại role/status hiện tại trong DB và từ chối thao tác trái quyền. Không nhận role do client gửi để cấp quyền.

| Procedure | Thao tác | Bảo toàn nghiệp vụ |
| --- | --- | --- |
| `sp_create_genre` | Tạo genre | Admin VERIFIED; trim, giới hạn độ dài, tên trùng không phân biệt hoa/thường |
| `sp_update_genre` | Sửa genre | Cùng quy tắc tên/mô tả; không tự gây duyệt lại game vì hiện tại đổi tên genre không có tác dụng này |
| `sp_delete_genre` | Xóa genre | Chặn khi còn liên kết game |
| `sp_attach_game_genre` | Gán genre | Admin VERIFIED, game/genre tồn tại; idempotent |
| `sp_detach_game_genre` | Gỡ genre | Idempotent; chặn gỡ genre cuối cùng; thay đổi thật mới kích hoạt vô hiệu duyệt |
| `sp_create_game` | Tạo game + các liên kết genre | Chủ sở hữu hợp lệ; ít nhất 1 genre; developer tạo HIDDEN; không tự tạo submission |
| `sp_update_game` | Sửa thông tin + tập genre | Không đổi chủ sở hữu; khóa game; kiểm tra tập genre đầy đủ trước khi ghi; giữ quy tắc admin/developer hiện tại |
| `sp_set_game_status` | Ẩn/bật game | Developer chỉ bật khi có đơn ACCEPTED; kiểm tra ít nhất 1 genre; admin giữ quyền phát hành hiện tại |
| `sp_delete_game_permanently` | Xóa game đủ điều kiện và dữ liệu phụ thuộc | Chỉ admin; chặn nếu có bất kỳ transaction, ownership hoặc review; giữ quy tắc cascade đang có |
| `sp_submit_game` | Gửi đơn đăng tải | Đúng chủ/admin, có genre, chưa có PENDING, chưa được duyệt/phát hành; ghi submitted_by và thời điểm gửi |
| `sp_review_game_submission` | Duyệt/từ chối đơn | Admin VERIFIED; chỉ đơn PENDING; reason bắt buộc; ghi người/thời điểm duyệt và AVAILABLE/HIDDEN trong cùng transaction |
| `sp_submit_developer_application` | Gửi đơn developer | Chỉ VERIFIED USER; application_reason 1–2.000 ký tự; tối đa một PENDING |
| `sp_review_developer_application` | Duyệt/từ chối đơn developer | Admin VERIFIED; applicant vẫn VERIFIED USER; ACCEPTED + đổi role thành DEVELOPER nguyên tử; REJECTED giữ role |

Quy ước kết quả:

- Procedure tạo/trả đối tượng dùng tham số OUT trả UUID của bản ghi; repository đọc lại qua view trong cùng transaction để giữ DTO hiện tại. Không dùng function trả bảng để thay thế procedure ghi.
- Java gọi CALL có tham số qua JdbcTemplate/CallableStatement. Làm một bước tích hợp nhỏ để kiểm chứng nhận OUT UUID trước khi chuyển hàng loạt.
- Định nghĩa mã lỗi nghiệp vụ bằng SQLSTATE riêng và ánh xạ tập trung sang HTTP 400/403/404/409; không phân loại lỗi bằng cách dò chuỗi thông báo. Lỗi 401 vẫn do tầng xác thực khi phù hợp.
- Procedure chỉ giữ các kiểm tra quyền/nghiệp vụ và ghi dữ liệu cần thiết; không chuyển xử lý upload ảnh, BCrypt, email hoặc JWT vào DB.

## 6. Trigger dự kiến và giới hạn tác động

### 6.1. Sửa nội dung game làm mất hiệu lực duyệt

Thêm trigger AFTER UPDATE trên `games`, chỉ xử lý khi một trong các trường title, description, price, cover_image_url, version **thực sự thay đổi**; so sánh có xét NULL.

Nếu chủ game hiện không phải ADMINISTRATOR:

1. Chuyển các submission ACCEPTED của game thành REJECTED, reason đúng `Trò chơi đã bị chỉnh sửa`.
2. Đặt game HIDDEN.
3. Giữ nguyên reviewed_by/reviewed_at; giữ nguyên các đơn PENDING như hành vi hiện tại.

Không kích hoạt việc duyệt lại khi chỉ thay status, rating, promotion_id hoặc dữ liệu không đổi. Điều này tránh các luồng review, khuyến mãi và ẩn/bật hiện có vô tình làm mất kết quả duyệt. Helper/trigger phải có điều kiện chống gọi đệ quy khi tự cập nhật status.

### 6.2. Thay đổi tập genre cũng làm mất hiệu lực duyệt

Thêm trigger trên INSERT/DELETE/UPDATE liên kết `game_genres`, gọi chung helper vô hiệu duyệt ở trên. Với UPDATE chuyển liên kết, xử lý cả game cũ và mới nếu có.

Procedure cập nhật game phải tính chênh lệch tập genre: chỉ xóa liên kết bị bỏ, chỉ thêm liên kết mới. Không tiếp tục xóa toàn bộ rồi chèn lại như source hiện tại, vì cách đó sẽ kích hoạt trigger dù người dùng lưu cùng một tập genre. Đổi thứ tự danh sách không được xem là thay đổi nội dung.

Các procedure gán/gỡ/sửa game phải khóa dòng game trước khi thay liên kết. Nếu bổ sung trigger BEFORE để bảo vệ thứ tự khóa ngay tại bảng `game_genres`, trigger chỉ khóa các game liên quan theo thứ tự UUID ổn định. Xác nhận tập sự kiện/tên trigger này trong bản đề xuất DB trước khi tạo migration.

### 6.3. Những quy tắc vẫn nằm trong procedure

- Tối thiểu một genre được kiểm tra trong procedure tạo/sửa/gỡ/gửi/phát hành. Không thêm constraint trigger toàn cục trong đợt đầu để tránh thay quy tắc của dữ liệu legacy hoặc các luồng ngoài phạm vi.
- Kết quả xét duyệt game → trạng thái game nằm trong `sp_review_game_submission`.
- Kết quả xét duyệt developer → role nằm trong `sp_review_developer_application`.
- Mỗi tác dụng chỉ có một nơi chịu trách nhiệm. Khi chuyển sang trigger, bỏ lời gọi Java tương ứng trong `CatalogApprovalRules`; không vừa ghi ở Java vừa để trigger ghi lại.

Giữ các trigger hiện có của V2 sau V4/V5, đặc biệt ownership, rating, bảo vệ BUY và khóa submission. Không tạo trigger trừ/cộng ví hoặc gửi thông báo khuyến mãi trong phạm vi này.

## 7. Tìm kiếm và xem chi tiết phải chuyển đường đọc

Đề xuất thêm hai API đọc riêng cho người dùng cửa hàng, tránh dùng endpoint quản lý `/api/catalog/games/{id}` vốn chỉ dành cho developer/admin:

| API đề xuất | Xử lý |
| --- | --- |
| `GET /api/store/games?q=...&page=0&size=20` | Tìm tên không phân biệt hoa/thường trên `v_store_games`, trả items/total/page/size; giữ kiểu tìm chuỗi con hiện có |
| `GET /api/store/games/{id}` | Chi tiết game theo quyền nhìn thấy; đọc catalog, genre, review công khai và quyền sở hữu qua các view; không trả lịch sử đơn nội bộ |

- Không tự mở các API này cho khách chưa đăng nhập: giữ yêu cầu xác thực hiện tại. Demo tiếp tục dùng adapter dữ liệu cục bộ riêng.
- Tìm kiếm dùng tham số bind, có giới hạn q và size. Ưu tiên phép tìm chuỗi con để `%` và `_` trong tên tìm kiếm không vô tình trở thành wildcard.
- Frontend debounce khoảng 300 ms, xử lý request đến sai thứ tự, loading/error/empty và thao tác xóa từ khóa. Không tiếp tục tìm chỉ trong một trang dữ liệu đã tải.
- Trang chi tiết gọi theo gameId khi mở URL trực tiếp/reload; phân biệt đang tải, lỗi API và không tìm thấy. Không phụ thuộc game đã có sẵn trong commerce snapshot.
- Giá hiển thị tiếp tục khớp quy tắc tiền/khuyến mãi hiện có; mua vẫn gọi commerce API để kiểm tra giá có thẩm quyền. Không chuyển quyền quyết định giá mua sang view hiển thị.
- Các nút mua, wishlist, review, tải file giữ hành vi hiện có. Sau mutation, làm mới phần dữ liệu chi tiết liên quan để review/rating/quyền sở hữu không bị cũ.
- Không cần sửa SQL của `CommerceRepository` trong đợt này. Snapshot có thể tiếp tục phục vụ các màn hình ngoài phạm vi; tìm kiếm và chi tiết đã có đường đọc qua view riêng để chứng minh yêu cầu môn học.

## 8. Thứ tự triển khai và điều kiện hoàn tất

| Giai đoạn | Công việc | Điều kiện hoàn tất |
| --- | --- | --- |
| 0. Chốt hợp đồng | Đối chiếu schema/Flyway chỉ đọc; chốt cột view, tham số procedure, mã lỗi, trigger và API; lập đề xuất thay đổi DB cụ thể | Có bảng đối chiếu endpoint → đối tượng DB và phạm vi xin duyệt rõ ràng |
| 1. Nền tảng + genre | Sau phê duyệt: view actor/genre/liên kết, procedure CRUD/gán/gỡ; repository và mapper lỗi; kiểm chứng CALL + OUT | Genre API giữ hành vi, không còn đọc/ghi bảng trực tiếp trong luồng genre |
| 2. Catalog + trigger | View catalog/submissions/developers; procedure game và gửi/duyệt; trigger vô hiệu duyệt; bỏ ghi trực tiếp của CatalogApprovalRules | Tạo nháp → gửi → duyệt → phát hành → sửa → duyệt lại hoạt động; không đổi nghiệp vụ |
| 3. Đăng ký developer | View đơn và hai procedure gửi/duyệt; tách DeveloperRepository | Gửi/xem/duyệt nguyên tử; không dùng role JWT cũ để cấp quyền |
| 4. Store và chi tiết | View cửa hàng/quyền sở hữu/review; hai API đọc; frontend đổi nguồn dữ liệu | Tìm thật ở DB; URL chi tiết trực tiếp, game ẩn đã mua, trạng thái lỗi hoạt động |
| 5. Hồi quy + bàn giao | Kiểm thử DB/API/UI; rà lại truy cập SQL; tài liệu và kịch bản trình diễn | Đủ 8 chức năng qua đường DB mới, có bằng chứng kiểm thử và rollback |

Các phần dùng chung file được triển khai tuần tự; không thay đồng thời CatalogService/GenreService khi hợp đồng trigger chưa ổn định. Chưa ấn định số ngày trước khi chốt khối lượng migration và kiểm thử thực tế.

## 9. Transaction, đồng thời và quyền

- Giữ advisory transaction lock đang dùng chung giữa genre/catalog; chuyển việc lấy khóa vào procedure, không để Java giữ một nửa quy tắc.
- Developer application tiếp tục khóa điều phối riêng; đọc quyền sau khóa như source hiện tại.
- Quy định thứ tự khóa trước khi cài đặt: khóa điều phối của module → khóa các user liên quan theo thứ tự ổn định nếu cần → khóa game theo thứ tự UUID → submission/liên kết. Đối chiếu với luồng mua đang khóa user rồi game để tránh tạo vòng chờ mới.
- Hai yêu cầu gửi cùng game/user chỉ tạo một đơn PENDING qua procedure, dù không thêm unique index mới.
- Giữ isolation của snapshot quản lý nhiều truy vấn để game/genre/lịch sử đơn nhất quán.
- Procedure kiểm tra trạng thái hiện tại trước khi ghi; trigger không tin role do request gửi vào.
- Chưa thay GRANT/REVOKE của DB account dùng chung. Nếu cần chặn tuyệt đối SQL trực tiếp bằng quyền DB, phải lập phạm vi riêng vì commerce/auth vẫn truy cập bảng gốc. Không mặc nhiên dùng SECURITY DEFINER để bỏ qua quyền.

## 10. Đề xuất thay đổi database để xin duyệt trước triển khai

Đây là phạm vi dự kiến, chưa phải đề nghị thực thi ngay. Trước khi bắt tay triển khai cần chốt chính xác danh mục và xin duyệt theo AGENTS.md.

| Nhóm đối tượng | Thay đổi dự kiến | Dữ liệu bị ảnh hưởng |
| --- | --- | --- |
| View | Tạo các view mục 4 | Chỉ đọc; không sao chép/backfill dữ liệu |
| Procedure | Tạo các procedure mục 5 | Khi được API gọi: ghi genres, game_genres, games, game_submissions, developer_submissions; users.role chỉ trong xét duyệt developer |
| Trigger/function nội bộ | Trigger nội dung games, trigger liên kết game_genres, helper/trigger function; quyết định trigger khóa liên kết ở giai đoạn 0 | Chỉ tác động các lần sửa tương lai; có thể đổi games.status và game_submissions.status/reason theo đúng nghiệp vụ cũ |
| Migration | Thêm phiên bản Flyway mới sau phiên bản cao nhất đã xác minh; chia theo các đợt triển khai ở mục 8 | Không sửa V1–V8 đã có, không reset dữ liệu |
| Xóa game hợp lệ | Procedure thực hiện quy trình xóa đã có | Khi admin yêu cầu CRUD: xóa game và dữ liệu phụ thuộc đủ điều kiện, gồm cascade notification/wishlist theo FK hiện hành; giữ chặn lịch sử |

Không dự kiến thêm bảng, cột, revision, index, constraint mới hoặc thay các FK hiện tại. Không chạy UPDATE sửa dữ liệu hàng loạt, tạo dữ liệu mẫu hay tự “sửa” dữ liệu legacy. Nếu kiểm tra chỉ đọc thấy dữ liệu không tương thích, báo cụ thể và xin duyệt riêng cho phương án xử lý.

Phê duyệt cần phân biệt: (a) tạo/sửa file migration và mã ứng dụng trong phạm vi cụ thể; (b) áp dụng migration và tạo fixture trên PostgreSQL test riêng; (c) áp dụng vào DB ứng dụng. Phê duyệt kế hoạch không được hiểu là tự động cho phép cả ba.

**Rollback dự kiến:** ưu tiên rollback ứng dụng trước, tạm để view/procedure mới tồn tại vì chúng không tự ghi. Riêng trigger mới vẫn chạy khi rollback Java, nên phải kiểm tra tương thích hoặc gỡ trigger mới theo migration bù được duyệt, rồi khôi phục Java tự vô hiệu duyệt. Sau khi xác nhận không còn caller, gỡ procedure, trigger function/helper và view theo thứ tự phụ thuộc, không dùng DROP CASCADE rộng. Không sửa/xóa lịch sử Flyway. Dữ liệu phát sinh từ CRUD hợp lệ không bị hoàn tác; trigger chỉ thực hiện nghiệp vụ đã có. Bản migration bù và thao tác rollback DB cũng cần phê duyệt trước khi tạo/chạy.

## 11. Kế hoạch kiểm thử và tiêu chí nghiệm thu

Không chạy các kiểm thử ghi DB ở bước lập kế hoạch. Khi được duyệt, dùng PostgreSQL test riêng có guard loopback và tên `_test`; không dùng DB ứng dụng làm fixture.

| Nhóm | Các tình huống phải kiểm chứng |
| --- | --- |
| View | DTO/cột/kiểu dữ liệu đúng; không lặp game do JOIN; game nhiều genre/đơn; không lộ password/email/token/balance/lịch sử đơn qua API cửa hàng |
| Genre | CRUD, tên trùng đồng thời, gán/gỡ lặp, chặn genre cuối, chặn xóa đang dùng, quyền bị thu hồi |
| Game | Nháp không có submission; giá/genre/owner hợp lệ; developer không tự publish hoặc đổi chủ; ẩn/bật lại; xóa có/không có lịch sử |
| Gửi/duyệt game | Gửi trùng đồng thời; hai admin duyệt cùng đơn; duyệt đơn đã xử lý; ACCEPTED phát hành nguyên tử; lỗi ở giữa phải rollback |
| Trigger | Đổi từng trường nội dung; NULL; đổi genre; cùng tập genre khác thứ tự; lưu không đổi; sửa game đang HIDDEN; chủ admin được miễn; PENDING giữ nguyên; không thay reviewer/time |
| Không ảnh hưởng commerce | Rating/promotion/status không gây mất duyệt; ownership/rating/BUY triggers cũ còn hoạt động; mua đồng thời với sửa/ẩn/xóa game không phá lịch sử |
| Developer | USER VERIFIED gửi được; đơn trùng; role/status thay trước xét duyệt; ACCEPTED đổi role cùng transaction; REJECTED không đổi role; thất bại không để đơn đã duyệt mà role chưa đổi |
| Search | Không phân biệt hoa/thường, chuỗi con, tiếng Việt, từ khóa `%`/`_`, không kết quả, phân trang ổn định, dữ liệu mới/sửa được tìm qua DB, response cũ không đè response mới |
| Chi tiết | URL trực tiếp/reload; 404; HIDDEN đã mua vẫn xem được; người khác không xem HIDDEN; tên developer/genre/review/giá đúng; mutation làm mới dữ liệu |

Tái sử dụng và cập nhật `GenreApiTests`, `CatalogApiTests`, `DeveloperServiceTests`, `DatabaseRulesTests`, các test giao diện store/game-details/genres/catalog/developers và test live catalog đang có. Bổ sung integration test PostgreSQL cho procedure/trigger; mock JdbcTemplate hoặc mock API không chứng minh được CALL, khóa và rollback thật.

Nghiệm thu khi:

1. Có ma trận 8 chức năng → endpoint → view/procedure → trigger liên quan; không bỏ sót bước tìm kiếm hoặc chi tiết đang dùng snapshot.
2. Genre/Catalog/Developer service-controller không giữ SQL truy cập bảng; repository của phạm vi này chỉ SELECT view/CALL procedure. Có thể kiểm tra bằng tìm kiếm source kết hợp review, không áp quy tắc này cho commerce/auth ngoài phạm vi.
3. Có procedure thật trong catalog PostgreSQL, có log/test lời gọi CALL; không chỉ tạo function rồi đổi tên thành `sp_...`.
4. Trigger được kiểm chứng bằng DML có kiểm soát trên DB test và quan sát hiệu ứng, không cần Java gọi helper vô hiệu duyệt.
5. API/UI giữ hành vi đã xác nhận, test đồng thời và rollback đạt; giới hạn kiểm chứng còn lại được ghi rõ.
6. Có migration được duyệt, tài liệu đối chiếu schema thực tế và phương án rollback tương thích.

Kịch bản trình diễn môn học: admin tạo genre → developer tạo nháp/gửi → admin duyệt → user tìm và mở chi tiết → developer sửa nội dung/genre → quan sát trigger ẩn game và vô hiệu duyệt cũ → gửi/duyệt lại; trình diễn thêm gửi/duyệt đăng ký developer và tác động role nguyên tử. Dùng dữ liệu test được duyệt, chỉ ra SELECT view, CALL procedure và trigger tương ứng ở từng bước.
