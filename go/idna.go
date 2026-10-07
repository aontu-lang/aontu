/* Copyright (c) 2026 Richard Rodger, MIT License */

// IDNA2008 over the committed table (test/spec/files/idna.txt): UTS 46
// mapping and NFC, Punycode, and the label rules of RFC 5891, RFC 5892
// and RFC 5893. Twin of ts/src/idna.ts.

package aontu

import (
	_ "embed"
	"strconv"
	"strings"
	"sync"
)

//go:embed idnatable.txt
var idnaTableText string

type idnaRanges struct {
	lo, hi []rune
	v      []string
}

type idnaTable struct {
	status, category, mark, bidi, joining, script, ccc, exclusion idnaRanges
	mapping, decomposition                                        map[rune][]rune
	composition                                                   map[[2]rune]rune
}

var (
	idnaOnce sync.Once
	idnaTab  *idnaTable
)

func idnaHex(h string) rune {
	v, _ := strconv.ParseInt(h, 16, 32)
	return rune(v)
}

func idnaLoad() *idnaTable {
	sections := map[string][][]string{}
	at := ""
	for _, line := range strings.Split(idnaTableText, "\n") {
		if strings.HasPrefix(line, "@") {
			at = line[1:strings.Index(line, " ")]
		} else if "" != line && !strings.HasPrefix(line, "#") {
			sections[at] = append(sections[at], strings.Split(line, " "))
		}
	}
	ranges := func(name string) idnaRanges {
		r := idnaRanges{}
		for _, row := range sections[name] {
			lo, hi, isRange := strings.Cut(row[0], "-")
			if !isRange {
				hi = lo
			}
			r.lo = append(r.lo, idnaHex(lo))
			r.hi = append(r.hi, idnaHex(hi))
			r.v = append(r.v, row[1])
		}
		return r
	}
	maps := func(name string) map[rune][]rune {
		m := map[rune][]rune{}
		for _, row := range sections[name] {
			to := []rune{}
			for _, h := range row[1:] {
				to = append(to, idnaHex(h))
			}
			m[idnaHex(row[0])] = to
		}
		return m
	}
	t := &idnaTable{
		status: ranges("status"), category: ranges("category"),
		mark: ranges("mark"), bidi: ranges("bidi"), joining: ranges("joining"),
		script: ranges("script"), ccc: ranges("ccc"),
		exclusion:     ranges("exclusion"),
		mapping:       maps("mapping"),
		decomposition: maps("decomposition"),
		composition:   map[[2]rune]rune{},
	}
	for c, to := range t.decomposition {
		if 2 == len(to) && "" == t.exclusion.find(c) {
			t.composition[[2]rune{to[0], to[1]}] = c
		}
	}
	return t
}

func (r *idnaRanges) find(c rune) string {
	a, b := 0, len(r.lo)-1
	for a <= b {
		m := (a + b) >> 1
		if c < r.lo[m] {
			b = m - 1
		} else if r.hi[m] < c {
			a = m + 1
		} else {
			return r.v[m]
		}
	}
	return ""
}

func idnaT() *idnaTable {
	idnaOnce.Do(func() { idnaTab = idnaLoad() })
	return idnaTab
}

func idnaCCC(c rune) int {
	n, _ := strconv.Atoi(idnaT().ccc.find(c))
	return n
}

// Hangul syllables decompose and compose by arithmetic, not by table.
const (
	idnaSBase  = 0xac00
	idnaLBase  = 0x1100
	idnaVBase  = 0x1161
	idnaTBase  = 0x11a7
	idnaTCount = 28
	idnaNCount = 588
	idnaSCount = 11172
)

func idnaDecompose(c rune, out []rune) []rune {
	s := c - idnaSBase
	if 0 <= s && s < idnaSCount {
		out = append(out, idnaLBase+s/idnaNCount, idnaVBase+(s%idnaNCount)/idnaTCount)
		if 0 != s%idnaTCount {
			out = append(out, idnaTBase+s%idnaTCount)
		}
		return out
	}
	to, has := idnaT().decomposition[c]
	if !has {
		return append(out, c)
	}
	for _, d := range to {
		out = idnaDecompose(d, out)
	}
	return out
}

