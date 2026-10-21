require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

// Configuration PostgreSQL
const poolConfig = {
  host: process.env.DB_HOST || 'prv-1a-db01.cfo4k2mmsphe.ap-southeast-1.rds.amazonaws.com',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 10 // Thích hợp cho EC2 tài nguyên thấp (2 core, 2GB RAM)
};

const fs = require('fs');
const path = require('path');

// Cấu hình SSL cho PostgreSQL AWS RDS
// RDS yêu cầu kết nối mã hóa (SSL). Nếu không có SSL sẽ gặp lỗi: "no pg_hba.conf entry ... no encryption"
const isRdsHost = poolConfig.host.includes('rds.amazonaws.com');
const enableSsl = process.env.DB_SSL === 'true' || (process.env.DB_SSL !== 'false' && isRdsHost);

if (enableSsl) {
  // Hàm kiểm tra và giải quyết đường dẫn file cert (hỗ trợ cả trường hợp trỏ vào file hoặc trỏ vào thư mục chứa cert)
  function resolveCertFile(inputPath) {
    if (!inputPath) return null;
    try {
      if (!fs.existsSync(inputPath)) return null;
      const stat = fs.statSync(inputPath);
      if (stat.isFile()) return inputPath;
      if (stat.isDirectory()) {
        const bundlePath = path.join(inputPath, 'global-bundle.pem');
        if (fs.existsSync(bundlePath) && fs.statSync(bundlePath).isFile()) {
          return bundlePath;
        }
        const files = fs.readdirSync(inputPath);
        const pem = files.find(f => f.endsWith('.pem') || f.endsWith('.crt'));
        if (pem) return path.join(inputPath, pem);
      }
    } catch {
      return null;
    }
    return null;
  }

  // Danh sách các vị trí tiềm năng chứa file chứng chỉ
  const candidatePaths = [
    process.env.DB_CA_CERT_PATH,
    path.join(__dirname, 'key-rds'),
    path.join(__dirname, 'key-rds/global-bundle.pem'),
    path.join(__dirname, '../key-rds'),
    path.join(process.cwd(), 'key-rds'),
    path.join(process.env.HOME || '', 'key-rds'),
    path.join(process.env.HOME || '', 'demo-web-was/was/key-rds')
  ].filter(Boolean);

  let foundCaFile = null;
  for (const cand of candidatePaths) {
    const resolved = resolveCertFile(cand);
    if (resolved) {
      foundCaFile = resolved;
      break;
    }
  }

  if (foundCaFile) {
    try {
      console.log(`🔒 Sử dụng Root CA certificate từ file: ${foundCaFile}`);
      poolConfig.ssl = {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
        ca: fs.readFileSync(foundCaFile).toString()
      };
    } catch (readErr) {
      console.warn(`⚠️ Lỗi khi đọc file cert (${foundCaFile}):`, readErr.message);
      poolConfig.ssl = { rejectUnauthorized: false };
    }
  } else {
    // Nếu chưa có file certificate, vẫn bật mã hóa SSL để không bị lỗi "no encryption"
    console.log('🔒 Bật mã hóa SSL kết nối RDS (rejectUnauthorized: false)');
    poolConfig.ssl = { rejectUnauthorized: false };
  }
}

const pool = new Pool(poolConfig);

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// Log request đơn giản giúp người xem demo theo dõi luồng request
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Tự động khởi tạo bảng items nếu chưa có
async function initDatabase() {
  try {
    const client = await pool.connect();
    console.log('✅ Kết nối thành công đến PostgreSQL RDS:', poolConfig.host);
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client.query(createTableQuery);
    console.log('✅ Bảng "items" đã sẵn sàng.');
    client.release();
  } catch (err) {
    console.error('⚠️  Chưa thể kết nối tới DB lúc khởi động:', err.message);
    console.error('👉 Vui lòng kiểm tra lại DB_PASSWORD, Security Group hoặc VPC kết nối từ WAS đến RDS.');
  }
}

