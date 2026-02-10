/**
 * @file core/storage-pipeline.js
 * @description 存储管线 (Storage & Download Pipeline)
 * * 核心职责 (Core Responsibilities):
 * 1. 并发下载引擎 (Concurrent Download Engine):
 * - `ConcurrentFetcher`: 实现多线程分片下载 (Range Requests)，支持断点续传和自动重试。
 * - 智能探测 (`preload`): 在下载前通过 HEAD/Range 请求获取文件大小，并验证流的有效性。
 * * 2. 碎片化处理与重组 (Fragment Processing & Reassembly):
 * - `_ingestLoop`: 持续读取下载流，识别 MP4 Box (moov/moof/mdat)。
 * - 配合 `FragmentProcessor` 提取音视频 Sample 数据，并将其临时存储到 OPFS (`.tmp` 文件)。
 * * 3. 虚拟文件导出 (Virtual File Export):
 * - `transfer`: 在导出阶段，动态构建标准的 MP4 文件结构 (ftyp + moov + mdat)。
 * - 从 OPFS 读取原始 Sample 数据，按时间戳顺序重组为完整的 MP4 流，通过 `controller.enqueue` 推送给浏览器下载。
 * - 支持 "Raw Mode" (直接导出流) 和 "Merge Mode" (音视频混流导出)。
 * * @author weiyunjun
 * @version v0.1.0
 */

import { BE } from '../lib/io-buffer.js';
import { FragmentProcessor } from '../lib/fragment-processor.js';
import { MP4Builder } from '../lib/mp4-atoms.js';
const DOWNLOAD_CHUNK_SIZE = 4 * 1024 * 1024;
const IPC_WRITE_CHUNK_SIZE = 16 * 1024 * 1024;

