/* Copyright (c) 2025 Richard Rodger, MIT License */

// Package aontu is a Go port of the Aontu JSON structure unifier.
//
// Aontu unifies JSON-like structures using a CUE-inspired value
// lattice. The canonical implementation is the TypeScript code under
// ../ts/src; this package mirrors its core unification semantics and
// is validated against the shared test specs in ../test/spec (run by
// both implementations).
//
// Coverage note: this port has full parity with the TypeScript language
// — scalars, scalar kinds, maps (nesting, merge, spreads &:, optional
// keys, close/open), lists (incl. &: spreads), conjunction (&),
// disjunction (|), preference (*), references ($.a.b / .x.a / $KEY),
// $name variables, the + operator, all eighteen built-in functions
// (upper/lower/copy/key/pref/super/type/hide/close/open/move/path and
// the constraint atoms min/max/above/below/neq), type/hide marks and
// @"file" source loading.
package aontu

import (
	"fmt"
	"strings"
)

// DONE marks a Val whose unification has fully converged.
const DONE = -1

// Val is the interface implemented by every value in the lattice.
type Val interface {
	// Canon returns the canonical, source-like representation.
	Canon() string

	// Gen produces the native Go value for output (JSON generation).
	// A non-nil error means the value could not be generated (e.g. an
	// unresolved type, conjunct or nil).
	Gen(ctx *Ctx) (any, error)

	// Unify combines this Val with peer, returning the result. The
	// result is a NilVal (Nil() == true) when they cannot unify.
	Unify(peer Val, ctx *Ctx) Val

	// Dc reports the done-counter; DONE means fully resolved.
	Dc() int

	// Nil reports whether this Val is a Nil (unification failure).
	Nil() bool

	setDc(dc int)
	pos() int
	setPos(p int)

	// srctext is the SOURCE TEXT this value was written as, and
	// srclen its extent in UTF-16 code units -- the units columns are
	// already counted in (see utf16Len). Together with pos they make a
	// site editable: canon is not source text, so `0x1F` (canon `31`)
	// cannot be replaced by canon's length without corrupting the
	// document. The twin is Site.len/Site.src in ts/src/site.ts, which
	// carries the full note.
	//
	// THE EXTENT IS DERIVED FROM THE TEXT, in both ports, so the two
	// cannot drift: TypeScript takes `src.length` (UTF-16 natively) and
	// this takes utf16Len(stext). Reading the token's own `len` field
	// instead would be one more thing to keep in step for no gain.
	srctext() string
	srclen() int
	setSrctext(text string)
	posu() bool
	setPosu(u bool)
	srcurl() string
	setSrcurl(u string)
	cjo() int
	superior() Val

	// vpath is the path from the root to this Val, used by references.
	vpath() []string
	setvpath(p []string)

	// Marks: type values are constraints, hidden values are excluded
	// from generation. Both are skipped when generating a containing map.
	markedType() bool
	// fromSpread reports the G7 provenance mark (see base.fspr).
	fromSpread() bool
	setFromSpread()
	deprecRec() map[string]string
	setDeprecRec(rec map[string]string)
	entityName() string
	setEntityName(name string)
	linkAddr() string
	setLinkAddr(addr string)
	markedHide() bool
	setMarkType(v bool)
	setMarkHide(v bool)
}

// base provides the shared, defaulted Val state. Concrete Val types
// embed it and override Canon/Gen/Unify/superior (and cjo/Nil where
// they differ).
// unsited is the source position of a value NO AUTHOR WROTE.
//
// Zero cannot mean "unset" here: it is a real position, the first byte
// of the document, so a value minted by unification was indistinguishable
// from one written at the very start and every site built from it read
// "row 1, column 1". The canonical port has no such ambiguity -- a TS
// site starts at -1 and only the parser moves it (ts/src/site.ts) -- and
// this makes Go say the same thing structurally: EVERY constructor
// starts here and the parser moves it with setPos.
//
// Established one divergence at a time before it was made an invariant:
// conjuncts, disjuncts, tops and nils each set it for their own reason,
// and scalars, funcs, maps, lists, refs and the rest were found reporting
// 1:1 for arithmetic results and piped calls. Pinned by the vet-minted-*
// rows (test/spec/vet.tsv) and why-piped-call-is-unsited (why.tsv).
const unsited = -1

