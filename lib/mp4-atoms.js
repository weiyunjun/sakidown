/**
 * @file lib/mp4-atoms.js
 * @description MP4 Box 解析与构建 (MP4 Atom Parser & Builder)
 * * 核心职责 (Core Responsibilities):
 * 1. Box 解析器 (Parser):
 * - `findBox`: 在二进制流中递归查找特定的 Box (如 `moov.trak.mdia.minf`).
 * - 解析关键 Box 内容：`mdhd` (Timescale), `tfdt` (Base Media Decode Time), `udta` (User Metadata).
 * * 2. Box 构建器 (Builder):
 * - 提供了生成 MP4 标准 Box 的静态方法 (`ftyp`, `moov`, `trak`, `mdat` 等)。
 * - 在导出阶段 (`StoragePipeline.transfer`)，使用此模块动态生成符合 ISO Base Media File Format (ISO/IEC 14496-12) 标准的文件头和索引表 (`stbl`, `stco`, `stsz` 等)。
 * * @author weiyunjun
 * @version v0.1.0
 */

import { BE, ByteStream } from './io-buffer.js';

export const Parser = {
    findBox: (buffer, path) => {
        const stream = new ByteStream(buffer);
        let currentTarget = path[0];
        let depth = 0;

        while (stream.remaining > 0) {
            const box = stream.readBoxHeader();

            if (!box) break;

            if (box.type === currentTarget) {
                const payloadSize = box.size - box.headerSize;
                const payloadStart = stream.cursor;

                if (depth === path.length - 1) {
                    return {
                        offset: stream.cursor - box.headerSize,
                        size: box.size,
                        headerSize: box.headerSize,
                        payload: stream.buffer.subarray(payloadStart, payloadStart + payloadSize),
                    };
                } else {
                    const subBuffer = stream.buffer.subarray(payloadStart, payloadStart + payloadSize);
                    const subRes = Parser.findBox(subBuffer, path.slice(1));

                    if (subRes) {
                        subRes.offset += payloadStart;

                        return subRes;
                    }
                }
            }

            stream.seek(box.start + box.size);
            depth = 0;
            currentTarget = path[0];
        }

        return null;
    },
    parseTfhdDefaultDuration: (boxData) => {
        const stream = new ByteStream(boxData);
        const verAndFlags = stream.readU32();
        const flags = verAndFlags & 16777215;

        stream.skip(4);
        if (flags & 1) stream.skip(8);
        if (flags & 2) stream.skip(4);
        if (flags & 8) return stream.readU32();

        return 0;
    },
    parseMdhdTimescale: (boxData) => {
        const stream = new ByteStream(boxData);
        const verAndFlags = stream.readU32();
        const version = (verAndFlags >> 24) & 255;

        if (version === 1) stream.skip(16);
        else stream.skip(8);

        return stream.readU32();
    },
    parseTfdtTime: (boxData) => {
        const stream = new ByteStream(boxData);
        const verAndFlags = stream.readU32();
        const version = (verAndFlags >> 24) & 255;

        if (version === 1) return Number(stream.readU64());
        else return stream.readU32();
    },
    parseUserMetadata: (moovPayload) => {
        const result = {};

        if (!moovPayload) return result;
        const udta = Parser.findBox(moovPayload, ['udta']);

        if (!udta) return result;
        const meta = Parser.findBox(udta.payload, ['meta']);

        if (!meta) return result;
        let metaPayload = meta.payload.subarray(4);
        let ilst = Parser.findBox(metaPayload, ['ilst']);

        if (!ilst) {
            metaPayload = meta.payload;
            ilst = Parser.findBox(metaPayload, ['ilst']);
        }

        if (!ilst) return result;
        const stream = new ByteStream(ilst.payload);

        while (stream.remaining > 0) {
            const box = stream.readBoxHeader();

            if (!box) break;
            const itemPayload = stream.readBoxSlice(box.size - box.headerSize);
            const dataBox = Parser.findBox(itemPayload, ['data']);

            if (dataBox && dataBox.payload.length > 8) {
                const view = new DataView(dataBox.payload.buffer, dataBox.payload.byteOffset, dataBox.payload.byteLength);
                const dataType = BE.r32(view, 0);

                if (dataType === 1) {
                    const valBytes = dataBox.payload.subarray(8);
                    const str = new TextDecoder().decode(valBytes);

                    if (box.type === '©too' || box.type === 'tool') {
                        result.tool = str;
                        result.toolKey = box.type;
                    }

                    const descTags = ['sdes', 'desc', '©des', '©swr', '©enc', '©cmt', 'sdesc'];

                    if (descTags.includes(box.type)) {
                        if (!result.description || ['sdes', 'desc', 'sdesc'].includes(box.type)) {
                            result.description = str;
                            result.descKey = box.type;
                        }
                    }
                }
            }
        }

        return result;
    },
};

