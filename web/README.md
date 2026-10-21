# Web (Frontend Tier)

Giao diện Web 1 màn hình đơn giản, hiện đại, hỗ trợ thao tác Thêm, Sửa, Xóa (CRUD) dữ liệu và theo dõi trạng thái hệ thống 3 tầng (Web - WAS - DB).

---

## 1. Điểm nổi bật
- **Siêu nhẹ**: Viết bằng HTML/CSS/JS thuần, không cần build tool (không cần Vite/Webpack).
- **Bộ nhớ cực thấp**: Máy chủ phục vụ file tĩnh tiêu tốn **< 20MB RAM**, rất mượt mà trên EC2 2 vCPU, 2GB RAM.
- **Tự động cấu hình WAS**: Có sẵn nút **Cấu hình WAS** trên giao diện để đổi IP Backend linh hoạt mà không cần sửa code.
- **Có sẵn Health Check**: Kiểm tra kết nối từ Web -> WAS -> PostgreSQL RDS trực tiếp trên màn hình.

---

## 2. Cách chạy trên EC2 Web

### Cách A: Chạy trực tiếp bằng Node.js (Khuyên dùng - Nhanh nhất)
Không cần cài bất kỳ package ngoài nào (Zero dependencies):
```bash
cd web

# Chạy trực tiếp trên port 3000:
node server.js

# Hoặc chạy trên port 80 (cần quyền sudo):
sudo PORT=80 node server.js
```

Chạy nền bằng PM2:
```bash
sudo npm install -g pm2
pm2 start server.js --name "web-app"
```

### Cách B: Phục vụ qua Nginx
Nếu EC2 Web của bạn đã cài Nginx:
```bash
# 1. Copy toàn bộ file trong thư mục web/ vào /var/www/demo-web
sudo mkdir -p /var/www/demo-web
sudo cp -r * /var/www/demo-web/

# 2. Áp dụng file cấu hình mẫu nginx.conf.example
sudo cp nginx.conf.example /etc/nginx/conf.d/demo-web.conf

# 3. Reload nginx
sudo nginx -t && sudo systemctl reload nginx
```

---

## 3. Cấu hình biến môi trường và địa chỉ WAS API

Ứng dụng hỗ trợ **3 cách** linh hoạt để Web nhận địa chỉ WAS API:

### Cách 1 (Khuyên dùng - Chuẩn 3-Tier bảo mật với IP Private): Dùng Web Server làm Reverse Proxy
Tạo file `.env` trong thư mục `web/` trên máy EC2 Web:
```bash
cp .env.example .env
```
Nội dung file `web/.env` (nhập IP Private của EC2 WAS):
```env
PORT=3000
WAS_API_URL=http://10.0.27.74:5000
```
Hoặc chạy trực tiếp với biến môi trường:
```bash
WAS_API_URL=http://10.0.27.74:5000 node server.js
```
*Web Server sẽ đóng vai trò **Reverse Proxy**: Trình duyệt chỉ cần gọi tới EC2 Web, Web Server sẽ tự động chuyển tiếp request `/api/*` và `/health` sang máy WAS qua IP nội bộ `10.0.27.74:5000` mà không cần public port 5000 ra ngoài Internet.*

### Cách 2 (Dành cho Nginx hoặc Static Hosting): Sửa file `config.js`
Chỉnh sửa file `web/config.js`:
```javascript
window.APP_CONFIG = {
  DEFAULT_API_URL: 'http://<IP_EC2_WAS>:5000'
};
```

### Cách 3 (Trực quan nhất): Cấu hình trực tiếp trên giao diện Web
* Mở trình duyệt &rarr; Bấm nút **"Cấu hình WAS"** ở góc trên bên phải màn hình.
* Nhập URL: `http://<IP_EC2_WAS>:5000` &rarr; Bấm **"Kiểm tra kết nối"** &rarr; Bấm **"Lưu & Áp Dụng"**.
* Trình duyệt sẽ lưu vào `localStorage` của máy bạn.

---

## 4. Lưu ý Security Group trên AWS
- **Inbound Rule của EC2 Web**: Cần mở port `80` (hoặc `3000`) cho `0.0.0.0/0` (hoặc IP của bạn) để truy cập từ trình duyệt.
