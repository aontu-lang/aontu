/* Copyright (c) 2025 Richard Rodger, MIT License */


import { hexDigit, utf8Bytes, utf8Text } from './escape'


const ENCODE_NAMES = ['base64', 'base64url', 'hex']


const B64_STD =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const B64_URL =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

const HEX_LOWER = '0123456789abcdef'


function isEncodeName(v: string): boolean {
  return ENCODE_NAMES.includes(v)
}


function textBytes(src: string): number[] {
  const out: number[] = []
  for (const ch of src) {
    for (const b of utf8Bytes(ch)) { out.push(b) }
  }
  return out
}


function b64Encode(bytes: number[], alphabet: string, pad: boolean): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = bytes.length - i
    const b0 = bytes[i]
    const b1 = 1 < n ? bytes[i + 1] : 0
    const b2 = 2 < n ? bytes[i + 2] : 0

    out += alphabet[b0 >> 2] + alphabet[((b0 & 0x03) << 4) | (b1 >> 4)]
    if (1 < n) { out += alphabet[((b1 & 0x0F) << 2) | (b2 >> 6)] }
    else if (pad) { out += '=' }
    if (2 < n) { out += alphabet[b2 & 0x3F] }
    else if (pad) { out += '=' }
  }
  return out
}


// Only the text `b64Encode` writes is read: a host decoder also takes
// line breaks, missing padding and stray low bits, each a second
// spelling of the same bytes.
function b64Decode(
  src: string, alphabet: string, pad: boolean
): number[] | undefined {
  let end = src.length
  if (pad) {
    if (0 !== end % 4) { return undefined }
    if (src.endsWith('==')) { end -= 2 }
    else if (src.endsWith('=')) { end -= 1 }
  }
  if (1 === end % 4) { return undefined }

  const out: number[] = []
  let acc = 0
  let bits = 0
  for (let i = 0; i < end; i++) {
    const v = alphabet.indexOf(src[i])
    if (0 > v) { return undefined }
    acc = (acc << 6) | v
    bits += 6
    if (8 <= bits) {
      bits -= 8
      out.push(acc >> bits)
      acc &= (1 << bits) - 1
    }
  }

  return 0 === acc ? out : undefined
}


function hexEncode(bytes: number[]): string {
  let out = ''
  for (const b of bytes) { out += HEX_LOWER[b >> 4] + HEX_LOWER[b & 0x0F] }
  return out
}


function hexDecode(src: string): number[] | undefined {
  if (0 !== src.length % 2) { return undefined }
  const out: number[] = []
  for (let i = 0; i < src.length; i += 2) {
    const hi = hexDigit(src[i])
    const lo = hexDigit(src[i + 1])
    if (0 > hi || 0 > lo) { return undefined }
    out.push(hi * 16 + lo)
  }
  return out
}


// The one entry point each way. An unknown name never reaches here: the
// call refuses it (`encode_name`) before either is asked.
function encodeText(src: string, name: string): string {
  const bytes = textBytes(src)
  if ('base64' === name) { return b64Encode(bytes, B64_STD, true) }
  if ('base64url' === name) { return b64Encode(bytes, B64_URL, false) }
  return hexEncode(bytes)
}


function decodeText(src: string, name: string): [string, boolean] {
  const bytes =
    'base64' === name ? b64Decode(src, B64_STD, true) :
      'base64url' === name ? b64Decode(src, B64_URL, false) :
        hexDecode(src)
  return undefined === bytes ? ['', false] : utf8Text(bytes)
} /* node:coverage ignore next 8 */


export {
  ENCODE_NAMES,
  isEncodeName,
  encodeText,
  decodeText,
}
