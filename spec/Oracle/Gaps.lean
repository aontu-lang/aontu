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

/-- The `gens` rows of the gaps, each with the JSON `outputW` writes. -/
def gapRows (tag : String) : IO Unit := writeRows tag leftRootCases
