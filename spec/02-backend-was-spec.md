# Đặc Tả 02: Tầng Ứng Dụng Backend (WAS Specification)

## 1. Tổng Quan Tầng WAS

- **Mã nguồn chính**: `was/server.js`
- **Framework**: Node.js + Express.js
- **Cổng dịch vụ mặc định**: `5000` (cấu hình qua biến `PORT`)
- **Vai trò**: Cung cấp các RESTful API phục vụ các thao tác quản lý dữ liệu đối với bảng `items`, thực hiện kiểm tra trạng thái dịch vụ (health checks) cho AWS Load Balancer và duy trì kết nối an toàn với cơ sở dữ liệu AWS RDS PostgreSQL.

---

## 2. Danh Mục API (REST API Catalog)

### 2.1. Nhóm API Kiểm Tra Trạng Thái (Health Checks & Monitoring)

#### `GET /`
- **Mục đích**: Endpoint gốc kiểm tra nhanh trạng thái dịch vụ khi ping hoặc curl từ terminal.
- **Mã phản hồi**: `200 OK`
- **Response Format**:
  ```json
  {
    "status": "UP",
    "tier": "WAS (Backend)",
    "message": "WAS Backend API đang hoạt động bình thường",
    "endpoints": {
      "health": "/health",
      "healthz": "/healthz",
      "items": "/api/items"
    }
  }
  ```

#### `GET /healthz` (hoặc `GET /ping`)
- **Mục đích**: **Endpoint siêu nhẹ dành riêng cho AWS ALB / NLB Target Group Health Check Path**.
- **Đặc điểm kỹ thuật**: Trả về HTTP `200 OK` ngay lập tức trong bộ nhớ mà **không thực hiện query vào database**, giúp tránh quá tải database connection pool khi Load Balancer kiểm tra định kỳ mỗi 5-10 giây.
- **Response Format**:
  ```json
  {
    "status": "OK",
    "tier": "WAS (Backend)",
    "uptime": 12450,
    "timestamp": "2026-11-08T08:00:00.000Z"
  }
  ```

#### `GET /health`
- **Mục đích**: Endpoint kiểm tra trạng thái chi tiết của cả tầng WAS lẫn kết nối tới RDS PostgreSQL (`SELECT NOW()`).
- **Response Format**:
  ```json
  {
    "status": "healthy",
    "service": "WAS Backend API (3-Tier Demo)",
    "timestamp": "2026-11-08T08:00:00.000Z",
    "uptime": 12450,
    "memoryUsageMB": {
      "rss": 38.5,
      "heapTotal": 14.2,
      "heapUsed": 9.8
    },
    "database": {
      "status": "connected",
      "host": "<RDS_ENDPOINT_HOST>",
      "database": "postgres",
      "ssl": true,
      "details": {
        "now": "2026-11-08T08:00:00.000Z",
        "db": "postgres"
      }
    }
  }
  ```

---

### 2.2. Nhóm API Nghiệp Vụ Quản Lý Dữ Liệu (`/api/items`)

#### `GET /api/items`
- **Mục đích**: Lấy danh sách các bản ghi (sắp xếp mới nhất lên đầu).
- **Query Params**:
  - `q` *(tùy chọn)*: Từ khóa tìm kiếm theo `title` hoặc `content`.
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "count": 2,
    "data": [
      {
        "id": 1,
        "title": "Mục tiêu 1",
        "content": "Nội dung chi tiết mục 1",
        "created_at": "2026-11-08T07:30:00.000Z",
        "updated_at": "2026-11-08T07:30:00.000Z"
      }
    ]
  }
  ```

#### `POST /api/items`
- **Mục đích**: Thêm mới một bản ghi.
- **Request Body (JSON)**:
  ```json
  {
    "title": "Chuỗi bắt buộc, tối đa 255 ký tự",
    "content": "Chuỗi tùy chọn"
  }
  ```
- **Response `201 Created`**:
  ```json
  {
    "success": true,
    "message": "Tạo item thành công",
    "data": { "id": 2, "title": "...", "content": "..." }
  }
  ```
- **Response `400 Bad Request`**: Khi thiếu trường `title` hoặc `title` rỗng.

#### `PUT /api/items/:id`
- **Mục đích**: Cập nhật thông tin bản ghi theo `id`.
- **Request Body (JSON)**:
  ```json
  {
    "title": "Tiêu đề mới (bắt buộc)",
    "content": "Nội dung cập nhật"
  }
  ```
- **Response `200 OK`**: Cập nhật thành công.
- **Response `404 Not Found`**: Không tìm thấy bản ghi có `id` tương ứng.

#### `DELETE /api/items/:id`
- **Mục đích**: Xóa bản ghi theo `id`.
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "message": "Đã xóa item thành công",
    "data": { "id": 1, "title": "..." }
  }
  ```
- **Response `404 Not Found`**: Bản ghi cần xóa không tồn tại.

---

## 3. Cấu Trúc Bảng Dữ Liệu (Database Schema)

Cơ sở dữ liệu lưu trữ tại Amazon RDS PostgreSQL. Mã nguồn WAS tích hợp hàm `initDatabase()` tự động chạy câu lệnh DDL sau khi khởi động:

```sql
CREATE TABLE IF NOT EXISTS items (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. Cơ Chế Xử Lý SSL / TLS Với AWS RDS

- Khi máy chủ RDS yêu cầu kết nối an toàn (hoặc tên miền máy chủ chứa `rds.amazonaws.com`), Node.js `pg` pool sẽ kích hoạt cơ chế mã hóa SSL.
- **Tìm kiếm chứng chỉ**: Mã nguồn sẽ chủ động quét các vị trí khả dĩ để tìm tệp `global-bundle.pem` (hoặc file `.pem`, `.crt`) nằm trong thư mục `key-rds/` hoặc được trỏ bởi biến `DB_CA_CERT_PATH`.
- **Tránh từ chối kết nối**: Nếu tìm thấy chứng chỉ CA gốc tin cậy của AWS, cấu hình `ssl.ca` sẽ được nạp đầy đủ. Nếu chứng chỉ chưa sẵn sàng, hệ thống linh hoạt chuyển sang chế độ `ssl: { rejectUnauthorized: false }` kèm theo cảnh báo trên log để duy trì khả năng hoạt động.

