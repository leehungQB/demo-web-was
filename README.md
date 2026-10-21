# Demo Kiến Trúc 3 Tầng AWS (Web - WAS - DB)

Hệ thống ứng dụng demo chuẩn kiến trúc 3 tầng (**3-Tier Architecture**) được thiết kế tối ưu hóa cực kỳ nhẹ, tiêu tốn ít RAM (< 40MB mỗi tier), chuyên dụng cho các máy chủ **AWS EC2 tài nguyên thấp (2 vCPU, 2 GiB RAM)**.

```
       [ Client Browser ]
               │
               ▼ (Port 80 / 3000)
┌───────────────────────────────────────────────┐
│  Tier 1: WEB SERVER (EC2 Web)                 │
│  - Phục vụ HTML/CSS/JS thuần, không cần build │
│  - RAM sử dụng: < 20MB                        │
└──────────────────────┬────────────────────────┘
                       │
                       ▼ HTTP REST API (Port 5000)
┌───────────────────────────────────────────────┐
│  Tier 2: WAS - BACKEND API (EC2 WAS)          │
│  - Node.js + Express + pg connection pool     │
│  - Tự động tạo bảng 'items' nếu chưa có       │
│  - RAM sử dụng: ~35MB                         │
└──────────────────────┬────────────────────────┘
                       │
                       ▼ PostgreSQL TCP (Port 5432)
┌───────────────────────────────────────────────┐
│  Tier 3: DATABASE (Amazon RDS PostgreSQL)     │
│  - Host: prv-1a-db01.cfo4k2mmsphe...          │
│  - User: postgres                             │
└───────────────────────────────────────────────┘
```

---

## 📁 Cấu trúc thư mục (Tách biệt 2 Repo/Folder)

```
app-web-was/
├── web/                     # 🌐 Folder triển khai trên máy EC2 Web
│   ├── index.html           # Giao diện 1 màn hình: Thêm, Sửa, Xóa, Lọc, Healthcheck
│   ├── style.css            # Giao diện hiện đại (Dark Glassmorphism, Responsive)
│   ├── app.js               # Logic gọi API Thêm/Sửa/Xóa/Healthcheck
│   ├── config.js            # Cấu hình địa chỉ WAS Backend mặc định
│   ├── server.js            # Máy chủ web cực nhẹ (Zero dependencies, Node thuần)
│   ├── package.json         # Scripts chạy web
│   ├── nginx.conf.example   # Cấu hình mẫu nếu muốn dùng Nginx
│   └── README.md            # Hướng dẫn chi tiết máy Web
│
├── was/                     # ⚙️ Folder triển khai trên máy EC2 WAS
│   ├── server.js            # Backend API Express CRUD + kết nối PostgreSQL
│   ├── schema.sql           # Schema bảng PostgreSQL (Ứng dụng tự động migrate)
│   ├── package.json         # Dependencies: express, pg, cors, dotenv
│   ├── .env.example         # File mẫu khai báo biến môi trường DB
│   └── README.md            # Hướng dẫn chi tiết máy WAS
│
└── README.md                # Tài liệu tổng quan kiến trúc
```

---

## 🚀 Hướng Dẫn Cài Đặt Nhanh Trên 2 Máy EC2

### 1. Cài đặt trên MÁY 1 (EC2 WAS - Backend)

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
4. **Cập nhật mật khẩu RDS trong `.env`:**
   ```bash
   # Mở file .env và điền DB_PASSWORD của bạn:
   nano .env
   ```
   *(Hoặc xuất biến: `export DB_PASSWORD='mat_khau_rds'`)*
5. **Khởi động Backend:**
   ```bash
   npm start
   ```
   *Backend sẽ chạy tại port `5000` và tự động khởi tạo bảng `items` trên PostgreSQL.*
   - **Endpoint cho AWS Load Balancer (Health Check Path):** `/healthz` (Trả HTTP `200 OK`)
   - **Endpoint chi tiết:** `/health` (Trả trạng thái WAS và RDS)

---

### 2. Cài đặt trên MÁY 2 (EC2 Web - Frontend)

1. **Copy thư mục `web/` sang EC2 Web**
2. **Cấu hình biến môi trường trỏ tới IP Private của WAS:**
   ```bash
   cd web
   cp .env.example .env
   # Mở file .env và điền IP Private của WAS (ví dụ: WAS_API_URL=http://10.0.27.74:5000):
   nano .env
   ```
3. **Khởi động Web server (tự động kích hoạt Reverse Proxy):**
   ```bash
   # Chạy bằng Node.js thuần (Không cần npm install):
   node server.js
   
   # Hoặc chạy trên port 80 nếu muốn truy cập trực tiếp:
   sudo PORT=80 node server.js
   ```
4. **Mở trình duyệt:**
   - Truy cập: `http://<IP_PUBLIC_EC2_WEB>:3000` (hoặc port 80).
   - Web Server sẽ tự động làm Reverse Proxy chuyển tiếp mọi request sang WAS `http://10.0.27.74:5000`. Bạn không cần public IP của WAS ra ngoài Internet!
   - Bắt đầu thực hiện các hành động **Thêm, Sửa, Xóa** dữ liệu trực tiếp vào RDS!

---

## 🔒 Kiểm tra Security Groups trên AWS (Rất Quan Trọng)

Để các tầng giao tiếp được với nhau:

| Tầng | Cần mở Inbound Port | Source cho phép |
|---|---|---|
| **EC2 Web** | Port `80` (hoặc `3000`) | `0.0.0.0/0` (Truy cập từ trình duyệt) |
| **EC2 WAS** | Port `5000` | Security Group của EC2 Web (hoặc `0.0.0.0/0` khi test demo) |
| **RDS PostgreSQL** | Port `5432` | Security Group của EC2 WAS |
