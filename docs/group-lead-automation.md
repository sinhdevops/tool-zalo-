# Trực nhóm — nhận lead

Trang `/automation` cấu hình tài khoản, nhóm theo dõi, UID người gửi và nhóm nhận số. Lưu cấu hình không tự bật quy tắc. Backend phải chạy và tài khoản phải kết nối; không cần mở sẵn hội thoại.

Với mỗi tin mới của đúng người gửi trong nhóm theo dõi, hệ thống tìm số di động Việt Nam trong nội dung. Nếu có số, hệ thống lưu hoặc cập nhật lead, chờ ngẫu nhiên 10–15 giây để ghép danh thiếp cùng số gửi liền kề, rồi thả ❤️ vào tin chữ. Sau đó hệ thống gửi nguyên nội dung tin nguồn sang nhóm nhận. UID danh thiếp được ưu tiên lấy từ tin nguồn; nếu chưa có, hệ thống dùng `findUser` tra trực tiếp bằng số. Khi tìm thấy UID, hệ thống gọi `sendCard` để gửi danh thiếp ngay sau tin nguồn. Hệ thống không gửi lời mời kết bạn và không nhắn riêng.

Một tin có nhiều số tạo hoặc cập nhật nhiều lead nhưng nội dung đầy đủ chỉ được gửi một lần; mỗi danh thiếp tìm thấy được gửi tiếp ngay sau đó. ID tin nguồn chống xử lý trùng. Tác vụ được ghi xuống SQLite trước khi gọi Zalo; nếu kết quả không rõ hoặc backend dừng giữa thao tác, lead chuyển sang **Cần kiểm tra** và hệ thống không tự thử lại.

Dữ liệu nằm trong `my-react-app/.data/automation.sqlite`, hoặc thư mục `ACCOUNT_DATA_DIR`. Trang `/leads` cho phép tìm kiếm, lọc, sửa thông tin và trạng thái chăm sóc. Ô **Đã chuyển tiếp** chỉ được tích sau khi Zalo xác nhận thành công.

## API nội bộ

| API | Mục đích |
| --- | --- |
| GET `/api/automation/state` | Cấu hình, kết nối và thống kê |
| GET `/api/automation/choices?accountId=...` | Danh sách nhóm của tài khoản |
| GET `/api/automation/choices?accountId=...&groupId=...` | Thành viên nhóm theo dõi |
| POST `/api/automation/rule` | Lưu `{accountId, groupId, senderId, targetGroupId}` |
| POST `/api/automation/enabled` | Bật hoặc tắt quy tắc |
| GET `/api/leads?search=...&stage=...&page=1` | Tìm và lọc lead |

Kiểm thử tự động dùng fixture SDK giả và không gửi dữ liệu đến tài khoản thật: `pnpm test`.

## Nhiều cấu hình nhận nhóm

Trang `/automation/group-lead` hiển thị danh sách cấu hình và nút **Tạo nhận nhóm mới**. Mỗi cấu hình có tài khoản, nhóm theo dõi, người gửi, nhóm nhận số và trạng thái bật/tắt riêng. Tắt một cấu hình chỉ hủy tác vụ chờ của cấu hình đó. Tắt cấu hình trước khi chỉnh sửa; lưu mới không tự bật.

`GET /api/automation/state` trả thêm `rules`, gồm trạng thái kết nối của từng cấu hình. `POST /api/automation/rule` nhận `id: null` để tạo mới hoặc `id` của cấu hình để sửa. `POST /api/automation/enabled` nhận `{id, enabled}`. Cấu hình cũ `group-leads` và dữ liệu cũ được giữ nguyên. Cấu hình mới tách lead và chống trùng theo từng cấu hình, kể cả khi cùng số điện thoại xuất hiện ở nhiều nguồn. Thống kê trên đầu trang là tổng của mọi cấu hình.
