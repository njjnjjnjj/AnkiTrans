/**
 * AnkiTrans - Popup Script
 * 处理弹出窗口的交互逻辑
 */

// DOM 元素
const connectionStatus = document.getElementById('connection-status');
const deckSelect = document.getElementById('deck-select');

/**
 * 在 UI 界面上显示错误信息 (替代 alert)
 */
function showError(message, duration = 5000) {
    // 移除已有的错误提示
    const existing = document.getElementById('popup-error-message');
    if (existing) existing.remove();

    const errorDiv = document.createElement('div');
    errorDiv.id = 'popup-error-message';
    errorDiv.style.cssText = `
        background: #fef2f2;
        border: 1px solid #ef4444;
        border-left: 4px solid #ef4444;
        color: #b91c1c;
        padding: 10px 12px;
        margin: 12px 0;
        border-radius: 6px;
        font-size: 13px;
        line-height: 1.4;
    `;
    errorDiv.textContent = message;

    // 插入到牌组选择区域下方
    const deckSection = document.querySelector('.deck-section');
    if (deckSection) {
        deckSection.appendChild(errorDiv);
    } else {
        // Fallback: 插入到 main-view 末尾
        mainView.appendChild(errorDiv);
    }

    // 自动消失
    if (duration > 0) {
        setTimeout(() => {
            errorDiv.style.transition = 'opacity 0.3s';
            errorDiv.style.opacity = '0';
            setTimeout(() => errorDiv.remove(), 300);
        }, duration);
    }
}

// DOM Elements (New)
const mainView = document.getElementById('main-view');
const onboardingView = document.getElementById('onboarding-view');
const startBtn = document.getElementById('start-btn');

/**
 * 发送消息到 background script
 */
async function sendMessage(message) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, response => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else if (response && response.error) {
                reject(new Error(response.error));
            } else {
                resolve(response);
            }
        });
    });
}

/**
 * 更新连接状态显示并控制界面元素
 * @param {boolean} connected - 是否连接
 * @param {string} [errorMessage] - 可选的错误消息
 */
function updateConnectionStatus(connected, errorMessage = null) {
    connectionStatus.className = `status ${connected ? 'status-connected' : 'status-disconnected'}`;
    connectionStatus.querySelector('.status-text').textContent = connected ? '已连接' : '未连接';

    // 获取需要控制的元素
    const addDeckBtn = document.getElementById('add-deck-btn');
    const confirmDeckBtn = document.getElementById('confirm-deck-btn');

    if (connected) {
        // 连接成功：启用所有控件
        deckSelect.disabled = false;
        addDeckBtn.disabled = false;
        confirmDeckBtn.disabled = false;
        deckSelect.classList.remove('disabled');
        addDeckBtn.classList.remove('disabled');
        // 移除错误提示
        removeConnectionError();
    } else {
        // 连接失败：禁用所有控件
        deckSelect.disabled = true;
        addDeckBtn.disabled = true;
        confirmDeckBtn.disabled = true;
        deckSelect.classList.add('disabled');
        addDeckBtn.classList.add('disabled');
        deckSelect.innerHTML = '<option value="">请先连接 Anki...</option>';
        // 显示错误提示
        showConnectionError(errorMessage || '无法连接到 Anki，请确保 Anki 已运行且安装了 AnkiConnect 插件');
    }
}

/**
 * 显示连接错误提示 (持久化，不自动消失)
 */
