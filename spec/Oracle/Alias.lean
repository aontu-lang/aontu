import Oracle.Base

/-! The oracle's cases: Alias, split out of `Oracle.lean` so that each area builds on its own. -/

open Aontu
open Case

/-- The cases of decision 14 of the design note's §7: a `meta()` and a
`deprecate()` that judge as their values do, alone, under a key, in a
meet and on a declaration; an `ident()` on an alias's value, which a
reference reads without it; and an `ident()` anywhere else, an error,
inside another, inside a `meta()`, in a recursive body, or in a body no
reference reads. A rider on a kind keeps the kind's parent. -/
def riderCases : List (Decls × Val × Data) :=
  let note (k s : String) : Record := [(k, .str s)]
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
a meet, a rider, a spread and a selection. A list's element that carries
a mark of its own the copy leaves out, as the list does where it is
written (ruling 18), though a conflict in it is still the body's. -/
def markAliasCases : List (Decls × Val × Data) :=
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
    ([("T", .select (int 1) [(int 1, mp [("a", hide .integer)])] none)], T, .map []),
    ([("T", lst [hide (.lit (.str "h")), .lit (.str "k")])], T, .list [.str "k"]),
    ([("T", lst [hide (.lit (.str "h")), .lit (.str "k")])], T, .list [.str "h", .str "k"]),
    ([("T", lst [type .string, .lit (.str "k")])], T, .list [.str "k"]),
    ([("T", lst [type .string, .lit (.str "k")])], T, .list [.str "x", .str "k"]),
    ([("T", mp [("body", lst [hide (.lit (.str "h")), .lit (.str "k")])])], T, .map [("body", .list [.str "k"])]),
    ([("T", lst [hide (int 1), int 2])], T, .list []),
    ([("T", lst [hide (.meet (int 1) (int 2)), int 3])], T, .list [j 3])]

/-- The cases of the seal of decision 10 of the design note's §7: a
reference to a `type()` value reads it as a definition and its copy as
an instance that admits nothing the definition does not declare, at any
depth, once its declarations are met: through members, optional ones,
lists and a nested name, with a spread, beside a rider and another
mark, met with a name, declared twice, met at the reference and
through a selection, its default and one met with a map. The seal stops
at a kind, `any`, a disjunction, a preference and a list's spread, and
at a disjunction met with a map, a mark inside a body seals nothing,
and a recursive name, which both ports read unsealed, takes none. -/
def sealCases : List (Decls × Val × Data) :=
  let mp (fs : List (String × Val)) : Val := .map (fs.map fun f => (f.1, false, f.2)) none false
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
      .map [("a", .map [("b", j 1), ("c", j 2)])]),
    ([("T", type (.meet (.or [(0, mp [("x", int 1)]), (0, mp [("y", int 2)])]) (mp [("z", int 3)])))], T,
      .map [("x", j 1), ("z", j 3)]),
    ([("T", type (.meet (.or [(0, mp [("x", int 1)]), (0, mp [("y", int 2)])]) (mp [("z", int 3)])))], T,
      .map [("x", j 1), ("z", j 3), ("w", j 4)])]

theorem sealCases_checkable : ∀ c ∈ sealCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (aliasDoc c).1.CheckableA := by decide

theorem seal_verdict_exact : ∀ c ∈ sealCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 (aliasDoc c).1 (aliasDoc c).2 = v ↔ Vet m c.1 (aliasDoc c).1 (aliasDoc c).2 v :=
  fun c hc _ v => vet_iff (sealCases_checkable c hc).1
    (readR_checkableA (sealCases_checkable c hc).1 (sealCases_checkable c hc).2) v

