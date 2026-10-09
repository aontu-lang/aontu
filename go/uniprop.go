/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	_ "embed"
	"sort"
	"strings"
	"sync"
)

// The Unicode properties a pattern's \p{...} names in ECMA-262's u mode
// (ADR-060), read from the tables ts/scripts/unicodegen.cjs writes. A
// table is decoded the first time a pattern names it. Twin of
// ts/src/uniprop.ts.

//go:embed unicodeprops.txt
var unicodeProps string

type uRanges [][2]int

const uMax = 0x10FFFF

type uEntry struct {
	kind   string
	names  []string
	data   string
	ranges uRanges
	done   bool
}

type uTables struct {
	byName   map[string]*uEntry
	order    []*uEntry
	scx      []*uEntry
	scxCache map[string]uRanges
	scxAll   uRanges
	scxDone  bool
}

var uOnce sync.Once
var uTabs *uTables
var uLock sync.Mutex

const uA64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

func uDecode(data string) uRanges {
	out := uRanges{}
	at, i := 0, 0
	next := func() int {
		n, shift := 0, 1
		for {
			d := strings.IndexByte(uA64, data[i])
			i++
			n += (d & 31) * shift
			if 0 == d&32 {
				return n
			}
			shift *= 32
		}
	}
	for i < len(data) {
		lo := at + next()
		hi := lo + next()
		out = append(out, [2]int{lo, hi})
		at = hi + 1
	}
	return out
}

func uUnion(sets []uRanges) uRanges {
	all := uRanges{}
	for _, s := range sets {
		all = append(all, s...)
	}
	sort.SliceStable(all, func(a, b int) bool { return all[a][0] < all[b][0] })
	out := uRanges{}
	for _, r := range all {
		if n := len(out); 0 < n && r[0] <= out[n-1][1]+1 {
			out[n-1][1] = max(out[n-1][1], r[1])
		} else {
			out = append(out, r)
		}
	}
	return out
}

func uComplement(rs uRanges) uRanges {
	out := uRanges{}
	at := 0
	for _, r := range rs {
		if at < r[0] {
			out = append(out, [2]int{at, r[0] - 1})
		}
		at = r[1] + 1
	}
	if at <= uMax {
		out = append(out, [2]int{at, uMax})
	}
	return out
}

func uMinus(a, b uRanges) uRanges {
	return uComplement(uUnion([]uRanges{uComplement(a), b}))
}

func uLoad() *uTables {
	t := &uTables{byName: map[string]*uEntry{}, scxCache: map[string]uRanges{}}
	for _, line := range strings.Split(unicodeProps, "\n") {
		if "" == line || strings.HasPrefix(line, "#") {
			continue
		}
		f := strings.Split(line, "\t")
		e := &uEntry{kind: f[0], names: strings.Split(f[1], " "), data: f[2]}
		if "scx" == e.kind {
			t.scx = append(t.scx, e)
			continue
		}
		t.order = append(t.order, e)
		kind := e.kind
		if "gcg" == kind {
			kind = "gc"
		}
		for _, n := range e.names {
			t.byName[kind+":"+n] = e
		}
	}
	return t
}

func (t *uTables) rangesOf(e *uEntry) uRanges {
	if e.done {
		return e.ranges
	}
	switch {
	case "gcg" == e.kind:
		sets := []uRanges{}
		for _, v := range strings.Split(e.data, " ") {
			sets = append(sets, t.rangesOf(t.byName["gc:"+v]))
		}
		e.ranges = uUnion(sets)
	case "sc" == e.kind && "Zzzz" == e.names[0]:
		// Unknown is every code point no other script holds.
		sets := []uRanges{}
		for _, x := range t.order {
			if "sc" == x.kind && x != e {
				sets = append(sets, t.rangesOf(x))
			}
		}
		e.ranges = uComplement(uUnion(sets))
	default:
		e.ranges = uDecode(e.data)
	}
	e.done = true
	return e.ranges
}

// extensionsOf is a script's Script_Extensions: its own code points
// where ScriptExtensions.txt says nothing, and each set the file names
// it in.
func (t *uTables) extensionsOf(e *uEntry) uRanges {
	if had, ok := t.scxCache[e.names[0]]; ok {
		return had
	}
	if !t.scxDone {
		sets := []uRanges{}
		for _, x := range t.scx {
			sets = append(sets, t.rangesOf(x))
		}
		t.scxAll, t.scxDone = uUnion(sets), true
	}
	sets := []uRanges{uMinus(t.rangesOf(e), t.scxAll)}
	for _, x := range t.scx {
		for _, n := range x.names {
			if n == e.names[0] {
				sets = append(sets, t.rangesOf(x))
			}
		}
	}
	out := uUnion(sets)
	t.scxCache[e.names[0]] = out
	return out
}

var uOwn = map[string]uRanges{"ASCII": {{0, 0x7F}}, "Any": {{0, uMax}}}

// unicodeProperty is the code points of \p{name} or \p{name=value}, or
// false where ECMA-262's lists hold no such property or value. Names are
// exact.
func unicodeProperty(name string, value string, hasValue bool) (uRanges, bool) {
	uOnce.Do(func() { uTabs = uLoad() })
	uLock.Lock()
	defer uLock.Unlock()
	t := uTabs
	get := func(kind, n string) (uRanges, bool) {
		e, ok := t.byName[kind+":"+n]
		if !ok {
			return nil, false
		}
		return t.rangesOf(e), true
	}
	if !hasValue {
		if "Assigned" == name {
			cn, _ := get("gc", "Cn")
			return uComplement(cn), true
		}
		if rs, ok := uOwn[name]; ok {
			return rs, true
		}
		if rs, ok := get("gc", name); ok {
			return rs, true
		}
		return get("bin", name)
	}
	switch name {
	case "General_Category", "gc":
		return get("gc", value)
	case "Script", "sc":
		return get("sc", value)
	case "Script_Extensions", "scx":
		e, ok := t.byName["sc:"+value]
		if !ok {
			return nil, false
		}
		return t.extensionsOf(e), true
	}
	return nil, false
}
