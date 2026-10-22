/-!
# The data

What an aontu value admits or refuses: the data, a value of the
language with nothing left open. The scalars come first: the numbers,
in the language's four leaves, then the strings, the booleans, and
null. Maps and lists are built from them. The definition says what
values mean, and nothing about text: how a text is read into a value,
and which leaf a number is read into, is a reader's business.
-/

namespace Aontu

/-- The integers of mathematics, every whole number with no bound:
Lean's `Int`, written `ℤ` here so that it never reads as aontu's
`Integer`. -/
notation "ℤ" => Int

/-- The natural numbers, Lean's `Nat`. -/
notation "ℕ" => Nat

/-! ## Numbers

Each of the language's four leaves has its own type, named as aontu
names it: `Integer`, `Float`, `BigInteger`, and `BigDecimal`. Each
holds exactly the numbers of its leaf, and no other. -/

/-! ### Integers -/

/-- The whole numbers the `integer` leaf holds: the values a double holds
exactly, `m · 2 ^ e` with `m < 2 ^ 53`, whose magnitude is below
`2 ^ 63`. So `2 ^ 53 + 2` and `10 ^ 18` are in it, and `2 ^ 53 + 1`
(no double), `2 ^ 63` and `-2 ^ 63` (outside the window) are not. -/
def IntegerLeaf (n : ℤ) : Prop :=
  (∃ m e : ℕ, n.natAbs = m * 2 ^ e ∧ m < 2 ^ 53) ∧ n.natAbs < 2 ^ 63

/-- Inside the window a double's exponent is below 64, which bounds the
search. -/
theorem integerLeaf_iff (n : ℤ) :
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

instance (n : ℤ) : Decidable (IntegerLeaf n) := decidable_of_iff _ (integerLeaf_iff n).symm

/-- An `integer`: a whole number the `integer` leaf holds, which a
double holds exactly and whose magnitude is below `2 ^ 63`. -/
structure Integer where
  value : ℤ
  leaf : IntegerLeaf value
  deriving DecidableEq

/-- The integer `n`, for an `n` the leaf holds: `Integer.of 3` is three. -/
def Integer.of (n : ℤ) (h : IntegerLeaf n := by decide) : Integer := ⟨n, h⟩

/-! ### Floats

A `float` is an IEEE-754 binary64 double, any double but the infinities,
NaN, and negative zero, none of which aontu holds. It is aontu's `Float`,
held by its fields, and not Lean's own `Float`, whose operations no proof
can compute with. -/

/-- A float: a binary64 double, held as its three fields: the sign, the
11-bit biased exponent, and the 52 bits of the fraction. The exponent
`2047` would make an infinity or a NaN, and the sign alone a negative
zero, which aontu takes as zero. -/
structure Float where
  neg : Bool
  exp : ℕ
  frac : ℕ
  exp_lt : exp < 2047
  frac_lt : frac < 2 ^ 52
  no_neg_zero : neg = true → exp ≠ 0 ∨ frac ≠ 0
  deriving DecidableEq

/-- The significand: the fraction with its leading one, which a
subnormal, of exponent `0`, lacks. -/
def Float.man (x : Float) : ℕ := if x.exp = 0 then x.frac else 2 ^ 52 + x.frac

/-- The power of two the significand is scaled by: a float is
`± man * 2 ^ pow`. -/
def Float.pow (x : Float) : ℤ := if x.exp = 0 then -1074 else (x.exp : ℤ) - 1075

/-- The bits of `n`, at most `fuel` of them. -/
def bitLen : ℕ → ℕ → ℕ
  | 0, _ => 0
  | fuel + 1, n => if n = 0 then 0 else 1 + bitLen fuel (n / 2)

/-- The fields of the double `m * 2 ^ e`, for `0 < m < 2 ^ 53`: the
exponent and fraction of the significand shifted to 53 bits, or below
the normal range the fraction of a subnormal. -/
def Float.fieldsOf (m : ℕ) (e : ℤ) : ℕ × ℕ :=
  let s := 53 - bitLen 64 m
  let e' := e - s
  if 1 ≤ e' + 1075 then ((e' + 1075).toNat, m * 2 ^ s - 2 ^ 52)
  else (0, m * 2 ^ (e + 1074).toNat)

