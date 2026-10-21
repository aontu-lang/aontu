import Aontu.Data

namespace Aontu

/-! # Arithmetic

The functions on numbers a call computes, by the tower's rules: an
integer with an integer is an integer, exact, and no value where the
exact answer is not one the leaf holds; anything with a float is a
float, the double nearest the exact answer; a float with an exact big
number is no value; and otherwise the widest exact leaf of the two,
exact, a big decimal within the exactness budget and never divided. A
zero divisor gives no value in every leaf. The folds read a bag's
members: `sum` adds them from the left, from the integer zero, and
`least` and `greatest` answer the first of them no other is below or
above, by exact value. -/

/-- The functions on numbers, the folds on a bag of them, `+`, `join`,
`pick`, `sort`, `upper` and `lower`. -/
inductive Fn where
  | add | sub | mul | div | mod | rem | neg
  | sum | least | greatest
  | plus | join | pick | sort | upper | lower
  deriving DecidableEq, Repr

/-- Whether a function folds the members of one bag. -/
def Fn.folds : Fn → Bool
  | .sum | .least | .greatest => true
  | _ => false

/-- The float zero, which aontu holds unsigned. -/
def Float.zero : Float := ⟨false, 0, 0, by decide, by decide, fun h => nomatch h⟩

/-- `n / d` rounded to the nearest whole number, a tie to the even one,
for a positive `d`. -/
def roundHalfEven (n : ℕ) (d : ℕ) : ℕ :=
  let q := n / d
  let r := n % d
  if 2 * r < d then q else if d < 2 * r then q + 1 else if q % 2 = 0 then q else q + 1

/-- The double nearest `a / d`, for a positive `d`, a tie to the even
significand; none where it overflows binary64. Zero, and a value that
rounds to zero, is the positive zero. -/
def Float.nearest (a : ℤ) (d : ℕ) : Option Float :=
  if a = 0 ∨ d = 0 then some Float.zero else
  let neg := decide (a < 0)
  let n := a.natAbs
  -- The exponent puts the significand of `n / d` in `[2 ^ 52, 2 ^ 53)`,
  -- found from the bit lengths and corrected by one either way.
  let e₀ : ℤ := (bitLen 4200 n : ℤ) - bitLen 4200 d - 53
  let scaled (e : ℤ) : ℕ × ℕ :=
    if 0 ≤ e then (n, d * 2 ^ e.toNat) else (n * 2 ^ (-e).toNat, d)
  let e₁ : ℤ :=
    let (p, q) := scaled e₀
    if 2 ^ 53 * q ≤ p then e₀ + 1 else if p < 2 ^ 52 * q then e₀ - 1 else e₀
  let e := max e₁ (-1074)
  let (p, q) := scaled e
  let m := roundHalfEven p q
  let (m, e) := if m = 2 ^ 53 then (2 ^ 52, e + 1) else (m, e)
  if m = 0 then some Float.zero else
  let (exp, frac) := if 2 ^ 52 ≤ m then ((e + 1075).toNat, m - 2 ^ 52) else (0, m)
  if h₁ : exp < 2047 then
    if h₂ : frac < 2 ^ 52 then
      if h₃ : neg = true → exp ≠ 0 ∨ frac ≠ 0 then some ⟨neg, exp, frac, h₁, h₂, h₃⟩
      else none
    else none
  else none

/-- `n` as a number of the `integer` leaf, where the leaf holds it. -/
def Number.ofIntegerLeaf (n : ℤ) : Option Number :=
  if h : IntegerLeaf n then some (.integer ⟨n, h⟩) else none

/-- A function on whole numbers: division truncates toward zero, `rem`
takes the dividend's sign and `mod` the divisor's. -/
def Fn.onInts : Fn → ℤ → ℤ → Option ℤ
  | .add, a, b => some (a + b)
  | .sub, a, b => some (a - b)
  | .mul, a, b => some (a * b)
  | .div, a, b => if b = 0 then none else some (a.tdiv b)
  | .rem, a, b => if b = 0 then none else some (a.tmod b)
  | .mod, a, b => if b = 0 then none else some (a.fmod b)
  | _, _, _ => none

