import Oracle.Base

/-! The oracle's cases: Calls, split out of `Oracle.lean` so that each area builds on its own. -/

open Aontu
open Case

/-! ## Calls on numbers

P8's first step: each arithmetic call over integers, floats and the
exact big leaves, each with the value it computes and one it does not,
and each call no reading makes, an argument outside its function's
domain, a zero divisor, an answer no leaf holds, or the wrong number of
arguments, rows x0 on in `def-call.tsv`; and a call on a name, rows z0
on. The folds `sum`, `least` and `greatest` follow from row x129, over
lists and maps, their members read as `Val.members` reads them: no case
holds a marked list element (decision 18) or an optional member whose
value generates an empty map or list (decision 19), and no bag is met
with a kind, which the normal form keeps beside it. A lone preference as
an argument or a member, and an `ident()` inside a call, follow from row
x273, and `+` from row x300: two numbers by `add`, a string beside a
scalar as the two texts, two lists, two booleans, the riders and a lone
preference read through, and the operands it does not take, where it
waits. A bag a mark lifts, a rider inside a lone preference, and a
`match` whose pattern holds a call follow from row x480, and `join`
from row x507: the members' texts as `+` writes them, a member or a
separator with no text, a value that is no bag, and the members and
separators it waits on. `pick` and `sort` follow from row x597: a
projector as a key in a map member and as an index in a list member,
the two orders and the two directions, equal keys in their order, and
the arguments they refuse, `projectorCases` a projector or a direction
through a rider or a mark, and `indexCases` the strings that name an
index otherwise than by their digits, and `""` as `pick`'s projector. `upper` and `lower` follow from row x816: the run of code points
a start and a length select, an index of either leaf, and a number
rounded in its own leaf. Their strings are ASCII, the letters on which
the oracle's host and every engine's case conversion agree, and
`asciiCase` refuses a row that reads another, and no case holds a big
integer index between 2 ^ 53 and 2 ^ 63 (#439). `translate` follows
from row x966: ranges, a `-` that stands for itself, a short `to` and an
empty one, a character named twice, code points beyond ASCII, and a
range across the surrogates in `from`, and `surrogateCases` one in
`to`, which writes U+FFFD for each surrogate. `esc` and `usc` follow
from row x1068: each convention both ways, the text each `usc` has no
original for, the variants and the arguments. `super` follows from row
x1221: a scalar's kind, a kind's parent, a container of its members'
parents, a preference read as its default at any depth, a meet that
holds a kind, a disjunction, a seal, the riders. `split` follows from
row x1332, and `rep` from row x1404: the matches a scan reads, an empty
one among them, each `$` form, the groups a pattern has and has not
got, and patterns outside the subset. Their patterns are fixed text,
with groups, on which the oracle's host and every engine's regex
engine agree, or outside the subset, which every engine refuses, and
`hostReads` refuses a row that hands the host another. A replacement
that names something its pattern lacks, over a text with no match,
follows in `repSubCases`. `nom` follows from row x1521: each spelling, the
words a name holds, an acronym list, the sealed map of every spelling,
and the arguments it refuses, but no style written as `""`, which Go
reads as no style (#451). The components follow from row x1677: each
component's node, its seal and its open props and children, a bare
string as a line, nested lists spliced, a hand-written node as a
child, and the props and children each component refuses, but no
`close()` above a node, which both ports hold its props and children
open against and the definition, holding no `open()`, leaves unsaid.
`each` follows from row x1803: its template read for each member of its
data, a list's in order and a map's in key order, the hole kept, met
and left out, a nested `each` binding its own hole, and data that is no
bag. An instance that carries a mark of its own follows in
`markedEachCases`. No case holds `key()` in a template, which both
ports read as the member's key, or a hole outside a template, which
`holeFillVetCases` holds. A `filter`
whose condition holds the hole follows in `filterCases`, and `split`
at a pattern in `patternCases`. -/

def callCases : List (Val × Data) :=
  let flt (n : ℤ) (d : ℕ) : Val := match Float.nearest n d with
    | some x => .lit (.num (.float x))
    | none => .nil
  let jf (n : ℤ) (d : ℕ) : Data := match Float.nearest n d with
    | some x => .num (.float x)
    | none => .null
  let big (n : ℤ) : Val := .lit (.num (.biginteger ⟨n⟩))
  let jbig (n : ℤ) : Data := .num (.biginteger ⟨n⟩)
  let dec (c e : ℤ) : Val := match BigDecimal.normal c e with
    | some x => .lit (.num (.bigdecimal x))
    | none => .nil
  let jdec (c e : ℤ) : Data := match BigDecimal.normal c e with
    | some x => .num (.bigdecimal x)
    | none => .null
  let p (a b : Val) : Val := .call .plus [a, b]
  let kv (k : ℤ) (s : String) (h : IntegerLeaf k := by decide) : Val := mp [("k", int k h), ("v", str s)]
  let jkv (k : ℤ) (s : String) (h : IntegerLeaf k := by decide) : Data := jm [("k", j k h), ("v", js s)]
  let node (cmp : String) (props : List (String × Data)) (kids : List Data) : Data :=
    jm [("cmp", js cmp), ("props", jm props), ("children", jl kids)]
  let lineD (s : String) : Data := node "Line" [("src", js s)] []
  [(c .add [int 1, int 2], j 3), (c .add [int 1, int 2], j 4),
    (c .sub [int 10, int 3], j 7), (c .mul [int 6, int 7], j 42),
    (c .div [int 7, int 2], j 3), (c .div [int (-7), int 2], j (-3)),
    (c .rem [int (-7), int 2], j (-1)), (c .mod [int (-7), int 2], j 1),
    (c .rem [int 7, int (-2)], j 1), (c .mod [int 7, int (-2)], j (-1)),
    (c .div [int 7, int 0], j 1), (c .add [.lit (.str "a"), int 1], j 1),
    (c .sub [.integer, int 1], j 1), (c .add [int 1, .or [(1, int 2), (0, int 3)]], j 3),
    (c .add [int 1, .or [(0, int 1), (0, int 2)]], j 2),
    (c .add [int 9007199254740992, int 1], j 1),
    (c .add [int 9007199254740992, int 2], j 9007199254740994),
    (c .mul [int 4294967296, int 4294967296], j 1),
    (c .add [flt 1 1, big 2], j 1), (c .div [dec 100 1, big 4], jbig 2),
    (c .div [big 10, big 4], jbig 2), (c .add [int 1, big 2], jbig 3), (c .add [int 1, big 2], j 3),
    (c .mul [int 2, dec 15 1], jdec 30 1), (c .mul [int 2, dec 15 1], jbig 3),
    (c .add [flt 1 10, flt 2 10], jf 30000000000000004 (10 ^ 17)),
    (c .add [flt 1 10, flt 2 10], jf 3 10), (c .div [flt 1 1, int 3], jf 3333333333333333 (10 ^ 16)),
    (c .div [int 7, flt 2 1], jf 35 10), (c .mod [flt 75 10, int 2], jf 15 10),
    (c .mul [int 2, flt 15 10], jf 3 1), (c .mul [int 2, flt 15 10], j 3),
    (c .mul [flt (10 ^ 200) 1, flt (10 ^ 200) 1], j 1),
    (c .neg [int 3], j (-3)), (c .neg [flt 15 10], jf (-15) 10), (c .neg [.integer], j 1),
    (c .add [.meet (int 1) .integer, int 1], j 2), (c .add [.ride .metadata (int 3) [], int 1], j 4),
    (c .add [.ride .type (int 2) [], int 1], j 3), (c .add [c .add [int 1, int 2], int 1], j 4),
    (c .add [.meet .number (int 2), int 1], j 3), (c .add [int 1], j 1),
    (c .add [int 1, int 2, int 3], j 6),
    (c .sum [lst [int 1, int 2, int 3]], j 6), (c .sum [lst [int 1, int 2, int 3]], j 7),
    (c .sum [lst [int 1, flt 25 10]], jf 35 10),
    (c .sum [lst [flt 1 10, flt 2 10, flt 3 10]], jf 6000000000000001 (10 ^ 16)),
    (c .sum [lst [flt 3 10, flt 2 10, flt 1 10]], jf 6 10),
    (c .sum [lst [dec 15 1, dec 25 1]], jdec 4 0), (c .sum [lst []], j 0),
    (c .sum [lst [int 9007199254740992, int 1, int (-1)]], j 9007199254740992),
    (c .sum [lst [int 1, int (-1), int 9007199254740992]], j 9007199254740992),
    (c .sum [lst [int 1, big 2]], jbig 3), (c .sum [lst [flt 15 10, big 2]], j 1),
    (c .sum [mp [("b", int 1), ("a", int 2)]], j 3),
    (c .least [lst [int 3, int 1, int 2]], j 1), (c .greatest [lst [int 3, int 1, int 2]], j 3),
    (c .least [lst []], j 1), (c .greatest [mp []], j 1),
    (c .least [lst [int 1, flt 1 1]], j 1), (c .least [lst [int 1, flt 1 1]], jf 1 1),
    (c .least [lst [flt 1 1, int 1]], jf 1 1), (c .greatest [lst [int 1, big 1]], j 1),
    (c .greatest [lst [int 1, big 1]], jbig 1),
    (c .least [lst [big 9007199254740993, int 9007199254740992]], j 9007199254740992),
    (c .least [lst [flt 15 10, dec 125 2]], jdec 125 2),
    (c .greatest [mp [("b", int 1), ("a", flt 1 1)]], jf 1 1),
    (c .greatest [mp [("b", int 1), ("a", flt 1 1)]], j 1),
    (c .sum [int 3], j 3), (c .least [.lit (.str "a")], j 1),
    (c .sum [lst [.lit (.str "a")]], j 1), (c .sum [lst [.integer]], j 1),
    (c .sum [lst [.or [(1, int 1), (0, .number)], int 2]], j 3),
    (c .sum [lst [int 1, lst [int 2]]], j 3),
    (c .sum [mp [("a", int 1), ("b", .ride .hide (int 2) [])]], j 1),
    (c .sum [mp [("a", .ride .type (int 1) []), ("b", int 2)]], j 2),
    (c .sum [.map [("a", true, .integer), ("b", false, int 2)] none false], j 2),
    (c .sum [.map [("a", true, .or [(0, int 1), (0, int 2)]), ("b", false, int 2)] none false], j 2),
    (c .sum [.map [("a", true, int 1), ("b", false, int 2)] none false], j 3),
    (c .sum [.map [("a", true, .lit (.str "x")), ("b", false, int 2)] none false], j 2),
    (c .sum [.ride .metadata (lst [int 1, int 2]) []], j 3),
    (c .sum [lst [.ride .metadata (int 1) [], int 2]], j 3),
    (c .sum [.ride .type (lst [int 1, int 2]) []], j 3),
    (c .sum [.meet (lst [int 1, int 2]) (lst [.integer, .integer])], j 3),
    (c .sum [.meet (mp [("a", int 1)]) (mp [("b", int 2)])], j 3),
    (c .sum [.meet (.list [] (some .integer) false) (lst [int 1, int 2])], j 3),
    (c .sum [.meet (lst [int 1, int 2]) (.len (int 2))], j 3),
    (c .sum [.or [(1, lst [int 1]), (0, lst [int 2, int 3])]], j 1),
    (c .sum [lst [c .add [int 1, int 2], int 4]], j 7),
    (c .add [c .sum [lst [int 1, int 2]], int 1], j 4),
    (c .sum [lst [int 1], lst [int 2]], j 1),
    (c .add [.pref 1 (int 1), int 2], j 3), (c .add [.pref 2 (int 1), int 2], j 3),
    (c .add [.ride .metadata (.pref 1 (int 1)) [], int 2], j 3),
    (c .sum [lst [int 1, .pref 1 (int 2)]], j 3),
    (c .sum [.meet (lst [.pref 1 (int 1)]) (lst [.integer])], j 1),
    (c .least [lst [.pref 1 (int 3), int 2]], j 2),
    (c .sum [.pref 1 (lst [int 1, int 2])], j 3),
    (c .add [.ride .ident (int 1) [("id", .str "x")], int 2], j 3),
    (c .sum [lst [.ride .ident (int 1) [("id", .str "x")]]], j 1),
    (p (int 1) (int 2), j 3), (p (int 1) (int 2), j 4),
    (p (int 1) (flt 2 1), jf 3 1), (p (int 1) (flt 2 1), j 3),
    (p (int 1) (big 2), jbig 3),
    (p (dec 5 1) (dec 5 1), jdec 1 0), (p (dec 5 1) (dec 5 1), jbig 1),
    (p (flt 1 1) (big 2), j 1),
    (p (int 9007199254740992) (int 1), j 1),
    (p (int 9007199254740992) (int 2), j 9007199254740994),
    (p (flt (10 ^ 308) 1) (flt (10 ^ 308) 1), j 1),
    (p (str "a") (str "b"), js "ab"),
    (p (str "a") (int 1), js "a1"), (p (int 1) (str "a"), js "1a"),
    (p (str "a") (flt 15 10), js "a1.5"), (p (str "a") (flt 1 1), js "a1"),
    (p (str "a") (flt (10 ^ 21) 1), js "a1e+21"),
    (p (str "a") (flt (10 ^ 20) 1), js "a100000000000000000000"),
    (p (str "a") (flt 1 1000000), js "a0.000001"), (p (str "a") (flt 1 10000000), js "a1e-7"),
    (p (str "a") (flt 15 100000000), js "a1.5e-7"), (p (str "a") (flt (-5) 10), js "a-0.5"),
    (p (str "a") (flt 12345678901234567890 1), js "a12345678901234567000"),
    (p (str "a") (dec 1 (-3)), js "a1000.0"), (p (str "a") (dec 15 1), js "a1.5"),
    (p (str "a") (dec 1 10), js "a0.0000000001"),
    (p (str "a") (big 123456789012345678901234567890), js "a123456789012345678901234567890"),
    (p (str "a") (.lit (.bool true)), js "atrue"), (p (.lit (.bool true)) (str "a"), js "truea"),
    (p (str "a") (.lit .null), js "a"),
    (p (.lit (.bool true)) (.lit (.bool false)), .bool true),
    (p (.lit (.bool false)) (.lit (.bool false)), .bool false),
    (p (.lit (.bool true)) (int 1), .bool true),
    (p (lst [int 1]) (lst [int 2]), jl [j 1, j 2]), (p (lst [int 1]) (lst [int 2]), jl [j 1]),
    (p (lst [int 1]) (lst [int 2]), jl [j 1, j 2, j 3]), (p (lst []) (lst []), jl []),
    (p (lst [int 1]) (int 2), j 1), (p (int 2) (lst [int 1]), j 1),
    (p (str "a") (lst [int 1]), js "a"),
    (p (mp [("a", int 1)]) (mp [("b", int 2)]), .map [("a", j 1), ("b", j 2)]),
    (p .integer (int 1), j 2), (p .string (str "a"), js "ba"),
    (p (.or [(1, int 1), (0, .number)]) (int 1), j 2),
    (p (.pref 1 (int 1)) (int 1), j 2), (p (int 1) (.pref 2 (int 2)), j 3),
    (p (.ride .metadata (int 1) []) (int 1), j 2), (p (.ride .type (int 1) []) (int 1), j 2),
    (p (.ride .metadata (lst [int 1]) []) (lst [int 2]), jl [j 1, j 2]),
    (p (lst [int 1]) (lst [.pref 1 (int 2)]), jl [j 1, j 2]),
    (p (.meet (.list [] (some .integer) false) (lst [int 1])) (lst [str "x"]), jl [j 1, js "x"]),
    (p (.list [int 1] none true) (lst [int 2]), jl [j 1, j 2]),
    (p (p (str "a") (str "b")) (int 1), js "ab1"), (p (p (int 1) (int 2)) (str "a"), js "3a"),
    (p (.meet (int 1) .integer) (int 1), j 2), (p (str "") (str ""), js ""),
    (p (c .add [int 1, int 2]) (int 1), j 4), (p (c .sum [lst [int 1, int 2]]) (str "a"), js "3a"),
    (p (p .integer (int 1)) (str "a"), j 1), (p (.meet (int 1) (int 2)) .integer, j 1),
    (c .sum [.ride .type (mp [("a", .ride .hide (int 1) []), ("b", int 2)]) []], j 3),
    (c .sum [.ride .hide (mp [("a", .ride .hide (int 1) []), ("b", int 2)]) []], j 3),
    (c .sum [.ride .metadata (.ride .type (mp [("a", .ride .hide (int 1) []), ("b", int 2)]) []) []], j 3),
    (c .add [.pref 1 (.ride .metadata (int 1) []), int 2], j 3),
    (c .sum [lst [.pref 1 (.ride .metadata (int 1) []), int 2]], j 3),
    (p (.pref 1 (.ride .metadata (int 1) [])) (int 1), j 2),
    (.select (int 1) [(p .integer (int 1), str "yes")] (some (str "no")), js "no"),
    (.select (int 2) [(p (int 1) (int 1), str "yes")] (some (str "no")), js "yes"),
    (.select (int 1) [(c .add [.integer, int 1], str "yes")] (some (str "no")), js "no"),
    (c .join [lst [str "a", str "b"], str "-"], js "a-b"),
    (c .join [lst [str "a", str "b"], str "-"], js "ab"),
    (c .join [lst [str "a", str "b"]], js "ab"), (c .join [lst []], js ""),
    (c .join [lst [int 1, flt 2 1, dec 5 1, .lit (.bool true)], str "|"], js "1|2|0.5|true"),
    (c .join [mp [("b", str "B"), ("a", str "A")], str ","], js "A,B"),
    (c .join [lst [mp [("x", int 1)]], str ","], js "a"),
    (c .join [lst [.lit .null], str ","], js "a"), (c .join [lst [lst [int 1]], str ","], js "a"),
    (c .join [lst [.string], str ","], js "a"), (c .join [lst [str "a"], int 5], js "a"),
    (c .join [int 3, str ","], js "a"), (c .join [lst [str "a"], .string], js "a"),
    (c .join [lst [str "a", .pref 1 (str "b")], str ""], js "ab"),
    (c .join [lst [str "a", .or [(1, str "b"), (0, str "c")]], str ""], js "ab"),
    (c .join [mp [("a", str "x"), ("b", .ride .hide (str "y") [])], str "-"], js "x"),
    (c .join [.map [("a", true, .string), ("b", false, str "y")] none false, str "-"], js "y"),
    (c .join [lst [str "a"], str ",", str ";"], js "a"),
    (c .join [lst [str "a", flt (10 ^ 21) 1], str ""], js "a1e+21"),
    (c .join [lst [.ride .metadata (str "a") [], str "b"], str ""], js "ab"),
    (c .join [lst [mp [("x", int 1)], .string], str ","], js "a"),
    (c .join [lst [.string], int 5], js "a"), (c .join [lst [mp [("x", int 1)]], .string], js "a"),
    (c .join [int 3, .string], js "a"), (c .join [lst [str "a"], .pref 1 (str ",")], js "a"),
    (c .join [lst [str "a", str "b"], .ride .metadata (str "-") []], js "a-b"),
    (c .join [.meet (lst [str "x"]) (lst [.string]), str ","], js "x"),
    (c .join [lst [str "a"], .or [(0, str ","), (0, str ";")]], js "a"),
    (c .join [.pref 1 (lst [str "a"]), str ","], js "a"),
    (c .join [lst [p (str "a") (int 1), c .sum [lst [int 1, int 2]]], str "-"], js "a1-3"),
    (c .pick [lst [mp [("a", int 1)], mp [("a", int 2)]], str "a"], jl [j 1, j 2]),
    (c .pick [lst [mp [("a", int 1)], mp [("a", int 2)]], str "a"], jl [j 1, j 3]),
    (c .pick [lst [mp [("a", int 1)], mp [("b", int 2)]], str "a"], jl [j 1]),
    (c .pick [lst [lst [int 9, int 8], lst [int 7, int 6]], int 0], jl [j 9, j 7]),
    (c .pick [lst [lst [int 9, int 8], lst [int 7]], int 1], jl [j 8]),
    (c .pick [lst [lst [int 9]], int (-1)], jl [j 9]), (c .pick [lst [int 1, int 2], str "a"], jl []),
    (c .pick [lst [.integer], str "a"], jl []), (c .pick [int 3, str "a"], jl []),
    (c .pick [lst [mp [("a", int 1)]], flt 0 1], jl [j 1]),
    (c .pick [lst [mp [("a", int 1)]], .string], jl [j 1]),
    (c .pick [lst [mp [("a", int 1)]], .pref 1 (str "a")], jl [j 1]),
    (c .pick [lst [mp [("a", int 1)]], .lit (.bool true)], jl [j 1]),
    (c .pick [lst [lst [int 5]], big 0], jl [j 5]),
    (c .pick [lst [], str "a"], jl []), (c .pick [mp [], str "a"], jl []),
    (c .pick [mp [("y", mp [("a", int 2)]), ("x", mp [("a", int 1)])], str "a"], jl [j 1, j 2]),
    (c .pick [mp [("y", mp [("a", int 2)]), ("x", mp [("a", int 1)])], str "a"], jl [j 2, j 1]),
    (c .pick [lst [mp [("a", .integer)]], str "a"], jl [j 1]),
    (c .pick [lst [.map [("a", true, int 1)] none false], str "a"], jl [j 1]),
    (c .pick [mp [("a", mp [("n", int 1)]), ("b", .ride .hide (mp [("n", int 2)]) [])], str "n"],
      jl [j 1]),
    (c .pick [lst [mp [("a", mp [("b", int 1)])]], str "a"], jl [jm [("b", j 1)]]),
    (c .pick [c .pick [lst [mp [("a", mp [("b", int 1)])]], str "a"], str "b"], jl [j 1]),
    (c .pick [lst [.ride .metadata (mp [("a", int 1)]) []], str "a"], jl [j 1]),
    (c .pick [lst [lst [int 1, int 2]], str "1"], jl [j 2]),
    (c .pick [lst [lst [int 1, int 2]], str "01"], jl [j 2]),
    (c .pick [lst [lst [int 1, int 2]], str "-0"], jl [j 1]),
    (c .pick [lst [lst [int 1, int 2]], str "-1"], jl [j 1]),
    (c .pick [lst [mp [("0", int 5)]], int 0], jl [j 5]),
    (c .pick [lst [mp [("-1", int 5)]], int (-1)], jl [j 5]),
    (c .pick [lst [mp [("00", int 5)]], int 0], jl [j 5]),
    (c .pick [lst [mp [("a", int 1)]], int 0], jl [j 1]),
    (c .pick [mp [("a", lst [int 1, int 2]), ("b", lst [int 3, int 4])], int 1], jl [j 2, j 4]),
    (c .pick [lst [mp [("a", int 1)]], str "a", str "b"], jl [j 1]),
    (c .pick [lst [mp [("a", int 1)]]], jl [j 1]),
    (c .sort [lst [int 3, int 1, int 2]], jl [j 1, j 2, j 3]),
    (c .sort [lst [int 3, int 1, int 2]], jl [j 3, j 1, j 2]),
    (c .sort [lst [int 2, int 1]], jl [j 1, j 2, j 3]),
    (c .sort [mp [("x", str "c"), ("y", str "a")]], jl [js "a", js "c"]),
    (c .sort [lst [mp [("n", str "b")], mp [("n", str "a")]], str "n"],
      jl [jm [("n", js "a")], jm [("n", js "b")]]),
    (c .sort [lst [mp [("n", int 1)], mp [("n", int 3)]], str "n", str "desc"],
      jl [jm [("n", j 3)], jm [("n", j 1)]]),
    (c .sort [lst [int 1, int 3, int 2], str "", str "desc"], jl [j 3, j 2, j 1]),
    (c .sort [lst [int 2, int 1], str "", str "asc"], jl [j 1, j 2]),
    (c .sort [lst [kv 1 "a", kv 1 "b", kv 0 "c"], str "k", str "desc"],
      jl [jkv 1 "a", jkv 1 "b", jkv 0 "c"]),
    (c .sort [lst [kv 1 "a", kv 0 "c", kv 1 "b"], str "k"], jl [jkv 0 "c", jkv 1 "a", jkv 1 "b"]),
    (c .sort [lst [big 9007199254740993, int 9007199254740992]],
      jl [j 9007199254740992, jbig 9007199254740993]),
    (c .sort [lst [dec 15 1, int 1, flt 125 100]], jl [j 1, jf 125 100, jdec 15 1]),
    (c .sort [lst [str "b", str "a", str "B"]], jl [js "B", js "a", js "b"]),
    (c .sort [lst [str "é", str "z", str "e"]], jl [js "e", js "z", js "é"]),
    (c .sort [lst [int 1, str "a"]], jl []), (c .sort [lst [.lit (.bool true), .lit (.bool false)]], jl []),
    (c .sort [lst [.lit .null]], jl []), (c .sort [lst [lst [int 1], lst [int 2]]], jl []),
    (c .sort [lst [.integer, int 1]], jl [j 1, j 1]), (c .sort [lst [int 1, int 2], int 0], jl [j 1, j 2]),
    (c .sort [lst [int 2, int 1], str "desc"], jl [j 2, j 1]),
    (c .sort [lst [int 2, int 1], str "", str "DESC"], jl [j 2, j 1]),
    (c .sort [lst [int 2, int 1], str "", .pref 1 (str "desc")], jl [j 2, j 1]),
    (c .sort [lst [int 2, int 1], flt 0 1], jl [j 1, j 2]),
    (c .sort [lst [mp [("", int 2)], mp [("", int 1)]], str ""], jl []),
    (c .sort [lst []], jl []), (c .sort [mp []], jl []), (c .sort [int 3], jl []),
    (c .sort [lst [int 3, .pref 1 (int 2)]], jl [j 2, j 3]),
    (c .sort [lst [mp [("a", .pref 1 (int 2))], mp [("a", int 1)]], str "a"],
      jl [jm [("a", j 1)], jm [("a", j 2)]]),
    (c .sort [lst [.ride .metadata (int 2) [], int 1]], jl [j 1, j 2]),
    (c .sort [lst [lst [int 2, int 9], lst [int 1, int 8]], int 0], jl [jl [j 1, j 8], jl [j 2, j 9]]),
    (c .sort [lst [lst [int 2, int 9], lst [int 1, int 8]], int 1, str "desc"],
      jl [jl [j 2, j 9], jl [j 1, j 8]]),
    (c .sort [lst [lst [int 2], lst [int 1]], str "0"], jl [jl [j 1], jl [j 2]]),
    (c .sort [lst [mp [("0", int 2)], mp [("0", int 1)]], int 0], jl [jm [("0", j 1)], jm [("0", j 2)]]),
    (c .sort [mp [("b", int 2), ("a", .ride .hide (int 1) []), ("c", int 0)]], jl [j 0, j 2]),
    (c .sort [lst [int 2, int 1], str "", str "desc", str "x"], jl [j 2, j 1]),
    (c .join [c .pick [c .sort [lst [mp [("n", str "id")], mp [("n", str "age")]], str "n"], str "n"],
      str ", "], js "age, id"),
    (c .upper [str "abc"], js "ABC"), (c .upper [str "abc"], js "abc"),
    (c .lower [str "ABC"], js "abc"), (c .lower [str ""], js ""),
    (c .upper [str "foo", int 0, int 1], js "Foo"), (c .upper [str "foo", int 1], js "fOO"),
    (c .upper [str "foo", int (-1), int 2], js "FOo"),
    (c .lower [str "FOOBAR", int (-3), int (-1)], js "fooBAR"),
    (c .lower [str "FOO", int 1, int (-1)], js "Foo"), (c .upper [str "foo", int 5], js "foo"),
    (c .upper [str "foo", int (-5), int 2], js "foo"), (c .upper [str "foo", int 0, int 0], js "foo"),
    (c .upper [str "foo", int 0, int (-2)], js "FOO"), (c .upper [str "foo", int 1, int 5], js "fOO"),
    (c .lower [str "ABC", big 1, big 1], js "AbC"),
    (c .upper [str "foo", big 9007199254740991], js "foo"),
    (c .upper [str "foo", big 99999999999999999999], js "foo"),
    (c .upper [str "foo", int 9007199254740992], js "foo"),
    (c .upper [str "foo", flt 1 1], js "fOO"), (c .upper [str "foo", .pref 1 (int 1)], js "fOO"),
    (c .upper [str "foo", .integer], js "foo"),
    (c .upper [str "foo", .ride .metadata (int 1) []], js "fOO"),
    (c .upper [.ride .metadata (str "a") []], js "A"), (c .upper [.pref 1 (str "a")], js "A"),
    (c .upper [.or [(0, str "a"), (0, str "b")]], js "A"), (c .upper [.lit (.bool true)], js "TRUE"),
    (c .upper [.lit .null], js "NULL"), (c .upper [lst [int 1]], jl [j 1]), (c .upper [.string], js "A"),
    (c .upper [.number], j 1),
    (c .upper [flt 11 10], jf 2 1), (c .upper [flt 11 10], j 2), (c .upper [int 2], j 2),
    (c .upper [flt (-5) 10], jf 0 1), (c .lower [flt 5 10], jf 0 1), (c .lower [flt 19 10], jf 1 1),
    (c .upper [flt 25 10], jf 3 1), (c .lower [flt (-25) 10], jf (-3) 1),
    (c .upper [dec 11 1], jdec 2 0), (c .upper [dec 11 1], jbig 2), (c .lower [dec (-15) 1], jdec (-2) 0),
    (c .upper [dec (-5) 1], jdec 0 0), (c .upper [big 5], jbig 5),
    (c .upper [flt 15 10, int 0], jf 2 1), (c .upper [int 1, int 0], j 1),
    (c .upper [str "a", int 0, int 1, int 2], js "A"), (c .upper [], js "A"),
    (p (c .upper [str "abc"]) (str "def"), js "ABCdef"), (p (c .lower [flt 11 10]) (int 2), jf 3 1),
    (c .upper [c .join [lst [str "a", str "b"], str "-"]], js "A-B"),
    (c .translate [str "a-b-c", str "-", str "_"], js "a_b_c"),
    (c .translate [str "a-b-c", str "-", str "_"], js "a-b-c"),
    (c .translate [str "hello", str "a-y", str "b-z"], js "ifmmp"),
    (c .translate [str "hello", str "lo"], js "he"), (c .translate [str "hello", str "lo", str ""], js "he"),
    (c .translate [str "hello", str "elo", str "x"], js "hxxxx"),
    (c .translate [str "aaa", str "aa", str "xy"], js "yyy"),
    (c .translate [str "abc", str "z-a", str "x"], js "abc"),
    (c .translate [str "abc", str "a", str "z-a"], js "abc"),
    (c .translate [str "abc", str "c-a-z", str "x"], js "abc"),
    (c .translate [str "a-b", str "-a", str "xy"], js "yxb"),
    (c .translate [str "a-b", str "a-", str "xy"], js "xyb"),
    (c .translate [str "abcde-", str "a-c-e", str "x"], js "xxxdxx"),
    (c .translate [str "abc", str "--a", str "x"], js "xbc"),
    (c .translate [str "a-", str "-", str ""], js "a"),
    (c .translate [str "abc", str "", str "x"], js "abc"), (c .translate [str "", str "a", str "b"], js ""),
    (c .translate [str "abc", str "a-c", str "A-C"], js "ABC"),
    (c .translate [str "abc", str "a-a", str "x"], js "xbc"),
    (c .translate [str "a😀b", str "😀", str "x"], js "axb"), (c .translate [str "é", str "a-z", str "x"], js "é"),
    (c .translate [str "abc", str "a-c", str "é"], js "ééé"),
    (c .translate [int 1, str "a"], js "1"), (c .translate [str "a", int 1], js "a"),
    (c .translate [str "a", str "a", int 1], js "1"), (c .translate [.string, str "a"], js "a"),
    (c .translate [.ride .metadata (str "abc") [], str "a", str "x"], js "xbc"),
    (c .translate [.pref 1 (str "abc"), str "a", str "x"], js "xbc"),
    (c .translate [str "abc", str "a", .ride .metadata (str "x") []], js "xbc"),
    (c .translate [str "a"], js "a"), (c .translate [str "a", str "b", str "c", str "d"], js "a"),
    (c .upper [c .translate [str "a-b", str "-", str "_"]], js "A_B"),
    (c .translate [str "\uE000", str "\uD7FF-\uE000", str "xyz"], js "z"),
    (c .translate [str "\uFFFD", str "\uD7FF-\uE000", str "xyz"], js "\uFFFD"),
    (c .esc [str "plain text"], js "plain text"),
    -- A control character before `z`, not a hexadecimal digit: Lean 4.24 writes it into
    -- the compiled oracle as a C `\x01` escape, which a hexadecimal digit after it would extend.
    (c .esc [str "a\"b\\c\nd\te\x01z"], js "a\\\"b\\\\c\\nd\\te\\u0001z"),
    (c .esc [str "a\"b\\c\nd\te\x01z"], js "a\"b\\c\nd\te\x01z"),
    (c .esc [str "é😀\x7f"], js "é😀\x7f"), (c .esc [str "it's \"q\"", str "sq"], js "it\\'s \"q\""),
    (c .usc [str "\\\"x\\u00e9\\u00E9"], js "\"xéé"), (c .usc [str "\\'"], js "'"),
    (c .usc [str "\\/"], js "/"), (c .usc [str "\\uD83D\\uDE00"], js "😀"), (c .usc [str "\\uDE00"], js "a"),
    (c .usc [str "\\uD83D"], js "a"), (c .usc [str "\\x41"], js "A"), (c .usc [str "a\\"], js "a"),
    (c .usc [str "\\u12"], js "a"), (c .usc [str "\\'", str "sq"], js "'"),
    (c .esc [str "o'brien", str "sql"], js "o''brien"), (c .usc [str "o'brien", str "sql"], js "o'brien"),
    (c .usc [str "o''brien", str "sql"], js "o'brien"), (c .esc [str "it's", str "shell"], js "it'\\''s"),
    (c .usc [str "it'\\''s", str "shell"], js "it's"), (c .usc [str "it's", str "shell"], js "it's"),
    (c .esc [str "<a>&\"'", str "xml"], js "&lt;a&gt;&amp;&quot;&apos;"),
    (c .usc [str "&amp;&lt;&gt;&quot;&apos;", str "xml"], js "&<>\"'"),
    (c .usc [str "&#39;", str "xml"], js "'"), (c .usc [str "a&b", str "xml"], js "a&b"),
    (c .esc [str "a b/c~-._é😀+", str "uri"], js "a%20b%2Fc~-._%C3%A9%F0%9F%98%80%2B"),
    (c .usc [str "%c3%a9%C3%A9+", str "uri"], js "éé+"), (c .usc [str "%C3", str "uri"], js "a"),
    (c .usc [str "%E0%80%80", str "uri"], js "a"), (c .usc [str "%ED%A0%80", str "uri"], js "a"),
    (c .usc [str "%F4%90%80%80", str "uri"], js "a"), (c .usc [str "%", str "uri"], js "%"),
    (c .usc [str "%zz", str "uri"], js "a"), (c .usc [str "é", str "uri"], js "é"),
    (c .esc [str "a.b-c\\/", str "regex"], js "a\\.b-c\\\\\\/"),
    (c .usc [str "a\\.b", str "regex"], js "a.b"), (c .usc [str "a\\-b", str "regex"], js "a-b"),
    (c .esc [str "a", str "nope"], js "a"), (c .usc [str "a", str "nope"], js "a"),
    (c .esc [str "a", str ""], js "a"), (c .usc [str "x", str "none"], js "x"),
    (c .esc [int 1], js "1"), (c .esc [.string], js "a"), (c .esc [.ride .metadata (str "a") []], js "a"),
    (c .esc [.pref 1 (str "a")], js "a"), (c .esc [str "a'", .ride .metadata (str "sq") []], js "a\\'"),
    (c .esc [], js "a"), (c .usc [str "a", str "sq", str "x"], js "a"),
    (c .usc [c .esc [str "a'\n\"<&é😀", str "sq"], str "sq"], js "a'\n\"<&é😀"),
    (c .usc [c .esc [str "a b/é", str "uri"], str "uri"], js "a b/é"),
    (c .esc [c .upper [str "a b"], str "uri"], js "A%20B"),
    (c .super [int 1], j 5), (c .super [int 1], js "a"), (c .super [int 1], jf 15 10),
    (c .super [mp [("a", int 1)]], jm [("a", j 7)]),
    (c .super [mp [("a", int 1)]], jm [("a", j 2), ("b", j 3)]),
    (c .super [.pref 1 (int 1)], j 5), (c .super [.pref 1 (int 1)], jf 15 10),
    (c .super [str ""], js ""), (c .super [str ""], js "a"), (c .super [str "a"], js ""),
    (c .super [.integer], jf 15 10), (c .super [.number], js "a"), (c .super [.lit .null], .null),
    (c .super [.lit (.bool true)], .bool false), (c .super [lst [int 1, str "a"]], jl [j 2, js "b"]),
    (c .super [.min (.num (.integer ⟨3, by decide⟩))], j 1),
    (c .super [.or [(0, int 1), (0, str "a")]], j 5), (c .super [.or [(0, int 1), (0, str "a")]], js "b"),
    (c .super [.or [(0, int 1), (0, str "a")]], .bool true),
    (c .super [.meet .integer (.min (.num (.integer ⟨3, by decide⟩)))], j 1),
    (c .super [.meet .integer (.min (.num (.integer ⟨3, by decide⟩)))], jf 15 10),
    (c .super [.or [(1, int 1), (0, flt 25 10)]], jf 15 10), (c .super [.pref 1 (str "a")], js ""),
    (c .super [mp [("a", .pref 1 (int 1))]], jm [("a", j 2)]),
    (c .super [mp [("a", .pref 1 (int 1))]], jm [("a", jf 15 10)]),
    (c .super [.string], j 1), (c .super [lst [int 1]], jl [j 2, j 3]),
    (c .super [.map [("a", false, int 1)] none true], jm [("a", j 2), ("b", j 3)]),
    (c .super [.ride .hide (int 1) []], j 2), (c .super [.ride .metadata (int 1) []], j 2),
    (c .super [c .super [int 1]], jf 15 10), (c .super [c .add [int 1, int 2]], j 7),
    (c .super [.any], j 1), (c .super [dec 15 1], jdec 25 1), (c .super [flt 15 10], j 2),
    (c .super [], j 1), (c .super [int 1, int 2], j 1),
    (c .split [str "a,,b", str ","], jl [js "a", js "", js "b"]),
    (c .split [str "a,,b", str ","], jl [js "a", js "b"]),
    (c .split [str "abc", str ""], jl [js "a", js "b", js "c"]), (c .split [str "abc", str ","], jl [js "abc"]),
    (c .split [str "", str ","], jl [js ""]), (c .split [str "", str ""], jl []),
    (c .split [str "a--b", str "--"], jl [js "a", js "b"]), (c .split [str "aaa", str "aa"], jl [js "", js "a"]),
    (c .split [str "a😀b", str ""], jl [js "a", js "😀", js "b"]),
    (c .split [str ",a,", str ","], jl [js "", js "a", js ""]),
    (c .split [str "aababc", str "abc"], jl [js "aab", js ""]),
    (c .split [str "é,😀", str ","], jl [js "é", js "😀"]),
    (c .split [str "a,b", str ","], jl [js "a", js "b", js "c"]),
    (c .split [int 1, str ","], jl [js "1"]), (c .split [str "a", int 1], jl [js "a"]),
    (c .split [str "a", .string], jl [js "a"]),
    (c .split [.ride .metadata (str "a,b") [], str ","], jl [js "a", js "b"]),
    (c .split [str "a,b", .ride .metadata (str ",") []], jl [js "a", js "b"]),
    (c .split [.pref 1 (str "a,b"), str ","], jl [js "a", js "b"]),
    (c .split [str "a,b", .pref 1 (str ",")], jl [js "a", js "b"]),
    (c .split [str "a"], jl [js "a"]), (c .split [str "a", str ",", str ","], jl [js "a"]),
    (c .join [c .split [str "a,,b", str ","], str ","], js "a,,b"),
    (c .split [c .upper [str "a-b"], str "-"], jl [js "A", js "B"]),
    (c .rep [str "a1b1", str "1", str "_"], js "a_b_"),
    (c .rep [str "a1b1", str "1", str "_"], js "a_b1"),
    (c .rep [str "aaa", str "aa", str "-"], js "-a"),
    (c .rep [str "abc", str "", str "-"], js "-a-b-c-"),
    (c .rep [str "", str "", str "-"], js "-"), (c .rep [str "", str "x", str "-"], js ""),
    (c .rep [str "abc", str "x", str "-"], js "abc"),
    (c .rep [str "a😀b", str "", str "-"], js "-a-😀-b-"),
    (c .rep [str "a😀b", str "😀", str "é"], js "aéb"),
    (c .rep [str "abc", str "b", str "[$&]"], js "a[b]c"),
    (c .rep [str "x-y", str "-", str "$&$&"], js "x--y"),
    (c .rep [str "abc", str "b", str "$$"], js "a$c"),
    (c .rep [str "abc", str "(b)", str "<$1>"], js "a<b>c"),
    (c .rep [str "2026-09-04", str "(2026)-(09)-(04)", str "$3/$2/$1"], js "04/09/2026"),
    (c .rep [str "abab", str "(a)(b)", str "$2$1"], js "baba"),
    (c .rep [str "abc", str "(b)", str "$10"], js "ab0c"),
    (c .rep [str "abc", str "b", str "$1"], js "a$1c"),
    (c .rep [str "abc", str "(b)", str "$2"], js "ac"),
    (c .rep [str "abc", str "b", str "$"], js "a$c"),
    (c .rep [str "abc", str "b", str "x$"], js "ax$c"),
    (c .rep [str "abc", str "b", str "$x"], js "a$xc"),
    (c .rep [str "abc", str "b", str "$0"], js "a$0c"),
    (c .rep [str "abc", str "(?<n>b)", str "-"], js "a-c"),
    (c .rep [str "abc", str "(?=b)", str "-"], js "a-bc"),
    (c .rep [str "abc", str "\\p{L}", str "-"], js "---"),
    (c .rep [str "abab", str "(a)\\1", str "-"], js "abab"),
    (c .rep [int 1, str "1", str "2"], js "2"), (c .rep [str "a", int 1, str "b"], js "a"),
    (c .rep [str "a", str "a", int 1], js "1"), (c .rep [.string, str "a", str "b"], js "b"),
    (c .rep [.ride .metadata (str "a1") [], str "1", str "_"], js "a_"),
    (c .rep [str "a1", .ride .metadata (str "1") [], str "_"], js "a_"),
    (c .rep [str "a1", str "1", .ride .metadata (str "_") []], js "a_"),
    (c .rep [.pref 1 (str "a1"), str "1", str "_"], js "a_"),
    (c .rep [str "a", str "a"], js "a"), (c .rep [str "a", str "a", str "b", str "c"], js "b"),
    (c .rep [c .upper [str "a-b"], str "-", str "_"], js "A_B"),
    (c .split [c .rep [str "a1b", str "1", str ","], str ","], jl [js "a", js "b"]),
    (c .rep [c .join [lst [str "a", str "b"], str "-"], str "-", str ""], js "ab"),
    (c .nom [str "planet_body", str "pascal"], js "PlanetBody"),
    (c .nom [str "planet_body", str "pascal"], js "planetBody"),
    (c .nom [str "planet_body", str "camel"], js "planetBody"),
    (c .nom [str "planet_body", str "snake"], js "planet_body"),
    (c .nom [str "planet_body", str "kebab"], js "planet-body"),
    (c .nom [str "planet_body", str "dot"], js "planet.body"),
    (c .nom [str "planet_body", str "path"], js "planet/body"),
    (c .nom [str "planet_body", str "upper"], js "PLANET_BODY"),
    (c .nom [str "planet_body", str "title"], js "Planet Body"),
    (c .nom [str "planet_body", str "text"], js "Planet body"),
    (c .nom [str "HTTPServer", str "snake"], js "http_server"),
    (c .nom [str "v2Api", str "kebab"], js "v-2-api"), (c .nom [str "aB1c", str "snake"], js "a_b_1_c"),
    (c .nom [str "ABc", str "snake"], js "a_bc"), (c .nom [str "aBC", str "snake"], js "a_bc"),
    (c .nom [str "x__y--z  w", str "dot"], js "x.y.z.w"), (c .nom [str "a.b/c", str "snake"], js "a_b_c"),
    (c .nom [str "_a", str "pascal"], js "A"), (c .nom [str "a1", str "camel"], js "a1"),
    (c .nom [str "Ünïcode_name", str "pascal"], js "ÜnïcodeName"),
    (c .nom [str "éA", str "snake"], js "éa"),
    (c .nom [str "user_id", str "pascal", lst [str "ID"]], js "UserID"),
    (c .nom [str "user id", str "camel", lst [str "ID"]], js "userID"),
    (c .nom [str "id_user", str "camel", lst [str "ID"]], js "idUser"),
    (c .nom [str "user_id", str "text", lst [str "ID"]], js "User ID"),
    (c .nom [str "ID_user", str "text", lst [str "ID"]], js "ID user"),
    (c .nom [str "user_id", str "pascal", lst [str "Id", str "ID"]], js "UserId"),
    (c .nom [str "user_id", str "camel", lst []], js "userId"),
    (c .nom [str "user_id"], jm [("camel", js "userId"), ("dot", js "user.id"), ("kebab", js "user-id"),
      ("pascal", js "UserId"), ("path", js "user/id"), ("snake", js "user_id"), ("text", js "User id"),
      ("title", js "User Id"), ("upper", js "USER_ID")]),
    (c .nom [str "user_id", lst [str "ID"]], jm [("camel", js "userID"), ("dot", js "user.id"),
      ("kebab", js "user-id"), ("pascal", js "UserID"), ("path", js "user/id"), ("snake", js "user_id"),
      ("text", js "User ID"), ("title", js "User ID"), ("upper", js "USER_ID")]),
    (c .nom [str "user_id"], jm [("camel", js "userId"), ("dot", js "user.id"), ("kebab", js "user-id"),
      ("pascal", js "UserId"), ("path", js "user/id"), ("snake", js "user_id"), ("text", js "User id"),
      ("title", js "User Id"), ("upper", js "USER_ID"), ("x", js "y")]),
    (c .nom [str "user_id"], jm [("camel", js "userId")]),
    (c .nom [str "user_id", lst []], jm [("camel", js "userId"), ("dot", js "user.id"), ("kebab", js "user-id"),
      ("pascal", js "UserId"), ("path", js "user/id"), ("snake", js "user_id"), ("text", js "User id"),
      ("title", js "User Id"), ("upper", js "USER_ID")]),
    (c .nom [str ""], js "a"), (c .nom [str "___"], js "a"), (c .nom [str "user_id", str "nope"], js "a"),
    (c .nom [str "user_id", lst [str "ID"], str "x"], js "a"),
    (c .nom [str "user_id", str "pascal", lst [str "id", str ""]], js "UserId"),
    (c .nom [str "user_id", str "pascal", str "ID"], js "UserID"), (c .nom [int 1], js "1"),
    (c .nom [str "user_id", int 1], js "a"), (c .nom [str "a", str "pascal", lst [int 1]], js "A"),
    (c .nom [.string], js "a"), (c .nom [.pref 1 (str "user_id"), str "pascal"], js "UserId"),
    (c .nom [.ride .metadata (str "user_id") [], str "pascal"], js "UserId"),
    (c .nom [str "user_id", .ride .metadata (str "pascal") []], js "UserId"),
    (c .nom [str "user_id", str "pascal", .ride .metadata (lst [str "ID"]) []], js "UserID"),
    (c .nom [str "user_id", str "pascal", lst [.ride .metadata (str "ID") []]], js "UserID"),
    (c .nom [], js "a"), (c .nom [str "a", str "camel", lst [], str "x"], js "a"),
    (c .nom [c .join [lst [str "user", str "id"], str "_"], str "camel"], js "userId"),
    (c .upper [c .nom [str "user_id", str "kebab"]], js "USER-ID"),
    (c (.cmp .folder) [str "src"], node "Folder" [("name", js "src")] []),
    (c (.cmp .folder) [str "src"], node "Folder" [("name", js "x")] []),
    (c (.cmp .folder) [str "src"],
      jm [("cmp", js "Folder"), ("props", jm [("name", js "src")]), ("children", jl []), ("x", j 1)]),
    (c (.cmp .folder) [str "src"], node "Folder" [("name", js "src"), ("x", j 1)] []),
    (c (.cmp .folder) [str "src"], node "Folder" [("name", js "src")] [j 1]),
    (c (.cmp .folder) [str "src"], jm []),
    (c (.cmp .folder) [mp [("name", str "src")]], node "Folder" [("name", js "src")] []),
    (c (.cmp .folder) [str "src", lst [c (.cmp .file) [str "a"]]],
      node "Folder" [("name", js "src")] [node "File" [("name", js "a")] []]),
    (c (.cmp .file) [str "f", lst [str "x"]], node "File" [("name", js "f")] [lineD "x"]),
    (c (.cmp .file) [str "f", lst [str "x", lst [str "y", c (.cmp .line) [str "z"]]]],
      node "File" [("name", js "f")] [lineD "x", lineD "y", lineD "z"]),
    (c (.cmp .line) [str ""], lineD ""), (c (.cmp .content) [str "x"], node "Content" [("src", js "x")] []),
    (c (.cmp .copyfiles) [str "assets"], node "CopyFiles" [("from", js "assets")] []),
    (c (.cmp .fragment) [str "head.ts", lst [c (.cmp .slot) [str "body"]]],
      node "Fragment" [("from", js "head.ts")] [node "Slot" [("name", js "body")] []]),
    (c (.cmp .inject) [str "routes", lst [c (.cmp .line) [str "app.use(r)"]]],
      node "Inject" [("name", js "routes")] [lineD "app.use(r)"]),
    (c (.cmp .listitems) [mp [("item", lst [int 1, int 2])], lst [c (.cmp .line) [str "x"]]],
      node "ListItems" [("item", jl [j 1, j 2])] [lineD "x"]),
    (c (.cmp .project) [], node "Project" [] []),
    (c (.cmp .project) [str "./build", lst [c (.cmp .folder) [str "src"]]],
      node "Project" [("folder", js "./build")] [node "Folder" [("name", js "src")] []]),
    (c (.cmp .project) [mp [("name", str "p")]], node "Project" [("name", js "p")] []),
    (c (.cmp .file) [mp [("name", str "f"), ("mode", int 420)]],
      node "File" [("name", js "f"), ("mode", j 420)] []),
    (c (.cmp .folder) [str "src", lst [mp [("cmp", str "File"), ("props", mp [("name", str "x")]),
        ("children", lst [])]]],
      node "Folder" [("name", js "src")] [node "File" [("name", js "x")] []]),
    (c (.cmp .folder) [str ""], jm []), (c (.cmp .folder) [mp []], jm []),
    (c (.cmp .folder) [mp [("name", str "src"), ("x", int 1)]], jm []),
    (c (.cmp .project) [mp [("folder", str "")]], jm []),
    (c (.cmp .listitems) [mp [("item", str "x")]], jm []), (c (.cmp .listitems) [mp []], jm []),
    (c (.cmp .listitems) [str "x"], jm []),
    (c (.cmp .folder) [str "src", lst [str "x"]], jm []),
    (c (.cmp .folder) [str "src", lst [c (.cmp .line) [str "x"]]], jm []),
    (c (.cmp .folder) [str "src", lst [mp [("cmp", str "Nope")]]], jm []),
    (c (.cmp .folder) [str "src", str "x"], jm []), (c (.cmp .folder) [int 1], jm []),
    (c (.cmp .folder) [.pref 1 (str "src")], jm []),
    (c (.cmp .folder) [str "src", lst [.pref 1 (str "x")]], jm []),
    (c (.cmp .folder) [mp [("name", .string)]], jm []),
    (c (.cmp .folder) [.ride .metadata (str "src") []], node "Folder" [("name", js "src")] []),
    (c (.cmp .folder) [mp [("name", .ride .metadata (str "src") [])]], node "Folder" [("name", js "src")] []),
    (c (.cmp .folder) [str "src", .ride .metadata (lst [c (.cmp .file) [str "x"]]) []],
      node "Folder" [("name", js "src")] [node "File" [("name", js "x")] []]),
    (c (.cmp .folder) [], jm []), (c (.cmp .content) [str "x", lst []], jm []),
    (c (.cmp .folder) [str "a", lst [], int 1], jm []),
    (c .upper [c (.cmp .folder) [str "src"]], js "SRC"),
    (c (.cmp .folder) [c .join [lst [str "s", str "rc"], str ""]], node "Folder" [("name", js "src")] []),
    (c .each [lst [int 1, int 2], .hole], jl [j 1, j 2]), (c .each [lst [int 1, int 2], .hole], jl [j 1, j 3]),
    (c .each [lst [int 1, int 2], .hole], jl [j 1, j 2, j 3]), (c .each [lst [int 1, int 2], .hole], jl [j 1]),
    (c .each [mp [("b", int 2), ("a", int 1)], .hole], jl [j 1, j 2]),
    (c .each [lst [str "x", str "y"], c .upper [.hole]], jl [js "X", js "Y"]),
    (c .each [lst [int 1, int 2], mp [("v", .hole)]], jl [jm [("v", j 1)], jm [("v", j 2)]]),
    (c .each [lst [mp [("p", int 1)]], .meet .hole (mp [("q", int 2)])], jl [jm [("p", j 1), ("q", j 2)]]),
    (c .each [lst [mp [("p", int 1)]], mp [("q", int 2)]], jl [jm [("q", j 2)]]),
    (c .each [lst [mp [("p", int 1)]], mp [("q", int 2)]], jl [jm [("p", j 1), ("q", j 2)]]),
    (c .each [lst [int 1, int 2], int 7], jl [j 7, j 7]),
    (c .each [lst [], .hole], jl []), (c .each [mp [], .hole], jl []),
    (c .each [str "x", .hole], jl []), (c .each [int 1, .hole], jl []), (c .each [.listKind, .hole], jl []),
    (c .each [.pref 1 (lst [int 1]), .hole], jl [j 1]),
    (c .each [.map [("a", true, int 1), ("b", false, int 2)] none false, .hole], jl [j 1, j 2]),
    (c .each [lst [lst [int 1, int 2], lst [int 3]], c .each [.hole, p .hole (int 1)]],
      jl [jl [j 2, j 3], jl [j 4]]),
    (c .each [lst [int 1, int 2], .meet .hole .string], jl [j 1, j 2]),
    (c .each [lst [int 1, int 2], p .hole (int 1)], jl [j 2, j 3]),
    (c .join [c .each [c .split [str "index-build", str "-"], c .upper [.hole]], str "_"], js "INDEX_BUILD"),
    (c .each [.ride .metadata (lst [int 1]) [], .hole], jl [j 1]),
    (c .each [lst [.ride .metadata (int 1) []], .hole], jl [j 1]),
    (c .each [mp [("b", mp [("x", int 1)]), ("a", mp [("x", int 2)])], .meet .hole (mp [("y", int 3)])],
      jl [jm [("x", j 2), ("y", j 3)], jm [("x", j 1), ("y", j 3)]]),
    (c .each [lst [int 1], lst [.hole, .hole]], jl [jl [j 1, j 1]]),
    (c .each [lst [.or [(1, int 1), (0, int 2)]], .hole], jl [j 1]),
    (c .each [lst [int 1, int 2], .pref 1 .hole], jl [j 1, j 2]),
    (c .each [lst [int 1], c .each [lst [int 2], .hole]], jl [jl [j 2]]),
    (c .each [lst [int 1, int 2]], jl []), (c .each [lst [int 1, int 2], .hole, int 3], jl [])]

set_option maxRecDepth 8192 in
set_option exponentiation.threshold 2200 in
theorem callCases_checkable : ∀ c ∈ callCases, (vetDoc c).1.CheckableA := by decide

theorem call_verdict_exact : ∀ c ∈ callCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (callCases_checkable c hc)) v

/-- Whether a row whose call converts case reads ASCII only, the letters
on which the oracle's host and every engine's case conversion agree. -/
def asciiCase (src : String) : Bool :=
  ((src.splitOn "upper(").length == 1 && (src.splitOn "lower(").length == 1) ||
    src.all (·.toNat < 128)

/-- Every term inside a term, the term itself first. -/
partial def Aontu.Val.subterms (v : Val) : List Val := v :: v.kids.flatMap Aontu.Val.subterms

/-- Patterns the reference puts outside the subset, which every engine
refuses: a named group, a lookahead, a Unicode property and a
backreference. -/
def outsideSubset : List String := ["(?<n>b)", "(?=b)", "\\p{L}", "(a)\\1"]

/-- Whether the oracle's host reads a pattern as every engine does: a
fixed pattern, or one outside the subset. -/
def hostReadsPattern (q : String) : Bool := (fixedPieces q).isSome || outsideSubset.contains q

/-- Whether every pattern a term hands the host's regex engine is one
the oracle's host reads as every engine does: `rep`'s, which must be a
literal for the oracle to see it, and `split`'s at `re(p)`. -/
def hostReads (v : Val) : Bool :=
  v.subterms.all fun
    | .call .rep (_ :: q :: _) => match q.unride with
      | .lit (.str q) => hostReadsPattern q
      | .lit _ | .re _ | .pref _ _ | .string | .number | .integer => true
      | _ => false
    | .call .split [_, sep] => match sep.unride with
      | .re q => hostReadsPattern q
      | _ => true
    | _ => true

/-- Calls handed a pattern, `re(p)`, which the checker cannot read as a
term: `split` at a pattern, rows v0 on in `def-call.tsv`, and `rep`
handed one as its pattern, which it refuses, since its pattern is a
string. The patterns are fixed text, with groups, or outside the
subset, and none splits the empty text (#447). Neither call waits, so
each reads to a term the checker can read, and `vet` is `Vet` on it. -/
def patternSplits : List (Val × String × Data) :=
  [(str "a1b1c", "1", jl [js "a", js "b", js "c"]), (str "a1b1c", "1", jl [js "a1b1c"]),
    (str "1a1", "1", jl [js "", js "a", js ""]), (str "a11b", "1", jl [js "a", js "", js "b"]),
    (str "aaa", "aa", jl [js "", js "a"]), (str "ab", "", jl [js "a", js "b"]),
    (str "a😀b", "", jl [js "a", js "😀", js "b"]), (str "abc", "x", jl [js "abc"]),
    (str "aXbXc", "(X)", jl [js "a", js "b", js "c"]), (str "abc", "(?<n>b)", jl [js "a", js "c"]),
    (.ride .metadata (str "a1b") [], "1", jl [js "a", js "b"]),
    (.integer, "1", jl [js "1"])]

def patternCases : List (Val × Data) :=
  (patternSplits.map fun (s, p, d) => (.call .split [s, .re p], d)) ++
    [(.call .rep [.lit (.str "a"), .re "a", .lit (.str "b")], .str "b")]

theorem patternSplits_inert : ∀ t ∈ patternSplits, t.1.inertB = true := by decide

theorem patternCases_readable : ∀ c ∈ patternCases, (Decls.readR [] (vetDoc c).1).CheckableA := by
  intro c hc
  rcases List.mem_append.mp hc with h | h
  · obtain ⟨⟨s, p, d⟩, hm, rfl⟩ := List.mem_map.mp h
    refine readR_call_checkableA (.inl ⟨_, _, rfl, rfl⟩) (filled_expandF_call (.inl rfl) fun x hx => ?_)
      fun k => resolveD_expandF_split k fun j x hx => ?_
    · simp only [List.mem_cons, List.mem_nil_iff, or_false] at hx
      rcases hx with rfl | rfl
      · exact patternSplits_inert _ hm
      · rfl
    simp only [List.mem_cons, List.mem_nil_iff, or_false] at hx
    rcases hx with rfl | rfl
    · exact inert_pending (patternSplits_inert _ hm) j
    · exact inert_pending (x := .re p) rfl j
  · rcases List.mem_singleton.mp h with rfl
    refine readR_call_checkableA (.inl ⟨_, _, rfl, rfl⟩) (filled_expandF_call (.inr rfl) fun x hx => ?_)
      fun k => resolveD_expandF_rep k fun j x hx => ?_
    · simp only [List.mem_cons, List.mem_nil_iff, or_false] at hx
      rcases hx with rfl | rfl | rfl <;> rfl
    simp only [List.mem_cons, List.mem_nil_iff, or_false] at hx
    rcases hx with rfl | rfl | rfl
    · exact inert_pending (x := .lit (.str "a")) rfl j
    · exact inert_pending (x := .re "a") rfl j
    · exact inert_pending (x := .lit (.str "b")) rfl j

theorem pattern_verdict_exact : ∀ c ∈ patternCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil)) (patternCases_readable c hc) v

