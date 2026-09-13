/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

// THE JOSTRACA COMPONENT PRIMITIVES as aontu functions. The FUNCTION is
// lower case, like every other builtin; the NODE it builds carries the
// Jostraca component name, which is what the bridge looks up. One table
// states the whole set, and the funcSet entries are made from it.
// Mirrors CMP_DEF in ts/src/val/CmpFuncVal.ts.
type cmpDef struct {
	cmp string
	// The prop a bare string argument fills, and whether it is required.
	text string
	req  bool
	// Whether that prop is a SPAN of target text rather than a name. A
	// blank line is a span; a folder called "" is a mistake.
	span bool
	// A prop that must be present and must be a list.
	bag string
	// The children this component admits, by aontu function name. Empty
	// means a leaf: any child at all is a mistake.
	children []string
}

var cmpDefs = map[string]cmpDef{
	"project": {
		cmp: "Project", text: "folder", req: false,
		children: []string{"project", "folder", "file", "copyfiles"},
	},
	"folder": {
		cmp: "Folder", text: "name", req: true,
		children: []string{"folder", "file", "copyfiles"},
	},
	"file": {
		cmp: "File", text: "name", req: true,
		children: []string{"content", "line", "fragment", "inject", "listitems", "copyfiles"},
	},
	"content": {
		cmp: "Content", text: "src", req: true, span: true,
		children: []string{},
	},
	"line": {
		cmp: "Line", text: "src", req: true, span: true,
		children: []string{},
	},
	"fragment": {
		cmp: "Fragment", text: "from", req: true,
		children: []string{"slot", "content", "line", "listitems"},
	},
	"slot": {
		cmp: "Slot", text: "name", req: true,
		children: []string{"content", "line", "fragment", "listitems"},
	},
	"inject": {
		cmp: "Inject", text: "name", req: true,
		children: []string{"content", "line", "listitems"},
	},
	// `Copy` under a name aontu has free: `copy` is taken by the builtin
	// that copies a VALUE, and a file copy is a different verb.
	"copyfiles": {
		cmp: "CopyFiles", text: "from", req: true,
		children: []string{},
	},
	"listitems": {
		cmp: "ListItems", req: true, bag: "item",
		children: []string{"content", "line", "fragment"},
	},
}

// The Jostraca name back to the aontu one: a node carries the former
// and the child grammar is written in the latter.
var cmpByName = map[string]string{}

func init() {
	for fname, d := range cmpDefs {
		cmpByName[d.cmp] = fname
		funcSet[fname] = true
	}
}

func nodeCmp(v Val) (string, bool) {
	m, ok := v.(*MapVal)
	if !ok {
		return "", false
	}
	name, ok := stringPeg(m.peg["cmp"])
	if !ok {
		return "", false
	}
	fname, ok := cmpByName[name]
	return fname, ok
}

func cmpPropText(props *MapVal, key string) (string, bool) {
	return stringPeg(props.peg[key])
}

func cmpAdmits(def cmpDef, fname string) bool {
	for _, c := range def.children {
		if c == fname {
			return true
		}
	}
	return false
}

func cmpNode(cmp string, props *MapVal, children *ListVal) *MapVal {
	node := newMap()
	node.set("cmp", newString(cmp))
	node.set("props", props)
	node.set("children", children)
	node.closed = true
	return node
}

func contentNode(src string) *MapVal {
	props := newMap()
	props.set("src", newString(src))
	return cmpNode(cmpDefs["content"].cmp, props, newList([]Val{}))
}

// cmpFlatten splices nested lists and refuses a child the component
// does not admit, answering the offending value. A bare string is
// `content` sugar, which is what a template body line desugars to.
func cmpFlatten(def cmpDef, list []Val, out *[]Val) Val {
	for _, kid := range list {
		if inner, ok := kid.(*ListVal); ok {
			if bad := cmpFlatten(def, inner.peg, out); nil != bad {
				return bad
			}
			continue
		}
		if text, isText := stringPeg(kid); isText {
			if !cmpAdmits(def, "content") {
				return kid
			}
			*out = append(*out, contentNode(text))
			continue
		}
		kcmp, ok := nodeCmp(kid)
		if !ok {
			return kid
		}
		if !cmpAdmits(def, kcmp) {
			return kid
		}
		*out = append(*out, kid)
	}
	return nil
}

func cmpFunc(ctx *Ctx, f *FuncVal, args []Val) Val {
	def := cmpDefs[f.name]
	leaf := 0 == len(def.children)

	low := 0
	if def.req {
		low = 1
	}
	high := 2
	if leaf {
		high = 1
	}
	if len(args) < low || len(args) > high { //coverage:ignore each component declares its arity; a bad count is refused at parse
		return makeNilErrFull(ctx, "invalid-arg", f, nil, "arity", nil)
	}

	var props *MapVal
	switch {
	case 0 == len(args):
		props = newMap()
	default:
		if s, ok := stringPeg(args[0]); ok {
			if "" == def.text {
				return makeNilErrFull(ctx, "invalid-arg", f, args[0], "spec", nil)
			}
			props = newMap()
			props.set(def.text, newString(s))
		} else if m, ok := args[0].(*MapVal); ok {
			props = m
		} else {
			return makeNilErrFull(ctx, "invalid-arg", f, args[0], "spec", nil)
		}
	}

	if "" != def.text {
		text, ok := cmpPropText(props, def.text)
		empty := "" == text && !def.span
		if def.req && (!ok || empty) {
			return makeNilErrFull(ctx, "invalid-arg", f, props, def.text, nil)
		}
		if _, written := props.peg[def.text]; !def.req && written && (!ok || empty) {
			return makeNilErrFull(ctx, "invalid-arg", f, props, def.text, nil)
		}
	}

	// A bag prop is required and must be a list: `listitems` with no
	// `item` renders nothing, silently, which is the failure a data
	// path must not have.
	if "" != def.bag {
		if _, ok := props.peg[def.bag].(*ListVal); !ok {
			return makeNilErrFull(ctx, "invalid-arg", f, props, def.bag, nil)
		}
	}

	kids := []Val{}
	if 1 < len(args) {
		list, ok := args[1].(*ListVal)
		if !ok {
			return makeNilErrFull(ctx, "invalid-arg", f, args[1], "children", nil)
		}
		if bad := cmpFlatten(def, list.peg, &kids); nil != bad {
			return makeNilErrFull(ctx, "invalid-arg", f, bad, "children", nil)
		}
	}

	return cmpNode(def.cmp, props, newList(kids))
}
