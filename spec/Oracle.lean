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
defaulted keys and spreads, an optional key whose value generates an
empty map or list and so is absent (decision 19 of the design note's
§7), lists with spreads, and meets of these, the fill of a schema with
data among them. No value here splits the ports
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
    .or [(0, .nil), (0, int 1)],
    key "a" true (.map [] none false), key "a" true (.list [] none false),
    key "a" false (.map [] none false), key "a" false (.list [] none false),
    key "a" true (key "b" true .integer), key "a" true (key "b" true (.map [] none false)),
    key "a" false (key "b" true (.map [] none false)), key "a" true (.map [] none true),
    key "a" true (.map [] (some .integer) false), key "a" true (.list [] (some .integer) false),
    key "a" true (.pref 1 (.map [] none false)),
    key "a" true (.or [(1, .list [] none false), (0, .list [int 1] none false)]),
    key "a" true (.or [(1, .map [] none false), (0, key "x" false (int 1))]),
    key "a" true (.or [(1, .list [int 1] none false), (0, .list [] none false)]),
    key "a" true (.meet (.map [] none false) (key "b" true (int 1))),
    .map [("a", true, .map [] none false), ("b", false, int 1)] none false,
    .meet (key "a" true (.map [] none false)) (key "a" false (.map [] none false)),
    .list [key "a" true (.map [] none false)] none false]

/-- Every value of the `gen` fragment normalises to a checkable one, so
`output` is `Output` on it, by `output_iff`. -/
theorem genVals_checkable : ∀ v ∈ genVals, (normalise v).Checkable := by decide

theorem gen_output_exact : ∀ v ∈ genVals, ∀ (env : Env) (root j : Data),
    output v = some j ↔ Output env root v j :=
  fun v hv _ _ j => output_iff (genVals_checkable v hv) j

/-- A term's text as a cell of a row, each backslash doubled, since the
runners expand `\n`, `\t` and `\\` in a cell before they read it. -/
def Aontu.Val.cell (v : Val) : Option String := v.src.map fun s => s.replace "\\" "\\\\"

/-- Data's text as a cell of a row, as `Val.cell` writes a term's. -/
def Aontu.Data.cell (d : Data) : Option String := d.src.map fun s => s.replace "\\" "\\\\"

/-- The `gens` rows: each value under the key `v` that generates, with
the JSON the engines must write for it. A value that generates nothing
has no row, since the definition gives no code for it until P5. -/
def genRows (tag : String) (vals : List Val) : IO Unit := do
  let mut i := 0
  for v in vals do
    let some src := v.cell | throw (IO.userError "a value of the fragment has no text")
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
the data or by a second literal, and an optional member whose value
generates an empty map or list, which isn't counted (decision 19). No
size is a disjunction, which both ports refuse as an argument (#413). -/
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
    (.meet (.len (.max (nb 1))) (.list [] (some .integer) false), .list [j 1, j 2]),
    (.meet (.len (.max (nb 1))) (mp [("x", false, int 1), ("y", true, mp [])]), .map [("x", j 1)]),
    (.meet (.len (.max (nb 1))) (mp [("x", false, int 1), ("y", true, ls [])]), .map [("x", j 1)]),
    (.meet (.len (.max (nb 1))) (mp [("x", false, int 1), ("y", true, mp [("z", false, int 1)])]),
      .map [("x", j 1)])]

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
    let some ssrc := c.1.cell | throw (IO.userError "a schema of the fragment has no text")
    let some dsrc := c.2.cell | throw (IO.userError "a document of the fragment has no text")
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
mark, met with a name, declared twice, met at the reference and
through a selection, its default and one met with a map. The seal stops
at a kind, `any`, a disjunction, a preference and a list's spread, a
mark inside a body seals nothing, and a recursive name, which both
ports read unsealed, takes none. -/
def sealCases : List (Decls × Val × Data) :=
  let int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))
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
      .map [("t", .map [("a", .map [("b", j 1)])]), ("z", j 1)]),
    ([("T", type (.select (int 1) [(int 1, x)] none))], T, dxy),
    ([("T", type (.select (int 1) [(int 1, x)] none))], T, .map [("x", j 1)]),
    ([("T", type (mp [("a", .select (int 1) [(int 1, y)] none)]))], T,
      .map [("a", .map [("y", j 1), ("z", j 2)])]),
    ([("T", type (.meet x (.select (int 1) [(int 1, y)] none)))], T, dxyz),
    ([("T", type (.meet x (.select (int 1) [(int 1, y)] none)))], T, dxy),
    ([("T", type (.select (int 2) [(int 1, y)] (some x)))], T, dxy),
    ([("T", type (.select (int 2) [(int 1, y)] (some x)))], T, .map [("x", j 1)]),
    ([("T", type (.select (int 1) [(int 1, .list [.integer] none false)] none))], T, .list [j 1, j 2]),
    ([("T", type (.select (int 1) [(int 1, .integer)] none))], T, j 3),
    ([("T", .select (int 1) [(int 1, type x)] none)], T, dxy),
    ([("T", mp [("a", type y)])], T, .map [("a", .map [("y", j 1), ("z", j 2)])]),
    ([("T", type x)], .select (int 1) [(int 1, T)] none, dxy),
    ([("T", type (mp [("a", .pref 1 (mp [("b", .integer)]))]))], T,
      .map [("a", .map [("b", j 1), ("c", j 2)])])]

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
      let some bsrc := d.2.cell | throw (IO.userError "a body of the fragment has no text")
      lines := lines ++ ["%" ++ d.1 ++ " = " ++ bsrc]
    let some ssrc := c.2.1.cell | throw (IO.userError "a schema of the fragment has no text")
    let some dsrc := c.2.2.cell | throw (IO.userError "a document of the fragment has no text")
    let src := "\\n".intercalate (lines ++ ["v: " ++ ssrc])
    let (S, D) := aliasDoc c
    for (m, opts) in [(({} : Mode), ""), (({ fill := false } : Mode), ",\"opts\":{\"noFill\":true}"),
        (({ lax := true } : Mode), ",\"opts\":{\"partial\":true}")] do
      IO.println (tag ++ toString i ++ "\tverdict\t" ++ src ++ "\tv: " ++ dsrc ++ "\t{\"verdict\":\""
        ++ verdictName (vet m c.1 S D) ++ "\"" ++ opts ++ "}")
      i := i + 1

/-! ## The seventh fragment: paths -/

/-- Documents with paths: each case its declarations, a schema that is
a map with paths in it, and a document, run in the three modes. A
step's text reads a map by key and a list by the index it spells in
canonical decimal. -/
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
    ([], m [("a", m [("x", int 1), ("y", int 2)]), ("b", .meet pa (m [("x", int 2)]))], .map [("b", .map [("x", j 2), ("y", j 2)])]),
    ([], m [("q", m [("0", int 3)]), ("x", .path [.key "q", .idx 0])], .map [("x", j 3)]),
    ([], m [("q", m [("0", int 3)]), ("x", .path [.key "q", .idx 0])], .map [("x", j 4)]),
    ([], m [("q", .list [int 5, int 6] none false), ("x", .path [.key "q", .key "1"])], .map [("x", j 6)]),
    ([], m [("q", .list [int 5, int 6] none false), ("x", .path [.key "q", .key "1"])], .map [("x", j 5)]),
    ([], m [("q", .list [int 5, int 6] none false), ("x", .path [.key "q", .key "01"])], .map [("x", j 5)])]

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

/-- `key(n)` reached through a path or a name, read where the path or
the name lands: a path at the depth its target stands or deeper, the
data at the target met with the term it copies, a generator a path
copies whole, a name read at each place it stands, and a selection, a
call and a generator that compute with the key, which the root a path
reads keeps as written. -/
def keyPathCases : List (Decls × Val × Data) :=
  let m (fs : List (String × Val)) : Val := .map (fs.map fun f => (f.1, false, f.2)) none false
  let lst (xs : List Val) : Val := .list xs none false
  let str (s : String) : Val := .lit (.str s)
  let js (s : String) : Data := .str s
  let p (ks : List String) : Val := .path (ks.map .key)
  let k (n : ℤ) : Val := .keyUp n
  let sel := m [("a", .select (str "b") [(k 1, .lit (.num (.integer ⟨1, by decide⟩)))]
    (some (.lit (.num (.integer ⟨2, by decide⟩))))), ("b", m [("c", p ["a"])])]
  let plus := m [("a", .call .plus [str "q", k 1]), ("b", m [("c", p ["a"])])]
  let gen := m [("a", .call .each [m [("x", k 0)], .hole]), ("b", m [("c", p ["a"])])]
  let pk := m [("a", .call .pack [lst [k 1], m [("v", .lit (.num (.integer ⟨1, by decide⟩)))]]),
    ("b", m [("c", p ["a"])])]
  let up := m [("a", .call .upper [k 1]), ("b", m [("c", p ["a"])])]
  [([], m [("a", m [("x", k 1)]), ("b", p ["a"])], .map [("b", .map [("x", js "b")])]),
    ([], m [("a", m [("x", k 1)]), ("b", p ["a"])], .map []),
    ([], m [("a", m [("x", k 1)]), ("b", p ["a"])], .map [("b", .map [("x", js "a")])]),
    ([], m [("a", m [("x", k 1)]), ("b", p ["a"])], .map [("a", .map [("x", js "a")]), ("b", .map [("x", js "b")])]),
    ([], m [("a", m [("x", k 0)]), ("b", p ["a"])], .map [("a", .map [("x", js "x")]), ("b", .map [("x", js "x")])]),
    ([], m [("a", m [("x", k 1)]), ("c", m [("d", p ["a", "x"])])], .map [("c", .map [("d", js "c")])]),
    ([], m [("t", m [("x", k 1)]), ("a", m [("b", m [("c", p ["t"])])])],
      .map [("a", .map [("b", .map [("c", .map [("x", js "c")])])])]),
    ([], m [("a", .call .pack [lst [str "x"], m [("n", k 2)]]), ("b", p ["a"])],
      .map [("b", .map [("x", .map [("n", js "b")])])]),
    ([], m [("a", .call .pack [lst [str "x"], m [("n", k 1)]]), ("b", m [("q", p ["a"])])],
      .map [("b", .map [("q", .map [("x", .map [("n", js "x")])])])]),
    ([("T", m [("x", k 1)])], m [("a", .alias "T"), ("b", .alias "T")],
      .map [("a", .map [("x", js "a")]), ("b", .map [("x", js "b")])]),
    ([("T", m [("x", k 2)])], m [("a", m [("b", .alias "T")])], .map [("a", .map [("b", .map [("x", js "a")])])]),
    ([], sel, .map [("b", .map [("c", .integer 1)])]),
    ([], sel, .map [("b", .map [("c", .integer 2)])]),
    ([], plus, .map [("b", .map [("c", js "qb")])]),
    ([], plus, .map [("b", .map [("c", js "q")])]),
    ([], gen, .map [("b", .map [("c", .list [js "x"])])]),
    ([], gen, .map [("b", .map [("c", .list [js "c"])])]),
    ([], pk, .map [("b", .map [("c", .map [("c", .map [("v", .integer 1)])])])]),
    ([], pk, .map [("b", .map [("c", .map [("c", .map [("v", .integer 2)])])])]),
    ([], up, .map [("b", .map [("c", js "B")])]),
    ([], up, .map [("b", .map [("c", js "A")])])]

theorem keyPathCases_checkable : ∀ c ∈ keyPathCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem key_path_verdict_exact : ∀ c ∈ keyPathCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (keyPathCases_checkable c hc).1 (keyPathCases_checkable c hc).2 v

