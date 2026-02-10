/**
 * @file manager/task-card.js
 * @description 任务卡片组件 (Task Card Component)
 * * 核心职责 (Core Responsibilities):
 * 1. 模板渲染 (Template Rendering):
 * - 将标准化的任务数据 (`TaskData`) 转换为 HTML 字符串。
 * - 根据任务状态 (Downloading/Completed/Incomplete) 动态生成操作按钮 (取消/删除/重试/打开文件夹)。
 * - 实现搜索关键字高亮 (`highlight`)：自动包裹匹配的标题和 UP 主名称。
 * * 2. DOM 增量更新 (Incremental DOM Update):
 * - `updateTaskCard`: 仅更新发生变化的 DOM 节点 (如进度条宽度、速度文本、状态文案)，避免整卡重绘导致的闪烁。
 * - 结构完整性检查：若数据结构变化 (如新增了 UP 主信息但 DOM 中不存在)，返回 `false` 触发父级全量重绘。
 * * 3. 状态可视化 (Status Visualization):
 * - 格式化并展示多维度信息：下载速度、预计剩余时间 (ETA)、文件大小、视频编码/清晰度标签。
 * * 通信链路 (Communication):
 * - Input: 接收 `item` (任务对象) 和 `type` (渲染类型)。
 * - Output: 返回 HTML 字符串 (render) 或 Boolean 更新结果 (update)。
 * * @author weiyunjun
 * @version v0.1.0
 */

import { normalizeTaskData, formatSpeed, formatTime, formatBytes, formatTimestamp } from './formatters.js';
let currentSearchKeyword = '';

export function setSearchKeyword(keyword) {
    currentSearchKeyword = (keyword || '').trim().toLowerCase();
}

function highlight(text) {
    if (!text) return '';
    if (!currentSearchKeyword) return text;
    const regex = new RegExp(`(${currentSearchKeyword})`, 'gi');

    return text.replace(regex, '<span class="ud-search-highlight">$1</span>');
}

