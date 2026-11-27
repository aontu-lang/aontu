import Aontu.Check
import Aontu.Output
import Aontu.Verdict
import Aontu.Paths
import Oracle.Print
import Aontu.Subsume
import Aontu.Profiles
import Aontu.Reorder
import Aontu.Written
import Aontu.Graph
import Aontu.Writing

/-! The oracle's shared helpers and printers, split out of `Oracle.lean` so that each area builds on its own. -/

namespace Aontu

def bases : List Val :=
  [.any, Val.void, .integer, .meet .number (.mulof (.integer (.of 1))), .string, .anyString,
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
    .or [(0, Val.void), (0, .lit (.num one))],
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

set_option maxRecDepth 4096 in
theorem choiceInstances_wellFormed : ∀ j ∈ choiceInstances, j.WellFormed := by decide

end Aontu

open Aontu

/-! ## The cases' helpers

Each case list writes its values with these; a list that needs a
variant binds its own, which stands over the shared one. -/

namespace Case

def int (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .lit (.num (.integer ⟨n, h⟩))

def j (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .integer n h

def m (fs : List (String × Val)) : Val := .map (fs.map fun f => (f.1, false, f.2)) none false

def str (s : String) : Val := .lit (.str s)

def lst (xs : List Val) : Val := .list xs none false

def p (ks : List String) : Val := .path (ks.map .key)

def rel (n : ℕ) (ks : List String) : Val := .path (.up n :: ks.map .key)

def dm (fs : List (String × Data)) : Data := .map fs

abbrev mp := m

def c (f : Fn) (args : List Val) : Val := .call f args

def js (s : String) : Data := .str s

def type (v : Val) : Val := .ride .type v []

def jl (xs : List Data) : Data := .list xs

def hide (v : Val) : Val := .ride .hide v []

abbrev jm := dm

def n (k : ℤ) (h : IntegerLeaf k := by decide) : Val := int k h

def mo (fs : List (String × Bool × Val)) : Val := .map fs none false

abbrev s := str

def nb (n : ℤ) (h : IntegerLeaf n := by decide) : Bound := .num (.integer ⟨n, h⟩)

abbrev dl := jl

def x (v : Val) : Val := .map [("x", false, v)] none false

def fx (s : String) : String := "__FIXTURES__/" ++ s

def nd (ks : List String) : Val := .path (.node :: ks.map .key)

def key (k : String) (o : Bool) (v : Val) : Val := .map [(k, o, v)] none false

def up : Val := .call .upper [.hole]

def rf (t : Val) (a : Val) : Val := .meet (.call .relate [t]) a

def ad (up : ℕ) (ks : List String) : Val := .addr ⟨up, ks⟩

def ld (s : String) : Val := .call .load [.lit (.str s)]

def bnd (b : Bnd) (args : List Val) : Val := .call (.bnd b) args

abbrev ls := lst

def cl (fs : List (String × Val)) : Val := .map (fs.map fun f => (f.1, false, f.2)) none true

def k (n : ℤ) : Val := .keyUp n

def tmpl (t : Val) : Val := .map [] (some t) false

def ms (fs : List (String × Val)) (s : Val) : Val := .map (fs.map fun f => (f.1, false, f.2)) (some s) false

abbrev ds := js

end Case

open Case

/-- A term's text as a cell of a row, each backslash doubled, since the
runners expand `\n`, `\t` and `\\` in a cell before they read it. -/
def Aontu.Val.cell (v : Val) : Option String := v.src.map fun s => s.replace "\\" "\\\\"

/-- Data's text as a cell of a row, as `Val.cell` writes a term's. -/
def Aontu.Data.cell (d : Data) : Option String := d.src.map fun s => s.replace "\\" "\\\\"

/-! ## The verdicts -/

/-- The cases of the `verdict` fragment, each a schema and a document of
data, run in the three modes of `vet`. No case writes `nil` or a
contradiction under an optional key, where the engines answer `error`
for what the definition reads as a key that must be absent, and none a
preference clash the engines find only once the data meets it. The
last case is the sealed list met with a spread (#346), which the
ledger carries. -/
def vetCases : List (Val × Data) :=
  let min (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .min (.num (.integer ⟨n, h⟩))
  let max (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .max (.num (.integer ⟨n, h⟩))
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
    (.or [(0, Val.void), (0, int 1)], j 1), (.or [(0, Val.void), (0, int 1)], j 2),
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

/-- The three modes a verdict row is printed in, with the options each
row writes. -/
def verdictModes : List (Mode × String) :=
  [(({} : Mode), ""), (({ fill := false } : Mode), ",\"opts\":{\"noFill\":true}"),
    (({ lax := true } : Mode), ",\"opts\":{\"partial\":true}")]

/-- A case's verdict rows, one in each mode, numbered from `i`, and the
number the next case takes. -/
def verdictLines (tag : String) (i : ℕ) (src dsrc : String) (verdict : Mode → Verdict) : IO ℕ := do
  let mut i := i
  for (m, opts) in verdictModes do
    IO.println (tag ++ toString i ++ "\tverdict\t" ++ src ++ "\t" ++ dsrc ++ "\t{\"verdict\":\""
      ++ verdictName (verdict m) ++ "\"" ++ opts ++ "}")
    i := i + 1
  return i

/-- A case's declarations, one to a line: `%name = body`. -/
def declLines (ds : Decls) : IO (List String) :=
  ds.mapM fun d => do
    let some bsrc := d.2.cell | throw (IO.userError "a body of the fragment has no text")
    pure ("%" ++ d.1 ++ " = " ++ bsrc)

/-- The `verdict` rows: each case in the default mode, without the fill
and under `--partial`, with the one class `vet` gives. -/
def verdictRows (tag : String) (cases : List (Val × Data) := vetCases) : IO Unit := do
  let mut i := 0
  for c in cases do
    let some ssrc := c.1.cell | throw (IO.userError "a schema of the fragment has no text")
    let some dsrc := c.2.cell | throw (IO.userError "a document of the fragment has no text")
    let (S, D) := vetDoc c
    i ← verdictLines tag i ("v: " ++ ssrc) ("v: " ++ dsrc) fun m => vet m [] S D

/-- A number as JSON writes it: a minus sign for a negative one, its
digits with the point `places` from the right and a zero before a point
that would lead, and its exponent where it has one. -/
def Aontu.NumText.text (t : NumText) : String :=
  let ds := toString t.digits
  let body :=
    if t.places = 0 then ds else
    let ds := zeros (t.places + 1 - ds.length) ++ ds
    let k := ds.length - t.places
    String.mk (ds.toList.take k) ++ "." ++ String.mk (ds.toList.drop k)
  (if t.neg then "-" else "") ++ body ++ (if t.exp = 0 then "" else "e" ++ toString t.exp)

/-- The cases of the `alias` fragment: declarations, a schema and a
document, the last two under the key `v`: names that are not recursive,
replaced as the document reads, and recursive ones, left as residuals
that the data expands, a linked list, a tree, a spread of itself, a
pair that refer to each other. The cases that break the alias-cycle
rule or refer to a name declared nowhere are errors before anything
else is asked, and `%T = %T | 1`, which the engines run, is one. A
declaration nothing reads is read too (decision 17): a dead or
ill-formed body is an error, alone, beside a name the schema uses and
inside a recursive body, and beside a hole or a `key(n)` its use would
place; while one that stands, a literal short of its size, a template
whose hole its use would fill, a body that names one and a call over a
`key(n)` are not. A call or a trial that waits for its hole is an error
where an argument both ports read as written doesn't stand, a count,
a size, a condition, a call's own or an `each`'s data, and stands where
only a trial or a template does, which both read later; in a
disjunction such a call is an arm that dies. A template's hole and
`key(n)` are its member's, so an `each` or a `pack` over data written
in place is read whole, and an `emit`'s table its node's, so an `emit`
over a selection written in place is too. A name whose body waits makes
a body that names it wait too, through a call and through another name,
so `add(%U, 1)` stands where `%U` waits and `add(%U, 1 & 2)` doesn't,
while the name itself reads what its body fixes, so `%U & 2` is an
error beside `%U = _ & 1`; and a waiting `key(n)` is any string, so
`key(1) & 1` is an error and `key(1) & ""` stands. A `key(n)` that
reads a step inside the body is that step's text at every use (ruling
88), so a body no use could fit is an error unused: a key under a
member, two members down, through a call, at a list's index, below the
body, and in a spread's template met with a member the body holds; and
their neighbours stand, a key that reaches the body's top, one that
agrees with its step, and the first of them used, against data. -/
def aliasCases : List (Decls × Val × Data) :=
  let min (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .min (.num (.integer ⟨n, h⟩))
  let p : Val := .alias "p"
  let x12 : Val := .meet (int 1) (int 2)
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
    ([("T", .or [(0, .alias "T"), (0, int 1)])], .alias "T", j 1),
    ([("T", .meet (int 1) (int 2))], int 1, j 1),
    ([("T", .meet (key "a" false (int 1)) (key "a" false (int 2)))], int 1, j 1),
    ([("T", .meet (.map [("a", false, int 1)] none true) (key "b" false (int 2)))], int 1, j 1),
    ([("T", .meet .string (int 1))], int 1, j 1),
    ([("T", .meet (.pref 1 (int 1)) (.pref 1 (int 2)))], int 1, j 1),
    ([("T", .meet (.list [int 1] none false) (.list [int 2] none false))], int 1, j 1),
    ([("T", key "a" true (.meet (int 1) (int 2)))], int 1, j 1),
    ([("T", .len (.or [(0, int 1), (0, int 3)]))], int 1, j 1),
    ([("T", .call .div [int 1, int 0])], int 1, j 1),
    ([("T", .meet (int 1) (int 2)), ("U", .integer)], .alias "U", j 1),
    ([("T", .map [("x", true, .alias "T"), ("y", false, .meet (int 1) (int 2))] none false)], int 1, j 1),
    ([("T", .or [(0, int 1), (0, int 2)])], int 1, j 1),
    ([("T", .meet (.list [int 1, int 2] none false) (.len (int 3)))], int 1, j 1),
    ([("U", .call .upper [.hole])], int 1, j 1),
    ([("T", .meet (.call .upper [.hole]) (.meet (int 1) (int 2)))], int 1, j 1),
    ([("T", .map [("a", false, .call .upper [.hole]), ("b", false, .meet (int 1) (int 2))] none false)], int 1, j 1),
    ([("T", .list [.call .upper [.hole], .meet (int 1) (int 2)] none false)], int 1, j 1),
    ([("U", .call .upper [.hole]), ("T", .alias "U")], int 1, j 1),
    ([("U", .call .upper [.hole]), ("T", .meet (.alias "U") (.meet (int 1) (int 2)))], int 1, j 1),
    ([("U", .map [("a", false, .call .upper [.hole])] none false),
      ("T", .meet (.alias "U") (.map [("a", false, str "x")] none false))], int 1, j 1),
    ([("T", .list [.keyUp 1, .meet (int 1) (int 2)] none false)], int 1, j 1),
    ([("T", .call .upper [.keyUp 1])], int 1, j 1),
    ([("T", .contains up x12)], int 1, j 1),
    ([("T", .contains up (int 2))], int 1, j 1),
    ([("T", .call .add [up, x12])], int 1, j 1),
    ([("T", .len (.meet up x12))], int 1, j 1),
    ([("T", .nof x12 [up])], int 1, j 1),
    ([("T", .nof (int 1) [up, x12])], int 1, j 1),
    ([("T", .must (.meet up x12) "m")], int 1, j 1),
    ([("T", .when up x12 none)], int 1, j 1),
    ([("T", .select (int 1) [(up, x12)] none)], int 1, j 1),
    ([("T", .call .each [up, x12])], int 1, j 1),
    ([("T", .call .each [.meet up x12, int 1])], int 1, j 1),
    ([("T", .call .each [.list [str "a"] none false, .meet up x12])], int 1, j 1),
    ([("T", .call .pack [.list [str "a"] none false, .meet up x12])], int 1, j 1),
    ([("T", .call .each [.list [int 1] none false, .map [("a", false, .keyUp 0), ("b", false, x12)] none false])],
      int 1, j 1),
    ([("T", .call .each [.list [int 1] none false, .keyUp 0])], int 1, j 1),
    ([("T", .or [(0, .call .add [up, x12]), (0, int 3)])], int 1, j 1),
    ([("T", .list [.call .add [up, x12]] none false)], int 1, j 1),
    ([("T", .call .add [.call .add [up, x12], int 1])], int 1, j 1),
    ([("T", .call .emit [up, .map [("match", false, .any), ("body", false, .list [x12] none false)] none false])],
      int 1, j 1),
    ([("T", .call .emit [.meet up x12, .map [("match", false, .any), ("body", false, .list [str "x"] none false)] none false])],
      int 1, j 1),
    ([("T", .call .emit [.list [int 1] none false,
      .map [("match", false, .any), ("body", false, .list [.meet up x12] none false)] none false])], int 1, j 1),
    ([("T", .call .emit [.list [int 1] none false,
      .map [("match", false, .hole), ("body", false, .list [str "x"] none false)] none false])], int 1, j 1),
    ([("U", up), ("T", .call .add [.alias "U", int 1])], int 1, j 1),
    ([("U", up), ("T", .call .add [.alias "U", x12])], int 1, j 1),
    ([("U", up), ("T", .call .add [.alias "U", int 1]), ("V", .alias "T")], int 1, j 1),
    ([("T", .meet (.keyUp 1) (int 1))], int 1, j 1),
    ([("T", .meet (.keyUp 1) .integer)], int 1, j 1),
    ([("T", .meet (.keyUp 1) (.map [] none false))], int 1, j 1),
    ([("T", .meet (.keyUp 1) (str ""))], int 1, j 1),
    ([("T", .meet (.keyUp 1) .string)], int 1, j 1),
    ([("T", .map [("a", false, .meet (.keyUp 0) (str "a"))] none false)], int 1, j 1),
    ([("U", .meet .hole (int 1)), ("T", .meet (.alias "U") (int 2))], int 1, j 1),
    ([("U", .meet .hole (int 1)), ("T", .meet (.alias "U") (int 1))], int 1, j 1),
    ([("U", .map [("a", false, .hole), ("b", false, int 1)] none false),
      ("T", .meet (.alias "U") (.map [("b", false, int 2)] none false))], int 1, j 1),
    ([("T", .map [("a", false, .meet (.keyUp 0) (str "b"))] none false)], int 1, j 1),
    ([("T", .map [("a", false, .map [("b", false, .meet (.keyUp 1) (str "z"))] none false)] none false)],
      int 1, j 1),
    ([("T", .map [("a", false, .meet (.call .upper [.keyUp 0]) (int 1))] none false)], int 1, j 1),
    ([("T", .list [.meet (.keyUp 0) (str "9")] none false)], int 1, j 1),
    ([("T", .meet (.keyUp (-1)) (str "x"))], int 1, j 1),
    ([("T", .map [("s", false, str "zz")] (some (.meet (.keyUp 0) (str "zz"))) false)], int 1, j 1),
    ([("T", .meet (.keyUp 0) (str "x"))], int 1, j 1),
    ([("T", .map [("a", false, .map [("b", false, .meet (.keyUp 2) (str "z"))] none false)] none false)],
      int 1, j 1),
    ([("T", .map [("a", false, .map [("b", false, .meet (.keyUp 1) (str "a"))] none false)] none false)],
      int 1, j 1),
    ([("T", .list [.meet (.keyUp 0) (str "0")] none false)], int 1, j 1),
    ([("T", .map [("a", false, .meet (.call .upper [.keyUp 0]) (str "A"))] none false)], int 1, j 1),
    ([("T", .map [("s", false, str "s")] (some (.keyUp 0)) false)], int 1, j 1),
    ([("T", .meet (.keyUp (-1)) (str ""))], int 1, j 1),
    ([("T", .map [("a", false, .meet (.keyUp 0) (str "b"))] none false)], .alias "T",
      .map [("a", .str "a")])]

/-- The schema and data of a case, each under the key `v`, as the rows
write them. -/
def aliasDoc (c : Decls × Val × Data) : Val × Data :=
  (.map [("v", false, c.2.1)] none false, .map [("v", c.2.2)])

set_option maxRecDepth 4096 in
/-- Every case's bodies and schema hold no path, no pattern and no
format, so `vet` is `Vet` on it, by `vet_iff`. -/
theorem aliasCases_checkable : ∀ c ∈ aliasCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (aliasDoc c).1.CheckableA := by decide

theorem alias_verdict_exact : ∀ c ∈ aliasCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 (aliasDoc c).1 (aliasDoc c).2 = v ↔ Vet m c.1 (aliasDoc c).1 (aliasDoc c).2 v :=
  fun c hc _ v => vet_iff (aliasCases_checkable c hc).1
    (readR_checkableA (aliasCases_checkable c hc).1 (aliasCases_checkable c hc).2) v

/-- The `alias` rows: each case's declarations and schema as one
document, in the three modes, with the one class `vet` gives. -/
def aliasRows (tag : String) (cases : List (Decls × Val × Data) := aliasCases) : IO Unit := do
  let mut i := 0
  for c in cases do
    let lines ← declLines c.1
    let some ssrc := c.2.1.cell | throw (IO.userError "a schema of the fragment has no text")
    let some dsrc := c.2.2.cell | throw (IO.userError "a document of the fragment has no text")
    let src := "\\n".intercalate (lines ++ ["v: " ++ ssrc])
    let (S, D) := aliasDoc c
    i ← verdictLines tag i src ("v: " ++ dsrc) fun m => vet m c.1 S D

/-! ## The seventh fragment: paths -/

/-- Documents with paths: each case its declarations, a schema that is
a map with paths in it, and a document, run in the three modes. A
step's text reads a map by key and a list by the index it spells in
canonical decimal. A path's copy clears the marks of what it names, a
preference's value among them, and what it names keeps them. A path in
a preference's own value reads its target as any path does, beside data
that supplies nothing, as `vet` meets every schema with its data (#643). -/
def pathCases : List (Decls × Val × Data) :=
  let min (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .min (.num (.integer ⟨n, h⟩))
  let pa : Val := .path [.key "a"]
  let pb : Val := .path [.key "b"]
  let step (o : Bool) : Val := m [("schema", m [("Step", mo [("label", false, .string), ("then", o, p ["schema", "Step"])])]), ("doc", p ["schema", "Step"])]
  let hidden : Val := m [("a", .or [(1, m [("b", .ride .hide (int 1) []), ("c", int 2)]), (0, int 5)])]
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
    ([], m [("q", .list [int 5, int 6] none false), ("x", .path [.key "q", .key "01"])], .map [("x", j 5)]),
    ([], m [("x", hidden), ("v", p ["x"])],
      .map [("x", .map [("a", .map [("c", j 2)])]), ("v", .map [("a", .map [("b", j 1), ("c", j 2)])])]),
    ([], m [("x", hidden), ("v", p ["x"])],
      .map [("x", .map [("a", .map [("c", j 2)])]), ("v", .map [("a", .map [("c", j 2)])])]),
    ([], m [("x", .pref 1 (m [("k", p ["y"])])), ("y", int 1)], .map []),
    ([], m [("x", .pref 1 (p ["y"])), ("y", int 1)], .map []),
    ([], m [("a", m [("x", .pref 1 (m [("k", p ["a", "y"])])), ("y", int 1)])], .map [])]

/-- Every case's bodies and schema hold no pattern and no format, so
`vetP` is `VetP` on it, by `vetP_iff`. -/
theorem pathCases_checkable : ∀ c ∈ pathCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem path_verdict_exact : ∀ c ∈ pathCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (pathCases_checkable c hc).1 (pathCases_checkable c hc).2 v

/-- Whether a term is a destructure, `{ %a } = @"p"`: a load that
writes the names it takes after its path. -/
def Aontu.Val.isTake : Val → Bool
  | .call .load (.lit (.str _) :: _ :: _) => true
  | _ => false

/-- The `paths` rows: each case's declarations and schema as one
document, a map's braces dropped since neither CLI reads a braced map
after a declaration, in the three modes, with the one class `vetP`
gives, or `vetG` where the fragment judges the graph atoms. The
declarations come first, or after the schema where `declsLast` asks. A source a case declares, `@` and its name, is a file
the row loads, which the row doesn't write. -/
def pathRows (tag : String) (cases : List (Decls × Val × Data) := pathCases) (declsLast : Bool := false)
    (verdict : Mode → Decls → Val → Data → Verdict := vetP) : IO Unit := do
  let mut i := 0
  for c in cases do
    let mut lines ← declLines (c.1.filter fun d => !sourceName d.1 && !scopedDecl d.1)
    -- A destructure at the top is a statement of its own, so it takes a
    -- line of its own, and the rest of the schema the line after.
    let takes := c.2.1.conjuncts.filter Val.isTake
    for t in takes do
      let some tsrc := t.cell | throw (IO.userError "a destructure of the fragment has no text")
      lines := lines ++ [tsrc]
    let rest := if takes.isEmpty then [c.2.1] else c.2.1.conjuncts.filter fun v => !v.isTake
    let some dsrc := c.2.2.cell | throw (IO.userError "a document of the fragment has no text")
    let mut body : List String := []
    for s in rest.take 1 do
      let some ssrc := ((rest.drop 1).foldl Val.meet s).cell
        | throw (IO.userError "a schema of the fragment has no text")
      body := [match s, rest.length with | .map _ _ _, 1 => (ssrc.drop 1).dropRight 1 | _, _ => ssrc]
    let src := "\\n".intercalate (if declsLast then body ++ lines else lines ++ body)
    i ← verdictLines tag i src dsrc fun m => verdict m c.1 c.2.1 c.2.2

/-- The instances that may tell a pair apart. -/
def subInstances : List Data := instances ++ choiceInstances

theorem subInstances_wellFormed : ∀ j ∈ subInstances, j.WellFormed := by
  intro j hj
  rcases List.mem_append.1 hj with h | h
  · exact instances_wellFormed j h
  · exact choiceInstances_wellFormed j h

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

/-! ## The words `map` and `list`

The kinds of ruling 15 of `sketch/DEFINITION.0.md` §7, each alone, under
a key, and met with a map, a list and `string`, as `verdict` rows against
the first fragment's instances, rows k0 on in the first fragment's file;
and in order against the empty map and list, open and sealed, a map and a
list of each kind of seal, a spread on each, and the ends, as
`subsumption` rows m0 on in the ninth fragment's file. -/

def kindBases : List Val := [.mapKind, .listKind]

/-- A case's term under the key `v`, as the rows write it. -/
def docOf (v : Val) : Val := .map [("v", false, v)] none false

/-- A row's document, the value under `v`, and its data. -/
def rowDoc (v : Val) (j : Data) : Val × Data := (.map [("v", false, v)] none false, .map [("v", j)])

/-- The `error` class of a row's verdict is `Vet`'s, whatever the checker
can read. -/
theorem rowDoc_error_exact (m : Mode) (v : Val) (j : Data) :
    vet m [] (rowDoc v j).1 (rowDoc v j).2 = .error ↔ Vet m [] (rowDoc v j).1 (rowDoc v j).2 .error :=
  vet_error_iff

/-- The rows of one fragment: each value against each instance of each
block, numbered from zero under `tag`. A value `check` admits that `vet`
reads as ill-formed is an `error` (`rowDoc_error_exact`). -/
def rows (tag : String) (vals : List Val) (blocks : List (List Data)) : IO Unit := do
  let head := "{\"verdict\":"
  let mut i := 0
  for block in blocks do
    for v in vals do
      let some src := v.cell | throw (IO.userError "a value of the fragment has no text")
      for j in block do
        let some jsrc := j.cell | throw (IO.userError "an instance has no text")
        let ill := vet {} [] (rowDoc v j).1 (rowDoc v j).2 == Verdict.error
        let want := if check v j then (if ill then "\"error\"" else "\"valid\"")
          else "[\"invalid\",\"incomplete\",\"error\"]"
        IO.println (tag ++ toString i ++ "\tverdict\tv: " ++ src ++ "\tv: " ++ jsrc
          ++ "\t" ++ head ++ want ++ "}")
        i := i + 1

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

/-- A vet document whose one field is a call that reads to a term the
checker can read reads to one itself. -/
theorem readR_call_checkableA {t : Val}
    (ht : (∃ f args, t = .call f args ∧ f.landsArg = false) ∨ ∃ s c, t = .filter s c)
    (hf : ∀ k, (expandF [] k t).filled = expandF [] k t)
    (h : ∀ k, (resolveD [] none (stepped (some []) (.seg (.key "v"))) (expandF [] k t)).CheckableA) :
    (Decls.readR [] (.map [("v", false, t)] none false)).CheckableA := by
  have hx : ∀ k, (expandF [] k t).landed = expandF [] k t ∧ (expandF [] k t).holdsDir = false := by
    intro k
    rcases ht with ⟨f, args, rfl, hla⟩ | ⟨s, c, rfl⟩
    · cases k with
      | zero => exact ⟨by simp [expandF, Val.landed, hla], rfl⟩
      | succ k =>
        cases hat : Val.isAtRef f args
        · rw [expandF_call_of_not_at k hat]
          exact ⟨by simp [Val.landed, hla], rfl⟩
        · obtain ⟨n, ks, rfl, rfl⟩ := Val.isAtRef_true hat
          exact ⟨by simp [expandF, Val.landed, hla], rfl⟩
    · cases k <;> exact ⟨rfl, rfl⟩
  have hd : ∀ n, (expandF [] n (.map [("v", false, t)] none false)).directed =
      expandF [] n (.map [("v", false, t)] none false) := by
    intro n
    cases n with
    | zero =>
      have e := (hx 0)
      simp only [expandF] at e ⊢
      exact Val.directed_map_of e.1 e.2
    | succ k =>
      have e := (hx k)
      simp only [expandF, List.map, Option.map]
      exact Val.directed_map_of e.1 e.2
  have hm : ∀ u, (resolveD [] none (stepped (some []) (.seg (.key "v"))) u).CheckableA →
      (resolveD [] none (some []) (.map [("v", false, u)] none false)).CheckableA := by
    intro u hu
    simp only [resolveD, resolveFields, resolveSpread]
    exact .map (fun k o w hw => by simp at hw; obtain ⟨-, -, rfl⟩ := hw; exact hu)
      (fun _ hs => by cases hs)
  have : ∀ n, (resolveD [] none (some [])
      (expandF [] n (.map [("v", false, t)] none false)).filled).CheckableA := by
    intro n
    cases n with
    | zero =>
      have h0 : t.filled = t := by simpa [expandF] using hf 0
      simp only [expandF, Val.filled, filledFields, tmplSpread, h0, joinFields_single]
      exact hm t (by simpa [expandF] using h 0)
    | succ k =>
      simp only [expandF, List.map, Option.map, Val.filled, filledFields, tmplSpread, hf k, joinFields_single]
      exact hm _ (h k)
  show (resolveD [] none (some []) (expand [] _).filled).CheckableA
  unfold expand
  rw [hd]
  exact this _

/-- A term the patterns' cases hand a call: a literal, a pattern, a kind
or a rider around one, holding no reference, call or selection. -/
def Aontu.Val.inertB : Val → Bool
  | .lit _ | .re _ | .integer => true
  | .ride _ v _ => v.inertB
  | _ => false

/-- Lifting the seals leaves an inert term as it is. -/
theorem unseal_inert : ∀ {x : Val}, x.inertB = true → x.unseal = x
  | .lit _, _ => rfl
  | .re _, _ => rfl
  | .integer, _ => rfl
  | .ride _ v _, h => by simp only [Val.unseal]; rw [unseal_inert (x := v) h]

theorem reads_inert {k : Rider} {x : Val} (h : x.inertB = true) : k.reads x = x := by
  unfold Rider.reads
  split
  · exact unseal_inert h
  · rfl

theorem inert_expandF {ds : Decls} : ∀ {x : Val}, x.inertB = true → ∀ j, (expandF ds j x).inertB = true
  | .lit _, _, j => by cases j <;> rfl
  | .re _, _, j => by cases j <;> rfl
  | .integer, _, j => by cases j <;> rfl
  | .ride _ v _, h, j => by
    cases j with
    | zero => exact h
    | succ j =>
      simp only [expandF, Val.inertB]
      rw [reads_inert (inert_expandF (x := v) h j)]
      exact inert_expandF (x := v) h j

/-- A term that holds no reference waits on none, whatever reads it. -/
theorem inert_pending {ds : Decls} {bd : Option Val} {here : Option (List Step)} :
    ∀ {x : Val}, x.inertB = true → ∀ j, (resolveD ds bd here (expandF ds j x)).pending ds = false
  | .lit _, _, j => by cases j <;> simp [expandF, resolveD, Val.pending]
  | .re _, _, j => by cases j <;> simp [expandF, resolveD, Val.pending]
  | .integer, _, j => by cases j <;> simp [expandF, resolveD, Val.pending]
  | .ride _ v _, h, j => by
    cases j with
    | zero =>
      simp only [expandF, resolveD, Val.pending]
      exact inert_pending (x := v) h 0
    | succ j =>
      simp only [expandF, resolveD, Val.pending]
      rw [reads_inert (inert_expandF (ds := ds) (x := v) h j)]
      exact inert_pending (x := v) h j

/-- An inert term holds no meet, so the fill leaves it as it is, expanded
or not. -/
theorem inert_filled : ∀ {x : Val}, x.inertB = true → x.filled = x
  | .lit _, _ => rfl
  | .re _, _ => rfl
  | .integer, _ => rfl
  | .ride _ v _, h => by simp only [Val.filled]; rw [inert_filled (x := v) h]

theorem filledItems_inert : ∀ {xs : List Val}, (∀ x ∈ xs, x.inertB = true) → filledItems xs = xs
  | [], _ => rfl
  | x :: xs, h => by
    simp only [filledItems]
    rw [inert_filled (h x List.mem_cons_self), filledItems_inert fun y hy => h y (List.mem_cons_of_mem _ hy)]

/-- A `split` or a `rep` over inert terms holds no meet either. -/
theorem filled_expandF_call {f : Fn} (hf : f = .split ∨ f = .rep) {args : List Val}
    (h : ∀ x ∈ args, x.inertB = true) : ∀ k, (expandF [] k (.call f args)).filled = expandF [] k (.call f args) := by
  have hm : ∀ k, filledItems (args.map (expandF [] k)) = args.map (expandF [] k) := fun k =>
    filledItems_inert fun x hx => by
      obtain ⟨y, hy, rfl⟩ := List.mem_map.mp hx
      exact inert_expandF (h y hy) k
  rcases hf with rfl | rfl <;> intro k <;> cases k <;>
    simp only [expandF, Decls.tableUnfold_of_ne _ (show Fn.split ≠ Fn.emit by decide), Fn.tableArgs_of_ne _ (show Fn.split ≠ Fn.emit by decide),
      Decls.tableUnfold_of_ne _ (show Fn.rep ≠ Fn.emit by decide), Fn.tableArgs_of_ne _ (show Fn.rep ≠ Fn.emit by decide), Val.filled, filledItems_inert h, hm]

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