/-- A function on exact fractions `(n, d)`, `d` positive, as the
operation on their values. -/
def Fn.onFracs : Fn → ℤ × ℕ → ℤ × ℕ → Option (ℤ × ℕ)
  | .add, (a, b), (c, d) => some (a * d + c * b, b * d)
  | .sub, (a, b), (c, d) => some (a * d - c * b, b * d)
  | .mul, (a, b), (c, d) => some (a * c, b * d)
  | .div, (a, b), (c, d) =>
    if c = 0 then none else some (if 0 < c then a * d else -(a * d), b * c.natAbs)
  | .rem, (a, b), (c, d) =>
    if c = 0 then none else
    let q := (a * d).tdiv (b * c)
    some (a * d - c * q * b, b * d)
  | .mod, (a, b), (c, d) =>
    if c = 0 then none else
    let q := (a * d).fdiv (b * c)
    some (a * d - c * q * b, b * d)
  | _, _, _ => none

/-- The big decimal `c * 10 ^ (-s)` with its trailing zeros dropped, the
one each value has. -/
def BigDecimal.normal (c s : ℤ) : BigDecimal :=
  go c s c.natAbs
where
  go (c s : ℤ) : ℕ → BigDecimal
    | 0 => if h : c % 10 ≠ 0 ∨ (c = 0 ∧ s = 0) then ⟨c, s, h⟩ else ⟨0, 0, .inr ⟨rfl, rfl⟩⟩
    | fuel + 1 =>
      if c = 0 then ⟨0, 0, .inr ⟨rfl, rfl⟩⟩
      else if h : c % 10 ≠ 0 then ⟨c, s, .inl h⟩
      else go (c / 10) (s - 1) fuel

/-- A big decimal within the exactness budget: at most 4096 coefficient
digits and a scale of at most 4096 either way. -/
def BigDecimal.inBudget (x : BigDecimal) : Bool :=
  ndigits x.coef.natAbs ≤ 4096 && x.scale.natAbs ≤ 4096

/-- A number's exact value as a big decimal, for the exact leaves. -/
def Number.toDecimal : Number → BigDecimal
  | .integer x => BigDecimal.normal x.value 0
  | .biginteger x => BigDecimal.normal x.value 0
  | .bigdecimal x => x
  | .float _ => BigDecimal.normal 0 0

/-- A function on big decimals: exact, within the budget, and never a
division, which has no finite decimal form in general. -/
def Fn.onDecimals (f : Fn) (x y : BigDecimal) : Option BigDecimal :=
  let s := max x.scale y.scale
  let cx := x.coef * 10 ^ (s - x.scale).toNat
  let cy := y.coef * 10 ^ (s - y.scale).toNat
  let r? : Option BigDecimal := match f with
    | .add => some (BigDecimal.normal (cx + cy) s)
    | .sub => some (BigDecimal.normal (cx - cy) s)
    | .mul => some (BigDecimal.normal (x.coef * y.coef) (x.scale + y.scale))
    | _ => none
  r?.bind fun r => if r.inBudget then some r else none

/-- The float of the opposite sign; zero stays zero. -/
def Float.negate (x : Float) : Float :=
  if h : x.exp ≠ 0 ∨ x.frac ≠ 0 then ⟨!x.neg, x.exp, x.frac, x.exp_lt, x.frac_lt, fun _ => h⟩
  else x

/-- The value a function computes from two numbers, by the tower's
rules, or none. -/
def Number.binary (f : Fn) (x y : Number) : Option Number :=
  match x, y with
  | .integer a, .integer b => (f.onInts a.value b.value).bind Number.ofIntegerLeaf
  | .float _, .biginteger _ | .float _, .bigdecimal _
  | .biginteger _, .float _ | .bigdecimal _, .float _ => none
  | .float _, _ | _, .float _ =>
    (f.onFracs x.value y.value).bind fun r => (Float.nearest r.1 r.2).map .float
  | .bigdecimal _, _ | _, .bigdecimal _ =>
    (f.onDecimals x.toDecimal y.toDecimal).map .bigdecimal
  | _, _ => (f.onInts x.value.1 y.value.1).map fun n => .biginteger ⟨n⟩

