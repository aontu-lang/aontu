import Aontu.Arith

/-!
# What is written

An output option says how a value is written where a document is
generated, and changes nothing the value admits. This module holds the
options the definition has reached, which are a number's: `significant`
rounds it to so many significant digits, `places` to so many digits
after the point, and `as: "string"` writes its digits as text. The
annotation that carries an option to a value, `gen(spec)`, is not yet a
term here, and the options of the other types wait for it.
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

/-- How many digits a rounding drops from the decimal a number shows:
enough to leave `sig` significant digits, or `places` digits after the
point, whichever is more. A record that gives both is answered by one
rounding, since a number rounded a second time can cross a tie it never
met. -/
def Number.dropOf (sig places : Option ℕ) (x : Number) : ℕ :=
  max (sig.elim 0 fun n => ndigits x.digits.1.natAbs - n)
    (places.elim 0 fun p => (-x.digits.2 - p).toNat)

/-- The decimal a number shows once it is rounded, as `c * 10 ^ e`. A
number that rounds to zero has no sign. -/
def Number.roundedDigits (sig places : Option ℕ) (x : Number) : ℤ × ℤ :=
  if x.dropOf sig places = 0 then x.digits
  else
    let r : ℤ := roundHalfEven x.digits.1.natAbs (10 ^ x.dropOf sig places)
    (if x.digits.1 < 0 then -r else r, x.digits.2 + x.dropOf sig places)

/-- A number as `gen({significant: n, places: p})` writes it, either
option left out where the record gives none: the decimal it shows,
rounded once to the nearest, a tie to the even digit, in the number's
own leaf. -/
def Number.rounded (sig places : Option ℕ) (x : Number) : Option Number :=
  if x.dropOf sig places = 0 then some x
  else x.inLeafOf (x.roundedDigits sig places).1 (x.roundedDigits sig places).2

/-- `c * 10 ^ e` in plain decimal notation with `p` digits after the
point, zeros added to make them, for a decimal that shows no more than
`p`: no exponent, and no point where `p` is zero. -/
def fixedText (c e : ℤ) (p : ℕ) : String :=
  let frac := (-e).toNat
  let ds := toString c.natAbs
  let all := zeros (frac + 1 - ds.length) ++ ds ++ zeros e.toNat
  let cut := all.length - frac
  (if c < 0 then "-" else "") ++ all.take cut ++
    (if 0 < p then "." ++ all.drop cut ++ zeros (p - frac) else "")

/-- The text `gen({as: "string"})` writes for a number, with the other
options of the record: where it gives `places`, the rounded decimal in
plain notation with exactly that many digits after the point, and
otherwise the text the rounded number is written with. There is none
where the number's leaf does not hold the rounding. -/
def Number.written (sig places : Option ℕ) (x : Number) : Option String :=
  (x.rounded sig places).map fun y =>
    match places with
    | some p => fixedText (x.roundedDigits sig places).1 (x.roundedDigits sig places).2 p
    | none => y.text

/-- A record that gives neither option leaves the number as it is. -/
theorem Number.rounded_none (x : Number) : x.rounded none none = some x := by
  unfold Number.rounded Number.dropOf
  exact if_pos (Nat.max_self 0)

/-- `places` alone leaves a number that shows no digit after the point
as it is, which is every integer and big integer. -/
theorem Number.rounded_places_of_whole (p : ℕ) (x : Number) (h : 0 ≤ x.digits.2) :
    x.rounded none (some p) = some x := by
  unfold Number.rounded Number.dropOf
  have hz : (-x.digits.2 - (p : ℤ)).toNat = 0 :=
    Int.toNat_of_nonpos (Int.sub_nonpos_of_le (Int.le_trans (Int.neg_nonpos_of_nonneg h)
      (Int.natCast_nonneg p)))
  show (if max 0 (-x.digits.2 - (p : ℤ)).toNat = 0 then some x else _) = some x
  rw [hz]
  exact if_pos (Nat.max_self 0)

/-- With `significant` alone, the digits dropped are those past the
count. -/
theorem Number.dropOf_significant (n : ℕ) (x : Number) :
    x.dropOf (some n) none = ndigits x.digits.1.natAbs - n :=
  Nat.max_zero _

/-- `significant` alone is the rounding `Number.significant` gives. -/
theorem Number.rounded_significant (n : ℕ) (x : Number) :
    x.rounded (some n) none = x.significant n := by
  unfold Number.rounded Number.significant Number.roundedDigits
  rw [Number.dropOf_significant]
  by_cases hd : ndigits x.digits.1.natAbs ≤ n
  · rw [if_pos (Nat.sub_eq_zero_of_le hd), if_pos hd]
  · have hne : ndigits x.digits.1.natAbs - n ≠ 0 :=
      Nat.sub_ne_zero_of_lt (Nat.lt_of_not_le hd)
    rw [if_neg hne, if_neg hd, if_neg hne]

/-- Only a float has a rounding that its leaf does not hold. -/
theorem Number.rounded_isSome (sig places : Option ℕ) (x : Number) (h : ∀ f, x ≠ .float f) :
    (x.rounded sig places).isSome = true := by
  unfold Number.rounded
  by_cases hd : x.dropOf sig places = 0
  · rw [if_pos hd]
    rfl
  · rw [if_neg hd]
    exact Number.inLeafOf_isSome x _ _ h

end Aontu
