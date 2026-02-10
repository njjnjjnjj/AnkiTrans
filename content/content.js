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

  // 检测暗色模式 (仅跟随系统)
  const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const themeClass = isDarkMode ? 'night_mode' : '';

  const shadow = host.attachShadow({ mode: 'open' });

  // 渲染模板
  let frontHtml = renderTemplate(data.frontTemplate, data.fields);
  let backHtml = renderTemplate(data.backTemplate, data.fields);

  // 处理音频预览 (WYSIWYG)
  // 将 [sound:...] 标签替换为播放按钮
  const processPhoneticForPreview = (html, audioUS, audioUK) => {
    let processed = html;

    // 1. 移除现有的所有 [sound:...] 标签（避免显示 ugly text）
    processed = processed.replace(/\[sound:[^\]]+\]/g, '');

    // 2. 注入播放按钮
    // 假设格式为 <span class="ph-us">🇺🇸 /.../</span>
    // 我们在 span 内部末尾或外部添加按钮

    if (audioUS && processed.includes('class="ph-us"')) {
      processed = processed.replace(
        /<span class="ph-us">([^<]+)<\/span>/,
        `<span class="ph-us">$1 <span class="audio-btn" data-url="${audioUS}" title="Click to play US Audio">🔊</span></span>`
      );
    }

    if (audioUK && processed.includes('class="ph-uk"')) {
      processed = processed.replace(
        /<span class="ph-uk">([^<]+)<\/span>/,
        `<span class="ph-uk">$1 <span class="audio-btn" data-url="${audioUK}" title="Click to play UK Audio">🔊</span></span>`
      );
    }

    return processed;
  };

  frontHtml = processPhoneticForPreview(frontHtml, data.audioUS, data.audioUK);
  backHtml = processPhoneticForPreview(backHtml, data.audioUS, data.audioUK);

  // 注入音频播放器 CSS
  const audioCss = `
    .audio-btn {
        cursor: pointer;
        display: inline-block;
        margin-left: 4px;
        transition: transform 0.1s, opacity 0.2s;
        font-size: 1.1em;
        vertical-align: middle;
    }
    .audio-btn:hover {
        opacity: 0.8;
        transform: scale(1.1);
    }
    .audio-btn:active {
        transform: scale(0.95);
    }
  `;

  shadow.innerHTML = `
        <style>
            ${data.css}
            ${audioCss}
            
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

            .close-btn {
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                color: var(--text-muted, #718096);
                padding: 0;
                line-height: 1;
            }
            .close-btn:hover { color: var(--text-main, #000); }

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
            
            .card-preview.card {
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

    <div class="theme-wrapper anki-variables ${themeClass}" id="themeWrapper">
      <div class="modal-container">
        <div class="modal-header">
          <span class="modal-title">Push to Anki Preview</span>
          <button class="close-btn">&times;</button>
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
  // 绑定事件
  const close = () => host.remove();
  shadow.querySelector('.close-btn').onclick = close;
  shadow.querySelector('.cancel-btn').onclick = close;

  // 绑定音频播放事件
  shadow.querySelectorAll('.audio-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const url = btn.getAttribute('data-url');
      if (url) {
        new Audio(url).play().catch(console.warn);
      }
    };
  });

  shadow.querySelector('.confirm-btn').onclick = async () => {
    close();

    const loadingToast = showNotification('loading', `
      <div style="font-weight: 600; margin-bottom: 4px;">正在添加...</div>
      <div style="color: #666; font-size: 13px;">${escapeHtml(data.fields.Word)}</div>
    `);

    try {
      chrome.runtime.sendMessage({
        type: 'CONFIRM_ADD_NOTE',
        fields: data.fields,
        audioUS: data.audioUS,
        audioUK: data.audioUK
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
      // 这里的 data 包含了 audioUS, audioUK, fields 等
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
// 快捷键支持 (Dynamic)
let currentShortcut = { modifiers: ['Ctrl', 'Shift'], key: 'A' };
let currentShortcutLookup = { modifiers: ['Alt'], key: 'Q' }; // Default for lookup

// Load initial shortcuts
if (window.chrome && chrome.storage && chrome.storage.sync) {
  chrome.storage.sync.get(['shortcut', 'shortcut_lookup'], (result) => {
    if (result.shortcut) {
      currentShortcut = result.shortcut;
    }
    if (result.shortcut_lookup) {
      currentShortcutLookup = result.shortcut_lookup;
    }
  });

  // Listen for changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
      if (changes.shortcut) {
        currentShortcut = changes.shortcut.newValue;
        console.log('AnkiTrans: Shortcut updated to', currentShortcut);
      }
      if (changes.shortcut_lookup) {
        currentShortcutLookup = changes.shortcut_lookup.newValue;
        console.log('AnkiTrans: Lookup Shortcut updated to', currentShortcutLookup);
      }
    }
  });
}

function checkShortcut(e, shortcutConfig) {
  if (e.key.toUpperCase() !== shortcutConfig.key.toUpperCase()) return false;

  const neededCtrl = shortcutConfig.modifiers.includes('Ctrl');
  const neededAlt = shortcutConfig.modifiers.includes('Alt');
  const neededShift = shortcutConfig.modifiers.includes('Shift');
  const neededMeta = shortcutConfig.modifiers.includes('Command');

  return e.ctrlKey === neededCtrl &&
    e.altKey === neededAlt &&
    e.shiftKey === neededShift &&
    e.metaKey === neededMeta;
}

document.addEventListener('keydown', async (e) => {
  const selection = window.getSelection().toString().trim();
  if (!selection) return;

  // Check for Direct Add Shortcut
  if (checkShortcut(e, currentShortcut)) {
    e.preventDefault();
    console.log('AnkiTrans: Triggering manual add via shortcut.');

    if (!chrome.runtime?.id) {
      console.warn('AnkiTrans: Extension context invalidated (id is missing).');
      showNotification('error', `
          <div style="font-weight: 600; margin-bottom: 4px;">扩展已更新</div>
          <div style="color: #666; font-size: 13px;">请刷新页面以重新连接扩展</div>
        `);
      return;
    }

    try {
      await chrome.runtime.sendMessage({
        type: 'ADD_NOTE',
        text: selection
      });
    } catch (err) {
      if (err.message.includes('Extension context invalidated')) {
        console.warn('AnkiTrans: Extension context invalidated. Please refresh the page.');
        showNotification('error', `
            <div style="font-weight: 600; margin-bottom: 4px;">扩展连接断开</div>
            <div style="color: #666; font-size: 13px;">请刷新页面以重新连接扩展</div>
          `);
      } else {
        console.warn('AnkiTrans trigger failed:', err);
      }
    }
    return;
  }

  // Check for Lookup Shortcut
  if (checkShortcut(e, currentShortcutLookup)) {
    e.preventDefault();
    console.log('AnkiTrans: Triggering lookup via shortcut.');

    // Logic to show mini card
    // We need the rect of the selection
    try {
      const range = window.getSelection().getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // If mini card is already showing for this text, maybe just return? 
      // Or we can force refresh. Let's force show.
      showMiniCard(rect, selection);

    } catch (err) {
      console.error('AnkiTrans: Failed to get selection rect for lookup.', err);
    }
  }
});

// --- 划词翻译系统 (Selection Lookup) ---

let currentSelectionRange = null;
let currentFloatingIcon = null;
let currentMiniCard = null;
let ignoreNextMouseUp = false;

document.addEventListener('mouseup', handleSelection);
document.addEventListener('keyup', handleSelection);
document.addEventListener('mousedown', (e) => {
  // 点击任意地方关闭卡片/图标（除非点击的是卡片/图标本身）
  if (currentMiniCard && !currentMiniCard.contains(e.target)) {
    removeMiniCard();
  }
  if (currentFloatingIcon && !currentFloatingIcon.contains(e.target)) {
    removeFloatingIcon();
  }
});

function handleSelection(e) {
  if (ignoreNextMouseUp) {
    ignoreNextMouseUp = false;
    return;
  }

  // 给一点延时让 selection 完成
  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    // Debug log
    if (text) console.log('AnkiTrans: Selection detected:', text);

    if (text.length > 0 && text.length < 50 && /^[a-zA-Z\s\u00C0-\u00FF'-]+$/.test(text)) {
      // 只有纯英文/西文才显示，避免中文选中也弹出

      // 如果已经有卡片显示，且选区没变（或者是在卡片内操作），则不处理
      if (currentMiniCard) return;

      // 忽略输入框内的选区
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // 如果已经有图标显示，检查位置是否变化，没变就不动
      if (currentFloatingIcon) {
        if (currentFloatingIcon.dataset.text !== text) {
          removeFloatingIcon();
          showFloatingIcon(rect, text);
        }
      } else {
        showFloatingIcon(rect, text);
      }
    } else {
      // 如果点击了除了图标以外的地方导致选区消失/变化，移除图标
      if (!currentMiniCard) {
        removeFloatingIcon();
      }
    }
  }, 10);
}

function removeFloatingIcon() {
  if (currentFloatingIcon) {
    currentFloatingIcon.remove();
    currentFloatingIcon = null;
  }
}

function removeMiniCard() {
  if (currentMiniCard) {
    currentMiniCard.remove();
    currentMiniCard = null;
  }
}

function showFloatingIcon(rect, text) {
  removeFloatingIcon();

  const iconHost = document.createElement('div');
  iconHost.dataset.text = text;
  iconHost.style.cssText = `
        position: absolute;
        top: ${rect.top + window.scrollY - 40}px;
        left: ${rect.left + window.scrollX}px;
        z-index: 2147483647;
        cursor: pointer;
        position: absolute;
        top: ${rect.top + window.scrollY - 40}px;
        left: ${rect.left + window.scrollX}px;
        z-index: 2147483647;
        cursor: pointer;
        /* opacity: 0;  <-- Remove helper opacity on host, handle in shadow */
        background: transparent;
    `;

  // 位置修正
  if (rect.top - 40 < 0) {
    iconHost.style.top = `${rect.bottom + window.scrollY + 10}px`;
  }

  console.log('AnkiTrans: Showing icon at', iconHost.style.top, iconHost.style.left, 'for text:', text);

  const shadow = iconHost.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
        <style>
            @keyframes ankitrans-fade-in {
                from { opacity: 0; transform: translateY(5px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .icon-btn {
                width: 32px;
                height: 32px;
                background: white;
                border-radius: 50%;
                box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s, background-color 0.2s, border-color 0.2s;
                border: 1px solid #e2e8f0;
                animation: ankitrans-fade-in 0.2s forwards; /* Animation on the internal element */
            }
            .icon-btn:hover {
                transform: scale(1.1);
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            }
            .logo {
                font-size: 14px;
                color: #0ea5e9;
                font-weight: 800;
                font-family: sans-serif;
                letter-spacing: -0.5px;
            }

            /* Dark Mode */
            @media (prefers-color-scheme: dark) {
                .icon-btn {
                    background: #1e293b;
                    border-color: #334155;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                }
                .icon-btn:hover {
                    background: #334155;
                }
                .logo {
                    color: #38bdf8;
                }
            }
        </style>
        <div class="icon-btn" title="AnkiTrans 查词">
            <span class="logo">AT</span>
        </div>
    `;

  shadow.querySelector('.icon-btn').addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    showMiniCard(rect, text);
    removeFloatingIcon();
  });

  document.body.appendChild(iconHost);
  currentFloatingIcon = iconHost;
}

