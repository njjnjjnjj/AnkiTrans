/**
 * 必应词典服务模块 - 完整增强版
 * 从 cn.bing.com/dict 抓取所有可用内容，支持复数、时态、搭配、领域释义等
 */

const BING_DICT_URL = 'https://cn.bing.com/dict/search';

/**
 * 查询单词详细信息
 */
export async function lookupWord(word) {
    if (!word || typeof word !== 'string') {
        return null;
    }

    const cleanWord = word.trim().toLowerCase();
    if (!cleanWord) {
        return null;
    }

    try {
        const url = `${BING_DICT_URL}?q=${encodeURIComponent(cleanWord)}`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'zh-CN,zh;q=0.9',
            },
        });

        if (!response.ok) {
            console.error(`Bing Dictionary error: ${response.status}`);
            return null;
        }

        const html = await response.text();
        return parseHtmlWithRegex(html, cleanWord);
    } catch (error) {
        console.error('Bing Dictionary lookup error:', error);
        return null;
    }
}

/**
 * 解析 HTML - 提取所有可用数据
 */
export function parseHtmlWithRegex(html, queryWord) {
    const result = {
        queryWord: queryWord, // 用户查询的词
        headword: '',         // 词典词头（原型）
        phoneticUS: '',       // 美式音标
        phoneticUK: '',       // 英式音标
        inflection: '',       // 变形说明 (如 "applications is the plural of application")
        wordForms: [],        // 词形变化表格：[{label: '复数', value: 'applications'}]
        definitions: [],      // 简明释义：[{pos: 'n.', meanings: ['应用', '申请']}]
        detailedDefs: [],     // 详细/领域释义：[{pos: 'n.', defs: [{cn: '...', en: '...'}]}]
        collocations: [],     // 搭配：[{type: 'v.+n.', items: ['submit application', ...]}]
        synonyms: [],         // 同义词
        antonyms: [],         // 反义词
        examples: [],         // 例句
    };

    // 1. 提取词头（headword）
    // <div class="hd_div" id="headword"><h1><strong>application</strong></h1></div>
    const headwordMatch = html.match(/<div class="hd_div" id="headword"><h1><strong>([^<]+)<\/strong><\/h1>/);
    if (headwordMatch) {
        result.headword = headwordMatch[1].trim();
    } else {
        // Fallback checks
        const fallbackMatch = html.match(/<span class="hw">([^<]+)<\/span>/);
        if (fallbackMatch) result.headword = fallbackMatch[1].trim();
    }

    // 如果没找到 headword，就用 queryWord
    if (!result.headword) result.headword = queryWord;

    // 2. 提取变形/复数说明 (顶部提示)
    // <div class="in_tip b_fpage">applications是application的复数</div>
    const inflectionMatch = html.match(/<div class=["']in_tip[^>]*>([\s\S]*?)<\/div>/);
    if (inflectionMatch) {
        result.inflection = cleanHtmlTags(inflectionMatch[1]);
    }

    // 3. 提取音标
    // 美式
    const phoneticUSMatch = html.match(/class="hd_prUS[^"]*"[^>]*>[^[]*\[([^\]]+)\]/);
    if (phoneticUSMatch) {
        result.phoneticUS = phoneticUSMatch[1];
    }
    // 英式
    const phoneticUKMatch = html.match(/class="hd_pr b_primtxt"[^>]*>[^[]*\[([^\]]+)\]/);
    if (phoneticUKMatch) {
        result.phoneticUK = phoneticUKMatch[1];
    }

    // 4. 提取词形变化表格 (复数：applications 等)
    // <div class="hd_if">...</div>
    const formsMatch = html.match(/<div class="hd_div1">\s*<div class="hd_if">([\s\S]*?)<\/div>/);
    if (formsMatch) {
        const formsHtml = formsMatch[1];
        // 匹配模式：<span class="b_primtxt">复数：</span><a ...>applications</a>
        const formRegex = /<span class="b_primtxt">([^<：:]+)[：:]<\/span>\s*<a[^>]*>([^<]+)<\/a>/g;
        let formMatch;
        while ((formMatch = formRegex.exec(formsHtml)) !== null) {
            result.wordForms.push({
                label: formMatch[1].trim(),
                value: formMatch[2].trim(),
            });
        }
    }

    // 5. 提取简明释义 (qdef 区域)
    // <li><span class="pos">n.</span><span class="def b_regtxt"><span>应用；申请...</span></span></li>
    const qdefRegex = /<li>\s*<span class="pos([^"]*)"[^>]*>([^<]*)<\/span>\s*<span class="def[^"]*"[^>]*><span>([\s\S]*?)<\/span>/g;
    let defMatch;
    while ((defMatch = qdefRegex.exec(html)) !== null) {
        const isWeb = defMatch[1].includes('web');
        const pos = defMatch[2].trim();
        const defHtml = defMatch[3];
        // 有时候 span 里面可能还有其他标签，先清理
        const plainDef = cleanHtmlTags(defHtml);
        const meanings = plainDef.split(/[；;]/).map(m => m.trim()).filter(Boolean);

        if (!isWeb && meanings.length > 0) {
            result.definitions.push({ pos, meanings });
        }
    }

    // 6. 提取详细/领域释义 (crossid 或 homoid)
    // 寻找包含详细释义的表格行
    // <tr class="def_row df_div1">...</tr>
    // 里面包含 <div class="pos pos1">n.</div> 和 <div class="de_li1 ...">...</div>
    const detailedRowRegex = /<tr class="def_row df_div1">([\s\S]*?)<\/tr>/g;
    let rowMatch;
    while ((rowMatch = detailedRowRegex.exec(html)) !== null) {
        const rowHtml = rowMatch[1];

        // 词性
        const posMatch = rowHtml.match(/<div class="pos[^"]*">([^<]+)<\/div>/);
        const pos = posMatch ? posMatch[1].trim() : '';

        // 提取该词性下的所有释义条目
        // <div class="de_li1 ...">
        const items = [];
        const itemRegex = /<div class="de_li1[^"]*">([\s\S]*?)<\/div>(?=\s*<div class="de_li1|$)/g;
        let itemMatch;
        // 提取 rowHtml 中的定义部分
        const defColMatch = rowHtml.match(/<div class="def_fl">([\s\S]*?)<\/div>\s*<\/td>/);
        if (defColMatch) {
            const defsHtml = defColMatch[1];

            // 匹配每一条：序号 + 释义
            // <div class="se_d ...">1.</div> <div class="df_cr_w">...</div>
            // df_cr_w 里面可能是纯中文，也可能是英英解释
            const singleDefRegex = /<div class="se_d[^"]*">(\d+)\.<\/div>\s*<div class="df_cr_w">([\s\S]*?)<\/div>/g;
            let sdMatch;
            while ((sdMatch = singleDefRegex.exec(defsHtml)) !== null) {
                const num = sdMatch[1];
                const contentHtml = sdMatch[2];
                // 简单清理标签作为内容，如果是英英，会有很多 a 标签，cleanHtmlTags 能处理
                items.push({
                    num,
                    def: cleanHtmlTags(contentHtml)
                });
            }
        }

        if (items.length > 0) {
            result.detailedDefs.push({ pos, defs: items });
        }
    }

    // 如果没有找到详细释义（可能是只有简明释义的情况），尝试从简明释义构建
    if (result.detailedDefs.length === 0 && result.definitions.length > 0) {
        result.definitions.forEach(d => {
            result.detailedDefs.push({
                pos: d.pos,
                defs: d.meanings.map((m, i) => ({ num: (i + 1).toString(), def: m }))
            });
        });
    }

    // 7. 提取搭配 (colid 区域)
    const colSectionMatch = html.match(/<div id="colid"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<div id="antoid"/); // 粗略定位
    if (colSectionMatch || html.includes('id="colid"')) {
        // 更精确的提取
        const collocRegex = /<div class="de_title2[^"]*">([^<]+)<\/div>\s*<div class="col_fl">([\s\S]*?)<\/div>/g;
        let collocMatch;
        while ((collocMatch = collocRegex.exec(html)) !== null) {
            const type = collocMatch[1].trim();
            const itemsHtml = collocMatch[2];
            const itemRegex = /<span class="p1-4 b_alink">([^<]+)<\/span>/g;
            const items = [];
            let itemMatch;
            while ((itemMatch = itemRegex.exec(itemsHtml)) !== null) {
                items.push(itemMatch[1].trim());
            }
            if (items.length > 0) {
                result.collocations.push({ type, items });
            }
        }
    }

    // 8. 提取同义词
    const synSection = html.match(/id="synoid"[^>]*>([\s\S]*?)<\/div>(?=\s*<\/div>)/);
    if (synSection) {
        const synRegex = /<span class="p1-4 b_alink">([^<]+)<\/span>/g;
        let synMatch;
        while ((synMatch = synRegex.exec(synSection[1])) !== null) {
            const syn = synMatch[1].trim();
            if (!result.synonyms.includes(syn)) {
                result.synonyms.push(syn);
            }
        }
    }

    // 9. 提取反义词
    const antSection = html.match(/id="antoid"[^>]*>([\s\S]*?)<\/div>(?=\s*<\/div>)/);
    if (antSection) {
        const antRegex = /<span class="p1-4 b_alink">([^<]+)<\/span>/g;
        let antMatch;
        while ((antMatch = antRegex.exec(antSection[1])) !== null) {
            const ant = antMatch[1].trim();
            if (!result.antonyms.includes(ant)) {
                result.antonyms.push(ant);
            }
        }
    }

    // 10. 提取例句
    // <div class="se_li">...<div class="sen_en">...</div>...<div class="sen_cn">...</div>...</div>
    const sentenceRegex = /<div[^>]*class="[^"]*se_li[^"]*"[^>]*>[\s\S]*?<div[^>]*class="[^"]*sen_en[^"]*"[^>]*>([\s\S]*?)<\/div>[\s\S]*?<div[^>]*class="[^"]*sen_cn[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
    let sentMatch;
    let count = 0;
    while ((sentMatch = sentenceRegex.exec(html)) !== null && count < 3) {
        const en = cleanHtmlTags(sentMatch[1]);
        const cn = cleanHtmlTags(sentMatch[2]);
        if (en && cn) {
            result.examples.push({ en, cn });
            count++;
        }
    }

    return result;
}

