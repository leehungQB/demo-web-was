# WAS (Web Application Server) - Backend Tier

Ứng dụng Backend API cực nhẹ viết bằng Node.js & Express, kết nối đến cơ sở dữ liệu PostgreSQL (Amazon RDS).

---

## 1. Yêu cầu & Cấu hình môi trường

Ứng dụng cực kỳ tối ưu, chiếm dưới **40MB RAM**, rất phù hợp cho EC2 cấu hình thấp (2 vCPU, 2GB RAM - ví dụ `t3.small` hoặc `t4g.small`).

### File cấu hình `.env`
Tạo file `.env` từ `.env.example`:
```bash
cp .env.example .env
```
Nội dung file `.env`:
```env
PORT=5000
DB_HOST=prv-1a-db01.cfo4k2mmsphe.ap-southeast-1.rds.amazonaws.com
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=<Mật_khẩu_RDS_của_bạn>
DB_NAME=postgres
DB_SSL=false
```

Hoặc bạn có thể xuất trực tiếp biến môi trường:
```bash
export DB_PASSWORD='mat_khau_cua_ban'
```

---

## 2. Cài đặt và Chạy trên EC2 WAS

### Bước 1: Cài đặt Node.js (nếu chưa có)
Trên Amazon Linux 2023:
```bash
sudo dnf install -y nodejs
```
Hoặc trên Ubuntu:
```bash
sudo apt update && sudo apt install -y nodejs npm
```

### Bước 2: Cài đặt dependencies và chạy
```bash
cd was
npm install
npm start
```

### Bước 3: Chạy nền bằng PM2 hoặc systemd (Khuyên dùng khi demo lâu dài)
Cài đặt PM2 để tự khởi động lại khi crash:
```bash
sudo npm install -g pm2
pm2 start server.js --name "was-api"
pm2 save
pm2 startup
```

---

## 3. Các API Endpoints

| Phương thức | Đường dẫn | Chức năng & HTTP Code | Body |
|---|---|---|---|
| `GET` | `/healthz` hoặc `/ping` | **Health check siêu nhẹ cho AWS Load Balancer** (Trả `200 OK`, không query DB) | Không |
| `GET` | `/health` | Kiểm tra chi tiết trạng thái WAS & DB RDS (Luôn trả `200 OK` cho LB) | Không |
| `GET` | `/api/items` | Lấy toàn bộ danh sách bản ghi | Không |
| `POST` | `/api/items` | Thêm mới bản ghi | `{"title": "...", "content": "..."}` |
| `PUT` | `/api/items/:id` | Sửa bản ghi theo ID | `{"title": "...", "content": "..."}` |
| `DELETE` | `/api/items/:id` | Xóa bản ghi theo ID | Không |

---

## 4. Cơ chế tự động Migrate DB
- Bạn **KHÔNG CẦN** chạy bất kỳ câu lệnh SQL thủ công nào.
- Khi `server.js` khởi động, nó tự động thực hiện truy vấn `CREATE TABLE IF NOT EXISTS items (...)`.
- Nếu muốn xem cấu trúc hoặc thêm dữ liệu mẫu bằng tay, bạn có thể tham khảo file `schema.sql`.

---

## 5. Lưu ý Security Group trên AWS
- **Inbound Rule của EC2 WAS**: Cần mở port `5000` cho phép từ **Security Group của EC2 Web** (hoặc mở tạm IP Web EC2).
- **Inbound Rule của RDS PostgreSQL**: Cần mở port `5432` cho phép từ **Security Group của EC2 WAS**.
