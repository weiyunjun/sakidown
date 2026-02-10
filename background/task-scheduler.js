/**
 * @file background/task-scheduler.js
 * @description 任务调度器 (Task Queue Manager)
 * * 核心职责 (Core Responsibilities):
 * 1. 队列管理 (Queue Management):
 * - 维护 FIFO 任务队列 `queue`，支持批量添加、移除、重试任务。
 * - 负责任务的持久化存储 (`restoreState`)，在浏览器重启后自动恢复 "Zombie" 任务。
 * * 2. 调度策略 (Scheduling Strategy):
 * - 实现全局冷却机制 (`globalCooldownUntil`)，控制任务间的请求间隔，避免触发反爬风控。
 * - 单线程调度：通过 `_scheduleLoop` 确保同一时间只有一个任务在 `DownloadEngine` 中执行。
 * * 3. 状态同步 (State Synchronization):
 * - 实时计算队列长度并更新 UI Badge 计数 (`_updateUICounter`)。
 * - 采用 "乐观更新" 策略，确保任务出列但未开始执行时的 UI 计数准确性。
 * * @author weiyunjun
 * @version v0.1.0
 */

import { downloadEngine } from './download-engine.js';
import { historyManager } from './history-manager.js';
import { thumbnailManager } from './thumbnail-manager.js';
class TaskScheduler {
    constructor() {
        this.queue = [];
        this.globalCooldownUntil = 0;
        this.schedulerTimer = null;
        this.cooldownMs = 5000;
        this.ready = new Promise((resolve) => {
            this._resolveReady = resolve;
        });
        this.restoreState();
    }

    setTaskInterval(seconds) {
        if (typeof seconds === 'number' && seconds >= 0) {
            this.cooldownMs = seconds * 1000;

        }
    }

    _updateUICounter() {
        const count = this.queue.length + (downloadEngine.isProcessing ? 1 : 0);

        chrome.storage.local.set({ saki_counter_queue: count });
    }

    _saveQueue(emitUpdate = true) {
        chrome.storage.local.set({ pendingQueue: this.queue });
        if (emitUpdate) this._updateUICounter();
    }

    async restoreState() {
        try {
            const data = await chrome.storage.local.get(['pendingQueue', 'activeTask']);
            const savedQueue = data.pendingQueue || [];
            const activeTask = data.activeTask;
            const tasksToRestore = [...savedQueue];

            if (activeTask) {
                if (activeTask.status && activeTask.status.phase === 'done') {
                    console.warn('[TaskScheduler] Detected zombie task (done), discarding...');
                    chrome.storage.local.remove('activeTask');
                } else {
                    activeTask.status.phase = 'pending';
                    activeTask.status.phase_text = '异常中断恢复';
                    activeTask.status.streams = [];
                    activeTask.status.video = null;
                    activeTask.status.audio = null;
                    activeTask.status.error = null;
                    activeTask.status.progress = { loaded: 0, total: 0, percent: 0, speed: 0, eta: 0 };
                    tasksToRestore.unshift(activeTask);
                    chrome.storage.local.remove('activeTask');
                }
            }

            if (tasksToRestore.length > 0) {
                this.queue = [...tasksToRestore, ...this.queue];

                this._saveQueue();
                this.triggerNext();
            } else {
                this._updateUICounter();
            }
        } catch (e) {
            console.error('[background/task-scheduler.js] Restore failed:', e);
        } finally {
            if (this._resolveReady) this._resolveReady();
        }
    }

