/* Copyright (c) 2025 Richard Rodger, MIT License */

package aontu

import (
	"math"
	"math/big"
	"strings"
	"testing"
)


func TestDecimalNormalForm(t *testing.T) {
	cases := []struct {
		coeff int64
		scale int32
		want  string // digits(), i.e. canon without the marker
	}{
		{15, 1, "1.5"},    // already minimal
		{10, 2, "0.1"},    // trailing zero stripped
		{100, 3, "0.1"},   // repeatedly
		{1, -3, "1000.0"}, // negative scale folded into the coefficient
		{15, -1, "150.0"},
		{10, 1, "1.0"},    // never below one decimal place
		{1000, 0, "1000.0"},
		{0, 5, "0.0"},  // zero normalises to scale 1
		{0, -5, "0.0"},
		{-15, 1, "-1.5"},
		{1, 4, "0.0001"}, // padded past the point
	}
	for _, c := range cases {
		d := newDecimal(big.NewInt(c.coeff), c.scale)
		if got := d.digits(); got != c.want {
			t.Errorf("newDecimal(%d, %d).digits() = %q, want %q", c.coeff, c.scale, got, c.want)
		}
		if d.scale < 1 {
			t.Errorf("newDecimal(%d, %d) scale = %d, want >= 1", c.coeff, c.scale, d.scale)
		}
	}

	a := newDecimal(big.NewInt(10), 2)
	b := newDecimal(big.NewInt(1), 1)
	if a.scale != b.scale || a.coeff.Cmp(b.coeff) != 0 {
		t.Errorf("0d0.10 and 0d0.1 must share one normal form: %v vs %v", a, b)
	}
}

func TestDecimalInputNotMutated(t *testing.T) {
	n := big.NewInt(150)
	d := newDecimal(n, 2)
	if n.String() != "150" {
		t.Errorf("newDecimal mutated its argument: %s", n)
	}
	n.SetInt64(999)
	if got := d.digits(); got != "1.5" {
		t.Errorf("decimal aliased its argument: digits = %q", got)
	}

	m := big.NewInt(7)
	v := NewBigInteger(m).(*ScalarVal)
	m.SetInt64(8)
	if got := v.Canon(); got != "0d7" {
		t.Errorf("NewBigInteger aliased its argument: canon = %q", got)
	}
}

func TestExactIdentityIsValueNotPointer(t *testing.T) {
	big1 := newBigInteger(new(big.Int).SetInt64(5))
	big2 := newBigInteger(new(big.Int).SetInt64(5))
	if big1.peg == big2.peg {
		t.Fatal("test is vacuous: the two pegs are the same pointer")
	}
	if !scalarPegSame(KindBigInteger, big1.peg, big2.peg) {
		t.Error("two bigintegers of value 5 must be the same value")
	}
	if !valSame(big1, big2) {
		t.Error("valSame must compare biginteger VALUES, not addresses")
	}

	dec1 := newBigDecimal(newDecimal(big.NewInt(10), 2))
	dec2 := newBigDecimal(newDecimal(big.NewInt(1), 1))
	if dec1.peg == dec2.peg {
		t.Fatal("test is vacuous: the two pegs are the same pointer")
	}
	if !scalarPegSame(KindBigDecimal, dec1.peg, dec2.peg) {
		t.Error("0d0.10 and 0d0.1 are the same value")
	}
	if !valSame(dec1, dec2) {
		t.Error("valSame must compare bigdecimal VALUES, not addresses")
	}

	// Disjointness: same number, different leaf, never the same value.
	if scalarPegSame(KindBigInteger, big1.peg, dec1.peg) {
		t.Error("a biginteger peg must not match a bigdecimal peg")
	}
	if valSame(newBigInteger(big.NewInt(1)), newBigDecimal(newDecimal(big.NewInt(1), 1))) {
		t.Error("0d1 and 0d1.0 are distinct lattice points")
	}
	if valSame(newInteger(5), big1) {
		t.Error("5 and 0d5 are distinct lattice points")
	}
}

