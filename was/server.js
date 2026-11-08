require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const dns = require('dns');
const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand
} = require('@aws-sdk/client-s3');

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

// =========================================================
// Cấu hình Amazon S3 & VPC Endpoint (Runtime + .env)
// =========================================================
const DEMO_LOCAL_BUCKET = 'demo-local-s3';

const s3RuntimeConfig = {
  bucket: (process.env.S3_BUCKET || DEMO_LOCAL_BUCKET).trim(),
  region: (process.env.AWS_REGION || process.env.S3_REGION || 'ap-southeast-1').trim(),
  endpointUrl: (process.env.S3_ENDPOINT_URL || '').trim(),
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  accessKeyId: (process.env.AWS_ACCESS_KEY_ID || '').trim(),
  secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || '').trim(),
  sessionToken: (process.env.AWS_SESSION_TOKEN || '').trim()
};

// Kho dữ liệu S3 giả lập trong bộ nhớ (chỉ kích hoạt khi bucket === 'demo-local-s3')
const demoS3Store = new Map([
  [
    'README-LAB.md',
    {
      body: Buffer.from(
        '# Bài Lab Kết Nối Amazon S3 Qua VPC Endpoint\n\n' +
        '- Đang hiển thị chế độ Demo giả lập (`demo-local-s3`).\n' +
        '- Bạn có thể thử nghiệm ngay các thao tác: Tạo thư mục, Tạo file, Xem/Sửa file, Upload và Xóa.\n' +
        '- Khi chạy trên AWS EC2 WAS, hãy bấm nút **"Cấu hình S3"** và nhập tên S3 Bucket thật của bạn!\n',
        'utf8'
      ),
      contentType: 'text/markdown; charset=utf-8',
      lastModified: new Date(Date.now() - 3600 * 1000 * 5)
    }
  ],
  [
    'configs/',
    {
      body: Buffer.from('', 'utf8'),
      contentType: 'application/x-directory',
      lastModified: new Date(Date.now() - 3600 * 1000 * 4)
    }
  ],
  [
    'configs/vpc-endpoint-policy.json',
    {
      body: Buffer.from(
        JSON.stringify(
          {
            Version: '2012-10-17',
            Statement: [
              {
                Sid: 'AllowWASPrivateSubnetAccess via VPCE',
                Effect: 'Allow',
                Principal: '*',
                Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket'],
                Resource: ['arn:aws:s3:::my-lab-bucket', 'arn:aws:s3:::my-lab-bucket/*']
              }
            ]
          },
          null,
          2
        ),
        'utf8'
      ),
      contentType: 'application/json; charset=utf-8',
      lastModified: new Date(Date.now() - 3600 * 1000 * 3)
    }
  ],
  [
    'configs/was-env.conf',
    {
      body: Buffer.from(
        'PORT=5000\nAWS_REGION=ap-southeast-1\nS3_VPC_ENDPOINT_TYPE=GatewayEndpoint\nROUTE_TABLE_PREFIX_LIST=pl-6fa54006\n',
        'utf8'
      ),
      contentType: 'text/plain; charset=utf-8',
      lastModified: new Date(Date.now() - 3600 * 1000 * 2)
    }
  ],
  [
    'vpc-logs/2026-11/s3-access.log',
    {
      body: Buffer.from(
        '[2026-11-08T09:00:12Z] SRC=10.0.27.74 DST=52.219.128.10 PROTO=TCP DPT=443PATH=vpce-0a1b2c3d4e5f ACTION=ACCEPT\n' +
        '[2026-11-08T09:01:05Z] PUT s3://demo-local-s3/configs/vpc-endpoint-policy.json HTTP/1.1 200 OK (18ms)\n',
        'utf8'
      ),
      contentType: 'text/plain; charset=utf-8',
      lastModified: new Date(Date.now() - 1800 * 1000)
    }
  ],
  [
    'backups/rds-schema-backup.sql',
    {
      body: Buffer.from(
        'CREATE TABLE IF NOT EXISTS items (\n  id SERIAL PRIMARY KEY,\n  title VARCHAR(255) NOT NULL,\n  content TEXT\n);\n',
        'utf8'
      ),
      contentType: 'application/sql; charset=utf-8',
      lastModified: new Date(Date.now() - 900 * 1000)
    }
  ]
]);

