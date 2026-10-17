import Aontu.Data

/-!
# A sketch of a formal aontu definition

A fragment, to show the shape the definition would take: a few value
forms over the data of `Aontu.Data`, what a value admits, the order and
the meet, one engine rule (ADR-045) proved against the definition, and
the JSON Schema import in its two modes. Core Lean 4 only, no Mathlib.
-/

namespace Aontu

/-- The value forms of the fragment. -/
inductive Val where
  | top                                       -- `any`
  | nil                                       -- `nil`
  | int                                       -- `integer`
  | wholeNum                                  -- `number & multiple(1)`
  | str                                       -- `string`, never `""`
  | anyStr                                    -- `string & empty()`
  | min (m : Int)                             -- `min(m)`
  | field (k : String) (opt : Bool) (v : Val) -- a map holding `k: v`, or `k?: v`
  | meet (a b : Val)                          -- `a & b`

/-- The integers `integer` holds. Simplified: the engine also holds the
larger integers a float64 represents exactly, such as 10^18. -/
def intRange (n : Int) : Prop := n.natAbs ≤ 9007199254740992

/-- A key's slot: an absent key passes only where the key is optional. -/
def keyOk (opt : Bool) (p : Json → Prop) : Option Json → Prop
  | none => opt = true
  | some x => p x

/-- `admits v j`: the JSON `j` is an instance of the value `v`, its numbers
read by value, as `--exact-numbers` reads them. This is the definition
every engine answer is held to. -/
def admits : Val → Json → Prop
  | .top, _ => True
  | .nil, _ => False
  | .int, j => ∃ n, j.int? = some n ∧ intRange n
  | .wholeNum, j => ∃ n, j.int? = some n
  | .str, j => ∃ s, j = .str s ∧ s ≠ ""
  | .anyStr, j => ∃ s, j = .str s
  | .min m, j => ∃ x, j = .num x ∧ x.atLeast m
  | .field k opt v, j => j.isObj = true ∧ keyOk opt (admits v) (j.get? k)
  | .meet a b, j => admits a j ∧ admits b j

/-! ## The order, and the meet as its greatest lower bound -/

/-- `a ⊑ b`: every instance of `a` is an instance of `b`. `subsume b a`
answers this question. -/
def Le (a b : Val) : Prop := ∀ j, admits a j → admits b j

infix:50 " ⊑ " => Le

theorem meet_le_left (a b : Val) : Val.meet a b ⊑ a := fun _ h => h.1
theorem meet_le_right (a b : Val) : Val.meet a b ⊑ b := fun _ h => h.2
theorem le_meet {a b c : Val} (ha : c ⊑ a) (hb : c ⊑ b) : c ⊑ Val.meet a b :=
  fun j h => ⟨ha j h, hb j h⟩

/-! ## An engine rule, proved against the definition

The engine merges two declarations of one key into one field. ADR-045:
the merged key is optional only where every side says so. -/

def mergeField (k : String) (o₁ o₂ : Bool) (v₁ v₂ : Val) : Val :=
  .field k (o₁ && o₂) (.meet v₁ v₂)

