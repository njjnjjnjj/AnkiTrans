/**
 * AnkiTrans - Popup Script
 * 处理弹出窗口的交互逻辑
 */

// DOM 元素
const connectionStatus = document.getElementById('connection-status');
const deckSelect = document.getElementById('deck-select');
const quickText = document.getElementById('quick-text');
const quickAddBtn = document.getElementById('quick-add-btn');
const resultArea = document.getElementById('result-area');
const resultContent = document.getElementById('result-content');

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
        deckSelect.innerHTML = decks
            .map(deck => `<option value="${deck}">${deck}</option>`)
            .join('');

        const settings = await sendMessage({ type: 'GET_SETTINGS' });
        if (settings.deckName && decks.includes(settings.deckName)) {
            deckSelect.value = settings.deckName;
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
 * 显示结果
 */
function showResult(type, content) {
    resultArea.className = `result-area ${type}`;
    resultContent.innerHTML = content;
}

/**
 * 快速添加卡片
 */
async function quickAdd() {
    const text = quickText.value.trim();
    if (!text) {
        showResult('error', '<div class="result-title">请输入单词</div>');
        return;
    }

    quickAddBtn.disabled = true;
    quickAddBtn.innerHTML = '<span class="spinner"></span>';

    try {
        await saveSettings();
        const result = await sendMessage({ type: 'ADD_NOTE', text });

        showResult('success', `
            <div class="result-title">✅ 添加成功</div>
            <div><strong>单词：</strong>${escapeHtml(text)}</div>
            <div><strong>释义：</strong>${escapeHtml(result.translation)}</div>
        `);

        quickText.value = '';
    } catch (error) {
        showResult('error', `
            <div class="result-title">❌ 添加失败</div>
            <div>${escapeHtml(error.message)}</div>
        `);
    } finally {
        quickAddBtn.disabled = false;
        quickAddBtn.textContent = '添加';
    }
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 初始化
 */
async function init() {
    try {
        const { connected } = await sendMessage({ type: 'CHECK_CONNECTION' });
        updateConnectionStatus(connected);

        if (connected) {
            await loadDecks();
        }
    } catch (error) {
        console.error('Initialization error:', error);
        updateConnectionStatus(false);
    }
}

// 事件监听
deckSelect.addEventListener('change', saveSettings);
quickAddBtn.addEventListener('click', quickAdd);
quickText.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        quickAdd();
    }
});

// 启动初始化
init();
