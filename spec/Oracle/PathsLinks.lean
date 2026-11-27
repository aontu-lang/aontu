import Oracle.Base
-- For order only: the four largest modules each need several gigabytes, so they build one at a time.
import Oracle.PathsRefs

/-! The oracle's cases: PathsLinks, split out of `Oracle.lean` so that each area builds on its own. -/

open Aontu
open Case

/-- Paths into what a call over a path makes, which resolve a round after
the call's path does: a name's spellings, two chained, two lists added
and a string split, beside data that agrees and data that refuses; a
key the call doesn't make; a preference of a path's map; a call, and a
call around it, waiting on a path the round before didn't reach where a
path first reaches them; and paths to a call's and a generator's own
value, among them generators whose template hides a member, at a list's
position, in a map and as the whole template, whose own value keeps the
member hidden however a path copies it, and where the member is a map's,
the copy shows it. A list holds no position for a marked element, so a
copy has none to show: of a list template, of an instance, of a list a
fold reads, or of the instances a mark around the whole template
leaves out. A preference in such a copy is the copy's own, so the
value it copies keeps its hidden member, which the copy shows. -/
def roundCases : List (Decls × Val × Data) :=
  let str (t : String) : Val := .lit (.str t)
  let nm (v : Val) : Val := .call .nom [v]
  let one : List (String × Val) := [("a", str "ab_cd"), ("b", nm (p ["a"])), ("c", p ["b", "camel"])]
  let two : List (String × Val) := one ++ [("d", nm (p ["c"])), ("e", p ["d", "snake"])]
  let sum : List (String × Val) :=
    [("a", lst [int 1]), ("b", .call .plus [p ["a"], lst [int 2]]), ("c", .path [.key "b", .idx 1])]
  let cut : List (String × Val) :=
    [("a", str "x,y"), ("b", .call .split [p ["a"], str ","]), ("c", .path [.key "b", .idx 1])]
  let pr : List (String × Val) := [("a", m [("x", int 1)]), ("b", .call .pref [p ["a"]]), ("c", p ["b", "x"])]
  let late : List (String × Val) :=
    [("a", str "ab_cd"), ("u", nm (p ["a"])), ("b", m [("x", nm (p ["u", "camel"]))]), ("c", p ["b", "x"])]
  let nested : List (String × Val) := [("a", str "ab_cd"), ("u", nm (p ["a"])),
    ("b", m [("x", .call .upper [.call .nom [p ["u", "camel"], str "snake"]])]), ("c", p ["b", "x"])]
  let hd (v : Val) : Val := .ride .hide v []
  let el : Val := .call .each [lst [int 1, int 2], lst [hd .hole, .hole]]
  let em : Val := .call .each [lst [int 1], m [("a", hd .hole), ("b", .hole)]]
  let pk : Val := .call .pack [lst [str "a"], hd .hole]
  let held : Val := m [("a", .or [(1, m [("b", hd (int 1)), ("c", int 2)]), (0, m [])]),
    ("k", .call .sum [lst [int 1, int 2]])]
  let held5 : Val := m [("a", .or [(1, m [("b", hd (int 1)), ("c", int 2)]), (0, int 5)]),
    ("k", .call .sum [lst [int 1, int 2]])]
  [([], m one, .map []),
    ([], m one, .map [("c", .str "abCd")]),
    ([], m one, .map [("c", .str "x")]),
    ([], m one, .map [("b", .map [("camel", .str "x")])]),
    ([], m two, .map []),
    ([], m two, .map [("e", .str "ab_cd")]),
    ([], m two, .map [("e", .str "x")]),
    ([], m sum, .map []),
    ([], m sum, .map [("c", j 2)]),
    ([], m sum, .map [("c", j 3)]),
    ([], m cut, .map []),
    ([], m cut, .map [("c", .str "z")]),
    ([], m [("a", str "ab_cd"), ("b", nm (p ["a"])), ("c", p ["b", "nope"])], .map []),
    ([], m pr, .map []),
    ([], m pr, .map [("c", j 2)]),
    ([], m late, .map []),
    ([], m late, .map [("c", .map [("snake", .str "ab_cd")])]),
    ([], m late, .map [("c", .map [("snake", .str "x")])]),
    ([], m nested, .map [("c", .str "AB_CD")]),
    ([], m [("a", str "ab_cd"), ("b", nm (p ["a"])), ("c", p ["b"])], .map []),
    ([], m [("a", str "ab_cd"), ("b", nm (p ["a"])), ("c", p ["b"])], .map [("c", .map [("camel", .str "x")])]),
    ([], m [("l", lst [int 1, int 2]), ("e", .call .each [p ["l"], m [("v", .hole)]]), ("c", p ["e"])], .map []),
    ([], m [("l", lst [int 1, int 2]), ("e", .call .each [p ["l"], m [("v", .hole)]]),
      ("c", .path [.key "e", .idx 1, .key "v"])], .map [("c", j 2)]),
    ([], m [("x", el), ("v", p ["x"])], .map [("x", .list [.list [j 1], .list [j 2]]),
      ("v", .list [.list [j 1, j 1], .list [j 2, j 2]])]),
    ([], m [("x", em), ("v", p ["x"])], .map [("x", .list [.map [("b", j 1)]]),
      ("v", .list [.map [("a", j 1), ("b", j 1)]])]),
    ([], m [("x", em), ("v", p ["x"])], .map [("x", .list [.map [("b", j 1)]]),
      ("v", .list [.map [("b", j 1)]])]),
    ([], m [("x", pk), ("v", p ["x"])], .map [("x", .map []), ("v", .map [("a", .str "a")])]),
    ([], m [("x", pk), ("v", p ["x"])], .map [("x", .map []), ("v", .map [])]),
    ([], m [("x", el), ("v", p ["x"])], .map [("x", .list [.list [j 1], .list [j 2]]),
      ("v", .list [.list [j 1], .list [j 2]])]),
    ([], m [("x", el), ("v", p ["x"])], .map [("x", .list [.list [j 1], .list [j 2]]),
      ("v", .list [.list [j 1, j 3], .list [j 2, j 3]])]),
    ([], m [("x", .call .each [lst [int 1], lst [hd .hole, .hole]]), ("v", p ["x"]),
      ("w", .path [.key "x", .idx 0])],
      .map [("x", .list [.list [j 1]]), ("v", .list [.list [j 1]]), ("w", .list [j 1])]),
    ([], m [("x", .call .sum [lst [hd (int 1), int 2]]), ("v", p ["x"])], .map [("x", j 2), ("v", j 2)]),
    ([], m [("x", .call .sum [lst [hd (int 1), int 2]]), ("v", p ["x"])], .map [("x", j 2), ("v", j 3)]),
    ([], m [("x", .call .each [lst [int 1], hd (lst [.hole, .hole])]), ("v", p ["x"])],
      .map [("x", .list []), ("v", .list [])]),
    ([], m [("x", held), ("v", p ["x"])],
      .map [("x", .map [("a", .map [("c", j 2)]), ("k", j 3)]),
        ("v", .map [("a", .map [("b", j 1), ("c", j 2)]), ("k", j 3)])]),
    ([], m [("x", held5), ("v", p ["x"])],
      .map [("x", .map [("a", .map [("c", j 2)]), ("k", j 3)]), ("v", .map [("a", .map [("c", j 2)]), ("k", j 3)])])]

theorem roundCases_checkable : ∀ c ∈ roundCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem round_verdict_exact : ∀ c ∈ roundCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (roundCases_checkable c hc).1 (roundCases_checkable c hc).2 v

