/**
 * @file background/bilibili-api.js
 * @description Bilibili API 交互层 (API Interaction Layer)
 * * 核心职责 (Core Responsibilities):
 * 1. 签名与鉴权 (Signing & Auth):
 * - 内置 MD5 算法实现。
 * - 实现 Wbi 签名算法 (`encWbi`)，处理 `mixin_key` 混淆逻辑。
 * - 缓存并自动刷新 Wbi Keys (`getWbiKeys`)，优先使用缓存，失效时主动请求 nav 接口。
 * * 2. 数据获取与标准化 (Fetching & Normalization):
 * - `fetchMetadata`: 获取 UGC/PGC/PUGV 的详细元数据。
 * - `fetchDashStream`: 获取 DASH 流地址，处理 `code:0` 但无流数据的特殊情况 (如充电视频)。
 * - `standardizeStreams`: 清洗流数据，按画质/编码排序，并过滤 PCDN 域名 (如 mcdn, szbdyd)。
 * * @author weiyunjun
 * @version v0.1.0
 */

// ============================================================
// 1. 外部依赖 - MD5 算法实现 (External Library)
// ============================================================
/*
 * A JavaScript implementation of the RSA Data Security, Inc. MD5 Message
 * Digest Algorithm, as defined in RFC 1321.
 * Version 2.2 Copyright (C) Paul Johnston 1999 - 2009
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for more info.
 */
var hexcase=0;

function hex_md5(a){return rstr2hex(rstr_md5(str2rstr_utf8(a)))}

function hex_hmac_md5(a,b){return rstr2hex(rstr_hmac_md5(str2rstr_utf8(a),str2rstr_utf8(b)))}

function md5_vm_test(){return hex_md5("abc").toLowerCase()=="900150983cd24fb0d6963f7d28e17f72"}

function rstr_md5(a){return binl2rstr(binl_md5(rstr2binl(a),a.length*8))}

function rstr_hmac_md5(c,f){var e=rstr2binl(c);

    if(e.length>16){e=binl_md5(e,c.length*8)}

    var a=Array(16),d=Array(16);

    for(var b=0;b<16;b++){a[b]=e[b]^909522486;d[b]=e[b]^1549556828}

    var g=binl_md5(a.concat(rstr2binl(f)),512+f.length*8);

    return binl2rstr(binl_md5(d.concat(g),512+128))}

function rstr2hex(c){try{hexcase}catch(g){hexcase=0}

    var f=hexcase?"0123456789ABCDEF":"0123456789abcdef";var b="";var a;

    for(var d=0;d<c.length;d++){a=c.charCodeAt(d);b+=f.charAt((a>>>4)&15)+f.charAt(a&15)}

    return b}

function str2rstr_utf8(c){var b="";var d=-1;var a,e;

    while(++d<c.length){a=c.charCodeAt(d);e=d+1<c.length?c.charCodeAt(d+1):0;

        if(55296<=a&&a<=56319&&56320<=e&&e<=57343){a=65536+((a&1023)<<10)+(e&1023);d++}

        if(a<=127){b+=String.fromCharCode(a)}else{if(a<=2047){b+=String.fromCharCode(192|((a>>>6)&31),128|(a&63))}else{if(a<=65535){b+=String.fromCharCode(224|((a>>>12)&15),128|((a>>>6)&63),128|(a&63))}else{if(a<=2097151){b+=String.fromCharCode(240|((a>>>18)&7),128|((a>>>12)&63),128|((a>>>6)&63),128|(a&63))}}}}}

    return b}

function rstr2binl(b){var a=Array(b.length>>2);

    for(var c=0;c<a.length;c++){a[c]=0}

    for(var c=0;c<b.length*8;c+=8){a[c>>5]|=(b.charCodeAt(c/8)&255)<<(c%32)}

    return a}

function binl2rstr(b){var a="";

    for(var c=0;c<b.length*32;c+=8){a+=String.fromCharCode((b[c>>5]>>>(c%32))&255)}

    return a}

