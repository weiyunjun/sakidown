/**
 * @file ui/confirm-modal.js
 * @description 二次确认模态框 (Confirmation Modal)
 * * 核心职责 (Core Responsibilities):
 * 1. Promise 封装 (Promise Wrapper):
 * - 提供静态方法 `ConfirmModal.showModal`，将异步的用户交互封装为 Promise。
 * - 简化调用方式：`const ok = await showModal(...)`。
 * 2. 样式适配 (Style Adaptation):
 * - 支持 `isDanger` 模式，自动应用破坏性操作样式 (如红色按钮)。
 * - 继承自 `BaseModal`，复用其 DOM 结构与生命周期逻辑。
 * * 通信链路 (Communication):
 * - Input: 提示标题、内容、类型 (Danger/Normal)。
 * - Output: 返回 Promise<boolean> (true=确认, false=取消)。
 * * @author weiyunjun
 * @version v0.1.0
 */

(function () {
    class ConfirmModal extends window.BaseModal {
        constructor(options = {}) {
            super({ title: options.title || '提示', width: '360px' });
            this.options = options;
            this._renderConfirmUI();
        }

        _renderConfirmUI() {
            const content = document.createElement('div');

            content.className = 'ud-confirm-content';
            content.textContent = this.options.content || '';
            this.dom.body.innerHTML = '';
            this.dom.body.appendChild(content);
            this.setConfirmText(this.options.confirmText || '确认');
            const cancelBtn = this.dom.footer.querySelector('.js-cancel');

            if (cancelBtn) cancelBtn.textContent = this.options.cancelText || '取消';
            const confirmBtn = this.dom.footer.querySelector('.js-confirm');

            if (confirmBtn) {
                confirmBtn.classList.remove('ud-btn-important', 'ud-btn-destructive');

                if (this.options.isDanger) {
                    confirmBtn.classList.add('ud-btn-destructive');

                    if (!this.options.confirmText) {
                        this.setConfirmText('删除');
                    }
                } else {
                    confirmBtn.classList.add('ud-btn-important');
                }
            }
        }

        static async showModal(options) {
            return new Promise((resolve) => {
                const modal = new ConfirmModal(options);

                modal.onConfirm(() => {
                    modal.hideModal();
                    resolve(true);
                });

                modal.onCancelCallback = () => {
                    resolve(false);
                };

                modal.showModal();
            });
        }
    }
    window.ConfirmModal = ConfirmModal;
})();
