/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"sort"
	"strings"
	"sync"
)

const genModel = `@"aontu:gen"`

const genReadCacheMax = 256

func genFamily(v Val) string {
	var kind Kind
	switch n := v.(type) {
	case *ScalarVal:
		kind = n.kind
	case *ScalarKindVal:
		kind = n.kind
	case *MapVal, *MapKindVal:
		return "Map"
	case *ListVal, *ListKindVal:
		return "List"
	default:
		return ""
	}
	switch kind {
	case KindString:
		return "String"
	case KindBoolean:
		return "Boolean"
	case KindNull:
		return "Null"
	case KindPath:
		return "Path"
	}
	return "Number"
}

// genRead is the options in force, each default filled, or the option
// refused.
type genRead struct {
	opts    map[string]any
	option  string
	refused bool
}

var (
	genMu    sync.Mutex
	genReads = map[string]*genRead{}
	genSets  map[string]string
)

// readGen reads a record against its type's standard set by the engine,
// in an evaluation of its own: an option is refused as any other value is.
// optionsOf is the record less its custom expression, which the set
// says nothing of.
func optionsOf(rec Val) string {
	m := rec.(*MapVal)
	if _, has := m.peg["custom"]; !has {
		return rec.Canon()
	}
	keys := make([]string, 0, len(m.keys))
	for _, k := range m.keys {
		if "custom" != k {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, jsonString(k)+":"+m.peg[k].Canon())
	}
	return "{" + strings.Join(parts, ",") + "}"
}

func readGen(family string, rec Val) *genRead {
	options := optionsOf(rec)
	key := family + " " + options
	genMu.Lock()
	read, hit := genReads[key]
	genMu.Unlock()
	if hit {
		return read
	}
	a := New()
	src := genModel + "\nout: $.aontu.Gen." + family + " & " + options
	v, _ := a.parseEntry(src)
	res, ctx, err := a.unifyCtx(v, nil, src)
	if nil != err {
		read = &genRead{refused: true, option: ctx.err[0].pathSegments()[1]}
	} else {
		// An option is the value it is, whatever its own record has it written as.
		ctx.plain = true
		out, _ := res.Gen(ctx)
		read = &genRead{opts: out.(map[string]any)["out"].(map[string]any)}
	}
	genMu.Lock()
	if genReadCacheMax <= len(genReads) {
		genReads = map[string]*genRead{}
	}
	genReads[key] = read
	genMu.Unlock()
	return read
}

func genSet(family string) string {
	genMu.Lock()
	defer genMu.Unlock()
	if nil == genSets {
		root, _ := New().Unify(genModel)
		gen := root.(*MapVal).peg["aontu"].(*MapVal).peg["Gen"].(*MapVal)
		genSets = map[string]string{}
		for _, name := range gen.keys {
			genSets[name] = gen.peg[name].Canon()
		}
	}
	return genSets[family]
}

// Each record is cloned: one rides many values.
func meetRec(ctx *Ctx, a, b Val) Val {
	if a == b || a.Canon() == b.Canon() {
		return a
	}
	return trialUnify(ctx, clonePath(a, a.vpath()), clonePath(b, b.vpath()))
}

func genConflict(ctx *Ctx, a, b Val) Val {
	return makeNilErrFull(ctx, "gen_conflict", a, b, "",
		map[string]string{"a": a.Canon(), "b": b.Canon()})
}

func genOn(ctx *Ctx, out, a, b Val) Val {
	var ra, rb Val
	if nil != a {
		ra = a.genRec()
	}
	if nil != b {
		rb = b.genRec()
	}
	if nil == ra && nil == rb {
		return out
	}

	rec := out.genRec()
	for _, r := range []Val{ra, rb} {
		if nil == r || r == rec {
			continue
		}
		if nil == rec {
			rec = r
			continue
		}
		met := meetRec(ctx, rec, r)
		if nil == met {
			return genConflict(ctx, rec, r)
		}
		rec = met
	}

	return genLand(ctx, out, rec)
}

// What a value stands for where it holds another: a preference its
// preferred value, a graph atom the value it rides beside.
func genUnder(v Val) Val {
	switch h := v.(type) {
	case *PrefVal:
		return h.peg
	case *GraphAtomVal:
		return h.held
	}
	return nil
}

