import Oracle.Base

/-! The oracle's cases: CallsTemplates, split out of `Oracle.lean` so that each area builds on its own. -/

open Aontu
open Case

/-- The shapes the meet once read as a hole's application (rulings 21
and 29 to 31, which ruling 34 supersedes), for the `verdict` rows hv0
on: a call over a hole beside its peer, written before it and after it,
in two containers met member by member, under a rider, a mark or a seal,
in a spread's template, in a size, a trial or a `match`, and in a `+`'s
operands, each against data a fill would have passed and data it
wouldn't. A hole that nothing binds is an error of the schema whatever
the data, so each is an error; beside them stand a key declared twice
and a `+` whose right list holds a `key()`, which hold no hole. -/
def holeFillVetCases : List (Val × Data) :=
  let up (v : Val) : Val := .call .upper [v]
  let la : Val := .list [s "a"] none false
  let px : Val := .map [("x", false, n 1)] none false
  let x (v : Val) : Val × Data := (.map [("x", false, v)] none false, .map [])
  let mp (fs : List (String × Val)) : Val := .map (fs.map fun (k, v) => (k, false, v)) none false
  let yes : Val := .lit (.bool true)
  let sel (arms : List (Val × Val)) (d : Val) : Val := .select yes arms (some d)
  let spm (fs : List (String × Val)) (t : Val) : Val := .map (fs.map fun (k, v) => (k, false, v)) (some t) false
  let spl (xs : List Val) (t : Val) : Val := .list xs (some t) false
  let add1 (v : Val) : Val := .call .add [v, n 1]
  let md (v : Val) : Val := .ride .metadata v [("d", .integer 1)]
  [(.meet (up .hole) (s "a"), .str "A"), (.meet (up .hole) (s "a"), .str "a"),
    (.meet (s "a") (up .hole), .str "A"),
    (.meet (.call .add [.hole, n 1]) (n 2), .integer 3),
    (.meet (.call .add [.hole, n 1]) (n 2), .integer 4),
    (.meet (n 2) (.call .add [.hole, n 1]), .integer 3),
    (.meet .hole (s "a"), .str "a"),
    (.meet (up (.call .lower [.hole])) (s "aB"), .str "AB"),
    (.meet (.meet (up .hole) (s "a")) (s "A"), .str "A"),
    (.meet (.meet (s "ab") (up .hole)) (s "AB"), .str "AB"),
    x (.meet (up .hole) (s "a")),
    x (.meet (.call .each [.hole, up .hole]) la), x (.meet la (.call .each [.hole, up .hole])),
    x (.meet (.call .pack [.hole, px]) la), x (.meet la (.call .pack [.hole, px])),
    x (.meet (.meet la (.call .each [.hole, up .hole])) (.list [s "A"] none false)),
    x (.meet (.call .each [.hole, .map [("v", false, .hole)] none false]) la),
    x (.meet (.call .each [.hole, .hole]) la),
    x (.map [("a", false, .meet (up .hole) (s "x"))] none false),
    x (.list [.meet (up .hole) (s "x")] none false),
    x (.meet .hole (s "a")),
    x (.meet (.meet (up .hole) (s "a")) (s "a")),
    (sel [(yes, .meet (up .hole) (s "a"))] (s "b"), .str "A"),
    (sel [(yes, .meet (up .hole) (s "a"))] (s "b"), .str "a"),
    (sel [(.lit (.bool false), s "b")] (.meet (up .hole) (s "a")), .str "A"),
    (sel [(.lit (.bool false), s "b")] (.meet (up .hole) (s "a")), .str "b"),
    (.meet (lst [up .hole]) (lst [s "a"]), .list [.str "A"]),
    (.meet (lst [up .hole]) (lst [s "a"]), .list [.str "a"]),
    (.meet (lst [s "a"]) (lst [up .hole]), .list [.str "A"]),
    (.meet (mp [("a", up .hole)]) (mp [("a", s "x")]), .map [("a", .str "X")]),
    (.meet (mp [("a", up .hole), ("b", n 1)]) (mp [("a", s "x")]), .map [("a", .str "X"), ("b", .integer 1)]),
    (.meet (lst [up .hole, .call .lower [.hole]]) (lst [s "a", s "B"]), .list [.str "A", .str "b"]),
    (.meet (mp [("a", mp [("b", up .hole)])]) (mp [("a", mp [("b", s "x")])]), .map [("a", .map [("b", .str "X")])]),
    (.meet (lst [up .hole]) (lst [s "a", s "b"]), .list [.str "A", .str "b"]),
    (.meet (lst [up .hole, s "z"]) (lst [s "a"]), .list [.str "A", .str "z"]),
    (.meet (mp [("a", up .hole)]) (mp [("a", up .hole)]), .map [("a", .str "X")]),
    (.meet (.meet (lst [up .hole]) (lst [s "a"])) (lst [s "A"]), .list [.str "A"]),
    (.meet (.meet (mp [("a", up .hole)]) (mp [("b", n 1)])) (mp [("a", s "x")]),
      .map [("a", .str "X"), ("b", .integer 1)]),
    (.meet (mp [("a", s "x")]) (.meet (mp [("a", up .hole)]) (mp [("b", n 1)])),
      .map [("a", .str "X"), ("b", .integer 1)]),
    (.meet (.meet (mp [("a", up .hole)]) (mp [("b", up .hole)])) (mp [("a", s "x"), ("b", s "y")]),
      .map [("a", .str "X"), ("b", .str "Y")]),
    (.meet (.meet (mp [("a", up .hole)]) (mp [("b", n 1)])) (.meet (mp [("a", s "x")]) (mp [("c", n 2)])),
      .map [("a", .str "X"), ("b", .integer 1), ("c", .integer 2)]),
    (.meet (.meet (lst [up .hole]) (lst [n 1])) (lst [s "a"]), .list [.str "A"]),
    (.meet (.meet (mp [("a", lst [up .hole])]) (mp [("b", n 1)])) (mp [("a", lst [s "x"])]),
      .map [("a", .list [.str "X"]), ("b", .integer 1)]),
    (mp [("a", s "X"), ("a", s "X")], .map [("a", .str "X")]),
    (.meet (mp [("a", up .hole)]) (mp [("a", s "x"), ("a", s "y")]), .map [("a", .str "X")]),
    (.meet (mp [("a", up .hole)]) (mp [("a", s "x"), ("a", s "x")]), .map [("a", .str "X")]),
    (mp [("a", s "x"), ("a", up .hole)], .map [("a", .str "X")]),
    (mp [("a", up .hole), ("a", s "x"), ("a", s "X")], .map [("a", .str "X")]),
    (mp [("a", s "x"), ("a", s "x"), ("a", up .hole)], .map [("a", .str "X")]),
    (mp [("a", mp [("b", up .hole)]), ("a", mp [("b", s "x")])], .map [("a", .map [("b", .str "X")])]),
    (.meet (mp [("a", s "x"), ("a", up .hole)]) (mp [("a", s "X")]), .map [("a", .str "X")]),
    (mp [("a", up .hole), ("b", n 1), ("a", s "x")], .map [("a", .str "X"), ("b", .integer 1)]),
    (.meet (lst [up .hole]) (lst [hide (s "a"), s "b"]), .list [.str "B"]),
    (.meet (lst [up .hole, s "z"]) (lst [type (s "a"), s "b"]), .list [.str "B", .str "z"]),
    (.meet (lst [hide (up .hole), s "z"]) (lst [s "a", s "b"]), .list [.str "z"]),
    (.meet (.meet (lst [up .hole]) (lst [hide (s "a")])) (lst [s "b"]), .list [.str "B"]),
    (.meet (spm [] (up .hole)) (mp [("a", s "x")]), .map [("a", .str "X")]),
    (.meet (spm [] (up .hole)) (mp [("a", s "x"), ("b", s "y")]), .map [("a", .str "X"), ("b", .str "Y")]),
    (.meet (mp [("a", s "x")]) (spm [] (up .hole)), .map [("a", .str "X")]),
    (spm [("a", s "x")] (up .hole), .map [("a", .str "X")]),
    (.meet (spm [("a", s "x")] (up .hole)) (mp [("b", s "y")]), .map [("a", .str "X"), ("b", .str "Y")]),
    (.meet (spm [] (up .hole)) (.meet (mp [("a", s "x")]) (mp [("b", s "y")])), .map [("a", .str "X"), ("b", .str "Y")]),
    (.meet (.meet (spm [] (up .hole)) (mp [("c", n 1)])) (mp [("a", s "x")]), .map [("a", .str "X"), ("c", .integer 1)]),
    (.meet (.meet (spm [] (add1 .hole)) (mp [("a", n 1)])) (mp [("a", n 2)]), .map [("a", .integer 2)]),
    (.meet (.meet (spm [] (add1 .hole)) (mp [("a", n 1)])) (mp [("b", n 5)]), .map [("a", .integer 2), ("b", .integer 6)]),
    (.meet (.meet (spm [] (up .hole)) (mp [("a", s "x")])) (mp [("a", s "x")]), .map [("a", .str "X")]),
    (.meet (spm [("a", n 1)] (add1 .hole)) (mp [("a", n 2)]), .map [("a", .integer 2)]),
    (.meet (spm [] (up .hole)) (mp [("a", up .hole)]), .map [("a", .str "X")]),
    (mp [("n", .meet (spm [] (up .hole)) (mp [("a", s "x")]))], .map [("n", .map [("a", .str "X")])]),
    (.meet (mp [("n", spm [] (up .hole))]) (mp [("n", mp [("a", s "x")])]), .map [("n", .map [("a", .str "X")])]),
    (.meet (spl [] (up .hole)) (lst [s "a", s "b"]), .list [.str "A", .str "B"]),
    (.meet (lst [s "a", s "b"]) (spl [] (up .hole)), .list [.str "A", .str "B"]),
    (.meet (spl [s "q"] (up .hole)) (lst [s "a", s "b"]), .list [.str "Q"]),
    (.meet (spl [] (up .hole)) (lst [hide (s "q"), s "b"]), .list [.str "B"]),
    (.meet (.meet (spl [] (add1 .hole)) (lst [n 1, n 2])) (lst [n 2, n 3]), .list [.integer 2, .integer 3]),
    (.map [("a", false, s "x")] (some (.select .key [(.string, .any)] (some (up .hole)))) false, .map [("a", .str "x")]),
    (.meet (spm [] (mp [("n", up .hole)])) (mp [("a", mp [("n", s "x")])]), .map [("a", .map [("n", .str "X")])]),
    (.meet (spm [] (mp [("n", up .hole)])) (mp [("a", mp [("n", s "x")])]), .map [("a", .map [("n", .str "x")])]),
    (spm [] (mp [("n", up .hole)]), .map [("a", .map [("n", .str "x")])]),
    (spm [] (mp [("n", up .hole)]), .map [("a", .map [])]),
    (.meet (mp [("a", mp [("n", s "x")])]) (spm [] (mp [("n", up .hole)])), .map [("a", .map [("n", .str "X")])]),
    (spm [("a", mp [("n", s "x")])] (mp [("n", up .hole)]), .map [("a", .map [("n", .str "X")])]),
    (.meet (spm [] (mp [("n", add1 .hole)])) (mp [("a", mp [("n", n 1)])]), .map [("a", .map [("n", .integer 2)])]),
    (.meet (spl [] (mp [("n", up .hole)])) (lst [mp [("n", s "x")]]), .list [.map [("n", .str "X")]]),
    (.meet (lst [mp [("n", s "x")]]) (spl [] (mp [("n", up .hole)])), .list [.map [("n", .str "X")]]),
    (.meet (spm [] (mp [("n", up .hole)])) (mp [("a", mp [])]), .map [("a", .map [("n", .str "x")])]),
    (.meet (spm [] (mp [("n", up .hole), ("m", n 1)])) (mp [("a", mp [("n", s "x")])]),
      .map [("a", .map [("n", .str "X"), ("m", .integer 1)])]),
    (.meet (spm [] (lst [up .hole])) (mp [("a", lst [s "x"])]), .map [("a", .list [.str "X"])]),
    (.meet (spm [] (spm [] (up .hole))) (mp [("a", mp [("b", s "x")])]), .map [("a", .map [("b", .str "X")])]),
    (.meet (mp [("x", mp [("a", mp [("n", s "x")])])]) (mp [("x", spm [] (mp [("n", up .hole)]))]),
      .map [("x", .map [("a", .map [("n", .str "X")])])]),
    (.meet (spm [] (mp [("n", up .hole)])) (mp [("a", mp [("n", s "x")]), ("b", mp [("n", s "y")])]),
      .map [("a", .map [("n", .str "X")]), ("b", .map [("n", .str "Y")])]),
    (.meet (.meet (spm [] (mp [("n", up .hole)])) (mp [("a", mp [("n", s "x")])])) (mp [("b", mp [("n", s "y")])]),
      .map [("a", .map [("n", .str "X")]), ("b", .map [("n", .str "Y")])]),
    (.meet (.meet (spm [] (mp [("n", up .hole)])) (mp [("a", mp [("n", s "x")])])) (mp [("a", mp [("n", s "X")])]),
      .map [("a", .map [("n", .str "X")])]),
    (.meet (spm [] (mp [("n", up .hole)])) (.meet (mp [("a", mp [("n", s "x")])]) (mp [("b", mp [("n", s "y")])])),
      .map [("a", .map [("n", .str "X")]), ("b", .map [("n", .str "Y")])]),
    (.meet (spm [] (mp [("n", up .hole)])) (mp [("a", mp [("n", up .hole)])]), .map [("a", .map [("n", .str "X")])]),
    (.meet (spm [] (mp [("n", up .hole)])) (mp [("a", .or [(0, mp [("n", s "x")]), (0, mp [("n", s "y")])])]),
      .map [("a", .map [("n", .str "X")])]),
    (.meet (spm [] (mp [("n", up .hole)])) (mp [("a", .or [(0, mp [("n", s "x")]), (0, mp [("n", s "y")])])]),
      .map [("a", .map [("n", .str "Z")])]),
    (spm [("a", .or [(0, mp [("n", s "x")]), (0, mp [("n", s "y")])])] (mp [("n", up .hole)]),
      .map [("a", .map [("n", .str "Y")])]),
    (.meet (mp [("a", .or [(0, mp [("n", s "x")]), (0, mp [("n", s "y")])])]) (spm [] (mp [("n", up .hole)])),
      .map [("a", .map [("n", .str "X")])]),
    (.meet (spl [] (mp [("n", up .hole)])) (lst [.or [(0, mp [("n", s "x")]), (0, mp [("n", s "y")])]]),
      .list [.map [("n", .str "X")]]),
    (.meet (n 1) .hole, .integer 1), (.meet (n 1) .hole, .integer 2), (.meet (s "a") .hole, .str "a"),
    (.meet (mp [("a", n 1)]) (mp [("a", .hole)]), .map [("a", .integer 1)]),
    (.meet (lst [n 1]) (lst [.hole]), .list [.integer 1]),
    (.meet .number .hole, .integer 1), (.meet .hole .number, .integer 1), (.meet .string .hole, .integer 1),
    (.meet (mp [("a", .number)]) (mp [("a", .hole)]), .map [("a", .integer 1)]),
    (.meet (.meet (s "x") (up .hole)) .hole, .str "X"),
    (.meet (md (mp [("a", up .hole)])) (mp [("a", s "x")]), .map [("a", .str "X")]),
    (.meet (mp [("a", s "x")]) (md (mp [("a", up .hole)])), .map [("a", .str "X")]),
    (.meet (md (lst [up .hole])) (lst [s "a"]), .list [.str "A"]),
    (.meet (.ride .deprecate (mp [("a", up .hole)]) []) (mp [("a", s "x")]), .map [("a", .str "X")]),
    (.meet (hide (mp [("a", up .hole)])) (mp [("a", s "x")]), .map [("a", .str "X")]),
    (.meet (type (mp [("a", up .hole)])) (mp [("a", s "x")]), .map [("a", .str "X")]),
    (.meet (.list [up .hole] none true) (lst [s "a"]), .list [.str "A"]),
    (.meet (.map [("a", false, up .hole)] none true) (mp [("a", s "x"), ("b", s "y")]),
      .map [("a", .str "X"), ("b", .str "y")]),
    (.meet (md (mp [("a", .call .sum [.hole])])) (lst [n 1, n 2]), .map [("a", .integer 3)]),
    (.meet (.ride .metadata (md (mp [("a", up .hole)])) [("e", .integer 2)]) (mp [("a", s "x")]),
      .map [("a", .str "X")]),
    (.meet (md (mp [("a", up .hole)])) (mp [("a", .hole)]), .map [("a", .str "x")]),
    (.meet (md .hole) (s "x"), .str "x"),
    (.meet (.call .join [lst [s "a", .hole], s "-"]) (s "b"), .str "a-b"),
    (.meet (.call .join [lst [.hole, s "b"], s "-"]) (s "a"), .str "a-b"),
    (.meet (.call .join [lst [s "a", .hole], s "-"]) (s "b"), .str "b"),
    (.meet (.call .join [lst [s "a", .hole], s "-"]) (s "a-b"), .str "a-b"),
    (.meet (mp [("a", .call .join [lst [s "x", .hole], s "-"])]) (mp [("a", s "y")]), .map [("a", .str "x-y")]),
    (.meet (lst [s "a", s "b"]) (.call .sum [.hole]), .integer 3),
    (.meet (.meet (spm [] (mp [("n", add1 .hole)])) (mp [("a", mp [("n", n 1)])])) (mp [("a", mp [])]),
      .map [("a", .map [("n", .integer 2)])]),
    (.meet (.meet (spm [] (mp [("n", add1 .hole)])) (mp [("a", mp [("n", n 1)])])) (mp [("a", mp [])]),
      .map [("a", .map [("n", .integer 3)])]),
    (.meet (.meet (spm [] (mp [("n", add1 .hole)])) (mp [("a", mp [])])) (mp [("a", mp [("n", n 1)])]),
      .map [("a", .map [("n", .integer 2)])]),
    (.meet (spm [] (mp [("n", add1 .hole)])) (.meet (mp [("a", mp [("n", n 1)])]) (mp [("a", mp [])])),
      .map [("a", .map [("n", .integer 2)])]),
    (.meet (spm [("a", mp [("n", n 1)])] (mp [("n", add1 .hole)])) (mp [("a", mp [("n", n 2)])]),
      .map [("a", .map [("n", .integer 2)])]),
    (.meet (.meet (spm [] (lst [add1 .hole])) (mp [("a", lst [n 1])])) (mp [("a", lst [n 2])]),
      .map [("a", .list [.integer 2])]),
    (.meet (.meet (spm [] (mp [("n", add1 .hole)])) (mp [("a", mp [("n", n 1)])])) (mp [("b", mp [("n", n 5)])]),
      .map [("a", .map [("n", .integer 2)]), ("b", .map [("n", .integer 6)])]),
    (.meet (spm [] (mp [("n", up .hole)])) (mp [("a", mp [])]), .map [("a", .map [])]),
    (.meet (.meet (.meet (spm [] (mp [("n", add1 .hole)])) (mp [("a", mp [("n", n 1)])])) (mp [("a", mp [])]))
      (mp [("a", mp [])]), .map [("a", .map [("n", .integer 2)])]),
    (.len (.meet (add1 .hole) (n 2)), .list [.str "a"]),
    (.len (.meet (add1 .hole) (n 2)), .list [.str "a", .str "b", .str "c"]),
    (.must (.meet (up .hole) (s "a")) "m", .str "A"), (.must (.meet (up .hole) (s "a")) "m", .str "a"),
    (.select (s "A") [(.meet (up .hole) (s "a"), n 1)] (some (n 2)), .integer 1),
    (.when .string (.meet (up .hole) (s "a")) none, .str "A"),
    (.when .string (.meet (up .hole) (s "a")) none, .str "a"),
    (.contains (.meet (add1 .hole) (n 0)) (.min (.num one)), .list [.integer 2]),
    (.contains (.meet (add1 .hole) (n 0)) (.min (.num one)), .list [.integer 1]),
    (.rest (.meet (add1 .hole) (n 0)) [], .map [("a", .integer 2)]),
    (.rest (.meet (add1 .hole) (n 0)) [], .map [("a", .integer 1)]),
    (.nof (n 1) [.meet (add1 .hole) (n 0), n 5], .integer 1),
    (.nof (n 1) [.meet (add1 .hole) (n 0), n 5], .integer 2),
    (.meet (.call .plus [lst [s "a", .hole], lst [s "c"]]) (lst [s "a", s "b", s "c"]),
      .list [.str "a", .str "b", .str "c"]),
    (.meet (.call .plus [lst [s "a", .hole], lst [s "c"]]) (lst [s "a", s "b", s "c"]),
      .list [.str "a", .list [.str "a", .str "b", .str "c"], .str "c"]),
    (.meet (.call .plus [lst [.hole], .hole]) (lst [s "a"]), .list [.str "a"]),
    (.meet (.call .plus [lst [.hole], .hole]) (lst [s "a"]), .list [.list [.str "a"], .str "a"]),
    (.call .plus [lst [s "a", .hole], lst [s "c"]], .list [.str "a", .str "b", .str "c"]),
    (.meet (.call .plus [.hole, lst [s "c"]]) (lst [s "a"]), .list [.str "a", .str "c"]),
    (.meet (.call .plus [lst [up .hole], lst [s "c"]]) (lst [s "a", s "c"]), .list [.str "A", .str "c"]),
    (.meet (.call .plus [lst [up .hole], lst [s "c"]]) (lst [s "a", s "c"]), .list [.str "a", .str "c"]),
    (.meet (lst [s "a", s "c"]) (.call .plus [lst [up .hole], lst [s "c"]]), .list [.str "A", .str "c"]),
    (.meet (.call .plus [lst [s "a"], lst [up .hole]]) (lst [s "a", s "c"]), .list [.str "a", .str "C"]),
    (.meet (.call .plus [lst [mp [("k", up .hole)]], lst [s "c"]]) (lst [mp [("k", s "a")], s "c"]),
      .list [.map [("k", .str "A")], .str "c"]),
    (.call .plus [lst [n 5], lst [mp [("n", .keyUp 1)]]], .list [.integer 5, .map [("n", .str "0")]]),
    (.call .plus [lst [n 5], lst [mp [("n", .keyUp 1)]]], .list [.integer 5, .map [("n", .str "1")]]),
    (.call .plus [.list [n 1] (some .string) false, lst []], .list [.integer 1]),
    (.call .plus [.list [s "a"] (some (up .hole)) false, lst [s "b"]], .list [.str "A", .str "b"])]

