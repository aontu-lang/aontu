/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"encoding/json"
	"math/big"
	"strings"
	"testing"
)


func TestGenerateNativeExactTypes(t *testing.T) {
	cases := []struct {
		name string
		src  string
		// check receives the generated value for key "x".
		check func(t *testing.T, got any)
	}{
		{"biginteger", "x:0d5", func(t *testing.T, got any) {
			n, ok := got.(*big.Int)
			if !ok {
				t.Fatalf("biginteger generated as %T, want *big.Int", got)
			}
			if n.Int64() != 5 {
				t.Fatalf("biginteger value = %v, want 5", n)
			}
		}},
		// The one an integer cannot be told apart from by its bytes: both
		// `x:5` and `x:0d5` serialise as {"x":5}.
		{"integer-is-not-biginteger", "x:5", func(t *testing.T, got any) {
			if _, isBig := got.(*big.Int); isBig {
				t.Fatalf("integer generated as *big.Int; the leaves are disjoint")
			}
			if _, ok := got.(int64); !ok {
				t.Fatalf("integer generated as %T, want int64", got)
			}
		}},
		{"float-is-not-exact", "x:1.5", func(t *testing.T, got any) {
			if _, ok := got.(float64); !ok {
				t.Fatalf("float generated as %T, want float64", got)
			}
		}},
		{"bigdecimal", "x:0d0.1", func(t *testing.T, got any) {
			d, ok := got.(*Decimal)
			if !ok {
				t.Fatalf("bigdecimal generated as %T, want *Decimal", got)
			}
			if d.digits() != "0.1" {
				t.Fatalf("bigdecimal digits = %q, want %q", d.digits(), "0.1")
			}
		}},
		// An INTEGRAL bigdecimal is still a *Decimal, not a *big.Int: the
		// `0d` prefix names the family, the source form names the leaf.
		{"bigdecimal-integral", "x:0d1e3", func(t *testing.T, got any) {
			d, ok := got.(*Decimal)
			if !ok {
				t.Fatalf("integral bigdecimal generated as %T, want *Decimal", got)
			}
			if d.digits() != "1000.0" {
				t.Fatalf("integral bigdecimal digits = %q, want %q", d.digits(), "1000.0")
			}
		}},
		// The value that motivated the whole tower: exact above 2^53,
		// where a float64 would silently hold …992.
		{"biginteger-above-pow53", "x:0d9007199254740993", func(t *testing.T, got any) {
			n, ok := got.(*big.Int)
			if !ok {
				t.Fatalf("biginteger generated as %T, want *big.Int", got)
			}
			if n.String() != "9007199254740993" {
				t.Fatalf("biginteger value = %v, want 9007199254740993", n)
			}
		}},
		{"negated-biginteger", "x:-0d5", func(t *testing.T, got any) {
			n, ok := got.(*big.Int)
			if !ok {
				t.Fatalf("negated biginteger generated as %T, want *big.Int", got)
			}
			if n.Int64() != -5 {
				t.Fatalf("negated biginteger = %v, want -5", n)
			}
		}},
		// An exact SUM keeps the leaf too: the native type follows the
		// value, not the syntax that produced it.
		{"exact-sum", "x:0d0.1+0d0.2", func(t *testing.T, got any) {
			d, ok := got.(*Decimal)
			if !ok {
				t.Fatalf("exact sum generated as %T, want *Decimal", got)
			}
			if d.digits() != "0.3" {
				t.Fatalf("exact sum digits = %q, want %q", d.digits(), "0.3")
			}
		}},
	}

	a := New()
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			out, err := a.Generate(c.src)
			if err != nil {
				t.Fatalf("generate error: %v\n src: %q", err, c.src)
			}
			m, ok := out.(map[string]any)
			if !ok {
				t.Fatalf("generated %T, want map[string]any", out)
			}
			c.check(t, m["x"])
		})
	}
}

