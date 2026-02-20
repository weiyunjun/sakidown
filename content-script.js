/**
 * @file content-script.js
 * @description 页面注入脚本 (Content Script Coordinator)
 * * 核心职责 (Core Responsibilities):
 * 1. 环境初始化 (Environment Initialization):
 * - 向页面 `<head>` 注入 `adapters/bilibili.js` 以获取 Page Context 权限。
 * - 实例化 `UIManager`，并在页面左下角渲染悬浮下载按钮 (FAB)。
 * * 2. 消息路由 (Message Routing):
 * - **Adapter Bridge**: 监听 `window.postMessage`，接收适配器嗅探到的 `metadata` 或 `UPDATE_WBI_KEYS` 消息。
 * - **Background Bridge**: 将 Wbi 密钥、批量下载任务 (`BATCH_DOWNLOAD`) 转发给 Service Worker。
 * * 3. 交互流程控制 (Interaction Flow):
 * - 响应 FAB 点击 -> 发送 `TRIGGER_SNIFF` -> 接收 Metadata -> 调用 `ui.showBatchModal`。
 * - 处理来自 Popup 的指令 (`POPUP_TRIGGER_BATCH`, `OPEN_SETTINGS`)。
 * * 通信链路 (Communication):
 * - Input: 用户交互 (Click), Window Message (Adapter), Runtime Message (Background/Popup).
 * - Output: `chrome.runtime.sendMessage` (提交任务/更新密钥), `window.postMessage` (触发嗅探).
 * * @author weiyunjun
 * @version v0.1.0
 */

const FAB_HOST_ID = 'saki-fab-container';

const injectAdapter = () => {
    const script = document.createElement('script');

    script.src = chrome.runtime.getURL('adapters/bilibili.js');
    script.type = 'module';

    script.onload = () => {
        script.remove();
    };

    (document.head || document.documentElement).appendChild(script);
};

injectAdapter();
const StyleLoader = {
    cache: {},
    async load(shadowRoot, filePaths) {
        const styleEl = document.createElement('style');
        const cssContents = await Promise.all(
            filePaths.map(async (path) => {
                if (this.cache[path]) return this.cache[path];

                try {
                    const url = chrome.runtime.getURL(path);
                    const response = await fetch(url);
                    const text = await response.text();
                    const fixedText = text.replace(/url\(['"]?([^'")]+)['"]?\)/g, (match, p1) => {
                        if (p1.startsWith('data:')) return match;

                        return `url("${chrome.runtime.getURL('ui/' + p1)}")`;
                    });

                    this.cache[path] = fixedText;

                    return fixedText;
                } catch (e) {
                    console.error('[SakiDown] Failed to load CSS:', path, e);

                    return '';
                }
            }),
        );

        styleEl.textContent = cssContents.join('\n');
        shadowRoot.appendChild(styleEl);
    },
};
const ui = new window.UIManager();
let activeTrigger = null;

async function initQuickButton() {
    try {
        const { show_quick_button: show_quick_button } = await chrome.storage.local.get(['show_quick_button']);

        if (show_quick_button === false) return;
    } catch (e) {
        console.warn('[SakiDown] Config load failed, using default', e);
    }

    if (document.getElementById(FAB_HOST_ID)) return;
    const isSupported = /\/video\/|\/bangumi\/play\/|\/list\/|\/cheese\/play\/|\/festival\//.test(location.pathname);

    if (!isSupported) return;
    const host = document.createElement('div');

    host.id = FAB_HOST_ID;
    host.style.position = 'fixed';
    host.style.bottom = '24px';
    host.style.left = '24px';
    host.style.zIndex = '100000';
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    await StyleLoader.load(shadow, ['ui/theme.css', 'ui/components.css']);
    const fabStyle = document.createElement('style');

    fabStyle.textContent = `\n        .ud-fab {\n            /* 基础重置：消除浏览器默认按钮样式 */\n            appearance: none;\n            border: none;\n            outline: none;\n            cursor: pointer;\n            box-sizing: border-box;\n            \n            /* 尺寸与形状 */\n            width: 48px;\n            height: 48px;\n            border-radius: 12px;\n            padding: 0;\n            margin: 0;\n            \n            /* 颜色体系：背景用主题色，图标用背景色(通常是白色) */\n            background-color: var(--primary);\n            color: var(--background); \n            \n            /* 布局：绝对居中 */\n            display: flex;\n            align-items: center;\n            justify-content: center;\n            \n            /* 阴影与动画 */\n            box-shadow: 0 4px 12px rgba(0,0,0,0.15);\n            transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);\n        }\n        \n        .ud-fab:hover {\n            transform: scale(1.08) translateY(-2px);\n            box-shadow: 0 8px 20px rgba(0,0,0,0.25);\n            filter: brightness(1.1); /* 简单的悬浮变亮 */\n        }\n        \n        .ud-fab:active {\n            transform: scale(0.95);\n            filter: brightness(0.9);\n        }\n        \n        /* 强制 SVG 尺寸与颜色填充 */\n        .ud-fab svg {\n            width: 24px;\n            height: 24px;\n            fill: currentColor;\n            display: block; /* 消除基线间隙 */\n        }\n    `;
    shadow.appendChild(fabStyle);

    const applyTheme = () => {
        chrome.storage.local.get(['user_theme', 'custom_themes_list'], (res) => {
            const themeKey = res.user_theme || 'default';
            const customList = res.custom_themes_list || [];

            if (window.Theme && window.Theme.getThemeColor) {
                const color = window.Theme.getThemeColor(themeKey, customList);

                if (color) {
                    host.style.setProperty('--primary', color);
                    host.style.setProperty('--ring', color);
                } else {
                    host.style.removeProperty('--primary');
                    host.style.removeProperty('--ring');
                }
            }
        });
    };

    applyTheme();
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && (changes.user_theme || changes.custom_themes_list)) {
            applyTheme();
        }
    });
    const btn = document.createElement('button');

    btn.className = 'ud-fab';
    btn.innerHTML = window.Icons.download;

    btn.onclick = () => {
        activeTrigger = 'batch';
        window.postMessage({ source: 'SakiDown', type: 'TRIGGER_SNIFF' }, '*');
    };

    shadow.appendChild(btn);
}