set_option maxRecDepth 8192 in
/-- The shapes in which the data once filled a hole the document left
unfilled (decision 29, which ruling 34 supersedes), for the `verdict`
rows dv0 on: a call over a hole against data a fill would have passed
and data it wouldn't, inside a map and a list, a spread and a
generator's data, in a disjunction's arm and a lone preference, and a
call over a container whose argument is the hole. The data never binds
a hole, so each is an error whatever the data. -/
def dataFillCases : List (Val × Data) :=
  let up (v : Val) : Val := .call .upper [v]
  let add1 (v : Val) : Val := .call .add [v, n 1]
  let mp (fs : List (String × Val)) : Val := .map (fs.map fun (k, v) => (k, false, v)) none false
  let spm (fs : List (String × Val)) (t : Val) : Val := .map (fs.map fun (k, v) => (k, false, v)) (some t) false
  [(up .hole, .str "a"), (up .hole, .str "A"), (up .hole, .integer 1), (up .hole, .map [("a", .integer 1)]),
    (add1 .hole, .integer 2), (add1 .hole, .integer 3), (add1 .hole, .str "a"),
    (.meet (up .hole) (s "A"), .str "a"), (.meet (up .hole) (s "A"), .str "A"),
    (mp [("a", up .hole)], .map [("a", .str "x")]), (mp [("a", up .hole)], .map []),
    (lst [up .hole], .list [.str "a"]), (.meet (lst [up .hole]) (lst [.ride .hide (s "a") []]), .list [.str "A"]),
    (spm [] (up .hole), .map [("a", .str "x")]),
    (.call .each [.hole, up .hole], .list [.str "a", .str "b"]), (.hole, .str "a"),
    (.meet .hole .hole, .str "a"), (.meet (up .hole) .hole, .str "A"), (.meet (up .hole) (up .hole), .str "A"),
    (.call .each [.hole, up (mp [])], .list []), (.call .each [.hole, up (mp [])], .list [.str "a"]),
    (mp [("a", .call .each [.hole, up (mp [])])], .map []),
    (.call .pack [.hole, mp [("n", up (mp []))]], .list []),
    (.or [(0, up .hole), (0, s "fallback")], .str "a"), (.or [(0, up .hole), (0, s "fallback")], .str "fallback"),
    (.or [(0, up .hole), (0, s "fallback")], .integer 1), (.or [(0, add1 .hole), (0, s "z")], .integer 2),
    (mp [("a", .or [(0, up .hole), (0, s "x")])], .map [("a", .str "y")]),
    (lst [.or [(0, up .hole), (0, s "x")]], .list [.str "y"]),
    (.meet (.or [(0, up .hole), (0, s "x")]) (s "a"), .str "A"),
    (.meet (s "a") (.or [(0, up .hole), (0, s "x")]), .str "A"),
    (.meet (mp [("a", .or [(0, up .hole), (0, s "x")])]) (mp [("a", s "y")]), .map [("a", .str "Y")]),
    (.meet (mp [("a", s "y")]) (mp [("a", .or [(0, up .hole), (0, s "x")])]), .map [("a", .str "Y")]),
    (.or [(0, add1 .hole), (0, s "x")], .str "x"), (.or [(0, add1 .hole), (0, s "x")], .integer 2),
    (.or [(0, add1 .hole), (0, .call .add [.hole, n 2]), (0, s "x")], .str "x"),
    (.or [(0, add1 .hole), (0, .call .add [.hole, n 2])], .str "x"),
    (mp [("a", .or [(0, add1 .hole), (0, s "x")])], .map [("a", .str "x")]),
    (lst [.or [(0, add1 .hole), (0, s "x")]], .list [.str "x"]),
    (.pref 1 (up .hole), .str "a"), (.pref 1 (up .hole), .integer 1),
    (.pref 1 (add1 .hole), .integer 2), (.pref 1 (add1 .hole), .str "x"),
    (mp [("a", .pref 1 (up .hole))], .map [("a", .str "a")]), (mp [("a", .pref 1 (up .hole))], .map []),
    (lst [.pref 1 (up .hole)], .list [.str "a"]),
    (.meet (mp [("a", up .hole)]) (.or [(0, mp [("a", s "a")]), (0, mp [("a", s "b")])]), .map [("a", .str "A")]),
    (.meet (mp [("a", up .hole)]) (.or [(0, mp [("a", s "a")]), (0, mp [("a", s "b")])]), .map [("a", .str "C")]),
    (.meet (.or [(0, mp [("a", s "a")]), (0, mp [("a", s "b")])]) (mp [("a", up .hole)]), .map [("a", .str "A")]),
    (.meet (mp [("x", mp [("a", up .hole)])]) (mp [("x", .or [(0, mp [("a", s "a")]), (0, mp [("a", s "b")])])]),
      .map [("x", .map [("a", .str "A")])]),
    (.meet (lst [up .hole]) (.or [(0, lst [s "a"]), (0, lst [s "b"])]), .list [.str "A"]),
    (.meet (.meet (mp [("a", up .hole)]) (mp [("b", n 1)])) (.or [(0, mp [("a", s "a")]), (0, mp [("a", s "b")])]),
      .map [("a", .str "A"), ("b", .integer 1)]),
    (.meet (.pref 1 (up .hole)) (s "a"), .str "A"), (.meet (.pref 1 (up .hole)) (s "a"), .str "a"),
    (.meet (.pref 1 (up .hole)) (s "a"), .str "b"),
    (.meet (s "a") (.pref 1 (up .hole)), .str "A"), (.meet (s "a") (.pref 1 (up .hole)), .str "a"),
    (.meet (.pref 1 (add1 .hole)) (n 1), .integer 2), (.meet (.pref 1 (add1 .hole)) (n 1), .integer 1),
    (.meet (.pref 1 (add1 .hole)) (n 1), .integer 3),
    (mp [("a", .meet (.pref 1 (up .hole)) (s "a"))], .map [("a", .str "A")]),
    (mp [("a", .meet (.pref 1 (up .hole)) (s "a"))], .map [("a", .str "a")]),
    (lst [.meet (.pref 1 (up .hole)) (s "a")], .list [.str "A"]),
    (.meet (.meet (.pref 1 (up .hole)) (s "a")) (s "A"), .str "A"),
    (.meet (.meet (.pref 1 (up .hole)) (s "a")) (s "A"), .str "a"),
    (.meet (mp []) (mp [("a", .hole)]), .map [("a", .str "x")]),
    (.meet (mp [("a", .hole)]) (mp []), .map [("a", .str "x")]),
    (.call .sum [.hole], .list [.integer 1, .integer 2]), (.call .sum [.hole], .integer 3),
    (.call .sum [.hole], .map [("a", .integer 1), ("b", .integer 2)]),
    (.call .sum [.hole], .list [.str "a", .str "b"]),
    (.call .least [.hole], .list [.integer 1, .integer 2]), (.call .least [.hole], .list []),
    (.call .greatest [.hole], .list [.integer 1, .integer 2]),
    (.call .sort [.hole], .list [.str "b", .str "a"]),
    (.call .pick [.hole, s "a"], .list [.map [("a", .integer 1)]]),
    (.call .join [.hole, s "-"], .list [.str "a", .str "b"]),
    (.call .join [lst [s "a", s "b"], .hole], .str "-"),
    (mp [("k", .call .sum [.hole])], .map [("k", .list [.integer 1, .integer 2])])]