func TestDecimalCmp(t *testing.T) {
	cases := []struct {
		a, b *Decimal
		want int
	}{
		{newDecimal(big.NewInt(15), 1), newDecimal(big.NewInt(15), 1), 0},
		{newDecimal(big.NewInt(15), 1), newDecimal(big.NewInt(16), 1), -1},
		{newDecimal(big.NewInt(16), 1), newDecimal(big.NewInt(15), 1), 1},
		{&Decimal{coeff: big.NewInt(150), scale: 2}, &Decimal{coeff: big.NewInt(15), scale: 1}, 0},
		{&Decimal{coeff: big.NewInt(1), scale: 4}, &Decimal{coeff: big.NewInt(1), scale: 1}, -1},
		{newDecimal(big.NewInt(-15), 1), newDecimal(big.NewInt(15), 1), -1},
	}
	for i, c := range cases {
		if got := c.a.cmp(c.b); got != c.want {
			t.Errorf("case %d: cmp = %d, want %d", i, got, c.want)
		}
	}
}

func TestNegativeZeroNeverSurvives(t *testing.T) {
	if got := newDecimal(big.NewInt(0), 3).neg().digits(); got != "0.0" {
		t.Errorf("-0d0.0 digits = %q, want 0.0", got)
	}
	for src, want := range map[string]string{
		"x:-0d0":       `{"x":0d0}`,
		"x:-0d0.0":     `{"x":0d0.0}`,
		"x:-0d0.00e-3": `{"x":0d0.0}`,
	} {
		v, err := New().Unify(src)
		if err != nil {
			t.Fatalf("%s: %v", src, err)
		}
		if got := v.Canon(); got != want {
			t.Errorf("%s canon = %s, want %s", src, got, want)
		}
	}
}

func TestExactnessBudgetBoundary(t *testing.T) {
	d4095 := strings.Repeat("9", decimalMaxCoeffDigits-1)
	ok := []string{
		"x:0d" + d4095 + ".9",
		"x:0d1e-" + itoa(decimalMaxScale),
		"x:0d1e" + itoa(decimalMaxScale),  // and at the negative bound
	}
	for _, src := range ok {
		if _, err := New().Unify(src); err != nil {
			t.Errorf("%.20s… should be inside the budget: %v", src, err)
		}
	}

	bad := []string{
		"x:0d" + d4095 + ".99",
		"x:0d" + strings.Repeat("0", decimalMaxCoeffDigits) + ".1", // padding counts too
		"x:0d1e-" + itoa(decimalMaxScale+1),
		"x:0d1e" + itoa(decimalMaxScale+1),
		"x:0d1e1000000000",                       // the one-digit scale bomb
		"x:0d1e99999999999999999999999999999999", // and an exponent past int64
	}
	for _, src := range bad {
		_, err := New().Generate(src)
		if err == nil {
			t.Errorf("%.20s… should be refused by the budget", src)
			continue
		}
		if !strings.Contains(err.Error(), "exceeds the exactness budget") {
			t.Errorf("%.20s… error = %q, want the budget hint", src, err)
		}
	}

	// A BIGINTEGER has no scale, so the budget does not apply to it: an
	// exact integer of any length the source can hold is representable.
	v, err := New().Unify("x:0d" + strings.Repeat("7", decimalMaxCoeffDigits+100))
	if err != nil {
		t.Fatalf("long biginteger: %v", err)
	}
	if got := v.Canon(); !strings.HasPrefix(got, `{"x":0d777`) {
		t.Errorf("long biginteger canon = %.20s…", got)
	}
}