// TestGenerateExactTypesNested pins the same types inside containers:
// generation is recursive, so a list element and a nested map value must
// carry the exact pointer types too.
func TestGenerateExactTypesNested(t *testing.T) {
	out, err := New().Generate("x:[0d1,0d2.5]\ny:{z:0d7}")
	if err != nil {
		t.Fatalf("generate error: %v", err)
	}
	m := out.(map[string]any)

	list, ok := m["x"].([]any)
	if !ok {
		t.Fatalf("list generated as %T, want []any", m["x"])
	}
	if _, ok := list[0].(*big.Int); !ok {
		t.Fatalf("list element 0 is %T, want *big.Int", list[0])
	}
	if _, ok := list[1].(*Decimal); !ok {
		t.Fatalf("list element 1 is %T, want *Decimal", list[1])
	}

	inner, ok := m["y"].(map[string]any)
	if !ok {
		t.Fatalf("nested map generated as %T, want map[string]any", m["y"])
	}
	if _, ok := inner["z"].(*big.Int); !ok {
		t.Fatalf("nested value is %T, want *big.Int", inner["z"])
	}
}

func TestGeneratedBigIntegerIsACopy(t *testing.T) {
	a := New()
	vars := map[string]Val{"n": NewBigInteger(big.NewInt(5))}

	out, err := a.GenerateVars("x:$n", vars)
	if err != nil {
		t.Fatalf("generate error: %v", err)
	}
	got := out.(map[string]any)["x"].(*big.Int)
	got.SetInt64(99)

	out2, err := a.GenerateVars("x:$n", vars)
	if err != nil {
		t.Fatalf("generate error: %v", err)
	}
	again := out2.(map[string]any)["x"].(*big.Int)
	if again.Int64() != 5 {
		t.Fatalf("mutating a generated value changed the source value: got %v, want 5", again)
	}
}

// TestExactValuesMarshalAsRawDigits pins the JSON half of D9: an exact
// value reaches JSON as exact DIGITS in a raw JSON number, never as a
// string, an object, or a rounded float.
func TestExactValuesMarshalAsRawDigits(t *testing.T) {
	cases := []struct{ name, src, want string }{
		{"bigint", "x:0d5", `{"x":5}`},
		// 2^53+1 — the value a float64 cannot hold, and the reason the
		// exact leaves exist.
		{"bigint-above-pow53", "x:0d9007199254740993", `{"x":9007199254740993}`},
		{"bigint-huge", "x:0d123456789012345678901234567890",
			`{"x":123456789012345678901234567890}`},
		{"bigdecimal", "x:0d0.1", `{"x":0.1}`},
		// The `.0` survives into JSON. It is not canon's `0d` marker (that
		// is Aontu syntax and has no place in JSON), it is the digits the
		// value has: an integral bigdecimal is a decimal.
		{"bigdecimal-integral", "x:0d1e3", `{"x":1000.0}`},
		{"bigdecimal-negative", "x:-0d1.5", `{"x":-1.5}`},
	}

	a := New()
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			out, err := a.Generate(c.src)
			if err != nil {
				t.Fatalf("generate error: %v\n src: %q", err, c.src)
			}
			b, err := json.Marshal(out)
			if err != nil {
				t.Fatalf("marshal error: %v", err)
			}
			if string(b) != c.want {
				t.Fatalf("marshal mismatch\n src:  %q\n want: %s\n got:  %s",
					c.src, c.want, string(b))
			}
		})
	}
}

func TestCLIMarshalIndentKeepsExactDigits(t *testing.T) {
	out, err := New().Generate("a:0d9007199254740993\nb:0d1e3\nc:0d0.1")
	if err != nil {
		t.Fatalf("generate error: %v", err)
	}
	b, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	want := "{\n  \"a\": 9007199254740993,\n  \"b\": 1000.0,\n  \"c\": 0.1\n}"
	if string(b) != want {
		t.Fatalf("CLI rendering mismatch\n want: %s\n got:  %s", want, string(b))
	}
}

func TestNonPointerBigIntMarshalsAsObject(t *testing.T) {
	b, err := json.Marshal(map[string]any{"x": *big.NewInt(5)})
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	if string(b) != `{"x":{}}` {
		t.Fatalf("expected a non-pointer big.Int to marshal as an empty object, got %s", string(b))
	}
}

