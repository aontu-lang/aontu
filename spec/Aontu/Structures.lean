import Aontu.Data

/-!
# aontu's structures, defined

One rule per construct, and facts proved from the rules. Every fact below
matches what both CLIs answer at `9aa985c`, checked before this was
written. Core Lean 4 only.
-/

namespace Spec

open Aontu

/-! ## The value forms -/

inductive Val where
  | any                                         -- `any`
  | nil                                         -- `nil`
  | null                                        -- `null`
  | boolean                                     -- `boolean`
  | number                                      -- `number`
  | integer                                     -- `integer`
  | string                                      -- `string`
  | anyString                                   -- `string & empty()`
  | lit (j : Json)                              -- `1`, `"a"`, `true`
  | min (n : Int)                               -- `min(n)`
  | max (n : Int)                               -- `max(n)`
  | len (lo : Nat)                              -- `len(min(lo))`, on a list
  | map (fs : List (String × Bool × Val)) (spread : Option Val) (closed : Bool)
                                                -- `{k: v, k?: v, &: s}`, `closed` by `close()`
  | list (items : List Val) (spread : Option Val)  -- `[a, b, &: s]`
  | meet (a b : Val)                            -- `a & b`
  | join (a b : Val)                            -- `a | b`
  | pref (a : Val)                              -- `*a`
  | alias (n : String)                          -- `%n`
  | path (p : List Seg)                         -- `$.a.b`

/-! ## What a value admits

`Admits env root v j`: the JSON `j`, found inside the whole instance
`root`, is an instance of `v`, with aliases defined by `env`. One
constructor per rule. -/

inductive Admits (env : String → Val) (root : Json) : Val → Json → Prop
  | any {j : Json} : Admits env root .any j
  | null : Admits env root .null .null
  | boolean {b : Bool} : Admits env root .boolean (.bool b)
  | number {x : Num} : Admits env root .number (.num x)
  | integer {j : Json} {n : Int} : j.int? = some n → Admits env root .integer j
  | string {s : String} : s ≠ "" → Admits env root .string (.str s)
  | anyString {s : String} : Admits env root .anyString (.str s)
  | lit {j : Json} : Admits env root (.lit j) j
  | min {m : Int} {x : Num} : x.atLeast m → Admits env root (.min m) (.num x)
  | max {m : Int} {x : Num} : x.atMost m → Admits env root (.max m) (.num x)
  | len {lo : Nat} {xs : List Json} : lo ≤ xs.length → Admits env root (.len lo) (.arr xs)
  /-- A map: every declared key that is present holds its value; a key that
  is absent is optional; the spread holds every member, declared or not;
  a closed map holds no key it does not declare. -/
  | map {fs : List (String × Bool × Val)} {spread : Option Val} {closed : Bool}
      {jfs : List (String × Json)} :
      (∀ k o v x, (k, o, v) ∈ fs → lookup k jfs = some x → Admits env root v x) →
      (∀ k o v, (k, o, v) ∈ fs → lookup k jfs = none → o = true) →
      (∀ s, spread = some s → ∀ k x, (k, x) ∈ jfs → Admits env root s x) →
      (closed = true → ∀ k x, (k, x) ∈ jfs → ∃ o v, (k, o, v) ∈ fs) →
      Admits env root (.map fs spread closed) (.obj jfs)
  /-- A list: every written position is present and holds its value; later
  elements are allowed; the spread holds every element. -/
  | list {items : List Val} {spread : Option Val} {xs : List Json} :
      items.length ≤ xs.length →
      (∀ (i : Nat) (v : Val) (x : Json), items[i]? = some v → xs[i]? = some x →
        Admits env root v x) →
      (∀ s, spread = some s → ∀ x, x ∈ xs → Admits env root s x) →
      Admits env root (.list items spread) (.arr xs)
  | meet {a b : Val} {j : Json} :
      Admits env root a j → Admits env root b j → Admits env root (.meet a b) j
  | joinL {a b : Val} {j : Json} : Admits env root a j → Admits env root (.join a b) j
  | joinR {a b : Val} {j : Json} : Admits env root b j → Admits env root (.join a b) j
  /-- A preference does not narrow what is admitted; it matters to `Gen`. -/
  | pref {a : Val} {j : Json} : Admits env root a j → Admits env root (.pref a) j
  | alias {n : String} {j : Json} : Admits env root (env n) j → Admits env root (.alias n) j
  /-- A path reference admits the instance's own value at that path. -/
  | path {p : List Seg} {j : Json} : root.at p = some j → Admits env root (.path p) j

