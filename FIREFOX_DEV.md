# Firefox 开发与发布指南 (Firefox Development Guide)

AnkiTrans 采用了可复用的架构，大部分前端与后台逻辑 (JavaScript, HTML, CSS) 在 Chrome 和 Firefox 之间是通用的。

## 💡 实现原理 (Mechanism)

1. **代码通用性**：Firefox 提供了一套兼容层，允许直接使用 `chrome.*` API (如 `chrome.runtime`, `chrome.tabs`)，因此我们的 `background.js` 和 `content.js` 无需任何修改即可在 Firefox 上运行。
2. **Manifest 差异**：
    * **Chrome**: 使用 `manifest.json`，遵循 Manifest V3 标准，后台脚本使用 `service_worker`。
    * **Firefox**: 使用 `manifest.firefox.json` (开发时)，同样遵循 MV3 但后台脚本使用 `background.scripts` (Event Page 模式)，且必须包含 `browser_specific_settings` (扩展 ID)。
3. **打包脚本**：`pack_firefox.ps1` 脚本会自动将通用代码复制到 `dist-firefox` 目录，并将 `manifest.firefox.json` 重命名为标准的 `manifest.json`，确保 Firefox 能正确读取。

## 🔄 同步流程 (Sync Workflow)

当您在 Chrome 版本 (主代码库) 中开发新功能时，请遵循以下流程同步至 Firefox：

1. **开发与修改**：
    * 直接修改 `src` 目录下的通用文件 (`background/`, `content/`, `popup/`, `lib/` 等)。
    * 这些修改会自动适用于 Chrome 版本。

2. **更新 Manifest (如需)**：
    * 如果新功能引入了新的 **权限 (permissions)** 或 **资源文件**，请务必 **同时更新**：
        * `manifest.json` (Chrome)
        * `manifest.firefox.json` (Firefox)
    * 保持两者的 `version` 号同步。

3. **构建 Firefox 版本**：
    * 在项目根目录运行打包脚本：

        ```powershell
        .\pack_firefox.ps1
        ```

    * 这将更新 `dist-firefox` 文件夹中的内容。

4. **验证与发布**：
    * 在 Firefox 中重新加载扩展 (从 `dist-firefox` 目录) 进行测试。
    * 确认无误后，将 `dist-firefox` 文件夹打包为 `.zip` 文件提交至 Firefox Add-ons (AMO) 审核。

## ⚠️ 注意事项

* **API 差异**：虽然大部分 API 兼容，但 Firefox 的 `Service Worker` 支持仍在完善中，目前推荐使用 `Event Page` (即脚本后台)。
* **权限审核**：Firefox 的审核对 `host_permissions` 较为严格，如非必要尽量减少 `<all_urls>` 的使用 (本项目核心功能需要划词，故保留)。
