/**
 * AnkiTrans - Background Service Worker
 * 处理右键菜单、消息传递和 API 协调
 */

import { translate } from '../lib/translator.js';
import { addNote, checkConnection, createDeck, getDeckNames } from '../lib/anki-connect.js';

// 默认设置
const DEFAULT_SETTINGS = {
    targetLang: 'zh-CN',
    deckName: 'AnkiTrans',
};

/**
 * 获取用户设置
 */
async function getSettings() {
    const result = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    return result;
}

/**
 * 创建右键菜单
 */
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'ankitrans-add',
        title: '添加到 Anki',
        contexts: ['selection'],
    });

    chrome.contextMenus.create({
        id: 'ankitrans-translate',
        title: '翻译并添加到 Anki',
        contexts: ['selection'],
    });
});

/**
 * 处理右键菜单点击
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!info.selectionText) return;

    const selectedText = info.selectionText.trim();

    if (info.menuItemId === 'ankitrans-add' || info.menuItemId === 'ankitrans-translate') {
        await processSelection(selectedText, tab.id);
    }
});

/**
 * 处理选中文本：翻译并添加到 Anki
 */
async function processSelection(text, tabId) {
    try {
        // 通知 content script 显示加载状态
        await sendToContentScript(tabId, { type: 'LOADING', text });

        const settings = await getSettings();

        // 检查 AnkiConnect 连接
        const connected = await checkConnection();
        if (!connected) {
            throw new Error('无法连接到 Anki，请确保 Anki 已运行且安装了 AnkiConnect 插件');
        }

        // 翻译文本
        const { translation, detectedLang } = await translate(text, settings.targetLang);

        // 确保牌组存在
        await createDeck(settings.deckName);

        // 添加笔记
        const noteId = await addNote({
            deckName: settings.deckName,
            front: text,
            back: translation,
            tags: [`source:${detectedLang}`],
        });

        // 通知成功
        await sendToContentScript(tabId, {
            type: 'SUCCESS',
            text,
            translation,
            noteId,
        });

    } catch (error) {
        console.error('AnkiTrans error:', error);
        await sendToContentScript(tabId, {
            type: 'ERROR',
            text,
            message: error.message,
        });
    }
}

/**
 * 发送消息到 content script
 */
async function sendToContentScript(tabId, message) {
    try {
        await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
        console.error('Failed to send message to content script:', error);
    }
}

/**
 * 处理来自 popup 或 content script 的消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender)
        .then(sendResponse)
        .catch(error => sendResponse({ error: error.message }));

    return true; // 保持消息通道开放
});

async function handleMessage(message, sender) {
    switch (message.type) {
        case 'CHECK_CONNECTION':
            return { connected: await checkConnection() };

        case 'GET_DECKS':
            return { decks: await getDeckNames() };

        case 'GET_SETTINGS':
            return await getSettings();

        case 'SAVE_SETTINGS':
            await chrome.storage.sync.set(message.settings);
            return { success: true };

        case 'ADD_NOTE':
            const settings = await getSettings();
            const { translation } = await translate(message.text, settings.targetLang);
            await createDeck(settings.deckName);
            const noteId = await addNote({
                deckName: settings.deckName,
                front: message.text,
                back: translation,
            });
            return { success: true, noteId, translation };

        default:
            throw new Error(`Unknown message type: ${message.type}`);
    }
}
