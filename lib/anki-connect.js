/**
 * AnkiConnect API 封装模块
 * 提供与 AnkiConnect 插件通信的接口
 */

const ANKI_CONNECT_URL = 'http://localhost:8765';
const ANKI_CONNECT_VERSION = 6;

// AnkiTrans 专属模型配置
const ANKITRANS_MODEL_NAME = 'AnkiTrans';
const ANKITRANS_FIELDS = ['Word', 'Phonetic', 'PartOfSpeech', 'Translation', 'Definition', 'Example'];

// AnkiTrans 卡片模板 - 正面
const ANKITRANS_FRONT_TEMPLATE = `
<div class="ankitrans-card front">
  <div class="word">{{Word}}</div>
  {{#Phonetic}}<div class="phonetic">{{Phonetic}}</div>{{/Phonetic}}
  {{#PartOfSpeech}}<div class="pos">{{PartOfSpeech}}</div>{{/PartOfSpeech}}
</div>
`.trim();

// AnkiTrans 卡片模板 - 背面
const ANKITRANS_BACK_TEMPLATE = `
{{FrontSide}}
<hr id="answer">
<div class="ankitrans-card back">
  <div class="translation">{{Translation}}</div>
  {{#Definition}}<div class="definition">{{Definition}}</div>{{/Definition}}
  {{#Example}}<div class="example">📝 {{Example}}</div>{{/Example}}
</div>
`.trim();

// AnkiTrans 卡片样式 - 现代简洁风格
const ANKITRANS_CSS = `
.ankitrans-card {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  text-align: center;
  padding: 24px;
  max-width: 600px;
  margin: 0 auto;
}

.word {
  font-size: 2.5em;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 8px;
}

.phonetic {
  font-size: 1.3em;
  color: #666;
  margin-bottom: 6px;
}

.pos {
  display: inline-block;
  font-size: 0.95em;
  color: #fff;
  background: #4a90d9;
  padding: 2px 10px;
  border-radius: 12px;
  margin-top: 4px;
}

.translation {
  font-size: 1.8em;
  color: #2d3436;
  font-weight: 500;
  margin: 16px 0;
}

.definition {
  font-size: 1.1em;
  color: #555;
  font-style: italic;
  line-height: 1.5;
  margin-bottom: 12px;
}

.example {
  font-size: 1em;
  color: #777;
  background: #f8f9fa;
  padding: 10px 16px;
  border-radius: 8px;
  border-left: 3px solid #4a90d9;
  text-align: left;
}

hr#answer {
  border: none;
  border-top: 1px solid #e0e0e0;
  margin: 20px 0;
}
`.trim();

// 缓存的模型名称
let cachedModelName = null;

/**
 * 发送请求到 AnkiConnect
 * @param {string} action - API 动作名称
 * @param {object} params - 参数对象
 * @returns {Promise<any>} - API 响应结果
 */
async function invoke(action, params = {}) {
    try {
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
    } catch (error) {
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            throw new Error('无法连接到 Anki，请确保 Anki 已运行且安装了 AnkiConnect 插件 (代码: 2055492159)');
        }
        throw error;
    }
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
 * 获取笔记类型的字段列表
 */
export async function getModelFieldNames(modelName) {
    return await invoke('modelFieldNames', { modelName });
}

/**
 * 检查笔记类型是否存在
 * @param {string} modelName - 笔记类型名称
 * @returns {Promise<boolean>}
 */
export async function modelExists(modelName) {
    const models = await getModelNames();
    return models.includes(modelName);
}

/**
 * 创建 AnkiTrans 专属笔记类型
 * @returns {Promise<void>}
 */
export async function createAnkiTransModel() {
    await invoke('createModel', {
        modelName: ANKITRANS_MODEL_NAME,
        inOrderFields: ANKITRANS_FIELDS,
        css: ANKITRANS_CSS,
        cardTemplates: [
            {
                Name: 'AnkiTrans Card',
                Front: ANKITRANS_FRONT_TEMPLATE,
                Back: ANKITRANS_BACK_TEMPLATE,
            }
        ],
    });
}

/**
 * 确保 AnkiTrans 笔记类型存在（不存在则创建）
 * @returns {Promise<boolean>} - 是否新创建了模型
 */
export async function ensureAnkiTransModel() {
    const exists = await modelExists(ANKITRANS_MODEL_NAME);
    if (!exists) {
        await createAnkiTransModel();
        return true;
    }
    return false;
}

/**
 * 获取 AnkiTrans 模型配置
 * @returns {object}
 */
export function getAnkiTransModelConfig() {
    return {
        modelName: ANKITRANS_MODEL_NAME,
        fields: ANKITRANS_FIELDS,
    };
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
 * @param {string} [options.modelName] - 笔记类型名称（可选，不提供则自动检测）
 * @param {string} [options.frontField] - 正面字段名（可选）
 * @param {string} [options.backField] - 背面字段名（可选）
 * @param {string} options.front - 卡片正面内容
 * @param {string} options.back - 卡片背面内容
 * @param {string[]} [options.tags] - 标签列表
 * @returns {Promise<number>} - 笔记 ID
 */
export async function addNote({ deckName, modelName, frontField, backField, front, back, tags = [] }) {
    // 如果用户没有指定模型/字段，则自动检测
    let finalModelName = modelName;
    let finalFrontField = frontField;
    let finalBackField = backField;

    if (!finalModelName || !finalFrontField || !finalBackField) {
        const basicModel = await getBasicModel();
        finalModelName = finalModelName || basicModel.modelName;
        finalFrontField = finalFrontField || basicModel.frontField;
        finalBackField = finalBackField || basicModel.backField;
    }

    const fields = {};
    fields[finalFrontField] = front;
    fields[finalBackField] = back;

    return await invoke('addNote', {
        note: {
            deckName,
            modelName: finalModelName,
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

/**
 * 使用 AnkiTrans 模型添加多字段笔记
 * @param {object} options - 笔记选项
 * @param {string} options.deckName - 牌组名称
 * @param {object} options.fields - 字段对象 { Word, Phonetic, PartOfSpeech, Translation, Definition, Example }
 * @param {string[]} [options.tags] - 标签列表
 * @returns {Promise<number>} - 笔记 ID
 */
export async function addNoteWithFields({ deckName, fields, tags = [] }) {
    // 确保 AnkiTrans 模型存在
    await ensureAnkiTransModel();

    return await invoke('addNote', {
        note: {
            deckName,
            modelName: ANKITRANS_MODEL_NAME,
            fields,
            options: {
                allowDuplicate: false,
                duplicateScope: 'deck',
            },
            tags: ['AnkiTrans', ...tags],
        },
    });
}

export default {
    checkConnection,
    getDeckNames,
    getModelNames,
    getModelFieldNames,
    modelExists,
    createAnkiTransModel,
    ensureAnkiTransModel,
    getAnkiTransModelConfig,
    getBasicModel,
    createDeck,
    addNote,
    addNoteWithFields,
    canAddNote,
};