function cleanHtmlTags(text) {
    if (!text) return '';
    return text
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#160;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * 构建 AnkiTrans 字段对象 - 适配新设计
 */
export function buildCardFields(originalText, wordInfo) {
    const fields = {
        Word: originalText || '',
        Phonetic: '',
        Inflections: '',    // 新增：变形说明
        Translation: '',    // 简明释义
        DomainDefs: '',     // 新增：详细/领域释义
        Collocations: '',   // 新增：搭配
        Synonyms: '',       // 同义词/反义词合并
        Example: '',        // 例句
    };

    if (!wordInfo) return fields;

    // 1. 单词与变形
    // 如果查询词不是词头（例如复数），显示原型
    // 逻辑：如果有 inflection 提示，说明是变形；或者 headword 与 queryWord 不同
    if (wordInfo.inflection) {
        // e.g. "applications is the plural of application"
        // 提取 "plural of application"
        const infText = wordInfo.inflection.replace(`${wordInfo.queryWord} is `, '').replace(`${wordInfo.queryWord} are `, '');
        fields.Inflections = `<div class="inflection-tips">ℹ️ ${wordInfo.inflection}</div>`;
        // 如果查询的是复数，Word 字段通常还是显示用户选中的词，但在卡片上我们会显示 headword
        // 这里我们保持 Word 字段为用户选中的词，在模板里处理显示
    } else if (wordInfo.headword && wordInfo.headword.toLowerCase() !== originalText.toLowerCase()) {
        fields.Inflections = `<div class="inflection-tips">ℹ️ Form of <b>${wordInfo.headword}</b></div>`;
    }

    // 2. 音标: [US] /xxx/ [UK] /xxx/
    const phonetics = [];
    if (wordInfo.phoneticUS) phonetics.push(`<span class="ph-us">🇺🇸 /${wordInfo.phoneticUS}/</span>`);
    if (wordInfo.phoneticUK) phonetics.push(`<span class="ph-uk">🇬🇧 /${wordInfo.phoneticUK}/</span>`);
    fields.Phonetic = phonetics.join(' ');

    // 3. 简明释义 (Translation)
    if (wordInfo.definitions && wordInfo.definitions.length > 0) {
        const defLines = wordInfo.definitions.map(d =>
            `<div class="mean-line"><span class="pos-tag">${d.pos}</span> <span class="mean-text">${d.meanings.join('；')}</span></div>`
        );
        fields.Translation = defLines.join('');
    }

    // 4. 详细/领域释义 (DomainDefs)
    if (wordInfo.detailedDefs && wordInfo.detailedDefs.length > 0) {
        // 只使用前 3 个词性，每个词性最多 3 条，避免卡片过长
        const domLines = [];
        wordInfo.detailedDefs.slice(0, 3).forEach(group => {
            const items = group.defs.slice(0, 4).map(item =>
                `<li class="domain-li"><span class="num">${item.num}.</span> ${item.def}</li>`
            ).join('');
            domLines.push(`<div class="domain-group"><div class="domain-pos">${group.pos}</div><ul class="domain-ul">${items}</ul></div>`);
        });
        fields.DomainDefs = domLines.join('');
    }

    // 5. 搭配 (Collocations)
    if (wordInfo.collocations && wordInfo.collocations.length > 0) {
        const colLines = wordInfo.collocations.slice(0, 3).map(c => {
            const items = c.items.slice(0, 5).map(i => `<span class="col-tag">${i}</span>`).join('');
            return `<div class="col-row"><span class="col-type">${c.type}</span><div class="col-items">${items}</div></div>`;
        });
        fields.Collocations = colLines.join('');
    }

    // 6. 同义词
    const synLists = [];
    if (wordInfo.synonyms.length > 0) {
        synLists.push(`<div class="syn-row"><span class="syn-label">Synonyms</span><span class="syn-vals">${wordInfo.synonyms.slice(0, 8).join(', ')}</span></div>`);
    }
    if (wordInfo.antonyms.length > 0) {
        synLists.push(`<div class="syn-row"><span class="ant-label">Antonyms</span><span class="syn-vals">${wordInfo.antonyms.slice(0, 5).join(', ')}</span></div>`);
    }
    fields.Synonyms = synLists.join('');

    // 7. 例句
    if (wordInfo.examples && wordInfo.examples.length > 0) {
        const exLines = wordInfo.examples.map(ex =>
            `<div class="ex-pair"><div class="ex-en">${ex.en}</div><div class="ex-cn">${ex.cn}</div></div>`
        );
        fields.Example = exLines.join('');
    }

    return fields;
}

export function getPrimaryMeaning(wordInfo) {
    if (!wordInfo || !wordInfo.definitions || wordInfo.definitions.length === 0) {
        return '';
    }
    const first = wordInfo.definitions[0];
    return first.meanings[0] || '';
}

export default {
    lookupWord,
    buildCardFields,
    getPrimaryMeaning,
};