export const Builder = {
    create: (type, data) => {
        const len = 8 + data.length;
        const buf = new Uint8Array(len);
        const view = new DataView(buf.buffer);

        BE.w32(view, 0, len);
        BE.wStr(view, 4, type);
        buf.set(data, 8);

        return buf;
    },
    container: (type, children) => {
        let size = 0;

        children.forEach((c) => (size += c.byteLength));
        const buf = new Uint8Array(8 + size);
        const view = new DataView(buf.buffer);

        BE.w32(view, 0, 8 + size);
        BE.wStr(view, 4, type);
        let offset = 8;

        children.forEach((c) => {
            buf.set(c, offset);
            offset += c.byteLength;
        });

        return buf;
    },
    trex: (trackId) => {
        const buf = new Uint8Array(32);
        const view = new DataView(buf.buffer);

        BE.w32(view, 0, 32);
        BE.wStr(view, 4, 'trex');
        BE.w32(view, 12, trackId);
        BE.w32(view, 16, 1);

        return buf;
    },
};

export const MP4Builder = {
    ftyp: (tracks) => {
        let major = 'isom';
        let minor = 512;
        let brands = ['isom', 'iso2', 'avc1', 'mp41'];

        if (tracks && tracks.video) {
            const codec = (tracks.video.codec || '').toLowerCase();

            if (codec.includes('av01')) {
                major = 'isom';
                brands = ['isom', 'iso2', 'av01', 'mp41'];
            } else if (codec.includes('hvc1') || codec.includes('hev1')) {
                major = 'mp42';
                brands = ['isom', 'iso2', 'mp41', 'hvc1'];
            } else if (codec.includes('avc1')) {
                major = 'isom';
                brands = ['isom', 'iso2', 'avc1', 'mp41'];
            }
        }

        const size = 8 + 4 + 4 + brands.length * 4;
        const buf = new Uint8Array(size);
        const view = new DataView(buf.buffer);

        BE.w32(view, 0, size);
        BE.wStr(view, 4, 'ftyp');
        BE.wStr(view, 8, major);
        BE.w32(view, 12, minor);
        let offset = 16;

        for (const b of brands) {
            BE.wStr(view, offset, b);
            offset += 4;
        }

        return buf;
    },
    moov: (tracks, meta = {}) => {
        const children = [];
        const vTrack = tracks.video;
        const MOVIE_TIMESCALE = 1000;
        let maxDurationSec = vTrack.duration / vTrack.timescale;

        if (tracks.audio) {
            const aDur = tracks.audio.duration / tracks.audio.timescale;

            if (aDur > maxDurationSec) maxDurationSec = aDur;
        }

        const movieDuration = Math.floor(maxDurationSec * MOVIE_TIMESCALE);

        children.push(MP4Builder.mvhd(MOVIE_TIMESCALE, movieDuration));
        children.push(MP4Builder.trak(vTrack, MOVIE_TIMESCALE));
        if (tracks.audio) children.push(MP4Builder.trak(tracks.audio, MOVIE_TIMESCALE));
        const udtaBox = MP4Builder.udta(meta);

        if (udtaBox) {
            children.push(udtaBox);
        }

        return MP4Builder.box('moov', children);
    },
    mvhd: (timescale, duration) => {
        const buf = new Uint8Array(108);
        const view = new DataView(buf.buffer);

        BE.w32(view, 0, 108);
        BE.wStr(view, 4, 'mvhd');
        BE.w32(view, 20, timescale);
        BE.w32(view, 24, duration);
        BE.w32(view, 28, 65536);
        BE.w16(view, 32, 256);
        BE.w32(view, 48, 65536);
        BE.w32(view, 64, 65536);
        BE.w32(view, 80, 1073741824);
        BE.w32(view, 104, 3);

        return buf;
    },
    udta: (meta) => {
        const ilstChildren = [];

        if (meta.tool) {
            const key = meta.toolKey || '©too';

            ilstChildren.push(MP4Builder.metadataItem(key, meta.tool));
        }

        if (meta.description) {
            const key = meta.descKey || 'sdes';

            ilstChildren.push(MP4Builder.metadataItem(key, meta.description));
        }

        if (ilstChildren.length === 0) return null;
        const ilst = MP4Builder.box('ilst', ilstChildren);
        const hdlrBuf = new Uint8Array(33);
        const hView = new DataView(hdlrBuf.buffer);

        BE.w32(hView, 0, 33);
        BE.wStr(hView, 4, 'hdlr');
        BE.w32(hView, 8, 0);
        BE.w32(hView, 12, 0);
        BE.wStr(hView, 16, 'mdir');
        BE.wStr(hView, 20, 'appl');
        const metaChildrenSize = hdlrBuf.byteLength + ilst.byteLength;
        const metaBuf = new Uint8Array(12 + metaChildrenSize);
        const mView = new DataView(metaBuf.buffer);

        BE.w32(mView, 0, 12 + metaChildrenSize);
        BE.wStr(mView, 4, 'meta');
        BE.w32(mView, 8, 0);
        metaBuf.set(hdlrBuf, 12);
        metaBuf.set(ilst, 12 + hdlrBuf.byteLength);

        return MP4Builder.box('udta', [metaBuf]);
    },
    metadataItem: (type, value) => {
        const valueBytes = new TextEncoder().encode(value);
        const dataSize = 16 + valueBytes.length;
        const dataBuf = new Uint8Array(dataSize);
        const dView = new DataView(dataBuf.buffer);

        BE.w32(dView, 0, dataSize);
        BE.wStr(dView, 4, 'data');
        BE.w32(dView, 8, 1);
        BE.w32(dView, 12, 0);
        dataBuf.set(valueBytes, 16);

        return MP4Builder.box(type, [dataBuf]);
    },
    trak: (track, movieTimescale) => {
        const children = [];

        children.push(MP4Builder.tkhd(track, movieTimescale));

        if (track.duration > 0) {
            children.push(MP4Builder.edts(track, movieTimescale));
        }

        children.push(MP4Builder.mdia(track));

        return MP4Builder.box('trak', children);
    },
    edts: (track, movieTimescale) => {
        const children = [];

        children.push(MP4Builder.elst(track, movieTimescale));

        return MP4Builder.box('edts', children);
    },
    elst: (track, movieTimescale) => {
        const buf = new Uint8Array(28);
        const view = new DataView(buf.buffer);

        BE.w32(view, 0, 28);
        BE.wStr(view, 4, 'elst');
        BE.w32(view, 8, 0);
        BE.w32(view, 12, 1);
        const segmentDuration = Math.floor((track.duration / track.timescale) * movieTimescale);

        BE.w32(view, 16, segmentDuration);
        BE.w32(view, 20, 0);
        BE.w32(view, 24, 65536);

        return buf;
    },
    tkhd: (track, movieTimescale) => {
        const buf = new Uint8Array(92);
        const view = new DataView(buf.buffer);

        BE.w32(view, 0, 92);
        BE.wStr(view, 4, 'tkhd');
        BE.w32(view, 8, 3);
        BE.w32(view, 20, track.id);
        const globalDuration = Math.floor((track.duration / track.timescale) * movieTimescale);

        BE.w32(view, 28, globalDuration);
        if (track.type === 'audio') BE.w16(view, 42, 1);
        BE.w16(view, 44, track.type === 'audio' ? 256 : 0);
        BE.w32(view, 48, 65536);
        BE.w32(view, 64, 65536);
        BE.w32(view, 80, 1073741824);

        if (track.type === 'video') {
            const w = track.width || 0;
            const h = track.height || 0;

            BE.w32(view, 84, w << 16);
            BE.w32(view, 88, h << 16);
        }

        return buf;
    },
    mdia: (track) => {
        const children = [];

        children.push(MP4Builder.mdhd(track));
        children.push(MP4Builder.hdlr(track.type));
        children.push(MP4Builder.minf(track));

        return MP4Builder.box('mdia', children);
    },
    mdhd: (track) => {
        const buf = new Uint8Array(32);
        const view = new DataView(buf.buffer);

        BE.w32(view, 0, 32);
        BE.wStr(view, 4, 'mdhd');
        BE.w32(view, 20, track.timescale);
        BE.w32(view, 24, track.duration);
        BE.w16(view, 28, 21956);

        return buf;
    },
    hdlr: (type) => {
        const componentName = type === 'video' ? 'VideoHandler' : 'SoundHandler';
        const handlerType = type === 'video' ? 'vide' : 'soun';
        const nameLen = componentName.length + 1;
        const buf = new Uint8Array(32 + nameLen);
        const view = new DataView(buf.buffer);

        BE.w32(view, 0, 32 + nameLen);
        BE.wStr(view, 4, 'hdlr');
        BE.wStr(view, 16, handlerType);
        BE.wStr(view, 32, componentName);

        return buf;
    },
    minf: (track) => {
        const children = [];

        if (track.type === 'video') {
            const vmhd = new Uint8Array(20);
            const view = new DataView(vmhd.buffer);

            BE.w32(view, 0, 20);
            BE.wStr(view, 4, 'vmhd');
            BE.w32(view, 8, 1);
            children.push(vmhd);
        } else {
            const smhd = new Uint8Array(16);
            const view = new DataView(smhd.buffer);

            BE.w32(view, 0, 16);
            BE.wStr(view, 4, 'smhd');
            children.push(smhd);
        }

        const dref = new Uint8Array(28);
        const dView = new DataView(dref.buffer);

        BE.w32(dView, 0, 28);
        BE.wStr(dView, 4, 'dref');
        BE.w32(dView, 12, 1);
        BE.w32(dView, 16, 12);
        BE.wStr(dView, 20, 'url ');
        BE.w32(dView, 24, 1);
        children.push(MP4Builder.box('dinf', [dref]));
        children.push(MP4Builder.stbl(track));

        return MP4Builder.box('minf', children);
    },
    stbl: (track) => {
        const children = [];

        children.push(MP4Builder.stsd(track));
        children.push(MP4Builder.stts(track));
        const ctts = MP4Builder.ctts(track);

        if (ctts) children.push(ctts);

        if (track.type === 'video') {
            const stss = MP4Builder.stss(track);

            if (stss) children.push(stss);
        }

        children.push(MP4Builder.stsc(track));
        children.push(MP4Builder.stsz(track));
        children.push(MP4Builder.stco(track));

        return MP4Builder.box('stbl', children);
    },
    stsd: (track) => {
        if (!track.codecPrivate) {
            const fallback = new Uint8Array(16);

            return MP4Builder.box('stsd', [fallback]);
        }

        const entryCount = 1;
        const size = 8 + 8 + track.codecPrivate.length;
        const buf = new Uint8Array(size);
        const bufView = new DataView(buf.buffer);

        BE.w32(bufView, 0, size);
        BE.wStr(bufView, 4, 'stsd');
        BE.w32(bufView, 12, entryCount);
        buf.set(track.codecPrivate, 16);

        return buf;
    },
    stts: (track) => {
        const entries = [];
        const samples = track.samples;

        if (samples.length > 0) {
            let currentDur = samples[0].duration;
            let count = 1;

            for (let i = 1; i < samples.length; i++) {
                if (samples[i].duration === currentDur) {
                    count++;
                } else {
                    entries.push({ count: count, duration: currentDur });
                    currentDur = samples[i].duration;
                    count = 1;
                }
            }

            entries.push({ count: count, duration: currentDur });
        }

        const buf = new Uint8Array(16 + entries.length * 8);
        const view = new DataView(buf.buffer);

        BE.w32(view, 0, buf.length);
        BE.wStr(view, 4, 'stts');
        BE.w32(view, 12, entries.length);
        let offset = 16;

        for (const e of entries) {
            BE.w32(view, offset, e.count);
            BE.w32(view, offset + 4, e.duration);
            offset += 8;
        }

        return buf;
    },
    ctts: (track) => {
        const samples = track.samples;

        if (!samples || samples.length === 0) return null;
        const hasOffset = samples.some((s) => s.cto !== 0);

        if (!hasOffset) return null;
        const entries = [];
        let currentOffset = samples[0].cto;
        let count = 1;

        for (let i = 1; i < samples.length; i++) {
            if (samples[i].cto === currentOffset) {
                count++;
            } else {
                entries.push({ count: count, offset: currentOffset });
                currentOffset = samples[i].cto;
                count = 1;
            }
        }

        entries.push({ count: count, offset: currentOffset });
        const hasNegative = samples.some((s) => s.cto < 0);
        const version = hasNegative ? 1 : 0;
        const buf = new Uint8Array(16 + entries.length * 8);
        const view = new DataView(buf.buffer);

        BE.w32(view, 0, buf.length);
        BE.wStr(view, 4, 'ctts');
        BE.w32(view, 8, version << 24);
        BE.w32(view, 12, entries.length);
        let cursor = 16;

        for (const e of entries) {
            BE.w32(view, cursor, e.count);
            BE.w32(view, cursor + 4, e.offset);
            cursor += 8;
        }

        return buf;
    },
    stss: (track) => {
        const keys = [];

        track.samples.forEach((s, i) => {
            if (s.isKeyframe) keys.push(i + 1);
        });
        if (keys.length === 0) return null;
        const buf = new Uint8Array(16 + keys.length * 4);
        const view = new DataView(buf.buffer);

        BE.w32(view, 0, buf.length);
        BE.wStr(view, 4, 'stss');
        BE.w32(view, 12, keys.length);
        let offset = 16;

        for (const k of keys) {
            BE.w32(view, offset, k);
            offset += 4;
        }

        return buf;
    },
    stsz: (track) => {
        const samples = track.samples;
        const buf = new Uint8Array(20 + samples.length * 4);
        const view = new DataView(buf.buffer);

        BE.w32(view, 0, buf.length);
        BE.wStr(view, 4, 'stsz');
        BE.w32(view, 16, samples.length);
        let offset = 20;

        for (const s of samples) {
            BE.w32(view, offset, s.size);
            offset += 4;
        }

        return buf;
    },
    stsc: (track) => {
        const chunks = track.chunks;
        const entries = [];

        if (chunks.length > 0) {
            let currentSqc = chunks[0].samples.length;
            let firstChunk = 1;

            for (let i = 1; i < chunks.length; i++) {
                const sqc = chunks[i].samples.length;

                if (sqc !== currentSqc) {
                    entries.push({ first: firstChunk, count: currentSqc, id: 1 });
                    firstChunk = i + 1;
                    currentSqc = sqc;
                }
            }

            entries.push({ first: firstChunk, count: currentSqc, id: 1 });
        }

        const buf = new Uint8Array(16 + entries.length * 12);
        const view = new DataView(buf.buffer);

        BE.w32(view, 0, buf.length);
        BE.wStr(view, 4, 'stsc');
        BE.w32(view, 12, entries.length);
        let offset = 16;

        for (const e of entries) {
            BE.w32(view, offset, e.first);
            BE.w32(view, offset + 4, e.count);
            BE.w32(view, offset + 8, e.id);
            offset += 12;
        }

        return buf;
    },
    stco: (track) => {
        const chunks = track.chunks;

        if (chunks.length === 0) return null;
        const lastOffset = chunks[chunks.length - 1].outputOffset;
        const use64Bit = lastOffset > 4294967295;

        if (use64Bit) {
            const buf = new Uint8Array(16 + chunks.length * 8);
            const view = new DataView(buf.buffer);

            BE.w32(view, 0, buf.length);
            BE.wStr(view, 4, 'co64');
            BE.w32(view, 8, 0);
            BE.w32(view, 12, chunks.length);
            let offset = 16;

            for (const c of chunks) {
                BE.w64(view, offset, c.outputOffset);
                offset += 8;
            }

            return buf;
        } else {
            const buf = new Uint8Array(16 + chunks.length * 4);
            const view = new DataView(buf.buffer);

            BE.w32(view, 0, buf.length);
            BE.wStr(view, 4, 'stco');
            BE.w32(view, 8, 0);
            BE.w32(view, 12, chunks.length);
            let offset = 16;

            for (const c of chunks) {
                BE.w32(view, offset, c.outputOffset);
                offset += 4;
            }

            return buf;
        }
    },
    box: (type, parts) => {
        let size = 8;

        for (const p of parts) size += p.byteLength;
        const buf = new Uint8Array(size);
        const view = new DataView(buf.buffer);

        BE.w32(view, 0, size);
        BE.wStr(view, 4, type);
        let offset = 8;

        for (const p of parts) {
            buf.set(p, offset);
            offset += p.byteLength;
        }

        return buf;
    },
};
