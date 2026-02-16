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

        this.dom.header.innerHTML = '';
        const leftGroup = DOM.create('div', 'ud-settings-header-left');
        const titleEl = DOM.create('span', 'ud-panel-title', '通用');

        leftGroup.appendChild(titleEl);
        this.dom.header.appendChild(leftGroup);
        const form = this.dom.content;
        const downloadSection = DOM.create('div', 'ud-settings-section');

        downloadSection.appendChild(DOM.create('div', 'ud-form-header', '下载设置'));
        const quickSwitch = DOM.createSwitchInput({
            checked: this.config.show_quick_button,
            onChange: (checked) => {
                this.config.show_quick_button = checked;
                this._saveConfig('show_quick_button');
            },
        });

        const quickBtnRow = DOM.createFormRow({
            label: '视频页面显示下载按钮',
            note: '在播放页左下角显示快速下载入口',
            content: quickSwitch
        });

        downloadSection.appendChild(quickBtnRow);
        const intervalRow = this._createNumberRow({
            label: '任务间隔',
            value: this.config.task_interval,
            min: 0,
            max: 60,
            defaultValue: 5,
            suffix: '秒',
            note: '前一个任务结束后，下一个任务需要等待的时间',
            onChange: (val) => {
                this.config.task_interval = parseInt(val, 10);
                this._saveConfig('task_interval');
            },
        });

        downloadSection.appendChild(intervalRow);
        form.appendChild(downloadSection);
    }

    _createNumberRow({
        label: label,
        value: value,
        min: min,
        max: max,
        defaultValue: defaultValue,
        suffix: suffix,
        note: note,
        onChange: onChange,
    }) {
        const DOM = window.DOMUtils;
        const rowClassName = note ? 'ud-form-row flex-between align-start' : 'ud-form-row flex-between';
        const row = DOM.create('div', rowClassName);
        const labelGroup = DOM.createLabelGroup({ label: label, note: note });

        row.appendChild(labelGroup);
        const rightContainer = DOM.create('div', 'ud-form-controls');
        const inputWrapper = DOM.createInput({
            type: 'number',
            value: value,
            min: min,
            max: max,
            defaultValue: defaultValue,
            onChange: onChange,
        });

        rightContainer.appendChild(inputWrapper);

        if (suffix) {
            const suffixEl = DOM.create('span', 'ud-form-suffix', suffix);

            rightContainer.appendChild(suffixEl);
        }

        row.appendChild(rightContainer);

        return row;
    }

    _saveConfig(key) {
        if (key && this.config[key] !== undefined) {
            chrome.storage.local.set({ [key]: this.config[key] });
        }
    }
}
window.GeneralPanel = GeneralPanel;