/-- Relative paths, made absolute where each stands: a sibling, a climb
of two steps and three, a key in quotes, an index into a sibling list,
a list's element reading its sibling, a chain of relative paths, a
relative path in a call, and a body's, read at the body's own place,
`%` and its name as a key at the top, as both ports place it. -/
def relPathCases : List (Decls × Val × Data) :=
  let int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))
  let m (fs : List (String × Val)) : Val := .map (fs.map fun f => (f.1, false, f.2)) none false
  let lst (xs : List Val) : Val := .list xs none false
  let j (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .integer n h
  let rel (n : ℕ) (ks : List String) : Val := .path (.up n :: ks.map .key)
  let sib := m [("z", m [("x", m [("a", int 62)]), ("y", rel 1 ["x", "a"])])]
  [([], sib, .map [("z", .map [("y", j 62)])]),
    ([], sib, .map [("z", .map [("y", j 61)])]),
    ([], m [("z", m [("x", int 1), ("y", m [("w", rel 2 ["x"])])])], .map [("z", .map [("y", .map [("w", j 1)])])]),
    ([], m [("x", int 1), ("y", rel 1 ["x"])], .map [("y", j 1)]),
    ([], m [("a", rel 3 ["x"])], .map []),
    ([], m [("a", m [("k k", int 1), ("y", rel 1 ["k k"])])], .map [("a", .map [("y", j 1)])]),
    ([], m [("a", m [("x", lst [int 1, int 2]), ("y", .path [.up 1, .key "x", .idx 1])])],
      .map [("a", .map [("y", j 2)])]),
    ([], m [("a", lst [int 1, .path [.up 1, .idx 0]])], .map [("a", .list [j 1, j 1])]),
    ([], m [("a", m [("b", lst [int 5, rel 2 ["c"]]), ("c", int 7)])], .map [("a", .map [("b", .list [j 5, j 7])])]),
    ([], m [("a", m [("x", int 1), ("y", rel 1 ["x"]), ("z", rel 1 ["y"])])], .map [("a", .map [("z", j 1)])]),
    ([], m [("a", m [("x", int 1), ("y", .call .plus [rel 1 ["x"], int 1])])], .map [("a", .map [("y", j 2)])]),
    ([("T", m [("y", rel 2 ["x"])])], m [("x", int 1), ("a", .alias "T")], .map [("a", .map [("y", j 1)])]),
    ([("T", m [("y", rel 1 ["x"])])], m [("a", .meet (m [("x", int 1)]) (.alias "T"))], .map [("a", .map [("y", j 1)])])]

theorem relPathCases_checkable : ∀ c ∈ relPathCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem rel_path_verdict_exact : ∀ c ∈ relPathCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (relPathCases_checkable c hc).1 (relPathCases_checkable c hc).2 v

/-- The `paths` rows: each case's declarations and schema as one
document, the schema's braces dropped since neither CLI reads a braced
map after a declaration, in the three modes, with the one class `vetP`
gives. -/
def pathRows (tag : String) (cases : List (Decls × Val × Data) := pathCases) : IO Unit := do
  let mut i := 0
  for c in cases do
    let mut lines : List String := []
    for d in c.1 do
      let some bsrc := d.2.cell | throw (IO.userError "a body of the fragment has no text")
      lines := lines ++ ["%" ++ d.1 ++ " = " ++ bsrc]
    let some ssrc := c.2.1.cell | throw (IO.userError "a schema of the fragment has no text")
    let some dsrc := c.2.2.cell | throw (IO.userError "a document of the fragment has no text")
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
      let some bsrc := d.2.cell | throw (IO.userError "a body of the fragment has no text")
      lines := lines ++ ["%" ++ d.1 ++ " = " ++ bsrc]
    let some ssrc := c.2.1.cell | throw (IO.userError "a schema of the fragment has no text")
    let some dsrc := c.2.2.cell | throw (IO.userError "a document of the fragment has no text")
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
the general first, with the answers the `values` contract allows, an
instance of `pool` telling a pair apart; a pair the definition leaves
undecided has no row. -/
def subsumePairRows (tag : String) (pairs : List (Val × Val)) (pool : List Data := subInstances) :
    IO Unit := do
  let mut i := 0
  for (g, s) in pairs do
    let some gsrc := g.cell | throw (IO.userError "a value of the fragment has no text")
    let some ssrc := s.cell | throw (IO.userError "a value of the fragment has no text")
    let want? : Option String :=
      if (leDecF .empty 64 s g).isSome then some "[\"subsumes\",\"undecided\"]"
      else if pool.any (fun j => check s j && !(check g j)) then
        some "[\"does_not_subsume\",\"undecided\"]"
      else none
    if let some want := want? then
      IO.println (tag ++ toString i ++ "\tsubsumption\tv: " ++ gsrc ++ "\tv: " ++ ssrc
        ++ "\t{\"verdict\":" ++ want ++ ",\"opts\":{\"profile\":\"values\"}}")
      i := i + 1

/-- The rows of the values `subVals` compares pairwise. -/
def subsumeRows (tag : String) : IO Unit :=
  subsumePairRows tag (subVals.flatMap fun g => subVals.map fun s => (g, s))

/-! ## The `defaults` and `gen` profiles

Values that declare defaults, alone, under a key and at a position, for
the `defaults` profile, rows f0 on in the ninth fragment's file, and
values that carry marks, on a member, a position, a spread and a whole
map, for the `gen` profile, rows w0 on, each pool compared pairwise. -/

def defaultVals : List Val :=
  let d1 : Val := .or [(1, .lit (.num one)), (0, .number)]
  let d2 : Val := .or [(1, .lit (.num two)), (0, .number)]
  let mx (v : Val) : Val := .map [("x", false, v)] none false
  [.lit (.num one), .lit (.num two), .integer, .number, d1, d2,
    .or [(1, .lit (.num one)), (0, .integer)], .or [(0, .lit (.num one)), (0, .lit (.num two))],
    .or [(2, .lit (.num one)), (1, .lit (.num two)), (0, .number)], .pref 1 (.lit (.num one)),
    mx d1, mx d2, mx .number, mx (.lit (.num one)),
    .list [d1] none false, .list [.number] none false, .list [.lit (.num one)] none false]

def markVals : List Val :=
  let hide (v : Val) : Val := .ride .hide v []
  let type (v : Val) : Val := .ride .type v []
  let mx (v : Val) : Val := .map [("x", false, v)] none false
  let d1 : Val := .or [(1, .lit (.num one)), (0, .number)]
  [.integer, hide .integer, type .integer, mx .integer, mx (hide .integer), mx (type .integer),
    .map [("x", true, hide .integer)] none false, .list [.integer] none false,
    .list [hide .integer] none false, mx (.map [("y", false, hide (.lit (.num one)))] none false),
    mx (.map [("y", false, .lit (.num one))] none false), hide (mx .integer), d1, mx (hide d1),
    .map [] (some .integer) false, .map [] (some (hide .integer)) false]

/-- The instances that may tell two values of the profiles' pools apart. -/
def profileInstances : List Data :=
  subInstances ++ [.map [("x", .map [("y", .integer 1)])]]

theorem defaultVals_checkable : ∀ v ∈ defaultVals, v.Checkable := by decide

theorem markVals_checkable : ∀ v ∈ markVals, v.Checkable := by decide

theorem profileInstances_wellFormed : ∀ j ∈ profileInstances, j.WellFormed := by
  intro j hj
  rcases List.mem_append.1 hj with h | h
  · exact subInstances_wellFormed j h
  · rcases List.mem_singleton.1 h with rfl
    decide

/-- The positions of a term, as `Val.at` reads them, where the oracle
looks for one that refutes the `defaults` profile. -/
partial def segPaths (v : Val) : List (List Seg) :=
  [] :: match v.unride with
    | .map fs _ _ => fs.flatMap fun f => (segPaths f.2.2).map (.key f.1 :: ·)
    | .list items _ _ =>
      ((List.range items.length).zip items).flatMap fun (i, x) => (segPaths x).map (.idx i :: ·)
    | _ => []

/-- The positions of a term, as `Val.atM` reads them, a spread's among
them, where the oracle looks for one that refutes the `gen` profile. -/
partial def markPaths (v : Val) : List (List MarkSeg) :=
  [] :: match v.unride with
    | .map fs s _ =>
      (fs.flatMap fun f => (markPaths f.2.2).map (.key f.1 :: ·)) ++
        (match s with | some t => (markPaths t).map (.spread :: ·) | none => [])
    | .list items s _ =>
      (((List.range items.length).zip items).flatMap fun (i, x) => (markPaths x).map (.idx i :: ·)) ++
        (match s with | some t => (markPaths t).map (.spread :: ·) | none => [])
    | _ => []

/-- Every row of the profiles is the definition's: where the order holds
and the walk fails nowhere the profile's order holds, and where an
instance tells the two apart, or a position refutes what the profile
asks, it fails. -/
theorem profile_rows_exact (g s : Val) (hs : s.Checkable) (hg : g.Checkable) :
    ((leDecF .empty 64 s g).isSome = true → defaultsAt (normalise s) (normalise g) = true →
      defaultsBelow (normalise s) (normalise g) = true → DefaultsLe .empty s g) ∧
    (∀ j ∈ profileInstances, check s j = true → check g j = false → ¬ DefaultsLe .empty s g) ∧
    (∀ p, defaultsRefutesAt s g p = true → ¬ DefaultsLe .empty s g) ∧
    (DefaultsLe .empty s g → marksAt (normalise s) (normalise g) = true →
      marksBelow (normalise s) (normalise g) = true → GenLe .empty s g) ∧
    (¬ DefaultsLe .empty s g → ¬ GenLe .empty s g) ∧
    (∀ p, marksRefuteAt s g p = true → ¬ GenLe .empty s g) :=
  ⟨fun h h1 h2 => defaultsLe_of_walk (leDecF_sound h) h1 h2,
    fun j hj h1 h2 hd => not_le_of_witness hs hg (profileInstances_wellFormed j hj) h1 h2 hd.le,
    fun _ h => not_defaultsLe_of_refutes h,
    fun hd h1 h2 => genLe_of_walk hd h1 h2,
    fun h hg' => h hg'.defaults,
    fun _ h => not_genLe_of_refutes h⟩

/-- The `subsumption` rows of some pairs of values under the `defaults`
or the `gen` profile, each under the key `v`, the general first, with
the answers the profile's contract allows; a pair the definition leaves
undecided has no row. -/
def profilePairRows (tag : String) (pr : Profile) (pairs : List (Val × Val)) : IO Unit := do
  let name := match pr with | .values => "values" | .defaults => "defaults" | .gen => "gen"
  let mut i := 0
  for (g, s) in pairs do
    let some gsrc := g.cell | throw (IO.userError "a value of the pool has no text")
    let some ssrc := s.cell | throw (IO.userError "a value of the pool has no text")
    let ns := normalise s
    let ng := normalise g
    let dHolds := (leDecF .empty 64 s g).isSome && defaultsAt ns ng && defaultsBelow ns ng
    let dFails := profileInstances.any (fun j => check s j && !(check g j)) ||
      (segPaths ns).any (defaultsRefutesAt s g)
    let (holds, fails) := match pr with
      | .gen => (dHolds && marksAt ns ng && marksBelow ns ng,
          dFails || (markPaths ns).any (marksRefuteAt s g))
      | _ => (dHolds, dFails)
    if holds && fails then
      throw (IO.userError s!"a pair both holds and fails: {gsrc} over {ssrc}")
    let want? : Option String :=
      if holds then some "[\"subsumes\",\"undecided\"]"
      else if fails then some "[\"does_not_subsume\",\"undecided\"]"
      else none
    if let some want := want? then
      IO.println (tag ++ toString i ++ "\tsubsumption\tv: " ++ gsrc ++ "\tv: " ++ ssrc
        ++ "\t{\"verdict\":" ++ want ++ ",\"opts\":{\"profile\":\"" ++ name ++ "\"}}")
      i := i + 1

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
    let some bsrc := d.2.cell | throw (IO.userError "a body of the fragment has no text")
    lines := lines ++ ["%" ++ d.1 ++ " = " ++ bsrc]
  let some tsrc := c.2.cell | throw (IO.userError "a term of the fragment has no text")
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
    ("pathKind", "word", "path"), ("lit", "word", "true"), ("lit", "word", "false"),
    ("lit", "word", "null"), ("min", "call", "min"), ("max", "call", "max"),
    ("above", "call", "above"), ("beneath", "call", "below"), ("neq", "call", "neq"),
    ("mulof", "call", "mulof"), ("len", "call", "len"), ("unique", "call", "unique"),
    ("re", "call", "re"), ("format", "call", "format"), ("grammar", "call", "parse"),
    ("any", "word", "any"),
    ("nil", "word", "nil"), ("map", "syntax", "{}"), ("map", "call", "close"),
    ("list", "syntax", "[]"),
    ("or", "syntax", "|"), ("pref", "syntax", "*"), ("meet", "syntax", "&"),
    ("alias", "syntax", "%"), ("path", "syntax", "$"), ("addr", "call", "path"), ("nof", "call", "nof"),
    ("must", "call", "must"), ("when", "call", "when"), ("contains", "call", "contains"),
    ("rest", "call", "rest"), ("select", "call", "match"), ("filter", "call", "filter"),
    ("ride", "call", "meta"), ("ride", "call", "deprecate"), ("ride", "call", "ident"),
    ("ride", "call", "type"), ("ride", "call", "hide"), ("key", "call", "key"), ("keyUp", "call", "key"),
    ("call", "call", "add"), ("call", "call", "sub"), ("call", "call", "mul"),
    ("call", "call", "div"), ("call", "call", "mod"), ("call", "call", "rem"),
    ("call", "syntax", "-"), ("call", "call", "sum"), ("call", "call", "least"),
    ("call", "call", "greatest"), ("call", "syntax", "+"), ("call", "call", "join"),
    ("call", "call", "pick"), ("call", "call", "sort"), ("call", "call", "upper"),
    ("call", "call", "lower"), ("call", "call", "translate"), ("call", "call", "esc"),
    ("call", "call", "usc"), ("call", "call", "super"), ("call", "call", "split"),
    ("call", "call", "rep"), ("call", "call", "nom"), ("call", "call", "path"), ("call", "call", "abnf"),
    ("call", "call", "parse"), ("call", "call", "project"),
    ("call", "call", "folder"), ("call", "call", "file"), ("call", "call", "content"),
    ("call", "call", "line"), ("call", "call", "fragment"), ("call", "call", "slot"),
    ("call", "call", "inject"), ("call", "call", "copyfiles"), ("call", "call", "listitems"),
    ("call", "call", "each"), ("call", "call", "pack"), ("hole", "syntax", "_")]

/-- A term of each call form, so that the oracle can hold the list to
the printer: each prints as its name and a parenthesis. -/
def formSamples : List (String × Val) :=
  [("min", .min (.num one)), ("max", .max (.num one)), ("above", .above (.num one)),
    ("below", .beneath (.num one)), ("neq", .neq [.num one]), ("mulof", .mulof one),
    ("len", .len .integer), ("unique", .unique none), ("re", .re "a"), ("format", .format "email"),
    ("parse", .grammar "v = \"a\""), ("abnf", .call .abnf [.string]), ("parse", .call .parse [.string]),
    ("close", .list [.integer] none true), ("nof", .nof .integer [.integer]),
    ("must", .must .integer "m"), ("when", .when .integer .integer none),
    ("contains", .contains .integer (.min (.num one))), ("rest", .rest .integer []),
    ("match", .select .integer [] none), ("filter", .filter .integer .integer),
    ("meta", .ride .metadata .integer []), ("deprecate", .ride .deprecate .integer []),
    ("ident", .ride .ident .integer []), ("type", .ride .type .integer []),
    ("hide", .ride .hide .integer []), ("key", .key), ("key", .keyUp 1), ("path", .addr ⟨0, ["a"]⟩),
    ("add", .call .add [.integer, .integer]), ("sub", .call .sub [.integer, .integer]),
    ("mul", .call .mul [.integer, .integer]), ("div", .call .div [.integer, .integer]),
    ("mod", .call .mod [.integer, .integer]), ("rem", .call .rem [.integer, .integer]),
    ("-", .call .neg [.integer]), ("sum", .call .sum [.listKind]),
    ("least", .call .least [.listKind]), ("greatest", .call .greatest [.listKind]),
    ("join", .call .join [.listKind]), ("pick", .call .pick [.listKind, .string]),
    ("sort", .call .sort [.listKind]), ("upper", .call .upper [.string]),
    ("lower", .call .lower [.string]), ("translate", .call .translate [.string, .string]),
    ("esc", .call .esc [.string]), ("usc", .call .usc [.string]), ("super", .call .super [.integer]),
    ("split", .call .split [.string, .string]), ("rep", .call .rep [.string, .string, .string]),
    ("nom", .call .nom [.string]), ("path", .call .path [.string]), ("project", .call (.cmp .project) []),
    ("folder", .call (.cmp .folder) [.string]), ("file", .call (.cmp .file) [.string]),
    ("content", .call (.cmp .content) [.string]), ("line", .call (.cmp .line) [.string]),
    ("fragment", .call (.cmp .fragment) [.string]), ("slot", .call (.cmp .slot) [.string]),
    ("inject", .call (.cmp .inject) [.string]), ("copyfiles", .call (.cmp .copyfiles) [.string]),
    ("listitems", .call (.cmp .listitems) [.mapKind]), ("each", .call .each [.listKind, .hole]),
    ("pack", .call .pack [.listKind, .hole])]

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
      let some src := v.cell | throw (IO.userError "a value of the fragment has no text")
      for j in block do
        let some jsrc := j.cell | throw (IO.userError "an instance has no text")
        let want := if check v j then "\"valid\"" else "[\"invalid\",\"incomplete\",\"error\"]"
        IO.println (tag ++ toString i ++ "\tverdict\tv: " ++ src ++ "\tv: " ++ jsrc
          ++ "\t" ++ head ++ want ++ "}")
        i := i + 1

/-! ## Calls on numbers

