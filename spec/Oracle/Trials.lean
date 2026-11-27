import Oracle.Base

/-! The oracle's cases: Trials, split out of `Oracle.lean` so that each area builds on its own. -/

open Aontu
open Case

/-! ## The eighth fragment: trials -/

/-- Documents with trial schemas inside values: each case its
declarations, a map as the schema, and a map as the document, run in
the three modes. `nof` with each kind of count, over kinds, literals,
maps, lists and names; beside literals, defaults and disjunctions;
nested; through a recursive name; `must`, with a conflicting branch
among them; and `when`, with and without an `else`, over scalars, maps
and lists, with `nil` and a conflict in each position, nested, in a
spread and a list, beside a literal, a default, a disjunction and
`nof`, and through a name, guarded and not; a trial beside a
disjunction whose preferred arm it refuses; `contains`, with each kind
of count, over lists and maps, scalars among them, with `nil` and a
conflict as the term, nested, beside a spread, `len`, a literal and a
disjunction, in a spread, and through a name; and `rest`, with no cover
and with covers of each field, over maps, lists and scalars, beside a
map, a literal, a default and a disjunction, in a spread, and through a
name. -/
def trialCases : List (Decls × Val × Data) :=
  let min (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .min (.num (.integer ⟨n, h⟩))
  let max (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .max (.num (.integer ⟨n, h⟩))
  let a (v : Val) : Val := m [("a", v)]
  let da (x : Data) : Data := .map [("a", x)]
  let nof (n : Val) (cs : List Val) : Val := .nof n cs
  let must (c : Val) : Val := .must c "m"
  let whn (c t : Val) (e : Option Val := none) : Val := .when c t e
  let cnt (c : Val) (n : Val := .min (.num (.integer (.of 1)))) : Val := .contains c n
  let rst (t : Val) (cs : List Cover := []) : Val := .rest t cs
  let ks (k : Val) : Cover := (none, some k, none)
  let T : Val := .alias "T"
  [([], a (nof (int 1) [.string, .number]), da (.str "x")),
    ([], a (nof (int 1) [.string, .number]), da (j 1)),
    ([], a (nof (int 1) [.string, .number]), da (.bool true)),
    ([], a (nof (int 0) [.integer]), da (j 1)),
    ([], a (nof (int 0) [.integer]), da (.str "s")),
    ([], a (nof (int 2) [.string, .string]), da (.str "x")),
    ([], a (nof (int 1) [.string, .string]), da (.str "x")),
    ([], a (nof (min 1) [.string, .number]), da (.bool true)),
    ([], a (nof (min 1) [.string, .number]), da (j 1)),
    ([], a (nof (max 0) [.string]), da (j 1)),
    ([], a (nof (max 0) [.string]), da (.str "x")),
    ([], a (nof (.meet (min 1) (max 1)) [.string, .number]), da (.str "x")),
    ([], a (nof (int 1) [.any]), da (.str "x")),
    ([], a (nof (int 1) [Val.void, .string]), da (.str "x")),
    ([], a (nof (int 0) [Val.void]), da (.str "x")),
    ([], a (nof (int 1) [.meet (int 1) (int 2), .string]), da (.str "x")),
    ([], a (nof (int 1) [.meet (int 1) (int 2)]), da (j 1)),
    ([], a (nof (int (-1)) [.string]), da (.str "x")),
    ([], a (nof (.lit (.num (.float (.dyadic 3 (-1))))) [.string]), da (.str "x")),
    ([], a (nof .string [.string]), da (.str "x")),
    ([], a (nof (min 1) [m [("x", int 1)], m [("y", int 2)]]), da (.map [("x", j 1)])),
    ([], a (nof (min 1) [m [("x", int 1)], m [("y", int 2)]]), da (.map [("z", j 1)])),
    ([], a (nof (int 1) [mo [("x", true, .number)], mo [("y", true, .string)]]), da (.map [("x", j 1)])),
    ([], a (nof (int 2) [mo [("x", true, .number)], mo [("y", true, .string)]]), da (.map [("x", j 1)])),
    ([], a (nof (int 1) [m [("x", .number)], m [("y", .string)]]), da (.map [("x", j 1)])),
    ([], a (nof (int 0) [m [("b", nof (int 0) [.integer])]]), da (.map [("b", j 1)])),
    ([], a (nof (int 0) [m [("b", nof (int 0) [.integer])]]), da (.map [("b", .str "s")])),
    ([], a (.meet .integer (nof (int 0) [int 5])), da (j 5)),
    ([], a (.meet .integer (nof (int 0) [int 5])), da (j 6)),
    ([], a (.meet (nof (int 1) [.string, .number]) (str "x")), .map []),
    ([], a (.meet (nof (int 1) [int 1, int 2]) (int 3)), .map []),
    ([], a (.meet (nof (int 1) [int 1, int 2]) (int 3)), da (j 3)),
    ([], a (.meet (nof (int 0) [.string]) (int 1)), .map []),
    ([], a (.meet (nof (int 0) [.string]) (str "x")), .map []),
    ([], a (.meet (nof (int 1) [m [("x", int 1)]]) (m [("x", int 1)])), .map []),
    ([], a (.meet (nof (int 0) [m [("x", int 1)]]) (m [("x", int 1)])), .map []),
    ([], a (.meet (nof (int 1) [mo [("x", true, int 1)]]) (m [("y", int 2)])), da (.map [("y", j 2)])),
    ([], a (.meet (nof (int 1) [m [("x", int 1)]]) (m [("x", .integer)])), da (.map [("x", j 2)])),
    ([], a (.meet (nof (int 1) [m [("x", int 1)]]) (m [("x", .integer)])), da (.map [("x", j 1)])),
    ([], a (.meet (nof (int 1) [int 1, int 2]) (.pref 1 (int 3))), .map []),
    ([], a (.meet (nof (int 1) [int 1, int 2]) (.pref 1 (int 1))), da (j 5)),
    ([], a (.meet (nof (int 1) [int 1, int 2]) (.pref 1 (int 1))), .map []),
    ([], a (.meet (nof (int 1) [int 1, int 2]) (.or [(0, int 1), (0, int 2)])), .map []),
    ([], a (.meet (nof (int 1) [int 1, int 2]) (.or [(0, int 1), (0, int 2)])), da (j 1)),
    ([], a (.pref 1 (nof (int 1) [.string])), da (j 1)),
    ([], a (.list [nof (int 1) [.string]] none false), da (.list [.str "x"])),
    ([], a (.list [nof (int 1) [.string]] none false), da (.list [j 1])),
    ([], a (.map [] (some (nof (int 1) [.string])) false), da (.map [("x", .str "y")])),
    ([], a (.map [] (some (nof (int 1) [.string])) false), da (.map [("x", j 1)])),
    ([], a (.or [(0, nof (int 1) [.string, .number]), (0, .boolean)]), da (.bool true)),
    ([("p", .string), ("q", .number)], a (nof (int 1) [.alias "p", .alias "q"]), da (.str "x")),
    ([("T", mo [("a", true, nof (int 0) [T])])], m [("t", T)], .map [("t", .map [("a", .map [])])]),
    ([("T", mo [("a", true, nof (int 0) [T])])], m [("t", T)],
      .map [("t", .map [("a", .map [("a", .map [])])])]),
    ([("T", nof (int 0) [T])], m [("t", T)], .map [("t", j 1)]),
    ([("T", nof (int 1) [T])], m [("t", T)], .map [("t", j 1)]),
    ([("T", must T)], m [("t", T)], .map [("t", j 1)]),
    ([("T", nof (min 1) [T, .string])], m [("t", T)], .map [("t", .str "x")]),
    ([], a (must (min 3)), da (j 2)),
    ([], a (must (min 3)), da (j 3)),
    ([], a (must (m [("x", int 1)])), da (.map [])),
    ([], a (.meet (must (mo [("x", true, .number)])) (m [])), .map []),
    ([], a (must (.meet (int 1) (int 2))), da (j 1)),
    ([], a (must Val.void), da (j 1)),
    ([], a (must (.meet (min 3) (max 1))), da (j 2)),
    ([], a (nof (int 1) [must .string, .number]), da (.str "x")),
    ([], a (whn .string (str "a")), da (.str "a")),
    ([], a (whn .string (str "a")), da (.str "b")),
    ([], a (whn .string (str "a")), da (j 5)),
    ([], a (whn .string (str "a") (some (min 0))), da (j 5)),
    ([], a (whn .string (str "a") (some (min 0))), da (j (-1))),
    ([], a (whn Val.void .string (some .number)), da (j 5)),
    ([], a (whn .any .number), da (.str "s")),
    ([], a (whn .string Val.void), da (.str "s")),
    ([], a (whn .string Val.void), da (j 1)),
    ([], a (whn (m [("k", .any)]) (m [("n", .any)])), da (.map [("k", j 1), ("n", j 2)])),
    ([], a (whn (m [("k", .any)]) (m [("n", .any)])), da (.map [("k", j 1)])),
    ([], a (whn (m [("k", .any)]) (m [("n", .any)])), da (.map [])),
    ([], a (whn (m [("k", .any)]) (m [("n", .number)])), da (.map [("k", j 1), ("n", .str "s")])),
    ([], a (whn (mo [("x", true, .number)]) (mo [("x", true, max 5)])), da (.map [("x", j 3)])),
    ([], a (whn (mo [("x", true, .number)]) (mo [("x", true, max 5)])), da (.map [("x", j 7)])),
    ([], a (whn (.list [] (some .number) false) (.len (max 2))), da (.list [j 1, j 2])),
    ([], a (whn (.list [] (some .number) false) (.len (max 2))), da (.list [j 1, j 2, j 3])),
    ([], a (.map [] (some (whn .string (str "x"))) false), da (.map [("p", .str "x"), ("q", j 2)])),
    ([], a (.map [] (some (whn .string (str "x"))) false), da (.map [("p", .str "y")])),
    ([], a (whn (m [("b", .string)]) (m [("b", whn .string (str "s"))])), da (.map [("b", .str "s")])),
    ([], a (whn (m [("b", .string)]) (m [("b", whn .string (str "s"))])), da (.map [("b", .str "t")])),
    ([], a (.meet (nof (int 1) [.string, .number]) (whn .string (str "a"))), da (.str "a")),
    ([], a (.meet (nof (int 1) [.string, .number]) (whn .string (str "a"))), da (.str "b")),
    ([], a (.meet (whn .string (str "a")) (str "a")), .map []),
    ([], a (.meet (whn .string (str "a")) (str "b")), .map []),
    ([], a (.meet (whn .string (str "a")) (.pref 1 (str "b"))), .map []),
    ([], a (.meet (whn .string (str "a")) (.pref 1 (str "a"))), .map []),
    ([], a (.or [(0, whn .string (str "a")), (0, .number)]), da (.str "b")),
    ([], a (.or [(0, whn .string (str "a")), (0, .number)]), da (.str "a")),
    ([("T", mo [("a", true, whn T (int 1))])], m [("t", T)], .map [("t", .map [("a", j 1)])]),
    ([("T", mo [("a", true, whn T (int 1))])], m [("t", T)], .map [("t", .map [("a", .map [])])]),
    ([("T", whn T (int 1))], m [("t", T)], .map [("t", j 1)]),
    ([("T", whn .string T)], m [("t", T)], .map [("t", j 1)]),
    ([("T", whn .string (int 1) (some T))], m [("t", T)], .map [("t", j 1)]),
    ([], a (whn .string (str "a") (some Val.void)), da (j 5)),
    ([], a (whn (.meet (int 1) (int 2)) .string (some .number)), da (j 5)),
    ([], a (whn .string (.meet (int 1) (int 2))), da (.str "s")),
    ([], a (whn (nof (int 0) [.string]) (int 1)), da (j 1)),
    ([], a (whn (nof (int 0) [.string]) (int 1)), da (j 2)),
    ([], a (whn (nof (int 0) [.string]) (int 1)), da (.str "s")),
    ([], a (whn .string (must (str "a"))), da (.str "b")),
    ([], a (.meet (whn .string (str "a")) (whn .number (int 1))), da (j 2)),
    ([], a (.list [whn .string (str "a")] none false), da (.list [.str "b"])),
    ([], a (whn .string (str "a")), .map []),
    ([], a (.meet (whn (m [("k", .any)]) (m [("n", .any)])) (m [("k", int 1)])), .map []),
    ([], a (.meet (whn (m [("k", .any)]) (m [("n", .any)])) (m [("k", int 1), ("n", int 2)])), .map []),
    ([], a (whn (m [("k", .any)]) (m [("n", .pref 1 (int 2))])), da (.map [("k", j 1)])),
    ([], a (whn (whn .string (str "a")) (int 1)), da (.str "a")),
    ([], a (whn (whn .string (str "a")) (int 1)), da (.str "b")),
    ([], a (whn (min 3) (max 5)), da (j 6)),
    ([], a (whn (min 3) (max 5)), da (j 1)),
    ([], a (.meet (nof (int 1) [int 1, int 2]) (.or [(1, int 3), (0, int 2)])), .map []),
    ([], a (.meet (whn .string (str "a")) (.or [(1, str "b"), (0, str "a")])), .map []),
    ([], a (cnt .number), da (.list [j 1, .str "x"])),
    ([], a (cnt .number), da (.list [.str "x"])),
    ([], a (cnt .number), da (.list [])),
    ([], a (cnt .number), da (j 5)),
    ([], a (cnt .number), da (.str "abc")),
    ([], a (cnt .number), da (.map [("x", j 1), ("y", .str "s")])),
    ([], a (cnt .number), da (.map [("x", .str "s")])),
    ([], a (cnt .number (int 2)), da (.list [j 1, j 2, .str "x"])),
    ([], a (cnt .number (int 2)), da (.list [j 1, .str "x"])),
    ([], a (cnt .number (.meet (min 2) (max 3))), da (.list [j 1, j 2, j 3, .str "x"])),
    ([], a (cnt .number (.meet (min 2) (max 3))), da (.list [j 1, j 2, j 3, j 4])),
    ([], a (cnt .number (int 0)), da (.list [.str "x"])),
    ([], a (cnt .number (int 0)), da (.list [j 1])),
    ([], a (cnt .number (max 1)), da (.list [.str "x"])),
    ([], a (cnt .number (max 1)), da (.list [j 1, j 2])),
    ([], a (cnt Val.void), da (.list [j 1])),
    ([], a (cnt Val.void (int 0)), da (.list [j 1])),
    ([], a (cnt (.meet (int 1) (int 2))), da (.list [j 1])),
    ([], a (cnt (.meet (int 1) (int 2)) (int 0)), da (.list [j 1])),
    ([], a (cnt (.list [int 1] none false)), da (.list [.list [j 1], j 2])),
    ([], a (cnt (m [("k", .number)])), da (.list [.map [("k", j 1)], .map [("j", j 2)]])),
    ([], a (cnt (mo [("k", true, .number)])), da (.list [.map [("j", j 2)]])),
    ([], a (cnt (m [("k", .or [(1, int 1), (0, .number)])])), da (.list [.map []])),
    ([], a (cnt (.meet (.list [] (some .number) false) (cnt (min 5)))), da (.list [.list [j 1], .list [j 6]])),
    ([], a (cnt (.meet (.list [] (some .number) false) (cnt (min 5)))), da (.list [.list [j 1], .list [j 2]])),
    ([], a (.meet (cnt .number) (cnt .string)), da (.list [j 1, .str "x"])),
    ([], a (.meet (cnt .number) (cnt .string)), da (.list [j 1])),
    ([], a (.meet (.list [] (some .number) false) (cnt (min 5))), da (.list [j 1, j 7])),
    ([], a (.meet (.list [] (some .number) false) (cnt (min 5))), da (.list [j 1, j 2])),
    ([], a (.meet (.len (max 3)) (cnt .string)), da (.list [j 1, .str "s"])),
    ([], a (.map [] (some (cnt .number)) false), da (.map [("p", .list [j 1]), ("q", .list [.str "x", j 2])])),
    ([], a (.map [] (some (cnt .number)) false), da (.map [("p", .list [j 1]), ("q", .list [.str "x"])])),
    ([], a (.meet (cnt .number) (.list [int 1, str "x"] none false)), .map []),
    ([], a (.meet (cnt .number) (.list [str "x"] none false)), .map []),
    ([], a (.meet (cnt .number) (int 5)), .map []),
    ([], a (.or [(0, cnt .number), (0, .string)]), da (.str "s")),
    ([], a (.or [(0, cnt .number), (0, .string)]), da (.list [.str "x"])),
    ([], a (cnt .number), .map []),
    ([], a (cnt .number (int (-1))), da (.list [j 1])),
    ([], a (cnt .number (.lit (.num (.float (.dyadic 3 (-1)))))), da (.list [j 1])),
    ([], a (cnt .number (str "x")), da (.list [j 1])),
    ([], a (cnt .number .string), da (.list [j 1])),
    ([], a (cnt (nof (int 0) [.number])), da (.list [j 1, .str "x"])),
    ([], a (cnt (whn .number (max 1))), da (.list [j 2, .str "x"])),
    ([], a (cnt (whn .number (max 1))), da (.list [j 2])),
    ([("T", cnt T)], m [("t", T)], .map [("t", .list [.list []])]),
    ([("T", cnt T)], m [("t", T)], .map [("t", .list [.list [.list []]])]),
    ([("T", cnt T (int 0))], m [("t", T)], .map [("t", .list [])]),
    ([("T", cnt T (int 0))], m [("t", T)], .map [("t", .list [j 1])]),
    ([("T", cnt .any T)], m [("t", T)], .map [("t", .list [j 1])]),
    ([], a (cnt .number (max 0)), da (.list [.str "x"])),
    ([], a (.meet (cnt .string) (m [("x", str "a"), ("y", int 1)])), .map []),
    ([], a (.meet (cnt .number) (m [("x", str "a")])), .map []),
    ([], a (rst Val.void), da (.map [])),
    ([], a (rst Val.void), da (.map [("b", j 2)])),
    ([], a (rst Val.void), da (j 5)),
    ([], a (rst Val.void), da (.list [])),
    ([], a (rst Val.void), da (.list [j 1])),
    ([], a (rst .number), da (.map [("b", j 2)])),
    ([], a (rst .number), da (.map [("b", .str "x")])),
    ([], a (rst Val.void [ks (str "a")]), da (.map [("a", j 1)])),
    ([], a (rst Val.void [ks (str "a")]), da (.map [("a", j 1), ("b", j 2)])),
    ([], a (rst .number [ks (str "a")]), da (.map [("a", .str "x"), ("b", j 2)])),
    ([], a (rst .string [ks (str "a")]), da (.map [("a", .str "x"), ("b", j 2)])),
    ([], a (rst Val.void [(none, none, some .number)]), da (.map [("p", j 1), ("q", j 2)])),
    ([], a (rst Val.void [(none, none, some .number)]), da (.map [("p", j 1), ("q", .str "x")])),
    ([], a (rst Val.void [(some (.meet (int 1) (int 2)), some .any, none)]), da (.map [("b", j 1)])),
    ([], a (.meet (rst Val.void [ks (str "a")]) (rst Val.void [ks (str "b")])), da (.map [("a", j 1)])),
    ([], a (rst Val.void [(some (m [("a", int 1)]), some .any, none)]), da (.map [("a", j 1), ("z", .bool true)])),
    ([], a (rst Val.void [(some (m [("a", int 1)]), some .any, none)]), da (.map [("a", j 2)])),
    ([], a (rst .number [(some (m [("a", int 1)]), some .any, none)]), da (.map [("a", j 2)])),
    ([], a (rst Val.void [ks (str "a"), (some (m [("b", int 1)]), some (str "b"), none)]),
      da (.map [("a", j 1), ("b", j 1)])),
    ([], a (rst Val.void [ks (str "a"), (some (m [("b", int 1)]), some (str "b"), none)]),
      da (.map [("a", j 1), ("b", j 2)])),
    ([], a (rst Val.void [ks (.or [(0, str "0"), (0, str "1")])]), da (.list [.str "p", .str "q"])),
    ([], a (rst Val.void [ks (str "0")]), da (.list [.str "p", .str "q"])),
    ([], a (rst Val.void [(none, none, some .number)]), da (.list [j 1, j 2])),
    ([], a (rst Val.void [(none, none, some .number)]), da (.list [j 1, .str "x"])),
    ([], a (rst .string [ks (str "0")]), da (.list [j 1, .str "x"])),
    ([], a (.meet (rst Val.void [ks (str "a")]) (mo [("a", false, int 1), ("b", true, .number)])), da (.map [("a", j 1)])),
    ([], a (.meet (rst Val.void [ks (str "a")]) (mo [("a", false, int 1), ("b", true, .number)])),
      da (.map [("a", j 1), ("b", j 2)])),
    ([], a (.map [] (some (rst Val.void [ks (str "n")])) false), da (.map [("x", .map [("n", j 1)]), ("y", .map [("n", j 2)])])),
    ([], a (.map [] (some (rst Val.void [ks (str "n")])) false), da (.map [("x", .map [("n", j 1)]), ("y", .map [("m", j 2)])])),
    ([], a (.meet (rst Val.void [ks (str "a")]) (m [("a", int 1)])), .map []),
    ([], a (.meet (rst Val.void [ks (str "a")]) (m [("a", int 1), ("b", int 2)])), .map []),
    ([], a (.meet (rst Val.void) (m [("b", int 2)])), .map []),
    ([], a (.meet (rst Val.void) (int 5)), .map []),
    ([], a (.meet (rst Val.void) (m [("b", .pref 1 (int 2))])), .map []),
    ([], a (.meet (rst Val.void [ks (str "b")]) (m [("b", .pref 1 (int 2))])), .map []),
    ([], a (.or [(0, rst Val.void [ks (str "a")]), (0, .number)]), da (.map [("b", j 1)])),
    ([], a (.or [(0, rst Val.void [ks (str "a")]), (0, .number)]), da (j 1)),
    ([], a (rst Val.void), .map []),
    ([], a (rst Val.void [(some (m [("k", str "x")]), some .any, none)]), da (.map [("k", .str "x"), ("z", j 1)])),
    ([], a (rst Val.void [(some (m [("k", str "x")]), some .any, none)]), da (.map [("k", .str "y"), ("z", j 1)])),
    ([], a (rst Val.void [(none, some (str "a"), some .number)]), da (.map [("a", .str "x"), ("b", j 1)])),
    ([], a (rst Val.void [(none, some (str "a"), some .number)]), da (.map [("a", .str "x"), ("b", .str "y")])),
    ([], a (rst Val.void [(some (m [("a", .any)]), some (str "a"), some .number)]), da (.map [("a", .str "x"), ("b", j 1)])),
    ([], a (rst Val.void [(some (m [("a", .any)]), some (str "a"), some .number)]), da (.map [("b", j 1)])),
    ([], a (rst Val.void [(some .any, none, none)]), da (.map [("b", j 1)])),
    ([], a (rst Val.void [ks Val.void]), da (.map [("b", j 1)])),
    ([], a (rst Val.void [(none, none, some Val.void)]), da (.map [("b", j 1)])),
    ([], a (rst (nof (int 0) [.string]) [ks (str "a")]), da (.map [("a", .str "x"), ("b", j 1)])),
    ([], a (rst (nof (int 0) [.string]) [ks (str "a")]), da (.map [("a", .str "x"), ("b", .str "y")])),
    ([], a (.meet (rst Val.void [ks (str "a")]) (rst .number)), da (.map [("a", .str "x")])),
    ([], a (.meet (rst Val.void [ks (str "a")]) (rst .number)), da (.map [("a", j 1)])),
    ([("T", mo [("a", true, rst Val.void [ks (str "b")])])], m [("t", T)], .map [("t", .map [("a", .map [("b", j 1)])])]),
    ([("T", rst Val.void [(none, none, some T)])], m [("t", T)], .map [("t", .map [("b", j 5)])]),
    ([("T", rst T)], m [("t", T)], .map [("t", .map [("b", j 5)])]),
    ([("T", rst T)], m [("t", T)], .map [("t", .map [("b", .map [])])]),
    ([("T", rst Val.void [ks T])], m [("t", T)], .map [("t", .map [("b", j 5)])]),
    ([], a (.meet (rst Val.void [ks (str "a")]) (m [("a", m [("b", int 1)])])), da (.map [("a", .map [("b", j 1)])])),
    ([], a (rst Val.void [(none, none, some (m [("x", int 1)]))]), da (.map [("p", .map [("x", j 1)]), ("q", .map [("x", j 2)])])),
    ([], a (rst Val.void [(none, none, some (mo [("x", true, .or [(1, int 1), (0, .number)])]))]), da (.map [("p", .map [])]))]

set_option maxRecDepth 8192 in
/-- Every case's bodies and schema hold no path, no pattern and no
format, so `vet` is `Vet` on it, by `vet_iff`. -/
theorem trialCases_checkable : ∀ c ∈ trialCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem trial_verdict_exact : ∀ c ∈ trialCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 c.2.1 c.2.2 = v ↔ Vet m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vet_iff (trialCases_checkable c hc).1
    (readR_checkableA (trialCases_checkable c hc).1 (trialCases_checkable c hc).2) v

/-- Documents with `match` and `filter` inside values, each scrutinee
and source a literal: the first arm, a later arm, the default, no arm
and no default, a result that generates nothing, a result that is a map,
a selection beside a literal, a kind and a disjunction, inside a map and
a list, and nested; and `filter` over a list and a map,
with a kind, a bound and a conflict as the condition, over an empty
container and over a scalar, and beside a literal. -/
def selectCases : List (Decls × Val × Data) :=
  let min (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .min (.num (.integer ⟨n, h⟩))
  let sel (s : Val) (arms : List (Val × Val)) (d : Option Val := none) : Val := .select s arms d
  let flt (s c : Val) : Val := .filter s c
  let z (v : Val) : Val := m [("z", v)]
  let dz (x : Data) : Data := .map [("z", x)]
  let dd (x : Data) : Data := .map [("d", x)]
  let lst (vs : List Val) : Val := .list vs none false
  [([], z (sel (int 1) [(.integer, str "small"), (.string, str "big")]), dz (.str "small")),
    ([], z (sel (int 1) [(.integer, str "small"), (.string, str "big")]), dz (.str "big")),
    ([], z (sel (str "x") [(.integer, str "small"), (.string, str "big")]), dz (.str "big")),
    ([], z (sel (int 1) [(.string, str "a")]), dz (.str "a")),
    ([], z (sel (int 1) [(.string, str "a")]), .map []),
    ([], z (sel (int 1) [(min 0, str "ok"), (.integer, str "no")]), dz (.str "ok")),
    ([], z (sel (m [("a", int 1)]) [(m [("a", .integer)], str "yes")] (some (str "other"))), dz (.str "yes")),
    ([], z (sel (m [("a", int 1)]) [(m [("b", .integer)], str "yes")] (some (str "other"))), dz (.str "other")),
    ([], z (sel (int 1) [(.integer, .integer)]), dz (j 5)),
    ([], z (sel (int 1) [(.integer, .integer)]), dz (.str "s")),
    ([], z (sel (int 1) [(.integer, .integer)]), .map []),
    ([], z (sel (int 1) [(.integer, m [("k", int 1)])]), dz (.map [("k", j 1)])),
    ([], z (sel (int 1) [(.integer, m [("k", int 1)])]), dz (.map [])),
    ([], z (sel (int 1) [(.integer, m [("k", int 1)])]), .map []),
    ([], z (.meet (sel (int 1) [(.integer, int 5)]) (int 5)), .map []),
    ([], z (.meet (sel (int 1) [(.integer, int 5)]) (int 6)), .map []),
    ([], z (.meet (sel (int 1) [(.integer, int 5)]) .integer), .map []),
    ([], z (.or [(0, sel (int 1) [(.integer, int 5)]), (0, .string)]), dz (.str "s")),
    ([], z (.or [(0, sel (int 1) [(.integer, int 5)]), (0, .string)]), dz (j 5)),
    ([], z (m [("k", sel (int 1) [(.integer, int 5)])]), dz (.map [("k", j 5)])),
    ([], z (m [("k", sel (int 1) [(.integer, int 5)])]), dz (.map [])),
    ([], z (lst [sel (int 1) [(.integer, int 5)]]), dz (.list [j 5])),
    ([], z (sel (sel (int 1) [(.integer, str "a")]) [(str "a", int 1)] (some (int 2))), dz (j 1)),
    ([], m [("d", flt (lst [int 1, int 2, int 3, str "x"]) .integer)], dd (.list [j 1, j 2, j 3])),
    ([], m [("d", flt (lst [int 1, int 2, int 3, str "x"]) .integer)], dd (.list [j 1, j 2])),
    ([], m [("d", flt (lst [int 1, int 2, int 3, str "x"]) .integer)], .map []),
    ([], m [("d", flt (m [("a", int 1), ("b", str "x"), ("c", int 2)]) .integer)], dd (.map [("a", j 1), ("c", j 2)])),
    ([], m [("d", flt (m [("a", int 1), ("b", str "x"), ("c", int 2)]) .integer)], .map []),
    ([], m [("d", flt (lst [int 1, int 2, int 3]) (min 2))], dd (.list [j 2, j 3])),
    ([], m [("d", flt (lst []) .integer)], dd (.list [])),
    ([], m [("d", flt (lst [int 1, int 2]) .string)], dd (.list [])),
    ([], m [("d", flt (lst [int 1, int 2]) (.meet (int 1) (int 2)))], dd (.list [])),
    ([], m [("d", flt (int 1) .integer)], dd (j 1)),
    ([], m [("d", flt (int 1) .integer)], .map []),
    ([], m [("d", .meet (flt (lst [int 1, int 2]) .integer) (lst [int 1, int 2]))], .map []),
    ([], m [("d", .meet (flt (lst [int 1, int 2]) .integer) (lst [int 1]))], .map [])]

set_option maxRecDepth 8192 in
/-- Every case's bodies hold no path, no pattern and no format, and its
schema, read with its selections made, holds none and no selection a
value has not settled, so `vet` is `Vet` on it, by `vet_iff`. -/
theorem selectCases_checkable : ∀ c ∈ selectCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (c.1.readR c.2.1).CheckableA := by decide

theorem select_verdict_exact : ∀ c ∈ selectCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 c.2.1 c.2.2 = v ↔ Vet m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vet_iff (selectCases_checkable c hc).1 (selectCases_checkable c hc).2 v

/-- A `match` over the hole in a generator's template: the generator
binds the hole, so the match is made once for each member, on the
member. A list by `each` and a map by `pack`, which reads each string
of its list as a key, against no data, the value generated and one a
member's arm refuses; a pattern that is a
map and one that is a kind; the match as a member of a map template; no
default, where every member takes an arm and where one takes none,
which is the schema's error; the hole as the default too, which is the
member; and a `filter`'s condition, whose hole the `filter` binds. -/
def holeMatchCases : List (Decls × Val × Data) :=
  let one : Val := .lit (.str "one")
  let other : Val := .lit (.str "other")
  let mt : Val := .select .hole [(int 1, one)] (some other)
  let byKey : Val := .select .hole [(.lit (.str "a"), one)] (some other)
  let each (d t : Val) : Val := .call .each [d, t]
  let dxs (xs : List Data) : Data := .map [("xs", .list xs)]
  [([], m [("xs", each (lst [int 1, int 2, int 3])
      (.select .hole [(int 1, one), (int 2, .lit (.str "two"))] (some other)))], .map []),
    ([], m [("xs", each (lst [int 1, int 2]) mt)], dxs [.str "one", .str "other"]),
    ([], m [("xs", each (lst [int 1, int 2]) mt)], dxs [.str "one", .str "one"]),
    ([], m [("m", .call .pack [lst [.lit (.str "a"), .lit (.str "b")], byKey])], .map []),
    ([], m [("m", .call .pack [lst [.lit (.str "a"), .lit (.str "b")], byKey])],
      .map [("m", .map [("a", .str "one"), ("b", .str "one")])]),
    ([], m [("xs", each (lst [m [("k", .lit (.str "a"))], m [("k", .lit (.str "b"))]])
      (.select .hole [(m [("k", .lit (.str "a"))], m [("r", int 1)])] (some (m [("r", int 2)]))))], .map []),
    ([], m [("xs", each (lst [int 1, .lit (.str "a")])
      (.select .hole [(.number, .lit (.str "n")), (.string, .lit (.str "s"))] none))], .map []),
    ([], m [("xs", each (lst [int 1, int 2]) (m [("v", mt)]))], .map []),
    ([], m [("xs", each (lst [int 1, int 1]) (.select .hole [(int 1, one)] none))], .map []),
    ([], m [("xs", each (lst [int 1, int 2]) (.select .hole [(int 1, one)] none))], .map []),
    ([], m [("xs", each (lst [int 1, int 2]) (.select .hole [(int 1, one)] (some .hole)))], .map []),
    ([], m [("xs", .filter (lst [int 1, int 2, int 3])
      (.select .hole [(int 1, .integer)] (some (.lit (.bool false)))))], .map [])]

set_option maxRecDepth 8192 in
/-- Every case's schema, read with its generator's instances made and
their selections taken, holds no hole, no path, no pattern and no
format, so `vet` is `Vet` on it, by `vet_iff`. -/
theorem holeMatchCases_checkable : ∀ c ∈ holeMatchCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (c.1.readR c.2.1).CheckableA := by decide

theorem holeMatch_verdict_exact : ∀ c ∈ holeMatchCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 c.2.1 c.2.2 = v ↔ Vet m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vet_iff (holeMatchCases_checkable c hc).1 (holeMatchCases_checkable c hc).2 v

/-- A `match` over a hole that nothing binds: outside a generator's
template the hole is no value's place, so the match is the schema's
error whatever the data gives. The hole as the scrutinee, against no
data, the scrutinee's value and an arm's result; met with a value, at
an optional key and under a mark; as a pattern, as a result and with no
default; in a spread's template, which binds none; and in the body of a
name a generator's template reads, since a hole binds only where it is
written. -/
def freeHoleMatchCases : List (Decls × Val × Data) :=
  let one : Val := .lit (.str "one")
  let other : Val := .lit (.str "other")
  let mt : Val := .select .hole [(int 1, one)] (some other)
  [([], m [("x", mt)], .map []),
    ([], m [("x", mt)], .map [("x", j 1)]),
    ([], m [("x", mt)], .map [("x", .str "one")]),
    ([], m [("x", .meet mt (int 1))], .map []),
    ([], mo [("x", true, mt)], .map []),
    ([], m [("x", hide mt), ("y", int 2)], .map []),
    ([], m [("x", .select (int 1) [(.hole, one)] (some other))], .map []),
    ([], m [("x", .select (int 1) [(int 1, .hole)] (some other))], .map []),
    ([], m [("x", .select .hole [(int 1, one)] none)], .map []),
    ([], m [("a", .meet (.map [] (some mt) false) (m [("x", int 1)]))], .map []),
    ([("M", mt)], m [("xs", .call .each [lst [int 1, int 2], .alias "M"])], .map [])]

/-- Each case reads as ill-formed, which is the `error` class of `Vet`
whatever the checker can read, and `vet` answers it (`vet_error_iff`). -/
theorem freeHoleMatchCases_illFormed : ∀ c ∈ freeHoleMatchCases, c.1.illFormedR c.2.1 = true := by decide

theorem freeHoleMatch_error : ∀ c ∈ freeHoleMatchCases, ∀ (m : Mode),
    vet m c.1 c.2.1 c.2.2 = .error :=
  fun c hc _ => vet_error_iff.mpr (.inr (.inr (freeHoleMatchCases_illFormed c hc)))

/-- A `filter` takes a member as the term it is where the condition
narrows nothing in it (ruling 51), read by the order: a member whose
bound sits inside the condition's looser bound stays, though its meet
with the condition writes both bounds. A bound inside a looser one and
a bound inside a kind, in a map and in a list, each against data that
shows the member kept, held to its own bound, and a sibling dropped; a
map member whose own member holds the bound; two bounds inside two
looser ones; and a condition that narrows, a tighter bound and a
narrower kind, which drops the member. -/
def filterOrderCases : List (Decls × Val × Data) :=
  let min (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .min (.num (.integer ⟨n, h⟩))
  let max (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .max (.num (.integer ⟨n, h⟩))
  let flt (s c : Val) : Val := .filter s c
  let dx (x : Data) : Data := .map [("x", x)]
  let byMin : Val := m [("x", flt (m [("a", .meet .integer (min 3)), ("b", .integer), ("c", int 5)]) (min 1))]
  let byNum : Val := m [("x", flt (m [("a", min 3), ("b", .integer), ("c", int 5)]) .number)]
  let maps : Val := m [("x", flt (m [("a", m [("p", .integer)]), ("b", m [("p", int 1)]),
    ("c", m [("p", .meet .integer (min 2))])]) (m [("p", min 1)]))]
  let items : Val := m [("x", flt (.list [.meet .integer (min 3), .integer, int 5] none false) (min 1))]
  let two : Val := m [("x", flt (m [("a", .meet (min 3) (max 5)), ("c", int 5)]) (.meet (min 1) (max 9)))]
  [([], byMin, .map []),
    ([], byMin, dx (.map [("a", j 4), ("c", j 5)])),
    ([], byMin, dx (.map [("a", j 2), ("c", j 5)])),
    ([], byMin, dx (.map [("a", j 4), ("b", .str "s"), ("c", j 5)])),
    ([], byNum, dx (.map [("a", j 3), ("b", j 1), ("c", j 5)])),
    ([], byNum, dx (.map [("a", j 2), ("b", j 1), ("c", j 5)])),
    ([], maps, dx (.map [("b", .map [("p", j 1)]), ("c", .map [("p", j 2)])])),
    ([], maps, dx (.map [("b", .map [("p", j 1)]), ("c", .map [("p", j 1)])])),
    ([], maps, dx (.map [("a", .map [("p", .str "s")]), ("b", .map [("p", j 1)]), ("c", .map [("p", j 2)])])),
    ([], items, dx (.list [j 4, j 5])),
    ([], items, dx (.list [j 2, j 5])),
    ([], two, dx (.map [("a", j 4), ("c", j 5)])),
    ([], two, dx (.map [("a", j 7), ("c", j 5)])),
    ([], m [("x", flt (m [("a", min 1), ("c", int 5)]) (min 3))], dx (.map [("a", j 0), ("c", j 5)])),
    ([], m [("x", flt (m [("a", .number), ("c", int 5)]) .integer)], dx (.map [("a", .str "s"), ("c", j 5)]))]

set_option maxRecDepth 8192 in
/-- Every case's schema, read with its `filter` made, holds no path, no
pattern and no format, so `vet` is `Vet` on it, by `vet_iff`. -/
theorem filterOrderCases_checkable : ∀ c ∈ filterOrderCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (c.1.readR c.2.1).CheckableA := by decide

theorem filterOrder_verdict_exact : ∀ c ∈ filterOrderCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 c.2.1 c.2.2 = v ↔ Vet m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vet_iff (filterOrderCases_checkable c hc).1 (filterOrderCases_checkable c hc).2 v

/-- The cases of decision 13 of the design note's §7: a spread that
selects on `key(0)`, the key of the member it is tried on, over a map's
members and over a list's positions: an arm that admits, an arm that
refuses, the default, no arm and no default, a pattern over the key's
length, two such spreads met, a spread under a rider, and a spread
beside a member the schema declares, whose value the selection meets. -/
def keyCases : List (Decls × Val × Data) :=
  let min (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .min (.num (.integer ⟨n, h⟩))
  let on (arms : List (Val × Val)) (d : Option Val) : Val := .select .key arms d
  let spm (fs : List (String × Bool × Val)) (s : Val) : Val := .map fs (some s) false
  let spl (xs : List Val) (s : Val) : Val := .list xs (some s) false
  let z (v : Val) : Val := .map [("z", false, v)] none false
  let dz (x : Data) : Data := .map [("z", x)]
  let a : Val := on [(str "a", .integer)] (some Val.void)
  let ab : Val := on [(str "a", .integer), (str "b", .string)] none
  let short : Val := on [(.len (.max (nb 2)), .any)] (some Val.void)
  let both : Val := .meet (spm [] (on [(str "a", .integer)] (some .any)))
    (spm [] (on [(str "a", min 1)] (some .any)))
  let pick : Val := on [(str "a", .or [(1, int 1), (0, .integer)])] (some Val.void)
  let pos : Val := on [(str "0", .integer), (str "1", .string)] (some .any)
  let second : Val := on [(str "1", .string)] (some .any)
  [([], z (spm [] a), dz (.map [("a", j 1)])), ([], z (spm [] a), dz (.map [("a", .str "x")])),
    ([], z (spm [] a), dz (.map [("b", j 1)])), ([], z (spm [] a), dz (.map [])),
    ([], z (spm [] ab), dz (.map [("c", j 1)])), ([], z (spm [] ab), dz (.map [("b", .str "x")])),
    ([], z (spm [] short), dz (.map [("ab", j 1)])), ([], z (spm [] short), dz (.map [("abc", j 1)])),
    ([], z both, dz (.map [("a", j 0)])), ([], z both, dz (.map [("a", j 2)])),
    ([], z (spm [] (.ride .metadata a [])), dz (.map [("a", j 1)])),
    ([], z (spm [] (.ride .metadata a [])), dz (.map [("a", .str "x")])),
    ([], z (spm [("a", false, int 1)] a), dz (.map [("a", j 1)])),
    ([], z (spm [("a", false, str "x")] a), dz (.map [("a", .str "x")])),
    ([], z (spm [("a", false, .integer)] (on [(str "a", min 3)] (some Val.void))), dz (.map [("a", j 1)])),
    ([], z (spm [("a", false, .string)] a), dz (.map [("a", .str "x")])),
    ([], z (spm [("a", false, .any)] pick), dz (.map [])),
    ([], z (spm [("a", false, .any)] pick), dz (.map [("a", j 2)])),
    ([], z (spl [] pos), dz (.list [j 1, .str "a", .bool true])), ([], z (spl [] pos), dz (.list [.str "a"])),
    ([], z (spl [.integer] second), dz (.list [j 1, .str "a", j 3])),
    ([], z (spl [.integer] second), dz (.list [j 1, j 2]))]

set_option maxRecDepth 8192 in
theorem keyCases_checkable : ∀ c ∈ keyCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (c.1.readR c.2.1).CheckableA := by decide

theorem key_verdict_exact : ∀ c ∈ keyCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 c.2.1 c.2.2 = v ↔ Vet m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vet_iff (keyCases_checkable c hc).1 (keyCases_checkable c hc).2 v

/-- The calls `keyedCases` writes in the short form, each a pattern, a
schema and the default where one is written. -/
def keyedCalls : List (Val × Val × Option Val) :=
  [(str "a", .integer, some Val.void), (str "a", .integer, none),
    (.len (.max (nb 2)), .string, some .integer), (str "0", .string, some .integer)]

/-- `keyed(p, t, e?)` in a spread, as `Val.keyedCall` reads it: a key the
pattern admits held to the schema, any other to the default or left
alone, beside a field of the map's own, and by position in a list. -/
def keyedCases : List (Decls × Val × Data) :=
  let spm (fs : List (String × Bool × Val)) (s : Val) : Val := .map fs (some s) false
  let spl (s : Val) : Val := .list [] (some s) false
  let z (v : Val) : Val := .map [("z", false, v)] none false
  let dz (x : Data) : Data := .map [("z", x)]
  let only : Val := .keyedCall (str "a") .integer (some Val.void)
  let held : Val := .keyedCall (str "a") .integer
  let short : Val := .keyedCall (.len (.max (nb 2))) .string (some .integer)
  let pos : Val := .keyedCall (str "0") .string (some .integer)
  [([], z (spm [] only), dz (.map [("a", j 1)])), ([], z (spm [] only), dz (.map [("a", .str "x")])),
    ([], z (spm [] only), dz (.map [("b", j 1)])), ([], z (spm [] only), dz (.map [])),
    ([], z (spm [] held), dz (.map [("a", j 1), ("b", .str "x")])),
    ([], z (spm [] held), dz (.map [("a", .str "x")])),
    ([], z (spm [] short), dz (.map [("ab", .str "x"), ("abc", j 1)])),
    ([], z (spm [] short), dz (.map [("ab", j 1)])), ([], z (spm [] short), dz (.map [("abc", .str "x")])),
    ([], z (spm [("a", false, int 1)] only), dz (.map [("a", j 1)])),
    ([], z (spm [("a", false, str "x")] only), dz (.map [("a", .str "x")])),
    ([], z (spl pos), dz (.list [.str "a", j 1])), ([], z (spl pos), dz (.list [j 1]))]

set_option maxRecDepth 8192 in
theorem keyedCases_checkable : ∀ c ∈ keyedCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (c.1.readR c.2.1).CheckableA := by decide

theorem keyed_verdict_exact : ∀ c ∈ keyedCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 c.2.1 c.2.2 = v ↔ Vet m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vet_iff (keyedCases_checkable c hc).1 (keyedCases_checkable c hc).2 v

/-- The arguments of a trial both ports read as they build the trial,
each dead: a size, `must`'s condition, the count of `nof` and
`contains`, `filter`'s source and `match`'s scrutinee, which make the
document an error, alone, under a key, at an optional key, in a
generator's instance and in a body nothing reads; in an arm, which
drops; in a spread, which refuses only a member it's tried on; beside
the arguments both read later, against a value, `when`'s condition, a
branch of `nof` and the conditions of `contains` and `filter`, which a
dead one doesn't make an error; and a size and the counts of `nof` and
`contains` written `nil`, which both read as a value that admits
nothing, beside `nil` met with `1`, a `filter` over `nil` and a
selection on it, which are errors (#525). -/
def eagerCases : List (Decls × Val × Data) :=
  let c12 : Val := .meet (int 1) (int 2)
  let mu : Val := .must c12 "m"
  let mt : Val := .select c12 [(int 1, int 3)] none
  let dv : Data := .map [("v", .integer 1)]
  let d4 : Data := .map [("v", .integer 4)]
  let or4 (a : Val) : Val := .or [(0, a), (0, int 4)]
  [([], m [("v", mu)], dv),
    ([], m [("v", .nof c12 [.string])], dv),
    ([], m [("v", .contains .any c12)], dv),
    ([], m [("v", .len c12)], dv),
    ([], m [("v", .filter c12 (int 1))], dv),
    ([], m [("v", mt)], dv),
    ([], m [("v", m [("a", mu)])], .map [("v", .map [("a", .integer 1)])]),
    ([], m [("v", .when c12 (int 1) none)], dv),
    ([], m [("v", .nof (int 1) [c12])], dv),
    ([], m [("v", .contains c12 (int 2))], dv),
    ([], m [("v", .filter (.list [int 1] none false) c12)], dv),
    ([], m [("v", or4 mu)], d4),
    ([], m [("v", or4 mt)], d4),
    ([], m [("v", or4 (.filter c12 (int 1)))], d4),
    ([], m [("v", or4 (.len c12))], d4),
    ([], m [("v", .map [] (some mu) false)], .map [("v", .map [])]),
    ([], m [("v", .map [] (some mu) false)], .map [("v", .map [("a", .integer 1)])]),
    ([], m [("v", .map [("a", true, mu)] none false)], .map [("v", .map [])]),
    ([], m [("v", .call .each [.list [int 1] none false, mu])], .map [("v", .list [.integer 1])]),
    ([], m [("v", .call .each [.list [] none false, mu])], .map [("v", .list [])]),
    ([("T", mu)], m [("v", int 1)], dv),
    ([("T", .len c12)], m [("v", int 1)], dv),
    ([], m [("v", .nof Val.void [.string])], dv),
    ([], m [("v", .len Val.void)], dv),
    ([], m [("v", .contains .any Val.void)], dv),
    ([], m [("v", .must (.meet Val.void (int 1)) "m")], dv),
    ([], m [("v", .select Val.void [(int 1, int 3)] none)], dv),
    ([], m [("v", .filter Val.void (int 1))], dv)]

theorem eagerCases_checkable : ∀ c ∈ eagerCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (c.1.readR c.2.1).CheckableA := by decide

theorem eager_verdict_exact : ∀ c ∈ eagerCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 c.2.1 c.2.2 = v ↔ Vet m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vet_iff (eagerCases_checkable c hc).1 (eagerCases_checkable c hc).2 v

/-- The same arguments holding a conflict below their top, which both
ports read as the schema's error too (decision 62 of the design note's
§7, #535): at an optional member, a nested one and a position; the
conflicts the meet finds, a list too long for its size and two members
alike under `unique()`, at the top and at an optional member; a
preference clash and a size that holds a choice; a call the reading
could not make; and a trial that holds one. So `must`'s condition, a
size, the counts of `nof` and `contains`, a selection's scrutinee and a
`filter`'s source, and a list's marked element; beside an arm holding
one, which drops, in an argument and holding the trial; a spread
holding one, which refuses only a member it's tried on; a body nothing
reads and an optional key, which are errors too; the arguments both
read later, `when`'s condition, a branch of `nof` and the condition of
`contains`, which a conflict below their top doesn't make an error; and
a written `nil` there, which stands. -/
def deepEagerCases : List (Decls × Val × Data) :=
  let c12 : Val := .meet (int 1) (int 2)
  let mu (c : Val) : Val := .must c "m"
  let opt (v : Val) : Val := mo [("b", true, v)]
  let long : Val := .meet (.len (int 1)) (lst [int 1, int 2])
  let twins : Val := .meet (.unique none) (lst [int 1, int 1])
  let clash2 : Val := .or [(1, int 1), (1, int 2)]
  let x1 : Val := m [("x", int 1)]
  let dx : Data := .map [("v", .map [("x", .integer 1)])]
  let d0 : Data := .map [("v", .map [])]
  let dv : Data := .map [("v", .integer 1)]
  [([], m [("v", mu (opt c12))], dx),
    ([], m [("v", mu (opt (opt c12)))], dx),
    ([], m [("v", mu (lst [c12]))], dx),
    ([], m [("v", mu long)], dx),
    ([], m [("v", mu twins)], dx),
    ([], m [("v", mu (opt twins))], dx),
    ([], m [("v", mu clash2)], dx),
    ([], m [("v", mu (opt clash2))], dx),
    ([], m [("v", mu (mo [("x", true, .len (.or [(0, int 1), (0, int 3)]))]))], dx),
    ([], m [("v", mu (mo [("x", true, .call .add [str "a", int 1])]))], dx),
    ([], m [("v", mu (mu c12))], dx),
    ([], m [("v", mu (opt (mu c12)))], dx),
    ([], m [("v", .len (opt c12))], dx),
    ([], m [("v", .len twins)], dx),
    ([], m [("v", .nof twins [x1])], dx),
    ([], m [("v", .contains x1 long)], dx),
    ([], m [("v", .select (opt c12) [(m [], int 3)] none)], dv),
    ([], m [("v", .select long [(lst [], int 3)] (some (int 4)))], dv),
    ([], m [("v", .filter (mo [("a", false, int 1), ("b", true, c12)]) (int 1))],
      .map [("v", .map [("a", .integer 1)])]),
    ([], m [("v", .filter twins (int 1))], dx),
    ([], m [("v", lst [type (opt c12), int 1])], dx),
    ([], m [("v", mu (.or [(0, x1), (0, mo [("x", false, int 1), ("b", true, c12)])]))], dx),
    ([], m [("v", .or [(0, mu (opt c12)), (0, int 4)])], .map [("v", .integer 4)]),
    ([], m [("v", .map [] (some (mu (opt c12))) false)], d0),
    ([], m [("v", .map [] (some (mu (opt c12))) false)], .map [("v", .map [("a", .integer 1)])]),
    ([], m [("v", mu (.map [] (some c12) false))], dx),
    ([], m [("v", mu (.map [] (some c12) false))], d0),
    ([("T", mu (opt c12))], m [("v", int 1)], dv),
    ([], m [("v", mo [("a", true, mu (opt c12))])], d0),
    ([], m [("v", .call .each [lst [int 1], mu (opt c12)])], .map [("v", .list [.integer 1])]),
    ([], m [("v", .when (opt c12) x1 none)], dx),
    ([], m [("v", .nof (int 1) [opt c12, x1])], dx),
    ([], m [("v", .contains (opt c12) (int 1))], dx),
    ([], m [("v", mu (mo [("b", false, Val.void)]))], dx),
    ([], m [("v", mu (lst [Val.void]))], dx)]

set_option maxRecDepth 8192 in
theorem deepEagerCases_checkable : ∀ c ∈ deepEagerCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (c.1.readR c.2.1).CheckableA := by decide

theorem deep_eager_verdict_exact : ∀ c ∈ deepEagerCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 c.2.1 c.2.2 = v ↔ Vet m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vet_iff (deepEagerCases_checkable c hc).1 (deepEagerCases_checkable c hc).2 v

/-- The arguments a trial tries against a value, holding a clash below
their top, which makes the whole argument admit nothing, as both ports
read it: `when`'s branch, which then refuses the value its condition
takes, and its condition, which then takes none; the condition of
`contains`, which then counts no member, and of `filter`, which then
keeps none; and a branch of `nof` holding a call the reading could not
make, a list too long for its size and a preference clash, which then
counts for no value. -/
def lazyClashCases : List (Decls × Val × Data) :=
  let c12 : Val := .meet (int 1) (int 2)
  let opt (v : Val) : Val := mo [("b", true, v)]
  let x1 : Val := m [("x", int 1)]
  let long : Val := .meet (.len (int 1)) (lst [int 1, int 2])
  let clash2 : Val := .or [(1, int 1), (1, int 2)]
  let dx : Data := .map [("v", .map [("x", .integer 1)])]
  let dx2 : Data := .map [("v", .map [("x", .integer 2)])]
  [([], m [("v", .when (m [("x", int 2)]) (mo [("x", false, int 2), ("b", true, c12)]) none)], dx2),
    ([], m [("v", .when (opt c12) x1 none)], dx2),
    ([], m [("v", .contains (opt c12) (int 1))], .map [("v", .list [.map [("x", .integer 1)]])]),
    ([], m [("v", .filter (m [("a", x1)]) (opt c12))], .map [("v", .map [])]),
    ([], m [("v", .nof (int 1) [opt (.call .add [str "a", int 1]), x1])], dx),
    ([], m [("v", .nof (int 1) [opt long, x1])], dx),
    ([], m [("v", .nof (int 1) [opt clash2, x1])], dx)]

set_option maxRecDepth 8192 in
theorem lazyClashCases_checkable : ∀ c ∈ lazyClashCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (c.1.readR c.2.1).CheckableA := by decide

theorem lazy_clash_verdict_exact : ∀ c ∈ lazyClashCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 c.2.1 c.2.2 = v ↔ Vet m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vet_iff (lazyClashCases_checkable c hc).1 (lazyClashCases_checkable c hc).2 v

/-- A written `nil` below the top of `must`'s condition, which ruling 54
reads where it stands: at an optional member, a `b` the value must
leave out, against data without it, with nothing and with it; in an
arm, which refuses every value; and met with a value, which stays a
written `nil`; beside one in a branch of `nof`. Both ports refuse
every value where the condition holds one, so the rows they answer
otherwise are in the ledger under #894. -/
def voidBelowCases : List (Decls × Val × Data) :=
  let mu (c : Val) : Val := .must c "m"
  let opt (v : Val) : Val := mo [("b", true, v)]
  let dx : Data := .map [("v", .map [("x", .integer 1)])]
  [([], m [("v", mu (opt Val.void))], dx),
    ([], m [("v", mu (opt Val.void))], .map [("v", .map [])]),
    ([], m [("v", mu (opt Val.void))], .map [("v", .map [("b", .integer 1)])]),
    ([], m [("v", mu (.or [(0, m [("x", int 1)]), (0, m [("x", Val.void)])]))], dx),
    ([], m [("v", mu (opt (.meet Val.void (int 1))))], dx),
    ([], m [("v", .nof (int 0) [opt Val.void])], dx)]

theorem voidBelowCases_checkable : ∀ c ∈ voidBelowCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (c.1.readR c.2.1).CheckableA := by decide

theorem void_below_verdict_exact : ∀ c ∈ voidBelowCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 c.2.1 c.2.2 = v ↔ Vet m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vet_iff (voidBelowCases_checkable c hc).1 (voidBelowCases_checkable c hc).2 v

/-- `contains` over a recursive name met with a list, which the meet
counts reading the name as its body, as both ports do: a member that
matches, beside a count that admits it and one that refuses it, against
data and met with the schema's own literal, and a member that doesn't
match (#534's review). -/
def meetNameCases : List (Decls × Val × Data) :=
  let a : Decls := [("A", .map [("next", true, .alias "A")] none false)]
  let t (v : Val) : Val := .map [("t", false, v)] none false
  let d1 : Data := .map [("t", .list [.map []])]
  [(a, t (.contains (.alias "A") (.neq [nb 0])), d1),
    (a, t (.contains (.alias "A") (.max (nb 0))), d1),
    (a, t (.meet (.contains (.alias "A") (.max (nb 0))) (.list [.map [] none false] none false)), .map []),
    (a, t (.meet (.contains (.alias "A") (.neq [nb 0])) (.list [.map [] none false] none false)), .map []),
    (a, t (.meet (.contains (.alias "A") (.neq [nb 0])) (.list [int 1] none false)), .map [])]

theorem meetNameCases_checkable : ∀ c ∈ meetNameCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem meetName_verdict_exact : ∀ c ∈ meetNameCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 c.2.1 c.2.2 = v ↔ Vet m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vet_iff (meetNameCases_checkable c hc).1
    (readR_checkableA (meetNameCases_checkable c hc).1 (meetNameCases_checkable c hc).2) v

/-- The trials over a disjunction, which admits what any arm admits,
whatever the arm's rank, as admission does anywhere (decision 32):
`contains` over an arm beside the default and over two plain arms,
counted by a number the arms' members meet and one they don't; `nof`
and `must` over the same, beside a branch that refuses, and with an
optional member; `when`, whose condition picks its then-branch through
such an arm; `rest`; and `contains` over a list and a map holding the
disjunction, and over an arm of `null` (#635); and `contains` over a
preference arm its member refuses, beside an arm that adds a member,
which admits nothing, since the arm has no parent type (#637). -/
def armTrialCases : List (Decls × Val × Data) :=
  let mp (fs : List (String × Bool × Val)) : Val := .map fs none false
  let a (v : Val) : Val := mp [("a", false, v)]
  let da (x : Data) : Data := .map [("a", x)]
  let b1 : Val := mp [("b", false, int 1)]
  let pick : Val := .or [(1, b1), (0, mp [])]
  let plain : Val := .or [(0, b1), (0, mp [])]
  let cnt (c : Val) (n : Val := .min (.num (.integer (.of 1)))) : Val := .contains c n
  let two : Data := .list [.map [], .map [("b", j 1)]]
  [([], a (cnt pick), da (.list [.map []])), ([], a (cnt plain), da (.list [.map []])),
    ([], a (cnt pick (int 1)), da two), ([], a (cnt pick (int 2)), da two),
    ([], a (.nof (int 1) [pick]), da (.map [])),
    ([], a (.nof (int 1) [plain, mp [("c", false, int 1)]]), da (.map [])),
    ([], a (.must pick "m"), da (.map [])),
    ([], a (.must (.or [(1, b1), (0, mp [("c", true, int 1)])]) "m"), da (.map [])),
    ([], a (.when pick (mp []) (some (int 1))), da (.map [])),
    ([], a (.rest pick []), da (.map [("x", .map [])])),
    ([], a (cnt (.list [pick] none false)), da (.list [.list [.map []]])),
    ([], a (cnt (mp [("a", false, pick)])), da (.list [.map [("a", .map [])]])),
    ([], a (cnt (.or [(1, b1), (0, .lit .null)])), da (.list [.null])),
    ([], a (cnt (.or [(1, b1), (0, mp [("a", false, mp [])])])), da (.list [.map [("b", j 2)]]))]

theorem armTrialCases_checkable : ∀ c ∈ armTrialCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (c.1.readR c.2.1).CheckableA := by decide

theorem arm_trial_verdict_exact : ∀ c ∈ armTrialCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 c.2.1 c.2.2 = v ↔ Vet m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vet_iff (armTrialCases_checkable c hc).1 (armTrialCases_checkable c hc).2 v

/-- The `trials` rows: each case's declarations and schema as one
document, the schema a map written without its braces, in the three
modes, with the one class `vet` gives. -/
def trialRows (tag : String) (cases : List (Decls × Val × Data) := trialCases ++ selectCases) :
    IO Unit := do
  let mut i := 0
  for c in cases do
    let lines ← declLines c.1
    let some ssrc := c.2.1.cell | throw (IO.userError "a schema of the fragment has no text")
    let some dsrc := c.2.2.cell | throw (IO.userError "a document of the fragment has no text")
    let src := "\\n".intercalate (lines ++ [(ssrc.drop 1).dropRight 1])
    i ← verdictLines tag i src dsrc fun m => vet m c.1 c.2.1 c.2.2

/-- The `keyed` rows: each case of `keyedCases` with its selection
written in the short form, in the three modes, with the one class `vet`
gives the selection the call is read as. A selection the short form
does not write stops the run. -/
def keyedRows (tag : String) : IO Unit := do
  let mut i := 0
  for c in keyedCases do
    let some ssrc := c.2.1.cell | throw (IO.userError "a schema of the fragment has no text")
    let some dsrc := c.2.2.cell | throw (IO.userError "a document of the fragment has no text")
    let mut src := (ssrc.drop 1).dropRight 1
    for (p, t, e) in keyedCalls do
      let some long := (Val.keyedCall p t e).cell | throw (IO.userError "a selection of the fragment has no text")
      let some ps := p.cell | throw (IO.userError "a pattern of the fragment has no text")
      let some ts := t.cell | throw (IO.userError "a schema of the fragment has no text")
      let es ← match e with
        | none => pure ""
        | some e => match e.cell with
          | some s => pure (", " ++ s)
          | none => throw (IO.userError "a default of the fragment has no text")
      src := src.replace long ("keyed(" ++ ps ++ ", " ++ ts ++ es ++ ")")
    if (src.splitOn "match(").length ≠ 1 then
      throw (IO.userError ("a selection the short form does not write: " ++ src))
    i ← verdictLines tag i src dsrc fun m => vet m c.1 c.2.1 c.2.2
