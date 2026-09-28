/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
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

// scalarSchemaJSON is the JSON value of a concrete scalar, for const,
// enum and default.
func scalarSchemaJSON(sv *ScalarVal) any {
	switch sv.kind {
	case KindBigInteger:
		f, _ := new(big.Float).SetInt(sv.peg.(*big.Int)).Float64()
		return f
	case KindBigDecimal:
		f, _, _ := big.ParseFloat(sv.peg.(*Decimal).digits(), 10, 53,
			big.ToNearestEven)
		out, _ := f.Float64()
		return out
	}
	return sv.peg
}

// schemaLosePath: a path is its address string at the JSON boundary,
// and the schema cannot say which strings are addresses.
func schemaLosePath(sc *schemaCtx, path []string) {
	sc.lose(path, "path",
		"a path admits only path values, but JSON Schema has no path type; "+
			"the schema says \"string\" and admits any string here")
}

// schemaAtLeastOne reports whether an exported length bound is already
// at least 1.
func schemaAtLeastOne(v any) bool {
	switch n := v.(type) {
	case int64:
		return 1 <= n
	case float64:
		return 1 <= n
	}
	return false
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

// schemaFromConstraint maps the residual's atoms onto JSON Schema's
// keywords. The three that map exactly (bounds, pattern, count) go
// across; the two that cannot (must, unique(k)) are reported.
func schemaFromConstraint(sc *schemaCtx, path []string,
	c *ConstraintVal) map[string]any {
	out := map[string]any{}

	if t, ok := kindType[c.kind]; ok {
		out["type"] = t
	} else if "string" == c.domain {
		out["type"] = "string"
	} else if "number" == c.domain {
		out["type"] = "number"
	}

	if nil != c.lo {
		key := "minimum"
		if c.lo.open {
			key = "exclusiveMinimum"
		}
		out[key] = scalarSchemaJSON(c.lo.v)
	}
	if nil != c.hi {
		key := "maximum"
		if c.hi.open {
			key = "exclusiveMaximum"
		}
		out[key] = scalarSchemaJSON(c.hi.v)
	}

	// neq(1,2) is "not one of these", which is exactly not: {enum}.
	if 0 < len(c.neqs) {
		vals := make([]any, 0, len(c.neqs))
		for _, n := range c.neqs {
			vals = append(vals, scalarSchemaJSON(n))
		}
		out["not"] = map[string]any{"enum": vals}
	}

	if 1 == len(c.res) {
		out["pattern"] = c.res[0].src
	} else if 1 < len(c.res) {
		all := make([]any, 0, len(c.res))
		for _, r := range c.res {
			all = append(all, map[string]any{"pattern": r.src})
		}
		out["allOf"] = all
	}

	// A COUNT is a length or a size depending on what is counted, and
	// the residual does not always know which.
	if nil != c.count {
		str := "string" == c.domain || "string" == out["type"]
		lokey, hikey := "minItems", "maxItems"
		if str {
			lokey, hikey = "minLength", "maxLength"
		}
		if nil != c.count.lo {
			out[lokey] = scalarSchemaJSON(c.count.lo.v)
		}
		if nil != c.count.hi {
			out[hikey] = scalarSchemaJSON(c.count.hi.v)
		}
		if !str && "" == c.domain {
			sc.lose(path, "len",
				"a count with no domain is exported as minItems/maxItems; "+
					"JSON Schema has no keyword that counts a string OR a container")
		}
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

func schemaFromVal(sc *schemaCtx, path []string, v Val) map[string]any {
	out := schemaFromValInner(sc, path, v)

	if nil != v {
		if rec := v.deprecRec(); nil != rec && nil != out {
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
			out["deprecated"] = true
		}
	}

	return out
}

func schemaFromValInner(sc *schemaCtx, path []string, v Val) map[string]any {
	if nil == v { //coverage:ignore a bag never holds a nil child
		// Defensive. Every caller walks a bag's own children, and a bag
		// holds Vals; the guard is here so a degenerate parse cannot
		// panic a verb whose whole job is to describe a document.
		return map[string]any{}
	}

	switch t := v.(type) {
	case *PrefVal:
		inner := schemaFromVal(sc, path, t.peg)
		if gen, ok := schemaGenerated(t.peg); ok {
			inner["default"] = gen
		}
		return inner

	case *DisjunctVal:
		return schemaFromDisjunct(sc, path, t)

	case *ConstraintVal:
		return schemaFromConstraint(sc, path, t)

	case *ConjunctVal:
		if con, bag, ok := sizingResidue(t); ok {
			out := schemaFromVal(sc, path, bag)
			for k, val := range schemaFromConstraint(sc, path, con) {
				out[k] = val
			}
			return out
		}

	case *MapVal:
		return schemaFromMap(sc, path, t)

	case *ListVal:
		return schemaFromList(sc, path, t)

	case *ScalarKindVal:
		if KindBigInteger == t.kind || KindBigDecimal == t.kind {
			sc.lose(path, t.kind.String(),
				"JSON has one number type and it is binary64, so the EXACTNESS "+
					"this leaf exists for cannot be carried; the schema says "+
					"\""+kindType[t.kind]+"\" and a consumer may round")
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
		if KindBigInteger == t.kind || KindBigDecimal == t.kind {
			sc.lose(path, "exact literal",
				"JSON has one number type and it is binary64, so this exact "+
					"value is emitted as the nearest JSON number")
		}
		return map[string]any{
			"const": scalarSchemaJSON(t),
			"type":  scalarSchemaType(t),
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

	consts := make([]any, 0, len(bare))
	allConst := true
	for _, m := range bare {
		sv, ok := m.(*ScalarVal)
		if !ok || KindNil == sv.kind {
			allConst = false
			break
		}
		consts = append(consts, scalarSchemaJSON(sv))
	}

	out := map[string]any{}
	if allConst {
		out["enum"] = consts
	} else {
		any_ := make([]any, 0, len(bare))
		for _, m := range bare {
			any_ = append(any_, schemaFromVal(sc, path, m))
		}
		out["anyOf"] = any_
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

	var spread map[string]any
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

	// A list with a spread template is homogeneous: every element, named
	// or not, satisfies it. That is items.
	if nil != v.spread {
		out := map[string]any{
			"type": "array",
			"items": schemaFromVal(sc,
				append(append([]string{}, path...), "&"), v.spread),
		}
		if 0 < len(idx) {
			out["minItems"] = len(idx)
		}
		return out
	}

	prefix := make([]any, 0, len(idx))
	for _, i := range idx {
		prefix = append(prefix, schemaFromVal(sc,
			append(append([]string{}, path...), itoa(i)), v.peg[i]))
	}
	return map[string]any{
		"type":        "array",
		"prefixItems": prefix,
		"items":       false,
		"minItems":    len(idx),
	}
}

func schemaSkipMarked(sc *schemaCtx, path []string, bag, child Val) bool {
	if bag.markedHide() || bag.markedType() || nil == child {
		return false
	}
	if child.markedHide() {
		sc.lose(path, "hide",
			"a hidden entry is not generated, so it is omitted from the "+
				"schema; a consumer is neither asked for it nor allowed to "+
				"know about it")
		return true
	}
	if child.markedType() {
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
	for k, val := range body {
		schema[k] = val
	}

	verdict := "ok"
	if 0 < len(sc.lossy) {
		verdict = "lossy"
	}
	return SchemaReport{Verdict: verdict, Schema: schema, Lossy: sc.lossy}
}
