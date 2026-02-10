/**
 * @file lib/io-buffer.js
 * @description 二进制读写工具集 (Binary IO Utilities)
 * * 核心职责 (Core Responsibilities):
 * 1. 大端序操作 (Big-Endian Operations):
 * - 提供 `BE` 对象，封装了对 `DataView` 的大端序读写方法 (r8/w8, r16/w16, r32/w32, r64/w64)。
 * - MP4 格式标准要求所有数字字段均使用大端序存储，此库是处理 MP4 Box 的基础工具。
 * * 2. 内存流抽象 (ByteStream):
 * - 提供 `ByteStream` 类，模拟流式读取操作 (seek, skip, readU32)，简化了对内存中 ArrayBuffer 的解析逻辑。
 * * @author weiyunjun
 * @version v0.1.0
 */

export const BE = {
    r64: (view, off) => view.getBigUint64(off, false),
    r32: (view, off) => view.getUint32(off, false),
    r16: (view, off) => view.getUint16(off, false),
    r8: (view, off) => view.getUint8(off),
    w64: (view, off, val) => view.setBigUint64(off, BigInt(val), false),
    w32: (view, off, val) => view.setUint32(off, val, false),
    w16: (view, off, val) => view.setUint16(off, val, false),
    w8: (view, off, val) => view.setUint8(off, val),
    str: (view, off) =>
        String.fromCharCode(view.getUint8(off), view.getUint8(off + 1), view.getUint8(off + 2), view.getUint8(off + 3)),
    wStr: (view, off, str) => {
        for (let i = 0; i < 4; i++) view.setUint8(off + i, str.charCodeAt(i));
    },
};

export class ByteStream {
    constructor(buffer) {
        this.buffer = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        this.view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
        this.cursor = 0;
    }

    get remaining() {
        return this.view.byteLength - this.cursor;
    }

    seek(pos) {
        if (pos < 0 || pos > this.view.byteLength) throw new Error('Seek out of bounds');
        this.cursor = pos;
    }

    skip(delta) {
        this.cursor += delta;
    }

    readU32() {
        if (this.remaining < 4) throw new Error('EOF');
        const v = BE.r32(this.view, this.cursor);

        this.cursor += 4;

        return v;
    }

    readU64() {
        if (this.remaining < 8) throw new Error('EOF');
        const v = this.view.getBigUint64(this.cursor, false);

        this.cursor += 8;

        return v;
    }

    readString(len = 4) {
        if (this.remaining < len) throw new Error('EOF');
        let s = '';

        for (let i = 0; i < len; i++) s += String.fromCharCode(BE.r8(this.view, this.cursor++));

        return s;
    }

    readBoxHeader() {
        if (this.remaining < 8) return null;
        const start = this.cursor;
        let size = this.readU32();
        const type = this.readString(4);
        let headerSize = 8;

        if (size === 1) {
            if (this.remaining < 8) return null;
            size = Number(this.readU64());
            headerSize = 16;
        }

        return { type: type, size: size, headerSize: headerSize, start: start };
    }

    readBoxSlice(size) {
        if (this.remaining < size) return null;
        const slice = this.buffer.subarray(this.cursor, this.cursor + size);

        this.cursor += size;

        return slice;
    }
}

export class FileChunkReader {
    constructor(file) {
        this.file = file;
        this.pos = 0;
        this.size = file.size;
    }

    async peek(len) {
        if (this.pos + len > this.size) return null;
        const blob = this.file.slice(this.pos, this.pos + len);

        return new DataView(await blob.arrayBuffer());
    }

    async read(len) {
        if (this.pos + len > this.size) return null;
        const blob = this.file.slice(this.pos, this.pos + len);
        const buf = await blob.arrayBuffer();

        this.pos += len;

        return new Uint8Array(buf);
    }

    get isEOF() {
        return this.pos >= this.size;
    }
}