/-- A `filter` whose condition holds the hole, its condition read for
each member it tries: over a list and a map, a call on the member, a
meet with it and a disjunction beside it, the hole alone, and a member
the call does not take. Each source is data, so it generates, and each
`filter` reads to the members it admits, which the checker can read
whatever host converts the case. -/
def filterSources : List (Data × Val × Data) :=
  let s (t : String) : Data := .str t
  let n (i : ℤ) (h : IntegerLeaf i := by decide) : Data := .integer i h
  let twice : Val := .call .mul [.hole, .lit (.num (.integer ⟨2, by decide⟩))]
  [(.list [s "A", s "b"], up, .list [s "A"]), (.list [s "A", s "b"], up, .list []),
    (.list [s "A", s "b"], .meet .hole up, .list [s "A"]),
    (.map [("a", s "A"), ("b", s "b")], up, .map [("a", s "A")]),
    (.list [s "a", s "B"], .call .lower [.hole], .list [s "a"]),
    (.list [s "A", s "b"], .or [(0, up), (0, .lit (.str "b"))], .list [s "A", s "b"]),
    (.list [n 1, n 2], .hole, .list [n 1, n 2]),
    (.list [.map [("n", s "A")], .map [("n", s "b")]], .map [("n", false, up)] none false, .list []),
    (.list [n 0, n 1, n 2], twice, .list [n 0]), (.map [("a", n 0), ("b", n 1)], twice, .map [("a", n 0)])]

