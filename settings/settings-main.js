/**
 * @file settings/settings-main.js
 * @description 设置页面入口 (Settings Entry Point)
 * * 核心职责 (Core Responsibilities):
 * 1. 初始化流程 (Initialization Flow):
 * - 在 DOMContentLoaded 时启动 `SettingsModal`，并在 Iframe 模式下直接显示模态框。
 * - 调用 `initTheme` 同步当前主题色。
 * 2. Tooltip 系统 (Tooltip System):
 * - `initTooltipSystem`: 在设置页面独立实现轻量级 Tooltip 逻辑 (因 Settings 可能在 Iframe 中运行，无法复用 Manager 的全局实例)。
 * - 支持 `data-ud-tooltip` 声明式提示，具备边缘碰撞检测 (自动调整位置) 和延时显示功能。
 * 3. 消息通信 (Message Communication):
 * - 重写 `modal.hideModal`：在 Iframe 环境下，关闭模态框并非销毁 DOM，而是向父窗口发送 `CLOSE_SETTINGS_FRAME` 消息。
 * * 通信链路 (Communication):
 * - Output: `window.parent.postMessage` 通知父窗口关闭 Iframe。
 * * @author weiyunjun
 * @version v0.1.0
 */

document.addEventListener('DOMContentLoaded', () => {
    if (window.SettingsModal && window.SettingsModal.initTheme) {
        window.SettingsModal.initTheme();
    }

    initTooltipSystem();

    if (window.SettingsModal) {
        const modal = new window.SettingsModal();

        modal.showModal();

        modal.hideModal = () => {
            window.parent.postMessage({ type: 'CLOSE_SETTINGS_FRAME' }, '*');
        };
    }
});

function initTooltipSystem() {
    const tooltipEl = document.createElement('div');

    tooltipEl.className = 'ud-tooltip';
    document.body.appendChild(tooltipEl);
    let tooltipTimer = null;
    let currentTarget = null;
    const DEFAULT_DELAY = 300;

    const showTooltip = (target, content) => {
        if (!tooltipEl || !target) return;
        tooltipEl.textContent = content;
        tooltipEl.classList.remove('show');
        const rect = target.getBoundingClientRect();

        tooltipEl.style.visibility = 'hidden';
        tooltipEl.style.display = 'block';
        const tipWidth = tooltipEl.offsetWidth;
        const tipHeight = tooltipEl.offsetHeight;

        tooltipEl.style.visibility = '';
        tooltipEl.style.display = '';
        const gap = 8;
        const viewportWidth = window.innerWidth;
        let top = rect.top - tipHeight - gap;
        let left = rect.left + rect.width / 2 - tipWidth / 2;
        let placement = 'top';

        if (top < 0) {
            top = rect.bottom + gap;
            placement = 'bottom';
        }

        if (left < gap) left = gap;
        else if (left + tipWidth > viewportWidth - gap) left = viewportWidth - tipWidth - gap;
        tooltipEl.style.top = `${top}px`;
        tooltipEl.style.left = `${left}px`;
        if (placement === 'bottom') tooltipEl.classList.add('ud-tooltip-bottom');
        else tooltipEl.classList.remove('ud-tooltip-bottom');
        requestAnimationFrame(() => tooltipEl.classList.add('show'));
    };

    const hideTooltip = () => {
        if (tooltipTimer) {
            clearTimeout(tooltipTimer);
            tooltipTimer = null;
        }

        tooltipEl.classList.remove('show');
    };

    document.addEventListener('mouseover', (e) => {
        const target = e.target.closest('[data-ud-tooltip]');

        if (target !== currentTarget) {
            hideTooltip();
            currentTarget = target;

            if (target) {
                const content = target.dataset.udTooltip;
                const delay = target.dataset.udTooltipDelay ? parseInt(target.dataset.udTooltipDelay, 10) : DEFAULT_DELAY;

                if (content) {
                    tooltipTimer = setTimeout(() => showTooltip(target, content), delay);
                }
            }
        }
    });
    document.addEventListener('mouseout', (e) => {
        if (currentTarget && !currentTarget.contains(e.relatedTarget)) {
            hideTooltip();
            currentTarget = null;
        }
    });
    window.addEventListener('scroll', hideTooltip, true);
    window.addEventListener('click', hideTooltip);
}
