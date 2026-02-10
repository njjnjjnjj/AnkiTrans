import {
    ANKITRANS_FRONT_TEMPLATE,
    ANKITRANS_BACK_TEMPLATE,
    ANKITRANS_CSS
} from '../lib/anki-connect.js';

// options.js
document.addEventListener('DOMContentLoaded', async () => {
    const previewToggle = document.getElementById('enable-preview');

    // Load settings
    const { enablePreview, shortcut } = await chrome.storage.sync.get({
        enablePreview: true,
        shortcut: { modifiers: ['Ctrl', 'Shift'], key: 'A', display: 'Ctrl + Shift + A' }
    });
    previewToggle.checked = enablePreview;

    // Shortcut Logic
    const shortcutInput = document.getElementById('shortcut-input');
    const resetBtn = document.getElementById('reset-shortcut');
    const msgEl = document.getElementById('shortcut-status');
    let isRecording = false;

    // Display current shortcut
    function displayShortcut(sc) {
        shortcutInput.value = sc.display;
    }
    displayShortcut(shortcut);

    // Start recording on click/focus
    shortcutInput.addEventListener('click', () => {
        isRecording = true;
        shortcutInput.classList.add('recording');
        shortcutInput.value = '请按下快捷键...';
        msgEl.textContent = '按 Esc 取消';
        msgEl.className = 'shortcut-msg';
    });

    // Blur handler to cancel if clicked outside without saving
    shortcutInput.addEventListener('blur', () => {
        if (isRecording) {
            isRecording = false;
            shortcutInput.classList.remove('recording');
            chrome.storage.sync.get(['shortcut'], (result) => {
                displayShortcut(result.shortcut || { modifiers: ['Ctrl', 'Shift'], key: 'A', display: 'Ctrl + Shift + A' });
            });
            msgEl.textContent = '';
        }
    });

    // Handle keydown
    shortcutInput.addEventListener('keydown', async (e) => {
        if (!isRecording) return;
        e.preventDefault();
        e.stopPropagation();

        // Cancel on Esc
        if (e.key === 'Escape') {
            shortcutInput.blur();
            return;
        }

        // Build key combo
        const modifiers = [];
        if (e.ctrlKey) modifiers.push('Ctrl');
        if (e.altKey) modifiers.push('Alt');
        if (e.shiftKey) modifiers.push('Shift');
        if (e.metaKey) modifiers.push('Command'); // Mac support

        let key = e.key.toUpperCase();
        // Skip isolated modifier presses
        if (['CONTROL', 'ALT', 'SHIFT', 'META'].includes(key)) return;

        // Validation: Must have at least one modifier
        if (modifiers.length === 0) {
            msgEl.textContent = '错误：必须包含 Ctrl/Alt/Shift 修饰键';
            msgEl.className = 'shortcut-msg error';
            return;
        }

        // Validation: Block browser conflicts
        const forbidden = ['C', 'V', 'X', 'A', 'Z', 'T', 'W', 'N', 'R', 'F', 'P', 'S', 'O', 'D'];
        const isCommonConflict = e.ctrlKey && forbidden.includes(key) && !e.shiftKey && !e.altKey;

        if (isCommonConflict) {
            msgEl.textContent = `保留快捷键冲突：不支持 Ctrl + ${key}`;
            msgEl.className = 'shortcut-msg error';
            return;
        }

        // Valid shortcut found
        const newShortcut = {
            modifiers: modifiers,
            key: key,
            display: `${modifiers.join(' + ')} + ${key}`
        };

        // Save
        await chrome.storage.sync.set({ shortcut: newShortcut });
        displayShortcut(newShortcut);

        isRecording = false;
        shortcutInput.classList.remove('recording');
        msgEl.textContent = '保存成功！';
        msgEl.className = 'shortcut-msg success';
        shortcutInput.blur();

        console.log('Shortcut updated:', newShortcut);
    });

    // Reset handler
    resetBtn.addEventListener('click', async () => {
        const defaultShortcut = { modifiers: ['Ctrl', 'Shift'], key: 'A', display: 'Ctrl + Shift + A' };
        await chrome.storage.sync.set({ shortcut: defaultShortcut });
        displayShortcut(defaultShortcut);
        msgEl.textContent = '已恢复默认设置';
        msgEl.className = 'shortcut-msg success';
    });

    // Save settings on change
    previewToggle.addEventListener('change', async () => {
        await chrome.storage.sync.set({ enablePreview: previewToggle.checked });
        console.log('Setting updated: enablePreview =', previewToggle.checked);
    });

    // Initial load
    updateMockCard();

    // Sidebar Navigation Logic
    const navLinks = document.querySelectorAll('.sidebar-nav .nav-link');
    const sections = Array.from(navLinks).map(link => {
        const id = link.getAttribute('href').substring(1);
        return document.getElementById(id);
    }).filter(el => el);

    let isManualScroll = false;
    let manualScrollTimeout;

    // Click handler to update UI immediately and preventing observer interference
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            // Remove active class from all
            navLinks.forEach(nav => nav.classList.remove('active'));
            // Add to clicked
            link.classList.add('active');

            // Set flag to disable observer temporarily
            isManualScroll = true;
            clearTimeout(manualScrollTimeout);
            manualScrollTimeout = setTimeout(() => {
                isManualScroll = false;
            }, 1000); // 1s buffer for smooth scroll to complete
        });
    });

    // Scroll Spy using IntersectionObserver
    const observer = new IntersectionObserver((entries) => {
        if (isManualScroll) return;

        // Find the most visible section
        let maxRatio = 0;
        let activeId = '';

        // We need to look at all entries to decide the winner, 
        // but IntersectionObserver only gives us changed entries.
        // So this logic below is a bit simplified: it highlights the last one that triggered 'isIntersecting'
        // which works well for top-down scrolling.
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                activeId = entry.target.id;
            }
        });

        if (activeId) {
            navLinks.forEach(link => {
                link.classList.toggle('active', link.getAttribute('href') === `#${activeId}`);
            });
        }
    }, {
        root: null,
        // Adjust rootMargin to highlight section when it's in the top half of the screen
        rootMargin: '-20% 0px -60% 0px',
        threshold: 0
    });

    sections.forEach(section => {
        if (section) observer.observe(section);
    });
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

    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const themeClass = isDarkMode ? 'night_mode' : '';
    const CACHE_KEY = 'ankitrans_mock_data_hello';

    // Helper to render content
    const renderContent = (data) => {
        const { fields, audioUS, audioUK } = data;
        let frontHtml = renderTemplate(ANKITRANS_FRONT_TEMPLATE, fields);
        let backHtml = renderTemplate(ANKITRANS_BACK_TEMPLATE, fields);

        // Inject Audio Buttons
        frontHtml = processPhoneticForPreview(frontHtml, audioUS, audioUK);
        backHtml = processPhoneticForPreview(backHtml, audioUS, audioUK);

        const audioCss = `
            .audio-btn {
                cursor: pointer; display: inline-block; margin-left: 4px;
                transition: transform 0.1s; font-size: 1.1em; vertical-align: middle;
            }
            .audio-btn:hover { opacity: 0.8; transform: scale(1.1); }
        `;

        const containerCss = `
            .modal-container {
              background: var(--bg-card, #fff);
              color: var(--text-main, #333);
              width: auto;
              max-width: 100%;
              border-radius: 12px;
              box-shadow: 0 4px 15px rgba(0,0,0,0.05);
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
                padding: 10px 20px;
                border-top: 1px solid var(--border, #e2e8f0);
                display: flex; justify-content: center;
                background: var(--bg-block, #f7fafc);
                font-size: 12px; color: var(--text-muted, #999);
            }
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
                        <span>示例数据 (Sample Data) • hello</span>
                    </div>
                </div>
            </div>
        `;

        // Bind Audio Events
        shadow.querySelectorAll('.audio-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const url = btn.getAttribute('data-url');
                if (url) {
                    new Audio(url).play().catch(err => console.warn('Audio play failed', err));
                }
            };
        });
    };

    // Try cache first
    try {
        const cache = await chrome.storage.local.get(CACHE_KEY);
        if (cache[CACHE_KEY]) {
            renderContent(cache[CACHE_KEY]);
            return;
        }
    } catch (e) {
        console.warn('Cache read error', e);
    }

    // Cache miss, show loading
    shadow.innerHTML = `
        <style>
            :host { display: block; width: 100%; font-family: -apple-system, sans-serif; }
            .loading { color: #718096; padding: 20px; text-align: center; }
        </style>
        <div class="loading">⏳ 正在从必应词典 (© Microsoft) 获取最新数据... (hello)</div>
    `;

    try {
        const response = await chrome.runtime.sendMessage({ type: 'TEST_LOOKUP', word: 'hello' });

        if (response && response.fields) {
            // Save to cache
            await chrome.storage.local.set({ [CACHE_KEY]: response });
            renderContent(response);
        } else {
            shadow.innerHTML = `
                <div style="text-align: center; color: #e53e3e; padding: 20px;">
                    Preview load failed. Please check network.
                </div>
            `;
        }
    } catch (e) {
        console.error('Mock preview error', e);
        if (shadow) {
            shadow.innerHTML = `<div style="padding: 20px; color: red;">Error: ${e.message}</div>`;
        }
    }
}
