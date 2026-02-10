/**
 * @file manager/view-history.js
 * @description 历史记录视图控制器 (History View Controller)
 * * 核心职责 (Core Responsibilities):
 * 1. 列表渲染与分页 (List Rendering & Pagination):
 * - 管理 "已完成" (Completed) 和 "未完成" (Incomplete) 两个视图的渲染逻辑。
 * - 集成 `renderPagination` 组件，支持自定义每页条数并持久化至 `localStorage`。
 * - 实现基于 `MutationObserver` 的 Tab 切换监听，确保视图激活时自动刷新数据。
 * * 2. 交互与文件操作 (Interaction & File System):
 * - 实现文件打开逻辑：优先检查 `chrome.downloads` 中文件的存在性 (Exists Check)，按优先级 (视频 > 音频 > 封面) 尝试打开。
 * - 提供任务管理功能：支持删除任务 (逻辑删除) 和失败任务重试 (Retry)。
 * * 3. 搜索与过滤 (Search & Filtering):
 * - 监听全局搜索输入框，实时过滤本地列表数据。
 * - 通过 `setSearchKeyword` 同步搜索关键字至 `task-card` 组件以实现高亮。
 * - 动态计算搜索结果统计信息 (Count & Duration)。
 * * 通信链路 (Communication):
 * - Input: 接收 `manager.js` 传入的全量任务列表 (`fullHistoryList`/`fullIncompleteList`)。
 * - Output: 调用 `chrome.downloads.open/show` 操作文件；发送 `REMOVE_HISTORY_ITEM` / `RETRY_TASK` 消息给 Background。
 * * @author weiyunjun
 * @version v0.1.0
 */

import { showToast, showConfirmModal } from './utils.js';
import { syncDOMList } from './dom-sync.js';
import { loadThumbnailsFromOpfs, removeThumbnail } from './image-loader.js';
import { DEFAULT_PAGE_SIZE, renderPagination } from './pagination.js';
import { setSearchKeyword } from './task-card.js';
let fullHistoryList = [];
let fullIncompleteList = [];
const params = new URLSearchParams(location.search);
const initTab = params.get('tab');
const initPage = parseInt(params.get('page')) || 1;
let currentHistoryPage = initTab === 'completed' ? initPage : 1;
const savedPageSize = localStorage.getItem('saki_page_size');
let currentHistoryPageSize = savedPageSize ? parseInt(savedPageSize) : DEFAULT_PAGE_SIZE;
let savedHistoryPage = currentHistoryPage;
let currentIncompletePage = initTab === 'incomplete' ? initPage : 1;
let currentIncompletePageSize = savedPageSize ? parseInt(savedPageSize) : DEFAULT_PAGE_SIZE;
let isSearchBound = false;
let currentSearchKeyword = '';
let isObserversBound = false;

export function resetHistoryPage() {
    currentHistoryPage = 1;
    savedHistoryPage = 1;
}

export function resetIncompletePage() {
    currentIncompletePage = 1;
}

export function renderHistory(list) {
    fullHistoryList = list || [];
    const container = document.getElementById('history-list');

    if (!isObserversBound) {
        _initTabObservers();
        isObserversBound = true;
    }

    _ensureSearchBound();

    if (!isSearchBound) {
        const searchInput = document.getElementById('header-search-input');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const val = e.target.value.trim().toLowerCase();

                if (val && !currentSearchKeyword) {
                    savedHistoryPage = currentHistoryPage;
                } else if (!val && currentSearchKeyword) {
                    currentHistoryPage = savedHistoryPage;
                }

                currentSearchKeyword = val;
                setSearchKeyword(currentSearchKeyword);

                if (currentSearchKeyword) {
                    currentHistoryPage = 1;
                }

                _updateHistoryView();
            });
            isSearchBound = true;
        }
    }

    const searchInput = document.getElementById('header-search-input');

    if (searchInput) {
        const val = searchInput.value.trim().toLowerCase();

        if (val !== currentSearchKeyword) {
            if (!val && currentSearchKeyword) {
                currentHistoryPage = savedHistoryPage;
            }

            currentSearchKeyword = val;
            if (currentSearchKeyword) currentHistoryPage = 1;
        }
    }

    setSearchKeyword(currentSearchKeyword);
    _updateHistoryView();

    if (!container._hasBoundEvents) {
        _bindHistoryEvents(container, 'done');
        container._hasBoundEvents = true;
    }
}

