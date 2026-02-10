/**
 * @file manager/manager.js
 * @description 任务管理面板核心控制器 (Manager Core Controller)
 * * 核心职责 (Core Responsibilities):
 * 1. 初始化与生命周期管理 (Init & Lifecycle):
 * - 负责加载主题 (`applyTheme`)、初始化侧边栏、Tab 路由状态 (`initURLState`)。
 * - 启动全局事件循环 (`startEventLoop`)，以 200ms 间隔轮询后台数据。
 * * 2. 数据轮询与分发 (Data Polling & Dispatch):
 * - 向 Service Worker 发送 `GET_MANAGER_DATA` 获取全量状态。
 * - 实现 "脏检查" (Dirty Check) 机制：通过对比 JSON 序列化指纹 (`cache.history`)，仅在数据变化时调用 `renderHistory`/`renderIncomplete`，减少 DOM 操作。
 * - 始终实时更新 `renderDownloading` 以保证进度条流畅。
 * * 3. 批量管理 (Batch Management):
 * - 管理批量模式状态 (`resetBatchMode`), 处理全选/反选/半选逻辑 (`updateHeaderCheckboxState`)。
 * - 动态渲染批量操作栏，并分发批量删除、取消、重试指令。
 * * 4. 全局交互委托 (Global Interaction):
 * - 统一处理 Tooltip 显示、回到顶部按钮显隐、Confirm Modal 逻辑。
 * * 通信链路 (Communication):
 * - Input: 轮询 `GET_MANAGER_DATA`；监听 `OPEN_SETTINGS` 消息。
 * - Output: 发送 `CANCEL_TASK`, `BATCH_*` 系列指令至 Background。
 * * @author weiyunjun
 * @version v0.1.0
 */

import { renderDownloading, resetQueuePage } from './view-active.js';
import { renderHistory, renderIncomplete, resetHistoryPage, resetIncompletePage } from './view-history.js';
import { showConfirmModal } from './utils.js';
import { showToast } from './utils.js';
const cache = { history: '', incomplete: '' };
let isRefreshPending = false;

function applyTheme(theme, customThemes = []) {
    document.body.className = document.body.className
        .split(' ')
        .filter((c) => !c.startsWith('theme-'))
        .join(' ');
    if (document.body.classList.contains('preload')) document.body.classList.add('preload');
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

document.addEventListener('DOMContentLoaded', () => {
    const cachedTheme = localStorage.getItem('user_theme');

    if (cachedTheme) applyTheme(cachedTheme);
    const isSidebarCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
    const sidebar = document.getElementById('app-sidebar');

    if (sidebar && isSidebarCollapsed) {
        sidebar.classList.add('collapsed');
    }

    requestAnimationFrame(() => {
        document.body.classList.remove('preload');
    });
    chrome.storage.local.get(['user_theme', 'custom_themes_list'], (res) => {
        const remoteTheme = res.user_theme || 'default';
        const customList = res.custom_themes_list || [];

        localStorage.setItem('user_theme', remoteTheme);
        applyTheme(remoteTheme, customList);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            if (changes['user_theme'] || changes['custom_themes_list']) {
                chrome.storage.local.get(['user_theme', 'custom_themes_list'], (res) => {
                    const newTheme = res.user_theme || 'default';
                    const customList = res.custom_themes_list || [];

                    localStorage.setItem('user_theme', newTheme);
                    applyTheme(newTheme, customList);
                });
            }

            if (changes['saki_queue']) {
                isRefreshPending = true;
            }
        }
    });
    injectIcons();
    initSidebar();
    initURLState();
    initTabs();
    initGlobalEvents();
    initBatchManager();
    startEventLoop();
});
window.addEventListener('manager:reset-batch', () => {
    resetBatchMode();
});
window.addEventListener('manager:update-selection', () => {
    updateHeaderCheckboxState();
});

function resetBatchMode() {
    const btn = document.getElementById('btn-batch-manage');
    const panel = document.querySelector('.ud-right-panel');
    const headerCheckbox = document.getElementById('header-batch-checkbox');

    if (btn) btn.classList.remove('active');
    if (panel) panel.classList.remove('batch-mode');
    const allCheckboxes = document.querySelectorAll('.ud-task-checkbox');

    allCheckboxes.forEach((cb) => (cb.checked = false));

    if (headerCheckbox) {
        headerCheckbox.checked = false;
        headerCheckbox.indeterminate = false;
    }
}

