import Aontu.Order
import Aontu.Names
import Aontu.Trial
import Aontu.Check
import Aontu.Meet
import Aontu.Output
import Aontu.Verdict

/-!
# The tour's examples

The examples `docs/tutorial-definition.md` walks through, in its order,
each proved from the rules. Each one about admission is also a transcript on that
page, so the engines are held to the same cases.
-/

namespace Aontu

/-! ## Integers -/

/-- A double holds `2 ^ 53 + 2`, inside the window. -/
example : IntegerLeaf 9007199254740994 := by decide

/-- No double holds `2 ^ 53 + 1`. -/
example : ¬ IntegerLeaf 9007199254740993 := by decide

/-- A double holds `2 ^ 63`, outside the window. -/
example : ¬ IntegerLeaf 9223372036854775808 := by decide

/-- `integer` admits `3`. -/
example : Instance .empty .integer (.integer 3) := ⟨by decide, .integer⟩

/-- `integer` admits `9007199254740994`, which a double holds. -/
example : Instance .empty .integer (.integer 9007199254740994) := ⟨by decide, .integer⟩

/-- No `Integer` is `9007199254740993`: the leaf does not hold it, so
the type has no such value. -/
example : ¬ ∃ x : Integer, x.value = 9007199254740993 := fun ⟨⟨_, h⟩, rfl⟩ => absurd h (by decide)

/-- `integer` refuses the string `"3"`. -/
example : ¬ Instance .empty .integer (.str "3") := fun ⟨_, h⟩ => nomatch h

/-! ## Floats -/

/-- The double `1.5` is `3 * 2 ^ -1`: the sign clear, the exponent
`1023`, and the top bit of the fraction set. -/
example : Float.dyadic 3 (-1) = ⟨false, 1023, 2 ^ 51, by decide, by decide, fun h => nomatch h⟩ :=
  rfl

/-- `float` admits the float `1.5`. -/
example : Instance .empty .float (.num (.float (.dyadic 3 (-1)))) := ⟨by decide, .float⟩

/-- `integer` refuses the float `1.0`: the leaves are disjoint. -/
example : ¬ Instance .empty .integer (.num (.float (.dyadic 1 0))) := fun ⟨_, h⟩ => nomatch h

/-- The float `0.1` shows one tenth, its shortest decimal… -/
example : (Number.float (.dyadic 3602879701896397 (-55))).shown = (1, 10) := by decide

/-- …though its exact value is a little above one tenth. -/
example : ¬ (Number.float (.dyadic 3602879701896397 (-55))).le (.bigdecimal (.of 1 1)) := by decide

/-! ## Big numbers -/

/-- `biginteger` admits `9007199254740993`, exactly. -/
example : Instance .empty .biginteger (.num (.biginteger ⟨9007199254740993⟩)) := ⟨by decide, .biginteger⟩

/-- `bigdecimal` admits one and a half. -/
example : Instance .empty .bigdecimal (.num (.bigdecimal (.of 15 1))) := ⟨by decide, .bigdecimal⟩

/-- `integer` refuses the biginteger `5`, however equal they look. -/
example : ¬ Instance .empty .integer (.num (.biginteger ⟨5⟩)) := fun ⟨_, h⟩ => nomatch h

/-! ## Numbers -/

/-- `number` admits a number of every leaf. -/
example : Instance .empty .number (.integer 3) ∧
    Instance .empty .number (.num (.float (.dyadic 3 (-1)))) ∧
    Instance .empty .number (.num (.biginteger ⟨9007199254740993⟩)) ∧
    Instance .empty .number (.num (.bigdecimal (.of 15 1))) :=
  ⟨⟨by decide, .number⟩, ⟨by decide, .number⟩, ⟨by decide, .number⟩, ⟨by decide, .number⟩⟩

/-- `number` refuses the string `"1"`. -/
example : ¬ Instance .empty .number (.str "1") := fun ⟨_, h⟩ => nomatch h

/-- `number & multiple(1)` admits the biginteger `9007199254740993`. -/
example : Instance .empty (.meet .number (.multiple (.integer (.of 1)))) (.num (.biginteger ⟨9007199254740993⟩)) :=
  ⟨by decide, .meet .number (.multiple (by decide) (by decide))⟩

/-- `number & multiple(1)` admits exactly the numbers that show a whole
number, of every leaf. -/
example (env : Env) (root j : Data) :
    Admits env root (.meet .number (.multiple (.integer (.of 1)))) j ↔ ∃ x, j = .num x ∧ x.Whole := by
  constructor
  · intro h
    cases h with
    | meet hn hm =>
      cases hn
      cases hm with
      | multiple _ hd => exact ⟨_, rfl, (Number.multipleOf_one _).mp hd⟩
  · rintro ⟨x, rfl, hx⟩
    exact .meet .number (.multiple (by decide) ((Number.multipleOf_one x).mpr hx))

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

/-- `string` refuses `3`. -/
example : ¬ Instance .empty .string (.integer 3) := fun ⟨_, h⟩ => nomatch h

/-! ## Booleans -/

/-- `boolean` admits `true`. -/
example : Instance .empty .boolean (.bool true) := ⟨by decide, .boolean⟩

/-- `boolean` refuses `1`. -/
example : ¬ Instance .empty .boolean (.integer 1) := fun ⟨_, h⟩ => nomatch h

/-! ## Literals -/

/-- `3` admits `3`. -/
example : Instance .empty (.lit (.num (.integer (.of 3)))) (.integer 3) := ⟨by decide, .num⟩

/-- `3` refuses `4`. -/
example : ¬ Instance .empty (.lit (.num (.integer (.of 3)))) (.integer 4) := fun ⟨_, h⟩ => absurd ((check_iff .lit _).mpr h) (by decide)

/-- `3` refuses `0d3`, the biginteger three. -/
example : ¬ Instance .empty (.lit (.num (.integer (.of 3)))) (.num (.biginteger ⟨3⟩)) := fun ⟨_, h⟩ => absurd ((check_iff .lit _).mpr h) (by decide)

/-- `"a"` refuses `"b"`. -/
example : ¬ Instance .empty (.lit (.str "a")) (.str "b") := fun ⟨_, h⟩ => absurd ((check_iff .lit _).mpr h) (by decide)

/-- `true` refuses `false`. -/
example : ¬ Instance .empty (.lit (.bool true)) (.bool false) := fun ⟨_, h⟩ => absurd ((check_iff .lit _).mpr h) (by decide)

/-- `null` admits `null`. -/
example : Instance .empty (.lit .null) .null := ⟨by decide, .null⟩

