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

    // Use Shadow DOM for isolation
    let shadow = host.shadowRoot;
    if (!shadow) {
        shadow = host.attachShadow({ mode: 'open' });
    }

    // Checking theme for class injection (though options page handles its own theme mostly, 
    // but inner card needs .night_mode class if applicable)
    // Actually, options page uses :root variables. 
    // ANKITRANS_CSS also has :root variables. 
    // Inside Shadow DOM, :root refers to the shadow root itself. Perfect.

    // Check if system is dark mode for the .night_mode class (Anki style)
    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const themeClass = isDarkMode ? 'night_mode' : '';

    // Initial loading state in shadow dom
    shadow.innerHTML = `
        <style>
            :host { 
                display: block; 
                width: 100%;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            .loading { 
                color: #718096; 
                padding: 20px; 
                text-align: center; 
            }
        </style>
        <div class="loading">⏳ 正在从必应词典获取最新数据... (hello)</div>
    `;

    try {
        const response = await chrome.runtime.sendMessage({ type: 'TEST_LOOKUP', word: 'hello' });

        if (response && response.fields) {
            const fields = response.fields;

            let frontHtml = renderTemplate(ANKITRANS_FRONT_TEMPLATE, fields);
            let backHtml = renderTemplate(ANKITRANS_BACK_TEMPLATE, fields);

            // Audio CSS (from content.js)
            const audioCss = `
                .audio-btn {
                    cursor: pointer; display: inline-block; margin-left: 4px;
                    transition: transform 0.1s; font-size: 1.1em; vertical-align: middle;
                }
                .audio-btn:hover { opacity: 0.8; transform: scale(1.1); }
            `;

            // Modal/Container CSS (Copied from options.css mostly, but scoped here)
            // We need to duplicate the modal styles here because external CSS won't penetrate Shadow DOM 
            // unless we use parts/slotted, but simple replication is safer for total isolation.
            const containerCss = `
                .modal-container {
                  background: var(--bg-card, #fff);
                  color: var(--text-main, #333);
                  width: auto;
                  max-width: 100%;
                  border-radius: 12px;
                  box-shadow: 0 4px 15px rgba(0,0,0,0.05); /* Softer shadow for embedded */
                  display: flex;
                  flex-direction: column;
                  overflow: hidden;
                  border: 1px solid var(--border, #e2e8f0);
                  box-sizing: border-box;
                }
                .modal-header {
                  padding: 12px 20px;
                  border-bottom: 1px solid var(--border, #e2e8f0);
                  display: flex; justify-content: space-between; align-items: center;
                  background: var(--bg-block, #f7fafc);
                }
                .modal-title { font-weight: 600; font-size: 14px; }
                .close-btn { opacity: 0.5; cursor: not-allowed; }
                .modal-content { padding: 20px; }
                .preview-label-internal {
                    font-size: 11px; text-transform: uppercase; color: var(--text-muted, #999);
                    margin: 12px 0 6px; letter-spacing: 0.05em; font-weight: 600;
                }
                .card-preview {
                    border: 1px dashed var(--border, #e2e8f0);
                    padding: 15px; border-radius: 8px; margin-bottom: 10px;
                    background: var(--bg-card, #fff);
                }
                .modal-footer {
                    padding: 12px 20px;
                    border-top: 1px solid var(--border, #e2e8f0);
                    display: flex; justify-content: center;
                    background: var(--bg-block, #f7fafc);
                }
                button {
                    padding: 6px 16px; border-radius: 6px; font-weight: 500; cursor: pointer;
                    background: #667eea; color: white; border: none; font-size: 13px;
                }
                button:hover { opacity: 0.9; }
                
                /* Ensure card content doesn't overflow */
                .card { box-shadow: none !important; margin: 0 !important; width: 100% !important; max-width: 100% !important; border: none !important; padding: 0 !important; }
            `;

            shadow.innerHTML = `
                <style>
                    ${ANKITRANS_CSS}
                    ${audioCss}
                    ${containerCss}
                </style>
                <div class="theme-wrapper anki-variables ${themeClass}">
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
                        <div class="modal-footer">
                             <button id="refresh-mock-btn">🔄 刷新数据 (Refresh)</button>
                        </div>
                    </div>
                </div>
            `;

            // Re-bind click event inside shadow root
            const refreshBtn = shadow.getElementById('refresh-mock-btn');
            if (refreshBtn) {
                refreshBtn.onclick = updateMockCard;
            }

        } else {
            shadow.innerHTML = `
                <style>
                    button { padding: 8px 16px; margin-top: 10px; cursor: pointer; }
                </style>
                <div style="text-align: center; color: #e53e3e; padding: 20px;">
                    Load failed. <br>
                    <button id="retry">Retry</button>
                </div>
            `;
            shadow.getElementById('retry').onclick = updateMockCard;
        }

    } catch (e) {
        console.error('Mock preview error', e);
        if (shadow) {
            shadow.innerHTML = `<div style="padding: 20px; color: red;">Error: ${e.message}</div>`;
        }
    }
}
