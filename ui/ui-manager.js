/**
 * @file ui/ui-manager.js
 * @description 前端 UI 管理器 (Frontend UI Manager)
 * * 核心职责 (Core Responsibilities):
 * 1. 框架预加载 (Frame Preloading):
 * - 负责创建并隐藏 `settings-frame` 和 `download-frame` 两个 Iframe。
 * - 实现 "预加载+显示/隐藏" 机制，确保用户点击时 UI 能毫秒级响应，避免加载延迟。
 * * 2. 样式注入与隔离 (Style Injection & Isolation):
 * - 向主页面注入全局布局样式 (`layouts.css`)。
 * - 使用 Shadow DOM 封装悬浮球 (FAB) 和 Toast 容器，防止宿主页面 CSS 污染扩展 UI。
 * * 3. 全局反馈系统 (Global Feedback System):
 * - `showToast`: 提供跨模块的 Toast 通知接口，支持自定义操作按钮 (Actions)。
 * - `_initTooltipSystem`: 在 Content Script 层级初始化 Tooltip 系统。
 * * 通信链路 (Communication):
 * - Role: UI 桥梁，连接 Content Script 逻辑与 Iframe 视图。
 * - Output: 通过 `postMessage` 控制 Iframe 的显示与数据传递。
 * * @author weiyunjun
 * @version v0.1.0
 */

class UIManager {
    constructor() {
        this.toast = null;
        this.toastTimer = null;
        this.settingsFrame = null;
        this.downloadFrame = null;
        this.pendingDownloadCallback = null;
        this.pendingBatchCallback = null;
        this.shadowRoot = null;
        this.hostElement = null;
        this.toastContainer = null;
        this.currentTheme = 'default';
        this.tooltipEl = null;
        this.tooltipTimer = null;
        this.currentTooltipTarget = null;
        this._injectGlobalStyles();
        this._initToastContainer();
        this._initTooltipSystem();
        this._initializeThemingAndPreloadFrames();
    }

    _injectGlobalStyles() {
        const STYLE_ID = 'sakidown-global-layouts';

        if (document.getElementById(STYLE_ID)) return;
        const link = document.createElement('link');

        link.id = STYLE_ID;
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('ui/layouts.css');
        document.head.appendChild(link);
    }

