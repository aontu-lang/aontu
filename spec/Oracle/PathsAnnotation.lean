import Oracle.Base

/-! The oracle's cases: PathsAnnotation, split out of `Oracle.lean` so that each area builds on its own. -/

open Aontu
open Case

/-- Documents with the output annotation `gen`, each run in the three
modes. What an annotation alone admits, for each type's options and for
a record no type takes; a record held to its value's type where that
type is known, a literal, a kind alone, a map, a list and an address,
and left waiting where a bound or a kind beside one leaves it open; two
records that unify, on one value, across a reference and inside another
rider, and two that disagree, at the top of a record and inside it; an
arm of another type dropped, and an arm whose own record disagrees; a
default, whose record rides its parent type only where the annotation
stands outside it, and a lone default whose own value the record
refuses; the argument, which is one map of concrete data or one string,
read through a rider, a reference and a call; and the record riding a
spread's template, a name, absence, and a map whose keys the data
writes as the document does. Then a written `nil` as the argument,
which `gen` hands on; an annotation that conflicts, or not, in a call's
argument, `gen`'s own among them; and a lone default whose own value's
records disagree, or whose type doesn't take its record, in each arm it
prefers or in one, alone, met, as an arm, inside one, and in a
spread's template. -/
def annotationCases : List (Decls × Val × Data) :=
  let g (fs : List (String × Val)) : Val := c .gen [m fs]
  let gs (t : String) : Val := c .gen [str t]
  let sig (n : Val) : Val := g [("significant", n)]
  let pl (n : Val) : Val := g [("places", n)]
  let as (t : String) : Val := g [("as", str t)]
  let cs : Val := g [("case", str "upper")]
  let omt : Val := g [("empty", str "omit")]
  let ks (t : String) : Val := g [("keys", str t)]
  let v (t : Val) : Val := m [("v", t)]
  let dv (d : Data) : Data := dm [("v", d)]
  let E : Data := dm []
  let big (n : ℤ) : Val := .lit (.num (.biginteger ⟨n⟩))
  let dflt (x y : Val) : Val := .or [(1, x), (0, y)]
  let arms (x y : Val) : Val := .or [(0, x), (0, y)]
  [-- What an annotation alone admits.
    ([], v (sig (int 2)), E), ([], v (sig (int 2)), dv (j 7)), ([], v (sig (int 2)), dv (js "s")),
    ([], v (sig (int 2)), dv (dm [])),
    ([], v (as "string"), dv (.bool true)), ([], v (as "string"), dv (j 2)),
    ([], v (as "string"), dv (js "x")), ([], v (as "string"), dv .null),
    ([], v omt, dv .null), ([], v omt, dv (jl [])), ([], v omt, dv (js "")), ([], v omt, dv (j 0)),
    ([], v cs, dv (js "s")), ([], v cs, dv (j 1)),
    ([], m [("o", ks "snake")], dm [("o", dm [("aB", j 1)])]), ([], m [("o", ks "snake")], dm [("o", jl [])]),
    ([], v (gs "key"), dv (j 3)), ([], v (gs "key"), E),
    ([], v (g [("custom", str "none")]), dv (jl [j 1])), ([], v (g [("custom", str "none")]), dv (j 5)),
    ([], v (g []), dv (j 0)),
    ([], v (g [("empty", str "omit"), ("case", str "upper")]), dv (js "")),
    ([], v (g [("empty", str "omit"), ("case", str "upper")]), dv .null),
    -- A record no type takes.
    ([], v (g [("digits", int 2)]), E), ([], v (g [("digits", int 2)]), dv (j 1)),
    ([], v (sig (int 0)), E), ([], v (sig (int 0)), dv (j 7)),
    ([], v (pl (int 4097)), dv (j 7)), ([], v (pl (int 4096)), dv (j 7)), ([], v (pl (int 0)), dv (j 7)),
    ([], v (pl (int (-1))), dv (j 7)), ([], v (sig (str "all")), dv (j 7)), ([], v (sig (big 2)), dv (j 7)),
    ([], v (as "boolean"), dv (j 7)), ([], m [("o", ks "train")], dm [("o", dm [])]), ([], v (gs ""), E),
    -- A record is held to its value's type once the type is known.
    ([], v (.meet .integer (sig (int 2))), dv (j 7)), ([], v (.meet .integer (sig (int 2))), dv (js "s")),
    ([], v (.meet .string (sig (int 2))), dv (js "s")), ([], v (.meet (str "ada") (sig (int 2))), E),
    ([], v (.meet .integer cs), E), ([], v (.meet .mapKind (sig (int 2))), E),
    ([], v (.meet (m []) (sig (int 2))), E), ([], v (.meet (tmpl .integer) (sig (int 2))), E),
    ([], v (.meet (.list [] (some .integer) false) (sig (int 2))), E), ([], v (.meet .pathKind cs), E),
    ([], v (.meet .boolean (pl (int 2))), E), ([], v (.meet (.lit .null) cs), E),
    ([], mo [("v", true, .meet .string (sig (int 2)))], E),
    ([], v (.meet (m [("a", int 1)]) (sig (int 2))), E), ([], v (.meet (lst [int 1]) (ks "snake")), E),
    ([], m [("v", .meet (ad 0 ["a"]) cs), ("a", int 1)], E),
    -- A bound, and a kind beside one, leave the type open.
    ([], v (.meet (.min (nb 1)) cs), E), ([], v (.meet (.min (nb 1)) cs), dv (j 5)),
    ([], v (.meet (.min (nb 1)) (sig (int 2))), dv (j 5)),
    ([], v (.meet (.mulof (.integer (Integer.of 2))) cs), E),
    ([], v (.meet (.mulof (.integer (Integer.of 2))) cs), dv (j 4)),
    ([], v (.meet (.len (int 2)) (sig (int 2))), E), ([], v (.meet (.neq [nb 1]) cs), E),
    ([], v (.meet (.meet .integer (.min (nb 1))) cs), E),
    ([], v (.meet (.meet .integer (.min (nb 1))) cs), dv (j 5)),
    ([], v (.meet .any cs), dv (j 1)), ([], v (.meet .any cs), E),
    ([], v (.meet (.meet .integer (.max (nb 9))) (sig (int 1))), dv (j 9)),
    ([], v (.meet (.meet .integer (.max (nb 9))) (sig (int 1))), dv (j 10)),
    -- Two annotations whose types are apart wait for a value.
    ([], v (.meet (sig (int 2)) cs), E), ([], v (.meet (sig (int 2)) cs), dv (j 1)),
    ([], v (.meet (sig (int 2)) cs), dv (js "a")), ([], v (.meet (.meet (sig (int 2)) cs) (int 1)), E),
    -- Two records unify as maps.
    ([], v (.meet (.meet (int 7) (pl (int 2))) (as "string")), E),
    ([], v (.meet (.meet (int 7) (sig (int 2))) (sig (int 2))), E),
    ([], v (.meet (as "string") (as "string")), dv (.bool true)),
    ([], v (.meet (.meet .integer (sig (int 2))) (.meet .integer (sig (int 3)))), dv (j 7)),
    ([], v (.meet (.meet .integer (sig (int 2))) (.meet .integer (sig (int 3)))), E),
    ([], v (.meet (sig (int 2)) (sig (int 3))), dv (j 7)),
    ([], mo [("v", true, .meet (sig (int 2)) (sig (int 3)))], E),
    ([], v (.meet (.meet (int 7) (sig (str "all"))) (sig (int 2))), E),
    ([], v (.meet (.meet (int 7) (as "string")) (as "number")), E),
    ([], v (.meet (g [("a", m [("b", int 1)])]) (g [("a", m [("b", int 2)])])), E),
    ([], v (.meet (g [("a", m [("b", int 1)])]) (g [("a", m [("c", int 2)])])), dv (j 1)),
    ([], v (.meet (g [("a", lst [int 1, int 2])]) (g [("a", lst [int 1, int 2])])), dv (j 1)),
    ([], v (.meet (g [("a", lst [int 1, int 2])]) (g [("a", lst [int 1, int 3])])), E),
    ([], v (.meet (g [("a", lst [int 1])]) (g [("a", lst [int 1, int 2])])), E),
    ([], v (.meet (g [("a", lst [m [("x", int 1)]])]) (g [("a", lst [m [("y", int 2)]])])), dv (j 1)),
    ([], v (.meet (g [("a", int 1)]) (g [("a", big 1)])), E),
    ([], v (.meet (g [("a", m [("b", int 1)])]) (g [("a", int 1)])), E),
    ([], v (.meet (.ride .metadata (.meet (int 7) (pl (int 1))) [("t", .str "x")]) (pl (int 2))), E),
    ([], v (.meet (.ride .metadata (.meet (int 7) (pl (int 1))) [("t", .str "x")]) (pl (int 1))), dv (j 7)),
    ([], v (.meet (hide (.meet (int 7) (pl (int 1)))) (pl (int 2))), E),
    ([], m [("x", .meet (int 7) (sig (int 2))), ("y", .meet (p ["x"]) (sig (int 3)))], E),
    ([], m [("x", .meet (int 7) (sig (int 2))), ("y", .meet (p ["x"]) (sig (int 2)))], E),
    ([], m [("x", .meet (int 7) (sig (int 2))), ("y", .meet (p ["x"]) .string)], E),
    -- An arm of another type drops, and so does an arm whose record disagrees.
    ([], v (.meet (arms (int 7) (str "a")) (sig (int 1))), dv (js "a")),
    ([], v (.meet (arms (int 7) (str "a")) (sig (int 1))), dv (j 7)),
    ([], v (.meet (arms .integer .string) (sig (int 1))), dv (js "a")),
    ([], v (.meet (arms .integer .string) (sig (int 1))), dv (j 7)),
    ([], v (.meet (arms .integer .string) (sig (int 1))), E),
    ([], v (.meet (arms (str "a") (str "b")) (sig (int 2))), E),
    ([], v (.meet (arms .boolean .number) (as "string")), dv (j 7)),
    ([], v (.meet (arms .boolean .number) (as "string")), dv (.bool true)),
    ([], v (.meet (arms (.meet (.lit (.bool true)) (as "number")) (int 7)) (as "string")), dv (.bool true)),
    ([], v (.meet (arms (.meet (.lit (.bool true)) (as "number")) (int 7)) (as "string")), dv (j 7)),
    ([], v (.meet (arms (.meet (.lit (.bool true)) (as "number")) (int 7)) (as "string")), E),
    ([], v (.meet (arms (.meet .boolean (as "number")) .number) (as "string")), dv (.bool true)),
    ([], v (.meet (arms (.meet .boolean (as "number")) .number) (as "string")), dv (j 2)),
    ([], v (.meet (.meet (dflt (int 7) .integer) (sig (int 2))) (.meet (dflt (int 7) .integer) (sig (int 1)))), E),
    ([], v (arms (.meet (int 7) (sig (int 5))) (.meet (int 7) (sig (int 6)))), E),
    ([], v (arms (.meet (int 7) (pl (int 1))) (.meet (int 7) (pl (int 1)))), dv (j 7)),
    ([], v (arms (int 1) (.meet (int 2) (c .gen [int 7]))), dv (j 1)),
    -- A default: the record rides its parent type from outside it only.
    ([], v (.meet (.pref 1 (int 7)) (sig (int 2))), dv (j 9)),
    ([], v (.meet (.pref 1 (int 7)) (sig (int 2))), dv (js "s")),
    ([], v (.pref 1 (.meet (int 7) (sig (int 2)))), dv (j 9)),
    ([], v (.pref 1 (.meet (int 7) (sig (int 2)))), dv (js "s")),
    ([], v (.meet (.pref 1 (.meet (int 7) (sig (int 2)))) (.meet (int 9) (sig (int 3)))), E),
    ([], v (.pref 1 (.meet (int 1) (as "string"))), dv (.bool true)),
    ([], v (.meet (.pref 1 (.meet (int 7) (sig (int 3)))) (sig (int 2))), E),
    ([], v (.meet (.pref 1 (.meet (int 7) (sig (int 3)))) (sig (int 2))), dv (j 9)),
    ([], v (.meet (.pref 1 (str "a")) (sig (int 2))), E),
    ([], v (.meet (.pref 1 (str "a")) (sig (int 2))), dv (js "b")),
    ([], v (.meet (dflt (.meet (int 7) (sig (int 3))) .integer) (sig (int 2))), E),
    ([], v (.meet (dflt (.meet (int 7) (sig (int 3))) .integer) (sig (int 2))), dv (j 9)),
    ([], v (.meet (dflt (.meet (int 7) (sig (int 3))) (int 8)) (sig (int 2))), E),
    ([], v (.meet (dflt (int 7) (.meet (int 8) (sig (int 3)))) (sig (int 2))), E),
    ([], v (.meet (dflt (str "a") (int 7)) (sig (int 2))), E),
    ([], v (.meet (dflt (str "a") (int 7)) (sig (int 2))), dv (j 7)),
    ([], v (.meet (dflt (str "a") .integer) (sig (int 2))), E),
    ([], v (.or [(1, .meet (int 7) (g [])), (1, int 7)]), E),
    ([], v (.or [(1, .meet (int 7) (g [("places", int 1), ("as", str "string")])),
      (1, .meet (int 7) (g [("as", str "string"), ("places", int 1)]))]), E),
    ([], v (.or [(1, .meet (int 7) (sig (int 2))), (1, .meet (int 7) (sig (int 2)))]), E),
    ([], v (.or [(1, .meet (int 7) (sig (int 2))), (2, .meet (int 7) (sig (int 1)))]), E),
    ([], v (.meet (.meet (.pref 1 (int 7)) (sig (int 2))) (.meet (.pref 1 (int 7)) (sig (int 1)))), E),
    ([], v (.meet (.meet (.pref 1 (int 7)) (sig (int 2))) (.meet (.pref 1 (int 7)) (sig (int 2)))), E),
    ([], v (.meet (.meet (dflt (int 7) .integer) (sig (int 2))) (.meet (dflt (int 7) .integer) (sig (int 2)))), E),
    -- The argument is one map of concrete data, or one string.
    ([], v (.meet (int 7) (sig .integer)), dv (j 7)),
    ([], m [("v", .meet (int 7) (sig (p ["n"]))), ("n", .integer)], dm [("n", j 2)]),
    ([], m [("v", .meet .integer (c .gen [p ["r"]])), ("r", m [("significant", .integer)])],
      dm [("v", j 7), ("r", dm [("significant", j 2)])]),
    ([], v (.meet (int 7) (sig (dflt (int 2) .integer))), E),
    ([], v (.meet (int 7) (sig (.pref 1 (int 2)))), E),
    ([], v (.meet (int 7) (c .gen [.pref 1 (m [("significant", int 2)])])), E),
    ([], v (.meet (int 7) (c .gen [int 2])), dv (j 7)), ([], v (.meet (ad 1 ["b"]) (c .gen [.string])), E),
    ([], v (.meet (int 7) (c .gen [lst [int 2]])), E), ([], v (.meet (int 7) (c .gen [.lit .null])), E),
    ([], v (.meet (int 7) (c .gen [mo [("significant", true, int 2)]])), E),
    ([], v (.meet (int 7) (c .gen [tmpl .integer])), E),
    ([], v (.meet (int 7) (c .gen [])), E), ([], v (.meet (int 7) (c .gen [m [], m []])), E),
    ([], v (.meet (int 7) (c .gen [p ["nosuch"]])), E), ([], mo [("v", true, c .gen [int 7])], E),
    ([], v (.meet (int 7) (c .gen [hide (m [("significant", int 2)])])), E),
    ([], v (.meet (int 7) (c .gen [.ride .metadata (m [("significant", int 2)]) [("t", j 1)]])), E),
    ([], v (.meet (int 7) (c .gen [cl [("significant", int 2)]])), E),
    ([], v (g [("a", ad 0 ["x"])]), E),
    ([], m [("s", hide (m [("money", m [("significant", int 2)])])), ("p", .meet (int 7) (c .gen [p ["s", "money"]]))], E),
    ([], m [("v", .meet (int 7) (sig (p ["n"]))), ("n", int 2)], E),
    ([], v (.meet (int 7) (sig (c .add [int 1, int 1]))), E),
    ([], m [("s", hide (str "key")), ("x", .meet (ad 0 ["a", "b"]) (c .gen [p ["s"]]))], E),
    ([], m [("x", .meet (ad 0 ["a", "b"]) (c .gen [c .plus [str "k", str "ey"]]))], E),
    ([], v (.meet (.meet (ad 1 ["b"]) (gs "key")) (g [("form", str "key")])), E),
    ([], v (.meet (.meet (ad 1 ["b"]) (gs "key")) (gs "pointer")), E),
    ([], v (.meet (int 7) (gs "string")), E), ([], v (.meet (int 7) (gs "significant")), E),
    -- The record rides: a spread's template, a name, absence, and what vet reads.
    ([], m [("m", tmpl (.meet .number (sig (int 2))))], dm [("m", dm [("a", j 7), ("b", js "s")])]),
    ([], m [("m", tmpl (.meet .number (sig (int 2))))], dm [("m", dm [("a", j 7)])]),
    ([], m [("m", tmpl (sig (int 1)))], dm [("m", dm [("a", j 7), ("b", js "s")])]),
    ([], m [("m", tmpl (sig (int 1)))], dm [("m", dm [("a", j 7)])]),
    ([], m [("m", .meet (tmpl (sig (int 1))) (m [("a", int 7), ("b", str "s")]))], E),
    ([], m [("m", .meet (m [("a", int 7), ("b", str "s")]) (tmpl (g [])))], E),
    ([], m [("l", .list [] (some cs) false)], dm [("l", jl [js "a", j 1])]),
    ([], m [("l", .list [] (some cs) false)], dm [("l", jl [js "a"])]),
    ([], m [("x", .meet .number (sig (int 3))), ("y", p ["x"])], dm [("x", j 7), ("y", j 7)]),
    ([], m [("x", .meet .number (sig (int 3))), ("y", p ["x"])], dm [("x", j 7), ("y", j 8)]),
    ([("m", .meet .number (sig (int 2)))], m [("v", .alias "m"), ("w", .meet (.alias "m") .string)], dv (j 1)),
    ([("m", .meet .number (sig (int 2)))], m [("v", .alias "m"), ("w", .alias "m")], dm [("v", j 1), ("w", j 2)]),
    ([], m [("a", .meet (c .maybe [p ["nope"]]) (sig (int 2))), ("b", int 1)], E),
    ([], m [("o", .meet (cl [("orderId", .integer)]) (ks "snake"))], dm [("o", dm [("order_id", j 7)])]),
    ([], m [("o", .meet (cl [("orderId", .integer)]) (ks "snake"))], dm [("o", dm [("orderId", j 7)])]),
    ([], m [("o", .meet .mapKind (ks "snake"))], dm [("o", dm [("aB", j 1)])]),
    ([], m [("o", .meet (m [("orderId", .integer)]) (ks "snake"))], dm [("o", dm [("orderId", j 7)])]),
    ([], m [("u", m [("a", .meet .anyString omt), ("b", .integer)])], dm [("u", dm [("a", js ""), ("b", j 1)])]),
    ([], v (.meet .string omt), E), ([], v (.meet .anyString omt), dv (js "")),
    ([], v (arms (mo [("a", false, .meet .anyString omt), ("b", true, .integer)]) (m [("a", .integer)])),
      dv (dm [("a", js "")])),
    ([], v (.meet .number (as "string")), dv (j 7)), ([], v (.meet .number (as "string")), dv (js "7")),
    ([], m [("a", .meet (str "s") (g [])), ("b", .meet (.lit (.bool true)) (g [])), ("c", .meet (.lit .null) (g [])),
      ("d", .meet (m [("x", int 1)]) (g [])), ("e", .meet (lst [int 1]) (g []))], E),
    ([], v (.meet (int 7) (g [("significant", str "all"), ("places", str "all"), ("as", str "number")])), E),
    ([], v (.meet (m [("aB", int 1), ("c", m [])]) (g [("keys", str "verbatim"), ("empty", str "keep")])), E),
    ([], v (.meet (sig (int 2)) (str "ada")), E),
    ([], m [("s", type (m [("money", sig (int 2))])), ("p", .meet (p ["s", "money"]) (str "ada"))], E),
    -- A written `nil` as the argument, which `gen` hands on as it is.
    ([], mo [("v", true, c .gen [Val.void])], E), ([], v (c .gen [Val.void]), E),
    ([], mo [("v", true, c .gen [Val.void])], dv (j 1)),
    ([], mo [("v", true, .meet (int 1) (c .gen [Val.void]))], E),
    ([], mo [("v", true, c .gen [.meet (m [("places", int 2)]) Val.void])], E),
    ([], mo [("x", true, Val.void), ("v", true, c .gen [p ["x"]])], E),
    ([], mo [("v", true, c .gen [.ride .metadata Val.void [("a", j 1)]])], E),
    -- An annotation in a call's argument, `gen`'s own among them.
    ([], v (.meet (int 7) (c .gen [.meet (m [("places", int 2)]) (sig (int 2))])), E),
    ([], v (.meet (int 7) (c .gen [.meet (m [("places", int 2)]) omt])), E),
    ([], v (.meet (int 7) (g [("places", .meet (int 2) (sig (int 2)))])), E),
    ([], v (.meet (int 7) (g [("places", .meet (int 2) (ks "camel"))])), E),
    ([], v (c .upper [.meet (str "a") (ks "camel")]), E), ([], v (c .upper [.meet (str "a") cs]), E),
    ([], v (c .add [.meet (int 1) (ks "camel"), int 2]), E),
    ([], v (c .join [lst [.meet (str "a") (ks "camel"), str "b"]]), E),
    -- A lone default whose own value's records disagree, or that its type doesn't take.
    ([], v (.pref 1 (.meet (.meet (int 7) (pl (int 1))) (pl (int 2)))), E),
    ([], v (.pref 1 (.meet (.meet (int 7) (pl (int 1))) (pl (int 2)))), dv (j 7)),
    ([], mo [("v", true, .pref 1 (.meet (.meet (int 7) (pl (int 1))) (pl (int 2))))], E),
    ([], v (.pref 1 (.meet (.meet (int 7) (pl (int 1))) (pl (int 1)))), E),
    ([], v (dflt (.meet (.meet (int 7) (pl (int 1))) (pl (int 2))) (int 8)), E),
    ([], v (.pref 1 (arms (.meet (.meet (int 7) (pl (int 1))) (pl (int 2))) (int 8))), E),
    ([], v (.pref 1 (arms (.meet (.meet (int 7) (pl (int 1))) (pl (int 2)))
      (.meet (.meet (int 8) (pl (int 1))) (pl (int 2))))), E),
    ([], v (.pref 1 (arms (.meet (int 7) (ks "camel")) (int 8))), E),
    ([], v (.pref 1 (arms (.meet (int 7) (ks "camel")) (.meet (int 8) (ks "camel")))), E),
    ([], v (.meet (.pref 1 (arms (.meet (int 7) (ks "camel")) (int 8))) .integer), E),
    ([], v (arms (m [("a", .pref 1 (.meet (.meet (int 7) (pl (int 1))) (pl (int 2))))]) (int 3)), E),
    ([], v (tmpl (.pref 1 (.meet (.meet (int 7) (pl (int 1))) (pl (int 2))))), dv (dm [("x", j 7)]))]

