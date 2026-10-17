import Aontu.Order
import Aontu.Trial
import Aontu.Check

/-!
# The tour's examples

The examples `docs/tutorial-definition.md` walks through, each proved
from the rules. Each one about admission is also a transcript on that
page, so the engines are held to the same cases.
-/

namespace Aontu

/-! ## The data -/

/-- `{"a": 1}` is data. -/
example : Json.WellFormed (.obj [("a", .int 1)]) := by
  refine .obj (by decide) ?_
  intro k x h
  cases List.mem_singleton.mp h
  exact .num (by decide)

/-- `{"a": 1, "a": 2}` is not: it names `a` twice. -/
example : ¬ Json.WellFormed (.obj [("a", .int 1), ("a", .int 2)]) := by
  intro h
  cases h with
  | obj hn _ => revert hn; decide

/-- `1.50` is `1.5` in lowest terms, so `⟨150, 2, true⟩` is not a number
of the data. -/
example : ¬ (Num.mk 150 2 true).Lowest := by decide

/-- A double holds `2 ^ 53 + 2`, inside the window. -/
example : IntegerLeaf 9007199254740994 := by decide

/-- No double holds `2 ^ 53 + 1`. -/
example : ¬ IntegerLeaf 9007199254740993 := by decide

/-- A double holds `2 ^ 63`, outside the window. -/
example : ¬ IntegerLeaf 9223372036854775808 := by decide

/-! ## Documents -/

/-- `{"a": 1, "a": 2}` is no instance of `{a: any}`, nor of anything: it
is not data. Both engines refuse it. -/
example : ¬ Instance .empty (.map [("a", false, .any)] none false)
    (.obj [("a", .int 1), ("a", .int 2)]) :=
  fun ⟨hw, _⟩ => absurd hw (by decide)

/-! ## The two ends -/

/-- `any` admits `null`. -/
example : Instance .empty .any .null := ⟨by decide, .any⟩

/-- `any` admits `[1, "a"]`. -/
example : Instance .empty .any (.arr [.int 1, .str "a"]) := ⟨by decide, .any⟩

/-- `nil` refuses `null`, and everything else. -/
example : ¬ Instance .empty .nil .null := fun ⟨_, h⟩ => nomatch h

/-! ## Kinds -/

/-- `integer` admits `3`. -/
example : Instance .empty .integer (.int 3) := ⟨by decide, .integer rfl (by decide)⟩

/-- `integer` admits `1.0`, whose value is the integer `1`. -/
example : Instance .empty .integer (.dec 1 0) := ⟨by decide, .integer rfl (by decide)⟩

/-- `integer` admits `9007199254740994`, which a double holds. -/
example : Instance .empty .integer (.int 9007199254740994) := ⟨by decide, .integer rfl (by decide)⟩

/-- `integer` refuses `9007199254740993`, which no double holds. -/
example : ¬ Instance .empty .integer (.int 9007199254740993) := by
  rintro ⟨-, h⟩
  cases h with
  | integer hx hl =>
    simp [Num.ofInt, Num.int?] at hx
    subst hx
    exact absurd hl (by decide)

/-- `integer` refuses `9223372036854775808`, outside the window. -/
example : ¬ Instance .empty .integer (.int 9223372036854775808) := by
  rintro ⟨-, h⟩
  cases h with
  | integer hx hl =>
    simp [Num.ofInt, Num.int?] at hx
    subst hx
    exact absurd hl (by decide)

/-- `integer` refuses `1.5`. -/
example : ¬ Instance .empty .integer (.dec 15 1) := by
  rintro ⟨-, h⟩
  cases h with
  | integer hx _ => simp [Num.int?] at hx

/-- `number & multiple(1)` admits `9007199254740993`. -/
example : Instance .empty (.meet .number (.multiple (.ofInt 1))) (.int 9007199254740993) :=
  ⟨by decide, .meet .number (.multiple (by decide) (by decide))⟩

/-- `boolean` admits `true`. -/
example : Instance .empty .boolean (.bool true) := ⟨by decide, .boolean⟩