def filterCases : List (Val × Data) := filterSources.map fun (j, t, d) => (.filter j.term t, d)

theorem filterSources_generate : ∀ x ∈ filterSources,
    (genD [] (resolveD [] none (stepped (some []) (.seg (.key "v"))) x.1.term)).isSome := by
  decide

theorem filterSources_wf : ∀ x ∈ filterSources, x.1.wf = true := by decide

theorem dataArg_term (ds : Decls) (j : Data) : ds.dataArg j.term = j.term := by
  cases j <;> rfl

theorem filterCases_readable : ∀ c ∈ filterCases, (Decls.readR [] (vetDoc c).1).CheckableA := by
  intro c hc
  obtain ⟨⟨j, t, d⟩, hm, rfl⟩ := List.mem_map.mp hc
  have hj := filterSources_generate _ hm
  have hw := Data.term_filled _ (filterSources_wf _ hm)
  have hn := Val.checkableA_unride (normaliseD_checkableA (ds := []) (fun _ h => nomatch h)
    (resolveD_checkableA (ds := []) (fun _ h => nomatch h) (Data.term_checkableA j) (b := none)
      (here := stepped (some []) (.seg (.key "v"))) (fun _ h => nomatch h)))
  refine readR_call_checkableA (.inr ⟨_, _, rfl⟩)
    (fun k => by cases k <;> simp only [expandF, dataArg_term, Val.filled, expandF_term, hw]) fun k => ?_
  cases k with
  | zero => exact resolveD_filter_checkableA hj hn
  | succ k =>
    simp only [expandF, dataArg_term, expandF_term]
    exact resolveD_filter_checkableA hj hn

