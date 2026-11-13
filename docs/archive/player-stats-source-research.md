# Khảo sát tiếp nguồn thống kê còn thiếu

**Phạm vi hiện tại đã thu về 5 giải ngày 19/10/2026:** 2.684 cầu thủ nguồn, 96 CLB; thống kê chi tiết có 2.148 người đủ năm trường, 118 người có một phần, 418 người thiếu cả năm. Các con số tám giải bên dưới là lịch sử trước khi thu phạm vi. Xem [dữ liệu hiện tại](../data/README.md#overview) và [báo cáo chuyển phạm vi](reports/top5-scope-report.json).

**Cập nhật 19/10/2026:** đã thực hiện bước bổ sung từ các nguồn phù hợp. Hiện có 2.980 cầu thủ đủ năm chỉ số, 429 người có một phần; xem [báo cáo triển khai](../data/README.md#enrichment). Phần bên dưới là ghi nhận khảo sát ngày 16/10, không phải số lượng hiện tại.

## Khảo sát bổ sung tiếp ngày 19/10

- Kiểm tra [Statz Süper Lig 25/26](https://statz.ai/competitions/super-lig/stats/players?season=2025-2026): bảng công khai có Chances Created, nhưng không lấy nó thay `keyPasses` khi chưa xác nhận định nghĩa; chưa cung cấp đủ tổng tắc bóng/chuyền cần bổ sung trong phần đã đọc.
- [FBref Eredivisie Misc 25/26](https://fbref.com/en/comps/23/2025-2026/misc/2025-2026-Eredivisie-Stats) và bảng Thổ Nhĩ Kỳ: yêu cầu đọc trực tiếp trả lỗi/HTTP 403. Không vượt chặn, không coi nội dung chưa tải được là dữ liệu có thể nhập.
- [AS Primeira Liga](https://en.as.com/resultados/futbol/portugal/2025_2026/ranking/jugadores/): có các bảng tổng đường chuyền/Shot assist; chưa nhập vì chưa đủ bộ trận/phút/nhận diện đã đối chiếu và định nghĩa để thay thế chính xác từng cột. Không dùng Ground duels won thay Tackles won.
- Football Today: tham số `playerSlug` xuất hiện ở trang hồ sơ nhưng thử đọc vẫn trả bảng CLB, không cung cấp thêm dòng ngoài bảng. Không coi bộ lọc này là cách lấy mọi chỉ số còn thiếu.
- Hướng bổ sung có thể kiểm chứng: hồ sơ cầu thủ Football Today công bố JSON-LD `Person.birthDate`, `mainEntityOfPage`. Đối chiếu chính xác ngày sinh với hồ sơ local, đường dẫn hồ sơ đúng người, tên/ID duy nhất, CLB đã xác nhận và số trận/phút/bàn của bảng mùa trước khi dùng alias còn thiếu. Không đoán theo tên viết tắt hoặc tự hạ ngưỡng phút. Kết quả nhập mới nhất nằm ở [tài liệu triển khai](../data/README.md#enrichment).

Ngày kiểm tra: **16/10/2026**. Đây là kết quả khảo sát, **chưa nhập thêm vào database**. Lần nhập trước vẫn là 1.744 cầu thủ; không cộng các số ứng viên dưới đây vào số đã nhập.

## 1. Giải quyết tên khác nhau bằng ID

Nguồn: [REEP football entity register](https://github.com/withqwerty/reep), [bảng people.csv](https://github.com/withqwerty/reep/blob/main/data/people.csv). Metadata của bản tải ghi release `2026.25`, ngày 21/06/2026. Đây là bảng liên kết danh tính, không phải thống kê trận đấu. Chưa được gắn OFFICIAL hoặc coi mọi liên kết là chắc chắn chỉ vì repo ghi verified.

Đối chiếu trực tiếp file CSV với hồ sơ Transfermarkt local và bảng thống kê SofaScore đã tải:

| Kiểm tra | Số lượng |
|---|---:|
| Dòng SofaScore trước đây không ghép được tên duy nhất | 149 |
| Có liên kết ID SofaScore → Transfermarkt duy nhất và ngày sinh trùng local | 116 |
| Đồng thời khớp CLB/giải, số trận, bàn thắng và ngưỡng phút hiện hành | **75** |

75 ứng viên có 75 ID Transfermarkt khác nhau, không nhắm trùng một hồ sơ. Ví dụ:

| Tên SofaScore | Tên Transfermarkt | ID Transfermarkt |
|---|---|---:|
| Gabriel Magalhães | Gabriel | 435338 |
| Đorđe Petrović | Djordje Petrovic | 465555 |
| Daniel Ballard | Dan Ballard | 503686 |
| Idrissa Gana Gueye | Idrissa Gueye | 126665 |

Chưa sửa importer để sử dụng bảng ID này. Khi triển khai cần giữ snapshot/checksum bảng liên kết, bằng chứng ngày sinh, ID và quy tắc chống liên kết nhiều-một. Không hạ ngưỡng phút để tăng số người được nhận.

## 2. Bồ Đào Nha và Hà Lan

Nguồn: [Forensics xG](https://github.com/jczpineda/Forensics-xG-Intelligence-Unit-), commit kiểm tra `8cb0f85be1eafeb25bc228ed5eb2d724ebc80b10`. Đã tải và đọc các CSV thực tế, không chạy mã của tác giả.

| Kiểm tra | Eredivisie | Primeira Liga |
|---|---:|---:|
| Dòng CSV mùa 2025-2026 | 700 | 656 |
| Dòng có số phút dương | 553 | 582 |
| ID cầu thủ duy nhất trong các dòng có phút | 527 | 574 |
| Dòng ghi rõ đủ 5 chỉ số cần bổ sung | 379 | 394 |
| ID cầu thủ hoạt động nối được qua REEP và ngày sinh local | 476 | 497 |
| Ứng viên một dòng/ID, có đủ 5 chỉ số và trận/phút/bàn phù hợp local | **65** | **201** |

65/201 là **ứng viên trước khi xác nhận CLB, độ hoàn chỉnh mùa và định nghĩa cột**. Không coi là dữ liệu đã được chấp nhận nhập. Một số cầu thủ có nhiều dòng CLB trong cùng mùa; không cộng lặp hoặc chọn dòng đầu tiên. Ô trống vẫn là thiếu, không tự thành 0.

Các cột cần kiểm tra tiếp: `Tackles Won`, `Interceptions`, `Key Passes (Attempt Assists)`, `Total Successful Passes ( Excl Crosses & Corners ) `, `Total Passes`. Phạm vi loại trừ tạt bóng/phạt góc của cột chuyền phải được xác nhận trước khi ghép với định nghĩa đang dùng.

**Hà Lan có dấu hiệu thiếu vòng cuối:** số lần ra sân lớn nhất trong bản tải là 33, số phút lớn nhất 2.970. Không dùng nhãn 2025-2026 để khẳng định đầy đủ 34 vòng. Bồ Đào Nha có người đạt 34 trận/3.060 phút, nhưng điều đó cũng chưa tự chứng minh mọi dòng đầy đủ.

## 3. Thổ Nhĩ Kỳ

- [FotMob mùa 25/26](https://www.fotmob.com/leagues/71/stats/season/27244/players/accurate_pass/super-lig-1000-players): tải được HTML và đọc được dữ liệu trang. Xác nhận season ID `27244` là 2025/2026; bảng chuyền chính xác có 292 dòng. Tuy nhiên giá trị chính là chỉ số/90 đã làm tròn, đi kèm tỷ lệ chuyền chính xác. Chưa có đủ 5 tổng mùa để nhập, không nhân ngược số trung bình rồi giả làm tổng chính xác. Bảng xếp hạng còn có điều kiện số trận/phút nên không phải danh sách toàn bộ cầu thủ.
- [Football Today](https://www.footballtoday.net/turkey/super-lig/2025-2026): có bảng giải đủ 34 vòng và thống kê. Chưa xác nhận tải được toàn bộ 5 chỉ số theo cầu thủ.
- [Excel4Soccer](https://www.excel4soccer.com/download/soccer-stats-in-excel-turkish-super-lig/): trang công bố bản 20260613, nguồn ESPN, nhưng nút tải thực tế dẫn `#unlock` với trạng thái locked. **Chưa tải/đọc được workbook**, không coi phần mô tả là bằng chứng nội dung file.
- SofaScore API thử một yêu cầu đọc thông thường trả HTTP 403; không dùng thủ thuật vượt chặn.

## Hướng xử lý có bằng chứng tốt nhất

Ưu tiên bổ sung bảng liên kết ID cho 75 cầu thủ trong nguồn SofaScore đã dùng. Sau đó xác minh phạm vi/định nghĩa các cột của bản Bồ Đào Nha. Hà Lan cần dữ liệu vòng cuối hoặc chứng minh thống kê từng cầu thủ đã đầy đủ. Thổ Nhĩ Kỳ vẫn cần nguồn tải được các tổng mùa chính xác.

Không thay đổi công thức matching, dữ liệu đang có, schema hoặc API trong đợt khảo sát này.