/-- `null` refuses `false`. -/
example : ¬ Instance .empty (.lit .null) (.bool false) := fun ⟨_, h⟩ => nomatch h

/-! ## Bounds -/

/-- `min(3)` admits `3`. -/
example : Instance .empty (.min (.num (.integer (.of 3)))) (.integer 3) := ⟨by decide, .min (by decide)⟩

/-- `min(3)` refuses `2`. -/
example : ¬ Instance .empty (.min (.num (.integer (.of 3)))) (.integer 2) := by
  rintro ⟨-, h⟩
  cases h with
  | min h => exact absurd h (by decide)

/-- `min(3)` admits the bigdecimal three and a half. -/
example : Instance .empty (.min (.num (.integer (.of 3)))) (.num (.bigdecimal (.of 35 1))) := ⟨by decide, .min (by decide)⟩

/-- `max(2.5)`, whose bound is a float, admits the bigdecimal `2.5`: a
bound compares exact values, whatever their leaves. -/
example : Instance .empty (.max (.num (.float (.dyadic 5 (-1))))) (.num (.bigdecimal (.of 25 1))) :=
  ⟨by decide, .max (by decide)⟩

/-- `max(2.5)` refuses `2.6`. -/
example : ¬ Instance .empty (.max (.num (.float (.dyadic 5 (-1))))) (.num (.bigdecimal (.of 26 1))) := by
  rintro ⟨-, h⟩
  cases h with
  | max h => exact absurd h (by decide)

/-- `max(0d0.1)` refuses the float `0.1`, whose exact value is above
one tenth. -/
example : ¬ Instance .empty (.max (.num (.bigdecimal (.of 1 1))))
    (.num (.float (.dyadic 3602879701896397 (-55)))) := by
  rintro ⟨-, h⟩
  cases h with
  | max h => exact absurd h (by decide)

/-- `multiple(0.5)` admits one and a half. -/
example : Instance .empty (.multiple (.float (.dyadic 1 (-1)))) (.num (.bigdecimal (.of 15 1))) :=
  ⟨by decide, .multiple (by decide) (by decide)⟩

/-- `multiple(0.5)` refuses `1.25`. -/
example : ¬ Instance .empty (.multiple (.float (.dyadic 1 (-1)))) (.num (.bigdecimal (.of 125 2))) := by
  rintro ⟨-, h⟩
  cases h with
  | multiple _ h => exact absurd h (by decide)

/-- `multiple(0.1)` admits the float `0.3`: it reads the decimal each
float shows, where their exact values are no multiple. -/
example : Instance .empty (.multiple (.float (.dyadic 3602879701896397 (-55))))
    (.num (.float (.dyadic 5404319552844595 (-54)))) :=
  ⟨by decide, .multiple (by decide) (by decide)⟩

/-- `multiple(0)` refuses `0`, and everything else. -/
example : ¬ Instance .empty (.multiple (.integer (.of 0))) (.integer 0) := by
  rintro ⟨-, h⟩
  cases h with
  | multiple h _ => exact absurd h (by decide)

/-! ## The strict bounds -/

/-- `above(1)` refuses `1`… -/
example : ¬ Instance .empty (.above (.num (.integer (.of 1)))) (.integer 1) := by
  rintro ⟨-, h⟩
  cases h with
  | above h => exact absurd h (by decide)

/-- …and admits the bigdecimal `1.5`. -/
example : Instance .empty (.above (.num (.integer (.of 1)))) (.num (.bigdecimal (.of 15 1))) :=
  ⟨by decide, .above (by decide)⟩

/-- `below(1)` admits `0`. -/
example : Instance .empty (.beneath (.num (.integer (.of 1)))) (.integer 0) :=
  ⟨by decide, .beneath (by decide)⟩

/-- Whatever `above(1)` admits, `min(1)` admits: `above_le_min`, for
every bound. -/
example : .above (.num (.integer (.of 1))) ⊑[.empty] .min (.num (.integer (.of 1))) :=
  above_le_min _ _

/-! ## String bounds -/

/-- `min("b")` admits `"ba"`: a string comes before every longer string
it begins. -/
example : Instance .empty (.min (.str "b")) (.str "ba") := ⟨by decide, .minStr (by decide)⟩

/-- `min("b")` refuses `""`, which comes before every other string. -/
example : ¬ Instance .empty (.min (.str "b")) (.str "") := by
  rintro ⟨-, h⟩
  cases h with
  | minStr h => exact absurd h (by decide)

/-- `max("b")` admits `""`: a string bound says nothing about emptiness. -/
example : Instance .empty (.max (.str "b")) (.str "") := ⟨by decide, .maxStr (by decide)⟩

/-- `max("b")` refuses `1`: a bound's domain is its end's. -/
example : ¬ Instance .empty (.max (.str "b")) (.integer 1) := fun ⟨_, h⟩ => nomatch h

/-- `above("b")` refuses `"b"`. -/
example : ¬ Instance .empty (.above (.str "b")) (.str "b") := by
  rintro ⟨-, h⟩
  cases h with
  | aboveStr h => exact absurd h (by decide)

/-! ## Exclusions -/

/-- `neq(1)` refuses the integer `1`… -/
example : ¬ Instance .empty (.neq [.num (.integer (.of 1))]) (.integer 1) := by
  rintro ⟨-, h⟩
  cases h with
  | neq h =>
    obtain ⟨_, he, hne⟩ := h _ (List.mem_singleton.mpr rfl)
    cases he
    exact hne rfl

/-- …and admits the float `1.0`, a value of another leaf. -/
example : Instance .empty (.neq [.num (.integer (.of 1))]) (.num (.float (.dyadic 1 0))) :=
  ⟨by decide, .neq fun _ hv => by cases List.mem_singleton.mp hv; exact ⟨_, rfl, by decide⟩⟩

/-- `neq(1)` refuses `"a"`: its domain is the numbers. -/
example : ¬ Instance .empty (.neq [.num (.integer (.of 1))]) (.str "a") := by
  rintro ⟨-, h⟩
  cases h with
  | neqStr h =>
    obtain ⟨_, he, -⟩ := h _ (List.mem_singleton.mpr rfl)
    cases he

/-- `neq(1, "a")` admits nothing: no value is in both domains. -/
example (j : Data) : ¬ Instance .empty (.neq [.num (.integer (.of 1)), .str "a"]) j := by
  rintro ⟨-, h⟩
  cases h with
  | neq h =>
    obtain ⟨_, he, -⟩ := h (.str "a") (by simp)
    cases he
  | neqStr h =>
    obtain ⟨_, he, -⟩ := h (.num (.integer (.of 1))) (by simp)
    cases he

