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
	load() (int, string, bool)
	setLoad(sp int, url string)
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
	copiedBy() string
	setCopiedBy(target string)
	rereads() []Val
	isUnplaced() bool
	setUnplaced(bool)
	setRereads(terms []Val)
	deprecRec() map[string][]string
	setDeprecRec(rec map[string][]string)
	metaRec() map[string][]Val
	setMetaRec(rec map[string][]Val)
	genRec() Val
	genOpts() map[string]any
	setGenRec(rec Val, opts map[string]any)
	viaRec() []string
	setViaRec(via []string)
	identRec() map[string][]Val
	setIdentRec(rec map[string][]Val)
	declRec() *declRecord
	setDeclRec(d *declRecord)
	readAddr() string
	setReadAddr(addr string)
	emitOrig() *emitOrigin
	setEmitOrig(o *emitOrigin)
	linkAddr() string
	setLinkAddr(addr string)
	linkInfo() linkInfo
	setLinkInfo(li linkInfo)
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
	url  string
	src  string
	sp   int
	spu  bool
	via  viaSite
	load *loadSite
}

// WHERE AN INCLUDE LOADED a value another file wrote: the key it stands
// under is written there, though the value keeps its own file's site.
type loadSite struct {
	sp  int
	url string
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
	deprec  map[string][]string
	meta    map[string][]Val
	genrec  Val
	genopts map[string]any
	// vias: the aliases this value is a copy of, written back as $ref.
	vias []string
	// ident: a declaration's record, which no copy carries.
	ident map[string][]Val
	// decl: the graph atoms met here, which the relation checks read by key name.
	decl    *declRecord
	origin  string
	emitted *emitOrigin
	link    string
	lk      linkInfo
	spr     Val
	pdep    int8
	// copied: the target whose expansion (RecurseVal) copied this, until something else meets it.
	copied string
	// reread: what a relative path read here, as written with each term met, which a copy reads again (ruling 26).
	reread []Val
	// unplaced: a key in a declaration's body, or a call over one, that waits for the use that places it.
	unplaced bool
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
func (b *base) load() (int, string, bool) {
	if nil == b.site.load {
		return -1, "", false
	}
	return b.site.load.sp, b.site.load.url, true
}
func (b *base) setLoad(sp int, url string) {
	b.site.load = &loadSite{sp: sp, url: url}
}

func (b *base) srcurl() string      { return b.site.url }
func (b *base) setSrcurl(u string)  { b.site.url = u }
func (b *base) cjo() int            { return 99999 }
func (b *base) vpath() []string     { return b.path }
func (b *base) setvpath(p []string) { b.path = p }

func (b *base) markedType() bool                     { return b.mtype }
func (b *base) deprecRec() map[string][]string       { return b.deprec }
func (b *base) setDeprecRec(rec map[string][]string) { b.deprec = rec }
func (b *base) metaRec() map[string][]Val            { return b.meta }
func (b *base) setMetaRec(rec map[string][]Val)      { b.meta = rec }
func (b *base) genRec() Val                          { return b.genrec }
func (b *base) genOpts() map[string]any              { return b.genopts }
func (b *base) setGenRec(rec Val, opts map[string]any) {
	b.genrec, b.genopts = rec, opts
}
func (b *base) viaRec() []string                 { return b.vias }
func (b *base) setViaRec(via []string)           { b.vias = via }
func (b *base) identRec() map[string][]Val       { return b.ident }
func (b *base) setIdentRec(rec map[string][]Val) { b.ident = rec }
func (b *base) declRec() *declRecord             { return b.decl }
func (b *base) setDeclRec(d *declRecord)         { b.decl = d }

func (b *base) readAddr() string          { return b.origin }
func (b *base) setReadAddr(addr string)   { b.origin = addr }
func (b *base) emitOrig() *emitOrigin     { return b.emitted }
func (b *base) setEmitOrig(o *emitOrigin) { b.emitted = o }

func (b *base) linkAddr() string        { return b.link }
func (b *base) setLinkAddr(addr string) { b.link = addr }
func (b *base) linkInfo() linkInfo      { return b.lk }
func (b *base) setLinkInfo(li linkInfo) { b.lk = li }
func (b *base) markedHide() bool        { return b.mhide }
func (b *base) fromSpread() bool        { return b.fspr }
func (b *base) setFromSpread()          { b.fspr = true }
func (b *base) written() bool           { return b.fwrt }
func (b *base) setWritten()             { b.fwrt = true }
func (b *base) innerOf() Val            { return b.finner }
func (b *base) setInnerOf(v Val)        { b.finner = v }
func (b *base) copiedBy() string        { return b.copied }
func (b *base) setCopiedBy(t string)    { b.copied = t }
func (b *base) rereads() []Val          { return b.reread }
func (b *base) setRereads(terms []Val)  { b.reread = terms }
func (b *base) isUnplaced() bool        { return b.unplaced }
func (b *base) setUnplaced(w bool)      { b.unplaced = w }
func (b *base) setMarkType(v bool)      { b.mtype = v }
func (b *base) setMarkHide(v bool)      { b.mhide = v }

// notdone advances the done-counter without marking DONE.
func (b *base) notdone() {
	if b.dc != DONE {
		b.dc++
	}
}

// --- type predicate helpers (mirror the TS isX flags) ---

func isTop(v Val) bool         { _, ok := v.(*TopVal); return ok }
func isConjunct(v Val) bool    { _, ok := v.(*ConjunctVal); return ok }
func isDisjunct(v Val) bool    { _, ok := v.(*DisjunctVal); return ok }
func isPref(v Val) bool        { _, ok := v.(*PrefVal); return ok }
func isRef(v Val) bool         { _, ok := v.(*RefVal); return ok }
func isVar(v Val) bool         { _, ok := v.(*VarVal); return ok }
func isFunc(v Val) bool        { _, ok := v.(*FuncVal); return ok }
func isPendingLink(v Val) bool { _, ok := v.(*PendingLinkVal); return ok }

// TopVal is the unit of the lattice: unifying with it yields the other operand.
type TopVal struct{ base }

func newTop() *TopVal {
	t := &TopVal{}
	t.dc = DONE
	t.site.sp = -1
	return t
}

func top() *TopVal { return newTop() }

func (t *TopVal) Canon() string { return "any" }
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
	// A call the parser refused, kept as written for the hole walk.
	refusedCall *FuncVal
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
	return vetPath(n.pathSegments())
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

// parseMessage renders a parse-stage refusal: the failure's own text
// in place of a value path, under the parser's own code for a syntax
// error. Twin of parseMessage in ts/src/err.ts.
func parseMessage(code, marker, msg string, row, col int, file, src, tail string) string {
	var b strings.Builder
	b.WriteString("[aontu/" + marker + "]: " + msg)
	hint := hints[code]
	if "" != hint {
		b.WriteString("\n\n")
		b.WriteString(strinject(strings.TrimRight(hint, "\n"), nil))
	}
	b.WriteString("\n")
	if 0 < row {
		b.WriteString("\n")
		b.WriteString(parseFrame(msg, row, col, file, src))
	}
	b.WriteString(tail)
	return b.String()
}

func parseFrame(msg string, row, col int, file, src string) string {
	if "" == file {
		file = "<no-file>"
	}
	var b strings.Builder
	b.WriteString(" " + msg + "\n")
	lines := strings.Split(src, "\n")
	line := func(r int) string {
		if 1 <= r && r <= len(lines) {
			return lines[r-1]
		}
		return ""
	}
	fmt.Fprintf(&b, "  %s--> %s:%d:%d\n", ansi("\x1b[34m"), file, row, col)
	gutter := len(strconv.Itoa(row + 2))
	excerpt := func(r int) {
		fmt.Fprintf(&b, "%s  %*d | %s%s\n",
			ansi("\x1b[34m"), gutter, r, ansi("\x1b[0m"), line(r))
	}
	// A column past the line's end is its newline, which the canonical
	// renderer draws below the NEXT line.
	caret := row
	if col > len(line(row)) && row < len(lines) {
		caret = row + 1
	}
	for r := row - 2; r <= caret; r++ {
		if 1 <= r {
			excerpt(r)
		}
	}
	b.WriteString(strings.Repeat(" ", 2+gutter+3+col-1))
	b.WriteString(ansi("\x1b[34m") + "^ " + msg + ansi("\x1b[0m") + "\n")
	excerpt(caret + 1)
	excerpt(caret + 2)
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
	return residueErrAt(ctx, v, code, nil, v.vpath())
}

func residueErrAt(ctx *Ctx, v Val, code string, details map[string]string, path []string) error {
	n := makeNilErr(ctx, code, v, nil)
	n.details = details
	n.path = cp(path)
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

// Recorded and walked past, as the TS arms for these codes are: the
// bag reaches its later members and the caller raises from the context.
func residueWalkOn(ctx *Ctx, v Val, code string) error {
	n := makeNilErr(ctx, code, v, nil)
	n.path = cp(v.vpath())
	if nil != ctx {
		return nil
	}
	return &AontuError{Msg: n.FullMessage("", "", nil), Code: code}
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
