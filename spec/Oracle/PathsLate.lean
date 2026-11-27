import Oracle.Base

/-! The oracle's cases: PathsLate, split out of `Oracle.lean` so that each area builds on its own. -/

open Aontu
open Case

/-- The graph atoms as they read: an atom alone, required, optional and
at the root, which is no member of the output and admits what the data
gives; an atom met with `any`, a kind, a literal on either side and a
map, which leaves each as it is, and two atoms beside a literal the
data refuses; a relation whose atoms hold, `acyclic()` over a chain and
`inverse(k)` with its mirror written, the atoms before the value and
after it, in either order, and one written twice; a template that still
flows through the atoms, beside data it refuses; an atom beside a
relation with no value, required and optional; an `inverse` whose
argument is a number, holds a space, is empty or starts with a digit,
each no name, and one a name writes with `_` and `-`; a path through a
map an atom rides, beside data that refuses what it reads; atoms a name
brings; and atoms under `hide()` and `type()`. -/
def graphAtomCases : List (Decls × Val × Data) :=
  let lst (vs : List Val) : Val := .list vs none false
  let ac : Val := .call .acyclic []
  let inv (k : String) : Val := .call .inverse [str k]
  let r0 : Val := .call .relate []
  let d (v : Val) : Val := m [("a", m [("d", v)])]
  let chain (v : Val) : Val := m [("a", m [("d", v)]), ("b", m [])]
  let mirror (v : Val) : Val :=
    m [("a", m [("dependsOn", v)]), ("b", m [("usedBy", .meet r0 (lst [ad 0 ["a"]]))])]
  let toB : Val := lst [ad 0 ["b"]]
  [([], d ac, .map []),
    ([], d ac, .map [("a", .map [("d", j 1)])]),
    ([], d (inv "k"), .map []),
    ([], m [("a", .map [("d", true, ac)] none false)], .map []),
    ([], m [("d", ac)], .map []),
    ([], d (.meet ac .any), .map []),
    ([], d (.meet ac .integer), .map []),
    ([], d (.meet ac .integer), .map [("a", .map [("d", j 1)])]),
    ([], d (.meet ac .integer), .map [("a", .map [("d", .str "x")])]),
    ([], d (.meet ac (int 1)), .map []),
    ([], d (.meet (int 1) ac), .map []),
    ([], d (.meet ac (m [("x", int 1)])), .map []),
    ([], d (.meet (.meet ac (inv "k")) (int 1)), .map [("a", .map [("d", j 2)])]),
    ([], chain (.meet (.meet r0 ac) toB), .map []),
    ([], chain (.meet (.meet r0 toB) ac), .map []),
    ([], chain (.meet (.meet (.meet r0 ac) ac) toB), .map []),
    ([], mirror (.meet (.meet r0 (inv "usedBy")) toB), .map []),
    ([], mirror (.meet (.meet (.meet r0 (inv "usedBy")) ac) toB), .map []),
    ([], mirror (.meet (.meet (.meet r0 ac) (inv "usedBy")) toB), .map []),
    ([], mirror (.meet (.meet (.meet r0 toB) (inv "usedBy")) ac), .map []),
    ([], chain (.meet (.meet (.call .relate [m [("k", int 1)]]) ac) toB), .map []),
    ([], chain (.meet (.meet (.call .relate [m [("k", int 1)]]) ac) toB), .map [("b", .map [("k", j 2)])]),
    ([], d (.meet r0 ac), .map []),
    ([], m [("a", .map [("d", true, .meet r0 ac)] none false)], .map []),
    ([], m [("d", .meet r0 (.call .inverse [int 1]))], .map []),
    ([], m [("d", .meet r0 (inv "a b"))], .map []),
    ([], m [("d", .meet r0 (inv ""))], .map []),
    ([], m [("d", .meet (.meet r0 (inv "_x-1")) (lst []))], .map []),
    ([], m [("d", .meet (.meet r0 (inv "1x")) (lst []))], .map []),
    ([], m [("r", .meet ac (m [("a", int 1)])), ("q", p ["r", "a"])], .map []),
    ([], m [("r", .meet ac (m [("a", int 1)])), ("q", p ["r", "a"])], .map [("q", j 2)]),
    ([("R", .meet r0 ac)], chain (.meet (.alias "R") toB), .map []),
    ([], m [("x", hide (.meet (m [("a", int 1)]) ac)), ("y", type (.meet (lst [int 1]) (inv "k")))], .map [])]