function createDemoMockS3Client() {
  const { Readable } = require('stream');
  return {
    async send(command) {
      const input = command.input || {};
      const cmdName = command.constructor ? command.constructor.name : '';

      if (cmdName === 'ListObjectsV2Command') {
        const prefix = input.Prefix || '';
        const contents = [];
        for (const [key, val] of demoS3Store.entries()) {
          if (!prefix || key.startsWith(prefix)) {
            contents.push({
              Key: key,
              Size: val.body.length,
              LastModified: val.lastModified,
              ETag: '"demo-etag"',
              StorageClass: 'STANDARD'
            });
          }
        }
        return { Contents: contents, IsTruncated: false };
      }

      if (cmdName === 'GetObjectCommand') {
        const item = demoS3Store.get(input.Key);
        if (!item) {
          const err = new Error(`NoSuchKey: Object "${input.Key}" không tồn tại`);
          err.name = 'NoSuchKey';
          throw err;
        }
        const stream = Readable.from(item.body);
        return {
          Body: stream,
          ContentType: item.contentType,
          ContentLength: item.body.length,
          LastModified: item.lastModified
        };
      }

      if (cmdName === 'PutObjectCommand') {
        const bodyBuf = Buffer.isBuffer(input.Body)
          ? input.Body
          : Buffer.from(String(input.Body || ''), 'utf8');
        demoS3Store.set(input.Key, {
          body: bodyBuf,
          contentType: input.ContentType || 'application/octet-stream',
          lastModified: new Date()
        });
        return { ETag: '"demo-etag-put"' };
      }

      if (cmdName === 'DeleteObjectCommand') {
        demoS3Store.delete(input.Key);
        return {};
      }

      if (cmdName === 'DeleteObjectsCommand') {
        const objs = (input.Delete && input.Delete.Objects) || [];
        for (const o of objs) {
          if (o.Key) demoS3Store.delete(o.Key);
        }
        return { Deleted: objs };
      }

      return {};
    }
  };
}

function normalizeEndpointUrl(rawUrl) {
  if (!rawUrl || !rawUrl.trim()) return '';
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getEffectiveS3Config(overrides = {}) {
  const merged = {
    bucket: overrides.bucket !== undefined ? String(overrides.bucket).trim() : s3RuntimeConfig.bucket,
    region: (overrides.region !== undefined ? String(overrides.region).trim() : s3RuntimeConfig.region) || 'ap-southeast-1',
    endpointUrl: normalizeEndpointUrl(
      overrides.endpointUrl !== undefined ? String(overrides.endpointUrl) : s3RuntimeConfig.endpointUrl
    ),
    forcePathStyle:
      overrides.forcePathStyle !== undefined
        ? Boolean(overrides.forcePathStyle)
        : Boolean(s3RuntimeConfig.forcePathStyle),
    accessKeyId:
      overrides.accessKeyId !== undefined ? String(overrides.accessKeyId).trim() : s3RuntimeConfig.accessKeyId,
    secretAccessKey:
      overrides.secretAccessKey !== undefined
        ? String(overrides.secretAccessKey).trim()
        : s3RuntimeConfig.secretAccessKey,
    sessionToken:
      overrides.sessionToken !== undefined ? String(overrides.sessionToken).trim() : s3RuntimeConfig.sessionToken
  };
  return merged;
}

function createS3Client(cfg) {
  if (cfg.bucket === DEMO_LOCAL_BUCKET) {
    return createDemoMockS3Client();
  }

  const clientOpts = {
    region: cfg.region || 'ap-southeast-1',
    maxAttempts: 2
  };

  if (cfg.endpointUrl) {
    clientOpts.endpoint = cfg.endpointUrl;
    clientOpts.forcePathStyle = Boolean(cfg.forcePathStyle);
  } else if (cfg.forcePathStyle) {
    clientOpts.forcePathStyle = true;
  }

  if (cfg.accessKeyId && cfg.secretAccessKey) {
    clientOpts.credentials = {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      ...(cfg.sessionToken ? { sessionToken: cfg.sessionToken } : {})
    };
  }

  return new S3Client(clientOpts);
}

function isPrivateIpAddress(ip) {
  if (!ip) return false;
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
  return false;
}

async function inspectS3EndpointDns(cfg) {
  if (cfg.bucket === DEMO_LOCAL_BUCKET) {
    return {
      targetHost: 'vpce-demo-local.s3.ap-southeast-1.vpce.amazonaws.com',
      resolvedIps: ['10.0.27.254 (Simulated VPCE)'],
      networkPathHint: 'Chế độ Demo Giả lập (Nhập tên S3 Bucket thật để kết nối AWS S3)'
    };
  }
  let targetHost = `s3.${cfg.region}.amazonaws.com`;
  if (cfg.endpointUrl) {
    try {
      targetHost = new URL(cfg.endpointUrl).hostname;
    } catch {
      targetHost = cfg.endpointUrl;
    }
  } else if (cfg.bucket && !cfg.forcePathStyle) {
    targetHost = `${cfg.bucket}.s3.${cfg.region}.amazonaws.com`;
  }

  try {
    const records = await dns.promises.lookup(targetHost, { all: true });
    const ips = records.map(r => r.address);
    const hasPrivateIp = ips.some(isPrivateIpAddress);
    return {
      targetHost,
      resolvedIps: ips,
      networkPathHint: hasPrivateIp
        ? 'Interface VPC Endpoint (PrivateLink - IP nội bộ VPC)'
        : 'Gateway VPC Endpoint (Prefix List Route Table) / S3 Public IP'
    };
  } catch (err) {
    return {
      targetHost,
      resolvedIps: [],
      dnsError: err.message,
      networkPathHint: 'Không phân giải được DNS S3 Endpoint'
    };
  }
}

function buildS3TroubleshootingHint(err, cfg) {
  const msg = (err && (err.name || err.code || err.message)) ? `${err.name || ''} ${err.code || ''} ${err.message || ''}` : '';
  if (/Timeout|AbortError|ETIMEDOUT|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH/i.test(msg)) {
    return 'Timeout kết nối tới S3! Nếu EC2 WAS nằm ở Private Subnet không có NAT Gateway, hãy kiểm tra: (1) Đã gắn S3 Gateway Endpoint vào Route Table của Private Subnet chưa (Prefix List pl-xxx), hoặc (2) Security Group Outbound của WAS đã mở HTTPS port 443 chưa.';
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) {
    return 'Không phân giải được tên miền S3! Kiểm tra DNS Resolution trong VPC Settings hoặc kiểm tra lại S3_ENDPOINT_URL / Region.';
  }
  if (/AccessDenied|Forbidden|InvalidAccessKeyId|SignatureDoesNotMatch|CredentialsProviderError/i.test(msg)) {
    return 'Lỗi xác thực hoặc phân quyền S3! Kiểm tra: (1) EC2 WAS đã gắn IAM Role có quyền S3 (AmazonS3FullAccess) chưa, (2) VPC Endpoint Policy hoặc Bucket Policy có chặn truy cập không.';
  }
  if (/NoSuchBucket/i.test(msg)) {
    return `Bucket "${cfg.bucket}" không tồn tại hoặc nằm khác Region (${cfg.region}). Hãy kiểm tra lại tên Bucket và Region.`;
  }
  if (/PermanentRedirect|AuthorizationHeaderMalformed/i.test(msg)) {
    return `Sai Region cho Bucket "${cfg.bucket}"! Hãy đổi lại AWS_REGION đúng với Region nơi tạo Bucket.`;
  }
  return 'Kiểm tra cấu hình S3 Bucket, Region, IAM Role trên EC2 WAS và VPC Endpoint.';
}

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '25mb' }));

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

