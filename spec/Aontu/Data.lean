/-!
# The data

JSON, as every relation of the definition reads it, defined once: the
values RFC 8259 writes, with each number held exactly as its text
writes it, and the integers the `integer` leaf holds.
-/

namespace Aontu

/-- A JSON number. Its value is `coef / 10 ^ scale`, exactly: `1.5` is
`⟨15, 1, true⟩`, `0.25` is `⟨25, 2, true⟩` and `1e3` is
`⟨1000, 0, false⟩`. `point` records that the text has a decimal point,
the one part of a number's spelling the language reads: by default
`1.0` is a float and `1` an integer, while `--exact-numbers` reads the
value alone, so that `1.0`, `1` and `1e0` are one integer. An exponent
changes only the value, and the sign of zero is not kept: `-0.0` is
`0.0`. -/
structure Num where
  coef : Int
  scale : Nat
  point : Bool
  deriving DecidableEq, Repr

/-- The integer `n`, written without a point. -/
def Num.ofInt (n : Int) : Num := ⟨n, 0, false⟩

/-- In lowest terms: no zero digit trails the point, so each value, written
with a point or without one, has exactly one `Num`. -/
def Num.Lowest (x : Num) : Prop := x.scale = 0 ∨ x.coef % 10 ≠ 0

/-- The value of `x` is at most the value of `y`. -/
def Num.le (x y : Num) : Prop := x.coef * 10 ^ y.scale ≤ y.coef * 10 ^ x.scale

/-- `x` and `y` have one value, however each is written. -/
def Num.eqv (x y : Num) : Prop := x.coef * 10 ^ y.scale = y.coef * 10 ^ x.scale

/-- The value of `x` is a whole multiple of the value of `d`, for a
positive `d`: `1.5` is a multiple of `0.5`, and every integer of `1`. -/
def Num.multipleOf (x d : Num) : Prop := (x.coef * 10 ^ d.scale) % (d.coef * 10 ^ x.scale) = 0

/-- The integer a number's value is, when it is one: `1.0` and `1e3`
are integers, `1.5` is not. -/
def Num.int? (x : Num) : Option Int :=
  if x.coef % 10 ^ x.scale = 0 then some (x.coef / 10 ^ x.scale) else none

instance (x : Num) : Decidable x.Lowest := inferInstanceAs (Decidable (_ ∨ _))
instance (x y : Num) : Decidable (x.le y) := inferInstanceAs (Decidable (_ ≤ _))
instance (x y : Num) : Decidable (x.eqv y) := inferInstanceAs (Decidable (_ = _))
instance (x d : Num) : Decidable (x.multipleOf d) := inferInstanceAs (Decidable (_ = _))

/-- The multiples of one are the integers. -/
theorem Num.multipleOf_one (x : Num) : x.multipleOf (.ofInt 1) ↔ ∃ n, x.int? = some n := by
  unfold Num.multipleOf Num.ofInt Num.int?
  split <;> simp_all

/-- The integers the `integer` leaf holds: the values a double holds
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

/-- A JSON value. A string is a sequence of Unicode scalar values, as a
Lean `String` is, so a text that escapes an unpaired surrogate
(`"\ud800"`), which both engines accept, has no value here. An object
holds its members in the order written. -/
inductive Json where
  | null
  | bool (b : Bool)
  | num (n : Num)
  | str (s : String)
  | arr (xs : List Json)
  | obj (fs : List (String × Json))

/-- An integer written without a point: `3` is `.int 3`. -/
def Json.int (n : Int) : Json := .num (.ofInt n)

/-- A number written with a point: `1.5` is `.dec 15 1`, and `1.0` is
`.dec 1 0`. -/
def Json.dec (coef : Int) (scale : Nat) : Json := .num ⟨coef, scale, true⟩

/-- The value of the first member named `k`; in a well-formed document,
the only one. -/
def lookup (k : String) : List (String × Json) → Option Json
  | [] => none
  | (k', v) :: fs => if k = k' then some v else lookup k fs

/-- The integer a number is, read by value; anything else is none. -/
def Json.int? : Json → Option Int
  | .num x => x.int?
  | _ => none

/-- Two documents are one value: numbers equal by value, arrays element
by element, and objects member by member, whatever order each writes
them in. -/
inductive Json.Same : Json → Json → Prop
  | null : Same .null .null
  | bool {b : Bool} : Same (.bool b) (.bool b)
  | num {x y : Num} : x.eqv y → Same (.num x) (.num y)
  | str {s : String} : Same (.str s) (.str s)
  | arr {xs ys : List Json} :
      xs.length = ys.length →
      (∀ (i : Nat) (x y : Json), xs[i]? = some x → ys[i]? = some y → Same x y) →
      Same (.arr xs) (.arr ys)
  | obj {fs gs : List (String × Json)} :
      (∀ k, (lookup k fs).isSome = (lookup k gs).isSome) →
      (∀ k x y, lookup k fs = some x → lookup k gs = some y → Same x y) →
      Same (.obj fs) (.obj gs)

/-- A document as data: every number in lowest terms, and no object
naming a member twice. Both engines read a text that repeats a name by
unifying the repeated members, so `{"a": 1, "a": 1}` is the document
`{"a": 1}`, and `{"a": 1, "a": 2}` is refused before it is data. -/
inductive Json.WellFormed : Json → Prop
  | null : WellFormed .null
  | bool {b : Bool} : WellFormed (.bool b)
  | num {x : Num} : x.Lowest → WellFormed (.num x)
  | str {s : String} : WellFormed (.str s)
  | arr {xs : List Json} : (∀ x, x ∈ xs → WellFormed x) → WellFormed (.arr xs)
  | obj {fs : List (String × Json)} :
      (fs.map Prod.fst).Nodup → (∀ k x, (k, x) ∈ fs → WellFormed x) → WellFormed (.obj fs)

/-- A step of a path: a member's name, or a position in an array. -/
inductive Seg where
  | key (k : String)
  | idx (i : Nat)

/-- The part of a document a path names. -/
def Json.at (j : Json) : List Seg → Option Json
  | [] => some j
  | .key k :: p => match j with
    | .obj fs => (lookup k fs).bind (·.at p)
    | _ => none
  | .idx i :: p => match j with
    | .arr xs => xs[i]?.bind (·.at p)
    | _ => none

end Aontu
