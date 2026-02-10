/**
 * @file core/io-worker.js
 * @description IO 工作线程 (IO Worker Thread)
 * * 核心职责 (Core Responsibilities):
 * 1. OPFS 独占访问 (OPFS Exclusive Access):
 * - 作为唯一拥有 `FileSystemSyncAccessHandle` 的线程，负责对 Origin Private File System 进行同步读写操作。
 * - 这种设计绕过了 Service Worker 无法直接使用同步句柄的限制，大幅提升了文件写入性能。
 * * 2. 消息驱动的 IO 服务 (Message-Driven IO Service):
 * - 响应来自 `offscreen.js` 的指令：OPEN, WRITE, READ, CLOSE, DELETE, CHECK。
 * - 使用 `Transferable Objects` (如 ArrayBuffer) 进行零拷贝数据传输，减少主线程与 Worker 间的通信开销。
 * * @author weiyunjun
 * @version v0.1.0
 */

const fileMap = new Map();
let root = null;

async function getRoot() {
    if (!root) {
        root = await navigator.storage.getDirectory();
    }

    return root;
}

self.onmessage = async (e) => {
    const { id: id, type: type, payload: payload } = e.data;

    try {
        let result = null;
        let transferList = [];

        switch (type) {
            case 'OPEN':
                await openFile(payload.filename);
                break;
            case 'WRITE':
                await writeFile(payload.filename, payload.buffer);
                break;
            case 'READ':
                const buffer = await readFile(payload.filename, payload.offset, payload.size);

                result = buffer;

                if (buffer.byteLength > 0) {
                    transferList.push(buffer);
                }

                break;
            case 'CLOSE':
                await closeFile(payload.filename);
                break;
            case 'DELETE':
                await deleteFile(payload.filename);
                break;
            case 'CHECK':
                result = await checkFileExists(payload.filename);
                break;
            default:
                throw new Error(`Unknown IO Operation: ${type}`);
        }

        self.postMessage({ id: id, data: result }, { transfer: transferList });
    } catch (err) {
        self.postMessage({ id: id, error: err.message || err.toString() });
    }
};

async function openFile(filename) {
    if (fileMap.has(filename)) return;
    const rootDir = await getRoot();
    const fileHandle = await rootDir.getFileHandle(filename, { create: true });
    const accessHandle = await fileHandle.createSyncAccessHandle();

    fileMap.set(filename, { fileHandle: fileHandle, accessHandle: accessHandle });
}

async function writeFile(filename, buffer) {
    const entry = fileMap.get(filename);

    if (!entry) throw new Error(`File not open: ${filename}`);
    const dataView = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const writtenBytes = entry.accessHandle.write(dataView);

    if (writtenBytes !== dataView.byteLength) {
        throw new Error(`Write incomplete: wrote ${writtenBytes} of ${dataView.byteLength} bytes`);
    }
}

async function readFile(filename, offset, size) {
    const entry = fileMap.get(filename);

    if (!entry) throw new Error(`File not open: ${filename}`);
    const readBuffer = new Uint8Array(size);
    const bytesRead = entry.accessHandle.read(readBuffer, { at: offset });

    if (bytesRead === 0) {
        console.warn(`[IOWorker] Read 0 bytes from ${filename} at ${offset}. EOF?`);

        return new ArrayBuffer(0);
    }

    if (bytesRead < size) {
        return readBuffer.buffer.slice(0, bytesRead);
    }

    return readBuffer.buffer;
}

async function closeFile(filename) {
    const entry = fileMap.get(filename);

    if (entry) {
        entry.accessHandle.flush();
        entry.accessHandle.close();
        fileMap.delete(filename);
    }
}

async function deleteFile(filename) {
    await closeFile(filename);
    const rootDir = await getRoot();

    await rootDir.removeEntry(filename);
}

async function checkFileExists(filename) {
    try {
        const rootDir = await getRoot();
        const handle = await rootDir.getFileHandle(filename);
        const file = await handle.getFile();

        return file.size;
    } catch (e) {
        return false;
    }
}
