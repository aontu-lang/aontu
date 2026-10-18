/-!
# The data

What an aontu value admits or refuses: a JSON value, as RFC 8259
describes one. The scalars come first: the integers, the numbers they
sit among, the strings, the booleans, and null. Arrays of values, and
objects whose members each give one name one value, are built from
them. The definition says what values mean, and nothing about text:
how a text is read into a value is a reader's business.
-/

namespace Aontu

/-! ## Integers

An integer is a Lean `Int`, and the `integer` kind holds a range of
them. -/

/-- The integers the `integer` kind holds: the values a double holds
exactly, `m · 2 ^ e` with `m < 2 ^ 53`, whose magnitude is below
`2 ^ 63`. So `2 ^ 53 + 2` and `10 ^ 18` are in it, and `2 ^ 53 + 1`
(no double), `2 ^ 63` and `-2 ^ 63` (outside the window) are not. -/
def IntegerLeaf (n : Int) : Prop :=
  (∃ m e : Nat, n.natAbs = m * 2 ^ e ∧ m < 2 ^ 53) ∧ n.natAbs < 2 ^ 63

/-- Inside the window a double's exponent is below 64, which bounds the
search. -/
theorem integerLeaf_iff (n : Int) :
    IntegerLeaf n ↔
      (∃ e, e < 64 ∧ n.natAbs % 2 ^ e = 0 ∧ n.natAbs / 2 ^ e < 2 ^ 53) ∧ n.natAbs < 2 ^ 63 := by
  unfold IntegerLeaf
  constructor
  · rintro ⟨⟨m, e, hn, hm⟩, hw⟩
    refine ⟨?_, hw⟩
    by_cases h0 : m = 0
    · subst h0
      exact ⟨0, by decide, by simp [hn], by simp [hn]⟩
    · have he : e < 64 := by
        have h1 : 2 ^ e ≤ n.natAbs := by
          rw [hn]; exact Nat.le_mul_of_pos_left _ (Nat.pos_of_ne_zero h0)
        have h2 : 2 ^ e < 2 ^ 64 := Nat.lt_of_le_of_lt h1 (Nat.lt_trans hw (by decide))
        rcases Nat.lt_or_ge e 64 with h | h
        · exact h
        · exact absurd (Nat.lt_of_le_of_lt (Nat.pow_le_pow_right (by decide) h) h2) (Nat.lt_irrefl _)
      refine ⟨e, he, ?_, ?_⟩
      · rw [hn]; exact Nat.mul_mod_left _ _
      · rw [hn, Nat.mul_div_cancel _ (Nat.pow_pos (by decide))]; exact hm
  · rintro ⟨⟨e, -, hmod, hdiv⟩, hw⟩
    exact ⟨⟨n.natAbs / 2 ^ e, e, (Nat.div_mul_cancel (Nat.dvd_of_mod_eq_zero hmod)).symm, hdiv⟩, hw⟩

instance (n : Int) : Decidable (IntegerLeaf n) := decidable_of_iff _ (integerLeaf_iff n).symm

/-! ## Numbers

A number is a rational. JSON writes the decimal fractions among them,
and every rule reads a number by its value alone. -/

/-- A number: the rational `num / den`, with `den` positive and the two
in lowest terms, so that each number has one `Rat` and two numbers are
equal exactly when their values are. The integers are the numbers
whose `den` is one, and one and a half is `3 / 2`. -/
structure Rat where
  num : Int
  den : Nat
  den_pos : 0 < den
  reduced : Nat.gcd num.natAbs den = 1
  deriving DecidableEq

/-- The integer `n`, as a number. -/
def Rat.ofInt (n : Int) : Rat := ⟨n, 1, Nat.one_pos, Nat.gcd_one_right _⟩

/-- The number `num / den`, given in lowest terms: `Rat.frac 3 2` is one
and a half. -/
def Rat.frac (num : Int) (den : Nat) (h : 0 < den := by decide)
    (r : Nat.gcd num.natAbs den = 1 := by decide) : Rat := ⟨num, den, h, r⟩

/-- `x` is at most `y`. -/
def Rat.le (x y : Rat) : Prop := x.num * y.den ≤ y.num * x.den

/-- `x` is a whole multiple of `d`, for a positive `d`: one and a half
is a multiple of a half, and every integer is one of one. -/
def Rat.multipleOf (x d : Rat) : Prop := (x.num * d.den) % (d.num * x.den) = 0

instance (x y : Rat) : Decidable (x.le y) := inferInstanceAs (Decidable (_ ≤ _))
instance (x d : Rat) : Decidable (x.multipleOf d) := inferInstanceAs (Decidable (_ = _))