set_option maxRecDepth 8192 in
theorem graphAtomCases_checkable : ∀ c ∈ graphAtomCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem graph_atom_verdict_exact : ∀ c ∈ graphAtomCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (graphAtomCases_checkable c hc).1 (graphAtomCases_checkable c hc).2 v

/-- `+` over an address, which reads as the text that spells it: beside
a string on either side, another address, a number, a float and a
boolean; a relative address, as it is written; between two strings; an
address a path reads, and one a preference holds on either side; beside
`null`, a list, a map and a kind, and the kind `path` beside a string,
where the `+` waits; and data that takes the text or refuses it. -/
def addrPlusCases : List (Decls × Val × Data) :=
  let pl (a b : Val) : Val := .call .plus [a, b]
  let doc (v : Val) : Val := m [("a", m []), ("b", m []), ("x", v)]
  let a := ad 0 ["a"]
  [([], doc (pl a (str "/n")), .map []),
    ([], doc (pl (str "n/") a), .map []),
    ([], doc (pl a (ad 0 ["b"])), .map []),
    ([], doc (pl a (int 1)), .map []),
    ([], doc (pl (int 1) a), .map []),
    ([], doc (pl a (.lit (.num (.float (.dyadic 3 (-1)))))), .map []),
    ([], doc (pl a (.lit (.bool true))), .map []),
    ([], doc (pl (ad 1 ["a"]) (str "/n")), .map []),
    ([], doc (pl (ad 2 ["q"]) (str "!")), .map []),
    ([], doc (pl (pl (str "<") a) (str ">")), .map []),
    ([], m [("a", m []), ("p", a), ("x", pl (p ["p"]) (str "/n"))], .map []),
    ([], doc (pl (.pref 1 a) (str "!")), .map []),
    ([], doc (pl a (.pref 1 (str "d"))), .map []),
    ([], doc (pl a (.lit .null)), .map []),
    ([], doc (pl a (.list [int 1] none false)), .map []),
    ([], doc (pl a (m [("b", int 1)])), .map []),
    ([], doc (pl a .string), .map []),
    ([], m [("p", .pathKind), ("x", pl (p ["p"]) (str "!"))], .map []),
    ([], doc (pl a (str "/n")), .map [("x", .str "$.a/n")]),
    ([], doc (pl a (str "/n")), .map [("x", .str "other")])]

set_option maxRecDepth 8192 in
theorem addrPlusCases_checkable : ∀ c ∈ addrPlusCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem addr_plus_verdict_exact : ∀ c ∈ addrPlusCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (addrPlusCases_checkable c hc).1 (addrPlusCases_checkable c hc).2 v

