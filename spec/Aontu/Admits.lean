import Aontu.Syntax

/-!
# What a value admits

`Admits env root v j`: the data `j`, found inside the whole value
`root`, is an instance of the value `v`, where `env` holds the alias
declarations. Each rule is one constructor, and `Admits` holds exactly
when a finite derivation of it exists, so recursion through an alias
follows the data down and stops where the data stops. `nil` has no
rule: it admits nothing.
-/

namespace Aontu

inductive Admits (env : Env) (root : Data) : Val → Data → Prop
  | integer {x : Integer} : Admits env root .integer (.num (.integer x))
  | float {x : Float} : Admits env root .float (.num (.float x))
  | biginteger {x : BigInteger} : Admits env root .biginteger (.num (.biginteger x))
  | bigdecimal {x : BigDecimal} : Admits env root .bigdecimal (.num (.bigdecimal x))
  | number {x : Number} : Admits env root .number (.num x)
  | string {s : String} : s ≠ "" → Admits env root .string (.str s)
  | anyString {s : String} : Admits env root .anyString (.str s)
  | boolean {b : Bool} : Admits env root .boolean (.bool b)
  /-- A literal admits its own value alone, of its own leaf. -/
  | num {x : Number} : Admits env root (.lit (.num x)) (.num x)
  | str {s : String} : Admits env root (.lit (.str s)) (.str s)
  | bool {b : Bool} : Admits env root (.lit (.bool b)) (.bool b)
  | null : Admits env root (.lit .null) .null
  /-- The bounds read a number's exact value, and `multiple` the value
  it shows, which for a float is its shortest decimal. -/
  | min {n x : Number} : n.le x → Admits env root (.min n) (.num x)
  | max {n x : Number} : x.le n → Admits env root (.max n) (.num x)
  /-- `multiple(0)` and a negative divisor admit nothing. -/
  | multiple {d x : Number} : d.Positive → x.multipleOf d → Admits env root (.multiple d) (.num x)
  | any {j : Data} : Admits env root .any j
  /-- A map: every declared key that is present holds its value, and
  holds every declaration of it; a key that is absent is optional in
  every declaration; the spread holds every member, declared or not;
  a sealed map holds no key it does not declare. -/
  | map {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool}
      {jfs : List (String × Data)} :
      (∀ k o v x, (k, o, v) ∈ fs → lookup k jfs = some x → Admits env root v x) →
      (∀ k o v, (k, o, v) ∈ fs → lookup k jfs = none → o = true) →
      (∀ s, spread = some s → ∀ k x, (k, x) ∈ jfs → Admits env root s x) →
      (closed = true → ∀ k x, (k, x) ∈ jfs → ∃ o v, (k, o, v) ∈ fs) →
      Admits env root (.map fs spread closed) (.map jfs)
  /-- A list: each of its positions is present and holds its value;
  later elements are allowed; the spread holds every element. -/
  | list {items : List Val} {spread : Option Val} {xs : List Data} :
      items.length ≤ xs.length →
      (∀ (i : ℕ) (v : Val) (x : Data), items[i]? = some v → xs[i]? = some x →
        Admits env root v x) →
      (∀ s, spread = some s → ∀ x, x ∈ xs → Admits env root s x) →
      Admits env root (.list items spread) (.list xs)
  | meet {a b : Val} {j : Data} :
      Admits env root a j → Admits env root b j → Admits env root (.meet a b) j
  /-- An alias admits what its declaration admits; an undeclared one
  admits nothing. -/
  | alias {n : String} {v : Val} {j : Data} :
      env n = some v → Admits env root v j → Admits env root (.alias n) j
  /-- A path admits what the whole value holds at the path: the same
  value, compared as values. -/
  | path {p : List Seg} {j' j : Data} :
      root.at p = some j' → j'.Same j → Admits env root (.path p) j

/-- `j` is an instance of `v` under the declarations `env`: `j` is a
value, taken whole, so that it is its own root. This is the question
`aontu vet` answers. A Lean `Data` that is no value, a map that gives
one key twice, is no instance of anything, so it is never a witness. -/
abbrev Instance (env : Env) (v : Val) (j : Data) : Prop := j.WellFormed ∧ Admits env j v j

end Aontu
