# Football Transfer System

Backend quản lý hồ sơ cầu thủ, nhu cầu CLB, shortlist và Matching Engine F/S/R. Dữ liệu nguồn hiện giới hạn ở 5 giải VĐQG, mùa 2025/2026; thiếu dữ liệu vẫn giữ `null`.

## Bắt đầu từ đâu?

- [Tài liệu backend và API](backend/docs/README.md): đầu mối cho người làm BE và FE.
- [Công thức Matching đã thống nhất](backend/docs/matching-engine-spec.md).
- [Phạm vi và mức đầy đủ của dữ liệu](backend/docs/data/README.md#overview).

## Git dùng chung cho BE và FE

Gốc Git nằm ở `football-transfer-system/`, chứa cả `backend/` và `frontend/`. Chạy `git status`, `git commit` và `git push` từ thư mục này; vẫn chạy các lệnh npm của backend bên trong `backend/`.

```sh
# Trong football-transfer-system:
git status
git push
```

## Chạy backend

Chạy các lệnh trong thư mục `backend`. Cần Node.js tương thích các dependency trong `package-lock.json`, PostgreSQL và `.env` có `DATABASE_URL`; `PORT` mặc định 3000. Máy mới tạo `.env` từ [mẫu cấu hình](backend/.env.example) rồi điền kết nối của mình. Không đưa `.env` lên Git.

```sh
cd backend
npm ci
npx prisma generate --config prisma7.config.ts
npx prisma migrate deploy --config prisma7.config.ts
npm run dev
```

Migration tạo cấu trúc bảng, không mang theo dữ liệu PostgreSQL trên máy tác giả. Muốn nhập dữ liệu cầu thủ, đọc [quy trình nhập](backend/docs/data/README.md#overview) trước khi chạy script. Tạo admin bằng `npm run admin:create`.

API chạy tại `http://localhost:3000/api`. Trang `/login` hiện là công cụ đăng nhập và thử API; giao diện sản phẩm do FE phát triển riêng.

```sh
npm run build
npm start
```

Build tự xóa bản `dist` cũ trước khi sinh lại. Có thể xóa riêng bản build bằng `npm run clean`.

## Cấu trúc

| Thư mục | Vai trò |
|---|---|
| `backend/src/` | API, nghiệp vụ, tính điểm và cấu hình |
| `backend/src/services/matching/` | Engine F/S/R, công thức, cấu hình, dữ liệu đầu vào và kết quả Matching |
| `backend/prisma/` | Schema và lịch sử migration cần giữ |
| `backend/public/` | Trang thử API hiện tại |
| `backend/scripts/` | Tạo admin, lấy/chuẩn bị/nhập dữ liệu, chuẩn hóa và seed demo |
| `backend/tests/` | Kiểm thử nghiệp vụ, API và quá trình nhập |
| `backend/docs/` | Tài liệu chia theo API, dữ liệu, test và lịch sử; bắt đầu từ mục lục |
| `backend/data/` | Dữ liệu nguồn/cache/checkpoint và bản sao lưu cục bộ, đã ignore |
| `frontend/` | Chỗ trống dành cho FE, hiện chưa có mã nguồn |

`node_modules/`, `dist/` và Prisma client sinh trong `src/generated/prisma/` không đưa lên Git. Dữ liệu PostgreSQL nằm ngoài mã nguồn; xóa cache tải về không đồng nghĩa xóa dữ liệu trong PostgreSQL, nhưng có thể làm mất khả năng nhập lại và đối chiếu nguồn. Giữ bản sao lưu trước khi dọn dữ liệu nguồn.

Trong `src/`, route khai báo đường dẫn API, controller kiểm tra request/quyền truy cập, service xử lý nghiệp vụ. Các phép tính và dịch vụ liên quan Matching đã gom vào `services/matching/`; các service quản lý thực thể còn lại giữ cấu trúc hiện có. Script lấy/nhập dữ liệu nằm trong `scripts/`, không trộn vào luồng request API. Tên lệnh npm được giữ để các hướng dẫn chạy hiện có tiếp tục dùng được.

Các API thử riêng F/S/R dùng chung `src/controllers/preview.controller.ts` và được khai báo trong `src/routes/matching.routes.ts`. Tài liệu tra cứu chính đã gom vào ba file: API, dữ liệu và hướng dẫn test, mỗi file có mục lục riêng.
# football-ts
