package aontu

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

// The gate stops at a rest argument; a call that reads its rest as data
// asks for each one here.
func restRefuse(ctx *Ctx, f *FuncVal, args []Val) Val {
	sig := funcSig[f.name]
	fixed := len(sig.Args) - 1
	rest := sig.Args[fixed]
	kinds := sigGateKinds(rest.Type)
	for i := fixed; i < len(args); i++ {
		if !sigAdmits(kinds, args[i]) {
			return makeNilErrFull(ctx, "func_arg", f, args[i], "", map[string]string{
				"func": sig.Name,
				"sig":  renderSig(sig),
				"arg":  rest.Name,
				"argn": itoa(i + 1),
				"got":  args[i].Canon(),
			})
		}
	}
	return nil
}
