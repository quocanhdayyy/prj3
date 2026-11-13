# Tài liệu backend

| Bạn cần làm gì? | Đọc ở đâu? |
|---|---|
| Kết nối frontend, đăng nhập, gọi API, tính và tìm Matching | [API backend](api/README.md) |
| Xem database và quan hệ giữa các bảng | [ERD](erd.md) |
| Hiểu công thức và quyết định Matching hiện có trong repo | [Đặc tả Matching](matching-engine-spec.md) |
| Xem báo cáo V3 đã thống nhất | [Matching Engine V3](Matching_Engine_V3.docx) |
| Xem tiến độ triển khai V3 và độ phủ đầu vào | [Giai đoạn 1 V3](data/README.md#v3-stage-1) |
| Xem phạm vi 5 giải, nguồn, nhập dữ liệu và cách ước tính | [Dữ liệu cầu thủ](data/README.md) |
| Thử F/S/R và tìm hiểu DEMO | [Hướng dẫn thử API](testing/README.md) |

Trong mỗi tài liệu có mục lục để đi thẳng vào phần cần dùng. Luồng FE: đăng nhập → tạo nhu cầu CLB → tìm/chấm ứng viên → xem điểm và cảnh báo → lưu shortlist khi người dùng chọn. Tài liệu API chưa phải bộ Swagger/OpenAPI hoàn chỉnh cho mọi CRUD; đối chiếu `src/routes/` và controller nếu chưa thấy hợp đồng request/response đầy đủ.

## Lịch sử và báo cáo

- [Kiểm tra, dọn mẫu và bổ sung dữ liệu ngày 21/10/2026](archive/data-history-2026-10-21.md).
- [Khảo sát nguồn cũ](archive/player-stats-source-research.md).
- `archive/reports/`: JSON từng lần nhập/chuyển phạm vi, không phải số lượng database trực tiếp hôm nay.

Dữ liệu DEMO không phải dữ liệu thật. Manifest cũ trong `testing/matching-demo-data.json` đã được đánh dấu xóa. Ước tính thống kê nằm riêng và Matching chưa tự sử dụng chúng.