theorem dataFillCases_checkable : ∀ c ∈ dataFillCases, (vetDoc c).1.CheckableA := by decide

theorem data_fill_verdict_exact : ∀ c ∈ dataFillCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (dataFillCases_checkable c hc)) v

set_option maxRecDepth 8192 in
/-- A disjunction's arm that does not stand, for the `verdict` rows da0
on: a call the reading can't make, by its domain, its count of
arguments or a call inside it, one inside a map or a list, and a size
that holds a choice, each dropping as a conflict's arm does, so that
the other arm stands, but one that holds a hole, which is an error of
the schema wherever it stands (ruling 34); and an error where no arm
stands, where the call stands alone, or where a preference clash is
between the arms the disjunction is read with, as both ports answer. -/
def illArmCases : List (Val × Data) :=
  let add1 (v : Val) : Val := .call .add [v, n 1]
  let mp (fs : List (String × Val)) : Val := .map (fs.map fun (k, v) => (k, false, v)) none false
  [(.or [(0, add1 (s "x")), (0, s "x")], .str "x"), (add1 (s "x"), .str "x"),
    (.or [(0, add1 (s "x")), (0, add1 (s "y"))], .str "x"),
    (.or [(0, .call .add [.hole]), (0, s "x")], .str "x"),
    (.or [(0, mp [("a", add1 (s "x"))]), (0, s "x")], .str "x"),
    (.or [(0, lst [add1 (s "x")]), (0, s "x")], .str "x"),
    (.or [(0, .call .add [.hole, add1 (s "x")]), (0, s "x")], .str "x"),
    (.or [(0, .len (.or [(0, n 1), (0, n 3)])), (0, s "x")], .str "x"),
    (.or [(0, mp [("a", .or [(1, n 1), (1, n 2)])]), (0, s "x")], .str "x"),
    (.or [(0, .or [(1, n 1), (1, n 2)]), (0, s "x")], .str "x")]

theorem illArmCases_checkable : ∀ c ∈ illArmCases, (vetDoc c).1.CheckableA := by decide

theorem ill_arm_verdict_exact : ∀ c ∈ illArmCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (illArmCases_checkable c hc)) v

set_option maxRecDepth 8192 in
/-- A meet of two sides that both waited on a hole, which the meet once
read as an error however the document grouped it, for the `verdict` rows
dg0 on: a call met with a hole and with another call over one, a group
that filled its own hole, in maps' and lists' members and a spread's
template, in a disjunction's arm and beside a literal. Each holds a hole
that nothing binds, so each is an error of the schema (ruling 34). -/
def groupCases : List (Val × Data) :=
  let up (v : Val) : Val := .call .upper [v]
  let lo (v : Val) : Val := .call .lower [v]
  let g : Val := .meet (up .hole) .hole
  let mp (fs : List (String × Val)) : Val := .map (fs.map fun (k, v) => (k, false, v)) none false
  [(.meet g (s "x"), .str "X"), (.meet (s "x") g, .str "X"), (.meet g .hole, .str "A"),
    (.meet (.meet .hole .hole) (up .hole), .str "a"), (.meet (up .hole) (.meet .hole .hole), .str "a"),
    (.meet (.meet (up .hole) (lo .hole)) (s "x"), .str "x"),
    (.meet g (.or [(0, s "x"), (0, s "y")]), .str "X"), (.meet (.pref 1 g) (s "x"), .str "x"),
    (.meet (mp [("a", g)]) (mp [("a", s "x")]), .map [("a", .str "X")]),
    (.meet (.meet (mp [("a", up .hole)]) (mp [("a", .hole)])) (mp [("a", s "x")]), .map [("a", .str "X")]),
    (.meet (.meet (lst [up .hole]) (lst [.hole])) (lst [s "x"]), .list [.str "X"]),
    (.meet (.meet (.map [] (some (up .hole)) false) (mp [("a", .hole)])) (mp [("a", s "x")]),
      .map [("a", .str "X")]),
    (.or [(0, g), (0, s "x")], .str "x"), (.or [(0, g), (0, s "x")], .str "X"),
    (.or [(0, .meet g (s "x")), (0, s "y")], .str "y"), (.or [(1, g), (0, s "x")], .str "x"),
    (.meet (.or [(0, g), (0, s "x")]) (s "x"), .str "x"), (.meet (.or [(0, g), (0, s "x")]) (s "y"), .str "y"),
    (.or [(0, g), (0, .meet (lo .hole) .hole)], .str "x"),
    (.meet (mp [("a", up .hole)]) (.or [(0, mp [("a", .hole)]), (0, mp [("a", s "x")])]), .map [("a", .str "x")]),
    (.or [(0, .meet (mp [("a", up .hole)]) (mp [("a", .hole)])), (0, s "x")], .str "x"),
    (.or [(0, .meet .hole .hole), (0, s "x")], .str "a"), (lst [.or [(0, g), (0, s "x")]], .list [.str "x"]),
    (.or [(0, .meet (.ride .type (up .hole) []) .hole), (0, s "x")], .str "x"),
    (.meet (s "X") g, .str "X"), (.meet (s "x") (.meet .hole (up .hole)), .str "X"),
    (.meet (s "x") (.meet (up .hole) (s "y")), .str "Y"),
    (.meet (mp [("a", s "x")]) (.meet (mp [("a", up .hole)]) (mp [("a", .hole)])), .map [("a", .str "X")]),
    (.meet (mp [("a", s "x")]) (.meet (mp [("b", s "b"), ("a", up .hole)]) (mp [("a", .hole)])),
      .map [("a", .str "X"), ("b", .str "b")]),
    (.meet (lst [s "x"]) (.meet (lst [up .hole]) (lst [.hole])), .list [.str "X"]),
    (.meet (lst [s "x", s "y"]) (.meet (lst [up .hole, s "y"]) (lst [.hole])), .list [.str "X", .str "y"]),
    (.meet (s "x") (.meet (mp [("a", up .hole)]) .hole), .str "x"),
    (.meet (n 1) (.meet (.call .plus [.hole, n 1]) .hole), .integer 2),
    (.meet (lst [s "y", s "x"]) (.meet (lst [s "y", up .hole]) (lst [.hole, .hole])), .list [.str "y", .str "X"]),
    (.meet (s "x") (.meet (lst [up .hole]) .hole), .str "x"),
    (.meet (s "A") (.meet (up (s "a")) .hole), .str "A"),
    (.meet (mp [("a", s "x")]) (.meet (mp [("a", s "x")]) (mp [("a", .hole)])), .map [("a", .str "x")]),
    (.meet (lst [s "x"]) (.meet (lst [s "x"]) (lst [.hole])), .list [.str "x"]),
    (.meet (lst [s "x", s "y"]) (.meet (lst [s "x", s "y"]) (lst [.hole])), .list [.str "x", .str "y"]),
    (.meet (mp [("a", s "X")]) (.meet (mp [("a", up .hole)]) (mp [("a", .meet .hole (s "X"))])),
      .map [("a", .str "X")]),
    (.meet (lst [s "X"]) (.meet (lst [up .hole]) (lst [.meet .hole (s "X")])), .list [.str "X"]),
    (.meet (s "x") (.meet (up .hole) (.meet .hole .hole)), .str "X"),
    (.meet (up .hole) (.meet .hole (s "A")), .str "A"),
    (.meet (up .hole) (.meet .hole (s "A")), .str "a"),
    (.meet (.meet .hole (s "A")) (up .hole), .str "A"),
    (.meet (s "A") (.meet (up .hole) (.meet .hole (s "A"))), .str "A"),
    (.meet (s "A") (.meet (.meet .hole (s "A")) (up .hole)), .str "A"),
    (.meet (up .hole) (.meet (up .hole) (s "a")), .str "A")]

theorem groupCases_checkable : ∀ c ∈ groupCases, (vetDoc c).1.CheckableA := by decide

theorem group_verdict_exact : ∀ c ∈ groupCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (groupCases_checkable c hc)) v

set_option maxRecDepth 8192 in
/-- A spread's template that holds a hole, which a member once filled
(ruling 31, which ruling 34 supersedes), for the `verdict` rows dt0 on:
a hole at the template's own position, beneath a side or an arm, inside
a container, under a rider or a mark, in a map and a list, against the
data and a member the document writes. A spread binds no hole and no
generator binds one in a spread's template, so each is an error of the
schema whatever its members. -/
def spreadTmplCases : List (Val × Data) :=
  let up (v : Val) : Val := .call .upper [v]
  let lo (v : Val) : Val := .call .lower [v]
  let add1 (v : Val) : Val := .call .add [v, n 1]
  let g : Val := .meet (up .hole) .hole
  let sm (t : Val) : Val := .map [] (some t) false
  let sl (t : Val) : Val := .list [] (some t) false
  let mp (fs : List (String × Val)) : Val := .map (fs.map fun (k, v) => (k, false, v)) none false
  let lm (t : String) : Val := mp [("n", s t)]
  let nd (t : String) : Data := .map [("n", .str t)]
  let tT : Val := .meet .hole (mp [("n", up .hole)])
  let tA : Val := .or [(0, up .hole), (0, mp [("n", up .hole)])]
  let tR : Val := .meet .hole (.ride .type (mp [("n", up .hole)]) [])
  let tM : Val := .meet .hole (.ride .metadata (mp [("n", up .hole)]) [("d", .integer 1)])
  [(sm g, .map [("a", .str "X")]), (sm g, .map [("a", .str "x")]), (sm g, .map []),
    (sl g, .list [.str "X"]), (sl g, .list [.str "X", .str "y"]),
    (sm g, .map [("a", .str "X"), ("b", .str "Y")]),
    (.meet (sm g) (mp [("a", s "X")]), .map [("a", .str "X")]),
    (.meet (sm g) (mp [("a", s "x")]), .map [("a", .str "X")]),
    (.meet (.meet (sm g) (mp [("a", s "X")])) (mp [("a", s "Y")]), .map [("a", .str "X")]),
    (.map [("b", false, s "Q")] (some g) false, .map [("b", .str "Q")]),
    (.map [("b", false, s "q")] (some g) false, .map [("b", .str "q")]),
    (sm (.meet (up .hole) (s "a")), .map [("b", .str "A")]), (sm (.meet (up .hole) (s "a")), .map [("b", .str "a")]),
    (sm (.meet (up .hole) (s "a")), .map []),
    (.meet (sm (.meet (up .hole) (s "a"))) (mp [("b", s "A")]), .map [("b", .str "A")]),
    (sl (.meet (up .hole) (s "a")), .list [.str "A"]), (sm (.meet (s "a") (up .hole)), .map [("b", .str "A")]),
    (sm (.meet (up .hole) (lo .hole)), .map [("a", .str "x")]), (sm (.meet (lo .hole) .hole), .map [("a", .str "x")]),
    (sm (.meet .hole .hole), .map [("a", .integer 1)]), (sm (.meet .hole (s "a")), .map [("b", .str "b")]),
    (sm (.meet (add1 .hole) .hole), .map [("a", .integer 1)]), (sm (.meet (add1 .hole) .number), .map [("a", .integer 1)]),
    (sm (.meet .number (add1 .hole)), .map [("a", .integer 1)]),
    (sm (.meet (up .hole) .string), .map [("a", .str "X")]), (sm (.meet (up .hole) .string), .map [("a", .str "x")]),
    (sm (.or [(0, g), (0, s "y")]), .map [("a", .str "Y")]), (sm (.or [(0, g), (0, s "y")]), .map [("a", .str "y")]),
    (sm (.or [(0, g), (0, s "y")]), .map [("a", .str "z")]),
    (sm (.or [(0, up .hole), (0, s "y")]), .map [("a", .str "y")]),
    (sm (.or [(0, add1 .hole), (0, s "x")]), .map [("a", .integer 1)]),
    (sm (.meet (.ride .type (up .hole) []) .hole), .map [("a", .str "X")]),
    (sm (mp [("n", .meet (up .hole) (s "a"))]), .map [("a", .map [("n", .str "A")])]),
    (sm (mp [("n", g)]), .map [("a", .map [("n", .str "X")])]),
    (sm (.or [(0, up .hole), (0, mp [("n", .meet (up .hole) (s "a"))])]), .map [("a", .map [("n", .str "A")])]),
    (sm (.or [(0, up .hole), (0, mp [("n", .meet (up .hole) (s "a"))])]), .map [("a", .map [("n", .str "a")])]),
    (sm (.or [(0, g), (0, mp [("n", .meet (up .hole) (s "a"))])]), .map [("a", .map [("n", .str "A")])]),
    (sm (.meet .hole (mp [("n", .meet (up .hole) (s "a"))])), .map [("a", .map [("n", .str "A")])]),
    (sm tT, .map [("a", nd "X")]), (sm tT, .map [("a", nd "x")]),
    (sm (.meet (mp [("n", up .hole)]) .hole), .map [("a", nd "X")]),
    (sm (.meet (mp [("n", up .hole)]) .hole), .map [("a", nd "x")]),
    (sm (mp [("n", up .hole)]), .map [("a", nd "X")]), (sm (mp [("n", up .hole)]), .map [("a", nd "x")]),
    (sm (.meet .hole (.list [up .hole] none false)), .map [("a", .list [.str "X"])]),
    (sm (.meet .hole (.list [up .hole] none false)), .map [("a", .list [.str "x"])]),
    (sm tA, .map [("a", nd "X")]), (sm tA, .map [("a", nd "x")]),
    (sm (.meet .hole (mp [("n", mp [("m", up .hole)])])), .map [("a", .map [("n", .map [("m", .str "X")])])]),
    (sm (.meet .hole (mp [("n", mp [("m", up .hole)])])), .map [("a", .map [("n", .map [("m", .str "x")])])]),
    (sl tT, .list [nd "X"]), (sl tT, .list [nd "x"]),
    (sm (.meet .hole (mp [("n", g)])), .map [("a", nd "X")]), (sm (.meet .hole (mp [("n", g)])), .map [("a", nd "x")]),
    (sm tT, .map [("a", .str "x")]), (sm tT, .map [("a", .map [])]), (sm tT, .map []),
    (.map [("a", false, lm "X")] (some tT) false, .map [("a", nd "X")]),
    (.map [("a", false, lm "x")] (some tT) false, .map [("a", nd "x")]),
    (.meet (mp [("a", lm "X")]) (sm tT), .map [("a", nd "X")]), (.meet (mp [("a", lm "x")]) (sm tT), .map [("a", nd "x")]),
    (.meet (sm tT) (mp [("a", lm "X")]), .map [("a", nd "X")]), (.meet (sm tT) (mp [("a", lm "x")]), .map [("a", nd "x")]),
    (.map [("a", false, lm "x")] (some tA) false, .map [("a", nd "X")]),
    (.meet (mp [("a", lm "x")]) (sm tA), .map [("a", nd "X")]),
    (.meet (.list [lm "X"] none false) (sl tT), .list [nd "X"]), (.meet (.list [lm "x"] none false) (sl tT), .list [nd "x"]),
    (.meet (sl tT) (.list [lm "X"] none false), .list [nd "X"]),
    (sm (.meet (.meet .hole (mp [("n", up .hole)])) (mp [("m", lo .hole)])),
      .map [("a", .map [("n", .str "X"), ("m", .str "y")])]),
    (sm (.meet (.meet .hole (mp [("n", up .hole)])) (mp [("m", lo .hole)])),
      .map [("a", .map [("n", .str "X"), ("m", .str "Y")])]),
    (sm .hole, .map [("a", .integer 1)]), (sm .hole, .map [("a", .str "a")]),
    (.meet (sm .hole) (mp [("a", n 1)]), .map [("a", .integer 1)]),
    (.meet (sm .hole) (mp [("a", n 1)]), .map [("a", .integer 2)]),
    (.meet (sl .hole) (.list [n 1] none false), .list [.integer 1]),
    (.meet (sl .hole) (.list [n 1] none false), .list [.integer 2]),
    (.meet (sm (.ride .type .hole [])) (mp [("a", n 1)]), .map [("a", .integer 1)]),
    (.meet (mp [("a", n 1)]) (sm .hole), .map [("a", .integer 1)]),
    (.meet (.list [n 1] none false) (sl .hole), .list [.integer 1]),
    (.meet (sm .hole) (mp [("a", mp [("x", n 1)])]), .map [("a", .map [("x", .integer 1)])]),
    (.meet (sm .hole) (mp [("a", .hole)]), .map [("a", .str "x")]),
    (.meet (sm tT) (mp [("a", .or [(0, lm "X"), (0, lm "Y")])]), .map [("a", nd "X")]),
    (sm tR, .map [("a", nd "X")]), (sm tR, .map [("a", nd "x")]),
    (.meet (sm tM) (mp [("a", lm "X")]), .map [("a", nd "X")]),
    (.meet (sm tM) (mp [("a", lm "x")]), .map [("a", nd "X")])]