set_option maxRecDepth 16384 in
theorem annotationCases_checkable : ∀ c ∈ annotationCases,
    (∀ d, d ∈ c.1 → d.2.CheckableA) ∧ c.2.1.CheckableA := by decide

theorem annotation_verdict_exact : ∀ c ∈ annotationCases, ∀ (m : Mode) (v : Verdict),
    vetG m c.1 c.2.1 c.2.2 = v ↔ VetG m c.1 c.2.1 c.2.2 v :=
  fun c hc _ v => vetG_iff (annotationCases_checkable c hc).1 (annotationCases_checkable c hc).2 v

/-- The output annotation's rows, a function of their own so that the
late rows' block stays within what the C compiler nests. -/
def pathRowsAnnotation : IO Unit := do
  IO.println "# The output annotation `gen(r)`, in rows an0 on, with the one class `vetG`"
  IO.println "# gives, which `vetG_iff` makes the definition's own. An annotation is `any`"
  IO.println "# carrying its record, and `vet` never reads an option: it reads the value, and"
  IO.println "# that the record is one the value's type takes. Alone it admits the values of"
  IO.println "# the types whose standard options take the record. Beside a value whose type"
  IO.println "# is known, a literal, a kind alone, a map, a list or an address, a record the"
  IO.println "# type doesn't take is the schema's error, and a bound or a kind beside one"
  IO.println "# leaves the type open. Two records unify as maps, and a disagreement is the"
  IO.println "# schema's error, an arm's its arm's alone, and a lone default's own value's"
  IO.println "# the place's. The argument is one map of concrete data, or one string."
  IO.println "# An annotation that conflicts inside any call's argument is the schema's"
  IO.println "# error, and a written `nil` passes through `gen` as it is."
  pathRows "an" annotationCases (verdict := vetG)
