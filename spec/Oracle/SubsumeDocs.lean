import Oracle.Base

/-! The oracle's cases: SubsumeDocs, split out of `Oracle.lean` so that each area builds on its own. -/

open Aontu
open Case

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

/-- An instance under the key `v`. -/
def docData (j : Data) : Data := .map [("v", j)]

theorem docCases_ok : ∀ c ∈ docCases, c.1.guardedB = true ∧ c.1.bodiesCheckableB = true ∧
    (docOf c.2).checkableAB = true := by decide

theorem docInstances_wf : ∀ j ∈ docInstances, (docData j).wf = true := by decide

/-- A witness refutes the order on two documents of a list whose
declarations are guarded and whose terms are checkable:
`not_leD_of_witness`, its side conditions decided. -/
theorem doc_witness_exact {cases : List (Decls × Val)} {insts : List Data}
    (hc : ∀ c ∈ cases, c.1.guardedB = true ∧ c.1.bodiesCheckableB = true ∧
      (docOf c.2).checkableAB = true)
    (hi : ∀ j ∈ insts, (docData j).wf = true) :
    ∀ g ∈ cases, ∀ s ∈ cases, ∀ j ∈ insts,
    checkR s.1 (s.1.readR (docOf s.2)) (docData j) = true →
    checkR g.1 (g.1.readR (docOf g.2)) (docData j) = false →
    ¬ LeD g.1 (docOf g.2) s.1 (docOf s.2) := by
  intro g hg s hs j hj h1 h2
  obtain ⟨hgg, hgb, hgv⟩ := hc g hg
  obtain ⟨hsg, hsb, hsv⟩ := hc s hs
  exact not_leD_of_witness (Decls.guardedB_iff.1 hgg) (Decls.bodiesCheckableB_iff.1 hgb)
    (readR_checkableA (Decls.bodiesCheckableB_iff.1 hgb) ((Val.checkableAB_iff _).1 hgv))
    (Decls.guardedB_iff.1 hsg) (Decls.bodiesCheckableB_iff.1 hsb)
    (readR_checkableA (Decls.bodiesCheckableB_iff.1 hsb) ((Val.checkableAB_iff _).1 hsv))
    ((Data.wf_iff _).1 (hi j hj)) h1 h2

/-- A witness among the instances refutes the order on two documents of
the fragment. -/
theorem subsume_doc_rows_exact : ∀ g ∈ docCases, ∀ s ∈ docCases, ∀ j ∈ docInstances,
    checkR s.1 (s.1.readR (docOf s.2)) (docData j) = true →
    checkR g.1 (g.1.readR (docOf g.2)) (docData j) = false →
    ¬ LeD g.1 (docOf g.2) s.1 (docOf s.2) :=
  doc_witness_exact docCases_ok docInstances_wf

/-- A document's text: its declarations, one to a line, and its term under
`v`. -/
def docSrc (c : Decls × Val) : IO String := do
  let lines ← declLines c.1
  let some tsrc := c.2.cell | throw (IO.userError "a term of the fragment has no text")
  pure ("\\n".intercalate (lines ++ ["v: " ++ tsrc]))

/-- Whether an instance of the list is one of the specific document and
none of the general. -/
def docRefutes (insts : List Data) (g s : Decls × Val) : Bool :=
  insts.any fun j => checkR s.1 (s.1.readR (docOf s.2)) (docData j)
    && !(checkR g.1 (g.1.readR (docOf g.2)) (docData j))

/-- A pair's answer where neither reading reads a name and `leDecD`
decides the order, or an instance refutes it. -/
def docAnswer (g s : Decls × Val) : Option String :=
  if (leDecD 64 g.1 (docOf g.2) s.1 (docOf s.2)).isSome then some "[\"subsumes\",\"undecided\"]"
  else if docRefutes docInstances g s then some "[\"does_not_subsume\",\"undecided\"]"
  else none

/-- A pair's answer where `leCoD` decides the order, through the names
either side reads, or an instance refutes it. -/
def recAnswer (insts : List Data) (g s : Decls × Val) : Option String :=
  if (leCoD 64 g.1 (docOf g.2) s.1 (docOf s.2)).isSome then some "[\"subsumes\",\"undecided\"]"
  else if docRefutes insts g s then some "[\"does_not_subsume\",\"undecided\"]"
  else none