type base struct {
	dc   int
	sp   int      // source position (byte offset), used to order error operands
	path []string // path from root (for reference resolution)
	// The source TEXT this value was written as, the other half of sp.
	// Empty means NO SPAN -- the value was minted by unification rather
	// than written, or its rule had no open token -- and srclen answers
	// -1 there, the same "unknown" row and col already use. A token with
	// no text is no span, in both ports, which is what lets Go leave
	// this at its zero value everywhere a Val is constructed instead of
	// threading a -1 default through every newX. See ts/src/site.ts.
	stext string
	// spu marks a clone-minted value. TS sites carry a url that is null
	// on parsed values and BECOMES '' at Val.clone (`?? ''`), and
	// NilVal.make's later-in-source primary flip fires only when the two
	// operands' urls are EQUAL — so a cloned operand meeting a parsed
	// one keeps the driving operand primary regardless of position.
	// spu is that url distinction: false = parsed (TS null), true =
	// minted by clonePath's top level (TS ''). Children of a clone stay
	// false, as TS's shallow clone shares the original children.
	//
	// KNOWN WRONG SET (issue #63). TS's clone COPIES the url, so what it
	// really separates is "sited by the parser" from "made during
	// evaluation" -- which is not the same partition as clone-vs-parsed,
	// and the frames of a spread-applied conflict come out in the
	// opposite order because of it. Marking parse-sited values instead
	// is the fix, and it is its own change.
	spu bool
	// surl is the value's SOURCE NAME, the other half of the url TS
	// carries on every site. spu above is only a distinction (parsed vs
	// clone-minted) because, until a caller supplies real names, that is
	// all the url ever amounts to here: one entry source, one text. The
	// validation verb (vet.go) breaks that assumption -- it unifies TWO
	// documents in one run -- so a value has to be able to say WHICH
	// document it came from, both to be role-tagged in a report and to
	// have its row/column computed against the right text. Empty means
	// unnamed, which is every value in a single-source run.
	surl  string
	mtype bool // type mark
	mhide bool // hide mark
	// fspr marks a spread template's per-key clone, set at the one
	// place a spread is applied and only on an INSTRUMENTED run (G7
	// phase 4). Read by the provenance recorder; nothing else.
	fspr bool
	// The deprecation record (G3 phase 4, `deprecate(x, m)`): boolean
	// marks cannot hold a message, a replacement path and a version, so
	// the value carries one optional record (keys msg/use/since, values
	// strings). Propagated through meets by propagateMarks and carried
	// by clonePath, exactly as the boolean marks are; canon renders it
	// back reparseably (canonRiders). Mirrors Val.deprecation in
	// ts/src/val/Val.ts.
	deprec map[string]string
	// The IDENTITY (G4 phase 1, `id(name)`): the entity this value IS.
	// A separate slot for the same reason the deprecation record has one
	// — a boolean mark cannot hold a name — and carried through meets by
	// the same rider in unite. Unlike the marks, Canon RENDERS it:
	// identity is semantic content, and G6's canon-hash must see it.
	// Empty means anonymous. Mirrors Val.entity in ts/src/val/Val.ts.
	entity string
	// The LINK (G4 phase 2/3): the entity address a `refer` resolved
	// to, stamped on the string it answers. The string IS the value — a
	// link, not an embedding — so nothing downstream could otherwise
	// tell a checked link from a literal that happens to look like one,
	// and the edge set (graph.go) is exactly the set of these.
	link string
	// spr records the identity of the spread constraint already merged
	// into this value (the `_spr` stamp in TS MapVal.unify): the spread
	// applies ONCE per child, and later passes only self-unify.
	spr Val
	// pdep caches the hasPathFunc classification (0 unknown, 1 yes,
	// 2 no), mirroring the memoized `_isPathDependent` getter in TS
	// Val: in-place refinement can resolve a key()/ref after first
	// classification, and the cached answer must survive that, so the
	// spread clone-vs-share decision stays stable across passes.
	// Clones start unclassified, as in TS (clonePath builds fresh
	// structs for every composite kind).
	pdep int8
}