def noAlias : String → Val := fun _ => .any

/-! ### Lists: positions are required, and the list stays open -/

/-- `[integer, string]` admits `[1, "a", true]`. -/
example : Admits noAlias .null (.list [.integer, .string] none)
    (.arr [.int 1, .str "a", .bool true]) := by
  refine .list (by decide) ?_ ?_
  · intro i v x hv hx
    rcases i with _ | _ | i
    · simp at hv hx; subst hv; subst hx; exact .integer rfl
    · simp at hv hx; subst hv; subst hx; exact .string (by decide)
    · simp at hv
  · intro s hs; cases hs

/-- `[integer, string]` refuses `[1]`. -/
example : ¬ Admits noAlias .null (.list [.integer, .string] none) (.arr [.int 1]) := by
  intro h
  cases h with
  | list hlen _ _ => simp at hlen

/-! ### Maps: `close()` refuses an undeclared key, not a missing optional one -/

/-- `close({a: integer})` refuses `{"a": 1, "b": 2}`. -/
example : ¬ Admits noAlias .null (.map [("a", false, .integer)] none true)
    (.obj [("a", .int 1), ("b", .int 2)]) := by
  intro h
  cases h with
  | map _ _ _ hc =>
    obtain ⟨o, v, hm⟩ := hc rfl "b" (.int 2) (by simp)
    simp at hm

/-- `close({a?: integer})` admits `{}`. -/
example : Admits noAlias .null (.map [("a", true, .integer)] none true) (.obj []) := by
  refine .map ?_ ?_ ?_ ?_
  · intro k o v x _ hx; simp [lookup] at hx
  · intro k o v hm _; simp at hm; exact hm.2.1
  · intro s hs; cases hs
  · intro _ k x hx; simp at hx

/-! ### Disjunction and preference: `*1 | integer` admits 5 -/

example : Admits noAlias .null (.join (.pref (.lit (.int 1))) .integer) (.int 5) :=
  .joinR (.integer rfl)

/-! ### Path references: `{x: $.y, y: integer}` -/

abbrev refDoc : Val := .map [("x", false, .path [.key "y"]), ("y", false, .integer)] none false

abbrev inst (x y : Int) : Json := .obj [("x", .int x), ("y", .int y)]

/-- It admits `{"x": 1, "y": 1}`. -/
example : Admits noAlias (inst 1 1) refDoc (inst 1 1) := by
  refine .map ?_ ?_ ?_ ?_
  · intro k o v x hm hx
    simp at hm
    rcases hm with ⟨rfl, -, rfl⟩ | ⟨rfl, -, rfl⟩
    · simp [lookup] at hx; subst hx; exact .path (by simp [Json.at, lookup])
    · simp [lookup] at hx; subst hx; exact .integer rfl
  · intro k o v hm hx
    simp at hm
    rcases hm with ⟨rfl, -, -⟩ | ⟨rfl, -, -⟩ <;> simp [lookup] at hx
  · intro s hs; cases hs
  · intro hc; cases hc

/-- It refuses `{"x": 1, "y": 2}`. -/
example : ¬ Admits noAlias (inst 1 2) refDoc (inst 1 2) := by
  intro h
  cases h with
  | map hp _ _ _ =>
    have hx := hp "x" false (.path [.key "y"]) (.int 1) (by simp) (by simp [lookup])
    cases hx with
    | path hat => simp [Json.at, lookup, Json.int] at hat