async function fetchWithRetry(url, options = {}, retries = 3, delay = 2000) {
    for (let i = 0; i <= retries; i++) {
        try {
            let fetchOptions = { ...options };
            let timeoutId = null;

            if (options.signal && options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
            const controller = new AbortController();
            const timeoutSignal = controller.signal;

            if (options.signal) options.signal.addEventListener('abort', () => controller.abort(), { once: true });
            timeoutId = setTimeout(() => controller.abort('Timeout'), 15000);
            fetchOptions.signal = timeoutSignal;

            try {
                const response = await fetch(url, fetchOptions);

                clearTimeout(timeoutId);

                if (!response.ok) {
                    if (response.status < 500 && response.status !== 429) throw new Error(`HTTP ${response.status}`);
                    throw new Error(`HTTP ${response.status} (Retryable)`);
                }

                return response;
            } catch (err) {
                clearTimeout(timeoutId);
                if (err === 'Timeout' || (err.name === 'AbortError' && !options.signal?.aborted))
                    throw new Error('Network Timeout (15s)');
                throw err;
            }
        } catch (err) {
            if (err.name === 'AbortError' && options.signal?.aborted) throw err;
            console.warn(`[Network] Fail: ${url} (${err.message})`);
            if (i === retries) throw err;
            await new Promise((r) => setTimeout(r, delay));
        }
    }
}

class ConcurrentFetcher {
    constructor(url, fileSize, signal, concurrency = 4) {
        this.url = url;
        this.fileSize = fileSize;
        this.chunkSize = DOWNLOAD_CHUNK_SIZE;
        this.concurrency = concurrency;
        this.totalChunks = Math.ceil(fileSize / this.chunkSize);
        this.currentReadIndex = 0;
        this.nextDownloadIndex = 0;
        this.taskMap = new Map();
        this.signal = signal;
    }

    async read() {
        if (this.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        if (this.currentReadIndex >= this.totalChunks) return { done: true, value: undefined };
        this._schedule();
        const taskPromise = this.taskMap.get(this.currentReadIndex);

        if (!taskPromise) throw new Error(`Logic Error: Chunk ${this.currentReadIndex} not scheduled`);

        try {
            const data = await taskPromise;

            this.taskMap.delete(this.currentReadIndex);
            this.currentReadIndex++;
            this._schedule();

            return { done: false, value: data };
        } catch (e) {
            if (this.signal.aborted) throw new DOMException('Aborted', 'AbortError');
            throw e;
        }
    }

    _schedule() {
        while (this.nextDownloadIndex < this.totalChunks && this.taskMap.size < this.concurrency) {
            if (this.signal.aborted) break;
            const idx = this.nextDownloadIndex++;

            this.taskMap.set(idx, this._fetchChunk(idx));
        }
    }

    async _fetchChunk(index) {
        const start = index * this.chunkSize;
        const end = Math.min(start + this.chunkSize, this.fileSize) - 1;
        const headers = { Range: `bytes=${start}-${end}` };
        const res = await fetchWithRetry(this.url, {
            headers: headers,
            mode: 'cors',
            credentials: 'include',
            signal: this.signal,
        });

        if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);

        return new Uint8Array(await res.arrayBuffer());
    }
}
class StreamReader {
    constructor(reader, name) {
        this.reader = reader;
        this.name = name;
        this.buffer = new Uint8Array(0);
        this.eof = false;
        this.totalRead = 0;
    }

    async peek(size) {
        while (this.buffer.length < size && !this.eof) await this._fetchMore();
        if (this.buffer.length < size) return null;

        return this.buffer.subarray(0, size);
    }

    async read(size) {
        while (this.buffer.length < size && !this.eof) await this._fetchMore();
        if (this.buffer.length < size) return null;
        const chunk = this.buffer.subarray(0, size);

        this.buffer = this.buffer.subarray(size);

        return chunk;
    }

    async readNextBox() {
        const header = await this.peek(8);

        if (!header || header.length < 8) return null;
        const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
        let size = BE.r32(view, 0);
        let headerSize = 8;

        if (size === 1) {
            const largeHeader = await this.peek(16);

            if (!largeHeader || largeHeader.length < 16) return null;
            const largeView = new DataView(largeHeader.buffer, largeHeader.byteOffset, largeHeader.byteLength);

            size = Number(BE.r64(largeView, 8));
            headerSize = 16;
        }

        if (size < 8) return null;
        while (this.buffer.length < size && !this.eof) await this._fetchMore();
        if (this.buffer.length < size) return null;
        const chunk = this.buffer.subarray(0, size);

        this.buffer = this.buffer.subarray(size);

        return {
            type: String.fromCharCode(view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7)),
            data: chunk,
            payload: chunk.subarray(headerSize),
        };
    }

    async _fetchMore() {
        try {
            const { done: done, value: value } = await this.reader.read();

            if (done) {
                this.eof = true;

                return;
            }

            if (value && value.length > 0) {
                const newBuf = new Uint8Array(this.buffer.length + value.length);

                newBuf.set(this.buffer);
                newBuf.set(value, this.buffer.length);
                this.buffer = newBuf;
                this.totalRead += value.length;
            }
        } catch (e) {
            this.eof = true;
            throw e;
        }
    }
}
class OffscreenClient {
    constructor() {
        this.msgId = 0;
        this.creatingPromise = null;
    }

    static getShared() {
        if (!OffscreenClient._instance) {
            OffscreenClient._instance = new OffscreenClient();
        }

        return OffscreenClient._instance;
    }

    async ensureOffscreen() {
        if (await chrome.offscreen.hasDocument()) return;

        if (this.creatingPromise) {
            await this.creatingPromise;

            return;
        }

        this.creatingPromise = chrome.offscreen.createDocument({
            url: 'background/offscreen.html',
            reasons: ['WORKERS'],
            justification: 'Hosting IO worker',
        });
        await this.creatingPromise;
        this.creatingPromise = null;
    }

    async getOffscreenWindowClient() {
        for (let i = 0; i < 10; i++) {
            const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            const target = clients.find((c) => c.url.includes('offscreen'));

            if (target) return target;
            if (!(await chrome.offscreen.hasDocument())) await this.ensureOffscreen();
            await new Promise((r) => setTimeout(r, 100));
        }

        throw new Error('Offscreen client not found');
    }