func TestNewBigConstructors(t *testing.T) {
	huge, _ := new(big.Int).SetString("123456789012345678901234567890", 10)
	if got := NewBigInteger(huge).Canon(); got != "0d123456789012345678901234567890" {
		t.Errorf("NewBigInteger canon = %q", got)
	}
	if got := NewBigInteger(nil).Canon(); got != "0d0" {
		t.Errorf("NewBigInteger(nil) canon = %q, want 0d0", got)
	}
	if got := NewBigInteger(big.NewInt(-5)).Canon(); got != "-0d5" {
		t.Errorf("NewBigInteger(-5) canon = %q, want -0d5", got)
	}

	for in, want := range map[string]string{
		"1.5":   "0d1.5",
		"0.10":  "0d0.1",
		"1e-1":  "0d0.1",
		"1e3":   "0d1000.0",
		"-1.5":  "-0d1.5",
		"+1.5":  "0d1.5",
		"-0.0":  "0d0.0",
		"5":     "0d5.0",
		"0d1e3": "0d1000.0", // the marker is optional, not forbidden
		"0D5":   "0d5.0",
	} {
		v, err := NewBigDecimal(in)
		if err != nil {
			t.Errorf("NewBigDecimal(%q): %v", in, err)
			continue
		}
		if got := v.Canon(); got != want {
			t.Errorf("NewBigDecimal(%q) canon = %q, want %q", in, got, want)
		}
		if sv := v.(*ScalarVal); sv.kind != KindBigDecimal {
			t.Errorf("NewBigDecimal(%q) kind = %s", in, sv.kind)
		}
	}

	// Separators are literal syntax, not part of a number's text, so the
	// API refuses them (mirroring Decimal.fromString in the TS port).
	for _, in := range []string{"", "1.2.3", "1_000", "1_", "abc", "0x4", "1.5x", ".5", "0d"} {
		if v, err := NewBigDecimal(in); err == nil {
			t.Errorf("NewBigDecimal(%q) should fail, got %s", in, v.Canon())
		}
	}
	if _, err := NewBigDecimal("1e1000000000"); err == nil ||
		!strings.Contains(err.Error(), "exceeds the exactness budget") {
		t.Errorf("NewBigDecimal must apply the budget, got %v", err)
	}

	// The constructed values are ordinary lattice points: they unify by
	// value with the literals that spell them.
	out, err := New().UnifyVars("x:$n & 0d1.5", map[string]Val{"n": mustDecimal(t, "0.150e1")})
	if err != nil {
		t.Fatalf("constructed value against a literal: %v", err)
	}
	if got := out.Canon(); got != `{"x":0d1.5}` {
		t.Errorf("canon = %s", got)
	}
}

func mustDecimal(t *testing.T, s string) Val {
	t.Helper()
	v, err := NewBigDecimal(s)
	if err != nil {
		t.Fatalf("NewBigDecimal(%q): %v", s, err)
	}
	return v
}

func TestExactLiteralDoesNotDisturbOrdinaryNumbers(t *testing.T) {
	for src, want := range map[string]string{
		"x:1.5":            `{"x":1.5}`,
		"x:0x1f":           `{"x":31}`,
		"x:0b1010":         `{"x":10}`,
		"x:1e3":            `{"x":1000}`,
		"x:1_000":          `{"x":1000}`,
		"a:{b:1}\nx:$.a.b": `{"a":{"b":1},"x":1}`,
		// The literal claims a trailing `.` only when a digit follows, so
		// `0d1` here is a biginteger and the rest is ordinary grammar.
		"x:[0d1,0d2]": `{"x":[0d1,0d2]}`,
		"x:0d1&0d1":   `{"x":0d1}`,
	} {
		v, err := New().Unify(src)
		if err != nil {
			t.Fatalf("%q: %v", src, err)
		}
		if got := v.Canon(); got != want {
			t.Errorf("%q canon = %s, want %s", src, got, want)
		}
	}
}

func TestCanonRoundTrips(t *testing.T) {
	for _, lit := range []string{
		"0d5", "0d0", "-0d5", "0d1.5", "-0d1.5", "0d0.10",
		"0d1e3", "0d1.5e2", "0d1e-1", "0d1000.0", "0d0.0001",
		"0d123456789012345678901234567890",
	} {
		v, err := New().Unify("x:" + lit)
		if err != nil {
			t.Fatalf("%q: %v", lit, err)
		}
		canon := v.Canon()
		// The canon of the whole map is itself valid source (JSON
		// superset), so reparsing it must reproduce the same text.
		again, err := New().Unify(canon)
		if err != nil {
			t.Fatalf("reparse %q: %v", canon, err)
		}
		if got := again.Canon(); got != canon {
			t.Errorf("%q: canon %s reparsed to %s", lit, canon, got)
		}
		clit := strings.TrimSuffix(strings.TrimPrefix(canon, `{"x":`), `}`)
		joint, err := New().Unify("x:" + lit + " & " + clit)
		if err != nil {
			t.Errorf("%q & its own canon %q: %v", lit, clit, err)
			continue
		}
		if got := joint.Canon(); got != canon {
			t.Errorf("%q & its own canon = %s, want %s", lit, got, canon)
		}
	}
}