P8's first step: each arithmetic call over integers, floats and the
exact big leaves, each with the value it computes and one it does not,
and each call no reading makes, an argument outside its function's
domain, a zero divisor, an answer no leaf holds, or the wrong number of
arguments, rows x0 on in `def-call.tsv`; and a call on a name, rows z0
on. The folds `sum`, `least` and `greatest` follow from row x129, over
lists and maps, their members read as `Val.members` reads them: no case
holds a marked list element (decision 18) or an optional member whose
value generates an empty map or list (decision 19), and no bag is met
with a kind, which the normal form keeps beside it. A lone preference as
an argument or a member, and an `ident()` inside a call, follow from row
x273, and `+` from row x300: two numbers by `add`, a string beside a
scalar as the two texts, two lists, two booleans, the riders and a lone
preference read through, and the operands it does not take, where it
waits. A bag a mark lifts, a rider inside a lone preference, and a
`match` whose pattern holds a call follow from row x480, and `join`
from row x507: the members' texts as `+` writes them, a member or a
separator with no text, a value that is no bag, and the members and
separators it waits on. `pick` and `sort` follow from row x597: a
projector as a key in a map member and as an index in a list member,
the two orders and the two directions, equal keys in their order, and
the arguments they refuse, `projectorCases` a projector or a direction
through a rider or a mark, and `indexCases` the strings that name an
index otherwise than by their digits, and `""` as `pick`'s projector. `upper` and `lower` follow from row x816: the run of code points
a start and a length select, an index of either leaf, and a number
rounded in its own leaf. Their strings are ASCII, the letters on which
the oracle's host and every engine's case conversion agree, and
`asciiCase` refuses a row that reads another, and no case holds a big
integer index between 2 ^ 53 and 2 ^ 63 (#439). `translate` follows
from row x966: ranges, a `-` that stands for itself, a short `to` and an
empty one, a character named twice, code points beyond ASCII, and a
range across the surrogates in `from`, and `surrogateCases` one in
`to`, which writes U+FFFD for each surrogate. `esc` and `usc` follow
from row x1068: each convention both ways, the text each `usc` has no
original for, the variants and the arguments. `super` follows from row
x1221: a scalar's kind, a kind's parent, a container of its members'
parents, a preference read as its default at any depth, a meet that
holds a kind, a disjunction, a seal, the riders. `split` follows from
row x1332, and `rep` from row x1404: the matches a scan reads, an empty
one among them, each `$` form, the groups a pattern has and has not
got, and patterns outside the subset. Their patterns are fixed text,
with groups, on which the oracle's host and every engine's regex
engine agree, or outside the subset, which every engine refuses, and
`hostReads` refuses a row that hands the host another. A replacement
that names something its pattern lacks, over a text with no match,
follows in `repSubCases`. `nom` follows from row x1521: each spelling, the
words a name holds, an acronym list, the sealed map of every spelling,
and the arguments it refuses, but no style written as `""`, which Go
reads as no style (#451). The components follow from row x1677: each
component's node, its seal and its open props and children, a bare
string as a line, nested lists spliced, a hand-written node as a
child, and the props and children each component refuses, but no
`close()` above a node, which both ports hold its props and children
open against and the definition, holding no `open()`, leaves unsaid.
`each` follows from row x1803: its template read for each member of its
data, a list's in order and a map's in key order, the hole kept, met
and left out, a nested `each` binding its own hole, and data that is no
bag. No case holds a marked list element (decision 18), `key()` in a
template, which both ports read as the member's key, or a hole outside
a template, which both ports fill from the call's peer. A `filter`
whose condition holds the hole follows in `filterCases`, and `split`
at a pattern in `patternCases`. -/

def callCases : List (Val × Data) :=
  let int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))
  let j (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .integer n h
  let flt (n : ℤ) (d : ℕ) : Val := match Float.nearest n d with
    | some x => .lit (.num (.float x))
    | none => .nil
  let jf (n : ℤ) (d : ℕ) : Data := match Float.nearest n d with
    | some x => .num (.float x)
    | none => .null
  let big (n : ℤ) : Val := .lit (.num (.biginteger ⟨n⟩))
  let jbig (n : ℤ) : Data := .num (.biginteger ⟨n⟩)
  let dec (c e : ℤ) : Val := .lit (.num (.bigdecimal (BigDecimal.normal c e)))
  let jdec (c e : ℤ) : Data := .num (.bigdecimal (BigDecimal.normal c e))
  let c (f : Fn) (args : List Val) : Val := .call f args
  let lst (xs : List Val) : Val := .list xs none false
  let mp (fs : List (String × Val)) : Val := .map (fs.map fun m => (m.1, false, m.2)) none false
  let str (s : String) : Val := .lit (.str s)
  let js (s : String) : Data := .str s
  let jl (xs : List Data) : Data := .list xs
  let p (a b : Val) : Val := .call .plus [a, b]
  let jm (fs : List (String × Data)) : Data := .map fs
  let kv (k : ℤ) (s : String) (h : IntegerLeaf k := by decide) : Val := mp [("k", int k h), ("v", str s)]
  let jkv (k : ℤ) (s : String) (h : IntegerLeaf k := by decide) : Data := jm [("k", j k h), ("v", js s)]
  let node (cmp : String) (props : List (String × Data)) (kids : List Data) : Data :=
    jm [("cmp", js cmp), ("props", jm props), ("children", jl kids)]
  let lineD (s : String) : Data := node "Line" [("src", js s)] []
  [(c .add [int 1, int 2], j 3), (c .add [int 1, int 2], j 4),
    (c .sub [int 10, int 3], j 7), (c .mul [int 6, int 7], j 42),
    (c .div [int 7, int 2], j 3), (c .div [int (-7), int 2], j (-3)),
    (c .rem [int (-7), int 2], j (-1)), (c .mod [int (-7), int 2], j 1),
    (c .rem [int 7, int (-2)], j 1), (c .mod [int 7, int (-2)], j (-1)),
    (c .div [int 7, int 0], j 1), (c .add [.lit (.str "a"), int 1], j 1),
    (c .sub [.integer, int 1], j 1), (c .add [int 1, .or [(1, int 2), (0, int 3)]], j 3),
    (c .add [int 1, .or [(0, int 1), (0, int 2)]], j 2),
    (c .add [int 9007199254740992, int 1], j 1),
    (c .add [int 9007199254740992, int 2], j 9007199254740994),
    (c .mul [int 4294967296, int 4294967296], j 1),
    (c .add [flt 1 1, big 2], j 1), (c .div [dec 100 1, big 4], jbig 2),
    (c .div [big 10, big 4], jbig 2), (c .add [int 1, big 2], jbig 3), (c .add [int 1, big 2], j 3),
    (c .mul [int 2, dec 15 1], jdec 30 1), (c .mul [int 2, dec 15 1], jbig 3),
    (c .add [flt 1 10, flt 2 10], jf 30000000000000004 (10 ^ 17)),
    (c .add [flt 1 10, flt 2 10], jf 3 10), (c .div [flt 1 1, int 3], jf 3333333333333333 (10 ^ 16)),
    (c .div [int 7, flt 2 1], jf 35 10), (c .mod [flt 75 10, int 2], jf 15 10),
    (c .mul [int 2, flt 15 10], jf 3 1), (c .mul [int 2, flt 15 10], j 3),
    (c .mul [flt (10 ^ 200) 1, flt (10 ^ 200) 1], j 1),
    (c .neg [int 3], j (-3)), (c .neg [flt 15 10], jf (-15) 10), (c .neg [.integer], j 1),
    (c .add [.meet (int 1) .integer, int 1], j 2), (c .add [.ride .metadata (int 3) [], int 1], j 4),
    (c .add [.ride .type (int 2) [], int 1], j 3), (c .add [c .add [int 1, int 2], int 1], j 4),
    (c .add [.meet .number (int 2), int 1], j 3), (c .add [int 1], j 1),
    (c .add [int 1, int 2, int 3], j 6),
    (c .sum [lst [int 1, int 2, int 3]], j 6), (c .sum [lst [int 1, int 2, int 3]], j 7),
    (c .sum [lst [int 1, flt 25 10]], jf 35 10),
    (c .sum [lst [flt 1 10, flt 2 10, flt 3 10]], jf 6000000000000001 (10 ^ 16)),
    (c .sum [lst [flt 3 10, flt 2 10, flt 1 10]], jf 6 10),
    (c .sum [lst [dec 15 1, dec 25 1]], jdec 4 0), (c .sum [lst []], j 0),
    (c .sum [lst [int 9007199254740992, int 1, int (-1)]], j 9007199254740992),
    (c .sum [lst [int 1, int (-1), int 9007199254740992]], j 9007199254740992),
    (c .sum [lst [int 1, big 2]], jbig 3), (c .sum [lst [flt 15 10, big 2]], j 1),
    (c .sum [mp [("b", int 1), ("a", int 2)]], j 3),
    (c .least [lst [int 3, int 1, int 2]], j 1), (c .greatest [lst [int 3, int 1, int 2]], j 3),
    (c .least [lst []], j 1), (c .greatest [mp []], j 1),
    (c .least [lst [int 1, flt 1 1]], j 1), (c .least [lst [int 1, flt 1 1]], jf 1 1),
    (c .least [lst [flt 1 1, int 1]], jf 1 1), (c .greatest [lst [int 1, big 1]], j 1),
    (c .greatest [lst [int 1, big 1]], jbig 1),
    (c .least [lst [big 9007199254740993, int 9007199254740992]], j 9007199254740992),
    (c .least [lst [flt 15 10, dec 125 2]], jdec 125 2),
    (c .greatest [mp [("b", int 1), ("a", flt 1 1)]], jf 1 1),
    (c .greatest [mp [("b", int 1), ("a", flt 1 1)]], j 1),
    (c .sum [int 3], j 3), (c .least [.lit (.str "a")], j 1),
    (c .sum [lst [.lit (.str "a")]], j 1), (c .sum [lst [.integer]], j 1),
    (c .sum [lst [.or [(1, int 1), (0, .number)], int 2]], j 3),
    (c .sum [lst [int 1, lst [int 2]]], j 3),
    (c .sum [mp [("a", int 1), ("b", .ride .hide (int 2) [])]], j 1),
    (c .sum [mp [("a", .ride .type (int 1) []), ("b", int 2)]], j 2),
    (c .sum [.map [("a", true, .integer), ("b", false, int 2)] none false], j 2),
    (c .sum [.map [("a", true, .or [(0, int 1), (0, int 2)]), ("b", false, int 2)] none false], j 2),
    (c .sum [.map [("a", true, int 1), ("b", false, int 2)] none false], j 3),
    (c .sum [.map [("a", true, .lit (.str "x")), ("b", false, int 2)] none false], j 2),
    (c .sum [.ride .metadata (lst [int 1, int 2]) []], j 3),
    (c .sum [lst [.ride .metadata (int 1) [], int 2]], j 3),
    (c .sum [.ride .type (lst [int 1, int 2]) []], j 3),
    (c .sum [.meet (lst [int 1, int 2]) (lst [.integer, .integer])], j 3),
    (c .sum [.meet (mp [("a", int 1)]) (mp [("b", int 2)])], j 3),
    (c .sum [.meet (.list [] (some .integer) false) (lst [int 1, int 2])], j 3),
    (c .sum [.meet (lst [int 1, int 2]) (.len (int 2))], j 3),
    (c .sum [.or [(1, lst [int 1]), (0, lst [int 2, int 3])]], j 1),
    (c .sum [lst [c .add [int 1, int 2], int 4]], j 7),
    (c .add [c .sum [lst [int 1, int 2]], int 1], j 4),
    (c .sum [lst [int 1], lst [int 2]], j 1),
    (c .add [.pref 1 (int 1), int 2], j 3), (c .add [.pref 2 (int 1), int 2], j 3),
    (c .add [.ride .metadata (.pref 1 (int 1)) [], int 2], j 3),
    (c .sum [lst [int 1, .pref 1 (int 2)]], j 3),
    (c .sum [.meet (lst [.pref 1 (int 1)]) (lst [.integer])], j 1),
    (c .least [lst [.pref 1 (int 3), int 2]], j 2),
    (c .sum [.pref 1 (lst [int 1, int 2])], j 3),
    (c .add [.ride .ident (int 1) [("id", .str "x")], int 2], j 3),
    (c .sum [lst [.ride .ident (int 1) [("id", .str "x")]]], j 1),
    (p (int 1) (int 2), j 3), (p (int 1) (int 2), j 4),
    (p (int 1) (flt 2 1), jf 3 1), (p (int 1) (flt 2 1), j 3),
    (p (int 1) (big 2), jbig 3),
    (p (dec 5 1) (dec 5 1), jdec 1 0), (p (dec 5 1) (dec 5 1), jbig 1),
    (p (flt 1 1) (big 2), j 1),
    (p (int 9007199254740992) (int 1), j 1),
    (p (int 9007199254740992) (int 2), j 9007199254740994),
    (p (flt (10 ^ 308) 1) (flt (10 ^ 308) 1), j 1),
    (p (str "a") (str "b"), js "ab"),
    (p (str "a") (int 1), js "a1"), (p (int 1) (str "a"), js "1a"),
    (p (str "a") (flt 15 10), js "a1.5"), (p (str "a") (flt 1 1), js "a1"),
    (p (str "a") (flt (10 ^ 21) 1), js "a1e+21"),
    (p (str "a") (flt (10 ^ 20) 1), js "a100000000000000000000"),
    (p (str "a") (flt 1 1000000), js "a0.000001"), (p (str "a") (flt 1 10000000), js "a1e-7"),
    (p (str "a") (flt 15 100000000), js "a1.5e-7"), (p (str "a") (flt (-5) 10), js "a-0.5"),
    (p (str "a") (flt 12345678901234567890 1), js "a12345678901234567000"),
    (p (str "a") (dec 1 (-3)), js "a1000.0"), (p (str "a") (dec 15 1), js "a1.5"),
    (p (str "a") (dec 1 10), js "a0.0000000001"),
    (p (str "a") (big 123456789012345678901234567890), js "a123456789012345678901234567890"),
    (p (str "a") (.lit (.bool true)), js "atrue"), (p (.lit (.bool true)) (str "a"), js "truea"),
    (p (str "a") (.lit .null), js "a"),
    (p (.lit (.bool true)) (.lit (.bool false)), .bool true),
    (p (.lit (.bool false)) (.lit (.bool false)), .bool false),
    (p (.lit (.bool true)) (int 1), .bool true),
    (p (lst [int 1]) (lst [int 2]), jl [j 1, j 2]), (p (lst [int 1]) (lst [int 2]), jl [j 1]),
    (p (lst [int 1]) (lst [int 2]), jl [j 1, j 2, j 3]), (p (lst []) (lst []), jl []),
    (p (lst [int 1]) (int 2), j 1), (p (int 2) (lst [int 1]), j 1),
    (p (str "a") (lst [int 1]), js "a"),
    (p (mp [("a", int 1)]) (mp [("b", int 2)]), .map [("a", j 1), ("b", j 2)]),
    (p .integer (int 1), j 2), (p .string (str "a"), js "ba"),
    (p (.or [(1, int 1), (0, .number)]) (int 1), j 2),
    (p (.pref 1 (int 1)) (int 1), j 2), (p (int 1) (.pref 2 (int 2)), j 3),
    (p (.ride .metadata (int 1) []) (int 1), j 2), (p (.ride .type (int 1) []) (int 1), j 2),
    (p (.ride .metadata (lst [int 1]) []) (lst [int 2]), jl [j 1, j 2]),
    (p (lst [int 1]) (lst [.pref 1 (int 2)]), jl [j 1, j 2]),
    (p (.meet (.list [] (some .integer) false) (lst [int 1])) (lst [str "x"]), jl [j 1, js "x"]),
    (p (.list [int 1] none true) (lst [int 2]), jl [j 1, j 2]),
    (p (p (str "a") (str "b")) (int 1), js "ab1"), (p (p (int 1) (int 2)) (str "a"), js "3a"),
    (p (.meet (int 1) .integer) (int 1), j 2), (p (str "") (str ""), js ""),
    (p (c .add [int 1, int 2]) (int 1), j 4), (p (c .sum [lst [int 1, int 2]]) (str "a"), js "3a"),
    (p (p .integer (int 1)) (str "a"), j 1), (p (.meet (int 1) (int 2)) .integer, j 1),
    (c .sum [.ride .type (mp [("a", .ride .hide (int 1) []), ("b", int 2)]) []], j 3),
    (c .sum [.ride .hide (mp [("a", .ride .hide (int 1) []), ("b", int 2)]) []], j 3),
    (c .sum [.ride .metadata (.ride .type (mp [("a", .ride .hide (int 1) []), ("b", int 2)]) []) []], j 3),
    (c .add [.pref 1 (.ride .metadata (int 1) []), int 2], j 3),
    (c .sum [lst [.pref 1 (.ride .metadata (int 1) []), int 2]], j 3),
    (p (.pref 1 (.ride .metadata (int 1) [])) (int 1), j 2),
    (.select (int 1) [(p .integer (int 1), str "yes")] (some (str "no")), js "no"),
    (.select (int 2) [(p (int 1) (int 1), str "yes")] (some (str "no")), js "yes"),
    (.select (int 1) [(c .add [.integer, int 1], str "yes")] (some (str "no")), js "no"),
    (c .join [lst [str "a", str "b"], str "-"], js "a-b"),
    (c .join [lst [str "a", str "b"], str "-"], js "ab"),
    (c .join [lst [str "a", str "b"]], js "ab"), (c .join [lst []], js ""),
    (c .join [lst [int 1, flt 2 1, dec 5 1, .lit (.bool true)], str "|"], js "1|2|0.5|true"),
    (c .join [mp [("b", str "B"), ("a", str "A")], str ","], js "A,B"),
    (c .join [lst [mp [("x", int 1)]], str ","], js "a"),
    (c .join [lst [.lit .null], str ","], js "a"), (c .join [lst [lst [int 1]], str ","], js "a"),
    (c .join [lst [.string], str ","], js "a"), (c .join [lst [str "a"], int 5], js "a"),
    (c .join [int 3, str ","], js "a"), (c .join [lst [str "a"], .string], js "a"),
    (c .join [lst [str "a", .pref 1 (str "b")], str ""], js "ab"),
    (c .join [lst [str "a", .or [(1, str "b"), (0, str "c")]], str ""], js "ab"),
    (c .join [mp [("a", str "x"), ("b", .ride .hide (str "y") [])], str "-"], js "x"),
    (c .join [.map [("a", true, .string), ("b", false, str "y")] none false, str "-"], js "y"),
    (c .join [lst [str "a"], str ",", str ";"], js "a"),
    (c .join [lst [str "a", flt (10 ^ 21) 1], str ""], js "a1e+21"),
    (c .join [lst [.ride .metadata (str "a") [], str "b"], str ""], js "ab"),
    (c .join [lst [mp [("x", int 1)], .string], str ","], js "a"),
    (c .join [lst [.string], int 5], js "a"), (c .join [lst [mp [("x", int 1)]], .string], js "a"),
    (c .join [int 3, .string], js "a"), (c .join [lst [str "a"], .pref 1 (str ",")], js "a"),
    (c .join [lst [str "a", str "b"], .ride .metadata (str "-") []], js "a-b"),
    (c .join [.meet (lst [str "x"]) (lst [.string]), str ","], js "x"),
    (c .join [lst [str "a"], .or [(0, str ","), (0, str ";")]], js "a"),
    (c .join [.pref 1 (lst [str "a"]), str ","], js "a"),
    (c .join [lst [p (str "a") (int 1), c .sum [lst [int 1, int 2]]], str "-"], js "a1-3"),
    (c .pick [lst [mp [("a", int 1)], mp [("a", int 2)]], str "a"], jl [j 1, j 2]),
    (c .pick [lst [mp [("a", int 1)], mp [("a", int 2)]], str "a"], jl [j 1, j 3]),
    (c .pick [lst [mp [("a", int 1)], mp [("b", int 2)]], str "a"], jl [j 1]),
    (c .pick [lst [lst [int 9, int 8], lst [int 7, int 6]], int 0], jl [j 9, j 7]),
    (c .pick [lst [lst [int 9, int 8], lst [int 7]], int 1], jl [j 8]),
    (c .pick [lst [lst [int 9]], int (-1)], jl [j 9]), (c .pick [lst [int 1, int 2], str "a"], jl []),
    (c .pick [lst [.integer], str "a"], jl []), (c .pick [int 3, str "a"], jl []),
    (c .pick [lst [mp [("a", int 1)]], flt 0 1], jl [j 1]),
    (c .pick [lst [mp [("a", int 1)]], .string], jl [j 1]),
    (c .pick [lst [mp [("a", int 1)]], .pref 1 (str "a")], jl [j 1]),
    (c .pick [lst [mp [("a", int 1)]], .lit (.bool true)], jl [j 1]),
    (c .pick [lst [lst [int 5]], big 0], jl [j 5]),
    (c .pick [lst [], str "a"], jl []), (c .pick [mp [], str "a"], jl []),
    (c .pick [mp [("y", mp [("a", int 2)]), ("x", mp [("a", int 1)])], str "a"], jl [j 1, j 2]),
    (c .pick [mp [("y", mp [("a", int 2)]), ("x", mp [("a", int 1)])], str "a"], jl [j 2, j 1]),
    (c .pick [lst [mp [("a", .integer)]], str "a"], jl [j 1]),
    (c .pick [lst [.map [("a", true, int 1)] none false], str "a"], jl [j 1]),
    (c .pick [mp [("a", mp [("n", int 1)]), ("b", .ride .hide (mp [("n", int 2)]) [])], str "n"],
      jl [j 1]),
    (c .pick [lst [mp [("a", mp [("b", int 1)])]], str "a"], jl [jm [("b", j 1)]]),
    (c .pick [c .pick [lst [mp [("a", mp [("b", int 1)])]], str "a"], str "b"], jl [j 1]),
    (c .pick [lst [.ride .metadata (mp [("a", int 1)]) []], str "a"], jl [j 1]),
    (c .pick [lst [lst [int 1, int 2]], str "1"], jl [j 2]),
    (c .pick [lst [lst [int 1, int 2]], str "01"], jl [j 2]),
    (c .pick [lst [lst [int 1, int 2]], str "-0"], jl [j 1]),
    (c .pick [lst [lst [int 1, int 2]], str "-1"], jl [j 1]),
    (c .pick [lst [mp [("0", int 5)]], int 0], jl [j 5]),
    (c .pick [lst [mp [("-1", int 5)]], int (-1)], jl [j 5]),
    (c .pick [lst [mp [("00", int 5)]], int 0], jl [j 5]),
    (c .pick [lst [mp [("a", int 1)]], int 0], jl [j 1]),
    (c .pick [mp [("a", lst [int 1, int 2]), ("b", lst [int 3, int 4])], int 1], jl [j 2, j 4]),
    (c .pick [lst [mp [("a", int 1)]], str "a", str "b"], jl [j 1]),
    (c .pick [lst [mp [("a", int 1)]]], jl [j 1]),
    (c .sort [lst [int 3, int 1, int 2]], jl [j 1, j 2, j 3]),
    (c .sort [lst [int 3, int 1, int 2]], jl [j 3, j 1, j 2]),
    (c .sort [lst [int 2, int 1]], jl [j 1, j 2, j 3]),
    (c .sort [mp [("x", str "c"), ("y", str "a")]], jl [js "a", js "c"]),
    (c .sort [lst [mp [("n", str "b")], mp [("n", str "a")]], str "n"],
      jl [jm [("n", js "a")], jm [("n", js "b")]]),
    (c .sort [lst [mp [("n", int 1)], mp [("n", int 3)]], str "n", str "desc"],
      jl [jm [("n", j 3)], jm [("n", j 1)]]),
    (c .sort [lst [int 1, int 3, int 2], str "", str "desc"], jl [j 3, j 2, j 1]),
    (c .sort [lst [int 2, int 1], str "", str "asc"], jl [j 1, j 2]),
    (c .sort [lst [kv 1 "a", kv 1 "b", kv 0 "c"], str "k", str "desc"],
      jl [jkv 1 "a", jkv 1 "b", jkv 0 "c"]),
    (c .sort [lst [kv 1 "a", kv 0 "c", kv 1 "b"], str "k"], jl [jkv 0 "c", jkv 1 "a", jkv 1 "b"]),
    (c .sort [lst [big 9007199254740993, int 9007199254740992]],
      jl [j 9007199254740992, jbig 9007199254740993]),
    (c .sort [lst [dec 15 1, int 1, flt 125 100]], jl [j 1, jf 125 100, jdec 15 1]),
    (c .sort [lst [str "b", str "a", str "B"]], jl [js "B", js "a", js "b"]),
    (c .sort [lst [str "é", str "z", str "e"]], jl [js "e", js "z", js "é"]),
    (c .sort [lst [int 1, str "a"]], jl []), (c .sort [lst [.lit (.bool true), .lit (.bool false)]], jl []),
    (c .sort [lst [.lit .null]], jl []), (c .sort [lst [lst [int 1], lst [int 2]]], jl []),
    (c .sort [lst [.integer, int 1]], jl [j 1, j 1]), (c .sort [lst [int 1, int 2], int 0], jl [j 1, j 2]),
    (c .sort [lst [int 2, int 1], str "desc"], jl [j 2, j 1]),
    (c .sort [lst [int 2, int 1], str "", str "DESC"], jl [j 2, j 1]),
    (c .sort [lst [int 2, int 1], str "", .pref 1 (str "desc")], jl [j 2, j 1]),
    (c .sort [lst [int 2, int 1], flt 0 1], jl [j 1, j 2]),
    (c .sort [lst [mp [("", int 2)], mp [("", int 1)]], str ""], jl []),
    (c .sort [lst []], jl []), (c .sort [mp []], jl []), (c .sort [int 3], jl []),
    (c .sort [lst [int 3, .pref 1 (int 2)]], jl [j 2, j 3]),
    (c .sort [lst [mp [("a", .pref 1 (int 2))], mp [("a", int 1)]], str "a"],
      jl [jm [("a", j 1)], jm [("a", j 2)]]),
    (c .sort [lst [.ride .metadata (int 2) [], int 1]], jl [j 1, j 2]),
    (c .sort [lst [lst [int 2, int 9], lst [int 1, int 8]], int 0], jl [jl [j 1, j 8], jl [j 2, j 9]]),
    (c .sort [lst [lst [int 2, int 9], lst [int 1, int 8]], int 1, str "desc"],
      jl [jl [j 2, j 9], jl [j 1, j 8]]),
    (c .sort [lst [lst [int 2], lst [int 1]], str "0"], jl [jl [j 1], jl [j 2]]),
    (c .sort [lst [mp [("0", int 2)], mp [("0", int 1)]], int 0], jl [jm [("0", j 1)], jm [("0", j 2)]]),
    (c .sort [mp [("b", int 2), ("a", .ride .hide (int 1) []), ("c", int 0)]], jl [j 0, j 2]),
    (c .sort [lst [int 2, int 1], str "", str "desc", str "x"], jl [j 2, j 1]),
    (c .join [c .pick [c .sort [lst [mp [("n", str "id")], mp [("n", str "age")]], str "n"], str "n"],
      str ", "], js "age, id"),
    (c .upper [str "abc"], js "ABC"), (c .upper [str "abc"], js "abc"),
    (c .lower [str "ABC"], js "abc"), (c .lower [str ""], js ""),
    (c .upper [str "foo", int 0, int 1], js "Foo"), (c .upper [str "foo", int 1], js "fOO"),
    (c .upper [str "foo", int (-1), int 2], js "FOo"),
    (c .lower [str "FOOBAR", int (-3), int (-1)], js "fooBAR"),
    (c .lower [str "FOO", int 1, int (-1)], js "Foo"), (c .upper [str "foo", int 5], js "foo"),
    (c .upper [str "foo", int (-5), int 2], js "foo"), (c .upper [str "foo", int 0, int 0], js "foo"),
    (c .upper [str "foo", int 0, int (-2)], js "FOO"), (c .upper [str "foo", int 1, int 5], js "fOO"),
    (c .lower [str "ABC", big 1, big 1], js "AbC"),
    (c .upper [str "foo", big 9007199254740991], js "foo"),
    (c .upper [str "foo", big 99999999999999999999], js "foo"),
    (c .upper [str "foo", int 9007199254740992], js "foo"),
    (c .upper [str "foo", flt 1 1], js "fOO"), (c .upper [str "foo", .pref 1 (int 1)], js "fOO"),
    (c .upper [str "foo", .integer], js "foo"),
    (c .upper [str "foo", .ride .metadata (int 1) []], js "fOO"),
    (c .upper [.ride .metadata (str "a") []], js "A"), (c .upper [.pref 1 (str "a")], js "A"),
    (c .upper [.or [(0, str "a"), (0, str "b")]], js "A"), (c .upper [.lit (.bool true)], js "TRUE"),
    (c .upper [.lit .null], js "NULL"), (c .upper [lst [int 1]], jl [j 1]), (c .upper [.string], js "A"),
    (c .upper [.number], j 1),
    (c .upper [flt 11 10], jf 2 1), (c .upper [flt 11 10], j 2), (c .upper [int 2], j 2),
    (c .upper [flt (-5) 10], jf 0 1), (c .lower [flt 5 10], jf 0 1), (c .lower [flt 19 10], jf 1 1),
    (c .upper [flt 25 10], jf 3 1), (c .lower [flt (-25) 10], jf (-3) 1),
    (c .upper [dec 11 1], jdec 2 0), (c .upper [dec 11 1], jbig 2), (c .lower [dec (-15) 1], jdec (-2) 0),
    (c .upper [dec (-5) 1], jdec 0 0), (c .upper [big 5], jbig 5),
    (c .upper [flt 15 10, int 0], jf 2 1), (c .upper [int 1, int 0], j 1),
    (c .upper [str "a", int 0, int 1, int 2], js "A"), (c .upper [], js "A"),
    (p (c .upper [str "abc"]) (str "def"), js "ABCdef"), (p (c .lower [flt 11 10]) (int 2), jf 3 1),
    (c .upper [c .join [lst [str "a", str "b"], str "-"]], js "A-B"),
    (c .translate [str "a-b-c", str "-", str "_"], js "a_b_c"),
    (c .translate [str "a-b-c", str "-", str "_"], js "a-b-c"),
    (c .translate [str "hello", str "a-y", str "b-z"], js "ifmmp"),
    (c .translate [str "hello", str "lo"], js "he"), (c .translate [str "hello", str "lo", str ""], js "he"),
    (c .translate [str "hello", str "elo", str "x"], js "hxxxx"),
    (c .translate [str "aaa", str "aa", str "xy"], js "yyy"),
    (c .translate [str "abc", str "z-a", str "x"], js "abc"),
    (c .translate [str "abc", str "a", str "z-a"], js "abc"),
    (c .translate [str "abc", str "c-a-z", str "x"], js "abc"),
    (c .translate [str "a-b", str "-a", str "xy"], js "yxb"),
    (c .translate [str "a-b", str "a-", str "xy"], js "xyb"),
    (c .translate [str "abcde-", str "a-c-e", str "x"], js "xxxdxx"),
    (c .translate [str "abc", str "--a", str "x"], js "xbc"),
    (c .translate [str "a-", str "-", str ""], js "a"),
    (c .translate [str "abc", str "", str "x"], js "abc"), (c .translate [str "", str "a", str "b"], js ""),
    (c .translate [str "abc", str "a-c", str "A-C"], js "ABC"),
    (c .translate [str "abc", str "a-a", str "x"], js "xbc"),
    (c .translate [str "a😀b", str "😀", str "x"], js "axb"), (c .translate [str "é", str "a-z", str "x"], js "é"),
    (c .translate [str "abc", str "a-c", str "é"], js "ééé"),
    (c .translate [int 1, str "a"], js "1"), (c .translate [str "a", int 1], js "a"),
    (c .translate [str "a", str "a", int 1], js "1"), (c .translate [.string, str "a"], js "a"),
    (c .translate [.ride .metadata (str "abc") [], str "a", str "x"], js "xbc"),
    (c .translate [.pref 1 (str "abc"), str "a", str "x"], js "xbc"),
    (c .translate [str "abc", str "a", .ride .metadata (str "x") []], js "xbc"),
    (c .translate [str "a"], js "a"), (c .translate [str "a", str "b", str "c", str "d"], js "a"),
    (c .upper [c .translate [str "a-b", str "-", str "_"]], js "A_B"),
    (c .translate [str "\uE000", str "\uD7FF-\uE000", str "xyz"], js "z"),
    (c .translate [str "\uFFFD", str "\uD7FF-\uE000", str "xyz"], js "\uFFFD"),
    (c .esc [str "plain text"], js "plain text"),
    -- A control character before `z`, not a hexadecimal digit: Lean 4.24 writes it into
    -- the compiled oracle as a C `\x01` escape, which a hexadecimal digit after it would extend.
    (c .esc [str "a\"b\\c\nd\te\x01z"], js "a\\\"b\\\\c\\nd\\te\\u0001z"),
    (c .esc [str "a\"b\\c\nd\te\x01z"], js "a\"b\\c\nd\te\x01z"),
    (c .esc [str "é😀\x7f"], js "é😀\x7f"), (c .esc [str "it's \"q\"", str "sq"], js "it\\'s \"q\""),
    (c .usc [str "\\\"x\\u00e9\\u00E9"], js "\"xéé"), (c .usc [str "\\'"], js "'"),
    (c .usc [str "\\/"], js "/"), (c .usc [str "\\uD83D\\uDE00"], js "😀"), (c .usc [str "\\uDE00"], js "a"),
    (c .usc [str "\\uD83D"], js "a"), (c .usc [str "\\x41"], js "A"), (c .usc [str "a\\"], js "a"),
    (c .usc [str "\\u12"], js "a"), (c .usc [str "\\'", str "sq"], js "'"),
    (c .esc [str "o'brien", str "sql"], js "o''brien"), (c .usc [str "o'brien", str "sql"], js "o'brien"),
    (c .usc [str "o''brien", str "sql"], js "o'brien"), (c .esc [str "it's", str "shell"], js "it'\\''s"),
    (c .usc [str "it'\\''s", str "shell"], js "it's"), (c .usc [str "it's", str "shell"], js "it's"),
    (c .esc [str "<a>&\"'", str "xml"], js "&lt;a&gt;&amp;&quot;&apos;"),
    (c .usc [str "&amp;&lt;&gt;&quot;&apos;", str "xml"], js "&<>\"'"),
    (c .usc [str "&#39;", str "xml"], js "'"), (c .usc [str "a&b", str "xml"], js "a&b"),
    (c .esc [str "a b/c~-._é😀+", str "uri"], js "a%20b%2Fc~-._%C3%A9%F0%9F%98%80%2B"),
    (c .usc [str "%c3%a9%C3%A9+", str "uri"], js "éé+"), (c .usc [str "%C3", str "uri"], js "a"),
    (c .usc [str "%E0%80%80", str "uri"], js "a"), (c .usc [str "%ED%A0%80", str "uri"], js "a"),
    (c .usc [str "%F4%90%80%80", str "uri"], js "a"), (c .usc [str "%", str "uri"], js "%"),
    (c .usc [str "%zz", str "uri"], js "a"), (c .usc [str "é", str "uri"], js "é"),
    (c .esc [str "a.b-c\\/", str "regex"], js "a\\.b-c\\\\\\/"),
    (c .usc [str "a\\.b", str "regex"], js "a.b"), (c .usc [str "a\\-b", str "regex"], js "a-b"),
    (c .esc [str "a", str "nope"], js "a"), (c .usc [str "a", str "nope"], js "a"),
    (c .esc [str "a", str ""], js "a"), (c .usc [str "x", str "none"], js "x"),
    (c .esc [int 1], js "1"), (c .esc [.string], js "a"), (c .esc [.ride .metadata (str "a") []], js "a"),
    (c .esc [.pref 1 (str "a")], js "a"), (c .esc [str "a'", .ride .metadata (str "sq") []], js "a\\'"),
    (c .esc [], js "a"), (c .usc [str "a", str "sq", str "x"], js "a"),
    (c .usc [c .esc [str "a'\n\"<&é😀", str "sq"], str "sq"], js "a'\n\"<&é😀"),
    (c .usc [c .esc [str "a b/é", str "uri"], str "uri"], js "a b/é"),
    (c .esc [c .upper [str "a b"], str "uri"], js "A%20B"),
    (c .super [int 1], j 5), (c .super [int 1], js "a"), (c .super [int 1], jf 15 10),
    (c .super [mp [("a", int 1)]], jm [("a", j 7)]),
    (c .super [mp [("a", int 1)]], jm [("a", j 2), ("b", j 3)]),
    (c .super [.pref 1 (int 1)], j 5), (c .super [.pref 1 (int 1)], jf 15 10),
    (c .super [str ""], js ""), (c .super [str ""], js "a"), (c .super [str "a"], js ""),
    (c .super [.integer], jf 15 10), (c .super [.number], js "a"), (c .super [.lit .null], .null),
    (c .super [.lit (.bool true)], .bool false), (c .super [lst [int 1, str "a"]], jl [j 2, js "b"]),
    (c .super [.min (.num (.integer ⟨3, by decide⟩))], j 1),
    (c .super [.or [(0, int 1), (0, str "a")]], j 5), (c .super [.or [(0, int 1), (0, str "a")]], js "b"),
    (c .super [.or [(0, int 1), (0, str "a")]], .bool true),
    (c .super [.meet .integer (.min (.num (.integer ⟨3, by decide⟩)))], j 1),
    (c .super [.meet .integer (.min (.num (.integer ⟨3, by decide⟩)))], jf 15 10),
    (c .super [.or [(1, int 1), (0, flt 25 10)]], jf 15 10), (c .super [.pref 1 (str "a")], js ""),
    (c .super [mp [("a", .pref 1 (int 1))]], jm [("a", j 2)]),
    (c .super [mp [("a", .pref 1 (int 1))]], jm [("a", jf 15 10)]),
    (c .super [.string], j 1), (c .super [lst [int 1]], jl [j 2, j 3]),
    (c .super [.map [("a", false, int 1)] none true], jm [("a", j 2), ("b", j 3)]),
    (c .super [.ride .hide (int 1) []], j 2), (c .super [.ride .metadata (int 1) []], j 2),
    (c .super [c .super [int 1]], jf 15 10), (c .super [c .add [int 1, int 2]], j 7),
    (c .super [.any], j 1), (c .super [dec 15 1], jdec 25 1), (c .super [flt 15 10], j 2),
    (c .super [], j 1), (c .super [int 1, int 2], j 1),
    (c .split [str "a,,b", str ","], jl [js "a", js "", js "b"]),
    (c .split [str "a,,b", str ","], jl [js "a", js "b"]),
    (c .split [str "abc", str ""], jl [js "a", js "b", js "c"]), (c .split [str "abc", str ","], jl [js "abc"]),
    (c .split [str "", str ","], jl [js ""]), (c .split [str "", str ""], jl []),
    (c .split [str "a--b", str "--"], jl [js "a", js "b"]), (c .split [str "aaa", str "aa"], jl [js "", js "a"]),
    (c .split [str "a😀b", str ""], jl [js "a", js "😀", js "b"]),
    (c .split [str ",a,", str ","], jl [js "", js "a", js ""]),
    (c .split [str "aababc", str "abc"], jl [js "aab", js ""]),
    (c .split [str "é,😀", str ","], jl [js "é", js "😀"]),
    (c .split [str "a,b", str ","], jl [js "a", js "b", js "c"]),
    (c .split [int 1, str ","], jl [js "1"]), (c .split [str "a", int 1], jl [js "a"]),
    (c .split [str "a", .string], jl [js "a"]),
    (c .split [.ride .metadata (str "a,b") [], str ","], jl [js "a", js "b"]),
    (c .split [str "a,b", .ride .metadata (str ",") []], jl [js "a", js "b"]),
    (c .split [.pref 1 (str "a,b"), str ","], jl [js "a", js "b"]),
    (c .split [str "a,b", .pref 1 (str ",")], jl [js "a", js "b"]),
    (c .split [str "a"], jl [js "a"]), (c .split [str "a", str ",", str ","], jl [js "a"]),
    (c .join [c .split [str "a,,b", str ","], str ","], js "a,,b"),
    (c .split [c .upper [str "a-b"], str "-"], jl [js "A", js "B"]),
    (c .rep [str "a1b1", str "1", str "_"], js "a_b_"),
    (c .rep [str "a1b1", str "1", str "_"], js "a_b1"),
    (c .rep [str "aaa", str "aa", str "-"], js "-a"),
    (c .rep [str "abc", str "", str "-"], js "-a-b-c-"),
    (c .rep [str "", str "", str "-"], js "-"), (c .rep [str "", str "x", str "-"], js ""),
    (c .rep [str "abc", str "x", str "-"], js "abc"),
    (c .rep [str "a😀b", str "", str "-"], js "-a-😀-b-"),
    (c .rep [str "a😀b", str "😀", str "é"], js "aéb"),
    (c .rep [str "abc", str "b", str "[$&]"], js "a[b]c"),
    (c .rep [str "x-y", str "-", str "$&$&"], js "x--y"),
    (c .rep [str "abc", str "b", str "$$"], js "a$c"),
    (c .rep [str "abc", str "(b)", str "<$1>"], js "a<b>c"),
    (c .rep [str "2026-09-04", str "(2026)-(09)-(04)", str "$3/$2/$1"], js "04/09/2026"),
    (c .rep [str "abab", str "(a)(b)", str "$2$1"], js "baba"),
    (c .rep [str "abc", str "(b)", str "$10"], js "ab0c"),
    (c .rep [str "abc", str "b", str "$1"], js "a$1c"),
    (c .rep [str "abc", str "(b)", str "$2"], js "ac"),
    (c .rep [str "abc", str "b", str "$"], js "a$c"),
    (c .rep [str "abc", str "b", str "x$"], js "ax$c"),
    (c .rep [str "abc", str "b", str "$x"], js "a$xc"),
    (c .rep [str "abc", str "b", str "$0"], js "a$0c"),
    (c .rep [str "abc", str "(?<n>b)", str "-"], js "a-c"),
    (c .rep [str "abc", str "(?=b)", str "-"], js "a-bc"),
    (c .rep [str "abc", str "\\p{L}", str "-"], js "---"),
    (c .rep [str "abab", str "(a)\\1", str "-"], js "abab"),
    (c .rep [int 1, str "1", str "2"], js "2"), (c .rep [str "a", int 1, str "b"], js "a"),
    (c .rep [str "a", str "a", int 1], js "1"), (c .rep [.string, str "a", str "b"], js "b"),
    (c .rep [.ride .metadata (str "a1") [], str "1", str "_"], js "a_"),
    (c .rep [str "a1", .ride .metadata (str "1") [], str "_"], js "a_"),
    (c .rep [str "a1", str "1", .ride .metadata (str "_") []], js "a_"),
    (c .rep [.pref 1 (str "a1"), str "1", str "_"], js "a_"),
    (c .rep [str "a", str "a"], js "a"), (c .rep [str "a", str "a", str "b", str "c"], js "b"),
    (c .rep [c .upper [str "a-b"], str "-", str "_"], js "A_B"),
    (c .split [c .rep [str "a1b", str "1", str ","], str ","], jl [js "a", js "b"]),
    (c .rep [c .join [lst [str "a", str "b"], str "-"], str "-", str ""], js "ab"),
    (c .nom [str "planet_body", str "pascal"], js "PlanetBody"),
    (c .nom [str "planet_body", str "pascal"], js "planetBody"),
    (c .nom [str "planet_body", str "camel"], js "planetBody"),
    (c .nom [str "planet_body", str "snake"], js "planet_body"),
    (c .nom [str "planet_body", str "kebab"], js "planet-body"),
    (c .nom [str "planet_body", str "dot"], js "planet.body"),
    (c .nom [str "planet_body", str "path"], js "planet/body"),
    (c .nom [str "planet_body", str "upper"], js "PLANET_BODY"),
    (c .nom [str "planet_body", str "title"], js "Planet Body"),
    (c .nom [str "planet_body", str "text"], js "Planet body"),
    (c .nom [str "HTTPServer", str "snake"], js "http_server"),
    (c .nom [str "v2Api", str "kebab"], js "v-2-api"), (c .nom [str "aB1c", str "snake"], js "a_b_1_c"),
    (c .nom [str "ABc", str "snake"], js "a_bc"), (c .nom [str "aBC", str "snake"], js "a_bc"),
    (c .nom [str "x__y--z  w", str "dot"], js "x.y.z.w"), (c .nom [str "a.b/c", str "snake"], js "a_b_c"),
    (c .nom [str "_a", str "pascal"], js "A"), (c .nom [str "a1", str "camel"], js "a1"),
    (c .nom [str "Ünïcode_name", str "pascal"], js "ÜnïcodeName"),
    (c .nom [str "éA", str "snake"], js "éa"),
    (c .nom [str "user_id", str "pascal", lst [str "ID"]], js "UserID"),
    (c .nom [str "user id", str "camel", lst [str "ID"]], js "userID"),
    (c .nom [str "id_user", str "camel", lst [str "ID"]], js "idUser"),
    (c .nom [str "user_id", str "text", lst [str "ID"]], js "User ID"),
    (c .nom [str "ID_user", str "text", lst [str "ID"]], js "ID user"),
    (c .nom [str "user_id", str "pascal", lst [str "Id", str "ID"]], js "UserId"),
    (c .nom [str "user_id", str "camel", lst []], js "userId"),
    (c .nom [str "user_id"], jm [("camel", js "userId"), ("dot", js "user.id"), ("kebab", js "user-id"),
      ("pascal", js "UserId"), ("path", js "user/id"), ("snake", js "user_id"), ("text", js "User id"),
      ("title", js "User Id"), ("upper", js "USER_ID")]),
    (c .nom [str "user_id", lst [str "ID"]], jm [("camel", js "userID"), ("dot", js "user.id"),
      ("kebab", js "user-id"), ("pascal", js "UserID"), ("path", js "user/id"), ("snake", js "user_id"),
      ("text", js "User ID"), ("title", js "User ID"), ("upper", js "USER_ID")]),
    (c .nom [str "user_id"], jm [("camel", js "userId"), ("dot", js "user.id"), ("kebab", js "user-id"),
      ("pascal", js "UserId"), ("path", js "user/id"), ("snake", js "user_id"), ("text", js "User id"),
      ("title", js "User Id"), ("upper", js "USER_ID"), ("x", js "y")]),
    (c .nom [str "user_id"], jm [("camel", js "userId")]),
    (c .nom [str "user_id", lst []], jm [("camel", js "userId"), ("dot", js "user.id"), ("kebab", js "user-id"),
      ("pascal", js "UserId"), ("path", js "user/id"), ("snake", js "user_id"), ("text", js "User id"),
      ("title", js "User Id"), ("upper", js "USER_ID")]),
    (c .nom [str ""], js "a"), (c .nom [str "___"], js "a"), (c .nom [str "user_id", str "nope"], js "a"),
    (c .nom [str "user_id", lst [str "ID"], str "x"], js "a"),
    (c .nom [str "user_id", str "pascal", lst [str "id", str ""]], js "UserId"),
    (c .nom [str "user_id", str "pascal", str "ID"], js "UserID"), (c .nom [int 1], js "1"),
    (c .nom [str "user_id", int 1], js "a"), (c .nom [str "a", str "pascal", lst [int 1]], js "A"),
    (c .nom [.string], js "a"), (c .nom [.pref 1 (str "user_id"), str "pascal"], js "UserId"),
    (c .nom [.ride .metadata (str "user_id") [], str "pascal"], js "UserId"),
    (c .nom [str "user_id", .ride .metadata (str "pascal") []], js "UserId"),
    (c .nom [str "user_id", str "pascal", .ride .metadata (lst [str "ID"]) []], js "UserID"),
    (c .nom [str "user_id", str "pascal", lst [.ride .metadata (str "ID") []]], js "UserID"),
    (c .nom [], js "a"), (c .nom [str "a", str "camel", lst [], str "x"], js "a"),
    (c .nom [c .join [lst [str "user", str "id"], str "_"], str "camel"], js "userId"),
    (c .upper [c .nom [str "user_id", str "kebab"]], js "USER-ID"),
    (c (.cmp .folder) [str "src"], node "Folder" [("name", js "src")] []),
    (c (.cmp .folder) [str "src"], node "Folder" [("name", js "x")] []),
    (c (.cmp .folder) [str "src"],
      jm [("cmp", js "Folder"), ("props", jm [("name", js "src")]), ("children", jl []), ("x", j 1)]),
    (c (.cmp .folder) [str "src"], node "Folder" [("name", js "src"), ("x", j 1)] []),
    (c (.cmp .folder) [str "src"], node "Folder" [("name", js "src")] [j 1]),
    (c (.cmp .folder) [str "src"], jm []),
    (c (.cmp .folder) [mp [("name", str "src")]], node "Folder" [("name", js "src")] []),
    (c (.cmp .folder) [str "src", lst [c (.cmp .file) [str "a"]]],
      node "Folder" [("name", js "src")] [node "File" [("name", js "a")] []]),
    (c (.cmp .file) [str "f", lst [str "x"]], node "File" [("name", js "f")] [lineD "x"]),
    (c (.cmp .file) [str "f", lst [str "x", lst [str "y", c (.cmp .line) [str "z"]]]],
      node "File" [("name", js "f")] [lineD "x", lineD "y", lineD "z"]),
    (c (.cmp .line) [str ""], lineD ""), (c (.cmp .content) [str "x"], node "Content" [("src", js "x")] []),
    (c (.cmp .copyfiles) [str "assets"], node "CopyFiles" [("from", js "assets")] []),
    (c (.cmp .fragment) [str "head.ts", lst [c (.cmp .slot) [str "body"]]],
      node "Fragment" [("from", js "head.ts")] [node "Slot" [("name", js "body")] []]),
    (c (.cmp .inject) [str "routes", lst [c (.cmp .line) [str "app.use(r)"]]],
      node "Inject" [("name", js "routes")] [lineD "app.use(r)"]),
    (c (.cmp .listitems) [mp [("item", lst [int 1, int 2])], lst [c (.cmp .line) [str "x"]]],
      node "ListItems" [("item", jl [j 1, j 2])] [lineD "x"]),
    (c (.cmp .project) [], node "Project" [] []),
    (c (.cmp .project) [str "./build", lst [c (.cmp .folder) [str "src"]]],
      node "Project" [("folder", js "./build")] [node "Folder" [("name", js "src")] []]),
    (c (.cmp .project) [mp [("name", str "p")]], node "Project" [("name", js "p")] []),
    (c (.cmp .file) [mp [("name", str "f"), ("mode", int 420)]],
      node "File" [("name", js "f"), ("mode", j 420)] []),
    (c (.cmp .folder) [str "src", lst [mp [("cmp", str "File"), ("props", mp [("name", str "x")]),
        ("children", lst [])]]],
      node "Folder" [("name", js "src")] [node "File" [("name", js "x")] []]),
    (c (.cmp .folder) [str ""], jm []), (c (.cmp .folder) [mp []], jm []),
    (c (.cmp .folder) [mp [("name", str "src"), ("x", int 1)]], jm []),
    (c (.cmp .project) [mp [("folder", str "")]], jm []),
    (c (.cmp .listitems) [mp [("item", str "x")]], jm []), (c (.cmp .listitems) [mp []], jm []),
    (c (.cmp .listitems) [str "x"], jm []),
    (c (.cmp .folder) [str "src", lst [str "x"]], jm []),
    (c (.cmp .folder) [str "src", lst [c (.cmp .line) [str "x"]]], jm []),
    (c (.cmp .folder) [str "src", lst [mp [("cmp", str "Nope")]]], jm []),
    (c (.cmp .folder) [str "src", str "x"], jm []), (c (.cmp .folder) [int 1], jm []),
    (c (.cmp .folder) [.pref 1 (str "src")], jm []),
    (c (.cmp .folder) [str "src", lst [.pref 1 (str "x")]], jm []),
    (c (.cmp .folder) [mp [("name", .string)]], jm []),
    (c (.cmp .folder) [.ride .metadata (str "src") []], node "Folder" [("name", js "src")] []),
    (c (.cmp .folder) [mp [("name", .ride .metadata (str "src") [])]], node "Folder" [("name", js "src")] []),
    (c (.cmp .folder) [str "src", .ride .metadata (lst [c (.cmp .file) [str "x"]]) []],
      node "Folder" [("name", js "src")] [node "File" [("name", js "x")] []]),
    (c (.cmp .folder) [], jm []), (c (.cmp .content) [str "x", lst []], jm []),
    (c (.cmp .folder) [str "a", lst [], int 1], jm []),
    (c .upper [c (.cmp .folder) [str "src"]], js "SRC"),
    (c (.cmp .folder) [c .join [lst [str "s", str "rc"], str ""]], node "Folder" [("name", js "src")] []),
    (c .each [lst [int 1, int 2], .hole], jl [j 1, j 2]), (c .each [lst [int 1, int 2], .hole], jl [j 1, j 3]),
    (c .each [lst [int 1, int 2], .hole], jl [j 1, j 2, j 3]), (c .each [lst [int 1, int 2], .hole], jl [j 1]),
    (c .each [mp [("b", int 2), ("a", int 1)], .hole], jl [j 1, j 2]),
    (c .each [lst [str "x", str "y"], c .upper [.hole]], jl [js "X", js "Y"]),
    (c .each [lst [int 1, int 2], mp [("v", .hole)]], jl [jm [("v", j 1)], jm [("v", j 2)]]),
    (c .each [lst [mp [("p", int 1)]], .meet .hole (mp [("q", int 2)])], jl [jm [("p", j 1), ("q", j 2)]]),
    (c .each [lst [mp [("p", int 1)]], mp [("q", int 2)]], jl [jm [("q", j 2)]]),
    (c .each [lst [mp [("p", int 1)]], mp [("q", int 2)]], jl [jm [("p", j 1), ("q", j 2)]]),
    (c .each [lst [int 1, int 2], int 7], jl [j 7, j 7]),
    (c .each [lst [], .hole], jl []), (c .each [mp [], .hole], jl []),
    (c .each [str "x", .hole], jl []), (c .each [int 1, .hole], jl []), (c .each [.listKind, .hole], jl []),
    (c .each [.pref 1 (lst [int 1]), .hole], jl [j 1]),
    (c .each [.map [("a", true, int 1), ("b", false, int 2)] none false, .hole], jl [j 1, j 2]),
    (c .each [lst [lst [int 1, int 2], lst [int 3]], c .each [.hole, p .hole (int 1)]],
      jl [jl [j 2, j 3], jl [j 4]]),
    (c .each [lst [int 1, int 2], .meet .hole .string], jl [j 1, j 2]),
    (c .each [lst [int 1, int 2], p .hole (int 1)], jl [j 2, j 3]),
    (c .join [c .each [c .split [str "index-build", str "-"], c .upper [.hole]], str "_"], js "INDEX_BUILD"),
    (c .each [.ride .metadata (lst [int 1]) [], .hole], jl [j 1]),
    (c .each [lst [.ride .metadata (int 1) []], .hole], jl [j 1]),
    (c .each [mp [("b", mp [("x", int 1)]), ("a", mp [("x", int 2)])], .meet .hole (mp [("y", int 3)])],
      jl [jm [("x", j 2), ("y", j 3)], jm [("x", j 1), ("y", j 3)]]),
    (c .each [lst [int 1], lst [.hole, .hole]], jl [jl [j 1, j 1]]),
    (c .each [lst [.or [(1, int 1), (0, int 2)]], .hole], jl [j 1]),
    (c .each [lst [int 1, int 2], .pref 1 .hole], jl [j 1, j 2]),
    (c .each [lst [int 1], c .each [lst [int 2], .hole]], jl [jl [j 2]]),
    (c .each [lst [int 1, int 2]], jl []), (c .each [lst [int 1, int 2], .hole, int 3], jl [])]

set_option maxRecDepth 8192 in
set_option exponentiation.threshold 2200 in
theorem callCases_checkable : ∀ c ∈ callCases, (vetDoc c).1.CheckableA := by decide

theorem call_verdict_exact : ∀ c ∈ callCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (callCases_checkable c hc)) v

