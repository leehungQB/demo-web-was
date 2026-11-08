/**
 * AWS 3-Tier Demo - Frontend Logic
 * Kết nối Web -> WAS -> RDS PostgreSQL
 */

(() => {
  // 1. Quản lý cấu hình WAS API URL
  const STORAGE_KEY = 'AWS_DEMO_WAS_URL';
  
  function isPrivateIpUrl(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname;
      if (host === 'localhost' || host === '127.0.0.1') return false;
      if (host.startsWith('10.')) return true;
      if (host.startsWith('192.168.')) return true;
      if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
      return false;
    } catch {
      return false;
    }
  }

  function getWasApiUrl() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim()) {
      const cleanSaved = saved.trim().replace(/\/+$/, '');
      // Nếu localStorage lưu IP Private nội bộ (10.x, 192.168.x) mà trình duyệt đang mở từ ngoài:
      // Tự động chuyển sang dùng Web Proxy (window.location.origin) để không bị lỗi Failed to fetch
      if (isPrivateIpUrl(cleanSaved) && window.location.hostname !== new URL(cleanSaved).hostname) {
        console.warn(`[Auto-Fix] Bỏ qua IP nội bộ ${cleanSaved} trong localStorage, chuyển sang Web Proxy:`, window.location.origin);
        localStorage.removeItem(STORAGE_KEY);
      } else {
        return cleanSaved;
      }
    }
    const defaultUrl = (window.APP_CONFIG && window.APP_CONFIG.DEFAULT_API_URL) 
      ? window.APP_CONFIG.DEFAULT_API_URL 
      : (typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'http://localhost:5000');
    return defaultUrl.replace(/\/+$/, '');
  }

  function setWasApiUrl(url) {
    if (!url) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, url.trim().replace(/\/+$/, ''));
    }
  }

  let currentApiUrl = getWasApiUrl();
  let allItems = [];

  // DOM Elements
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const wasIpLabel = document.getElementById('was-ip-label');

  const createForm = document.getElementById('create-form');
  const inputTitle = document.getElementById('input-title');
  const inputContent = document.getElementById('input-content');
  const btnSubmitCreate = document.getElementById('btn-submit-create');

  const itemsContainer = document.getElementById('items-container');
  const itemsCountBadge = document.getElementById('items-count');
  const emptyState = document.getElementById('empty-state');
  const loadingState = document.getElementById('loading-state');
  const inputSearch = document.getElementById('input-search');
  const btnRefresh = document.getElementById('btn-refresh');

  // Edit Modal Elements
  const editModal = document.getElementById('edit-modal');
  const editForm = document.getElementById('edit-form');
  const editItemId = document.getElementById('edit-item-id');
  const editTitle = document.getElementById('edit-title');
  const editContent = document.getElementById('edit-content');
  const btnCloseEdit = document.getElementById('btn-close-edit');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');

  // Config Modal Elements
  const configModal = document.getElementById('config-modal');
  const btnOpenConfig = document.getElementById('btn-open-config');
  const btnCloseConfig = document.getElementById('btn-close-config');
  const configWasUrlInput = document.getElementById('config-was-url');
  const btnTestConnection = document.getElementById('btn-test-connection');
  const btnSaveConfig = document.getElementById('btn-save-config');
  const healthTestOutput = document.getElementById('health-test-output');

  const toastContainer = document.getElementById('toast-container');

  // 2. Toast Notification
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // 3. Escape HTML utility
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // 4. Định dạng thời gian
  function formatDateTime(isoString) {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return isoString;
    }
  }

  // 5. Kiểm tra Health Check kết nối WAS & Database
  async function checkHealth(customUrl = null) {
    const targetUrl = (customUrl || currentApiUrl).replace(/\/+$/, '');
    try {
      const response = await fetch(`${targetUrl}/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      const data = await response.json();

      if (response.ok && data.status === 'UP') {
        if (!customUrl) {
          statusDot.className = 'status-dot status-online';
          statusText.textContent = 'WAS & RDS Online';
        }
        return { success: true, data };
      } else {
        if (!customUrl) {
          statusDot.className = 'status-dot status-unknown';
          statusText.textContent = 'WAS UP (Lỗi DB RDS)';
        }
        return { success: false, data, message: 'WAS phản hồi nhưng DB chưa sẵn sàng' };
      }
    } catch (err) {
      if (!customUrl) {
        statusDot.className = 'status-dot status-offline';
        statusText.textContent = 'Mất kết nối WAS';
      }
      return { success: false, error: err.message };
    }
  }

  // 6. Tải danh sách items (READ)
  async function loadItems() {
    loadingState.classList.remove('hidden');
    emptyState.classList.add('hidden');
    itemsContainer.innerHTML = '';

    try {
      const res = await fetch(`${currentApiUrl}/api/items`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }

      const resData = await res.json();
      allItems = resData.data || [];
      renderItems(allItems);
      checkHealth();
    } catch (err) {
      console.error('Lỗi tải danh sách:', err);
      loadingState.classList.add('hidden');
      checkHealth();
      if (typeof activeTab === 'undefined' || activeTab === 'rds') {
        showToast(`Chưa thể truy vấn RDS: ${err.message}`, 'error');
      }
    }
  }

  // 7. Render danh sách items ra màn hình
  function renderItems(items) {
    loadingState.classList.add('hidden');
    itemsCountBadge.textContent = `${items.length} bản ghi`;

    if (!items || items.length === 0) {
      itemsContainer.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    itemsContainer.innerHTML = items.map(item => `
      <div class="item-card" id="item-${item.id}">
        <div>
          <div class="item-header">
            <span class="item-id-badge">#${item.id}</span>
          </div>
          <h3 class="item-title">${escapeHtml(item.title)}</h3>
          <p class="item-content">${escapeHtml(item.content || '(Không có nội dung)')}</p>
        </div>
        <div class="item-footer">
          <span class="item-time" title="Thời gian tạo">
            🕒 ${formatDateTime(item.created_at)}
          </span>
          <div class="item-card-actions">
            <button class="btn btn-edit-ghost" onclick="window.onEditItemClick(${item.id})" title="Chỉnh sửa">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="btn btn-danger-ghost" onclick="window.onDeleteItemClick(${item.id})" title="Xóa bản ghi">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `).join('');
  }

  // 8. Tạo mới item (CREATE)
  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = inputTitle.value.trim();
    const content = inputContent.value.trim();

    if (!title) {
      showToast('Vui lòng nhập tiêu đề!', 'error');
      return;
    }

    btnSubmitCreate.disabled = true;
    btnSubmitCreate.style.opacity = '0.7';

    try {
      const res = await fetch(`${currentApiUrl}/api/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content })
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Lỗi thêm bản ghi');

      showToast('Thêm bản ghi thành công!', 'success');
      inputTitle.value = '';
      inputContent.value = '';
      loadItems();
    } catch (err) {
      showToast(`Lỗi: ${err.message}`, 'error');
    } finally {
      btnSubmitCreate.disabled = false;
      btnSubmitCreate.style.opacity = '1';
    }
  });

  // 9. Cập nhật item (UPDATE)
  window.onEditItemClick = (id) => {
    const item = allItems.find(i => i.id === id);
    if (!item) return;

    editItemId.value = item.id;
    editTitle.value = item.title;
    editContent.value = item.content || '';
    editModal.classList.remove('hidden');
    editTitle.focus();
  };

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = editItemId.value;
    const title = editTitle.value.trim();
    const content = editContent.value.trim();

    if (!title) {
      showToast('Tiêu đề không được để trống!', 'error');
      return;
    }

    try {
      const res = await fetch(`${currentApiUrl}/api/items/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content })
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Lỗi cập nhật');

      showToast('Cập nhật bản ghi thành công!', 'success');
      editModal.classList.add('hidden');
      loadItems();
    } catch (err) {
      showToast(`Lỗi cập nhật: ${err.message}`, 'error');
    }
  });

  btnCloseEdit.addEventListener('click', () => editModal.classList.add('hidden'));
  btnCancelEdit.addEventListener('click', () => editModal.classList.add('hidden'));

  // 10. Xóa item (DELETE)
  window.onDeleteItemClick = async (id) => {
    const confirmDelete = window.confirm(`Bạn có chắc muốn xóa bản ghi #${id} khỏi PostgreSQL RDS?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`${currentApiUrl}/api/items/${id}`, {
        method: 'DELETE'
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Lỗi xóa bản ghi');

      showToast(`Đã xóa bản ghi #${id}`, 'success');
      loadItems();
    } catch (err) {
      showToast(`Lỗi xóa: ${err.message}`, 'error');
    }
  };

  // 11. Tìm kiếm / lọc danh sách
  inputSearch.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    if (!term) {
      renderItems(allItems);
      return;
    }
    const filtered = allItems.filter(item => 
      (item.title && item.title.toLowerCase().includes(term)) ||
      (item.content && item.content.toLowerCase().includes(term)) ||
      String(item.id).includes(term)
    );
    renderItems(filtered);
  });

  btnRefresh.addEventListener('click', () => {
    loadItems();
    showToast('Đang làm mới dữ liệu...', 'info');
  });

  // 12. Cấu hình WAS URL Modal
  function updateArchLabel() {
    try {
      if (!currentApiUrl || currentApiUrl === window.location.origin) {
        wasIpLabel.textContent = 'Web Proxy 🔀 WAS';
        return;
      }
      const parsed = new URL(currentApiUrl);
      wasIpLabel.textContent = `${parsed.hostname}:${parsed.port || '80'}`;
    } catch {
      wasIpLabel.textContent = currentApiUrl;
    }
  }

  btnOpenConfig.addEventListener('click', () => {
    configWasUrlInput.value = currentApiUrl;
    healthTestOutput.classList.add('hidden');
    configModal.classList.remove('hidden');
  });

  const btnUseProxy = document.getElementById('btn-use-proxy');
  if (btnUseProxy) {
    btnUseProxy.addEventListener('click', () => {
      configWasUrlInput.value = window.location.origin;
      showToast('Đã chọn Web Proxy! Đang kiểm tra kết nối...', 'info');
      btnTestConnection.click();
    });
  }

  btnCloseConfig.addEventListener('click', () => configModal.classList.add('hidden'));

  btnTestConnection.addEventListener('click', async () => {
    const testUrl = configWasUrlInput.value.trim();
    if (!testUrl) {
      showToast('Vui lòng nhập URL hợp lệ', 'error');
      return;
    }

    healthTestOutput.classList.remove('hidden');
    healthTestOutput.className = 'health-box';
    healthTestOutput.innerHTML = '⏳ Đang gửi request kiểm tra kết nối...';

    const result = await checkHealth(testUrl);
    if (result.success) {
      healthTestOutput.className = 'health-box success';
      healthTestOutput.innerHTML = `✅ KẾT NỐI THÀNH CÔNG!<br>` +
        `WAS Status: ${result.data.status}<br>` +
        `RDS Database: ${result.data.database.host}<br>` +
        `Database Name: ${result.data.database.dbName}<br>` +
        `Server Time: ${result.data.database.serverTime}`;
    } else {
      healthTestOutput.className = 'health-box error';
      let hint = '👉 Kiểm tra lại Security Group port 5000 và tiến trình Node trên EC2 WAS.';
      if (testUrl.includes('10.') || testUrl.includes('172.') || testUrl.includes('192.168.')) {
        hint = `⚠️ <strong>Phát hiện IP nội bộ (${testUrl}):</strong><br>` +
          `Trình duyệt trên máy tính cá nhân KHÔNG THỂ gọi trực tiếp vào IP Private của AWS.<br>` +
          `👉 Hãy bấm nút <strong>"Dùng Web Proxy"</strong> để Web EC2 (${window.location.origin}) chuyển tiếp yêu cầu đến WAS.`;
      }
      healthTestOutput.innerHTML = `❌ KẾT NỐI THẤT BẠI!<br>` +
        `Lỗi: ${result.error || result.message || 'Không thể liên lạc'}<br>${hint}`;
    }
  });

  btnSaveConfig.addEventListener('click', () => {
    const newUrl = configWasUrlInput.value.trim();
    if (!newUrl) {
      showToast('Vui lòng nhập URL WAS!', 'error');
      return;
    }
    setWasApiUrl(newUrl);
    currentApiUrl = getWasApiUrl();
    updateArchLabel();
    configModal.classList.add('hidden');
    showToast(`Đã lưu URL WAS: ${currentApiUrl}`, 'success');
    loadItems();
    checkS3Health();
    if (activeTab === 's3') {
      loadS3Tree();
    }
  });

  // =========================================================
  // 13. Chuyển đổi Tab (Lab 1: RDS PostgreSQL <-> Lab 2: Amazon S3)
  // =========================================================
  const TAB_STORAGE_KEY = 'AWS_DEMO_ACTIVE_TAB';
  let activeTab = localStorage.getItem(TAB_STORAGE_KEY) || 'rds';

  const tabBtnRds = document.getElementById('tab-btn-rds');
  const tabBtnS3 = document.getElementById('tab-btn-s3');
  const panelRds = document.getElementById('panel-rds');
  const panelS3 = document.getElementById('panel-s3');

  const archStep3Title = document.getElementById('arch-step-3-title');
  const archStep3Desc = document.getElementById('arch-step-3-desc');
  const archArrow4 = document.getElementById('arch-arrow-4');
  const archStep4 = document.getElementById('arch-step-4');
  const archStep4Desc = document.getElementById('arch-step-4-desc');

  function switchTab(tabName) {
    activeTab = tabName === 's3' ? 's3' : 'rds';
    localStorage.setItem(TAB_STORAGE_KEY, activeTab);

    if (activeTab === 's3') {
      tabBtnRds.classList.remove('active');
      tabBtnS3.classList.add('active');
      panelRds.classList.add('hidden');
      panelS3.classList.remove('hidden');

      archStep3Title.textContent = 'VPC Endpoint';
      archStep3Desc.textContent = 'Gateway / Interface vpce';
      archArrow4.classList.remove('hidden');
      archStep4.classList.remove('hidden');

      checkS3Health();
      loadS3Tree();
    } else {
      tabBtnS3.classList.remove('active');
      tabBtnRds.classList.add('active');
      panelS3.classList.add('hidden');
      panelRds.classList.remove('hidden');

      archStep3Title.textContent = 'DB Tier';
      archStep3Desc.textContent = 'PostgreSQL RDS :5432';
      archArrow4.classList.add('hidden');
      archStep4.classList.add('hidden');
    }
  }

  if (tabBtnRds) tabBtnRds.addEventListener('click', () => switchTab('rds'));
  if (tabBtnS3) tabBtnS3.addEventListener('click', () => switchTab('s3'));

  // =========================================================
  // 14. Logic Amazon S3 & VPC Endpoint Explorer
  // =========================================================
  const s3StatusPill = document.getElementById('s3-status-pill');
  const s3StatusDot = document.getElementById('s3-status-dot');
  const s3StatusText = document.getElementById('s3-status-text');
  const btnOpenS3Config = document.getElementById('btn-open-s3-config');
  const btnS3OpenCfgInline = document.getElementById('btn-s3-open-cfg-inline');
  const btnS3CheckNow = document.getElementById('btn-s3-check-now');

  const s3DiagBucket = document.getElementById('s3-diag-bucket');
  const s3DiagAuth = document.getElementById('s3-diag-auth');
  const s3DiagIp = document.getElementById('s3-diag-ip');
  const s3DiagMode = document.getElementById('s3-diag-mode');
  const s3DiagErrorBanner = document.getElementById('s3-diag-error-banner');

  const s3TreeView = document.getElementById('s3-tree-view');
  const s3TreeStats = document.getElementById('s3-tree-stats');
  const btnS3ExpandAll = document.getElementById('btn-s3-expand-all');
  const s3Breadcrumbs = document.getElementById('s3-breadcrumbs');
  const s3ObjectsTbody = document.getElementById('s3-objects-tbody');
  const s3Table = document.getElementById('s3-table');
  const s3EmptyState = document.getElementById('s3-empty-state');
  const s3EmptyTitle = document.getElementById('s3-empty-title');
  const s3EmptyDesc = document.getElementById('s3-empty-desc');
  const s3LoadingState = document.getElementById('s3-loading-state');
  const s3FilterInput = document.getElementById('s3-filter-input');
  const s3FolderMeta = document.getElementById('s3-folder-meta');

  const btnS3CreateFolder = document.getElementById('btn-s3-create-folder');
  const btnS3CreateFile = document.getElementById('btn-s3-create-file');
  const btnS3Upload = document.getElementById('btn-s3-upload');
  const s3UploadInput = document.getElementById('s3-upload-input');
  const btnS3Refresh = document.getElementById('btn-s3-refresh');

  // S3 Config Modal Elements
  const s3ConfigModal = document.getElementById('s3-config-modal');
  const btnCloseS3Config = document.getElementById('btn-close-s3-config');
  const s3CfgBucket = document.getElementById('s3-cfg-bucket');
  const s3CfgRegion = document.getElementById('s3-cfg-region');
  const s3CfgEndpoint = document.getElementById('s3-cfg-endpoint');
  const s3CfgPathStyle = document.getElementById('s3-cfg-path-style');
  const s3CfgAuthMode = document.getElementById('s3-cfg-auth-mode');
  const s3StaticKeysBox = document.getElementById('s3-static-keys-box');
  const s3CfgAccessKey = document.getElementById('s3-cfg-access-key');
  const s3CfgSecretKey = document.getElementById('s3-cfg-secret-key');
  const s3TestOutput = document.getElementById('s3-test-output');
  const btnS3TestConn = document.getElementById('btn-s3-test-conn');
  const btnS3SaveConfig = document.getElementById('btn-s3-save-config');

  // S3 Folder Modal Elements
  const s3FolderModal = document.getElementById('s3-folder-modal');
  const btnCloseS3Folder = document.getElementById('btn-close-s3-folder');
  const btnCancelS3Folder = document.getElementById('btn-cancel-s3-folder');
  const s3FolderForm = document.getElementById('s3-folder-form');
  const s3FolderPathInput = document.getElementById('s3-folder-path-input');

  // S3 File Modal Elements
  const s3FileModal = document.getElementById('s3-file-modal');
  const s3FileModalTitle = document.getElementById('s3-file-modal-title');
  const btnCloseS3File = document.getElementById('btn-close-s3-file');
  const btnCancelS3File = document.getElementById('btn-cancel-s3-file');
  const s3FileForm = document.getElementById('s3-file-form');
  const s3FileOldKey = document.getElementById('s3-file-old-key');
  const s3FileKeyInput = document.getElementById('s3-file-key-input');
  const s3FileTypeInput = document.getElementById('s3-file-type-input');
  const s3FileContentInput = document.getElementById('s3-file-content-input');
  const s3TextEditorWrap = document.getElementById('s3-text-editor-wrap');
  const s3BinaryPreviewWrap = document.getElementById('s3-binary-preview-wrap');
  const btnS3DownloadModal = document.getElementById('btn-s3-download-modal');
  const btnSaveS3File = document.getElementById('btn-save-s3-file');

  // State cho S3 Explorer
  let currentS3Prefix = '';
  let currentS3Tree = null;
  let currentS3Folders = [];
  let currentS3Files = [];
  let currentS3Bucket = '';
  let expandedFolders = new Set(['']); // Mặc định mở root
  let allTreeExpanded = true;

  function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (n === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(n) / Math.log(k)), sizes.length - 1);
    return `${parseFloat((n / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1))} ${sizes[i]}`;
  }

  // 14.1. Kiểm tra trạng thái S3 & VPC Endpoint
  async function checkS3Health() {
    try {
      const res = await fetch(`${currentApiUrl}/api/s3/health`);
      const data = await res.json();

      if (data.bucket) {
        currentS3Bucket = data.bucket;
        s3DiagBucket.textContent = `${data.bucket} (${data.region || 'ap-southeast-1'})`;
        if (archStep4Desc) archStep4Desc.textContent = `s3://${data.bucket}`;
      } else {
        s3DiagBucket.textContent = `Chưa cấu hình (${data.region || 'ap-southeast-1'})`;
      }

      s3DiagAuth.textContent = data.authMode || 'IAM Role / Default';

      if (data.dns && data.dns.resolvedIps && data.dns.resolvedIps.length > 0) {
        s3DiagIp.textContent = `${data.dns.resolvedIps.slice(0, 2).join(', ')}`;
        s3DiagMode.textContent = data.dns.networkPathHint || 'S3 Endpoint';
      } else if (data.dns && data.dns.targetHost) {
        s3DiagIp.textContent = data.dns.targetHost;
        s3DiagMode.textContent = data.dns.networkPathHint || 'Chưa phân giải DNS';
      }

      if (data.status === 'CONNECTED') {
        s3StatusDot.className = 'status-dot status-online';
        s3StatusText.textContent = `S3 Online (${data.latencyMs}ms)`;
        s3DiagMode.textContent = `${data.dns ? data.dns.networkPathHint : 'S3 Connected'} (${data.latencyMs}ms)`;
        s3DiagErrorBanner.classList.add('hidden');
      } else if (data.status === 'UNCONFIGURED') {
        s3StatusDot.className = 'status-dot status-unknown';
        s3StatusText.textContent = 'S3: Chưa cấu hình Bucket';
        s3DiagErrorBanner.classList.remove('hidden');
        s3DiagErrorBanner.innerHTML = `ℹ️ <strong>Chưa cấu hình S3 Bucket:</strong> Bấm nút <strong>"⚙️ Đổi Bucket / VPC Endpoint"</strong> để nhập tên S3 Bucket cho bài Lab.`;
      } else {
        s3StatusDot.className = 'status-dot status-offline';
        s3StatusText.textContent = 'S3: Lỗi kết nối';
        s3DiagErrorBanner.classList.remove('hidden');
        s3DiagErrorBanner.innerHTML = `❌ <strong>Lỗi kết nối S3 (${escapeHtml(data.errorCode || 'Error')}):</strong> ${escapeHtml(data.error || '')}<br>` +
          `💡 <em>Gợi ý xử lý:</em> ${escapeHtml(data.troubleshootingHint || '')}`;
      }
      return data;
    } catch (err) {
      s3StatusDot.className = 'status-dot status-offline';
      s3StatusText.textContent = 'S3: Mất kết nối WAS';
      return { success: false, error: err.message };
    }
  }

  // 14.2. Tải S3 Tree và danh sách file/folder
  async function loadS3Tree(prefix = currentS3Prefix) {
    currentS3Prefix = prefix || '';
    s3LoadingState.classList.remove('hidden');
    s3EmptyState.classList.add('hidden');
    s3ObjectsTbody.innerHTML = '';

    try {
      const url = `${currentApiUrl}/api/s3/tree?prefix=${encodeURIComponent(currentS3Prefix)}`;
      const res = await fetch(url);
      const data = await res.json();

      s3LoadingState.classList.add('hidden');

      if (!res.ok || !data.success) {
        s3Table.classList.add('hidden');
        s3EmptyState.classList.remove('hidden');
        s3EmptyTitle.textContent = 'Chưa thể tải dữ liệu từ Amazon S3';
        s3EmptyDesc.innerHTML = `${escapeHtml(data.error || 'Lỗi kết nối S3')}<br><small style="color:#fda4af">${escapeHtml(data.troubleshootingHint || '')}</small>`;
        s3TreeView.innerHTML = `<div class="s3-tree-placeholder">${escapeHtml(data.error || 'Chưa kết nối S3')}</div>`;
        return;
      }

      currentS3Bucket = data.bucket || currentS3Bucket;
      currentS3Tree = data.tree;
      currentS3Folders = data.folders || [];
      currentS3Files = data.files || [];

      if (data.stats) {
        s3TreeStats.textContent = `${data.stats.totalFolders} thư mục • ${data.stats.totalFiles} file (${formatBytes(data.stats.totalSize)})`;
      }

      // Mặc định mở các nhánh dẫn tới currentS3Prefix
      expandedFolders.add('');
      if (currentS3Prefix) {
        const parts = currentS3Prefix.replace(/\/+$/, '').split('/');
        let acc = '';
        for (const p of parts) {
          if (!p) continue;
          acc += `${p}/`;
          expandedFolders.add(acc);
        }
      }

      renderS3TreeSidebar();
      renderS3Breadcrumbs();
      renderS3Table(currentS3Folders, currentS3Files);
    } catch (err) {
      s3LoadingState.classList.add('hidden');
      s3Table.classList.add('hidden');
      s3EmptyState.classList.remove('hidden');
      s3EmptyTitle.textContent = 'Không thể kết nối đến WAS API';
      s3EmptyDesc.textContent = err.message;
    }
  }

  // 14.3. Render S3 Tree View bên trái
  function renderS3TreeSidebar() {
    if (!currentS3Tree) {
      s3TreeView.innerHTML = `<div class="s3-tree-placeholder">Chưa có dữ liệu cây thư mục</div>`;
      return;
    }

    function buildNodeHtml(folderNode, isRoot = false) {
      const folderPath = folderNode.path || '';
      const isExpanded = isRoot || allTreeExpanded || expandedFolders.has(folderPath);
      const isActive = currentS3Prefix === folderPath;
      const hasChildren = (folderNode.folders && folderNode.folders.length > 0) || (folderNode.files && folderNode.files.length > 0);
      const caret = hasChildren ? (isExpanded ? '▼' : '▶') : '•';
      const displayName = isRoot ? `🪣 ${currentS3Bucket || 'root'} /` : `📁 ${folderNode.name}`;
      const itemCount = (folderNode.folderCount || 0) + (folderNode.fileCount || 0);

      let html = `<li>`;
      html += `
        <div class="tree-node-row ${isActive ? 'active' : ''}" onclick="window.onSelectTreeFolder('${escapeHtml(folderPath)}', event)">
          <span class="tree-toggle-caret" onclick="window.onToggleTreeFolder('${escapeHtml(folderPath)}', event)">${caret}</span>
          <span class="tree-node-name" title="${escapeHtml(folderPath || '/')}">${escapeHtml(displayName)}</span>
          <span class="tree-node-meta">${itemCount > 0 ? itemCount : ''}</span>
        </div>
      `;

      if (hasChildren && isExpanded) {
        html += `<ul class="tree-ul">`;
        for (const subFolder of (folderNode.folders || [])) {
          html += buildNodeHtml(subFolder, false);
        }
        for (const file of (folderNode.files || [])) {
          html += `
            <li>
              <div class="tree-node-row" onclick="window.onOpenS3File('${escapeHtml(file.key)}')" title="Click để xem / sửa file ${escapeHtml(file.key)}">
                <span class="tree-toggle-caret"></span>
                <span class="tree-node-name">📄 ${escapeHtml(file.name)}</span>
                <span class="tree-node-meta">${formatBytes(file.size)}</span>
              </div>
            </li>
          `;
        }
        html += `</ul>`;
      }

      html += `</li>`;
      return html;
    }

    s3TreeView.innerHTML = `<ul class="tree-ul tree-root-ul">${buildNodeHtml(currentS3Tree, true)}</ul>`;
  }

  window.onToggleTreeFolder = (folderPath, event) => {
    if (event) event.stopPropagation();
    allTreeExpanded = false;
    if (expandedFolders.has(folderPath)) {
      expandedFolders.delete(folderPath);
    } else {
      expandedFolders.add(folderPath);
    }
    renderS3TreeSidebar();
  };

  window.onSelectTreeFolder = (folderPath, event) => {
    if (event) event.stopPropagation();
    expandedFolders.add(folderPath);
    loadS3Tree(folderPath);
  };

  if (btnS3ExpandAll) {
    btnS3ExpandAll.addEventListener('click', () => {
      allTreeExpanded = !allTreeExpanded;
      btnS3ExpandAll.textContent = allTreeExpanded ? 'Thu gọn' : 'Mở rộng';
      if (!allTreeExpanded) {
        expandedFolders = new Set(['']);
      }
      renderS3TreeSidebar();
    });
  }

  // 14.4. Render Breadcrumbs điều hướng
  function renderS3Breadcrumbs() {
    const parts = currentS3Prefix ? currentS3Prefix.replace(/\/+$/, '').split('/').filter(Boolean) : [];
    let html = `<button type="button" class="crumb-btn ${parts.length === 0 ? 'active' : ''}" onclick="window.onSelectTreeFolder('')">🪣 ${escapeHtml(currentS3Bucket || 'root')}</button>`;

    let built = '';
    parts.forEach((part, idx) => {
      built += `${part}/`;
      const isLast = idx === parts.length - 1;
      html += `<span class="crumb-sep">/</span>`;
      html += `<button type="button" class="crumb-btn ${isLast ? 'active' : ''}" onclick="window.onSelectTreeFolder('${escapeHtml(built)}')">${escapeHtml(part)}</button>`;
    });

    s3Breadcrumbs.innerHTML = html;
    s3FolderMeta.textContent = `Đang mở: /${currentS3Prefix} (${currentS3Folders.length} thư mục, ${currentS3Files.length} file)`;
  }

  // 14.5. Render bảng danh sách Thư mục & File trong nhánh hiện tại
  function renderS3Table(folders, files) {
    const rows = [];

    // Nút lên 1 cấp nếu đang ở trong thư mục con
    if (currentS3Prefix) {
      const trimmed = currentS3Prefix.replace(/\/+$/, '');
      const lastSlash = trimmed.lastIndexOf('/');
      const parentPrefix = lastSlash !== -1 ? `${trimmed.slice(0, lastSlash + 1)}` : '';
      rows.push(`
        <tr>
          <td colspan="5">
            <button type="button" class="s3-item-link" onclick="window.onSelectTreeFolder('${escapeHtml(parentPrefix)}')">
              <span>⬆️ .. (Quay lại thư mục cha)</span>
            </button>
          </td>
        </tr>
      `);
    }

    for (const folder of folders) {
      rows.push(`
        <tr>
          <td>
            <button type="button" class="s3-item-link" onclick="window.onSelectTreeFolder('${escapeHtml(folder.path)}')">
              <span>📁</span>
              <span>${escapeHtml(folder.name)}/</span>
            </button>
          </td>
          <td><span class="s3-badge-type s3-badge-folder">Folder</span></td>
          <td><span class="mono" style="color: var(--text-subtle); font-size: 0.78rem;">${folder.subfolderCount} nhánh, ${folder.fileCount} file</span></td>
          <td><span style="color: var(--text-subtle);">---</span></td>
          <td>
            <div class="s3-row-actions">
              <button type="button" class="btn btn-secondary btn-xs" onclick="window.onSelectTreeFolder('${escapeHtml(folder.path)}')" title="Mở thư mục">
                Mở
              </button>
              <button type="button" class="btn btn-danger-ghost" onclick="window.onDeleteS3Item('${escapeHtml(folder.path)}', true)" title="Xóa toàn bộ thư mục này">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `);
    }

    for (const file of files) {
      rows.push(`
        <tr>
          <td>
            <button type="button" class="s3-item-link" onclick="window.onOpenS3File('${escapeHtml(file.key)}')">
              <span>📄</span>
              <span>${escapeHtml(file.name)}</span>
            </button>
          </td>
          <td><span class="s3-badge-type">Object</span></td>
          <td><span style="font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;">${formatBytes(file.size)}</span></td>
          <td><span style="font-size: 0.78rem; color: var(--text-muted);">${formatDateTime(file.lastModified)}</span></td>
          <td>
            <div class="s3-row-actions">
              <button type="button" class="btn btn-edit-ghost" onclick="window.onOpenS3File('${escapeHtml(file.key)}')" title="Xem / Chỉnh sửa file">
                ✏️ Sửa
              </button>
              <button type="button" class="btn btn-secondary btn-xs" onclick="window.onDownloadS3File('${escapeHtml(file.key)}')" title="Tải file về máy">
                ⬇️
              </button>
              <button type="button" class="btn btn-danger-ghost" onclick="window.onDeleteS3Item('${escapeHtml(file.key)}', false)" title="Xóa file khỏi S3">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `);
    }

    if (folders.length === 0 && files.length === 0) {
      s3ObjectsTbody.innerHTML = rows.join('');
      if (!currentS3Prefix) {
        s3Table.classList.add('hidden');
      } else {
        s3Table.classList.remove('hidden');
      }
      s3EmptyState.classList.remove('hidden');
      s3EmptyTitle.textContent = currentS3Prefix ? `Thư mục "/${currentS3Prefix}" đang trống` : 'Bucket S3 hiện chưa có Object nào';
      s3EmptyDesc.innerHTML = 'Hãy bấm <strong>"+ Thư mục"</strong>, <strong>"+ Tạo File"</strong> hoặc <strong>"Upload File"</strong> để thêm dữ liệu lên S3.';
    } else {
      s3Table.classList.remove('hidden');
      s3EmptyState.classList.add('hidden');
      s3ObjectsTbody.innerHTML = rows.join('');
    }
  }

  // Lọc nhanh file/thư mục trên bảng S3
  if (s3FilterInput) {
    s3FilterInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        renderS3Table(currentS3Folders, currentS3Files);
        return;
      }
      const fFolders = currentS3Folders.filter(f => f.name.toLowerCase().includes(q));
      const fFiles = currentS3Files.filter(f => f.name.toLowerCase().includes(q) || f.key.toLowerCase().includes(q));
      renderS3Table(fFolders, fFiles);
    });
  }

  // 14.6. Tạo thư mục S3 mới (CREATE FOLDER)
  if (btnS3CreateFolder) {
    btnS3CreateFolder.addEventListener('click', () => {
      s3FolderPathInput.value = currentS3Prefix ? `${currentS3Prefix}new-folder/` : 'demo-folder/';
      s3FolderModal.classList.remove('hidden');
      s3FolderPathInput.focus();
    });
  }

  if (btnCloseS3Folder) btnCloseS3Folder.addEventListener('click', () => s3FolderModal.classList.add('hidden'));
  if (btnCancelS3Folder) btnCancelS3Folder.addEventListener('click', () => s3FolderModal.classList.add('hidden'));

  if (s3FolderForm) {
    s3FolderForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rawFolder = s3FolderPathInput.value.trim();
      if (!rawFolder) {
        showToast('Vui lòng nhập đường dẫn thư mục!', 'error');
        return;
      }

      try {
        const res = await fetch(`${currentApiUrl}/api/s3/folder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderPath: rawFolder })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Lỗi tạo thư mục');

        showToast(data.message || 'Đã tạo thư mục S3!', 'success');
        s3FolderModal.classList.add('hidden');
        expandedFolders.add(data.data.key);
        loadS3Tree(currentS3Prefix);
      } catch (err) {
        showToast(`Lỗi: ${err.message}`, 'error');
      }
    });
  }

  // 14.7. Tạo mới / Xem / Chỉnh sửa File trên S3 (CREATE & UPDATE OBJECT)
  if (btnS3CreateFile) {
    btnS3CreateFile.addEventListener('click', () => {
      s3FileModalTitle.textContent = '📝 Tạo File Mới Trên S3';
      s3FileOldKey.value = '';
      s3FileKeyInput.value = currentS3Prefix ? `${currentS3Prefix}hello-vpc-endpoint.txt` : 'hello-vpc-endpoint.txt';
      s3FileTypeInput.value = 'text/plain; charset=utf-8';
      s3FileContentInput.value = `Hello from AWS S3 VPC Endpoint Lab!\nCreated at: ${new Date().toISOString()}\n`;
      s3TextEditorWrap.classList.remove('hidden');
      s3BinaryPreviewWrap.classList.add('hidden');
      btnS3DownloadModal.classList.add('hidden');
      btnSaveS3File.classList.remove('hidden');
      s3FileModal.classList.remove('hidden');
      s3FileKeyInput.focus();
    });
  }

  window.onOpenS3File = async (key) => {
    try {
      showToast(`Đang tải nội dung "${key}"...`, 'info');
      const res = await fetch(`${currentApiUrl}/api/s3/object?key=${encodeURIComponent(key)}`);
      const resData = await res.json();
      if (!res.ok || !resData.success) throw new Error(resData.error || 'Không thể đọc file');

      const obj = resData.data;
      s3FileModalTitle.textContent = `✏️ Xem / Chỉnh Sửa Object: ${obj.key}`;
      s3FileOldKey.value = obj.key;
      s3FileKeyInput.value = obj.key;
      s3FileTypeInput.value = obj.contentType || 'text/plain; charset=utf-8';

      btnS3DownloadModal.classList.remove('hidden');
      btnS3DownloadModal.onclick = () => window.onDownloadS3File(obj.key);

      if (obj.isText) {
        s3TextEditorWrap.classList.remove('hidden');
        s3BinaryPreviewWrap.classList.add('hidden');
        btnSaveS3File.classList.remove('hidden');
        s3FileContentInput.value = obj.content || '';
      } else if (obj.isImage && obj.base64Preview) {
        s3TextEditorWrap.classList.add('hidden');
        s3BinaryPreviewWrap.classList.remove('hidden');
        btnSaveS3File.classList.add('hidden');
        s3BinaryPreviewWrap.innerHTML = `
          <div><strong>Xem trước hình ảnh (${formatBytes(obj.size)})</strong></div>
          <img src="${obj.base64Preview}" alt="${escapeHtml(obj.key)}">
        `;
      } else {
        s3TextEditorWrap.classList.add('hidden');
        s3BinaryPreviewWrap.classList.remove('hidden');
        btnSaveS3File.classList.add('hidden');
        s3BinaryPreviewWrap.innerHTML = `
          <p>📦 File nhị phân hoặc kích thước lớn (<strong>${formatBytes(obj.size)}</strong> - <code>${escapeHtml(obj.contentType)}</code>).</p>
          <p style="margin-top:0.4rem;">Hãy bấm nút <strong>"⬇️ Tải file xuống"</strong> bên dưới để tải về máy.</p>
        `;
      }

      s3FileModal.classList.remove('hidden');
    } catch (err) {
      showToast(`Lỗi đọc file: ${err.message}`, 'error');
    }
  };

  window.onDownloadS3File = (key) => {
    const downloadUrl = `${currentApiUrl}/api/s3/object?key=${encodeURIComponent(key)}&download=1`;
    window.open(downloadUrl, '_blank');
  };

  if (btnCloseS3File) btnCloseS3File.addEventListener('click', () => s3FileModal.classList.add('hidden'));
  if (btnCancelS3File) btnCancelS3File.addEventListener('click', () => s3FileModal.classList.add('hidden'));

  if (s3FileForm) {
    s3FileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const key = s3FileKeyInput.value.trim();
      const oldKey = s3FileOldKey.value.trim();
      const contentType = s3FileTypeInput.value.trim();
      const content = s3FileContentInput.value;

      if (!key) {
        showToast('Đường dẫn Object Key không được để trống!', 'error');
        return;
      }

      btnSaveS3File.disabled = true;
      try {
        const isUpdate = Boolean(oldKey);
        const res = await fetch(`${currentApiUrl}/api/s3/object`, {
          method: isUpdate ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, oldKey, content, contentType })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Lỗi lưu file lên S3');

        showToast(data.message || 'Đã lưu file lên S3 thành công!', 'success');
        s3FileModal.classList.add('hidden');
        loadS3Tree(currentS3Prefix);
      } catch (err) {
        showToast(`Lỗi lưu file: ${err.message}`, 'error');
      } finally {
        btnSaveS3File.disabled = false;
      }
    });
  }

  // 14.8. Upload File từ máy tính lên S3 (UPLOAD BINARY / FILE)
  if (btnS3Upload && s3UploadInput) {
    btnS3Upload.addEventListener('click', () => s3UploadInput.click());

    s3UploadInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      for (const file of files) {
        if (file.size > 15 * 1024 * 1024) {
          showToast(`File "${file.name}" vượt quá giới hạn 15MB cho demo`, 'error');
          continue;
        }

        const targetKey = `${currentS3Prefix}${file.name}`;
        showToast(`⏳ Đang upload "${file.name}" lên S3...`, 'info');

        try {
          const base64Content = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = String(reader.result || '');
              const commaIdx = result.indexOf(',');
              resolve(commaIdx !== -1 ? result.slice(commaIdx + 1) : result);
            };
            reader.onerror = () => reject(new Error('Không thể đọc file từ máy'));
            reader.readAsDataURL(file);
          });

          const res = await fetch(`${currentApiUrl}/api/s3/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              key: targetKey,
              base64Content,
              contentType: file.type || undefined
            })
          });

          const data = await res.json();
          if (!res.ok || !data.success) throw new Error(data.error || 'Upload thất bại');

          showToast(`✅ Đã upload "${targetKey}"`, 'success');
        } catch (err) {
          showToast(`❌ Lỗi upload "${file.name}": ${err.message}`, 'error');
        }
      }

      s3UploadInput.value = '';
      loadS3Tree(currentS3Prefix);
    });
  }

  // 14.9. Xóa File hoặc Thư mục trên S3 (DELETE)
  window.onDeleteS3Item = async (key, isFolder = false) => {
    const label = isFolder ? `toàn bộ thư mục "${key}" và các file bên trong` : `file "${key}"`;
    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${label} khỏi S3 Bucket "${currentS3Bucket}"?`)) {
      return;
    }

    try {
      const res = await fetch(`${currentApiUrl}/api/s3/object?key=${encodeURIComponent(key)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Lỗi xóa trên S3');

      showToast(data.message || `Đã xóa "${key}"`, 'success');
      if (isFolder && currentS3Prefix.startsWith(key)) {
        currentS3Prefix = '';
      }
      loadS3Tree(currentS3Prefix);
    } catch (err) {
      showToast(`Lỗi xóa: ${err.message}`, 'error');
    }
  };

  if (btnS3Refresh) {
    btnS3Refresh.addEventListener('click', () => {
      checkS3Health();
      loadS3Tree(currentS3Prefix);
      showToast('Đang làm mới S3 Tree...', 'info');
    });
  }

  if (btnS3CheckNow) {
    btnS3CheckNow.addEventListener('click', async () => {
      showToast('Đang kiểm tra kết nối S3 & VPC Endpoint...', 'info');
      const res = await checkS3Health();
      if (res.status === 'CONNECTED') {
        showToast(`Kết nối S3 thành công (${res.latencyMs}ms)!`, 'success');
      } else {
        showToast(res.error || 'Kết nối S3 chưa sẵn sàng', 'error');
      }
    });
  }

  // 14.10. Cấu hình S3 & VPC Endpoint Modal
  async function openS3ConfigModal() {
    s3TestOutput.classList.add('hidden');
    s3ConfigModal.classList.remove('hidden');

    try {
      const res = await fetch(`${currentApiUrl}/api/s3/config`);
      const json = await res.json();
      if (json.success && json.data) {
        s3CfgBucket.value = json.data.bucket || '';
        s3CfgRegion.value = json.data.region || 'ap-southeast-1';
        s3CfgEndpoint.value = json.data.endpointUrl || '';
        s3CfgPathStyle.checked = Boolean(json.data.forcePathStyle);
        s3CfgAuthMode.value = json.data.authMode || 'iam_role';
        s3CfgAccessKey.value = json.data.accessKeyId || '';
        s3CfgSecretKey.value = '';
        s3StaticKeysBox.classList.toggle('hidden', s3CfgAuthMode.value !== 'static_keys');
      }
    } catch {
      // Giữ giá trị hiện tại trên form nếu chưa gọi được WAS
    }
  }

  if (btnOpenS3Config) btnOpenS3Config.addEventListener('click', openS3ConfigModal);
  if (btnS3OpenCfgInline) btnS3OpenCfgInline.addEventListener('click', openS3ConfigModal);
  if (s3StatusPill) s3StatusPill.addEventListener('click', openS3ConfigModal);
  if (btnCloseS3Config) btnCloseS3Config.addEventListener('click', () => s3ConfigModal.classList.add('hidden'));

  const btnS3UseDemo = document.getElementById('btn-s3-use-demo');
  if (btnS3UseDemo) {
    btnS3UseDemo.addEventListener('click', () => {
      s3CfgBucket.value = 'demo-local-s3';
      s3CfgEndpoint.value = '';
      showToast('Đã chọn Bucket giả lập "demo-local-s3". Bấm Lưu để xem S3 Tree mẫu!', 'info');
    });
  }

  if (s3CfgAuthMode) {
    s3CfgAuthMode.addEventListener('change', () => {
      s3StaticKeysBox.classList.toggle('hidden', s3CfgAuthMode.value !== 'static_keys');
    });
  }

  if (btnS3TestConn) {
    btnS3TestConn.addEventListener('click', async () => {
      const payload = {
        bucket: s3CfgBucket.value.trim(),
        region: s3CfgRegion.value.trim() || 'ap-southeast-1',
        endpointUrl: s3CfgEndpoint.value.trim(),
        forcePathStyle: s3CfgPathStyle.checked,
        authMode: s3CfgAuthMode.value,
        accessKeyId: s3CfgAccessKey.value.trim(),
        secretAccessKey: s3CfgSecretKey.value.trim()
      };

      s3TestOutput.classList.remove('hidden');
      s3TestOutput.className = 'health-box';
      s3TestOutput.innerHTML = '⏳ Đang kiểm tra phân giải DNS & kết nối S3 từ máy chủ WAS...';

      try {
        const res = await fetch(`${currentApiUrl}/api/s3/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        const dnsIps = (data.dns && data.dns.resolvedIps && data.dns.resolvedIps.length)
          ? data.dns.resolvedIps.join(', ')
          : 'Không phân giải được';

        if (data.status === 'CONNECTED') {
          s3TestOutput.className = 'health-box success';
          s3TestOutput.innerHTML =
            `✅ <strong>KẾT NỐI S3 QUA VPC ENDPOINT THÀNH CÔNG!</strong><br>` +
            `&bull; Bucket: <strong>${escapeHtml(data.bucket)}</strong> (${escapeHtml(data.region)})<br>` +
            `&bull; Target Host: <code>${escapeHtml(data.dns ? data.dns.targetHost : '')}</code><br>` +
            `&bull; DNS Resolved IP: <code>${escapeHtml(dnsIps)}</code><br>` +
            `&bull; Đường truyền: <strong>${escapeHtml(data.dns ? data.dns.networkPathHint : '')}</strong><br>` +
            `&bull; Độ trễ (Latency): <strong>${data.latencyMs} ms</strong>`;
        } else {
          s3TestOutput.className = 'health-box error';
          s3TestOutput.innerHTML =
            `❌ <strong>KẾT NỐI S3 THẤT BẠI (${escapeHtml(data.errorCode || data.status)})</strong><br>` +
            `&bull; Lỗi: ${escapeHtml(data.error || '')}<br>` +
            `&bull; Target Host: <code>${escapeHtml(data.dns ? data.dns.targetHost : '')}</code> (IP: <code>${escapeHtml(dnsIps)}</code>)<br>` +
            `💡 <strong>Gợi ý:</strong> ${escapeHtml(data.troubleshootingHint || '')}`;
        }
      } catch (err) {
        s3TestOutput.className = 'health-box error';
        s3TestOutput.innerHTML = `❌ Lỗi gọi WAS API: ${escapeHtml(err.message)}`;
      }
    });
  }

  if (btnS3SaveConfig) {
    btnS3SaveConfig.addEventListener('click', async () => {
      const payload = {
        bucket: s3CfgBucket.value.trim(),
        region: s3CfgRegion.value.trim() || 'ap-southeast-1',
        endpointUrl: s3CfgEndpoint.value.trim(),
        forcePathStyle: s3CfgPathStyle.checked,
        authMode: s3CfgAuthMode.value,
        accessKeyId: s3CfgAccessKey.value.trim(),
        secretAccessKey: s3CfgSecretKey.value.trim()
      };

      if (!payload.bucket) {
        showToast('Vui lòng nhập tên S3 Bucket!', 'error');
        return;
      }

      try {
        const res = await fetch(`${currentApiUrl}/api/s3/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Không thể lưu cấu hình S3');

        showToast(`Đã lưu cấu hình S3 Bucket: ${payload.bucket}`, 'success');
        s3ConfigModal.classList.add('hidden');
        currentS3Prefix = '';
        switchTab('s3');
      } catch (err) {
        showToast(`Lỗi: ${err.message}`, 'error');
      }
    });
  }

  // Đóng modal khi bấm phím Escape hoặc click nền mờ
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      [editModal, configModal, s3ConfigModal, s3FolderModal, s3FileModal].forEach(m => {
        if (m) m.classList.add('hidden');
      });
    }
  });

  [editModal, configModal, s3ConfigModal, s3FolderModal, s3FileModal].forEach(modal => {
    if (!modal) return;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });

  // Khởi động
  updateArchLabel();
  loadItems();
  checkS3Health();
  if (activeTab === 's3') {
    switchTab('s3');
  }
  setInterval(() => {
    checkHealth();
    if (activeTab === 's3') {
      checkS3Health();
    }
  }, 30000); // Tự động ping healthcheck mỗi 30s
})();