// 0. Root endpoint kiểm tra nhanh khi curl hoặc ping
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'UP',
    tier: 'WAS (Backend)',
    message: 'WAS Backend API đang hoạt động bình thường',
    endpoints: {
      health: '/health',
      healthz: '/healthz',
      items: '/api/items',
      s3Health: '/api/s3/health',
      s3Tree: '/api/s3/tree'
    }
  });
});

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
    database: dbDetails,
    s3: {
      configured: Boolean(s3RuntimeConfig.bucket),
      bucket: s3RuntimeConfig.bucket || null,
      region: s3RuntimeConfig.region,
      endpointUrl: s3RuntimeConfig.endpointUrl || null,
      authMode: s3RuntimeConfig.accessKeyId && s3RuntimeConfig.secretAccessKey ? 'static_keys' : 'iam_role'
    }
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

// =========================================================
// 6. Nhóm API Amazon S3 (S3 Tree Explorer & CRUD qua VPC Endpoint)
// =========================================================

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx', '.html', '.htm',
  '.css', '.scss', '.sql', '.sh', '.bash', '.yaml', '.yml', '.xml',
  '.csv', '.log', '.env', '.ini', '.conf', '.cfg', '.py', '.java', '.go', '.tf'
]);

function guessContentType(key) {
  const ext = path.extname(key || '').toLowerCase();
  const map = {
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.yaml': 'text/yaml; charset=utf-8',
    '.yml': 'text/yaml; charset=utf-8',
    '.sh': 'text/x-shellscript; charset=utf-8',
    '.sql': 'application/sql; charset=utf-8',
    '.log': 'text/plain; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf'
  };
  return map[ext] || 'application/octet-stream';
}