function initBatchManager() {
    const btn = document.getElementById('btn-batch-manage');
    const panel = document.querySelector('.ud-right-panel');
    const headerCheckbox = document.getElementById('header-batch-checkbox');
    const actionContainer = document.getElementById('header-batch-actions');

    if (btn && panel) {
        btn.addEventListener('click', () => {
            const isActive = btn.classList.toggle('active');

            if (isActive) {
                panel.classList.add('batch-mode');
                const activeSection = document.querySelector('.ud-view-section.active');

                if (activeSection) {
                    renderBatchActionButtons(activeSection.id);
                    updateHeaderCheckboxState();
                }
            } else {
                resetBatchMode();
            }
        });

        if (headerCheckbox) {
            headerCheckbox.addEventListener('change', (e) => {
                const targetState = e.target.checked;

                headerCheckbox.indeterminate = false;
                const visibleCheckboxes = document.querySelectorAll('.ud-view-section.active .ud-task-checkbox');

                visibleCheckboxes.forEach((cb) => {
                    cb.checked = targetState;
                });
            });
        }

        if (actionContainer) {
            actionContainer.addEventListener('click', async (e) => {
                const target = e.target.closest('.ud-icon-btn');

                if (!target) return;
                const actionId = target.id;
                const uids = getSelectedUids();

                if (uids.length === 0) {
                    showToast('请先选择任务');

                    return;
                }

                if (actionId === 'batch-btn-cancel') {
                    const ok = await showConfirmModal(
                        `确定要取消选中的 ${uids.length} 个任务吗？（取消后任务会移动到未完成中）`,
                        true,
                        '确定',
                    );

                    if (ok) {
                        chrome.runtime.sendMessage({ type: 'BATCH_CANCEL_QUEUE', payload: uids }, handleBatchResponse);
                        showToast(`已取消 ${uids.length} 个任务`);
                    }
                } else if (actionId === 'batch-btn-delete-history') {
                    const ok = await showConfirmModal(
                        `确定要删除选中的 ${uids.length} 条任务吗？（不会删除本地文件）`,
                        true,
                        '确定',
                    );

                    if (ok) {
                        chrome.runtime.sendMessage({ type: 'BATCH_DELETE_HISTORY', payload: uids }, handleBatchResponse);
                        showToast(`已删除 ${uids.length} 条任务`);
                    }
                } else if (actionId === 'batch-btn-delete-incomplete') {
                    const ok = await showConfirmModal(`确定要删除选中的 ${uids.length} 个任务吗？`, true, '确定');

                    if (ok) {
                        chrome.runtime.sendMessage({ type: 'BATCH_DELETE_HISTORY', payload: uids }, handleBatchResponse);
                        showToast(`已删除 ${uids.length} 个任务`);
                    }
                } else if (actionId === 'batch-btn-retry') {
                    chrome.runtime.sendMessage({ type: 'BATCH_RETRY_TASKS', payload: uids }, handleBatchResponse);
                    showToast(`已重试${uids.length}个任务`);
                }
            });
        }
    }
}

function getSelectedUids() {
    const checkboxes = document.querySelectorAll('.ud-view-section.active .ud-task-checkbox:checked');

    return Array.from(checkboxes).map((cb) => cb.dataset.uid);
}

function handleBatchResponse() {
    window.dispatchEvent(new Event('manager:refresh'));
    const headerCheckbox = document.getElementById('header-batch-checkbox');

    if (headerCheckbox) {
        headerCheckbox.checked = false;
        headerCheckbox.indeterminate = false;
    }

    document.querySelectorAll('.ud-task-checkbox').forEach((cb) => (cb.checked = false));
}

