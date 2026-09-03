/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"math"
	"math/big"
	"strconv"
	"strings"
)

// Kind enumerates the scalar kinds (type constraints).
//
// The numeric kinds form a small lattice (docs/design/number-tower.md):
//
//	number                pure supertype: the set of all numeric values
//	|- integer            int64-window exact
//	|- float              IEEE-754 binary64
//	|- biginteger         unbounded exact integer   (opt-in via 0d)
//	|- bigdecimal         exact base-10 decimal     (opt-in via 0d)
//
// KindNumber is a SUPERTYPE only: it names no representation and is
// carried by a ScalarKindVal (the `number` keyword) alone — a concrete
// ScalarVal always carries a numeric LEAF kind. The leaves are pairwise
// disjoint: `5 & 0d5` is an error, exactly as `1 & 1.0` is, because a
// cross-leaf result would have to pick a kind (D2).
type Kind int

const (
	KindTop Kind = iota
	KindNil
	KindString
	// KindNumber is the numeric supertype; it is never a ScalarVal kind.
	KindNumber
	// Numeric leaves. Keep contiguous, and extend numericLeafKinds when
	// adding one.
	KindInteger
	KindFloat
	KindBigInteger
	KindBigDecimal
	KindBoolean
	KindNull
	// KindPath is the tree-address kind (docs/design/PATHS.0.md): the
	// value `path(p)` captures. It sits UNDER string in the kind
	// lattice, and is reached only by the `path()` builtin, as the
	// exact numeric leaves are reached only by `0d`.
	KindPath
)

func (k Kind) String() string {
	switch k {
	case KindString:
		return "string"
	case KindNumber:
		return "number"
	case KindInteger:
		return "integer"
	case KindFloat:
		return "float"
	case KindBigInteger:
		return "biginteger"
	case KindBigDecimal:
		return "bigdecimal"
	case KindBoolean:
		return "boolean"
	case KindNull:
		return "null"
	case KindPath:
		return "path"
	case KindNil:
		return "nil"
	}
	return "top"
}

// numericLeafKinds is the set of concrete numeric kinds sitting directly
// under `number`. Every leaf here is a set of values disjoint from every
// other leaf, so two distinct leaves have no common lower bound and
// cannot unify (`float & integer` is an error).
var numericLeafKinds = map[Kind]bool{
	KindInteger:    true,
	KindFloat:      true,
	KindBigInteger: true,
	KindBigDecimal: true,
}

// kindSubsumes reports whether kind sup is a strict supertype of kind
// sub, i.e. every value of sub is a value of sup. Today the only such
// relation is `number` over its numeric leaves.
func kindSubsumes(sup, sub Kind) bool {
	return (sup == KindNumber && numericLeafKinds[sub]) ||
		// A path IS a string with more structure (PATHS.0.md), so
		// string-typed schemas over address fields keep admitting.
		(sup == KindString && KindPath == sub)
}

// kindParent returns the immediate lattice parent of a kind, and whether
// there is one. A numeric leaf lifts to `number`; `number` itself, and
// every non-numeric kind, has no parent and therefore lifts to top.
// This is the ladder super() climbs (R6, extended by the tower).
//
// It is deliberately NOT ScalarKindVal.superior(): superior() is also
// the narrowing gate PrefVal uses (`*integer & "hello"` must admit the
// string), so a kind's superior stays top there. See ScalarKindVal.
func kindParent(k Kind) (Kind, bool) {
	if numericLeafKinds[k] {
		return KindNumber, true
	}
	if KindPath == k {
		return KindString, true
	}
	return KindTop, false
}