/-! ## Sizes -/

/-- `len(1)` admits `"𝄞"`, one character in four bytes. -/
example : Instance .empty (.len (.lit (.num (.integer (.of 1))))) (.str "𝄞") :=
  ⟨by decide, .len (n := 1) (by decide) (by decide) .num⟩

/-- `len(0)` admits `""`, which `string` refuses. -/
example : Instance .empty (.len (.lit (.num (.integer (.of 0))))) (.str "") :=
  ⟨by decide, .len (n := 0) (by decide) (by decide) .num⟩

/-- `len(min(2))` admits `{"x": 1, "y": 2}`… -/
example : Instance .empty (.len (.min (.num (.integer (.of 2)))))
    (.map [("x", .integer 1), ("y", .integer 2)]) :=
  ⟨by decide, .len (n := 2) (by decide) (by decide) (.min (by decide))⟩

/-- …and refuses `[1]`. -/
example : ¬ Instance .empty (.len (.min (.num (.integer (.of 2))))) (.list [.integer 1]) :=
  fun ⟨_, h⟩ => absurd ((check_iff (.len .min) _).mpr h) (by decide)

/-- `len(1)` refuses `5`: a number has no size. -/
example : ¬ Instance .empty (.len (.lit (.num (.integer (.of 1))))) (.integer 5) := by
  rintro ⟨-, h⟩
  cases h with
  | len _ hs _ => cases hs

/-! ## Distinct members -/

/-- `unique()` admits `[1, 1.0]`: two values, of two leaves. -/
example : Instance .empty (.unique none) (.list [.integer 1, .num (.float (.dyadic 1 0))]) :=
  ⟨by decide, (check_iff .unique _).mp (by decide)⟩

/-- `unique()` refuses `[{"x": 1, "y": 2}, {"y": 2, "x": 1}]`: two maps
with the same members are one value. -/
example : ¬ Instance .empty (.unique none)
    (.list [.map [("x", .integer 1), ("y", .integer 2)], .map [("y", .integer 2), ("x", .integer 1)]]) :=
  fun ⟨_, h⟩ => absurd ((check_iff .unique _).mpr h) (by decide)

/-- `unique()` admits `{"x": 1, "y": 2}`, and refuses `{"x": 1, "y": 1}`:
a map's members are its values. -/
example : Instance .empty (.unique none) (.map [("x", .integer 1), ("y", .integer 2)]) ∧
    ¬ Instance .empty (.unique none) (.map [("x", .integer 1), ("y", .integer 1)]) :=
  ⟨⟨by decide, (check_iff .unique _).mp (by decide)⟩,
    fun ⟨_, h⟩ => absurd ((check_iff .unique _).mpr h) (by decide)⟩

/-- `unique("p")` admits `[{"p": 1}, {"p": 2}]`… -/
example : Instance .empty (.unique (some "p"))
    (.list [.map [("p", .integer 1)], .map [("p", .integer 2)]]) :=
  ⟨by decide, (check_iff .unique _).mp (by decide)⟩

/-- …and refuses `[{"p": 1}, {"q": 1}]`: a member without the key is a
distinctness the list cannot show. -/
example : ¬ Instance .empty (.unique (some "p"))
    (.list [.map [("p", .integer 1)], .map [("q", .integer 1)]]) :=
  fun ⟨_, h⟩ => absurd ((check_iff .unique _).mpr h) (by decide)

/-- `unique()` refuses `"a"`: a scalar has no members. -/
example : ¬ Instance .empty (.unique none) (.str "a") := by
  rintro ⟨-, h⟩
  cases h with
  | unique hm _ _ => cases hm

/-! ## Patterns and formats -/

/-- `re(p)` admits no number, whatever the pattern. -/
example (p : String) : ¬ Instance .empty (.re p) (.integer 1) := fun ⟨_, h⟩ => nomatch h

/-- `re(p) & re(q)` admits a string exactly when each pattern matches
it, whatever matching is. -/
example (env : Env) (root : Data) (p q s : String) :
    Admits env root (.meet (.re p) (.re q)) (.str s) ↔ host.pattern p s ∧ host.pattern q s := by
  constructor
  · intro h
    cases h with
    | meet h₁ h₂ =>
      cases h₁ with
      | re h₁ =>
        cases h₂ with
        | re h₂ => exact ⟨h₁, h₂⟩
  · rintro ⟨h₁, h₂⟩
    exact .meet (.re h₁) (.re h₂)

/-- `format(g)` admits no `null`, whatever the format. -/
example (g : String) : ¬ Instance .empty (.format g) .null := fun ⟨_, h⟩ => nomatch h

/-! ## The two ends -/

/-- `any` admits `null`. -/
example : Instance .empty .any .null := ⟨by decide, .any⟩

/-- `any` admits `[1, "a"]`. -/
example : Instance .empty .any (.list [.integer 1, .str "a"]) := ⟨by decide, .any⟩

/-- `nil` refuses `null`, and everything else. -/
example : ¬ Instance .empty .nil .null := fun ⟨_, h⟩ => nomatch h

/-! ## Maps and lists -/

/-- `{"a": 1}` is a value. -/
example : Data.WellFormed (.map [("a", .integer 1)]) := by decide

/-- A Lean `Data` that gives `a` twice is no value. -/
example : ¬ Data.WellFormed (.map [("a", .integer 1), ("a", .integer 2)]) := by decide

/-- …so it is no instance of anything, `any` included. -/
example : ¬ Instance .empty .any (.map [("a", .integer 1), ("a", .integer 2)]) :=
  fun ⟨hw, _⟩ => absurd hw (by decide)

/-! ## Maps -/

/-- `{x: integer}` admits `{"x": 1}`. -/
example : Instance .empty (.map [("x", false, .integer)] none false) (.map [("x", .integer 1)]) := by
  refine ⟨by decide, ?_⟩
  refine .map ?_ ?_ (fun _ h => nomatch h) (fun h => nomatch h)
  · intro k o v x hm hx
    cases List.mem_singleton.mp hm
    cases hx
    exact .integer
  · intro k o v hm hx
    cases List.mem_singleton.mp hm
    cases hx

/-- `{x: integer}` refuses `{}`: the key is required. -/
example : ¬ Instance .empty (.map [("x", false, .integer)] none false) (.map []) := by
  rintro ⟨-, h⟩
  cases h with
  | map _ ha _ _ => exact absurd (ha "x" false .integer (List.mem_singleton.mpr rfl) rfl) (by decide)

