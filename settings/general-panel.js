/**
 * @file settings/general-panel.js
 * @description 通用设置面板控制器 (General Settings Panel)
 * * 核心职责 (Core Responsibilities):
 * 1. 配置管理 (Configuration Management):
 * - 管理全局通用参数：`task_interval` (任务间隔) 和 `show_quick_button` (视频页悬浮球)。
 * - 实现配置的异步读取 (`chrome.storage.local.get`) 与持久化保存 (`_saveConfig`)。
 * * 2. 表单渲染 (Form Rendering):
 * - 基于 `DOMUtils` 封装表单组件，实现标准化的 Label + Control 布局。
 * - 提供数字输入框的边界限制 (Min/Max) 和单位后缀显示。
 * * 通信链路 (Communication):
 * - Input: 读取 `chrome.storage.local` 中的配置项。
 * - Output: 写入 `chrome.storage.local`，变更即时生效 (由各模块监听 storage 变化)。
 * * @author weiyunjun
 * @version v0.1.0
 */

class GeneralPanel {
    constructor(headerContainer, contentContainer, modal) {
        this.dom = { header: headerContainer, content: contentContainer };
        this.modal = modal;
        this.config = { task_interval: 5, show_quick_button: true };
    }

    async render() {
        await new Promise((resolve) => {
            const keys = ['task_interval', 'show_quick_button'];

            chrome.storage.local.get(keys, (res) => {
                if (res.task_interval !== undefined) {
                    this.config.task_interval = res.task_interval;
                }

                if (res.show_quick_button !== undefined) {
                    this.config.show_quick_button = res.show_quick_button;
                }

                resolve();
            });
        });
        this._renderUI();
    }

    _renderUI() {
        this.dom.content.innerHTML = '';
        const DOM = window.DOMUtils;

        // 1. 渲染 Header
        this.dom.header.innerHTML = '';
        const leftGroup = DOM.create('div', 'ud-settings-header-left');
        const titleEl = DOM.create('span', 'ud-panel-title', '通用');

        leftGroup.appendChild(titleEl);
        this.dom.header.appendChild(leftGroup);

        // 2. 初始化 FormBuilder
        if (window.FormBuilder && window.GeneralConfig && window.GeneralConfig.GENERAL_SCHEMA) {
            this.formBuilder = new window.FormBuilder(
                window.GeneralConfig.GENERAL_SCHEMA, 
                this.config
            );

            // 3. 监听变更实现“立即保存”
            this.formBuilder.onChange((newData) => {
                // 简单的 Diff 逻辑：找出变化了的 key 并保存
                Object.keys(newData).forEach(key => {
                    if (newData[key] !== this.config[key]) {
                        this.config[key] = newData[key];
                        this._saveConfig(key);
                    }
                });
            });

            this.dom.content.appendChild(this.formBuilder.render());
        } else {
            this.dom.content.innerHTML = '<div class="ud-panel-placeholder">GeneralConfig 模块未加载</div>';
        }
    }

    _saveConfig(key) {
        if (key && this.config[key] !== undefined) {
            chrome.storage.local.set({ [key]: this.config[key] });
        }
    }
}
window.GeneralPanel = GeneralPanel;
