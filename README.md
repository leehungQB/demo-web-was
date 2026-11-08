# Demo Kiến Trúc 3 Tầng AWS (Web - WAS - RDS & S3 VPC Endpoint)

Hệ thống ứng dụng demo chuẩn kiến trúc 3 tầng (**3-Tier Architecture**) kết hợp bài Lab **Amazon S3 VPC Endpoint**, được thiết kế tối ưu hóa cực kỳ nhẹ (< 45MB RAM mỗi tier), chuyên dụng cho các máy chủ **AWS EC2 tài nguyên thấp (1-2 vCPU, 1-2 GiB RAM)**.

```
                    [ Client Browser ]
                            │
                            ▼ (Port 80 / 443 / 3000 - Hoặc qua External ALB)
┌─────────────────────────────────────────────────────────────┐
│  Tier 1: WEB SERVER (EC2 Web - Public Subnet)               │
│  - Phục vụ HTML/CSS/JS thuần (2 Tab: RDS Lab & S3 Lab)      │
│  - Built-in Reverse Proxy (/api/*, /health*)                │
│  - RAM sử dụng: < 20MB                                      │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼ HTTP REST API (Port 5000 - IP Private hoặc Internal ALB)
┌─────────────────────────────────────────────────────────────┐
│  Tier 2: WAS - BACKEND API (EC2 WAS - Private Subnet)       │
│  - Node.js + Express + pg pool + @aws-sdk/client-s3         │
│  - Tự động tạo bảng 'items' trên RDS & quản lý S3 Tree/CRUD │
│  - RAM sử dụng: ~35-45MB                                    │
└─────────────┬───────────────────────────────┬───────────────┘
              │                               │
              ▼ PostgreSQL SSL (Port 5432)    ▼ HTTPS (Port 443 qua S3 VPC Endpoint)
┌───────────────────────────┐   ┌──────────────────────────────────────────┐
│ Tier 3A: DATABASE (RDS)   │   │ Tier 3B: OBJECT STORAGE (Amazon S3)      │
│ - Amazon RDS PostgreSQL   │   │ - Kết nối qua Gateway / Interface VPCE   │
│ - Bảng dữ liệu: items     │   │ - S3 Tree View, Tạo/Sửa/Upload/Xóa File  │
└───────────────────────────┘   └──────────────────────────────────────────┘
```

---

## 📁 Cấu trúc thư mục (Tách biệt 2 Repo/Folder)

```
demo-web-was/
├── spec/                    # 📚 Tài liệu đặc tả kỹ thuật chi tiết (Chuẩn cho AI Models & Engineers)
│   ├── README.md            # Index và chỉ dẫn đọc đặc tả
│   ├── 00-overview.md       # Tổng quan dự án, hiện trạng & roadmap
│   ├── 01-architecture-and-flow.md # Kiến trúc VPC, Load Balancer, S3 VPCE & Reverse Proxy
│   ├── 02-backend-was-spec.md  # Đặc tả REST API (RDS & S3), RDS SSL, Schema DB
│   ├── 03-frontend-web-spec.md # Đặc tả Web 2 Tab (RDS & S3 Tree Explorer), Dynamic Config
│   └── 04-operations-and-env.md # Biến môi trường mẫu, scripts, logging
├── web/                     # 🌐 Folder triển khai trên máy EC2 Web
│   ├── index.html           # Giao diện 2 Tab Lab: Lab 1 (RDS CRUD) & Lab 2 (S3 Tree Explorer)
│   ├── style.css            # Giao diện hiện đại (Dark Glassmorphism, S3 2-column Tree UI)
│   ├── app.js               # Logic gọi API RDS & S3 Tree/CRUD/VPC Endpoint Diagnostics
│   ├── config.js            # Cấu hình địa chỉ WAS Backend mặc định
│   ├── server.js            # Máy chủ web cực nhẹ (Zero dependencies, Node thuần + Reverse Proxy)
│   ├── package.json         # Scripts chạy web
│   ├── nginx.conf.example   # Cấu hình mẫu nếu muốn dùng Nginx
│   └── README.md            # Hướng dẫn chi tiết máy Web & cấu hình Load Balancer
│
├── was/                     # ⚙️ Folder triển khai trên máy EC2 WAS
│   ├── server.js            # Backend API Express: RDS CRUD + Amazon S3 Tree/CRUD + DNS VPCE Check
│   ├── schema.sql           # Schema bảng PostgreSQL (Ứng dụng tự động migrate)
│   ├── package.json         # Dependencies: express, pg, @aws-sdk/client-s3, cors, dotenv
│   ├── .env.example         # File mẫu khai báo biến môi trường RDS & S3 VPC Endpoint
│   └── README.md            # Hướng dẫn chi tiết máy WAS, IAM Role & S3 VPC Endpoint
│
└── README.md                # Tài liệu tổng quan kiến trúc
```

---

## 🚀 Hướng Dẫn Cài Đặt Nhanh Trên 2 Máy EC2

### 1. Cài đặt trên MÁY 1 (EC2 WAS - Backend ở Private Subnet)