// TestDecimalAddIsExact pins the addition itself: align the scales, add
// the coefficients, renormalise. No rounding, at any scale difference.
func TestDecimalAddIsExact(t *testing.T) {
	cases := []struct{ a, b, want string }{
		{"0.1", "0.2", "0.3"},   // the headline: not 0.30000000000000004
		{"1.5", "1.5", "3.0"},   // integral results keep one decimal place
		{"0.25", "0.75", "1.0"},
		{"1.0", "-1.0", "0.0"},  // and zero is the one normal zero
		{"1e-10", "1", "1.0000000001"},
		{"1234567890123456789012345678901234.5", "0.5", "1234567890123456789012345678901235.0"},
	}
	for _, c := range cases {
		a := mustDecimal(t, c.a).(*ScalarVal).peg.(*Decimal)
		b := mustDecimal(t, c.b).(*ScalarVal).peg.(*Decimal)
		if got := a.add(b).digits(); got != c.want {
			t.Errorf("%s + %s = %s, want %s", c.a, c.b, got, c.want)
		}
		// Addition is commutative, and the normal form makes that
		// testable as text equality.
		if got := b.add(a).digits(); got != c.want {
			t.Errorf("%s + %s = %s, want %s", c.b, c.a, got, c.want)
		}
	}
}

func TestExactLadderPromotion(t *testing.T) {
	for src, want := range map[string]string{
		"x:0d5+-0d2":        `{"x":0d3}`,   // stays a biginteger
		"x:0d1+0d2+0d3":     `{"x":0d6}`,   // and chains
		"x:1+0d2+0d0.5":     `{"x":0d3.5}`, // promoting once more mid-chain
		"x:0d2.5+0d2.5":     `{"x":0d5.0}`, // an integral bigdecimal keeps its place
		"x:0d0.5+-0d0.5":    `{"x":0d0.0}`,
		"x:pref(0d5)+0d1":   `{"x":0d6}`, // a pref contributes its value's kind
		"x:0d5+0d0":         `{"x":0d5}`,
		"x:0d0.1+0d0":       `{"x":0d0.1}`,
		"x:(0d1|0d2) & 0d1": `{"x":0d1}`,
		"x:0d99999999999999999999999999999999+0d1": `{"x":0d100000000000000000000000000000000}`,
	} {
		v, err := New().Unify(src)
		if err != nil {
			t.Fatalf("%q: %v", src, err)
		}
		if got := v.Canon(); got != want {
			t.Errorf("%q canon = %s, want %s", src, got, want)
		}
	}
}

func TestIntegerSumStorageContract(t *testing.T) {
	ok := []struct {
		x, y int64
		want int64
	}{
		{1, 2, 3},
		{-2, 3, 1},
		{1 << 52, 1 << 52, 1 << 53},
		{(1 << 53) - 1, 1, 1 << 53},
		{-(1 << 53), 0, -(1 << 53)},
		{math.MinInt64, 0, math.MinInt64},  // -2^63 is exactly representable
		{math.MinInt64 / 2, 0, -(1 << 62)},
	}
	for _, c := range ok {
		out := integerPlus(nil, newPlusOp(newInteger(c.x), newInteger(c.y)), newInteger(c.x), newInteger(c.y))
		sv, is := out.(*ScalarVal)
		if !is || sv.kind != KindInteger {
			t.Errorf("%d+%d = %s, want an integer", c.x, c.y, out.Canon())
			continue
		}
		if got := sv.peg.(int64); got != c.want {
			t.Errorf("%d+%d = %d, want %d", c.x, c.y, got, c.want)
		}
	}

	bad := [][2]int64{
		{1 << 52, (1 << 52) + 1},             // 2^53+1: exact, but not in binary64
		{math.MaxInt64, 1},                   // wraps: the checked add catches it
		{math.MaxInt64, math.MaxInt64},
		{math.MinInt64, -1},                  // and in the other direction
		{math.MinInt64, math.MinInt64},       // a wrap that lands exactly on 0
		{1 << 62, 1 << 62},
		{math.MaxInt64 - 1, 0},               // in range, but binary64 rounds it up
		{4503599627370496, 4503599627370497}, // the spec row, at the boundary
	}
	for _, c := range bad {
		out := integerPlus(nil, newPlusOp(newInteger(c[0]), newInteger(c[1])), newInteger(c[0]), newInteger(c[1]))
		nv, isnil := out.(*NilVal)
		if !isnil {
			t.Errorf("%d+%d = %s, want a located error", c[0], c[1], out.Canon())
			continue
		}
		if !strings.Contains(nv.Message(), "exactly representable") {
			t.Errorf("%d+%d error = %q, want the storage-contract hint", c[0], c[1], nv.Message())
		}
	}
}