async function showMiniCard(rect, text) {
  removeMiniCard();

  const cardHost = document.createElement('div');
  cardHost.style.cssText = `
        position: fixed;
        top: ${rect.bottom + 10}px;
        left: ${rect.left}px;
        z-index: 999999;
        font-family: sans-serif;
    `;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (rect.left + 320 > viewportWidth) {
    cardHost.style.left = `${viewportWidth - 330}px`;
  }

  if (rect.bottom + 300 > viewportHeight) {
    cardHost.style.top = `${rect.top - 310}px`;
  }

  const shadow = cardHost.attachShadow({ mode: 'open' });

  renderMiniCardContent(shadow, { loading: true, word: text });
  document.body.appendChild(cardHost);
  currentMiniCard = cardHost;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'LOOKUP_ONLY',
      word: text
    });

    if (chrome.runtime.lastError) {
      renderMiniCardContent(shadow, {
        loading: false,
        error: chrome.runtime.lastError.message,
        word: text
      });
      return;
    }

    if (response && response.found) {
      renderMiniCardContent(shadow, {
        loading: false,
        data: response.data,
        connected: response.connected,
        word: text
      });
    } else {
      renderMiniCardContent(shadow, {
        loading: false,
        error: '未找到释义',
        connected: response ? response.connected : false,
        word: text
      });
    }
  } catch (err) {
    renderMiniCardContent(shadow, {
      loading: false,
      error: err.message,
      word: text
    });
  }
}