/-- Whether a row whose call converts case reads ASCII only, the letters
on which the oracle's host and every engine's case conversion agree. -/
def asciiCase (src : String) : Bool :=
  ((src.splitOn "upper(").length == 1 && (src.splitOn "lower(").length == 1) ||
    src.all (·.toNat < 128)

/-- The terms directly inside a term. -/
def Aontu.Val.kids : Val → List Val
  | .len c | .must c _ | .pref _ c | .ride _ c _ => [c]
  | .map fs sp _ => fs.map (fun f => f.2.2) ++ sp.toList
  | .list items sp _ => items ++ sp.toList
  | .or arms => arms.map (fun a => a.2)
  | .meet a b | .contains a b | .filter a b => [a, b]
  | .nof n cs => n :: cs
  | .when c t e => c :: t :: e.toList
  | .rest t cs => t :: cs.flatMap fun c => c.1.toList ++ c.2.1.toList ++ c.2.2.toList
  | .select s arms d => s :: (arms.flatMap fun a => [a.1, a.2]) ++ d.toList
  | .call _ args => args
  | _ => []

/-- Every term inside a term, the term itself first. -/
partial def Aontu.Val.subterms (v : Val) : List Val := v :: v.kids.flatMap Aontu.Val.subterms

/-- Patterns the reference puts outside the subset, which every engine
refuses: a named group, a lookahead, a Unicode property and a
backreference. -/
def outsideSubset : List String := ["(?<n>b)", "(?=b)", "\\p{L}", "(a)\\1"]

