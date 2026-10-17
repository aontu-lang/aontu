import Aontu.Admits

/-!
# The JSON Schema import

What a 2020-12 validator admits, for a fragment of the keywords, and
the import's two modes as two functions with two contracts: `--faithful`
admits exactly what the validator admits, and the natural default
never admits what the validator refuses. The natural mode's departures
are theorems rather than prose.
-/

namespace Aontu

/-- A JSON Schema fragment. -/
inductive Schema where
  | typeString               -- `{"type": "string"}`
  | typeInteger              -- `{"type": "integer"}`
  | allOf (a b : Schema)     -- `{"allOf": [a, b]}`

/-- What a 2020-12 validator answers, where an integer is a number
whose value is whole, `1.0` included. -/
def Schema.valid : Schema → Json → Prop
  | .typeString, j => ∃ s, j = .str s
  | .typeInteger, j => ∃ n, j.int? = some n
  | .allOf a b, j => a.valid j ∧ b.valid j

/-- `--faithful`: the spellings that admit what a validator admits. -/
def importFaithful : Schema → Val
  | .typeString => .anyString
  | .typeInteger => .meet .number (.multiple (.ofInt 1))
  | .allOf a b => .meet (importFaithful a) (importFaithful b)

/-- The default: the natural aontu equivalent of each keyword. -/
def importNatural : Schema → Val
  | .typeString => .string
  | .typeInteger => .integer
  | .allOf a b => .meet (importNatural a) (importNatural b)

theorem faithful_exact (s : Schema) (env : Env) (root j : Json) :
    Admits env root (importFaithful s) j ↔ s.valid j := by
  induction s generalizing j with
  | typeString =>
    constructor
    · intro h; cases h; exact ⟨_, rfl⟩
    · rintro ⟨_, rfl⟩; exact .anyString
  | typeInteger =>
    constructor
    · intro h
      cases h with
      | meet hn hm =>
        cases hn
        cases hm with
        | multiple _ hd => exact (Num.multipleOf_one _).mp hd
    · rintro ⟨n, hn⟩
      cases j with
      | num x => exact .meet .number (.multiple (by decide) ((Num.multipleOf_one x).mpr ⟨n, hn⟩))
      | _ => cases hn
  | allOf a b iha ihb =>
    constructor
    · intro h; cases h with | meet h₁ h₂ => exact ⟨(iha j).mp h₁, (ihb j).mp h₂⟩
    · rintro ⟨h₁, h₂⟩; exact .meet ((iha j).mpr h₁) ((ihb j).mpr h₂)

theorem natural_sound (s : Schema) (env : Env) (root j : Json) :
    Admits env root (importNatural s) j → s.valid j := by
  induction s generalizing j with
  | typeString => intro h; cases h; exact ⟨_, rfl⟩
  | typeInteger => intro h; cases h with | integer hx _ => exact ⟨_, hx⟩
  | allOf a b iha ihb => intro h; cases h with | meet h₁ h₂ => exact ⟨iha j h₁, ihb j h₂⟩

/-- A validator admits `""` as a string; `string` refuses it. -/
theorem natural_refuses_empty_string (env : Env) (root : Json) :
    Schema.typeString.valid (.str "") ∧ ¬ Admits env root (importNatural .typeString) (.str "") :=
  ⟨⟨_, rfl⟩, fun h => by cases h with | string h => exact h rfl⟩

/-- A validator admits `9007199254740993` as an integer; `integer`
refuses it, since no double holds it. -/
theorem natural_refuses_outside_integer_leaf (env : Env) (root : Json) :
    Schema.typeInteger.valid (.int 9007199254740993) ∧
      ¬ Admits env root (importNatural .typeInteger) (.int 9007199254740993) := by
  refine ⟨⟨_, rfl⟩, fun h => ?_⟩
  cases h with
  | integer hx hl =>
    simp [Num.ofInt, Num.int?] at hx
    subst hx
    exact absurd hl (by decide)

end Aontu