// ScalarVal is a concrete scalar literal: a native value tagged with
// its Kind. peg holds string | int64 | float64 | bool | nil, or one of
// the tower's exact pegs: *big.Int (biginteger) and *Decimal
// (bigdecimal).
//
// The two exact pegs are POINTERS, and pointers are IMMUTABLE here (D8):
// clones share them and nothing mutates them in place. That also means
// `==` on a peg is an ADDRESS comparison for those kinds — every
// identity test must go through scalarPegSame instead (D2).
type ScalarVal struct {
	base
	kind Kind
	peg  any

	// src is the literal's own source text, when it came from one.
	//
	// A path segment is SPELLED TEXT: `$.a.0x0` addresses the key `0x0`,
	// the same key `a:{0x0:1}` creates, and NOT the key `0`. Only a plain
	// decimal integer is a numeric segment. So RefVal.append needs the
	// text, not the value -- normalising it here is what made `$.a.1e2`
	// address `100` and `$.a.0d1` address `1`.
	//
	// Empty for a value with no literal behind it (a computed result, an
	// API-constructed value, a $var binding), where there is no spelling
	// to preserve and the numeric rendering is the only answer available.
	// Mirrors ScalarVal.src in the canonical port.
	src string
}

// A FRESH SCALAR IS UNSITED UNTIL THE PARSER SAYS OTHERWISE, and `sp`
// therefore starts at -1 rather than at its zero value.
//
// Zero is a POSITION -- the first byte of the document -- so a value
// minted by unification rather than written by an author read as
// "row 1, column 1" everywhere a site is built. The canonical port has
// no such ambiguity: a TS site starts at -1 and only the parser moves
// it (ts/src/site.ts). Go's junctions already said this out loud
// (`c.sp = -1` in conjunct.go, `d.sp = -1` in disjunct.go, both for the
// same reason); the scalar minters simply never did, so `a: 1+2` met
// against `a: 5` reported its arithmetic RESULT at 1:1 in Go and at
// -1:-1 in TypeScript.
//
// siteOf (go/vet.go) already guards on `0 <= v.pos()` and needed no
// change: it was being handed a position that looked real.
func newScalar(kind Kind, peg any) *ScalarVal {
	v := &ScalarVal{kind: kind, peg: peg}
	v.dc = DONE
	v.sp = -1
	return v
}

func newString(s string) *ScalarVal { return newScalar(KindString, s) }

// newPath makes a path VALUE: a scalar of KindPath whose peg is the
// address spelling, in exactly the grammar refer() reads
// (docs/design/PATHS.0.md). Meets are syntactic -- by spelling.
func newPath(s string) *ScalarVal   { return newScalar(KindPath, s) }
func newInteger(i int64) *ScalarVal { return newScalar(KindInteger, i) }
func newFloat(f float64) *ScalarVal { return newScalar(KindFloat, f) }

// newBigInteger takes ownership of n (callers pass a freshly built
// big.Int; the peg is never mutated afterwards).
func newBigInteger(n *big.Int) *ScalarVal { return newScalar(KindBigInteger, n) }

// newBigDecimal takes a Decimal already in normal form (newDecimal).
func newBigDecimal(d *Decimal) *ScalarVal { return newScalar(KindBigDecimal, d) }

func newBoolean(b bool) *ScalarVal { return newScalar(KindBoolean, b) }
func newNull() *ScalarVal          { return newScalar(KindNull, nil) }

// scalarPegSame reports whether two scalars of the SAME kind hold the
// same VALUE (D2: identity is kind and value).
//
// The exact leaves must not fall through to `==`: a *big.Int or a
// *Decimal compares by ADDRESS there, so two separately parsed copies of
// the same literal would look distinct — silently breaking unification
// (`0d5 & 0d5`) and disjunct dedup. Every other peg type held by a
// ScalarVal (string, int64, float64, bool, nil) is comparable and
// compares by value.
func scalarPegSame(kind Kind, a, b any) bool {
	switch kind {
	case KindBigInteger:
		an, aok := a.(*big.Int)
		bn, bok := b.(*big.Int)
		return aok && bok && an.Cmp(bn) == 0
	case KindBigDecimal:
		ad, aok := a.(*Decimal)
		bd, bok := b.(*Decimal)
		return aok && bok && ad.equal(bd)
	}
	return a == b
}