function isLikelyTextObject(key, contentType, buffer) {
  const ext = path.extname(key || '').toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (contentType && /^(text\/|application\/(json|xml|javascript|x-sh|sql|yaml|x-yaml))/i.test(contentType)) {
    return true;
  }
  if (buffer && buffer.length <= 256 * 1024) {
    // Kiểm tra xem có null byte không (nếu không có null byte thì thường là text UTF-8)
    for (let i = 0; i < Math.min(buffer.length, 4096); i++) {
      if (buffer[i] === 0) return false;
    }
    return true;
  }
  return false;
}

function normalizeS3Key(rawKey) {
  if (!rawKey) return '';
  return String(rawKey).trim().replace(/^\/+/, '');
}

// 6.1. Lấy cấu hình S3 hiện tại trên WAS
app.get('/api/s3/config', (req, res) => {
  const hasStaticKeys = Boolean(s3RuntimeConfig.accessKeyId && s3RuntimeConfig.secretAccessKey);
  res.json({
    success: true,
    data: {
      bucket: s3RuntimeConfig.bucket,
      region: s3RuntimeConfig.region,
      endpointUrl: s3RuntimeConfig.endpointUrl,
      forcePathStyle: s3RuntimeConfig.forcePathStyle,
      authMode: hasStaticKeys ? 'static_keys' : 'iam_role',
      accessKeyId: hasStaticKeys ? `${s3RuntimeConfig.accessKeyId.slice(0, 4)}****` : '',
      hasSecretKey: hasStaticKeys
    }
  });
});

// 6.2. Cập nhật cấu hình S3 Runtime từ giao diện Web
app.post('/api/s3/config', (req, res) => {
  const {
    bucket,
    region,
    endpointUrl,
    forcePathStyle,
    authMode,
    accessKeyId,
    secretAccessKey,
    sessionToken
  } = req.body || {};

  if (bucket !== undefined) s3RuntimeConfig.bucket = String(bucket).trim();
  if (region !== undefined && String(region).trim()) s3RuntimeConfig.region = String(region).trim();
  if (endpointUrl !== undefined) s3RuntimeConfig.endpointUrl = normalizeEndpointUrl(String(endpointUrl));
  if (forcePathStyle !== undefined) s3RuntimeConfig.forcePathStyle = Boolean(forcePathStyle);

  if (authMode === 'iam_role') {
    s3RuntimeConfig.accessKeyId = '';
    s3RuntimeConfig.secretAccessKey = '';
    s3RuntimeConfig.sessionToken = '';
  } else if (authMode === 'static_keys') {
    if (accessKeyId && !String(accessKeyId).includes('****')) {
      s3RuntimeConfig.accessKeyId = String(accessKeyId).trim();
    }
    if (secretAccessKey) {
      s3RuntimeConfig.secretAccessKey = String(secretAccessKey).trim();
    }
    if (sessionToken !== undefined) {
      s3RuntimeConfig.sessionToken = String(sessionToken).trim();
    }
  }

  res.json({
    success: true,
    message: 'Đã cập nhật cấu hình kết nối S3 trên WAS',
    data: {
      bucket: s3RuntimeConfig.bucket,
      region: s3RuntimeConfig.region,
      endpointUrl: s3RuntimeConfig.endpointUrl,
      forcePathStyle: s3RuntimeConfig.forcePathStyle,
      authMode: s3RuntimeConfig.accessKeyId && s3RuntimeConfig.secretAccessKey ? 'static_keys' : 'iam_role'
    }
  });
});

