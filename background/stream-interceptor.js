/**
 * @file background/stream-interceptor.js
 * @description 虚拟流拦截器 (Virtual Stream Interceptor)
 * * 核心职责 (Core Responsibilities):
 * 1. 请求劫持 (Request Hijacking):
 * - 利用 Service Worker 的 `fetch` 事件，拦截所有发往 `/streams/*` 路径的虚拟请求。
 * - 这是实现无服务器流式下载 (Serverless Streaming Download) 的核心机制。
 * * 2. 流式响应构建 (Streaming Response Construction):
 * - 根据 URL 中的 UUID 从 `TaskRegistry` 提取对应的下载管线 (Pipeline)。
 * - 构建 `ReadableStream`，通过 `pipeline.transfer(controller)` 将 OPFS 中的数据实时分块传输给浏览器下载管理器。
 * * 3. 元数据注入 (Metadata Injection):
 * - 动态设置 `Content-Disposition` 响应头，确保下载的文件名正确 (支持中文及特殊字符)。
 * - 根据文件类型智能推断 `Content-Type` (mp4/m4s/m4a)。
 * * @author weiyunjun
 * @version v0.1.0
 */

import { TaskRegistry } from './task-registry.js';

export function setupInterceptor() {
    self.addEventListener('fetch', (event) => {
        const url = new URL(event.request.url);

        if (!url.pathname.startsWith('/streams/')) return;
        event.respondWith(handleDownloadRequest(url));
    });
}

async function handleDownloadRequest(url) {
    const parts = url.pathname.split('/');
    const uuid = parts[2];

    if (!uuid || !TaskRegistry.has(uuid)) {
        console.warn('[StreamInterceptor] 任务无效或已过期:', uuid);

        return new Response('Download Task Not Found', { status: 404 });
    }

    const taskData = TaskRegistry.get(uuid);

    TaskRegistry.del(uuid);
    const { pipeline: pipeline, title: title, mode: mode, filename: filename } = taskData;
    const finalFilename = filename || title + '.mp4';
    const stream = new ReadableStream({
        async start(controller) {
            const keepAliveInterval = setInterval(() => {

            }, 20000);

            try {
                await pipeline.transfer(controller);
            } catch (err) {
                console.error(`[StreamInterceptor] 传输中断 (${mode}):`, err);
                controller.error(err);
            } finally {
                clearInterval(keepAliveInterval);

                if (pipeline.cleanup) {
                    await pipeline.cleanup();
                }
            }
        },
        cancel(reason) {

            if (pipeline.cleanup) pipeline.cleanup();
        },
    });
    let contentType = 'video/mp4';

    if (finalFilename.endsWith('.m4s')) contentType = 'application/octet-stream';
    if (finalFilename.endsWith('.m4a')) contentType = 'audio/mp4';
    const headers = new Headers({
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(finalFilename)}"`,
    });

    if (mode === 'raw') {
        const size = pipeline.totalSize || pipeline.estimatedTotalSize;

        if (size && size > 0) {
            headers.set('Content-Length', size.toString());
        }
    }

    return new Response(stream, { headers: headers });
}