/-- `{x?: integer}` admits `{}`. -/
example : Instance .empty (.map [("x", true, .integer)] none false) (.map []) :=
  ⟨by decide, .map (fun _ _ _ _ _ hx => nomatch hx)
    (fun _ _ _ hm _ => by cases List.mem_singleton.mp hm; rfl)
    (fun _ h => nomatch h) (fun h => nomatch h)⟩

/-- `{x?: integer}` refuses `{"x": "a"}`. -/
example : ¬ Instance .empty (.map [("x", true, .integer)] none false) (.map [("x", .str "a")]) := by
  rintro ⟨-, h⟩
  cases h with
  | map hp _ _ _ => nomatch hp "x" true .integer (.str "a") (List.mem_singleton.mpr rfl) rfl

/-- `{x?: integer}` refuses `[]`: a list is not a map. -/
example : ¬ Instance .empty (.map [("x", true, .integer)] none false) (.list []) :=
  fun ⟨_, h⟩ => nomatch h

/-- `{&: integer}` admits `{"a": 1, "b": 2}`: the spread holds every member. -/
example : Instance .empty (.map [] (some .integer) false) (.map [("a", .integer 1), ("b", .integer 2)]) := by
  refine ⟨by decide, ?_⟩
  refine .map (fun _ _ _ _ h => nomatch h) (fun _ _ _ h => nomatch h) ?_ (fun h => nomatch h)
  intro s hs k x hm
  cases hs
  simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hm
  rcases hm with ⟨-, rfl⟩ | ⟨-, rfl⟩ <;> exact .integer

/-- `{a: integer, &: string}` refuses `{"a": 1}`: the spread holds the
declared key as well. -/
example : ¬ Instance .empty (.map [("a", false, .integer)] (some .string) false)
    (.map [("a", .integer 1)]) := by
  rintro ⟨-, h⟩
  cases h with
  | map _ _ hs _ => nomatch hs .string rfl "a" _ (List.mem_singleton.mpr rfl)

/-- `close({a: integer})` refuses `{"a": 1, "b": 2}`: `b` is not declared. -/
example : ¬ Instance .empty (.map [("a", false, .integer)] none true)
    (.map [("a", .integer 1), ("b", .integer 2)]) := by
  rintro ⟨-, h⟩
  cases h with
  | map _ _ _ hc =>
    obtain ⟨o, v, hm⟩ := hc rfl "b" (.integer 2) (by simp)
    simp at hm

/-- `close({a?: integer})` admits `{}`. -/
example : Instance .empty (.map [("a", true, .integer)] none true) (.map []) :=
  ⟨by decide, .map (fun _ _ _ _ _ hx => nomatch hx)
    (fun _ _ _ hm _ => by cases List.mem_singleton.mp hm; rfl)
    (fun _ h => nomatch h) (fun _ _ _ h => nomatch h)⟩

/-! ## Lists -/

/-- `[integer, string]` admits `[1, "a", true]`: the list stays open. -/
example : Instance .empty (.list [.integer, .string] none false) (.list [.integer 1, .str "a", .bool true]) := by
  refine ⟨by decide, ?_⟩
  refine .list (by decide) (fun h => nomatch h) ?_ (fun _ h => nomatch h)
  intro i v x hv hx
  rcases i with _ | _ | i
  · cases hv; cases hx; exact .integer
  · cases hv; cases hx; exact .string (by decide)
  · simp at hv

/-- `[integer, string]` refuses `[1]`: its second position is missing. -/
example : ¬ Instance .empty (.list [.integer, .string] none false) (.list [.integer 1]) := by
  rintro ⟨-, h⟩
  cases h with
  | list hlen _ _ _ => exact absurd hlen (by decide)

/-- `[&: integer]` refuses `[1, "a"]`: the spread holds every element. -/
example : ¬ Instance .empty (.list [] (some .integer) false) (.list [.integer 1, .str "a"]) := by
  rintro ⟨-, h⟩
  cases h with
  | list _ _ _ hs => nomatch hs .integer rfl (.str "a") (by simp)

/-! ## Conjunction -/

/-- `integer & min(3)` admits `7`. -/
example : Instance .empty (.meet .integer (.min (.num (.integer (.of 3))))) (.integer 7) :=
  ⟨by decide, .meet (.integer) (.min (by decide))⟩

/-- `integer & min(3)` refuses `2`. -/
example : ¬ Instance .empty (.meet .integer (.min (.num (.integer (.of 3))))) (.integer 2) := by
  rintro ⟨-, h⟩
  cases h with
  | meet _ h => cases h with | min h => exact absurd h (by decide)

/-! ## Disjunction and preference -/

/-- `1 | 2`, as a term: two arms, neither preferred. -/
abbrev oneOrTwo : Val := .or [(0, .lit (.num (.integer (.of 1)))), (0, .lit (.num (.integer (.of 2))))]

/-- `1 | 2` admits `2`, by its second arm. -/
example : Instance .empty oneOrTwo (.integer 2) := ⟨by decide, .or (r := 0) (by simp [Integer.of]) .num⟩

/-- `1 | 2` refuses `3`. -/
example : ¬ Instance .empty oneOrTwo (.integer 3) :=
  fun ⟨_, h⟩ => absurd ((check_iff (checkable_or₂ .lit .lit) _).mpr h) (by decide)

/-- `*1 | 2`: the first arm preferred, which admission ignores. -/
abbrev prefOneOrTwo : Val := .or [(1, .lit (.num (.integer (.of 1)))), (0, .lit (.num (.integer (.of 2))))]

/-- `*1 | 2` admits `2`, and refuses `3`: a preferred arm admits its own
value, as any arm does. -/
example : Instance .empty prefOneOrTwo (.integer 2) ∧ ¬ Instance .empty prefOneOrTwo (.integer 3) :=
  ⟨⟨by decide, .or (r := 0) (by simp [Integer.of]) .num⟩,
    fun ⟨_, h⟩ => absurd ((check_iff (checkable_or₂ .lit .lit) _).mpr h) (by decide)⟩

/-- `[integer] | [string]`: the arms sealed, as a disjunction reads a list. -/
abbrev listArms : Val := .or [(0, .list [.integer] none true), (0, .list [.string] none true)]

theorem listArms_checkable : listArms.Checkable :=
  checkable_or₂ (.list (fun _ h => by cases List.mem_singleton.mp h; exact .integer) (fun _ h => nomatch h))
    (.list (fun _ h => by cases List.mem_singleton.mp h; exact .string) (fun _ h => nomatch h))