/-- The rule before ADR-045, "optionality is additive" (#298). -/
def mergeFieldOld (k : String) (o₁ o₂ : Bool) (v₁ v₂ : Val) : Val :=
  .field k (o₁ || o₂) (.meet v₁ v₂)

theorem keyOk_and (o₁ o₂ : Bool) (p q : Json → Prop) (x : Option Json) :
    keyOk (o₁ && o₂) (fun y => p y ∧ q y) x ↔ keyOk o₁ p x ∧ keyOk o₂ q x := by
  cases x <;> simp [keyOk]

/-- The merge is exact: it admits what the two declarations admit together. -/
theorem mergeField_exact (k : String) (o₁ o₂ : Bool) (v₁ v₂ : Val) (j : Json) :
    admits (mergeField k o₁ o₂ v₁ v₂) j ↔
      admits (.meet (.field k o₁ v₁) (.field k o₂ v₂)) j := by
  simp only [mergeField, admits]
  rw [keyOk_and]
  constructor
  · rintro ⟨hi, h₁, h₂⟩; exact ⟨⟨hi, h₁⟩, hi, h₂⟩
  · rintro ⟨⟨hi, h₁⟩, -, h₂⟩; exact ⟨hi, h₁, h₂⟩

/-- The old rule fails the same statement: `{x?: integer} & {x: integer}`
admitted `{}`. A definition like this one would have refused it. -/
theorem mergeFieldOld_admits_too_much :
    admits (mergeFieldOld "x" true false .int .int) (.obj []) ∧
      ¬ admits (.meet (.field "x" true .int) (.field "x" false .int)) (.obj []) := by
  refine ⟨?_, ?_⟩
  · simp [mergeFieldOld, admits, keyOk, Json.get?, Json.isObj, lookup]
  · simp [admits, keyOk, Json.get?, Json.isObj, lookup]

/-- `string & empty()` admits `""`, which `string` refuses, so in a calculus
whose meet is a greatest lower bound it is not a meet: no meet with
`string` admits `""`. It is a value form of its own (`anyStr`). -/
theorem no_meet_with_str_admits_empty (b : Val) :
    ¬ admits (.meet .str b) (.str "") := by
  simp [admits]

/-! ## The JSON Schema import, in its two modes -/

/-- A JSON Schema fragment: `type` and `allOf`. -/
inductive Schema where
  | typeString
  | typeInteger
  | allOf (a b : Schema)

/-- What a 2020-12 validator answers for the fragment, where an integer is
a number whose value is whole, `1.0` included. -/
def valid : Schema → Json → Prop
  | .typeString, j => ∃ s, j = .str s
  | .typeInteger, j => ∃ n, j.int? = some n
  | .allOf a b, j => valid a j ∧ valid b j

/-- `--faithful`. -/
def importFaithful : Schema → Val
  | .typeString => .anyStr
  | .typeInteger => .wholeNum
  | .allOf a b => .meet (importFaithful a) (importFaithful b)

/-- The default, natural translation. -/
def importNatural : Schema → Val
  | .typeString => .str
  | .typeInteger => .int
  | .allOf a b => .meet (importNatural a) (importNatural b)

/-- `--faithful` admits exactly what a validator admits. -/
theorem faithful_exact (s : Schema) (j : Json) :
    admits (importFaithful s) j ↔ valid s j := by
  induction s generalizing j with
  | typeString => simp [importFaithful, admits, valid]
  | typeInteger => simp [importFaithful, admits, valid]
  | allOf a b iha ihb => simp [importFaithful, admits, valid, iha, ihb]

/-- The natural mode may refuse what a validator admits, and never admits
what a validator refuses. -/
theorem natural_sound (s : Schema) (j : Json) :
    admits (importNatural s) j → valid s j := by
  induction s generalizing j with
  | typeString =>
    simp only [importNatural, admits, valid]
    rintro ⟨s, rfl, -⟩; exact ⟨s, rfl⟩
  | typeInteger =>
    simp only [importNatural, admits, valid]
    rintro ⟨n, h, -⟩; exact ⟨n, h⟩
  | allOf a b iha ihb =>
    simp only [importNatural, admits, valid]
    exact fun ⟨ha, hb⟩ => ⟨iha j ha, ihb j hb⟩

/-- The natural mode's departures, stated as theorems rather than prose. -/
theorem natural_refuses_empty_string :
    valid .typeString (.str "") ∧ ¬ admits (importNatural .typeString) (.str "") := by
  simp [valid, importNatural, admits]

theorem natural_refuses_beyond_float64 :
    valid .typeInteger (.int 9007199254740993) ∧
      ¬ admits (importNatural .typeInteger) (.int 9007199254740993) := by
  refine ⟨⟨_, rfl⟩, ?_⟩
  simp only [importNatural, admits, intRange]
  rintro ⟨n, h, hr⟩
  simp [Json.int, Json.int?, Num.int?] at h
  subst h
  revert hr; decide

/-! ## A checker is admitted only with a proof

`admits` computes nothing; Lean refuses to run it
(`#eval decide (admits .int (.int 3))`: failed to synthesize `Decidable`).
`check` is an algorithm, and `check_iff` is what lets its answers stand in
for the definition's. Without that theorem it would be a third port. -/

def check : Val → Json → Bool
  | .top, _ => true
  | .nil, _ => false
  | .int, j => match j.int? with
    | some n => decide (n.natAbs ≤ 9007199254740992)
    | none => false
  | .wholeNum, j => j.int?.isSome
  | .str, .str s => s != ""
  | .str, _ => false
  | .anyStr, .str _ => true
  | .anyStr, _ => false
  | .min m, .num x => decide (x.atLeast m)
  | .min _, _ => false
  | .field k opt v, j =>
    j.isObj && (match j.get? k with
      | none => opt
      | some x => check v x)
  | .meet a b, j => check a j && check b j

theorem check_iff (v : Val) (j : Json) : check v j = true ↔ admits v j := by
  induction v generalizing j with
  | top => simp [check, admits]
  | nil => simp [check, admits]
  | int =>
    simp only [check, admits]
    cases j.int? <;> simp [intRange]
  | wholeNum =>
    simp only [check, admits]
    cases j.int? <;> simp
  | str => cases j <;> simp [check, admits]
  | anyStr => cases j <;> simp [check, admits]
  | min m => cases j <;> simp [check, admits]
  | field k opt v ih =>
    simp only [check, admits, Bool.and_eq_true]
    cases j.get? k with
    | none => simp [keyOk]
    | some x => simp [keyOk, ih]
  | meet a b iha ihb => simp [check, admits, Bool.and_eq_true, iha, ihb]

#eval check (.meet .int (.min 3)) (.int 7)
#eval check (.field "x" false .int) (.obj [])

end Aontu