/-- `boolean` refuses `1`. -/
example : ¬ Instance .empty .boolean (.int 1) := fun ⟨_, h⟩ => nomatch h

/-! ## Strings -/

/-- `string` admits `"a"`. -/
example : Instance .empty .string (.str "a") := ⟨by decide, .string (by decide)⟩

/-- `string` refuses `""`. -/
example : ¬ Instance .empty .string (.str "") := by
  rintro ⟨-, h⟩
  cases h with
  | string h => exact h rfl

/-- `string & empty()` admits `""`. -/
example : Instance .empty .anyString (.str "") := ⟨by decide, .anyString⟩

/-! ## Literals -/

/-- `3` admits `3.0`, whose value is `3`. -/
example : Instance .empty (.lit (.int 3)) (.dec 3 0) := ⟨by decide, .int rfl (by decide)⟩

/-- `9223372036854775808` refuses itself: a literal outside the leaf is
a float, and no number read by value is one. -/
example : ¬ Instance .empty (.lit (.int 9223372036854775808)) (.int 9223372036854775808) := by
  rintro ⟨-, h⟩
  cases h with
  | int _ hl => exact absurd hl (by decide)

/-- `"a"` refuses `"b"`. -/
example : ¬ Instance .empty (.lit (.str "a")) (.str "b") := fun ⟨_, h⟩ =>
  absurd ((check_iff .lit _).mpr h) (by decide)

/-! ## Bounds -/

/-- `min(3)` admits `3`. -/
example : Instance .empty (.min (.ofInt 3)) (.int 3) := ⟨by decide, .min (by decide)⟩

/-- `min(3)` refuses `2`. -/
example : ¬ Instance .empty (.min (.ofInt 3)) (.int 2) := by
  rintro ⟨-, h⟩
  cases h with
  | min h => exact absurd h (by decide)

/-- `min(3)` admits `3.5`. -/
example : Instance .empty (.min (.ofInt 3)) (.dec 35 1) := ⟨by decide, .min (by decide)⟩

/-- `max(2.5)` admits `2.5`. -/
example : Instance .empty (.max ⟨25, 1, true⟩) (.dec 25 1) := ⟨by decide, .max (by decide)⟩

/-- `max(2.5)` refuses `2.6`. -/
example : ¬ Instance .empty (.max ⟨25, 1, true⟩) (.dec 26 1) := by
  rintro ⟨-, h⟩
  cases h with
  | max h => exact absurd h (by decide)

/-- `multiple(0.5)` admits `1.5`. -/
example : Instance .empty (.multiple ⟨5, 1, true⟩) (.dec 15 1) := ⟨by decide, .multiple (by decide) (by decide)⟩

/-- `multiple(0.5)` refuses `1.25`. -/
example : ¬ Instance .empty (.multiple ⟨5, 1, true⟩) (.dec 125 2) := by
  rintro ⟨-, h⟩
  cases h with
  | multiple _ h => exact absurd h (by decide)

/-- `multiple(0)` refuses `0`, and everything else. -/
example : ¬ Instance .empty (.multiple (.ofInt 0)) (.int 0) := by
  rintro ⟨-, h⟩
  cases h with
  | multiple h _ => exact absurd h (by decide)

/-! ## Maps -/

/-- `{x: integer}` admits `{"x": 1}`. -/
example : Instance .empty (.map [("x", false, .integer)] none false) (.obj [("x", .int 1)]) := by
  refine ⟨by decide, ?_⟩
  refine .map ?_ ?_ (fun _ h => nomatch h) (fun h => nomatch h)
  · intro k o v x hm hx
    cases List.mem_singleton.mp hm
    cases hx
    exact .integer rfl (by decide)
  · intro k o v hm hx
    cases List.mem_singleton.mp hm
    cases hx

/-- `{x: integer}` refuses `{}`: the key is required. -/
example : ¬ Instance .empty (.map [("x", false, .integer)] none false) (.obj []) := by
  rintro ⟨-, h⟩
  cases h with
  | map _ ha _ _ => exact absurd (ha "x" false .integer (List.mem_singleton.mpr rfl) rfl) (by decide)