    async _initializeThemingAndPreloadFrames() {
        const res = await chrome.storage.local.get(['user_theme', 'custom_themes_list']);

        this.currentTheme = res.user_theme || 'default';
        const customThemes = res.custom_themes_list || [];

        this._applyThemeToElement(document.body, this.currentTheme, customThemes);

        if (this.hostElement) {
            this._applyThemeToElement(this.hostElement, this.currentTheme, customThemes);
        }

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && (changes['user_theme'] || changes['custom_themes_list'])) {
                chrome.storage.local.get(['user_theme', 'custom_themes_list'], (r) => {
                    const newTheme = r.user_theme || 'default';
                    const newCustomThemes = r.custom_themes_list || [];

                    this.currentTheme = newTheme;
                    this._applyThemeToElement(document.body, newTheme, newCustomThemes);

                    if (this.hostElement) {
                        this._applyThemeToElement(this.hostElement, newTheme, newCustomThemes);
                    }
                });
            }
        });
        this._preloadSettingsFrame();
        this._preloadDownloadFrame();
    }

    _applyThemeToElement(element, themeValue, customThemes = []) {
        if (!element) return;

        if (element.classList && element.classList.length > 0) {
            const classesToRemove = [];

            element.classList.forEach((c) => {
                if (c.startsWith('theme-')) classesToRemove.push(c);
            });
            classesToRemove.forEach((c) => element.classList.remove(c));
        }

        let color = null;

        if (window.Theme && window.Theme.getThemeColor) {
            color = window.Theme.getThemeColor(themeValue, customThemes);
        }

        if (color && themeValue !== 'default') {
            element.style.setProperty('--primary', color);
            element.style.setProperty('--ring', color);
        } else {
            element.style.removeProperty('--primary');
            element.style.removeProperty('--ring');
        }
    }

    _createIframe(id, url, zIndex = 2147483647) {
        if (document.getElementById(id)) return document.getElementById(id);
        const iframe = document.createElement('iframe');

        iframe.id = id;
        iframe.src = chrome.runtime.getURL(url);
        iframe.className = 'ud-iframe-layer';
        iframe.style.visibility = 'hidden';
        iframe.style.opacity = '0';
        iframe.style.border = 'none';
        iframe.style.zIndex = zIndex;
        document.body.appendChild(iframe);

        return iframe;
    }

    _showFrame(iframe) {
        if (!iframe) return;
        iframe.style.removeProperty('visibility');
        iframe.style.removeProperty('opacity');
        requestAnimationFrame(() => {
            iframe.classList.add('show');
        });
    }

    _hideFrame(iframe) {
        if (!iframe) return;
        iframe.classList.remove('show');
    }

    _preloadSettingsFrame() {
        this.settingsFrame = this._createIframe('sakidown-settings-frame', 'settings/settings-frame.html', 2147483647);
        window.addEventListener('message', (e) => {
            if (e.data?.type === 'CLOSE_SETTINGS_FRAME') {
                this._hideFrame(this.settingsFrame);
            }
        });
    }

    openSettings() {
        if (!this.settingsFrame) this._preloadSettingsFrame();
        this._showFrame(this.settingsFrame);
    }

    _preloadDownloadFrame() {
        this.downloadFrame = this._createIframe('sakidown-download-frame', 'ui/download-frame.html', 2147483640);
        window.addEventListener('message', (e) => {
            if (!e.data) return;

            if (e.data.type === 'CLOSE_DOWNLOAD_FRAME') {
                this._hideFrame(this.downloadFrame);
                this.pendingDownloadCallback = null;
            } else if (e.data.type === 'DOWNLOAD_CONFIRMED_BATCH') {
                if (this.pendingBatchCallback) {
                    const { items: items, config: config, strategy: strategy } = e.data.payload;

                    this.pendingBatchCallback(items, config, strategy);
                }

                this._hideFrame(this.downloadFrame);
            }
        });
    }

    showBatchModal(playlist) {
        if (!this.downloadFrame) this._preloadDownloadFrame();

        const send = () => {
            this.downloadFrame.contentWindow.postMessage({ type: 'OPEN_BATCH', payload: playlist }, '*');
            this._showFrame(this.downloadFrame);
        };

        if (this.downloadFrame.contentWindow) {
            send();
        } else {
            this.downloadFrame.onload = send;
        }
    }

    onBatchConfirm(callback) {
        this.pendingBatchCallback = callback;
    }

    _initTooltipSystem() {
        if (!this.shadowRoot) return;
        this.tooltipEl = document.createElement('div');
        this.tooltipEl.className = 'ud-tooltip';
        this.shadowRoot.appendChild(this.tooltipEl);
        const DEFAULT_DELAY = 300;
        const listenTarget = document;

        listenTarget.addEventListener('mouseover', (e) => {
            const target = e.target.closest('[data-ud-tooltip]');

            if (target !== this.currentTooltipTarget) {
                this._hideTooltip();
                this.currentTooltipTarget = target;

                if (target) {
                    const delay = target.dataset.udTooltipDelay ? parseInt(target.dataset.udTooltipDelay, 10) : DEFAULT_DELAY;
                    const content = target.dataset.udTooltip;

                    if (!content) return;
                    this.tooltipTimer = setTimeout(() => {
                        this._showTooltip(target, content);
                    }, delay);
                }
            }
        });
        listenTarget.addEventListener('mouseout', (e) => {
            if (this.currentTooltipTarget && !this.currentTooltipTarget.contains(e.relatedTarget)) {
                this._hideTooltip();
                this.currentTooltipTarget = null;
            }
        });
        window.addEventListener('scroll', () => this._hideTooltip(), true);
        window.addEventListener('click', () => this._hideTooltip());
    }

    _showTooltip(target, content) {
        if (!this.tooltipEl || !target) return;
        this.tooltipEl.innerHTML = content;
        const customWidth = target.dataset.udTooltipWidth;

        this.tooltipEl.style.maxWidth = customWidth || '260px';
        this.tooltipEl.classList.remove('show');
        this.tooltipEl.classList.remove('ud-tooltip-bottom', 'ud-tooltip-right', 'ud-tooltip-left');
        const rect = target.getBoundingClientRect();
        const tipRect = this.tooltipEl.getBoundingClientRect();
        const tipWidth = tipRect.width || 200;
        const tipHeight = tipRect.height || 40;
        const gap = 10;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
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

    _hideTooltip() {
        if (this.tooltipTimer) {
            clearTimeout(this.tooltipTimer);
            this.tooltipTimer = null;
        }

        if (this.tooltipEl) {
            this.tooltipEl.classList.remove('show');
        }
    }

    _initToastContainer() {
        const HOST_ID = 'sakidown-toast-host';
        let host = document.getElementById(HOST_ID);

        if (!host) {
            host = document.createElement('div');
            host.id = HOST_ID;
            host.className = 'ud-toast-host';

            if (this.currentTheme) {
                this._applyThemeToElement(host, this.currentTheme);
            }

            document.body.appendChild(host);
            this.hostElement = host;
            this.shadowRoot = host.attachShadow({ mode: 'open' });
            const style = document.createElement('style');

            this.shadowRoot.appendChild(style);
            Promise.all([
                fetch(chrome.runtime.getURL('ui/theme.css')).then((r) => r.text()),
                fetch(chrome.runtime.getURL('ui/components.css')).then((r) => r.text()),
            ])
                .then(([themeCss, compCss]) => {
                    style.textContent = themeCss + '\n' + compCss;
                })
                .catch((err) => console.error('[SakiDown] Failed to load toast styles:', err));
            this.toastContainer = document.createElement('div');
            this.toastContainer.className = 'ud-toast-container';
            this.shadowRoot.appendChild(this.toastContainer);
        } else {
            this.hostElement = host;
            this.shadowRoot = host.shadowRoot;
            this.toastContainer = this.shadowRoot.querySelector('.ud-toast-container');
        }
    }

    showToast(message, options = 5000) {
        if (!this.toastContainer) return;
        let duration = 5000;
        let actions = [];

        if (typeof options === 'number') {
            duration = options;
        } else if (typeof options === 'object') {
            if (options.duration !== undefined) duration = options.duration;

            if (options.actions && Array.isArray(options.actions)) {
                actions = options.actions;
            } else if (options.action) {
                actions = [options.action];
            }
        }

        const toast = document.createElement('div');

        toast.className = 'ud-toast';
        const contentDiv = document.createElement('div');

        contentDiv.className = 'ud-toast-content';
        contentDiv.textContent = message;
        toast.appendChild(contentDiv);

        if (actions.length > 0) {
            const actionsContainer = document.createElement('div');

            actionsContainer.className = 'ud-toast-actions';
            actions.forEach((act) => {
                if (!act.text) return;
                const btn = document.createElement('button');

                btn.className = act.type === 'primary' ? 'ud-btn ud-btn-important' : 'ud-btn ud-btn-normal';
                btn.textContent = act.text;

                btn.onclick = (e) => {
                    e.stopPropagation();
                    if (act.callback) act.callback();
                    this._removeToast(toast);
                };

                actionsContainer.appendChild(btn);
            });
            toast.appendChild(actionsContainer);
        }

        this.toastContainer.appendChild(toast);
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        if (duration > 0) {
            const timer = setTimeout(() => {
                this._removeToast(toast);
            }, duration);

            toast.onmouseenter = () => clearTimeout(timer);

            toast.onmouseleave = () => {
                setTimeout(() => this._removeToast(toast), 2000);
            };
        }
    }

    _removeToast(toast) {
        if (!toast || !toast.parentNode) return;
        toast.classList.remove('show');
        toast.addEventListener(
            'transitionend',
            () => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            },
            { once: true },
        );
    }
}
window.UIManager = UIManager;
