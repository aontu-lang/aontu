import Aontu.Check
import Aontu.Output
import Aontu.Verdict
import Aontu.Paths
import Oracle.Print
import Aontu.Subsume

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
  [.any, .nil, .integer, .meet .number (.mulof (.integer (.of 1))), .string, .anyString,
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

The atoms of P1 beyond `min`, `max`, and `mulof`, each alone, each
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
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (vetCases_checkable c hc)) v

def verdictName : Verdict → String
  | .valid => "valid"
  | .invalid => "invalid"
  | .incomplete => "incomplete"
  | .error => "error"

/-- The cases of decision 9 of the design note's §7: a size met with a
container literal, the size's upper half refusing the literal's count or
admitting it, a literal short of its size, and members that arrive by
the data or by a second literal. No size is a disjunction, which both
ports refuse as an argument (#413). -/
def lenCases : List (Val × Data) :=
  let int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))
  let nb (n : ℤ) (h : IntegerLeaf n := by decide) : Bound := .num (.integer ⟨n, h⟩)
  let j (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .integer n h
  let mp (fs : List (String × Bool × Val)) : Val := .map fs none false
  let ls (xs : List Val) : Val := .list xs none false
  let xy : Val := mp [("x", false, int 1), ("y", false, int 2)]
  let dxy : Data := .map [("x", j 1), ("y", j 2)]
  let dxyz : Data := .map [("x", j 1), ("y", j 2), ("z", j 3)]
  [(.meet (.len (.max (nb 1))) xy, dxy),
    (.meet (.len (.max (nb 1))) (mp [("x", true, int 1), ("y", true, int 2)]), .map []),
    (.meet (.len (.max (nb 1))) (mp [("x", false, int 1), ("y", true, .integer)]), .map [("x", j 1)]),
    (.meet (.len (.max (nb 1))) (ls [int 1, int 2]), .list [j 1, j 2]),
    (.meet (.len (int 2)) (ls [int 1, int 2, int 3]), .list [j 1, j 2, j 3]),
    (.meet (.len (int 2)) (ls [int 1]), .list [j 1]),
    (.meet (.len (int 2)) (ls [int 1]), .list [j 1, j 2]),
    (.meet (.len (int 2)) (.list [int 1] none true), .list [j 1]),
    (.meet (.len (.max (nb 1))) (.map [("x", false, int 1), ("y", false, int 2)] none true), dxy),
    (.meet (.len (.max (nb 1))) (.map [("x", false, int 1), ("y", false, int 2)] (some .integer) false), dxy),
    (.meet (.len (.max (nb 2))) xy, dxy),
    (.meet (.len (.neq [nb 2])) xy, dxyz),
    (.meet (.len (.neq [nb 2])) (.meet xy (mp [("z", false, int 3)])), dxyz),
    (.meet (.len (.mulof (.integer ⟨3, by decide⟩))) (ls [int 1, int 2]), .list [j 1, j 2, j 3]),
    (.meet (.len (.above (nb 5))) (ls [int 1]), .list [j 1]),
    (.meet (.len (.max (nb 1))) (.list [] (some .integer) false), .list [j 1, j 2])]

theorem lenCases_checkable : ∀ c ∈ lenCases, (vetDoc c).1.CheckableA := by decide

theorem len_verdict_exact : ∀ c ∈ lenCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (lenCases_checkable c hc)) v

