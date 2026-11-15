/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"math/big"
	"sort"
	"strconv"
	"strings"
)

// roundHalfEven is the whole number nearest `c / 10 ^ drop`, a tie to
// the even one.
func roundHalfEven(c *big.Int, drop int) *big.Int {
	d := pow10(int64(drop))
	q, r := new(big.Int).QuoRem(c, d, new(big.Int))
	switch r.Lsh(r, 1).Cmp(d) {
	case -1:
		return q
	case 0:
		if 0 == q.Bit(0) {
			return q
		}
	}
	return q.Add(q, big.NewInt(1))
}

func genWrites(ctx *Ctx, opts map[string]any) bool {
	return nil != opts && (nil == ctx || !ctx.plain)
}

func genPlace(ctx *Ctx) []string {
	if nil == ctx {
		return nil
	}
	return ctx.at
}

func genPlaceOf(ctx *Ctx, v Val) []string {
	if at := genPlace(ctx); nil != at {
		return at
	}
	return v.vpath()
}

func genRefuse(ctx *Ctx, v Val, code string, details map[string]string) error {
	return residueErrAt(ctx, v, code, details, genPlaceOf(ctx, v))
}

// shown is the decimal a number shows, `c * 10 ^ e`: a float's is the
// shortest that reads back as it.
func shown(s *ScalarVal) (*big.Int, int) {
	switch s.kind {
	case KindBigDecimal:
		d := s.peg.(*Decimal)
		return d.coeff, -int(d.scale)
	case KindBigInteger:
		return s.peg.(*big.Int), 0
	case KindInteger:
		return big.NewInt(s.peg.(int64)), 0
	}
	f := s.peg.(float64)
	mant := strconv.FormatFloat(f, 'e', -1, 64)
	i := strings.IndexByte(mant, 'e')
	digits := strings.Replace(strings.TrimPrefix(mant[:i], "-"), ".", "", 1)
	exp, _ := strconv.Atoi(mant[i+1:])
	c, _ := new(big.Int).SetString(digits, 10)
	if f < 0 {
		c.Neg(c)
	}
	return c, exp - len(digits) + 1
}

// rounded rounds once, at whichever position keeps fewer digits: a second
// rounding of a rounded number can cross a tie the number never met.
func rounded(c *big.Int, e int, opts map[string]any) (*big.Int, int) {
	mag := new(big.Int).Abs(c)
	drop := int64(0)
	if n, ok := opts["significant"].(int64); ok && drop < int64(len(mag.String()))-n {
		drop = int64(len(mag.String())) - n
	}
	if n, ok := opts["places"].(int64); ok && drop < int64(-e)-n {
		drop = int64(-e) - n
	}
	if 0 == drop {
		return c, e
	}
	r := roundHalfEven(mag, int(drop))
	if c.Sign() < 0 {
		r.Neg(r)
	}
	return r, e + int(drop)
}

// inLeaf writes a float as the double nearest the decimal; held is false
// where there is none.
func inLeaf(s *ScalarVal, c *big.Int, e int) (out any, held bool) {
	switch s.kind {
	case KindBigDecimal:
		return newDecimal(c, int32(-e)), true
	case KindBigInteger:
		return new(big.Int).Mul(c, pow10(int64(e))), true
	case KindInteger:
		whole := new(big.Int).Mul(c, pow10(int64(e)))
		if whole.IsInt64() {
			return whole.Int64(), true
		}
		return whole, true
	}
	f, err := strconv.ParseFloat(c.String()+"e"+strconv.Itoa(e), 64)
	return f, nil == err
}

func fixed(c *big.Int, e int, places int) string {
	frac := max(0, -e)
	digits := new(big.Int).Abs(c).String()
	digits = strings.Repeat("0", max(0, frac+1-len(digits))) + digits + strings.Repeat("0", max(0, e))
	cut := len(digits) - frac
	out := digits[:cut]
	if c.Sign() < 0 {
		out = "-" + out
	}
	if 0 < places {
		out += "." + digits[cut:] + strings.Repeat("0", places-frac)
	}
	return out
}

func numberText(v any) string {
	switch n := v.(type) {
	case int64:
		return strconv.FormatInt(n, 10)
	case float64:
		return formatNumber(n)
	case *big.Int:
		return n.String()
	}
	return v.(*Decimal).String()
}

func writeNumber(ctx *Ctx, s *ScalarVal) (any, error) {
	c, e := shown(s)
	c, e = rounded(c, e, s.genopts)
	out, held := inLeaf(s, c, e)
	if !held {
		return nil, genRefuse(ctx, s, "float_overflow", nil)
	}
	if "string" != s.genopts["as"] {
		return out, nil
	}
	if n, ok := s.genopts["places"].(int64); ok {
		return fixed(c, e, int(n)), nil
	}
	return numberText(out), nil
}

// writePath resolves a relative address from where the value is
// generated; a link's is the one `relate()` resolved.
func writePath(ctx *Ctx, s *ScalarVal) (any, error) {
	text := s.peg.(string)
	form := s.genopts["form"]
	if "as-written" == form {
		return text, nil
	}
	addr, _ := parseAddress(text)
	if "key" == form {
		return addr.Parts[len(addr.Parts)-1], nil
	}
	target, ok := addressPath(addr, genPlaceOf(ctx, s))
	if "" != s.link {
		target, ok = strings.Split(s.link[2:], "."), true
	}
	if !ok {
		return nil, genRefuse(ctx, s, "gen_address", map[string]string{"addr": text})
	}
	if "pointer" == form {
		return "/" + strings.Join(target, "/"), nil
	}
	return "$." + strings.Join(target, "."), nil
}

// A null the record leaves out is told from JSON null by gensNull.
func genWrite(ctx *Ctx, s *ScalarVal) (any, error) {
	o := s.genopts
	switch s.kind {
	case KindString:
		text := s.peg.(string)
		switch {
		case "omit" == o["empty"] && "" == text:
			return nil, nil
		case "upper" == o["case"]:
			return caseUpper(text), nil
		case "lower" == o["case"]:
			return caseLower(text), nil
		}
		return text, nil
	case KindBoolean:
		b := s.peg.(bool)
		switch o["as"] {
		case "number":
			if b {
				return int64(1), nil
			}
			return int64(0), nil
		case "string":
			return strconv.FormatBool(b), nil
		}
		return b, nil
	case KindNull:
		return nil, nil
	case KindPath:
		return writePath(ctx, s)
	}
	return writeNumber(ctx, s)
}

// genWriteMap sorts by the key that is written, then by the key it came
// from, so the members and a clash's keys are in one order in both ports.
func genWriteMap(ctx *Ctx, m *MapVal, out map[string]any) (any, error) {
	if style, _ := m.genopts["keys"].(string); "as-written" != style {
		named := make([][2]string, 0, len(out))
		for k := range out {
			key, ok := nomStyleName(k, style, nil)
			if !ok {
				key = k
			}
			named = append(named, [2]string{key, k})
		}
		sort.Slice(named, func(i, j int) bool {
			if named[i][0] != named[j][0] {
				return named[i][0] < named[j][0]
			}
			return named[i][1] < named[j][1]
		})
		res := make(map[string]any, len(out))
		for i, pair := range named {
			if 0 < i && named[i-1][0] == pair[0] {
				return nil, genRefuse(ctx, m, "gen_key_clash",
					map[string]string{"written": pair[0], "a": named[i-1][1], "b": pair[1]})
			}
			res[pair[0]] = out[pair[1]]
		}
		out = res
	}
	if "omit" == m.genopts["empty"] && 0 == len(out) {
		return nil, nil
	}
	return out, nil
}
