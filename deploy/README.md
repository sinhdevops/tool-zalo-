# Backend Docker trên Ubuntu, frontend Vercel

Chạy các lệnh tại thư mục chứa `compose.yaml`. Ubuntu chỉ cần Docker Engine và Compose v2; không cần Node hoặc pnpm trên máy chủ. Không chạy Railway cùng backend này.

## Khởi động

```sh
cp deploy/.env.example .env
# Sửa APP_ALLOWED_HOSTS, APP_ALLOWED_ORIGINS, BACKEND_PORT trong .env.
docker compose config --quiet
docker compose build --pull backend
docker compose up -d --wait --wait-timeout 300
docker compose ps
docker compose logs --tail=100 backend
curl --fail http://127.0.0.1:3001/api/health
```

Container dùng Node 24 Debian, pnpm cố định và frozen lockfile. Chỉ backend/shared được copy vào image; `.data`, `.env`, Git và node_modules Windows không vào build context. Runtime chạy UID 1000, filesystem chỉ đọc, `/tmp` dùng cho file gửi tạm, `/data` là named volume bền vững. Node image hiện cố định dòng 24 nhưng tag có thể được cập nhật bản vá; muốn tái tạo đúng base image, truyền `--build-arg NODE_IMAGE=node:24-bookworm-slim@sha256:<digest-đã-xác-minh>` lúc build và giữ tag image theo từng bản phát hành.

Port host mặc định chỉ mở ở `127.0.0.1:3001`. Nếu trùng dịch vụ khác, đổi BACKEND_PORT và upstream Nginx cùng giá trị. Không dùng host networking hoặc container_name cố định. COMPOSE_PROJECT_NAME tách network/volume với stack khác; giữ tên này ổn định khi nâng cấp để tiếp tục sử dụng dữ liệu cũ. Chỉ chạy một backend cho mỗi kho phiên Zalo; không scale replicas vì có SQLite và listener/automation giữ trạng thái.

## HTTPS và Vercel

Dùng reverse proxy HTTPS đang có trên Ubuntu, tham khảo `nginx.conf.example`. Không tự chiếm cổng 80/443 bằng một proxy container mới. Nếu proxy cũng chạy Docker, cấu hình network chung với backend và dùng upstream `backend:3001`; localhost bên trong proxy container không phải host Ubuntu.

Trỏ domain API về Ubuntu và cấp chứng chỉ HTTPS trước khi bật mẫu Nginx. Kiểm tra `nginx -t` trước khi reload. APP_ALLOWED_HOSTS phải khớp Host proxy chuyển tiếp; APP_ALLOWED_ORIGINS là origin frontend chính xác, không có dấu `/` cuối. Nhiều domain phân cách bằng dấu phẩy.

Trong `vercel.json`, thêm rewrite sau **trước** SPA fallback, thay domain thật:

```json
{ "source": "/api/:path*", "destination": "https://api.example.com/api/:path*" }
```

Frontend Vercel vẫn build `pnpm build`, output `dist`. Chưa đổi rewrite thực tế vì chưa có domain backend. Kiểm tra gửi file và request chậm xuyên qua Vercel khi triển khai; timeout của proxy không tăng giới hạn của Vercel. API không cache. Ứng dụng hiện không có đăng nhập theo yêu cầu; allowlist Host/Origin không phải xác thực, nên domain public cho phép người truy cập sử dụng API.

## Dữ liệu và sao lưu

Volume được khởi tạo quyền ghi cho user node. Muốn chuyển `.data` từ máy cũ, dừng backend cũ trước, copy **toàn bộ** thư mục (kể cả session.key, SQLite và các file WAL) vào `/data` khi container mới chưa chạy; đặt owner 1000:1000. Không chạy đồng thời hai backend với cùng tài khoản/automation. Không đưa dữ liệu vào Git/image.

Sao lưu nhất quán bằng cách dừng backend trong lúc chụp kho dữ liệu:

```sh
mkdir -p backups
chmod 700 backups
docker compose stop backend
docker compose run --rm --no-deps -T backend tar -C /data -czf - . > backups/data.tar.gz
docker compose start backend
chmod 600 backups/data.tar.gz
```

Dùng tên backup mới mỗi lần để không ghi đè bản cũ. Giữ backup ngoài server. Phục hồi khi backend đã dừng vào volume trống, giữ nguyên khóa đi kèm dữ liệu; không giải nén đè lên kho đang chạy. `docker compose down` giữ volume, **không dùng `down -v`** nếu cần giữ phiên.

## Cập nhật và xử lý sự cố

Ghi lại IMAGE_TAG hiện tại, chọn tag mới trong `.env`, build rồi `docker compose up -d --wait --wait-timeout 300`. Volume giữ nguyên. Để rollback code, đặt IMAGE_TAG về image cũ còn lưu rồi chạy `docker compose up -d --no-build --wait`; nếu bản mới đổi schema dữ liệu thì cần kế hoạch phục hồi backup tương thích.

`restart: unless-stopped` khởi động lại khi process chết và sau khi Docker khởi động lại, trừ container đã chủ động stop. Healthcheck chỉ kiểm tra HTTP còn sống, không đảm bảo kết nối Zalo; trạng thái unhealthy không tự restart container. Kiểm tra `docker compose logs --tail=100 backend` và trạng thái tài khoản khi có sự cố. Log xoay vòng để giới hạn dung lượng. Restart/deploy có gián đoạn listener, không bảo đảm xử lý tin trong thời gian backend dừng.
