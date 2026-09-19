/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

var colorOverride *bool

// SetColor forces ANSI on or off; nil restores the NO_COLOR default.
func SetColor(on *bool) {
	colorOverride = on
}

func colorActive() bool {
	if nil != colorOverride {
		return *colorOverride
	}
	return "" == os.Getenv("NO_COLOR")
}

// ansi returns the escape when colour is on, and nothing when it is
// off, so the frame writer below reads the same either way.
func ansi(code string) string {
	if colorActive() {
		return code
	}
	return ""
}

// DONE marks a Val whose unification has fully converged.
const DONE = -1

type Val interface {
	// Canon returns the canonical, source-like representation.
	Canon() string

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

	srctext() string
	srclen() int
	setSrctext(text string)
	posu() bool
	setPosu(u bool)
	srcurl() string
	via() (int, string, string)
	setVia(sp int, url, name string)
	setSrcurl(u string)
	cjo() int
	superior() Val

	// vpath is the path from the root to this Val, used by references.
	vpath() []string
	setvpath(p []string)

	// Marks: type values are constraints, hidden values are excluded
	// from generation. Both are skipped when generating a containing map.
	markedType() bool
	fromSpread() bool
	setFromSpread()
	// written reports the AUTHORED mark (see base.fwrt), and innerOf
	// the written container this value is part of (see base.finner).
	written() bool
	setWritten()
	innerOf() Val
	setInnerOf(v Val)
	deprecRec() map[string]string
	setDeprecRec(rec map[string]string)
	readAddr() string
	setReadAddr(addr string)
	emitOrig() *emitOrigin
	setEmitOrig(o *emitOrigin)
	linkAddr() string
	setLinkAddr(addr string)
	markedHide() bool
	setMarkType(v bool)
	setMarkHide(v bool)
}

const unsited = -1

// WHERE A NAME WAS USED, when a value arrived through one, which a
// finding names beside where it was written (ALIASES.0.md A-1).
type viaSite struct {
	sp   int
	url  string
	name string
}

// WHERE A VALUE WAS WRITTEN, grouped as ts/src/site.ts groups it.
// `sp` is the byte offset a position travels as here, where TypeScript
// carries a row and a column; docs/contributing/parity.md says why.
// `spu` marks a position a clone carried rather than the source gave.
type site struct {
	url string
	src string
	sp  int
	spu bool
	via viaSite
}

type base struct {
	dc      int
	site    site
	path    []string // path from root (for reference resolution)
	mtype   bool
	mhide   bool // hide mark
	fspr    bool
	fwrt    bool
	finner  Val
	deprec  map[string]string
	origin  string
	emitted *emitOrigin
	link    string
	relkey  string
	spr     Val
	pdep    int8
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
func (b *base) pos() int               { return b.site.sp }
func (b *base) setPos(p int)           { b.site.sp = p }
func (b *base) srctext() string        { return b.site.src }
func (b *base) setSrctext(text string) { b.site.src = text }

func (b *base) srclen() int {
	if "" == b.site.src {
		return -1
	}
	return utf16Len(b.site.src)
}
func (b *base) posu() bool     { return b.site.spu }
func (b *base) setPosu(u bool) { b.site.spu = u }
func (b *base) via() (int, string, string) {
	return b.site.via.sp, b.site.via.url, b.site.via.name
}
func (b *base) setVia(sp int, url, name string) {
	b.site.via = viaSite{sp: sp, url: url, name: name}
}

func (b *base) srcurl() string      { return b.site.url }
func (b *base) setSrcurl(u string)  { b.site.url = u }
func (b *base) cjo() int            { return 99999 }
func (b *base) vpath() []string     { return b.path }
func (b *base) setvpath(p []string) { b.path = p }

func (b *base) markedType() bool                   { return b.mtype }
func (b *base) deprecRec() map[string]string       { return b.deprec }
func (b *base) setDeprecRec(rec map[string]string) { b.deprec = rec }

func (b *base) readAddr() string          { return b.origin }
func (b *base) setReadAddr(addr string)   { b.origin = addr }
func (b *base) emitOrig() *emitOrigin     { return b.emitted }
func (b *base) setEmitOrig(o *emitOrigin) { b.emitted = o }

func (b *base) linkAddr() string        { return b.link }
func (b *base) relKey() string          { return b.relkey }
func (b *base) setLinkAddr(addr string) { b.link = addr }
func (b *base) markedHide() bool        { return b.mhide }
func (b *base) fromSpread() bool        { return b.fspr }
func (b *base) setFromSpread()          { b.fspr = true }
func (b *base) written() bool           { return b.fwrt }
func (b *base) setWritten()             { b.fwrt = true }
func (b *base) innerOf() Val            { return b.finner }
func (b *base) setInnerOf(v Val)        { b.finner = v }
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
	t.site.sp = -1
	return t
}

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
	details   map[string]string
	primary   Val
	secondary Val
}