    async send(type, payload, transferList = []) {
        const targetClient = await this.getOffscreenWindowClient();

        if (!targetClient) throw new Error('Offscreen client not found');
        const id = ++this.msgId;
        const channel = new MessageChannel();

        return new Promise((resolve, reject) => {
            channel.port1.onmessage = (event) => {
                const response = event.data;

                if (response.error) reject(new Error(response.error));
                else resolve(response.payload);
            };

            targetClient.postMessage({ target: 'OFFSCREEN', data: { id: id, type: type, payload: payload } }, [
                channel.port2,
                ...transferList,
            ]);
            setTimeout(() => {
                reject(new Error(`IO Timeout: ${type}`));
            }, 30000);
        });
    }
}
class RemoteFileAgent {
    constructor(client, filename) {
        this.client = client;
        this.filename = filename;
        this.offset = 0;
        this.initialized = false;
    }

    async init() {
        if (!this.initialized) {
            await this.client.send('OPEN', { filename: this.filename });
            this.initialized = true;
        }
    }

    async write(data) {
        if (!this.initialized) await this.init();
        let currentOffset = 0;
        const totalSize = data.byteLength;

        while (currentOffset < totalSize) {
            const end = Math.min(currentOffset + IPC_WRITE_CHUNK_SIZE, totalSize);
            const compactChunk = new Uint8Array(data.subarray(currentOffset, end));

            await this.client.send('WRITE', { filename: this.filename, buffer: compactChunk.buffer }, [compactChunk.buffer]);
            currentOffset += IPC_WRITE_CHUNK_SIZE;
        }

        const startPos = this.offset;

        this.offset += totalSize;

        return startPos;
    }

    async read(offset, size) {
        return await this.client.send('READ', { filename: this.filename, offset: offset, size: size });
    }

    async close() {
        if (this.initialized) {
            await this.client.send('CLOSE', { filename: this.filename });
            this.initialized = false;
        }
    }

    async exists() {
        return await this.client.send('CHECK', { filename: this.filename });
    }

    async delete() {
        await this.close();
        await this.client.send('DELETE', { filename: this.filename });
    }
}

export class StoragePipeline {
    constructor() {
        this.tracks = {
            video: {
                id: 1,
                type: 'video',
                timescale: 90000,
                duration: 0,
                samples: [],
                codec: '',
                width: 0,
                height: 0,
                chunks: [],
            },
            audio: { id: 2, type: 'audio', timescale: 44100, duration: 0, samples: [], codec: '', chunks: [] },
        };
        this.hasAudio = false;
        this.offscreenClient = new OffscreenClient();
        const uid = Math.random().toString(36).slice(2);

        this.vStore = new RemoteFileAgent(this.offscreenClient, `v_${uid}.tmp`);
        this.aStore = new RemoteFileAgent(this.offscreenClient, `a_${uid}.tmp`);
        this.estimatedTotalSize = 0;
        this.startTime = 0;
        this.totalSize = 0;
        this.rawMode = false;
        this.activeRawStore = null;
        this.abortController = new AbortController();
    }

    static async saveStandaloneFile(filename, buffer) {
        const client = OffscreenClient.getShared();

        await client.ensureOffscreen();
        const agent = new RemoteFileAgent(client, filename);

        try {
            try {
                await agent.delete();
            } catch (e) {}

            const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

            await agent.write(data);
        } finally {
            await agent.close();
        }
    }

    static async deleteStandaloneFile(filename) {
        const client = OffscreenClient.getShared();

        await client.ensureOffscreen();
        const agent = new RemoteFileAgent(client, filename);

        await agent.delete();
    }

    static async checkStandaloneFileExists(filename) {
        const client = OffscreenClient.getShared();

        await client.ensureOffscreen();
        const agent = new RemoteFileAgent(client, filename);

        return await agent.exists();
    }

    async cancel() {
        this.abortController.abort();

        try {
            await this.cleanup();
        } catch (e) {
            console.warn('[core/storage-pipeline.js] Cleanup during cancel failed:', e);
        }
    }

