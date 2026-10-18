/-!
# The data

What an aontu value admits or refuses: a JSON value, as RFC 8259
describes one. A JSON value is null, a boolean, a number, a string, an
array of values, or an object, whose members each give one name one
value. The definition says what values mean, and nothing about text:
how a text is read into a value is a reader's business.
-/

namespace Aontu

/-- A number: the exact value `coef / 10 ^ scale`, in lowest terms, so
that each value has one `Num` and two numbers are equal exactly when
their values are. The numbers JSON describes are the finite decimals:
one and a half is `⟨15, 1, _⟩`, a quarter `⟨25, 2, _⟩` and a thousand
`⟨1000, 0, _⟩`. -/
structure Num where
  coef : Int
  scale : Nat
  lowest : scale = 0 ∨ coef % 10 ≠ 0

instance : DecidableEq Num := fun x y =>
  if h : x.coef = y.coef ∧ x.scale = y.scale then
    isTrue (by cases x; cases y; obtain ⟨rfl, rfl⟩ := h; rfl)
  else
    isFalse (fun e => h (by cases e; exact ⟨rfl, rfl⟩))

/-- The integer `n`. -/
def Num.ofInt (n : Int) : Num := ⟨n, 0, .inl rfl⟩

/-- The number `coef / 10 ^ scale`, in lowest terms: `Num.ofDec 15 1`
is one and a half, as `Num.ofDec 150 2` is. -/
def Num.ofDec (coef : Int) : Nat → Num
  | 0 => ⟨coef, 0, .inl rfl⟩
  | s + 1 => if h : coef % 10 = 0 then Num.ofDec (coef / 10) s else ⟨coef, s + 1, .inr h⟩

/-- `x` is at most `y`. -/
def Num.le (x y : Num) : Prop := x.coef * 10 ^ y.scale ≤ y.coef * 10 ^ x.scale

/-- `x` is a whole multiple of `d`, for a positive `d`: one and a half
is a multiple of a half, and every integer of one. -/
def Num.multipleOf (x d : Num) : Prop := (x.coef * 10 ^ d.scale) % (d.coef * 10 ^ x.scale) = 0

/-- The integer a number is, when it is one: a thousand is, one and a
half is not. -/
def Num.int? (x : Num) : Option Int :=
  if x.coef % 10 ^ x.scale = 0 then some (x.coef / 10 ^ x.scale) else none

instance (x y : Num) : Decidable (x.le y) := inferInstanceAs (Decidable (_ ≤ _))
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

/-- A JSON value. A string is its sequence of characters, the Unicode
scalar values a Lean `String` holds, so a string that holds a lone
surrogate, as `"\ud800"` escapes one, is no value here: both engines
accept it, and they differ on what it is (`test/spec/divergent.tsv`).
An object is the set of its members: Lean lists them, the order of the
list is no part of the value, and a value gives each name once
(`Json.WellFormed`). -/
inductive Json where
  | null
  | bool (b : Bool)
  | num (n : Num)
  | str (s : String)
  | arr (xs : List Json)
  | obj (fs : List (String × Json))

/-- The integer `n`: `Json.int 3` is three. -/
def Json.int (n : Int) : Json := .num (.ofInt n)

/-- The number `coef / 10 ^ scale`: `Json.dec 15 1` is one and a half. -/
def Json.dec (coef : Int) (scale : Nat) : Json := .num (.ofDec coef scale)

/-- The value an object gives the name `k`. -/
def lookup (k : String) : List (String × Json) → Option Json
  | [] => none
  | (k', v) :: fs => if k = k' then some v else lookup k fs

/-- `j` and `j'` are one value: the same scalar, arrays alike element by
element, and objects with the same members, in whatever order Lean
lists them. -/
inductive Json.Same : Json → Json → Prop
  | null : Same .null .null
  | bool {b : Bool} : Same (.bool b) (.bool b)
  | num {x : Num} : Same (.num x) (.num x)
  | str {s : String} : Same (.str s) (.str s)
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
  | null : WellFormed .null
  | bool {b : Bool} : WellFormed (.bool b)
  | num {x : Num} : WellFormed (.num x)
  | str {s : String} : WellFormed (.str s)
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