theorem spreadTmplCases_checkable : ∀ c ∈ spreadTmplCases, (vetDoc c).1.CheckableA := by decide

theorem spread_tmpl_verdict_exact : ∀ c ∈ spreadTmplCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (spreadTmplCases_checkable c hc)) v

/-- A call over a container that holds a hole, which no peer of the
call filled (`place_container`), for the `verdict` rows dh0 on: each
function over a list that holds a hole, a `join`'s list and separator,
`sum` over a map and a nested list, as a list's element, marked, as an
optional member, under `pref` and as a disjunction's arm. The hole is
one nothing binds, so each is an error of the schema whatever the data
(ruling 34). -/
def heldHoleCases : List (Val × Data) :=
  let mp (fs : List (String × Val)) : Val := .map (fs.map fun (k, v) => (k, false, v)) none false
  let h1 : Val := lst [.hole]
  let hs : Val := .call .sum [lst [.hole, n 1]]
  let ja : Val := .call .join [lst [s "a", .hole]]
  let x : Data := .str "x"
  [(.call .add [h1, n 1], x), (.call .sub [h1, n 1], x), (.call .mul [h1, n 1], x),
    (.call .div [h1, n 1], x), (.call .mod [h1, n 1], x), (.call .rem [h1, n 1], x),
    (.call .add [n 1, h1], x), (.call .add [n 1, mp [("k", .hole)]], x),
    (.call .sum [h1], x), (.call .least [h1], x), (.call .greatest [h1], x),
    (.call .upper [h1], x), (.call .lower [h1], x), (.call .upper [s "x", h1], x),
    (.call .esc [h1], x), (.call .esc [s "x", h1], x), (.call .usc [h1], x),
    (.call .rep [h1, s "a", s "b"], x),
    (.call .split [h1, s ","], x), (.call .translate [h1, s "a", s "b"], x),
    (.call .nom [h1], x), (.call .pick [h1, s "a"], x),
    (.call .pick [lst [mp [("a", n 1)]], h1], x), (.call .sort [h1], x),
    (.call .sort [lst [n 1], h1], x), (.call .path [h1], x), (.call .abnf [h1], x),
    (.call .parse [h1], x), (.call (.cmp .line) [h1], x),
    (.call .join [lst [s "a"], h1], x), (.call .join [lst [s "a", .hole], h1], x),
    (.call .join [.hole, h1], .list [.str "a"]),
    (.call .upper [.call .join [h1]], x), (.call .split [ja, s ","], x),
    (hs, .integer 3), (.call .upper [h1], .str "A"),
    (.call .sum [mp [("k", .hole)]], .integer 3), (.call .sum [lst [h1, n 1]], .integer 3),
    (.call .sum [lst [.call .upper [.hole], n 1]], .integer 3),
    (.meet hs (n 3), .integer 3), (.meet hs (n 3), .integer 4),
    (.meet hs (lst [n 2, n 1]), .integer 3), (.meet hs .hole, .integer 3),
    (.meet hs hs, .integer 3),
    (lst [hs], .list [.integer 3]), (.ride .type hs [], .integer 3), (.ride .hide hs [], .integer 3),
    (.map [("a", true, hs)] none false, .map []), (.call .pref [hs], .integer 3),
    (.meet (.call .add [.hole, hs]) (n 2), .integer 3),
    (.or [(0, hs), (0, n 4)], .integer 4), (.or [(0, hs), (0, n 4)], .integer 3),
    (lst [ja], .list [.str "a"]), (.call .join [lst [ja]], x),
    (.call .sum [.meet (lst [.hole, n 1]) (lst [n 2, n 1])], .integer 3),
    (.map [] (some hs) false, .map [("a", .integer 3)]), (.map [] (some hs) false, .map [])]

set_option maxRecDepth 8192 in
theorem heldHoleCases_checkable : ∀ c ∈ heldHoleCases, (vetDoc c).1.CheckableA := by decide

theorem held_hole_verdict_exact : ∀ c ∈ heldHoleCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (heldHoleCases_checkable c hc)) v

/-- A call that takes its argument as the value it is, over a list or a
map that holds a hole, which the data once filled, for the `verdict`
rows dr0 on: `super`, `pref`, `move`, `relate`, the bounds and
`neq`, over a hole and over a call that waits on its own. The hole is
one nothing binds, so each is an error of the schema whatever the data
(ruling 34). -/
def readThroughCases : List (Val × Data) :=
  let h1 : Val := lst [.hole]
  let hk : Val := .map [("k", false, .hole)] none false
  let x : Data := .str "x"
  let l1 : Data := .list [.integer 1]
  let k1 : Data := .map [("k", .integer 1)]
  let l3 : Data := .list [.integer 3]
  let l34 : Data := .list [.integer 3, .integer 4]
  [(.call .super [h1], x), (.call .super [h1], l1), (.call .super [hk], k1),
    (.call .pref [h1], x), (.call .pref [h1], l1), (.call .move [h1], x), (.call .move [h1], l1),
    (.call .relate [h1], x), (.call .relate [h1], l1), (.call .relate [hk], k1),
    (.call (.bnd .min) [h1], x), (.call (.bnd .min) [h1], l1), (.call (.bnd .max) [hk], k1),
    (.call (.bnd .above) [h1], l1), (.call (.bnd .below) [h1], x), (.call (.bnd .mulof) [h1], l1),
    (.call (.bnd .neq) [h1], l1), (.call (.bnd .neq) [lst [n 1, .hole]], .integer 3),
    (.call (.bnd .neq) [lst [h1]], .integer 3),
    (.call .super [lst [up]], .integer 3), (.call .super [lst [up]], x), (.call .super [lst [up]], l3),
    (.call .super [lst [up]], .list [x]), (.call .super [lst [up]], .list []),
    (.call .super [lst [up, n 1]], l3), (.call .super [lst [up, n 1]], l34),
    (.call .super [lst [up, .hole]], l3), (.call .super [lst [up, .hole]], l34),
    (.call .super [lst [lst [up]]], .list [l3]), (.call .super [lst [lst [up]]], l3),
    (.call .super [.map [("k", false, up)] none false], k1),
    (.call .super [.map [("k", false, up)] none false], .map []),
    (.call .super [lst [.call .plus [.hole, n 1]]], l3),
    (.call .super [lst [.call .upper [.lit (.str "a"), .hole]]], l3),
    (.call .super [lst [.call .lower [.lit (.str "A"), .hole]]], l3)]

set_option maxRecDepth 8192 in
theorem readThroughCases_checkable : ∀ c ∈ readThroughCases, (vetDoc c).1.CheckableA := by decide

theorem read_through_verdict_exact : ∀ c ∈ readThroughCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (readThroughCases_checkable c hc)) v

set_option maxRecDepth 8192 in
theorem holeFillVetCases_checkable : ∀ c ∈ holeFillVetCases, (vetDoc c).1.CheckableA := by decide

theorem hole_fill_verdict_exact : ∀ c ∈ holeFillVetCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (holeFillVetCases_checkable c hc)) v