/-- Whether the oracle's host reads a pattern as every engine does: a
fixed pattern, or one outside the subset. -/
def hostReadsPattern (q : String) : Bool := (fixedPieces q).isSome || outsideSubset.contains q

/-- Whether every pattern a term hands the host's regex engine is one
the oracle's host reads as every engine does: `rep`'s, which must be a
literal for the oracle to see it, and `split`'s at `re(p)`. -/
def hostReads (v : Val) : Bool :=
  v.subterms.all fun
    | .call .rep (_ :: q :: _) => match q.unride with
      | .lit (.str q) => hostReadsPattern q
      | .lit _ | .re _ | .pref _ _ | .string | .number | .integer => true
      | _ => false
    | .call .split [_, sep] => match sep.unride with
      | .re q => hostReadsPattern q
      | _ => true
    | _ => true

/-- A vet document whose one field is a call that reads to a term the
checker can read reads to one itself. -/
theorem readR_call_checkableA {t : Val}
    (h : ∀ k, (resolveD [] none (stepped (some []) (.seg (.key "v"))) (expandF [] k t)).CheckableA) :
    (Decls.readR [] (.map [("v", false, t)] none false)).CheckableA := by
  have hm : ∀ u, (resolveD [] none (stepped (some []) (.seg (.key "v"))) u).CheckableA →
      (resolveD [] none (some []) (.map [("v", false, u)] none false)).CheckableA := by
    intro u hu
    simp only [resolveD, resolveFields, resolveSpread]
    exact .map (fun k o w hw => by simp at hw; obtain ⟨-, -, rfl⟩ := hw; exact hu)
      (fun _ hs => by cases hs)
  have : ∀ n, (resolveD [] none (some []) (expandF [] n (.map [("v", false, t)] none false))).CheckableA := by
    intro n
    cases n with
    | zero => simpa [expandF] using hm t (by simpa [expandF] using h 0)
    | succ k => simp only [expandF, List.map, Option.map]; exact hm _ (h k)
  exact this _

