/**
 * @file background/status-manager.js
 * @description 状态管理器 (Progress & Status Monitor)
 * * 核心职责 (Core Responsibilities):
 * 1. 进度计算 (Progress Calculation):
 * - 实时计算任务的下载速度、已下载量、百分比和剩余时间 (ETA)。
 * - 采用滑动窗口算法 (`speedSamples`) 和加权平滑策略，确保 UI 显示的速度值稳定，不剧烈抖动。
 * - 使用 `performance.now()` 获取高精度时间戳，避免系统时间回调导致的计算误差。
 * * 2. 状态广播 (Status Broadcasting):
 * - 将计算后的进度信息 (`DOWNLOAD_PROGRESS`) 实时推送给前端 UI (Popup/Manager/Content Script)。
 * - 提供 `getDashboardSnapshot` 接口，为管理面板提供全量的任务队列、历史记录和当前任务快照。
 * * 3. 数据清洗 (Data Sanitization):
 * - 在任务重置或异常中断时，负责清理脏数据 (`resetState`)，防止旧进度干扰新任务。
 * * @author weiyunjun
 * @version v0.1.0
 */

import { taskScheduler } from './task-scheduler.js';
import { downloadEngine } from './download-engine.js';
import { historyManager } from './history-manager.js';
const SPEED_CALC_WINDOW = 2000;

class StatusManager {
    constructor() {
        this.currentSpeed = 0;
        this.speedSamples = [];
        this.lastSampleTime = 0;
    }

    resetState() {
        this.currentSpeed = 0;
        this.speedSamples = [];
        this.lastSampleTime = 0;
    }

    updateProgress(task, loaded, total, hostTabId) {
        if (!task || !task.status || !task.status.progress) return;
        this._calculateSpeed(loaded);
        let percent = 0;

        if (total > 0) percent = Math.min(100, (loaded / total) * 100);
        let eta = 0;

        if (this.currentSpeed > 0 && total > 0) {
            const remaining = Math.max(0, total - loaded);

            eta = remaining / this.currentSpeed;
        }

        task.status.progress.loaded = loaded;
        task.status.progress.total = total;
        task.status.progress.percent = percent;
        task.status.progress.speed = this.currentSpeed;
        task.status.progress.eta = eta;
        const phase = task.status.phase;

        if (hostTabId) {
            chrome.tabs
                .sendMessage(hostTabId, { type: 'DOWNLOAD_PROGRESS', payload: { percent: Math.floor(percent), status: phase } })
                .catch(() => {});
        }
    }

    getDashboardSnapshot() {
        return { currentTask: downloadEngine.activeTask, queue: taskScheduler.queue, history: historyManager.history };
    }

    _calculateSpeed(currentLoaded) {
        const now = performance.now();

        if (now - this.lastSampleTime < 200) return;
        this.lastSampleTime = now;
        this.speedSamples.push({ time: now, loaded: currentLoaded });

        while (this.speedSamples.length > 0) {
            const oldest = this.speedSamples[0];

            if (now - oldest.time > SPEED_CALC_WINDOW) this.speedSamples.shift();
            else break;
        }

        if (this.speedSamples.length >= 2) {
            const newest = this.speedSamples[this.speedSamples.length - 1];
            const oldest = this.speedSamples[0];
            const timeDiff = newest.time - oldest.time;
            const bytesDiff = newest.loaded - oldest.loaded;

            if (timeDiff > 1000 && bytesDiff >= 0) {
                const calculatedSpeed = (bytesDiff / timeDiff) * 1000;

                if (this.currentSpeed === 0) this.currentSpeed = calculatedSpeed;
                else this.currentSpeed = this.currentSpeed * 0.5 + calculatedSpeed * 0.5;
            } else if (bytesDiff < 0) {
                this.speedSamples = [];
                this.currentSpeed = 0;
            }
        }
    }
}

export const statusManager = new StatusManager();
