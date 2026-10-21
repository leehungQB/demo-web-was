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

## 3. Cấu hình địa chỉ WAS API
Có 2 cách:
1. **Cách 1 (Trực quan)**: Mở trình duyệt vào Web, bấm nút **"Cấu hình WAS"** ở góc phải trên cùng màn hình &rarr; Nhập URL WAS (ví dụ `http://<EC2_WAS_PUBLIC_IP>:5000`) &rarr; Bấm **"Kiểm tra kết nối"** &rarr; Bấm **"Lưu & Áp Dụng"**.
2. **Cách 2**: Chỉnh sửa file `config.js` trước khi triển khai:
   ```javascript
   window.APP_CONFIG = {
     DEFAULT_API_URL: 'http://<IP_EC2_WAS>:5000'
   };
   ```

---

## 4. Lưu ý Security Group trên AWS
- **Inbound Rule của EC2 Web**: Cần mở port `80` (hoặc `3000`) cho `0.0.0.0/0` (hoặc IP của bạn) để truy cập từ trình duyệt.