function _ensureSearchBound() {
    if (isSearchBound) return;
    const searchInput = document.getElementById('header-search-input');

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const val = e.target.value.trim().toLowerCase();

            if (val && !currentSearchKeyword) {
                savedHistoryPage = currentHistoryPage;
            } else if (!val && currentSearchKeyword) {
                currentHistoryPage = savedHistoryPage;
            }

            currentSearchKeyword = val;
            setSearchKeyword(currentSearchKeyword);
            const activeSection = document.querySelector('.ud-view-section.active');

            if (activeSection) {
                if (activeSection.id === 'view-completed') {
                    if (currentSearchKeyword) currentHistoryPage = 1;
                    _updateHistoryView();
                } else if (activeSection.id === 'view-incomplete') {
                    if (currentSearchKeyword) currentIncompletePage = 1;
                    _updateIncompleteView();
                }
            }
        });
        isSearchBound = true;
    }
}

function _initTabObservers() {
    const sections = [
        { id: 'view-completed', updateFn: _updateHistoryView },
        { id: 'view-incomplete', updateFn: _updateIncompleteView },
    ];

    sections.forEach(({ id: id, updateFn: updateFn }) => {
        const el = document.getElementById(id);

        if (el) {
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        if (el.classList.contains('active')) {
                            updateFn();
                        }
                    }
                }
            });

            observer.observe(el, { attributes: true });
        }
    });
}

function _updateHistoryView() {
    const container = document.getElementById('history-list');
    const empty = document.getElementById('history-empty');
    const viewSection = document.getElementById('view-completed');
    const statsBar = document.getElementById('search-stats-bar');
    const startTime = performance.now();
    const filtered = fullHistoryList.filter((item) => {
        if (!currentSearchKeyword) return true;
        const meta = item.metadata || {};
        const match = (val) => val && val.toString().toLowerCase().includes(currentSearchKeyword);

        return (
            match(meta.title) ||
      match(meta.season_title) ||
      match(meta.section_title) ||
      match(meta.episode_title) ||
      match(meta.author_name)
        );
    });
    const duration = performance.now() - startTime;

    if (statsBar && viewSection && viewSection.classList.contains('active')) {
        if (currentSearchKeyword) {
            statsBar.textContent = `搜索到 ${filtered.length} 个结果，用时 ${duration.toFixed(1)}ms`;
            statsBar.classList.add('show');
        } else {
            statsBar.classList.remove('show');
        }
    }

    const totalItems = filtered.length;
    const maxPage = Math.ceil(totalItems / currentHistoryPageSize) || 1;
    let pageChanged = false;

    if (currentHistoryPage > maxPage) {
        currentHistoryPage = maxPage;
        if (!currentSearchKeyword) savedHistoryPage = maxPage;
        pageChanged = true;
    }

    if (viewSection && viewSection.classList.contains('active') && !currentSearchKeyword) {
        const urlParams = new URLSearchParams(location.search);
        const urlPage = parseInt(urlParams.get('page')) || 1;

        if (urlPage !== currentHistoryPage || pageChanged) {
            const newUrl = new URL(location.href);

            newUrl.searchParams.set('page', currentHistoryPage);
            history.replaceState(null, '', newUrl.toString());
        }
    }

    const startIndex = (currentHistoryPage - 1) * currentHistoryPageSize;
    const endIndex = startIndex + currentHistoryPageSize;
    const displayList = filtered.slice(startIndex, endIndex);
    const targetEmpty = currentSearchKeyword ? null : empty;

    syncDOMList(container, displayList, 'completed', targetEmpty);
    loadThumbnailsFromOpfs(container);
    window.dispatchEvent(new Event('manager:update-selection'));

    if (viewSection && viewSection.classList.contains('active')) {
        renderPagination(
            container,
            totalItems,
            currentHistoryPage,
            currentHistoryPageSize,
            (newPage) => {
                currentHistoryPage = newPage;

                if (!currentSearchKeyword) {
                    savedHistoryPage = newPage;
                }

                _updateHistoryView();
            },
            (newSize) => {
                currentHistoryPageSize = newSize;
                localStorage.setItem('saki_page_size', newSize);
                currentHistoryPage = 1;
                savedHistoryPage = 1;
                _updateHistoryView();
            },
        );
    }
}

