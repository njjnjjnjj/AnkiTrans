/**
 * AnkiTrans - Popup Script
 * 处理弹出窗口的交互逻辑
 */

// DOM 元素
const connectionStatus = document.getElementById('connection-status');
const deckSelect = document.getElementById('deck-select');
const modelSelect = document.getElementById('model-select');
const frontFieldSelect = document.getElementById('front-field');
const backFieldSelect = document.getElementById('back-field');
const langSelect = document.getElementById('lang-select');
const engineSelect = document.getElementById('engine-select');
const deepLConfig = document.getElementById('deepl-config');
const deepLKey = document.getElementById('deepl-key');
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
 * 加载笔记类型列表
 */
async function loadModels() {
    try {
        const { models } = await sendMessage({ type: 'GET_MODELS' });
        modelSelect.innerHTML = models
            .map(model => `<option value="${model}">${model}</option>`)
            .join('');

        const settings = await sendMessage({ type: 'GET_SETTINGS' });
        if (settings.modelName && models.includes(settings.modelName)) {
            modelSelect.value = settings.modelName;
        } else if (models.includes('Basic')) {
            modelSelect.value = 'Basic';
        }

        // 加载选中模型的字段
        await loadModelFields(modelSelect.value);
    } catch (error) {
        console.error('Failed to load models:', error);
        modelSelect.innerHTML = '<option value="">无法加载笔记类型</option>';
    }
}

/**
 * 加载指定模型的字段列表
 */
async function loadModelFields(modelName) {
    if (!modelName) return;

    try {
        const { fields } = await sendMessage({ type: 'GET_MODEL_FIELDS', modelName });

        frontFieldSelect.innerHTML = fields
            .map(field => `<option value="${field}">${field}</option>`)
            .join('');

        backFieldSelect.innerHTML = fields
            .map(field => `<option value="${field}">${field}</option>`)
            .join('');

        // 恢复保存的字段设置，或使用默认值
        const settings = await sendMessage({ type: 'GET_SETTINGS' });

        if (settings.frontField && fields.includes(settings.frontField)) {
            frontFieldSelect.value = settings.frontField;
        } else if (fields.length >= 1) {
            frontFieldSelect.value = fields[0];
        }

        if (settings.backField && fields.includes(settings.backField)) {
            backFieldSelect.value = settings.backField;
        } else if (fields.length >= 2) {
            backFieldSelect.value = fields[1];
        }
    } catch (error) {
        console.error('Failed to load model fields:', error);
    }
}

/**
 * 初始化设置
 */
async function initSettings() {
    const settings = await sendMessage({ type: 'GET_SETTINGS' });

    if (settings.targetLang) {
        langSelect.value = settings.targetLang;
    }

    if (settings.translationEngine) {
        engineSelect.value = settings.translationEngine;
        toggleDeepLConfig(settings.translationEngine === 'deepl');
    }

    if (settings.deepLApiKey) {
        deepLKey.value = settings.deepLApiKey;
    }
}

/**
 * 切换 DeepL 配置显示
 */
function toggleDeepLConfig(show) {
    if (show) {
        deepLConfig.classList.remove('hidden');
    } else {
        deepLConfig.classList.add('hidden');
    }
}

/**
 * 保存设置
 */
async function saveSettings() {
    const settings = {
        deckName: deckSelect.value,
        modelName: modelSelect.value,
        frontField: frontFieldSelect.value,
        backField: backFieldSelect.value,
        targetLang: langSelect.value,
        translationEngine: engineSelect.value,
        deepLApiKey: deepLKey.value,
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
        showResult('error', '<div class="result-title">请输入内容</div>');
        return;
    }

    quickAddBtn.disabled = true;
    quickAddBtn.innerHTML = '<span class="spinner"></span>';

    try {
        await saveSettings();
        const result = await sendMessage({ type: 'ADD_NOTE', text });

        showResult('success', `
      <div class="result-title">✅ 添加成功</div>
      <div><strong>原文：</strong>${escapeHtml(text)}</div>
      <div><strong>翻译：</strong>${escapeHtml(result.translation)}</div>
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
        // 检查连接
        const { connected } = await sendMessage({ type: 'CHECK_CONNECTION' });
        updateConnectionStatus(connected);

        if (connected) {
            await loadDecks();
            await loadModels();
            await initSettings();
        }
    } catch (error) {
        console.error('Initialization error:', error);
        updateConnectionStatus(false);
    }
}

// 事件监听
deckSelect.addEventListener('change', saveSettings);
modelSelect.addEventListener('change', async (e) => {
    await loadModelFields(e.target.value);
    saveSettings();
});
frontFieldSelect.addEventListener('change', saveSettings);
backFieldSelect.addEventListener('change', saveSettings);
langSelect.addEventListener('change', saveSettings);
engineSelect.addEventListener('change', (e) => {
    toggleDeepLConfig(e.target.value === 'deepl');
    saveSettings();
});
deepLKey.addEventListener('change', saveSettings);
quickAddBtn.addEventListener('click', quickAdd);
quickText.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        quickAdd();
    }
});

// 启动初始化
init();
