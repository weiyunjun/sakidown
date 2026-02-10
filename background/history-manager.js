/**
 * @file background/history-manager.js
 * @description 历史记录管理器 (History Persistence Layer)
 * * 核心职责 (Core Responsibilities):
 * 1. 持久化存储 (Persistence):
 * - 基于 IndexedDB (`appDB`) 存储已完成或失败的任务记录。
 * - 限制最大记录数 (`MAX_HISTORY_COUNT` = 1000000)，自动执行 FIFO 淘汰策略以控制存储空间。
 * * 2. 任务重试与恢复 (Retry & Recovery):
 * - `getTaskForRetry`: 将历史记录中的失败/中断任务转换为新的待办任务，保留原有的部分成功状态 (如已下载的视频流)，实现断点续传或增量重试。
 * - `getTasksForRetryBatch`: 支持批量任务的重构与重试。
 * * 3. 引用管理 (Reference Management):
 * - 与 `ThumbnailManager` 联动，在添加/删除历史记录时自动维护封面图片的引用计数，防止误删正在使用的资源。
 * - 实时更新 `saki_counter_history`，确保扩展图标的 Badge 计数准确。
 * * @author weiyunjun
 * @version v0.1.0
 */

import { statusManager } from './status-manager.js';
import { appDB } from '../lib/db.js';
import { thumbnailManager } from './thumbnail-manager.js';
const MAX_HISTORY_COUNT = 1000000;

class HistoryManager {
    constructor() {
        this.history = [];
        this.ready = new Promise((resolve) => {
            this._resolveReady = resolve;
        });
    }

    _updateUICounter() {
        chrome.storage.local.set({ saki_counter_history: this.history.length });
    }

    async load() {
        try {
            const records = await appDB.getAll('history');

            this.history = records.sort((a, b) => {
                const tA = a.status?.finish_time || 0;
                const tB = b.status?.finish_time || 0;

                return tB - tA;
            });

            this._updateUICounter();
        } catch (e) {
            console.error('[HistoryManager] Load from DB failed:', e);
            this.history = [];
            this._updateUICounter();
        } finally {
            if (this._resolveReady) this._resolveReady();
        }
    }

    addRecord(task) {
        if (task.metadata && task.metadata.thumbnail_id && task.metadata.thumbnail_url) {
            thumbnailManager.register(task.metadata.thumbnail_id, task.metadata.thumbnail_url);
        }

        this.history.unshift(task);
        this._updateUICounter();
        appDB.add('history', task).catch((e) => console.error('[History] Add failed:', e));

        if (this.history.length > MAX_HISTORY_COUNT) {
            const removedTask = this.history.pop();

            this._updateUICounter();

            if (removedTask && removedTask.status && removedTask.status.uid) {
                appDB.delete('history', removedTask.status.uid).catch((e) => console.error(e));

                if (removedTask.metadata && removedTask.metadata.thumbnail_id) {
                    thumbnailManager.deregister(removedTask.metadata.thumbnail_id);
                }
            }
        }
    }

    removeRecord(idToRemove) {
        this.removeRecords([idToRemove]);
    }

    removeRecords(uids) {
        if (!uids || uids.length === 0) return;
        const uidSet = new Set(uids);

        for (let i = this.history.length - 1; i >= 0; i--) {
            const task = this.history[i];
            const uid = task.status ? task.status.uid : task.uid;

            if (uidSet.has(uid)) {
                if (task.metadata && task.metadata.thumbnail_id) {
                    thumbnailManager.deregister(task.metadata.thumbnail_id);
                }

                appDB.delete('history', uid).catch((e) => console.error(e));
                this.history.splice(i, 1);
            }
        }

        this._updateUICounter();
    }

    getTaskForRetry(uid) {
        const index = this.history.findIndex((h) => {
            const currentUid = h.status ? h.status.uid : h.uid;

            return currentUid === uid;
        });

        if (index !== -1) {
            const historyItem = this.history[index];

            if (historyItem) {
                const newTask = JSON.parse(JSON.stringify(historyItem));
                const oldStatus = historyItem.status || {};
                const isPartialSuccess = !!oldStatus.mainMediaSuccess;

                newTask.status = {
                    uid: crypto.randomUUID(),
                    phase: 'pending',
                    phase_text: '等待重试',
                    retry_count: (oldStatus.retry_count || 0) + 1,
                    error: null,
                    streams: isPartialSuccess ? oldStatus.streams || [] : [],
                    video: isPartialSuccess ? oldStatus.video : null,
                    audio: isPartialSuccess ? oldStatus.audio : null,
                    video_candidates: isPartialSuccess ? oldStatus.video_candidates : null,
                    audio_candidates: isPartialSuccess ? oldStatus.audio_candidates : null,
                    mainMediaSuccess: isPartialSuccess,
                    attachments: isPartialSuccess ? JSON.parse(JSON.stringify(oldStatus.attachments || [])) : [],
                    progress: { loaded: 0, total: 0, percent: 0, speed: 0, eta: 0 },
                    finish_time: 0,
                };

                return newTask;
            }
        }

        return null;
    }

    getTasksForRetryBatch(uids) {
        if (!uids || uids.length === 0) return [];
        const result = [];
        const historyMap = new Map();

        this.history.forEach((h) => {
            const uid = h.status ? h.status.uid : h.uid;

            historyMap.set(uid, h);
        });
        uids.forEach((uid) => {
            const historyItem = historyMap.get(uid);

            if (historyItem) {
                const newTask = JSON.parse(JSON.stringify(historyItem));
                const oldStatus = historyItem.status || {};
                const isPartialSuccess = !!oldStatus.mainMediaSuccess;

                newTask.status = {
                    uid: crypto.randomUUID(),
                    phase: 'pending',
                    phase_text: '等待重试',
                    retry_count: (oldStatus.retry_count || 0) + 1,
                    error: null,
                    streams: isPartialSuccess ? oldStatus.streams || [] : [],
                    video: isPartialSuccess ? oldStatus.video : null,
                    audio: isPartialSuccess ? oldStatus.audio : null,
                    video_candidates: isPartialSuccess ? oldStatus.video_candidates : null,
                    audio_candidates: isPartialSuccess ? oldStatus.audio_candidates : null,
                    mainMediaSuccess: isPartialSuccess,
                    attachments: isPartialSuccess ? JSON.parse(JSON.stringify(oldStatus.attachments || [])) : [],
                    progress: { loaded: 0, total: 0, percent: 0, speed: 0, eta: 0 },
                    finish_time: 0,
                };
                result.push(newTask);
            }
        });

        return result;
    }
}

export const historyManager = new HistoryManager();
