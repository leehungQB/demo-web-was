# Đặc Tả 00: Tổng Quan Dự Án & Trạng Thái Phát Triển

## 1. Mục Tiêu Dự Án (Project Goal & Scope)

Dự án này là một hệ thống web chuẩn kiến trúc 3 tầng (**3-Tier Architecture**: Web Tier – Application Tier – Database Tier), được thiết kế mẫu mực cho việc học tập, thực hành và triển khai trên hạ tầng điện toán đám mây **Amazon Web Services (AWS)**.

### Triết lý thiết kế cốt lõi:
- **Ultra-lightweight (Cực nhẹ)**: Tối ưu để vận hành trơn tru trên các máy chủ EC2 dung lượng phần cứng thấp (ví dụ: instance loại `t2.micro`, `t3.micro`, `t4g.small` chỉ với 1-2 vCPU và 1-2 GiB RAM).
- **Tiêu thụ tài nguyên tối thiểu**: 
  - Tầng Web tiêu tốn **< 20MB RAM** (viết bằng module Node.js core thuần, Zero npm dependencies).
  - Tầng WAS tiêu tốn **~35-45MB RAM** (Express.js tối giản + connection pool nhỏ gọn).
- **Bảo mật theo mô hình VPC cô lập**: Backend (WAS) và Database (RDS) không cần mở IP Public ra ngoài Internet.
- **Sẵn sàng tích hợp AWS Load Balancer (ALB / NLB)**: Tích hợp sẵn các endpoint chuẩn hóa cho Target Group Health Check.

---

## 2. Công Nghệ Sử Dụng (Tech Stack)

| Tầng | Thành phần | Công nghệ / Thư viện | Ghi chú |
| :--- | :--- | :--- | :--- |
| **Tier 1: Web** | Frontend UI | HTML5, CSS3 (Modern Glassmorphism), Vanilla JavaScript | Không cần build/compile qua Webpack hay Vite. |
| | Web Server | Node.js Core `http` module | Zero external dependencies. Có tích hợp HTTP Reverse Proxy. |
| **Tier 2: WAS** | Backend API | Node.js, Express.js (`express`), `cors`, `dotenv` | RESTful API CRUD. |
| | DB Client | `pg` (node-postgres Connection Pool) | Kết nối SSL/TLS với AWS RDS CA Bundle. |
| **Tier 3: DB** | Database Server | Amazon RDS PostgreSQL | Quản lý quan hệ dữ liệu bảng `items`. |
| **Ops & Scripts** | Process Control | Bash Shell (`start.sh`, `shutdown.sh`) | Hỗ trợ daemon nohup, ghi PID và fallback logging tự động. |

---

## 3. Hiện Trạng Dự Án (Current Development Status)

Dự án hiện đã hoàn thiện giai đoạn **Core Functional Implementation** và sẵn sàng cho việc triển khai (Deployment-ready). Cụ thể:

### ✅ Những gì dự án ĐANG CÓ (Implemented Features):
1. **Tầng Web (Frontend)**:
   - Giao diện web hoàn chỉnh chia 2 Tab Lab trực quan:
     - **Lab 1 (RDS PostgreSQL)**: Thêm mới, Sửa, Xóa, Tìm kiếm/Lọc bản ghi `items`.
     - **Lab 2 (Amazon S3 VPC Endpoint Explorer)**: Hiển thị cây thư mục S3 (`S3 Tree View`), điều hướng Breadcrumb, Tạo thư mục mới, Tạo file văn bản/cấu hình, Xem & Sửa nội dung file trực tiếp trên S3, Upload file từ máy tính, Tải file về và Xóa file/thư mục.
   - Bảng trạng thái sức khỏe (Healthcheck & VPC Endpoint Diagnostics) hiển thị trực tiếp tình trạng kết nối tới WAS, Database RDS và **Amazon S3 (kèm IP phân giải DNS để phân biệt Gateway VPC Endpoint và Interface VPC Endpoint)**.
   - Máy chủ `server.js` thuần tự động phục vụ file tĩnh và đóng vai trò **Reverse Proxy** chuyển hướng `/api/*` và `/health*` sang IP nội bộ của WAS.
   - Khởi tạo cấu hình động qua endpoint `/config.js` dựa theo biến môi trường `WAS_API_URL`.

2. **Tầng WAS (Backend API)**:
   - Các API chuẩn RESTful cho bảng dữ liệu `items` (PostgreSQL RDS).
   - Bộ API đầy đủ cho **Amazon S3 (`/api/s3/*`)** sử dụng `@aws-sdk/client-s3`: Hỗ trợ tự động nhận **IAM Role gắn trên EC2 WAS (IMDSv2)** hoặc Access Key, hỗ trợ cả **S3 Gateway VPC Endpoint** lẫn **S3 Interface VPC Endpoint (PrivateLink)**.
   - Cơ chế tự khởi tạo cơ sở dữ liệu (`initDatabase`): Tự động tạo bảng `items` trên PostgreSQL khi backend khởi động nếu chưa tồn tại bảng.
   - Endpoint `/healthz` (hoặc `/ping`) trả về HTTP `200 OK` tức thì mà không truy vấn DB, chuyên dụng cho **AWS ALB Target Group Health Check**.
   - Endpoint `/health` kiểm tra toàn diện trạng thái sống của cả WAS và câu lệnh `SELECT NOW()` tới RDS.
   - Module kiểm tra và tự động nạp chứng chỉ SSL CA bundle (`global-bundle.pem`) khi kết nối vào RDS, đảm bảo không bị lỗi mã hóa kết nối.

3. **Vận hành & Tự động hóa (Ops)**:
   - File cấu hình mẫu Nginx (`nginx.conf.example`) cho trường hợp muốn thay thế Web Server Node bằng Nginx trên EC2 Web.
   - Kịch bản Shell `start.sh` và `shutdown.sh` cho cả hai tầng: tự kiểm tra tiến trình đang chạy, tự cài đặt `node_modules` nếu thiếu, tự ghi PID và tự động fallback thư mục log nếu không có quyền root (`/var/log/node` -> `./logs`).

### ⏳ Các hạng mục TIẾP THEO (Roadmap / Next Steps):
- [ ] Xây dựng kịch bản CI/CD (GitHub Actions / AWS CodePipeline) để tự động deploy mã nguồn lên 2 máy chủ EC2.
- [ ] Viết kịch bản khởi tạo hạ tầng dạng mã (IaC - Terraform hoặc AWS CloudFormation) để tự động dựng VPC, Subnets, Security Groups, ALB, EC2 và RDS.
- [ ] Thêm xác thực IAM Database Authentication (kết nối RDS bằng Token IAM thay vì mật khẩu thông thường).
- [ ] Đóng gói Docker Container (Dockerfile, docker-compose) nếu muốn chạy trên ECS / EKS.