func (b *base) setVpath(p []string) { b.path = p }

func (b *base) getSpr() Val  { return b.spr }
func (b *base) setSpr(s Val) { b.spr = s }

func (b *base) getPdep() int8  { return b.pdep }
func (b *base) setPdep(p int8) { b.pdep = p }

// pdepVal is implemented by every Val via the embedded base.
type pdepVal interface {
	getPdep() int8
	setPdep(int8)
}

// sprVal is implemented by every Val via the embedded base.
type sprVal interface {
	getSpr() Val
	setSpr(Val)
}

func sprOf(v Val) Val {
	if s, ok := v.(sprVal); ok {
		return s.getSpr()
	}
	return nil
}

// forceRootPath replaces a Val's own path (root only — children keep
// their clone-time paths). Used by the copy() resolution, whose root
// path is fully truncated to the destination in TS.
func forceRootPath(v Val, p []string) {
	if b, ok := v.(interface{ setVpath([]string) }); ok {
		b.setVpath(p)
	}
}

func setSprOn(v Val, s Val) {
	if h, ok := v.(sprVal); ok {
		h.setSpr(s)
	}
}

func (b *base) Dc() int                { return b.dc }
func (b *base) Nil() bool              { return false }
func (b *base) setDc(dc int)           { b.dc = dc }
func (b *base) pos() int               { return b.sp }
func (b *base) setPos(p int)           { b.sp = p }
func (b *base) srctext() string        { return b.stext }
func (b *base) setSrctext(text string) { b.stext = text }

// srclen is the extent in UTF-16 code units, or -1 for no span. Derived
// rather than stored: see the note on the interface method.
func (b *base) srclen() int {
	if "" == b.stext {
		return -1
	}
	return utf16Len(b.stext)
}
func (b *base) posu() bool          { return b.spu }
func (b *base) setPosu(u bool)      { b.spu = u }
func (b *base) srcurl() string      { return b.surl }
func (b *base) setSrcurl(u string)  { b.surl = u }
func (b *base) cjo() int            { return 99999 }
func (b *base) vpath() []string     { return b.path }
func (b *base) setvpath(p []string) { b.path = p }

func (b *base) markedType() bool                   { return b.mtype }
func (b *base) deprecRec() map[string]string       { return b.deprec }
func (b *base) setDeprecRec(rec map[string]string) { b.deprec = rec }

func (b *base) entityName() string        { return b.entity }
func (b *base) setEntityName(name string) { b.entity = name }

func (b *base) linkAddr() string        { return b.link }
func (b *base) setLinkAddr(addr string) { b.link = addr }
func (b *base) markedHide() bool        { return b.mhide }
func (b *base) fromSpread() bool        { return b.fspr }
func (b *base) setFromSpread()          { b.fspr = true }
func (b *base) setMarkType(v bool)      { b.mtype = v }
func (b *base) setMarkHide(v bool)      { b.mhide = v }

// notdone advances the done-counter without marking DONE.
func (b *base) notdone() {
	if b.dc != DONE {
		b.dc++
	}
}

// --- type predicate helpers (mirror the TS isX flags) ---

