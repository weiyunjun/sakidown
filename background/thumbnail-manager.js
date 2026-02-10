/**
 * @file background/thumbnail-manager.js
 * @description 缩略图管理器 (Thumbnail Lifecycle Manager)
 * * 核心职责 (Core Responsibilities):
 * 1. 引用计数垃圾回收 (Reference Counting GC):
 * - 维护所有封面图片的引用计数 (`refCount`)。只有当引用归零时，才从 OPFS 和 IndexedDB 中物理删除文件。
 * - `init` 时执行全量校准 (`_reconcile`)，修复因意外退出导致的引用计数偏差或孤儿文件。
 * * 2. 高并发下载队列 (Concurrent Download Queue):
 * - 实现了一个基于轮询 (`_processDownloads`) 的下载队列，支持高并发 (20+) 图片下载。
 * - 具备自愈能力：自动检测 0 字节文件或损坏文件并触发重试。
 * - 内存锁 (`processingIds`)：防止对同一个 URL 发起重复请求。
 * * 3. OPFS 存储 (OPFS Storage):
 * - 将封面图片保存为 blob 存储在 Origin Private File System 中，避免占用大量内存或 LocalStorage 配额。
 * - 提供 `register` / `deregister` 接口供 TaskScheduler 和 HistoryManager 调用。
 * * @author weiyunjun
 * @version v0.1.0
 */

import { appDB } from '../lib/db.js';
import { StoragePipeline } from '../core/storage-pipeline.js';
const STORE = 'thumbnails';
const POLL_INTERVAL = 1500;
const MAX_CONCURRENT_DOWNLOADS = 20;
const RETRY_COOLDOWN = 1000;
const DOWNLOAD_TIMEOUT = 15000;

class ThumbnailManager {
    constructor() {
        this.timer = null;
        this.isScanning = false;
        this.activeDownloads = 0;
        this._opQueue = Promise.resolve();
        this.processingIds = new Set();
    }

    async init(allTasks) {

        await this._enqueue(() => this._reconcile(allTasks));
        this._startPolling();
    }

    _enqueue(operation) {
        this._opQueue = this._opQueue
            .then(() => operation())
            .catch((e) => {
                console.error('[ThumbnailManager] Queue Error:', e);
            });

        return this._opQueue;
    }

    async register(id, url) {
        if (!id || !url) return;
        await this._enqueue(async () => {
            try {
                const record = await appDB.get(STORE, id);

                if (record) {
                    record.refCount++;

                    if (record.status === 'error') {
                        record.status = 'pending';
                    }

                    await appDB.add(STORE, record);
                } else {
                    await appDB.add(STORE, {
                        id: id,
                        url: url,
                        refCount: 1,
                        status: 'pending',
                        lastAttempt: 0,
                        createdAt: Date.now(),
                    });
                }

                this._processDownloads();
            } catch (e) {
                console.error('[ThumbnailManager] Register failed:', e);
            }
        });
    }

    async deregister(id) {
        if (!id) return;
        await this._enqueue(async () => {
            try {
                const record = await appDB.get(STORE, id);

                if (record) {
                    record.refCount--;

                    if (record.refCount <= 0) {
                        await appDB.delete(STORE, id);
                        await this._deleteFile(id);

                    } else {
                        await appDB.add(STORE, record);
                    }
                }
            } catch (e) {
                console.error('[ThumbnailManager] Deregister failed:', e);
            }
        });
    }

