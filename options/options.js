import {
    ANKITRANS_FRONT_TEMPLATE,
    ANKITRANS_BACK_TEMPLATE,
    ANKITRANS_CSS
} from '../lib/anki-connect.js';

// options.js
document.addEventListener('DOMContentLoaded', async () => {
    const previewToggle = document.getElementById('enable-preview');

    // Load settings
    const { enablePreview } = await chrome.storage.sync.get({ enablePreview: true });
    previewToggle.checked = enablePreview;

    // Save settings on change
    previewToggle.addEventListener('change', async () => {
        await chrome.storage.sync.set({ enablePreview: previewToggle.checked });
        console.log('Setting updated: enablePreview =', previewToggle.checked);
    });

    // Initial load
    updateMockCard();
});

/**
 * 渲染简单的 Mustache 模板 (Copy from content.js)
 */
function renderTemplate(template, data) {
    let result = template;
    // Section
    const sectionRegex = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
    result = result.replace(sectionRegex, (match, key, content) => {
        return data[key] ? content.replace(/\{\{(\w+)\}\}/g, (m, k) => k === key ? data[key] : m) : '';
    });
    // Variable
    result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return data[key] || '';
    });
    return result;
}

/**
 * 处理音频按钮注入 (Copy logic from content.js)
 */
function processPhoneticForPreview(html, audioUS, audioUK) {
    let processed = html;
    processed = processed.replace(/\[sound:[^\]]+\]/g, '');

    if (audioUS && processed.includes('class="ph-us"')) {
        processed = processed.replace(
            /<span class="ph-us">([^<]+)<\/span>/,
            `<span class="ph-us">$1 <span class="audio-btn" data-url="${audioUS}" title="Click to play US Audio">🔊</span></span>`
        );
    }
    if (audioUK && processed.includes('class="ph-uk"')) {
        processed = processed.replace(
            /<span class="ph-uk">([^<]+)<\/span>/,
            `<span class="ph-uk">$1 <span class="audio-btn" data-url="${audioUK}" title="Click to play UK Audio">🔊</span></span>`
        );
    }
    return processed;
}

async function updateMockCard() {
    const host = document.getElementById('preview-container-host');
    if (!host) return;

    host.innerHTML = '<div style="color: var(--text-secondary); padding: 20px;">⏳ 正在从必应词典获取最新数据... (hello)</div>';

    try {
        // Fetch real data for 'hello'
        const response = await chrome.runtime.sendMessage({ type: 'TEST_LOOKUP', word: 'hello' });

        if (response && response.fields) {
            const fields = response.fields;

            // Note: We don't have raw audio URLs in 'fields' directly if we only used buildCardFields.
            // But TEST_LOOKUP in background.js returns { fields }. 
            // We need background.js to also return audioUS/audioUK separately if we want to play them,
            // OR extracting them from the 'Phonetic' field if we successfully embedded them.
            // background's TEST_LOOKUP logic just calls lookupWord + buildCardFields.
            // Using a hack to re-lookup or assume urls based on standard bing format? 
            // Better: update background to return raw audio urls too.
            // For now, let's see if we can extract from [sound:...] if present.
            // Actually, buildCardFields puts [sound:...] only if we downloaded them. In TEST_LOOKUP, we do NOT download.
            // So fields.Phonetic has just spans.
            // We need to request audioURLs from background or modify TEST_LOOKUP.

            // Let's assume for this "Preview Consistency" task, we want to match content.js
            // content.js receives { fields, audioUS, audioUK... }

            // To be perfect, we should ask background to return full wordInfo or audio links.
            // Let's modify background TEST_LOOKUP if possible, but I am editing options.js now.
            // I will use a fallback or try to update background in next step if needed.
            // Wait, I can't update background in this turn if I didn't plan it? I can try to infer or re-fetch?
            // Actually, let's just make it look right. Audio might not play if URL is missing.

            // Render logic
            let frontHtml = renderTemplate(ANKITRANS_FRONT_TEMPLATE, fields);
            let backHtml = renderTemplate(ANKITRANS_BACK_TEMPLATE, fields);

            // CSS Variables Wrapper
            // Note: options.css handles --bg-card etc? 
            // options.css defines :root. ANKITRANS_CSS also defines :root.
            // We need to scoped this.

            const html = `
                <div class="modal-container">
                    <div class="modal-header">
                        <span class="modal-title">Push to Anki Preview</span>
                        <div class="close-btn">&times;</div>
                    </div>
                    <div class="modal-content">
                        <div class="preview-label-internal">Front</div>
                        <div class="card-preview">${frontHtml}</div>
                        <div class="preview-label-internal">Back</div>
                        <div class="card-preview">${backHtml}</div>
                    </div>
                    <div class="refresh-btn-container">
                         <button id="refresh-mock-btn" class="btn btn-primary" style="background: var(--primary-gradient);">
                            🔄 刷新数据 (Refresh)
                         </button>
                    </div>
                </div>
                <style>
                    ${ANKITRANS_CSS}
                    /* Overrides to ensure it fits in options page */
                    .card { box-shadow: none; margin: 0; width: 100%; border: none; }
                </style>
            `;

            host.innerHTML = html;

            const refreshBtn = document.getElementById('refresh-mock-btn');
            refreshBtn.onclick = updateMockCard;

        } else {
            host.innerHTML = '<div>Load failed.</div><button id="retry">Retry</button>';
            document.getElementById('retry').onclick = updateMockCard;
        }

    } catch (e) {
        console.error('Mock preview error', e);
        host.innerHTML = `<div>Error: ${e.message}</div>`;
    }
}