/-- `relate` of a path value: its template met into the target, beside
data that agrees with it, data that refuses it and data that writes the
link as a string; a template that clashes with the target; no
template; a target that names nothing, one only the data supplies, a
relative one, one that climbs past the top, a scalar and a list
element; a string where an address must be; a link with no address;
a link in a body, used and not, read at the body's own place; a
template whose marks the flow clears, at its top and inside it; and
links whose templates make each other's targets, in either order,
three deep, from a body, under data a template refuses, and in a cycle
that makes neither; and a link in a preference arm its peer refuses,
beside an arm whose link stands, with a third arm or without, whose
template doesn't reach the target, since the arm is dead, so a target
or a standing template that refuses it is no clash (#637); and the same
link in a lone preference's own value, which its peer refuses, so the
preference stands as its parent type, which holds no link (#641). -/
def referCases : List (Decls × Val × Data) :=
  let rf0 (a : Val) : Val := .meet (.call .relate []) a
  let a1 : Val := m [("p", int 1)]
  let r3 : Val := rf (m [("r", int 3)]) (ad 0 ["a"])
  let svc (t : Val) : Val := m [("s", m [("auth", m [("k", int 1)]), ("billing", m [("dep", rf t (ad 2 ["auth"]))])])]
  let k1 : Val := m [("k", int 1)]
  let x2 : Val := rf (m [("p", int 1)]) (ad 0 ["h", "z"])
  let y2 : Val := rf (m [("z", m [])]) (ad 0 ["h"])
  let kd1 (t : Val) : Val := .map [("k", false, int 1), ("d", true, .call .relate [t])] none false
  let kd2 (t : Val) : Val := .map [("k", false, int 2), ("d", true, .call .relate [t])] none false
  let peer : Val := m [("k", int 2), ("d", ad 0 ["y"])]
  [([], m [("a", a1), ("b", r3)], .map []),
    ([], m [("a", a1), ("b", r3)], .map [("a", .map [("r", j 3)])]),
    ([], m [("a", a1), ("b", r3)], .map [("a", .map [("r", j 4)])]),
    ([], m [("a", a1), ("b", r3)], .map [("b", .str "$.a")]),
    ([], m [("a", a1), ("b", rf (m [("p", int 2)]) (ad 0 ["a"]))], .map []),
    ([], m [("a", a1), ("b", rf0 (ad 0 ["a"]))], .map []),
    ([], m [("a", m [("p", .integer)]), ("b", rf (m [("p", int 1)]) (ad 0 ["a"]))], .map []),
    ([], m [("a", m [("p", .integer)]), ("b", rf (m [("p", int 1)]) (ad 0 ["a"]))], .map [("a", .map [("p", j 2)])]),
    ([], m [("b", rf0 (ad 0 ["gone"]))], .map []),
    ([], m [("a", m []), ("b", rf0 (ad 0 ["a", "x"]))], .map [("a", .map [("x", j 1)])]),
    ([], svc (m [("m", int 2)]), .map []),
    ([], svc (m [("m", int 2)]), .map [("s", .map [("auth", .map [("m", j 3)])])]),
    ([], m [("b", rf0 (ad 3 ["a"]))], .map []),
    ([], m [("a", int 1), ("b", rf0 (ad 2 ["a"]))], .map []),
    ([], m [("a", a1), ("b", rf .integer (ad 0 ["a", "p"]))], .map []),
    ([], m [("a", a1), ("b", rf .string (ad 0 ["a", "p"]))], .map []),
    ([], m [("a", .list [int 1, int 2] none false), ("b", rf .integer (ad 0 ["a", "1"]))], .map []),
    ([], m [("a", .list [int 1, int 2] none false), ("b", rf .string (ad 0 ["a", "1"]))], .map []),
    ([], m [("a", .list [int 1, int 2] none false), ("b", rf0 (ad 0 ["a", "5"]))], .map []),
    ([], m [("a", int 1), ("b", .meet (.call .relate []) (.lit (.str "$.a")))], .map []),
    ([], m [("b", .call .relate [])], .map []),
    ([("L", r3)], m [("a", a1), ("b", .alias "L")], .map []),
    ([("L", r3)], m [("a", a1), ("b", .alias "L")], .map [("a", .map [("r", j 4)])]),
    ([("L", r3)], m [("a", a1)], .map [("a", .map [("r", j 4)])]),
    ([("L", rf0 (ad 1 ["auth"]))], m [("auth", m [("k", int 1)])], .map []),
    ([("L", rf0 (ad 1 ["auth"]))], m [("s", m [("auth", m [("k", int 1)]), ("b", .alias "L")])], .map []),
    ([("L", rf (type k1) (ad 0 ["a"]))], m [("a", m [])], .map []),
    ([("L", rf (hide k1) (ad 0 ["a"]))], m [("a", m [])], .map []),
    ([("L", rf (m [("x", type k1)]) (ad 0 ["a"]))], m [("a", m [])], .map [("a", .map [])]),
    ([("L", rf (type k1) (ad 0 ["a"]))], m [("a", m [])], .map [("a", .map [("k", j 1)])]),
    ([], m [("h", m []), ("y", y2), ("x", .meet (.call .relate [m [("p", int 1)]]) (rf (m [("q", int 2)]) (ad 0 ["h", "z"])))],
      .map []),
    ([], m [("x", x2), ("h", m []), ("y", y2)], .map []),
    ([], m [("x", x2), ("h", m []), ("y", y2)], .map [("h", .map [("z", .map [("p", j 2)])])]),
    ([], m [("v", rf (m [("q", int 1)]) (ad 0 ["h", "z", "w", "u"])), ("x", rf (m [("u", m [])]) (ad 0 ["h", "z", "w"])),
      ("h", m []), ("y", rf (m [("z", m [("w", m [])])]) (ad 0 ["h"]))], .map []),
    ([("L", y2)], m [("h", m []), ("x", x2)], .map []),
    ([], m [("h", m []), ("x", rf (m [("p", m [])]) (ad 0 ["h", "q"])), ("y", rf (m [("q", m [])]) (ad 0 ["h", "p"]))],
      .map []),
    ([], m [("x", .meet (.or [(1, kd1 (m [("z", int 1)])), (0, kd2 (m [("w", int 2)]))]) peer),
      ("y", m [("z", int 2)])], .map []),
    ([], m [("x", .meet (.or [(1, kd1 (m [("z", int 1)])), (0, kd2 (m [("z", int 2)]))]) peer), ("y", m [])],
      .map []),
    ([], m [("x", .meet (.or [(1, kd1 (m [("z", int 1)])), (0, kd2 (m [("w", int 2)])), (0, .lit (.str "s"))]) peer),
      ("y", m [("z", int 2)])], .map []),
    ([], m [("x", .meet (.pref 1 (kd1 (m [("z", int 1)]))) peer), ("y", m [("z", int 2)])], .map []),
    ([], m [("x", .meet (.pref 1 (kd1 (m [("z", int 1)]))) (m [("k", int 1), ("d", ad 0 ["y"])])),
      ("y", m [("z", .integer)])], .map []),
    ([], m [("x", .meet (.pref 1 (kd1 (m [("z", int 1)]))) (m [("k", int 1), ("d", ad 0 ["y"])])), ("y", m [])],
      .map [("y", .map [("z", j 2)])]),
    ([], m [("x", .pref 1 (m [("d", rf (m [("z", int 1)]) (ad 0 ["y"]))])), ("y", m [("z", .integer)])], .map []),
    ([], m [("x", .or [(1, m [("d", rf (m [("z", int 1)]) (ad 0 ["y"]))]), (0, m [("e", int 1)])]),
      ("y", m [("z", .integer)])], .map []),
    ([], m [("x", .meet (.pref 1 (m [("d", rf (m [("z", int 1)]) (ad 0 ["y"]))])) (m [("d", ad 0 ["w"])])),
      ("y", m [("z", .integer)]), ("w", m [])], .map []),
    ([], m [("x", .meet (.or [(0, m [("d", rf (m [("z", int 1)]) (ad 0 ["y"])), ("k", int 1)]), (0, m [("k", int 2)])])
        (m [("k", int 2)])), ("y", m [("z", .integer)])], .map []),
    ([], m [("x", .meet (.or [(0, m [("k", int 1)]), (0, m [("k", int 2)])])
        (m [("d", rf (m [("z", int 1)]) (ad 0 ["y"]))])), ("y", m [("z", .integer)])],
      .map [("x", .map [("k", j 1)])]),
    ([], m [("w", .or [(1, m [("d", rf (m [("z", int 1)]) (ad 0 ["y"]))]), (0, m [("e", int 1)])]),
      ("x", .path [.key "w"]), ("y", m [("z", .integer)])], .map []),
    ([], m [("x", .meet (.or [(0, .map [("d", true, .call .relate [m [("z", int 1)]])] none false),
        (0, .map [("d", true, .call .relate [m [("z", int 2)]])] none false)]) (m [("d", ad 0 ["y"])])),
      ("y", m [("z", .integer)])], .map []),
    ([], m [("x", .meet (.or [(1, m [("k", int 1)]), (0, m [("k", int 2), ("d", rf (m [("z", int 1)]) (ad 0 ["y"]))])])
        (m [("k", int 2)])), ("y", m [("z", .integer)])], .map []),
    ([], m [("x", .select (.lit (.str "a")) [(.lit (.str "a"), m [("d", rf (m [("z", int 1)]) (ad 0 ["y"]))]),
        (.lit (.str "b"), m [("d", rf (m [("z", int 2)]) (ad 0 ["y"]))])] none), ("y", m [("z", .integer)])], .map []),
    ([], m [("x", .select (.lit (.str "c")) [(.lit (.str "a"), m [("d", rf (m [("z", int 1)]) (ad 0 ["y"]))])]
        (some (m [("d", rf (m [("z", int 2)]) (ad 0 ["y"]))]))), ("y", m [("z", .integer)])], .map []),
    ([], m [("x", .select (.lit (.str "a")) [(.lit (.str "a"), m [("d", rf (m [("z", int 1)]) (ad 0 ["y"]))]),
        (.lit (.str "b"), m [("d", rf (m [("z", int 2)]) (ad 0 ["y"]))])] none), ("y", m [])],
      .map [("y", .map [("z", j 2)])]),
    ([], m [("x", .meet (.call .pack [.list [.lit (.str "a")] none false, m [("d", rf (m [("z", int 1)]) (ad 0 ["y"]))]])
        (m [("b", m [("d", ad 0 ["w"])])])), ("y", m [("z", .integer)]), ("w", m [("z", .integer)])], .map []),
    ([], m [("x", .call .pack [.list [.lit (.str "a")] none false, m [("d", rf (m [("n", .keyUp 2)]) (ad 0 ["y"]))]]),
        ("y", m [("n", .string)])], .map []),
    ([], m [("x", .call .each [.list [int 1] none false, m [("d", rf (m [("v", .hole)]) (ad 0 ["y"]))]]),
        ("y", m [("v", .integer)])], .map []),
    ([("B", .call .each [.list [int 1] none false, m [("d", rf (m [("z", int 1)]) (ad 0 ["y"]))]])],
      m [("y", m [("z", .integer)])], .map []),
    ([], m [("x", .or [(1, m [("d", rf (m [("z", int 1)]) (ad 0 ["y"]))]), (0, m [("d", rf (m [("z", int 2)]) (ad 0 ["y"]))])]),
      ("y", m [])], .map []),
    ([], m [("x", .or [(1, m [("d", rf (m [("z", int 1)]) (ad 0 ["y"]))]), (0, m [("d", rf (m [("z", int 2)]) (ad 0 ["y"]))])]),
      ("y", m [])], .map [("y", .map [("z", j 2)])]),
    ([], m [("x", .or [(0, rf0 (ad 0 ["gone"])), (0, int 1)])], .map []),
    ([], m [("x", .or [(1, rf0 (ad 0 ["gone"])), (0, int 1)])], .map []),
    ([], m [("x", .or [(0, rf0 (ad 0 ["gone"])), (1, int 1)])], .map []),
    ([], m [("c", .path [.key "a"]), ("a", m []), ("b", rf k1 (ad 0 ["a"]))], .map [("c", .map [("k", j 2)])]),
    ([], m [("c", .path [.key "a", .key "k"]), ("a", m []), ("b", rf k1 (ad 0 ["a"]))], .map []),
    ([], m [("c", .path [.key "a", .key "k"]), ("a", m []), ("b", rf k1 (ad 0 ["a"]))], .map [("c", j 2)]),
    ([], m [("x", .or [(1, m [("d", rf (m [("z", int 1)]) (ad 0 ["y"]))]), (2, m [("d", rf (m [("z", int 2)]) (ad 0 ["y"]))])]),
      ("y", m [])], .map []),
    ([], m [("s", rf (m [("k", int 1)]) (.path [.key "later"])), ("later", ad 0 ["a"]), ("a", m [])], .map []),
    ([], m [("s", rf (m [("n", rf k1 (ad 0 ["t2"]))]) (ad 0 ["t1"])), ("t1", m []), ("t2", m [("k", int 2)])],
      .map []),
    ([], m [("s", rf (m [("n", rf k1 (ad 0 ["t2"]))]) (ad 0 ["t1"])), ("t1", m []), ("t2", m [])], .map []),
    ([], m [("s", rf (m [("n", rf k1 (ad 0 ["t2"]))]) (ad 0 ["t1"])), ("t1", m []), ("t2", m [])],
      .map [("t2", .map [("k", j 2)])]),
    ([], m [("s", rf (m [("n", rf (m [("n", rf k1 (ad 0 ["t3"]))]) (ad 0 ["t2"]))]) (ad 0 ["t1"])),
        ("t1", m []), ("t2", m []), ("t3", m [("k", int 2)])], .map []),
    ([], m [("a", m []), ("y", m []), ("x", rf (m [("d", rf (m [("z", int 1)]) (ad 0 ["y"]))]) (ad 0 ["a"])),
        ("w", rf (m [("d", rf (m [("z", int 2)]) (ad 0 ["y"]))]) (ad 0 ["a"]))], .map []),
    ([], m [("a", m []), ("y", m []), ("x", rf (m [("d", rf (m [("z", int 1)]) (ad 0 ["y"]))]) (ad 0 ["a"])),
        ("w", rf (m [("d", rf (m [("z", int 1)]) (ad 0 ["y"]))]) (ad 0 ["a"]))], .map []),
    ([], m [("s", rf (m [("n", rf0 (ad 0 ["gone"]))]) (ad 0 ["t1"])), ("t1", m [])], .map []),
    ([], m [("a", m []), ("b", rf (m [("l", .list [int 1] none false)]) (ad 0 ["a"])),
        ("x", .call .each [.path [.key "a", .key "l"], rf (m [("v", .hole)]) (ad 0 ["y"])]), ("y", m [])], .map []),
    ([], m [("a", m []), ("b", rf (m [("l", .list [int 1] none false)]) (ad 0 ["a"])),
        ("x", .call .each [.path [.key "a", .key "l"], rf (m [("v", .hole)]) (ad 0 ["y"])]),
        ("y", m [("v", int 2)])], .map []),
    ([], m [("s", rf (int 1) (ad 0 ["s"])), ("u", .call .relate [])], .map []),
    ([], m [("s", rf (int 1) (ad 0 ["s"]))], .map []),
    ([], m [("s", rf (m [("n", rf (int 1) (ad 0 ["t", "n"]))]) (ad 0 ["t"])), ("t", m [])], .map []),
    ([("T", m [("m", m []), ("n", rf k1 (ad 1 ["m"]))])], m [], .map []),
    ([("T", m [("m", m [("k", int 2)]), ("n", rf k1 (ad 1 ["m"]))])], m [], .map []),
    ([("T", m [("m", m []), ("n", rf k1 (ad 1 ["m"]))])], m [("x", .alias "T")], .map []),
    ([("T", m [("m", m []), ("n", rf k1 (ad 1 ["m"])), ("o", rf (m [("k", int 2)]) (ad 1 ["m"]))])], m [], .map []),
    ([("T", m [("m", m []), ("n", rf k1 (ad 1 ["m"])), ("o", rf (m [("j", int 2)]) (ad 1 ["m"]))])], m [], .map []),
    ([], m [("b", .call .relate [m [("r", int 3)]]), ("a", m [])],
      .map [("b", .addr ⟨0, ["a"]⟩), ("a", .map [("p", j 1), ("r", j 4)])]),
    ([], m [("b", .call .relate [m [("r", int 3)]]), ("a", m [])],
      .map [("b", .addr ⟨0, ["a"]⟩), ("a", .map [("p", j 1), ("r", j 3)])]),
    ([], m [("b", .call .relate [m [("r", int 3)]]), ("a", m [])],
      .map [("b", .addr ⟨0, ["a"]⟩), ("a", .map [("p", j 1)])]),
    ([], m [("b", .call .relate [m [("r", int 3)]]), ("a", m [])], .map [("b", .addr ⟨0, ["nope"]⟩), ("a", .map [])]),
    ([], m [("b", .or [(0, rf (m [("r", int 3)]) (ad 0 ["a"])), (0, int 2)]), ("a", m [])],
      .map [("b", j 2), ("a", .map [("r", j 4)])]),
    ([], m [("b", .or [(0, rf (m [("r", int 3)]) (ad 0 ["a"])), (0, int 2)]), ("a", m [])],
      .map [("a", .map [("r", j 4)])])]

theorem referCases_checkable : ∀ c ∈ referCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem refer_verdict_exact : ∀ c ∈ referCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (referCases_checkable c hc).1 (referCases_checkable c hc).2 v

/-- `relate` over each shape of value: one address, a list, a map, a map
and a list nested in each other, and none, an empty list and an empty
map; its template met into each target, beside data that refuses it,
and a template that refuses a target; a leaf that names nothing, a
leaf that isn't an address, and a string or `true` where an address
must be; data that writes the addresses as strings or a number; a
relation with no value, required and optional, and one met with
`path`; the value from a second meet; two relations' templates at one
field; a relation in a body no reference reads; a relation's template
making another relation's target, and one relation's leaf making its
own other leaf's target, each beside data the flow refuses; a
`relate` over a path and one over a list at one target; and a relation with no template,
an empty list, a list of a number and a list of a hole for its
template, beside data that writes a string, a number, a list of
each, an empty list, and no value, which refuses all but the empty
list and the absent value. -/
def relCases : List (Decls × Val × Data) :=
  let lst (vs : List Val) : Val := .list vs none false
  let rl (t : Val) (v : Val) : Val := .meet (.call .relate [t]) v
  let rl0 (v : Val) : Val := .meet (.call .relate []) v
  let svc : Val := m [("kind", str "svc")]
  let chain : Val := m [("x", rl (m [("p", int 1)]) (lst [ad 0 ["h", "z"]])), ("h", m []),
    ("y", rl (m [("z", m [])]) (lst [ad 0 ["h"]]))]
  let own : Val := m [("h", m []), ("d", rl (m [("z", m [])]) (lst [ad 0 ["h"], ad 0 ["h", "z"]]))]
  [([], m [("p", m [("k", int 1)]), ("q", m [("h", rl0 (ad 0 ["p"]))])], .map []),
    ([], m [("a", m []), ("b", m []), ("s", m [("d", rl0 (lst [ad 0 ["a"], ad 0 ["b"]]))])], .map []),
    ([], m [("a", m []), ("s", m [("u", rl0 (m [("primary", ad 0 ["a"])]))])], .map []),
    ([], m [("a", m []), ("s", m [("u", rl0 (m [("t1", m [("primary", ad 0 ["a"])])]))])], .map []),
    ([], m [("a", m []), ("d", rl0 (lst [lst [ad 0 ["a"]]]))], .map []),
    ([], m [("a", m []), ("d", rl0 (m [("x", lst [ad 0 ["a"]])]))], .map []),
    ([], m [("a", m []), ("b", m []), ("s", m [("d", rl svc (lst [ad 0 ["a"], ad 0 ["b"]]))])], .map []),
    ([], m [("a", m []), ("b", m []), ("s", m [("d", rl svc (lst [ad 0 ["a"], ad 0 ["b"]]))])],
      .map [("b", .map [("kind", .str "db")])]),
    ([], m [("a", m [("kind", str "db")]), ("s", m [("d", rl svc (lst [ad 0 ["a"]]))])], .map []),
    ([], m [("a", m []), ("s", m [("d", rl0 (lst [ad 0 ["a"], ad 0 ["nosuch"]]))])], .map []),
    ([], m [("a", m []), ("d", rl0 (lst [ad 0 ["a"], int 7]))], .map []),
    ([], m [("a", m []), ("d", rl0 (str "x"))], .map []),
    ([], m [("a", m []), ("s", m [("d", .call .relate [])])], .map [("s", .map [("d", .list [.str "$.a"])])]),
    ([], m [("a", m []), ("s", m [("d", .call .relate [])])], .map [("s", .map [("d", j 7)])]),
    ([], m [("d", .call .relate [])], .map []),
    ([], .map [("d", true, .call .relate [])] none false, .map []),
    ([], m [("a", m []), ("d", rl0 (lst []))], .map []),
    ([], m [("a", m []), ("d", rl0 (m []))], .map []),
    ([], m [("x", m []), ("s", .meet (m [("d", .call .relate [])]) (m [("d", lst [ad 0 ["x"]])]))], .map []),
    ([], m [("x", m []), ("s", m [("d", .meet (.call .relate [m [("p", int 1)]]) (rl (m [("q", int 2)]) (lst [ad 0 ["x"]])))])],
      .map [("x", .map [("p", j 1), ("q", j 3)])]),
    ([("L", rl (m [("k", int 1)]) (lst [ad 0 ["a"]]))], m [("a", m [])], .map [("a", .map [("k", j 2)])]),
    ([], chain, .map []),
    ([], chain, .map [("h", .map [("z", .map [("p", j 2)])])]),
    ([], own, .map []),
    ([], own, .map [("h", .map [("z", .map [("z", j 5)])])]),
    ([], m [("a", m []), ("d", .meet (.call .relate []) .pathKind)], .map []),
    ([], m [("a", m []), ("b", .meet (.call .relate [m [("p", int 1)]]) (ad 0 ["a"])),
      ("d", rl (m [("q", int 2)]) (lst [ad 0 ["a"]]))], .map [("a", .map [("p", j 1), ("q", j 2)])]),
    ([], m [("a", m []), ("d", rl0 (.lit (.bool true)))], .map [])] ++
  ([[], [lst []], [lst [int 1]], [lst [.hole]]].flatMap fun t =>
    [some (.str "x"), some (j 3), some (.list [j 1]), some (.list [.str "a"]), some (.list []), none].map
      fun d => ([], m [("v", .call .relate t)], match d with | some x => .map [("v", x)] | none => .map [])) ++
  [([], m [("later", ad 0 ["a"]), ("a", m []), ("s", rl (m [("k", int 1)]) (lst [.path [.key "later"]]))], .map []),
    ([], m [("later", ad 0 ["a"]), ("a", m []), ("s", rl (m [("k", int 1)]) (lst [.path [.key "later"]]))],
      .map [("a", .map [("k", j 2)])])]

theorem relCases_checkable : ∀ c ∈ relCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem rel_verdict_exact : ∀ c ∈ relCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (relCases_checkable c hc).1 (relCases_checkable c hc).2 v

/-- A constraint met with `relate()` before its value meets the relation's
value as any meet does (decision 25 of the design note's §7), in either
grouping: `path` refuses the list, as it does met with the list first,
and `string` refuses it too; a size holds of the list, not of each leaf,
written before the value and after it, beside a template that flows;
and `path` met with a single address, which it admits. A constraint on
each leaf is the value's spread, which holds a leaf another list brings
as it holds its own, and each such leaf is a link: the template flows
into a target only that list names, in a list and in a map, where the
data refuses it or admits it, a target that names nothing is an error,
and an address as the spread holds each leaf under it. -/
def relHeldCases : List (Decls × Val × Data) :=
  let ad (ks : List String) : Val := .addr ⟨0, ks⟩
  let r0 : Val := .call .relate []
  let rk : Val := .call .relate [m [("k", int 1)]]
  let la : Val := .list [ad ["a"]] none false
  let doc (v : Val) : Val := m [("a", m []), ("r", v)]
  [([], doc (.meet (.meet r0 .pathKind) la), .map []),
    ([], doc (.meet r0 (.meet la .pathKind)), .map []),
    ([], doc (.meet (.meet r0 .string) la), .map []),
    ([], doc (.meet (.meet r0 (.len (.min (nb 1)))) la), .map []),
    ([], doc (.meet (.meet r0 (.len (.min (nb 2)))) la), .map []),
    ([], doc (.meet (.meet r0 la) (.len (.min (nb 2)))), .map []),
    ([], doc (.meet (.meet rk (.len (.min (nb 1)))) la),
      .map [("a", .map [("k", j 2)])]),
    ([], doc (.meet (.meet r0 .pathKind) (ad ["a"])), .map []),
    ([], doc (.meet (.meet rk (.list [] (some .pathKind) false)) la), .map [("a", .map [("k", j 2)])]),
    ([], doc (.meet (.meet rk (.list [] (some .pathKind) false)) la), .map [("a", .map [("k", j 1)])]),
    ([], doc (.meet rk (.list [ad ["a"]] (some .pathKind) false)), .map [("a", .map [("k", j 2)])]),
    ([], doc (.meet (.meet rk (.map [] (some .pathKind) false)) (m [("x", ad ["a"])])),
      .map [("a", .map [("k", j 2)])]),
    ([], doc (.meet (.meet r0 (.list [] (some .pathKind) false)) (.list [ad ["noa"]] none false)), .map []),
    ([], m [("s", m [("a", m [])]), ("r", .meet (.meet rk (.list [] (some (ad ["s"])) false))
        (.list [ad ["s", "a"]] none false))], .map [("s", .map [("a", .map [("k", j 2)])])])]

theorem relHeldCases_checkable : ∀ c ∈ relHeldCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem rel_held_verdict_exact : ∀ c ∈ relHeldCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (relHeldCases_checkable c hc).1 (relHeldCases_checkable c hc).2 v

/-- Links read where they land: a `relate` in a `type()` that a path
reference copies, beside a target the template admits, one it refuses,
one that names nothing and data that refuses the template; a `relate` in
a spread's template, at a target that names nothing, and beside data
the template's flow refuses and none; a `relate` over a list in a `type()` that a path
reference copies, at a target, one that names nothing and beside data
that refuses its template; a path reference to a link and to a map
holding one, and one to a map holding a link to nothing; a relative
link in a spread's template, read from each member it lands at, beside
data the flow refuses; a list's spread holding a link that a path
reference copies; and a relative link a path reference copies, read from
where the copy stands: at the root with no target there, with one, and
with one its template refuses, a hidden body used beside a peer its
template refuses, a type whose copy meets data at its own target, an
address that climbs past the root where the copy stands, and a recursive
name whose link's template is a disjunction with the name. -/
def landCases : List (Decls × Val × Data) :=
  let lst (vs : List Val) : Val := .list vs none false
  let k1 : Val := m [("k", int 1)]
  let K := type (m [("k", .integer)])
  let T := type (m [("p", .call .relate [p ["K"]])])
  let sp := ms [("s1", m []), ("s2", m [])] (m [("d", rf k1 (ad 0 ["a"]))])
  let Srel (t : List Val) := type (.map [("dependsOn", true, .call .relate t)] none false)
  let jobs := ms [("a", m []), ("b", m [])] (m [("feeds", rf (m [("kind", str "job")]) (ad 2 ["b"]))])
  let lnk := m [("target", m []), ("link", rf k1 (ad 1 ["target"]))]
  let N := type (m [("N", m [("other", m []), ("next", rf k1 (ad 1 ["other"]))])])
  [([], m [("K", K), ("T", T), ("svc", k1), ("x", .meet (p ["T"]) (m [("p", ad 0 ["svc"])]))], .map []),
    ([], m [("K", K), ("T", T), ("svc", m [("k", str "no")]), ("x", .meet (p ["T"]) (m [("p", ad 0 ["svc"])]))], .map []),
    ([], m [("K", K), ("T", T), ("x", .meet (p ["T"]) (m [("p", ad 0 ["nosuch"])]))], .map []),
    ([], m [("T", type (m [("p", .call .relate [k1])])), ("svc", m []), ("x", .meet (p ["T"]) (m [("p", ad 0 ["svc"])]))],
      .map [("svc", .map [("k", j 2)])]),
    ([], m [("T", ms [("s1", m [])] (m [("d", .meet (.call .relate []) (ad 0 ["nosuch"]))]))], .map []),
    ([], m [("a", m []), ("T", sp)], .map [("a", .map [("k", j 2)])]),
    ([], m [("a", m []), ("T", sp)], .map []),
    ([], m [("S", Srel []), ("a", m []), ("s", .meet (p ["S"]) (m [("dependsOn", lst [ad 0 ["a"]])]))], .map []),
    ([], m [("S", Srel []), ("s", .meet (p ["S"]) (m [("dependsOn", lst [ad 0 ["nosuch"]])]))], .map []),
    ([], m [("S", Srel [k1]), ("a", m []), ("s", .meet (p ["S"]) (m [("dependsOn", lst [ad 0 ["a"]])]))],
      .map [("a", .map [("k", j 2)])]),
    ([], m [("a", m []), ("L", rf k1 (ad 0 ["a"])), ("x", p ["L"])], .map [("a", .map [("k", j 2)])]),
    ([], m [("a", m []), ("L", m [("d", rf k1 (ad 0 ["a"]))]), ("x", p ["L"])], .map []),
    ([], m [("L", m [("d", .meet (.call .relate []) (ad 0 ["nosuch"]))]), ("x", p ["L"])], .map []),
    ([], m [("jobs", jobs)], .map []),
    ([], m [("jobs", jobs)], .map [("jobs", .map [("b", .map [("kind", .str "svc")])])]),
    ([], m [("a", m []), ("l", .list [] (some (rf k1 (ad 0 ["a"]))) false), ("m", .meet (p ["l"]) (lst [ad 0 ["a"]]))],
      .map [("a", .map [("k", j 2)])]),
    ([], m [("a", lnk), ("copied", p ["a", "link"])], .map []),
    ([], m [("target", m []), ("a", lnk), ("copied", p ["a", "link"])], .map []),
    ([], m [("target", m [("k", int 2)]), ("a", lnk), ("copied", p ["a", "link"])], .map []),
    ([], m [("d", .ride .hide (m [("next", rf k1 (ad 2 ["peer"]))]) []), ("peer", m []),
      ("n", m [("peer", m [("k", int 2)]), ("x", p ["d"])])], .map []),
    ([], m [("t", N), ("n", m [("x", p ["t", "N"])])],
      .map [("n", .map [("x", .map [("other", .map [("k", j 2)])])])]),
    ([], m [("t", N), ("n", m [("x", p ["t", "N"])])],
      .map [("n", .map [("x", .map [("other", .map [("k", j 1)])])])]),
    ([], m [("a", m [("b", m [("link", .meet (.call .relate []) (ad 2 ["x"]))]), ("x", m [])]),
      ("c", p ["a", "b", "link"])], .map []),
    ([("T", .map [("m", false, m []), ("n", true, rf (.or [(0, .alias "T"), (0, m [])]) (ad 1 ["m"]))] none false)],
      m [("x", .meet (m []) (.alias "T"))], .map [])]

theorem landCases_checkable : ∀ c ∈ landCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem land_verdict_exact : ∀ c ∈ landCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (landCases_checkable c hc).1 (landCases_checkable c hc).2 v

/-- Links in a generator's template, read at each member of its output:
`each` over a list, beside data the template's flow refuses and none,
at a target that names nothing, and over an empty list, where no member
reads it; `pack` the same; a `relate` in `each`'s template; a link that is
the template itself; and `each` over a map. -/
def genLinkCases : List (Decls × Val × Data) :=
  let lst (vs : List Val) : Val := .list vs none false
  let k1 : Val := m [("k", int 1)]
  let a2 : Data := .map [("a", .map [("k", j 2)])]
  let gone : Val := m [("r", .meet (.call .relate []) (ad 0 ["nosuch"]))]
  [([], m [("a", m []), ("l", lst [int 1, int 2]), ("e", .call .each [p ["l"], m [("r", rf k1 (ad 0 ["a"]))]])], a2),
    ([], m [("a", m []), ("l", lst [int 1, int 2]), ("e", .call .each [p ["l"], m [("r", rf k1 (ad 0 ["a"]))]])],
      .map []),
    ([], m [("l", lst [int 1]), ("e", .call .each [p ["l"], gone])], .map []),
    ([], m [("l", lst []), ("e", .call .each [p ["l"], gone])], .map []),
    ([], m [("a", m []), ("n", lst [str "x", str "y"]), ("p", .call .pack [p ["n"], m [("r", rf k1 (ad 0 ["a"]))]])],
      a2),
    ([], m [("n", lst [str "x"]), ("p", .call .pack [p ["n"], gone])], .map []),
    ([], m [("n", lst []), ("p", .call .pack [p ["n"], gone])], .map []),
    ([], m [("a", m []), ("l", lst [int 1]),
      ("e", .call .each [p ["l"], m [("d", .meet (.call .relate [k1]) (lst [ad 0 ["a"]]))]])], a2),
    ([], m [("a", m []), ("l", lst [int 1]), ("e", .call .each [p ["l"], rf k1 (ad 0 ["a"])])], a2),
    ([], m [("a", m []), ("m", m [("x", int 1), ("y", int 2)]), ("e", .call .each [p ["m"], m [("r", rf k1 (ad 0 ["a"]))]])],
      a2)]

theorem genLinkCases_checkable : ∀ c ∈ genLinkCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem genLink_verdict_exact : ∀ c ∈ genLinkCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (genLinkCases_checkable c hc).1 (genLinkCases_checkable c hc).2 v

/-- Links whose templates read the member or the place where they land:
a hole in `each`'s template standing for the member, alone and in a map,
beside data the flow refuses and data it admits; `key()` and `key(2)` in
a link's template, written in place, in `each`'s template and in a
spread's, each read at the link's own place; `pack`'s member, over a list
of names and over a map; a hole in a generator inside a generator's
template; a generator that makes fewer instances than the list its
output meets, whose template lands only at its own; a generator in a
body no reference reads; and a generator over a name in a link's
template, which reads the name's body. -/
def linkTemplateCases : List (Decls × Val × Data) :=
  let ad (ks : List String) : Val := .addr ⟨0, ks⟩
  let lst (vs : List Val) : Val := .list vs none false
  let k1 : Val := m [("k", int 1)]
  let ak (n : ℤ) (h : IntegerLeaf n := by decide) : Data := .map [("a", .map [("k", .integer n h)])]
  let av (x : Data) : Data := .map [("a", .map [("v", x)])]
  let an (x : String) : Data := .map [("a", .map [("n", .str x)])]
  let bound : Val := m [("a", m []), ("l", lst [k1]), ("e", .call .each [p ["l"], rf .hole (ad ["a"])])]
  let vhole : Val := m [("a", m []), ("l", lst [int 7]), ("e", .call .each [p ["l"], rf (m [("v", .hole)]) (ad ["a"])])]
  let here (n : ℕ) : Val := m [("a", m []), ("x", m [("r", rf (m [("n", .keyUp n)]) (ad ["a"]))])]
  let inEach (n : ℕ) : Val :=
    m [("a", m []), ("l", lst [int 7]), ("e", .call .each [p ["l"], m [("r", rf (m [("n", .keyUp n)]) (ad ["a"]))]])]
  let inSpread : Val :=
    m [("a", m []), ("s", .map [("m", false, m [])] (some (m [("r", rf (m [("n", .keyUp 2)]) (ad ["a"]))])) false)]
  let packNames : Val :=
    m [("a", m []), ("n", lst [str "x"]), ("p", .call .pack [p ["n"], m [("r", rf (m [("v", .hole)]) (ad ["a"]))]])]
  let packMap : Val :=
    m [("a", m []), ("m", m [("x", int 1)]), ("p", .call .pack [p ["m"], m [("r", rf (m [("v", .hole)]) (ad ["a"]))]])]
  let nested : Val :=
    m [("a", m []), ("l", lst [lst [k1]]), ("e", .call .each [p ["l"], .call .each [.hole, rf .hole (ad ["a"])]])]
  let none0 : Val := m [("a", m []), ("e", .meet (.call .each [lst [], .call .relate [k1]]) (lst [ad ["a"]]))]
  let fewer : Val :=
    m [("a", m []), ("b", m []), ("e", .meet (.call .each [lst [int 1], .call .relate [k1]]) (lst [ad ["a"], ad ["b"]]))]
  let body : Decls := [("G", .call .each [lst [int 1], rf k1 (ad ["a"])])]
  let named : Val := m [("a", lst []), ("r", rf (.call .each [.alias "L", .hole]) (ad ["a"]))]
  [([], bound, ak 2), ([], bound, ak 1),
    ([], vhole, av (j 8)), ([], vhole, av (j 7)),
    ([], here 1, an "r"), ([], here 1, an "x"), ([], here 2, an "x"), ([], here 2, an "r"),
    ([], inEach 1, an "r"), ([], inEach 2, an "0"), ([], inEach 2, an "e"),
    ([], inSpread, an "m"), ([], inSpread, an "s"),
    ([], packNames, av (.str "x")), ([], packNames, av (.str "y")),
    ([], packMap, av (j 1)), ([], packMap, av (j 2)),
    ([], nested, ak 1), ([], nested, ak 2),
    ([], none0, ak 2),
    ([], fewer, .map [("a", .map []), ("b", .map [("k", j 2)])]), ([], fewer, ak 2),
    (body, m [("a", m [])], ak 2), (body, m [("a", m [])], .map [("a", .map [])]),
    ([("L", lst [int 1])], named, .map [("a", .list [j 1])]), ([("L", lst [int 1])], named, .map [("a", .list [j 2])])]

theorem linkTemplateCases_checkable : ∀ c ∈ linkTemplateCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem linkTemplate_verdict_exact : ∀ c ∈ linkTemplateCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (linkTemplateCases_checkable c hc).1 (linkTemplateCases_checkable c hc).2 v

/-- Ruling 50: a link's template reads its relative paths where it
lands, at the link's target, as a spread's, a generator's and a copy's
templates read theirs: a path to the target's member, one that climbs
past the template, one to a member the template writes itself, a link
the template carries, its address and its own template read where that
link lands, a climb past the top, and data that conflicts with what the
template sends. -/
def linkLandCases : List (Decls × Val × Data) :=
  let rf (t : Val) (up : ℕ) (ks : List String) : Val := .meet (.call .relate [t]) (.addr ⟨up, ks⟩)
  [([], m [("x", m [("m", m [("k", int 2)]), ("n", rf (m [("v", rel 1 ["k"])]) 1 ["m"])])], .map []),
    ([], m [("x", m [("k", int 3), ("m", m [("k", int 2)]), ("n", rf (m [("v", rel 2 ["k"])]) 1 ["m"])])], .map []),
    ([], m [("x", m [("m", m [("m", m [])]), ("n", rf (m [("n", rf (m [("k", int 1)]) 1 ["m"])]) 1 ["m"])])],
      .map []),
    ([], m [("x", m [("m", m [("m", m []), ("k", int 5)]),
      ("n", rf (m [("n", rf (m [("v", rel 2 ["k"])]) 1 ["m"])]) 1 ["m"])])], .map []),
    ([], m [("m", m []), ("n", rf (m [("v", rel 3 ["k"])]) 0 ["m"])], .map []),
    ([], m [("x", m [("m", m []), ("n", rf (m [("a", int 1), ("b", rel 1 ["a"])]) 1 ["m"])])], .map []),
    ([], m [("x", m [("m", m [("k", int 2)]), ("n", rf (m [("v", rel 1 ["k"])]) 1 ["m"])])],
      .map [("x", .map [("m", .map [("k", j 2), ("v", j 3)])])])]

theorem linkLandCases_checkable : ∀ c ∈ linkLandCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem linkLand_verdict_exact : ∀ c ∈ linkLandCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (linkLandCases_checkable c hc).1 (linkLandCases_checkable c hc).2 v

/-- More of ruling 50, a link's template read where it lands: a target
that isn't the link's sibling, read by a path inside the template and
for a member of its own; a path deeper in the template, to the target's
member and one step past the template; a call over such a path; a path
to a member the target doesn't declare, which the data can't supply;
and two links into one target, the second reading what the first
sends. -/
def linkReadCases : List (Decls × Val × Data) :=
  let rf (t : Val) (up : ℕ) (ks : List String) : Val := .meet (.call .relate [t]) (.addr ⟨up, ks⟩)
  let ab : Val := m [("a", int 1), ("b", rel 1 ["a"])]
  let vk : Val := m [("v", rel 1 ["k"])]
  let far : Val := m [("x", m [("n", rf ab 0 ["out"])]), ("out", m [])]
  let fark : Val := m [("x", m [("n", rf vk 0 ["out"])]), ("out", m [("k", int 2)])]
  let deep : Val := m [("x", m [("m", m [("k", int 2)]), ("n", rf (m [("a", m [("b", rel 2 ["k"])])]) 1 ["m"])])]
  let past : Val :=
    m [("x", m [("k", int 4), ("m", m [("k", int 2)]), ("n", rf (m [("a", m [("b", rel 3 ["k"])])]) 1 ["m"])])]
  let call : Val := m [("x", m [("m", m [("s", str "a")]), ("n", rf (m [("v", .call .upper [rel 1 ["s"]])]) 1 ["m"])])]
  let none : Val := m [("x", m [("m", m []), ("n", rf vk 1 ["m"])])]
  let two : Val :=
    m [("x", m [("m", m [("k", int 2)]), ("n", rf vk 1 ["m"]), ("o", rf (m [("w", rel 1 ["v"])]) 1 ["m"])])]
  let xm (d : Data) : Data := .map [("x", .map [("m", d)])]
  [([], far, .map [("out", .map [("a", j 1), ("b", j 1)])]),
    ([], far, .map [("out", .map [("a", j 1), ("b", j 2)])]),
    ([], fark, .map [("out", .map [("k", j 2), ("v", j 2)])]),
    ([], fark, .map [("out", .map [("k", j 2), ("v", j 3)])]),
    ([], deep, .map []),
    ([], deep, xm (.map [("a", .map [("b", j 3)])])),
    ([], past, xm (.map [("a", .map [("b", j 4)])])),
    ([], call, xm (.map [("v", .str "A")])),
    ([], call, xm (.map [("v", .str "a")])),
    ([], none, xm (.map [("k", j 2), ("v", j 2)])),
    ([], none, xm (.map [("v", j 3)])),
    ([], none, .map []),
    ([], two, .map []),
    ([], two, xm (.map [("w", j 3)]))]

theorem linkReadCases_checkable : ∀ c ∈ linkReadCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem linkRead_verdict_exact : ∀ c ∈ linkReadCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (linkReadCases_checkable c hc).1 (linkReadCases_checkable c hc).2 v

/-- A recursive name whose body links back to it, by a link's template:
the name is recursive as any is, so a use of it alone stays residual
and generates nothing, and a use met with a map, the data's or the
schema's, unfolds. The name deeper in the template, two names that
reach each other through a template, an optional use, a spread's and a
list's template, a use beside another member and one marked as a type;
and a template that holds a name that isn't recursive, which expands
where it's used. -/
def recursiveLinkCases : List (Decls × Val × Data) :=
  let rf (t : Val) : Val := .meet (.call .relate [t]) (.addr ⟨1, ["m"]⟩)
  let T : Val := .alias "T"
  let dT : Decls := [("T", m [("m", m []), ("n", rf T)])]
  let dDeep : Decls := [("T", m [("m", m []), ("n", rf (mo [("k", true, T)]))])]
  let dTwo : Decls := [("A", m [("m", m []), ("n", rf (.alias "B"))]), ("B", mo [("a", true, .alias "A")])]
  let dPlain : Decls := [("U", m [("k", int 1)]), ("T", m [("m", m []), ("n", rf (.alias "U"))])]
  [(dDeep, m [("x", T)], .map []),
    (dDeep, m [("x", T)], .map [("x", .map [])]),
    (dDeep, m [("x", .meet (m []) T)], .map []),
    (dTwo, m [("x", .alias "A")], .map []),
    (dTwo, m [("x", .alias "A")], .map [("x", .map [])]),
    (dTwo, m [("x", .meet (m []) (.alias "A"))], .map []),
    (dT, mo [("x", true, T)], .map []),
    (dT, mo [("x", true, T)], .map [("x", .map [])]),
    (dT, m [("xs", tmpl T)], .map [("xs", .map [("a", .map [])])]),
    (dT, m [("xs", tmpl T)], .map [("xs", .map [("a", .map [("m", j 1)])])]),
    (dT, m [("xs", tmpl T)], .map []),
    (dPlain, m [("x", T)], .map []),
    (dPlain, m [("x", T)], .map [("x", .map [("m", .map [("k", j 2)])])]),
    (dT, m [("x", .list [] (some T) false)], .map [("x", .list [.map []])]),
    (dT, m [("x", T), ("y", int 1)], .map []),
    (dT, m [("x", .ride .type T [])], .map [])]

theorem recursiveLinkCases_checkable : ∀ c ∈ recursiveLinkCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem recursiveLink_verdict_exact : ∀ c ∈ recursiveLinkCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (recursiveLinkCases_checkable c hc).1 (recursiveLinkCases_checkable c hc).2 v

/-- A recursive name met with a kind, a disjunction and another recursive
name. A kind picks among the name's branches as structure does, so the
name unfolds one level against it and the data decides the rest; a
disjunction meets the name arm by arm; a name met with itself is
itself; and two recursive names met hold both, each unfolding where
the data reaches. `%T` is a tree of maps with booleans at its leaves,
`%L` nested lists of integers, and `%U` a chain that admits any `p`. -/
def residualMeetCases : List (Decls × Val × Data) :=
  let T : Val := .alias "T"
  let U : Val := .alias "U"
  let L : Val := .alias "L"
  let dT : Decls := [("T", .or [(0, .boolean), (0, mo [("p", true, tmpl T)])])]
  let dL : Decls := [("L", .or [(0, .integer), (0, .list [] (some L) false)])]
  let dTU : Decls := dT ++ [("U", mo [("q", true, U), ("p", true, .any)])]
  let leaf : Data := dm [("p", dm [("a", .bool true)])]
  let either : Val := .or [(0, .boolean), (0, .mapKind)]
  [(dT, m [("x", .meet T .mapKind)], dm [("x", leaf)]),
    (dT, m [("x", .meet T .mapKind)], dm [("x", .bool true)]),
    (dT, m [("x", .meet T .mapKind)], dm []),
    (dT, m [("x", .meet T .boolean)], dm [("x", .bool false)]),
    (dT, m [("x", .meet T .boolean)], dm [("x", dm [])]),
    (dT, m [("x", .meet .mapKind T)], dm [("x", dm [("p", dm [("a", dm [("p", dm [("b", .bool true)])])])])]),
    (dT, m [("x", .meet .mapKind T)], dm [("x", dm [("p", dm [("a", j 1)])])]),
    (dT, m [("x", .meet T either)], dm [("x", leaf)]),
    (dT, m [("x", .meet T either)], dm [("x", .bool true)]),
    (dT, m [("x", .meet T either)], dm [("x", j 1)]),
    (dT, m [("x", .meet T T)], dm [("x", leaf)]),
    (dT, m [("x", .meet T T)], dm []),
    (dTU, m [("x", .meet T U)], dm [("x", leaf)]),
    (dTU, m [("x", .meet T U)], dm [("x", dm [("q", dm [])])]),
    (dTU, m [("x", .meet T U)], dm [("x", .bool true)]),
    (dTU, m [("x", .meet T U)], dm []),
    (dL, m [("x", .meet L .listKind)], dm [("x", .list [j 1, .list [j 2]])]),
    (dL, m [("x", .meet L .listKind)], dm [("x", j 1)]),
    (dL, m [("x", .meet L .listKind)], dm [("x", .list [.str "a"])]),
    (dL, m [("x", .meet L .integer)], dm [("x", j 3)])]

theorem residualMeetCases_checkable : ∀ c ∈ residualMeetCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem residualMeet_verdict_exact : ∀ c ∈ residualMeetCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (residualMeetCases_checkable c hc).1 (residualMeetCases_checkable c hc).2 v

/-- Ruling 26 for a recursion: a use of a recursive name whose body reads
its own place reads as a copy of the body placed where the use stands,
at each level the data or the schema reaches. A sibling path read at
each level the data writes, beside data that agrees, data that refuses,
data that leaves the member to the fill, a level below that, and no
data; a level the schema writes, with data that agrees and data that
refuses; and a climb out of the body, which reads the parent of the
level it stands at. -/
def recursiveCopyCases : List (Decls × Val × Data) :=
  let tB (k : String) (v : Val) : Decls :=
    [("T", .map [("x", false, .integer), (k, false, v), ("b", true, .alias "T")] none false)]
  let ty := tB "y" (.path [.up 1, .key "x"])
  let tw := tB "z" (.path [.up 2, .key "w"])
  let aT := m [("a", .alias "T")]
  let lv (b : List (String × Data)) : Data := .map [("a", .map [("x", j 1), ("y", j 1), ("b", .map b)])]
  let sT := m [("a", .meet (m [("x", int 1), ("b", m [("x", int 2)])]) (.alias "T"))]
  let wT := m [("w", int 5), ("a", .meet (m [("x", int 1), ("w", int 7), ("b", m [("x", int 2)])]) (.alias "T"))]
  [(ty, aT, .map []),
    (ty, aT, lv [("x", j 2), ("y", j 2)]),
    (ty, aT, lv [("x", j 2), ("y", j 1)]),
    (ty, aT, lv [("x", j 2)]),
    (ty, aT, lv [("x", j 2), ("y", j 2), ("b", .map [("x", j 3)])]),
    (ty, aT, lv [("x", j 2), ("y", j 2), ("b", .map [("x", j 3), ("y", j 2)])]),
    (ty, sT, .map []),
    (ty, sT, .map [("a", .map [("b", .map [("y", j 2)])])]),
    (ty, sT, .map [("a", .map [("b", .map [("y", j 1)])])]),
    (tw, wT, .map [("a", .map [("b", .map [("z", j 7)])])]),
    (tw, wT, .map [("a", .map [("b", .map [("z", j 5)])])]),
    (tw, wT, .map [("a", .map [("z", j 5)])]),
    (tw, wT, .map [("a", .map [("z", j 7)])])]

theorem recursiveCopyCases_checkable : ∀ c ∈ recursiveCopyCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem recursiveCopy_verdict_exact : ∀ c ∈ recursiveCopyCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (recursiveCopyCases_checkable c hc).1 (recursiveCopyCases_checkable c hc).2 v

/-- Ruling 49: a `match` whose scrutinee the schema leaves open waits
for the data, the data's scrutinee picking the arm, one no arm and no
default takes `invalid`. With no default, data that leaves the result to
the fill, data that agrees, data that conflicts, and a scrutinee no arm
takes; with a default, the same and a scrutinee the default takes. A
scrutinee written with its own `type()` or `hide()` member, which the
selection leaves out as the output does (decision 86). The schema's own
reading leaves the selection unmade, so each case's reading with the
data is read whole (`Decls.readsPD`). -/
def openSelectCases : List (Decls × Val × Data) :=
  let sel (d : Option Val) : Val :=
    .select (.path [.up 1, .key "kind"]) [(.lit (.str "a"), int 1), (.lit (.str "b"), int 2)] d
  let doc (d : Option Val) : Val := m [("x", m [("kind", .string), ("v", sel d)])]
  let x (fs : List (String × Data)) : Data := .map [("x", .map fs)]
  let arms : List (Val × Val) := [(m [("a", int 1)], m [("y", int 1)])]
  let marked (k : Rider) : Val :=
    m [("v", .select (m [("a", int 1), ("z", .ride k .number [])]) arms (some (m [("y", int 2)])))]
  let dv (fs : List (String × Data)) : Data := .map [("v", .map fs)]
  [([], doc none, x [("kind", .str "a")]),
    ([], doc none, x [("kind", .str "a"), ("v", j 1)]),
    ([], doc none, x [("kind", .str "a"), ("v", j 2)]),
    ([], doc none, x [("kind", .str "c")]),
    ([], doc (some (int 3)), x [("kind", .str "a")]),
    ([], doc (some (int 3)), x [("kind", .str "a"), ("v", j 2)]),
    ([], doc (some (int 3)), x [("kind", .str "c")]),
    ([], doc (some (int 3)), x [("kind", .str "c"), ("v", j 3)]),
    ([], marked .type, dv [("y", j 1)]),
    ([], marked .type, dv [("y", j 2)]),
    ([], marked .hide, dv [("y", j 1)])]

set_option maxRecDepth 16384 in
theorem openSelectCases_reads : ∀ c ∈ openSelectCases, c.1.readsPD c.2.1 c.2.2 = true := by
  decide +kernel

theorem openSelect_verdict_exact : ∀ c ∈ openSelectCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff_readsD (openSelectCases_reads c hc) v

/-- Ruling 87: a `match` whose scrutinee generates no value takes the
arm no data could change. An arm whose pattern the scrutinee sits below
is taken: a kind under itself and under `number`, a bound under a looser
one, a disjunction each of whose arms does, and a sealed map under its
own seal. An arm that shares nothing with the scrutinee is passed over,
for a later arm, for the default, and for no arm at all, which is an
error. And an open map under a sealed pattern waits for the data, which
keeps to the pattern or adds a key. Each beside no data, and some beside
data that agrees with the arm taken and data that names another. -/
def certainSelectCases : List (Decls × Val × Data) :=
  let sel (s : Val) (arms : List (Val × Val)) (d : Option Val := some (str "other")) : Val :=
    m [("t", .select s arms d)]
  let t (x : String) : Data := .map [("t", .str x)]
  let min (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .min (.num (.integer ⟨n, h⟩))
  let shut : Val := .map [("a", false, .integer)] none true
  let kinds : Val := sel .integer [(.integer, str "number"), (.string, str "string")]
  let both : Val := sel (.or [(0, int 1), (0, int 2)]) [(.integer, str "a")] (some (str "b"))
  let later : Val := sel .integer [(.string, str "s"), (.number, str "n")]
  let sealedPat : Val := m [("x", m [("a", .integer)]),
    ("t", .select (.path [.key "x"]) [(shut, str "T")] (some (str "D")))]
  [([], kinds, .map []), ([], kinds, t "number"), ([], kinds, t "string"),
    ([], sel .integer [(.number, str "number")], .map []),
    ([], sel (.meet .integer (min 3)) [(min 1, str "big")], .map []),
    ([], both, .map []), ([], both, t "b"),
    ([], sel (.or [(0, .meet .integer (min 1)), (0, .meet .biginteger (min 1))])
      [(.number, str "number")], .map []),
    ([], later, .map []), ([], later, t "s"),
    ([], sel .integer [(.string, str "s"), (.boolean, str "b")], .map []),
    ([], sel .integer [(.string, str "s")] none, .map []),
    ([], sel shut [(shut, str "T")] (some (str "D")), .map []),
    ([], sealedPat, .map [("x", .map [("a", j 1)])]),
    ([], sealedPat, .map [("x", .map [("a", j 1), ("b", j 2)])])]

set_option maxRecDepth 16384 in
theorem certainSelectCases_reads : ∀ c ∈ certainSelectCases, c.1.readsPD c.2.1 c.2.2 = true := by
  decide +kernel

theorem certainSelect_verdict_exact : ∀ c ∈ certainSelectCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff_readsD (certainSelectCases_reads c hc) v

/-- Ruling 90: a spread's template that holds two defaults of the picked
rank that disagree is the schema's error where it is written, whatever
the data. A map's template and a list's, against no data, a member that
picks one default and one that picks neither; the clash made by `pref`,
a member of the template, a template's own template, and under
`type()`; beside a member the schema declares; in a template that reads
its member's key or a member beside it, which is read as written; in a
template that is a path to the clash; and in a body nothing uses. Their
neighbours stand: one default, two that agree, and two of different
ranks. -/
def templateClashCases : List (Decls × Val × Data) :=
  let two : Val := .or [(1, int 1), (1, int 2)]
  let sp (t : Val) (fs : List (String × Val) := []) : Val :=
    .map (fs.map fun f => (f.1, false, f.2)) (some t) false
  let x (v : Val) : Val := m [("x", v)]
  let dx (fs : List (String × Data)) : Data := .map [("x", .map fs)]
  [([], x (sp two), .map []),
    ([], x (sp two), dx [("k", j 1)]),
    ([], x (sp two), dx [("k", j 3)]),
    ([], x (sp (.call .pref [.or [(0, int 1), (0, int 2)]])), dx [("k", j 1)]),
    ([], x (.list [] (some two) false), .map [("x", .list [j 1])]),
    ([], x (sp two [("k", .number)]), .map []),
    ([], x (sp (m [("a", two)])), .map []),
    ([], x (sp (sp two)), .map []),
    ([], x (sp (.ride .type two [])), .map []),
    ([], x (sp (m [("a", .keyUp 0), ("b", two)])), .map []),
    ([], x (sp (m [("a", .path [.up 1, .key "b"]), ("b", two)])), .map []),
    ([], m [("x", sp (.path [.key "d"])), ("d", two)], .map []),
    ([("T", sp two)], m [("v", int 1)], .map [("v", j 1)]),
    ([], x (sp (.or [(1, int 1), (0, int 2)])), dx [("k", j 2)]),
    ([], x (sp (.or [(1, int 1), (1, int 1)])), .map []),
    ([], x (sp (.or [(2, int 1), (1, int 2)])), .map [])]

theorem templateClashCases_checkable : ∀ c ∈ templateClashCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem templateClash_verdict_exact : ∀ c ∈ templateClashCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (templateClashCases_checkable c hc).1 (templateClashCases_checkable c hc).2 v

/-- A default that reaches a disjunction as an arm stands as the arm it
is, of its rank with no parent type, whichever way it got there (ruling
89): the ruling's own `level: $.defaults.level | "debug"` against a
string neither arm names, against `"debug"` and against nothing; a
`pref()` call, a name whose body is a default, and a path to one, each
against a value only the parent type would admit; a path that settles
late, through a second path, and one the data gives a value; a `pref()`
over a path, against data that agrees with what it reads and data that
doesn't; `copy`, `move`, a rider, a meet with the parent type and a
`match`'s result around the default, the `match` over a scrutinee the
data settles standing in a list of its own, which the definition reads
without the checker (`armStandsSelectCases`); a default in a list, in a spread's
template over its member's key, and one that is a map. A star on such
an arm adds to the default's own rank. What stays wider stands beside
them: `super()` of the default, a parent type the document writes, a
disjunction the place's default met, and a default a meet refused,
whose parent type is then an arm like any other; a default the place
narrowed with a kind, or met with its twin, is still the default
alone. Two defaults of one rank that reach one disjunction clash or
agree as written ones do. -/
def armStandsCases : List (Decls × Val × Data) :=
  let one : Val := .pref 1 (int 1)
  let pd : Val := p ["d"]
  let o (vs : List Val) : Val := .or (vs.map fun v => (0, v))
  let xa (f : Val) : Val := o [f, str "a"]
  let dx (v : Data) : Data := .map [("x", v)]
  let doc (d f : Val) : Val := m [("d", d), ("x", xa f)]
  let level : Val := m [("level", o [p ["defaults", "level"], str "debug"]),
    ("defaults", m [("level", .pref 1 (str "info"))])]
  [([], level, .map [("level", js "other")]),
    ([], level, .map [("level", js "debug")]),
    ([], level, .map []),
    ([], x (xa (c .pref [int 1])), dx (j 3)),
    ([], x (xa (c .pref [int 1])), dx (j 1)),
    ([], x (xa (c .pref [int 1])), .map []),
    ([("T", one)], x (xa (.alias "T")), dx (j 3)),
    ([], doc one pd, dx (j 3)),
    ([], doc one pd, dx (j 1)),
    ([], doc one pd, dx (js "a")),
    ([], doc one pd, .map []),
    ([], m [("x", xa pd), ("d", p ["e"]), ("e", one)], dx (j 3)),
    ([], doc one pd, .map [("d", j 5), ("x", j 5)]),
    ([], doc one pd, .map [("d", j 5), ("x", j 1)]),
    ([], doc (int 1) (c .pref [pd]), dx (j 3)),
    ([], doc .number (c .pref [pd]), dx (j 3)),
    ([], doc .number (c .pref [pd]), .map [("x", j 3), ("d", j 3)]),
    ([], doc .number (c .pref [pd]), .map [("x", j 3), ("d", j 4)]),
    ([], doc one (c .copy [pd]), dx (j 3)),
    ([], doc one (c .move [pd]), dx (j 3)),
    ([], doc one (.ride .metadata pd []), dx (j 3)),
    ([], doc one (.meet pd .number), dx (j 3)),
    ([], doc one (.select (int 1) [(int 1, pd)] none), dx (j 3)),
    ([], x (lst [xa (c .pref [int 1])]), dx (.list [j 3])),
    ([], x (.list [] (some (xa (c .pref [int 1]))) false), dx (.list [j 3])),
    ([], x (.list [] (some (xa (c .pref [int 1]))) false), dx (.list [j 1, js "a"])),
    ([], x (tmpl (xa (c .pref [k 0]))), dx (.map [("b", js "q")])),
    ([], x (tmpl (xa (c .pref [k 0]))), dx (.map [("b", js "b")])),
    ([], x (tmpl (xa (c .pref [k 0]))), dx (.map [("b", js "a")])),
    ([], doc (.pref 1 (m [("a", int 1)])) pd, dx (.map [("a", j 2)])),
    ([], doc (.pref 1 (m [("a", int 1)])) pd, dx (.map [("a", j 1)])),
    ([], doc (.pref 1 (m [("a", int 1)])) pd, .map []),
    ([], doc (m [("a", one)]) pd, dx (.map [("a", j 2)])),
    ([], x (.or [(1, one), (0, str "a")]), dx (j 3)),
    ([], x (.or [(0, one), (0, str "a")]), dx (j 3)),
    ([], x (.or [(1, one), (1, int 2)]), .map []),
    ([], doc one (c .super [pd]), dx (j 3)),
    ([], doc (.or [(1, int 1), (0, .number)]) pd, dx (j 3)),
    ([], doc (.meet one (o [int 1, int 2, int 3])) pd, dx (j 2)),
    ([], doc (.meet one (o [int 1, int 2, int 3])) pd, dx (j 4)),
    ([], doc (.meet one (o [.integer, .string])) pd, dx (j 2)),
    ([], x (xa (.meet one (.min (nb 2)))), dx (j 7)),
    ([], x (xa (.meet one (.min (nb 2)))), dx (j 1)),
    ([], doc (.meet one .integer) pd, dx (j 2)),
    ([], doc (.meet one one) pd, dx (j 2)),
    ([], m [("d", one), ("x", .or [(0, pd), (1, int 2)])], .map []),
    ([], m [("d", one), ("x", .or [(0, pd), (1, int 1)])], .map []),
    ([], m [("d", one), ("e", .pref 2 (int 2)), ("x", o [pd, p ["e"]])], .map []),
    ([], m [("d", one), ("e", .pref 2 (int 2)), ("x", o [pd, p ["e"]])], dx (j 2)),
    ([], m [("d", one), ("e", .pref 2 (int 2)), ("x", o [pd, p ["e"]])], dx (j 3))]

theorem armStandsCases_checkable : ∀ c ∈ armStandsCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem armStands_verdict_exact : ∀ c ∈ armStandsCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (armStandsCases_checkable c hc).1 (armStandsCases_checkable c hc).2 v

/-- A `match`'s result that is a default, standing as an arm (ruling
89): `match($.k, number, pref(1), string, "s") | "a"` against a value
only the default's parent type would admit, and against nothing. -/
def armStandsSelectCases : List (Decls × Val × Data) :=
  let sel : Val := m [("k", .number), ("x", .or [(0, .select (p ["k"])
    [(.number, c .pref [int 1]), (.string, str "s")] none), (0, str "a")])]
  [([], sel, .map [("x", j 3), ("k", j 2)]),
    ([], sel, .map [("k", j 2)])]

theorem armStandsSelectCases_reads : ∀ c ∈ armStandsSelectCases, c.1.readsPD c.2.1 c.2.2 = true := by
  decide +kernel

theorem armStandsSelect_verdict_exact : ∀ c ∈ armStandsSelectCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff_readsD (armStandsSelectCases_reads c hc) v

/-- A trial over a call that waits, waiting with it (#432): a `match`
whose pattern holds a `+` that takes no operand yet, against the value
its default gives, against another and against nothing; one whose first
pattern would take the value while a later one waits, as both ports
stage every pattern before they select; one whose selected result
waits, and one whose unselected result does, which is the arm it takes;
the call in an arm and in a member of a pattern, and in a spread's
template, where nothing waits on it; a `join` that waits; and a pattern
that holds an unmade call beside the waiting one, and a selected result
that is one, each an error. Then `nof`, over a branch that waits, alone
and beside one that admits, in a member of a branch and in a spread's
template, where the branch admits the empty list, beside a branch that
doesn't stand, which admits nothing, and with a count that waits;
`must`; and `when`, whichever of its three waits. A trial inside a
trial waits with it, and so does one in an arm, in a list and beside a
value it meets; an optional member holding one may be absent, and a
spread holding one waits on each member. -/
def waitCases : List (Decls × Val × Data) :=
  let w : Val := c .plus [.integer, int 1]
  let unmade : Val := c .add [.integer, int 1]
  let sv (t : Val) : Val := m [("v", t)]
  let dv (d : Data) : Data := .map [("v", d)]
  let sl (arms : List (Val × Val)) (d : Option Val) : Val := .select (int 1) arms d
  let no : Option Val := some (str "no")
  [([], sv (sl [(w, str "yes")] no), dv (.str "no")),
    ([], sv (sl [(w, str "yes")] no), dv (.str "z")),
    ([], sv (sl [(w, str "yes")] no), .map []),
    ([], sv (sl [(int 1, str "yes"), (w, str "no")] none), dv (.str "yes")),
    ([], sv (sl [(int 1, w)] no), dv (j 2)),
    ([], sv (sl [(int 2, w)] no), dv (.str "no")),
    ([], sv (sl [(int 2, w)] no), dv (j 3)),
    ([], sv (sl [(.or [(0, int 1), (0, w)], str "yes")] no), dv (.str "yes")),
    ([], sv (sl [(m [("a", w)], str "yes")] no), dv (.str "no")),
    ([], sv (sl [(.list [] (some w) false, str "yes")] no), dv (.str "no")),
    ([], sv (sl [(c .join [lst [str "a", .string]], str "yes")] no), dv (.str "no")),
    ([], sv (sl [(m [("a", w), ("b", unmade)], str "yes")] no), dv (.str "no")),
    ([], sv (sl [(int 1, unmade)] no), dv (j 5)),
    ([], sv (.nof (int 0) [w]), dv (j 5)),
    ([], sv (.nof (int 1) [w, int 5]), dv (j 5)),
    ([], sv (.nof (int 0) [w]), .map []),
    ([], sv (.nof (int 0) [m [("a", w)]]), dv (j 5)),
    ([], sv (.nof (int 0) [.list [] (some w) false]), dv (.list [])),
    ([], sv (.nof (int 0) [m [("a", w), ("b", unmade)]]), dv (j 5)),
    ([], sv (.nof w [int 5]), dv (j 5)),
    ([], sv (.must w "m"), dv (j 5)),
    ([], sv (.when w (str "a") (some (str "b"))), dv (.str "b")),
    ([], sv (.when .string w (some (str "b"))), dv (.str "b")),
    ([], sv (.when w (str "a") none), dv (j 1)),
    ([], sv (.nof (int 0) [.nof (int 0) [w]]), dv (j 5)),
    ([], sv (.nof (int 1) [sl [(w, str "yes")] no]), dv (.str "no")),
    ([], sv (.or [(0, .nof (int 0) [w]), (0, str "a")]), dv (.str "a")),
    ([], sv (lst [.nof (int 0) [w]]), dv (.list [j 5])),
    ([], .map [("v", true, .nof (int 0) [w])] none false, .map []),
    ([], sv (.meet (.nof (int 0) [w]) (int 5)), .map []),
    ([], sv (.map [] (some (.nof (int 0) [w])) false), dv (.map [("a", j 5)])),
    ([], sv (.meet (.must (int 1) "m") (.nof (int 0) [w])), dv (j 1))]

theorem waitCases_checkable : ∀ c ∈ waitCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem wait_verdict_exact : ∀ c ∈ waitCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff (waitCases_checkable c hc).1 (waitCases_checkable c hc).2 v

/-- A `match` whose scrutinee, and a `must` whose condition, reads the
place the term stands at, which reads what the rest of the document
holds there, without the term (`Val.dropSelf`): the rule of #818,
`order: match($.order.status, "shipped", {trackingNo: string}, {})`,
against a record the default takes, one the arm takes that lacks the
member, has it and has it of the wrong kind; and `must`'s condition
reading the value under trial, through a call against data that agrees
and data that doesn't, beside a required member the data leaves out,
alone, and beside a path to a field of the schema's own, which reads as
any path does; then the same reads written as relative paths, which read
where they stand (#917): `.name` alone and through a call, `.x` beside a
required member and alone, and the rule's scrutinee as `.order.status`;
and a scrutinee the rest of the schema leaves open, `number`, which the
data's own `x` settles; a pattern that reads the match's own place,
which reads the field (decision 85); and a bound over a path into the
value under trial. No case reads a `type()` or `hide()` member through
a path, which the checker can't read. -/
def selfReadCases : List (Decls × Val × Data) :=
  let rule : Val := m [("order", .select (.path [.key "order", .key "status"])
    [(str "shipped", m [("trackingNo", .string)])] (some (m [])))]
  let relRule : Val := m [("order", .select (rel 1 ["order", "status"])
    [(str "shipped", m [("trackingNo", .string)])] (some (m [])))]
  let openRule : Val := m [("v", .meet (m [("x", .number)])
    (.select (.path [.key "v", .key "x"]) [(int 1, m [("y", int 1)])] (some (m [("y", int 2)]))))]
  let patRule : Val := m [("v", .select (int 1) [(.path [.key "v", .key "z"], m [("y", int 2)])] (some (m [])))]
  let boundMust : Val := m [("v", .must (m [("x", .call (.bnd .min) [.path [.key "v", .key "y"]])]) "m")]
  let ord (fs : List (String × Data)) : Data := .map [("order", .map fs)]
  let mu (c : Val) : Val := .must c "m"
  let vx : Val := .path [.key "v", .key "x"]
  let vn : Val := .path [.key "v", .key "name"]
  let dn (x : String) : Data := .map [("v", .map [("x", .str x), ("name", .str "a")])]
  let dx : Data := .map [("v", .map [("x", .integer 1)])]
  [([], rule, ord [("status", .str "placed")]),
    ([], rule, ord [("status", .str "shipped")]),
    ([], rule, ord [("status", .str "shipped"), ("trackingNo", .str "1Z")]),
    ([], rule, ord [("status", .str "shipped"), ("trackingNo", j 7)]),
    ([], m [("v", mu (m [("x", .call .upper [vn])]))], dn "A"),
    ([], m [("v", mu (m [("x", .call .upper [vn])]))], dn "B"),
    ([], m [("v", mu (m [("x", int 1), ("y", vx)]))], dx),
    ([], m [("v", mu (m [("x", vx)]))], dx),
    ([], m [("v", mu (m [("x", int 1), ("y", .path [.key "w"])])), ("w", int 1)],
      .map [("v", .map [("x", .integer 1)]), ("w", .integer 1)]),
    ([], m [("v", mu (m [("x", rel 1 ["name"])]))], dn "B"),
    ([], m [("v", mu (m [("x", rel 1 ["name"])]))], dn "a"),
    ([], m [("v", mu (m [("x", .call .upper [rel 1 ["name"]])]))], dn "A"),
    ([], m [("v", mu (m [("x", .call .upper [rel 1 ["name"]])]))], dn "B"),
    ([], m [("v", mu (m [("x", int 1), ("y", rel 1 ["x"])]))], dx),
    ([], m [("v", mu (m [("x", rel 1 ["x"])]))], dx),
    ([], relRule, ord [("status", .str "shipped"), ("trackingNo", j 7)]),
    ([], relRule, ord [("status", .str "placed")]),
    ([], openRule, .map [("v", .map [("x", .integer 1), ("y", .integer 2)])]),
    ([], openRule, .map [("v", .map [("x", .integer 1), ("y", .integer 1)])]),
    ([], patRule, .map [("v", .map [("z", .integer 1), ("y", .integer 2)])]),
    ([], patRule, .map [("v", .map [("z", .integer 1), ("y", .integer 1)])]),
    ([], boundMust, .map [("v", .map [("x", .integer 1), ("y", .integer 2)])]),
    ([], boundMust, .map [("v", .map [("x", .integer 3), ("y", .integer 2)])])]

set_option maxRecDepth 16384 in
theorem selfReadCases_reads : ∀ c ∈ selfReadCases, c.1.readsPD c.2.1 c.2.2 = true := by
  decide +kernel

theorem self_read_verdict_exact : ∀ c ∈ selfReadCases, ∀ (m : Mode) (v : Verdict),
    vetP m c.1 c.2.1 c.2.2 = v ↔ VetP m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetP_iff_readsD (selfReadCases_reads c hc) v