/-- `{x?: integer}` admits `{}`. -/
example : Instance .empty (.map [("x", true, .integer)] none false) (.obj []) :=
  ⟨by decide, .map (fun _ _ _ _ _ hx => nomatch hx)
    (fun _ _ _ hm _ => by cases List.mem_singleton.mp hm; rfl)
    (fun _ h => nomatch h) (fun h => nomatch h)⟩

/-- `{x?: integer}` refuses `{"x": "a"}`. -/
example : ¬ Instance .empty (.map [("x", true, .integer)] none false) (.obj [("x", .str "a")]) := by
  rintro ⟨-, h⟩
  cases h with
  | map hp _ _ _ => nomatch hp "x" true .integer (.str "a") (List.mem_singleton.mpr rfl) rfl

/-- `{x?: integer}` refuses `[]`: an array is not a map. -/
example : ¬ Instance .empty (.map [("x", true, .integer)] none false) (.arr []) :=
  fun ⟨_, h⟩ => nomatch h

/-- `{&: integer}` admits `{"a": 1, "b": 2}`: the spread holds every member. -/
example : Instance .empty (.map [] (some .integer) false) (.obj [("a", .int 1), ("b", .int 2)]) := by
  refine ⟨by decide, ?_⟩
  refine .map (fun _ _ _ _ h => nomatch h) (fun _ _ _ h => nomatch h) ?_ (fun h => nomatch h)
  intro s hs k x hm
  cases hs
  simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hm
  rcases hm with ⟨-, rfl⟩ | ⟨-, rfl⟩ <;> exact .integer rfl (by decide)

/-- `{a: integer, &: string}` refuses `{"a": 1}`: the spread holds the
declared key as well. -/
example : ¬ Instance .empty (.map [("a", false, .integer)] (some .string) false)
    (.obj [("a", .int 1)]) := by
  rintro ⟨-, h⟩
  cases h with
  | map _ _ hs _ => nomatch hs .string rfl "a" (.int 1) (List.mem_singleton.mpr rfl)

/-- `close({a: integer})` refuses `{"a": 1, "b": 2}`: `b` is not declared. -/
example : ¬ Instance .empty (.map [("a", false, .integer)] none true)
    (.obj [("a", .int 1), ("b", .int 2)]) := by
  rintro ⟨-, h⟩
  cases h with
  | map _ _ _ hc =>
    obtain ⟨o, v, hm⟩ := hc rfl "b" (.int 2) (by simp)
    simp at hm

/-- `close({a?: integer})` admits `{}`. -/
example : Instance .empty (.map [("a", true, .integer)] none true) (.obj []) :=
  ⟨by decide, .map (fun _ _ _ _ _ hx => nomatch hx)
    (fun _ _ _ hm _ => by cases List.mem_singleton.mp hm; rfl)
    (fun _ h => nomatch h) (fun _ _ _ h => nomatch h)⟩

/-! ## Lists -/

/-- `[integer, string]` admits `[1, "a", true]`: the list stays open. -/
example : Instance .empty (.list [.integer, .string] none) (.arr [.int 1, .str "a", .bool true]) := by
  refine ⟨by decide, ?_⟩
  refine .list (by decide) ?_ (fun _ h => nomatch h)
  intro i v x hv hx
  rcases i with _ | _ | i
  · cases hv; cases hx; exact .integer rfl (by decide)
  · cases hv; cases hx; exact .string (by decide)
  · simp at hv

/-- `[integer, string]` refuses `[1]`: a written position is missing. -/
example : ¬ Instance .empty (.list [.integer, .string] none) (.arr [.int 1]) := by
  rintro ⟨-, h⟩
  cases h with
  | list hlen _ _ => exact absurd hlen (by decide)

/-- `[&: integer]` refuses `[1, "a"]`: the spread holds every element. -/
example : ¬ Instance .empty (.list [] (some .integer)) (.arr [.int 1, .str "a"]) := by
  rintro ⟨-, h⟩
  cases h with
  | list _ _ hs => nomatch hs .integer rfl (.str "a") (by simp)