/-- Calls handed a pattern, `re(p)`, which the checker cannot read as a
term: `split` at a pattern, rows v0 on in `def-call.tsv`, and `rep`
handed one as its pattern, which it refuses, since its pattern is a
string. The patterns are fixed text, with groups, or outside the
subset, and none splits the empty text (#447). Neither call waits, so
each reads to a term the checker can read, and `vet` is `Vet` on it. -/
def patternCases : List (Val × Data) :=
  let str (s : String) : Val := .lit (.str s)
  let js (s : String) : Data := .str s
  let jl (xs : List Data) : Data := .list xs
  ([(str "a1b1c", "1", jl [js "a", js "b", js "c"]), (str "a1b1c", "1", jl [js "a1b1c"]),
      (str "1a1", "1", jl [js "", js "a", js ""]), (str "a11b", "1", jl [js "a", js "", js "b"]),
      (str "aaa", "aa", jl [js "", js "a"]), (str "ab", "", jl [js "a", js "b"]),
      (str "a😀b", "", jl [js "a", js "😀", js "b"]), (str "abc", "x", jl [js "abc"]),
      (str "aXbXc", "(X)", jl [js "a", js "b", js "c"]), (str "abc", "(?<n>b)", jl [js "a", js "c"]),
      (.ride .metadata (str "a1b") [], "1", jl [js "a", js "b"]),
      (.integer, "1", jl [js "1"])].map fun (s, p, d) => (.call .split [s, .re p], d)) ++
    [(.call .rep [str "a", .re "a", str "b"], js "b")]

theorem patternCases_readable : ∀ c ∈ patternCases, (Decls.readR [] (vetDoc c).1).CheckableA := by
  intro c hc
  rcases List.mem_append.mp hc with h | h
  · obtain ⟨⟨s, p, d⟩, _, rfl⟩ := List.mem_map.mp h
    exact readR_call_checkableA resolveD_expandF_split
  · rcases List.mem_singleton.mp h with rfl
    exact readR_call_checkableA resolveD_expandF_rep

theorem pattern_verdict_exact : ∀ c ∈ patternCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil)) (patternCases_readable c hc) v

/-- A `filter` whose condition holds the hole, its condition read for
each member it tries: over a list and a map, a call on the member, a
meet with it and a disjunction beside it, the hole alone, and a member
the call does not take. Each source is data, so it generates, and each
`filter` reads to the members it admits, which the checker can read
whatever host converts the case. -/
def filterSources : List (Data × Val × Data) :=
  let s (t : String) : Data := .str t
  let n (i : ℤ) (h : IntegerLeaf i := by decide) : Data := .integer i h
  let up : Val := .call .upper [.hole]
  let twice : Val := .call .mul [.hole, .lit (.num (.integer ⟨2, by decide⟩))]
  [(.list [s "A", s "b"], up, .list [s "A"]), (.list [s "A", s "b"], up, .list []),
    (.list [s "A", s "b"], .meet .hole up, .list [s "A"]),
    (.map [("a", s "A"), ("b", s "b")], up, .map [("a", s "A")]),
    (.list [s "a", s "B"], .call .lower [.hole], .list [s "a"]),
    (.list [s "A", s "b"], .or [(0, up), (0, .lit (.str "b"))], .list [s "A", s "b"]),
    (.list [n 1, n 2], .hole, .list [n 1, n 2]),
    (.list [.map [("n", s "A")], .map [("n", s "b")]], .map [("n", false, up)] none false, .list []),
    (.list [n 0, n 1, n 2], twice, .list [n 0]), (.map [("a", n 0), ("b", n 1)], twice, .map [("a", n 0)])]

def filterCases : List (Val × Data) := filterSources.map fun (j, t, d) => (.filter j.term t, d)

theorem filterSources_generate : ∀ x ∈ filterSources,
    (genD [] (resolveD [] none (stepped (some []) (.seg (.key "v"))) x.1.term)).isSome := by
  decide

theorem filterCases_readable : ∀ c ∈ filterCases, (Decls.readR [] (vetDoc c).1).CheckableA := by
  intro c hc
  obtain ⟨⟨j, t, d⟩, hm, rfl⟩ := List.mem_map.mp hc
  have hj := filterSources_generate _ hm
  refine readR_call_checkableA fun k => ?_
  cases k with
  | zero => exact resolveD_filter_checkableA hj
  | succ k =>
    simp only [expandF, expandF_term]
    exact resolveD_filter_checkableA hj

/-- A `filter` in an `each` template binds its own hole, and its source
reads the template's member. The condition is arithmetic, so the reading
is decided whole. -/
def filterEachCases : List (Val × Data) :=
  let int (i : ℤ) (h : IntegerLeaf i := by decide) : Val := .lit (.num (.integer ⟨i, h⟩))
  let j (i : ℤ) (h : IntegerLeaf i := by decide) : Data := .integer i h
  let lst (xs : List Val) : Val := .list xs none false
  [(.call .each [lst [lst [int 0, int 1], lst [int 2]], .filter .hole (.call .mul [.hole, int 2])],
      .list [.list [j 0], .list []])]

set_option maxRecDepth 8192 in
theorem filterEachCases_readable : ∀ c ∈ filterEachCases, (Decls.readR [] (vetDoc c).1).CheckableA := by
  decide

theorem filter_verdict_exact : ∀ c ∈ filterCases ++ filterEachCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v := by
  intro c hc _ v
  have hr : (Decls.readR [] (vetDoc c).1).CheckableA := by
    rcases List.mem_append.mp hc with h | h
    · exact filterCases_readable c h
    · exact filterEachCases_readable c h
  exact vet_iff (fun _ h => absurd h (List.not_mem_nil)) hr v

/-- A call reads none of a bag's optional members whose value generates
an empty map or list (decision 19 of the design note's §7), so `sum`
adds the others and `each` and `join` skip it. An optional member whose
value generates more stays. -/
def optionalCases : List (Val × Data) :=
  let int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))
  let j (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .integer n h
  let c (f : Fn) (args : List Val) : Val := .call f args
  let mp (fs : List (String × Bool × Val)) : Val := .map fs none false
  let lst (xs : List Val) : Val := .list xs none false
  let str (s : String) : Val := .lit (.str s)
  [(c .sum [mp [("a", true, mp []), ("b", false, int 2)]], j 2),
    (c .sum [mp [("a", true, lst []), ("b", false, int 2)]], j 2),
    (c .sum [mp [("a", true, .or [(1, lst []), (0, lst [int 1])]), ("b", false, int 2)]], j 2),
    (c .each [mp [("a", true, mp []), ("b", false, int 1)], .hole], .list [j 1]),
    (c .each [mp [("a", true, mp [("b", true, .integer)]), ("c", false, int 1)], .hole], .list [j 1]),
    (c .each [mp [("a", true, mp [("b", false, int 1)]), ("c", false, int 2)], .hole],
      .list [.map [("b", j 1)], j 2]),
    (c .each [mp [("a", true, .or [(1, lst [int 1]), (0, lst [])]), ("b", false, int 2)], .hole],
      .list [.list [j 1], j 2]),
    (c .join [mp [("a", true, lst []), ("b", false, str "x")], str "-"], .str "x")]

theorem optionalCases_checkable : ∀ c ∈ optionalCases, (vetDoc c).1.CheckableA := by decide

theorem optional_verdict_exact : ∀ c ∈ optionalCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (optionalCases_checkable c hc)) v

/-- A replacement is read against its pattern's groups before the text
is scanned (decision 20 of the design note's §7), so one that names a
group the pattern lacks, a `$0`, a lone `$` or a `$` before a letter is
an error over a text with no match too, the empty text among them, and
one that names only what the pattern has leaves such a text as it is. -/
def repSubCases : List (Val × Data) :=
  let str (s : String) : Val := .lit (.str s)
  let rep (t p r : String) : Val := .call .rep [str t, str p, str r]
  [(rep "abc" "x" "$9", .str "abc"), (rep "abc" "x" "$", .str "abc"),
    (rep "abc" "x" "x$", .str "abc"), (rep "abc" "x" "$x", .str "abc"),
    (rep "abc" "x" "$0", .str "abc"), (rep "abc" "x" "$1", .str "abc"),
    (rep "abc" "(x)" "$2", .str "abc"), (rep "" "a" "$1", .str ""),
    (rep "abc" "(x)" "$1", .str "abc"), (rep "abc" "(x)(y)" "$2$1", .str "abc"),
    (rep "abc" "x" "$$$&", .str "abc"), (rep "" "(a)" "[$1]", .str "")]

theorem repSubCases_checkable : ∀ c ∈ repSubCases, (vetDoc c).1.CheckableA := by decide

theorem repSub_verdict_exact : ∀ c ∈ repSubCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (repSubCases_checkable c hc)) v

/-- A projector and a direction read as their values, through a rider
or a mark, as both ports read them (#435); a lone preference stays
neither, and so does `null`, which is no absent projector. -/
def projectorCases : List (Val × Data) :=
  let int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))
  let j (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .integer n h
  let c (f : Fn) (args : List Val) : Val := .call f args
  let mp (fs : List (String × Val)) : Val := .map (fs.map fun m => (m.1, false, m.2)) none false
  let lst (xs : List Val) : Val := .list xs none false
  let str (s : String) : Val := .lit (.str s)
  let rd (v : Val) : Val := .ride .metadata v []
  [(c .pick [lst [mp [("a", int 1)]], rd (str "a")], .list [j 1]),
    (c .pick [lst [lst [int 9, int 8]], rd (int 1)], .list [j 8]),
    (c .pick [lst [mp [("a", int 1)]], .ride .type (str "a") []], .list [j 1]),
    (c .sort [lst [mp [("n", int 2)], mp [("n", int 1)]], rd (str "n")],
      .list [.map [("n", j 1)], .map [("n", j 2)]]),
    (c .sort [lst [int 1, int 2], rd (str ""), str "desc"], .list [j 2, j 1]),
    (c .sort [lst [int 1, int 2], str "", rd (str "desc")], .list [j 2, j 1]),
    (c .sort [lst [int 1, int 2], str "", .ride .type (str "desc") []], .list [j 2, j 1]),
    (c .sort [lst [int 1, int 2], str "", .pref 1 (str "desc")], .list [j 2, j 1]),
    (c .sort [lst [int 2, int 1], .lit .null], .list [j 1, j 2]),
    (c .sort [lst [int 2, int 1], rd (.lit .null)], .list [j 1, j 2])]

theorem projectorCases_checkable : ∀ c ∈ projectorCases, (vetDoc c).1.CheckableA := by decide

theorem projector_verdict_exact : ∀ c ∈ projectorCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (projectorCases_checkable c hc)) v

/-- A string names a list member's index by its digits after one
optional sign and by nothing else, so a space, a point, an exponent or
a hexadecimal prefix names none, and `""` names no key in `pick`, as
both ports read them (#437). -/
def indexCases : List (Val × Data) :=
  let int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))
  let j (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .integer n h
  let c (f : Fn) (args : List Val) : Val := .call f args
  let lst (xs : List Val) : Val := .list xs none false
  let str (s : String) : Val := .lit (.str s)
  let ab : Val := lst [lst [int 1, int 2]]
  [(c .pick [ab, str "+1"], .list [j 2]), (c .pick [ab, str " 0"], .list [j 1]),
    (c .pick [ab, str "0 "], .list [j 1]), (c .pick [ab, str "1.0"], .list [j 2]),
    (c .pick [ab, str "1e0"], .list [j 2]), (c .pick [ab, str "0x1"], .list [j 2]),
    (c .pick [ab, str ""], .list [j 1]),
    (c .pick [lst [.map [("", false, int 1)] none false], str ""], .list [j 1]),
    (c .sort [lst [lst [int 2], lst [int 1]], str "0"], .list [.list [j 1], .list [j 2]]),
    (c .sort [lst [lst [int 2], lst [int 1]], str " 0"], .list [.list [j 1], .list [j 2]])]

theorem indexCases_checkable : ∀ c ∈ indexCases, (vetDoc c).1.CheckableA := by decide

theorem index_verdict_exact : ∀ c ∈ indexCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (indexCases_checkable c hc)) v

/-- A range in `translate`'s `to` through the surrogate block writes
U+FFFD for each surrogate it names, as both ports write it (#442). -/
def surrogateCases : List (Val × Data) :=
  let c (f : Fn) (args : List Val) : Val := .call f args
  let str (s : String) : Val := .lit (.str s)
  [(c .translate [str "b", str "a-b", str "\uD7FF-\uE000"], .str "\uFFFD"),
    (c .translate [str "abc", str "a-c", str "\uD7FF-\uE000"], .str "\uD7FF\uFFFD\uFFFD"),
    (c .translate [str "z", str "a-z", str "\uD7FF-\uE000"], .str "\uFFFD")]

theorem surrogateCases_checkable : ∀ c ∈ surrogateCases, (vetDoc c).1.CheckableA := by decide

theorem surrogate_verdict_exact : ∀ c ∈ surrogateCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (surrogateCases_checkable c hc)) v

/-- The generator `pack`: the open map of its template read for each
member of its data under the member's key, a list's strings each its
own key and a map's keys theirs; the hole kept, met and left out; a
map member skipped as a fold skips it; a key a list repeats made once,
its instances met;
a list holding anything but a string, and data that is no bag. No
template holds `key()`, which waits on `key()` at any position. -/
def packCases : List (Val × Data) :=
  let int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))
  let j (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .integer n h
  let c (f : Fn) (args : List Val) : Val := .call f args
  let mp (fs : List (String × Val)) : Val := .map (fs.map fun m => (m.1, false, m.2)) none false
  let lst (xs : List Val) : Val := .list xs none false
  let str (s : String) : Val := .lit (.str s)
  let js (s : String) : Data := .str s
  let jm (fs : List (String × Data)) : Data := .map fs
  [(c .pack [lst [str "a", str "b"], mp [("x", .hole)]], jm [("a", jm [("x", js "a")]), ("b", jm [("x", js "b")])]),
    (c .pack [mp [("p", int 1), ("q", int 2)], .meet .hole .integer], jm [("p", j 1), ("q", j 2)]),
    (c .pack [mp [("p", int 1), ("q", int 2)], .hole], jm [("p", j 1), ("q", j 2)]),
    (c .pack [mp [("p", int 1), ("q", int 2)], mp [("n", .hole)]],
      jm [("p", jm [("n", j 1)]), ("q", jm [("n", j 2)])]),
    (c .pack [lst [], mp [("x", int 1)]], jm []), (c .pack [mp [], mp [("x", int 1)]], jm []),
    (c .pack [lst [int 1], mp [("x", int 1)]], jm []), (c .pack [str "a", mp [("x", int 1)]], jm []),
    (c .pack [lst [str "a", str "a"], mp [("x", .hole)]], jm [("a", jm [("x", js "a")])]),
    (c .pack [lst [str "b", str "a"], int 1], jm [("a", j 1), ("b", j 1)]),
    (c .pack [mp [("p", int 1), ("q", .ride .hide (int 2) [])], .hole], jm [("p", j 1)]),
    (c .pack [.map [("p", false, int 1), ("q", true, .integer)] none false, .hole], jm [("p", j 1)]),
    (c .pack [.map [("p", false, int 1), ("q", true, mp [])] none false, .hole], jm [("p", j 1)]),
    (c .pack [lst [str "a"], c .upper [.hole]], jm [("a", js "A")]),
    (c .pack [lst [str "a"], mp [("x", int 1)]], jm [("a", jm [("x", j 1)]), ("b", j 2)]),
    (c .pack [mp [("p", lst [int 1, int 2])], c .each [.hole, .meet .hole .integer]],
      jm [("p", .list [j 1, j 2])]),
    (c .pack [lst [str "a", str "b"], .pref 1 (int 1)], jm [("a", j 1), ("b", j 1)]),
    (c .pack [lst [.pref 1 (str "a")], int 1], jm [("a", j 1)]),
    (c .pack [lst [.ride .metadata (str "a") []], int 1], jm [("a", j 1)])]

theorem packCases_checkable : ∀ c ∈ packCases, (vetDoc c).1.CheckableA := by decide

theorem pack_verdict_exact : ∀ c ∈ packCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (packCases_checkable c hc)) v