    async _initReader(source, name, threadCount) {
        const signal = this.abortController.signal;
        const candidateUrls = source.urls || [source.url];
        let validUrl = null;
        let contentLength = 0;

        for (const url of candidateUrls) {
            try {
                if (!url) continue;
                const headRes = await fetchWithRetry(
                    url,
                    { method: 'HEAD', credentials: 'include', mode: 'cors', signal: signal },
                    2,
                    1000,
                );

                if (headRes.ok) {
                    validUrl = url;
                    contentLength = parseInt(headRes.headers.get('Content-Length') || '0', 10);
                    if (contentLength > 0) break;
                }

                const probeRes = await fetchWithRetry(
                    url,
                    { headers: { Range: 'bytes=0-0' }, credentials: 'include', mode: 'cors', signal: signal },
                    2,
                    1000,
                );

                if (probeRes.ok && probeRes.status === 206) {
                    validUrl = url;
                    const rangeHeader = probeRes.headers.get('Content-Range');

                    if (rangeHeader) contentLength = parseInt(rangeHeader.split('/')[1], 10) || 0;
                    break;
                }
            } catch (e) {
                if (e.name === 'AbortError') throw e;
                console.warn(`[StoragePipeline] Probe failed for ${url}: ${e.message}`);
            }
        }

        if (!validUrl) throw new Error(`${name} stream probe failed: all candidate URLs unavailable.`);

        if (contentLength > 0) {
            const concurrentFetcher = new ConcurrentFetcher(validUrl, contentLength, signal, threadCount);

            return { reader: concurrentFetcher, length: contentLength };
        }

        const res = await fetchWithRetry(validUrl, { credentials: 'include', mode: 'cors', signal: signal });

        if (!res.ok) throw new Error(`${name} HTTP ${res.status}`);

        return { reader: res.body.getReader(), length: parseInt(res.headers.get('Content-Length') || '0', 10) };
    }

    async triggerDownload(url) {
        await this.offscreenClient.ensureOffscreen();

        return this.offscreenClient.send('TRIGGER_DOWNLOAD', { url: url });
    }

