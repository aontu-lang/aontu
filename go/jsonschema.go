/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"encoding/json"
	"math/big"
	"regexp"
	"slices"
	"sort"
	"strings"
)

const jsonSchemaDraft = "https://json-schema.org/draft/2020-12/schema"

// SchemaLoss is one construct the schema could not carry.
type SchemaLoss struct {
	// Construct is the Aontu construct's own name, so a reader can grep
	// their source for it.
	Construct string `json:"construct"`
	// Path is the `$.a.b` spelling every other report uses.
	Path string `json:"path"`
	// Reason is one sentence: why JSON Schema cannot say it, and what
	// the schema says instead.
	Reason string `json:"reason"`
}

// SchemaReport is the result of an export.
type SchemaReport struct {
	// Errors carries WHY the run could not be made, in vet's finding
	// shape. Present only on an error verdict.
	Errors []VetFinding `json:"errors,omitempty"`
	// Lossy names every construct that could not be carried, in document
	// order.
	Lossy  []SchemaLoss   `json:"lossy"`
	Schema map[string]any `json:"schema"`
	// Verdict: ok everything carried, lossy the schema is a WEAKER
	// statement than the model, error the document does not stand up.
	Verdict string `json:"verdict"`
}

type schemaCtx struct {
	lossy  []SchemaLoss
	failed Val
	exact  bool
	root   Val
	defs   map[string]any
	names  map[string]string
	anchor []string
}

func (sc *schemaCtx) lose(path []string, construct, reason string) {
	sc.lossy = append(sc.lossy,
		SchemaLoss{Path: schemaPathText(path), Construct: construct,
			Reason: reason})
}

func (sc *schemaCtx) fail(v Val) {
	if nil == sc.failed {
		sc.failed = v
	}
}

func schemaPathText(path []string) string {
	if 0 == len(path) {
		return "$"
	}
	return "$." + strings.Join(path, ".")
}

func schemaAt(path []string, part string) []string {
	return append(append([]string{}, path...), part)
}

var kindType = map[Kind]string{
	KindString:     "string",
	KindBoolean:    "boolean",
	KindInteger:    "integer",
	KindBigInteger: "integer",
	KindFloat:      "number",
	KindBigDecimal: "number",
	KindNumber:     "number",
	KindPath:       "string",
	KindNull:       "null",
}

// The numeric leaves, and the ones vet reads JSON data as. Plain vet
// reads a spelling with a point as a float and one without as an
// integer, and nothing as an exact leaf; vet --exact-numbers reads a
// number by its value alone, never as a float.
type schemaLeaf string

const (
	leafInteger    schemaLeaf = "integer"
	leafFloat      schemaLeaf = "float"
	leafBigInteger schemaLeaf = "biginteger"
	leafBigDecimal schemaLeaf = "bigdecimal"
)

var leavesAll = []schemaLeaf{leafInteger, leafFloat, leafBigInteger,
	leafBigDecimal}

var leavesPlainRead = []schemaLeaf{leafInteger, leafFloat}

var kindLeaves = map[Kind][]schemaLeaf{
	KindInteger:    {leafInteger},
	KindFloat:      {leafFloat},
	KindBigInteger: {leafBigInteger},
	KindBigDecimal: {leafBigDecimal},
	KindNumber:     leavesAll,
}

var kindLoss = map[Kind]string{
	KindInteger: "the schema says \"integer\" and admits a JSON spelling such as " +
		"1.0, which vet reads as a float and the integer leaf refuses",
	KindFloat: "the schema says \"number\" and admits a JSON spelling such as 1, " +
		"which vet reads as an integer and the float leaf refuses",
	KindBigInteger: "the schema says \"integer\" and admits every JSON integer, " +
		"which vet reads as an integer or a float, never as the biginteger leaf",
	KindBigDecimal: "the schema says \"number\" and admits every JSON number, " +
		"which vet reads as an integer or a float, never as the bigdecimal leaf",
}

var exactKindLoss = map[Kind]string{
	KindInteger: "the schema says \"integer\" and admits an integral JSON number " +
		"beyond the integer leaf, which vet --exact-numbers reads as a " +
		"biginteger and the integer leaf refuses",
	KindFloat: "the schema says \"number\" and admits every JSON number, which vet " +
		"--exact-numbers reads by its value, never as a float",
	KindBigInteger: "the schema says \"integer\" and admits an integral JSON number " +
		"the integer leaf holds, which vet --exact-numbers reads as an integer " +
		"and the biginteger leaf refuses",
	KindBigDecimal: "the schema says \"number\" and admits an integral JSON number, " +
		"which vet --exact-numbers reads as an integer or a biginteger and the " +
		"bigdecimal leaf refuses",
}

const exactLiteralReason = "the schema admits this value in every JSON spelling, " +
	"which vet reads as an integer or a float, never as the exact leaf; the " +
	"digits are written exactly"

var literalLoss = map[schemaLeaf]string{
	leafInteger: "the schema admits the float spelling of this value, which vet " +
		"reads as a float and the integer leaf refuses",
	leafFloat: "the schema admits the integer spelling of this value, which vet " +
		"reads as an integer and the float leaf refuses",
	leafBigInteger: exactLiteralReason,
	leafBigDecimal: exactLiteralReason,
}

// An integer literal is always a value the integer leaf holds, so under
// the exact reading it is never lone.
var exactLiteralLoss = map[schemaLeaf]string{
	leafFloat: "the schema admits this value, which vet --exact-numbers reads by " +
		"its value, never as a float",
	leafBigInteger: "the schema admits this value, which vet --exact-numbers reads " +
		"as an integer, and the biginteger leaf refuses it",
	leafBigDecimal: "the schema admits this integral value, which vet " +
		"--exact-numbers reads as an integer or a biginteger, and the " +
		"bigdecimal leaf refuses it",
}

