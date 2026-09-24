# Ngữ cảnh tư vấn rút ra từ dữ liệu hội thoại

Nguồn phân tích: toàn bộ kho chat đang có trong `.data/chat.sqlite`, giải mã bằng chính `chat.key` của ứng dụng. Lần quét ngày 2026-09-22 đọc được 462 cuộc hội thoại, 6.662 tin nhắn, 437 hội thoại cá nhân và ghép được 815 lượt khách → nhân viên để học ngữ cảnh tư vấn.

Mục tiêu của dữ liệu lịch sử là học cách khách hỏi, cách nối ngữ cảnh và văn phong trả lời. Giá, vùng cước và chính sách hiện hành luôn lấy từ bảng giá/rule hiện tại. Không dùng một con số cũ trong lịch sử chat để ghi đè bảng giá mới.

| Ngữ cảnh | Biến thể thường gặp trong chat | Hành vi hệ thống |
| --- | --- | --- |
| Chào hỏi / vừa kết bạn | alo, em ơi, bạn vừa kết bạn | Chào ngắn, xác định nhu cầu/khu vực nếu chưa có luồng mở đầu |
| Phí hòa mạng | phí lắp bao nhiêu, phí ban đầu, 300k là gì | Trả lời trực tiếp 300k, giải thích đây là phí hòa mạng/lắp mới |
| Phí có gồm cước tháng không | 300k có gồm tháng đầu chưa, tháng đầu cộng thế nào | Tách rõ phí hòa mạng và tiền cước |
| Thiết bị/vật tư | có dây mạng không, modem có mất tiền không, vật tư tính phí không | Thiết bị, dây và công lắp được hỗ trợ miễn phí; phí hòa mạng vẫn 300k |
| Thời gian thi công | lắp lâu không, mất bao nhiêu phút | Trả lời khoảng 30 phút; không tự hứa ngày/giờ kỹ thuật |
| Lịch kỹ thuật | hôm nay lắp được không, mai qua được không | Chuyển kiểm tra lịch, không tự xác nhận lịch chưa có dữ liệu |
| Kỹ thuật liên hệ | kỹ thuật có gọi trước không | Báo kỹ thuật sẽ gọi trước, thường khoảng 30 phút |
| Hạ tầng | có hạ tầng không, có kéo được không, hết cổng, xa trụ | Yêu cầu địa chỉ + định vị nếu thiếu; có đủ thì chuyển kiểm tra hạ tầng |
| Đổi từ FPT/VNPT | đang dùng FPT/VNPT muốn đổi Viettel | Khuyên giữ mạng cũ đến khi Viettel lắp xong rồi mới hủy để tránh gián đoạn |
| Đang có Viettel | nhà đang dùng Viettel, muốn lắp thêm một đường | Phải kiểm tra hệ thống trước khi xác nhận lắp thêm/đổi đường |
| Mạng đang lỗi | mất mạng, không vào Internet, mạng yếu/lag | Hướng khách gọi 18008119 để kỹ thuật kiểm tra đường truyền |
| Đổi tên/mật khẩu Wi‑Fi | đổi tên wifi, quên/đổi mật khẩu | Hướng khách gọi 18008119 |
| Nhà cấp 4 / nhà thường / trọ | nhà cấp 4, nhà thường, phòng trọ, thông thường thôi | Mặc định NETVT1; nếu khách nhấn mạnh cần mạng mạnh thì NETVT2 |
| Nhà nhiều tầng | 2 tầng, 3 tầng, 1 trệt 2 lầu | Mỗi tầng một thiết bị; 2 tầng → MESHVT1, 3 tầng → MESHVT2, 4 tầng → MESHVT3 |
| Câu trả lời rút gọn theo ngữ cảnh | “thông thường”, “2”, “3 tầng”, “trọ” sau câu hỏi loại nhà | Hiểu theo câu bot vừa hỏi, không bắt khách lặp lại nguyên câu |
| Nhu cầu mạnh | game, livestream, tải tác vụ, cần mạng mạnh | Ưu tiên NETVT2 với nhà 1 tầng; nhà nhiều tầng vẫn theo nhánh Mesh phù hợp số tầng |
| Số thiết bị Mesh | MESHVT2 có mấy modem, mấy cục | MESHVT1 = 2 thiết bị; MESHVT2 = 3; MESHVT3 = 4, gồm 1 chính + Mesh phụ |
| NETVT2 so với MESHVT2 | tốc độ có ngang nhau không, khác gì | Giải thích cùng nhóm mạng mạnh; Mesh có thiết bị phụ để tăng vùng phủ |
| 300Mbps / nhóm tốc độ cao | 300Mbps là sao, không giới hạn là sao | NETVT1 là 300Mbps; nhu cầu mạnh hơn chuyển nhóm NETVT2 |
| Chọn gói | lấy NETVT1, chốt gói này | Sau khi có gói, hỏi kỳ đóng 6 tháng hay 1 năm tặng 1 tháng |
| Đóng từng tháng | đóng hàng tháng được không | NETVT cho phép từng tháng; Mesh tối thiểu 6 tháng |
| Đóng 6 tháng | lấy 6 tháng | Ghi nhận 6 tháng, không tự thêm tháng tặng |
| Đóng 1 năm | lấy 1 năm, 12 tháng | Ghi nhận 12 tháng và 1 tháng tặng |
| Gia hạn | hết kỳ cước, gia hạn thế nào | Khi có tin nhắn kỳ cước thì liên hệ gia hạn |
| Truyền hình ban đầu | có TV không, có đầu thu không | Bắt đầu bằng +40k/tháng có đầu box |
| TV chê đắt | truyền hình đắt quá | Hỏi TV thường hay Smart TV |
| Smart TV | TV smart | Có thể dùng app +20k/tháng, tối đa 3 thiết bị |
| TV thường | TV thường | Dùng gói +40k/tháng có đầu box |
| Camera tặng | có tặng cam không | Đóng tối thiểu 6 tháng; camera free lắp đặt; phí tháng theo gói hiện hành |
| Camera + tổng cước | NETVT1 + cam bao nhiêu | Cộng đúng phí camera vào giá Internet của đúng vùng |
| Địa chỉ | ở Bình Thạnh, Huế, Đà Nẵng, Q1... | Match bảng vùng; chỉ hỏi thêm khi thực sự không đủ dữ liệu |
| Nội/ngoại thành | khu vực nào dùng bảng nào | Chỉ match whitelist nội thành hiện hành; không match thì dùng ngoại thành theo rule đã cấu hình |
| Định vị | gửi location, định vị nhà | Ghi nhận vị trí nhà cần lắp trong checklist chốt |
| Số điện thoại | số em là..., liên hệ số này | Ghi nhận số liên hệ trong checklist chốt |
| CCCD | gửi CCCD sau được không, cần mấy mặt | Cần đủ 2 mặt CCCD trước khi hoàn tất hồ sơ |
| Hợp đồng | hợp đồng online không | Hợp đồng điện tử; câu hỏi tra mã/hợp đồng cụ thể phải kiểm tra hệ thống |
| Chốt hồ sơ | chốt, đăng ký, lấy gói | Thu đủ: gói, kỳ đóng, địa chỉ rõ, SĐT, định vị, CCCD trước + sau |
| Thanh toán | thanh toán khi nào, hóa đơn đâu | Các câu cần đối soát giao dịch/hóa đơn thật phải chuyển kiểm tra, không tự xác nhận đã nhận tiền |
| Khách hủy/không muốn nhận tin | hủy, đừng nhắn nữa | Dừng luồng, không tiếp tục chốt |
| Khiếu nại/ngoại lệ | sai hợp đồng, hủy camera, tình huống bất thường | Chuyển người xử lý, không tự bịa nghiệp vụ |

## Nguyên tắc ưu tiên

1. Chính sách và bảng giá hiện tại do người vận hành cấu hình luôn cao hơn dữ liệu lịch sử.
2. Lịch sử chat chỉ cung cấp biến thể ngôn ngữ, trình tự hỏi đáp và phong cách nói.
3. Không tự xác nhận lịch kỹ thuật, hạ tầng, thanh toán, hóa đơn hay trạng thái hợp đồng nếu chưa có dữ liệu hệ thống.
4. Khi khách trả lời ngắn, phải đọc câu hỏi ngay trước đó để hiểu ngữ cảnh thay vì bắt khách nói lại đầy đủ.
5. Mỗi lượt chỉ hỏi thông tin còn thiếu tiếp theo; không lặp lại câu khách đã trả lời.