/-! ## Conjunction -/

/-- `integer & min(3)` admits `7`. -/
example : Instance .empty (.meet .integer (.min (.ofInt 3))) (.int 7) :=
  ⟨by decide, .meet (.integer rfl (by decide)) (.min (by decide))⟩

/-- `integer & min(3)` refuses `2`. -/
example : ¬ Instance .empty (.meet .integer (.min (.ofInt 3))) (.int 2) := by
  rintro ⟨-, h⟩
  cases h with
  | meet _ h => cases h with | min h => exact absurd h (by decide)

/-! ## Aliases -/

/-- `%T = {n?: %T, v?: integer}`. -/
abbrev T : Val := .map [("n", true, .alias "T"), ("v", true, .integer)] none false

def envT : Env := fun n => if n = "T" then some T else none

/-- `{"n": {"v": 1}}` is a `%T`. The proof is the derivation itself,
and it follows the data down. -/
example : Instance envT T (.obj [("n", .obj [("v", .int 1)])]) := by
  refine ⟨by decide, ?_⟩
  refine .map ?_ ?_ (fun _ h => nomatch h) (fun h => nomatch h)
  · intro k o v x hm hx
    simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hm
    rcases hm with ⟨rfl, rfl, rfl⟩ | ⟨rfl, rfl, rfl⟩
    · cases hx
      refine .alias rfl (.map ?_ ?_ (fun _ h => nomatch h) (fun h => nomatch h))
      · intro k o v x hm hx
        simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hm
        rcases hm with ⟨rfl, rfl, rfl⟩ | ⟨rfl, rfl, rfl⟩
        · nomatch hx
        · cases hx; exact .integer rfl (by decide)
      · intro k o v hm _
        simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hm
        rcases hm with ⟨rfl, rfl, rfl⟩ | ⟨rfl, rfl, rfl⟩ <;> rfl
    · nomatch hx
  · intro k o v hm _
    simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hm
    rcases hm with ⟨rfl, rfl, rfl⟩ | ⟨rfl, rfl, rfl⟩ <;> rfl

/-- `{"v": "x"}` is not: no derivation exists. -/
example : ¬ Instance envT T (.obj [("v", .str "x")]) := by
  rintro ⟨-, h⟩
  cases h with
  | map hp _ _ _ => nomatch hp "v" true .integer (.str "x") (by simp) rfl

/-- `{x: %U}` refuses `{"x": 1}`: `%U` is declared nowhere. -/
example : ¬ Instance .empty (.map [("x", false, .alias "U")] none false) (.obj [("x", .int 1)]) := by
  rintro ⟨-, h⟩
  cases h with
  | map hp _ _ _ =>
    cases hp "x" false (.alias "U") (.int 1) (List.mem_singleton.mpr rfl) rfl with
    | alias hn _ => nomatch hn

/-! ## Paths -/

/-- `{x: $.y, y: integer}`. -/
abbrev refDoc (y : Val) : Val := .map [("x", false, .path [.key "y"]), ("y", false, y)] none false

/-- It admits `{"x": 1, "y": 1}`. -/
example : Instance .empty (refDoc .integer) (.obj [("x", .int 1), ("y", .int 1)]) := by
  refine ⟨by decide, ?_⟩
  refine .map ?_ ?_ (fun _ h => nomatch h) (fun h => nomatch h)
  · intro k o v x hm hx
    simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hm
    rcases hm with ⟨rfl, rfl, rfl⟩ | ⟨rfl, rfl, rfl⟩
    · cases hx; exact .path rfl (.num (by decide))
    · cases hx; exact .integer rfl (by decide)
  · intro k o v hm hx
    simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hm
    rcases hm with ⟨rfl, rfl, rfl⟩ | ⟨rfl, rfl, rfl⟩ <;> nomatch hx

