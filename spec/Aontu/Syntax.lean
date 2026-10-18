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
  | list (items : List Val) (spread : Option Val)  -- `[a, b, &: s]`
  | meet (a b : Val)                        -- `a & b`
  | alias (n : String)                      -- `%n`
  | path (p : List Seg)                     -- `$.a.b`

/-- The alias declarations of a document: `%T = v` is `env "T" = some v`. -/
abbrev Env := String → Option Val

/-- The declarations of a document that declares no alias. -/
def Env.empty : Env := fun _ => none

end Aontu