/-- `[integer] | [string]` admits `[1]`… -/
example : Instance .empty listArms (.list [.integer 1]) :=
  ⟨by decide, (check_iff listArms_checkable _).mp (by decide)⟩

/-- …and refuses `[1, 2]`: neither arm has a second position. -/
example : ¬ Instance .empty listArms (.list [.integer 1, .integer 2]) :=
  fun ⟨_, h⟩ => absurd ((check_iff listArms_checkable _).mpr h) (by decide)

/-- A sealed list without a spread has its positions' length:
`close([integer])` refuses `[1, 2]`. -/
example : ¬ Instance .empty (.list [.integer] none true) (.list [.integer 1, .integer 2]) := by
  rintro ⟨-, h⟩
  cases h with
  | list _ hseal _ _ => exact absurd (hseal rfl rfl) (by decide)

/-- The parent type of `1` is `integer`, of `integer` is `number`, and of
`{x: 1}` is `{x: integer}`. -/
example : Val.super (.lit (.num (.integer (.of 1)))) = .integer ∧ Val.super .integer = .number ∧
    Val.super (.map [("x", false, .lit (.num (.integer (.of 1))))] none false) =
      .map [("x", false, .integer)] none false :=
  ⟨rfl, rfl, rfl⟩

/-- The parent type of `integer & min(3)` is `integer`, the kind the
constraint holds. -/
example : Val.super (.meet .integer (.min (.num (.integer (.of 3))))) = .integer := rfl

/-- `*1` admits `1`, and `2`, which its parent type `integer` admits… -/
example : Instance .empty (.pref 1 (.lit (.num (.integer (.of 1))))) (.integer 1) ∧
    Instance .empty (.pref 1 (.lit (.num (.integer (.of 1))))) (.integer 2) :=
  ⟨⟨by decide, .pref .num⟩, ⟨by decide, .prefSuper .integer⟩⟩

/-- …and refuses the float `1.5`, which `integer` refuses. -/
example : ¬ Instance .empty (.pref 1 (.lit (.num (.integer (.of 1))))) (.num (.float (.dyadic 3 (-1)))) :=
  fun ⟨_, h⟩ => absurd ((check_iff (.pref .lit) _).mpr h) (by decide)

/-- `*[1]`, its list sealed as a preference reads one. -/
abbrev prefList : Val := .pref 1 (.list [.lit (.num (.integer (.of 1)))] none true)

theorem prefList_checkable : prefList.Checkable :=
  .pref (.list (fun _ h => by cases List.mem_singleton.mp h; exact .lit) (fun _ h => nomatch h))

/-- `*[1]` admits `[2]`, and refuses `[1, 2]`: its parent type is the
sealed `[integer]`. -/
example : Instance .empty prefList (.list [.integer 2]) ∧
    ¬ Instance .empty prefList (.list [.integer 1, .integer 2]) :=
  ⟨⟨by decide, (check_iff prefList_checkable _).mp (by decide)⟩,
    fun ⟨_, h⟩ => absurd ((check_iff prefList_checkable _).mpr h) (by decide)⟩

/-- `*8080 & min(1024)`. -/
abbrev port : Val := .meet (.pref 1 (.lit (.num (.integer (.of 8080))))) (.min (.num (.integer (.of 1024))))

/-- `*8080 & min(1024)` admits `2048`, and refuses `80`: the preference
widens to `integer`, and the bound still holds. -/
example : Instance .empty port (.integer 2048) ∧ ¬ Instance .empty port (.integer 80) :=
  ⟨⟨by decide, .meet (.prefSuper .integer) (.min (by decide))⟩,
    fun ⟨_, h⟩ => absurd ((check_iff (.meet (.pref .lit) .min) _).mpr h) (by decide)⟩

/-! ## Aliases -/

/-- `%T = {n?: %T, v?: integer}`. -/
abbrev T : Val := .map [("n", true, .alias "T"), ("v", true, .integer)] none false

def envT : Env := fun n => if n = "T" then some T else none

/-- `{"n": {"v": 1}}` is a `%T`. The proof is the derivation itself,
and it follows the data down. -/
example : Instance envT T (.map [("n", .map [("v", .integer 1)])]) := by
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
        · cases hx; exact .integer
      · intro k o v hm _
        simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hm
        rcases hm with ⟨rfl, rfl, rfl⟩ | ⟨rfl, rfl, rfl⟩ <;> rfl
    · nomatch hx
  · intro k o v hm _
    simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hm
    rcases hm with ⟨rfl, rfl, rfl⟩ | ⟨rfl, rfl, rfl⟩ <;> rfl

/-- `{"v": "x"}` is not: no derivation exists. -/
example : ¬ Instance envT T (.map [("v", .str "x")]) := by
  rintro ⟨-, h⟩
  cases h with
  | map hp _ _ _ => nomatch hp "v" true .integer (.str "x") (by simp) rfl

/-- `{x: %U}` refuses `{"x": 1}`: `%U` is declared nowhere. -/
example : ¬ Instance .empty (.map [("x", false, .alias "U")] none false) (.map [("x", .integer 1)]) := by
  rintro ⟨-, h⟩
  cases h with
  | map hp _ _ _ =>
    cases hp "x" false (.alias "U") (.integer 1) (List.mem_singleton.mpr rfl) rfl with
    | alias hn _ => nomatch hn

/-! ## Paths -/

/-- `{x: $.y, y: integer}`. -/
abbrev refDoc (y : Val) : Val := .map [("x", false, .path [.key "y"]), ("y", false, y)] none false

/-- It admits `{"x": 1, "y": 1}`. -/
example : Instance .empty (refDoc .integer) (.map [("x", .integer 1), ("y", .integer 1)]) := by
  refine ⟨by decide, ?_⟩
  refine .map ?_ ?_ (fun _ h => nomatch h) (fun h => nomatch h)
  · intro k o v x hm hx
    simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hm
    rcases hm with ⟨rfl, rfl, rfl⟩ | ⟨rfl, rfl, rfl⟩
    · cases hx; exact .path rfl .num
    · cases hx; exact .integer
  · intro k o v hm hx
    simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hm
    rcases hm with ⟨rfl, rfl, rfl⟩ | ⟨rfl, rfl, rfl⟩ <;> nomatch hx

/-- It refuses `{"x": 1, "y": 2}`. -/
example : ¬ Instance .empty (refDoc .integer) (.map [("x", .integer 1), ("y", .integer 2)]) := by
  rintro ⟨-, h⟩
  cases h with
  | map hp _ _ _ =>
    cases hp "x" false (.path [.key "y"]) (.integer 1) (by simp) rfl with
    | path hat hs =>
      cases hat
      cases hs