function renderMiniCardContent(shadow, state) {
  const { loading, data, error, word, connected } = state;
  const hasDefinitions = data && data.wordInfo && data.wordInfo.definitions && data.wordInfo.definitions.length > 0;

  const styles = `
        <style>
            @keyframes ankitrans-fade-in {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .card {
                width: 320px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.15);
                border: 1px solid #e2e8f0;
                overflow: hidden;
                font-size: 14px;
                color: #334155;
                animation: ankitrans-fade-in 0.2s ease-out;
            }
            .header {
                padding: 8px 12px;
                background: #f8fafc;
                border-bottom: 1px solid #e2e8f0;
                display: flex;
                justify-content: space-between;
                align-items: center;
                min-height: 40px;
            }
            .word-title {
                font-weight: 700;
                font-size: 16px;
                color: #0f172a;
            }
            .close-btn {
                cursor: pointer;
                color: #94a3b8;
                font-size: 18px;
                line-height: 1;
                padding: 4px;
                border-radius: 4px;
            }
            .close-btn:hover { color: #64748b; background: #e2e8f0; }
            
            .content {
                padding: 12px 16px;
                max-height: 300px;
                overflow-y: auto;
            }
            .content::-webkit-scrollbar { width: 6px; }
            .content::-webkit-scrollbar-thumb { background-color: #e2e8f0; border-radius: 3px; }

            .phonetic {
                color: #64748b;
                font-size: 12px;
                margin-bottom: 4px; /* 减小音标间距 */
                font-family: Consolas, Monaco, monospace;
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                align-items: center;
            }
            .ph-item {
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .audio-btn {
                cursor: pointer;
                color: #0ea5e9;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                transition: background 0.2s;
            }
            .audio-btn:hover {
                background: #e0f2fe;
            }
            
            /* 新增 mean-line 样式以修复粘连 */
            .mean-line {
                margin-bottom: 6px;
                line-height: 1.5;
                display: flex;
                align-items: baseline;
            }
            .mean-line:last-child { margin-bottom: 0; }

            .def-row {
                /* 保留旧样式定义以防万一，但主要使用 mean-line */
                margin-bottom: 8px;
                line-height: 1.6;
                font-size: 14px;
                display: flex; 
                align-items: baseline;
            }
            .def-row:last-child { margin-bottom: 0; }
            
            .pos {
                color: #0ea5e9;
                font-weight: 700;
                margin-right: 8px;
                font-size: 12px;
                background: #e0f2fe;
                padding: 1px 5px;
                border-radius: 4px;
                display: inline-block;
                flex-shrink: 0; /* Prevent pos tag from shrinking */
                min-width: 24px;
                text-align: center;
            }
            
            .footer {
                padding: 8px 12px;
                border-top: 1px solid #e2e8f0;
                background: #fff;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .btn {
                padding: 6px 14px;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                border: none;
                transition: all 0.2s;
            }
            .btn-primary {
                background: #0ea5e9;
                color: white;
            }
            .btn-primary:hover {
                background: #0284c7;
                box-shadow: 0 2px 4px rgba(14, 165, 233, 0.3);
            }
            .btn-disabled {
                background: #cbd5e1;
                cursor: not-allowed;
                color: #64748b;
            }
            .loading {
                display: flex;
                align-items: center;
                justify-content: center;
                color: #94a3b8;
                padding: 30px;
                font-size: 14px;
            }
            .error, .empty-state {
                color: #64748b;
                text-align: center;
                padding: 20px 10px;
                background: #f8fafc;
                border-radius: 8px;
                font-size: 13px;
            }
            .brand-text {
                font-size: 10px;
                color: #94a3b8;
                opacity: 0.6;
                text-align: left;
                letter-spacing: 0.5px;
                font-weight: 500;
            }
            .error {
                color: #ef4444;
                background: #fef2f2;
            }

            .inflection {
                color: #b45309;
                font-size: 12px;
                margin-bottom: 8px;
                background: #fffbeb;
                padding: 4px 8px;
                border-radius: 4px;
                display: inline-block;
                border: 1px solid #fcd34d;
            }

            /* Dark Mode Support */
            @media (prefers-color-scheme: dark) {
                .card {
                    background: #1e293b;
                    border-color: #334155;
                    color: #e2e8f0;
                }
                .header {
                    background: #0f172a;
                    border-color: #334155;
                }
                .word-title {
                    color: #f1f5f9;
                }
                .content::-webkit-scrollbar-thumb {
                    background-color: #475569;
                }
                .footer {
                    background: #1e293b;
                    border-color: #334155;
                }
                .phonetic {
                    color: #94a3b8;
                }
                .audio-btn {
                    color: #38bdf8;
                }
                .audio-btn:hover {
                    background: #0f172a;
                }
                .pos {
                    background: #075985;
                    color: #e0f2fe;
                }
                .inflection {
                    background: #451a03;
                    color: #fdba74;
                    border-color: #78350f; 
                }
                .close-btn:hover {
                    color: #e2e8f0;
                    background: #334155;
                }
                .error, .empty-state {
                    background: #334155;
                    color: #cbd5e1;
                }
                .error {
                    background: #450a0a;
                    color: #fca5a5;
                }
                .btn-disabled {
                    background: #475569;
                    color: #94a3b8;
                }
            }
        </style>
    `;

  let bodyHtml = '';

  if (loading) {
    bodyHtml = '<div class="loading">正在查询 Bing 词典...</div>';
  } else if (error) {
    bodyHtml = `<div class="error">${error}</div>`;
  } else if (data) {
    if (hasDefinitions) {
      const wordInfo = data.wordInfo;
      const phonetics = [];

      const speakerIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;

      if (wordInfo.phoneticUS) {
        const audioHtml = wordInfo.audioUS ? `<span class="audio-btn" data-url="${wordInfo.audioUS}">${speakerIcon}</span>` : '';
        phonetics.push(`<span class="ph-item">🇺🇸 /${wordInfo.phoneticUS}/ ${audioHtml}</span>`);
      }
      if (wordInfo.phoneticUK) {
        const audioHtml = wordInfo.audioUK ? `<span class="audio-btn" data-url="${wordInfo.audioUK}">${speakerIcon}</span>` : '';
        phonetics.push(`<span class="ph-item">🇬🇧 /${wordInfo.phoneticUK}/ ${audioHtml}</span>`);
      }

      const definitions = wordInfo.definitions.slice(0, 3).map(d =>
        `<div class="mean-line"><span class="pos">${d.pos}</span>${d.meanings.join('；')}</div>`
      ).join('');

      const inflectionHtml = wordInfo.inflection ? `<div class="inflection">ℹ️ ${wordInfo.inflection}</div>` : '';

      bodyHtml = `
            ${inflectionHtml}
            <div class="phonetic">${phonetics.join('')}</div>
            <div class="definitions">${definitions}</div>
        `;
    } else {
      // Empty state
      bodyHtml = `
            <div class="empty-state">
                <p>未找到释义</p>
                <p style="margin-top:8px; font-size:12px; opacity:0.8;">请检查拼写或尝试其他词汇。</p>
            </div>
        `;
    }
  }

  const cardHtml = `
        <div class="card">
            <div class="header">
                <span class="word-title">${word}</span>
                <span class="close-btn">&times;</span>
            </div>
            <div class="content">
                ${bodyHtml}
            </div>
            ${!loading && !error && hasDefinitions ? `
            <div class="footer">
                <div class="brand-text">AnkiTrans</div>
                ${connected !== false ?
        `<button class="btn btn-primary add-btn">添加到 Anki</button>` :
        `<button class="btn btn-disabled" disabled title="请检查 Anki 是否运行">Anki 未连接</button>`
      }
            </div>
            ` : ''}
        </div>
    `;

  shadow.innerHTML = styles + cardHtml;

  // Bind events
  const closeBtn = shadow.querySelector('.close-btn');
  if (closeBtn) closeBtn.addEventListener('click', removeMiniCard);

  // Audio events
  shadow.querySelectorAll('.audio-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = btn.getAttribute('data-url');
      if (url) {
        new Audio(url).play().catch(err => {
          console.warn('Audio play failed', err);
        });
      }
    });
  });

  const addBtn = shadow.querySelector('.add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      // Don't disable immediately if we might show preview
      // addBtn.textContent = '添加中...'; 
      // addBtn.className = 'btn btn-disabled';
      // addBtn.disabled = true;

      try {
        // Check preview setting
        const settings = await chrome.storage.sync.get({ enablePreview: true });

        if (settings.enablePreview) {
          // Show Preview Modal
          // We need to construct the data object expected by createPreviewModal
          // It expects: { fields, audioUS, audioUK, css, frontTemplate, backTemplate }
          // These are now available in `data` (if background.js is updated)

          // Close mini card first
          removeMiniCard();

          createPreviewModal({
            fields: data.fields,
            audioUS: data.wordInfo.audioUS,
            audioUK: data.wordInfo.audioUK,
            css: data.css,
            frontTemplate: data.frontTemplate,
            backTemplate: data.backTemplate
          });

        } else {
          // Direct Add (Original Logic)
          addBtn.textContent = '添加中...';
          addBtn.className = 'btn btn-disabled';
          addBtn.disabled = true;

          const response = await chrome.runtime.sendMessage({
            type: 'CONFIRM_ADD_NOTE',
            fields: data.fields,
            audioUS: data.wordInfo.audioUS,
            audioUK: data.wordInfo.audioUK
          });

          if (response && response.success) {
            addBtn.textContent = '已添加';
            showNotification('success', `已添加: ${word}`);
            setTimeout(removeMiniCard, 1500);
          } else {
            addBtn.textContent = '重试';
            addBtn.className = 'btn btn-primary add-btn';
            addBtn.disabled = false;
            showNotification('error', response.error || '添加失败');
          }
        }

      } catch (err) {
        addBtn.textContent = '重试';
        addBtn.className = 'btn btn-primary add-btn';
        addBtn.disabled = false;
        showNotification('error', err.message);
      }
    });
  }
}