// The yardstick is PLACED at the value it was derived from, as TS's
// `this.place(new ScalarKindVal(...))` does: a preference's type gate
// (pref.go) is reported to the user as a conflict operand, and an
// unplaced one pointed at the start of the document.
func (s *ScalarVal) superior() Val {
	k := newScalarKind(s.kind)
	k.sp, k.spu, k.surl = s.sp, s.spu, s.surl
	k.stext = s.stext
	return k
}

func (s *ScalarVal) Canon() string {
	switch s.kind {
	case KindString:
		return jsonString(s.peg.(string))
	case KindInteger:
		return strconv.FormatInt(s.peg.(int64), 10)
	case KindFloat:
		return canonNumber(s.peg.(float64))
	case KindBigInteger:
		// Sign before the marker (`-0d5`): D3 rejects `0d-5`, so canon
		// must not emit it.
		return markExact(bigIntDigits(s.peg.(*big.Int)))
	case KindBigDecimal:
		// Always one decimal place at minimum, so canon reparses as a
		// bigdecimal and not as a biginteger (D4).
		return s.peg.(*Decimal).Canon()
	case KindBoolean:
		if s.peg.(bool) {
			return "true"
		}
		return "false"
	case KindNull:
		return "null"
	case KindPath:
		// The call form is the literal syntax for this kind, so canon
		// renders it back and reparses to the same VALUE.
		return "path(" + s.peg.(string) + ")"
	}
	return ""
}

// Gen returns the NATIVE Go value for this scalar: string, int64
// (integer), float64 (float), bool, nil — and, for the tower's exact
// leaves, *big.Int (biginteger) and *Decimal (bigdecimal).
//
// The two exact leaves are POINTERS, and that is a requirement rather
// than a convenience (D9): a non-pointer big.Int sitting in an `any`
// marshals as `{}`, silently emitting an empty object where an exact
// number should be. As pointers, encoding/json calls their MarshalJSON
// and both reach JSON as EXACT DIGITS in a raw JSON number — JSON
// numbers are arbitrary-precision text, so nothing is lost on the way
// out. (Only JavaScript's serialiser needs help here, which is why the
// canonical port ships its own emitter.)
//
// Byte-exact serialisation cannot check any of this on its own: a
// biginteger and an integer can produce the SAME text while generate
// returned the wrong runtime type. The concrete types above are pinned
// by TestGenerateNativeExactTypes.
func (s *ScalarVal) Gen(ctx *Ctx) (any, error) {
	// Negative zero never reaches generated output. (Unary minus already
	// normalises it away, but `+` and the NewNumber API can still build
	// one, so the generate path normalises too.)
	if s.kind == KindFloat {
		if f, ok := s.peg.(float64); ok && f == 0 {
			return float64(0), nil
		}
	}
	if s.kind == KindBigInteger {
		// A COPY leaves the engine, because a *big.Int is mutable and the
		// peg is not: handing the peg itself out would let a consumer
		// mutate a value the AST (and any $var bound to it) still holds.
		// NewBigInteger copies on the way in for the same reason. A
		// *Decimal needs no copy — its fields are unexported and nothing
		// ever mutates one — so, like TypeScript's Decimal instance, it
		// goes out as it is.
		return new(big.Int).Set(s.peg.(*big.Int)), nil
	}
	return s.peg, nil
}

