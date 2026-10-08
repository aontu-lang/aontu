/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"encoding/json"
	"math"
	"math/big"
	"sort"
	"strconv"
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

// scalarSchemaJSON is the JSON value of a concrete scalar. An exact
// leaf's digits are written directly rather than through a float64:
// JSON Schema compares numbers by their value.
func scalarSchemaJSON(sv *ScalarVal) any {
	switch sv.kind {
	case KindBigInteger:
		return json.Number(bigIntDigits(sv.peg.(*big.Int)))
	case KindBigDecimal:
		return json.Number(sv.peg.(*Decimal).digits())
	}
	return sv.peg
}

// schemaValueKey is one JSON value by its meaning: 1 and 1.0 are one number.
func schemaValueKey(v any) string {
	raw, _ := json.Marshal(v)
	if n, ok := readExactNumber(string(raw)); ok {
		if text, ok := exactNumberText(n); ok {
			return text
		}
	}
	return string(raw)
}

// schemaDedupeJSON carries one value once, however its members are spelt.
func schemaDedupeJSON(vals []any) []any {
	seen := map[string]bool{}
	out := []any{}
	for _, v := range vals {
		key := schemaValueKey(v)
		if !seen[key] {
			seen[key] = true
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

// schemaLoseLeafKind: a kind narrowed to one leaf of a number has no
// JSON Schema type, since JSON Schema reads a number by its value.
func schemaLoseLeafKind(sc *schemaCtx, path []string, k Kind) {
	switch k {
	case KindBigInteger, KindBigDecimal:
		schemaLoseExactKind(sc, path, k.String(), kindType[k])
	case KindInteger:
		sc.lose(path, "integer",
			"JSON Schema reads a number by its value, so its integer also admits "+
				"1.0 and whole numbers past the integer leaf, which this kind refuses; "+
				"number & multiple(1) is the integer it means")
	case KindFloat:
		sc.lose(path, "float",
			"JSON Schema has no float: its number also admits the integer leaf, "+
				"which this kind refuses")
	}
}

func schemaLoseExactKind(sc *schemaCtx, path []string, leaf, t string) {
	sc.lose(path, leaf,
		"JSON Schema has no type for one leaf of a number: the schema says \""+t+
			"\", which admits the other leaves too, where this kind refuses them")
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
	schemaLoseLeafKind(sc, path, sv.kind)
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
	out[key] = scalarSchemaJSON(b.v)
}

// schemaNumber is a count's bound as a plain number.
func schemaNumber(sv *ScalarVal) float64 {
	switch p := sv.peg.(type) {
	case int64:
		return float64(p)
	case *big.Int:
		f, _ := new(big.Float).SetInt(p).Float64()
		return f
	case *Decimal:
		f, _ := strconv.ParseFloat(p.digits(), 64)
		return f
	}
	return sv.peg.(float64)
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
	nots := []any{}

	if t, ok := kindType[c.kind]; ok {
		out["type"] = t
		schemaLoseLeafKind(sc, path, c.kind)
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

	// A number with no leaf that is a multiple of 1 is JSON Schema's integer.
	mults := c.mults
	if KindTop == c.kind && "number" == out["type"] {
		kept := []*ScalarVal{}
		for _, m := range mults {
			if 0 != cmpScaled(scaledOfShown(m), scaled{unscaled: big.NewInt(1)}) {
				kept = append(kept, m)
			}
		}
		if len(kept) < len(mults) {
			out["type"] = "integer"
			mults = kept
		}
	}
	divisors := []any{}
	for _, m := range mults {
		divisors = append(divisors, scalarSchemaJSON(m))
	}
	if 1 == len(divisors) {
		out["multipleOf"] = divisors[0]
	} else {
		for _, n := range divisors {
			extra = append(extra, map[string]any{"multipleOf": n})
		}
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
		if 0 < len(c.count.mults) {
			sc.lose(path, "len",
				"JSON Schema has no keyword for a divisor of a count, so it is "+
					"DROPPED and the schema admits lengths the model refuses")
		}
	}

	for _, n := range c.nofs {
		branches := func() []any {
			out := make([]any, len(n.cs))
			for i, b := range n.cs {
				out[i] = false
				if !b.Nil() {
					out[i] = schemaFromVal(sc, path, b)
				}
			}
			return out
		}
		counts := nofCounts(n)
		only := func(at ...int) bool {
			for i, ok := range counts {
				in := false
				for _, a := range at {
					in = in || a == i
				}
				if ok != in {
					return false
				}
			}
			return true
		}
		k := len(n.cs)
		all := make([]int, k+1)
		for i := range all {
			all[i] = i
		}
		switch {
		case only(all...):
		case only(all[1:]...):
			extra = schemaKeyword(out, extra, "anyOf", branches())
		case only(1):
			extra = schemaKeyword(out, extra, "oneOf", branches())
		case only(0):
			if 1 == k {
				nots = append(nots, branches()[0])
			} else {
				nots = append(nots, map[string]any{"anyOf": branches()})
			}
		case only(k):
			extra = append(extra, branches()...)
		case only():
			extra = append(extra, false)
		default:
			sc.lose(path, "nof",
				"JSON Schema counts its branches only as anyOf, oneOf, allOf and not, "+
					"so this count is DROPPED and the schema admits values the model refuses")
		}
	}

	for _, w := range c.whens {
		extra = schemaWhen(sc, path, out, extra, w)
	}

	for _, k := range c.contains {
		extra = schemaContains(sc, path, out, extra, k, bag)
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

// schemaKeyword sets a keyword a schema object has once; a second goes
// under allOf.
// schemaContains writes a member count as contains, with its endpoints
// as minContains and maxContains; JSON Schema counts an array's items
// only.
func schemaContains(sc *schemaCtx, path []string, out map[string]any, extra []any,
	k constraintContains, bag string) []any {
	if "map" == bag {
		sc.lose(path, "contains",
			"JSON Schema counts only the items of an array, so a count of a "+
				"map's members is DROPPED and the schema admits maps the model refuses")
		return extra
	}
	if "" == bag {
		sc.lose(path, "contains",
			"JSON Schema applies contains to an array only and passes any other "+
				"value, where the model refuses a scalar and counts a map's members")
	}
	if 0 < len(k.count.neqs)+len(k.count.mults) {
		sc.lose(path, "contains",
			"JSON Schema bounds a count of matching items only above and below, "+
				"so an excluded count or a divisor is DROPPED")
	}
	part := map[string]any{"contains": false}
	if !k.c.Nil() {
		part["contains"] = schemaFromVal(sc, path, k.c)
	}
	if lo, _ := schemaCountEndpoint(k.count.lo, true); 1 != lo {
		part["minContains"] = lo
	}
	if hi, ok := schemaCountEndpoint(k.count.hi, false); ok {
		part["maxContains"] = hi
	}
	if _, has := out["contains"]; has {
		return append(extra, part)
	}
	for key, v := range part {
		out[key] = v
	}
	return extra
}

// schemaWhen writes a conditional on one key's presence as a dependent
// keyword, and one whose branch only asks for keys as dependentRequired.
func schemaWhen(sc *schemaCtx, path []string, out map[string]any, extra []any,
	w constraintWhen) []any {
	arm := func(b Val) any {
		if b.Nil() {
			return false
		}
		return schemaFromVal(sc, path, b)
	}
	if key := presentKeys(w.c); 1 == len(key) && nil == w.e {
		dep, val := "dependentSchemas", any(nil)
		if names := presentKeys(w.t); nil != names {
			dep, val = "dependentRequired", names
		} else {
			val = arm(w.t)
		}
		held, _ := out[dep].(map[string]any)
		if _, has := held[key[0]]; has {
			return append(extra, map[string]any{dep: map[string]any{key[0]: val}})
		}
		if nil == held {
			held = map[string]any{}
			out[dep] = held
		}
		held[key[0]] = val
		return extra
	}
	if isTop(w.t) && nil == w.e {
		return extra
	}
	cond := map[string]any{"if": arm(w.c)}
	if !isTop(w.t) {
		cond["then"] = arm(w.t)
	}
	if nil != w.e {
		cond["else"] = arm(w.e)
	}
	if _, has := out["if"]; has {
		return append(extra, cond)
	}
	for k, v := range cond {
		out[k] = v
	}
	return extra
}

// presentKeys is the keys of a map that holds each of them as `any`, and
// nothing else.
func presentKeys(v Val) []string {
	m, ok := v.(*MapVal)
	if !ok || nil != m.spread || m.closed || 0 == len(m.keys) {
		return nil
	}
	keys := append([]string{}, m.keys...)
	sort.Strings(keys)
	for _, k := range keys {
		if !isTop(m.peg[k]) || m.isOptional(k) {
			return nil
		}
	}
	return keys
}

func schemaKeyword(out map[string]any, extra []any, key string, val any) []any {
	if _, has := out[key]; !has {
		out[key] = val
		return extra
	}
	return append(extra, map[string]any{key: val})
}

var schemaDeprecationText = []string{"msg", "use", "since"}

// schemaFromVal is a schema object, or false where a value admits nothing.
func schemaFromVal(sc *schemaCtx, path []string, v Val) any {
	out := schemaFromValInner(sc, path, v)
	if obj, ok := out.(map[string]any); ok && nil != v &&
		(nil != v.deprecRec() || nil != v.metaRec()) {
		schemaAnnotate(sc, path, obj, v)
	}
	return out
}

var schemaMetaKeyword = map[string]string{
	"title": "title", "description": "description", "comment": "$comment", "default": "default",
	"examples": "examples", "readOnly": "readOnly", "writeOnly": "writeOnly", "format": "format",
	"contentEncoding": "contentEncoding", "contentMediaType": "contentMediaType",
	"contentSchema": "contentSchema",
}

// schemaKeywords are the JSON Schema keywords: one held under `x` would
// assert where the record only annotates, so it is not written.
var schemaKeywords = map[string]bool{}

func init() {
	for _, k := range []string{
		"$schema", "$id", "$ref", "$anchor", "$dynamicRef", "$dynamicAnchor", "$vocabulary",
		"$comment", "$defs", "allOf", "anyOf", "oneOf", "not", "if", "then", "else",
		"dependentSchemas", "prefixItems", "items", "contains", "properties",
		"patternProperties", "additionalProperties", "propertyNames", "unevaluatedItems",
		"unevaluatedProperties", "type", "enum", "const", "multipleOf", "maximum",
		"exclusiveMaximum", "minimum", "exclusiveMinimum", "maxLength", "minLength",
		"pattern", "maxItems", "minItems", "uniqueItems", "maxContains", "minContains",
		"maxProperties", "minProperties", "required", "dependentRequired", "title",
		"description", "default", "deprecated", "readOnly", "writeOnly", "examples",
		"format", "contentEncoding", "contentMediaType", "contentSchema",
	} {
		schemaKeywords[k] = true
	}
}

// schemaAnnotate writes a value's riders as annotations: the first record
// inline and any other in an allOf of annotation-only subschemas, and a
// deprecation record as `deprecated`, its fields under x-aontu-deprecate.
func schemaAnnotate(sc *schemaCtx, path []string, obj map[string]any, v Val) {
	if dep := v.deprecRec(); nil != dep {
		obj["deprecated"] = true
		rec := map[string]any{}
		for _, k := range schemaDeprecationText {
			vs, ok := dep[k]
			if !ok {
				continue
			}
			if 1 == len(vs) {
				rec[k] = vs[0]
				continue
			}
			list := make([]any, len(vs))
			for i := range vs {
				list[i] = vs[i]
			}
			rec[k] = list
		}
		if 0 < len(rec) {
			obj["x-aontu-deprecate"] = rec
		}
	}
	extra := []any{}
	for _, layer := range riderLayers(v.metaRec()) {
		part := map[string]any{}
		keys := make([]string, 0, len(layer))
		for k := range layer {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			json, _ := schemaGenerated(layer[k])
			if "x" != k {
				part[schemaMetaKeyword[k]] = json
				continue
			}
			xm, _ := json.(map[string]any)
			xkeys := make([]string, 0, len(xm))
			for xk := range xm {
				xkeys = append(xkeys, xk)
			}
			sort.Strings(xkeys)
			for _, xk := range xkeys {
				if schemaKeywords[xk] {
					sc.lose(path, "meta",
						"the unknown keyword "+xk+" is a JSON Schema keyword, which "+
							"would assert where the record only annotates, so it is DROPPED")
				} else {
					part[xk] = xm[xk]
				}
			}
		}
		free := true
		for k := range part {
			if _, has := obj[k]; has {
				free = false
			}
		}
		if 0 == len(extra) && free {
			for k, pv := range part {
				obj[k] = pv
			}
		} else if 0 < len(part) {
			extra = append(extra, part)
		}
	}
	if 0 < len(extra) {
		all, _ := obj["allOf"].([]any)
		obj["allOf"] = append(append([]any{}, all...), extra...)
	}
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
			inner["default"] = scalarSchemaJSON(sv)
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
		schemaLoseLeafKind(sc, path, t.kind)
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
		return map[string]any{"type": scalarSchemaType(t), "const": scalarSchemaJSON(t)}

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
		consts := make([]any, 0, len(bare))
		for _, m := range bare {
			consts = append(consts, scalarSchemaJSON(m.(*ScalarVal)))
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
