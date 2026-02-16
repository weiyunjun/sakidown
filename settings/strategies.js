/**
 * @file settings/strategies.js
 * @description 策略数据模型与常量定义 (Strategy Data Model)
 * * 核心职责 (Core Responsibilities):
 * 1. 常量定义 (Constants Definition):
 * - 定义系统预设策略 ID (`DEFAULT_ID`) 和存储键名 (`STORAGE_KEY`)。
 * - 设定策略名称长度限制 (`NAME_CONSTRAINTS`)。
 * 2. 预设策略 (Default Strategies):
 * - 提供三套开箱即用的系统策略：最佳画质视频、全量下载 (视频+封面+弹幕)、纯音频模式。
 * 3. 校验逻辑 (Validation Logic):
 * - `validateStrategyName`: 执行严格的名称校验，包括字符长度 (中文权重=2) 和非法字符过滤。
 * - `validatestrategy_config`: 确保策略至少包含一项下载内容 (Video/Audio/Cover/Danmaku)。
 * 4. 工厂方法 (Factory Methods):
 * - `createNewStrategy`: 生成带默认参数的新策略对象，用于用户自定义创建。
 * * 通信链路 (Communication):
 * - Role: 纯逻辑模块，被 `StrategiesPanel` 和 `DownloadEngine` 引用，提供数据结构定义。
 * * @author weiyunjun
 * @version v0.1.0
 */

const STRATEGY_CONSTANTS = { DEFAULT_ID: 'default-best-video', STORAGE_KEY: 'downloadStrategies' };

const QUALITY_OPTIONS = [
    { value: 'best', label: '最佳画质' },
    { value: '8k', label: '8K' },
    { value: 'dolby', label: '杜比视界' },
    { value: 'hdr', label: 'HDR' },
    { value: '4k', label: '4K' },
    { value: '1080p', label: '1080P' },
    { value: '720p', label: '720P' },
    { value: '480p', label: '480P' },
    { value: '360p', label: '360P' },
    { value: '240p', label: '240P' },
];

const CODEC_OPTIONS = [
    { value: 'av1', label: 'AV1' },
    { value: 'hevc', label: 'HEVC' },
    { value: 'avc', label: 'AVC' },
];

const STRATEGY_SCHEMA = [
    {
        type: 'section',
        title: '基础信息',
        children: [
            {
                key: 'name',
                type: 'text',
                label: '策略名称',
                placeholder: '请输入策略名称',
                width: '100%',
                layout: 'vertical'
            }
        ]
    },
    {
        type: 'section',
        title: '流媒体下载',
        children: [
            {
                key: 'config.video',
                type: 'switch',
                label: '下载视频画面'
            },
            {
                key: 'config.audio',
                type: 'switch',
                label: '下载音频轨道'
            },
            {
                key: 'config.merge',
                type: 'switch',
                label: '合并音视频',
                note: '将视频和音频流合并为单个文件',
                disabledIf: (data) => !data.config.video || !data.config.audio
            }
        ]
    },
    {
        type: 'section',
        title: '偏好画质',
        // 只有开启视频时才显示画质选择
        showIf: (data) => !!data.config.video,
        children: [
            {
                key: 'config.quality.primary',
                type: 'select',
                label: '首选画质',
                options: QUALITY_OPTIONS,
                layout: 'between'
            },
            {
                key: 'config.quality.secondary',
                type: 'select',
                label: '次选画质',
                options: QUALITY_OPTIONS,
                layout: 'between'
            }
        ]
    },
    {
        type: 'section',
        title: '偏好编码',
        // 只有开启视频时才显示编码选择
        showIf: (data) => !!data.config.video,
        children: [
            {
                key: 'config.codec.primary',
                type: 'select',
                label: '首选编码',
                options: CODEC_OPTIONS,
                layout: 'between'
            },
            {
                key: 'config.codec.secondary',
                type: 'select',
                label: '次选编码',
                options: CODEC_OPTIONS,
                layout: 'between'
            }
        ]
    },
    {
        type: 'section',
        title: '附件下载',
        children: [
            {
                key: 'config.cover',
                type: 'switch',
                label: '视频封面'
            },
            {
                key: 'config.danmaku',
                type: 'switch',
                label: 'XML弹幕'
            }
        ]
    }
];

