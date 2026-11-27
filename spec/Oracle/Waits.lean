import Oracle.Base

/-! The oracle's cases for a call that waits inside `contains`, `rest`, `len` and a starred branch. -/

open Aontu
open Case

/-- Ruling 91: a call still waiting for an operand, `integer + 1`, makes
`contains`, `rest`, `len` and a starred branch of `nof` wait with it, as
`nof`, `must`, `when` and `match` do: `contains` over an empty list and
over a list of one, with a count of its own, `rest` over a cover and as
its template, `len` against a string and a list, a starred branch, a
spread's template that is the call, and a branch that waits beside
them. Then the same forms over a value that doesn't wait, which still
answer. -/
def waitMoreCases : List (Decls × Val × Data) :=
  let w : Val := .call .plus [.integer, int 1]
  let min1 : Val := .min (.num (.integer (.of 1)))
  let sv (t : Val) : Val := m [("v", t)]
  let dv (d : Data) : Data := .map [("v", d)]
  [([], sv (.contains w min1), dv (.list [])),
    ([], sv (.contains w min1), dv (.list [j 5])),
    ([], sv (.contains w (int 2)), dv (.list [j 5])),
    ([], sv (.rest (int 1) [(none, none, some w)]), dv (.list [j 5])),
    ([], sv (.rest w []), dv (.list [j 5])),
    ([], sv (.len w), dv (.str "ab")),
    ([], sv (.len w), dv (.list [j 1, j 2])),
    ([], sv (.nof (int 0) [.pref 1 w]), dv (j 5)),
    ([], sv (.map [] (some w) false), dv (.map [("a", j 5)])),
    ([], sv (.nof (int 0) [w]), dv (j 5)),
    ([], sv (.contains (int 5) min1), dv (.list [j 5])),
    ([], sv (.contains (int 6) min1), dv (.list [j 5])),
    ([], sv (.len (int 2)), dv (.list [j 1, j 2])),
    ([], sv (.rest .integer []), dv (.list [j 5])),
    ([], sv (.nof (int 0) [.pref 1 (int 6)]), dv (j 5))]

theorem waitMoreCases_checkable : ∀ c ∈ waitMoreCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem waitMore_verdict_exact : ∀ c ∈ waitMoreCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (waitMoreCases_checkable c hc).1 (waitMoreCases_checkable c hc).2 v