/-- A `filter` in an `each` template binds its own hole, and its source
reads the template's member. The condition is arithmetic, so the reading
is decided whole. -/
def filterEachCases : List (Val × Data) :=
  let int (i : ℤ) (h : IntegerLeaf i := by decide) : Val := .lit (.num (.integer ⟨i, h⟩))
  let j (i : ℤ) (h : IntegerLeaf i := by decide) : Data := .integer i h
  [(.call .each [lst [lst [int 0, int 1], lst [int 2]], .filter .hole (.call .mul [.hole, int 2])],
      .list [.list [j 0], .list []])]

set_option maxRecDepth 8192 in
theorem filterEachCases_readable : ∀ c ∈ filterEachCases, (Decls.readR [] (vetDoc c).1).CheckableA := by
  decide

theorem filter_verdict_exact : ∀ c ∈ filterCases ++ filterEachCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v := by
  intro c hc _ v
  have hr : (Decls.readR [] (vetDoc c).1).CheckableA := by
    rcases List.mem_append.mp hc with h | h
    · exact filterCases_readable c h
    · exact filterEachCases_readable c h
  exact vet_iff (fun _ h => absurd h (List.not_mem_nil)) hr v

/-- A call reads none of a bag's optional members whose value generates
an empty map or list (decision 19 of the design note's §7), so `sum`
adds the others and `each` and `join` skip it. An optional member whose
value generates more stays. -/
def optionalCases : List (Val × Data) :=
  let mp (fs : List (String × Bool × Val)) : Val := .map fs none false
  [(c .sum [mp [("a", true, mp []), ("b", false, int 2)]], j 2),
    (c .sum [mp [("a", true, lst []), ("b", false, int 2)]], j 2),
    (c .sum [mp [("a", true, .or [(1, lst []), (0, lst [int 1])]), ("b", false, int 2)]], j 2),
    (c .each [mp [("a", true, mp []), ("b", false, int 1)], .hole], .list [j 1]),
    (c .each [mp [("a", true, mp [("b", true, .integer)]), ("c", false, int 1)], .hole], .list [j 1]),
    (c .each [mp [("a", true, mp [("b", false, int 1)]), ("c", false, int 2)], .hole],
      .list [.map [("b", j 1)], j 2]),
    (c .each [mp [("a", true, .or [(1, lst [int 1]), (0, lst [])]), ("b", false, int 2)], .hole],
      .list [.list [j 1], j 2]),
    (c .join [mp [("a", true, lst []), ("b", false, str "x")], str "-"], .str "x")]

theorem optionalCases_checkable : ∀ c ∈ optionalCases, (vetDoc c).1.CheckableA := by decide

theorem optional_verdict_exact : ∀ c ∈ optionalCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (optionalCases_checkable c hc)) v

