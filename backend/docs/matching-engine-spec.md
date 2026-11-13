# Đặc tả Matching Engine

Ngày tổng hợp: 15/10/2026.

Tài liệu này gom phương án đã bàn. Đã triển khai phép tính F/S/R, tổng điểm, xếp hạng và lưu MatchResult; xem [Matching API](api/README.md#matching). Bản thử riêng F vẫn giữ tương thích trong [hướng dẫn thử F](testing/README.md#financial-fit). Trọng số bên trong S/R chưa được tự gán: cần điền vào cấu hình trước khi chạy. Bộ mốc chuyên môn và trọng số theo vị trí là cấu hình khởi đầu để thử trên dữ liệu, chưa phải chuẩn bóng đá đã kiểm chứng.

## 1. Mục tiêu và phạm vi

Chấm một cầu thủ với một yêu cầu tuyển dụng của CLB, trả điểm 0–100 cùng điểm thành phần và lý do. Điểm của một cầu thủ không thay đổi chỉ vì thêm hoặc bớt ứng viên khác. Các mốc chấm cố định theo phiên bản cấu hình, không lấy min–max trong danh sách ứng viên.

Ba nhóm điểm:

| Nhóm | Ý nghĩa | Thành phần | Trọng số tổng |
|---|---|---|---:|
| F — Financial Fit | Phù hợp tài chính | Phí chuyển nhượng, lương, thời hạn hợp đồng còn lại | 40% |
| S — Squad Fit | Phù hợp đội hình | Vị trí, tuổi, phong độ theo vị trí | 40% |
| R — Risk & Future | Rủi ro và tương lai | Lịch sử chấn thương, tiềm năng bán lại | 20% |

```text
Match Score = 0,40 × F + 0,40 × S + 0,20 × R
```

Trọng số bên trong F đã được chấp nhận để triển khai thử: phí 45%, lương 35%, hợp đồng 20%. Trọng số kết hợp bên trong S và R chưa chốt. Không tự dùng trọng số gợi ý trong bản mô tả của bạn cùng nhóm thay cho quyết định còn thiếu.

## 2. Quy ước chung

- `clamp(x) = max(0, min(100, x))`: giới hạn điểm trong khoảng 0–100.
- Tiền thống nhất euro; lương và trần lương cùng đơn vị euro/năm.
- Tuổi là tuổi tròn tại ngày đánh giá, tính từ ngày sinh.
- Dữ liệu phải cùng phạm vi đánh giá: cùng mùa cho số phút và thống kê, cùng đơn vị tiền cho so sánh tài chính.
- Tính bằng độ chính xác đầy đủ; chỉ làm tròn khi trả kết quả, đề xuất hai chữ số thập phân.
- Giá trị thiếu không tự trở thành 0. Không có đủ dữ liệu không đồng nghĩa cầu thủ kém.
- Giá trị thị trường, phí mua dự kiến, phí giải phóng và phí chuyển nhượng lịch sử là các khái niệm khác nhau; không tự thay thế chúng cho nhau.

## 3. F — Financial Fit

### 3.1. Điểm phí chuyển nhượng

Ký hiệu:

- `fee`: phí mua dự kiến của thương vụ đang đánh giá.
- `budget`: ngân sách phí chuyển nhượng của yêu cầu CLB, phải lớn hơn 0 để dùng công thức tỷ lệ.

```text
Điểm phí = clamp(200 − 120 × fee / budget)
```

Đã bỏ phương án cũ “trong ngân sách luôn 80, vượt thì loại”. Phương án hiện tại vẫn chấm cầu thủ vượt ngân sách, giảm điểm theo tỷ lệ; điểm 0 không tự đồng nghĩa bị loại.

Ví dụ ngân sách 60 triệu euro:

| Phí mua | Điểm phí |
|---:|---:|
| 30 triệu | 100 |
| 50 triệu | 100 |
| 60 triệu | 80 |
| 70 triệu | 60 |
| 78 triệu | 44 |
| 90 triệu | 20 |
| 100 triệu trở lên | 0 |

Vì có giới hạn 100, mọi giá không quá 5/6 ngân sách đều được 100. Phí từ 5/3 ngân sách trở lên được 0. Đây là hệ quả của công thức đã chọn, không phải ngưỡng loại bổ sung.

Đã có `MatchingInput.estimatedFee` để lưu phí mua dự kiến theo cầu thủ/yêu cầu CLB, kèm `feeSource`, nhập qua `/api/matching-inputs`. Không mặc định lấy phí ở một thương vụ cũ hoặc lấy `marketValue` mà không ghi rõ đó là ước tính.

### 3.2. Điểm lương

Ký hiệu:

- `salary`: mức lương năm dùng cho đánh giá thương vụ.
- `salaryLimit`: trần lương năm của yêu cầu CLB, phải lớn hơn 0 để dùng công thức tỷ lệ.

```text
Điểm lương = clamp(160 × (1,5 − salary / salaryLimit))
```

Đúng trần được 80. Lương từ 150% trần trở lên được 0. Vượt trần không tự bị loại.

Ví dụ trần 10 triệu euro/năm:

| Lương năm | Điểm lương |
|---:|---:|
| 8 triệu | 100 |
| 9 triệu | 96 |
| 10 triệu | 80 |
| 11 triệu | 64 |
| 12 triệu | 48 |
| 13 triệu | 32 |
| 14 triệu | 16 |
| 15 triệu trở lên | 0 |

Lương hợp đồng hiện tại và lương cầu thủ yêu cầu ở hợp đồng mới có thể khác nhau. Đã có `MatchingInput.expectedSalaryPerYear` và `salarySource` để lưu lương mới dự kiến. Cần chốt có dùng lương hiện tại khi chưa biết lương mới hay không, không tự thay thế âm thầm.

### 3.3. Điểm thời hạn hợp đồng

Xét thời hạn còn lại với CLB cũ tại ngày đánh giá, không phải thời hạn hợp đồng dự định ký mới.

Gọi `monthsRemaining` là số tháng còn lại không âm, có thể là số lẻ:

```text
Điểm hợp đồng = max(0, 100 − 100 × monthsRemaining / 60)
```

| Tháng còn lại | Điểm hợp đồng |
|---:|---:|
| 0 | 100 |
| 6 | 90 |
| 7,5 | 87,50 |
| 9,5 | 84,17 |
| 11,25 | 81,25 |
| 12 | 80 |
| 24 | 60 |
| 36 | 40 |
| 48 | 20 |
| 60 trở lên | 0 |

Hợp đồng còn ngắn được đánh giá thuận lợi hơn về mặt hợp đồng. Điểm này không tự điều chỉnh phí mua.

Thiếu hồ sơ hợp đồng không tự cho 100 hoặc tự coi là tự do. Bản thử F tính tháng lịch nguyên cộng phần lẻ của khoảng tháng kế tiếp, chặn ngày cuối tháng về ngày hợp lệ. Dùng hợp đồng ACTIVE bao phủ ngày hiện tại; nếu không có thì chỉ nhận xác minh FREE_AGENT đúng ngày hiện tại để lấy 0 tháng. Xem chi tiết và giới hạn trong [hướng dẫn thử F](testing/README.md#financial-fit). Không đồng nhất hợp đồng còn dưới 6 tháng với đã tự do ngay tại ngày đánh giá.

### 3.4. Tổng hợp F

```text
F = wFee × Điểm phí + wSalary × Điểm lương + wContract × Điểm hợp đồng
wFee + wSalary + wContract = 1
```

Trong bản thử đã dùng `wFee = 0,45`, `wSalary = 0,35`, `wContract = 0,20`. Cấu hình thử `financial-trial-v1` chưa tự đọc hay kích hoạt ScoringConfig đầy đủ trong DB.

## 4. S — Squad Fit

### 4.1. Điểm vị trí

So vị trí cầu thủ với vị trí CLB cần:

| Mức khớp | Điểm vị trí |
|---|---:|
| Khớp vị trí chính | 100 |
| Khớp vị trí phụ được ghi nhận | 80 |
| Cùng nhóm vị trí | 50 |
| Khác nhóm | 0 |

Nếu khớp nhiều mức thì lấy mức cao nhất, không cộng dồn. Không tự khẳng định cầu thủ đá được một vị trí phụ chỉ vì cùng nhóm.

Đã bổ sung `Player.secondaryPositions` dạng mảng, mặc định rỗng; tạo/sửa qua API `/api/players` cho Admin. Cần điền bảng nhóm vị trí trong cấu hình; không có nhóm thì các ca cần so nhóm trả thiếu cấu hình, không tự cho 0/50. Điểm vị trí bằng 0 chưa được chốt là điều kiện tự loại khỏi Matching.

### 4.2. Điểm tuổi

Đã bỏ lựa chọn “mua dùng ngay / mua để đào tạo”. Dùng chung bảng:

| Tuổi tròn | Điểm tuổi trong S |
|---|---:|
| 15 đến dưới 20 | 80 |
| 20 đến dưới 25 | 90 |
| 25 đến hết 30 | 100 |
| Trên 30 đến dưới 35 | 80 |
| Từ 35 trở lên | 70 |

Cụ thể: 30 tuổi được 100; 31–34 tuổi được 80; 35 tuổi được 70. Dưới 15 chưa có quy tắc chấm.

Yêu cầu CLB hiện vẫn có `minAge` và `maxAge`. Cách dùng chúng để lọc ứng viên sau khi chuyển sang bảng tuổi cố định chưa được chốt; không tự xóa trường hoặc tự áp dụng lại luật ngoài khoảng thì loại.

### 4.3. Điểm phong độ

#### Phạm vi vị trí

Hồ sơ và điểm khớp vị trí dùng đúng 10 mã ST, LW, RW, CDM, CAM, CM, CB, RB, LB, GK. Chốt chuẩn hóa ngày 16/10/2026: CF/SS→ST; RWB→RB; LWB→LB; RCM/LCM→CM; LM→LW; RM→RW. Giữ thông tin vị trí gốc trong nguồn/nhật ký. Công thức phong độ hiện có 7 nhóm: ST, LW/RW, CAM, CM, CDM, CB, RB/LB. LW/RW dùng chung một bộ công thức; RB/LB tương tự. GK đã dùng trong hồ sơ và khớp vị trí nhưng chưa có công thức phong độ, không dùng công thức cầu thủ sân ngoài thay thế.

Mỗi nhóm có đúng 4 đầu điểm: điểm thời lượng và 3 điểm chuyên môn theo vai trò. Đây là điểm hiệu quả thống kê mùa giải, chưa phải mô hình phong độ vài trận gần nhất hoặc đánh giá đầy đủ chiến thuật.

#### Dữ liệu mỗi 90 phút

```text
Chỉ số/90 = Tổng chỉ số × 90 / Tổng phút thi đấu
```

Quy đổi các chỉ số đếm đang có: bàn thắng, kiến tạo, thẻ vàng, thẻ đỏ, tắc bóng thành công, cắt bóng, đường chuyền tạo cơ hội, chuyền thành công và tổng đường chuyền. Không phải mọi chỉ số quy đổi đều được đưa vào công thức chấm hiện tại; thẻ phạt hiện chưa có trọng số phạt.

Tỷ lệ chuyền chính xác giữ dạng phần trăm:

```text
Pass accuracy = passesCompleted / passesAttempted × 100
```

Số phút bằng 0 hoặc chỉ số thiếu thì giá trị/90 chưa xác định. Không có lượt chuyền thì tỷ lệ chuyền chính xác chưa xác định. Các giá trị này được tính khi đọc dữ liệu, chưa cần lưu thành bảng riêng.

#### Điểm thời lượng đã sửa theo yêu cầu mới nhất

| Phút trong mùa | Điểm phút |
|---:|---:|
| 0 | Chưa đánh giá |
| Trên 0 đến dưới 450 | 60 |
| 450 đến dưới 900 | 70 |
| 900 đến dưới 1.500 | 80 |
| 1.500 đến dưới 2.000 | 90 |
| Từ 2.000 trở lên | 100 |

Đây là bảng thay thế bản cũ 20/40/60/80/100. Không còn áp dụng các đề xuất cũ bắt buộc đủ 450 hoặc 900 phút mới chấm.

#### Chấm một chỉ số chuyên môn

Gọi `x` là chỉ số/90; `a` là mốc đạt 80 điểm, `b` là mốc đạt 100, với `0 < a < b`:

```text
Nếu 0 ≤ x ≤ a: Điểm = 80 × x / a
Nếu a < x < b: Điểm = 80 + 20 × (x − a) / (b − a)
Nếu x ≥ b: Điểm = 100
```

Điểm tính độc lập bằng mốc cố định của vai trò. Không so min–max với các cầu thủ trong danh sách.

Ký hiệu dưới đây đều là chỉ số mỗi 90 phút:

| Ký hiệu | Chỉ số |
|---|---|
| G | Bàn thắng |
| A | Kiến tạo |
| K | Đường chuyền tạo cơ hội (`keyPasses`) |
| T | Tắc bóng thành công (`tacklesWon`) |
| I | Cắt bóng (`interceptions`) |
| P | Chuyền thành công (`passesCompleted`) |

#### Bộ mốc chuyên môn khởi đầu

Mỗi cặp dưới đây là `a → b`, tức mốc đạt 80 → 100 điểm. Đây là các tham số thử nghiệm, chưa được hiệu chỉnh bằng dữ liệu thực tế.

| Vai trò | Chỉ số thứ nhất | Chỉ số thứ hai | Chỉ số thứ ba |
|---|---|---|---|
| ST | G: 0,6 → 1,0 | A: 0,2 → 0,4 | K: 1,0 → 2,0 |
| LW/RW | G: 0,4 → 0,7 | A: 0,25 → 0,5 | K: 1,5 → 3,0 |
| CAM | G: 0,2 → 0,4 | A: 0,3 → 0,6 | K: 2,0 → 3,5 |
| CM | K: 1,5 → 3,0 | P: 50 → 75 | I: 1,0 → 2,0 |
| CDM | T: 2,0 → 3,5 | I: 1,5 → 3,0 | P: 50 → 75 |
| CB | T: 1,2 → 2,5 | I: 1,2 → 2,5 | P: 45 → 70 |
| RB/LB | A: 0,15 → 0,35 | K: 1,0 → 2,0 | T: 1,5 → 3,0 |

`P` hiện là số chuyền thành công/90, không phải tỷ lệ chuyền chính xác. Bộ công thức hiện chưa dùng pass accuracy. Không tự thay chỉ số này khi triển khai.

#### Kết hợp bốn đầu điểm

`đG`, `đA`, `đK`, `đT`, `đI`, `đP` là điểm 0–100 sau quy đổi, không phải số liệu/90 thô.

| Vai trò | Điểm phong độ ban đầu |
|---|---|
| ST | 0,20 × Điểm phút + 0,50 × đG + 0,20 × đA + 0,10 × đK |
| LW/RW | 0,20 × Điểm phút + 0,30 × đG + 0,25 × đA + 0,25 × đK |
| CAM | 0,20 × Điểm phút + 0,15 × đG + 0,25 × đA + 0,40 × đK |
| CM | 0,20 × Điểm phút + 0,30 × đK + 0,30 × đP + 0,20 × đI |
| CDM | 0,20 × Điểm phút + 0,30 × đT + 0,30 × đI + 0,20 × đP |
| CB | 0,20 × Điểm phút + 0,25 × đT + 0,35 × đI + 0,20 × đP |
| RB/LB | 0,20 × Điểm phút + 0,20 × đA + 0,25 × đK + 0,35 × đT |

Áp ràng buộc thời lượng đã đề xuất trong mô hình bốn đầu điểm:

```text
Điểm phong độ cuối = min(Điểm ban đầu, Điểm phút + 20, 100)
```

Sau khi sửa bảng điểm phút, trần tương ứng là:

| Phút | Trần phong độ |
|---:|---:|
| Trên 0 đến dưới 450 | 80 |
| 450 đến dưới 900 | 90 |
| Từ 900 trở lên | 100 |

Hệ quả cần nhớ: với bảng điểm phút mới, cầu thủ rất ít phút vẫn có thể đạt 80; ràng buộc không còn chặt như bảng điểm phút ban đầu. Không tự thay lại bảng cũ để che khác biệt này. Cần kiểm tra tình huống ít phút khi hiệu chỉnh mô hình.

Ví dụ CM có 1.200 phút, 1,5 K/90, 50 P/90, 1 I/90:

- Điểm phút theo bảng mới là 80.
- Cả ba điểm chuyên môn là 80.
- Điểm ban đầu = 0,20 × 80 + 0,30 × 80 + 0,30 × 80 + 0,20 × 80 = 80.
- Trần là 100; điểm cuối = 80.

Các mốc phút tuyệt đối này chỉ áp dụng cho mùa đã được khai báo hoàn thành trong completedSeasons của cấu hình. Chưa chốt cách đánh giá mùa đang diễn ra. API bắt buộc chọn formRole PRIMARY hoặc REQUIRED, không tự mặc định theo một cách chưa chốt hoặc thử mọi vai trò rồi tự chọn điểm cao nhất.

### 4.4. Tổng hợp S

```text
S = wPosition × Điểm vị trí + wAge × Điểm tuổi + wForm × Điểm phong độ
wPosition + wAge + wForm = 1
```

Ba trọng số này chưa chốt. Trọng số phong độ trong S khác với trọng số bốn đầu điểm bên trong phong độ.

## 5. R — Risk & Future

Điểm R càng cao nghĩa là lịch sử chấn thương và triển vọng bán lại càng thuận lợi, không phải rủi ro càng lớn.

### 5.1. Điểm chấn thương

Tính tổng số ngày vắng mặt trong hai năm gần nhất tính đến ngày đánh giá:

| Tổng ngày nghỉ | Điểm chấn thương cơ sở |
|---:|---:|
| 0–30 | 100 |
| Trên 30–90 | 80 |
| Trên 90–180 | 60 |
| Trên 180–270 | 40 |
| Trên 270 | 20 |

Nếu đang chấn thương:

```text
Điểm chấn thương cuối = min(Điểm cơ sở, 50)
```

Nếu không đang chấn thương, giữ điểm cơ sở.

Quy tắc đếm ngày:

- Chỉ tính phần thời gian nằm trong cửa sổ hai năm.
- Gộp các khoảng trùng nhau, không đếm một ngày hai lần.
- Chấn thương đang diễn ra tính đến ngày đánh giá; không tính ngày tương lai.
- Không có hồ sơ chưa đủ chứng minh không từng chấn thương. Cần nhận biết độ đầy đủ dữ liệu trước khi cho 100.
- Tạm chưa trừ riêng theo tên chấn thương, mức độ hoặc tái phát.

Bản triển khai đồng bộ với dịch vụ injury hiện có: tính ngày đã trôi qua [ngày bắt đầu, ngày hồi phục), cùng ngày là 0. Trạng thái chưa hồi phục áp dụng khi endDate chưa có hoặc sau ngày đánh giá. Mức trần 50 là lựa chọn của mô hình, không phải chuẩn y khoa.

### 5.2. Điểm tiềm năng bán lại

Đã chốt kết hợp hai điểm:

```text
Điểm bán lại = 0,60 × Điểm biến động giá trị + 0,40 × Điểm tuổi bán lại
```

#### Điểm biến động giá trị

So giá trị hiện tại với 12 tháng trước:

```text
changePercent = (Giá trị hiện tại − Giá trị cũ) / Giá trị cũ × 100
Điểm biến động = clamp(50 + 2 × changePercent)
```

`changePercent` tính bằng điểm phần trăm: tăng 20% thì đưa số 20 vào công thức, không đưa 0,20.

| Biến động | Điểm biến động |
|---:|---:|
| Giảm từ 25% trở lên | 0 |
| Giảm 10% | 30 |
| Không đổi | 50 |
| Tăng 10% | 70 |
| Tăng 20% | 90 |
| Tăng từ 25% trở lên | 100 |

Giá cũ phải lớn hơn 0. Thiếu giá cũ hoặc giá cũ bằng 0 thì chưa đủ dữ liệu, không tự gán 50. Giá trị cũ và hiện tại cùng tiền tệ, ưu tiên cùng nguồn/phương pháp định giá.

Đã bổ sung `PlayerMarketValueHistory`: cầu thủ, ngày định giá, giá trị EUR, nguồn, độ tin cậy và thời điểm ghi nhận; nhập qua `/api/market-value-history` cho Admin. Chốt ngày 16/10/2026: với mỗi nguồn, lấy giá gần nhất không sau ngày đánh giá và giá gần nhất không sau ngày lùi 12 tháng. Hai mốc phải khác ngày, đã được ghi nhận trước thời điểm tính; không nội suy, không dùng giá tương lai và không ghép nguồn khác nhau. Thiếu hoặc nhiều cặp nguồn mơ hồ thì báo thiếu dữ liệu; có thể chọn rõ valuationSource. Trả cả ngày đích, ngày giá thực tế, tuổi bản định giá và độ dài kỳ so sánh; cảnh báo giá cũ. Chưa đặt giới hạn cũ tối đa hay tự nhân hệ số giảm điểm.

#### Điểm tuổi bán lại

| Tuổi tròn | Điểm tuổi bán lại |
|---|---:|
| Đến 20 | 100 |
| 21–24 | 90 |
| 25–27 | 80 |
| 28–30 | 60 |
| 31–33 | 40 |
| Từ 34 | 20 |

Bảng này khác bảng tuổi trong S: S xét tuổi để sử dụng, còn phần này dùng tuổi như một chỉ báo triển vọng bán lại. Chưa có quy tắc cho dữ liệu tuổi nằm ngoài phạm vi cầu thủ được hỗ trợ.

Ví dụ cầu thủ 23 tuổi, giá trị từ 20 lên 24 triệu:

- Tăng 20%: điểm biến động = 90.
- Tuổi 23: điểm tuổi bán lại = 90.
- Điểm bán lại = 0,60 × 90 + 0,40 × 90 = 90.

Đây là chỉ báo triển vọng giữ/tăng giá, không dự đoán chắc chắn giá bán hoặc lợi nhuận. Bảng tuổi và ngưỡng ±25% là tham số thiết kế, chưa được kiểm chứng bằng dữ liệu lịch sử.

### 5.3. Tổng hợp R

```text
R = wInjury × Điểm chấn thương + wResale × Điểm bán lại
wInjury + wResale = 1
```

Hai trọng số này chưa chốt. Cặp 60%/40% đã chốt ở mục bán lại là trọng số biến động/tuổi, không tự đồng nghĩa với trọng số chấn thương/bán lại của R.

## 6. Dữ liệu thiếu và kết quả cần giải thích

Không tự gán điểm trung tính 50 cho tiêu chí thiếu dữ liệu. Đề xuất trước đó về kéo phong độ về 50 đã bị bỏ.

Bản triển khai trả các điểm tính được, missing và complete=false nếu chưa tính đủ trụ cột; điểm tổng null, không lưu MatchResult. Không tự chia lại trọng số, gán điểm giả hoặc coi dữ liệu thiếu là cầu thủ kém. Thành phần trọng số 0 không ảnh hưởng phép cộng; cả ba điểm trụ cột vẫn cần có giá trị trước khi lưu lịch sử. Xem chi tiết trong [Matching API](api/README.md#matching).

Đầu ra thiết kế cần có điểm thành phần, dữ liệu gốc, số liệu/90, các mốc đã dùng, phần giới hạn điểm, dữ liệu còn thiếu và phiên bản cấu hình. Điều này giúp giải thích điểm thấp do chuyên môn, ít phút, tài chính hay thiếu thông tin.

## 7. Đối chiếu với database hiện tại

Đối chiếu ngày 15/10/2026 với `backend/prisma/schema.prisma` và migration `20261015111420_complete_matching_inputs`. Migration đã áp dụng vào PostgreSQL local. Đây là xác nhận có cấu trúc lưu, không khẳng định mọi cầu thủ đã có số liệu mới.

### 7.1. Dữ liệu gốc đã có trường lưu

| Nhóm | Thông số sử dụng | Model và trường hiện có | Ghi chú |
|---|---|---|---|
| F | Ngân sách mua | `ClubRequirement.budget` | Công thức cần giá trị lớn hơn 0 |
| F | Trần lương năm | `ClubRequirement.salaryLimit` | Công thức cần giá trị lớn hơn 0 |
| F | Lương năm hiện tại | `Contract.salaryPerYear` | Chưa phải lương đề nghị cho hợp đồng mới |
| F | Thời hạn hợp đồng | `Contract.startDate`, `endDate`, `status` | Tính thời hạn còn lại từ hợp đồng phù hợp |
| S | Vị trí CLB cần | `ClubRequirement.position` | Cần chuẩn hóa mã vị trí |
| S | Vị trí chính/phụ cầu thủ | `Player.position`, `secondaryPositions` | Đã nhập được qua API Player cho Admin |
| S/R | Ngày sinh để tính tuổi | `Player.dateOfBirth` | Không cần thêm cột tuổi |
| S | Khoảng tuổi yêu cầu | `ClubRequirement.minAge`, `maxAge` | Đã có nhưng cách dùng cùng bảng tuổi mới còn để mở |
| Phong độ | Mùa và số phút | `PlayerStats.season`, `minutesPlayed` | Số phút là đầu vào chấm thời lượng và mẫu số /90 |
| Phong độ | Bàn thắng | `PlayerStats.goals` | Đầu vào G/90 |
| Phong độ | Kiến tạo | `PlayerStats.assists` | Đầu vào A/90 |
| Phong độ | Tạo cơ hội | `PlayerStats.keyPasses` | Đầu vào K/90; nullable |
| Phong độ | Tắc bóng thành công | `PlayerStats.tacklesWon` | Đầu vào T/90; nullable |
| Phong độ | Cắt bóng | `PlayerStats.interceptions` | Đầu vào I/90; nullable |
| Phong độ | Chuyền thành công | `PlayerStats.passesCompleted` | Đầu vào P/90; nullable |
| Thống kê bổ sung | Tổng đường chuyền | `PlayerStats.passesAttempted` | Tính /90 và tỷ lệ chính xác; nullable |
| Thống kê bổ sung | Thẻ vàng, thẻ đỏ, số lần ra sân | `PlayerStats.yellowCards`, `redCards`, `appearances` | Thẻ có thể quy đổi /90 nhưng chưa nằm trong công thức chấm |
| R | Các đợt chấn thương | `InjuryHistory.playerId`, `injuryType`, `startDate`, `endDate` | Đủ dữ liệu ngày để tính các đợt đã được nhập; `endDate` nullable |
| R | Giá trị thị trường hiện tại | `Player.marketValue` | Trường cũ vẫn chỉ có giá trị hiện tại; ngày/nguồn lưu trong lịch sử mới |

Tất cả sáu chỉ số chuyên môn G/A/K/T/I/P và số phút đều đã có trường gốc. Không cần tạo thêm chỉ số bóng đá mới chỉ để chạy bảy công thức hiện tại. Tuy nhiên, trường đã tồn tại không bảo đảm đã có số liệu: K/T/I/P và tổng đường chuyền được phép null.

### 7.2. Dữ liệu đã bổ sung cho Matching

| Dữ liệu | Nơi lưu sau migration | Quy tắc và phạm vi |
|---|---|---|
| Vị trí phụ | `Player.secondaryPositions` | Mảng mã viết hoa, không trùng nhau hoặc vị trí chính; mặc định rỗng, không tự suy đoán |
| Lịch sử giá trị thị trường | `PlayerMarketValueHistory` | `playerId`, `valuedAt`, `marketValue`, `source`, `reliability`, `recordedAt`; giá trị EUR không âm; duy nhất cầu thủ/ngày/nguồn |
| Phí mua dự kiến | `MatchingInput.estimatedFee`, `feeSource` | Theo cầu thủ/yêu cầu CLB; phí EUR không âm; 0 là phí đã ước tính bằng 0, null là chưa biết |
| Lương năm dự kiến | `MatchingInput.expectedSalaryPerYear`, `salarySource` | EUR/năm cho hợp đồng dự kiến; không sửa nghĩa lương hợp đồng hiện tại |
| Phạm vi lịch sử chấn thương đã xác minh | `PlayerDataVerification.injuryCoveredFrom`, `injuryCoveredThrough`, `injuryVerifiedAt`, `injuryVerifiedById`, `injurySource` | Đủ cả khoảng ngày, ngày xác minh, người và nguồn; cửa sổ chấm phải được phạm vi này bao phủ thì mới kết luận hồ sơ đầy đủ |
| Trạng thái hợp đồng/tự do đã xác minh | `PlayerDataVerification.registrationStatus`, `registrationAsOf`, `registrationVerifiedAt`, `registrationVerifiedById`, `registrationSource` | UNKNOWN/CONTRACTED/FREE_AGENT; khác UNKNOWN phải có ngày và bằng chứng; thông tin có giá trị tại ngày ghi nhận, cần đối chiếu lại khi có hợp đồng mới |

`MatchingInput` duy nhất theo cặp yêu cầu/cầu thủ, có khóa ngoại ghép bảo đảm thuộc chủ yêu cầu. Cho phép biết riêng phí hoặc riêng lương, nhưng không tạo bản ghi trống cả hai; khoản đã biết phải có nguồn không rỗng. `updatedAt` là lần sửa, không tự tạo lịch sử đàm phán; `MatchResult.inputSnapshot` sẽ giữ đầu vào của từng lần chấm sau này.

`PlayerDataVerification` có tối đa một bản ghi mỗi cầu thủ. Không có bản ghi, hoặc bản ghi chưa xác minh, nghĩa là chưa biết. Hồ sơ xác minh cũ có thể hết tính cập nhật; bảng này không tự chứng minh trạng thái còn đúng mãi và không thay thế lịch sử hợp đồng/chấn thương.

Không dựng lịch sử giá từ `marketValue` cũ vì chưa biết ngày/nguồn. Không tự điền vị trí phụ, phí/lương mới hoặc dữ liệu xác minh cho các cầu thủ hiện có. Dữ liệu giả lập dùng để kiểm thử được rollback, không lưu vào dữ liệu người dùng.

### 7.3. Giá trị tính ra, không cần cột hoặc bảng riêng

| Giá trị | Cách lấy |
|---|---|
| Tuổi tại ngày đánh giá | Tính từ `Player.dateOfBirth` |
| Các chỉ số mỗi 90 phút | Tính từ thống kê tổng và `minutesPlayed` |
| Tỷ lệ chuyền chính xác | Tính từ `passesCompleted` và `passesAttempted` |
| Số tháng hợp đồng còn lại | Tính từ ngày đánh giá và `Contract.endDate` |
| Số ngày nghỉ trong hai năm | Cắt và gộp các khoảng `InjuryHistory` rồi tính ngày |
| Đang chấn thương tại ngày đánh giá | Suy từ khoảng ngày của đợt chấn thương; không chỉ kiểm tra `endDate` null khi đánh giá ngày quá khứ |
| Tỷ lệ tăng/giảm giá trị | Tính từ hai lần định giá sau khi có lịch sử |
| Điểm thành phần, điểm phong độ, F/S/R và tổng | Tính bằng engine; có thể lưu kết quả trong cấu trúc `MatchResult` đã có |

### 7.4. Cấu hình và nơi lưu kết quả đã có

| Nội dung | Trường hiện có | Còn phải làm |
|---|---|---|
| Trọng số tổng F/S/R | `ScoringConfig.financialWeight`, `squadWeight`, `riskWeight` | Nạp bộ cấu hình đã thống nhất |
| Trọng số thành phần | `ScoringConfig.criteriaWeights` dạng JSON | Chốt trọng số F/S/R con và quy ước tên khóa |
| Mốc A/B, khoảng tuổi/phút, hệ số, nhóm vị trí | `ScoringConfig.parameters` dạng JSON | Thiết kế và kiểm tra cấu trúc JSON; chưa cần cột riêng cho từng mốc |
| Phiên bản cấu hình | `ScoringConfig.version`, `isActive` | Engine chọn và lưu đúng cấu hình |
| Tổng điểm và F/S/R | `MatchResult.totalScore`, `financialScore`, `squadScore`, `riskScore` | Đã có engine tính và API lưu khi đủ dữ liệu; cần cấu hình S/R và nhập dữ liệu thật |
| Chi tiết điểm, đầu vào, giải thích | `MatchResult.criteriaScores`, `inputSnapshot`, `prosCons` dạng JSON | Thống nhất cấu trúc và xử lý dữ liệu thiếu trước khi lưu kết quả đầy đủ |

Có sẵn cột JSON chỉ có nghĩa có nơi lưu, chưa có nghĩa đã tạo các mốc hoặc đã chạy engine. Bảng nhóm vị trí có thể nằm trong cấu hình; vị trí phụ của từng cầu thủ đã có API nhưng vẫn cần nhập dữ liệu thực tế.

Đã hỗ trợ mã GK trong hồ sơ và điểm khớp vị trí, nhưng thống kê/công thức phong độ thủ môn vẫn cần chốt riêng; thiếu công thức thì báo chưa đủ dữ liệu. Mức độ/tái phát chấn thương và lịch sử từng trận chưa dùng trong công thức hiện tại.

Đã triển khai cấu trúc lưu, migration, API nhập/sửa và engine tính/lưu Matching. Vị trí phụ qua `/api/players`, lịch sử giá qua `/api/market-value-history`, ước tính tài chính qua `/api/matching-inputs`, xác minh qua `/api/player-data-verifications`. API Matching trong [Matching API](api/README.md#matching); bản thử F trong [hướng dẫn thử F](testing/README.md#financial-fit). Chưa tự nhập dữ liệu cầu thủ hoặc kích hoạt cấu hình chưa chốt S/R.

## 8. Những quyết định còn thiếu trước khi triển khai đầy đủ

1. Trọng số ba thành phần của S và hai thành phần của R; F đã có bộ 45/35/20 để thử.
2. Nguồn phí mua dự kiến và lương dùng cho thương vụ; xử lý ngân sách/trần lương bằng 0.
3. Có mở rộng cách xử lý thiếu dữ liệu sau này không; bản hiện tại trả chưa đầy đủ và không lưu điểm giả.
4. Bảng nhóm vị trí; vai trò chấm phong độ hiện do caller chọn rõ PRIMARY/REQUIRED.
5. Bộ lọc min/max tuổi còn được dùng thế nào; quy tắc tuổi dưới phạm vi hỗ trợ.
6. Cách đếm ngày chấn thương và chọn lịch sử giá 12 tháng; quy đổi tháng hợp đồng đã có quy ước trong bản thử F.
7. Chọn mùa thống kê, xử lý mùa đang diễn ra và kiểm tra lại trần điểm với cầu thủ ít phút.
8. Hiệu chỉnh bộ mốc và trọng số chuyên môn trên dữ liệu; chưa coi điểm thu được là thước đo chất lượng đã được kiểm chứng.
9. Điều kiện loại bắt buộc và các mức khuyến nghị cho điểm tổng. Không tự khôi phục luật cũ hoặc lấy các ngưỡng còn mâu thuẫn trong tài liệu khác.

Các tham số sau khi thống nhất cần được lưu theo phiên bản `ScoringConfig`; kết quả lưu kèm phiên bản và dữ liệu đầu vào để xem lại đúng cách tính cũ.
