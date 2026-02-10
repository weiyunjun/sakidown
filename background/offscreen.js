/**
 * @file background/offscreen.js
 * @description Offscreen Document 逻辑控制 (IO Bridge & Audio Player)
 * * 核心职责 (Core Responsibilities):
 * 1. IO 中转桥梁 (IO Worker Bridge):
 * - 作为 Service Worker 和 Web Worker (IO-Worker) 之间的通信中继。由于 Service Worker 无法直接创建访问 OPFS 的 SyncAccessHandle，必须通过 Offscreen Document 间接调用。
 * - `handlePipelineMessage`: 接收 Service Worker 的指令，转发给 `worker`，并将结果通过 `MessageChannel` 或 `postMessage` 回传。
 * * 2. 音频播放服务 (Audio Playback Service):
 * - 响应 `PLAY_SOUND` 消息，根据配置播放默认音效或用户自定义音效 (从 IndexedDB 读取 Blob)。
 * - 实现播放互斥逻辑 (`currentAudio`)：当播放新音效时，自动停止并销毁上一首音频，防止声音重叠和内存泄漏。
 * * 3. 隐式下载触发 (Implicit Download Trigger):
 * - `triggerDownload`: 通过创建隐藏的 `iframe` 来触发下载请求，作为 `chrome.downloads` 的备用方案或特定场景下的触发器。
 * * @author weiyunjun
 * @version v0.1.0
 */

const worker = new Worker(chrome.runtime.getURL('core/io-worker.js'), { type: 'module' });
let currentAudio = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.target === 'OFFSCREEN' && msg.type === 'PLAY_SOUND') {
        playCompletionSound(msg.payload);
    }
});
navigator.serviceWorker.addEventListener('message', (event) => {
    const msg = event.data;

    if (!msg || msg.target !== 'OFFSCREEN') return;

    if (msg.data.type === 'TRIGGER_DOWNLOAD') {
        const url = msg.data.payload.url;

        triggerDownload(url);
        const port = event.ports[0];

        if (port) port.postMessage({ payload: 'ok' });

        return;
    }

    handlePipelineMessage(msg.data, event);
});

async function playCompletionSound(config = {}) {
    try {

        if (currentAudio) {

            currentAudio.pause();
            currentAudio.currentTime = 0;

            if (currentAudio.src && currentAudio.src.startsWith('blob:')) {
                URL.revokeObjectURL(currentAudio.src);
            }

            currentAudio = null;
        }

        let rawVolume = config.sound_volume;

        if (rawVolume === undefined || rawVolume === null) {
            rawVolume = 0.5;
        }

        if (rawVolume > 100) rawVolume = 100;
        if (rawVolume < 0) rawVolume = 0;
        const finalVolume = rawVolume;

        const selectedId = config.sound_selected || 'default';
        let playUrl = '';

        if (selectedId === 'default') {
            playUrl = chrome.runtime.getURL('assets/default.wav');
        } else {
            try {
                const { appDB: appDB } = await import('../lib/db.js');
                const record = await appDB.get('assets', selectedId);

                if (record && record.blob) {
                    playUrl = URL.createObjectURL(record.blob);
                }
            } catch (e) {
                console.warn('[Offscreen] DB读取失败:', e);
            }
        }

        if (playUrl) {
            const audio = new Audio(playUrl);

            currentAudio = audio;
            audio.volume = finalVolume;

            audio.onerror = (e) => {
                console.error('[Offscreen] Audio Error:', e);
                if (currentAudio === audio) currentAudio = null;
            };

            await audio.play();

            audio.onended = () => {
                if (playUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(playUrl);
                }

                if (currentAudio === audio) {
                    currentAudio = null;
                }
            };
        }
    } catch (e) {
        console.error('[Offscreen] Playback failed:', e);
    }
}

function triggerDownload(url) {

    const iframe = document.createElement('iframe');

    iframe.src = url;
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    setTimeout(() => iframe.remove(), 60000);
}

async function handlePipelineMessage(data, originalEvent) {
    const { id: id, type: type, payload: payload } = data;

    const workerResponseHandler = (e) => {
        const workerData = e.data;

        if (workerData.id === id) {
            worker.removeEventListener('message', workerResponseHandler);
            const responsePayload = { id: id, payload: workerData.data, error: workerData.error };
            const transferList = [];

            if (workerData.data instanceof ArrayBuffer) {
                transferList.push(workerData.data);
            }

            const port = originalEvent.ports[0];

            if (port) {
                port.postMessage(responsePayload, transferList);
            } else {
                const targetClient = originalEvent.source || navigator.serviceWorker.controller;

                if (targetClient) {
                    targetClient.postMessage({ type: 'IO_RESPONSE', ...responsePayload }, transferList);
                }
            }
        }
    };

    worker.addEventListener('message', workerResponseHandler);
    let workerPayload = payload;
    let transferList = [];

    if (type === 'WRITE' && payload.buffer instanceof ArrayBuffer) {
        transferList.push(payload.buffer);
    }

    worker.postMessage({ id: id, type: type, payload: workerPayload }, transferList);
}

setInterval(() => {}, 20000);

