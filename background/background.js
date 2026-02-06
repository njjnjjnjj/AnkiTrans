/**
 * AnkiTrans - Background Service Worker
 * 处理右键菜单、消息传递和 API 协调
 */

import {
    addNoteWithFields,
    checkConnection,
    createDeck,
    getDeckNames,
    storeMediaFile,
    ANKITRANS_FRONT_TEMPLATE,
    ANKITRANS_BACK_TEMPLATE,
    ANKITRANS_CSS
} from '../lib/anki-connect.js';
import { lookupWord, buildCardFields } from '../lib/dictionary.js';

// 默认设置
const DEFAULT_SETTINGS = {
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
});

/**
 * 处理右键菜单点击
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!info.selectionText) return;

    const selectedText = info.selectionText.trim();

    if (info.menuItemId === 'ankitrans-add') {
        await processSelection(selectedText, tab.id);
    }
});

/**
 * 处理选中文本：查词并触发预览
 */
async function processSelection(text, tabId) {
    try {
        // 通知 content script 显示加载状态
        await sendToContentScript(tabId, { type: 'LOADING', text });

        // 检查 AnkiConnect 连接
        const connected = await checkConnection();
        if (!connected) {
            throw new Error('无法连接到 Anki，请确保 Anki 已运行且安装了 AnkiConnect 插件');
        }

        // 查询必应词典
        const wordInfo = await lookupWord(text);

        if (!wordInfo || wordInfo.definitions.length === 0) {
            throw new Error(`未找到 "${text}" 的释义`);
        }

        // 生成卡片字段
        const cardFields = buildCardFields(text, wordInfo);

        // 处理音频 (支持双音频)
        const audioData = { us: null, uk: null };
        try {
            // Helper function to process single audio
            const processAudio = async (url, type, word) => {
                if (!url) return null;
                try {
                    const audioResp = await fetch(url);
                    if (!audioResp.ok) return null;
                    const arrayBuffer = await audioResp.arrayBuffer();
                    const base64Data = arrayBufferToBase64(arrayBuffer);
                    const timestamp = Date.now();
                    // distinguish filename by type
                    const cleanWord = word.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
                    const filename = `ankitrans_${cleanWord}_${type}_${timestamp}.mp3`;
                    const storedFile = await storeMediaFile(filename, base64Data);
                    return (storedFile || storedFile === null) ? filename : null;
                } catch (e) {
                    console.warn(`Failed to process ${type} audio:`, e);
                    return null;
                }
            };

            // Parallel download
            const [usFile, ukFile] = await Promise.all([
                processAudio(wordInfo.audioUS, 'us', text),
                processAudio(wordInfo.audioUK, 'uk', text)
            ]);

            // Construct new Phonetic field with embedded sound tags
            // Expected format from dictionary.js: 
            // <span class="ph-us">🇺🇸 /.../</span> <span class="ph-uk">🇬🇧 /.../</span>
            // We want to inject [sound:...] inside or next to these spans.

            let phoneticHtml = cardFields.Phonetic || '';

            if (usFile) {
                // Insert after US phonetic text
                if (phoneticHtml.includes('class="ph-us"')) {
                    phoneticHtml = phoneticHtml.replace(/<span class="ph-us">([^<]+)<\/span>/, `<span class="ph-us">$1 [sound:${usFile}]</span>`);
                } else {
                    phoneticHtml += ` <span class="ph-us">[sound:${usFile}]</span>`;
                }
            }

            if (ukFile) {
                // Insert after UK phonetic text
                if (phoneticHtml.includes('class="ph-uk"')) {
                    phoneticHtml = phoneticHtml.replace(/<span class="ph-uk">([^<]+)<\/span>/, `<span class="ph-uk">$1 [sound:${ukFile}]</span>`);
                } else {
                    phoneticHtml += ` <span class="ph-uk">[sound:${ukFile}]</span>`;
                }
            }

            cardFields.Phonetic = phoneticHtml;

        } catch (audioErr) {
            console.warn('Audio processing failed:', audioErr);
        }

        // 发送预览请求 (传递原始 URL 用于预览播放)
        await sendToContentScript(tabId, {
            type: 'SHOW_PREVIEW',
            data: {
                fields: cardFields,
                audioUS: wordInfo.audioUS,
                audioUK: wordInfo.audioUK,
                css: ANKITRANS_CSS,
                frontTemplate: ANKITRANS_FRONT_TEMPLATE,
                backTemplate: ANKITRANS_BACK_TEMPLATE
            }
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
        // 捕获特定错误，防止扩展上下文失效导致的问题
        await chrome.tabs.sendMessage(tabId, message).catch(err => {
            console.warn('Tab message failed:', err);
            if (message.type === 'ERROR') {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon128.png',
                    title: 'AnkiTrans 错误',
                    message: message.message
                });
            }
        });
    } catch (error) {
        console.warn('Top level send error:', error);
    }
}

/**
 * 处理来自 popup 或 content script 的消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender)
        .then(sendResponse)
        .catch(error => sendResponse({ error: error.message }));

    return true;
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
            // 旧的直接添加逻辑，为了兼容快捷键，也可以复用 processSelection
            if (sender.tab) {
                await processSelection(message.text, sender.tab.id);
                return { success: true, processing: true }; // 异步处理
            }
            return { error: 'Invalid sender' };

        case 'CONFIRM_ADD_NOTE':
            const settings = await getSettings();
            await createDeck(settings.deckName);

            const noteId = await addNoteWithFields({
                deckName: settings.deckName,
                fields: message.fields,
                tags: ['bing-dict'],
            });

            return {
                success: true,
                noteId,
                translation: message.fields.Translation
            };

        default:
            throw new Error(`Unknown message type: ${message.type}`);
    }
}

/**
 * ArrayBuffer 转 Base64
 */
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