/-- The cases of decision 10 of the design note's §7: `hide()` and
`type()` on a member of a map, which the output leaves out while the
member still meets the data, the member absent and present, in conflict,
with a default, nested, beside a seal, as a spread, under a rider and in
a meet, and on the value at `v` itself. A disjunction of marked arms
carries no mark, and a refusal at generation reads a marked member. -/
def markCases : List (Val × Data) :=
  let int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))
  let j (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .integer n h
  let hide (v : Val) : Val := .ride .hide v []
  let type (v : Val) : Val := .ride .type v []
  let mp (fs : List (String × Bool × Val)) : Val := .map fs none false
  let a (v : Val) : Val := mp [("a", false, v)]
  let da (x : Data) : Data := .map [("a", x)]
  let pick (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .or [(1, int n h), (0, .integer)]
  let b : Val := mp [("b", false, .integer)]
  let sealed : Val := .map [("a", false, hide .integer)] none true
  [(a (hide .integer), da (j 1)), (a (hide .integer), .map []), (a (hide .integer), da (.str "x")),
    (a (type .integer), .map []), (a (type .integer), da (.str "x")),
    (a (hide (pick 1)), .map []), (a (hide (pick 1)), da (j 2)),
    (type (mp [("x", false, .integer)]), .map [("x", j 1), ("y", j 2)]), (hide (a .integer), .map []),
    (a (hide (int 1)), da (j 2)), (a (hide (int 1)), .map []),
    (mp [("a", false, hide .integer), ("b", false, .integer)], .map [("b", j 1)]),
    (mp [("a", false, hide .integer), ("b", false, .integer)], .map []),
    (mp [("a", false, hide (int 1)), ("b", false, pick 2)], .map []),
    (a (mp [("b", false, hide .integer)]), da (.map [])),
    (sealed, .map []), (sealed, da (j 1)), (sealed, .map [("b", j 1)]),
    (mp [("a", true, hide .integer)], .map []),
    (.map [] (some (hide .integer)) false, da (j 1)), (.map [] (some (hide .integer)) false, da (.str "x")),
    (.map [] (some (hide b)) false, da (.map [])),
    (a (.ride .metadata (hide .integer) []), .map []), (a (hide (.ride .metadata .integer [])), .map []),
    (a (.ride .deprecate (hide .integer) []), .map []),
    (a (.meet (hide b) (mp [("c", false, .integer)])), da (.map [])),
    (a (type b), da (.map [])), (a (type b), da (.map [("c", j 1)])),
    (a (.meet (hide .integer) (int 1)), .map []), (a (.meet .integer (hide (int 1))), da (j 1)),
    (.meet (a .integer) (a (hide (int 1))), .map []), (.meet (a (hide .integer)) (a .integer), .map []),
    (.meet (a .number) (a (hide .integer)), .map []), (.meet (a .integer) (a (hide .integer)), .map []),
    (.meet (a .integer) (a (hide .number)), .map []),
    (a (hide (.nof (int 1) [.integer, .number])), da (j 1)),
    (a (hide (.nof (int 1) [.integer, .string])), da (j 1)),
    (a (.or [(0, hide (int 1)), (0, hide (int 2))]), .map []),
    (a (.or [(1, hide (int 1)), (0, .integer)]), .map [])]

theorem markCases_checkable : ∀ c ∈ markCases, (vetDoc c).1.CheckableA := by decide

theorem mark_verdict_exact : ∀ c ∈ markCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (markCases_checkable c hc)) v

/-- The `verdict` rows: each case in the default mode, without the fill
and under `--partial`, with the one class `vet` gives. -/
def verdictRows (tag : String) (cases : List (Val × Data) := vetCases) : IO Unit := do
  let mut i := 0
  for c in cases do
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
  fun c hc _ v => vet_iff (aliasCases_checkable c hc).1
    (readR_checkableA (aliasCases_checkable c hc).1 (aliasCases_checkable c hc).2) v

/-- The cases of decision 14 of the design note's §7: a `meta()` and a
`deprecate()` that judge as their values do, alone, under a key, in a
meet and on a declaration; an `ident()` on an alias's value, which a
reference reads without it; and an `ident()` anywhere else, an error,
inside another, inside a `meta()`, in a recursive body, or in a body no
reference reads. A rider on a kind keeps the kind's parent. -/
def riderCases : List (Decls × Val × Data) :=
  let int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))
  let j (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .integer n h
  let note (k s : String) : Record := [(k, .str s)]
  let key (k : String) (o : Bool) (v : Val) : Val := .map [(k, o, v)] none false
  let pick : Val := .or [(1, int 1), (0, .integer)]
  let named : Decls := [("T", .ride .ident .integer (note "id" "https://example.com/t"))]
  let parent : Val := .pref 1 (.meet (.ride .metadata .integer []) (.min (.num (.integer (.of 3)))))
  [([], .ride .metadata .integer (note "title" "n"), j 1),
    ([], .ride .metadata .integer (note "title" "n"), .str "a"),
    ([], .ride .deprecate pick [], j 2),
    ([], key "x" false (.ride .deprecate pick (note "msg" "old")), .map []),
    ([], key "x" false (.ride .metadata (int 1) []), .map [("x", j 1)]),
    ([], .meet (.ride .metadata .integer []) (int 2), j 2),
    (named, .alias "T", j 1), (named, .alias "T", .str "a"),
    ([("T", .ride .metadata .integer (note "title" "t"))], .alias "T", j 1),
    ([], .ride .ident .integer (note "id" "https://example.com/t"), j 1),
    ([("T", .ride .ident (.ride .ident .integer (note "id" "inner")) (note "id" "outer"))], .alias "T", j 1),
    ([("T", .meet (.ride .ident .integer (note "id" "a")) (.ride .ident (.min (.num (.integer (.of 1)))) (note "id" "b")))],
      .alias "T", j 1),
    ([("T", .ride .metadata (.ride .ident .integer (note "id" "a")) [])], .alias "T", j 1),
    ([("T", .map [("next", true, .alias "T"), ("x", false, .ride .ident .integer [])] none false)], .alias "T",
      .map [("x", j 1)]),
    ([("T", key "x" false (.ride .ident .integer []))], int 1, j 1),
    ([], parent, .num (.float (.dyadic 3 (-1)))), ([], parent, j 2)]

/-- The cases of decision 10 of the design note's §7 under the names: a
reference copies a body with its marks cleared at every depth, so what
the body hides its reader asks for, and a mark written at the place of
the reference stays, through a name, a nested name, a recursive name,
a meet, a rider, a spread and a selection. -/
def markAliasCases : List (Decls × Val × Data) :=
  let int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))
  let j (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .integer n h
  let hide (v : Val) : Val := .ride .hide v []
  let type (v : Val) : Val := .ride .type v []
  let mp (fs : List (String × Val)) : Val := .map (fs.map fun f => (f.1, false, f.2)) none false
  let T : Val := .alias "T"
  [([("T", hide (mp [("x", .integer)]))], T, .map [("x", j 1), ("y", j 2)]),
    ([("T", hide (mp [("x", .integer)]))], T, .map []),
    ([("T", mp [("a", hide .integer), ("b", .integer)])], T, .map [("b", j 2)]),
    ([("T", mp [("a", hide .integer), ("b", .integer)])], T, .map [("a", .str "x"), ("b", j 2)]),
    ([("T", mp [("a", type (mp [("x", .integer)]))])], T, .map [("a", .map [("x", j 1), ("y", j 2)])]),
    ([("T", mp [("a", hide (int 1)), ("b", int 2)])], T, .map [("b", j 2)]),
    ([("T", hide .integer)], mp [("a", T)], .map []),
    ([("T", .integer)], mp [("a", hide T)], .map []),
    ([("T", mp [("a", hide .integer)]), ("U", mp [("t", T)])], .alias "U", .map [("t", .map [])]),
    ([("T", .map [("next", true, T), ("a", false, hide .integer)] none false)], T,
      .map [("next", .map [("a", j 1)])]),
    ([("T", .map [("next", true, T), ("a", false, hide .integer)] none false)], T,
      .map [("a", j 1), ("next", .map [])]),
    ([("T", mp [("a", hide .integer)])], .meet T (mp [("b", int 1)]), .map [("b", j 1)]),
    ([("T", mp [("a", hide .integer)])], hide T, .map []),
    ([("T", mp [("a", mp [("b", hide (int 1))])])], T, .map [("a", .map [])]),
    ([("T", .ride .metadata (mp [("a", hide .integer)]) [])], T, .map []),
    ([("T", .map [] (some (hide .integer)) false)], T, .map [("k", j 1)]),
    ([("T", hide (mp [("a", .integer)]))], mp [("x", T), ("y", hide T)], .map [("x", .map [("a", j 1)])]),
    ([("T", .select (int 1) [(int 1, mp [("a", hide (int 1))])] none)], T, .map []),
    ([("T", .select (int 1) [(int 1, mp [("a", hide .integer)])] none)], T, .map [])]

/-- The cases of the seal of decision 10 of the design note's §7: a
reference to a `type()` value reads it as a definition and its copy as
an instance that admits nothing the definition does not declare, at any
depth, once its declarations are met: through members, optional ones,
lists and a nested name, with a spread, beside a rider and another
mark, met with a name, declared twice and met at the reference. The
seal stops at a kind, `any`, a disjunction and a list's spread, and a
recursive name, which both ports read unsealed, takes none. -/
def sealCases : List (Decls × Val × Data) :=
  let j (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .integer n h
  let hide (v : Val) : Val := .ride .hide v []
  let type (v : Val) : Val := .ride .type v []
  let mp (fs : List (String × Val)) : Val := .map (fs.map fun f => (f.1, false, f.2)) none false
  let mo (fs : List (String × Bool × Val)) : Val := .map fs none false
  let T : Val := .alias "T"
  let x : Val := mp [("x", .integer)]
  let y : Val := mp [("y", .integer)]
  let dxy : Data := .map [("x", j 1), ("y", j 2)]
  let dxyz : Data := .map [("x", j 1), ("y", j 2), ("z", j 3)]
  let rec_ : Val := type (mo [("next", true, T), ("v", false, .integer)])
  let ab : Val := type (mp [("a", mp [("b", .integer)])])
  [([("T", type x)], T, dxy), ([("T", type x)], T, .map [("x", j 1)]), ([("T", type x)], T, .map []),
    ([("T", type (mp [("x", y)]))], T, .map [("x", .map [("y", j 1), ("z", j 2)])]),
    ([("T", type (.list [.integer] none false))], T, .list [j 1, j 2]),
    ([("T", type (.map [] (some .integer) false))], T, .map [("a", j 1)]),
    ([("T", .meet (type x) y)], T, dxyz), ([("T", .meet (type x) y)], T, dxy),
    ([("T", type .integer)], T, j 1), ([("T", type x)], mp [("w", T)], .map [("w", dxy)]),
    ([("T", type (mp [("x", .list [y] none false)]))], T,
      .map [("x", .list [.map [("y", j 1), ("z", j 2)]])]),
    ([("T", type (mo [("x", true, .integer)]))], T, .map []),
    ([("T", type (mo [("x", true, .integer)]))], T, .map [("y", j 1)]),
    ([("T", hide (type x))], T, dxy), ([("T", type (hide x))], T, dxy),
    ([("T", .ride .metadata (type x) [])], T, dxy), ([("T", type (.ride .metadata x []))], T, dxy),
    ([("T", type x), ("U", T)], .alias "U", dxy), ([("T", type x)], .meet T y, dxy),
    ([("U", y), ("T", type (.meet (.alias "U") x))], T, dxy),
    ([("U", y), ("T", type (.meet (.alias "U") x))], T, dxyz),
    ([("T", type x), ("T", y)], T, dxy), ([("T", type x), ("T", y)], T, dxyz),
    ([("T", type (mp [("a", .mapKind)]))], T, .map [("a", .map [("x", j 1)])]),
    ([("T", type (mp [("a", .any)]))], T, .map [("a", .map [("x", j 1)])]),
    ([("T", type (mp [("a", .or [(0, .integer), (0, mp [("b", .integer)])])]))], T,
      .map [("a", .map [("b", j 1), ("c", j 2)])]),
    ([("T", type (mo [("a", true, mp [("b", .integer)])]))], T, .map [("a", .map [("b", j 1), ("c", j 2)])]),
    ([("T", rec_)], T, .map [("v", j 1), ("x", j 3)]),
    ([("T", rec_)], T, .map [("v", j 1), ("next", .map [("v", j 2), ("x", j 3)])]),
    ([("T", type (mp [("a", .list [.integer] (some .integer) false)]))], T, .map [("a", .list [j 1, j 2])]),
    ([("T", type (.list [] (some .integer) false))], T, .list [j 1, j 2]),
    ([("T", type (mp [("a", .map [] (some .integer) false)]))], T, .map [("a", .map [("k", j 1)])]),
    ([("T", ab), ("U", mp [("t", T)])], .alias "U", .map [("t", .map [("a", .map [("b", j 1), ("c", j 2)])])]),
    ([("T", ab), ("U", type (mp [("t", T)]))], .alias "U",
      .map [("t", .map [("a", .map [("b", j 1)])]), ("z", j 1)])]

theorem sealCases_checkable : ∀ c ∈ sealCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (aliasDoc c).1.CheckableA := by decide

theorem seal_verdict_exact : ∀ c ∈ sealCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 (aliasDoc c).1 (aliasDoc c).2 = v ↔ Vet m c.1 (aliasDoc c).1 (aliasDoc c).2 v :=
  fun c hc _ v => vet_iff (sealCases_checkable c hc).1
    (readR_checkableA (sealCases_checkable c hc).1 (sealCases_checkable c hc).2) v

theorem markAliasCases_checkable : ∀ c ∈ markAliasCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (aliasDoc c).1.CheckableA := by decide

theorem mark_alias_verdict_exact : ∀ c ∈ markAliasCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 (aliasDoc c).1 (aliasDoc c).2 = v ↔ Vet m c.1 (aliasDoc c).1 (aliasDoc c).2 v :=
  fun c hc _ v => vet_iff (markAliasCases_checkable c hc).1
    (readR_checkableA (markAliasCases_checkable c hc).1 (markAliasCases_checkable c hc).2) v

theorem riderCases_checkable : ∀ c ∈ riderCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (aliasDoc c).1.CheckableA := by decide

theorem rider_verdict_exact : ∀ c ∈ riderCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 (aliasDoc c).1 (aliasDoc c).2 = v ↔ Vet m c.1 (aliasDoc c).1 (aliasDoc c).2 v :=
  fun c hc _ v => vet_iff (riderCases_checkable c hc).1
    (readR_checkableA (riderCases_checkable c hc).1 (riderCases_checkable c hc).2) v

/-- The `alias` rows: each case's declarations and schema as one
document, in the three modes, with the one class `vet` gives. -/
def aliasRows (tag : String) (cases : List (Decls × Val × Data) := aliasCases) : IO Unit := do
  let mut i := 0
  for c in cases do
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

/-- Paths through the riders, which a path reads through as through
nothing (decision 14 of the design note's §7): into a `meta()` from
outside it, to a member under a `deprecate()`, by index into a rider's
list, and from inside a rider's value to a member beside it. -/
def riderPathCases : List (Decls × Val × Data) :=
  let int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))
  let m (fs : List (String × Val)) : Val := .map (fs.map fun f => (f.1, false, f.2)) none false
  let j (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .integer n h
  let p (ks : List String) : Val := .path (ks.map .key)
  let annotated (v : Val) : Val := .ride .metadata v []
  [([], m [("a", annotated (m [("x", int 1)])), ("b", p ["a", "x"])], .map [("a", .map [("x", j 1)]), ("b", j 1)]),
    ([], m [("a", annotated (m [("x", int 1)])), ("b", p ["a", "x"])], .map [("a", .map [("x", j 1)]), ("b", j 2)]),
    ([], m [("a", annotated (m [("x", int 1)])), ("b", p ["a", "x"])], .map [("b", j 1)]),
    ([], m [("a", annotated (m [("x", .integer)])), ("b", p ["a", "x"])], .map [("a", .map [("x", j 7)]), ("b", j 7)]),
    ([], m [("a", annotated (m [("x", int 1)])), ("b", p ["a", "y"])], .map [("b", j 1)]),
    ([], m [("a", m [("x", .ride .deprecate (int 1) [])]), ("b", p ["a", "x"])],
      .map [("a", .map [("x", j 1)]), ("b", j 1)]),
    ([], m [("a", annotated (.list [int 1, int 2] none false)), ("b", .path [.key "a", .idx 1])],
      .map [("a", .list [j 1, j 2]), ("b", j 2)]),
    ([], m [("a", annotated (m [("x", p ["a", "y"]), ("y", int 1)]))], .map [("a", .map [("x", j 1), ("y", j 1)])])]

theorem riderPathCases_checkable : ∀ c ∈ riderPathCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem rider_path_verdict_exact : ∀ c ∈ riderPathCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (riderPathCases_checkable c hc).1 (riderPathCases_checkable c hc).2 v

/-- The `paths` rows: each case's declarations and schema as one
document, the schema's braces dropped since neither CLI reads a braced
map after a declaration, in the three modes, with the one class `vetP`
gives. -/
def pathRows (tag : String) (cases : List (Decls × Val × Data) := pathCases) : IO Unit := do
  let mut i := 0
  for c in cases do
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
nested; through a recursive name; `must`, with a conflicting branch
among them; and `when`, with and without an `else`, over scalars, maps
and lists, with `nil` and a conflict in each position, nested, in a
spread and a list, beside a literal, a default, a disjunction and
`nof`, and through a name, guarded and not; a trial beside a
disjunction whose preferred arm it refuses; `contains`, with each kind
of count, over lists and maps, scalars among them, with `nil` and a
conflict as the term, nested, beside a spread, `len`, a literal and a
disjunction, in a spread, and through a name; and `rest`, with no cover
and with covers of each field, over maps, lists and scalars, beside a
map, a literal, a default and a disjunction, in a spread, and through a
name. -/
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
  let whn (c t : Val) (e : Option Val := none) : Val := .when c t e
  let cnt (c : Val) (n : Val := .min (.num (.integer (.of 1)))) : Val := .contains c n
  let rst (t : Val) (cs : List Cover := []) : Val := .rest t cs
  let ks (k : Val) : Cover := (none, some k, none)
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
    ([], a (nof (int 1) [must .string, .number]), da (.str "x")),
    ([], a (whn .string (str "a")), da (.str "a")),
    ([], a (whn .string (str "a")), da (.str "b")),
    ([], a (whn .string (str "a")), da (j 5)),
    ([], a (whn .string (str "a") (some (min 0))), da (j 5)),
    ([], a (whn .string (str "a") (some (min 0))), da (j (-1))),
    ([], a (whn .nil .string (some .number)), da (j 5)),
    ([], a (whn .any .number), da (.str "s")),
    ([], a (whn .string .nil), da (.str "s")),
    ([], a (whn .string .nil), da (j 1)),
    ([], a (whn (m [("k", .any)]) (m [("n", .any)])), da (.map [("k", j 1), ("n", j 2)])),
    ([], a (whn (m [("k", .any)]) (m [("n", .any)])), da (.map [("k", j 1)])),
    ([], a (whn (m [("k", .any)]) (m [("n", .any)])), da (.map [])),
    ([], a (whn (m [("k", .any)]) (m [("n", .number)])), da (.map [("k", j 1), ("n", .str "s")])),
    ([], a (whn (mo [("x", true, .number)]) (mo [("x", true, max 5)])), da (.map [("x", j 3)])),
    ([], a (whn (mo [("x", true, .number)]) (mo [("x", true, max 5)])), da (.map [("x", j 7)])),
    ([], a (whn (.list [] (some .number) false) (.len (max 2))), da (.list [j 1, j 2])),
    ([], a (whn (.list [] (some .number) false) (.len (max 2))), da (.list [j 1, j 2, j 3])),
    ([], a (.map [] (some (whn .string (str "x"))) false), da (.map [("p", .str "x"), ("q", j 2)])),
    ([], a (.map [] (some (whn .string (str "x"))) false), da (.map [("p", .str "y")])),
    ([], a (whn (m [("b", .string)]) (m [("b", whn .string (str "s"))])), da (.map [("b", .str "s")])),
    ([], a (whn (m [("b", .string)]) (m [("b", whn .string (str "s"))])), da (.map [("b", .str "t")])),
    ([], a (.meet (nof (int 1) [.string, .number]) (whn .string (str "a"))), da (.str "a")),
    ([], a (.meet (nof (int 1) [.string, .number]) (whn .string (str "a"))), da (.str "b")),
    ([], a (.meet (whn .string (str "a")) (str "a")), .map []),
    ([], a (.meet (whn .string (str "a")) (str "b")), .map []),
    ([], a (.meet (whn .string (str "a")) (.pref 1 (str "b"))), .map []),
    ([], a (.meet (whn .string (str "a")) (.pref 1 (str "a"))), .map []),
    ([], a (.or [(0, whn .string (str "a")), (0, .number)]), da (.str "b")),
    ([], a (.or [(0, whn .string (str "a")), (0, .number)]), da (.str "a")),
    ([("T", mo [("a", true, whn T (int 1))])], m [("t", T)], .map [("t", .map [("a", j 1)])]),
    ([("T", mo [("a", true, whn T (int 1))])], m [("t", T)], .map [("t", .map [("a", .map [])])]),
    ([("T", whn T (int 1))], m [("t", T)], .map [("t", j 1)]),
    ([("T", whn .string T)], m [("t", T)], .map [("t", j 1)]),
    ([("T", whn .string (int 1) (some T))], m [("t", T)], .map [("t", j 1)]),
    ([], a (whn .string (str "a") (some .nil)), da (j 5)),
    ([], a (whn (.meet (int 1) (int 2)) .string (some .number)), da (j 5)),
    ([], a (whn .string (.meet (int 1) (int 2))), da (.str "s")),
    ([], a (whn (nof (int 0) [.string]) (int 1)), da (j 1)),
    ([], a (whn (nof (int 0) [.string]) (int 1)), da (j 2)),
    ([], a (whn (nof (int 0) [.string]) (int 1)), da (.str "s")),
    ([], a (whn .string (must (str "a"))), da (.str "b")),
    ([], a (.meet (whn .string (str "a")) (whn .number (int 1))), da (j 2)),
    ([], a (.list [whn .string (str "a")] none false), da (.list [.str "b"])),
    ([], a (whn .string (str "a")), .map []),
    ([], a (.meet (whn (m [("k", .any)]) (m [("n", .any)])) (m [("k", int 1)])), .map []),
    ([], a (.meet (whn (m [("k", .any)]) (m [("n", .any)])) (m [("k", int 1), ("n", int 2)])), .map []),
    ([], a (whn (m [("k", .any)]) (m [("n", .pref 1 (int 2))])), da (.map [("k", j 1)])),
    ([], a (whn (whn .string (str "a")) (int 1)), da (.str "a")),
    ([], a (whn (whn .string (str "a")) (int 1)), da (.str "b")),
    ([], a (whn (min 3) (max 5)), da (j 6)),
    ([], a (whn (min 3) (max 5)), da (j 1)),
    ([], a (.meet (nof (int 1) [int 1, int 2]) (.or [(1, int 3), (0, int 2)])), .map []),
    ([], a (.meet (whn .string (str "a")) (.or [(1, str "b"), (0, str "a")])), .map []),
    ([], a (cnt .number), da (.list [j 1, .str "x"])),
    ([], a (cnt .number), da (.list [.str "x"])),
    ([], a (cnt .number), da (.list [])),
    ([], a (cnt .number), da (j 5)),
    ([], a (cnt .number), da (.str "abc")),
    ([], a (cnt .number), da (.map [("x", j 1), ("y", .str "s")])),
    ([], a (cnt .number), da (.map [("x", .str "s")])),
    ([], a (cnt .number (int 2)), da (.list [j 1, j 2, .str "x"])),
    ([], a (cnt .number (int 2)), da (.list [j 1, .str "x"])),
    ([], a (cnt .number (.meet (min 2) (max 3))), da (.list [j 1, j 2, j 3, .str "x"])),
    ([], a (cnt .number (.meet (min 2) (max 3))), da (.list [j 1, j 2, j 3, j 4])),
    ([], a (cnt .number (int 0)), da (.list [.str "x"])),
    ([], a (cnt .number (int 0)), da (.list [j 1])),
    ([], a (cnt .number (max 1)), da (.list [.str "x"])),
    ([], a (cnt .number (max 1)), da (.list [j 1, j 2])),
    ([], a (cnt .nil), da (.list [j 1])),
    ([], a (cnt .nil (int 0)), da (.list [j 1])),
    ([], a (cnt (.meet (int 1) (int 2))), da (.list [j 1])),
    ([], a (cnt (.meet (int 1) (int 2)) (int 0)), da (.list [j 1])),
    ([], a (cnt (.list [int 1] none false)), da (.list [.list [j 1], j 2])),
    ([], a (cnt (m [("k", .number)])), da (.list [.map [("k", j 1)], .map [("j", j 2)]])),
    ([], a (cnt (mo [("k", true, .number)])), da (.list [.map [("j", j 2)]])),
    ([], a (cnt (m [("k", .or [(1, int 1), (0, .number)])])), da (.list [.map []])),
    ([], a (cnt (.meet (.list [] (some .number) false) (cnt (min 5)))), da (.list [.list [j 1], .list [j 6]])),
    ([], a (cnt (.meet (.list [] (some .number) false) (cnt (min 5)))), da (.list [.list [j 1], .list [j 2]])),
    ([], a (.meet (cnt .number) (cnt .string)), da (.list [j 1, .str "x"])),
    ([], a (.meet (cnt .number) (cnt .string)), da (.list [j 1])),
    ([], a (.meet (.list [] (some .number) false) (cnt (min 5))), da (.list [j 1, j 7])),
    ([], a (.meet (.list [] (some .number) false) (cnt (min 5))), da (.list [j 1, j 2])),
    ([], a (.meet (.len (max 3)) (cnt .string)), da (.list [j 1, .str "s"])),
    ([], a (.map [] (some (cnt .number)) false), da (.map [("p", .list [j 1]), ("q", .list [.str "x", j 2])])),
    ([], a (.map [] (some (cnt .number)) false), da (.map [("p", .list [j 1]), ("q", .list [.str "x"])])),
    ([], a (.meet (cnt .number) (.list [int 1, str "x"] none false)), .map []),
    ([], a (.meet (cnt .number) (.list [str "x"] none false)), .map []),
    ([], a (.meet (cnt .number) (int 5)), .map []),
    ([], a (.or [(0, cnt .number), (0, .string)]), da (.str "s")),
    ([], a (.or [(0, cnt .number), (0, .string)]), da (.list [.str "x"])),
    ([], a (cnt .number), .map []),
    ([], a (cnt .number (int (-1))), da (.list [j 1])),
    ([], a (cnt .number (.lit (.num (.float (.dyadic 3 (-1)))))), da (.list [j 1])),
    ([], a (cnt .number (str "x")), da (.list [j 1])),
    ([], a (cnt .number .string), da (.list [j 1])),
    ([], a (cnt (nof (int 0) [.number])), da (.list [j 1, .str "x"])),
    ([], a (cnt (whn .number (max 1))), da (.list [j 2, .str "x"])),
    ([], a (cnt (whn .number (max 1))), da (.list [j 2])),
    ([("T", cnt T)], m [("t", T)], .map [("t", .list [.list []])]),
    ([("T", cnt T)], m [("t", T)], .map [("t", .list [.list [.list []]])]),
    ([("T", cnt T (int 0))], m [("t", T)], .map [("t", .list [])]),
    ([("T", cnt T (int 0))], m [("t", T)], .map [("t", .list [j 1])]),
    ([("T", cnt .any T)], m [("t", T)], .map [("t", .list [j 1])]),
    ([], a (cnt .number (max 0)), da (.list [.str "x"])),
    ([], a (.meet (cnt .string) (m [("x", str "a"), ("y", int 1)])), .map []),
    ([], a (.meet (cnt .number) (m [("x", str "a")])), .map []),
    ([], a (rst .nil), da (.map [])),
    ([], a (rst .nil), da (.map [("b", j 2)])),
    ([], a (rst .nil), da (j 5)),
    ([], a (rst .nil), da (.list [])),
    ([], a (rst .nil), da (.list [j 1])),
    ([], a (rst .number), da (.map [("b", j 2)])),
    ([], a (rst .number), da (.map [("b", .str "x")])),
    ([], a (rst .nil [ks (str "a")]), da (.map [("a", j 1)])),
    ([], a (rst .nil [ks (str "a")]), da (.map [("a", j 1), ("b", j 2)])),
    ([], a (rst .number [ks (str "a")]), da (.map [("a", .str "x"), ("b", j 2)])),
    ([], a (rst .string [ks (str "a")]), da (.map [("a", .str "x"), ("b", j 2)])),
    ([], a (rst .nil [(none, none, some .number)]), da (.map [("p", j 1), ("q", j 2)])),
    ([], a (rst .nil [(none, none, some .number)]), da (.map [("p", j 1), ("q", .str "x")])),
    ([], a (rst .nil [(some (.meet (int 1) (int 2)), some .any, none)]), da (.map [("b", j 1)])),
    ([], a (.meet (rst .nil [ks (str "a")]) (rst .nil [ks (str "b")])), da (.map [("a", j 1)])),
    ([], a (rst .nil [(some (m [("a", int 1)]), some .any, none)]), da (.map [("a", j 1), ("z", .bool true)])),
    ([], a (rst .nil [(some (m [("a", int 1)]), some .any, none)]), da (.map [("a", j 2)])),
    ([], a (rst .number [(some (m [("a", int 1)]), some .any, none)]), da (.map [("a", j 2)])),
    ([], a (rst .nil [ks (str "a"), (some (m [("b", int 1)]), some (str "b"), none)]),
      da (.map [("a", j 1), ("b", j 1)])),
    ([], a (rst .nil [ks (str "a"), (some (m [("b", int 1)]), some (str "b"), none)]),
      da (.map [("a", j 1), ("b", j 2)])),
    ([], a (rst .nil [ks (.or [(0, str "0"), (0, str "1")])]), da (.list [.str "p", .str "q"])),
    ([], a (rst .nil [ks (str "0")]), da (.list [.str "p", .str "q"])),
    ([], a (rst .nil [(none, none, some .number)]), da (.list [j 1, j 2])),
    ([], a (rst .nil [(none, none, some .number)]), da (.list [j 1, .str "x"])),
    ([], a (rst .string [ks (str "0")]), da (.list [j 1, .str "x"])),
    ([], a (.meet (rst .nil [ks (str "a")]) (mo [("a", false, int 1), ("b", true, .number)])), da (.map [("a", j 1)])),
    ([], a (.meet (rst .nil [ks (str "a")]) (mo [("a", false, int 1), ("b", true, .number)])),
      da (.map [("a", j 1), ("b", j 2)])),
    ([], a (.map [] (some (rst .nil [ks (str "n")])) false), da (.map [("x", .map [("n", j 1)]), ("y", .map [("n", j 2)])])),
    ([], a (.map [] (some (rst .nil [ks (str "n")])) false), da (.map [("x", .map [("n", j 1)]), ("y", .map [("m", j 2)])])),
    ([], a (.meet (rst .nil [ks (str "a")]) (m [("a", int 1)])), .map []),
    ([], a (.meet (rst .nil [ks (str "a")]) (m [("a", int 1), ("b", int 2)])), .map []),
    ([], a (.meet (rst .nil) (m [("b", int 2)])), .map []),
    ([], a (.meet (rst .nil) (int 5)), .map []),
    ([], a (.meet (rst .nil) (m [("b", .pref 1 (int 2))])), .map []),
    ([], a (.meet (rst .nil [ks (str "b")]) (m [("b", .pref 1 (int 2))])), .map []),
    ([], a (.or [(0, rst .nil [ks (str "a")]), (0, .number)]), da (.map [("b", j 1)])),
    ([], a (.or [(0, rst .nil [ks (str "a")]), (0, .number)]), da (j 1)),
    ([], a (rst .nil), .map []),
    ([], a (rst .nil [(some (m [("k", str "x")]), some .any, none)]), da (.map [("k", .str "x"), ("z", j 1)])),
    ([], a (rst .nil [(some (m [("k", str "x")]), some .any, none)]), da (.map [("k", .str "y"), ("z", j 1)])),
    ([], a (rst .nil [(none, some (str "a"), some .number)]), da (.map [("a", .str "x"), ("b", j 1)])),
    ([], a (rst .nil [(none, some (str "a"), some .number)]), da (.map [("a", .str "x"), ("b", .str "y")])),
    ([], a (rst .nil [(some (m [("a", .any)]), some (str "a"), some .number)]), da (.map [("a", .str "x"), ("b", j 1)])),
    ([], a (rst .nil [(some (m [("a", .any)]), some (str "a"), some .number)]), da (.map [("b", j 1)])),
    ([], a (rst .nil [(some .any, none, none)]), da (.map [("b", j 1)])),
    ([], a (rst .nil [ks .nil]), da (.map [("b", j 1)])),
    ([], a (rst .nil [(none, none, some .nil)]), da (.map [("b", j 1)])),
    ([], a (rst (nof (int 0) [.string]) [ks (str "a")]), da (.map [("a", .str "x"), ("b", j 1)])),
    ([], a (rst (nof (int 0) [.string]) [ks (str "a")]), da (.map [("a", .str "x"), ("b", .str "y")])),
    ([], a (.meet (rst .nil [ks (str "a")]) (rst .number)), da (.map [("a", .str "x")])),
    ([], a (.meet (rst .nil [ks (str "a")]) (rst .number)), da (.map [("a", j 1)])),
    ([("T", mo [("a", true, rst .nil [ks (str "b")])])], m [("t", T)], .map [("t", .map [("a", .map [("b", j 1)])])]),
    ([("T", rst .nil [(none, none, some T)])], m [("t", T)], .map [("t", .map [("b", j 5)])]),
    ([("T", rst T)], m [("t", T)], .map [("t", .map [("b", j 5)])]),
    ([("T", rst T)], m [("t", T)], .map [("t", .map [("b", .map [])])]),
    ([("T", rst .nil [ks T])], m [("t", T)], .map [("t", .map [("b", j 5)])]),
    ([], a (.meet (rst .nil [ks (str "a")]) (m [("a", m [("b", int 1)])])), da (.map [("a", .map [("b", j 1)])])),
    ([], a (rst .nil [(none, none, some (m [("x", int 1)]))]), da (.map [("p", .map [("x", j 1)]), ("q", .map [("x", j 2)])])),
    ([], a (rst .nil [(none, none, some (mo [("x", true, .or [(1, int 1), (0, .number)])]))]), da (.map [("p", .map [])]))]

set_option maxRecDepth 8192 in
/-- Every case's bodies and schema hold no path, no pattern and no
format, so `vet` is `Vet` on it, by `vet_iff`. -/
theorem trialCases_checkable : ∀ c ∈ trialCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem trial_verdict_exact : ∀ c ∈ trialCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 c.2.1 c.2.2 = v ↔ Vet m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vet_iff (trialCases_checkable c hc).1
    (readR_checkableA (trialCases_checkable c hc).1 (trialCases_checkable c hc).2) v

/-- Documents with `match` and `filter` inside values, each scrutinee
and source a literal: the first arm, a later arm, the default, no arm
and no default, a result that generates nothing, a result that is a map,
a selection beside a literal, a kind and a disjunction, inside a map and
a list, and nested; and `filter` over a list and a map,
with a kind, a bound and a conflict as the condition, over an empty
container and over a scalar, and beside a literal. -/
def selectCases : List (Decls × Val × Data) :=
  let int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))
  let str (s : String) : Val := .lit (.str s)
  let m (fs : List (String × Val)) : Val := .map (fs.map fun f => (f.1, false, f.2)) none false
  let min (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .min (.num (.integer ⟨n, h⟩))
  let j (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .integer n h
  let sel (s : Val) (arms : List (Val × Val)) (d : Option Val := none) : Val := .select s arms d
  let flt (s c : Val) : Val := .filter s c
  let z (v : Val) : Val := m [("z", v)]
  let dz (x : Data) : Data := .map [("z", x)]
  let dd (x : Data) : Data := .map [("d", x)]
  let lst (vs : List Val) : Val := .list vs none false
  [([], z (sel (int 1) [(.integer, str "small"), (.string, str "big")]), dz (.str "small")),
    ([], z (sel (int 1) [(.integer, str "small"), (.string, str "big")]), dz (.str "big")),
    ([], z (sel (str "x") [(.integer, str "small"), (.string, str "big")]), dz (.str "big")),
    ([], z (sel (int 1) [(.string, str "a")]), dz (.str "a")),
    ([], z (sel (int 1) [(.string, str "a")]), .map []),
    ([], z (sel (int 1) [(min 0, str "ok"), (.integer, str "no")]), dz (.str "ok")),
    ([], z (sel (m [("a", int 1)]) [(m [("a", .integer)], str "yes")] (some (str "other"))), dz (.str "yes")),
    ([], z (sel (m [("a", int 1)]) [(m [("b", .integer)], str "yes")] (some (str "other"))), dz (.str "other")),
    ([], z (sel (int 1) [(.integer, .integer)]), dz (j 5)),
    ([], z (sel (int 1) [(.integer, .integer)]), dz (.str "s")),
    ([], z (sel (int 1) [(.integer, .integer)]), .map []),
    ([], z (sel (int 1) [(.integer, m [("k", int 1)])]), dz (.map [("k", j 1)])),
    ([], z (sel (int 1) [(.integer, m [("k", int 1)])]), dz (.map [])),
    ([], z (sel (int 1) [(.integer, m [("k", int 1)])]), .map []),
    ([], z (.meet (sel (int 1) [(.integer, int 5)]) (int 5)), .map []),
    ([], z (.meet (sel (int 1) [(.integer, int 5)]) (int 6)), .map []),
    ([], z (.meet (sel (int 1) [(.integer, int 5)]) .integer), .map []),
    ([], z (.or [(0, sel (int 1) [(.integer, int 5)]), (0, .string)]), dz (.str "s")),
    ([], z (.or [(0, sel (int 1) [(.integer, int 5)]), (0, .string)]), dz (j 5)),
    ([], z (m [("k", sel (int 1) [(.integer, int 5)])]), dz (.map [("k", j 5)])),
    ([], z (m [("k", sel (int 1) [(.integer, int 5)])]), dz (.map [])),
    ([], z (lst [sel (int 1) [(.integer, int 5)]]), dz (.list [j 5])),
    ([], z (sel (sel (int 1) [(.integer, str "a")]) [(str "a", int 1)] (some (int 2))), dz (j 1)),
    ([], m [("d", flt (lst [int 1, int 2, int 3, str "x"]) .integer)], dd (.list [j 1, j 2, j 3])),
    ([], m [("d", flt (lst [int 1, int 2, int 3, str "x"]) .integer)], dd (.list [j 1, j 2])),
    ([], m [("d", flt (lst [int 1, int 2, int 3, str "x"]) .integer)], .map []),
    ([], m [("d", flt (m [("a", int 1), ("b", str "x"), ("c", int 2)]) .integer)], dd (.map [("a", j 1), ("c", j 2)])),
    ([], m [("d", flt (m [("a", int 1), ("b", str "x"), ("c", int 2)]) .integer)], .map []),
    ([], m [("d", flt (lst [int 1, int 2, int 3]) (min 2))], dd (.list [j 2, j 3])),
    ([], m [("d", flt (lst []) .integer)], dd (.list [])),
    ([], m [("d", flt (lst [int 1, int 2]) .string)], dd (.list [])),
    ([], m [("d", flt (lst [int 1, int 2]) (.meet (int 1) (int 2)))], dd (.list [])),
    ([], m [("d", flt (int 1) .integer)], dd (j 1)),
    ([], m [("d", flt (int 1) .integer)], .map []),
    ([], m [("d", .meet (flt (lst [int 1, int 2]) .integer) (lst [int 1, int 2]))], .map []),
    ([], m [("d", .meet (flt (lst [int 1, int 2]) .integer) (lst [int 1]))], .map [])]

set_option maxRecDepth 8192 in
/-- Every case's bodies hold no path, no pattern and no format, and its
schema, read with its selections made, holds none and no selection a
value has not settled, so `vet` is `Vet` on it, by `vet_iff`. -/
theorem selectCases_checkable : ∀ c ∈ selectCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (c.1.readR c.2.1).CheckableA := by decide

theorem select_verdict_exact : ∀ c ∈ selectCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 c.2.1 c.2.2 = v ↔ Vet m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vet_iff (selectCases_checkable c hc).1 (selectCases_checkable c hc).2 v

/-- The cases of decision 13 of the design note's §7: a spread that
selects on `key(0)`, the key of the member it is tried on, over a map's
members and over a list's positions: an arm that admits, an arm that
refuses, the default, no arm and no default, a pattern over the key's
length, two such spreads met, a spread under a rider, and a spread
beside a member the schema declares, whose value the selection meets. -/
def keyCases : List (Decls × Val × Data) :=
  let int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))
  let str (s : String) : Val := .lit (.str s)
  let min (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .min (.num (.integer ⟨n, h⟩))
  let nb (n : ℤ) (h : IntegerLeaf n := by decide) : Bound := .num (.integer ⟨n, h⟩)
  let j (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .integer n h
  let on (arms : List (Val × Val)) (d : Option Val) : Val := .select .key arms d
  let spm (fs : List (String × Bool × Val)) (s : Val) : Val := .map fs (some s) false
  let spl (xs : List Val) (s : Val) : Val := .list xs (some s) false
  let z (v : Val) : Val := .map [("z", false, v)] none false
  let dz (x : Data) : Data := .map [("z", x)]
  let a : Val := on [(str "a", .integer)] (some .nil)
  let ab : Val := on [(str "a", .integer), (str "b", .string)] none
  let short : Val := on [(.len (.max (nb 2)), .any)] (some .nil)
  let both : Val := .meet (spm [] (on [(str "a", .integer)] (some .any)))
    (spm [] (on [(str "a", min 1)] (some .any)))
  let pick : Val := on [(str "a", .or [(1, int 1), (0, .integer)])] (some .nil)
  let pos : Val := on [(str "0", .integer), (str "1", .string)] (some .any)
  let second : Val := on [(str "1", .string)] (some .any)
  [([], z (spm [] a), dz (.map [("a", j 1)])), ([], z (spm [] a), dz (.map [("a", .str "x")])),
    ([], z (spm [] a), dz (.map [("b", j 1)])), ([], z (spm [] a), dz (.map [])),
    ([], z (spm [] ab), dz (.map [("c", j 1)])), ([], z (spm [] ab), dz (.map [("b", .str "x")])),
    ([], z (spm [] short), dz (.map [("ab", j 1)])), ([], z (spm [] short), dz (.map [("abc", j 1)])),
    ([], z both, dz (.map [("a", j 0)])), ([], z both, dz (.map [("a", j 2)])),
    ([], z (spm [] (.ride .metadata a [])), dz (.map [("a", j 1)])),
    ([], z (spm [] (.ride .metadata a [])), dz (.map [("a", .str "x")])),
    ([], z (spm [("a", false, int 1)] a), dz (.map [("a", j 1)])),
    ([], z (spm [("a", false, str "x")] a), dz (.map [("a", .str "x")])),
    ([], z (spm [("a", false, .integer)] (on [(str "a", min 3)] (some .nil))), dz (.map [("a", j 1)])),
    ([], z (spm [("a", false, .string)] a), dz (.map [("a", .str "x")])),
    ([], z (spm [("a", false, .any)] pick), dz (.map [])),
    ([], z (spm [("a", false, .any)] pick), dz (.map [("a", j 2)])),
    ([], z (spl [] pos), dz (.list [j 1, .str "a", .bool true])), ([], z (spl [] pos), dz (.list [.str "a"])),
    ([], z (spl [.integer] second), dz (.list [j 1, .str "a", j 3])),
    ([], z (spl [.integer] second), dz (.list [j 1, j 2]))]

set_option maxRecDepth 8192 in
theorem keyCases_checkable : ∀ c ∈ keyCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (c.1.readR c.2.1).CheckableA := by decide

theorem key_verdict_exact : ∀ c ∈ keyCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 c.2.1 c.2.2 = v ↔ Vet m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vet_iff (keyCases_checkable c hc).1 (keyCases_checkable c hc).2 v

/-- The `trials` rows: each case's declarations and schema as one
document, the schema a map written without its braces, in the three
modes, with the one class `vet` gives. -/
def trialRows (tag : String) (cases : List (Decls × Val × Data) := trialCases ++ selectCases) :
    IO Unit := do
  let mut i := 0
  for c in cases do
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

/-! ## The ninth fragment: the order -/

/-- Maps and lists with a spread or a seal, and two divisors, for the
rows of `map_le_spread`, `list_le_spread` and `mulof_le_mulof`. -/
def spreadBases : List Val :=
  [.map [] (some .integer) false, .map [("x", false, .integer)] (some .integer) false,
    .map [("x", false, .integer)] none true, .map [("x", true, .integer)] (some .integer) true,
    .list [] (some .integer) false, .list [.integer] (some .integer) false,
    .mulof two, .mulof (.integer (.of 4))]

theorem spreadBases_checkable : ∀ v ∈ spreadBases, v.Checkable := by
  intro v hv
  simp only [spreadBases, List.mem_cons, List.mem_nil_iff, or_false] at hv
  rcases hv with rfl | rfl | rfl | rfl | rfl | rfl | rfl | rfl <;> checkable

/-- The values the `subsumption` rows compare pairwise: the first
fragment's level, the bases and each under a key, and the third
fragment's bases, `|` and `*` over scalars, kinds, bounds and sealed
lists. -/
def subVals : List Val := level1 ++ choiceBases ++ spreadBases

/-- The instances that may tell a pair apart. -/
def subInstances : List Data := instances ++ choiceInstances

theorem subVals_checkable : ∀ v ∈ subVals, v.Checkable := by
  intro v hv
  rcases List.mem_append.1 hv with h | h
  · rcases List.mem_append.1 h with h | h
    · exact level1_checkable v h
    · exact choiceBases_checkable v h
  · exact spreadBases_checkable v h

theorem subInstances_wellFormed : ∀ j ∈ subInstances, j.WellFormed := by
  intro j hj
  rcases List.mem_append.1 hj with h | h
  · exact instances_wellFormed j h
  · exact choiceInstances_wellFormed j h

/-- Every `subsumption` row is the definition's: where the procedure puts
the specific below the general it is below, and where an instance of the
pool admits the specific and refuses the general it is not. -/
theorem subsume_rows_exact : ∀ g ∈ subVals, ∀ s ∈ subVals,
    ((leDecF .empty 64 s g).isSome = true → s ⊑[.empty] g) ∧
    (∀ j ∈ subInstances, check s j = true → check g j = false → ¬ s ⊑[.empty] g) := by
  intro g hg s hs
  exact ⟨leDecF_sound, fun j hj h1 h2 =>
    not_le_of_witness (subVals_checkable s hs) (subVals_checkable g hg)
      (subInstances_wellFormed j hj) h1 h2⟩

/-- The `subsumption` rows of some pairs of values, each under the key `v`,
the general first, with the answers the `values` contract allows; a pair
the definition leaves undecided has no row. -/
def subsumePairRows (tag : String) (pairs : List (Val × Val)) : IO Unit := do
  let mut i := 0
  for (g, s) in pairs do
    let some gsrc := g.src | throw (IO.userError "a value of the fragment has no text")
    let some ssrc := s.src | throw (IO.userError "a value of the fragment has no text")
    let want? : Option String :=
      if (leDecF .empty 64 s g).isSome then some "[\"subsumes\",\"undecided\"]"
      else if subInstances.any (fun j => check s j && !(check g j)) then
        some "[\"does_not_subsume\",\"undecided\"]"
      else none
    if let some want := want? then
      IO.println (tag ++ toString i ++ "\tsubsumption\tv: " ++ gsrc ++ "\tv: " ++ ssrc
        ++ "\t{\"verdict\":" ++ want ++ ",\"opts\":{\"profile\":\"values\"}}")
      i := i + 1

/-- The rows of the values `subVals` compares pairwise. -/
def subsumeRows (tag : String) : IO Unit :=
  subsumePairRows tag (subVals.flatMap fun g => subVals.map fun s => (g, s))

/-! ## The words `map` and `list`

The kinds of ruling 15 of `sketch/DEFINITION.0.md` §7, each alone, under
a key, and met with a map, a list and `string`, as `verdict` rows against
the first fragment's instances, rows k0 on in the first fragment's file;
and in order against the empty map and list, open and sealed, a map and a
list of each kind of seal, a spread on each, and the ends, as
`subsumption` rows m0 on in the ninth fragment's file. -/

def kindBases : List Val := [.mapKind, .listKind]

def kindVals : List Val :=
  kindBases ++ kindBases.flatMap (fun v => [field true v, field false v]) ++
    kindBases.flatMap (fun k =>
      [.meet k (field false .integer), .meet k (.list [.integer] none false), .meet k .string]) ++
    [.meet .mapKind .listKind]

theorem kindVals_checkableB : ∀ v ∈ kindVals, v.checkableB = true := by decide

theorem kindVals_checkable : ∀ v ∈ kindVals, v.Checkable :=
  fun v hv => (Val.checkableB_iff v).1 (kindVals_checkableB v hv)

/-- Every row of the kinds is the definition's. -/
theorem kind_verdict_exact {v : Val} (hv : v ∈ kindVals) {j : Data} (hj : j ∈ instances) :
    check v j = true ↔ Instance Env.empty v j :=
  ⟨fun h => ⟨instances_wellFormed j hj, (check_iff (kindVals_checkable v hv) j).mp h⟩,
    fun h => (check_iff (kindVals_checkable v hv) j).mpr h.2⟩

/-- The values the kinds are ordered against. -/
def kindSubVals : List Val :=
  kindBases ++ [.map [] none false, .list [] none false, field false .integer,
    field true .integer, .map [("x", false, .integer)] none true, .list [.integer] none false,
    .list [.integer] none true, .list [] none true, .map [] (some .integer) false,
    .list [] (some .integer) false, .any, .nil, .string, .integer]

def isWord : Val → Bool
  | .mapKind | .listKind => true
  | _ => false

/-- The pairs with a kind on either side. -/
def kindPairs : List (Val × Val) :=
  kindSubVals.flatMap fun g =>
    (kindSubVals.filter fun s => isWord g || isWord s).map fun s => (g, s)

theorem kindSubVals_checkableB : ∀ v ∈ kindSubVals, v.checkableB = true := by decide

/-- Every row of the kinds' order is the definition's, as
`subsume_rows_exact` makes the ninth fragment's. -/
theorem kind_subsume_rows_exact : ∀ g ∈ kindSubVals, ∀ s ∈ kindSubVals,
    ((leDecF .empty 64 s g).isSome = true → s ⊑[.empty] g) ∧
    (∀ j ∈ subInstances, check s j = true → check g j = false → ¬ s ⊑[.empty] g) := by
  intro g hg s hs
  exact ⟨leDecF_sound, fun j hj h1 h2 =>
    not_le_of_witness ((Val.checkableB_iff s).1 (kindSubVals_checkableB s hs))
      ((Val.checkableB_iff g).1 (kindSubVals_checkableB g hg))
      (subInstances_wellFormed j hj) h1 h2⟩

/-! ## The tenth fragment: the order on documents -/

/-- Documents with declarations, each its declarations and its term, which
the rows put under `v` and compare pairwise, each read under its own
declarations: a recursive list of nodes, its unrolling, a node with any
tail, a node whose head is `1`, the plain nodes, a non-recursive name,
the scalars it expands to, a map holding a node, two names recursive
through each other and their unfolding, a name recursive through itself,
and a list of cells with a sealed empty map as its end, beside a cell
with any tail. -/
def docCases : List (Decls × Val) :=
  let int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))
  let node (n next : Val) : Val := .map [("n", false, n), ("next", true, next)] none false
  let T : Decls := [("T", node .integer (.alias "T"))]
  let p : Decls := [("p", .meet .integer (.min (.num one)))]
  let AB : Decls := [("A", .map [("b", true, .alias "B")] none false),
    ("B", .map [("a", true, .alias "A")] none false)]
  let A1 : Decls := [("A", .map [("b", true, .alias "A")] none false)]
  let cell (next : Val) : Val := .map [("n", false, .integer), ("next", false, next)] none false
  let M : Decls := [("M", .or [(0, .map [] none true), (0, cell (.alias "M"))])]
  [(T, .alias "T"), (T, node .integer (.alias "T")), ([], node .integer .any),
    (T, node (int 1) (.alias "T")), ([], .map [("n", false, .integer)] none false),
    ([], .map [("n", false, int 1)] none false), (p, .alias "p"), ([], .integer),
    ([], .min (.num one)), ([], .meet .integer (.min (.num one))),
    (T, .map [("a", false, .alias "T")] none false),
    ([], .map [("a", false, .map [("n", false, .integer)] none false)] none false),
    (AB, .alias "A"), (AB, .alias "B"), ([], .map [("b", true, .map [("a", true, .any)] none false)] none false),
    (A1, .alias "A"),
    (M, .alias "M"), ([], cell .any), ([], .or [(0, .map [] none true), (0, cell .any)]),
    (M, cell (.alias "M"))]