/-- A choice the meet or a dead arm settles to one arm is that arm for
a call (decisions 16 and 55 of the design note's §7, for every call
that reads a value): `+` over a number, a string and a list a path
reads, and one written in place; `upper`, `lower` and `add` over one;
an address a relation holds, under `+`; a fold, `join`, `pick` and
`sort` over a bag that is one, and over a bag whose element is one;
`each` and `pack` over a source that is one, and `apply` over one;
a choice the data settles, to either arm, beside data that takes the
sum and data that refuses it; arms written alike, which are one; a
choice of two arms that differ, which still waits, and the data
settling it; a written `nil` beside an arm and a conflict beside one;
and a settled choice under `hide()`. -/
def oneArmCases : List (Decls × Val × Data) :=
  let pl (a b : Val) : Val := .call .plus [a, b]
  let lsp (t : Val) : Val := .list [] (some t) false
  let lst (vs : List Val) : Val := .list vs none false
  let is : Val := .or [(0, .integer), (0, .string)]
  let mi : Val := .or [(0, m [("a", .integer)]), (0, .string)]
  let li : Val := .or [(0, lsp .integer), (0, .string)]
  let ls : Val := .or [(0, lsp .string), (0, .integer)]
  let one : Val := .meet is (int 1)
  let src : Val := .meet li (lst [int 7, int 8])
  let px : Val := p ["p"]
  let open1 : Val := m [("p", is), ("x", pl px (int 1))]
  let two : Val := m [("p", .or [(0, int 1), (0, int 2)]), ("x", pl px (int 1))]
  [([], m [("p", one), ("x", pl px (int 1))], .map []),
    ([], m [("x", pl one (int 1))], .map []),
    ([], m [("p", .meet is (str "a")), ("x", pl px (str "b"))], .map []),
    ([], m [("p", .meet li (lst [int 1])), ("x", pl px (lst [int 2]))], .map []),
    ([], m [("x", .call .upper [.meet is (str "a")])], .map []),
    ([], m [("p", .meet is (str "a")), ("x", .call .upper [px])], .map []),
    ([], m [("p", .meet is (str "AB")), ("x", .call .lower [px])], .map []),
    ([], m [("p", .meet is (int 2)), ("x", .call .add [px, int 1])], .map []),
    ([], m [("a", m []), ("p", .meet (.call .relate []) (ad 0 ["a"])), ("x", pl px (str "/n"))], .map []),
    ([], m [("a", m []), ("x", pl (.meet (.call .relate []) (ad 0 ["a"])) (str "/n"))], .map []),
    ([], m [("a", m []), ("p", .meet (.or [(0, .pathKind), (0, .string)]) (ad 0 ["a"])), ("x", pl px (str "/n"))],
      .map []),
    ([], m [("p", src), ("x", .call .sum [px])], .map []),
    ([], m [("p", .meet ls (lst [str "a", str "b"])), ("x", .call .join [px, str "-"])], .map []),
    ([], m [("p", .meet mi (m [("a", int 1)])), ("x", .call .pick [lst [px], str "a"])], .map []),
    ([], m [("p", one), ("x", .call .sum [lst [px, int 2]])], .map []),
    ([], m [("p", .meet is (str "a")), ("x", .call .join [lst [px, str "b"]])], .map []),
    ([], m [("p", .meet is (int 3)), ("x", .call .sort [lst [px, int 2]])], .map []),
    ([], m [("p", one), ("x", .call .sum [lst [px, px]])], .map []),
    ([], m [("p", src), ("x", .call .each [px, .hole])], .map []),
    ([], m [("p", .meet ls (lst [str "a", str "b"])), ("x", .call .pack [px, int 1])], .map []),
    ([], m [("p", one), ("x", .call .apply [px, .call .add [.hole, int 1]])], .map []),
    ([], m [("p", one), ("x", .call .each [lst [px, int 2], .call .add [.hole, int 1]])], .map []),
    ([], open1, .map []),
    ([], open1, .map [("p", j 1)]),
    ([], open1, .map [("p", .str "a")]),
    ([], open1, .map [("p", j 1), ("x", j 2)]),
    ([], open1, .map [("p", j 1), ("x", j 3)]),
    ([], m [("p", .meet (.or [(0, .integer), (0, .number), (0, .string)]) (int 1)), ("x", pl px (int 1))], .map []),
    ([], m [("p", .meet (.or [(0, int 1), (0, int 1)]) .integer), ("x", pl px (int 1))], .map []),
    ([], two, .map []),
    ([], two, .map [("p", j 2)]),
    ([], m [("x", .call .add [.or [(0, Val.void), (0, int 1)], int 1])], .map []),
    ([], m [("x", .call .upper [.or [(0, .meet (int 1) (int 2)), (0, str "a")]])], .map []),
    ([], m [("p", hide one), ("x", pl px (int 1))], .map [])]

set_option maxRecDepth 8192 in
theorem oneArmCases_checkable : ∀ c ∈ oneArmCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem one_arm_verdict_exact : ∀ c ∈ oneArmCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (oneArmCases_checkable c hc).1 (oneArmCases_checkable c hc).2 v

