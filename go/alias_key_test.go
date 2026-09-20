package aontu

import (
	"testing"

	jsonic "github.com/tabnas/jsonic/go"
)

func TestAliasHoistWithoutParseSink(t *testing.T) {
	m := map[string]any{"a": 1}
	placeFileAliasHoists(m, &jsonic.Context{Meta: map[string]any{}})
	if len(m) != 1 || m["a"] != 1 {
		t.Fatalf("map changed without a hoist sink: %#v", m)
	}
}

func TestElidedAliasKeyHasNoHiddenDeclaration(t *testing.T) {
	v, err := New().Parse("x: [%a:]")
	if err != nil {
		t.Fatal(err)
	}
	m := v.(*MapVal)
	if len(m.aliasKeys) != 0 {
		t.Fatalf("hidden declarations: %v", m.aliasKeys)
	}
	n := m.peg["x"].(*ListVal).peg[0].(*MapVal).peg["a"].(*NilVal)
	if n.why != "elided_value" {
		t.Fatalf("elision: %s", n.why)
	}
}

func TestAliasKeysScopeIgnoresStringsAndComments(t *testing.T) {
	src := "# %comment: 1\na: \"%quoted: 1\"\nb: '%single: 1'\n/*\n%block: 1\n*/\nc: `%tick: 1`\n// %slash: 1\nx: {%real: 1 %other: 2}\nv: %prefix = 3"
	got := AliasScope(src)
	if len(got) != 3 || got[0].Name != "%real" || got[1].Name != "%other" || got[2].Name != "%prefix" {
		t.Fatalf("lexical bindings: %+v", got)
	}
}

func TestRootListWithoutLocalHoists(t *testing.T) {
	for _, meta := range []map[string]any{{}, {aliasHoistMetaKey: &aliasHoistSink{entries: []aliasHoist{{owner: "other"}}}}} {
		r := &jsonic.Rule{Node: []any{}, D: 1}
		wrapList(r, &jsonic.Context{Meta: meta})
		if _, ok := r.Node.(*ListVal); !ok {
			t.Fatalf("unexpected refusal: %T", r.Node)
		}
	}
}
