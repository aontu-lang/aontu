import Aontu.Check
import Aontu.Output
import Aontu.Verdict
import Oracle.Print

/-!
# The oracle

Enumerates every value of the fragment up to one meet against a set of
data, and prints each case with the definition's verdict. The
verdict comes from `check`, which `check_iff` makes the definition's on
every value that reads no reference: `vals_checkable` proves every value
here is one, `instances_wellFormed` proves every instance a value, and
`verdict_exact` puts the three together.
-/

namespace Aontu

def bases : List Val :=
  [.any, .nil, .integer, .meet .number (.multiple (.integer (.of 1))), .string, .anyString,
    .min (.num (.integer (.of 0))), .min (.num (.integer (.of 3)))]

/-- `{"x": v}`, or `{"x"?: v}`. -/
def field (opt : Bool) (v : Val) : Val := .map [("x", opt, v)] none false

def level1 : List Val := bases ++ bases.flatMap fun v => [field true v, field false v]

def vals : List Val := level1 ++ level1.flatMap fun a => level1.map (.meet a)

def scalars : List Data :=
  [.null, .bool true, .integer 0, .integer 3, .integer (-1), .str "", .str "a"]

/-- The instances of the first 9,600 rows. -/
def first : List Data :=
  scalars ++ [.map []] ++ scalars.map (fun j => .map [("x", j)]) ++ [.map [("y", .integer 1)]]

/-- The instances of the rows after them, numbered on so that no earlier
row is renamed: two big decimals, one either side of three, a big
integer no double holds, and a list, each also under a key, written
`0d1.5`, `0d3.5`, `0d9007199254740993`, and `[1]`. -/
def more : List Data :=
  let xs : List Data :=
    [.num (.bigdecimal (.of 15 1)), .num (.bigdecimal (.of 35 1)),
      .num (.biginteger ⟨9007199254740993⟩), .list [.integer 1]]
  xs ++ xs.map (fun j => .map [("x", j)])

def instances : List Data := first ++ more

theorem bases_checkable : ∀ v ∈ bases, v.Checkable := by
  intro v hv
  simp only [bases, List.mem_cons, List.mem_nil_iff, or_false] at hv
  rcases hv with rfl | rfl | rfl | rfl | rfl | rfl | rfl | rfl <;> repeat constructor

theorem level1_checkable : ∀ v ∈ level1, v.Checkable := by
  intro v hv
  simp only [level1, List.mem_append, List.mem_flatMap, List.mem_cons, List.mem_nil_iff,
    or_false] at hv
  rcases hv with hb | ⟨b, hb, rfl | rfl⟩
  · exact bases_checkable v hb
  all_goals
    refine .map (fun k o w hm => ?_) (fun _ h => nomatch h)
    cases List.mem_singleton.mp hm
    exact bases_checkable b hb

theorem vals_checkable : ∀ v ∈ vals, v.Checkable := by
  intro v hv
  simp only [vals, List.mem_append, List.mem_flatMap, List.mem_map] at hv
  rcases hv with hl | ⟨a, ha, b, hb, rfl⟩
  · exact level1_checkable v hl
  · exact .meet (level1_checkable a ha) (level1_checkable b hb)

set_option maxRecDepth 4096 in
/-- Every instance is a value, each of its integers one a double holds;
the search for that runs deeper than Lean's default. -/
theorem instances_wellFormed : ∀ j ∈ instances, j.WellFormed := by decide

/-- Every row's verdict is the definition's: `v` admits `j`, taken
whole, under no alias declaration. -/
theorem verdict_exact {v : Val} (hv : v ∈ vals) {j : Data} (hj : j ∈ instances) :
    check v j = true ↔ Instance Env.empty v j :=
  ⟨fun h => ⟨instances_wellFormed j hj, (check_iff (vals_checkable v hv) j).mp h⟩,
    fun h => (check_iff (vals_checkable v hv) j).mpr h.2⟩

/-! ## The second fragment: the bounds