function binl_md5(p,k){p[k>>5]|=128<<((k)%32);p[(((k+64)>>>9)<<4)+14]=k;var o=1732584193;var n=-271733879;var m=-1732584194;var l=271733878;

    for(var g=0;g<p.length;g+=16){var j=o;var h=n;var f=m;var e=l;

        o=md5_ff(o,n,m,l,p[g+0],7,-680876936);l=md5_ff(l,o,n,m,p[g+1],12,-389564586);m=md5_ff(m,l,o,n,p[g+2],17,606105819);n=md5_ff(n,m,l,o,p[g+3],22,-1044525330);o=md5_ff(o,n,m,l,p[g+4],7,-176418897);l=md5_ff(l,o,n,m,p[g+5],12,1200080426);m=md5_ff(m,l,o,n,p[g+6],17,-1473231341);n=md5_ff(n,m,l,o,p[g+7],22,-45705983);o=md5_ff(o,n,m,l,p[g+8],7,1770035416);l=md5_ff(l,o,n,m,p[g+9],12,-1958414417);m=md5_ff(m,l,o,n,p[g+10],17,-42063);n=md5_ff(n,m,l,o,p[g+11],22,-1990404162);o=md5_ff(o,n,m,l,p[g+12],7,1804603682);l=md5_ff(l,o,n,m,p[g+13],12,-40341101);m=md5_ff(m,l,o,n,p[g+14],17,-1502002290);n=md5_ff(n,m,l,o,p[g+15],22,1236535329);o=md5_gg(o,n,m,l,p[g+1],5,-165796510);l=md5_gg(l,o,n,m,p[g+6],9,-1069501632);m=md5_gg(m,l,o,n,p[g+11],14,643717713);n=md5_gg(n,m,l,o,p[g+0],20,-373897302);o=md5_gg(o,n,m,l,p[g+5],5,-701558691);l=md5_gg(l,o,n,m,p[g+10],9,38016083);m=md5_gg(m,l,o,n,p[g+15],14,-660478335);n=md5_gg(n,m,l,o,p[g+4],20,-405537848);o=md5_gg(o,n,m,l,p[g+9],5,568446438);l=md5_gg(l,o,n,m,p[g+14],9,-1019803690);m=md5_gg(m,l,o,n,p[g+3],14,-187363961);n=md5_gg(n,m,l,o,p[g+8],20,1163531501);o=md5_gg(o,n,m,l,p[g+13],5,-1444681467);l=md5_gg(l,o,n,m,p[g+2],9,-51403784);m=md5_gg(m,l,o,n,p[g+7],14,1735328473);n=md5_gg(n,m,l,o,p[g+12],20,-1926607734);o=md5_hh(o,n,m,l,p[g+5],4,-378558);l=md5_hh(l,o,n,m,p[g+8],11,-2022574463);m=md5_hh(m,l,o,n,p[g+11],16,1839030562);n=md5_hh(n,m,l,o,p[g+14],23,-35309556);o=md5_hh(o,n,m,l,p[g+1],4,-1530992060);l=md5_hh(l,o,n,m,p[g+4],11,1272893353);m=md5_hh(m,l,o,n,p[g+7],16,-155497632);n=md5_hh(n,m,l,o,p[g+10],23,-1094730640);o=md5_hh(o,n,m,l,p[g+13],4,681279174);l=md5_hh(l,o,n,m,p[g+0],11,-358537222);m=md5_hh(m,l,o,n,p[g+3],16,-722521979);n=md5_hh(n,m,l,o,p[g+6],23,76029189);o=md5_hh(o,n,m,l,p[g+9],4,-640364487);l=md5_hh(l,o,n,m,p[g+12],11,-421815835);m=md5_hh(m,l,o,n,p[g+15],16,530742520);n=md5_hh(n,m,l,o,p[g+2],23,-995338651);o=md5_ii(o,n,m,l,p[g+0],6,-198630844);l=md5_ii(l,o,n,m,p[g+7],10,1126891415);m=md5_ii(m,l,o,n,p[g+14],15,-1416354905);n=md5_ii(n,m,l,o,p[g+5],21,-57434055);o=md5_ii(o,n,m,l,p[g+12],6,1700485571);l=md5_ii(l,o,n,m,p[g+3],10,-1894986606);m=md5_ii(m,l,o,n,p[g+10],15,-1051523);n=md5_ii(n,m,l,o,p[g+1],21,-2054922799);o=md5_ii(o,n,m,l,p[g+8],6,1873313359);l=md5_ii(l,o,n,m,p[g+15],10,-30611744);m=md5_ii(m,l,o,n,p[g+6],15,-1560198380);n=md5_ii(n,m,l,o,p[g+13],21,1309151649);o=md5_ii(o,n,m,l,p[g+4],6,-145523070);l=md5_ii(l,o,n,m,p[g+11],10,-1120210379);m=md5_ii(m,l,o,n,p[g+2],15,718787259);n=md5_ii(n,m,l,o,p[g+9],21,-343485551);o=safe_add(o,j);n=safe_add(n,h);m=safe_add(m,f);l=safe_add(l,e)}

    return Array(o,n,m,l)}

