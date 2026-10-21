/**
 * Ultra-lightweight Web Server sử dụng module 'http' thuần của Node.js
 * Không cần bất kỳ thư viện ngoài nào (Zero Dependencies).
 * Tiêu tốn < 20MB RAM, cực kỳ thích hợp cho EC2 2 core, 2GB RAM.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Tự động đọc file .env nếu có (không cần cài thêm thư viện phụ thuộc)
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of envLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
} catch (e) {}

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // Chuẩn hóa đường dẫn
  let safePath = path.normalize(req.url.split('?')[0]);
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  // 1. Phục vụ config.js động dựa theo biến môi trường WAS_API_URL trên máy chủ Web
  if (safePath === '/config.js' && process.env.WAS_API_URL) {
    const dynamicConfig = `/**
 * Tự động tạo từ biến môi trường máy chủ (WAS_API_URL)
 */
window.APP_CONFIG = {
  DEFAULT_API_URL: "${process.env.WAS_API_URL.trim().replace(/\/+$/, '')}"
};
`;
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=UTF-8',
      'Cache-Control': 'no-cache'
    });
    return res.end(dynamicConfig);
  }

  // 2. Endpoint kiểm tra biến môi trường web server
  if (safePath === '/env.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      PORT,
      WAS_API_URL: process.env.WAS_API_URL || null
    }));
  }

  const filePath = path.join(PUBLIC_DIR, safePath);

  // Đảm bảo không truy cập ra ngoài thư mục web
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback về index.html cho client routing nếu cần
      const indexPath = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(indexPath, (readErr, content) => {
        if (readErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          return res.end('404 Not Found');
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
        res.end(content);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`🌐 WEB Frontend Server đang chạy tại PORT: ${PORT}`);
  console.log(`👉 Truy cập trình duyệt: http://localhost:${PORT}`);
  console.log(`⚡ Bộ nhớ sử dụng: ~${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB RAM`);
  console.log(`===============================================`);
});