export function renderTaskCard(item, type) {
    if (!item) return '';
    const data = normalizeTaskData(item);
    const meta = item.metadata || {};
    const status = item.status || {};
    const pref = item.preference || {};
    const uid = status.uid || item.id;
    const rawTitle = meta.title || '未知标题';
    const displayTitle = highlight(rawTitle);
    const thumbId = meta.thumbnail_id;
    const Icons = window.Icons || {};
    const { trash: trash, link: link, folder: folder, refresh: refresh, download: download } = Icons;
    let titleClass = 'ud-card-title';
    let titleDataAttr = '';

    if (type === 'completed') {
        titleClass += ' js-open-file';
        titleDataAttr = `data-uid="${uid}"`;
    }

    let topActionHtml = '';

    if (type === 'downloading' || type === 'waiting') {
        topActionHtml = `<div class="ud-icon-btn js-cancel ud-card-top-action" data-uid="${uid}" data-ud-tooltip="取消">${window.Icons.cancel}</div>`;
    } else {
        topActionHtml = `<div class="ud-icon-btn js-delete ud-card-top-action" data-uid="${uid}" data-ud-tooltip="删除">${trash}</div>`;
    }

    const author_name = meta.author_name;
    const author_url = meta.author_url || 'javascript:void(0);';
    const target = meta.author_url ? '_blank' : '';
    let midLeftNode = '';

    if (author_name) {
        const authorHtml = `\n            <span class="ud-up-tag">UP</span>\n            <a class="ud-author-name" href="${author_url}" target="${target}">${highlight(author_name)}</a>\n        `;

        midLeftNode = `<div class="ud-card-mid-left">${authorHtml}</div>`;
    }

    let midRightHtml = '';

    if (type !== 'incomplete') {
        let tags = [];

        if (data.typeLabels && data.typeLabels.length > 0) {
            data.typeLabels.forEach((label) => {
                tags.push(`<span class="ud-tag">${label}</span>`);
            });
        }

        if (data.quality) tags.push(`<span class="ud-tag">${data.quality}</span>`);
        if (data.fps) tags.push(`<span class="ud-tag">${data.fps}</span>`);
        if (data.codec) tags.push(`<span class="ud-tag">${data.codec}</span>`);
        if (data.audioCodec === 'FLAC') tags.push(`<span class="ud-tag">Hi-Res无损</span>`);

        if (status.attachments) {
            const attMap = { cover: '封面', danmaku: '弹幕', subtitle: '字幕' };

            status.attachments.forEach((att) => {
                const label = attMap[att.type] || att.type;

                tags.push(`<span class="ud-tag">${label}</span>`);
            });
        }

        if (tags.length > 0) {
            midRightHtml = tags.join('');
        }
    }

    let bottomLeftHtml = '';

    const getDownloadInfoHtml = () => {
        const statusText = status.phase_text || '下载中';
        const strategyName = pref.strategy_config?.name || '默认策略';

        return `\n            <div class="text-sm ud-flex-center" style="white-space: nowrap;">\n                <span class="ud-info-pair">\n                    <span class="pair-label">状态：</span>\n                    <span class="pair-value">${statusText}</span>\n                </span>\n                <span class="ud-info-pair">\n                    <span class="pair-label">策略：</span>\n                    <span class="pair-value ud-text-muted">${strategyName}</span>\n                </span>\n            </div>\n        `;
    };

    if (type === 'incomplete') {
        const errorText = status.phase_text || '未知错误';

        bottomLeftHtml = `<div class="ud-card-error text-sm">${errorText}</div>`;
    } else if (type === 'waiting') {
        bottomLeftHtml = getDownloadInfoHtml();
    } else if (type === 'downloading') {
        bottomLeftHtml = getDownloadInfoHtml();
    } else if (type === 'completed') {
        const timeStr = formatTimestamp(status.finish_time);

        bottomLeftHtml = `<div class="text-sm ud-text-muted">${timeStr}</div>`;
    }

    let bottomRightHtml = '';
    const linkBtn = `<div class="ud-icon-btn js-link" data-url="${meta.page_url || ''}" data-ud-tooltip="复制链接">${link}</div>`;

    if (type === 'completed') {
        const folderBtn = `<div class="ud-icon-btn js-folder" data-uid="${uid}" data-ud-tooltip="打开文件夹">${folder}</div>`;

        bottomRightHtml = `${linkBtn}${folderBtn}`;
    } else if (type === 'incomplete') {
        const retryBtn = `<div class="ud-icon-btn js-retry" data-uid="${uid}" data-ud-tooltip="重试">${refresh}</div>`;

        bottomRightHtml = `${retryBtn}${linkBtn}`;
    }

    let progressHtml = '';

    if (type === 'downloading') {
        const progress = status.progress || {};
        const percent = Math.floor(progress.percent || 0);
        const showMetrics = status.phase === 'downloadingAudio' || status.phase === 'downloadingVideo';
        let rightHtml = '';

        if (showMetrics) {
            const speedStr = formatSpeed(data.speed);
            const etaStr = formatTime(data.eta);
            const etaDisplay = etaStr && etaStr !== '--:--:--' ? ` ${etaStr}` : '';
            const speedEta = `${speedStr}${etaDisplay}`;
            const sizeText = formatBytes(data.totalSize);
            const percentText = `${percent}%`;

            rightHtml = `\n                <span class="ud-metric-item">${speedEta}</span>\n                <span class="ud-metric-item">${percentText}</span>\n                <span class="ud-metric-item ud-text-muted">${sizeText}</span>\n            `;
        }

        progressHtml = `\n            <div class="ud-card-progress">\n                <div class="ud-card-progress-info" style="justify-content: flex-end;">\n                    <div class="ud-progress-right">\n                        ${rightHtml}\n                    </div>\n                </div>\n                <div class="ud-progress-container">\n                    <div class="ud-progress-bar" style="width: ${percent}%"></div>\n                </div>\n            </div>\n        `;
    }

    const imgHtml = thumbId ? `<img data-thumb-id="${thumbId}" referrerpolicy="no-referrer">` : '';
    const placeholder = `<div class="ud-thumb-placeholder">${download}</div>`;
    const checkboxHtml = `<input type="checkbox" class="ud-checkbox ud-task-checkbox" data-uid="${uid}">`;

    return `\n        <div class="ud-task-card" data-uid="${uid}">\n            <div class="ud-card-body">\n                <div class="ud-card-thumb">\n                    ${imgHtml}\n                    ${placeholder}\n                    ${checkboxHtml}\n                </div>\n                <div class="ud-card-info" style="height: 112px; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; min-width: 0;">\n                    <div class="ud-card-header-row" style="flex-shrink: 0;">\n                        <div class="${titleClass}" title="${rawTitle}" ${titleDataAttr}>${displayTitle}</div>\n                        ${topActionHtml}\n                    </div>\n                    <div class="ud-card-mid-row">\n                        ${midLeftNode}\n                        <div class="ud-card-mid-right">\n                             ${midRightHtml}\n                        </div>\n                    </div>\n                    <div class="ud-card-bottom-row">\n                        <div class="ud-card-bottom-left">\n                            ${bottomLeftHtml}\n                        </div>\n                        <div class="ud-card-actions">\n                            ${bottomRightHtml}\n                        </div>\n                    </div>\n                </div>\n            </div>\n            ${progressHtml}\n        </div>\n    `;
}