func leafOf(sv *ScalarVal) (schemaLeaf, bool) {
	switch sv.kind {
	case KindInteger:
		return leafInteger, true
	case KindFloat:
		return leafFloat, true
	case KindBigInteger:
		return leafBigInteger, true
	case KindBigDecimal:
		return leafBigDecimal, true
	}
	return "", false
}

func (sc *schemaCtx) readings(sv *ScalarVal) []schemaLeaf {
	s := scaledOfNumeric(sv)
	if !scaledIsIntegral(s) {
		if sc.exact {
			return []schemaLeaf{leafBigDecimal}
		}
		return []schemaLeaf{leafFloat}
	}
	if !sc.exact {
		return leavesPlainRead
	}
	if isIntegerStorable(scaledFloorBig(s)) {
		return []schemaLeaf{leafInteger}
	}
	return []schemaLeaf{leafBigInteger}
}

// jsonOfScalar is the JSON value of a concrete scalar; the exact leaves
// marshal as their own digits.
func jsonOfScalar(sv *ScalarVal) any {
	return sv.peg
}

func sameJSON(a, b *ScalarVal) bool {
	_, an := leafOf(a)
	_, bn := leafOf(b)
	if an && bn {
		return 0 == cmpNumeric(a, b)
	}
	return !an && !bn && a.kind == b.kind && a.peg == b.peg
}

type schemaGroup struct {
	v      *ScalarVal
	leaves []schemaLeaf
}

func leafIn(ls []schemaLeaf, l schemaLeaf) bool {
	for _, x := range ls {
		if x == l {
			return true
		}
	}
	return false
}

// schemaGroups is one entry per JSON value, in written order, with every
// leaf the value is written in.
func schemaGroups(members []*ScalarVal) []*schemaGroup {
	out := []*schemaGroup{}
	for _, m := range members {
		var g *schemaGroup
		for _, x := range out {
			if sameJSON(x.v, m) {
				g = x
				break
			}
		}
		if nil == g {
			g = &schemaGroup{v: m, leaves: []schemaLeaf{}}
			out = append(out, g)
		}
		if leaf, numeric := leafOf(m); numeric && !leafIn(g.leaves, leaf) {
			g.leaves = append(g.leaves, leaf)
		}
	}
	return out
}

// lone is the first number with an admitted JSON spelling no
// member is written in: there the schema and the model disagree.
func (sc *schemaCtx) lone(gs []*schemaGroup, admitted []schemaLeaf) *ScalarVal {
	for _, g := range gs {
		if _, numeric := leafOf(g.v); !numeric {
			continue
		}
		for _, r := range sc.readings(g.v) {
			if leafIn(admitted, r) && !leafIn(g.leaves, r) {
				return g.v
			}
		}
	}
	return nil
}

func (sc *schemaCtx) loseLiterals(path []string, gs []*schemaGroup) {
	if v := sc.lone(gs, leavesAll); nil != v {
		leaf, _ := leafOf(v)
		construct := "exact"
		if leafInteger == leaf || leafFloat == leaf {
			construct = string(leaf)
		}
		reasons := literalLoss
		if sc.exact {
			reasons = exactLiteralLoss
		}
		sc.lose(path, construct+" literal", reasons[leaf])
	}
}

func (sc *schemaCtx) loseKind(path []string, k Kind) {
	reasons := kindLoss
	if sc.exact {
		reasons = exactKindLoss
	}
	if reason, ok := reasons[k]; ok {
		sc.lose(path, k.String(), reason)
	}
}

// schemaLosePath: a path is its address string at the JSON boundary,
// and the schema cannot say which strings are addresses.
func schemaLosePath(sc *schemaCtx, path []string) {
	sc.lose(path, "path",
		"a path admits only path values, but JSON Schema has no path type; "+
			"the schema says \"string\" and admits any string here")
}

func scalarSchemaType(sv *ScalarVal) string {
	switch sv.kind {
	case KindBigDecimal, KindFloat:
		return "number"
	case KindInteger, KindBigInteger:
		return "integer"
	case KindBoolean:
		return "boolean"
	}
	return "string"
}

func schemaAllOf(out map[string]any, part any) {
	all, _ := out["allOf"].([]any)
	out["allOf"] = append(all, part)
}

func (sc *schemaCtx) bound(path []string, out map[string]any,
	b *constraintBound, key, openKey, atom, openAtom string) {
	if nil == b {
		return
	}
	if KindString == b.v.kind {
		name := atom
		if b.open {
			name = openAtom
		}
		sc.lose(path, name,
			"JSON Schema has no ordering keyword for strings, so this bound is "+
				"DROPPED and the schema admits strings outside it")
		return
	}
	if b.open {
		key = openKey
	}
	out[key] = jsonOfScalar(b.v)
}

var countKeys = map[string][2]string{
	"string": {"minLength", "maxLength"},
	"map":    {"minProperties", "maxProperties"},
	"list":   {"minItems", "maxItems"},
}

// countEdge is the integer a count bound admits at its edge: counts are
// whole, so an open or fractional bound moves to the nearest whole count
// inside it.
func countEdge(b *constraintBound, upper bool) int64 {
	s := scaledOfNumeric(b.v)
	whole := scaledIsIntegral(s)
	n := scaledFloorBig(s)
	one := big.NewInt(1)
	if upper {
		if b.open && whole {
			n = new(big.Int).Sub(n, one)
		}
		return n.Int64()
	}
	if b.open || !whole {
		n = new(big.Int).Add(n, one)
	}
	return n.Int64()
}