func isTop(v Val) bool      { _, ok := v.(*TopVal); return ok }
func isConjunct(v Val) bool { _, ok := v.(*ConjunctVal); return ok }
func isDisjunct(v Val) bool { _, ok := v.(*DisjunctVal); return ok }
func isPref(v Val) bool     { _, ok := v.(*PrefVal); return ok }
func isRef(v Val) bool      { _, ok := v.(*RefVal); return ok }
func isVar(v Val) bool      { _, ok := v.(*VarVal); return ok }
func isFunc(v Val) bool     { _, ok := v.(*FuncVal); return ok }
func isRefer(v Val) bool    { _, ok := v.(*ReferVal); return ok }

// TopVal is the unit of the lattice: unifying with TOP yields the
// other operand. There is conceptually only one TOP.
type TopVal struct{ base }

func newTop() *TopVal {
	t := &TopVal{}
	t.dc = DONE
	// UNLOCATED until something locates it. A TOP is nearly always
	// synthesised -- the implicit peer every unify starts from -- and the
	// zero value of sp is a real position (the first byte of the source),
	// so leaving it there drew an error frame about an implicit TOP at
	// 1:1 of the entry file. TS gives an unset site row/col -1 and an
	// empty url, which its frames render as `<no-file>:-1:-1`; -1 is
	// already this port's spelling of the same thing (see newNil). A
	// `top` WRITTEN in source is located by its value def, as in TS.
	t.sp = -1
	return t
}

// A fresh instance per call (mirrors ts/src/val/top.ts): unify mutates
// Vals in place — setPaths writes paths, move() hide-walks set marks —
// so a shared TOP singleton could be corrupted by one parse and change
// the behaviour of every later parse in the same process.
func top() *TopVal { return newTop() }

func (t *TopVal) Canon() string { return "top" }
func (t *TopVal) superior() Val { return t }

func (t *TopVal) Gen(ctx *Ctx) (any, error) {
	// Silent (mirrors TopVal.gen returning undefined in TS): the
	// enclosing bag decides whether an unresolved top is an error
	// (direct child) or dropped (under a pref / optional subtree).
	return nil, nil
}

func (t *TopVal) Unify(peer Val, ctx *Ctx) Val {
	if peer == nil || isTop(peer) {
		return t
	}
	return peer.Unify(t, ctx)
}

// NilVal represents a unification failure (bottom). It carries enough
// context to render the "Cannot unify value: X with value: Y" message
// that the shared error specs assert on.
type NilVal struct {
	base
	why     string
	msg     string
	fullmsg string
	// attempt names the operation in messages ("unify", "resolve",
	// "add", ...), mirroring the attempt argument of TS makeNilErr;
	// empty means derive from the operand count as TS descErr does.
	attempt string
	// details parameterises hint text ({src}, {left}, {sum}, ...) and
	// carries the `key` submessage prefix, mirroring TS NilVal.details.
	details map[string]string
	// callterms is the CALL AS WRITTEN, carried by an arity refusal so
	// a pipe can rebuild it with one more argument on the front (G8
	// phase 4): `x |> upper()` is `upper(x)`, and the arity this nil
	// failed on is the arity of a call one argument short of the one
	// the author actually wrote. Parse-time only; nothing downstream
	// reads it, and a clone does not carry it. Mirrors the `_callterms`
	// property ts/src/lang.ts puts on the same nil.
	callterms []any
	primary   Val
	secondary Val
}

func newNil(why string) *NilVal {
	n := &NilVal{why: why}
	n.dc = DONE
	// No source position until a caller assigns one — mirrors the TS
	// site default (row/col -1), which a frame's arrow renders RAW.
	n.sp = -1
	return n
}

func (n *NilVal) Nil() bool     { return true }
func (n *NilVal) Canon() string { return "nil" }
func (n *NilVal) superior() Val { return n }

func (n *NilVal) Unify(peer Val, ctx *Ctx) Val { return n }

// Class is the code's class from the shared registry
// (test/spec/errcodes.tsv): conflict | incomplete | reference | parse |
// budget | internal. Mirrors the NilVal.class getter in TS.
func (n *NilVal) Class() string { return codeClass(n.why) }

