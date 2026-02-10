/**
 * @file popup/popup.js
 * @description 扩展弹窗入口逻辑 (Extension Popup Entry)
 * * 核心职责 (Core Responsibilities):
 * 1. 初始化与主题同步 (Init & Theme Sync):
 * - 扩展图标被点击时触发，负责读取存储中的主题配置 (`user_theme`)。
 * - 动态注入 CSS 变量 (`--primary`) 和 SVG 图标，确保弹窗 UI 与主程序风格一致。
 * 2. 交互路由 (Interaction Routing):
 * - **下载**: 向当前激活的 Tab 发送 `POPUP_TRIGGER_BATCH` 消息，唤起 Content Script 的批量下载面板。
 * - **管理**: 实现智能路由逻辑，根据 `saki_counter_queue` (队列数) 和 `saki_counter_history` (历史数) 决定打开管理面板时默认显示的 Tab。
 * - **设置**: 向 Content Script 发送 `OPEN_SETTINGS` 消息，在页面内打开设置模态框。
 * * 通信链路 (Communication):
 * - Input: 用户点击弹窗按钮。
 * - Output: `chrome.tabs.sendMessage` (与 Content Script 通信), `chrome.tabs.create` (打开新标签页)。
 * * @author weiyunjun
 * @version v0.1.0
 */

document.addEventListener('DOMContentLoaded', async () => {
    chrome.storage.local.get(['user_theme', 'custom_themes_list'], (res) => {
        const theme = res.user_theme || 'default';
        const customList = res.custom_themes_list || [];
        let color = null;

        if (window.Theme && window.Theme.getThemeColor) {
            color = window.Theme.getThemeColor(theme, customList);
        }

        if (color && theme !== 'default') {
            document.body.style.setProperty('--primary', color);
            document.body.style.setProperty('--ring', color);
        } else {
            document.body.style.removeProperty('--primary');
            document.body.style.removeProperty('--ring');
        }
    });
    const btnDownload = document.getElementById('btn-download');
    const btnManager = document.getElementById('btn-manager');
    const btnSettings = document.getElementById('btn-settings');

    const injectIcon = (element, iconName) => {
        const iconContainer = element.querySelector('.ud-popup-icon');

        if (iconContainer && window.Icons && window.Icons[iconName]) {
            iconContainer.innerHTML = window.Icons[iconName];
        }
    };

    if (window.Icons) {
        injectIcon(btnDownload, 'download');
        injectIcon(btnManager, 'manager');
        injectIcon(btnSettings, 'settings');
    }

    async function sendMessageToContent(message) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab || !tab.id) return null;
            if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) return null;

            return await chrome.tabs.sendMessage(tab.id, message);
        } catch (e) {

            return null;
        }
    }

    btnDownload.addEventListener('click', async () => {
        sendMessageToContent({ type: 'POPUP_TRIGGER_BATCH' });
        window.close();
    });
    btnManager.addEventListener('click', async () => {
        const { saki_counter_queue: saki_counter_queue = 0, saki_counter_history: saki_counter_history = 0 } =
      await chrome.storage.local.get(['saki_counter_queue', 'saki_counter_history']);
        let tab = 'active';

        if (saki_counter_queue > 0) {
            tab = 'active';
        } else if (saki_counter_history > 0) {
            tab = 'completed';
        } else {
            tab = 'active';
        }

        chrome.tabs.create({ url: `manager/manager.html?tab=${tab}&page=1` });
        window.close();
    });
    btnSettings.addEventListener('click', () => {
        sendMessageToContent({ type: 'OPEN_SETTINGS' });
        window.close();
    });
});
