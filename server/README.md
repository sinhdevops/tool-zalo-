# API tài khoản

Backend dùng Node.js 24 chạy TypeScript trực tiếp, `node:http` và `zalo-api-final`. SDK chỉ được import phía server. Khởi động cùng frontend bằng `pnpm dev`, hoặc riêng bằng `pnpm dev:server` / `pnpm start:server`.

## Đăng nhập

1. Frontend tạo UUID và POST phiên đăng nhập.
2. SDK trả QR thật; frontend đọc trạng thái mỗi giây, hiển thị QR và thời gian hiệu lực.
3. Sau khi quét, người dùng xác nhận trên điện thoại. Backend nhận credentials, lấy hồ sơ và lưu phiên trước khi báo thành công.
4. Frontend cập nhật bảng. Cùng UID sẽ thay phiên đã lưu. Đóng modal đang chờ sẽ hủy phiên; QR hết hạn hoặc bị từ chối có nút tạo mới.

API không trả cookie, IMEI hay user agent đăng nhập. Các response dùng `Cache-Control: no-store`.

`accounts/zalo-transport.ts` quản lý cookie bằng `tough-cookie` riêng cho từng tài khoản, đọc từng header `Set-Cookie` bằng `getSetCookie()` và tắt chuyển hướng tự động của fetch để giữ cookie trung gian. Cách này khắc phục việc `zalo-api-final@2.1.1` tách header theo dấu phẩy trong `Expires`, làm sai Domain/Path và khiến bước `/jr/userinfo` không nhận phiên sau khi xác nhận QR. Cookie đầy đủ được chuyển lại cho SDK tại sự kiện `GotLoginInfo` để đăng nhập API và lưu/khôi phục phiên. Log chẩn đoán chỉ ghi bước HTTP, mã trạng thái và loại lỗi; không ghi cookie, QR hay nội dung phản hồi.

| Method | Đường dẫn | Kết quả |
| --- | --- | --- |
| GET | `/api/health` | Trạng thái dịch vụ |
| GET | `/api/accounts` | `{ accounts: Account[] }` |
| POST | `/api/account-logins/:uuid` | Bắt đầu đăng nhập; cùng UUID không tạo thêm phiên |
| GET | `/api/account-logins/:uuid` | QR / trạng thái / tài khoản sau khi thành công |
| DELETE | `/api/account-logins/:uuid` | Hủy đăng nhập đang chờ |
| DELETE | `/api/accounts/:id` | Xóa phiên và tài khoản khỏi công cụ |

Request thay đổi dữ liệu cần `Content-Type: application/json` và `X-Zalo-Tool: 1`. API kiểm tra Host và Origin, chỉ lắng nghe `127.0.0.1`. Đây là dịch vụ nội bộ một máy; chưa có xác thực quản trị nhiều người dùng.

## Dữ liệu phiên

Mặc định lưu trong `.data/accounts.enc` bằng AES-256-GCM; khóa tại `.data/session.key`. Cả thư mục nằm ngoài Git và không phục vụ ra frontend. Khi sao lưu cần giữ cả file dữ liệu và khóa. Khóa nằm cùng máy, vì vậy khả năng bảo vệ còn phụ thuộc quyền truy cập thư mục trên hệ điều hành. Nếu khóa mất hoặc dữ liệu lỗi, server dừng khởi động để tránh ghi đè phiên cũ.

Khi khởi động, server thử khôi phục từng tài khoản. Khôi phục thất bại hiển thị **Cần đăng nhập lại**; bấm Thêm tài khoản và quét lại cùng tài khoản. **Đã đăng nhập** phản ánh lần đăng nhập/khôi phục thành công gần nhất, chưa có listener theo dõi đăng xuất từ thiết bị khác. Xóa khỏi công cụ xóa bản lưu tại máy, không xóa tài khoản Zalo hoặc gọi đăng xuất toàn bộ thiết bị.

Biến môi trường: `ACCOUNT_API_PORT` (mặc định `3001`) và `ACCOUNT_DATA_DIR` (mặc định `.data` trong root dự án). Nếu đổi cổng, dùng cùng giá trị cho Vite và backend. Frontend dev/preview được cho phép tại localhost/127.0.0.1 cổng 5173/4173.

## Tin nhắn

Tự động hóa trực nhóm và quản lý lead đã được triển khai tại `/automation` và `/leads`. Xem [luồng xử lý, lưu dữ liệu và API](../docs/group-lead-automation.md). Quy tắc chạy trong backend khi được bật, không phụ thuộc việc mở trang chat.

Nút **Đồng bộ từ điện thoại** hiện thông báo chưa hỗ trợ. Đã ngừng gửi frame thử nghiệm vì không kích hoạt thông báo trên điện thoại và không khớp Sync V2 của Zalo Web hiện tại. `GET /api/chat/:accountId/phone-sync` trả `unavailable`; `POST` trả HTTP 501 khi socket sẵn sàng, không gửi frame. Xem [điều tra giao thức](../docs/phone-sync-investigation.md).

