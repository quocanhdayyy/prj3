# API backend

Chọn mục để đọc đúng phần cần dùng:

- [Xác thực và phân quyền](#access)
- [API quản lý thực thể](#entities)
- [Tính điểm và lưu kết quả Matching](#matching)
- [Tự tìm ứng viên](#search)
- [Cấu hình và đầu vào V3 — giai đoạn 1](../data/README.md#v3-stage-1)

## Access

Xác thực và phân quyền.

Đăng nhập bằng `POST /api/auth/login` với `{ "email": "...", "password": "..." }`.
Gửi `Authorization: Bearer <accessToken>` cho mọi API dữ liệu. Token có hiệu lực 8 giờ.
`GET /api/auth/me` trả tài khoản; `POST /api/auth/logout` hủy token.
`GET /api/health` và đăng nhập không cần token. Chưa có đăng ký công khai.

| Nhóm API | SCOUT | ADMIN |
| --- | --- | --- |
| clubs, players, contracts, player-stats, injury-history | Chỉ GET | CRUD |
| users | Không truy cập; dùng auth/me xem mình | CRUD |
| club-requirements, shortlists | CRUD dữ liệu của mình | CRUD tất cả |

POST nhu cầu và Shortlist tự lấy chủ sở hữu từ token, kể cả khi Admin tạo mới.
**Không gửi `userId` trong body**. Nếu gửi, API trả 400.
PATCH không đổi chủ sở hữu. API danh sách của Scout chỉ trả dữ liệu của Scout đó.
ID cá nhân của người khác trả 404 để không tiết lộ sự tồn tại của dữ liệu.
401 = thiếu/sai token; 403 = không có quyền; 404 = không tìm thấy bản ghi trong phạm vi được phép.

API `/api/player-stats/:id` dùng **ID thống kê**, trả `playerId` và `playerName` để nhận diện cầu thủ. Thống kê quan sát giữ nguyên; `estimate` chứa ước tính cơ bản cũ và `metrics` chứa [đầu vào V3](../data/README.md#v3-metrics). Mỗi `metrics.values.<chỉ_số>` có `value`, `unit`, `status`, `basis` và căn cứ. `metrics.stale=true` khi hồ sơ/thống kê nền thay đổi; cần chạy lại bước chuẩn bị trước khi dùng. Sửa thống kê qua API xóa cả hai bộ suy luận cũ. Các công thức Matching hiện tại chưa tự sử dụng `metrics`.

API danh sách `/api/player-stats` giữ dữ liệu cơ bản và `estimate`; phần `metrics` chỉ trả trong API chi tiết để tránh tải bằng chứng của toàn bộ cầu thủ cùng lúc.

V3 giai đoạn 1 bổ sung `GET /api/matching/v3/template` (cần token), trả 35 vai trò, cấu hình mẫu và hợp đồng chỉ số; `scoringAvailable=false`. Admin có thể nhập `positionMinutes` kèm `positionMinutesSource` qua CRUD thống kê, và `bodyRegion` qua `/api/injury-history`. Chỉ sửa phút theo vị trí không xóa metrics; sửa thống kê nền sẽ xóa bộ suy luận. Xem [quy tắc và ví dụ](../data/README.md#v3-stage-1). Các endpoint Matching đang có bên dưới vẫn dùng công thức cũ.

### Admin đầu tiên

Trong thư mục backend chạy `npm run admin:create`, nhập username, email và mật khẩu.
Mật khẩu không hiển thị trên Terminal. Lệnh chỉ tạo Admin đầu tiên và không sửa tài khoản có sẵn.
Sau đó Admin có thể tạo tài khoản khác qua POST /api/users.

### Ví dụ body mới

POST /api/club-requirements:
```json
{"clubId":1,"position":"CM","minAge":18,"maxAge":25,"budget":"30000000","salaryLimit":"2000000","priority":1}
```

POST /api/shortlists:
```json
{"playerId":4,"requirementId":3,"note":"Theo dõi"}
```

Phải dùng nhu cầu thuộc cùng chủ sở hữu Shortlist. Frontend chỉ hiển thị chức năng theo role;
backend luôn kiểm tra quyền, không dựa vào việc frontend ẩn nút.


### API mở rộng

- /api/transfers: Scout đọc; Admin CRUD.
- /api/shortlist-lists: quản lý danh sách có tên theo chủ sở hữu.
- /api/shortlist-items: alias rõ nghĩa cho /api/shortlists, hỗ trợ chọn shortlistId khi tạo.
- /api/notifications: chủ sở hữu đọc/đánh dấu đã đọc/xóa; Admin được tạo.
- /api/scoring-configs: Admin quản lý; Scout đọc cấu hình active.
- /api/match-results: đọc/xóa lịch sử theo chủ sở hữu, không tự nhập điểm.
- /api/audit-logs: chỉ Admin đọc.
- /api/market-value-history: Scout đọc; Admin CRUD lịch sử định giá.
- /api/matching-inputs: Scout CRUD theo chủ yêu cầu CLB; Admin quản lý tất cả. Chủ dữ liệu lấy từ yêu cầu, không nhận userId trong body.
- /api/player-data-verifications: Scout đọc; Admin PATCH tạo/cập nhật hoặc DELETE xác minh, ID trên đường dẫn là ID cầu thủ.
- /api/players: Admin có thể tạo/sửa thêm secondaryPositions; body cũ vẫn tương thích.
- POST /api/matching/financial/preview: Scout/Admin thử riêng điểm F, không lưu kết quả.
- POST /api/matching/financial/evaluate: Scout chỉ dùng yêu cầu CLB của mình; Admin dùng tất cả, chỉ tính F, không tạo MatchResult.
- GET /api/matching/template: Scout/Admin đọc mẫu cấu hình; chưa tự gán trọng số S/R.
- POST /api/matching/squad/preview: Scout/Admin thử phong độ và S từ thống kê đã lưu, trọng số S tự nhập chỉ dùng trong lần thử; không lưu.
- POST /api/matching/risk/evaluate và /risk/preview: Scout/Admin thử R từ dữ liệu đã lưu hoặc số giả lập, tách rõ nguồn dữ liệu, không lưu hoặc thay cấu hình; xem [cách thử R](../testing/README.md#risk-future).
- GET/POST /api/matching/risk/demo: Scout/Admin xem/chọn [10 mẫu chấn thương giả lập](../testing/README.md#injury-demo), kết quả luôn ghi DEMO, không cập nhật lịch sử thật.
- POST /api/matching/evaluate, /rank và /search: Scout dùng yêu cầu của mình/cấu hình active; Admin quản lý tất cả và thử configId chưa active. evaluate chỉ lưu khi save=true và đủ dữ liệu.

Chi tiết request/response và giới hạn ở [API các thực thể](README.md#entities).

- POST /api/matching/search: tự lấy ứng viên thuộc bộ dữ liệu nhập 5 giải mùa 2025/2026, chấm và phân trang. Không yêu cầu playerIds, không lưu lịch sử; chưa thêm điều kiện loại theo vị trí/tuổi/phí/lương. Xem [hướng dẫn](README.md#search).

## Entities

API quản lý thực thể.

Tất cả endpoint cần `Authorization: Bearer <accessToken>` từ POST /api/auth/login.
Response thành công: `{ "status": "success", "data": ... }`.
Danh sách mới có `meta: { page, pageSize, total }`, page mặc định 1, pageSize mặc định 20/tối đa 100.
401 thiếu/sai token; 403 sai role; 404 không có dữ liệu trong phạm vi được phép;
400 sai đầu vào; 409 trùng, tham chiếu sai hoặc thao tác xung đột.
Các example là dữ liệu minh họa, phải dùng ID có thật.

### Transfer

GET /api/transfers — Scout/Admin, lọc playerId, clubId, page, pageSize.
GET /api/transfers/:id — Scout/Admin.
POST /api/transfers — Admin.
PATCH /api/transfers/:id — Admin, chỉ gửi trường cần sửa.
DELETE /api/transfers/:id — Admin, trả 204.

```json
{
  "playerId": 4,
  "fromClubId": null,
  "toClubId": 1,
  "transferDate": "2026-07-01",
  "type": "FREE",
  "fee": "0",
  "reliability": "OFFICIAL",
  "source": "Nguồn xác nhận thương vụ"
}
```

- type: PERMANENT, LOAN, FREE. CLB đi có thể null, CLB đến bắt buộc.
- fee: chuỗi/số không âm, tối đa 2 số thập phân, đơn vị EUR; null = chưa biết.
- Có fee thì phải có source và reliability khác UNKNOWN.
- reliability: UNKNOWN, RUMOR, REPUTABLE_PRESS, OFFICIAL, FINANCIAL_REPORT.
- FREE không có fee dương; CLB đi/đến không được giống nhau.
- Ngày YYYY-MM-DD. Tạo Transfer chưa tự sửa Contract/Player hay phát thông báo.

### Shortlist và ShortlistItem

GET /api/shortlist-lists — danh sách có tên, kèm _count.items.
GET /api/shortlist-lists/:id — thông tin danh sách.
GET /api/shortlist-lists/:id/items — các mục, phân trang và sắp ưu tiên tăng dần.
POST /api/shortlist-lists — `{ "name": "Tiền vệ hè 2027" }`.
PATCH /api/shortlist-lists/:id — `{ "name": "Tên mới" }`.
DELETE /api/shortlist-lists/:id — chỉ xóa khi không còn mục; còn mục trả 409.

Scout chỉ truy cập danh sách của mình, Admin truy cập tất cả; POST luôn tạo cho User từ token.

API các mục: /api/shortlist-items có GET danh sách, GET /:id, POST, PATCH /:id, DELETE /:id.
/api/shortlists là alias cũ, giữ tương thích. Danh sách item toàn cục hiện chưa phân trang;
frontend ưu tiên GET /api/shortlist-lists/:id/items khi hiển thị theo danh sách.

POST item:
```json
{"shortlistId": 1, "playerId": 4, "requirementId": 3, "note": "Theo dõi", "priority": 1}
```

Không gửi userId. Bỏ shortlistId thì dùng danh sách mặc định. priority >= 1,
số nhỏ hơn có ưu tiên trước; note tối đa 255 ký tự, cho phép null.
requirementId có thể null; nếu có phải thuộc cùng chủ sở hữu.
Không trùng cầu thủ/nhu cầu trong cùng danh sách; cùng cầu thủ có thể nằm ở các danh sách khác.
PATCH item chỉ nhận note, priority, requirementId, không đổi danh sách/cầu thủ/chủ sở hữu.

### Notification

GET /api/notifications — danh sách của mình; Admin xem tất cả. Lọc unread=true/false, page, pageSize.
GET /api/notifications/:id — trong phạm vi sở hữu hoặc Admin.
POST /api/notifications — chỉ Admin tạo thủ công.
PATCH /api/notifications/:id — `{ "isRead": true }` hoặc false.
DELETE /api/notifications/:id — chủ sở hữu/Admin, trả 204.

```json
{"userId":6,"playerId":4,"type":"CONTRACT_EXPIRING","title":"Hợp đồng sắp hết hạn","content":"Thông báo mẫu","eventKey":"contract:123:6months"}
```

Các type: CONTRACT_RENEWED, CONTRACT_TERMINATED, CONTRACT_EXPIRING,
MARKET_VALUE_CHANGED, RELEASE_CLAUSE_CHANGED, INJURY_RECORDED.
eventKey bắt buộc; cùng User/eventKey không được tạo hai lần. playerId có thể null.
Không cho client tự sửa nội dung/người nhận/ngày gửi. Chưa có Scheduler, FCM hoặc APNs.

### ScoringConfig

GET /api/scoring-configs/active — Scout/Admin, 404 khi chưa kích hoạt cấu hình.
Các endpoint sau chỉ Admin:
- GET /api/scoring-configs — phân trang.
- GET /api/scoring-configs/:id.
- POST /api/scoring-configs.
- PATCH /api/scoring-configs/:id — sửa bản chưa có kết quả.
- POST /api/scoring-configs/:id/activate — chuyển active trong transaction.
- DELETE /api/scoring-configs/:id — chỉ khi không active và không có kết quả.

POST example để minh họa cấu trúc, KHÔNG phải bộ công thức đã chốt:
```json
{
  "name":"Cau hinh thu",
  "version":1,
  "financialWeight":0.4,
  "squadWeight":0.4,
  "riskWeight":0.2,
  "criteriaWeights":{
    "financial":{"fee":0.45,"salary":0.35,"contract":0.2},
    "squad":{"position":0.5,"age":0.3,"minutes":0.2},
    "risk":{"injury":0.6,"resale":0.4}
  },
  "parameters":{}
}
```

Trọng số từ 0 đến 1, tối đa 4 số thập phân. Ba trụ cột có tổng 1.
criteriaWeights bắt buộc có đủ financial/squad/risk, mỗi nhóm không rỗng,
trọng số tiêu chí con là số và tổng từng nhóm bằng 1.
Tên tiêu chí/parameters hiện lưu dạng cấu hình; cấu trúc chuyên biệt được chốt khi làm Engine.
Không gửi isActive; dùng endpoint activate. Chỉ một cấu hình được active.
Phiên bản đã có MatchResult không được sửa; tạo version mới thay vì ghi đè.

### MatchResult

GET /api/match-results — lịch sử của mình, Admin xem tất cả; lọc playerId, requirementId, page, pageSize.
GET /api/match-results/:id — chủ sở hữu/Admin.
DELETE /api/match-results/:id — chủ sở hữu/Admin, trả 204.
POST/PATCH không hỗ trợ, trả 405. Không cho client nhập/sửa điểm.
Engine tạo kết quả qua POST /api/matching/evaluate khi gửi save=true và đủ dữ liệu. Danh sách vẫn rỗng nếu chưa có lần chấm đủ điểm được lưu.

### AuditLog

Chỉ Admin:
GET /api/audit-logs — lọc entityType, entityId, actorId, from, to, page, pageSize.
GET /api/audit-logs/:id.
from/to là YYYY-MM-DD, bao gồm cả ngày to, thời gian lọc chuẩn UTC.
Không có API tạo/sửa/xóa log; các method đó trả 405.

Hiện tự ghi log nguyên tử với thay đổi Transfer, Shortlist (danh sách có tên), ScoringConfig,
Player qua API và ba nhóm dữ liệu Matching bên dưới.
Chưa gắn Audit vào toàn bộ các API master cũ hoặc các mục ShortlistItem.
Chưa chuyển các thao tác DELETE hiện có sang xóa mềm.
Không ghi mật khẩu/token vào log.

### Vị trí phụ của cầu thủ

API `/api/players` hiện nhận thêm `secondaryPositions`, không bắt buộc khi tạo.
Scout đọc; chỉ Admin tạo/sửa/xóa như trước.

PATCH /api/players/4:

```json
{"secondaryPositions":["CDM","CAM"]}
```

- Bỏ trường khi POST thì mặc định `[]`; PATCH gửi `[]` để xóa toàn bộ vị trí phụ.
- Mã được trim và chuyển thành chữ hoa; không được trùng nhau hoặc vị trí chính.
- Khi đổi vị trí chính sang vị trí đang nằm trong danh sách phụ, gửi cả hai trường trong một PATCH, ví dụ `{"position":"CDM","secondaryPositions":["CM"]}`.
- Không mặc định cầu thủ đá được các vị trí khác chỉ vì cùng nhóm.
- GET danh sách/chi tiết trả thêm mảng vị trí phụ. Body cũ không có trường này vẫn dùng được.

### Lịch sử giá trị thị trường

GET /api/market-value-history — Scout/Admin, lọc playerId, page, pageSize.
GET /api/market-value-history/:id — Scout/Admin.
POST /api/market-value-history — Admin.
PATCH /api/market-value-history/:id — Admin.
DELETE /api/market-value-history/:id — Admin, trả 204.

POST example:

```json
{
  "playerId":4,
  "valuedAt":"2025-10-01",
  "marketValue":"20000000",
  "source":"Dữ liệu mô phỏng phục vụ đồ án",
  "reliability":"UNKNOWN"
}
```

- Giá trị EUR không âm, tối đa 2 số thập phân; source bắt buộc, tối đa 255 ký tự.
- valuedAt là YYYY-MM-DD hợp lệ, không nằm trong tương lai.
- reliability nhận cùng enum với Transfer; có thể bỏ qua để mặc định UNKNOWN, không tự coi là nguồn đã kiểm chứng.
- Không trùng playerId/valuedAt/source; cùng ngày nhưng nguồn khác được lưu riêng.
- PATCH không đổi playerId/recordedAt; ngày sửa không được sau ngày ghi nhận ban đầu. Lần định giá mới phải POST một bản ghi mới.
- Không tự sửa `Player.marketValue`, chọn giá dùng cho Matching hoặc gửi thông báo. Cần quy tắc chọn nguồn/ngày đối chiếu trước khi triển khai Engine.

### Phí và lương dự kiến cho Matching

GET /api/matching-inputs — lọc playerId, requirementId, page, pageSize.
GET /api/matching-inputs/:id.
POST /api/matching-inputs.
PATCH /api/matching-inputs/:id.
DELETE /api/matching-inputs/:id — trả 204.

Scout chỉ truy cập dữ liệu thuộc yêu cầu CLB của mình. Admin được quản lý tất cả.
Khi Admin tạo cho một yêu cầu, chủ dữ liệu là chủ yêu cầu lấy từ DB, không phải tự gán cho Admin.
Không gửi userId trong body. ID ngoài phạm vi Scout trả 404.

POST example, dùng requirementId thuộc tài khoản đang đăng nhập hoặc Admin:

```json
{
  "playerId":4,
  "requirementId":3,
  "estimatedFee":"70000000",
  "feeSource":"Ước tính mô phỏng cho thương vụ",
  "expectedSalaryPerYear":"11000000",
  "salarySource":"Yêu cầu lương mô phỏng"
}
```

- Phí là EUR; lương là EUR/năm; không âm, tối đa 2 số thập phân.
- Phải biết ít nhất phí hoặc lương. Khoản đã biết phải có nguồn tương ứng không rỗng, tối đa 255 ký tự.
- `0` là đã ước tính bằng 0; `null` là chưa biết. Không tự thay null bằng lương hiện tại hoặc giá trị thị trường.
- Vượt budget/salaryLimit vẫn được lưu để Engine chấm theo công thức đã bàn.
- Duy nhất một bản ghi cho mỗi cặp requirementId/playerId; tạo trùng trả 409.
- PATCH chỉ sửa số tiền/nguồn; không đổi cầu thủ, yêu cầu hoặc chủ sở hữu.
- Khi xóa một khoản, gửi cả khoản đó và nguồn bằng null; nếu xóa cả hai khoản thì dùng DELETE.
- updatedAt do server quản lý. Các lần sửa ghi audit; đây chưa phải kết quả chấm điểm.

Ví dụ bỏ phí, giữ lương đã có:

```json
{"estimatedFee":null,"feeSource":null}
```

### Xác minh hồ sơ cầu thủ

GET /api/player-data-verifications — Scout/Admin, lọc playerId, page, pageSize.
GET /api/player-data-verifications/:playerId — Scout/Admin; chưa có hồ sơ trả 404.
PATCH /api/player-data-verifications/:playerId — Admin, tạo nếu chưa có hoặc cập nhật hồ sơ.
DELETE /api/player-data-verifications/:playerId — Admin, xóa xác minh, trả 204.

ID trên đường dẫn là **ID cầu thủ**, không phải một ID xác minh riêng.
PATCH trả 200. Mỗi phần được gửi phải đầy đủ; phần bỏ qua giữ nguyên. Không gửi body rỗng.

```json
{
  "injuryHistory":{
    "coveredFrom":"2024-10-01",
    "coveredThrough":"2026-10-01",
    "source":"Hồ sơ đã đối chiếu; ví dụ minh họa"
  },
  "registration":{
    "status":"CONTRACTED",
    "asOf":"2026-10-01",
    "source":"Xác nhận hợp đồng; ví dụ minh họa"
  }
}
```

- injuryHistory xác nhận dữ liệu đầy đủ trong khoảng coveredFrom–coveredThrough, không khẳng định cầu thủ không từng chấn thương. Các đợt nghỉ vẫn nằm trong InjuryHistory.
- registration nhận CONTRACTED hoặc FREE_AGENT tại ngày asOf. Không gửi UNKNOWN; dùng `registration: null` để xóa xác nhận và về UNKNOWN.
- `injuryHistory: null` xóa riêng xác minh lịch sử chấn thương.
- Ngày phải tồn tại, không nằm trong tương lai hoặc trước ngày sinh; coveredThrough không trước coveredFrom.
- Người xác minh và thời điểm xác minh do server lấy từ Admin/token và thời gian hiện tại; client không được gán.
- FREE_AGENT xung đột hợp đồng ACTIVE có khoảng ngày bao phủ asOf trả 409, không tự xóa hay chấm dứt hợp đồng để hợp thức hóa xác nhận.
- Không tự sửa Contract, tạo InjuryHistory, thay đổi trạng thái tương lai hoặc sinh điểm Matching.
- Xác nhận cũ không bảo đảm tình trạng vẫn đúng sau này. Engine cần xét ngày xác nhận, hợp đồng và phạm vi hồ sơ khi sử dụng.

### Thử và kiểm tra

Trang `/login` đã thêm ba lựa chọn GET mới vào mục Thử API backend, dùng phiên đăng nhập hiện tại.
Chọn Xác minh hồ sơ thì ô ID phải là ID cầu thủ. Danh sách rỗng là chưa có dữ liệu, không phải lỗi.
Trang thử hiện chỉ đọc; dùng HTTP client/Terminal để gửi các request tạo/sửa/xóa trong ví dụ.

Trong thư mục backend, `npm run test:matching-api` kiểm tra các endpoint mới bằng tài khoản và dữ liệu tạm, rồi dọn fixture.
`npm run test:matching-data` kiểm tra ràng buộc database bằng transaction rollback.

### Thử riêng Financial Fit

POST /api/matching/financial/preview — thử phí/lương/tháng trực tiếp, cần đăng nhập.
POST /api/matching/financial/evaluate — lấy dữ liệu đã lưu theo playerId/requirementId, kiểm tra quyền sở hữu yêu cầu.
Chỉ tính F theo bộ thử 45/35/20, không tính S/R, không ghi MatchResult và không thay cấu hình active.
Trang `/login` có mục Thử Financial Fit với ví dụ giả lập cho kết quả 79 điểm.
Chi tiết đầu vào, dữ liệu thiếu và giới hạn xem [hướng dẫn thử F](../testing/README.md#financial-fit).

### Matching Engine đầy đủ

GET /api/matching/template — lấy mẫu các quy tắc đã chốt, điền trọng số S/R còn để mở trước khi tạo cấu hình.
POST /api/matching/evaluate — chấm F/S/R và tổng, có tùy chọn save=true để tạo lịch sử nếu đủ dữ liệu.
POST /api/matching/rank — xếp hạng từ 1 đến 100 ứng viên; không lưu hàng loạt.
POST /api/matching/search — tự tìm ứng viên từ nhu cầu CLB, chấm F/S/R và phân trang; không cần playerIds, không lưu lịch sử. Xem [hướng dẫn](README.md#search).
Scout chỉ dùng yêu cầu CLB của mình và cấu hình active; Admin có thể thử configId chưa active.
Không tự nhập dữ liệu mẫu hoặc tự gán trọng số S/R. Chi tiết ở [Matching API](README.md#matching).

## Matching

Tính điểm và lưu kết quả Matching.

Engine đã có phép tính F/S/R, tổng điểm, giải thích, xếp hạng và lưu lịch sử. Công thức/bảng mặc định trong mẫu được chép từ `matching-engine-spec.md`, không thay bằng mô hình ML hoặc công thức của tài liệu bạn cùng nhóm. Không nhập bộ dữ liệu cầu thủ hay tự kích hoạt cấu hình trong lần triển khai này.

Sau đó đã bổ sung [bộ dữ liệu DEMO đầy đủ và hướng dẫn test](../testing/README.md#matching-demo) theo yêu cầu riêng. Cấu hình DEMO dùng trọng số S/R tạm để kiểm tra luồng, không kích hoạt mặc định. ID và kết quả hiện tại ở [matching-demo-data.json](../testing/matching-demo-data.json).

### 1. Những gì đã giữ nguyên

- Tổng điểm: F 40%, S 40%, R 20% trong mẫu.
- F: điểm phí `clamp(200 − 120 × phí/ngân sách)`, điểm lương `clamp(160 × (1,5 − lương/trần))`, hợp đồng `clamp(100 − 100 × tháng/60)`. Trọng số phí/lương/hợp đồng 45/35/20.
- Vị trí: chính 100, phụ 80, cùng nhóm 50, khác nhóm 0; lấy mức cao nhất, không cộng dồn.
- Tuổi trong S: 15–19 = 80; 20–24 = 90; 25–30 = 100; 31–34 = 80; từ 35 = 70. Chưa chấm dưới 15 theo mẫu.
- Phong độ: bảy nhóm vị trí và ba chỉ số/90 cộng điểm phút; giữ đúng mốc A/B và trọng số từng vị trí trong bản đặc tả. Hồ sơ và khớp vị trí có GK; công thức phong độ GK chưa được chốt nên phần phong độ vẫn trả null.
- Điểm phút: trên 0 đến dưới 450 = 60; 450–899 = 70; 900–1499 = 80; 1500–1999 = 90; từ 2000 = 100. Không phút thì chưa chấm.
- Trần phong độ = điểm phút + 20, tối đa 100. Do bảng phút đã sửa, dưới 450 phút vẫn có thể đạt 80; engine không tự siết lại.
- Chấn thương: 0–30 ngày = 100; 31–90 = 80; 91–180 = 60; 181–270 = 40; trên 270 = 20. Đang chấn thương thì tối đa 50.
- Bán lại: 60% điểm biến động + 40% điểm tuổi bán lại; điểm biến động `clamp(50 + 2 × phần trăm thay đổi)`. Bảng tuổi bán lại giữ nguyên bản đã chốt.

Các con số trong mẫu là tham số thử nghiệm, không phải thước đo bóng đá đã được kiểm chứng. Admin có thể tạo phiên bản cấu hình khác; engine dùng phiên bản được chọn và lưu snapshot để giải thích kết quả.

### 2. Cấu hình trước khi dùng

```http
GET /api/matching/template
Authorization: Bearer <accessToken>
```

Scout/Admin đều được đọc mẫu. Mẫu có tên, version, trọng số tổng, criteriaWeights và parameters chứa các bảng/mốc đã bàn. Các giá trị chưa chốt không được tự gán:

```json
{
  "financial":{"fee":0.45,"salary":0.35,"contract":0.2},
  "squad":{"position":null,"age":null,"form":null},
  "risk":{"injury":null,"resale":null}
}
```

Đây là phần criteriaWeights để giải thích chỗ cần điền, chưa phải body cấu hình hợp lệ. Cần:

1. Điền ba trọng số squad và hai trọng số risk đã được thống nhất; mỗi nhóm có tổng 1.
2. Điền `parameters.positionGroups` nếu muốn chấm trường hợp cùng nhóm. Không có nhóm thì trường hợp vị trí chính/phụ khớp vẫn chấm được, nhưng khi cần so nhóm sẽ báo thiếu cấu hình thay vì đoán 0/50.
3. Điền `parameters.completedSeasons` với các mùa được xác nhận đã hoàn thành. Bản hiện tại không tự đoán ngày kết thúc mùa hoặc áp bảng phút tuyệt đối cho mùa đang diễn ra.
4. Bỏ trường `instructions` của response mẫu, POST các trường cấu hình còn lại vào `/api/scoring-configs`, rồi POST `/api/scoring-configs/:id/activate` để sử dụng mặc định.

Không có cấu hình active hợp lệ thì trả 409 và hướng dẫn cấu hình; không dùng thầm một bộ trọng số khác. Cấu hình cũ chưa có `parameters.engineVersion = "matching-v1"` vẫn giữ tương thích với API CRUD cũ, nhưng chưa dùng được cho engine.

Admin có thể gửi configId của cấu hình chưa active để thử. Scout chỉ chọn cấu hình active. Phiên bản đã có MatchResult bị bảo vệ khỏi sửa thông số hoặc xóa như cơ chế hiện có.

### 3. Tính một cầu thủ

```http
POST /api/matching/evaluate
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "playerId":4,
  "requirementId":3,
  "season":"2025/2026",
  "formRole":"PRIMARY",
  "save":false
}
```

ID phải có thật; ví dụ không khẳng định cầu thủ 4 đã đủ dữ liệu. Scout chỉ dùng yêu cầu CLB của mình; Admin dùng tất cả. Ngày đánh giá do server lấy theo Asia/Ho_Chi_Minh.

- `formRole` bắt buộc chọn `PRIMARY` (công thức theo vị trí chính cầu thủ) hoặc `REQUIRED` (theo vị trí CLB cần). Vì lựa chọn này chưa được chốt mặc định, engine không tự lấy vai trò có điểm cao nhất.
- `season` bắt buộc YYYY/YYYY liên tiếp và nằm trong completedSeasons của cấu hình.
- `save` mặc định false. Gửi true để lưu nếu đã tính đủ F/S/R.
- `configId` không bắt buộc; bỏ qua thì lấy cấu hình active.
- `valuationSource` không bắt buộc; dùng để chọn rõ nguồn định giá khi có nhiều nguồn đủ cặp.
- Không nhận điểm hay trọng số từ body đánh giá.

Response có `complete`, `saved`, `resultId`, điểm F/S/R và tổng, `criteria`, `missing`, `prosCons`, cùng tên/version cấu hình. Mỗi tiêu chí có số liệu và căn cứ chấm; điểm phong độ còn có toàn bộ chỉ số/90, điểm phút, mốc, trọng số và trần áp dụng. Pass accuracy vẫn là %, không đổi thành /90 hoặc tự đưa thêm vào công thức.

Engine không tự loại vì vượt ngân sách, lương, vị trí hoặc minAge/maxAge. Đây là các điều kiện loại chưa được thống nhất; hiện vẫn chấm theo công thức đã chọn và cảnh báo khi phù hợp.

### 4. Quy tắc dữ liệu bảo thủ của bản triển khai

Các quy tắc bên dưới làm rõ cách lấy dữ liệu; không thêm hệ số thưởng/phạt chưa chốt:

#### Tài chính

Dùng MatchingInput đúng cặp cầu thủ/yêu cầu. Không lấy marketValue, releaseClause, Transfer.fee hoặc lương hiện tại để lấp đầu vào dự kiến bị thiếu. Tháng còn lại dùng quy ước tháng lịch của bản thử F. Không có hợp đồng ACTIVE phù hợp thì chỉ xác minh FREE_AGENT đúng ngày đánh giá mới cho thời hạn 0; không tự gán phí/lương bằng 0.

#### Chấn thương

Đếm ngày lịch đã trôi qua `[startDate, endDate)` — ngày hồi phục không tính thêm, cùng ngày là 0, phù hợp dịch vụ injury hiện tại. Cắt các khoảng vào cửa sổ hai năm, gộp phần chồng nhau rồi cộng. Đợt đang diễn ra tính đến ngày đánh giá, đang chấn thương khi chưa có endDate hoặc endDate sau ngày đánh giá.

Chỉ kết luận tổng ngày đầy đủ nếu PlayerDataVerification có khoảng xác minh bao phủ toàn cửa sổ. Nếu không, vẫn trả observedDays nhưng điểm chấn thương null, không coi “không có dòng dữ liệu” là không từng chấn thương.

#### Giá trị thị trường

Theo quyết định ngày 16/10/2026, với mỗi source, chọn định giá gần nhất không sau ngày đánh giá và định giá gần nhất không sau ngày lùi 12 tháng lịch. Chỉ dùng các dòng đã được ghi nhận trước thời điểm tính; hai mốc thực tế phải khác nhau. Không nội suy, không dùng giá tương lai hoặc ghép hai nguồn khác nhau.

- Không đủ cặp: báo thiếu dữ liệu.
- Nhiều cặp nguồn: báo mơ hồ, cần gửi valuationSource.
- Giá cũ bằng 0: chưa tính tỷ lệ được, không tự cho 50.
- Nguồn UNKNOWN/RUMOR được cảnh báo, chưa nhân hệ số giảm độ tin cậy chưa được chốt.
- Player.marketValue hiện tại không tự thay cho một lần định giá có ngày/nguồn.

Response ghi `selectionPolicy: LATEST_ON_OR_BEFORE_TARGETS_V1`, `currentTargetDate`, `priorTargetDate`, `currentDate`, `priorDate`, `quoteAgeDays`, `comparisonDays`. Hai trường Date không có chữ Target là ngày thực tế của định giá đã chọn. Giá gần nhất cũ hơn ngày đánh giá được cảnh báo; không khẳng định đó là giá hôm nay hay biến động đúng tròn 12 tháng. Chưa có giới hạn độ cũ tối đa hoặc hệ số độ tin cậy được chốt. Snapshot cũ không đổi; các lần đánh giá mới lưu các mốc đã thực sự dùng.

Dữ liệu thật hiện giới hạn ở 5 giải mùa 25/26 đã được nhập theo [báo cáo nguồn Transfermarkt](../data/README.md#overview). Nguồn này thiếu một số tiêu chí quan trọng; có hồ sơ và thống kê cơ bản chưa đồng nghĩa tính đủ F/S/R.

#### Thiếu dữ liệu

Trả HTTP 200 với `complete: false`, điểm tổng null, các điểm thành phần có thể tính và đường dẫn `missing`. Không tự gán điểm trung tính, chia lại trọng số hoặc lưu hàng MatchResult với điểm giả. Thành phần có trọng số 0 không bắt buộc dữ liệu cho phép cộng đó; để lưu, cả ba điểm trụ cột vẫn phải có giá trị.

Thiếu dữ liệu và cấu hình sai là hai trường hợp khác nhau: cấu hình thiếu/sai trả 409; dữ liệu tiêu chí thiếu trả kết quả chưa đầy đủ.

### 5. Lưu lịch sử

Nếu save=true và đủ điểm, engine tạo MatchResult trong transaction với:

- userId lấy từ chủ yêu cầu CLB; Admin thực hiện thay không đổi chủ kết quả.
- Điểm tổng/F/S/R, điểm từng tiêu chí và Pros/Cons.
- configId và snapshot đầy đủ của cấu hình, hồ sơ cầu thủ, yêu cầu, đầu vào tài chính, hợp đồng, thống kê mùa, chấn thương, xác minh và định giá đã đọc.
- evaluatedAt và một AuditLog CREATE với người thực hiện.

Đọc lại bằng GET `/api/match-results` hoặc `/:id`. Dữ liệu gốc thay đổi không tự sửa điểm/snapshot cũ. Scout không xem/xóa kết quả của người khác. API nhập điểm thủ công vẫn bị từ chối.

### 6. Xếp hạng danh sách đã chọn

```http
POST /api/matching/rank
```

```json
{
  "playerIds":[4,5],
  "requirementId":3,
  "season":"2025/2026",
  "formRole":"PRIMARY"
}
```

Từ 1 đến 100 ID không trùng, các ID phải tồn tại. Dùng cùng cấu hình và thời điểm dữ liệu trong một snapshot transaction. Trả `ranked` cho ứng viên đủ dữ liệu, giảm dần theo điểm hiển thị; bằng điểm thì ID tăng dần. Ứng viên thiếu nằm riêng ở `incomplete`. Không lưu lịch sử hàng loạt và không dùng min–max tương đối giữa ứng viên.

Đây là xếp hạng các ứng viên được chọn. Để tự tìm ứng viên từ nhu cầu CLB, dùng [POST /api/matching/search](README.md#search).

### 7. Thử trên trang hiện có và kiểm thử

Refresh `/login`, mở **Thử Matching Engine — F, S, R**. Chọn hai ID, mùa đã hoàn thành, vai trò và tùy chọn lưu lịch sử. Form dùng phiên đăng nhập hiện tại. Mục Thử API backend có thêm GET mẫu cấu hình; để trống ID khi chọn mục đó.

Form không tự tạo cấu hình S/R hay nhập dữ liệu mẫu. Có code đầy đủ không có nghĩa database đã đủ dữ liệu để chấm.

```sh
npm run test:matching
npm run test:matching-engine-api
```

Unit test kiểm tra các ranh giới bảng đã chốt, bảy vai trò, /90, trần phút, chấn thương chồng lấn/cắt cửa sổ, dữ liệu thiếu và biến động giá. API test dùng S/R weights và nhóm vị trí chỉ dành cho fixture, tạo dữ liệu tạm, kiểm tra điểm, phân quyền, lưu/đọc lịch sử, version/snapshot và xếp hạng; dọn sạch fixture và khôi phục cấu hình active trước đó.

## Search

Tự tìm ứng viên.

Đã có `POST /api/matching/search`. FE tạo nhu cầu bằng `POST /api/club-requirements`, lấy `data.id` làm `requirementId`, rồi gọi API này. Không cần nhập danh sách ID cầu thủ. Form nhập nhu cầu thuộc FE.

```http
POST /api/matching/search
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "requirementId": 3,
  "season": "2025/2026",
  "formRole": "PRIMARY",
  "page": 1,
  "pageSize": 20
}
```

Thay `3` bằng ID nhu cầu thực tế; đây không phải ID CLB hoặc ID cầu thủ. Scout chỉ dùng nhu cầu của mình; Admin dùng tất cả. Cần cấu hình Matching hợp lệ, với mùa trong `parameters.completedSeasons`. Bỏ `configId` thì dùng cấu hình active; Admin có thể chỉ định cấu hình nháp, Scout chỉ dùng cấu hình active. Có thể gửi thêm `valuationSource` như API chấm từng người.

`formRole` bắt buộc: `PRIMARY` dùng công thức phong độ theo vị trí chính cầu thủ; `REQUIRED` dùng vị trí nhu cầu. `page` mặc định 1, `pageSize` mặc định 20, tối đa 100; cả hai phải là số nguyên dương.

### Phạm vi hiện tại

- Lấy các hồ sơ có `transfermarktId` và bản ghi thống kê mùa `2025/2026`. Bao gồm bản ghi có 0 phút; chưa có thống kê mùa thì chưa vào danh sách ứng viên này. Hồ sơ nhập tay/DEMO không có mã nguồn được loại khỏi tập tự tìm, vẫn chấm riêng qua `/evaluate` được.
- Dựa vào bộ dữ liệu nhập hiện đã thu hẹp về Premier League, La Liga, Bundesliga, Serie A, Ligue 1. Đây là phạm vi bộ dữ liệu đã nhập, không phải xác nhận CLB hiện tại của từng cầu thủ. Importer phải tiếp tục giữ phạm vi 5 giải; API không có bảng lịch sử đăng ký giải để kiểm chứng độc lập. Mùa khác trả 409 thay vì tự khẳng định đã có dữ liệu.
- Theo yêu cầu tạo API trước rồi thêm dần, **chưa áp dụng điều kiện loại theo vị trí, tuổi, ngân sách hoặc trần lương**. Nhu cầu vẫn cung cấp vị trí và giới hạn tiền cho công thức chấm hiện có. Không tự đặt thêm quy tắc hay trọng số.
- Đọc dữ liệu theo lô, chấm từng cầu thủ bằng cùng hàm F/S/R của `/evaluate`, cùng cấu hình và thời điểm trong một transaction. Không dùng dữ liệu giả chấn thương để bù phần thiếu.

### Đọc kết quả

Response `{ "status": "success", "data": ... }`, trong `data` có:

| Trường | Ý nghĩa |
|---|---|
| `status` | `RANKED`: có người đủ điểm; `INCOMPLETE_DATA`: có ứng viên nhưng chưa ai đủ điểm; `NO_CANDIDATES`: không có ứng viên thuộc phạm vi |
| `ranked` | Người đủ F/S/R trên trang hiện tại: tên/ID, `rank`, điểm tổng, F/S/R, tiêu chí và giải thích |
| `incomplete` | Người chưa đủ dữ liệu trên trang hiện tại: tên/ID, điểm có thể tính, `missing`; tổng giữ `null` |
| `meta.totalCandidates` | Tổng ứng viên của toàn bộ kết quả |
| `meta.rankedCount` / `incompleteCount` | Tổng người đủ điểm / thiếu dữ liệu, không chỉ trang hiện tại |
| `meta.page` / `pageSize` / `totalPages` | Phân trang |
| `scope` | Nguồn ứng viên và các điều kiện lọc chưa áp dụng |
| `saved` | Luôn `false` |

Chấm toàn bộ rồi xếp người đủ điểm giảm dần theo điểm tổng hiển thị, bằng điểm thì ID tăng dần. Nhóm thiếu dữ liệu đứng sau, ID tăng dần; sau đó mới chia trang. Tổng số phần tử `ranked` và `incomplete` trên một trang không quá `pageSize`. Trang vượt cuối trả hai mảng rỗng và giữ nguyên số tổng.

Không có đủ dữ liệu vẫn HTTP 200; FE cần hiển thị `incomplete` và `missing`, không coi đây là lỗi không tìm thấy. Thiếu phí/lương dự kiến, hợp đồng hoặc xác minh chấn thương vẫn có thể làm kết quả chưa hoàn chỉnh. Không tạo dữ liệu hay điểm thay thế, không lưu MatchResult hàng loạt. Muốn lưu một người đủ điểm, gọi `/api/matching/evaluate` với `playerId`, cùng nhu cầu/cấu hình và `save: true`.

Sai body/phân trang trả 400; chưa đăng nhập 401; nhu cầu không tồn tại hoặc ngoài quyền 404; thiếu/sai cấu hình hoặc mùa chưa hỗ trợ 409. API dùng `Cache-Control: no-store`.

Kiểm thử backend, chạy trong thư mục `backend`:

```sh
npm run test:matching
npm run test:matching-engine-api
```

API test cần PostgreSQL cục bộ, tạo và dọn dữ liệu tạm, khôi phục cấu hình active ban đầu. Kiểm tra phân quyền, phạm vi ứng viên, dữ liệu thiếu/0 phút, đối chiếu điểm với chấm riêng, xếp hạng trước phân trang, không loại theo tuổi/phí và không lưu lịch sử.

