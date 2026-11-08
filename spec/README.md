# Project Specification & System Documentation

Tài liệu đặc tả toàn diện kiến trúc và mã nguồn hệ thống **3-Tier Web Application (Web - WAS - Database)**. Thư mục `spec/` được thiết kế theo cấu trúc module hóa, rõ ràng và chuẩn hóa để các **AI Models / AI Agents** cũng như kỹ sư có thể đọc hiểu toàn bộ luồng hoạt động, cấu trúc mã nguồn, API và trạng thái dự án.

> [!IMPORTANT]
> **Quy chuẩn bảo mật**: Mọi tài liệu trong thư mục này tuyệt đối không chứa thông tin nhạy cảm, khóa bí mật (private keys), mật khẩu hoặc mã định danh tài khoản. Mọi cấu hình kết nối đều sử dụng định dạng biến đại diện (placeholders).

---

## 📑 Danh Mục Tài Liệu (AI Index)

| Tài liệu | Mô tả |
| :--- | :--- |
| **[00-overview.md](./00-overview.md)** | Tổng quan dự án, triết lý thiết kế (Ultra-lightweight), hiện trạng phát triển (RDS & S3 VPC Endpoint Lab). |
| **[01-architecture-and-flow.md](./01-architecture-and-flow.md)** | Kiến trúc 3 tầng trên AWS, tích hợp External/Internal Load Balancer, S3 VPC Endpoint & Reverse Proxy. |
| **[02-backend-was-spec.md](./02-backend-was-spec.md)** | Đặc tả tầng WAS (Backend): API Catalog cho RDS & S3 (`/api/s3/*`), Health check endpoints, RDS SSL. |
| **[03-frontend-web-spec.md](./03-frontend-web-spec.md)** | Đặc tả tầng Web (Frontend): Giao diện 2 Tab (RDS & S3 Tree Explorer), Dynamic Config, Reverse Proxy. |
| **[04-operations-and-env.md](./04-operations-and-env.md)** | Vận hành hệ thống: Biến môi trường mẫu (RDS, S3, Load Balancer), vòng đời tiến trình (`start.sh`, `shutdown.sh`). |

---

## 🧭 Hướng Dẫn Đọc Dành Cho AI Models (Prompt & Context Consumption)

Khi một AI Model cần nắm bắt ngữ cảnh dự án:
1. **Muốn hiểu tổng quan và trạng thái**: Đọc [00-overview.md](./00-overview.md).
2. **Muốn hiểu luồng mạng, Load Balancer, S3 VPC Endpoint và Reverse Proxy**: Đọc [01-architecture-and-flow.md](./01-architecture-and-flow.md).
3. **Muốn phát triển tiếp hoặc sửa lỗi API RDS / S3**: Đọc [02-backend-was-spec.md](./02-backend-was-spec.md).
4. **Muốn tương tác hoặc thay đổi UI 2 Tab, S3 Tree View, reverse proxy Web**: Đọc [03-frontend-web-spec.md](./03-frontend-web-spec.md).
5. **Muốn triển khai, cấu hình máy chủ, viết script CI/CD**: Đọc [04-operations-and-env.md](./04-operations-and-env.md).