func TestDecimalMarshalJSONIsPlainDigits(t *testing.T) {
	cases := []struct {
		coeff int64
		scale int32
		want  string
	}{
		{15, 1, "1.5"},
		{-15, 1, "-1.5"},
		{1, 1, "0.1"},
		{1, -3, "1000.0"},
		{0, 1, "0.0"},
		{1, 20, "0.00000000000000000001"}, // plain form, not 1e-20
	}
	for _, c := range cases {
		d := newDecimal(big.NewInt(c.coeff), c.scale)
		b, err := d.MarshalJSON()
		if err != nil {
			t.Fatalf("MarshalJSON error: %v", err)
		}
		if string(b) != c.want {
			t.Fatalf("MarshalJSON(%d,%d) = %s, want %s", c.coeff, c.scale, string(b), c.want)
		}
		if strings.ContainsAny(string(b), "eE") {
			t.Fatalf("MarshalJSON(%d,%d) = %s, want plain form", c.coeff, c.scale, string(b))
		}
		// A raw JSON number, not a string and not an object: it must
		// decode as a number.
		var back any
		if err := json.Unmarshal(b, &back); err != nil {
			t.Fatalf("emitted %s is not valid JSON: %v", string(b), err)
		}
		if _, ok := back.(float64); !ok {
			t.Fatalf("emitted %s decodes as %T, want a JSON number", string(b), back)
		}
	}
}

// TestLossyIntegerLiteralRefused pins D7 at the API level, alongside the
// spec rows: the refusal is about EXACTNESS, not magnitude.
func TestLossyIntegerLiteralRefused(t *testing.T) {
	refused := []struct{ name, src string }{
		{"pow53-plus-one", "x:9007199254740993"},
		// 0x7fffffffffffffff LOOKS like the largest int64, and is: it is
		// refused because a binary64 rounds it UP to 2^63.
		{"int64-max-hex", "x:0x7fffffffffffffff"},
		{"pow64-minus-one-hex", "x:0xffffffffffffffff"},
		// The separator rule and D7 are independent: stripping the
		// separators leaves the same lossy value.
		{"separated-hex", "x:0xff_ffffffffffffff"},
		{"octal", "x:0o777777777777777777777"},
		{"decimal-exponent", "x:1e23"},
	}
	for _, c := range refused {
		t.Run("refused/"+c.name, func(t *testing.T) {
			_, err := New().Generate(c.src)
			if err == nil {
				t.Fatalf("expected a refusal for %q", c.src)
			}
			if !strings.Contains(err.Error(), "exactly representable") {
				t.Fatalf("error does not give the reason: %v", err)
			}
			if !strings.Contains(err.Error(), "0d") {
				t.Fatalf("error does not name the 0d escape: %v", err)
			}
		})
	}

	// Exact literals of any size are still values. 2^124 is the case the
	// design got wrong before the arithmetic was checked: it is a power
	// of two, so a binary64 holds it exactly however long it looks.
	kept := []struct{ name, src string }{
		{"pow53", "x:9007199254740992"},
		{"pow124-hex", "x:0x10000000000000000000000000000000"},
		{"pow20-decimal", "x:100000000000000000000"},
		{"exp21", "x:1e21"},
		{"underflow", "x:1e-400"},
		{"escape-hatch", "x:0d9007199254740993"},
	}
	for _, c := range kept {
		t.Run("kept/"+c.name, func(t *testing.T) {
			if _, err := New().Generate(c.src); err != nil {
				t.Fatalf("expected %q to stay a value, got: %v", c.src, err)
			}
		})
	}
}