/-- `{x: $.y, y: any}` admits `{"x": {"a": 1, "b": 2}, "y": {"b": 2, "a": 1}}`:
the two objects have the same members, so they are one value. -/
example : Instance .empty (refDoc .any)
    (.map [("x", .map [("a", .integer 1), ("b", .integer 2)]), ("y", .map [("b", .integer 2), ("a", .integer 1)])]) := by
  refine ⟨by decide, ?_⟩
  refine .map ?_ ?_ (fun _ h => nomatch h) (fun h => nomatch h)
  · intro k o v x hm hx
    simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hm
    rcases hm with ⟨rfl, rfl, rfl⟩ | ⟨rfl, rfl, rfl⟩
    · cases hx
      refine .path rfl (.map (fun k => ?_) (fun k x y hx hy => ?_))
      · by_cases ha : k = "a" <;> by_cases hb : k = "b" <;> simp_all [lookup]
      · by_cases ha : k = "a"
        · subst ha; simp [lookup] at hx hy; subst hx; subst hy; exact .num
        · by_cases hb : k = "b"
          · subst hb; simp [lookup] at hx hy; subst hx; subst hy; exact .num
          · simp [lookup, ha, hb] at hx
    · cases hx; exact .any
  · intro k o v hm hx
    simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hm
    rcases hm with ⟨rfl, rfl, rfl⟩ | ⟨rfl, rfl, rfl⟩ <;> nomatch hx

/-! ## The graph of names -/

/-- `%N = {n: integer, next?: %N}`, as a document declares it. -/
abbrev declsN : Decls := [("N", .map [("n", false, .integer), ("next", true, .alias "N")] none false)]

/-- `N` refers to itself, so it is recursive… -/
example : declsN.Recursive "N" := Decls.recursiveB_iff.mp (by decide)

/-- …through the key `next`, so the declarations keep the alias-cycle
rule: every cycle of names passes through a key or an element. -/
example : declsN.Guarded := Decls.guardedB_iff.mp (by decide)

/-- `%A = {b?: %B}` and `%B = {a?: %A}`: each recursive through the
other, and guarded. -/
abbrev declsAB : Decls :=
  [("A", .map [("b", true, .alias "B")] none false), ("B", .map [("a", true, .alias "A")] none false)]

example : declsAB.Recursive "B" := Decls.recursiveB_iff.mp (by decide)

example : declsAB.Guarded := Decls.guardedB_iff.mp (by decide)

/-- `%U = %U` refers to itself with nothing between, which the rule
refuses… -/
example : ¬ Decls.Guarded [("U", .alias "U")] := fun h =>
  nomatch (by decide : Decls.guardedB [("U", .alias "U")] = false).symm.trans (Decls.guardedB_iff.mpr h)

/-- …and it admits nothing: a derivation would have to begin with
another. -/
example : ¬ Admits (Decls.env [("U", .alias "U")]) .null (.alias "U") (.integer 1) :=
  Decls.alias_self_admits_nothing

/-- `%T = %T | 1` breaks the rule too, through `|`… -/
abbrev declsT : Decls := [("T", .or [(0, .alias "T"), (0, .lit (.num (.integer (.of 1))))])]

example : ¬ declsT.Guarded := fun h =>
  nomatch (by decide : declsT.guardedB = false).symm.trans (Decls.guardedB_iff.mpr h)

/-- …though it admits `1`, by its second arm: the engines run it, and
the rule refuses it. -/
example : Admits declsT.env .null (.alias "T") (.integer 1) :=
  .alias rfl (.or (List.mem_cons_of_mem _ (List.mem_singleton.mpr rfl)) .num)

/-- `%A = %B` and `%B = %A`: a cycle with nothing between, through two
names. -/
example : ¬ Decls.Guarded [("A", .alias "B"), ("B", .alias "A")] := fun h =>
  nomatch (by decide : Decls.guardedB [("A", .alias "B"), ("B", .alias "A")] = false).symm.trans
    (Decls.guardedB_iff.mpr h)

/-- `{x: %A}` under `%A = %B` alone refers to a name declared nowhere. -/
example : ¬ Decls.Declares [("A", .alias "B")] (.map [("x", false, .alias "A")] none false) := fun h =>
  nomatch (by decide : Decls.declaresB [("A", .alias "B")]
    (.map [("x", false, .alias "A")] none false) = false).symm.trans (Decls.declaresB_iff.mpr h)

/-! ## The order -/

/-- `integer` is above `integer & min(3)`. -/
example : .meet .integer (.min (.num (.integer (.of 3)))) ⊑[.empty] .integer := meet_le_left _ _ _

/-- `integer & min(3)` is not above `integer`: `2` is the instance that
shows it. -/
example : ¬ (.integer ⊑[.empty] .meet .integer (.min (.num (.integer (.of 3))))) := by
  intro h
  cases (h (.integer 2) ⟨by decide, .integer⟩).2 with
  | meet _ h => cases h with | min h => exact absurd h (by decide)

/-! ## The meet, computed -/

/-- `{x: 1} & {y: 2}` is `{x: 1, y: 2}`. -/
example : meet (.map [("x", false, .lit (.num (.integer (.of 1))))] none false)
    (.map [("y", false, .lit (.num (.integer (.of 2))))] none false) =
    .map [("x", false, .lit (.num (.integer (.of 1)))), ("y", false, .lit (.num (.integer (.of 2))))]
      none false := rfl

/-- `(min(5) & max(3)) | 1` is `1`: the first arm admits nothing, so it
drops. -/
example : meet (.or [(0, .meet (.min (.num (.integer (.of 5)))) (.max (.num (.integer (.of 3))))),
    (0, .lit (.num (.integer (.of 1))))]) .any = .or [(0, .lit (.num (.integer (.of 1))))] := rfl

/-- `*8080 & min(1024)` is `*8080 | (integer & min(1024))`: the preference
widens to its parent type, and each arm meets the bound. -/
example : meet (.pref 1 (.lit (.num (.integer (.of 8080))))) (.min (.num (.integer (.of 1024)))) =
    .or [(1, .lit (.num (.integer (.of 8080)))),
      (0, .meet .integer (.min (.num (.integer (.of 1024)))))] := rfl

/-- `close([1, 2]) & [&: integer]` is `close([1, 2])`: the seal fixes the
length, and each position takes the spread. -/
example : meet (.list [.lit (.num (.integer (.of 1))), .lit (.num (.integer (.of 2)))] none true)
    (.list [] (some .integer) false) =
    .list [.lit (.num (.integer (.of 1))), .lit (.num (.integer (.of 2)))] none true := rfl

