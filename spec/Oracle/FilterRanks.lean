import Oracle.Base

/-! The oracle's cases for a `filter` whose condition and children prefer an arm. -/

open Aontu
open Case

/-- Ruling 51 (#963): a `filter` keeps a child each of whose values its
condition admits, a disjunction read arm by arm, whatever ranks the meet
stacks on a preferred arm: `*1 | 2` and `2 | *1` under `*1 | 2`, beside a
plain `1`; `*1 | 3`, whose `3` it refuses, is dropped; and the same
children under a condition that prefers nothing. -/
def filterRankDocs : List Val :=
  let cond : Val := .or [(1, int 1), (0, int 2)]
  let ab : Val := .or [(1, int 1), (0, int 2)]
  let ba : Val := .or [(0, int 2), (1, int 1)]
  let doc (fs : List (String × Val)) (c : Val) : Val := m [("x", .filter (m fs) c)]
  [doc [("a", ab), ("b", ba), ("c", int 1)] cond,
    doc [("h", .or [(1, int 1), (0, int 3)])] cond,
    doc [("a", ab), ("d", int 3)] cond,
    doc [("a", ab), ("b", ba)] (.or [(0, int 1), (0, int 2)])]

/-- Each document of `filterRankDocs` beside data that leaves out every
member it keeps but `c`, so that `--no-fill` tells a kept member from a
dropped one. -/
def filterRankCases : List (Decls × Val × Data) :=
  let x (fs : List (String × Data)) : Data := .map [("x", .map fs)]
  filterRankDocs.zip [x [("c", j 1)], x [], x [], x []] |>.map fun p => ([], p.1, p.2)