/-- The transformer `emit`, over a selection written in place: the first
template whose `match` takes a node taken, in the table's order, a map's
members in key order, and a table of one template written as the
template; a body's hole and its references into the node, in a map of
the body, through a map of the node and at a position of a list, a
map's key in digits among them; a list in a body spliced at any depth,
a nested `emit` among them, whose selection reads the outer node; an
empty selection and an empty body; a template's `match` fields met;
the dispatch, which takes a node the meet narrows nothing of, a kind
and a map of kinds among them, refusing one it narrows and one whose
meet holds a member it lacks, an optional key that generates nothing
being no member, and taking a disjunction with no preference where any
arm meets, under a rider too, each rider of the node and the `match`
read through, a member's among them, and a meet compared by its
conjuncts; a hole in a `match`, which matches nothing where it stands,
a spread among the places, and is the value it meets in a meet or an
arm; a body's piece read in normal form before it splices; and each
refusal both ports make an error: no template that matches, an empty
table, a template without its `match` or its `body`, or with a body
not written as a list, read before the selection, two bodies, a
selection that is no bag, and a reference the node doesn't answer, a
step up, a position past the end and one in a part the reading drops
among them, but one in a spread, which the ports leave unbound. -/
def emitCases : List (Val × Data) :=
  let rule (m : Val) (b : List Val) : Val := mp [("match", m), ("body", lst b)]
  let k1 : Val := mp [("k", int 1)]
  [(c .emit [lst [k1], rule k1 [str "a"]], jl [js "a"]),
    (c .emit [lst [k1], rule k1 [str "a"]], jl [js "b"]),
    (c .emit [lst [mp [("k", str "sqs"), ("p", str "x")], mp [("k", str "http"), ("u", str "/y")]],
      lst [rule (mp [("k", str "sqs")]) [c .plus [str "L:", nd ["p"]]],
        rule (mp [("k", str "http")]) [c .plus [str "S:", nd ["u"]]]]], jl [js "L:x", js "S:/y"]),
    (c .emit [lst [mp [("k", str "sqs")]], lst [rule (mp []) [str "first"], rule (mp [("k", str "sqs")]) [str "second"]]],
      jl [js "first"]),
    (c .emit [mp [("b", mp [("k", int 2)]), ("a", k1)], rule (mp [("k", .integer)]) [nd ["k"]]], jl [j 1, j 2]),
    (c .emit [mp [("b", mp [("k", int 2)]), ("a", k1)], rule (mp [("k", .integer)]) [nd ["k"]]], jl [j 2, j 1]),
    (c .emit [lst [], rule (mp []) [str "x"]], jl []),
    (c .emit [mp [], rule (mp []) [str "x"]], jl []),
    (c .emit [lst [k1], rule k1 [lst [str "a", str "b"], str "c"]], jl [js "a", js "b", js "c"]),
    (c .emit [lst [k1], rule k1 [.hole]], jl [jm [("k", j 1)]]),
    (c .emit [lst [mp [("k", int 1), ("c", lst [mp [("n", str "x")], mp [("n", str "y")]])]],
      rule k1 [str "open", c .emit [nd ["c"], rule (mp [("n", .string)]) [nd ["n"]]], str "close"]],
      jl [js "open", js "x", js "y", js "close"]),
    (c .emit [lst [k1], rule k1 [mp [("a", nd ["k"])]]], jl [jm [("a", j 1)]]),
    (c .emit [lst [mp [("m", mp [("p", str "x")])]], rule (mp [("m", mp [("p", .string)])]) [nd ["m", "p"]]],
      jl [js "x"]),
    (c .emit [lst [k1, mp [("p", str "q")]],
      lst [rule (mp [("p", .string)]) [nd ["p"]], rule (mp [("k", .integer)]) [nd ["k"]]]], jl [j 1, js "q"]),
    (c .emit [lst [k1], rule k1 []], jl []),
    (c .emit [lst [k1], rule (mp [("k", int 2)]) [str "x"]], jm []),
    (c .emit [lst [k1], lst []], jm []),
    (c .emit [lst [k1], mp [("match", k1)]], jm []),
    (c .emit [lst [k1], mp [("body", lst [str "x"])]], jm []),
    (c .emit [lst [k1], mp [("match", k1), ("body", str "x")]], jm []),
    (c .emit [int 1, rule (mp []) [str "x"]], jm []),
    (c .emit [lst [k1], rule k1 [nd ["nope"]]], jm []),
    (c .emit [lst [k1, mp [("p", str "q")]],
      lst [rule (mp [("k", .integer)]) [nd ["k"]], rule (mp [("p", .string)]) [nd ["p"], nd ["k"]]]], jm []),
    (c .emit [lst [k1], rule k1 [.path [.node, .up 2, .key "k"]]], jm []),
    (c .emit [lst [lst [int 10]], rule .listKind [.path [.node, .idx 0]]], jl [j 10]),
    (c .emit [lst [mp [("a", lst [int 5, int 6])]], rule .mapKind [.path [.node, .key "a", .idx 1]]], jl [j 6]),
    (c .emit [lst [mp [("a", mp [("b", lst [int 7])])]], rule .mapKind [.path [.node, .key "a", .key "b", .idx 0]]],
      jl [j 7]),
    (c .emit [lst [mp [("0", int 5)]], rule .mapKind [.path [.node, .idx 0]]], jl [j 5]),
    (c .emit [lst [lst [int 10]], rule .listKind [.path [.node, .idx 2]]], jm []),
    (c .emit [lst [int 1], rule .any [lst [lst [str "a"]]]], jl [js "a"]),
    (c .emit [lst [int 1], rule .any [lst [str "a", lst [str "b"]]]], jl [js "a", js "b"]),
    (c .emit [lst [], mp [("match", .any)]], jm []),
    (c .emit [lst [], mp [("body", lst [str "x"])]], jm []),
    (c .emit [lst [], lst []], jl []),
    (c .emit [lst [], lst [rule (int 1) []]], jl []),
    (c .emit [lst [k1], .map [("match", false, k1), ("match", false, mp [("k", int 2)]),
      ("body", false, lst [str "x"])] none false], jm []),
    (c .emit [lst [mp [("k", int 1), ("j", int 2)]], .map [("match", false, k1), ("match", false, mp [("j", int 2)]),
      ("body", false, lst [str "x"])] none false], jl [js "x"]),
    (c .emit [lst [int 1], .map [("match", false, .integer), ("body", false, lst [str "a"]),
      ("body", false, lst [str "a"])] none false], jm []),
    (c .emit [lst [.integer], rule .integer [str "x"]], jl [js "x"]),
    (c .emit [lst [.integer], rule .string [str "x"]], jm []),
    (c .emit [lst [mp [("a", .integer)]], rule (mp [("a", .integer)]) [str "x"]], jl [js "x"]),
    (c .emit [lst [mp [("a", .integer)]], rule (mp [("a", int 1)]) [str "x"]], jm []),
    (c .emit [lst [.min (nb 1)], rule (int 5) [str "x"]], jm []),
    (c .emit [lst [int 1], rule (.min (nb 0)) [str "x"]], jl [js "x"]),
    (c .emit [lst [k1], rule (mp [("k", int 1), ("j", int 2)]) [str "x"]], jm []),
    (c .emit [lst [k1], rule (.map [("k", false, int 1), ("j", true, int 2)] none false) [str "x"]], jm []),
    (c .emit [lst [k1], rule (.map [("k", false, int 1)] none true) [str "x"]], jl [js "x"]),
    (c .emit [lst [mp [("k", int 1), ("j", int 2)]], rule k1 [str "x"]], jl [js "x"]),
    (c .emit [lst [lst [int 1]], rule (lst [.integer]) [str "x"]], jl [js "x"]),
    (c .emit [lst [.or [(0, int 1), (0, int 2)]], rule (int 1) [str "x"]], jl [js "x"]),
    (c .emit [lst [.or [(1, int 1), (0, int 2)]], rule (int 1) [str "x"]], jm []),
    (c .emit [lst [k1], rule (.or [(0, k1), (0, mp [("j", int 2)])]) [str "x"]], jm []),
    (c .emit [lst [int 1], rule .hole [str "yes"]], jm []),
    (c .emit [lst [k1], rule (mp [("k", .hole)]) [str "yes"]], jm []),
    (c .emit [lst [lst [int 1]], rule (lst [.hole]) [str "x"]], jm []),
    (c .emit [lst [int 1], rule (.meet .hole .integer) [str "x"]], jl [js "x"]),
    (c .emit [lst [int 1], rule (.meet .integer .hole) [str "x"]], jl [js "x"]),
    (c .emit [lst [k1], rule (mp [("k", .meet .hole .integer)]) [str "x"]], jl [js "x"]),
    (c .emit [lst [int 1], rule (.or [(0, .hole), (0, int 2)]) [str "x"]], jl [js "x"]),
    (c .emit [lst [int 1], lst [rule .hole [str "a"], rule .any [str "b"]]], jl [js "b"]),
    (c .emit [lst [mp [("a", int 1)]], rule (mp [("a", nd ["a"])]) [str "x"]], jm []),
    (c .emit [lst [], mp [("match", .any), ("body", str "x")]], jm []),
    (c .emit [lst [], lst [rule .any [str "a"], mp [("match", int 1), ("body", int 2)]]], jm []),
    (c .emit [lst [.ride .metadata (.or [(0, int 1), (0, int 2)]) []], rule (int 1) [str "x"]], jl [js "x"]),
    (c .emit [lst [.ride .deprecate (.or [(0, int 1), (0, int 2)]) []], rule (int 1) [str "x"]], jl [js "x"]),
    (c .emit [lst [.ride .metadata (.or [(0, int 1), (0, int 2)]) []], rule (int 3) [str "x"]], jm []),
    (c .emit [lst [.ride .metadata (.or [(1, int 1), (0, int 2)]) []], rule (int 1) [str "x"]], jm []),
    (c .emit [lst [k1], rule (.map [("k", false, int 1), ("j", true, .integer)] none false) [str "x"]], jl [js "x"]),
    (c .emit [lst [k1], rule (.map [("k", false, int 1), ("j", true, mp [])] none false) [str "x"]], jl [js "x"]),
    (c .emit [lst [.map [("k", false, int 1), ("j", true, .integer)] none false], rule k1 [str "x"]], jl [js "x"]),
    (c .emit [lst [int 1], rule (.ride .metadata .integer []) [str "x"]], jl [js "x"]),
    (c .emit [lst [int 1], rule (.ride .type .integer []) [str "x"]], jl [js "x"]),
    (c .emit [lst [k1], rule (mp [("k", .ride .metadata (int 1) [])]) [str "x"]], jl [js "x"]),
    (c .emit [lst [int 1], rule .any [.meet (lst [str "a"]) (lst [str "a"])]], jl [js "a"]),
    (c .emit [lst [int 1], rule .any [.ride .metadata (lst [str "a"]) []]], jl [js "a"]),
    (c .emit [lst [int 1], rule .any [.select (int 1) [(int 1, str "x")] (some (nd ["missing"]))]], jl [js "x"]),
    (c .emit [lst [mp [("l", lst [mp [("x", int 1)]])]], rule .any [c .emit [nd ["l"], rule .any [nd ["x"]]]]],
      jl [j 1]),
    (c .emit [lst [], mp [("match", .any), ("body", c .each [lst [str "x"], .hole])]], jm []),
    (c .emit [lst [int 1], mp [("match", .any), ("body", .meet (lst [str "x"]) (lst [str "x"]))]], jm []),
    (c .emit [lst [.min (nb 1)], rule (.min (nb 1)) [str "x"]], jl [js "x"]),
    (c .emit [lst [.min (nb 1)], rule (.min (nb 2)) [str "x"]], jm []),
    (c .emit [lst [.meet .integer (.min (nb 1))], rule .integer [str "x"]], jl [js "x"]),
    (c .emit [lst [k1], rule (.map [] (some .hole) false) [str "x"]], jm []),
    (c .emit [lst [lst [int 1]], rule (.list [] (some .hole) false) [str "x"]], jm []),
    (c .emit [lst [mp []], rule (.map [] (some .hole) false) [str "x"]], jl [js "x"]),
    (c .emit [lst [k1], rule (.map [] (some (.meet .hole .integer)) false) [str "x"]], jl [js "x"]),
    (c .emit [lst [int 1], rule .any [.select (int 1) [(int 1, str "x")] (some (.map [] (some (nd ["missing"])) false))]],
      jl [js "x"]),
    (c .emit [lst [int 1], rule .any [.select (int 1) [(int 1, str "x")] (some (.list [] (some (nd ["missing"])) false))]],
      jl [js "x"]),
    (c .emit [lst [int 1], rule .any [.select (int 1) [(int 1, str "x")] (some (mp [("a", nd ["missing"])]))]],
      jl [js "x"]),
    (c .emit [lst [mp [("a", int 1)]], rule .any [.map [("x", false, int 1)] (some (nd ["a"])) false]],
      jl [.map [("x", j 1)]])]

theorem emitCases_checkable : ∀ c ∈ emitCases, (vetDoc c).1.CheckableA := by decide

theorem emit_verdict_exact : ∀ c ∈ emitCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (emitCases_checkable c hc)) v

/-- An `emit` template's `match` takes a node where the meet narrows
nothing in the node, read by the order as a `filter`'s condition is: a
node whose bound sits inside the `match`'s looser bound, one inside a
kind, and a map whose member holds the bound; a `match` that narrows,
which no template takes, an error; and a table whose first template
shares nothing with the node and whose second takes it. -/
def emitOrderCases : List (Val × Data) :=
  let rule (m : Val) (b : List Val) : Val := mp [("match", m), ("body", lst b)]
  let min (n : ℤ) (h : IntegerLeaf n := by decide) : Val := .min (.num (.integer ⟨n, h⟩))
  [(c .emit [lst [.meet .integer (min 3)], rule (.meet .hole (min 1)) [str "x"]], jl [js "x"]),
    (c .emit [lst [min 3], rule (.meet .hole .number) [str "x"]], jl [js "x"]),
    (c .emit [lst [mp [("p", .meet .integer (min 2))]], rule (.meet .hole (mp [("p", min 1)])) [str "x"]], jl [js "x"]),
    (c .emit [lst [.integer], rule (.meet .hole (min 1)) [str "x"]], jl [js "x"]),
    (c .emit [lst [min 3], lst [rule (.meet .hole .string) [str "s"], rule (.meet .hole (min 1)) [str "n"]]], jl [js "n"]),
    (c .emit [lst [min 3], lst [rule (.meet .hole .string) [str "s"], rule (.meet .hole (min 1)) [str "n"]]], jl [js "s"])]

theorem emitOrderCases_checkable : ∀ c ∈ emitOrderCases, (vetDoc c).1.CheckableA := by decide

theorem emitOrder_verdict_exact : ∀ c ∈ emitOrderCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (emitOrderCases_checkable c hc)) v

/-- `key(n)` in an `emit` body read where its piece lands (ruling 52): at
the index the piece takes in the output, counted across the nodes and
after the pieces each element before it splices; inside a list the
body writes at its index there; in a nested `emit` at its position in
that `emit`'s own output; `key()` the key of the member that holds the
`emit`, and a level past the top `""`; inside a map piece under the
member's key, and one level up at the piece's index; in a table of two
templates; in a generator inside a body and in a call; beside a
reference into the node; an `emit` in a generator's template, read
where its instance lands; and a marked piece, which takes no position,
as a list holds none for it. -/
def emitKeyCases : List (Val × Data) :=
  let rule (b : List Val) : Val := mp [("match", .any), ("body", lst b)]
  let nested : Val := c .emit [lst [int 1], rule [str "a", c .emit [lst [int 5, int 6], rule [k 0]]]]
  let two : Val := c .emit [lst [int 1, int 2], rule [str "a", k 0]]
  let inner : Val := c .emit [lst [int 1, int 2], rule [lst [str "p", k 0], k 0]]
  let up : Val := mp [("x", c .emit [lst [int 1, int 2], rule [k 1]])]
  let past : Val := c .emit [lst [int 1, int 2], rule [k 2]]
  let joined : Val := mp [("x", c .emit [lst [int 1], rule [c .plus [c .plus [k 1, str "-"], k 0]]])]
  let own : Val := c .emit [lst [int 1, int 2], rule [mp [("k", k 0)]]]
  let idx : Val := c .emit [lst [int 1, int 2], rule [mp [("k", k 1)]]]
  let table : Val := c .emit [lst [int 1, str "s"],
    lst [mp [("match", .number), ("body", lst [k 0])], mp [("match", .string), ("body", lst [str "t", k 0])]]]
  let gen : Val := c .emit [lst [int 1], rule [c .each [lst [str "p", str "q"], k 0]]]
  let node : Val := c .emit [lst [mp [("n", str "a")]], rule [.path [.node, .key "n"], k 0]]
  let deep : Val := c .emit [lst [int 1], rule [lst [lst [str "q", k 0]]]]
  let inEach : Val := c .each [lst [int 1], c .emit [lst [int 5], rule [k 0, k 1]]]
  let call : Val := c .emit [lst [int 1, int 2], rule [c .upper [k 0]]]
  let hidden : Val := c .emit [lst [int 1, int 2], rule [.ride .hide (str "h") [], k 0]]
  [(nested, jl [js "a", js "0", js "1"]), (nested, jl [js "a", js "0", js "0"]),
    (two, jl [js "a", js "1", js "a", js "3"]), (two, jl [js "a", js "1", js "a", js "1"]),
    (inner, jl [js "p", js "1", js "2", js "p", js "1", js "5"]),
    (inner, jl [js "p", js "1", js "1", js "p", js "1", js "1"]),
    (up, jm [("x", jl [js "x", js "x"])]), (up, jm [("x", jl [js "0", js "1"])]),
    (past, jl [js "", js ""]), (past, jl [js "v", js "v"]),
    (joined, jm [("x", jl [js "x-0"])]), (joined, jm [("x", jl [js "0-0"])]),
    (own, jl [jm [("k", js "k")], jm [("k", js "k")]]),
    (idx, jl [jm [("k", js "0")], jm [("k", js "1")]]), (idx, jl [jm [("k", js "k")], jm [("k", js "k")]]),
    (table, jl [js "0", js "t", js "2"]), (table, jl [js "0", js "t", js "1"]),
    (gen, jl [js "0", js "1"]), (node, jl [js "a", js "1"]), (deep, jl [js "q", js "1"]),
    (inEach, jl [jl [js "0", js "0"]]), (inEach, jl [jl [js "0", js "1"]]),
    (call, jl [js "0", js "1"]), (call, jl [js "0", js "0"]),
    (hidden, jl [js "0", js "1"]), (hidden, jl [js "1", js "3"])]

