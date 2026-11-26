"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENCODE_NAMES = void 0;
exports.isEncodeName = isEncodeName;
exports.encodeText = encodeText;
exports.decodeText = decodeText;
const escape_1 = require("./escape");
const ENCODE_NAMES = ['base64', 'base64url', 'hex'];
exports.ENCODE_NAMES = ENCODE_NAMES;
const B64_STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const HEX_LOWER = '0123456789abcdef';
function isEncodeName(v) {
    return ENCODE_NAMES.includes(v);
}
function textBytes(src) {
    const out = [];
    for (const ch of src) {
        for (const b of (0, escape_1.utf8Bytes)(ch)) {
            out.push(b);
        }
    }
    return out;
}
function b64Encode(bytes, alphabet, pad) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const n = bytes.length - i;
        const b0 = bytes[i];
        const b1 = 1 < n ? bytes[i + 1] : 0;
        const b2 = 2 < n ? bytes[i + 2] : 0;
        out += alphabet[b0 >> 2] + alphabet[((b0 & 0x03) << 4) | (b1 >> 4)];
        if (1 < n) {
            out += alphabet[((b1 & 0x0F) << 2) | (b2 >> 6)];
        }
        else if (pad) {
            out += '=';
        }
        if (2 < n) {
            out += alphabet[b2 & 0x3F];
        }
        else if (pad) {
            out += '=';
        }
    }
    return out;
}
// Only the text `b64Encode` writes is read: a host decoder also takes
// line breaks, missing padding and stray low bits, each a second
// spelling of the same bytes.
function b64Decode(src, alphabet, pad) {
    let end = src.length;
    if (pad) {
        if (0 !== end % 4) {
            return undefined;
        }
        if (src.endsWith('==')) {
            end -= 2;
        }
        else if (src.endsWith('=')) {
            end -= 1;
        }
    }
    if (1 === end % 4) {
        return undefined;
    }
    const out = [];
    let acc = 0;
    let bits = 0;
    for (let i = 0; i < end; i++) {
        const v = alphabet.indexOf(src[i]);
        if (0 > v) {
            return undefined;
        }
        acc = (acc << 6) | v;
        bits += 6;
        if (8 <= bits) {
            bits -= 8;
            out.push(acc >> bits);
            acc &= (1 << bits) - 1;
        }
    }
    return 0 === acc ? out : undefined;
}
function hexEncode(bytes) {
    let out = '';
    for (const b of bytes) {
        out += HEX_LOWER[b >> 4] + HEX_LOWER[b & 0x0F];
    }
    return out;
}
function hexDecode(src) {
    if (0 !== src.length % 2) {
        return undefined;
    }
    const out = [];
    for (let i = 0; i < src.length; i += 2) {
        const hi = (0, escape_1.hexDigit)(src[i]);
        const lo = (0, escape_1.hexDigit)(src[i + 1]);
        if (0 > hi || 0 > lo) {
            return undefined;
        }
        out.push(hi * 16 + lo);
    }
    return out;
}
// The one entry point each way. An unknown name never reaches here: the
// call refuses it (`encode_name`) before either is asked.
function encodeText(src, name) {
    const bytes = textBytes(src);
    if ('base64' === name) {
        return b64Encode(bytes, B64_STD, true);
    }
    if ('base64url' === name) {
        return b64Encode(bytes, B64_URL, false);
    }
    return hexEncode(bytes);
}
function decodeText(src, name) {
    const bytes = 'base64' === name ? b64Decode(src, B64_STD, true) :
        'base64url' === name ? b64Decode(src, B64_URL, false) :
            hexDecode(src);
    return undefined === bytes ? ['', false] : (0, escape_1.utf8Text)(bytes);
} /* node:coverage ignore next 8 */
//# sourceMappingURL=encode.js.map