// Hàm kiểm tra kết nối S3 & VPC Endpoint
async function runS3Diagnostics(cfg) {
  const dnsInfo = await inspectS3EndpointDns(cfg);
  const authMode = cfg.accessKeyId && cfg.secretAccessKey ? 'Access Key tĩnh' : 'IAM Role (EC2 Instance Profile / Default Chain)';

  if (!cfg.bucket) {
    return {
      success: false,
      status: 'UNCONFIGURED',
      bucket: '',
      region: cfg.region,
      endpointUrl: cfg.endpointUrl || null,
      authMode,
      dns: dnsInfo,
      error: 'Chưa cấu hình tên S3 Bucket (S3_BUCKET). Hãy bấm "Cấu hình S3" để nhập tên Bucket.'
    };
  }

  const start = Date.now();
  try {
    const client = createS3Client(cfg);
    await client.send(
      new ListObjectsV2Command({
        Bucket: cfg.bucket,
        MaxKeys: 1
      }),
      { abortSignal: AbortSignal.timeout(6000) }
    );
    const latencyMs = Date.now() - start;

    return {
      success: true,
      status: 'CONNECTED',
      bucket: cfg.bucket,
      region: cfg.region,
      endpointUrl: cfg.endpointUrl || `https://s3.${cfg.region}.amazonaws.com`,
      forcePathStyle: cfg.forcePathStyle,
      authMode,
      latencyMs,
      dns: dnsInfo
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    return {
      success: false,
      status: 'ERROR',
      bucket: cfg.bucket,
      region: cfg.region,
      endpointUrl: cfg.endpointUrl || `https://s3.${cfg.region}.amazonaws.com`,
      forcePathStyle: cfg.forcePathStyle,
      authMode,
      latencyMs,
      dns: dnsInfo,
      errorCode: err.name || err.code || 'S3Error',
      error: err.message || 'Không thể kết nối tới S3',
      troubleshootingHint: buildS3TroubleshootingHint(err, cfg)
    };
  }
}

// 6.3. Kiểm tra S3 Health & VPC Endpoint hiện tại
app.get('/api/s3/health', async (req, res) => {
  const cfg = getEffectiveS3Config();
  const result = await runS3Diagnostics(cfg);
  res.json(result);
});

// 6.4. Test cấu hình S3 thử nghiệm từ Modal trên UI
app.post('/api/s3/test', async (req, res) => {
  const body = req.body || {};
  const overrides = {
    bucket: body.bucket,
    region: body.region,
    endpointUrl: body.endpointUrl,
    forcePathStyle: body.forcePathStyle
  };
  if (body.authMode === 'iam_role') {
    overrides.accessKeyId = '';
    overrides.secretAccessKey = '';
    overrides.sessionToken = '';
  } else if (body.authMode === 'static_keys') {
    if (body.accessKeyId && !String(body.accessKeyId).includes('****')) {
      overrides.accessKeyId = body.accessKeyId;
    }
    if (body.secretAccessKey) {
      overrides.secretAccessKey = body.secretAccessKey;
    }
    if (body.sessionToken !== undefined) {
      overrides.sessionToken = body.sessionToken;
    }
  }
  const cfg = getEffectiveS3Config(overrides);
  const result = await runS3Diagnostics(cfg);
  res.json(result);
});

// Hàm dựng cấu trúc cây thư mục (Tree View) từ danh sách S3 Objects
function buildS3TreeAndFolderView(objects, rawPrefix = '') {
  const currentPrefix = rawPrefix ? (rawPrefix.replace(/^\/+/, '').replace(/\/?$/, '/')) : '';

  const rootNode = {
    name: '/',
    path: '',
    type: 'folder',
    childrenMap: new Map(),
    files: []
  };

  let totalFiles = 0;
  let totalSize = 0;
  const folderPathsSet = new Set();

  function ensureFolderNode(folderParts) {
    let curr = rootNode;
    let builtPath = '';
    for (const part of folderParts) {
      if (!part) continue;
      builtPath += `${part}/`;
      folderPathsSet.add(builtPath);
      if (!curr.childrenMap.has(part)) {
        curr.childrenMap.set(part, {
          name: part,
          path: builtPath,
          type: 'folder',
          childrenMap: new Map(),
          files: []
        });
      }
      curr = curr.childrenMap.get(part);
    }
    return curr;
  }

  for (const obj of objects) {
    const key = obj.Key;
    if (!key) continue;

    const isExplicitFolder = key.endsWith('/');
    const cleanKey = key.replace(/\/+$/, '');
    const parts = cleanKey ? cleanKey.split('/') : [];

    if (isExplicitFolder) {
      ensureFolderNode(parts);
    } else {
      const fileName = parts.pop();
      const parentFolder = ensureFolderNode(parts);
      const size = Number(obj.Size || 0);
      totalFiles += 1;
      totalSize += size;
      parentFolder.files.push({
        name: fileName,
        key: key,
        type: 'file',
        size: size,
        lastModified: obj.LastModified ? new Date(obj.LastModified).toISOString() : null,
        etag: obj.ETag ? String(obj.ETag).replace(/"/g, '') : null,
        storageClass: obj.StorageClass || 'STANDARD'
      });
    }
  }

  function serializeTreeNode(node) {
    const folders = Array.from(node.childrenMap.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(serializeTreeNode);
    const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name));
    return {
      name: node.name,
      path: node.path,
      type: 'folder',
      folders,
      files,
      folderCount: folders.length,
      fileCount: files.length
    };
  }

  // Tìm node ứng với currentPrefix để trả về danh sách trực tiếp của thư mục đang chọn
  let targetNode = rootNode;
  if (currentPrefix) {
    const prefixParts = currentPrefix.replace(/\/+$/, '').split('/').filter(Boolean);
    for (const p of prefixParts) {
      if (targetNode && targetNode.childrenMap.has(p)) {
        targetNode = targetNode.childrenMap.get(p);
      } else {
        targetNode = null;
        break;
      }
    }
  }

  const directFolders = targetNode
    ? Array.from(targetNode.childrenMap.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(f => ({
          name: f.name,
          path: f.path,
          type: 'folder',
          subfolderCount: f.childrenMap.size,
          fileCount: f.files.length
        }))
    : [];

  const directFiles = targetNode
    ? [...targetNode.files].sort((a, b) => a.name.localeCompare(b.name))
    : [];

  return {
    tree: serializeTreeNode(rootNode),
    currentPrefix,
    folders: directFolders,
    files: directFiles,
    stats: {
      totalFiles,
      totalFolders: folderPathsSet.size,
      totalSize
    }
  };
}

// 6.5. Lấy S3 Tree & danh sách Object theo thư mục (READ TREE)
app.get('/api/s3/tree', async (req, res) => {
  const cfg = getEffectiveS3Config();
  if (!cfg.bucket) {
    return res.status(400).json({
      success: false,
      error: 'Chưa cấu hình S3 Bucket. Hãy cấu hình S3_BUCKET trong was/.env hoặc bấm nút "Cấu hình S3" trên giao diện.'
    });
  }

  const prefix = typeof req.query.prefix === 'string' ? req.query.prefix : '';

  try {
    const client = createS3Client(cfg);
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: cfg.bucket,
        MaxKeys: 1000
      }),
      { abortSignal: AbortSignal.timeout(10000) }
    );

    const contents = response.Contents || [];
    const structured = buildS3TreeAndFolderView(contents, prefix);

    res.json({
      success: true,
      bucket: cfg.bucket,
      region: cfg.region,
      endpointUrl: cfg.endpointUrl || null,
      isTruncated: Boolean(response.IsTruncated),
      ...structured
    });
  } catch (err) {
    console.error('Lỗi khi tải S3 Tree:', err.message);
    res.status(500).json({
      success: false,
      errorCode: err.name || err.code || 'S3Error',
      error: err.message,
      troubleshootingHint: buildS3TroubleshootingHint(err, cfg)
    });
  }
});