function initTooltips() {
    let activeTooltip = null;

    const showTooltip = (target, text) => {
        if (activeTooltip) activeTooltip.remove();
        const tooltip = document.createElement('div');

        tooltip.className = 'ud-tooltip show';
        tooltip.textContent = text;
        document.body.appendChild(tooltip);
        const rect = target.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        let top = rect.top - tooltipRect.height - 8;
        let left = rect.left + (rect.width - tooltipRect.width) / 2;

        if (top < 0) {
            top = rect.bottom + 8;
            tooltip.classList.add('ud-tooltip-bottom');
        }

        if (left < 0) left = 8;

        if (left + tooltipRect.width > window.innerWidth) {
            left = window.innerWidth - tooltipRect.width - 8;
        }

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
        activeTooltip = tooltip;
    };

    const hideTooltip = () => {
        if (activeTooltip) {
            activeTooltip.remove();
            activeTooltip = null;
        }
    };

    document.addEventListener('mouseover', (e) => {
        const target = e.target.closest('[data-ud-tooltip]');

        if (target) {
            const text = target.dataset.udTooltip;

            if (text) showTooltip(target, text);
        }
    });
    document.addEventListener('mouseout', (e) => {
        const target = e.target.closest('[data-ud-tooltip]');

        if (target) {
            hideTooltip();
        }
    });
    document.addEventListener('scroll', hideTooltip, true);
    document.addEventListener('click', hideTooltip);
}

function renderBatchActionButtons(viewId) {
    const container = document.getElementById('header-batch-actions');

    if (!container) return;
    const Icons = window.Icons || {};
    const cancelIcon = Icons.cancel;
    const trashIcon = Icons.trash || '<span>🗑️</span>';
    const refreshIcon = Icons.refresh || '<span>🔄</span>';
    let html = '';

    if (viewId === 'view-downloading') {
        html = `<div class="ud-icon-btn" id="batch-btn-cancel" data-ud-tooltip="批量取消">${cancelIcon}</div>`;
    } else if (viewId === 'view-completed') {
        html = `<div class="ud-icon-btn" id="batch-btn-delete-history" data-ud-tooltip="批量删除">${trashIcon}</div>`;
    } else if (viewId === 'view-incomplete') {
        html = `\n            <div class="ud-icon-btn" id="batch-btn-retry" data-ud-tooltip="批量重试">${refreshIcon}</div>\n            <div class="ud-icon-btn" id="batch-btn-delete-incomplete" data-ud-tooltip="批量删除">${trashIcon}</div>\n        `;
    }

    container.innerHTML = html;
}

function injectIcons() {
    if (!window.Icons) return;
    const toggleBtn = document.getElementById('btn-toggle-sidebar');

    if (toggleBtn) toggleBtn.innerHTML = window.Icons.sidebar_toggle;
    const headerIcon = document.getElementById('sidebar-header-icon');

    if (headerIcon) headerIcon.innerHTML = window.Icons.manager;
    const searchIconSlot = document.getElementById('header-search-icon-slot');

    if (searchIconSlot) searchIconSlot.innerHTML = window.Icons.search;
    const clearBtn = document.getElementById('header-search-clear');

    if (clearBtn && window.Icons.close) {
        clearBtn.innerHTML = window.Icons.close;
    }

    document.querySelectorAll('[data-icon]').forEach((el) => {
        const iconKey = el.dataset.icon;

        if (window.Icons[iconKey]) {
            el.innerHTML = window.Icons[iconKey];
        }
    });
}

function initSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const toggleBtn = document.getElementById('btn-toggle-sidebar');
    const STORAGE_KEY = 'sidebar_collapsed';

    if (sidebar && toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            localStorage.setItem(STORAGE_KEY, sidebar.classList.contains('collapsed'));
        });
    }
}