// 1. Health check endpoints cho AWS Load Balancer (ALB / NLB / Target Group)
// Endpoint siêu nhẹ trả về HTTP 200 ngay lập tức, không tốn query DB (khuyên dùng cho ALB Target Group Health Check Path: /healthz hoặc /ping)
app.get(['/healthz', '/ping'], (req, res) => {
  res.status(200).json({
    status: 'OK',
    tier: 'WAS (Backend)',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Endpoint chi tiết kiểm tra cả WAS lẫn RDS, luôn trả HTTP 200 cho Load Balancer
app.get('/health', async (req, res) => {
  let dbStatus = 'disconnected';
  let dbDetails = null;

  try {
    const testResult = await pool.query('SELECT NOW() as now, current_database() as db');
    dbStatus = 'connected';
    dbDetails = {
      status: dbStatus,
      host: poolConfig.host,
      dbName: testResult.rows[0].db,
      serverTime: testResult.rows[0].now
    };
  } catch (err) {
    dbDetails = {
      status: dbStatus,
      host: poolConfig.host,
      error: err.message
    };
  }

  // Luôn trả mã HTTP 200 để Target Group trên AWS ALB/ELB đánh giá Healthy
  return res.status(200).json({
    status: dbStatus === 'connected' ? 'UP' : 'DEGRADED',
    tier: 'WAS (Backend)',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    database: dbDetails
  });
});


// 2. Lấy danh sách items (READ)
app.get('/api/items', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, title, content, created_at, updated_at FROM items ORDER BY id DESC'
    );
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    console.error('Lỗi khi lấy danh sách items:', err.message);
    res.status(500).json({ success: false, error: 'Lỗi truy vấn cơ sở dữ liệu: ' + err.message });
  }
});

// 3. Thêm mới item (CREATE)
app.post('/api/items', async (req, res) => {
  const { title, content } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, error: 'Tiêu đề (title) không được để trống' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO items (title, content) VALUES ($1, $2) RETURNING id, title, content, created_at, updated_at',
      [title.trim(), content ? content.trim() : '']
    );
    res.status(201).json({ success: true, message: 'Thêm mới thành công', data: result.rows[0] });
  } catch (err) {
    console.error('Lỗi khi thêm item:', err.message);
    res.status(500).json({ success: false, error: 'Lỗi thêm dữ liệu: ' + err.message });
  }
});

// 4. Cập nhật item (UPDATE)
app.put('/api/items/:id', async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, error: 'Tiêu đề (title) không được để trống' });
  }

  try {
    const result = await pool.query(
      `UPDATE items 
       SET title = $1, content = $2, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3 
       RETURNING id, title, content, created_at, updated_at`,
      [title.trim(), content ? content.trim() : '', id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: `Không tìm thấy item với ID = ${id}` });
    }

    res.json({ success: true, message: 'Cập nhật thành công', data: result.rows[0] });
  } catch (err) {
    console.error('Lỗi khi sửa item:', err.message);
    res.status(500).json({ success: false, error: 'Lỗi cập nhật dữ liệu: ' + err.message });
  }
});

// 5. Xóa item (DELETE)
app.delete('/api/items/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM items WHERE id = $1 RETURNING id', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: `Không tìm thấy item với ID = ${id}` });
    }

    res.json({ success: true, message: `Đã xóa thành công item có ID = ${id}` });
  } catch (err) {
    console.error('Lỗi khi xóa item:', err.message);
    res.status(500).json({ success: false, error: 'Lỗi xóa dữ liệu: ' + err.message });
  }
});

// Lắng nghe cổng
app.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`🚀 WAS Backend Server đang chạy tại PORT: ${PORT}`);
  console.log(`🔗 Endpoint API: http://0.0.0.0:${PORT}/api/items`);
  console.log(`🩺 Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`===============================================`);
  initDatabase();
});