// A disjunction holds no record of its own, and a holder is held to its
// record by the value it holds, whose own record it meets.
func genLand(ctx *Ctx, out, rec Val) Val {
	if d, ok := out.(*DisjunctVal); ok {
		return genArms(ctx, d, rec)
	}

	held, full := out, rec
	for next := genUnder(held); nil != next; next = genUnder(held) {
		held = next
		if own := held.genRec(); nil != own {
			met := meetRec(ctx, full, own)
			if nil == met {
				return genConflict(ctx, full, own)
			}
			full = met
		}
	}

	var opts map[string]any
	if family := genFamily(held); "" != family {
		read := readGen(family, full)
		if read.refused {
			return makeNilErrFull(ctx, "gen_option", out, full, "", map[string]string{
				"type":   strings.ToLower(family),
				"set":    genSet(family),
				"got":    full.Canon(),
				"option": read.option,
			})
		}
		if held == out {
			opts = read.opts
			if custom, has := full.(*MapVal).peg["custom"]; has {
				opts = make(map[string]any, len(read.opts)+1)
				for k, v := range read.opts {
					opts[k] = v
				}
				opts["custom"] = custom.(*ScalarVal).peg
			}
		}
	}

	out.setGenRec(rec, opts)
	return out
}

// customMade is what a custom expression gave: an output, which is a
// written null where it is nil and present, or the code that stopped it.
type customMade struct {
	out     any
	present bool
	cause   string
}

var customs = map[string]customMade{}

// genCustom evaluates the expression on its own, as `apply` is anywhere,
// over what the value writes without it. An output that places could
// share is made again for each.
func genCustom(ctx *Ctx, v Val, custom, given string) (any, bool, error) {
	key := given + "\n" + custom
	genMu.Lock()
	made, hit := customs[key]
	genMu.Unlock()
	if !hit {
		made = makeCustom("out: apply(" + given + ", " + custom + ")")
		switch made.out.(type) {
		case map[string]any, []any:
		default:
			genMu.Lock()
			if genReadCacheMax <= len(customs) {
				customs = map[string]customMade{}
			}
			customs[key] = made
			genMu.Unlock()
		}
	}
	if "" != made.cause {
		return nil, false, genRefuse(ctx, v, "gen_custom",
			map[string]string{"custom": custom, "given": given, "cause": made.cause})
	}
	return made.out, made.present, nil
}

func makeCustom(src string) customMade {
	a := New()
	v, _ := a.parseEntry(src)
	res, ctx, err := a.unifyCtx(v, nil, src)
	if nil != err {
		return customMade{cause: ctx.err[0].why}
	}
	gctx := &Ctx{root: res, src: src, collect: true}
	out, _ := res.Gen(gctx)
	if 0 < len(gctx.err) {
		return customMade{cause: gctx.err[0].why}
	}
	// What a document's own generation checks, with what unifying it declared.
	aliasErrors(ctx, res)
	relationErrors(ctx, res)
	if 0 < len(ctx.err) {
		return customMade{cause: ctx.err[0].why}
	}
	made, present := out.(map[string]any)["out"]
	return customMade{out: made, present: present}
}

// An arm of a type that refuses the record drops, as under a constraint.
func genArms(ctx *Ctx, out *DisjunctVal, rec Val) Val {
	lands := true
	for _, arm := range out.peg {
		own := arm.genRec()
		if nil == own {
			lands = false
			break
		}
		if met := meetRec(ctx, own, rec); nil == met || met.Canon() != own.Canon() {
			lands = false
			break
		}
	}
	if lands {
		return out
	}
	carrier := top()
	carrier.setGenRec(rec, nil)
	return out.Unify(carrier, ctx)
}

// The record lands on the held value only where it is generated: an
// override takes it from a preference, and a graph atom shares what it
// holds with its copies.
func genHeld(ctx *Ctx, holder Val) (any, error) {
	return heldVal(ctx, holder).Gen(ctx)
}

func heldVal(ctx *Ctx, holder Val) Val {
	lctx := ctx
	if nil == lctx {
		lctx = &Ctx{}
	}
	held := genUnder(holder)
	return genOn(lctx, clonePath(held, held.vpath()), holder, nil)
}
