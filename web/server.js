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

  // 1. Phục vụ config.js động
  if (safePath === '/config.js') {
    const wasTarget = (process.env.WAS_API_URL || '').trim().replace(/\/+$/, '');
    const dynamicConfig = `/**
 * Cấu hình tự động tạo bởi Web Server
 */
window.APP_CONFIG = {
  // Mặc định gọi chính Web Server (sử dụng Reverse Proxy để kết nối vào WAS Private IP)
  DEFAULT_API_URL: window.location.origin,
  WAS_PROXY_ENABLED: ${wasTarget ? 'true' : 'false'},
  WAS_TARGET_URL: "${wasTarget}"
};
`;
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=UTF-8',
      'Cache-Control': 'no-cache'
    });
    return res.end(dynamicConfig);
  }

  // 2. Reverse Proxy các API requests (/api/*, /health, /healthz) sang WAS Private IP
  const wasTargetUrl = process.env.WAS_API_URL;
  if (safePath.startsWith('/api/') || safePath === '/health' || safePath === '/healthz' || safePath === '/ping') {
    if (wasTargetUrl) {
      return proxyToWas(req, res, wasTargetUrl);
    } else {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=UTF-8' });
      return res.end(JSON.stringify({
        status: 'DOWN',
        success: false,
        error: 'Web Server chưa được cấu hình biến môi trường WAS_API_URL trong file .env trên EC2 Web! Vui lòng thêm: WAS_API_URL=http://<WAS_PRIVATE_IP>:5000 vào file web/.env và khởi động lại server.'
      }));
    }
  }

  // 3. Endpoint kiểm tra biến môi trường web server
  if (safePath === '/env.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      PORT,
      WAS_API_URL: process.env.WAS_API_URL || null,
      PROXY_ENABLED: Boolean(process.env.WAS_API_URL)
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

/**
 * Reverse Proxy request từ Web sang WAS Private IP
 */
function proxyToWas(req, res, targetUrl) {
  try {
    const parsedTarget = new URL(targetUrl);
    const isHttps = parsedTarget.protocol === 'https:';
    const transport = isHttps ? require('https') : require('http');

    const headers = { ...req.headers };
    headers.host = parsedTarget.host;
    headers['x-forwarded-for'] = req.socket.remoteAddress || req.headers['x-forwarded-for'] || '';
    headers['x-forwarded-proto'] = req.socket.encrypted ? 'https' : 'http';
    headers['x-forwarded-host'] = req.headers.host || '';

    const basePath = parsedTarget.pathname.replace(/\/+$/, '');
    const proxyPath = basePath ? `${basePath}${req.url}` : req.url;

    const proxyReq = transport.request({
      protocol: parsedTarget.protocol,
      hostname: parsedTarget.hostname,
      port: parsedTarget.port || (isHttps ? 443 : 80),
      path: proxyPath,
      method: req.method,
      headers: headers
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
      console.error(`⚠️ [Reverse Proxy] Lỗi kết nối tới WAS (${targetUrl}):`, err.message);
      res.writeHead(502, { 'Content-Type': 'application/json; charset=UTF-8' });
      res.end(JSON.stringify({
        success: false,
        error: `[Web Proxy] Không thể kết nối tới WAS Backend (${targetUrl}): ${err.message}`
      }));
    });

    req.pipe(proxyReq, { end: true });
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify({ success: false, error: 'Proxy config error: ' + err.message }));
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`🌐 WEB Frontend Server đang chạy tại PORT: ${PORT}`);
  console.log(`👉 Truy cập trình duyệt: http://localhost:${PORT}`);
  if (process.env.WAS_API_URL) {
    console.log(`🔀 Reverse Proxy kích hoạt: trỏ tới ${process.env.WAS_API_URL}`);
  } else {
    console.log(`💡 Mẹo: Bạn có thể cấu hình WAS_API_URL=http://<WAS_PRIVATE_IP>:5000 trong file .env để tự động Reverse Proxy`);
  }
  console.log(`⚡ Bộ nhớ sử dụng: ~${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB RAM`);
  console.log(`===============================================`);
});
