import Oracle.Gen

/-! The oracle's cases of the output option `custom`, apart from `Gen` so
that they build on their own. -/

open Aontu
open Case

/-- A document as the reader reads it: the expression each `gen` record
writes under `custom` held as its quotation (`Val.quote`), the term
written in it read so first. -/
partial def Aontu.Val.readCustom : Val → Val
  | .call .gen [.map fs sp cl] =>
    .call .gen [.map (fs.map fun f => (f.1, f.2.1,
      if f.1 = "custom" then f.2.2.readCustom.quote.term else f.2.2.readCustom)) sp cl]
  | .call f args => .call f (args.map Val.readCustom)
  | .map fs sp cl => .map (fs.map fun f => (f.1, f.2.1, f.2.2.readCustom)) (sp.map Val.readCustom) cl
  | .list xs sp cl => .list (xs.map Val.readCustom) (sp.map Val.readCustom) cl
  | .meet a b => .meet a.readCustom b.readCustom
  | .or arms => .or (arms.map fun a => (a.1, a.2.readCustom))
  | .pref r x => .pref r x.readCustom
  | .ride k v r => .ride k v.readCustom r
  | v => v

/-- Documents a `custom` expression writes: the value itself, a
constant, a map and a list of it, a call on it; after the record's
other options, an address's form, a number's places and digits, a
string's case and a boolean as a number; a whole float given as an
integer; a map and a list given as what their members write, a
member's own `custom` among them; a hole a generator inside the
expression binds; `empty: "omit"` read on what it writes; a `null`
written and a value it hides left out; the record riding a kind, a
spread, a default, an arm and a template; one expression twice; and an
expression that is annotated in turn. -/
def customCases : List (Decls × Val) :=
  let g (fs : List (String × Val)) : Val := c .gen [m fs]
  let cu (e : Val) : Val := g [("custom", e)]
  let pl (a b : Val) : Val := c .plus [a, b]
  let fl (a : ℤ) (d : ℕ) : Val := match Float.nearest a d with | some f => .lit (.num (.float f)) | none => .nil
  let x (t : Val) : Val := m [("x", t)]
  let nul : Val := .lit .null
  [([], x (.meet (str "ada") (cu up))),
    ([], x (.meet (str "ada") (cu .hole))),
    ([], x (.meet nul (cu (str "none")))),
    ([], x (.meet (str "ada") (cu (m [("id", .hole), ("kind", str "ref")])))),
    ([], x (.meet (str "ada") (cu (lst [.hole, up])))),
    ([], m [("p", .meet (ad 0 ["fs", "nodes", "etc"]) (g [("form", str "key"), ("custom", pl (str "urn:node:") .hole)]))]),
    ([], m [("a", m [("r", .meet (ad 1 ["b"]) (g [("form", str "pointer"), ("custom", m [("$ref", pl (str "#") .hole)])])), ("b", m [])])]),
    ([], m [("a", m [("x", .meet (ad 2 ["b"]) (cu (pl (pl (str "<") .hole) (str ">"))))])]),
    ([], m [("price", .meet (int 24) (g [("places", int 2), ("as", str "string"), ("custom", pl (str "EUR ") .hole)]))]),
    ([], x (.meet (fl 314159 100000) (g [("significant", int 2), ("custom", m [("v", .hole)])]))),
    ([], x (.meet (str "a") (g [("case", str "upper"), ("custom", pl (str "x") .hole)]))),
    ([], x (.meet (.lit (.bool true)) (g [("as", str "number"), ("custom", pl .hole (int 1))]))),
    ([], x (.meet (fl 2 1) (cu (pl (str "") .hole)))),
    ([], x (.meet (fl 2 1) (cu (pl .hole (fl 1 2))))),
    ([], m [("tags", .meet (lst [str "a", str "b"]) (cu (c .join [.hole, str ","])))]),
    ([], m [("m", .meet (m [("a", int 1), ("b", int 2)]) (cu (c .each [.hole, .hole])))]),
    ([], m [("m", .meet (m [("a", int 1), ("b", int 2)]) (cu (c .sum [.hole])))]),
    ([], m [("m", .meet (m [("orderId", int 1)]) (g [("keys", str "snake"), ("custom", .hole)]))]),
    ([], m [("m", .meet (m [("a", .meet (fl 126 100) (g [("significant", int 2)])),
      ("b", .meet (str "") (g [("empty", str "omit")]))]) (cu .hole))]),
    ([], m [("l", .meet (lst [.meet (str "a") (cu up), str "b"]) (cu (c .join [.hole, str "-"])))]),
    ([], x (.meet (str "a") (cu (c .each [lst [.hole, .hole], up])))),
    ([], m [("u", m [("nick", .meet (str "") (g [("empty", str "omit"), ("custom", up)])),
      ("n", .meet nul (g [("empty", str "omit"), ("custom", str "none")]))])]),
    ([], m [("u", m [("a", .meet nul (g [("empty", str "omit"), ("custom", .hole)])),
      ("b", .meet (str "") (g [("empty", str "omit"), ("custom", nul)])), ("c", int 1)])]),
    ([], m [("u", m [("a", .meet (str "") (g [("empty", str "omit"), ("custom", int 0)])),
      ("b", .meet (str "") (g [("empty", str "omit"), ("custom", .lit (.bool false))]))])]),
    ([], m [("u", m [("a", .meet (str "x") (cu nul)), ("b", .meet nul (cu .hole)),
      ("c", .meet nul (cu (hide .hole))), ("d", int 1)])]),
    ([], m [("u", lst [.meet (str "x") (cu nul), int 2])]),
    ([], m [("u", m [("m", .meet (m [("a", int 1)]) (cu nul)), ("k", int 1)])]),
    ([], m [("x", .meet (str "ada") (cu (hide .hole))), ("y", int 1)]),
    ([], .meet (m [("x", .meet .string (cu (pl (pl (str "<") .hole) (str ">"))))]) (m [("x", str "a")])),
    ([], .meet (m [("l", .list [] (some (.meet .string (cu (pl (pl (str "<") .hole) (str ">"))))) false)])
      (m [("l", lst [str "a", str "b"])])),
    ([], m [("l", c .each [lst [str "a", str "b"], .meet .hole (cu (pl (pl (str "<") .hole) (str ">")))])]),
    ([], x (.or [(1, .meet nul (cu (str "none"))), (0, .string)])),
    ([], .meet (m [("x", .meet (.or [(0, nul), (0, .string)]) (cu (pl (pl (str "<") .hole) (str ">"))))]) (m [("x", str "a")])),
    ([], x (.meet (.meet (str "a") (cu up)) (cu up))),
    ([], x (.meet (str "a") (cu (.meet up (cu (pl .hole (str "!"))))))),
    ([], m [("x", .meet (str "a") (cu up)), ("y", p ["x"])])]

/-- The `gens` rows of what a `custom` expression writes: each case
printed as it is written, with the JSON `outputW` gives for the
document the reader makes of it (`Val.readCustom`). A document that
writes nothing has no row. -/
def customRows (tag : String) (cases : List (Decls × Val) := customCases) : IO Unit := do
  let mut i := 0
  for c in cases do
    if let some j := outputW c.1 c.2.readCustom then
      let lines ← declLines c.1
      let some ssrc := c.2.cell | throw (IO.userError "a case has no text")
      let body := match c.2 with | .map _ _ _ => (ssrc.drop 1).dropRight 1 | _ => ssrc
      IO.println (tag ++ toString i ++ "\tgens\t" ++ "\\n".intercalate (lines ++ [body]) ++ "\t" ++ j.writtenJson)
    i := i + 1
