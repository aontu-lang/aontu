// Copyright (c) 2021-2026 Richard Rodger, MIT License

package aontu

// THE SIGNATURE REGISTRY (docs/design/SIGNATURES.0.md). The call
// surface of the built-in functions is DECLARED, in the signature
// syntax itself, in test/spec/signature.tsv; this file is the Go half
// of the pair that reads it. The declaration text is embedded at
// build time (go/sigdecl.txt, `make sig`) and parsed at
// initialisation by the signature grammar -- a custom tabnas grammar,
// the same engine the aontu grammar itself is built on -- into the
// registry the runtime signature checker, the error-message builder
// and the LSP consume. Neither port authors a table: ts/src/sig.ts
// parses the same text with the same grammar, and the shared suite
// round-trips every line (render(parse(line)) is the line) so the two
// parsers cannot drift. Mirrors ts/src/sig.ts throughout.

import (
	_ "embed"
	"fmt"
	"strings"

	tabnas "github.com/tabnas/parser/go"
)

//go:embed sigdecl.txt
var sigDeclText string

// ArgMode is an argument's reading: value (driven and read as a
// value, the unmarked default), or one of the five marked modes plain
// pseudo-TypeScript cannot say.
type ArgMode string

const (
	ModeValue     ArgMode = "value"
	ModeCapture   ArgMode = "capture"
	ModeTemplate  ArgMode = "template"
	ModeTrial     ArgMode = "trial"
	ModeProjector ArgMode = "projector"
	ModeText      ArgMode = "text"
)

// GroupSig is one member of a rest-group argument (match's
// pattern/result pair): a mode and a type, no name -- the group
// repeats.
type GroupSig struct {
	Mode ArgMode
	Type string
}

type ArgSig struct {
	Name  string
	Mode  ArgMode
	Type  string
	Opt   bool
	Rest  bool
	Group []GroupSig
}

type FuncSig struct {
	Name string
	Args []ArgSig
	Out  string
}

var sigArgModes = map[string]bool{
	"capture": true, "template": true, "trial": true,
	"projector": true, "text": true,
}

// sigBuild is the per-parse scratch an argument accumulates in Rule.U
// under these keys. Mirrors the TS actions' r.u fields.
const (
	sigUsig   = "sig"
	sigUgm    = "gm"
	sigUwords = "words"
)