/-- The value a function computes from its arguments, or none: an
argument outside its domain, the wrong number of them, a zero divisor,
or an answer no leaf of the tower holds. -/
def Number.arith : Fn → List Number → Option Number
  | .neg, [.integer a] => Number.ofIntegerLeaf (-a.value)
  | .neg, [.float a] => some (.float a.negate)
  | .neg, [.biginteger a] => some (.biginteger ⟨-a.value⟩)
  | .neg, [.bigdecimal a] => some (.bigdecimal (BigDecimal.normal (-a.coef) a.scale))
  | .neg, _ => none
  | f, [x, y] => Number.binary f x y
  | _, _ => none

/-- `sum`: the members added from the left, from the integer zero, each
step by `add`, so a step no leaf holds is no value. -/
def Number.sum (xs : List Number) : Option Number :=
  xs.foldlM (fun acc x => Number.binary .add acc x) (.integer ⟨0, by decide⟩)

/-- `least`: the first member no other is below; an empty bag has none. -/
def Number.least : List Number → Option Number
  | [] => none
  | x :: xs => some (xs.foldl (fun acc y => if y.lt acc then y else acc) x)

/-- `greatest`: the first member no other is above; an empty bag has none. -/
def Number.greatest : List Number → Option Number
  | [] => none
  | x :: xs => some (xs.foldl (fun acc y => if acc.lt y then y else acc) x)

/-- The value a fold computes from its bag's members, or none. -/
def Number.fold : Fn → List Number → Option Number
  | .sum, xs => Number.sum xs
  | .least, xs => Number.least xs
  | .greatest, xs => Number.greatest xs
  | _, _ => none

/-- A number rounded to a whole one in its own leaf, up to its ceiling or
down to its floor, exactly: an integer and a big integer stand as they
are, and a float's whole neighbour is a float, the zero unsigned. -/
def Number.round (up : Bool) (x : Number) : Option Number :=
  let k : ℤ :=
    if up then -((-x.value.1).fdiv x.value.2) else x.value.1.fdiv x.value.2
  match x with
  | .integer _ | .biginteger _ => some x
  | .float _ => (Float.nearest k 1).map .float
  | .bigdecimal _ => some (.bigdecimal (BigDecimal.normal k 0))

/-! ## A number as text

The text `+` writes for a number beside a string: an integer's digits,
a big decimal's with its point and one place after it at least, and a
float's as JavaScript writes a number, the shortest digits that read
back as it, plain where the point falls within twenty-one places and
in exponent form otherwise. -/

def zeros (n : ℕ) : String := String.mk (List.replicate n '0')

/-- A big decimal's digits, its point where its scale puts it. -/
def BigDecimal.text (x : BigDecimal) : String :=
  let sign := if x.coef < 0 then "-" else ""
  let ds := toString x.coef.natAbs
  if x.scale ≤ 0 then sign ++ ds ++ zeros x.scale.natAbs ++ ".0"
  else
    let s := x.scale.toNat
    if s < ds.length then sign ++ ds.take (ds.length - s) ++ "." ++ ds.drop (ds.length - s)
    else sign ++ "0." ++ zeros (s - ds.length) ++ ds

/-- A float's shortest digits, placed as JavaScript places them. -/
def Float.text (x : Float) : String :=
  let (c, k) := x.shortest
  if c = 0 then "0" else
  let sign := if c < 0 then "-" else ""
  let ds := toString c.natAbs
  let len : ℤ := ds.length
  let n := k + len
  if len ≤ n ∧ n ≤ 21 then sign ++ ds ++ zeros (n - len).toNat
  else if 0 < n ∧ n ≤ 21 then sign ++ ds.take n.toNat ++ "." ++ ds.drop n.toNat
  else if -6 < n ∧ n ≤ 0 then sign ++ "0." ++ zeros n.natAbs ++ ds
  else
    let e := n - 1
    let es := (if e < 0 then "-" else "+") ++ toString e.natAbs
    if ds.length = 1 then sign ++ ds ++ "e" ++ es
    else sign ++ ds.take 1 ++ "." ++ ds.drop 1 ++ "e" ++ es

def Number.text : Number → String
  | .integer x => toString x.value
  | .float x => x.text
  | .biginteger x => toString x.value
  | .bigdecimal x => x.text

end Aontu