func (sc *schemaCtx) count(path []string, out map[string]any,
	n *ConstraintVal, kind string) {
	keys, known := countKeys[kind]
	if !known {
		keys = countKeys["list"]
	}
	out[keys[0]] = countEdge(n.lo, false)
	if nil != n.hi {
		out[keys[1]] = countEdge(n.hi, true)
	}
	// A count is an integer leaf, so only an integer exclusion meets one.
	for _, x := range n.neqs {
		if KindInteger == x.kind {
			schemaAllOf(out, map[string]any{
				"not": map[string]any{keys[0]: x.peg, keys[1]: x.peg}})
		}
	}
	if !known {
		sc.lose(path, "len",
			"a count with no domain is exported as minItems/maxItems; "+
				"JSON Schema has no keyword that counts a string OR a container")
	}
}

func elementLeaves(e Val) ([]schemaLeaf, bool) {
	switch t := e.(type) {
	case *ScalarVal:
		if leaf, numeric := leafOf(t); numeric {
			return []schemaLeaf{leaf}, true
		}
		return []schemaLeaf{}, true
	case *ScalarKindVal:
		if ls, ok := kindLeaves[t.kind]; ok {
			return ls, true
		}
		return []schemaLeaf{}, true
	case *ConstraintVal:
		if nil != t.count {
			return nil, false
		}
		if ls, ok := kindLeaves[t.kind]; ok {
			return ls, true
		}
		if "string" == t.domain {
			return []schemaLeaf{}, true
		}
		return leavesAll, true
	case *EmptyVal:
		return []schemaLeaf{}, true
	case *DisjunctVal:
		all := []schemaLeaf{}
		for _, m := range t.peg {
			ls, ok := elementLeaves(m)
			if !ok {
				return nil, false
			}
			for _, l := range ls {
				if !leafIn(all, l) {
					all = append(all, l)
				}
			}
		}
		return all, true
	}
	return nil, false
}

// uniqueExact: unique() tells an integer from a float of the same value
// and uniqueItems does not, so they agree only on a list that cannot
// hold both.
func (sc *schemaCtx) uniqueExact(bag Val) bool {
	l, ok := bag.(*ListVal)
	if !ok {
		return false
	}
	// Read by value, JSON numbers equal in value are one aontu value.
	if sc.exact {
		return true
	}
	if nil == l.spread && !l.closed {
		return false
	}
	elems := l.peg
	if nil != l.spread {
		elems = append([]Val{l.spread}, l.peg...)
	}
	leaves := []schemaLeaf{}
	for _, e := range elems {
		ls, ok := elementLeaves(e)
		if !ok {
			return false
		}
		for _, x := range ls {
			if leafIn(leavesPlainRead, x) && !leafIn(leaves, x) {
				leaves = append(leaves, x)
			}
		}
	}
	return len(leaves) <= 1
}

func schemaFromConstraint(sc *schemaCtx, path []string,
	c *ConstraintVal, bag Val) map[string]any {
	out := map[string]any{}

	if "" != c.invalid {
		sc.fail(c)
		return out
	}

	if t, ok := kindType[c.kind]; ok {
		out["type"] = t
		sc.loseKind(path, c.kind)
	} else if "string" == c.domain {
		out["type"] = "string"
	} else if "number" == c.domain {
		out["type"] = "number"
	}

	sc.bound(path, out, c.lo, "minimum", "exclusiveMinimum", "min", "above")
	sc.bound(path, out, c.hi, "maximum", "exclusiveMaximum", "max", "below")

	if 0 < len(c.neqs) {
		gs := schemaGroups(c.neqs)
		vals := make([]any, 0, len(gs))
		for _, g := range gs {
			vals = append(vals, jsonOfScalar(g.v))
		}
		out["not"] = map[string]any{"enum": vals}
		admitted, ok := kindLeaves[c.kind]
		if !ok {
			admitted = leavesAll
		}
		if nil != sc.lone(gs, admitted) {
			sc.lose(path, "neq",
				"the schema refuses every JSON spelling of an excluded number, and "+
					"neq excludes only the leaves it names, so the model admits a "+
					"spelling the schema refuses")
		}
	}

	for _, m := range c.mults {
		if 1 == len(c.mults) {
			out["multipleOf"] = jsonOfScalar(m)
		} else {
			schemaAllOf(out, map[string]any{"multipleOf": jsonOfScalar(m)})
		}
	}

	for _, r := range c.res {
		if 1 == len(c.res) {
			out["pattern"] = r.norm
		} else {
			schemaAllOf(out, map[string]any{"pattern": r.norm})
		}
	}

	if nil != c.count {
		kind := ""
		switch bag.(type) {
		case *MapVal:
			kind = "map"
		case *ListVal:
			kind = "list"
		}
		if "string" == c.domain {
			kind = "string"
		}
		sc.count(path, out, c.count, kind)
	}

	if c.nonEmpty && !c.emptyOk && !schemaAtLeastOne(out["minLength"]) {
		out["minLength"] = 1
	}
	if c.pathKind {
		schemaLosePath(sc, path)
	}

	if c.uniq {
		out["uniqueItems"] = true
		if !sc.uniqueExact(bag) {
			sc.lose(path, "unique",
				"uniqueItems compares numbers by value, so the schema refuses a list "+
					"such as [1, 1.0], which unique() admits because vet reads the two "+
					"as different leaves")
		}
	}

	for _, key := range c.uniqBy {
		sc.lose(path, "unique("+key+")",
			"JSON Schema has no uniqueness-by-property keyword; uniqueItems "+
				"compares whole items, so this constraint is DROPPED and the "+
				"schema admits records sharing a `"+key+"`")
	}

	if 0 < len(c.musts) {
		sc.lose(path, "must",
			"an evaluate-only check is opaque by construction -- it carries "+
				"the author's own message and the algebra never reasons about "+
				"it -- so it is DROPPED and the schema admits values `vet` refuses")
	}

	for _, n := range c.nofs {
		sc.nofKeyword(path, out, n)
	}

	return out
}

