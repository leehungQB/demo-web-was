/**
 * Cấu hình mặc định kết nối từ Web đến WAS (Web Application Server)
 * Bạn có thể thay đổi DEFAULT_API_URL tại đây hoặc nhập trực tiếp trên giao diện Web.
 */
window.APP_CONFIG = {
  // Mặc định kết nối tới WAS qua port 5000
  // Thay thế bằng IP Public hoặc Private DNS của máy EC2 WAS khi demo
  DEFAULT_API_URL: window.location.hostname 
    ? `http://${window.location.hostname}:5000` 
    : 'http://localhost:5000'
};
