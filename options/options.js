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
});
