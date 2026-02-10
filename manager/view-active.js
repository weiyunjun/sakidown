/**
 * @file manager/view-active.js
 * @description 活跃任务视图控制器 (Active View Controller)
 * * 核心职责 (Core Responsibilities):
 * 1. 队列可视化 (Queue Visualization):
 * - 分离渲染 "正在下载" (Active Task) 和 "等待队列" (Waiting Queue)。
 * - 实时更新下载进度、速度和 ETA，通过 `syncDOMList` 保证高性能渲染。
 * * 2. 实时搜索 (Real-time Search):
 * - 在活跃视图中实现即时过滤，支持搜索标题或 UP 主。
 * - 处理搜索状态下的视图合并逻辑 (Active 任务与 Queue 任务的统一展示)。
 * * 3. 任务控制 (Task Control):
 * - 处理 "取消下载" 和 "移除队列" 操作。
 * - 弹出二次确认模态框 (`showConfirmModal`) 防止误操作。
 * * 通信链路 (Communication):
 * - Input: 接收 `manager.js` 轮询获取的 `downloadingTask` 和 `queue` 数据。
 * - Output: 发送 `CANCEL_TASK` 或 `REMOVE_QUEUE_ITEM` 消息至 Service Worker。
 * * @author weiyunjun
 * @version v0.1.0
 */

import { showConfirmModal, showToast } from './utils.js';
import { syncDOMList } from './dom-sync.js';
import { loadThumbnailsFromOpfs } from './image-loader.js';
import { DEFAULT_PAGE_SIZE, renderPagination } from './pagination.js';
import { setSearchKeyword } from './task-card.js';
let fullQueueList = [];
const params = new URLSearchParams(location.search);
const initTab = params.get('tab');
const initPage = parseInt(params.get('page')) || 1;
let currentQueuePage = !initTab || initTab === 'active' ? initPage : 1;
const savedPageSize = localStorage.getItem('saki_page_size');
let currentQueuePageSize = savedPageSize ? parseInt(savedPageSize) : DEFAULT_PAGE_SIZE;
let hasActiveTask = false;
let isObserverBound = false;
let currentSearchKeyword = '';
let isSearchBound = false;
let activeTaskMatchCount = 0;

export function resetQueuePage() {
    currentQueuePage = 1;
}

export function renderDownloading(task, queue) {
    const container = document.getElementById('active-task-container');
    const queueContainer = document.getElementById('queue-list-container');
    const viewSection = document.getElementById('view-downloading');

    if (!isObserverBound && viewSection) {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (viewSection.classList.contains('active')) {
                        _updateQueueView();
                    }
                }
            }
        });

        observer.observe(viewSection, { attributes: true });
        isObserverBound = true;
    }

    if (!isSearchBound) {
        const searchInput = document.getElementById('header-search-input');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                currentSearchKeyword = e.target.value.trim().toLowerCase();
                setSearchKeyword(currentSearchKeyword);
                currentQueuePage = 1;
                _updateQueueView();
            });
            isSearchBound = true;
        }
    }

    const searchInput = document.getElementById('header-search-input');

    if (searchInput) {
        const val = searchInput.value.trim().toLowerCase();

        if (val !== currentSearchKeyword) {
            currentSearchKeyword = val;
            currentQueuePage = 1;
        }
    }

    setSearchKeyword(currentSearchKeyword);
    let displayTask = task;
    let displayQueue = queue || [];

    if (displayTask && displayTask.metadata && currentSearchKeyword) {
        const meta = displayTask.metadata;
        const match = (val) => val && val.toString().toLowerCase().includes(currentSearchKeyword);

        if (!match(meta.title) && !match(meta.author_name)) {
            displayTask = null;
        }
    }

    activeTaskMatchCount = displayTask ? 1 : 0;

    if (!displayTask || !displayTask.metadata || !displayTask.metadata.title) {
        hasActiveTask = false;
        const hasQueueItems = displayQueue && displayQueue.length > 0;

        if (!currentSearchKeyword) {
            if (!hasQueueItems) {
                if (!container.querySelector('.ud-empty-state')) {
                    container.innerHTML = '<div class="ud-empty-state">当前没有正在下载的任务</div>';
                    container.onclick = null;
                }
            } else {
                container.innerHTML = '';
            }
        } else {
            container.innerHTML = '';
        }
    } else {
        hasActiveTask = true;
        syncDOMList(container, [displayTask], 'downloading');
        loadThumbnailsFromOpfs(container);
        if (!container.onclick) container.onclick = _handleActiveClick;
    }

    fullQueueList = displayQueue;
    _updateQueueView();
    if (!queueContainer.onclick) queueContainer.onclick = _handleActiveClick;
}

