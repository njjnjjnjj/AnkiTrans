/**
 * AnkiConnect API 封装模块
 * 提供与 AnkiConnect 插件通信的接口
 */

const ANKI_CONNECT_URL = 'http://localhost:8765';
const ANKI_CONNECT_VERSION = 6;

// 缓存的模型名称
let cachedModelName = null;

/**
 * 发送请求到 AnkiConnect
 * @param {string} action - API 动作名称
 * @param {object} params - 参数对象
 * @returns {Promise<any>} - API 响应结果
 */
async function invoke(action, params = {}) {
    const response = await fetch(ANKI_CONNECT_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            action,
            version: ANKI_CONNECT_VERSION,
            params,
        }),
    });

    const result = await response.json();

    if (result.error) {
        throw new Error(result.error);
    }

    return result.result;
}

/**
 * 检测 AnkiConnect 连接状态
 * @returns {Promise<boolean>} - 是否连接成功
 */
export async function checkConnection() {
    try {
        const version = await invoke('version');
        return version >= ANKI_CONNECT_VERSION;
    } catch (error) {
        console.error('AnkiConnect connection failed:', error);
        return false;
    }
}

/**
 * 获取所有牌组名称
 * @returns {Promise<string[]>} - 牌组名称列表
 */
export async function getDeckNames() {
    return await invoke('deckNames');
}

/**
 * 获取所有笔记类型名称
 * @returns {Promise<string[]>} - 笔记类型名称列表
 */
export async function getModelNames() {
    return await invoke('modelNames');
}

/**
 * 获取适用的基础模型（带正反面字段）
 * @returns {Promise<{modelName: string, frontField: string, backField: string}>}
 */
export async function getBasicModel() {
    if (cachedModelName) {
        return cachedModelName;
    }

    const models = await getModelNames();

    // 尝试常见的基础模型名称
    const basicNames = ['Basic', '基础', '基本', 'Básico', 'Base', 'Einfach'];

    for (const name of basicNames) {
        if (models.includes(name)) {
            // 获取该模型的字段名
            const fields = await invoke('modelFieldNames', { modelName: name });
            if (fields.length >= 2) {
                cachedModelName = {
                    modelName: name,
                    frontField: fields[0],
                    backField: fields[1],
                };
                return cachedModelName;
            }
        }
    }

    // 如果没找到，使用第一个至少有2个字段的模型
    for (const model of models) {
        const fields = await invoke('modelFieldNames', { modelName: model });
        if (fields.length >= 2) {
            cachedModelName = {
                modelName: model,
                frontField: fields[0],
                backField: fields[1],
            };
            return cachedModelName;
        }
    }

    throw new Error('找不到可用的笔记类型，请在 Anki 中创建一个至少有两个字段的模型');
}

/**
 * 创建牌组（如果不存在）
 * @param {string} deckName - 牌组名称
 * @returns {Promise<number>} - 牌组 ID
 */
export async function createDeck(deckName) {
    return await invoke('createDeck', { deck: deckName });
}

/**
 * 添加笔记到 Anki
 * @param {object} options - 笔记选项
 * @param {string} options.deckName - 牌组名称
 * @param {string} options.front - 卡片正面内容
 * @param {string} options.back - 卡片背面内容
 * @param {string[]} [options.tags] - 标签列表
 * @returns {Promise<number>} - 笔记 ID
 */
export async function addNote({ deckName, front, back, tags = [] }) {
    // 动态获取可用的模型
    const { modelName, frontField, backField } = await getBasicModel();

    const fields = {};
    fields[frontField] = front;
    fields[backField] = back;

    return await invoke('addNote', {
        note: {
            deckName,
            modelName,
            fields,
            options: {
                allowDuplicate: false,
                duplicateScope: 'deck',
            },
            tags: ['AnkiTrans', ...tags],
        },
    });
}

/**
 * 检查笔记是否可以添加（避免重复）
 * @param {object} options - 笔记选项
 * @returns {Promise<boolean>} - 是否可以添加
 */
export async function canAddNote({ deckName, front, back }) {
    const { modelName, frontField, backField } = await getBasicModel();

    const fields = {};
    fields[frontField] = front;
    fields[backField] = back;

    const result = await invoke('canAddNotes', {
        notes: [
            {
                deckName,
                modelName,
                fields,
            },
        ],
    });
    return result[0];
}

export default {
    checkConnection,
    getDeckNames,
    getModelNames,
    getBasicModel,
    createDeck,
    addNote,
    canAddNote,
};