The atoms of P1 beyond `min`, `max`, and `multiple`, each alone, each
under a key, and the meets of a few of them, against data chosen to
tell them apart: numbers of every leaf about the bounds, strings about
`"b"`, and lists and maps of one or two members. Its rows are
`test/spec/def-bounds.tsv`. -/

def one : Number := .integer (.of 1)

def boundBases : List Val :=
  [.above (.num one), .beneath (.num (.integer (.of 3))),
    .min (.str "b"), .max (.str "b"), .above (.str "b"), .beneath (.str "b"),
    .neq [.num one], .neq [.num one, .num (.integer (.of 3))], .neq [.num (.float (.dyadic 1 0))],
    .neq [.str "a"],
    .len (.lit (.num one)), .len (.min (.num one)), .len (.max (.num one)), .len .number,
    .len .float,
    .unique none, .unique (some "p")]

/-- The bases the second fragment meets pairwise. -/
def meetBases : List Val :=
  [.integer, .anyString, .above (.num one), .beneath (.num (.integer (.of 3))), .min (.str "b"),
    .neq [.num one], .len (.min (.num one)), .unique none]

def boundVals : List Val :=
  boundBases ++ boundBases.flatMap (fun v => [field true v, field false v]) ++
    meetBases.flatMap fun a => meetBases.map (.meet a)

def boundInstances : List Data :=
  [.null, .bool true, .integer 0, .integer 1, .integer 2, .integer 3,
    .num (.float (.dyadic 1 0)), .num (.float (.dyadic 3 (-1))), .num (.biginteger ⟨1⟩),
    .num (.bigdecimal (.of 15 1)),
    .str "", .str "a", .str "b", .str "ba", .str "c", .str "ab",
    .list [], .list [.integer 1], .list [.integer 1, .integer 1], .list [.integer 1, .integer 2],
    .list [.integer 1, .num (.float (.dyadic 1 0))],
    .list [.map [("p", .integer 1)], .map [("p", .integer 2)]],
    .list [.map [("p", .integer 1)], .map [("p", .integer 1)]],
    .list [.map [("p", .integer 1)], .map [("q", .integer 1)]],
    .list [.map [("p", .integer 1)], .integer 1],
    .map [], .map [("x", .integer 1)], .map [("x", .integer 1), ("y", .integer 1)],
    .map [("x", .integer 1), ("y", .integer 2)],
    .map [("x", .map [("p", .integer 1)]), ("y", .map [("p", .integer 1)])]]

theorem boundBases_checkable : ∀ v ∈ boundBases, v.Checkable := by
  intro v hv
  simp only [boundBases, List.mem_cons, List.mem_nil_iff, or_false] at hv
  rcases hv with rfl | rfl | rfl | rfl | rfl | rfl | rfl | rfl | rfl | rfl | rfl | rfl | rfl | rfl
    | rfl | rfl | rfl <;> repeat constructor

theorem meetBases_checkable : ∀ v ∈ meetBases, v.Checkable := by
  intro v hv
  simp only [meetBases, List.mem_cons, List.mem_nil_iff, or_false] at hv
  rcases hv with rfl | rfl | rfl | rfl | rfl | rfl | rfl | rfl <;> repeat constructor

theorem boundVals_checkable : ∀ v ∈ boundVals, v.Checkable := by
  intro v hv
  simp only [boundVals, List.mem_append, List.mem_flatMap, List.mem_map, List.mem_cons,
    List.mem_nil_iff, or_false] at hv
  rcases hv with (hb | ⟨b, hb, rfl | rfl⟩) | ⟨a, ha, b, hb, rfl⟩
  · exact boundBases_checkable v hb
  all_goals first
    | exact .meet (meetBases_checkable a ha) (meetBases_checkable b hb)
    | (refine .map (fun k o w hm => ?_) (fun _ h => nomatch h)
       cases List.mem_singleton.mp hm
       exact boundBases_checkable b hb)

set_option maxRecDepth 4096 in
theorem boundInstances_wellFormed : ∀ j ∈ boundInstances, j.WellFormed := by decide

