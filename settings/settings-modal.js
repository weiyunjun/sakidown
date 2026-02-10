/**
 * @file settings/settings-modal.js
 * @description 设置中心模态框容器 (Settings Modal Container)
 * * 核心职责 (Core Responsibilities):
 * 1. 路由与导航 (Routing & Navigation):
 * - 管理左侧侧边栏导航，支持 Tab 切换 (`common`, `general`, `strategies`, `data`)。
 * - 实现 Tab 状态持久化 (`bd_last_settings_tab`)，记录用户上次访问的面板。
 * * 2. 模块动态加载 (Dynamic Module Loading):
 * - 采用懒加载模式初始化各子面板 (`GeneralPanel`, `ThemePanel` 等)，仅在切换到对应 Tab 时实例化。
 * - 提供模块未加载时的占位符 UI (`_renderSimpleHeader`)。
 * * 3. 全局反馈与主题 (Global Feedback & Theme):
 * - `initTheme`: 静态方法，负责初始化应用主题色，并监听 storage 变化实现实时换肤。
 * - `showToast`: 提供全局轻量级提示，支持自动堆叠和销毁。
 * * 通信链路 (Communication):
 * - Input: 用户点击设置按钮或接收 `OPEN_SETTINGS` 消息。
 * - Output: 挂载 DOM 节点，调度子 Panel 的渲染方法。
 * * @author weiyunjun
 * @version v0.1.0
 */

class SettingsModal extends window.BaseModal {
    constructor(options = {}) {
        super(Object.assign({ width: '760px', showClose: false }, options));
        this.currentTab = localStorage.getItem('bd_last_settings_tab') || 'common';
        this.activePanel = null;
        this._updateSidebarActive(this.currentTab);
        this._switchTab(this.currentTab);
    }

