/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
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
func readGen(family string, rec Val) *genRead {
	key := family + " " + rec.Canon()
	genMu.Lock()
	read, hit := genReads[key]
	genMu.Unlock()
	if hit {
		return read
	}
	a := New()
	src := genModel + "\nout: $.aontu.Gen." + family + " & " + rec.Canon()
	v, _ := a.parseEntry(src)
	res, ctx, err := a.unifyCtx(v, nil, src)
	if nil != err {
		read = &genRead{refused: true, option: ctx.err[0].pathSegments()[1]}
	} else {
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

// A disjunction holds no record of its own, and a preference is held to
// its record by the value it prefers, whose own record it meets.
func genLand(ctx *Ctx, out, rec Val) Val {
	if d, ok := out.(*DisjunctVal); ok {
		return genArms(ctx, d, rec)
	}

	held, full := out, rec
	for {
		p, isPref := held.(*PrefVal)
		if !isPref {
			break
		}
		held = p.peg
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
		}
	}

	out.setGenRec(rec, opts)
	return out
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

// The record lands on the preferred value only where it is generated:
// an override takes it from the preference.
func genHeld(ctx *Ctx, p *PrefVal) (any, error) {
	lctx := ctx
	if nil == lctx {
		lctx = &Ctx{}
	}
	return genOn(lctx, clonePath(p.peg, p.peg.vpath()), p, nil).Gen(ctx)
}