function showConnectionError(message) {
    removeConnectionError();

    const errorDiv = document.createElement('div');
    errorDiv.id = 'connection-error-message';
    errorDiv.style.cssText = `
        background: #fef2f2;
        border: 1px solid #ef4444;
        border-left: 4px solid #ef4444;
        color: #b91c1c;
        padding: 12px 14px;
        margin: 12px 0 0 0;
        border-radius: 8px;
        font-size: 12px;
        line-height: 1.5;
    `;
    errorDiv.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
            <span>❌</span>
            <span>连接失败</span>
        </div>
        <div style="margin-bottom: 8px;">${message}</div>
        <button id="retry-connection-btn" style="
            background: #ef4444;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            font-weight: 500;
        ">重新连接</button>
    `;

    // 插入到 section 下方
    const section = mainView.querySelector('.section');
    if (section) {
        section.appendChild(errorDiv);
    } else {
        mainView.appendChild(errorDiv);
    }

    // 绑定重试按钮
    document.getElementById('retry-connection-btn').addEventListener('click', () => {
        removeConnectionError();
        // 显示检测中状态
        connectionStatus.className = 'status status-checking';
        connectionStatus.querySelector('.status-text').textContent = '检测中...';
        checkAndLoad();
    });
}

/**
 * 移除连接错误提示
 */
function removeConnectionError() {
    const existing = document.getElementById('connection-error-message');
    if (existing) existing.remove();
}

/**
 * 加载牌组列表
 */
async function loadDecks() {
    try {
        const { decks } = await sendMessage({ type: 'GET_DECKS' });

        // Add a placeholder option at the beginning
        let optionsHtml = '<option value="" disabled selected>请选择目标牌组...</option>';
        optionsHtml += decks.map(deck => `<option value="${deck}">${deck}</option>`).join('');

        deckSelect.innerHTML = optionsHtml;

        const settings = await sendMessage({ type: 'GET_SETTINGS' });
        if (settings.deckName && decks.includes(settings.deckName)) {
            deckSelect.value = settings.deckName;
        } else {
            // If no setting or setting invalid, make sure the placeholder is selected (default browser behavior might pick first option if "selected" attribute isn't strictly respected when value is empty, but forcing value to "" helps)
            deckSelect.value = "";
        }
    } catch (error) {
        console.error('Failed to load decks:', error);
        deckSelect.innerHTML = '<option value="">无法加载牌组</option>';
    }
}

/**
 * 保存设置
 */
async function saveSettings() {
    const settings = {
        deckName: deckSelect.value,
    };
    await sendMessage({ type: 'SAVE_SETTINGS', settings });
}

/**
 * 切换视图
 */
function switchView(view) {
    if (view === 'main') {
        mainView.classList.remove('hidden');
        onboardingView.classList.add('hidden');
        // Ensure footer is visible/adjusted if needed, but styling handles layout
    } else {
        mainView.classList.add('hidden');
        onboardingView.classList.remove('hidden');
    }
}

/**
 * 初始化
 */
async function init() {
    try {
        // Check if user has seen onboarding
        const { hasSeenOnboarding } = await chrome.storage.sync.get('hasSeenOnboarding');

        if (!hasSeenOnboarding) {
            switchView('onboarding');
        } else {
            switchView('main');
            // proceed to load connection only if in main view
            checkAndLoad();
        }

    } catch (error) {
        console.error('Initialization error:', error);
        updateConnectionStatus(false);
    }
}

async function checkAndLoad() {
    try {
        const { connected } = await sendMessage({ type: 'CHECK_CONNECTION' });
        updateConnectionStatus(connected);

        if (connected) {
            await loadDecks();
        }
    } catch (error) {
        console.error('Connection check failed:', error);
        // 传递错误信息到 UI
        updateConnectionStatus(false, error.message || '连接检查失败，请确保 Anki 已运行');
    }
}

// Onboarding Button
startBtn.addEventListener('click', async () => {
    await chrome.storage.sync.set({ hasSeenOnboarding: true });
    switchView('main');
    checkAndLoad();
});

// 新建牌组逻辑
const addDeckBtn = document.getElementById('add-deck-btn');
const newDeckForm = document.getElementById('new-deck-form');
const newDeckInput = document.getElementById('new-deck-input');
const confirmDeckBtn = document.getElementById('confirm-deck-btn');
const cancelDeckBtn = document.getElementById('cancel-deck-btn');

addDeckBtn.addEventListener('click', () => {
    newDeckForm.classList.remove('hidden');
    newDeckInput.focus();
});

cancelDeckBtn.addEventListener('click', () => {
    newDeckForm.classList.add('hidden');
});

confirmDeckBtn.addEventListener('click', async () => {
    const deckName = newDeckInput.value.trim();
    if (!deckName) {
        showError('请输入牌组名称');
        return;
    }

    try {
        await sendMessage({ type: 'CREATE_DECK', deckName });

        // 保存新牌组为选中项
        await chrome.storage.sync.set({ deckName });

        // 重新加载列表（会自动选中刚才保存的 deckName）
        await loadDecks();

        // 重置并隐藏表单
        newDeckForm.classList.add('hidden');
        newDeckInput.value = 'AnkiTrans Cards'; // Reset to default

    } catch (error) {
        console.error('Create deck failed:', error);
        showError('创建牌组失败: ' + error.message);
    }
});

// 事件监听
deckSelect.addEventListener('change', saveSettings);

document.getElementById('options-btn').addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
    } else {
        window.open(chrome.runtime.getURL('options/options.html'));
    }
});

// 启动初始化
init();
