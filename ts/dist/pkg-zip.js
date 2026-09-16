"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cmpBytes = cmpBytes;
exports.sha256Hex = sha256Hex;
exports.zipCanonical = zipCanonical;
exports.unzipCanonical = unzipCanonical;
const node_crypto_1 = require("node:crypto");
const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const END_SIG = 0x06054b50;
const DOS_EPOCH_DATE = 0x0021;
let CRC_TABLE;
function crc32(data) {
    if (undefined === CRC_TABLE) {
        CRC_TABLE = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = 0 !== (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            }
            CRC_TABLE[n] = c >>> 0;
        }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function cmpBytes(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
function sha256Hex(data) {
    return 'sha256:' + (0, node_crypto_1.createHash)('sha256').update(data).digest('hex');
}
class Writer {
    constructor() {
        this.parts = [];
        this.size = 0;
    }
    u16(n) {
        this.bytes(new Uint8Array([n & 0xff, (n >>> 8) & 0xff]));
    }
    u32(n) {
        this.bytes(new Uint8Array([
            n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff
        ]));
    }
    bytes(b) {
        this.parts.push(b);
        this.size += b.length;
    }
    out() {
        const all = new Uint8Array(this.size);
        let at = 0;
        for (const p of this.parts) {
            all.set(p, at);
            at += p.length;
        }
        return all;
    }
}
function zipCanonical(entries) {
    const sorted = [...entries].sort((a, b) => cmpBytes(a.path, b.path));
    const w = new Writer();
    const central = new Writer();
    const enc = new TextEncoder();
    for (const e of sorted) {
        const name = enc.encode(e.path);
        const crc = crc32(e.data);
        const offset = w.size;
        w.u32(LOCAL_SIG);
        w.u16(10);
        w.u16(0);
        w.u16(0);
        w.u16(0);
        w.u16(DOS_EPOCH_DATE);
        w.u32(crc);
        w.u32(e.data.length);
        w.u32(e.data.length);
        w.u16(name.length);
        w.u16(0);
        w.bytes(name);
        w.bytes(e.data);
        central.u32(CENTRAL_SIG);
        central.u16(10);
        central.u16(10);
        central.u16(0);
        central.u16(0);
        central.u16(0);
        central.u16(DOS_EPOCH_DATE);
        central.u32(crc);
        central.u32(e.data.length);
        central.u32(e.data.length);
        central.u16(name.length);
        central.u16(0);
        central.u16(0);
        central.u16(0);
        central.u16(0);
        central.u32(0);
        central.u32(offset);
        central.bytes(name);
    }
    const cdOffset = w.size;
    const cd = central.out();
    w.bytes(cd);
    w.u32(END_SIG);
    w.u16(0);
    w.u16(0);
    w.u16(sorted.length);
    w.u16(sorted.length);
    w.u32(cd.length);
    w.u32(cdOffset);
    w.u16(0);
    return w.out();
}
function u16(b, at) {
    return b[at] | (b[at + 1] << 8);
}
function u32(b, at) {
    return (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16)) + b[at + 3] * 0x1000000;
}
// Read a canonical archive, refusing any shape the writer above would
// not have produced: the digest was taken over the canonical bytes, so
// a non-canonical archive is a corrupted one whatever it unpacks to.
function unzipCanonical(zip) {
    const bad = (why) => {
        throw new Error('archive is not canonical: ' + why);
    };
    if (zip.length < 22 || END_SIG !== u32(zip, zip.length - 22)) {
        bad('no end record');
    }
    const end = zip.length - 22;
    const count = u16(zip, end + 10);
    const cdSize = u32(zip, end + 12);
    const cdOffset = u32(zip, end + 16);
    if (0 !== u16(zip, end + 4) || 0 !== u16(zip, end + 6) ||
        count !== u16(zip, end + 8) || 0 !== u16(zip, end + 20) ||
        cdOffset + cdSize !== end) {
        bad('end record');
    }
    const dec = new TextDecoder('utf-8', { fatal: true });
    const out = [];
    let at = cdOffset;
    let prev;
    let expectLocal = 0;
    for (let i = 0; i < count; i++) {
        if (at + 46 > end || CENTRAL_SIG !== u32(zip, at)) {
            bad('central directory');
        }
        const crc = u32(zip, at + 16);
        const csize = u32(zip, at + 20);
        const usize = u32(zip, at + 24);
        const nameLen = u16(zip, at + 28);
        const offset = u32(zip, at + 42);
        if (10 !== u16(zip, at + 4) || 10 !== u16(zip, at + 6) ||
            0 !== u16(zip, at + 8) || 0 !== u16(zip, at + 10) ||
            0 !== u16(zip, at + 12) || DOS_EPOCH_DATE !== u16(zip, at + 14) ||
            csize !== usize || 0 !== u16(zip, at + 30) || 0 !== u16(zip, at + 32) ||
            0 !== u16(zip, at + 34) || 0 !== u16(zip, at + 36) ||
            0 !== u32(zip, at + 38) || offset !== expectLocal) {
            bad('entry ' + i);
        }
        const name = dec.decode(zip.subarray(at + 46, at + 46 + nameLen));
        if (undefined !== prev && 0 <= cmpBytes(prev, name)) {
            bad('entries out of order at ' + name);
        }
        prev = name;
        at += 46 + nameLen;
        if (offset + 30 + nameLen > cdOffset || LOCAL_SIG !== u32(zip, offset) ||
            10 !== u16(zip, offset + 4) || 0 !== u16(zip, offset + 6) ||
            0 !== u16(zip, offset + 8) || 0 !== u16(zip, offset + 10) ||
            DOS_EPOCH_DATE !== u16(zip, offset + 12) || crc !== u32(zip, offset + 14) ||
            usize !== u32(zip, offset + 18) || usize !== u32(zip, offset + 22) ||
            nameLen !== u16(zip, offset + 26) || 0 !== u16(zip, offset + 28) ||
            name !== dec.decode(zip.subarray(offset + 30, offset + 30 + nameLen))) {
            bad('local header of ' + name);
        }
        const start = offset + 30 + nameLen;
        if (start + usize > cdOffset) {
            bad('data of ' + name);
        }
        const data = zip.slice(start, start + usize);
        if (crc32(data) !== crc) {
            bad('checksum of ' + name);
        }
        out.push({ path: name, data });
        expectLocal = start + usize;
    }
    if (expectLocal !== cdOffset) {
        bad('trailing bytes');
    }
    return out;
}
//# sourceMappingURL=pkg-zip.js.map