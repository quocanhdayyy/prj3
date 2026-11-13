# Lịch sử kiểm tra và sửa dữ liệu ngày 21 tháng 10 năm 2026

## Audit

Kiểm tra trước khi sửa dữ liệu.

> Báo cáo này là snapshot trước khi dọn dữ liệu. Xem [thay đổi đã áp dụng sau kiểm tra](data-history-2026-10-21.md#repair) để biết số lượng hiện tại và các ước tính riêng.

Đọc PostgreSQL lúc `2026-10-21T07:13:28Z` bằng transaction READ ONLY. Không sửa schema, dữ liệu hoặc cấu hình. Đây là báo cáo tại thời điểm kiểm tra, không tự cập nhật số lượng.

### Phạm vi và tính nhất quán

- 2.684 cầu thủ nguồn, 96 CLB, 2.684 dòng thống kê mùa 2025/2026, 53.352 mốc định giá.
- Tổng vật lý: 2.686 cầu thủ, 100 CLB, 2.686 dòng thống kê. Phần chênh là hồ sơ/CLB thủ công và DEMO.
- Không thiếu/thừa mã cầu thủ so với bộ đã chọn. Hồ sơ và tổng trận/phút/bàn/kiến tạo/thẻ khớp prepared.json.
- Đọc lại raw độc lập: 1.752 trận, 2.684 người có phút; không có cặp cầu thủ/trận trùng hoặc CLB trong appearance không khớp fixture. Cả 7 checksum raw khớp manifest.
- 11.122 ô thống kê chi tiết đã có đều truy được lần thay đổi qua AuditLog import, không khác giá trị đang lưu. Đây là kiểm tra nguồn gốc và nhất quán, chưa chứng minh nhà cung cấp đo đúng mọi chỉ số.
- Chưa phát hiện tên/ngày sinh trùng theo phép đối chiếu, tuổi/chiều cao ngoài ngưỡng rà soát, chỉ số âm, chuyền thành công vượt tổng chuyền hoặc phút/trận bất thường.

| Giải | CLB | Người có phút | Đủ 5 trường bổ sung | Một phần | Thiếu cả 5 |
|---|---:|---:|---:|---:|---:|
| Premier League | 20 | 537 | 421 | 27 | 89 |
| La Liga | 20 | 600 | 484 | 22 | 94 |
| Ligue 1 | 18 | 547 | 401 | 20 | 126 |
| Serie A | 20 | 585 | 449 | 17 | 119 |
| Bundesliga | 18 | 497 | 393 | 32 | 72 |

Có người chuyển giữa hai giải nên không cộng số người từng giải thành tổng duy nhất. Mỗi CLB có 22–38 người có phút trong snapshot. Tổng 96 CLB là đúng cho bộ mùa này.

### Hồ sơ và quan hệ CLB

| Dữ liệu còn thiếu | Số cầu thủ nguồn |
|---|---:|
| Giá thị trường có ngày | 121 |
| Chiều cao | 36 |
| Chân thuận | 33 |
| Vị trí phụ chưa có | 2.684 |

96 CLB nguồn chưa có năm thành lập; phần mô tả này không chặn công thức hiện tại. Vị trí chính đều thuộc 10 mã đã thống nhất. Vị trí phụ rỗng là chưa có bằng chứng, không khẳng định cầu thủ chỉ chơi một vai trò.

Database chưa lưu quan hệ đăng ký CLB/giải theo mùa cho cầu thủ. Player không có clubId; Contract có quan hệ CLB nhưng chưa có hợp đồng của cầu thủ nguồn. File nguồn có clubsDuringSeason và CLB tại snapshot; API hiện không thể suy ra CLB thật từ Contract trống.

86/2.684 hồ sơ có CLB snapshot nằm ngoài 96 CLB đã chọn. Không tự xóa: phạm vi hiện tại là đã thi đấu trong 5 giải mùa 2025/2026, không phải vẫn ở các giải hôm nay. Muốn hiển thị CLB theo mùa hoặc snapshot cần lưu rõ ngày/nguồn và phân biệt hai ý nghĩa.

### Thống kê và phong độ

2.148 người đủ cả năm trường bổ sung, 118 người có một phần, 418 người thiếu cả năm. Ô chưa biết giữ null.

| Trường | Số người còn null |
|---|---:|
| tacklesWon | 446 |
| interceptions | 467 |
| keyPasses | 464 |
| passesCompleted | 463 |
| passesAttempted | 458 |

Dùng công thức/mốc mặc định trong đặc tả và vị trí chính: **2.043/2.684 người tính được riêng phong độ**. Đây không phải số người đủ S hoặc tổng Matching.

| Vị trí | Tổng | Tính được phong độ | Chưa tính được |
|---|---:|---:|---:|
| ST | 390 | 287 | 103 |
| LW | 210 | 158 | 52 |
| RW | 232 | 172 | 60 |
| CAM | 175 | 135 | 40 |
| CM | 350 | 290 | 60 |
| CDM | 212 | 172 | 40 |
| CB | 506 | 465 | 41 |
| RB | 222 | 191 | 31 |
| LB | 193 | 173 | 20 |
| GK | 194 | 0 | 194 |

447 cầu thủ sân thiếu chỉ số cần cho công thức vai trò. 194 GK chưa có công thức phong độ được chốt; chỉ số thủ môn chuyên biệt cũng chưa có trong schema. Hai vấn đề này cần xử lý riêng.

Không có cầu thủ nguồn 0 phút. Bộ appearances đang chọn người có phút; không thể khẳng định đây là đủ danh sách đăng ký hoặc tự coi người không xuất hiện là có thống kê 0.

Raw còn 866 hồ sơ last_season=2025 có current_club_id thuộc 96 CLB nhưng ngoài tập nhập. Đây chỉ là ứng viên để kiểm tra đăng ký mùa, không đủ căn cứ nhập hết hoặc khẳng định đều thuộc đội một mùa 2025/2026. Hồ sơ last_season cũ hơn còn nhiều hơn, nên không lấy đội hình chỉ bằng current_club_id.

### Đầu vào F và R

| Nhóm | Cầu thủ nguồn có dữ liệu sử dụng được | Vấn đề |
|---|---:|---|
| Phí mua dự kiến | 0 | Chưa có MatchingInput; marketValue không tự thay phí mua |
| Lương kỳ vọng | 0 | Chưa có MatchingInput; không đồng nghĩa lương hiện tại |
| Hợp đồng | 0 | Chưa có Contract nguồn; không được mặc định là tự do |
| Chấn thương | 0 | Không có injury history hoặc xác minh bao phủ hai năm |
| Bán lại | 2.482 | 202 người chưa đủ cặp định giá theo quy tắc hiện tại |

Database có 2 Contract, 1 InjuryHistory, 1 MatchingInput và 1 PlayerDataVerification nhưng thuộc hồ sơ thủ công/DEMO, không tính vào độ phủ cầu thủ nguồn.

Raw có **ngày hết hạn hợp đồng được báo cáo cho 2.394 người**, trong đó 2.378 ngày không trước 21/10/2026. Đây là metadata snapshot, không chứng minh hợp đồng còn hiệu lực hôm nay; chưa có đủ ngày bắt đầu/lương. Schema Contract bắt buộc startDate, endDate, salaryPerYear, nên không nhập riêng endDate bằng cách bịa các trường còn lại. Cần chốt cách lưu snapshot hợp đồng hoặc trường nullable trước khi nhập.

53.352 mốc định giá nằm từ 2004-10-04 đến 2026-06-11, đều gắn UNKNOWN. 104 người có mốc gần nhất cũ hơn 180 ngày; 121 người chưa có mốc nào. Không có giá âm hoặc mốc sau ngày đánh giá. Cặp định giá không bảo đảm cách nhau đúng 12 tháng; giá mới nhất không phải giá hôm nay.

### Phần có thể bổ sung từ file đã tải

Đã kiểm tra cấu trúc bundle, danh tính/ngày sinh, baseline trận/phút/bàn/thẻ và checksum: 915 file enrichment khớp, CSV supplemental khớp, bundle supplemental tham chiếu đúng checksum Transfermarkt 5 giải.

Mô phỏng trong bộ nhớ, không ghi database:

| Thứ tự | Người có ô được điền | Số ô |
|---|---:|---:|
| Supplemental trước | 31 | 155 |
| Enrichment sau | 8 | 36 |
| Tổng duy nhất | **39** | **191** |

Dự kiến nếu áp dụng đúng kế hoạch:

- Đủ 5 trường bổ sung: 2.148 → **2.185**.
- Tính được riêng phong độ: 2.043 → **2.081**.
- Ví dụ: Emmanuel Agbadou, Oleksandr Zinchenko, Bertrand Traoré, Sofyan Amrabat, Mattéo Guendouzi.

Không cộng hai kế hoạch độc lập vì có người/ô trùng. Số trên đã mô phỏng thứ tự để không đếm hai lần. Trước khi áp dụng vẫn chạy dry-run chính thức với admin của máy và không ghi đè giá trị tồn tại.

### Cấu hình và thứ tự đề xuất

Chỉ có một cấu hình hợp lệ tên DEMO Matching - owner 15, hiện không active. Search dùng mặc định sẽ trả 409 đến khi có cấu hình active hợp lệ. Đây là thiếu cấu hình vận hành, tách khỏi thiếu dữ liệu cầu thủ; audit không tự kích hoạt DEMO hoặc thay trọng số.

1. Áp dụng 191 ô có nguồn cho 39 người, kiểm tra độ phủ và provenance sau nhập.
2. Chốt cách lưu CLB theo mùa/snapshot và ngày hết hạn hợp đồng; không bịa lương/ngày bắt đầu.
3. Bổ sung phí/lương kỳ vọng theo nhu cầu. Nếu muốn dùng giá ước tính thay thế, thống nhất quy tắc và gắn nguồn rõ ràng trước.
4. Bổ sung chấn thương có nguồn cho nhóm ưu tiên; chỉ xác minh phạm vi có bằng chứng. Không có dòng không có nghĩa 0 ngày nghỉ.
5. Bổ sung chỉ số theo vai trò, vị trí phụ và 121 trường hợp định giá; hoàn thiện GK riêng nếu cần.
6. Chọn/kích hoạt cấu hình trọng số đã thống nhất qua API trước khi chạy Matching đầy đủ.

Lần kiểm tra này không tìm nguồn mới trên internet, không sửa schema, không xóa hồ sơ và không nhập dữ liệu thật/giả vào PostgreSQL.

## Repair

Dọn mẫu và bổ sung ước tính.

> Ước tính đã được nâng từ baseline nhóm V1 sang [bằng chứng cá nhân V2](../data/README.md#estimation). Phần công thức/MAE V1 bên dưới giữ để đối chiếu lịch sử, không coi là kết quả kiểm định V2.

### Đã thực hiện trong PostgreSQL

- Xóa đúng Nguyen Van A (ID 4), DEMO - Nguyen Minh An (ID 93), Example United (ID 1) và ba CLB DEMO (ID 104–106).
- Xóa các bản ghi mẫu tham chiếu: hai nhu cầu (3, 87), hai hợp đồng, hai mục shortlist, một danh sách DEMO, một kết quả Matching, một giao dịch, một thông báo, một đầu vào tài chính, một xác minh chấn thương, một chấn thương, hai thống kê và hai định giá mẫu.
- Giữ tài khoản/phiên đăng nhập, các ID cầu thủ nguồn và toàn bộ 53.352 định giá nguồn. Cấu hình DEMO cũ còn ở dạng nháp, không active; chưa đặt trọng số mặc định mới.
- Bổ sung 191 ô thống kê có nguồn cho 39 cầu thủ: supplemental 31 người/155 ô, sau đó enrichment 8 người/36 ô. Kiểm tra checksum và danh tính/baseline trước khi cập nhật; chỉ điền null.
- Tạo 499 bản ghi ước tính riêng, chứa 2.107 ô còn thiếu. Không ghi số ước tính vào các cột quan sát của player_stats.

Hiện còn **2.684 cầu thủ, 96 CLB, 2.684 thống kê mùa 2025/2026**. Số người đủ cả năm trường quan sát tăng từ 2.148 lên **2.185**; 120 người có một phần, 379 người thiếu cả năm. Riêng phong độ quan sát tính được cho **2.081 người**. GK vẫn chưa có công thức phong độ.

Backup các bản ghi bị xóa và số liệu trước khi sửa nằm trong `data/maintenance/repair-*.json`, có checksum, mode 600, được gitignore. Bản ghi audit cũ được giữ và thêm audit DELETE/UPDATE, không xóa lịch sử thao tác. Chỉ khôi phục có chọn lọc khi cần; không chạy seed để vô tình đưa DEMO trở lại.

### Ước tính được tạo như thế nào?

Phương pháp `PEER_MEDIAN_PER90_V1` là baseline imputation do dự án đề xuất, chưa phải mô hình đánh giá năng lực đã được hiệu chuẩn:

1. Chỉ dùng số liệu quan sát từ cầu thủ có ít nhất 900 phút; loại chính cầu thủ mục tiêu khỏi nhóm tham chiếu.
2. Chọn ít nhất 12 người cùng vị trí và giải. Thiếu mẫu thì mở sang cùng nhóm vai trò/giải, rồi cùng vị trí hoặc vai trò trong 5 giải. Không lấy nhóm vị trí không liên quan.
3. Tính trung vị chỉ số/90 phút, nhân số phút thực tế của cầu thủ mục tiêu rồi làm tròn thành tổng mùa.
4. Với chuyền bóng, dùng cặp tổng chuyền và tỷ lệ hoàn thành của nhóm tham chiếu để bảo đảm chuyền thành công không vượt tổng chuyền; giữ nguyên giá trị quan sát đã có.
5. Lưu phương pháp, nhóm tham chiếu, ID người tham chiếu, số phút, checksum dữ liệu đầu vào, trung vị và phân vị 10/90. Các phân vị mô tả nhóm, không phải khoảng dự đoán đã hiệu chuẩn cho từng người.

Đây là **ước tính theo nhóm**, không khẳng định đã tìm được thống kê thật của từng cầu thủ hoặc đo được phong cách riêng. Không dùng danh tiếng cầu thủ để tự cộng chỉ số.

Tham khảo khái niệm thay giá trị thiếu bằng trung vị và đánh dấu thiếu trong [tài liệu imputation của scikit-learn](https://scikit-learn.org/stable/modules/impute.html). Dự án dùng mã riêng, không thêm thư viện ML. Ngữ cảnh chiến thuật có thể ảnh hưởng chỉ số phòng ngự; xem [phân tích trung vệ của StatsBomb](https://statsbomb.com/articles/soccer/using-pressure-to-evaluate-centre-backs/).

### Sai số kiểm tra ban đầu

Ẩn giá trị đã biết của tối đa 150 người mỗi chỉ số, loại chính người đó khỏi nhóm rồi dự đoán lại. Với chuyền bóng ẩn cả hai trường. Sai số tuyệt đối trung bình theo /90:

| Chỉ số | MAE /90 |
|---|---:|
| Tắc bóng thành công | 0,295 |
| Cắt bóng | 0,283 |
| Key passes | 0,346 |
| Chuyền thành công | 9,372 |
| Tổng chuyền | 9,353 |

Đây là kiểm tra nội bộ trên người có số liệu và đủ phút, không chứng minh cùng mức chính xác cho người bị thiếu dữ liệu hoặc ít phút. Không dùng các số này làm xác suất tin cậy. Sau bổ sung, toàn bộ 2.107 ô thiếu của năm trường đã có giá trị ước tính riêng; vẫn còn thiếu dữ liệu khác như hợp đồng/chấn thương.

### Xem qua API

`GET /api/player-stats/:id` và danh sách thống kê trả thêm `estimate`:

```json
{
  "playerName": "Mateo Kovacic",
  "tacklesWon": null,
  "estimate": {
    "method": "PEER_MEDIAN_PER90_V1",
    "values": { "tacklesWon": 2 },
    "evidence": { "dataBasis": "ESTIMATED_NOT_OBSERVED" }
  }
}
```

Ví dụ chỉ trích một phần response; phương thức trả cả các trường khác và bằng chứng. FE cần ghi nhãn “ước tính”, không hiển thị như dữ liệu quan sát. `:id` là ID thống kê, không phải playerId. Bản ghi không cần ước tính có `estimate: null`.

Matching F/S/R và các preview hiện vẫn dùng số liệu quan sát. Không tự đưa estimate vào công thức hoặc lưu điểm tổng từ ước tính. Muốn dùng để chấm thử, cần bổ sung lựa chọn rõ ràng và gắn nhãn điểm dựa trên ước tính trong bước sau. Khi sửa thống kê bằng API, bản ước tính cũ của dòng đó được xóa để tránh dùng lại theo số phút/counters cũ.

Không ước tính/giả xác minh lịch sử chấn thương, phí mua, lương, hợp đồng, định giá hoặc vị trí phụ trong lần này. Không có bằng chứng chấn thương vẫn không có nghĩa là khỏe mạnh.

### Chạy lại và kiểm tra

Trong `backend`, thay 15 bằng admin thực tế của máy:

```sh
npm run data:repair -- --actor-id 15
npm run data:estimate:prepare
npm run data:estimate -- --actor-id 15
```

Mặc định dry-run; thêm `--apply` mới ghi dữ liệu. Repair giới hạn chính xác ID/tên mẫu nêu trên; dừng nếu có tham chiếu tới cầu thủ nguồn. Estimate không dùng estimate cũ làm donor và có thể sinh lại sau khi bổ sung dữ liệu thật. Backup và audit được lưu trước/khi ghi. Máy mới phải nhập dữ liệu quan sát trước; Git không mang theo PostgreSQL.

```sh
npm run test:estimation
npm run test:estimation-api
npm run test:top5-scope
npm run test:matching-engine-api
```

Manifest DEMO cũ được đánh dấu đã xóa; test phụ thuộc dữ liệu DEMO thường trú sẽ thông báo SKIP, không tự tạo lại. Để test Matching thật cần tạo nhu cầu mới với một trong 96 CLB và chọn cấu hình hợp lệ; ID nhu cầu 3/87 đã bị xóa cùng dữ liệu mẫu.

