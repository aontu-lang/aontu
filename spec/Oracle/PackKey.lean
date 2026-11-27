import Oracle.Base

/-! The oracle's cases for `pack` with a key, its third argument. -/

open Aontu
open Case

/-- `pack(d, t, k)` (task C2 of the lang refinement plan, rulings 5 to
8): each member's child stands under the string `k` answers for that
member, `k` read where the member's child would stand under its own
key, so that `_` is the member and `key(0)` its own key in a map or its
position in a list, and `key()` the call's own key. A key that is no
string, a number, a kind, a choice with a default, a map, a boolean or
the absence `maybe` makes, is the schema's error, and so is a refusal
`k` answers itself. `t` reads `key(0)` as the key `k` answered, keys
that collide meet, and a list's members need not be strings. Each
document comes with the data the definition generates and with data
it refuses. -/
def packKeyCases : List (Decls × Val × Data) :=
  let atc (d : Val) (ks : List Val) : Val := .call .at (d :: ks)
  let pk (d t k : Val) : Val := .call .pack [d, t, k]
  let o1 (v : Data) : Data := dm [("out", v)]
  let ab : Val := m [("a", int 1), ("b", int 2)]
  let xs2 : Val := lst [m [("name", str "web"), ("port", int 80)], m [("name", str "db"), ("port", int 5432)]]
  let ns2 : Val := lst [m [("ns", str "a"), ("name", str "web"), ("port", int 80)],
    m [("ns", str "b"), ("name", str "db"), ("port", int 5432)]]
  let plus (a b : Val) : Val := .call .plus [a, b]
  [([], m [("xs", xs2), ("out", pk (p ["xs"]) (atc .hole [str "port"]) (atc .hole [str "name"]))],
      o1 (dm [("web", j 80), ("db", j 5432)])),
    ([], m [("xs", xs2), ("out", pk (p ["xs"]) (atc .hole [str "port"]) (atc .hole [str "name"]))],
      o1 (dm [("web", j 80), ("db", j 80)])),
    ([], m [("xs", ns2), ("out", pk (p ["xs"]) (atc .hole [str "port"])
      (plus (plus (atc .hole [str "ns"]) (str "/")) (atc .hole [str "name"])))],
      o1 (dm [("a/web", j 80), ("b/db", j 5432)])),
    ([], m [("m", ab), ("out", pk (p ["m"]) .hole (plus (str "svc-") (.keyUp 0)))],
      o1 (dm [("svc-a", j 1), ("svc-b", j 2)])),
    ([], m [("m", ab), ("out", pk (p ["m"]) .hole (plus (str "svc-") (.keyUp 0)))],
      o1 (dm [("a", j 1), ("b", j 2)])),
    ([], m [("xs", lst [str "p", str "q"]), ("out", pk (p ["xs"]) .hole (plus (str "n") (.keyUp 0)))],
      o1 (dm [("n0", js "p"), ("n1", js "q")])),
    ([], m [("xs", lst [str "p", str "q"]), ("out", pk (p ["xs"]) .hole (.keyUp 0))],
      o1 (dm [("0", js "p"), ("1", js "q")])),
    ([], m [("m", ab), ("out", pk (p ["m"]) .hole (plus (plus (.keyUp 1) (str "-")) (.keyUp 0)))],
      o1 (dm [("out-a", j 1), ("out-b", j 2)])),
    ([], m [("m", m [("a", str "x"), ("b", str "y")]), ("out", pk (p ["m"]) (.keyUp 0) .hole)],
      o1 (dm [("x", js "x"), ("y", js "y")])),
    ([], m [("m", m [("a", str "x"), ("b", str "y")]), ("out", pk (p ["m"]) (.keyUp 0) .hole)],
      o1 (dm [("x", js "a"), ("y", js "b")])),
    ([], m [("m", m [("a", str "x"), ("b", str "y")]),
      ("out", pk (.call .pack [p ["m"], m [("k", .keyUp 1), ("v", .hole)]]) (atc .hole [str "k"]) (atc .hole [str "v"]))],
      o1 (dm [("x", js "a"), ("y", js "b")])),
    ([], m [("xs", lst [str "a", str "b"]), ("out", pk (p ["xs"]) (int 1) (.call .upper [.hole]))],
      o1 (dm [("A", j 1), ("B", j 1)])),
    ([], m [("xs", lst [int 1, int 2]), ("out", pk (p ["xs"]) .hole (plus (str "n") .hole))],
      o1 (dm [("n1", j 1), ("n2", j 2)])),
    ([], m [("names", m [("x", str "web"), ("y", str "db")]), ("m", m [("x", int 80), ("y", int 5432)]),
      ("out", pk (p ["m"]) .hole (atc (p ["names"]) [.keyUp 0]))], o1 (dm [("web", j 80), ("db", j 5432)])),
    ([], m [("pf", str "x-"), ("xs", lst [m [("n", str "a")], m [("n", str "b")]]),
      ("out", pk (p ["xs"]) (atc .hole [str "n"]) (plus (p ["pf"]) (atc .hole [str "n"])))],
      o1 (dm [("x-a", js "a"), ("x-b", js "b")])),
    ([], m [("m", m []), ("out", pk (p ["m"]) .hole (atc .hole [str "n"]))], o1 (dm [])),
    ([], m [("xs", lst []), ("out", pk (p ["xs"]) .hole (atc .hole [str "n"]))], o1 (dm [])),
    ([], m [("xs", lst [m [("n", str "a"), ("v", int 1)], m [("n", str "a"), ("w", int 2)], m [("n", str "b"), ("v", int 3)]]),
      ("out", pk (p ["xs"]) .hole (atc .hole [str "n"]))],
      o1 (dm [("a", dm [("n", js "a"), ("v", j 1), ("w", j 2)]), ("b", dm [("n", js "b"), ("v", j 3)])])),
    ([], m [("xs", lst [m [("n", str "a"), ("v", int 1)], m [("n", str "a"), ("v", int 2)]]),
      ("out", pk (p ["xs"]) .hole (atc .hole [str "n"]))], dm []),
    ([], m [("xs", lst [m [("v", int 1)], m [("w", int 2)]]), ("out", pk (p ["xs"]) .hole (str "all"))],
      o1 (dm [("all", dm [("v", j 1), ("w", j 2)])])),
    ([], m [("xs", lst [m [("n", int 1)]]), ("out", pk (p ["xs"]) .hole (atc .hole [str "n"]))], dm []),
    ([], m [("m", m [("a", int 1)]), ("out", pk (p ["m"]) .hole (int 2))], dm []),
    ([], m [("m", m [("a", m [("n", .string)])]), ("out", pk (p ["m"]) .hole (atc .hole [str "n"]))], dm []),
    ([], m [("m", m [("a", m [("n", .or [(1, str "p"), (0, str "q")])])]),
      ("out", pk (p ["m"]) .hole (atc .hole [str "n"]))], dm []),
    ([], m [("d", pk (lst [str "a"]) (m [("x", int 1)]) (m [("y", int 2)]))], dm []),
    ([], m [("m", m [("a", .lit (.bool true))]), ("out", pk (p ["m"]) .hole .hole)], dm []),
    ([], m [("out", pk (int 1) .hole (atc .hole [str "n"]))], dm []),
    ([], m [("m", m [("a", m [("n", int 1)])]), ("out", pk (p ["m"]) .hole (atc .hole [str "gone"]))], dm []),
    ([], m [("m", m [("a", m [("n", str "x")])]),
      ("out", pk (p ["m"]) .hole (.call .maybe [atc .hole [str "gone"]]))], dm []),
    ([], m [("m", m [("a", m [("n", str "x")])]),
      ("out", pk (p ["m"]) .hole (.call .maybe [atc .hole [str "n"]]))], o1 (dm [("x", dm [("n", js "x")])])),
    ([], m [("m", m [("a", m [("n", str "p")]), ("b", hide (m [("n", str "q")]))]),
      ("out", pk (p ["m"]) .hole (atc .hole [str "n"]))], o1 (dm [("p", dm [("n", js "p")])])),
    ([], m [("m", m [("a", m [("n", hide (str "p")), ("v", int 1)])]),
      ("out", pk (p ["m"]) .hole (atc .hole [str "n"]))], o1 (dm [("p", dm [("v", j 1)])])),
    ([], m [("m", m [("a", m [("n", type (str "p")), ("v", int 1)])]),
      ("out", pk (p ["m"]) (atc .hole [str "v"]) (atc .hole [str "n"]))], o1 (dm [("p", j 1)])),
    ([], m [("g", m [("x", m [("items", lst [m [("id", str "p")], m [("id", str "q")]])])]),
      ("out", .call .pack [p ["g"], pk (atc .hole [str "items"]) (int 1) (atc .hole [str "id"])])],
      o1 (dm [("x", dm [("p", j 1), ("q", j 1)])])),
    ([], m [("xs", lst [m [("kids", lst [m [("n", str "a")]])], m [("kids", lst [m [("n", str "b")]])]]),
      ("out", .call .each [p ["xs"], pk (atc .hole [str "kids"]) .hole (atc .hole [str "n"])])],
      o1 (jl [dm [("a", dm [("n", js "a")])], dm [("b", dm [("n", js "b")])]])),
    ([], m [("xs", lst [m [("n", str "a"), ("v", int 1)]]), ("out", pk (p ["xs"]) (atc .hole [str "v"]) (atc .hole [str "n"])),
      ("e", p ["out", "a"])], dm [("e", j 1)]),
    ([], m [("xs", lst [m [("n", str "a"), ("v", int 1)]]), ("out", pk (p ["xs"]) (atc .hole [str "v"]) (atc .hole [str "n"])),
      ("e", p ["out", "a"])], dm [("e", j 2)]),
    ([], m [("m", ab), ("out", .call .pack [p ["m"], .hole, str "k", int 3])], dm [])]

theorem packKeyCases_checkable : ∀ c ∈ packKeyCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem pack_key_verdict_exact : ∀ c ∈ packKeyCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (packKeyCases_checkable c hc).1 (packKeyCases_checkable c hc).2 v

/-- The rows of `pack` with a key, numbered from pk0, in `oracle paths`. -/
def packKeyRows : IO Unit := do
  IO.println "# pack(d, t, k), each member's child under the string k answers for it, follows"
  IO.println "# in rows pk0 on: k read where the child would stand under the member's own key,"
  IO.println "# _ the member, key(0) its key in a map or its position in a list, key() the"
  IO.println "# call's own; t reading key(0) as the key k answered; keys that collide met; and"
  IO.println "# an error for a key that is no string or that k refuses itself."
  pathRows "pk" packKeyCases
