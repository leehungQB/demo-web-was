# WAS (Web Application Server) - Backend Tier (RDS & S3 VPC Endpoint)

Ứng dụng Backend API cực nhẹ viết bằng Node.js & Express, kết nối đến cơ sở dữ liệu **PostgreSQL (Amazon RDS)** và **Amazon S3 qua VPC Endpoint**.

---

## 1. Yêu cầu & Cấu hình môi trường

Ứng dụng cực kỳ tối ưu, chiếm dưới **45MB RAM**, rất phù hợp cho EC2 cấu hình thấp (`t2.micro`, `t3.micro`, `t3.small`, `t4g.small`).

### File cấu hình `.env`
Tạo file `.env` từ `.env.example`:
```bash
cp .env.example .env
```
Nội dung file `.env`:
```env
PORT=5000

# 1. Cấu hình Amazon RDS PostgreSQL
DB_HOST=prv-1a-db01.cfo4k2mmsphe.ap-southeast-1.rds.amazonaws.com
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=<Mật_khẩu_RDS_của_bạn>
DB_NAME=postgres
DB_SSL=true
DB_CA_CERT_PATH=./key-rds/global-bundle.pem

# 2. Cấu hình Amazon S3 & VPC Endpoint
S3_BUCKET=<Tên_S3_Bucket_của_bạn>
AWS_REGION=ap-southeast-1
# S3_ENDPOINT_URL=https://bucket.vpce-xxxx.s3.ap-southeast-1.vpce.amazonaws.com
S3_FORCE_PATH_STYLE=false
```

> **Mẹo cho bài Lab S3 VPC Endpoint**:
> - Bạn có thể để trống `S3_BUCKET` trong `.env` (mặc định hệ thống mở kho giả lập `demo-local-s3`), sau đó bấm nút **"Cấu hình S3"** ngay trên giao diện Web để nhập tên Bucket thật bất kỳ lúc nào mà không cần khởi động lại WAS!
> - Khuyên dùng **IAM Role gắn vào EC2 WAS** (với quyền `AmazonS3FullAccess` hoặc quyền truy cập Bucket cụ thể) để không cần khai báo `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.

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
./start.sh
# Hoặc chạy trực tiếp: npm start
```

---

## 3. Các API Endpoints

### 3.1. Health Check & RDS API (`/api/items`)

| Phương thức | Đường dẫn | Chức năng & HTTP Code | Body |
|---|---|---|---|
| `GET` | `/healthz` hoặc `/ping` | **Health check siêu nhẹ cho AWS Load Balancer** (Trả `200 OK`, không query DB) | Không |
| `GET` | `/health` | Kiểm tra chi tiết trạng thái WAS, DB RDS & cấu hình S3 | Không |
| `GET` | `/api/items` | Lấy toàn bộ danh sách bản ghi RDS | Không |
| `POST` | `/api/items` | Thêm mới bản ghi RDS | `{"title": "...", "content": "..."}` |
| `PUT` | `/api/items/:id` | Sửa bản ghi RDS theo ID | `{"title": "...", "content": "..."}` |
| `DELETE` | `/api/items/:id` | Xóa bản ghi RDS theo ID | Không |

### 3.2. Amazon S3 & VPC Endpoint API (`/api/s3/*`)

| Phương thức | Đường dẫn | Chức năng |
|---|---|---|
| `GET` | `/api/s3/health` | Kiểm tra kết nối S3, độ trễ (ms) và phân giải DNS IP của S3 Endpoint từ máy WAS |
| `POST` | `/api/s3/test` | Test thử cấu hình Bucket / Region / Custom VPCE URL từ giao diện Web |
| `GET` / `POST` | `/api/s3/config` | Xem hoặc cập nhật nóng cấu hình S3 Bucket, Region, Endpoint URL, Credentials |
| `GET` | `/api/s3/tree` | Lấy cây thư mục (`tree`) toàn bộ Bucket và danh sách `folders`/`files` theo `prefix` |
| `POST` | `/api/s3/folder` | Tạo thư mục mới (`folderPath` kết thúc bằng `/`) trên S3 |
| `GET` | `/api/s3/object` | Xem nội dung file (Text/JSON/Code/Image) hoặc tải file về máy (`?key=...&download=1`) |
| `POST` | `/api/s3/object` | Tạo file văn bản / cấu hình mới trực tiếp trên S3 |
| `PUT` | `/api/s3/object` | Cập nhật nội dung file hoặc đổi tên (`oldKey` -> `key`) trên S3 |
| `POST` | `/api/s3/upload` | Upload file từ máy tính lên S3 (Base64 payload) |
| `DELETE` | `/api/s3/object` | Xóa 1 file đơn lẻ hoặc xóa đệ quy cả thư mục (`prefix/`) trên S3 |

---

## 4. Lưu ý Security Group & Route Table trên AWS
- **Inbound Rule của EC2 WAS**: Mở port `5000` cho phép từ **Security Group của Internal ALB** (nếu dùng LB) hoặc **Security Group của EC2 Web**.
- **Outbound Rule của EC2 WAS**:
  - Mở port `5432` tới **Security Group của RDS PostgreSQL**.
  - Mở port `443` (HTTPS) tới **S3 Prefix List (`pl-xxxxxx`)** (khi dùng S3 Gateway Endpoint) hoặc tới **Security Group của S3 Interface Endpoint**.
