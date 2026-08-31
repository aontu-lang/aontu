// Copyright (c) 2021-2026 Richard Rodger, MIT License

package aontu

// THE RUNTIME SIGNATURE CHECKER (docs/design/SIGNATURES.0.md). One
// argument gate, run by the shared function machinery (FuncVal.Unify)
// just before a call resolves, when its arguments are driven: for
// each VALUE-mode argument whose declared type is scalar-kind words,
// the driven Val must be a concrete scalar of an admitted kind. A
// failure refuses as `func_arg`, whose hint renders the signature
// line and names the offending argument -- the error-message builder
// the registry exists for.
//
// The gate owns exactly the argument-shape refusals that were bare
// `invalid-arg` at the call; everything with more meaning than a
// shape mismatch keeps its own code, and what the gate refuses it
// must POSITIVELY identify (a wrong-kinded concrete scalar, a map, a
// list, a scalar KIND marker) -- a preference, a residual or a
// disjunct passes through to the builtin's own logic. Mirrors
// ts/src/siggate.ts, which carries the full reasoning.

import "strings"

// sigKindWords maps the scalar-kind words the gate enforces to their
// lattice kinds. A declared type is gate-checkable only when EVERY
// union word is here.
var sigKindWords = map[string]Kind{
	"string":     KindString,
	"number":     KindNumber,
	"integer":    KindInteger,
	"float":      KindFloat,
	"biginteger": KindBigInteger,
	"bigdecimal": KindBigDecimal,
	"boolean":    KindBoolean,
	"path":       KindPath,
}

func sigGateKinds(atype string) []Kind {
	words := strings.Split(atype, "|")
	out := make([]Kind, 0, len(words))
	for _, word := range words {
		k, ok := sigKindWords[word]
		if !ok {
			return nil
		}
		out = append(out, k)
	}
	return out
}

// sigAdmits: the declared kinds admit a driven Val when it is a
// concrete scalar whose leaf kind is, or sits below, one of them --
// the same walk subsumption makes, so `number` admits every numeric
// leaf and `string` admits a path value.
func sigAdmits(kinds []Kind, arg Val) bool {
	sv, ok := arg.(*ScalarVal)
	if !ok {
		return false
	}
	for _, k := range kinds {
		if k == sv.kind || kindSubsumes(k, sv.kind) {
			return true
		}
	}
	return false
}

// sigRefuse answers the func_arg refusal, or nil to let the call
// resolve. Mirrors sigRefuse in ts/src/siggate.ts.
func sigRefuse(ctx *Ctx, f *FuncVal, args []Val) Val {
	sig, ok := funcSig[f.name]

	// key() reads its level off the written peg and `key_level` names
	// what is wrong with a bad one; the gate leaves the meaning where
	// it lives.
	if !ok || "key" == sig.Name {
		return nil
	}

	for i, a := range sig.Args {
		if a.Rest {
			break
		}
		if ModeValue != a.Mode {
			continue
		}
		kinds := sigGateKinds(a.Type)
		if nil == kinds {
			continue
		}
		if len(args) <= i {
			continue
		}
		arg := args[i]
		if nil == arg || arg.Nil() || DONE != arg.Dc() {
			continue
		}
		shaped := false
		switch arg.(type) {
		case *ScalarVal, *MapVal, *ListVal, *ScalarKindVal:
			shaped = true
		}
		if shaped && !sigAdmits(kinds, arg) {
			out := makeNilErrFull(ctx, "func_arg", f, arg, "", map[string]string{
				"func": sig.Name,
				"sig":  renderSig(sig),
				"arg":  a.Name,
				"argn": itoa(i + 1),
				"got":  arg.Canon(),
			})
			return out
		}
	}

	return nil
}
