/**
 * 翻译服务模块
 * 使用 Google Translate 免费接口
 */

const GOOGLE_TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single';

/**
 * 翻译文本
 * @param {string} text - 要翻译的文本
 * @param {string} [targetLang='zh-CN'] - 目标语言代码
 * @param {string} [sourceLang='auto'] - 源语言代码（auto 为自动检测）
 * @returns {Promise<{translation: string, detectedLang: string}>} - 翻译结果
 */
export async function translate(text, targetLang = 'zh-CN', sourceLang = 'auto') {
    const params = new URLSearchParams({
        client: 'gtx',
        sl: sourceLang,
        tl: targetLang,
        dt: 't',
        q: text,
    });

    try {
        const response = await fetch(`${GOOGLE_TRANSLATE_URL}?${params}`);

        if (!response.ok) {
            throw new Error(`Translation failed: ${response.status}`);
        }

        const data = await response.json();

        // Google Translate 返回格式: [[["译文","原文",null,null,10]],null,"en"]
        const translation = data[0]
            .map(item => item[0])
            .filter(Boolean)
            .join('');

        const detectedLang = data[2] || sourceLang;

        return {
            translation,
            detectedLang,
        };
    } catch (error) {
        console.error('Translation error:', error);
        throw new Error(`翻译失败: ${error.message}`);
    }
}

/**
 * 支持的目标语言列表
 */
export const SUPPORTED_LANGUAGES = [
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

export default {
    translate,
    SUPPORTED_LANGUAGES,
};
