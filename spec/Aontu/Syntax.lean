import Aontu.Data

/-!
# The values

The abstract syntax of the values the definition holds, one
constructor per construct. The concrete grammar is the reference's,
and a parser is an implementation.
-/

namespace Aontu

/-- A literal scalar. A number literal is an integer written without a
point and without `0d`: `1.5` and `0d5` are literals of the float,
biginteger and bigdecimal leaves, which the definition does not yet
hold. -/
inductive Scalar where
  | null
  | bool (b : Bool)
  | int (n : Int)
  | str (s : String)

/-- A value, each constructor beside its spelling. `close()` seals every
map and list beneath it, and `open()` unseals; a map here carries its
own seal, as `close()` leaves each one, and a list is open. -/
inductive Val where
  | any                                     -- `any`
  | nil                                     -- `nil`
  | boolean                                 -- `boolean`
  | number                                  -- `number`
  | integer                                 -- `integer`
  | string                                  -- `string`, which is never `""`
  | anyString                               -- `string & empty()`
  | lit (s : Scalar)                        -- `null`, `true`, `3`, `"a"`
  | min (n : Num)                           -- `min(n)`
  | max (n : Num)                           -- `max(n)`
  | multiple (d : Num)                      -- `multiple(d)`
  | map (fs : List (String × Bool × Val)) (spread : Option Val) (closed : Bool)
                                            -- `{k: v, k?: v, &: s}`, sealed or not
  | list (items : List Val) (spread : Option Val)  -- `[a, b, &: s]`
  | meet (a b : Val)                        -- `a & b`
  | alias (n : String)                      -- `%n`
  | path (p : List Seg)                     -- `$.a.b`

/-- The alias declarations of a document: `%T = v` is `env "T" = some v`. -/
abbrev Env := String → Option Val

/-- The declarations of a document that declares no alias. -/
def Env.empty : Env := fun _ => none

end Aontu