/-- `key(n)` read where it stands: at a key and at an index, at its
levels to the top and past it, under a meet, a call, a rider and a
disjunction, and where the fill writes it; in a template, the member's
key or index and the levels above the call, through nested generators;
at a spread's own position, the key the spread reads and the levels
above it. -/
def keyUpCases : List (Val × Data) :=
  let int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))
  let j (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .integer n h
  let c (f : Fn) (args : List Val) : Val := .call f args
  let mp (fs : List (String × Val)) : Val := .map (fs.map fun m => (m.1, false, m.2)) none false
  let lst (xs : List Val) : Val := .list xs none false
  let str (s : String) : Val := .lit (.str s)
  let js (s : String) : Data := .str s
  let jm (fs : List (String × Data)) : Data := .map fs
  let jl (xs : List Data) : Data := .list xs
  let k (n : ℤ) : Val := .keyUp n
  [(k 0, js "v"), (k 0, js "x"), (k 1, js ""), (k 2, js ""), (k (-1), js ""),
    (mp [("a", k 1)], jm [("a", js "v")]), (mp [("a", k 0)], jm [("a", js "a")]),
    (mp [("a", k 0)], jm []),
    (mp [("a", mp [("b", k 1)])], jm [("a", jm [("b", js "a")])]),
    (mp [("a", mp [("b", k 2)])], jm [("a", jm [("b", js "v")])]),
    (mp [("a", mp [("b", k 2)])], jm [("a", jm [("b", js "a")])]),
    (mp [("a", mp [("b", k 3)])], jm [("a", jm [("b", js "")])]),
    (lst [k 0, k 1], jl [js "0", js "v"]),
    (lst [mp [("x", k 1)], mp [("x", k 1)]], jl [jm [("x", js "0")], jm [("x", js "1")]]),
    (mp [("a", c .upper [k 0])], jm [("a", js "A")]),
    (mp [("a", c .plus [str "x-", k 0])], jm [("a", js "x-a")]),
    (mp [("a", .meet (k 0) .string)], jm [("a", js "a")]),
    (mp [("a", .ride .metadata (k 0) [("t", j 1)])], jm [("a", js "a")]),
    (mp [("a", .or [(0, k 0), (0, str "x")])], jm [("a", js "a")]),
    (mp [("a", .or [(0, k 0), (0, str "x")])], jm [("a", js "y")]),
    (c .pack [lst [str "web", str "auth"], mp [("n", k 1), ("t", k 2)]],
      jm [("auth", jm [("n", js "auth"), ("t", js "v")]), ("web", jm [("n", js "web"), ("t", js "v")])]),
    (c .pack [lst [str "a"], k 0], jm [("a", js "a")]),
    (c .pack [lst [str "a"], c .plus [str "acme/", k 0]], jm [("a", js "acme/a")]),
    (c .each [lst [str "p", str "q"], mp [("k", k 1)]], jl [jm [("k", js "0")], jm [("k", js "1")]]),
    (c .each [lst [str "p", str "q"], k 0], jl [js "0", js "1"]),
    (c .each [mp [("b", int 1), ("a", int 2)], mp [("k", k 1), ("v", .hole)]],
      jl [jm [("k", js "0"), ("v", j 2)], jm [("k", js "1"), ("v", j 1)]]),
    (c .pack [lst [str "a"], mp [("i", c .pack [lst [str "b"], mp [("x", k 1), ("y", k 2), ("z", k 3)]])]],
      jm [("a", jm [("i", jm [("b", jm [("x", js "b"), ("y", js "i"), ("z", js "a")])])])]),
    (c .pack [lst [str "a"], mp [("i", c .each [lst [str "b"], mp [("x", k 1), ("w", k 4)]])]],
      jm [("a", jm [("i", jl [jm [("x", js "0"), ("w", js "v")]])])]),
    (c .each [lst [int 1, int 2], lst [k 0, k 1]], jl [jl [js "0", js "0"], jl [js "0", js "1"]]),
    (.map [("c", false, .string)] (some (k 1)) false, jm [("c", js "v")]),
    (.map [("c", false, .string)] (some (k 0)) false, jm [("c", js "c")]),
    (mp [("s", .map [("c", false, .string)] (some (k 1)) false)], jm [("s", jm [("c", js "s")])]),
    (.list [] (some (k 1)) false, jl [js "v", js "v"]),
    (c .pack [lst [str "a"], .map [("q", false, .string)] (some (k 1)) false], jm [("a", jm [("q", js "a")])]),
    (c .pack [lst [str "a"], .map [("q", false, .string)] (some (k 0)) false], jm [("a", jm [("q", js "q")])])]

theorem keyUpCases_checkable : ∀ c ∈ keyUpCases, (vetDoc c).1.CheckableA := by decide

/-- A `filter`'s condition holding `key(n)`, read where each member it
tries lands: under a map member's key, and at the index a list member
takes among those kept. -/
def keyUpFilterCases : List (Val × Data) :=
  let mp (fs : List (String × Val)) : Val := .map (fs.map fun m => (m.1, false, m.2)) none false
  let lst (xs : List Val) : Val := .list xs none false
  let str (s : String) : Val := .lit (.str s)
  let js (s : String) : Data := .str s
  [(.filter (mp [("a", str "a"), ("b", str "c")]) (.keyUp 0), .map [("a", js "a")]),
    (.filter (lst [str "x", str "0", str "1"]) (.keyUp 0), .list [js "0", js "1"]),
    (.filter (lst [str "0", str "b", str "2"]) (.keyUp 0), .list [js "0"]),
    (.filter (mp [("a", mp [("n", str "a")]), ("b", mp [("n", str "c")])]) (mp [("n", .keyUp 1)]),
      .map [("a", .map [("n", js "a")])])]

set_option maxRecDepth 8192 in
theorem keyUpFilterCases_readable : ∀ c ∈ keyUpFilterCases, (Decls.readR [] (vetDoc c).1).CheckableA := by
  decide

theorem keyUp_verdict_exact : ∀ c ∈ keyUpCases ++ keyUpFilterCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v := by
  intro c hc _ v
  have hr : (Decls.readR [] (vetDoc c).1).CheckableA := by
    rcases List.mem_append.mp hc with h | h
    · exact readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (keyUpCases_checkable c h)
    · exact keyUpFilterCases_readable c h
  exact vet_iff (fun _ h => absurd h (List.not_mem_nil)) hr v

/-! ## Variables

A variable is a name the calling program declares. Both runners bind the
same variables for every row, `specVars` in `go/spec_test.go` and
`makeVarsCtx` in `ts/test/spec.test.ts`, and a `gens` row reads them. -/

/-- The runners' bindings, as the calling program makes them: data,
each as its term, and the kind `integer`, since a binding is any value. -/
def progVars : List (String × Val) :=
  (([("foo", .integer 11), ("bar", .str "hello"), ("flag", .bool true), ("obj", .map [("x", .integer 1)]),
    ("big", .integer 1152921504606846976), ("half", .num (.float (.dyadic 3 (-1)))),
    ("off", .bool false), ("bigi", .num (.biginteger ⟨5⟩)), ("bigd", .num (.bigdecimal (.of 15 1))),
    ("nul", .null), ("PARENT", .str "q")] : List (String × Data)).map fun v => (v.1, v.2.term)) ++
    [("kint", .integer)]

/-- The declarations the bindings make, beside a document that declares none. -/
def progDecls : Decls := Decls.withVars [] progVars

/-- Variables read as the values the program binds: each binding alone,
met with a kind, a map and itself, in a list and a map, in a call, as a
default, and as the data a generator reads, and a kind the program binds
met with a number. A float, a big integer and a big decimal bind too,
and have no row, since `Data.json` writes no number but an integer. -/
def varCases : List Val :=
  let int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))
  let mp (fs : List (String × Val)) : Val := .map (fs.map fun m => (m.1, false, m.2)) none false
  let lst (xs : List Val) : Val := .list xs none false
  let v (n : String) : Val := .var n
  [v "foo", v "bar", v "flag", v "obj", v "big", v "off", v "nul", v "PARENT",
    .meet (v "foo") .integer, .meet (v "foo") .number, .meet (v "big") .integer,
    .meet (v "obj") .mapKind, .meet (v "obj") (mp [("y", int 2)]), .meet (v "foo") (v "foo"),
    lst [v "foo", v "bar"], mp [("a", v "foo"), ("b", v "foo")],
    .call .plus [v "foo", int 1], .call .upper [v "bar"], .or [(1, v "foo"), (0, int 1)],
    .call .pack [lst [v "PARENT"], mp [("n", .hole)]],
    .meet (v "kint") (v "foo"), .meet (v "kint") (int 2)]

set_option maxRecDepth 16384 in
theorem varCases_readable : progDecls.guardedB = true ∧ progDecls.bodiesCheckableB = true ∧
    ∀ t ∈ varCases, (normaliseD progDecls (progDecls.readR (docOf t))).checkableAB = true := by decide

/-- What each case generates is the definition's output under the
program's declarations, by `outputD_iff`. -/
theorem var_output_exact : ∀ t ∈ varCases, ∀ (root j : Data),
    outputD progDecls (progDecls.readR (docOf t)) = some j ↔
      OutputD progDecls root (progDecls.readR (docOf t)) j :=
  fun t ht _ j => outputD_iff (Decls.guardedB_iff.mp varCases_readable.1)
    (Decls.bodiesCheckableB_iff.mp varCases_readable.2.1)
    ((Val.checkableAB_iff _).mp (varCases_readable.2.2 t ht)) j

/-- Variables as a path's steps, each read as its value's text: a map
read by key and a list by the index the text spells, a variable as the
first step, and two variables in one path. -/
def varPathCases : List Val :=
  let int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))
  let mp (fs : List (String × Val)) : Val := .map (fs.map fun m => (m.1, false, m.2)) none false
  let lst (xs : List Val) : Val := .list xs none false
  let keyed (k n : String) : Val := mp [("q", mp [(k, int 3)]), ("x", .path [.key "v", .key "q", .var n])]
  [keyed "11" "foo", keyed "hello" "bar", keyed "true" "flag", keyed "false" "off",
    keyed "1152921504606846976" "big", keyed "1.5" "half", keyed "5" "bigi", keyed "1.5" "bigd",
    mp [("q", lst [int 0, int 1, int 2, int 3, int 4, int 5, int 6, int 7, int 8, int 9, int 10, int 11, int 12]),
      ("x", .path [.key "v", .key "q", .var "foo"])],
    mp [("q", lst [int 5, int 6, int 7, int 8, int 9, int 10]), ("x", .path [.key "v", .key "q", .var "bigi"])],
    mp [("q", mp [("c", int 5)]), ("a", mp [("b", .path [.key "v", .var "PARENT", .key "c"])])],
    mp [("q", mp [("hello", mp [("q", int 4)])]), ("x", .path [.key "v", .key "q", .var "bar", .var "PARENT"])]]

/-- A variable case read as the definition reads a document with paths:
placed, then its paths read as names from the schema alone. -/
def varReading (t : Val) : Decls × Val :=
  (progDecls.placed (docOf t)).1.withPathsS (progDecls.placed (docOf t)).2

set_option maxRecDepth 16384 in
theorem varPathCases_readable : ∀ t ∈ varPathCases,
    (varReading t).1.guardedB = true ∧ (varReading t).1.bodiesCheckableB = true ∧
    (normaliseD (varReading t).1 ((varReading t).1.readR (varReading t).2)).checkableAB = true := by
  decide

/-- What each case generates is the definition's output with paths
under the program's declarations, by `outputP_iff`. -/
theorem var_path_output_exact : ∀ t ∈ varPathCases, ∀ (root j : Data),
    outputP progDecls (docOf t) = some j ↔ OutputP progDecls root (docOf t) j :=
  fun t ht _ j => outputP_iff (Decls.guardedB_iff.mp (varPathCases_readable t ht).1)
    (Decls.bodiesCheckableB_iff.mp (varPathCases_readable t ht).2.1)
    ((Val.checkableAB_iff _).mp (varPathCases_readable t ht).2.2) j

/-- The `gens` rows of the variables: each case under the key `v`, with
the JSON the engines must write for it under the runners' bindings,
the cases with paths read by `outputP`. -/
def varRows (tag : String) : IO Unit := do
  let mut i := 0
  for (t, out) in varCases.map (fun t => (t, outputD progDecls (progDecls.readR (docOf t)))) ++
      varPathCases.map (fun t => (t, outputP progDecls (docOf t))) do
    let some src := t.cell | throw (IO.userError "a variable case has no text")
    match out with
    | some (.map [("v", x)]) =>
      let some json := x.json | throw (IO.userError "an output has no JSON")
      IO.println (tag ++ toString i ++ "\tgens\tv: " ++ src ++ "\t{\"v\":" ++ json ++ "}")
    | _ => throw (IO.userError s!"a variable case generates nothing: {src}")
    i := i + 1

/-- A call on a name, the name read before the call is made. -/
def callAliasCases : List (Decls × Val × Data) :=
  let int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))
  let j (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .integer n h
  [([("A", int 3)], .call .add [.alias "A", int 1], j 4),
    ([("A", int 3)], .call .add [.alias "A", int 1], j 5),
    ([("A", .integer)], .call .add [.alias "A", int 1], j 2),
    ([("L", .list [int 1, int 2, int 3] none false)], .call .sum [.alias "L"], j 6),
    ([("M", .map [("a", false, int 1), ("b", false, int 2)] none false)],
      .call .greatest [.alias "M"], j 2),
    ([("L", .list [.map [("a", false, int 1)] none false, .map [("a", false, int 2)] none false]
        none false)], .call .pick [.alias "L", .lit (.str "a")], .list [j 1, j 2]),
    ([("L", .list [int 3, int 1, int 2] none false)], .call .sort [.alias "L"], .list [j 1, j 2, j 3]),
    ([("S", .lit (.str "ab"))], .call .upper [.alias "S"], .str "AB"),
    ([("N", int 1)], .call .upper [.lit (.str "foo"), .alias "N"], .str "fOO"),
    ([("F", .lit (.str "a"))], .call .translate [.lit (.str "abc"), .alias "F", .lit (.str "x")],
      .str "xbc"),
    ([("K", .lit (.str "a"))], .call .pick [.list [.map [("a", false, int 1)] none false] none false,
      .alias "K"], .list [j 1]),
    ([("P", .lit (.str "n"))], .call .sort [.list [.map [("n", false, int 2)] none false,
      .map [("n", false, int 1)] none false] none false, .alias "P"],
      .list [.map [("n", j 1)], .map [("n", j 2)]]),
    ([("D", .lit (.str "desc"))], .call .sort [.list [int 1, int 2] none false, .lit (.str ""),
      .alias "D"], .list [j 2, j 1])]

theorem callAliasCases_checkable : ∀ c ∈ callAliasCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (aliasDoc c).1.CheckableA := by decide

theorem call_alias_verdict_exact : ∀ c ∈ callAliasCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 (aliasDoc c).1 (aliasDoc c).2 = v ↔ Vet m c.1 (aliasDoc c).1 (aliasDoc c).2 v :=
  fun c hc _ v => vet_iff (callAliasCases_checkable c hc).1
    (readR_checkableA (callAliasCases_checkable c hc).1 (callAliasCases_checkable c hc).2) v

/-! ## Path values

`path(p)` holds an address as data: it admits each address its own
opens, generates its own, and meets another by the prefix rule. The
rows read each the three ways the definition does: what it generates,
how `vet` judges data against it, and what it subsumes. No row meets a
path value with a string constraint, whose reading decision 23 of the
design note's §7 leaves open (#474). -/

/-- A path value: `path($.a.b)` from the root is `addrAt 0 ["a", "b"]`,
and `path(..a)` is `addrAt 2 ["a"]`. -/
def addrAt (up : ℕ) (steps : List String) : Val := .addr ⟨up, steps⟩

/-- Path values alone, met with each other by the prefix rule and with
`path` and `any`, in a disjunction and behind a preference, and in a
map and a list, for the `gens` rows k0 on. -/
def addrVals : List Val :=
  let mp (fs : List (String × Val)) : Val := .map (fs.map fun m => (m.1, false, m.2)) none false
  [addrAt 0 ["a"], addrAt 0 ["a", "b"], addrAt 1 ["a"], addrAt 2 ["a", "b"], addrAt 0 ["a", "0"],
    .meet (addrAt 0 ["a"]) (addrAt 0 ["a", "b"]), .meet (addrAt 0 ["a", "b"]) (addrAt 0 ["a"]),
    .meet (addrAt 1 ["a"]) (addrAt 1 ["a", "b"]), .meet (addrAt 0 ["a"]) (addrAt 0 ["a"]),
    .meet .pathKind (addrAt 0 ["a"]), .meet (addrAt 0 ["a"]) .pathKind, .meet .any (addrAt 0 ["a"]),
    .meet (.meet .pathKind (addrAt 0 ["a", "b"])) (addrAt 0 ["a"]),
    .or [(1, addrAt 0 ["a"]), (0, .pathKind)], .or [(1, addrAt 0 ["a"]), (0, addrAt 0 ["b"])],
    .meet (addrAt 0 ["a"]) (.or [(0, addrAt 0 ["a", "b"]), (0, addrAt 0 ["c"])]),
    mp [("x", addrAt 0 ["a"]), ("y", addrAt 1 ["x"])],
    .list [addrAt 0 ["a"], addrAt 2 ["b"]] none false]

theorem addrVals_checkable : ∀ v ∈ addrVals, (normalise v).Checkable := by decide

theorem addr_output_exact : ∀ v ∈ addrVals, ∀ (env : Env) (root j : Data),
    output v = some j ↔ Output env root v j :=
  fun v hv _ _ j => output_iff (addrVals_checkable v hv) j

/-- Schemas that hold a path value against data, for the `verdict` rows k0
on: a path the data leaves out, which the fill supplies, and a string
the data writes for it, which no path value admits, since no JSON text
reads as an address; `path` alone; and meets no value satisfies. -/
def addrVetCases : List (Val × Data) :=
  let x (v : Val) : Val := .map [("x", false, v)] none false
  [(x (addrAt 0 ["a"]), .map []), (addrAt 0 ["a"], .str "$.a"), (x .pathKind, .map []),
    (.pathKind, .str "$.a"), (.map [("x", true, addrAt 0 ["a"])] none false, .map []),
    (x (.meet (addrAt 0 ["a"]) (addrAt 0 ["a", "b"])), .map []),
    (x (.meet (addrAt 0 ["a"]) (addrAt 0 ["b"])), .map []),
    (x (.meet (addrAt 0 ["a"]) (.lit (.str "$.a"))), .map []),
    (x (.meet .string (addrAt 0 ["a"])), .map []),
    (x (.meet .pathKind (.lit (.num (.integer (.of 1))))), .map []),
    (x (.or [(1, addrAt 0 ["a"]), (0, .pathKind)]), .map []),
    (x (.or [(0, addrAt 0 ["a"]), (0, addrAt 0 ["b"])]), .map []),
    (x (addrAt 1 ["a"]), .map []), (addrAt 0 ["a"], .integer 1),
    (x (.meet .pathKind (addrAt 0 ["a"])), .map []),
    (x (.list [addrAt 0 ["a"], addrAt 2 ["b"]] none false), .map [])]

theorem addrVetCases_checkable : ∀ c ∈ addrVetCases, (vetDoc c).1.CheckableA := by decide

theorem addr_verdict_exact : ∀ c ∈ addrVetCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (addrVetCases_checkable c hc)) v

