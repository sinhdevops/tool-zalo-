# Phân vùng giá tư vấn — nghiên cứu ngày 17/09/2026

Dữ liệu: `shared/data/pricing-regions.json`.

Nguồn chính thức Viettel xác nhận có hai bảng giá, nhưng chưa tìm được danh mục ranh giới giá chính thức đầy đủ. Danh sách quận/huyện trong JSON được đối chiếu từ các trang bán hàng, chưa coi là chính sách chính thức hiện hành. Chưa nhập mức tiền hoặc nối dữ liệu này vào gửi tin.

Nguồn:
- https://www.viettel.vn/tin-tuc/chi-tiet/lap-dat-internet-truyen-hinh-ha-noi-tai-viettel-thiet-bi-wifi-6-hien-dai-gia-uu-dai/15827840
- https://internet-viettel.com/noi-thanh/
- https://viettelhcm.vn/
- https://vieteltelecom.vn/lap-dat-internet-viettel-tp-hcm/

## Cách dùng dự kiến

Tách riêng địa chỉ lắp đặt → xác định tỉnh/thành → đối chiếu địa bàn cũ hoặc ánh xạ đã kiểm chứng → chọn mã bảng giá. Giá và ngày hiệu lực là cấu hình riêng.

Theo quy tắc người dùng: Huế/Thừa Thiên Huế dùng bảng ngoại thành. Không hiểu điều này là Huế thuộc ngoại thành về hành chính.

Ví dụ mong đợi:
- `Phường Hương Thủy - Thừa Thiên Huế`: ngoại thành theo quy tắc người dùng.
- `Q1, HCM`: nội thành theo danh mục nghiên cứu.
- `Q12, HCM`: ngoại thành theo danh mục nghiên cứu.
- `Hóc Môn, HCM`: ngoại thành theo danh mục nghiên cứu.
- `Cầu Giấy, Hà Nội`: nội thành theo danh mục nghiên cứu.
- `Long Biên, Hà Nội`: nguồn bán hàng xếp ngoại thành về giá, cần xác nhận chính sách áp dụng.
- `TP Thủ Đức`: chưa rõ; cần địa bàn cụ thể vì Quận 2 cũ và Quận 9 cũ thuộc hai mức khác nhau trong danh mục này.
- Chỉ có tên đường, chỉ có tên thành phố, tên phường mới chưa ánh xạ hoặc địa chỉ mâu thuẫn: hỏi lại, không tự chọn bảng giá.

Chưa có bảng ánh xạ đầy đủ phường/xã mới sang vùng giá. Không suy luận mọi phường của Hà Nội/TP.HCM là giá nội thành, không khớp tên quận cũ vào tên đường hoặc tên phường trùng tên.
