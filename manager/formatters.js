/**
 * @file manager/formatters.js
 * @description 数据格式化与清洗工具 (Data Formatters & Normalizer)
 * * 核心职责 (Core Responsibilities):
 * 1. 基础数据格式化 (Basic Formatting):
 * - 提供字节转可读单位 (`formatBytes`), 速度格式化 (`formatSpeed`), 秒数转时分秒 (`formatTime`)。
 * - 时间戳格式化：将毫秒转换为 "2026年x月x日 HH:mm" 格式。
 * * 2. 任务数据标准化 (Task Data Normalization):
 * - `normalizeTaskData`: 核心清洗函数。将后端原始的 `Task` 对象转换为 UI 组件可直接使用的扁平化对象。
 * - 智能回退机制：当 `status.video/audio` 为空时（如等待中），自动回退读取 `candidates` 数组以获取元数据。
 * - 任务类型判定：根据流的存在性 (hasVideo/hasAudio) 和合并策略 (Merge Strategy) 判定显示标签（完整视频/纯视频/纯音频/空壳任务）。
 * * 通信链路 (Communication):
 * - Role: 纯函数工具库，被 `task-card.js` 和 `dom-sync.js` 引用，无外部 I/O。
 * * @author weiyunjun
 * @version v0.1.0
 */

function pad(n) {
    return n.toString().padStart(2, '0');
}

export function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 MB';
    const mb = bytes / 1024 / 1024;

    return mb > 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb.toFixed(1) + ' MB';
}

export function formatSpeed(bytesPerSec) {
    if (!bytesPerSec) return '0 MB/s';
    const mb = bytesPerSec / 1024 / 1024;

    return mb.toFixed(1) + ' MB/s';
}

export function formatTime(seconds) {
    if (!seconds || !isFinite(seconds)) return '--:--:--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatTimestamp(ts) {
    if (!ts) return '--';
    const date = new Date(ts);

    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function normalizeTaskData(task) {
    if (!task || !task.status) return {};
    const status = task.status;
    const meta = task.metadata || {};
    const pref = task.preference || {};
    let vid = status.video;

    if (!vid && status.video_candidates && status.video_candidates.length > 0) {
        vid = status.video_candidates[0];
    }

    vid = vid || {};
    let aud = status.audio;

    if (!aud && status.audio_candidates && status.audio_candidates.length > 0) {
        aud = status.audio_candidates[0];
    }

    aud = aud || {};
    let hasVideo = !!(vid.quality_label || vid.bandwidth);
    let hasAudio = !!(aud.codec_label || aud.bandwidth);
    const strategy = pref.strategy_config || {};

    if (strategy.video === false) hasVideo = false;
    if (strategy.audio === false) hasAudio = false;
    const mergeType = pref.mergeType || 'merged';

    if (mergeType === 'audio_only') hasVideo = false;
    let displayType = 'unknown';
    const typeLabels = [];

    if (mergeType === 'merged' && hasVideo && hasAudio) {
        displayType = 'complete';
        typeLabels.push('完整视频');
    } else if (hasVideo && hasAudio) {
        displayType = 'raw_both';
        typeLabels.push('视频流');
        typeLabels.push('音频流');
    } else if (hasVideo) {
        displayType = 'video_only';
        typeLabels.push('视频流');
    } else if (hasAudio) {
        displayType = 'audio_only';
        typeLabels.push('音频流');
    }

    const isPending = ['pending', 'sniffing', 'idle'].includes(status.phase);

    if (!isPending) {
        const atts = status.attachments || [];

        if (typeLabels.length === 0 && atts.length === 0) {
            typeLabels.push('空壳任务');
        }
    }

    let quality = vid.quality_label;

    if (quality && typeof quality === 'string') {
        quality = quality.replace(/[ +]+(高清|高码率|60帧|HDR|Hi-Res|杜比|全景).*$/i, '').replace(/\+$/, '');
    }

    let codec = vid.codec_label;
    let audioCodec = aud.codec_label || (hasAudio ? 'AAC' : null);
    let fps = vid.frame_rate || '';

    if (fps) {
        const num = parseFloat(fps);

        if (!isNaN(num)) fps = Math.round(num) + '帧';
    }

    const progress = status.progress || {};
    const totalSize = status.phase === 'done' ? status.totalBytes : progress.total;

    return {
        displayType: displayType,
        typeLabels: typeLabels,
        quality: quality,
        codec: codec,
        audioCodec: audioCodec,
        fps: fps,
        status: status.phase,
        statusText: status.phase_text,
        error: status.error,
        totalSize: totalSize || 0,
        loaded: progress.loaded || 0,
        percent: progress.percent || 0,
        speed: progress.speed || 0,
        eta: progress.eta || 0,
        finish_time: status.finish_time || 0,
    };
}