/-- `min(5) & max(3)` is `nil`, and so is `min("b") & max("a")`: no value
lies in either interval. -/
example : meet (.min (.num (.integer (.of 5)))) (.max (.num (.integer (.of 3)))) = .nil ∧
    meet (.min (.str "b")) (.max (.str "a")) = .nil := ⟨rfl, rfl⟩

/-- `string & (string & empty())` is `string`: the lower of the two kinds. -/
example : meet .string .anyString = .string := rfl

/-- The computed meet admits what the written one admits, `admits_meet`:
`*8080 & min(1024)`, computed, still admits `2048` and refuses `80`. -/
example : Instance .empty (meet (.pref 1 (.lit (.num (.integer (.of 8080)))))
      (.min (.num (.integer (.of 1024))))) (.integer 2048) ∧
    ¬ Instance .empty (meet (.pref 1 (.lit (.num (.integer (.of 8080)))))
      (.min (.num (.integer (.of 1024))))) (.integer 80) :=
  ⟨⟨by decide, (admits_meet _ _ _).mpr ⟨.prefSuper .integer, .min (by decide)⟩⟩,
    fun ⟨_, h⟩ => by
      cases ((admits_meet _ _ _).mp h).2 with
      | min h => exact absurd h (by decide)⟩

/-! ## What evaluation singles out -/

/-- `*1 | 2` singles out `1`: the arm of the lowest positive rank. -/
example : output (.or [(1, .lit (.num (.integer (.of 1)))), (0, .lit (.num (.integer (.of 2))))]) =
    some (.integer 1) := rfl

/-- `1 | 2` singles out nothing: two arms, neither preferred, that
generate differently. `1 | 1` singles out `1`. -/
example : output (.or [(0, .lit (.num (.integer (.of 1)))), (0, .lit (.num (.integer (.of 2))))]) = none ∧
    output (.or [(0, .lit (.num (.integer (.of 1)))), (0, .lit (.num (.integer (.of 1))))]) =
      some (.integer 1) := ⟨rfl, rfl⟩

/-- `(*1 | 2) | 3` singles out `1`: an arm that is itself a disjunction
of rank `0` brings its arms, so the preference counts. -/
example : output (.or [(0, .or [(1, .lit (.num (.integer (.of 1)))), (0, .lit (.num (.integer (.of 2))))]),
    (0, .lit (.num (.integer (.of 3))))]) = some (.integer 1) := rfl

/-- `*8080 & min(1024)` singles out `8080`. -/
example : output port = some (.integer 8080) := rfl

/-- `{x?: *1}` singles out `{x: 1}`, and `{x?: integer}` singles out `{}`:
an optional key is written where its value generates. -/
example : output (.map [("x", true, .pref 1 (.lit (.num (.integer (.of 1)))))] none false) =
      some (.map [("x", .integer 1)]) ∧
    output (.map [("x", true, .integer)] none false) = some (.map []) := ⟨rfl, rfl⟩

/-- `{x: integer}` singles out nothing: a required key whose value
generates nothing. -/
example : output (.map [("x", false, .integer)] none false) = none := rfl

/-- `{x: *1} & {}` singles out `{x: 1}`: the fill of the data `{}` by the
schema `{x: *1}`, which is how `vet` reads a default. -/
example : output (.meet (.map [("x", false, .pref 1 (.lit (.num (.integer (.of 1)))))] none false)
    (.map [] none false)) = some (.map [("x", .integer 1)]) := rfl

/-- `({x: 1} | {y: 2}) & {x: 1}` singles out nothing, where `{x: 1}` is
an instance of it: each arm, met with the data, is still consistent
with it, so two alternatives remain, which is the engines' `incomplete`
at the end of step 12. -/
example : output (.meet (.or [(0, .map [("x", false, .lit (.num (.integer (.of 1))))] none false),
      (0, .map [("y", false, .lit (.num (.integer (.of 2))))] none false)])
    (.map [("x", false, .lit (.num (.integer (.of 1))))] none false)) = none := rfl

/-- What is singled out is an instance, `output_admits`: `*8080 & min(1024)`
admits `8080`, and the output of `{x?: *1}` is one of its instances. -/
example : Instance .empty port (.integer 8080) :=
  ⟨by decide, output_admits port _ ((output_iff (by decide) _).mp rfl)⟩

/-! ## The verdicts -/

/-- `{x: *1}` against `{}`: `valid` with the fill, the default `1`
supplied, and `incomplete` without it, since `{}` is no instance as
written. -/
example : vet {} (.map [("x", false, .pref 1 (.lit (.num (.integer (.of 1)))))] none false) (.map []) =
      .valid ∧
    vet { fill := false } (.map [("x", false, .pref 1 (.lit (.num (.integer (.of 1)))))] none false)
      (.map []) = .incomplete := by decide

/-- `{x?: *1}` against `{}` is `valid` either way: `{}` is an instance
as written. -/
example : vet { fill := false } (.map [("x", true, .pref 1 (.lit (.num (.integer (.of 1)))))] none false)
    (.map []) = .valid := by decide

/-- `{x: 1} | {y: 2}` against `{x: 1}` is `incomplete`: the meet is
alive and singles out nothing, step 12's question. -/
example : vet {} (.or [(0, .map [("x", false, .lit (.num (.integer (.of 1))))] none false),
      (0, .map [("y", false, .lit (.num (.integer (.of 2))))] none false)])
    (.map [("x", .integer 1)]) = .incomplete := by decide

/-- `integer` against `"a"` is `invalid`: the meet is dead. -/
example : vet {} .integer (.str "a") = .invalid := by decide

/-- `min(5) & max(3)` is `error` against anything: the schema does not
stand. So is `*1 | *2`, two preferred arms of one rank that single out
different values, where `*1 | *integer` stands. -/
example : vet {} (.meet (.min (.num (.integer (.of 5)))) (.max (.num (.integer (.of 3))))) (.integer 1) =
      .error ∧
    vet {} (.or [(1, .lit (.num (.integer (.of 1)))), (1, .lit (.num (.integer (.of 2))))]) (.integer 1) =
      .error ∧
    vet {} (.or [(1, .lit (.num (.integer (.of 1)))), (1, .integer)]) (.integer 1) = .valid := by decide

/-- `{x: integer}` against `{}` is `incomplete`, and `valid` under
`--partial`. -/
example : vet {} (.map [("x", false, .integer)] none false) (.map []) = .incomplete ∧
    vet { lax := true } (.map [("x", false, .integer)] none false) (.map []) = .valid := by decide

