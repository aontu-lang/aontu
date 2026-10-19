import Aontu.Data

/-!
# The values

The terms of the language: one constructor for each construct the
definition holds, each beside the reference's name for it. How a text
is read into a term is the grammar's business; what a term means is
`Admits`.
-/

namespace Aontu

/-- A scalar literal: one number, of any of the four leaves, or one
string, boolean, or null. -/
inductive Scalar where
  | num (x : Number)
  | str (s : String)
  | bool (b : Bool)
  | null
  deriving DecidableEq

/-- A scalar as the data it is. -/
def Scalar.data : Scalar → Data
  | .num x => .num x
  | .str s => .str s
  | .bool b => .bool b
  | .null => .null

/-- The end of a bound: a number, which bounds numbers by exact value,
or a string, which bounds strings in code-point order. -/
inductive Bound where
  | num (n : Number)
  | str (s : String)

/-- A value, each constructor beside the construct it is. A map has
keys, each required or optional, a spread that holds every member, and
a seal that refuses every member it does not declare; a list has its
positions and a spread. -/
inductive Val where
  | integer                                 -- `integer`
  | float                                   -- `float`
  | biginteger                              -- `biginteger`
  | bigdecimal                              -- `bigdecimal`
  | number                                  -- `number`, every number of the four leaves
  | string                                  -- `string`, every string but `""`
  | anyString                               -- `string & empty()`, every string
  | boolean                                 -- `boolean`
  | lit (s : Scalar)                        -- a literal: `3`, `1.5`, `0d5`, `0d1.5`, `"a"`, `true`, `null`
  | min (b : Bound)                         -- `min(b)`
  | max (b : Bound)                         -- `max(b)`
  | above (b : Bound)                       -- `above(b)`
  | beneath (b : Bound)                     -- `below(b)`; Lean keeps `below` for every inductive type's own use
  | neq (vs : List Bound)                   -- `neq(v, …)`, numbers or strings, never both
  | multiple (d : Number)                   -- `multiple(d)`
  | len (c : Val)                           -- `len(c)`
  | unique (k : Option String)              -- `unique()`, or `unique("k")`
  | re (p : String)                         -- `re(p)`, the strings the pattern matches
  | format (g : String)                     -- `format(g)`, the strings the format reads
  | any                                     -- `any`
  | nil                                     -- `nil`
  | map (fs : List (String × Bool × Val)) (spread : Option Val) (closed : Bool)
                                            -- `{k: v, k?: v, &: s}`, sealed by `close()`
  | list (items : List Val) (spread : Option Val) (closed : Bool)
                                            -- `[a, b, &: s]`, sealed by `close()`
  | or (arms : List (ℕ × Val))              -- `a | *b | **c`: each arm with its rank, `0` for none
  | pref (r : ℕ) (x : Val)                  -- `*x` alone, which is `x | super(x)`; `**x` has rank 2
  | meet (a b : Val)                        -- `a & b`
  | alias (n : String)                      -- `%n`
  | path (p : List Seg)                     -- `$.a.b`

/-! The language reads `|` and `*` by position, and the reader, not a
rule, carries the reading into the terms: an arm of a disjunction, and
the value of a `*` alone, which is a disjunction too, reads every list
literal beneath it as its own length, a sealed list, and `*x` as an arm
reads as the arm `x` of rank one. So `*1 | 2` is
`or [(1, lit 1), (0, lit 2)]`, and `*[1]` is `pref 1 (list [lit 1] none true)`. -/

/-- The alias declarations of a document: `%T = v` is `env "T" = some v`. -/
abbrev Env := String → Option Val

/-- The declarations of a document that declares no alias. -/
def Env.empty : Env := fun _ => none

/-! ## The size of a term

The number of constructors a term holds, computed: the budget the meet
of two terms never runs past. -/