// makeSigParser builds the signature-grammar parser. Rules: sig (the
// line) -> args -> arg -> argtype -> type | group -> gmember. Alts
// match at most two tokens, the engine's shape; lists loop the
// json-grammar way (the element rule replaces itself on ',' and
// backtracks the closer for its parent to consume). The errs sink
// collects word-choice errors (a mode that is not a mode) that token
// shape cannot catch.
func makeSigParser(errs *[]string) *tabnas.Tabnas {
	j := tabnas.Make(tabnas.Options{Rule: &tabnas.RuleOptions{Start: "sig"}})

	err := j.Use(func(j *tabnas.Tabnas, _ map[string]any) error {
		op, cp, qm, pi, dd := "(", ")", "?", "|", "..."
		j.SetOptions(tabnas.Options{Fixed: &tabnas.FixedOptions{
			Token: map[string]*string{
				"#OP": &op, "#CP": &cp, "#QM": &qm, "#PI": &pi, "#DD": &dd,
			},
		}})

		mode := func(word string) ArgMode {
			if !sigArgModes[word] {
				*errs = append(*errs, "mode:"+word)
				return ModeValue
			}
			return ArgMode(word)
		}
		// Rule.U is nil until something writes it; the engine only
		// pre-creates it for alts carrying a U spec, so every writer
		// here ensures the map first.
		uof := func(r *tabnas.Rule) map[string]any {
			if nil == r.U {
				r.U = map[string]any{}
			}
			return r.U
		}
		// Every token the actions read is a #TX word, whose Val is its
		// string.
		tokstr := func(t *tabnas.Token) string {
			s, _ := t.Val.(string)
			return s
		}

		ref := map[tabnas.FuncRef]any{
			"@sig-bo": tabnas.StateAction(func(r *tabnas.Rule, _ *tabnas.Context) {
				r.Node = &FuncSig{}
				uof(r)[sigUwords] = []string{}
			}),
			"@signame": tabnas.AltAction(func(r *tabnas.Rule, _ *tabnas.Context) {
				r.Node.(*FuncSig).Name = tokstr(r.O0)
			}),
			"@sigargs": tabnas.AltAction(func(r *tabnas.Rule, _ *tabnas.Context) {
				args, _ := r.Child.Node.(*[]ArgSig)
				if nil != args {
					r.Node.(*FuncSig).Args = *args
				}
			}),
			"@sigout": tabnas.AltAction(func(r *tabnas.Rule, _ *tabnas.Context) {
				words, _ := r.U[sigUwords].([]string)
				r.Node.(*FuncSig).Out = strings.Join(words, "|")
			}),

			"@args-bo": tabnas.StateAction(func(r *tabnas.Rule, _ *tabnas.Context) {
				r.Node = &[]ArgSig{}
			}),

			"@arg-bo": tabnas.StateAction(func(r *tabnas.Rule, _ *tabnas.Context) {
				uof(r)[sigUsig] = &ArgSig{Mode: ModeValue}
			}),
			"@arg-rest": tabnas.AltAction(func(r *tabnas.Rule, _ *tabnas.Context) {
				sig := r.U[sigUsig].(*ArgSig)
				sig.Rest = true
				sig.Name = tokstr(r.O1)
			}),
			"@arg-modename": tabnas.AltAction(func(r *tabnas.Rule, _ *tabnas.Context) {
				sig := r.U[sigUsig].(*ArgSig)
				sig.Mode = mode(tokstr(r.O0))
				sig.Name = tokstr(r.O1)
			}),
			"@arg-name": tabnas.AltAction(func(r *tabnas.Rule, _ *tabnas.Context) {
				r.U[sigUsig].(*ArgSig).Name = tokstr(r.O0)
			}),
			"@arg-opt": tabnas.AltAction(func(r *tabnas.Rule, _ *tabnas.Context) {
				r.U[sigUsig].(*ArgSig).Opt = true
			}),
			"@arg-done": tabnas.AltAction(func(r *tabnas.Rule, _ *tabnas.Context) {
				sig := r.U[sigUsig].(*ArgSig)
				switch at := r.Child.Node.(type) {
				case *[]GroupSig:
					sig.Group = *at
				case string:
					sig.Type = at
				}
				args, _ := r.Node.(*[]ArgSig)
				if nil != args {
					*args = append(*args, *sig)
				}
			}),

			"@argtype-bo": tabnas.StateAction(func(r *tabnas.Rule, _ *tabnas.Context) {
				uof(r)[sigUwords] = []string{}
			}),
			"@argtype-bc": tabnas.StateAction(func(r *tabnas.Rule, _ *tabnas.Context) {
				words, _ := r.U[sigUwords].([]string)
				if 0 < len(words) {
					r.Node = strings.Join(words, "|")
				} else {
					r.Node = r.Child.Node
				}
			}),

			"@type-word": tabnas.AltAction(func(r *tabnas.Rule, _ *tabnas.Context) {
				pu := uof(r.Parent)
				words, _ := pu[sigUwords].([]string)
				pu[sigUwords] = append(words, tokstr(r.O0))
			}),

			"@group-bo": tabnas.StateAction(func(r *tabnas.Rule, _ *tabnas.Context) {
				r.Node = &[]GroupSig{}
			}),
			"@gm-two": tabnas.AltAction(func(r *tabnas.Rule, _ *tabnas.Context) {
				uof(r)[sigUgm] = GroupSig{Mode: mode(tokstr(r.O0)), Type: tokstr(r.O1)}
			}),
			"@gm-one": tabnas.AltAction(func(r *tabnas.Rule, _ *tabnas.Context) {
				uof(r)[sigUgm] = GroupSig{Mode: ModeValue, Type: tokstr(r.O0)}
			}),
			"@gm-done": tabnas.AltAction(func(r *tabnas.Rule, _ *tabnas.Context) {
				gs, _ := r.Node.(*[]GroupSig)
				if nil != gs {
					*gs = append(*gs, r.U[sigUgm].(GroupSig))
				}
			}),
		}

		rules := map[string]*tabnas.GrammarRuleSpec{
			"sig": {
				Open: []*tabnas.GrammarAltSpec{
					{S: "#TX #OP", A: "@signame", P: "args"},
				},
				Close: []*tabnas.GrammarAltSpec{
					{S: "#CL", P: "type", A: "@sigargs"},
					{S: "#ZZ", A: "@sigout"},
				},
			},
			"args": {
				Open: []*tabnas.GrammarAltSpec{
					{S: "#CP", B: 1},
					{P: "arg"},
				},
				Close: []*tabnas.GrammarAltSpec{
					{S: "#CP"},
				},
			},
			"arg": {
				Open: []*tabnas.GrammarAltSpec{
					{S: "#DD #TX", A: "@arg-rest"},
					{S: "#TX #TX", A: "@arg-modename"},
					{S: "#TX", A: "@arg-name"},
				},
				Close: []*tabnas.GrammarAltSpec{
					{S: "#QM #CL", A: "@arg-opt", P: "argtype"},
					{S: "#CL", P: "argtype"},
					{S: "#CA", A: "@arg-done", R: "arg"},
					{S: "#CP", A: "@arg-done", B: 1},
				},
			},
			"argtype": {
				Open: []*tabnas.GrammarAltSpec{
					{S: "#OP", P: "group"},
					{P: "type"},
				},
				Close: []*tabnas.GrammarAltSpec{
					{},
				},
			},
			"type": {
				Open: []*tabnas.GrammarAltSpec{
					{S: "#TX", A: "@type-word"},
				},
				Close: []*tabnas.GrammarAltSpec{
					{S: "#PI", R: "type"},
					{},
				},
			},
			"group": {
				Open: []*tabnas.GrammarAltSpec{
					{P: "gmember"},
				},
				Close: []*tabnas.GrammarAltSpec{
					{S: "#CP"},
				},
			},
			"gmember": {
				Open: []*tabnas.GrammarAltSpec{
					{S: "#TX #TX", A: "@gm-two"},
					{S: "#TX", A: "@gm-one"},
				},
				Close: []*tabnas.GrammarAltSpec{
					{S: "#CA", A: "@gm-done", R: "gmember"},
					{S: "#CP", A: "@gm-done", B: 1},
				},
			},
		}

		return j.Grammar(&tabnas.GrammarSpec{Ref: ref, Rule: rules})
	})
	if nil != err { //coverage:ignore the grammar is static; registration failure is a build defect
		panic(err)
	}
	return j
}