function md5_cmn(h,e,d,c,g,f){return safe_add(bit_rol(safe_add(safe_add(e,h),safe_add(c,f)),g),d)}

function md5_ff(g,f,k,j,e,i,h){return md5_cmn((f&k)|((~f)&j),g,f,e,i,h)}

function md5_gg(g,f,k,j,e,i,h){return md5_cmn((f&j)|(k&(~j)),g,f,e,i,h)}

function md5_hh(g,f,k,j,e,i,h){return md5_cmn(f^k^j,g,f,e,i,h)}

function md5_ii(g,f,k,j,e,i,h){return md5_cmn(k^(f|(~j)),g,f,e,i,h)}

function safe_add(a,d){var c=(a&65535)+(d&65535);var b=(a>>16)+(d>>16)+(c>>16);

    return(b<<16)|(c&65535)}

function bit_rol(a,b){return(a<<b)|(a>>>(32-b))}

;

// ============================================================
// 2. 业务逻辑部分
// ============================================================
const API_TIMEOUT = 15000;
const QUALITY_MAP = {
    127: '8K',
    126: '杜比视界',
    125: 'HDR',
    120: '4K',
    116: '1080P',
    112: '1080P+',
    80: '1080P',
    74: '720P',
    64: '720P',
    32: '480P',
    16: '360P',
    6: '240P',
};
const CODEC_MAP = { 7: 'AVC', 12: 'HEVC', 13: 'AV1' };
const MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41,
    13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34,
    44, 52,
];
let cachedWbiKeys = null;
let cachedWbiTime = 0;

async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
    const finalOptions = { ...options, signal: controller.signal };

    try {
        const response = await fetch(url, finalOptions);

        clearTimeout(timeoutId);

        return response;
    } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            throw new Error(`API Request Timeout (${API_TIMEOUT}ms)`);
        }

        throw error;
    }
}

async function getWbiKeys() {
    if (cachedWbiKeys && Date.now() - cachedWbiTime < 7200000) {
        return cachedWbiKeys;
    }

    try {
        const res = await fetchWithTimeout('https://api.bilibili.com/x/web-interface/nav', {
            referrerPolicy: 'no-referrer',
            credentials: 'include',
        });
        const json = await res.json();

        if (json) {

        }

        const isSuccess = json.code === 0;
        const isGuestValid = json.code === -101 && json.data && json.data.wbi_img;

        if ((!isSuccess && !isGuestValid) || !json.data || !json.data.wbi_img) {
            throw new Error(`[background/bilibili-api.js] Wbi Keys获取失败： code=${json.code}`);
        }

        const { img_url: img_url, sub_url: sub_url } = json.data.wbi_img;
        const img_key = img_url.substring(img_url.lastIndexOf('/') + 1, img_url.lastIndexOf('.'));
        const sub_key = sub_url.substring(sub_url.lastIndexOf('/') + 1, sub_url.lastIndexOf('.'));

        cachedWbiKeys = { img_key: img_key, sub_key: sub_key };
        cachedWbiTime = Date.now();

        return cachedWbiKeys;
    } catch (e) {
        console.error('[background/bilibili-api.js] Wbi Keys获取失败：', e);
        throw e;
    }
}

