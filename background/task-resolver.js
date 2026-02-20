/**
 * @file background/task-resolver.js
 * @description 任务解析器 (Task Resolver)
 * * 核心职责 (Core Responsibilities):
 * 1. 元数据补全 (Metadata Completion):
 * - 检查任务元数据是否完整 (如缺 `author_mid` 或 `duration`)，必要时调用 `BilibiliApi` 补充。
 * - 针对 Pugv (课堂) 或 PGC (番剧) 等特殊类型，执行特定的后端解析逻辑 (`_performBackendResolve`)。
 * * 2. 流地址获取 (Stream Fetching):
 * - 根据 `strategy_config` (画质/编码偏好) 决定是否需要获取 DASH 流地址。
 * - 调用 API 获取 `playurl`，并对返回的音视频流进行标准化处理。
 * * 3. 策略应用 (Strategy Application):
 * - 调用 `StreamSelector` 根据用户偏好 (如 "首选 AV1", "次选 HEVC") 筛选最佳视频流。
 * - 检查并生成附件 (封面、弹幕) 的下载任务 (`_checkAttachments`)。
 * * @author weiyunjun
 * @version v0.1.0
 */

import { BilibiliApi } from './bilibili-api.js';
import { StreamSelector } from './stream-selector.js';
class TaskResolver {
    async resolve(task, hostTabId) {
        if (
            (task.metadata.aid && task.metadata.cid && task.metadata.bvid && task.metadata.type) ||
      (task.metadata.aid && task.metadata.cid && task.metadata.type === `pugv`)
        ) {
            await this._performBackendResolve(task);
        }

        if (!task.status.video && task.status.streams && task.status.streams.length > 0) {
            this._applySelectionStrategy(task);
        }

        if (task.preference.strategy_config) {
            if (task.preference.strategy_config.audio === false) task.status.audio = null;
            if (task.preference.strategy_config.video === false) task.status.video = null;
        }

        this._checkAttachments(task);

    }

    async _performBackendResolve(task) {
        if (!task.metadata.duration || !task.metadata.pubdate) {
            task = await BilibiliApi.fetchMetadata(task);
        }

        if (
            task.preference.strategy_config &&
      (task.preference.strategy_config.audio !== false || task.preference.strategy_config.video !== false)
        ) {
            task.status.phase_text = '解析流地址...';
            const { bvid: bvid, cid: cid, ep_id: ep_id, type: type } = task.metadata;
            const rawData = await BilibiliApi.fetchDashStream(bvid, cid, ep_id, type);
            const resolved = BilibiliApi.standardizeStreams(rawData);

            task.status.streams = resolved.videos;

            if (resolved.audio) {
                task.status.audio = resolved.audio;
                task.status.audio_candidates = [resolved.audio];
            }
        }
    }

    _applySelectionStrategy(task) {
        if (task.preference.strategy_config.video) {
            if (task.preference.strategy_config) {
                const candidates = StreamSelector.selectCandidates(task.status.streams, task.preference.strategy_config);

                task.status.video_candidates = candidates;
                task.status.video = candidates.length > 0 ? candidates[0] : task.status.streams[0];
            } else {
                task.status.video_candidates = task.status.streams;
                task.status.video = task.status.streams[0];
            }
        }
    }

    _checkAttachments(task) {
        task.status.attachments = [];
        const config = task.preference.strategy_config || {};

        if (config.cover && task.metadata.cover_url) {
            let fmt = 'jpg';
            const reqFmt = config.cover_format || 'jpg';

            if (reqFmt === 'jpg') {
                fmt = 'jpg';
            } else {
                fmt = 'jpg';
            }

            task.status.attachments.push({
                type: 'cover',
                format: fmt,
                status: 'pending',
            });
        }

        if (config.danmaku && task.metadata.danmaku_url) {
            let fmt = 'xml';
            const reqFmt = config.danmaku_format || 'xml';

            if (reqFmt === 'xml') {
                fmt = 'xml';
            } else {
                fmt = 'xml';
            }

            task.status.attachments.push({
                type: 'danmaku',
                format: fmt,
                status: 'pending',
            });
        }
    }
}

export const taskResolver = new TaskResolver();