/-- The float `m * 2 ^ e`, for a positive `m` the double holds exactly:
`Float.dyadic 3 (-1)` is one and a half, the double `1.5`. -/
def Float.dyadic (m : ℕ) (e : ℤ)
    (h₁ : (Float.fieldsOf m e).1 < 2047 := by decide)
    (h₂ : (Float.fieldsOf m e).2 < 2 ^ 52 := by decide) : Float :=
  ⟨false, (Float.fieldsOf m e).1, (Float.fieldsOf m e).2, h₁, h₂, fun h => nomatch h⟩

/-- The decimal digits of `n`, one for zero. -/
def ndigits (n : ℕ) : ℕ := go n n
where
  go : ℕ → ℕ → ℕ
    | 0, _ => 1
    | fuel + 1, n => if n < 10 then 1 else 1 + go fuel (n / 10)

/-- The decimal a float shows, as `c * 10 ^ k`: the shortest decimal
that rounds to the float, the closest to it of those, and of two that
close the one with the even last digit. It is the text both ports write
for a float, and what `mulof` reads one as. -/
def Float.shortest (x : Float) : ℤ × ℤ :=
  if x.man = 0 then (0, 0) else
  -- The decimals that round to `x` lie between the midpoints to its
  -- neighbours, in units of `2 ^ (pow - 2)`; the lower neighbour is
  -- nearer when the significand is a power of two above the bottom of
  -- the range, and a midpoint rounds to the even significand.
  let q : ℤ := x.pow - 2
  let up : ℕ := 2 ^ q.toNat
  let dn : ℕ := 2 ^ (-q).toNat
  let v := 4 * x.man * up
  let hi := (4 * x.man + 2) * up
  let lo := (if x.man = 2 ^ 52 ∧ 1 < x.exp then 4 * x.man - 1 else 4 * x.man - 2) * up
  let (c, k) := go (x.man % 2 = 0) v lo hi dn ((ndigits hi : ℤ) - ndigits dn + 1) 64
  (if x.neg then -(c : ℤ) else c, k)
where
  /-- From the place `10 ^ k` down, the first place where a multiple of
  it lies between `lo / dn` and `hi / dn`, and the multiple nearest
  `v / dn` there. -/
  go (closed : Bool) (v lo hi dn : ℕ) (k : ℤ) : ℕ → ℕ × ℤ
    | 0 => (0, k)
    | fuel + 1 =>
      let a := 10 ^ (-k).toNat
      let b := dn * 10 ^ k.toNat
      let cmax := if closed then hi * a / b else (hi * a - 1) / b
      let cmin := if closed then (lo * a + b - 1) / b else lo * a / b + 1
      if cmin ≤ cmax then
        let t := v * a / b
        let r := v * a % b
        let c := if 2 * r < b then t else if b < 2 * r then t + 1 else if t % 2 = 0 then t else t + 1
        (if c < cmin then cmin else if cmax < c then cmax else c, k)
      else go closed v lo hi dn (k - 1) fuel

/-! ### Big integers -/

/-- A `biginteger`: a whole number, exact and unbounded. -/
structure BigInteger where
  value : ℤ
  deriving DecidableEq

/-! ### Big decimals -/

/-- A `bigdecimal`: the exact value `coef * 10 ^ (-scale)`, the
coefficient with no zero trailing it. Scale is presentation, not
identity, so each value has one `BigDecimal`: `0d0.10` and `0d0.1` are
both `⟨1, 1, _⟩`. -/
structure BigDecimal where
  coef : ℤ
  scale : ℤ
  canon : coef % 10 ≠ 0 ∨ (coef = 0 ∧ scale = 0)
  deriving DecidableEq

/-- The big decimal `coef * 10 ^ (-scale)`, given with no trailing zero:
`BigDecimal.of 15 1` is one and a half. -/
def BigDecimal.of (coef scale : ℤ) (h : coef % 10 ≠ 0 ∨ (coef = 0 ∧ scale = 0) := by decide) :
    BigDecimal := ⟨coef, scale, h⟩

/-! ### The four leaves -/

