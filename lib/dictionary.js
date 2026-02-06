/**
 * 词典服务模块
 * 使用 Free Dictionary API 获取单词详细信息
 */

const DICTIONARY_API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en';

/**
 * 词性缩写映射
 */
const PART_OF_SPEECH_MAP = {
    'noun': 'n.',
    'verb': 'v.',
    'adjective': 'adj.',
    'adverb': 'adv.',
    'pronoun': 'pron.',
    'preposition': 'prep.',
    'conjunction': 'conj.',
    'interjection': 'interj.',
    'exclamation': 'excl.',
    'determiner': 'det.',
};

/**
 * 查询单词详细信息
 * @param {string} word - 要查询的单词
 * @returns {Promise<object|null>} 单词信息对象，查询失败返回 null
 */
export async function lookupWord(word) {
    if (!word || typeof word !== 'string') {
        return null;
    }

    // 清理单词（去除多余空格和标点）
    const cleanWord = word.trim().toLowerCase().replace(/[^\w\s-]/g, '');

    if (!cleanWord) {
        return null;
    }

    try {
        const response = await fetch(`${DICTIONARY_API_BASE}/${encodeURIComponent(cleanWord)}`);

        if (!response.ok) {
            if (response.status === 404) {
                console.log(`Dictionary: Word "${cleanWord}" not found`);
                return null;
            }
            throw new Error(`Dictionary API error: ${response.status}`);
        }

        const data = await response.json();

        if (!Array.isArray(data) || data.length === 0) {
            return null;
        }

        return parseWordData(data[0]);
    } catch (error) {
        console.error('Dictionary lookup error:', error);
        return null;
    }
}

/**
 * 解析 API 返回的单词数据
 * @param {object} rawData - API 原始数据
 * @returns {object} 格式化后的单词信息
 */
function parseWordData(rawData) {
    const result = {
        word: rawData.word || '',
        phonetic: '',
        meanings: [],
    };

    // 提取音标（优先使用有音频的）
    if (rawData.phonetic) {
        result.phonetic = rawData.phonetic;
    } else if (Array.isArray(rawData.phonetics) && rawData.phonetics.length > 0) {
        // 优先选择有音频的音标
        const withAudio = rawData.phonetics.find(p => p.audio && p.text);
        const anyPhonetic = rawData.phonetics.find(p => p.text);
        result.phonetic = (withAudio || anyPhonetic)?.text || '';
    }

    // 解析词义
    if (Array.isArray(rawData.meanings)) {
        result.meanings = rawData.meanings.map(meaning => {
            const pos = meaning.partOfSpeech || '';
            const posAbbrev = PART_OF_SPEECH_MAP[pos.toLowerCase()] || pos;

            // 获取第一个定义和例句
            const firstDef = meaning.definitions?.[0] || {};

            return {
                partOfSpeech: pos,
                partOfSpeechAbbrev: posAbbrev,
                definition: firstDef.definition || '',
                example: firstDef.example || '',
                allDefinitions: meaning.definitions?.map(d => ({
                    definition: d.definition || '',
                    example: d.example || '',
                })) || [],
            };
        });
    }

    return result;
}

/**
 * 获取主要词义信息（第一个词性和定义）
 * @param {object} wordInfo - lookupWord 返回的单词信息
 * @returns {object} 主要词义信息
 */
export function getPrimaryMeaning(wordInfo) {
    if (!wordInfo || !wordInfo.meanings || wordInfo.meanings.length === 0) {
        return {
            partOfSpeech: '',
            partOfSpeechAbbrev: '',
            definition: '',
            example: '',
        };
    }

    return wordInfo.meanings[0];
}

/**
 * 格式化卡片正面内容
 * @param {string} originalText - 原始文本
 * @param {object|null} wordInfo - 词典信息
 * @param {string} translation - 翻译结果
 * @returns {string} 格式化的正面内容 (HTML)
 */
export function formatCardFront(originalText, wordInfo, translation) {
    const lines = [];

    // 原文
    lines.push(`<div class="word">${escapeHtml(originalText)}</div>`);

    // 音标
    if (wordInfo?.phonetic) {
        lines.push(`<div class="phonetic">${escapeHtml(wordInfo.phonetic)}</div>`);
    }

    // 词性 + 翻译
    const primary = getPrimaryMeaning(wordInfo);
    if (primary.partOfSpeechAbbrev) {
        lines.push(`<div class="pos-translation"><span class="pos">${escapeHtml(primary.partOfSpeechAbbrev)}</span> ${escapeHtml(translation)}</div>`);
    } else {
        lines.push(`<div class="translation">${escapeHtml(translation)}</div>`);
    }

    return lines.join('\n');
}

/**
 * 格式化卡片背面内容
 * @param {object|null} wordInfo - 词典信息
 * @param {string} translation - 翻译结果
 * @returns {string} 格式化的背面内容 (HTML)
 */
export function formatCardBack(wordInfo, translation) {
    const lines = [];

    // 中文翻译
    lines.push(`<div class="translation-main">${escapeHtml(translation)}</div>`);

    if (wordInfo && wordInfo.meanings && wordInfo.meanings.length > 0) {
        lines.push('<hr>');

        // 遍历所有词义
        for (const meaning of wordInfo.meanings) {
            if (meaning.definition) {
                lines.push(`<div class="meaning">`);
                lines.push(`<span class="pos">${escapeHtml(meaning.partOfSpeechAbbrev)}</span> ${escapeHtml(meaning.definition)}`);
                lines.push(`</div>`);

                // 例句
                if (meaning.example) {
                    lines.push(`<div class="example">📝 ${escapeHtml(meaning.example)}</div>`);
                }
            }
        }
    }

    return lines.join('\n');
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * 构建 AnkiTrans 独立字段对象
 * @param {string} originalText - 原始文本
 * @param {object|null} wordInfo - 词典信息
 * @param {string} translation - 翻译结果
 * @returns {object} 字段对象 { Word, Phonetic, PartOfSpeech, Translation, Definition, Example }
 */
export function buildCardFields(originalText, wordInfo, translation) {
    const primary = getPrimaryMeaning(wordInfo);

    return {
        Word: originalText || '',
        Phonetic: wordInfo?.phonetic || '',
        PartOfSpeech: primary.partOfSpeechAbbrev || '',
        Translation: translation || '',
        Definition: primary.definition || '',
        Example: primary.example || '',
    };
}

export default {
    lookupWord,
    getPrimaryMeaning,
    formatCardFront,
    formatCardBack,
    buildCardFields,
};