// parseSigLine parses ONE declaration line. A malformed line is an
// error: the declaration is repository content, read at build and
// test time, so failing loudly is the right shape (the round-trip
// suite holds the gate). Mirrors parseSigLine in ts/src/sig.ts.
func parseSigLine(line string) (*FuncSig, error) {
	var errs []string
	j := makeSigParser(&errs)
	out, err := j.Parse(line)
	if nil != err {
		return nil, fmt.Errorf("signature: %s: %w", line, err)
	}
	if 0 < len(errs) {
		return nil, fmt.Errorf("signature: bad declaration %s: %s",
			strings.Join(errs, ","), line)
	}
	sig, _ := out.(*FuncSig)
	if nil == sig || "" == sig.Name || "" == sig.Out {
		return nil, fmt.Errorf("signature: incomplete declaration: %s", line)
	}
	return sig, nil
}

// renderSigArg renders one argument of a signature -- the piece the
// LSP's signatureHelp parameters share with the whole-line renderer.
// Mirrors renderSigArg in ts/src/sig.ts.
func renderSigArg(a ArgSig) string {
	atype := a.Type
	if nil != a.Group {
		gm := make([]string, 0, len(a.Group))
		for _, g := range a.Group {
			gt := g.Type
			if ModeValue != g.Mode {
				gt = string(g.Mode) + " " + gt
			}
			gm = append(gm, gt)
		}
		atype = "(" + strings.Join(gm, ", ") + ")"
	}
	s := ""
	if a.Rest {
		s += "..."
	}
	if ModeValue != a.Mode && !a.Rest {
		s += string(a.Mode) + " "
	}
	s += a.Name
	if a.Opt {
		s += "?"
	}
	s += ": " + atype
	return s
}

// renderSig renders the canonical line for a parsed signature -- the
// round-trip twin of parseSigLine, and the one renderer every
// consumer (hints, LSP) uses. Mirrors renderSig in ts/src/sig.ts.
func renderSig(sig *FuncSig) string {
	args := make([]string, 0, len(sig.Args))
	for _, a := range sig.Args {
		args = append(args, renderSigArg(a))
	}
	return sig.Name + "(" + strings.Join(args, ", ") + ") : " + sig.Out
}

// parseSigText parses the whole declaration text: comment (#) and
// blank lines are the loader's to skip, one FuncSig per remaining
// line, name-keyed. A duplicate name is an error for the same reason
// a bad line is. Mirrors parseSigText in ts/src/sig.ts.
func parseSigText(text string) (map[string]*FuncSig, error) {
	reg := map[string]*FuncSig{}
	for _, rawline := range strings.Split(text, "\n") {
		line := strings.TrimSpace(rawline)
		if "" == line || strings.HasPrefix(line, "#") {
			continue
		}
		sig, err := parseSigLine(line)
		if nil != err {
			return nil, err
		}
		if _, dup := reg[sig.Name]; dup {
			return nil, fmt.Errorf("signature: duplicate declaration: %s", sig.Name)
		}
		reg[sig.Name] = sig
	}
	return reg, nil
}

// FuncSignature answers the rendered declaration line for a built-in
// name, or "" for a name that is not a builtin. The LSP's completion
// detail and signature help render from this -- the same renderer the
// hints use, so no consumer can drift from the declaration. Twin: the
// TS LSP imports renderSig/funcSig directly (ts/src/lsp.ts).
func FuncSignature(name string) string {
	sig, ok := funcSig[name]
	if !ok {
		return ""
	}
	return renderSig(sig)
}

// FuncSignatureParams answers the rendered argument slots for a
// built-in name, in order, or nil for a name that is not a builtin.
func FuncSignatureParams(name string) []string {
	sig, ok := funcSig[name]
	if !ok {
		return nil
	}
	out := make([]string, 0, len(sig.Args))
	for _, a := range sig.Args {
		out = append(out, renderSigArg(a))
	}
	return out
}

// funcSig is the parsed registry, built once from the embedded
// declaration. The panic on failure is init-time only: the embedded
// text is repository content whose parse the suite gates, so a
// failure here is a build defect, not a runtime condition.
var funcSig = mustParseSigText()

func mustParseSigText() map[string]*FuncSig {
	reg, err := parseSigText(sigDeclText)
	if nil != err { //coverage:ignore the embedded text is suite-gated; a parse failure is a build defect
		panic(err)
	}
	return reg
}