func idnaCompose(a, b rune) (rune, bool) {
	l, v := a-idnaLBase, b-idnaVBase
	if 0 <= l && l < 19 && 0 <= v && v < 21 {
		return idnaSBase + (l*21+v)*idnaTCount, true
	}
	s, t := a-idnaSBase, b-idnaTBase
	if 0 <= s && s < idnaSCount && 0 == s%idnaTCount && 0 < t && t < idnaTCount {
		return a + t, true
	}
	c, has := idnaT().composition[[2]rune{a, b}]
	return c, has
}

// idnaNFC is UAX 15: the canonical decomposition, its marks in
// canonical order, and every pair not blocked composed again.
func idnaNFC(cps []rune) []rune {
	d := []rune{}
	for _, c := range cps {
		d = idnaDecompose(c, d)
	}
	for i := 1; i < len(d); i++ {
		cc := idnaCCC(d[i])
		for j := i; 0 < cc && 0 < j && cc < idnaCCC(d[j-1]); j-- {
			d[j-1], d[j] = d[j], d[j-1]
		}
	}
	out := []rune{}
	starter, last := -1, 0
	for _, c := range d {
		cc := idnaCCC(c)
		if 0 <= starter && (len(out)-1 == starter || (0 != last && last < cc)) {
			if both, ok := idnaCompose(out[starter], c); ok {
				out[starter] = both
				continue
			}
		}
		if 0 == cc {
			starter = len(out)
		}
		out = append(out, c)
		last = cc
	}
	return out
}

// RFC 3492, section 6.
const (
	idnaBase   = 36
	idnaTMin   = 1
	idnaTMax   = 26
	idnaMaxInt = 0x7fffffff
)

func idnaAdapt(delta, n int64, first bool) int64 {
	if first {
		delta /= 700
	} else {
		delta /= 2
	}
	delta += delta / n
	k := int64(0)
	for delta > ((idnaBase-idnaTMin)*idnaTMax)>>1 {
		delta /= idnaBase - idnaTMin
		k += idnaBase
	}
	return k + (idnaBase-idnaTMin+1)*delta/(delta+38)
}

func idnaDigit(c byte) int64 {
	switch {
	case '0' <= c && c <= '9':
		return int64(c) - 22
	case 'A' <= c && c <= 'Z':
		return int64(c) - 'A'
	case 'a' <= c && c <= 'z':
		return int64(c) - 'a'
	}
	return idnaBase
}

func idnaThreshold(k, bias int64) int64 {
	if k <= bias {
		return idnaTMin
	}
	if k >= bias+idnaTMax {
		return idnaTMax
	}
	return k - bias
}

// idnaPunyDecode is false where the ASCII text is not Punycode or
// decodes past a scalar value; a delimiter at the very start is a digit,
// and refuses. The bound on i bounds w too.
func idnaPunyDecode(s string) ([]rune, bool) {
	end := strings.LastIndex(s, "-")
	out := []rune{}
	for k := 0; k < end; k++ {
		out = append(out, rune(s[k]))
	}
	n, i, bias := int64(0x80), int64(0), int64(72)
	p := 0
	if 0 < end {
		p = end + 1
	}
	for p < len(s) {
		old, w := i, int64(1)
		for k := int64(idnaBase); ; k += idnaBase {
			dg := int64(idnaBase)
			if p < len(s) {
				dg = idnaDigit(s[p])
				p++
			}
			if idnaBase <= dg || idnaMaxInt < i+dg*w {
				return nil, false
			}
			i += dg * w
			t := idnaThreshold(k, bias)
			if dg < t {
				break
			}
			w *= idnaBase - t
		}
		size := int64(len(out) + 1)
		bias = idnaAdapt(i-old, size, 0 == old)
		n += i / size
		i %= size
		if 0x10ffff < n || (0xd800 <= n && n <= 0xdfff) {
			return nil, false
		}
		out = append(out, 0)
		copy(out[i+1:], out[i:])
		out[i] = rune(n)
		i++
	}
	return out, true
}