/-- The cases of decision 44 of the design note's §7, `open(v)`: every
seal in `v` lifted, at every depth, on maps and lists, a spread's
template kept as written, as both ports keep it on a member the data
adds; a member written `open(v)` under a sealed map, which
the seal stops at; `open(v)` beside a sealed term, which lifts nothing
there; the seal a reference puts on a `type()` value's copy, lifted by
`open()` written around the reference, at every depth, and stopped by
`open()` written in the definition, at its top and at a member. -/
def openCases : List (Decls × Val × Data) :=
  let op (v : Val) : Val := .ride .opened v []
  let mp (fs : List (String × Val)) : Val := .map (fs.map fun f => (f.1, false, f.2)) none false
  let T : Val := .alias "T"
  let dxy : Data := .map [("x", j 1), ("y", j 2)]
  let dyz : Data := .map [("x", .map [("y", j 1), ("z", j 2)])]
  [([], .meet (op (cl [("x", cl [("y", int 1)])])) (mp [("x", mp [("z", int 2)])]), dyz),
    ([], .meet (cl [("x", op (mp [("y", int 1)]))]) (mp [("x", mp [("z", int 2)])]), dyz),
    ([], .meet (op (mp [("x", int 1)])) (.meet (cl [("x", int 1)]) (mp [("y", int 2)])), dxy),
    ([], op (cl [("x", int 1)]), dxy),
    ([], cl [("x", int 1)], dxy),
    ([], .meet (op (.list [int 1, int 2] none true)) (.list [int 1, int 2, int 3] none false),
      .list [j 1, j 2, j 3]),
    ([], op (.map [] (some (cl [("x", int 1)])) true), .map [("k", dxy)]),
    ([("T", type (mp [("x", int 1)]))], op T, dxy),
    ([("T", type (mp [("x", int 1)]))], T, dxy),
    ([("T", type (mp [("x", mp [("y", int 1)])]))], op T, dyz),
    ([("T", type (op (mp [("x", int 1)])))], T, dxy),
    ([("T", type (mp [("x", op (mp [("y", int 1)]))]))], T, dyz),
    ([("T", type (mp [("x", op (mp [("y", int 1)]))]))], T,
      .map [("x", .map [("y", j 1)]), ("w", j 1)])]

theorem openCases_checkable : ∀ c ∈ openCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (aliasDoc c).1.CheckableA := by decide

theorem open_verdict_exact : ∀ c ∈ openCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 (aliasDoc c).1 (aliasDoc c).2 = v ↔ Vet m c.1 (aliasDoc c).1 (aliasDoc c).2 v :=
  fun c hc _ v => vet_iff (openCases_checkable c hc).1
    (readR_checkableA (openCases_checkable c hc).1 (openCases_checkable c hc).2) v