mutual
def Val.size : Val → ℕ
  | .lit _ | .min _ | .max _ | .above _ | .beneath _ | .neq _ | .multiple _ | .unique _
  | .re _ | .format _ | .alias _ | .path _ => 1
  | .len c => c.size + 1
  | .map fs spread _ => sizeFields fs + sizeSpread spread + 1
  | .list items spread _ => sizeItems items + sizeSpread spread + 1
  | .or arms => sizeArms arms + 1
  | .pref _ x => x.size + 1
  | .meet a b => a.size + b.size + 1
  | _ => 1

def sizeFields : List (String × Bool × Val) → ℕ
  | [] => 0
  | (_, _, v) :: fs => v.size + sizeFields fs

def sizeItems : List Val → ℕ
  | [] => 0
  | v :: vs => v.size + sizeItems vs

def sizeSpread : Option Val → ℕ
  | none => 0
  | some s => s.size

def sizeArms : List (ℕ × Val) → ℕ
  | [] => 0
  | (_, a) :: arms => a.size + sizeArms arms
end

/-! ## The parent type

`super(x)`, the immediate parent type of a value: a scalar's kind, a
kind's parent, a container of its members' parents, and a constraint's
domain. It is what a preference alone widens to: `*x` admits what
`x | super(x)` admits. -/

/-- The four leaves, as kinds are told apart. -/
inductive Leaf where
  | integer
  | float
  | biginteger
  | bigdecimal
  deriving DecidableEq

def Number.leaf : Number → Leaf
  | .integer _ => .integer
  | .float _ => .float
  | .biginteger _ => .biginteger
  | .bigdecimal _ => .bigdecimal

/-- The kind that admits exactly a leaf. -/
def Leaf.kind : Leaf → Val
  | .integer => .integer
  | .float => .float
  | .biginteger => .biginteger
  | .bigdecimal => .bigdecimal

/-- The domain a bound constrains: the numbers, or the strings. -/
def Bound.domain : Bound → Val
  | .num _ => .number
  | .str _ => .string

/-- A kind: a term that admits scalars by their kind alone. `any` is no
kind here, since `any & x` is `x`, whose parent is `x`'s own. -/
def Val.isKind : Val → Bool
  | .integer | .float | .biginteger | .bigdecimal | .number | .string | .anyString | .boolean => true
  | _ => false

/-- One of the four numeric leaves. -/
def Val.isLeaf : Val → Bool
  | .integer | .float | .biginteger | .bigdecimal => true
  | _ => false

mutual
/-- The immediate parent type. A meet that holds a kind has that kind
for its parent, as `integer & min(3)` is a constraint on integers; a
meet of two kinds has the lower kind's parent; any other meet lifts
each side. A reference lifts as itself, a residual the engines keep
symbolic too. -/
def Val.super : Val → Val
  | .integer | .float | .biginteger | .bigdecimal => .number
  | .number | .string | .anyString | .boolean | .any => .any
  | .nil => .nil
  | .lit (.num x) => x.leaf.kind
  | .lit (.str s) => if s = "" then .anyString else .string
  | .lit (.bool _) => .boolean
  | .lit .null => .lit .null
  | .min b | .max b | .above b | .beneath b => b.domain
  | .neq (v :: _) => v.domain
  | .neq [] => .any
  | .multiple _ => .number
  | .len _ | .unique _ => .any
  | .re _ | .format _ => .string
  | .map fs spread closed => .map (superFields fs) (superSpread spread) closed
  | .list items spread closed => .list (superItems items) (superSpread spread) closed
  | .or arms => .or (superArms arms)
  | .pref _ x => x.super
  | .meet a b =>
    if a.isKind then (if b.isKind then (if a.isLeaf then a.super else b.super) else a)
    else if b.isKind then b else .meet a.super b.super
  | .alias n => .alias n
  | .path p => .path p

def superFields : List (String × Bool × Val) → List (String × Bool × Val)
  | [] => []
  | (k, o, v) :: fs => (k, o, v.super) :: superFields fs

def superItems : List Val → List Val
  | [] => []
  | v :: vs => v.super :: superItems vs

def superSpread : Option Val → Option Val
  | none => none
  | some s => some s.super

def superArms : List (ℕ × Val) → List (ℕ × Val)
  | [] => []
  | (r, a) :: arms => (r, a.super) :: superArms arms
end

end Aontu