def docRow (tag : String) (i : ℕ) (gsrc ssrc want : String) : String :=
  tag ++ toString i ++ "\tsubsumption\t" ++ gsrc ++ "\t" ++ ssrc
    ++ "\t{\"verdict\":" ++ want ++ ",\"opts\":{\"profile\":\"values\"}}"

/-- The rows of the tenth fragment: each pair of documents, the general
first, where `leDecD` decides the order or an instance refutes it. -/
def subsumeDocRows (tag : String) : IO Unit := do
  let mut i := 0
  for g in docCases do
    let gsrc ← docSrc g
    for s in docCases do
      let ssrc ← docSrc s
      if let some want := docAnswer g s then
        IO.println (docRow tag i gsrc ssrc want)
        i := i + 1

/-- Instances for the pairs the tenth fragment's own leave without a row:
a node with a key a recursion through `a` or `b` refuses, a second node
that isn't one, a number that is no integer, and a node whose tail is
none. -/
def docWitnesses : List Data :=
  let node (n : Data) (rest : List (String × Data)) : Data := .map (("n", n) :: rest)
  [node (j 1) [("b", j 5)], node (j 1) [("a", j 5)],
    node (j 1) [("next", .map []), ("b", j 5)], node (j 1) [("next", .map []), ("a", j 5)],
    .map [("a", j 5)], .map [("a", node (j 1) []), ("b", j 5)],
    .map [("a", node (j 1) [("b", j 5)])], .map [("b", .map [("b", j 5)])],
    node (j 2) [("next", j 5)], node (j 2) [("next", .map [])],
    .num (.float (.dyadic 3 (-1))), .map [("a", node (j 1) [("next", j 5)])]]

theorem docWitnesses_wf : ∀ j ∈ docInstances ++ docWitnesses, (docData j).wf = true := by decide

/-- The rows the order through names adds for the tenth fragment's
documents: `subsumes` only where the order holds, by `leCoD`, and
`does_not_subsume` only where an instance refutes it. -/
theorem subsume_doc_co_rows_exact : ∀ g ∈ docCases, ∀ s ∈ docCases,
    ((leCoD 64 g.1 (docOf g.2) s.1 (docOf s.2)).isSome = true → LeD g.1 (docOf g.2) s.1 (docOf s.2)) ∧
    (∀ j ∈ docInstances ++ docWitnesses,
      checkR s.1 (s.1.readR (docOf s.2)) (docData j) = true →
      checkR g.1 (g.1.readR (docOf g.2)) (docData j) = false →
      ¬ LeD g.1 (docOf g.2) s.1 (docOf s.2)) :=
  fun g hg s hs => ⟨leCoD_sound, doc_witness_exact docCases_ok docWitnesses_wf g hg s hs⟩

/-- Recursions compared through their names: a list of nodes under two
names, over two names in turn, unrolled twice, wider and narrower; a
tree through a list's spread under two names, wider, and with leaves for
children; a list of cells that ends in a sealed empty map, under two
names and wider; and a map of maps through a map's spread under two
names. -/
def recCases : List (Decls × Val) :=
  let node (n next : Val) : Val := .map [("n", false, n), ("next", true, next)] none false
  let rec1 (k : String) (n : Val) : Decls := [(k, node n (.alias k))]
  let rec2 (n₁ n₂ : Val) : Decls := [("E", node n₁ (.alias "O")), ("O", node n₂ (.alias "E"))]
  let tree (k : String) (n : Val) : Decls :=
    [(k, .map [("v", false, n), ("kids", true, .list [] (some (.alias k)) false)] none false)]
  let cell (n next : Val) : Val := .map [("n", false, n), ("next", false, next)] none false
  let cells (k : String) (n : Val) : Decls :=
    [(k, .or [(0, .map [] none true), (0, cell n (.alias k))])]
  let dir (k : String) : Decls :=
    [(k, .map [("kids", true, .map [] (some (.alias k)) false)] none false)]
  [(rec1 "T" .integer, .alias "T"), (rec1 "U" .integer, .alias "U"),
    (rec2 .integer .integer, .alias "E"),
    (rec1 "T" .integer, node .integer (node .integer (.alias "T"))),
    (rec1 "W" .number, .alias "W"), (rec1 "S" (int 1), .alias "S"),
    (rec2 .integer .number, .alias "E"),
    (tree "R" .integer, .alias "R"), (tree "Q" .integer, .alias "Q"), (tree "Q" .number, .alias "Q"),
    (tree "R" .integer, .map [("v", false, .integer), ("kids", true,
      .list [] (some (.map [("v", false, .integer)] none false)) false)] none false),
    (cells "M" .integer, .alias "M"), (cells "N" .integer, .alias "N"), (cells "N" .number, .alias "N"),
    (dir "D", .alias "D"), (dir "C", .alias "C")]

