/**
 * @file lib/fragment-processor.js
 * @description MP4 分片处理器 (MP4 Fragment Processor)
 * * 核心职责 (Core Responsibilities):
 * 1. DASH 分片解析 (DASH Parsing):
 * - 解析 DASH 流的初始化段 (`parseInitSegment`)，提取 Timescale、Track ID 和 Codec 配置。
 * - 解析媒体分片 (`extractSamples`)，从 `moof` 和 `mdat` Box 中提取每一帧的 Size, Duration, CTS, Flags 等关键信息。
 * * 2. 时间戳修正 (Timestamp Patching):
 * - 处理 DASH 流中常见的时间戳跳变或重置问题，确保合并后的 MP4 音画同步。
 * - 提供 `patchSequenceNumber` 和 `patchTfdt` 方法用于修正分片序列号和解码时间戳。
 * * 3. 头部重构 (Header Reconstruction):
 * - `generateInitSegment`: 将分离的 Video Init 和 Audio Init 合并为单一的 Movie Header，用于混流模式的初始化。
 * * @author weiyunjun
 * @version v0.1.0
 */

import { BE } from './io-buffer.js';
import { Parser, Builder } from './mp4-atoms.js';

export class FragmentProcessor {
    constructor(logger = console.log) {
        this.log = logger;
    }

    parseInitSegment(buffer, track) {
        const moov = Parser.findBox(buffer, ['moov']);

        if (!moov) throw new Error('Init Segment 缺少 moov');
        const mdhd = Parser.findBox(moov.payload, ['trak', 'mdia', 'mdhd']);

        if (mdhd) {
            track.timescale = Parser.parseMdhdTimescale(mdhd.payload);
        }

        const mvex = Parser.findBox(moov.payload, ['mvex']);

        if (mvex) {
            this._parseMvexDefaults(mvex.payload, track);
        }

        if (!track.scd) track.scd = { duration: 0, size: 0, flags: 0 };
        track.meta = Parser.parseUserMetadata(moov.payload);
        const stsd = Parser.findBox(moov.payload, ['trak', 'mdia', 'minf', 'stbl', 'stsd']);

        if (stsd) {
            this._parseStsd(stsd.payload, track);
        }
    }

    extractSamples(moofBuf, mdatBuf, track) {
        let decodeTime = 0;
        const tfdt = Parser.findBox(moofBuf, ['moof', 'traf', 'tfdt']);

        if (tfdt) {
            decodeTime = Parser.parseTfdtTime(tfdt.payload);
        } else {
            decodeTime = track.duration;
        }

        const tfhd = Parser.findBox(moofBuf, ['moof', 'traf', 'tfhd']);
        const tfhdDefaults = tfhd ? this._parseTfhd(tfhd.payload) : { duration: 0, size: 0, flags: 0 };
        const defaults = {
            duration: tfhdDefaults.duration || track.scd.duration,
            size: tfhdDefaults.size || track.scd.size,
            flags: tfhdDefaults.flags || track.scd.flags,
        };
        const trun = Parser.findBox(moofBuf, ['moof', 'traf', 'trun']);

        if (!trun) return [];
        const samples = this._parseTrun(trun.payload, { ...defaults, baseDts: decodeTime });
        let currentOffset = 0;

        samples.forEach((sample) => {
            sample.offsetInMdat = currentOffset;
            currentOffset += sample.size;
        });

        return samples;
    }

    getTimescale(initBuf) {
        if (!initBuf) return 0;
        const mdhd = Parser.findBox(initBuf, ['moov', 'trak', 'mdia', 'mdhd']);

        if (mdhd) {
            return Parser.parseMdhdTimescale(mdhd.payload);
        }

        return 0;
    }

    getFragmentDts(fragmentBuf) {
        if (!fragmentBuf) return -1;
        const tfdt = Parser.findBox(fragmentBuf, ['moof', 'traf', 'tfdt']);

        if (tfdt) {
            return Parser.parseTfdtTime(tfdt.payload);
        }

        return -1;
    }

    patchSequenceNumber(fragmentBuf, seqNum) {
        const buf = new Uint8Array(fragmentBuf);
        const mfhd = Parser.findBox(buf, ['moof', 'mfhd']);

        if (mfhd) {
            const view = new DataView(mfhd.payload.buffer, mfhd.payload.byteOffset, mfhd.payload.byteLength);

            BE.w32(view, 4, seqNum);
        }

        return buf;
    }

