# Hướng dẫn thử API và DEMO

Chọn mục để đọc đúng phần cần dùng:

- [Thử F S R](#scoring)
- [Các bộ DEMO](#demo)
- [Xem bốn chiến lược V3](#v3-strategies)

## Scoring

Thử F S R.

### Financial Fit

Financial Fit.

Phạm vi: chỉ tính F trên thang 0–100, với trọng số 45% phí mua, 35% lương và 20% thời hạn hợp đồng còn lại. Chưa tính S/R, điểm Matching tổng, xếp hạng, mức khuyến nghị hoặc ghi MatchResult. Không thay đổi dữ liệu đầu vào.

#### 1. Xem ngay trên trình duyệt

Mở lại `/login`, dùng phiên đăng nhập hiện tại, mở mục **Thử Financial Fit — chỉ tính F** bên dưới bộ thử GET.

- Bấm **Tính F từ các số trên** với số điền sẵn: phí 180 triệu/ngân sách 200 triệu, lương 27 triệu/trần 30 triệu euro/năm, hợp đồng còn 48 tháng. Kết quả F = 79, điểm phí 92, điểm lương 96, điểm hợp đồng 20.
- Các số điền sẵn là giả lập để minh họa Haaland, không phải dữ liệu thực tế và không tạo cầu thủ trong DB.
- Có thể sửa số, nhập tháng lẻ, hoặc để trống phí/lương/tháng để thử thiếu dữ liệu.
- Hoặc nhập ID cầu thủ và ID yêu cầu CLB, bấm **Tính F từ dữ liệu đã lưu**.
- Hai chế độ đều dùng token hiện tại. Đăng xuất hoặc hết phiên sẽ xóa kết quả đang hiển thị.

#### 2. Công thức đang dùng

```text
clamp(x) = max(0, min(100, x))

Điểm phí      = clamp(200 − 120 × estimatedFee / budget)
Điểm lương    = clamp(160 × (1,5 − expectedSalaryPerYear / salaryLimit))
Điểm hợp đồng = clamp(100 − 100 × remainingMonths / 60)

F = 0,45 × Điểm phí + 0,35 × Điểm lương + 0,20 × Điểm hợp đồng
```

Ngân sách/trần lương phải lớn hơn 0. Phí/lương/tháng không âm. Phí mua và lương vượt giới hạn vẫn được chấm; không tự loại cầu thủ. Tính bằng Decimal, cộng theo độ chính xác đầy đủ và làm tròn hai chữ số khi trả kết quả.

Bản thử dùng cấu hình cố định có tên `financial-trial-v1` trong `src/config/financial-scoring.ts`. Chưa đọc cấu hình active từ `ScoringConfig`; thay đổi cấu hình active qua API chưa thay đổi phép tính F thử này. Không tự tạo/kích hoạt một cấu hình đầy đủ với trọng số S/R chưa chốt.

#### 3. API thử số trực tiếp

```http
POST /api/matching/financial/preview
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Scout và Admin đều được dùng. Body:

```json
{
  "budget":"200000000",
  "estimatedFee":"180000000",
  "salaryLimit":"30000000",
  "expectedSalaryPerYear":"27000000",
  "remainingMonths":48
}
```

- Tiền: euro; lương: euro/năm. Nhận chuỗi hoặc số, tối đa 13 chữ số nguyên và 2 số thập phân.
- remainingMonths là số JSON không âm, cho phép số lẻ, không nhận chuỗi.
- budget và salaryLimit bắt buộc. Ba đầu vào còn lại có thể bỏ qua hoặc null nếu chưa biết; 0 là giá trị đã biết bằng 0.
- Không nhận điểm, trọng số, userId hoặc tùy chọn ghi kết quả từ client.

Response rút gọn (thực tế có thêm inputs và missing):

```json
{
  "status":"success",
  "data":{
    "mode":"preview",
    "configVersion":"financial-trial-v1",
    "complete":true,
    "financialScore":79,
    "components":{
      "fee":{"score":92,"weight":0.45,"contribution":41.4},
      "salary":{"score":96,"weight":0.35,"contribution":33.6},
      "contract":{"score":20,"weight":0.2,"contribution":4}
    },
    "saved":false
  }
}
```

score là điểm thành phần; contribution là phần đóng góp vào F, không phải điểm Matching tổng. Tổng contribution hiển thị có thể lệch rất nhỏ do làm tròn; F luôn tính từ số chưa làm tròn.

#### 4. API dùng dữ liệu database

```http
POST /api/matching/financial/evaluate
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{"playerId":4,"requirementId":3}
```

Phải dùng ID có thật. Scout chỉ dùng yêu cầu CLB thuộc mình; Admin dùng tất cả. Ngoài phạm vi trả 404, không tiết lộ dữ liệu riêng của người khác.

Nguồn đầu vào:

| Đầu vào | Nguồn |
|---|---|
| budget/salaryLimit | ClubRequirement |
| estimatedFee/expectedSalaryPerYear | MatchingInput của đúng cặp cầu thủ/yêu cầu |
| remainingMonths | Hợp đồng ACTIVE bao phủ ngày hiện tại, tính từ endDate |
| Cầu thủ tự do khi không có hợp đồng phù hợp | PlayerDataVerification FREE_AGENT với registrationAsOf đúng ngày hiện tại |

Ngày đánh giá là ngày hiện tại theo Asia/Ho_Chi_Minh do server lấy; không nhận ngày lịch sử/tương lai hoặc ghi đè số tiền/tháng trong body.

- Không tự thay phí dự kiến bằng marketValue, releaseClause hoặc phí thương vụ cũ.
- Không tự thay lương dự kiến thiếu bằng lương hợp đồng hiện tại.
- Thiếu hợp đồng không tự coi là cầu thủ tự do. Với bản thử, xác nhận tự do từ ngày cũ chưa đủ để kết luận trạng thái hôm nay; cần xác minh lại.
- Xác nhận tự do không tự điền phí/lương bằng 0; hai khoản vẫn phải có giá trị ước tính rõ ràng.
- Không truy vấn thống kê phong độ hoặc tính S/R.

Response có thêm player, requirementId, evaluatedOn, nguồn dữ liệu và notes giải thích phần thiếu.

##### Quy ước tháng lẻ

Tính số tháng lịch nguyên từ ngày đánh giá đến endDate, sau đó cộng phần ngày còn lại chia số ngày của khoảng tháng lịch kế tiếp. Ngày cuối tháng được chặn về ngày cuối hợp lệ khi tháng đích ngắn hơn. Ví dụ 31/01/2025 đến 28/02/2025 là 1 tháng; không mặc định mọi tháng đều có 30 ngày. Không làm tròn số tháng trước khi chấm.

#### 5. Dữ liệu thiếu và mã lỗi

Thiếu bất kỳ phí, lương hoặc thời hạn nào: trả HTTP 200 với `complete: false`, `financialScore: null`, danh sách `missing`. Các điểm thành phần tính được vẫn trả về; thành phần thiếu có score/contribution null. Không tự gán 0/50 hoặc chia lại trọng số.

Đây là chính sách an toàn của bản thử F; chính sách cho toàn bộ Matching sau này vẫn cần thống nhất.

- 400: body sai, số âm, ngân sách/trần lương bằng 0, trường không được phép.
- 401: chưa đăng nhập hoặc hết phiên.
- 404: cầu thủ/yêu cầu không tồn tại hoặc ngoài phạm vi sở hữu.

Không tạo lịch sử Matching ở cả hai API, kể cả khi tính được F đầy đủ. Không cần migration mới.

#### 6. Kiểm thử

Trong thư mục backend:

```sh
npm run test:financial
npm run test:financial-api
```

Kiểm tra ví dụ 79 điểm, các ngưỡng và số lẻ, giới hạn 0–100, giá tăng điểm không tăng, tháng lịch, dữ liệu thiếu/0, phân quyền/ownership, không thay đầu vào bằng dữ liệu khác và không ghi MatchResult. Test API dùng fixture được dọn sau khi chạy; test công thức không cần PostgreSQL.

### Squad Fit

Squad Fit và phong độ.

Mở `/login`, dùng phiên hiện có, mở **Thử điểm S — phong độ từ thống kê**. ID điền sẵn `1700` là **ID cầu thủ Haaland**, không phải ID thống kê `1621`. Bấm **Tính từ thống kê đã lưu** để xem tên, vị trí, điểm tuổi, điểm khớp vị trí và bảng tổng mùa → /90 phút → điểm từng chỉ số → trọng số phong độ → điểm trước/sau giới hạn số phút.

Mùa hỗ trợ: **2025/2026**, đã kết thúc trong phạm vi năm giải đang sử dụng sau khi thu phạm vi ngày 19/10/2026. Phong độ luôn chấm theo **vị trí chính** của cầu thủ, dùng lại `scoreForm` và `matchingRules` của engine. Đây là bản thử các mốc khởi đầu trong đặc tả, không đọc hoặc thay cấu hình active.

**Điểm phong độ chỉ là một thành phần của S.** Để trống ba trọng số sẽ trả điểm phong độ và các điểm thành phần, `squadScore=null`. Muốn thử ghép S, điền đủ trọng số vị trí/tuổi/phong độ, mỗi số từ 0 đến 100 và tổng 100%. Những số nhập chỉ có tác dụng cho lần thử. Không tự chọn trọng số còn chưa chốt, không tạo yêu cầu CLB, không lưu MatchResult.

Vị trí yêu cầu mặc định trùng vị trí chính. Có thể chọn vị trí khác để thử khớp vị trí; công thức phong độ vẫn theo vị trí chính. Trường hợp cần bảng nhóm vị trí chưa khai báo trả thiếu cấu hình thay vì tự cho 0/50. Tuổi tính theo ngày đánh giá ở Việt Nam. Thiếu chỉ số cần cho vai trò, không có phút thi đấu hoặc GK chưa có công thức thì phong độ là `null`; không đổi thành 0 hay chia lại trọng số.

#### API

`POST /api/matching/squad/preview` — cần đăng nhập, cả Scout và Admin đều được đọc dữ liệu cầu thủ. Không nhận `userId`, `save`, điểm tự khai báo hoặc dữ liệu thống kê thay thế.

```json
{
  "playerId": 1700,
  "season": "2025/2026"
}
```

Có thể thêm `requiredPosition` và `weights` (đơn vị %). Ví dụ **trọng số thử do người gọi lựa chọn**, không phải mặc định sản phẩm:

```json
{
  "playerId": 1700,
  "season": "2025/2026",
  "requiredPosition": "ST",
  "weights": { "position": 20, "age": 20, "form": 60 }
}
```

Response có `player.name`, `statsId`, `formRole`, `scores`, `formScore`, `squadScore`, `missing`, `stats`, `form` và `saved=false`. `form` gồm các tổng đã quy đổi /90, mốc A/B, điểm chỉ số, trọng số, trần theo phút và lý do thiếu. `complete` chỉ nói điểm S của bản thử đã tính được, không có nghĩa đủ toàn bộ F/S/R.

Kiểm tra: `npm run test:squad-preview`, `npm run test:matching`, `npx tsc --noEmit`, `node --check public/login.js`. Test API có đăng nhập, điểm số xác định, trọng số thử, null/GK/0 phút, dữ liệu thật Haaland và xác nhận không thay đổi cấu hình/kết quả đã lưu. Fixture được dọn sau chạy.

### Risk Future

Risk and Future.

Tải lại `/login`, mở **Thử điểm R — chấn thương và bán lại**, bên dưới S. Không cần yêu cầu CLB hay cấu hình active. R càng cao nghĩa là lịch sử chấn thương và triển vọng bán lại càng thuận lợi.

Đã thêm [bộ DEMO chấn thương cho 10 cầu thủ](README.md#injury-demo): chọn theo tên ngay trên form, tính với chấn thương giả lập và lịch sử giá đã lưu. Kết quả ghi rõ DEMO; không trộn mẫu vào lịch sử thật.

#### Hai cách thử

**Dữ liệu đã lưu:** nhập ID cầu thủ (Haaland `1700`), nguồn định giá có thể để trống nếu chỉ có một nguồn phù hợp. Hiện tên, tuổi, hai điểm thành phần, cửa sổ chấn thương và hai mốc giá kèm ngày/nguồn thực tế. Chưa xác minh đủ lịch sử chấn thương hai năm thì giữ điểm chấn thương `null`; không có bản ghi không đồng nghĩa không từng chấn thương. Nếu giá có nhiều nguồn phù hợp, chọn rõ nguồn thay vì tự ghép.

**Số giả lập:** mở mục **Hoặc thử công thức bằng số giả lập**. Ví dụ điền sẵn tuổi 23, nghỉ 45 ngày trong hai năm, không đang chấn thương, giá cũ 20 triệu và giá mới 24 triệu EUR. Kết quả: điểm chấn thương 80, biến động giá +20% → điểm biến động 90, điểm tuổi bán lại 90 → điểm bán lại 90. Đây không phải dữ liệu của Haaland hay hồ sơ thật nào và không được lưu. Số ngày nghỉ giả định đã gộp trùng; hai mốc giá giả định cùng nguồn, đơn vị EUR, cách nhau 12 tháng.

Để trống cả hai trọng số thì chỉ xem hai điểm thành phần. Muốn ghép R, điền chấn thương/bán lại có tổng 100%. Ví dụ thử 50/50 cho bộ giả lập trên: **R = 85**. Đây là lựa chọn cho lần thử, không phải trọng số đã chốt của hệ thống. Cặp 60/40 bên trong điểm bán lại vẫn là trọng số biến động/tuổi đã chốt, khác hai trọng số ghép R.

#### API (Scout/Admin đăng nhập)

`POST /api/matching/risk/evaluate` — đọc dữ liệu thật:

```json
{ "playerId": 1700, "weights": { "injury": 50, "resale": 50 } }
```

`weights` không bắt buộc. Có thể thêm `valuationSource` để chọn nguồn cụ thể. Tuổi/cửa sổ chấn thương tính tại ngày đánh giá ở Việt Nam. Quy tắc lấy giá giữ nguyên engine: gần nhất không sau ngày đánh giá và gần nhất không sau ngày lùi 12 tháng, cùng nguồn, khác ngày, được ghi nhận trước thời điểm tính. Hiện rõ ngày nguồn, độ cũ và kỳ đối chiếu thực tế; không giả định giá gần nhất là giá hôm nay.

`POST /api/matching/risk/preview` — tính số giả lập:

```json
{
  "age": 23,
  "daysMissed": 45,
  "ongoing": false,
  "priorValue": "20000000",
  "currentValue": "24000000",
  "weights": { "injury": 50, "resale": 50 }
}
```

Tuổi/ngày nghỉ/giá có thể để `null` nếu chưa biết. Giá cũ 0 không tính được biến động; giá mới 0 vẫn là số liệu hợp lệ và được chấm theo công thức. Đang chấn thương thì trần điểm chấn thương là 50. Thiếu điểm có trọng số dương thì R giữ `null`; không chia lại trọng số. Tổng hai trọng số phải chính xác 100%. Response ghi rõ `mode=DATABASE` hoặc `SIMULATION`, `saved=false`, `riskScore`, `scores`, chi tiết chấn thương/bán lại và cảnh báo. `complete` chỉ nói tính đủ R, không đại diện toàn bộ F/S/R.

Hai API dùng lại công thức của engine, không ghi hồ sơ/xác minh/định giá, không lưu MatchResult và không thay cấu hình active. Không nhận `save`, điểm tự khai báo hoặc số giả lập ở API đọc dữ liệu thật.

#### Kiểm tra

Đã chạy `npm run test:risk-preview`, `npm run test:squad-preview`, `npm run test:matching`, `npx tsc --noEmit`, `node --check public/login.js`.

Test R bao gồm đăng nhập Scout, các ranh giới ngày nghỉ/trần đang chấn thương, gộp ngày trùng, dữ liệu thiếu so với 0, hai mốc giá cùng nguồn và nguồn mơ hồ, trọng số thử, đọc Haaland, không lưu kết quả/cấu hình. Fixture được dọn sau chạy.

## Demo

Các bộ DEMO.

### Matching Demo

Bộ Matching DEMO.

> 21/10/2026: cầu thủ/CLB và các bản ghi mẫu đã được xóa theo yêu cầu. ID trong manifest là lịch sử, không còn dùng để test. Chỉ chạy seed lại nếu chủ động muốn tạo lại dữ liệu giả.

Đã lưu vào PostgreSQL local một cầu thủ **DEMO - Nguyen Minh An**, ST, có vị trí phụ LW/RW. Tất cả thông tin bóng đá, CLB, nguồn và xác minh trong bộ này đều **giả lập**, không phải hồ sơ thật. Tài khoản và phiên đăng nhập dùng tài khoản admin có sẵn; không tạo mật khẩu hay phiên đăng nhập mẫu cho người dùng.

#### Thử ngay trên trang đang dùng

1. Mở hoặc refresh `http://localhost:3000/login`. Giữ phiên admin `quocanh123` đang đăng nhập; nếu hết hạn thì đăng nhập lại bằng mật khẩu của bạn.
2. Mở **Thử Matching Engine — F, S, R** và nhập:

| Ô trên form | Giá trị đã lưu ngày 15/10/2026 |
|---|---|
| ID cầu thủ | **93** |
| ID yêu cầu CLB | **87** |
| Mùa giải | **2025/2026** |
| Vai trò chấm phong độ | **PRIMARY — vị trí chính** |
| ID cấu hình | **39** — cần nhập vì demo chưa active |
| Nguồn định giá | `DEMO - synthetic football data` hoặc để trống vì chỉ có một nguồn |
| Lưu lịch sử | Bỏ chọn để thử; chọn nếu muốn lưu thêm một lần đánh giá |

3. Bấm nút tính. Kết quả ngày tạo mẫu: **F 82,6; S 90,4; R 96,8; tổng 88,56/100**. `complete` phải là `true`, `missing` là `[]`.
4. Trong mục **Thử API backend**, chọn lịch sử kết quả, nhập ID **14** để xem lần đã lưu sẵn. Bấm tính với lưu lịch sử sẽ trả ID mới.

Đây là ID trong máy hiện tại, không phải ID cố định của chương trình. [matching-demo-data.json](matching-demo-data.json) ghi ID, request, điểm và ngày chuẩn bị mới nhất.

#### Dữ liệu đã liên kết

| Bảng / thực thể | Dữ liệu mẫu |
|---|---|
| `users` | Dùng admin hiện có ID 15 làm chủ yêu cầu, shortlist, đầu vào và người xác minh |
| `auth_sessions` | Dùng phiên có được khi bạn đăng nhập; seed không phát sinh token cho bạn |
| `players` | ID 93: sinh 15/01/2001, Vietnam, ST, phụ LW/RW, 185 cm, chân phải, giá 50 triệu EUR |
| `clubs` | CLB cũ 104, CLB hiện tại 105, CLB muốn mua 106; có quốc gia, giải đấu, năm thành lập |
| `contracts` | ID 14 đã hết hạn với CLB cũ; ID 15 ACTIVE với CLB hiện tại, còn 48 tháng vào ngày tạo; lương hiện tại 8 triệu EUR/năm, điều khoản giải phóng 80 triệu EUR |
| `transfers` | ID 12: thương vụ PERMANENT từ CLB cũ sang CLB hiện tại, phí 35 triệu EUR, có ngày và nguồn DEMO |
| `player_stats` | ID 14, mùa 2025/2026: 30 trận, 2250 phút, 15 bàn, 5 kiến tạo, 3 thẻ vàng, 0 thẻ đỏ, 18 tắc bóng thắng, 10 cắt bóng, 25 key pass, 600/750 đường chuyền |
| `injury_histories` | ID 3: bong gân cổ chân giả lập, nghỉ 20 ngày, đã hồi phục |
| `player_data_verifications` | Player 93: phạm vi lịch sử chấn thương đủ hai năm; đăng ký CONTRACTED; có ngày, nguồn và người xác minh mẫu |
| `player_market_value_histories` | ID 32 và 33: 40 triệu EUR một năm trước và 50 triệu EUR ngày đánh giá, cùng nguồn; tăng 25% |
| `club_requirements` | ID 87: CLB mua cần ST, tuổi 20–30, ngân sách 60 triệu EUR, trần lương 10 triệu EUR/năm, ưu tiên 1 |
| `matching_inputs` | ID 34: phí mua dự kiến 50 triệu EUR, lương đề nghị 9 triệu EUR/năm, có nguồn cho cả hai |
| `shortlist_lists` | ID 28: danh sách ST mẫu của admin |
| `shortlists` | ID 38: cầu thủ 93 trong danh sách 28, gắn yêu cầu 87, ưu tiên 1 và ghi chú |
| `notifications` | ID 15: thông báo chấn thương mẫu liên kết cầu thủ/chủ danh sách; `readAt=null` nghĩa là chưa đọc |
| `scoring_configs` | ID 39: cấu hình DEMO riêng, đầy đủ công thức/mốc/bảng/trọng số; **không kích hoạt mặc định** |
| `match_results` | ID 14: engine tự tính và lưu F/S/R, điểm tổng, điểm tiêu chí, Pros/Cons, snapshot và ngày đánh giá |
| `audit_logs` | Nhật ký tạo dữ liệu mẫu, xác minh và lưu kết quả, liên kết người thực hiện |

`_prisma_migrations` là bảng quản lý migration của Prisma, không phải dữ liệu cầu thủ và không cần thêm bản ghi mẫu. Các trường cho phép null vẫn giữ null khi có ý nghĩa, ví dụ thông báo chưa đọc.

#### Kiểm tra cách ra điểm

Cấu hình DEMO dùng trọng số **tạm cho việc test**, chưa thay thế quyết định cuối cùng:

- Tổng: F 40%, S 40%, R 20%.
- F: phí 45%, lương 35%, hợp đồng 20% theo bản đã chốt.
- S: vị trí 20%, tuổi 20%, phong độ 60%.
- R: chấn thương 60%, bán lại 40%. Bên trong bán lại vẫn giữ biến động giá 60% + tuổi 40% đã chốt.

Tính vào ngày 15/10/2026:

- F: phí = `clamp(200 − 120 × 50/60) = 100`; lương = `160 × (1,5 − 9/10) = 96`; hợp đồng = `100 − 100 × 48/60 = 20`. F = **82,6**.
- /90: bàn = **0,6**, kiến tạo = **0,2**, key pass = **1**. Cả ba đạt mốc A nên mỗi điểm chỉ số = 80; 2250 phút đạt 100. Phong độ ST = `20% × 100 + 50% × 80 + 20% × 80 + 10% × 80` = **84**.
- S: ST khớp vị trí = 100, tuổi 25 = 100, phong độ = 84. S = **90,4**.
- R: 20 ngày chấn thương, đã hồi phục, đủ phạm vi xác minh ⇒ 100; giá tăng 25% ⇒ điểm biến động 100; tuổi bán lại 25 ⇒ 80. Bán lại = **92**, R = **96,8**.
- Tổng = `0,4 × 82,6 + 0,4 × 90,4 + 0,2 × 96,8` = **88,56**.

Nguồn định giá/chuyển nhượng ghi `UNKNOWN` kèm chữ DEMO: không gắn nhãn nguồn chính thức cho số liệu bịa. Cảnh báo nguồn không làm `complete` thành false.

#### Dùng lại vào ngày khác

Engine dùng hai giá gần nhất không sau các ngày đích, nhưng vẫn cần xác minh chấn thương bao phủ tới ngày đánh giá. Nếu test vào ngày khác và muốn làm mới bằng chứng của riêng bộ mẫu này, trong thư mục `backend` chạy:

```sh
npm run seed:matching -- --owner-id 15
```

Script dùng lại bộ DEMO đã ghi trong manifest AuditLog, bổ sung hai mốc giá và cập nhật xác minh của riêng mẫu này. Không tạo trùng cầu thủ/CLB/yêu cầu; không thay dữ liệu cũ ngoài DEMO hoặc cấu hình active. Không ghi đè thống kê/giá bạn đã sửa thủ công. Hợp đồng và tuổi tiếp tục trôi theo ngày thực nên điểm F/S/R có thể khác ngày tạo; kết quả mới ghi trong JSON. Cùng ngày và cùng tiêu chí thì dùng lại lịch sử đã lưu; bấm lưu trên form chủ động tạo thêm lịch sử.

Kiểm tra bộ mẫu bằng HTTP thật và mô phỏng submit form hiện có:

```sh
npm run test:matching-demo
```

Kiểm tra tạo tài khoản admin tạm riêng rồi xóa sau khi chạy; không đổi mật khẩu hay phiên đăng nhập đang dùng của bạn. Không phải kiểm tra giao diện bằng trình duyệt trực quan.

### Injury Demo

Chấn thương giả lập.

**Toàn bộ số ngày nghỉ và trạng thái chấn thương trong bảng dưới là tự tạo để thử công thức, không phải lịch sử thật hoặc đánh giá y tế của cầu thủ.** Không dùng làm bằng chứng xác minh dữ liệu. Bộ mẫu chỉ có tổng ngày nghỉ giả định trong hai năm, không có các đợt chấn thương thật hay ngày hồi phục thật.

| Cầu thủ | Mã demo | Tổng ngày nghỉ GIẢ LẬP | Đang chấn thương GIẢ LẬP | Điểm chấn thương DEMO |
|---|---|---:|---|---:|
| Erling Haaland | haaland | 45 | Không | 80 |
| Kylian Mbappé | mbappe | 20 | Không | 100 |
| Mohamed Salah | salah | 75 | Không | 80 |
| Virgil van Dijk | van-dijk | 110 | Không | 60 |
| Bukayo Saka | saka | 155 | Có | 50 |
| Jude Bellingham | bellingham | 95 | Không | 60 |
| Vinicius Junior | vinicius | 35 | Không | 80 |
| Rodri | rodri | 280 | Có | 20 |
| William Saliba | saliba | 0 | Không | 100 |
| Bruno Fernandes | bruno-fernandes | 190 | Không | 40 |

Các tình huống được đặt để thử các mức điểm và trần đang chấn thương, không suy luận từ phong độ hay tin tức của những người này. Tuổi và lịch sử định giá vẫn đọc từ database như API R thật, kèm nguồn/ngày thực tế. Vì vậy đây là **kết quả kết hợp đầu vào thật và chấn thương giả lập**, không phải điểm R thật của cầu thủ.

#### Cách dùng

1. Tải lại `/login`, mở **Thử điểm R — chấn thương và bán lại**.
2. Nhập hai trọng số thử tổng 100%, ví dụ chấn thương 50 / bán lại 50. Đây không phải mặc định đã chốt.
3. Trong **Bộ DEMO chấn thương — 10 cầu thủ**, chọn theo tên rồi bấm **Tính R với chấn thương DEMO**.

Với snapshot local ngày 19/10/2026, Haaland DEMO có điểm chấn thương 80, bán lại 75,33 và R theo trọng số thử 50/50 là **77,67**. Bộ số giả lập nhập tay 23 tuổi/20→24 triệu trước đây là một tình huống khác nên cho kết quả khác.

#### Lưu trữ và API

Nguồn mẫu là `src/config/risk-injury-demo.ts`, nằm trong mã nguồn để người tải repo dùng lại sau khi nhập hồ sơ và lịch sử giá. Ghép hồ sơ bằng `transfermarktId`, không phụ thuộc ID local của máy. Không ghi mẫu vào `injury_histories` hay `player_data_verifications`, không đánh dấu verified, không cần migration hoặc lệnh seed.

- `GET /api/matching/risk/demo`: danh sách 10 tình huống, tên/ID local khi có, `available=false` nếu chưa nhập hồ sơ nguồn.
- `POST /api/matching/risk/demo`: body `{"demoId":"haaland","weights":{"injury":50,"resale":50}}`. `weights` không bắt buộc; có thể chỉ rõ `valuationSource` như API thật. Không cho body sửa ngày nghỉ, ID cầu thủ hoặc gửi `save`.
- Hai API cần đăng nhập Scout/Admin. Response đánh dấu `mode=DEMO`, `injury.simulated=true`, `coverageVerified=false`, `saved=false`, có cảnh báo dữ liệu giả.
- `/risk/evaluate` và Matching Engine chính vẫn đọc dữ liệu thật; không tự sử dụng bộ demo, không nhận cờ demo hoặc tự lấp phần thiếu.
- Không lưu điểm R demo vào MatchResult hoặc thay cấu hình active. Thiếu dữ liệu bán lại vẫn giữ null, không tự tạo giá giả.

`npm run test:risk-preview` đã thử đủ 10 mẫu trên database local, kiểm tra nhãn demo/nguồn giá, đối chiếu với API thật và so sánh toàn bộ lịch sử chấn thương/xác minh trước và sau để xác nhận không bị ghi đè.

<a id="v3-strategies"></a>

## Xem bốn chiến lược V3 trên trang test

Mở `/login`, đăng nhập rồi xem mục **Matching V3 — Giai đoạn 1** ngay dưới thông tin tài khoản. Chọn **Chiến lược chuyển nhượng** để xem trọng số lấy từ backend:

| Chiến lược | F | S | R |
| --- | ---: | ---: | ---: |
| Tiết kiệm / Moneyball | 50% | 30% | 20% |
| Cân bằng | 30% | 50% | 20% |
| Đầu tư dài hạn | 20% | 30% | 50% |
| Cần ngay vai trò | 20% | 70% | 10% |

Đây là phần xem cấu hình của giai đoạn 1, chưa tính/lưu điểm V3. Các form F/S/R bên dưới vẫn dùng phiên bản cũ. **Tải lại cấu hình V3** đọc lại API bằng phiên đăng nhập hiện tại; nếu phiên hết hạn, trang yêu cầu đăng nhập lại.

