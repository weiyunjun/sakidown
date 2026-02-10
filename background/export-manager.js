/**
 * @file background/export-manager.js
 * @description 导出管理器 (Export & Download Handler)
 * * 核心职责 (Core Responsibilities):
 * 1. 下载桥接 (Download Bridging):
 * - 封装 `chrome.downloads` API，处理文件命名冲突 (`onDeterminingFilename`)。
 * - 维护 `pendingMap` 和 `activeMonitoring`，追踪下载任务状态 (完成/中断/取消)。
 * * 2. 虚拟流导出 (Virtual Stream Export):
 * - `exportStream`: 为 OPFS 中的大文件生成虚拟 URL (`streams/{uuid}/{filename}`)。
 * - 将 Pipeline 注册到 `TaskRegistry`，配合 `StreamInterceptor` 实现流式下载，规避 Blob 内存限制。
 * * 3. 触发策略 (Trigger Strategy):
 * - 优先尝试通过 Offscreen 或 Content Script 触发下载，以维持 Service Worker 活性。
 * - 降级策略：如果从属页面无响应，回退到原生 `chrome.downloads.download`。
 * * @author weiyunjun
 * @version v0.1.0
 */

import { TaskRegistry } from './task-registry.js';
const SHELF_RESTORE_DELAY = 2000;

class ExportManager {
    constructor() {
        this.pendingMap = new Map();
        this.activeMonitoring = new Map();
        this._initListeners();
    }

    _initListeners() {
        chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
            const taskInfo = this.pendingMap.get(item.url);

            if (taskInfo) {
                suggest({ filename: taskInfo.finalPath, conflictAction: 'uniquify' });

                return true;
            }

            return false;
        });
        chrome.downloads.onChanged.addListener((delta) => {
            const context = this.activeMonitoring.get(delta.id);

            if (!context) return;

            if (delta.state) {
                if (delta.state.current === 'complete') {
                    context.resolve(delta.id);
                    this._cleanup(delta.id);
                } else if (delta.state.current === 'interrupted') {
                    const error = delta.error?.current || 'Interrupted';

                    if (error === 'USER_CANCELED') {
                        context.reject(new Error('USER_CANCELED'));
                    } else {
                        context.reject(new Error(error));
                    }

                    this._cleanup(delta.id);
                }
            }
        });
    }

    _cleanup(download_id) {
        if (this.activeMonitoring.has(download_id)) {
            this.activeMonitoring.delete(download_id);
        }
    }

    downloadAttachment(url, finalPath) {
        return new Promise((resolve, reject) => {
            this.pendingMap.set(url, { finalPath: finalPath });
            chrome.downloads.download({ url: url, saveAs: false }, (download_id) => {
                if (chrome.runtime.lastError) {
                    this.pendingMap.delete(url);
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    setTimeout(() => {
                        if (this.pendingMap.has(url)) {
                            this.pendingMap.delete(url);
                        }
                    }, 10000);
                    resolve(download_id);
                }
            });
        });
    }

    async exportStream(pipeline, task, finalPath, hostTabId, mode = 'universal') {
        const uuid = crypto.randomUUID();
        const safeFilename = encodeURIComponent(finalPath.split('/').pop());

        TaskRegistry.set(uuid, { pipeline: pipeline, title: task.metadata.title, mode: mode, filename: safeFilename });
        const virtualUrl = chrome.runtime.getURL(`streams/${uuid}/${safeFilename}`);

        this.pendingMap.set(virtualUrl, { finalPath: finalPath });

        return new Promise((resolve, reject) => {
            const safetyTimeout = setTimeout(() => {
                this.pendingMap.delete(virtualUrl);
                reject(new Error('Export timeout (60s)'));
            }, 60000);

            const createdListener = (item) => {
                if (item.url === virtualUrl || item.url.includes(uuid)) {
                    chrome.downloads.onCreated.removeListener(createdListener);
                    clearTimeout(safetyTimeout);
                    this.activeMonitoring.set(item.id, {
                        resolve: resolve,
                        reject: reject,
                        cleanup: () => this.pendingMap.delete(virtualUrl),
                    });
                    setTimeout(() => this.pendingMap.delete(virtualUrl), 10000);
                }
            };

            chrome.downloads.onCreated.addListener(createdListener);
            this._triggerDownload(virtualUrl, pipeline, hostTabId).catch((err) => {
                chrome.downloads.onCreated.removeListener(createdListener);
                clearTimeout(safetyTimeout);
                this.pendingMap.delete(virtualUrl);
                reject(err);
            });
        });
    }

    async _triggerDownload(url, pipeline, hostTabId) {
        if (typeof pipeline.triggerDownload === 'function') {
            try {
                await pipeline.triggerDownload(url);

                return;
            } catch (e) {
                console.warn('Offscreen trigger failed, falling back...', e);
            }
        }

        if (hostTabId) {
            chrome.tabs.sendMessage(hostTabId, { type: 'SILENT_DOWNLOAD_TRIGGER', url: url }, () => {
                if (chrome.runtime.lastError) this._triggerNativeDownload(url);
            });
        } else {
            this._triggerNativeDownload(url);
        }
    }

    _triggerNativeDownload(url) {
        chrome.downloads.download({ url: url }, () => {
            if (chrome.runtime.lastError) {
                console.error('Native trigger failed:', chrome.runtime.lastError);
            }
        });
    }
}

export const exportManager = new ExportManager();
