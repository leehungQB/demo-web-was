# Project Specification & System Documentation

Tài liệu đặc tả toàn diện kiến trúc và mã nguồn hệ thống **3-Tier Web Application (Web - WAS - Database)**. Thư mục `spec/` được thiết kế theo cấu trúc module hóa, rõ ràng và chuẩn hóa để các **AI Models / AI Agents** cũng như kỹ sư có thể đọc hiểu toàn bộ luồng hoạt động, cấu trúc mã nguồn, API và trạng thái dự án.

> [!IMPORTANT]
> **Quy chuẩn bảo mật**: Mọi tài liệu trong thư mục này tuyệt đối không chứa thông tin nhạy cảm, khóa bí mật (private keys), mật khẩu hoặc mã định danh tài khoản. Mọi cấu hình kết nối đều sử dụng định dạng biến đại diện (placeholders).

---

## 📑 Danh Mục Tài Liệu (AI Index)

| Tài liệu | Mô tả |
| :--- | :--- |
| **[00-overview.md](file:///home/devops-donglao/aws-leaning/app-web-was/spec/00-overview.md)** | Tổng quan dự án, triết lý thiết kế (Ultra-lightweight), hiện trạng phát triển (Current Status & Roadmap). |
| **[01-architecture-and-flow.md](file:///home/devops-donglao/aws-leaning/app-web-was/spec/01-architecture-and-flow.md)** | Kiến trúc 3 tầng trên AWS, cấu trúc mạng (VPC/Subnets), luồng dữ liệu (Data Flow) & cơ chế Reverse Proxy. |
| **[02-backend-was-spec.md](file:///home/devops-donglao/aws-leaning/app-web-was/spec/02-backend-was-spec.md)** | Đặc tả tầng WAS (Backend): API Catalog, Health check endpoints, cơ chế SSL với RDS CA Bundle, Schema DB. |
| **[03-frontend-web-spec.md](file:///home/devops-donglao/aws-leaning/app-web-was/spec/03-frontend-web-spec.md)** | Đặc tả tầng Web (Frontend): Máy chủ Zero-dependency, Dynamic Config Injection, Reverse Proxy nội bộ. |
| **[04-operations-and-env.md](file:///home/devops-donglao/aws-leaning/app-web-was/spec/04-operations-and-env.md)** | Vận hành hệ thống: Biến môi trường mẫu, vòng đời tiến trình (`start.sh`, `shutdown.sh`), quy chuẩn Logs. |

---

## 🧭 Hướng Dẫn Đọc Dành Cho AI Models (Prompt & Context Consumption)

Khi một AI Model cần nắm bắt ngữ cảnh dự án:
1. **Muốn hiểu tổng quan và trạng thái**: Đọc [00-overview.md](file:///home/devops-donglao/aws-leaning/app-web-was/spec/00-overview.md).
2. **Muốn hiểu luồng mạng, định tuyến và cách Client giao tiếp với Backend**: Đọc [01-architecture-and-flow.md](file:///home/devops-donglao/aws-leaning/app-web-was/spec/01-architecture-and-flow.md).
3. **Muốn phát triển tiếp hoặc sửa lỗi API, Database**: Đọc [02-backend-was-spec.md](file:///home/devops-donglao/aws-leaning/app-web-was/spec/02-backend-was-spec.md).
4. **Muốn tương tác hoặc thay đổi UI, reverse proxy Web**: Đọc [03-frontend-web-spec.md](file:///home/devops-donglao/aws-leaning/app-web-was/spec/03-frontend-web-spec.md).
5. **Muốn triển khai, cấu hình máy chủ, viết script CI/CD**: Đọc [04-operations-and-env.md](file:///home/devops-donglao/aws-leaning/app-web-was/spec/04-operations-and-env.md).

