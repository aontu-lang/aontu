import Oracle.Custom

/-! The oracle's cases for the gaps the hand-written rows showed
(`ts/scripts/defcheck.cjs`), apart from `Gen` so that they build on
their own. -/

open Aontu
open Case

/-- Documents whose root is left out, which write `null` since nothing
holds the root (#1075): a map, a list and an empty map under `hide()`
or `type()`, and a hidden map met with another. -/
def leftRootCases : List (Decls × Val) :=
  [([], hide (m [("a", int 1)])),
    ([], type (m [("a", int 1)])),
    ([], hide (lst [int 1])),
    ([], hide (m [])),
    ([], .meet (hide (m [("a", int 1)])) (m [("b", int 2)]))]

/-- Data a call reads through a path, as the output has it (#1069): a
member or an element a mark of its own leaves out is no part of what
`each`, `filter`, `join`, `pack`, `sum` and `pick` read, at any depth,
where a plain copy of the same path writes it (decision 10); and a
source whose root is hidden is read whole. -/
def hiddenDataCases : List (Decls × Val) :=
  let src := m [("a", str "keep"), ("b", hide (str "SECRET"))]
  [([], m [("m", src), ("o", c .each [p ["m"], .meet .hole .hole])]),
    ([], m [("m", src), ("f", .filter (p ["m"]) .string)]),
    ([], m [("m", src), ("leak", c .join [p ["m"], str "-"])]),
    ([], m [("m", m [("a", int 1), ("b", hide (int 2))]), ("d", c .pack [p ["m"], m [("x", int 1)]])]),
    ([], m [("m", src), ("l", p ["m"])]),
    ([], m [("m", lst [int 1, hide (int 2), int 3]), ("s", c .sum [p ["m"]])]),
    ([], m [("m", m [("a", m [("x", int 1), ("y", hide (int 2))])]), ("o", c .each [p ["m"], .hole])]),
    ([], m [("m", hide (m [("a", int 1), ("b", int 2)])), ("o", c .each [p ["m"], .hole])]),
    ([], m [("m", m [("a", m [("o", int 1)]), ("b", hide (m [("o", int 2)]))]), ("r", c .pick [p ["m"], str "o"])])]

/-- The `gens` rows of the gaps, each with the JSON `outputW` writes. -/
def gapRows : IO Unit := do
  writeRows "gr" leftRootCases
  writeRows "gh" hiddenDataCases