func TestExactPlusRefusals(t *testing.T) {
	for _, src := range []string{
		"x:1.0+0d2", "x:0d2+1.0", "x:1.0+0d0.5", "x:0d0.5+1.0",
		"x:0d1e3+1.5", "x:-0d5+0.0",
	} {
		_, err := New().Generate(src)
		if err == nil {
			t.Errorf("%q must refuse the float mix", src)
			continue
		}
		if !strings.Contains(err.Error(), "cannot mix") {
			t.Errorf("%q error = %q, want the mix refusal", src, err)
		}
	}

	for _, src := range []string{
		"x:0d5+true", "x:0d5+null", "x:0d5+any", "x:0d5+integer",
		"x:true+0d0.5", "x:0d5+[1]",
	} {
		if _, err := New().Generate(src); err == nil {
			t.Errorf("%q must not resolve", src)
		}
	}
}

func TestExactBudgetAppliesToResults(t *testing.T) {
	src := "x:0d1e-" + itoa(decimalMaxScale) + "+0d1e" + itoa(decimalMaxScale)
	_, err := New().Generate(src)
	if err == nil {
		t.Fatalf("%.20s… must exceed the budget", src)
	}
	if !strings.Contains(err.Error(), "exceeds the exactness budget") {
		t.Errorf("%.20s… error = %.120q, want the budget refusal", src, err)
	}

	// The biginteger leaf has no scale and therefore no budget: an exact
	// integer sum of any length is representable.
	long := strings.Repeat("9", decimalMaxCoeffDigits+100)
	v, err := New().Unify("x:0d" + long + "+0d1")
	if err != nil {
		t.Fatalf("long biginteger sum: %v", err)
	}
	if got := v.Canon(); !strings.HasPrefix(got, `{"x":0d1000`) ||
		len(got) != len(long)+len(`{"x":0d}`)+1 {
		t.Errorf("long biginteger sum canon = %.30s… (len %d)", got, len(got))
	}
}

func TestUpperLowerExactLeaves(t *testing.T) {
	for src, want := range map[string]string{
		"x:upper(0d1.1)":  `{"x":0d2.0}`,
		"x:lower(0d1.9)":  `{"x":0d1.0}`,
		"x:upper(0d2.0)":  `{"x":0d2.0}`, // already integral: no step
		"x:lower(0d2.0)":  `{"x":0d2.0}`,
		"x:upper(-0d1.1)": `{"x":-0d1.0}`, // truncation IS the ceiling here
		"x:lower(-0d1.1)": `{"x":-0d2.0}`,
		"x:upper(0d0.5)":  `{"x":0d1.0}`,
		"x:lower(0d0.5)":  `{"x":0d0.0}`,
		"x:lower(-0d0.5)": `{"x":-0d1.0}`,
		"x:upper(0d5)":    `{"x":0d5}`, // an exact integer is its own ceiling
		"x:lower(-0d5)":   `{"x":-0d5}`,
		// The exactness is the point: a value no binary64 can hold keeps
		// every digit through the ceiling.
		"x:lower(0d123456789012345678901234567890.9)": `{"x":0d123456789012345678901234567890.0}`,
		"x:upper(0d123456789012345678901234567890.1)": `{"x":0d123456789012345678901234567891.0}`,
	} {
		v, err := New().Unify(src)
		if err != nil {
			t.Fatalf("%q: %v", src, err)
		}
		if got := v.Canon(); got != want {
			t.Errorf("%q canon = %s, want %s", src, got, want)
		}
	}
}
