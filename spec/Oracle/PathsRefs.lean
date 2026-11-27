import Oracle.Base
-- For order only: the four largest modules each need several gigabytes, so they build one at a time.
import Oracle.Gen

/-! The oracle's cases: PathsRefs, split out of `Oracle.lean` so that each area builds on its own. -/

open Aontu
open Case

/-- Paths through the riders, which a path reads through as through
nothing (decision 14 of the design note's §7): into a `meta()` from
outside it, to a member under a `deprecate()`, by index into a rider's
list, and from inside a rider's value to a member beside it. -/
def riderPathCases : List (Decls × Val × Data) :=
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

/-- A body read at the alias's own place (`Seg.own`), used or not: an error where a path names nothing there or meets
a conflict there, whatever its uses read, and a body that is itself a
relative path read there at each use too. Both ports read these alike in
either order, so the rows hold them with each declaration written before
the schema and again after it. -/
def aliasPlaceCases : List (Decls × Val × Data) :=
  [([("T", m [("v", rel 2 ["x"])])], m [("a", m [("x", int 2), ("b", .alias "T")])], .map []),
    ([("T", m [("v", .meet (rel 2 ["x"]) (int 1))])], m [("x", int 2), ("a", m [("x", int 1), ("b", .alias "T")])],
      .map []),
    ([("T", m [("v", rel 2 ["x"])])], m [("y", int 1)], .map []),
    ([("T", m [("v", rel 1 ["w"])])], m [("a", m [("b", .meet (.alias "T") (m [("w", int 3)]))])], .map []),
    ([("T", rel 2 ["x"])], m [("x", int 1), ("a", m [("x", int 2), ("b", .alias "T")])], .map []),
    ([("T", rel 1 ["x"])], m [("x", int 1), ("a", m [("x", int 2), ("b", .alias "T")])], .map [("a", .map [("b", j 1)])]),
    ([("T", rel 1 ["x"])], m [("x", int 1), ("a", m [("x", int 2), ("b", .alias "T")])], .map [("a", .map [("b", j 2)])])]

/-- Relative paths in a body that name the body's own members, read at
the body's own place (`Seg.own`), where both ports hold the body: used and not, met with a conflict there and at a
use, through a list, a member that isn't concrete, and a name declared
twice; and a chain of paths there, a path through a member that is itself
a path, of one step and two, used, naming nothing and met with a
conflict (#664), with a path the schema writes to a body member the
body's own paths don't name, which names nothing, as no body's place is
the schema's; a link's template met into a member of its own body
there, read by a path at the place, one deeper, met with a conflict, and
read at a use of the name (#664); and a path the schema writes to a
body member a body's own path names too, which names nothing as well,
since no path the schema writes starts at a body's own place (#721). -/
def bodyPlaceCases : List (Decls × Val × Data) :=
  let xy : Val := m [("x", int 1), ("y", rel 1 ["x"])]
  let chain (y : Val) : Val := m [("x", .path [.key "a"]), ("y", y)]
  let ak : Val := m [("a", m [("k", int 1)])]
  let lk (t : Val) : Val := .meet (.call .relate [t]) (.addr ⟨1, ["m"]⟩)
  let lb (mv t : Val) (ks : List String) : Val := m [("m", mv), ("n", lk t), ("z", rel 1 ("m" :: ks))]
  [([("T", xy)], m [], .map []),
    ([("T", xy)], m [("z", .alias "T")], .map []),
    ([("T", m [("x", int 1), ("y", .meet (rel 1 ["x"]) (int 2))])], m [], .map []),
    ([("T", m [("x", m [("a", int 1)]), ("y", rel 1 ["x"])])],
      m [("z", .meet (.alias "T") (m [("x", m [("b", int 2)])]))], .map []),
    ([("T", .list [int 1, .path [.up 1, .idx 0]] none false)], m [("z", .alias "T")], .map []),
    ([("T", m [("x", .string), ("y", rel 1 ["x"])])], m [("z", .alias "T")], .map []),
    ([("T", xy)], m [("z", .meet (.alias "T") (m [("x", int 2)]))], .map []),
    ([("T", m [("x", int 1)]), ("T", m [("y", rel 1 ["x"])])], m [], .map []),
    ([("T", m [("x", int 1)])], m [("y", .path [.key "%T", .key "x"])], .map [("y", .integer 1 (by decide))]),
    ([("T", chain (rel 1 ["x", "k"]))], ak, .map []),
    ([("T", m [("x", .path [.key "a"]), ("y", rel 1 ["x", "b"]), ("z", rel 1 ["y", "k"])])],
      m [("a", m [("b", m [("k", int 1)])])], .map []),
    ([("T", chain (rel 1 ["x", "k"]))], m [("a", m [("k", int 1)]), ("b", .alias "T")],
      .map [("b", .map [("x", .map [("k", j 1)]), ("y", j 1)])]),
    ([("T", chain (rel 1 ["x", "k"]))], m [("a", m [("j", int 1)])], .map []),
    ([("T", chain (.meet (rel 1 ["x", "k"]) (int 2)))], ak, .map []),
    ([("T", xy)], m [("z", .path [.key "%T", .key "y"])], .map [("z", j 1)]),
    ([("T", lb (m []) (m [("k", int 1)]) ["k"])], m [], .map []),
    ([("T", lb (m []) (m [("k", m [("j", int 1)])]) ["k", "j"])], m [], .map []),
    ([("T", lb (m [("k", int 2)]) (m [("k", int 1)]) ["k"])], m [], .map []),
    ([("T", lb (m []) (m [("k", int 1)]) ["k"])], m [("a", .alias "T")], .map []),
    ([("T", xy)], m [("z", .path [.key "%T", .key "x"])], .map [("z", j 1)])]

/-- A call in a recursive name's body, made where the body unfolds, as
both ports make it wherever the body stands (#663): a `pref`, a `copy`
and a `relate` over the name itself, which wait on the recursion, the
`copy` with data that supplies its member and data that refuses it;
an `upper`, a `copy`, a `relate` and a `super` beside the name, the
`upper` with data that matches what it makes and data that doesn't;
a `match` over a literal, and an `upper` over a path to the body's own
member (#403); and a link in the body whose template is the name and
whose target is the body's own member, read where the name is used and
where it's only declared, beside data that agrees and data that
refuses (#663). -/
def recursiveCallCases : List (Decls × Val × Data) :=
  let tB (n : Val) : Val := m [("m", m []), ("n", n)]
  let tO (n : Val) : Val := .map [("m", false, m []), ("n", false, n), ("o", true, .alias "T")] none false
  let tP (fs : List (String × Val)) : Val :=
    .map ((fs.map fun f => (f.1, false, f.2)) ++ [("o", true, .alias "T")]) none false
  let rel (k : String) : Val := .path [.up 1, .key k]
  let xT : Val := m [("x", .meet (m []) (.alias "T"))]
  let xd (n : Data) : Data := .map [("x", .map [("m", .map []), ("n", n)])]
  let tR : Val := tB (.meet (.call .relate [.alias "T"]) (.addr ⟨1, ["m"]⟩))
  [([("T", tB (.call .pref [.alias "T"]))], xT, .map []),
    ([("T", tB (.call .copy [.alias "T"]))], xT, .map []),
    ([("T", tB (.call .relate [.alias "T"]))], xT, .map []),
    ([("T", tB (.call .copy [.alias "T"]))], xT, xd (.map [("m", .map [])])),
    ([("T", tB (.call .copy [.alias "T"]))], xT, xd (.integer 1 (by decide))),
    ([("T", tO (.call .upper [.lit (.str "x")]))], xT, .map []),
    ([("T", tO (.call .upper [.lit (.str "x")]))], xT, xd (.str "X")),
    ([("T", tO (.call .upper [.lit (.str "x")]))], xT, xd (.str "x")),
    ([("T", tO (.call .copy [m [("k", int 1)]]))], xT, .map []),
    ([("T", tO (.call .relate [m [("k", int 1)]]))], xT, .map []),
    ([("T", tO (.call .super [int 1]))], xT, .map []),
    ([("T", tO (.select (.lit (.str "a")) [(.lit (.str "a"), int 1), (.lit (.str "b"), int 2)] none))], xT, .map []),
    ([("T", tP [("s", .lit (.str "x")), ("u", .call .upper [rel "s"])])], xT, .map []),
    ([("T", tR)], xT, .map []),
    ([("T", tR)], m [], .map []),
    ([("T", tR)], xT, .map [("x", .map [("m", .map [])])]),
    ([("T", tR)], xT, .map [("x", .map [("m", .map [("m", .map [])])])]),
    ([("T", tR)], xT, .map [("x", .map [("m", .integer 1 (by decide))])])]

/-- A link at a body's own place whose target another link's template
makes there (#664): the body read where it's only declared, each pass
over its place reading the place the last one made, and two templates
that conflict once the chain lands. -/
def bodyChainCases : List (Decls × Val × Data) :=
  let rf (t : Val) (ks : List String) : Val := .meet (.call .relate [t]) (.addr ⟨1, ks⟩)
  [([("T", m [("m", m []), ("n", rf (m [("q", m [])]) ["m"]), ("o", rf (m [("k", int 1)]) ["m", "q"]),
      ("z", .path [.up 1, .key "m", .key "q", .key "k"])])], m [], .map []),
    ([("T", m [("m", m []), ("n", rf (m [("q", m [("k", int 1)])]) ["m"]), ("o", rf (m [("k", int 2)]) ["m", "q"])])],
      m [], .map [])]

/-- A path into what a call in a recursive name's body makes, the name
used where the path reads it, as both ports make the call wherever the
body stands: a `copy`, an `upper` and a `+`, and a `copy` one unfolding
down, each beside data that agrees and data that refuses. -/
def bodyCallPathCases : List (Decls × Val × Data) :=
  let tO (n : Val) : Val := .map [("n", false, n), ("o", true, .alias "T")] none false
  let xT (x : Val) (p : List String) : Val := m [("x", .meet x (.alias "T")), ("y", .path (p.map .key))]
  let cp : Decls := [("T", tO (.call .copy [m [("k", int 1)]]))]
  let up : Decls := [("T", tO (.call .upper [.lit (.str "a")]))]
  let pl : Decls := [("T", tO (.call .plus [int 1, int 2]))]
  [(cp, xT (m []) ["x", "n", "k"], .map []),
    (cp, xT (m []) ["x", "n", "k"], .map [("y", j 1)]),
    (cp, xT (m []) ["x", "n", "k"], .map [("y", j 2)]),
    (cp, xT (m []) ["x", "n", "k"], .map [("x", .map [("n", .map [("k", j 2)])])]),
    (up, xT (m []) ["x", "n"], .map []),
    (up, xT (m []) ["x", "n"], .map [("y", .str "a")]),
    (pl, xT (m []) ["x", "n"], .map []),
    (pl, xT (m []) ["x", "n"], .map [("y", j 2)]),
    (cp, xT (m [("o", m [])]) ["x", "o", "n", "k"], .map []),
    (cp, xT (m [("o", m [])]) ["x", "o", "n", "k"], .map [("y", j 2)])]

/-- A recursive name used alone whose body links to its own member
(#762): the definition keeps the use residual where no data reaches
it, as it keeps one with no link, so the schema generates nothing
there, where both ports expand it for the link; and the use with data
at it, which both read alike. -/
def loneLinkCases : List (Decls × Val × Data) :=
  let tR : Val := m [("m", m []), ("n", .meet (.call .relate [.alias "T"]) (.addr ⟨1, ["m"]⟩))]
  [([("T", tR)], m [("x", .alias "T")], .map []),
    ([("T", tR)], m [("x", .alias "T")], .map [("x", .map [])]),
    ([("T", tR)], m [("x", .alias "T")], .map [("x", .map [("m", .map [])])])]

/-- Relative paths, made absolute where each stands: a sibling, a climb
of two steps and three, a key in quotes, an index into a sibling list,
a list's element reading its sibling, a chain of relative paths, a
relative path in a call, and a body's, read at the body's own place
(`Seg.own`), as both ports place it, with
`aliasPlaceCases`; a call in a recursive name's body
(`recursiveCallCases`); a path into what such a call makes
(`bodyCallPathCases`); and a recursive name used alone whose body links
to its own member (`loneLinkCases`). -/
def relPathCases : List (Decls × Val × Data) :=
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
    ([("T", m [("y", rel 1 ["x"])])], m [("a", .meet (m [("x", int 1)]) (.alias "T"))], .map [("a", .map [("y", j 1)])])] ++
  aliasPlaceCases ++ bodyPlaceCases ++ recursiveCallCases ++ bodyChainCases ++ bodyCallPathCases ++
    loneLinkCases

theorem relPathCases_checkable : ∀ c ∈ relPathCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem rel_path_verdict_exact : ∀ c ∈ relPathCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (relPathCases_checkable c hc).1 (relPathCases_checkable c hc).2 v

/-- A selection in a recursive name's body, made where the body unfolds,
as both ports make it wherever the body stands (#403): a `match` over a
path to the body's own member, and a `filter` over a literal and over
such a path. -/
def recursiveSelectCases : List (Decls × Val × Data) :=
  let tP (fs : List (String × Val)) : Val :=
    .map ((fs.map fun f => (f.1, false, f.2)) ++ [("o", true, .alias "T")]) none false
  let rel (k : String) : Val := .path [.up 1, .key k]
  let xT : Val := m [("x", .meet (m []) (.alias "T"))]
  [([("T", tP [("kind", .lit (.str "b")),
      ("v", .select (rel "kind") [(.lit (.str "a"), int 1), (.lit (.str "b"), int 2)] none)])], xT, .map []),
    ([("T", tP [("k", .filter (m [("a", int 1), ("b", .lit (.str "x"))]) .integer)])], xT, .map []),
    ([("T", tP [("c", m [("a", int 1), ("b", .lit (.str "x"))]), ("k", .filter (rel "c") .integer)])], xT, .map [])]

set_option maxRecDepth 16384 in
set_option maxHeartbeats 2000000 in
/-- The checker can't read a selection before the reading makes it, so
each case's reading with the data is read whole (`Decls.readsPD`). -/
theorem recursiveSelectCases_reads : ∀ c ∈ recursiveSelectCases, c.1.readsPD c.2.1 c.2.2 = true := by
  decide +kernel

theorem recursiveSelect_verdict_exact : ∀ c ∈ recursiveSelectCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff_readsD (recursiveSelectCases_reads c hc) v

/-- A use of a name whose body writes a relative path reads the path
where the use stands (ruling 26): a climb out of the body at a use whose
place holds its own target, a name used at two places that read two
values, and a name whose body uses another such name, its copy read at
the copy of the use. Both ports' `vet` reads these at each use in either
order, so the rows hold them with each declaration written before the
schema and again after it. -/
def copyDestCases : List (Decls × Val × Data) :=
  let tv : Decls := [("T", m [("v", rel 2 ["x"])])]
  let one := m [("x", int 1), ("a", m [("x", int 2), ("b", .alias "T")])]
  let two := m [("x", int 1), ("a", m [("x", int 2), ("b", .alias "T")]), ("c", m [("x", int 3), ("d", .alias "T")])]
  let nest : Decls := [("U", m [("w", rel 2 ["y"])]), ("T", m [("u", .alias "U"), ("y", int 3)])]
  [(tv, one, .map [("a", .map [("b", .map [("v", j 2)])])]),
    (tv, one, .map [("a", .map [("b", .map [("v", j 1)])])]),
    (tv, two, .map [("a", .map [("b", .map [("v", j 2)])]), ("c", .map [("d", .map [("v", j 3)])])]),
    (tv, two, .map [("a", .map [("b", .map [("v", j 2)])]), ("c", .map [("d", .map [("v", j 2)])])]),
    (tv, m [("x", int 1), ("b", .alias "T")], .map [("b", .map [("v", j 1)])]),
    (nest, m [("y", int 1), ("a", m [("b", .alias "T")])], .map [("a", .map [("b", .map [("u", .map [("w", j 3)])])])]),
    (nest, m [("y", int 1), ("a", m [("b", .alias "T")])], .map [("a", .map [("b", .map [("u", .map [("w", j 1)])])])])]

theorem copyDestCases_checkable : ∀ c ∈ copyDestCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem copy_dest_verdict_exact : ∀ c ∈ copyDestCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (copyDestCases_checkable c hc).1 (copyDestCases_checkable c hc).2 v

/-- One document in three orders: a type and a subtype of it
that name each other by path, with the subtype written first, with the
type written first, and with the use written above both. -/
def orderSchemas : List Val :=
  let s (x : String) : Val := .lit (.str x)
  let n : Val := mo [("k", false, .or [(0, s "d"), (0, s "f")]), ("up", true, p ["s", "D"])]
  let d : Val := .meet (p ["s", "N"]) (m [("k", s "d")])
  let use : Val := .meet (p ["s", "N"]) (m [("k", s "d")])
  [m [("s", .ride .hide (m [("D", d), ("N", n)]) []), ("doc", use)],
    m [("s", .ride .hide (m [("N", n), ("D", d)]) []), ("doc", use)],
    m [("doc", use), ("s", .ride .hide (m [("N", n), ("D", d)]) [])]]

/-- The data the three orders are read against: none, data that keeps
the type two levels down, and data that breaks it there. -/
def orderData : List Data :=
  let k (x : String) (up : List (String × Data)) : Data := .map (("k", .str x) :: up)
  [.map [], .map [("doc", k "d" [("up", k "d" [])])], .map [("doc", k "d" [("up", k "f" [])])]]

def orderCases : List (Decls × Val × Data) :=
  orderSchemas.flatMap fun S => orderData.map fun j => ([], S, j)

theorem orderCases_checkable : ∀ c ∈ orderCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem order_verdict_exact : ∀ c ∈ orderCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (orderCases_checkable c hc).1 (orderCases_checkable c hc).2 v

/-- The three schemas are one value in three orders, as `Val.Reordered`
says it: the members of the hidden block swapped, and the members of
the document. -/
theorem orderSchemas_reordered : ∀ S ∈ orderSchemas, ∀ S' ∈ orderSchemas, S.Reordered S' := by
  have first : ∀ S ∈ orderSchemas, (orderSchemas.headD .any).Reordered S := by
    intro S hS
    simp only [orderSchemas, List.mem_cons, List.not_mem_nil, or_false] at hS
    rcases hS with rfl | rfl | rfl
    · exact .refl _
    · exact .member [] _ "s" false none false (.ride .hide [] (.members none false (.swap _ _ _)))
    · exact .trans
        (.member [] _ "s" false none false (.ride .hide [] (.members none false (.swap _ _ _))))
        (.members none false (.swap _ _ _))
  exact fun S hS S' hS' => .trans (.symm (first S hS)) (first S' hS')

/-- The verdict of the order `i` against the datum `k`, in the default
mode. -/
def orderVerdict (i k : ℕ) : Verdict :=
  vetP {} [] (orderSchemas.getD i .any) (orderData.getD k (.map []))

/-! Each order against each datum, one evaluation to a theorem: the nine
together are more than one check holds in memory. -/

set_option maxHeartbeats 1000000 in
theorem orderVerdict_0_0 : orderVerdict 0 0 = .valid := by decide

set_option maxHeartbeats 1000000 in
theorem orderVerdict_0_1 : orderVerdict 0 1 = .valid := by decide

set_option maxHeartbeats 1000000 in
theorem orderVerdict_0_2 : orderVerdict 0 2 = .invalid := by decide

set_option maxHeartbeats 1000000 in
theorem orderVerdict_1_0 : orderVerdict 1 0 = .valid := by decide

set_option maxHeartbeats 1000000 in
theorem orderVerdict_1_1 : orderVerdict 1 1 = .valid := by decide

set_option maxHeartbeats 1000000 in
theorem orderVerdict_1_2 : orderVerdict 1 2 = .invalid := by decide

set_option maxHeartbeats 1000000 in
theorem orderVerdict_2_0 : orderVerdict 2 0 = .valid := by decide

set_option maxHeartbeats 1000000 in
theorem orderVerdict_2_1 : orderVerdict 2 1 = .valid := by decide

set_option maxHeartbeats 1000000 in
theorem orderVerdict_2_2 : orderVerdict 2 2 = .invalid := by decide

/-- The definition reads the three orders alike in the default mode:
each is `valid` where the data supplies nothing, `valid` on the data
that keeps the type and `invalid` on the data that breaks it. -/
theorem order_verdicts_agree : ∀ i, i < 3 → ∀ k, k < 3 → orderVerdict i k = orderVerdict 0 k
  | 0, _, _, _ => rfl
  | 1, _, 0, _ => orderVerdict_1_0.trans orderVerdict_0_0.symm
  | 1, _, 1, _ => orderVerdict_1_1.trans orderVerdict_0_1.symm
  | 1, _, 2, _ => orderVerdict_1_2.trans orderVerdict_0_2.symm
  | 2, _, 0, _ => orderVerdict_2_0.trans orderVerdict_0_0.symm
  | 2, _, 1, _ => orderVerdict_2_1.trans orderVerdict_0_1.symm
  | 2, _, 2, _ => orderVerdict_2_2.trans orderVerdict_0_2.symm

/-- Definitions that reach each other by path, read as names that reach
each other are: a path that reaches itself through other paths names a
recursion, so a use of it alone stays residual and one met with a map
unfolds, in whatever order the document is written. A required member
that names a definition with an optional way back, in three orders, met
with data and used bare; two definitions that reach each other through
optional members; a pair where one holds a set of the other; a ring of
three, two of them meets; a list's element that names itself, and two
elements that name each other; a relation whose template is a subtype
of the type that declares it, by name and by path, with a link that
keeps the subtype and one that breaks it; and a copy of a link whose
template reads the copy, which is no recursion. -/
def mutualPathCases : List (Decls × Val × Data) :=
  let rl (t : Val) : Val := .call .relate [t]
  let kd : Val := .or [(0, str "d"), (0, str "f")]
  let block (fs : List (String × Val)) : Val := hide (m fs)
  let rA : Val := m [("b", p ["s", "B"])]
  let rB : Val := mo [("x", false, int 1), ("a", true, p ["s", "A"])]
  let useA : Val := .meet (p ["s", "A"]) (m [])
  let oN : Val := mo [("up", true, p ["s", "D"])]
  let oD : Val := mo [("inner", true, p ["s", "N"])]
  let useN : Val := .meet (p ["s", "N"]) (m [])
  let pair : Val := m [("Person", hide (mo [("name", false, .string), ("employer", true, p ["Company"])])),
    ("Company", hide (m [("title", .string), ("staff", tmpl (p ["Person"]))])), ("acme", p ["Company"])]
  let sam (extra : List (String × Data)) : Data :=
    dm [("acme", dm [("title", .str "Acme"), ("staff", dm [("sam", dm (("name", .str "Sam") :: extra))])])]
  let gA : Val := mo [("k", false, .integer), ("b", true, p ["s", "B"])]
  let gB : Val := .meet (p ["s", "C"]) (m [("j", int 2)])
  let gC : Val := .meet (p ["s", "A"]) (m [("i", int 3)])
  let ring : Val := block [("A", gA), ("B", gB), ("C", gC)]
  let useK : Val := .meet (p ["s", "A"]) (m [("k", int 1)])
  let x0 : Val := .path [.key "xs", .idx 0]
  let xs (next : Val) : Val := hide (.list [mo [("v", false, .integer), ("next", true, next)]] none false)
  let ys : Val := hide (.list [.meet x0 (m [("w", int 1)])] none false)
  let nd (v : Data) (more : List (String × Data)) : Data := dm (("v", v) :: more)
  let dN : Decls := [("N", mo [("name", false, .string), ("kind", false, kd), ("up", true, rl (.alias "D"))]),
    ("D", .meet (.alias "N") (m [("kind", str "d")]))]
  let named (ak : String) : Val := .meet (tmpl (.alias "N")) (m [("a", m [("name", str "a"), ("kind", str ak)]),
    ("b", m [("name", str "b"), ("kind", str "f"), ("up", .addr ⟨0, ["n", "a"]⟩)])])
  let tN : Val := mo [("k", false, kd), ("up", true, rl (p ["t", "D"]))]
  let tD : Val := .meet (p ["t", "N"]) (m [("k", str "d")])
  let nodes (ak : String) : Val := .meet (tmpl (p ["t", "N"]))
    (m [("a", m [("k", str ak)]), ("b", m [("k", str "f"), ("up", .addr ⟨0, ["n", "a"]⟩)])])
  [([], m [("s", block [("A", rA), ("B", rB)]), ("doc", useA)], dm []),
    ([], m [("s", block [("B", rB), ("A", rA)]), ("doc", useA)], dm []),
    ([], m [("doc", useA), ("s", block [("A", rA), ("B", rB)])], dm []),
    ([], m [("s", block [("A", rA), ("B", rB)]), ("doc", useA)], dm [("doc", dm [("b", dm [])])]),
    ([], m [("s", block [("A", rA), ("B", rB)]), ("doc", p ["s", "A"])], dm []),
    ([], m [("s", block [("N", oN), ("D", oD)]), ("doc", useN)], dm []),
    ([], m [("doc", useN), ("s", block [("N", oN), ("D", oD)])], dm []),
    ([], m [("doc", useN), ("s", block [("N", oN), ("D", oD)])],
      dm [("doc", dm [("up", dm [("inner", dm [("up", dm [])])])])]),
    ([], pair, sam []),
    ([], pair, sam [("employer", dm [("staff", dm [])])]),
    ([], pair, sam [("employer", dm [("title", .str "Acme"), ("staff", dm [])])]),
    ([], m [("s", ring), ("doc", useK)], dm []),
    ([], m [("doc", useK), ("s", ring)], dm []),
    ([], m [("s", block [("C", gC), ("B", gB), ("A", gA)]), ("doc", useK)], dm []),
    ([], m [("s", ring), ("doc", p ["s", "A"])],
      dm [("doc", dm [("k", j 1), ("b", dm [("k", j 2), ("b", dm [("k", j 3)])])])]),
    ([], m [("doc", p ["s", "A"]), ("s", ring)],
      dm [("doc", dm [("k", j 1), ("b", dm [("k", j 2), ("b", dm [("k", j 3)])])])]),
    ([], m [("s", ring), ("doc", p ["s", "A"])], dm [("doc", dm [("k", j 1), ("b", dm [("k", j 2), ("j", j 5)])])]),
    ([], m [("xs", xs x0), ("doc", x0)], dm [("doc", nd (j 1) [("next", nd (j 2) [])])]),
    ([], m [("xs", xs x0), ("doc", x0)], dm [("doc", nd (j 1) [("next", nd (.str "x") [])])]),
    ([], m [("doc", x0), ("xs", xs x0)], dm [("doc", nd (j 1) [("next", nd (j 2) [("next", nd (j 3) [])])])]),
    ([], m [("xs", xs x0), ("doc", x0)], dm []),
    ([], m [("xs", xs (.path [.key "ys", .idx 0])), ("ys", ys), ("doc", x0)],
      dm [("doc", nd (j 1) [("next", nd (j 2) [])])]),
    ([], m [("doc", x0), ("xs", xs (.path [.key "ys", .idx 0])), ("ys", ys)],
      dm [("doc", nd (j 1) [("next", nd (j 2) [])])]),
    ([], m [("xs", xs (.path [.key "ys", .idx 0])), ("ys", ys), ("doc", x0)],
      dm [("doc", nd (j 1) [("next", nd (j 2) [("w", j 5)])])]),
    (dN, m [("x", int 1)], dm []),
    (dN, m [("n", named "d")], dm []),
    (dN.reverse, m [("n", named "d")], dm []),
    (dN, m [("n", named "f")], dm []),
    ([], m [("w", m [("a", .meet (rl (m [("x", p ["v"])])) (.addr ⟨0, ["b"]⟩))]), ("v", p ["w"]), ("b", m [])], dm []),
    ([], m [("t", block [("D", tD), ("N", tN)]), ("n", nodes "d")], dm []),
    ([], m [("t", block [("N", tN), ("D", tD)]), ("n", nodes "d")], dm []),
    ([], m [("n", nodes "d"), ("t", block [("N", tN), ("D", tD)])], dm []),
    ([], m [("t", block [("D", tD), ("N", tN)]), ("n", nodes "f")], dm []),
    ([], m [("t", block [("N", tN), ("D", tD)]), ("n", nodes "f")], dm []),
    ([], m [("t", block [("N", tN), ("D", tD)]), ("x", int 1)], dm [])]

theorem mutualPathCases_checkable : ∀ c ∈ mutualPathCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem mutualPath_verdict_exact : ∀ c ∈ mutualPathCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (mutualPathCases_checkable c hc).1 (mutualPathCases_checkable c hc).2 v

/-- A path reference's copy reads its target's relative paths where it
stands (ruling 26), with what the data writes at the target met in:
`c: {x: 3, d: $.a.b}` beside `a: {x: 2, b: {v: ..x}}`, the reference
written after the target and before it, beside no data, data at the
copy that reads 3 and that reads 2, data at the target, and both; a
target whose relative path stays inside it, met at the copy; two copies
that read two values; a copy where its path names nothing; and a target
that is a use of a name, and one that is a path reference; a path to a
member only a spread's template would reach, which names nothing; a
reference inside its own place, a recursion, beside data that holds it
and data that refuses it; a target reached through another path
reference, whose own data meets the copy, in both orders; a target
that holds a path reference of its own, whose copy at the copy meets
what the data writes at the place it names, in both orders; and a
target that holds a spread whose template climbs out of it, read at the
copy's own members, in both orders, but for data that reads the target's
own value with the target first, on which the ports split (#696). -/
def refCopyCases : List (Decls × Val × Data) :=
  let a := ("a", m [("x", int 2), ("b", m [("v", rel 2 ["x"])])])
  let c := ("c", m [("x", int 3), ("d", p ["a", "b"])])
  let e := ("e", m [("x", int 4), ("f", p ["a", "b"])])
  let atV (k1 k2 : String) (n : ℤ) (h : IntegerLeaf n := by decide) : String × Data :=
    (k1, .map [(k2, .map [("v", j n h)])])
  let datas : List Data := [.map [], .map [atV "c" "d" 3], .map [atV "c" "d" 2], .map [atV "a" "b" 2],
    .map [atV "a" "b" 2, atV "c" "d" 3]]
  let aw := ("a", m [("b", m [("v", rel 1 ["w"]), ("w", .number)])])
  let cw := ("c", m [("d", .meet (p ["a", "b"]) (m [("w", int 7)]))])
  let vw (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .map [("v", j n h), ("w", j n h)]
  let tv : Decls := [("T", m [("v", rel 2 ["x"])])]
  let recur : Val := .map [("x", false, .integer), ("y", false, rel 1 ["x"]), ("b", true, p ["a"])] none false
  let fw := ("f", m [("b", m [("w", .number), ("v", rel 1 ["w"])])])
  let fg := ("f", m [("g", m [("w", .number), ("v", rel 1 ["w"])])])
  let ae := ("a", m [("b", m [("e", p ["f", "g"])])])
  let cd := ("c", m [("d", p ["a", "b"])])
  let ew (n k : ℤ) (hn : IntegerLeaf n := by decide) (hk : IntegerLeaf k := by decide) : Data :=
    .map [("f", .map [("g", .map [("w", j n hn), ("v", j n hn)])]),
      ("c", .map [("d", .map [("e", .map [("w", j k hk), ("v", j k hk)])])])]
  let atb := ("a", m [("x", int 2), ("b", .map [("k", false, m [])] (some (m [("v", rel 3 ["x"])])) false)])
  let ct := ("c", m [("x", int 3), ("d", p ["a", "b"])])
  let kv (n : ℤ) (h : IntegerLeaf n := by decide) : Data :=
    .map [("c", .map [("d", .map [("k", .map [("v", j n h)])])])]
  datas.map (fun d => ([], m [a, c], d)) ++ datas.map (fun d => ([], m [c, a], d)) ++
    [([], m [aw, cw], .map []),
      ([], m [aw, cw], .map [("a", .map [("b", vw 1)]), ("c", .map [("d", vw 7)])]),
      ([], m [cw, aw], .map [("a", .map [("b", vw 1)]), ("c", .map [("d", vw 7)])]),
      ([], m [cw, aw], .map [("c", .map [("d", vw 7)])]),
      ([], m [c, e, a], .map [atV "c" "d" 3, atV "e" "f" 4]),
      ([], m [a, c, e], .map [atV "c" "d" 3, atV "e" "f" 4]),
      ([], m [("c", m [("d", p ["a", "b"])]), a], .map []),
      ([], m [a, ("c", m [("d", p ["a", "b"])])], .map []),
      (tv, m [c, ("a", m [("x", int 2), ("b", .alias "T")]), ("x", int 1)], .map [atV "c" "d" 3]),
      ([], m [c, ("a", m [("x", int 2), ("b", p ["f"])]), ("f", m [("v", rel 2 ["x"])]), ("x", int 1)],
        .map [atV "c" "d" 3]),
      ([], m [("a", .map [] (some (m [("v", rel 1 ["w"]), ("w", int 1)])) false), ("d", p ["a", "missing"])], .map []),
      ([], m [("a", recur)], .map [("a", .map [("x", j 1), ("y", j 1)])]),
      ([], m [("a", recur)], .map [("a", .map [("x", j 1), ("y", j 2)])]),
      ([], m [fw, ("a", p ["f"]), ("d", p ["a", "b"])], .map [("a", .map [("b", vw 1)]), ("d", vw 2)]),
      ([], m [fw, ("a", p ["f"]), ("d", p ["a", "b"])], .map [("a", .map [("b", vw 2)]), ("d", vw 2)]),
      ([], m [("d", p ["a", "b"]), fw, ("a", p ["f"])], .map [("a", .map [("b", vw 1)]), ("d", vw 2)]),
      ([], m [fg, ae, cd], ew 1 2),
      ([], m [fg, ae, cd], ew 1 1),
      ([], m [cd, ae, fg], ew 1 2),
      ([], m [("x", int 1), atb, ct], kv 3),
      ([], m [("x", int 1), atb, ct], .map []),
      ([], m [("x", int 1), ct, atb], kv 3),
      ([], m [("x", int 1), ct, atb], kv 2)]

/-- A name whose body holds a path reference to a place whose terms read
their own place, and a use of a name inside another name's body, each
read where it stands (ruling 26): `%T = $.a.b` beside
`a: {x: 2, b: {v: ..x}}`, used at `c: {x: 3, d: %T}`, beside data that
reads 3 at `c.d.v` and data that reads 2, and with no `x` at the top,
where the body's own copy, at `%T`, names nothing; and `%T = {u: %U}`
with `%U = {w: ..x}`, whose use at `%T.u` reads `%T.x`, which a body
written without an `x` doesn't hold, written after `%U` and before it,
and which one written with an `x` does. -/
def bodyCopyCases : List (Decls × Val × Data) :=
  let a := ("a", m [("x", int 2), ("b", m [("v", rel 2 ["x"])])])
  let c := ("c", m [("x", int 3), ("d", .alias "T")])
  let tr : Decls := [("T", .path [.key "a", .key "b"])]
  let atV (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .map [("c", .map [("d", .map [("v", j n h)])])]
  let u : String × Val := ("U", m [("w", rel 2 ["x"])])
  let t (tx : List (String × Val)) : String × Val := ("T", m ([("u", .alias "U")] ++ tx))
  let ab := m [("x", int 1), ("a", m [("b", .meet (.alias "T") (m [("x", int 5)]))])]
  let w5 : Data := .map [("a", .map [("b", .map [("u", .map [("w", j 5)])])])]
  [(tr, m [("x", int 1), a, c], atV 3),
    (tr, m [("x", int 1), a, c], atV 2),
    (tr, m [a, c], .map []),
    ([u, t []], ab, w5),
    ([t [], u], ab, w5),
    ([u, t [("x", .integer)]], ab, w5)]

/-- A name whose body holds a spread whose template reads its member's
place, read at each member where the name is used and at the body's own
place: `%H = {&: {url: .name}}` used at `hosts`, beside data whose `url`
agrees with its `name` and data whose `url` doesn't; the same body
unused, with no member, with a member that holds what the template
reads, and with one that doesn't, which names nothing at `$.%H.k`;
`%T = {k: {}, &: {v: ...x}}` used at `a.b`, whose template climbs out
of the body to read `a.x` where the use stands; and `%H` declared twice,
its template in one body and its member in the other, which the
template reads too. -/
def nameTemplateCases : List (Decls × Val × Data) :=
  let tmpl (fs : List (String × Val)) (t : Val) : Val := .map (fs.map fun f => (f.1, false, f.2)) (some t) false
  let url := m [("url", rel 1 ["name"])]
  let h (fs : List (String × Val)) : Decls := [("H", tmpl fs url)]
  let hosts := m [("hosts", .meet (.alias "H") (m [("a", m [("name", str "x")])]))]
  let hd (u : String) : Data := .map [("hosts", .map [("a", .map [("name", .str "x"), ("url", .str u)])])]
  let t : Decls := [("T", tmpl [("k", m [])] (m [("v", rel 3 ["x"])]))]
  let ab := m [("x", int 1), ("a", m [("x", int 2), ("b", .alias "T")])]
  let bv (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .map [("a", .map [("b", .map [("k", .map [("v", j n h)])])])]
  [(h [], hosts, hd "x"),
    (h [], hosts, hd "y"),
    (h [], m [("x", int 1)], .map []),
    (h [("k", m [("name", str "n")])], m [("x", int 1)], .map []),
    (h [("k", m [])], m [("x", int 1)], .map []),
    (t, ab, bv 2),
    (t, ab, bv 1),
    (h [] ++ [("H", m [("k", m [])])], m [("x", int 1)], .map []),
    (h [] ++ [("H", m [("k", m [("name", str "n")])])], m [("x", int 1)], .map [])]

theorem nameTemplateCases_checkable : ∀ c ∈ nameTemplateCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem name_template_verdict_exact : ∀ c ∈ nameTemplateCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (nameTemplateCases_checkable c hc).1 (nameTemplateCases_checkable c hc).2 v

/-- Templates that read their member's place in a selection's results,
each read at each member where the selection stands: a spread's in the
result the selection takes, beside data it refuses, in a result it
doesn't take, beside one that refuses less, in its default, deeper in
the document, in the body of a name a result uses, and in a selection
that is a name's body, read where the name is used. A generator's
template there waits on TypeScript, which reads it a step deeper (#698). -/
def selectTemplateCases : List (Decls × Val × Data) :=
  let url := tmpl (m [("url", rel 1 ["name"])])
  let sel (s : String) (r₁ r₂ : Val) : Val := .select (str s) [(str "m", r₁), (str "n", r₂)] none
  let dflt : Val := .select (str "z") [(str "m", .lit .null)] (some url)
  let hosts (u : String) : Data := .map [("a", .map [("name", .str "x"), ("url", .str u)])]
  let hd (u : String) : Data := .map [("hosts", hosts u)]
  [([], m [("hosts", sel "m" url (.lit .null))], hd "x"),
    ([], m [("hosts", sel "m" url (.lit .null))], hd "y"),
    ([], m [("hosts", sel "n" url (.lit .null))], .map [("hosts", .null)]),
    ([], m [("hosts", sel "n" url (.lit .null))], hd "x"),
    ([], m [("hosts", sel "n" url (tmpl (m [("url", .string)])))], hd "y"),
    ([], m [("hosts", dflt)], hd "x"),
    ([], m [("hosts", dflt)], hd "y"),
    ([], m [("c", m [("hosts", sel "m" url (.lit .null))])], .map [("c", hd "y")]),
    ([("H", url)], m [("hosts", sel "m" (.alias "H") (.lit .null))], hd "x"),
    ([("H", url)], m [("hosts", sel "m" (.alias "H") (.lit .null))], hd "y"),
    ([("H", sel "m" url (.lit .null))], m [("hosts", .alias "H")], hd "x"),
    ([("H", sel "m" url (.lit .null))], m [("hosts", .alias "H")], hd "y")]

theorem selectTemplateCases_checkable : ∀ c ∈ selectTemplateCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem select_template_verdict_exact : ∀ c ∈ selectTemplateCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (selectTemplateCases_checkable c hc).1 (selectTemplateCases_checkable c hc).2 v

/-- Paths written in a disjunction's arm, each read where the arm holds:
a relative path to a member the arm writes, beside data it refuses and
data another arm takes; an arm the data leaves alone beside one that
refuses less, and beside one that refuses as much; an absolute path to
the arm's own member and a path that climbs out of the arm; a spread's
template that reads its member's place, written in the arm and in the
body of a name the arm uses; a path in the body of a name the arm uses;
a path that names nothing, which drops its arm; a preferred arm; a path
from outside into an arm, which names nothing; a name whose body is such
a disjunction, used and unused; a chain of paths within an arm; a
path from outside into a disjunction a meet leaves one arm, which reads
that arm; and a disjunction or a lone preference inside an arm, read
before the arm that holds it: a path in the inner arm to its own member
and to the outer arm's, the inner disjunction's other arm, a path in the
outer arm into the inner one, a lone preference in an arm, and an inner
disjunction both of whose arms take the data; and disjunctions met at one
place, read as one disjunction of the meets of their arms: a path to the
arm's own member, a path to a member the other disjunction's arm
supplies, a third conjunct between them, paths in both disjunctions'
arms, and a name whose body is such a meet. -/
def disjunctionPathCases : List (Decls × Val × Data) :=
  let or2 (a b : Val) : Val := .or [(0, a), (0, b)]
  let named := m [("a", m [("name", str "x"), ("url", rel 1 ["name"])])]
  let url := tmpl (m [("url", rel 1 ["name"])])
  let hosts (u : String) : Data := .map [("a", .map [("name", .str "x"), ("url", .str u)])]
  let hd (u : String) : Data := .map [("hosts", hosts u)]
  let hn : Data := .map [("hosts", .null)]
  [([], m [("hosts", or2 named (.lit .null))], hd "x"),
    ([], m [("hosts", or2 named (.lit .null))], hd "y"),
    ([], m [("hosts", or2 named (.lit .null))], hn),
    ([], m [("hosts", or2 named (m [("a", m [("url", .number)])]))], hd "y"),
    ([], m [("hosts", or2 named (m [("a", m [("url", .string)])]))], hd "y"),
    ([], m [("hosts", or2 (m [("a", m [("name", str "x"), ("url", p ["hosts", "a", "name"])])]) (.lit .null))], hd "x"),
    ([], m [("c", m [("name", str "x"), ("hosts", or2 (m [("url", rel 2 ["name"])]) (.lit .null))])],
      .map [("c", .map [("name", .str "x"), ("hosts", .map [("url", .str "y")])])]),
    ([], m [("hosts", or2 url (.lit .null))], hd "x"),
    ([], m [("hosts", or2 url (.lit .null))], hd "y"),
    ([], m [("hosts", or2 url (tmpl (m [("url", .string)])))], hd "y"),
    ([("H", url)], m [("hosts", or2 (.alias "H") (.lit .null))], hd "x"),
    ([("H", url)], m [("hosts", or2 (.alias "H") (.lit .null))], hd "y"),
    ([("H", named)], m [("hosts", or2 (.alias "H") (.lit .null))], hd "x"),
    ([("H", named)], m [("hosts", or2 (.alias "H") (.lit .null))], hd "y"),
    ([], m [("hosts", or2 (m [("a", m [("url", p ["nowhere"])])]) (.lit .null))], hn),
    ([], m [("hosts", or2 (m [("a", m [("url", p ["nowhere"])])]) (.lit .null))], hd "y"),
    ([], m [("hosts", .or [(1, named), (0, .lit .null)])], hd "x"),
    ([], m [("x", or2 (m [("a", int 1)]) (m [("a", int 2)])), ("y", p ["x", "a"])],
      .map [("x", .map [("a", j 1)]), ("y", j 1)]),
    ([("H", or2 named (.lit .null))], m [("hosts", .alias "H")], hd "x"),
    ([("H", or2 named (.lit .null))], m [("hosts", .alias "H")], hd "y"),
    ([("H", or2 named (.lit .null))], m [("x", str "q")], .map [("x", .str "q")]),
    ([("H", or2 (m [("a", m [("url", p ["nowhere"])])]) (.lit .null))], m [("x", str "q")], .map [("x", .str "q")]),
    ([], m [("x", or2 (m [("a", int 1), ("b", p ["x", "a"]), ("c", p ["x", "b"])]) (.lit .null))],
      .map [("x", .map [("a", j 1), ("b", j 1), ("c", j 1)])]),
    ([], m [("x", or2 (m [("a", int 1), ("b", p ["x", "a"]), ("c", p ["x", "b"])]) (.lit .null))],
      .map [("x", .map [("a", j 1), ("b", j 1), ("c", j 2)])]),
    ([], m [("x", or2 (m [("a", int 1), ("b", p ["x", "a"]), ("c", p ["x", "b"])]) (.lit .null))],
      .map [("x", .null)]),
    ([], m [("x", .meet (or2 (m [("a", int 1)]) (.lit .null)) (m [("a", int 1)])), ("y", p ["x", "a"])],
      .map [("x", .map [("a", j 1)]), ("y", j 1)]),
    ([], m [("x", .meet (or2 (m [("a", int 1)]) (.lit .null)) (m [("a", int 1)])), ("y", p ["x", "a"])],
      .map [("x", .map [("a", j 1)]), ("y", j 2)]),
    ([], m [("hosts", or2 named (m [("a", m [("name", .string), ("url", .string)])]))],
      .map [("hosts", .map [("a", .map [("name", .str "y"), ("url", .str "y")])])]),
    ([], m [("hosts", or2 named (m [("a", m [("name", .string), ("url", .string)])]))],
      .map [("hosts", .map [("a", .map [("name", .str "y"), ("url", .str "z")])])]),
    ([], m [("hosts", or2 named (.lit .null))],
      .map [("hosts", .map [("a", .map [("name", .str "y"), ("url", .str "y")])])]),
    ([("T", m [("a", int 1), ("b", rel 1 ["a"])])], m [("x", .meet (or2 (.alias "T") (.lit .null)) (.alias "T"))],
      .map [("x", .map [("a", j 1), ("b", j 1)])]),
    ([("T", m [("a", int 1), ("b", rel 1 ["a"])])], m [("x", .meet (or2 (.alias "T") (.lit .null)) (.alias "T"))],
      .map [("x", .map [("a", j 1), ("b", j 2)])]),
    ([("T", m [("a", int 1), ("b", rel 1 ["a"])])], m [("x", .meet (or2 (.alias "T") (.lit .null)) (.alias "T"))],
      .map [("x", .null)]),
    ([], m [("x", .meet (or2 (m [("a", int 1)]) (.lit .null)) (m [("a", int 1), ("b", rel 1 ["a"])]))],
      .map [("x", .map [("a", j 1), ("b", j 1)])]),
    ([], m [("x", .meet (or2 (m [("a", int 1)]) (.lit .null)) (m [("a", int 1), ("b", rel 1 ["a"])]))],
      .map [("x", .map [("a", j 1), ("b", j 2)])]),
    ([], m [("x", or2 (m [("a", int 1), ("b", or2 (m [("c", int 1), ("d", rel 1 ["c"])]) (.lit .null))]) (.lit .null))],
      .map [("x", .map [("a", j 1), ("b", .map [("c", j 1), ("d", j 1)])])]),
    ([], m [("x", or2 (m [("a", int 1), ("b", or2 (m [("c", int 1), ("d", rel 1 ["c"])]) (.lit .null))]) (.lit .null))],
      .map [("x", .map [("a", j 1), ("b", .map [("c", j 1), ("d", j 2)])])]),
    ([], m [("x", or2 (m [("a", int 1), ("b", or2 (m [("c", int 1), ("d", rel 1 ["c"])]) (.lit .null))]) (.lit .null))],
      .map [("x", .map [("a", j 1), ("b", .null)])]),
    ([], m [("x", or2 (m [("a", int 1), ("b", or2 (m [("c", rel 2 ["a"])]) (.lit .null))]) (.lit .null))],
      .map [("x", .map [("a", j 1), ("b", .map [("c", j 1)])])]),
    ([], m [("x", or2 (m [("a", int 1), ("b", or2 (m [("c", rel 2 ["a"])]) (.lit .null))]) (.lit .null))],
      .map [("x", .map [("a", j 1), ("b", .map [("c", j 2)])])]),
    ([], m [("x", or2 (m [("a", or2 (m [("c", int 1), ("d", rel 1 ["c"])]) (.lit .null)), ("e", rel 1 ["a", "d"])])
        (.lit .null))],
      .map [("x", .map [("a", .map [("c", j 1), ("d", j 1)]), ("e", j 1)])]),
    ([], m [("x", or2 (m [("a", or2 (m [("c", int 1), ("d", rel 1 ["c"])]) (.lit .null)), ("e", rel 1 ["a", "d"])])
        (.lit .null))],
      .map [("x", .map [("a", .map [("c", j 1), ("d", j 1)]), ("e", j 2)])]),
    ([], m [("x", or2 (m [("a", int 1), ("b", .pref 1 (m [("c", int 1), ("d", rel 1 ["c"])]))]) (.lit .null))],
      .map [("x", .map [("a", j 1), ("b", .map [("c", j 2), ("d", j 3)])])]),
    ([], m [("x", or2 (m [("a", int 1), ("b", .pref 1 (m [("c", int 1), ("d", rel 1 ["c"])]))]) (.lit .null))],
      .map [("x", .map [("a", j 1), ("b", .map [("c", j 1), ("d", j 1)])])]),
    ([], m [("x", or2 (m [("a", int 1), ("b", or2 (m [("c", int 1), ("d", rel 1 ["c"])]) (m [("e", int 2)]))])
        (.lit .null))],
      .map [("x", .map [("a", j 1), ("b", .map [("e", j 2)])])]),
    ([], m [("x", .meet (or2 (m [("a", int 1), ("b", rel 1 ["a"])]) (.lit .null)) (or2 (m [("a", int 1)]) (m [("a", int 2)])))],
      .map [("x", .map [("a", j 1), ("b", j 1)])]),
    ([], m [("x", .meet (or2 (m [("a", int 1), ("b", rel 1 ["a"])]) (.lit .null)) (or2 (m [("a", int 1)]) (m [("a", int 2)])))],
      .map [("x", .map [("a", j 1), ("b", j 2)])]),
    ([], m [("x", .meet (or2 (m [("b", rel 1 ["a"])]) (.lit .null)) (or2 (m [("a", int 1)]) (m [("a", int 2)])))],
      .map [("x", .map [("a", j 2), ("b", j 2)])]),
    ([], m [("x", .meet (or2 (m [("b", rel 1 ["a"])]) (.lit .null)) (or2 (m [("a", int 1)]) (m [("a", int 2)])))],
      .map [("x", .map [("a", j 2), ("b", j 1)])]),
    ([], m [("x", .meet (or2 (m [("b", rel 1 ["a"])]) (.lit .null)) (or2 (m [("a", int 1)]) (m [("a", int 2)])))],
      .map [("x", .null)]),
    ([], m [("x", .meet (.meet (or2 (m [("b", rel 1 ["a"])]) (.lit .null)) (m [("c", int 1)]))
        (or2 (m [("a", int 1)]) (m [("a", int 2)])))],
      .map [("x", .map [("a", j 2), ("b", j 2), ("c", j 1)])]),
    ([], m [("x", .meet (.meet (or2 (m [("b", rel 1 ["a"])]) (.lit .null)) (m [("c", int 1)]))
        (or2 (m [("a", int 1)]) (m [("a", int 2)])))],
      .map [("x", .map [("a", j 2), ("b", j 1), ("c", j 1)])]),
    ([], m [("x", .meet (or2 (m [("b", rel 1 ["a"])]) (m [("b", rel 1 ["c"])]))
        (or2 (m [("a", int 1), ("c", int 2)]) (m [("a", int 3), ("c", int 4)])))],
      .map [("x", .map [("a", j 1), ("b", j 2), ("c", j 2)])]),
    ([], m [("x", .meet (or2 (m [("b", rel 1 ["a"])]) (m [("b", rel 1 ["c"])]))
        (or2 (m [("a", int 1), ("c", int 2)]) (m [("a", int 3), ("c", int 4)])))],
      .map [("x", .map [("a", j 1), ("b", j 3), ("c", j 2)])]),
    ([("T", .meet (or2 (m [("b", rel 1 ["a"])]) (.lit .null)) (or2 (m [("a", int 1)]) (m [("a", int 2)])))],
      m [("x", .alias "T")], .map [("x", .map [("a", j 2), ("b", j 2)])]),
    ([("T", .meet (or2 (m [("b", rel 1 ["a"])]) (.lit .null)) (or2 (m [("a", int 1)]) (m [("a", int 2)])))],
      m [("x", .alias "T")], .map [("x", .map [("a", j 2), ("b", j 1)])]),
    ([], m [("x", .meet (.or [(2, m [("a", int 1), ("c", rel 1 ["a"])]), (0, m [])])
        (.or [(1, m [("b", int 2)]), (0, m [])]))], .map []),
    ([], m [("x", .meet (.or [(1, m [("b", int 2)]), (0, m [])])
        (.or [(2, m [("a", int 1), ("c", rel 1 ["a"])]), (0, m [])]))], .map []),
    ([], m [("x", .meet (.or [(2, m [("a", int 1), ("c", rel 1 ["a"])]), (0, m [])])
        (.or [(1, m [("b", int 2)]), (0, m [])]))], .map [("x", .map [("a", j 1), ("b", j 2), ("c", j 2)])]),
    ([], m [("x", .meet (.or [(1, m [("a", int 1), ("c", rel 1 ["a"])]), (0, m [("d", int 4)])])
        (.pref 1 (m [("b", int 2)])))], .map []),
    ([], m [("x", .meet (.pref 1 (m [("b", int 2)]))
        (.or [(1, m [("a", int 1), ("c", rel 1 ["a"])]), (0, m [("d", int 4)])]))], .map [])]

/-- Paths inside a lone preference `*x`, which reads as `x | super(x)`:
`x` read where it stands, and its parent arm the parent type of what `x`
reads as on its own (decision 40). A relative path to the preference's
own member: the data taking the default, overriding it within the
parent type and outside it, leaving a member out, and leaving the
preference out; a default over a kind, whose path reads the data, and
one whose path meets a bound, whose parent the path's kind decides; an
absolute path to the preference's own member; a chain of paths; a name
the preference holds; a template whose path reads its member's place;
a path to a place outside the preference, whose value the parent arm
lifts; and a disjunction or a lone preference inside the preferred
value, which the parent arm lifts as the value reads before any data, its
paths read so: a preference over a disjunction, a preference inside a
preference, and a path that reads a kind the data narrows. -/
def lonePrefPathCases : List (Decls × Val × Data) :=
  let ab := m [("a", int 1), ("b", rel 1 ["a"])]
  let abc := m [("a", int 1), ("b", rel 1 ["a"]), ("c", rel 1 ["b"])]
  let kb := m [("a", .integer), ("b", rel 1 ["a"])]
  let pb := m [("a", int 1), ("b", p ["x", "a"])]
  let hs := tmpl (m [("name", str "a"), ("url", rel 1 ["name"])])
  let xd (fs : List (String × Data)) : Data := .map [("x", .map fs)]
  let hd (n : String) (u : Data) : Data := .map [("x", .map [("h", .map [("name", .str n), ("url", u)])])]
  [([], m [("x", .pref 1 ab)], xd [("a", j 1), ("b", j 1)]),
    ([], m [("x", .pref 1 ab)], xd [("a", j 1), ("b", j 2)]),
    ([], m [("x", .pref 1 ab)], xd [("a", j 2), ("b", j 2)]),
    ([], m [("x", .pref 1 ab)], xd [("a", j 2), ("b", j 3)]),
    ([], m [("x", .pref 1 ab)], xd [("a", j 2), ("b", .str "s")]),
    ([], m [("x", .pref 1 ab)], xd [("a", j 2)]),
    ([], m [("x", .pref 1 ab)], .map []),
    ([], m [("x", .pref 1 kb)], xd [("a", j 5)]),
    ([], m [("x", .pref 1 kb)], xd [("a", j 5), ("b", j 6)]),
    ([], m [("x", .pref 1 pb)], xd [("a", j 2), ("b", j 3)]),
    ([], m [("x", .pref 1 pb)], xd [("a", j 2), ("b", .str "s")]),
    ([], m [("x", .pref 1 abc)], xd [("a", j 2), ("b", j 3), ("c", j 4)]),
    ([], m [("x", .pref 1 abc)], xd [("a", j 2), ("b", j 3), ("c", .str "s")]),
    ([("T", ab)], m [("x", .pref 1 (.alias "T"))], xd [("a", j 2), ("b", j 3)]),
    ([("T", ab)], m [("x", .pref 1 (.alias "T"))], xd [("a", j 2), ("b", .str "s")]),
    ([], m [("x", .pref 1 hs)], hd "a" (.str "a")),
    ([], m [("x", .pref 1 hs)], hd "b" (.str "c")),
    ([], m [("x", .pref 1 hs)], hd "b" (j 1)),
    ([], m [("y", int 1), ("x", .pref 1 (m [("b", p ["y"])]))], .map [("y", j 1), ("x", .map [("b", j 3)])]),
    ([], m [("y", int 1), ("x", .pref 1 (m [("b", p ["y"])]))], .map [("y", j 1), ("x", .map [("b", .str "s")])]),
    ([], m [("y", int 1), ("x", .pref 1 (p ["y"]))], .map [("y", j 1), ("x", j 3)]),
    ([], m [("y", int 1), ("x", .pref 1 (m [("a", int 1), ("b", p ["y"])]))],
      .map [("y", j 1), ("x", .map [("a", j 2), ("b", .str "s")])]),
    ([], m [("x", .pref 1 (m [("a", .integer), ("b", .meet (rel 1 ["a"]) (.min (.num (.integer (.of 3)))))]))],
      xd [("a", .num (.float (.dyadic 11 (-1)))), ("b", .num (.float (.dyadic 11 (-1))))]),
    ([], m [("x", .pref 1 (m [("a", .integer), ("b", .meet (rel 1 ["a"]) (.min (.num (.integer (.of 3)))))]))],
      xd [("a", .num (.float (.dyadic 11 (-1)))), ("b", j 5)]),
    ([], m [("x", .pref 1 (.or [(0, ab), (0, .lit .null)]))], xd [("a", j 1), ("b", j 1)]),
    ([], m [("x", .pref 1 (.or [(0, ab), (0, .lit .null)]))], xd [("a", j 2), ("b", j 3)]),
    ([], m [("x", .pref 1 (.or [(0, ab), (0, .lit .null)]))], xd [("a", j 2), ("b", .str "s")]),
    ([], m [("x", .pref 1 (.or [(0, ab), (0, .lit .null)]))], .map [("x", .null)]),
    ([], m [("x", .pref 1 (m [("a", int 1), ("b", .pref 1 (m [("c", int 1), ("d", rel 1 ["c"])]))]))],
      xd [("a", j 2), ("b", .map [("c", j 2), ("d", j 3)])]),
    ([], m [("x", .pref 1 (m [("a", int 1), ("b", .pref 1 (m [("c", int 1), ("d", rel 1 ["c"])]))]))],
      xd [("a", j 1), ("b", .map [("c", j 1), ("d", j 1)])]),
    ([], m [("x", .pref 1 (m [("a", .number), ("b", rel 1 ["a"])]))],
      xd [("a", j 5), ("b", .num (.float (.dyadic 5 (-1))))]),
    ([], m [("x", .pref 1 (.or [(0, m [("a", .number), ("b", rel 1 ["a"])]), (0, .lit .null)]))],
      xd [("a", j 5), ("b", .num (.float (.dyadic 5 (-1))))])]

theorem lonePrefPathCases_checkable : ∀ c ∈ lonePrefPathCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem lone_pref_path_verdict_exact : ∀ c ∈ lonePrefPathCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (lonePrefPathCases_checkable c hc).1 (lonePrefPathCases_checkable c hc).2 v

/-- Lone preferences met at one place with no disjunction beside them, a
path in one's value to a member another supplies (ruling 53): two and
three of them, a path in each, the data supplying what the preferences
prefer or overriding it, data only their parent arms take together and
a value the parent arm refuses where its path reads the parent type of
what the other prefers, a path to nothing, and two with no path, which
read as written. -/
def lonePrefCases : List (Decls × Val × Data) :=
  let rel (ks : List String) : Val := .path (.up 1 :: ks.map .key)
  let p (v : Val) : Val := .pref 1 v
  let x (v : Val) : Val := m [("x", v)]
  let dx (d : Data) : Data := dm [("x", d)]
  let two := .meet (p (m [("a", int 1), ("b", rel ["c"])])) (p (m [("c", int 2)]))
  let three := .meet (.meet (p (m [("a", rel ["c"])])) (p (m [("b", int 1)]))) (p (m [("c", int 2)]))
  let each := .meet (p (m [("a", int 1), ("b", rel ["c"])])) (p (m [("c", rel ["a"])]))
  let lost := .meet (p (m [("a", int 1), ("b", rel ["d"])])) (p (m [("c", int 2)]))
  let plain := .meet (p (m [("a", int 1)])) (p (m [("c", int 2)]))
  [([], x two, dx (dm [("a", j 1), ("b", j 2), ("c", j 2)])),
    ([], x two, dm []),
    ([], x two, dx (dm [("a", j 1), ("b", j 3), ("c", j 2)])),
    ([], x two, dx (dm [("a", j 5), ("b", j 7), ("c", j 7)])),
    ([], x two, dx (dm [("a", j 5), ("b", .str "s"), ("c", j 7)])),
    ([], x three, dx (dm [("a", j 2), ("b", j 1), ("c", j 2)])),
    ([], x three, dm []),
    ([], x each, dx (dm [("a", j 1), ("b", j 1), ("c", j 1)])),
    ([], x each, dm []),
    ([], x lost, dm []),
    ([], x plain, dx (dm [("a", j 1), ("c", j 2)])),
    ([], x plain, dm [])]

theorem lonePrefCases_checkable : ∀ c ∈ lonePrefCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem lone_pref_verdict_exact : ∀ c ∈ lonePrefCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (lonePrefCases_checkable c hc).1 (lonePrefCases_checkable c hc).2 v

/-- A path in a lone preference's value that names nothing there, the
schema's error whatever the data, as it is outside a preference (ruling
53, #700): the path alone, against nothing, against data that supplies
the member and against data that overrides another; the path in a meet
term, in a call's argument and as an operand; a step into a scalar, a
kind, a sealed map and a nested preference that lack the member, the
last against data that has it too; a step into a path that itself names
nothing; an index past the end of a member's list; a parent step out of
a nested preference and out of a nested map; the preference one level down, one of rank two, and one met
with a plain map. Then what stands: a path the map beside the
preference answers, one the outer preference answers for a nested one,
an index a member's list has, a path to an optional member, and the
preference as an arm, where the path fails that arm alone. Then the same
preference wherever a document can write it: beside a path another
path reads, a step into a list's element and a path to a place outside
that names nothing; as an optional member, under `hide` and `type`, as
the template of `each`, a result of `when` taken or not, a branch of
`nof`, the argument of `maybe`, which forgives only a path at its top,
and the result a `match` takes; as a declaration's body, unused, used
and used beside a map that has the member, each an error at the body's
own place; and as a spread's template, which is no error until a member
reads it, refuses a member the data gives without the one it names, and
is an error at a member the schema writes without it. -/
def strayPathCases : List (Decls × Val × Data) :=
  let p (v : Val) : Val := .pref 1 v
  let x (v : Val) : Val := m [("x", v)]
  let dx (d : Data) : Data := dm [("x", d)]
  let ab (b : Val) : Val := m [("a", int 1), ("b", b)]
  let lost := ab (rel 1 ["d"])
  let inner := m [("a", p (m [("c", int 1)])), ("b", rel 1 ["a", "d"])]
  let one : Val := .list [int 1] none true
  let t (fs : List (String × Val)) : Val :=
    m [("t", .map (fs.map fun f => (f.1, false, f.2)) (some (p lost)) false)]
  let td (fs : List (String × Data)) : Data := dm [("t", dm [("m", dm fs)])]
  [([], x (p lost), dm []),
    ([], x (p lost), dx (dm [("d", j 5)])),
    ([], x (p lost), dx (dm [("a", j 2)])),
    ([], x (p (ab (.meet (rel 1 ["d"]) .number))), dm []),
    ([], x (p (ab (c .upper [rel 1 ["d"]]))), dm []),
    ([], x (p (ab (c .plus [rel 1 ["d"], int 1]))), dm []),
    ([], x (p (ab (rel 1 ["a", "z"]))), dm []),
    ([], x (p (m [("a", .string), ("b", rel 1 ["a", "d"])])), dm []),
    ([], x (p (m [("a", .map [("c", false, int 1)] none true), ("b", rel 1 ["a", "d"])])), dm []),
    ([], x (p inner), dm []),
    ([], x (p inner), dx (dm [("a", dm [("c", j 1), ("d", j 2)])])),
    ([], x (p (m [("b", rel 1 ["a", "z"]), ("a", rel 1 ["q"])])), dm []),
    ([], x (p (m [("a", one), ("b", .path [.up 1, .key "a", .idx 3])])), dm []),
    ([], x (p (m [("a", p (m [("c", rel 2 ["d"])]))])), dm []),
    ([], x (p (m [("a", m [("c", rel 2 ["d"])])])), dm []),
    ([], x (m [("y", p lost)]), dm []),
    ([], x (.pref 2 lost), dm []),
    ([], x (.meet (p lost) (m [("c", int 2)])), dm []),
    ([], x (.meet (p lost) (m [("d", int 5)])), dm []),
    ([], x (p (m [("a", p (m [("c", rel 2 ["d"])])), ("d", int 3)])), dm []),
    ([], x (p (m [("a", one), ("b", .path [.up 1, .key "a", .idx 0])])), dm []),
    ([], x (p (.map [("a", true, int 1), ("b", false, rel 1 ["a"])] none false)), dm []),
    ([], x (.or [(1, lost), (0, str "z")]), dm []),
    ([], x (.or [(1, lost), (0, str "z")]), dx (.str "z")),
    ([], x (p (m [("b", rel 1 ["a"]), ("a", rel 1 ["q"])])), dm []),
    ([], x (p (m [("a", one), ("b", .path [.up 1, .key "a", .idx 0, .key "z"])])), dm []),
    ([], x (p (ab (.path [.key "q"]))), dm []),
    ([], .map [("x", true, p lost)] none false, dm []),
    ([], x (.ride .hide (p lost) []), dm []),
    ([], x (.ride .type (p lost) []), dm []),
    ([], x (c .each [lst [str "p"], p lost]), dm []),
    ([], x (.when (.lit (.bool true)) (p lost) (some (int 2))), dm []),
    ([], x (.when (.lit (.bool false)) (p lost) (some (int 2))), dm []),
    ([], x (.nof (int 1) [p lost]), dm []),
    ([], x (c .maybe [p lost]), dm []),
    ([], x (.select (int 1) [(int 1, p lost)] (some (int 3))), dm []),
    ([("T", p lost)], x (int 1), dm []),
    ([("T", p lost)], x (.alias "T"), dm []),
    ([("T", p lost)], x (.meet (.alias "T") (m [("d", int 2)])), dm []),
    ([], t [], dm []),
    ([], t [], td [("a", j 1), ("b", j 2)]),
    ([], t [], td [("d", j 2)]),
    ([], t [("m", m [])], dm []),
    ([], t [("m", m [("d", int 2)])], dm [])]

theorem strayPathCases_checkable : ∀ c ∈ strayPathCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem stray_path_verdict_exact : ∀ c ∈ strayPathCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (strayPathCases_checkable c hc).1 (strayPathCases_checkable c hc).2 v

/-- The same path under a check inside a lone preference (#981), an
error whichever argument holds it: the condition of a `when`, its
result and its alternative; a branch of `nof`, a later one, and its
count; the condition of `must`; `len`; `contains` and its count; `rest`;
and a bound, `min` and `neq`, the path alone and after another value. -/
def strayCheckCases : List (Decls × Val × Data) :=
  let d : Val := rel 1 ["d"]
  let x (b : Val) : Val := m [("x", .pref 1 (m [("a", int 1), ("b", b)]))]
  [([], x (.when d (int 1) (some (int 2))), dm []),
    ([], x (.when (.lit (.bool true)) d (some (int 2))), dm []),
    ([], x (.when (.lit (.bool false)) (int 1) (some d)), dm []),
    ([], x (.nof (int 1) [d]), dm []),
    ([], x (.nof (int 1) [int 2, d]), dm []),
    ([], x (.nof d [int 1]), dm []),
    ([], x (.must d "m"), dm []),
    ([], x (.len d), dm []),
    ([], x (.contains d (.min (.num (.integer (.of 1))))), dm []),
    ([], x (.contains (int 1) d), dm []),
    ([], x (.rest d []), dm []),
    ([], x (c (.bnd .min) [d]), dm []),
    ([], x (c (.bnd .neq) [d]), dm []),
    ([], x (c (.bnd .neq) [int 1, d]), dm [])]

theorem strayCheckCases_checkable : ∀ c ∈ strayCheckCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem stray_check_verdict_exact : ∀ c ∈ strayCheckCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (strayCheckCases_checkable c hc).1 (strayCheckCases_checkable c hc).2 v

/-- An arm whose path leads into its own place and names nothing there
(#982). The arm fails alone where nothing supplies the member, so the
arm beside it stands: against nothing, against a value that arm takes,
and against a map the first arm would take but for its path. Data that
supplies the member lets the arm read it, and so does a map the
disjunction meets. Two arms that each hold such a path leave the schema
no arm, an error whatever the data. An optional member that holds the
disjunction may be absent, and the same arm one level down fails the
same way. -/
def strayArmCases : List (Decls × Val × Data) :=
  let x (v : Val) : Val := m [("x", v)]
  let dx (d : Data) : Data := dm [("x", d)]
  let lost := m [("a", int 1), ("b", rel 1 ["d"])]
  let arms : Val := .or [(0, lost), (0, str "z")]
  let two : Val := .or [(0, lost), (0, m [("c", rel 1 ["q"])])]
  let full : Data := dx (dm [("a", j 1), ("b", j 5), ("d", j 5)])
  [([], x arms, dm []),
    ([], x arms, dx (.str "z")),
    ([], x arms, dx (dm [("a", j 1)])),
    ([], x arms, full),
    ([], x (.meet arms (m [("d", int 5)])), dm []),
    ([], x (.meet arms (m [("d", int 5)])), full),
    ([], x two, dm []),
    ([], x two, full),
    ([], x two, dx (j 3)),
    ([], .map [("x", true, arms)] none false, dm []),
    ([], x (m [("a", .or [(0, m [("c", rel 1 ["q"])]), (0, int 1)])]), dm [])]

theorem strayArmCases_checkable : ∀ c ∈ strayArmCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem stray_arm_verdict_exact : ∀ c ∈ strayArmCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (strayArmCases_checkable c hc).1 (strayArmCases_checkable c hc).2 v

theorem disjunctionPathCases_checkable : ∀ c ∈ disjunctionPathCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem disjunction_path_verdict_exact : ∀ c ∈ disjunctionPathCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (disjunctionPathCases_checkable c hc).1 (disjunctionPathCases_checkable c hc).2 v

theorem bodyCopyCases_checkable : ∀ c ∈ bodyCopyCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem body_copy_verdict_exact : ∀ c ∈ bodyCopyCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (bodyCopyCases_checkable c hc).1 (bodyCopyCases_checkable c hc).2 v

theorem refCopyCases_checkable : ∀ c ∈ refCopyCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem ref_copy_verdict_exact : ∀ c ∈ refCopyCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (refCopyCases_checkable c hc).1 (refCopyCases_checkable c hc).2 v

/-- A bare `close()` and a bare `open()` beside path references (decision
44 of the design note's §7): a sealed place's copy sealed; a `close()`
beside a reference sealing the target's terms read there; an `open()`
beside a reference lifting the target's seal; a `close()` at the
document's root; and a directive inside the argument of `copy`, `pref`
or `super`, which acts where the call's value lands (decision 46): at
the call's own level and beneath it, after the copy's seals are lifted,
an `open()` there too, beside a term the place holds, through a copy of
a copy, and beside a disjunction in the argument. -/
def directivePathCases : List (Decls × Val × Data) :=
  let bopen : Val := .ride .lifts .any []
  let bclose : Val := .ride .seals .any []
  let pa : Val := .path [.key "a"]
  let pb : Val := .path [.key "b"]
  let dx : Data := .map [("x", j 1)]
  let dxy : Data := .map [("x", j 1), ("y", j 2)]
  let cp (v : Val) : Val := .call .copy [v]
  let x1 : Val := m [("x", int 1)]
  [([], m [("b", .meet bclose (m [("x", int 1)])), ("a", pb)], .map [("a", dxy), ("b", dx)]),
    ([], m [("a", .meet bclose (m [("x", int 1)])), ("b", pa)], .map [("a", dx), ("b", dxy)]),
    ([], m [("b", m [("x", int 1)]), ("a", .meet bclose pb)], .map [("a", dxy), ("b", dx)]),
    ([], m [("b", cl [("x", int 1)]), ("a", .meet bopen pb)], .map [("a", dxy), ("b", dx)]),
    ([], .meet bclose (m [("x", int 1)]), dxy),
    ([], .meet bclose (m [("x", int 1)]), dx),
    ([], m [("v", cp (.meet bclose x1))], .map [("v", dxy)]),
    ([], m [("v", cp (.meet bclose x1))], .map [("v", dx)]),
    ([], m [("v", cp (m [("x", .meet bclose (m [("y", int 1)]))]))],
      .map [("v", .map [("x", .map [("y", j 1), ("z", j 2)])])]),
    ([], m [("v", cp (.meet bopen (cl [("x", int 1)])))], .map [("v", dxy)]),
    ([], m [("v", .meet (cp (.meet bclose x1)) (m [("y", int 2)]))], .map [("v", dxy)]),
    ([], m [("v", .call .pref [.meet bclose x1])], .map [("v", dxy)]),
    ([], m [("v", .call .super [.meet bclose x1])], .map [("v", dxy)]),
    ([], m [("v", cp (cp (.meet bclose x1)))], .map [("v", dxy)]),
    ([], m [("v", cp (.meet bclose (.or [(0, x1), (0, m [("y", int 2)])])))],
      .map [("v", .map [("x", j 1), ("z", j 2)])]),
    ([], m [("v", cp (.meet bclose x1)), ("w", cp x1)], .map [("v", dx), ("w", dxy)])]

theorem directivePathCases_checkable : ∀ c ∈ directivePathCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem directive_path_verdict_exact : ∀ c ∈ directivePathCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (directivePathCases_checkable c hc).1 (directivePathCases_checkable c hc).2 v

/-- A bare directive beside a path, at more places and against more
data than `directivePathCases` holds: `close()` beside a path sealing
the copy with the keys the path's target holds, the data's among them,
and every level beneath but one held open; beside a path and a map, two
paths, a path into a member, a path to a list, a scalar, a kind, a
sealed map, a choice and another path; the directive and the path
written in two maps; both directives at one place; a member nested in a
map, in a list, optional, under a default and in an arm; a spread's
template, of a map and of a list, alone and beside a member the map
declares; a path inside the terms a directive seals, at the root, in a
template and in `copy`'s argument; a target that reads the place that
copies it; and a path that names nothing. -/
def directiveBesideCases : List (Decls × Val × Data) :=
  let bopen : Val := .ride .lifts .any []
  let bclose : Val := .ride .seals .any []
  let pb : Val := p ["b"]
  let x1 : Val := m [("x", int 1)]
  let y2 : Val := m [("y", int 2)]
  let dx : Data := .map [("x", j 1)]
  let dxy : Data := .map [("x", j 1), ("y", j 2)]
  let dxyz : Data := .map [("x", j 1), ("y", j 2), ("z", j 3)]
  let cb : Val := m [("b", x1), ("a", .meet bclose pb)]
  let cby : Val := m [("b", x1), ("a", .meet (.meet bclose pb) y2)]
  let ocb : Val := m [("b", cl [("x", int 1)]), ("a", .meet (.meet bopen bclose) pb)]
  let two : Val := m [("b", x1), ("v", .meet (m [("a", bclose)]) (m [("a", pb)]))]
  let arms : Val := m [("b", .or [(0, x1), (0, y2)]), ("a", .meet bclose pb)]
  let tm : Val := m [("b", x1), ("v", tmpl (.meet bclose pb))]
  let root : Val := .meet bclose (m [("x", p ["y"]), ("y", .integer)])
  let tin : Val := m [("v", tmpl (.meet bclose (m [("x", p ["v", "n", "y"]), ("y", .integer)])))]
  let lb : Val := m [("b", lst [int 1, int 2]), ("a", .meet bclose pb)]
  let self : Val := m [("w", m [("x", p ["v", "y"]), ("y", .integer)]), ("v", .meet bclose (p ["w"]))]
  let pp : Val := m [("b", x1), ("d", y2), ("a", .meet (.meet bclose pb) (p ["d"]))]
  let kb : Val := m [("b", m [("x", .integer)]), ("a", .meet bclose pb)]
  let opt : Val := mo [("b", false, x1), ("a", true, .meet bclose pb)]
  let td : Val := m [("b", x1), ("v", ms [("m", y2)] (.meet bclose pb))]
  let rb : Val := m [("b", x1), ("a", .meet bclose (rel 1 ["b"]))]
  let lt : Val := m [("b", x1), ("v", .list [] (some (.meet bclose pb)) false)]
  let df : Val := m [("b", x1), ("a", .pref 1 (.meet bclose pb))]
  let ho : Val := m [("b", m [("x", .ride .opened (m [("y", int 1)]) [])]), ("a", .meet bclose pb)]
  let arm : Val := m [("b", x1), ("a", .or [(0, .meet bclose pb), (0, m [("k", int 1)])])]
  let ob : Val := mo [("b", false, mo [("x", false, int 1), ("o", true, int 2)]), ("a", false, .meet bclose pb)]
  let ct : Val := m [("v", tmpl (.call .copy [.meet bclose (m [("x", p ["s"])])])), ("s", int 1)]
  [([], cb, .map [("a", dx), ("b", dx)]),
    ([], cb, .map [("b", dx)]),
    ([], cb, .map [("b", dxy)]),
    ([], cb, .map [("a", j 5)]),
    ([], cby, .map [("a", dxy), ("b", dx)]),
    ([], cby, .map [("a", dxyz), ("b", dx)]),
    ([], ocb, .map [("a", dxy), ("b", dx)]),
    ([], ocb, .map [("a", dx), ("b", dx)]),
    ([], m [("b", m [("x", m [("y", int 1)])]), ("a", .meet bclose pb)],
      .map [("a", .map [("x", .map [("y", j 1), ("z", j 2)])])]),
    ([], m [("b", m [("x", m [("y", int 1)])]), ("a", .meet bclose pb)], .map [("a", .map [("x", .map [("y", j 1)])])]),
    ([], two, .map [("v", .map [("a", dxy)]), ("b", dx)]),
    ([], two, .map [("v", .map [("a", dx)]), ("b", dx)]),
    ([], arms, .map [("a", .map [("x", j 1), ("z", j 3)])]),
    ([], arms, .map [("a", dx)]),
    ([], tm, .map [("v", .map [("m", dxy)]), ("b", dx)]),
    ([], tm, .map [("v", .map [("m", dx)]), ("b", dx)]),
    ([], root, .map [("x", j 2), ("y", j 2), ("z", j 1)]),
    ([], root, .map [("x", j 2), ("y", j 2)]),
    ([], tin, .map [("v", .map [("n", .map [("x", j 2), ("y", j 2), ("z", j 1)])])]),
    ([], tin, .map [("v", .map [("n", .map [("x", j 2), ("y", j 2)])])]),
    ([], lb, .map [("a", .list [j 1, j 2, j 3])]),
    ([], lb, .map [("a", .list [j 1, j 2])]),
    ([], m [("b", int 1), ("a", .meet bclose pb)], .map [("a", j 1)]),
    ([], m [("b", x1), ("a", .meet bopen pb)], .map [("a", dxy)]),
    ([], self, .map [("v", .map [("x", j 2), ("y", j 2), ("z", j 1)]), ("w", .map [("x", j 2), ("y", j 2)])]),
    ([], self, .map [("v", .map [("x", j 2), ("y", j 2)]), ("w", .map [("x", j 2), ("y", j 2)])]),
    ([], pp, .map [("a", dxy)]),
    ([], pp, .map [("a", dxyz)]),
    ([], m [("b", cl [("x", int 1)]), ("a", .meet bclose pb)], .map [("a", dxy)]),
    ([], m [("b", .meet bclose x1), ("a", .meet bopen pb)], .map [("a", dxy)]),
    ([], m [("b", m [("k", x1)]), ("a", .meet bclose (p ["b", "k"]))], .map [("a", dxy)]),
    ([], m [("b", .mapKind), ("a", .meet bclose pb)], .map [("a", dxy), ("b", dx)]),
    ([], kb, .map [("a", .map [("x", j 5)]), ("b", .map [("x", j 7)])]),
    ([], kb, .map [("a", .map [("x", j 3)])]),
    ([], kb, .map [("a", .map [("x", j 3), ("y", j 1)])]),
    ([], m [("b", x1), ("v", m [("a", .meet bclose pb)])], .map [("v", .map [("a", dxy)])]),
    ([], m [("b", x1), ("v", lst [.meet bclose pb])], .map [("v", .list [dxy])]),
    ([], opt, .map [("a", dxy)]),
    ([], opt, .map []),
    ([], td, .map [("v", .map [("m", dxy)])]),
    ([], td, .map [("v", .map [("m", dxyz)])]),
    ([], rb, .map [("a", dxy)]),
    ([], rb, .map [("a", dx)]),
    ([], lt, .map [("v", .list [dxy])]),
    ([], lt, .map [("v", .list [dx])]),
    ([], df, .map [("a", dxy)]),
    ([], df, .map []),
    ([], ho, .map [("a", .map [("x", .map [("y", j 1), ("z", j 2)])])]),
    ([], ho, .map [("a", .map [("x", .map [("y", j 1)]), ("w", j 1)])]),
    ([], arm, .map [("a", dxy)]),
    ([], arm, .map [("a", .map [("k", j 1)])]),
    ([], arm, .map [("a", dx)]),
    ([], ob, .map [("a", .map [("x", j 1), ("o", j 2)])]),
    ([], ob, .map [("a", .map [("x", j 1), ("z", j 2)])]),
    ([], m [("b", ms [("x", int 1)] .integer), ("a", .meet bclose pb)], .map [("a", .map [("x", j 1), ("z", j 2)])]),
    ([], m [("b", x1), ("a", .meet bclose pb), ("c", .meet bclose pb)], .map [("a", dx), ("c", dxy)]),
    ([], m [("b", x1), ("m", pb), ("a", .meet bclose (p ["m"]))], .map [("a", dxy)]),
    ([], ct, .map [("v", .map [("m", dxy)]), ("s", j 1)]),
    ([], ct, .map [("v", .map [("m", dx)]), ("s", j 1)]),
    ([], m [("a", .meet bclose (p ["d"]))], .map [("d", dx), ("a", dx)]),
    ([], m [("a", .meet bclose (p ["nope"]))], .map [("a", dx)])]

theorem directiveBesideCases_checkable : ∀ c ∈ directiveBesideCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem directive_beside_verdict_exact : ∀ c ∈ directiveBesideCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (directiveBesideCases_checkable c hc).1 (directiveBesideCases_checkable c hc).2 v

/-- A string is never a path, in the two shapes no row held: the `path`
kind met with a string, which doesn't promote the string, and a
relation over a list of strings, which refuses each leaf where an
address is wanted. Each is the schema's error. -/
def addressStringCases : List (Decls × Val × Data) :=
  [([], m [("p", .meet .pathKind (.lit (.str "$.a")))], .map []),
    ([], m [("a", m [("k", int 1)]), ("l", .meet (.call .relate []) (lst [.lit (.str "$.a")]))], .map [])]

theorem addressStringCases_checkable : ∀ c ∈ addressStringCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem addressString_verdict_exact : ∀ c ∈ addressStringCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (addressStringCases_checkable c hc).1 (addressStringCases_checkable c hc).2 v

/-- `maybe` over paths that name something and paths that name nothing:
absence at a required key and at an optional one, as a list's element,
an arm and a call's argument, and met with a literal and a kind, beside
data that supplies the key and data that supplies the path; a path to
an optional key and into a scalar, and a name declared nowhere; a
missing path met with a literal, an arm it kills and a conflict inside
the argument, a missing path that stands under a call, and a template
that is absence. -/
def maybeCases : List (Decls × Val × Data) :=
  let mb (v : Val) : Val := .call .maybe [v]
  let gone : Val := mb (p ["gone"])
  [([], m [("b", gone)], .map []),
    ([], m [("b", gone)], .map [("b", j 1)]),
    ([], m [("b", gone)], .map [("gone", j 5)]),
    ([], m [("b", gone)], .map [("gone", j 5), ("b", j 5)]),
    ([], m [("b", gone)], .map [("gone", j 5), ("b", j 6)]),
    ([], m [("a", int 1), ("b", mb (p ["a"]))], .map []),
    ([], m [("a", int 1), ("b", mb (p ["a"]))], .map [("a", j 1), ("b", j 1)]),
    ([], m [("a", int 1), ("b", mb (p ["a"]))], .map [("a", j 1), ("b", j 2)]),
    ([], m [("b", mb (p ["x"])), ("x", int 1)], .map []),
    ([], m [("b", .meet gone .string)], .map []),
    ([], m [("b", .meet gone .string)], .map [("b", .str "x")]),
    ([], m [("b", .meet gone .string)], .map [("b", j 1)]),
    ([], m [("b", .meet (int 1) gone)], .map []),
    ([], m [("b", .meet (int 1) gone)], .map [("b", j 2)]),
    ([], m [("b", mb (.meet (p ["gone"]) (int 1)))], .map []),
    ([], m [("b", mb (.meet (p ["gone"]) (int 1)))], .map [("b", j 2)]),
    ([], m [("b", mb (.meet (p ["gone"]) (int 1)))], .map [("gone", j 1)]),
    ([], m [("b", mb (.meet (p ["gone"]) (int 1)))], .map [("gone", j 2)]),
    ([], m [("b", mb (.or [(0, p ["gone"]), (0, int 1)]))], .map []),
    ([], m [("b", mb (.or [(0, p ["gone"]), (0, int 1)]))], .map [("b", j 2)]),
    ([], m [("b", mb (.meet (int 1) (int 2)))], .map []),
    ([], m [("b", mb (p ["x", "y"])), ("x", mo [("y", true, int 1)])], .map []),
    ([], m [("b", mb (p ["x", "y"])), ("x", int 1)], .map []),
    ([], m [("b", mb (.alias "U"))], .map []),
    ([], mo [("b", true, gone)], .map []),
    ([], m [("b", lst [int 1, gone])], .map []),
    ([], m [("b", lst [int 1, gone])], .map [("b", .list [j 1])]),
    ([], m [("b", lst [int 1, gone])], .map [("b", .list [j 1, j 7])]),
    ([], m [("b", .call .upper [gone])], .map []),
    ([], m [("b", .call .upper [gone])], .map [("b", .str "x")]),
    ([], m [("b", .call .add [int 1, gone])], .map []),
    ([], m [("b", .call .each [gone, m [("t", .hole)]])], .map []),
    ([], m [("b", .or [(0, gone), (0, int 1)])], .map []),
    ([], m [("b", .or [(0, gone), (0, int 1)])], .map [("b", j 1)]),
    ([], m [("b", .or [(1, gone), (0, int 1)])], .map []),
    ([], m [("b", mb (.call .upper [p ["gone"]]))], .map []),
    ([], m [("b", .call .each [lst [int 1], gone])], .map []),
    ([], m [("b", .call .each [lst [int 1], gone])], .map [("b", .list [])]),
    ([], m [("b", .call .pack [m [("x", int 1)], gone])], .map []),
    ([], m [("b", .call .pack [m [("x", int 1)], gone])], .map [("b", .map [("x", j 2)])])]

theorem maybeCases_checkable : ∀ c ∈ maybeCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem maybe_verdict_exact : ∀ c ∈ maybeCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (maybeCases_checkable c hc).1 (maybeCases_checkable c hc).2 v

/-- The cases of decision 24 of the design note's §7: a list holds no
position for an element that is absence, so each element after it moves
up, for the data, another list and a spread; absence first, in the
middle, beside a marked element, twice and alone; a `maybe` whose path
names something, which holds its position; and a link after an element
that's absence or marked, which lands at the index its element takes. -/
def absentListCases : List (Decls × Val × Data) :=
  let gone : Val := .call .maybe [p ["gone"]]
  let first : Val := lst [gone, .lit (.str "a"), int 2]
  let named : Val := m [("a", lst [.call .maybe [p ["b"]], int 2]), ("b", int 1)]
  [([], m [("a", first)], .map [("a", .list [.str "a", j 2])]),
    ([], m [("a", first)], .map [("a", .list [j 7, .str "a", j 2])]),
    ([], m [("a", .meet (lst [int 1, gone, int 2]) (lst [int 1, int 5, int 2]))], .map []),
    ([], m [("a", .meet (lst [gone, int 1]) (lst [int 1]))], .map [("a", .list [j 1])]),
    ([], m [("a", lst [hide (int 1), gone, int 2])], .map [("a", .list [j 2])]),
    ([], m [("a", lst [gone, gone, int 3])], .map [("a", .list [j 3])]),
    ([], m [("a", lst [gone])], .map [("a", .list [.str "x"])]),
    ([], m [("a", .list [gone, int 1] (some .integer) false)], .map [("a", .list [j 1, j 2])]),
    ([], named, .map [("a", .list [j 1, j 2]), ("b", j 1)]),
    ([], named, .map [("a", .list [j 2]), ("b", j 1)]),
    ([], m [("a", m []), ("l", lst [gone, .meet (.call .relate [m [("k", int 1)]]) (lst [.addr ⟨0, ["a"]⟩])])],
      .map [("a", .map [("k", j 2)])]),
    ([], m [("a", m []), ("l", lst [gone, .meet (.call .relate [m [("k", int 1)]]) (lst [.addr ⟨0, ["a"]⟩])])],
      .map [("a", .map [("k", j 1)])]),
    ([], m [("a", m []), ("l", lst [hide (int 1), .meet (.call .relate [m [("k", int 1)]]) (.addr ⟨0, ["a"]⟩)])],
      .map [("a", .map [("k", j 2)])]),
    ([], m [("a", m []), ("l", lst [int 1, gone, .meet (.call .relate [m [("k", int 1)]]) (.addr ⟨0, ["a"]⟩)])],
      .map [("a", .map [("k", j 2)])])]

theorem absentListCases_checkable : ∀ c ∈ absentListCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem absent_list_verdict_exact : ∀ c ∈ absentListCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (absentListCases_checkable c hc).1 (absentListCases_checkable c hc).2 v

/-- A sum of an absence is absent: `+` over an operand that is absence
makes no value, as any call over one does, so the key that holds it is
left out, and an element that holds it takes no position. Absence on
the right, on the left and on both sides, beside a list, a string and
a number; a `maybe` whose path names something, in the schema and in
the data, where the sum is made; data at the key the sum would have
filled; a sum inside a sum; a sum met with a kind, which the absence
leaves as it is; and one under an optional key. -/
def sumAbsentCases : List (Decls × Val × Data) :=
  let gone : Val := .call .maybe [p ["t"]]
  let plus (a b : Val) : Val := .call .plus [a, b]
  let head : Val := lst [.lit (.str "h")]
  [([], m [("a", plus head gone)], .map []),
    ([], m [("t", lst [.lit (.str "x")]), ("a", plus head gone)], .map []),
    ([], m [("a", plus gone head)], .map []),
    ([], m [("a", plus (.lit (.str "h")) gone)], .map []),
    ([], m [("a", plus (int 1) gone)], .map []),
    ([], m [("a", plus gone (.call .maybe [p ["u"]]))], .map []),
    ([], m [("a", plus head gone), ("b", int 1)], .map []),
    ([], m [("a", plus head gone)], .map [("a", .list [.str "z"])]),
    ([], m [("a", plus head gone)], .map [("t", .list [.str "x"])]),
    ([], m [("a", lst [int 1, plus (.lit (.str "h")) gone])], .map []),
    ([], m [("a", plus (plus head gone) (lst [.lit (.str "z")]))], .map []),
    ([], m [("a", .meet .listKind (plus head gone))], .map []),
    ([], mo [("a", true, plus head gone)], .map [])]

theorem sumAbsentCases_checkable : ∀ c ∈ sumAbsentCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem sumAbsent_verdict_exact : ∀ c ∈ sumAbsentCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (sumAbsentCases_checkable c hc).1 (sumAbsentCases_checkable c hc).2 v

/-- A spread's template doesn't apply to a member that is absence: the
map leaves the member out, as it would with no template, and a list
holds no position for the element. The template beside the map, on
either side, and written in it; data that is the output, which lacks
nothing; data at the key, which the template still holds, and data that
names the path; a `maybe` whose path names something, which the
template holds; a template of maps, one with a default, one that reads
the key, a template in a template and two templates; an optional key,
another declaration of the key with a value, one with a value the
template refuses, a kind and `any` met with the absence; a sealed map
beside, which refuses the key, and a sealed map of its own; an absence
that is computed, under a mark, as a meet of two, in two declarations,
by a sum, by a call and by `maybe` again; and a list, for a sum, a
marked element and a map under a template of its own. -/
def absentSpreadCases : List (Decls × Val × Data) :=
  let mb (v : Val) : Val := .call .maybe [v]
  let gone : Val := mb (p ["gone"])
  let also : Val := mb (p ["also"])
  let px : Val := .lit (.str "p")
  let ts : Val := tmpl .string
  let lt (t : Val) : Val := .list [] (some t) false
  let one : Val := .meet ts (m [("y", gone)])
  let both : Val := .meet ts (m [("x", px), ("y", gone)])
  let own : Val := .map [("x", false, px), ("y", false, gone)] (some .string) false
  let dflt : Val := .meet (tmpl (.or [(1, int 1), (0, .integer)])) (m [("y", gone)])
  let sum : Val := .meet ts (m [("x", px), ("y", .call .plus [.lit (.str "h"), gone])])
  let out : Data := .map [("a", .map [("x", .str "p")])]
  [([], m [("a", both)], .map []),
    ([], m [("a", both)], out),
    ([], m [("a", .meet (m [("x", px), ("y", gone)]) ts)], .map []),
    ([], m [("a", own)], .map []),
    ([], m [("a", own)], out),
    ([], m [("a", one)], .map [("a", .map [("y", .str "s")])]),
    ([], m [("a", one)], .map [("a", .map [("y", j 5)])]),
    ([], m [("a", one)], .map [("gone", .str "z")]),
    ([], m [("a", one)], .map [("gone", j 1)]),
    ([], m [("n", .lit (.str "q")), ("a", .meet ts (m [("x", px), ("y", mb (p ["n"]))]))], .map []),
    ([], m [("n", int 1), ("a", .meet ts (m [("x", px), ("y", mb (p ["n"]))]))], .map []),
    ([], m [("a", .meet (tmpl (m [("k", .integer)])) (m [("y", gone)]))], .map []),
    ([], m [("a", dflt)], .map []),
    ([], m [("a", dflt)], .map [("a", .map [])]),
    ([], m [("a", .meet (tmpl (m [("n", .key)])) (m [("y", gone)]))], .map []),
    ([], m [("a", .meet (tmpl ts) (m [("b", m [("x", px), ("y", gone)])]))], .map []),
    ([], m [("a", .meet (tmpl (tmpl .integer)) (m [("b", m [("k", int 1), ("j", gone)]), ("c", gone)]))],
      .map []),
    ([], m [("a", .meet (.meet ts (tmpl (.or [(0, px), (0, .lit (.str "q"))]))) (m [("x", px), ("y", gone)]))],
      .map []),
    ([], m [("a", .meet ts (mo [("x", false, px), ("y", true, gone)]))], .map []),
    ([], m [("a", .meet one (m [("y", .lit (.str "s"))]))], .map []),
    ([], m [("a", .meet one (m [("y", int 5)]))], .map []),
    ([], m [("a", .meet ts (m [("x", px), ("y", .meet gone .string)]))], .map []),
    ([], m [("a", .meet ts (m [("x", px), ("y", .meet gone .any)]))], .map []),
    ([], m [("a", .meet (.map [("x", false, .string)] none true) (m [("x", px), ("y", gone)]))], .map []),
    ([], m [("a", .meet (.ride .seals .any []) (m [("y", gone)]))], .map [("a", .map [("y", j 5)])]),
    ([], m [("a", .meet ts (m [("x", px), ("y", hide gone)]))], .map []),
    ([], m [("a", .meet ts (m [("x", px), ("y", .meet gone also)]))], .map []),
    ([], m [("a", .meet one (m [("y", also)]))], .map []),
    ([], m [("a", .meet one (m [("y", gone)]))], .map []),
    ([], m [("a", sum)], .map []),
    ([], m [("a", sum)], out),
    ([], m [("a", .meet ts (m [("x", px), ("y", .call .upper [gone])]))], .map []),
    ([], m [("a", .meet ts (m [("x", px), ("y", mb gone)]))], .map []),
    ([], m [("a", .meet (lt .string) (lst [px, .call .plus [.lit (.str "h"), gone]]))], .map []),
    ([], m [("a", .meet (lt .string) (lst [px, hide gone]))], .map []),
    ([], m [("a", .meet (lt ts) (lst [m [("x", px), ("y", gone)]]))], .map [])]

theorem absentSpreadCases_checkable : ∀ c ∈ absentSpreadCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem absentSpread_verdict_exact : ∀ c ∈ absentSpreadCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (absentSpreadCases_checkable c hc).1 (absentSpreadCases_checkable c hc).2 v

/-- `pref` over a literal, a map, a list, a disjunction with a preferred
arm and one with a kind, a kind, a bound, a preference, `null`, a
boolean and a map arm beside a literal; over a path, a call and
absence; over a literal, a preference and a map under a rider; met
with a preference; and over a list and a map that hold a call waiting on
its own hole, which each member preferred reads as `pref` of that call
(#604), the call's other arguments left as written. -/
def prefCases : List (Decls × Val × Data) :=
  let pf (v : Val) : Val := .call .pref [v]
  let up2 : Val := .call .upper [.hole, int 0, int 1]
  let rp : Val := .call .rep [.hole, .lit (.str "a"), .lit (.str "b")]
  [([], m [("b", pf (int 1))], .map []),
    ([], m [("b", pf (int 1))], .map [("b", j 2)]),
    ([], m [("b", pf (int 1))], .map [("b", .str "x")]),
    ([], m [("b", pf (m [("x", int 1)]))], .map []),
    ([], m [("b", pf (m [("x", int 1)]))], .map [("b", .map [("x", j 2)])]),
    ([], m [("b", pf (m [("x", int 1)]))], .map [("b", .map [("x", .str "y")])]),
    ([], m [("b", pf (lst [int 1, int 2]))], .map []),
    ([], m [("b", pf (lst [int 1, int 2]))], .map [("b", .list [j 3, j 4])]),
    ([], m [("b", pf (lst [int 1, int 2]))], .map [("b", .list [j 3])]),
    ([], m [("b", pf (.or [(1, int 1), (0, int 2)]))], .map []),
    ([], m [("b", pf (.or [(1, int 1), (0, int 2)]))], .map [("b", j 1)]),
    ([], m [("b", pf (.or [(0, int 1), (0, .number)]))], .map []),
    ([], m [("b", pf (.or [(0, int 1), (0, .number)]))], .map [("b", j 5)]),
    ([], m [("b", pf .integer)], .map []),
    ([], m [("b", pf .integer)], .map [("b", j 3)]),
    ([], m [("b", pf .integer)], .map [("b", .num (.float (.dyadic 3 (-1))))]),
    ([], m [("b", pf (.above (.num (.integer (.of 1)))))], .map [("b", j 0)]),
    ([], m [("b", pf (.pref 2 (int 1)))], .map []),
    ([], m [("b", .meet (pf (.pref 1 (int 1))) (.pref 1 (int 2)))], .map []),
    ([], m [("b", .meet (pf (int 1)) (pf (int 2)))], .map []),
    ([], m [("b", pf (.lit .null))], .map [("b", j 1)]),
    ([], m [("b", pf (.lit (.bool true)))], .map [("b", .bool false)]),
    ([], m [("b", pf (.or [(0, m [("x", int 1)]), (0, int 2)]))], .map []),
    ([], m [("a", int 1), ("b", pf (p ["a"]))], .map []),
    ([], m [("a", int 1), ("b", pf (p ["a"]))], .map [("b", j 2)]),
    ([], m [("b", pf (.call .add [int 1, int 2]))], .map []),
    ([], m [("b", pf (.call .add [int 1, int 2]))], .map [("b", j 4)]),
    ([], m [("b", pf (.call .maybe [p ["gone"]]))], .map []),
    ([], m [("b", pf (.ride .hide (int 1) []))], .map []),
    ([], m [("b", pf (.ride .metadata (int 1) [("x", j 2)]))], .map [("b", j 3)]),
    ([], m [("b", pf (.ride .hide (.pref 1 (int 1)) []))], .map []),
    ([], m [("b", pf (.ride .hide (m [("x", int 1)]) []))], .map []),
    ([], m [("b", pf (lst [up]))], .map []),
    ([], m [("b", pf (lst [up]))], .map [("b", j 3)]),
    ([], m [("b", pf (lst [up]))], .map [("b", .str "x")]),
    ([], m [("b", pf (lst [up]))], .map [("b", .list [])]),
    ([], m [("b", pf (lst [up]))], .map [("b", .list [j 3])]),
    ([], m [("b", pf (lst [up]))], .map [("b", .list [.str "x"])]),
    ([], m [("b", pf (lst [up]))], .map [("b", .list [j 3, j 4])]),
    ([], m [("b", pf (lst [up]))], .map [("b", .list [.list [j 3]])]),
    ([], m [("b", pf (lst [up]))], .map [("b", .map [("k", j 1)])]),
    ([], m [("b", pf (lst [up]))], .map [("b", .map [])]),
    ([], m [("b", pf (m [("k", up)]))], .map []),
    ([], m [("b", pf (m [("k", up)]))], .map [("b", .map [("k", .str "x")])]),
    ([], m [("b", pf (m [("k", up)]))], .map [("b", .map [("k", .list [j 3])])]),
    ([], m [("b", pf (m [("k", up)]))], .map [("b", j 3)]),
    ([], m [("b", pf (lst [up2]))], .map []),
    ([], m [("b", pf (lst [up2]))], .map [("b", .list [.str "abc"])]),
    ([], m [("b", pf (lst [up2]))], .map [("b", .list [j 3])]),
    ([], m [("b", pf (m [("k", up2)]))], .map [("b", .map [("k", .str "abc")])]),
    ([], m [("b", pf (lst [rp]))], .map []),
    ([], m [("b", pf (lst [rp]))], .map [("b", .list [.str "xa"])])]

theorem prefCases_checkable : ∀ c ∈ prefCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem pref_verdict_exact : ∀ c ∈ prefCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (prefCases_checkable c hc).1 (prefCases_checkable c hc).2 v

/-- `copy` of a sealed map and a sealed list, beside data that adds to
them and data that meets them, and of one inside a map and inside a
meet; of a hidden and a typed literal, alone and under a key, beside
data that writes the value and data that leaves it out, which the fill
then supplies; of a path to a sealed map, a typed map and a hidden
literal, and of a name for a sealed and a typed map; a copy met with
another map; a literal one of whose members refers to another, alone,
met with a map and copied twice, which reads where the copy lands; a
hidden value met with absence, and one preferred in a disjunction; and,
beside them, a path to the typed map, which a copy would open (decision
27 of the design note's §7). -/
def copyCases : List (Decls × Val × Data) :=
  let sm (fs : List (String × Val)) : Val := .map (fs.map fun f => (f.1, false, f.2)) none true
  let cp (v : Val) : Val := .call .copy [v]
  let ab : Data := .map [("v", .map [("a", j 1), ("b", j 2)])]
  let sib : List (String × Val) := [("a", .path [.up 1, .key "b"]), ("b", int 1)]
  let s11 : Data := .map [("v", .map [("a", j 1), ("b", j 1)])]
  let s112 : Data := .map [("v", .map [("a", j 1), ("b", j 1), ("c", j 2)])]
  let hm : Val := .meet (.ride .hide (int 1) []) (.call .maybe [p ["missing"]])
  [([], m [("v", cp (sm [("a", int 1)]))], ab),
    ([], m [("v", cp (sm [("a", int 1)]))], .map [("v", .map [("a", j 1)])]),
    ([], m [("v", cp (sm [("a", int 1)]))], .map [("v", .map [("a", j 2)])]),
    ([], m [("v", cp (.list [int 1] none true))], .map [("v", .list [j 1, j 2])]),
    ([], m [("v", cp (m [("a", sm [("x", int 1)])]))], .map [("v", .map [("a", .map [("x", j 1), ("y", j 2)])])]),
    ([], m [("v", cp (.meet (sm [("a", int 1)]) (m [("a", int 1)])))], ab),
    ([], m [("v", cp (.ride .hide (int 1) []))], .map [("v", j 1)]),
    ([], m [("v", cp (.ride .hide (int 1) []))], .map []),
    ([], m [("v", cp (.ride .type (int 1) []))], .map []),
    ([], m [("v", cp (m [("a", .ride .hide (int 1) []), ("b", int 2)]))], .map [("v", .map [("b", j 2)])]),
    ([], m [("v", cp (m [("a", .ride .hide (int 1) []), ("b", int 2)]))], ab),
    ([], m [("v", cp (m [("a", .ride .type (m [("x", int 1)]) [])]))],
      .map [("v", .map [("a", .map [("x", j 1), ("y", j 2)])])]),
    ([], m [("v", cp (m [("a", .ride .type (m [("x", int 1)]) [])]))], .map [("v", .map [])]),
    ([], m [("x", sm [("a", int 1)]), ("v", cp (p ["x"]))], ab),
    ([], m [("x", .ride .type (m [("a", int 1)]) []), ("v", cp (p ["x"]))], ab),
    ([], m [("x", .ride .type (m [("a", int 1)]) []), ("v", p ["x"])], ab),
    ([], m [("x", .ride .hide (int 1) []), ("v", cp (p ["x"]))], .map [("v", j 1)]),
    ([("T", sm [("a", int 1)])], m [("v", cp (.alias "T"))], ab),
    ([("T", .ride .type (m [("a", int 1)]) [])], m [("v", cp (.alias "T"))], ab),
    ([], m [("v", .meet (cp (sm [("a", int 1)])) (m [("b", int 2)]))], ab),
    ([], m [("v", cp (m sib))], s11),
    ([], m [("v", cp (m sib))], .map [("v", .map [("a", j 2), ("b", j 1)])]),
    ([], m [("v", .meet (cp (m sib)) (m [("c", int 2)]))], s112),
    ([], m [("v", cp (cp (m sib)))], s11),
    ([], m [("v", cp (.or [(1, .ride .hide (int 1) []), (0, int 2)]))], .map [("v", j 1)]),
    ([], m [("v", cp hm)], .map [("v", j 1)]),
    ([], m [("v", cp hm)], .map [])]

theorem copyCases_checkable : ∀ c ∈ copyCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem copy_verdict_exact : ∀ c ∈ copyCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (copyCases_checkable c hc).1 (copyCases_checkable c hc).2 v

/-- Paths into a call's output, which resolve in the root with its calls
made: a preference's map, a name's spellings, two lists added and a
selection's result, beside data that agrees and data that refuses. -/
def callPathCases : List (Decls × Val × Data) :=
  let pfx : Val := .call .pref [m [("x", int 1)]]
  let nm : Val := .call .nom [.lit (.str "ab_cd")]
  let sum : Val := .call .plus [lst [int 1], lst [int 2]]
  let sel : Val := .select (int 1) [(int 1, m [("x", int 2)])] none
  [([], m [("b", pfx), ("c", p ["b", "x"])], .map []),
    ([], m [("b", pfx), ("c", p ["b", "x"])], .map [("c", j 2)]),
    ([], m [("b", pfx), ("c", p ["b", "x"])], .map [("b", .map [("x", j 5)])]),
    ([], m [("b", nm), ("c", p ["b", "camel"])], .map []),
    ([], m [("b", nm), ("c", p ["b", "camel"])], .map [("c", .str "x")]),
    ([], m [("a", sum), ("b", .path [.key "a", .idx 1])], .map []),
    ([], m [("a", sum), ("b", .path [.key "a", .idx 1])], .map [("b", j 3)]),
    ([], m [("a", sel), ("b", p ["a", "x"])], .map []),
    ([], m [("a", sel), ("b", p ["a", "x"])], .map [("b", j 3)])]

theorem callPathCases_checkable : ∀ c ∈ callPathCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem call_path_verdict_exact : ∀ c ∈ callPathCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (callPathCases_checkable c hc).1 (callPathCases_checkable c hc).2 v

/-- A call over a hole that a path names, which the data once filled
(decision 29, which ruling 34 supersedes): `sum` over a path to a list
that holds one, over a list that holds a path to a hole, and over one
that holds a written hole beside a path to one, against data that
writes the hole and data that writes nothing. The hole is one nothing
binds, so each is an error of the schema whatever the data. -/
def dataPathCases : List (Decls × Val × Data) :=
  let x21 : Data := .list [j 2, j 1]
  let dA : Val := m [("v", .call .sum [p ["x"]]), ("x", lst [.hole, int 1])]
  let dB : Val := m [("v", .call .sum [lst [p ["h"], int 1]]), ("h", .hole)]
  let dD : Val := m [("v", .call .sum [p ["y"]]), ("y", p ["x"]), ("x", lst [.hole, int 1])]
  let dW : Val := m [("v", .call .sum [lst [.hole, p ["h"]]]), ("h", .hole)]
  [([], dA, .map [("v", j 3), ("x", x21)]), ([], dA, .map [("x", x21)]), ([], dA, .map []),
    ([], dA, .map [("v", j 4), ("x", x21)]),
    ([], dB, .map [("v", j 3), ("h", j 2)]), ([], dB, .map [("h", j 2)]), ([], dB, .map []),
    ([], dD, .map [("v", j 3), ("x", x21), ("y", x21)]), ([], dD, .map []),
    ([], m [("v", .call .upper [.call .sum [p ["x"]]]), ("x", lst [.hole, int 1])], .map [("x", x21)]),
    ([], m [("v", .call .sum [p ["x"]]), ("x", lst [.keyUp 1, int 1])], .map []),
    ([], dW, .map [("v", j 3), ("h", j 2)]), ([], dW, .map [])]

theorem dataPathCases_checkable : ∀ c ∈ dataPathCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem data_path_verdict_exact : ∀ c ∈ dataPathCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (dataPathCases_checkable c hc).1 (dataPathCases_checkable c hc).2 v

/-- `move` of a path to a scalar, beside data that supplies the source,
data that refuses it and data that overrides the copy; of a path into a
map; of a path to a list; of a value written in place; of a path to
nothing; in a body, used and not; of a path under a rider; in the arm a
selection takes and in one it passes by; in a map's template with no
member and with one, and in a list's with no element and with one; in
an arm of a disjunction the data passes by; in a body, in the arm a
selection takes, in one it passes by and in a template with no member;
and of a value a call reads, `add`, `sum` and `+`. -/
def moveCases : List (Decls × Val × Data) :=
  let mv (v : Val) : Val := .call .move [v]
  let sel (s : Val) (k : String) : Val := .select s [(int 1, mv (p [k]))] (some (int 2))
  [([], m [("a", int 1), ("b", mv (p ["a"]))], .map []),
    ([], m [("a", int 1), ("b", mv (p ["a"]))], .map [("a", j 1)]),
    ([], m [("a", int 1), ("b", mv (p ["a"]))], .map [("a", j 2)]),
    ([], m [("a", int 1), ("b", mv (p ["a"]))], .map [("b", j 2)]),
    ([], m [("a", m [("c", int 1), ("d", int 2)]), ("b", mv (p ["a", "c"]))], .map []),
    ([], m [("a", m [("c", int 1), ("d", int 2)]), ("b", mv (p ["a", "c"]))],
      .map [("a", .map [("d", j 2)]), ("b", j 1)]),
    ([], m [("a", lst [int 1, int 2]), ("b", mv (p ["a"]))], .map []),
    ([], m [("b", mv (m [("x", int 1)]))], .map []),
    ([], m [("b", mv (p ["gone"]))], .map []),
    ([("T", m [("y", mv (p ["x"]))])], m [("x", int 1), ("a", .alias "T")], .map []),
    ([("T", m [("y", mv (p ["x"]))])], m [("x", int 1), ("a", .alias "T")], .map [("a", .map [("y", j 1)])]),
    ([("T", m [("y", mv (p ["x"]))])], m [("x", int 1)], .map []),
    ([("T", m [("y", mv (p ["x"]))])], m [("x", int 1)], .map [("x", j 2)]),
    ([], m [("x", int 1), ("y", mv (.ride .metadata (p ["x"]) [("q", j 1)]))], .map []),
    ([], m [("x", int 1), ("y", mv (.ride .metadata (p ["x"]) [("q", j 1)]))], .map [("x", j 2)]),
    ([], m [("x", int 1), ("y", mv (.ride .hide (p ["x"]) []))], .map []),
    ([], m [("x", int 1), ("y", mv (.ride .hide (p ["x"]) []))], .map [("y", j 1)]),
    ([], m [("a", int 1), ("b", sel (int 2) "a")], .map [("b", j 2)]),
    ([], m [("a", int 1), ("b", sel (int 1) "a")], .map [("b", j 1)]),
    ([], m [("a", int 1), ("b", .map [] (some (mv (p ["a"]))) false)], .map [("b", .map [])]),
    ([], m [("a", int 1), ("b", .map [("x", false, int 1)] (some (mv (p ["a"]))) false)],
      .map [("b", .map [("x", j 1)])]),
    ([], m [("a", int 1), ("b", .list [] (some (mv (p ["a"]))) false)], .map [("b", .list [])]),
    ([], m [("a", int 1), ("b", .list [] (some (mv (p ["a"]))) false)], .map [("b", .list [j 1])]),
    ([], m [("a", int 1), ("b", .or [(0, mv (p ["a"])), (0, int 2)])], .map [("b", j 2)]),
    ([("T", m [("y", sel (int 2) "x")])], m [("x", int 1)], .map []),
    ([("T", m [("y", sel (int 1) "x")])], m [("x", int 1)], .map []),
    ([("T", m [("y", .map [] (some (mv (p ["x"]))) false)])], m [("x", int 1)], .map []),
    ([], m [("a", int 1), ("b", .call .add [mv (p ["a"]), int 2])], .map [("b", j 3)]),
    ([], m [("a", lst [int 1, int 2]), ("b", .call .sum [mv (p ["a"])])], .map [("b", j 3)]),
    ([], m [("a", int 1), ("b", .call .plus [mv (p ["a"]), int 2])], .map [("b", j 3)])]

theorem moveCases_checkable : ∀ c ∈ moveCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem move_verdict_exact : ∀ c ∈ moveCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (moveCases_checkable c hc).1 (moveCases_checkable c hc).2 v

/-- `move` of a value a selection reads as its scrutinee, and of one a
`filter` reads as its source, each beside data the made value admits. -/
def moveReadCases : List (Decls × Val × Data) :=
  let mv (k : String) : Val := .call .move [.path [.key k]]
  [([], m [("a", int 1), ("b", .select (mv "a") [(int 1, str "x")] (some (str "y")))], .map [("b", .str "x")]),
    ([], m [("a", .list [int 1, int 2] none false), ("b", .filter (mv "a") (.min (.num (.integer (.of 2)))))],
      .map [("b", .list [j 2])])]

/-- The checker can't read a selection over a call or a `filter` before
the reading makes it, so each case's reading with the data is read
whole (`Decls.readsPD`). -/
theorem moveReadCases_reads : ∀ c ∈ moveReadCases, c.1.readsPD c.2.1 c.2.2 = true := by decide +kernel

theorem moveRead_verdict_exact : ∀ c ∈ moveReadCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff_readsD (moveReadCases_reads c hc) v

/-- `move` of a list's element and of a member inside one: the element
stays at its position in what the schema admits, as both ports read it,
and the member is hidden in the element it stands in. -/
def moveListCases : List (Decls × Val × Data) :=
  let mv (ks : List String) : Val := .call .move [.path (ks.map .key)]
  let two := m [("a", lst [int 1, int 2]), ("b", mv ["a", "0"])]
  let inner := m [("a", lst [m [("c", int 1), ("d", int 2)]]), ("b", mv ["a", "0", "c"])]
  [([], two, .map []),
    ([], two, .map [("a", .list [j 2]), ("b", j 1)]),
    ([], two, .map [("a", .list [j 1, j 2])]),
    ([], m [("a", lst [int 1, int 2]), ("b", mv ["a", "1"])], .map [("a", .list [j 1])]),
    ([], inner, .map [("a", .list [.map [("d", j 2)]]), ("b", j 1)]),
    ([], inner, .map [("a", .list [.map [("c", j 1), ("d", j 2)]])])]

theorem moveListCases_checkable : ∀ c ∈ moveListCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem moveList_verdict_exact : ∀ c ∈ moveListCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (moveListCases_checkable c hc).1 (moveListCases_checkable c hc).2 v