1. **Copy thư mục `was/` sang EC2 WAS**
2. **Cài đặt Node.js:**
   - *Amazon Linux 2023*: `sudo dnf install -y nodejs`
   - *Ubuntu*: `sudo apt update && sudo apt install -y nodejs npm`
3. **Cài dependencies và cấu hình:**
   ```bash
   cd was
   npm install
   cp .env.example .env
   ```
4. **Cập nhật thông tin RDS và S3 trong `was/.env`:**
   ```bash
   nano .env
   ```
   - Điền `DB_PASSWORD` cho RDS PostgreSQL.
   - Điền `S3_BUCKET=<ten-bucket-cua-ban>` và `AWS_REGION=ap-southeast-1` cho bài Lab S3 VPC Endpoint *(hoặc để trống và đổi trực tiếp trên giao diện Web)*.
   - **Lưu ý IAM Role**: Gắn IAM Role có quyền S3 (`AmazonS3FullAccess`) vào EC2 WAS để SDK tự động xác thực mà không cần điền Access Key tĩnh.
5. **Khởi động Backend:**
   ```bash
   ./start.sh
   # Hoặc chạy trực tiếp: npm start
   ```
   - **Endpoint cho AWS Load Balancer (Health Check Path):** `/healthz` hoặc `/ping` (Trả HTTP `200 OK`)
   - **Endpoint chi tiết RDS & S3:** `/health` và `/api/s3/health`

---

### 2. Cài đặt trên MÁY 2 (EC2 Web - Frontend ở Public Subnet)

1. **Copy thư mục `web/` sang EC2 Web**
2. **Cấu hình biến môi trường trỏ tới IP Private của WAS (hoặc Internal Load Balancer DNS):**
   ```bash
   cd web
   cp .env.example .env
   # Mở file .env và điền IP Private của WAS hoặc DNS của Internal ALB:
   # Ví dụ 1 (IP Private WAS): WAS_API_URL=http://10.0.27.74:5000
   # Ví dụ 2 (Internal ALB):   WAS_API_URL=http://internal-was-alb-xxx.ap-southeast-1.elb.amazonaws.com
   nano .env
   ```
3. **Khởi động Web server (tự động kích hoạt Reverse Proxy):**
   ```bash
   ./start.sh
   # Hoặc chạy trực tiếp: node server.js
   ```
4. **Mở trình duyệt:**
   - Truy cập: `http://<IP_PUBLIC_EC2_WEB_HOAC_EXTERNAL_ALB_DNS>:3000` (hoặc port 80).
   - Chuyển đổi giữa **Tab Lab 1 (RDS PostgreSQL)** và **Tab Lab 2 (Amazon S3 VPC Endpoint)** để thực hành!

---

## ⚖️ Tích Hợp AWS Load Balancer (ALB / NLB) Thay Thế IP

Dự án hỗ trợ thay thế hoàn toàn IP của cả tầng **Web** và tầng **WAS** bằng Load Balancer:

1. **External Load Balancer (Internet-facing ALB) đứng trước EC2 Web**:
   - Trỏ Target Group vào các máy **EC2 Web** (Port `3000` hoặc `80`), Health Check Path: `/web-healthz` hoặc `/healthz`.
   - Người dùng truy cập trực tiếp qua **DNS Name của External ALB** (`http://web-alb-xxx.ap-southeast-1.elb.amazonaws.com`). Giao diện Web dùng `window.location.origin` nên tự động tương thích 100% mà không cần sửa code.
2. **Internal Load Balancer (Internal ALB / NLB) đứng trước EC2 WAS**:
   - Trỏ Target Group vào các máy **EC2 WAS** (Port `5000`), Health Check Path: `/healthz`.
   - Trên máy EC2 Web, sửa file `web/.env` thay IP của WAS bằng DNS của Internal LB:
     ```env
     WAS_API_URL=http://internal-was-alb-xxx.ap-southeast-1.elb.amazonaws.com:5000
     ```
     *(Nếu Listener của Internal ALB lắng nghe ở cổng 80 và forward sang Target Group cổng 5000 thì bỏ `:5000` đi)*.

---

## 🔒 Kiểm tra Security Groups & VPC Endpoint trên AWS (Rất Quan Trọng)

| Thành phần | Chiều | Port / Giao thức | Nguồn / Đích |
|---|---|---|---|
| **External ALB** *(nếu dùng)* | Inbound | TCP `80` / `443` | `0.0.0.0/0` (Internet) |
| **EC2 Web** | Inbound | TCP `80` / `3000` | `SG-External-ALB` (hoặc `0.0.0.0/0`) |
| **Internal ALB** *(nếu dùng)* | Inbound | TCP `80` / `5000` | `SG-Web` |
| **EC2 WAS** | Inbound | TCP `5000` | `SG-Internal-ALB` (hoặc `SG-Web`) |
| **EC2 WAS** | Outbound | TCP `5432` | `SG-RDS` (Kết nối PostgreSQL) |
| **EC2 WAS** | Outbound | TCP `443` (HTTPS) | **S3 Prefix List (`pl-xxxxxx`)** hoặc `SG-VPCE` (Kết nối S3 VPC Endpoint) |
| **RDS PostgreSQL** | Inbound | TCP `5432` | `SG-WAS` |
