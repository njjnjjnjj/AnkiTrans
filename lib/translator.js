/**
 * 翻译服务模块
 * 支持多种翻译引擎（Google Free, DeepL, etc.）
 */

// 翻译引擎配置
const ENGINES = {
    GOOGLE_FREE: 'google_free',
    DEEPL: 'deepl',
};

// 预设的语言名称映射
const LANGUAGES = [
    { code: 'zh-CN', name: '简体中文' },
    { code: 'zh-TW', name: '繁體中文' },
    { code: 'en', name: 'English' },
    { code: 'ja', name: '日本語' },
    { code: 'ko', name: '한국어' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'es', name: 'Español' },
    { code: 'ru', name: 'Русский' },
];

/**
 * Google Translate 免费接口实现
 */
async function translateWithGoogle(text, targetLang, sourceLang = 'auto') {
    const url = 'https://translate.googleapis.com/translate_a/single';
    const params = new URLSearchParams({
        client: 'gtx',
        sl: sourceLang,
        tl: targetLang,
        dt: 't',
        q: text,
    });

    const response = await fetch(`${url}?${params}`);
    if (!response.ok) {
        throw new Error(`Google Translate failed: ${response.status}`);
    }

    const data = await response.json();
    const translation = data[0].map(item => item[0]).filter(Boolean).join('');
    const detectedLang = data[2] || sourceLang;

    return { translation, detectedLang };
}

/**
 * DeepL API 实现
 * 需要 API Key
 */
async function translateWithDeepL(text, targetLang, apiKey) {
    if (!apiKey) {
        throw new Error('DeepL API Key is required');
    }

    // DeepL 的中文代码是 ZH
    let deepLTarget = targetLang.toUpperCase();
    if (deepLTarget === 'ZH-CN' || deepLTarget === 'ZH-TW') {
        deepLTarget = 'ZH';
    }

    const url = apiKey.endsWith(':fx')
        ? 'https://api-free.deepl.com/v2/translate'
        : 'https://api.deepl.com/v2/translate';

    const params = new URLSearchParams({
        auth_key: apiKey,
        text: text,
        target_lang: deepLTarget,
    });

    const response = await fetch(url, {
        method: 'POST',
        body: params,
    });

    if (!response.ok) {
        if (response.status === 403) {
            throw new Error('DeepL API Key 无效或额度已用完');
        }
        throw new Error(`DeepL API failed: ${response.status}`);
    }

    const data = await response.json();
    const result = data.translations[0];

    return {
        translation: result.text,
        detectedLang: result.detected_source_language.toLowerCase(),
    };
}

/**
 * 统一翻译入口
 * @param {string} text - 原文
 * @param {object} options - 翻译选项
 * @returns {Promise<{translation: string, detectedLang: string}>}
 */
export async function translate(text, options = {}) {
    const {
        engine = ENGINES.GOOGLE_FREE,
        targetLang = 'zh-CN',
        sourceLang = 'auto',
        apiKey = '',
    } = options;

    try {
        switch (engine) {
            case ENGINES.DEEPL:
                return await translateWithDeepL(text, targetLang, apiKey);

            case ENGINES.GOOGLE_FREE:
            default:
                return await translateWithGoogle(text, targetLang, sourceLang);
        }
    } catch (error) {
        console.error('Translation error:', error);
        throw new Error(`翻译失败: ${error.message}`);
    }
}

export const SUPPORTED_LANGUAGES = LANGUAGES;
export const TRANSLATE_ENGINES = ENGINES;

export default {
    translate,
    SUPPORTED_LANGUAGES,
    TRANSLATE_ENGINES,
};