/-- What the graph atoms ask, judged by `vetG`. A cycle of two, of one
and of three, a chain, a cycle with a tail into it, a tail into a sink
and a diamond, each under `acyclic()`; a cycle nobody declares, one
under another key than the declared one, and one that runs through two
relations; a declaration far from the edge that closes the cycle, an
atom alone and one under `hide()`, and a hidden edge; a single address,
a map of addresses, a bag in a bag, and addresses written from where
the link stands. `inverse(k)` with its mirror, with none, with an empty
relation or the wrong end in its place, with no edge to mirror, and
with a mirror no relation holds; declared both ways, with an edge only
one way round among them; a relation that mirrors itself; two edges and
one mirror; both atoms kept and both broken. A broken graph beside a
member the data must give, the same once it gives it, and beside data
it refuses. Then the edges a default brings: a default among arms that
closes a cycle and one generation doesn't take, a lone default, two
ranks each way round, an atom in the default and in an arm not taken, a
mirror a default writes and one in an arm not taken, a default's edge
with no mirror, and a default member that holds the relation. Last, a
template that still flows, atoms a name brings, nodes that are a list's
elements, a relation that is a list's element, whose atom there
declares nothing and whose edges a declaration elsewhere judges, and an
optional relation. -/
def graphJudgeCases : List (Decls × Val × Data) :=
  let r0 : Val := .call .relate []
  let ac : Val := .call .acyclic []
  let inv (k : String) : Val := .call .inverse [str k]
  let node (n : String) (fs : List (String × Val)) : String × Val := (n, m fs)
  let dep (v : Val) : String × Val := ("dependsOn", v)
  let used (v : Val) : String × Val := ("usedBy", v)
  let to (ns : List String) : Val := lst (ns.map fun n => ad 0 [n])
  let R (v : Val) : Val := .meet r0 v
  let RA (v : Val) : Val := .meet (.meet r0 ac) v
  let RI (k : String) (v : Val) : Val := .meet (.meet r0 (inv k)) v
  let E : Data := .map []
  [([], m [node "a" [dep (RA (to ["b"]))], node "b" [dep (R (to ["a"]))]], E),
    ([], m [node "a" [dep (RA (to ["a"]))]], E),
    ([], m [node "a" [dep (RA (to ["b"]))], node "b" [dep (R (to ["c"]))], node "c" [dep (R (to ["a"]))]], E),
    ([], m [node "a" [dep (RA (to ["b"]))], node "b" [dep (R (to ["c"]))], node "c" [dep (R (to []))]], E),
    ([], m [node "t" [dep (RA (to ["a"]))], node "a" [dep (R (to ["b"]))], node "b" [dep (R (to ["a"]))]], E),
    ([], m [node "a" [dep (RA (to ["b", "c"]))], node "b" [dep (R (to ["c"]))], node "c" [dep (R (to []))]], E),
    ([], m [node "a" [dep (RA (to ["b", "c"]))], node "b" [dep (R (to ["d"]))], node "c" [dep (R (to ["d"]))], node "d" [dep (R (to []))]], E),
    ([], m [node "a" [dep (R (to ["b"]))], node "b" [dep (R (to ["a"]))]], E),
    ([], m [node "a" [dep (RA (to ["b"])), ("calls", R (to []))], node "b" [("calls", R (to ["a"]))]], E),
    ([], m [node "a" [dep (RA (to ["b"]))], node "b" [("calls", RA (to ["a"]))]], E),
    ([], m [node "a" [dep (R (to ["b"]))], node "b" [dep (RA (to ["a"]))]], E),
    ([], m [("rules", m [dep ac]), node "a" [dep (R (to ["b"]))], node "b" [dep (R (to ["a"]))]], E),
    ([], m [("rules", hide (m [dep ac])), node "a" [dep (R (to ["b"]))], node "b" [dep (R (to ["a"]))]], E),
    ([], m [node "a" [dep (hide (RA (to ["b"])))], node "b" [dep (R (to ["a"]))]], E),
    ([], m [node "a" [dep (RA (ad 0 ["b"]))], node "b" [dep (R (ad 0 ["a"]))]], E),
    ([], m [node "a" [dep (RA (m [("x", ad 0 ["b"])]))], node "b" [dep (R (m [("y", ad 0 ["a"])]))]], E),
    ([], m [node "a" [dep (RA (m [("x", lst [ad 0 ["b"]])]))], node "b" [dep (R (lst [m [("y", ad 0 ["a"])]]))]], E),
    ([], m [node "a" [dep (RA (lst [ad 2 ["b"]]))], node "b" [dep (R (lst [ad 2 ["a"]]))]], E),
    ([], m [node "a" [dep (RI "usedBy" (to ["b"]))], node "b" [used (R (to ["a"]))]], E),
    ([], m [node "a" [dep (RI "usedBy" (to ["b"]))], node "b" []], E),
    ([], m [node "a" [dep (RI "usedBy" (to ["b"]))], node "b" [used (R (to []))]], E),
    ([], m [node "a" [dep (RI "usedBy" (to ["b"]))], node "b" [used (R (to ["c"]))], node "c" []], E),
    ([], m [node "a" [dep (RI "usedBy" (to []))]], E),
    ([], m [node "a" [dep (RI "usedBy" (to ["b"]))], node "b" [used (to ["a"])]], E),
    ([], m [node "a" [dep (RI "usedBy" (to ["b"]))], node "b" [used (RI "dependsOn" (to ["a"]))]], E),
    ([], m [node "a" [dep (RI "usedBy" (to ["b"]))], node "b" [used (RI "dependsOn" (to ["a", "c"]))], node "c" []], E),
    ([], m [node "a" [("peer", RI "peer" (to ["b"]))], node "b" [("peer", R (to ["a"]))]], E),
    ([], m [node "a" [("peer", RI "peer" (to ["b"]))], node "b" [("peer", R (to []))]], E),
    ([], m [node "a" [dep (RI "usedBy" (to ["b", "c"]))], node "b" [used (R (to ["a"]))], node "c" []], E),
    ([], m [node "a" [dep (.meet (.meet (.meet r0 ac) (inv "usedBy")) (to ["b"]))], node "b" [used (R (to ["a"]))]], E),
    ([], m [node "a" [dep (.meet (.meet (.meet r0 ac) (inv "usedBy")) (to ["a"]))]], E),
    ([], m [("n", .integer), node "a" [dep (RA (to ["b"]))], node "b" [dep (R (to ["a"]))]], E),
    ([], m [("n", .integer), node "a" [dep (RA (to ["b"]))], node "b" [dep (R (to ["a"]))]], .map [("n", j 1)]),
    ([], m [("n", .integer), node "a" [dep (RA (to ["b"]))], node "b" [dep (R (to ["a"]))]], .map [("n", .str "x")]),
    ([], m [node "a" [dep (RA (.or [(1, to ["b"]), (0, to [])]))], node "b" [dep (R (to ["a"]))]], E),
    ([], m [node "a" [dep (RA (.or [(0, to ["b"]), (1, to [])]))], node "b" [dep (R (to ["a"]))]], E),
    ([], m [node "a" [dep (RA (.pref 1 (to ["b"])))], node "b" [dep (R (to ["a"]))]], E),
    ([], m [node "a" [dep (RA (.or [(2, to ["c"]), (1, to ["b"]), (0, to [])]))], node "b" [dep (R (to ["a"]))], node "c" []], E),
    ([], m [node "a" [dep (RA (.or [(1, to ["c"]), (2, to ["b"]), (0, to [])]))], node "b" [dep (R (to ["a"]))], node "c" []], E),
    ([], m [node "a" [dep (R (.or [(1, .meet ac (to ["b"])), (0, to [])]))], node "b" [dep (R (to ["a"]))]], E),
    ([], m [node "a" [dep (R (.or [(1, to ["b"]), (0, .meet ac (to []))]))], node "b" [dep (R (to ["a"]))]], E),
    ([], m [node "a" [dep (RI "usedBy" (to ["b"]))], node "b" [used (R (.or [(1, to ["a"]), (0, to [])]))]], E),
    ([], m [node "a" [dep (RI "usedBy" (to ["b"]))], node "b" [used (R (.or [(0, to ["a"]), (1, to [])]))]], E),
    ([], m [node "a" [dep (RI "usedBy" (.or [(1, to ["b"]), (0, to [])]))], node "b" []], E),
    ([], m [("a", .or [(1, m [dep (RA (to ["b"]))]), (0, m [("x", int 1)])]), node "b" [dep (R (to ["a"]))]], E),
    ([], m [node "a" [dep (.meet (.meet (.call .relate [m [("k", int 1)]]) ac) (to ["b"]))], node "b" [dep (R (to ["a"]))]], E),
    ([("R", .meet r0 ac)], m [node "a" [dep (.meet (.alias "R") (to ["b"]))], node "b" [dep (R (to ["a"]))]], E),
    ([], m [("xs", lst [m [dep (RA (lst [ad 0 ["xs", "1"]]))], m [dep (R (lst [ad 0 ["xs", "0"]]))]])], E),
    ([], m [node "a" [("deps", lst [RA (ad 0 ["b"])])], node "b" [("deps", lst [R (ad 0 ["a"])])]], E),
    ([], m [node "a" [("deps", lst [RA (ad 0 ["b"])])], node "b" [("deps", lst [R (ad 0 ["a"])])], ("rules", m [("deps", ac)])], E),
    ([], m [("a", .map [("dependsOn", true, RA (to ["b"]))] none false), node "b" [dep (R (to ["a"]))]], E)]

