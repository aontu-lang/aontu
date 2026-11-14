import Aontu.Arith

/-!
# What is written

An output option says how a value is written where a document is
generated, and changes nothing the value admits. This module holds the
options the definition has reached. The first is `significant`, which
rounds a number to so many significant digits. The annotation that
carries an option to a value, `gen(spec)`, is not yet a term here.
-/

namespace Aontu

/-- The decimal a number shows, as `c * 10 ^ e`: a float's shortest
decimal, a big decimal's coefficient and scale, and a whole number's own
digits. -/
def Number.digits : Number → ℤ × ℤ
  | .integer x => (x.value, 0)
  | .float x => x.shortest
  | .biginteger x => (x.value, 0)
  | .bigdecimal x => (x.coef, -x.scale)

/-- The number `c * 10 ^ e` in the leaf of `x`: for a float the double
nearest it, and none where it overflows; exact in the exact leaves; and
for an integer the whole number itself, a big integer where the integer
leaf does not hold it. -/
def Number.inLeafOf (x : Number) (c e : ℤ) : Option Number :=
  match x with
  | .float _ =>
    (if 0 ≤ e then Float.nearest (c * 10 ^ e.toNat) 1
      else Float.nearest c (10 ^ (-e).toNat)).map .float
  | .bigdecimal _ => some (.bigdecimal (BigDecimal.normal c (-e)))
  | .biginteger _ => some (.biginteger ⟨c * 10 ^ e.toNat⟩)
  | .integer _ =>
    if h : IntegerLeaf (c * 10 ^ e.toNat) then some (.integer ⟨c * 10 ^ e.toNat, h⟩)
    else some (.biginteger ⟨c * 10 ^ e.toNat⟩)

/-- A number at no more than `n` significant digits, which is what
`gen({significant: n})` writes for it: the decimal it shows, its digits
past the `n`th dropped and what is left rounded to the nearest whole
number, a tie to the even one, in the number's own leaf. A number of
`n` digits or fewer stands as it is. -/
def Number.significant (n : ℕ) (x : Number) : Option Number :=
  if ndigits x.digits.1.natAbs ≤ n then some x
  else
    let drop := ndigits x.digits.1.natAbs - n
    let r : ℤ := roundHalfEven x.digits.1.natAbs (10 ^ drop)
    x.inLeafOf (if x.digits.1 < 0 then -r else r) (x.digits.2 + drop)

/-- A number of `n` digits or fewer stands as it is. -/
theorem Number.significant_of_le {n : ℕ} {x : Number} (h : ndigits x.digits.1.natAbs ≤ n) :
    x.significant n = some x := by
  unfold Number.significant
  exact if_pos h

/-- Every leaf but `float` holds the number asked of it. -/
theorem Number.inLeafOf_isSome (x : Number) (c e : ℤ) (h : ∀ f, x ≠ .float f) :
    (x.inLeafOf c e).isSome = true := by
  cases x with
  | float f => exact absurd rfl (h f)
  | integer i =>
    show (if h : IntegerLeaf (c * 10 ^ e.toNat)
      then some (Number.integer ⟨c * 10 ^ e.toNat, h⟩)
      else some (Number.biginteger ⟨c * 10 ^ e.toNat⟩)).isSome = true
    split <;> rfl
  | biginteger b => rfl
  | bigdecimal b => rfl

/-- Only a float has a rounding that its leaf does not hold. -/
theorem Number.significant_isSome (n : ℕ) (x : Number) (h : ∀ f, x ≠ .float f) :
    (x.significant n).isSome = true := by
  unfold Number.significant
  by_cases hd : ndigits x.digits.1.natAbs ≤ n
  · rw [if_pos hd]
    rfl
  · rw [if_neg hd]
    exact Number.inLeafOf_isSome x _ _ h

end Aontu