theorem emitKeyCases_checkable : ∀ c ∈ emitKeyCases, (vetDoc c).1.CheckableA := by decide

theorem emit_key_verdict_exact : ∀ c ∈ emitKeyCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (emitKeyCases_checkable c hc)) v

/-- An `emit`'s table written as an `emit` call, which reads as the
table it holds: a rule set waiting for its nodes, `emit(_, t)`, a call
whose selection is a bag, which the table position never makes, one
that holds a table of two templates, one wrapped twice, one whose body
holds a `key(n)`, read where its piece lands, and one that takes no
node, which is an error; and `emit(_, t)` alone, whose hole nothing
binds, and one whose template lacks its body, both errors. -/
def emitTableCases : List (Val × Data) :=
  let rule (m : Val) (b : List Val) : Val := mp [("match", m), ("body", lst b)]
  let held (t : Val) : Val := c .emit [.hole, t]
  let two : Val := lst [int 1, int 2]
  [(c .emit [two, held (rule .number [str "n"])], jl [js "n", js "n"]),
    (c .emit [two, held (rule .number [str "n"])], jl [js "n"]),
    (c .emit [two, c .emit [lst [int 3], rule .number [str "n"]]], jl [js "n", js "n"]),
    (c .emit [lst [int 1, str "s"], held (lst [rule .number [str "n"], rule .string [str "s"]])],
      jl [js "n", js "s"]),
    (c .emit [two, held (held (rule .number [str "n"]))], jl [js "n", js "n"]),
    (c .emit [two, held (rule .number [.keyUp 0])], jl [js "0", js "1"]),
    (c .emit [two, held (rule .number [.keyUp 0])], jl [js "0", js "0"]),
    (c .emit [lst [int 1], held (rule .string [str "x"])], jl []),
    (held (rule .number [str "n"]), jl []),
    (c .emit [lst [int 1], held (mp [("match", .number)])], jl [])]

theorem emitTableCases_checkable : ∀ c ∈ emitTableCases, (vetDoc c).1.CheckableA := by decide

theorem emit_table_verdict_exact : ∀ c ∈ emitTableCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (emitTableCases_checkable c hc)) v

/-- A named table, `%w = emit(_, t)`, the rule set an `emit` takes as its
table where it names it: once and in two places, met with the pieces it
makes, against data it refuses, and named alone, where nothing binds its
hole, an error; and a name for a template, whose body's `key(n)` reads
where its piece lands. -/
def emitNameCases : List (Decls × Val × Data) :=
  let rule (m : Val) (b : List Val) : Val := mp [("match", m), ("body", lst b)]
  let w : Decls := [("W", c .emit [.hole, rule .number [str "n"]])]
  [(w, c .emit [lst [int 1, int 2], .alias "W"], jl [js "n", js "n"]),
    (w, c .emit [lst [int 1, int 2], .alias "W"], jl [js "x"]),
    (w, mp [("a", c .emit [lst [int 1], .alias "W"]), ("b", c .emit [lst [int 2, int 3], .alias "W"])],
      jm [("a", jl [js "n"]), ("b", jl [js "n", js "n"])]),
    (w, .meet (c .emit [lst [int 1], .alias "W"]) (lst [str "n"]), jl [js "n"]),
    (w, .alias "W", jl []),
    ([("R", rule .number [.keyUp 0])], c .emit [lst [int 1, int 2], .alias "R"], jl [js "0", js "1"]),
    ([("R", rule .number [.keyUp 0])], c .emit [lst [int 1, int 2], .alias "R"], jl [js "0", js "0"])]

theorem emitNameCases_checkable : ∀ c ∈ emitNameCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (aliasDoc c).1.CheckableA := by decide

theorem emit_name_verdict_exact : ∀ c ∈ emitNameCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 (aliasDoc c).1 (aliasDoc c).2 = v ↔ Vet m c.1 (aliasDoc c).1 (aliasDoc c).2 v :=
  fun c hc _ v => vet_iff (emitNameCases_checkable c hc).1
    (readR_checkableA (emitNameCases_checkable c hc).1 (emitNameCases_checkable c hc).2) v

/-- A named table that names itself, a rule set that walks a nested
selection into nested output, unfolded a level for each turn the
expansion has left: down a tree of one child and of two, with a
`key(n)` in its body, two tables that name each other, over an empty
selection, and one that walks into itself without descending, which
spends the turns and is an error. -/
def emitRecCases : List (Decls × Val × Data) :=
  let nd (k : String) : Val := .path [.node, .key k]
  let pl (a b : Val) : Val := c .plus [a, b]
  let rule (m : Val) (b : List Val) : Val := mp [("match", m), ("body", lst b)]
  let held (t : Val) : Val := c .emit [.hole, t]
  let node (n : String) (kids : List Val) : Val := mp [("name", str n), ("kids", lst kids)]
  let walk : Decls := [("W", held (rule (mp [("name", .string)])
    [pl (pl (str "<") (nd "name")) (str ">"), c .emit [nd "kids", .alias "W"], pl (pl (str "</") (nd "name")) (str ">")]))]
  let keyed : Decls := [("K", held (rule (mp [("name", .string)]) [.keyUp 0, c .emit [nd "kids", .alias "K"]]))]
  let two : Decls := [("A", held (rule (mp [("name", .string)]) [nd "name", c .emit [nd "kids", .alias "B"]])),
    ("B", held (rule (mp [("name", .string)]) [pl (pl (str "(") (nd "name")) (str ")"), c .emit [nd "kids", .alias "A"]]))]
  let loop : Decls := [("L", held (rule .any [c .emit [lst [int 1], .alias "L"]]))]
  [(walk, c .emit [lst [node "a" [node "b" []]], .alias "W"], jl [js "<a>", js "<b>", js "</b>", js "</a>"]),
    (walk, c .emit [lst [node "a" [node "b" []]], .alias "W"], jl [js "<a>", js "</a>"]),
    (walk, c .emit [lst [node "a" [node "b" [], node "c" []]], .alias "W"],
      jl [js "<a>", js "<b>", js "</b>", js "<c>", js "</c>", js "</a>"]),
    (walk, c .emit [lst [], .alias "W"], jl []),
    (keyed, c .emit [lst [node "a" [node "b" []]], .alias "K"], jl [js "0", js "0"]),
    (two, c .emit [lst [node "x" [node "y" [node "z" []]]], .alias "A"], jl [js "x", js "(y)", js "z"]),
    (loop, c .emit [lst [int 1], .alias "L"], jl [])]

theorem emitRecCases_checkable : ∀ c ∈ emitRecCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (aliasDoc c).1.CheckableA := by decide

theorem emit_rec_verdict_exact : ∀ c ∈ emitRecCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 (aliasDoc c).1 (aliasDoc c).2 = v ↔ Vet m c.1 (aliasDoc c).1 (aliasDoc c).2 v :=
  fun c hc _ v => vet_iff (emitRecCases_checkable c hc).1
    (readR_checkableA (emitRecCases_checkable c hc).1 (emitRecCases_checkable c hc).2) v

/-- A template's `replace` map and its `esc` convention, written into its
body before any reading: a key in a literal line replaced by its value
read for each node, two keys, a number and a boolean spelled as `+`
spells them, a value a call makes, the node itself, a preference, each
convention and none, a value never scanned again, the pieces a nested
`emit` splices left as its own table makes them, the strings a piece
map's `n` list and `text` hold, an expression, a number, a list and a
map piece left as written, a table of two templates; and the template
refused, an error, before any node: a key inside another, an empty key,
one in no literal line or only in an expression, a `replace` that is no
map, an `esc` that names no convention or is no string, a `n` written
twice, and a value with no text, a map, a list, `null`, a kind, or a
field the node lacks. -/
def emitReplaceCases : List (Val × Data) :=
  let nd (k : String) : Val := .path [.node, .key k]
  let em (s t : Val) : Val := c .emit [s, t]
  let rp (m : Val) (r : List (String × Val)) (b : List Val) : Val :=
    mp [("match", m), ("replace", mp r), ("body", lst b)]
  let rpe (m e : Val) (r : List (String × Val)) (b : List Val) : Val :=
    mp [("match", m), ("esc", e), ("replace", mp r), ("body", lst b)]
  let one (fs : List (String × Val)) : Val := lst [mp fs]
  let pz : Val := one [("p", str "z")]
  let px : Val := one [("p", str "x")]
  let pin : Val := em (one [("pin", str "a:1")]) (rp (mp [("pin", .string)]) [("PIN", nd "pin")] [str "listen('PIN')"])
  let two : Val := em (lst [mp [("p", str "x")], mp [("p", str "y")]]) (rp (mp [("p", .string)]) [("P", nd "p")] [str "<P>"])
  let keys : Val := em (one [("a", int 1), ("b", int 2)]) (rp (mp []) [("A", nd "a"), ("B", nd "b")] [str "A+B=A B"])
  let spell : Val := em (one [("port", int 8080), ("on", .lit (.bool true))])
    (rp (mp []) [("PORT", nd "port"), ("ON", nd "on")] [str "listen(PORT, ON)"])
  let called : Val := em px (rp (mp []) [("P", c .upper [nd "p"])] [str "<P>"])
  let ofNode : Val := em (lst [str "a", str "b"]) (rp .string [("N", .hole)] [str "<N>"])
  let dq : Val := em (one [("pin", str "it\"s")]) (rp (mp [("pin", .string)]) [("PIN", nd "pin")] [str "x(\"PIN\")"])
  let sq : Val := em (one [("pin", str "it's")]) (rpe (mp [("pin", .string)]) (str "sq") [("PIN", nd "pin")] [str "x('PIN')"])
  let asIs : Val := em (one [("pin", str "it's")]) (rpe (mp [("pin", .string)]) (str "none") [("PIN", nd "pin")] [str "x(PIN)"])
  let xml : Val := em (one [("t", str "a<b")]) (rpe (mp []) (str "xml") [("T", nd "t")] [str "<p>T</p>"])
  let rescan : Val := em (one []) (rp (mp []) [("A", str "B"), ("B", str "c")] [str "A B"])
  let self : Val := em (one [("p", str "P")]) (rp (mp []) [("P", nd "p")] [str "P P"])
  let shared : Val := em px (rp (mp []) [("P", nd "p"), ("Q", nd "p")] [str "PQ", str "Q"])
  let spliced : Val := em (one [("x", int 1), ("c", lst [mp [("y", int 2)]])])
    (rp (mp []) [("X", nd "x")] [str "X", em (nd "c") (mp [("match", mp []), ("body", lst [str "X Y"])]), str "X"])
  let own : Val := em (one [("x", int 1), ("c", lst [mp [("y", int 2)]])])
    (rp (mp []) [("X", nd "x")] [str "X", em (nd "c") (rp (mp []) [("Y", nd "y")] [str "X Y"])])
  let pieces : Val := em pz (rp (mp []) [("P", nd "p")]
    [mp [("k", str "line"), ("at", int 1), ("n", lst [str "x P", nd "p"])], mp [("k", str "raw"), ("text", str "P raw")]])
  let expr : Val := em pz (rp (mp []) [("P", nd "p")] [str "P", c .plus [str "P", str "P"]])
  let num : Val := em pz (rp (mp []) [("P", nd "p")] [int 1, str "P"])
  let blank : Val := em pz (rp (mp []) [("P", nd "p")] [mp [("k", str "blank")], str "P"])
  let inner : Val := em px (rp (mp []) [("P", nd "p")] [str "P", lst [str "P"]])
  let pref : Val := em (one []) (rp (mp []) [("P", .pref 1 (str "x"))] [str "<P>"])
  let table : Val := em (lst [int 1, str "s"])
    (lst [mp [("match", .number), ("replace", mp [("N", .hole)]), ("body", lst [str "n=N"])],
      mp [("match", .string), ("body", lst [str "s"])]])
  let escOnly : Val := em (one []) (mp [("match", mp []), ("esc", str "sq"), ("body", lst [str "it's"])])
  [(pin, jl [js "listen('a:1')"]), (pin, jl [js "listen('PIN')"]),
    (two, jl [js "<x>", js "<y>"]), (two, jl [js "<x>", js "<x>"]),
    (keys, jl [js "1+2=1 2"]), (keys, jl [js "A+B=A B"]),
    (spell, jl [js "listen(8080, true)"]), (spell, jl [js "listen(8080, 1)"]),
    (called, jl [js "<X>"]), (called, jl [js "<x>"]),
    (ofNode, jl [js "<a>", js "<b>"]), (ofNode, jl [js "<a>", js "<a>"]),
    (dq, jl [js "x(\"it\\\"s\")"]), (dq, jl [js "x(\"it\"s\")"]),
    (sq, jl [js "x('it\\'s')"]), (sq, jl [js "x('it's')"]),
    (asIs, jl [js "x(it's)"]), (asIs, jl [js "x(it\\'s)"]),
    (xml, jl [js "<p>a&lt;b</p>"]), (xml, jl [js "<p>a<b</p>"]),
    (rescan, jl [js "B c"]), (rescan, jl [js "c c"]),
    (self, jl [js "P P"]), (shared, jl [js "xx", js "x"]),
    (spliced, jl [js "1", js "X Y", js "1"]), (spliced, jl [js "1", js "1 Y", js "1"]),
    (own, jl [js "1", js "X 2"]), (own, jl [js "1", js "1 2"]),
    (pieces, jl [jm [("k", js "line"), ("at", j 1), ("n", jl [js "x z", js "z"])], jm [("k", js "raw"), ("text", js "z raw")]]),
    (pieces, jl [jm [("k", js "line"), ("at", j 1), ("n", jl [js "x P", js "z"])], jm [("k", js "raw"), ("text", js "z raw")]]),
    (expr, jl [js "z", js "PP"]), (expr, jl [js "z", js "zz"]),
    (num, jl [j 1, js "z"]), (blank, jl [jm [("k", js "blank")], js "z"]),
    (inner, jl [js "x", js "P"]), (inner, jl [js "x", js "x"]),
    (pref, jl [js "<x>"]), (table, jl [js "n=1", js "s"]), (table, jl [js "n=N", js "s"]),
    (escOnly, jl [js "it's"]),
    (em px (rpe (mp []) (str "pascal") [("P", nd "p")] [str "P"]), jl [js "x"]),
    (em px (rpe (mp []) (int 1) [("P", nd "p")] [str "P"]), jl [js "x"]),
    (em (one []) (mp [("match", mp []), ("esc", str "pascal"), ("body", lst [str "x"])]), jl [js "x"]),
    (em (one [("p", int 1), ("pin", int 2)]) (rp (mp []) [("P", nd "p"), ("PIN", nd "pin")] [str "PIN"]), jl [js "2"]),
    (em (one [("pin", int 2)]) (rp (mp []) [("NOPE", nd "pin")] [str "PIN"]), jl [js "PIN"]),
    (em px (rp (mp []) [("P", nd "p")] [c .plus [str "a", str "P"]]), jl [js "aP"]),
    (em px (rp (mp []) [("", nd "p")] [str "P"]), jl [js "P"]),
    (em (lst []) (rp (mp []) [("NOPE", int 1)] [str "P"]), jl []),
    (em (lst [int 1]) (lst [mp [("match", .number), ("body", lst [str "n"])],
      mp [("match", .string), ("replace", mp [("Q", int 1)]), ("body", lst [str "s"])]]), jl [js "n"]),
    (em px (mp [("match", mp []), ("replace", int 1), ("body", lst [str "P"])]), jl [js "P"]),
    (em px (rp (mp []) [("P", nd "p")] [mp [("n", lst [str "P"]), ("n", lst [str "Q"])]]), jl []),
    (em (one [("pin", int 2)]) (rp (mp []) [("ALL", .hole)] [str "ALL"]), jl [js "ALL"]),
    (em (one []) (rp (mp []) [("N", .lit .null)] [str "N"]), jl [js "null"]),
    (em (one [("l", lst [int 1])]) (rp (mp []) [("L", nd "l")] [str "L"]), jl [js "L"]),
    (em (one []) (rp (mp []) [("P", .string)] [str "P"]), jl [js "P"]),
    (em (one []) (rpe (mp []) (str "none") [("P", .string)] [str "P"]), jl [js "P"]),
    (em (one [("p", .string)]) (rp (mp []) [("P", nd "p")] [str "P"]), jl [js "P"]),
    (em px (rp (mp []) [("P", nd "nope")] [str "P"]), jl [js "P"])]