set_option maxRecDepth 8192 in
theorem graphJudgeCases_checkable : ∀ c ∈ graphJudgeCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem graph_judge_verdict_exact : ∀ c ∈ graphJudgeCases, ∀ (m : Mode) (v : Verdict),
    vetG m c.1 c.2.1 c.2.2 = v ↔ VetG m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetG_iff (graphJudgeCases_checkable c hc).1 (graphJudgeCases_checkable c hc).2 v

/-- A source that declares a name, loaded below the root, where no
declaration may stand: under a key, required and optional, in a list,
under two keys, and met with a map under a key, each an error; in an
arm of a disjunction, which fails alone, beside data the other arm
admits and data it refuses; a source that loads one at its own top,
at the root and under a key; a source that loads one under a key of its
own, at the root; a source that declares nothing, under a key; a
destructure under a key, which takes the source's names where it
stands, and a plain load of the same source there; and a load in a
declaration's body, of a source that declares and of one that doesn't,
the body used and not. -/
def belowRootCases : List (Decls × Val × Data) :=
  let take (s : String) (names : List String) : Val := .call .load (.lit (.str (fx s)) :: names.map str)
  let files : Decls :=
    Decls.ofSource (fx "alias_declares_u.aontu") [("u", int 7)] (m [("y", int 1)]) ++
    Decls.ofSource (fx "alias_reexport.aontu") [] (ld "./alias_declares_u.aontu") ["u"] ++
    Decls.ofSource (fx "alias_keys_u.aontu") [] (m [("k", ld "./alias_declares_u.aontu")]) ++
    Decls.ofSource (fx "alias_exports.aontu") [("uint8", int 255), ("secret", str "shh")]
      (m [("defaults", m [("retries", int 3)])]) ["uint8"] ++
    [("@" ++ fx "foo.aontu", m [("f", int 11)])]
  let u : Val := ld (fx "alias_declares_u.aontu")
  [(files, m [("x", u)], dm []),
    (files, .map [("x", true, u)] none false, dm []),
    (files, m [("x", lst [u])], dm []),
    (files, m [("x", m [("y", u)])], dm []),
    (files, m [("x", .meet (m [("a", int 1)]) u)], dm []),
    (files, m [("x", .or [(0, u), (0, int 1)])], dm []),
    (files, m [("x", .or [(0, u), (0, int 1)])], dm [("x", j 1)]),
    (files, m [("x", .or [(0, u), (0, int 1)])], dm [("x", j 2)]),
    (files, m [("x", ld (fx "alias_reexport.aontu"))], dm []),
    (files, ld (fx "alias_keys_u.aontu"), dm []),
    (files, m [("x", ld (fx "alias_keys_u.aontu"))], dm []),
    (files, m [("x", ld (fx "foo.aontu"))], dm []),
    (files, m [("x", take "alias_exports.aontu" ["uint8", "uint8"]), ("q", .alias "uint8")], dm []),
    (files, m [("x", take "alias_exports.aontu" ["uint8", "uint8"]), ("q", .alias "uint8")], dm [("q", j 254)]),
    (files, m [("x", ld (fx "alias_exports.aontu"))], dm []),
    (("m", u) :: files, m [("w", .alias "m")], dm []),
    (("m", u) :: files, m [("w", int 1)], dm []),
    (("m", ld (fx "foo.aontu")) :: files, m [("w", .alias "m")], dm [])]