/-- The instances that may tell two of them apart, each put under `v`. -/
def recInstances : List Data :=
  let half : Data := .num (.float (.dyadic 3 (-1)))
  let node (n : Data) (rest : List (String × Data)) : Data := .map (("n", n) :: rest)
  let leaf (n : Data) (rest : List (String × Data)) : Data := .map (("v", n) :: rest)
  [node (j 1) [], node half [], node (j 2) [], node (.str "a") [], .map [], j 1,
    node (j 1) [("next", node (j 1) [])], node (j 1) [("next", node half [])],
    node (j 1) [("next", node (j 2) [])],
    node (j 1) [("next", node (j 1) [("next", node half [])])],
    node (j 1) [("next", node (j 1) [("next", node (j 2) [])])],
    node (j 1) [("next", .map [])], node (j 1) [("next", j 5)], node half [("next", .map [])],
    node (j 1) [("next", node half [("next", .map [])])],
    leaf (j 1) [], leaf half [], leaf (j 1) [("kids", .list [])],
    leaf (j 1) [("kids", .list [leaf (j 1) []])], leaf (j 1) [("kids", .list [leaf half []])],
    leaf (j 1) [("kids", .list [j 5])],
    leaf (j 1) [("kids", .list [leaf (j 1) [("kids", .list [leaf half []])]])],
    leaf (j 1) [("kids", .list [leaf (j 1) [("kids", .list [j 5])]])],
    leaf (j 1) [("kids", j 5)],
    .map [("kids", .map [])], .map [("kids", .map [("a", .map [])])], .map [("kids", .map [("a", j 5)])],
    .map [("kids", .map [("a", .map [("kids", .map [("b", j 5)])])])], .map [("kids", j 5)],
    node (j 1) [("kids", j 5)], node (j 1) [("next", .map []), ("kids", j 5)]]

theorem recCases_ok : ∀ c ∈ recCases, c.1.guardedB = true ∧ c.1.bodiesCheckableB = true ∧
    (docOf c.2).checkableAB = true := by decide

theorem recInstances_wf : ∀ j ∈ recInstances, (docData j).wf = true := by decide

/-- Every row of the recursions' order is the definition's, as
`subsume_doc_co_rows_exact` makes the rows before them. -/
theorem subsume_rec_rows_exact : ∀ g ∈ recCases, ∀ s ∈ recCases,
    ((leCoD 64 g.1 (docOf g.2) s.1 (docOf s.2)).isSome = true → LeD g.1 (docOf g.2) s.1 (docOf s.2)) ∧
    (∀ j ∈ recInstances,
      checkR s.1 (s.1.readR (docOf s.2)) (docData j) = true →
      checkR g.1 (g.1.readR (docOf g.2)) (docData j) = false →
      ¬ LeD g.1 (docOf g.2) s.1 (docOf s.2)) :=
  fun g hg s hs => ⟨leCoD_sound, doc_witness_exact recCases_ok recInstances_wf g hg s hs⟩

/-- Rows for each pair of the documents `skip` doesn't answer, the
general first, where `leCoD` decides the order or an instance refutes
it. A pair with neither is the fragment's fault, not a row left out. -/
def subsumeRecRows (tag : String) (cases : List (Decls × Val)) (insts : List Data)
    (skip : Decls × Val → Decls × Val → Bool) : IO Unit := do
  let mut i := 0
  for g in cases do
    let gsrc ← docSrc g
    for s in cases do
      let ssrc ← docSrc s
      if !skip g s then
        let some want := recAnswer insts g s
          | throw (IO.userError s!"no answer for the pair {gsrc} and {ssrc}")
        IO.println (docRow tag i gsrc ssrc want)
        i := i + 1
