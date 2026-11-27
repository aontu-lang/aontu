import Oracle.Base

/-! The oracle's cases for a call's data argument that is a path. -/

open Aontu
open Case

/-- Ruling 93: a path that is a call's data argument reads its target
where the target stands, and nothing is placed, so a relative path in
the target reads from there: the source of `each`, `pack` and `apply`,
a `filter`'s source, the bag `sum`, `least`, `greatest` and `sort` read,
the list `join` and `pick` read, a `match`'s scrutinee, a path nested in
a generator's source, and a call one level deeper. A `match`'s result and
a plain path reference stay copies placed where they stand (ruling 26).
Each document comes with the data both engines generate and with the
data the copy would give. -/
def dataArgCases : List (Decls × Val × Data) :=
  let src : Val := m [("w", int 1), ("a", m [("v", rel 2 ["w"])])]
  let at2 (d : Val) : Val := m [("src", src), ("c", m [("w", int 2), ("d", d)])]
  let atL (sw : Val) (a : List Val) (cw : Val) (d : Val) : Val :=
    m [("src", m [("w", sw), ("a", .list a none false)]), ("c", m [("w", cw), ("d", d)])]
  let cd (x : Data) : Data := .map [("c", .map [("d", x)])]
  let v (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .map [("v", .integer n h)]
  let pa : Val := .path [.key "src", .key "a"]
  let each : Val := at2 (.call .each [pa, .hole])
  let pack : Val := at2 (.call .pack [pa, .hole])
  let apply : Val := at2 (.call .apply [pa, .hole])
  let filt : Val := at2 (.filter pa (int 1))
  let sum : Val := at2 (.call .sum [pa])
  let least : Val := atL (int 1) [rel 2 ["w"], int 5] (int 2) (.call .least [pa])
  let great : Val := atL (int 9) [rel 2 ["w"], int 5] (int 2) (.call .greatest [pa])
  let sort : Val := atL (int 9) [rel 2 ["w"], int 5] (int 2) (.call .sort [pa])
  let join : Val := atL (str "p") [rel 2 ["w"], str "q"] (str "z") (.call .join [pa, str "-"])
  let pick : Val :=
    m [("src", m [("w", int 1), ("a", .list [m [("n", rel 3 ["w"])]] none false)]),
      ("c", m [("w", int 2), ("d", .call .pick [pa, str "n"])])]
  let scrut : Val := at2 (.select pa [(m [("v", int 1)], str "one")] (some (str "other")))
  let res : Val := at2 (.select (int 1) [(int 1, pa)] (some (str "no")))
  let nested : Val := at2 (.call .each [m [("x", pa)], .hole])
  let deep : Val := m [("src", src), ("c", m [("w", int 2), ("e", m [("d", .call .each [pa, .hole])])])]
  let ced (x : Data) : Data := .map [("c", .map [("e", .map [("d", x)])])]
  [([], each, cd (.list [j 1])), ([], each, cd (.list [j 2])),
    ([], pack, cd (v 1)), ([], pack, cd (v 2)),
    ([], apply, cd (v 1)), ([], apply, cd (v 2)),
    ([], filt, cd (v 1)), ([], filt, cd (v 2)),
    ([], sum, cd (j 1)), ([], sum, cd (j 2)),
    ([], least, cd (j 1)), ([], least, cd (j 2)),
    ([], great, cd (j 9)), ([], great, cd (j 5)),
    ([], sort, cd (.list [j 5, j 9])), ([], sort, cd (.list [j 2, j 5])),
    ([], join, cd (.str "p-q")), ([], join, cd (.str "z-q")),
    ([], pick, cd (.list [j 1])), ([], pick, cd (.list [j 2])),
    ([], scrut, cd (.str "one")), ([], scrut, cd (.str "other")),
    ([], res, cd (v 2)), ([], res, cd (v 1)),
    ([], nested, cd (.list [v 1])), ([], nested, cd (.list [v 2])),
    ([], deep, ced (.list [j 1])), ([], deep, ced (.list [j 2])),
    ([], at2 pa, cd (v 2)), ([], at2 pa, cd (v 1))]
