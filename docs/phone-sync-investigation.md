# Điều tra đồng bộ điện thoại — 2026-09-03

## Kết luận và trạng thái

Người dùng đã thử và không nhận được thông báo trên điện thoại. Tích hợp dựa trên `@softtynet/zca-js@2.1.19` không được xác minh thực tế và không khớp luồng Sync V2 trong Zalo Web đang phát hành. Đã ngừng gửi frame đó, bỏ bộ đếm chờ 3 phút và trả HTTP 501 cho POST đồng bộ. Chưa triển khai được đồng bộ điện thoại thực tế.

Các bài test trước đây chỉ kiểm tra frame gửi đến adapter giả lập; không chứng minh Zalo chấp nhận yêu cầu hay điện thoại nhận được thông báo.

## Nguồn đã kiểm tra

Chỉ đọc mã JavaScript công khai; không trích xuất khóa/cookie trình duyệt và không thực thi bundle tải về.

- [Hàm của bản fork](https://cdn.jsdelivr.net/npm/@softtynet/zca-js@2.1.19/dist/apis/requestSyncFromPhone.js): gửi `cmd=510`, `subCmd=0`, `act=sync_request`; trả success ngay sau lời gọi gửi.
- [Bundle Zalo Web](https://zalo-chat-static.zadn.vn/v1/lazy/1.7a40934bc92f49b7036d.js): `SYNC_MESSAGE.REQUEST=590`, `ACK_DELETE_SYNC_SESSION=591`, `REQUEST_MOBILE_WAKE_UP=592`. Có HTTP endpoint `/api/transfer-sync-v2/request-sync` và các endpoint transfer cũ; chưa xác minh khả năng dùng endpoint cũ với phiên hiện tại.
- [Luồng khởi động](https://zalo-chat-static.zadn.vn/v1/lazy/web-startup.2cba5af4a06a77d5dd0a.js): chờ phản hồi request, trạng thái điện thoại, xử lý lỗi/timeout và cấp identity key pair cho worker.
- [Worker đồng bộ](https://zalo-chat-static.zadn.vn/v1/sync-v2-worker.fa66597fb3affab4031b.js): payload có syncId, syncType, ek, ik, toDevice, tempKey, deviceName, req, ver, ussidx. req chứa loại dữ liệu, priority, queries, batchSize. Phản hồi chia batch; dùng libzproto WASM cho mã hóa phiên/metadata, giải mã, chuyển đổi ID và nhập dữ liệu.
- SDK cài tại `node_modules/zalo-api-final/dist/apis/listen.js`: `old_messages` xử lý 510/511 với subCmd 1. Không có API công khai xử lý toàn bộ Sync V2.

## Phần còn thiếu để bật lại

1. Xác minh quản lý identity/ephemeral key và thiết bị cho phiên backend; không thay khóa phiên trình duyệt của người dùng.
2. Triển khai request/response Sync V2 có correlation ID, timeout và trạng thái xác nhận thật từ điện thoại. Không thay số lệnh trên payload cũ rồi coi đó là giao thức hợp lệ.
3. Tải và giải mã batch, chuyển đổi ID, nhập tin nhắn, kiểm soát tài nguyên và hủy phiên. Socket write không đồng nghĩa đồng bộ hoàn tất.
4. Kiểm thử với điện thoại: thông báo xuất hiện, xác nhận/từ chối/hết hạn, nhận được tin mẫu và đối chiếu nội dung, không trùng khi thử lại. Sau đó mới bật lại nút gửi.

Đồng bộ trên Zalo Web không có nghĩa là đã đồng bộ vào công cụ: hai bên có phiên và kho dữ liệu riêng.