/-- It refuses `{"x": 1, "y": 2}`. -/
example : ¬ Instance .empty (refDoc .integer) (.obj [("x", .int 1), ("y", .int 2)]) := by
  rintro ⟨-, h⟩
  cases h with
  | map hp _ _ _ =>
    cases hp "x" false (.path [.key "y"]) (.int 1) (by simp) rfl with
    | path hat hs =>
      cases hat
      cases hs with | num h => exact absurd h (by decide)

/-- `{x: $.y, y: number}` admits `{"x": 1, "y": 1.0}`: the two are one
value. -/
example : Instance .empty (refDoc .number) (.obj [("x", .int 1), ("y", .dec 1 0)]) := by
  refine ⟨by decide, ?_⟩
  refine .map ?_ ?_ (fun _ h => nomatch h) (fun h => nomatch h)
  · intro k o v x hm hx
    simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hm
    rcases hm with ⟨rfl, rfl, rfl⟩ | ⟨rfl, rfl, rfl⟩
    · cases hx; exact .path rfl (.num (by decide))
    · cases hx; exact .number
  · intro k o v hm hx
    simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hm
    rcases hm with ⟨rfl, rfl, rfl⟩ | ⟨rfl, rfl, rfl⟩ <;> nomatch hx

/-! ## The order -/

/-- `integer` is above `integer & min(3)`. -/
example : .meet .integer (.min (.ofInt 3)) ⊑[.empty] .integer := meet_le_left _ _ _

/-- `integer & min(3)` is not above `integer`: `2` is the instance that
shows it. -/
example : ¬ (.integer ⊑[.empty] .meet .integer (.min (.ofInt 3))) := by
  intro h
  cases (h (.int 2) ⟨by decide, .integer rfl (by decide)⟩).2 with
  | meet _ h => cases h with | min h => exact absurd h (by decide)

/-! ## Two declarations of one key -/

/-- `{x?: integer} & {x: integer}` refuses `{}`: the key is required. -/
example : ¬ Instance .empty
    (.meet (.map [("x", true, .integer)] none false) (.map [("x", false, .integer)] none false))
    (.obj []) := by
  rintro ⟨-, h⟩
  cases (merge_exact _ _ "x" true false .integer .integer _).mpr h with
  | map _ ha _ _ => exact absurd (ha "x" _ _ (List.mem_singleton.mpr rfl) rfl) (by decide)

/-- It admits `{"x": 1}`. -/
example : Instance .empty
    (.meet (.map [("x", true, .integer)] none false) (.map [("x", false, .integer)] none false))
    (.obj [("x", .int 1)]) := by
  refine ⟨by decide, ?_⟩
  refine (merge_exact _ _ "x" true false .integer .integer _).mp
    (.map ?_ ?_ (fun _ h => nomatch h) (fun h => nomatch h))
  · intro k o v x hm hx
    cases List.mem_singleton.mp hm
    cases hx
    exact .meet (.integer rfl (by decide)) (.integer rfl (by decide))
  · intro k o v hm hx
    cases List.mem_singleton.mp hm
    cases hx

/-! ## Where the definition and the engines differ -/

/-- `string & (string & empty())` refuses `""`, which both engines admit. -/
example : ¬ Instance .empty (.meet .string .anyString) (.str "") :=
  fun ⟨_, h⟩ => no_meet_with_string_admits_empty _ _ _ h

/-- `{x?: string} & {x?: integer}` admits `{}`, where both engines answer
`error`. -/
example : Instance .empty
    (.meet (.map [("x", true, .string)] none false) (.map [("x", true, .integer)] none false))
    (.obj []) :=
  ⟨by decide, .meet
    (.map (fun _ _ _ _ _ hx => nomatch hx) (fun _ _ _ hm _ => by cases List.mem_singleton.mp hm; rfl)
      (fun _ h => nomatch h) (fun h => nomatch h))
    (.map (fun _ _ _ _ _ hx => nomatch hx) (fun _ _ _ hm _ => by cases List.mem_singleton.mp hm; rfl)
      (fun _ h => nomatch h) (fun h => nomatch h))⟩

