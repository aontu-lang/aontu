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
  | min (n : Number)                        -- `min(n)`
  | max (n : Number)                        -- `max(n)`
  | multiple (d : Number)                   -- `multiple(d)`
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