/-- The values the `subsumption` rows k0 on compare: path values from the
root and from a relative start, one the prefix of another, `path`,
`string`, `any` and a string that spells an address. -/
def addrSubVals : List Val :=
  [.pathKind, addrAt 0 ["a"], addrAt 0 ["a", "b"], addrAt 0 ["b"], addrAt 1 ["a"],
    addrAt 1 ["a", "b"], .string, .any, .lit (.str "$.a")]

/-- The instances that may tell two of them apart: an address for each
value, and a string. -/
def addrInstances : List Data :=
  [.addr ⟨0, ["a"]⟩, .addr ⟨0, ["a", "b"]⟩, .addr ⟨0, ["b"]⟩, .addr ⟨1, ["a"]⟩,
    .addr ⟨1, ["a", "b"]⟩, .str "$.a", .str "a"]

theorem addrSubVals_checkable : ∀ v ∈ addrSubVals, v.Checkable := by decide

theorem addrInstances_wellFormed : ∀ j ∈ addrInstances, j.WellFormed := by decide

/-- Every path `subsumption` row is the definition's, as
`subsume_rows_exact` makes the others. -/
theorem addr_subsume_rows_exact : ∀ g ∈ addrSubVals, ∀ s ∈ addrSubVals,
    ((leDecF .empty 64 s g).isSome = true → s ⊑[.empty] g) ∧
    (∀ j ∈ addrInstances, check s j = true → check g j = false → ¬ s ⊑[.empty] g) := by
  intro g hg s hs
  exact ⟨leDecF_sound, fun j hj h1 h2 =>
    not_le_of_witness (addrSubVals_checkable s hs) (addrSubVals_checkable g hg)
      (addrInstances_wellFormed j hj) h1 h2⟩

/-- `path` handed a string: its text converted to an address and met with
the capture it must equal, or with one it can't, so that the row says
which address the text spells; text that spells none, any other scalar
and a container, each refused; a string a call computes, converted once
it's settled; a preference, which only waits; and a path value, handed
back as it is, behind a rider too, where `path` alone waits. -/
def pathCallCases : List (Val × Data) :=
  let x (v : Val) : Val := .map [("x", false, v)] none false
  let str (s : String) : Val := .lit (.str s)
  let p (s : String) : Val := .call .path [str s]
  let one : Val := .lit (.num (.integer (.of 1)))
  [(x (.meet (p "$.a") (addrAt 0 ["a"])), .map []), (x (.meet (p "$.a") (addrAt 1 ["a"])), .map []),
    (x (.meet (p "a") (addrAt 1 ["a"])), .map []), (x (.meet (p "a") (addrAt 0 ["a"])), .map []),
    (x (.meet (p "a.b") (addrAt 1 ["a", "b"])), .map []), (x (.meet (p "..a") (addrAt 2 ["a"])), .map []),
    (x (.meet (p "$.0") (addrAt 0 ["0"])), .map []), (x (p "$.a-b_1"), .map []),
    (x (.meet (p "$.a") (addrAt 0 ["a", "b"])), .map []),
    (x (p "$"), .map []), (x (p "$x"), .map []), (x (p ""), .map []), (x (p "."), .map []),
    (x (p "a."), .map []), (x (p "a..b"), .map []), (x (p "a b"), .map []), (x (p "Ü"), .map []),
    (x (.meet (.call .path [.call .plus [str "$.", str "a"]]) (addrAt 0 ["a"])), .map []),
    (x (.meet (.call .path [.call .upper [str "a"]]) (addrAt 1 ["A"])), .map []),
    (x (.meet (.call .path [.ride .metadata (str "a") [("x", .integer 1)]]) (addrAt 1 ["a"])), .map []),
    (x (.call .path [one]), .map []), (x (.call .path [.lit (.bool true)]), .map []),
    (x (.call .path [.lit .null]), .map []), (x (.call .path [.list [one] none false]), .map []),
    (x (.call .path [.map [("a", false, one)] none false]), .map []),
    (x (.call .path [.pref 1 (str "a")]), .map []), (x (.call .path [.string]), .map []),
    (x (.meet (p "$.a") (str "$.a")), .map []), (p "$.a", .str "$.a"),
    (x (.meet (.call .path [p "$.a"]) (addrAt 0 ["a"])), .map []),
    (x (.meet (.call .path [.ride .metadata (p "a") []]) (addrAt 1 ["a"])), .map []),
    (x (.meet (.call .path [addrAt 0 ["a"]]) (addrAt 0 ["a"])), .map []),
    (x (.meet (.call .path [.meet (addrAt 0 ["a"]) (addrAt 0 ["a", "b"])]) (addrAt 0 ["a", "b"])), .map []),
    (x (.call .path [.meet (addrAt 0 ["a"]) (addrAt 0 ["b"])]), .map []),
    (x (.call .path [.pathKind]), .map [])]

set_option maxRecDepth 8192 in
theorem pathCallCases_checkable : ∀ c ∈ pathCallCases, (vetDoc c).1.CheckableA := by decide

theorem path_call_verdict_exact : ∀ c ∈ pathCallCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (pathCallCases_checkable c hc)) v

/-- The grammars the rows hand `abnf` and `parse`: one rule of one
literal, matched without regard to case and, after `%s`, exactly, which
the oracle's host reads as every engine does, and two texts that compile
in no engine, the empty text and a lone name. -/
def oracleGrammars : List String := ["v = \"a\"\n", "v = %s\"ab\"", "", "v"]

/-- `abnf`, which answers a grammar's source where it compiles; `parse`
of a grammar and a string, the tree as data, met with the tree it must
be; and `parse` of a grammar alone, the constraint of the strings it
parses whole, against data. Each grammar is one of `oracleGrammars`. -/
def grammarCases : List (Val × Data) :=
  let x (v : Val) : Val := .map [("x", false, v)] none false
  let str (s : String) : Val := .lit (.str s)
  let one : Val := .lit (.num (.integer (.of 1)))
  let gi := str "v = \"a\"\n"
  let gs := str "v = %s\"ab\""
  let tree (s : String) : Val :=
    .map [("kids", false, .list [] none false), ("rule", false, str "v"), ("src", false, str s)] none false
  let abnf (g : Val) : Val := .call .abnf [g]
  let parse (g : Val) (v : Val) : Val := .call .parse [g, v]
  let parse1 (g : Val) : Val := .call .parse [g]
  [(x (.meet (abnf gi) gi), .map []), (x (abnf (str "")), .map []), (x (abnf (str "v")), .map []),
    (x (abnf one), .map []),
    (x (.meet (parse gi (str "a")) (tree "a")), .map []), (x (.meet (parse gi (str "A")) (tree "A")), .map []),
    (x (.meet (parse gs (str "ab")) (tree "ab")), .map []), (x (parse gs (str "aB")), .map []),
    (x (parse gi (str "b")), .map []), (x (parse gi (str "")), .map []), (x (parse (str "") (str "a")), .map []),
    (x (parse one (str "a")), .map []), (x (parse gi one), .map []),
    (x (.meet (parse (abnf gi) (str "a")) (tree "a")), .map []),
    (x (.meet (parse gi (str "a")) (.map [("rule", false, str "w")] none false)), .map []),
    (x (parse gi (str "a")), .map [("x", .map [("kids", .list []), ("rule", .str "v"), ("src", .str "a")])]),
    (parse1 gi, .str "a"), (parse1 gi, .str "A"), (parse1 gi, .str "b"), (parse1 gi, .str ""),
    (parse1 gs, .str "ab"), (parse1 gs, .str "AB"), (parse1 (str ""), .str "a"),
    (x (parse1 gi), .map []), (x (.or [(1, str ""), (0, parse1 gi)]), .map []),
    (x (.meet (parse1 gi) (str "A")), .map []), (x (.meet (parse1 gi) (str "b")), .map []),
    (parse1 (abnf gi), .str "a")]

set_option maxRecDepth 8192 in
theorem grammarCases_checkable : ∀ c ∈ grammarCases, (vetDoc c).1.CheckableA := by decide

theorem grammar_verdict_exact : ∀ c ∈ grammarCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (grammarCases_checkable c hc)) v

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
    IO.println "# Variables, each the value both runners bind for every row, follow in rows"
    IO.println "# i0 on, read as names the calling program declares."
    IO.println "# Path values follow in rows k0 on: path(p) generates its own address, two"
    IO.println "# meet by the prefix rule, the longer winning, and path admits each."
    genRows "g" genVals
    varRows "i"
    genRows "k" addrVals
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
    IO.println "# for generation, and an optional member whose value generates an empty map"
    IO.println "# or list not counted."
    IO.println "# The marks follow in rows h0 on: hide() and type() leave a member of a map"
    IO.println "# out of the output, the member still meeting the data, and --no-fill reads"
    IO.println "# the schema's visible part."
    IO.println "# Path values follow in rows k0 on: the fill supplies a path value the data"
    IO.println "# leaves out, and none admits the string the data writes for it, since no"
    IO.println "# JSON text reads as an address."
    verdictRows "e"
    verdictRows "l" lenCases
    verdictRows "h" markCases
    verdictRows "k" addrVetCases
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
    IO.println "# Paths through the riders follow in rows q0 on, which a path reads through,"
    IO.println "# and key(n) reached through a path or a name, read where it lands, in rows r0 on."
    IO.println "# Relative paths, made absolute where each stands, follow in rows j0 on."
    pathRows "p"
    pathRows "q" riderPathCases
    pathRows "r" keyPathCases
    pathRows "j" relPathCases
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
    IO.println "# The `defaults` profile follows in rows f0 on, over values that declare a"
    IO.println "# default alone, under a key and at a position: subsumes or undecided where"
    IO.println "# `leDecF` puts the specific below the general and `defaultsAt` holds at every"
    IO.println "# position both have, which `defaultsLe_of_walk` makes the definition's own,"
    IO.println "# and does_not_subsume or undecided where an instance tells the two apart or"
    IO.println "# one position refutes it (`not_defaultsLe_of_refutes`). The `gen` profile"
    IO.println "# follows in rows w0 on, over values that carry marks, the marks compared at"
    IO.println "# every position both have, a spread's among them (`genLe_of_walk`,"
    IO.println "# `not_genLe_of_refutes`). Path values follow in rows k0 on: a prefix subsumes"
    IO.println "# its extensions, path every path value, and string none."
    subsumeRows "s"
    subsumePairRows "m" kindPairs
    subsumePairRows "k" (addrSubVals.flatMap fun g => addrSubVals.map fun s => (g, s)) addrInstances
    profilePairRows "f" .defaults (defaultVals.flatMap fun g => defaultVals.map fun s => (g, s))
    profilePairRows "w" .gen (markVals.flatMap fun g => markVals.map fun s => (g, s))
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
  | ["calls"] =>
    IO.println "# Generated by `lake exe oracle calls` (spec/Oracle.lean) from the definition"
    IO.println "# in spec/Aontu: calls on numbers, add, sub, mul, div, mod, rem and -( ), each"
    IO.println "# under the key v against a document, run in the default mode, without the fill"
    IO.println "# (noFill) and under --partial (partial), as `verdict` rows whose expectation is"
    IO.println "# the one class `vet` gives, which `vet_iff` makes the definition's own. A call"
    IO.println "# whose arguments' normal forms are numbers is the number its function computes"
    IO.println "# by the tower's rules (spec/Aontu/Arith.lean); any other call, an argument"
    IO.println "# outside the function's domain, a zero divisor, an answer no leaf holds or the"
    IO.println "# wrong number of arguments, is an error. The folds sum, least and greatest,"
    IO.println "# over a list or a map whose members are numbers, follow from row x129, and +"
    IO.println "# from row x300, which waits where it does not take its operands, so that the"
    IO.println "# document is incomplete, and join from row x507, which waits on a member or a"
    IO.println "# separator not yet settled. pick and sort, which never wait, follow from row"
    IO.println "# x597, upper and lower from row x816, translate from row x966, and esc and usc"
    IO.println "# from row x1068, super from row x1221, split from row x1332, rep from row"
    IO.println "# x1404, nom from row x1521, the components of the component tree from row"
    IO.println "# x1677, the generator each, its template read for each member of its data,"
    IO.println "# from row x1803, and a filter whose condition holds the hole, read for each"
    IO.println "# member it tries, from row x1902. A call skips an optional member whose value"
    IO.println "# generates an empty map or list, from row x1935, rep reads its replacement"
    IO.println "# against its pattern's groups before the text, from row x1959, pick and sort"
    IO.println "# read a projector and a direction through a rider or a mark, from row x1995,"
    IO.println "# a string names an index by its digits alone, from row x2025, and translate"
    IO.println "# writes U+FFFD for a surrogate its to range names, from row x2055. The generator"
    IO.println "# pack, its template read for each member of its data under the member's key,"
    IO.println "# follows from row x2064, and key(n), read where it stands, from row x2121. A"
    IO.println "# call on a name follows in rows z0 on, and a call handed a pattern, re(p), in"
    IO.println "# rows v0 on. path handed a string follows in rows k0 on: its text converted to"
    IO.println "# an address, text with no start read from one dot, and refused where it spells"
    IO.println "# none, as is any other scalar and a container. abnf and parse follow in rows"
    IO.println "# g0 on, over grammars of one rule of one literal, which the oracle's host"
    IO.println "# reads as every engine does: abnf answers a grammar's source where it compiles,"
    IO.println "# parse(g, v) the tree as data, and parse(g) admits the strings g parses whole."
    IO.println "# Regenerate with `make spec`; never edit by hand."
    for (v, j) in callCases ++ filterCases ++ filterEachCases ++ optionalCases ++ repSubCases ++
        projectorCases ++ indexCases ++ surrogateCases ++ packCases ++ keyUpCases ++ keyUpFilterCases ++
        pathCallCases do
      unless asciiCase ((v.src.getD "") ++ (j.src.getD "")) do
        throw (IO.userError s!"a case conversion reads a letter beyond ASCII: {v.src}")
      unless hostReads v do
        throw (IO.userError s!"a pattern the oracle's host does not read as every engine does: {v.src}")
    for (_, v, _) in callAliasCases do
      unless hostReads v do
        throw (IO.userError s!"a pattern the oracle's host does not read as every engine does: {v.src}")
    for (v, _) in patternCases do
      unless hostReads v do
        throw (IO.userError s!"a pattern the oracle's host does not read as every engine does: {v.src}")
    verdictRows "x" (callCases ++ filterCases ++ filterEachCases ++ optionalCases ++ repSubCases ++
      projectorCases ++ indexCases ++ surrogateCases ++ packCases ++ keyUpCases ++ keyUpFilterCases)
    aliasRows "z" callAliasCases
    verdictRows "v" patternCases
    verdictRows "k" pathCallCases
    unless (oracleGrammars.take 2).all (fun g => (oneLiteral g).isSome) &&
        (oracleGrammars.drop 2).all (fun g => (oneLiteral g).isNone) do
      throw (IO.userError "a grammar of the rows the oracle's host does not read as every engine does")
    verdictRows "g" grammarCases
    return 0
  | _ =>
    IO.eprintln "usage: oracle [bounds | choice | gen | verdict | alias | paths | trials | calls]"
    return 2