/-- Every row of the second fragment is the definition's too. -/
theorem bound_verdict_exact {v : Val} (hv : v ∈ boundVals) {j : Data} (hj : j ∈ boundInstances) :
    check v j = true ↔ Instance Env.empty v j :=
  ⟨fun h => ⟨boundInstances_wellFormed j hj, (check_iff (boundVals_checkable v hv) j).mp h⟩,
    fun h => (check_iff (boundVals_checkable v hv) j).mpr h.2⟩

/-! ## The third fragment: disjunction and preference

`|` and `*` over scalars, kinds, bounds, and sealed lists, with a few
meets, each alone and under an optional key, against data that tells
the arms apart. Its rows are `test/spec/def-choice.tsv`. No map stands
in an arm, and no preference under a required key: there `vet` answers
the evaluator's question, resolving a disjunction by what its arms
still admit and filling a default the data lacks, which `Output` (P5)
is to define. -/

def two : Number := .integer (.of 2)
def three : Number := .integer (.of 3)

def choiceBases : List Val :=
  [.or [(0, .lit (.num one)), (0, .lit (.num two))],
    .or [(0, .integer), (0, .string)],
    .or [(1, .lit (.num one)), (0, .lit (.num two))],
    .or [(1, .lit (.num one)), (0, .integer)],
    .or [(0, .or [(0, .lit (.num one)), (0, .lit (.num two))]), (0, .lit (.num three))],
    .or [(0, .lit (.num one)), (0, .lit (.num (.float (.dyadic 1 0))))],
    .or [(0, .nil), (0, .lit (.num one))],
    .or [(0, .any), (0, .lit (.num one))],
    .or [(0, .min (.num (.integer (.of 0)))), (0, .string)],
    .or [(0, .anyString), (0, .integer)],
    .or [(0, .list [.integer] none true), (0, .list [.string] none true)],
    .or [(0, .list [] (some .integer) true), (0, .list [.string] none true)],
    .or [(0, .list [.integer] none true), (0, .list [.integer, .integer] none true)],
    .pref 1 (.lit (.num one)), .pref 1 .integer, .pref 1 (.lit (.str "a")), .pref 1 (.lit .null),
    .pref 1 (.list [.lit (.num one)] none true), .pref 2 (.lit (.num one)),
    .pref 1 (.min (.num three)),
    .meet (.pref 1 (.lit (.num one))) (.pref 2 (.lit (.num two))),
    .meet (.pref 1 (.lit (.num three))) (.min (.num two)),
    .list [.or [(0, .lit (.num one)), (0, .lit (.num two))]] none false,
    .map [("x", false, .or [(0, .lit (.num one)), (0, .lit (.num two))])] none false,
    .list [.integer] none true,
    .list [.integer] (some .integer) true]

def choiceVals : List Val := choiceBases ++ choiceBases.map (field true)

def choiceInstances : List Data :=
  [.null, .bool true, .integer 0, .integer 1, .integer 2, .integer 3,
    .num (.float (.dyadic 1 0)), .num (.float (.dyadic 3 (-1))), .num (.biginteger ⟨1⟩),
    .str "", .str "a",
    .list [], .list [.integer 1], .list [.integer 1, .integer 2], .list [.str "a"],
    .list [.list [.integer 1]],
    .map [], .map [("x", .integer 1)], .map [("x", .integer 3)], .map [("x", .str "a")],
    .map [("y", .integer 1)], .map [("x", .integer 1), ("y", .integer 2)]]