// nofKeyword writes a count of admitting branches as the keyword that
// counts the same: none of them, exactly one, any, or all.
func (sc *schemaCtx) nofKeyword(path []string, out map[string]any, n constraintNof) {
	k := len(n.branches)
	counts := nofCounts(n)
	from := func(lo int) bool {
		return len(counts) == k-lo+1 && lo == counts[0]
	}
	put := func(kw string, v any) {
		if _, has := out[kw]; !has {
			out[kw] = v
		} else {
			schemaAllOf(out, map[string]any{kw: v})
		}
	}
	schemas := func() []any {
		out := []any{}
		for _, b := range n.branches {
			out = append(out, schemaFromVal(sc, path, b))
		}
		return out
	}
	switch {
	case from(0):
	case 0 == len(counts):
		put("not", map[string]any{})
	case 1 == len(counts) && 0 == counts[0]:
		if 1 == k {
			put("not", schemas()[0])
		} else {
			put("not", map[string]any{"anyOf": schemas()})
		}
	case 1 == len(counts) && 1 == counts[0]:
		put("oneOf", schemas())
	case from(1):
		put("anyOf", schemas())
	case 1 == len(counts) && k == counts[0]:
		for _, s := range schemas() {
			schemaAllOf(out, s)
		}
	default:
		sc.lose(path, "nof",
			"nof counts the alternatives that admit a value, and JSON Schema "+
				"counts none, one, any or all of them; this count is none of those, "+
				"so it is DROPPED and the schema admits values `vet` refuses")
	}
}

// schemaAtLeastOne reports whether an exported length bound is already
// at least 1.
func schemaAtLeastOne(v any) bool {
	n, ok := v.(int64)
	return ok && 1 <= n
}

var schemaDeprecationText = []string{"msg", "use", "since"}

func schemaFromVal(sc *schemaCtx, path []string, v Val) any {
	if ref, ok := schemaAliasRef(sc, v); ok {
		return ref
	}
	out := schemaFromValInner(sc, path, v)

	obj, isObj := out.(map[string]any)
	if rec := v.deprecRec(); nil != rec && isObj {
		said := []string{}
		for _, k := range schemaDeprecationText {
			if _, ok := rec[k]; ok {
				said = append(said, k)
			}
		}
		if 0 < len(said) {
			sc.lose(path, "deprecate",
				"JSON Schema 2020-12 has the `deprecated` flag and no field "+
					"for what it SAYS, so "+strings.Join(said, "/")+
					" cannot cross; the schema marks the property deprecated "+
					"and a consumer must read the model for the reason")
		}
		obj["deprecated"] = true
	}

	return out
}

// schemaAliasRef: an alias's copy, unchanged, or a recursion back into a
// definition, is written once under $defs and referred to where used.
func schemaAliasRef(sc *schemaCtx, v Val) (any, bool) {
	var target []string
	if r, ok := v.(*RecurseVal); ok {
		target = r.target
		if slices.Equal(target, sc.anchor) {
			return map[string]any{"$ref": "#"}, true
		}
	} else if key := v.aliasOrigin(); "" != key {
		if def := walkTarget(sc.root, []string{key}); nil != def && def.Canon() == v.Canon() {
			target = []string{key}
		}
	}
	var body Val
	if nil != target {
		body = walkTarget(sc.root, target)
	}
	if nil == body {
		return nil, false
	}
	at := make([]string, len(target))
	for i, seg := range target {
		at[i] = aliasPathSegment(seg)
	}
	id := strings.Join(target, "\x00")
	key, named := sc.names[id]
	if !named {
		base := strings.TrimPrefix(strings.Join(at, "."), "%")
		key = base
		for n := 2; ; n++ {
			if _, taken := sc.defs[key]; !taken {
				break
			}
			key = base + "-" + itoa(n)
		}
		sc.names[id] = key
		sc.defs[key] = map[string]any{}
		sc.defs[key] = schemaFromVal(sc, at, body)
	}
	return map[string]any{"$ref": "#/$defs/" + schemaPointerToken(key)}, true
}

// schemaPointerToken: a JSON pointer token (RFC 6901), escaped again as
// the URI fragment that carries it (RFC 3986).
func schemaPointerToken(key string) string {
	tok := strings.ReplaceAll(strings.ReplaceAll(key, "~", "~0"), "/", "~1")
	var b strings.Builder
	for i := 0; i < len(tok); i++ {
		c := tok[i]
		if 'A' <= c && c <= 'Z' || 'a' <= c && c <= 'z' || '0' <= c && c <= '9' ||
			0 <= strings.IndexByte("-._~!$&'()*+,;=:@", c) {
			b.WriteByte(c)
		} else {
			b.WriteString("%" + string("0123456789ABCDEF"[c>>4]) + string("0123456789ABCDEF"[c&15]))
		}
	}
	return b.String()
}

var minCount = regexp.MustCompile(`^min(Items|Length|Properties)$`)

// schemaMeet describes a bag and its sizing atom as one schema object:
// the bag's positions and the atom both give a lower count, and the
// higher holds.
func schemaMeet(a any, b map[string]any) any {
	out, _ := a.(map[string]any)
	for k, bv := range b {
		if av, have := out[k].(int64); have && minCount.MatchString(k) && av > bv.(int64) {
			bv = av
		}
		out[k] = bv
	}
	return out
}

