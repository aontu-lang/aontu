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
  deriving DecidableEq

/-- The riders: the calls that put a record on a value and change
nothing it admits or generates. The record is a map of data the
definition carries and reads nothing of (decision 14 of the design
note's §7). -/
inductive Rider where
  | metadata                                -- `meta(v, r)`, an annotation; Lean keeps `meta`
  | deprecate                               -- `deprecate(v, r)`, the record `{}` where none is written
  | ident                                   -- `ident(v, r)`, the identity of an alias's value
  | type                                    -- `type(v)`, a mark: the value is a definition
  | hide                                    -- `hide(v)`, a mark: the value is no part of the output
  deriving DecidableEq

/-- A rider's record: the members of a map of data, as both ports take
no other record (`func_arg`). -/
abbrev Record := List (String × Data)

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
  | mapKind                                 -- `map`, every map
  | listKind                                -- `list`, every list
  | lit (s : Scalar)                        -- a literal: `3`, `1.5`, `0d5`, `0d1.5`, `"a"`, `true`, `null`
  | min (b : Bound)                         -- `min(b)`
  | max (b : Bound)                         -- `max(b)`
  | above (b : Bound)                       -- `above(b)`
  | beneath (b : Bound)                     -- `below(b)`; Lean keeps `below` for every inductive type's own use
  | neq (vs : List Bound)                   -- `neq(v, …)`, numbers or strings, never both
  | mulof (d : Number)                   -- `mulof(d)`
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
  | nof (n : Val) (cs : List Val)           -- `nof(n, c₁, …, cₖ)`, the branches that admit counted by `n`
  | must (c : Val) (msg : String)           -- `must(c, "msg")`, which asks what `nof(1, c)` asks
  | when (c t : Val) (e : Option Val)       -- `when(c, t)` or `when(c, t, e)`: `t` where `c` admits, else `e`, or nothing
  | contains (c n : Val)                    -- `contains(c, n)`, the members `c` admits counted by `n`; `contains(c)` is `n = min(1)`
  | rest (t : Val) (cs : List (Option Val × Option Val × Option Val))  -- `rest(t, c₁, …)`: each member no cover evaluates held to `t`
  | select (s : Val) (arms : List (Val × Val)) (d : Option Val)  -- `match(s, p₁, r₁, …, d?)`, the first `rᵢ` whose `pᵢ` admits the value of `s`, else `d`; Lean keeps `match`
  | filter (s c : Val)                      -- `filter(s, c)`, the members of the value of `s` that `c` admits
  | ride (k : Rider) (v : Val) (r : Record) -- `meta(v, r)`, `deprecate(v, r)`, `ident(v, r)`, `type(v)`, `hide(v)`: `v` carrying `r`
  | key                                     -- `key(0)`, the key of the member a spread is tried on

/-! The language reads `|` and `*` by position, and the reader, not a
rule, carries the reading into the terms: an arm of a disjunction, and
the value of a `*` alone, which is a disjunction too, reads every list
literal beneath it as its own length, a sealed list, and `*x` as an arm
reads as the arm `x` of rank one. So `*1 | 2` is
`or [(1, lit 1), (0, lit 2)]`, and `*[1]` is `pref 1 (list [lit 1] none true)`. -/

/-- A cover of `rest`: its `if`, tried on the whole value, its `keys`,
tried on a member's key, and its `members`, tried on a member, each
written or not. -/
abbrev Cover := Option Val × Option Val × Option Val

/-- The alias declarations of a document: `%T = v` is `env "T" = some v`. -/
abbrev Env := String → Option Val

/-- The declarations of a document that declares no alias. -/
def Env.empty : Env := fun _ => none

/-! ## The size of a term

The number of constructors a term holds, computed: the budget the meet
of two terms never runs past. -/

mutual
def Val.size : Val → ℕ
  | .lit _ | .min _ | .max _ | .above _ | .beneath _ | .neq _ | .mulof _ | .unique _
  | .re _ | .format _ | .alias _ | .path _ => 1
  | .len c => c.size + 1
  | .map fs spread _ => sizeFields fs + sizeSpread spread + 1
  | .list items spread _ => sizeItems items + sizeSpread spread + 1
  | .or arms => sizeArms arms + 1
  | .pref _ x => x.size + 1
  | .meet a b => a.size + b.size + 1
  | .nof n cs => n.size + sizeItems cs + 1
  | .must c _ => c.size + 1
  | .when c t e => c.size + t.size + sizeSpread e + 1
  | .contains c n => c.size + n.size + 1
  | .rest t cs => t.size + sizeCovers cs + 1
  | .select s arms d => s.size + sizePairs arms + sizeSpread d + 1
  | .filter s c => s.size + c.size + 1
  | .ride _ v _ => v.size + 1
  | _ => 1

def sizePairs : List (Val × Val) → ℕ
  | [] => 0
  | (p, r) :: ps => p.size + r.size + sizePairs ps

def sizeCovers : List Cover → ℕ
  | [] => 0
  | (c, k, m) :: cs => sizeSpread c + sizeSpread k + sizeSpread m + sizeCovers cs

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
  | .ride _ v _ => v.isKind
  | _ => false

/-- One of the four numeric leaves. -/
def Val.isLeaf : Val → Bool
  | .integer | .float | .biginteger | .bigdecimal => true
  | .ride _ v _ => v.isLeaf
  | _ => false

mutual
/-- The immediate parent type. A meet that holds a kind has that kind
for its parent, as `integer & min(3)` is a constraint on integers; a
meet of two kinds has the lower kind's parent; any other meet lifts
each side. A reference lifts as itself, a residual the engines keep
symbolic too. -/
def Val.super : Val → Val
  | .integer | .float | .biginteger | .bigdecimal => .number
  | .number | .string | .anyString | .boolean | .mapKind | .listKind | .any => .any
  | .nil => .nil
  | .lit (.num x) => x.leaf.kind
  | .lit (.str s) => if s = "" then .anyString else .string
  | .lit (.bool _) => .boolean
  | .lit .null => .lit .null
  | .min b | .max b | .above b | .beneath b => b.domain
  | .neq (v :: _) => v.domain
  | .neq [] => .any
  | .mulof _ => .number
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
  | .nof _ _ | .must _ _ | .when _ _ _ | .contains _ _ | .rest _ _ | .select _ _ _ | .filter _ _ => .any
  | .ride _ v _ => v.super
  | .key => .anyString

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

/-! ## The marks

`type()` and `hide()` are the riders that mark a value (decision 10 of
the design note's §7). A mark rides every meet, as the riders do, so a
term carries one where one rides it at its own position, through `&`
and the other riders. -/

/-- Whether a term carries the mark `m` at its own position. -/
def Val.hasMark (m : Rider) : Val → Bool
  | .ride k v _ => decide (k = m) || v.hasMark m
  | .meet a b => a.hasMark m || b.hasMark m
  | _ => false

/-- Whether a term carries a mark, `type()` or `hide()`, at its own position. -/
def Val.marked (v : Val) : Bool := v.hasMark .type || v.hasMark .hide

/-! ## The key a spread is tried under

A spread holds every member of its container, and `key` in it reads the
key of the member it is tried on (decision 13 of the design note's §7):
a map's member's key, or a list's element's position, as a string. A
`key` stands at its spread's own position through `&`, the riders and
the scrutinee of a `match`, which is where the importer writes it, and
beneath any other form stands at none. -/

/-- A spread's term as it is tried on the member under the key `k`:
each `key` at the spread's own position read as the string `k`. -/
def Val.atKey (k : String) : Val → Val
  | .key => .lit (.str k)
  | .meet a b => .meet (a.atKey k) (b.atKey k)
  | .select s arms d => .select (s.atKey k) arms d
  | .ride t v r => .ride t (v.atKey k) r
  | v => v

/-- A term read under a key, where one is given. -/
def Val.atKeyO : Option String → Val → Val
  | none, v => v
  | some k, v => v.atKey k

/-- Whether a term holds a `key` at its own position, one `atKey` reads. -/
def Val.keyed : Val → Bool
  | .key => true
  | .meet a b => a.keyed || b.keyed
  | .select s _ _ => s.keyed
  | .ride _ v _ => v.keyed
  | _ => false

/-- A kind holds no `key`. -/
theorem Val.keyed_of_isKind {v : Val} (h : v.isKind = true) : v.keyed = false := by
  cases v <;> simp_all [Val.isKind, Val.keyed]
  rename_i v _
  exact Val.keyed_of_isKind h

/-- No parent type holds a `key`: the parent of `key` is every string, so a
spread's parent reads the same under any key. -/
theorem Val.keyed_super : ∀ v : Val, v.super.keyed = false
  | .meet a b => by
    simp only [Val.super]
    split
    · split
      · split
        · exact Val.keyed_super a
        · exact Val.keyed_super b
      · exact Val.keyed_of_isKind ‹_›
    · split
      · exact Val.keyed_of_isKind ‹_›
      · simp only [Val.keyed, Val.keyed_super a, Val.keyed_super b, Bool.or_self]
  | .ride _ v _ => by simp only [Val.super]; exact Val.keyed_super v
  | .pref _ x => by simp only [Val.super]; exact Val.keyed_super x
  | .lit (.num x) => by simp only [Val.super]; cases x.leaf <;> rfl
  | .lit (.str s) => by simp only [Val.super]; split <;> rfl
  | .min b | .max b | .above b | .beneath b | .neq (b :: _) => by
    simp only [Val.super]; cases b <;> rfl
  | .integer | .float | .biginteger | .bigdecimal | .number | .string | .anyString | .boolean
  | .mapKind | .listKind | .lit (.bool _) | .lit .null | .neq [] | .mulof _
  | .len _ | .unique _ | .re _ | .format _ | .any | .nil | .map _ _ _ | .list _ _ _ | .or _
  | .alias _ | .path _ | .nof _ _ | .must _ _ | .when _ _ _ | .contains _ _ | .rest _ _
  | .select _ _ _ | .filter _ _ | .key => rfl

/-- A term with no `key` at its own position is its own reading under
any key. -/
theorem Val.atKey_of_keyed (k : String) {v : Val} (h : v.keyed = false) : v.atKey k = v := by
  induction v using Val.atKey.induct with
  | case1 => exact nomatch h
  | case2 a b iha ihb =>
    simp only [Val.keyed, Bool.or_eq_false_iff] at h
    simp only [Val.atKey, iha h.1, ihb h.2]
  | case3 s arms d ih =>
    simp only [Val.keyed] at h
    simp only [Val.atKey, ih h]
  | case4 t v r ih =>
    simp only [Val.keyed] at h
    simp only [Val.atKey, ih h]
  | case5 v h1 h2 h3 h4 => exact Val.atKey.eq_5 k v h1 h2 h3 h4

end Aontu
