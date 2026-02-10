/**
 * @file ui/download-main.js
 * @description 下载弹窗 Iframe 入口 (Download Frame Entry)
 * * 核心职责 (Core Responsibilities):
 * 1. 弹窗生命周期 (Modal Lifecycle):
 * - 作为 `download-frame.html` 的入口脚本，负责初始化 `BatchModal`。
 * - 监听 `OPEN_BATCH` 消息，根据传入的播放列表数据渲染批量下载界面。
 * * 2. 样式与交互隔离 (Style & Interaction Isolation):
 * - 在 Iframe 内部独立实现 Tooltip 系统 (`IframeTooltipManager`)，解决跨 Frame 悬浮提示无法显示的问题。
 * - 独立监听主题变更消息，确保 Iframe 内部样式与主程序同步。
 * * 3. 策略联动 (Strategy Sync):
 * - 监听 `STRATEGIES_UPDATED_BROADCAST`，在策略变更时实时刷新弹窗内的下拉选项。
 * * 通信链路 (Communication):
 * - Input: 接收父页面 (Content Script) 的 `OPEN_BATCH` 消息。
 * - Output: 向父页面发送 `DOWNLOAD_CONFIRMED_BATCH` (确认下载) 或 `CLOSE_DOWNLOAD_FRAME` (关闭)。
 * * @author weiyunjun
 * @version v0.1.0
 */

let currentModal = null;

function applyTheme(theme, customThemes = []) {
    document.body.className = document.body.className
        .split(' ')
        .filter((c) => !c.startsWith('theme-'))
        .join(' ');
    let color = null;

    if (window.Theme && window.Theme.getThemeColor) {
        color = window.Theme.getThemeColor(theme, customThemes);
    }

    if (color && theme !== 'default') {
        document.body.style.setProperty('--primary', color);
        document.body.style.setProperty('--ring', color);
    } else {
        document.body.style.removeProperty('--primary');
        document.body.style.removeProperty('--ring');
    }
}

chrome.storage.local.get(['user_theme', 'custom_themes_list'], (res) => {
    applyTheme(res.user_theme || 'default', res.custom_themes_list || []);
});
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes['user_theme'] || changes['custom_themes_list'])) {
        chrome.storage.local.get(['user_theme', 'custom_themes_list'], (res) => {
            applyTheme(res.user_theme || 'default', res.custom_themes_list || []);
        });
    }
});
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'STRATEGIES_UPDATED_BROADCAST') {
        if (currentModal && typeof currentModal.refreshStrategies === 'function') {
            currentModal.refreshStrategies();
        }
    }
});
window.addEventListener('message', (event) => {
    const msg = event.data;

    if (!msg || !msg.type) return;

    if (currentModal) {
        currentModal.destroy();
        currentModal = null;
    }

    if (msg.type === 'OPEN_BATCH') {
        const playlist = msg.payload;

        if (window.BatchModal) {
            currentModal = new window.BatchModal(playlist);
            currentModal.onConfirm((items, config, strategy) => {
                window.parent.postMessage(
                    { type: 'DOWNLOAD_CONFIRMED_BATCH', payload: { items: items, config: config, strategy: strategy } },
                    '*',
                );
                closeFrame();
            });
            currentModal.onCancel(closeFrame);
            currentModal.showModal();
        }
    }
});

function closeFrame() {
    window.parent.postMessage({ type: 'CLOSE_DOWNLOAD_FRAME' }, '*');
}

class IframeTooltipManager {
    constructor() {
        this.tooltipEl = null;
        this.tooltipTimer = null;
        this.currentTooltipTarget = null;
        this._init();
    }

    _init() {
        this.tooltipEl = document.createElement('div');
        this.tooltipEl.className = 'ud-tooltip';
        document.body.appendChild(this.tooltipEl);
        document.addEventListener('mouseover', (e) => this._handleMouseOver(e));
        document.addEventListener('mouseout', (e) => this._handleMouseOut(e));
        document.addEventListener('click', () => this._hide());
        document.addEventListener('scroll', () => this._hide(), true);
    }

    _handleMouseOver(e) {
        const target = e.target.closest('[data-ud-tooltip]');

        if (target !== this.currentTooltipTarget) {
            this._hide();
            this.currentTooltipTarget = target;

            if (target) {
                const delay = target.dataset.udTooltipDelay ? parseInt(target.dataset.udTooltipDelay, 10) : 300;
                const content = target.dataset.udTooltip;

                if (!content) return;
                this.tooltipTimer = setTimeout(() => {
                    this._show(target, content);
                }, delay);
            }
        }
    }

    _handleMouseOut(e) {
        if (this.currentTooltipTarget && !this.currentTooltipTarget.contains(e.relatedTarget)) {
            this._hide();
            this.currentTooltipTarget = null;
        }
    }

    _show(target, content) {
        if (!this.tooltipEl || !target) return;
        this.tooltipEl.innerHTML = content;
        const customWidth = target.dataset.udTooltipWidth;

        this.tooltipEl.style.maxWidth = customWidth || '260px';
        this.tooltipEl.classList.remove('show', 'ud-tooltip-bottom', 'ud-tooltip-right', 'ud-tooltip-left');
        const rect = target.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const tipRect = this.tooltipEl.getBoundingClientRect();
        const tipWidth = tipRect.width || 200;
        const tipHeight = tipRect.height || 40;
        const gap = 10;
        const preferredPos = target.dataset.udTooltipPos || 'top';
        let top, left;

        if (preferredPos === 'right') {
            left = rect.right + gap;
            top = rect.top + rect.height / 2 - tipHeight / 2;

            if (left + tipWidth > viewportWidth - gap) {
                left = rect.left - tipWidth - gap;
                this.tooltipEl.classList.add('ud-tooltip-left');
            } else {
                this.tooltipEl.classList.add('ud-tooltip-right');
            }

            if (top < gap) top = gap;
            if (top + tipHeight > viewportHeight - gap) top = viewportHeight - tipHeight - gap;
        } else {
            top = rect.top - tipHeight - gap;
            left = rect.left + rect.width / 2 - tipWidth / 2;

            if (top < 0) {
                top = rect.bottom + gap;
                this.tooltipEl.classList.add('ud-tooltip-bottom');
            }

            if (left < gap) left = gap;
            else if (left + tipWidth > viewportWidth - gap) left = viewportWidth - tipWidth - gap;
        }

        this.tooltipEl.style.top = `${top}px`;
        this.tooltipEl.style.left = `${left}px`;
        requestAnimationFrame(() => {
            this.tooltipEl.classList.add('show');
        });
    }

    _hide() {
        if (this.tooltipTimer) {
            clearTimeout(this.tooltipTimer);
            this.tooltipTimer = null;
        }

        if (this.tooltipEl) {
            this.tooltipEl.classList.remove('show');
        }
    }
}
new IframeTooltipManager();
