/**
 * @file adapters/bilibili.js
 * @description Bilibili 网站专用适配器 (Content Adapter)
 * * 核心职责 (Core Responsibilities):
 * 1. 元数据嗅探 (Metadata Sniffing):
 * - 运行于页面上下文 (Page Context)，负责提取视频/番剧/课堂/列表的元数据。
 * - 针对 UGC (用户投稿) 采用 `window.__INITIAL_STATE__` 轮询机制，解决 SPA 页面数据滞后问题。
 * - 针对 PGC (番剧/影视) 和 Pugv (付费课堂) 采用 API 主动请求机制获取完整 Season/Episode 信息。
 * * 2. 数据清洗与标准化 (Data Normalization):
 * - 将不同来源 (State/API) 的异构数据统一转换为标准化的 `TaskPayload` 格式。
 * - 执行文件名清洗 (`cleanTitle`)：去除系统非法字符、Unicode 控制字符、首尾空格。
 * - 计算批量下载的目录层级 (`calculateBatchFolderPath`)：Season > Section > Episode。
 * * 3. 密钥同步 (Key Synchronization):
 * - 轮询 `localStorage` 获取 Wbi 签名所需的 img_key 和 sub_key。
 * - 通过 `UPDATE_WBI_KEYS` 消息同步至 Background Service Worker。
 * * 通信链路 (Communication):
 * - Input: 监听来自 Content Script 的 `TRIGGER_SNIFF` 指令。
 * - Output: 通过 `window.postMessage` 向 Content Script 广播 `metadata` (嗅探结果) 或 `SNIFF_FAILURE`。
 * * @author weiyunjun
 * @version v0.1.0
 */


const ADAPTER_NAME = 'SakiDown';

export class BilibiliAdapter {
    constructor() {
        this.init();
    }

    init() {

        window.addEventListener('message', (event) => {
            if (event.source !== window || !event.data || event.data.source !== 'SakiDown') return;

            if (event.data.type === 'TRIGGER_SNIFF') {

                this.sniff();
            }
        });
    }

    syncWbiKeys() {
        if (this._wbiPollTimer) clearInterval(this._wbiPollTimer);
        let attempt = 0;
        const maxAttempts = 25;

        this._wbiPollTimer = setInterval(() => {
            attempt++;

            try {
                const imgUrl = localStorage.getItem('wbi_img_url');
                const subUrl = localStorage.getItem('wbi_sub_url');

                if (imgUrl && subUrl) {
                    clearInterval(this._wbiPollTimer);
                    const img_key = imgUrl.substring(imgUrl.lastIndexOf('/') + 1, imgUrl.lastIndexOf('.'));
                    const sub_key = subUrl.substring(subUrl.lastIndexOf('/') + 1, subUrl.lastIndexOf('.'));

                    window.postMessage(
                        { source: ADAPTER_NAME, type: 'UPDATE_WBI_KEYS', payload: { img_key: img_key, sub_key: sub_key } },
                        '*',
                    );
                } else if (attempt >= maxAttempts) {
                    clearInterval(this._wbiPollTimer);
                }
            } catch (e) {
                clearInterval(this._wbiPollTimer);
            }
        }, 200);
    }

