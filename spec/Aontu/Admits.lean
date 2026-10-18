import Aontu.Syntax

/-!
# What a value admits

`Admits env root v j`: the JSON value `j`, found inside the whole value
`root`, is an instance of the value `v`, where `env` holds the alias
declarations. Each rule is one constructor, and `Admits` holds exactly
when a finite derivation of it exists, so recursion through an alias
follows the data down and stops where the data stops. `nil` has no
rule: it admits nothing.
-/

namespace Aontu

inductive Admits (env : Env) (root : Json) : Val → Json → Prop
  | boolean {b : Bool} : Admits env root .boolean (.bool b)
  | number {x : Num} : Admits env root .number (.num x)
  | integer {x : Num} {n : Int} :
      x.int? = some n → IntegerLeaf n → Admits env root .integer (.num x)
  | string {s : String} : s ≠ "" → Admits env root .string (.str s)
  | anyString {s : String} : Admits env root .anyString (.str s)
  | null : Admits env root (.lit .null) .null
  | bool {b : Bool} : Admits env root (.lit (.bool b)) (.bool b)
  /-- An integer literal is a value of the `integer` kind: it admits the
  number it is, where the kind holds that integer. -/
  | int {n : Int} {x : Num} :
      x.int? = some n → IntegerLeaf n → Admits env root (.lit (.int n)) (.num x)
  | str {s : String} : Admits env root (.lit (.str s)) (.str s)
  | min {n x : Num} : n.le x → Admits env root (.min n) (.num x)
  | max {n x : Num} : x.le n → Admits env root (.max n) (.num x)
  /-- `multiple(0)` and a negative divisor admit nothing. -/
  | multiple {d x : Num} : 0 < d.coef → x.multipleOf d → Admits env root (.multiple d) (.num x)
  | any {j : Json} : Admits env root .any j
  /-- A map: every declared key that is present holds its value, and
  holds every declaration of it; a key that is absent is optional in
  every declaration; the spread holds every member, declared or not;
  a sealed map holds no key it does not declare. -/
  | map {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool}
      {jfs : List (String × Json)} :
      (∀ k o v x, (k, o, v) ∈ fs → lookup k jfs = some x → Admits env root v x) →
      (∀ k o v, (k, o, v) ∈ fs → lookup k jfs = none → o = true) →
      (∀ s, spread = some s → ∀ k x, (k, x) ∈ jfs → Admits env root s x) →
      (closed = true → ∀ k x, (k, x) ∈ jfs → ∃ o v, (k, o, v) ∈ fs) →
      Admits env root (.map fs spread closed) (.obj jfs)
  /-- A list: every written position is present and holds its value;
  later elements are allowed; the spread holds every element. -/
  | list {items : List Val} {spread : Option Val} {xs : List Json} :
      items.length ≤ xs.length →
      (∀ (i : Nat) (v : Val) (x : Json), items[i]? = some v → xs[i]? = some x →
        Admits env root v x) →
      (∀ s, spread = some s → ∀ x, x ∈ xs → Admits env root s x) →
      Admits env root (.list items spread) (.arr xs)
  | meet {a b : Val} {j : Json} :
      Admits env root a j → Admits env root b j → Admits env root (.meet a b) j
  /-- An alias admits what its declaration admits; an undeclared one
  admits nothing. -/
  | alias {n : String} {v : Val} {j : Json} :
      env n = some v → Admits env root v j → Admits env root (.alias n) j
  /-- A path admits what the whole value holds at the path: the same
  value, compared as values. -/
  | path {p : List Seg} {j' j : Json} :
      root.at p = some j' → j'.Same j → Admits env root (.path p) j

/-- `j` is an instance of `v` under the declarations `env`: `j` is a JSON
value, taken whole, so that it is its own root. This is the question
`aontu vet` answers. A Lean `Json` that is no JSON value, such as an
object that gives one name twice, is no instance of anything, so it is
never a witness. -/
abbrev Instance (env : Env) (v : Val) (j : Json) : Prop := j.WellFormed ∧ Admits env j v j

end Aontu