func schemaFromValInner(sc *schemaCtx, path []string, v Val) any {
	switch t := v.(type) {
	case *PrefVal:
		inner := schemaFromVal(sc, path, t.superpeg)
		if gen, ok := schemaGenerated(t.peg); ok {
			if obj, isObj := inner.(map[string]any); isObj {
				obj["default"] = gen
			}
		}
		return inner

	case *DisjunctVal:
		return schemaFromDisjunct(sc, path, t)

	case *ConstraintVal:
		return schemaFromConstraint(sc, path, t, nil)

	case *ConjunctVal:
		if con, bag, ok := sizingResidue(t); ok {
			return schemaMeet(schemaFromVal(sc, path, bag),
				schemaFromConstraint(sc, path, con, bag))
		}
		if allMaps(t.peg) {
			all := make([]any, 0, len(t.peg))
			for _, term := range t.peg {
				all = append(all, schemaFromVal(sc, path, term))
			}
			return map[string]any{"allOf": all}
		}
		return schemaFromConjunct(sc, path, t)

	case *MapVal:
		return schemaFromMap(sc, path, t)

	case *ListVal:
		return schemaFromList(sc, path, t)

	case *MapKindVal:
		return map[string]any{"type": "object"}

	case *ListKindVal:
		return map[string]any{"type": "array"}

	case *ScalarKindVal:
		sc.loseKind(path, t.kind)
		if KindPath == t.kind {
			schemaLosePath(sc, path)
		}
		jt := kindType[t.kind]
		// `string` refuses "", and `string & empty()` does not.
		if KindString == t.kind && !t.emptyOk {
			return map[string]any{"type": jt, "minLength": 1}
		}
		return map[string]any{"type": jt}

	case *ScalarVal:
		if KindNull == t.kind {
			return map[string]any{"type": "null"}
		}
		sc.loseLiterals(path, schemaGroups([]*ScalarVal{t}))
		return map[string]any{
			"const": jsonOfScalar(t),
			"type":  scalarSchemaType(t),
		}

	case *NilVal:
		// The written `nil` is the bottom, which admits nothing; any other
		// nil is a failure the document carries, and refuses the run.
		if "literal_nil" != t.why {
			sc.fail(t)
		}
		return false
	}

	if isTop(v) {
		return map[string]any{}
	}

	// `empty()` admits exactly the strings, "" included.
	if _, ok := v.(*EmptyVal); ok {
		return map[string]any{"type": "string"}
	}

	if f, ok := v.(*FuncVal); ok {
		if sig, known := funcSig[f.name]; known {
			if kind, typed := schemaResultType[sig.Out]; typed {
				sc.lose(path, schemaResidueName(v),
					"this is computed when the document is evaluated, which a "+
						"schema cannot say, so the schema admits any "+kind+" here")
				return map[string]any{"type": kind}
			}
		}
	}
	sc.lose(path, schemaResidueName(v),
		"this is not a value yet, so there is nothing to constrain a "+
			"consumer to; the schema admits anything here")
	return map[string]any{}
}

var schemaResultType = map[string]string{
	"string": "string", "number": "number", "map": "object", "list": "array",
}

func schemaPlainTerm(t Val) bool {
	switch n := t.(type) {
	case *ScalarKindVal, *ConstraintVal, *EmptyVal, *ScalarVal, *TopVal,
		*MapKindVal, *ListKindVal:
		return true
	case *DisjunctVal:
		return schemaPlainTerms(n.peg)
	case *ConjunctVal:
		return schemaPlainTerms(n.peg)
	}
	return false
}

func schemaPlainTerms(ts []Val) bool {
	for _, t := range ts {
		if !schemaPlainTerm(t) {
			return false
		}
	}
	return true
}

// schemaFromConjunct: a conjunct held unmet in a template meets here on
// its own, so a kind and its atoms export as one schema object. Terms
// that read the document, or do not meet alone, export side by side.
func schemaFromConjunct(sc *schemaCtx, path []string, v *ConjunctVal) any {
	plain := true
	for _, t := range v.peg {
		plain = plain && schemaPlainTerm(t)
	}
	if plain {
		// Each term meets top first, as a parsed value does: a nested
		// disjunction is held unflattened until then.
		trial := &Ctx{collect: true}
		var met Val = top()
		for _, t := range v.peg {
			met = unite(trial, met, unite(trial, top(), clonePath(t, cp(t.vpath()))))
		}
		if _, still := met.(*ConjunctVal); 0 == len(trial.err) && !still && !met.Nil() {
			return schemaFromVal(sc, path, met)
		}
	}
	all := make([]any, 0, len(v.peg))
	for _, t := range v.peg {
		all = append(all, schemaFromVal(sc, path, t))
	}
	return map[string]any{"allOf": all}
}

func allMaps(vs []Val) bool {
	for _, v := range vs {
		if _, ok := v.(*MapVal); !ok {
			return false
		}
	}
	return true
}

func schemaResidueName(v Val) string {
	switch t := v.(type) {
	case *RefVal:
		return "reference"
	case *FuncVal:
		return t.name
	}
	return "unresolved"
}

// schemaGenerated is the generated JSON of a value, or ok=false where it
// does not generate. Used for default and for enum members: both are
// VALUES in the schema, so a member that is itself a shape has none.
// schemaDropped: a preference with nothing to generate, as *any has, is
// dropped from the document, so the schema does not ask for it.
func schemaDropped(v Val) bool {
	p, ok := v.(*PrefVal)
	if !ok {
		return false
	}
	ctx := &Ctx{root: v, collect: true}
	out, err := p.Gen(ctx)
	s, scalar := p.peg.(*ScalarVal)
	return nil == out && nil == err && 0 == len(ctx.err) && !(scalar && KindNull == s.kind)
}

func schemaGenerated(v Val) (any, bool) {
	ctx := &Ctx{root: v, collect: true}
	out, err := v.Gen(ctx)
	if nil != err || 0 < len(ctx.err) {
		return nil, false
	}
	// A nil out is JSON null only from a null: any other value giving it,
	// as any does, has nothing to generate.
	if s, ok := v.(*ScalarVal); nil == out && !(ok && KindNull == s.kind) {
		return nil, false
	}
	return out, true
}

// schemaScoped: the keywords that hold for one JSON kind and pass every
// other, so the arms of a split by kind may share one schema object.
var schemaScoped = map[string][]string{
	"null":    {},
	"boolean": {},
	"number":  {"minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"},
	"integer": {"minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"},
	"string":  {"minLength", "maxLength", "pattern"},
	"object": {"properties", "required", "additionalProperties",
		"patternProperties", "propertyNames", "minProperties", "maxProperties"},
	"array": {"prefixItems", "items", "minItems", "maxItems", "uniqueItems"},
}

