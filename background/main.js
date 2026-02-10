/**
 * @file background/main.js
 * @description Service Worker 入口 (Service Worker Entry Point)
 * * 核心职责 (Core Responsibilities):
 * 1. 初始化与配置 (Initialization):
 * - 启动核心模块 (`setupInterceptor`, `historyManager`)。
 * - 加载用户配置 (主题、任务间隔、快捷按钮)，并监听配置变更 (`chrome.storage.onChanged`)。
 * 2. 消息路由中枢 (Message Router):
 * - 监听 `chrome.runtime.onMessage`，分发各类指令：
 * - 任务管理: `BATCH_DOWNLOAD`, `RETRY_TASK`, `CANCEL_TASK` -> TaskScheduler/DownloadEngine。
 * - 数据管理: `REMOVE_HISTORY_ITEM`, `BATCH_DELETE_HISTORY` -> HistoryManager。
 * - 密钥同步: `UPDATE_WBI_KEYS` -> BilibiliApi。
 * - UI 交互: `OPEN_MANAGER`, `GET_MANAGER_DATA`。
 * * 3. 生命周期管理 (Lifecycle):
 * - 监听 Tab 关闭事件，通知 DownloadEngine 清理宿主绑定。
 * - 协调 `ThumbnailManager` 在系统就绪后进行资源校准。
 * * @author weiyunjun
 * @version v0.1.0
 */

const DEFAULT_CONFIG = { user_theme: 'default', show_quick_button: true };

import { downloadEngine } from './download-engine.js';
import { setupInterceptor } from './stream-interceptor.js';
import { BilibiliApi } from './bilibili-api.js';
import { taskScheduler } from './task-scheduler.js';
import { statusManager } from './status-manager.js';
import { historyManager } from './history-manager.js';
import { thumbnailManager } from './thumbnail-manager.js';
import { StoragePipeline } from '../core/storage-pipeline.js';
import { exportManager } from './export-manager.js';

function initializeConfig() {
    chrome.storage.local.get(['user_theme', 'task_interval', 'show_quick_button'], (result) => {
        if (!result.user_theme) {
            chrome.storage.local.set({ user_theme: DEFAULT_CONFIG.user_theme });
        }

        if (result.show_quick_button === undefined) {
            chrome.storage.local.set({ show_quick_button: DEFAULT_CONFIG.show_quick_button });
        }

        const interval = result.task_interval !== undefined ? result.task_interval : 5;

        taskScheduler.setTaskInterval(interval);
    });
}

setupInterceptor();
historyManager.load();
initializeConfig();
Promise.all([taskScheduler.ready, historyManager.ready]).then(() => {
    const allTasks = [...taskScheduler.queue, ...historyManager.history];

    thumbnailManager.init(allTasks);
});
chrome.tabs.onRemoved.addListener((tabId) => {
    downloadEngine.handleTabRemoved(tabId);
});
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        if (changes.task_interval) {
            taskScheduler.setTaskInterval(changes.task_interval.newValue);
        }
    }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'STRATEGIES_UPDATED') {
        chrome.runtime.sendMessage({ type: 'STRATEGIES_UPDATED_BROADCAST' }).catch(() => {});

        return false;
    }

    if (message.type === 'BATCH_DOWNLOAD') {
        const tasks = message.payload.tasks;

        if (tasks && tasks.length > 0) {
            const tabId = sender.tab ? sender.tab.id : null;

            taskScheduler.addTasks(tasks, tabId);
            sendResponse({ status: 'success' });
        } else {
            sendResponse({ status: 'error', msg: 'Empty tasks' });
        }

        return true;
    }

    if (message.type === 'REMOVE_QUEUE_ITEM') {
        taskScheduler.removeTask(message.payload);

        return false;
    }

    if (message.type === 'REMOVE_HISTORY_ITEM') {
        historyManager.removeRecord(message.payload);

        return false;
    }

    if (message.type === 'RETRY_TASK') {
        const newTask = historyManager.getTaskForRetry(message.payload);

        if (newTask) {
            taskScheduler.addTasks([newTask], null);
            historyManager.removeRecord(message.payload);
        }

        return false;
    }

    if (message.type === 'CANCEL_TASK') {
        downloadEngine.cancelCurrentTask();

        return false;
    }

    if (message.type === 'GET_MANAGER_DATA') {
        Promise.all([taskScheduler.ready, historyManager.ready]).then(() => {
            sendResponse(statusManager.getDashboardSnapshot());
        });

        return true;
    }

    if (message.type === 'REFRESH_VIDEO_SUCCESS') {
        downloadEngine.handleRefreshSuccess(message.payload);

        return false;
    }

    if (message.type === 'OPEN_MANAGER') {
        chrome.storage.local.get(['saki_counter_queue', 'saki_counter_history'], (res) => {
            const queueCount = res.saki_counter_queue || 0;
            const historyCount = res.saki_counter_history || 0;
            let tab = 'active';

            if (queueCount > 0) {
                tab = 'active';
            } else if (historyCount > 0) {
                tab = 'completed';
            } else {
                tab = 'active';
            }

            chrome.tabs.create({ url: `manager/manager.html?tab=${tab}&page=1` });
        });

        return false;
    }

    if (message.type === 'OPEN_SETTINGS_BG') {
        if (sender.tab && sender.tab.id) {
            chrome.tabs.sendMessage(sender.tab.id, { type: 'OPEN_SETTINGS' });
        }

        return false;
    }

    if (message.type === 'UPDATE_WBI_KEYS') {

        BilibiliApi.updateKeys(message.payload);
        sendResponse({ status: 'updated' });

        return false;
    }

    if (message.type === 'BATCH_CANCEL_QUEUE') {
        const count = taskScheduler.removeTasks(message.payload);

        sendResponse({ count: count });

        return false;
    }

    if (message.type === 'BATCH_DELETE_HISTORY') {
        historyManager.removeRecords(message.payload);
        sendResponse({ status: 'success' });

        return false;
    }

    if (message.type === 'BATCH_RETRY_TASKS') {
        const newTasks = historyManager.getTasksForRetryBatch(message.payload);

        if (newTasks.length > 0) {
            taskScheduler.addTasks(newTasks, null);
            historyManager.removeRecords(message.payload);
        }

        sendResponse({ count: newTasks.length });

        return false;
    }
});
