# Web (Frontend Tier)

Giao diện Web hiện đại chia **2 Tab bài Lab**:
1. **Lab 1 (RDS PostgreSQL)**: Thêm, Sửa, Xóa, Tìm kiếm bản ghi Database.
2. **Lab 2 (Amazon S3 VPC Endpoint)**: Hiển thị cây thư mục **S3 Tree View**, tạo thư mục, tạo file, xem/sửa nội dung file trực tiếp trên S3, upload file, tải xuống, xóa file/thư mục và chẩn đoán DNS kết nối S3 VPC Endpoint.

---

## 1. Điểm nổi bật
- **Siêu nhẹ (Zero Dependencies)**: Viết bằng HTML/CSS/JS thuần và Node.js core `http`, không cần build tool hay `npm install`.
- **Bộ nhớ cực thấp**: Máy chủ phục vụ file tĩnh + Reverse Proxy tiêu tốn **< 20MB RAM**.
- **Cấu hình động trên UI**: Có sẵn nút **Cấu hình WAS** và **Cấu hình S3** trên thanh Header để đổi nhanh địa chỉ WAS hoặc S3 Bucket/VPC Endpoint mà không cần sửa code.
- **Tương thích hoàn toàn với AWS Load Balancer (ALB/NLB)**: Có sẵn endpoint `/web-healthz` và `/healthz` cho Target Group Health Check.

---

## 2. Cách chạy trên EC2 Web

### Cách A: Chạy bằng script hoặc Node.js trực tiếp (Khuyên dùng)
```bash
cd web
./start.sh
# Hoặc chạy trực tiếp: node server.js
```

### Cách B: Phục vụ qua Nginx
Nếu EC2 Web của bạn muốn dùng Nginx thay cho `node server.js`:
```bash
sudo mkdir -p /var/www/demo-web
sudo cp -r * /var/www/demo-web/
sudo cp nginx.conf.example /etc/nginx/conf.d/demo-web.conf
sudo nginx -t && sudo systemctl reload nginx
```

---

## 3. Cấu hình kết nối tới WAS (Bằng IP hoặc Load Balancer)

Trong file `web/.env`, biến `WAS_API_URL` quyết định đích đến mà Web Server sẽ Reverse Proxy tới:

### Trường hợp 1: Trỏ trực tiếp vào IP Private của EC2 WAS
```env
PORT=3000
WAS_API_URL=http://10.0.27.74:5000
```

### Trường hợp 2: Trỏ vào Internal Load Balancer (Internal ALB / NLB) đứng trước cụm WAS
Nếu bạn đặt một **Internal ALB** trước các máy EC2 WAS, chỉ cần thay IP của WAS bằng DNS Name của Internal ALB:
```env
PORT=3000
# Nếu Internal ALB lắng nghe ở cổng 5000:
WAS_API_URL=http://internal-was-alb-123456789.ap-southeast-1.elb.amazonaws.com:5000

# Hoặc nếu Internal ALB lắng nghe ở cổng 80 (và forward vào Target Group WAS cổng 5000):
WAS_API_URL=http://internal-was-alb-123456789.ap-southeast-1.elb.amazonaws.com
```

### Trường hợp 3: Đặt External Load Balancer (Internet-facing ALB) đứng trước cụm EC2 Web
- Bạn **không cần sửa bất kỳ cấu hình IP nào trên Web** vì trình duyệt tự động lấy `window.location.origin` (chính là DNS của External ALB) để gọi về Web Server.
- Cấu hình Target Group cho External ALB:
  - **Protocol / Port**: `HTTP : 3000` (hoặc `80`)
  - **Health check path**: `/web-healthz` (hoặc `/healthz` hoặc `/`)

---

## 4. Lưu ý Security Group trên AWS
- **Inbound Rule của EC2 Web**: Mở port `80` hoặc `3000` cho `0.0.0.0/0` (hoặc chỉ cho phép từ **Security Group của External ALB** nếu có ALB đứng trước).