/-- A replacement is read against its pattern's groups before the text
is scanned (decision 20 of the design note's §7), so one that names a
group the pattern lacks, a `$0`, a lone `$` or a `$` before a letter is
an error over a text with no match too, the empty text among them, and
one that names only what the pattern has leaves such a text as it is. -/
def repSubCases : List (Val × Data) :=
  let rep (t p r : String) : Val := .call .rep [str t, str p, str r]
  [(rep "abc" "x" "$9", .str "abc"), (rep "abc" "x" "$", .str "abc"),
    (rep "abc" "x" "x$", .str "abc"), (rep "abc" "x" "$x", .str "abc"),
    (rep "abc" "x" "$0", .str "abc"), (rep "abc" "x" "$1", .str "abc"),
    (rep "abc" "(x)" "$2", .str "abc"), (rep "" "a" "$1", .str ""),
    (rep "abc" "(x)" "$1", .str "abc"), (rep "abc" "(x)(y)" "$2$1", .str "abc"),
    (rep "abc" "x" "$$$&", .str "abc"), (rep "" "(a)" "[$1]", .str "")]

theorem repSubCases_checkable : ∀ c ∈ repSubCases, (vetDoc c).1.CheckableA := by decide

theorem repSub_verdict_exact : ∀ c ∈ repSubCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (repSubCases_checkable c hc)) v