export function renderIncomplete(list) {
    fullIncompleteList = list || [];
    const container = document.getElementById('incomplete-list');

    if (!isObserversBound) {
        _initTabObservers();
        isObserversBound = true;
    }

    _ensureSearchBound();
    const searchInput = document.getElementById('header-search-input');

    if (searchInput) {
        const val = searchInput.value.trim().toLowerCase();

        if (val !== currentSearchKeyword) {
            currentSearchKeyword = val;
            if (currentSearchKeyword) currentIncompletePage = 1;
        }
    }

    setSearchKeyword(currentSearchKeyword);
    _updateIncompleteView();

    if (!container._hasBoundEvents) {
        _bindHistoryEvents(container, 'incomplete');
        container._hasBoundEvents = true;
    }
}

function _updateIncompleteView() {
    const container = document.getElementById('incomplete-list');
    const empty = document.getElementById('incomplete-empty');
    const viewSection = document.getElementById('view-incomplete');
    const statsBar = document.getElementById('search-stats-bar');
    const startTime = performance.now();
    const filtered = fullIncompleteList.filter((item) => {
        if (!currentSearchKeyword) return true;
        const meta = item.metadata || {};
        const match = (val) => val && val.toString().toLowerCase().includes(currentSearchKeyword);

        return match(meta.title) || match(meta.author_name);
    });
    const duration = performance.now() - startTime;

    if (statsBar && viewSection && viewSection.classList.contains('active')) {
        if (currentSearchKeyword) {
            statsBar.textContent = `搜索到 ${filtered.length} 个结果，用时 ${duration.toFixed(1)}ms`;
            statsBar.classList.add('show');
        } else {
            statsBar.classList.remove('show');
        }
    }

    const totalItems = filtered.length;
    const maxPage = Math.ceil(totalItems / currentIncompletePageSize) || 1;
    let pageChanged = false;

    if (currentIncompletePage > maxPage) {
        currentIncompletePage = maxPage;
        pageChanged = true;
    }

    if (viewSection && viewSection.classList.contains('active') && !currentSearchKeyword) {
        const urlParams = new URLSearchParams(location.search);
        const urlPage = parseInt(urlParams.get('page')) || 1;

        if (urlPage !== currentIncompletePage || pageChanged) {
            const newUrl = new URL(location.href);

            newUrl.searchParams.set('page', currentIncompletePage);
            history.replaceState(null, '', newUrl.toString());
        }
    }

    const startIndex = (currentIncompletePage - 1) * currentIncompletePageSize;
    const endIndex = startIndex + currentIncompletePageSize;
    const displayList = filtered.slice(startIndex, endIndex);
    const targetEmpty = currentSearchKeyword ? null : empty;

    syncDOMList(container, displayList, 'incomplete', targetEmpty);
    loadThumbnailsFromOpfs(container);
    window.dispatchEvent(new Event('manager:update-selection'));

    if (viewSection && viewSection.classList.contains('active')) {
        renderPagination(
            container,
            totalItems,
            currentIncompletePage,
            currentIncompletePageSize,
            (newPage) => {
                currentIncompletePage = newPage;
                _updateIncompleteView();
            },
            (newSize) => {
                currentIncompletePageSize = newSize;
                localStorage.setItem('saki_page_size', newSize);
                currentIncompletePage = 1;
                _updateIncompleteView();
            },
        );
    }
}

