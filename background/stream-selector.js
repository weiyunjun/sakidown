/**
 * @file background/stream-selector.js
 * @description 流媒体选择器 (Stream Selection Strategy)
 * * 核心职责 (Core Responsibilities):
 * 1. 智能选流算法 (Intelligent Selection Algorithm):
 * - 根据用户配置的画质 (`prefQuality`) 和编码 (`prefCodec`) 优先级，从 API 返回的流列表中筛选最佳候选者。
 * - 算法流程：
 * a. 画质过滤 (8K > 4K > 1080P...)。
 * b. 编码排序 (Primary Codec > Secondary Codec > Others)。
 * c. 兜底策略 (若首选不可用，自动降级到次选或最高可用画质)。
 * * 2. 规则匹配 (Rule Matching):
 * - 维护 `CODEC_MAP` (编码ID映射) 和 `QUALITY_REGEX` (画质标签正则)，适配 Bilibili 多变的 API 返回格式。
 * - 支持 "Best" (自动最高) 模式，动态选择当前视频的最高清晰度。
 * * @author weiyunjun
 * @version v0.1.0
 */

const CODEC_MAP = { avc: [7], hevc: [12], av1: [13] };
const CODEC_REGEX = { avc: /avc|h\.?264/i, hevc: /hevc|h\.?265/i, av1: /av1/i };
const QUALITY_REGEX = {
    '8k': /8[kK]|4320[pP]/,
    dolby: /Dolby|杜比/,
    hdr: /HDR/,
    '4k': /4[kK]|2160[pP]/,
    '1080p': /1080[pP]|高清/,
    '720p': /720[pP]/,
    '480p': /480[pP]/,
    '360p': /360[pP]/,
    '240p': /240[pP]/,
};

export class StreamSelector {
    static selectCandidates(streams, config) {
        if (!streams || streams.length === 0) return [];
        const prefQuality = config?.quality || { primary: 'best', secondary: 'dolby' };
        const prefCodec = config?.codec || { primary: 'av1', secondary: 'hevc' };
        let candidates = this._filterByQuality(streams, prefQuality.primary);

        if (candidates.length === 0) {
            candidates = this._filterByQuality(streams, prefQuality.secondary);
        }

        if (candidates.length === 0) {
            const maxQn = Math.max(...streams.map((s) => s.id));

            candidates = streams.filter((s) => s.id === maxQn);
        }

        const result = [];
        const pool = [...candidates];

        const pickAndRemove = (codec) => {
            const matches = this._filterByCodec(pool, codec);

            if (matches.length > 0) {
                matches.sort((a, b) => b.id - a.id || b.bandwidth - a.bandwidth);
                result.push(...matches);
                matches.forEach((m) => {
                    const idx = pool.indexOf(m);

                    if (idx !== -1) pool.splice(idx, 1);
                });
            }
        };

        pickAndRemove(prefCodec.primary);
        pickAndRemove(prefCodec.secondary);

        if (pool.length > 0) {
            pool.sort((a, b) => b.id - a.id || b.bandwidth - a.bandwidth);
            result.push(...pool);
        }

        return result.length > 0 ? result : candidates;
    }

    static _filterByQuality(streams, targetQuality) {
        if (!targetQuality || targetQuality === 'best') {
            const maxQn = Math.max(...streams.map((s) => s.id));

            return streams.filter((s) => s.id === maxQn);
        }

        const regex = QUALITY_REGEX[targetQuality];

        if (!regex) return [];

        return streams.filter((s) => regex.test(s.quality_label));
    }

    static _filterByCodec(candidates, targetCodec) {
        if (!targetCodec) return [];
        const targetIds = CODEC_MAP[targetCodec];
        const targetRegex = CODEC_REGEX[targetCodec];

        if (!targetIds && !targetRegex) return [];

        return candidates.filter((s) => {
            const idMatch = targetIds ? targetIds.some((id) => id == s.codecid) : false;
            const labelMatch = targetRegex && s.codec_label ? targetRegex.test(s.codec_label) : false;

            return idMatch || labelMatch;
        });
    }
}
