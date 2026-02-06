/**
 * AnkiTrans - Content Script
 * 处理页面内文本选择、通知显示及卡片预览
 */

// --- 通知系统 (保留原有逻辑) ---

// 创建通知容器
function createNotificationContainer() {
  let container = document.getElementById('ankitrans-notification');
  if (!container) {
    container = document.createElement('div');
    container.id = 'ankitrans-notification';
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      font-size: 14px;
      max-width: 350px;
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }
  return container;
}

/**
 * 显示通知
 */
function showNotification(type, content) {
  const container = createNotificationContainer();

  const notification = document.createElement('div');
  notification.className = 'ankitrans-toast';

  const colors = {
    loading: { bg: '#f0f9ff', border: '#0ea5e9', icon: '⏳' },
    success: { bg: '#f0fdf4', border: '#22c55e', icon: '✅' },
    error: { bg: '#fef2f2', border: '#ef4444', icon: '❌' },
  };

  const style = colors[type] || colors.loading;

  notification.style.cssText = `
    background: ${style.bg};
    border: 1px solid ${style.border};
    border-left: 4px solid ${style.border};
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 10px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    animation: ankitrans-slide-in 0.3s ease-out;
    pointer-events: auto;
    color: #1f2937;
  `;

  notification.innerHTML = `
    <div style="display: flex; align-items: flex-start; gap: 10px;">
      <span style="font-size: 18px;">${style.icon}</span>
      <div style="flex: 1;">
        ${content}
      </div>
    </div>
  `;

  container.appendChild(notification);

  // 添加动画样式
  if (!document.getElementById('ankitrans-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'ankitrans-styles';
    styleEl.textContent = `
      @keyframes ankitrans-slide-in {
        from {
          opacity: 0;
          transform: translateX(100%);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
      @keyframes ankitrans-fade-out {
        from {
          opacity: 1;
        }
        to {
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(styleEl);
  }

  // 自动移除（成功和错误消息）
  if (type !== 'loading') {
    setTimeout(() => {
      notification.style.animation = 'ankitrans-fade-out 0.3s ease-out forwards';
      setTimeout(() => notification.remove(), 300);
    }, 4000);
  }

  return notification;
}

/**
 * 移除加载通知
 */
function removeLoadingNotification() {
  const container = document.getElementById('ankitrans-notification');
  if (container) {
    const loadingToasts = container.querySelectorAll('.ankitrans-toast');
    loadingToasts.forEach(toast => {
      if (toast.textContent.includes('⏳')) {
        toast.remove();
      }
    });
  }
}

// 存储当前加载通知的引用
let currentLoadingNotification = null;

// --- 预览模态框系统 ---

/**
 * 简单的 Mustache 模板渲染
 */
function renderTemplate(template, data) {
  let result = template;

  // 处理区块 ({{#prop}}...{{/prop}})
  const sectionRegex = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  result = result.replace(sectionRegex, (match, key, content) => {
    return data[key] ? content.replace(/\{\{(\w+)\}\}/g, (m, k) => k === key ? data[key] : m) : '';
  });

  // 处理简单变量 ({{prop}})
  result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] || '';
  });

  return result;
}

/**
 * 创建预览模态框
 */
/**
 * 创建预览模态框
 */
function createPreviewModal(data) {
  // 移除已存在的模态框
  const existing = document.getElementById('ankitrans-preview-host');
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = 'ankitrans-preview-host';
  host.style.cssText = `
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 1000000;
        display: flex;
        justify-content: center;
        align-items: center;
    `;

  // 检测暗色模式 (优先读取存储的设置，否则跟随系统)
  const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  let isDarkMode = systemDark;

  // 尝试从 storage 读取上次的偏好 (异步读取，这里先用系统默认，随后更新)
  // 注意：由于 modal 是同步创建 DOM，我们先渲染，稍后如果有缓存再更新类名

  const shadow = host.attachShadow({ mode: 'open' });

  // 渲染模板
  const frontHtml = renderTemplate(data.frontTemplate, data.fields);
  const backHtml = renderTemplate(data.backTemplate, data.fields);

  shadow.innerHTML = `
        <style>
            ${data.css}
            
            /* 强制重置 host 内部变量作用域 */
            :host {
                all: initial;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }

            /* 模态框容器样式 */
            .modal-container {
                background: var(--bg-card, #fff);
                color: var(--text-main, #333);
                width: 90%;
                max-width: 600px;
                max-height: 90vh;
                border-radius: 12px;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                transition: background 0.3s, color 0.3s;
            }

            .modal-header {
                padding: 16px 24px;
                border-bottom: 1px solid var(--border, #e2e8f0);
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: var(--bg-block, #f7fafc);
                transition: background 0.3s;
            }

            .modal-title {
                font-weight: 600;
                color: var(--text-main, #1a1a2e);
            }

            .header-controls {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .icon-btn {
                background: none;
                border: none;
                font-size: 20px;
                cursor: pointer;
                color: var(--text-muted, #718096);
                padding: 4px;
                border-radius: 4px;
                line-height: 1;
                transition: color 0.2s, background 0.2s;
            }
            .icon-btn:hover { 
                color: var(--text-main, #000); 
                background: rgba(0,0,0,0.05);
            }

            .modal-content {
                padding: 24px;
                overflow-y: auto;
                flex: 1;
                scrollbar-width: thin;
                scrollbar-color: var(--border, #e2e8f0) transparent;
            }

            .modal-content::-webkit-scrollbar { width: 6px; }
            .modal-content::-webkit-scrollbar-track { background: transparent; }
            .modal-content::-webkit-scrollbar-thumb { background-color: var(--border, #e2e8f0); border-radius: 3px; }
            .modal-content::-webkit-scrollbar-thumb:hover { background-color: var(--text-muted, #718096); }

            .preview-label {
                font-size: 12px;
                text-transform: uppercase;
                color: var(--text-muted, #718096);
                margin: 16px 0 8px;
                letter-spacing: 0.05em;
            }
            .preview-label:first-child { margin-top: 0; }

            .card-preview {
                border: 1px dashed var(--border, #e2e8f0);
                padding: 16px;
                border-radius: 8px;
                margin-bottom: 16px;
                background: var(--bg-card, #fff);
                transition: background 0.3s, border-color 0.3s;
            }
            
            .card-preview .card {
                padding: 0; margin: 0; box-shadow: none; background: transparent;
            }

            .modal-footer {
                padding: 16px 24px;
                border-top: 1px solid var(--border, #e2e8f0);
                display: flex;
                justify-content: flex-end;
                gap: 12px;
                background: var(--bg-card, #fff);
                transition: background 0.3s;
            }

            .btn {
                padding: 8px 16px; border-radius: 6px; font-weight: 500;
                cursor: pointer; transition: all 0.2s; border: 1px solid transparent;
            }

            .btn-secondary {
                background: var(--bg-block, #f7fafc);
                color: var(--text-sub, #4a5568);
                border-color: var(--border, #e2e8f0);
            }
            .btn-secondary:hover { background: var(--border, #e2e8f0); }

            .btn-primary { background: var(--accent, #4a90d9); color: white; }
            .btn-primary:hover { filter: brightness(1.1); }
        </style>

        <div class="theme-wrapper anki-variables" id="themeWrapper">
            <div class="modal-container">
                <div class="modal-header">
                    <span class="modal-title">Push to Anki Preview</span>
                    <div class="header-controls">
                        <button class="icon-btn theme-btn" title="Toggle Theme">
                            <span id="themeIcon">🌓</span>
                        </button>
                        <button class="icon-btn close-btn" title="Close">&times;</button>
                    </div>
                </div>
                
                <div class="modal-content">
                    <div class="preview-label">Front</div>
                    <div class="card-preview">${frontHtml}</div>

                    <div class="preview-label">Back</div>
                    <div class="card-preview">${backHtml}</div>
                </div>

                <div class="modal-footer">
                    <button class="btn btn-secondary cancel-btn">Cancel</button>
                    <button class="btn btn-primary confirm-btn">Add to Anki</button>
                </div>
            </div>
        </div>
    `;

  // --- 逻辑处理 ---
  const themeWrapper = shadow.getElementById('themeWrapper');
  const themeIcon = shadow.getElementById('themeIcon');
  const themeBtn = shadow.querySelector('.theme-btn');

  // 更新主题 UI
  const updateThemeUI = (dark) => {
    if (dark) {
      themeWrapper.classList.add('night_mode');
      themeIcon.textContent = '🌙';
    } else {
      themeWrapper.classList.remove('night_mode');
      themeIcon.textContent = '☀️';
    }
  };

  // 初始化主题（优先读取 Storage）
  chrome.storage.sync.get(['ankitrans_theme_pref'], (result) => {
    if (result.ankitrans_theme_pref !== undefined) {
      isDarkMode = result.ankitrans_theme_pref === 'dark';
    }
    updateThemeUI(isDarkMode);
  });

  // 主题切换事件
  themeBtn.onclick = () => {
    isDarkMode = !isDarkMode;
    updateThemeUI(isDarkMode);
    // 保存偏好
    chrome.storage.sync.set({ 'ankitrans_theme_pref': isDarkMode ? 'dark' : 'light' });
  };

  // 绑定关闭事件
  const close = () => host.remove();
  shadow.querySelector('.close-btn').onclick = close;
  shadow.querySelector('.cancel-btn').onclick = close;

  shadow.querySelector('.confirm-btn').onclick = async () => {
    close();

    const loadingToast = showNotification('loading', `
            <div style="font-weight: 600; margin-bottom: 4px;">正在添加...</div>
            <div style="color: #666; font-size: 13px;">${escapeHtml(data.fields.Word)}</div>
        `);

    try {
      chrome.runtime.sendMessage({
        type: 'CONFIRM_ADD_NOTE',
        fields: data.fields
      }, response => {
        loadingToast.remove();

        if (chrome.runtime.lastError) {
          showNotification('error', `错误: ${chrome.runtime.lastError.message}`);
          return;
        }

        if (response && response.success) {
          showNotification('success', `
                        <div style="font-weight: 600; margin-bottom: 4px;">已添加到 Anki</div>
                        <div style="margin-bottom: 6px;">
                          <span style="color: #666;">单词：</span>
                          <span>${escapeHtml(data.fields.Word)}</span>
                        </div>
                    `);
        } else {
          showNotification('error', `添加失败: ${response.error || '未知错误'}`);
        }
      });
    } catch (e) {
      loadingToast.remove();
      showNotification('error', `通信错误: ${e.message}`);
    }
  };

  document.body.appendChild(host);
}


/**
 * 监听来自 background script 的消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 移除可能存在的旧加载提示
  if (['SUCCESS', 'ERROR', 'SHOW_PREVIEW'].includes(message.type)) {
    if (currentLoadingNotification) {
      currentLoadingNotification.remove();
      currentLoadingNotification = null;
    }
    removeLoadingNotification();
  }

  switch (message.type) {
    case 'LOADING':
      currentLoadingNotification = showNotification('loading', `
        <div style="font-weight: 600; margin-bottom: 4px;">正在分析...</div>
        <div style="color: #666; font-size: 13px;">${escapeHtml(message.text)}</div>
      `);
      break;

    case 'SHOW_PREVIEW':
      createPreviewModal(message.data);
      break;

    case 'SUCCESS':
      // 保留旧的成功逻辑处理，以防万一
      showNotification('success', `
        <div style="font-weight: 600; margin-bottom: 4px;">已添加到 Anki</div>
        <div>${escapeHtml(message.text)}</div>
      `);
      break;

    case 'ERROR':
      showNotification('error', `
        <div style="font-weight: 600; margin-bottom: 4px;">错误</div>
        <div style="color: #666; font-size: 13px;">${escapeHtml(message.message)}</div>
      `);
      break;
  }

  sendResponse({ received: true });
  return true;
});

/**
 * HTML 转义
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 可选：添加快捷键支持（Ctrl+Shift+A）
document.addEventListener('keydown', async (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'A') {
    const selection = window.getSelection().toString().trim();
    if (selection) {
      e.preventDefault();

      if (!chrome.runtime?.id) {
        console.warn('AnkiTrans: Extension context invalidated.');
        return;
      }

      // 这里直接发送 ADD_NOTE，由 background 处理成预览流程
      chrome.runtime.sendMessage({
        type: 'ADD_NOTE',
        text: selection,
      });
    }
  }
});

console.log('AnkiTrans content script loaded');