func idnaPunyEncode(cps []rune) string {
	var b strings.Builder
	for _, c := range cps {
		if c < 0x80 {
			b.WriteRune(c)
		}
	}
	basic := b.Len()
	if 0 < basic {
		b.WriteByte('-')
	}
	n, delta, bias := int64(0x80), int64(0), int64(72)
	for h := basic; h < len(cps); {
		m := int64(-1)
		for _, c := range cps {
			if int64(c) >= n && (m < 0 || int64(c) < m) {
				m = int64(c)
			}
		}
		delta += (m - n) * int64(h+1)
		n = m
		for _, c := range cps {
			if int64(c) < n {
				delta++
			} else if int64(c) == n {
				q := delta
				for k := int64(idnaBase); ; k += idnaBase {
					t := idnaThreshold(k, bias)
					if q < t {
						break
					}
					dg := t + (q-t)%(idnaBase-t)
					b.WriteByte(idnaDigitByte(dg))
					q = (q - t) / (idnaBase - t)
				}
				b.WriteByte(idnaDigitByte(q))
				bias = idnaAdapt(delta, int64(h+1), h == basic)
				delta = 0
				h++
			}
		}
		delta++
		n++
	}
	return b.String()
}

func idnaDigitByte(d int64) byte {
	if d < 26 {
		return byte(d + 'a')
	}
	return byte(d + 22)
}

func idnaIsASCII(cps []rune) bool {
	for _, c := range cps {
		if 0x80 <= c {
			return false
		}
	}
	return true
}

func idnaHasAce(cps []rune) bool {
	if len(cps) < 4 {
		return false
	}
	for i, a := range "xn--" {
		c := cps[i]
		if 'A' <= c && c <= 'Z' {
			c += 0x20
		}
		if c != a {
			return false
		}
	}
	return true
}

func idnaInRange(c rune, lo, hi rune) bool { return lo <= c && c <= hi }

// idnaContext is RFC 5892 appendix A: the rule for each CONTEXTJ and
// CONTEXTO code point at position i of its label.
func idnaContext(label []rune, i int) bool {
	t := idnaT()
	c := label[i]
	before, after := rune(-1), rune(-1)
	if 0 < i {
		before = label[i-1]
	}
	if i+1 < len(label) {
		after = label[i+1]
	}
	if 0x200c == c || 0x200d == c {
		if 0 <= before && 9 == idnaCCC(before) {
			return true
		}
		if 0x200d == c {
			return false
		}
		jt := func(k int) string { return t.joining.find(label[k]) }
		a := i - 1
		for 0 <= a && "T" == jt(a) {
			a--
		}
		b := i + 1
		for b < len(label) && "T" == jt(b) {
			b++
		}
		return 0 <= a && ("L" == jt(a) || "D" == jt(a)) &&
			b < len(label) && ("R" == jt(b) || "D" == jt(b))
	}
	switch c {
	case 0xb7:
		return 0x6c == before && 0x6c == after
	case 0x375:
		return 0 <= after && "G" == t.script.find(after)
	case 0x5f3, 0x5f4:
		return 0 <= before && "H" == t.script.find(before)
	case 0x30fb:
		for _, x := range label {
			if "K" == t.script.find(x) {
				return true
			}
		}
		return false
	}
	lo, hi := rune(0x6f0), rune(0x6f9)
	if 0x6f0 <= c {
		lo, hi = 0x660, 0x669
	}
	for _, x := range label {
		if idnaInRange(x, lo, hi) {
			return false
		}
	}
	return true
}

// idnaValidLabel is UTS 46's validity criteria, nontransitional, with
// CheckHyphens, CheckJoiners and UseSTD3ASCIIRules, and the IDNA2008
// property of each code point beside its status.
func idnaValidLabel(label []rune) bool {
	t := idnaT()
	n := idnaNFC(label)
	if len(n) != len(label) {
		return false
	}
	for i := range n {
		if n[i] != label[i] {
			return false
		}
	}
	last := len(label) - 1
	if (3 < len(label) && 0x2d == label[2] && 0x2d == label[3]) ||
		0x2d == label[0] || 0x2d == label[last] || "M" == t.mark.find(label[0]) {
		return false
	}
	for i, c := range label {
		cat := t.category.find(c)
		if "V" != t.status.find(c) || "" == cat ||
			!(c >= 0x80 || idnaInRange(c, 'a', 'z') || idnaInRange(c, '0', '9') || 0x2d == c) ||
			("P" != cat && !idnaContext(label, i)) {
			return false
		}
	}
	return true
}

