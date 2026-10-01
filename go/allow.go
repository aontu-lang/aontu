/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import "strings"

// AllowAt is where the roles map lives when the caller does not say.
const AllowAt = "$.roles"

// AllowDecision mirrors AllowDecision in ts/src/allow.ts, its fields
// in the canonical emitter's lexicographic order.
type AllowDecision struct {
	Allowed bool   `json:"allowed"`
	By      string `json:"by,omitempty"`
	Path    string `json:"path"`
	Pattern string `json:"pattern,omitempty"`
	Reason  string `json:"reason"`
}

// AllowReport mirrors AllowReport in ts/src/allow.ts.
type AllowReport struct {
	Findings []VetFinding    `json:"findings"`
	Paths    []AllowDecision `json:"paths"`
	Role     string          `json:"role"`
	Verdict  string          `json:"verdict"`
}

// AllowOptions mirrors AllowOptions in ts/src/allow.ts; the include
// options ride the Aontu instance. An empty At is AllowAt.
type AllowOptions struct {
	At string
}

const allowEntry = `string & re("^[$]") & re("[^.]$")`

const allowRoleShape = `{ allow: [&: ` + allowEntry + `] deny?: [&: ` + allowEntry + `] }`

func allowShapeSource(at string) string {
	keys := queryPathParts(at)
	if 0 == len(keys) {
		return "&: " + allowRoleShape
	}
	quoted := make([]string, len(keys))
	for i, k := range keys {
		quoted[i] = jsonString(k)
	}
	return strings.Join(quoted, ": ") + ": { &: " + allowRoleShape + " }"
}

type allowEntryRec struct {
	parts []string
	text  string
	by    string
}

func allowReadEntries(
	list *ListVal, by string, ctx *Ctx) ([]allowEntryRec, *VetFinding) {
	entries := []allowEntryRec{}
	for i, el := range list.peg {
		at := by + "." + itoa(i)
		var text string
		if s, ok := el.(*ScalarVal); ok && KindString == s.kind {
			text = s.peg.(string)
		} else {
			out, gerr := genCollect(ctx, el)
			if nil != gerr {
				f := engineFinding(gerr, at)
				return entries, &f
			}
			text, _ = out.(string)
		}
		entries = append(entries,
			allowEntryRec{parts: queryPathParts(text), text: text, by: at})
	}
	return entries, nil
}

func allowSegmentMatches(pattern, segment string) bool {
	return "*" == pattern || pattern == segment
}

func allowIntersects(entry, path []string) bool {
	n := len(entry)
	if len(path) < n {
		n = len(path)
	}
	for i := 0; i < n; i++ {
		if !allowSegmentMatches(entry[i], path[i]) {
			return false
		}
	}
	return true
}

func allowCovers(entry, path []string) bool {
	return len(entry) <= len(path) && allowIntersects(entry, path)
}

func allowDecide(asked string, allows, denies []allowEntryRec) AllowDecision {
	parts := queryPathParts(asked)
	path := subPathText(parts)
	for _, d := range denies {
		if allowIntersects(d.parts, parts) {
			return AllowDecision{Path: path, Reason: "deny", By: d.by, Pattern: d.text}
		}
	}
	for _, a := range allows {
		if allowCovers(a.parts, parts) {
			return AllowDecision{
				Path: path, Allowed: true, Reason: "allow", By: a.by, Pattern: a.text}
		}
	}
	return AllowDecision{Path: path, Reason: "uncovered"}
}

func allowErrorReport(role string, f VetFinding) AllowReport {
	return AllowReport{Verdict: "error", Role: role,
		Paths: []AllowDecision{}, Findings: []VetFinding{f}}
}

func allowList(node Val, key string) *ListVal {
	if m, ok := node.(*MapVal); ok {
		if l, ok := m.peg[key].(*ListVal); ok {
			return l
		}
	}
	// A closed role that declares no `deny` has none to read.
	return newList(nil)
}

// Allow evaluates the role model, selects the role, and decides every
// path. Mirrors allow in ts/src/allow.ts.
func (a *Aontu) Allow(
	src, role string, paths []string, opts *AllowOptions) AllowReport {
	at := AllowAt
	if nil != opts && "" != opts.At {
		at = opts.At
	}
	at = subPathText(queryPathParts(at))

	shape, _ := New().Parse(allowShapeSource(at))
	model, perr := a.parseEntry(src)
	if nil != perr {
		return allowErrorReport(role, engineFinding(perr, "$"))
	}
	pair := newConjunct([]Val{model, shape})
	root, ctx, uerr := a.unifyCtx(pair, nil, src)
	if nil != uerr || nil == root || root.Nil() {
		return allowErrorReport(role, engineFinding(evalError(uerr, root, ctx), "$"))
	}

	roles, ok := anchorAt(root, at).(*MapVal)
	if !ok { //coverage:ignore the shape has met the anchor as a map
		roles = newMap()
	}
	atRole := at + "." + role
	node, declared := roles.peg[role]
	if !declared {
		decisions := make([]AllowDecision, len(paths))
		for i, p := range paths {
			decisions[i] = AllowDecision{
				Path: subPathText(queryPathParts(p)), Reason: "no_role"}
		}
		return AllowReport{
			Verdict: "refused",
			Role:    role,
			Paths:   decisions,
			Findings: []VetFinding{queryFinding(
				"no_path",
				atRole,
				"The role "+role+" is not declared at "+at+" in this document.",
				queryNote(queryNearestKey(role, roles.keys)))},
		}
	}

	allows, f := allowReadEntries(allowList(node, "allow"), atRole+".allow", ctx)
	if nil != f {
		return allowErrorReport(role, *f)
	}
	denies, f := allowReadEntries(allowList(node, "deny"), atRole+".deny", ctx)
	if nil != f {
		return allowErrorReport(role, *f)
	}

	// Nothing asked is nothing allowed: a gate that answered `allowed`
	// to an empty question would let a caller that dropped its
	// arguments through.
	decisions := make([]AllowDecision, len(paths))
	allowed := 0 < len(paths)
	for i, p := range paths {
		decisions[i] = allowDecide(p, allows, denies)
		allowed = allowed && decisions[i].Allowed
	}
	verdict := "refused"
	if allowed {
		verdict = "allowed"
	}
	return AllowReport{Verdict: verdict, Role: role, Paths: decisions,
		Findings: []VetFinding{}}
}

// OneValue reports whether value parses, with loads denied, as exactly
// one value: `set` appends it as source, so a second pair in it would
// write a subtree the gate was not asked about.
func OneValue(value string) bool {
	a := New()
	a.Trust = &TrustOptions{IncludeNone: true}
	v, err := a.Parse("v: " + value)
	if nil != err {
		return false
	}
	m, ok := v.(*MapVal)
	return ok && 1 == len(m.keys)
}