theorem emitReplaceCases_checkable : ∀ c ∈ emitReplaceCases, (vetDoc c).1.CheckableA := by decide

theorem emit_replace_verdict_exact : ∀ c ∈ emitReplaceCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (emitReplaceCases_checkable c hc)) v

/-- A named table whose template writes replacements, `%w = emit(_, t)`,
and one that names itself, walking a tree with a replacement at each
level. -/
def emitReplaceNameCases : List (Decls × Val × Data) :=
  let nd (k : String) : Val := .path [.node, .key k]
  let held (t : Val) : Val := c .emit [.hole, t]
  let rp (m : Val) (r : List (String × Val)) (b : List Val) : Val :=
    mp [("match", m), ("replace", mp r), ("body", lst b)]
  let node (n : String) (kids : List Val) : Val := mp [("name", str n), ("kids", lst kids)]
  let w : Decls := [("W", held (rp (mp [("p", .string)]) [("P", nd "p")] [str "<P>"]))]
  let walk : Decls := [("W", held (rp (mp [("name", .string)]) [("N", nd "name")]
    [str "<N>", c .emit [nd "kids", .alias "W"], str "</N>"]))]
  [(w, c .emit [lst [mp [("p", str "x")]], .alias "W"], jl [js "<x>"]),
    (w, c .emit [lst [mp [("p", str "x")]], .alias "W"], jl [js "<P>"]),
    (walk, c .emit [lst [node "a" [node "b" []]], .alias "W"], jl [js "<a>", js "<b>", js "</b>", js "</a>"]),
    (walk, c .emit [lst [node "a" [node "b" []]], .alias "W"], jl [js "<a>", js "<a>", js "</a>", js "</a>"])]

theorem emitReplaceNameCases_checkable : ∀ c ∈ emitReplaceNameCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (aliasDoc c).1.CheckableA := by decide

theorem emit_replace_name_verdict_exact : ∀ c ∈ emitReplaceNameCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 (aliasDoc c).1 (aliasDoc c).2 = v ↔ Vet m c.1 (aliasDoc c).1 (aliasDoc c).2 v :=
  fun c hc _ v => vet_iff (emitReplaceNameCases_checkable c hc).1
    (readR_checkableA (emitReplaceNameCases_checkable c hc).1 (emitReplaceNameCases_checkable c hc).2) v

/-- `apply(v, f)`, which binds each hole of `f` that no generator or
`apply` inside `f` binds to `v` and makes the one instance
`each([v], f)` would: a call over the hole, a map's member and a list's
elements, `f` with no hole, which is `f`, a generator and an `apply`
inside `f`, which bind their own, a marked element, which holds no
position, `apply` in a generator's template, whose head the generator
binds, a list and a map as `v`, and `apply` with one argument, an
error. -/
def applyCases : List (Val × Data) :=
  let ap (v f : Val) : Val := .call .apply [v, f]
  [(ap (int 1) (.call .add [.hole, int 1]), j 2),
    (ap (int 1) (.call .add [.hole, int 1]), j 3),
    (ap (.lit (.str "hello")) (.call .upper [.hole]), .str "HELLO"),
    (ap (int 1) (mp [("n", .hole)]), .map [("n", j 1)]),
    (ap (int 1) (mp [("n", .hole)]), .map [("n", j 2)]),
    (ap (int 1) (lst [.hole, .hole]), jl [j 1, j 1]),
    (ap (int 1) (int 2), j 2),
    (ap (int 1) .integer, j 5),
    (ap (int 1) (.call .each [lst [int 3], .hole]), jl [j 3]),
    (ap (int 1) (ap (int 2) .hole), j 2),
    (ap (int 1) (lst [.ride .hide .hole [], .hole]), jl [j 1]),
    (.call .each [lst [int 1, int 2], ap .hole (.call .add [.hole, int 1])], jl [j 2, j 3]),
    (ap (lst [int 1, int 2]) (.call .sum [.hole]), j 3),
    (ap (mp [("a", int 1)]) (mp [("b", .hole)]), .map [("b", .map [("a", j 1)])]),
    (.call .apply [int 1], j 1)]

theorem applyCases_checkable : ∀ c ∈ applyCases, (vetDoc c).1.CheckableA := by decide

theorem apply_verdict_exact : ∀ c ∈ applyCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (applyCases_checkable c hc)) v

/-- `key(n)` read where it stands: at a key and at an index, at its
levels to the top and past it, under a meet, a call, a rider and a
disjunction, and where the fill writes it; in a template, the member's
key or index and the levels above the call, through nested generators;
at a spread's own position, the key the spread reads and the levels
above it. -/
def keyUpCases : List (Val × Data) :=
  [(k 0, js "v"), (k 0, js "x"), (k 1, js ""), (k 2, js ""), (k (-1), js ""),
    (mp [("a", k 1)], jm [("a", js "v")]), (mp [("a", k 0)], jm [("a", js "a")]),
    (mp [("a", k 0)], jm []),
    (mp [("a", mp [("b", k 1)])], jm [("a", jm [("b", js "a")])]),
    (mp [("a", mp [("b", k 2)])], jm [("a", jm [("b", js "v")])]),
    (mp [("a", mp [("b", k 2)])], jm [("a", jm [("b", js "a")])]),
    (mp [("a", mp [("b", k 3)])], jm [("a", jm [("b", js "")])]),
    (lst [k 0, k 1], jl [js "0", js "v"]),
    (lst [mp [("x", k 1)], mp [("x", k 1)]], jl [jm [("x", js "0")], jm [("x", js "1")]]),
    (mp [("a", c .upper [k 0])], jm [("a", js "A")]),
    (mp [("a", c .plus [str "x-", k 0])], jm [("a", js "x-a")]),
    (mp [("a", .meet (k 0) .string)], jm [("a", js "a")]),
    (mp [("a", .ride .metadata (k 0) [("t", j 1)])], jm [("a", js "a")]),
    (mp [("a", .or [(0, k 0), (0, str "x")])], jm [("a", js "a")]),
    (mp [("a", .or [(0, k 0), (0, str "x")])], jm [("a", js "y")]),
    (c .pack [lst [str "web", str "auth"], mp [("n", k 1), ("t", k 2)]],
      jm [("auth", jm [("n", js "auth"), ("t", js "v")]), ("web", jm [("n", js "web"), ("t", js "v")])]),
    (c .pack [lst [str "a"], k 0], jm [("a", js "a")]),
    (c .pack [lst [str "a"], c .plus [str "acme/", k 0]], jm [("a", js "acme/a")]),
    (c .each [lst [str "p", str "q"], mp [("k", k 1)]], jl [jm [("k", js "0")], jm [("k", js "1")]]),
    (c .each [lst [str "p", str "q"], k 0], jl [js "0", js "1"]),
    (c .each [mp [("b", int 1), ("a", int 2)], mp [("k", k 1), ("v", .hole)]],
      jl [jm [("k", js "0"), ("v", j 2)], jm [("k", js "1"), ("v", j 1)]]),
    (c .pack [lst [str "a"], mp [("i", c .pack [lst [str "b"], mp [("x", k 1), ("y", k 2), ("z", k 3)]])]],
      jm [("a", jm [("i", jm [("b", jm [("x", js "b"), ("y", js "i"), ("z", js "a")])])])]),
    (c .pack [lst [str "a"], mp [("i", c .each [lst [str "b"], mp [("x", k 1), ("w", k 4)]])]],
      jm [("a", jm [("i", jl [jm [("x", js "0"), ("w", js "v")]])])]),
    (c .each [lst [int 1, int 2], lst [k 0, k 1]], jl [jl [js "0", js "0"], jl [js "0", js "1"]]),
    (.map [("c", false, .string)] (some (k 1)) false, jm [("c", js "v")]),
    (.map [("c", false, .string)] (some (k 0)) false, jm [("c", js "c")]),
    (mp [("s", .map [("c", false, .string)] (some (k 1)) false)], jm [("s", jm [("c", js "s")])]),
    (.list [] (some (k 1)) false, jl [js "v", js "v"]),
    (c .pack [lst [str "a"], .map [("q", false, .string)] (some (k 1)) false], jm [("a", jm [("q", js "a")])]),
    (c .pack [lst [str "a"], .map [("q", false, .string)] (some (k 0)) false], jm [("a", jm [("q", js "q")])])]

theorem keyUpCases_checkable : ∀ c ∈ keyUpCases, (vetDoc c).1.CheckableA := by decide

/-- A `filter`'s condition holding `key(n)`, read where each member it
tries lands: under a map member's key, and at the index a list member
takes among those kept. -/
def keyUpFilterCases : List (Val × Data) :=
  [(.filter (mp [("a", str "a"), ("b", str "c")]) (.keyUp 0), .map [("a", js "a")]),
    (.filter (lst [str "x", str "0", str "1"]) (.keyUp 0), .list [js "0", js "1"]),
    (.filter (lst [str "0", str "b", str "2"]) (.keyUp 0), .list [js "0"]),
    (.filter (mp [("a", mp [("n", str "a")]), ("b", mp [("n", str "c")])]) (mp [("n", .keyUp 1)]),
      .map [("a", .map [("n", js "a")])])]

set_option maxRecDepth 8192 in
theorem keyUpFilterCases_readable : ∀ c ∈ keyUpFilterCases, (Decls.readR [] (vetDoc c).1).CheckableA := by
  decide

theorem keyUp_verdict_exact : ∀ c ∈ keyUpCases ++ keyUpFilterCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v := by
  intro c hc _ v
  have hr : (Decls.readR [] (vetDoc c).1).CheckableA := by
    rcases List.mem_append.mp hc with h | h
    · exact readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (keyUpCases_checkable c h)
    · exact keyUpFilterCases_readable c h
  exact vet_iff (fun _ h => absurd h (List.not_mem_nil)) hr v

/-- A call the schema can't build, which fails the schema wherever it
stands, for the `verdict` rows from x2238 on: under `type()` and under
`hide()`, as an optional member, and as a list's element; and, read
nowhere, as the template of a spread that meets no member, an error all
the same, since the count is the text's (decision 77). -/
def heldFailCases : List (Val × Data) :=
  let bad : Val := .call .add [.lit (.num (.integer ⟨1, by decide⟩))]
  [(.ride .type bad [], .integer 1), (.ride .hide bad [], .integer 1),
    (.map [("a", true, bad)] none false, .map []),
    (.list [bad] none false, .list [.integer 1]),
    (.map [] (some bad) false, .map [])]

theorem heldFailCases_checkable : ∀ c ∈ heldFailCases, (vetDoc c).1.CheckableA := by decide

theorem held_fail_verdict_exact : ∀ c ∈ heldFailCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (heldFailCases_checkable c hc)) v