    patchTfdt(fragmentBuf, newDts) {
        const buf = new Uint8Array(fragmentBuf);
        const tfdt = Parser.findBox(buf, ['moof', 'traf', 'tfdt']);

        if (tfdt) {
            const payload = tfdt.payload;
            const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
            const version = BE.r8(view, 0);

            if (version === 1) BE.w64(view, 4, newDts);
            else BE.w32(view, 4, newDts);
        }

        return buf;
    }

    generateInitSegment(videoInitBuf, audioInitBuf) {
        const vBuf = new Uint8Array(videoInitBuf);
        const aBuf = audioInitBuf ? new Uint8Array(audioInitBuf) : null;
        const vFtyp = Parser.findBox(vBuf, ['ftyp']);
        const ftyp = vBuf.subarray(vFtyp.offset, vFtyp.offset + vFtyp.size);
        const vMoov = Parser.findBox(vBuf, ['moov']);

        if (!vMoov) throw new Error('视频流缺少 moov');
        let patchedAudioTrak = null;
        let patchedAudioTrex = null;

        if (aBuf) {
            const aTrak = Parser.findBox(aBuf, ['moov', 'trak']);

            if (aTrak) {
                const aTrakBuf = aBuf.subarray(aTrak.offset, aTrak.offset + aTrak.size);

                patchedAudioTrak = this._patchTrackId(aTrakBuf, 2);
            }

            const aMvex = Parser.findBox(aBuf, ['moov', 'mvex']);

            if (aMvex) {
                const trex = Parser.findBox(aMvex.payload, ['trex']);

                if (trex) {
                    const rawTrex = aMvex.payload.subarray(trex.offset, trex.offset + trex.size);

                    patchedAudioTrex = this._patchTrackIdInTrex(rawTrex, 2);
                }
            }
        }

        if (!patchedAudioTrex && patchedAudioTrak) patchedAudioTrex = Builder.trex(2);
        const vMoovPayload = vMoov.payload;
        const newMoovChildren = [];
        const mvhd = Parser.findBox(vMoovPayload, ['mvhd']);

        if (mvhd) {
            const newMvhd = new Uint8Array(vMoovPayload.subarray(mvhd.offset, mvhd.offset + mvhd.size));
            const view = new DataView(newMvhd.buffer, newMvhd.byteOffset, newMvhd.byteLength);

            if (patchedAudioTrak) {
                BE.w32(view, newMvhd.length - 4, 3);
            }

            newMoovChildren.push(newMvhd);
        }

        let cursor = 0;
        const view = new DataView(vMoovPayload.buffer, vMoovPayload.byteOffset, vMoovPayload.byteLength);

        while (cursor < vMoovPayload.byteLength) {
            const size = BE.r32(view, cursor);
            const type = BE.str(view, cursor + 4);

            if (type === 'trak') {
                newMoovChildren.push(vMoovPayload.subarray(cursor, cursor + size));
            }

            cursor += size;
        }

        if (patchedAudioTrak) newMoovChildren.push(patchedAudioTrak);
        const mvex = Parser.findBox(vMoovPayload, ['mvex']);

        if (mvex) {
            const newMvex = this._patchMvex(vMoovPayload.subarray(mvex.offset, mvex.offset + mvex.size), patchedAudioTrex);

            newMoovChildren.push(newMvex);
        } else if (patchedAudioTrak) {
            const trexV = Builder.trex(1);
            const newMvex = Builder.container('mvex', [trexV, patchedAudioTrex]);

            newMoovChildren.push(newMvex);
        }

        const newMoov = Builder.container('moov', newMoovChildren);
        const result = new Uint8Array(ftyp.length + newMoov.length);

        result.set(ftyp, 0);
        result.set(newMoov, ftyp.length);

        return result;
    }

    processFragment(inputBuffer, type) {
        if (type === 'video') return new Uint8Array(inputBuffer);

        return this._patchFragmentId(new Uint8Array(inputBuffer), 2);
    }

    _parseMvexDefaults(payload, track) {
        const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
        let offset = 0;

        while (offset < payload.byteLength) {
            if (offset + 8 > payload.byteLength) break;
            const size = BE.r32(view, offset);
            const type = BE.str(view, offset + 4);

            if (type === 'trex') {
                track.scd = {
                    duration: BE.r32(view, offset + 20),
                    size: BE.r32(view, offset + 24),
                    flags: BE.r32(view, offset + 28),
                };

                return;
            }

            offset += size;
        }
    }