/-- `encode` writes a string's UTF-8 bytes in the encoding its second
argument names, and `decode` reads them back: base64 with its padding,
base64url with none, and hex in lowercase, read in either case. A name
that is no encoding is an error of the schema, an argument that is no
string and a count other than two are, and so is text the encoding does
not write: base64 without its padding, with too much or with it out of
place, a character of the other alphabet, a space or a line break, a
last character that holds bits beyond its bytes, half a byte of hex,
and text whose bytes are no string. -/
def encodeCases : List (Val × Data) :=
  let enc (s n : String) : Val := .call .encode [str s, str n]
  let dec (t n : String) : Val := .call .decode [str t, str n]
  [(enc "hello" "base64", js "aGVsbG8="), (enc "hello" "base64", js "aGVsbG8"),
    (enc "hey" "base64", js "aGV5"), (enc "h" "base64", js "aA=="), (enc "" "base64", js ""),
    (enc "~~~" "base64", js "fn5+"), (enc "???" "base64", js "Pz8/"),
    (enc "hello" "base64url", js "aGVsbG8"), (enc "h" "base64url", js "aA"),
    (enc "~~~" "base64url", js "fn5-"), (enc "???" "base64url", js "Pz8_"),
    (enc "" "base64url", js ""), (enc "k" "hex", js "6b"), (enc "k" "hex", js "6B"),
    (enc "hello" "hex", js "68656c6c6f"), (enc "" "hex", js ""),
    (enc "é" "base64", js "w6k="), (enc "û" "hex", js "c3bb"), (enc "日" "hex", js "e697a5"),
    (enc "😀" "base64url", js "8J-YgA"),
    (enc "a" "base32", js "a"), (enc "a" "Base64", js "YQ=="), (enc "a" "", js "a"),
    (c .encode [int 1, str "hex"], js "31"), (c .encode [str "a", int 1], js "a"),
    (c .encode [.string, str "hex"], js "a"), (c .encode [str "a", .string], js "a"),
    (c .encode [str "a"], js "a"), (c .encode [str "a", str "hex", str "x"], js "61"),
    (c .encode [], js "a"),
    (c .encode [.ride .metadata (str "k") [], str "hex"], js "6b"),
    (c .encode [str "k", .ride .metadata (str "hex") []], js "6b"),
    (c .encode [.pref 1 (str "k"), str "hex"], js "6b"),
    (dec "aGVsbG8=" "base64", js "hello"), (dec "aGVsbG8=" "base64", js "hellO"),
    (dec "aGV5" "base64", js "hey"), (dec "aA==" "base64", js "h"), (dec "" "base64", js ""),
    (dec "fn5+" "base64", js "~~~"), (dec "Pz8/" "base64", js "???"),
    (dec "aGVsbG8" "base64url", js "hello"), (dec "aA" "base64url", js "h"),
    (dec "fn5-" "base64url", js "~~~"), (dec "Pz8_" "base64url", js "???"),
    (dec "" "base64url", js ""), (dec "68656c6c6f" "hex", js "hello"), (dec "" "hex", js ""),
    (dec "6B" "hex", js "k"), (dec "C3bB" "hex", js "û"), (dec "00" "hex", js "\x00"),
    (dec "aGVsbG8" "base64", js "hello"), (dec "a" "base64", js "a"), (dec "aA=" "base64", js "h"),
    (dec "aA===" "base64", js "h"), (dec "a===" "base64", js "a"), (dec "====" "base64", js ""),
    (dec "aA==aA==" "base64", js "hh"), (dec "aGV5====" "base64", js "hey"),
    (dec "aGVs!G8=" "base64", js "a"), (dec "aGVs bG8=" "base64", js "hello"),
    (dec "aGVs\nbG8=" "base64", js "hello"), (dec "aGVé" "base64", js "a"),
    (dec "fn5-" "base64", js "~~~"), (dec "fn5+" "base64url", js "~~~"),
    (dec "aGVsbG8=" "base64url", js "hello"), (dec "aGVsb" "base64url", js "a"),
    (dec "aG==" "base64", js "h"), (dec "aGV=" "base64", js "he"), (dec "aB" "base64url", js "h"),
    (dec "6" "hex", js "a"), (dec "6g" "hex", js "a"), (dec "g6" "hex", js "a"),
    (dec "é6" "hex", js "a"), (dec "0x6b" "hex", js "k"),
    (dec "/w==" "base64", js "a"), (dec "_w" "base64url", js "a"), (dec "ff" "hex", js "a"),
    (dec "e6" "hex", js "a"), (dec "c080" "hex", js "a"), (dec "eda080" "hex", js "a"),
    (dec "f4908080" "hex", js "a"), (dec "a" "base32", js "a"),
    (c .decode [int 1, str "hex"], js "a"), (c .decode [str "6b"], js "k"),
    (c .decode [.ride .metadata (str "6b") [], str "hex"], js "k"),
    (c .decode [c .encode [str "日本語 😀 é", str "base64"], str "base64"], js "日本語 😀 é"),
    (c .decode [c .encode [str "日本語 😀 é", str "base64url"], str "base64url"], js "日本語 😀 é"),
    (c .decode [c .encode [str "日本語 😀 é", str "hex"], str "hex"], js "日本語 😀 é"),
    (c .encode [c .decode [str "aGVsbG8=", str "base64"], str "base64"], js "aGVsbG8="),
    (c .encode [c .decode [str "6B", str "hex"], str "hex"], js "6b"),
    (c .upper [c .encode [str "k", str "hex"]], js "6B")]

