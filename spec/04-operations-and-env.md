# Đặc Tả 04: Vận Hành, Môi Trường & Quản Lý Tiến Trình (Operations & Env)

> [!CAUTION]
> **Tuân Thủ Bảo Mật**: Mọi định nghĩa biến môi trường trong tài liệu này chỉ mang tính chất mẫu (template). Tuyệt đối **không** lưu trữ mật khẩu thật, khóa bí mật hoặc thông tin định danh tài khoản AWS lên các file tài liệu hoặc kho lưu trữ mã nguồn (Git).

---

## 1. Danh Mục Biến Môi Trường (Environment Variables Specification)

### 1.1. Tầng WAS (Backend API - `was/.env`)

| Biến môi trường | Bắt buộc | Giá trị mặc định | Định dạng mẫu (Placeholder) | Mô tả mục đích |
| :--- | :---: | :--- | :--- | :--- |
| `PORT` | Không | `5000` | `5000` | Cổng lắng nghe của Backend API. |
| `DB_HOST` | **Có** | - | `<RDS_POSTGRES_ENDPOINT>` | Địa chỉ máy chủ AWS RDS PostgreSQL (Endpoint). |
| `DB_PORT` | Không | `5432` | `5432` | Cổng kết nối PostgreSQL. |
| `DB_USER` | **Có** | `postgres` | `<DATABASE_USERNAME>` | Tên tài khoản quản trị cơ sở dữ liệu. |
| `DB_PASSWORD` | **Có** | *(rỗng)* | `<STRONG_DATABASE_PASSWORD>` | Mật khẩu truy cập cơ sở dữ liệu RDS. |
| `DB_NAME` | Không | `postgres` | `postgres` | Tên database mặc định. |
| `DB_SSL` | Không | `true` (khi dùng RDS) | `true` | Bật/tắt chế độ mã hóa SSL khi kết nối DB. |
| `DB_CA_CERT_PATH` | Không | `key-rds/global-bundle.pem` | `/duong/dan/toi/chung_chi.pem` | Đường dẫn tùy chỉnh tới file chứng chỉ CA gốc của RDS. |

### 1.2. Tầng Web (Frontend Server - `web/.env`)

| Biến môi trường | Bắt buộc | Giá trị mặc định | Định dạng mẫu (Placeholder) | Mô tả mục đích |
| :--- | :---: | :--- | :--- | :--- |
| `PORT` | Không | `3000` | `3000` | Cổng lắng nghe của Web Server. |
| `WAS_API_URL` | Khuyên dùng | *(rỗng)* | `http://<WAS_PRIVATE_IP>:5000` | Địa chỉ IP nội bộ của máy EC2 WAS để kích hoạt Reverse Proxy. |

---

## 2. Quản Lý Vòng Đời Tiến Trình (Process Lifecycle)

Mỗi tầng đều được trang bị bộ kịch bản tự động hóa Bash Shell:

### 2.1. Kịch Bản Khởi Động (`start.sh`)
- **Tự động kiểm tra phụ thuộc**: Tự kiểm tra xem thư mục `node_modules` đã tồn tại chưa; nếu chưa có, tự động kích hoạt lệnh `npm install`.
- **Cơ chế cấp quyền ghi Log an toàn**:
  - Thử tạo và ghi log vào thư mục chuẩn hệ thống: `/var/log/node/`.
  - Nếu người dùng chạy không có quyền `root/sudo`, kịch bản tự động chuyển vùng ghi log (fallback) sang thư mục cục bộ của ứng dụng: `./logs/`.
- **Chống chạy trùng lặp (Idempotent)**: Kiểm tra mã tiến trình (PID). Nếu dịch vụ đang hoạt động, thông báo trạng thái và kết thúc một cách an toàn mà không sinh tiến trình rác.
- **Vận hành ngầm (Background Daemon)**: Sử dụng lệnh `nohup ... &` để duy trì tiến trình không bị ngắt khi ngắt kết nối SSH Terminal, đồng thời lưu mã tiến trình vào tệp `app.pid`.

### 2.2. Kịch Bản Dừng Tiến Trình (`shutdown.sh`)
- Đọc mã tiến trình từ tệp `app.pid` hoặc quét qua tiến trình Node.js tương ứng.
- Gửi tín hiệu ngắt mềm (`SIGTERM`) để ứng dụng kịp đóng các kết nối database pool một cách an toàn.
- Chờ trong vòng 5 giây; nếu tiến trình chưa dừng hẳn, kích hoạt tín hiệu cưỡng chế dừng (`SIGKILL -9`).
- Dọn dẹp tệp `app.pid`.

---

## 3. Quy Chuẩn Nhật Ký Hoạt Động (Logging Standards)

- **Định dạng Log**:
  - Ghi nhận thời gian theo chuẩn ISO 8601: `[YYYY-MM-DDTHH:mm:ss.sssZ]`.
  - Ghi nhận chi tiết: HTTP Method, URL Path, Status Code và Thời gian xử lý tính bằng mili-giây (ms).
  - Ghi nhận trạng thái kết nối SSL và xác thực PostgreSQL khi khởi động.
- **Tệp nhật ký mặc định**:
  - WAS: `/var/log/node/was-backend.log` (hoặc `was/logs/was-backend.log`).
  - Web: `/var/log/node/web-server.log` (hoặc `web/logs/web-server.log`).
- **Lệnh giám sát trực tiếp**:
  ```bash
  tail -f was/logs/was-backend.log
  tail -f web/logs/web-server.log
  ```