/-- A number, in one of the language's four leaves. The leaves are
disjoint: two numbers of two leaves are two values, however equal they
look, so `1`, `1.0`, `0d1`, and `0d1.0` are four. -/
inductive Number where
  | integer (x : Integer)
  | float (x : Float)
  | biginteger (x : BigInteger)
  | bigdecimal (x : BigDecimal)
  deriving DecidableEq

/-- A number's exact value, as an integer over a positive natural. -/
def Number.value : Number → ℤ × ℕ
  | .integer x => (x.value, 1)
  | .float x =>
    let m : ℤ := if x.neg then -(x.man : ℤ) else x.man
    if 0 ≤ x.pow then (m * 2 ^ x.pow.toNat, 1) else (m, 2 ^ (-x.pow).toNat)
  | .biginteger x => (x.value, 1)
  | .bigdecimal x =>
    if 0 ≤ x.scale then (x.coef, 10 ^ x.scale.toNat) else (x.coef * 10 ^ (-x.scale).toNat, 1)

/-- The value a number shows: its exact value, but for a float the
decimal it shows, so that `0.3` shows three tenths where its exact
value is a little below. -/
def Number.shown : Number → ℤ × ℕ
  | .float x =>
    let (c, k) := x.shortest
    if 0 ≤ k then (c * 10 ^ k.toNat, 1) else (c, 10 ^ (-k).toNat)
  | x => x.value

/-- `x` is at most `y`, by exact value. -/
def Number.le (x y : Number) : Prop := x.value.1 * y.value.2 ≤ y.value.1 * x.value.2

/-- `x` is below `y`, by exact value. -/
def Number.lt (x y : Number) : Prop := x.value.1 * y.value.2 < y.value.1 * x.value.2

/-- `d` shows a positive number. -/
def Number.Positive (d : Number) : Prop := 0 < d.shown.1

/-- What `x` shows is a whole multiple of what `d` shows, for a `d`
that shows a positive number. -/
def Number.multipleOf (x d : Number) : Prop :=
  (x.shown.1 * d.shown.2) % (d.shown.1 * x.shown.2) = 0

/-- `x` shows a whole number. -/
def Number.Whole (x : Number) : Prop := x.shown.1 % x.shown.2 = 0

instance (x y : Number) : Decidable (x.le y) := inferInstanceAs (Decidable (_ ≤ _))
instance (x y : Number) : Decidable (x.lt y) := inferInstanceAs (Decidable (_ < _))
instance (d : Number) : Decidable d.Positive := inferInstanceAs (Decidable (_ < _))
instance (x d : Number) : Decidable (x.multipleOf d) := inferInstanceAs (Decidable (_ = _))
instance (x : Number) : Decidable x.Whole := inferInstanceAs (Decidable (_ = _))

/-- The multiples of one are the numbers that show a whole number. -/
theorem Number.multipleOf_one (x : Number) : x.multipleOf (.integer (.of 1)) ↔ x.Whole := by
  simp [Number.multipleOf, Number.Whole, Number.shown, Number.value, Integer.of]

/-! ## Strings

A string is a Lean `String`: its sequence of characters, the Unicode
scalar values. So a string that holds a lone surrogate, as `"\ud800"`
escapes one, is no value here: both engines accept it, and they differ
on what it is (`test/spec/divergent.tsv`). Two strings are ordered as
Lean orders them, character by character by code point, and a string
is below any longer string it begins: `"b" < "ba"`. -/

/-! ## The data -/

/-- The data: a number, a string, a boolean, null, a map, or a list. A
map is the set of its members: Lean lists them, the order of the list
is no part of the value, and a map gives each key once
(`Data.WellFormed`). -/
inductive Data where
  | num (x : Number)
  | str (s : String)
  | bool (b : Bool)
  | null
  | map (fs : List (String × Data))
  | list (xs : List Data)

