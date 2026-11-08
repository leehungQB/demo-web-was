# Đặc Tả 03: Tầng Trình Diễn Frontend (Web Tier Specification)

## 1. Tổng Quan Tầng Web

- **Mã nguồn**: `web/`
- **Máy chủ Web**: Node.js core `http` module (`web/server.js`) hoặc tùy chọn Nginx (`web/nginx.conf.example`).
- **Cổng dịch vụ mặc định**: `3000` (cấu hình qua biến `PORT`).
- **Đặc điểm nổi bật**:
  - **Zero External Dependencies**: Không yêu cầu cài đặt bất kỳ thư viện npm nào từ bên ngoài (`node_modules` hoàn toàn rỗng hoặc không cần thiết cho `web/`).
  - **Dung lượng bộ nhớ RAM cực thấp**: Chiếm dụng **dưới 20MB RAM** khi hoạt động.
  - **Tích hợp sẵn Reverse Proxy**: Tự động đóng vai trò cổng trung gian chuyển tiếp các truy vấn API tới tầng WAS.

---

## 2. Các Thành Phần & Tệp Tin

| Tệp tin | Vai trò |
| :--- | :--- |
| `web/index.html` | Giao diện SPA chia 2 Tab Lab: **Lab 1 (RDS PostgreSQL)** và **Lab 2 (Amazon S3 VPC Endpoint Explorer)** kèm các Modal cấu hình WAS, cấu hình S3 và trình soạn thảo file S3. |
| `web/style.css` | Phong cách thiết kế hiện đại (Dark Glassmorphism, bố cục 2 cột cho S3 Tree View & Object Browser, responsive). |
| `web/app.js` | Logic client: Chuyển đổi Tab, kiểm tra sức khỏe RDS & S3 VPC Endpoint, hiển thị cây thư mục S3 đệ quy, breadcrumb và thực hiện các thao tác CRUD trên cả RDS lẫn S3. |
| `web/server.js` | Máy chủ HTTP Node.js: Phục vụ tài nguyên tĩnh, cung cấp `/web-healthz` cho External ALB, sinh `/config.js` động và thực hiện Reverse Proxy tới `WAS_API_URL` (IP Private hoặc Internal ALB). |
| `web/nginx.conf.example` | File cấu hình tham khảo khi người dùng muốn sử dụng Nginx thay thế cho `web/server.js`. |

---

## 3. Cơ Chế Reverse Proxy Tích Hợp Sẵn (Built-in Reverse Proxy)

Khi biến môi trường `WAS_API_URL` được định cấu hình trên máy Web (ví dụ: `http://<WAS_PRIVATE_IP>:5000`):

```mermaid
sequenceDiagram
    autonumber
    actor User as Trình duyệt (Client)
    participant Web as Web Server (Port 3000)
    participant WAS as WAS Backend (Port 5000)

    User->>Web: GET /index.html (Tải giao diện)
    Web-->>User: Trả về HTML/CSS/JS
    User->>Web: GET /config.js
    Web-->>User: Dynamic config (WAS_PROXY_ENABLED = true)
    User->>Web: GET /api/items
    Note over Web: Web Server nhận diện tiền tố /api/<br/>Chuyển tiếp nội bộ tới WAS_API_URL
    Web->>WAS: GET /api/items (qua Private IP)
    WAS-->>Web: JSON data
    Web-->>User: JSON data
```

### Xử lý kỹ thuật trong `web/server.js`:
- Khi có request gửi đến với đường dẫn bắt đầu bằng `/api/` hoặc `/health` hoặc `/healthz`:
  - `web/server.js` đọc biến `WAS_API_URL`.
  - Thiết lập kết nối HTTP client nội bộ tới địa chỉ WAS mục tiêu.
  - Chuyển tiếp nguyên vẹn: HTTP Method, Headers, và Data Streams (Stream-based piping) từ Client tới WAS và ngược lại.
  - Thiết lập timeout bảo vệ (5000ms), trả về mã `504 Gateway Timeout` hoặc `502 Bad Gateway` nếu máy chủ WAS không phản hồi.

---

## 4. Cơ Chế Sinh Cấu Hình Động (`/config.js`)

Khi trình duyệt yêu cầu tệp `/config.js`, máy chủ Web không đọc từ tệp tĩnh mà sinh động chuỗi JavaScript trả về với header `Cache-Control: no-cache`:

```javascript
window.APP_CONFIG = {
  DEFAULT_API_URL: window.location.origin,
  WAS_PROXY_ENABLED: true, // hoặc false nếu không truyền WAS_API_URL
  WAS_TARGET_URL: "http://<WAS_PRIVATE_IP>:5000"
};
```
Nhờ cơ chế này, phía client Javascript (`web/app.js`) luôn nhận biết chính xác liệu hệ thống đang chạy qua chế độ Reverse Proxy nội bộ hay gọi trực tiếp, không bao giờ cần phải hardcode địa chỉ IP trong mã nguồn frontend.