func (s *ScalarVal) Unify(peer Val, ctx *Ctx) Val {
	if peer == nil || isTop(peer) {
		return s
	}
	if sk, ok := peer.(*ScalarKindVal); ok {
		return sk.Unify(s, ctx)
	}
	if pc, ok := peer.(*ConstraintVal); ok {
		// The constraint algebra owns membership (constraint.go admit).
		return pc.Unify(s, ctx)
	}
	if ps, ok := peer.(*ScalarVal); ok {
		// Two path values meet by the PREFIX rule (ADR-016): the longer
		// when one opens the other, refusal otherwise; the winner
		// carries both sides' marks, as the equal arm below ratchets
		// them. Mirrors PathVal.unify in ts/src/val/PathVal.ts.
		if KindPath == s.kind && KindPath == ps.kind {
			merged, mok := prefixMeet(s.peg.(string), ps.peg.(string))
			if !mok {
				return makeNilErr(ctx, "scalar_value", s, peer)
			}
			out, other := s, ps
			if merged != s.peg.(string) {
				out, other = ps, s
			}
			if other.mtype {
				out.mtype = true
			}
			if other.mhide {
				out.mhide = true
			}
			return out
		}
		// Identity is kind AND value (D2). scalarPegSame, not `==`: the
		// exact leaves hold pointers, and `==` would compare addresses.
		if ps.kind == s.kind && scalarPegSame(s.kind, ps.peg, s.peg) {
			// Marks ratchet true across a unify (TS propagateMarks): a
			// hide()/type() spread clone marks the destination value
			// (`K:true &:hide($flag)` hides K).
			if ps.mtype {
				s.mtype = true
			}
			if ps.mhide {
				s.mhide = true
			}
			return s
		}
		code := "scalar_kind"
		if ps.kind == s.kind {
			code = "scalar_value"
		}
		return makeNilErr(ctx, code, s, peer)
	}
	// Non-scalar peer (map, list, ...): the TS ScalarVal.unify fallback
	// computes 'scalar_' + kind-equality here, and a non-scalar peer
	// never shares the kind, so the code is scalar_kind — the old
	// "scalar" spelling was unregistered and broke code parity the
	// moment AontuError.Code exposed it.
	return makeNilErr(ctx, "scalar_kind", s, peer)
}

// ScalarKindVal is a type constraint (e.g. string, number) — a scalar
// kind without a concrete value.
type ScalarKindVal struct {
	base
	kind Kind
}

func newScalarKind(k Kind) *ScalarKindVal {
	v := &ScalarKindVal{kind: k}
	v.sp = unsited
	v.dc = DONE
	return v
}

// superior of a kind is TOP (TS ScalarKindVal inherits FeatureVal's
// superior): a pref whose peg is a kind (`*integer & "hello"`) lets any
// concrete peer narrow it rather than clashing with the kind.
//
// This is NOT the kind lattice's parent relation — `super(integer)` is
// `number`, not top. That ladder is kindParent, consulted directly by
// the super() function; superior() has the separate PrefVal job above
// and must keep answering top for every kind.
// superior answers top for a kind marker. Its one caller was the
// preference gate, which asks superOf now (ADR-011 R4) and climbs the
// kind lattice explicitly (`super(integer)` is `number`); the method
// stays because the Val interface requires it.
// (superOf answers for this type before the fallthrough.)
func (k *ScalarKindVal) superior() Val { return top() } //coverage:ignore
func (k *ScalarKindVal) Canon() string {
	// The path kind renders as the vacuous call (PATHS.0.md): the
	// bare word `path` is an ordinary string, not a keyword.
	if KindPath == k.kind {
		return "path()"
	}
	return k.kind.String()
}

func (k *ScalarKindVal) Gen(ctx *Ctx) (any, error) {
	// Code mirrors the TS FeatureVal.gen choice for residual
	// non-literal values (a bare `number` generates a no_gen error in
	// both ports; pinned by error.tsv errc-no-gen-root).
	return nil, residueErr(ctx, k, "no_gen")
}