/-- The integer `n`, for an `n` the leaf holds: `Data.integer 3` is the
`integer` three. -/
def Data.integer (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .num (.integer ⟨n, h⟩)

/-- The value a map gives the key `k`. -/
def lookup (k : String) : List (String × Data) → Option Data
  | [] => none
  | (k', v) :: fs => if k = k' then some v else lookup k fs

/-- `j` and `j'` are one value: the same scalar, lists alike element by
element, and maps with the same members, in whatever order Lean lists
them. -/
inductive Data.Same : Data → Data → Prop
  | num {x : Number} : Same (.num x) (.num x)
  | str {s : String} : Same (.str s) (.str s)
  | bool {b : Bool} : Same (.bool b) (.bool b)
  | null : Same .null .null
  | map {fs gs : List (String × Data)} :
      (∀ k, (lookup k fs).isSome = (lookup k gs).isSome) →
      (∀ k x y, lookup k fs = some x → lookup k gs = some y → Same x y) →
      Same (.map fs) (.map gs)
  | list {xs ys : List Data} :
      xs.length = ys.length →
      (∀ (i : ℕ) (x y : Data), xs[i]? = some x → ys[i]? = some y → Same x y) →
      Same (.list xs) (.list ys)

/-- A Lean `Data` is a value when each of its maps gives each key once.
Every number is one already: each leaf's type holds only its own. -/
inductive Data.WellFormed : Data → Prop
  | num {x : Number} : WellFormed (.num x)
  | str {s : String} : WellFormed (.str s)
  | bool {b : Bool} : WellFormed (.bool b)
  | null : WellFormed .null
  | map {fs : List (String × Data)} :
      (fs.map Prod.fst).Nodup → (∀ k x, (k, x) ∈ fs → WellFormed x) → WellFormed (.map fs)
  | list {xs : List Data} : (∀ x, x ∈ xs → WellFormed x) → WellFormed (.list xs)

/-- The size `len` counts: a string's characters, a list's elements,
a map's members. A scalar has no size. -/
def Data.size : Data → Option ℕ
  | .str s => some s.length
  | .list xs => some xs.length
  | .map fs => some fs.length
  | _ => none

/-- Whether a value is an empty map or an empty list: what an optional
member whose value generates it leaves out of the output (decision 19
of the design note's §7). -/
def Data.emptyBag : Data → Bool
  | .map [] | .list [] => true
  | _ => false

/-- The members `unique` compares: a list's elements, or a map's
values. A scalar has no members. -/
def Data.members : Data → Option (List Data)
  | .list xs => some xs
  | .map fs => some (fs.map Prod.snd)
  | _ => none

/-- What `unique` compares of a member: the member itself, or under a
key, the value the member gives that key, which a member that is no
map, or lacks the key, has not. -/
def Data.project (k : Option String) (x : Data) : Option Data :=
  match k with
  | none => some x
  | some k => match x with
    | .map fs => lookup k fs
    | _ => none

/-- A list's elements under their positions, from `i`. -/
def namedItems : ℕ → List Data → List (String × Data)
  | _, [] => []
  | i, x :: xs => (toString i, x) :: namedItems (i + 1) xs

/-- The members `rest` reads, each under its key: a map's members, or a
list's elements under their positions. A scalar has none. -/
def Data.named : Data → Option (List (String × Data))
  | .map fs => some fs
  | .list xs => some (namedItems 0 xs)
  | _ => none

/-- An element under its name: the one at a position, named by it. -/
theorem mem_namedItems_iff : ∀ {i : ℕ} {xs : List Data} {k : String} {x : Data},
    (k, x) ∈ namedItems i xs ↔ ∃ n : ℕ, xs[n]? = some x ∧ k = toString (i + n)
  | _, [], _, _ => by simp [namedItems]
  | i, y :: xs, k, x => by
    simp only [namedItems, List.mem_cons, Prod.mk.injEq]
    rw [mem_namedItems_iff]
    constructor
    · rintro (⟨rfl, rfl⟩ | ⟨n, hn, rfl⟩)
      · exact ⟨0, rfl, rfl⟩
      · exact ⟨n + 1, by simpa using hn, by rw [Nat.add_assoc, Nat.add_comm 1 n]⟩
    · rintro ⟨n, hn, rfl⟩
      cases n with
      | zero =>
        simp only [List.getElem?_cons_zero, Option.some.injEq] at hn
        exact .inl ⟨rfl, hn.symm⟩
      | succ n =>
        refine .inr ⟨n, by simpa using hn, ?_⟩
        rw [Nat.add_assoc, Nat.add_comm 1 n]

theorem mem_namedItems_zero {xs : List Data} {k : String} {x : Data} :
    (k, x) ∈ namedItems 0 xs ↔ ∃ n : ℕ, xs[n]? = some x ∧ k = toString n := by
  rw [mem_namedItems_iff]
  simp

theorem mem_namedItems : ∀ {i : ℕ} {xs : List Data} {k : String} {x : Data},
    (k, x) ∈ namedItems i xs → x ∈ xs
  | _, [], _, _, h => nomatch h
  | i, y :: xs, k, x, h => by
    simp only [namedItems, List.mem_cons, Prod.mk.injEq] at h
    rcases h with ⟨-, rfl⟩ | h
    · exact List.mem_cons_self
    · exact List.mem_cons_of_mem _ (mem_namedItems h)

/-- A step of a path: a member's key, a position in a list, a variable
the calling program binds, whose value names the step, or the climb a
relative path starts with, a step up for each of its dots. -/
inductive Seg where
  | key (k : String)
  | idx (i : ℕ)
  | var (n : String)
  | up (n : ℕ)
  deriving DecidableEq

/-- The part of a value a path names. -/
def Data.at (j : Data) : List Seg → Option Data
  | [] => some j
  | .key k :: p => match j with
    | .map fs => (lookup k fs).bind (·.at p)
    | _ => none
  | .idx i :: p => match j with
    | .list xs => xs[i]?.bind (·.at p)
    | _ => none
  | .var _ :: _ => none
  | .up _ :: _ => none

/-! ## Values, told apart -/

mutual
/-- Whether two values are one Lean `Data`: the same scalar, the same
members in the same order, the same elements. -/
def Data.eqb : Data → Data → Bool
  | .num x, .num y => decide (x = y)
  | .str s, .str t => decide (s = t)
  | .bool b, .bool c => decide (b = c)
  | .null, .null => true
  | .map fs, .map gs => Data.eqbMembers fs gs
  | .list xs, .list ys => Data.eqbList xs ys
  | _, _ => false

def Data.eqbMembers : List (String × Data) → List (String × Data) → Bool
  | [], [] => true
  | (k, x) :: fs, (k', y) :: gs => decide (k = k') && x.eqb y && Data.eqbMembers fs gs
  | _, _ => false

def Data.eqbList : List Data → List Data → Bool
  | [], [] => true
  | x :: xs, y :: ys => x.eqb y && Data.eqbList xs ys
  | _, _ => false
end

mutual
theorem Data.eqb_iff : ∀ x y : Data, x.eqb y = true ↔ x = y
  | .num x, y => by
    cases y with
    | num y => simp [Data.eqb]
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .str s, y => by
    cases y with
    | str t => simp [Data.eqb]
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .bool b, y => by
    cases y with
    | bool c => simp [Data.eqb]
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .null, y => by
    cases y with
    | null => simp [Data.eqb]
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .map fs, y => by
    cases y with
    | map gs =>
      simp only [Data.eqb, Data.map.injEq]
      exact Data.eqbMembers_iff fs gs
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | .list xs, y => by
    cases y with
    | list ys =>
      simp only [Data.eqb, Data.list.injEq]
      exact Data.eqbList_iff xs ys
    | _ => exact ⟨(fun h => nomatch h), (fun h => nomatch h)⟩

theorem Data.eqbMembers_iff : ∀ fs gs : List (String × Data),
    Data.eqbMembers fs gs = true ↔ fs = gs
  | [], [] => by simp [Data.eqbMembers]
  | [], _ :: _ => ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | _ :: _, [] => ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | (k, x) :: fs, (k', y) :: gs => by
    simp only [Data.eqbMembers, Bool.and_eq_true, decide_eq_true_eq, List.cons.injEq,
      Prod.mk.injEq]
    rw [Data.eqb_iff x y, Data.eqbMembers_iff fs gs]

theorem Data.eqbList_iff : ∀ xs ys : List Data, Data.eqbList xs ys = true ↔ xs = ys
  | [], [] => by simp [Data.eqbList]
  | [], _ :: _ => ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | _ :: _, [] => ⟨(fun h => nomatch h), (fun h => nomatch h)⟩
  | x :: xs, y :: ys => by
    simp only [Data.eqbList, Bool.and_eq_true, List.cons.injEq]
    rw [Data.eqb_iff x y, Data.eqbList_iff xs ys]
end

instance : DecidableEq Data := fun x y => decidable_of_iff _ (Data.eqb_iff x y)

end Aontu