func (n *NilVal) Gen(ctx *Ctx) (any, error) {
	// A why-less nil takes the gen-time code, mirroring the
	// `this.why = this.why ?? 'nil_gen'` default in TS NilVal.gen.
	if n.why == "" {
		n.why = "nil_gen"
	}
	src, file := "", ""
	if ctx != nil {
		src, file = ctx.src, ctx.file
	}
	return nil, &AontuError{Msg: n.FullMessage(src, file), Code: n.why}
}

// attempt names the operation in messages, defaulting from the operand
// count the way TS descErr does.
func (n *NilVal) attemptName() string {
	if n.attempt != "" {
		return n.attempt
	}
	if n.secondary == nil {
		return "resolve"
	}
	return "unify"
}

// Path is the `$.a.b` location the failure is reported at.
//
// The path comes from the primary operand, as TS NilVal.make copies
// av.path onto the nil. A nil with NO operands -- one raised about a
// construct rather than about a failed meet, such as the refused
// negation in `a:-0x_1` -- keeps the path setPaths gave it where it
// sits in the tree; reading only the (absent) primary reported every
// one of them at the root (issue #39).
func (n *NilVal) Path() string {
	if p := n.pathSegments(); 0 < len(p) {
		return "$." + strings.Join(p, ".")
	}
	return "$"
}

// pathSegments is the raw path the failure is reported at.
func (n *NilVal) pathSegments() []string {
	residue := n.primary
	if residue == nil {
		residue = n
	}
	return residue.vpath()
}

// Headline is the first line of the full message: the `[aontu/<code>]`
// marker, the attempt and the path. It is the ONE line of prose the two
// ports hold to byte parity (the frames below it excerpt source, and the
// short Message is each port's own), which is why the validation verb
// reports it rather than Message -- a vet report crossing between the
// ports must read the same in both (vet.go).
func (n *NilVal) Headline() string {
	plural := ""
	if n.secondary != nil {
		plural = "s"
	}
	return "[aontu/" + n.why + "]: Cannot " + n.attemptName() +
		" value" + plural + " at path " + n.messagePath()
}

// messagePath is Path with EMPTY SEGMENTS DROPPED, which is what TS
// descErr renders: its filter exists to keep a null out of the joined
// path, and takes the empty-string key with it -- so `a: {"": integer}`
// is reported at `$.a` in the message while the machine-readable report
// keeps the segment (`$.a.`, vet.go). Reproduced rather than corrected:
// the two ports' messages are held to byte parity, and which of the two
// spellings is right for an empty key is a question about paths, not
// about this line (docs/capability-review/g7-machine-access.md).
func (n *NilVal) messagePath() string {
	p := n.pathSegments()
	segs := make([]string, 0, len(p))
	for _, seg := range p {
		if "" != seg {
			segs = append(segs, seg)
		}
	}
	if 0 == len(segs) {
		return "$"
	}
	return "$." + strings.Join(segs, ".")
}