`server/messages/connection.ts` giữ một listener và bộ nhớ riêng cho mỗi kết nối tài khoản. Listener bắt đầu khi mở danh sách hội thoại, dừng khi xóa/thay phiên tài khoản hoặc tắt server. `selfListen` nhận cả tin gửi từ tài khoản để đồng bộ. Giao diện đọc danh sách mỗi 5 giây, đọc hội thoại mỗi 2 giây; không dùng polling để gửi tin. Nếu socket đóng, bấm làm mới để kết nối lại.

Danh sách cá nhân kết hợp bạn bè và người gửi trong lịch sử đã nhận; danh sách nhóm lấy từ `getAllGroups`/`getGroupInfo`. Tin cũ lấy qua `requestOldMessages` theo từng loại cá nhân/nhóm, không phải API lịch sử theo từng người. Nút tải thêm có thể tải cả tin của những hội thoại khác cùng loại. Mỗi hội thoại giữ tối đa 1.000 tin gần nhất trong bộ nhớ, không lưu nội dung chat xuống đĩa. Khởi động lại sẽ đồng bộ lại phần lịch sử Zalo trả về.

| Method | Đường dẫn (prefix `/api/chat/:accountId`) | Chức năng |
| --- | --- | --- |
| GET | `/conversations?type=personal\|group` | Danh sách và trạng thái listener |
| GET | `/messages?type=personal\|group&threadId=...` | Tin nhắn đã đồng bộ, trạng thái lịch sử |
| POST | `/messages?type=personal\|group&threadId=...` | Gửi `{ requestId, text, attachment?: { name, base64 } }` |
| POST | `/history?type=personal\|group` | Yêu cầu phần lịch sử kế tiếp |
| GET | `/find-user?phone=...` | Tìm người dùng và thêm vào danh sách liên hệ của phiên |
| POST | `/reconnect` | Mở lại kết nối nhận tin |
| POST | `/read?type=personal\|group&threadId=...` | Đánh dấu đã đọc trong tool đến mốc `{ through }` trả từ danh sách tin |

Số chưa đọc (`unreadCount`) được đếm từ tin mới listener nhận, riêng theo tài khoản và hội thoại. Không cộng tin lịch sử, tin tự gửi, thông báo hệ thống hay My Documents; tin trùng không cộng lại. Khi cửa sổ đang được sử dụng và hội thoại cuộn đến cuối, giao diện đánh dấu đã đọc đến mốc tin đã hiển thị; tin đến sau mốc đó vẫn còn trong bộ đếm. Trạng thái và ID tin lưu tại `.data/unread.sqlite` (hoặc `ACCOUNT_DATA_DIR`), giữ qua lần khởi động lại; file này không chứa nội dung tin hay media. Đây là số chưa đọc trong tool, không đồng bộ trạng thái đã đọc với Zalo trên điện thoại. Tin phát sinh khi listener tắt chưa được đảm bảo tính vào bộ đếm.

Chỉ gửi khi tài khoản và socket sẵn sàng, người nhận thuộc danh sách đã tải/tìm. Mỗi requestId chỉ gọi SDK một lần trong phiên, kể cả khi phản hồi thất bại; không tự gửi lại. Giới hạn một lượt gửi đang chạy trên mỗi tài khoản. SDK có thể đã gửi một phần văn bản/tệp trước khi báo lỗi, vì vậy thông báo lỗi yêu cầu kiểm tra Zalo trước khi gửi lại. Frontend chỉ xóa nội dung soạn sau khi nhận thành công.

API gửi trả thêm `attachmentIds` từ xác nhận của SDK. Frontend gắn bản xem trước của tệp PNG/JPEG/GIF/WebP vừa gửi với các ID này, nên ảnh vẫn hiển thị khi trình duyệt không tải được CDN. Chỉ tạo bản xem trước sau xác nhận gửi; không tự gửi lại tin. Bộ nhớ xem trước giới hạn 30 MB trong hội thoại đang mở, giải phóng khi rời hội thoại; không lưu ảnh xuống đĩa. Ảnh tải qua URL có nút **Tải lại ảnh** khi lỗi; lỗi tải không được coi là bằng chứng ảnh hết hạn.

Ảnh/tệp tối đa 10 MB và 2.000 ký tự mỗi lượt. File upload được ghi vào thư mục tạm riêng để SDK đọc kích thước ảnh và checksum, rồi xóa khi SDK hoàn tất hoặc báo lỗi. Link tệp/ảnh trong tin nhận chỉ cho phép HTTPS. Bộ test dùng adapter giả lập, không gửi tin đến Zalo thật.