    addTasks(tasks, tabId) {
        if (tabId) downloadEngine.setHostTabId(tabId);
        tasks.forEach((task) => {
            if (task.metadata && task.metadata.thumbnail_id && task.metadata.thumbnail_url) {
                thumbnailManager.register(task.metadata.thumbnail_id, task.metadata.thumbnail_url);
            }

            if (!task.status || !task.status.uid) {
                task.status = {
                    uid: crypto.randomUUID(),
                    phase: 'pending',
                    phase_text: '等待中',
                    retry_count: 0,
                    error: null,
                    streams: [],
                    video: null,
                    audio: null,
                    progress: { loaded: 0, total: 0, percent: 0, speed: 0, eta: 0 },
                    download_ids: { full_video: null, video_stream: null, audio_stream: null, cover: null, danmaku: null },
                    totalBytes: 0,
                    finish_time: 0,
                };
            } else {
                task.status.phase = 'pending';

                if (!task.status.download_ids) {
                    task.status.download_ids = {
                        full_video: null,
                        video_stream: null,
                        audio_stream: null,
                        cover: null,
                        danmaku: null,
                    };
                }

                if (!task.status.phase_text || task.status.phase_text.includes('失败') || task.status.phase_text === '已完成') {
                    task.status.phase_text = '等待重试';
                }
            }
        });
        this.queue.push(...tasks);
        this._saveQueue();

        this.triggerNext();
    }

    triggerNext() {
        if (this.schedulerTimer) clearTimeout(this.schedulerTimer);
        this._updateUICounter();
        this._scheduleLoop();
    }

    async _scheduleLoop() {
        if (downloadEngine.isProcessing) return;
        if (this.queue.length === 0) return;
        const now = Date.now();

        if (now < this.globalCooldownUntil) {
            const nextTask = this.queue.find(
                (t) => !t.status.phase || t.status.phase === 'pending' || t.status.phase === 'resolving',
            );

            if (nextTask) {
                const remaining = Math.ceil((this.globalCooldownUntil - now) / 1000);

                nextTask.status.phase_text = `等待任务间隔中 (${remaining}s)...`;
                this.schedulerTimer = setTimeout(() => this._scheduleLoop(), 1000);
            }

            return;
        }

        const taskIndex = this.queue.findIndex(
            (t) => !t.status.phase || t.status.phase === 'pending' || t.status.phase === 'resolving',
        );

        if (taskIndex === -1) return;
        const task = this.queue.splice(taskIndex, 1)[0];

        if (task.status.phase_text && task.status.phase_text.includes('等待任务间隔中')) {
            task.status.phase_text = '准备开始...';
        }

        this._saveQueue(false);
        const optimisticCount = this.queue.length + 1;

        chrome.storage.local.set({ saki_counter_queue: optimisticCount });
        await downloadEngine.execute(task);
        this._updateUICounter();
    }

    removeTask(idToRemove) {
        if (idToRemove) {
            this.removeTasks([idToRemove]);
        }
    }

    removeTasks(uids) {
        if (!uids || uids.length === 0) return 0;
        const uidSet = new Set(uids);
        let removedCount = 0;

        for (let i = this.queue.length - 1; i >= 0; i--) {
            const task = this.queue[i];
            const tid = task.status.uid;

            if (uidSet.has(tid)) {
                if (task.metadata && task.metadata.thumbnail_id) {
                    thumbnailManager.deregister(task.metadata.thumbnail_id);
                }

                task.status.phase = 'canceled';
                task.status.phase_text = '用户手动取消';
                task.status.finish_time = Date.now();
                historyManager.addRecord(task);
                this.queue.splice(i, 1);
                removedCount++;
            }
        }

        this._saveQueue();

        if (downloadEngine.isProcessing && downloadEngine.activeTask) {
            const activeUid = downloadEngine.activeTask.status.uid;

            if (uidSet.has(activeUid)) {
                downloadEngine.cancelCurrentTask();
                removedCount++;
            }
        }

        if (!downloadEngine.isProcessing) this.triggerNext();

        return removedCount;
    }

    getQueueSnapshot() {
        return this.queue;
    }

    triggerCooldown() {
        this.globalCooldownUntil = Date.now() + this.cooldownMs;
    }

    getCooldownTime() {
        return this.globalCooldownUntil;
    }
}

export const taskScheduler = new TaskScheduler();