export function updateTaskCard(element, item, type) {
    if (!element || !item) return false;
    const data = normalizeTaskData(item);
    const status = item.status || {};
    const pref = item.preference || {};
    const meta = item.metadata || {};
    const midLeftContainer = element.querySelector('.ud-card-mid-left');
    const hasAuthorInDom = !!midLeftContainer;
    const hasAuthorInNewData = !!meta.author_name;

    if (hasAuthorInDom !== hasAuthorInNewData) {
        return false;
    }

    if (midLeftContainer) {
        const author_name = meta.author_name;
        const author_url = meta.author_url || 'javascript:void(0);';
        const target = meta.author_url ? '_blank' : '';
        const authorHtml = `\n            <span class="ud-up-tag">UP</span>\n            <a class="ud-author-name" href="${author_url}" target="${target}">${highlight(author_name)}</a>\n        `;

        if (midLeftContainer.innerHTML.trim() !== authorHtml.trim()) {
            midLeftContainer.innerHTML = authorHtml;
        }
    }

    const titleEl = element.querySelector('.ud-card-title');

    if (titleEl) {
        const rawTitle = meta.title || '未知标题';
        const newTitleHtml = highlight(rawTitle);

        if (titleEl.innerHTML !== newTitleHtml) {
            titleEl.innerHTML = newTitleHtml;
        }
    }

    const midRightContainer = element.querySelector('.ud-card-mid-right');

    if (midRightContainer) {
        let midRightHtml = '';

        if (type !== 'incomplete') {
            let tags = [];

            if (data.typeLabels && data.typeLabels.length > 0) {
                data.typeLabels.forEach((label) => {
                    tags.push(`<span class="ud-tag">${label}</span>`);
                });
            }

            if (data.quality) tags.push(`<span class="ud-tag">${data.quality}</span>`);
            if (data.fps) tags.push(`<span class="ud-tag">${data.fps}</span>`);
            if (data.codec) tags.push(`<span class="ud-tag">${data.codec}</span>`);
            if (data.audioCodec === 'FLAC') tags.push(`<span class="ud-tag">Hi-Res无损</span>`);

            if (status.attachments) {
                const attMap = { cover: '封面', danmaku: '弹幕', subtitle: '字幕' };

                status.attachments.forEach((att) => {
                    const label = attMap[att.type] || att.type;

                    tags.push(`<span class="ud-tag">${label}</span>`);
                });
            }

            if (tags.length > 0) {
                midRightHtml = tags.join('');
            }
        }

        if (midRightContainer.innerHTML.trim() !== midRightHtml.trim()) {
            midRightContainer.innerHTML = midRightHtml;
        }
    }

    const bottomLeft = element.querySelector('.ud-card-bottom-left');

    if (bottomLeft) {
        let contentHtml = '';

        const getDownloadInfoHtml = () => {
            const statusText = status.phase_text || '下载中';
            const strategyName = pref.strategy_config?.name || '默认策略';

            return `\n                <div class="text-sm ud-flex-center" style="white-space: nowrap;">\n                    <span class="ud-info-pair">\n                        <span class="pair-label">状态：</span>\n                        <span class="pair-value">${statusText}</span>\n                    </span>\n                    <span class="ud-info-pair">\n                        <span class="pair-label">策略：</span>\n                        <span class="pair-value ud-text-muted">${strategyName}</span>\n                    </span>\n                </div>\n            `;
        };

        if (type === 'incomplete') {
            const errorText = status.phase_text || '未知错误';

            contentHtml = `<div class="ud-card-error text-sm">${errorText}</div>`;
        } else if (type === 'waiting') {
            contentHtml = getDownloadInfoHtml();
        } else if (type === 'downloading') {
            contentHtml = getDownloadInfoHtml();
        } else if (type === 'completed') {
            const timeStr = formatTimestamp(status.finish_time);

            contentHtml = `<div class="text-sm ud-text-muted">${timeStr}</div>`;
        }

        if (bottomLeft.innerHTML !== contentHtml) {
            bottomLeft.innerHTML = contentHtml;
        }
    }

    const actionsContainer = element.querySelector('.ud-card-actions');

    if (actionsContainer && type === 'completed') {
        const Icons = window.Icons || {};
        const { link: link, folder: folder } = Icons;
        const uid = status.uid || item.id;
        const linkBtn = `<div class="ud-icon-btn js-link" data-url="${meta.page_url || ''}" data-ud-tooltip="复制链接">${link}</div>`;
        const folderBtn = `<div class="ud-icon-btn js-folder" data-uid="${uid}" data-ud-tooltip="打开文件夹">${folder}</div>`;
        const newHtml = `${linkBtn}${folderBtn}`;

        if (actionsContainer.innerHTML !== newHtml) {
            actionsContainer.innerHTML = newHtml;
        }
    }

    if (type === 'downloading') {
        const progressInfo = element.querySelector('.ud-card-progress-info');
        const progressBar = element.querySelector('.ud-progress-bar');

        if (progressInfo) {
            const showMetrics = status.phase === 'downloadingAudio' || status.phase === 'downloadingVideo';
            let rightHtml = '';

            if (showMetrics) {
                const speedStr = formatSpeed(data.speed);
                const etaStr = formatTime(data.eta);
                const etaDisplay = etaStr && etaStr !== '--:--:--' ? ` ${etaStr}` : '';
                const speedEta = `${speedStr}${etaDisplay}`;
                const percentText = `${Math.floor(data.percent)}%`;
                const sizeText = formatBytes(data.totalSize);

                rightHtml = `\n                    <span class="ud-metric-item">${speedEta}</span>\n                    <span class="ud-metric-item">${percentText}</span>\n                    <span class="ud-metric-item ud-text-muted">${sizeText}</span>\n                `;
            }

            const currentRight = progressInfo.querySelector('.ud-progress-right');

            if (currentRight && currentRight.innerHTML !== rightHtml) currentRight.innerHTML = rightHtml;
        }

        if (progressBar) {
            const newWidth = `${Math.floor(data.percent)}%`;

            if (progressBar.style.width !== newWidth) {
                progressBar.style.width = newWidth;
            }
        }
    }

    return true;
}