    cleanTitle(standardPayload) {
        const targetFields = ['title', 'season_title', 'section_title', 'episode_title'];

        standardPayload.forEach((payload) => {
            targetFields.forEach((field) => {
                if (payload.metadata[field]) {
                    let text = payload.metadata[field];

                    text = text.replace(/[\\/:*"<>|]/g, '_');
                    text = text.replace(/[?]/g, '？');
                    text = text.replace(/\p{C}/gu, '');
                    text = text.replace(/\s+/g, ' ');
                    text = text.replace(/^[. ~]+|[. ~]+$/g, '');
                    text = text.trim();

                    if (text === '' && field === 'title') {
                        if (payload.metadata.type == 'pgc') {
                            text = `ep` + payload.metadata.ep_id;
                        } else if (payload.metadata.type == 'ugc') {
                            text = payload.metadata.is_multi_part
                                ? payload.metadata.bvid + `_p${payload.metadata.part_num}`
                                : payload.metadata.bvid;
                        }
                    } else if (text === '' && field === 'episode_title') {
                        if (payload.metadata.type == 'pgc') {
                            text = payload.metadata.ep_id;
                        } else if (payload.metadata.type == 'ugc') {
                            text = payload.metadata.bvid;
                        }
                    } else if (text === '' && (field === 'season_title' || field === 'section_title')) {
                        text = null;
                    }

                    payload.metadata[field] = text;
                }
            });
            payload.metadata.collection_title = this.calculateBatchFolderPath(payload.metadata);
        });

        return standardPayload;
    }

    calculateBatchFolderPath(item) {
        if (!item) return null;
        const {
            season_title: season_title,
            section_title: section_title,
            episode_title: episode_title,
            is_multi_part: is_multi_part,
        } = item;
        const parts = [];

        if (season_title) {
            parts.push(season_title);

            if (section_title && section_title !== season_title) {
                parts.push(section_title);
            }

            if (is_multi_part) {
                if (episode_title) parts.push(episode_title);
            }
        } else if (is_multi_part) {
            if (episode_title) parts.push(episode_title);
        }

        return parts.length > 0 ? parts.join('/') : null;
    }

    async _fetchWithTimeout(url, options = {}, timeout = 15000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        options.signal = controller.signal;

        try {
            const response = await fetch(url, options);

            clearTimeout(timeoutId);

            return response;
        } catch (error) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
                throw new Error(`Request Timeout (${timeout}ms)`);
            }

            throw error;
        }
    }

    async sniff() {
        const isSupported = /\/video\/|\/bangumi\/play\/|\/list\/|\/cheese\/play\//.test(location.pathname);

        if (!isSupported) {
            window.postMessage({ source: ADAPTER_NAME, type: 'SNIFF_ERROR', msg: '暂时不支持该页面' }, '*');

            return;
        }

        try {
            const path = location.pathname;
            let meta = null;

            if (path.includes('/bangumi/play/')) {
                const epMatch = path.match(/ep(\d+)/);
                const ssMatch = path.match(/ss(\d+)/);
                let requestId = null;
                let type = null;
                let currentVideo = null;

                if (epMatch) {
                    requestId = Number(epMatch[1]);
                    currentVideo = requestId;
                    type = 'epId';
                } else if (ssMatch) {
                    const scriptsText = [...document.scripts].map((s) => s.textContent || '').join('\n');
                    const epIdMatch = scriptsText.match(/"ep_id"\s*:\s*"?(\d+)"?/);

                    if (epIdMatch) {
                        requestId = Number(epIdMatch[1]);
                        currentVideo = requestId;
                        type = 'epId';
                    } else {
                        requestId = Number(ssMatch[1]);
                        currentVideo = null;
                        type = 'ssId';
                    }
                }

                meta = await this.fetchPgcPlayView(requestId, type);

                if (meta) {
                    let standardPayload = this.buildPgcPayload(meta, currentVideo);

                    standardPayload = this.cleanTitle(standardPayload);
                    this.broadcastData(standardPayload);
                    this.syncWbiKeys();
                }
            } else if (path.includes('/video/')) {
                this.pollUgcState();
                this.syncWbiKeys();
            } else if (path.includes('/list')) {
                let standardPayload = this.buildPlaylistPayload();

                standardPayload = this.cleanTitle(standardPayload);
                this.broadcastData(standardPayload);
                this.syncWbiKeys();
            } else if (path.includes('/cheese/play')) {
                const epMatch = path.match(/ep(\d+)/);
                const ssMatch = path.match(/ss(\d+)/);
                let requestId = null;
                let type = null;
                let currentVideo = null;

                if (epMatch) {requestId = Number(epMatch[1]);
                    currentVideo = requestId;
                    type = 'epId';
                } else if (ssMatch) {
                    requestId = Number(ssMatch[1]);
                    currentVideo = null;
                    type = 'ssId';
                }

                meta = await this.fetchPugvPlayView(requestId, type);

                if (meta) {
                    let standardPayload = this.buildPugvPayload(meta, currentVideo);

                    standardPayload = this.cleanTitle(standardPayload);
                    this.broadcastData(standardPayload);
                    this.syncWbiKeys();
                }
            }
        } catch (e) {
            console.error(`[adapters/bilibili.js] 嗅探流程异常:`, e);
            this._sendFailure(`嗅探发生未知错误: ${e.message}`);
        }
    }