/-- The cases of decision 44 of the design note's §7, a bare `open()`
and a bare `close()` as directives on their place: `close()` seals the
place once its terms have met, and every level beneath it, on maps and
lists, and nothing on a scalar or alone; `open()` lifts every seal at
its place, at every depth, and `close()` wins at its own level; the
places beneath read first, so a `close()` stops at an `open()` beneath
it and an `open()` lifts the seal a `close()` beneath it makes, as
`open(v)` does; a name's body read where it's used; a disjunction's arm,
and a spread's template, each a place of its own; the terms at a member
gathered from every map at its parent, and a member held open by a term
that's `open(v)` beside one that isn't; and a directive beside one
disjunction or lone preference, or beside two or more, across statements
too, which reaches every combination of their arms, each met with the
terms beside them; and a directive in a spread's template, at a member
the map declares, read there with the member's own terms, and at a
member the data adds, a list's element the same, two templates at one
place read together, and a member's directive reading the template
beside it. -/
def directiveCases : List (Decls × Val × Data) :=
  let bopen : Val := .ride .lifts .any []
  let bclose : Val := .ride .seals .any []
  let op (v : Val) : Val := .ride .opened v []
  let mp (fs : List (String × Val)) : Val := .map (fs.map fun f => (f.1, false, f.2)) none false
  let T : Val := .alias "T"
  let dx : Data := .map [("x", j 1)]
  let dxy : Data := .map [("x", j 1), ("y", j 2)]
  let dyz : Data := .map [("x", .map [("y", j 1), ("z", j 2)])]
  let xy : Val := .or [(0, mp [("x", int 1)]), (0, mp [("y", int 2)])]
  let xw : Val := .or [(0, mp [("x", int 1)]), (0, mp [("w", int 2)])]
  let zw : Val := .or [(0, mp [("z", int 1)]), (0, mp [("w", int 2)])]
  let sp (fs : List (String × Val)) (t : Val) : Val := .map (fs.map fun f => (f.1, false, f.2)) (some t) false
  let sl (xs : List Val) (t : Val) : Val := .list xs (some t) false
  [([], .meet bclose (mp [("x", int 1)]), dxy),
    ([], .meet bclose (mp [("x", int 1)]), dx),
    ([], .meet (.meet bclose (mp [("x", int 1)])) (mp [("y", int 2)]), dxy),
    ([], .meet bclose (mp [("x", mp [("y", int 1)])]), dyz),
    ([], .meet bclose (ls [int 1, int 2]), .list [j 1, j 2, j 3]),
    ([], .meet bclose (ls [ls [int 1]]), .list [.list [j 1, j 2]]),
    ([], .meet bclose (mp [("x", ls [int 1])]), .map [("x", .list [j 1, j 2])]),
    ([], .meet bclose (int 1), j 1),
    ([], bclose, dx),
    ([], bclose, j 1),
    ([], .meet bopen (cl [("x", int 1)]), dxy),
    ([], .meet bopen (.list [int 1] none true), .list [j 1, j 2]),
    ([], .meet bopen (mp [("x", cl [("y", int 1)])]), dyz),
    ([], .meet (mp [("x", bopen)]) (mp [("x", cl [("y", int 1)])]), dyz),
    ([], .meet bopen (.meet bclose (mp [("x", int 1)])), dxy),
    ([], .meet bopen (.meet bclose (mp [("x", mp [("y", int 1)])])), dyz),
    ([], .meet bclose (mp [("x", bopen)]), .map [("x", .map [("y", j 1)])]),
    ([], .meet bclose (mp [("x", bopen)]), .map [("x", .map [("y", j 1)]), ("z", j 2)]),
    ([], .meet bclose (mp [("x", .meet bopen (mp [("y", int 1)]))]), dyz),
    ([], .meet bopen (mp [("x", .meet bclose (mp [("y", int 1)]))]), dyz),
    ([], .meet bopen (mp [("x", .meet bclose (mp [("y", mp [("z", int 1)])]))]),
      .map [("x", .map [("y", .map [("z", j 1), ("w", j 2)])])]),
    ([], mp [("x", .meet bclose (mp [("y", int 1)]))], dyz),
    ([], op (mp [("x", .meet bclose (mp [("y", int 1)]))]), dyz),
    ([], .meet bclose (op (mp [("x", mp [("y", int 1)])])), dyz),
    ([], .meet bclose (op (mp [("x", mp [("y", int 1)])])), .map [("x", .map [("y", j 1)]), ("w", j 1)]),
    ([("T", mp [("x", int 1)])], .meet bclose T, dxy),
    ([("T", .meet bclose (mp [("x", int 1)]))], T, dxy),
    ([("T", mp [("x", mp [("y", int 1)])])], .meet bclose T, dyz),
    ([("T", type (mp [("x", .meet bopen (mp [("y", int 1)]))]))], T, dyz),
    ([], .or [(0, .meet bclose (mp [("x", int 1)])), (0, mp [("y", int 2)])],
      .map [("x", j 1), ("z", j 3), ("y", j 5)]),
    ([], .map [] (some (mp [("x", .meet bclose (mp [("y", int 1)]))])) false, .map [("m", dyz)]),
    ([], .map [] (some (.meet bclose (mp [("x", int 1)]))) false, .map [("m", dxy)]),
    ([], .map [] (some (.meet bopen (cl [("x", int 1)]))) false, .map [("m", dxy)]),
    ([], .list [] (some (.meet bclose (mp [("x", int 1)]))) false, .list [dxy]),
    ([], .meet (mp [("x", bclose)]) (.meet (mp [("x", mp [("y", int 1)])]) (mp [("x", mp [("z", int 2)])])), dyz),
    ([], .meet (mp [("x", bclose)]) (.meet (mp [("x", mp [("y", int 1)])]) (mp [("x", mp [("z", int 2)])])),
      .map [("x", .map [("y", j 1), ("z", j 2), ("w", j 3)])]),
    ([], .meet bclose (.meet (mp [("x", op (mp [("y", int 1)]))]) (mp [("x", mp [("y", int 1)])])), dyz),
    ([], .meet bclose (.meet (mp [("x", mp [("y", int 1)])]) (mp [("x", op (mp [("y", int 1)]))])), dyz),
    ([], .meet bclose (.or [(0, mp [("x", int 1)]), (0, mp [("y", int 2)])]), .map [("x", j 1), ("z", j 3)]),
    ([], .meet bclose (.or [(0, mp [("x", int 1)]), (0, mp [("y", int 2)])]), dx),
    ([], .meet bclose (.meet (.or [(0, mp [("x", int 1)]), (0, mp [("y", int 2)])]) (mp [("z", int 3)])),
      .map [("x", j 1), ("z", j 3)]),
    ([], .meet bclose (.meet (.or [(0, mp [("x", int 1)]), (0, mp [("y", int 2)])]) (mp [("z", int 3)])),
      .map [("x", j 1), ("z", j 3), ("w", j 4)]),
    ([], .meet (mp [("x", bclose)]) (.or [(0, mp [("x", mp [("y", int 1)])]), (0, mp [("x", mp [("z", int 2)])])]),
      .map [("x", .map [("y", j 1)])]),
    ([], .meet bclose (.meet (.pref 1 (mp [("x", int 1)])) (mp [("y", int 2)])), dxy),
    ([], .meet bclose (.meet (.pref 1 (mp [("x", int 1)])) (mp [("y", int 2)])),
      .map [("x", j 1), ("y", j 2), ("z", j 3)]),
    ([], .meet bclose (.pref 1 (mp [("x", int 1)])), .map [("x", j 1), ("z", j 3)]),
    ([], .meet bopen (.pref 1 (cl [("x", int 1)])), .map [("x", j 1), ("z", j 3)]),
    ([], .meet bclose (.or [(0, mp [("x", int 1)]), (1, mp [("y", int 2)])]), .map [("y", j 2), ("z", j 3)]),
    ([], .meet bopen (.or [(0, cl [("x", int 1)]), (0, mp [("y", int 2)])]), .map [("x", j 1), ("z", j 3)]),
    ([], .meet bclose (.or [(0, ls [int 1]), (0, ls [int 2, int 3])]), .list [j 2, j 3, j 4]),
    ([], .meet bclose (.or [(0, ls [int 1]), (0, ls [int 2, int 3])]), .list [j 2, j 3]),
    ([], .meet (.meet bclose xy) xw, .map [("x", j 1), ("w", j 2)]),
    ([], .meet (.meet bclose xy) xw, .map [("x", j 1), ("w", j 2), ("q", j 0)]),
    ([], .meet (.meet bclose xy) xw, dx),
    ([], .meet (.meet xy zw) bclose, .map [("y", j 2), ("z", j 1)]),
    ([], .meet (.meet (mp [("a", xy)]) (mp [("a", zw)])) (mp [("a", bclose)]),
      .map [("a", .map [("x", j 1), ("w", j 2)])]),
    ([], .meet (.meet (mp [("a", xy)]) (mp [("a", zw)])) (mp [("a", bclose)]),
      .map [("a", .map [("x", j 1), ("w", j 2), ("q", j 0)])]),
    ([], .meet (.meet bclose (.pref 1 (mp [("x", int 1)]))) (.or [(0, mp [("y", int 2)]), (0, mp [("w", int 3)])]),
      dxy),
    ([], .meet (.meet bclose (.pref 1 (mp [("x", int 1)]))) (.or [(0, mp [("y", int 2)]), (0, mp [("w", int 3)])]),
      .map [("x", j 1), ("y", j 2), ("q", j 0)]),
    ([], .meet (.or [(0, mp [("k", mp [("y", int 1)])]), (0, mp [("j", int 1)])])
        (mp [("k", .meet bclose (mp [("x", int 1)]))]),
      .map [("k", .map [("x", j 1), ("y", j 1)])]),
    ([], .meet (.or [(0, mp [("a", .meet bclose (mp [("x", int 1)])), ("b", int 1)]), (0, mp [("b", int 2)])])
        (.or [(0, mp [("a", mp [("y", int 1)]), ("c", int 1)]), (0, mp [("c", int 2)])]),
      .map [("a", .map [("x", j 1), ("y", j 1)]), ("b", j 1), ("c", j 1)]),
    ([], .meet (.meet bopen (.or [(0, cl [("x", int 1)]), (0, mp [("y", int 2)])])) zw,
      .map [("x", j 1), ("w", j 2)]),
    ([], .meet (.or [(0, mp [("k", cl [("x", int 1)])]), (0, mp [("j", int 1)])]) (mp [("k", bopen)]),
      .map [("k", .map [("x", j 1), ("z", j 3)])]),
    ([], sp [("m", mp [("y", int 1)])] (.meet bclose (mp [("x", int 1)])),
      .map [("m", .map [("x", j 1), ("y", j 1)])]),
    ([], sp [("m", mp [("y", int 1)])] (.meet bclose (mp [("x", int 1)])),
      .map [("m", .map [("x", j 1), ("y", j 1), ("z", j 1)])]),
    ([], sp [("m", mp [("y", int 1)])] (.meet bclose (mp [("x", int 1)])),
      .map [("m", .map [("x", j 1), ("y", j 1)]), ("n", .map [("x", j 1), ("y", j 1)])]),
    ([], sp [("m", .meet bclose (mp [("y", int 1)]))] (mp [("x", int 1)]),
      .map [("m", .map [("x", j 1), ("y", j 1)])]),
    ([], .meet (mp [("m", .meet bclose (mp [("y", int 1)]))]) (sp [] (mp [("x", int 1)])),
      .map [("m", .map [("x", j 1), ("y", j 1)])]),
    ([], .meet (sp [] bclose) (sp [] (mp [("x", int 1)])), .map [("n", .map [("x", j 1), ("y", j 1)])]),
    ([], sp [("m", cl [("y", int 1)])] bopen, .map [("m", .map [("y", j 1), ("z", j 1)])]),
    ([], sl [mp [("y", int 1)]] (.meet bclose (mp [("x", int 1)])), .list [.map [("x", j 1), ("y", j 1)]]),
    ([], sl [mp [("y", int 1)]] (.meet bclose (mp [("x", int 1)])),
      .list [.map [("x", j 1), ("y", j 1)], .map [("x", j 1), ("y", j 1)]])]

