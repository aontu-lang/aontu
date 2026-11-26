/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"strings"
	"unicode/utf8"
)

var encodeNames = []string{"base64", "base64url", "hex"}

const b64Std = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

const b64Url = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

func isEncodeName(v string) bool {
	for _, n := range encodeNames {
		if n == v {
			return true
		}
	}
	return false
}

func b64Encode(bytes []byte, alphabet string, pad bool) string {
	var out strings.Builder
	for i := 0; i < len(bytes); i += 3 {
		n := len(bytes) - i
		b0 := bytes[i]
		var b1, b2 byte
		if 1 < n {
			b1 = bytes[i+1]
		}
		if 2 < n {
			b2 = bytes[i+2]
		}

		out.WriteByte(alphabet[b0>>2])
		out.WriteByte(alphabet[((b0&0x03)<<4)|(b1>>4)])
		if 1 < n {
			out.WriteByte(alphabet[((b1&0x0F)<<2)|(b2>>6)])
		} else if pad {
			out.WriteByte('=')
		}
		if 2 < n {
			out.WriteByte(alphabet[b2&0x3F])
		} else if pad {
			out.WriteByte('=')
		}
	}
	return out.String()
}

// b64Decode reads only the text b64Encode writes: a host decoder also
// takes line breaks, missing padding and stray low bits, each a second
// spelling of the same bytes.
func b64Decode(src string, alphabet string, pad bool) ([]byte, bool) {
	end := len(src)
	if pad {
		if 0 != end%4 {
			return nil, false
		}
		if strings.HasSuffix(src, "==") {
			end -= 2
		} else if strings.HasSuffix(src, "=") {
			end -= 1
		}
	}
	if 1 == end%4 {
		return nil, false
	}

	out := make([]byte, 0, end)
	acc := 0
	bits := 0
	for i := 0; i < end; i++ {
		v := strings.IndexByte(alphabet, src[i])
		if 0 > v {
			return nil, false
		}
		acc = (acc << 6) | v
		bits += 6
		if 8 <= bits {
			bits -= 8
			out = append(out, byte(acc>>bits))
			acc &= (1 << bits) - 1
		}
	}

	return out, 0 == acc
}

func hexEncode(bytes []byte) string {
	var out strings.Builder
	for _, b := range bytes {
		out.WriteByte(escHexLower[b>>4])
		out.WriteByte(escHexLower[b&0x0F])
	}
	return out.String()
}

func hexDecode(src string) ([]byte, bool) {
	if 0 != len(src)%2 {
		return nil, false
	}
	out := make([]byte, 0, len(src)/2)
	for i := 0; i < len(src); i += 2 {
		hi := hexDigit(rune(src[i]))
		lo := hexDigit(rune(src[i+1]))
		if 0 > hi || 0 > lo {
			return nil, false
		}
		out = append(out, byte(hi*16+lo))
	}
	return out, true
}

// encodeText is the one entry point each way. An unknown name never
// reaches here: the call refuses it (encode_name) before either is
// asked.
func encodeText(src string, name string) string {
	bytes := []byte(src)
	if "base64" == name {
		return b64Encode(bytes, b64Std, true)
	}
	if "base64url" == name {
		return b64Encode(bytes, b64Url, false)
	}
	return hexEncode(bytes)
}

func decodeText(src string, name string) (string, bool) {
	var bytes []byte
	var ok bool
	if "base64" == name {
		bytes, ok = b64Decode(src, b64Std, true)
	} else if "base64url" == name {
		bytes, ok = b64Decode(src, b64Url, false)
	} else {
		bytes, ok = hexDecode(src)
	}
	if !ok || !utf8.Valid(bytes) {
		return "", false
	}
	return string(bytes), true
}