// 6.6. Tạo thư mục mới trên S3 (CREATE FOLDER)
app.post('/api/s3/folder', async (req, res) => {
  const cfg = getEffectiveS3Config();
  if (!cfg.bucket) {
    return res.status(400).json({ success: false, error: 'Chưa cấu hình S3 Bucket' });
  }

  const rawPath = (req.body && req.body.folderPath) ? String(req.body.folderPath) : '';
  const folderKey = normalizeS3Key(rawPath).replace(/\/?$/, '/');

  if (!folderKey || folderKey === '/') {
    return res.status(400).json({ success: false, error: 'Tên thư mục không hợp lệ' });
  }

  try {
    const client = createS3Client(cfg);
    await client.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: folderKey,
        Body: '',
        ContentType: 'application/x-directory'
      }),
      { abortSignal: AbortSignal.timeout(8000) }
    );

    res.status(201).json({
      success: true,
      message: `Đã tạo thư mục "${folderKey}" trên S3`,
      data: { key: folderKey }
    });
  } catch (err) {
    console.error('Lỗi khi tạo thư mục S3:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi tạo thư mục S3: ' + err.message,
      troubleshootingHint: buildS3TroubleshootingHint(err, cfg)
    });
  }
});

// 6.7. Xem chi tiết / Nội dung file hoặc Tải xuống file từ S3 (READ / DOWNLOAD OBJECT)
app.get('/api/s3/object', async (req, res) => {
  const cfg = getEffectiveS3Config();
  if (!cfg.bucket) {
    return res.status(400).json({ success: false, error: 'Chưa cấu hình S3 Bucket' });
  }

  const key = normalizeS3Key(req.query.key);
  const isDownload = req.query.download === '1' || req.query.download === 'true';

  if (!key) {
    return res.status(400).json({ success: false, error: 'Thiếu tham số key của object' });
  }

  try {
    const client = createS3Client(cfg);
    const response = await client.send(
      new GetObjectCommand({
        Bucket: cfg.bucket,
        Key: key
      }),
      { abortSignal: AbortSignal.timeout(15000) }
    );

    const contentType = response.ContentType || guessContentType(key);
    const fileName = path.basename(key) || 'download';

    if (isDownload) {
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
      if (response.ContentLength !== undefined) {
        res.setHeader('Content-Length', String(response.ContentLength));
      }
      response.Body.pipe(res);
      return;
    }

    const maxPreviewBytes = 2 * 1024 * 1024; // 2MB
    const size = Number(response.ContentLength || 0);

    if (size > maxPreviewBytes) {
      if (response.Body && typeof response.Body.destroy === 'function') {
        response.Body.destroy();
      }
      return res.json({
        success: true,
        data: {
          key,
          size,
          contentType,
          lastModified: response.LastModified ? new Date(response.LastModified).toISOString() : null,
          isText: false,
          isImage: false,
          tooLargeForPreview: true,
          content: null
        }
      });
    }

    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    const isImage = /^image\/(png|jpeg|jpg|gif|webp|svg\+xml)$/i.test(contentType) ||
      /\.(png|jpe?g|gif|webp|svg)$/i.test(key);
    const isText = isLikelyTextObject(key, contentType, buffer);

    res.json({
      success: true,
      data: {
        key,
        size: buffer.length,
        contentType,
        lastModified: response.LastModified ? new Date(response.LastModified).toISOString() : null,
        isText,
        isImage,
        content: isText ? buffer.toString('utf8') : null,
        base64Preview: (!isText && isImage) ? `data:${contentType};base64,${buffer.toString('base64')}` : null
      }
    });
  } catch (err) {
    console.error('Lỗi khi đọc object S3:', err.message);
    res.status(500).json({
      success: false,
      error: 'Không thể đọc file từ S3: ' + err.message,
      troubleshootingHint: buildS3TroubleshootingHint(err, cfg)
    });
  }
});

