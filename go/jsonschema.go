/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"encoding/json"
	"math"
	"math/big"
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

// schemaCtx is the exporter's running state.
type schemaCtx struct {
	lossy []SchemaLoss
}

func (sc *schemaCtx) lose(path []string, construct, reason string) {
	sc.lossy = append(sc.lossy,
		SchemaLoss{Path: schemaPathText(path), Construct: construct,
			Reason: reason})
}

func schemaPathText(path []string) string {
	if 0 == len(path) {
		return "$"
	}
	return "$." + strings.Join(path, ".")
}

var kindType = map[Kind]string{
	KindString:     "string",
	KindBoolean:    "boolean",
	KindInteger:    "integer",
	KindBigInteger: "integer",
	KindFloat:      "number",
	KindBigDecimal: "number",
	KindNumber:     "number",
	// A path value is its address string at the JSON boundary
	// (docs/design/PATHS.0.md), so the projection says string -- the
	// same lossy-projection rule the exact numeric leaves follow.
	KindPath: "string",
}

var schemaCountKeys = map[string][2]string{
	"string": {"minLength", "maxLength"},
	"map":    {"minProperties", "maxProperties"},
	"list":   {"minItems", "maxItems"},
}

// schemaEndpoint: the nearest float64, whether it is exact, and whether one is finite.
func schemaEndpoint(sv *ScalarVal) (f float64, exact bool, finite bool) {
	switch sv.kind {
	case KindBigInteger:
		f, acc := new(big.Float).SetInt(sv.peg.(*big.Int)).Float64()
		return f, big.Exact == acc, !math.IsInf(f, 0)
	case KindBigDecimal:
		d := sv.peg.(*Decimal)
		f, exact := new(big.Rat).SetFrac(d.coeff, pow10(int64(d.scale))).Float64()
		return f, exact, !math.IsInf(f, 0)
	}
	return 0, true, true
}

// scalarSchemaJSON is the JSON value of a concrete scalar, for const,
// enum and default.
func scalarSchemaJSON(sv *ScalarVal) any {
	switch sv.kind {
	case KindBigInteger, KindBigDecimal:
		f, _, _ := schemaEndpoint(sv)
		return f
	}
	return sv.peg
}

func schemaConstJSON(sc *schemaCtx, path []string, sv *ScalarVal) (any, bool) {
	if KindBigInteger == sv.kind || KindBigDecimal == sv.kind {
		if _, _, finite := schemaEndpoint(sv); !finite {
			sc.lose(path, "exact literal",
				"this exact value lies beyond binary64, and JSON has no number "+
					"for it, so the schema cannot carry it")
			return nil, false
		}
		sc.lose(path, "exact literal",
			"JSON has one number type and it is binary64, so this exact "+
				"value is emitted as the nearest JSON number")
	}
	return scalarSchemaJSON(sv), true
}

// schemaDedupeJSON: 1 and 1.0 are one JSON number, so an enum carries it once.
func schemaDedupeJSON(vals []any) []any {
	seen := map[string]bool{}
	out := []any{}
	for _, v := range vals {
		key, _ := json.Marshal(v)
		if !seen[string(key)] {
			seen[string(key)] = true
			out = append(out, v)
		}
	}
	return out
}

// schemaLosePath: a path is its address string at the JSON boundary,
// and the schema cannot say which strings are addresses.
func schemaLosePath(sc *schemaCtx, path []string) {
	sc.lose(path, "path",
		"a path admits only path values, but JSON Schema has no path type; "+
			"the schema says \"string\" and admits any string here")
}

func schemaLoseExactKind(sc *schemaCtx, path []string, leaf, t string) {
	sc.lose(path, leaf,
		"JSON has one number type and it is binary64, so the EXACTNESS "+
			"this leaf exists for cannot be carried; the schema says "+
			"\""+t+"\" and a consumer may round")
}