    async preload(taskData, targetType = 'all', onProgress, onCodecSelected, threadCount = 4) {
        this.startTime = Date.now();
        this.rawMode = !!taskData.rawMode;
        await this.offscreenClient.ensureOffscreen();
        let vSource = null;
        let selectedVideoCandidate = null;
        const needVideo = targetType === 'all' || targetType === 'video';

        if (needVideo) {
            const candidates = taskData.video_candidates || (taskData.video ? [taskData.video] : []);

            if (candidates.length > 0) {
                for (const candidate of candidates) {
                    try {
                        vSource = await this._initReader(candidate, 'video', threadCount);
                        selectedVideoCandidate = candidate;
                        if (onCodecSelected) onCodecSelected(candidate);
                        break;
                    } catch (e) {}
                }
            }
        }

        let aSource = null;
        let selectedAudioCandidate = null;
        const needAudio = targetType === 'all' || targetType === 'audio';

        if (needAudio) {
            const candidates = taskData.audio_candidates || (taskData.audio ? [taskData.audio] : []);

            if (candidates.length > 0) {
                let lastError = null;

                for (const candidate of candidates) {
                    try {
                        aSource = await this._initReader(candidate, 'audio', threadCount);
                        selectedAudioCandidate = candidate;

                        break;
                    } catch (e) {
                        console.warn(`[StoragePipeline] Audio Candidate failed: ${candidate.codec_label}`, e);
                        lastError = e;
                    }
                }

                if (!aSource) {
                    throw new Error(`Audio stream unreachable. Last error: ${lastError ? lastError.message : 'Unknown'}`);
                }
            }
        }

        const videoBytes = vSource ? vSource.length : 0;
        const audioBytes = aSource ? aSource.length : 0;
        let currentOperationTotalLen = videoBytes + audioBytes;

        this.estimatedTotalSize = currentOperationTotalLen;

        if (onProgress) {
            onProgress(0, currentOperationTotalLen);
        }

        if (vSource) await this.vStore.init();
        if (aSource) await this.aStore.init();

        if (this.rawMode) {
            if (vSource) {
                const rawPump = async (readerObj, storage, expectedSize) => {
                    const reader = readerObj.reader;
                    let loaded = 0;

                    while (true) {
                        if (this.abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
                        const { done: done, value: value } = await reader.read();

                        if (done) break;

                        if (value && value.length > 0) {
                            await storage.write(value);
                            loaded += value.length;
                            if (onProgress) onProgress(loaded, currentOperationTotalLen);
                        }
                    }

                    this.totalSize = loaded;

                    if (expectedSize > 0 && loaded !== expectedSize) {
                        throw new Error(`Video Raw Download Incomplete: expected ${expectedSize}, got ${loaded}`);
                    }
                };

                await rawPump(vSource, this.vStore, videoBytes);
                this.activeRawStore = this.vStore;
            } else if (aSource) {
                const rawPump = async (readerObj, storage, expectedSize) => {
                    const reader = readerObj.reader;
                    let loaded = 0;

                    while (true) {
                        if (this.abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
                        const { done: done, value: value } = await reader.read();

                        if (done) break;

                        if (value && value.length > 0) {
                            await storage.write(value);
                            loaded += value.length;
                            if (onProgress) onProgress(loaded, currentOperationTotalLen);
                        }
                    }

                    this.totalSize = loaded;

                    if (expectedSize > 0 && loaded !== expectedSize) {
                        throw new Error(`Audio Raw Download Incomplete: expected ${expectedSize}, got ${loaded}`);
                    }
                };

                await rawPump(aSource, this.aStore, audioBytes);
                this.activeRawStore = this.aStore;
            }
        } else {
            const promises = [];

            if (vSource) {
                this.vStream = new StreamReader(vSource.reader, 'video');
                promises.push(this._ingestLoop(this.vStream, 'video', this.vStore, onProgress, currentOperationTotalLen));
            }

            if (aSource) {
                this.aStream = new StreamReader(aSource.reader, 'audio');
                this.hasAudio = true;
                promises.push(this._ingestLoop(this.aStream, 'audio', this.aStore, onProgress, currentOperationTotalLen));
            } else if (targetType === 'all' && !taskData.audio) {
                delete this.tracks.audio;
            }

            await Promise.all(promises);

            if (vSource && videoBytes > 0 && this.vStream) {
                if (this.vStream.totalRead !== videoBytes) {
                    throw new Error(`Video Download Incomplete: Expected ${videoBytes} bytes, got ${this.vStream.totalRead}`);
                }
            }

            if (aSource && audioBytes > 0 && this.aStream) {
                if (this.aStream.totalRead !== audioBytes) {
                    throw new Error(`Audio Download Incomplete: Expected ${audioBytes} bytes, got ${this.aStream.totalRead}`);
                }
            }

            if (needVideo && this.tracks.video.samples.length === 0) throw new Error('No video samples found (Parser Error)');
        }

        if (vSource) await this.vStore.close();
        if (aSource) await this.aStore.close();

        return {
            video: selectedVideoCandidate,
            audio: selectedAudioCandidate,
            videoBytes: videoBytes,
            audioBytes: audioBytes,
        };
    }

    async _ingestLoop(streamReader, trackType, storage, onProgress, totalLen) {
        const track = this.tracks[trackType];
        const processor = new FragmentProcessor();

        while (true) {
            const box = await streamReader.readNextBox();

            if (!box) break;

            if (box.type === 'moov') {
                processor.parseInitSegment(box.data, track);
            } else if (box.type === 'moof') {
                track._pendingMoof = box.data;
            } else if (box.type === 'mdat') {
                if (!track._pendingMoof) continue;
                const samples = processor.extractSamples(track._pendingMoof, box.data, track);

                track._pendingMoof = null;

                if (samples.length > 0) {
                    const baseOffset = await storage.write(box.payload);

                    samples.forEach((s) => {
                        s.offsetInTemp = baseOffset + s.offsetInMdat;
                        delete s.data;
                        delete s.offsetInMdat;
                        track.samples.push(s);
                        track.duration += s.duration;
                    });
                }
            }

            if (onProgress && totalLen > 0) {
                let progressValue = 0;

                if (trackType === 'video' && this.vStream) progressValue = this.vStream.totalRead;
                else if (trackType === 'audio' && this.aStream) progressValue = this.aStream.totalRead;
                if (this.vStream && this.aStream) progressValue = this.vStream.totalRead + this.aStream.totalRead;
                onProgress(progressValue, totalLen);
            }
        }
    }

    async transfer(controller) {
        const CHUNK_READ_SIZE = 16 * 1024 * 1024;

        await this.vStore.init();
        if (this.hasAudio && !this.rawMode) await this.aStore.init();
        if (this.rawMode && this.activeRawStore === this.aStore) await this.aStore.init();

        if (this.rawMode) {
            let currentOffset = 0;
            let remaining = this.totalSize;
            const sourceStore = this.activeRawStore || this.vStore;

            while (remaining > 0) {
                const readSize = Math.min(remaining, CHUNK_READ_SIZE);
                const buffer = await sourceStore.read(currentOffset, readSize);

                if (!buffer || buffer.byteLength === 0) break;
                controller.enqueue(new Uint8Array(buffer));
                remaining -= buffer.byteLength;
                currentOffset += buffer.byteLength;
            }
        } else {
            this._buildChunkTable(this.tracks.video);
            if (this.hasAudio) this._buildChunkTable(this.tracks.audio);
            const allChunks = [];

            allChunks.push(...this.tracks.video.chunks);
            if (this.hasAudio) allChunks.push(...this.tracks.audio.chunks);
            allChunks.sort((a, b) => a.startTime - b.startTime);
            const audioMeta = (this.tracks.audio && this.tracks.audio.meta) || {};
            const videoMeta = (this.tracks.video && this.tracks.video.meta) || {};
            const meta = { ...audioMeta, ...videoMeta };
            const ftyp = MP4Builder.ftyp(this.tracks);

            this._updateChunkOffsets(allChunks, 0);
            let moov = MP4Builder.moov(this.tracks, meta);
            const mdatHeaderSize = 8;
            const dataOffset = ftyp.length + moov.length + mdatHeaderSize;

            this._updateChunkOffsets(allChunks, dataOffset);
            moov = MP4Builder.moov(this.tracks, meta);
            controller.enqueue(ftyp);
            controller.enqueue(moov);
            let totalMdatSize = 0;

            allChunks.forEach((c) => (totalMdatSize += c.size));
            const mdatHeader = new Uint8Array(8);
            const view = new DataView(mdatHeader.buffer);

            BE.w32(view, 0, totalMdatSize + 8);
            BE.wStr(view, 4, 'mdat');
            controller.enqueue(mdatHeader);
            this.totalSize = dataOffset + totalMdatSize;

            for (const chunk of allChunks) {
                const store = chunk.trackType === 'video' ? this.vStore : this.aStore;
                let remaining = chunk.size;
                let currentFileOffset = chunk.fileOffset;

                while (remaining > 0) {
                    const readSize = Math.min(remaining, CHUNK_READ_SIZE);
                    const buffer = await store.read(currentFileOffset, readSize);

                    controller.enqueue(new Uint8Array(buffer));
                    remaining -= readSize;
                    currentFileOffset += readSize;
                }
            }
        }

        controller.close();
    }

    async cleanup() {
        await this.vStore.delete();
        if (this.hasAudio) await this.aStore.delete();
    }

    _buildChunkTable(track) {
        track.chunks = [];
        if (track.samples.length === 0) return;
        let currentChunk = null;

        for (const sample of track.samples) {
            if (!currentChunk || sample.offsetInTemp !== currentChunk.fileOffset + currentChunk.size) {
                if (currentChunk) track.chunks.push(currentChunk);
                currentChunk = {
                    trackType: track.type,
                    fileOffset: sample.offsetInTemp,
                    size: 0,
                    startTime: sample.dts,
                    samples: [],
                    outputOffset: 0,
                };
            }

            currentChunk.size += sample.size;
            currentChunk.samples.push(sample);
        }

        if (currentChunk) track.chunks.push(currentChunk);
    }

    _updateChunkOffsets(chunks, baseOffset) {
        let currentOffset = baseOffset;

        for (const chunk of chunks) {
            chunk.outputOffset = currentOffset;
            currentOffset += chunk.size;
        }
    }
}