setTimeout(initQuickButton, 0);
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.show_quick_button) {
        if (changes.show_quick_button.newValue === true) {
            initQuickButton();
        } else {
            const el = document.getElementById(FAB_HOST_ID);

            if (el) el.remove();
        }
    }
});
window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'SakiDown') return;
    const data = event.data;

    if (data.type === 'UPDATE_WBI_KEYS') {

        chrome.runtime.sendMessage({ type: 'UPDATE_WBI_KEYS', payload: data.payload });

        return;
    }

    if (data.type === 'SNIFF_ERROR') {
        ui.showToast(data.msg || '暂时不支持该页面', 5000);
        activeTrigger = null;

        return;
    }

    if (data.type === 'SNIFF_FAILURE') {
        ui.showToast(data.msg || '数据获取失败，请刷新重试', 5000);
        activeTrigger = null;

        return;
    }

    if (data.type === 'metadata') {
        const payload = data.payload;

        if (activeTrigger === 'batch') {
            ui.showBatchModal(payload);
        }

        activeTrigger = null;
    }
});
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'POPUP_INIT_CHECK') {
        sendResponse({ hasData: true, hasPlaylist: true, isSupported: true });

        return;
    }

    if (msg.type === 'POPUP_TRIGGER_BATCH') {
        activeTrigger = 'batch';
        window.postMessage({ source: 'SakiDown', type: 'TRIGGER_SNIFF' }, '*');
        sendResponse({ status: 'ok' });

        return;
    }

    if (msg.type === 'OPEN_SETTINGS') {
        ui.openSettings();
        sendResponse({ status: 'ok' });

        return;
    }

    if (msg.type === 'DOWNLOAD_PROGRESS') {
        const { status: status } = msg.payload;

        if (status === 'done') {
            ui.showToast('下载任务已完成', 5000);
            SoundPlayer.play('default.wav');
        }

        if (status === 'error') ui.showToast('下载出错', 5000);
    }

    if (msg.type === 'POPUP_SHOW_TOAST') ui.showToast(msg.msg, 5000);
});
ui.onBatchConfirm((selectedItems, strategy_config, fullStrategy) => {
    if (selectedItems.length === 0) return;

    if (fullStrategy && fullStrategy.name) {
        strategy_config.name = fullStrategy.name;
    } else {
        strategy_config.name = '未知策略';
    }

    let shellTasks = selectedItems;

    shellTasks.map((item) => {
        item.preference.strategy_config = strategy_config;
    });

    sendToBackgroundQueue(shellTasks, false);
});

function sendToBackgroundQueue(tasks, isSingleMode) {
    chrome.runtime.sendMessage({ type: 'BATCH_DOWNLOAD', payload: { tasks: tasks } }, (res) => {
        if (res && res.status === 'success') {
            if (ui.hideModal) ui.hideModal();
            ui.showToast(`已添加 ${tasks.length} 个任务，点击任务管理按钮可以查看详情`, {
                duration: 0,
                actions: [
                    { text: '关闭', type: 'normal', callback: () => {} },
                    {
                        text: '任务管理',
                        type: 'normal',
                        callback: () => {
                            chrome.runtime.sendMessage({ type: 'OPEN_MANAGER' });
                        },
                    },
                ],
            });
        }
    });
}