/-- The instances that may tell two documents apart, each put under `v`. -/
def docInstances : List Data :=
  let j (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .integer n h
  let node (n : Data) (rest : List (String × Data)) : Data := .map (("n", n) :: rest)
  [node (j 1) [], node (j 1) [("next", node (j 2) [])],
    node (j 1) [("next", node (j 2) [("next", node (j 3) [])])],
    node (.str "a") [], node (j 2) [], .map [], j 0, j 1, j 2, .str "a",
    node (j 1) [("next", j 5)], node (j 1) [("m", j 1)],
    .map [("a", node (j 1) [])], .map [("a", node (j 1) [("next", node (j 2) [])])],
    .map [("a", node (.str "a") [])],
    .map [("b", j 5)], .map [("b", .map [("a", j 5)])], .map [("a", .map [])], .map [("b", .map [])],
    .map [("b", .map [("a", .map [("b", .map [])])])],
    node (j 1) [("next", .map [])], node (j 1) [("next", node (j 2) [("next", .map [])])],
    node (j 1) [("next", .map [("x", j 1)])]]

/-- A case's term under the key `v`, as the rows write it. -/
def docOf (v : Val) : Val := .map [("v", false, v)] none false

/-- An instance under the key `v`. -/
def docData (j : Data) : Data := .map [("v", j)]

theorem docCases_ok : ∀ c ∈ docCases, c.1.guardedB = true ∧ c.1.bodiesCheckableB = true ∧
    (docOf c.2).checkableAB = true := by decide

theorem docInstances_wf : ∀ j ∈ docInstances, (docData j).wf = true := by decide

/-- A witness among the instances refutes the order on two documents of
the fragment: `not_leD_of_witness`, its side conditions decided. -/
theorem subsume_doc_rows_exact : ∀ g ∈ docCases, ∀ s ∈ docCases, ∀ j ∈ docInstances,
    checkR s.1 (s.1.readR (docOf s.2)) (docData j) = true →
    checkR g.1 (g.1.readR (docOf g.2)) (docData j) = false →
    ¬ LeD g.1 (docOf g.2) s.1 (docOf s.2) := by
  intro g hg s hs j hj h1 h2
  obtain ⟨hgg, hgb, hgv⟩ := docCases_ok g hg
  obtain ⟨hsg, hsb, hsv⟩ := docCases_ok s hs
  exact not_leD_of_witness (Decls.guardedB_iff.1 hgg) (Decls.bodiesCheckableB_iff.1 hgb)
    (readR_checkableA (Decls.bodiesCheckableB_iff.1 hgb) ((Val.checkableAB_iff _).1 hgv))
    (Decls.guardedB_iff.1 hsg) (Decls.bodiesCheckableB_iff.1 hsb)
    (readR_checkableA (Decls.bodiesCheckableB_iff.1 hsb) ((Val.checkableAB_iff _).1 hsv))
    ((Data.wf_iff _).1 (docInstances_wf j hj)) h1 h2

/-- A document's text: its declarations, one to a line, and its term under
`v`. -/
def docSrc (c : Decls × Val) : IO String := do
  let mut lines : List String := []
  for d in c.1 do
    let some bsrc := d.2.src | throw (IO.userError "a body of the fragment has no text")
    lines := lines ++ ["%" ++ d.1 ++ " = " ++ bsrc]
  let some tsrc := c.2.src | throw (IO.userError "a term of the fragment has no text")
  pure ("\\n".intercalate (lines ++ ["v: " ++ tsrc]))

/-- The rows of the tenth fragment: each pair of documents, the general
first, where `leDecD` decides the order or an instance refutes it. -/
def subsumeDocRows (tag : String) : IO Unit := do
  let mut i := 0
  for g in docCases do
    let gsrc ← docSrc g
    for s in docCases do
      let ssrc ← docSrc s
      let want? : Option String :=
        if (leDecD 64 g.1 (docOf g.2) s.1 (docOf s.2)).isSome then some "[\"subsumes\",\"undecided\"]"
        else if docInstances.any (fun j => checkR s.1 (s.1.readR (docOf s.2)) (docData j)
            && !(checkR g.1 (g.1.readR (docOf g.2)) (docData j))) then
          some "[\"does_not_subsume\",\"undecided\"]"
        else none
      if let some want := want? then
        IO.println (tag ++ toString i ++ "\tsubsumption\t" ++ gsrc ++ "\t" ++ ssrc
          ++ "\t{\"verdict\":" ++ want ++ ",\"opts\":{\"profile\":\"values\"}}")
        i := i + 1

/-! ## The forms

The spellings of the definition's forms, as the printer writes them, for
the check that the JSON Schema importer writes nothing else
(`ts/test/jsonschema-forms.test.ts`, `go/jsonschema_forms_test.go`): a
word, the name of a call, or a mark of the grammar, each beside the
constructor of `Val` it spells. The forms the importer writes that are
none of these wait in `spec/forms-outside.tsv`, each on its decision. -/

def forms : List (String × String × String) :=
  [("integer", "word", "integer"), ("float", "word", "float"),
    ("biginteger", "word", "biginteger"), ("bigdecimal", "word", "bigdecimal"),
    ("number", "word", "number"), ("string", "word", "string"), ("anyString", "call", "empty"),
    ("boolean", "word", "boolean"), ("mapKind", "word", "map"), ("listKind", "word", "list"),
    ("lit", "word", "true"), ("lit", "word", "false"),
    ("lit", "word", "null"), ("min", "call", "min"), ("max", "call", "max"),
    ("above", "call", "above"), ("beneath", "call", "below"), ("neq", "call", "neq"),
    ("mulof", "call", "mulof"), ("len", "call", "len"), ("unique", "call", "unique"),
    ("re", "call", "re"), ("format", "call", "format"), ("any", "word", "any"),
    ("nil", "word", "nil"), ("map", "syntax", "{}"), ("map", "call", "close"),
    ("list", "syntax", "[]"),
    ("or", "syntax", "|"), ("pref", "syntax", "*"), ("meet", "syntax", "&"),
    ("alias", "syntax", "%"), ("path", "syntax", "$"), ("nof", "call", "nof"),
    ("must", "call", "must"), ("when", "call", "when"), ("contains", "call", "contains"),
    ("rest", "call", "rest"), ("select", "call", "match"), ("filter", "call", "filter"),
    ("ride", "call", "meta"), ("ride", "call", "deprecate"), ("ride", "call", "ident"),
    ("ride", "call", "type"), ("ride", "call", "hide"), ("key", "call", "key")]

/-- A term of each call form, so that the oracle can hold the list to
the printer: each prints as its name and a parenthesis. -/
def formSamples : List (String × Val) :=
  [("min", .min (.num one)), ("max", .max (.num one)), ("above", .above (.num one)),
    ("below", .beneath (.num one)), ("neq", .neq [.num one]), ("mulof", .mulof one),
    ("len", .len .integer), ("unique", .unique none), ("re", .re "a"), ("format", .format "email"),
    ("close", .list [.integer] none true), ("nof", .nof .integer [.integer]),
    ("must", .must .integer "m"), ("when", .when .integer .integer none),
    ("contains", .contains .integer (.min (.num one))), ("rest", .rest .integer []),
    ("match", .select .integer [] none), ("filter", .filter .integer .integer),
    ("meta", .ride .metadata .integer []), ("deprecate", .ride .deprecate .integer []),
    ("ident", .ride .ident .integer []), ("type", .ride .type .integer []),
    ("hide", .ride .hide .integer []), ("key", .key)]

/-- The `forms` file: each form with its kind and spelling, after the
spellings are held to the printer. -/
def formRows : IO Unit := do
  for (name, v) in formSamples do
    let some src := v.src | throw (IO.userError s!"the sample of {name} has no text")
    unless src.startsWith (name ++ "(") do
      throw (IO.userError s!"the form {name} prints as {src}")
  unless Val.anyString.src = some "string & empty()" do
    throw (IO.userError "string & empty() prints otherwise")
  for (ctor, kind, text) in forms do
    IO.println (ctor ++ "\t" ++ kind ++ "\t" ++ text)

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
    IO.println "# The words `map` and `list` follow in rows k0 on: each alone, under a key,"
    IO.println "# and in a few meets (13 values), against all 24 instances."
    rows "c" vals [first, more]
    rows "k" kindVals [instances]
    return 0
  | ["bounds"] =>
    IO.println "# Generated by `lake exe oracle bounds` (spec/Oracle.lean) from the definition"
    IO.println "# in spec/Aontu: the bounds beyond min, max, and mulof (above, below, the"
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
    IO.println "# A size met with a container literal follows in rows l0 on: an error where"
    IO.println "# the size's upper half refuses the literal's count, the lower end waiting"
    IO.println "# for generation."
    IO.println "# The marks follow in rows h0 on: hide() and type() leave a member of a map"
    IO.println "# out of the output, the member still meeting the data, and --no-fill reads"
    IO.println "# the schema's visible part."
    verdictRows "e"
    verdictRows "l" lenCases
    verdictRows "h" markCases
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
    IO.println "# The riders follow in rows r0 on: meta() and deprecate() judging as their"
    IO.println "# values, ident() on an alias's value, and ident() anywhere else, an error,"
    IO.println "# in a body no reference reads as in one a reference does."
    IO.println "# The marks under the names follow in rows n0 on: a reference copies a body"
    IO.println "# with its marks cleared at every depth, and a mark written at the reference"
    IO.println "# stays."
    IO.println "# The seal a reference puts on a type() value follows in rows o0 on: the copy"
    IO.println "# admits nothing the definition does not declare, at any depth, and a"
    IO.println "# recursive name takes none."
    aliasRows "a"
    aliasRows "r" riderCases
    aliasRows "n" markAliasCases
    aliasRows "o" sealCases
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
    IO.println "# Paths through the riders follow in rows q0 on, which a path reads through."
    pathRows "p"
    pathRows "q" riderPathCases
    return 0
  | ["forms"] =>
    IO.println "# Generated by `lake exe oracle forms` (spec/Oracle.lean): every form of the"
    IO.println "# definition's syntax (spec/Aontu/Syntax.lean) with its spelling as the oracle's"
    IO.println "# printer writes it, a word, the name of a call, or a mark of the grammar,"
    IO.println "# each beside the constructor it spells. ts/test/jsonschema-forms.test.ts and"
    IO.println "# go/jsonschema_forms_test.go hold the JSON Schema importer's output to these"
    IO.println "# forms and to those spec/forms-outside.tsv lists with the decision each waits on."
    IO.println "# Regenerate with `make spec`; never edit by hand."
    IO.println "# form\tkind\ttext"
    formRows
    return 0
  | ["subsumedocs"] =>
    IO.println "# Generated by `lake exe oracle subsumedocs` (spec/Oracle.lean) from the definition"
    IO.println "# in spec/Aontu: documents with alias declarations compared pairwise under the"
    IO.println "# values profile, each read under its own declarations (LeD), the general first."
    IO.println "# A row's expectation is the answers the contract SubsumeCorrectD allows: subsumes"
    IO.println "# where leDecD decides the order on two readings that read no name, with its"
    IO.println "# proof, and does_not_subsume where an instance under v admits the specific"
    IO.println "# document and refuses the general, which subsume_doc_rows_exact makes the"
    IO.println "# definition's own; a pair the definition leaves undecided has no row."
    subsumeDocRows "u"
    return 0
  | ["subsume"] =>
    IO.println "# Generated by `lake exe oracle subsume` (spec/Oracle.lean) from the definition"
    IO.println "# in spec/Aontu: the order between the values of the first fragment's level"
    IO.println "# (the bases and each under a key) and of the third (`|` and `*` over scalars,"
    IO.println "# kinds, bounds and sealed lists), each pair under the key v, the general"
    IO.println "# first, as `subsumption` rows under the `values` profile whose expectation"
    IO.println "# is what the contract allows: subsumes or undecided where `leDecF` puts the"
    IO.println "# specific below the general, which `leDecF_sound` makes the definition's own,"
    IO.println "# and does_not_subsume or undecided where an instance of the fragments admits"
    IO.println "# the specific and refuses the general, which `not_le_of_witness` makes the"
    IO.println "# definition's own; a pair the definition leaves undecided has no row."
    IO.println "# Regenerate with `make spec`; never edit by hand. The cases the ports do"
    IO.println "# not yet answer this way are listed in spec/ledger.tsv."
    IO.println "# The words `map` and `list` follow in rows m0 on, each against the empty map"
    IO.println "# and list, a map and a list open and sealed, a spread on each, the ends,"
    IO.println "# `string` and `integer`."
    subsumeRows "s"
    subsumePairRows "m" kindPairs
    return 0
  | ["trials"] =>
    IO.println "# Generated by `lake exe oracle trials` (spec/Oracle.lean) from the definition"
    IO.println "# in spec/Aontu: documents with trial schemas inside values, each case its"
    IO.println "# declarations and a map as the schema against a map as the document, run in"
    IO.println "# the default mode, without the fill (noFill) and under --partial (partial),"
    IO.println "# as `verdict` rows whose expectation is the one class `vet` gives, which"
    IO.println "# `vet_iff` makes the definition's own. nof(n, ...) counts the branches that"
    IO.println "# admit the value and judges as n judges the count; must(c, m) asks what"
    IO.println "# nof(1, c) asks; when(c, t, e) holds the value to the branch c picks, an e"
    IO.println "# not written passing; contains(c, n) counts the members c admits and judges"
    IO.println "# as n judges the count, at least one where n is not written, a scalar having"
    IO.println "# none; rest(t, c, ...) holds each member no cover c evaluates to t, a cover"
    IO.println "# applying where its if admits the whole and evaluating the members its keys"
    IO.println "# or members admits; match(s, p, r, ...) is the first r whose p admits the value"
    IO.println "# of s, else its default, and an error with none, and filter(s, c) is the members"
    IO.println "# of the value of s that c admits, each made once the document is read; a"
    IO.println "# branch that admits nothing counts as none; a container"
    IO.println "# a trial refuses once its members have all arrived is invalid; and a name that"
    IO.println "# refers to itself through a trial alone breaks the alias-cycle rule, an"
    IO.println "# error. Regenerate with `make spec`; never edit by hand. The cases the ports"
    IO.println "# do not yet answer this way are listed in spec/ledger.tsv."
    IO.println "# A spread that selects on key(0), the key of the member it is tried on, or"
    IO.println "# the position of the item, follows in rows y0 on."
    trialRows "t"
    trialRows "y" keyCases
    return 0
  | _ =>
    IO.eprintln "usage: oracle [bounds | choice | gen | verdict | alias | paths | trials]"
    return 2