function getMixinKey(orig) {
    let temp = '';

    for (let i = 0; i < MIXIN_KEY_ENC_TAB.length; i++) {
        temp += orig[MIXIN_KEY_ENC_TAB[i]];
    }

    return temp.slice(0, 32);
}

export const BilibiliApi = {
    updateKeys: (keys) => {
        if (keys && keys.img_key && keys.sub_key) {
            cachedWbiKeys = keys;
            cachedWbiTime = Date.now();
        }
    },
    async fetchMetadata(task) {
        try {
            const { img_key: img_key, sub_key: sub_key } = await getWbiKeys();
            const mixin_key = getMixinKey(img_key + sub_key);
            const curr_time = Math.round(Date.now() / 1000);
            let query;
            let baseUrl = 'https://api.bilibili.com/x/web-interface/view';

            if (task.metadata.type === 'ugc') {
                query = `bvid=${task.metadata.bvid}&wts=${curr_time}`;
            } else if (task.metadata.type === 'pgc') {
                baseUrl = 'https://api.bilibili.com/pgc/view/web/season';
                query = `ep_id=${task.metadata.ep_id}&wts=${curr_time}`;
            }

            const wbi_sign = hex_md5(query + mixin_key);
            const apiUrl = `${baseUrl}?${query}&w_rid=${wbi_sign}`;

            const res = await fetchWithTimeout(apiUrl, { credentials: 'include' });
            const json = await res.json();
            const meta = task.metadata.type === 'pgc' ? json.result : json.data;


            if (json.code !== 0 || !meta) {
                const errorMsg = json.message || `API Error: ${json.code}`;
                const error = new Error(errorMsg);

                error.name = 'BilibiliApiError';
                error.code = json.code;
                throw error;
            }

            if (task.metadata.type === 'ugc') {
                let standardPayload = this.buildUgcPayload(meta);

                const targetCid = task.metadata.cid;

                for (const candidateTask of standardPayload) {
                    if (candidateTask.metadata.cid === targetCid) {
                        task.metadata.author_mid = candidateTask.metadata.author_mid;
                        task.metadata.author_name = candidateTask.metadata.author_name;
                        task.metadata.author_image = candidateTask.metadata.author_image;
                        task.metadata.author_url = candidateTask.metadata.author_url;

                        break;
                    }
                }
            } else if (task.metadata.type === 'pgc') {
                let standardPayload = this.buildPgcPayload(meta);
                const targetEp_id = task.metadata.ep_id;

                for (const candidateTask of standardPayload) {
                    if (candidateTask.metadata.ep_id === targetEp_id) {
                        task.metadata.duration = candidateTask.metadata.duration;
                        break;
                    }
                }
            }

            return task;
        } catch (e) {
            console.error('[background/bilibili-api.js] 获取元数据失败：', e);
            throw e;
        }
    },
    buildUgcPayload(meta) {
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
                        is_current: false,
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
                        cover_url: meta.pic,
                        thumbnail_url: meta.pic + '@320w_180h_1c_!web-home-common-cover.avif',
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
                        cover_url: meta.pic,
                        thumbnail_url: meta.pic + '@320w_180h_1c_!web-home-common-cover.avif',
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
                                cover_url: episode.arc.pic,
                                thumbnail_url: episode.arc.pic + '@320w_180h_1c_!web-home-common-cover.avif',
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
    },
    buildPgcPayload(meta) {
        let result;
        const { episodes: episodes, title: title } = meta;
        const resultOfEpisodes = episodes.flatMap((episode, index) => {
            if (!episode.aid || !episode.bvid || !episode.cid || !episode.ep_id) {
                console.error(`第 ${index + 1} 个子元素数据异常：缺少关键参数！`);

                return [];
            }

            let [is_current, bangumiTitle, page_url, danmaku_url] = [false, null, null, null];

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
                    cover_url: episode.cover,
                    thumbnail_url: episode.cover + '@320w_180h_1c_!web-home-common-cover.avif',
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
                            cover_url: episode.cover,
                            thumbnail_url: episode.cover + '@320w_180h_1c_!web-home-common-cover.avif',
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
    },
    async fetchDashStream(bvid, cid, ep_id, type = 'ugc') {
        try {
            const { img_key: img_key, sub_key: sub_key } = await getWbiKeys();
            const mixin_key = getMixinKey(img_key + sub_key);
            const curr_time = Math.round(Date.now() / 1000);
            let query;
            let baseUrl = 'https://api.bilibili.com/x/player/wbi/playurl';

            if (type === 'ugc') {
                query = `bvid=${bvid}&cid=${cid}&fnval=4048&qn=127&wts=${curr_time}`;
            } else if (type === 'pgc') {
                baseUrl = 'https://api.bilibili.com/pgc/player/web/playurl';
                query = `cid=${cid}&fnval=4048&qn=127&wts=${curr_time}`;
            } else if (type === 'pugv') {
                baseUrl = 'https://api.bilibili.com/pugv/player/web/playurl';
                query = `ep_id=${ep_id}&fnval=4048&qn=127&wts=${curr_time}`;
            }

            const wbi_sign = hex_md5(query + mixin_key);
            const apiUrl = `${baseUrl}?${query}&w_rid=${wbi_sign}`;

            const res = await fetchWithTimeout(apiUrl, { credentials: 'include' });
            const json = await res.json();
            const data = type === 'pgc' ? json.result : json.data;

            if (json.code !== 0 || !data) {
                const errorMsg = json.message || `API Error: ${json.code}`;
                const error = new Error(errorMsg);

                error.name = 'BilibiliApiError';
                error.code = json.code;
                throw error;
            }

            if (!data.dash) {
                const error = new Error('NO_DASH_DATA');

                error.name = 'BilibiliApiError';
                error.code = json.code;
                throw error;
            }

            return data;
        } catch (e) {
            console.error('[background/bilibili-api.js] 获取流数据失败：', e);
            throw e;
        }
    },
    standardizeStreams: (data) => {
        const PCDN_BLACKLIST = ['mcdn', 'szbdyd', 'cn-gotcha', 'pcdn', 'bilivideo.cn', 'mountaintoys'];

        const getUrlPriority = (url) => {
            if (!url) return -99;
            if (PCDN_BLACKLIST.some((k) => url.includes(k))) return -10;

            return 0;
        };

        const collectAndSortUrls = (mainUrl, backupUrls) => {
            const list = [mainUrl, ...(backupUrls || [])].filter(Boolean);
            const uniqueList = [...new Set(list)];

            return uniqueList.sort((a, b) => getUrlPriority(b) - getUrlPriority(a));
        };

        if (data.dash) {
            const rawVideos = data.dash.video || [];
            const flacAudio = data.dash.flac?.audio;
            const normalAudios = data.dash.audio || [];
            const rawAudios = flacAudio ? [flacAudio] : normalAudios;
            const videoStreams = rawVideos
                .map((v) => ({
                    id: v.id,
                    urls: collectAndSortUrls(v.baseUrl, v.backup_url),
                    bandwidth: v.bandwidth,
                    width: v.width,
                    height: v.height,
                    frame_rate: v.frame_rate,
                    quality_label: QUALITY_MAP[v.id] || `${v.id}`,
                    codec_label: CODEC_MAP[v.codecid] || 'UNK',
                    codecid: v.codecid,
                }))
                .sort((a, b) => {
                    if (b.id !== a.id) return b.id - a.id;

                    return b.codecid - a.codecid;
                });

            rawAudios.sort((a, b) => b.bandwidth - a.bandwidth);
            const bestAudio = rawAudios[0]
                ? {
                    urls: collectAndSortUrls(rawAudios[0].baseUrl, rawAudios[0].backup_url),
                    bandwidth: rawAudios[0].bandwidth,
                    id: rawAudios[0].id,
                    codec_label: flacAudio && rawAudios[0] === flacAudio ? 'FLAC' : CODEC_MAP[rawAudios[0].codecid] || 'AAC',
                }
                : null;


            return { videos: videoStreams, audio: bestAudio };
        }
    },
};