func idnaHas(set []string, v string) bool {
	for _, s := range set {
		if s == v {
			return true
		}
	}
	return false
}

var (
	idnaRTL    = []string{"R", "AL", "AN"}
	idnaLTR    = []string{"L", "EN", "ES", "CS", "ET", "ON", "BN", "NSM"}
	idnaRTLAll = []string{"R", "AL", "AN", "EN", "ES", "CS", "ET", "ON", "BN", "NSM"}
)

// idnaBidiLabel is RFC 5893 section 2, for each label of a name any
// label of which holds a right-to-left character.
func idnaBidiLabel(label []rune) bool {
	t := idnaT()
	cls := make([]string, len(label))
	for i, c := range label {
		cls[i] = t.bidi.find(c)
	}
	end := len(cls) - 1
	for 0 < end && "NSM" == cls[end] {
		end--
	}
	all := func(set []string) bool {
		for _, b := range cls {
			if !idnaHas(set, b) {
				return false
			}
		}
		return true
	}
	if "L" == cls[0] {
		return all(idnaLTR) && ("L" == cls[end] || "EN" == cls[end])
	}
	return ("R" == cls[0] || "AL" == cls[0]) && all(idnaRTLAll) &&
		(idnaHas(idnaRTL, cls[end]) || "EN" == cls[end]) &&
		!(idnaHas(cls, "EN") && idnaHas(cls, "AN"))
}

// idnaULabels is each label's code points, an A-label decoded and
// checked to encode back to itself; false where one fails. Unless
// every, a label that is not an A-label is the caller's to check.
func idnaULabels(labels [][]rune, every bool) ([][]rune, bool) {
	out := [][]rune{}
	for _, label := range labels {
		u, decoded := label, false
		if idnaHasAce(label) {
			body := string(label[4:])
			d, ok := []rune(nil), false
			if idnaIsASCII(label) {
				d, ok = idnaPunyDecode(body)
			}
			if !ok || idnaIsASCII(d) || idnaPunyEncode(d) != strings.ToLower(body) {
				return nil, false
			}
			u, decoded = d, true
		}
		if 0 == len(u) || ((every || decoded) && !idnaValidLabel(u)) {
			return nil, false
		}
		out = append(out, u)
	}
	t := idnaT()
	rtl := false
	for _, u := range out {
		for _, c := range u {
			rtl = rtl || idnaHas(idnaRTL, t.bidi.find(c))
		}
	}
	if rtl {
		for _, u := range out {
			if !idnaBidiLabel(u) {
				return nil, false
			}
		}
	}
	return out, true
}

func idnaSplit(cps []rune) [][]rune {
	out := [][]rune{{}}
	for _, c := range cps {
		if 0x2e == c {
			out = append(out, []rune{})
		} else {
			out[len(out)-1] = append(out[len(out)-1], c)
		}
	}
	return out
}

// idnaDNSLength: the name's labels as DNS carries them: none past 63,
// and the name not past 253.
func idnaDNSLength(us [][]rune) bool {
	total := len(us) - 1
	for _, u := range us {
		n := len(u)
		if !idnaIsASCII(u) {
			n = 4 + len(idnaPunyEncode(u))
		}
		if n < 1 || 63 < n {
			return false
		}
		total += n
	}
	return total <= 253
}

// idnaALabelsValid is RFC 5891 section 5.4 for each A-label of a host
// name already made of letters, digits and hyphens.
func idnaALabelsValid(s string) bool {
	labels := idnaSplit([]rune(s))
	for _, label := range labels {
		if idnaHasAce(label) {
			_, ok := idnaULabels(labels, false)
			return ok
		}
	}
	return true
}

// idnaIsIdnHostname is UTS 46 processing: map, normalise, break at the
// full stop, then validate each label and the name's length.
func idnaIsIdnHostname(s string) bool {
	t := idnaT()
	mapped := []rune{}
	for _, c := range s {
		switch t.status.find(c) {
		case "M":
			mapped = append(mapped, t.mapping[c]...)
		case "I":
		default:
			mapped = append(mapped, c)
		}
	}
	us, ok := idnaULabels(idnaSplit(idnaNFC(mapped)), true)
	return ok && idnaDNSLength(us)
}
