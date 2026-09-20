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