// 6.8. Tạo mới file văn bản / cấu hình trên S3 (CREATE OBJECT)
app.post('/api/s3/object', async (req, res) => {
  const cfg = getEffectiveS3Config();
  if (!cfg.bucket) {
    return res.status(400).json({ success: false, error: 'Chưa cấu hình S3 Bucket' });
  }

  const key = normalizeS3Key(req.body && req.body.key);
  const content = (req.body && req.body.content !== undefined) ? String(req.body.content) : '';
  const contentType = (req.body && req.body.contentType) ? String(req.body.contentType) : guessContentType(key);

  if (!key || key.endsWith('/')) {
    return res.status(400).json({ success: false, error: 'Đường dẫn file (Key) không hợp lệ' });
  }

  try {
    const client = createS3Client(cfg);
    const bodyBuffer = Buffer.from(content, 'utf8');
    await client.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: bodyBuffer,
        ContentType: contentType
      }),
      { abortSignal: AbortSignal.timeout(10000) }
    );

    res.status(201).json({
      success: true,
      message: `Đã tạo file "${key}" trên S3 thành công`,
      data: { key, size: bodyBuffer.length, contentType }
    });
  } catch (err) {
    console.error('Lỗi khi tạo file S3:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi tạo file S3: ' + err.message,
      troubleshootingHint: buildS3TroubleshootingHint(err, cfg)
    });
  }
});

// 6.9. Cập nhật nội dung hoặc đổi tên file trên S3 (UPDATE / RENAME OBJECT)
app.put('/api/s3/object', async (req, res) => {
  const cfg = getEffectiveS3Config();
  if (!cfg.bucket) {
    return res.status(400).json({ success: false, error: 'Chưa cấu hình S3 Bucket' });
  }

  const key = normalizeS3Key(req.body && req.body.key);
  const oldKey = normalizeS3Key(req.body && req.body.oldKey);
  const content = (req.body && req.body.content !== undefined) ? String(req.body.content) : '';
  const contentType = (req.body && req.body.contentType) ? String(req.body.contentType) : guessContentType(key);

  if (!key || key.endsWith('/')) {
    return res.status(400).json({ success: false, error: 'Đường dẫn file (Key) không hợp lệ' });
  }

  try {
    const client = createS3Client(cfg);
    const bodyBuffer = Buffer.from(content, 'utf8');

    await client.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: bodyBuffer,
        ContentType: contentType
      }),
      { abortSignal: AbortSignal.timeout(10000) }
    );

    if (oldKey && oldKey !== key) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: cfg.bucket,
          Key: oldKey
        }),
        { abortSignal: AbortSignal.timeout(8000) }
      );
    }

    res.json({
      success: true,
      message: oldKey && oldKey !== key
        ? `Đã cập nhật và đổi tên "${oldKey}" -> "${key}"`
        : `Đã lưu cập nhật file "${key}" trên S3`,
      data: { key, oldKey: oldKey || key, size: bodyBuffer.length }
    });
  } catch (err) {
    console.error('Lỗi khi cập nhật file S3:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi cập nhật file S3: ' + err.message,
      troubleshootingHint: buildS3TroubleshootingHint(err, cfg)
    });
  }
});