    pollUgcState() {
        let vid = null;
        let partNum = null;
        const url = new URL(location.href);
        const path = url.pathname;
        const ugcMatch = path.match(/\/video\/((BV|av)[a-zA-Z0-9]+)/i);

        if (!ugcMatch) return;

        if (ugcMatch) {
            vid = ugcMatch[1];
            partNum = url.searchParams.get('p') || '1';
        }

        if (this._ugcPollTimer) clearInterval(this._ugcPollTimer);
        let attempt = 0;
        const maxAttempts = 25;

        this._ugcPollTimer = setInterval(() => {
            attempt++;
            const state = window.__INITIAL_STATE__;

            if (state && state.videoData) {
                const isBvidMatch = state.videoData.bvid === vid;
                const isAidMatch = ('av' + state.videoData.aid).toLowerCase() === vid.toLowerCase();

                if (isBvidMatch || isAidMatch) {
                    clearInterval(this._ugcPollTimer);

                    try {
                        const meta = state.videoData;

                        const currentVideo = meta.pages[partNum - 1].cid;
                        let standardPayload = this.buildUgcPayload(meta, currentVideo);

                        standardPayload = this.cleanTitle(standardPayload);
                        this.broadcastData(standardPayload);
                    } catch (e) {
                        console.error(`[adapters/bilibili.js] 内存数据解析失败:`, e);
                    }

                    return;
                }
            }

            if (attempt >= maxAttempts) {
                console.warn(`[adapters/bilibili.js] 内存嗅探超时 (av号或bv号不匹配或数据未加载)`);
                clearInterval(this._ugcPollTimer);
            }
        }, 200);
    }

