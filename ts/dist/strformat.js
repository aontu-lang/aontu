"use strict";
/* Copyright (c) 2026 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UNCHECKED = void 0;
exports.formatCheck = formatCheck;
// The string formats `format(name)` asserts, written out as each RFC
// states them rather than taken from a host library or the grammar
// engine, so that both ports answer alike. Twin of go/strformat.go.
const idna_1 = require("./idna");
const isDigit = (c) => 0x30 <= c && c <= 0x39;
const isAlpha = (c) => (0x41 <= c && c <= 0x5a) || (0x61 <= c && c <= 0x7a);
const isHex = (c) => isDigit(c) || (0x41 <= c && c <= 0x46) || (0x61 <= c && c <= 0x66);
function digits(s, at, n) {
    let v = 0;
    for (let i = at; i < at + n; i++) {
        const c = s.charCodeAt(i);
        if (!isDigit(c)) {
            return undefined;
        }
        v = v * 10 + c - 0x30;
    }
    return v;
}
function daysIn(y, m) {
    const leap = (0 === y % 4 && 0 !== y % 100) || 0 === y % 400;
    return 2 === m ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;
}
// RFC 3339 section 5.6, full-date.
function isDate(s) {
    const y = digits(s, 0, 4);
    const m = digits(s, 5, 2);
    const d = digits(s, 8, 2);
    return 10 === s.length && '-' === s[4] && '-' === s[7] &&
        undefined !== y && undefined !== m && undefined !== d &&
        1 <= m && m <= 12 && 1 <= d && d <= daysIn(y, m);
}
// RFC 3339 section 5.6, full-time. A leap second stands only at the
// last minute of the day in UTC, wherever the offset puts it locally.
function isTime(s) {
    const h = digits(s, 0, 2);
    const mi = digits(s, 3, 2);
    const se = digits(s, 6, 2);
    if (':' !== s[2] || ':' !== s[5] || undefined === h || undefined === mi ||
        undefined === se || 23 < h || 59 < mi || 60 < se) {
        return false;
    }
    let i = 8;
    if ('.' === s[i]) {
        const from = ++i;
        while (isDigit(s.charCodeAt(i))) {
            i++;
        }
        if (from === i) {
            return false;
        }
    }
    let off = 0;
    if ('Z' === s[i] || 'z' === s[i]) {
        i++;
    }
    else if ('+' === s[i] || '-' === s[i]) {
        const oh = digits(s, i + 1, 2);
        const om = digits(s, i + 4, 2);
        if (':' !== s[i + 3] || undefined === oh || undefined === om ||
            23 < oh || 59 < om) {
            return false;
        }
        off = ('+' === s[i] ? 1 : -1) * (oh * 60 + om);
        i += 6;
    }
    else {
        return false;
    }
    return i === s.length &&
        (60 !== se || 1439 === ((h * 60 + mi - off) % 1440 + 1440) % 1440);
}
function isDateTime(s) {
    return ('T' === s[10] || 't' === s[10]) && isDate(s.substring(0, 10)) &&
        isTime(s.substring(11));
}
// RFC 3339 appendix A, whose ABNF designators match in either case,
// each spelled out, since case folding admits U+017F for s.
const DUR = '(?:[0-9]+[Hh](?:[0-9]+[Mm](?:[0-9]+[Ss])?)?|[0-9]+[Mm](?:[0-9]+[Ss])?|[0-9]+[Ss])';
const DURATION = new RegExp('^[Pp](?:[0-9]+[Ww]|(?:[0-9]+[Yy](?:[0-9]+[Mm](?:[0-9]+[Dd])?)?' +
    '|[0-9]+[Mm](?:[0-9]+[Dd])?|[0-9]+[Dd])(?:[Tt]' + DUR + ')?|[Tt]' + DUR + ')$');
const OCTET = '(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])';
const IPV4 = new RegExp('^' + OCTET + '(?:\\.' + OCTET + '){3}$');
function isIpv4(s) {
    return IPV4.test(s);
}
// RFC 4291 section 2.2: hexadecimal groups, a "::" standing for `gap`
// or more of them, and the last two written as a dotted quad if wished.
function isIpv6(s, gap) {
    const halves = s.split('::');
    if (2 < halves.length) {
        return false;
    }
    const groups = (part, last) => {
        if ('' === part) {
            return 0;
        }
        const gs = part.split(':');
        let n = 0;
        for (let i = 0; i < gs.length; i++) {
            const g = gs[i];
            if (last && i === gs.length - 1 && g.includes('.')) {
                if (!isIpv4(g)) {
                    return undefined;
                }
                n += 2;
            }
            else if (0 < g.length && g.length <= 4 &&
                [...g].every((c) => isHex(c.charCodeAt(0)))) {
                n++;
            }
            else {
                return undefined;
            }
        }
        return n;
    };
    const head = groups(halves[0], 1 === halves.length);
    const tail = 2 === halves.length ? groups(halves[1], true) : 0;
    return undefined !== head && undefined !== tail &&
        (1 === halves.length ? 8 === head : head + tail <= 8 - gap);
}
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
function isUuid(s) {
    return UUID.test(s);
}
// RFC 1123 section 2.1: labels of letters, digits and inner hyphens, at
// most 63 each and 253 in all, an A-label among them valid by RFC 5891.
const LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
function isHostname(s) {
    return 0 < s.length && s.length <= 253 &&
        s.split('.').every((label) => LABEL.test(label)) && (0, idna_1.aLabelsValid)(s);
}
// RFC 5321 section 4.1.2, Mailbox.
const ATEXT = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+";
const DOT_STRING = new RegExp('^' + ATEXT + '(?:\\.' + ATEXT + ')*$');
const QUOTED = /^"(?:[\x20\x21\x23-\x5b\x5d-\x7e]|\\[\x20-\x7e])*"$/;
// A local part may hold any non-ASCII character, by RFC 6531.
const UATEXT = "(?:[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]|[^\\x00-\\x7f])+";
const UDOT_STRING = new RegExp('^' + UATEXT + '(?:\\.' + UATEXT + ')*$');
const UQUOTED = /^"(?:[\x20\x21\x23-\x5b\x5d-\x7e]|[^\x00-\x7f]|\\[\x20-\x7e])*"$/;
function mailbox(s, idn) {
    const at = s.lastIndexOf('@');
    if (at < 1) {
        return false;
    }
    const local = s.substring(0, at);
    const domain = s.substring(at + 1);
    if (!(idn ? UDOT_STRING : DOT_STRING).test(local) &&
        !(idn ? UQUOTED : QUOTED).test(local)) {
        return false;
    }
    if (domain.startsWith('[') && domain.endsWith(']')) {
        const lit = domain.substring(1, domain.length - 1);
        // RFC 5321 section 4.1.3: an address literal's "::" elides a pair of
        // groups at least.
        return isIpv4(lit) ||
            (/^[Ii][Pp][Vv]6:/.test(lit) && isIpv6(lit.substring(5), 2));
    }
    return (idn ? idna_1.isIdnHostname : isHostname)(domain);
}
// RFC 6901 section 3: a "~" escapes "0" or "1" and nothing else.
function isJsonPointer(s) {
    if ('' !== s && '/' !== s[0]) {
        return false;
    }
    for (let i = 0; i < s.length; i++) {
        if ('~' === s[i] && '0' !== s[i + 1] && '1' !== s[i + 1]) {
            return false;
        }
    }
    return true;
}
// The relative JSON pointer JSON Schema names: a non-negative integer,
// then "#" or a JSON pointer.
function isRelativeJsonPointer(s) {
    const m = /^(?:0|[1-9][0-9]*)/.exec(s);
    if (null === m) {
        return false;
    }
    const rest = s.substring(m[0].length);
    return '#' === rest || isJsonPointer(rest);
}
// RFC 3986 section 3, and RFC 3987 section 2.2 for an IRI, whose
// unreserved characters take in the Unicode ranges ucschar names and
// whose query takes iprivate as well.
function ucschar(c) {
    return (0xa0 <= c && c <= 0xd7ff) || (0xf900 <= c && c <= 0xfdcf) ||
        (0xfdf0 <= c && c <= 0xffef) ||
        (0x10000 <= c && c <= 0xefffd && 0xfffe > (c & 0xffff));
}
function iprivate(c) {
    return (0xe000 <= c && c <= 0xf8ff) ||
        (0xf0000 <= c && c <= 0x10fffd && 0xfffe > (c & 0xffff));
}
// Every character of `s` is one the class allows, a percent-encoding
// included.
function clean(s, cls, iri) {
    const cps = [...s];
    for (let i = 0; i < cps.length; i++) {
        const c = cps[i].codePointAt(0);
        if ('%' === cps[i]) {
            if (!(i + 2 < cps.length && isHex(cps[i + 1].charCodeAt(0)) &&
                isHex(cps[i + 2].charCodeAt(0)))) {
                return false;
            }
            i += 2;
        }
        else if (!(isAlpha(c) || isDigit(c) || "-._~!$&'()*+,;=".includes(cps[i]) ||
            (':' === cps[i] && 'reg' !== cls) ||
            ('@' === cps[i] && 'reg' !== cls && 'user' !== cls) ||
            (('/' === cps[i] || '?' === cps[i]) && ('query' === cls || 'frag' === cls)) ||
            (iri && (ucschar(c) || ('query' === cls && iprivate(c)))))) {
            return false;
        }
    }
    return true;
}
function isPath(path, iri) {
    return path.split('/').every((seg) => clean(seg, 'pchar', iri));
}
const IPVFUTURE = /^[Vv][0-9a-fA-F]+\.[A-Za-z0-9\-._~!$&'()*+,;=:]+$/;
// A reg-name holds no colon, so the last one starts the port.
function isAuthority(auth, iri) {
    const at = auth.lastIndexOf('@');
    if (0 <= at && !clean(auth.substring(0, at), 'user', iri)) {
        return false;
    }
    const hostport = auth.substring(at + 1);
    if (hostport.startsWith('[')) {
        const end = hostport.indexOf(']');
        const lit = hostport.substring(1, end);
        return 0 < end && /^(?::[0-9]*)?$/.test(hostport.substring(end + 1)) &&
            (isIpv6(lit, 1) || IPVFUTURE.test(lit));
    }
    const colon = hostport.lastIndexOf(':');
    return (colon < 0 || /^[0-9]*$/.test(hostport.substring(colon + 1))) &&
        clean(colon < 0 ? hostport : hostport.substring(0, colon), 'reg', iri);
}
const SCHEME = /^[A-Za-z][A-Za-z0-9+\-.]*$/;
const SPLIT = /^(?:([^:/?#]+):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/s;
function isUriRef(s, absolute, iri) {
    const m = SPLIT.exec(s);
    const [, scheme, auth, path, query, frag] = m;
    if (undefined === scheme ? absolute : !SCHEME.test(scheme)) {
        return false;
    }
    if (undefined !== auth) {
        if (!isAuthority(auth, iri) || ('' !== path && !path.startsWith('/'))) {
            return false;
        }
    }
    else if (path.startsWith('//') ||
        (undefined === scheme && path.split('/')[0].includes(':'))) {
        return false;
    }
    return isPath(path, iri) &&
        (undefined === query || clean(query, 'query', iri)) &&
        (undefined === frag || clean(frag, 'frag', iri));
}
// RFC 6570 section 2: literals, and expressions of variable lists with
// an optional operator, a prefix modifier or an explode each.
const VARCHAR = '(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})';
const VARSPEC = VARCHAR + '+(?:\\.' + VARCHAR + '+)*(?::[1-9][0-9]{0,3}|\\*)?';
const EXPRESSION = new RegExp('^[+#./;?&=,!@|]?' + VARSPEC +
    '(?:,' + VARSPEC + ')*$');
function isUriTemplate(s) {
    let i = 0;
    const cps = [...s];
    while (i < cps.length) {
        const ch = cps[i];
        if ('{' === ch) {
            const end = cps.indexOf('}', i);
            if (end < 0 || !EXPRESSION.test(cps.slice(i + 1, end).join(''))) {
                return false;
            }
            i = end + 1;
        }
        else if ('%' === ch) {
            if (!(isHex((cps[i + 1] ?? '').charCodeAt(0)) &&
                isHex((cps[i + 2] ?? '').charCodeAt(0)))) {
                return false;
            }
            i += 3;
        }
        else {
            const c = ch.codePointAt(0);
            if (c <= 0x20 || 0x7f === c || '"<>\\^`{|}'.includes(ch) ||
                (0x7f < c && !ucschar(c) && !iprivate(c))) {
                return false;
            }
            i++;
        }
    }
    return true;
}
const CHECKS = {
    'date': isDate,
    'time': isTime,
    'date-time': isDateTime,
    'duration': (s) => DURATION.test(s),
    'ipv4': isIpv4,
    'ipv6': (s) => isIpv6(s, 1),
    'uuid': isUuid,
    'hostname': isHostname,
    'idn-hostname': idna_1.isIdnHostname,
    'email': (s) => mailbox(s, false),
    'idn-email': (s) => mailbox(s, true),
    'json-pointer': isJsonPointer,
    'relative-json-pointer': isRelativeJsonPointer,
    'uri': (s) => isUriRef(s, true, false),
    'uri-reference': (s) => isUriRef(s, false, false),
    'iri': (s) => isUriRef(s, true, true),
    'iri-reference': (s) => isUriRef(s, false, true),
    'uri-template': isUriTemplate,
};
// The formats JSON Schema defines that no checker here answers yet.
const UNCHECKED = ['regex'];
exports.UNCHECKED = UNCHECKED;
// The checker a format name asks for, undefined for a name with none.
function formatCheck(name) {
    return Object.prototype.hasOwnProperty.call(CHECKS, name) ?
        CHECKS[name] : undefined;
} /* node:coverage ignore next 6 */
//# sourceMappingURL=strformat.js.map