/-- A call written with a count of arguments its function doesn't take,
where no reading reaches it (decision 77 of the design note's §7), for
the last `verdict` rows of the calls: the template of an `each` and of a
`pack` over no member, a result of a `match` another arm takes, a list's
spread that meets no element, and a member of a spread's template. Each
is an error, as both ports refuse the document as they read it. -/
def unreachedCountCases : List (Val × Data) :=
  let bad : Val := .call .add [.lit (.num (.integer ⟨1, by decide⟩))]
  let one : Val := .lit (.num (.integer ⟨1, by decide⟩))
  let two : Val := .lit (.num (.integer ⟨2, by decide⟩))
  [(.call .each [.list [] none false, bad], .list []),
    (.select one [(one, .lit (.str "a")), (two, bad)] none, .str "a"),
    (.list [] (some bad) false, .list []),
    (.map [] (some (.map [("a", false, bad)] none false)) false, .map []),
    (.call .pack [.list [] none false, .map [("a", false, bad)] none false], .map [])]

theorem unreachedCountCases_checkable : ∀ c ∈ unreachedCountCases, (vetDoc c).1.CheckableA := by decide

theorem unreached_count_verdict_exact : ∀ c ∈ unreachedCountCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (unreachedCountCases_checkable c hc)) v

/-- An `each` whose instances carry a mark of their own, for the
`verdict` rows from x2253 on, which a list holds no position for
(decision 18): `hide()` around a list template, around the hole and
over a map's members, `type()` around the hole, beside data that an
instance holding a position would refuse, and a marked instance that
is a conflict, which makes the list `nil`, as a written one is. -/
def markedEachCases : List (Val × Data) :=
  let hd (v : Val) : Val := .ride .hide v []
  let each (d t : Val) : Val := .call .each [d, t]
  [(each (lst [int 1]) (hd (lst [.hole, .hole])), .list []),
    (each (lst [int 1]) (hd (lst [.hole, .hole])), .list [.list [.integer 2]]),
    (each (lst [int 1, int 2]) (hd .hole), .list []),
    (each (lst [int 1, int 2]) (.ride .type .hole []), .list []),
    (each (.map [("a", false, int 1)] none false) (hd .hole), .list []),
    (each (lst [int 1]) (hd (.meet .hole (int 2))), .list [])]

theorem markedEachCases_checkable : ∀ c ∈ markedEachCases, (vetDoc c).1.CheckableA := by decide

theorem marked_each_verdict_exact : ∀ c ∈ markedEachCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (markedEachCases_checkable c hc)) v

/-- `filter` and `match` over a disjunction, which admits what any arm
admits, whatever the arm's rank (decision 32), for the `verdict` rows
from x2271 on: a member an arm beside the default admits, one both arms
admit, two plain arms, a map's member, one no arm admits, and a pattern
of each kind (#635); and a preference arm the member refuses, beside an
arm that adds a member, which keeps nothing and matches nothing, since
the arm has no parent type (#637). -/
def armCallCases : List (Val × Data) :=
  let mp (fs : List (String × Val)) : Val := .map (fs.map fun f => (f.1, false, f.2)) none false
  let b1 : Val := mp [("b", int 1)]
  let pick : Val := .or [(1, b1), (0, mp [])]
  let plain : Val := .or [(0, b1), (0, mp [])]
  [(.filter (lst [mp []]) pick, .list [.map []]), (.filter (lst [b1]) pick, .list [.map [("b", j 1)]]),
    (.filter (lst [mp []]) plain, .list [.map []]), (.filter (mp [("k", mp [])]) pick, .map [("k", .map [])]),
    (.filter (lst [mp [("c", int 2)]]) (.or [(0, b1), (0, mp [("c", int 1)])]), .list []),
    (.select (mp []) [(plain, int 1)] (some (int 2)), j 1), (.select (mp []) [(pick, int 1)] (some (int 2)), j 1),
    (.filter (lst [mp [("b", int 2)]]) (.or [(1, b1), (0, mp [("a", mp [])])]), .list []),
    (.select (mp [("b", int 2)]) [(.or [(1, b1), (0, mp [("c", int 1)])], int 1)] (some (int 2)), j 2)]

/-- `filter` and `match` over a condition with an optional member, which
admits a value that leaves the member out, as a map admits a value
without its optional keys, for the `verdict` rows from x2298 on: the
member's value a literal and a kind, beside a required member, under a
key, over a map's member, and a value that holds the member, which the
condition admits and refuses (#638). Each `filter` is met with the size
it answers, beside data with no member, so the filter alone supplies
what it keeps: data that holds the member would supply it to an open
container. -/
def optCallCases : List (Val × Data) :=
  let mp (fs : List (String × Val)) : Val := .map (fs.map fun f => (f.1, false, f.2)) none false
  let c3 : Val := .map [("c", true, int 3)] none false
  let sized (f : Val) (n : Val := int 1) : Val := .meet f (.len n)
  [(sized (.filter (lst [mp []]) c3), .list []), (.select (mp []) [(c3, int 1)] (some (int 2)), j 1),
    (sized (.filter (lst [mp []]) (.map [("c", true, .integer)] none false)), .list []),
    (sized (.filter (lst [mp [("b", int 1)]]) (.map [("b", false, int 1), ("c", true, int 3)] none false)),
      .list []),
    (sized (.filter (lst [mp [("a", mp [])]]) (mp [("a", c3)])), .list []),
    (sized (.filter (mp [("k", mp [])]) c3), .map []),
    (sized (.filter (lst [mp [("c", int 3)]]) c3), .list []),
    (sized (.filter (lst [mp [("c", int 4)]]) c3) (int 0), .list [])]

set_option maxRecDepth 16384 in
theorem armCallCases_readable : ∀ c ∈ armCallCases, (Decls.readR [] (vetDoc c).1).CheckableA := by decide

set_option maxRecDepth 16384 in
theorem optCallCases_readable : ∀ c ∈ optCallCases, (Decls.readR [] (vetDoc c).1).CheckableA := by decide

theorem arm_call_verdict_exact : ∀ c ∈ armCallCases ++ optCallCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v := by
  intro c hc _ v
  rcases List.mem_append.mp hc with h | h
  · exact vet_iff (fun _ h => absurd h (List.not_mem_nil)) (armCallCases_readable c h) v
  · exact vet_iff (fun _ h => absurd h (List.not_mem_nil)) (optCallCases_readable c h) v

/-- A call on a name, the name read before the call is made. -/
def callAliasCases : List (Decls × Val × Data) :=
  [([("A", int 3)], .call .add [.alias "A", int 1], j 4),
    ([("A", int 3)], .call .add [.alias "A", int 1], j 5),
    ([("A", .integer)], .call .add [.alias "A", int 1], j 2),
    ([("L", .list [int 1, int 2, int 3] none false)], .call .sum [.alias "L"], j 6),
    ([("M", .map [("a", false, int 1), ("b", false, int 2)] none false)],
      .call .greatest [.alias "M"], j 2),
    ([("L", .list [.map [("a", false, int 1)] none false, .map [("a", false, int 2)] none false]
        none false)], .call .pick [.alias "L", .lit (.str "a")], .list [j 1, j 2]),
    ([("L", .list [int 3, int 1, int 2] none false)], .call .sort [.alias "L"], .list [j 1, j 2, j 3]),
    ([("S", .lit (.str "ab"))], .call .upper [.alias "S"], .str "AB"),
    ([("N", int 1)], .call .upper [.lit (.str "foo"), .alias "N"], .str "fOO"),
    ([("F", .lit (.str "a"))], .call .translate [.lit (.str "abc"), .alias "F", .lit (.str "x")],
      .str "xbc"),
    ([("K", .lit (.str "a"))], .call .pick [.list [.map [("a", false, int 1)] none false] none false,
      .alias "K"], .list [j 1]),
    ([("P", .lit (.str "n"))], .call .sort [.list [.map [("n", false, int 2)] none false,
      .map [("n", false, int 1)] none false] none false, .alias "P"],
      .list [.map [("n", j 1)], .map [("n", j 2)]]),
    ([("D", .lit (.str "desc"))], .call .sort [.list [int 1, int 2] none false, .lit (.str ""),
      .alias "D"], .list [j 2, j 1])]

theorem callAliasCases_checkable : ∀ c ∈ callAliasCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ (aliasDoc c).1.CheckableA := by decide

theorem call_alias_verdict_exact : ∀ c ∈ callAliasCases, ∀ (m : Mode) (v : Verdict),
    vet m c.1 (aliasDoc c).1 (aliasDoc c).2 = v ↔ Vet m c.1 (aliasDoc c).1 (aliasDoc c).2 v :=
  fun c hc _ v => vet_iff (callAliasCases_checkable c hc).1
    (readR_checkableA (callAliasCases_checkable c hc).1 (callAliasCases_checkable c hc).2) v

/-- `path` handed a string: its text converted to an address and met with
the capture it must equal, or with one it can't, so that the row says
which address the text spells; text that spells none, any other scalar
and a container, each refused; a string a call computes, converted once
it's settled; a preference, which only waits; and a path value, handed
back as it is, behind a rider too, where `path` alone waits. -/
def pathCallCases : List (Val × Data) :=
  let p (s : String) : Val := .call .path [str s]
  let one : Val := .lit (.num (.integer (.of 1)))
  [(x (.meet (p "$.a") (addrAt 0 ["a"])), .map []), (x (.meet (p "$.a") (addrAt 1 ["a"])), .map []),
    (x (.meet (p "a") (addrAt 1 ["a"])), .map []), (x (.meet (p "a") (addrAt 0 ["a"])), .map []),
    (x (.meet (p "a.b") (addrAt 1 ["a", "b"])), .map []), (x (.meet (p "..a") (addrAt 2 ["a"])), .map []),
    (x (.meet (p "$.0") (addrAt 0 ["0"])), .map []), (x (p "$.a-b_1"), .map []),
    (x (.meet (p "$.a") (addrAt 0 ["a", "b"])), .map []),
    (x (p "$"), .map []), (x (p "$x"), .map []), (x (p ""), .map []), (x (p "."), .map []),
    (x (p "a."), .map []), (x (p "a..b"), .map []), (x (p "a b"), .map []), (x (p "Ü"), .map []),
    (x (.meet (.call .path [.call .plus [str "$.", str "a"]]) (addrAt 0 ["a"])), .map []),
    (x (.meet (.call .path [.call .upper [str "a"]]) (addrAt 1 ["A"])), .map []),
    (x (.meet (.call .path [.ride .metadata (str "a") [("x", .integer 1)]]) (addrAt 1 ["a"])), .map []),
    (x (.call .path [one]), .map []), (x (.call .path [.lit (.bool true)]), .map []),
    (x (.call .path [.lit .null]), .map []), (x (.call .path [.list [one] none false]), .map []),
    (x (.call .path [.map [("a", false, one)] none false]), .map []),
    (x (.call .path [.pref 1 (str "a")]), .map []), (x (.call .path [.string]), .map []),
    (x (.meet (p "$.a") (str "$.a")), .map []), (p "$.a", .str "$.a"),
    (x (.meet (.call .path [p "$.a"]) (addrAt 0 ["a"])), .map []),
    (x (.meet (.call .path [.ride .metadata (p "a") []]) (addrAt 1 ["a"])), .map []),
    (x (.meet (.call .path [addrAt 0 ["a"]]) (addrAt 0 ["a"])), .map []),
    (x (.meet (.call .path [.meet (addrAt 0 ["a"]) (addrAt 0 ["a", "b"])]) (addrAt 0 ["a", "b"])), .map []),
    (x (.call .path [.meet (addrAt 0 ["a"]) (addrAt 0 ["b"])]), .map []),
    (x (.call .path [.pathKind]), .map [])]

set_option maxRecDepth 8192 in
theorem pathCallCases_checkable : ∀ c ∈ pathCallCases, (vetDoc c).1.CheckableA := by decide

theorem path_call_verdict_exact : ∀ c ∈ pathCallCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (pathCallCases_checkable c hc)) v

/-- The grammars the rows hand `abnf` and `parse`: one rule of one
literal, matched without regard to case and, after `%s`, exactly, which
the oracle's host reads as every engine does, and two texts that compile
in no engine, the empty text and a lone name. -/
def oracleGrammars : List String := ["v = \"a\"\n", "v = %s\"ab\"", "", "v"]

/-- `abnf`, which answers a grammar's source where it compiles; `parse`
of a grammar and a string, the tree as data, met with the tree it must
be; and `parse` of a grammar alone, the constraint of the strings it
parses whole, against data. Each grammar is one of `oracleGrammars`. -/
def grammarCases : List (Val × Data) :=
  let one : Val := .lit (.num (.integer (.of 1)))
  let gi := str "v = \"a\"\n"
  let gs := str "v = %s\"ab\""
  let tree (s : String) : Val :=
    .map [("kids", false, .list [] none false), ("rule", false, str "v"), ("src", false, str s)] none false
  let abnf (g : Val) : Val := .call .abnf [g]
  let parse (g : Val) (v : Val) : Val := .call .parse [g, v]
  let parse1 (g : Val) : Val := .call .parse [g]
  [(x (.meet (abnf gi) gi), .map []), (x (abnf (str "")), .map []), (x (abnf (str "v")), .map []),
    (x (abnf one), .map []),
    (x (.meet (parse gi (str "a")) (tree "a")), .map []), (x (.meet (parse gi (str "A")) (tree "A")), .map []),
    (x (.meet (parse gs (str "ab")) (tree "ab")), .map []), (x (parse gs (str "aB")), .map []),
    (x (parse gi (str "b")), .map []), (x (parse gi (str "")), .map []), (x (parse (str "") (str "a")), .map []),
    (x (parse one (str "a")), .map []), (x (parse gi one), .map []),
    (x (.meet (parse (abnf gi) (str "a")) (tree "a")), .map []),
    (x (.meet (parse gi (str "a")) (.map [("rule", false, str "w")] none false)), .map []),
    (x (parse gi (str "a")), .map [("x", .map [("kids", .list []), ("rule", .str "v"), ("src", .str "a")])]),
    (parse1 gi, .str "a"), (parse1 gi, .str "A"), (parse1 gi, .str "b"), (parse1 gi, .str ""),
    (parse1 gs, .str "ab"), (parse1 gs, .str "AB"), (parse1 (str ""), .str "a"),
    (x (parse1 gi), .map []), (x (.or [(1, str ""), (0, parse1 gi)]), .map []),
    (x (.meet (parse1 gi) (str "A")), .map []), (x (.meet (parse1 gi) (str "b")), .map []),
    (parse1 (abnf gi), .str "a")]

set_option maxRecDepth 8192 in
theorem grammarCases_checkable : ∀ c ∈ grammarCases, (vetDoc c).1.CheckableA := by decide

theorem grammar_verdict_exact : ∀ c ∈ grammarCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (grammarCases_checkable c hc)) v
