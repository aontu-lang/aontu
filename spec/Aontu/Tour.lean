import Aontu.Order
import Aontu.Trial
import Aontu.Check

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
example : Instance .empty (.list [.integer, .string] none) (.list [.integer 1, .str "a", .bool true]) := by
  refine ⟨by decide, ?_⟩
  refine .list (by decide) ?_ (fun _ h => nomatch h)
  intro i v x hv hx
  rcases i with _ | _ | i
  · cases hv; cases hx; exact .integer
  · cases hv; cases hx; exact .string (by decide)
  · simp at hv

/-- `[integer, string]` refuses `[1]`: its second position is missing. -/
example : ¬ Instance .empty (.list [.integer, .string] none) (.list [.integer 1]) := by
  rintro ⟨-, h⟩
  cases h with
  | list hlen _ _ => exact absurd hlen (by decide)

/-- `[&: integer]` refuses `[1, "a"]`: the spread holds every element. -/
example : ¬ Instance .empty (.list [] (some .integer)) (.list [.integer 1, .str "a"]) := by
  rintro ⟨-, h⟩
  cases h with
  | list _ _ hs => nomatch hs .integer rfl (.str "a") (by simp)

/-! ## Conjunction -/

/-- `integer & min(3)` admits `7`. -/
example : Instance .empty (.meet .integer (.min (.num (.integer (.of 3))))) (.integer 7) :=
  ⟨by decide, .meet (.integer) (.min (by decide))⟩

/-- `integer & min(3)` refuses `2`. -/
example : ¬ Instance .empty (.meet .integer (.min (.num (.integer (.of 3))))) (.integer 2) := by
  rintro ⟨-, h⟩
  cases h with
  | meet _ h => cases h with | min h => exact absurd h (by decide)

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

/-! ## The order -/

/-- `integer` is above `integer & min(3)`. -/
example : .meet .integer (.min (.num (.integer (.of 3)))) ⊑[.empty] .integer := meet_le_left _ _ _

/-- `integer & min(3)` is not above `integer`: `2` is the instance that
shows it. -/
example : ¬ (.integer ⊑[.empty] .meet .integer (.min (.num (.integer (.of 3))))) := by
  intro h
  cases (h (.integer 2) ⟨by decide, .integer⟩).2 with
  | meet _ h => cases h with | min h => exact absurd h (by decide)

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
