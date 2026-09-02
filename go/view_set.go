/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

// The view document (VIEWS.0.md, "6. The view document").
//
// A projection that runs in CI belongs in a file. A view document is an
// ORDINARY document that includes the model and declares its figures as
// data; `views` is the AUTHOR's key and nothing here knows the name
// (ADR-010), which is why `--views` names the path.
//
// This mirrors the view-document section of ts/src/view.ts function for
// function; test/spec/views.tsv pins both ports on the same rows.

import (
	"sort"
	"strings"
)

// ViewFigure is one figure of a view document: the declaration's key,
// what it drew, and the file the author says it belongs in.
// FIELD ORDER IS LEXICOGRAPHIC, the canonical emitter's order: this
// struct is encoded straight into the CLI's `--format json`, and the
// TypeScript port's emitter sorts keys.
type ViewFigure struct {
	Errors []VetFinding `json:"errors,omitempty"`
	Kind   string       `json:"kind"`
	Loss   []ViewLoss   `json:"loss"`
	Name   string       `json:"name"`
	// Out is where the declaration says to write it. The library never
	// writes: the caller does, and only when every figure rendered.
	Out     string      `json:"out"`
	Text    *string     `json:"text,omitempty"`
	Verdict ViewVerdict `json:"verdict"`
}

// ViewSetReport is N figures of one document, one verdict. `error` if
// ANY figure refused -- a set of figures of one model is only
// meaningful whole.
type ViewSetReport struct {
	Verdict ViewVerdict  `json:"verdict"`
	Views   []ViewFigure `json:"views"`
	// Errors is WHY the set itself could not be read: the document does
	// not stand up, or the declarations are not the shape a declaration
	// has. A figure's own refusal rides on the figure.
	Errors []VetFinding `json:"errors,omitempty"`
}

// The keys a declaration may carry, and what each one is. The names are
// the library's option names, which are the CLI's flag names without
// the dashes: one vocabulary, three doors.
var declText = []string{
	"kind", "as", "out", "at", "relation", "order", "groupBy", "label",
	"sets", "member", "universe",
}

var declCount = []string{"maxRows", "maxCols", "minDegree", "minSize"}

var declFlag = []string{"closure"}

var declList = []string{"roots", "relations", "layers"}

func declKeys() string {
	all := append([]string{}, declText...)
	all = append(all, declCount...)
	all = append(all, declFlag...)
	all = append(all, declList...)
	sort.Strings(all)
	return strings.Join(all, ", ")
}

func viewDocumentFinding(path, message, note string) VetFinding {
	return viewFinding("view_document_shape", "reference", path, message, note)
}

// viewPlan is one validated declaration: everything the drawing needs,
// decided before any figure is drawn, so a document with three bad
// declarations reports three faults rather than the first.
type viewPlan struct {
	name string
	kind string
	as   string
	out  string
	max  int
	opts ViewOptions
}

// viewCount is a declared count: a whole number, zero or more, however
// the document spelled it.
func viewCount(value any) (int, bool) {
	switch n := value.(type) {
	case int64:
		// Every integer the engine generates is an int64 (newInteger).
		return int(n), 0 <= n
	case float64:
		if n != float64(int64(n)) {
			return 0, false
		}
		return int(n), 0 <= n
	}
	// Anything else -- a string, a flag, a list, or a big integer the
	// document could only have if it were written as one, which the
	// engine already refuses (`lossy_integer_literal`) -- is not a
	// count.
	return 0, false
}