theorem belowRootCases_checkable : ∀ c ∈ belowRootCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem below_root_verdict_exact : ∀ c ∈ belowRootCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (belowRootCases_checkable c hc).1 (belowRootCases_checkable c hc).2 v

/-- `apply(v, f)` with a relative path in `f`, read where the call
stands, as the paths read it: a sibling read from a literal, a sibling
the hole fills, beside data that writes it and data that refuses it, and
a path that climbs out of the instance. -/
def applyPathCases : List (Decls × Val × Data) :=
  let ap (v f : Val) : Val := .call .apply [v, f]
  [([], m [("v", ap (int 1) (m [("k", rel 1 ["z"]), ("z", int 4)]))], dm [("v", dm [("k", j 4), ("z", j 4)])]),
    ([], m [("v", ap (int 1) (m [("k", rel 1 ["z"]), ("z", .hole)]))], dm [("v", dm [("k", j 1), ("z", j 1)])]),
    ([], m [("v", ap (int 1) (m [("k", rel 1 ["z"]), ("z", .hole)]))], dm [("v", dm [("k", j 2), ("z", j 1)])]),
    ([], m [("n", int 2), ("v", ap (int 1) (m [("k", rel 2 ["n"])]))], dm [("v", dm [("k", j 2)])])]

theorem applyPathCases_checkable : ∀ c ∈ applyPathCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem apply_path_verdict_exact : ∀ c ∈ applyPathCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (applyPathCases_checkable c hc).1 (applyPathCases_checkable c hc).2 v

