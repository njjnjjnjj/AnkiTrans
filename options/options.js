// options.js
document.addEventListener('DOMContentLoaded', async () => {
    const previewToggle = document.getElementById('enable-preview');

    // Load settings
    const { enablePreview } = await chrome.storage.sync.get({ enablePreview: true });
    previewToggle.checked = enablePreview;

    // Save settings on change
    previewToggle.addEventListener('change', async () => {
        await chrome.storage.sync.set({ enablePreview: previewToggle.checked });

        // Visual feedback (optional)
        console.log('Setting updated: enablePreview =', previewToggle.checked);
    });

    // Handle Mock Card Refresh
    const refreshBtn = document.getElementById('refresh-mock-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            await updateMockCard();
        });
        // Auto load on init
        updateMockCard();
    }
});

async function updateMockCard() {
    const wordEl = document.getElementById('mock-word');
    const phoneEl = document.getElementById('mock-phonetic');
    const transEl = document.getElementById('mock-translation');
    const exEl = document.getElementById('mock-example');
    const btn = document.getElementById('refresh-mock-btn');

    if (!wordEl || !btn) return;

    try {
        btn.innerHTML = '⏳ 加载中...';
        btn.disabled = true;

        // Fetch real data for 'hello' or maybe random word? 'hello' is good for stability.
        const response = await chrome.runtime.sendMessage({ type: 'TEST_LOOKUP', word: 'hello' });

        if (response && response.fields) {
            const f = response.fields;
            wordEl.textContent = f.Word;
            phoneEl.innerHTML = f.Phonetic; // Contains HTML spans
            transEl.innerHTML = f.Translation; // Contains HTML divs
            exEl.innerHTML = f.Example || '<div style="opacity:0.6;">暂无例句</div>';

            // Clean up styles injected by buildCardFields if needed, but they are mostly class based
            // We might need to ensure CSS matches.
        }
    } catch (e) {
        console.error('Mock card update failed', e);
        // Fallback or leave as is (static)
    } finally {
        btn.innerHTML = '🔄 刷新数据';
        btn.disabled = false;
    }
}