// FullMessage renders the failure the way the canonical TypeScript
// implementation renders a THROWN error (descErr, ts/src/err.ts):
// the `[aontu/<code>]` marker, the "Cannot <attempt> value(s) at path
// <path>" headline, the (parameterised) hint, and one located source
// frame per operand — byte-matched to the TS output, ANSI colouring
// included. Used by the AontuError paths (unify/generate); the
// LSP/Problem surface keeps the short Message below, mirroring TS's
// own split (descErr vs the LSP's nilMessage). src is the entry
// source text for row/col mapping and excerpts (ctx.src); frames for
// values loaded from includes fall back to it, as TS's resolveSrc
// falls back when a site's file cannot be read.
func (n *NilVal) FullMessage(src, file string) string {
	if n.fullmsg != "" {
		return n.fullmsg
	}
	attempt := n.attemptName()
	// The frames are rendered ABOUT the primary operand, falling back to
	// the nil itself when the failure had none (see Path above).
	residue := n.primary
	if residue == nil {
		residue = n
	}
	var b strings.Builder
	b.WriteString(n.Headline())
	// Separator before the first frame: one blank line after a hint, TWO
	// when the code has none. That asymmetry is TS's, and it comes out of
	// descErr's fixed [headline+hint, '\n', frame].join('\n') followed by
	// its `\n\n` -> `\n` pass -- with no hint there is simply less text
	// for that pass to collapse. Reproduced here rather than derived,
	// because the twin tests compare these messages byte for byte.
	gap := "\n\n\n"
	if hint := hints[n.why]; hint != "" {
		gap = "\n\n"
		b.WriteString("\n\n")
		// Trailing newlines are NOT part of the hint's spacing: TS ends
		// descErr with a `.replace(/\n\n/g, '\n')` pass, which absorbs a
		// hint's own trailing newline into the single blank line that
		// separates it from the first frame. (Its deliberate blank lines
		// survive that pass because they are "\n \n" -- newline, SPACE,
		// newline -- not "\n\n".) Without the trim, the one hint that
		// ends in a newline, `no_path`, gained a second blank line here
		// and Go's message drifted a byte from TS's (issue #39).
		b.WriteString(strinject(strings.TrimRight(hint, "\n"), n.details))
	}
	// An operandless nil still gets ONE frame, rendered about itself: its
	// canon is "nil" and its site is where the refused construct was
	// written, which is exactly what TS shows for `a:-0x_1` (its nil is
	// built through addsite, so it carries the `-`).
	b.WriteString(gap)
	b.WriteString(n.frame(src, file, attempt, residue, n.secondary))
	if n.secondary != nil {
		// The second frame swaps the operand order, as descErr does.
		b.WriteString("\n")
		b.WriteString(n.frame(src, file, attempt, n.secondary, residue))
	}
	n.fullmsg = b.String()
	return n.fullmsg
}

// frame renders one located source frame, byte-matched to the jsonic
// errmsg block TS descErr emits: the value line, the blue `-->`
// arrow with file:row:col, the source row with a caret naming the
// value (and the map key when known), and the two following rows.
func (n *NilVal) frame(src, file, attempt string, v, other Val) string {
	if file == "" {
		file = "<no-file>"
	}
	var b strings.Builder
	b.WriteString(" Cannot ")
	b.WriteString(attempt)
	b.WriteString(" value: ")
	b.WriteString(v.Canon())
	if other != nil {
		b.WriteString(" with value: ")
		b.WriteString(other.Canon())
	}
	b.WriteString("\n")

	row, col := rowCol(src, v.pos())
	lines := strings.Split(src, "\n")
	line := func(r int) string {
		if 1 <= r && r <= len(lines) {
			return lines[r-1]
		}
		return ""
	}

	// A positionless value prints its RAW site in the arrow — TS sites
	// default to row/col -1 and descErr does not clamp them there —
	// while the excerpt and caret below use the clamped coordinates.
	arrowRow, arrowCol := row, col
	arrowFile := file
	if v.pos() < 0 {
		arrowRow, arrowCol = -1, -1
		// ... and its FILE is unknown too. TS names each frame's file
		// from that value's own site url, which an unlocated value leaves
		// empty, so it prints `<no-file>` -- naming the entry source here
		// pointed the reader at a file the value never came from.
		arrowFile = "<no-file>"
	}
	fmt.Fprintf(&b, "  \x1b[34m--> %s:%d:%d\n", arrowFile, arrowRow, arrowCol)
	// TWO lines of leading context, clamped at the top of the file, then
	// the value's own line, then two trailing: the window TS's frame
	// shows. Go printed only the trailing half, so every error below row
	// 1 -- which is most of them in a real document -- framed with the
	// lines AFTER the mistake and none of the lines before it, and the
	// two ports' messages differed by those lines.
	for r := row - 2; r < row; r++ {
		if 1 <= r {
			fmt.Fprintf(&b, "\x1b[34m%3d | \x1b[0m%s\n", r, line(r))
		}
	}
	fmt.Fprintf(&b, "\x1b[34m%3d | \x1b[0m%s\n", row, line(row))

	keyPrefix := ""
	if k := n.details["key"]; k != "" {
		keyPrefix = "key " + k + " "
	}
	caretCol := col
	if caretCol < 1 { //coverage:ignore rowCol never returns a column below 1
		caretCol = 1
	}
	b.WriteString(strings.Repeat(" ", 6+caretCol-1))
	b.WriteString("\x1b[34m^ ")
	b.WriteString(keyPrefix)
	b.WriteString("value was: ")
	b.WriteString(v.Canon())
	b.WriteString("\x1b[0m\n")

	fmt.Fprintf(&b, "\x1b[34m%3d | \x1b[0m%s\n", row+1, line(row+1))
	fmt.Fprintf(&b, "\x1b[34m%3d | \x1b[0m%s\n", row+2, line(row+2))
	return b.String()
}