func (k *ScalarKindVal) Unify(peer Val, ctx *Ctx) Val {
	if peer == nil || isTop(peer) {
		return k
	}
	if pc, ok := peer.(*ConstraintVal); ok {
		// The constraint algebra owns the kind-meets-constraint rules
		// (narrowing, domain checks) -- delegate, so disjunct trials and
		// direct drives agree with the sorted conjunct fold.
		return pc.Unify(k, ctx)
	}
	if ps, ok := peer.(*ScalarVal); ok {
		// A kind admits a concrete value of that kind, and a supertype
		// admits a value of any kind below it (`number & 1.5` is 1.5).
		if ps.kind == k.kind || kindSubsumes(k.kind, ps.kind) {
			return ps
		}
		return makeNilErr(ctx, "no_scalar_unify", k, peer)
	}
	if pk, ok := peer.(*ScalarKindVal); ok {
		// Meet of two kinds: the same kind, or the lower of a
		// supertype/subtype pair (`number & float` is `float`). Two
		// distinct leaves describe disjoint value sets, so they have no
		// common lower bound and cannot unify.
		if k.kind == pk.kind {
			return k
		}
		if kindSubsumes(k.kind, pk.kind) {
			return pk
		}
		if kindSubsumes(pk.kind, k.kind) {
			return k
		}
		return makeNilErr(ctx, "scalar-type", k, peer)
	}
	return makeNilErr(ctx, "not-scalar-type", k, peer)
}

// jsonString renders a Go string as a JSON string literal, matching
// JavaScript's JSON.stringify for the cases used by the spec.
func jsonString(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			// Other control characters become \u00XX, matching
			// JavaScript's JSON.stringify.
			if r < 0x20 {
				const hexd = "0123456789abcdef"
				b.WriteString(`\u00`)
				b.WriteByte(hexd[(r>>4)&0xf])
				b.WriteByte(hexd[r&0xf])
			} else {
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
	return b.String()
}

// formatNumber renders a float64 exactly the way JavaScript's
// Number.toString does: fixed decimal notation for exponents in
// [-6, 20], otherwise exponential with an unpadded, always-signed
// exponent ("1e+21", "1e-7" — not Go's "1e+21"/"1e-07"). This keeps
// numeric canon output identical to the TS implementation at every
// magnitude.
func formatNumber(f float64) string {
	// Both zeros render as "0" — negative zero never survives into
	// output. (JS agrees: String(-0) is "0".)
	if f == 0 {
		return "0"
	}
	// Non-finite values render as JS Number.toString does; they cannot
	// arrive via the parser (an overflowing literal becomes not_number)
	// but are reachable through the exported NewNumber constructor.
	if math.IsNaN(f) {
		return "NaN"
	}
	if math.IsInf(f, 1) {
		return "Infinity"
	}
	if math.IsInf(f, -1) {
		return "-Infinity"
	}
	mant := strconv.FormatFloat(f, 'e', -1, 64)
	i := strings.IndexByte(mant, 'e')
	digits := mant[:i]
	exp, _ := strconv.Atoi(mant[i+1:])
	if exp >= -6 && exp <= 20 {
		return strconv.FormatFloat(f, 'f', -1, 64)
	}
	sign := "+"
	if exp < 0 {
		sign = "-"
		exp = -exp
	}
	return digits + "e" + sign + strconv.Itoa(exp)
}

// canonNumber renders a number-kind scalar for CANON, where the output
// must reparse to a value of the same kind. formatNumber alone would
// render 1.0 as "1", which reparses as an integer, so a rendering that
// carries neither a fraction nor an exponent gains a ".0" suffix:
//
//	1.0 -> "1.0"   0.0 -> "0.0"   1e20 -> "100000000000000000000.0"
//	1e21 -> "1e+21"   0.000001 -> "0.000001"   NaN/Infinity -> unchanged
//
// This is the canon path ONLY. String coercion inside `+` keeps plain
// JS parity ("a"+1.0 is "a1") and so goes through formatNumber, which
// must not pick up the suffix.
func canonNumber(f float64) string {
	s := formatNumber(f)
	// '.' fraction, 'e'/'E' exponent, 'N' NaN, 'I' Infinity.
	if strings.ContainsAny(s, ".eENI") {
		return s
	}
	return s + ".0"
}