function _updateQueueView() {
    const queueContainer = document.getElementById('queue-list-container');
    const viewSection = document.getElementById('view-downloading');
    const statsBar = document.getElementById('search-stats-bar');
    const startTime = performance.now();
    const filtered = fullQueueList.filter((item) => {
        if (!currentSearchKeyword) return true;
        const meta = item.metadata || {};
        const match = (val) => val && val.toString().toLowerCase().includes(currentSearchKeyword);

        return match(meta.title) || match(meta.author_name);
    });
    const duration = performance.now() - startTime;

    if (statsBar && viewSection && viewSection.classList.contains('active')) {
        if (currentSearchKeyword) {
            const totalMatch = filtered.length + activeTaskMatchCount;

            statsBar.textContent = `搜索到 ${totalMatch} 个结果，用时 ${duration.toFixed(1)}ms`;
            statsBar.classList.add('show');
        } else {
            statsBar.classList.remove('show');
        }
    }

    const totalItems = filtered.length;
    const maxPage = Math.ceil(totalItems / currentQueuePageSize) || 1;
    let pageChanged = false;

    if (currentQueuePage > maxPage) {
        currentQueuePage = maxPage;
        pageChanged = true;
    }

    if (viewSection && viewSection.classList.contains('active') && !currentSearchKeyword) {
        const urlParams = new URLSearchParams(location.search);
        const urlPage = parseInt(urlParams.get('page')) || 1;

        if (urlPage !== currentQueuePage || pageChanged) {
            const newUrl = new URL(location.href);

            newUrl.searchParams.set('page', currentQueuePage);
            history.replaceState(null, '', newUrl.toString());
        }
    }

    const startIndex = (currentQueuePage - 1) * currentQueuePageSize;
    const endIndex = startIndex + currentQueuePageSize;
    const displayList = filtered.slice(startIndex, endIndex);

    syncDOMList(queueContainer, displayList, 'waiting');
    loadThumbnailsFromOpfs(queueContainer);

    if (window.updateHeaderCheckboxState) {
        window.updateHeaderCheckboxState();
    }

    if (viewSection && viewSection.classList.contains('active')) {
        renderPagination(
            queueContainer,
            totalItems,
            currentQueuePage,
            currentQueuePageSize,
            (newPage) => {
                currentQueuePage = newPage;
                _updateQueueView();
            },
            (newSize) => {
                currentQueuePageSize = newSize;
                localStorage.setItem('saki_page_size', newSize);
                currentQueuePage = 1;
                _updateQueueView();
            },
        );
    }
}

async function _handleActiveClick(e) {
    const btn = e.target.closest('.ud-icon-btn');

    if (!btn) return;

    if (btn.classList.contains('js-cancel')) {
        const card = btn.closest('.ud-task-card');

        if (!card) return;
        const currentPhase = card.dataset.phase || 'pending';
        const uid = btn.dataset.uid;
        const isQueueItem = card.parentElement.id === 'queue-list-container' || currentPhase === 'pending';
        const msg = isQueueItem ? '确定要从队列中移除该任务吗？' : '确定要取消当前正在下载的任务吗？';
        const ok = await showConfirmModal(msg, true, '确定');

        if (ok) {
            if (isQueueItem) {
                if (card) card.remove();
                chrome.runtime.sendMessage({ type: 'REMOVE_QUEUE_ITEM', payload: uid }, () => {
                    window.dispatchEvent(new Event('manager:refresh'));
                });
            } else {
                chrome.runtime.sendMessage({ type: 'CANCEL_TASK' }, () => {
                    window.dispatchEvent(new Event('manager:refresh'));
                });
                btn.style.opacity = '0.5';
                btn.style.pointerEvents = 'none';
            }
        }
    }
}