    _parseStsd(payload, track) {
        const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
        const entryCount = BE.r32(view, 4);

        if (entryCount > 0) {
            const entrySize = BE.r32(view, 8);
            const entryType = BE.str(view, 12);

            track.codecPrivate = payload.subarray(8, 8 + entrySize).slice();
            track.codec = entryType;

            if (entryType === 'hev1') {
                track.codec = 'hvc1';
                const cpView = new DataView(track.codecPrivate.buffer);

                BE.wStr(cpView, 4, 'hvc1');
            }

            if (track.type === 'video' && ['avc1', 'hev1', 'hvc1', 'av01', 'vp09'].includes(entryType)) {
                const cpView = new DataView(track.codecPrivate.buffer);

                track.width = BE.r16(cpView, 32);
                track.height = BE.r16(cpView, 34);
            }
        }
    }

    _parseTfhd(payload) {
        const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
        const flags = BE.r32(view, 0) & 16777215;
        let cursor = 8;

        if (flags & 1) cursor += 8;
        if (flags & 2) cursor += 4;
        const res = { duration: 0, size: 0, flags: 0 };

        if (flags & 8) {
            res.duration = BE.r32(view, cursor);
            cursor += 4;
        }

        if (flags & 16) {
            res.size = BE.r32(view, cursor);
            cursor += 4;
        }

        if (flags & 32) {
            res.flags = BE.r32(view, cursor);
            cursor += 4;
        }

        return res;
    }

    _parseTrun(payload, ctx) {
        const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
        const flags = BE.r32(view, 0) & 16777215;
        const sampleCount = BE.r32(view, 4);
        let cursor = 8;

        if (flags & 1) cursor += 4;
        let firstSampleFlags = 0;
        let hasFirstSampleFlags = false;

        if (flags & 4) {
            firstSampleFlags = BE.r32(view, cursor);
            hasFirstSampleFlags = true;
            cursor += 4;
        }

        const durationPresent = !!(flags & 256);
        const sizePresent = !!(flags & 512);
        const flagsPresent = !!(flags & 1024);
        const ctsPresent = !!(flags & 2048);
        const samples = [];
        let currentDts = ctx.baseDts;

        for (let i = 0; i < sampleCount; i++) {
            let duration = ctx.duration;
            let size = ctx.size;
            let sampleFlags = ctx.flags;
            let cts = 0;

            if (durationPresent) {
                duration = BE.r32(view, cursor);
                cursor += 4;
            }

            if (sizePresent) {
                size = BE.r32(view, cursor);
                cursor += 4;
            }

            if (flagsPresent) {
                sampleFlags = BE.r32(view, cursor);
                cursor += 4;
            }

            if (ctsPresent) {
                cts = BE.r32(view, cursor);
                cursor += 4;
            }

            if (i === 0 && hasFirstSampleFlags) {
                sampleFlags = firstSampleFlags;
            }

            const isKeyframe = !((sampleFlags & 65536) !== 0);

            if (cts > 2147483647) cts -= 4294967296;
            samples.push({
                dts: currentDts,
                pts: currentDts + cts,
                cto: cts,
                duration: duration,
                size: size,
                isKeyframe: isKeyframe,
                flags: sampleFlags,
            });
            currentDts += duration;
        }

        return samples;
    }

    _patchTrackId(trakBuffer, newId) {
        const buf = new Uint8Array(trakBuffer);
        const tkhd = Parser.findBox(buf, ['tkhd']);

        if (tkhd) {
            const view = new DataView(tkhd.payload.buffer, tkhd.payload.byteOffset, tkhd.payload.byteLength);
            const ver = BE.r8(view, 0);
            const offset = ver === 1 ? 20 : 12;

            BE.w32(view, offset, newId);
        }

        return buf;
    }

    _patchTrackIdInTrex(trexBuffer, newId) {
        const buf = new Uint8Array(trexBuffer);
        const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

        BE.w32(view, 12, newId);

        return buf;
    }

    _patchMvex(mvexBuffer, audioTrexBuffer) {
        if (!audioTrexBuffer) return mvexBuffer;
        const newSize = mvexBuffer.byteLength + audioTrexBuffer.byteLength;
        const newMvex = new Uint8Array(newSize);
        const view = new DataView(newMvex.buffer);

        newMvex.set(mvexBuffer, 0);
        BE.w32(view, 0, newSize);
        newMvex.set(audioTrexBuffer, mvexBuffer.byteLength);

        return newMvex;
    }

    _patchFragmentId(fragmentBuffer, newId) {
        const buf = new Uint8Array(fragmentBuffer);
        const moof = Parser.findBox(buf, ['moof']);

        if (!moof) return buf;
        const traf = Parser.findBox(moof.payload, ['traf']);

        if (!traf) return buf;
        const tfhd = Parser.findBox(traf.payload, ['tfhd']);

        if (tfhd) {
            const offset = moof.offset + traf.offset + tfhd.offset;
            const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

            BE.w32(view, offset + 12, newId);
        }

        return buf;
    }
}