/-! ## What evaluation outputs

Admission is one question; output is another. `Gen env v j` says `j` is an
output `v` can single out, and `Output` asks that it be the only one: two
candidates and evaluation has no answer. Scalars only, in this sketch. -/

inductive Gen (env : String → Val) : Val → Json → Prop
  | lit {j : Json} : Gen env (.lit j) j
  | meetL {a b : Val} {j : Json} : Gen env a j → Admits env j b j → Gen env (.meet a b) j
  | meetR {a b : Val} {j : Json} : Admits env j a j → Gen env b j → Gen env (.meet a b) j
  | prefer {a b : Val} {j : Json} : Gen env a j → Gen env (.join (.pref a) b) j

def Output (env : String → Val) (v : Val) (j : Json) : Prop :=
  Gen env v j ∧ ∀ j', Gen env v j' → j' = j

/-- `*1 | integer` evaluates to `1`. -/
example : Output noAlias (.join (.pref (.lit (.int 1))) .integer) (.int 1) := by
  refine ⟨.prefer .lit, ?_⟩
  intro j' h
  cases h with
  | prefer h' => cases h'; rfl

/-- `integer & 1` evaluates to `1`. -/
example : Output noAlias (.meet .integer (.lit (.int 1))) (.int 1) := by
  refine ⟨.meetR (.integer rfl) .lit, ?_⟩
  intro j' h
  cases h with
  | meetL h' _ => cases h'
  | meetR _ h' => cases h'; rfl

/-- `1 | 2` evaluates to nothing. -/
example : ¬ ∃ j, Output noAlias (.join (.lit (.int 1)) (.lit (.int 2))) j := by
  rintro ⟨j, h, -⟩
  cases h

/-! ## Trial schemas: where negation enters

`not`, `when` and `nof` ask whether a value is NOT admitted, which an
inductive rule cannot say about itself. They live in a layer above
`Admits`, defined by recursion on the trial schema, in classical logic:
"how many branches admit" is a definition here, not a computation. -/

inductive Trial where
  | is (v : Val)                          -- a value, tried as a schema
  | not (c : Trial)                       -- JSON Schema's `not`
  | when (c t e : Trial)                  -- `when(c, t, e)`
  | nof (lo hi : Nat) (cs : List Trial)   -- `nof(n, ...c)`, as a range

noncomputable section
open Classical

mutual
def holds (env : String → Val) (root : Json) : Trial → Json → Prop
  | .is v, j => Admits env root v j
  | .not c, j => ¬ holds env root c j
  | .when c t e, j =>
    (holds env root c j ∧ holds env root t j) ∨ (¬ holds env root c j ∧ holds env root e j)
  | .nof lo hi cs, j => lo ≤ count env root cs j ∧ count env root cs j ≤ hi

def count (env : String → Val) (root : Json) : List Trial → Json → Nat
  | [], _ => 0
  | c :: cs, j => (if holds env root c j then 1 else 0) + count env root cs j
end

/-- `oneOf: [integer, minimum 0]` is `nof(1, 1, …)`: it admits `-1`, which
one branch admits. -/
example : holds noAlias .null (.nof 1 1 [.is .integer, .is (.min 0)]) (.int (-1)) := by
  have h₁ : Admits noAlias .null .integer (.int (-1)) := .integer rfl
  have h₂ : ¬ Admits noAlias .null (.min 0) (.int (-1)) := by
    intro h; cases h with | min hle => revert hle; decide
  simp only [holds, count]
  rw [if_pos h₁, if_neg h₂]
  decide

/-- …and refuses `3`, which both admit. -/
example : ¬ holds noAlias .null (.nof 1 1 [.is .integer, .is (.min 0)]) (.int 3) := by
  have h₁ : Admits noAlias .null .integer (.int 3) := .integer rfl
  have h₂ : Admits noAlias .null (.min 0) (.int 3) := .min (by decide)
  simp only [holds, count]
  rw [if_pos h₁, if_pos h₂]
  decide

end

end Spec