const NAME_CONSTRAINTS = { MAX_LENGTH: 30 };
const DEFAULT_STRATEGIES = [
    {
        id: 'default-best-video',
        name: '最佳画质视频',
        description: '',
        isSystem: true,
        config: {
            audio: true,
            video: true,
            quality: { primary: 'best', secondary: 'dolby' },
            codec: { primary: 'av1', secondary: 'hevc' },
            merge: true,
            cover: false,
            cover_format: 'jpg',
            danmaku: false,
            danmaku_format: 'xml',
        },
    },
    {
        id: 'default-full-package',
        name: '最佳画质视频+封面+弹幕',
        description: '',
        isSystem: true,
        config: {
            audio: true,
            video: true,
            quality: { primary: 'best', secondary: 'dolby' },
            codec: { primary: 'av1', secondary: 'hevc' },
            merge: true,
            cover: true,
            cover_format: 'jpg',
            danmaku: true,
            danmaku_format: 'xml',
        },
    },
    {
        id: 'default-audio-only',
        name: '纯音频',
        description: '',
        isSystem: true,
        config: {
            audio: true,
            video: false,
            quality: { primary: 'best', secondary: 'dolby' },
            codec: { primary: 'av1', secondary: 'hevc' },
            merge: false,
            cover: false,
            cover_format: 'jpg',
            danmaku: false,
            danmaku_format: 'xml',
        },
    },
];

function validatestrategy_config(config) {
    if (!config) return false;

    return config.video === true || config.audio === true || config.cover === true || config.danmaku === true;
}

function validateStrategyName(name) {
    if (!name || typeof name !== 'string') return { valid: false, msg: '名称不能为空' };
    const trimmed = name.trim();

    if (trimmed.length === 0) return { valid: false, msg: '名称不能为空' };
    let charLength = 0;

    for (let i = 0; i < trimmed.length; i++) {
        charLength += trimmed.charCodeAt(i) > 127 ? 2 : 1;
    }

    if (charLength > NAME_CONSTRAINTS.MAX_LENGTH) {
        return { valid: false, msg: `名称不能超过 ${NAME_CONSTRAINTS.MAX_LENGTH} 个字符 (当前: ${charLength})` };
    }

    const illegalRegex = /[\\/:*?"<>|]/;

    if (illegalRegex.test(trimmed)) {
        return { valid: false, msg: '名称包含非法字符 (\\ / : * ? " < > |)' };
    }

    return { valid: true, name: trimmed };
}

function canMerge(video, audio) {
    return video === true && audio === true;
}

function createNewStrategy() {
    return {
        id: 'custom-' + Date.now(),
        name: '',
        description: '',
        isSystem: false,
        config: {
            audio: true,
            video: true,
            quality: { primary: 'best', secondary: 'dolby' },
            codec: { primary: 'av1', secondary: 'hevc' },
            merge: true,
            cover: false,
            cover_format: 'jpg',
            danmaku: false,
            danmaku_format: 'xml',
        },
    };
}

window.Strategies = {
    STRATEGY_CONSTANTS: STRATEGY_CONSTANTS,
    DEFAULT_STRATEGIES: DEFAULT_STRATEGIES,
    NAME_CONSTRAINTS: NAME_CONSTRAINTS,
    validatestrategy_config: validatestrategy_config,
    validateStrategyName: validateStrategyName,
    canMerge: canMerge,
    createNewStrategy: createNewStrategy,
    STRATEGY_SCHEMA: STRATEGY_SCHEMA,
};