theorem directiveCases_checkable : ∀ c ∈ directiveCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (aliasDoc c).1.CheckableA := by decide

theorem directive_verdict_exact : ∀ c ∈ directiveCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 (aliasDoc c).1 (aliasDoc c).2 = v ↔ Vet m c.1 (aliasDoc c).1 (aliasDoc c).2 v :=
  fun c hc _ v => vet_iff (directiveCases_checkable c hc).1
    (readR_checkableA (directiveCases_checkable c hc).1 (directiveCases_checkable c hc).2) v

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

/-- The cases of a destructure over a term that isn't a load (P10): a
map written in place, a number, a name whose body is a map, a name taken
under another, and two names. None is a source, so the reading makes no
load of any and the call stays, which no verdict stands (`Val.illFormed`),
as both ports refuse it with `import_not_exported`. -/
def destrCases : List (Decls × Val × Data) :=
  let a1 : Val := m [("a", int 1)]
  let names (ns : List (String × String)) : List Val := ns.flatMap fun n => [.lit (.str n.1), .lit (.str n.2)]
  [([], .call .load (a1 :: names [("a", "a")]), j 1),
    ([], .call .load (int 1 :: names [("a", "a")]), j 1),
    ([("m", a1)], .call .load (.alias "m" :: names [("a", "a")]), j 1),
    ([], .call .load (a1 :: names [("b", "a")]), j 1),
    ([], .call .load (m [("a", int 1), ("b", int 2)] :: names [("a", "a"), ("b", "b")]), j 1)]

