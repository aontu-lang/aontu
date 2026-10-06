/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"math/big"
	"regexp"
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
}

// The numeric leaves, and the ones vet reads JSON data as: a spelling
// with a point is a float, one without is an integer, and nothing is
// read as an exact leaf.
type schemaLeaf string

const (
	leafInteger schemaLeaf = "integer"
	leafFloat   schemaLeaf = "float"
	leafExact   schemaLeaf = "exact"
)

var leavesBoth = []schemaLeaf{leafInteger, leafFloat}

var kindLeaves = map[Kind][]schemaLeaf{
	KindInteger:    {leafInteger},
	KindFloat:      {leafFloat},
	KindBigInteger: {},
	KindBigDecimal: {},
	KindNumber:     leavesBoth,
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

var literalLoss = map[schemaLeaf]string{
	leafInteger: "the schema admits the float spelling of this value, which vet " +
		"reads as a float and the integer leaf refuses",
	leafFloat: "the schema admits the integer spelling of this value, which vet " +
		"reads as an integer and the float leaf refuses",
	leafExact: "the schema admits this value in every JSON spelling, which vet " +
		"reads as an integer or a float, never as the exact leaf; the digits " +
		"are written exactly",
}

func leafOf(sv *ScalarVal) (schemaLeaf, bool) {
	switch sv.kind {
	case KindInteger:
		return leafInteger, true
	case KindFloat:
		return leafFloat, true
	case KindBigInteger, KindBigDecimal:
		return leafExact, true
	}
	return "", false
}

func leafReadings(sv *ScalarVal) []schemaLeaf {
	if scaledIsIntegral(scaledOfNumeric(sv)) {
		return leavesBoth
	}
	return []schemaLeaf{leafFloat}
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

// schemaLone is the first number with an admitted JSON spelling no
// member is written in: there the schema and the model disagree.
func schemaLone(gs []*schemaGroup, admitted []schemaLeaf) *ScalarVal {
	for _, g := range gs {
		if _, numeric := leafOf(g.v); !numeric {
			continue
		}
		for _, r := range leafReadings(g.v) {
			if leafIn(admitted, r) && !leafIn(g.leaves, r) {
				return g.v
			}
		}
	}
	return nil
}

func (sc *schemaCtx) loseLiterals(path []string, gs []*schemaGroup) {
	if v := schemaLone(gs, leavesBoth); nil != v {
		leaf, _ := leafOf(v)
		sc.lose(path, string(leaf)+" literal", literalLoss[leaf])
	}
}

func (sc *schemaCtx) loseKind(path []string, k Kind) {
	if reason, ok := kindLoss[k]; ok {
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
		return leavesBoth, true
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
func uniqueExact(bag Val) bool {
	l, ok := bag.(*ListVal)
	if !ok {
		return false
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
			if !leafIn(leaves, x) {
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
			admitted = leavesBoth
		}
		if nil != schemaLone(gs, admitted) {
			sc.lose(path, "neq",
				"the schema refuses every JSON spelling of an excluded number, and "+
					"neq excludes only the leaves it names, so the model admits a "+
					"spelling the schema refuses")
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
		if !uniqueExact(bag) {
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

	return out
}

// schemaAtLeastOne reports whether an exported length bound is already
// at least 1.
func schemaAtLeastOne(v any) bool {
	n, ok := v.(int64)
	return ok && 1 <= n
}

var schemaDeprecationText = []string{"msg", "use", "since"}

func schemaFromVal(sc *schemaCtx, path []string, v Val) any {
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

	sc.lose(path, schemaResidueName(v),
		"this is not a value yet, so there is nothing to constrain a "+
			"consumer to; the schema admits anything here")
	return map[string]any{}
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
func schemaGenerated(v Val) (any, bool) {
	ctx := &Ctx{root: v, collect: true}
	out, err := v.Gen(ctx)
	if nil != err || 0 < len(ctx.err) {
		return nil, false
	}
	return out, true
}

func schemaBareType(s any) (string, bool) {
	obj, ok := s.(map[string]any)
	if !ok || 1 != len(obj) {
		return "", false
	}
	t, ok := obj["type"].(string)
	return t, ok
}

func schemaFromDisjunct(sc *schemaCtx, path []string,
	v *DisjunctVal) map[string]any {
	var def any
	haveDef := false

	bare := make([]Val, 0, len(v.peg))
	for _, m := range v.peg {
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
		types := []string{}
		bareTypes := true
		for _, m := range bare {
			arm := schemaFromVal(sc, path, m)
			arms = append(arms, arm)
			if t, ok := schemaBareType(arm); ok {
				if !containsStr(types, t) {
					types = append(types, t)
				}
			} else {
				bareTypes = false
			}
		}
		switch {
		case !bareTypes:
			out["anyOf"] = arms
		case 1 == len(types):
			out["type"] = types[0]
		default:
			all := make([]any, 0, len(types))
			for _, t := range types {
				all = append(all, t)
			}
			out["type"] = all
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
		if !optional[key] {
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
		out["additionalProperties"] = schemaFromVal(sc, schemaAt(path, "&"), v.spread)
	}

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
		out["minItems"] = int64(len(kept))
	}

	if v.closed {
		out["items"] = false
	} else if nil != v.spread {
		out["items"] = schemaFromVal(sc, schemaAt(path, "&"), v.spread)
	}

	return out
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

// JSONSchema exports a document as a JSON Schema. `at`, when non-empty,
// names the subtree to export -- the same anchor vet --at takes.
func (a *Aontu) JSONSchema(src, at string) SchemaReport {
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

	sc := &schemaCtx{lossy: []SchemaLoss{}}
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

	verdict := "ok"
	if 0 < len(sc.lossy) {
		verdict = "lossy"
	}
	return SchemaReport{Verdict: verdict, Schema: schema, Lossy: sc.lossy}
}
