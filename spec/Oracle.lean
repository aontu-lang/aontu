import Aontu.Check
import Aontu.Output
import Aontu.Verdict
import Aontu.Paths
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

/-- Every case's schema holds no path, no pattern and no format, so `vet`
is `Vet` on it, by `vet_iff`. -/
theorem vetCases_checkable : ∀ c ∈ vetCases, (vetDoc c).1.CheckableA := by decide

theorem vet_verdict_exact : ∀ c ∈ vetCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil _)) (vetCases_checkable c hc) v

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
        ++ verdictName (vet m [] S D) ++ "\"" ++ opts ++ "}")
      i := i + 1

/-- The cases of the `alias` fragment: declarations, a schema and a
document, the last two under the key `v`: names that are not recursive,
replaced as the document reads, and recursive ones, left as residuals
that the data expands, a linked list, a tree, a spread of itself, a
pair that refer to each other. The cases that break the alias-cycle
rule or refer to a name declared nowhere are errors before anything
else is asked, and `%T = %T | 1`, which the engines run, is one. -/
def aliasCases : List (Decls × Val × Data) :=
  let int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))
  let str (s : String) : Val := .lit (.str s)
  let key (k : String) (o : Bool) (v : Val) : Val := .map [(k, o, v)] none false
  let min (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .min (.num (.integer ⟨n, h⟩))
  let j (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .integer n h
  let p : Val := .alias "p"
  [([("p", .meet .integer (min 1))], p, j 5), ([("p", .meet .integer (min 1))], p, j 0),
    ([("p", .meet .integer (min 1))], p, .str "a"),
    ([("p", .pref 1 (int 1))], key "x" false p, .map []),
    ([("a", .alias "b"), ("b", .pref 1 (int 1))], key "x" false (.alias "a"), .map []),
    ([("p", .integer)], .map [] (some p) false, .map [("a", j 1), ("b", .str "x")]),
    ([("p", .integer)], .map [] (some p) false, .map [("a", j 1)]),
    ([("p", .integer)], .list [p, p] none false, .list [j 1, j 2]),
    ([("p", .integer)], .list [p, p] none false, .list [j 1, .str "a"]),
    ([("T", .integer)], .alias "T", .num (.float (.dyadic 3 (-1)))),
    ([("T", .integer)], int 1, j 1),
    ([("A", .integer), ("B", .alias "A")], .alias "B", j 1),
    ([("A", .integer), ("B", .alias "A")], .alias "B", .str "a"),
    ([("p", key "x" false (int 1))], p, .map []),
    ([("p", key "x" false (int 1))], .meet p (key "y" false (int 2)), .map []),
    ([("p", .or [(0, int 1), (0, int 2)])], p, j 2), ([("p", .or [(0, int 1), (0, int 2)])], p, j 3),
    ([("p", .or [(1, int 1), (0, int 2)])], key "x" false p, .map []),
    ([("p", .integer), ("p", min 1)], p, j 0), ([("p", .integer), ("p", min 1)], p, j 5),
    ([("p", .integer)], .map [("a", false, p), ("b", true, p)] none false, .map [("a", j 1), ("b", .str "x")]),
    ([("p", .integer)], .map [("a", false, p), ("b", true, p)] none false, .map [("a", j 1)]),
    ([("p", .list [int 1, int 2] none false)], p, .list [j 1, j 2, j 3]),
    ([("q", .meet p (min 1)), ("p", .integer)], .alias "q", j 0),
    ([("q", .meet p (min 1)), ("p", .integer)], .alias "q", j 3),
    ([("p", int 1)], .list [p] (some p) false, .list [j 1, j 1, j 1]),
    ([("p", int 1)], .list [p] (some p) false, .list [j 1, j 2]),
    ([("p", .string)], p, .str ""), ([("p", .len (int 2))], p, .str "ab"),
    ([("p", int 1)], .pref 1 p, j 2), ([("p", int 1)], .pref 1 p, .str "a"),
    ([], .alias "nosuch", j 1), ([("A", .alias "B"), ("B", .alias "A")], .alias "A", j 1),
    ([("T", .meet (.alias "T") .integer)], .alias "T", j 1), ([("a", .alias "zz")], int 1, j 1),
    ([("U", .alias "U")], .alias "U", j 1),
    ([("N", .map [("n", false, .integer), ("next", true, .alias "N")] none false)], .alias "N",
      .map [("n", j 1), ("next", .map [("n", j 2)])]),
    ([("N", .map [("n", false, .integer), ("next", true, .alias "N")] none false)], .alias "N",
      .map [("n", j 1), ("next", .map [("n", .str "a")])]),
    ([("N", .map [("n", false, .integer), ("next", true, .alias "N")] none false)], .alias "N",
      .map [("n", j 1), ("next", .map [])]),
    ([("N", .map [("n", false, .integer), ("next", false, .alias "N")] none false)], .alias "N",
      .map [("n", j 1)]),
    ([("T", .map [("x", true, .alias "T"), ("y", false, .pref 1 (int 1))] none false)], .alias "T", .map []),
    ([("T", .map [("x", true, .alias "T"), ("y", false, .pref 1 (int 1))] none false)], .alias "T",
      .map [("x", .map [])]),
    ([("T", .map [("x", true, .alias "T"), ("y", false, .pref 1 (int 1))] none false)],
      key "a" true (.alias "T"), .map []),
    ([("T", .map [("x", true, .alias "T"), ("y", false, .pref 1 (int 1))] none false)],
      key "a" false (.alias "T"), .map [("a", .map [])]),
    ([("T", .map [("x", true, .alias "T"), ("y", false, .pref 1 (int 1))] none false)], .alias "T",
      .map [("y", j 1)]),
    ([("T", .map [("x", true, .alias "T"), ("y", false, .pref 1 (int 1))] none false)], .alias "T", j 1),
    ([("T", .map [("x", true, .alias "T"), ("y", false, .pref 1 (int 1))] none false)], .alias "T",
      .map [("x", j 1)]),
    ([("T", .map [("x", true, .alias "T"), ("y", false, .pref 1 (int 1))] none false)], .alias "T",
      .map [("x", .map [("x", .map [("y", j 5)])])]),
    ([("T", .map [("x", true, .alias "T"), ("y", false, .pref 1 (int 1))] none false)],
      .list [.alias "T"] none false, .list [.map []]),
    ([("T", .map [("x", true, .alias "T"), ("y", false, .pref 1 (int 1))] none false)],
      .list [] (some (.alias "T")) false, .list [.map [], .map [("x", .map [])]]),
    ([("T", .map [("x", true, .alias "T"), ("y", false, .pref 1 (int 1))] none false)],
      .map [] (some (.alias "T")) false, .map [("a", .map [])]),
    ([("T", .map [("x", true, .alias "T"), ("y", false, .pref 1 (int 1))] none false)],
      .or [(0, .alias "T"), (0, int 2)], .map []),
    ([("T", key "x" true (.alias "T"))], .alias "T", .map []),
    ([("T", key "x" true (.alias "T"))], .alias "T", .map [("x", .map [("x", .map [])])]),
    ([("T", .map [] (some (.alias "T")) false)], .alias "T", .map [("a", .map [("b", .map [])])]),
    ([("T", .map [] (some (.alias "T")) false)], .alias "T", .map [("a", j 1)]),
    ([("T", .list [] (some (.alias "T")) false)], .alias "T", .list [.list [], .list [.list []]]),
    ([("T", .or [(1, .lit .null), (0, .map [("n", false, .integer), ("next", false, .alias "T")] none false)])],
      .alias "T", .map [("n", j 1), ("next", .map [("n", j 2)])]),
    ([("L", .map [("n", false, .integer), ("next", true, .alias "L")] none false), ("W", key "list" false (.alias "L"))],
      .alias "W", .map [("list", .map [("n", j 1), ("next", .map [("n", j 2)])])]),
    ([("A", key "b" true (.alias "B")), ("B", key "a" true (.alias "A"))], .alias "A",
      .map [("b", .map [("a", .map [("b", .map [])])])]),
    ([("A", key "b" true (.alias "B")), ("B", key "a" true (.alias "A"))], .alias "A",
      .map [("b", .map [("a", j 1)])]),
    ([("A", key "b" true (.alias "B")), ("B", key "a" true (.alias "A"))], .alias "B", .map [("a", .map [])]),
    ([("T", .map [("n", false, .integer), ("next", true, .alias "T")] none false)], .alias "T",
      .map [("n", j 1), ("next", .map [("n", j 2), ("extra", j 1)])]),
    ([("T", .map [("n", false, .pref 1 (int 0)), ("next", true, .alias "T")] none false)], .alias "T",
      .map [("next", .map [("next", .map [])])]),
    ([("T", .map [("n", false, .integer), ("next", true, .alias "T")] none false)],
      .map [("a", false, .alias "T"), ("b", false, .alias "T")] none false,
      .map [("a", .map [("n", j 1)]), ("b", .map [("n", j 2), ("next", .map [("n", j 3)])])]),
    ([("T", .map [("n", false, .integer), ("next", true, .alias "T")] none false)],
      .meet (.alias "T") (key "n" false (int 1)), .map []),
    ([("T", .map [("n", false, .integer), ("next", true, .alias "T")] none false)],
      .meet (.alias "T") (key "n" false (int 1)), .map [("next", .map [("n", j 2)])]),
    ([("T", .map [("n", false, .integer), ("next", true, .alias "T")] none false), ("T", key "m" false (.pref 1 (int 0)))],
      .alias "T", .map [("n", j 1)]),
    ([("T", .map [("n", false, .integer), ("next", true, .alias "T")] none false)], .alias "T",
      .map [("n", j 1), ("next", .map [("n", j 2), ("next", .map [("n", j 3), ("next", .map [("n", j 4)])])])]),
    ([("T", .or [(0, .alias "T"), (0, int 1)])], .alias "T", j 1)]

/-- The schema and data of a case, each under the key `v`, as the rows
write them. -/
def aliasDoc (c : Decls × Val × Data) : Val × Data :=
  (.map [("v", false, c.2.1)] none false, .map [("v", c.2.2)])

/-- Every case's bodies and schema hold no path, no pattern and no
format, so `vet` is `Vet` on it, by `vet_iff`. -/
theorem aliasCases_checkable : ∀ c ∈ aliasCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (aliasDoc c).1.CheckableA := by decide

theorem alias_verdict_exact : ∀ c ∈ aliasCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 (aliasDoc c).1 (aliasDoc c).2 = v ↔ Vet m c.1 (aliasDoc c).1 (aliasDoc c).2 v :=
  fun c hc _ v => vet_iff (aliasCases_checkable c hc).1 (aliasCases_checkable c hc).2 v

/-- The `alias` rows: each case's declarations and schema as one
document, in the three modes, with the one class `vet` gives. -/
def aliasRows (tag : String) : IO Unit := do
  let mut i := 0
  for c in aliasCases do
    let mut lines : List String := []
    for d in c.1 do
      let some bsrc := d.2.src | throw (IO.userError "a body of the fragment has no text")
      lines := lines ++ ["%" ++ d.1 ++ " = " ++ bsrc]
    let some ssrc := c.2.1.src | throw (IO.userError "a schema of the fragment has no text")
    let some dsrc := c.2.2.src | throw (IO.userError "a document of the fragment has no text")
    let src := "\\n".intercalate (lines ++ ["v: " ++ ssrc])
    let (S, D) := aliasDoc c
    for (m, opts) in [(({} : Mode), ""), (({ fill := false } : Mode), ",\"opts\":{\"noFill\":true}"),
        (({ lax := true } : Mode), ",\"opts\":{\"partial\":true}")] do
      IO.println (tag ++ toString i ++ "\tverdict\t" ++ src ++ "\tv: " ++ dsrc ++ "\t{\"verdict\":\""
        ++ verdictName (vet m c.1 S D) ++ "\"" ++ opts ++ "}")
      i := i + 1

/-! ## The seventh fragment: paths -/

/-- Documents with paths: each case its declarations, a schema that is
a map with paths in it, and a document, run in the three modes. -/
def pathCases : List (Decls × Val × Data) :=
  let int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))
  let m (fs : List (String × Val)) : Val := .map (fs.map fun f => (f.1, false, f.2)) none false
  let mo (fs : List (String × Bool × Val)) : Val := .map fs none false
  let min (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .min (.num (.integer ⟨n, h⟩))
  let j (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .integer n h
  let pa : Val := .path [.key "a"]
  let pb : Val := .path [.key "b"]
  let p (ks : List String) : Val := .path (ks.map .key)
  let step (o : Bool) : Val := m [("schema", m [("Step", mo [("label", false, .string), ("then", o, p ["schema", "Step"])])]), ("doc", p ["schema", "Step"])]
  [([], m [("a", int 1), ("b", pa)], .map [("a", j 1), ("b", j 1)]),
    ([], m [("a", int 1), ("b", pa)], .map [("a", j 1), ("b", j 2)]),
    ([], m [("a", int 1), ("b", pa)], .map [("a", j 1)]),
    ([], m [("a", int 1), ("b", pa)], .map [("b", j 1)]),
    ([], m [("a", int 1), ("b", pa)], .map []),
    ([], m [("a", int 1), ("b", pa)], .map [("a", j 2), ("b", j 2)]),
    ([], m [("a", .integer), ("b", pa)], .map [("a", j 1), ("b", j 1)]),
    ([], m [("a", .integer), ("b", pa)], .map [("a", j 1), ("b", j 2)]),
    ([], m [("a", .integer), ("b", pa)], .map [("a", j 1)]),
    ([], m [("a", .integer), ("b", pa)], .map [("b", j 1)]),
    ([], m [("a", .integer), ("b", pa)], .map [("a", j 1), ("b", .num (.float (.dyadic 3 (-1))))]),
    ([], m [("a", .integer), ("b", .meet pa (min 2))], .map [("a", j 1), ("b", j 1)]),
    ([], m [("a", .integer), ("b", .meet pa (min 2))], .map [("a", j 3), ("b", j 3)]),
    ([], m [("b", pa)], .map [("a", j 5), ("b", j 5)]),
    ([], m [("b", pa)], .map [("b", j 5)]),
    ([], m [("a", pb), ("b", pa)], .map [("a", j 1), ("b", j 1)]),
    ([], m [("a", pa)], .map [("a", j 1)]),
    ([], m [("a", p ["nope"])], .map [("a", j 1)]),
    ([], m [("a", .list [int 1, int 2] none false), ("b", .path [.key "a", .idx 1])], .map [("b", j 2)]),
    ([], m [("a", .list [int 1, int 2] none false), ("b", .path [.key "a", .idx 5])], .map [("b", j 1)]),
    ([], m [("a", m [("x", int 1)]), ("b", pa)], .map [("b", .map [("x", j 1)])]),
    ([], m [("a", m [("x", int 1)]), ("b", pa)], .map [("b", .map [("x", j 1), ("y", j 2)])]),
    ([], m [("a", m [("x", .integer)]), ("b", p ["a", "x"])], .map [("a", .map [("x", j 7)]), ("b", j 7)]),
    ([], m [("a", m [("x", .integer)]), ("b", p ["a", "x"])], .map [("b", j 7)]),
    ([], mo [("a", true, int 1), ("b", false, pa)], .map [("b", j 1)]),
    ([], mo [("a", true, int 1), ("b", false, pa)], .map [("a", j 1), ("b", j 1)]),
    ([], mo [("a", true, .integer), ("b", false, pa)], .map [("b", j 1)]),
    ([], m [("a", .pref 1 (int 1)), ("b", pa)], .map [("b", j 2)]),
    ([], m [("a", .pref 1 (int 1)), ("b", pa)], .map [("b", j 1)]),
    ([], m [("a", .pref 1 (int 1)), ("b", pa)], .map [("a", j 2), ("b", j 2)]),
    ([], m [("a", pb), ("b", int 1)], .map [("a", j 1)]),
    ([], m [("a", pb), ("b", p ["c"]), ("c", int 1)], .map [("a", j 1), ("b", j 1), ("c", j 1)]),
    ([], m [("a", m [("x", int 1)]), ("b", p ["a", "y"])], .map [("b", j 1)]),
    ([], m [("a", m [("b", p ["c"])]), ("c", int 3)], .map [("a", .map [("b", j 3)])]),
    ([], m [("a", int 1), ("b", .map [] (some pa) false)], .map [("b", .map [("p", j 1), ("q", j 1)])]),
    ([], m [("a", int 1), ("b", .map [] (some pa) false)], .map [("b", .map [("p", j 1), ("q", j 2)])]),
    ([], m [("a", int 1), ("b", .list [] (some pa) false)], .map [("b", .list [j 1, j 1])]),
    ([], m [("a", .integer), ("b", .or [(0, pa), (0, .string)])], .map [("a", j 1), ("b", .str "s")]),
    ([], m [("a", .integer), ("b", .or [(0, pa), (0, .string)])], .map [("a", j 1), ("b", j 2)]),
    ([], m [("a", m [("x", .integer)]), ("b", .meet pa (m [("y", int 1)]))],
      .map [("a", .map [("x", j 1)]), ("b", .map [("x", j 1), ("y", j 1)])]),
    ([], m [("a", m [("x", .integer)]), ("b", .meet pa (m [("y", int 1)]))],
      .map [("a", .map [("x", j 1)]), ("b", .map [("x", j 2), ("y", j 1)])]),
    ([], m [("a", m [("x", .integer)]), ("b", pa)], .map [("a", .map [("x", j 1), ("z", j 2)]), ("b", .map [("x", j 1)])]),
    ([], m [("a", .or [(0, int 1), (0, int 2)]), ("b", pa)], .map [("b", j 2)]),
    ([], m [("a", .or [(0, int 1), (0, int 2)]), ("b", pa)], .map [("a", j 1), ("b", j 2)]),
    ([], m [("a", .or [(0, int 1), (0, int 2)]), ("b", pa)], .map [("b", j 3)]),
    ([], m [("a", .integer), ("b", pa), ("c", pb)], .map [("a", j 1), ("c", j 2)]),
    ([], m [("a", m [("x", p ["a", "x"])])], .map [("a", .map [("x", j 1)])]),
    ([], m [("a", m [("b", mo [("c", true, p ["a", "b"])])])], .map [("a", .map [("b", .map [])])]),
    ([], m [("a", m [("b", mo [("c", true, p ["a", "b"])])])], .map [("a", .map [("b", .map [("c", .map [])])])]),
    ([], m [("a", .meet pa .integer)], .map [("a", j 1)]),
    ([("T", m [("v", p ["c"])])], m [("c", int 7), ("a", .alias "T")], .map [("a", .map [("v", j 7)])]),
    ([("T", m [("v", p ["c"])])], m [("c", int 7), ("a", .alias "T")], .map [("a", .map [("v", j 8)])]),
    ([("T", m [("v", int 1)])], m [("a", .alias "T"), ("b", p ["a", "v"])], .map [("b", j 1)]),
    ([("N", mo [("n", false, .integer), ("next", true, .alias "N")])], m [("a", .alias "N"), ("b", p ["a", "n"])],
      .map [("a", .map [("n", j 1)]), ("b", j 1)]),
    ([], step true, .map [("doc", .map [("label", .str "a"), ("then", .map [("label", .str "b")])])]),
    ([], step true, .map [("doc", .map [("label", .str "a"), ("then", .map [("label", j 1)])])]),
    ([], step false, .map [("doc", .map [("label", .str "a")])]),
    ([], m [("a", .meet (m [("x", int 1)]) (m [("y", int 2)])), ("b", p ["a", "y"])], .map [("b", j 2)]),
    ([], m [("a", .or [(0, m [("v", int 1)]), (0, m [("v", int 2)])]), ("b", p ["a", "v"])], .map [("a", .map [("v", j 1)]), ("b", j 1)]),
    ([], m [("a", m [("x", int 1), ("y", int 2)]), ("b", .meet pa (m [("x", int 2)]))], .map [("b", .map [("x", j 2), ("y", j 2)])])]

/-- Every case's bodies and schema hold no pattern and no format, so
`vetP` is `VetP` on it, by `vetP_iff`. -/
theorem pathCases_checkable : ∀ c ∈ pathCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem path_verdict_exact : ∀ c ∈ pathCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (pathCases_checkable c hc).1 (pathCases_checkable c hc).2 v

/-- The `paths` rows: each case's declarations and schema as one
document, the schema's braces dropped since neither CLI reads a braced
map after a declaration, in the three modes, with the one class `vetP`
gives. -/
def pathRows (tag : String) : IO Unit := do
  let mut i := 0
  for c in pathCases do
    let mut lines : List String := []
    for d in c.1 do
      let some bsrc := d.2.src | throw (IO.userError "a body of the fragment has no text")
      lines := lines ++ ["%" ++ d.1 ++ " = " ++ bsrc]
    let some ssrc := c.2.1.src | throw (IO.userError "a schema of the fragment has no text")
    let some dsrc := c.2.2.src | throw (IO.userError "a document of the fragment has no text")
    let src := "\\n".intercalate (lines ++ [(ssrc.drop 1).dropRight 1])
    for (m, opts) in [(({} : Mode), ""), (({ fill := false } : Mode), ",\"opts\":{\"noFill\":true}"),
        (({ lax := true } : Mode), ",\"opts\":{\"partial\":true}")] do
      IO.println (tag ++ toString i ++ "\tverdict\t" ++ src ++ "\t" ++ dsrc ++ "\t{\"verdict\":\""
        ++ verdictName (vetP m c.1 c.2.1 c.2.2) ++ "\"" ++ opts ++ "}")
      i := i + 1

/-! ## The eighth fragment: trials -/

/-- Documents with trial schemas inside values: each case its
declarations, a map as the schema, and a map as the document, run in
the three modes. `nof` with each kind of count, over kinds, literals,
maps, lists and names; beside literals, defaults and disjunctions;
nested; through a recursive name; and `must`, with a conflicting branch
among them. -/
def trialCases : List (Decls × Val × Data) :=
  let int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))
  let str (s : String) : Val := .lit (.str s)
  let m (fs : List (String × Val)) : Val := .map (fs.map fun f => (f.1, false, f.2)) none false
  let mo (fs : List (String × Bool × Val)) : Val := .map fs none false
  let min (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .min (.num (.integer ⟨n, h⟩))
  let max (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .max (.num (.integer ⟨n, h⟩))
  let j (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .integer n h
  let a (v : Val) : Val := m [("a", v)]
  let da (x : Data) : Data := .map [("a", x)]
  let nof (n : Val) (cs : List Val) : Val := .nof n cs
  let must (c : Val) : Val := .must c "m"
  let T : Val := .alias "T"
  [([], a (nof (int 1) [.string, .number]), da (.str "x")),
    ([], a (nof (int 1) [.string, .number]), da (j 1)),
    ([], a (nof (int 1) [.string, .number]), da (.bool true)),
    ([], a (nof (int 0) [.integer]), da (j 1)),
    ([], a (nof (int 0) [.integer]), da (.str "s")),
    ([], a (nof (int 2) [.string, .string]), da (.str "x")),
    ([], a (nof (int 1) [.string, .string]), da (.str "x")),
    ([], a (nof (min 1) [.string, .number]), da (.bool true)),
    ([], a (nof (min 1) [.string, .number]), da (j 1)),
    ([], a (nof (max 0) [.string]), da (j 1)),
    ([], a (nof (max 0) [.string]), da (.str "x")),
    ([], a (nof (.meet (min 1) (max 1)) [.string, .number]), da (.str "x")),
    ([], a (nof (int 1) [.any]), da (.str "x")),
    ([], a (nof (int 1) [.nil, .string]), da (.str "x")),
    ([], a (nof (int 0) [.nil]), da (.str "x")),
    ([], a (nof (int 1) [.meet (int 1) (int 2), .string]), da (.str "x")),
    ([], a (nof (int 1) [.meet (int 1) (int 2)]), da (j 1)),
    ([], a (nof (int (-1)) [.string]), da (.str "x")),
    ([], a (nof (.lit (.num (.float (.dyadic 3 (-1))))) [.string]), da (.str "x")),
    ([], a (nof .string [.string]), da (.str "x")),
    ([], a (nof (min 1) [m [("x", int 1)], m [("y", int 2)]]), da (.map [("x", j 1)])),
    ([], a (nof (min 1) [m [("x", int 1)], m [("y", int 2)]]), da (.map [("z", j 1)])),
    ([], a (nof (int 1) [mo [("x", true, .number)], mo [("y", true, .string)]]), da (.map [("x", j 1)])),
    ([], a (nof (int 2) [mo [("x", true, .number)], mo [("y", true, .string)]]), da (.map [("x", j 1)])),
    ([], a (nof (int 1) [m [("x", .number)], m [("y", .string)]]), da (.map [("x", j 1)])),
    ([], a (nof (int 0) [m [("b", nof (int 0) [.integer])]]), da (.map [("b", j 1)])),
    ([], a (nof (int 0) [m [("b", nof (int 0) [.integer])]]), da (.map [("b", .str "s")])),
    ([], a (.meet .integer (nof (int 0) [int 5])), da (j 5)),
    ([], a (.meet .integer (nof (int 0) [int 5])), da (j 6)),
    ([], a (.meet (nof (int 1) [.string, .number]) (str "x")), .map []),
    ([], a (.meet (nof (int 1) [int 1, int 2]) (int 3)), .map []),
    ([], a (.meet (nof (int 1) [int 1, int 2]) (int 3)), da (j 3)),
    ([], a (.meet (nof (int 0) [.string]) (int 1)), .map []),
    ([], a (.meet (nof (int 0) [.string]) (str "x")), .map []),
    ([], a (.meet (nof (int 1) [m [("x", int 1)]]) (m [("x", int 1)])), .map []),
    ([], a (.meet (nof (int 0) [m [("x", int 1)]]) (m [("x", int 1)])), .map []),
    ([], a (.meet (nof (int 1) [mo [("x", true, int 1)]]) (m [("y", int 2)])), da (.map [("y", j 2)])),
    ([], a (.meet (nof (int 1) [m [("x", int 1)]]) (m [("x", .integer)])), da (.map [("x", j 2)])),
    ([], a (.meet (nof (int 1) [m [("x", int 1)]]) (m [("x", .integer)])), da (.map [("x", j 1)])),
    ([], a (.meet (nof (int 1) [int 1, int 2]) (.pref 1 (int 3))), .map []),
    ([], a (.meet (nof (int 1) [int 1, int 2]) (.pref 1 (int 1))), da (j 5)),
    ([], a (.meet (nof (int 1) [int 1, int 2]) (.pref 1 (int 1))), .map []),
    ([], a (.meet (nof (int 1) [int 1, int 2]) (.or [(0, int 1), (0, int 2)])), .map []),
    ([], a (.meet (nof (int 1) [int 1, int 2]) (.or [(0, int 1), (0, int 2)])), da (j 1)),
    ([], a (.pref 1 (nof (int 1) [.string])), da (j 1)),
    ([], a (.list [nof (int 1) [.string]] none false), da (.list [.str "x"])),
    ([], a (.list [nof (int 1) [.string]] none false), da (.list [j 1])),
    ([], a (.map [] (some (nof (int 1) [.string])) false), da (.map [("x", .str "y")])),
    ([], a (.map [] (some (nof (int 1) [.string])) false), da (.map [("x", j 1)])),
    ([], a (.or [(0, nof (int 1) [.string, .number]), (0, .boolean)]), da (.bool true)),
    ([("p", .string), ("q", .number)], a (nof (int 1) [.alias "p", .alias "q"]), da (.str "x")),
    ([("T", mo [("a", true, nof (int 0) [T])])], m [("t", T)], .map [("t", .map [("a", .map [])])]),
    ([("T", mo [("a", true, nof (int 0) [T])])], m [("t", T)],
      .map [("t", .map [("a", .map [("a", .map [])])])]),
    ([("T", nof (int 0) [T])], m [("t", T)], .map [("t", j 1)]),
    ([("T", nof (int 1) [T])], m [("t", T)], .map [("t", j 1)]),
    ([("T", must T)], m [("t", T)], .map [("t", j 1)]),
    ([("T", nof (min 1) [T, .string])], m [("t", T)], .map [("t", .str "x")]),
    ([], a (must (min 3)), da (j 2)),
    ([], a (must (min 3)), da (j 3)),
    ([], a (must (m [("x", int 1)])), da (.map [])),
    ([], a (.meet (must (mo [("x", true, .number)])) (m [])), .map []),
    ([], a (must (.meet (int 1) (int 2))), da (j 1)),
    ([], a (must .nil), da (j 1)),
    ([], a (must (.meet (min 3) (max 1))), da (j 2)),
    ([], a (nof (int 1) [must .string, .number]), da (.str "x"))]

/-- Every case's bodies and schema hold no path, no pattern and no
format, so `vet` is `Vet` on it, by `vet_iff`. -/
theorem trialCases_checkable : ∀ c ∈ trialCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem trial_verdict_exact : ∀ c ∈ trialCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 c.2.1 c.2.2 = v ↔ Vet m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vet_iff (trialCases_checkable c hc).1 (trialCases_checkable c hc).2 v

/-- The `trials` rows: each case's declarations and schema as one
document, the schema a map written without its braces, in the three
modes, with the one class `vet` gives. -/
def trialRows (tag : String) : IO Unit := do
  let mut i := 0
  for c in trialCases do
    let mut lines : List String := []
    for d in c.1 do
      let some bsrc := d.2.src | throw (IO.userError "a body of the fragment has no text")
      lines := lines ++ ["%" ++ d.1 ++ " = " ++ bsrc]
    let some ssrc := c.2.1.src | throw (IO.userError "a schema of the fragment has no text")
    let some dsrc := c.2.2.src | throw (IO.userError "a document of the fragment has no text")
    let src := "\\n".intercalate (lines ++ [(ssrc.drop 1).dropRight 1])
    for (m, opts) in [(({} : Mode), ""), (({ fill := false } : Mode), ",\"opts\":{\"noFill\":true}"),
        (({ lax := true } : Mode), ",\"opts\":{\"partial\":true}")] do
      IO.println (tag ++ toString i ++ "\tverdict\t" ++ src ++ "\t" ++ dsrc ++ "\t{\"verdict\":\""
        ++ verdictName (vet m c.1 c.2.1 c.2.2) ++ "\"" ++ opts ++ "}")
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
  | ["alias"] =>
    IO.println "# Generated by `lake exe oracle alias` (spec/Oracle.lean) from the definition"
    IO.println "# in spec/Aontu: documents with alias declarations, each case its declarations"
    IO.println "# and a schema under the key v against a document under the key v, run in the"
    IO.println "# default mode, without the fill (noFill) and under --partial (partial), as"
    IO.println "# `verdict` rows whose expectation is the one class `vet` gives, which `vet_iff`"
    IO.println "# makes the definition's own. A document reads as its expansion; a name declared"
    IO.println "# nowhere, or names that break the alias-cycle rule, are an error. A recursive"
    IO.println "# name is a residual that expands against the data, as far as it goes."
    IO.println "# Regenerate with `make spec`; never edit by hand. The cases the ports do"
    IO.println "# not yet answer this way are listed in spec/ledger.tsv."
    aliasRows "a"
    return 0
  | ["paths"] =>
    IO.println "# Generated by `lake exe oracle paths` (spec/Oracle.lean) from the definition"
    IO.println "# in spec/Aontu: documents with paths, each case its declarations and a map"
    IO.println "# as the schema against a map as the document, run in the default mode,"
    IO.println "# without the fill (noFill) and under --partial (partial), as `verdict` rows"
    IO.println "# whose expectation is the one class `vet` gives the document with its paths"
    IO.println "# read as names, which `vetP_iff` makes the definition's own. A path resolves"
    IO.println "# in the schema's own tree, through maps and lists and through nothing else,"
    IO.println "# and reads as the term at its position in the schema met with the data; a"
    IO.println "# path to nothing is an error, as is a document that reads only by its own"
    IO.println "# paths. Regenerate with `make spec`; never edit by hand. The cases the ports"
    IO.println "# do not yet answer this way are listed in spec/ledger.tsv."
    pathRows "p"
    return 0
  | ["trials"] =>
    IO.println "# Generated by `lake exe oracle trials` (spec/Oracle.lean) from the definition"
    IO.println "# in spec/Aontu: documents with trial schemas inside values, each case its"
    IO.println "# declarations and a map as the schema against a map as the document, run in"
    IO.println "# the default mode, without the fill (noFill) and under --partial (partial),"
    IO.println "# as `verdict` rows whose expectation is the one class `vet` gives, which"
    IO.println "# `vet_iff` makes the definition's own. nof(n, ...) counts the branches that"
    IO.println "# admit the value and judges as n judges the count; must(c, m) asks what"
    IO.println "# nof(1, c) asks; a branch that admits nothing counts as none, and a name"
    IO.println "# that refers to itself through a trial alone breaks the alias-cycle rule, an"
    IO.println "# error. Regenerate with `make spec`; never edit by hand. The cases the ports"
    IO.println "# do not yet answer this way are listed in spec/ledger.tsv."
    trialRows "t"
    return 0
  | _ =>
    IO.eprintln "usage: oracle [bounds | choice | gen | verdict | alias | paths | trials]"
    return 2
