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

/-- Variants, while the definition's answer is read. -/
def emitDataProbe : List (Decls × Val × Data) :=
  let nd (k : String) : Val := .path [.node, .key k]
  let rule (b : List Val) : Val := mp [("match", mp [("name", .string)]), ("body", lst b)]
  let w : Decls := [("W", c .emit [.hole, rule [nd "name", c .emit [nd "kids", .alias "W"]]])]
  let t0 : Data := dm [("name", js "n0"), ("kids", jl [])]
  let one (out : Val) : Val := m [("items", tmpl (m [("tree", .listKind), ("out", out)]))]
  let doc (out : List Data) : Data := dm [("items", dm [("x", dm [("tree", jl [t0]), ("out", jl out)])])]
  [([], one (c .each [rel 1 ["tree"], .hole]), doc [t0]),
    ([], one (c .emit [rel 1 ["tree"], rule [nd "name"]]), doc [js "n0"]),
    (w, m [("items", m [("x", m [("tree", lst [m [("name", str "n0"), ("kids", lst [])]]), ("out", c .emit [rel 1 ["tree"], .alias "W"])])])], doc [js "n0"]),
    (w, m [("items", m [("x", m [("tree", .listKind), ("out", c .emit [rel 1 ["tree"], .alias "W"])])])], doc [js "n0"]),
    ([], m [("items", m [("x", m [("tree", .listKind), ("out", c .emit [rel 1 ["tree"], rule [nd "name"]])])])], doc [js "n0"])]

/-- Each step of `vetA` on one case, while the definition's answer is read. -/
def emitDataTrace (c : Decls × Val × Data) : IO Unit := do
  let (ds0, S0, j) := c
  let L := ds0.loaded S0
  let PS := L.1.preparedS L.2
  let PD := L.1.preparedD L.2 j
  let m : Mode := {}
  IO.println s!"unread {ds0.unread S0} resolves {PS.1.resolvesB PS.2}"
  let WS := PS.1.withPathsS PS.2
  IO.println s!"vet withPathsS {verdictName (vet m WS.1 WS.2 j)}"
  let WD := PD.1.withPaths PD.2 j
  IO.println s!"vet withPaths {verdictName (vet m WD.1 WD.2 j)}"
  IO.println s!"S' {PD.2.cell}"
  IO.println s!"WD {WD.2.cell}"
  IO.println s!"decls {WD.1.map fun d => (d.1, d.2.cell)}"
  IO.println s!"declares {WD.1.declaresB WD.2} guarded {WD.1.guardedB} ill {WD.1.illFormedR WD.2}"
  IO.println s!"ident {WD.1.identMisplaced WD.2} bodyIll {WD.1.bodyIll} miscounts {WD.2.miscounts} {WD.1.any (·.2.miscounts)} hole {WD.2.freeHole (fun n => WD.1.holeNames.contains n)} nf {((normaliseD WD.1 (WD.1.readR WD.2)).staged WD.1).illFormed}"
  IO.println s!"readR {(WD.1.readR WD.2).cell}"
  IO.println s!"read {(WD.1.read WD.2).cell}"
  IO.println s!"filled {(WD.1.read WD.2).filled.cell}"
  for d in WD.1 do
    IO.println s!"decl {d.1} recursive {WD.1.recursiveB d.1} norm {(normaliseD WD.1 (.alias d.1)).cell} members {((normaliseD WD.1 (.alias d.1)).armRead.members WD.1).isSome}"
    let e : Val := .call .each [.alias d.1, .hole]
    IO.println s!"  each {(resolveD WD.1 none (some []) e).cell}"
  let N := (normaliseD WD.1 (WD.1.readJ WD.2 j)).staged WD.1
  IO.println s!"fails {N.fails} refused {refusedAt WD.1 N}"
  IO.println s!"N {N.cell}"

def eachTrace : IO Unit := do
  let mm : Val := m [("name", str "n0")]
  let mk : Val := m [("name", str "n0"), ("kids", lst [])]
  for t in [lst [int 1], lst [mm], lst [mk], .meet .listKind (lst [int 1]), .meet .listKind (lst [mm]),
      .meet .listKind (lst [mk]), .meet .listKind (lst [m [("kids", lst [])]])] do
    IO.println s!"{t.cell} => {(resolveD [] none (some []) (.call .each [t, .hole])).cell} norm {(normaliseD [] t).cell} arm {(normaliseD [] t).armRead.cell} members {((normaliseD [] t).armRead.members []).isSome}"
