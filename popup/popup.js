/**
 * AnkiTrans - Popup Script
 * 处理弹出窗口的交互逻辑
 */

// DOM 元素
const connectionStatus = document.getElementById('connection-status');
const deckSelect = document.getElementById('deck-select');

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
 * 更新连接状态显示
 */
function updateConnectionStatus(connected) {
    connectionStatus.className = `status ${connected ? 'status-connected' : 'status-disconnected'}`;
    connectionStatus.querySelector('.status-text').textContent = connected ? '已连接' : '未连接';
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
        updateConnectionStatus(false);
    }
}

// Onboarding Button
startBtn.addEventListener('click', async () => {
    await chrome.storage.sync.set({ hasSeenOnboarding: true });
    switchView('main');
    checkAndLoad();
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
