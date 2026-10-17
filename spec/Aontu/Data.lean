/-!
# The data

JSON, as every relation of the definition reads it, defined once: the
values RFC 8259 writes, with each number held exactly as its text
writes it.
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

/-- In lowest terms: no zero digit trails the point, so each value, written
with a point or without one, has exactly one `Num`. -/
def Num.Lowest (x : Num) : Prop := x.scale = 0 ∨ x.coef % 10 ≠ 0

instance (x : Num) : Decidable x.Lowest := inferInstanceAs (Decidable (_ ∨ _))

/-- The integer a number's value is, when it is one: `1.0` and `1e3`
are integers, `1.5` is not. -/
def Num.int? (x : Num) : Option Int :=
  if x.coef % 10 ^ x.scale = 0 then some (x.coef / 10 ^ x.scale) else none

/-- The value is at least `m`. -/
def Num.atLeast (x : Num) (m : Int) : Prop := m * 10 ^ x.scale ≤ x.coef

/-- The value is at most `m`. -/
def Num.atMost (x : Num) (m : Int) : Prop := x.coef ≤ m * 10 ^ x.scale

instance (x : Num) (m : Int) : Decidable (x.atLeast m) := inferInstanceAs (Decidable (_ ≤ _))
instance (x : Num) (m : Int) : Decidable (x.atMost m) := inferInstanceAs (Decidable (_ ≤ _))

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
def Json.int (n : Int) : Json := .num ⟨n, 0, false⟩

/-- A number written with a point: `1.5` is `.dec 15 1`, and `1.0` is
`.dec 1 0`. -/
def Json.dec (coef : Int) (scale : Nat) : Json := .num ⟨coef, scale, true⟩

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

/-- The value of the member named `k`. -/
def lookup (k : String) : List (String × Json) → Option Json
  | [] => none
  | (k', v) :: fs => if k = k' then some v else lookup k fs

def Json.get? : Json → String → Option Json
  | .obj fs, k => lookup k fs
  | _, _ => none

def Json.isObj : Json → Bool
  | .obj _ => true
  | _ => false

/-- The integer a number is, read by value; anything else is none. -/
def Json.int? : Json → Option Int
  | .num x => x.int?
  | _ => none

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
