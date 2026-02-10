/**
 * @file manager/utils.js
 * @description 全局 UI 工具库 (Global UI Utilities)
 * * 核心职责 (Core Responsibilities):
 * 1. 交互反馈 (User Feedback):
 * - `showToast`: 创建并管理轻量级提示消息，支持自动淡出和 DOM 清理。
 * - `showConfirmModal`: 封装确认对话框，优先调用自定义 `ConfirmModal` 组件，降级兼容原生 `confirm`。
 * * 通信链路 (Communication):
 * - Role: 操作 DOM 插入 Toast 或 Modal 节点。
 * * @author weiyunjun
 * @version v0.1.0
 */

export async function showConfirmModal(content, isDanger = false, confirmText = '确认') {
    if (window.ConfirmModal) {
        return window.ConfirmModal.showModal({ content: content, isDanger: isDanger, confirmText: confirmText });
    }

    return confirm(content);
}

export function showToast(message) {
    let container = document.querySelector('.ud-toast-container');

    if (!container) {
        container = document.createElement('div');
        container.className = 'ud-toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');

    toast.className = 'ud-toast';
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        });
    }, 5000);
}