/-- Proves a closed term of the oracle's forms checkable: a constructor
where one applies, and the members of a short list where a premise
ranges over them. -/
macro "checkable" : tactic => `(tactic| repeat (first
  | apply checkable_or₂
  | constructor
  | (intro k o w hm; simp only [List.mem_cons, List.mem_nil_iff, or_false, Prod.mk.injEq] at hm;
     rcases hm with ⟨-, -, h⟩; subst h)
  | (intro w hw; simp only [List.mem_cons, List.mem_nil_iff, or_false] at hw <;>
     first | (rcases hw with h | h <;> subst h) | subst hw)
  | (intro s hs; cases hs)))

theorem choiceBases_checkable : ∀ v ∈ choiceBases, v.Checkable := by
  intro v hv
  simp only [choiceBases, List.mem_cons, List.mem_nil_iff, or_false] at hv
  rcases hv with rfl | rfl | rfl | rfl | rfl | rfl | rfl | rfl | rfl | rfl | rfl | rfl | rfl | rfl
    | rfl | rfl | rfl | rfl | rfl | rfl | rfl | rfl | rfl | rfl | rfl | rfl <;> checkable

theorem choiceVals_checkable : ∀ v ∈ choiceVals, v.Checkable := by
  intro v hv
  simp only [choiceVals, List.mem_append, List.mem_map] at hv
  rcases hv with hb | ⟨b, hb, rfl⟩
  · exact choiceBases_checkable v hb
  · refine .map (fun k o w hm => ?_) (fun _ h => nomatch h)
    cases List.mem_singleton.mp hm
    exact choiceBases_checkable b hb

set_option maxRecDepth 4096 in
theorem choiceInstances_wellFormed : ∀ j ∈ choiceInstances, j.WellFormed := by decide

/-- Every row of the third fragment is the definition's too. -/
theorem choice_verdict_exact {v : Val} (hv : v ∈ choiceVals) {j : Data} (hj : j ∈ choiceInstances) :
    check v j = true ↔ Instance Env.empty v j :=
  ⟨fun h => ⟨choiceInstances_wellFormed j hj, (check_iff (choiceVals_checkable v hv) j).mp h⟩,
    fun h => (check_iff (choiceVals_checkable v hv) j).mpr h.2⟩

end Aontu

open Aontu

/-! ## What evaluation singles out -/

/-- The values of the `gen` fragment: literals, kinds, preferences and
disjunctions with their ranks, maps with required, optional and
defaulted keys and spreads, lists with spreads, and meets of these, the
fill of a schema with data among them. No value here splits the ports
(#348) or writes a `nil` under an optional key, where the engines
answer `error` and the definition drops the key. -/
def genVals : List Val :=
  let int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))
  let str (s : String) : Val := .lit (.str s)
  let key (k : String) (o : Bool) (v : Val) : Val := .map [(k, o, v)] none false
  [int 1, .pref 1 (int 1), .pref 1 .integer, .integer, .any, .pref 1 (.lit .null),
    .or [(0, int 1), (0, int 2)], .or [(1, int 1), (0, int 2)], .or [(0, int 1), (1, int 2)],
    .or [(1, int 1), (1, int 2)], .or [(1, int 1), (2, int 2)], .or [(2, int 1), (1, int 2)],
    .or [(0, int 1), (0, int 1)], .or [(0, int 1), (0, int 1), (0, int 2)],
    .or [(0, .or [(1, int 1), (0, int 2)]), (0, int 3)],
    .or [(1, .or [(0, int 1), (0, int 2)]), (0, int 3)],
    .or [(1, .integer), (0, int 1)], .or [(0, .integer), (1, int 1)], .or [(1, int 1), (0, .integer)],
    .or [(1, .lit (.bool true)), (0, .lit (.bool false))],
    .pref 1 (.or [(0, int 1), (0, int 2)]),
    .meet (.pref 1 (int 1)) .integer, .meet (.pref 1 (int 1)) .number,
    .meet (.pref 1 (str "a")) .string, .meet (.pref 1 (int 8080)) (.min (.num (.integer (.of 1024)))),
    .meet (.or [(1, int 1), (0, int 2)]) .integer,
    .meet (.or [(1, int 1), (0, int 2)]) (.or [(1, int 2), (0, int 1)]),
    .meet (.or [(1, int 1), (0, int 2)]) (.or [(2, int 2), (0, int 1)]),
    .meet (.min (.num (.integer (.of 5)))) (.max (.num (.integer (.of 3)))),
    key "x" false (int 1), key "x" true (int 1), key "x" false (.pref 1 (int 1)),
    key "x" true (.pref 1 (int 1)), key "x" false .integer, key "x" true .integer,
    .map [("x", true, .integer), ("y", false, .pref 1 (int 1))] none false,
    .map [("x", false, int 1)] (some .integer) false,
    .map [("x", false, str "a")] (some .integer) false,
    .map [("a", false, key "y" false (int 2))] (some (key "x" false (.pref 1 (int 1)))) false,
    .map [("b", false, int 1), ("a", false, int 2), ("B", false, int 3)] none false,
    key "x" false (.or [(1, int 1), (1, int 2)]), key "x" false (.meet (int 1) (int 2)),
    key "x" false (.or [(0, int 1), (0, int 1)]), key "x" false (key "y" false (.pref 1 (int 1))),
    key "x" false (.list [.pref 1 (int 1), .pref 1 (int 2)] none false),
    .list [int 1, int 2] none false, .list [.pref 1 (int 1), int 2] none false,
    .list [] (some .integer) false, .list [.pref 1 (int 1)] (some .integer) false,
    .list [str "a"] (some .integer) false, .list [.list [.pref 1 (int 1)] none false] none false,
    .list [key "x" false (.pref 1 (int 1))] (some (key "y" false (.pref 1 (int 2)))) false,
    .list [.integer] none false,
    .meet (key "x" false (int 1)) (key "y" false (int 2)),
    .meet (key "x" true (.pref 1 (int 1))) (.map [] none false),
    .meet (key "x" true (.pref 1 (int 1))) (key "x" false .integer),
    .meet (key "x" true (int 1)) (key "x" true (.pref 1 (int 2))),
    .meet (.map [] (some (key "y" false (.pref 1 (int 2)))) false) (key "a" false (key "x" false (int 1))),
    .meet (.list [int 1] (some .integer) false) (.list [.integer] none false),
    .meet (.list [int 1, int 2] none true) (.list [] (some .integer) false),
    .meet (key "a" false (int 1)) (.len (int 1)), .meet (key "a" false (int 1)) (.len (int 2)),
    .meet (.or [(0, key "x" false (int 1)), (0, key "y" false (int 2))])
      (.map [("x", false, int 1), ("y", false, int 2)] none false),
    .meet (.or [(0, key "x" false (int 1)), (0, key "y" false (int 2))]) (key "x" false (int 1)),
    .pref 1 (.list [int 1] none true), .pref 1 (.list [int 1] (some .integer) true),
    .or [(1, key "x" false (int 1)), (0, key "y" false (int 2))],
    .or [(0, key "x" false (int 1)), (1, key "y" false (int 2))],
    .or [(1, .list [int 1] none true), (0, .list [int 2] none true)],
    .or [(0, .list [int 1, int 2] none true), (0, .list [int 1, int 2] none true)],
    .or [(0, key "x" false (int 1)), (0, key "x" false (int 1))],
    .or [(0, .map [("a", false, int 1), ("b", false, int 2)] none false),
      (0, .map [("b", false, int 2), ("a", false, int 1)] none false)],
    .or [(0, key "x" false (.meet (int 1) (int 2))), (0, int 1)],
    .or [(0, .list [.meet (int 1) (int 2)] none false), (0, int 1)],
    .or [(0, .nil), (0, int 1)]]

/-- Every value of the `gen` fragment normalises to a checkable one, so
`output` is `Output` on it, by `output_iff`. -/
theorem genVals_checkable : ∀ v ∈ genVals, (normalise v).Checkable := by decide

theorem gen_output_exact : ∀ v ∈ genVals, ∀ (env : Env) (root j : Data),
    output v = some j ↔ Output env root v j :=
  fun v hv _ _ j => output_iff (genVals_checkable v hv) j

/-- The `gens` rows: each value under the key `v` that generates, with
the JSON the engines must write for it. A value that generates nothing
has no row, since the definition gives no code for it until P5. -/
def genRows (tag : String) (vals : List Val) : IO Unit := do
  let mut i := 0
  for v in vals do
    let some src := v.src | throw (IO.userError "a value of the fragment has no text")
    if let some j := output v then
      let some json := j.json | throw (IO.userError "an output has no JSON")
      IO.println (tag ++ toString i ++ "\tgens\tv: " ++ src ++ "\t{\"v\":" ++ json ++ "}")
    i := i + 1

/-! ## The verdicts -/

/-- The cases of the `verdict` fragment, each a schema and a document of
data, run in the three modes of `vet`. No case writes `nil` or a
contradiction under an optional key, where the engines answer `error`
for what the definition reads as a key that must be absent, and none a
preference clash the engines find only once the data meets it. The
last case is the sealed list met with a spread (#346), which the
ledger carries. -/
def vetCases : List (Val × Data) :=
  let int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))
  let str (s : String) : Val := .lit (.str s)
  let key (k : String) (o : Bool) (v : Val) : Val := .map [(k, o, v)] none false
  let min (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .min (.num (.integer ⟨n, h⟩))
  let max (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .max (.num (.integer ⟨n, h⟩))
  let j (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .integer n h
  let xy : Val := .or [(0, key "x" false (int 1)), (0, key "y" false (int 2))]
  [(.meet (min 5) (max 3), j 1), (key "x" false (.meet (int 1) (int 2)), .map [("x", j 1)]),
    (.integer, .str "a"), (.integer, j 1), (key "x" false .integer, .map []),
    (key "x" false .integer, .map [("x", j 1)]), (key "x" true (.pref 1 (int 1)), .map []),
    (key "x" false (.pref 1 (int 1)), .map []), (key "x" false (.pref 1 (int 1)), .map [("x", j 2)]),
    (key "x" false (.pref 1 (int 1)), .map [("x", .str "a")]),
    (xy, .map [("x", j 1)]), (xy, .map [("x", j 1), ("y", j 2)]), (xy, .map [("z", j 3)]),
    (.or [(1, int 1), (1, int 2)], j 1), (.or [(0, int 1), (0, int 2)], j 3),
    (.or [(0, int 1), (0, int 2)], j 1), (.list [] (some .integer) false, .list [j 1, .str "a"]),
    (.list [] (some .integer) false, .list []), (key "x" true .integer, .map []),
    (key "x" true .integer, .map [("x", .str "a")]),
    (.map [("x", false, .integer), ("y", false, .pref 1 (int 1))] none false, .map []),
    (.any, .map [("a", .list [j 1])]), (.string, .str ""), (.pref 1 (int 1), j 2),
    (.pref 1 (int 1), .num (.float (.dyadic 3 (-1)))),
    (key "x" false (key "y" false .integer), .map [("x", .map [])]),
    (key "x" false (key "y" false .integer), .map []),
    (.list [.integer] none false, .list []), (.list [.integer] none false, .list [j 1]),
    (.list [int 1] none false, .list [j 1, j 2]), (.list [int 1] none true, .list [j 1, j 2]),
    (key "x" false (int 1), .map [("x", j 1), ("y", j 2)]),
    (key "x" false (.or [(1, int 1), (0, int 2)]), .map []),
    (key "x" false (.or [(0, int 1), (0, int 2)]), .map []),
    (key "x" false (.or [(1, int 1), (1, int 2)]), .map []),
    (.meet .integer (min 3), j 2), (key "x" false .integer, j 1), (.list [int 1] none false, .map [("x", j 1)]),
    (.or [(0, key "x" false (.pref 1 (int 1))), (0, key "y" false (.pref 1 (int 2)))], .map []),
    (.or [(1, int 1), (1, .integer)], j 1), (.or [(1, int 1), (1, int 2), (0, int 3)], j 3),
    (.pref 1 (.or [(0, int 1), (0, int 2)]), j 1), (.pref 1 (.or [(0, int 1), (0, int 2)]), j 3),
    (.map [] (some (.meet (int 1) (int 2))) false, .map []),
    (key "x" false (.or [(1, int 1), (1, int 1)]), .map []),
    (.meet (key "x" true (.pref 1 (int 1))) (key "x" true (.pref 1 (int 2))), .map []),
    (.or [(0, .nil), (0, int 1)], j 1), (.or [(0, .nil), (0, int 1)], j 2),
    (.map [("a", false, .pref 1 (int 1)), ("b", false, .integer)] none false, .map []),
    (.map [("a", false, .pref 1 (int 1)), ("b", false, .integer)] none false, .map [("b", j 2)]),
    (.list [.pref 1 (int 1)] none false, .list []), (.list [.pref 1 (int 1)] none false, .list [j 2]),
    (str "a", .str "a"), (str "a", .str "b"), (.lit .null, .null), (.lit (.bool true), .bool false),
    (.meet (.list [int 1, int 2] none true) (.list [] (some .integer) false), .list [j 1, j 2, j 3])]

/-- The schema and data of a case, each under the key `v`, as the rows
write them. -/
def vetDoc (c : Val × Data) : Val × Data := (.map [("v", false, c.1)] none false, .map [("v", c.2)])

/-- Every case's schema and meet normalise to checkable terms, so `vet`
is `Vet` on it, by `vet_iff`. -/
theorem vetCases_checkable : ∀ c ∈ vetCases,
    (vetDoc c).1.Checkable ∧ (normalise (meet (vetDoc c).1 (vetDoc c).2.term)).Checkable := by decide

theorem vet_verdict_exact : ∀ c ∈ vetCases, ∀ (m : Mode) (env : Env) (v : Verdict),
    vet m (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m env (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ _ v => vet_iff (vetCases_checkable c hc).1 (vetCases_checkable c hc).2 v

def verdictName : Verdict → String
  | .valid => "valid"
  | .invalid => "invalid"
  | .incomplete => "incomplete"
  | .error => "error"

/-- The `verdict` rows: each case in the default mode, without the fill
and under `--partial`, with the one class `vet` gives. -/
def verdictRows (tag : String) : IO Unit := do
  let mut i := 0
  for c in vetCases do
    let some ssrc := c.1.src | throw (IO.userError "a schema of the fragment has no text")
    let some dsrc := c.2.src | throw (IO.userError "a document of the fragment has no text")
    let (S, D) := vetDoc c
    for (m, opts) in [(({} : Mode), ""), (({ fill := false } : Mode), ",\"opts\":{\"noFill\":true}"),
        (({ lax := true } : Mode), ",\"opts\":{\"partial\":true}")] do
      IO.println (tag ++ toString i ++ "\tverdict\tv: " ++ ssrc ++ "\tv: " ++ dsrc ++ "\t{\"verdict\":\""
        ++ verdictName (vet m S D) ++ "\"" ++ opts ++ "}")
      i := i + 1

/-- The rows of one fragment: each value against each instance of each
block, numbered from zero under `tag`. -/
def rows (tag : String) (vals : List Val) (blocks : List (List Data)) : IO Unit := do
  let head := "{\"verdict\":"
  let mut i := 0
  for block in blocks do
    for v in vals do
      let some src := v.src | throw (IO.userError "a value of the fragment has no text")
      for j in block do
        let some jsrc := j.src | throw (IO.userError "an instance has no text")
        let want := if check v j then "\"valid\"" else "[\"invalid\",\"incomplete\",\"error\"]"
        IO.println (tag ++ toString i ++ "\tverdict\tv: " ++ src ++ "\tv: " ++ jsrc
          ++ "\t" ++ head ++ want ++ "}")
        i := i + 1

def main (args : List String) : IO UInt32 := do
  match args with
  | [] =>
    IO.println "# Generated by `lake exe oracle` (spec/Oracle.lean) from the definition in"
    IO.println "# spec/Aontu: every value of the fragment up to one meet (600) against 24"
    IO.println "# instances, the first 16 in rows c0 to c9599 and the other 8 after them,"
    IO.println "# as `verdict` rows whose expectation is the verdict `check` gives, which"
    IO.println "# `check_iff` makes the definition's own. Until P5 the definition gives"
    IO.println "# admission only, so a refusal is written as the three classes it may be."
    IO.println "# Each row runs plain `vet`, its data written in aontu, exact numbers marked `0d`."
    IO.println "# Regenerate with `make spec`; never edit by hand. The cases the ports do"
    IO.println "# not yet answer this way are listed in spec/ledger.tsv."
    rows "c" vals [first, more]
    return 0
  | ["bounds"] =>
    IO.println "# Generated by `lake exe oracle bounds` (spec/Oracle.lean) from the definition"
    IO.println "# in spec/Aontu: the bounds beyond min, max, and multiple (above, below, the"
    IO.println "# string bounds, neq, len, unique), each alone and under a key, and the meets"
    IO.println "# of eight of them pairwise (115 values), against 30 instances, as `verdict`"
    IO.println "# rows whose expectation is the verdict `check` gives, which `check_iff`"
    IO.println "# makes the definition's own; a refusal is written as the three classes it"
    IO.println "# may be. Each row runs plain `vet`, its data written in aontu."
    IO.println "# Regenerate with `make spec`; never edit by hand. The cases the ports do"
    IO.println "# not yet answer this way are listed in spec/ledger.tsv."
    rows "b" boundVals [boundInstances]
    return 0
  | ["choice"] =>
    IO.println "# Generated by `lake exe oracle choice` (spec/Oracle.lean) from the definition"
    IO.println "# in spec/Aontu: disjunction and preference over scalars, kinds, bounds, and"
    IO.println "# sealed lists, with a few meets, each alone and under an optional key (50"
    IO.println "# values), against 22 instances, as `verdict` rows whose expectation is the"
    IO.println "# verdict `check` gives, which `check_iff` makes the definition's own; a"
    IO.println "# refusal is written as the three classes it may be. No map stands in an arm"
    IO.println "# and no preference under a required key, where the verdict is the"
    IO.println "# evaluator's question. Each row runs plain `vet`, its data written in aontu."
    IO.println "# Regenerate with `make spec`; never edit by hand. The cases the ports do"
    IO.println "# not yet answer this way are listed in spec/ledger.tsv."
    rows "d" choiceVals [choiceInstances]
    return 0
  | ["gen"] =>
    IO.println "# Generated by `lake exe oracle gen` (spec/Oracle.lean) from the definition in"
    IO.println "# spec/Aontu: what evaluation singles out, `Output`, on literals, preferences"
    IO.println "# and disjunctions with their ranks, maps and lists with defaults and spreads,"
    IO.println "# and meets of these, as `gens` rows whose expectation is the JSON of the"
    IO.println "# value `output` gives, which `output_iff` makes the definition's own. A value"
    IO.println "# that singles out nothing has no row until P5 names its class. Each row runs"
    IO.println "# evaluation on a document with the one key `v`."
    IO.println "# Regenerate with `make spec`; never edit by hand. The cases the ports do"
    IO.println "# not yet answer this way are listed in spec/ledger.tsv."
    genRows "g" genVals
    return 0
  | ["verdict"] =>
    IO.println "# Generated by `lake exe oracle verdict` (spec/Oracle.lean) from the definition"
    IO.println "# in spec/Aontu: the verdicts of vet, each case a schema and a document under"
    IO.println "# the key v, run in the default mode, without the fill (noFill) and under"
    IO.println "# --partial (partial), as `verdict` rows whose expectation is the one class"
    IO.println "# `vet` gives, which `vet_iff` makes the definition's own: error where the"
    IO.println "# schema does not stand, invalid where the meet is dead, valid where it"
    IO.println "# singles out a value (and the data is an instance, without the fill), and"
    IO.println "# incomplete otherwise."
    IO.println "# Regenerate with `make spec`; never edit by hand. The cases the ports do"
    IO.println "# not yet answer this way are listed in spec/ledger.tsv."
    verdictRows "e"
    return 0
  | _ =>
    IO.eprintln "usage: oracle [bounds | choice | gen | verdict]"
    return 2
