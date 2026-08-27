/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"math/big"
	"sort"
	"strings"
)

// JSON SCHEMA EXPORT (the Go side of ts/src/jsonschema.ts).
//
// The review's finding I / SUPPORT.md act 2: "JSON Schema's decisive
// 2026 advantage is not its validator ecosystem -- it is that every
// major LLM provider's structured-output API natively constrains
// generation to JSON Schema." Without an export, Aontu cannot ride that
// path and then apply vet as the semantic gate, and an MCP tool's
// inputSchema -- which the protocol REQUIRES to be JSON Schema -- cannot
// be derived from an Aontu tool model at all.
//
// THE MAPPING IS LOSSY, AND SAYS SO PER CONSTRUCT. See the TypeScript
// twin's header for the full statement: a converter that dropped an
// evaluate-only must(), an exact 0d leaf or a unique(k) silently would
// hand its caller a schema that ADMITS MORE than the model does, which
// is the failure mode this language exists to refuse.
//
// Draft 2020-12, because that is what the structured-output APIs read.

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
	Lossy []SchemaLoss `json:"lossy"`
	// Schema is the JSON Schema document; empty on error.
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

// kindType is the JSON type for a kind. number and its four leaves all
// become JSON's two numeric types; the exactness of biginteger and
// bigdecimal has no JSON type at all, which is a loss the caller is told
// about rather than a silent widening.
var kindType = map[Kind]string{
	KindString:     "string",
	KindBoolean:    "boolean",
	KindInteger:    "integer",
	KindBigInteger: "integer",
	KindFloat:      "number",
	KindBigDecimal: "number",
	KindNumber:     "number",
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

	// An OPEN endpoint is JSON Schema's exclusive form, a keyword of its
	// own in 2020-12 rather than the boolean flag draft-4 used.
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

	// Aontu DEFINES its portable regex subset, and every member of it is
	// also an ECMA-262 expression -- which is what JSON Schema's pattern
	// is read as -- so this crosses without translation. More than one
	// pattern needs allOf: pattern is a single keyword.
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
			sc.lose(path, "length",
				"a count with no domain is exported as minItems/maxItems; "+
					"JSON Schema has no keyword that counts a string OR a container")
		}
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

// schemaFromVal is the exporter proper. Every arm answers a schema; the
// ones that cannot answer honestly report a loss and fall back to {},
// which admits anything -- the safe direction for a document that will
// be checked again by vet, and the direction the loss report exists to
// make visible.
func schemaFromVal(sc *schemaCtx, path []string, v Val) map[string]any {
	if nil == v { //coverage:ignore a bag never holds a nil child
		// Defensive. Every caller walks a bag's own children, and a bag
		// holds Vals; the guard is here so a degenerate parse cannot
		// panic a verb whose whole job is to describe a document.
		return map[string]any{}
	}

	switch t := v.(type) {
	case *PrefVal:
		// A preference is its inner value plus a DEFAULT. JSON Schema's
		// default is annotation rather than constraint -- it does not
		// validate -- which is exactly what a preference is when
		// something else supplies the value.
		inner := schemaFromVal(sc, path, t.peg)
		if gen, ok := schemaGenerated(t.peg); ok {
			inner["default"] = gen
		}
		return inner

	case *DisjunctVal:
		return schemaFromDisjunct(sc, path, t)

	case *ConstraintVal:
		return schemaFromConstraint(sc, path, t)

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
		if jt, ok := kindType[t.kind]; ok {
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

	// Everything else is residue: a reference that did not resolve, a
	// function or operator still waiting, a nil. None of them is a
	// property constraint, and guessing one would be inventing a
	// promise.
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

// schemaFromDisjunct maps a disjunction of CONCRETE members to an enum
// -- the shape a structured-output API constrains best -- and anything
// else to anyOf. A preferred member contributes the default either way,
// which is how *"a"|"b"|"c" reaches a provider as a defaulted enum.
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
		if nil != child && child.markedHide() {
			sc.lose(append(append([]string{}, path...), key), "hide",
				"a hidden entry is not generated, so it is omitted from the "+
					"schema; a consumer is neither asked for it nor allowed to "+
					"know about it")
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

	// CLOSEDNESS IS THE ONE THING JSON SCHEMA SAYS EXACTLY AS AONTU
	// DOES. A closed map is additionalProperties:false; an open one
	// leaves the keyword off, since JSON Schema's default is already
	// open.
	if v.closed {
		out["additionalProperties"] = false
		if nil != spread {
			sc.lose(path, "&:",
				"a spread on a CLOSED map constrains keys that cannot exist, "+
					"so additionalProperties:false stands alone and the "+
					"template is dropped")
		}
	} else if nil != spread {
		// A spread IS additionalProperties-with-a-schema: every key the
		// author did not name must still satisfy the template.
		out["additionalProperties"] = spread
	}

	return out
}

func schemaFromList(sc *schemaCtx, path []string, v *ListVal) map[string]any {
	// A list with a spread template is homogeneous: every element, named
	// or not, satisfies it. That is items.
	if nil != v.spread {
		out := map[string]any{
			"type": "array",
			"items": schemaFromVal(sc,
				append(append([]string{}, path...), "&"), v.spread),
		}
		if 0 < len(v.peg) {
			out["minItems"] = len(v.peg)
		}
		return out
	}

	// A written list literal is a TUPLE: position by position, and no
	// more. 2020-12 spells that prefixItems plus items:false.
	prefix := make([]any, 0, len(v.peg))
	for i, el := range v.peg {
		prefix = append(prefix, schemaFromVal(sc,
			append(append([]string{}, path...), itoa(i)), el))
	}
	return map[string]any{
		"type":        "array",
		"prefixItems": prefix,
		"items":       false,
		"minItems":    len(v.peg),
	}
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
			Errors: []VetFinding{failureFinding(ctx, a.File, src)}}
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
				Errors: []VetFinding{failureFinding(ctx, a.File, src)}}
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