/-- Without the fill, `valid` is `Instance`: `[*1]` against `[2]`. -/
example : Instance .empty (.list [.pref 1 (.lit (.num (.integer (.of 1))))] none false)
    (.list [.integer 2]) :=
  vet_strict_valid_instance (m := { fill := false }) rfl rfl (by decide)
    ((vet_iff (m := { fill := false }) (by decide) (by decide) .valid).mp (by decide))

/-! ## Two declarations of one key -/

/-- `{x?: integer} & {x: integer}` refuses `{}`: the key is required. -/
example : ¬ Instance .empty
    (.meet (.map [("x", true, .integer)] none false) (.map [("x", false, .integer)] none false))
    (.map []) := by
  rintro ⟨-, h⟩
  cases (merge_exact _ _ "x" true false .integer .integer _).mpr h with
  | map _ ha _ _ => exact absurd (ha "x" _ _ (List.mem_singleton.mpr rfl) rfl) (by decide)

/-- It admits `{"x": 1}`. -/
example : Instance .empty
    (.meet (.map [("x", true, .integer)] none false) (.map [("x", false, .integer)] none false))
    (.map [("x", .integer 1)]) := by
  refine ⟨by decide, ?_⟩
  refine (merge_exact _ _ "x" true false .integer .integer _).mp
    (.map ?_ ?_ (fun _ h => nomatch h) (fun h => nomatch h))
  · intro k o v x hm hx
    cases List.mem_singleton.mp hm
    cases hx
    exact .meet (.integer) (.integer)
  · intro k o v hm hx
    cases List.mem_singleton.mp hm
    cases hx

/-! ## Where the definition and the engines differ -/

/-- `string & (string & empty())` refuses `""`, which both engines admit. -/
example : ¬ Instance .empty (.meet .string .anyString) (.str "") :=
  fun ⟨_, h⟩ => no_meet_with_string_admits_empty _ _ _ h

/-- `[*1] | [1]` singles out `[1]`, as Go answers and TypeScript does not:
both arms generate `[1]`, and neither is preferred. -/
example : output (.or [(0, .list [.pref 1 (.lit (.num (.integer (.of 1))))] none true),
    (0, .list [.lit (.num (.integer (.of 1)))] none true)]) = some (.list [.integer 1]) := rfl

/-- `close([1, 2]) & [&: integer]` refuses `[1, 2, 3]`, which both engines
admit: a seal fixes the length, and no meet admits what a side refuses. -/
example : ¬ Instance .empty
    (.meet (.list [.lit (.num (.integer (.of 1))), .lit (.num (.integer (.of 2)))] none true)
      (.list [] (some .integer) false))
    (.list [.integer 1, .integer 2, .integer 3]) := by
  rintro ⟨-, h⟩
  cases h with
  | meet h _ => cases h with | list _ hseal _ _ => exact absurd (hseal rfl rfl) (by decide)

/-- `{x?: string} & {x?: integer}` admits `{}`, where both engines answer
`error`. -/
example : Instance .empty
    (.meet (.map [("x", true, .string)] none false) (.map [("x", true, .integer)] none false))
    (.map []) :=
  ⟨by decide, .meet
    (.map (fun _ _ _ _ _ hx => nomatch hx) (fun _ _ _ hm _ => by cases List.mem_singleton.mp hm; rfl)
      (fun _ h => nomatch h) (fun h => nomatch h))
    (.map (fun _ _ _ _ _ hx => nomatch hx) (fun _ _ _ hm _ => by cases List.mem_singleton.mp hm; rfl)
      (fun _ h => nomatch h) (fun h => nomatch h))⟩

/-! ## Trial schemas -/

/-- `nof(1, integer, min(0))` admits `-1`, which one trial admits. -/
example : Holds .empty (.integer (-1)) (.nof (.lit (.num (.integer (.of 1)))) [.is .integer, .is (.min (.num (.integer (.of 0))))])
    (.integer (-1)) := by
  refine ⟨1, .inl ⟨.integer, 0, rfl, .inr ⟨fun h => ?_, rfl⟩⟩, by decide, .num⟩
  cases h with | min h => exact absurd h (by decide)

/-- …and refuses `3`, which both admit. -/
example : ¬ Holds .empty (.integer 3) (.nof (.lit (.num (.integer (.of 1)))) [.is .integer, .is (.min (.num (.integer (.of 0))))])
    (.integer 3) := by
  rintro ⟨k, hc, hn⟩
  have h₂ : Count .empty (.integer 3) [.is .integer, .is (.min (.num (.integer (.of 0))))] (.integer 3) 2 :=
    .inl ⟨.integer, 1, rfl, .inl ⟨.min (by decide), 0, rfl, rfl⟩⟩
  cases Count.unique hc h₂
  obtain ⟨_, hn⟩ := hn
  cases hn

/-- `when(string, "a", min(0))` admits `5`: not a string, and at least 0. -/
example : Holds .empty (.integer 5)
    (.when (.is .string) (.is (.lit (.str "a"))) (.is (.min (.num (.integer (.of 0)))))) (.integer 5) :=
  .inr ⟨(fun h => nomatch h), .min (by decide)⟩

/-- …and refuses `"b"`: a string, and not `"a"`. -/
example : ¬ Holds .empty (.str "b")
    (.when (.is .string) (.is (.lit (.str "a"))) (.is (.min (.num (.integer (.of 0)))))) (.str "b") := by
  rintro (⟨_, h⟩ | ⟨h, _⟩)
  · exact absurd ((check_iff .lit _).mpr h) (by decide)
  · exact h (.string (by decide))

/-! ## A checker, run -/

/-- `check` computes: `integer & min(3)` admits `7`. -/
example : check (.meet .integer (.min (.num (.integer (.of 3))))) (.integer 7) = true := by decide

/-- …and `{x: integer}` refuses `{}`. -/
example : check (.map [("x", false, .integer)] none false) (.map []) = false := by decide

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
  have h₁ : Instance .empty (.map [("x", true, .any)] none false) (.map []) :=
    ⟨by decide, .map (fun _ _ _ _ _ hx => nomatch hx)
      (fun _ _ _ hm _ => by cases List.mem_singleton.mp hm; rfl)
      (fun _ h => nomatch h) (fun h => nomatch h)⟩
  cases (hle _ h₁).2 with
  | map _ ha _ _ => exact absurd (ha "x" false .any (List.mem_singleton.mpr rfl) rfl) (by decide)

end Aontu
