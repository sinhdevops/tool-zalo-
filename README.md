# Zalo Tool — React + TypeScript

Ứng dụng dùng React 19, Vite, TypeScript strict và React Hook Form. Mã nguồn ứng dụng dùng `.ts`/`.tsx`; cấu hình Vite và ESLint cũng dùng TypeScript.

## Chạy dự án

Yêu cầu Node.js 24 trở lên.

```sh
pnpm install
pnpm dev
```

`pnpm dev` chạy đồng thời Vite tại `http://127.0.0.1:5173` và API TypeScript tại `http://127.0.0.1:3001`. Vite chuyển tiếp `/api` tới backend. Nếu chạy riêng, dùng `pnpm dev:client` và `pnpm dev:server` trong hai terminal.

Trang `/accounts` đã có đăng nhập QR thật bằng `zalo-api-final`: bấm **Thêm tài khoản**, quét và xác nhận trên Zalo điện thoại. Tài khoản chỉ xuất hiện trong bảng khi đăng nhập thành công và phiên đã được lưu. Bảng hỗ trợ tìm kiếm, lọc, phân trang, xóa khỏi công cụ; đăng nhập lại cùng UID cập nhật phiên hiện có.

Chi tiết API và lưu phiên: [server/README.md](server/README.md).

Trang `/messages` có dropdown chọn tài khoản, tab Cá nhân/Nhóm, tìm hội thoại không dấu, tìm người dùng theo số điện thoại và khung chat. Tin nhắn nhận qua listener Zalo; giao diện đồng bộ mỗi 2 giây. Gửi văn bản (tối đa 2.000 ký tự), emoji hoặc một ảnh/tệp tối đa 10 MB mỗi lượt. Enter gửi, Shift + Enter xuống dòng. Dữ liệu tin nhắn hiện được giữ trong bộ nhớ từng phiên; lịch sử cũ tải theo phần Zalo cung cấp, chưa phải toàn bộ lịch sử Zalo.

## Kiểm tra và build

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm preview
```

`typecheck` kiểm tra ứng dụng, backend, cấu hình và các kiểm tra kiểu trong `tests/types`. `test` kiểm tra vòng đời đăng nhập, hủy, lưu phiên, xóa và API bằng gateway kiểm thử; không đăng nhập tài khoản thật. `build` bắt buộc kiểm tra TypeScript trước khi tạo `dist`. JavaScript trong `dist` là đầu ra được biên dịch cho trình duyệt. Khi chạy `preview`, cần chạy thêm `pnpm start:server` để tính năng tài khoản hoạt động.

## Cấu trúc

- `src/main.tsx`: khởi tạo React.
- `src/App.tsx`: khởi tạo BrowserRouter.
- `src/routes/paths.ts`: tên và đường dẫn route có kiểu TypeScript.
- `src/routes/config.ts`: mapping trang, lazy import và thông tin menu.
- `src/routes/AppRouter.tsx`: đăng ký route, chuyển hướng trang chủ và 404.
- `src/layouts`: layout menu chung và khung trang tính năng.
- `src/pages`: mỗi tính năng có folder riêng; demo form tại `pages/components`.
- `shared/accounts.ts`: kiểu dữ liệu tài khoản và trạng thái đăng nhập dùng chung frontend/backend.
- `server/accounts`: tích hợp Zalo, quản lý vòng đời phiên và lưu trữ mã hóa.
- `server/messages`: listener, lịch sử, danh bạ/nhóm, gửi tin và API chat.
- `tests/ui/chat-preview.ts`: môi trường giao diện giả lập riêng, chạy bằng `node tests/ui/chat-preview.ts` tại cổng 5175; không gọi Zalo và không đọc dữ liệu tài khoản thật.
- `server/app.ts`: HTTP API nội bộ; `server/index.ts`: khởi động dịch vụ.
- `src/components/common`: Input, Select, Textarea, Dropdown, FormField, Modal và các kiểu public.
- `src/components/validation`: các component RHF và hook `useValidationField`.
- `tests/types/form-controls.test.ts`: kiểm tra hợp đồng kiểu của component khi biên dịch.
- `tsconfig.app.json`: cấu hình strict cho ứng dụng, có kiểm tra truy cập mảng có thể trả `undefined`.
- `tsconfig.node.json`: cấu hình cho `vite.config.ts`, `eslint.config.ts`.

Các trường chọn dùng dropdown tùy biến. Xem [tài liệu component](src/components/README.md) để sử dụng `control`, `FormProvider`, rules và generic TypeScript.

TypeScript được giữ ở dòng 6.0 để tương thích với `typescript-eslint` đã cài. `jiti` giúp ESLint đọc cấu hình TypeScript.

Xem [danh sách trang và route](src/pages/README.md). Khi deploy BrowserRouter, cấu hình hosting trả `index.html` cho các đường dẫn giao diện để tải lại/deep link hoạt động; giữ nguyên xử lý riêng cho asset và API. Vite dev/preview đã có SPA fallback.

## Deploy Vercel + Railway

Frontend được build trên Vercel; backend Node chạy liên tục trên Railway. Vercel chuyển tiếp `/api/*` tới Railway, vì vậy trình duyệt chỉ làm việc với một origin.

Railway dùng `railway.toml`. Tạo một Web Service từ repository, tạo public domain, gắn Volume tại `/data`, rồi đặt:

```env
ACCOUNT_DATA_DIR=/data
NODE_ENV=production
APP_ALLOWED_ORIGINS=https://<tên-project>.vercel.app
```

`PORT` và `RAILWAY_PUBLIC_DOMAIN` do Railway cấp. Không đặt bí mật trong repository. Volume phải chứa trọn `/data`, vì `accounts.enc`, `session.key` và các tệp SQLite cần tồn tại qua lần deploy.

Sau khi Railway cấp domain, thêm rewrite API vào đầu mảng `rewrites` trong `vercel.json`:

```json
{ "source": "/api/:path*", "destination": "https://<railway-domain>/api/:path*" }
```

Vercel dùng `pnpm build` và publish thư mục `dist`.
