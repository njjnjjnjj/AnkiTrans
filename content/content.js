/**
 * AnkiTrans - Content Script
 * 处理页面内文本选择和通知显示
 */

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

/**
 * 监听来自 background script 的消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'LOADING':
      currentLoadingNotification = showNotification('loading', `
        <div style="font-weight: 600; margin-bottom: 4px;">正在处理...</div>
        <div style="color: #666; font-size: 13px;">${escapeHtml(message.text)}</div>
      `);
      break;

    case 'SUCCESS':
      if (currentLoadingNotification) {
        currentLoadingNotification.remove();
        currentLoadingNotification = null;
      }
      showNotification('success', `
        <div style="font-weight: 600; margin-bottom: 4px;">已添加到 Anki</div>
        <div style="margin-bottom: 6px;">
          <span style="color: #666;">原文：</span>
          <span>${escapeHtml(message.text)}</span>
        </div>
        <div>
          <span style="color: #666;">翻译：</span>
          <span style="color: #22c55e;">${escapeHtml(message.translation)}</span>
        </div>
      `);
      break;

    case 'ERROR':
      if (currentLoadingNotification) {
        currentLoadingNotification.remove();
        currentLoadingNotification = null;
      }
      showNotification('error', `
        <div style="font-weight: 600; margin-bottom: 4px;">添加失败</div>
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

      // 检查扩展上下文是否有效
      if (!chrome.runtime?.id) {
        console.warn('AnkiTrans: Extension context invalidated. Please refresh the page.');
        return;
      }

      // 显示加载状态
      const loadingToast = showNotification('loading', `
                <div style="font-weight: 600; margin-bottom: 4px;">正在处理...</div>
                <div style="color: #666; font-size: 13px;">${escapeHtml(selection)}</div>
            `);

      try {
        chrome.runtime.sendMessage({
          type: 'ADD_NOTE',
          text: selection,
        }, response => {
          // 检查 chrome.runtime.lastError
          if (chrome.runtime.lastError) {
            loadingToast.remove();
            showNotification('error', `
              <div style="font-weight: 600; margin-bottom: 4px;">扩展已重新加载</div>
              <div style="color: #666; font-size: 13px;">请刷新页面后重试</div>
            `);
            return;
          }

          // 移除加载通知
          loadingToast.remove();

          if (response && response.error) {
            showNotification('error', `
                            <div style="font-weight: 600; margin-bottom: 4px;">添加失败</div>
                            <div style="color: #666; font-size: 13px;">${escapeHtml(response.error)}</div>
                        `);
          } else if (response && response.translation) {
            showNotification('success', `
                            <div style="font-weight: 600; margin-bottom: 4px;">已添加到 Anki</div>
                            <div style="margin-bottom: 6px;">
                                <span style="color: #666;">原文：</span>
                                <span>${escapeHtml(selection)}</span>
                            </div>
                            <div>
                                <span style="color: #666;">翻译：</span>
                                <span style="color: #22c55e;">${escapeHtml(response.translation)}</span>
                            </div>
                        `);
          } else {
            showNotification('error', `
                            <div style="font-weight: 600; margin-bottom: 4px;">添加失败</div>
                            <div style="color: #666; font-size: 13px;">未收到响应，请检查扩展是否正常运行</div>
                        `);
          }
        });
      } catch (error) {
        loadingToast.remove();
        showNotification('error', `
          <div style="font-weight: 600; margin-bottom: 4px;">扩展已重新加载</div>
          <div style="color: #666; font-size: 13px;">请刷新页面后重试</div>
        `);
      }
    }
  }
});

console.log('AnkiTrans content script loaded');
