# Bộ xử lý tư vấn — bản nháp

## Phạm vi đã có

`server/advisor/engine.ts` đọc tối đa 100 tin theo thời gian; gom lượt khách liên tiếp, xác định ý định và thông tin địa chỉ/gói, ưu tiên yêu cầu dừng hoặc nhân viên tiếp quản, chọn đúng một gói còn hiệu lực trước khi soạn nháp. Trả về lý do ngắn, trường còn thiếu, nguồn tin và phiên bản kiến thức để kiểm tra quyết định. Đây là bộ quy tắc với mẫu trả lời, chưa phải mô hình AI đã học toàn bộ lịch sử.

Không có lời gọi gửi Zalo. API đọc lịch sử tài khoản qua lớp kết nối hiện có. Nội dung của khách không thể sửa bảng giá, quy tắc hoặc kích hoạt gửi tiền. Các giá trong kiểm thử hoàn toàn là fixture.

## API sử dụng

POST `/api/advisor/draft`, header `Content-Type: application/json`, `X-Zalo-Tool: 1`:

```json
{"accountId":"99","threadId":"11","facts":{"address":"Q1, HCM","plan":"NETVT1","salutation":"anh/chị"}}
```

API lấy tin nhắn thật từ hội thoại riêng đang lưu trong kết nối. Không nhận lịch sử giả hoặc bảng giá do client gửi. Lịch sử chưa tải trả 409. Kết quả gồm `action` (draft/handoff/wait/skip), `reply`, `intent`, `missing`, `reasons`, `region`, `offerId`, `sourceMessageIds`, `knowledgeVersion`, `id` và `connection`. `id` là dấu vân tay đầu vào, không phải xác nhận đã gửi hoặc sổ chống trùng bền vững.

Mọi tin tự gửi hiện được xem là nhân viên; nếu nhân viên vừa nhắn trong 30 phút, tạm dừng. Khi triển khai bot gửi thật phải ghi riêng nguồn bot/operator và trạng thái đã xử lý vào kho bền vững. Chưa có cơ chế gửi/nhận tự động của advisor hoặc nút duyệt trên giao diện.

## Bảng giá

Đặt biến môi trường `ADVISOR_KNOWLEDGE_FILE` trỏ đến JSON theo mẫu `shared/data/advisor-knowledge.example.json`. Không đặt biến thì chế độ chưa cấu hình: không báo tiền. Cấu hình được kiểm tra bằng Zod khi đọc; lỗi không được biến thành giá mặc định.

Mỗi offer có: `id`, `plan`, `region` (inner/outer), `monthlyPrice`, `installationFee`, `devices`, `minMbps`, `validFrom`, `validUntil` (ISO có múi giờ), `approved`. Chỉ báo giá khi có đúng một offer được duyệt, đúng vùng, đúng gói và còn hiệu lực. `regionRulesApproved` chỉ bật khi đã xác nhận danh mục địa bàn. `confirmedOuterProvinces` là danh sách do người vận hành xác nhận; mặc định mới có Huế theo yêu cầu.

Không đủ địa chỉ, chỉ có phường mới chưa ánh xạ, Thủ Đức không rõ khu vực, hoặc địa chỉ mâu thuẫn: hỏi lại. Tên quận trong tên đường không được tự coi là quận. Chưa hỗ trợ đầy đủ tất cả cách viết địa chỉ hoặc địa giới mới.

## Tiếp tục phát triển

Cần bổ sung: bảng giá thực tế đã duyệt; mẫu tư vấn được chọn từ lịch sử; bộ phân tích ngôn ngữ/mô hình AI có đầu ra cấu trúc để xử lý biến thể rộng hơn; trang soạn nháp/duyệt; lưu trạng thái hội thoại và nhật ký gửi. Chưa gửi lịch sử khách sang dịch vụ AI bên ngoài. Bộ quy tắc hiện tại chỉ xử lý những ý định đã định nghĩa, còn lại chuyển người xem thay vì bịa câu trả lời.

Kiểm thử: `node --test tests/server/advisor.test.ts`; toàn bộ dự án: `npm test`, `npm run build`, `npm run lint`.

## Ảnh báo giá khách cung cấp

`server/advisor/price-sheets.ts` ghi bảng giá đọc trực tiếp từ bốn ảnh trong `public/images`. Tên file đã được sửa và kiểm tra lại: Internet thường là `noi-thanh.jpg`, có TV là `noi-thanh-tivi.jpg`. Mapping chọn ảnh đã đồng bộ với tên mới.

`facts.service` chọn `internet` hoặc `internet-tv`; offer cũng có service (mặc định internet để tương thích cấu hình cũ). Kết quả draft có `priceSheet` khi vùng đã xác minh, dịch vụ được chọn rõ và mức giá gói khớp ảnh. Chưa rõ dịch vụ/vùng hoặc giá đã thay đổi thì không đính ảnh. Đường dẫn `/images/...` thuộc frontend; API mới trả gợi ý, chưa tải ảnh lên Zalo. Các ảnh không tự bổ sung phí lắp hay hạn hiệu lực cho cấu hình.

## Quy tắc chọn gói do người vận hành xác nhận

Nhà cấp 4/phòng trọ/1 tầng: NETVT1; yêu cầu mạng mạnh: NETVT2. Nhà 2/3/4 tầng lần lượt MESHVT1/MESHVT2/MESHVT3 với tổng 2/3/4 điểm phát, tính cả modem chính. Mỗi tầng một thiết bị theo cách tư vấn của người dùng, không phải cam kết phủ sóng trong mọi công trình. Không dùng diện tích để tự nâng gói. Trên 4 tầng cần người vận hành kiểm tra thiết bị bổ sung; gác/lửng/tum hoặc chưa rõ số tầng thì hỏi lại. Một trệt hai lầu là tổng 3 tầng.

`recommendation` là đề xuất độc lập, không ghi thành `facts.plan` mà khách đã chọn. Bảng giá vẫn được kiểm tra theo vùng, dịch vụ và hiệu lực. Quy tắc này được ưu tiên hơn nội dung tư vấn tham khảo trong tài liệu đính kèm.

## Phí hòa mạng — người vận hành xác nhận 22/09/2026

Mặc định 300.000đ, không tự miễn/giảm khi đóng trước. Khách khó chốt yêu cầu giảm có thể được xét ngoại lệ tối đa 100.000đ, còn ít nhất 200.000đ, chỉ khi kỳ đóng tối thiểu 6 tháng. Bot không tự hứa mức giảm tối đa; trường hợp đòi giảm và đủ kỳ đóng được chuyển nhân viên cân nhắc. Đóng từng tháng không được giảm. Khi chưa rõ kỳ đóng thì hỏi lại. Quy tắc hiện hành ghi đè phí cũ trong offer khi soạn câu báo phí.

## Mở đầu hội thoại

Màn hình test gửi `outreach.phase` (new/waiting/active) và event (setup/reply/heart/friend-accepted). New chỉ trả 2 tin chào. Waiting + setup không gửi thêm; phản hồi của khách chuyển sang 5 mục: 2 ảnh theo vùng rồi 3 tin nguyên văn đã cấu hình. Active không lặp bộ mở đầu. Nút thả tim/kết bạn trên màn hình là giả lập. Trạng thái đang lưu trong bộ nhớ trang; tải lại bắt đầu cuộc test mới. Chưa nối sự kiện Zalo thật và chưa có sổ gửi bền vững; cần hoàn thiện trước khi bật gửi tự động.