var schemaKinds = []string{"null", "boolean", "number", "string", "object", "array"}

func schemaText(s any) string {
	raw, _ := json.Marshal(s)
	return string(raw)
}

// schemaFoldKinds: arms of distinct kinds as one schema object, `type`
// naming the kinds (left off when all six are there) and each arm's own
// keywords joining it. The numeric arms must agree on their keywords, or
// the fold is refused.
func schemaFoldKinds(arms []any) (map[string]any, bool) {
	out := map[string]any{}
	types := []string{}
	held := map[string]string{}
	for _, arm := range arms {
		obj, _ := arm.(map[string]any)
		t, _ := obj["type"].(string)
		scoped, known := schemaScoped[t]
		if !known {
			return nil, false
		}
		own := map[string]any{}
		for k, val := range obj {
			if "type" == k {
				continue
			}
			if !containsStr(scoped, k) {
				return nil, false
			}
			own[k] = val
		}
		family := t
		if "integer" == t {
			family = "number"
		}
		if prev, seen := held[family]; !seen {
			held[family] = schemaText(own)
			for k, val := range own {
				out[k] = val
			}
		} else if prev != schemaText(own) {
			return nil, false
		}
		if !containsStr(types, t) {
			types = append(types, t)
		}
	}
	all := len(types) == len(schemaKinds)
	for _, k := range schemaKinds {
		all = all && containsStr(types, k)
	}
	if 1 == len(types) {
		out["type"] = types[0]
	} else if !all {
		list := make([]any, 0, len(types))
		for _, t := range types {
			list = append(list, t)
		}
		out["type"] = list
	}
	return out, true
}

// schemaDisjuncts: a disjunction held unmet in a template keeps the
// nesting it was written with, which says nothing a flat one does not.
func schemaDisjuncts(v *DisjunctVal) []Val {
	out := []Val{}
	for _, m := range v.peg {
		if d, ok := m.(*DisjunctVal); ok {
			out = append(out, schemaDisjuncts(d)...)
		} else {
			out = append(out, m)
		}
	}
	return out
}

func schemaFromDisjunct(sc *schemaCtx, path []string,
	v *DisjunctVal) map[string]any {
	var def any
	haveDef := false

	bare := make([]Val, 0, len(v.peg))
	for _, m := range schemaDisjuncts(v) {
		if pv, ok := m.(*PrefVal); ok {
			if !haveDef {
				def, haveDef = schemaGenerated(pv.peg)
			}
			bare = append(bare, pv.peg)
			continue
		}
		bare = append(bare, m)
	}

	scalars := make([]*ScalarVal, 0, len(bare))
	for _, m := range bare {
		if sv, ok := m.(*ScalarVal); ok {
			scalars = append(scalars, sv)
		}
	}

	out := map[string]any{}
	if len(scalars) == len(bare) {
		gs := schemaGroups(scalars)
		sc.loseLiterals(path, gs)
		vals := make([]any, 0, len(gs))
		for _, g := range gs {
			vals = append(vals, jsonOfScalar(g.v))
		}
		out["enum"] = vals
	} else {
		arms := make([]any, 0, len(bare))
		for _, m := range bare {
			arms = append(arms, schemaFromVal(sc, path, m))
		}
		if folded, ok := schemaFoldKinds(arms); ok {
			out = folded
		} else {
			out["anyOf"] = arms
		}
	}
	if haveDef {
		out["default"] = def
	}
	return out
}

func containsStr(xs []string, x string) bool {
	for _, y := range xs {
		if y == x {
			return true
		}
	}
	return false
}

func schemaFromMap(sc *schemaCtx, path []string, v *MapVal) map[string]any {
	props := map[string]any{}
	required := []string{}

	optional := map[string]bool{}
	for _, k := range v.optional {
		optional[k] = true
	}

	keys := append([]string{}, v.keys...)
	sort.Strings(keys)

	for _, key := range keys {
		child := v.peg[key]

		if v.isAliasKey(key) {
			continue
		}

		// A marked child does not generate, so it is not part of the
		// value a consumer produces -- and a schema that demanded it
		// would refuse every correct document.
		if schemaSkipMarked(sc, schemaAt(path, key), v, child) {
			continue
		}

		props[key] = schemaFromVal(sc, schemaAt(path, key), child)
		if !optional[key] && !schemaDropped(child) {
			required = append(required, key)
		}
	}

	out := map[string]any{"type": "object", "properties": props}
	if 0 < len(required) {
		out["required"] = required
	}

	if v.closed {
		out["additionalProperties"] = false
	} else if nil != v.spread {
		names := []string{}
		for _, k := range v.keys {
			if !v.isAliasKey(k) {
				names = append(names, k)
			}
		}
		schemaMapSpread(sc, schemaAt(path, "&"), out, v.spread, names)
	}

	return out
}

type schemaGuard struct {
	arms [][2]Val
	dflt Val
}

// schemaKeyGuard: a spread the import wrote as a test on the key,
// `match(key(0), ...)`, with its arms and its default.
func schemaKeyGuard(t Val) *schemaGuard {
	f, ok := t.(*FuncVal)
	if !ok || "match" != f.name || 0 == len(f.peg) || 0 != len(f.peg)%2 {
		return nil
	}
	k, ok := f.peg[0].(*FuncVal)
	if !ok || "key" != k.name {
		return nil
	}
	if 0 < len(k.peg) {
		if sv, ok := k.peg[0].(*ScalarVal); !ok || int64(0) != sv.peg {
			return nil
		}
	}
	g := &schemaGuard{dflt: f.peg[len(f.peg)-1]}
	for i := 1; i < len(f.peg)-1; i += 2 {
		g.arms = append(g.arms, [2]Val{f.peg[i], f.peg[i+1]})
	}
	return g
}

