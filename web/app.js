/**
 * AWS 3-Tier Demo - Frontend Logic
 * Kết nối Web -> WAS -> RDS PostgreSQL
 */

(() => {
  // 1. Quản lý cấu hình WAS API URL
  const STORAGE_KEY = 'AWS_DEMO_WAS_URL';
  
  function getWasApiUrl() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/+$/, '');
    }
    const defaultUrl = (window.APP_CONFIG && window.APP_CONFIG.DEFAULT_API_URL) 
      ? window.APP_CONFIG.DEFAULT_API_URL 
      : 'http://localhost:5000';
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
      statusDot.className = 'status-dot status-offline';
      statusText.textContent = 'Lỗi kết nối WAS';
      showToast(`Không thể kết nối đến WAS: ${err.message}`, 'error');
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
      healthTestOutput.innerHTML = `❌ KẾT NỐI THẤT BẠI!<br>` +
        `Lỗi: ${result.error || result.message || 'Không thể liên lạc'}<br>` +
        `👉 Kiểm tra lại Security Group port 5000 và tiến trình Node trên EC2 WAS.`;
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
  });

  // Đóng modal khi bấm phím Escape hoặc click nền mờ
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      editModal.classList.add('hidden');
      configModal.classList.add('hidden');
    }
  });

  [editModal, configModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });

  // Khởi động
  updateArchLabel();
  loadItems();
  setInterval(checkHealth, 30000); // Tự động ping healthcheck mỗi 30s
})();