/-! ## A checker, run -/

/-- `check` computes: `integer & min(3)` admits `7`. -/
example : check (.meet .integer (.min (.ofInt 3))) (.int 7) = true := by decide

/-- …and `{x: integer}` refuses `{}`. -/
example : check (.map [("x", false, .integer)] none false) (.obj []) = false := by decide

/-! ## Trial schemas -/

/-- `nof(1, integer, min(0))` admits `-1`, which one trial admits. -/
example : Holds .empty (.int (-1)) (.nof (.lit (.int 1)) [.is .integer, .is (.min (.ofInt 0))])
    (.int (-1)) := by
  refine ⟨1, .inl ⟨.integer rfl (by decide), 0, rfl, .inr ⟨fun h => ?_, rfl⟩⟩, .int rfl (by decide)⟩
  cases h with | min h => exact absurd h (by decide)

/-- …and refuses `3`, which both admit. -/
example : ¬ Holds .empty (.int 3) (.nof (.lit (.int 1)) [.is .integer, .is (.min (.ofInt 0))])
    (.int 3) := by
  rintro ⟨k, hc, hn⟩
  have h₂ : Count .empty (.int 3) [.is .integer, .is (.min (.ofInt 0))] (.int 3) 2 :=
    .inl ⟨.integer rfl (by decide), 1, rfl, .inl ⟨.min (by decide), 0, rfl, rfl⟩⟩
  cases Count.unique hc h₂
  cases hn with | int hx _ => simp [Num.ofInt, Num.int?] at hx

/-- `when(string, "a", min(0))` admits `5`: not a string, and at least 0. -/
example : Holds .empty (.int 5)
    (.when (.is .string) (.is (.lit (.str "a"))) (.is (.min (.ofInt 0)))) (.int 5) :=
  .inr ⟨(fun h => nomatch h), .min (by decide)⟩

/-- …and refuses `"b"`: a string, and not `"a"`. -/
example : ¬ Holds .empty (.str "b")
    (.when (.is .string) (.is (.lit (.str "a"))) (.is (.min (.ofInt 0)))) (.str "b") := by
  rintro (⟨_, h⟩ | ⟨h, _⟩)
  · exact absurd ((check_iff .lit _).mpr h) (by decide)
  · exact h (.string (by decide))

/-! ## What a `subsume` must answer -/

/-- One implementation: never commit. Correct, and useless. -/
def subsumeNever : Val → Val → Subsumption := fun _ _ => .undecided

example (env : Env) : SubsumeCorrect env subsumeNever := by
  intro _ _; simp [subsumeNever]

/-- Another: `any` subsumes everything. Correct, and a little less
useless. -/
def subsumeTop : Val → Val → Subsumption
  | .any, _ => .subsumes
  | _, _ => .undecided

example (env : Env) : SubsumeCorrect env subsumeTop := by
  intro g s
  cases g <;> simp [subsumeTop]
  exact le_any env s

/-- A wrong one: it says `{x: any}` subsumes `{x?: any}`. -/
def subsumeWrong : Val → Val → Subsumption
  | .map [(_, false, _)] none false, .map [(_, true, _)] none false => .subsumes
  | _, _ => .undecided

/-- The definition refutes it, with `{}` as the witness, and no engine
run. -/
example : ¬ SubsumeCorrect .empty subsumeWrong := by
  intro h
  have hle := (h (.map [("x", false, .any)] none false) (.map [("x", true, .any)] none false)).1 rfl
  have h₁ : Instance .empty (.map [("x", true, .any)] none false) (.obj []) :=
    ⟨by decide, .map (fun _ _ _ _ _ hx => nomatch hx)
      (fun _ _ _ hm _ => by cases List.mem_singleton.mp hm; rfl)
      (fun _ h => nomatch h) (fun h => nomatch h)⟩
  cases (hle _ h₁).2 with
  | map _ ha _ _ => exact absurd (ha "x" false .any (List.mem_singleton.mpr rfl) rfl) (by decide)

end Aontu