    static initTheme() {
        const apply = (theme, customThemes = []) => {
            if (document.body.classList.length > 0) {
                const classesToRemove = [];

                document.body.classList.forEach((c) => {
                    if (c.startsWith('theme-')) classesToRemove.push(c);
                });
                classesToRemove.forEach((c) => document.body.classList.remove(c));
            }

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
        };

        chrome.storage.local.get(['user_theme', 'custom_themes_list'], (res) => {
            apply(res.user_theme || 'default', res.custom_themes_list || []);
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && (changes['user_theme'] || changes['custom_themes_list'])) {
                chrome.storage.local.get(['user_theme', 'custom_themes_list'], (res) => {
                    apply(res.user_theme || 'default', res.custom_themes_list || []);
                });
            }
        });
    }

    _createDOM() {
        const overlay = document.createElement('div');

        overlay.className = 'ud-modal-mask';
        overlay.innerHTML = `\n            <div class="ud-settings-container">\n                <div class="ud-settings-sidebar">\n                    <div class="ud-settings-app-title">设置</div>\n                    \n                    <button class="ud-settings-nav-item" data-tab="common">\n                        <span class="ud-settings-nav-icon">${window.Icons.general}</span>\n                        通用\n                    </button>\n                    <button class="ud-settings-nav-item" data-tab="general">\n                        <span class="ud-settings-nav-icon">${window.Icons.palette}</span>\n                        个性化\n                    </button>\n                    <button class="ud-settings-nav-item" data-tab="strategies">\n                        <span class="ud-settings-nav-icon">${window.Icons.strategy}</span>\n                        下载策略\n                    </button>\n                    <button class="ud-settings-nav-item" data-tab="data">\n                        <span class="ud-settings-nav-icon">${window.Icons.database}</span>\n                        数据\n                    </button>\n                    <button class="ud-settings-nav-item" data-tab="about">\n                        <span class="ud-settings-nav-icon">${window.Icons.about}</span>\n                        关于\n                    </button>\n                </div>\n\n                <div class="ud-settings-right-panel">\n                    <div id="setting-header-slot" class="ud-settings-header"></div>\n                    \n                    <div id="setting-content-slot" class="ud-settings-content-scroll"></div>\n                    \n                    <div class="ud-close-absolute js-close-settings">\n                        ${window.Icons.close}\n                    </div>\n                </div>\n            </div>\n        `;
        const mountNode = this.options.mountNode || document.body;

        mountNode.appendChild(overlay);
        this.overlay = overlay;
        const closeBtn = overlay.querySelector('.js-close-settings');

        if (closeBtn) closeBtn.onclick = () => this.hideModal();
        const navItems = overlay.querySelectorAll('.ud-settings-nav-item');

        navItems.forEach((item) => {
            item.onclick = () => {
                const targetTab = item.dataset.tab;

                if (targetTab === this.currentTab) return;
                this._switchTab(targetTab);
            };
        });
        this.dom = {
            container: overlay.querySelector('.ud-settings-container'),
            header: overlay.querySelector('#setting-header-slot'),
            content: overlay.querySelector('#setting-content-slot'),
        };
    }

    _switchTab(tabName) {
        this.currentTab = tabName;
        localStorage.setItem('bd_last_settings_tab', tabName);
        this._updateSidebarActive(tabName);
        this.dom.header.innerHTML = '';
        this.dom.content.innerHTML = '';
        this.activePanel = null;

        if (tabName === 'strategies') {
            if (window.StrategiesPanel) {
                this.activePanel = new window.StrategiesPanel(this.dom.header, this.dom.content, this);
                this.activePanel.render();
            } else {
                this.dom.content.innerHTML = '<div class="ud-panel-placeholder">StrategiesPanel 模块未加载</div>';
            }
        } else if (tabName === 'common') {
            if (window.GeneralPanel) {
                this.activePanel = new window.GeneralPanel(this.dom.header, this.dom.content, this);
                this.activePanel.render();
            } else {
                this._renderSimpleHeader('通用');
                this.dom.content.innerHTML = '<div class="ud-panel-placeholder">GeneralPanel 模块未加载</div>';
            }
        } else if (tabName === 'general') {
            if (window.ThemePanel) {
                this.activePanel = new window.ThemePanel(this.dom.header, this.dom.content, this);
                this.activePanel.render();
            } else {
                this._renderSimpleHeader('个性化');
                this.dom.content.innerHTML = '<div class="ud-panel-placeholder">ThemePanel 模块未加载</div>';
            }
        } else if (tabName === 'data') {
            if (window.DataPanel) {
                this.activePanel = new window.DataPanel(this.dom.header, this.dom.content, this);
                this.activePanel.render();
            } else {
                this._renderSimpleHeader('数据');
                this.dom.content.innerHTML = '<div class="ud-panel-placeholder">DataPanel 模块未加载</div>';
            }
        } else if (tabName === 'about') {
            if (window.AboutPanel) {
                this.activePanel = new window.AboutPanel(this.dom.header, this.dom.content, this);
                this.activePanel.render();
            } else {
                this._renderSimpleHeader('关于');
                this.dom.content.innerHTML = '<div class="ud-panel-placeholder">AboutPanel 模块未加载</div>';
            }
        }
    }

    _renderSimpleHeader(title) {
        const DOM = window.DOMUtils;
        const leftGroup = DOM.create('div', 'ud-settings-header-left');
        const titleEl = DOM.create('span', 'ud-panel-title', title);

        leftGroup.appendChild(titleEl);
        this.dom.header.appendChild(leftGroup);
    }

    showToast(message, duration = 5000) {
        let toastContainer = document.body.querySelector('.ud-toast-container');

        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.className = 'ud-toast-container';
            document.body.appendChild(toastContainer);
        }

        const toast = document.createElement('div');

        toast.className = 'ud-toast';
        toast.textContent = message;
        toastContainer.appendChild(toast);
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentElement) toast.parentElement.removeChild(toast);

                if (toastContainer.childNodes.length === 0) {
                    toastContainer.remove();
                }
            }, 300);
        }, duration);
    }

    _updateSidebarActive(activeTab) {
        if (!this.overlay) return;
        const navItems = this.overlay.querySelectorAll('.ud-settings-nav-item');

        navItems.forEach((item) => {
            if (item.dataset.tab === activeTab) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }
}
window.SettingsModal = SettingsModal;