    async _reconcile(allTasks) {

        const realMap = new Map();

        for (const task of allTasks) {
            const meta = task.metadata;

            if (meta && meta.thumbnail_id && meta.thumbnail_url) {
                const id = meta.thumbnail_id;

                if (!realMap.has(id)) {
                    realMap.set(id, { url: meta.thumbnail_url, count: 0 });
                }

                realMap.get(id).count++;
            }
        }

        const dbRecords = await appDB.getAll(STORE);
        const dbIdSet = new Set();

        for (const record of dbRecords) {
            dbIdSet.add(record.id);
            const real = realMap.get(record.id);

            if (!real) {
                await appDB.delete(STORE, record.id);
                await this._deleteFile(record.id);

            } else {
                let needsUpdate = false;

                if (record.status === 'success') {
                    try {
                        const fileSize = await StoragePipeline.checkStandaloneFileExists(`${record.id}.avif`);

                        if (!fileSize) {
                            console.warn(
                                `[ThumbnailManager] Detected corrupted file for ${record.id} (Size: ${fileSize}). Healing...`,
                            );
                            record.status = 'pending';
                            record.lastAttempt = 0;
                            needsUpdate = true;
                        }
                    } catch (e) {
                        console.warn(`[ThumbnailManager] Sanity check failed for ${record.id}`, e);
                    }
                }

                if (record.refCount !== real.count) {
                    record.refCount = real.count;
                    needsUpdate = true;
                }

                if (needsUpdate) {
                    await appDB.add(STORE, record);
                }
            }
        }

        for (const [id, info] of realMap) {
            if (!dbIdSet.has(id)) {
                await appDB.add(STORE, {
                    id: id,
                    url: info.url,
                    refCount: info.count,
                    status: 'pending',
                    lastAttempt: 0,
                    createdAt: Date.now(),
                });

            }
        }
    }

    _startPolling() {
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => this._processDownloads(), POLL_INTERVAL);
        this._processDownloads();
    }

    async _processDownloads() {
        if (this.isScanning) return;
        if (!navigator.onLine) return;
        this.isScanning = true;

        try {
            if (this.activeDownloads >= MAX_CONCURRENT_DOWNLOADS) return;
            const all = await appDB.getAll(STORE);
            const now = Date.now();
            let pending = all.filter(
                (r) => r.status === 'pending' && !this.processingIds.has(r.id) && now - (r.lastAttempt || 0) > RETRY_COOLDOWN,
            );

            if (pending.length === 0) return;
            pending.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            const slots = MAX_CONCURRENT_DOWNLOADS - this.activeDownloads;
            const toDownload = pending.slice(0, slots);

            for (const item of toDownload) {
                this.activeDownloads++;
                this._downloadItem(item).finally(() => {
                    this.activeDownloads--;

                    if (this.activeDownloads < MAX_CONCURRENT_DOWNLOADS) {
                        this._processDownloads();
                    }
                });
            }
        } catch (e) {
            console.error('[ThumbnailManager] Polling error:', e);
        } finally {
            this.isScanning = false;
        }
    }

    async _downloadItem(item) {
        if (this.processingIds.has(item.id)) return;
        this.processingIds.add(item.id);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);

        try {
            await Promise.race([
                (async () => {
                    const res = await fetch(item.url, { referrerPolicy: 'no-referrer', signal: controller.signal });

                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const buffer = await res.arrayBuffer();

                    if (buffer.byteLength === 0) throw new Error('Received empty buffer');
                    await StoragePipeline.saveStandaloneFile(`${item.id}.avif`, buffer);
                    item.status = 'success';
                    item.lastAttempt = Date.now();
                    await appDB.add(STORE, item);
                })(),
                new Promise((_, reject) => {
                    controller.signal.addEventListener('abort', () => reject(new Error('TIMEOUT')));
                }),
            ]);
        } catch (e) {
            item.status = 'pending';
            item.lastAttempt = Date.now();

            if (e.message === 'TIMEOUT' || e.name === 'AbortError') {
                console.warn(`[ThumbnailManager] Task timeout: ${item.id}`);
            } else if (e.message.includes('404')) {
                item.status = 'error';
            }

            await appDB.add(STORE, item);
        } finally {
            clearTimeout(timeoutId);
            this.processingIds.delete(item.id);
        }
    }

    async _deleteFile(id) {
        try {
            await StoragePipeline.deleteStandaloneFile(`${id}.avif`);
        } catch (e) {}
    }
}

export const thumbnailManager = new ThumbnailManager();