// schemaLonePattern: the one pattern a bare `re()` holds.
func schemaLonePattern(v Val) (string, bool) {
	c, ok := v.(*ConstraintVal)
	if !ok || 1 != len(c.res) || KindTop != c.kind || nil != c.lo || nil != c.hi ||
		0 < len(c.neqs) || nil != c.count || 0 < len(c.musts) {
		return "", false
	}
	return c.res[0].norm, true
}

func schemaIsString(v Val) (string, bool) {
	sv, ok := v.(*ScalarVal)
	if !ok || KindString != sv.kind {
		return "", false
	}
	s, ok := sv.peg.(string)
	return s, ok
}

// schemaMapSpread: the map guards of design section 6, one per pattern,
// one naming every declared key and every pattern, and one on the key
// itself. A spread with no guard is the schema every further key meets.
func schemaMapSpread(sc *schemaCtx, path []string, out map[string]any, spr Val,
	names []string) {
	terms := []Val{spr}
	if cj, ok := spr.(*ConjunctVal); ok {
		terms = cj.peg
	}
	guards := make([]*schemaGuard, len(terms))
	for i, t := range terms {
		guards[i] = schemaKeyGuard(t)
	}
	if allNilGuards(guards) {
		out["additionalProperties"] = schemaFromVal(sc, path, spr)
		return
	}
	patterns := map[string]any{}
	patternKeys := []string{}
	exempts := []*schemaGuard{}
	apart := []any{}
	lost := false
	for _, g := range guards {
		if nil == g {
			continue
		}
		if p, ok := schemaGuardPattern(g); ok {
			s := schemaFromVal(sc, path, g.arms[0][1])
			if _, has := patterns[p]; has {
				apart = append(apart, map[string]any{"patternProperties": map[string]any{p: s}})
			} else {
				patterns[p] = s
				patternKeys = append(patternKeys, p)
			}
		} else if c, ok := schemaGuardNames(g); ok {
			s := schemaFromVal(sc, path, c)
			if _, has := out["propertyNames"]; has {
				apart = append(apart, map[string]any{"propertyNames": s})
			} else {
				out["propertyNames"] = s
			}
		} else if schemaGuardExempts(g) {
			exempts = append(exempts, g)
		} else {
			lost = true
		}
	}
	if 0 < len(patterns) {
		out["patternProperties"] = patterns
	}

	// additionalProperties exempts the keys its own object names, so a
	// guard exempting any other keys stands in an object of its own.
	for _, g := range exempts {
		named, pats := []string{}, []string{}
		for _, arm := range g.arms {
			if s, ok := schemaIsString(arm[0]); ok {
				named = append(named, s)
			} else if p, ok := schemaLonePattern(arm[0]); ok {
				pats = append(pats, p)
			}
		}
		d := schemaFromVal(sc, path, g.dflt)
		if _, has := out["additionalProperties"]; !has &&
			schemaSameSet(named, names) && schemaSameSet(pats, patternKeys) {
			out["additionalProperties"] = d
			continue
		}
		own := map[string]any{}
		if 0 < len(named) {
			props := map[string]any{}
			for _, n := range named {
				props[n] = map[string]any{}
			}
			own["properties"] = props
		}
		if 0 < len(pats) {
			pp := map[string]any{}
			for _, q := range pats {
				pp[q] = map[string]any{}
			}
			own["patternProperties"] = pp
		}
		own["additionalProperties"] = d
		apart = append(apart, own)
	}

	// A template holds for every key, which additionalProperties says
	// only in an object whose patterns exempt none.
	plain := []any{}
	for i, t := range terms {
		if nil == guards[i] {
			plain = append(plain, schemaFromVal(sc, path, t))
		}
	}
	if 0 < len(plain) {
		var t any = map[string]any{"allOf": plain}
		if 1 == len(plain) {
			t = plain[0]
		}
		if _, has := out["additionalProperties"]; !has && 0 == len(patterns) {
			out["additionalProperties"] = t
		} else {
			apart = append(apart, map[string]any{"additionalProperties": t})
		}
	}
	if 0 < len(apart) {
		out["allOf"] = apart
	}
	if lost {
		sc.lose(path, "match",
			"this spread tests each key in a way no keyword says, so it is "+
				"DROPPED and the schema admits keys it refuses")
	}
}

func schemaGuardPattern(g *schemaGuard) (string, bool) {
	if 1 == len(g.arms) && isTop(g.dflt) {
		return schemaLonePattern(g.arms[0][0])
	}
	return "", false
}

func schemaGuardNames(g *schemaGuard) (Val, bool) {
	if 1 != len(g.arms) || !isTop(g.arms[0][1]) {
		return nil, false
	}
	cj, ok := g.arms[0][0].(*ConjunctVal)
	if !ok || 2 != len(cj.peg) {
		return nil, false
	}
	_, empty := cj.peg[0].(*EmptyVal)
	_, refuse := g.dflt.(*NilVal)
	return cj, empty && refuse
}

func schemaGuardExempts(g *schemaGuard) bool {
	for _, arm := range g.arms {
		_, named := schemaIsString(arm[0])
		_, pat := schemaLonePattern(arm[0])
		if !isTop(arm[1]) || !named && !pat {
			return false
		}
	}
	return true
}

func allNilGuards(gs []*schemaGuard) bool {
	for _, g := range gs {
		if nil != g {
			return false
		}
	}
	return true
}

func schemaSameSet(a, b []string) bool {
	x, y := schemaSetOf(a), schemaSetOf(b)
	return schemaText(x) == schemaText(y)
}

func schemaSetOf(a []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, e := range a {
		if !seen[e] {
			seen[e] = true
			out = append(out, e)
		}
	}
	sort.Strings(out)
	return out
}