func newNil(why string) *NilVal {
	n := &NilVal{why: why}
	n.dc = DONE
	// No source position until a caller assigns one — mirrors the TS
	// site default (row/col -1), which a frame's arrow renders RAW.
	n.site.sp = -1
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
	var texts map[string]string
	if ctx != nil {
		src, file, texts = ctx.src, ctx.file, ctx.texts
	}
	return nil, &AontuError{Msg: n.FullMessage(src, file, texts), Code: n.why,
		Details: n.details}
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

func (n *NilVal) Path() string {
	if p := n.pathSegments(); 0 < len(p) {
		return "$." + strings.Join(p, ".")
	}
	return "$"
}

// pathSegments is the raw path the failure is reported at.
func (n *NilVal) pathSegments() []string {
	if 0 < len(n.path) {
		return n.path
	}
	residue := n.primary
	if residue == nil {
		residue = n
	}
	return residue.vpath()
}

func (n *NilVal) Headline() string {
	plural := ""
	if n.secondary != nil {
		plural = "s"
	}
	return "[aontu/" + n.why + "]: Cannot " + n.attemptName() +
		" value" + plural + " at path " + n.messagePath()
}

func (n *NilVal) messagePath() string {
	p := n.pathSegments()
	segs := make([]string, 0, len(p))
	for _, seg := range p {
		if "" != seg {
			segs = append(segs, aliasPathSegment(seg))
		}
	}
	if 0 == len(segs) {
		return "$"
	}
	return "$." + strings.Join(segs, ".")
}

func (n *NilVal) FullMessage(src, file string, texts map[string]string) string {
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
	gap := "\n\n\n"
	if hint := hints[n.why]; hint != "" {
		gap = "\n\n"
		b.WriteString("\n\n")
		b.WriteString(strinject(strings.TrimRight(hint, "\n"), n.details))
	}
	b.WriteString(gap)
	b.WriteString(n.frame(src, file, attempt, residue, n.secondary, texts))
	if n.secondary != nil {
		// The second frame swaps the operand order, as descErr does.
		b.WriteString("\n")
		b.WriteString(n.frame(src, file, attempt, n.secondary, residue, texts))
	}
	for _, v := range []Val{residue, n.secondary} {
		if v == nil {
			continue
		}
		if sp, url, name := v.via(); "" != name {
			b.WriteString("\n")
			b.WriteString(n.viaFrame(src, file, sp, url, name, texts))
		}
	}
	n.fullmsg = b.String()
	return n.fullmsg
}

func frameFile(url string) string {
	cwd, err := os.Getwd()
	if nil != err { //coverage:ignore Getwd fails only if the cwd is gone
		return url
	}
	out := strings.Replace(url, cwd+string(os.PathSeparator), "", 1)
	if out == cwd || "" == out {
		return "<no-file>"
	}
	return out
}

// A NAME IS WHERE THE VALUE ENTERED THIS PATH, which is not where it
// is written (ALIASES.0.md A-1).
func (n *NilVal) viaFrame(src, file string, sp int, url, name string,
	texts map[string]string) string {
	if "" != url {
		if t, ok := texts[url]; ok {
			src, file = t, frameFile(url)
		}
	}
	if file == "" {
		file = "<no-file>"
	}
	var b strings.Builder
	fmt.Fprintf(&b, " Value arrived through %s\n", name)
	row, col := rowCol(src, sp)
	lines := strings.Split(src, "\n")
	line := func(r int) string {
		if 1 <= r && r <= len(lines) {
			return lines[r-1]
		}
		return ""
	}
	arrowRow, arrowCol, arrowFile := row, col, file
	if sp < 0 { //coverage:ignore a stamped use always carries its offset
		arrowRow, arrowCol, arrowFile = -1, -1, "<no-file>"
	}
	fmt.Fprintf(&b, "  %s--> %s:%d:%d\n", ansi("\x1b[34m"), arrowFile, arrowRow, arrowCol)
	gutter := len(strconv.Itoa(row + 2))
	excerpt := func(r int) {
		fmt.Fprintf(&b, "%s  %*d | %s%s\n",
			ansi("\x1b[34m"), gutter, r, ansi("\x1b[0m"), line(r))
	}
	for r := row - 2; r < row; r++ {
		if 1 <= r {
			excerpt(r)
		}
	}
	excerpt(row)
	caretCol := col
	if caretCol < 1 { //coverage:ignore rowCol never returns a column below 1
		caretCol = 1
	}
	b.WriteString(strings.Repeat(" ", 2+gutter+3+caretCol-1))
	b.WriteString(ansi("\x1b[34m") + "^ used " + name + " here")
	b.WriteString(ansi("\x1b[0m") + "\n")
	excerpt(row + 1)
	excerpt(row + 2)
	return b.String()
}

func (n *NilVal) frame(src, file, attempt string, v, other Val,
	texts map[string]string) string {
	if url := v.srcurl(); "" != url {
		if text, have := texts[url]; have {
			src, file = text, frameFile(url)
		}
	}
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

	arrowRow, arrowCol := row, col
	arrowFile := file
	if v.pos() < 0 {
		arrowRow, arrowCol = -1, -1
		arrowFile = "<no-file>"
	}
	fmt.Fprintf(&b, "  %s--> %s:%d:%d\n", ansi("\x1b[34m"), arrowFile, arrowRow, arrowCol)
	gutter := len(strconv.Itoa(row + 2))
	excerpt := func(r int) {
		fmt.Fprintf(&b, "%s  %*d | %s%s\n",
			ansi("\x1b[34m"), gutter, r, ansi("\x1b[0m"), line(r))
	}

	for r := row - 2; r < row; r++ {
		if 1 <= r {
			excerpt(r)
		}
	}
	excerpt(row)

	keyPrefix := ""
	if k := n.details["key"]; k != "" {
		keyPrefix = "key " + k + " "
	}
	caretCol := col
	if caretCol < 1 { //coverage:ignore rowCol never returns a column below 1
		caretCol = 1
	}
	b.WriteString(strings.Repeat(" ", 2+gutter+3+caretCol-1))
	b.WriteString(ansi("\x1b[34m") + "^ ")
	b.WriteString(keyPrefix)
	b.WriteString("value was: ")
	b.WriteString(v.Canon())
	b.WriteString(ansi("\x1b[0m") + "\n")

	excerpt(row + 1)
	excerpt(row + 2)
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

func probing(ctx *Ctx) bool {
	return nil != ctx && ctx.probe
}

func residueErr(ctx *Ctx, v Val, code string) error {
	n := makeNilErr(ctx, code, v, nil)
	n.path = cp(v.vpath())
	if ctx != nil && ctx.collect {
		return nil
	}
	src, file := "", ""
	var texts map[string]string
	if ctx != nil {
		src, file, texts = ctx.src, ctx.file, ctx.texts
	}
	return &AontuError{Msg: n.FullMessage(src, file, texts), Code: code}
}

// makeNilErrFull is makeNilErr with the attempt name and hint details
// TS's makeNilErr carries as its trailing arguments.
func makeNilErrFull(ctx *Ctx, why string, a, b Val, attempt string, details map[string]string) *NilVal {
	n := makeNilErr(ctx, why, a, b)
	n.attempt = attempt
	n.details = details
	return n
}

func srcid(v Val) string {
	return v.srcurl()
}

func makeNilErr(ctx *Ctx, why string, a, b Val) *NilVal {
	n := newNil(why)
	if a != nil {
		n.primary = a
		n.site.sp = a.pos()
		if b != nil {
			n.secondary = b
			if srcid(a) == srcid(b) && b.pos() > a.pos() {
				n.primary = b
				n.secondary = a
				n.site.sp = b.pos()
			}
		}
	}
	if ctx != nil && 0 < len(ctx.slot) &&
		(b != nil || 0 == len(n.pathSegments())) {
		n.path = cp(ctx.slot)
	}

	if ctx != nil {
		ctx.adderr(n)
	}
	return n
}

// AontuError is the error type returned by Unify/Generate.
type AontuError struct {
	Msg string

	Code string

	Details map[string]string

	Row int
	Col int
}

func (e *AontuError) Error() string { return e.Msg }