theorem encodeCases_checkable : ∀ c ∈ encodeCases, (vetDoc c).1.CheckableA := by decide

theorem encode_verdict_exact : ∀ c ∈ encodeCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (encodeCases_checkable c hc)) v

/-- A projector and a direction read as their values, through a rider
or a mark, as both ports read them (#435); a lone preference stays
neither, and so does `null`, which is no absent projector. -/
def projectorCases : List (Val × Data) :=
  let rd (v : Val) : Val := .ride .metadata v []
  [(c .pick [lst [mp [("a", int 1)]], rd (str "a")], .list [j 1]),
    (c .pick [lst [lst [int 9, int 8]], rd (int 1)], .list [j 8]),
    (c .pick [lst [mp [("a", int 1)]], .ride .type (str "a") []], .list [j 1]),
    (c .sort [lst [mp [("n", int 2)], mp [("n", int 1)]], rd (str "n")],
      .list [.map [("n", j 1)], .map [("n", j 2)]]),
    (c .sort [lst [int 1, int 2], rd (str ""), str "desc"], .list [j 2, j 1]),
    (c .sort [lst [int 1, int 2], str "", rd (str "desc")], .list [j 2, j 1]),
    (c .sort [lst [int 1, int 2], str "", .ride .type (str "desc") []], .list [j 2, j 1]),
    (c .sort [lst [int 1, int 2], str "", .pref 1 (str "desc")], .list [j 2, j 1]),
    (c .sort [lst [int 2, int 1], .lit .null], .list [j 1, j 2]),
    (c .sort [lst [int 2, int 1], rd (.lit .null)], .list [j 1, j 2])]

theorem projectorCases_checkable : ∀ c ∈ projectorCases, (vetDoc c).1.CheckableA := by decide

theorem projector_verdict_exact : ∀ c ∈ projectorCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (projectorCases_checkable c hc)) v