function _bindHistoryEvents(container, type) {
    container.onclick = async (e) => {
        const titleTarget = e.target.closest('.js-open-file');
        const folderTarget = e.target.closest('.js-folder');

        const getTask = (uid) => {
            if (!uid) return null;
            const sourceList = type === 'done' ? fullHistoryList : fullIncompleteList;

            return sourceList.find((t) => (t.status?.uid || t.uid) === uid);
        };

        const checkExists = (id) =>
            new Promise((resolve) => {
                chrome.downloads.search({ id: parseInt(id) }, (results) => {
                    if (chrome.runtime.lastError || !results || results.length === 0) {
                        resolve(false);
                    } else {
                        resolve(results[0].exists);
                    }
                });
            });

        if (titleTarget) {
            const uid = titleTarget.dataset.uid;
            const task = getTask(uid);

            if (task && task.status && task.status.download_ids) {
                const ids = task.status.download_ids;
                const allNull = !ids.full_video && !ids.video_stream && !ids.audio_stream && !ids.cover && !ids.danmaku;

                if (allNull) {
                    showToast('该任务没有下载任何内容');

                    return;
                }

                const priority = ['full_video', 'video_stream', 'audio_stream', 'cover', 'danmaku'];
                let opened = false;

                for (const key of priority) {
                    const id = ids[key];

                    if (id) {
                        const exists = await checkExists(id);

                        if (exists) {
                            chrome.downloads.open(id);
                            opened = true;
                            break;
                        }
                    }
                }

                if (!opened) {
                    showToast('资源打开失败');
                }
            } else {
                showToast('资源打开失败');
            }

            return;
        }

        if (folderTarget) {
            const uid = folderTarget.dataset.uid;
            const task = getTask(uid);

            if (task && task.status && task.status.download_ids) {
                const ids = task.status.download_ids;
                const allNull = !ids.full_video && !ids.video_stream && !ids.audio_stream && !ids.cover && !ids.danmaku;

                if (allNull) {
                    showToast('该任务没有下载任何内容');

                    return;
                }

                const priority = ['full_video', 'audio_stream', 'video_stream', 'cover', 'danmaku'];
                let shown = false;

                for (const key of priority) {
                    const id = ids[key];

                    if (id) {
                        const exists = await checkExists(id);

                        if (exists) {
                            chrome.downloads.show(id);
                            shown = true;
                            break;
                        }
                    }
                }

                if (!shown) {
                    showToast('文件夹打开失败');
                }
            } else {
                showToast('文件夹打开失败');
            }

            return;
        }

        const btn = e.target.closest('.ud-icon-btn');

        if (!btn) return;
        const uid = btn.dataset.uid;

        if (btn.classList.contains('js-link')) {
            const url = btn.dataset.url;

            if (url) {
                navigator.clipboard
                    .writeText(url)
                    .then(() => {
                        if (typeof showToast === 'function') showToast('链接已复制');
                    })
                    .catch((err) => console.error(err));
            }
        }

        if (btn.classList.contains('js-delete')) {
            const ok = await showConfirmModal('确定要删除这条任务吗？（不会删除本地文件）', true, '确定');

            if (ok) {
                chrome.runtime.sendMessage({ type: 'REMOVE_HISTORY_ITEM', payload: uid }, () => {
                    window.dispatchEvent(new Event('manager:refresh'));
                });
                const card = btn.closest('.ud-task-card');

                if (card) {
                    card.style.opacity = '0';
                    setTimeout(() => card.remove(), 200);
                }

                showToast('任务已删除');
            }
        }

        if (btn.classList.contains('js-retry')) {
            chrome.runtime.sendMessage({ type: 'RETRY_TASK', payload: uid }, () => {
                window.dispatchEvent(new Event('manager:refresh'));
            });
            const card = btn.closest('.ud-task-card');

            if (card) {
                card.remove();
            }

            showToast('任务已重试');
        }
    };
}