// schemaFromList: a written list is open unless closed, and its spread
// already holds for every position, so positions are prefixItems and the
// spread is items.
func schemaFromList(sc *schemaCtx, path []string, v *ListVal) map[string]any {
	kept := []int{}
	for i, el := range v.peg {
		if !schemaSkipMarked(sc, schemaAt(path, itoa(i)), v, el) {
			kept = append(kept, i)
		}
	}

	out := map[string]any{"type": "array"}
	if 0 < len(kept) {
		prefix := make([]any, 0, len(kept))
		for _, i := range kept {
			prefix = append(prefix, schemaFromVal(sc, schemaAt(path, itoa(i)), v.peg[i]))
		}
		out["prefixItems"] = prefix
		need := len(kept)
		for 0 < need && schemaDropped(v.peg[kept[need-1]]) {
			need--
		}
		if 0 < need {
			out["minItems"] = int64(need)
		}
	}

	if v.closed {
		out["items"] = false
	} else if g := schemaIndexGuard(v.spread); nil != g && len(kept) == len(v.peg) {
		prefix, _ := out["prefixItems"].([]any)
		for i := len(kept); i < len(g.arms); i++ {
			prefix = append(prefix, schemaFromVal(sc, schemaAt(path, itoa(i)), g.arms[i][1]))
		}
		out["prefixItems"] = prefix
		if !isTop(g.dflt) {
			out["items"] = schemaFromVal(sc, schemaAt(path, "&"), g.dflt)
		}
	} else if nil != v.spread {
		out["items"] = schemaFromVal(sc, schemaAt(path, "&"), v.spread)
	}

	return out
}

// schemaIndexGuard: the list guard of design section 7, whose arms name
// the positions in order.
func schemaIndexGuard(spr Val) *schemaGuard {
	if nil == spr {
		return nil
	}
	g := schemaKeyGuard(spr)
	if nil == g {
		return nil
	}
	for i, arm := range g.arms {
		if s, ok := schemaIsString(arm[0]); !ok || itoa(i) != s {
			return nil
		}
	}
	return g
}

func schemaSkipMarked(sc *schemaCtx, path []string, bag, child Val) bool {
	// A mark the container carries too is read through (an export
	// anchored inside it); one of the child's own is not.
	if child.markedHide() && !bag.markedHide() {
		sc.lose(path, "hide",
			"a hidden entry is not generated, so it is omitted from the "+
				"schema; a consumer is neither asked for it nor allowed to "+
				"know about it")
		return true
	}
	if child.markedType() && !bag.markedType() {
		sc.lose(path, "type",
			"a type() entry is a definition and is not generated, so it is "+
				"omitted from the schema")
		return true
	}
	return false
}

// JSONSchemaOptions configures an export.
type JSONSchemaOptions struct {
	// At, when non-empty, names the subtree to export -- the same anchor
	// vet --at takes.
	At string
	// ExactNumbers judges the export against vet --exact-numbers, which
	// reads every number by its value, rather than against plain vet.
	ExactNumbers bool
}

// JSONSchema exports a document as a JSON Schema. `at`, when non-empty,
// names the subtree to export -- the same anchor vet --at takes.
func (a *Aontu) JSONSchema(src, at string) SchemaReport {
	return a.JSONSchemaWith(src, JSONSchemaOptions{At: at})
}

// JSONSchemaWith is JSONSchema with every option.
func (a *Aontu) JSONSchemaWith(src string, opts JSONSchemaOptions) SchemaReport {
	at := opts.At
	empty := map[string]any{}

	parsed, perr := a.parseEntry(src)
	if nil != perr {
		return SchemaReport{Verdict: "error", Schema: empty,
			Lossy: []SchemaLoss{},
			Errors: []VetFinding{
				parseFinding(a.File, VetRoleData, perr)}}
	}

	root, ctx, _ := a.unifyCtx(parsed, nil, src)
	if nil == root || root.Nil() || 0 < len(ctx.err) {
		return SchemaReport{Verdict: "error", Schema: empty,
			Lossy:  []SchemaLoss{},
			Errors: []VetFinding{failureFinding(ctx, a.File, src, root)}}
	}

	node := root
	anchor := []string{}
	if "" != at {
		node = anchorAt(root, at)
		if nil == node {
			// The anchor names nothing. Reported as a no_path nil through
			// the same finding shape every other refusal here uses.
			ctx.err = append(ctx.err,
				makeNilErrFull(ctx, "no_path", root, nil, "at", nil))
			return SchemaReport{Verdict: "error", Schema: empty,
				Lossy:  []SchemaLoss{},
				Errors: []VetFinding{failureFinding(ctx, a.File, src, root)}}
		}
		for _, part := range strings.Split(strings.TrimPrefix(at, "$"), ".") {
			if "" != part {
				anchor = append(anchor, part)
			}
		}
	}

	sc := &schemaCtx{lossy: []SchemaLoss{}, exact: opts.ExactNumbers,
		root: root, defs: map[string]any{}, names: map[string]string{}, anchor: anchor}
	body := schemaFromVal(sc, anchor, node)

	if nil != sc.failed {
		failed := sc.failed
		if c, ok := failed.(*ConstraintVal); ok {
			failed = makeNilErrFull(ctx, c.invalid, c, nil, "constrain", nil)
		}
		return SchemaReport{Verdict: "error", Schema: empty,
			Lossy:  []SchemaLoss{},
			Errors: []VetFinding{failureFinding(ctx, a.File, src, failed)}}
	}

	schema := map[string]any{"$schema": jsonSchemaDraft}
	if obj, ok := body.(map[string]any); ok {
		for k, val := range obj {
			schema[k] = val
		}
	} else {
		schema["not"] = map[string]any{}
	}
	if 0 < len(sc.defs) {
		schema["$defs"] = sc.defs
	}

	verdict := "ok"
	if 0 < len(sc.lossy) {
		verdict = "lossy"
	}
	return SchemaReport{Verdict: verdict, Schema: schema, Lossy: sc.lossy}
}
