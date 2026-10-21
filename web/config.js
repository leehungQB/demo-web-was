/**
 * Cấu hình kết nối từ Web đến WAS (Web Application Server)
 * Mặc định trỏ về window.location.origin (chính Web Server để dùng Reverse Proxy đến WAS Private IP).
 * Hoặc bạn có thể điền thẳng IP Public của máy EC2 WAS (http://<PUBLIC_IP>:5000).
 */
window.APP_CONFIG = {
  DEFAULT_API_URL: (typeof window !== 'undefined' && window.location && window.location.origin) 
    ? window.location.origin 
    : 'http://localhost:5000'
};