/-- The map the shorthand `{ %a %b }` writes: each name bound under its
own key. -/
def nameSet (ns : List String) : Val := .map (ns.map fun n => (n, false, .alias n)) none false

/-- A case of the shorthand: declarations, the names the set writes,
what stands between them, the key the set sits under inside `v` where
it's nested, and a document. -/
structure ShortCase where
  ds : Decls
  names : List String
  sep : String
  under : Option String
  data : Data

/-- The cases of the shorthand `{ %a %b }` (P10): names apart by spaces
and by commas, one name alone, and a set under a key, each against a
document that agrees with the names' bodies, one that doesn't, and one
that leaves a default to fill. -/
def shortCases : List ShortCase :=
  let ab : Decls := [("a", int 1), ("b", .lit (.str "x"))]
  [⟨ab, ["a", "b"], " ", none, .map [("a", j 1), ("b", .str "x")]⟩,
    ⟨ab, ["a", "b"], " ", none, .map [("a", j 2), ("b", .str "x")]⟩,
    ⟨[("a", .integer), ("b", .or [(1, .lit (.str "y")), (0, .string)])], ["a", "b"], " ", none,
      .map [("a", j 1)]⟩,
    ⟨ab, ["a", "b"], ", ", none, .map [("a", j 1), ("b", .str "x")]⟩,
    ⟨[("a", int 1)], ["a"], " ", none, .map [("a", j 1)]⟩,
    ⟨[("a", int 1)], ["a"], " ", some "x", .map [("x", .map [("a", j 1)])]⟩]

