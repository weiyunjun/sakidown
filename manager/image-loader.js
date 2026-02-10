/**
 * @file manager/image-loader.js
 * @description OPFS 图片懒加载管理器 (OPFS Image Loader)
 * * 核心职责 (Core Responsibilities):
 * 1. OPFS 读取 (File System Access):
 * - 直接访问 Origin Private File System，读取存储的封面图片 (`.avif`)。
 * * 2. 内存缓存策略 (Memory Caching):
 * - 维护 `thumbnailCache` (Map<id, url>)，避免对同一张图片重复创建 Blob URL，减少内存泄漏风险。
 * - 提供 `removeThumbnail` 供外部在删除任务时主动清理缓存。
 * * 3. 懒加载渲染 (Lazy Loading):
 * - `loadThumbnailsFromOpfs`: 扫描容器内无 `src` 的 `img[data-thumb-id]` 节点并填充 Blob URL。
 * - 处理图片加载成功/失败的样式切换 (显示图片 vs 隐藏占位符)。
 * * 通信链路 (Communication):
 * - Input: `loadThumbnailsFromOpfs(container)` 被各个 View 渲染函数调用。
 * - Output: 读取 OPFS 文件句柄，修改 DOM 节点的 src 属性。
 * * @author weiyunjun
 * @version v0.1.0
 */

const thumbnailCache = new Map();

function _applyImgSrc(img, url) {
    if (img.src === url) return;
    img.src = url;
    img.style.display = 'block';
    requestAnimationFrame(() => {
        img.style.opacity = '1';
    });
    const placeholder = img.parentElement.querySelector('.ud-thumb-placeholder');

    if (placeholder) placeholder.style.display = 'none';
}

export function removeThumbnail(thumbId) {
    if (!thumbId) return;

    if (thumbnailCache.has(thumbId)) {
        const url = thumbnailCache.get(thumbId);

        URL.revokeObjectURL(url);
        thumbnailCache.delete(thumbId);
    }
}

export async function loadThumbnailsFromOpfs(container) {
    if (!container) return;
    const targetImgs = container.querySelectorAll('img[data-thumb-id]:not([src])');

    if (targetImgs.length === 0) return;
    let root = null;

    for (const img of targetImgs) {
        const id = img.dataset.thumbId;

        if (!id) continue;

        if (thumbnailCache.has(id)) {
            _applyImgSrc(img, thumbnailCache.get(id));
            continue;
        }

        try {
            if (!root) root = await navigator.storage.getDirectory();
            const handle = await root.getFileHandle(`${id}.avif`);
            const file = await handle.getFile();

            if (file.size > 0) {
                const url = URL.createObjectURL(file);

                thumbnailCache.set(id, url);
                _applyImgSrc(img, url);
            }
        } catch (e) {}
    }
}
