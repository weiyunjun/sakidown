/**
 * @file settings/about-panel.js
 * @description 关于页面面板 (About Panel)
 * * 核心职责 (Core Responsibilities):
 * 1. 信息展示 (Information Display):
 * - 展示应用图标、名称、描述。
 * - 展示版本号、开源地址、版权信息及开源协议。
 * * 2. 交互逻辑 (Interaction Logic):
 * - 纯 DOM 构建，样式完全依赖 ui/components.css。
 * - 提供外部链接跳转 (GitHub, License)。
 * * 通信链路 (Communication):
 * - Input: 无 (纯静态展示)。
 * - Output: 无。
 * * @author weiyunjun
 * @version v0.1.0
 */

class AboutPanel {
    constructor(headerContainer, contentContainer, modal) {
        this.dom = { header: headerContainer, content: contentContainer };
        this.modal = modal;
    }

    render() {
        this._renderHeader();
        this._renderContent();
    }

    _renderHeader() {
        this.dom.header.innerHTML = '';
    }

    _renderContent() {
        this.dom.content.innerHTML = '';
        const DOM = window.DOMUtils;
        const form = this.dom.content;
        const section = DOM.create('div', 'ud-settings-section');

        const headerDiv = DOM.create('div', 'ud-about-header');
        
        const icon = DOM.create('img', 'ud-about-icon');
        icon.src = '../assets/icon.png';
        headerDiv.appendChild(icon);

        const desc = DOM.create('div', 'ud-about-desc', 'SakiDown是一个遵循Chrome Manifest V3标准的哔哩哔哩视频下载和管理插件。基于原生JavaScript开发，无任何外部依赖，开箱即用。');
        headerDiv.appendChild(desc);

        section.appendChild(headerDiv);

        section.appendChild(this._createKVRow('软件版本', 'v0.1.0'));

        const repoLink = DOM.create('a', 'ud-link', 'https://github.com/weiyunjun/sakidown');
        repoLink.href = 'https://github.com/weiyunjun/sakidown';
        repoLink.target = '_blank';
        section.appendChild(this._createKVRow('开源地址', repoLink));

        const footer = DOM.create('div', 'ud-about-footer');

        const copyContainer = DOM.create('div');
        copyContainer.appendChild(document.createTextNode('Copyright © 2026 '));
        
        const authorLink = DOM.create('a', 'ud-link', 'weiyunjun');
        authorLink.href = 'https://github.com/weiyunjun';
        authorLink.target = '_blank';
        copyContainer.appendChild(authorLink);
        
        footer.appendChild(copyContainer);

        const licenseLink = DOM.create('a', 'ud-link', 'MIT LICENSE');
        licenseLink.href = 'https://github.com/weiyunjun/sakidown/blob/main/LICENSE';
        licenseLink.target = '_blank';
        footer.appendChild(licenseLink);

        section.appendChild(footer);

        form.appendChild(section);
    }

    _createKVRow(label, content) {
        const DOM = window.DOMUtils;
        const row = DOM.create('div', 'ud-form-row flex-between');
        
        const labelEl = DOM.create('div', 'ud-form-label', label);
        row.appendChild(labelEl);

        const controls = DOM.create('div', 'ud-form-controls');
        
        if (typeof content === 'string') {
            const text = DOM.create('span', 'ud-form-suffix', content);
            text.style.color = 'var(--foreground)';
            controls.appendChild(text);
        } else {
            controls.appendChild(content);
        }
        
        row.appendChild(controls);
        return row;
    }
}
window.AboutPanel = AboutPanel;