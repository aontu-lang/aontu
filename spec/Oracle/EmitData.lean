import Oracle.Base
import Oracle.Custom

/-! The oracle's cases of a recursion through a named table over a
selection the data alone supplies, apart so that they build on their
own. -/

open Aontu
open Case

/-- A tree of one child under each node, `n` levels below the root, and
the names a walk down it writes, the root's first. -/
def chainTree : ℕ → Data
  | 0 => dm [("name", js "n0"), ("kids", jl [])]
  | n + 1 => dm [("name", js ("n" ++ toString (n + 1))), ("kids", jl [chainTree n])]

def chainNames : ℕ → List Data
  | 0 => [js "n0"]
  | n + 1 => js ("n" ++ toString (n + 1)) :: chainNames n

/-- A named table that names itself, walking a tree each member of a
spread supplies in the data, against the names the walk writes: down
trees of one, three, and more levels than the document and its table
hold terms, and against a walk that leaves a name out. -/
def emitDataCases : List (Decls × Val × Data) :=
  let nd (k : String) : Val := .path [.node, .key k]
  let w : Decls := [("W", c .emit [.hole, mp [("match", mp [("name", .string)]),
    ("body", lst [nd "name", c .emit [nd "kids", .alias "W"]])]])]
  let S : Val := m [("items", tmpl (m [("tree", .listKind), ("out", c .emit [rel 1 ["tree"], .alias "W"])]))]
  let doc (t : Data) (out : List Data) : Data := dm [("items", dm [("x", dm [("tree", jl [t]), ("out", jl out)])])]
  [(w, S, doc (chainTree 0) (chainNames 0)),
    (w, S, doc (chainTree 2) (chainNames 2)),
    (w, S, doc (chainTree 5) (chainNames 5)),
    (w, S, doc (chainTree 5) (chainNames 4))]