// 6.10. Upload file từ máy tính lên S3 (UPLOAD BINARY / FILE)
app.post('/api/s3/upload', async (req, res) => {
  const cfg = getEffectiveS3Config();
  if (!cfg.bucket) {
    return res.status(400).json({ success: false, error: 'Chưa cấu hình S3 Bucket' });
  }

  const key = normalizeS3Key(req.body && req.body.key);
  const base64Content = req.body && req.body.base64Content;
  const contentType = (req.body && req.body.contentType) ? String(req.body.contentType) : guessContentType(key);

  if (!key || key.endsWith('/')) {
    return res.status(400).json({ success: false, error: 'Đường dẫn file (Key) không hợp lệ' });
  }
  if (typeof base64Content !== 'string') {
    return res.status(400).json({ success: false, error: 'Thiếu dữ liệu file upload (base64Content)' });
  }

  try {
    const client = createS3Client(cfg);
    const fileBuffer = Buffer.from(base64Content, 'base64');

    await client.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType
      }),
      { abortSignal: AbortSignal.timeout(20000) }
    );

    res.status(201).json({
      success: true,
      message: `Upload thành công "${key}" (${fileBuffer.length} bytes)`,
      data: { key, size: fileBuffer.length, contentType }
    });
  } catch (err) {
    console.error('Lỗi khi upload file S3:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi upload lên S3: ' + err.message,
      troubleshootingHint: buildS3TroubleshootingHint(err, cfg)
    });
  }
});

// 6.11. Xóa file hoặc xóa toàn bộ thư mục trên S3 (DELETE OBJECT / FOLDER)
app.delete('/api/s3/object', async (req, res) => {
  const cfg = getEffectiveS3Config();
  if (!cfg.bucket) {
    return res.status(400).json({ success: false, error: 'Chưa cấu hình S3 Bucket' });
  }

  const rawKey = (req.query && req.query.key) || (req.body && req.body.key);
  const key = normalizeS3Key(rawKey);

  if (!key) {
    return res.status(400).json({ success: false, error: 'Thiếu đường dẫn Key cần xóa' });
  }

  try {
    const client = createS3Client(cfg);

    // Nếu key kết thúc bằng '/', xóa đệ quy toàn bộ objects bên trong prefix đó
    if (key.endsWith('/')) {
      const listRes = await client.send(
        new ListObjectsV2Command({
          Bucket: cfg.bucket,
          Prefix: key,
          MaxKeys: 1000
        }),
        { abortSignal: AbortSignal.timeout(10000) }
      );

      const objectsToDelete = (listRes.Contents || []).map(item => ({ Key: item.Key }));
      if (objectsToDelete.length === 0) {
        await client.send(
          new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }),
          { abortSignal: AbortSignal.timeout(8000) }
        );
      } else {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: cfg.bucket,
            Delete: { Objects: objectsToDelete, Quiet: true }
          }),
          { abortSignal: AbortSignal.timeout(12000) }
        );
      }

      return res.json({
        success: true,
        message: `Đã xóa thư mục "${key}" (${objectsToDelete.length} object)`,
        deletedCount: objectsToDelete.length
      });
    }

    // Xóa 1 file đơn lẻ
    await client.send(
      new DeleteObjectCommand({
        Bucket: cfg.bucket,
        Key: key
      }),
      { abortSignal: AbortSignal.timeout(8000) }
    );

    res.json({
      success: true,
      message: `Đã xóa "${key}" khỏi S3`,
      deletedCount: 1
    });
  } catch (err) {
    console.error('Lỗi khi xóa object S3:', err.message);
    res.status(500).json({
      success: false,
      error: 'Lỗi xóa trên S3: ' + err.message,
      troubleshootingHint: buildS3TroubleshootingHint(err, cfg)
    });
  }
});

// Lắng nghe cổng
app.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`🚀 WAS Backend Server đang chạy tại PORT: ${PORT}`);
  console.log(`🔗 Endpoint RDS API: http://0.0.0.0:${PORT}/api/items`);
  console.log(`🪣 Endpoint S3 API:  http://0.0.0.0:${PORT}/api/s3/tree`);
  console.log(`🩺 Health check:     http://0.0.0.0:${PORT}/health`);
  if (s3RuntimeConfig.bucket) {
    console.log(`📦 S3 Bucket mặc định: ${s3RuntimeConfig.bucket} (${s3RuntimeConfig.region})`);
  } else {
    console.log(`💡 Mẹo S3: Có thể cấu hình S3_BUCKET trong .env hoặc trực tiếp trên giao diện Web`);
  }
  console.log(`===============================================`);
  initDatabase();
});
