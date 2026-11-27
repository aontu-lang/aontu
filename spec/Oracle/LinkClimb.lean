import Oracle.Base

/-! The oracle's cases for a path in a link's template that climbs past the template. -/

open Aontu
open Case

/-- Ruling 92: a path in a link's template that climbs past the template
reads where the link is written, while one that stays inside reads at
the target: two dots and three from a link whose target isn't its
sibling, from deeper in the template, beside a path that stays inside,
under a call, past the top of the document, and in a declaration's
body. -/
def linkClimbCases : List (Decls × Val × Data) :=
  let rf (t : Val) (ks : List String) : Val := .meet (.call .relate [t]) (.addr ⟨0, ks⟩)
  let two : Val := m [("k", int 7), ("x", m [("k", int 3), ("n", rf (m [("v", rel 2 ["k"])]) ["out"])]), ("out", m [])]
  let inside : Val :=
    m [("k", int 7), ("x", m [("k", int 3), ("n", rf (m [("v", rel 1 ["k"])]) ["out"])]), ("out", m [("k", int 5)])]
  let three : Val :=
    m [("k", int 7), ("x", m [("k", int 3), ("y", m [("n", rf (m [("v", rel 3 ["k"])]) ["out"])])]), ("out", m [])]
  let deep : Val :=
    m [("k", int 7), ("x", m [("k", int 3), ("n", rf (m [("w", m [("v", rel 3 ["k"])])]) ["out"])]), ("out", m [])]
  let top : Val := m [("k", int 7), ("n", rf (m [("v", rel 3 ["k"])]) ["out"]), ("out", m [])]
  let both : Val :=
    m [("k", int 7), ("x", m [("k", int 3), ("n", rf (m [("v", rel 2 ["k"]), ("u", rel 1 ["v"])]) ["out"])]),
      ("out", m [])]
  let sum : Val :=
    m [("k", int 7), ("x", m [("k", int 3), ("n", rf (m [("v", .call .plus [rel 2 ["k"], int 1])]) ["out"])]),
      ("out", m [])]
  let body : Decls := [("T", m [("k", int 3), ("n", rf (m [("v", rel 2 ["k"])]) ["out"])])]
  let named : Val := m [("k", int 7), ("x", .alias "T"), ("out", m [])]
  let out (fs : List (String × Data)) : Data := .map [("out", .map fs)]
  [([], two, out [("v", j 3)]),
    ([], two, out [("v", j 7)]),
    ([], two, .map []),
    ([], inside, out [("k", j 5), ("v", j 5)]),
    ([], inside, out [("k", j 5), ("v", j 3)]),
    ([], three, out [("v", j 3)]),
    ([], three, out [("v", j 7)]),
    ([], deep, out [("w", .map [("v", j 3)])]),
    ([], deep, out [("w", .map [("v", j 7)])]),
    ([], top, out [("v", j 7)]),
    ([], top, .map []),
    ([], both, out [("v", j 3), ("u", j 3)]),
    ([], both, out [("v", j 7), ("u", j 7)]),
    ([], sum, out [("v", j 4)]),
    ([], sum, out [("v", j 8)]),
    (body, named, out [("v", j 3)]),
    (body, named, out [("v", j 7)])]

theorem linkClimbCases_checkable : ∀ c ∈ linkClimbCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem linkClimb_verdict_exact : ∀ c ∈ linkClimbCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (linkClimbCases_checkable c hc).1 (linkClimbCases_checkable c hc).2 v