/-- A number is the integer `n` exactly when its `num` is `n` and its
`den` is one. -/
theorem Rat.eq_ofInt_iff (x : Rat) (n : Int) : x = .ofInt n ↔ x.num = n ∧ x.den = 1 := by
  constructor
  · rintro rfl
    exact ⟨rfl, rfl⟩
  · rintro ⟨h1, h2⟩
    cases x with
    | mk num den hp hr =>
      simp only at h1 h2
      subst h1 h2
      rfl

/-- The multiples of one are the integers. -/
theorem Rat.multipleOf_one (x : Rat) : x.multipleOf (.ofInt 1) ↔ ∃ n, x = .ofInt n := by
  constructor
  · intro h
    have hd : (x.den : Int) ∣ x.num :=
      Int.dvd_of_emod_eq_zero (by simpa [Rat.multipleOf, Rat.ofInt] using h)
    have h1 : x.den ∣ Nat.gcd x.num.natAbs x.den :=
      Nat.dvd_gcd (Int.ofNat_dvd_left.mp hd) (Nat.dvd_refl _)
    rw [x.reduced, Nat.dvd_one] at h1
    exact ⟨x.num, (Rat.eq_ofInt_iff x x.num).mpr ⟨rfl, h1⟩⟩
  · rintro ⟨n, rfl⟩
    simp [Rat.multipleOf, Rat.ofInt]

/-! ## Strings

A string is a Lean `String`: its sequence of characters, the Unicode
scalar values. So a string that holds a lone surrogate, as `"\ud800"`
escapes one, is no value here: both engines accept it, and they differ
on what it is (`test/spec/divergent.tsv`). -/

/-! ## JSON values -/

/-- A JSON value: a scalar, an array of values, or an object. An object
is the set of its members: Lean lists them, the order of the list is no
part of the value, and a value gives each name once
(`Json.WellFormed`). -/
inductive Json where
  | num (x : Rat)
  | str (s : String)
  | bool (b : Bool)
  | null
  | arr (xs : List Json)
  | obj (fs : List (String × Json))

/-- The integer `n`: `Json.int 3` is three. -/
def Json.int (n : Int) : Json := .num (.ofInt n)

/-- The number `num / den`, given in lowest terms: `Json.frac 3 2` is
one and a half. -/
def Json.frac (num : Int) (den : Nat) (h : 0 < den := by decide)
    (r : Nat.gcd num.natAbs den = 1 := by decide) : Json := .num (.frac num den h r)

/-- The value an object gives the name `k`. -/
def lookup (k : String) : List (String × Json) → Option Json
  | [] => none
  | (k', v) :: fs => if k = k' then some v else lookup k fs

/-- `j` and `j'` are one value: the same scalar, arrays alike element by
element, and objects with the same members, in whatever order Lean
lists them. -/
inductive Json.Same : Json → Json → Prop
  | num {x : Rat} : Same (.num x) (.num x)
  | str {s : String} : Same (.str s) (.str s)
  | bool {b : Bool} : Same (.bool b) (.bool b)
  | null : Same .null .null
  | arr {xs ys : List Json} :
      xs.length = ys.length →
      (∀ (i : Nat) (x y : Json), xs[i]? = some x → ys[i]? = some y → Same x y) →
      Same (.arr xs) (.arr ys)
  | obj {fs gs : List (String × Json)} :
      (∀ k, (lookup k fs).isSome = (lookup k gs).isSome) →
      (∀ k x y, lookup k fs = some x → lookup k gs = some y → Same x y) →
      Same (.obj fs) (.obj gs)

/-- A Lean `Json` is a JSON value when each of its objects gives each
name once. -/
inductive Json.WellFormed : Json → Prop
  | num {x : Rat} : WellFormed (.num x)
  | str {s : String} : WellFormed (.str s)
  | bool {b : Bool} : WellFormed (.bool b)
  | null : WellFormed .null
  | arr {xs : List Json} : (∀ x, x ∈ xs → WellFormed x) → WellFormed (.arr xs)
  | obj {fs : List (String × Json)} :
      (fs.map Prod.fst).Nodup → (∀ k x, (k, x) ∈ fs → WellFormed x) → WellFormed (.obj fs)

/-- A step of a path: a member's name, or a position in an array. -/
inductive Seg where
  | key (k : String)
  | idx (i : Nat)

/-- The part of a value a path names. -/
def Json.at (j : Json) : List Seg → Option Json
  | [] => some j
  | .key k :: p => match j with
    | .obj fs => (lookup k fs).bind (·.at p)
    | _ => none
  | .idx i :: p => match j with
    | .arr xs => xs[i]?.bind (·.at p)
    | _ => none

end Aontu