function initURLState() {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab') || 'active';
    const tabMap = { active: 'view-downloading', completed: 'view-completed', incomplete: 'view-incomplete' };
    const targetId = tabMap[tab] || 'view-downloading';
    const navItems = document.querySelectorAll('.ud-nav-btn');
    const sections = document.querySelectorAll('.ud-view-section');

    navItems.forEach((btn) => {
        if (btn.dataset.target === targetId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    sections.forEach((sec) => {
        if (sec.id === targetId) {
            sec.classList.add('active');
        } else {
            sec.classList.remove('active');
        }
    });
}

function initTabs() {
    const navItems = document.querySelectorAll('.ud-nav-btn');
    const sections = document.querySelectorAll('.ud-view-section');
    const searchInput = document.getElementById('header-search-input');
    const searchWrapper = document.getElementById('header-search-container');
    const statsBar = document.getElementById('search-stats-bar');
    const idMap = { 'view-downloading': 'active', 'view-completed': 'completed', 'view-incomplete': 'incomplete' };

    navItems.forEach((btn) => {
        btn.addEventListener('click', () => {
            if (btn.classList.contains('active')) return;

            if (searchInput && searchInput.value) {
                searchInput.value = '';
                searchInput.dispatchEvent(new Event('input'));
            }

            if (searchWrapper) searchWrapper.classList.remove('has-value');
            if (statsBar) statsBar.classList.remove('show');
            navItems.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            const targetId = btn.dataset.target;

            sections.forEach((sec) => {
                sec.classList.remove('active');
                if (sec.id === targetId) sec.classList.add('active');
            });
            resetBatchMode();
            const tabName = idMap[targetId] || 'active';
            const newUrl = new URL(location.href);

            newUrl.searchParams.set('tab', tabName);
            newUrl.searchParams.set('page', '1');
            history.pushState(null, '', newUrl.toString());
            if (tabName === 'active') resetQueuePage();
            if (tabName === 'completed') resetHistoryPage();
            if (tabName === 'incomplete') resetIncompletePage();
        });
    });
}

function updateHeaderCheckboxState() {
    const headerCheckbox = document.getElementById('header-batch-checkbox');

    if (!headerCheckbox) return;
    const all = document.querySelectorAll('.ud-view-section.active .ud-task-checkbox');
    const checked = document.querySelectorAll('.ud-view-section.active .ud-task-checkbox:checked');

    if (all.length === 0) {
        headerCheckbox.checked = false;
        headerCheckbox.indeterminate = false;

        return;
    }

    if (checked.length === 0) {
        headerCheckbox.checked = false;
        headerCheckbox.indeterminate = false;
    } else if (checked.length === all.length) {
        headerCheckbox.checked = true;
        headerCheckbox.indeterminate = false;
    } else {
        headerCheckbox.checked = false;
        headerCheckbox.indeterminate = true;
    }
}

function initGlobalEvents() {
    const searchInput = document.getElementById('header-search-input');
    const searchWrapper = document.getElementById('header-search-container');
    const clearBtn = document.getElementById('header-search-clear');
    const statsBar = document.getElementById('search-stats-bar');

    if (searchInput && searchWrapper) {
        const checkValue = () => {
            if (searchInput.value.trim().length > 0) {
                searchWrapper.classList.add('has-value');
            } else {
                searchWrapper.classList.remove('has-value');
            }
        };

        searchInput.addEventListener('input', checkValue);
        searchInput.addEventListener('focus', checkValue);
        searchInput.addEventListener('blur', () => {
            setTimeout(() => {
                if (document.activeElement !== searchInput) {
                }
            }, 100);
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                searchInput.value = '';
                searchWrapper.classList.remove('has-value');
                if (statsBar) statsBar.classList.remove('show');
                searchInput.focus();
                searchInput.dispatchEvent(new Event('input'));
            });
        }
    }

    const settingsBtn = document.getElementById('nav-btn-settings');

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            if (window.SettingsModal) {
                new window.SettingsModal().showModal();
            } else {
                console.error('SettingsModal not loaded');
            }
        });
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'OPEN_SETTINGS') {
            if (window.SettingsModal) {
                const existing = document.querySelector('.ud-settings-container');

                if (!existing) {
                    new window.SettingsModal().showModal();
                }
            }
        }
    });
    initTooltips();
    const backToTopBtn = document.getElementById('back-to-top');
    const scrollContainer = document.getElementById('main-content-scroll');
    const rightCol = document.querySelector('.ud-col-side.right');

    if (backToTopBtn && scrollContainer) {
        if (rightCol) {
            const resizeObserver = new ResizeObserver((entries) => {
                for (let entry of entries) {
                    if (entry.contentRect.width < 100) {
                        backToTopBtn.style.display = 'none';
                    } else {
                        backToTopBtn.style.display = '';
                    }
                }
            });

            resizeObserver.observe(rightCol);
        }

        backToTopBtn.addEventListener('click', () => {
            scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
        });
        scrollContainer.addEventListener('scroll', () => {
            const threshold = scrollContainer.clientHeight * 0.5;

            if (backToTopBtn.style.display !== 'none') {
                if (scrollContainer.scrollTop > threshold) {
                    backToTopBtn.classList.add('visible');
                } else {
                    backToTopBtn.classList.remove('visible');
                }
            }
        });
    }

    const cancelBtn = document.getElementById('cur-btn-cancel');

    if (cancelBtn) {
        cancelBtn.addEventListener('click', async () => {
            const ok = await showConfirmModal('确定要取消任务吗？（取消后任务会移动到未完成中）');

            if (ok) {
                chrome.runtime.sendMessage({ type: 'CANCEL_TASK' });
                cancelBtn.disabled = true;
                cancelBtn.style.opacity = '0.5';
                setTimeout(() => {
                    cancelBtn.disabled = false;
                    cancelBtn.style.opacity = '1';
                }, 2000);
            }
        });
    }

    const modal = document.getElementById('confirm-modal');

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                const btnCancel = document.getElementById('confirm-btn-cancel');

                if (btnCancel) btnCancel.click();
            }
        });
    }

    document.addEventListener('click', (e) => {
        const panel = document.querySelector('.ud-right-panel');
        const isBatchMode = panel && panel.classList.contains('batch-mode');

        if (e.target.classList.contains('ud-task-checkbox')) {
            e.stopPropagation();
            updateHeaderCheckboxState();

            return;
        }

        if (isBatchMode) {
            const card = e.target.closest('.ud-task-card');

            if (card) {
                e.preventDefault();
                e.stopPropagation();
                const checkbox = card.querySelector('.ud-task-checkbox');

                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    updateHeaderCheckboxState();
                }

                return;
            }
        }
    });
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('ud-task-checkbox')) {
            updateHeaderCheckboxState();
        }
    });
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('ud-task-checkbox')) {
            updateHeaderCheckboxState();
        }
    });
    document.addEventListener(
        'load',
        (e) => {
            if (e.target.tagName === 'IMG' && e.target.closest('.ud-card-thumb')) {
                e.target.style.opacity = '1';
            }
        },
        true,
    );
    document.addEventListener(
        'error',
        (e) => {
            if (e.target.tagName === 'IMG' && e.target.closest('.ud-card-thumb')) {
                e.target.style.display = 'none';
                const parent = e.target.parentElement;

                if (parent) parent.classList.add('no-img');
            }
        },
        true,
    );
    window.addEventListener('manager:refresh', () => {
        fetchData();
    });
}

