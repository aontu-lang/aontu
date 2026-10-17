import Aontu.Core
import Aontu.Structures

/-!
# The tour's examples

The examples `docs/tutorial-definition.md` shows that the other modules
do not hold, each proved from the rules. Each one about admission is
also a transcript on that page, so the engines are held to the same
cases.
-/

namespace Aontu

/-! ## The data -/

/-- `{"a": 1}` is data. -/
example : Json.WellFormed (.obj [("a", .int 1)]) := by
  refine .obj (by decide) ?_
  intro k x h
  simp at h
  obtain ⟨-, rfl⟩ := h
  exact .num (by decide)

/-- `{"a": 1, "a": 2}` is not: it names `a` twice. -/
example : ¬ Json.WellFormed (.obj [("a", .int 1), ("a", .int 2)]) := by
  intro h
  cases h with
  | obj hn _ => revert hn; decide

/-- `1.50` is `1.5` in lowest terms, so `⟨150, 2, true⟩` is not a number
of the data. -/
example : ¬ (Num.mk 150 2 true).Lowest := by decide

/-! ## The two ends -/

/-- `any` admits `null`. -/
example : admits .top .null := trivial

/-- `nil` refuses `null`, and everything else. -/
example : ¬ admits .nil .null := fun h => h

/-- `any` admits `[1, "a"]`. -/
example : admits .top (.arr [.int 1, .str "a"]) := trivial

/-! ## Integers -/

/-- `integer` admits `3`. -/
example : admits .int (.int 3) := ⟨3, rfl, by simp [intRange]⟩

/-- `integer` refuses `"a"`. -/
example : ¬ admits .int (.str "a") := by simp [admits, Json.int?]

/-- `integer` refuses `9007199254740993`, which a float64 cannot hold. -/
example : ¬ admits .int (.int 9007199254740993) := by
  simp [admits, intRange, Json.int, Json.int?, Num.int?]

/-- `number & multiple(1)` admits it. -/
example : admits .wholeNum (.int 9007199254740993) := ⟨_, rfl⟩

/-- `integer` admits `1.0`, whose value is the integer `1`. -/
example : admits .int (.dec 1 0) := ⟨1, rfl, by simp [intRange]⟩

/-- `integer` refuses `1.5`. -/
example : ¬ admits .int (.dec 15 1) := by
  simp [admits, Json.dec, Json.int?, Num.int?]

/-! ## Strings -/

/-- `string` admits `"a"`. -/
example : admits .str (.str "a") := ⟨"a", rfl, by decide⟩

/-- `string` refuses `""`. -/
example : ¬ admits .str (.str "") := by simp [admits]

/-- `string & empty()` admits `""`. -/
example : admits .anyStr (.str "") := ⟨"", rfl⟩

/-! ## Bounds -/

/-- `min(3)` admits `3`. -/
example : admits (.min 3) (.int 3) := ⟨_, rfl, by decide⟩

/-- `min(3)` refuses `2`. -/
example : ¬ admits (.min 3) (.int 2) := by
  simp [admits, Json.int, Num.atLeast]

/-- `min(3)` admits `3.5`. -/
example : admits (.min 3) (.dec 35 1) := ⟨_, rfl, by decide⟩

/-! ## Keys -/

/-- `{x: integer}` admits `{"x": 1}`. -/
example : admits (.field "x" false .int) (.obj [("x", .int 1)]) := by
  simp [admits, keyOk, Json.get?, Json.isObj, lookup, intRange, Json.int, Json.int?, Num.int?]

/-- `{x: integer}` refuses `{}`. -/
example : ¬ admits (.field "x" false .int) (.obj []) := by
  simp [admits, keyOk, Json.get?, Json.isObj, lookup]

/-- `{x?: integer}` admits `{}`. -/
example : admits (.field "x" true .int) (.obj []) := by
  simp [admits, keyOk, Json.get?, Json.isObj, lookup]

/-- `{x?: integer}` refuses `{"x": "a"}`. -/
example : ¬ admits (.field "x" true .int) (.obj [("x", .str "a")]) := by
  simp [admits, keyOk, Json.get?, Json.isObj, lookup, Json.int?]

/-- `{x?: integer}` refuses `[]`: an array is not a map. -/
example : ¬ admits (.field "x" true .int) (.arr []) := by
  simp [admits, Json.isObj]

/-! ## Conjunction -/

/-- `integer & min(3)` admits `7`. -/
example : admits (.meet .int (.min 3)) (.int 7) :=
  ⟨⟨7, rfl, by simp [intRange]⟩, ⟨_, rfl, by decide⟩⟩

/-- `integer & min(3)` refuses `2`. -/
example : ¬ admits (.meet .int (.min 3)) (.int 2) := by
  simp [admits, Json.int, Num.atLeast]

/-! ## The order -/

/-- `integer` is above `integer & min(3)`. -/
example : Val.meet .int (.min 3) ⊑ .int := meet_le_left _ _

/-- `integer & min(3)` is not above `integer`: `2` is the instance that
shows it. -/
example : ¬ (Val.int ⊑ Val.meet .int (.min 3)) := fun h =>
  absurd (h (.int 2) ⟨2, rfl, by simp [intRange]⟩) (by simp [admits, Json.int, Num.atLeast])

/-! ## Two declarations of one key -/

/-- `{x?: integer} & {x: integer}` refuses `{}`: the key is required. -/
example : ¬ admits (mergeField "x" true false .int .int) (.obj []) := by
  simp [mergeField, admits, keyOk, Json.get?, Json.isObj, lookup]

/-- It admits `{"x": 1}`. -/
example : admits (mergeField "x" true false .int .int) (.obj [("x", .int 1)]) := by
  simp [mergeField, admits, keyOk, Json.get?, Json.isObj, lookup, intRange, Json.int, Json.int?,
    Num.int?]

/-! ## Where the engines answer otherwise -/

/-- `string & (string & empty())` refuses `""`, which both engines admit. -/
example : ¬ admits (.meet .str .anyStr) (.str "") :=
  no_meet_with_str_admits_empty _

/-- `{x?: string} & {x?: integer}` admits `{}`, where both engines answer
`error`. -/
example : admits (.meet (.field "x" true .str) (.field "x" true .int)) (.obj []) := by
  simp [admits, keyOk, Json.get?, Json.isObj, lookup]

end Aontu

namespace Spec

open Aontu

/-- `*1 | integer` refuses `"a"`: neither branch admits it. -/
example : ¬ Admits noAlias .null (.join (.pref (.lit (.int 1))) .integer) (.str "a") := by
  intro h
  cases h with
  | joinL h => cases h with | pref h => cases h
  | joinR h => cases h with | integer h => simp [Json.int?] at h

end Spec