// rowCol maps a byte offset into src to 1-based row and column, the
// coordinates jsonic sites carry in TS. A value with no usable
// position maps to row 1, column 1.
func rowCol(src string, sp int) (int, int) {
	if sp < 0 || len(src) < sp {
		return 1, 1
	}
	row := 1
	last := -1
	for i := 0; i < sp; i++ {
		if src[i] == '\n' {
			row++
			last = i
		}
	}
	return row, 1 + utf16Len(src[last+1:sp])
}

// utf16Len counts the UTF-16 code units in s.
//
// COLUMNS ARE COUNTED IN UTF-16 CODE UNITS, not bytes. That is what the
// canonical port's sites carry -- JavaScript strings are UTF-16, so
// jsonic's columns are too -- and it is what the LSP protocol asks for
// by default (go/lsp converts its own offsets the same way). Counting
// bytes put every column, and the caret under it, one place late for
// each multi-byte character earlier in the line: `k:{"é":integer}`
// framed at column 9 where TypeScript said 8.
func utf16Len(s string) int {
	n := 0
	for _, r := range s {
		n++
		if 0xFFFF < r {
			n++
		}
	}
	return n
}

// strinject replaces {key} placeholders with detail values, the Go
// twin of the jsonic strinject TS getHint applies to hint text.
func strinject(txt string, details map[string]string) string {
	for k, v := range details {
		txt = strings.ReplaceAll(txt, "{"+k+"}", v)
	}
	return txt
}

// Message renders the human-readable failure message. The phrasing of
// the "Cannot <attempt> value: ..." line is kept compatible with the
// canonical TypeScript LSP diagnostic text (nilMessage, ts/src/lsp.ts);
// the thrown-error surface uses FullMessage above.
func (n *NilVal) Message() string {
	if n.msg != "" {
		return n.msg
	}
	attempt := "unify"
	if n.secondary == nil {
		attempt = "resolve"
	}
	var b strings.Builder
	b.WriteString("Cannot ")
	b.WriteString(attempt)
	b.WriteString(" value")
	if n.primary != nil {
		b.WriteString(": ")
		b.WriteString(n.primary.Canon())
		if n.secondary != nil {
			b.WriteString(" with value: ")
			b.WriteString(n.secondary.Canon())
		}
	}
	if hint := hints[n.why]; hint != "" {
		b.WriteString("\n")
		b.WriteString(hint)
	}
	n.msg = b.String()
	return n.msg
}

// residueErr reports a value that survived unification but cannot be
// generated, as the FULL located message TS renders for it -- the
// `[aontu/<code>]` marker, the headline naming the path, the hint, and a
// frame pointing at the value.
//
// Only a ROOT-position residue reaches these Gen methods: inside a bag,
// the bag notices the non-generable child first and reports it (both
// ports already agreed there, which is why this stayed hidden). At the
// root each port was on its own, and this one answered with a bare
// "Cannot generate value: <canon>" carrying no code marker, no path and
// no frame -- so the one document shaped entirely like the mistake got
// the least helpful message (issue #38).
// probing reports whether this generation is vet's completeness probe
// rather than an output run (Ctx.probe, and AontuContext.probe in the
// canonical port). Nil-safe: a bare Gen with no context is an output
// run.
func probing(ctx *Ctx) bool {
	return nil != ctx && ctx.probe
}