/-- A string names a list member's index by its digits after one
optional sign and by nothing else, so a space, a point, an exponent or
a hexadecimal prefix names none, and `""` names no key in `pick`, as
both ports read them (#437). -/
def indexCases : List (Val × Data) :=
  let ab : Val := lst [lst [int 1, int 2]]
  [(c .pick [ab, str "+1"], .list [j 2]), (c .pick [ab, str " 0"], .list [j 1]),
    (c .pick [ab, str "0 "], .list [j 1]), (c .pick [ab, str "1.0"], .list [j 2]),
    (c .pick [ab, str "1e0"], .list [j 2]), (c .pick [ab, str "0x1"], .list [j 2]),
    (c .pick [ab, str ""], .list [j 1]),
    (c .pick [lst [.map [("", false, int 1)] none false], str ""], .list [j 1]),
    (c .sort [lst [lst [int 2], lst [int 1]], str "0"], .list [.list [j 1], .list [j 2]]),
    (c .sort [lst [lst [int 2], lst [int 1]], str " 0"], .list [.list [j 1], .list [j 2]])]

theorem indexCases_checkable : ∀ c ∈ indexCases, (vetDoc c).1.CheckableA := by decide

theorem index_verdict_exact : ∀ c ∈ indexCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (indexCases_checkable c hc)) v

/-- A range in `translate`'s `to` through the surrogate block writes
U+FFFD for each surrogate it names, as both ports write it (#442). -/
def surrogateCases : List (Val × Data) :=
  [(c .translate [str "b", str "a-b", str "\uD7FF-\uE000"], .str "\uFFFD"),
    (c .translate [str "abc", str "a-c", str "\uD7FF-\uE000"], .str "\uD7FF\uFFFD\uFFFD"),
    (c .translate [str "z", str "a-z", str "\uD7FF-\uE000"], .str "\uFFFD")]

theorem surrogateCases_checkable : ∀ c ∈ surrogateCases, (vetDoc c).1.CheckableA := by decide

theorem surrogate_verdict_exact : ∀ c ∈ surrogateCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (surrogateCases_checkable c hc)) v

/-- The generator `pack`: the open map of its template read for each
member of its data under the member's key, a list's strings each its
own key and a map's keys theirs; the hole kept, met and left out; a
map member skipped as a fold skips it; a key a list repeats made once,
its instances met;
a list holding anything but a string, and data that is no bag. No
template holds `key()`, which waits on `key()` at any position. -/
def packCases : List (Val × Data) :=
  [(c .pack [lst [str "a", str "b"], mp [("x", .hole)]], jm [("a", jm [("x", js "a")]), ("b", jm [("x", js "b")])]),
    (c .pack [mp [("p", int 1), ("q", int 2)], .meet .hole .integer], jm [("p", j 1), ("q", j 2)]),
    (c .pack [mp [("p", int 1), ("q", int 2)], .hole], jm [("p", j 1), ("q", j 2)]),
    (c .pack [mp [("p", int 1), ("q", int 2)], mp [("n", .hole)]],
      jm [("p", jm [("n", j 1)]), ("q", jm [("n", j 2)])]),
    (c .pack [lst [], mp [("x", int 1)]], jm []), (c .pack [mp [], mp [("x", int 1)]], jm []),
    (c .pack [lst [int 1], mp [("x", int 1)]], jm []), (c .pack [str "a", mp [("x", int 1)]], jm []),
    (c .pack [lst [str "a", str "a"], mp [("x", .hole)]], jm [("a", jm [("x", js "a")])]),
    (c .pack [lst [str "b", str "a"], int 1], jm [("a", j 1), ("b", j 1)]),
    (c .pack [mp [("p", int 1), ("q", .ride .hide (int 2) [])], .hole], jm [("p", j 1)]),
    (c .pack [.map [("p", false, int 1), ("q", true, .integer)] none false, .hole], jm [("p", j 1)]),
    (c .pack [.map [("p", false, int 1), ("q", true, mp [])] none false, .hole], jm [("p", j 1)]),
    (c .pack [lst [str "a"], c .upper [.hole]], jm [("a", js "A")]),
    (c .pack [lst [str "a"], mp [("x", int 1)]], jm [("a", jm [("x", j 1)]), ("b", j 2)]),
    (c .pack [mp [("p", lst [int 1, int 2])], c .each [.hole, .meet .hole .integer]],
      jm [("p", .list [j 1, j 2])]),
    (c .pack [lst [str "a", str "b"], .pref 1 (int 1)], jm [("a", j 1), ("b", j 1)]),
    (c .pack [lst [.pref 1 (str "a")], int 1], jm [("a", j 1)]),
    (c .pack [lst [.ride .metadata (str "a") []], int 1], jm [("a", j 1)])]

theorem packCases_checkable : ∀ c ∈ packCases, (vetDoc c).1.CheckableA := by decide

theorem pack_verdict_exact : ∀ c ∈ packCases, ∀ (m : Mode) (v : Verdict),
    vet m [] (vetDoc c).1 (vetDoc c).2 = v ↔ Vet m [] (vetDoc c).1 (vetDoc c).2 v :=
  fun c hc _ v => vet_iff (fun _ h => absurd h (List.not_mem_nil))
    (readR_checkableA (fun _ h => absurd h (List.not_mem_nil)) (packCases_checkable c hc)) v
