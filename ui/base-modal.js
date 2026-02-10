/**
 * @file ui/base-modal.js
 * @description 模态框基类 (Base Modal Class)
 * * 核心职责 (Core Responsibilities):
 * 1. DOM 工厂 (DOM Factory):
 * - 构建标准的模态框结构：遮罩层 (`Overlay`) -> 容器 -> Header/Body/Footer。
 * - 提供基础 UI 元素：标题、关闭按钮、取消/确认按钮。
 * 2. 生命周期管理 (Lifecycle Management):
 * - 提供 `showModal`, `hideModal`, `destroy` 方法，管理 DOM 的挂载与卸载。
 * - 封装 CSS 动画切换类 (`.show`)，实现平滑的淡入淡出效果。
 * 3. 事件回调封装 (Event Callback Encapsulation):
 * - 提供 `onConfirm` 钩子，支持外部注入业务逻辑。
 * - 提供 `setConfirmEnabled` / `setConfirmText` 方法，允许子类动态控制按钮状态。
 * * 通信链路 (Communication):
 * - Role: UI 组件基类，被 `BatchModal`, `SettingsModal`, `ConfirmModal` 继承。
 * * @author weiyunjun
 * @version v0.1.0
 */

class BaseModal {
    constructor(options = {}) {
        this.options = Object.assign({ title: '提示', width: '440px', mountNode: document.body, showClose: true }, options);
        this.overlay = null;
        this.dom = {};
        this.onConfirmCallback = null;
        this.onCancelCallback = null;
        this._createDOM();
        this._bindBaseEvents();
    }

    _createDOM() {
        const overlay = document.createElement('div');

        overlay.className = 'ud-modal-mask';
        let closeBtnHtml = '';

        if (this.options.showClose) {
            const closeIcon = window.Icons ? window.Icons.close : '✕';

            closeBtnHtml = `<div class="ud-close-absolute js-close">${closeIcon}</div>`;
        }

        overlay.innerHTML = `\n            <div class="ud-modal-container" style="width: ${this.options.width}">\n                <div class="ud-modal-header">\n                    <div class="ud-modal-title">${this.options.title}</div>\n                    ${closeBtnHtml}\n                </div>\n                \n                <div class="ud-modal-body"></div>\n                \n                <div class="ud-modal-footer">\n                    <div class="ud-footer-left ud-modal-spacer"></div>\n                    <button class="ud-btn ud-btn-normal js-cancel">取消</button>\n                    <button class="ud-btn ud-btn-important js-confirm">确认</button>\n                </div>\n            </div>\n        `;

        if (this.options.mountNode) {
            this.options.mountNode.appendChild(overlay);
        } else {
            document.body.appendChild(overlay);
        }

        this.overlay = overlay;
        this.dom = {
            container: overlay.querySelector('.ud-modal-container'),
            title: overlay.querySelector('.ud-modal-title'),
            body: overlay.querySelector('.ud-modal-body'),
            footer: overlay.querySelector('.ud-modal-footer'),
            footerLeft: overlay.querySelector('.ud-footer-left'),
            closeBtn: overlay.querySelector('.js-close'),
            cancelBtn: overlay.querySelector('.js-cancel'),
            confirmBtn: overlay.querySelector('.js-confirm'),
        };
    }

    _bindBaseEvents() {
        const close = () => this.hideModal();

        if (this.dom.closeBtn) this.dom.closeBtn.onclick = close;

        if (this.dom.cancelBtn)
            this.dom.cancelBtn.onclick = () => {
                if (this.onCancelCallback) this.onCancelCallback();
                close();
            };

        if (this.dom.confirmBtn)
            this.dom.confirmBtn.onclick = () => {
                if (this.onConfirmCallback) this.onConfirmCallback();
            };
    }

    onConfirm(fn) {
        this.onConfirmCallback = fn;
    }

    setConfirmEnabled(enabled) {
        this.dom.confirmBtn.disabled = !enabled;

        if (enabled) {
            this.dom.confirmBtn.classList.remove('disabled');
        } else {
            this.dom.confirmBtn.classList.add('disabled');
        }

        this.dom.confirmBtn.style.opacity = '';
        this.dom.confirmBtn.style.cursor = '';
    }

    setConfirmText(text) {
        this.dom.confirmBtn.textContent = text;
    }

    showModal() {
        if (!this.overlay) return;
        this.overlay.style.display = 'flex';
        this.overlay.offsetHeight;
        this.overlay.classList.add('show');
    }

    hideModal() {
        if (!this.overlay) return;
        this.overlay.classList.remove('show');
        setTimeout(() => {
            if (this.overlay) this.overlay.style.display = 'none';
            this.destroy();
        }, 200);
    }

    destroy() {
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }

        this.overlay = null;
        this.dom = {};
    }
}
window.BaseModal = BaseModal;