// schemaAtLeastOne reports whether an exported length bound is already
// at least 1.
func schemaAtLeastOne(v any) bool {
	n, ok := v.(int64)
	return ok && 1 <= n
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

// schemaKindOfLiteral is what a bare `*x` admits beside x.
func schemaKindOfLiteral(sc *schemaCtx, path []string, sv *ScalarVal) map[string]any {
	t := scalarSchemaType(sv)
	if KindBigInteger == sv.kind {
		schemaLoseExactKind(sc, path, "biginteger", t)
	}
	if KindBigDecimal == sv.kind {
		schemaLoseExactKind(sc, path, "bigdecimal", t)
	}
	if "string" == t {
		return map[string]any{"type": t, "minLength": 1}
	}
	return map[string]any{"type": t}
}

// schemaBoundOut reports what JSON cannot say about a bound, never approximates it.
func schemaBoundOut(sc *schemaCtx, path []string, out map[string]any,
	b *constraintBound, isLo bool) {
	atom, key := "min", "minimum"
	if isLo && b.open {
		atom, key = "above", "exclusiveMinimum"
	} else if !isLo && b.open {
		atom, key = "below", "exclusiveMaximum"
	} else if !isLo {
		atom, key = "max", "maximum"
	}
	switch b.v.kind {
	case KindInteger, KindFloat, KindBigInteger, KindBigDecimal:
	default:
		sc.lose(path, atom,
			"JSON Schema has no keyword for a bound on a string (minimum and "+
				"maximum take numbers only), so this bound is DROPPED and the "+
				"schema admits strings outside it")
		return
	}
	_, exact, finite := schemaEndpoint(b.v)
	if !finite {
		sc.lose(path, atom,
			"this exact endpoint lies beyond binary64, and JSON has no number "+
				"for it, so the bound is OMITTED and the schema admits values the "+
				"model refuses")
		return
	}
	if !exact {
		sc.lose(path, atom,
			"JSON has one number type and it is binary64, which cannot hold "+
				"this exact endpoint; the schema carries the nearest number, so "+
				"the boundary it draws is not the model's")
	}
	out[key] = scalarSchemaJSON(b.v)
}

func schemaNumber(sv *ScalarVal) float64 {
	switch n := scalarSchemaJSON(sv).(type) {
	case int64:
		return float64(n)
	case float64:
		return n
	}
	return 0 //coverage:ignore a count is always numeric
}

// schemaCountEndpoint: the whole number a count keyword takes; above(2) is at least 3.
func schemaCountEndpoint(b *constraintBound, isLo bool) (int64, bool) {
	if nil == b {
		return 0, false
	}
	n := schemaNumber(b.v)
	switch {
	case isLo && b.open:
		return int64(math.Floor(n)) + 1, true
	case isLo:
		return int64(math.Ceil(n)), true
	case b.open:
		return int64(math.Ceil(n)) - 1, true
	}
	return int64(math.Floor(n)), true
}

// schemaFromConstraint maps the residual's atoms onto keywords; `bag`
// names what a count counted ("map", "list" or "").
func schemaFromConstraint(sc *schemaCtx, path []string,
	c *ConstraintVal, bag string) map[string]any {
	out := map[string]any{}
	// allOf members: a second pattern or exclusion has no keyword of its own.
	extra := []any{}
	nots := []map[string]any{}

	if t, ok := kindType[c.kind]; ok {
		out["type"] = t
	} else if "string" == c.domain {
		out["type"] = "string"
	} else if "number" == c.domain {
		out["type"] = "number"
	}

	if nil != c.lo {
		schemaBoundOut(sc, path, out, c.lo, true)
	}
	if nil != c.hi {
		schemaBoundOut(sc, path, out, c.hi, false)
	}

	// neq(1,2) is "not one of these", which is exactly not: {enum}.
	if 0 < len(c.neqs) {
		vals := make([]any, 0, len(c.neqs))
		for _, n := range c.neqs {
			vals = append(vals, scalarSchemaJSON(n))
		}
		nots = append(nots, map[string]any{"enum": schemaDedupeJSON(vals)})
	}

	if 1 == len(c.res) {
		out["pattern"] = c.res[0].norm
	} else if 1 < len(c.res) {
		for _, r := range c.res {
			extra = append(extra, map[string]any{"pattern": r.norm})
		}
	}

	if nil != c.count {
		domain := bag
		if "string" == c.domain || "string" == out["type"] {
			domain = "string"
		}
		keys := schemaCountKeys["list"]
		if "" != domain {
			keys = schemaCountKeys[domain]
		}
		// A whole-number count's zero lower bound says nothing.
		if lo, ok := schemaCountEndpoint(c.count.lo, true); ok && 0 < lo {
			out[keys[0]] = lo
		}
		if hi, ok := schemaCountEndpoint(c.count.hi, false); ok {
			out[keys[1]] = hi
		}
		// An excluded length is exactly not both bounds at it.
		for _, n := range c.count.neqs {
			k := schemaNumber(n)
			if k == math.Trunc(k) {
				nots = append(nots, map[string]any{keys[0]: int64(k), keys[1]: int64(k)})
			}
		}
		if "" == domain {
			sc.lose(path, "len",
				"a count with no domain is exported as minItems/maxItems; "+
					"JSON Schema has no keyword that counts a string OR a container")
		}
	}

	if 1 == len(nots) {
		out["not"] = nots[0]
	} else if 1 < len(nots) {
		for _, n := range nots {
			extra = append(extra, map[string]any{"not": n})
		}
	}
	if 0 < len(extra) {
		out["allOf"] = extra
	}

	if c.nonEmpty && !c.emptyOk && !schemaAtLeastOne(out["minLength"]) {
		out["minLength"] = 1
	}
	if c.pathKind {
		schemaLosePath(sc, path)
	}

	if c.uniq {
		out["uniqueItems"] = true
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

var schemaDeprecationText = []string{"msg", "use", "since"}

// schemaFromVal is a schema object, or false where a value admits nothing.
func schemaFromVal(sc *schemaCtx, path []string, v Val) any {
	out := schemaFromValInner(sc, path, v)

	if nil != v {
		if rec := v.deprecRec(); nil != rec {
			if obj, ok := out.(map[string]any); ok {
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
		}
	}

	return out
}

func schemaFromValInner(sc *schemaCtx, path []string, v Val) any {
	if nil == v { //coverage:ignore a bag never holds a nil child
		// Defensive. Every caller walks a bag's own children, and a bag
		// holds Vals; the guard is here so a degenerate parse cannot
		// panic a verb whose whole job is to describe a document.
		return map[string]any{}
	}

	switch t := v.(type) {
	case *PrefVal:
		// A bare `*x` admits every value of x's kind and prefers x (ADR-004),
		// so const: x would refuse what the model admits.
		if sv, ok := t.peg.(*ScalarVal); ok {
			inner := schemaKindOfLiteral(sc, path, sv)
			if d, ok := schemaConstJSON(sc, path, sv); ok {
				inner["default"] = d
			}
			return inner
		}
		inner := schemaFromVal(sc, path, t.peg)
		if gen, ok := schemaGenerated(t.peg); ok {
			if obj, ok := inner.(map[string]any); ok {
				obj["default"] = gen
			}
		}
		return inner

	case *DisjunctVal:
		return schemaFromDisjunct(sc, path, t)

	case *ConstraintVal:
		// Arguments the constructor refused (neq(1, "a") spans domains)
		// leave a constraint that refuses every peer: it admits nothing.
		if "" != t.invalid {
			return false
		}
		return schemaFromConstraint(sc, path, t, "")

	case *ConjunctVal:
		if con, bag, ok := sizingResidue(t); ok {
			out := schemaFromVal(sc, path, bag).(map[string]any)
			counted := "list"
			if _, isMap := bag.(*MapVal); isMap {
				counted = "map"
			}
			for k, val := range schemaFromConstraint(sc, path, con, counted) {
				out[k] = val
			}
			return out
		}

	case *ExpectVal:
		// The member a second map literal expects reads through to its constraint.
		return schemaFromVal(sc, path, t.peg)

	case *MapVal:
		return schemaFromMap(sc, path, t)

	case *ListVal:
		return schemaFromList(sc, path, t)

	case *MapKindVal:
		return map[string]any{"type": "object"}

	case *ListKindVal:
		return map[string]any{"type": "array"}

	case *ScalarKindVal:
		if KindBigInteger == t.kind || KindBigDecimal == t.kind {
			schemaLoseExactKind(sc, path, t.kind.String(), kindType[t.kind])
		}
		if KindPath == t.kind {
			schemaLosePath(sc, path)
		}
		if jt, ok := kindType[t.kind]; ok {
			// `string` refuses "", and `string & empty()` does not.
			if KindString == t.kind && !t.emptyOk {
				return map[string]any{"type": jt, "minLength": 1}
			}
			return map[string]any{"type": jt}
		}
		// Defensive: kindType covers every kind a ScalarKindVal can
		// carry. An empty schema admits anything, which is the safe
		// direction if a kind is ever added and this table is not.
		return map[string]any{} //coverage:ignore every scalar kind has a JSON type

	case *ScalarVal:
		if KindNull == t.kind {
			return map[string]any{"type": "null"}
		}
		out := map[string]any{"type": scalarSchemaType(t)}
		if c, ok := schemaConstJSON(sc, path, t); ok {
			out["const"] = c
		}
		return out

	case *NilVal:
		// A written nil is bottom and admits nothing; a minted one is a refusal nobody collected.
		if "literal_nil" == t.why {
			return false
		}
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

func schemaResidueName(v Val) string {
	switch t := v.(type) {
	case *NilVal:
		return "nil"
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

// schemaTypeFold: bare kinds fold to a type array; anything more keeps the anyOf.
func schemaTypeFold(members []any) map[string]any {
	types := make([]any, 0, len(members))
	for _, m := range members {
		obj, isObj := m.(map[string]any)
		t, isType := obj["type"].(string)
		if !isObj || 1 != len(obj) || !isType {
			return map[string]any{"anyOf": members}
		}
		types = append(types, t)
	}
	return map[string]any{"type": types}
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

	allConst := true
	for _, m := range bare {
		if sv, ok := m.(*ScalarVal); !ok || KindNil == sv.kind {
			allConst = false
			break
		}
	}

	var out map[string]any
	if allConst {
		// A member no finite double holds is reported and left out.
		consts := make([]any, 0, len(bare))
		for _, m := range bare {
			if c, ok := schemaConstJSON(sc, path, m.(*ScalarVal)); ok {
				consts = append(consts, c)
			}
		}
		out = map[string]any{"enum": schemaDedupeJSON(consts)}
	} else {
		members := make([]any, 0, len(bare))
		for _, m := range bare {
			members = append(members, schemaFromVal(sc, path, m))
		}
		out = schemaTypeFold(members)
	}
	if haveDef {
		out["default"] = def
	}
	return out
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

		// A hidden child does not generate, so it is not part of the
		// value a consumer produces -- and a schema that demanded it
		// would refuse every correct document.
		if schemaSkipMarked(sc, append(append([]string{}, path...), key), v, child) {
			continue
		}

		props[key] = schemaFromVal(sc,
			append(append([]string{}, path...), key), child)
		if !optional[key] {
			required = append(required, key)
		}
	}

	out := map[string]any{"type": "object", "properties": props}
	if 0 < len(required) {
		out["required"] = required
	}

	var spread any
	if nil != v.spread {
		spread = schemaFromVal(sc,
			append(append([]string{}, path...), "&"), v.spread)
	}

	if v.closed {
		out["additionalProperties"] = false
	} else if nil != spread {
		out["additionalProperties"] = spread
	}

	return out
}

func schemaFromList(sc *schemaCtx, path []string, v *ListVal) map[string]any {
	idx := []int{}
	for i, el := range v.peg {
		if !schemaSkipMarked(sc, append(append([]string{}, path...), itoa(i)), v, el) {
			idx = append(idx, i)
		}
	}

	out := map[string]any{"type": "array"}
	if 0 < len(idx) {
		prefix := make([]any, 0, len(idx))
		for _, i := range idx {
			prefix = append(prefix, schemaFromVal(sc,
				append(append([]string{}, path...), itoa(i)), v.peg[i]))
		}
		out["prefixItems"] = prefix
		out["minItems"] = len(idx)
	}

	// An open list admits anything after its positions, as the meet does.
	if nil != v.spread {
		out["items"] = schemaFromVal(sc,
			append(append([]string{}, path...), "&"), v.spread)
	} else if v.closed {
		out["items"] = false
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

	schema := map[string]any{"$schema": jsonSchemaDraft}
	if obj, ok := body.(map[string]any); ok {
		for k, val := range obj {
			schema[k] = val
		}
	} else {
		// A root admitting nothing cannot carry $schema as false; not: {} can.
		schema["not"] = map[string]any{}
	}

	verdict := "ok"
	if 0 < len(sc.lossy) {
		verdict = "lossy"
	}
	return SchemaReport{Verdict: verdict, Schema: schema, Lossy: sc.lossy}
}