// TestLiteralAndSumAgreeOnExactness pins the shared predicate: a literal
// and a computed sum must refuse the SAME values, or a document could
// write a number one way and have it accepted, and the other way and
// have it refused.
func TestLiteralAndSumAgreeOnExactness(t *testing.T) {
	sumErr := func(src string) error {
		_, err := New().Generate(src)
		return err
	}
	if err := sumErr("x:4503599627370496+4503599627370497"); err == nil {
		t.Fatalf("expected the inexact sum to be refused")
	}
	if err := sumErr("x:9007199254740993"); err == nil {
		t.Fatalf("expected the same value as a literal to be refused")
	}

	pow53 := big.NewInt(9007199254740992)
	pow53Plus1 := new(big.Int).Add(pow53, big.NewInt(1))
	pow20, _ := new(big.Int).SetString("100000000000000000000", 10)
	pow124 := new(big.Int).Lsh(big.NewInt(1), 124)
	int64Max := big.NewInt(9223372036854775807)

	if !isExactInBinary64(pow53) || !isIntegerStorable(pow53) {
		t.Fatalf("2^53 must be exact and storable")
	}
	if isExactInBinary64(pow53Plus1) || isIntegerStorable(pow53Plus1) {
		t.Fatalf("2^53+1 must be neither exact nor storable")
	}
	if isExactInBinary64(int64Max) || isIntegerStorable(int64Max) {
		t.Fatalf("2^63-1 rounds up to 2^63, so it is not exact")
	}
	if !isExactInBinary64(pow20) {
		t.Fatalf("10^20 must be exact")
	}
	if isIntegerStorable(pow20) {
		t.Fatalf("10^20 is exact but outside the int64 window, so not storable")
	}
	if !isExactInBinary64(pow124) {
		t.Fatalf("2^124 is a power of two, so it must be exact")
	}
}

func TestIntegerGeneratesAsInt64AtEveryMagnitude(t *testing.T) {
	cases := []struct {
		src  string
		want int64
		json string
	}{
		{"x:1", 1, `{"x":1}`},
		{"x:9007199254740991", 9007199254740991, `{"x":9007199254740991}`},
		{"x:9007199254740992", 9007199254740992, `{"x":9007199254740992}`},
		{"x:1152921504606846976", 1152921504606846976, `{"x":1152921504606846976}`},
		{"x:9223372036854774784", 9223372036854774784, `{"x":9223372036854774784}`},
		{"x:-1152921504606846976", -1152921504606846976, `{"x":-1152921504606846976}`},
		// D6's exact sum, the second route into the window above 2^53.
		{"x:576460752303423488+576460752303423488", 1152921504606846976,
			`{"x":1152921504606846976}`},
	}

	a := New()
	for _, c := range cases {
		t.Run(c.src, func(t *testing.T) {
			out, err := a.Generate(c.src)
			if err != nil {
				t.Fatalf("generate error: %v", err)
			}
			got := out.(map[string]any)["x"]
			n, ok := got.(int64)
			if !ok {
				t.Fatalf("integer generated as %T, want int64", got)
			}
			if n != c.want {
				t.Fatalf("value = %d, want %d", n, c.want)
			}
			b, err := json.Marshal(out)
			if err != nil {
				t.Fatalf("marshal: %v", err)
			}
			if string(b) != c.json {
				t.Fatalf("json = %s, want %s", b, c.json)
			}
		})
	}
}

// THE ARMS NO DOCUMENT REACHES: a meet that differs in these ways
// fails in trialUnify first, so sameKids never sees it through a
// document, and the walk is held to its own answer here.
func TestSameKidsDeclinesWhatDiffers(t *testing.T) {
	one := newString("x")
	two := newString("y")

	if !sameKids(nil, nil) {
		t.Error("two absent members differ")
	}
	if sameKids(nil, one) || sameKids(one, nil) {
		t.Error("an absent member matched a present one")
	}

	am := newMap()
	am.set("k", one)
	bm := newMap()
	bm.set("k", two)
	if sameKids(am, bm) {
		t.Error("a differing child matched")
	}
	cm := newMap()
	cm.set("other", one)
	if sameKids(am, cm) {
		t.Error("a different key of the same count matched")
	}

	if sameKids(newList([]Val{one}), newList([]Val{one, two})) {
		t.Error("lists of different lengths matched")
	}
	if sameKids(newList([]Val{one}), newList([]Val{two})) {
		t.Error("a differing element matched")
	}
}