func viewPlanOf(name string, decl any, at string) (*viewPlan, []VetFinding) {
	where := at + "." + name
	fields, ok := decl.(map[string]any)
	if !ok {
		return nil, []VetFinding{viewDocumentFinding(where,
			"A view declaration is not a map.", "")}
	}
	errs := []VetFinding{}
	opts := ViewOptions{}
	keys := []string{}
	for k := range fields {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, key := range keys {
		value := fields[key]
		if contains(declText, key) {
			text, isText := value.(string)
			if !isText {
				errs = append(errs, viewDocumentFinding(where+"."+key,
					key+" must be a string.", ""))
				continue
			}
			switch key {
			case "kind":
				opts.Kind = text
			case "as":
				opts.As = text
			case "out":
				opts.Out = text
			case "at":
				opts.At = text
			case "relation":
				opts.Relation = text
			case "order":
				opts.Order = text
			case "groupBy":
				opts.GroupBy = text
			case "label":
				opts.Label = text
			case "sets":
				opts.Sets = text
			case "member":
				opts.Member = text
			case "universe":
				opts.Universe = text
			}
		} else if contains(declCount, key) {
			n, valid := viewCount(value)
			if !valid {
				errs = append(errs, viewDocumentFinding(where+"."+key,
					key+" must be a whole number, zero or more.", ""))
				continue
			}
			switch key {
			case "maxRows":
				opts.MaxRows = n
			case "maxCols":
				opts.MaxCols = n
			case "minDegree":
				opts.MinDegree = n
			case "minSize":
				opts.MinSize = n
			}
		} else if contains(declFlag, key) {
			flag, isFlag := value.(bool)
			if !isFlag {
				errs = append(errs, viewDocumentFinding(where+"."+key,
					key+" must be true or false.", ""))
				continue
			}
			opts.Closure = flag
		} else if contains(declList, key) {
			raw, isList := value.([]any)
			list, allText := viewStrings(raw)
			if !isList || !allText {
				errs = append(errs, viewDocumentFinding(where+"."+key,
					key+" must be a list of strings.", ""))
				continue
			}
			switch key {
			case "roots":
				opts.Roots = list
			case "relations":
				opts.Relations = list
			case "layers":
				opts.Layers = list
			}
		} else {
			errs = append(errs, viewDocumentFinding(where+"."+key,
				key+" is not a view option.", "options: "+declKeys()))
		}
	}

	kind := opts.Kind
	profiles, known := viewProfiles[kind]
	if "" == kind {
		errs = append(errs, viewDocumentFinding(where,
			"A view declaration must name its kind.",
			"kinds: "+strings.Join(viewKinds, ", ")))
	} else if !known {
		errs = append(errs, viewDocumentFinding(where+".kind",
			kind+" is not a figure kind.", "kinds: "+strings.Join(viewKinds, ", ")))
	} else if "poset" == kind {
		// The poset is an order over SEVERAL documents, and a view
		// document declares figures of the one it includes. `aontu view
		// poset` draws it, naming the documents on the command line.
		errs = append(errs, viewDocumentFinding(where+".kind",
			"A view document draws figures of one document; the poset compares several.", ""))
	}
	as := opts.As
	if "" == as && known {
		as = profiles[0]
	}
	if known && "" != as && !contains(profiles, as) {
		errs = append(errs, viewDocumentFinding(where+".as",
			"The "+kind+" figure does not render as "+as+".",
			"profiles: "+strings.Join(profiles, ", ")))
	}
	if "" == opts.Out {
		errs = append(errs, viewDocumentFinding(where,
			"A view declaration must name the file it draws into, as out.", ""))
	} else if viewHasLineBreak(opts.Out) {
		errs = append(errs, viewDocumentFinding(where+".out",
			"A file name cannot hold a line terminator.", ""))
	}
	if 0 < len(errs) {
		return nil, errs
	}
	max := opts.MaxRows
	if 0 == max {
		max = viewDefaultMaxRows
	}
	return &viewPlan{name: name, kind: kind, as: as, out: opts.Out, max: max, opts: opts}, nil
}

// ViewSet draws N FIGURES OF ONE DOCUMENT. The document is evaluated
// ONCE, with the provenance recorder on, and every figure but the
// ladder draws from that one root; the ladder re-runs `why` by
// construction.
//
// The caller writes the files, and only when the whole set rendered:
// N figures of one model are only meaningful together, so a set whose
// third figure refuses must not leave the first two on disk.
func (a *Aontu) ViewSet(src string, opts *ViewOptions) ViewSetReport {
	options := ViewOptions{}
	if nil != opts {
		options = *opts
	}
	none := []ViewFigure{}
	if "" == options.Views {
		return ViewSetReport{Verdict: "error", Views: none,
			Errors: []VetFinding{viewDocumentFinding("$",
				"The view document needs the path of the map that declares the figures; name it with --views.", "")}}
	}
	// ONE EVALUATION, and it is INSTRUMENTED: the layers panel reads the
	// provenance record, which is written during unification, so a set
	// that declares one would otherwise need a second run. Recording it
	// always costs a little and makes the one-evaluation claim true for
	// every kind but the ladder, which re-runs `why` by construction.
	prov := newProvenance(src, map[string]string{})
	root, ctx, errs := a.viewLoad(src, prov)
	if nil != errs {
		return ViewSetReport{Verdict: "error", Views: none, Errors: errs}
	}
	// The declarations are part of the document, so reading them
	// generates it -- and a view document that does not generate has no
	// figures, exactly as `aontu file.aon` on it has no output.
	value, gerr := root.Gen(ctx)
	if nil != gerr {
		return ViewSetReport{Verdict: "error", Views: none,
			Errors: queryFailed(gerr, "$").Findings}
	}
	declared, _ := viewGenAt(value, options.Views)
	fields, isMap := declared.(map[string]any)
	if !isMap {
		return ViewSetReport{Verdict: "error", Views: none,
			Errors: []VetFinding{viewDocumentFinding(options.Views,
				"The view declarations are not a map.", "")}}
	}

	names := []string{}
	for name := range fields {
		names = append(names, name)
	}
	sort.Strings(names)
	plans := []*viewPlan{}
	shape := []VetFinding{}
	for _, name := range names {
		plan, perrs := viewPlanOf(name, fields[name], options.Views)
		shape = append(shape, perrs...)
		if nil != plan {
			plans = append(plans, plan)
		}
	}
	if 0 < len(shape) {
		return ViewSetReport{Verdict: "error", Views: none, Errors: shape}
	}

	gen := &viewGen{value: value}
	views := []ViewFigure{}
	for _, plan := range plans {
		loss := []ViewLoss{}
		each := plan.opts
		var text string
		var ferrs []VetFinding
		if "ladder" == plan.kind {
			text, ferrs = a.drawLadder(src, each.At, plan.as, plan.max)
		} else {
			text, ferrs = a.drawLoaded(root, ctx, gen, prov,
				plan.kind, plan.as, &each, plan.max, &loss)
		}
		if nil != ferrs {
			views = append(views, ViewFigure{Name: plan.name, Kind: plan.kind,
				Out: plan.out, Verdict: "error", Loss: []ViewLoss{}, Errors: ferrs})
			continue
		}
		sort.SliceStable(loss, func(i, j int) bool { return loss[i].Code < loss[j].Code })
		verdict := ViewVerdict("rendered")
		for _, l := range loss {
			if !viewInformational[l.Code] {
				verdict = "lossy"
			}
		}
		figure := text
		views = append(views, ViewFigure{Name: plan.name, Kind: plan.kind,
			Out: plan.out, Verdict: verdict, Text: &figure, Loss: loss})
	}

	verdict := ViewVerdict("rendered")
	for _, v := range views {
		if "error" == v.Verdict {
			verdict = "error"
			break
		}
		if "lossy" == v.Verdict {
			verdict = "lossy"
		}
	}
	return ViewSetReport{Verdict: verdict, Views: views}
}
