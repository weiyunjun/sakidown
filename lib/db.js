/**
 * @file lib/db.js
 * @description IndexedDB 封装库 (IndexedDB Wrapper)
 * * 核心职责 (Core Responsibilities):
 * 1. 数据持久化 (Data Persistence):
 * - 封装原生的 `indexedDB` API，提供 Promise 风格的增删改查接口 (`add`, `get`, `getAll`, `delete`)。
 * - 管理应用所需的 Object Stores: `history` (历史记录), `queue` (任务队列), `thumbnails` (封面缓存), `assets` (自定义音效)。
 * * 2. 数据库版本管理 (Schema Management):
 * - 在 `onupgradeneeded` 中定义数据库结构，确保在扩展升级时自动迁移或创建新的存储表。
 * * @author weiyunjun
 * @version v0.1.0
 */

const DB_NAME = 'SakiDownDB';
const DB_VERSION = 3;
const STORES = { HISTORY: 'history', QUEUE: 'queue', THUMBNAILS: 'thumbnails', ASSETS: 'assets' };

class AppDatabase {
    constructor() {
        this.db = null;
        this.ready = this._init();
        self.SakiDownDB_Debug = this;
    }

    _init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error(`[DB] Open failed:`, event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;

                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains(STORES.HISTORY)) {
                    db.createObjectStore(STORES.HISTORY, { keyPath: 'status.uid' });
                }

                if (!db.objectStoreNames.contains(STORES.QUEUE)) {
                    db.createObjectStore(STORES.QUEUE, { keyPath: 'status.uid' });
                }

                if (!db.objectStoreNames.contains(STORES.THUMBNAILS)) {
                    db.createObjectStore(STORES.THUMBNAILS, { keyPath: 'id' });
                }

                if (!db.objectStoreNames.contains(STORES.ASSETS)) {
                    db.createObjectStore(STORES.ASSETS, { keyPath: 'id' });
                }
            };
        });
    }

    async getAll(storeName) {
        await this.ready;

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async get(storeName, key) {
        await this.ready;

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async add(storeName, item) {
        await this.ready;

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.put(item);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async delete(storeName, key) {
        await this.ready;

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.delete(key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clear(storeName) {
        await this.ready;

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async count(storeName) {
        await this.ready;

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.count();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

export const appDB = new AppDatabase();
self.appDB = appDB;
