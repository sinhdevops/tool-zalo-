# Pages và routing

Mỗi tính năng có một folder và một `index.tsx` làm entry. Trang tài khoản đã tích hợp đăng nhập QR và quản lý phiên qua backend TypeScript. Trang tin nhắn đã có chọn tài khoản, cá nhân/nhóm, tìm kiếm và gửi/nhận tin, ảnh, tệp. Các trang nghiệp vụ khác vẫn là khung giao diện.

| Folder | Route | Chức năng |
| --- | --- | --- |
| `dashboard` | `/dashboard` | Tổng quan, liên kết tới các tính năng |
| `accounts` | `/accounts` | Tài khoản, đăng nhập QR, phiên kết nối |
| `messages` | `/messages` | Hội thoại, gửi tin, tệp đính kèm |
| `friends` | `/friends` | Danh bạ, tìm kiếm, lời mời kết bạn |
| `groups` | `/groups` | Nhóm, thành viên, quyền và lời mời |
| `polls` | `/polls` | Bình chọn trong nhóm |
| `notes` | `/notes` | Ghi chú, bảng tin nhóm |
| `reminders` | `/reminders` | Lịch nhắc và phản hồi |
| `automation` | `/automation` | Trả lời tự động, sự kiện, nhật ký xử lý |
| `settings` | `/settings` | Thiết lập ứng dụng và kết nối |
| `components` | `/components` | Demo component common và validation hoạt động |
| `not-found` | `*` | Trang 404 có liên kết về tổng quan |

`/` tự chuyển tới `/dashboard` bằng replace để không thêm bước dư vào lịch sử Back.

## Tổ chức code

- `App.tsx`: BrowserRouter duy nhất của ứng dụng.
- `routes/paths.ts`: tập trung các đường dẫn, export `routePaths`, `PageId`, `AppPath`.
- `routes/config.ts`: khai báo đầy đủ mỗi PageId với path tương ứng, title, description, nhóm menu, icon và lazy component. TypeScript báo lỗi nếu thiếu mapping hoặc map nhầm path.
- `routes/AppRouter.tsx`: đăng ký route trong AppLayout, Suspense khi tải page và catch-all 404.
- `layouts/AppLayout.tsx`: quản lý trạng thái sidebar, tiêu đề trình duyệt và Outlet. Desktop thu gọn còn icon, lưu lựa chọn vào localStorage; mobile có menu riêng.
- `layouts/components/AppHeader.tsx`, `AppSidebar.tsx`: header đơn giản và điều hướng dùng chung.
- `layouts/components/HeaderSearch.tsx`: tìm trang tính năng theo tiêu đề/mô tả, hỗ trợ không dấu; Enter mở kết quả đầu, phím xuống chuyển tới kết quả và Escape đóng danh sách.
- `layouts/FeaturePage.tsx`: khung hiển thị các chức năng chưa triển khai.
- `components/common`, `components/validation`: component dùng chung toàn app.

Khi triển khai một tính năng, đặt component, hook và type riêng trong chính folder của tính năng, ví dụ `pages/accounts/components`, `pages/accounts/hooks`, `pages/accounts/types.ts`. Chỉ tạo các file/folder này khi có code tương ứng. Component dùng chung giữa các tính năng đặt ở `components`.

Để thêm trang: tạo `pages/<feature>/index.tsx`, thêm đường dẫn vào `routePaths`, rồi bổ sung mục tương ứng trong `routeConfig`. Router, menu và danh sách lối tắt trên dashboard sẽ lấy cùng mapping. Dùng `Link`/`NavLink` và `routePaths` cho điều hướng nội bộ.

Đăng nhập Zalo, cookie và khôi phục phiên chạy trong `server/accounts`; page tài khoản gọi API backend qua Vite proxy. Chưa có auth guard cho người dùng công cụ: API hiện chỉ lắng nghe trên loopback cho ứng dụng chạy tại máy. Đăng nhập tài khoản Zalo không phải đăng nhập quản trị công cụ.

Dashboard có thẻ chỉ số, khu vực hoạt động với dropdown khoảng thời gian, hướng dẫn thiết lập, danh sách tài khoản và lối tắt. Các chỉ số hiện dấu `—` và trạng thái chưa có dữ liệu; không sử dụng số liệu giả. Giao diện dashboard ở `pages/dashboard/dashboard.css`, các thẻ chỉ số ở `pages/dashboard/components/MetricCard.tsx`.