/-- The later fragments of the `paths` rows, an action of their own so
that no one action nests deeper than the C compiler reads. -/
def pathRowsLate : IO Unit := do
  IO.println "# The graph atoms `acyclic()` and `inverse(k)`, in rows ga0 on, as they read:"
  IO.println "# an atom rides the value it meets and leaves it as it is, one alone is no"
  IO.println "# member of the output, a template still flows through one, and an `inverse`"
  IO.println "# whose argument is no name is the schema's error. Every document here keeps"
  IO.println "# what its atoms ask; rows gj0 on hold those that don't."
  pathRows "ga" graphAtomCases
  IO.println "# `+` over an address, in rows ap0 on, which reads as the text that spells it."
  pathRows "ap" addrPlusCases
  IO.println "# A choice the meet or a dead arm settles to one arm is that arm for a call,"
  IO.println "# in rows oa0 on: an operand of `+`, `upper`, `lower` and `add`, a bag a fold,"
  IO.println "# `join`, `pick` or `sort` reads and an element of one, and the source of"
  IO.println "# `each` and `pack`, where the schema settles the choice and where the data does."
  pathRows "oa" oneArmCases
  IO.println "# What the graph atoms ask, in rows gj0 on, with the one class `vetG` gives,"
  IO.println "# which `vetG_iff` makes the definition's own: `invalid` where the document"
  IO.println "# generates and the graph it writes breaks an atom, and `vetP`'s class anywhere"
  IO.println "# else. `acyclic()` asks that its relation hold no cycle, and `inverse(k)` that"
  IO.println "# each of its edges be mirrored under `k`. A declaration holds for its key"
  IO.println "# wherever an edge of it is written, a document that waits isn't judged, and a"
  IO.println "# default's edges are edges, where an arm generation doesn't take brings none."
  pathRows "gj" graphJudgeCases (verdict := vetG)
  IO.println "# A source that declares a name, loaded below the root, in rows lu0 on. A"
  IO.println "# declaration stands only at the root, so a plain load of such a source"
  IO.println "# under a key, in a list or in a declaration's body is a conflict where it"
  IO.println "# stands: the schema's error, or the end of its arm alone in a disjunction."
  IO.println "# A source it's loaded through at that source's own top brings it too. A"
  IO.println "# destructure takes the names where it stands, so it loads anywhere, as does"
  IO.println "# a source that declares nothing."
  pathRows "lu" belowRootCases
