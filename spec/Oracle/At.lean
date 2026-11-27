import Oracle.Base

/-! The oracle's cases for `at`, the member at a key or a position. -/

open Aontu
open Case

/-- `at(d, k, …)` (task C1 of the lang refinement plan): in a map the
member under the key a string is or an integer's digits write, in a
list the element at the position an integer is, counted from the end
where it is negative, or a string spells in canonical decimal; more
keys step further; each key read as its value; the member copied as a
reference copies it, its marks cleared and a definition's copy sealed.
A step that names nothing, a step into a scalar and a key of another
kind are each the schema's error; under `maybe` a step that names
nothing and data that names nothing are absence, while a key that names
nothing is not (ruling 2). Each document comes with the data the
definition generates and with data it refuses. -/
def atCases : List (Decls × Val × Data) :=
  let atc (d : Val) (ks : List Val) : Val := .call .at (d :: ks)
  let mb (v : Val) : Val := .call .maybe [v]
  let x1 (v : Data) : Data := dm [("x", v)]
  let ab : Val := m [("a", int 1), ("b", int 2)]
  let xs : Val := lst [str "a", str "b", str "c"]
  let mxs (k : Val) : Val := m [("xs", xs), ("x", atc (p ["xs"]) [k])]
  let mm (k : Val) : Val := m [("m", ab), ("x", atc (p ["m"]) [k])]
  let nest : Val := m [("a", m [("b", m [("c", int 1)])])]
  let nm (ks : List Val) : Val := m [("m", nest), ("x", atc (p ["m"]) ks)]
  let svc : Val := m [("a", m [("port", int 1)]), ("b", m [("port", int 2)])]
  let svc1 : Val := m [("a", m [("port", int 1)]), ("b", m [])]
  let teams : Val := m [("core", m [("email", str "core@x")]), ("web", m [("email", str "web@x")])]
  let owners (sv : Val) (t : Val) : Val := m [("teams", teams), ("svc", sv), ("owners", .call .pack [p ["svc"], t])]
  let sv2 : Val := m [("a", m [("team", str "core")]), ("b", m [("team", str "web")])]
  let sv3 : Val := m [("a", m [("team", str "core")]), ("b", m [("team", str "ops")])]
  let lookup : Val := atc (p ["teams"]) [atc .hole [str "team"], str "email"]
  [([], mm (str "b"), x1 (j 2)), ([], mm (str "b"), x1 (j 1)),
    ([], m [("m", m [("a b", int 1)]), ("x", atc (p ["m"]) [str "a b"])], x1 (j 1)),
    ([], m [("m", m [("", int 1)]), ("x", atc (p ["m"]) [str ""])], x1 (j 1)),
    ([], m [("m", m [("1", str "z")]), ("x", atc (p ["m"]) [int 1])], x1 (js "z")),
    ([], m [("m", m [("1", str "z")]), ("x", atc (p ["m"]) [int 1])], x1 (js "y")),
    ([], m [("m", m [("-1", str "z"), ("a", str "y")]), ("x", atc (p ["m"]) [int (-1)])], x1 (js "z")),
    ([], mxs (int 0), x1 (js "a")), ([], mxs (int 1), x1 (js "b")), ([], mxs (int 1), x1 (js "a")),
    ([], mxs (str "2"), x1 (js "c")), ([], mxs (str "01"), dm []), ([], mxs (str "-1"), dm []),
    ([], mxs (str "a"), dm []),
    ([], mxs (int (-1)), x1 (js "c")), ([], mxs (int (-1)), x1 (js "a")),
    ([], mxs (int (-2)), x1 (js "b")), ([], mxs (int (-3)), x1 (js "a")),
    ([], mxs (int (-4)), dm []), ([], mxs (int 3), dm []), ([], mxs (int 0), x1 (js "b")),
    ([], m [("xs", lst []), ("x", atc (p ["xs"]) [int (-1)])], dm []),
    ([], m [("x", atc ab [str "b"])], x1 (j 2)), ([], m [("x", atc (lst [int 1, int 2]) [int 1])], x1 (j 2)),
    ([], m [("x", atc (lst [int 1, int 2]) [int 1])], x1 (j 1)),
    ([], nm [str "a", str "b", str "c"], x1 (j 1)), ([], nm [str "a", str "b", str "c"], x1 (j 2)),
    ([], nm [str "a", str "b"], x1 (dm [("c", j 1)])),
    ([], nm [str "a", str "b", str "d"], dm []), ([], nm [str "a", str "b", str "c", str "d"], dm []),
    ([], m [("m", m [("a", str "abc")]), ("x", atc (p ["m"]) [str "a", int 0])], dm []),
    ([], m [("m", m [("xs", lst [int 1, int 2, int 3])]), ("x", atc (p ["m"]) [str "xs", int (-1)])], x1 (j 3)),
    ([], m [("m", m [("xs", lst [m [("n", int 1)], m [("n", int 2)]])]),
      ("x", atc (p ["m"]) [str "xs", int 1, str "n"])], x1 (j 2)),
    ([], m [("m", m [("a", int 1), ("k", str "a")]), ("x", atc (p ["m"]) [p ["m", "k"]])], x1 (j 1)),
    ([], m [("m", m [("a", int 1)]), ("x", atc (p ["m"]) [p ["k"]]), ("k", str "a")], x1 (j 1)),
    ([], m [("xs", lst [int 10, int 20, int 30]), ("x", atc (p ["xs"]) [.call .add [int 1, int 1]])], x1 (j 30)),
    ([], m [("m", m [("ab", int 1)]), ("x", atc (p ["m"]) [.call .plus [str "a", str "b"]])], x1 (j 1)),
    ([], m [("m", m [("a", m [("b", int 1)]), ("k", m [("n", str "a")])]),
      ("x", atc (p ["m"]) [atc (p ["m"]) [str "k", str "n"], str "b"])], x1 (j 1)),
    ([], m [("m", m [("a", m [("b", int 1)])]), ("x", atc (atc (p ["m"]) [str "a"]) [str "b"])], x1 (j 1)),
    ([], m [("a", m [("m", m [("x", int 1)]), ("v", atc (rel 1 ["m"]) [str "x"])])],
      dm [("a", dm [("v", j 1)])]),
    ([], m [("a", m [("m", m [("x", int 1)]), ("v", atc (rel 1 ["m"]) [str "x"])])],
      dm [("a", dm [("v", j 2)])]),
    ([], m [("m", m [("a", .integer)]), ("x", atc (p ["m"]) [str "a"])], dm [("m", dm [("a", j 5)]), ("x", j 5)]),
    ([], m [("m", m [("a", .integer)]), ("x", atc (p ["m"]) [str "a"])], dm [("m", dm [("a", j 5)]), ("x", j 6)]),
    ([], m [("m", m [("a", m [("b", int 1)])]), ("x", .meet (atc (p ["m"]) [str "a"]) (m [("c", int 2)]))],
      x1 (dm [("b", j 1), ("c", j 2)])),
    ([], m [("m", m [("a", int 1)]), ("x", .meet (atc (p ["m"]) [str "a"]) (int 2))], dm []),
    ([], m [("m", m [("a", hide (int 1)), ("b", int 2)]), ("x", atc (p ["m"]) [str "a"])], x1 (j 1)),
    ([], m [("m", m [("a", hide (int 1)), ("b", int 2)]), ("x", atc (p ["m"]) [str "a"])], x1 (j 2)),
    ([], m [("m", hide (m [("a", int 1)])), ("x", atc (p ["m"]) [str "a"])], x1 (j 1)),
    ([], m [("m", m [("a", m [("b", hide (int 1)), ("c", int 2)])]), ("x", atc (p ["m"]) [str "a"])],
      x1 (dm [("b", j 1), ("c", j 2)])),
    ([], m [("xs", lst [int 1, hide (int 2), int 3]), ("x", atc (p ["xs"]) [int 1])], x1 (j 3)),
    ([], m [("xs", lst [int 1, hide (int 2), int 3]), ("x", atc (p ["xs"]) [int 1])], x1 (j 2)),
    ([], m [("m", m [("a", type .integer)]), ("x", atc (p ["m"]) [str "a"])], x1 (j 4)),
    ([], m [("m", m [("a", type (m [("b", .integer)]))]), ("x", .meet (atc (p ["m"]) [str "a"]) (m [("b", int 1)]))],
      x1 (dm [("b", j 1)])),
    ([], m [("m", m [("a", type (m [("b", .integer)]))]),
      ("x", .meet (atc (p ["m"]) [str "a"]) (m [("b", int 1), ("c", int 2)]))], dm []),
    ([], m [("T", type (m [("a", m [("b", int 1)])])), ("x", .meet (atc (p ["T"]) [str "a"]) (m [("c", int 2)]))],
      dm []),
    ([], mm (str "c"), dm []), ([], m [("x", atc (int 1) [str "a"])], dm []),
    ([], m [("x", atc (str "abc") [int 0])], dm []),
    ([], m [("x", atc (p ["gone"]) [str "a"])], dm []),
    ([], m [("m", ab), ("x", mb (atc (p ["m"]) [str "c"])), ("y", int 1)], dm [("y", j 1)]),
    ([], m [("m", ab), ("x", mb (atc (p ["m"]) [str "a"]))], x1 (j 1)),
    ([], m [("m", ab), ("x", mb (atc (p ["m"]) [str "a"]))], x1 (j 2)),
    ([], m [("m", nest), ("x", mb (atc (p ["m"]) [str "a", str "c"]))], dm []),
    ([], m [("m", nest), ("x", .meet (mb (atc (p ["m"]) [str "a", str "c"])) (int 2))], x1 (j 2)),
    ([], m [("m", ab), ("x", mb (atc (p ["m"]) [str "a", str "b"]))], dm []),
    ([], m [("x", mb (atc (p ["gone"]) [str "b"]))], dm []),
    ([], m [("m", ab), ("x", lst [int 1, mb (atc (p ["m"]) [str "c"]), int 2])], x1 (jl [j 1, j 2])),
    ([], m [("xs", lst [str "a"]), ("x", lst [mb (atc (p ["xs"]) [int 1]), mb (atc (p ["xs"]) [int (-2)]),
      atc (p ["xs"]) [int (-1)]])], x1 (jl [js "a"])),
    ([], m [("m", ab), ("x", mb (.call .upper [atc (p ["m"]) [str "c"]]))], dm []),
    ([], m [("m", ab), ("x", mb (atc (p ["m"]) [p ["gone"]]))], dm []),
    ([], m [("m", ab), ("x", atc (p ["m"]) [mb (p ["gone"])]), ("y", int 1)], dm [("y", j 1)]),
    ([], mm (.lit (.bool true)), dm []), ([], mxs (.lit (.num (.float (.dyadic 3 (-1))))), dm []),
    ([], mm (.lit .null), dm []), ([], mm (lst [str "a"]), dm []), ([], mm (m [("a", int 1)]), dm []),
    ([], m [("m", nest), ("x", atc (p ["m"]) [str "a", .lit (.bool false)])], dm []),
    ([], mm .string, dm []), ([], mm (.or [(1, str "a"), (0, str "b")]), dm []),
    ([], m [("m", ab), ("x", atc (p ["m"]) [str "q", .lit (.bool true)])], dm []),
    ([], mxs (int 0), x1 (js "a")),
    ([], m [("m", ab), ("x", .call .at [p ["m"]])], dm []), ([], m [("x", .call .at [])], dm []),
    ([], m [("svc", svc), ("ports", .call .pack [p ["svc"], atc .hole [str "port"]])],
      dm [("ports", dm [("a", j 1), ("b", j 2)])]),
    ([], m [("svc", svc), ("ports", .call .pack [p ["svc"], atc .hole [str "port"]])],
      dm [("ports", dm [("a", j 2), ("b", j 2)])]),
    ([], m [("svc", svc1), ("ports", .call .pack [p ["svc"], atc .hole [str "port"]])], dm []),
    ([], m [("svc", svc1), ("ports", .call .pack [p ["svc"], m [("p", mb (atc .hole [str "port"]))]])],
      dm [("ports", dm [("a", dm [("p", j 1)]), ("b", dm [])])]),
    ([], m [("xs", lst [m [("n", int 1)], m [], m [("n", int 3)]]), ("out", .call .each [p ["xs"], mb (atc .hole [str "n"])])],
      dm [("out", jl [j 1, j 3])]),
    ([], m [("xs", lst [m [("name", str "web")], m [("name", str "db")]]),
      ("out", .call .each [p ["xs"], atc .hole [str "name"]])], dm [("out", jl [js "web", js "db"])]),
    ([], owners sv2 lookup, dm [("owners", dm [("a", js "core@x"), ("b", js "web@x")])]),
    ([], owners sv2 lookup, dm [("owners", dm [("a", js "web@x"), ("b", js "web@x")])]),
    ([], owners sv3 lookup, dm []),
    ([], owners sv3 (m [("o", mb lookup)]), dm [("owners", dm [("a", dm [("o", js "core@x")]), ("b", dm [])])]),
    ([], m [("m", m [("x", int 1), ("y", int 2)]), ("out", .call .pack [p ["m"], m [("v", atc (p ["m"]) [.keyUp 1])]])],
      dm [("out", dm [("x", dm [("v", j 1)]), ("y", dm [("v", j 2)])])]),
    ([], m [("ks", lst [str "a", str "b"]), ("ys", lst [int 1, int 2]),
      ("pairs", .call .each [p ["ks"], m [("k", .hole), ("y", atc (p ["ys"]) [.keyUp 1])]])],
      dm [("pairs", jl [dm [("k", js "a"), ("y", j 1)], dm [("k", js "b"), ("y", j 2)]])]),
    ([], m [("ks", lst [str "a", str "b", str "c"]), ("ys", lst [int 1, int 2]),
      ("pairs", .call .each [p ["ks"], m [("k", .hole), ("y", atc (p ["ys"]) [.keyUp 1])]])], dm [])]

theorem atCases_checkable : ∀ c ∈ atCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem at_verdict_exact : ∀ c ∈ atCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (atCases_checkable c hc).1 (atCases_checkable c hc).2 v

/-- The rows of `at`, numbered from at0, in `oracle paths`. -/
def atRows : IO Unit := do
  IO.println "# at(d, k, …), the member at a key or a position, follows in rows at0 on: a map's"
  IO.println "# member under the key a string is or an integer's digits write, a list's element"
  IO.println "# at the position an integer is, counted from the end where negative, or a string"
  IO.println "# spells in canonical decimal, more keys stepping further, each key read as its"
  IO.println "# value, the member copied as a reference copies it, an error for a step that"
  IO.println "# names nothing and a key of another kind, and absence under maybe for a step"
  IO.println "# or data that names nothing."
  pathRows "at" atCases