    buildUgcPayload(meta, currentVideo) {
        if (!meta.ugc_season && meta.pages.length == 1) {
            if (!meta.aid || !meta.bvid || !meta.cid) {
                console.error(`第1个子元素数据异常：缺少关键参数！`);

                return [];
            }

            const singleResult = [
                {
                    metadata: {
                        type: 'ugc',
                        aid: meta.aid,
                        bvid: meta.bvid,
                        cid: meta.cid,
                        ep_id: null,
                        is_current: true,
                        season_title: null,
                        section_title: null,
                        episode_title: null,
                        part_title: null,
                        part_num: 1,
                        is_multi_part: false,
                        title: meta.title,
                        author_mid: meta.owner.mid,
                        author_name: meta.owner.name,
                        author_image: meta.owner.face,
                        author_url: `https://space.bilibili.com/${meta.owner.mid}`,
                        duration: meta.duration,
                        pubdate: meta.pub_time,
                        page_url: `https://www.bilibili.com/video/${meta.bvid}`,
                        cover_url: meta.pic.replace(/^(https?:)?\/\//, 'https://'),
                        thumbnail_url:
              meta.pic.replace(/^(https?:)?\/\//, 'https://') + '@320w_180h_1c_!web-home-common-cover.avif',
                        thumbnail_id: meta.bvid,
                        danmaku_url: `https://comment.bilibili.com/${meta.cid}.xml`,
                    },
                    preference: {},
                    status: {},
                },
            ];

            return singleResult;
        } else if (!meta.ugc_season && meta.pages.length > 1) {
            const pages = meta.pages;
            const MultiPageResult = pages.flatMap((part, index) => {
                if (!meta.aid || !meta.bvid || !part.cid) {
                    console.error(`第 ${index + 1} 个子元素数据异常：缺少关键参数！`);

                    return [];
                }

                let is_current = false;

                if (part.cid === currentVideo) {
                    is_current = true;
                }

                return {
                    metadata: {
                        type: 'ugc',
                        aid: meta.aid,
                        bvid: meta.bvid,
                        cid: part.cid,
                        ep_id: null,
                        is_current: is_current,
                        season_title: null,
                        section_title: null,
                        episode_title: meta.title,
                        part_title: `P${index + 1} ${part.part}`,
                        part_num: index + 1,
                        is_multi_part: true,
                        title: `P${index + 1} ${part.part}`,
                        author_mid: meta.owner.mid,
                        author_name: meta.owner.name,
                        author_image: meta.owner.face,
                        author_url: `https://space.bilibili.com/${meta.owner.mid}`,
                        duration: part.duration,
                        pubdate: meta.pubdate,
                        page_url: `https://www.bilibili.com/video/${meta.bvid}/?p=${index + 1}`,
                        cover_url: meta.pic.replace(/^(https?:)?\/\//, 'https://'),
                        thumbnail_url:
              meta.pic.replace(/^(https?:)?\/\//, 'https://') + '@320w_180h_1c_!web-home-common-cover.avif',
                        thumbnail_id: meta.bvid,
                        danmaku_url: `https://comment.bilibili.com/${part.cid}.xml`,
                    },
                    preference: {},
                    status: {},
                };
            });

            return MultiPageResult;
        } else if (meta.ugc_season) {
            const sections = meta.ugc_season.sections;
            const CollectionResult = sections.flatMap((section) =>
                section.episodes.flatMap((episode) =>
                    episode.pages.flatMap((page, index) => {
                        if (!episode.aid || !episode.bvid || !page.cid) {
                            console.error(`第 ${index + 1} 个子元素数据异常：缺少关键参数！`);

                            return [];
                        }

                        let [is_current, section_title, episode_title, part_title, title, page_url, is_multi_part] = [
                            false,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            false,
                        ];

                        if (page.cid === currentVideo) {
                            is_current = true;
                        }

                        if (sections.length > 1 && section.title) {
                            section_title = section.title;
                        }

                        if (episode.pages.length > 1) {
                            is_multi_part = true;
                            episode_title = episode.title;
                            part_title = `P${index + 1} ${page.part}`;
                            title = `P${index + 1} ${page.part}`;

                            if (index > 0) {
                                page_url = `https://www.bilibili.com/video/${episode.bvid}/?p=${index + 1}`;
                            } else if (index == 0) {
                                page_url = `https://www.bilibili.com/video/${episode.bvid}`;
                            }
                        } else if (episode.pages.length == 1) {
                            page_url = `https://www.bilibili.com/video/${episode.bvid}`;
                            title = episode.title;
                        }

                        return {
                            metadata: {
                                type: 'ugc',
                                aid: episode.aid,
                                bvid: episode.bvid,
                                cid: page.cid,
                                ep_id: null,
                                is_current: is_current,
                                season_title: meta.ugc_season.title,
                                section_title: section_title,
                                episode_title: episode_title,
                                part_title: part_title,
                                part_num: index + 1,
                                is_multi_part: is_multi_part,
                                title: title,
                                author_mid: episode.arc.author.mid,
                                author_name: episode.arc.author.name,
                                author_image: episode.arc.author.face,
                                author_url: `https://space.bilibili.com/${episode.arc.author.mid}`,
                                duration: page.duration,
                                pubdate: episode.arc.pubdate,
                                page_url: page_url,
                                cover_url: episode.arc.pic.replace(/^(https?:)?\/\//, 'https://'),
                                thumbnail_url:
                  episode.arc.pic.replace(/^(https?:)?\/\//, 'https://') + '@320w_180h_1c_!web-home-common-cover.avif',
                                thumbnail_id: episode.bvid,
                                danmaku_url: `https://comment.bilibili.com/${page.cid}.xml`,
                            },
                            preference: {},
                            status: {},
                        };
                    }),
                ),
            );

            return CollectionResult;
        }
    }

    async fetchPgcPlayView(requestId, type) {
        let apiUrl = 'https://api.bilibili.com/pgc/view/web/season?';

        if (requestId && type === 'epId') {
            apiUrl += `ep_id=${requestId}`;
        } else if (requestId && type === 'ssId') {
            apiUrl += `season_id=${requestId}`;
        } else {
            return null;
        }

        try {
            const res = await this._fetchWithTimeout(apiUrl, { credentials: 'include' }, 15000);
            const json = await res.json();

            if (json.code !== 0 || !json.result) {
                console.warn(`API请求失败: ${json.message}`);
                this._sendFailure(`API请求失败: ${json.message}`);

                return null;
            }

            return json.result;
        } catch (e) {
            console.error('API网络请求异常', e);
            this._sendFailure(`API网络请求异常${e.message}`);

            return null;
        }
    }

    buildPgcPayload(meta, currentVideo) {
        let result;
        const { episodes: episodes, title: title } = meta;
        const resultOfEpisodes = episodes.flatMap((episode, index) => {
            if (!episode.aid || !episode.bvid || !episode.cid || !episode.ep_id) {
                console.error(`第 ${index + 1} 个子元素数据异常：缺少关键参数！`);

                return [];
            }

            let [is_current, bangumiTitle, page_url, danmaku_url] = [false, null, null, null];

            if (episode.ep_id === currentVideo) {
                is_current = true;
            }

            page_url = `https://www.bilibili.com/bangumi/play/ep${episode.ep_id}`;
            danmaku_url = `https://comment.bilibili.com/${episode.cid}.xml`;

            if (episode.show_title) {
                bangumiTitle = title + ' ' + episode.show_title;
            } else {
                bangumiTitle = title;
            }

            return {
                metadata: {
                    type: 'pgc',
                    aid: episode.aid,
                    bvid: episode.bvid,
                    cid: episode.cid,
                    ep_id: episode.ep_id,
                    is_current: is_current,
                    season_title: title,
                    section_title: null,
                    episode_title: null,
                    part_title: null,
                    part_num: 1,
                    is_multi_part: false,
                    title: bangumiTitle,
                    author_mid: null,
                    author_name: null,
                    author_image: null,
                    author_url: null,
                    duration: episode.duration / 1000,
                    pubdate: episode.pub_time,
                    page_url: page_url,
                    cover_url: episode.cover.replace(/^(https?:)?\/\//, 'https://'),
                    thumbnail_url:
            episode.cover.replace(/^(https?:)?\/\//, 'https://') + '@320w_180h_1c_!web-home-common-cover.avif',
                    thumbnail_id: episode.ep_id,
                    danmaku_url: danmaku_url,
                },
                preference: {},
                status: {},
            };
        });

        if (!meta.section) {
            result = resultOfEpisodes;
        } else {
            const sections = meta.section;
            const resultOfSections = sections.flatMap((section) =>
                section.episodes.flatMap((episode, index) => {
                    if (!episode.aid || !episode.bvid || !episode.cid || !episode.ep_id) {
                        console.error(`第 ${index + 1} 个子元素数据异常：缺少关键参数！`);

                        return [];
                    }

                    let [is_current, bangumiTitle, page_url, danmaku_url] = [false, null, null, null];

                    if (episode.ep_id === currentVideo) {
                        is_current = true;
                    }

                    page_url = `https://www.bilibili.com/bangumi/play/ep${episode.ep_id}`;
                    danmaku_url = `https://comment.bilibili.com/${episode.cid}.xml`;

                    if (episode.show_title) {
                        bangumiTitle = title + ' ' + episode.show_title;
                    } else {
                        bangumiTitle = title;
                    }

                    return {
                        metadata: {
                            type: 'pgc',
                            aid: episode.aid,
                            bvid: episode.bvid,
                            cid: episode.cid,
                            ep_id: episode.ep_id,
                            is_current: is_current,
                            season_title: title,
                            section_title: section.title,
                            episode_title: null,
                            part_title: null,
                            part_num: 1,
                            is_multi_part: false,
                            title: bangumiTitle,
                            author_mid: null,
                            author_name: null,
                            author_image: null,
                            author_url: null,
                            duration: episode.duration / 1000,
                            pubdate: episode.pub_time,
                            page_url: page_url,
                            cover_url: episode.cover.replace(/^(https?:)?\/\//, 'https://'),
                            thumbnail_url:
                episode.cover.replace(/^(https?:)?\/\//, 'https://') + '@320w_180h_1c_!web-home-common-cover.avif',
                            thumbnail_id: episode.ep_id,
                            danmaku_url: danmaku_url,
                        },
                        preference: {},
                        status: {},
                    };
                }),
            );

            result = [...resultOfEpisodes, ...resultOfSections];
        }

        return result;
    }

    buildPlaylistPayload() {
        const state = window.__INITIAL_STATE__;
        const resourceList = state.resourceList;
        const url = new URL(location.href);
        const path = url.pathname;
        const season_title = state.mediaListInfo.title;
        const playlistResult = resourceList.flatMap((resource) => {
            const hasPages = resource.pages && resource.pages.length > 0;

            if (hasPages) {
                return resource.pages.flatMap((page, index) => {
                    if (!resource.aid || !resource.bvid || !page.cid) {
                        console.error(`第 ${index + 1} 个子元素数据异常：缺少关键参数！`);

                        return [];
                    }

                    let [is_current, episode_title, part_title, title, is_multi_part] = [
                        false,
                        null,
                        null,
                        resource.title,
                        false,
                    ];
                    let page_url = `https://www.bilibili.com/video/${resource.bvid}`;

                    if (page.cid === state.cid) {
                        is_current = true;
                    }

                    if (resource.pages.length > 1) {
                        episode_title = resource.title;
                        part_title = `P${index + 1} ${page.title}`;
                        title = `${part_title}`;
                        is_multi_part = true;

                        if (index > 0) {
                            page_url = `${page_url}&p=${index + 1}`;
                        }
                    }

                    return {
                        metadata: {
                            type: 'ugc',
                            aid: resource.aid,
                            bvid: resource.bvid,
                            cid: page.cid,
                            ep_id: null,
                            is_current: is_current,
                            season_title: season_title,
                            section_title: null,
                            episode_title: episode_title,
                            part_title: part_title,
                            part_num: index + 1,
                            is_multi_part: is_multi_part,
                            title: title,
                            author_mid: null,
                            author_name: null,
                            author_image: null,
                            author_url: null,
                            duration: page.duration,
                            pubdate: null,
                            page_url: page_url,
                            cover_url: resource.cover.replace(/^(https?:)?\/\//, 'https://'),
                            thumbnail_url:
                resource.cover.replace(/^(https?:)?\/\//, 'https://') + `@320w_180h_1c_!web-home-common-cover.avif`,
                            thumbnail_id: resource.bvid,
                            danmaku_url: `https://comment.bilibili.com/${page.cid}.xml`,
                        },
                        preference: {},
                        status: {},
                    };
                });
            } else {
                if (!resource.aid || !resource.bvid || !resource.cid || !resource.episodeId) {
                    console.error(`第1个子元素数据异常：缺少关键参数！`);

                    return [];
                }

                let is_current = false;

                if (resource.cid === state.cid) {
                    is_current = true;
                }

                return [
                    {
                        metadata: {
                            type: 'pgc',
                            aid: resource.aid,
                            bvid: resource.bvid,
                            cid: resource.cid,
                            ep_id: resource.episodeId,
                            is_current: is_current,
                            season_title: season_title,
                            section_title: null,
                            episode_title: null,
                            part_title: null,
                            part_num: 1,
                            is_multi_part: false,
                            title: resource.title,
                            author_mid: null,
                            author_name: null,
                            author_image: null,
                            author_url: null,
                            duration: null,
                            pubdate: null,
                            page_url: `https://www.bilibili.com/bangumi/play/ep${resource.episodeId}`,
                            cover_url: resource.cover.replace(/^(https?:)?\/\//, 'https://'),
                            thumbnail_url:
                resource.cover.replace(/^(https?:)?\/\//, 'https://') + `@320w_180h_1c_!web-home-common-cover.avif`,
                            thumbnail_id: resource.episodeId,
                            danmaku_url: `https://comment.bilibili.com/${resource.cid}.xml`,
                        },
                        preference: {},
                        status: {},
                    },
                ];
            }
        });

        return playlistResult;
    }

    async fetchPugvPlayView(requestId, type) {
        let apiUrl = 'https://api.bilibili.com/pugv/view/web/season?';

        if (requestId && type === 'epId') {
            apiUrl += `ep_id=${requestId}`;
        } else if (requestId && type === 'ssId') {
            apiUrl += `season_id=${requestId}`;
        } else {
            return null;
        }

        try {
            const res = await this._fetchWithTimeout(apiUrl, { credentials: 'include' }, 15000);
            const json = await res.json();

            if (json.code !== 0 || !json.data) {
                console.warn(`API请求失败: ${json.message}`);
                this._sendFailure(`API请求失败: ${json.message}`);

                return null;
            }

            return json.data;
        } catch (e) {
            console.error('API网络请求异常', e);
            this._sendFailure(`API网络请求异常${e.message}`);

            return null;
        }
    }

    buildPugvPayload(meta, currentVideo) {
        const { episodes: episodes, title: title, up_info: up_info } = meta;
        const result = episodes.flatMap((episode, index) => {
            if (!episode.aid || !episode.cid || !episode.id) {
                console.error(`第 ${index + 1} 个子元素数据异常：缺少关键参数！`);

                return [];
            }

            let [is_current, page_url, danmaku_url] = [false, null, null];

            if (episode.id === currentVideo) {
                is_current = true;
            }

            page_url = `https://www.bilibili.com/cheese/play/ep${episode.id}`;
            danmaku_url = `https://comment.bilibili.com/${episode.cid}.xml`;

            return {
                metadata: {
                    type: 'pugv',
                    aid: episode.aid,
                    bvid: null,
                    cid: episode.cid,
                    ep_id: episode.id,
                    is_current: is_current,
                    season_title: title,
                    section_title: null,
                    episode_title: null,
                    part_title: null,
                    part_num: 1,
                    is_multi_part: false,
                    title: episode.title,
                    author_mid: up_info.mid,
                    author_name: up_info.uname,
                    author_image: up_info.avatar,
                    author_url: `https://space.bilibili.com/${up_info.mid}`,
                    duration: episode.duration,
                    pubdate: episode.release_date,
                    page_url: page_url,
                    cover_url: episode.cover.replace(/^(https?:)?\/\//, 'https://'),
                    thumbnail_url:
            episode.cover.replace(/^(https?:)?\/\//, 'https://') + '@320w_180h_1c_!web-home-common-cover.avif',
                    thumbnail_id: episode.id,
                    danmaku_url: danmaku_url,
                },
                preference: {},
                status: {},
            };
        });

        return result;
    }

    _sendFailure(msg) {
        window.postMessage({ source: ADAPTER_NAME, type: 'SNIFF_FAILURE', msg: msg }, '*');
    }

    broadcastData(payload) {

        window.postMessage({ source: ADAPTER_NAME, payload: payload, type: 'metadata' }, '*');
    }
}
new BilibiliAdapter();