function startEventLoop() {
    fetchData();
    setInterval(fetchData, 200);
}

function fetchData() {
    chrome.runtime.sendMessage({ type: 'GET_MANAGER_DATA' }, (response) => {
        if (chrome.runtime.lastError) return;
        if (!response) return;

        if (typeof renderDownloading === 'function') {
            renderDownloading(response.currentTask, response.queue);
        }

        const queueCount =
      (response.currentTask && response.currentTask.metadata && response.currentTask.metadata.title ? 1 : 0) +
      (response.queue ? response.queue.length : 0);

        updateNavBadge('nav-btn-queue', queueCount);
        const historyList = response.history || [];
        const completedList = historyList.filter((h) => h.status && h.status.phase === 'done');
        const incompleteList = historyList.filter((h) => h.status && h.status.phase !== 'done').reverse();
        const completedJson = JSON.stringify(completedList);
        const incompleteJson = JSON.stringify(incompleteList);

        if (isRefreshPending || completedJson !== cache.history) {
            if (typeof renderHistory === 'function') {
                renderHistory(completedList);
            }

            cache.history = completedJson;
        }

        if (isRefreshPending || incompleteJson !== cache.incomplete) {
            if (typeof renderIncomplete === 'function') {
                renderIncomplete(incompleteList);
            }

            cache.incomplete = incompleteJson;
        }

        updateNavBadge('nav-btn-history', completedList.length);
        updateNavBadge('nav-btn-incomplete', incompleteList.length);
        isRefreshPending = false;
    });
}

function updateNavBadge(btnId, count) {
    const btn = document.getElementById(btnId);

    if (!btn) return;
    const badge = btn.querySelector('.ud-nav-badge');

    if (badge) {
        const text = count > 9999 ? '9999+' : count.toString();

        if (badge.textContent !== text) badge.textContent = text;
    }
}