func residueErr(ctx *Ctx, v Val, code string) error {
	// Recorded on the context first, as TS FeatureVal.gen does through
	// makeNilErr — and, like TS, RAISED only when the context is not
	// collecting. A collecting caller asked for the failures to be
	// gathered rather than thrown, and returning an error there left the
	// one thing it asked for (the reason) nowhere to be found: the
	// validation verb reads exactly these off an isolated context to
	// report residue the data has not yet satisfied (vet.go).
	n := makeNilErr(ctx, code, v, nil)
	n.path = cp(v.vpath())
	if ctx != nil && ctx.collect {
		return nil
	}
	src, file := "", ""
	if ctx != nil {
		src, file = ctx.src, ctx.file
	}
	return &AontuError{Msg: n.FullMessage(src, file), Code: code}
}

// makeNilErrFull is makeNilErr with the attempt name and hint details
// TS's makeNilErr carries as its trailing arguments.
func makeNilErrFull(ctx *Ctx, why string, a, b Val, attempt string, details map[string]string) *NilVal {
	n := makeNilErr(ctx, why, a, b)
	n.attempt = attempt
	n.details = details
	return n
}

// srcid is a value's SOURCE IDENTITY: the thing TS compares when it
// gates the operand flip on `nil.site.url === bv.site.url`. A real
// source name wins when there is one (the validation verb stamps one
// per document, walk.go); otherwise the clone-mint flag stands in for
// it, which is all a single-source run ever needs — one text, so the
// only distinction left is parsed versus minted.
func srcid(v Val) string {
	if u := v.srcurl(); "" != u {
		return u
	}
	if v.posu() {
		return "\x00clone"
	}
	return "\x00parse"
}

// makeNilErr builds a NilVal error and records it on ctx. The operand
// later in the source (greater position) becomes the primary, matching
// the TypeScript NilVal.make ordering so error messages agree — and,
// exactly as there, the flip fires only when the two operands share a
// source identity (srcid above): a cloned operand meeting a parsed one,
// or a schema value meeting a data value, keeps the driving operand
// primary, because comparing their positions would be comparing
// offsets into different texts.
func makeNilErr(ctx *Ctx, why string, a, b Val) *NilVal {
	n := newNil(why)
	if a != nil {
		n.primary = a
		n.sp = a.pos()
		if b != nil {
			n.secondary = b
			if srcid(a) == srcid(b) && b.pos() > a.pos() {
				n.primary = b
				n.secondary = a
				n.sp = b.pos()
			}
		}
	}
	if ctx != nil {
		ctx.adderr(n)
	}
	return n
}

// AontuError is the error type returned by Unify/Generate.
type AontuError struct {
	Msg string

	// Code is the error code of the FIRST underlying failure (the
	// NilVal `why`, e.g. "scalar_value", "no_path", "mapval_no_gen"),
	// mirroring errs()[0].why on the TypeScript AontuError. Empty when
	// no code is known (e.g. wrapped parse errors). Codes -- unlike
	// message text -- are in cross-implementation parity, registered in
	// test/spec/errcodes.tsv and pinned by `errc` spec rows.
	Code string

	// Row and Col locate a PARSE failure, 1-based, or -1 when the
	// failure knows no position. The merge-conflict refusal and the
	// parser's own syntax failure both fill them, which is exactly
	// where the canonical port carries a position too. The validation
	// verb reports them (vet.go), so the two ports have to know the
	// same things here -- and until they both threaded the parser's
	// position through, a machine-readable report said -1:-1 for a
	// fault the human renderer drew a caret under.
	Row int
	Col int
}

func (e *AontuError) Error() string { return e.Msg }