/-- A shorthand case as a case of the alias rows: its declarations, the
map the set stands for, under its key where it has one, and its
document. -/
def shortCase (c : ShortCase) : Decls × Val × Data :=
  (c.ds, (match c.under with
    | none => nameSet c.names
    | some k => .map [(k, false, nameSet c.names)] none false), c.data)

/-- The text a shorthand case writes for its schema: the set as the
shorthand writes it, its names apart by the case's separator, under its
key where it has one. -/
def shortText (c : ShortCase) : String :=
  let set := "{ " ++ c.sep.intercalate (c.names.map ("%" ++ ·)) ++ " }"
  match c.under with
  | none => set
  | some k => "{ " ++ k ++ ": " ++ set ++ " }"

set_option maxRecDepth 4096 in
theorem shortCases_checkable : ∀ c ∈ shortCases,
    (∀ d, d ∈ (shortCase c).1 → d.2.CheckableA) ∧ (aliasDoc (shortCase c)).1.CheckableA := by decide

/-- Each shorthand row's verdict is `Vet`'s, by `vet_iff`. -/
theorem short_verdict_exact : ∀ c ∈ shortCases, ∀ (m : Mode) (v : Verdict),
    vet m (shortCase c).1 (aliasDoc (shortCase c)).1 (aliasDoc (shortCase c)).2 = v ↔
      Vet m (shortCase c).1 (aliasDoc (shortCase c)).1 (aliasDoc (shortCase c)).2 v :=
  fun c hc _ v => vet_iff (shortCases_checkable c hc).1
    (readR_checkableA (shortCases_checkable c hc).1 (shortCases_checkable c hc).2) v

/-- The shorthand rows: each case's declarations, then its schema under
`v` as the shorthand writes it, against its document, in the three
modes. -/
def shortRows (tag : String) : IO Unit := do
  let mut i := 0
  for c in shortCases do
    let lines ← declLines c.ds
    let some dsrc := c.data.cell | throw (IO.userError "a document of the shorthand rows has no text")
    let src := "\\n".intercalate (lines ++ ["v: " ++ shortText c])
    let (S, D) := aliasDoc (shortCase c)
    i ← verdictLines tag i src ("v: " ++ dsrc) fun m => vet m c.ds S D
